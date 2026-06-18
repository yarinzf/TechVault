import { Barcode, Search, Package, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { warehouseService } from '../../features/warehouse/api/warehouse.service';
import { useTranslation } from '../../context/LanguageContext';

export default function BarcodeScannerPage() {
  const t = useTranslation();
  const [barcode, setBarcode] = useState('');
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError]     = useState('');

  const handleLookup = async () => {
    const trimmed = barcode.trim();
    if (!trimmed) return;

    setLoading(true);
    setResult(null);
    setNotFound(false);
    setError('');

    try {
      const { products } = await warehouseService.listInventory({ search: trimmed, limit: 1 });
      if (products.length > 0) {
        setResult(products[0]);
        setNotFound(false);
      } else {
        setResult(null);
        setNotFound(true);
      }
    } catch (err) {
      setError(err.message || t('warehouse.scanner.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLookup();
  };

  const stockColor = (stock) => {
    if (stock === 0) return 'text-[#ef4444]';
    if (stock <= 5)  return 'text-[#f97316]';
    return 'text-[#10b981]';
  };

  const stockLabel = (stock) => {
    if (stock === 0) return t('warehouse.scanner.out_of_stock');
    if (stock <= 5)  return t('warehouse.scanner.low_stock');
    return t('warehouse.scanner.in_stock');
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('warehouse.scanner.heading')}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t('warehouse.scanner.subtitle')}</p>
      </div>

      <div className="max-w-lg rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#2563eb]/10 mx-auto">
          <Barcode className="w-8 h-8 text-[#2563eb]" />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {t('warehouse.scanner.hint')}
        </p>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={barcode}
              onChange={e => { setBarcode(e.target.value); setNotFound(false); setError(''); }}
              onKeyDown={handleKeyDown}
              placeholder={t('warehouse.scanner.placeholder')}
              className="w-full bg-secondary border border-border rounded-lg pl-4 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
              disabled={loading}
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={handleLookup}
            disabled={loading || !barcode.trim()}
            className="flex items-center gap-2 bg-[#2563eb] text-white px-4 py-2.5 rounded-lg hover:bg-[#2563eb]/90 transition-colors text-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {t('warehouse.scanner.search')}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg text-[#ef4444] text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {notFound && !loading && (
          <div className="flex items-center gap-2 p-3 bg-[#fbbf24]/5 border border-[#fbbf24]/20 rounded-lg text-[#fbbf24] text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {t('warehouse.scanner.not_found')}
          </div>
        )}

        {result && !loading && (
          <div className="p-4 bg-secondary/40 rounded-xl border border-border space-y-3">
            <div className="flex items-start gap-3">
              {result.images?.[0] ? (
                <img
                  src={result.images[0]}
                  alt={result.name}
                  className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-border"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 border border-border">
                  <Package className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-foreground font-medium">{result.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">SKU: {result.sku}</p>
                {result.category?.name && (
                  <p className="text-xs text-muted-foreground">{result.category.name}</p>
                )}
              </div>
              <CheckCircle2 className="w-5 h-5 text-[#10b981] flex-shrink-0 mt-0.5" />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('warehouse.scanner.price')}</p>
                <p className="text-foreground font-medium">
                  {result.price != null ? `₪${Number(result.price).toLocaleString('he-IL')}` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('warehouse.scanner.stock')}</p>
                <p className={`font-medium ${stockColor(result.stock)}`}>
                  {result.stock} {t('warehouse.scanner.units')}
                  <span className="text-xs font-normal mr-1">({stockLabel(result.stock)})</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
