/**
 * Abrigo São Francisco — landing page de doação
 *
 * Esta página NÃO gera PIX, NÃO cria cobranças e NÃO exibe QR Code.
 * O checkout é 100% hospedado pela FastDepix. O papel deste script é:
 *   1) permitir a escolha do valor (para o evento InitiateCheckout do Pixel Meta);
 *   2) montar a URL do checkout da FastDepix preservando os parâmetros
 *      de rastreamento (UTMs, fbclid, fbc, fbp) e um identificador de
 *      visita (ref) gerado no navegador — para tentar correlacionar a
 *      venda mais tarde, caso a FastDepix repasse esses dados no webhook;
 *   3) redirecionar o usuário para lá.
 */

const FASTDEPIX_CHECKOUT_URL = "https://fastdepix.space/p/P0A33B0B9/sos";
const REF_STORAGE_KEY = "asf_visit_ref";

// Parâmetros que tentamos preservar até o checkout da FastDepix.
// Se a FastDepix ignorar algum deles, não há problema — é esperado
// nesta fase de descoberta (ver README/relatório de entrega).
const UTM_PARAMS = [
  "utm_source",
  "utm_campaign",
  "utm_medium",
  "utm_content",
  "utm_term",
  "utm_id",
  "utm_source_platform",
  "utm_creative_format",
  "utm_marketing_tactic",
];

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getOrCreateVisitRef() {
  try {
    let ref = sessionStorage.getItem(REF_STORAGE_KEY);
    if (!ref) {
      ref = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem(REF_STORAGE_KEY, ref);
    }
    return ref;
  } catch (error) {
    // sessionStorage indisponível (ex.: navegação privada) — segue sem persistir.
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function getTrackingParams() {
  const params = new URLSearchParams(window.location.search);
  const tracking = {};

  UTM_PARAMS.forEach((key) => {
    const value = params.get(key);
    if (value) tracking[key] = value;
  });

  const fbclid = params.get("fbclid");
  if (fbclid) tracking.fbclid = fbclid;

  // _fbc e _fbp são setados automaticamente pelo Pixel do Meta (fbevents.js)
  // via cookie assim que a página carrega.
  const fbc = getCookie("_fbc");
  if (fbc) tracking.fbc = fbc;

  const fbp = getCookie("_fbp");
  if (fbp) tracking.fbp = fbp;

  tracking.ref = getOrCreateVisitRef();

  return tracking;
}

function buildFastDepixCheckoutUrl() {
  const url = new URL(FASTDEPIX_CHECKOUT_URL);
  const tracking = getTrackingParams();

  Object.entries(tracking).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

function trackDonationIntent(value) {
  try {
    if (window.fbq) {
      window.fbq("track", "InitiateCheckout", { value, currency: "BRL" });
    }
  } catch (error) {
    // Falha ao disparar o evento não deve impedir o redirecionamento.
  }
}

function showToast(text) {
  const toast = document.getElementById("redirect-toast");
  if (!toast) return;

  const label = Array.from(toast.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  if (label && text) label.textContent = ` ${text}`;
  toast.classList.add("is-visible");
}

function redirectToCheckout(value) {
  trackDonationIntent(value);
  showToast(`Redirecionando para o pagamento de ${formatCurrency(value)}…`);

  window.setTimeout(() => {
    window.location.href = buildFastDepixCheckoutUrl();
  }, 400);
}

function handleDonation(value) {
  if (!value || value < 5) {
    window.alert("Informe um valor de pelo menos R$ 5.");
    return;
  }

  redirectToCheckout(value);
}

document.querySelectorAll("[data-donate-value]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const value = Number(btn.getAttribute("data-donate-value"));
    handleDonation(value);
  });
});

document.querySelectorAll("[data-donate-generic]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById("custom-donation-value");
    const value = Number(input?.value || 0);
    handleDonation(value);
  });
});

document.querySelectorAll("[data-scroll-to-doar]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("doar")?.scrollIntoView({ behavior: "smooth" });
  });
});

document.querySelectorAll(".faq-item").forEach((item) => {
  const question = item.querySelector(".faq-item__q");
  const answer = item.querySelector(".faq-item__a");

  question.addEventListener("click", () => {
    const isOpen = item.classList.contains("is-open");

    document.querySelectorAll(".faq-item.is-open").forEach((openItem) => {
      if (openItem !== item) {
        openItem.classList.remove("is-open");
        openItem.querySelector(".faq-item__a").style.maxHeight = null;
      }
    });

    if (isOpen) {
      item.classList.remove("is-open");
      answer.style.maxHeight = null;
    } else {
      item.classList.add("is-open");
      answer.style.maxHeight = `${answer.scrollHeight}px`;
    }
  });
});
