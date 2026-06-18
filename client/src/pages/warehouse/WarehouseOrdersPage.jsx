import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, AlertCircle, Loader2, Package, ChevronLeft } from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';

const STATUS_META = {
  confirmed:  { label: 'ממתין לעיבוד', color: 'text-blue-400 bg-blue-500/10',    next: 'processing', btn: 'כנס לעיבוד' },
  processing: { label: 'בעיבוד',        color: 'text-yellow-400 bg-yellow-500/10', next: 'shipped',    btn: 'סמן כנשלח' },
  shipped:    { label: 'נשלח',           color: 'text-green-400 bg-green-500/10',   next: null,         btn: null },
  delivered:  { label: 'נמסר',           color: 'text-teal-400 bg-teal-500/10',     next: null,         btn: null },
  cancelled:  { label: 'בוטל',           color: 'text-red-400 bg-red-500/10',       next: null,         btn: null },
  pending:    { label: 'ממתין לתשלום',  color: 'text-muted-foreground bg-muted/40', next: null,         btn: null },
};

const TABS = [
  { key: '',           label: 'הכל' },
  { key: 'confirmed',  label: 'ממתין לעיבוד' },
  { key: 'processing', label: 'בעיבוד' },
  { key: 'shipped',    label: 'נשלח' },
];

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });

const fmtPrice = (n) => `₪${(n ?? 0).toFixed(2)}`;

export default function WarehouseOrdersPage() {
  const [activeTab,   setActiveTab]   = useState('confirmed');
  const [orders,      setOrders]      = useState([]);
  const [meta,        setMeta]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState('');
  const [advancing,   setAdvancing]   = useState(null);

  const load = useCallback(async (tab, page = 1) => {
    const setter = page === 1 ? setLoading : setLoadingMore;
    setter(true);
    if (page === 1) setError('');
    try {
      const params = { page, limit: 20 };
      if (tab) params.status = tab;
      const { orders: data, meta: m } = await adminService.listAllOrders(params);
      setMeta(m);
      setOrders(prev => page === 1 ? (data ?? []) : [...prev, ...(data ?? [])]);
    } catch (err) {
      if (page === 1) setError(err.message || 'שגיאה בטעינת הזמנות');
    } finally {
      setter(false);
    }
  }, []);

  useEffect(() => { load(activeTab, 1); }, [activeTab, load]);

  const handleAdvance = async (orderId, nextStatus) => {
    setAdvancing(orderId);
    try {
      await adminService.updateOrderStatus(orderId, nextStatus);
      setOrders(prev => prev.map(o => o._id === orderId ? { ...o, status: nextStatus } : o));
    } catch (err) {
      setError(err.message || 'שגיאה בעדכון סטטוס ההזמנה');
    } finally {
      setAdvancing(null);
    }
  };

  const canLoadMore = meta && meta.page < meta.pages;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">הזמנות מחסן</h1>
        <p className="text-sm text-muted-foreground mt-1">ניהול ומעקב אחר הזמנות לביצוע</p>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-lg w-fit flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg text-[#ef4444] text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#2563eb]" />
        </div>
      ) : !error && orders.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <ShoppingCart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">אין הזמנות</p>
          <p className="text-sm text-muted-foreground mt-1">אין הזמנות תואמות לסינון שנבחר</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted/40">
                <tr>
                  {['מספר הזמנה', 'לקוח', 'תאריך', 'פריטים', 'סכום', 'סטטוס', 'פעולה'].map(h => (
                    <th key={h} className="text-right px-4 py-3 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map(order => {
                  const statusKey = order.status in STATUS_META ? order.status : 'confirmed';
                  const sm        = STATUS_META[statusKey];
                  const isPending = advancing === order._id;
                  return (
                    <tr key={order._id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {order.orderNumber ?? order._id?.slice(-8)}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-[160px] truncate">
                        {order.user?.name ?? order.user?.email ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {fmtDate(order.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Package className="w-3.5 h-3.5 flex-shrink-0" />
                          {order.items?.length ?? 0}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {fmtPrice(order.total)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${sm.color}`}>
                          {sm.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {sm.next ? (
                          <button
                            type="button"
                            onClick={() => handleAdvance(order._id, sm.next)}
                            disabled={!!advancing}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2563eb]/10 hover:bg-[#2563eb]/20 text-[#2563eb] text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {isPending
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <ChevronLeft className="w-3 h-3" />
                            }
                            {sm.btn}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {canLoadMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => load(activeTab, meta.page + 1)}
                disabled={loadingMore}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm text-foreground transition-colors disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                {loadingMore ? 'טוען...' : 'טען עוד הזמנות'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
