'use strict';

const { fmt, baseHtml } = require('./_helpers');

module.exports = (data) => {
  const { returnRequest, order, user } = data;
  const name    = user?.name || user?.email || 'לקוח יקר';
  const subject = `בקשת החזרה התקבלה – הזמנה #${order?.orderNumber || ''}`;

  const text = `
שלום ${name},

בקשת ההחזרה שלך עבור הזמנה #${order?.orderNumber || ''} התקבלה ונמצאת בבדיקה.
מספר בקשה: ${returnRequest._id}
תאריך: ${fmt(returnRequest.createdAt)}

נעדכן אותך ברגע שהבקשה תטופל.

TechVault
`.trim();

  const html = baseHtml(subject, `
    <h2>בקשת ההחזרה התקבלה 📦</h2>
    <p>שלום ${name},</p>
    <p>בקשת ההחזרה שלך עבור הזמנה <strong>#${order?.orderNumber || ''}</strong> התקבלה ונמצאת בבדיקה.</p>
    <p style="color:#6b7280;font-size:13px">מספר בקשה: ${returnRequest._id}<br>תאריך: ${fmt(returnRequest.createdAt)}</p>
    <p>נעדכן אותך ברגע שהבקשה תטופל.</p>
  `);

  return { subject, text, html };
};
