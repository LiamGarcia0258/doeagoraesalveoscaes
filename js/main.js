const PIX_POLL_INTERVAL_MS = 3000;
const PIX_POLL_MAX_ATTEMPTS = 200;
const FETCH_TIMEOUT_MS = 12000;
const THANK_YOU_URL = "/obrigado.html";

let activePolling = null;

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getUtmParams() {
  const params = new URLSearchParams(window.location.search);
  const utm = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => {
    const value = params.get(key);
    if (value) utm[key] = value;
  });
  return utm;
}

function getExternalId() {
  const key = "abrigo_external_id";
  let externalId = localStorage.getItem(key);

  if (!externalId) {
    externalId = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(key, externalId);
  }

  return externalId;
}

function trackDonationIntent(value) {
  try {
    if (window.fbq) {
      window.fbq("track", "InitiateCheckout", { value, currency: "BRL" });
    }
  } catch (error) {
  }
}

function showToast(text) {
  const toast = document.getElementById("redirect-toast");
  if (!toast) return;

  const label = Array.from(toast.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  if (label && text) label.textContent = ` ${text}`;
  toast.classList.add("is-visible");
}

function hideToast() {
  document.getElementById("redirect-toast")?.classList.remove("is-visible");
}

function openPixModal() {
  const modal = document.getElementById("pix-modal");
  modal?.classList.add("is-open");
  modal?.setAttribute("aria-hidden", "false");
}

function closePixModal() {
  const modal = document.getElementById("pix-modal");
  modal?.classList.remove("is-open");
  modal?.setAttribute("aria-hidden", "true");

  if (activePolling) {
    clearTimeout(activePolling.timeoutId);
    activePolling = null;
  }
}

function setPixStatus(message, isError = false) {
  const status = document.getElementById("pix-status");
  if (!status) return;

  status.classList.toggle("is-error", isError);
  status.textContent = "";

  if (!isError) {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    status.appendChild(spinner);
  }

  const label = document.createElement("span");
  label.textContent = message;
  status.appendChild(label);
}

function showPixContent(data, value) {
  const content = document.getElementById("pix-content");
  const qrImage = document.getElementById("pix-qr-image");
  const copyCode = document.getElementById("pix-copy-code");
  const subtitle = document.getElementById("pix-modal-subtitle");

  if (subtitle) {
    subtitle.textContent = `Doe ${formatCurrency(value)} escaneando o QR Code ou usando o Pix Copia e Cola.`;
  }

  if (qrImage) {
    qrImage.src = data.qr_code;
  }

  if (copyCode) {
    copyCode.value = data.pix_copia_cola || "";
  }

  content.hidden = false;
  setPixStatus("Aguardando pagamento...");
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Nao foi possivel concluir a requisicao.");
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Tempo esgotado. Tente novamente.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function createPix(value) {
  return fetchJson("/api/create-pix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      value,
      currency: "BRL",
      external_id: getExternalId(),
      event_source_url: window.location.href,
      utm: getUtmParams(),
    }),
  });
}

async function checkTransactionStatus(transactionId) {
  return fetchJson(`/api/check-status?id=${encodeURIComponent(transactionId)}`);
}

function startPolling(transactionId) {
  if (activePolling) {
    clearTimeout(activePolling.timeoutId);
  }

  activePolling = {
    attempts: 0,
    timeoutId: null,
  };

  const poll = async () => {
    if (!activePolling) return;

    activePolling.attempts += 1;

    if (activePolling.attempts > PIX_POLL_MAX_ATTEMPTS) {
      activePolling = null;
      setPixStatus("Tempo de confirmação esgotado. Se o pagamento foi feito, aguarde alguns instantes e atualize a página.", true);
      return;
    }

    try {
      const data = await checkTransactionStatus(transactionId);
      const status = String(data.status || "").toLowerCase();

      if (status === "approved" || status === "paid") {
        activePolling = null;
        setPixStatus("Pagamento confirmado. Redirecionando...");
        window.location.href = THANK_YOU_URL;
        return;
      }
    } catch (error) {
    }

    if (activePolling) {
      activePolling.timeoutId = window.setTimeout(poll, PIX_POLL_INTERVAL_MS);
    }
  };

  activePolling.timeoutId = window.setTimeout(poll, PIX_POLL_INTERVAL_MS);
}

async function handleDonation(value) {
  if (!value || value < 5) {
    setPixStatus("Informe um valor de pelo menos R$ 5.", true);
    openPixModal();
    return;
  }

  trackDonationIntent(value);
  showToast("Preparando PIX seguro...");
  openPixModal();
  setPixStatus("Gerando cobrança PIX...");
  document.getElementById("pix-content").hidden = true;

  try {
    const data = await createPix(value);

    if (!data.transaction_id || !data.pix_copia_cola || !data.qr_code) {
      throw new Error("A resposta do gateway nao trouxe os dados completos do PIX.");
    }

    showPixContent(data, value);
    startPolling(data.transaction_id);
  } catch (error) {
    setPixStatus(error.message || "Erro ao gerar PIX. Tente novamente.", true);
  } finally {
    hideToast();
  }
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

document.querySelectorAll("[data-close-pix]").forEach((btn) => {
  btn.addEventListener("click", closePixModal);
});

document.getElementById("copy-pix-code")?.addEventListener("click", async () => {
  const copyCode = document.getElementById("pix-copy-code")?.value;
  if (!copyCode) return;

  try {
    await navigator.clipboard.writeText(copyCode);
    setPixStatus("Codigo PIX copiado. Aguardando pagamento...");
  } catch (error) {
    setPixStatus("Selecione e copie o codigo PIX manualmente.");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePixModal();
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
