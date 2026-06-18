import { api, qs } from '../../../services/api';

export const currencyService = {
  async getCurrencyForCountry(country) {
    const { data } = await api.get(`/currency/for-country${qs({ country })}`);
    return data; // { country, currencyCode, currencyName, currencySymbol }
  },

  async convertAmount(amount, from, to) {
    const { data } = await api.get(`/currency/convert${qs({ amount, from, to })}`);
    return data; // { amount, from, to, rate, convertedAmount }
  },
};
