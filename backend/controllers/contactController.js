const sgMail = require('@sendgrid/mail');
// require('dotenv').config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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
      <p class="text"><strong>Email:</strong> ${email}</p>
      <p class="text">${message}</p>
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

  const msg = {
    to: process.env.FROM_EMAIL, // Send to your verified email
    from: process.env.FROM_EMAIL, // Must match verified sender
    replyTo: email, // Allows replying to the sender’s email
    subject: 'G R E Y S A G E  -  New Potential Client',
    text: `Email: ${email}\nMessage: ${message}`, // Plain text fallback
    html: generateEmailTemplate({ email, message }), // HTML template
  };

  try {
    await sgMail.send(msg);
    res.status(200).json({ message: 'Email sent successfully!' });
  } catch (error) {
    console.error('Error sending email:', error.response?.body || error);
    res.status(500).json({ error: 'Failed to send email' });
  }
};

module.exports = { sendEmail };