import { useState, useEffect, useCallback } from 'react';
import {
  Package, AlertTriangle, CheckCircle2, ScanLine,
  TrendingUp, TrendingDown, RefreshCw, Search, Filter,
  ChevronLeft, ChevronRight, X, Warehouse,
} from 'lucide-react';
import { warehouseService }  from '../../features/warehouse/api/warehouse.service';
import { adminService }      from '../../features/admin/api/admin.service';
import styles from './AdminInventoryPage.module.css';

// ── helpers ────────────────────────────────────────────────────────────────────

const placeholder =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg==';

function stockStatus(stock, minStock) {
  if (stock === 0) return 'critical';
  if (stock <= (minStock ?? 5)) return 'low';
  return 'ok';
}

function stockPct(stock, minStock) {
  const min = minStock ?? 5;
  if (min === 0) return 100;
  return Math.min(100, Math.round((stock / (min * 2)) * 100));
}

function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דקות`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} שעות`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

const MOVEMENT_META = {
  stock_in:   { label: 'כניסה',    color: '#10b981', sign: '+' },
  stock_out:  { label: 'יציאה',    color: '#ef4444', sign: '−' },
  adjustment: { label: 'התאמה',    color: '#3b82f6', sign: '±' },
  damaged:    { label: 'פגום',      color: '#f97316', sign: '−' },
  returned:   { label: 'החזרה',    color: '#14b8a6', sign: '+' },
};

const REASON_LABELS = {
  restock:         'חידוש מלאי',
  sale:            'מכירה',
  cancellation:    'ביטול הזמנה',
  manual_add:      'הוספה ידנית',
  manual_subtract: 'הפחתה ידנית',
  damaged:         'סחורה פגומה',
  return:          'החזרה',
  refund:          'החזר כספי',
};

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon} style={{ background: `${color}18` }}>
        <Icon className={styles.statIconSvg} style={{ color }} />
      </div>
      <div>
        <p className={styles.statLabel}>{label}</p>
        <p className={styles.statValue}>{value}</p>
      </div>
    </div>
  );
}

// ── Stock action modal ─────────────────────────────────────────────────────────

function ActionModal({ product, mode, onClose, onSuccess }) {
  const [qty,    setQty]    = useState('');
  const [reason, setReason] = useState('');
  const [notes,  setNotes]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const cfg = {
    restock: { title: 'חידוש מלאי', label: 'כמות להוסיף', color: '#10b981', btnLabel: 'חדש מלאי' },
    adjust:  { title: 'התאמת מלאי', label: 'שינוי כמות (+ להוספה / - להפחתה)', color: '#3b82f6', btnLabel: 'שמור התאמה' },
    damaged: { title: 'סימון כפגום', label: 'כמות פגומה', color: '#f97316', btnLabel: 'סמן כפגום' },
  }[mode];

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsedQty = parseFloat(qty);
    if (isNaN(parsedQty) || parsedQty === 0) return setError('נא להזין כמות תקינה');
    setLoading(true);
    setError(null);
    try {
      let updated;
      if (mode === 'restock') {
        updated = await warehouseService.restock(product._id, { quantity: parsedQty, reason, notes });
      } else if (mode === 'adjust') {
        updated = await warehouseService.adjust(product._id, { quantity: parsedQty, reason, notes });
      } else {
        updated = await warehouseService.markDamaged(product._id, { quantity: parsedQty, reason, notes });
      }
      onSuccess(updated);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message ?? err?.message ?? 'שגיאה בפעולה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modal} dir="rtl">
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>{cfg.title}</h2>
            <p className={styles.modalSub}>{product.name} · {product.sku}</p>
          </div>
          <button type="button" onClick={onClose} className={styles.modalClose}>
            <X className={styles.modalCloseIcon} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalBody}>
          <div className={styles.currentStock}>
            <span className={styles.currentStockLabel}>מלאי נוכחי</span>
            <span className={styles.currentStockVal}>{product.stock} יח׳</span>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>{cfg.label} *</label>
            <input
              type="number"
              step={mode === 'adjust' ? '1' : '1'}
              value={qty}
              onChange={e => setQty(e.target.value)}
              placeholder={mode === 'adjust' ? 'לדוגמה: 10 או -5' : 'לדוגמה: 50'}
              className={styles.fieldInput}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>סיבה</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="לדוגמה: קבלה מספק / תיקון"
              className={styles.fieldInput}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>הערות</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="הערות נוספות..."
              className={styles.fieldTextarea}
            />
          </div>

          {error && <p className={styles.modalError}>{error}</p>}

          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={loading}>ביטול</button>
            <button
              type="submit"
              className={styles.submitBtn}
              style={{ background: cfg.color }}
              disabled={loading}
            >
              {loading ? 'שולח...' : cfg.btnLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Product row ────────────────────────────────────────────────────────────────

function ProductRow({ product, onAction }) {
  const status = stockStatus(product.stock, product.minStock);
  const pct    = stockPct(product.stock, product.minStock);
  const img    = product.images?.[0];

  const statusCls = status === 'critical' ? styles.statusCritical
                  : status === 'low'      ? styles.statusLow
                  : styles.statusOk;
  const statusLabel = status === 'critical' ? 'אזל' : status === 'low' ? 'נמוך' : 'תקין';

  return (
    <tr className={styles.tr}>
      <td className={styles.tdImg}>
        <div className={styles.imgWrap}>
          <img src={img || placeholder} alt={product.name} className={styles.img}
            onError={e => { e.currentTarget.src = placeholder; }} />
        </div>
      </td>
      <td className={styles.tdName}>
        <p className={styles.productName}>{product.name}</p>
        <p className={styles.productSku}>{product.sku}</p>
        {product.category?.name && <p className={styles.productCat}>{product.category.name}</p>}
      </td>
      <td className={styles.tdStock}>
        <div className={styles.stockNum}>{product.stock}</div>
        <div className={styles.progressBar}>
          <div
            className={`${styles.progressFill} ${
              status === 'critical' ? styles.progressCritical :
              status === 'low'      ? styles.progressLow      : styles.progressOk
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className={styles.stockMin}>מינ׳ {product.minStock ?? 5}</div>
      </td>
      <td className={styles.tdSales}>{product.salesCount ?? 0}</td>
      <td className={styles.tdStatus}>
        <span className={`${styles.statusBadge} ${statusCls}`}>{statusLabel}</span>
      </td>
      <td className={styles.tdActions}>
        <button type="button" className={styles.actionBtn} style={{ color: '#10b981' }}
          onClick={() => onAction(product, 'restock')} title="חדש מלאי">
          <TrendingUp className={styles.actionIcon} />
        </button>
        <button type="button" className={styles.actionBtn} style={{ color: '#3b82f6' }}
          onClick={() => onAction(product, 'adjust')} title="התאם מלאי">
          <RefreshCw className={styles.actionIcon} />
        </button>
        <button type="button" className={styles.actionBtn} style={{ color: '#f97316' }}
          onClick={() => onAction(product, 'damaged')} title="סמן כפגום">
          <AlertTriangle className={styles.actionIcon} />
        </button>
      </td>
    </tr>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminInventoryPage() {
  const [products, setProducts]   = useState([]);
  const [meta, setMeta]           = useState(null);
  const [health, setHealth]       = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [scanning, setScanning]   = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError]         = useState(null);

  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState('');
  const [page,    setPage]    = useState(1);

  const [modal, setModal] = useState(null); // { product, mode }

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 30 };
      if (search) params.search = search;
      if (status) params.status = status;

      const [inv, h, mvmt] = await Promise.all([
        warehouseService.listInventory(params),
        adminService.getInventoryHealth(),
        warehouseService.listMovements({ limit: 8 }),
      ]);
      setProducts(inv.products);
      setMeta(inv.meta);
      setHealth(h);
      setMovements(mvmt.movements);
    } catch {
      setError('שגיאה בטעינת המלאי');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const resetPage = () => setPage(1);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const result = await adminService.scanInventoryAlerts();
      setScanResult(result);
      fetchAll();
    } catch (err) {
      setScanResult({ error: err?.message ?? 'שגיאה בסריקה' });
    } finally {
      setScanning(false);
    }
  };

  const handleActionSuccess = (updatedProduct) => {
    setProducts(prev => prev.map(p => p._id === updatedProduct._id ? { ...p, stock: updatedProduct.stock } : p));
    // Refresh movements feed
    warehouseService.listMovements({ limit: 8 }).then(m => setMovements(m.movements)).catch(() => {});
  };

  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className={styles.page} dir="rtl">
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>ניהול מלאי</h1>
          <p className={styles.subtitle}>מעקב, חידוש ותיקון מלאי בזמן אמת</p>
        </div>
        <button type="button" onClick={handleScan} disabled={scanning} className={styles.scanBtn}>
          <ScanLine className={styles.scanIcon} />
          {scanning ? 'סורק...' : 'סרוק התראות'}
        </button>
      </div>

      {/* Scan result banner */}
      {scanResult && !scanResult.error && (
        <div className={styles.scanBanner}>
          <CheckCircle2 className={styles.scanBannerIcon} />
          <span>
            סריקה הושלמה — {scanResult.outOfStockCount} אזלו · {scanResult.lowStockCount} במלאי נמוך ·{' '}
            {scanResult.created} התראות נוצרו · {scanResult.resolved} נסגרו
          </span>
        </div>
      )}
      {scanResult?.error && (
        <div className={styles.scanError}>שגיאה בסריקה: {scanResult.error}</div>
      )}

      {/* Stat cards */}
      <div className={styles.statsGrid}>
        <StatCard icon={Package}       label="סך מוצרים"        value={health?.totalProducts ?? '—'}      color="#3b82f6" />
        <StatCard icon={AlertTriangle} label="אזל מהמלאי"       value={health?.outOfStockCount ?? '—'}     color="#ef4444" />
        <StatCard icon={AlertTriangle} label="מלאי נמוך"         value={health?.lowStockCount ?? '—'}      color="#f59e0b" />
        <StatCard icon={Warehouse}     label="מלאי תקין"          value={health?.healthyStockCount ?? '—'}  color="#10b981" />
      </div>

      {/* Main content grid */}
      <div className={styles.contentGrid}>
        {/* Left: product table */}
        <div className={styles.tableSection}>
          {/* Filters */}
          <div className={styles.filterBar}>
            <div className={styles.searchWrap}>
              <Search className={styles.searchIcon} />
              <input
                type="text"
                placeholder="חיפוש לפי שם או SKU..."
                value={search}
                onChange={e => { setSearch(e.target.value); resetPage(); }}
                className={styles.searchInput}
              />
            </div>
            <div className={styles.statusTabs}>
              {[['', 'הכל'], ['critical', 'אזל'], ['low', 'נמוך'], ['healthy', 'תקין']].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setStatus(v); resetPage(); }}
                  className={`${styles.tab} ${status === v ? styles.tabActive : ''}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button type="button" className={styles.refreshBtn2} onClick={fetchAll} title="רענן">
              <RefreshCw className={styles.refreshIcon2} />
            </button>
          </div>

          {/* Table */}
          <div className={styles.tableWrap}>
            {loading ? (
              <div className={styles.stateBox}>
                <div className={styles.spinner} />
                <p className={styles.stateText}>טוען מלאי...</p>
              </div>
            ) : error ? (
              <div className={styles.stateBox}>
                <p className={styles.errorText}>{error}</p>
                <button type="button" className={styles.retryBtn} onClick={fetchAll}>נסה שוב</button>
              </div>
            ) : products.length === 0 ? (
              <div className={styles.stateBox}>
                <Package className={styles.emptyIcon} />
                <p className={styles.stateText}>לא נמצאו מוצרים</p>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr className={styles.thead}>
                    <th className={styles.th} />
                    <th className={styles.th}>מוצר</th>
                    <th className={styles.th}>מלאי</th>
                    <th className={styles.th}>מכירות</th>
                    <th className={styles.th}>סטטוס</th>
                    <th className={styles.th}>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <ProductRow key={p._id} product={p} onAction={(prod, mode) => setModal({ product: prod, mode })} />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {!loading && !error && totalPages > 1 && (
            <div className={styles.pagination}>
              <button type="button" className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronRight className={styles.pageIcon} />
              </button>
              <span className={styles.pageInfo}>{page} / {totalPages}</span>
              <button type="button" className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronLeft className={styles.pageIcon} />
              </button>
            </div>
          )}
        </div>

        {/* Right: movement feed */}
        <div className={styles.movementSection}>
          <div className={styles.movementHeader}>
            <TrendingDown className={styles.movementHeaderIcon} />
            <span>תנועות מלאי אחרונות</span>
          </div>
          {movements.length === 0 ? (
            <p className={styles.noMovements}>אין תנועות מלאי עדיין</p>
          ) : (
            <div className={styles.movementList}>
              {movements.map(m => {
                const meta2 = MOVEMENT_META[m.type] ?? MOVEMENT_META.adjustment;
                const productName = m.product?.name ?? '—';
                const actorName   = m.actor?.name ?? m.actor?.email ?? 'מערכת';
                const reasonLabel = REASON_LABELS[m.reason] ?? m.reason ?? meta2.label;

                return (
                  <div key={m._id} className={styles.movementRow}>
                    <div className={styles.movementDot} style={{ background: meta2.color }} />
                    <div className={styles.movementBody}>
                      <div className={styles.movementTop}>
                        <span className={styles.movementProduct}>{productName}</span>
                        <span className={styles.movementQty} style={{ color: meta2.color }}>
                          {meta2.sign}{m.quantity}
                        </span>
                      </div>
                      <div className={styles.movementMeta}>
                        <span>{reasonLabel}</span>
                        <span>·</span>
                        <span>{actorName}</span>
                        <span>·</span>
                        <span>{formatRelative(m.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Action modal */}
      {modal && (
        <ActionModal
          product={modal.product}
          mode={modal.mode}
          onClose={() => setModal(null)}
          onSuccess={handleActionSuccess}
        />
      )}
    </div>
  );
}
