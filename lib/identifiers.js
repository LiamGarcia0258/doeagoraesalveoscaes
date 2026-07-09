/**
 * A FastDepix não documenta claramente o formato do webhook nem como
 * (ou se) ela repassa os parâmetros de rastreamento que enviamos na URL
 * do checkout. Esta função varre o payload inteiro (query + body, em
 * qualquer nível de aninhamento) procurando por qualquer um dos campos
 * conhecidos, para permitir descobrir experimentalmente o que chega.
 */

const IDENTIFIER_KEYS = [
  "external_id",
  "reference",
  "ref",
  "metadata",
  "custom_data",
  "customData",
  "query",
  "origin",
  "notification_url",
  "checkout_url",
  "checkoutUrl",
  "utm_source",
  "utm_campaign",
  "utm_medium",
  "utm_content",
  "utm_term",
  "utm_id",
  "utm_source_platform",
  "utm_creative_format",
  "utm_marketing_tactic",
  "fbclid",
  "fbc",
  "fbp",
  "src",
  "sck",
];

function findIdentifiers(payload, depth = 0, path = "") {
  const found = {};
  if (!payload || typeof payload !== "object" || depth > 5) return found;

  for (const [key, value] of Object.entries(payload)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (IDENTIFIER_KEYS.includes(key) && value !== undefined && value !== null && value !== "") {
      found[currentPath] = value;
    }

    if (value && typeof value === "object") {
      Object.assign(found, findIdentifiers(value, depth + 1, currentPath));
    }
  }

  return found;
}

// Procura o primeiro valor não vazio dentre os identificadores encontrados
// cujo caminho termina com um dos nomes de campo informados (em qualquer
// nível — ex.: "body.metadata.utm_source" ou "query.utm_source").
function pickIdentifier(identifiers, ...fieldNames) {
  for (const fieldName of fieldNames) {
    const match = Object.entries(identifiers).find(([path]) => path === fieldName || path.endsWith(`.${fieldName}`));
    if (match) return match[1];
  }
  return null;
}

module.exports = { findIdentifiers, pickIdentifier, IDENTIFIER_KEYS };
