'use strict';

const { baseHtml } = require('./_helpers');

module.exports = (data) => {
  const { user, resetUrl } = data;
  const name    = user?.name || user?.email || 'לקוח יקר';
  const subject = 'איפוס סיסמה ל-TechVault';

  const text = `
שלום ${name},

קיבלנו בקשה לאיפוס הסיסמה לחשבון TechVault שלך.

לחץ על הקישור הבא לאיפוס הסיסמה (תקף שעה אחת):
${resetUrl}

אם לא ביקשת לאפס את הסיסמה, תוכל להתעלם מהודעה זו — הסיסמה שלך לא תשתנה.

TechVault
`.trim();

  const html = baseHtml(subject, `
    <h2>איפוס סיסמה 🔑</h2>
    <p>שלום ${name},</p>
    <p>קיבלנו בקשה לאיפוס הסיסמה לחשבון TechVault שלך.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${resetUrl}"
         style="display:inline-block;padding:14px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px">
        אפס סיסמה
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px">
      הקישור תקף לשעה אחת בלבד.<br>
      אם לא ביקשת לאפס את הסיסמה, תוכל להתעלם מהודעה זו — הסיסמה שלך לא תשתנה.
    </p>
    <p style="color:#9ca3af;font-size:12px;word-break:break-all">
      לא ניתן ללחוץ על הכפתור? העתיקו את הקישור הבא לדפדפן:<br>${resetUrl}
    </p>
  `);

  return { subject, text, html };
};
