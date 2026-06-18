'use strict';

const { fmt, fmtCurrency, baseHtml } = require('./_helpers');

module.exports = (data) => {
  const { order, payment, user } = data;
  const name    = user?.name || user?.email || 'לקוח יקר';
  const subject = `תשלום התקבל – הזמנה #${order.orderNumber}`;

  const text = `
שלום ${name},

תשלום עבור הזמנה #${order.orderNumber} התקבל בהצלחה.

סכום: ${fmtCurrency(payment?.amount ?? order.total)}
תאריך: ${fmt(payment?.paidAt ?? order.updatedAt)}

תודה שקנית ב-TechVault!
`.trim();

  const html = baseHtml(subject, `
    <h2>התשלום התקבל ✅</h2>
    <p>שלום ${name},</p>
    <p>תשלום עבור הזמנה <strong>#${order.orderNumber}</strong> התקבל בהצלחה.</p>
    <p style="font-size:18px;font-weight:bold">${fmtCurrency(payment?.amount ?? order.total)}</p>
    <p style="color:#6b7280;font-size:13px">תאריך: ${fmt(payment?.paidAt ?? order.updatedAt)}</p>
    <p>תודה שקנית ב-TechVault!</p>
  `);

  return { subject, text, html };
};
