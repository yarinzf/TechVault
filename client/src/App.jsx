import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AUTH_STATUS } from './app/providers/AuthProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { trackVisit } from './utils/analyticsTracking';

import CustomerLayout from './components/layout/customer/CustomerLayout';
import HomePage from './pages/customer/HomePage';
import CatalogPage from './pages/customer/CatalogPage';
import ProductDetailsPage from './pages/customer/ProductDetailsPage';
import NotFoundPage from './pages/shared/NotFoundPage';

// ─── Lazy: auth pages ────────────────────────────────────────────────────────
const LoginPage          = lazy(() => import('./pages/shared/LoginPage'));
const RegisterPage       = lazy(() => import('./pages/shared/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/shared/ForgotPasswordPage'));
const ResetPasswordPage  = lazy(() => import('./pages/shared/ResetPasswordPage'));

// ─── Lazy: customer pages (behind auth) ──────────────────────────────────────
const CartPage           = lazy(() => import('./pages/customer/CartPage'));
const CheckoutPage       = lazy(() => import('./pages/customer/CheckoutPage'));
const OrdersPage         = lazy(() => import('./pages/customer/OrdersPage'));
const OrderDetailsPage   = lazy(() => import('./pages/customer/OrderDetailsPage'));
const OrderSuccessPage   = lazy(() => import('./pages/customer/OrderSuccessPage'));
const ClubPage               = lazy(() => import('./pages/customer/ClubPage'));
const DealsPage               = lazy(() => import('./pages/customer/DealsPage'));
const NewArrivalsPage          = lazy(() => import('./pages/customer/NewArrivalsPage'));
const BestSellersPage          = lazy(() => import('./pages/customer/BestSellersPage'));
const MembershipCheckoutPage = lazy(() => import('./pages/customer/MembershipCheckoutPage'));
const ProfilePage        = lazy(() => import('./pages/customer/ProfilePage'));
const WishlistPage       = lazy(() => import('./pages/customer/WishlistPage'));
const ComparePage        = lazy(() => import('./pages/customer/ComparePage'));
const TermsPage          = lazy(() => import('./pages/shared/TermsPage'));
const PrivacyPage        = lazy(() => import('./pages/shared/PrivacyPage'));

// ─── Lazy: admin pages (business management) ─────────────────────────────────
const AdminLayout             = lazy(() => import('./components/layout/admin/AdminLayout'));
const AdminDashboardPage      = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminOrdersPage         = lazy(() => import('./pages/admin/AdminOrdersPage'));
const AdminProductsPage       = lazy(() => import('./pages/admin/AdminProductsPage'));
const AdminCategoriesPage     = lazy(() => import('./pages/admin/AdminCategoriesPage'));
const AdminReportsPage        = lazy(() => import('./pages/admin/AdminReportsPage'));
const AdminAlertsPage         = lazy(() => import('./pages/admin/AdminAlertsPage'));
const AdminCampaignsPage      = lazy(() => import('./pages/admin/AdminCampaignsPage'));
const AdminCouponsPage        = lazy(() => import('./pages/admin/AdminCouponsPage'));
const AdminClubPage           = lazy(() => import('./pages/admin/AdminClubPage'));
const AdminSettingsPage       = lazy(() => import('./pages/admin/AdminSettingsPage'));
const AdminActivityPage       = lazy(() => import('./pages/admin/AdminActivityPage'));
const AdminReturnsPage        = lazy(() => import('./pages/admin/AdminReturnsPage'));

// ─── Lazy: warehouse pages (fulfillment / logistics) ─────────────────────────
const WarehouseDashboardPage  = lazy(() => import('./pages/warehouse/WarehouseDashboardPage'));
const WarehouseOrdersPage     = lazy(() => import('./pages/warehouse/WarehouseOrdersPage'));
const AdminInventoryPage      = lazy(() => import('./pages/admin/AdminInventoryPage')); // "ניהול מלאי" — see App.jsx routing note below
const SupplierOrdersPage      = lazy(() => import('./pages/warehouse/SupplierOrdersPage'));
const StockAlertsPage         = lazy(() => import('./pages/warehouse/StockAlertsPage'));
const BarcodeScannerPage      = lazy(() => import('./pages/warehouse/BarcodeScannerPage'));
const WarehouseReturnsPage    = lazy(() => import('./pages/warehouse/WarehouseReturnsPage'));
const WarehouseSettingsPage   = lazy(() => import('./pages/warehouse/WarehouseSettingsPage'));

// ─── Lazy: super admin pages (platform / system) ──────────────────────────────
const SuperAdminDashboardPage = lazy(() => import('./pages/superadmin/SuperAdminDashboardPage'));
const AdminUsersPage          = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminSystemStatusPage   = lazy(() => import('./pages/admin/AdminSystemStatusPage'));
const SuperAdminSecurityPage  = lazy(() => import('./pages/superadmin/SuperAdminSecurityPage'));
const SuperAdminAuditPage     = lazy(() => import('./pages/superadmin/SuperAdminAuditPage'));
const SuperAdminSettingsPage  = lazy(() => import('./pages/superadmin/SuperAdminSettingsPage'));

import AccessibilityWidget from './components/ui/AccessibilityWidget/AccessibilityWidget';

// ─── Route guards ─────────────────────────────────────────────────────────────
// These consult `authStatus`, NOT plain `user` truthiness — a transient
// bootstrap failure (429/5xx/network error on /auth/me) resolves to
// 'unknown', never 'guest' (see AuthProvider.jsx). Treating 'unknown' the
// same as logged-out here would redirect a genuinely authenticated user
// (whose token is still perfectly valid) to /login just because their
// profile couldn't be confirmed on this one page load — exactly the bug
// this guard design exists to prevent. 'unknown' renders the same pending
// state as the initial `loading` window: stay put, don't decide yet.
export const RequireAuth = ({ children }) => {
  const { loading, authStatus } = useAuth();
  const location = useLocation();
  if (loading || authStatus === AUTH_STATUS.UNKNOWN) return <PageLoader />;
  return authStatus === AUTH_STATUS.AUTHENTICATED
    ? children
    : <Navigate to="/login" state={{ from: location }} replace />;
};

export const RequireAdmin = ({ children }) => {
  const { user, loading, authStatus } = useAuth();
  if (loading || authStatus === AUTH_STATUS.UNKNOWN) return <PageLoader />;
  if (authStatus !== AUTH_STATUS.AUTHENTICATED) return <Navigate to="/login" replace />;
  if (!['admin', 'superadmin'].includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

export const RequireWarehouse = ({ children }) => {
  const { user, loading, authStatus } = useAuth();
  if (loading || authStatus === AUTH_STATUS.UNKNOWN) return <PageLoader />;
  if (authStatus !== AUTH_STATUS.AUTHENTICATED) return <Navigate to="/login" replace />;
  if (!['warehouse', 'admin', 'superadmin'].includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

// Dedicated Super Admin area (platform/system: users & roles, system status,
// security, privileged audit, system settings) — superadmin only. Admin and
// warehouse are NOT included here, unlike RequireAdmin/RequireWarehouse
// above, since this area is intentionally exclusive (see role architecture
// reorg — Super Admin inherits Admin/Warehouse access via the *other* two
// route trees, not this one).
export const RequireSuperadmin = ({ children }) => {
  const { user, loading, authStatus } = useAuth();
  if (loading || authStatus === AUTH_STATUS.UNKNOWN) return <PageLoader />;
  if (authStatus !== AUTH_STATUS.AUTHENTICATED) return <Navigate to="/login" replace />;
  if (user.role !== 'superadmin') return <Navigate to="/" replace />;
  return children;
};

// Redirects an old category URL to its canonical slug, preserving any query
// string (filters, sort, etc.) — see server/config/categoryTaxonomy.js.
const CategoryRedirect = ({ to }) => {
  const location = useLocation();
  return <Navigate to={`/category/${to}${location.search}`} replace />;
};

const GuestOnly = ({ children }) => {
  const { loading, authStatus } = useAuth();
  const location = useLocation();
  if (loading || authStatus === AUTH_STATUS.UNKNOWN) return <PageLoader />;
  // Honors the `from` location RequireAuth attaches when it bounces a guest
  // here (e.g. guest → /club/join → /login → back to /club/join after login).
  return authStatus !== AUTH_STATUS.AUTHENTICATED
    ? children
    : <Navigate to={location.state?.from ?? '/'} replace />;
};

const PageLoader = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-background gap-3" role="status">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    <span className="text-sm text-muted-foreground">טוען...</span>
  </div>
);

// Fires the real-traffic beacon on every storefront route change — never for
// /admin or /admin/superadmin (staff browsing their own tools is not a
// storefront "session" and would distort the conversion-rate denominator).
// See client/src/utils/analyticsTracking.js.
const useStorefrontTracking = () => {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) return;
    const isProductPage = location.pathname.startsWith('/products/');
    trackVisit(isProductPage);
  }, [location.pathname]);
};

export default function App() {
  useStorefrontTracking();
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* ── Public auth routes ── */}
          <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
          <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
          <Route path="/reset-password" element={<GuestOnly><ResetPasswordPage /></GuestOnly>} />

          {/* ── Legal pages ── */}
          <Route element={<CustomerLayout />}>
            <Route path="/terms"   element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
          </Route>

          {/* ── Main storefront ── */}
          <Route element={<CustomerLayout />}>
            <Route index element={<HomePage />} />
            <Route path="/products" element={<CatalogPage />} />
            {/* Legacy category slugs — renamed during the catalog hierarchy
                migration (see server/config/categoryTaxonomy.js). Static
                paths outrank the :categorySlug route below regardless of
                declaration order, so these always win for these two slugs. */}
            <Route path="/category/components" element={<CategoryRedirect to="pc-components" />} />
            <Route path="/category/headphones" element={<CategoryRedirect to="headsets" />} />
            <Route path="/category/:categorySlug" element={<CatalogPage />} />
            <Route path="/products/:slug" element={<ProductDetailsPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
            <Route path="/order-success/:orderId" element={<RequireAuth><OrderSuccessPage /></RequireAuth>} />
            <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
            <Route path="/orders/:orderId" element={<RequireAuth><OrderDetailsPage /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="/wishlist" element={<RequireAuth><WishlistPage /></RequireAuth>} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/deals" element={<DealsPage />} />
            <Route path="/new" element={<NewArrivalsPage />} />
            <Route path="/best-sellers" element={<BestSellersPage />} />
            <Route path="/club" element={<ClubPage />} />
            <Route path="/club/join" element={<RequireAuth><MembershipCheckoutPage /></RequireAuth>} />
          </Route>

          {/* ── Warehouse ── canonical workspace is /admin/inventory ── */}
          <Route path="/warehouse" element={<Navigate to="/admin/inventory" replace />} />
          <Route path="/warehouse/*" element={<Navigate to="/admin/inventory" replace />} />

          {/* ── Admin panel (business management — commerce, catalog, ── */}
          {/*    promotions, refunds, membership, analytics)          ── */}
          <Route path="/admin" element={<RequireAdmin><ErrorBoundary title="שגיאה בפאנל ניהול"><AdminLayout /></ErrorBoundary></RequireAdmin>}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="products" element={<AdminProductsPage />} />
            <Route path="categories" element={<AdminCategoriesPage />} />
            <Route path="campaigns" element={<AdminCampaignsPage />} />
            <Route path="coupons" element={<AdminCouponsPage />} />
            <Route path="returns" element={<AdminReturnsPage />} />
            <Route path="club" element={<AdminClubPage />} />
            <Route path="analytics" element={<AdminReportsPage />} />
            <Route path="alerts" element={<AdminAlertsPage />} />
            <Route path="audit-log" element={<AdminActivityPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>

          {/* ── Warehouse workspace (fulfillment/logistics only — no ── */}
          {/*    business- or system-administration capability)      ── */}
          <Route path="/admin/inventory" element={<RequireWarehouse><ErrorBoundary title="שגיאה באזור המחסן"><AdminLayout /></ErrorBoundary></RequireWarehouse>}>
            <Route index element={<WarehouseDashboardPage />} />
            <Route path="orders" element={<WarehouseOrdersPage />} />
            <Route path="manage" element={<AdminInventoryPage />} />
            <Route path="supplier-orders" element={<SupplierOrdersPage />} />
            <Route path="stock-alerts" element={<StockAlertsPage />} />
            <Route path="barcode-scanner" element={<BarcodeScannerPage />} />
            <Route path="returns" element={<WarehouseReturnsPage />} />
            <Route path="settings" element={<WarehouseSettingsPage />} />
          </Route>

          {/* ── Super Admin area (platform/system only — superadmin ── */}
          {/*    inherits Admin + Warehouse access via the two route ── */}
          {/*    trees above; this tree is never nested under /admin ── */}
          {/*    so it isn't reachable by a plain admin/warehouse user) ── */}
          <Route path="/admin/superadmin" element={<RequireSuperadmin><ErrorBoundary title="שגיאה באזור מנהל ראשי"><AdminLayout /></ErrorBoundary></RequireSuperadmin>}>
            <Route index element={<SuperAdminDashboardPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="system-status" element={<AdminSystemStatusPage />} />
            <Route path="security" element={<SuperAdminSecurityPage />} />
            <Route path="audit" element={<SuperAdminAuditPage />} />
            <Route path="settings" element={<SuperAdminSettingsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>

      <AccessibilityWidget />
    </ErrorBoundary>
  );
}
