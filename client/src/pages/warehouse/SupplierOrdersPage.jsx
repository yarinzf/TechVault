import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Truck, Clock, CheckCircle2, XCircle, Plus, RefreshCw,
  ChevronDown, ChevronUp, Search, X, Package, AlertTriangle, Building2,
  Edit2, Trash2, Mail, Phone, User,
} from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';
import { warehouseService } from '../../features/warehouse/api/warehouse.service';
import { useToast } from '../../hooks/useToast';

// ── Constants ─────────────────────────────────────────────────────────────────

const PO_STATUS_META = {
  draft:              { label: 'טיוטה',        color: '#6b7280', Icon: ClipboardList },
  ordered:            { label: 'הוזמן',         color: '#fbbf24', Icon: Clock },
  partially_received: { label: 'התקבל חלקית',  color: '#3b82f6', Icon: Truck },
  received:           { label: 'התקבל',         color: '#10b981', Icon: CheckCircle2 },
  cancelled:          { label: 'בוטל',          color: '#ef4444', Icon: XCircle },
};

const PO_STATUS_FILTERS = [
  { value: '', label: 'הכל' },
  { value: 'draft',              label: 'טיוטה' },
  { value: 'ordered',            label: 'הוזמן' },
  { value: 'partially_received', label: 'חלקי' },
  { value: 'received',           label: 'התקבל' },
  { value: 'cancelled',          label: 'בוטל' },
];

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtCost = (n) => (n != null ? `$${Number(n).toFixed(2)}` : '—');

// ── Shared primitives ─────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
  color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit',
  boxSizing: 'border-box',
};

function Field({ label, children }) {
  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>{label}</label>}
      {children}
    </div>
  );
}

function ModalShell({ title, onClose, children, maxWidth = 500 }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}
        onClick={e => e.stopPropagation()} dir="rtl"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ padding: 6, borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ children }) {
  return <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>{children}</div>;
}

function ModalBtn({ color, onClick, children, loading, disabled }) {
  const themed = color
    ? { background: color, color: '#fff', border: 'none' }
    : { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' };
  return (
    <button type="button" onClick={onClick} disabled={loading || disabled}
      style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: (loading || disabled) ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s', ...themed }}>
      {loading ? 'מעבד…' : children}
    </button>
  );
}

function ActionBtn({ color, icon, label, onClick, loading, disabled = false }) {
  return (
    <button type="button" onClick={onClick} disabled={loading || disabled}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: `${color}18`, border: `1px solid ${color}44`, color, fontSize: 13, fontWeight: 600, cursor: (disabled || loading) ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
      {icon}{loading ? 'מעבד…' : label}
    </button>
  );
}

function StatusBadge({ status }) {
  const m = PO_STATUS_META[status] ?? { label: status, color: '#6b7280' };
  const { Icon } = m;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: `${m.color}15`, border: `1px solid ${m.color}30`, fontSize: 12, color: m.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {Icon && <Icon style={{ width: 12, height: 12 }} />}{m.label}
    </span>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{value}</p>
    </div>
  );
}

// ── Supplier modal ────────────────────────────────────────────────────────────

function SupplierModal({ supplier, onClose, onSaved }) {
  const isEdit = !!supplier;
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    contactName: supplier?.contactName ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    website: supplier?.website ?? '',
    notes: supplier?.notes ?? '',
    isActive: supplier?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('שם ספק הוא שדה חובה'); return; }
    setSaving(true); setError('');
    try {
      const saved = isEdit
        ? await adminService.updateSupplier(supplier._id, form)
        : await adminService.createSupplier(form);
      onSaved(saved, isEdit);
    } catch (e) {
      setError(e.message || 'שגיאה בשמירת הספק');
    } finally { setSaving(false); }
  };

  return (
    <ModalShell title={isEdit ? 'עריכת ספק' : 'ספק חדש'} onClose={onClose} maxWidth={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="שם ספק *">
          <input style={inputStyle} value={form.name} onChange={set('name')} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="איש קשר"><input style={inputStyle} value={form.contactName} onChange={set('contactName')} /></Field>
          <Field label="אימייל"><input style={inputStyle} type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="טלפון"><input style={inputStyle} value={form.phone} onChange={set('phone')} /></Field>
          <Field label="אתר"><input style={inputStyle} value={form.website} onChange={set('website')} /></Field>
        </div>
        <Field label="כתובת"><input style={inputStyle} value={form.address} onChange={set('address')} /></Field>
        <Field label="הערות"><textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={form.notes} onChange={set('notes')} /></Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.isActive} onChange={set('isActive')} />
          ספק פעיל
        </label>
        {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
        <ModalFooter>
          <ModalBtn color="#2563eb" onClick={handleSave} loading={saving}>{isEdit ? 'שמור שינויים' : 'צור ספק'}</ModalBtn>
          <ModalBtn onClick={onClose} disabled={saving}>ביטול</ModalBtn>
        </ModalFooter>
      </div>
    </ModalShell>
  );
}

// ── Create PO modal ───────────────────────────────────────────────────────────

function CreatePOModal({ suppliers, onClose, onCreated }) {
  const [supplierId,    setSupplierId]    = useState('');
  const [expectedDate,  setExpectedDate]  = useState('');
  const [notes,         setNotes]         = useState('');
  const [items,         setItems]         = useState([{ product: '', name: '', sku: '', quantityOrdered: 1, unitCost: '' }]);
  const [searchQuery,   setSearchQuery]   = useState({});  // { [idx]: string }
  const [searchResults, setSearchResults] = useState({});  // { [idx]: Product[] }
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');

  const doSearch = useCallback(async (idx, q) => {
    setSearchQuery(prev => ({ ...prev, [idx]: q }));
    if (!q.trim()) { setSearchResults(prev => ({ ...prev, [idx]: [] })); return; }
    try {
      const { products } = await warehouseService.listInventory({ search: q, limit: 8 });
      setSearchResults(prev => ({ ...prev, [idx]: products ?? [] }));
    } catch { setSearchResults(prev => ({ ...prev, [idx]: [] })); }
  }, []);

  const selectProduct = (p, idx) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, product: p._id, name: p.name, sku: p.sku ?? '' } : it));
    setSearchResults(prev => ({ ...prev, [idx]: [] }));
    setSearchQuery(prev => ({ ...prev, [idx]: '' }));
  };

  const addItem    = () => setItems(prev => [...prev, { product: '', name: '', sku: '', quantityOrdered: 1, unitCost: '' }]);
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const setItemField = (i, k, v) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [k]: v } : it));

  const totalCost = items.reduce((s, it) => s + (parseInt(it.quantityOrdered) || 0) * (parseFloat(it.unitCost) || 0), 0);

  const handleCreate = async () => {
    if (!supplierId) { setError('יש לבחור ספק'); return; }
    const validItems = items.filter(it => it.product);
    if (validItems.length === 0) { setError('יש להוסיף לפחות פריט אחד'); return; }
    const badQty = validItems.find(it => parseInt(it.quantityOrdered) < 1);
    if (badQty) { setError(`כמות לא תקינה עבור "${badQty.name || 'פריט'}"`); return; }

    setSaving(true); setError('');
    try {
      const po = await adminService.createPurchaseOrder({
        supplier: supplierId,
        items: validItems.map(it => ({
          product:         it.product,
          quantityOrdered: parseInt(it.quantityOrdered),
          unitCost:        parseFloat(it.unitCost) || 0,
        })),
        expectedDate: expectedDate || null,
        notes,
      });
      onCreated(po);
    } catch (e) {
      setError(e.message || 'שגיאה ביצירת הזמנה');
    } finally { setSaving(false); }
  };

  return (
    <ModalShell title="הזמנת רכש חדשה" onClose={onClose} maxWidth={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="ספק *">
            <select style={inputStyle} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">בחר ספק…</option>
              {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="תאריך אספקה צפוי">
            <input style={inputStyle} type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
          </Field>
        </div>

        {/* Items */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>פריטים</p>
            <button type="button" onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, background: '#2563eb18', border: '1px solid #2563eb44', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Plus style={{ width: 12, height: 12 }} />הוסף
            </button>
          </div>

          {items.map((item, i) => (
            <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)', padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                {/* Product search / selected */}
                <div style={{ flex: 3, position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>מוצר</label>
                  {item.product ? (
                    <div style={{ ...inputStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                      <button type="button" onClick={() => setItemField(i, 'product', '')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                        <X style={{ width: 12, height: 12 }} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input style={inputStyle} placeholder="חפש מוצר…"
                        value={searchQuery[i] ?? ''}
                        onChange={e => doSearch(i, e.target.value)} />
                      {(searchResults[i] ?? []).length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 50, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', maxHeight: 180, overflowY: 'auto' }}>
                          {searchResults[i].map(p => (
                            <button key={p._id} type="button" onClick={() => selectProduct(p, i)}
                              style={{ width: '100%', textAlign: 'right', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                              <span>{p.name}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{p.sku} · מלאי: {p.stock}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>כמות</label>
                  <input style={{ ...inputStyle, textAlign: 'center' }} type="number" min={1} value={item.quantityOrdered}
                    onChange={e => setItemField(i, 'quantityOrdered', e.target.value)} />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>עלות יח׳ ($)</label>
                  <input style={{ ...inputStyle, textAlign: 'center' }} type="number" min={0} step="0.01" value={item.unitCost}
                    onChange={e => setItemField(i, 'unitCost', e.target.value)} />
                </div>

                <div style={{ minWidth: 80, textAlign: 'left', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 700, paddingBottom: 8 }}>
                  {fmtCost((parseInt(item.quantityOrdered) || 0) * (parseFloat(item.unitCost) || 0))}
                </div>

                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(i)} style={{ paddingBottom: 8, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                )}
              </div>
            </div>
          ))}

          <div style={{ textAlign: 'left', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            סה״כ: {fmtCost(totalCost)}
          </div>
        </div>

        <Field label="הערות">
          <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>

        {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
        <ModalFooter>
          <ModalBtn color="#2563eb" onClick={handleCreate} loading={saving}>צור הזמנה</ModalBtn>
          <ModalBtn onClick={onClose} disabled={saving}>ביטול</ModalBtn>
        </ModalFooter>
      </div>
    </ModalShell>
  );
}

// ── Receive items modal ───────────────────────────────────────────────────────

function ReceiveModal({ po, onClose, onReceived }) {
  const [qtys,   setQtys]   = useState(() => Object.fromEntries(po.items.map((it, i) => [i, Math.max(0, it.quantityOrdered - it.quantityReceived)])));
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleReceive = async () => {
    const items = po.items
      .map((it, i) => ({ productId: (it.product?._id ?? it.product)?.toString(), quantity: parseInt(qtys[i]) || 0 }))
      .filter(it => it.quantity > 0);

    if (items.length === 0) { setError('יש להזין כמות עבור לפחות פריט אחד'); return; }
    setSaving(true); setError('');
    try {
      const updated = await adminService.receivePurchaseOrder(po._id, { items });
      onReceived(updated);
    } catch (e) {
      setError(e.message || 'שגיאה בקבלת פריטים');
    } finally { setSaving(false); }
  };

  return (
    <ModalShell title={`קבלת פריטים — ${po.poNumber}`} onClose={onClose} maxWidth={580}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>הזן את הכמות שהתקבלה בפועל עבור כל פריט.</p>
        {po.items.map((item, i) => {
          const remaining = item.quantityOrdered - item.quantityReceived;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{item.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  הוזמן: {item.quantityOrdered} · התקבל: {item.quantityReceived} · נותר: {remaining}
                </p>
              </div>
              <input type="number" min={0} max={remaining} value={qtys[i]}
                onChange={e => setQtys(prev => ({ ...prev, [i]: e.target.value }))}
                disabled={remaining === 0}
                style={{ ...inputStyle, width: 80, textAlign: 'center', opacity: remaining === 0 ? 0.4 : 1 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 50 }}>מתוך {remaining}</span>
            </div>
          );
        })}
        {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
        <ModalFooter>
          <ModalBtn color="#10b981" onClick={handleReceive} loading={saving}>אשר קבלה</ModalBtn>
          <ModalBtn onClick={onClose} disabled={saving}>ביטול</ModalBtn>
        </ModalFooter>
      </div>
    </ModalShell>
  );
}

// ── Restock suggestions banner ────────────────────────────────────────────────

function RestockBanner({ suggestions }) {
  const [expanded, setExpanded] = useState(false);
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid #f97316', borderRadius: 12, padding: 16 }}>
      <button type="button" onClick={() => setExpanded(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right' }}>
        <AlertTriangle style={{ width: 16, height: 16, color: '#f97316', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#f97316', flex: 1 }}>
          {suggestions.length} מוצרים מצריכים הזמנה מספק
        </span>
        {expanded ? <ChevronUp style={{ width: 14, height: 14, color: '#f97316' }} /> : <ChevronDown style={{ width: 14, height: 14, color: '#f97316' }} />}
      </button>
      {expanded && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {suggestions.map(s => (
            <div key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.isOutOfStock ? '#ef4444' : '#fbbf24', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>{s.name}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  במלאי: {s.stock} · מינימום: {s.minStock} · מכירות: {s.salesCount}
                </p>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', minWidth: 80, textAlign: 'left' }}>
                הצע: {s.suggestedQty} יח׳
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Suppliers side panel ──────────────────────────────────────────────────────

function SuppliersPanel({ suppliers, onEdit, onDelete, onAdd }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Building2 style={{ width: 16, height: 16, color: '#2563eb' }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>ספקים ({suppliers.length})</span>
        </div>
        <button type="button" onClick={onAdd} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 8, background: '#2563eb18', border: '1px solid #2563eb44', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <Plus style={{ width: 12, height: 12 }} />ספק חדש
        </button>
      </div>
      {suppliers.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '24px 20px', fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>אין ספקים — הוסף ראשון</p>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {suppliers.map(s => (
            <div key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{s.name}</p>
                  {!s.isActive && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}>לא פעיל</span>}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 3, flexWrap: 'wrap' }}>
                  {s.contactName && <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}><User style={{ width: 10, height: 10 }} />{s.contactName}</span>}
                  {s.email && <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}><Mail style={{ width: 10, height: 10 }} />{s.email}</span>}
                  {s.phone && <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}><Phone style={{ width: 10, height: 10 }} />{s.phone}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" onClick={() => onEdit(s)} style={{ padding: 6, borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <Edit2 style={{ width: 13, height: 13 }} />
                </button>
                <button type="button" onClick={() => onDelete(s)} style={{ padding: 6, borderRadius: 6, background: '#ef444415', border: '1px solid #ef444430', cursor: 'pointer', color: '#ef4444' }}>
                  <Trash2 style={{ width: 13, height: 13 }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PO row (expandable) ───────────────────────────────────────────────────────

function PORow({ po, expanded, onToggle, onUpdated, onReceive }) {
  const [updating, setUpdating] = useState('');
  const [rowError, setRowError] = useState('');

  const totalCost = po.totalCost ?? (po.items ?? []).reduce((s, it) => s + it.unitCost * it.quantityOrdered, 0);
  const supplier  = po.supplier ?? {};

  const doAction = async (key, action) => {
    setUpdating(key); setRowError('');
    try { const updated = await action(); onUpdated(updated); }
    catch (e) { setRowError(e.message || 'שגיאה'); }
    finally { setUpdating(''); }
  };

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer', flexWrap: 'wrap' }} onClick={onToggle}>
        <StatusBadge status={po.status} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', margin: 0 }}>{po.poNumber}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, marginBottom: 0 }}>{supplier.name ?? '—'}</p>
        </div>
        <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
          <Stat label="פריטים" value={po.items?.length ?? 0} />
          <Stat label="עלות כוללת" value={fmtCost(totalCost)} />
          {po.expectedDate && <Stat label="תאריך אספקה" value={fmt(po.expectedDate)} />}
          <Stat label="נוצר" value={fmt(po.createdAt)} />
        </div>
        <div style={{ color: 'var(--text-muted)' }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', background: 'var(--bg-elevated)' }}>
          {/* Items table */}
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, marginTop: 0 }}>פריטים בהזמנה</p>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                  {['מוצר', 'SKU', 'הוזמן', 'התקבל', 'נותר', 'עלות יח׳', 'סה״כ'].map(h => (
                    <th key={h} style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(po.items ?? []).map((item, i) => {
                  const remaining = item.quantityOrdered - item.quantityReceived;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>{item.name}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{item.sku}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{item.quantityOrdered}</td>
                      <td style={{ padding: '8px 12px', color: item.quantityReceived > 0 ? '#10b981' : 'var(--text-muted)' }}>{item.quantityReceived}</td>
                      <td style={{ padding: '8px 12px', color: remaining === 0 ? '#10b981' : '#fbbf24', fontWeight: 600 }}>{remaining}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{fmtCost(item.unitCost)}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{fmtCost(item.unitCost * item.quantityOrdered)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {po.notes && <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 14, marginTop: 0 }}>הערה: {po.notes}</p>}
          {rowError && <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 10, marginTop: 0 }}>{rowError}</p>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {po.status === 'draft' && (
              <ActionBtn color="#fbbf24" icon={<Clock size={14} />} label="סמן כהוזמן"
                loading={updating === 'order'}
                onClick={() => doAction('order', () => adminService.updatePurchaseOrder(po._id, { status: 'ordered' }))} />
            )}
            {['ordered', 'partially_received'].includes(po.status) && (
              <ActionBtn color="#10b981" icon={<CheckCircle2 size={14} />} label="קבל פריטים"
                onClick={() => onReceive(po)} />
            )}
            {['draft', 'ordered'].includes(po.status) && (
              <ActionBtn color="#ef4444" icon={<XCircle size={14} />} label="בטל הזמנה"
                loading={updating === 'cancel'}
                onClick={() => doAction('cancel', () => adminService.updatePurchaseOrder(po._id, { status: 'cancelled' }))} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SupplierOrdersPage() {
  const { toast } = useToast();
  const [orders,       setOrders]       = useState([]);
  const [ordersMeta,   setOrdersMeta]   = useState(null);
  const [suppliers,    setSuppliers]    = useState([]);
  const [suggestions,  setSuggestions]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [expanded,     setExpanded]     = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search,       setSearch]       = useState('');
  const [page,         setPage]         = useState(1);
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [modal, setModal] = useState(null); // null | 'newPO' | 'newSupplier' | { type, ... }

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const params = { page, limit: 20 };
    if (statusFilter) params.status   = statusFilter;
    if (search.trim()) params.search  = search.trim();

    const [ordersData, suppliersData, suggestionsData] = await Promise.all([
      adminService.listPurchaseOrders(params),
      adminService.listSuppliers({ isActive: 'true', limit: 100 }),
      adminService.getRestockSuggestions(),
    ]);

    setOrders(ordersData.orders);
    setOrdersMeta(ordersData.meta);
    setSuppliers(suppliersData.suppliers);
    setSuggestions(suggestionsData);
    setLoading(false);
  }, [page, statusFilter, search]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const countsByStatus = orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] ?? 0) + 1; return acc; }, {});

  const handlePOCreated  = (po)      => { setOrders(prev => [po, ...prev]); setModal(null); };
  const handlePOUpdated  = (updated) => { setOrders(prev => prev.map(o => o._id === updated._id ? { ...o, ...updated } : o)); setExpanded(null); };
  const handleReceived   = (updated) => {
    setOrders(prev => prev.map(o => o._id === updated._id ? { ...o, ...updated } : o));
    setModal(null);
    adminService.getRestockSuggestions().then(setSuggestions).catch(() => {});
  };
  const handleSupplierSaved = (saved, isEdit) => {
    setSuppliers(prev => isEdit ? prev.map(s => s._id === saved._id ? saved : s) : [saved, ...prev]);
    setModal(null);
  };
  const handleSupplierDelete = async (s) => {
    if (!window.confirm(`למחוק את ספק "${s.name}"?`)) return;
    try { await adminService.deleteSupplier(s._id); setSuppliers(prev => prev.filter(sup => sup._id !== s._id)); }
    catch (e) { toast.error(e.message || 'שגיאה במחיקת ספק'); }
  };

  const totalPages = ordersMeta?.totalPages ?? 1;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">הזמנות ספקים</h1>
          <p className="text-muted-foreground text-sm mt-1">ניהול רכש, ספקים ועדכון מלאי</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setShowSuppliers(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
            <Building2 className="w-4 h-4" />ספקים
          </button>
          <button type="button" onClick={fetchAll}
            className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-colors" title="רענן">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setModal('newPO')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563eb] text-white text-sm font-medium hover:bg-[#2563eb]/90 transition-colors">
            <Plus className="w-4 h-4" />הזמנה חדשה
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
        {[
          { label: 'טיוטות',       value: countsByStatus.draft              ?? 0, color: '#6b7280' },
          { label: 'הוזמנו',       value: countsByStatus.ordered            ?? 0, color: '#fbbf24' },
          { label: 'התקבל חלקית', value: countsByStatus.partially_received ?? 0, color: '#3b82f6' },
          { label: 'הושלמו',       value: countsByStatus.received           ?? 0, color: '#10b981' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 12, padding: '12px 16px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 4px' }}>{label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, color, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Suppliers panel */}
      {showSuppliers && (
        <SuppliersPanel
          suppliers={suppliers}
          onAdd={() => setModal('newSupplier')}
          onEdit={s => setModal({ type: 'editSupplier', supplier: s })}
          onDelete={handleSupplierDelete}
        />
      )}

      {/* Restock suggestions */}
      <RestockBanner suggestions={suggestions} />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {PO_STATUS_FILTERS.map(({ value, label }) => (
            <button key={value} type="button"
              onClick={() => { setStatusFilter(value); setPage(1); setExpanded(null); }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === value ? 'bg-[#2563eb] text-white' : 'bg-card text-muted-foreground hover:bg-secondary'}`}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Search style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input type="text" placeholder="חיפוש לפי מספר PO…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '6px 32px 6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }} />
          {search && (
            <button type="button" onClick={() => setSearch('')}
              style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* PO list */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">טוען הזמנות…</div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center py-20 gap-3">
          <Package className="w-10 h-10 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground text-sm">אין הזמנות ספקים{statusFilter ? ` בסטטוס "${PO_STATUS_FILTERS.find(f => f.value === statusFilter)?.label}"` : ''}</p>
        </div>
      ) : (
        <>
          {orders.map(po => (
            <PORow key={po._id} po={po}
              expanded={expanded === po._id}
              onToggle={() => setExpanded(prev => prev === po._id ? null : po._id)}
              onUpdated={handlePOUpdated}
              onReceive={p => setModal({ type: 'receive', po: p })}
            />
          ))}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8 }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: page <= 1 ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: 13, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>
                הקודם
              </button>
              <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>עמוד {page} מתוך {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: page >= totalPages ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: 13, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>
                הבא
              </button>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {modal === 'newPO' && (
        <CreatePOModal suppliers={suppliers.filter(s => s.isActive !== false)} onClose={() => setModal(null)} onCreated={handlePOCreated} />
      )}
      {modal === 'newSupplier' && (
        <SupplierModal onClose={() => setModal(null)} onSaved={handleSupplierSaved} />
      )}
      {modal?.type === 'editSupplier' && (
        <SupplierModal supplier={modal.supplier} onClose={() => setModal(null)} onSaved={handleSupplierSaved} />
      )}
      {modal?.type === 'receive' && (
        <ReceiveModal po={modal.po} onClose={() => setModal(null)} onReceived={handleReceived} />
      )}
    </div>
  );
}
