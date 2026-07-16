import { Link } from 'react-router-dom';
import { Twitter, Instagram, Youtube, Linkedin } from 'lucide-react';
import { useTranslation } from '../../../context/LanguageContext';
import s from './Footer.module.css';

const FOOTER_COLS = [
  {
    titleKey: 'footer.categories_title',
    links: [
      { labelKey: 'footer.cat_gaming_monitors', to: '/products?category=monitors'   },
      { labelKey: 'footer.cat_graphics_cards',  to: '/products?category=components'  },
      { labelKey: 'footer.cat_keyboards_mice',  to: '/products?category=keyboards'   },
      { labelKey: 'footer.cat_headphones',      to: '/products?category=headphones'  },
      { labelKey: 'footer.cat_laptops',         to: '/products?category=laptops'     },
      { labelKey: 'footer.cat_storage',         to: '/products?category=storage'     },
    ],
  },
  {
    titleKey: 'footer.service_title',
    links: [
      { labelKey: 'footer.contact_us',         to: '#' },
      { labelKey: 'footer.returns_policy',     to: '#' },
      { labelKey: 'footer.warranties_repairs', to: '#' },
      { labelKey: 'footer.faq',                to: '#' },
      { labelKey: 'footer.service_locations',  to: '#' },
    ],
  },
  {
    titleKey: 'footer.account_title',
    links: [
      { labelKey: 'footer.login',      to: '/login'    },
      { labelKey: 'footer.register',   to: '/register' },
      { labelKey: 'footer.my_orders',  to: '/orders'   },
      { labelKey: 'footer.wishlist',   to: '/wishlist' },
      { labelKey: 'footer.club',       to: '#'         },
    ],
  },
];

// Extracted from HomePage's original local `SiteFooter` so it can be shared
// across the storefront (e.g. the product page) instead of duplicated.
export default function Footer() {
  const t = useTranslation();
  const year = new Date().getFullYear();

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
              {t('footer.brand_desc')}
            </p>
          </div>

          {FOOTER_COLS.map(col => (
            <div key={col.titleKey} className={s.footerCol}>
              <div className={s.footerColTitle}>{t(col.titleKey)}</div>
              {col.links.map(link => (
                <Link key={link.labelKey} to={link.to} className={s.footerLink}>
                  {t(link.labelKey)}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className={s.footerBottom}>
          <div className={s.footerCopy}>{t('footer.copyright').replace('{year}', year)}</div>
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
