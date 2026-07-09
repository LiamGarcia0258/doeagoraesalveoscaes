/**
 * Envio de evento Purchase para a Meta Conversion API (server-side).
 * Doc oficial: https://developers.facebook.com/docs/marketing-api/conversions-api
 *
 * IMPORTANTE: so deve ser chamado quando existir dado real de correlacao
 * com o visitante (visitor_id, fbc ou fbp). Nunca use transaction_id como
 * external_id; quando existir, o external_id deve ser o visitor_id.
 */

const crypto = require("crypto");

function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash("sha256").update(String(value).trim().toLowerCase()).digest("hex");
}

async function sendMetaPurchase({
  value,
  currency = "BRL",
  eventId,
  fbc,
  fbp,
  clientIp,
  userAgent,
  email,
  phone,
  externalId,
}) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    console.warn("[meta-capi] META_PIXEL_ID/META_ACCESS_TOKEN nao configurados - envio pulado.");
    return { skipped: true, reason: "missing_credentials" };
  }

  const userData = {};
  if (fbc) userData.fbc = fbc;
  if (fbp) userData.fbp = fbp;
  if (clientIp) userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;
  if (email) userData.em = [sha256(email)];
  if (phone) userData.ph = [sha256(String(phone).replace(/\D/g, ""))];
  if (externalId) userData.external_id = [sha256(String(externalId))];

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId ? String(eventId) : undefined,
        action_source: "website",
        user_data: userData,
        custom_data: { value, currency },
      },
    ],
  };

  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("[meta-capi] Falha ao enviar Purchase:", response.status, JSON.stringify(body));
      return { skipped: false, ok: false, status: response.status, body };
    }

    return { skipped: false, ok: true, body };
  } catch (error) {
    console.error("[meta-capi] Erro de rede ao enviar Purchase:", error.message);
    return { skipped: false, ok: false, error: error.message };
  }
}

module.exports = { sendMetaPurchase };
