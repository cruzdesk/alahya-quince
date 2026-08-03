require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { pool, ensureSchema } = require("./db");
const { sendReservationAlert } = require("./email");
const { requireAdmin } = require("./admin-auth");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "alahya-admin-cambia-esto";
const PRINT_ADMIN_KEY = process.env.PRINT_ADMIN_KEY || "7874204160";
const WISH_PIN = process.env.WISH_PIN || "2026";
const EVENT_DATE =
  process.env.EVENT_DATE || "2026-10-10T17:00:00-04:00";

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const rsvpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera un momento e intenta de nuevo." },
});

const wishLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: "Demasiados mensajes. Espera un momento." },
});

// Límite general de tráfico a rutas admin (además del bloqueo por fallos de clave)
const adminTrafficLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiadas peticiones al panel admin. Espera unos minutos.",
  },
});

const adminGuard = [adminTrafficLimiter, requireAdmin(PRINT_ADMIN_KEY)];

function clean(str, max = 200) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, max).replace(/[<>]/g, "");
}

// ——— Health (Render / monitoring)
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, eventDate: EVENT_DATE });
  } catch (e) {
    res.status(503).json({ ok: false, error: "db" });
  }
});

app.get("/api/event", (_req, res) => {
  res.json({
    name: "Alahya Thaís Saltares Ortega",
    title: "Mis XV Años",
    eventDate: EVENT_DATE,
    venue: {
      location: "Tres Palmas, Aguadilla",
      theme: "Victorian Masquerade Ball",
      dressCode: "Formal · color negro",
      church: false,
      start: "5:00 p.m.",
    },
  });
});

// ——— RSVP
app.post("/api/rsvp", rsvpLimiter, async (req, res) => {
  try {
    const name = clean(req.body.name, 120);
    const email = clean(req.body.email, 160).toLowerCase();
    const phone = clean(req.body.phone, 40);
    const guests = Math.min(Math.max(parseInt(req.body.guests, 10) || 1, 1), 12);
    const attending =
      req.body.attending === true ||
      req.body.attending === "true" ||
      req.body.attending === "si" ||
      req.body.attending === "yes";
    const message = clean(req.body.message, 500);
    const dietary = clean(req.body.dietary, 200);

    if (!name || name.length < 2) {
      return res.status(400).json({ error: "Por favor escribe tu nombre." });
    }

    const result = await pool.query(
      `INSERT INTO rsvps (name, email, phone, guests, attending, message, dietary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [name, email || null, phone || null, guests, attending, message || null, dietary || null]
    );

    res.status(201).json({
      success: true,
      id: result.rows[0].id,
      message: attending
        ? "¡Confirmado! Te esperamos con mucho cariño ✨"
        : "Gracias por avisarnos. Te extrañaremos 💕",
    });
  } catch (err) {
    console.error("RSVP error:", err);
    res.status(500).json({ error: "No pudimos guardar tu confirmación. Intenta más tarde." });
  }
});

// ——— Admin: list RSVPs (header X-Admin-Secret)
app.get("/api/rsvps", async (req, res) => {
  if (req.get("X-Admin-Secret") !== ADMIN_SECRET) {
    return res.status(401).json({ error: "No autorizado" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, guests, attending, message, dietary, created_at
       FROM rsvps ORDER BY created_at DESC`
    );
    const summary = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE attending)::int AS yes_count,
         COUNT(*) FILTER (WHERE NOT attending)::int AS no_count,
         COALESCE(SUM(guests) FILTER (WHERE attending), 0)::int AS guest_total
       FROM rsvps`
    );
    res.json({ summary: summary.rows[0], rsvps: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar" });
  }
});

function clientIp(req) {
  const xf = req.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim().slice(0, 80);
  const real = req.get("x-real-ip");
  if (real) return real.trim().slice(0, 80);
  return (req.ip || "").slice(0, 80);
}

function deviceFingerprint(clientMeta, req) {
  const c =
    clientMeta && typeof clientMeta === "object" && !Array.isArray(clientMeta)
      ? clientMeta
      : {};
  const parts = [
    clientIp(req),
    req.get("user-agent") || "",
    c.platform || "",
    c.userAgent || "",
    c.language || "",
    c.timezone || "",
    c.hardwareConcurrency ?? "",
    c.deviceMemory ?? "",
    c.maxTouchPoints ?? "",
    c.screen ? `${c.screen.width}x${c.screen.height}x${c.screen.colorDepth}` : "",
    c.viewport ? `${c.viewport.innerWidth}x${c.viewport.devicePixelRatio}` : "",
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 64);
}

function buildWishMeta(req, clientMeta) {
  const safe =
    clientMeta && typeof clientMeta === "object" && !Array.isArray(clientMeta)
      ? clientMeta
      : {};
  // Limitar tamaño del payload de cliente
  let client = {};
  try {
    client = JSON.parse(JSON.stringify(safe).slice(0, 12000));
  } catch {
    client = {};
  }
  return {
    server: {
      ip: clientIp(req),
      userAgent: (req.get("user-agent") || "").slice(0, 500),
      acceptLanguage: (req.get("accept-language") || "").slice(0, 200),
      acceptEncoding: (req.get("accept-encoding") || "").slice(0, 120),
      referer: (req.get("referer") || "").slice(0, 300),
      origin: (req.get("origin") || "").slice(0, 200),
      host: (req.get("host") || "").slice(0, 120),
      cfConnectingIp: (req.get("cf-connecting-ip") || "").slice(0, 80),
      trueClientIp: (req.get("true-client-ip") || "").slice(0, 80),
      xForwardedProto: (req.get("x-forwarded-proto") || "").slice(0, 20),
      xForwardedFor: (req.get("x-forwarded-for") || "").slice(0, 200),
      receivedAt: new Date().toISOString(),
    },
    client,
  };
}

// ——— Guestbook / wishes
app.get("/api/wishes", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, message, meta, created_at
       FROM wishes
       WHERE approved = true
       ORDER BY created_at DESC
       LIMIT 80`
    );
    res.json({ wishes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error" });
  }
});

app.get("/api/wishes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: "ID inválido" });
    const { rows } = await pool.query(
      `SELECT id, name, message, meta, created_at
       FROM wishes WHERE id = $1 AND approved = true`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "No encontrado" });
    res.json({ wish: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error" });
  }
});

app.post("/api/wishes", wishLimiter, async (req, res) => {
  try {
    const pin = String(req.body.pin || "").trim();
    if (pin !== WISH_PIN) {
      return res.status(403).json({ error: "PIN incorrecto. No se pudo publicar." });
    }
    const name = clean(req.body.name, 80);
    const message = clean(req.body.message, 400);
    if (!name || name.length < 2) {
      return res.status(400).json({ error: "Escribe tu nombre." });
    }
    if (!message || message.length < 3) {
      return res.status(400).json({ error: "Escribe un mensaje." });
    }
    const meta = buildWishMeta(req, req.body.device || req.body.meta);
    const { rows } = await pool.query(
      `INSERT INTO wishes (name, message, approved, meta)
       VALUES ($1, $2, true, $3::jsonb)
       RETURNING id, name, message, meta, created_at`,
      [name, message, JSON.stringify(meta)]
    );
    res.status(201).json({ success: true, wish: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo guardar el mensaje." });
  }
});

// ——— Admin: listar todos los deseos (públicos y ocultos)
app.post("/api/admin/print-wishes", ...adminGuard, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, message, meta, approved, created_at
       FROM wishes
       ORDER BY created_at DESC`
    );
    const publicCount = rows.filter((w) => w.approved).length;
    res.json({
      success: true,
      printedAt: new Date().toISOString(),
      event: "Alahya Thaís Saltares Ortega — XV Años",
      total: rows.length,
      publicCount,
      hiddenCount: rows.length - publicCount,
      wishes: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo cargar los deseos." });
  }
});

// ——— Admin: mostrar / ocultar deseo en el muro público
app.post("/api/admin/wishes/:id/visibility", ...adminGuard, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: "ID inválido" });
    const approved = req.body.approved === true || req.body.approved === "true";
    const { rows } = await pool.query(
      `UPDATE wishes SET approved = $2
       WHERE id = $1
       RETURNING id, name, message, meta, approved, created_at`,
      [id, approved]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Deseo no encontrado." });
    }
    res.json({ success: true, wish: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo actualizar el deseo." });
  }
});

// ——— RESERVAS (públicas)
app.post("/api/reservations", rsvpLimiter, async (req, res) => {
  try {
    const name = clean(req.body.name, 120);
    const email = clean(req.body.email, 160).toLowerCase();
    const phone = clean(req.body.phone, 40);
    const pueblo = clean(req.body.pueblo, 80);
    const notes = clean(req.body.notes, 400);
    const guests = Math.min(Math.max(parseInt(req.body.guests, 10) || 1, 1), 20);

    if (!name || name.length < 2) {
      return res.status(400).json({ error: "Escribe tu nombre." });
    }
    if (!pueblo || pueblo.length < 2) {
      return res.status(400).json({ error: "Selecciona tu pueblo." });
    }
    if (!phone && !email) {
      return res.status(400).json({ error: "Indica teléfono o correo de contacto." });
    }

    const ip = clientIp(req) || null;
    const meta = buildWishMeta(req, req.body.device || req.body.meta);
    const clientFp = deviceFingerprint(req.body.device || req.body.meta, req);

    // Una reserva activa solo si coincide el mismo equipo Y la misma conexión (IP)
    if (ip && clientFp) {
      const { rows: existing } = await pool.query(
        `SELECT id, name, created_at FROM reservations
         WHERE status = 'active'
           AND ip = $1
           AND client_fp = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [ip, clientFp]
      );
      if (existing.length) {
        return res.status(409).json({
          error:
            "Ya hay una reserva activa desde este mismo equipo y esta misma conexión. Si necesitas cambiarla, contacta a la familia.",
          existingId: existing[0].id,
        });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO reservations (name, email, phone, guests, pueblo, notes, status, meta, client_fp, ip)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7::jsonb, $8, $9)
       RETURNING id, name, email, phone, guests, pueblo, notes, status, created_at, ip, client_fp`,
      [
        name,
        email || null,
        phone || null,
        guests,
        pueblo,
        notes || null,
        JSON.stringify(meta),
        clientFp,
        ip,
      ]
    );
    const reservation = rows[0];

    // Alerta por correo (no bloquea si falla)
    sendReservationAlert(reservation).catch((e) =>
      console.error("[email] background fail:", e.message)
    );

    res.status(201).json({
      success: true,
      message: `¡Reserva confirmada! Registramos ${guests} invitado(s).`,
      reservation,
    });
  } catch (err) {
    console.error("Reservation error:", err);
    res.status(500).json({ error: "No se pudo guardar la reserva. Intenta más tarde." });
  }
});

// ——— Admin: listar reservas + estadísticas
app.post("/api/admin/reservations", ...adminGuard, async (req, res) => {
  try {
    const { rows: statsRows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')::int AS active_count,
         COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
         COUNT(*)::int AS total_reservations,
         COALESCE(SUM(guests) FILTER (WHERE status = 'active'), 0)::int AS total_guests
       FROM reservations`
    );
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, guests, pueblo, notes, status, cancelled_at, created_at, mesa
       FROM reservations
       ORDER BY created_at DESC`
    );
    // Agregado por pueblo (solo activas) para el mapa
    const byPueblo = {};
    for (const r of rows) {
      if (r.status !== "active") continue;
      const p = (r.pueblo || "Sin pueblo").trim() || "Sin pueblo";
      if (!byPueblo[p]) {
        byPueblo[p] = { pueblo: p, count: 0, guests: 0, reservations: [] };
      }
      byPueblo[p].count += 1;
      byPueblo[p].guests += r.guests || 0;
      byPueblo[p].reservations.push(r);
    }
    res.json({
      success: true,
      stats: statsRows[0],
      reservations: rows,
      byPueblo: Object.values(byPueblo).sort((a, b) => b.guests - a.guests),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudieron cargar las reservas." });
  }
});

// ——— Admin: cancelar reserva
app.post("/api/admin/reservations/:id/cancel", ...adminGuard, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const { rows } = await pool.query(
      `UPDATE reservations
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = $1 AND status = 'active'
       RETURNING id, name, email, phone, guests, pueblo, notes, status, cancelled_at, created_at, mesa`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Reserva no encontrada o ya cancelada." });
    }
    res.json({ success: true, reservation: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo cancelar la reserva." });
  }
});

// ——— Admin: editar reserva
app.post("/api/admin/reservations/:id/update", ...adminGuard, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const name = clean(req.body.name, 120);
    const email = clean(req.body.email, 160).toLowerCase();
    const phone = clean(req.body.phone, 40);
    const pueblo = clean(req.body.pueblo, 80);
    const notes = clean(req.body.notes, 400);
    const guests = Math.min(Math.max(parseInt(req.body.guests, 10) || 1, 1), 20);
    let status = String(req.body.status || "active").toLowerCase();
    if (status !== "active" && status !== "cancelled") status = "active";

    const MESA_MAX = 10;
    const MESA_ALAHYA = "Mesa de Alahya";
    let mesaRaw = clean(req.body.mesa, 40);
    let mesa = null;
    if (mesaRaw) {
      if (mesaRaw === MESA_ALAHYA || /^mesa\s+de\s+alahya$/i.test(mesaRaw)) {
        mesa = MESA_ALAHYA;
      } else {
        const n = parseInt(mesaRaw, 10);
        if (Number.isFinite(n) && n >= 1 && n <= 50 && String(n) === String(parseInt(mesaRaw, 10))) {
          mesa = String(n);
        } else {
          return res.status(400).json({
            error: 'Mesa inválida. Elige 1–50 o "Mesa de Alahya".',
          });
        }
      }
    }

    if (!name || name.length < 2) {
      return res.status(400).json({ error: "Nombre requerido." });
    }

    // Cupo por mesa: máx. 10 invitados (suma de reservas activas)
    if (mesa && status === "active") {
      const { rows: capRows } = await pool.query(
        `SELECT COALESCE(SUM(guests), 0)::int AS used
         FROM reservations
         WHERE status = 'active' AND mesa = $1 AND id <> $2`,
        [mesa, id]
      );
      const used = capRows[0]?.used || 0;
      if (used + guests > MESA_MAX) {
        const free = Math.max(0, MESA_MAX - used);
        return res.status(400).json({
          error:
            free === 0
              ? `La mesa «${mesa}» ya está llena (máximo ${MESA_MAX} asientos). Elige otra mesa.`
              : `La mesa «${mesa}» no tiene cupo suficiente. Hay ${used}/${MESA_MAX} ocupados y solo ${free} libre(s); esta reserva pide ${guests}.`,
        });
      }
    }

    const { rows } = await pool.query(
      `UPDATE reservations SET
         name = $2,
         email = $3,
         phone = $4,
         guests = $5,
         pueblo = $6,
         notes = $7,
         status = $8,
         mesa = $9,
         cancelled_at = CASE
           WHEN $8 = 'cancelled' AND (cancelled_at IS NULL OR status = 'active') THEN COALESCE(cancelled_at, NOW())
           WHEN $8 = 'active' THEN NULL
           ELSE cancelled_at
         END
       WHERE id = $1
       RETURNING id, name, email, phone, guests, pueblo, notes, status, cancelled_at, created_at, mesa`,
      [
        id,
        name,
        email || null,
        phone || null,
        guests,
        pueblo || null,
        notes || null,
        status,
        mesa || null,
      ]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Reserva no encontrada." });
    }
    res.json({ success: true, reservation: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo actualizar la reserva." });
  }
});

// ——— Admin: datos para reporte imprimible de reservas
app.post("/api/admin/print-reservations", ...adminGuard, async (req, res) => {
  try {
    const { rows: statsRows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')::int AS active_count,
         COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
         COUNT(*)::int AS total_reservations,
         COALESCE(SUM(guests) FILTER (WHERE status = 'active'), 0)::int AS total_guests,
         COALESCE(AVG(guests) FILTER (WHERE status = 'active'), 0)::float AS avg_guests
       FROM reservations`
    );
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, guests, pueblo, notes, status, cancelled_at, created_at, mesa
       FROM reservations
       ORDER BY
         CASE WHEN status = 'active' THEN 0 ELSE 1 END,
         pueblo NULLS LAST,
         created_at ASC`
    );
    const byPueblo = {};
    for (const r of rows) {
      if (r.status !== "active") continue;
      const p = (r.pueblo || "Sin pueblo").trim() || "Sin pueblo";
      if (!byPueblo[p]) byPueblo[p] = { pueblo: p, count: 0, guests: 0 };
      byPueblo[p].count += 1;
      byPueblo[p].guests += r.guests || 0;
    }
    res.json({
      success: true,
      printedAt: new Date().toISOString(),
      event: "Alahya Thaís Saltares Ortega — XV Años",
      venue: "Tres Palmas, Aguadilla · 10 de octubre de 2026 · 5:00 p.m.",
      theme: "Victorian Masquerade Ball",
      stats: statsRows[0],
      reservations: rows,
      byPueblo: Object.values(byPueblo).sort((a, b) => b.guests - a.guests),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo generar el reporte." });
  }
});

// SPA fallback
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Not found" });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  try {
    await ensureSchema();
    console.log("✓ Base de datos lista");
  } catch (e) {
    console.warn("⚠ DB no disponible aún (reintentará en requests):", e.message);
  }
  app.listen(PORT, () => {
    console.log(`✨ Alahya XV — http://localhost:${PORT}`);
  });
}

start();
