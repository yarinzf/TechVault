import { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
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
  FolderTree,
  Crown,
  ShieldAlert,
  Eye,
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

  // Admin = business management layer only (commerce, catalog, promotions,
  // refunds, membership, analytics). Platform/system items (users & roles,
  // system status, security, privileged audit, system settings) live
  // exclusively in the dedicated Super Admin area below — never duplicated
  // here, even for a superadmin viewing this list.
  const BASE_ADMIN_ITEMS = [
    { icon: LayoutDashboard, label: t('sidebar.dashboard'),  path: '/admin',            end: true },
    { icon: ShoppingCart,    label: t('sidebar.orders'),     path: '/admin/orders' },
    { icon: Package,         label: t('sidebar.products'),   path: '/admin/products' },
    { icon: FolderTree,      label: t('sidebar.categories'), path: '/admin/categories' },
    { icon: Tag,             label: t('sidebar.campaigns'),  path: '/admin/campaigns' },
    { icon: Ticket,          label: t('sidebar.coupons'),    path: '/admin/coupons' },
    { icon: RotateCcw,       label: t('sidebar.returns'),    path: '/admin/returns' },
    { icon: Crown,           label: t('sidebar.club'),       path: '/admin/club' },
    { icon: BarChart3,       label: t('sidebar.reports'),    path: '/admin/analytics' },
    { icon: Bell,            label: t('sidebar.alerts'),     path: '/admin/alerts' },
    { icon: Activity,        label: t('sidebar.activity'),   path: '/admin/audit-log' },
    { icon: Settings,        label: t('sidebar.settings'),   path: '/admin/settings' },
  ];

  // Warehouse = fulfillment/logistics only. No business- or
  // system-administration capability anywhere in this list.
  const inventoryMenuItems = [
    { icon: LayoutDashboard, label: t('sidebar.inv_dashboard'),      path: '/admin/inventory', end: true },
    { icon: ShoppingCart,    label: t('sidebar.inv_orders'),         path: '/admin/inventory/orders' },
    { icon: Package,         label: t('sidebar.inv_manage'),         path: '/admin/inventory/manage' },
    { icon: ClipboardList,   label: t('sidebar.inv_supplier_orders'),path: '/admin/inventory/supplier-orders' },
    { icon: AlertTriangle,   label: t('sidebar.inv_stock_alerts'),   path: '/admin/inventory/stock-alerts' },
    { icon: Barcode,         label: t('sidebar.inv_barcode'),        path: '/admin/inventory/barcode-scanner' },
    { icon: RotateCcw,       label: t('sidebar.inv_returns'),        path: '/admin/inventory/returns' },
    { icon: Settings,        label: t('sidebar.warehouse_settings'), path: '/admin/inventory/settings' },
  ];

  // Super Admin = platform/system only (users & roles, system health,
  // security, privileged audit, system settings) — never ordinary business
  // pages; those stay reachable through the inherited Admin area instead.
  const superadminMenuItems = [
    { icon: LayoutDashboard, label: t('sidebar.superadmin_dashboard'), path: '/admin/superadmin', end: true },
    { icon: UserCog,         label: t('sidebar.users'),                path: '/admin/superadmin/users' },
    { icon: Server,          label: t('sidebar.system_status'),        path: '/admin/superadmin/system-status' },
    { icon: ShieldAlert,     label: t('sidebar.security'),             path: '/admin/superadmin/security' },
    { icon: Eye,             label: t('sidebar.privileged_audit'),     path: '/admin/superadmin/audit' },
    { icon: Settings,        label: t('sidebar.system_settings'),      path: '/admin/superadmin/settings' },
  ];

  const isSuperadminArea = location.pathname.startsWith('/admin/superadmin');
  const isInventory = !isSuperadminArea && (
    authUser?.role === 'warehouse' ||
    location.pathname.startsWith('/admin/inventory')
  );

  const menuItems = isSuperadminArea ? superadminMenuItems : isInventory ? inventoryMenuItems : BASE_ADMIN_ITEMS;

  const areaTitle = isSuperadminArea ? t('admin.title.superadmin') : isInventory ? t('admin.title.inventory') : t('admin.title.admin');
  const areaSubtitle = isSuperadminArea ? t('admin.subtitle.superadmin') : isInventory ? t('admin.subtitle.inventory') : t('admin.subtitle.full_access');
  const areaBadgeColor = isSuperadminArea ? '#ef4444' : isInventory ? '#2563eb' : '#7c3aed';
  const areaRoleLabel = isSuperadminArea ? t('admin.role.superadmin') : isInventory ? t('admin.role.inventory') : t('admin.role.admin');

  return (
    <aside
      className={`bg-sidebar border-l border-sidebar-border h-screen transition-all duration-300 flex flex-col ${isCollapsed ? 'w-20' : 'w-64'
        }`}
    >
      <div className="p-6 border-b border-sidebar-border flex items-center justify-between">
        {!isCollapsed && (
          <div>
            <h2 className="text-foreground">{areaTitle}</h2>
            <p className="text-xs text-muted-foreground mt-1">{areaSubtitle}</p>
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
            className="px-3 py-2 rounded-lg"
            style={{ backgroundColor: `${areaBadgeColor}1a`, border: `1px solid ${areaBadgeColor}33` }}
          >
            <p className="text-xs" style={{ color: areaBadgeColor }}>{areaRoleLabel}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
