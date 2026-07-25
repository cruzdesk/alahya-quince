/* Alahya XV — client */
(function () {
  const EVENT_FALLBACK = "2026-10-10T17:00:00-04:00";

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
  bindPinToggle("adminHubKey", "adminHubKeyToggle");

  // ——— Admin unificado + impresión deseos
  const printWishesBtn = document.getElementById("printWishesBtn");
  const printStatus = document.getElementById("printStatus");
  const printIncludeMeta = document.getElementById("printIncludeMeta");

  function metaSummary(meta) {
    if (!meta || typeof meta !== "object") return "";
    const ip = meta.server && meta.server.ip ? meta.server.ip : "—";
    const platform =
      (meta.client && (meta.client.platform || (meta.client.uaData && meta.client.uaData.platform))) ||
      "—";
    const tz = (meta.client && meta.client.timezone) || "—";
    const ua = (meta.client && meta.client.userAgent) || (meta.server && meta.server.userAgent) || "—";
    const screen =
      meta.client && meta.client.screen
        ? `${meta.client.screen.width}×${meta.client.screen.height}`
        : "—";
    return `IP: ${ip} · Plataforma: ${platform} · TZ: ${tz} · Pantalla: ${screen}<br><span class="print-ua">${escapeHtml(
      String(ua).slice(0, 180)
    )}</span>`;
  }

  function openPrintDocument(data, includeMeta) {
    const wishes = data.wishes || [];
    const whenPrinted = new Date(data.printedAt || Date.now()).toLocaleString("es", {
      dateStyle: "full",
      timeStyle: "short",
    });
    const rows = wishes
      .map((w, i) => {
        const when = w.created_at
          ? new Date(w.created_at).toLocaleString("es", {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "";
        const metaBlock =
          includeMeta && w.meta
            ? `<div class="meta">${metaSummary(w.meta)}</div>`
            : includeMeta
              ? `<div class="meta muted">Sin datos de equipo</div>`
              : "";
        return `<article class="item">
          <div class="num">#${i + 1} · id ${w.id}</div>
          <div class="who">${escapeHtml(w.name)}</div>
          <div class="msg">${escapeHtml(w.message)}</div>
          <div class="when">${escapeHtml(when)}</div>
          ${metaBlock}
        </article>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Deseos — Alahya Thaís Saltares Ortega XV</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; color: #2a1f24; margin: 0; padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; color: #9b3d5a; }
    .sub { font-size: 12px; color: #5c4a52; margin-bottom: 6px; }
    .count { font-size: 13px; margin-bottom: 18px; }
    .item { border-bottom: 1px solid #e8d5a3; padding: 12px 0; page-break-inside: avoid; }
    .num { font-size: 10px; color: #a09098; letter-spacing: 0.06em; text-transform: uppercase; }
    .who { font-size: 16px; font-weight: bold; color: #c45c7a; margin: 2px 0; }
    .msg { font-size: 14px; line-height: 1.45; margin: 4px 0; }
    .when { font-size: 11px; color: #5c4a52; }
    .meta { font-size: 10px; color: #5c4a52; margin-top: 6px; line-height: 1.35; }
    .print-ua { word-break: break-all; opacity: 0.85; }
    .muted { opacity: 0.7; }
    @media print {
      body { padding: 12px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 14px;cursor:pointer">Imprimir / PDF</button>
  <h1>${escapeHtml(data.event || "Deseos XV Alahya")}</h1>
  <p class="sub">Listado de deseos del muro de cariño</p>
  <p class="count"><strong>${wishes.length}</strong> deseo(s) · Impreso: ${escapeHtml(whenPrinted)}</p>
  ${rows || "<p>No hay deseos todavía.</p>"}
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };<\/script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) {
      throw new Error("El navegador bloqueó la ventana de impresión. Permite pop-ups e intenta de nuevo.");
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  // ——— Reservas + hub admin
  const reserveForm = document.getElementById("reserveForm");
  const reserveStatus = document.getElementById("reserveStatus");
  const reserveBtn = document.getElementById("reserveBtn");
  const adminOpenBtn = document.getElementById("adminOpenBtn");
  const adminKeyModal = document.getElementById("adminKeyModal");
  const adminKeyClose = document.getElementById("adminKeyClose");
  const adminHubPanel = document.getElementById("adminHubPanel");
  const adminHubKey = document.getElementById("adminHubKey");
  const adminHubLoginBtn = document.getElementById("adminHubLoginBtn");
  const adminHubLoginStatus = document.getElementById("adminHubLoginStatus");
  const adminHubLogout = document.getElementById("adminHubLogout");
  const adminResStats = document.getElementById("adminResStats");
  const adminResList = document.getElementById("adminResList");
  const printResReportBtn = document.getElementById("printResReportBtn");
  const adminResRefreshBtn = document.getElementById("adminResRefreshBtn");
  let adminResKeySaved = "";

  function openAdminKeyModal() {
    if (!adminKeyModal) return;
    if (adminHubLoginStatus) {
      adminHubLoginStatus.textContent = "";
      adminHubLoginStatus.className = "form-status";
    }
    if (adminHubKey) {
      adminHubKey.value = "";
      adminHubKey.classList.remove("is-visible");
    }
    adminKeyModal.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => adminHubKey?.focus(), 50);
  }

  function closeAdminKeyModal() {
    if (!adminKeyModal) return;
    adminKeyModal.hidden = true;
    document.body.style.overflow = "";
  }

  reserveForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (reserveStatus) {
      reserveStatus.textContent = "";
      reserveStatus.className = "form-status";
    }
    const body = {
      name: document.getElementById("resName")?.value,
      phone: document.getElementById("resPhone")?.value,
      email: document.getElementById("resEmail")?.value,
      guests: Number(document.getElementById("resGuests")?.value || 1),
      notes: document.getElementById("resNotes")?.value,
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
      if (!res.ok) throw new Error(data.error || "Error");
      if (reserveStatus) {
        reserveStatus.textContent = data.message || "¡Reserva guardada!";
        reserveStatus.classList.add("ok");
      }
      reserveForm.reset();
      const g = document.getElementById("resGuests");
      if (g) g.value = "1";
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

  function renderAdminStats(stats) {
    if (!adminResStats || !stats) return;
    adminResStats.innerHTML = `
      <div class="admin-stat"><span class="n">${stats.total_guests ?? 0}</span><span class="l">Invitados (activos)</span></div>
      <div class="admin-stat"><span class="n">${stats.active_count ?? 0}</span><span class="l">Reservas activas</span></div>
      <div class="admin-stat"><span class="n">${stats.cancelled_count ?? 0}</span><span class="l">Canceladas</span></div>
      <div class="admin-stat"><span class="n">${stats.total_reservations ?? 0}</span><span class="l">Total registradas</span></div>
    `;
  }

  function renderAdminList(list) {
    if (!adminResList) return;
    if (!list.length) {
      adminResList.innerHTML = '<p class="muted center">No hay reservas todavía.</p>';
      return;
    }
    adminResList.innerHTML = list
      .map((r) => {
        const when = r.created_at
          ? new Date(r.created_at).toLocaleString("es", {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "";
        const cancelled = r.status === "cancelled";
        const badge = cancelled
          ? '<span class="badge no">Cancelada</span>'
          : '<span class="badge ok">Activa</span>';
        const contact = [r.phone, r.email].filter(Boolean).join(" · ") || "—";
        const notes = r.notes
          ? `<div class="meta-line">Notas: ${escapeHtml(r.notes)}</div>`
          : "";
        const cancelBtn = cancelled
          ? ""
          : `<button type="button" class="btn-danger-sm" data-cancel-id="${r.id}">Cancelar</button>`;
        return `<article class="admin-res-item${cancelled ? " cancelled" : ""}">
          <div>
            <div class="who">${escapeHtml(r.name)} ${badge}</div>
            <div class="meta-line"><strong>${r.guests}</strong> invitado(s) · ${escapeHtml(contact)}</div>
            <div class="meta-line">#${r.id} · ${escapeHtml(when)}</div>
            ${notes}
          </div>
          <div>${cancelBtn}</div>
        </article>`;
      })
      .join("");
  }

  async function loadAdminReservations() {
    if (!adminResKeySaved) return;
    try {
      const res = await fetch("/api/admin/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminResKeySaved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      renderAdminStats(data.stats);
      renderAdminList(data.reservations || []);
    } catch (err) {
      if (adminResList) {
        adminResList.innerHTML = `<p class="form-status err">${escapeHtml(err.message)}</p>`;
      }
      if (String(err.message || "").includes("incorrecta")) {
        adminResKeySaved = "";
        if (adminHubPanel) adminHubPanel.hidden = true;
        if (adminOpenBtn) adminOpenBtn.hidden = false;
      }
    }
  }

  function openReservationReport(data) {
    const s = data.stats || {};
    const list = data.reservations || [];
    const active = list.filter((r) => r.status === "active");
    const cancelled = list.filter((r) => r.status === "cancelled");
    const printed = new Date(data.printedAt || Date.now()).toLocaleString("es", {
      dateStyle: "full",
      timeStyle: "short",
    });

    const rows = (items) =>
      items
        .map(
          (r, i) => `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(r.name)}</td>
          <td class="c">${r.guests}</td>
          <td>${escapeHtml(r.phone || "—")}</td>
          <td>${escapeHtml(r.email || "—")}</td>
          <td>${escapeHtml(r.notes || "—")}</td>
          <td>${r.created_at ? new Date(r.created_at).toLocaleDateString("es") : "—"}</td>
        </tr>`
        )
        .join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte de reservas — Alahya XV</title>
  <style>
    @page { size: letter; margin: 0.7in; }
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; color: #1a1212; margin: 0; padding: 0; }
    .page { page-break-after: always; padding: 8px 4px 24px; }
    .page:last-child { page-break-after: auto; }
    h1 { font-size: 26px; color: #9b1c1c; margin: 0 0 4px; }
    h2 { font-size: 18px; color: #1a1212; margin: 1.2rem 0 0.5rem; border-bottom: 1px solid #d4af37; padding-bottom: 4px; }
    .sub { color: #5c4a48; font-size: 13px; margin: 0 0 4px; }
    .gold { color: #b8860b; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 22px 0; }
    .stat { border: 1px solid #d4af37; border-radius: 10px; padding: 16px; text-align: center; background: #faf6ee; }
    .stat .n { font-size: 36px; font-weight: bold; color: #9b1c1c; display: block; line-height: 1.1; }
    .stat .l { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #5c4a48; }
    .stat.big { grid-column: 1 / -1; background: linear-gradient(135deg, #faf6ee, #e8d5a3); }
    .stat.big .n { font-size: 48px; }
    .note { font-size: 12px; color: #5c4a48; margin-top: 18px; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    th, td { border: 1px solid #e0d4c4; padding: 6px 7px; text-align: left; vertical-align: top; }
    th { background: #1a1212; color: #f7efe3; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; }
    td.c { text-align: center; font-weight: bold; }
    tr:nth-child(even) td { background: #faf6ee; }
    .cancelled-title { color: #9b1c1c; }
    .no-print { margin: 12px 0 20px; }
    @media print { .no-print { display: none !important; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()">Imprimir / Guardar PDF</button>

  <!-- Página 1: Estadísticas -->
  <section class="page">
    <h1>${escapeHtml(data.event || "Reporte de reservas")}</h1>
    <p class="sub gold">${escapeHtml(data.theme || "Victorian Masquerade Ball")}</p>
    <p class="sub">${escapeHtml(data.venue || "")}</p>
    <p class="sub">Generado: ${escapeHtml(printed)}</p>

    <h2>Resumen ejecutivo</h2>
    <div class="stats">
      <div class="stat big">
        <span class="n">${s.total_guests ?? 0}</span>
        <span class="l">Total de invitados confirmados (reservas activas)</span>
      </div>
      <div class="stat">
        <span class="n">${s.active_count ?? 0}</span>
        <span class="l">Reservas activas</span>
      </div>
      <div class="stat">
        <span class="n">${s.cancelled_count ?? 0}</span>
        <span class="l">Reservas canceladas</span>
      </div>
      <div class="stat">
        <span class="n">${s.total_reservations ?? 0}</span>
        <span class="l">Total de registros</span>
      </div>
      <div class="stat">
        <span class="n">${s.avg_guests ? Number(s.avg_guests).toFixed(1) : "0"}</span>
        <span class="l">Promedio invitados / reserva activa</span>
      </div>
    </div>
    <p class="note">
      Este reporte es confidencial para la organización del evento.
      Las cifras de invitados incluyen solo reservas <strong>activas</strong> (no canceladas).
      Formal · color negro · Tres Palmas, Aguadilla · 5:00 p.m.
    </p>
  </section>

  <!-- Página 2+: Detalle -->
  <section class="page">
    <h1>Detalle de reservas activas</h1>
    <p class="sub">${active.length} reserva(s) · ${s.total_guests ?? 0} invitado(s)</p>
    <table>
      <thead>
        <tr>
          <th>#</th><th>Nombre</th><th>Inv.</th><th>Teléfono</th><th>Correo</th><th>Notas</th><th>Fecha</th>
        </tr>
      </thead>
      <tbody>
        ${rows(active) || '<tr><td colspan="7">Sin reservas activas</td></tr>'}
      </tbody>
    </table>

    ${
      cancelled.length
        ? `<h2 class="cancelled-title">Canceladas (${cancelled.length})</h2>
    <table>
      <thead>
        <tr>
          <th>#</th><th>Nombre</th><th>Inv.</th><th>Teléfono</th><th>Correo</th><th>Notas</th><th>Fecha</th>
        </tr>
      </thead>
      <tbody>${rows(cancelled)}</tbody>
    </table>`
        : ""
    }
  </section>

  <script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };<\/script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) throw new Error("Permite ventanas emergentes para imprimir el reporte.");
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  adminOpenBtn?.addEventListener("click", () => {
    if (adminResKeySaved && adminHubPanel) {
      adminHubPanel.hidden = false;
      adminOpenBtn.hidden = true;
      loadAdminReservations();
      return;
    }
    openAdminKeyModal();
  });

  adminKeyClose?.addEventListener("click", closeAdminKeyModal);
  adminKeyModal?.addEventListener("click", (e) => {
    if (e.target === adminKeyModal) closeAdminKeyModal();
  });
  adminHubKey?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") adminHubLoginBtn?.click();
  });

  adminHubLoginBtn?.addEventListener("click", async () => {
    const key = (adminHubKey?.value || "").trim();
    if (!key) {
      if (adminHubLoginStatus) {
        adminHubLoginStatus.textContent = "Escribe la contraseña.";
        adminHubLoginStatus.className = "form-status err";
      }
      return;
    }
    adminHubLoginBtn.disabled = true;
    try {
      const res = await fetch("/api/admin/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No autorizado");
      adminResKeySaved = key;
      closeAdminKeyModal();
      if (adminHubPanel) adminHubPanel.hidden = false;
      if (adminOpenBtn) adminOpenBtn.hidden = true;
      renderAdminStats(data.stats);
      renderAdminList(data.reservations || []);
    } catch (err) {
      if (adminHubLoginStatus) {
        adminHubLoginStatus.textContent = err.message || "Contraseña incorrecta.";
        adminHubLoginStatus.className = "form-status err";
      }
    } finally {
      adminHubLoginBtn.disabled = false;
    }
  });

  adminHubLogout?.addEventListener("click", () => {
    adminResKeySaved = "";
    if (adminHubKey) {
      adminHubKey.value = "";
      adminHubKey.classList.remove("is-visible");
    }
    if (adminHubPanel) adminHubPanel.hidden = true;
    if (adminOpenBtn) adminOpenBtn.hidden = false;
  });

  adminResRefreshBtn?.addEventListener("click", loadAdminReservations);

  printWishesBtn?.addEventListener("click", async () => {
    if (!adminResKeySaved) {
      if (printStatus) {
        printStatus.textContent = "Entra al panel admin primero.";
        printStatus.className = "form-status err";
      }
      return;
    }
    printWishesBtn.disabled = true;
    printWishesBtn.textContent = "Cargando…";
    try {
      const res = await fetch("/api/admin/print-wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminResKeySaved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No autorizado");
      openPrintDocument(data, !!(printIncludeMeta && printIncludeMeta.checked));
      if (printStatus) {
        printStatus.textContent = `Listo: ${data.total} deseo(s) para imprimir.`;
        printStatus.className = "form-status ok";
      }
    } catch (err) {
      if (printStatus) {
        printStatus.textContent = err.message || "Error al imprimir.";
        printStatus.className = "form-status err";
      }
    } finally {
      printWishesBtn.disabled = false;
      printWishesBtn.textContent = "🖨 Imprimir todos los deseos";
    }
  });

  adminResList?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-cancel-id]");
    if (!btn || !adminResKeySaved) return;
    const id = btn.getAttribute("data-cancel-id");
    if (!confirm("¿Cancelar esta reserva?")) return;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/admin/reservations/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminResKeySaved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      await loadAdminReservations();
    } catch (err) {
      alert(err.message || "No se pudo cancelar");
      btn.disabled = false;
    }
  });

  printResReportBtn?.addEventListener("click", async () => {
    if (!adminResKeySaved) return;
    printResReportBtn.disabled = true;
    printResReportBtn.textContent = "Generando…";
    try {
      const res = await fetch("/api/admin/print-reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminResKeySaved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      openReservationReport(data);
    } catch (err) {
      alert(err.message || "No se pudo imprimir");
    } finally {
      printResReportBtn.disabled = false;
      printResReportBtn.textContent = "🖨 Imprimir reporte profesional";
    }
  });
})();
