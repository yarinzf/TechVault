// Lightweight, dependency-free customer receipt generator — builds a
// self-contained downloadable HTML file from the persisted Order snapshot
// only (never recalculated from current product prices; never anything
// card-sensitive beyond the safe last4 already persisted on the order).
//
// This is NOT a real invoice-generation system — no server-side PDF/
// e-invoice pipeline exists in this app. This is the safest meaningful
// fallback for Sapir's "הורד חשבונית" action given that gap (see
// OrderSuccessPage's report for this being a functionality gap for the
// upcoming audit).

const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function buildReceiptHtml(order, { t, formatPrice, paymentLabel, fmtDate }) {
  const rows = (order.items ?? []).map(item => `
    <tr>
      <td>${esc(item.name)}</td>
      <td style="text-align:center">${esc(item.quantity)}</td>
      <td style="text-align:left">${esc(formatPrice((item.unitPrice ?? 0) * item.quantity))}</td>
    </tr>`).join('');

  const money = (label, value, negative = false) => `
    <tr><td colspan="2" style="padding-top:4px;color:#555;">${esc(label)}</td>
        <td style="text-align:left;padding-top:4px;">${negative ? '-' : ''}${esc(formatPrice(value))}</td></tr>`;

  const couponDiscount = order.couponDiscount ?? 0;
  const pointsValue    = order.pointsRedeemedValue ?? 0;
  const shippingCost   = order.shippingCost ?? 0;
  const hasShipping    = (order.items ?? []).some(i => i.itemType !== 'membership');

  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>${esc(`חשבונית הזמנה ${order.orderNumber}`)}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 32px; color: #111; max-width: 640px; margin: 0 auto; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .muted { color: #666; font-size: 13px; margin-bottom: 24px; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: right; border-bottom: 1px solid #ddd; padding: 6px 4px; color: #555; font-size: 12px; }
  td { padding: 6px 4px; border-bottom: 1px solid #f0f0f0; }
  .total td { font-weight: bold; font-size: 16px; border-top: 2px solid #111; border-bottom: none; padding-top: 10px; }
</style></head>
<body>
  <h1>TechVault — חשבונית הזמנה</h1>
  <div class="muted">
    מספר הזמנה: ${esc(order.orderNumber)}<br>
    תאריך: ${esc(fmtDate(order.createdAt))}<br>
    אמצעי תשלום: ${esc(paymentLabel)}
  </div>
  <table>
    <thead><tr><th>מוצר</th><th style="text-align:center">כמות</th><th style="text-align:left">מחיר</th></tr></thead>
    <tbody>
      ${rows}
      ${money(t('order.success.subtotal_label'), order.subtotal ?? 0)}
      ${couponDiscount > 0 ? money(t('checkout.coupon_discount'), couponDiscount, true) : ''}
      ${pointsValue > 0 ? money(t('order.points_redeemed'), pointsValue, true) : ''}
      ${hasShipping ? money(t('checkout.shipping'), shippingCost) : ''}
      <tr class="total"><td colspan="2">${esc(t('order.total'))}</td><td style="text-align:left">${esc(formatPrice(order.total ?? 0))}</td></tr>
    </tbody>
  </table>
</body></html>`;
}

export function downloadReceipt(order, ctx) {
  const html = buildReceiptHtml(order, ctx);
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `techvault-receipt-${order.orderNumber}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
