// -----------------------------------------------------------------------------
// Formatting of the values shown to the user, per language.
// -----------------------------------------------------------------------------

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** A price per kWh, e.g. `0,1467 €/kWh` in French. */
export function formatPrice(price, language) {
  if (price === null || price === undefined) {
    return '—';
  }
  const number = new Intl.NumberFormat(LOCALES[language] ?? LOCALES.en, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(price);
  return `${number} €/kWh`;
}

/** A local `YYYY-MM-DD`, written the way the language writes dates. */
export function formatDate(date, language) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}
