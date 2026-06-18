import { useEffect, useState, useCallback, useRef } from 'react';
import { adminService }  from '../../features/admin/api/admin.service';
import { QuickSummary }  from '../../features/admin/components/QuickSummary';
import { PendingTasks }  from '../../features/admin/components/PendingTasks';
import { SalesChart }    from '../../features/admin/components/SalesChart';
import { PerformanceGoals } from '../../features/admin/components/PerformanceGoals';
import { AlertsPanel }   from '../../features/admin/components/AlertsPanel';
import { TopProducts }   from '../../features/admin/components/TopProducts';
import { LiveActivityFeed } from '../../features/admin/components/LiveActivityFeed';
import { BusinessInsights } from '../../features/admin/components/BusinessInsights';
import { SmartInsightsPanel } from '../../features/admin/components/SmartInsightsPanel';
import { QuickActions }  from '../../features/admin/components/QuickActions';
import { useAdminSocket } from '../../hooks/useAdminSocket';
import { useToast }      from '../../hooks/useToast';
import { useTranslation } from '../../context/LanguageContext';

export default function AdminDashboardPage() {
    const { toast } = useToast();
    const t = useTranslation();

    const [dashboard,        setDashboard]        = useState(null);
    const [topProducts,      setTopProducts]      = useState([]);
    const [alerts,           setAlerts]           = useState([]);
    const [pendingCount,     setPendingCount]     = useState(0);
    const [activities,       setActivities]       = useState(null);
    const [anomalies,        setAnomalies]        = useState(null);
    const [ordersThisMonth,  setOrdersThisMonth]  = useState(null);
    const [loading,          setLoading]          = useState(true);
    const [error,            setError]            = useState(null);

    const refreshTimerRef = useRef(null);

    const loadDashboardData = useCallback(async () => {
        const [dash, prods, { alerts: al }, acts, ordersAnalytics] = await Promise.all([
            adminService.getDashboard(),
            adminService.getTopProducts({ limit: 5 }),
            adminService.listAlerts({ isResolved: false, limit: 6 }),
            adminService.getActivity(),
            adminService.getAnalyticsOrders({ range: '30d' }),
        ]);
        setDashboard(dash);
        setPendingCount(dash?.orders?.pending ?? 0);
        setTopProducts(Array.isArray(prods) ? prods : []);
        setAlerts(Array.isArray(al) ? al : []);
        setActivities(Array.isArray(acts) ? acts : []);
        setAnomalies(ordersAnalytics?.anomalies ?? []);
        setOrdersThisMonth(ordersAnalytics?.summary?.total ?? null);
    }, []);

    const scheduleRefresh = useCallback(() => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
            loadDashboardData().catch(() => {});
        }, 800);
    }, [loadDashboardData]);

    useEffect(() => {
        loadDashboardData()
            .catch((err) => setError(err?.message ?? t('admin.dash.error')))
            .finally(() => setLoading(false));

        return () => {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        };
    }, [loadDashboardData]);

    const onOrderCreated = useCallback((data) => {
        const fmt = (n) => Math.round(n).toLocaleString('he-IL');
        toast.success(`${t('admin.dash.new_order')}: ${data.orderNumber} — ₪${fmt(data.total)}`);
        scheduleRefresh();
    }, [toast, scheduleRefresh, t]);

    const onOrderStatusChanged = useCallback((data) => {
        toast.info(`${t('admin.dash.order_label')} ${data.orderNumber}: ${t(`order.status.${data.fromStatus}`)} ← ${t(`order.status.${data.toStatus}`)}`);
        scheduleRefresh();
    }, [toast, scheduleRefresh, t]);

    const onOrderCancelled = useCallback((data) => {
        toast.warning(`${t('admin.dash.order_cancelled')}: ${data.orderNumber}`);
        scheduleRefresh();
    }, [toast, scheduleRefresh, t]);

    const onPaymentRefunded = useCallback((data) => {
        const fmt = (n) => Math.round(n).toLocaleString('he-IL');
        const label = data.isFullRefund ? t('admin.dash.full_refund') : t('admin.dash.partial_refund');
        toast.warning(`${label}: ${data.orderNumber} — ₪${fmt(data.amount)}`);
        scheduleRefresh();
    }, [toast, scheduleRefresh, t]);

    const onAlertCreated = useCallback((data) => {
        if (data.severity === 'critical') {
            toast.error(data.title, 6000);
        } else {
            toast.warning(data.title);
        }
        scheduleRefresh();
    }, [toast, scheduleRefresh]);

    const onPaymentPaid = useCallback((data) => {
        const fmt = (n) => Math.round(n).toLocaleString('he-IL');
        toast.success(`${t('admin.dash.payment_received')}: ${data.orderNumber} — ₪${fmt(data.total)}`);
        scheduleRefresh();
    }, [toast, scheduleRefresh, t]);

    const onInventoryLowStock = useCallback((data) => {
        if (data.severity === 'critical') {
            toast.error(`${t('admin.dash.zero_stock')}: ${data.productName} (${data.sku})`);
        }
    }, [toast, t]);

    const onScanComplete = useCallback((data) => {
        if (data.created > 0 || data.outOfStockCount > 0) {
            toast.info(
                `${t('admin.dash.scan_complete')} — ${data.outOfStockCount} ${t('admin.dash.scan_out')}, ` +
                `${data.lowStockCount} ${t('admin.dash.scan_low')}, ${data.created} ${t('admin.dash.scan_alerts')}`
            );
            scheduleRefresh();
        }
    }, [toast, scheduleRefresh, t]);

    const { isConnected, unreadCount, clearUnread } = useAdminSocket({
        'order.created':           onOrderCreated,
        'order.status_changed':    onOrderStatusChanged,
        'order.cancelled':         onOrderCancelled,
        'payment.paid':            onPaymentPaid,
        'payment.refunded':        onPaymentRefunded,
        'alert.created':           onAlertCreated,
        'inventory.low_stock':     onInventoryLowStock,
        'inventory.scan_complete': onScanComplete,
    });

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[400px]" dir="rtl">
                <p className="text-muted-foreground text-sm">{t('admin.dash.loading')}</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[400px]" dir="rtl">
                <p className="text-[#ef4444] text-sm">{error}</p>
            </div>
        );
    }

    const openOrders = (dashboard?.orders?.pending ?? 0) + (dashboard?.orders?.inProgress ?? 0);

    return (
        <div className="p-8 space-y-5" dir="rtl">

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span
                        className={`w-2 h-2 rounded-full inline-block ${isConnected ? 'bg-[#10b981]' : 'bg-[#6b7280]'}`}
                        title={isConnected ? t('admin.dash.connected') : t('admin.dash.disconnected')}
                    />
                    <span className="text-xs text-muted-foreground">
                        {isConnected ? t('admin.dash.realtime') : t('admin.dash.disconnected')}
                    </span>
                </div>

                {unreadCount > 0 && (
                    <button
                        type="button"
                        onClick={clearUnread}
                        className="flex items-center gap-1.5 text-xs bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/20 px-3 py-1 rounded-full hover:bg-[#2563eb]/20 transition-colors"
                    >
                        <span className="font-medium">{unreadCount}</span>
                        <span>{t('admin.dash.new_updates')}</span>
                        <span>✕</span>
                    </button>
                )}
            </div>

            <QuickSummary
                todayRevenue={dashboard?.revenue?.todayPaid ?? 0}
                monthRevenue={dashboard?.revenue?.thisMonthPaid ?? 0}
                openOrders={openOrders}
                newCustomers={dashboard?.users?.new30d ?? 0}
                aov={dashboard?.revenue?.aov ?? null}
                cancellationRate={dashboard?.orders?.cancellationRate ?? null}
            />

            <QuickActions
                pendingCount={pendingCount}
                alertCount={alerts.length}
                unreadCount={unreadCount}
                isConnected={isConnected}
            />

            <PendingTasks
                recentOrders={dashboard?.recentOrders ?? []}
                pendingCount={pendingCount}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 space-y-5">
                    <SalesChart />
                    <PerformanceGoals
                        dashboard={dashboard}
                        ordersThisMonth={ordersThisMonth}
                    />
                </div>

                <div className="space-y-5">
                    <AlertsPanel alerts={alerts} />
                    <TopProducts products={topProducts} />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2">
                    <LiveActivityFeed activities={activities} />
                </div>

                <div className="space-y-5">
                    <SmartInsightsPanel />
                    <BusinessInsights insights={anomalies} />
                </div>
            </div>
        </div>
    );
}
