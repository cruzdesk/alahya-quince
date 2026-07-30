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
  reservations: [],
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
      meta: params[2] || null,
      created_at: new Date().toISOString(),
    };
    memory.wishes.unshift(row);
    return Promise.resolve({ rows: [row] });
  }
  if (text.includes("UPDATE wishes") && text.includes("approved")) {
    const id = params[0];
    const approved = params[1];
    const row = memory.wishes.find((w) => w.id === id);
    if (!row) return Promise.resolve({ rows: [] });
    row.approved = !!approved;
    return Promise.resolve({ rows: [row] });
  }
  if (text.includes("FROM wishes") && text.includes("ORDER BY created_at DESC") && !text.includes("approved = true")) {
    return Promise.resolve({
      rows: [...memory.wishes].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      ),
    });
  }
  if (text.includes("FROM wishes")) {
    return Promise.resolve({
      rows: memory.wishes.filter((w) => w.approved !== false).slice(0, 80),
    });
  }
  // ——— Reservations
  if (text.includes("INSERT INTO reservations")) {
    const row = {
      id: memory.nextId++,
      name: params[0],
      email: params[1],
      phone: params[2],
      guests: params[3],
      pueblo: params[4],
      notes: params[5],
      meta: params[6] ? (typeof params[6] === "string" ? JSON.parse(params[6]) : params[6]) : null,
      client_fp: params[7] || null,
      ip: params[8] || null,
      status: "active",
      cancelled_at: null,
      created_at: new Date().toISOString(),
    };
    memory.reservations.unshift(row);
    return Promise.resolve({ rows: [row] });
  }
  if (
    text.includes("FROM reservations") &&
    text.includes("status = 'active'") &&
    text.includes("client_fp")
  ) {
    const ip = params[0];
    const fp = params[1];
    const hit = memory.reservations.find(
      (r) =>
        r.status === "active" &&
        ip &&
        fp &&
        r.ip === ip &&
        r.client_fp === fp
    );
    return Promise.resolve({ rows: hit ? [hit] : [] });
  }
  if (text.includes("FROM reservations") && text.includes("status = 'active'") && text.includes("COUNT")) {
    const active = memory.reservations.filter((r) => r.status === "active");
    const cancelled = memory.reservations.filter((r) => r.status === "cancelled");
    return Promise.resolve({
      rows: [
        {
          active_count: active.length,
          cancelled_count: cancelled.length,
          total_guests: active.reduce((s, r) => s + (r.guests || 0), 0),
          total_reservations: memory.reservations.length,
        },
      ],
    });
  }
  if (text.includes("UPDATE reservations") && text.includes("cancelled")) {
    const id = params[0];
    const row = memory.reservations.find((r) => r.id === id);
    if (!row || row.status === "cancelled") return Promise.resolve({ rows: [] });
    row.status = "cancelled";
    row.cancelled_at = new Date().toISOString();
    return Promise.resolve({ rows: [row] });
  }
  if (text.includes("FROM reservations") && text.includes("ORDER BY")) {
    let rows = [...memory.reservations];
    if (text.includes("status = 'active'") && !text.includes("COUNT")) {
      // list may request all or active only
    }
    if (text.includes("created_at ASC")) {
      rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else {
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return Promise.resolve({ rows });
  }
  if (text.includes("CREATE TABLE") || text.includes("CREATE INDEX") || text.includes("ALTER TABLE")) {
    return Promise.resolve({ rows: [] });
  }
  return Promise.resolve({ rows: [] });
}

let schemaReady = false;
let schemaPromise = null;

const db = {
  query: async (text, params) => {
    if (pool) {
      // Auto-crear tablas si el primer arranque fue antes de que Postgres estuviera listo
      if (!schemaReady && !/^\s*SELECT\s+1\s*$/i.test(text.trim())) {
        await ensureSchema();
      }
      return pool.query(text, params);
    }
    return memoryQuery(text, params);
  },
};

async function ensureSchema() {
  if (!pool) {
    console.log("ℹ Sin DATABASE_URL — usando memoria (solo demo local)");
    schemaReady = true;
    return;
  }
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
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
        meta JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    // Migración suave si la tabla ya existía sin meta
    await pool.query(`
      ALTER TABLE wishes ADD COLUMN IF NOT EXISTS meta JSONB;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_rsvps_created ON rsvps (created_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_wishes_created ON wishes (created_at DESC);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(160),
        phone VARCHAR(40),
        guests INTEGER NOT NULL DEFAULT 1,
        pueblo VARCHAR(80),
        notes TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pueblo VARCHAR(80);
    `);
    await pool.query(`
      ALTER TABLE reservations ADD COLUMN IF NOT EXISTS meta JSONB;
    `);
    await pool.query(`
      ALTER TABLE reservations ADD COLUMN IF NOT EXISTS client_fp VARCHAR(64);
    `);
    await pool.query(`
      ALTER TABLE reservations ADD COLUMN IF NOT EXISTS ip VARCHAR(80);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations (status, created_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_pueblo ON reservations (pueblo);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_ip ON reservations (ip) WHERE status = 'active';
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_fp ON reservations (client_fp) WHERE status = 'active';
    `);
    schemaReady = true;
    console.log("✓ Schema rsvps/wishes/reservations listo");
  })()
    .catch((err) => {
      schemaPromise = null;
      throw err;
    });

  return schemaPromise;
}

module.exports = { pool: db, ensureSchema, rawPool: pool };
