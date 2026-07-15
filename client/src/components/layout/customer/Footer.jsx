import { Link } from 'react-router-dom';
import { Twitter, Instagram, Youtube, Linkedin } from 'lucide-react';
import s from './Footer.module.css';

const FOOTER_COLS = [
  {
    title: 'קטגוריות',
    links: [
      { label: 'מסכי גיימינג',   to: '/products?category=monitors'   },
      { label: 'כרטיסי מסך',     to: '/products?category=components'  },
      { label: 'מקלדות ועכברים', to: '/products?category=keyboards'   },
      { label: 'אוזניות',        to: '/products?category=headphones'  },
      { label: 'מחשבים ניידים',  to: '/products?category=laptops'     },
      { label: 'אחסון',          to: '/products?category=storage'     },
    ],
  },
  {
    title: 'שירות ללקוחות',
    links: [
      { label: 'צור קשר',           to: '#' },
      { label: 'מדיניות החזרות',    to: '#' },
      { label: 'אחריויות ותיקונים', to: '#' },
      { label: 'שאלות נפוצות',      to: '#' },
      { label: 'עמדות שירות',       to: '#' },
    ],
  },
  {
    title: 'החשבון שלי',
    links: [
      { label: 'התחברות',          to: '/login'    },
      { label: 'הרשמה',            to: '/register' },
      { label: 'הזמנות שלי',       to: '/orders'   },
      { label: 'מועדפים',          to: '/wishlist' },
      { label: 'מועדון TechVault', to: '#'         },
    ],
  },
];

// Extracted from HomePage's original local `SiteFooter` so it can be shared
// across the storefront (e.g. the product page) instead of duplicated.
export default function Footer() {
  return (
    <footer className={s.siteFooter}>
      <div className={s.footerInner}>
        <div className={s.footerGrid}>
          <div className={s.footerBrand}>
            <div className={s.footerBrandWrap}>
              <svg width="28" height="30" viewBox="0 0 133 142" fill="none" aria-hidden="true">
                <path d="M0 18.31L65.56 0L132.46 18.31L125.47 40.53L66.23 23.86L59.86 25.51L61.66 30.58L67.83 44.02L74 55.95L79.71 66.65L67.88 88.04L58.03 73L50.16 58.81L43.76 45.15L38.48 31.49L7.2 39.91L0 17.28" fill="#2563EB"/>
                <path d="M10.57 48.52L32.89 42.45L36.13 50.48L42.45 63.43L48.16 73.92L58.03 89.97L68.06 104.16L77.62 89.5L83.49 79.17L90.43 65.59L96.91 52.02L100.76 42.45L122.67 48.78L116.5 64.05L106.47 84.88L94.44 105.86L80.4 126.37L68.83 141.34L51.71 121.44L41.1 106.32L31.96 91.9L24.86 79.01L15.45 59.11L10.57 48.52Z" fill="#2563EB"/>
              </svg>
              <span className={s.footerBrandName}>
                Tech<span className={s.footerBrandAccent}>Vault</span>
              </span>
            </div>
            <p className={s.footerDesc}>
              החנות המובילה לציוד גיימינג ותשתיות טכנולוגיות. אלפי מוצרים, מחירים תחרותיים, שירות מהיר.
            </p>
          </div>

          {FOOTER_COLS.map(col => (
            <div key={col.title} className={s.footerCol}>
              <div className={s.footerColTitle}>{col.title}</div>
              {col.links.map(link => (
                <Link key={link.label} to={link.to} className={s.footerLink}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className={s.footerBottom}>
          <div className={s.footerCopy}>© 2025 TechVault. כל הזכויות שמורות.</div>
          <div className={s.footerSocials}>
            {[
              { Icon: Twitter,   href: '#', label: 'Twitter'   },
              { Icon: Instagram, href: '#', label: 'Instagram'  },
              { Icon: Youtube,   href: '#', label: 'YouTube'    },
              { Icon: Linkedin,  href: '#', label: 'LinkedIn'   },
            ].map(({ Icon, href, label }) => (
              <a key={label} href={href} className={s.socialBtn} aria-label={label}>
                <Icon size={16} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
