// -----------------------------------------------------------------------------
// The manifest, read once at startup.
//
// The TotalEnergies contract templates live in ONE place: the
// `energy_contracts` field of gladys-assistant-integration.json. Gladys reads
// it to offer them in its contract wizard and to compute the costs; this
// integration reads the very same tariffs to know the current period and
// price of each contract (src/tariff/engine.js). Never copy a price or a slot
// into the code: the two would drift apart.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const MANIFEST = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

/** Key of the Éclair days calendar (Heures Eco+), declared in the manifest. */
export const ECLAIR_CALENDAR_KEY = 'eclair-days';

/** Values of the Éclair days calendar. */
export const ECLAIR_VALUES = { NORMAL: 'normal', ECLAIR: 'eclair' };

/** Templates of the manifest, by key. */
export const TEMPLATES = new Map(
  MANIFEST.energy_contracts.templates.map((template) => [template.key, template]),
);

/** The calendar a template reads, or undefined: only Heures Eco+ reads one. */
export function readsEclairCalendar(template) {
  return (template.calendars ?? []).includes(ECLAIR_CALENDAR_KEY);
}

/**
 * The values a contract prices with: the template defaults, overridden by
 * what the user typed in the Gladys contract wizard.
 */
export function contractInputs(template, contract) {
  const inputs = {};
  for (const input of template.inputs ?? []) {
    if (input.default !== undefined) {
      inputs[input.key] = input.default;
    }
  }
  return { ...inputs, ...(contract.inputs ?? {}) };
}
