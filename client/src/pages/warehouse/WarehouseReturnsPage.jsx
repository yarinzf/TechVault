import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Search, RefreshCw, Package, X } from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';

// ── Helpers ───────────────────────────────────────────────────────────────────
// Warehouse's job in the return lifecycle is narrow and physical: once an
// admin has approved a return, warehouse receives the physical item and
// marks it received (real API — PATCH /admin/returns/:id/received, staff
// role). Approve/reject/refund are business/financial decisions that stay
// with Admin (see AdminReturnsPage.jsx) — this page never exposes them.
const STATUS_META = {
  pending:  { label: 'ממתין לאישור מנהל', color: '#fbbf24', bg: '#fbbf2415', border: '#fbbf2440' },
  approved: { label: 'אושרה — ממתין לקבלה במחסן', color: '#3b82f6', bg: '#3b82f615', border: '#3b82f640' },
  rejected: { label: 'נדחתה', color: '#ef4444', bg: '#ef444415', border: '#ef444440' },
  received: { label: 'התקבלה במחסן', color: '#8b5cf6', bg: '#8b5cf615', border: '#8b5cf640' },
  refunded: { label: 'הוחזר כספית', color: '#10b981', bg: '#10b98115', border: '#10b98140' },
};

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? { label: status, color: '#6b7280', bg: '#6b728015', border: '#6b728040' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999,
      background: m.bg, border: `1px solid ${m.border}`,
      fontSize: 12, color: m.color, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

// ── Receive panel — the ONLY action warehouse can take here ───────────────────
function ReceivePanel({ rr, onUpdated }) {
  const [itemConditions, setItemConditions] = useState(
    () => (rr.items ?? []).map((_, i) => ({ index: i, condition: 'sellable' }))
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const setCondition = (i, v) =>
    setItemConditions(prev => prev.map(c => c.index === i ? { ...c, condition: v } : c));

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const result = await adminService.markReturnReceived(rr._id, { itemConditions });
      onUpdated(result?.returnRequest ?? result);
    } catch (e) {
      setErr(e.message || 'שגיאה בסימון כהתקבל');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '16px 20px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)' }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          פריטים לבדיקה פיזית
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(rr.items ?? []).map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{item.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.quantity} יח׳ · סיבה: {item.reason}</p>
              </div>
              {rr.status === 'approved' && (
                <select
                  value={itemConditions.find(c => c.index === i)?.condition ?? 'sellable'}
                  onChange={e => setCondition(i, e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12 }}
                >
                  <option value="sellable">תקין — חזרה למלאי</option>
                  <option value="damaged">פגום — מחסן נפסדים</option>
                </select>
              )}
            </div>
          ))}
        </div>
      </div>

      {err && <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{err}</p>}

      {rr.status === 'approved' ? (
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8,
            background: '#8b5cf618', border: '1px solid #8b5cf644', color: '#8b5cf6',
            fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
          }}
        >
          <Package size={14} />
          {busy ? 'מעדכן…' : 'סמן כהתקבל במחסן'}
        </button>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {rr.status === 'pending'
            ? 'ההחזרה ממתינה לאישור מנהל לפני שניתן לקבל אותה פיזית במחסן.'
            : 'אין פעולת מחסן זמינה עבור בקשה בסטטוס זה.'}
        </p>
      )}
    </div>
  );
}

// ── Return row ────────────────────────────────────────────────────────────────
function ReturnRow({ rr, expanded, onToggle, onUpdated }) {
  const itemCount = (rr.items ?? []).length;

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer', flexWrap: 'wrap' }}
        onClick={onToggle}
      >
        <StatusBadge status={rr.status} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            הזמנה #{rr.orderNumber ?? rr.order?.orderNumber}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{itemCount} פריטים · {fmt(rr.createdAt)}</p>
        </div>
      </div>

      {expanded && (
        <ReceivePanel
          rr={rr}
          onUpdated={(result) => onUpdated(result?.returnRequest ?? result)}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const STATUS_FILTERS = [
  { value: '', label: 'הכל' },
  { value: 'approved', label: 'ממתינות לקבלה' },
  { value: 'received', label: 'התקבלו' },
];

export default function WarehouseReturnsPage() {
  const [returns,  setReturns]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [status,   setStatus]   = useState('approved');
  const [search,   setSearch]   = useState('');

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: 1, limit: 50 };
      if (status) params.status = status;
      if (search.trim()) params.search = search.trim();
      const { returns: data } = await adminService.listReturns(params);
      setReturns(data);
    } catch {
      setError('שגיאה בטעינת בקשות החזרה');
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  const handleUpdated = (updated) => {
    setReturns(prev => prev.map(r => r._id === updated._id ? { ...r, ...updated } : r));
    setExpanded(null);
  };

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">החזרות למחסן</h1>
          <p className="text-muted-foreground text-sm mt-1">קבלה פיזית של החזרות שאושרו — בדיקת פריטים וסימון כהתקבל</p>
        </div>
        <button
          type="button"
          onClick={fetchReturns}
          className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
          title="רענן"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                status === value ? 'bg-[#2563eb] text-white' : 'bg-card text-muted-foreground hover:bg-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
          <Search style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="חיפוש לפי מספר הזמנה…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '6px 32px 6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {loading && <div className="text-center py-16 text-muted-foreground text-sm">טוען בקשות…</div>}

      {!loading && error && (
        <div className="text-center py-16">
          <p className="text-red-400 text-sm">{error}</p>
          <button type="button" onClick={fetchReturns} className="text-xs underline text-muted-foreground mt-2 block mx-auto">נסה שוב</button>
        </div>
      )}

      {!loading && !error && returns.length === 0 && (
        <div className="flex flex-col items-center py-20 gap-3">
          <RotateCcw className="w-10 h-10 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground text-sm">אין בקשות החזרה בסטטוס הנבחר</p>
        </div>
      )}

      {!loading && !error && returns.length > 0 && (
        <div>
          {returns.map(rr => (
            <ReturnRow
              key={rr._id}
              rr={rr}
              expanded={expanded === rr._id}
              onToggle={() => setExpanded(prev => prev === rr._id ? null : rr._id)}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}
