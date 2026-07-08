const crypto = require("crypto");

const GRAPH_API_VERSION = "v23.0";
const META_TIMEOUT_MS = 10000;

function getPixelConfig() {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    throw new Error("META_PIXEL_ID ou META_ACCESS_TOKEN nao configurados.");
  }

  return { pixelId, accessToken };
}

function hashValue(value) {
  if (!value) return undefined;
  return crypto
    .createHash("sha256")
    .update(String(value).trim().toLowerCase())
    .digest("hex");
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function normalizePurchaseValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Valor do Purchase invalido.");
  }
  return Number(numeric.toFixed(2));
}

async function sendPurchaseEvent(event) {
  const { pixelId, accessToken } = getPixelConfig();
  const eventTime = Math.floor(Date.now() / 1000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), META_TIMEOUT_MS);
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`;

  const eventPayload = compactObject({
    event_name: "Purchase",
    event_time: Number(event.event_time) || eventTime,
    event_source_url: event.event_source_url,
    action_source: "website",
    event_id: event.event_id,
    user_data: compactObject({
      client_ip_address: event.client_ip_address,
      client_user_agent: event.client_user_agent,
      external_id: hashValue(event.external_id),
    }),
    custom_data: {
      value: normalizePurchaseValue(event.value),
      currency: event.currency || "BRL",
    },
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [eventPayload],
        access_token: accessToken,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data.error?.message || "Erro ao enviar Purchase para Meta.";
      const error = new Error(message);
      error.statusCode = response.status;
      error.details = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Tempo esgotado ao conectar com a Meta.");
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  sendPurchaseEvent,
};
