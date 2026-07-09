/* =============================================================================
 * Abrigo São Francisco — main.js  (integração via API da FastDepix)
 * -----------------------------------------------------------------------------
 * NOVO FLUXO (substitui o redirecionamento para o checkout hospedado):
 *   1. Gera/persiste visitor_id (cookie asf_visitor_id + localStorage)
 *   2. Captura UTMs, fbclid, fbc, fbp
 *   3. Ao doar, faz POST para /api/create-transaction com { amount, tracking }
 *   4. O backend cria o PIX na FastDepix, salva o tracking no KV e devolve o PIX
 *   5. Exibimos um MODAL com o QR Code + copia-e-cola, sem sair da página
 *
 * A landing continua sem CPF e sem checkout próprio — quem gera o PIX é a
 * FastDepix (agora via API, no nosso backend).
 * ========================================================================== */

(function () {
  "use strict";

  var CONFIG = {
    // Rota do nosso backend que cria a transação na FastDepix.
    CREATE_ENDPOINT: "/api/create-transaction",

    // Cookie/localStorage do visitor_id.
    VISITOR_COOKIE: "asf_visitor_id",
    VISITOR_COOKIE_DAYS: 365,

    // Faixa de valor aceita pela API da FastDepix e pela landing (reais).
    // Mínimo oficial da FastDepix: R$ 10,00.
    // Máximo aqui limitado a R$ 499,99 (>= R$ 500 a API exige nome + CPF/CNPJ).
    MIN_VALUE: 10,
    MAX_VALUE: 499.99,

    // Lib para desenhar o QR Code a partir do copia-e-cola (carregada sob demanda).
    QR_LIB_URL: "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"
  };

  /* ----------------------------- logging ------------------------------- */
  function log() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[ASF]");
    try { console.log.apply(console, args); } catch (e) {}
  }

  /* ----------------------------- cookies ------------------------------- */
  function setCookie(name, value, days) {
    var expires = "";
    if (days) {
      var d = new Date();
      d.setTime(d.getTime() + days * 864e5);
      expires = "; expires=" + d.toUTCString();
    }
    document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/; SameSite=Lax";
  }
  function getCookie(name) {
    var target = name + "=";
    var parts = document.cookie ? document.cookie.split(";") : [];
    for (var i = 0; i < parts.length; i++) {
      var c = parts[i].replace(/^\s+/, "");
      if (c.indexOf(target) === 0) return decodeURIComponent(c.substring(target.length));
    }
    return null;
  }

  /* --------------------------- visitor_id ------------------------------ */
  function generateVisitorId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }
      if (window.crypto && window.crypto.getRandomValues) {
        var buf = new Uint8Array(16);
        window.crypto.getRandomValues(buf);
        buf[6] = (buf[6] & 0x0f) | 0x40;
        buf[8] = (buf[8] & 0x3f) | 0x80;
        var hex = [];
        for (var i = 0; i < 16; i++) hex.push((buf[i] + 0x100).toString(16).substr(1));
        return hex[0]+hex[1]+hex[2]+hex[3]+"-"+hex[4]+hex[5]+"-"+hex[6]+hex[7]+"-"+hex[8]+hex[9]+"-"+hex[10]+hex[11]+hex[12]+hex[13]+hex[14]+hex[15];
      }
    } catch (e) {}
    return "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function getOrCreateVisitorId() {
    var id = null;
    try { id = window.localStorage.getItem(CONFIG.VISITOR_COOKIE); } catch (e) {}
    if (!id) id = getCookie(CONFIG.VISITOR_COOKIE);
    if (!id) { id = generateVisitorId(); log("Novo visitor_id:", id); }
    setCookie(CONFIG.VISITOR_COOKIE, id, CONFIG.VISITOR_COOKIE_DAYS);
    try { window.localStorage.setItem(CONFIG.VISITOR_COOKIE, id); } catch (e) {}
    return id;
  }

  /* ---------------------------- tracking ------------------------------- */
  function getQueryParams() {
    var params = {};
    var query = window.location.search.replace(/^\?/, "");
    if (!query) return params;
    var pairs = query.split("&");
    for (var i = 0; i < pairs.length; i++) {
      if (!pairs[i]) continue;
      var kv = pairs[i].split("=");
      var key = decodeURIComponent(kv[0]);
      var val = kv.length > 1 ? decodeURIComponent(kv[1].replace(/\+/g, " ")) : "";
      if (key) params[key] = val;
    }
    return params;
  }
  function buildFbcFromFbclid(fbclid) {
    if (!fbclid) return null;
    return "fb.1." + Date.now() + "." + fbclid;
  }
  function collectTracking() {
    var q = getQueryParams();
    var t = {};
    ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"].forEach(function (k) {
      if (q[k]) t[k] = q[k];
    });
    if (q.fbclid) t.fbclid = q.fbclid;
    var fbc = getCookie("_fbc");
    var fbp = getCookie("_fbp");
    if (!fbc && q.fbclid) fbc = buildFbcFromFbclid(q.fbclid);
    if (fbc) t.fbc = fbc;
    if (fbp) t.fbp = fbp;
    if (q.ref) t.ref = q.ref;
    t.visitor_id = getOrCreateVisitorId();
    return t;
  }

  /* ------------------------------ modal PIX ---------------------------- */
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
  function closeModal() {
    if (!modalEl) return;
    modalEl.classList.remove("is-open");
    document.body.style.overflow = "";
  }
  function setModalBody(html) {
    if (!modalEl) return openModal(html);
    modalEl.querySelector("[data-pix-body]").innerHTML = html;
    return modalEl;
  }

  function loadingHtml(valueInReais) {
    return (
      '<div class="pix-loading">' +
        '<span class="spinner spinner--dark"></span>' +
        '<p>Gerando seu PIX de <strong>R$ ' + formatBRL(valueInReais) + '</strong>…</p>' +
      '</div>'
    );
  }
  function errorHtml(msg) {
    return (
      '<div class="pix-error">' +
        '<h3>Não consegui gerar o PIX 😢</h3>' +
        '<p>' + (msg || "Tente novamente em instantes.") + '</p>' +
        '<button class="btn-primary" data-pix-close>Fechar</button>' +
      '</div>'
    );
  }

  function formatBRL(v) {
    var n = Number(v) || 0;
    return n.toFixed(2).replace(".", ",");
  }

  function successHtml(data, valueInReais) {
    var pix = data.pix || {};
    var code = pix.qr_code_text || "";
    var img = pix.qr_code_image || "";

    var qrBlock;
    if (img) {
      var src = img.indexOf("data:") === 0 ? img : ("data:image/png;base64," + img);
      qrBlock = '<div class="pix-qr"><img alt="QR Code do PIX" src="' + src + '"></div>';
    } else {
      qrBlock = '<div class="pix-qr" id="pix-qr-canvas"></div>';
    }

    return (
      '<div class="pix-success">' +
        '<span class="eyebrow">PIX gerado</span>' +
        '<h3>Falta pouco para ajudar 🐾</h3>' +
        '<p>Escaneie o QR Code ou copie o código para pagar <strong>R$ ' + formatBRL(valueInReais) + '</strong>.</p>' +
        qrBlock +
        (code
          ? '<label class="pix-copy-label">Código copia-e-cola</label>' +
            '<div class="pix-copy">' +
              '<input type="text" readonly value="' + escapeHtml(code) + '" id="pix-code-input">' +
              '<button class="btn-secondary" id="pix-copy-btn" type="button">Copiar</button>' +
            '</div>'
          : '') +
        '<p class="pix-hint">Assim que o pagamento for confirmado, a atribuição é registrada automaticamente. Obrigado! ❤️</p>' +
      '</div>'
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function renderQr(code) {
    var holder = document.getElementById("pix-qr-canvas");
    if (!holder || !code) return;
    function draw() {
      try {
        holder.innerHTML = "";
        /* global QRCode */
        new QRCode(holder, { text: code, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
      } catch (e) { log("Falha ao desenhar QR:", e && e.message); }
    }
    if (typeof window.QRCode !== "undefined") { draw(); return; }
    loadScript(CONFIG.QR_LIB_URL).then(draw).catch(function () {
      holder.innerHTML = '<p class="pix-hint">Use o código copia-e-cola abaixo.</p>';
    });
  }

  function wireCopyButton() {
    var btn = document.getElementById("pix-copy-btn");
    var input = document.getElementById("pix-code-input");
    if (!btn || !input) return;
    btn.addEventListener("click", function () {
      input.select();
      input.setSelectionRange(0, 99999);
      var done = function () { btn.textContent = "Copiado ✓"; setTimeout(function () { btn.textContent = "Copiar"; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(input.value).then(done, function () { document.execCommand("copy"); done(); });
      } else {
        try { document.execCommand("copy"); } catch (e) {}
        done();
      }
    });
  }

  /* ------------------------ criação do PIX (API) ----------------------- */
  var creating = false;

  function createPix(valueInReais) {
    if (creating) return;
    creating = true;

    openModal(loadingHtml(valueInReais));

    var tracking = collectTracking();

    // Evento de intenção no Pixel.
    try {
      if (typeof window.fbq === "function") {
        window.fbq("track", "InitiateCheckout", { currency: "BRL", value: Number(valueInReais) });
      }
    } catch (e) {}

    fetch(CONFIG.CREATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(valueInReais), tracking: tracking })
    })
      .then(function (res) {
        return res.json().then(function (json) { return { ok: res.ok, json: json }; });
      })
      .then(function (r) {
        creating = false;
        if (!r.ok || !r.json || !r.json.ok) {
          var detail = r.json && (r.json.detail || r.json.error) ? (r.json.detail || r.json.error) : "";
          log("Falha na criação do PIX:", detail);
          setModalBody(errorHtml("Não foi possível gerar o PIX agora. " + (detail ? "(" + detail + ")" : "")));
          return;
        }
        log("PIX criado. transaction_id:", r.json.transaction_id);
        setModalBody(successHtml(r.json, valueInReais));
        if (!(r.json.pix && r.json.pix.qr_code_image)) {
          renderQr(r.json.pix && r.json.pix.qr_code_text);
        }
        wireCopyButton();
      })
      .catch(function (err) {
        creating = false;
        log("Erro de rede ao criar PIX:", err && err.message);
        setModalBody(errorHtml("Erro de conexão. Verifique sua internet e tente de novo."));
      });
  }

  /* ---------------------- valor personalizado -------------------------- */
  function getCustomValue() {
    var input = document.getElementById("custom-donation-value");
    if (!input) return null;
    var raw = (input.value || "").toString().replace(",", ".").trim();
    var num = parseFloat(raw);
    if (isNaN(num) || num < CONFIG.MIN_VALUE || num > CONFIG.MAX_VALUE) return null;
    return Math.round(num * 100) / 100;
  }
  function flagInvalidCustom() {
    var input = document.getElementById("custom-donation-value");
    if (!input) return;
    input.classList.add("is-invalid");
    input.focus();
    setTimeout(function () { input.classList.remove("is-invalid"); }, 1500);
  }

  /* --------------------------- binds da página ------------------------- */
  function scrollToDoar() {
    var target = document.getElementById("doar");
    if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function initValueButtons() {
    var buttons = document.querySelectorAll("[data-donate-value]");
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () { createPix(btn.getAttribute("data-donate-value")); });
      })(buttons[i]);
    }
  }
  function initCustomDonate() {
    var genericBtn = document.querySelector("[data-donate-generic]");
    if (genericBtn) {
      genericBtn.addEventListener("click", function () {
        var value = getCustomValue();
        if (!value) { flagInvalidCustom(); return; }
        createPix(value);
      });
    }
    var input = document.getElementById("custom-donation-value");
    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.keyCode === 13) {
          e.preventDefault();
          var value = getCustomValue();
          if (!value) { flagInvalidCustom(); return; }
          createPix(value);
        }
      });
    }
  }
  function initScrollButtons() {
    var scrollBtns = document.querySelectorAll("[data-scroll-to-doar]");
    for (var i = 0; i < scrollBtns.length; i++) scrollBtns[i].addEventListener("click", scrollToDoar);
  }
  function initFaq() {
    var items = document.querySelectorAll(".faq-item");
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var q = item.querySelector(".faq-item__q");
        if (!q) return;
        q.addEventListener("click", function () {
          var isOpen = item.classList.contains("is-open");
          for (var j = 0; j < items.length; j++) items[j].classList.remove("is-open");
          if (!isOpen) item.classList.add("is-open");
        });
      })(items[i]);
    }
  }

  function init() {
    var vid = getOrCreateVisitorId();
    log("visitor_id ativo:", vid);
    log("tracking:", collectTracking());
    initValueButtons();
    initCustomDonate();
    initScrollButtons();
    initFaq();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
