import s from './ProductSectionCard.module.css';

// Shared chrome for every stacked section on the page (description, specs,
// reviews, related, recently-viewed...) — matches the design's
// "pp-section-card" treatment without repeating the markup six times.
export default function ProductSectionCard({ icon: Icon, label, heading, compact = false, id, children }) {
  return (
    <div className={`${s.card}${compact ? ' ' + s.compact : ''}`} id={id}>
      <div className={s.title}>
        <span className={s.titleIcon}><Icon size={14} /></span>
        {label}
      </div>
      {heading && <div className={s.heading}>{heading}</div>}
      <div className={s.body}>{children}</div>
    </div>
  );
}
