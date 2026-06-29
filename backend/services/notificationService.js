// Channel-agnostic notification dispatch. Today only the email channel is wired;
// the whatsapp channel is a stub so it can be implemented later without touching callers.
const { sendEmail } = require('./emailService');

// Escape user-controlled strings before dropping them into the HTML template.
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Build the low-stock digest body (HTML + plain text) from the low-item rows.
const buildLowStockDigest = (items) => {
  const subject = `Low Stock Alert — ${items.length} item${items.length === 1 ? '' : 's'} need reorder`;

  const rows = items
    .map(
      (it) => `
      <tr>
        <td class="cell">${esc(it.name)}${it.clientName ? ` <span class="muted">(${esc(it.clientName)})</span>` : ''}</td>
        <td class="cell">${esc(it.typeName)}</td>
        <td class="cell num">${esc(it.availableQty)} ${esc(it.unit || '')}</td>
        <td class="cell num">${esc(it.effectiveLevel)} ${esc(it.unit || '')}</td>
      </tr>`
    )
    .join('');

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(subject)}</title>
    <style>
      body { margin: 0; padding: 0; background-color: #f4f4f4; }
      .container { background-color: #ffffff; padding: 20px; border-radius: 6px; max-width: 640px; margin: 20px auto; font-family: Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
      .heading { font-size: 1.6em; margin: 0 0 4px; }
      .sub { color: #666; font-size: 14px; margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th { text-align: left; background: #f0f0f0; padding: 8px 10px; border-bottom: 2px solid #e0e0e0; }
      .cell { padding: 8px 10px; border-bottom: 1px solid #eee; }
      .num { text-align: right; white-space: nowrap; }
      .muted { color: #999; font-weight: normal; }
      .footer-text { font-size: 12px; color: #999; margin-top: 20px; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2 class="heading">Low Stock Alert</h2>
      <p class="sub">${items.length} accessory item${items.length === 1 ? '' : 's'} at or below the reorder level.</p>
      <table>
        <thead>
          <tr><th>Item</th><th>Type</th><th>Available</th><th>Reorder level</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="footer-text">Automated daily stock check.</p>
    </div>
  </body>
  </html>`;

  const text =
    `Low Stock Alert — ${items.length} item(s) at or below reorder level:\n\n` +
    items
      .map(
        (it) =>
          `• ${it.name}${it.clientName ? ` (${it.clientName})` : ''} [${it.typeName}] — available ${it.availableQty} ${it.unit || ''}, reorder ${it.effectiveLevel} ${it.unit || ''}`
      )
      .join('\n');

  return { subject, html, text };
};

// Available channels. Add 'whatsapp.send' when that integration lands.
const channels = {
  email: {
    send: async ({ recipients, subject, html, text }) => sendEmail({ to: recipients, subject, html, text }),
  },
  whatsapp: {
    // TODO: implement via Twilio/Meta Cloud API. Kept as a stub so the dispatch seam exists.
    send: async () => ({ sent: false, channel: 'whatsapp', reason: 'not implemented' }),
  },
};

/**
 * Send the low-stock digest to the given recipients over the email channel.
 * @param {Array} items       low-stock rows from accessoryService.getLowStockItems()
 * @param {string[]} recipients
 * @returns {Promise<{ sent: boolean, channel: string, count: number, recipients: string[] }>}
 */
const notifyLowStock = async (items, recipients) => {
  const { subject, html, text } = buildLowStockDigest(items);
  const res = await channels.email.send({ recipients, subject, html, text });
  return { sent: true, channel: 'email', count: items.length, recipients: res.recipients };
};

module.exports = { notifyLowStock, buildLowStockDigest };
