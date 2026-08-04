/**
 * Cloudflare Turnstile — verificación server-side.
 * Si no hay TURNSTILE_SECRET_KEY, se omite (dev / sin captcha).
 */

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || "";
const TURNSTILE_SITE = process.env.TURNSTILE_SITE_KEY || "";

function isTurnstileEnabled() {
  return Boolean(TURNSTILE_SECRET && TURNSTILE_SITE);
}

/**
 * @param {string} token
 * @param {string} [remoteip]
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function verifyTurnstile(token, remoteip) {
  if (!isTurnstileEnabled()) {
    return { ok: true };
  }
  const t = String(token || "").trim();
  if (!t) {
    return { ok: false, error: "Completa la verificación de seguridad (captcha)." };
  }
  try {
    const body = new URLSearchParams();
    body.set("secret", TURNSTILE_SECRET);
    body.set("response", t);
    if (remoteip) body.set("remoteip", remoteip);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.success === true) {
      return { ok: true };
    }
    console.warn("[turnstile] falló:", data && data["error-codes"]);
    return {
      ok: false,
      error: "Verificación de seguridad fallida. Recarga e inténtalo de nuevo.",
    };
  } catch (e) {
    console.error("[turnstile]", e.message);
    return {
      ok: false,
      error: "No se pudo verificar el captcha. Intenta de nuevo en un momento.",
    };
  }
}

module.exports = {
  isTurnstileEnabled,
  verifyTurnstile,
  TURNSTILE_SITE_KEY: TURNSTILE_SITE,
};
