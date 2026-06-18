'use strict';

const { fmt, baseHtml } = require('./_helpers');

module.exports = (data) => {
  const { user, changedAt } = data;
  const name    = user?.name || user?.email || 'לקוח יקר';
  const when    = fmt(changedAt || new Date());
  const subject = 'הסיסמה שלך שונתה';

  const text = `
שלום ${name},

הסיסמה לחשבון TechVault שלך שונתה בהצלחה ב-${when}.

אם לא אתה ביצעת את הפעולה הזו, פנה אלינו מיד וגש להגדרות האבטחה כדי לסיים את כל הסשנים.

TechVault
`.trim();

  const html = baseHtml(subject, `
    <h2>הסיסמה שונתה 🔒</h2>
    <p>שלום ${name},</p>
    <p>הסיסמה לחשבון TechVault שלך שונתה בהצלחה ב-<strong>${when}</strong>.</p>
    <p style="color:#ef4444;font-weight:600">אם לא אתה ביצעת את הפעולה הזו, פנה אלינו מיד.</p>
    <p style="color:#6b7280;font-size:13px">לניהול הסשנים הפעילים, גש להגדרות האבטחה בפרופיל שלך.</p>
  `);

  return { subject, text, html };
};
