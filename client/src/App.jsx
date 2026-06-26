import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';

import CustomerLayout from './components/layout/customer/CustomerLayout';
import AdminLayout from './components/layout/admin/AdminLayout';
import LoginPage from './pages/shared/LoginPage';
import RegisterPage from './pages/shared/RegisterPage';
import ForgotPasswordPage from './pages/shared/ForgotPasswordPage';
import ResetPasswordPage from './pages/shared/ResetPasswordPage';
import TermsPage from './pages/shared/TermsPage';
import PrivacyPage from './pages/shared/PrivacyPage';
import NotFoundPage from './pages/shared/NotFoundPage';
import HomePage from './pages/customer/HomePage';
import CatalogPage from './pages/customer/CatalogPage';
import ProductDetailsPage from './pages/customer/ProductDetailsPage';
import CartPage from './pages/customer/CartPage';
import CheckoutPage from './pages/customer/CheckoutPage';
import OrdersPage from './pages/customer/OrdersPage';
import OrderSuccessPage from './pages/customer/OrderSuccessPage';
import ProfilePage from './pages/customer/ProfilePage';
import WishlistPage from './pages/customer/WishlistPage';

// ─── Admin pages ──────────────────────────────────────────────────────────────
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminOrdersPage from './pages/admin/AdminOrdersPage';
import AdminProductsPage from './pages/admin/AdminProductsPage';
import AdminCustomersPage from './pages/admin/AdminCustomersPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminAlertsPage from './pages/admin/AdminAlertsPage';
import AdminCampaignsPage from './pages/admin/AdminCampaignsPage';
import AdminCouponsPage from './pages/admin/AdminCouponsPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import AdminActivityPage from './pages/admin/AdminActivityPage';
import AdminInventoryPage from './pages/admin/AdminInventoryPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminReturnsPage from './pages/admin/AdminReturnsPage';
import AdminSystemStatusPage from './pages/admin/AdminSystemStatusPage';
import WarehouseAlertsPage from './pages/warehouse/WarehouseAlertsPage';
import WarehouseProductsPage from './pages/warehouse/WarehouseProductsPage';
import WarehouseOrdersPage from './pages/warehouse/WarehouseOrdersPage';
import WarehouseInventoryPage from './pages/warehouse/WarehouseInventoryPage';
import SupplierOrdersPage from './pages/warehouse/SupplierOrdersPage';
import StockAlertsPage from './pages/warehouse/StockAlertsPage';
import BarcodeScannerPage from './pages/warehouse/BarcodeScannerPage';
import WarehouseSettingsPage from './pages/warehouse/WarehouseSettingsPage';

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

export default function App() {
  return (
    <>
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

      {/* Global floating accessibility widget — renders on all routes */}
      <AccessibilityWidget />
    </>
  );
}
