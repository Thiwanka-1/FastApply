//sendEmail.js
import nodemailer from 'nodemailer';

const smtpConfigured = () => {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
};

// Sends through whatever SMTP the deployment configures (a free Gmail app
// password, Outlook, Brevo, etc.). Without SMTP settings the mail content is
// logged to the server console instead so the flow stays testable in dev.
export const sendEmail = async ({ to, subject, text, html }) => {
  if (!smtpConfigured()) {
    console.warn(
      '[FastApply] SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS). ' +
      'Email was NOT sent — logging it for development instead:'
    );
    console.warn(`To: ${to}\nSubject: ${subject}\n\n${text}`);
    return { delivered: false, devLogged: true };
  }

  const port = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"FastApply" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html
  });

  return { delivered: true };
};
