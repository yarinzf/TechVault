// Formats the free-form `specs.Warranty` value (e.g. "1 Year", "2 Years",
// "12 Months") into a natural, localized phrase instead of showing raw
// English text ("1 Year") glued next to a Hebrew label.

const YEAR_MONTH_RE = /^(\d+)\s*(years?|months?)$/i;

function formatKnown(count, unit, language) {
  const isYear = unit.toLowerCase().startsWith('year');
  if (language === 'he') {
    if (isYear) {
      if (count === 1) return 'שנת אחריות';
      if (count === 2) return 'שנתיים אחריות';
      return `${count} שנות אחריות`;
    }
    if (count === 1) return 'חודש אחריות';
    return `${count} חודשי אחריות`;
  }
  return isYear ? `${count}-year warranty` : `${count}-month warranty`;
}

/**
 * @param {string|undefined|null} rawValue  Raw specs.Warranty value from the backend
 * @param {'he'|'en'} language
 * @returns {string|null} Localized warranty phrase, or null if there's nothing to show.
 */
export function formatWarranty(rawValue, language) {
  if (!rawValue || typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const match = trimmed.match(YEAR_MONTH_RE);
  if (match) {
    return formatKnown(parseInt(match[1], 10), match[2], language);
  }

  // Already-worded values (e.g. "Manufacturer Warranty", "אחריות יבואן") —
  // don't bolt on a second "warranty"/"אחריות".
  if (/warranty/i.test(trimmed) || /אחריות/.test(trimmed)) {
    return trimmed;
  }

  return language === 'he' ? `${trimmed} אחריות` : `${trimmed} warranty`;
}
