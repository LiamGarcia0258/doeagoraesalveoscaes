const { sendPurchaseEvent } = require("../utils/facebook");

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function sendPurchaseToMeta(event) {
  return sendPurchaseEvent(event);
}

async function handler(req, res) {
  return sendJson(res, 404, { error: "Endpoint nao disponivel." });
}

module.exports = handler;
module.exports.sendPurchaseToMeta = sendPurchaseToMeta;
