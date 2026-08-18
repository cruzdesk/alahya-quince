/* Admin panel — página aparte */
(function () {
  const KEY_STORAGE = "alahya_admin_key";
  const LAST_ACTIVE_STORAGE = "alahya_admin_last_active";
  /** Cierre de sesión por inactividad: 24 minutos */
  const IDLE_MS = 24 * 60 * 1000;
  const IDLE_CHECK_MS = 30 * 1000;

  const loginScreen = document.getElementById("loginScreen");
  const adminApp = document.getElementById("adminApp");
  const adminHubKey = document.getElementById("adminHubKey");
  const adminHubKeyToggle = document.getElementById("adminHubKeyToggle");
  const adminHubLoginBtn = document.getElementById("adminHubLoginBtn");
  const adminHubLoginStatus = document.getElementById("adminHubLoginStatus");
  const adminHubLogout = document.getElementById("adminHubLogout");
  const adminResStats2 = document.getElementById("adminResStats2");
  const adminResList = document.getElementById("adminResList");
  const printResReportBtn = document.getElementById("printResReportBtn");
  const printSeatingBtn = document.getElementById("printSeatingBtn");
  const adminResRefreshBtn = document.getElementById("adminResRefreshBtn");
  const resFilterMesa = document.getElementById("resFilterMesa");
  const adminSeatingSummary = document.getElementById("adminSeatingSummary");
  const mesaMapEl = document.getElementById("mesaMap");
  const mesaMapDetail = document.getElementById("mesaMapDetail");
  let selectedMesaMap = "";
  const printWishesBtn = document.getElementById("printWishesBtn");
  const printIncludeMeta = document.getElementById("printIncludeMeta");
  const printStatus = document.getElementById("printStatus");
  const adminViewTitle = document.getElementById("adminViewTitle");
  const adminMenuToggle = document.getElementById("adminMenuToggle");
  const adminSidebarBackdrop = document.getElementById("adminSidebarBackdrop");

  let adminKey = "";
  try {
    adminKey = sessionStorage.getItem(KEY_STORAGE) || "";
  } catch (_) {}
  let idleTimer = null;
  let idleWatch = null;
  let idleListenersBound = false;
  let byPuebloCache = [];
  let mapReservas = null;
  let mapLayers = { reservas: null };

  const titles = {
    reservas: "Reservas",
    deseos: "Deseos",
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Corona toggle
  if (adminHubKey && adminHubKeyToggle) {
    adminHubKeyToggle.addEventListener("click", () => {
      const show = !adminHubKey.classList.contains("is-visible");
      adminHubKey.classList.toggle("is-visible", show);
      adminHubKeyToggle.setAttribute("aria-pressed", show ? "true" : "false");
      adminHubKeyToggle.title = show ? "Ocultar" : "Mostrar";
    });
  }

  function touchActivity() {
    if (!adminKey) return;
    try {
      sessionStorage.setItem(LAST_ACTIVE_STORAGE, String(Date.now()));
    } catch (_) {}
    resetIdleTimer();
  }

  function clearIdleWatch() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (idleWatch) {
      clearInterval(idleWatch);
      idleWatch = null;
    }
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!adminKey) return;
    idleTimer = setTimeout(() => {
      logoutDueToIdle();
    }, IDLE_MS);
  }

  function logoutDueToIdle() {
    showLogin();
    if (adminHubLoginStatus) {
      adminHubLoginStatus.textContent =
        "Sesión cerrada por 24 minutos de inactividad. Vuelve a entrar.";
      adminHubLoginStatus.className = "form-status err";
    }
  }

  function isSessionExpired() {
    try {
      const last = Number(sessionStorage.getItem(LAST_ACTIVE_STORAGE) || 0);
      if (!last) return true;
      return Date.now() - last > IDLE_MS;
    } catch (_) {
      return false;
    }
  }

  function startIdleWatch() {
    clearIdleWatch();
    touchActivity();
    // Comprobar periódicamente (pestaña en segundo plano, etc.)
    idleWatch = setInterval(() => {
      if (!adminKey) return;
      if (isSessionExpired()) logoutDueToIdle();
    }, IDLE_CHECK_MS);

    if (!idleListenersBound) {
      idleListenersBound = true;
      const events = [
        "mousemove",
        "mousedown",
        "keydown",
        "scroll",
        "touchstart",
        "click",
        "wheel",
      ];
      events.forEach((ev) => {
        document.addEventListener(ev, touchActivity, { passive: true });
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && adminKey) {
          if (isSessionExpired()) logoutDueToIdle();
          else touchActivity();
        }
      });
    }
  }

  function showLogin() {
    adminKey = "";
    clearIdleWatch();
    try {
      sessionStorage.removeItem(KEY_STORAGE);
      sessionStorage.removeItem(LAST_ACTIVE_STORAGE);
    } catch (_) {}
    if (loginScreen) {
      loginScreen.hidden = false;
      loginScreen.style.display = "";
    }
    if (adminApp) {
      adminApp.hidden = true;
      adminApp.style.display = "none";
      adminApp.classList.remove("menu-open");
    }
    if (adminSidebarBackdrop) adminSidebarBackdrop.hidden = true;
  }

  function showApp() {
    if (loginScreen) {
      loginScreen.hidden = true;
      loginScreen.style.display = "none";
    }
    if (adminApp) {
      adminApp.hidden = false;
      adminApp.style.display = "grid";
    }
    startIdleWatch();
  }

  function setView(name) {
    document.querySelectorAll(".admin-view").forEach((el) => {
      el.hidden = el.getAttribute("data-view-panel") !== name;
      el.classList.toggle("is-active", el.getAttribute("data-view-panel") === name);
    });
    document.querySelectorAll(".admin-menu-item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-view") === name);
    });
    if (adminViewTitle) adminViewTitle.textContent = titles[name] || name;
    closeMobileMenu();
    if (name === "deseos" && adminKey) loadAdminWishes();
    if (name === "reservas" && adminKey) {
      loadAdminReservations().then(() => {
        setTimeout(() => {
          ensureMaps();
          renderTownMaps(byPuebloCache);
        }, 80);
      });
    }
  }

  function ensureMaps() {
    if (typeof L === "undefined") return;
    const prBounds = L.latLngBounds([17.85, -67.35], [18.55, -65.2]);

    function makeMap(elId) {
      const el = document.getElementById(elId);
      if (!el) return null;
      if (el._leaflet_id) {
        return mapReservas;
      }
      const map = L.map(elId, {
        scrollWheelZoom: false,
        maxBounds: prBounds.pad(0.15),
        minZoom: 8,
        maxZoom: 12,
      }).setView([18.22, -66.45], 8);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 18,
      }).addTo(map);
      return map;
    }

    if (!mapReservas && document.getElementById("prMap")) {
      mapReservas = makeMap("prMap");
      mapLayers.reservas = L.layerGroup().addTo(mapReservas);
    }
  }

  function showPuebloDetail(entry, detailElId) {
    const detail = document.getElementById(detailElId);
    if (!detail || !entry) return;
    detail.hidden = false;
    const list = (entry.reservations || [])
      .map(
        (r) =>
          `<div class="meta-line"><strong>${escapeHtml(r.name)}</strong> · ${r.guests} inv. · ${escapeHtml(
            [r.phone, r.email].filter(Boolean).join(" · ") || "—"
          )}</div>`
      )
      .join("");
    detail.innerHTML = `
      <h4>${escapeHtml(entry.pueblo)}</h4>
      <div class="pr-map-meta">${entry.count} reserva(s) · <strong>${entry.guests}</strong> invitado(s)</div>
      ${list || "<p class='muted'>Sin detalle</p>"}
    `;
  }

  function renderTownMaps(byPueblo) {
    byPuebloCache = byPueblo || [];
    ensureMaps();
    const towns = window.PR_TOWN_BY_NAME || {};

    function paint(map, layerGroup, detailId) {
      if (!map || !layerGroup) return;
      layerGroup.clearLayers();
      const points = [];
      byPuebloCache.forEach((entry) => {
        const info = towns[(entry.pueblo || "").toLowerCase()];
        if (!info) return;
        points.push([info.lat, info.lng]);
        const marker = L.circleMarker([info.lat, info.lng], {
          radius: Math.min(14, 7 + entry.count * 1.5),
          color: "#9b1c1c",
          fillColor: "#d4af37",
          fillOpacity: 0.9,
          weight: 2,
        });
        marker.bindPopup(
          `<strong>${escapeHtml(entry.pueblo)}</strong><br>${entry.count} reserva(s)<br>${entry.guests} invitado(s)<br><em>Clic para ver lista</em>`
        );
        marker.on("click", () => showPuebloDetail(entry, detailId));
        layerGroup.addLayer(marker);
      });
      if (points.length) {
        try {
          map.fitBounds(points, { padding: [28, 28], maxZoom: 10 });
        } catch (_) {}
      }
      setTimeout(() => map.invalidateSize(), 100);
    }

    paint(mapReservas, mapLayers.reservas, "prMapDetail");
  }

  function renderAdminWishes(list) {
    if (!adminWishesList) return;
    const wishes = list || [];
    const publicN = wishes.filter((w) => w.approved !== false).length;
    const hiddenN = wishes.length - publicN;
    if (adminWishesCount) {
      adminWishesCount.textContent = wishes.length
        ? `${wishes.length} deseo(s) · ${publicN} público(s) · ${hiddenN} oculto(s)`
        : "No hay deseos todavía.";
    }
    if (!wishes.length) {
      adminWishesList.innerHTML = '<p class="muted center">Aún no hay mensajes en el muro.</p>';
      return;
    }
    adminWishesList.innerHTML = wishes
      .map((w) => {
        const when = w.created_at
          ? new Date(w.created_at).toLocaleString("es", {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "";
        const isPublic = w.approved !== false;
        const badge = isPublic
          ? '<span class="badge ok">Público</span>'
          : '<span class="badge no">Oculto</span>';
        const meta = w.meta || {};
        const ip = meta.server && meta.server.ip ? meta.server.ip : "";
        const platform =
          (meta.client && (meta.client.platform || (meta.client.uaData && meta.client.uaData.platform))) ||
          "";
        const extra = [ip && `IP: ${ip}`, platform && `Plataforma: ${platform}`]
          .filter(Boolean)
          .join(" · ");
        const toggleLabel = isPublic ? "Ocultar del muro" : "Mostrar en muro";
        return `<article class="admin-res-item${isPublic ? "" : " cancelled"}">
          <div>
            <div class="who">${escapeHtml(w.name)} ${badge} <span class="badge ok">#${w.id}</span></div>
            <div class="meta-line" style="color:var(--ink);margin-top:0.35rem">${escapeHtml(w.message)}</div>
            <div class="meta-line">${escapeHtml(when)}</div>
            ${extra ? `<div class="meta-line">${escapeHtml(extra)}</div>` : ""}
          </div>
          <div class="admin-item-actions">
            <button type="button" class="btn-edit" data-wish-vis="${w.id}" data-approved="${isPublic ? "false" : "true"}">${toggleLabel}</button>
          </div>
        </article>`;
      })
      .join("");
  }

  async function loadAdminWishes() {
    if (!adminKey) return;
    if (adminWishesList) {
      adminWishesList.innerHTML = '<p class="muted center">Cargando deseos…</p>';
    }
    try {
      const res = await fetch("/api/admin/print-wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      renderAdminWishes(data.wishes || []);
    } catch (err) {
      if (adminWishesList) {
        adminWishesList.innerHTML = `<p class="form-status err">${escapeHtml(err.message)}</p>`;
      }
      if (adminWishesCount) adminWishesCount.textContent = "";
    }
  }

  function openMobileMenu() {
    if (adminApp) adminApp.classList.add("menu-open");
    if (adminSidebarBackdrop) adminSidebarBackdrop.hidden = false;
  }

  function closeMobileMenu() {
    if (adminApp) adminApp.classList.remove("menu-open");
    if (adminSidebarBackdrop) adminSidebarBackdrop.hidden = true;
  }

  adminMenuToggle?.addEventListener("click", () => {
    if (adminApp?.classList.contains("menu-open")) closeMobileMenu();
    else openMobileMenu();
  });
  adminSidebarBackdrop?.addEventListener("click", closeMobileMenu);

  document.querySelectorAll(".admin-menu-item").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.getAttribute("data-view")));
  });
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.getAttribute("data-goto")));
  });

  const adminWishesList = document.getElementById("adminWishesList");
  const adminWishesCount = document.getElementById("adminWishesCount");
  const adminWishesRefreshBtn = document.getElementById("adminWishesRefreshBtn");

  function renderStats(stats, target) {
    if (!target || !stats) return;
    target.innerHTML = `
      <div class="admin-stat"><span class="n">${stats.total_guests ?? 0}</span><span class="l">Invitados (activos)</span></div>
      <div class="admin-stat"><span class="n">${stats.active_count ?? 0}</span><span class="l">Reservas activas</span></div>
      <div class="admin-stat"><span class="n">${stats.cancelled_count ?? 0}</span><span class="l">Canceladas</span></div>
      <div class="admin-stat"><span class="n">${stats.total_reservations ?? 0}</span><span class="l">Total registradas</span></div>
    `;
  }

  let allReservations = [];

  const resFilterName = document.getElementById("resFilterName");
  const resFilterPueblo = document.getElementById("resFilterPueblo");
  const resFilterStatus = document.getElementById("resFilterStatus");
  const resFilterCount = document.getElementById("resFilterCount");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const editResModal = document.getElementById("editResModal");
  const editResForm = document.getElementById("editResForm");
  const editResClose = document.getElementById("editResClose");
  const editResStatusMsg = document.getElementById("editResStatusMsg");

  function fillPuebloSelects() {
    const towns = window.PR_TOWNS || [];
    const editSel = document.getElementById("editResPueblo");
    if (editSel && !editSel.options.length) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Sin pueblo";
      editSel.appendChild(empty);
      towns.forEach((t) => {
        const o = document.createElement("option");
        o.value = t.name;
        o.textContent = t.name;
        editSel.appendChild(o);
      });
    }
  }

  function populateFilterPueblos(list) {
    if (!resFilterPueblo) return;
    const current = resFilterPueblo.value;
    const set = new Set();
    (list || []).forEach((r) => {
      if (r.pueblo) set.add(r.pueblo);
    });
    const towns = Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
    resFilterPueblo.innerHTML = '<option value="">Todos los pueblos</option>';
    towns.forEach((p) => {
      const o = document.createElement("option");
      o.value = p;
      o.textContent = p;
      resFilterPueblo.appendChild(o);
    });
    if (current && towns.includes(current)) resFilterPueblo.value = current;
  }

  const MESA_MAX = 10;
  const MESA_ALAHYA = "Mesa de Alahya";
  const MESA_NUMBERS = Array.from({ length: 6 }, (_, i) => String(i + 1));

  function mesaLabel(m) {
    return String(m || "").trim();
  }

  function formatMesaDisplay(m) {
    const t = mesaLabel(m);
    if (!t) return "Sin mesa";
    if (t === MESA_ALAHYA) return MESA_ALAHYA;
    return `Mesa ${t}`;
  }

  function sortMesaKeys(keys) {
    return keys.sort((a, b) => {
      if (a === "__none__") return 1;
      if (b === "__none__") return -1;
      if (a === MESA_ALAHYA) return -1;
      if (b === MESA_ALAHYA) return 1;
      return String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
    });
  }

  /** Invitados de una reserva (siempre número) */
  function guestsOf(r) {
    const n = parseInt(r && r.guests, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  /**
   * Suma de invitados activos en una mesa.
   * excludeId: no cuenta esa reserva (para ver si “cabe” al mover/asignar).
   */
  function getMesaUsed(mesa, excludeId) {
    const key = mesaLabel(mesa);
    if (!key) return 0;
    let sum = 0;
    for (const r of allReservations) {
      if (r.status !== "active") continue;
      if (mesaLabel(r.mesa) !== key) continue;
      if (excludeId != null && String(r.id) === String(excludeId)) continue;
      sum += guestsOf(r);
    }
    return sum;
  }

  /**
   * ¿Cabe esta reserva en la mesa?
   * used = ocupados por OTROS; need = invitados de ESTA reserva.
   */
  function checkMesaCapacity(mesa, guests, excludeId) {
    const key = mesaLabel(mesa);
    if (!key) return { ok: true, used: 0, free: MESA_MAX, need: 0 };
    const usedOthers = getMesaUsed(key, excludeId);
    const need = Math.min(Math.max(parseInt(guests, 10) || 1, 1), 20);
    const free = Math.max(0, MESA_MAX - usedOthers);
    if (usedOthers + need > MESA_MAX) {
      return {
        ok: false,
        used: usedOthers,
        free,
        need,
        message:
          free === 0
            ? `La mesa «${formatMesaDisplay(key)}» ya está llena (máximo ${MESA_MAX} asientos). Elige otra mesa.`
            : `La mesa «${formatMesaDisplay(key)}» no tiene cupo. Ocupados por otros: ${usedOthers}/${MESA_MAX}, libres: ${free}. Esta reserva pide ${need} invitado(s).`,
      };
    }
    return { ok: true, used: usedOthers, free, need };
  }

  /**
   * Opciones del combo: Sin mesa + Mesa de Alahya + 1–6.
   * Muestra ocupados REALES (incluye esta reserva si ya está en esa mesa)
   * y libera restando el campo invitados al decidir si cabe.
   */
  function buildMesaSelectOptions(selected, excludeId, guests) {
    const sel = mesaLabel(selected);
    const need = Math.min(Math.max(parseInt(guests, 10) || 1, 1), 20);
    const opts = [`<option value="">Sin mesa</option>`];

    const addOpt = (value, labelBase) => {
      const usedOthers = getMesaUsed(value, excludeId);
      // Total real en la mesa: otros + esta reserva si ya está asignada ahí
      const usedTotal = usedOthers + (sel === value ? need : 0);
      const freeDisplay = Math.max(0, MESA_MAX - usedTotal);
      // Cupo para asignar/quedarse: solo cuenta a los demás; esta reserva “gasta” `need`
      const freeForAssign = Math.max(0, MESA_MAX - usedOthers);
      const isSel = sel === value;
      const full = freeForAssign < need;
      // Si ya está en esta mesa y cabe con su cupo actual, no la deshabilites
      const disable = full && !isSel;
      const label = `${labelBase} · ${usedTotal}/${MESA_MAX} · ${freeDisplay} libre(s)${
        full && !isSel ? " · LLENA" : ""
      }`;
      opts.push(
        `<option value="${escapeHtml(value)}"${isSel ? " selected" : ""}${
          disable ? " disabled" : ""
        }>${escapeHtml(label)}</option>`
      );
    };

    addOpt(MESA_ALAHYA, MESA_ALAHYA);
    MESA_NUMBERS.forEach((n) => addOpt(n, `Mesa ${n}`));
    return opts.join("");
  }

  function fillEditMesaSelect(selected, excludeId, guests) {
    const el = document.getElementById("editResMesa");
    if (!el) return;
    el.innerHTML = buildMesaSelectOptions(selected, excludeId, guests);
  }

  function groupActiveByMesa(list) {
    const map = new Map();
    (list || [])
      .filter((r) => r.status === "active")
      .forEach((r) => {
        const key = mesaLabel(r.mesa) || "__none__";
        if (!map.has(key)) {
          map.set(key, {
            mesa: key === "__none__" ? "Sin mesa" : key,
            reservations: [],
            guests: 0,
          });
        }
        const g = map.get(key);
        g.reservations.push(r);
        g.guests += guestsOf(r);
      });
    return sortMesaKeys([...map.keys()]).map((k) => map.get(k));
  }

  function populateFilterMesas(list) {
    if (!resFilterMesa) return;
    const set = new Set();
    (list || []).forEach((r) => {
      const m = mesaLabel(r.mesa);
      if (m) set.add(m);
    });
    const current = resFilterMesa.value;
    resFilterMesa.innerHTML =
      '<option value="">Todas las mesas</option><option value="__none__">Sin mesa</option>';
    // Siempre incluir Mesa de Alahya y 1–6 en el filtro
    const allKeys = new Set([MESA_ALAHYA, ...MESA_NUMBERS, ...set]);
    sortMesaKeys([...allKeys]).forEach((m) => {
      const used = getMesaUsed(m);
      const o = document.createElement("option");
      o.value = m;
      o.textContent = `${formatMesaDisplay(m)} (${used}/${MESA_MAX})`;
      resFilterMesa.appendChild(o);
    });
    if (current) resFilterMesa.value = current;
  }

  function renderSeatingSummary(list) {
    if (!adminSeatingSummary) return;
    const groups = groupActiveByMesa(list || allReservations);
    if (!groups.length) {
      adminSeatingSummary.hidden = true;
      adminSeatingSummary.innerHTML = "";
      return;
    }
    adminSeatingSummary.hidden = false;
    adminSeatingSummary.innerHTML = groups
      .map((g) => {
        const none = g.mesa === "Sin mesa";
        const free = none ? "—" : Math.max(0, MESA_MAX - g.guests);
        const full = !none && g.guests >= MESA_MAX;
        return `<span class="admin-mesa-chip${none ? " is-none" : ""}${full ? " is-full" : ""}">
          ${none ? "Sin mesa" : `<strong>${escapeHtml(formatMesaDisplay(g.mesa))}</strong>`}
          · ${g.guests}${none ? " inv." : `/${MESA_MAX} · ${free} libre(s)`}
        </span>`;
      })
      .join("");
  }

  function mesaFillClass(used) {
    if (used <= 0) return "is-empty";
    if (used >= MESA_MAX) return "is-full";
    if (used >= 8) return "is-high";
    if (used >= 5) return "is-mid";
    return "is-low";
  }

  function getMesaGuestsList(mesaKey) {
    const key = mesaLabel(mesaKey);
    return allReservations
      .filter((r) => r.status === "active" && mesaLabel(r.mesa) === key)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
  }

  function showMesaMapDetail(mesaKey) {
    if (!mesaMapDetail) return;
    const key = mesaLabel(mesaKey);
    if (!key) {
      mesaMapDetail.hidden = true;
      mesaMapDetail.innerHTML = "";
      return;
    }
    const used = getMesaUsed(key);
    const free = Math.max(0, MESA_MAX - used);
    const people = getMesaGuestsList(key);
    const rows = people
      .map(
        (r) =>
          `<div class="meta-line"><strong>${escapeHtml(r.name)}</strong> · ${guestsOf(
            r
          )} inv. · ${escapeHtml(r.pueblo || "—")} · ${escapeHtml(r.phone || "—")}</div>`
      )
      .join("");
    mesaMapDetail.hidden = false;
    mesaMapDetail.innerHTML = `
      <h4>${escapeHtml(formatMesaDisplay(key))}</h4>
      <div class="mesa-map-meta">${used}/${MESA_MAX} asientos · ${free} libre(s) · ${
      people.length
    } reserva(s)${used >= MESA_MAX ? " · <strong>LLENA</strong>" : ""}</div>
      ${rows || "<p class='muted'>Nadie asignado aún.</p>"}
      <div class="mesa-map-actions">
        <button type="button" data-mesa-filter="${escapeHtml(key)}">Filtrar lista</button>
        <button type="button" data-mesa-clear-filter>Quitar filtro</button>
      </div>
    `;
  }

  function renderMesaMap() {
    if (!mesaMapEl) return;
    const vipUsed = getMesaUsed(MESA_ALAHYA);
    const vipCls = mesaFillClass(vipUsed);
    const vipSel = selectedMesaMap === MESA_ALAHYA ? " is-selected" : "";

    let html = `<div class="mesa-map-vip-wrap">
      <button type="button" class="mesa-dot is-vip ${vipCls}${vipSel}" data-mesa-dot="${escapeHtml(
      MESA_ALAHYA
    )}" title="${escapeHtml(MESA_ALAHYA)}: ${vipUsed}/${MESA_MAX}">
        <span class="mesa-dot-n">♛ Alahya</span>
        <span class="mesa-dot-g">${vipUsed}/${MESA_MAX}</span>
      </button>
    </div>`;

    html += MESA_NUMBERS.map((n) => {
      const used = getMesaUsed(n);
      const cls = mesaFillClass(used);
      const sel = selectedMesaMap === n ? " is-selected" : "";
      return `<button type="button" class="mesa-dot ${cls}${sel}" data-mesa-dot="${n}" title="Mesa ${n}: ${used}/${MESA_MAX}">
        <span class="mesa-dot-n">${n}</span>
        <span class="mesa-dot-g">${used}/${MESA_MAX}</span>
      </button>`;
    }).join("");

    mesaMapEl.innerHTML = html;

    if (selectedMesaMap) showMesaMapDetail(selectedMesaMap);
    else if (mesaMapDetail) {
      mesaMapDetail.hidden = true;
      mesaMapDetail.innerHTML = "";
    }
  }

  function phoneToWa(phone) {
    let d = String(phone || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.length === 10) d = "1" + d;
    return d;
  }

  function waLink(r) {
    const num = phoneToWa(r.phone);
    if (!num) return "";
    const mesaTxt = mesaLabel(r.mesa)
      ? `🪑 Tu mesa: ${formatMesaDisplay(r.mesa)}`
      : "🪑 Mesa: por asignar (te avisamos pronto)";
    const text = [
      `Hola ${r.name || ""},`,
      "",
      "Te recordamos los XV de Alahya Thaís Saltares Ortega:",
      "📅 10 de octubre de 2026 · 5:00 p.m.",
      "📍 Tres Palmas, Aguadilla",
      "🎭 Victorian Masquerade Ball",
      mesaTxt,
      "",
      "Invitación: https://alahya-quince.onrender.com",
      "",
      "¡Te esperamos!",
    ].join("\n");
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  }

  /** Filtros smart activos: active | no_mesa | no_wa | no_phone */
  const smartFilters = new Set();

  function hasPhone(r) {
    return String(r.phone || "").replace(/\D/g, "").length >= 10;
  }

  function hasWaSent(r) {
    return (parseInt(r.wa_sent_count, 10) || 0) > 0;
  }

  function getFilteredReservations() {
    const q = (resFilterName?.value || "").trim().toLowerCase();
    const pueblo = resFilterPueblo?.value || "";
    const status = resFilterStatus?.value || "";
    const mesaF = resFilterMesa?.value || "";
    return allReservations.filter((r) => {
      if (q) {
        const name = (r.name || "").toLowerCase();
        const phone = String(r.phone || "").replace(/\D/g, "");
        const qDigits = q.replace(/\D/g, "");
        if (!name.includes(q) && !(qDigits && phone.includes(qDigits))) return false;
      }
      if (pueblo && r.pueblo !== pueblo) return false;
      if (status && r.status !== status) return false;
      if (mesaF === "__none__" && mesaLabel(r.mesa)) return false;
      if (mesaF && mesaF !== "__none__" && mesaLabel(r.mesa) !== mesaF) return false;
      // Filtros smart (se pueden combinar)
      if (smartFilters.has("active") && r.status !== "active") return false;
      if (smartFilters.has("no_mesa") && mesaLabel(r.mesa)) return false;
      if (smartFilters.has("no_wa") && hasWaSent(r)) return false;
      if (smartFilters.has("no_phone") && hasPhone(r)) return false;
      return true;
    });
  }

  function syncSmartChipUi() {
    document.querySelectorAll("#resSmartFilters .smart-chip[data-smart]").forEach((btn) => {
      const key = btn.getAttribute("data-smart");
      btn.classList.toggle("is-on", smartFilters.has(key));
    });
  }

  function updateSmartFilterCounts() {
    const base = allReservations;
    const counts = {
      active: base.filter((r) => r.status === "active").length,
      no_mesa: base.filter((r) => r.status === "active" && !mesaLabel(r.mesa)).length,
      no_wa: base.filter((r) => r.status === "active" && !hasWaSent(r)).length,
      no_phone: base.filter((r) => r.status === "active" && !hasPhone(r)).length,
    };
    document.querySelectorAll("#resSmartFilters .smart-chip[data-smart]").forEach((btn) => {
      const key = btn.getAttribute("data-smart");
      const labels = {
        active: "Activas",
        no_mesa: "Sin mesa",
        no_wa: "Sin WhatsApp",
        no_phone: "Sin teléfono",
      };
      const n = counts[key];
      if (labels[key] != null && n != null) {
        btn.textContent = `${labels[key]} (${n})`;
      }
    });
    syncSmartChipUi();
  }

  document.getElementById("resSmartFilters")?.addEventListener("click", (e) => {
    const clear = e.target.closest("[data-smart-clear]");
    if (clear) {
      smartFilters.clear();
      syncSmartChipUi();
      applyFilters();
      return;
    }
    const chip = e.target.closest(".smart-chip[data-smart]");
    if (!chip) return;
    const key = chip.getAttribute("data-smart");
    if (!key) return;
    if (smartFilters.has(key)) smartFilters.delete(key);
    else smartFilters.add(key);
    // Si activas smart "activas", alinear el select de estado
    if (key === "active" && smartFilters.has("active") && resFilterStatus) {
      resFilterStatus.value = "active";
    }
    if (key === "no_mesa" && smartFilters.has("no_mesa") && resFilterMesa) {
      resFilterMesa.value = "__none__";
      selectedMesaMap = "";
    }
    if (key === "no_mesa" && !smartFilters.has("no_mesa") && resFilterMesa?.value === "__none__") {
      resFilterMesa.value = "";
    }
    syncSmartChipUi();
    applyFilters();
    renderMesaMap();
  });

  function renderAdminList(list) {
    if (Array.isArray(list)) {
      allReservations = list;
      populateFilterPueblos(list);
      populateFilterMesas(list);
      renderSeatingSummary(list);
      renderMesaMap();
      updateSmartFilterCounts();
    }
    if (!adminResList) return;
    const filtered = getFilteredReservations();
    if (resFilterCount) {
      const smartOn = [...smartFilters];
      const smartTxt = smartOn.length
        ? ` · smart: ${smartOn
            .map((k) =>
              ({ active: "activas", no_mesa: "sin mesa", no_wa: "sin WA", no_phone: "sin tel" }[k] || k)
            )
            .join(" + ")}`
        : "";
      resFilterCount.textContent = filtered.length
        ? `Mostrando ${filtered.length} de ${allReservations.length}${smartTxt}`
        : allReservations.length
          ? "Ninguna reserva coincide con el filtro."
          : "No hay reservas todavía.";
    }
    if (!filtered.length) {
      adminResList.innerHTML =
        '<p class="muted center">' +
        (allReservations.length ? "Sin resultados." : "No hay reservas todavía.") +
        "</p>";
      return;
    }
    adminResList.innerHTML = filtered
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
        const m = mesaLabel(r.mesa);
        const mesaBadge = m
          ? `<span class="mesa-badge">${escapeHtml(formatMesaDisplay(m))}</span>`
          : `<span class="mesa-badge is-empty">Sin mesa</span>`;
        const contact = [r.phone, r.email].filter(Boolean).join(" · ") || "—";
        const pueblo = r.pueblo ? escapeHtml(r.pueblo) : "Sin pueblo";
        const notes = r.notes
          ? `<div class="meta-line">Notas: ${escapeHtml(r.notes)}</div>`
          : "";
        const wa = waLink(r);
        const waCount = Math.max(0, parseInt(r.wa_sent_count, 10) || 0);
        const waSent = waCount > 0;
        const waWhen = r.wa_sent_at
          ? new Date(r.wa_sent_at).toLocaleString("es", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "";
        const waMark = waSent
          ? `<span class="wa-sent-mark" title="WhatsApp enviado ${waCount} vez/veces${
              waWhen ? " · última: " + waWhen : ""
            }" aria-label="WhatsApp enviado ${waCount} veces">✓ ${waCount}</span>`
          : `<span class="wa-sent-mark is-pending" title="Aún no se ha abierto WhatsApp">—</span>`;
        const waBtn = wa
          ? `<a class="wa${waSent ? " is-sent" : ""}" href="${wa}" target="_blank" rel="noopener noreferrer" data-wa-id="${r.id}">
              ${waSent ? "✓ WhatsApp" : "WhatsApp"}
              <span class="wa-count" data-wa-count="${r.id}">#${waCount}</span>
            </a>`
          : `<a class="wa is-disabled" href="#" tabindex="-1">Sin teléfono</a>`;
        const cancelBtn = cancelled
          ? ""
          : `<button type="button" class="btn-danger-sm" data-cancel-id="${r.id}">Cancelar</button>`;
        const gCount = guestsOf(r);
        const mesaQuick = cancelled
          ? ""
          : `<div class="admin-mesa-quick">
              <select data-mesa-input="${r.id}" data-mesa-guests="${gCount}" aria-label="Asignar mesa">
                ${buildMesaSelectOptions(m, r.id, gCount)}
              </select>
              <button type="button" data-mesa-save="${r.id}">Guardar</button>
            </div>`;
        return `<article class="admin-res-item${cancelled ? " cancelled" : ""}${
          waSent ? " has-wa-sent" : ""
        }" data-res-id="${r.id}">
          <div>
            <div class="who">${escapeHtml(r.name)} ${badge} ${mesaBadge} ${waMark}</div>
            <div class="meta-line">📍 ${pueblo} · <strong>${gCount}</strong> invitado(s)</div>
            <div class="meta-line">${escapeHtml(contact)}</div>
            <div class="meta-line">#${r.id} · ${escapeHtml(when)}${
          r.ip
            ? ` · IP <code class="admin-ip">${escapeHtml(String(r.ip))}</code>`
            : " · IP —"
        }${
          waSent
            ? ` · <span class="wa-meta">WA ×${waCount}${waWhen ? " · " + escapeHtml(waWhen) : ""}</span>`
            : ""
        }</div>
            ${notes}
            ${mesaQuick}
          </div>
          <div class="admin-item-actions">
            ${waBtn}
            <button type="button" class="btn-edit" data-edit-id="${r.id}">Editar</button>
            ${cancelBtn}
          </div>
        </article>`;
      })
      .join("");
  }

  function applyFilters() {
    renderAdminList();
  }

  resFilterName?.addEventListener("input", applyFilters);
  resFilterPueblo?.addEventListener("change", applyFilters);
  resFilterStatus?.addEventListener("change", applyFilters);
  resFilterMesa?.addEventListener("change", () => {
    selectedMesaMap = resFilterMesa.value === "__none__" ? "" : resFilterMesa.value || "";
    applyFilters();
    renderMesaMap();
  });

  mesaMapEl?.addEventListener("click", (e) => {
    const dot = e.target.closest("[data-mesa-dot]");
    if (!dot) return;
    const key = dot.getAttribute("data-mesa-dot") || "";
    selectedMesaMap = selectedMesaMap === key ? "" : key;
    if (resFilterMesa) {
      resFilterMesa.value = selectedMesaMap || "";
    }
    applyFilters();
    renderMesaMap();
    showMesaMapDetail(selectedMesaMap);
  });

  mesaMapDetail?.addEventListener("click", (e) => {
    const filterBtn = e.target.closest("[data-mesa-filter]");
    if (filterBtn) {
      const key = filterBtn.getAttribute("data-mesa-filter") || "";
      selectedMesaMap = key;
      if (resFilterMesa) resFilterMesa.value = key;
      applyFilters();
      renderMesaMap();
      document.getElementById("adminResList")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (e.target.closest("[data-mesa-clear-filter]")) {
      selectedMesaMap = "";
      if (resFilterMesa) resFilterMesa.value = "";
      applyFilters();
      renderMesaMap();
    }
  });

  function exportReservationsCsv() {
    const list = getFilteredReservations();
    if (!list.length) {
      alert("No hay reservas para exportar con el filtro actual.");
      return;
    }
    const headers = [
      "id",
      "nombre",
      "pueblo",
      "mesa",
      "invitados",
      "telefono",
      "correo",
      "notas",
      "estado",
      "creada",
      "cancelada",
    ];
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [headers.join(",")];
    list.forEach((r) => {
      lines.push(
        [
          r.id,
          r.name,
          r.pueblo,
          r.mesa || "",
          r.guests,
          r.phone,
          r.email,
          r.notes,
          r.status,
          r.created_at,
          r.cancelled_at,
        ]
          .map(esc)
          .join(",")
      );
    });
    // BOM para Excel
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reservas-alahya-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportCsvBtn?.addEventListener("click", exportReservationsCsv);

  function openEditReservation(id) {
    fillPuebloSelects();
    const r = allReservations.find((x) => String(x.id) === String(id));
    if (!r || !editResModal) return;
    document.getElementById("editResId").value = r.id;
    document.getElementById("editResName").value = r.name || "";
    document.getElementById("editResPhone").value = r.phone || "";
    document.getElementById("editResEmail").value = r.email || "";
    document.getElementById("editResGuests").value = guestsOf(r);
    fillEditMesaSelect(r.mesa || "", r.id, guestsOf(r));
    document.getElementById("editResNotes").value = r.notes || "";
    document.getElementById("editResStatus").value = r.status || "active";
    const puebloSel = document.getElementById("editResPueblo");
    if (puebloSel) puebloSel.value = r.pueblo || "";
    if (editResStatusMsg) {
      editResStatusMsg.textContent = "";
      editResStatusMsg.className = "form-status";
    }
    editResModal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  // Al cambiar invitados en el modal, refrescar cupos del combo de mesas
  document.getElementById("editResGuests")?.addEventListener("input", () => {
    const el = document.getElementById("editResGuests");
    if (el) {
      const raw = String(el.value ?? "").trim();
      if (raw !== "") {
        let n = parseInt(raw, 10);
        if (Number.isFinite(n) && n < 1) el.value = "1";
        if (Number.isFinite(n) && n > 20) el.value = "20";
      }
    }
    const id = document.getElementById("editResId")?.value;
    const guests = Math.min(Math.max(parseInt(el?.value ?? "1", 10) || 1, 1), 20);
    const mesa = document.getElementById("editResMesa")?.value || "";
    fillEditMesaSelect(mesa, id, guests);
  });
  document.getElementById("editResGuests")?.addEventListener("blur", () => {
    const el = document.getElementById("editResGuests");
    if (!el) return;
    let n = parseInt(String(el.value ?? ""), 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > 20) n = 20;
    el.value = String(n);
  });

  function closeEditReservation() {
    if (!editResModal) return;
    editResModal.hidden = true;
    document.body.style.overflow = "";
  }

  editResClose?.addEventListener("click", closeEditReservation);
  editResModal?.addEventListener("click", (e) => {
    if (e.target === editResModal) closeEditReservation();
  });

  editResForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!adminKey) return;
    const id = document.getElementById("editResId").value;
    const guestsEl = document.getElementById("editResGuests");
    let guests = parseInt(String(guestsEl?.value ?? "1"), 10);
    if (!Number.isFinite(guests) || guests < 1) {
      if (guestsEl) guestsEl.value = "1";
      alert("La cantidad de invitados debe ser al menos 1.");
      if (editResStatusMsg) {
        editResStatusMsg.textContent = "La cantidad de invitados debe ser al menos 1.";
        editResStatusMsg.className = "form-status err";
      }
      guestsEl?.focus();
      return;
    }
    if (guests > 20) {
      guests = 20;
      if (guestsEl) guestsEl.value = "20";
    }
    const mesa = (document.getElementById("editResMesa")?.value || "").trim();
    const status = document.getElementById("editResStatus").value;
    if (status === "active" && mesa) {
      const cap = checkMesaCapacity(mesa, guests, id);
      if (!cap.ok) {
        alert(cap.message);
        if (editResStatusMsg) {
          editResStatusMsg.textContent = cap.message;
          editResStatusMsg.className = "form-status err";
        }
        return;
      }
    }
    const body = {
      key: adminKey,
      name: document.getElementById("editResName").value,
      phone: document.getElementById("editResPhone").value,
      email: document.getElementById("editResEmail").value,
      pueblo: document.getElementById("editResPueblo").value,
      guests,
      mesa,
      notes: document.getElementById("editResNotes").value,
      status,
    };
    const saveBtn = document.getElementById("editResSave");
    if (saveBtn) saveBtn.disabled = true;
    try {
      const res = await fetch(`/api/admin/reservations/${id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      if (editResStatusMsg) {
        editResStatusMsg.textContent = "Guardado.";
        editResStatusMsg.className = "form-status ok";
      }
      await loadAdminReservations();
      setTimeout(closeEditReservation, 400);
    } catch (err) {
      if (editResStatusMsg) {
        editResStatusMsg.textContent = err.message || "No se pudo guardar.";
        editResStatusMsg.className = "form-status err";
      }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  async function loadAdminReservations() {
    if (!adminKey) return;
    try {
      const res = await fetch("/api/admin/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      renderStats(data.stats, adminResStats2);
      renderAdminList(data.reservations || []);
      renderTownMaps(data.byPueblo || []);
      return true;
    } catch (err) {
      if (adminResList) {
        adminResList.innerHTML = `<p class="form-status err">${escapeHtml(err.message)}</p>`;
      }
      if (String(err.message || "").toLowerCase().includes("incorrecta") || String(err.message || "").toLowerCase().includes("autorizado")) {
        showLogin();
      }
      return false;
    }
  }

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
<html lang="es"><head><meta charset="UTF-8" /><title>Deseos — Alahya XV</title>
<style>
*{box-sizing:border-box}body{font-family:Georgia,serif;color:#2a1f24;margin:0;padding:24px}
h1{font-size:22px;margin:0 0 4px;color:#9b1c1c}.sub{font-size:12px;color:#5c4a52;margin-bottom:6px}
.count{font-size:13px;margin-bottom:18px}.item{border-bottom:1px solid #e8d5a3;padding:12px 0;page-break-inside:avoid}
.num{font-size:10px;color:#a09098}.who{font-size:16px;font-weight:bold;color:#9b1c1c;margin:2px 0}
.msg{font-size:14px;line-height:1.45;margin:4px 0}.when{font-size:11px;color:#5c4a52}
.meta{font-size:10px;color:#5c4a52;margin-top:6px}.print-ua{word-break:break-all;opacity:.85}
@media print{body{padding:12px}.no-print{display:none!important}}
</style></head><body>
<button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 14px;cursor:pointer">Imprimir / PDF</button>
<h1>${escapeHtml(data.event || "Deseos XV Alahya")}</h1>
<p class="sub">Listado de deseos del muro de cariño</p>
<p class="count"><strong>${wishes.length}</strong> deseo(s) · Impreso: ${escapeHtml(whenPrinted)}</p>
${rows || "<p>No hay deseos todavía.</p>"}
<script>window.onload=function(){setTimeout(function(){window.print()},300)};<\/script>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) throw new Error("Permite ventanas emergentes para imprimir.");
    win.document.open();
    win.document.write(html);
    win.document.close();
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
    const byPueblo = data.byPueblo || [];
    const puebloRows = byPueblo
      .map(
        (p, i) =>
          `<tr><td>${i + 1}</td><td>${escapeHtml(p.pueblo)}</td><td class="c">${p.count}</td><td class="c">${p.guests}</td></tr>`
      )
      .join("");

    const rows = (items) =>
      items
        .map(
          (r, i) => `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.pueblo || "—")}</td>
          <td class="c">${escapeHtml(r.mesa || "—")}</td>
          <td class="c">${r.guests}</td>
          <td>${escapeHtml(r.phone || "—")}</td>
          <td>${escapeHtml(r.email || "—")}</td>
          <td>${escapeHtml(r.notes || "—")}</td>
          <td>${r.created_at ? new Date(r.created_at).toLocaleDateString("es") : "—"}</td>
        </tr>`
        )
        .join("");

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8" /><title>Reporte de reservas — Alahya XV</title>
<style>
@page{size:letter;margin:.7in}*{box-sizing:border-box}
body{font-family:Georgia,serif;color:#1a1212;margin:0;padding:0}
.page{page-break-after:always;padding:8px 4px 24px}.page:last-child{page-break-after:auto}
h1{font-size:26px;color:#9b1c1c;margin:0 0 4px}h2{font-size:18px;margin:1.2rem 0 .5rem;border-bottom:1px solid #d4af37;padding-bottom:4px}
.sub{color:#5c4a48;font-size:13px;margin:0 0 4px}.gold{color:#b8860b}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:22px 0}
.stat{border:1px solid #d4af37;border-radius:10px;padding:16px;text-align:center;background:#faf6ee}
.stat .n{font-size:36px;font-weight:bold;color:#9b1c1c;display:block}.stat .l{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#5c4a48}
.stat.big{grid-column:1/-1;background:linear-gradient(135deg,#faf6ee,#e8d5a3)}.stat.big .n{font-size:48px}
.note{font-size:12px;color:#5c4a48;margin-top:18px;line-height:1.45}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
th,td{border:1px solid #e0d4c4;padding:6px 7px;text-align:left;vertical-align:top}
th{background:#1a1212;color:#f7efe3;font-size:10px;letter-spacing:.06em;text-transform:uppercase}
td.c{text-align:center;font-weight:bold}tr:nth-child(even) td{background:#faf6ee}
.cancelled-title{color:#9b1c1c}.no-print{margin:12px 0 20px}
@media print{.no-print{display:none!important}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body>
<button class="no-print" onclick="window.print()">Imprimir / Guardar PDF</button>
<section class="page">
  <h1>${escapeHtml(data.event || "Reporte de reservas")}</h1>
  <p class="sub gold">${escapeHtml(data.theme || "Victorian Masquerade Ball")}</p>
  <p class="sub">${escapeHtml(data.venue || "")}</p>
  <p class="sub">Generado: ${escapeHtml(printed)}</p>
  <div class="stats">
    <div class="stat big"><span class="n">${s.total_guests ?? 0}</span><span class="l">Total de invitados confirmados (reservas activas)</span></div>
    <div class="stat"><span class="n">${s.active_count ?? 0}</span><span class="l">Reservas activas</span></div>
    <div class="stat"><span class="n">${s.cancelled_count ?? 0}</span><span class="l">Reservas canceladas</span></div>
    <div class="stat"><span class="n">${s.total_reservations ?? 0}</span><span class="l">Total de registros</span></div>
    <div class="stat"><span class="n">${s.avg_guests ? Number(s.avg_guests).toFixed(1) : "0"}</span><span class="l">Promedio invitados / reserva activa</span></div>
    <div class="stat"><span class="n">${byPueblo.length}</span><span class="l">Pueblos representados</span></div>
  </div>
  <h2>Por pueblo</h2>
  <table><thead><tr><th>#</th><th>Pueblo</th><th>Reservas</th><th>Invitados</th></tr></thead>
  <tbody>${puebloRows || '<tr><td colspan="4">Sin datos por pueblo</td></tr>'}</tbody></table>
  <p class="note">Confidencial. Solo reservas <strong>activas</strong> cuentan en invitados. Tres Palmas, Aguadilla · 5:00 p.m.</p>
</section>
<section class="page">
  <h1>Detalle de reservas activas</h1>
  <p class="sub">${active.length} reserva(s) · ${s.total_guests ?? 0} invitado(s)</p>
  <table><thead><tr><th>#</th><th>Nombre</th><th>Pueblo</th><th>Mesa</th><th>Inv.</th><th>Teléfono</th><th>Correo</th><th>Notas</th><th>Fecha</th></tr></thead>
  <tbody>${rows(active) || '<tr><td colspan="9">Sin reservas activas</td></tr>'}</tbody></table>
  ${
    cancelled.length
      ? `<h2 class="cancelled-title">Canceladas (${cancelled.length})</h2>
  <table><thead><tr><th>#</th><th>Nombre</th><th>Pueblo</th><th>Mesa</th><th>Inv.</th><th>Teléfono</th><th>Correo</th><th>Notas</th><th>Fecha</th></tr></thead>
  <tbody>${rows(cancelled)}</tbody></table>`
      : ""
  }
</section>
<script>window.onload=function(){setTimeout(function(){window.print()},350)};<\/script>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) throw new Error("Permite ventanas emergentes para imprimir el reporte.");
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  async function printReservationsReport() {
    if (!adminKey) return;
    try {
      const res = await fetch("/api/admin/print-reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      openReservationReport(data);
    } catch (err) {
      alert(err.message || "No se pudo imprimir");
    }
  }

  adminHubKey?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") adminHubLoginBtn?.click();
  });

  let loginCooldown = null;

  adminHubLoginBtn?.addEventListener("click", async () => {
    if (loginCooldown && Date.now() < loginCooldown) {
      const sec = Math.ceil((loginCooldown - Date.now()) / 1000);
      if (adminHubLoginStatus) {
        adminHubLoginStatus.textContent = `Espera ${sec}s antes de reintentar.`;
        adminHubLoginStatus.className = "form-status err";
      }
      return;
    }
    const key = (adminHubKey?.value || "").trim();
    if (!key) {
      if (adminHubLoginStatus) {
        adminHubLoginStatus.textContent = "Escribe la contraseña.";
        adminHubLoginStatus.className = "form-status err";
      }
      return;
    }
    adminHubLoginBtn.disabled = true;
    adminHubLoginBtn.textContent = "Verificando…";
    if (adminHubLoginStatus) {
      adminHubLoginStatus.textContent = "";
      adminHubLoginStatus.className = "form-status";
    }
    try {
      const res = await fetch("/api/admin/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch (_) {
        throw new Error("Respuesta inválida del servidor (" + res.status + ").");
      }
      if (!res.ok) {
        if (data.retryAfterSec) {
          loginCooldown = Date.now() + data.retryAfterSec * 1000;
        } else {
          loginCooldown = Date.now() + 1500;
        }
        throw new Error(data.error || "No autorizado");
      }
      loginCooldown = null;
      adminKey = key;
      try {
        sessionStorage.setItem(KEY_STORAGE, key);
      } catch (_) {}
      showApp();
      setView("reservas");
      renderStats(data.stats, adminResStats2);
      renderAdminList(data.reservations || []);
      renderTownMaps(data.byPueblo || []);
    } catch (err) {
      console.error("[admin login]", err);
      if (adminHubLoginStatus) {
        adminHubLoginStatus.textContent = err.message || "Contraseña incorrecta.";
        adminHubLoginStatus.className = "form-status err";
      }
      if (adminHubKey) {
        adminHubKey.value = "";
        adminHubKey.classList.remove("is-visible");
      }
    } finally {
      adminHubLoginBtn.disabled = false;
      adminHubLoginBtn.textContent = "Entrar";
    }
  });

  adminHubLogout?.addEventListener("click", showLogin);
  adminResRefreshBtn?.addEventListener("click", loadAdminReservations);
  adminWishesRefreshBtn?.addEventListener("click", loadAdminWishes);
  printResReportBtn?.addEventListener("click", async () => {
    printResReportBtn.disabled = true;
    printResReportBtn.textContent = "Generando…";
    try {
      await printReservationsReport();
    } finally {
      printResReportBtn.disabled = false;
      printResReportBtn.textContent = "🖨 Reporte profesional";
    }
  });
  function openSeatingPdf() {
    const groups = groupActiveByMesa(allReservations);
    const active = allReservations.filter((r) => r.status === "active");
    const unassigned = active.filter((r) => !mesaLabel(r.mesa));
    const printed = new Date().toLocaleString("es", {
      dateStyle: "full",
      timeStyle: "short",
    });
    const totalGuests = active.reduce((s, r) => s + (r.guests || 0), 0);
    const tableBlocks = groups
      .map((g) => {
        const rows = g.reservations
          .slice()
          .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"))
          .map(
            (r, i) => `<tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(r.name)}</td>
            <td>${escapeHtml(r.pueblo || "—")}</td>
            <td class="c">${r.guests}</td>
            <td>${escapeHtml(r.phone || "—")}</td>
            <td>${escapeHtml(r.notes || "—")}</td>
          </tr>`
          )
          .join("");
        return `<section class="mesa-block">
          <h2>${g.mesa === "Sin mesa" ? "Sin mesa asignada" : escapeHtml(formatMesaDisplay(g.mesa))}
            <span class="meta">${g.reservations.length} reserva(s) · ${g.guests}/${MESA_MAX} asiento(s)</span>
          </h2>
          <table><thead><tr><th>#</th><th>Nombre</th><th>Pueblo</th><th>Inv.</th><th>Teléfono</th><th>Notas</th></tr></thead>
          <tbody>${rows}</tbody></table>
        </section>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8" /><title>Mesas / salón — Alahya XV</title>
<style>
@page{size:letter;margin:.65in}*{box-sizing:border-box}
body{font-family:Georgia,serif;color:#1a1212;margin:0;padding:12px 8px}
h1{font-size:24px;color:#9b1c1c;margin:0 0 4px}
.sub{color:#5c4a48;font-size:13px;margin:0 0 6px}.gold{color:#b8860b}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 18px}
.stat{border:1px solid #d4af37;border-radius:8px;padding:10px 14px;background:#faf6ee;font-size:13px}
.stat strong{display:block;font-size:22px;color:#9b1c1c}
.mesa-block{margin:0 0 18px;page-break-inside:avoid}
h2{font-size:16px;margin:0 0 8px;padding:8px 10px;background:#1a1212;color:#f7efe3;border-radius:6px}
h2 .meta{float:right;font-size:12px;font-weight:normal;opacity:.9;color:#e8d5a3}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #e0d4c4;padding:5px 6px;text-align:left}
th{background:#f3ebe0;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
td.c{text-align:center;font-weight:bold}
.note{font-size:11px;color:#5c4a48;margin-top:16px}
.no-print{margin:0 0 14px}
@media print{.no-print{display:none!important}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body>
<button class="no-print" onclick="window.print()">Imprimir / Guardar PDF</button>
<h1>Lista de mesas · Salón</h1>
<p class="sub gold">XV Alahya Thaís Saltares Ortega · Victorian Masquerade Ball</p>
<p class="sub">Tres Palmas, Aguadilla · 10 de octubre de 2026 · 5:00 p.m.</p>
<p class="sub">Generado: ${escapeHtml(printed)}</p>
<div class="stats">
  <div class="stat"><strong>${active.length}</strong>Reservas activas</div>
  <div class="stat"><strong>${totalGuests}</strong>Invitados (asientos)</div>
  <div class="stat"><strong>${groups.filter((g) => g.mesa !== "Sin mesa").length}</strong>Mesas usadas</div>
  <div class="stat"><strong>${unassigned.length}</strong>Sin mesa</div>
</div>
${tableBlocks || "<p>No hay reservas activas.</p>"}
<p class="note">Documento para el salón. Solo reservas <strong>activas</strong>. Confidencial.</p>
<script>window.onload=function(){setTimeout(function(){window.print()},350)};<\/script>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) throw new Error("Permite ventanas emergentes para el PDF de mesas.");
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  async function saveMesaQuick(id, mesaValue, btn) {
    if (!adminKey) return;
    const r = allReservations.find((x) => String(x.id) === String(id));
    if (!r) return;
    const mesa = String(mesaValue || "").trim();
    const guests = guestsOf(r);
    if (mesa && (r.status || "active") === "active") {
      const cap = checkMesaCapacity(mesa, guests, id);
      if (!cap.ok) {
        alert(cap.message);
        const sel = adminResList?.querySelector(`[data-mesa-input="${id}"]`);
        if (sel) sel.innerHTML = buildMesaSelectOptions(r.mesa || "", r.id, guests);
        return;
      }
    }
    // Actualización optimista local: resta invitados de la mesa al instante
    const prevMesa = mesaLabel(r.mesa);
    r.mesa = mesa || null;
    r.guests = guests;
    renderSeatingSummary(allReservations);
    populateFilterMesas(allReservations);
    renderMesaMap();

    if (btn) btn.disabled = true;
    try {
      const res = await fetch(`/api/admin/reservations/${id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: adminKey,
          name: r.name,
          email: r.email || "",
          phone: r.phone || "",
          pueblo: r.pueblo || "",
          guests,
          notes: r.notes || "",
          status: r.status || "active",
          mesa,
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = {};
      }
      if (!res.ok) {
        r.mesa = prevMesa || null;
        throw new Error(data.error || "Error");
      }
      if (data.reservation) {
        Object.assign(r, data.reservation);
      }
      await loadAdminReservations();
    } catch (err) {
      r.mesa = prevMesa || null;
      alert(err.message || "No se pudo guardar la mesa.");
      renderAdminList();
      if (btn) btn.disabled = false;
    }
  }

  printSeatingBtn?.addEventListener("click", () => {
    try {
      if (!allReservations.length) {
        alert("No hay reservas cargadas. Actualiza la lista primero.");
        return;
      }
      openSeatingPdf();
    } catch (err) {
      alert(err.message || "No se pudo abrir el PDF de mesas.");
    }
  });

  async function registerWaSent(id) {
    if (!adminKey || !id) return null;
    try {
      const res = await fetch(`/api/admin/reservations/${id}/wa-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error");
      const row = allReservations.find((x) => String(x.id) === String(id));
      if (row && data.reservation) {
        row.wa_sent_count = data.reservation.wa_sent_count;
        row.wa_sent_at = data.reservation.wa_sent_at;
      }
      // Actualizar solo la UI de esa tarjeta sin recargar todo
      const article = adminResList?.querySelector(`[data-res-id="${id}"]`);
      const count = data.reservation?.wa_sent_count ?? (row ? row.wa_sent_count : 0);
      if (article) {
        article.classList.add("has-wa-sent");
        const waLinkEl = article.querySelector(`a.wa[data-wa-id="${id}"]`);
        if (waLinkEl) {
          waLinkEl.classList.add("is-sent");
          waLinkEl.innerHTML = `✓ WhatsApp <span class="wa-count" data-wa-count="${id}">#${count}</span>`;
        }
        let mark = article.querySelector(".wa-sent-mark");
        if (mark) {
          mark.classList.remove("is-pending");
          mark.textContent = `✓ ${count}`;
          mark.title = `WhatsApp enviado ${count} vez/veces`;
        }
      }
      return data.reservation;
    } catch (err) {
      console.warn("[wa-sent]", err.message);
      return null;
    }
  }

  adminResList?.addEventListener("click", async (e) => {
    const waA = e.target.closest("a.wa[data-wa-id]");
    if (waA && !waA.classList.contains("is-disabled")) {
      const id = waA.getAttribute("data-wa-id");
      // Registrar y dejar que el navegador abra WhatsApp (no preventDefault)
      registerWaSent(id);
      return;
    }
    const mesaSave = e.target.closest("[data-mesa-save]");
    if (mesaSave) {
      const id = mesaSave.getAttribute("data-mesa-save");
      const input = adminResList.querySelector(`[data-mesa-input="${id}"]`);
      await saveMesaQuick(id, input ? input.value : "", mesaSave);
      return;
    }
    const editBtn = e.target.closest("[data-edit-id]");
    if (editBtn) {
      openEditReservation(editBtn.getAttribute("data-edit-id"));
      return;
    }
    const btn = e.target.closest("[data-cancel-id]");
    if (!btn || !adminKey) return;
    const id = btn.getAttribute("data-cancel-id");
    if (!confirm("¿Cancelar esta reserva?")) return;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/admin/reservations/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      await loadAdminReservations();
    } catch (err) {
      alert(err.message || "No se pudo cancelar");
      btn.disabled = false;
    }
  });

  // Al cambiar el combo de mesa en la lista: validar cupo y guardar
  adminResList?.addEventListener("change", (e) => {
    const sel = e.target.closest("select[data-mesa-input]");
    if (!sel) return;
    const id = sel.getAttribute("data-mesa-input");
    const btn = adminResList.querySelector(`[data-mesa-save="${id}"]`);
    saveMesaQuick(id, sel.value, btn);
  });

  // Inicializar selects de pueblo al cargar
  fillPuebloSelects();

  printWishesBtn?.addEventListener("click", async () => {
    if (!adminKey) return;
    printWishesBtn.disabled = true;
    printWishesBtn.textContent = "Cargando…";
    try {
      const res = await fetch("/api/admin/print-wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No autorizado");
      renderAdminWishes(data.wishes || []);
      const publicWishes = (data.wishes || []).filter((w) => w.approved !== false);
      openPrintDocument(
        { ...data, wishes: publicWishes, total: publicWishes.length },
        !!(printIncludeMeta && printIncludeMeta.checked)
      );
      if (printStatus) {
        printStatus.textContent = `Listo: ${publicWishes.length} deseo(s) públicos para imprimir.`;
        printStatus.className = "form-status ok";
      }
    } catch (err) {
      if (printStatus) {
        printStatus.textContent = err.message || "Error al imprimir.";
        printStatus.className = "form-status err";
      }
    } finally {
      printWishesBtn.disabled = false;
      printWishesBtn.textContent = "🖨 Imprimir deseos públicos";
    }
  });

  adminWishesList?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-wish-vis]");
    if (!btn || !adminKey) return;
    const id = btn.getAttribute("data-wish-vis");
    const approved = btn.getAttribute("data-approved") === "true";
    btn.disabled = true;
    try {
      const res = await fetch(`/api/admin/wishes/${id}/visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminKey, approved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      await loadAdminWishes();
    } catch (err) {
      alert(err.message || "No se pudo actualizar");
      btn.disabled = false;
    }
  });

  // Restaurar sesión (solo si no pasó el tiempo de inactividad)
  (async function init() {
    if (!adminKey || isSessionExpired()) {
      try {
        sessionStorage.removeItem(KEY_STORAGE);
        sessionStorage.removeItem(LAST_ACTIVE_STORAGE);
      } catch (_) {}
      adminKey = "";
      showLogin();
      return;
    }
    showApp();
    setView("reservas");
    const ok = await loadAdminReservations();
    if (!ok) showLogin();
  })();
})();
