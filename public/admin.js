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
  const adminResStats = document.getElementById("adminResStats");
  const adminResStats2 = document.getElementById("adminResStats2");
  const adminResList = document.getElementById("adminResList");
  const printResReportBtn = document.getElementById("printResReportBtn");
  const printResReportBtnQuick = document.getElementById("printResReportBtnQuick");
  const adminResRefreshBtn = document.getElementById("adminResRefreshBtn");
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

  const titles = {
    resumen: "Resumen",
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
    if (name === "reservas" && adminKey) loadAdminReservations();
  }

  function renderAdminWishes(list) {
    if (!adminWishesList) return;
    const wishes = list || [];
    if (adminWishesCount) {
      adminWishesCount.textContent = wishes.length
        ? `${wishes.length} deseo(s) registrado(s)`
        : "No hay deseos todavía.";
    }
    if (!wishes.length) {
      adminWishesList.innerHTML = '<p class="muted center">Sé el primero… aún no hay mensajes en el muro.</p>';
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
        const meta = w.meta || {};
        const ip = meta.server && meta.server.ip ? meta.server.ip : "";
        const platform =
          (meta.client && (meta.client.platform || (meta.client.uaData && meta.client.uaData.platform))) ||
          "";
        const extra = [ip && `IP: ${ip}`, platform && `Plataforma: ${platform}`]
          .filter(Boolean)
          .join(" · ");
        return `<article class="admin-res-item">
          <div>
            <div class="who">${escapeHtml(w.name)} <span class="badge ok">#${w.id}</span></div>
            <div class="meta-line" style="color:var(--ink);margin-top:0.35rem">${escapeHtml(w.message)}</div>
            <div class="meta-line">${escapeHtml(when)}</div>
            ${extra ? `<div class="meta-line">${escapeHtml(extra)}</div>` : ""}
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
    if (!adminKey) return;
    try {
      const res = await fetch("/api/admin/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      renderStats(data.stats, adminResStats);
      renderStats(data.stats, adminResStats2);
      renderAdminList(data.reservations || []);
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
  </div>
  <p class="note">Confidencial. Solo reservas <strong>activas</strong> cuentan en invitados. Tres Palmas, Aguadilla · 5:00 p.m.</p>
</section>
<section class="page">
  <h1>Detalle de reservas activas</h1>
  <p class="sub">${active.length} reserva(s) · ${s.total_guests ?? 0} invitado(s)</p>
  <table><thead><tr><th>#</th><th>Nombre</th><th>Inv.</th><th>Teléfono</th><th>Correo</th><th>Notas</th><th>Fecha</th></tr></thead>
  <tbody>${rows(active) || '<tr><td colspan="7">Sin reservas activas</td></tr>'}</tbody></table>
  ${
    cancelled.length
      ? `<h2 class="cancelled-title">Canceladas (${cancelled.length})</h2>
  <table><thead><tr><th>#</th><th>Nombre</th><th>Inv.</th><th>Teléfono</th><th>Correo</th><th>Notas</th><th>Fecha</th></tr></thead>
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
      setView("resumen");
      renderStats(data.stats, adminResStats);
      renderStats(data.stats, adminResStats2);
      renderAdminList(data.reservations || []);
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
  printResReportBtnQuick?.addEventListener("click", printReservationsReport);

  adminResList?.addEventListener("click", async (e) => {
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
    setView("resumen");
    const ok = await loadAdminReservations();
    if (!ok) showLogin();
  })();
})();
