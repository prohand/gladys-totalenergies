// -----------------------------------------------------------------------------
// Tariff periods.
//
// The rules of the manifest tariffs carry a short label (`HP`, `HC`, `HSC`,
// `HV`, `Base`): it is what Gladys shows in the cost details. The integration
// turns it into a stable lowercase key — the value of the `period` device
// feature, of the scene trigger filter and of the scene variables — and into
// a readable name.
// -----------------------------------------------------------------------------

export const PERIODS = {
  base: {
    short: 'Base',
    name: { en: 'Base', fr: 'Base', de: 'Base', es: 'Base' },
  },
  hp: {
    short: 'HP',
    name: { en: 'Peak hours', fr: 'Heures pleines', de: 'Hauptzeit', es: 'Horas punta' },
  },
  hc: {
    short: 'HC',
    name: { en: 'Off-peak hours', fr: 'Heures creuses', de: 'Nebenzeit', es: 'Horas valle' },
  },
  hsc: {
    short: 'HSC',
    name: {
      en: 'Super off-peak hours',
      fr: 'Heures super creuses',
      de: 'Schwachlastzeit',
      es: 'Horas supervalle',
    },
  },
  hv: {
    short: 'HV',
    name: {
      en: 'Vigilance hours',
      fr: 'Heures de vigilance',
      de: 'Wachsamkeitsstunden',
      es: 'Horas de vigilancia',
    },
  },
};

/** The period key of a tariff rule label (`HC` → `hc`). */
export function periodKey(label) {
  return String(label).toLowerCase();
}

/** The periods a template can be in, in display order. */
export function templatePeriods(template) {
  const keys = new Set();
  for (const component of template.tariff?.components ?? []) {
    if (component.kind !== 'consumption') {
      continue;
    }
    for (const rule of [...(component.rules ?? []), component.fallback].filter(Boolean)) {
      if (rule.label) {
        keys.add(periodKey(rule.label));
      }
    }
  }
  return Object.keys(PERIODS).filter((key) => keys.has(key));
}

/** The readable name of a period, `{ en, fr, de, es }`. */
export function periodName(key) {
  return PERIODS[key]?.name ?? { en: key, fr: key, de: key, es: key };
}
