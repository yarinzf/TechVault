import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Heart, ShoppingCart, ChevronDown,
  Menu, X, Package, User, LogOut, Zap,
  Globe, GitCompare, LayoutGrid,
} from 'lucide-react';
import { useAuth }     from '../../../hooks/useAuth';
import { useCart }     from '../../../hooks/useCart';
import { useWishlist } from '../../../hooks/useWishlist';
import { useCompare }  from '../../../features/compare/context/CompareProvider';
import { useTheme }    from '../../../context/ThemeContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useAccessibility } from '../../../context/AccessibilityContext';
import { productService } from '../../../features/products/api/product.service';
import s from './CustomerNavbar.module.css';

/* ── TechVault SVG logo (exact Sapir path data) ─────────────────────────────── */
function TechVaultLogo() {
  return (
    <svg width="30" height="36" viewBox="0 0 133 142" fill="none" aria-hidden="true">
      <path d="M0 18.31L65.56 0L132.46 18.31L125.47 40.53L66.23 23.86L59.86 25.51L61.66 30.58L67.83 44.02L74 55.95L79.71 66.65L67.88 88.04L58.03 73L50.16 58.81L43.76 45.15L38.48 31.49L7.2 39.91L0 17.28" fill="#2563EB"/>
      <path d="M10.57 48.52L32.89 42.45L36.13 50.48L42.45 63.43L48.16 73.92L58.03 89.97L68.06 104.16L77.62 89.5L83.49 79.17L90.43 65.59L96.91 52.02L100.76 42.45L122.67 48.78L116.5 64.05L106.47 84.88L94.44 105.86L80.4 126.37L68.83 141.34L51.71 121.44L41.1 106.32L31.96 91.9L24.86 79.01L15.45 59.11L10.57 48.52Z" fill="#2563EB"/>
    </svg>
  );
}

/* ── Accessibility icon (custom SVG matching Sapir) ─────────────────────────── */
function AccessibilityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="5" r="1.5"/>
      <path d="M7 9h10l-1.5 6H9L7.5 9z"/>
      <path d="M9 15l-1.5 4M15 15l1.5 4"/>
      <path d="M7 9l-2 3M17 9l2 3"/>
    </svg>
  );
}

/* ── Theme icon (sun/moon, shared by desktop + mobile toggles) ──────────────── */
function ThemeIcon({ theme }) {
  return theme === 'dark'
    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
}

export default function CustomerNavbar({ onOpenCart = () => {} }) {
  const { user, logout }   = useAuth();
  const { totalItems }     = useCart();
  const { ids: wishIds }   = useWishlist();
  const { items: compareItems } = useCompare();
  const { theme, toggle: toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { isOpen: a11yOpen, toggle: toggleA11y } = useAccessibility();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [query,       setQuery]       = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [scrolled,    setScrolled]    = useState(false);

  const menuRef   = useRef(null);
  const searchRef = useRef(null);

  /* ── Scroll detection ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── Close mobile menu on route change ────────────────────────────────────── */
  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  /* ── Autocomplete ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const list = await productService.autocomplete(query);
        setSuggestions(list.slice(0, 6));
      } catch { setSuggestions([]); }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSuggestionClick = (slug) => {
    setSuggestions([]);
    setQuery('');
    navigate(`/products/${slug}`);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSuggestions([]);
    navigate(`/products?search=${encodeURIComponent(query.trim())}`);
    setQuery('');
  };

  const handleSeeAll = () => {
    if (!query.trim()) return;
    setSuggestions([]);
    navigate(`/products?search=${encodeURIComponent(query.trim())}`);
    setQuery('');
  };

  /* ── Close menus on outside click ─────────────────────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current   && !menuRef.current.contains(e.target))   setMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSuggestions([]);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const userName  = user?.name || '';
  const firstName = userName.split(' ')[0] || '';
  const hasWishItems = wishIds.size > 0;
  const nextLang  = language === 'he' ? 'en' : 'he';

  return (
    <nav className={`${s.nav} ${scrolled ? s.scrolled : ''}`}>
      <div className={s.inner}>

        {/* ── Logo ── */}
        <Link to="/" className={s.logo} aria-label={t('nav.home_arialabel')}>
          <TechVaultLogo />
          <span className={s.logoText}>TechVault</span>
        </Link>

        {/* ── Search ── */}
        <div className={s.searchWrap} ref={searchRef}>
          <form onSubmit={handleSearchSubmit} role="search" className={s.navSearch}>
            <input
              className={s.navSearchInput}
              placeholder={t('nav.search.placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('nav.search_arialabel')}
              aria-autocomplete="list"
              aria-expanded={suggestions.length > 0}
              autoComplete="off"
              dir={language === 'he' ? 'rtl' : 'ltr'}
            />
            <button type="submit" className={s.navSearchBtn} aria-label={t('btn.search')}>
              <Search size={17} />
            </button>
          </form>

          {/* Suggestions dropdown */}
          {suggestions.length > 0 && (
            <div className={s.searchSuggestions} id="nav-suggestions" role="listbox" dir={language === 'he' ? 'rtl' : 'ltr'}>
              {suggestions.map((p) => (
                <div
                  key={p._id}
                  className={s.suggestionItem}
                  role="option"
                  tabIndex={0}
                  onClick={() => handleSuggestionClick(p.slug)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSuggestionClick(p.slug)}
                >
                  <div className={s.sugIcon}>
                    <Search size={16} />
                  </div>
                  <div className={s.sugText}>
                    <div className={s.sugName}>{p.name}</div>
                    {p.category && <div className={s.sugCat}>{p.category}</div>}
                  </div>
                  {p.price && (
                    <div className={s.sugPrice}>
                      ₪{Number(p.price).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
              <button className={s.sugAll} onClick={handleSeeAll} type="button">
                <Search size={13} />
                {t('nav.see_all_for')} &ldquo;{query}&rdquo;
              </button>
            </div>
          )}
        </div>

        {/* ── Nav actions ── */}
        <div className={s.navActions}>

          {/* Wishlist icon */}
          <Link
            to="/wishlist"
            className={s.navIconBtn}
            data-tip={t('nav.wishlist')}
            aria-label={hasWishItems ? `${t('nav.wishlist')} (${wishIds.size})` : t('nav.wishlist_arialabel')}
          >
            <Heart
              size={16}
              fill={hasWishItems ? '#f43f5e' : 'none'}
              stroke={hasWishItems ? '#f43f5e' : 'currentColor'}
              strokeWidth={1.8}
            />
            {hasWishItems && (
              <span className={s.cartCount} style={{ background: '#f43f5e' }} aria-hidden="true">
                {wishIds.size > 99 ? '99+' : wishIds.size}
              </span>
            )}
          </Link>

          {/* Compare icon */}
          <button
            className={s.navIconBtn}
            data-tip={t('nav.compare')}
            aria-label={compareItems.length > 0 ? `${t('nav.compare')} (${compareItems.length})` : t('nav.compare')}
            onClick={() => navigate('/compare')}
            type="button"
          >
            <GitCompare size={16} strokeWidth={1.8} />
            {compareItems.length > 0 && (
              <span className={s.cartCount} aria-hidden="true">
                {compareItems.length}
              </span>
            )}
          </button>

          <div className={s.navDivider} aria-hidden="true" />

          {/* Language toggle */}
          <button
            className={s.navLangBtn}
            onClick={() => setLanguage(nextLang)}
            aria-label={`${t('lang.toggle')}: ${nextLang === 'he' ? t('lang.he') : t('lang.en')}`}
            type="button"
          >
            <Globe size={13} />
            {language === 'he' ? 'עב' : 'EN'}
          </button>

          {/* Accessibility button — opens the real AccessibilityWidget panel */}
          <button
            className={`${s.navIconBtn} ${a11yOpen ? s.active : ''}`}
            data-tip={t('a11y.title')}
            aria-label={t('a11y.title')}
            aria-expanded={a11yOpen}
            aria-controls="a11y-panel"
            onClick={toggleA11y}
            type="button"
          >
            <AccessibilityIcon />
          </button>

          {/* Theme toggle */}
          <button
            className={s.navIconBtn}
            data-tip={t('theme.toggle')}
            aria-label={theme === 'dark' ? t('theme.light') : t('theme.dark')}
            onClick={toggleTheme}
            type="button"
          >
            <ThemeIcon theme={theme} />
          </button>

          <div className={s.navDivider} aria-hidden="true" />

          {/* Orders link — only when logged in */}
          {user && (
            <Link to="/orders" className={s.navUserBtn} aria-label={t('nav.orders')}>
              <Package size={15} />
              {t('nav.orders')}
            </Link>
          )}

          {/* User menu / Login */}
          {user ? (
            <div className={s.userMenuWrap} ref={menuRef}>
              <button
                className={s.navUserBtn}
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-haspopup="true"
              >
                <User size={15} />
                {firstName}
                <ChevronDown
                  size={12}
                  className={`${s.chevron} ${menuOpen ? s.chevronOpen : ''}`}
                  aria-hidden="true"
                />
              </button>

              {menuOpen && (
                <div className={s.dropdown} role="menu">
                  <Link to="/orders"   className={s.dropdownItem} onClick={() => setMenuOpen(false)} role="menuitem"><Package size={14} />{t('nav.orders')}</Link>
                  <Link to="/wishlist" className={s.dropdownItem} onClick={() => setMenuOpen(false)} role="menuitem"><Heart size={14} />{t('nav.wishlist')}</Link>
                  <Link to="/profile"  className={s.dropdownItem} onClick={() => setMenuOpen(false)} role="menuitem"><User size={14} />{t('nav.profile')}</Link>

                  {['warehouse', 'admin', 'superadmin'].includes(user?.role) && (
                    <Link to="/admin/inventory" className={s.dropdownItem} onClick={() => setMenuOpen(false)} role="menuitem">
                      <Package size={14} />{t('nav.warehouse')}
                    </Link>
                  )}
                  {['admin', 'superadmin'].includes(user?.role) && (
                    <Link to="/admin" className={s.dropdownItem} onClick={() => setMenuOpen(false)} role="menuitem">
                      <Zap size={14} />{t('nav.admin')}
                    </Link>
                  )}

                  <div className={s.dropdownDivider} role="separator" />
                  <button className={`${s.dropdownItem} ${s.danger}`} onClick={logout} role="menuitem">
                    <LogOut size={14} />{t('nav.logout')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" state={{ returnTo: `${location.pathname}${location.search}` }} className={s.navUserBtn}>
              <User size={15} />
              {t('nav.login')}
            </Link>
          )}

          {/* Cart */}
          <button
            className={s.navCart}
            onClick={onOpenCart}
            aria-label={totalItems > 0 ? `${t('nav.cart_arialabel')}, ${totalItems} ${t('nav.items')}` : t('nav.cart_arialabel')}
          >
            <ShoppingCart size={16} />
            {t('nav.cart')}
            {totalItems > 0 && (
              <span className={s.cartCount} aria-hidden="true">
                {totalItems > 99 ? '99+' : totalItems}
              </span>
            )}
          </button>

          {/* Hamburger — mobile only */}
          <button
            className={s.hamburger}
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? t('nav.mobile_close') : t('nav.mobile_open')}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* ── Mobile panel ── */}
      {mobileOpen && (
        <div className={s.mobilePanel} role="navigation" aria-label={t('nav.mobile_nav')}>
          <Link to="/products" className={s.mobilePanelLink} onClick={() => setMobileOpen(false)}>
            <LayoutGrid size={16} />{t('nav.all_products')}
          </Link>

          <Link to="/wishlist" className={s.mobilePanelLink} onClick={() => setMobileOpen(false)}>
            <Heart size={16} fill={hasWishItems ? '#f43f5e' : 'none'} stroke={hasWishItems ? '#f43f5e' : 'currentColor'} />
            {t('nav.wishlist')}{hasWishItems ? ` (${wishIds.size})` : ''}
          </Link>
          <button type="button" className={s.mobilePanelLink} onClick={() => { setMobileOpen(false); navigate('/compare'); }}>
            <GitCompare size={16} />{t('nav.compare')}{compareItems.length > 0 ? ` (${compareItems.length})` : ''}
          </button>

          <div className={s.mobileDivider} />

          <button type="button" className={s.mobilePanelLink} onClick={() => setLanguage(nextLang)}>
            <Globe size={16} />{t('lang.toggle')}: {language === 'he' ? 'עב' : 'EN'}
          </button>
          <button type="button" className={s.mobilePanelLink} onClick={toggleTheme}>
            <ThemeIcon theme={theme} />{theme === 'dark' ? t('theme.light') : t('theme.dark')}
          </button>
          <button type="button" className={s.mobilePanelLink} onClick={toggleA11y}>
            <AccessibilityIcon />{t('a11y.title')}
          </button>

          <div className={s.mobileDivider} />

          {user ? (
            <>
              <Link to="/orders"   className={s.mobilePanelLink} onClick={() => setMobileOpen(false)}><Package size={16} />{t('nav.orders')}</Link>
              <Link to="/profile"  className={s.mobilePanelLink} onClick={() => setMobileOpen(false)}><User size={16} />{t('nav.profile')}</Link>
              {['warehouse', 'admin', 'superadmin'].includes(user?.role) && (
                <Link to="/admin/inventory" className={s.mobilePanelLink} onClick={() => setMobileOpen(false)}><Package size={16} />{t('nav.warehouse')}</Link>
              )}
              {['admin', 'superadmin'].includes(user?.role) && (
                <Link to="/admin" className={s.mobilePanelLink} onClick={() => setMobileOpen(false)}><Zap size={16} />{t('nav.admin')}</Link>
              )}
              <div className={s.mobileDivider} />
              <button className={`${s.mobilePanelLink} ${s.mobileLogout}`} onClick={() => { setMobileOpen(false); logout(); }}>
                <LogOut size={16} />{t('nav.logout')}
              </button>
            </>
          ) : (
            <Link to="/login" state={{ returnTo: `${location.pathname}${location.search}` }} className={`${s.mobilePanelLink} ${s.mobileLoginLink}`} onClick={() => setMobileOpen(false)}>
              <User size={16} />{t('nav.login')}
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
