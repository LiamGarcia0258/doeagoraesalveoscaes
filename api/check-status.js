const { getTransaction } = require("../utils/fastdepix");

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Metodo nao permitido." });
  }

  try {
    const id = String(req.query?.id || "").trim();

    if (!id || id.length > 120) {
      return sendJson(res, 400, { error: "transaction_id obrigatorio." });
    }

    const transaction = await getTransaction(id);

    return sendJson(res, 200, {
      transaction_id: transaction.transaction_id || String(id),
      status: transaction.status,
      value: transaction.value,
      currency: transaction.currency,
    });
  } catch (error) {
    console.error("check-status error", error);
    return sendJson(res, error.statusCode || 500, {
      error: error.message || "Erro ao consultar status.",
    });
  }
};
