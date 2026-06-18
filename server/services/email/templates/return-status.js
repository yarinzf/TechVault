'use strict';

const { fmtCurrency, baseHtml } = require('./_helpers');

const STATUS_HE = {
  approved:  'אושרה',
  rejected:  'נדחתה',
  refunded:  'הסתיימה עם החזר כספי',
  completed: 'הושלמה',
};

module.exports = (data) => {
  const { returnRequest, order, user, status, refundAmount } = data;
  const name       = user?.name || user?.email || 'לקוח יקר';
  const statusHe   = STATUS_HE[status] || status;
  const approved   = status === 'approved' || status === 'refunded';
  const subject    = `בקשת ההחזרה ${statusHe} – הזמנה #${order?.orderNumber || ''}`;

  const text = `
שלום ${name},

בקשת ההחזרה שלך עבור הזמנה #${order?.orderNumber || ''} ${statusHe}.
${refundAmount ? `סכום ההחזר הכספי: ${fmtCurrency(refundAmount)}` : ''}
${returnRequest.rejectionReason ? `סיבת הדחייה: ${returnRequest.rejectionReason}` : ''}

TechVault
`.trim();

  const html = baseHtml(subject, `
    <h2>בקשת ההחזרה ${statusHe} ${approved ? '✅' : '❌'}</h2>
    <p>שלום ${name},</p>
    <p>בקשת ההחזרה שלך עבור הזמנה <strong>#${order?.orderNumber || ''}</strong> ${statusHe}.</p>
    ${refundAmount ? `<p>סכום ההחזר הכספי: <strong>${fmtCurrency(refundAmount)}</strong></p>` : ''}
    ${returnRequest.rejectionReason
      ? `<p style="color:#ef4444">סיבת הדחייה: ${returnRequest.rejectionReason}</p>`
      : ''}
  `);

  return { subject, text, html };
};
