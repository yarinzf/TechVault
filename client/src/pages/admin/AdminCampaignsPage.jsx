import { useState, useEffect, useRef } from 'react';
import {
    Tag,
    Plus,
    Edit,
    Trash2,
    TrendingUp,
    Package,
    DollarSign,
    Percent,
    Calendar,
    BarChart3,
    TrendingDown,
    Minus,
    Wallet,
    Target,
    ShoppingCart,
    Play,
    Pause,
    X,
    AlertCircle,
    CheckCircle,
    Save,
    Send,
    ArrowUpRight,
    ChevronUp,
    ChevronDown,
    Check,
    Search,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { adminService } from '../../features/admin/api/admin.service';
import { useTranslation, useLanguage } from '../../context/LanguageContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLACEMENT_NONE        = 'none';
const PLACEMENT_WEEKLY_DEAL = 'homepage_weekly_deal';

const ERROR_CODE_KEYS = {
    WEEKLY_DEAL_NO_PRODUCT:           'admin.campaigns.err_WEEKLY_DEAL_NO_PRODUCT',
    WEEKLY_DEAL_MULTIPLE_PRODUCTS:    'admin.campaigns.err_WEEKLY_DEAL_MULTIPLE_PRODUCTS',
    WEEKLY_DEAL_PRODUCT_NOT_FOUND:    'admin.campaigns.err_WEEKLY_DEAL_PRODUCT_NOT_FOUND',
    WEEKLY_DEAL_PRODUCT_DELETED:      'admin.campaigns.err_WEEKLY_DEAL_PRODUCT_DELETED',
    WEEKLY_DEAL_PRODUCT_UNPUBLISHED:  'admin.campaigns.err_WEEKLY_DEAL_PRODUCT_UNPUBLISHED',
    WEEKLY_DEAL_PRODUCT_OUT_OF_STOCK: 'admin.campaigns.err_WEEKLY_DEAL_PRODUCT_OUT_OF_STOCK',
    WEEKLY_DEAL_OVERLAP:              'admin.campaigns.err_WEEKLY_DEAL_OVERLAP',
};

// Maps a thrown request error to a stable, translated Admin message. Prefers
// the backend's stable error `code` (set by server/middleware fetch wrapper)
// over matching the English message string, since messages can change wording
// without notice while codes are a deliberate API contract.
const mapBackendError = (err, t) => {
    const key = ERROR_CODE_KEYS[err?.code];
    if (key) return t(key);
    if (err?.message) return err.message;
    return t('admin.campaigns.err_save');
};

// A product is Weekly-Deal-eligible only if in stock, published, and not
// deleted. In practice the Admin product picker sources from the public
// product list endpoint, which already excludes unpublished/deleted products
// server-side — so only the stock check is currently reachable here. The
// isPublished/isDeleted checks are kept as a defensive guarantee in case that
// upstream filtering ever changes.
const isProductEligibleForWeeklyDeal = (p) => {
    if (p?.isDeleted)          return { eligible: false, reasonKey: 'admin.campaigns.product_deleted' };
    if (p?.isPublished === false) return { eligible: false, reasonKey: 'admin.campaigns.product_unpublished' };
    if (!(p?.stock > 0))       return { eligible: false, reasonKey: 'admin.campaigns.product_out_of_stock' };
    return { eligible: true, reasonKey: null };
};

const parseMoney = (value) => {
    const amount = Number.parseFloat(String(value).replace(/[₪,]/g, ''));
    return Number.isNaN(amount) ? 0 : amount;
};

const formatMoney = (value) => `₪${Number(value).toLocaleString()}`;

// Local-timezone display (day/month/year) — avoids the UTC drift that
// toISOString()-based slicing could introduce for users outside UTC.
const formatDisplayDate = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// `datetime-local` inputs need `YYYY-MM-DDTHH:mm` in the browser's own local
// time — this reads the stored ISO value back into that local representation.
const toDateTimeLocal = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// `datetime-local` values have no timezone offset — the JS Date constructor
// already interprets them as local time, so this round-trips without drift.
const fromDateTimeLocalToIso = (value) => {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};

// `disabled` (manually turned off) is distinct from `ended` (dates elapsed
// naturally while still enabled) — a campaign can be disabled regardless of
// where its date range currently sits, so this check comes first.
const deriveCampaignStatus = (c) => {
    const now = new Date();
    if (!c.isActive) return 'disabled';
    if (new Date(c.startDate) > now) return 'scheduled';
    if (new Date(c.endDate) < now) return 'ended';
    return 'active';
};

const normalizeCampaign = (c) => ({
    _id:            c._id,
    id:             c._id,
    name:           c.name,
    discount:       c.discountPercent,
    startDate:      c.startDate,
    endDate:        c.endDate,
    placement:      c.placement ?? PLACEMENT_NONE,
    isActive:       c.isActive,
    status:         deriveCampaignStatus(c),
    revenue:        '₪0',
    revenueTarget:  '₪0',
    budget:         '₪0',
    spent:          '₪0',
    ordersCount:    0,
    totalProducts:  c.products?.length ?? 0,
    productStats:   { growing: 0, stable: 0, declining: 0 },
    products:       c.products ?? [],
});

const chartData = [
    { day: '10/04', revenue: 12400, orders: 28 },
    { day: '11/04', revenue: 15800, orders: 35 },
    { day: '12/04', revenue: 18200, orders: 42 },
    { day: '13/04', revenue: 14600, orders: 31 },
    { day: '14/04', revenue: 21300, orders: 48 },
    { day: '15/04', revenue: 19800, orders: 44 },
    { day: '16/04', revenue: 17500, orders: 38 },
    { day: '17/04', revenue: 22100, orders: 51 },
    { day: '18/04', revenue: 19400, orders: 43 },
    { day: '19/04', revenue: 16300, orders: 36 },
    { day: '20/04', revenue: 10000, orders: 22 },
];

const getBudgetPercent = (campaign) => {
    const budget = parseMoney(campaign.budget);
    if (!budget) return 0;
    return Math.min((parseMoney(campaign.spent) / budget) * 100, 100);
};

const getRemainingBudget = (campaign) => parseMoney(campaign.budget) - parseMoney(campaign.spent);

const getProductPercent = (campaign, key) => {
    if (!campaign.totalProducts) return 0;
    return (campaign.productStats[key] / campaign.totalProducts) * 100;
};

const getStatusColor = (status) => {
    switch (status) {
        case 'active':    return 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20';
        case 'scheduled': return 'bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20';
        case 'ended':     return 'bg-[#8b8b99]/10 text-[#8b8b99] border-[#8b8b99]/20';
        case 'disabled':  return 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20';
        default:          return 'bg-secondary text-muted-foreground border-border';
    }
};

const getStatusText = (status, t) => {
    switch (status) {
        case 'active':    return t('admin.campaigns.status_active');
        case 'scheduled': return t('admin.campaigns.status_scheduled');
        case 'ended':     return t('admin.campaigns.status_ended');
        case 'disabled':  return t('admin.campaigns.status_disabled');
        default:          return status;
    }
};

// Placement is a separate signal from campaign status (active/scheduled/
// ended) — a Weekly Deal can be scheduled, active, or disabled just like any
// standard campaign, so this badge never overrides or duplicates status text.
const getPlacementBadgeColor = (placement) =>
    placement === PLACEMENT_WEEKLY_DEAL
        ? 'bg-[#7c3aed]/10 text-[#7c3aed] border-[#7c3aed]/20'
        : 'bg-secondary text-muted-foreground border-border';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminCampaignsPage() {
    const t = useTranslation();
    const { language } = useLanguage();
    const dir = language === 'he' ? 'rtl' : 'ltr';
    const [campaigns,   setCampaigns]   = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [activeModal, setActiveModal] = useState(null);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [pendingId,   setPendingId]   = useState(null);
    const [budgetRequestSent, setBudgetRequestSent] = useState(false);

    useEffect(() => {
        adminService.listCampaigns()
            .then((list) => setCampaigns(list.map(normalizeCampaign)))
            .finally(() => setLoading(false));
    }, []);

    const activeCampaigns = campaigns.filter((c) => c.status === 'active').length;
    const totalRevenue    = campaigns.reduce((s, c) => s + parseMoney(c.revenue), 0);
    const totalBudget     = campaigns.reduce((s, c) => s + parseMoney(c.budget), 0);
    const totalSpent      = campaigns.reduce((s, c) => s + parseMoney(c.spent), 0);
    const totalOrders     = campaigns.reduce((s, c) => s + c.ordersCount, 0);

    const openModal = (modal, campaign) => {
        setSelectedCampaign(campaign);
        setActiveModal(modal);
        setBudgetRequestSent(false);
    };

    const closeModal = () => {
        setActiveModal(null);
        setSelectedCampaign(null);
        setBudgetRequestSent(false);
    };

    const handleToggle = async (campaign) => {
        setPendingId(campaign._id);
        try {
            const updated = await adminService.updateCampaign(campaign._id, { isActive: !campaign.isActive });
            setCampaigns((prev) => prev.map((c) => c._id === campaign._id ? normalizeCampaign(updated) : c));
        } finally {
            setPendingId(null);
        }
    };

    const handleDelete = async (campaign) => {
        if (!window.confirm(`${t('admin.campaigns.confirm_delete')} "${campaign.name}"?`)) return;
        setPendingId(campaign._id);
        try {
            await adminService.deleteCampaign(campaign._id);
            setCampaigns((prev) => prev.filter((c) => c._id !== campaign._id));
        } finally {
            setPendingId(null);
        }
    };

    const handleCreate = async (dto) => {
        const created = await adminService.createCampaign(dto);
        setCampaigns((prev) => [normalizeCampaign(created), ...prev]);
        closeModal();
    };

    const handleSave = async (dto) => {
        const updated = await adminService.updateCampaign(selectedCampaign._id, dto);
        setCampaigns((prev) => prev.map((c) => c._id === selectedCampaign._id ? normalizeCampaign(updated) : c));
        closeModal();
    };

    return (
        <div className="p-8" dir={dir}>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl text-foreground mb-2">{t('admin.campaigns.heading')}</h1>
                    <p className="text-muted-foreground">
                        {t('admin.campaigns.subtitle')} • {campaigns.length} {t('admin.campaigns.heading')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => openModal('create', null)}
                    className="flex items-center gap-2 bg-[#2563eb] text-white px-4 py-2 rounded-lg hover:bg-[#2563eb]/90 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    {t('admin.campaigns.new')}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <StatBox icon={Tag}          label={t('admin.campaigns.stat_active')}  value={activeCampaigns}          color="#10b981" />
                <StatBox icon={DollarSign}   label={t('admin.campaigns.stat_revenue')} value={formatMoney(totalRevenue)} color="#2563eb" />
                <StatBox icon={Wallet}       label={t('admin.campaigns.stat_budget')}  value={formatMoney(totalSpent)} sub={`/ ${formatMoney(totalBudget)}`} color="#7c3aed" />
                <StatBox icon={ShoppingCart} label={t('admin.campaigns.stat_orders')}  value={totalOrders.toLocaleString()} color="#fbbf24" />
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin" />
                </div>
            ) : campaigns.length === 0 ? (
                <div className="text-center py-20">
                    <Tag className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-foreground mb-1">{t('admin.campaigns.empty')}</p>
                    <p className="text-sm text-muted-foreground">{t('admin.campaigns.empty_hint')}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {campaigns.map((campaign) => (
                        <CampaignCard
                            key={campaign._id}
                            campaign={campaign}
                            openModal={openModal}
                            onToggle={handleToggle}
                            onDelete={handleDelete}
                            isPending={pendingId === campaign._id}
                        />
                    ))}
                </div>
            )}

            {activeModal === 'create' && (
                <CreateEditModal
                    campaign={null}
                    onSave={handleCreate}
                    closeModal={closeModal}
                />
            )}

            {activeModal === 'edit' && selectedCampaign && (
                <CreateEditModal
                    campaign={selectedCampaign}
                    onSave={handleSave}
                    closeModal={closeModal}
                />
            )}

            {activeModal === 'analytics' && selectedCampaign && (
                <AnalyticsModal campaign={selectedCampaign} closeModal={closeModal} openModal={openModal} />
            )}

            {activeModal === 'products' && selectedCampaign && (
                <ProductsModal campaign={selectedCampaign} closeModal={closeModal} />
            )}

            {activeModal === 'add-budget' && selectedCampaign && (
                <AddBudgetModal
                    campaign={selectedCampaign}
                    closeModal={closeModal}
                    budgetRequestSent={budgetRequestSent}
                    setBudgetRequestSent={setBudgetRequestSent}
                />
            )}
        </div>
    );
}

// ─── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({ icon: Icon, label, value, sub, color }) {
    return (
        <div className="bg-gradient-to-br border rounded-lg p-5" style={{ borderColor: `${color}33`, background: `linear-gradient(135deg, ${color}1a, transparent)` }}>
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}1a` }}>
                    <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <p className="text-muted-foreground text-sm">{label}</p>
            </div>
            <div className="flex items-baseline gap-2">
                <p className="text-3xl" style={{ color }}>{value}</p>
                {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
            </div>
        </div>
    );
}

// ─── Campaign card ────────────────────────────────────────────────────────────

function CampaignCard({ campaign, openModal, onToggle, onDelete, isPending }) {
    const t = useTranslation();
    return (
        <div className="bg-card border border-border rounded-lg p-6 hover:border-[#2563eb]/30 transition-all">
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-lg text-foreground">{campaign.name}</h3>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${getStatusColor(campaign.status)}`}>
                            {getStatusText(campaign.status, t)}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${getPlacementBadgeColor(campaign.placement)}`}>
                            {campaign.placement === PLACEMENT_WEEKLY_DEAL ? t('admin.campaigns.badge_weekly_deal') : t('admin.campaigns.badge_standard')}
                        </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="font-mono text-xs">{campaign._id?.slice(-6)}</span>
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDisplayDate(campaign.startDate)} - {formatDisplayDate(campaign.endDate)}
                        </span>
                    </div>
                </div>

                <div className="flex gap-1.5">
                    <IconButton title={t('admin.campaigns.edit_title')} onClick={() => openModal('edit', campaign)} icon={Edit} disabled={isPending} />
                    <IconButton
                        title={campaign.isActive ? t('admin.campaigns.pause') : t('admin.campaigns.resume')}
                        icon={campaign.isActive ? Pause : Play}
                        color={campaign.isActive ? '#fbbf24' : '#10b981'}
                        onClick={() => onToggle(campaign)}
                        disabled={isPending}
                    />
                    <IconButton title={t('admin.campaigns.delete')} icon={Trash2} color="#ef4444" onClick={() => onDelete(campaign)} disabled={isPending} />
                </div>
            </div>

            <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-1">{t('admin.campaigns.revenue_label')}</p>
                <p className="text-2xl text-foreground">{campaign.revenue}</p>
            </div>

            <div className="flex items-center gap-4 mb-4 text-xs flex-wrap">
                <CompactMetric icon={Target}       label={t('admin.campaigns.target')} value={campaign.revenueTarget}             color="#2563eb" />
                <CompactMetric icon={ShoppingCart} label={t('admin.campaigns.orders')} value={campaign.ordersCount.toLocaleString()} color="#10b981" />
                <CompactMetric icon={Percent}      label={t('admin.campaigns.discount')} value={`${campaign.discount}%`}           color="#fbbf24" />
                <CompactMetric icon={Package}      label={t('admin.campaigns.products')} value={campaign.totalProducts}             color="#7c3aed" />
            </div>

            <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <p className="text-xs text-muted-foreground mb-0.5">{t('admin.campaigns.budget')}</p>
                        <p className="text-lg text-foreground font-medium">{campaign.budget}</p>
                    </div>
                    <button type="button" onClick={() => openModal('add-budget', campaign)} className="flex items-center gap-1 text-xs text-[#2563eb] hover:text-[#2563eb]/80 transition-colors">
                        <Plus className="w-3 h-3" />
                        <span>{t('admin.campaigns.add_budget')}</span>
                    </button>
                </div>

                <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-muted-foreground">{t('admin.campaigns.spent')} {campaign.spent}</span>
                </div>

                <ProgressBar value={getBudgetPercent(campaign)} />

                <div className="flex items-center justify-between text-xs">
                    <span className="text-[#10b981]">{t('admin.campaigns.remaining')} {formatMoney(getRemainingBudget(campaign))}</span>
                    <span className="text-muted-foreground">{campaign.status !== 'scheduled' ? Math.round(getBudgetPercent(campaign)) : 0}% {t('admin.campaigns.utilized')}</span>
                </div>
            </div>

            <div className="flex items-center gap-3 mb-4 text-xs bg-secondary/20 rounded-lg p-3">
                <span className="text-muted-foreground">{campaign.totalProducts} {t('admin.campaigns.products')}</span>
                <TrendCount icon={TrendingUp}   value={campaign.productStats.growing}   color="#10b981" />
                <TrendCount icon={Minus}        value={campaign.productStats.stable}    color="#fbbf24" />
                <TrendCount icon={TrendingDown} value={campaign.productStats.declining} color="#ef4444" />
            </div>

            <div className="flex gap-2 pt-3 border-t border-border">
                <button type="button" onClick={() => openModal('analytics', campaign)} className="flex-1 flex items-center justify-center gap-1.5 bg-[#2563eb] text-white px-2.5 py-1.5 rounded-md hover:bg-[#2563eb]/90 transition-colors text-xs font-medium">
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>{t('admin.campaigns.analytics_btn')}</span>
                </button>
                <button type="button" onClick={() => openModal('products', campaign)} className="flex-1 flex items-center justify-center gap-1.5 bg-secondary border border-border text-foreground px-2.5 py-1.5 rounded-md hover:bg-secondary/70 transition-colors text-xs">
                    <Package className="w-3.5 h-3.5" />
                    <span>{campaign.totalProducts} {t('admin.campaigns.products_btn')}</span>
                </button>
            </div>
        </div>
    );
}

// ─── Create / Edit modal ──────────────────────────────────────────────────────

function CreateEditModal({ campaign, onSave, closeModal }) {
    const t = useTranslation();
    const isCreate = campaign == null;
    const [form, setForm] = useState({
        name:            campaign?.name     ?? '',
        discountPercent: campaign?.discount ?? '',
        startDate:       toDateTimeLocal(campaign?.startDate),
        endDate:         toDateTimeLocal(campaign?.endDate),
        placement:       campaign?.placement ?? PLACEMENT_NONE,
    });
    const [selectedProducts, setSelectedProducts] = useState(campaign?.products ?? []);
    const [searchResults, setSearchResults] = useState([]);
    const [productSearch, setProductSearch] = useState('');
    // 'idle' only before the very first request resolves; every subsequent
    // state is 'loading' | 'success' | 'empty' | 'error'.
    const [searchState, setSearchState] = useState('idle');
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');
    const [notice, setNotice] = useState('');
    const abortRef = useRef(null);

    const isWeeklyDeal = form.placement === PLACEMENT_WEEKLY_DEAL;

    // Server-side search (name or SKU) against the full catalog via the
    // existing Admin inventory endpoint — reused as-is, no backend change.
    // Debounced ~300ms, and any in-flight request is aborted the moment a
    // newer query is issued so a slow, stale response can never overwrite
    // the results of a query the Admin already moved past.
    useEffect(() => {
        const handle = setTimeout(() => {
            if (abortRef.current) abortRef.current.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            setSearchState('loading');
            adminService.searchProducts({ search: productSearch, limit: 20 }, controller.signal)
                .then(({ products }) => {
                    setSearchResults(products.filter((p) => /^[0-9a-fA-F]{24}$/.test(p._id)));
                    setSearchState(products.length === 0 ? 'empty' : 'success');
                })
                .catch((err) => {
                    if (err?.name === 'AbortError') return; // superseded by a newer query — ignore silently
                    setSearchState('error');
                });
        }, 300);
        return () => clearTimeout(handle);
    }, [productSearch]);

    const handle = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

    const handlePlacementChange = (value) => {
        setNotice('');
        if (value === PLACEMENT_WEEKLY_DEAL && selectedProducts.length > 1) {
            setSelectedProducts((prev) => prev.slice(0, 1));
            setNotice(t('admin.campaigns.weekly_deal_replaced_notice'));
        }
        setForm((f) => ({ ...f, placement: value }));
    };

    // Standard campaigns: normal multi-select toggle. Weekly Deal: selecting a
    // product always replaces any previous selection (single-product rule),
    // and ineligible products (out of stock/unpublished/deleted) can't be
    // selected at all — the button is disabled before this ever runs.
    const toggleProduct = (p) => {
        if (isWeeklyDeal && !isProductEligibleForWeeklyDeal(p).eligible) return;

        setSelectedProducts((prev) => {
            const exists = prev.some((s) => s._id === p._id);
            if (exists) return prev.filter((s) => s._id !== p._id);
            const next = { _id: p._id, name: p.name, sku: p.sku, price: p.price, stock: p.stock };
            return isWeeklyDeal ? [next] : [...prev, next];
        });
    };

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (!form.name.trim())                return setError(t('admin.campaigns.err_name'));
        if (!form.discountPercent)            return setError(t('admin.campaigns.err_discount'));
        if (!form.startDate || !form.endDate) return setError(t('admin.campaigns.err_dates'));
        if (form.endDate <= form.startDate)   return setError(t('admin.campaigns.err_date_order'));
        if (isWeeklyDeal && selectedProducts.length === 0) return setError(t('admin.campaigns.err_weekly_deal_no_product'));

        setSaving(true);
        try {
            await onSave({
                name:            form.name.trim(),
                discountPercent: Number(form.discountPercent),
                startDate:       fromDateTimeLocalToIso(form.startDate),
                endDate:         fromDateTimeLocalToIso(form.endDate),
                products:        selectedProducts.map((p) => p._id),
                placement:       form.placement,
            });
        } catch (err) {
            setError(mapBackendError(err, t));
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell closeModal={closeModal} maxWidth="max-w-lg">
            <div className="relative p-6 pb-4">
                <button type="button" onClick={closeModal} className="absolute top-4 start-4 p-2 hover:bg-secondary/50 rounded-lg transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                </button>
                <div className="text-center">
                    <h2 className="text-xl text-foreground mb-1">{isCreate ? t('admin.campaigns.modal_create') : t('admin.campaigns.modal_edit')}</h2>
                    {!isCreate && <p className="text-sm text-muted-foreground">{campaign.name}</p>}
                </div>
            </div>

            <form onSubmit={submit} className="px-6 pb-6 overflow-y-auto max-h-[calc(90vh-140px)] scrollbar-thin">
                <div className="space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2 text-sm text-[#ef4444]" role="alert">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <ControlledInput label={t('admin.campaigns.name_label')} value={form.name} onChange={handle('name')} placeholder={t('admin.campaigns.name_ph')} required />
                    <ControlledInput label={t('admin.campaigns.discount_label')} type="number" min="1" max="90" value={form.discountPercent} onChange={handle('discountPercent')} placeholder="1-90" required icon={Percent} />
                    <div className="grid grid-cols-2 gap-3">
                        <ControlledInput label={t('admin.campaigns.start_date')} type="datetime-local" value={form.startDate} onChange={handle('startDate')} required small />
                        <ControlledInput label={t('admin.campaigns.end_date')}   type="datetime-local" value={form.endDate}   onChange={handle('endDate')}   required small />
                    </div>

                    {/* Placement selector */}
                    <div>
                        <label className="block text-xs text-muted-foreground mb-2" id="campaign-placement-label">
                            {t('admin.campaigns.placement_label')}
                        </label>
                        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="campaign-placement-label">
                            <button
                                type="button"
                                role="radio"
                                aria-checked={!isWeeklyDeal}
                                onClick={() => handlePlacementChange(PLACEMENT_NONE)}
                                className={`px-3 py-2.5 rounded-lg border text-sm transition-colors ${!isWeeklyDeal ? 'bg-[#2563eb]/10 border-[#2563eb] text-[#2563eb]' : 'border-border text-foreground hover:bg-secondary/50'}`}
                            >
                                {t('admin.campaigns.placement_none')}
                            </button>
                            <button
                                type="button"
                                role="radio"
                                aria-checked={isWeeklyDeal}
                                onClick={() => handlePlacementChange(PLACEMENT_WEEKLY_DEAL)}
                                className={`px-3 py-2.5 rounded-lg border text-sm transition-colors ${isWeeklyDeal ? 'bg-[#2563eb]/10 border-[#2563eb] text-[#2563eb]' : 'border-border text-foreground hover:bg-secondary/50'}`}
                            >
                                {t('admin.campaigns.placement_weekly_deal')}
                            </button>
                        </div>
                        {notice && <p className="text-xs text-[#fbbf24] mt-2">{notice}</p>}
                        {isWeeklyDeal && <p className="text-xs text-muted-foreground mt-2">{t('admin.campaigns.weekly_deal_one_product_hint')}</p>}
                    </div>

                    {/* Product picker */}
                    <div>
                        <p className="text-xs text-muted-foreground mb-2">
                            {t('admin.campaigns.products_label')}
                            {selectedProducts.length > 0 && (
                                <span className="mr-1 text-[#2563eb]">({selectedProducts.length} {t('admin.campaigns.selected')})</span>
                            )}
                        </p>

                        {/* Selected chips */}
                        {selectedProducts.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {selectedProducts.map((p) => (
                                    <span key={p._id} className="inline-flex items-center gap-1 bg-[#2563eb]/10 text-[#2563eb] text-xs px-2 py-1 rounded-full border border-[#2563eb]/20">
                                        {p.name}
                                        <button type="button" onClick={() => toggleProduct(p)} className="hover:text-[#ef4444] transition-colors leading-none">×</button>
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Search */}
                        <div className="relative mb-1">
                            <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                placeholder={t('admin.campaigns.search_prod')}
                                aria-label={t('admin.campaigns.search_label')}
                                className="w-full bg-input-background border border-border rounded-lg ps-3 pe-9 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#2563eb] focus:outline-none transition-colors"
                            />
                        </div>
                        {!productSearch && (
                            <p className="text-xs text-muted-foreground mb-1">{t('admin.campaigns.search_type_hint')}</p>
                        )}

                        {/* Product list */}
                        <div className="max-h-44 overflow-y-auto border border-border rounded-lg divide-y divide-border/50">
                            {searchState === 'loading' || searchState === 'idle' ? (
                                <p className="text-xs text-muted-foreground text-center py-4">{t('admin.campaigns.searching')}</p>
                            ) : searchState === 'error' ? (
                                <p className="text-xs text-[#ef4444] text-center py-4" role="alert">{t('admin.campaigns.search_failed')}</p>
                            ) : searchState === 'empty' ? (
                                <p className="text-xs text-muted-foreground text-center py-4">{t('admin.campaigns.search_no_match')}</p>
                            ) : searchResults.map((p) => {
                                const isSelected = selectedProducts.some((s) => s._id === p._id);
                                const eligibility = isWeeklyDeal ? isProductEligibleForWeeklyDeal(p) : { eligible: true, reasonKey: null };
                                const isDisabled = isWeeklyDeal && !eligibility.eligible;
                                return (
                                    <button
                                        key={p._id}
                                        type="button"
                                        onClick={() => toggleProduct(p)}
                                        disabled={isDisabled}
                                        aria-disabled={isDisabled}
                                        aria-pressed={isSelected}
                                        className={`w-full text-start px-3 py-2 transition-colors flex items-center justify-between gap-2 ${isDisabled ? 'opacity-40 cursor-not-allowed' : isSelected ? 'bg-[#2563eb]/10' : 'hover:bg-secondary/50'}`}
                                    >
                                        <div className="min-w-0">
                                            <p className={`text-sm truncate ${isSelected ? 'text-[#2563eb]' : 'text-foreground'}`}>{p.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {p.sku} · ₪{p.price?.toLocaleString()} · {t('admin.campaigns.stock_label')}: {p.stock ?? '—'}
                                            </p>
                                            {isDisabled && (
                                                <p className="text-xs text-[#ef4444]">{t(eligibility.reasonKey)}</p>
                                            )}
                                        </div>
                                        {isSelected && <Check className="w-4 h-4 text-[#2563eb] flex-shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-[#2563eb] text-white py-3.5 rounded-xl font-medium hover:bg-[#2563eb]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? t('admin.campaigns.saving') : isCreate ? t('admin.campaigns.create_btn') : t('admin.campaigns.save_btn')}
                    </button>
                </div>
            </form>
        </ModalShell>
    );
}

function ControlledInput({ label, value, onChange, type = 'text', placeholder, required, icon: Icon, small, min, max }) {
    return (
        <div>
            <label className="block text-xs text-muted-foreground mb-2">{label}</label>
            <div className="relative">
                <input
                    type={type}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    required={required}
                    min={min}
                    max={max}
                    className={`w-full bg-input-background border border-border rounded-lg ${small ? 'px-3 text-sm' : 'px-4'} py-2.5 text-foreground focus:border-[#2563eb] focus:outline-none transition-colors`}
                />
                {Icon && <Icon className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />}
            </div>
        </div>
    );
}

// ─── Shared modal primitives ──────────────────────────────────────────────────

function IconButton({ icon: Icon, title, onClick, color = '#8b8b99', disabled }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} className="p-2 hover:bg-secondary rounded-lg transition-colors disabled:opacity-40" title={title}>
            <Icon className="w-3.5 h-3.5" style={{ color }} />
        </button>
    );
}

function CompactMetric({ icon: Icon, label, value, color }) {
    return (
        <div className="flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5" style={{ color }} />
            <span className="text-muted-foreground">{label}</span>
            <span className="text-foreground font-medium">{value}</span>
        </div>
    );
}

function TrendCount({ icon: Icon, value, color }) {
    return (
        <div className="flex items-center gap-1.5">
            <Icon className="w-3 h-3" style={{ color }} />
            <span className="font-medium" style={{ color }}>{value}</span>
        </div>
    );
}

function ProgressBar({ value }) {
    return (
        <div className="w-full bg-secondary rounded-full h-2.5 mb-2">
            <div
                className="h-2.5 rounded-full transition-all"
                style={{ width: `${Math.min(value, 100)}%`, background: 'linear-gradient(90deg, #2563eb 0%, #7c3aed 100%)' }}
            />
        </div>
    );
}

function ModalShell({ children, closeModal, maxWidth = 'max-w-5xl' }) {
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeModal}>
            <div className={`bg-[#0f0f16] border border-[#2563eb]/30 rounded-2xl w-full ${maxWidth} max-h-[90vh] overflow-hidden shadow-2xl`} onClick={(e) => e.stopPropagation()}>
                {children}
            </div>
        </div>
    );
}

function ModalHeader({ title, subtitle, closeModal }) {
    return (
        <div className="relative p-6 border-b border-border/50">
            <button type="button" onClick={closeModal} className="absolute top-4 left-4 p-2 hover:bg-secondary/50 rounded-lg transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
            </button>
            <div className="text-center">
                <h2 className="text-xl text-foreground mb-1">{title}</h2>
                {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
        </div>
    );
}

// ─── Analytics modal ──────────────────────────────────────────────────────────

function AnalyticsModal({ campaign, closeModal, openModal }) {
    const budgetPercent  = getBudgetPercent(campaign);
    const averageOrder   = campaign.ordersCount > 0 ? Math.round(parseMoney(campaign.revenue) / campaign.ordersCount) : 0;

    return (
        <ModalShell closeModal={closeModal}>
            <ModalHeader title="ניתוח ביצועים מפורט" subtitle={`${campaign.name}`} closeModal={closeModal} />

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] scrollbar-thin">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <MetricCard label="הכנסה כוללת"  value={campaign.revenue}                   color="#2563eb" footer={`מתוך ${campaign.revenueTarget}`} icon={Target} />
                    <MetricCard label="הזמנות"        value={campaign.ordersCount.toLocaleString()} color="#10b981" footer="+12% מהשבוע שעבר"              icon={TrendingUp} />
                    <MetricCard label="ממוצע הזמנה"   value={formatMoney(averageOrder)}          color="#7c3aed" footer="לכל הזמנה"                        icon={DollarSign} />
                    <MetricCard label="שיעור המרה"    value="3.8%"                               color="#fbbf24" footer="+0.4%"                             icon={TrendingUp} />
                </div>

                {parseMoney(campaign.spent) > parseMoney(campaign.budget) * 0.85 && (
                    <div className="bg-gradient-to-br from-[#ff6b35]/10 to-transparent border border-[#ff6b35]/30 rounded-xl p-4 mb-6">
                        <div className="flex items-start gap-3 mb-3">
                            <AlertCircle className="w-5 h-5 text-[#ff6b35] mt-0.5" />
                            <div>
                                <p className="text-sm text-foreground font-medium mb-1">התקציב עומד להיגמר!</p>
                                <p className="text-xs text-muted-foreground">
                                    נוצלו {Math.round(budgetPercent)}% מהתקציב. נותרו {formatMoney(getRemainingBudget(campaign))}
                                </p>
                            </div>
                        </div>
                        <button type="button" onClick={() => openModal('add-budget', campaign)} className="w-full bg-[#2563eb] text-white py-3 rounded-xl font-medium hover:bg-[#2563eb]/90 transition-colors flex items-center justify-center gap-2">
                            <Plus className="w-4 h-4" />
                            שלח בקשה להגדלת התקציב!
                        </button>
                    </div>
                )}

                <div className="bg-secondary/20 border border-border rounded-lg p-5 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base text-foreground">ביצועים לאורך זמן</h3>
                        <div className="text-left">
                            <p className="text-xs text-muted-foreground mb-0.5">הכנסה כוללת</p>
                            <p className="text-xl text-[#2563eb] font-medium">{campaign.revenue}</p>
                        </div>
                    </div>

                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="day" stroke="#8b8b99" style={{ fontSize: '11px', fill: '#8b8b99' }} />
                            <YAxis yAxisId="left" stroke="#8b8b99" style={{ fontSize: '11px', fill: '#8b8b99' }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                            <YAxis yAxisId="right" orientation="left" stroke="#8b8b99" style={{ fontSize: '11px', fill: '#8b8b99' }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 12px' }}
                                labelStyle={{ color: '#e5e5ea', fontSize: '12px', marginBottom: '4px' }}
                                itemStyle={{ color: '#e5e5ea', fontSize: '11px' }}
                                formatter={(value, name) => {
                                    if (name === 'revenue') return [`₪${value.toLocaleString()}`, 'הכנסה'];
                                    if (name === 'orders')  return [value, 'הזמנות'];
                                    return [value, name];
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} formatter={(v) => v === 'revenue' ? 'הכנסה' : v === 'orders' ? 'הזמנות' : v} />
                            <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} yAxisId="left" />
                            <Bar dataKey="orders"  fill="#10b981" radius={[4, 4, 0, 0]} yAxisId="right" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <ProductBreakdown campaign={campaign} />

                <div className="bg-secondary/20 border border-border rounded-lg p-5">
                    <h3 className="text-base text-foreground mb-4">ניתוח תקציב</h3>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <BudgetValue label="תקציב כולל"   value={campaign.budget} />
                        <BudgetValue label="הוצאו עד כה"  value={campaign.spent}  color="#7c3aed" />
                    </div>
                    <ProgressBar value={budgetPercent} />
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-[#10b981]">נותר: {formatMoney(getRemainingBudget(campaign))}</span>
                        <span className="text-muted-foreground">{Math.round(budgetPercent)}% נוצל</span>
                    </div>
                </div>
            </div>
        </ModalShell>
    );
}

function MetricCard({ label, value, color, footer, icon: Icon }) {
    return (
        <div className="bg-gradient-to-br to-transparent border rounded-lg p-4" style={{ borderColor: `${color}33`, background: `linear-gradient(135deg, ${color}1a, transparent)` }}>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl mb-1" style={{ color }}>{value}</p>
            <div className="flex items-center gap-1 text-xs">
                <Icon className="w-3 h-3" style={{ color }} />
                <span className="text-muted-foreground">{footer}</span>
            </div>
        </div>
    );
}

function ProductBreakdown({ campaign }) {
    return (
        <div className="bg-secondary/20 border border-border rounded-lg p-5 mb-6">
            <h3 className="text-base text-foreground mb-4">פילוח ביצועי מוצרים</h3>
            <div className="space-y-4">
                <BreakdownRow icon={TrendingUp}   label="מוצרים בצמיחה" value={campaign.productStats.growing}   percent={getProductPercent(campaign, 'growing')}   color="#10b981" />
                <BreakdownRow icon={Minus}        label="מוצרים יציבים" value={campaign.productStats.stable}    percent={getProductPercent(campaign, 'stable')}    color="#fbbf24" />
                <BreakdownRow icon={TrendingDown} label="מוצרים בירידה" value={campaign.productStats.declining} percent={getProductPercent(campaign, 'declining')} color="#ef4444" />
            </div>
        </div>
    );
}

function BreakdownRow({ icon: Icon, label, value, percent, color }) {
    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" style={{ color }} />
                    <span className="text-sm text-foreground">{label}</span>
                </div>
                <span className="text-sm font-medium" style={{ color }}>{value} מוצרים</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
                <div className="h-2 rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
            </div>
        </div>
    );
}

function BudgetValue({ label, value, color = '#e5e5ea' }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-xl" style={{ color }}>{value}</p>
        </div>
    );
}

// ─── Products modal ───────────────────────────────────────────────────────────

function ProductsModal({ campaign, closeModal }) {
    return (
        <ModalShell closeModal={closeModal} maxWidth="max-w-6xl">
            <ModalHeader title="מוצרים בקמפיין" subtitle={`${campaign.name} • ${campaign.totalProducts} מוצרים`} closeModal={closeModal} />

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] scrollbar-thin">
                {campaign.products.length > 0 ? (
                    <div>
                        <button type="button" className="w-full bg-[#2563eb] text-white py-3.5 rounded-xl font-medium hover:bg-[#2563eb]/90 transition-colors flex items-center justify-center gap-2 mb-6">
                            <Plus className="w-4 h-4" />
                            הוסף מוצרים לקמפיין
                        </button>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border">
                                        <TableHead>מוצר</TableHead>
                                        <TableHead>SKU</TableHead>
                                        <TableHead>מחיר</TableHead>
                                        <TableHead>הכנסה</TableHead>
                                        <TableHead>הזמנות</TableHead>
                                        <TableHead>מלאי</TableHead>
                                        <TableHead>מגמה</TableHead>
                                    </tr>
                                </thead>
                                <tbody>
                                    {campaign.products.map((product) => (
                                        <ProductRow key={product._id} product={product} discountPercent={campaign.discount} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-foreground mb-1">אין מוצרים בקמפיין זה</p>
                        <p className="text-sm text-muted-foreground">הוסף מוצרים לקמפיין כדי לראות אותם כאן</p>
                    </div>
                )}
            </div>
        </ModalShell>
    );
}

function TableHead({ children }) {
    return <th className="text-right py-3 px-4 text-xs text-muted-foreground font-medium">{children}</th>;
}

function ProductRow({ product, discountPercent }) {
    const discounted = product.price != null && discountPercent
        ? Math.round(product.price * (1 - discountPercent / 100) * 100) / 100
        : null;
    return (
        <tr className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
            <td className="py-3 px-4">
                <p className="text-sm text-foreground">{product.name}</p>
            </td>
            <td className="py-3 px-4 text-sm text-muted-foreground">{product.sku ?? '—'}</td>
            <td className="py-3 px-4">
                {discounted != null ? (
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm text-[#10b981] font-medium">₪{discounted.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground line-through">₪{product.price?.toLocaleString()}</span>
                    </div>
                ) : (
                    <span className="text-sm text-foreground font-medium">₪{product.price?.toLocaleString() ?? '—'}</span>
                )}
            </td>
            <td className="py-3 px-4 text-sm text-muted-foreground">—</td>
            <td className="py-3 px-4 text-sm text-muted-foreground">—</td>
            <td className="py-3 px-4 text-sm text-muted-foreground">—</td>
            <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                    <Minus className="w-4 h-4 text-[#fbbf24]" />
                    <span className="text-sm text-[#fbbf24]">—</span>
                </div>
            </td>
        </tr>
    );
}

// ─── Add budget modal ─────────────────────────────────────────────────────────

function AddBudgetModal({ campaign, closeModal, budgetRequestSent, setBudgetRequestSent }) {
    const nextBudget = parseMoney(campaign.budget) + 10000;

    return (
        <ModalShell closeModal={closeModal} maxWidth="max-w-lg">
            <div className="relative p-6 pb-4">
                <button type="button" onClick={closeModal} className="absolute top-4 left-4 p-2 hover:bg-secondary/50 rounded-lg transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                </button>
                <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-[#2563eb]/20 to-[#7c3aed]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ArrowUpRight className="w-8 h-8 text-[#2563eb]" />
                    </div>
                    <h2 className="text-2xl text-foreground mb-2">בקשת תוספת תקציב</h2>
                    <p className="text-sm text-muted-foreground">{campaign.name}</p>
                </div>
            </div>

            {!budgetRequestSent ? (
                <div className="px-6 pb-6 overflow-y-auto max-h-[calc(90vh-220px)] scrollbar-thin">
                    <div className="space-y-5">
                        <div className="bg-secondary/20 border border-border rounded-lg p-4">
                            <h3 className="text-sm text-foreground font-medium mb-3">מצב תקציב נוכחי</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <BudgetValue label="תקציב כולל" value={campaign.budget} />
                                <BudgetValue label="הוצאו"       value={campaign.spent}  color="#7c3aed" />
                            </div>
                            <div className="mt-3">
                                <ProgressBar value={getBudgetPercent(campaign)} />
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-[#10b981]">נותר: {formatMoney(getRemainingBudget(campaign))}</span>
                                    <span className="text-muted-foreground">{Math.round(getBudgetPercent(campaign))}% נוצל</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm text-foreground font-medium mb-2">סכום תוספת תקציב מבוקשת</label>
                            <div className="relative">
                                <input type="text" defaultValue="₪10,000" className="w-full bg-input-background border border-[#2563eb]/30 rounded-lg px-4 py-3 text-xl text-foreground font-medium focus:border-[#2563eb] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 transition-all" />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                                    <button type="button" className="p-0.5 hover:bg-secondary rounded transition-colors">
                                        <ChevronUp className="w-4 h-4 text-[#2563eb]" />
                                    </button>
                                    <button type="button" className="p-0.5 hover:bg-secondary rounded transition-colors">
                                        <ChevronDown className="w-4 h-4 text-[#2563eb]" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-[#10b981]/10 to-transparent border border-[#10b981]/20 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted-foreground">תקציב צפוי לאחר אישור</span>
                                <span className="text-2xl text-[#10b981] font-medium">{formatMoney(nextBudget)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-[#10b981]">
                                <ArrowUpRight className="w-3.5 h-3.5" />
                                <span>עלייה של {Math.round((10000 / (parseMoney(campaign.budget) || 1)) * 100)}%</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm text-foreground font-medium mb-2">סיבת הבקשה (אופציונלי)</label>
                            <textarea rows={3} placeholder="הסבר קצר מדוע דרוש תקציב נוסף..." className="w-full bg-input-background border border-border rounded-lg px-4 py-3 text-foreground focus:border-[#2563eb] focus:outline-none transition-colors resize-none" />
                        </div>

                        <div className="bg-[#3b82f6]/5 border border-[#3b82f6]/20 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-[#3b82f6] mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-foreground font-medium mb-1">שים לב</p>
                                    <p className="text-xs text-muted-foreground">הבקשה תישלח לקמפיינר לאישור. תקבל הודעה לאחר קבלת החלטה על הבקשה.</p>
                                </div>
                            </div>
                        </div>

                        <button type="button" onClick={() => setBudgetRequestSent(true)} className="w-full bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white py-4 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-[#2563eb]/20">
                            <Send className="w-5 h-5" />
                            שלח בקשה לקמפיינר
                        </button>
                    </div>
                </div>
            ) : (
                <div className="px-6 pb-6">
                    <div className="text-center py-8">
                        <div className="w-20 h-20 bg-gradient-to-br from-[#10b981]/20 to-[#10b981]/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                            <CheckCircle className="w-10 h-10 text-[#10b981]" />
                        </div>
                        <h3 className="text-xl text-foreground font-medium mb-2">הבקשה נשלחה בהצלחה!</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                            בקשת תוספת תקציב של ₪10,000 נשלחה לקמפיינר.
                            <br />
                            תקבל עדכון לאחר בדיקת הבקשה.
                        </p>
                        <button type="button" onClick={closeModal} className="w-full bg-[#2563eb] text-white py-3 rounded-xl font-medium hover:bg-[#2563eb]/90 transition-colors">
                            סגור
                        </button>
                    </div>
                </div>
            )}
        </ModalShell>
    );
}
