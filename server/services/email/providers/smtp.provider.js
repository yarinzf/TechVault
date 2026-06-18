'use strict';

/**
 * SMTP email provider using nodemailer.
 * Activated when EMAIL_PROVIDER=smtp and SMTP_HOST is set.
 * Install: npm install nodemailer
 */

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  // Lazy require so nodemailer is optional at startup
  const nodemailer = require('nodemailer');

  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
};

const send = async ({ to, subject, text, html }) => {
  const transport = getTransporter();
  await transport.sendMail({
    from:    process.env.EMAIL_FROM || 'noreply@techvault.com',
    to,
    subject,
    text,
    html,
  });
};

module.exports = { send };
