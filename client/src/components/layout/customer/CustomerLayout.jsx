import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import CustomerNavbar  from './CustomerNavbar';
import PromoBar        from './PromoBar';
import CategoryNavBar  from './CategoryNavBar';
import CartDrawer      from '../../ui/CartDrawer';
import ToastContainer  from '../../feedback/Toast/Toast';
import AIChatWidget    from '../../ai-chat/AIChatWidget';

export default function CustomerLayout() {
  const [cartOpen, setCartOpen] = useState(false);

  // dir is driven globally by LanguageProvider on <html> — no hardcoded dir here
  return (
    <div style={{ fontFamily: 'var(--sv-font)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 9999, background: 'var(--sv-bg)' }}>
        <PromoBar />
        <CustomerNavbar onOpenCart={() => setCartOpen(true)} />
        <CategoryNavBar />
      </header>
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />
      <main>
        <Outlet />
      </main>
      <ToastContainer />
      <AIChatWidget />
    </div>
  );
}
