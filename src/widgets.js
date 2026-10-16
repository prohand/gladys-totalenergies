// -----------------------------------------------------------------------------
// Dashboard widgets (SDK v0.14+, Gladys 5.1+).
//
// Two widgets, declared in the manifest `widgets` field:
//   - `tariff_status`: the current period and price of ONE contract (chosen
//     in the widget settings, the first one otherwise), the next change, the
//     price over the next 24 hours, and for Heures Eco+ the Éclair days of
//     today and tomorrow plus a button to declare tomorrow;
//   - `eclair_days`: the Éclair days of the season (x/20), and buttons to
//     declare or cancel one.
//
// The content is declarative (no HTML): the core renders it with its own
// theme. Each entry of WIDGETS exposes `get` (onWidgetGet) and `action`
// (onWidgetAction, the tapped buttons). The service nudges the widgets when
// what they show changes (src/service.js), the TTL is a safety net.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { ECLAIR_DAYS_PER_SEASON, ECLAIR_TIMEZONE } from './eclair.js';
import { formatDate, formatPrice } from './format.js';
import { localize, pick } from './i18n.js';
import { ECLAIR_VALUES } from './manifest.js';
import { contractIds, FEATURE } from './devices/contract.js';
import { WIDGET_KEYS } from './service.js';
import { priceSeries } from './tariff/engine.js';
import { PERIODS } from './tariff/periods.js';
import { localDateAfter, localParts } from './tariff/time.js';

const logger = createLogger({ name: 'widgets' });

export const ACTION_KEYS = {
  DECLARE_TOMORROW: 'declare_tomorrow',
  DECLARE: 'declare',
  CANCEL: 'cancel',
};

const PERIOD_COLORS = {
  base: WIDGET_COLORS.NEUTRAL,
  hp: WIDGET_COLORS.WARNING,
  hc: WIDGET_COLORS.SUCCESS,
  hsc: WIDGET_COLORS.SUCCESS,
  hv: WIDGET_COLORS.DANGER,
};

const YES = { en: 'Yes', fr: 'Oui', de: 'Ja', es: 'Sí' };
const NO = { en: 'No', fr: 'Non', de: 'Nein', es: 'No' };

const NO_CONTRACT = {
  en: 'No TotalEnergies contract yet. Create one in Energy > Contracts, from a TotalEnergies template.',
  fr: 'Aucun contrat TotalEnergies. Créez-en un dans Énergie > Contrats, à partir d’un modèle TotalEnergies.',
  de: 'Noch kein TotalEnergies-Vertrag. Legen Sie einen unter Energie > Verträge aus einer TotalEnergies-Vorlage an.',
  es: 'Ningún contrato TotalEnergies. Cree uno en Energía > Contratos, a partir de una plantilla TotalEnergies.',
};

const DAY_FIELD = {
  key: 'day',
  type: 'select',
  label: { en: 'Day', fr: 'Jour', de: 'Tag', es: 'Día' },
  required: true,
  default: 'tomorrow',
  options: [
    { value: 'tomorrow', label: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' } },
    { value: 'today', label: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' } },
  ],
};

function priceTile(service, entry, view) {
  const ids = contractIds(service.gladys, entry.contract);
  const label = { en: 'kWh price', fr: 'Prix du kWh', de: 'kWh-Preis', es: 'Precio del kWh' };
  // A created device makes the tile LIVE: it follows the published states.
  if (service.createdDevices.has(ids.device)) {
    return { type: 'value', label, icon: 'zap', device_feature: ids.feature(FEATURE.PRICE) };
  }
  if (view.price === null) {
    return { type: 'value', label, icon: 'zap', value: '—' };
  }
  return { type: 'value', label, icon: 'zap', value: view.price, unit: '€/kWh' };
}

function tariffStatusContent(service, entry) {
  const at = service.now();
  const view = service.view(entry, at);
  const items = [];
  if (view.next) {
    const time = localParts(view.next.at, entry.timezone).time;
    items.push({
      label: {
        en: 'Next change',
        fr: 'Prochain changement',
        de: 'Nächster Wechsel',
        es: 'Próximo cambio',
      },
      icon: 'clock',
      value: `${time} → ${PERIODS[view.next.period]?.short ?? view.next.period}`,
      color: PERIOD_COLORS[view.next.period] ?? WIDGET_COLORS.NEUTRAL,
    });
    items.push({
      label: { en: 'Next price', fr: 'Prix suivant', de: 'Nächster Preis', es: 'Precio siguiente' },
      icon: 'trending-up',
      value: localize((language) => formatPrice(view.next.price, language)),
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  if (view.eclair) {
    items.push({
      label: {
        en: 'Éclair day today',
        fr: "Jour Éclair aujourd'hui",
        de: 'Heute Éclair-Tag',
        es: 'Hoy día Éclair',
      },
      icon: 'alert-triangle',
      value: view.eclairToday ? YES : NO,
      color: view.eclairToday ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    });
    items.push({
      label: {
        en: 'Éclair day tomorrow',
        fr: 'Jour Éclair demain',
        de: 'Morgen Éclair-Tag',
        es: 'Mañana día Éclair',
      },
      icon: 'calendar',
      value: view.eclairTomorrow ? YES : NO,
      color: view.eclairTomorrow ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    });
  }

  const points = priceSeries(entry.tariff, at, entry.timezone, service.eclair.lookup)
    .filter((point) => point.price !== null)
    .map((point) => ({ t: point.at.toISOString(), v: point.price }));

  const components = [
    priceTile(service, entry, view),
    {
      type: 'value',
      label: { en: 'Period', fr: 'Période', de: 'Tarifzeit', es: 'Periodo' },
      icon: 'activity',
      value: PERIODS[view.period]?.short ?? view.period,
      color: PERIOD_COLORS[view.period] ?? WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'text',
      variant: 'caption',
      text: localize((language) => pick(language, entry.template.name)),
    },
  ];
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }
  if (points.length > 0) {
    components.push({
      type: 'chart',
      chart_type: 'stepline',
      title: {
        en: 'Next 24 hours',
        fr: '24 prochaines heures',
        de: 'Nächste 24 Stunden',
        es: 'Próximas 24 horas',
      },
      unit: '€/kWh',
      now_marker: true,
      series: [{ name: { en: 'Price', fr: 'Prix', de: 'Preis', es: 'Precio' }, points }],
    });
  }
  if (view.eclair && !view.eclairTomorrow) {
    components.push({
      type: 'button',
      label: {
        en: 'Éclair day tomorrow',
        fr: 'Jour Éclair demain',
        de: 'Morgen Éclair-Tag',
        es: 'Mañana día Éclair',
      },
      icon: 'alert-triangle',
      style: 'danger',
      action: { key: ACTION_KEYS.DECLARE_TOMORROW, confirm: true },
    });
  }
  return { ttl_seconds: 300, components };
}

function eclairDaysContent(service) {
  const today = localParts(service.now(), ECLAIR_TIMEZONE).date;
  const seasonDays = service.eclair.seasonDays(today);
  const upcoming = service.eclair.upcomingDays(today);
  const components = [
    {
      type: 'status',
      items: [
        {
          label: {
            en: 'This season',
            fr: 'Cette saison',
            de: 'Diese Saison',
            es: 'Esta temporada',
          },
          icon: 'bar-chart-2',
          value: `${seasonDays.length}/${ECLAIR_DAYS_PER_SEASON}`,
          color:
            seasonDays.length >= ECLAIR_DAYS_PER_SEASON
              ? WIDGET_COLORS.WARNING
              : WIDGET_COLORS.INFO,
        },
        {
          label: {
            en: 'Next Éclair day',
            fr: 'Prochain jour Éclair',
            de: 'Nächster Éclair-Tag',
            es: 'Próximo día Éclair',
          },
          icon: 'calendar',
          value:
            upcoming.length > 0 ? localize((language) => formatDate(upcoming[0], language)) : '—',
          color: upcoming.length > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
        },
      ],
    },
  ];
  // Most recent first: the days that matter now are at the top.
  const listed = [...seasonDays].reverse().slice(0, 8);
  if (listed.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: listed.map((date) => ({
        title: localize((language) => formatDate(date, language)),
        subtitle: date,
        badge:
          date >= today
            ? {
                text: { en: 'Upcoming', fr: 'À venir', de: 'Bevorstehend', es: 'Próximo' },
                color: WIDGET_COLORS.DANGER,
              }
            : {
                text: { en: 'Past', fr: 'Passé', de: 'Vorbei', es: 'Pasado' },
                color: WIDGET_COLORS.NEUTRAL,
              },
      })),
    });
  } else {
    components.push({
      type: 'text',
      variant: 'caption',
      text: {
        en: 'No Éclair day declared this season.',
        fr: 'Aucun jour Éclair déclaré cette saison.',
        de: 'Keine Éclair-Tage in dieser Saison gemeldet.',
        es: 'Ningún día Éclair declarado esta temporada.',
      },
    });
  }
  components.push({
    type: 'button',
    label: { en: 'Declare a day', fr: 'Déclarer un jour', de: 'Tag melden', es: 'Declarar un día' },
    icon: 'plus',
    style: 'primary',
    action: { key: ACTION_KEYS.DECLARE, fields: [DAY_FIELD] },
  });
  if (upcoming.length > 0) {
    components.push({
      type: 'button',
      label: {
        en: 'Cancel a day',
        fr: 'Annuler un jour',
        de: 'Tag zurücknehmen',
        es: 'Anular un día',
      },
      icon: 'x',
      style: 'secondary',
      action: {
        key: ACTION_KEYS.CANCEL,
        fields: [
          {
            key: 'date',
            type: 'select',
            label: {
              en: 'Day to cancel',
              fr: 'Jour à annuler',
              de: 'Zurückzunehmender Tag',
              es: 'Día a anular',
            },
            required: true,
            options: upcoming.map((date) => ({
              value: date,
              label: localize((language) => formatDate(date, language)),
            })),
          },
        ],
      },
    });
  }
  return { ttl_seconds: 600, components };
}

function declaredToast(date, seasonCount) {
  const count = `${seasonCount}/${ECLAIR_DAYS_PER_SEASON}`;
  return {
    en: `${date} declared as an Éclair day (${count}).`,
    fr: `Le ${date} est déclaré jour Éclair (${count}).`,
    de: `Der ${date} ist als Éclair-Tag gemeldet (${count}).`,
    es: `El ${date} se ha declarado día Éclair (${count}).`,
  };
}

export const WIDGETS = {
  [WIDGET_KEYS.TARIFF_STATUS]: {
    async get(service, { settings }) {
      logger.debug(`onWidgetGet <- ${WIDGET_KEYS.TARIFF_STATUS}`);
      const entry = service.resolveEntry(settings?.device);
      if (!entry) {
        return { ttl_seconds: 300, components: [{ type: 'text', text: NO_CONTRACT }] };
      }
      return tariffStatusContent(service, entry);
    },

    async action(service, { actionKey }) {
      logger.info(`onWidgetAction <- ${WIDGET_KEYS.TARIFF_STATUS}.${actionKey}`);
      if (actionKey !== ACTION_KEYS.DECLARE_TOMORROW) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      const date = localDateAfter(service.now(), ECLAIR_TIMEZONE, 1);
      const { seasonCount } = await service.declareEclairDay(date, ECLAIR_VALUES.ECLAIR, {
        announce: true,
      });
      return declaredToast(date, seasonCount);
    },
  },

  [WIDGET_KEYS.ECLAIR_DAYS]: {
    async get(service) {
      logger.debug(`onWidgetGet <- ${WIDGET_KEYS.ECLAIR_DAYS}`);
      return eclairDaysContent(service);
    },

    async action(service, { actionKey, values }) {
      logger.info(`onWidgetAction <- ${WIDGET_KEYS.ECLAIR_DAYS}.${actionKey}`);
      if (actionKey === ACTION_KEYS.DECLARE) {
        const offset = values?.day === 'today' ? 0 : 1;
        const date = localDateAfter(service.now(), ECLAIR_TIMEZONE, offset);
        const { seasonCount } = await service.declareEclairDay(date, ECLAIR_VALUES.ECLAIR, {
          announce: true,
        });
        return declaredToast(date, seasonCount);
      }
      if (actionKey === ACTION_KEYS.CANCEL) {
        // An older core relays the button without its form values: refuse it
        // rather than guess a day.
        if (typeof values?.date !== 'string') {
          throw new Error('No day to cancel');
        }
        await service.declareEclairDay(values.date, ECLAIR_VALUES.NORMAL);
        return {
          en: `${values.date} is a normal day again.`,
          fr: `Le ${values.date} redevient un jour normal.`,
          de: `Der ${values.date} ist wieder ein normaler Tag.`,
          es: `El ${values.date} vuelve a ser un día normal.`,
        };
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },
};
