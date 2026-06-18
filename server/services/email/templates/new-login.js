'use strict';

const { fmt, baseHtml } = require('./_helpers');

module.exports = (data) => {
  const { user, device, ip, loginAt } = data;
  const name    = user?.name || user?.email || 'לקוח יקר';
  const subject = 'כניסה חדשה לחשבון שלך';

  const text = `
שלום ${name},

זוהתה כניסה חדשה לחשבון TechVault שלך.

מכשיר: ${device || 'לא ידוע'}
${ip ? `כתובת IP: ${ip}` : ''}
זמן: ${fmt(loginAt || new Date())}

אם זו לא הייתה כניסה שלך, גש מיד להגדרות האבטחה וסיים את כל הסשנים.

TechVault
`.trim();

  const html = baseHtml(subject, `
    <h2>כניסה חדשה זוהתה 🔐</h2>
    <p>שלום ${name},</p>
    <p>זוהתה כניסה חדשה לחשבון TechVault שלך.</p>
    <table cellpadding="6" style="border-collapse:collapse;margin:12px 0">
      <tr><td style="color:#6b7280">מכשיר:</td><td><strong>${device || 'לא ידוע'}</strong></td></tr>
      ${ip ? `<tr><td style="color:#6b7280">כתובת IP:</td><td><strong>${ip}</strong></td></tr>` : ''}
      <tr><td style="color:#6b7280">זמן:</td><td><strong>${fmt(loginAt || new Date())}</strong></td></tr>
    </table>
    <p style="color:#ef4444;font-weight:600">אם זו לא הייתה כניסה שלך, גש מיד להגדרות האבטחה.</p>
  `);

  return { subject, text, html };
};
