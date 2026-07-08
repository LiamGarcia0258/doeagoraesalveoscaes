const { createTransaction } = require("../utils/fastdepix");

function getClientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "")
    .split(",")[0]
    .trim();
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  if (typeof req.body === "object" && req.body !== null) return req.body;
  return JSON.parse(req.body || "{}");
}

function limitText(value, maxLength = 180) {
  if (typeof value !== "string") return undefined;
  return value.slice(0, maxLength);
}

function sanitizeUtm(utm) {
  if (!utm || typeof utm !== "object" || Array.isArray(utm)) return {};

  return Object.fromEntries(
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]
      .map((key) => [key, limitText(utm[key])])
      .filter(([, value]) => value)
  );
}

function getEventSourceUrl(req, fallback) {
  const source = req.headers.referer || req.headers.referrer || fallback;
  if (!source || typeof source !== "string") return undefined;

  try {
    return new URL(source).toString();
  } catch (error) {
    return undefined;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Metodo nao permitido." });
  }

  try {
    const body = parseBody(req);
    const value = Number(body.value);

    if (!Number.isFinite(value) || value < 5) {
      return sendJson(res, 400, { error: "Valor minimo para doacao: R$ 5." });
    }

    const transaction = await createTransaction({
      value,
      currency: "BRL",
      external_id: limitText(body.external_id, 80),
      event_source_url: getEventSourceUrl(req, body.event_source_url),
      utm: sanitizeUtm(body.utm),
      client_ip_address: getClientIp(req),
      client_user_agent: req.headers["user-agent"] || "",
    });

    return sendJson(res, 200, {
      transaction_id: transaction.transaction_id,
      status: transaction.status,
      qr_code: transaction.qr_code,
      pix_copia_cola: transaction.pix_copia_cola,
    });
  } catch (error) {
    console.error("create-pix error", error);
    return sendJson(res, error instanceof SyntaxError ? 400 : error.statusCode || 500, {
      error: error.message || "Erro ao gerar PIX.",
    });
  }
};
