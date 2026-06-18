import { useState, useEffect, useCallback } from 'react';
import { api, qs } from '../../services/api';
import { useToast } from '../../hooks/useToast';

// ── Thin coupon admin service (inline — avoids a new file for 4 calls) ────────
const couponAdminApi = {
  list:       (p = {}) => api.get(`/coupons${qs(p)}`).then(r => ({ coupons: r.data?.coupons ?? [], meta: r.meta })),
  create:     (dto)    => api.post('/coupons', dto).then(r => r.data?.coupon ?? r.data),
  update:     (id, dto)=> api.patch(`/coupons/${id}`, dto).then(r => r.data?.coupon ?? r.data),
  deactivate: (id)     => api.delete(`/coupons/${id}`),
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString('he-IL') : '—';
const fmtMoney = (n)   => n != null ? `$${Number(n).toFixed(2)}` : '—';

function StatusBadge({ isActive }) {
  return (
    <span
      className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
        isActive
          ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20'
          : 'bg-[#6b7280]/10 text-[#6b7280] border-[#6b7280]/20'
      }`}
    >
      {isActive ? 'פעיל' : 'לא פעיל'}
    </span>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  code: '', type: 'percentage', value: '',
  minOrderAmount: '', maxDiscountAmount: '',
  usageLimit: '', perUserLimit: '1',
  validFrom: '', validUntil: '',
  isActive: true,
};

function CouponModal({ initial, onSave, onClose }) {
  const { toast } = useToast();
  const isEdit    = !!initial;
  const [form,    setForm]    = useState(() => initial
    ? {
        ...EMPTY_FORM,
        ...initial,
        value:             String(initial.value ?? ''),
        minOrderAmount:    String(initial.minOrderAmount ?? ''),
        maxDiscountAmount: initial.maxDiscountAmount != null ? String(initial.maxDiscountAmount) : '',
        usageLimit:        initial.usageLimit != null ? String(initial.usageLimit) : '',
        perUserLimit:      String(initial.perUserLimit ?? 1),
        validFrom:         initial.validFrom  ? initial.validFrom.slice(0, 10)  : '',
        validUntil:        initial.validUntil ? initial.validUntil.slice(0, 10) : '',
      }
    : EMPTY_FORM
  );
  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState({});

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [field]: val }));
    if (errors[field]) setErrors(er => ({ ...er, [field]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!isEdit && (!form.code || form.code.length < 3))
      e.code = 'קוד חייב להיות לפחות 3 תווים';
    if (!form.value || isNaN(Number(form.value)) || Number(form.value) < 0)
      e.value = 'ערך חובה (מספר חיובי)';
    if (form.type === 'percentage' && Number(form.value) > 100)
      e.value = 'אחוז לא יכול לעלות על 100';
    if (form.minOrderAmount && isNaN(Number(form.minOrderAmount)))
      e.minOrderAmount = 'מספר בלבד';
    return e;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const dto = {
        type:    form.type,
        value:   Number(form.value),
        isActive: form.isActive,
        ...(form.minOrderAmount    && { minOrderAmount:    Number(form.minOrderAmount) }),
        ...(form.maxDiscountAmount && { maxDiscountAmount: Number(form.maxDiscountAmount) }),
        ...(form.usageLimit        && { usageLimit:        Number(form.usageLimit) }),
        ...(form.perUserLimit      && { perUserLimit:      Number(form.perUserLimit) }),
        ...(form.validFrom         && { validFrom:         form.validFrom }),
        ...(form.validUntil        && { validUntil:        form.validUntil }),
      };
      if (!isEdit) dto.code = form.code.trim().toUpperCase();
      const saved = isEdit
        ? await couponAdminApi.update(initial._id, dto)
        : await couponAdminApi.create(dto);
      toast.success(isEdit ? 'הקופון עודכן' : 'הקופון נוצר');
      onSave(saved);
    } catch (err) {
      toast.error(err.message || 'שגיאה בשמירת הקופון');
    } finally {
      setSaving(false);
    }
  };

  const inp = (field, extra = {}) => ({
    id: field,
    className: `input w-full text-sm${errors[field] ? ' border-[#ef4444]' : ''}`,
    value: form[field],
    onChange: set(field),
    disabled: saving,
    ...extra,
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {isEdit ? 'עריכת קופון' : 'יצירת קופון חדש'}
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Code — only editable on create */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5" htmlFor="code">
              קוד קופון {!isEdit && <span className="text-[#ef4444]">*</span>}
            </label>
            {isEdit
              ? <p className="input w-full text-sm font-mono tracking-widest text-foreground bg-secondary/30 select-all">{initial.code}</p>
              : <input {...inp('code', { placeholder: 'SUMMER20', className: `input w-full text-sm font-mono tracking-widest${errors.code ? ' border-[#ef4444]' : ''}` })} />
            }
            {errors.code && <p className="text-xs text-[#ef4444] mt-1">{errors.code}</p>}
          </div>

          {/* Type + Value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">סוג</label>
              <select {...inp('type', { className: 'input w-full text-sm' })}>
                <option value="percentage">אחוז (%)</option>
                <option value="fixed">סכום קבוע ($)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5" htmlFor="value">
                ערך <span className="text-[#ef4444]">*</span>
              </label>
              <input {...inp('value', { placeholder: form.type === 'percentage' ? '20' : '10.00', inputMode: 'decimal' })} />
              {errors.value && <p className="text-xs text-[#ef4444] mt-1">{errors.value}</p>}
            </div>
          </div>

          {/* Min order / Max discount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                מינימום הזמנה ($)
              </label>
              <input {...inp('minOrderAmount', { placeholder: '0', inputMode: 'decimal' })} />
              {errors.minOrderAmount && <p className="text-xs text-[#ef4444] mt-1">{errors.minOrderAmount}</p>}
            </div>
            {form.type === 'percentage' && (
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  מקסימום הנחה ($)
                </label>
                <input {...inp('maxDiscountAmount', { placeholder: 'ללא הגבלה', inputMode: 'decimal' })} />
              </div>
            )}
          </div>

          {/* Usage limits */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                מגבלת שימוש (סה"כ)
              </label>
              <input {...inp('usageLimit', { placeholder: 'ללא הגבלה', inputMode: 'numeric' })} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                מגבלה למשתמש
              </label>
              <input {...inp('perUserLimit', { placeholder: '1', inputMode: 'numeric' })} />
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                תוקף מ-
              </label>
              <input {...inp('validFrom', { type: 'date' })} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                תוקף עד
              </label>
              <input {...inp('validUntil', { type: 'date' })} />
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <input
              id="isActive"
              type="checkbox"
              checked={form.isActive}
              onChange={set('isActive')}
              disabled={saving}
              className="w-4 h-4 accent-[#6366f1]"
            />
            <label htmlFor="isActive" className="text-sm text-foreground cursor-pointer">
              קופון פעיל
            </label>
          </div>
        </div>

        <div className="p-5 border-t border-border flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-muted-foreground bg-secondary/50 hover:bg-secondary rounded-lg transition-colors"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-[#6366f1] hover:bg-[#4f46e5] rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'שומר…' : isEdit ? 'עדכן קופון' : 'צור קופון'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminCouponsPage() {
  const { toast } = useToast();

  const [coupons,  setCoupons]  = useState([]);
  const [meta,     setMeta]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all'); // 'all' | 'active' | 'inactive'
  const [modal,    setModal]    = useState(null);  // null | 'create' | coupon object (edit)
  const [toggling, setToggling] = useState(null);  // id being toggled

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? { isActive: filter === 'active' } : {};
      const { coupons: c, meta: m } = await couponAdminApi.list(params);
      setCoupons(c);
      setMeta(m);
    } catch {
      toast.error('שגיאה בטעינת הקופונים');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (saved) => {
    setCoupons(prev => {
      const idx = prev.findIndex(c => c._id === saved._id);
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
      return [saved, ...prev];
    });
    setModal(null);
  };

  const handleToggleActive = async (coupon) => {
    setToggling(coupon._id);
    try {
      if (coupon.isActive) {
        await couponAdminApi.deactivate(coupon._id);
        setCoupons(prev => prev.map(c => c._id === coupon._id ? { ...c, isActive: false } : c));
        toast.info('הקופון הושבת');
      } else {
        const updated = await couponAdminApi.update(coupon._id, { isActive: true });
        setCoupons(prev => prev.map(c => c._id === coupon._id ? updated : c));
        toast.success('הקופון הופעל');
      }
    } catch (err) {
      toast.error(err.message || 'שגיאה בעדכון הסטטוס');
    } finally {
      setToggling(null);
    }
  };

  const typeLabel = (type, value) =>
    type === 'percentage' ? `${value}%` : `$${Number(value).toFixed(2)}`;

  return (
    <div className="p-8 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">קופונים</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {meta ? `${meta.total} קופונים סה"כ` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal('create')}
          className="flex items-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white text-sm font-medium rounded-lg transition-colors"
        >
          + קופון חדש
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[['all', 'הכל'], ['active', 'פעיל'], ['inactive', 'לא פעיל']].map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setFilter(val)}
            className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
              filter === val
                ? 'bg-[#6366f1]/10 text-[#6366f1] border-[#6366f1]/30'
                : 'text-muted-foreground border-border hover:border-border-strong'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">טוען קופונים…</div>
        ) : coupons.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {filter === 'all' ? 'אין קופונים עדיין — צור קופון ראשון' : 'אין קופונים תואמים'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-5 py-3">קוד</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-5 py-3">הנחה</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-5 py-3">מינימום</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-5 py-3">שימוש</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-5 py-3">תוקף עד</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-5 py-3">סטטוס</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {coupons.map(c => (
                  <tr key={c._id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="px-5 py-3 font-mono font-semibold text-foreground tracking-wider">
                      {c.code}
                    </td>
                    <td className="px-5 py-3 text-foreground font-semibold">
                      {typeLabel(c.type, c.value)}
                      {c.maxDiscountAmount && (
                        <span className="text-xs text-muted-foreground font-normal"> (מקס {fmtMoney(c.maxDiscountAmount)})</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {c.minOrderAmount > 0 ? fmtMoney(c.minOrderAmount) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-foreground font-medium">{c.usedCount}</span>
                      {c.usageLimit != null && (
                        <span className="text-muted-foreground"> / {c.usageLimit}</span>
                      )}
                      <span className="text-muted-foreground text-xs block">
                        מגבלה למשתמש: {c.perUserLimit}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {c.validUntil ? fmtDate(c.validUntil) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge isActive={c.isActive} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setModal(c)}
                          className="text-xs px-3 py-1.5 border border-border rounded-md text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors"
                        >
                          עריכה
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(c)}
                          disabled={toggling === c._id}
                          className={`text-xs px-3 py-1.5 border rounded-md transition-colors disabled:opacity-50 ${
                            c.isActive
                              ? 'border-[#ef4444]/30 text-[#ef4444] hover:bg-[#ef4444]/10'
                              : 'border-[#10b981]/30 text-[#10b981] hover:bg-[#10b981]/10'
                          }`}
                        >
                          {toggling === c._id ? '…' : c.isActive ? 'השבת' : 'הפעל'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'create' && (
        <CouponModal onSave={handleSaved} onClose={() => setModal(null)} />
      )}
      {modal && modal !== 'create' && (
        <CouponModal initial={modal} onSave={handleSaved} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
