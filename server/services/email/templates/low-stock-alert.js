'use strict';

const { baseHtml } = require('./_helpers');

module.exports = (data) => {
  const { product } = data;
  const subject = `התראת מלאי נמוך – ${product.name}`;

  const text = `
התראת מלאי נמוך

מוצר: ${product.name}
SKU: ${product.sku || '—'}
מלאי נוכחי: ${product.stock}
מלאי מינימלי: ${product.minStock ?? '—'}

יש לבצע הזמנת אספקה בהקדם.

TechVault Admin
`.trim();

  const html = baseHtml(subject, `
    <h2>⚠️ מלאי נמוך</h2>
    <p>המוצר הבא הגיע לרמת מלאי נמוכה:</p>
    <table cellpadding="6" style="border-collapse:collapse;margin:12px 0">
      <tr><td style="color:#6b7280">מוצר:</td><td><strong>${product.name}</strong></td></tr>
      <tr><td style="color:#6b7280">SKU:</td><td>${product.sku || '—'}</td></tr>
      <tr><td style="color:#6b7280">מלאי נוכחי:</td><td style="color:#ef4444;font-weight:700">${product.stock}</td></tr>
      <tr><td style="color:#6b7280">מלאי מינימלי:</td><td>${product.minStock ?? '—'}</td></tr>
    </table>
    <p>יש לבצע הזמנת אספקה בהקדם.</p>
  `);

  return { subject, text, html };
};
