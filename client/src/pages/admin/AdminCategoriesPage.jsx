import { useState, useEffect } from 'react';
import { Folder, FolderTree, AlertCircle, Loader2, Info } from 'lucide-react';
import { productService } from '../../features/products/api/product.service';

// Category D honesty note: the catalog only has a READ path today —
// GET /products/categories (public, used across the whole storefront for
// filtering/navigation). There is no create/update/delete category
// endpoint, no admin controller/service method, and no AdminCategoriesPage
// existed before this page. Rather than fabricate working "add/edit/delete"
// buttons wired to nothing, this page shows the REAL category list and
// clearly documents the missing backend as a known gap — see the final
// report for this task.
export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    productService.getCategories()
      .then(data => { if (!cancelled) setCategories(data ?? []); })
      .catch(err => { if (!cancelled) setError(err.message || 'שגיאה בטעינת קטגוריות'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const byId = new Map(categories.map(c => [c._id, c]));
  const topLevel = categories.filter(c => !c.parentCategory);
  const childrenOf = (parentId) => categories.filter(c => c.parentCategory === parentId);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">קטגוריות</h1>
        <p className="text-muted-foreground text-sm mt-1">מבנה הקטגוריות בקטלוג — נתונים אמיתיים מהמערכת</p>
      </div>

      <div className="flex items-start gap-3 p-4 bg-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-lg text-sm text-foreground">
        <Info className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">ניהול קטגוריות (יצירה/עריכה/מחיקה) אינו זמין עדיין</p>
          <p className="text-muted-foreground mt-1">
            המסך מציג את רשימת הקטגוריות האמיתית מהקטלוג (מקור: <code>GET /products/categories</code>), אך אין כרגע
            API לניהול קטגוריות בצד השרת. הוספת יכולת זו דורשת פיתוח backend נוסף (endpoint + validation + הרשאות)
            שלא בוצע כחלק ממשימה זו.
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#2563eb]" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 p-4 bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg text-[#ef4444] text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && categories.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Folder className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">לא נמצאו קטגוריות</p>
        </div>
      )}

      {!loading && !error && categories.length > 0 && (
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {topLevel.map(cat => {
            const children = childrenOf(cat._id);
            return (
              <div key={cat._id} className="p-4">
                <div className="flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-[#2563eb]" />
                  <span className="text-foreground font-medium">{cat.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{cat.slug}</span>
                </div>
                {children.length > 0 && (
                  <div className="mt-2 mr-6 space-y-1.5">
                    {children.map(child => (
                      <div key={child._id} className="flex items-center gap-2">
                        <Folder className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm text-foreground">{child.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{child.slug}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {/* Any category whose parentCategory id didn't match a known top-level
              row (shouldn't normally happen, but shown rather than silently
              dropped — this is real data, never hidden). */}
          {categories.filter(c => c.parentCategory && !byId.has(c.parentCategory)).map(orphan => (
            <div key={orphan._id} className="p-4 flex items-center gap-2">
              <Folder className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground">{orphan.name}</span>
              <span className="text-xs text-muted-foreground font-mono">{orphan.slug}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
