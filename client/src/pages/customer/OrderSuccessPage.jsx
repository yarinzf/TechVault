import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Crown, Receipt, Check, CreditCard, PackageOpen, Truck, Home,
  ShoppingBag, List, FileText, Printer, ArrowRight, Mail, LifeBuoy,
  MessageCircle, HelpCircle, Sparkles,
} from 'lucide-react';
import { orderService } from '../../features/orders/api/order.service';
import { productService } from '../../features/products/api/product.service';
import { PageSpinner } from '../../components/ui/Spinner/Spinner';
import RelatedProducts from '../../features/products/components/ProductDetails/RelatedProducts';
import Footer from '../../components/layout/customer/Footer';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../hooks/useAuth';
import { useCurrency } from '../../features/currency/hooks/useCurrency';
import { openSupportChat } from '../../utils/openSupportChat';
import { getEstimatedDelivery } from '../../features/orders/estimatedDelivery';
import { downloadReceipt } from '../../features/orders/receipt';
import {
  getBadgeBucket, BADGE_ICON, BADGE_LABEL_KEY, getTimelineSteps,
  isMembershipOnlyOrder, getPaymentLabel, formatShippingAddress,
} from '../../features/orders/orderPresentation';
import s from './OrderSuccessPage.module.css';

// 5 icons mirroring Sapir's timeline (check/package-open/box/truck/home) —
// mapped onto the app's real 5 stages (received/paid/preparing/shipped/
// delivered; see orderPresentation.js for why "Packed" has no backend
// equivalent and is omitted rather than faked).
const TIMELINE_ICON = {
  received:  Check,
  paid:      CreditCard,
  preparing: PackageOpen,
  shipped:   Truck,
  delivered: Home,
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 72 72" className={s.checkSvg} aria-hidden="true" focusable="false">
      <circle cx="36" cy="36" r="33" className={s.circleRing} />
      <polyline points="20,38 31,50 53,26" className={s.checkMark} />
    </svg>
  );
}

export default function OrderSuccessPage() {
  const { orderId } = useParams();
  const navigate     = useNavigate();
  const { t, language } = useLanguage();
  const { refreshProfile } = useAuth();
  const { formatPrice }    = useCurrency('Israel');
  const didRefresh = useRef(false);

  const [order,   setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const [recs,    setRecs]    = useState([]);

  useEffect(() => {
    if (!orderId) { setError(true); setLoading(false); return; }
    orderService.getById(orderId)
      .then(data => {
        if (!data) { setError(true); } else { setOrder(data); }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [orderId]);

  // The checkout flow already calls refreshProfile() right after payment
  // confirmation, so membership.status is normally already 'active' by the
  // time this page renders. This is a safety net for any path that lands
  // here without having done that (e.g. a direct link) — runs at most once.
  useEffect(() => {
    if (didRefresh.current) return;
    if (order && isMembershipOnlyOrder(order)) {
      didRefresh.current = true;
      refreshProfile().catch(() => {});
    }
  }, [order, refreshProfile]);

  // Real recommendation engine (features/products/api/product.service.js →
  // GET /products/:id/recommendations), seeded from the first physical
  // product actually purchased — never a fabricated/random product list.
  useEffect(() => {
    const firstItem  = (order?.items ?? []).find(i => i.itemType !== 'membership' && i.product);
    const productId  = typeof firstItem?.product === 'object' ? firstItem.product._id : firstItem?.product;
    if (!productId) return;
    productService.getRecommendations(productId).then(r => setRecs(r.related ?? []));
  }, [order]);

  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString(language === 'en' ? 'en-US' : 'he-IL', { year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) return <PageSpinner />;

  if (error || !order) {
    return (
      <div className={s.page}>
        <div className={s.osPage}>
          <div className={s.errorState}>
            <div className={s.errorIcon} aria-hidden="true">✕</div>
            <h2 className={s.errorHeading}>{t('order.not_found')}</h2>
            <p className={s.errorBody}>{t('order.not_found_body')}</p>
            <button className={s.btnPrimary} onClick={() => navigate('/orders')}>{t('order.my_orders_btn')}</button>
          </div>
        </div>
      </div>
    );
  }

  const addr           = order.shippingAddress;
  const paymentLabel   = getPaymentLabel(order, t);
  const isMembership   = isMembershipOnlyOrder(order);
  const bucket         = getBadgeBucket(order.status);
  const BadgeIcon      = BADGE_ICON[bucket];
  const showTimeline   = !isMembership && !['cancelled', 'delivered'].includes(order.status);
  const isPickup       = order.shippingMethod === 'store_pickup';
  const shippingCost   = order.shippingCost ?? 0;
  const couponDiscount = order.couponDiscount ?? 0;
  const pointsValue    = order.pointsRedeemedValue ?? 0;
  const hasPhysicalItems = (order.items ?? []).some(i => i.itemType !== 'membership');
  const deliveryEstimate = !isMembership ? getEstimatedDelivery(order, t, language) : null;
  const formattedAddress = !isMembership && !isPickup ? formatShippingAddress(addr, language, t) : null;

  const handleDownloadInvoice = () => {
    downloadReceipt(order, { t, formatPrice, paymentLabel, fmtDate });
  };

  return (
    <div className={s.page}>

      {/* BREADCRUMB strip — full-viewport-width, matching the same
          .page/.breadcrumbStrip/.breadcrumbInner shell every other real
          storefront page uses (WishlistPage, DealsPage, etc.) — NOT nested
          inside the narrow 820px .osPage content wrapper. */}
      <div className={s.breadcrumbStrip}>
        <div className={s.breadcrumbInner}>
          <Link to="/" className={s.bcLink}><ArrowRight size={13} /> {t('profile.breadcrumb_home')}</Link>
          <span className={s.bcSep}>›</span>
          <span className={s.bcCurrent}>{t('order.success.breadcrumb_current')}</span>
        </div>
      </div>

      <div className={s.osPage}>

        {/* HERO */}
        <div className={s.hero}>
          <div className={s.iconWrap}>
            {isMembership
              ? <Crown size={36} className={s.iconGlyph} style={{ color: 'var(--sv-violet)' }} />
              : <CheckIcon />}
          </div>
          {isMembership ? (
            <>
              <h1 className={s.title}>ברוכים הבאים למועדון TechVault</h1>
              <p className={s.subtitle}>חברות המועדון שלך פעילה וכל ההטבות זמינות כבר עכשיו.</p>
            </>
          ) : (
            <>
              <h1 className={s.title}><span className={s.titleEmoji}>🎉</span> {t('order.success_heading')}</h1>
              <p className={s.subtitle}>{t('order.success_subtitle')}</p>
            </>
          )}
        </div>

        {/* ORDER INFO — Sapir's exact field order: order number, status,
            order date, estimated delivery, payment method, address. */}
        <div className={s.card}>
          <div className={s.cardTitle}><Receipt size={16} /> {t('order.success.info_title')}</div>
          <div className={s.infoGrid}>
            <div className={`${s.infoItem} ${s.orderNumItem}`}>
              <div className={s.infoLabel}>{t('order.details.order_number')}</div>
              <div className={`${s.infoVal} ${s.orderNum}`}>#{order.orderNumber}</div>
            </div>
            <div className={s.infoItem}>
              <div className={s.infoLabel}>{t('order.status_label')}</div>
              <div className={s.infoVal}>
                <span className={`${s.statusBadge} ${s[bucket]}`}>
                  <BadgeIcon size={12} /> {t(BADGE_LABEL_KEY[bucket])}
                </span>
              </div>
            </div>
            <div className={s.infoItem}>
              <div className={s.infoLabel}>{t('order.success.order_date_label')}</div>
              <div className={s.infoVal}>{fmtDate(order.createdAt)}</div>
            </div>
            {!isMembership && deliveryEstimate && (
              <div className={s.infoItem}>
                <div className={s.infoLabel}>{t('order.success.delivery_label')}</div>
                <div className={s.infoVal}>{deliveryEstimate}</div>
              </div>
            )}
            <div className={s.infoItem}>
              <div className={s.infoLabel}>{t('order.payment_method')}</div>
              <div className={s.infoVal}>{paymentLabel}</div>
            </div>
            {isMembership ? (
              <div className={s.infoItem}>
                <div className={s.infoLabel}>סטטוס חברות</div>
                <div className={s.infoVal} style={{ color: 'var(--sv-success)' }}>פעילה</div>
              </div>
            ) : !isPickup && addr?.street ? (
              <div className={s.infoItem}>
                <div className={s.infoLabel}>{t('order.shipping_address')}</div>
                <div className={s.infoVal}>
                  {formattedAddress.mainLine}
                  {formattedAddress.postalLine && <><br />{formattedAddress.postalLine}</>}
                </div>
              </div>
            ) : isPickup ? (
              <div className={s.infoItem}>
                <div className={s.infoLabel}>{t('order.shipping_address')}</div>
                <div className={s.infoVal}>{t('order.shipping_pickup_note')}</div>
              </div>
            ) : null}
          </div>
        </div>

        {/* TRACKING */}
        {showTimeline && (
          <div className={s.card}>
            <div className={s.cardTitle}><Truck size={16} /> {t('order.details.progress_title')}</div>
            <div className={s.timeline}>
              {getTimelineSteps(order).map((step) => {
                const Icon = TIMELINE_ICON[step.key];
                return (
                  <div key={step.key} className={`${s.step} ${step.done ? s.done : ''} ${step.current ? s.current : ''}`}>
                    <div className={s.stepIcon}><Icon size={16} /></div>
                    <div className={s.stepLabel}>{t(`order.timeline.${step.key}`)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PRODUCTS — Sapir's exact card, with the real monetary breakdown
            folded in above the final total, per her own "מוצרים שהוזמנו"
            structure (no separate standalone payment-details card). */}
        <div className={s.card}>
          <div className={s.cardTitle}><ShoppingBag size={16} /> {t('order.success.products_title')}</div>
          <div className={s.prodList}>
            {(order.items ?? []).map((item, i) => (
              <div key={i} className={s.prodItem}>
                <div className={s.prodImg}>
                  {item.image
                    ? <img src={item.image} alt={item.name} />
                    : (item.itemType === 'membership' ? <Crown size={26} /> : <ShoppingBag size={26} />)}
                </div>
                <div className={s.prodInfo}>
                  {item.brand && <div className={s.prodBrand}>{item.brand}</div>}
                  <div className={s.prodName}>{item.name}</div>
                  <div className={s.prodQty}>{t('order.details.qty_label')} {item.quantity}</div>
                </div>
                <div className={s.prodPrice}>{formatPrice((item.unitPrice ?? 0) * item.quantity)}</div>
              </div>
            ))}
          </div>

          {/* Real breakdown — only the rows that actually apply to this
              order, from the persisted Order snapshot (never recalculated).
              Sapir's own reference doesn't itemize a breakdown here, but
              only shows a flat total — a plain "campaign discount" row from
              her example wording is intentionally omitted: Order.js does
              not persist a separate campaign/sale discount amount (a
              product's campaign price is already baked into the snapshot
              unitPrice at checkout, so there is no real distinct value to
              show — see final report). */}
          <div className={s.breakdown}>
            <div className={s.breakdownRow}>
              <span>{t('order.success.subtotal_label')}</span><span>{formatPrice(order.subtotal ?? 0)}</span>
            </div>
            {couponDiscount > 0 && (
              <div className={`${s.breakdownRow} ${s.discount}`}>
                <span>{t('checkout.coupon_discount')}</span><span>{'-'}{formatPrice(couponDiscount)}</span>
              </div>
            )}
            {pointsValue > 0 && (
              <div className={`${s.breakdownRow} ${s.discount}`}>
                <span>{t('order.points_redeemed')}</span><span>{'-'}{formatPrice(pointsValue)}</span>
              </div>
            )}
            {hasPhysicalItems && (
              <div className={s.breakdownRow}>
                <span>{t('checkout.shipping')}</span>
                <span>{shippingCost === 0 ? t('checkout.free') : formatPrice(shippingCost)}</span>
              </div>
            )}
          </div>
          <div className={s.totalRow}>
            <span className={s.totalLabel}>{t('order.total')}</span>
            <span className={s.totalVal}>{formatPrice(order.total ?? 0)}</span>
          </div>
        </div>

        {/* ACTIONS — Sapir's exact 4-button set: My Orders + Download
            Invoice (priority row), Continue Shopping + Print (outline row). */}
        {isMembership ? (
          <div className={s.actions}>
            <div className={s.btnRowPriority}>
              <button className={s.btnPriority} onClick={() => navigate('/club')}>
                <Crown size={15} /> למועדון שלי
              </button>
              <button className={s.btnPriority} onClick={() => navigate('/profile')}>
                <List size={15} /> העדפות התראות
              </button>
            </div>
            <div className={s.btnRow}>
              <button className={s.btnOutline} onClick={() => navigate('/products')}>
                <ArrowRight size={14} /> {t('order.continue_shopping')}
              </button>
            </div>
          </div>
        ) : (
          <div className={s.actions}>
            <div className={s.btnRowPriority}>
              <button className={s.btnPriority} onClick={() => navigate('/orders')}>
                <List size={15} /> {t('order.all_orders')}
              </button>
              <button className={s.btnPriority} onClick={handleDownloadInvoice}>
                <FileText size={15} /> {t('order.success.download_invoice_btn')}
              </button>
            </div>
            <div className={s.btnRow}>
              <button className={s.btnOutline} onClick={() => navigate('/products')}>
                <ArrowRight size={14} /> {t('order.continue_shopping')}
              </button>
              <button className={s.btnOutline} onClick={() => window.print()}>
                <Printer size={14} /> {t('order.success.print_btn')}
              </button>
            </div>
          </div>
        )}

        {/* EMAIL + SUPPORT — both buttons open the SAME global chatbot
            (openSupportChat), exactly like Sapir's own reference calls the
            identical swOpen() for both "צור קשר" and "מרכז השירות". */}
        <div className={s.footerCards}>
          <div className={s.infoCard}>
            <div className={`${s.infoCardIcon} ${s.mail}`}><Mail size={18} /></div>
            <div>
              <div className={s.infoCardTitle}>{t('order.success.email_title')}</div>
              <div className={s.infoCardDesc}>{t('order.success.email_desc')}</div>
            </div>
          </div>
          <div className={s.infoCard}>
            <div className={`${s.infoCardIcon} ${s.support}`}><LifeBuoy size={18} /></div>
            <div>
              <div className={s.infoCardTitle}>{t('order.success.support_title')}</div>
              <div className={s.infoCardDesc}>{t('order.success.support_desc')}</div>
              <div className={s.supportBtns}>
                <button className={s.supportBtn} onClick={openSupportChat}>
                  <MessageCircle size={11} /> {t('order.success.contact_btn')}
                </button>
                <button className={s.supportBtn} onClick={openSupportChat}>
                  <HelpCircle size={11} /> {t('order.success.help_center_btn')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RECOMMENDATIONS — real products from the recommendation engine,
            seeded from an item in this order; hidden entirely when there is
            nothing real to show (never a fabricated fallback). */}
        {recs.length > 0 && (
          <div className={s.recs}>
            <div className={s.recsTitle}><Sparkles size={15} /> {t('order.success.recs_title')}</div>
            <RelatedProducts products={recs} />
          </div>
        )}

      </div>

      <Footer />
    </div>
  );
}
