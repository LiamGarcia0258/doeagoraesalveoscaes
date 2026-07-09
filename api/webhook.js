/**
 * Webhook da FastDepix.
 *
 * Este endpoint NÃO cria PIX, NÃO gera cobrança. Ele apenas RECEBE as
 * notificações que a FastDepix envia sobre o ciclo de vida de uma
 * transação já criada no checkout hospedado dela.
 *
 * A documentação pública da FastDepix não especifica o formato exato do
 * payload do webhook nem confirma se/como ela repassa os parâmetros de
 * rastreamento (UTMs, fbc, fbp, ref) que enviamos na URL do checkout.
 * Por isso esta v1 prioriza LOG COMPLETO + extração best-effort, para
 * permitir descobrir experimentalmente o comportamento real assim que
 * os primeiros webhooks chegarem (ver Vercel > Deployments > Functions
 * > Logs, ou `vercel logs`).
 *
 * Depois de validar o formato real (headers, query, body) nos logs,
 * ajuste os campos abaixo marcados com TODO para bater exatamente com
 * o que a FastDepix envia.
 */

const { findIdentifiers, pickIdentifier } = require("../lib/identifiers");
const { sendUtmifyOrder } = require("../lib/utmify");
const { sendMetaPurchase } = require("../lib/meta-capi");

// TODO: confirmar com a FastDepix os nomes reais de evento. Estes são os
// que a especificação do projeto definiu como esperados.
const EVENT_STATUS_MAP = {
  "transaction.created": "waiting_payment",
  "transaction.approved": "paid",
  "transaction.paid": "paid",
  "transaction.refunded": "refunded",
};

function nowUtc() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function pick(...values) {
  return values.find((v) => v !== undefined && v !== null && v !== "");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const headers = req.headers || {};
  const query = req.query || {};
  const body = req.body || {};

  // --- 1. LOG COMPLETO (auditoria / descoberta) ---------------------
  console.log("=== FASTDEPIX WEBHOOK RECEBIDO ===", new Date().toISOString());
  console.log("HEADERS", JSON.stringify(headers, null, 2));
  console.log("QUERY", JSON.stringify(query, null, 2));
  console.log("BODY", JSON.stringify(body, null, 2));

  // --- 2. Extração best-effort de identificadores conhecidos --------
  const identifiers = findIdentifiers({ query, body });
  if (Object.keys(identifiers).length > 0) {
    console.log("IDENTIFICADORES ENCONTRADOS:", JSON.stringify(identifiers, null, 2));
  } else {
    console.log("Nenhum identificador conhecido encontrado neste payload.");
  }

  // --- 3. Identificar o tipo de evento -------------------------------
  // TODO: ajustar conforme o campo real observado nos logs (pode vir
  // como "event", "type", "event_type", dentro de "data", etc.)
  const eventType = pick(body.event, body.type, body.event_type, query.event);
  const utmifyStatus = EVENT_STATUS_MAP[eventType];

  if (!eventType) {
    console.warn("Payload sem campo de evento reconhecível (event/type/event_type). Apenas logado, nada enviado adiante.");
    res.status(200).json({ ok: true, logged: true, reason: "unknown_event_shape" });
    return;
  }

  // --- 4. Extrair dados da transação (nomes flexíveis) ---------------
  // TODO: ajustar caminhos assim que confirmarmos o schema real.
  const transaction = body.data || body.transaction || body;
  const customerRaw = transaction.customer || transaction.buyer || transaction.payer || {};

  const amountCents = pick(
    transaction.amount_cents,
    transaction.amountInCents,
    transaction.priceInCents,
    typeof transaction.amount === "number" ? Math.round(transaction.amount * 100) : undefined,
    typeof transaction.value === "number" ? Math.round(transaction.value * 100) : undefined
  );

  const orderId = pick(
    transaction.id,
    transaction.transaction_id,
    transaction.orderId,
    pickIdentifier(identifiers, "reference", "external_id", "ref")
  );

  const tracking = {
    src: pickIdentifier(identifiers, "src"),
    sck: pickIdentifier(identifiers, "sck"),
    utm_source: pickIdentifier(identifiers, "utm_source"),
    utm_campaign: pickIdentifier(identifiers, "utm_campaign"),
    utm_medium: pickIdentifier(identifiers, "utm_medium"),
    utm_content: pickIdentifier(identifiers, "utm_content"),
    utm_term: pickIdentifier(identifiers, "utm_term"),
  };

  // --- 5. Enviar para a UTMify (Pendente / Paga / Reembolsada) ------
  if (utmifyStatus && orderId && amountCents) {
    const utmifyResult = await sendUtmifyOrder({
      orderId: String(orderId),
      platform: "FastDepix",
      paymentMethod: "pix",
      status: utmifyStatus,
      createdAt: pick(transaction.created_at, transaction.createdAt, nowUtc()),
      approvedDate: utmifyStatus === "paid" ? pick(transaction.approved_at, transaction.paidAt, nowUtc()) : null,
      refundedAt: utmifyStatus === "refunded" ? pick(transaction.refunded_at, transaction.refundedAt, nowUtc()) : null,
      customer: {
        name: pick(customerRaw.name, "Doador"),
        email: pick(customerRaw.email, "nao-informado@abrigosaofrancisco.org"),
        phone: pick(customerRaw.phone, customerRaw.telefone, null),
        document: pick(customerRaw.document, customerRaw.cpf, customerRaw.cnpj, null),
        country: "BR",
      },
      products: [
        {
          id: "doacao-abrigo-sao-francisco",
          name: "Doação — Abrigo São Francisco",
          planId: null,
          planName: null,
          quantity: 1,
          priceInCents: amountCents,
        },
      ],
      trackingParameters: tracking,
      // TODO: a taxa real cobrada pela FastDepix não está documentada.
      // Ajuste gatewayFeeInCents/userCommissionInCents se ela informar
      // o valor líquido no webhook, ou confirme o percentual com o
      // suporte deles.
      commission: {
        totalPriceInCents: amountCents,
        gatewayFeeInCents: 0,
        userCommissionInCents: amountCents,
      },
    });
    console.log("RESULTADO UTMIFY:", JSON.stringify(utmifyResult));
  } else {
    console.warn(
      "Dados insuficientes para enviar pedido à UTMify (faltando orderId, amountCents ou status mapeável). Apenas logado."
    );
  }

  // --- 6. Enviar Purchase para a Meta Conversion API -----------------
  // Só enviamos se houver dado real para correlacionar com o
  // visitante (fbc/fbp vindos do cookie do Pixel). Não inventamos
  // correlação quando esses dados não chegam no webhook.
  const fbc = pickIdentifier(identifiers, "fbc");
  const fbp = pickIdentifier(identifiers, "fbp");

  if (utmifyStatus === "paid" && amountCents && (fbc || fbp)) {
    const metaResult = await sendMetaPurchase({
      value: amountCents / 100,
      currency: "BRL",
      eventId: orderId,
      fbc,
      fbp,
      email: customerRaw.email,
      phone: pick(customerRaw.phone, customerRaw.telefone),
      externalId: orderId,
    });
    console.log("RESULTADO META CAPI:", JSON.stringify(metaResult));
  } else if (utmifyStatus === "paid") {
    console.warn("Purchase NÃO enviado à Meta CAPI: nenhum fbc/fbp encontrado no payload para correlacionar com o visitante.");
  }

  res.status(200).json({ ok: true });
};
