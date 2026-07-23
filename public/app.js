/* Alahya XV — client */
(function () {
  const EVENT_FALLBACK = "2026-10-10T18:00:00-04:00";

  // ——— Particles
  const particlesEl = document.getElementById("particles");
  if (particlesEl && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const n = window.innerWidth < 600 ? 18 : 36;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("span");
      p.className = "particle";
      p.style.left = Math.random() * 100 + "%";
      p.style.width = p.style.height = 2 + Math.random() * 4 + "px";
      p.style.animationDuration = 8 + Math.random() * 14 + "s";
      p.style.animationDelay = Math.random() * 12 + "s";
      p.style.opacity = String(0.15 + Math.random() * 0.4);
      if (Math.random() > 0.5) p.style.background = "#f4c4d4";
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

  function tickCountdown() {
    const now = Date.now();
    const diff = eventDate.getTime() - now;
    const done = document.getElementById("countdownDone");
    const box = document.getElementById("countdown");

    if (diff <= 0) {
      if (box) box.hidden = true;
      if (done) done.hidden = false;
      return;
    }

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
      heroDate.textContent = `${eventDate.getDate()} de ${months[eventDate.getMonth()]} · ${eventDate.getFullYear()}`;
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
})();
