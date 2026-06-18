'use strict';

const { fmtCurrency, baseHtml } = require('./_helpers');

module.exports = (data) => {
  const { order, user, reason } = data;
  const name    = user?.name || user?.email || 'לקוח יקר';
  const subject = `התשלום נכשל – הזמנה #${order.orderNumber}`;

  const text = `
שלום ${name},

לצערנו, התשלום עבור הזמנה #${order.orderNumber} (${fmtCurrency(order.total)}) נכשל.
${reason ? `סיבה: ${reason}` : ''}

ניתן לנסות שנית דרך אזור ההזמנות שלך.

TechVault
`.trim();

  const html = baseHtml(subject, `
    <h2>התשלום נכשל ❌</h2>
    <p>שלום ${name},</p>
    <p>לצערנו, התשלום עבור הזמנה <strong>#${order.orderNumber}</strong> (${fmtCurrency(order.total)}) נכשל.</p>
    ${reason ? `<p style="color:#ef4444">סיבה: ${reason}</p>` : ''}
    <p>ניתן לנסות שנית דרך אזור ההזמנות שלך.</p>
  `);

  return { subject, text, html };
};
