const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : undefined,
    })
  : null;

// Fallback en memoria si no hay Postgres (demo local)
const memory = {
  rsvps: [],
  wishes: [],
  nextId: 1,
};

function memoryQuery(text, params = []) {
  // Minimal shim for local demo without Postgres
  if (text.includes("SELECT 1")) {
    return Promise.resolve({ rows: [{ "?column?": 1 }] });
  }
  if (text.includes("INSERT INTO rsvps")) {
    const row = {
      id: memory.nextId++,
      name: params[0],
      email: params[1],
      phone: params[2],
      guests: params[3],
      attending: params[4],
      message: params[5],
      dietary: params[6],
      created_at: new Date().toISOString(),
    };
    memory.rsvps.unshift(row);
    return Promise.resolve({ rows: [row] });
  }
  if (text.includes("FROM rsvps ORDER BY")) {
    return Promise.resolve({ rows: memory.rsvps });
  }
  if (text.includes("FROM rsvps") && text.includes("COUNT")) {
    const yes = memory.rsvps.filter((r) => r.attending);
    return Promise.resolve({
      rows: [
        {
          total: memory.rsvps.length,
          yes_count: yes.length,
          no_count: memory.rsvps.length - yes.length,
          guest_total: yes.reduce((s, r) => s + (r.guests || 0), 0),
        },
      ],
    });
  }
  if (text.includes("INSERT INTO wishes")) {
    const row = {
      id: memory.nextId++,
      name: params[0],
      message: params[1],
      approved: true,
      created_at: new Date().toISOString(),
    };
    memory.wishes.unshift(row);
    return Promise.resolve({ rows: [row] });
  }
  if (text.includes("FROM wishes")) {
    return Promise.resolve({
      rows: memory.wishes.filter((w) => w.approved !== false).slice(0, 80),
    });
  }
  if (text.includes("CREATE TABLE") || text.includes("CREATE INDEX")) {
    return Promise.resolve({ rows: [] });
  }
  return Promise.resolve({ rows: [] });
}

const db = {
  query: (text, params) => {
    if (pool) return pool.query(text, params);
    return memoryQuery(text, params);
  },
};

async function ensureSchema() {
  if (!pool) {
    console.log("ℹ Sin DATABASE_URL — usando memoria (solo demo local)");
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rsvps (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(160),
      phone VARCHAR(40),
      guests INTEGER NOT NULL DEFAULT 1,
      attending BOOLEAN NOT NULL DEFAULT true,
      message TEXT,
      dietary VARCHAR(200),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wishes (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      message TEXT NOT NULL,
      approved BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rsvps_created ON rsvps (created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_wishes_created ON wishes (created_at DESC);
  `);
}

module.exports = { pool: db, ensureSchema, rawPool: pool };
