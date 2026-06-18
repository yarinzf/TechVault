'use strict';

const { ADDRESS_DATA, COUNTRIES: STATIC_COUNTRIES } = require('../data/locationData');

const DEV = process.env.NODE_ENV !== 'production';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 h

// ── Resource IDs (override via env vars if datasets are updated) ──────────────
// Previous streets resource ID (a7296d1a-...) was invalid — returned 404.
const GOV_IL_CITIES_RESOURCE_ID =
  process.env.GOV_IL_CITIES_RESOURCE_ID  || 'b7cf8f14-64a2-4b33-8d4b-edb286fdbd37';
const GOV_IL_STREETS_RESOURCE_ID =
  process.env.GOV_IL_STREETS_RESOURCE_ID || '9ad3862c-8391-4b2f-84a4-2d4c68625f4b';

// ── Hebrew field names from data.gov.il datasets ──────────────────────────────
// Cities resource: b7cf8f14-... — 1 272 settlements
const F_CITY_LATIN = 'שם_ישוב_לועזי'; // transliterated Latin name, e.g. "TEL AVIV - YAFO"
const F_CITY_HEB   = 'שם_ישוב';        // Hebrew city name, e.g. "תל אביב - יפו"
const F_CITY_CODE  = 'סמל_ישוב';       // integer settlement code (shared with streets)
// Streets resource: 9ad3862c-... — 63 563 street rows
const F_STREET     = 'שם_רחוב';        // Hebrew street name

// ── Internal cache key for the Israel cities+code-map bundle ─────────────────
const IL_CITIES_DATA_KEY = 'il-cities-data';

// ── Hebrew display labels keyed by REST Countries v3.1 `name.common` ─────────
// REST Countries does NOT include a `heb` translation field — this map is the
// sole source of Hebrew country names.  Keys must match name.common exactly.
const HEBREW_COUNTRY_LABELS = {
  'Afghanistan':                               'אפגניסטן',
  'Albania':                                   'אלבניה',
  'Algeria':                                   'אלג׳יריה',
  'American Samoa':                            'סמואה האמריקאית',
  'Andorra':                                   'אנדורה',
  'Angola':                                    'אנגולה',
  'Anguilla':                                  'אנגווילה',
  'Antarctica':                                'אנטארקטיקה',
  'Antigua and Barbuda':                       'אנטיגואה וברבודה',
  'Argentina':                                 'ארגנטינה',
  'Armenia':                                   'ארמניה',
  'Aruba':                                     'ארובה',
  'Australia':                                 'אוסטרליה',
  'Austria':                                   'אוסטריה',
  'Azerbaijan':                                'אזרבייג׳ן',
  'Bahamas':                                   'בהאמס',
  'Bahrain':                                   'בחריין',
  'Bangladesh':                                'בנגלדש',
  'Barbados':                                  'ברבדוס',
  'Belarus':                                   'בלארוס',
  'Belgium':                                   'בלגיה',
  'Belize':                                    'בליז',
  'Benin':                                     'בנין',
  'Bermuda':                                   'ברמודה',
  'Bhutan':                                    'בהוטן',
  'Bolivia':                                   'בוליביה',
  'Bosnia and Herzegovina':                    'בוסניה והרצגובינה',
  'Botswana':                                  'בוצוואנה',
  'Bouvet Island':                             'האי בובה',
  'Brazil':                                    'ברזיל',
  'British Indian Ocean Territory':            'הטריטוריה הבריטית באוקיאנוס ההודי',
  'British Virgin Islands':                    'איי הבתולה הבריטיים',
  'Brunei':                                    'ברוניי',
  'Bulgaria':                                  'בולגריה',
  'Burkina Faso':                              'בורקינה פאסו',
  'Burundi':                                   'בורונדי',
  'Cambodia':                                  'קמבודיה',
  'Cameroon':                                  'קמרון',
  'Canada':                                    'קנדה',
  'Cape Verde':                                'כף ורדה',
  'Caribbean Netherlands':                     'הולנד הקריבית',
  'Cayman Islands':                            'איי קיימן',
  'Central African Republic':                  'הרפובליקה המרכז-אפריקאית',
  'Chad':                                      'צ׳אד',
  'Chile':                                     'צ׳ילה',
  'China':                                     'סין',
  'Christmas Island':                          'אי חג המולד',
  'Cocos (Keeling) Islands':                   'איי קוקוס',
  'Colombia':                                  'קולומביה',
  'Comoros':                                   'קומורו',
  'Cook Islands':                              'איי קוק',
  'Costa Rica':                                'קוסטה ריקה',
  'Croatia':                                   'קרואטיה',
  'Cuba':                                      'קובה',
  'Curaçao':                                   'קוראסאו',
  'Cyprus':                                    'קפריסין',
  'Czechia':                                   'צ׳כיה',
  'DR Congo':                                  'הרפובליקה הדמוקרטית של קונגו',
  'Denmark':                                   'דנמרק',
  'Djibouti':                                  'ג׳יבוטי',
  'Dominica':                                  'דומיניקה',
  'Dominican Republic':                        'הרפובליקה הדומיניקנית',
  'Ecuador':                                   'אקוודור',
  'Egypt':                                     'מצרים',
  'El Salvador':                               'אל סלוודור',
  'Equatorial Guinea':                         'גינאה המשוונית',
  'Eritrea':                                   'אריתריאה',
  'Estonia':                                   'אסטוניה',
  'Eswatini':                                  'אסוואטיני',
  'Ethiopia':                                  'אתיופיה',
  'Falkland Islands':                          'איי פוקלנד',
  'Faroe Islands':                             'איי פארו',
  'Fiji':                                      'פיג׳י',
  'Finland':                                   'פינלנד',
  'France':                                    'צרפת',
  'French Guiana':                             'גיאנה הצרפתית',
  'French Polynesia':                          'פולינזיה הצרפתית',
  'French Southern and Antarctic Lands':       'השטחים הצרפתיים הדרומיים',
  'Gabon':                                     'גאבון',
  'Gambia':                                    'גמביה',
  'Georgia':                                   'גאורגיה',
  'Germany':                                   'גרמניה',
  'Ghana':                                     'גאנה',
  'Gibraltar':                                 'גיברלטר',
  'Greece':                                    'יוון',
  'Greenland':                                 'גרינלנד',
  'Grenada':                                   'גרנדה',
  'Guadeloupe':                                'גוואדלופ',
  'Guam':                                      'גואם',
  'Guatemala':                                 'גואטמלה',
  'Guernsey':                                  'גרנזי',
  'Guinea':                                    'גינאה',
  'Guinea-Bissau':                             'גינאה-ביסאו',
  'Guyana':                                    'גיאנה',
  'Haiti':                                     'האיטי',
  'Heard Island and McDonald Islands':         'איי הרד ומקדונלד',
  'Honduras':                                  'הונדורס',
  'Hong Kong':                                 'הונג קונג',
  'Hungary':                                   'הונגריה',
  'Iceland':                                   'איסלנד',
  'India':                                     'הודו',
  'Indonesia':                                 'אינדונזיה',
  'Iran':                                      'איראן',
  'Iraq':                                      'עיראק',
  'Ireland':                                   'אירלנד',
  'Isle of Man':                               'האי מאן',
  'Israel':                                    'ישראל',
  'Italy':                                     'איטליה',
  'Ivory Coast':                               'חוף השנהב',
  'Jamaica':                                   'ג׳מייקה',
  'Japan':                                     'יפן',
  'Jersey':                                    'ג׳רסי',
  'Jordan':                                    'ירדן',
  'Kazakhstan':                                'קזחסטן',
  'Kenya':                                     'קניה',
  'Kiribati':                                  'קיריבאטי',
  'Kosovo':                                    'קוסובו',
  'Kuwait':                                    'כוויית',
  'Kyrgyzstan':                                'קירגיזסטן',
  'Laos':                                      'לאוס',
  'Latvia':                                    'לטביה',
  'Lebanon':                                   'לבנון',
  'Lesotho':                                   'לסוטו',
  'Liberia':                                   'ליבריה',
  'Libya':                                     'לוב',
  'Liechtenstein':                             'ליכטנשטיין',
  'Lithuania':                                 'ליטא',
  'Luxembourg':                                'לוקסמבורג',
  'Macau':                                     'מקאו',
  'Madagascar':                                'מדגסקר',
  'Malawi':                                    'מלאווי',
  'Malaysia':                                  'מלזיה',
  'Maldives':                                  'מלדיביים',
  'Mali':                                      'מאלי',
  'Malta':                                     'מלטה',
  'Marshall Islands':                          'איי מרשל',
  'Martinique':                                'מרטיניק',
  'Mauritania':                                'מאוריטניה',
  'Mauritius':                                 'מאוריציוס',
  'Mayotte':                                   'מאיוט',
  'Mexico':                                    'מקסיקו',
  'Micronesia':                                'מיקרונזיה',
  'Moldova':                                   'מולדובה',
  'Monaco':                                    'מונקו',
  'Mongolia':                                  'מונגוליה',
  'Montenegro':                                'מונטנגרו',
  'Montserrat':                                'מונטסראט',
  'Morocco':                                   'מרוקו',
  'Mozambique':                                'מוזמביק',
  'Myanmar':                                   'מיאנמר',
  'Namibia':                                   'נמיביה',
  'Nauru':                                     'נאורו',
  'Nepal':                                     'נפאל',
  'Netherlands':                               'הולנד',
  'New Caledonia':                             'קלדוניה החדשה',
  'New Zealand':                               'ניו זילנד',
  'Nicaragua':                                 'ניקרגואה',
  'Niger':                                     'ניז׳ר',
  'Nigeria':                                   'ניגריה',
  'Niue':                                      'ניואה',
  'Norfolk Island':                            'אי נורפולק',
  'North Korea':                               'קוריאה הצפונית',
  'North Macedonia':                           'מקדוניה הצפונית',
  'Northern Mariana Islands':                  'איי מריאנה הצפוניים',
  'Norway':                                    'נורבגיה',
  'Oman':                                      'עומאן',
  'Pakistan':                                  'פקיסטן',
  'Palau':                                     'פלאו',
  'Palestine':                                 'פלסטין',
  'Panama':                                    'פנמה',
  'Papua New Guinea':                          'פפואה גינאה החדשה',
  'Paraguay':                                  'פרגוואי',
  'Peru':                                      'פרו',
  'Philippines':                               'הפיליפינים',
  'Pitcairn Islands':                          'איי פיטקרן',
  'Poland':                                    'פולין',
  'Portugal':                                  'פורטוגל',
  'Puerto Rico':                               'פוארטו ריקו',
  'Qatar':                                     'קטר',
  'Republic of the Congo':                     'רפובליקת קונגו',
  'Romania':                                   'רומניה',
  'Russia':                                    'רוסיה',
  'Rwanda':                                    'רואנדה',
  'Réunion':                                   'ראוניון',
  'Saint Barthélemy':                          'סן ברתלמי',
  'Saint Helena, Ascension and Tristan da Cunha': 'סנט הלנה, אסנסיון וטריסטן דה קונה',
  'Saint Kitts and Nevis':                     'סנט קיטס ונוויס',
  'Saint Lucia':                               'סנט לוסיה',
  'Saint Martin':                              'סן מרטן',
  'Saint Pierre and Miquelon':                 'סן פייר ומיקלון',
  'Saint Vincent and the Grenadines':          'סנט וינסנט והגרנדינים',
  'Samoa':                                     'סמואה',
  'San Marino':                                'סן מרינו',
  'Saudi Arabia':                              'ערב הסעודית',
  'Senegal':                                   'סנגל',
  'Serbia':                                    'סרביה',
  'Seychelles':                                'איי סיישל',
  'Sierra Leone':                              'סיירה לאונה',
  'Singapore':                                 'סינגפור',
  'Sint Maarten':                              'סינט מארטן',
  'Slovakia':                                  'סלובקיה',
  'Slovenia':                                  'סלובניה',
  'Solomon Islands':                           'איי שלמה',
  'Somalia':                                   'סומליה',
  'South Africa':                              'דרום אפריקה',
  'South Georgia':                             'ג׳ורג׳יה הדרומית',
  'South Korea':                               'קוריאה הדרומית',
  'South Sudan':                               'דרום סודן',
  'Spain':                                     'ספרד',
  'Sri Lanka':                                 'סרי לנקה',
  'Sudan':                                     'סודן',
  'Suriname':                                  'סורינאם',
  'Svalbard and Jan Mayen':                    'סוולבארד ויאן מאיין',
  'Sweden':                                    'שוודיה',
  'Switzerland':                               'שוויץ',
  'Syria':                                     'סוריה',
  'São Tomé and Príncipe':                     'סאו טומה ופרינסיפה',
  'Taiwan':                                    'טייוואן',
  'Tajikistan':                                'טג׳יקיסטן',
  'Tanzania':                                  'טנזניה',
  'Thailand':                                  'תאילנד',
  'Timor-Leste':                               'טימור-לסטה',
  'Togo':                                      'טוגו',
  'Tokelau':                                   'טוקלאו',
  'Tonga':                                     'טונגה',
  'Trinidad and Tobago':                       'טרינידד וטובגו',
  'Tunisia':                                   'תוניסיה',
  'Turkey':                                    'טורקיה',
  'Turkmenistan':                              'טורקמניסטן',
  'Turks and Caicos Islands':                  'איי טורקס וקאיקוס',
  'Tuvalu':                                    'טובאלו',
  'Uganda':                                    'אוגנדה',
  'Ukraine':                                   'אוקראינה',
  'United Arab Emirates':                      'איחוד האמירויות',
  'United Kingdom':                            'בריטניה',
  'United States':                             'ארצות הברית',
  'United States Minor Outlying Islands':      'האיים הקטנים המרוחקים של ארה״ב',
  'United States Virgin Islands':              'איי הבתולה האמריקאיים',
  'Uruguay':                                   'אורוגוואי',
  'Uzbekistan':                                'אוזבקיסטן',
  'Vanuatu':                                   'ונואטו',
  'Vatican City':                              'הוותיקן',
  'Venezuela':                                 'ונצואלה',
  'Vietnam':                                   'וייטנאם',
  'Wallis and Futuna':                         'ווליס ופוטונה',
  'Western Sahara':                            'סהרה המערבית',
  'Yemen':                                     'תימן',
  'Zambia':                                    'זמביה',
  'Zimbabwe':                                  'זימבבואה',
  'Åland Islands':                             'איי אולנד',
};

// ── In-memory TTL cache ───────────────────────────────────────────────────────

const _cache = new Map();

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data) {
  _cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

// ── Dev-only logging ──────────────────────────────────────────────────────────

function logSource(label, source) {
  if (DEV) console.log(`\x1b[32m[locations]\x1b[0m ${label} ← ${source}`);
}

function logFallback(label, err) {
  if (DEV) console.warn(`[locations] ${label} ← static fallback | reason: ${err?.message ?? 'unknown'}`);
}

// ── HTTP helper (Node 18+ global fetch) ───────────────────────────────────────

async function fetchJson(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Title-case helper ─────────────────────────────────────────────────────────

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── City code lookup (exact then prefix-based) ────────────────────────────────
// Handles: "Tel Aviv" → "Tel Aviv - Yafo" (city code 5000)
// because the API returns the full official name but callers may use short forms.
function findCityCode(codeMap, city) {
  const q = city.toLowerCase().trim();
  if (codeMap[q] != null) return codeMap[q];
  // Prefix match: API name starts with our query followed by a space or dash
  const prefixKey = Object.keys(codeMap).find(k => k.startsWith(q + ' ') || k.startsWith(q + '-'));
  return prefixKey != null ? codeMap[prefixKey] : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Countries
// ═══════════════════════════════════════════════════════════════════════════════

async function getCountries() {
  const KEY = 'countries';
  const cached = cacheGet(KEY);
  // Guard against old string[] format cached before the {value,label} migration.
  if (cached && cached.length && typeof cached[0] === 'object') {
    logSource('countries', `cache (${cached.length})`);
    return cached;
  }

  try {
    const data = await fetchJson('https://restcountries.com/v3.1/all?fields=name,translations');
    const countries = data
      .map(c => ({
        value: c.name.common,
        label: c.translations?.heb?.common
          || HEBREW_COUNTRY_LABELS[c.name.common]
          || c.name.common,
      }))
      .filter(c => c.value)
      .sort((a, b) => a.label.localeCompare(b.label, 'he'));
    cacheSet(KEY, countries);
    logSource('countries', `REST Countries API (${countries.length})`);
    return countries;
  } catch (err) {
    logFallback('countries', err);
    return STATIC_COUNTRIES.map(c => ({ value: c, label: HEBREW_COUNTRY_LABELS[c] || c }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cities
// ═══════════════════════════════════════════════════════════════════════════════

// Fetches the full Israeli settlements list and builds a code-lookup map.
// Returns: { list: string[], codeMap: Record<string, number> }
// where codeMap keys are lowercase city names, values are סמל_ישוב codes.
async function _fetchIsraeliCitiesData() {
  const url =
    `https://data.gov.il/api/3/action/datastore_search` +
    `?resource_id=${GOV_IL_CITIES_RESOURCE_ID}&limit=2000`;

  const data = await fetchJson(url, 12000);
  if (data?.success !== true || !Array.isArray(data?.result?.records)) {
    throw new Error(`data.gov.il cities: unexpected response (success=${data?.success})`);
  }

  const codeMap = {};
  const cityMap = new Map(); // value (Latin title-case) → label (Hebrew)

  for (const rec of data.result.records) {
    const latinRaw = rec[F_CITY_LATIN];
    const hebRaw   = rec[F_CITY_HEB];
    const code     = rec[F_CITY_CODE];
    if (!latinRaw || code == null) continue;
    const value = toTitleCase(String(latinRaw).trim()); // stable key used for street lookup
    if (!value) continue;
    const label = String(hebRaw ?? '').trim() || value;  // Hebrew display name, fallback to Latin
    cityMap.set(value, label);
    codeMap[value.toLowerCase()] = Number(code);
  }

  const list = [...cityMap.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'he'));

  return {
    list,
    codeMap,
    total:   data.result.total,
    fetched: cityMap.size,
  };
}

// Returns the Israeli cities data bundle from cache or fetches it fresh.
// Silent — no logs here; callers are responsible for logging.
async function _getIsraeliCitiesData() {
  const cached = cacheGet(IL_CITIES_DATA_KEY);
  if (cached) return cached;
  const cityData = await _fetchIsraeliCitiesData();
  cacheSet(IL_CITIES_DATA_KEY, cityData);
  return cityData;
}

// GeoNames provider stub — wire up GEONAMES_USERNAME env var to enable.
async function _getCitiesFromGeoNames(country) {
  const username = process.env.GEONAMES_USERNAME;
  if (!username) throw new Error('GEONAMES_USERNAME not configured');
  // To enable, uncomment:
  // const url = `http://api.geonames.org/searchJSON` +
  //   `?country=${encodeURIComponent(country)}&featureClass=P` +
  //   `&orderby=population&maxRows=100&username=${username}`;
  // const data = await fetchJson(url);
  // return (data.geonames ?? []).map(g => g.name).filter(Boolean).sort();
  throw new Error('GeoNames integration not yet enabled');
}

async function getCities(country) {
  const KEY = `cities::${country}`;
  const cached = cacheGet(KEY);
  // Guard against old string[] format — require {value,label} objects
  if (cached && cached.length && typeof cached[0] === 'object') {
    logSource(`cities[${country}]`, `cache (${cached.length})`);
    return cached;
  }

  if (country === 'Israel') {
    try {
      const cityData = await _getIsraeliCitiesData();
      cacheSet(KEY, cityData.list);
      logSource('cities[Israel]', `data.gov.il (${cityData.fetched} of ${cityData.total} settlements)`);
      return cityData.list;
    } catch (err) {
      logFallback('cities[Israel]', err);
      return ADDRESS_DATA.Israel
        ? Object.keys(ADDRESS_DATA.Israel).map(c => ({ value: c, label: c }))
        : [];
    }
  }

  try {
    const cities = await _getCitiesFromGeoNames(country);
    cacheSet(KEY, cities);
    logSource(`cities[${country}]`, `GeoNames (${cities.length})`);
    return cities;
  } catch (err) {
    logFallback(`cities[${country}]`, err);
    return ADDRESS_DATA[country]
      ? Object.keys(ADDRESS_DATA[country]).map(c => ({ value: c, label: c }))
      : [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Streets
// ═══════════════════════════════════════════════════════════════════════════════

// Fetches all streets for an Israeli city by its numeric code.
// Jerusalem has ~4 400 streets so we use limit 5000.
async function _fetchIsraeliStreets(cityCode) {
  const filters = encodeURIComponent(JSON.stringify({ [F_CITY_CODE]: cityCode }));
  const url =
    `https://data.gov.il/api/3/action/datastore_search` +
    `?resource_id=${GOV_IL_STREETS_RESOURCE_ID}` +
    `&filters=${filters}` +
    `&limit=5000`;

  const data = await fetchJson(url, 15000);
  if (data?.success !== true || !Array.isArray(data?.result?.records)) {
    throw new Error(`data.gov.il streets: unexpected response (success=${data?.success})`);
  }

  return [
    ...new Set(
      data.result.records
        .map(r => r[F_STREET])
        .filter(Boolean)
        .map(s => String(s).trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
}

async function getStreets(country, city) {
  const KEY = `streets::${country}::${city}`;
  const cached = cacheGet(KEY);
  if (cached) { logSource(`streets[${country}/${city}]`, `cache (${cached.length})`); return cached; }

  if (country === 'Israel') {
    try {
      // Resolve city → numeric code (fetches cities data if not already cached)
      const cityData = await _getIsraeliCitiesData();
      const cityCode = findCityCode(cityData.codeMap, city);

      if (cityCode == null) {
        throw new Error(
          `City not found in code map: "${city}". ` +
          `Call /locations/cities?country=Israel to get valid city names.`
        );
      }

      const streets = await _fetchIsraeliStreets(cityCode);
      if (!streets.length) throw new Error(`data.gov.il returned 0 streets for code ${cityCode}`);

      cacheSet(KEY, streets);
      logSource(`streets[Israel/${city}]`, `data.gov.il (${streets.length})`);
      return streets;
    } catch (err) {
      logFallback(`streets[Israel/${city}]`, err);
    }
  } else {
    logSource(`streets[${country}/${city}]`, 'static');
  }

  return ADDRESS_DATA[country]?.[city] ?? [];
}

module.exports = { getCountries, getCities, getStreets };
