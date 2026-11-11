/* EnglishJourney shared backend loader */
(() => {
  "use strict";

  if (window.EnglishJourneyLoader) return;

  const state = {
    activeRequests: 0,
    manualActive: false,
    dialog: null,
    showTimer: null,
    hideTimer: null,
    shownAt: 0,
    activeGrade: null,
    fetchInstalled: false
  };

  const SHOW_DELAY = 110;
  const MIN_VISIBLE_TIME = 440;
  const SUPABASE_HOST = "rmsmamzutvxugdbiqsrz.supabase.co";

  const styleLines = [
    "dialog#global-loader.ej-loader-dialog {",
    "  position: fixed !important; inset: 0 !important; margin: 0 !important;",
    "  width: 100vw !important; height: 100vh !important; height: 100dvh !important;",
    "  max-width: none !important; max-height: none !important; padding: 0 !important;",
    "  border: 0 !important; border-radius: 0 !important; overflow: hidden !important;",
    "  background: transparent !important; color: #fff !important;",
    "  display: flex !important; align-items: center !important; justify-content: center !important;",
    "  z-index: 2147483647 !important; outline: none !important;",
    "}",
    "dialog#global-loader.ej-loader-dialog::backdrop {",
    "  background: rgba(0,0,0,.82) !important;",
    "  -webkit-backdrop-filter: blur(7px); backdrop-filter: blur(7px);",
    "}",
    ".ej-loader-content {",
    "  display: flex; flex-direction: column; align-items: center; justify-content: center;",
    "  gap: 10px; padding: 20px; max-width: calc(100vw - 32px); text-align: center;",
    "  background: transparent !important; border: 0 !important; border-radius: 0 !important;",
    "  box-shadow: none !important; color: #fff; font-family: system-ui, sans-serif;",
    "}",
    ".ej-loader-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }",
    ".ej-loader-star-stage { position: relative; width: 96px; height: 94px; display: grid; place-items: center; }",
    ".ej-loader-star-stage::after {",
    "  content: ''; position: absolute; bottom: 7px; left: 50%; width: 39px; height: 8px;",
    "  border-radius: 50%; background: rgba(0,0,0,.38); filter: blur(3px);",
    "  transform: translateX(-50%); animation: ej-star-shadow 1.12s ease-in-out infinite;",
    "}",
    ".ej-loader-star {",
    "  position: relative; z-index: 1; display: block; font-size: 58px; line-height: 1;",
    "  transform-origin: 50% 85%; filter: drop-shadow(0 5px 12px rgba(255,190,35,.3));",
    "  animation: ej-star-hop 1.12s cubic-bezier(.28,.78,.34,1) infinite;",
    "}",
    ".ej-loader-bubble-word {",
    "  display: inline-flex; align-items: baseline; justify-content: center; gap: 0;",
    "  color: #fff3b3; font-family: 'Trebuchet MS', 'Arial Rounded MT Bold', system-ui, sans-serif;",
    "  font-size: 1.12rem; font-weight: 900; letter-spacing: .25px;",
    "  text-shadow: 0 2px 0 rgba(115,65,0,.28), 0 0 14px rgba(255,208,81,.22);",
    "}",
    ".ej-loader-bubble-word > span { display: inline-block; animation: ej-letter-bob 1.25s ease-in-out infinite; animation-delay: calc(var(--letter-index) * 48ms); }",
    ".ej-loader-bubble-word .ej-dots { letter-spacing: 1px; animation: ej-dots-pulse 1s ease-in-out infinite; }",
    ".ej-hs-content { gap: 14px; }",
    ".ej-hs-loader-mark {",
    "  position: relative; width: 78px; height: 78px; display: grid; place-items: center;",
    "  filter: drop-shadow(0 0 13px rgba(37,224,255,.22));",
    "}",
    ".ej-hs-loader-ring {",
    "  position: absolute; inset: 5px; border: 2px solid rgba(62,224,255,.2);",
    "  border-top-color: #45eaff; border-right-color: rgba(69,234,255,.78);",
    "  border-radius: 50%; animation: ej-tech-spin .95s linear infinite;",
    "}",
    ".ej-hs-loader-orbit {",
    "  position: absolute; width: 88px; height: 32px; border: 1px solid rgba(99,226,255,.72);",
    "  border-radius: 50%; transform: rotate(-34deg); animation: ej-tech-orbit 2.2s linear infinite;",
    "}",
    ".ej-hs-loader-core { width: 13px; height: 13px; border-radius: 3px; background: #65f1ff;",
    "  box-shadow: 0 0 12px #65f1ff, 0 0 28px rgba(75,217,255,.8); transform: rotate(45deg);",
    "  animation: ej-tech-core 1.3s ease-in-out infinite; }",
    ".ej-hs-loader-satellite { position: absolute; top: 7px; right: 12px; width: 6px; height: 6px;",
    "  border-radius: 50%; background: #fff; box-shadow: 0 0 10px #65f1ff; }",
    ".ej-hs-loader-title { color: #d9fbff; font-family: 'Segoe UI', system-ui, sans-serif;",
    "  font-size: .9rem; font-weight: 800; letter-spacing: .19em; text-transform: uppercase;",
    "  text-shadow: 0 0 14px rgba(69,234,255,.48); }",
    ".ej-hs-loader-caption { color: rgba(170,226,239,.78); font-family: 'Consolas', monospace;",
    "  font-size: .65rem; letter-spacing: .12em; text-transform: uppercase; }",
    ".ej-hs-loader-progress { width: min(270px, 66vw); height: 4px; overflow: hidden;",
    "  border-radius: 99px; background: rgba(69,234,255,.16); box-shadow: 0 0 12px rgba(69,234,255,.1); }",
    ".ej-hs-loader-progress > span { display: block; width: 34%; height: 100%; border-radius: inherit;",
    "  background: linear-gradient(90deg, transparent, #52efff, #d8fdff);",
    "  box-shadow: 0 0 10px rgba(69,234,255,.85); animation: ej-progress-scan 1.25s ease-in-out infinite; }",
    "@keyframes ej-star-hop {",
    "  0%, 100% { transform: translateY(0) rotate(0) scale(1,1); }",
    "  12% { transform: translateY(4px) rotate(0) scale(1.18,.78); }",
    "  28% { transform: translateY(-19px) rotate(-8deg) scale(.96,1.06); }",
    "  46% { transform: translateY(-39px) rotate(9deg) scale(1.02,1); }",
    "  63% { transform: translateY(-23px) rotate(4deg) scale(1,1.02); }",
    "  76% { transform: translateY(2px) rotate(0) scale(1.16,.82); }",
    "  87% { transform: translateY(-7px) rotate(-3deg) scale(.98,1.04); }",
    "}",
    "@keyframes ej-star-shadow {",
    "  0%, 100% { transform: translateX(-50%) scale(1); opacity: .55; }",
    "  40%, 60% { transform: translateX(-50%) scale(.55); opacity: .2; }",
    "  76% { transform: translateX(-50%) scale(1.1,.72); opacity: .62; }",
    "}",
    "@keyframes ej-letter-bob { 0%,100% { transform: translateY(0) scale(1); } 45% { transform: translateY(-3px) scale(1.07); } }",
    "@keyframes ej-dots-pulse { 0%,100% { opacity: .5; } 50% { opacity: 1; } }",
    "@keyframes ej-tech-spin { to { transform: rotate(360deg); } }",
    "@keyframes ej-tech-orbit { to { transform: rotate(326deg); } }",
    "@keyframes ej-tech-core { 0%,100% { transform: rotate(45deg) scale(.9); } 50% { transform: rotate(135deg) scale(1.15); } }",
    "@keyframes ej-progress-scan { 0% { transform: translateX(-140%); } 100% { transform: translateX(320%); } }",
    "@media (prefers-reduced-motion: reduce) {",
    "  .ej-loader-star, .ej-loader-star-stage::after, .ej-loader-bubble-word > span, .ej-loader-bubble-word .ej-dots,",
    "  .ej-hs-loader-ring, .ej-hs-loader-orbit, .ej-hs-loader-core, .ej-hs-loader-progress > span { animation-duration: 2.8s; }",
    "}"
  ].join("\n");

  function ensureStyles() {
    if (document.getElementById("ej-backend-loader-styles")) return;
    const style = document.createElement("style");
    style.id = "ej-backend-loader-styles";
    style.textContent = styleLines;
    (document.head || document.documentElement).appendChild(style);
  }

  function getStoredGrade() {
    try {
      const session = JSON.parse(localStorage.getItem("studentSession") || "null");
      return session && (session.grade || session.serie) ? (session.grade || session.serie) : "";
    } catch (_) {
      return "";
    }
  }

  function isHighSchool(grade) {
    const firstDigit = String(grade || "").trim().charAt(0);
    return ["1", "2", "3"].includes(firstDigit);
  }

  function buildFundamentalMarkup() {
    const letters = Array.from("Carregando").map((letter, index) =>
      '<span style="--letter-index:' + index + '">' + letter + '</span>'
    ).join("");
    return '<div class="ej-loader-content" role="status" aria-live="polite">' +
      '<div class="ej-loader-star-stage"><span class="ej-loader-star" aria-hidden="true">⭐</span></div>' +
      '<div class="ej-loader-bubble-word" aria-hidden="true">' + letters +
      '<span class="ej-dots">...</span></div>' +
      '<span class="ej-loader-sr-only">Carregando. Aguarde.</span></div>';
  }

  function buildHighSchoolMarkup() {
    return '<div class="ej-loader-content ej-hs-content" role="status" aria-live="polite">' +
      '<div class="ej-hs-loader-mark" aria-hidden="true"><span class="ej-hs-loader-ring"></span>' +
      '<span class="ej-hs-loader-orbit"></span><span class="ej-hs-loader-core"></span>' +
      '<span class="ej-hs-loader-satellite"></span></div>' +
      '<div class="ej-hs-loader-title">SYSTEM PROCESSING</div>' +
      '<div class="ej-hs-loader-progress" aria-hidden="true"><span></span></div>' +
      '<div class="ej-hs-loader-caption">Sincronizando dados do sistema</div>' +
      '<span class="ej-loader-sr-only">Processando dados. Aguarde.</span></div>';
  }

  function ensureDialog() {
    ensureStyles();
    const highSchool = isHighSchool(state.activeGrade);
    const theme = highSchool ? "high-school" : "fundamental";
    if (!state.dialog || !state.dialog.isConnected) {
      const dialog = document.createElement("dialog");
      dialog.id = "global-loader";
      dialog.className = "ej-loader-dialog";
      dialog.setAttribute("aria-label", highSchool ? "Processando dados" : "Carregando");
      dialog.addEventListener("cancel", event => event.preventDefault());
      (document.body || document.documentElement).appendChild(dialog);
      state.dialog = dialog;
    }

    if (state.dialog.dataset.theme !== theme) {
      state.dialog.dataset.theme = theme;
      state.dialog.innerHTML = highSchool ? buildHighSchoolMarkup() : buildFundamentalMarkup();
      state.dialog.setAttribute("aria-label", highSchool ? "Processando dados" : "Carregando");
    }

    if (!state.dialog.open) {
      try {
        state.dialog.showModal();
      } catch (_) {
        state.dialog.setAttribute("open", "");
      }
      state.shownAt = Date.now();
    }
  }

  function hasActiveWork() {
    return state.manualActive || state.activeRequests > 0;
  }

  function scheduleShow(immediate) {
    if (!hasActiveWork()) return;
    if (state.hideTimer) {
      window.clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }
    if (state.dialog && state.dialog.isConnected) {
      ensureDialog();
      return;
    }
    if (state.showTimer) return;
    if (immediate) {
      ensureDialog();
      return;
    }
    state.showTimer = window.setTimeout(() => {
      state.showTimer = null;
      if (hasActiveWork()) ensureDialog();
    }, SHOW_DELAY);
  }

  function removeDialog() {
    if (state.dialog) {
      try {
        if (state.dialog.open) state.dialog.close();
      } catch (_) {}
      state.dialog.remove();
      state.dialog = null;
    }
    state.activeGrade = null;
  }

  function scheduleHide() {
    if (hasActiveWork()) return;
    if (state.showTimer) {
      window.clearTimeout(state.showTimer);
      state.showTimer = null;
    }
    if (!state.dialog) {
      state.activeGrade = null;
      return;
    }
    if (state.hideTimer) window.clearTimeout(state.hideTimer);
    const elapsed = Date.now() - state.shownAt;
    const wait = Math.max(0, MIN_VISIBLE_TIME - elapsed);
    state.hideTimer = window.setTimeout(() => {
      state.hideTimer = null;
      if (!hasActiveWork()) removeDialog();
    }, wait);
  }

  function show(gradeOverride) {
    state.activeGrade = gradeOverride !== undefined && gradeOverride !== null
      ? gradeOverride
      : getStoredGrade();
    state.manualActive = true;
    scheduleShow(true);
  }

  function hide() {
    state.manualActive = false;
    scheduleHide();
  }

  function beginOperation(options) {
    const config = options || {};
    if (config.grade !== undefined && config.grade !== null) {
      state.activeGrade = config.grade;
    } else if (!hasActiveWork() && !state.dialog) {
      state.activeGrade = getStoredGrade();
    }

    state.activeRequests += 1;
    scheduleShow(config.immediate === true);

    let finished = false;
    return function finishOperation() {
      if (finished) return;
      finished = true;
      state.activeRequests = Math.max(0, state.activeRequests - 1);
      scheduleHide();
    };
  }

  function isBackendUrl(input, init) {
    try {
      const rawUrl = typeof input === "string" ? input :
        (input && typeof input.url === "string" ? input.url : String(input || ""));
      const parsed = new URL(rawUrl, window.location.href);
      const host = parsed.hostname.toLowerCase();
      const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      const isSupabase = host === SUPABASE_HOST || host.endsWith(".supabase.co");

      if (isSupabase && parsed.pathname.startsWith("/functions/v1/the-city-sleeps")) {
        // The City Sleeps already has its own loader and suppresses background polling.
        return false;
      }

      if (isSupabase && parsed.pathname.startsWith("/functions/v1/dialect-tts")) {
        // Dialect Duel has its own compact speaker spinner while audio is generated.
        return false;
      }

      if (isSupabase && parsed.pathname === "/rest/v1/reminders" && method === "GET") {
        // The admin panel checks reminder expiration in the background every 10 seconds.
        // These silent status checks must not cover the entire page with the global loader.
        return false;
      }

      return isSupabase || host === "script.google.com" || host.endsWith(".googleusercontent.com");
    } catch (_) {
      return false;
    }
  }

  function installFetchHook() {
    if (state.fetchInstalled || typeof window.fetch !== "function") return;
    const originalFetch = window.fetch;
    window.fetch = function () {
      const args = arguments;
      if (!isBackendUrl(args[0], args[1])) return originalFetch.apply(this, args);

      const finish = beginOperation({ immediate: false });
      let request;
      try {
        request = originalFetch.apply(this, args);
      } catch (error) {
        finish();
        throw error;
      }
      return Promise.resolve(request).finally(finish);
    };
    state.fetchInstalled = true;
  }

  window.EnglishJourneyLoader = {
    show,
    hide,
    beginOperation,
    installFetchHook
  };

  installFetchHook();
})();