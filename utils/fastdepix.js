const FASTDEPIX_BASE_URL = "https://fastdepix.space/api/v1";
const FASTDEPIX_TIMEOUT_MS = 10000;

function requireApiKey() {
  const apiKey = process.env.FASTDEPIX_API_KEY;
  if (!apiKey) {
    throw new Error("FASTDEPIX_API_KEY nao configurada.");
  }
  return apiKey;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Resposta invalida da API FastDepix.");
  }
}

async function requestFastDepix(path, options = {}) {
  const apiKey = requireApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FASTDEPIX_TIMEOUT_MS);

  try {
    const response = await fetch(`${FASTDEPIX_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(options.headers || {}),
      },
    });

    const data = await readJson(response);

    if (!response.ok) {
      const message = data.message || data.error || "Erro na API FastDepix.";
      const error = new Error(message);
      error.statusCode = response.status;
      error.details = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Tempo esgotado ao conectar com a FastDepix.");
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getTransactionObject(data) {
  return data.transaction || data;
}

function normalizeTransaction(data) {
  const transaction = getTransactionObject(data);

  return {
    raw: transaction,
    transaction_id: String(transaction.transaction_id || ""),
    status: String(transaction.status || "").toLowerCase(),
    value: Number(transaction.amount || 0),
    currency: transaction.currency || "BRL",
    qr_code: transaction.qr_code || "",
    pix_copia_cola: transaction.pix_copia_cola || "",
    metadata: transaction.metadata || {},
  };
}

function buildTransactionPayload(input) {
  return {
    amount: Number(input.value),
    currency: input.currency || "BRL",
    payment_method: "pix",
    description: "Doacao Abrigo Sao Francisco",
    customer: {
      name: "Doador Abrigo Sao Francisco",
    },
    metadata: {
      external_id: input.external_id,
      event_source_url: input.event_source_url,
      client_ip_address: input.client_ip_address,
      client_user_agent: input.client_user_agent,
      utm: input.utm || {},
    },
  };
}

async function createTransaction(input) {
  const payload = buildTransactionPayload(input);
  const data = await requestFastDepix("/transactions", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return normalizeTransaction(data);
}

async function getTransaction(id) {
  const data = await requestFastDepix(`/transactions/${encodeURIComponent(id)}`, {
    method: "GET",
  });

  return normalizeTransaction(data);
}

async function registerWebhook(webhookUrl) {
  return requestFastDepix("/webhooks/register", {
    method: "POST",
    body: JSON.stringify({
      url: webhookUrl,
      events: ["transaction.created", "transaction.approved", "transaction.paid", "transaction.refunded"],
    }),
  });
}

module.exports = {
  buildTransactionPayload,
  createTransaction,
  getTransaction,
  normalizeTransaction,
  registerWebhook,
};
