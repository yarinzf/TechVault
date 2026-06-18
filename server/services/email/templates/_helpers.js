'use strict';

const fmt = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const fmtCurrency = (amount) => {
  if (amount == null) return '—';
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amount);
};

const baseHtml = (title, body) => `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;direction:rtl">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr><td style="background:#111827;padding:24px 32px">
          <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-.5px">TechVault</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;color:#111827;font-size:15px;line-height:1.6">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f3f4f6;padding:16px 32px;color:#9ca3af;font-size:12px;text-align:center">
          TechVault · כל הזכויות שמורות
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

module.exports = { fmt, fmtCurrency, baseHtml };
