/* =============================================================================
 * Abrigo São Francisco — PIX pela chave (pagamento manual)
 * -----------------------------------------------------------------------------
 * Ao clicar num valor, mostra a CHAVE PIX (e-mail) + passo a passo para a
 * pessoa fazer o PIX no próprio banco. Também exibe a chave direto na página.
 * Sem DePix, sem API, sem backend, sem CPF.
 * ========================================================================== */

(function () {
  "use strict";

  var CONFIG = {
    // Sua chave PIX (aqui do tipo e-mail).
    PIX_KEY: "larsaofrancisco2026@outlook.com",

    // Nome de quem recebe a doação (aparece na página e na tela de pagamento).
    RECEBEDOR_NOME: "Rairon Abreu",
    RECEBEDOR_CARGO: "Responsável pela ONG",

    // Pop-up de saída (aparece uma vez quando a pessoa tenta sair/voltar).
    EXIT_POPUP: true,

    MIN_VALUE: 10,
    MAX_VALUE: 499.99
  };

  /* ------------------------------- helpers ----------------------------- */
  function log() {
    var a = Array.prototype.slice.call(arguments); a.unshift("[PIX-CHAVE]");
    try { console.log.apply(console, a); } catch (e) {}
  }
  function formatBRL(v) { return (Number(v) || 0).toFixed(2).replace(".", ","); }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function keyConfigured() {
    return CONFIG.PIX_KEY && CONFIG.PIX_KEY !== "SUA_CHAVE_PIX_AQUI";
  }
  function copyToClipboard(input, btn, restoreText) {
    input.select(); input.setSelectionRange(0, 99999);
    var done = function () { btn.textContent = "Copiado ✓"; setTimeout(function () { btn.textContent = restoreText; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(done, function () { try { document.execCommand("copy"); } catch (e) {} done(); });
    } else { try { document.execCommand("copy"); } catch (e) {} done(); }
  }

  /* ------------------------------- modal ------------------------------- */
  var modalEl = null;
  function ensureModal() {
    if (modalEl) return modalEl;
    var overlay = document.createElement("div");
    overlay.className = "pix-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML =
      '<div class="pix-modal__box">' +
        '<button class="pix-modal__close" aria-label="Fechar" data-pix-close>&times;</button>' +
        '<div class="pix-modal__body" data-pix-body></div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.hasAttribute("data-pix-close")) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if ((e.key === "Escape" || e.keyCode === 27) && overlay.classList.contains("is-open")) closeModal();
    });
    modalEl = overlay;
    return overlay;
  }
  function openModal(html) {
    var m = ensureModal();
    m.querySelector("[data-pix-body]").innerHTML = html;
    m.classList.add("is-open");
    document.body.style.overflow = "hidden";
    return m;
  }
  function setModalBody(html) {
    if (!modalEl) return openModal(html);
    modalEl.querySelector("[data-pix-body]").innerHTML = html;
    return modalEl;
  }
  function closeModal() {
    if (!modalEl) return;
    modalEl.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  /* ------------------------------ telas -------------------------------- */
  function keyScreenHtml(valueInReais) {
    var key = String(CONFIG.PIX_KEY).trim();
    return (
      '<div class="pix-success pix-keyscreen">' +
        '<span class="eyebrow">Quase lá</span>' +
        '<h3>Faça seu PIX 🐾</h3>' +
        '<div class="pix-amount">Valor: <strong>R$ ' + formatBRL(valueInReais) + '</strong></div>' +
        '<div class="pix-recebedor">Recebedor: <strong>' + escapeHtml(CONFIG.RECEBEDOR_NOME) + '</strong><br><small>' + escapeHtml(CONFIG.RECEBEDOR_CARGO) + '</small></div>' +
        '<label class="pix-copy-label">Chave PIX (tipo e-mail)</label>' +
        '<div class="pix-copy">' +
          '<input type="text" readonly value="' + escapeHtml(key) + '" id="pix-key-input">' +
          '<button class="btn-secondary" id="pix-key-copy-btn" type="button">Copiar</button>' +
        '</div>' +
        '<ol class="pix-steps">' +
          '<li>Abra o app do seu banco</li>' +
          '<li>Escolha <strong>PIX &rsaquo; Pagar com chave</strong></li>' +
          '<li>Cole a chave (e-mail) acima</li>' +
          '<li>Digite <strong>R$ ' + formatBRL(valueInReais) + '</strong> e confirme</li>' +
        '</ol>' +
        '<button class="btn-primary" id="pix-paid-btn" type="button" style="width:100%">Já fiz o pagamento</button>' +
        '<p class="pix-hint">Toque em “Já fiz o pagamento” depois de concluir no banco. 💚</p>' +
      '</div>'
    );
  }
  function wireKeyScreen(valueInReais) {
    var copyBtn = document.getElementById("pix-key-copy-btn");
    var input = document.getElementById("pix-key-input");
    if (copyBtn && input) copyBtn.addEventListener("click", function () { copyToClipboard(input, copyBtn, "Copiar"); });

    var paidBtn = document.getElementById("pix-paid-btn");
    if (paidBtn) paidBtn.addEventListener("click", function () {
      try { if (typeof window.fbq === "function") window.fbq("track", "Purchase", { currency: "BRL", value: Number(valueInReais) }); } catch (e) {}
      setModalBody(thankYouHtml(valueInReais));
    });
  }
  function thankYouHtml(valueInReais) {
    return (
      '<div class="pix-thanks">' +
        '<div class="pix-thanks__icon">🙌</div>' +
        '<span class="eyebrow">Obrigado!</span>' +
        '<h3>Recebemos sua ajuda, obrigado!</h3>' +
        '<p>Sua doação de <strong>R$ ' + formatBRL(valueInReais) + '</strong> ajuda a cuidar dos nossos resgatados. ❤️🐾</p>' +
        '<button class="btn-primary" data-pix-close type="button">Fechar</button>' +
      '</div>'
    );
  }
  function errorHtml(msg) {
    return (
      '<div class="pix-error">' +
        '<h3>Ops 😢</h3><p>' + (msg || "Tente novamente.") + '</p>' +
        '<button class="btn-primary" data-pix-close>Fechar</button>' +
      '</div>'
    );
  }

  function openPix(valueInReais) {
    var value = Number(valueInReais);
    if (isNaN(value) || value < CONFIG.MIN_VALUE || value > CONFIG.MAX_VALUE) return;
    if (!keyConfigured()) { openModal(errorHtml("Chave PIX não configurada.")); return; }

    try { if (typeof window.fbq === "function") window.fbq("track", "InitiateCheckout", { currency: "BRL", value: value }); } catch (e) {}

    openModal(keyScreenHtml(value));
    wireKeyScreen(value);
  }

  /* ------------------------- valor personalizado ----------------------- */
  function getCustomValue() {
    var input = document.getElementById("custom-donation-value");
    if (!input) return null;
    var num = parseFloat((input.value || "").toString().replace(",", ".").trim());
    if (isNaN(num) || num < CONFIG.MIN_VALUE || num > CONFIG.MAX_VALUE) return null;
    return Math.round(num * 100) / 100;
  }
  function flagInvalidCustom() {
    var input = document.getElementById("custom-donation-value");
    if (!input) return;
    input.classList.add("is-invalid"); input.focus();
    setTimeout(function () { input.classList.remove("is-invalid"); }, 1500);
  }

  function scrollToDoar() {
    var t = document.getElementById("doar");
    if (t && t.scrollIntoView) t.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* --------------------- pop-up de saída (exit intent) ----------------- */
  // Aparece UMA vez quando a pessoa tenta sair. Só é ARMADO depois que a
  // pessoa interage ou passa alguns segundos na página — assim NÃO aparece
  // ao abrir. Não prende o usuário (segue as regras do Facebook).
  var exitShown = false;
  var exitArmed = false;
  var exitEl = null;

  function buildExitPopup() {
    if (exitEl) return exitEl;
    var overlay = document.createElement("div");
    overlay.className = "exit-modal";
    overlay.innerHTML =
      '<div class="exit-modal__box">' +
        '<button class="pix-modal__close" aria-label="Fechar" data-exit-close>&times;</button>' +
        '<div class="exit-modal__icon">🐾</div>' +
        '<span class="eyebrow">Espere um segundinho…</span>' +
        '<h3>Sua ajuda pode fazer uma <em>grande</em> diferença</h3>' +
        '<p>Uma doação de <strong>qualquer valor</strong> já garante ração, remédio e cuidado para um animal resgatado. Você pode salvar uma vida hoje. ❤️</p>' +
        '<button class="btn-primary" id="exit-help-btn" type="button">Quero ajudar agora 💚</button>' +
        '<button class="exit-modal__later" type="button" data-exit-close>Agora não</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.hasAttribute("data-exit-close")) hideExitPopup();
    });
    var helpBtn = overlay.querySelector("#exit-help-btn");
    if (helpBtn) helpBtn.addEventListener("click", function () { hideExitPopup(); scrollToDoar(); });
    exitEl = overlay;
    return overlay;
  }
  function showExitPopup() {
    if (exitShown || !exitArmed) return;
    if (modalEl && modalEl.classList.contains("is-open")) return; // não interrompe pagamento
    exitShown = true;
    buildExitPopup().classList.add("is-open");
    document.body.style.overflow = "hidden";
  }
  function hideExitPopup() {
    if (exitEl) exitEl.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  function initExitIntent() {
    if (!CONFIG.EXIT_POPUP) return;

    function arm() {
      if (exitArmed) return;
      exitArmed = true;
      // Só agora coloca o "trava" do botão voltar.
      try { history.pushState({ asf: 1 }, "", location.href); } catch (e) {}
    }
    // Arma após 3s OU na primeira interação (o que vier primeiro).
    setTimeout(arm, 3000);
    ["scroll", "mousemove", "touchstart", "keydown", "click"].forEach(function (ev) {
      window.addEventListener(ev, arm, { once: true, passive: true });
    });

    // Desktop: mouse saindo pelo topo da janela.
    document.addEventListener("mouseout", function (e) {
      if (!exitArmed || exitShown) return;
      if (!e.relatedTarget && e.clientY <= 0) showExitPopup();
    });

    // Botão "voltar": só age depois de armado.
    window.addEventListener("popstate", function () {
      if (!exitArmed || exitShown) return;
      showExitPopup();
      try { history.pushState({ asf: 1 }, "", location.href); } catch (e) {}
    });
  }

  /* ------------------------------ init --------------------------------- */
  function init() {
    if (!keyConfigured()) log("⚠️ Configure sua chave PIX em CONFIG.PIX_KEY.");

    // Botões de valor.
    var buttons = document.querySelectorAll("[data-donate-value]");
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) { btn.addEventListener("click", function () { openPix(btn.getAttribute("data-donate-value")); }); })(buttons[i]);
    }

    // Valor personalizado.
    var generic = document.querySelector("[data-donate-generic]");
    if (generic) generic.addEventListener("click", function () {
      var v = getCustomValue(); if (!v) { flagInvalidCustom(); return; } openPix(v);
    });
    var custom = document.getElementById("custom-donation-value");
    if (custom) custom.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); var v = getCustomValue(); if (!v) { flagInvalidCustom(); return; } openPix(v); }
    });

    // Botões de scroll até a doação.
    var scrollBtns = document.querySelectorAll("[data-scroll-to-doar]");
    for (var k = 0; k < scrollBtns.length; k++) scrollBtns[k].addEventListener("click", scrollToDoar);

    // Chave PIX visível na página (abaixo dos valores).
    var inlineKey = document.getElementById("pix-inline-key");
    var inlineCopy = document.getElementById("pix-inline-copy");
    var inlineReceb = document.getElementById("pix-inline-recebedor");
    if (inlineReceb) inlineReceb.textContent = String(CONFIG.RECEBEDOR_NOME);
    var inlineCargo = document.getElementById("pix-inline-cargo");
    if (inlineCargo) inlineCargo.textContent = String(CONFIG.RECEBEDOR_CARGO);
    if (inlineKey) inlineKey.value = String(CONFIG.PIX_KEY).trim();
    if (inlineKey && inlineCopy) inlineCopy.addEventListener("click", function () { copyToClipboard(inlineKey, inlineCopy, "Copiar chave"); });

    // FAQ accordion.
    var items = document.querySelectorAll(".faq-item");
    for (var m = 0; m < items.length; m++) {
      (function (item) {
        var q = item.querySelector(".faq-item__q"); if (!q) return;
        q.addEventListener("click", function () {
          var open = item.classList.contains("is-open");
          for (var n = 0; n < items.length; n++) items[n].classList.remove("is-open");
          if (!open) item.classList.add("is-open");
        });
      })(items[m]);
    }

    initExitIntent();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
