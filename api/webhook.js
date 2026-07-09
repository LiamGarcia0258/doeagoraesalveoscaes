/**
 * Webhook da FastDepix.
 *
 * Este endpoint nao cria PIX, nao gera cobranca e nao implementa checkout.
 * Ele apenas recebe notificacoes da transacao criada no checkout hospedado.
 *
 * O payload real observado nao vem envelopado em event/type/event_type/data.
 * A FastDepix envia diretamente o objeto da transacao:
 * { transaction_id, status, amount, net_amount, payer_name, payer_phone, ... }.
 *
 * Por isso este parser usa transaction_id como identificador unico e status
 * como o estado da transacao. Logs completos continuam ativos para auditoria
 * e para confirmar se algum identificador oficial de origem aparece no futuro.
 */

const { findIdentifiers, pickIdentifier } = require("../lib/identifiers");
const { sendUtmifyOrder } = require("../lib/utmify");
const { sendMetaPurchase } = require("../lib/meta-capi");

const FASTDEPIX_STATUS_TO_UTMIFY_STATUS = {
  pending: "waiting_payment",
  approved: "paid",
  paid: "paid",
  refunded: "refunded",
};

function nowUtc() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeStatus(status) {
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

function centsFromAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);

  if (typeof value === "string" && value.trim() !== "") {
    const normalized = Number(value.replace(",", "."));
    if (Number.isFinite(normalized)) return Math.round(normalized * 100);
  }

  return undefined;
}

function extractBody(body) {
  if (!body) return {};
  if (typeof body !== "string") return body;

  try {
    return JSON.parse(body);
  } catch (error) {
    console.warn("BODY recebido como string, mas nao era JSON valido.");
    return {};
  }
}

function rawBodyForLog(body) {
  if (typeof body === "string") return body;

  try {
    return JSON.stringify(body);
  } catch (error) {
    return "[raw body unavailable: serialization failed]";
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const headers = req.headers || {};
  const query = req.query || {};
  const rawBody = rawBodyForLog(req.body);
  const body = extractBody(req.body);
  const transaction = body;

  console.log("=== FASTDEPIX WEBHOOK RECEBIDO ===", new Date().toISOString());
  console.log("HEADERS", JSON.stringify(headers, null, 2));
  console.log("QUERY", JSON.stringify(query, null, 2));
  console.log("BODY", JSON.stringify(body, null, 2));
  console.log("RAW BODY", rawBody);

  const identifiers = findIdentifiers({ query, body });
  if (Object.keys(identifiers).length > 0) {
    console.log("IDENTIFICADORES ENCONTRADOS:", JSON.stringify(identifiers, null, 2));
  } else {
    console.log("Nenhum identificador conhecido encontrado neste payload.");
  }

  const fastDepixStatus = normalizeStatus(transaction.status);
  const utmifyStatus = FASTDEPIX_STATUS_TO_UTMIFY_STATUS[fastDepixStatus];
  const transactionId = pick(transaction.transaction_id, transaction.id);
  const amountCents = pick(
    transaction.amount_cents,
    transaction.amountInCents,
    transaction.priceInCents,
    centsFromAmount(transaction.amount),
    centsFromAmount(transaction.value)
  );

  console.log(
    "TRANSACAO IDENTIFICADA:",
    JSON.stringify(
      {
        transaction_id: transactionId || null,
        status: fastDepixStatus || null,
        utmify_status: utmifyStatus || null,
        amount_cents: amountCents || null,
      },
      null,
      2
    )
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

  const customerRaw = transaction.customer || transaction.buyer || transaction.payer || {};
  const customerName = pick(transaction.payer_name, customerRaw.name, "Doador");
  const customerPhone = pick(transaction.payer_phone, customerRaw.phone, customerRaw.telefone, null);
  const customerEmail = pick(transaction.payer_email, customerRaw.email, "nao-informado@abrigosaofrancisco.org");
  const customerDocument = pick(
    transaction.payer_document,
    transaction.payer_cpf,
    customerRaw.document,
    customerRaw.cpf,
    customerRaw.cnpj,
    null
  );

  if (utmifyStatus && transactionId && amountCents) {
    const utmifyResult = await sendUtmifyOrder({
      orderId: String(transactionId),
      platform: "FastDepix",
      paymentMethod: "pix",
      status: utmifyStatus,
      createdAt: pick(transaction.created_at, transaction.createdAt, nowUtc()),
      approvedDate: utmifyStatus === "paid" ? pick(transaction.approved_at, transaction.paid_at, nowUtc()) : null,
      refundedAt: utmifyStatus === "refunded" ? pick(transaction.refunded_at, nowUtc()) : null,
      customer: {
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        document: customerDocument,
        country: "BR",
      },
      products: [
        {
          id: "doacao-abrigo-sao-francisco",
          name: "Doacao - Abrigo Sao Francisco",
          planId: null,
          planName: null,
          quantity: 1,
          priceInCents: amountCents,
        },
      ],
      trackingParameters: tracking,
      commission: {
        totalPriceInCents: amountCents,
        gatewayFeeInCents: 0,
        userCommissionInCents: amountCents,
      },
    });
    console.log("RESULTADO UTMIFY:", JSON.stringify(utmifyResult));
  } else {
    console.warn(
      "Dados insuficientes para enviar pedido a UTMify (faltando transaction_id, amountCents ou status mapeavel). Apenas logado."
    );
  }

  const fbc = pickIdentifier(identifiers, "fbc");
  const fbp = pickIdentifier(identifiers, "fbp");

  if (utmifyStatus === "paid" && amountCents && (fbc || fbp)) {
    const metaResult = await sendMetaPurchase({
      value: amountCents / 100,
      currency: "BRL",
      eventId: transactionId,
      fbc,
      fbp,
      email: customerEmail,
      phone: customerPhone,
      externalId: transactionId,
    });
    console.log("RESULTADO META CAPI:", JSON.stringify(metaResult));
  } else if (utmifyStatus === "paid") {
    console.warn("Purchase nao enviado a Meta CAPI: nenhum fbc/fbp encontrado no payload para correlacionar com o visitante.");
  }

  res.status(200).json({ ok: true, transaction_id: transactionId || null, status: fastDepixStatus || null });
};
