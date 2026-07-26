// Marketing "contact us" form → emails the configured inbox. Routed through the shared
// emailService (Brevo SMTP), so there's one email path for the whole app.
const { sendEmail: sendMail } = require('../services/emailService');

// This endpoint is anonymous, so `email` and `message` are fully attacker-controlled
// and were previously interpolated raw into the HTML body — anyone could inject
// markup (working phishing links, hidden content, spoofed sender blocks) into a mail
// that lands in the company inbox looking like it came from our own system.
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Header injection guard: a newline in a header value can smuggle extra headers.
const singleLine = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

// HTML email template as a string
const generateEmailTemplate = ({ email, message }) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Potential Client for G R E Y S A G E</title>
    <style>
      body { margin: 0; padding: 0; background-color: #f4f4f4; }
      .container { background-color: #ffffff; padding: 0 20px; border-radius: 6px; max-width: 600px; margin: 20px 20px; }
      .heading { font-family: Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 2em; color: #333; }
      .text { font-family: Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 16px; color: #333; line-height: 1.6; }
      .footer-text { font-family: Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #999; margin-top: 20px; }
      hr { border: 0; border-top: 1px solid #eee; margin: 20px 20px; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2 class="heading">New Potential Client for GREYSAGE Clothing</h2>
      <hr>
      <p class="text"><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p class="text">${escapeHtml(message)}</p>
      <hr>
      <p class="footer-text">This email was sent from <a href='https://greysageco.vercel.app'>GREYSAGE Clothing Company Profile.</a></p>
    </div>
  </body>
  </html>
`;

const sendEmail = async (req, res) => {
  const { email, message } = req.body;

  // Validate input
  if (!email || !message) {
    return res.status(400).json({ error: 'Email and message are required' });
  }
  const cleanEmail = singleLine(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (String(message).length > 5000) {
    return res.status(400).json({ error: 'Message is too long' });
  }

  try {
    await sendMail({
      to: process.env.FROM_EMAIL,   // deliver to your verified inbox
      replyTo: cleanEmail,          // reply goes straight to the prospect
      subject: 'G R E Y S A G E  -  New Potential Client',
      text: `Email: ${cleanEmail}\nMessage: ${message}`,
      html: generateEmailTemplate({ email: cleanEmail, message }),
    });
    res.status(200).json({ message: 'Email sent successfully!' });
  } catch (error) {
    console.error('Error sending email:', error.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
};

module.exports = { sendEmail };
