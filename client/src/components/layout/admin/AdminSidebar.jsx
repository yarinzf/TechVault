import { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Archive,
  Users,
  UserCog,
  BarChart3,
  Settings,
  Menu,
  ClipboardList,
  AlertTriangle,
  Barcode,
  Bell,
  ExternalLink,
  Activity,
  Tag,
  Ticket,
  RotateCcw,
  Server,
} from 'lucide-react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { useTranslation } from '../../../context/LanguageContext';

export default function AdminSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user: authUser } = useAuth();
  const t = useTranslation();

  const BASE_ADMIN_ITEMS = [
    { icon: LayoutDashboard, label: t('sidebar.dashboard'),  path: '/admin',            end: true },
    { icon: Bell,            label: t('sidebar.alerts'),     path: '/admin/alerts' },
    { icon: Activity,        label: t('sidebar.activity'),   path: '/admin/audit-log' },
    { icon: ShoppingCart,    label: t('sidebar.orders'),     path: '/admin/orders' },
    { icon: Package,         label: t('sidebar.products'),   path: '/admin/products' },
    { icon: Users,           label: t('sidebar.customers'),  path: '/admin/customers' },
    { icon: Tag,             label: t('sidebar.campaigns'),  path: '/admin/campaigns' },
    { icon: Ticket,          label: t('sidebar.coupons'),    path: '/admin/coupons' },
    { icon: RotateCcw,       label: t('sidebar.returns'),    path: '/admin/returns' },
    { icon: BarChart3,       label: t('sidebar.reports'),        path: '/admin/analytics' },
    { icon: Server,          label: t('sidebar.system_status'), path: '/admin/system-status' },
    { icon: Settings,        label: t('sidebar.settings'),      path: '/admin/settings' },
  ];

  const SUPERADMIN_ITEMS = [
    { icon: UserCog, label: t('sidebar.users'), path: '/admin/users' },
  ];

  const inventoryMenuItems = [
    { icon: LayoutDashboard, label: t('sidebar.inv_dashboard'),       path: '/admin/inventory', end: true },
    { icon: ShoppingCart,    label: t('sidebar.inv_orders'),           path: '/admin/inventory/orders' },
    { icon: Package,         label: t('sidebar.inv_manage'),           path: '/admin/inventory/manage' },
    { icon: Bell,            label: t('sidebar.alerts'),               path: '/admin/inventory/alerts' },
    { icon: Archive,         label: t('sidebar.products'),             path: '/admin/inventory/products' },
    { icon: ClipboardList,   label: t('sidebar.inv_supplier_orders'),  path: '/admin/inventory/supplier-orders' },
    { icon: AlertTriangle,   label: t('sidebar.inv_stock_alerts'),     path: '/admin/inventory/stock-alerts' },
    { icon: Barcode,         label: t('sidebar.inv_barcode'),          path: '/admin/inventory/barcode-scanner' },
    { icon: Settings,        label: t('sidebar.settings'),             path: '/admin/inventory/settings' },
  ];

  const isInventory =
    authUser?.role === 'warehouse' ||
    location.pathname.startsWith('/admin/inventory');

  const adminMenuItems = authUser?.role === 'superadmin'
    ? [...BASE_ADMIN_ITEMS, ...SUPERADMIN_ITEMS]
    : BASE_ADMIN_ITEMS;

  const menuItems = isInventory ? inventoryMenuItems : adminMenuItems;

  return (
    <aside
      className={`bg-sidebar border-l border-sidebar-border h-screen transition-all duration-300 flex flex-col ${isCollapsed ? 'w-20' : 'w-64'
        }`}
    >
      <div className="p-6 border-b border-sidebar-border flex items-center justify-between">
        {!isCollapsed && (
          <div>
            <h2 className="text-foreground">
              {isInventory ? t('admin.title.inventory') : t('admin.title.admin')}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {isInventory ? t('admin.subtitle.inventory') : t('admin.subtitle.full_access')}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
          aria-label={t('admin.sidebar.toggle')}
        >
          <Menu className="w-5 h-5 text-sidebar-foreground" />
        </button>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) =>
                    `w-full flex items-center gap-3 p-3 rounded-lg transition-all ${isActive
                      ? 'bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/20'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent'
                    } ${isCollapsed ? 'justify-center' : ''}`
                  }
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {!isCollapsed && (
        <div className="p-4 border-t border-sidebar-border space-y-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors group"
          >
            <span className="text-xs text-foreground">{t('admin.back_to_site')}</span>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-[#2563eb] transition-colors" />
          </button>

          <div
            className={`px-3 py-2 rounded-lg ${isInventory
                ? 'bg-[#2563eb]/10 border border-[#2563eb]/20'
                : 'bg-[#7c3aed]/10 border border-[#7c3aed]/20'
              }`}
          >
            <p
              className={`text-xs ${isInventory ? 'text-[#2563eb]' : 'text-[#7c3aed]'
                }`}
            >
              {isInventory ? t('admin.role.inventory') : t('admin.role.admin')}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
