import { useState } from 'react';
import { useCart } from '../../../hooks/useCart';
import { useToast } from '../../../hooks/useToast';
import { useTranslation } from '../../../context/LanguageContext';

// Shared by OrdersPage's card actions and OrderDetailsPage's action row —
// reorder currently-purchasable physical items back into the real cart via
// the same server-validated addItem() the rest of the storefront uses, so
// deleted/unpublished/out-of-stock items fail per-item rather than silently
// "succeeding". Membership purchases are never re-added.
export function useReorder() {
  const { addItem } = useCart();
  const { toast } = useToast();
  const t = useTranslation();
  const [reorderingId, setReorderingId] = useState(null);

  const reorder = async (order) => {
    const productItems = (order.items ?? []).filter((item) => item.itemType !== 'membership');
    if (productItems.length === 0) return;

    setReorderingId(order._id);
    let succeeded = 0;
    let failed = 0;
    for (const item of productItems) {
      const productId = item.product?._id ?? item.product;
      if (!productId) { failed++; continue; }
      try {
        await addItem(productId, item.quantity);
        succeeded++;
      } catch {
        failed++;
      }
    }
    setReorderingId(null);

    if (succeeded > 0 && failed === 0) toast.success(t('order.reorder_success'));
    else if (succeeded > 0 && failed > 0) toast.info(t('order.reorder_partial'));
    else toast.error(t('order.reorder_fail'));
  };

  return { reorder, reorderingId };
}
