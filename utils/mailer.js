const nodemailer = require('nodemailer');

const SENDER_EMAIL = 'maheshnandwani13@gmail.com';
// 🔑 NOTE: Gmail requires an App Password (not your regular password).
// Generate one at: https://myaccount.google.com/apppasswords
// Steps: Google Account → Security → 2-Step Verification → App passwords
const SENDER_PASS = 'Preet@13';
const AUTHOR_EMAIL = 'maheshnandwani13@gmail.com';

// Configure SMTP transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: SENDER_EMAIL,
    pass: SENDER_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verify SMTP connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('[Mailer] ❌ SMTP connection failed:', error.message);
    console.error('[Mailer] ⚠️  Emails will NOT be sent. Please update the App Password in utils/mailer.js');
    console.error('[Mailer] 👉 Go to: https://myaccount.google.com/apppasswords to generate a new one.');
  } else {
    console.log('[Mailer] ✅ SMTP connection verified. Email notifications are active.');
  }
});

/**
 * Sends a stylized email notification to a client and CCs the author.
 * @param {string} toEmail - The recipient's email address.
 * @param {string} subject - The subject of the email.
 * @param {string} title - Header title inside the template.
 * @param {string} contentHtml - HTML content body.
 */
const sendMailNotification = async (toEmail, subject, title, contentHtml) => {
  const recipients = [AUTHOR_EMAIL];
  if (toEmail && toEmail.trim() !== '' && toEmail.toLowerCase() !== AUTHOR_EMAIL.toLowerCase()) {
    recipients.push(toEmail.trim());
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          background-color: #f4f6f9;
          margin: 0;
          padding: 0;
          color: #333333;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background-color: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
          border: 1px solid #eef2f5;
        }
        .header {
          background: linear-gradient(135deg, #004DC0 0%, #002D72 100%);
          padding: 30px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 24px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        .content {
          padding: 40px 30px;
          line-height: 1.6;
        }
        .content h2 {
          color: #111111;
          font-size: 20px;
          margin-top: 0;
          margin-bottom: 20px;
        }
        .footer {
          background-color: #f8fafc;
          padding: 20px 30px;
          text-align: center;
          font-size: 12px;
          color: #64748b;
          border-top: 1px solid #eef2f5;
        }
        .btn {
          display: inline-block;
          background-color: #004DC0;
          color: #ffffff !important;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-weight: 500;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>TrustAssure Broker Portal</h1>
        </div>
        <div class="content">
          <h2>${title}</h2>
          ${contentHtml}
        </div>
        <div class="footer">
          <p>This is an automated notification from the TrustAssure CRM Broker Portal.</p>
          <p>&copy; ${new Date().getFullYear()} TrustAssure. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"TrustAssure Notifications" <${SENDER_EMAIL}>`,
      to: recipients.join(', '),
      subject: subject,
      html: html
    });
    console.log(`[Mailer] ✅ Email sent successfully to: ${recipients.join(', ')} | ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('[Mailer] ❌ Failed to send email:', error.message);
    return false;
  }
};

/**
 * Quick test: sends a plain test email to the author email.
 */
const sendTestEmail = async () => {
  return sendMailNotification(
    AUTHOR_EMAIL,
    'TrustAssure - Email Test ✅',
    'Email System Test',
    `<p>This is a <strong>test email</strong> from the TrustAssure CRM system.</p>
     <p>If you received this, your email notifications are working correctly! ✅</p>
     <p style="color:#64748b;font-size:13px;">Sent at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>`
  );
};

module.exports = {
  sendMailNotification,
  sendTestEmail,
  SENDER_EMAIL,
  AUTHOR_EMAIL
};
