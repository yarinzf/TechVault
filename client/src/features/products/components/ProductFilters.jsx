import s from './ProductFilters.module.css';

const SORT_OPTIONS = [
  { value: '',           label: 'מוצגים: פיצ׳ר'      },
  { value: 'newest',     label: 'החדשים ביותר'       },
  { value: 'price_asc',  label: 'מחיר: נמוך → גבוה'  },
  { value: 'price_desc', label: 'מחיר: גבוה → נמוך'  },
  { value: 'rating',     label: 'דירוג גבוה'          },
  { value: 'popularity', label: 'הפופולריים ביותר'    },
];

export default function ProductFilters({ categories, activeCategory, sort, onChange }) {
  return (
    <div className={s.filters}>
      {/* Category chips */}
      <button
        className={`${s.chip}${!activeCategory ? ' ' + s.active : ''}`}
        onClick={() => onChange({ category: '', page: 1 })}
      >
        הכל
      </button>
      {categories.map(cat => (
        <button
          key={cat._id}
          className={`${s.chip}${activeCategory === cat.slug ? ' ' + s.active : ''}`}
          onClick={() => onChange({ category: cat.slug, page: 1 })}
        >
          {cat.name}
        </button>
      ))}

      <div className={s.divider} />

      {/* Sort */}
      <select
        className={s.select}
        value={sort}
        onChange={e => onChange({ sort: e.target.value, page: 1 })}
        aria-label="מיון לפי"
      >
        {SORT_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
