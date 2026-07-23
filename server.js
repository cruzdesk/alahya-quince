require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { pool, ensureSchema } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "alahya-admin-cambia-esto";
const PRINT_ADMIN_KEY = process.env.PRINT_ADMIN_KEY || "7874204160";
const WISH_PIN = process.env.WISH_PIN || "2026";
const EVENT_DATE =
  process.env.EVENT_DATE || "2026-10-10T18:00:00-04:00";

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
      ceremony: "Ceremonia — detalles en la invitación",
      reception: "Recepción — baile y cena",
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

// ——— Admin: exportar todos los deseos para imprimir
app.post("/api/admin/print-wishes", async (req, res) => {
  try {
    const key = String(
      req.body.key || req.get("X-Print-Admin-Key") || ""
    ).trim();
    if (key !== PRINT_ADMIN_KEY) {
      return res.status(401).json({ error: "Clave de administrador incorrecta." });
    }
    const { rows } = await pool.query(
      `SELECT id, name, message, meta, created_at
       FROM wishes
       WHERE approved = true
       ORDER BY created_at ASC`
    );
    res.json({
      success: true,
      printedAt: new Date().toISOString(),
      event: "Alahya Thaís Saltares Ortega — XV Años",
      total: rows.length,
      wishes: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo cargar los deseos." });
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
