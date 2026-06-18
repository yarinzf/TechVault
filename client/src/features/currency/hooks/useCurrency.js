import { useState, useEffect, useCallback, useRef } from 'react';
import { currencyService } from '../api/currency.service';

// Module-level rate cache — survives re-renders and SPA navigation.
// Base currency is ILS. Key: "ILS_USD", value: 0.274 (1 ILS → USD).
const _rateCache = {};

/**
 * useCurrency(initialCountry)
 *
 * All product prices are stored in ILS. This hook converts ILS → the target
 * currency for the selected country. When the country uses ILS, rate = 1.
 *
 * Returns:
 *   currencyCode    — ISO 4217 code, e.g. "ILS"
 *   currencySymbol  — display symbol, e.g. "₪"
 *   rate            — multiplier FROM ILS, e.g. 0.274 for USD (null while loading or on fallback)
 *   loading         — true while fetching
 *   fallback        — true if Frankfurter couldn't convert; formatPrice will show ILS instead
 *   setCountry(c)   — imperative update when user selects a different country
 *   formatPrice(n)  — converts an ILS amount to the selected currency and returns a formatted string
 */
export function useCurrency(initialCountry = 'Israel') {
  const [currencyCode,   setCurrencyCode]   = useState('ILS');
  const [currencySymbol, setCurrencySymbol] = useState('₪');
  const [rate,           setRate]           = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [fallback,       setFallback]       = useState(false);

  // Generation counter prevents stale async results from overwriting newer state
  // when setCountry is called rapidly.
  const genRef = useRef(0);

  const fetchCurrency = useCallback(async (country) => {
    if (!country) return;
    const myGen = ++genRef.current;

    setLoading(true);
    setFallback(false);

    try {
      const info = await currencyService.getCurrencyForCountry(country);
      if (genRef.current !== myGen) return; // superseded by newer call

      setCurrencyCode(info.currencyCode);
      setCurrencySymbol(info.currencySymbol);

      // ILS is the base currency — no conversion needed
      if (info.currencyCode === 'ILS') {
        setRate(1);
        setLoading(false);
        return;
      }

      // Module-level cache hit — no backend round-trip needed
      const cacheKey = `ILS_${info.currencyCode}`;
      if (_rateCache[cacheKey] != null) {
        setRate(_rateCache[cacheKey]);
        setLoading(false);
        return;
      }

      try {
        const conv = await currencyService.convertAmount(1, 'ILS', info.currencyCode);
        if (genRef.current !== myGen) return;
        _rateCache[cacheKey] = conv.rate;
        setRate(conv.rate);
      } catch {
        // Frankfurter doesn't support this currency
        if (genRef.current !== myGen) return;
        setRate(null);
        setFallback(true);
      }
    } catch {
      if (genRef.current !== myGen) return;
      setFallback(true);
    } finally {
      if (genRef.current === myGen) setLoading(false);
    }
  }, []);

  // Fetch once on mount with the initial country
  useEffect(() => {
    fetchCurrency(initialCountry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * formatPrice(ilsAmount)
   * Converts from ILS to the selected currency and returns a locale-formatted string.
   * Falls back to ILS display when rate is unavailable.
   */
  const formatPrice = useCallback((ilsAmount) => {
    const converted = rate != null ? ilsAmount * rate : ilsAmount;
    const code      = rate != null ? currencyCode : 'ILS';
    try {
      return new Intl.NumberFormat('he-IL', { style: 'currency', currency: code }).format(converted);
    } catch {
      // Unknown currency code not recognised by Intl — graceful degradation
      const sym = rate != null ? currencySymbol : '₪';
      return `${sym}${converted.toFixed(2)}`;
    }
  }, [rate, currencyCode, currencySymbol]);

  return {
    currencyCode,
    currencySymbol,
    rate,
    loading,
    fallback,
    setCountry: fetchCurrency,
    formatPrice,
  };
}
