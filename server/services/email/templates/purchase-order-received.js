'use strict';

const { fmt, fmtCurrency, baseHtml } = require('./_helpers');

module.exports = (data) => {
  const { purchaseOrder } = data;
  const subject = `הזמנת רכש חדשה #${purchaseOrder.orderNumber || purchaseOrder._id}`;

  const lines = (purchaseOrder.items || [])
    .map(i => `  - ${i.productName || i.product} × ${i.quantity}  ${fmtCurrency(i.unitCost * i.quantity)}`)
    .join('\n');

  const text = `
הזמנת רכש חדשה התקבלה

מספר הזמנה: ${purchaseOrder.orderNumber || purchaseOrder._id}
ספק: ${purchaseOrder.supplier?.name || '—'}
תאריך: ${fmt(purchaseOrder.createdAt)}
עלות כוללת: ${fmtCurrency(purchaseOrder.totalCost)}

פריטים:
${lines}

TechVault Admin
`.trim();

  const html = baseHtml(subject, `
    <h2>הזמנת רכש חדשה 📋</h2>
    <p>מספר הזמנה: <strong>${purchaseOrder.orderNumber || purchaseOrder._id}</strong></p>
    <p>ספק: ${purchaseOrder.supplier?.name || '—'}</p>
    <p>תאריך: ${fmt(purchaseOrder.createdAt)}</p>
    <table width="100%" cellpadding="6" cellspacing="0">
      <thead><tr style="background:#f3f4f6">
        <th align="right">מוצר</th><th align="center">כמות</th><th align="left">עלות</th>
      </tr></thead>
      <tbody>
        ${(purchaseOrder.items || []).map(i => `
          <tr>
            <td align="right">${i.productName || i.product}</td>
            <td align="center">${i.quantity}</td>
            <td align="left">${fmtCurrency(i.unitCost * i.quantity)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <p style="font-size:18px;font-weight:bold;margin-top:16px">עלות כוללת: ${fmtCurrency(purchaseOrder.totalCost)}</p>
  `);

  return { subject, text, html };
};
