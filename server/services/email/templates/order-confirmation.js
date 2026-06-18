'use strict';

const { fmt, fmtCurrency, baseHtml } = require('./_helpers');

module.exports = (data) => {
  const { order, user } = data;
  const name    = user?.name || user?.email || 'לקוח יקר';
  const items   = (order.items || [])
    .map(i => `  - ${i.name} × ${i.quantity}  ${fmtCurrency(i.price * i.quantity)}`)
    .join('\n');

  const subject = `אישור הזמנה #${order.orderNumber}`;

  const text = `
שלום ${name},

הזמנתך התקבלה בהצלחה!

מספר הזמנה: ${order.orderNumber}
תאריך: ${fmt(order.createdAt)}
סה"כ לתשלום: ${fmtCurrency(order.total)}

פריטים:
${items}

כתובת משלוח:
${order.shippingAddress?.street}, ${order.shippingAddress?.city}

תודה שקנית ב-TechVault!
`.trim();

  const html = baseHtml(subject, `
    <h2>הזמנתך התקבלה! 🎉</h2>
    <p>שלום ${name},</p>
    <p>מספר הזמנה: <strong>${order.orderNumber}</strong></p>
    <p>תאריך: ${fmt(order.createdAt)}</p>
    <table width="100%" cellpadding="6" cellspacing="0">
      <thead><tr style="background:#f3f4f6">
        <th align="right">מוצר</th><th align="center">כמות</th><th align="left">מחיר</th>
      </tr></thead>
      <tbody>
        ${(order.items || []).map(i => `
          <tr>
            <td align="right">${i.name}</td>
            <td align="center">${i.quantity}</td>
            <td align="left">${fmtCurrency(i.price * i.quantity)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <p style="font-size:18px;font-weight:bold;margin-top:16px">סה"כ: ${fmtCurrency(order.total)}</p>
    <p style="color:#6b7280;font-size:13px">כתובת משלוח: ${order.shippingAddress?.street}, ${order.shippingAddress?.city}</p>
    <p>תודה שקנית ב-TechVault!</p>
  `);

  return { subject, text, html };
};
