import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import CustomerNavbar  from './CustomerNavbar';
import PromoBar        from './PromoBar';
import CategoryNavBar  from './CategoryNavBar';
import CartDrawer      from '../../ui/CartDrawer';
import ToastContainer  from '../../feedback/Toast/Toast';

export default function CustomerLayout() {
  const [cartOpen, setCartOpen] = useState(false);

  // dir is driven globally by LanguageProvider on <html> — no hardcoded dir here
  return (
    <div>
      <PromoBar />
      <CustomerNavbar onOpenCart={() => setCartOpen(true)} />
      <CategoryNavBar />
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />
      <main>
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  );
}
