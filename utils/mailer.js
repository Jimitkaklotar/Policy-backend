const nodemailer = require('nodemailer');

const SENDER_EMAIL = 'infotchwebbytouch@gmail.com';
const SENDER_PASS = 'ljsydlumpmlsnrdo';
const AUTHOR_EMAIL = 'jimitkaklotar786@gmail.com';

// Configure SMTP transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: SENDER_EMAIL,
    pass: SENDER_PASS
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
    console.log(`[Mailer] Notification email sent successfully: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('[Mailer] Failed to send notification email:', error);
    return false;
  }
};

module.exports = {
  sendMailNotification
};
