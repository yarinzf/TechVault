import { Package } from 'lucide-react';
import { useTranslation } from '../../../context/LanguageContext';

export function TopProducts({ products = [] }) {
    const t = useTranslation();
    return (
        <div className="bg-card border border-border rounded-xl p-6" dir="rtl">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#fbbf24]/10 rounded-lg">
                        <Package className="w-5 h-5 text-[#fbbf24]" />
                    </div>
                    <h3 className="text-lg text-foreground">{t('admin.tp.heading')}</h3>
                </div>
                <span className="text-xs bg-[#2563eb]/10 px-3 py-1.5 rounded-full text-[#2563eb] border border-[#2563eb]/20">
                    TOP {products.length}
                </span>
            </div>

            {products.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-6">{t('admin.tp.empty')}</p>
            ) : (
                <div className="space-y-3">
                    {products.map((product, index) => (
                        <div
                            key={product.product ?? index}
                            className="bg-secondary/20 border border-border/50 hover:bg-secondary/40 rounded-lg transition-all"
                        >
                            <div className="flex items-center gap-4 p-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#2563eb]/10 text-[#2563eb] text-sm flex-shrink-0 border border-[#2563eb]/20">
                                    {index + 1}
                                </div>

                                <div className="w-12 h-12 rounded-lg bg-secondary flex-shrink-0 border border-border/30 flex items-center justify-center">
                                    <Package className="w-5 h-5 text-muted-foreground" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-foreground text-sm truncate">{product.name}</p>
                                    <p className="text-muted-foreground text-xs">{product.totalQty} {t('admin.tp.units_sold')}</p>
                                </div>

                                <div className="text-left flex-shrink-0">
                                    <p className="text-foreground text-sm">
                                        ₪{Math.round(product.revenue).toLocaleString('he-IL')}
                                    </p>
                                    <p className="text-muted-foreground text-xs mt-1">{product.orders} {t('admin.tp.orders')}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default TopProducts;
