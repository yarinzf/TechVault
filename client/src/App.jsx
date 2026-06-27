import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';

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
const OrderSuccessPage   = lazy(() => import('./pages/customer/OrderSuccessPage'));
const ProfilePage        = lazy(() => import('./pages/customer/ProfilePage'));
const WishlistPage       = lazy(() => import('./pages/customer/WishlistPage'));
const TermsPage          = lazy(() => import('./pages/shared/TermsPage'));
const PrivacyPage        = lazy(() => import('./pages/shared/PrivacyPage'));

// ─── Lazy: admin pages ──────────────────────────────────────────────────────
const AdminLayout             = lazy(() => import('./components/layout/admin/AdminLayout'));
const AdminDashboardPage      = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminOrdersPage         = lazy(() => import('./pages/admin/AdminOrdersPage'));
const AdminProductsPage       = lazy(() => import('./pages/admin/AdminProductsPage'));
const AdminCustomersPage      = lazy(() => import('./pages/admin/AdminCustomersPage'));
const AdminReportsPage        = lazy(() => import('./pages/admin/AdminReportsPage'));
const AdminAlertsPage         = lazy(() => import('./pages/admin/AdminAlertsPage'));
const AdminCampaignsPage      = lazy(() => import('./pages/admin/AdminCampaignsPage'));
const AdminCouponsPage        = lazy(() => import('./pages/admin/AdminCouponsPage'));
const AdminSettingsPage       = lazy(() => import('./pages/admin/AdminSettingsPage'));
const AdminActivityPage       = lazy(() => import('./pages/admin/AdminActivityPage'));
const AdminInventoryPage      = lazy(() => import('./pages/admin/AdminInventoryPage'));
const AdminUsersPage          = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminReturnsPage        = lazy(() => import('./pages/admin/AdminReturnsPage'));
const AdminSystemStatusPage   = lazy(() => import('./pages/admin/AdminSystemStatusPage'));

// ─── Lazy: warehouse pages ──────────────────────────────────────────────────
const WarehouseAlertsPage     = lazy(() => import('./pages/warehouse/WarehouseAlertsPage'));
const WarehouseProductsPage   = lazy(() => import('./pages/warehouse/WarehouseProductsPage'));
const WarehouseOrdersPage     = lazy(() => import('./pages/warehouse/WarehouseOrdersPage'));
const WarehouseInventoryPage  = lazy(() => import('./pages/warehouse/WarehouseInventoryPage'));
const SupplierOrdersPage      = lazy(() => import('./pages/warehouse/SupplierOrdersPage'));
const StockAlertsPage         = lazy(() => import('./pages/warehouse/StockAlertsPage'));
const BarcodeScannerPage      = lazy(() => import('./pages/warehouse/BarcodeScannerPage'));
const WarehouseSettingsPage   = lazy(() => import('./pages/warehouse/WarehouseSettingsPage'));

import AccessibilityWidget from './components/ui/AccessibilityWidget/AccessibilityWidget';

// ─── Route guards ─────────────────────────────────────────────────────────────
const RequireAuth = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  return user ? children : <Navigate to="/login" state={{ from: location }} replace />;
};

const RequireAdmin = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!['admin', 'superadmin'].includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

const RequireWarehouse = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!['warehouse', 'admin', 'superadmin'].includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

const GuestOnly = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return !user ? children : <Navigate to="/" replace />;
};

const PageLoader = () => (
  <div className="flex items-center justify-center h-screen bg-background">
    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

export default function App() {
  return (
    <>
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
            <Route path="/category/:categorySlug" element={<CatalogPage />} />
            <Route path="/products/:slug" element={<ProductDetailsPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
            <Route path="/order-success/:orderId" element={<RequireAuth><OrderSuccessPage /></RequireAuth>} />
            <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="/wishlist" element={<RequireAuth><WishlistPage /></RequireAuth>} />
          </Route>

          {/* ── Warehouse ── canonical workspace is /admin/inventory ── */}
          <Route path="/warehouse" element={<Navigate to="/admin/inventory" replace />} />
          <Route path="/warehouse/*" element={<Navigate to="/admin/inventory" replace />} />

          {/* ── Admin panel ── */}
          <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="products" element={<AdminProductsPage />} />
            <Route path="customers" element={<AdminCustomersPage />} />
            <Route path="analytics" element={<AdminReportsPage />} />
            <Route path="alerts" element={<AdminAlertsPage />} />
            <Route path="campaigns" element={<AdminCampaignsPage />} />
            <Route path="coupons" element={<AdminCouponsPage />} />
            <Route path="returns" element={<AdminReturnsPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
            <Route path="audit-log" element={<AdminActivityPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="system-status" element={<AdminSystemStatusPage />} />
          </Route>

          {/* ── Inventory workspace (warehouse + admin + superadmin) ── */}
          <Route path="/admin/inventory" element={<RequireWarehouse><AdminLayout /></RequireWarehouse>}>
            <Route index element={<AdminInventoryPage />} />
            <Route path="orders" element={<WarehouseOrdersPage />} />
            <Route path="manage" element={<WarehouseInventoryPage />} />
            <Route path="alerts" element={<WarehouseAlertsPage />} />
            <Route path="products" element={<WarehouseProductsPage />} />
            <Route path="supplier-orders" element={<SupplierOrdersPage />} />
            <Route path="stock-alerts" element={<StockAlertsPage />} />
            <Route path="barcode-scanner" element={<BarcodeScannerPage />} />
            <Route path="settings" element={<WarehouseSettingsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>

      <AccessibilityWidget />
    </>
  );
}
