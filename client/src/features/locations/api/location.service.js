import { api, qs } from '../../../services/api';
import { ADDRESS_DATA, COUNTRIES } from '../../../data/addressData';

// Dev-only flag — Vite replaces import.meta.env.DEV with `false` in production
// builds, so this entire block is tree-shaken out of the bundle.
const DEV = import.meta.env.DEV;

const logApi      = (label, data) => DEV && console.log(`%c[locations] ${label} ← API`,      'color:#10b981', data);
const logFallback = (label, err)  => DEV && console.warn(`[locations] ${label} ← fallback (API failed):`, err?.message ?? err);

export const locationService = {
  async getCountries() {
    try {
      const { data } = await api.get('/locations/countries');
      // Backend returns [{value, label}] with Hebrew labels since locations V2
      const list = Array.isArray(data) && data.length
        ? data
        : COUNTRIES.map(c => ({ value: c, label: c }));
      logApi('countries', list);
      return list;
    } catch (err) {
      logFallback('countries', err);
      return COUNTRIES.map(c => ({ value: c, label: c }));
    }
  },

  async getCities(country) {
    try {
      const { data } = await api.get(`/locations/cities${qs({ country })}`);
      // Backend returns [{value, label}] for Israel (Hebrew labels), string[] for others
      const list = Array.isArray(data) && data.length
        ? data
        : Object.keys(ADDRESS_DATA[country] ?? {}).map(c => ({ value: c, label: c }));
      logApi(`cities[${country}]`, list);
      return list;
    } catch (err) {
      logFallback(`cities[${country}]`, err);
      return Object.keys(ADDRESS_DATA[country] ?? {}).map(c => ({ value: c, label: c }));
    }
  },

  async getStreets(country, city) {
    try {
      const { data } = await api.get(`/locations/streets${qs({ country, city })}`);
      const list = Array.isArray(data) ? data : (ADDRESS_DATA[country]?.[city] ?? []);
      logApi(`streets[${country} / ${city}]`, list);
      return list;
    } catch (err) {
      logFallback(`streets[${country} / ${city}]`, err);
      return ADDRESS_DATA[country]?.[city] ?? [];
    }
  },
};
