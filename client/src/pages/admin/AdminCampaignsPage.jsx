import { useState, useEffect, useRef } from 'react';
import {
    Tag,
    Plus,
    Edit,
    Trash2,
    Package,
    DollarSign,
    Percent,
    Calendar,
    BarChart3,
    ShoppingCart,
    Play,
    Pause,
    X,
    AlertCircle,
    Save,
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

const formatMoney = (value) => `₪${Number(value ?? 0).toLocaleString()}`;

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
    isClearance:    c.isClearance ?? false,
    isActive:       c.isActive,
    status:         deriveCampaignStatus(c),
    totalProducts:  c.products?.length ?? 0,
    products:       c.products ?? [],
});

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
    const [listError,   setListError]   = useState(null);
    const [activeModal, setActiveModal] = useState(null);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [pendingId,   setPendingId]   = useState(null);

    useEffect(() => {
        adminService.listCampaigns()
            .then((list) => setCampaigns(list.map(normalizeCampaign)))
            .catch((err) => setListError(err?.message ?? t('admin.campaigns.err_load')))
            .finally(() => setLoading(false));
    }, [t]);

    // Cheap, real, already-available-from-the-list values only — no
    // aggregate revenue/budget total here, since real revenue is only
    // knowable per-campaign via the on-demand analytics endpoint (see
    // AnalyticsModal), not from this lightweight list response.
    const activeCampaigns    = campaigns.filter((c) => c.status === 'active').length;
    const scheduledCampaigns = campaigns.filter((c) => c.status === 'scheduled').length;
    const totalProducts      = campaigns.reduce((s, c) => s + c.totalProducts, 0);

    const openModal = (modal, campaign) => {
        setSelectedCampaign(campaign);
        setActiveModal(modal);
    };

    const closeModal = () => {
        setActiveModal(null);
        setSelectedCampaign(null);
    };

    // Bubbles a fresh campaign (e.g. after ProductsModal adds products)
    // back into the list AND keeps whatever modal is currently showing it
    // in sync, without a full page reload.
    const handleCampaignUpdated = (updated) => {
        const normalized = normalizeCampaign(updated);
        setCampaigns((prev) => prev.map((c) => c._id === normalized._id ? normalized : c));
        setSelectedCampaign((prev) => (prev && prev._id === normalized._id ? normalized : prev));
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
                <StatBox icon={Tag}     label={t('admin.campaigns.stat_active')}    value={activeCampaigns}     color="#10b981" />
                <StatBox icon={Package} label={t('admin.campaigns.stat_products')}  value={totalProducts}       color="#2563eb" />
                <StatBox icon={Calendar} label={t('admin.campaigns.stat_scheduled')} value={scheduledCampaigns} color="#7c3aed" />
                <StatBox icon={BarChart3} label={t('admin.campaigns.stat_total')}   value={campaigns.length}    color="#fbbf24" />
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin" />
                </div>
            ) : listError ? (
                <div className="text-center py-20">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                    <p className="text-foreground mb-1">{t('admin.campaigns.err_load')}</p>
                    <p className="text-sm text-muted-foreground">{listError}</p>
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
                <AnalyticsModal campaign={selectedCampaign} closeModal={closeModal} />
            )}

            {activeModal === 'products' && selectedCampaign && (
                <ProductsModal campaign={selectedCampaign} closeModal={closeModal} onUpdated={handleCampaignUpdated} />
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

            {/* Revenue/budget/orders/product-trend metrics were removed from
                this card — Campaign has no budget/spend fields, and per-
                campaign revenue is only meaningful as a real, server-derived
                figure (see AnalyticsModal), not a cheap list-page preview.
                Only real, already-available fields stay on the card. */}
            <div className="flex items-center gap-4 mb-4 text-xs flex-wrap">
                <CompactMetric icon={Percent} label={t('admin.campaigns.discount')} value={`${campaign.discount}%`} color="#fbbf24" />
                <CompactMetric icon={Package} label={t('admin.campaigns.products')} value={campaign.totalProducts} color="#7c3aed" />
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
        title:           campaign?.title       ?? '',
        description:     campaign?.description ?? '',
        discountPercent: campaign?.discount ?? '',
        startDate:       toDateTimeLocal(campaign?.startDate),
        endDate:         toDateTimeLocal(campaign?.endDate),
        placement:       campaign?.placement ?? PLACEMENT_NONE,
        isClearance:     campaign?.isClearance ?? false,
        // VIP campaign benefits — see Campaign.js membershipOnly/
        // pointsMultiplier/vipEarlyAccessHours.
        membershipOnly:      campaign?.membershipOnly ?? false,
        pointsMultiplier:    campaign?.pointsMultiplier ?? 1,
        vipEarlyAccessHours: campaign?.vipEarlyAccessHours ?? 0,
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
                // Optional customer-facing fields — always sent (even '') so
                // clearing one back to blank actually unsets it server-side,
                // restoring the storefront's generic fallback title.
                title:           form.title.trim(),
                description:     form.description.trim(),
                discountPercent: Number(form.discountPercent),
                startDate:       fromDateTimeLocalToIso(form.startDate),
                endDate:         fromDateTimeLocalToIso(form.endDate),
                products:        selectedProducts.map((p) => p._id),
                placement:       form.placement,
                isClearance:     form.isClearance,
                membershipOnly:      form.membershipOnly,
                pointsMultiplier:    Number(form.pointsMultiplier) || 1,
                vipEarlyAccessHours: Number(form.vipEarlyAccessHours) || 0,
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

                    <div>
                        <ControlledInput label={t('admin.campaigns.name_label')} value={form.name} onChange={handle('name')} placeholder={t('admin.campaigns.name_ph')} required />
                        <p className="text-xs text-muted-foreground mt-1">{t('admin.campaigns.name_hint')}</p>
                    </div>

                    <div className="pt-1 pb-1">
                        <div className="flex items-center gap-2">
                            <span className="h-px flex-1 bg-border" />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{t('admin.campaigns.customer_display_section')}</span>
                            <span className="h-px flex-1 bg-border" />
                        </div>
                    </div>

                    <div>
                        <ControlledInput label={t('admin.campaigns.title_label')} value={form.title} onChange={handle('title')} placeholder={t('admin.campaigns.title_ph')} />
                        <p className="text-xs text-muted-foreground mt-1">{t('admin.campaigns.title_hint')}</p>
                    </div>

                    <div>
                        <label className="block text-xs text-muted-foreground mb-2">{t('admin.campaigns.description_label')}</label>
                        <textarea
                            value={form.description}
                            onChange={handle('description')}
                            placeholder={t('admin.campaigns.description_ph')}
                            rows={2}
                            className="w-full bg-input-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:border-[#2563eb] focus:outline-none transition-colors resize-none"
                        />
                    </div>

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

                    {/* Clearance toggle */}
                    <div>
                        <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border cursor-pointer hover:bg-secondary/50 transition-colors">
                            <input
                                type="checkbox"
                                checked={form.isClearance}
                                onChange={(e) => setForm((f) => ({ ...f, isClearance: e.target.checked }))}
                                className="w-4 h-4"
                            />
                            <span className="text-sm text-foreground">{t('admin.campaigns.clearance_label')}</span>
                        </label>
                        {form.isClearance && (
                            <p className="text-xs text-muted-foreground mt-2">{t('admin.campaigns.clearance_stock_hint')}</p>
                        )}
                    </div>

                    {/* VIP campaign benefits — see Campaign.js membershipOnly/
                        pointsMultiplier/vipEarlyAccessHours. Opt-in only —
                        most campaigns leave all three at their defaults. */}
                    <div>
                        <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border cursor-pointer hover:bg-secondary/50 transition-colors">
                            <input
                                type="checkbox"
                                checked={form.membershipOnly}
                                onChange={(e) => setForm((f) => ({ ...f, membershipOnly: e.target.checked }))}
                                className="w-4 h-4"
                            />
                            <span className="text-sm text-foreground">מבצע בלעדי לחברי מועדון (VIP בלבד)</span>
                        </label>
                        {form.membershipOnly && (
                            <p className="text-xs text-muted-foreground mt-2">מחיר זה יוצג ויחול רק על חברי מועדון פעילים — לקוחות שאינם חברים לא יראו ולא יוכלו לרכוש במחיר זה.</p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <ControlledInput
                            label="הכפלת נקודות (pointsMultiplier)"
                            type="number" min="1" max="10" step="1"
                            value={form.pointsMultiplier}
                            onChange={handle('pointsMultiplier')}
                            placeholder="1"
                        />
                        <ControlledInput
                            label="גישה מוקדמת ל-VIP (שעות)"
                            type="number" min="0" max="168" step="1"
                            value={form.vipEarlyAccessHours}
                            onChange={handle('vipEarlyAccessHours')}
                            placeholder="0"
                        />
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

// Real, server-derived campaign analytics only (see
// server/services/campaignAnalytics.service.js for the exact attribution/
// revenue formula). No conversion rate (TechVault does not track campaign
// impressions/views — there is no honest denominator to compute one), no
// week-over-week trend text (not enough data density to compute one
// honestly for an arbitrary campaign date range), no budget section
// (Campaign has no budget/spend fields at all).
function AnalyticsModal({ campaign, closeModal }) {
    const t = useTranslation();
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError(null);
        adminService.getCampaignAnalytics(campaign._id)
            .then((data) => { if (alive) setAnalytics(data); })
            .catch((err) => { if (alive) setError(err?.message ?? t('admin.campaigns.err_analytics')); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [campaign._id, t]);

    return (
        <ModalShell closeModal={closeModal}>
            <ModalHeader title={t('admin.campaigns.analytics_title')} subtitle={campaign.name} closeModal={closeModal} />

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] scrollbar-thin">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : error ? (
                    <div className="text-center py-16">
                        <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                            <MetricCard label={t('admin.campaigns.metric_orders')}   value={analytics.summary.attributedOrders.toLocaleString()} color="#10b981" icon={ShoppingCart} />
                            <MetricCard label={t('admin.campaigns.metric_units')}    value={analytics.summary.unitsSold.toLocaleString()}         color="#2563eb" icon={Package} />
                            <MetricCard label={t('admin.campaigns.metric_revenue')}  value={formatMoney(analytics.summary.revenue)}                color="#7c3aed" icon={DollarSign} />
                            <MetricCard label={t('admin.campaigns.metric_discount')} value={formatMoney(analytics.summary.discountGenerated)}     color="#fbbf24" icon={Percent} />
                        </div>

                        <div className="bg-secondary/20 border border-border rounded-lg p-5 mb-6">
                            <h3 className="text-base text-foreground mb-4">{t('admin.campaigns.performance_over_time')}</h3>

                            {analytics.timeSeries.length === 0 ? (
                                <div className="text-center py-10">
                                    <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                                    <p className="text-sm text-muted-foreground">{t('admin.campaigns.no_sales_yet')}</p>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart data={analytics.timeSeries} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="date" stroke="#8b8b99" style={{ fontSize: '11px', fill: '#8b8b99' }} />
                                        <YAxis yAxisId="left" stroke="#8b8b99" style={{ fontSize: '11px', fill: '#8b8b99' }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                                        <YAxis yAxisId="right" orientation="left" stroke="#8b8b99" style={{ fontSize: '11px', fill: '#8b8b99' }} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 12px' }}
                                            labelStyle={{ color: '#e5e5ea', fontSize: '12px', marginBottom: '4px' }}
                                            itemStyle={{ color: '#e5e5ea', fontSize: '11px' }}
                                            formatter={(value, name) => {
                                                if (name === 'revenue') return [`₪${value.toLocaleString()}`, t('admin.campaigns.metric_revenue')];
                                                if (name === 'orders')  return [value, t('admin.campaigns.metric_orders')];
                                                return [value, name];
                                            }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} formatter={(v) => v === 'revenue' ? t('admin.campaigns.metric_revenue') : v === 'orders' ? t('admin.campaigns.metric_orders') : v} />
                                        <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} yAxisId="left" />
                                        <Bar dataKey="orders"  fill="#10b981" radius={[4, 4, 0, 0]} yAxisId="right" />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        <ProductPerformanceTable products={analytics.products} t={t} />
                    </>
                )}
            </div>
        </ModalShell>
    );
}

function MetricCard({ label, value, color, icon: Icon }) {
    return (
        <div className="bg-gradient-to-br to-transparent border rounded-lg p-4" style={{ borderColor: `${color}33`, background: `linear-gradient(135deg, ${color}1a, transparent)` }}>
            <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5" style={{ color }} />
                <p className="text-xs text-muted-foreground">{label}</p>
            </div>
            <p className="text-2xl" style={{ color }}>{value}</p>
        </div>
    );
}

// Real per-product breakdown sourced from the analytics endpoint's
// campaign-attributed order items — replaces the previous fake growing/
// stable/declining trend breakdown (which used made-up numbers with no
// data source; a real per-product trend would need a second time-window
// comparison this task doesn't build).
function ProductPerformanceTable({ products, t }) {
    return (
        <div className="bg-secondary/20 border border-border rounded-lg p-5">
            <h3 className="text-base text-foreground mb-4">{t('admin.campaigns.product_performance')}</h3>
            {products.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t('admin.campaigns.no_sales_yet')}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <TableHead>{t('admin.campaigns.col_product')}</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead>{t('admin.campaigns.col_units')}</TableHead>
                                <TableHead>{t('admin.campaigns.col_revenue')}</TableHead>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map((p) => (
                                <tr key={p.productId} className="border-b border-border/50">
                                    <td className="py-2.5 px-4 text-sm text-foreground">{p.name}</td>
                                    <td className="py-2.5 px-4 text-sm text-muted-foreground">{p.sku ?? '—'}</td>
                                    <td className="py-2.5 px-4 text-sm text-foreground">{p.unitsSold.toLocaleString()}</td>
                                    <td className="py-2.5 px-4 text-sm text-[#10b981] font-medium">{formatMoney(p.revenue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Products modal ───────────────────────────────────────────────────────────

function ProductsModal({ campaign, closeModal, onUpdated }) {
    const t = useTranslation();
    const [showAdd, setShowAdd] = useState(false);
    const [search, setSearch] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchState, setSearchState] = useState('idle');
    const [toAdd, setToAdd] = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const abortRef = useRef(null);

    const existingIds = new Set(campaign.products.map((p) => p._id));

    // Same server-side search source/debounce/abort pattern as
    // CreateEditModal's product picker — only active while the "add
    // products" panel is open.
    useEffect(() => {
        if (!showAdd) return undefined;
        const handle = setTimeout(() => {
            if (abortRef.current) abortRef.current.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            setSearchState('loading');
            adminService.searchProducts({ search, limit: 20 }, controller.signal)
                .then(({ products }) => {
                    setSearchResults(products.filter((p) => /^[0-9a-fA-F]{24}$/.test(p._id)));
                    setSearchState(products.length === 0 ? 'empty' : 'success');
                })
                .catch((err) => {
                    if (err?.name === 'AbortError') return;
                    setSearchState('error');
                });
        }, 300);
        return () => clearTimeout(handle);
    }, [search, showAdd]);

    const toggleToAdd = (product) => {
        setToAdd((prev) => prev.some((p) => p._id === product._id)
            ? prev.filter((p) => p._id !== product._id)
            : [...prev, product]);
    };

    // Reuses the EXISTING campaign update endpoint (PATCH /admin/campaigns/:id)
    // — merges the already-selected products with the newly chosen ones,
    // deduping by _id, so nothing already in the campaign is ever lost.
    const handleAddProducts = async () => {
        setSaving(true);
        setError('');
        try {
            const mergedIds = Array.from(new Set([
                ...campaign.products.map((p) => p._id),
                ...toAdd.map((p) => p._id),
            ]));
            const updated = await adminService.updateCampaign(campaign._id, { products: mergedIds });
            onUpdated(updated);
            setShowAdd(false);
            setToAdd([]);
            setSearch('');
            setSearchResults([]);
        } catch (err) {
            setError(err?.message ?? t('admin.campaigns.err_save'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell closeModal={closeModal} maxWidth="max-w-6xl">
            <ModalHeader title={t('admin.campaigns.products_title')} subtitle={`${campaign.name} • ${campaign.totalProducts} ${t('admin.campaigns.products')}`} closeModal={closeModal} />

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] scrollbar-thin">
                {!showAdd ? (
                    <button type="button" onClick={() => setShowAdd(true)} className="w-full bg-[#2563eb] text-white py-3.5 rounded-xl font-medium hover:bg-[#2563eb]/90 transition-colors flex items-center justify-center gap-2 mb-6">
                        <Plus className="w-4 h-4" />
                        {t('admin.campaigns.add_products')}
                    </button>
                ) : (
                    <div className="mb-6 bg-secondary/20 border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm text-foreground font-medium">{t('admin.campaigns.add_products')}</h4>
                            <button type="button" onClick={() => { setShowAdd(false); setToAdd([]); setSearch(''); }} className="text-xs text-muted-foreground hover:text-foreground">
                                {t('admin.campaigns.cancel')}
                            </button>
                        </div>

                        <div className="relative mb-3">
                            <Search className="absolute top-2.5 right-3 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('admin.campaigns.search_products_placeholder')}
                                className="w-full pr-9 pl-3 py-2 rounded-lg bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                            />
                        </div>

                        {searchState === 'loading' && <p className="text-xs text-muted-foreground py-2">{t('admin.campaigns.searching')}</p>}
                        {searchState === 'error'   && <p className="text-xs text-red-400 py-2">{t('admin.campaigns.err_search')}</p>}
                        {searchState === 'empty'   && <p className="text-xs text-muted-foreground py-2">{t('admin.campaigns.no_products_found')}</p>}

                        {searchResults.length > 0 && (
                            <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
                                {searchResults.map((p) => {
                                    const alreadyIn = existingIds.has(p._id);
                                    const checked = toAdd.some((sp) => sp._id === p._id);
                                    return (
                                        <label key={p._id} className={`flex items-center justify-between gap-2 p-2 rounded-lg text-sm ${alreadyIn ? 'opacity-40' : 'hover:bg-secondary/40 cursor-pointer'}`}>
                                            <span className="flex items-center gap-2">
                                                <input type="checkbox" checked={checked || alreadyIn} disabled={alreadyIn} onChange={() => toggleToAdd(p)} />
                                                {p.name} <span className="text-xs text-muted-foreground">{p.sku}</span>
                                            </span>
                                            {alreadyIn && <span className="text-xs text-muted-foreground">{t('admin.campaigns.already_in_campaign')}</span>}
                                        </label>
                                    );
                                })}
                            </div>
                        )}

                        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

                        <button
                            type="button"
                            onClick={handleAddProducts}
                            disabled={saving || toAdd.length === 0}
                            className="w-full bg-[#2563eb] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#2563eb]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? t('admin.campaigns.saving') : `${t('admin.campaigns.add_selected')} (${toAdd.length})`}
                        </button>
                    </div>
                )}

                {campaign.products.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border">
                                    <TableHead>{t('admin.campaigns.col_product')}</TableHead>
                                    <TableHead>SKU</TableHead>
                                    <TableHead>{t('admin.campaigns.col_price')}</TableHead>
                                    <TableHead>{t('admin.campaigns.col_stock')}</TableHead>
                                </tr>
                            </thead>
                            <tbody>
                                {campaign.products.map((product) => (
                                    <ProductRow key={product._id} product={product} discountPercent={campaign.discount} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-foreground mb-1">{t('admin.campaigns.no_products_in_campaign')}</p>
                        <p className="text-sm text-muted-foreground">{t('admin.campaigns.add_products_hint')}</p>
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
            <td className="py-3 px-4 text-sm text-muted-foreground">{product.stock ?? '—'}</td>
        </tr>
    );
}
