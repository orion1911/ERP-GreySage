// Thin wrapper over Brevo (Sendinblue) SMTP via nodemailer so the rest of the app
// sends mail through one place. Env vars:
//   BREVO_SMTP_HOST  — SMTP host (default 'smtp-relay.brevo.com')
//   BREVO_SMTP_PORT  — 587 (STARTTLS, default) or 465 (implicit TLS)
//   BREVO_SMTP_USER  — Brevo SMTP login   (Brevo → SMTP & API → SMTP tab)
//   BREVO_SMTP_KEY   — Brevo SMTP key / master password (same screen)
//   FROM_EMAIL       — verified sender in Brevo (also the default reply-to)
const nodemailer = require('nodemailer');

// One reusable transporter, built lazily on first send (so a missing config doesn't
// crash on require). Returns null when SMTP credentials aren't set.
let transporter = null;
const getTransporter = () => {
  if (transporter) return transporter;
  const host = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
  const port = Number(process.env.BREVO_SMTP_PORT) || 587;
  const user = process.env.BREVO_SMTP_USER;
  const pass = process.env.BREVO_SMTP_KEY;
  if (!user || !pass) return null;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 upgrades via STARTTLS
    auth: { user, pass },
  });
  return transporter;
};

/**
 * Send an email via Brevo SMTP.
 * @param {Object} opts
 * @param {string|string[]} opts.to   one address or a list
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.text]        plain-text fallback
 * @param {string} [opts.replyTo]
 * @returns {Promise<{ sent: boolean, recipients: string[] }>}
 */
const sendEmail = async ({ to, subject, html, text, replyTo }) => {
  const tx = getTransporter();
  if (!tx || !process.env.FROM_EMAIL) {
    throw new Error('Email not configured: BREVO_SMTP_USER, BREVO_SMTP_KEY and FROM_EMAIL must be set.');
  }
  const recipients = (Array.isArray(to) ? to : [to])
    .map((e) => String(e || '').trim())
    .filter(Boolean);
  if (!recipients.length) {
    throw new Error('No recipients provided.');
  }

  const base = {
    from: process.env.FROM_EMAIL,
    subject,
    html,
    text: text || '',
    ...(replyTo ? { replyTo } : {}),
  };

  try {
    // Each recipient gets their own copy so addresses aren't leaked in a shared To: header.
    await Promise.all(recipients.map((rcpt) => tx.sendMail({ ...base, to: rcpt })));
  } catch (e) {
    // Surface the SMTP server's response when present; nodemailer's bare message can be terse.
    throw new Error(e.response ? `SMTP: ${e.response}` : (e.message || 'Email send failed'));
  }
  return { sent: true, recipients };
};

module.exports = { sendEmail };
