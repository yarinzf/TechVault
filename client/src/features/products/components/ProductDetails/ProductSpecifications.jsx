import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from '../../../../context/LanguageContext';
import s from './ProductSpecifications.module.css';

function ProductSpecificationGroup({ titleKey, items, t }) {
  const [expanded, setExpanded] = useState(false);
  const primary   = items.filter((i) => !i.secondary);
  const secondary = items.filter((i) => i.secondary);
  const visible   = expanded ? items : primary;

  return (
    <div className={s.group}>
      <div className={s.groupTitle}>{t(titleKey)}</div>
      {visible.map(({ key, value }) => (
        <div key={key} className={s.row}>
          <span className={s.key}>{key}</span>
          <span className={s.val}>{value}</span>
        </div>
      ))}
      {secondary.length > 0 && (
        <button type="button" className={s.toggle} onClick={() => setExpanded((e) => !e)}>
          <span>{expanded ? t('specgroup.show_less') : t('specgroup.show_more')}</span>
          <ChevronDown size={13} className={expanded ? s.toggleIconOpen : ''} />
        </button>
      )}
    </div>
  );
}

// `groups` is pre-computed by the caller (groupProductSpecs) so the parent
// can decide whether to render the surrounding section card at all —
// this component itself stays a pure renderer.
export default function ProductSpecifications({ groups }) {
  const t = useTranslation();
  if (!groups?.length) return null;

  return (
    <div className={s.groups}>
      {groups.map((g) => (
        <ProductSpecificationGroup key={g.titleKey} titleKey={g.titleKey} items={g.items} t={t} />
      ))}
    </div>
  );
}
