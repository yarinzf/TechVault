import { useState, useEffect, useCallback } from 'react';
import {
  RotateCcw, Search, RefreshCw, X, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Package, DollarSign, Eye,
} from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META = {
  pending:  { label: 'ממתין',        color: '#fbbf24', bg: '#fbbf2415', border: '#fbbf2440' },
  approved: { label: 'אושרה',        color: '#3b82f6', bg: '#3b82f615', border: '#3b82f640' },
  rejected: { label: 'נדחתה',        color: '#ef4444', bg: '#ef444415', border: '#ef444440' },
  received: { label: 'התקבלה',       color: '#8b5cf6', bg: '#8b5cf615', border: '#8b5cf640' },
  refunded: { label: 'הוחזר כספי',   color: '#10b981', bg: '#10b98115', border: '#10b98140' },
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

// ── Admin Note input ──────────────────────────────────────────────────────────

function NoteInput({ value, onChange, placeholder = 'הערת מנהל (אופציונלי)' }) {
  return (
    <textarea
      rows={2}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '8px 10px',
        borderRadius: 8, border: '1px solid var(--border)',
        background: 'var(--bg-elevated)', color: 'var(--text-primary)',
        fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
      }}
    />
  );
}

// ── Action Panel — shown inside expanded row ──────────────────────────────────

function ActionPanel({ rr, onUpdated }) {
  const [adminNote, setAdminNote] = useState(rr.adminNote ?? '');
  const [refundAmount, setRefundAmount] = useState('');
  const [itemConditions, setItemConditions] = useState(
    () => (rr.items ?? []).map((_, i) => ({ index: i, condition: 'sellable' }))
  );
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const setCondition = (i, v) =>
    setItemConditions(prev => prev.map(c => c.index === i ? { ...c, condition: v } : c));

  const run = async (fn, label) => {
    setBusy(label); setErr('');
    try {
      const result = await fn();
      onUpdated(result);
    } catch (e) {
      setErr(e.message || 'שגיאה');
    } finally {
      setBusy('');
    }
  };

  const totalRequested = (rr.items ?? []).reduce((s, it) => s + it.unitPrice * it.quantity, 0);
  const order = rr.order ?? {};
  const alreadyRefunded = order.refundedAmount ?? 0;
  const maxRefund = parseFloat(((order.total ?? totalRequested) - alreadyRefunded).toFixed(2));

  return (
    <div style={{ padding: '16px 20px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)' }}>

      {/* Items list */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>פריטים בבקשה</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(rr.items ?? []).map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <img
                src={item.image || 'https://picsum.photos/40/40'}
                alt={item.name}
                style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }}
              />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{item.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {item.quantity} יח׳ × ${item.unitPrice?.toFixed(2)} · סיבה: {item.reason}
                </p>
              </div>
              {/* Condition selector for mark-received flow */}
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
              {rr.status !== 'approved' && item.condition && item.condition !== 'unknown' && (
                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: item.condition === 'sellable' ? '#10b98115' : '#ef444415', color: item.condition === 'sellable' ? '#10b981' : '#ef4444', border: `1px solid ${item.condition === 'sellable' ? '#10b98130' : '#ef444430'}` }}>
                  {item.condition === 'sellable' ? 'תקין' : 'פגום'}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Admin note */}
      {['pending', 'approved', 'received'].includes(rr.status) && (
        <div style={{ marginBottom: 16 }}>
          <NoteInput value={adminNote} onChange={setAdminNote} />
        </div>
      )}

      {/* Refund amount for received */}
      {rr.status === 'received' && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            סכום להחזרה (מקסימום ${maxRefund.toFixed(2)}) *
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={maxRefund}
            value={refundAmount}
            onChange={e => setRefundAmount(e.target.value)}
            placeholder={`עד $${maxRefund.toFixed(2)}`}
            style={{ width: 180, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }}
          />
        </div>
      )}

      {err && <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{err}</p>}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {rr.status === 'pending' && (
          <>
            <ActionBtn
              color="#10b981" icon={<CheckCircle2 size={14} />}
              label="אשר" loading={busy === 'approve'}
              onClick={() => run(() => adminService.approveReturn(rr._id, { adminNote }), 'approve')}
            />
            <ActionBtn
              color="#ef4444" icon={<XCircle size={14} />}
              label="דחה" loading={busy === 'reject'}
              onClick={() => run(() => adminService.rejectReturn(rr._id, { adminNote }), 'reject')}
            />
          </>
        )}
        {rr.status === 'approved' && (
          <ActionBtn
            color="#8b5cf6" icon={<Package size={14} />}
            label="סמן כהתקבל" loading={busy === 'received'}
            onClick={() => run(() => adminService.markReturnReceived(rr._id, { itemConditions }), 'received')}
          />
        )}
        {rr.status === 'received' && (
          <ActionBtn
            color="#2563eb" icon={<DollarSign size={14} />}
            label="בצע החזר כספי" loading={busy === 'refund'}
            disabled={!refundAmount || parseFloat(refundAmount) <= 0}
            onClick={() => run(
              () => adminService.processReturnRefund(rr._id, { refundAmount: parseFloat(refundAmount), adminNote }),
              'refund'
            )}
          />
        )}
      </div>

      {rr.adminNote && rr.status !== 'pending' && (
        <p style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          הערת מנהל: {rr.adminNote}
        </p>
      )}
      {rr.refundAmount && (
        <p style={{ marginTop: 6, fontSize: 12, color: '#10b981', fontWeight: 600 }}>
          הוחזר: ${rr.refundAmount.toFixed(2)}
        </p>
      )}
    </div>
  );
}

function ActionBtn({ color, icon, label, onClick, loading, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 8,
        background: disabled ? 'var(--bg-elevated)' : `${color}18`,
        border: `1px solid ${disabled ? 'var(--border)' : `${color}44`}`,
        color: disabled ? 'var(--text-muted)' : color,
        fontSize: 13, fontWeight: 600, cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s',
      }}
    >
      {icon}
      {loading ? 'מעבד…' : label}
    </button>
  );
}

// ── Return row ────────────────────────────────────────────────────────────────

function ReturnRow({ rr, expanded, onToggle, onUpdated }) {
  const user  = rr.user  ?? {};
  const order = rr.order ?? {};
  const itemCount = (rr.items ?? []).length;
  const totalValue = (rr.items ?? []).reduce((s, it) => s + (it.unitPrice ?? 0) * it.quantity, 0);

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer', flexWrap: 'wrap' }}
        onClick={onToggle}
      >
        <StatusBadge status={rr.status} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            הזמנה #{rr.orderNumber ?? order.orderNumber}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {user.name ?? '—'} · {user.email ?? ''}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>פריטים</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{itemCount}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>שווי</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>${totalValue.toFixed(2)}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>תאריך</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmt(rr.createdAt)}</p>
          </div>
        </div>

        <div style={{ color: 'var(--text-muted)' }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <ActionPanel
          rr={rr}
          onUpdated={(result) => {
            // result may be { returnRequest } or the returnRequest itself
            const updated = result?.returnRequest ?? result;
            onUpdated(updated);
          }}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: '', label: 'הכל' },
  { value: 'pending',  label: 'ממתינות' },
  { value: 'approved', label: 'אושרו' },
  { value: 'received', label: 'התקבלו' },
  { value: 'refunded', label: 'הוחזרו' },
  { value: 'rejected', label: 'נדחו' },
];

export default function AdminReturnsPage() {
  const [returns,   setReturns]   = useState([]);
  const [meta,      setMeta]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [expanded,  setExpanded]  = useState(null);
  const [status,    setStatus]    = useState('');
  const [search,    setSearch]    = useState('');
  const [page,      setPage]      = useState(1);

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 20 };
      if (status) params.status = status;
      if (search.trim()) params.search = search.trim();
      const { returns: data, meta: m } = await adminService.listReturns(params);
      setReturns(data);
      setMeta(m);
    } catch {
      setError('שגיאה בטעינת בקשות החזרה');
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  const handleStatusFilter = (v) => { setStatus(v); setPage(1); setExpanded(null); };

  const handleUpdated = (updated) => {
    setReturns(prev => prev.map(r => r._id === updated._id ? { ...r, ...updated } : r));
    setExpanded(null);
  };

  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">בקשות החזרה</h1>
          <p className="text-muted-foreground text-sm mt-1">ניהול בקשות החזרת מוצרים והחזרים כספיים</p>
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

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Status tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleStatusFilter(value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                status === value
                  ? 'bg-[#2563eb] text-white'
                  : 'bg-card text-muted-foreground hover:bg-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
          <Search style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="חיפוש לפי מספר הזמנה…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '6px 32px 6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }}
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setPage(1); }}
              style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {meta && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
            {meta.total ?? returns.length} בקשות
          </span>
        )}
      </div>

      {/* Content */}
      {loading && (
        <div className="text-center py-16 text-muted-foreground text-sm">טוען בקשות…</div>
      )}

      {!loading && error && (
        <div className="text-center py-16">
          <p className="text-red-400 text-sm">{error}</p>
          <button type="button" onClick={fetchReturns} className="text-xs underline text-muted-foreground mt-2 block mx-auto">נסה שוב</button>
        </div>
      )}

      {!loading && !error && returns.length === 0 && (
        <div className="flex flex-col items-center py-20 gap-3">
          <RotateCcw className="w-10 h-10 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground text-sm">אין בקשות החזרה{status ? ` בסטטוס "${STATUS_FILTERS.find(f => f.value === status)?.label}"` : ''}</p>
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 20 }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: page <= 1 ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: 13, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
              >
                הקודם
              </button>
              <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                עמוד {page} מתוך {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: page >= totalPages ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: 13, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
              >
                הבא
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
