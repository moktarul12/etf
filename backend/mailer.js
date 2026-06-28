// Email notifications for trade actions via SMTP (nodemailer).
// Configure with env vars (e.g. a Gmail account + app password):
//   SMTP_HOST   e.g. smtp.gmail.com
//   SMTP_PORT   e.g. 465 (SSL) or 587 (STARTTLS)
//   SMTP_USER   the SMTP account username / email
//   SMTP_PASS   the SMTP password / app password
//   EMAIL_FROM  optional "from" address (defaults to SMTP_USER)
// If SMTP is not configured, email sending is silently skipped (no-op).

const nodemailer = require('nodemailer');

let transporter = null;
let configChecked = false;

function getTransporter() {
  if (configChecked) return transporter;
  configChecked = true;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[Mailer] SMTP not configured — trade emails disabled.');
    return null;
  }

  const port = parseInt(SMTP_PORT, 10) || 587;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // true for 465, false for 587/STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

function formatAction(a) {
  if (a.type === 'SELL') {
    const sign = a.profit >= 0 ? '+' : '';
    return `SELL ${a.code} @ ₹${a.price?.toFixed(2)} — P/L ${sign}₹${a.profit?.toFixed(2)} (${sign}${a.profitPct?.toFixed(2)}%) — ${a.reason}`;
  }
  return `BUY ${a.code} @ ₹${a.price?.toFixed(2)} × ${a.quantity} = ₹${a.totalCost?.toFixed(2)} — ${a.reason}`;
}

// Send a summary email of the actions taken in a run. No-op if SMTP unset.
async function sendTradeEmail(to, actions) {
  const tx = getTransporter();
  if (!tx || !to || !actions || !actions.length) return;

  const buys = actions.filter(a => a.type === 'BUY');
  const sells = actions.filter(a => a.type === 'SELL');
  const lines = actions.map(formatAction);

  const subject = `ETF Dukan — ${buys.length} buy(s), ${sells.length} sell(s)`;
  const text = `Your auto-trade engine took the following action(s):\n\n${lines.join('\n')}\n\n— ETF Dukan`;
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">
      <h2 style="margin:0 0 12px">ETF Dukan — Auto Trade</h2>
      <p style="margin:0 0 10px">Your auto-trade engine took ${actions.length} action(s):</p>
      <ul style="padding-left:18px;margin:0 0 12px">
        ${actions.map(a => `<li style="margin-bottom:6px;color:${a.type === 'SELL' ? '#b45309' : '#15803d'}">${formatAction(a)}</li>`).join('')}
      </ul>
      <p style="font-size:12px;color:#64748b">This is an automated message from ETF Dukan.</p>
    </div>`;

  try {
    await tx.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    console.log(`[Mailer] Sent trade email to ${to} (${actions.length} actions)`);
  } catch (err) {
    console.error('[Mailer] Failed to send email:', err.message);
  }
}

module.exports = { sendTradeEmail };
