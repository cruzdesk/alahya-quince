/**
 * Alertas por correo al recibir una reserva.
 *
 * Opciones (cualquiera):
 * 1) RESEND_API_KEY + NOTIFY_EMAIL  (recomendado en Render — free en resend.com)
 * 2) SMTP_HOST + SMTP_USER + SMTP_PASS + NOTIFY_EMAIL  (Gmail, Outlook, etc.)
 *
 * Si no hay config, no falla la reserva: solo se registra en logs.
 */

async function sendReservationAlert(reservation) {
  const to = (process.env.NOTIFY_EMAIL || "").trim();
  if (!to) {
    console.log("[email] Sin NOTIFY_EMAIL — alerta omitida");
    return { sent: false, reason: "no_notify_email" };
  }

  const subject = `Nueva reserva XV Alahya — ${reservation.name} (${reservation.guests} inv.)`;
  const text = [
    "Nueva reserva registrada",
    "",
    `Nombre: ${reservation.name}`,
    `Invitados: ${reservation.guests}`,
    `Teléfono: ${reservation.phone || "—"}`,
    `Correo: ${reservation.email || "—"}`,
    `Notas: ${reservation.notes || "—"}`,
    `ID: ${reservation.id}`,
    `Fecha: ${reservation.created_at || new Date().toISOString()}`,
    "",
    "Panel: https://alahya-quince.onrender.com/#reservar",
  ].join("\n");

  const html = `
    <div style="font-family:Georgia,serif;max-width:520px;color:#1a1212">
      <h2 style="color:#9b1c1c;margin:0 0 8px">Nueva reserva — XV Alahya</h2>
      <p style="margin:0 0 16px;color:#5c4a48">Victorian Masquerade Ball · 10 oct 2026</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px">
        <tr><td style="padding:6px 0;color:#5c4a48">Nombre</td><td style="padding:6px 0;font-weight:600">${escapeHtml(reservation.name)}</td></tr>
        <tr><td style="padding:6px 0;color:#5c4a48">Invitados</td><td style="padding:6px 0;font-weight:600">${reservation.guests}</td></tr>
        <tr><td style="padding:6px 0;color:#5c4a48">Teléfono</td><td style="padding:6px 0">${escapeHtml(reservation.phone || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#5c4a48">Correo</td><td style="padding:6px 0">${escapeHtml(reservation.email || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#5c4a48">Notas</td><td style="padding:6px 0">${escapeHtml(reservation.notes || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#5c4a48">ID</td><td style="padding:6px 0">#${reservation.id}</td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:13px;color:#5c4a48">
        Admin: <a href="https://alahya-quince.onrender.com/#reservar">alahya-quince.onrender.com</a>
      </p>
    </div>
  `;

  // 1) Resend
  if (process.env.RESEND_API_KEY) {
    try {
      const from =
        process.env.EMAIL_FROM || "Alahya XV <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [to], subject, text, html }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error("[email] Resend error:", res.status, body);
        return { sent: false, reason: "resend_error", detail: body };
      }
      console.log("[email] Alerta enviada vía Resend a", to);
      return { sent: true, provider: "resend" };
    } catch (err) {
      console.error("[email] Resend fail:", err.message);
      return { sent: false, reason: "resend_exception", detail: err.message };
    }
  }

  // 2) SMTP (nodemailer)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const nodemailer = require("nodemailer");
      const port = Number(process.env.SMTP_PORT || 587);
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        html,
      });
      console.log("[email] Alerta enviada vía SMTP a", to);
      return { sent: true, provider: "smtp" };
    } catch (err) {
      console.error("[email] SMTP fail:", err.message);
      return { sent: false, reason: "smtp_error", detail: err.message };
    }
  }

  console.log("[email] Sin RESEND_API_KEY ni SMTP — alerta no enviada");
  return { sent: false, reason: "no_provider" };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { sendReservationAlert };
