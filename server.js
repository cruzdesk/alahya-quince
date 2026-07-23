require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { pool, ensureSchema } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "alahya-admin-cambia-esto";
const EVENT_DATE =
  process.env.EVENT_DATE || "2026-08-15T18:00:00-04:00";

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
    name: "Alahya T. Saltares Ortega",
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

// ——— Guestbook / wishes
app.get("/api/wishes", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, message, created_at
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

app.post("/api/wishes", wishLimiter, async (req, res) => {
  try {
    const name = clean(req.body.name, 80);
    const message = clean(req.body.message, 400);
    if (!name || name.length < 2) {
      return res.status(400).json({ error: "Escribe tu nombre." });
    }
    if (!message || message.length < 3) {
      return res.status(400).json({ error: "Escribe un mensaje." });
    }
    const { rows } = await pool.query(
      `INSERT INTO wishes (name, message, approved)
       VALUES ($1, $2, true)
       RETURNING id, name, message, created_at`,
      [name, message]
    );
    res.status(201).json({ success: true, wish: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo guardar el mensaje." });
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
