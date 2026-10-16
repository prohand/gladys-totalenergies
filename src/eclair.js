// -----------------------------------------------------------------------------
// Éclair days of the Heures Eco+ offer.
//
// Heures Eco+ has 20 "jours Éclair" a year, between 15 October and 15 April,
// with vigilance hours (7:00-15:00 and 18:00-20:00) priced about three times
// the usual kWh. TotalEnergies announces them the evening before, by e-mail
// and text message only: there is no API to read them from. So the user (or a
// scene) declares them, and the integration keeps them in the `eclair-days`
// tariff calendar it declares in the manifest. Gladys reads that calendar to
// price the vigilance hours; the integration reads it back after a restart.
//
// Why "normal" days are written too: a day without any value is a hole in
// the calendar, and Gladys applies the tariff fallback there. Every elapsed
// day of an Heures Eco+ contract carries an explicit value, so the off-peak
// hours of an ordinary day are always priced as off-peak.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { ECLAIR_CALENDAR_KEY, ECLAIR_VALUES } from './manifest.js';
import { isIsoDate, localDateAfter, localParts } from './tariff/time.js';

const logger = createLogger({ name: 'eclair' });

export const ECLAIR_TIMEZONE = 'Europe/Paris';

/** TotalEnergies grants 20 Éclair days per season. */
export const ECLAIR_DAYS_PER_SEASON = 20;

// Gladys accepts calendar entries from 5 years back to 7 days ahead, 2,000
// per call.
const MAX_DAYS_AHEAD = 7;
const MAX_DAYS_BACK = 5 * 365;
const MAX_ENTRIES_PER_CALL = 2000;

function addDays(date, days) {
  const noon = new Date(`${date}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + days);
  return noon.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000);
}

/**
 * The Éclair season a date belongs to: 15 October to 15 April. A summer date
 * belongs to the season that just ended.
 * @param {string} date `YYYY-MM-DD`
 * @returns {{ from: string, to: string }}
 */
export function seasonOf(date) {
  const year = Number(date.slice(0, 4));
  const monthDay = date.slice(5);
  const startYear = monthDay >= '10-15' ? year : year - 1;
  return { from: `${startYear}-10-15`, to: `${startYear + 1}-04-15` };
}

export class EclairCalendar {
  constructor() {
    /** @type {Map<string, string>} local date → calendar value */
    this.days = new Map();
  }

  /** The value of a day, `undefined` when the calendar has none. */
  valueOf(date) {
    return this.days.get(date);
  }

  isEclair(date) {
    return this.days.get(date) === ECLAIR_VALUES.ECLAIR;
  }

  /** Calendar lookup for the tariff engine. */
  lookup = (key, date) => (key === ECLAIR_CALENDAR_KEY ? this.days.get(date) : undefined);

  /** Éclair days of the season of `date`, oldest first. */
  seasonDays(date) {
    const { from, to } = seasonOf(date);
    return [...this.days.entries()]
      .filter(([day, value]) => value === ECLAIR_VALUES.ECLAIR && day >= from && day <= to)
      .map(([day]) => day)
      .sort();
  }

  /** Éclair days from `date` on, oldest first. */
  upcomingDays(date) {
    return [...this.days.entries()]
      .filter(([day, value]) => value === ECLAIR_VALUES.ECLAIR && day >= date)
      .map(([day]) => day)
      .sort();
  }

  /**
   * Read the calendar back from Gladys (after a restart): the days of the
   * current and the previous season, and the week ahead.
   */
  async load(gladys, now = new Date()) {
    const today = localParts(now, ECLAIR_TIMEZONE).date;
    const from = new Date(`${addDays(today, -400)}T00:00:00Z`);
    const to = new Date(`${addDays(today, MAX_DAYS_AHEAD + 1)}T00:00:00Z`);
    const entries = await gladys.getEnergyCalendar(ECLAIR_CALENDAR_KEY, { from, to });
    this.days.clear();
    for (const entry of entries) {
      // A daily entry starts at a local midnight: its local date is the day.
      this.days.set(localParts(new Date(entry.starts_at), ECLAIR_TIMEZONE).date, entry.value);
    }
    logger.debug(`Éclair calendar loaded: ${this.days.size} day(s)`);
  }

  /**
   * Set the value of one day (`eclair` or `normal`).
   * @returns {Promise<{ changed: boolean }>}
   */
  async declare(gladys, date, value, now = new Date()) {
    const check = this.checkDate(date, now);
    if (check) {
      throw new Error(check);
    }
    const changed = this.days.get(date) !== value;
    await gladys.publishEnergyCalendar(ECLAIR_CALENDAR_KEY, [{ date, value }]);
    this.days.set(date, value);
    logger.info(`Day ${date} declared ${value}`);
    return { changed };
  }

  /** Why a date cannot be written, or null. */
  checkDate(date, now = new Date()) {
    if (!isIsoDate(date)) {
      return `Invalid date "${date}": expected YYYY-MM-DD`;
    }
    const today = localParts(now, ECLAIR_TIMEZONE).date;
    const offset = daysBetween(today, date);
    if (offset > MAX_DAYS_AHEAD) {
      return `${date} is more than ${MAX_DAYS_AHEAD} days ahead`;
    }
    if (offset < -MAX_DAYS_BACK) {
      return `${date} is more than 5 years ago`;
    }
    return null;
  }

  /**
   * Write `normal` on every day from `since` to today that has no value yet,
   * so the calendar has no hole (see the header). Days already declared are
   * never overwritten.
   * @returns {Promise<number>} number of days written
   */
  async fillNormalDays(gladys, since, now = new Date()) {
    const today = localParts(now, ECLAIR_TIMEZONE).date;
    const oldest = localDateAfter(now, ECLAIR_TIMEZONE, -MAX_DAYS_BACK);
    let day = since > oldest ? since : oldest;
    const missing = [];
    for (; day <= today; day = addDays(day, 1)) {
      if (!this.days.has(day)) {
        missing.push(day);
      }
    }
    for (let i = 0; i < missing.length; i += MAX_ENTRIES_PER_CALL) {
      const batch = missing.slice(i, i + MAX_ENTRIES_PER_CALL);
      await gladys.publishEnergyCalendar(
        ECLAIR_CALENDAR_KEY,
        batch.map((date) => ({ date, value: ECLAIR_VALUES.NORMAL })),
      );
      for (const date of batch) {
        this.days.set(date, ECLAIR_VALUES.NORMAL);
      }
    }
    if (missing.length > 0) {
      logger.debug(`${missing.length} normal day(s) written to the Éclair calendar`);
    }
    return missing.length;
  }
}
