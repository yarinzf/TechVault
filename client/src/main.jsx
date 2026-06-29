import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ThemeProvider }        from './context/ThemeContext';
import { LanguageProvider }     from './context/LanguageContext';
import { AccessibilityProvider } from './context/AccessibilityContext';
import { AuthProvider }         from './app/providers/AuthProvider';
import { CartProvider }         from './features/cart/context/CartProvider';
import { WishlistProvider }     from './features/wishlist/context/WishlistProvider';
import { CompareProvider }      from './features/compare/context/CompareProvider';
import { ToastProvider }        from './app/providers/ToastProvider';
import { UserProvider }         from './context/UserContext';
import './styles/variables.css';
import './styles/global.css';
import './styles/tailwind.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AccessibilityProvider>
            <AuthProvider>
              <CartProvider>
                <ToastProvider>
                  <WishlistProvider>
                    <CompareProvider>
                      <UserProvider>
                        <App />
                      </UserProvider>
                    </CompareProvider>
                  </WishlistProvider>
                </ToastProvider>
              </CartProvider>
            </AuthProvider>
          </AccessibilityProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
