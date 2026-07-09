/**
 * Envio de vendas para a UTMify.
 * Doc oficial: https://docs.utmify.com.br/envio-de-vendas
 * Endpoint: POST https://api.utmify.com.br/api-credentials/orders
 * Auth: header "x-api-token" (Credencial de API gerada no dashboard da UTMify)
 */

const UTMIFY_ORDERS_URL = "https://api.utmify.com.br/api-credentials/orders";

async function sendUtmifyOrder(order) {
  const token = process.env.UTMIFY_API_TOKEN;

  if (!token) {
    console.warn("[utmify] UTMIFY_API_TOKEN não configurado — envio pulado.");
    return { skipped: true, reason: "missing_token" };
  }

  try {
    const response = await fetch(UTMIFY_ORDERS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-token": token,
      },
      body: JSON.stringify(order),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("[utmify] Falha ao enviar pedido:", response.status, JSON.stringify(body));
      return { skipped: false, ok: false, status: response.status, body };
    }

    return { skipped: false, ok: true, body };
  } catch (error) {
    console.error("[utmify] Erro de rede ao enviar pedido:", error.message);
    return { skipped: false, ok: false, error: error.message };
  }
}

module.exports = { sendUtmifyOrder };
