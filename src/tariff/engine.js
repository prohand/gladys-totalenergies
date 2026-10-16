// -----------------------------------------------------------------------------
// Local reading of a tariff of the Gladys rule grammar (`tariff_version` 1).
//
// Gladys computes the COSTS of a contract itself, from the tariff of the
// manifest template. What it does not tell the integration is "which period
// are we in, and at what price, right now and next": the information a scene
// or a dashboard needs to start the water heater at off-peak time, or to warn
// before the Heures Eco+ vigilance hours. This module answers it from the
// same tariff, with the same rules as the core:
//
//   - the components are read in order; for a `consumption` one, the first
//     rule whose `when` matches gives the price, the `fallback` otherwise;
//   - a `tax` adds its percentage of the components it applies to;
//   - `fixed` and `demand` components are no price per kWh: left out.
//
// Only the conditions that depend on the clock and the calendars are
// evaluated (time, weekdays, months, season, dates, calendar, not_calendar).
// A rule carrying a `tier` or a `power_threshold` needs the consumption, which
// the integration never sees: such a rule is skipped. None of the
// TotalEnergies templates uses one.
// -----------------------------------------------------------------------------

import { localParts, toMinutes } from './time.js';

const HALF_HOUR_MS = 30 * 60 * 1000;
const PLACEHOLDER = /^\{\{input:([a-z0-9_]{1,64})\}\}$/;
const INLINE_PLACEHOLDER = /\{\{input:([a-z0-9_]{1,64})\}\}/g;

/**
 * Replace the `{{input:<key>}}` placeholders of a template tariff with the
 * contract values: a string that is exactly a placeholder takes the value
 * whatever its type (a number, a list of slots), a placeholder inside a longer
 * string is replaced by its text — the substitution Gladys applies.
 */
export function substituteInputs(value, inputs) {
  if (typeof value === 'string') {
    const exact = value.match(PLACEHOLDER);
    if (exact) {
      return inputs[exact[1]];
    }
    return value.replace(INLINE_PLACEHOLDER, (_match, key) => String(inputs[key] ?? ''));
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteInputs(item, inputs));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, substituteInputs(item, inputs)]),
    );
  }
  return value;
}

/** True when `minutes` falls in one of the `[start, end)` local slots. */
export function inTimeSlots(minutes, slots) {
  return slots.some(([start, end]) => {
    const from = toMinutes(start);
    const to = toMinutes(end);
    if (to > from) {
      return minutes >= from && minutes < to;
    }
    // An end at or before the start crosses midnight; equal covers the day.
    return minutes >= from || minutes < to;
  });
}

function calendarMatches(condition, local, lookup) {
  return Object.entries(condition).every(([key, expected]) => {
    const value = lookup(key, local.date);
    const accepted = Array.isArray(expected) ? expected : [expected];
    return value !== undefined && accepted.includes(value);
  });
}

function inSeason(monthDay, { from, to }) {
  return from <= to ? monthDay >= from && monthDay <= to : monthDay >= from || monthDay <= to;
}

/**
 * Whether the conditions of a rule hold at a local instant. A condition the
 * integration cannot evaluate (tier, power threshold) never holds.
 */
export function conditionsMatch(when, local, lookup) {
  if (when === undefined) {
    return true;
  }
  if (when.tier !== undefined || when.power_threshold !== undefined) {
    return false;
  }
  if (when.time !== undefined && !inTimeSlots(local.minutes, when.time)) {
    return false;
  }
  if (when.weekdays !== undefined && !when.weekdays.includes(local.weekday)) {
    return false;
  }
  if (when.months !== undefined && !when.months.includes(local.month)) {
    return false;
  }
  if (when.season !== undefined && !inSeason(local.monthDay, when.season)) {
    return false;
  }
  if (
    when.dates !== undefined &&
    (local.date < when.dates.from || (when.dates.to !== undefined && local.date > when.dates.to))
  ) {
    return false;
  }
  if (when.calendar !== undefined && !calendarMatches(when.calendar, local, lookup)) {
    return false;
  }
  if (when.not_calendar !== undefined) {
    const anyMatch = Object.entries(when.not_calendar).some(([key, expected]) =>
      calendarMatches({ [key]: expected }, local, lookup),
    );
    if (anyMatch) {
      return false;
    }
  }
  return true;
}

function rulePrice(rule, local, lookup) {
  if (rule.price !== undefined) {
    return Number(rule.price);
  }
  const value = lookup(rule.price_from_calendar, local.date);
  if (typeof value !== 'number') {
    return null;
  }
  return value * (rule.multiplier ?? 1) + (rule.offset ?? 0);
}

/**
 * The period and the price per kWh of a tariff at one instant.
 * @param {object} tariff a tariff whose placeholders are substituted
 * @param {Date} instant
 * @param {string} timezone the contract timezone
 * @param {(calendarKey: string, localDate: string) => string|number|undefined} lookup
 * @returns {{ label: string, price: number|null }}
 */
export function priceAt(tariff, instant, timezone, lookup = () => undefined) {
  const local = localParts(instant, timezone);
  const prices = new Map();
  let label = null;
  for (const component of tariff.components) {
    if (component.kind === 'consumption') {
      const rule =
        (component.rules ?? []).find((candidate) =>
          conditionsMatch(candidate.when, local, lookup),
        ) ?? component.fallback;
      const price = rule ? rulePrice(rule, local, lookup) : null;
      prices.set(component.key, price);
      label ??= rule?.label ?? component.label ?? component.key;
    } else if (component.kind === 'tax') {
      const base = component.applies_to.reduce((sum, key) => sum + (prices.get(key) ?? 0), 0);
      prices.set(component.key, (base * component.rate) / 100);
    }
  }
  const values = [...prices.values()];
  const price = values.some((value) => value === null)
    ? null
    : Math.round(values.reduce((sum, value) => sum + value, 0) * 10000) / 10000;
  return { label: label ?? 'base', price };
}

/** Start of the half-hour slot after `instant` (UTC grid = Paris grid). */
function nextHalfHour(instant) {
  return new Date(Math.floor(instant.getTime() / HALF_HOUR_MS) * HALF_HOUR_MS + HALF_HOUR_MS);
}

/**
 * The next instant the period or the price changes, within `horizonHours`.
 * Every TotalEnergies slot starts on the half-hour grid (the Enedis
 * off-peak slots too), so the tariff is read once per half hour.
 * @returns {{ at: Date, label: string, price: number|null } | null}
 */
export function nextChange(tariff, instant, timezone, lookup, horizonHours = 48) {
  const current = priceAt(tariff, instant, timezone, lookup);
  const end = instant.getTime() + horizonHours * 60 * 60 * 1000;
  for (
    let at = nextHalfHour(instant);
    at.getTime() <= end;
    at = new Date(at.getTime() + HALF_HOUR_MS)
  ) {
    const next = priceAt(tariff, at, timezone, lookup);
    if (next.label !== current.label || next.price !== current.price) {
      return { at, ...next };
    }
  }
  return null;
}

/**
 * The next slot (within `horizonHours`) a period labelled `label` STARTS, and
 * the instant it ends. Used for the "vigilance hours soon" warning, which
 * looks past the changes in between (off-peak ends at 06:00, vigilance
 * starts at 07:00).
 * @returns {{ startsAt: Date, endsAt: Date } | null}
 */
export function nextPeriodStart(tariff, instant, timezone, lookup, label, horizonHours = 48) {
  const end = instant.getTime() + horizonHours * 60 * 60 * 1000;
  let previous = priceAt(tariff, instant, timezone, lookup).label;
  let startsAt = null;
  for (
    let at = nextHalfHour(instant);
    at.getTime() <= end;
    at = new Date(at.getTime() + HALF_HOUR_MS)
  ) {
    const current = priceAt(tariff, at, timezone, lookup).label;
    if (startsAt === null && current === label && previous !== label) {
      startsAt = at;
    } else if (startsAt !== null && current !== label) {
      return { startsAt, endsAt: at };
    }
    previous = current;
  }
  return startsAt === null ? null : { startsAt, endsAt: new Date(end) };
}

/**
 * The price on the half-hour grid over the next `hours`: the points of the
 * dashboard chart.
 * @returns {{ at: Date, label: string, price: number|null }[]}
 */
export function priceSeries(tariff, instant, timezone, lookup, hours = 24) {
  const start = new Date(Math.floor(instant.getTime() / HALF_HOUR_MS) * HALF_HOUR_MS);
  const points = [];
  for (let i = 0; i <= hours * 2; i += 1) {
    const at = new Date(start.getTime() + i * HALF_HOUR_MS);
    points.push({ at, ...priceAt(tariff, at, timezone, lookup) });
  }
  return points;
}
