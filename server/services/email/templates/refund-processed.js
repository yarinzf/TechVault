'use strict';

const { fmt, fmtCurrency, baseHtml } = require('./_helpers');

module.exports = (data) => {
  const { order, refund, user } = data;
  const name     = user?.name || user?.email || 'לקוח יקר';
  const amount   = fmtCurrency(refund?.amount ?? order.total);
  const isFull   = !!refund?.isFullRefund;
  const subject  = `החזר כספי ${isFull ? 'מלא' : 'חלקי'} – הזמנה #${order.orderNumber}`;

  const text = `
שלום ${name},

${isFull ? 'החזר כספי מלא' : 'החזר כספי חלקי'} בסכום ${amount} עבור הזמנה #${order.orderNumber} אושר.
${refund?.reason ? `סיבה: ${refund.reason}` : ''}
ההחזר יופיע בחשבונך תוך 5-7 ימי עסקים.

TechVault
`.trim();

  const html = baseHtml(subject, `
    <h2>החזר כספי אושר 💸</h2>
    <p>שלום ${name},</p>
    <p>${isFull ? 'החזר כספי מלא' : 'החזר כספי חלקי'} בסכום <strong>${amount}</strong> עבור הזמנה <strong>#${order.orderNumber}</strong> אושר.</p>
    ${refund?.reason ? `<p style="color:#6b7280">סיבה: ${refund.reason}</p>` : ''}
    <p style="color:#6b7280;font-size:13px">ההחזר יופיע בחשבונך תוך 5-7 ימי עסקים.</p>
  `);

  return { subject, text, html };
};
