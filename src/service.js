// -----------------------------------------------------------------------------
// The TotalEnergies service: the contracts, their tariff, the clock.
//
// What it holds:
//   - the Gladys energy contracts created from the templates of this
//     integration (`getEnergyContracts`), each with its tariff substituted
//     with the values the user typed in the contract wizard;
//   - the Éclair days calendar (Heures Eco+, src/eclair.js).
//
// What it does every minute (`tick`):
//   - computes the period and the price of every contract;
//   - publishes them on the contract device when the user created it
//     (`publishChangedStates`: a value is only sent when it changed);
//   - fires `tariff_period_changed` on every change of period, and
//     `vigilance_upcoming` once before each vigilance slot;
//   - nudges the dashboard widgets when what they show changed.
//
// Everything is computed here: there is no TotalEnergies API to call.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { EclairCalendar, ECLAIR_TIMEZONE } from './eclair.js';
import { contractInputs, readsEclairCalendar, TEMPLATES } from './manifest.js';
import { buildContractDevice, contractIds, FEATURE } from './devices/contract.js';
import { nextChange, nextPeriodStart, priceAt, substituteInputs } from './tariff/engine.js';
import { periodKey, templatePeriods } from './tariff/periods.js';
import { localDateAfter, localParts } from './tariff/time.js';

const logger = createLogger({ name: 'service' });

/** Scene trigger keys, as declared in the manifest `scene_triggers`. */
export const TRIGGERS = {
  TARIFF_PERIOD_CHANGED: 'tariff_period_changed',
  VIGILANCE_UPCOMING: 'vigilance_upcoming',
  ECLAIR_DAY_ANNOUNCED: 'eclair_day_announced',
};

/** Widget keys, as declared in the manifest `widgets`. */
export const WIDGET_KEYS = { TARIFF_STATUS: 'tariff_status', ECLAIR_DAYS: 'eclair_days' };

// An unchanged price is re-sent every 30 minutes, so it stays recently dated.
const STATE_HEARTBEAT_MS = 30 * 60 * 1000;

const DEFAULT_TIMEZONE = 'Europe/Paris';

/** `YYYY-MM-DD HH:MM` in the given timezone. */
export function formatLocal(instant, timezone) {
  const { date, time } = localParts(instant, timezone);
  return `${date} ${time}`;
}

export class TotalEnergiesService {
  /**
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
   * @param {{ now?: () => Date }} [options] `now` is replaced by the tests
   */
  constructor(gladys, { now = () => new Date() } = {}) {
    this.gladys = gladys;
    this.now = now;
    this.config = normalizeConfig();
    this.entries = [];
    this.eclair = new EclairCalendar();
    this.createdDevices = new Set();
    this.lastViews = new Map();
    this.notifiedVigilance = new Set();
  }

  setConfig(raw) {
    this.config = normalizeConfig(raw);
  }

  /** The contracts that read the Éclair calendar (Heures Eco+). */
  get eclairEntries() {
    return this.entries.filter((entry) => readsEclairCalendar(entry.template));
  }

  /**
   * Re-read the contracts, the Éclair calendar and the created devices.
   * Called on every (re)connection, every 15 minutes, and after an action
   * that may have changed them.
   */
  async refresh() {
    const contracts = await this.gladys.getEnergyContracts();
    this.entries = contracts
      // A scheduled contract has not started yet, an expired one is over.
      .filter((contract) => contract.status === 'active' && TEMPLATES.has(contract.template_key))
      .map((contract) => {
        const template = TEMPLATES.get(contract.template_key);
        return {
          contract,
          template,
          tariff: substituteInputs(template.tariff, contractInputs(template, contract)),
          timezone: contract.timezone || DEFAULT_TIMEZONE,
          periods: templatePeriods(template),
        };
      })
      .sort((a, b) => (a.contract.valid_from < b.contract.valid_from ? -1 : 1));

    const eclairEntries = this.eclairEntries;
    if (eclairEntries.length > 0) {
      await this.eclair.load(this.gladys, this.now());
      await this.fillEclairCalendar();
    }

    const devices = await this.gladys.getDevices();
    this.createdDevices = new Set(devices.map((device) => device.external_id));
    logger.info(`${this.entries.length} TotalEnergies contract(s) found`);
  }

  /** Write `normal` on the elapsed days of the Heures Eco+ contracts that have no value. */
  async fillEclairCalendar() {
    const eclairEntries = this.eclairEntries;
    if (eclairEntries.length === 0) {
      return;
    }
    const since = eclairEntries.map((entry) => entry.contract.valid_from).sort()[0];
    await this.eclair.fillNormalDays(this.gladys, since, this.now());
  }

  /** The discovery payload: one device per contract. */
  discoveredDevices() {
    return this.entries.map((entry) => buildContractDevice(this.gladys, entry));
  }

  /** The contract owning a device external_id, or undefined. */
  findByDevice(externalId) {
    return this.entries.find(
      (entry) => contractIds(this.gladys, entry.contract).device === externalId,
    );
  }

  /** The contract a widget or a scene points at: the chosen one, the first one otherwise. */
  resolveEntry(externalId) {
    if (externalId) {
      return this.findByDevice(externalId);
    }
    return this.entries[0];
  }

  /**
   * What a contract is right now: its period, its price, the next change,
   * and the Éclair days around.
   */
  view(entry, at = this.now()) {
    const { tariff, timezone } = entry;
    const lookup = this.eclair.lookup;
    const current = priceAt(tariff, at, timezone, lookup);
    const next = nextChange(tariff, at, timezone, lookup);
    const today = localParts(at, ECLAIR_TIMEZONE).date;
    const tomorrow = localDateAfter(at, ECLAIR_TIMEZONE, 1);
    const eclair = readsEclairCalendar(entry.template);
    return {
      period: periodKey(current.label),
      price: current.price,
      next: next && { at: next.at, period: periodKey(next.label), price: next.price },
      eclair,
      eclairToday: eclair && this.eclair.isEclair(today),
      eclairTomorrow: eclair && this.eclair.isEclair(tomorrow),
    };
  }

  /** Run once a minute: publish, fire the triggers, nudge the widgets. */
  async tick() {
    const at = this.now();
    let widgetsChanged = false;
    try {
      await this.fillEclairCalendar();
    } catch (err) {
      logger.warn('Could not write the normal days of the Éclair calendar', err);
    }
    for (const entry of this.entries) {
      try {
        widgetsChanged = (await this.tickEntry(entry, at)) || widgetsChanged;
      } catch (err) {
        logger.error(`Tick failed for contract ${entry.contract.id}`, err);
      }
    }
    if (widgetsChanged) {
      this.refreshWidgets();
    }
  }

  async tickEntry(entry, at) {
    const ids = contractIds(this.gladys, entry.contract);
    const view = this.view(entry, at);
    const previous = this.lastViews.get(entry.contract.id);
    this.lastViews.set(entry.contract.id, view);

    if (this.createdDevices.has(ids.device)) {
      const states = [
        { device_feature_external_id: ids.feature(FEATURE.PERIOD), text: view.period },
      ];
      if (view.price !== null) {
        states.push({ device_feature_external_id: ids.feature(FEATURE.PRICE), state: view.price });
      }
      await this.gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }

    // The first tick after a start only records the state: a restart is not
    // a change of period.
    if (previous && previous.period !== view.period) {
      logger.info(`Contract ${entry.contract.id}: ${previous.period} -> ${view.period}`);
      await this.gladys.publishSceneEvent(TRIGGERS.TARIFF_PERIOD_CHANGED, {
        device: ids.device,
        period: view.period,
        previous_period: previous.period,
        price: view.price,
      });
    }

    if (view.eclair) {
      await this.warnVigilance(entry, ids, at);
    }
    return !previous || previous.period !== view.period || previous.price !== view.price;
  }

  /** Fire `vigilance_upcoming` once per vigilance slot, `notice` minutes ahead. */
  async warnVigilance(entry, ids, at) {
    const notice = this.config.vigilance_notice_minutes;
    const slot = nextPeriodStart(entry.tariff, at, entry.timezone, this.eclair.lookup, 'HV', 24);
    if (!slot) {
      return;
    }
    const minutesBefore = Math.round((slot.startsAt.getTime() - at.getTime()) / 60000);
    const key = `${entry.contract.id}:${slot.startsAt.toISOString()}`;
    if (minutesBefore > notice || this.notifiedVigilance.has(key)) {
      return;
    }
    this.notifiedVigilance.add(key);
    await this.gladys.publishSceneEvent(TRIGGERS.VIGILANCE_UPCOMING, {
      device: ids.device,
      starts_at: localParts(slot.startsAt, entry.timezone).time,
      ends_at: localParts(slot.endsAt, entry.timezone).time,
      minutes_before: minutesBefore,
    });
  }

  /**
   * Declare a day `eclair` or `normal`.
   * @param {string} date `YYYY-MM-DD`
   * @param {string} value `eclair` | `normal`
   * @param {{ announce?: boolean }} [options] fire `eclair_day_announced`;
   *   never from a scene action, or a scene bound to it would loop.
   * @returns {Promise<{ changed: boolean, seasonCount: number }>}
   */
  async declareEclairDay(date, value, { announce = false } = {}) {
    const at = this.now();
    const { changed } = await this.eclair.declare(this.gladys, date, value, at);
    const seasonCount = this.eclair.seasonDays(date).length;
    if (changed && announce && value === 'eclair') {
      await this.gladys.publishSceneEvent(TRIGGERS.ECLAIR_DAY_ANNOUNCED, {
        date,
        is_tomorrow: date === localDateAfter(at, ECLAIR_TIMEZONE, 1),
        season_count: seasonCount,
      });
    }
    if (changed) {
      this.refreshWidgets();
    }
    return { changed, seasonCount };
  }

  /**
   * Freshness nudge: ask the core to re-pull every widget NOW instead of
   * waiting for the content TTL. Fire-and-forget, rate-limited core-side.
   */
  refreshWidgets() {
    for (const key of Object.values(WIDGET_KEYS)) {
      this.gladys.requestWidgetRefresh(key);
    }
  }
}
