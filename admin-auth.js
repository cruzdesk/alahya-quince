/**
 * Protección básica del acceso admin:
 * - comparación de clave en tiempo constante
 * - límite de intentos fallidos por IP
 * - bloqueo temporal
 * - registro de fallos en logs
 */
const crypto = require("crypto");

const MAX_FAILED = Number(process.env.ADMIN_MAX_FAILED || 5);
const LOCK_MS = Number(process.env.ADMIN_LOCK_MS || 15 * 60 * 1000);
const FAIL_WINDOW_MS = Number(process.env.ADMIN_FAIL_WINDOW_MS || 15 * 60 * 1000);

/** @type {Map<string, { fails: number[], lockedUntil: number }>} */
const attempts = new Map();

function clientIp(req) {
  const xf = req.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim().slice(0, 80);
  return (req.ip || req.socket?.remoteAddress || "unknown").slice(0, 80);
}

function getState(ip) {
  let s = attempts.get(ip);
  if (!s) {
    s = { fails: [], lockedUntil: 0 };
    attempts.set(ip, s);
  }
  return s;
}

function pruneFails(s, now) {
  s.fails = s.fails.filter((t) => now - t < FAIL_WINDOW_MS);
}

function isLocked(ip) {
  const s = getState(ip);
  const now = Date.now();
  if (s.lockedUntil && now < s.lockedUntil) {
    return {
      locked: true,
      retryAfterSec: Math.ceil((s.lockedUntil - now) / 1000),
    };
  }
  if (s.lockedUntil && now >= s.lockedUntil) {
    s.lockedUntil = 0;
    s.fails = [];
  }
  return { locked: false, retryAfterSec: 0 };
}

function recordFailure(ip) {
  const s = getState(ip);
  const now = Date.now();
  pruneFails(s, now);
  s.fails.push(now);
  const remaining = Math.max(0, MAX_FAILED - s.fails.length);
  if (s.fails.length >= MAX_FAILED) {
    s.lockedUntil = now + LOCK_MS;
    s.fails = [];
    console.warn(
      `[admin-auth] IP bloqueada ${ip} por ${Math.round(LOCK_MS / 60000)} min tras demasiados fallos`
    );
    return {
      locked: true,
      remaining: 0,
      retryAfterSec: Math.ceil(LOCK_MS / 1000),
    };
  }
  console.warn(
    `[admin-auth] Intento fallido desde ${ip} (${s.fails.length}/${MAX_FAILED})`
  );
  return { locked: false, remaining, retryAfterSec: 0 };
}

function recordSuccess(ip) {
  const s = getState(ip);
  s.fails = [];
  s.lockedUntil = 0;
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a), "utf8").digest();
  const hb = crypto.createHash("sha256").update(String(b), "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * @returns {{ ok: true } | { ok: false, status: number, error: string, retryAfterSec?: number, remaining?: number }}
 */
function verifyAdminKey(req, expectedKey) {
  const ip = clientIp(req);
  const lock = isLocked(ip);
  if (lock.locked) {
    return {
      ok: false,
      status: 429,
      error: `Demasiados intentos. Intenta de nuevo en ${lock.retryAfterSec} segundos.`,
      retryAfterSec: lock.retryAfterSec,
    };
  }

  const key = String(
    req.body?.key || req.get("X-Print-Admin-Key") || req.get("X-Admin-Key") || ""
  ).trim();

  if (!key) {
    return {
      ok: false,
      status: 401,
      error: "Contraseña requerida.",
    };
  }

  // Límite de longitud para evitar payloads absurdos
  if (key.length > 64) {
    const fail = recordFailure(ip);
    return {
      ok: false,
      status: fail.locked ? 429 : 401,
      error: fail.locked
        ? `Demasiados intentos. Intenta de nuevo en ${fail.retryAfterSec} segundos.`
        : "Contraseña incorrecta.",
      retryAfterSec: fail.retryAfterSec,
      remaining: fail.remaining,
    };
  }

  if (!safeEqual(key, expectedKey)) {
    const fail = recordFailure(ip);
    if (fail.locked) {
      return {
        ok: false,
        status: 429,
        error: `Demasiados intentos. Acceso bloqueado temporalmente (${Math.ceil(fail.retryAfterSec / 60)} min).`,
        retryAfterSec: fail.retryAfterSec,
      };
    }
    return {
      ok: false,
      status: 401,
      error: `Contraseña incorrecta. Intentos restantes: ${fail.remaining}.`,
      remaining: fail.remaining,
    };
  }

  recordSuccess(ip);
  return { ok: true };
}

function requireAdmin(expectedKey) {
  return function adminMiddleware(req, res, next) {
    const result = verifyAdminKey(req, expectedKey);
    if (!result.ok) {
      if (result.retryAfterSec) {
        res.set("Retry-After", String(result.retryAfterSec));
      }
      return res.status(result.status).json({
        error: result.error,
        remaining: result.remaining,
        retryAfterSec: result.retryAfterSec,
      });
    }
    next();
  };
}

module.exports = {
  verifyAdminKey,
  requireAdmin,
  clientIp,
  MAX_FAILED,
  LOCK_MS,
};
