// ============================================================
// Abrigo São Francisco — lógica do site (JS puro, sem framework)
// ============================================================

const CHECKOUT_URL = "https://fastdepix.space/p/P0A33B0B9/sos";

/**
 * Envia evento pro Meta Pixel, se estiver carregado.
 */
function trackDonationIntent(value) {
  try {
    if (window.fbq) {
      window.fbq("track", "InitiateCheckout", { value: value, currency: "BRL" });
    }
  } catch (e) {
    // Nunca deixa um erro de tracking quebrar o botão de doar.
    console.warn("Tracking indisponível:", e);
  }
}

/**
 * Mostra um aviso rápido de "abrindo checkout..." antes de redirecionar,
 * pra dar feedback visual imediato ao clique.
 */
function showRedirectToast() {
  const toast = document.getElementById("redirect-toast");
  if (!toast) return;
  toast.classList.add("is-visible");
}

/**
 * Ponto único de saída pro checkout. Qualquer botão de doação
 * (valor fixo ou valor livre) passa por aqui.
 */
function goToCheckout(value) {
  trackDonationIntent(value);
  showRedirectToast();
  window.setTimeout(() => {
    window.location.href = CHECKOUT_URL;
  }, 250);
}

// ---------- Botões de valor fixo ----------
document.querySelectorAll("[data-donate-value]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const value = Number(btn.getAttribute("data-donate-value"));
    goToCheckout(value);
  });
});

// ---------- Botões de valor livre / "Doar agora" genéricos ----------
document.querySelectorAll("[data-donate-generic]").forEach((btn) => {
  btn.addEventListener("click", () => {
    goToCheckout(0);
  });
});

// ---------- Scroll suave pro card de doação ----------
document.querySelectorAll("[data-scroll-to-doar]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("doar")?.scrollIntoView({ behavior: "smooth" });
  });
});

// ---------- FAQ accordion ----------
document.querySelectorAll(".faq-item").forEach((item) => {
  const question = item.querySelector(".faq-item__q");
  const answer = item.querySelector(".faq-item__a");
  question.addEventListener("click", () => {
    const isOpen = item.classList.contains("is-open");

    // Fecha os outros itens abertos (comportamento tipo "sanfona")
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
      answer.style.maxHeight = answer.scrollHeight + "px";
    }
  });
});
