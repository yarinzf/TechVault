'use strict';

/**
 * Email service — provider abstraction.
 * Selects the active provider from EMAIL_PROVIDER env var (default: console).
 * Never throws to callers — failures are logged and swallowed.
 */

const templates = require('./templates');

const getProvider = () => {
  const name = (process.env.EMAIL_PROVIDER || 'console').toLowerCase();
  if (name === 'smtp') return require('./providers/smtp.provider');
  return require('./providers/console.provider');
};

/**
 * Send a raw email. Rarely called directly — use sendTemplate instead.
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const provider = getProvider();
    await provider.send({ to, subject, html, text });
  } catch (err) {
    console.error('[email] Failed to send email:', err.message);
  }
};

/**
 * Render a named template and send it.
 * @param {string} templateName  - key in templates/index.js
 * @param {string} to            - recipient email address
 * @param {object} data          - template-specific data object
 */
const sendTemplate = async (templateName, to, data) => {
  if (!to) return; // no recipient — silently skip
  const tpl = templates[templateName];
  if (!tpl) {
    console.error(`[email] Unknown template: "${templateName}"`);
    return;
  }
  try {
    const { subject, html, text } = tpl(data);
    await sendEmail({ to, subject, html, text });
  } catch (err) {
    console.error(`[email] Template "${templateName}" failed:`, err.message);
  }
};

module.exports = { sendEmail, sendTemplate };
