'use client';
import { useState, useEffect, useMemo } from 'react';
import {
    Search,
    Plus,
    Edit,
    Trash2,
    TrendingUp,
    TrendingDown,
    BarChart3,
    AlertCircle,
    Filter,
    X,
    Loader2,
    Save,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { adminService } from '../../features/admin/api/admin.service';
import { warehouseService } from '../../features/warehouse/api/warehouse.service';
import { productService } from '../../features/products/api/product.service';
import { useToast } from '../../hooks/useToast';
import { buildCategoryTree } from '../../constants/categories';
import { getCategoryLabel } from '../../features/products/utils/categoryLabels';

function deriveStatus(product) {
    if (!product.isPublished) return 'draft';
    if (product.stock === 0)  return 'out-of-stock';
    return 'active';
}

function getStatusColor(status) {
    switch (status) {
        case 'active':       return 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20';
        case 'draft':        return 'bg-[#8b8b99]/10 text-[#8b8b99] border-[#8b8b99]/20';
        case 'out-of-stock': return 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20';
        default:             return 'bg-secondary text-muted-foreground border-border';
    }
}

function getStatusText(status) {
    switch (status) {
        case 'active':       return 'פעיל';
        case 'draft':        return 'טיוטה';
        case 'out-of-stock': return 'אזל מהמלאי';
        default:             return status;
    }
}

function formatPrice(price) {
    if (price == null) return '—';
    return `₪${Number(price).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const BLANK_FORM = {
    name: '', description: '', category: '', brand: '',
    price: '', stock: '0', imageUrl: '', isPublished: false,
    nameHe: '', shortDescriptionHe: '', descriptionHe: '',
    // Club points eligibility — most products earn points by default.
    pointsEligible: true, pointsRateOverride: '',
};

export default function AdminProductsPage() {
    const { toast } = useToast();
    const [products, setProducts]             = useState([]);
    const [loading, setLoading]               = useState(true);
    const [error, setError]                   = useState('');
    const [health, setHealth]                 = useState(null);
    const [categories, setCategories]         = useState([]);
    const [searchTerm, setSearchTerm]         = useState('');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [selectedBrand, setSelectedBrand]   = useState('all');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [showFilters, setShowFilters]       = useState(false);

    // Modal state
    const [modalMode, setModalMode]           = useState(null); // 'create' | 'edit'
    const [editTarget, setEditTarget]         = useState(null); // full product fetched for editing (source of truth for diffing on save)
    const [form, setForm]                     = useState(BLANK_FORM);
    const [saving, setSaving]                 = useState(false);
    const [formError, setFormError]           = useState('');
    const [editLoading, setEditLoading]       = useState(false);

    // Sales-history modal state — a real product whose modal is open, or null
    const [historyTarget, setHistoryTarget]   = useState(null);

    // Load products + health stats + categories in parallel
    useEffect(() => {
        async function load() {
            setLoading(true);
            setError('');
            try {
                const [inv, h, cats] = await Promise.all([
                    warehouseService.listInventory({ limit: 200 }),
                    adminService.getInventoryHealth(),
                    productService.getCategories(),
                ]);
                setProducts(inv.products ?? []);
                setHealth(h);
                setCategories(cats ?? []);
            } catch (err) {
                setError(err.message || 'שגיאה בטעינת מוצרים');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    // Derived filter options from loaded data
    const brands     = useMemo(() => ['all', ...Array.from(new Set(products.map(p => p.brand).filter(Boolean)))], [products]);
    const catOptions = useMemo(() => ['all', ...categories.map(c => c.name)], [categories]);
    // Real main→subcategory hierarchy for the create/edit form's category
    // selector (see constants/categories.js buildCategoryTree) — the same
    // tree-building helper the customer-facing "All Categories" modal uses,
    // so there's one definition of "hierarchy" across the app.
    const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);

    // Client-side filtering
    const filtered = useMemo(() => {
        return products.filter(p => {
            const status = deriveStatus(p);
            const q      = searchTerm.toLowerCase();

            if (searchTerm && !p.name.toLowerCase().includes(q) && !(p.sku || '').toLowerCase().includes(q)) return false;
            if (selectedStatus !== 'all' && status !== selectedStatus) return false;
            if (selectedBrand !== 'all' && p.brand !== selectedBrand) return false;
            if (selectedCategory !== 'all' && p.category?.name !== selectedCategory) return false;
            return true;
        });
    }, [products, searchTerm, selectedStatus, selectedBrand, selectedCategory]);

    const activeFiltersCount = [selectedStatus, selectedBrand, selectedCategory].filter(v => v !== 'all').length;

    const clearFilters = () => {
        setSelectedStatus('all');
        setSelectedBrand('all');
        setSelectedCategory('all');
        setSearchTerm('');
    };

    // Create modal
    const openCreate = () => {
        setForm(BLANK_FORM);
        setFormError('');
        setEditTarget(null);
        setModalMode('create');
    };

    // Edit modal — the inventory list row lacks description/brand/nameHe/
    // shortDescriptionHe/descriptionHe (warehouse listing projection is
    // deliberately sparse), so we fetch the full product before opening the
    // form. `editTarget` holds that full record and is used in handleSave to
    // detect which fields actually changed.
    const openEdit = async (product) => {
        setEditLoading(true);
        try {
            const full = await adminService.getProductForEdit(product._id);
            setEditTarget(full);
            setForm({
                name:        full.name || '',
                description: full.description || '',
                category:    full.category?._id || '',
                brand:       full.brand || '',
                price:       full.price != null ? String(full.price) : '',
                stock:       full.stock != null ? String(full.stock) : '0',
                imageUrl:    full.images?.[0] || '',
                isPublished: full.isPublished ?? false,
                nameHe:             full.nameHe || '',
                shortDescriptionHe: full.shortDescriptionHe || '',
                descriptionHe:      full.descriptionHe || '',
                pointsEligible:     full.pointsEligible !== false,
                pointsRateOverride: full.pointsRateOverride != null ? String(Math.round(full.pointsRateOverride * 100)) : '',
            });
            setFormError('');
            setModalMode('edit');
        } catch (err) {
            toast.error(err.message || 'טעינת המוצר לעריכה נכשלה');
        } finally {
            setEditLoading(false);
        }
    };

    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSave = async () => {
        setFormError('');
        if (!form.name.trim())     { setFormError('שם המוצר הוא שדה חובה'); return; }
        if (!form.price)           { setFormError('מחיר הוא שדה חובה'); return; }

        const dto = {
            name:        form.name.trim(),
            price:       parseFloat(form.price),
            stock:       parseInt(form.stock, 10) || 0,
            isPublished: form.isPublished,
            pointsEligible: form.pointsEligible,
        };
        if (form.description.trim()) dto.description  = form.description.trim();
        if (form.brand.trim())       dto.brand         = form.brand.trim();
        if (form.category)           dto.category      = form.category;
        if (form.imageUrl.trim())    dto.images        = [form.imageUrl.trim()];
        // Stored as a 0-1 rate; the admin UI shows/accepts a whole-number
        // percentage for readability. Empty = no override (use the store
        // default POINTS_DEFAULT_RATE server-side).
        dto.pointsRateOverride = form.pointsRateOverride.trim()
            ? Math.max(0, Math.min(100, parseFloat(form.pointsRateOverride))) / 100
            : null;

        // Hebrew fields: in edit mode the form is pre-populated with the
        // product's current values (see openEdit), so an empty field here
        // means the admin explicitly cleared it — send it through as ''
        // rather than silently keeping the old value. Only fields that
        // actually changed are included, so untouched fields never overwrite
        // themselves. In create mode there's no "original" to diff against,
        // so fall back to the simple "send if non-empty" rule.
        const heFields = ['nameHe', 'shortDescriptionHe', 'descriptionHe'];
        if (modalMode === 'edit') {
            for (const key of heFields) {
                const original = editTarget?.[key] || '';
                const current  = form[key].trim();
                if (current !== original) dto[key] = current;
            }
        } else {
            for (const key of heFields) {
                if (form[key].trim()) dto[key] = form[key].trim();
            }
        }

        setSaving(true);
        try {
            if (modalMode === 'create') {
                if (!form.description.trim()) { setFormError('תיאור הוא שדה חובה ליצירת מוצר חדש'); setSaving(false); return; }
                if (!form.category)           { setFormError('קטגוריה היא שדה חובה ליצירת מוצר חדש'); setSaving(false); return; }
                dto.description = form.description.trim();
                dto.category    = form.category;
                const created = await adminService.createProduct(dto);
                // Append to list with shape compatible with inventory list format
                const catObj = categories.find(c => c._id === form.category);
                setProducts(prev => [{ ...created, category: catObj ?? { name: '', _id: form.category } }, ...prev]);
            } else {
                const updated = await adminService.updateProduct(editTarget._id, dto);
                const catObj  = categories.find(c => c._id === (form.category || editTarget.category?._id));
                setProducts(prev => prev.map(p =>
                    p._id === editTarget._id
                        ? { ...p, ...updated, category: catObj ?? p.category }
                        : p
                ));
            }
            setModalMode(null);
        } catch (err) {
            setFormError(err.message || 'שמירה נכשלה');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (product) => {
        if (!window.confirm(`למחוק את "${product.name}"? פעולה זו בלתי הפיכה.`)) return;
        try {
            await adminService.deleteProduct(product._id);
            setProducts(prev => prev.filter(p => p._id !== product._id));
        } catch (err) {
            toast.error(err.message || 'מחיקה נכשלה');
        }
    };

    return (
        <div className="p-8" dir="rtl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl text-foreground mb-2">מוצרים</h1>
                    <p className="text-muted-foreground">
                        ניהול קטלוג המוצרים שלך
                        {products.length > 0 ? ` • ${products.length} מוצרים נטענו` : ''}
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={openCreate}
                        className="flex items-center gap-2 bg-[#2563eb] text-white px-4 py-2 rounded-lg hover:bg-[#2563eb]/90 transition-all hover:scale-105"
                    >
                        <Plus className="w-4 h-4" />
                        הוסף מוצר
                    </button>
                </div>
            </div>

            {/* Stats tiles from real inventory health */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <div className="bg-card border border-border rounded-lg p-4 hover:border-[#2563eb]/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-muted-foreground text-sm">סך המוצרים</p>
                        <TrendingUp className="w-4 h-4 text-[#10b981]" />
                    </div>
                    <p className="text-2xl text-foreground mb-1">{health?.totalProducts ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">בקטלוג</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4 hover:border-[#10b981]/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-muted-foreground text-sm">מלאי תקין</p>
                        <div className="w-2 h-2 bg-[#10b981] rounded-full animate-pulse" />
                    </div>
                    <p className="text-2xl text-[#10b981] mb-1">{health?.healthyStockCount ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                        {health ? `${Math.round((health.healthyStockCount / health.totalProducts) * 100)}% מהקטלוג` : ''}
                    </p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4 hover:border-[#ef4444]/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-muted-foreground text-sm">אזל מהמלאי</p>
                        <AlertCircle className="w-4 h-4 text-[#ef4444]" />
                    </div>
                    <p className="text-2xl text-[#ef4444] mb-1">{health?.outOfStockCount ?? '—'}</p>
                    {(health?.outOfStockCount ?? 0) > 0 && (
                        <p className="text-xs text-[#ef4444]">דורש טיפול מיידי</p>
                    )}
                </div>

                <div className="bg-card border border-border rounded-lg p-4 hover:border-[#2563eb]/30 transition-colors">
                    <p className="text-muted-foreground text-sm mb-2">קטגוריות</p>
                    <p className="text-2xl text-foreground mb-1">{categories.length || '—'}</p>
                    <p className="text-xs text-muted-foreground">בקטלוג</p>
                </div>
            </div>

            {/* Search */}
            <div className="bg-card border border-border rounded-lg p-6 mb-6">
                <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="חיפוש מוצר לפי שם, SKU..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-secondary border border-border rounded-lg pl-4 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
                    />
                </div>
            </div>

            {/* Filters */}
            <div className="bg-card border border-border rounded-lg p-6 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">סינון</p>
                        {activeFiltersCount > 0 && (
                            <span className="text-xs text-[#2563eb] bg-[#2563eb]/10 px-2 py-0.5 rounded-full">
                                {activeFiltersCount} פעיל
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        className="text-sm text-[#2563eb] hover:underline"
                        onClick={() => setShowFilters(prev => !prev)}
                    >
                        {showFilters ? 'סגור סינונים' : 'הצג סינונים'}
                    </button>
                </div>

                {showFilters && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                        <FilterSelect
                            label="קטגוריה"
                            value={selectedCategory}
                            onChange={setSelectedCategory}
                            options={catOptions}
                            allLabel="כל הקטגוריות"
                        />
                        <FilterSelect
                            label="יצרן"
                            value={selectedBrand}
                            onChange={setSelectedBrand}
                            options={brands}
                            allLabel="כל היצרנים"
                        />
                        <FilterSelect
                            label="סטטוס"
                            value={selectedStatus}
                            onChange={setSelectedStatus}
                            options={['all', 'active', 'draft', 'out-of-stock']}
                            allLabel="כל הסטטוסים"
                            labelMap={{ active: 'פעיל', draft: 'טיוטה', 'out-of-stock': 'אזל מהמלאי' }}
                        />
                        {activeFiltersCount > 0 && (
                            <div className="flex items-end">
                                <button
                                    type="button"
                                    className="text-sm text-[#ef4444] hover:underline"
                                    onClick={clearFilters}
                                >
                                    נקה סינונים ({activeFiltersCount})
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-4 mb-6 text-[#ef4444] bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-[#2563eb]" />
                </div>
            )}

            {/* Product grid */}
            {!loading && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filtered.map((product) => {
                            const status = deriveStatus(product);
                            return (
                                <article
                                    key={product._id}
                                    className="bg-card border border-border rounded-lg overflow-hidden hover:border-[#2563eb]/30 transition-all group"
                                >
                                    <div className="aspect-square bg-secondary relative overflow-hidden">
                                        <ImageWithFallback
                                            src={product.images?.[0]}
                                            alt={product.name}
                                            className="w-full h-full object-cover"
                                        />

                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                        <div className="absolute top-3 left-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={() => openEdit(product)}
                                                disabled={editLoading}
                                                className="p-2 bg-card rounded-lg hover:bg-[#2563eb] hover:text-white transition-colors disabled:opacity-60"
                                                aria-label="עריכת מוצר"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(product)}
                                                className="p-2 bg-card rounded-lg hover:bg-[#ef4444] hover:text-white transition-colors"
                                                aria-label="מחיקת מוצר"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setHistoryTarget(product)}
                                                className="p-2 bg-card rounded-lg hover:bg-[#2563eb] hover:text-white transition-colors"
                                                aria-label="היסטוריית מכירות"
                                            >
                                                <BarChart3 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-4">
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-foreground mb-1 truncate">{product.name}</h3>
                                                <p className="text-xs text-muted-foreground">
                                                    {product.category?.name || '—'}
                                                    {product.brand ? ` · ${product.brand}` : ''}
                                                </p>
                                            </div>
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs border whitespace-nowrap ${getStatusColor(status)}`}>
                                                {getStatusText(status)}
                                            </span>
                                        </div>

                                        <div className="flex items-end justify-between mt-4">
                                            <div>
                                                <p className="text-2xl text-foreground">{formatPrice(product.price)}</p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    מלאי: {product.stock} יח׳
                                                </p>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm text-[#2563eb]">{product.salesCount ?? 0} נמכרו</p>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>

                    {filtered.length === 0 && !loading && (
                        <div className="text-center py-20 text-muted-foreground">
                            לא נמצאו מוצרים שתואמים לחיפוש
                        </div>
                    )}
                </>
            )}

            {/* Create / Edit modal */}
            {modalMode && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                    onClick={() => setModalMode(null)}
                    dir="rtl"
                >
                    <div
                        className="bg-card border border-border rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
                            <h2 className="text-xl text-foreground">
                                {modalMode === 'create' ? 'הוספת מוצר חדש' : `עריכת מוצר: ${editTarget?.name}`}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setModalMode(null)}
                                className="p-2 hover:bg-secondary rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <FormField label="שם מוצר *">
                                <input
                                    name="name"
                                    value={form.name}
                                    onChange={handleFormChange}
                                    placeholder="שם המוצר"
                                    className={inputCls}
                                />
                            </FormField>

                            <FormField label="שם מוצר בעברית (אופציונלי)">
                                <input
                                    name="nameHe"
                                    value={form.nameHe}
                                    onChange={handleFormChange}
                                    placeholder={modalMode === 'edit' ? 'ריק = הסרת השם בעברית' : 'שם מותאם בעברית, אם רלוונטי'}
                                    className={inputCls}
                                />
                            </FormField>

                            <FormField label={`תיאור${modalMode === 'create' ? ' *' : ''}`}>
                                <textarea
                                    name="description"
                                    value={form.description}
                                    onChange={handleFormChange}
                                    rows={3}
                                    placeholder="תיאור המוצר"
                                    className={`${inputCls} resize-none`}
                                />
                            </FormField>

                            <FormField label="תיאור קצר בעברית (אופציונלי)">
                                <input
                                    name="shortDescriptionHe"
                                    value={form.shortDescriptionHe}
                                    onChange={handleFormChange}
                                    placeholder={modalMode === 'edit' ? 'ריק = הסרת התיאור הקצר בעברית' : 'תיאור קצר בעברית'}
                                    className={inputCls}
                                />
                            </FormField>

                            <FormField label="תיאור מלא בעברית (אופציונלי)">
                                <textarea
                                    name="descriptionHe"
                                    value={form.descriptionHe}
                                    onChange={handleFormChange}
                                    rows={3}
                                    placeholder={modalMode === 'edit' ? 'ריק = הסרת התיאור המלא בעברית' : 'תיאור מלא בעברית'}
                                    className={`${inputCls} resize-none`}
                                />
                            </FormField>

                            <div className="grid grid-cols-2 gap-4">
                                <FormField label={`קטגוריה${modalMode === 'create' ? ' *' : ''}`}>
                                    <select
                                        name="category"
                                        value={form.category}
                                        onChange={handleFormChange}
                                        className={inputCls}
                                    >
                                        <option value="">בחר קטגוריה</option>
                                        {/* Real main→subcategory hierarchy — assign the most specific
                                            leaf when one exists (e.g. "Laptops", not "Computers");
                                            direct categories with no children (Monitors, Smartphones…)
                                            are still assignable as-is. */}
                                        {categoryTree.map(main => (
                                            <optgroup key={main._id} label={getCategoryLabel(main, 'he')}>
                                                {main.children.length > 0 ? (
                                                    <>
                                                        <option value={main._id}>{`${getCategoryLabel(main, 'he')} (כללי)`}</option>
                                                        {main.children.map(child => (
                                                            <option key={child._id} value={child._id}>{getCategoryLabel(child, 'he')}</option>
                                                        ))}
                                                    </>
                                                ) : (
                                                    <option value={main._id}>{getCategoryLabel(main, 'he')}</option>
                                                )}
                                            </optgroup>
                                        ))}
                                    </select>
                                </FormField>

                                <FormField label="יצרן">
                                    <input
                                        name="brand"
                                        value={form.brand}
                                        onChange={handleFormChange}
                                        placeholder="Apple, Samsung..."
                                        className={inputCls}
                                    />
                                </FormField>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <FormField label="מחיר (₪) *">
                                    <input
                                        name="price"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.price}
                                        onChange={handleFormChange}
                                        placeholder="0.00"
                                        className={inputCls}
                                    />
                                </FormField>

                                <FormField label="מלאי (יחידות)">
                                    <input
                                        name="stock"
                                        type="number"
                                        min="0"
                                        value={form.stock}
                                        onChange={handleFormChange}
                                        placeholder="0"
                                        className={inputCls}
                                    />
                                </FormField>
                            </div>

                            <FormField label="קישור תמונה (URL)">
                                <input
                                    name="imageUrl"
                                    value={form.imageUrl}
                                    onChange={handleFormChange}
                                    placeholder="https://..."
                                    className={inputCls}
                                />
                            </FormField>

                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="isPublished"
                                    checked={form.isPublished}
                                    onChange={handleFormChange}
                                    className="w-4 h-4 rounded border-border text-[#2563eb]"
                                />
                                <span className="text-sm text-foreground">פרסם מוצר (גלוי ללקוחות)</span>
                            </label>

                            {/* Club points eligibility — see Product.js pointsEligible/pointsRateOverride */}
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="pointsEligible"
                                    checked={form.pointsEligible}
                                    onChange={handleFormChange}
                                    className="w-4 h-4 rounded border-border text-[#2563eb]"
                                />
                                <span className="text-sm text-foreground">מוצר זכאי לנקודות מועדון (5% ברירת מחדל)</span>
                            </label>
                            {form.pointsEligible && (
                                <FormField label="שיעור נקודות מותאם אישית (%) — השאר ריק לברירת מחדל 5%">
                                    <input
                                        type="number" min="0" max="100" step="1"
                                        name="pointsRateOverride"
                                        value={form.pointsRateOverride}
                                        onChange={handleFormChange}
                                        placeholder="5"
                                        className={inputCls}
                                    />
                                </FormField>
                            )}

                            {formError && (
                                <p className="text-sm text-[#ef4444] flex items-center gap-1.5">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {formError}
                                </p>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex items-center gap-2 bg-[#2563eb] text-white px-5 py-2.5 rounded-lg hover:bg-[#2563eb]/90 transition-colors text-sm disabled:opacity-60"
                                >
                                    <Save className="w-4 h-4" />
                                    {saving ? 'שומר…' : modalMode === 'create' ? 'צור מוצר' : 'שמור שינויים'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setModalMode(null)}
                                    disabled={saving}
                                    className="px-5 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground hover:bg-secondary/70 transition-colors"
                                >
                                    ביטול
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sales-history modal — real, rebuildable Order-derived data only */}
            {historyTarget && (
                <ProductSalesHistoryModal product={historyTarget} onClose={() => setHistoryTarget(null)} />
            )}
        </div>
    );
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('he-IL', { month: 'short', year: '2-digit' });
function monthLabel(year, month) {
    return MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));
}

function ProductSalesHistoryModal({ product, onClose }) {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        adminService.getProductSalesHistory(product._id, 12)
            .then((res) => { if (!cancelled) setData(res); })
            .catch((err) => { if (!cancelled) setError(err.message || 'שגיאה בטעינת היסטוריית מכירות'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [product._id]);

    const chartData = (data?.history ?? []).map((h) => ({
        label: monthLabel(h.year, h.month),
        unitsSold: h.unitsSold,
    }));

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
                        <h2 className="text-xl text-foreground">היסטוריית מכירות</h2>
                        <p className="text-sm text-muted-foreground">{product.name}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-8 h-8 animate-spin text-[#2563eb]" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-2 bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2 text-sm text-[#ef4444]">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    ) : !data || data.totalUnitsSold === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            אין עדיין היסטוריית מכירות אמיתית למוצר זה
                        </div>
                    ) : (
                        <>
                            {/* Summary */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-secondary/40 border border-border rounded-lg p-4">
                                    <p className="text-xs text-muted-foreground mb-1">סה״כ נמכרו</p>
                                    <p className="text-xl text-foreground">{data.totalUnitsSold.toLocaleString()}</p>
                                </div>
                                <div className="bg-secondary/40 border border-border rounded-lg p-4">
                                    <p className="text-xs text-muted-foreground mb-1">החודש</p>
                                    <p className="text-xl text-foreground">{(data.currentMonth?.unitsSold ?? 0).toLocaleString()}</p>
                                </div>
                                <div className="bg-secondary/40 border border-border rounded-lg p-4">
                                    <p className="text-xs text-muted-foreground mb-1">חודש קודם</p>
                                    <p className="text-xl text-foreground">{(data.previousMonth?.unitsSold ?? 0).toLocaleString()}</p>
                                </div>
                                <div className="bg-secondary/40 border border-border rounded-lg p-4">
                                    <p className="text-xs text-muted-foreground mb-1">שינוי מול חודש קודם</p>
                                    {data.monthOverMonthPercent == null ? (
                                        <p className="text-xl text-muted-foreground">—</p>
                                    ) : (
                                        <p className={`text-xl flex items-center gap-1 ${data.monthOverMonthPercent >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                                            {data.monthOverMonthPercent >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                            {data.monthOverMonthPercent > 0 ? '+' : ''}{data.monthOverMonthPercent}%
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Chart — last 12 months, units sold */}
                            <div>
                                <h3 className="text-sm text-foreground mb-3">מכירות לפי חודש (12 חודשים אחרונים)</h3>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="label" stroke="#8b8b99" style={{ fontSize: '11px', fill: '#8b8b99' }} />
                                        <YAxis stroke="#8b8b99" style={{ fontSize: '11px', fill: '#8b8b99' }} allowDecimals={false} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 12px' }}
                                            labelStyle={{ color: '#e5e5ea', fontSize: '12px', marginBottom: '4px' }}
                                            itemStyle={{ color: '#e5e5ea', fontSize: '11px' }}
                                            formatter={(value) => [value, 'יחידות נמכרו']}
                                        />
                                        <Bar dataKey="unitsSold" fill="#2563eb" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Monthly table */}
                            <div>
                                <h3 className="text-sm text-foreground mb-3">טבלה חודשית</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-right text-muted-foreground border-b border-border">
                                                <th className="py-2 pr-2 font-normal">חודש</th>
                                                <th className="py-2 font-normal">יחידות נמכרו</th>
                                                <th className="py-2 font-normal">מספר הזמנות</th>
                                                <th className="py-2 font-normal">הכנסה</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...data.history].reverse().map((h) => (
                                                <tr key={`${h.year}-${h.month}`} className="border-b border-border/50">
                                                    <td className="py-2 pr-2 text-foreground">{monthLabel(h.year, h.month)}</td>
                                                    <td className="py-2 text-foreground">{h.unitsSold.toLocaleString()}</td>
                                                    <td className="py-2 text-foreground">{h.orderCount.toLocaleString()}</td>
                                                    <td className="py-2 text-foreground">₪{h.revenue.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

const inputCls =
    'w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50 placeholder:text-muted-foreground';

function FormField({ label, children }) {
    return (
        <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{label}</label>
            {children}
        </div>
    );
}

function FilterSelect({ label, value, onChange, options, allLabel, labelMap = {} }) {
    return (
        <div>
            <p className="text-sm text-muted-foreground mb-2">{label}</p>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
            >
                {options.map(opt => (
                    <option key={opt} value={opt}>
                        {opt === 'all' ? allLabel : (labelMap[opt] ?? opt)}
                    </option>
                ))}
            </select>
        </div>
    );
}
