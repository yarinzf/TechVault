import { useState, useEffect, useCallback } from 'react';
import {
  Download, RefreshCw, TrendingUp, Package, RotateCcw,
  Ticket, ShoppingCart, ClipboardList, AlertTriangle, ChevronDown, ChevronUp,
  DollarSign, BarChart3, Archive,
} from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';

// ── Report type definitions ───────────────────────────────────────────────────

const REPORT_TYPES = [
  {
    id: 'sales',
    label: 'מכירות',
    icon: TrendingUp,
    color: '#2563eb',
    description: 'הכנסות ומגמות לפי תקופה',
    hasDateRange: true,
    hasPeriod: true,
  },
  {
    id: 'orders',
    label: 'הזמנות',
    icon: ShoppingCart,
    color: '#7c3aed',
    description: 'רשימת הזמנות עם פירוט לקוח ותשלום',
    hasDateRange: true,
    hasStatusFilter: 'order',
    hasPaymentFilter: true,
  },
  {
    id: 'inventory',
    label: 'מלאי',
    icon: Package,
    color: '#10b981',
    description: 'מצב מלאי, ערך ומוצרים בסיכון',
    hasLowStock: true,
  },
  {
    id: 'returns',
    label: 'החזרות',
    icon: RotateCcw,
    color: '#f97316',
    description: 'בקשות החזרה והחזרי תשלום',
    hasDateRange: true,
    hasStatusFilter: 'return',
  },
  {
    id: 'coupons',
    label: 'קופונים',
    icon: Ticket,
    color: '#ec4899',
    description: 'שימוש בקופונים וסך ההנחות',
  },
  {
    id: 'purchase-orders',
    label: 'הזמנות ספקים',
    icon: ClipboardList,
    color: '#06b6d4',
    description: 'הזמנות רכש, ספקים ועלויות',
    hasDateRange: true,
    hasStatusFilter: 'po',
  },
];

const ORDER_STATUSES   = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
const PAYMENT_STATUSES = ['unpaid', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded'];
const RETURN_STATUSES  = ['pending', 'approved', 'rejected', 'received', 'refunded'];
const PO_STATUSES      = ['draft', 'ordered', 'partially_received', 'received', 'cancelled'];

const STATUS_LABEL = {
  pending: 'ממתין', confirmed: 'אושר', processing: 'בעיבוד', shipped: 'נשלח',
  delivered: 'נמסר', cancelled: 'בוטל', refunded: 'הוחזר',
  unpaid: 'לא שולם', authorized: 'מורשה', paid: 'שולם', failed: 'נכשל',
  partially_refunded: 'הוחזר חלקית',
  approved: 'אושרה', rejected: 'נדחתה', received: 'התקבלה',
  draft: 'טיוטה', ordered: 'הוזמן', partially_received: 'התקבל חלקית',
  out_of_stock: 'אזל', low_stock: 'מלאי נמוך', ok: 'תקין',
};

const QUICK_RANGES = [
  { label: '7 ימים',  days: 7 },
  { label: '30 יום',  days: 30 },
  { label: '90 יום',  days: 90 },
  { label: 'שנה',     days: 365 },
];

// ── Shared primitives ─────────────────────────────────────────────────────────

const fmtMoney = (n) => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum   = (n) => Number(n ?? 0).toLocaleString('en-US');
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

function Pill({ children, color }) {
  const bg = color ? `${color}18` : 'var(--bg-elevated)';
  const bc = color ? `${color}44` : 'var(--border)';
  const tc = color ?? 'var(--text-secondary)';
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: bg, border: `1px solid ${bc}`, color: tc, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

const STATUS_COLORS = {
  delivered: '#10b981', shipped: '#3b82f6', processing: '#fbbf24', confirmed: '#a78bfa',
  cancelled: '#ef4444', refunded: '#6b7280', pending: '#94a3b8',
  paid: '#10b981', unpaid: '#fbbf24', failed: '#ef4444', partially_refunded: '#f97316',
  out_of_stock: '#ef4444', low_stock: '#fbbf24', ok: '#10b981',
  approved: '#10b981', rejected: '#ef4444', received: '#3b82f6',
  draft: '#6b7280', ordered: '#fbbf24', partially_received: '#3b82f6',
};

function StatusPill({ status }) {
  return <Pill color={STATUS_COLORS[status]}>{STATUS_LABEL[status] ?? status}</Pill>;
}

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon style={{ width: 20, height: 20, color }} />
      </div>
      <div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 3px' }}>{label}</p>
        <p style={{ fontSize: 18, fontWeight: 700, color, margin: 0 }}>{value}</p>
      </div>
    </div>
  );
}

// ── Column definitions per report ─────────────────────────────────────────────

const COLUMNS = {
  sales: [
    { key: 'period',   label: 'תקופה',        render: v => v },
    { key: 'revenue',  label: 'הכנסה ($)',     render: v => fmtMoney(v) },
    { key: 'orders',   label: 'הזמנות',       render: v => fmtNum(v) },
    { key: 'avgOrder', label: 'ממוצע הזמנה ($)', render: v => fmtMoney(v) },
  ],
  orders: [
    { key: 'orderNumber',   label: 'מספר הזמנה',  render: v => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span> },
    { key: 'createdAt',     label: 'תאריך',        render: v => fmtDate(v) },
    { key: 'customerName',  label: 'לקוח',         render: v => v },
    { key: 'status',        label: 'סטטוס',        render: v => <StatusPill status={v} /> },
    { key: 'paymentStatus', label: 'תשלום',        render: v => <StatusPill status={v} /> },
    { key: 'itemsCount',    label: 'פריטים',       render: v => v },
    { key: 'couponCode',    label: 'קופון',        render: v => v || '—' },
    { key: 'total',         label: 'סה״כ ($)',      render: v => fmtMoney(v) },
    { key: 'refundedAmount',label: 'הוחזר ($)',     render: v => Number(v) > 0 ? fmtMoney(v) : '—' },
    { key: 'city',          label: 'עיר',          render: v => v || '—' },
  ],
  inventory: [
    { key: 'name',        label: 'מוצר',         render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: 'sku',         label: 'SKU',           render: v => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span> },
    { key: 'category',    label: 'קטגוריה',       render: v => v },
    { key: 'price',       label: 'מחיר ($)',       render: v => fmtMoney(v) },
    { key: 'stock',       label: 'מלאי',          render: v => v },
    { key: 'minStock',    label: 'מינימום',        render: v => v },
    { key: 'salesCount',  label: 'נמכרו',         render: v => fmtNum(v) },
    { key: 'stockValue',  label: 'ערך מלאי ($)',   render: v => fmtMoney(v) },
    { key: 'stockStatus', label: 'מצב',           render: v => <StatusPill status={v} /> },
  ],
  returns: [
    { key: 'orderNumber',   label: 'הזמנה',       render: v => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span> },
    { key: 'createdAt',     label: 'תאריך',        render: v => fmtDate(v) },
    { key: 'customerName',  label: 'לקוח',         render: v => v },
    { key: 'status',        label: 'סטטוס',        render: v => <StatusPill status={v} /> },
    { key: 'itemsCount',    label: 'פריטים',       render: v => v },
    { key: 'refundAmount',  label: 'הוחזר ($)',     render: v => Number(v) > 0 ? fmtMoney(v) : '—' },
    { key: 'refundType',    label: 'סוג החזר',     render: v => v || '—' },
    { key: 'resolvedAt',    label: 'טופל',         render: v => fmtDate(v) },
  ],
  coupons: [
    { key: 'code',          label: 'קוד',          render: v => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{v}</span> },
    { key: 'type',          label: 'סוג',          render: v => v === 'percentage' ? 'אחוז' : 'קבוע' },
    { key: 'value',         label: 'ערך',          render: (v, row) => row.type === 'percentage' ? `${v}%` : fmtMoney(v) },
    { key: 'usedCount',     label: 'שימושים',      render: v => fmtNum(v) },
    { key: 'orderCount',    label: 'הזמנות',       render: v => fmtNum(v) },
    { key: 'totalDiscount', label: 'סך הנחה ($)',   render: v => fmtMoney(v) },
    { key: 'isActive',      label: 'פעיל',         render: v => <StatusPill status={v ? 'ok' : 'cancelled'}>{v ? 'פעיל' : 'לא פעיל'}</StatusPill> },
    { key: 'validUntil',    label: 'בתוקף עד',     render: v => fmtDate(v) },
  ],
  'purchase-orders': [
    { key: 'poNumber',      label: 'מספר PO',      render: v => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span> },
    { key: 'createdAt',     label: 'תאריך',        render: v => fmtDate(v) },
    { key: 'supplier',      label: 'ספק',          render: v => v },
    { key: 'status',        label: 'סטטוס',        render: v => <StatusPill status={v} /> },
    { key: 'itemsCount',    label: 'פריטים',       render: v => v },
    { key: 'totalOrdered',  label: 'הוזמן',        render: v => fmtNum(v) },
    { key: 'totalReceived', label: 'התקבל',        render: v => fmtNum(v) },
    { key: 'totalCost',     label: 'עלות ($)',      render: v => fmtMoney(v) },
    { key: 'expectedDate',  label: 'תאריך צפוי',   render: v => fmtDate(v) },
  ],
};

// ── Summary cards per report ──────────────────────────────────────────────────

function SummaryCards({ type, summary, color }) {
  if (!summary) return null;

  const cards = {
    sales: [
      { icon: DollarSign,  label: 'הכנסה גולמית',  value: fmtMoney(summary.gross) },
      { icon: TrendingUp,  label: 'הכנסה נטו',     value: fmtMoney(summary.net) },
      { icon: RotateCcw,   label: 'הוחזר',          value: fmtMoney(summary.refunded) },
      { icon: ShoppingCart,label: 'ממוצע הזמנה',  value: fmtMoney(summary.aov) },
      { icon: BarChart3,   label: 'הזמנות ששולמו', value: fmtNum(summary.ordersCount) },
    ],
    orders: [
      { icon: ShoppingCart, label: 'סך הזמנות',  value: fmtNum(summary.total) },
      { icon: DollarSign,   label: 'הכנסות',      value: fmtMoney(summary.revenue) },
      { icon: RotateCcw,    label: 'הוחזר',        value: fmtMoney(summary.refunded) },
    ],
    inventory: [
      { icon: Package,       label: 'מוצרים',        value: fmtNum(summary.total) },
      { icon: DollarSign,    label: 'ערך מלאי כולל', value: fmtMoney(summary.totalValue) },
      { icon: AlertTriangle, label: 'אזל מהמלאי',    value: fmtNum(summary.outOfStock) },
      { icon: AlertTriangle, label: 'מלאי נמוך',     value: fmtNum(summary.lowStockCount) },
    ],
    returns: [
      { icon: RotateCcw,  label: 'סך החזרות',     value: fmtNum(summary.total) },
      { icon: DollarSign, label: 'סך הוחזר ($)',   value: fmtMoney(summary.totalRefunded) },
    ],
    coupons: [
      { icon: Ticket,     label: 'סך קופונים',    value: fmtNum(summary.total) },
      { icon: Ticket,     label: 'פעילים',         value: fmtNum(summary.active) },
      { icon: DollarSign, label: 'סך הנחות ($)',   value: fmtMoney(summary.totalDiscount) },
      { icon: BarChart3,  label: 'סך שימושים',    value: fmtNum(summary.totalUsage) },
    ],
    'purchase-orders': [
      { icon: ClipboardList, label: 'סך הזמנות',   value: fmtNum(summary.total) },
      { icon: DollarSign,    label: 'עלות כוללת ($)', value: fmtMoney(summary.totalCost) },
    ],
  };

  const items = cards[type] ?? [];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
      {items.map(c => <SummaryCard key={c.label} icon={c.icon} label={c.label} value={c.value} color={color} />)}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminReportsPage() {
  const [activeType,     setActiveType]     = useState('sales');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [period,         setPeriod]         = useState('day');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [paymentFilter,  setPaymentFilter]  = useState('');
  const [lowStockOnly,   setLowStockOnly]   = useState(false);
  const [reportData,     setReportData]     = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [exporting,      setExporting]      = useState(false);
  const [expandedRows,   setExpandedRows]   = useState(50);

  const typeDef = REPORT_TYPES.find(t => t.id === activeType);

  const buildParams = useCallback(() => {
    const p = {};
    if (dateFrom)                 p.dateFrom      = dateFrom;
    if (dateTo)                   p.dateTo        = dateTo;
    if (typeDef?.hasPeriod)       p.period        = period;
    if (statusFilter)             p.status        = statusFilter;
    if (paymentFilter)            p.paymentStatus = paymentFilter;
    if (lowStockOnly)             p.lowStock      = 'true';
    return p;
  }, [dateFrom, dateTo, period, statusFilter, paymentFilter, lowStockOnly, typeDef]);

  const runReport = useCallback(async () => {
    setLoading(true);
    setError('');
    setExpandedRows(50);
    try {
      const data = await adminService.getReport(activeType, buildParams());
      setReportData(data);
    } catch (e) {
      setError(e.message || 'שגיאה בטעינת הדוח');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [activeType, buildParams]);

  // Auto-run when type or key filters change
  useEffect(() => { runReport(); }, [runReport]);

  const handleQuickRange = (days) => {
    const to   = new Date();
    const from = new Date(Date.now() - days * 86400000);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(to.toISOString().slice(0, 10));
  };

  const handleTypeChange = (id) => {
    setActiveType(id);
    setStatusFilter('');
    setPaymentFilter('');
    setLowStockOnly(false);
    setExpandedRows(50);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await adminService.exportReportCsv(activeType, buildParams(), `${activeType}-report.csv`);
    } catch (e) {
      setError(e.message || 'שגיאה בייצוא');
    } finally {
      setExporting(false);
    }
  };

  const columns = COLUMNS[activeType] ?? [];
  const rows    = reportData?.rows ?? [];
  const visibleRows = rows.slice(0, expandedRows);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">דוחות וייצוא</h1>
          <p className="text-muted-foreground text-sm mt-1">דוחות עסקיים בזמן אמת עם ייצוא CSV</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={runReport} disabled={loading}
            className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-colors" title="רענן">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={handleExport} disabled={exporting || loading || rows.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563eb] text-white text-sm font-medium hover:bg-[#2563eb]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Download className="w-4 h-4" />
            {exporting ? 'מייצא…' : 'ייצוא CSV'}
          </button>
        </div>
      </div>

      {/* Report type tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {REPORT_TYPES.map(t => {
          const Icon = t.icon;
          const active = t.id === activeType;
          return (
            <button key={t.id} type="button" onClick={() => handleTypeChange(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10,
                border: active ? `1px solid ${t.color}60` : '1px solid var(--border)',
                background: active ? `${t.color}15` : 'var(--bg-surface)',
                color: active ? t.color : 'var(--text-muted)',
                fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s',
              }}>
              <Icon style={{ width: 15, height: 15 }} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>

        {/* Quick ranges */}
        {typeDef?.hasDateRange && (
          <div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>טווח מהיר</p>
            <div style={{ display: 'flex', gap: 4 }}>
              {QUICK_RANGES.map(r => (
                <button key={r.days} type="button" onClick={() => handleQuickRange(r.days)}
                  style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Date from */}
        {typeDef?.hasDateRange && (
          <div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>מתאריך</p>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }} />
          </div>
        )}

        {/* Date to */}
        {typeDef?.hasDateRange && (
          <div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>עד תאריך</p>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }} />
          </div>
        )}

        {/* Period grouping (sales only) */}
        {typeDef?.hasPeriod && (
          <div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>קיבוץ</p>
            <select value={period} onChange={e => setPeriod(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }}>
              <option value="day">יומי</option>
              <option value="week">שבועי</option>
              <option value="month">חודשי</option>
            </select>
          </div>
        )}

        {/* Order status filter */}
        {typeDef?.hasStatusFilter === 'order' && (
          <div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>סטטוס הזמנה</p>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }}>
              <option value="">הכל</option>
              {ORDER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
            </select>
          </div>
        )}

        {/* Payment status filter */}
        {typeDef?.hasPaymentFilter && (
          <div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>סטטוס תשלום</p>
            <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }}>
              <option value="">הכל</option>
              {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
            </select>
          </div>
        )}

        {/* Return status filter */}
        {typeDef?.hasStatusFilter === 'return' && (
          <div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>סטטוס החזרה</p>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }}>
              <option value="">הכל</option>
              {RETURN_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
            </select>
          </div>
        )}

        {/* PO status filter */}
        {typeDef?.hasStatusFilter === 'po' && (
          <div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>סטטוס הזמנה</p>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }}>
              <option value="">הכל</option>
              {PO_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
            </select>
          </div>
        )}

        {/* Low stock filter (inventory) */}
        {typeDef?.hasLowStock && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={lowStockOnly} onChange={e => setLowStockOnly(e.target.checked)} />
            מלאי נמוך בלבד
          </label>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 10, padding: '12px 16px', color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="text-center py-20 text-muted-foreground text-sm animate-pulse">
          טוען דוח…
        </div>
      )}

      {/* Results */}
      {!loading && reportData && (
        <>
          {/* Summary cards */}
          <SummaryCards type={activeType} summary={reportData.summary} color={typeDef?.color ?? '#2563eb'} />

          {/* Limited warning */}
          {reportData.summary?.limited && (
            <div style={{ background: '#fbbf2415', border: '1px solid #fbbf2440', borderRadius: 10, padding: '10px 16px', color: '#fbbf24', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
              הדוח מציג עד 500 שורות. השתמש בייצוא CSV לנתונים מלאים.
            </div>
          )}

          {/* Table */}
          {rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Archive style={{ width: 40, height: 40, color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>אין נתונים עבור הפילטרים שנבחרו</p>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  {typeDef?.label} — {fmtNum(rows.length)} שורות
                  {expandedRows < rows.length && ` (מציג ${fmtNum(expandedRows)})`}
                </p>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                      {columns.map(col => (
                        <th key={col.key} style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {columns.map(col => (
                          <td key={col.key} style={{ padding: '9px 14px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                            {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Show more */}
              {expandedRows < rows.length && (
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                  <button type="button" onClick={() => setExpandedRows(prev => Math.min(prev + 50, rows.length))}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>
                    <ChevronDown style={{ width: 14, height: 14 }} />
                    הצג עוד ({fmtNum(Math.min(50, rows.length - expandedRows))} שורות)
                  </button>
                </div>
              )}
              {expandedRows >= rows.length && rows.length > 50 && (
                <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                  <button type="button" onClick={() => setExpandedRows(50)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                    <ChevronUp style={{ width: 12, height: 12 }} />
                    צמצם
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
