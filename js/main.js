/**
 * Abrigo São Francisco — landing page de doação
 *
 * Esta página NÃO gera PIX, NÃO cria cobranças e NÃO exibe QR Code.
 * O checkout é 100% hospedado pela FastDepix. O único papel deste
 * script é: (1) permitir a escolha do valor para fins de rastreamento
 * do Pixel Meta, e (2) redirecionar o usuário para o checkout da
 * FastDepix preservando os parâmetros de rastreamento (UTMs, fbclid,
 * gclid) presentes na URL de entrada.
 */

const FASTDEPIX_CHECKOUT_URL = "https://fastdepix.space/p/P0A33B0B9/sos";

// Parâmetros de rastreamento que devem ser preservados até o checkout
// da FastDepix. Caso a FastDepix documente outros nomes de parâmetro
// aceitos pelo checkout hospedado, basta incluí-los aqui.
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "src",
  "sck",
];

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getTrackingParams() {
  const params = new URLSearchParams(window.location.search);
  const tracking = {};

  TRACKING_PARAMS.forEach((key) => {
    const value = params.get(key);
    if (value) tracking[key] = value;
  });

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
