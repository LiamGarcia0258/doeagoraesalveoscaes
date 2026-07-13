/* =============================================================================
 * PIX ESTÁTICO (Projeto 2 — teste de diagnóstico)
 * -----------------------------------------------------------------------------
 * Gera o BR Code (copia-e-cola + QR) direto da SUA CHAVE PIX, seguindo o padrão
 * do Banco Central. NÃO usa DePix, NÃO usa API, NÃO tem backend e NÃO pede CPF.
 * O pagamento cai direto na conta da chave.
 *
 * LIMITAÇÕES (esperadas — é só um teste):
 *   - Sem confirmação automática de pagamento (PIX estático não tem webhook).
 *   - Sem tracking (UTMify/Meta Purchase). Confira os pagamentos no seu banco.
 *
 * >>> PREENCHA A CONFIG ABAIXO COM SEUS DADOS <<<
 * ========================================================================== */

(function () {
  "use strict";

  var CONFIG = {
    // 1) Sua chave PIX (CPF só números, CNPJ só números, e-mail, telefone com +55, ou aleatória)
    PIX_KEY: "larsaofrancisco2026@outlook.com",

    // 2) Nome do recebedor (como aparece no app de quem paga) — máx. 25 caracteres
    RECEBEDOR: "Abrigo Sao Francisco",

    // 3) Cidade do recebedor — máx. 15 caracteres
    CIDADE: "SERRINHA",

    // Pop-up de saída (aparece uma vez quando a pessoa tenta sair/voltar).
    EXIT_POPUP: true,

    // Como mostrar o pagamento ao clicar no valor:
    //   "chave"  -> mostra a CHAVE PIX (e-mail) + passo a passo (a pessoa faz o PIX no banco)
    //   "qrcode" -> mostra o QR Code + copia-e-cola
    MODE: "chave",

    MIN_VALUE: 10,
    MAX_VALUE: 499.99,
    QR_LIB_URL: "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"
  };

  /* --------------------- Geração do BR Code (PIX) ---------------------- */
  function tlv(id, value) {
    return id + String(value.length).padStart(2, "0") + value;
  }
  function normalizeText(s) {
    return String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ""); // só ASCII básico
  }
  function crc16(str) {
    var crc = 0xFFFF;
    for (var i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }
  function buildPixPayload(amountInReais) {
    var mai = tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", String(CONFIG.PIX_KEY).trim()));
    var payload =
      tlv("00", "01") +      // Payload Format Indicator
      tlv("01", "11") +      // Point of Initiation: 11 = estático reutilizável
      mai +
      tlv("52", "0000") +    // Merchant Category Code
      tlv("53", "986") +     // Moeda: BRL
      (amountInReais ? tlv("54", Number(amountInReais).toFixed(2)) : "") +
      tlv("58", "BR") +      // País
      tlv("59", normalizeText(CONFIG.RECEBEDOR).slice(0, 25)) +
      tlv("60", normalizeText(CONFIG.CIDADE).slice(0, 15)) +
      tlv("62", tlv("05", "***")) + // txid
      "6304";
    return payload + crc16(payload);
  }

  function keyConfigured() {
    return CONFIG.PIX_KEY && CONFIG.PIX_KEY !== "SUA_CHAVE_PIX_AQUI";
  }

  /* ------------------------------- helpers ----------------------------- */
  function log() {
    var a = Array.prototype.slice.call(arguments); a.unshift("[PIX-DIRETO]");
    try { console.log.apply(console, a); } catch (e) {}
  }
  function formatBRL(v) { return (Number(v) || 0).toFixed(2).replace(".", ","); }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script"); s.src = src; s.async = true;
      s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
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
  function pixScreenHtml(code, valueInReais) {
    return (
      '<div class="pix-success">' +
        '<span class="eyebrow">PIX gerado</span>' +
        '<h3>Falta pouco para ajudar 🐾</h3>' +
        '<p>Escaneie o QR Code ou copie o código para pagar <strong>R$ ' + formatBRL(valueInReais) + '</strong>.</p>' +
        '<div class="pix-qr" id="pix-qr-canvas"></div>' +
        '<label class="pix-copy-label">Código copia-e-cola</label>' +
        '<div class="pix-copy">' +
          '<input type="text" readonly value="' + escapeHtml(code) + '" id="pix-code-input">' +
          '<button class="btn-secondary" id="pix-copy-btn" type="button">Copiar</button>' +
        '</div>' +
        '<button class="btn-primary" id="pix-paid-btn" type="button" style="width:100%;margin-top:16px">Já fiz o pagamento</button>' +
        '<p class="pix-hint">Após pagar no seu banco, toque em “Já fiz o pagamento”. 💚</p>' +
      '</div>'
    );
  }
  function keyScreenHtml(valueInReais) {
    var key = String(CONFIG.PIX_KEY).trim();
    return (
      '<div class="pix-success pix-keyscreen">' +
        '<span class="eyebrow">Quase lá</span>' +
        '<h3>Faça seu PIX 🐾</h3>' +
        '<div class="pix-amount">Valor: <strong>R$ ' + formatBRL(valueInReais) + '</strong></div>' +
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
    if (copyBtn && input) {
      copyBtn.addEventListener("click", function () {
        input.select(); input.setSelectionRange(0, 99999);
        var done = function () { copyBtn.textContent = "Copiado ✓"; setTimeout(function () { copyBtn.textContent = "Copiar"; }, 2000); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(input.value).then(done, function () { try { document.execCommand("copy"); } catch (e) {} done(); });
        } else { try { document.execCommand("copy"); } catch (e) {} done(); }
      });
    }
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

  function renderQr(code) {
    var holder = document.getElementById("pix-qr-canvas");
    if (!holder || !code) return;
    function draw() {
      try {
        holder.innerHTML = "";
        /* global QRCode */
        new QRCode(holder, { text: code, width: 210, height: 210, correctLevel: QRCode.CorrectLevel.M });
      } catch (e) { log("Falha ao desenhar QR:", e && e.message); }
    }
    if (typeof window.QRCode !== "undefined") { draw(); return; }
    loadScript(CONFIG.QR_LIB_URL).then(draw).catch(function () {
      holder.innerHTML = '<p class="pix-hint">Use o código copia-e-cola abaixo.</p>';
    });
  }
  function wireButtons(valueInReais) {
    var copyBtn = document.getElementById("pix-copy-btn");
    var input = document.getElementById("pix-code-input");
    if (copyBtn && input) {
      copyBtn.addEventListener("click", function () {
        input.select(); input.setSelectionRange(0, 99999);
        var done = function () { copyBtn.textContent = "Copiado ✓"; setTimeout(function () { copyBtn.textContent = "Copiar"; }, 2000); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(input.value).then(done, function () { try { document.execCommand("copy"); } catch (e) {} done(); });
        } else { try { document.execCommand("copy"); } catch (e) {} done(); }
      });
    }
    var paidBtn = document.getElementById("pix-paid-btn");
    if (paidBtn) {
      paidBtn.addEventListener("click", function () {
        try { if (typeof window.fbq === "function") window.fbq("track", "Purchase", { currency: "BRL", value: Number(valueInReais) }); } catch (e) {}
        setModalBody(thankYouHtml(valueInReais));
      });
    }
  }

  function openPix(valueInReais) {
    var value = Number(valueInReais);
    if (isNaN(value) || value < CONFIG.MIN_VALUE || value > CONFIG.MAX_VALUE) return;

    if (!keyConfigured()) {
      openModal(errorHtml("Chave PIX não configurada. Edite js/pix-estatico.js (CONFIG.PIX_KEY)."));
      log("⚠️ Configure CONFIG.PIX_KEY antes de usar.");
      return;
    }

    // Sinaliza intenção no Pixel (se houver).
    try { if (typeof window.fbq === "function") window.fbq("track", "InitiateCheckout", { currency: "BRL", value: value }); } catch (e) {}

    if (CONFIG.MODE === "chave") {
      openModal(keyScreenHtml(value));
      wireKeyScreen(value);
      return;
    }

    // Modo "qrcode": QR + copia-e-cola
    var code = buildPixPayload(value);
    log("BR Code (R$ " + value + "):", code);
    openModal(pixScreenHtml(code, value));
    renderQr(code);
    wireButtons(value);
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

  /* ----------------------------- binds --------------------------------- */
  function scrollToDoar() {
    var t = document.getElementById("doar");
    if (t && t.scrollIntoView) t.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* --------------------- pop-up de saída (exit intent) ----------------- */
  // Aparece UMA vez quando a pessoa tenta sair (mouse para fora no topo) ou
  // aperta "voltar". Não prende o usuário: se insistir, ele sai normalmente
  // (mantém a experiência dentro das regras do Facebook).
  var exitShown = false;
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
    if (exitShown) return;
    // Não interrompe quem já está no meio do pagamento.
    if (modalEl && modalEl.classList.contains("is-open")) return;
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

    // 1) Desktop — mouse saindo pelo topo da janela.
    document.addEventListener("mouseout", function (e) {
      if (exitShown) return;
      if (!e.relatedTarget && e.clientY <= 0) showExitPopup();
    });

    // 2) Botão "voltar" (celular/desktop) — mostra o popup na 1ª vez.
    try {
      history.pushState({ asf: 1 }, "", location.href);
      window.addEventListener("popstate", function () {
        if (!exitShown) {
          showExitPopup();
          // Re-empurra o estado só uma vez, pra segurar nessa 1ª tentativa.
          history.pushState({ asf: 1 }, "", location.href);
        }
        // Se já foi mostrado, não empurra de novo -> a pessoa consegue sair.
      });
    } catch (e) {}
  }


  function init() {
    if (!keyConfigured()) log("⚠️ Configure sua chave PIX em CONFIG.PIX_KEY (js/pix-estatico.js).");

    var buttons = document.querySelectorAll("[data-donate-value]");
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) { btn.addEventListener("click", function () { openPix(btn.getAttribute("data-donate-value")); }); })(buttons[i]);
    }
    var generic = document.querySelector("[data-donate-generic]");
    if (generic) generic.addEventListener("click", function () {
      var v = getCustomValue(); if (!v) { flagInvalidCustom(); return; } openPix(v);
    });
    var custom = document.getElementById("custom-donation-value");
    if (custom) custom.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); var v = getCustomValue(); if (!v) { flagInvalidCustom(); return; } openPix(v); }
    });
    var scrollBtns = document.querySelectorAll("[data-scroll-to-doar]");
    for (var k = 0; k < scrollBtns.length; k++) scrollBtns[k].addEventListener("click", scrollToDoar);

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
