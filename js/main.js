/**
 * Abrigo Sao Francisco - landing page de doacao
 *
 * Esta pagina nao gera PIX, nao cria cobrancas e nao exibe QR Code.
 * O checkout e 100% hospedado pela FastDepix. Este script apenas:
 *   1) permite a escolha do valor;
 *   2) preserva UTMs, fbclid, fbc, fbp, ref e visitor_id;
 *   3) redireciona para o checkout hospedado.
 */

const FASTDEPIX_CHECKOUT_URL = "https://fastdepix.space/p/P0A33B0B9/sos";
const REF_STORAGE_KEY = "asf_visit_ref";
const VISITOR_ID_STORAGE_KEY = "asf_visitor_id";
const VISITOR_ID_COOKIE_NAME = "asf_visitor_id";
const VISITOR_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

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

function setCookie(name, value, maxAgeSeconds) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getLocalStorageValue(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function setLocalStorageValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // localStorage indisponivel nao deve impedir o redirecionamento.
  }
}

function getOrCreateVisitorId() {
  const storedVisitorId = getLocalStorageValue(VISITOR_ID_STORAGE_KEY);
  const cookieVisitorId = getCookie(VISITOR_ID_COOKIE_NAME);
  const visitorId = storedVisitorId || cookieVisitorId || createId();

  setLocalStorageValue(VISITOR_ID_STORAGE_KEY, visitorId);
  setCookie(VISITOR_ID_COOKIE_NAME, visitorId, VISITOR_ID_MAX_AGE_SECONDS);

  return visitorId;
}

function getOrCreateVisitRef() {
  try {
    let ref = sessionStorage.getItem(REF_STORAGE_KEY);
    if (!ref) {
      ref = createId();
      sessionStorage.setItem(REF_STORAGE_KEY, ref);
    }
    return ref;
  } catch (error) {
    return createId();
  }
}

function logTrackingPoint(label, tracking) {
  console.log(
    `[tracking] ${label}`,
    JSON.stringify({
      visitor_id: tracking.visitor_id || null,
      transaction_id: tracking.transaction_id || null,
      ref: tracking.ref || null,
      fbc: tracking.fbc || null,
      fbp: tracking.fbp || null,
      utm_source: tracking.utm_source || null,
      utm_campaign: tracking.utm_campaign || null,
    })
  );
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

  const fbc = getCookie("_fbc");
  if (fbc) tracking.fbc = fbc;

  const fbp = getCookie("_fbp");
  if (fbp) tracking.fbp = fbp;

  tracking.ref = getOrCreateVisitRef();
  tracking.visitor_id = getOrCreateVisitorId();

  logTrackingPoint("landing", tracking);

  return tracking;
}

function buildFastDepixCheckoutUrl() {
  const url = new URL(FASTDEPIX_CHECKOUT_URL);
  const tracking = getTrackingParams();

  Object.entries(tracking).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  logTrackingPoint("fastdepix_redirect", tracking);

  return url.toString();
}

function trackDonationIntent(value) {
  try {
    const tracking = getTrackingParams();

    if (window.fbq) {
      window.fbq("track", "InitiateCheckout", { value, currency: "BRL", visitor_id: tracking.visitor_id });
    }

    logTrackingPoint("meta_pixel_initiate_checkout", tracking);
  } catch (error) {
    // Falha ao disparar o evento nao deve impedir o redirecionamento.
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
  showToast(`Redirecionando para o pagamento de ${formatCurrency(value)}...`);

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

getTrackingParams();

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
