/* Alahya XV — client */
(function () {
  const EVENT_FALLBACK = "2026-10-10T17:00:00-04:00";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ——— Sobre rojo: una invitación que sale al scroll
  const heTrack = document.getElementById("heTrack");
  const heStage = document.getElementById("heStage");
  const heroEnvelope = document.getElementById("inicio");

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  let butterfliesLaunched = false;

  function launchButterflies() {
    if (butterfliesLaunched || reduceMotion) return;
    const field = document.getElementById("heButterflies");
    if (!field) return;
    butterfliesLaunched = true;
    field.innerHTML = "";
    const n = window.innerWidth < 600 ? 10 : 16;
    const glyphs = ["🦋", "🦋", "✨", "🦋"];
    for (let i = 0; i < n; i++) {
      const b = document.createElement("div");
      b.className = "he-butterfly";
      const side = Math.random() > 0.5 ? 1 : -1;
      const dx = side * (40 + Math.random() * 160);
      const dy = -(120 + Math.random() * 220);
      const rot = side * (10 + Math.random() * 40);
      b.style.setProperty("--bf-dx", dx.toFixed(1) + "px");
      b.style.setProperty("--bf-dy", dy.toFixed(1) + "px");
      b.style.setProperty("--bf-rot", rot.toFixed(1) + "deg");
      b.style.setProperty("--bf-dur", (3.2 + Math.random() * 2.4).toFixed(2) + "s");
      b.style.setProperty("--bf-delay", (Math.random() * 0.55).toFixed(2) + "s");
      b.style.setProperty("--bf-size", (0.85 + Math.random() * 0.75).toFixed(2) + "rem");
      const span = document.createElement("span");
      span.textContent = glyphs[i % glyphs.length];
      b.appendChild(span);
      field.appendChild(b);
    }
    // Permitir otra oleada si se cierra y se vuelve a abrir (poco frecuente)
    window.setTimeout(() => {
      butterfliesLaunched = false;
    }, 6500);
  }

  function setEnvelopeProgress(p) {
    if (!heroEnvelope) return;
    const t = clamp01(p);
    // 0–0.35: abre solapa y sello
    const flap = easeOutCubic(clamp01(t / 0.35));
    // 0.2–1: saca la tarjeta por completo
    const out = easeOutCubic(clamp01((t - 0.18) / 0.82));
    const seal = clamp01(1 - t / 0.25);
    const hint = clamp01(1 - t / 0.4);
    heroEnvelope.style.setProperty("--flap", flap.toFixed(4));
    heroEnvelope.style.setProperty("--out", out.toFixed(4));
    heroEnvelope.style.setProperty("--seal", seal.toFixed(4));
    heroEnvelope.style.setProperty("--hint", hint.toFixed(4));
    const open = out > 0.92;
    const wasOpen = heroEnvelope.classList.contains("is-open");
    heroEnvelope.classList.toggle("is-open", open);
    if (open && !wasOpen) launchButterflies();
  }

  function envelopeScrollTotal() {
    if (!heTrack) return 0;
    return Math.max(1, heTrack.offsetHeight - window.innerHeight);
  }

  function updateEnvelopeScroll() {
    if (!heTrack || !heroEnvelope || reduceMotion) return;
    const total = envelopeScrollTotal();
    const scrolled = -heTrack.getBoundingClientRect().top;
    // En móvil el progreso avanza un poco más rápido (menos “pegado”)
    const boost = window.matchMedia("(max-width: 540px)").matches ? 1.12 : 1;
    setEnvelopeProgress((scrolled / total) * boost);
  }

  /** Lleva el scroll al final del sobre (abrir completo) — útil en móvil */
  function scrollEnvelopeOpen(smooth) {
    if (!heTrack || reduceMotion) {
      setEnvelopeProgress(1);
      return;
    }
    const top =
      heTrack.getBoundingClientRect().top +
      (window.pageYOffset || document.documentElement.scrollTop || 0);
    const target = top + envelopeScrollTotal() + 4;
    window.scrollTo({ top: Math.max(0, target), behavior: smooth ? "smooth" : "auto" });
    // Asegura estado abierto al terminar el gesto
    if (!smooth) setEnvelopeProgress(1);
    else {
      window.setTimeout(() => setEnvelopeProgress(1), 450);
    }
  }

  if (heTrack && heroEnvelope) {
    if (reduceMotion) {
      setEnvelopeProgress(1);
    } else {
      setEnvelopeProgress(0);
      updateEnvelopeScroll();
      window.addEventListener("scroll", updateEnvelopeScroll, { passive: true });
      window.addEventListener("resize", updateEnvelopeScroll, { passive: true });

      // Toque / clic en el sobre o el hint: abre del todo (evita pelear con el scroll largo)
      const openTargets = [heStage, document.getElementById("heHint"), document.getElementById("heEnvelope")].filter(
        Boolean
      );
      openTargets.forEach((el) => {
        el.style.cursor = el.id === "heHint" || el === heStage ? "pointer" : el.style.cursor;
        el.addEventListener(
          "click",
          (e) => {
            if (e.target.closest("a, button, input, textarea, select, label")) return;
            if (heroEnvelope.classList.contains("is-open")) return;
            e.preventDefault();
            scrollEnvelopeOpen(true);
          },
          { passive: false }
        );
      });
    }
  }

  // ——— Historia: libro 3D + segunda página (mensaje de Alahya)
  (function setupStoryBook() {
    const book = document.getElementById("storyBook");
    const hint = document.getElementById("storyBookHint");
    const pagesRoot = book && book.querySelector(".story-book-pages");
    const nav = document.getElementById("storyBookNav");
    const prevBtn = document.getElementById("storyBookPrev");
    const nextBtn = document.getElementById("storyBookNext");
    const dots = document.getElementById("storyBookDots");
    if (!book || !pagesRoot) return;

    let page = 1;
    const totalPages = 2;

    function setPage(n) {
      page = Math.max(1, Math.min(totalPages, n));
      pagesRoot.setAttribute("data-page", String(page));
      pagesRoot.querySelectorAll(".story-book-spread").forEach((spread) => {
        const p = Number(spread.getAttribute("data-spread"));
        spread.hidden = p !== page;
      });
      if (prevBtn) prevBtn.disabled = page <= 1;
      if (nextBtn) {
        nextBtn.disabled = page >= totalPages;
        nextBtn.textContent = page >= totalPages ? "Fin" : "Siguiente →";
      }
      if (dots) {
        const marks = dots.querySelectorAll("i");
        marks.forEach((m, i) => m.classList.toggle("is-on", i === page - 1));
      }
      if (hint && book.classList.contains("is-open")) {
        hint.textContent =
          page === 1
            ? "Página 1 · Pasa la hoja para el mensaje de Alahya"
            : "Página 2 · Mensaje de Alahya";
      }
    }

    function setOpen(open) {
      book.classList.toggle("is-open", open);
      book.setAttribute("aria-expanded", open ? "true" : "false");
      if (nav) nav.hidden = !open;
      if (!open) setPage(1);
      else setPage(page);
      if (hint) {
        if (!open) hint.textContent = "Toca el libro para abrirlo";
        else if (page === 1) {
          hint.textContent = "Página 1 · Pasa la hoja para el mensaje de Alahya";
        } else {
          hint.textContent = "Página 2 · Mensaje de Alahya";
        }
      }
    }

    book.addEventListener("click", (e) => {
      // Controles de página: no cerrar el libro
      if (e.target.closest("[data-book-nav]")) {
        e.preventDefault();
        e.stopPropagation();
        const dir = e.target.closest("[data-book-nav]").getAttribute("data-book-nav");
        if (dir === "next") setPage(page + 1);
        if (dir === "prev") setPage(page - 1);
        return;
      }
      // Clic en “pasa la hoja” del texto → página 2
      if (e.target.closest(".story-book-turn-hint")) {
        e.preventDefault();
        e.stopPropagation();
        if (book.classList.contains("is-open")) setPage(2);
        return;
      }
      setOpen(!book.classList.contains("is-open"));
    });

    // Abrir al entrar en vista (una vez)
    if (!reduceMotion && "IntersectionObserver" in window) {
      let autoOpened = false;
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting && !autoOpened) {
              autoOpened = true;
              window.setTimeout(() => setOpen(true), 380);
              io.disconnect();
            }
          });
        },
        { threshold: 0.45 }
      );
      io.observe(book);
    }

    setPage(1);
  })();

  // ——— Particles
  const particlesEl = document.getElementById("particles");
  if (particlesEl && !reduceMotion) {
    const n = window.innerWidth < 600 ? 18 : 36;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("span");
      p.className = "particle";
      p.style.left = Math.random() * 100 + "%";
      p.style.width = p.style.height = 2 + Math.random() * 4 + "px";
      p.style.animationDuration = 8 + Math.random() * 14 + "s";
      p.style.animationDelay = Math.random() * 12 + "s";
      p.style.opacity = String(0.15 + Math.random() * 0.4);
      if (Math.random() > 0.5) p.style.background = "#8b1a1a";
      particlesEl.appendChild(p);
    }
  }

  // ——— Nav
  const nav = document.getElementById("nav");
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");

  window.addEventListener(
    "scroll",
    () => {
      nav.classList.toggle("scrolled", window.scrollY > 40);
    },
    { passive: true }
  );

  navToggle?.addEventListener("click", () => {
    navLinks.classList.toggle("open");
  });

  navLinks?.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => navLinks.classList.remove("open"));
  });

  // ——— Event date + countdown
  let eventDate = new Date(EVENT_FALLBACK);

  function formatSpanishDate(d) {
    try {
      return new Intl.DateTimeFormat("es", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(d);
    } catch {
      return d.toLocaleDateString("es");
    }
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  /** YYYY-MM-DD en Puerto Rico (misma lógica que cierre de reservas) */
  function dateYmdPr(d) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Puerto_Rico",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }

  function tickCountdown() {
    const now = new Date();
    const diff = eventDate.getTime() - now.getTime();
    const done = document.getElementById("countdownDone");
    const box = document.getElementById("countdown");
    const kicker = document.querySelector("#cuenta .section-kicker");
    const title = document.querySelector("#cuenta .section-title");

    if (diff <= 0) {
      if (box) box.hidden = true;
      if (done) {
        done.hidden = false;
        const todayPr = dateYmdPr(now);
        const eventDay = dateYmdPr(eventDate);
        // Día del evento (tras la hora de inicio): gran día
        // Día siguiente o después: mensaje de agradecimiento
        if (todayPr > eventDay) {
          done.textContent = "Gracias por celebrar con nosotros 💕";
          if (kicker) kicker.textContent = "Con cariño";
          if (title) title.textContent = "Fue una noche inolvidable";
        } else {
          done.textContent = "¡Hoy es el gran día! 👑✨";
          if (kicker) kicker.textContent = "Falta muy poco";
          if (title) title.textContent = "Cuenta regresiva";
        }
      }
      return;
    }

    if (box) box.hidden = false;
    if (done) done.hidden = true;
    if (kicker) kicker.textContent = "Falta muy poco";
    if (title) title.textContent = "Cuenta regresiva";

    const s = Math.floor(diff / 1000);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    const el = (id, v) => {
      const n = document.getElementById(id);
      if (n) n.textContent = pad(v);
    };
    el("cdDays", days);
    el("cdHours", hours);
    el("cdMins", mins);
    el("cdSecs", secs);
  }

  function applyEventDate(iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) eventDate = d;

    const heroDate = document.getElementById("heroDate");
    const detailDate = document.getElementById("detailDate");
    const pretty = formatSpanishDate(eventDate);
    const cap = pretty.charAt(0).toUpperCase() + pretty.slice(1);

    if (heroDate) {
      const months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
      ];
      const h = eventDate.getHours();
      const m = eventDate.getMinutes();
      const ampm = h >= 12 ? "p.m." : "a.m.";
      const h12 = h % 12 || 12;
      const mm = String(m).padStart(2, "0");
      heroDate.textContent = `${eventDate.getDate()} de ${months[eventDate.getMonth()].toLowerCase()} de ${eventDate.getFullYear()} · ${h12}:${mm} ${ampm}`;
    }
    if (detailDate) detailDate.textContent = cap;
    tickCountdown();
  }

  fetch("/api/event")
    .then((r) => r.json())
    .then((data) => {
      if (data.eventDate) applyEventDate(data.eventDate);
    })
    .catch(() => applyEventDate(EVENT_FALLBACK));

  setInterval(tickCountdown, 1000);
  tickCountdown();

  // ——— Device / team fingerprint (best-effort)
  function collectDeviceInfo() {
    const nav = window.navigator || {};
    const scr = window.screen || {};
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection || null;
    let orientation = null;
    try {
      orientation = scr.orientation
        ? { type: scr.orientation.type, angle: scr.orientation.angle }
        : { type: window.orientation, angle: window.orientation };
    } catch (_) {}

    const info = {
      collectedAt: new Date().toISOString(),
      localTime: new Date().toString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      timezoneOffsetMin: new Date().getTimezoneOffset(),
      locale: Intl.DateTimeFormat().resolvedOptions().locale || null,
      language: nav.language || null,
      languages: nav.languages ? Array.from(nav.languages) : null,
      userAgent: nav.userAgent || null,
      platform: nav.platform || null,
      vendor: nav.vendor || null,
      product: nav.product || null,
      appVersion: nav.appVersion || null,
      appName: nav.appName || null,
      cookieEnabled: nav.cookieEnabled,
      doNotTrack: nav.doNotTrack || null,
      hardwareConcurrency: nav.hardwareConcurrency || null,
      deviceMemory: nav.deviceMemory || null,
      maxTouchPoints: nav.maxTouchPoints || 0,
      pdfViewerEnabled: nav.pdfViewerEnabled ?? null,
      webdriver: nav.webdriver ?? null,
      onLine: nav.onLine,
      javaEnabled: typeof nav.javaEnabled === "function" ? nav.javaEnabled() : null,
      screen: {
        width: scr.width,
        height: scr.height,
        availWidth: scr.availWidth,
        availHeight: scr.availHeight,
        colorDepth: scr.colorDepth,
        pixelDepth: scr.pixelDepth,
        orientation,
      },
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      connection: conn
        ? {
            effectiveType: conn.effectiveType,
            downlink: conn.downlink,
            rtt: conn.rtt,
            saveData: conn.saveData,
            type: conn.type,
          }
        : null,
      page: {
        href: location.href,
        origin: location.origin,
        path: location.pathname,
        referrer: document.referrer || null,
        title: document.title,
      },
      touchSupport: "ontouchstart" in window || (nav.maxTouchPoints || 0) > 0,
    };

    // UA-CH (Chromium) si está disponible
    if (nav.userAgentData) {
      info.uaData = {
        brands: nav.userAgentData.brands,
        mobile: nav.userAgentData.mobile,
        platform: nav.userAgentData.platform,
      };
    }

    return info;
  }

  // ——— Wishes
  const wishesWall = document.getElementById("wishesWall");
  const wishForm = document.getElementById("wishForm");
  const wishStatus = document.getElementById("wishStatus");
  const wishMsg = document.getElementById("wishMsg");
  const emojiPicker = document.getElementById("emojiPicker");

  function insertEmojiAtCursor(input, emoji) {
    if (!input || !emoji) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const max = Number(input.getAttribute("maxlength") || 400);
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const next = before + emoji + after;
    if (next.length > max) return;
    input.value = next;
    const pos = start + emoji.length;
    input.focus();
    try {
      input.setSelectionRange(pos, pos);
    } catch (_) {}
  }

  emojiPicker?.addEventListener("click", (e) => {
    const btn = e.target.closest(".emoji-btn");
    if (!btn) return;
    e.preventDefault();
    insertEmojiAtCursor(wishMsg, btn.getAttribute("data-emoji"));
  });
  const wishModal = document.getElementById("wishModal");
  const wishModalTitle = document.getElementById("wishModalTitle");
  const wishModalMsg = document.getElementById("wishModalMsg");
  const wishModalWhen = document.getElementById("wishModalWhen");
  const wishModalMeta = document.getElementById("wishModalMeta");
  const wishModalClose = document.getElementById("wishModalClose");
  let wishesCache = [];

  function renderWishes(wishes) {
    wishesCache = wishes || [];
    if (!wishesWall) return;
    if (!wishesCache.length) {
      wishesWall.innerHTML =
        '<p class="muted center">Sé el primero en dejar un deseo ✨</p>';
      return;
    }
    wishesWall.innerHTML = wishesCache
      .map((w) => {
        const when = w.created_at
          ? new Date(w.created_at).toLocaleDateString("es", {
              day: "numeric",
              month: "short",
            })
          : "";
        return `<article class="wish-card" data-id="${w.id}" tabindex="0" role="button" title="Ver detalles del equipo">
          <div class="who">${escapeHtml(w.name)}</div>
          <div class="msg">${escapeHtml(w.message)}</div>
          <div class="when">${when} · toca para detalles</div>
        </article>`;
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function flattenMeta(obj, prefix = "", out = []) {
    if (obj == null || obj === "") {
      if (prefix) out.push({ key: prefix, value: "—" });
      return out;
    }
    if (typeof obj !== "object") {
      out.push({ key: prefix, value: String(obj) });
      return out;
    }
    if (Array.isArray(obj)) {
      out.push({ key: prefix, value: obj.join(", ") || "—" });
      return out;
    }
    const keys = Object.keys(obj);
    if (!keys.length && prefix) {
      out.push({ key: prefix, value: "—" });
      return out;
    }
    keys.forEach((k) => {
      const path = prefix ? `${prefix}.${k}` : k;
      flattenMeta(obj[k], path, out);
    });
    return out;
  }

  function openWishModal(wish) {
    if (!wishModal || !wish) return;
    wishModalTitle.textContent = wish.name || "Deseo";
    wishModalMsg.textContent = wish.message || "";
    wishModalWhen.textContent = wish.created_at
      ? new Date(wish.created_at).toLocaleString("es", {
          dateStyle: "full",
          timeStyle: "medium",
        })
      : "";

    const meta = wish.meta || {};
    const rows = flattenMeta(meta);
    if (!rows.length) {
      wishModalMeta.innerHTML =
        '<p class="muted">No hay datos de equipo en este deseo (publicado antes de activar el registro).</p>';
    } else {
      const labels = {
        "server.ip": "IP",
        "server.userAgent": "User-Agent (servidor)",
        "server.acceptLanguage": "Accept-Language",
        "server.referer": "Referer",
        "server.receivedAt": "Recibido en servidor",
        "client.platform": "Plataforma",
        "client.userAgent": "User-Agent",
        "client.language": "Idioma",
        "client.timezone": "Zona horaria",
        "client.timezoneOffsetMin": "Offset TZ (min)",
        "client.hardwareConcurrency": "CPU (hilos)",
        "client.deviceMemory": "RAM (GB aprox.)",
        "client.maxTouchPoints": "Puntos táctiles",
        "client.screen.width": "Pantalla ancho",
        "client.screen.height": "Pantalla alto",
        "client.viewport.innerWidth": "Viewport ancho",
        "client.viewport.innerHeight": "Viewport alto",
        "client.viewport.devicePixelRatio": "Pixel ratio",
        "client.connection.effectiveType": "Red",
        "client.connection.downlink": "Downlink (Mb/s)",
        "client.uaData.platform": "UA platform",
        "client.uaData.mobile": "¿Móvil?",
        "client.touchSupport": "Soporta touch",
        "client.page.href": "URL",
        "client.localTime": "Hora local del equipo",
      };
      wishModalMeta.innerHTML = rows
        .map((r) => {
          const label = labels[r.key] || r.key;
          return `<div class="meta-row"><span class="meta-key">${escapeHtml(label)}</span><span class="meta-val">${escapeHtml(r.value)}</span></div>`;
        })
        .join("");
    }
    wishModal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeWishModal() {
    if (!wishModal) return;
    wishModal.hidden = true;
    document.body.style.overflow = "";
  }

  wishModalClose?.addEventListener("click", closeWishModal);
  wishModal?.addEventListener("click", (e) => {
    if (e.target === wishModal) closeWishModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeWishModal();
  });

  wishesWall?.addEventListener("click", (e) => {
    const card = e.target.closest(".wish-card");
    if (!card) return;
    const id = Number(card.dataset.id);
    const wish = wishesCache.find((w) => w.id === id);
    if (wish) openWishModal(wish);
  });
  wishesWall?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".wish-card");
    if (!card) return;
    e.preventDefault();
    const id = Number(card.dataset.id);
    const wish = wishesCache.find((w) => w.id === id);
    if (wish) openWishModal(wish);
  });

  async function loadWishes() {
    try {
      const res = await fetch("/api/wishes");
      const data = await res.json();
      renderWishes(data.wishes || []);
    } catch {
      wishesWall.innerHTML =
        '<p class="muted center">Los deseos aparecerán cuando el servidor esté listo.</p>';
    }
  }

  wishForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    wishStatus.textContent = "";
    wishStatus.className = "form-status";
    const name = document.getElementById("wishName").value;
    const message = document.getElementById("wishMsg").value;
    const pin = document.getElementById("wishPin").value;
    const device = collectDeviceInfo();

    try {
      const res = await fetch("/api/wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, message, pin, device }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      wishStatus.textContent = "¡Gracias por tu deseo! 💕";
      wishStatus.classList.add("ok");
      wishForm.reset();
      loadWishes();
    } catch (err) {
      wishStatus.textContent = err.message || "No se pudo publicar.";
      wishStatus.classList.add("err");
    }
  });

  loadWishes();

  // ——— Toggle corona (mostrar/ocultar PIN sin ojo del navegador)
  function bindPinToggle(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (!input || !btn) return;
    btn.addEventListener("click", () => {
      const show = !input.classList.contains("is-visible");
      input.classList.toggle("is-visible", show);
      btn.setAttribute("aria-pressed", show ? "true" : "false");
      btn.title = show ? "Ocultar" : "Mostrar";
    });
  }
  bindPinToggle("wishPin", "wishPinToggle");

  // ——— Reservas (formulario público)
  const reserveForm = document.getElementById("reserveForm");
  const reserveStatus = document.getElementById("reserveStatus");
  const reserveBtn = document.getElementById("reserveBtn");
  const resPhone = document.getElementById("resPhone");
  const resPueblo = document.getElementById("resPueblo");
  const reserveClosedBanner = document.getElementById("reserveClosedBanner");
  let reservationsClosed = false;

  function lockReserveForm(closed, message) {
    reservationsClosed = !!closed;
    if (!reserveForm) return;
    const fields = reserveForm.querySelectorAll("input, select, textarea, button");
    fields.forEach((el) => {
      if (el.id === "reserveStatus") return;
      el.disabled = !!closed;
    });
    const openHint = document.getElementById("reserveOpenHint");
    if (reserveClosedBanner) {
      if (closed) {
        reserveClosedBanner.hidden = false;
        reserveClosedBanner.textContent =
          message ||
          "Las reservas están cerradas. El evento es hoy o ya pasó. ¡Gracias por tu interés!";
        reserveClosedBanner.className = "form-status err";
        if (openHint) openHint.hidden = true;
      } else {
        reserveClosedBanner.hidden = true;
        reserveClosedBanner.textContent = "";
        reserveClosedBanner.className = "form-status";
        if (openHint) openHint.hidden = false;
      }
    }
    if (reserveBtn && closed) {
      reserveBtn.textContent = "Reservas cerradas";
    }
  }

  // Cierre el día del evento y después (según /api/event)
  fetch("/api/event")
    .then((r) => r.json())
    .then((data) => {
      if (data && data.reservationsClosed) {
        lockReserveForm(true, data.reservationsClosedMessage);
      }
    })
    .catch(() => {});

  // Llenar pueblos de PR
  if (resPueblo && window.PR_TOWNS) {
    window.PR_TOWNS.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = t.name;
      resPueblo.appendChild(opt);
    });
  }

  /** Formato teléfono PR/US: (787) 555-1234 */
  function formatPhoneInput(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) {
      return digits.length ? `(${digits}` : "";
    }
    if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  resPhone?.addEventListener("input", (e) => {
    const el = e.target;
    const start = el.selectionStart;
    const prev = el.value;
    el.value = formatPhoneInput(el.value);
    // intentar mantener el cursor al final al escribir
    if (el.value.length >= prev.length) {
      el.setSelectionRange(el.value.length, el.value.length);
    } else if (typeof start === "number") {
      el.setSelectionRange(start, start);
    }
  });

  resPhone?.addEventListener("blur", (e) => {
    e.target.value = formatPhoneInput(e.target.value);
  });

  reserveForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (reserveStatus) {
      reserveStatus.textContent = "";
      reserveStatus.className = "form-status";
    }
    if (reservationsClosed) {
      if (reserveStatus) {
        reserveStatus.textContent =
          "Las reservas están cerradas. El evento es hoy o ya pasó.";
        reserveStatus.className = "form-status err";
      }
      return;
    }
    const phoneVal = document.getElementById("resPhone")?.value || "";
    const phoneDigits = String(phoneVal).replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      if (reserveStatus) {
        reserveStatus.textContent =
          "El teléfono es obligatorio (mínimo 10 dígitos).";
        reserveStatus.className = "form-status err";
      }
      document.getElementById("resPhone")?.focus();
      return;
    }
    const body = {
      name: document.getElementById("resName")?.value,
      phone: phoneVal,
      email: document.getElementById("resEmail")?.value,
      pueblo: document.getElementById("resPueblo")?.value,
      guests: Number(document.getElementById("resGuests")?.value || 1),
      notes: document.getElementById("resNotes")?.value,
      device: typeof collectDeviceInfo === "function" ? collectDeviceInfo() : undefined,
    };
    if (reserveBtn) {
      reserveBtn.disabled = true;
      reserveBtn.textContent = "Enviando…";
    }
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.reservationsClosed) {
          lockReserveForm(true, data.error);
        }
        throw new Error(data.error || "Error");
      }
      if (reserveStatus) {
        reserveStatus.textContent =
          (data.message || "¡Reserva guardada!") + " Te llevamos al calendario…";
        reserveStatus.classList.add("ok");
      }
      reserveForm.reset();
      const g = document.getElementById("resGuests");
      if (g) g.value = "1";
      if (resPueblo) resPueblo.value = "";
      setTimeout(() => {
        const cal = document.getElementById("calendario");
        if (cal) {
          cal.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          window.location.hash = "calendario";
        }
      }, 2000);
    } catch (err) {
      if (reserveStatus) {
        reserveStatus.textContent = err.message || "No se pudo reservar.";
        reserveStatus.classList.add("err");
      }
    } finally {
      if (reserveBtn) {
        reserveBtn.disabled = false;
        reserveBtn.textContent = "Enviar reserva";
      }
    }
  });
})();
