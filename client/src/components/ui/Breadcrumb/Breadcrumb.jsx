import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import s from './Breadcrumb.module.css';

/**
 * @param {Array<{ label: string, href?: string }>} items
 * Last item is the current page (no href required).
 */
export default function Breadcrumb({ items = [], className = '' }) {
  if (!items.length) return null;

  return (
    <nav aria-label="ניווט ארגזי לחם" className={`${s.nav} ${className}`}>
      <ol className={s.list}>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className={s.item}>
              {isLast ? (
                <span className={s.current} aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link to={item.href} className={s.link}>
                  {item.label}
                </Link>
              )}
              {!isLast && (
                <ChevronLeft
                  size={14}
                  className={s.sep}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
