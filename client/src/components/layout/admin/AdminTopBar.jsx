import { useEffect, useState } from 'react';
import { Search, Bell, Zap, LogOut, ExternalLink } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LiveNotifications } from './LiveNotifications';
import { useUser } from '../../../context/UserContext';
import { useAuth } from '../../../hooks/useAuth';
import { useAdminNotifications } from '../../../hooks/useAdminNotifications';
import { useTranslation } from '../../../context/LanguageContext';
import ThemeToggle    from '../../ui/ThemeToggle/ThemeToggle';
import LanguageToggle from '../../ui/LanguageToggle/LanguageToggle';
import logo from '../../../assets/images/logo.svg';

export default function AdminTopBar() {
    const [showNotifications, setShowNotifications] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const { user } = useUser();
    const { user: authUser } = useAuth();
    const {
      notifications, unreadCount, loading, hasMore,
      markRead, markAllRead, loadMore,
    } = useAdminNotifications();
    const navigate = useNavigate();
    const location = useLocation();
    const t = useTranslation();

    const isSuperadminArea = location.pathname.startsWith('/admin/superadmin');
    const isInventory = !isSuperadminArea && (
        authUser?.role === 'warehouse' ||
        location.pathname.startsWith('/admin/inventory')
    );
    const currentArea = isSuperadminArea ? 'superadmin' : isInventory ? 'inventory' : 'admin';

    const canAccessAdmin      = ['admin', 'superadmin'].includes(authUser?.role);
    const canAccessSuperadmin = authUser?.role === 'superadmin';

    // Every area this user can reach, in the order they should appear when
    // offered as a switch target. Warehouse-role users only ever see
    // 'inventory' here (canAccessAdmin/canAccessSuperadmin both false for
    // them) — matching the pre-existing behavior where the switch control
    // was hidden entirely for warehouse.
    const AREA_META = {
        admin:      { label: t('admin.mode.admin'),      switchLabel: t('admin.switch_to_admin'),      path: '/admin' },
        inventory:  { label: t('admin.mode.inventory'),  switchLabel: t('admin.switch_to_inventory'),  path: '/admin/inventory' },
        superadmin: { label: t('admin.mode.superadmin'), switchLabel: t('admin.switch_to_superadmin'), path: '/admin/superadmin' },
    };
    const availableAreas = ['admin', 'inventory', 'superadmin'].filter((area) => {
        if (area === 'admin') return canAccessAdmin;
        if (area === 'superadmin') return canAccessSuperadmin;
        return true; // 'inventory' — reachable by warehouse/admin/superadmin alike
    });
    const switchTargets = availableAreas.filter((area) => area !== currentArea);
    const AREA_COLOR = { admin: '#7c3aed', inventory: '#2563eb', superadmin: '#ef4444' };

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTime = (date) => {
        return date.toLocaleTimeString('he-IL', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    const formatDate = (date) => {
        return date.toLocaleDateString('he-IL', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const switchToArea = (area) => {
        setShowUserMenu(false);
        navigate(AREA_META[area].path);
    };

    return (
        <header className="bg-card border-b border-border px-8 py-4">
            <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-[#0f172a] flex items-center justify-center flex-shrink-0 overflow-hidden border border-[#2563eb]/30">
                        <img src={logo} alt="TechVault" className="w-9 h-9 object-contain" />
                    </div>

                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-foreground whitespace-nowrap">TechVault</h1>

                            <div className="flex items-center gap-1 bg-[#10b981]/10 px-2 py-1 rounded-full">
                                <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-pulse" />
                                <span className="text-xs text-[#10b981]">Live</span>
                            </div>

                            <div
                                className="px-2 py-1 rounded-full text-xs"
                                style={{
                                    backgroundColor: `${AREA_COLOR[currentArea]}1a`,
                                    color: AREA_COLOR[currentArea],
                                }}
                            >
                                {AREA_META[currentArea].label}
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs text-muted-foreground">{formatDate(currentTime)}</p>
                            <span className="text-xs text-muted-foreground">•</span>
                            <p className="text-xs text-[#2563eb] font-mono">{formatTime(currentTime)}</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative hidden md:block">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder={currentArea === 'inventory' ? t('admin.search.product') : t('admin.search.quick')}
                            className="bg-secondary border border-border rounded-lg pl-4 pr-10 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50 w-64"
                        />
                    </div>

                    {currentArea === 'admin' && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 border border-border rounded-lg">
                            <Zap className="w-4 h-4 text-[#fbbf24]" />
                            <div className="hidden lg:block">
                                <p className="text-xs text-muted-foreground">{t('admin.daily_goal')}</p>
                                <p className="text-sm text-foreground">₪18,450</p>
                            </div>
                        </div>
                    )}

                        <ThemeToggle />
                    <LanguageToggle />

                <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowNotifications((prev) => !prev)}
                            className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
                            aria-label={t('admin.notifications')}
                        >
                            <Bell className="w-5 h-5 text-foreground" />
                            {unreadCount > 0 && (
                                <>
                                    <span className="absolute top-1 right-1 w-2 h-2 bg-[#ef4444] rounded-full animate-pulse" />
                                    <span className="absolute -top-1 -right-1 bg-[#ef4444] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                </>
                            )}
                        </button>

                        <LiveNotifications
                            isOpen={showNotifications}
                            onClose={() => setShowNotifications(false)}
                            notifications={notifications}
                            unreadCount={unreadCount}
                            loading={loading}
                            hasMore={hasMore}
                            onMarkRead={markRead}
                            onMarkAllRead={markAllRead}
                            onLoadMore={loadMore}
                        />
                    </div>

                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowUserMenu((prev) => !prev)}
                            className="flex items-center gap-3 pl-4 border-r border-border hover:bg-secondary/50 rounded-lg transition-colors pr-3 py-2"
                        >
                            <div className="text-left hidden sm:block">
                                <p className="text-sm text-foreground">{user.name}</p>
                                <p className="text-xs text-muted-foreground">{t('admin.online_now')}</p>
                            </div>

                            <RoleLogo role={currentArea} avatar={user.avatar} />
                        </button>

                        {showUserMenu && (
                            <div className="absolute left-0 top-full mt-2 w-64 bg-card border border-border rounded-lg shadow-2xl z-50">
                                <div className="p-4 border-b border-border">
                                    <div className="flex items-center gap-3">
                                        <RoleLogo role={currentArea} avatar={user.avatar} />
                                        <div>
                                            <p className="text-foreground">{user.name}</p>
                                            <p className="text-xs text-muted-foreground">{user.email}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-2">
                                    {switchTargets.map((area) => (
                                        <button
                                            key={area}
                                            type="button"
                                            onClick={() => switchToArea(area)}
                                            className="w-full text-right px-3 py-2 rounded-lg hover:bg-secondary transition-colors text-sm text-foreground"
                                        >
                                            {AREA_META[area].switchLabel}
                                        </button>
                                    ))}

                                    <button
                                        type="button"
                                        onClick={() => navigate('/')}
                                        className="w-full text-right px-3 py-2 rounded-lg hover:bg-secondary transition-colors text-sm text-foreground flex items-center gap-2"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        {t('admin.back_to_site')}
                                    </button>

                                    <button
                                        type="button"
                                        className="w-full text-right px-3 py-2 rounded-lg hover:bg-secondary transition-colors text-sm text-foreground flex items-center gap-2"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        {t('nav.logout')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}

const ROLE_LOGO_STYLE = {
    admin:      { letter: 'A', gradient: 'linear-gradient(135deg, #7c3aed 0%, #ef4444 100%)' },
    inventory:  { letter: 'M', gradient: 'linear-gradient(135deg, #2563eb 0%, #10b981 100%)' },
    superadmin: { letter: 'S', gradient: 'linear-gradient(135deg, #ef4444 0%, #7c3aed 100%)' },
};

function RoleLogo({ role, avatar }) {
    const style = ROLE_LOGO_STYLE[role] ?? ROLE_LOGO_STYLE.admin;
    const letter = role === 'admin' ? avatar || style.letter : style.letter;

    return (
        <div
            className="w-10 h-10 rounded-full flex items-center justify-center relative shadow-lg border border-white/10"
            style={{ background: style.gradient }}
        >
            <span className="text-white font-bold text-sm leading-none">
                {letter}
            </span>

            <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#10b981] border-2 border-card rounded-full" />
        </div>
    );
}
