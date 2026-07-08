async function sendUtmifyPurchase() {
  if (!process.env.UTMIFY_PIXEL_ID) {
    return { skipped: true, reason: "UTMIFY_PIXEL_ID nao configurado." };
  }

  return { skipped: true, reason: "UTMify preservado no front-end; sem endpoint server-side no escopo." };
}

module.exports = {
  sendUtmifyPurchase,
};
