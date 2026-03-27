/**
 * Format an IQD amount, locale-aware.
 * Pass `lang` (from i18n.language) to switch between Arabic and English numerals.
 */
export function formatIQD(amount, lang = 'en') {
  if (amount == null) return '—';
  const locale = lang === 'ar' ? 'ar-IQ' : 'en-US';
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    numberingSystem: 'latn',
  }).format(Number(amount));
  return lang === 'ar' ? `${formatted} د.ع` : `${formatted} IQD`;
}

/**
 * Format a date string or Date object, locale-aware.
 * Returns a short readable date (e.g. "15 مارس 2026" in Arabic, "Mar 15, 2026" in English).
 */
export function formatDate(date, lang = 'en') {
  if (!date) return '—';
  // For bare YYYY-MM-DD strings, append T12:00:00 so the date is parsed at local noon
  // instead of UTC midnight — prevents off-by-one-day in timezones behind UTC.
  const d = typeof date === 'string'
    ? new Date(date.length === 10 ? `${date}T12:00:00` : date)
    : date;
  if (isNaN(d.getTime())) return String(date);
  const locale = lang === 'ar' ? 'ar-IQ' : 'en-US';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Iraqi phone placeholder hint
export const IQ_PHONE_PLACEHOLDER = '+964 7XX XXX XXXX';
