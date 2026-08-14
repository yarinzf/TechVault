import {
  Barcode, Search, Package, CheckCircle2, AlertCircle, Loader2,
  Camera, CameraOff, RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import { warehouseService } from '../../features/warehouse/api/warehouse.service';
import { useTranslation } from '../../context/LanguageContext';
import { useBarcodeScanner, SCANNER_STATUS } from '../../features/warehouse/hooks/useBarcodeScanner';

export default function BarcodeScannerPage() {
  const t = useTranslation();
  const [barcode, setBarcode] = useState('');
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError]     = useState('');

  const handleLookup = async (codeOverride) => {
    const code = (codeOverride ?? barcode).trim();
    if (!code || loading) return;

    setBarcode(code);
    setLoading(true);
    setResult(null);
    setNotFound(false);
    setError('');

    try {
      const product = await warehouseService.lookupProduct(code);
      if (product) {
        setResult(product);
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

  const {
    videoRef, status: cameraStatus, errorMessage: cameraErrorMessage,
    start: startCamera, stop: stopCamera, resume: resumeCamera,
  } = useBarcodeScanner({
    onDetect: (value) => handleLookup(value),
  });

  const handleScanAgain = () => {
    setResult(null);
    setNotFound(false);
    setError('');
    setBarcode('');
    resumeCamera();
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

  const showCameraPreview = cameraStatus === SCANNER_STATUS.SCANNING || cameraStatus === SCANNER_STATUS.LOCKED;
  const showScanAgain = cameraStatus === SCANNER_STATUS.LOCKED && !loading && (result || notFound || error);

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

        {/* ── Camera section ── */}
        <div className="space-y-3">
          {showCameraPreview && (
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
              {cameraStatus === SCANNER_STATUS.SCANNING && (
                <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs text-center py-1.5">
                  {t('warehouse.scanner.scanning_hint')}
                </div>
              )}
            </div>
          )}

          {cameraStatus === SCANNER_STATUS.STARTING && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('warehouse.scanner.camera_starting')}
            </div>
          )}

          {cameraStatus === SCANNER_STATUS.UNSUPPORTED && (
            <div className="flex items-center gap-2 p-3 bg-[#8b8b99]/5 border border-[#8b8b99]/20 rounded-lg text-muted-foreground text-sm">
              <CameraOff className="w-4 h-4 flex-shrink-0" />
              {t('warehouse.scanner.camera_unsupported')}
            </div>
          )}

          {cameraStatus === SCANNER_STATUS.DENIED && (
            <div className="flex items-center gap-2 p-3 bg-[#fbbf24]/5 border border-[#fbbf24]/20 rounded-lg text-[#fbbf24] text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {t('warehouse.scanner.camera_denied')}
            </div>
          )}

          {cameraStatus === SCANNER_STATUS.NO_CAMERA && (
            <div className="flex items-center gap-2 p-3 bg-[#8b8b99]/5 border border-[#8b8b99]/20 rounded-lg text-muted-foreground text-sm">
              <CameraOff className="w-4 h-4 flex-shrink-0" />
              {t('warehouse.scanner.camera_no_device')}
            </div>
          )}

          {cameraStatus === SCANNER_STATUS.ERROR && (
            <div className="flex items-center gap-2 p-3 bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg text-[#ef4444] text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {cameraErrorMessage || t('warehouse.scanner.camera_error')}
            </div>
          )}

          {cameraStatus === SCANNER_STATUS.IDLE && (
            <button
              type="button"
              onClick={startCamera}
              className="w-full flex items-center justify-center gap-2 bg-[#2563eb] text-white px-4 py-2.5 rounded-lg hover:bg-[#2563eb]/90 transition-colors text-sm"
            >
              <Camera className="w-4 h-4" />
              {t('warehouse.scanner.start_camera')}
            </button>
          )}

          {showCameraPreview && (
            <button
              type="button"
              onClick={stopCamera}
              className="w-full flex items-center justify-center gap-2 bg-secondary border border-border text-foreground px-4 py-2.5 rounded-lg hover:bg-secondary/70 transition-colors text-sm"
            >
              <CameraOff className="w-4 h-4" />
              {t('warehouse.scanner.stop_camera')}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">{t('warehouse.scanner.or_divider')}</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* ── Manual lookup section ── */}
        <div className="space-y-2">
          <label className="block text-xs text-muted-foreground" htmlFor="barcode-manual-input">
            {t('warehouse.scanner.manual_label')}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="barcode-manual-input"
                type="text"
                value={barcode}
                onChange={e => { setBarcode(e.target.value); setNotFound(false); setError(''); }}
                onKeyDown={handleKeyDown}
                placeholder={t('warehouse.scanner.placeholder')}
                className="w-full bg-secondary border border-border rounded-lg pl-4 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
                disabled={loading}
              />
            </div>
            <button
              type="button"
              onClick={() => handleLookup()}
              disabled={loading || !barcode.trim()}
              className="flex items-center gap-2 bg-[#2563eb] text-white px-4 py-2.5 rounded-lg hover:bg-[#2563eb]/90 transition-colors text-sm disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {t('warehouse.scanner.search')}
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('warehouse.scanner.searching')}
          </div>
        )}

        {error && !loading && (
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
                {result.brand && (
                  <p className="text-xs text-muted-foreground">{t('warehouse.scanner.brand')}: {result.brand}</p>
                )}
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
              {result.minStock != null && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">
                    {t('warehouse.scanner.min_stock')}: {result.minStock} {t('warehouse.scanner.units')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {showScanAgain && (
          <button
            type="button"
            onClick={handleScanAgain}
            className="w-full flex items-center justify-center gap-2 bg-secondary border border-border text-foreground px-4 py-2.5 rounded-lg hover:bg-secondary/70 transition-colors text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {t('warehouse.scanner.scan_again')}
          </button>
        )}
      </div>
    </div>
  );
}
