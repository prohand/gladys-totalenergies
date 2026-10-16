// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen.
//
// Each handler is keyed by the action `key` of the manifest `actions` field
// and resolves the multi-language message displayed under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { ECLAIR_TIMEZONE, ECLAIR_DAYS_PER_SEASON } from './eclair.js';
import { formatPrice } from './format.js';
import { localize, pick } from './i18n.js';
import { ECLAIR_VALUES } from './manifest.js';
import { periodName } from './tariff/periods.js';
import { localDateAfter } from './tariff/time.js';

const logger = createLogger({ name: 'actions' });

const NO_CONTRACT = {
  en: 'No TotalEnergies contract yet: create one in Energy > Contracts, from a TotalEnergies template.',
  fr: "Aucun contrat TotalEnergies pour l'instant : créez-en un dans Énergie > Contrats, à partir d'un modèle TotalEnergies.",
  de: 'Noch kein TotalEnergies-Vertrag: Legen Sie einen unter Energie > Verträge aus einer TotalEnergies-Vorlage an.',
  es: 'Aún no hay ningún contrato TotalEnergies: cree uno en Energía > Contratos, a partir de una plantilla TotalEnergies.',
};

/** The date typed in an action form, tomorrow when left empty. */
function dateField(service, fields) {
  const typed = typeof fields?.date === 'string' ? fields.date.trim() : '';
  return typed || localDateAfter(service.now(), ECLAIR_TIMEZONE, 1);
}

function invalidDate(date, reason) {
  logger.warn(reason);
  return {
    en: `Cannot use "${date}": type a date as YYYY-MM-DD, at most 7 days ahead.`,
    fr: `Impossible d'utiliser « ${date} » : saisissez une date au format AAAA-MM-JJ, au plus 7 jours à l'avance.`,
    de: `„${date}“ ist nicht möglich: Geben Sie ein Datum im Format JJJJ-MM-TT ein, höchstens 7 Tage im Voraus.`,
    es: `No se puede usar «${date}»: introduzca una fecha con el formato AAAA-MM-DD, como máximo 7 días antes.`,
  };
}

export const ACTIONS = {
  // The "remontée" of the contracts: what Gladys holds for this integration.
  async list_contracts(service) {
    await service.refresh();
    if (service.entries.length === 0) {
      return NO_CONTRACT;
    }
    return localize((language) => {
      const lines = service.entries.map((entry) => {
        const view = service.view(entry);
        const name = pick(language, entry.template.name);
        const period = pick(language, periodName(view.period));
        return `${name} (${entry.contract.valid_from}): ${period}, ${formatPrice(view.price, language)}`;
      });
      return lines.join(' · ');
    });
  },

  async declare_eclair_day(service, { fields }) {
    const date = dateField(service, fields);
    const reason = service.eclair.checkDate(date, service.now());
    if (reason) {
      return invalidDate(date, reason);
    }
    const { seasonCount } = await service.declareEclairDay(date, ECLAIR_VALUES.ECLAIR, {
      announce: true,
    });
    const count = `${seasonCount}/${ECLAIR_DAYS_PER_SEASON}`;
    return {
      en: `${date} is an Éclair day (${count} this season).`,
      fr: `Le ${date} est un jour Éclair (${count} cette saison).`,
      de: `Der ${date} ist ein Éclair-Tag (${count} in dieser Saison).`,
      es: `El ${date} es un día Éclair (${count} esta temporada).`,
    };
  },

  async cancel_eclair_day(service, { fields }) {
    const date = dateField(service, fields);
    const reason = service.eclair.checkDate(date, service.now());
    if (reason) {
      return invalidDate(date, reason);
    }
    await service.declareEclairDay(date, ECLAIR_VALUES.NORMAL);
    return {
      en: `${date} is a normal day again.`,
      fr: `Le ${date} redevient un jour normal.`,
      de: `Der ${date} ist wieder ein normaler Tag.`,
      es: `El ${date} vuelve a ser un día normal.`,
    };
  },
};
