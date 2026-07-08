const { getTransaction, normalizeTransaction } = require("../utils/fastdepix");
const { sendPurchaseToMeta } = require("./meta");
const { sendUtmifyPurchase } = require("../utils/utmify");

const DOCUMENTED_EVENTS = new Set([
  "transaction.created",
  "transaction.approved",
  "transaction.paid",
  "transaction.refunded",
]);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  if (typeof req.body === "object" && req.body !== null) return req.body;
  return JSON.parse(req.body || "{}");
}

function getTransactionFromWebhook(body) {
  return body.transaction || body;
}

function isPaidStatus(status) {
  return status === "approved" || status === "paid";
}

function buildPurchasePayload(transaction, webhookTransaction) {
  const metadata = {
    ...(webhookTransaction.metadata || {}),
    ...(transaction.metadata || {}),
  };

  return {
    transaction_id: transaction.transaction_id,
    event_id: transaction.transaction_id ? `purchase-${transaction.transaction_id}` : undefined,
    value: transaction.value,
    currency: transaction.currency || "BRL",
    event_time: Math.floor(Date.now() / 1000),
    event_name: "Purchase",
    event_source_url: metadata.event_source_url,
    client_ip_address: metadata.client_ip_address,
    client_user_agent: metadata.client_user_agent,
    external_id: metadata.external_id || transaction.transaction_id,
    utm: metadata.utm || {},
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Metodo nao permitido." });
  }

  try {
    const body = parseBody(req);
    const event = String(body.event || "");

    if (!DOCUMENTED_EVENTS.has(event)) {
      return sendJson(res, 200, { ok: true, ignored: true, reason: "Evento ignorado." });
    }

    if (event === "transaction.created" || event === "transaction.refunded") {
      return sendJson(res, 200, { ok: true, ignored: true, event });
    }

    const webhookTransaction = normalizeTransaction(getTransactionFromWebhook(body));

    if (!webhookTransaction.transaction_id) {
      return sendJson(res, 400, { ok: false, error: "transaction_id ausente no webhook." });
    }

    const verifiedTransaction = await getTransaction(webhookTransaction.transaction_id);

    if (!isPaidStatus(verifiedTransaction.status)) {
      return sendJson(res, 200, {
        ok: true,
        ignored: true,
        event,
        status: verifiedTransaction.status,
      });
    }

    const purchase = buildPurchasePayload(verifiedTransaction, webhookTransaction);
    const [metaResult, utmifyResult] = await Promise.allSettled([
      sendPurchaseToMeta(purchase),
      sendUtmifyPurchase(purchase),
    ]);

    if (metaResult.status === "rejected") {
      console.error("Meta Purchase error", metaResult.reason);
      return sendJson(res, metaResult.reason.statusCode || 500, {
        ok: false,
        error: metaResult.reason.message || "Erro ao enviar Purchase para Meta.",
      });
    }

    if (utmifyResult.status === "rejected") {
      console.error("UTMify Purchase error", utmifyResult.reason);
    }

    return sendJson(res, 200, {
      ok: true,
      event,
      status: verifiedTransaction.status,
      meta: metaResult.value,
      utmify: utmifyResult.status === "fulfilled" ? utmifyResult.value : { skipped: true },
    });
  } catch (error) {
    console.error("webhook error", error);
    return sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || "Erro no webhook.",
    });
  }
};
