'use client';
import { useState, useEffect } from 'react';
import {
    Search,
    Download,
    Eye,
    MoreVertical,
    X,
    FileText,
    Edit,
    Copy,
    MessageSquare,
    Package,
    MapPin,
    XCircle,
    CheckCircle2,
    RefreshCcw,
    CreditCard,
    Loader2,
    AlertCircle,
} from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';
import { useTranslation } from '../../context/LanguageContext';

function getStatusColor(status) {
    switch (status) {
        case 'delivered':        return 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20';
        case 'confirmed':
        case 'processing':       return 'bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20';
        case 'pending':          return 'bg-[#fbbf24]/10 text-[#fbbf24] border-[#fbbf24]/20';
        case 'pending_payment':  return 'bg-[#f97316]/10 text-[#f97316] border-[#f97316]/20';
        case 'shipped':          return 'bg-[#8b5cf6]/10 text-[#8b5cf6] border-[#8b5cf6]/20';
        case 'cancelled':        return 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20';
        case 'refunded':         return 'bg-[#a855f7]/10 text-[#a855f7] border-[#a855f7]/20';
        default:                 return 'bg-secondary text-muted-foreground border-border';
    }
}

function getPaymentColor(ps) {
    switch (ps) {
        case 'paid':               return 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20';
        case 'partially_refunded': return 'bg-[#f97316]/10 text-[#f97316] border-[#f97316]/20';
        case 'refunded':           return 'bg-[#a855f7]/10 text-[#a855f7] border-[#a855f7]/20';
        case 'authorized':         return 'bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20';
        case 'failed':             return 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20';
        case 'unpaid':
        default:                   return 'bg-[#fbbf24]/10 text-[#fbbf24] border-[#fbbf24]/20';
    }
}

function formatAmount(amount) {
    if (amount == null) return '—';
    return `₪${Number(amount).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('he-IL');
}

export default function AdminOrdersPage() {
    const t = useTranslation();
    const [orders, setOrders]               = useState([]);
    const [loading, setLoading]             = useState(true);
    const [error, setError]                 = useState('');
    const [meta, setMeta]                   = useState(null);
    const [page, setPage]                   = useState(1);
    const [stats, setStats]                 = useState({ pending: '—', processing: '—', delivered: '—', cancelled: '—' });
    const [searchTerm, setSearchTerm]       = useState('');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [menuOpen, setMenuOpen]           = useState(null);
    const [statusFilter, setStatusFilter]   = useState('all');

    const ORDER_STATUS_OPTIONS = [
        { value: 'all',             label: t('admin.orders.status.all') },
        { value: 'pending_payment', label: t('order.status.pending_payment') },
        { value: 'pending',         label: t('admin.orders.status.new') },
        { value: 'confirmed',       label: t('order.status.confirmed') },
        { value: 'processing',      label: t('order.status.processing') },
        { value: 'shipped',         label: t('order.status.shipped') },
        { value: 'delivered',       label: t('order.status.delivered') },
        { value: 'cancelled',       label: t('order.status.cancelled') },
        { value: 'refunded',        label: t('order.status.refunded') },
    ];

    const getStatusText = (status) => {
        if (status === 'pending') return t('admin.orders.status.new');
        return t(`order.status.${status}`) || status;
    };

    const getPaymentText = (ps) => {
        if (ps === 'partially_refunded') return t('admin.orders.pay.partial');
        return t(`admin.orders.pay.${ps}`) || ps;
    };

    // Fetch per-status counts once on mount
    useEffect(() => {
        async function fetchStats() {
            try {
                const [p, pr, d, c] = await Promise.all([
                    adminService.listAllOrders({ limit: 1, status: 'pending' }),
                    adminService.listAllOrders({ limit: 1, status: 'processing' }),
                    adminService.listAllOrders({ limit: 1, status: 'delivered' }),
                    adminService.listAllOrders({ limit: 1, status: 'cancelled' }),
                ]);
                setStats({
                    pending:    p.meta?.total  ?? 0,
                    processing: pr.meta?.total ?? 0,
                    delivered:  d.meta?.total  ?? 0,
                    cancelled:  c.meta?.total  ?? 0,
                });
            } catch {
                // non-critical — tiles remain as '—'
            }
        }
        fetchStats();
    }, []);

    // Refetch when page or status filter changes
    useEffect(() => {
        let cancelled = false;
        async function fetchOrders() {
            setLoading(true);
            setError('');
            try {
                const result = await adminService.listAllOrders({
                    page,
                    limit: 20,
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                });
                if (!cancelled) {
                    setOrders(result.orders ?? []);
                    setMeta(result.meta);
                }
            } catch (err) {
                if (!cancelled) setError(err.message || t('admin.orders.load_error'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        fetchOrders();
        return () => { cancelled = true; };
    }, [page, statusFilter]);

    const handleStatusFilter = (val) => {
        setStatusFilter(val);
        setPage(1);
    };

    const filteredOrders = orders.filter((order) => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (
            (order.orderNumber || '').toLowerCase().includes(q) ||
            (order.shippingAddress?.city || '').toLowerCase().includes(q) ||
            (order.shippingAddress?.street || '').toLowerCase().includes(q)
        );
    });

    const handleOrderUpdate = (updatedOrder) => {
        if (!updatedOrder?._id) return;
        setOrders(prev => prev.map(o => o._id === updatedOrder._id ? { ...o, ...updatedOrder } : o));
        setSelectedOrder(prev => prev?._id === updatedOrder._id ? { ...prev, ...updatedOrder } : prev);
    };

    const handleCancelOrder = async (order) => {
        if (!window.confirm(`${t('admin.orders.confirm_cancel')} ${order.orderNumber}?`)) return;
        setMenuOpen(null);
        try {
            const updated = await adminService.updateOrderStatus(order._id, 'cancelled');
            handleOrderUpdate(updated);
        } catch (err) {
            alert(err.message || t('admin.orders.cancel_failed'));
        }
    };

    const totalPages = meta?.totalPages ?? 1;

    return (
        <div className="p-8" dir="rtl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl text-foreground mb-2">{t('admin.orders.title')}</h1>
                    <p className="text-muted-foreground">
                        {t('admin.orders.subtitle')}
                        {meta ? ` • ${meta.total.toLocaleString()} ${t('admin.orders.total_count')}` : ''}
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        className="flex items-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-lg hover:bg-secondary/70 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        {t('admin.orders.export')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <StatTile label={t('admin.orders.stat.pending')}    value={stats.pending}    color="#2563eb" />
                <StatTile label={t('admin.orders.stat.processing')} value={stats.processing} color="#fbbf24" />
                <StatTile label={t('admin.orders.stat.delivered')}  value={stats.delivered}  color="#10b981" />
                <StatTile label={t('admin.orders.stat.cancelled')}  value={stats.cancelled}  color="#ef4444" />
            </div>

            <div className="bg-card border border-border rounded-lg p-6 mb-6">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder={t('admin.orders.search_placeholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-secondary border border-border rounded-lg pl-4 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
                        />
                    </div>

                    <select
                        value={statusFilter}
                        onChange={(e) => handleStatusFilter(e.target.value)}
                        className="bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
                    >
                        {ORDER_STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
                {error && (
                    <div className="flex items-center gap-2 p-4 text-[#ef4444] bg-[#ef4444]/5 border-b border-border">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-secondary/30 border-b border-border">
                            <tr>
                                <th className="text-right px-6 py-4 text-sm text-muted-foreground">{t('admin.orders.col.number')}</th>
                                <th className="text-right px-6 py-4 text-sm text-muted-foreground">{t('admin.orders.col.address')}</th>
                                <th className="text-right px-6 py-4 text-sm text-muted-foreground">{t('admin.orders.col.date')}</th>
                                <th className="text-right px-6 py-4 text-sm text-muted-foreground">{t('admin.orders.col.items')}</th>
                                <th className="text-right px-6 py-4 text-sm text-muted-foreground">{t('admin.orders.col.total')}</th>
                                <th className="text-right px-6 py-4 text-sm text-muted-foreground">{t('admin.orders.col.status')}</th>
                                <th className="text-right px-6 py-4 text-sm text-muted-foreground">{t('admin.orders.col.payment')}</th>
                                <th className="text-right px-6 py-4 text-sm text-muted-foreground">{t('admin.orders.col.actions')}</th>
                            </tr>
                        </thead>

                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan="8" className="px-6 py-12 text-center">
                                        <Loader2 className="w-6 h-6 animate-spin text-[#2563eb] mx-auto" />
                                    </td>
                                </tr>
                            )}

                            {!loading && filteredOrders.map((order) => (
                                <tr
                                    key={order._id}
                                    className="border-b border-border hover:bg-secondary/20 transition-colors"
                                >
                                    <td className="px-6 py-4">
                                        <span className="text-[#2563eb] font-mono text-sm">{order.orderNumber}</span>
                                    </td>

                                    <td className="px-6 py-4">
                                        <div>
                                            <p className="text-foreground">{order.shippingAddress?.city || '—'}</p>
                                            <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                                                {order.shippingAddress?.street || ''}
                                            </p>
                                        </div>
                                    </td>

                                    <td className="px-6 py-4 text-foreground">{formatDate(order.createdAt)}</td>
                                    <td className="px-6 py-4 text-foreground">{order.items?.length ?? 0}</td>
                                    <td className="px-6 py-4 text-foreground">{formatAmount(order.total)}</td>

                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${getStatusColor(order.status)}`}>
                                            {getStatusText(order.status)}
                                        </span>
                                    </td>

                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${getPaymentColor(order.paymentStatus)}`}>
                                            {getPaymentText(order.paymentStatus)}
                                        </span>
                                    </td>

                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedOrder(order)}
                                                className="p-2 hover:bg-secondary rounded-lg transition-colors"
                                                title={t('admin.orders.view_details')}
                                            >
                                                <Eye className="w-4 h-4 text-muted-foreground" />
                                            </button>

                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setMenuOpen(menuOpen === order._id ? null : order._id)}
                                                    className="p-2 hover:bg-secondary rounded-lg transition-colors"
                                                    title={t('admin.orders.more_actions')}
                                                >
                                                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                                                </button>

                                                {menuOpen === order._id && (
                                                    <div className="absolute left-0 top-full mt-2 w-52 bg-card border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                                                        <MenuButton icon={<Copy className="w-4 h-4 text-[#2563eb]" />} onClick={() => setMenuOpen(null)}>
                                                            {t('admin.orders.action.duplicate')}
                                                        </MenuButton>
                                                        <MenuButton icon={<MessageSquare className="w-4 h-4 text-[#3b82f6]" />} onClick={() => setMenuOpen(null)}>
                                                            {t('admin.orders.action.add_note')}
                                                        </MenuButton>
                                                        {!['cancelled', 'refunded', 'delivered'].includes(order.status) && (
                                                            <MenuButton
                                                                icon={<XCircle className="w-4 h-4 text-[#ef4444]" />}
                                                                onClick={() => handleCancelOrder(order)}
                                                            >
                                                                {t('admin.orders.action.cancel')}
                                                            </MenuButton>
                                                        )}
                                                        <MenuButton
                                                            icon={<CheckCircle2 className="w-4 h-4 text-[#10b981]" />}
                                                            onClick={() => { setSelectedOrder(order); setMenuOpen(null); }}
                                                        >
                                                            {t('admin.orders.action.details')}
                                                        </MenuButton>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {!loading && filteredOrders.length === 0 && !error && (
                                <tr>
                                    <td colSpan="8" className="px-6 py-12 text-center text-muted-foreground">
                                        {t('admin.orders.empty')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                        {meta
                            ? `${t('admin.orders.showing')} ${Math.min((page - 1) * 20 + 1, meta.total)}–${Math.min(page * 20, meta.total)} ${t('admin.orders.of')} ${meta.total} ${t('admin.orders.total_count')}`
                            : ''}
                    </p>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={page <= 1 || loading}
                            onClick={() => setPage(p => p - 1)}
                            className="px-4 py-2 bg-secondary border border-border rounded-lg text-foreground hover:bg-secondary/70 transition-colors disabled:opacity-40"
                        >
                            {t('admin.orders.prev')}
                        </button>
                        <button
                            type="button"
                            disabled={page >= totalPages || loading}
                            onClick={() => setPage(p => p + 1)}
                            className="px-4 py-2 bg-[#2563eb] text-white rounded-lg hover:bg-[#2563eb]/90 transition-colors disabled:opacity-40"
                        >
                            {t('admin.orders.next')}
                        </button>
                    </div>
                </div>
            </div>

            {selectedOrder && (
                <OrderDetailsModal
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    getStatusColor={getStatusColor}
                    getStatusText={getStatusText}
                    getPaymentText={getPaymentText}
                    onRefundSuccess={handleOrderUpdate}
                />
            )}
        </div>
    );
}

function StatTile({ label, value, color }) {
    return (
        <div
            className="rounded-lg p-4 border"
            style={{ backgroundColor: `${color}0d`, borderColor: `${color}33` }}
        >
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl" style={{ color }}>{value}</p>
        </div>
    );
}

function MenuButton({ icon, children, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-right px-4 py-3 hover:bg-secondary transition-colors flex items-center gap-3 text-sm text-foreground border-t border-border first:border-t-0"
        >
            {icon}
            <span>{children}</span>
        </button>
    );
}

function OrderDetailsModal({ order, onClose, getStatusColor, getStatusText, getPaymentText, onRefundSuccess }) {
    const t = useTranslation();
    const [showRefund, setShowRefund]     = useState(false);
    const [refundAmount, setRefundAmount] = useState('');
    const [refundReason, setRefundReason] = useState('');
    const [refundNote, setRefundNote]     = useState('');
    const [refunding, setRefunding]       = useState(false);
    const [refundError, setRefundError]   = useState('');

    const refundableStatuses = ['paid', 'partially_refunded'];
    const canRefund       = refundableStatuses.includes(order.paymentStatus);
    const alreadyRefunded = order.refundedAmount ?? 0;
    const remaining       = parseFloat((order.total - alreadyRefunded).toFixed(2));

    const handleRefund = async () => {
        const amount = parseFloat(refundAmount);
        if (!amount || amount <= 0) { setRefundError(t('admin.orders.refund.positive_amount')); return; }
        if (amount > remaining)     { setRefundError(`${t('admin.orders.refund.exceeds')} (₪${remaining})`); return; }

        setRefunding(true);
        setRefundError('');
        try {
            const updated = await adminService.refundOrder(order._id, {
                amount,
                reason: refundReason,
                note: refundNote,
            });
            onRefundSuccess(updated);
            setShowRefund(false);
            setRefundAmount('');
            setRefundReason('');
            setRefundNote('');
        } catch (err) {
            setRefundError(err.message || t('admin.orders.refund.failed'));
        } finally {
            setRefunding(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={onClose}
            dir="rtl"
        >
            <div
                className="bg-card border border-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
                    <div>
                        <h2 className="text-xl text-foreground mb-1">{t('admin.orders.details.title')} {order.orderNumber}</h2>
                        <p className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 hover:bg-secondary rounded-lg transition-colors"
                        aria-label={t('admin.orders.details.close')}
                    >
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm border ${getStatusColor(order.status)}`}>
                            {getStatusText(order.status)}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm border ${getPaymentColor(order.paymentStatus)}`}>
                            <CreditCard className="w-3.5 h-3.5" />
                            {getPaymentText(order.paymentStatus)}
                        </span>
                        {alreadyRefunded > 0 && (
                            <span className="text-xs text-muted-foreground">
                                ({t('admin.orders.details.refunded')}: {formatAmount(alreadyRefunded)})
                            </span>
                        )}
                    </div>

                    {order.shippingAddress && (
                        <div className="bg-secondary/30 rounded-lg p-5">
                            <h3 className="text-foreground mb-4 flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-[#2563eb]" />
                                {t('admin.orders.details.shipping_address')}
                            </h3>
                            <div className="space-y-1 text-foreground text-sm">
                                {order.shippingAddress.street && <p>{order.shippingAddress.street}</p>}
                                <p>
                                    {order.shippingAddress.city}
                                    {order.shippingAddress.zip ? ` ${order.shippingAddress.zip}` : ''}
                                </p>
                                {order.shippingAddress.country && <p>{order.shippingAddress.country}</p>}
                            </div>
                        </div>
                    )}

                    {order.items?.length > 0 && (
                        <div className="bg-secondary/30 rounded-lg p-5">
                            <h3 className="text-foreground mb-4 flex items-center gap-2">
                                <Package className="w-5 h-5 text-[#2563eb]" />
                                {t('admin.orders.details.items')}
                            </h3>
                            <div className="space-y-3">
                                {order.items.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between p-3 bg-card rounded-lg"
                                    >
                                        <div>
                                            <p className="text-foreground">{item.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {t('admin.orders.details.qty')}: {item.quantity} | SKU: {item.sku}
                                            </p>
                                        </div>
                                        <span className="text-[#2563eb]">{formatAmount(item.totalPrice)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="bg-gradient-to-br from-[#2563eb]/10 to-transparent border border-[#2563eb]/20 rounded-lg p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground mb-1">{t('admin.orders.details.total')}</p>
                                <p className="text-3xl text-[#2563eb]">{formatAmount(order.total)}</p>
                            </div>
                            <div className="text-left">
                                <p className="text-sm text-muted-foreground mb-1">{t('admin.orders.details.item_count')}</p>
                                <p className="text-2xl text-foreground">{order.items?.length ?? 0}</p>
                            </div>
                        </div>
                        {alreadyRefunded > 0 && (
                            <p className="text-sm text-muted-foreground mt-3 border-t border-border/40 pt-3">
                                {t('admin.orders.details.remaining_refund')}: {formatAmount(remaining)}
                            </p>
                        )}
                    </div>

                    {canRefund && (
                        <div className="border border-[#f97316]/30 rounded-lg overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setShowRefund(v => !v)}
                                className="w-full flex items-center justify-between px-5 py-4 bg-[#f97316]/5 hover:bg-[#f97316]/10 transition-colors text-foreground"
                            >
                                <span className="flex items-center gap-2 text-sm">
                                    <RefreshCcw className="w-4 h-4 text-[#f97316]" />
                                    {t('admin.orders.refund.title')}
                                </span>
                                <span className="text-xs text-muted-foreground">{showRefund ? '▲' : '▼'}</span>
                            </button>

                            {showRefund && (
                                <div className="p-5 space-y-4 bg-secondary/10">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-muted-foreground mb-1.5">
                                                {t('admin.orders.refund.amount_label')} *
                                            </label>
                                            <input
                                                type="number"
                                                min="0.01"
                                                step="0.01"
                                                max={remaining}
                                                value={refundAmount}
                                                onChange={e => { setRefundAmount(e.target.value); setRefundError(''); }}
                                                placeholder={`${t('admin.orders.refund.up_to')} ₪${remaining}`}
                                                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#f97316]/40"
                                                disabled={refunding}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-muted-foreground mb-1.5">
                                                {t('admin.orders.refund.reason_label')}
                                            </label>
                                            <input
                                                type="text"
                                                value={refundReason}
                                                onChange={e => setRefundReason(e.target.value)}
                                                placeholder={t('admin.orders.refund.reason_placeholder')}
                                                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#f97316]/40"
                                                disabled={refunding}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-muted-foreground mb-1.5">
                                            {t('admin.orders.refund.note_label')}
                                        </label>
                                        <textarea
                                            rows={2}
                                            value={refundNote}
                                            onChange={e => setRefundNote(e.target.value)}
                                            placeholder={t('admin.orders.refund.note_placeholder')}
                                            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-[#f97316]/40"
                                            disabled={refunding}
                                        />
                                    </div>

                                    {refundError && (
                                        <p className="text-sm text-[#ef4444]">{refundError}</p>
                                    )}

                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={handleRefund}
                                            disabled={refunding}
                                            className="flex items-center gap-2 bg-[#f97316] text-white px-5 py-2.5 rounded-lg hover:bg-[#f97316]/90 transition-colors text-sm disabled:opacity-60"
                                        >
                                            <RefreshCcw className="w-4 h-4" />
                                            {refunding ? t('admin.orders.refund.processing') : t('admin.orders.refund.submit')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setShowRefund(false); setRefundError(''); }}
                                            disabled={refunding}
                                            className="px-5 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground hover:bg-secondary/70 transition-colors"
                                        >
                                            {t('admin.orders.refund.cancel')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-3 pt-4 border-t border-border">
                        <button
                            type="button"
                            className="flex-1 flex items-center justify-center gap-2 bg-[#2563eb] text-white px-4 py-3 rounded-lg hover:bg-[#2563eb]/90 transition-colors"
                        >
                            <FileText className="w-4 h-4" />
                            <span>{t('admin.orders.details.invoice')}</span>
                        </button>
                        <button
                            type="button"
                            className="flex-1 flex items-center justify-center gap-2 bg-secondary border border-border text-foreground px-4 py-3 rounded-lg hover:bg-secondary/70 transition-colors"
                        >
                            <Edit className="w-4 h-4" />
                            <span>{t('admin.orders.details.edit')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
