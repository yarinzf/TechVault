import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, ArrowLeft, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useTranslation } from '../../../context/LanguageContext';
import ToastContainer from '../../feedback/Toast/Toast';

export default function WarehouseLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const t = useTranslation();

  const navItems = [
    { icon: LayoutDashboard, label: t('warehouse.nav.dashboard'), path: '/warehouse', end: true },
    { icon: ShoppingCart,    label: t('warehouse.nav.orders'),    path: '/warehouse/orders' },
    { icon: Package,         label: t('warehouse.nav.inventory'), path: '/warehouse/inventory' },
  ];

  return (
    <div className="flex h-screen bg-background">
      <aside
        className={`bg-sidebar border-r border-sidebar-border h-screen transition-all duration-300 flex flex-col ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          {!collapsed && (
            <div>
              <h2 className="text-foreground font-semibold">{t('warehouse.title')}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t('warehouse.workspace')}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((p) => !p)}
            className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
            aria-label={t('admin.sidebar.toggle')}
          >
            <Menu className="w-5 h-5 text-sidebar-foreground" />
          </button>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map(({ icon: Icon, label, path, end }) => (
              <li key={path}>
                <NavLink
                  to={path}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-3 rounded-lg transition-all ${
                      isActive
                        ? 'bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/20'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent'
                    } ${collapsed ? 'justify-center' : ''}`
                  }
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {!collapsed && (
          <div className="p-4 border-t border-sidebar-border space-y-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-sm text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('admin.back_to_site')}
            </button>
            <div className="px-3 py-2 rounded-lg bg-[#2563eb]/10 border border-[#2563eb]/20">
              <p className="text-xs text-[#2563eb] font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
            </div>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between flex-shrink-0">
          <span className="text-foreground font-semibold">⚡ TechVault — {t('warehouse.title')}</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors text-sm text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4" />
              {t('nav.logout')}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}
