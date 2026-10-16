// -----------------------------------------------------------------------------
// Local clock of a contract.
//
// Tariff slots are local times ("off-peak from 22:00 to 06:00", Paris time),
// and the container runs in UTC: every instant is read in the contract
// timezone through Intl, which knows the daylight saving changes. No date
// library: Node ships the IANA database.
// -----------------------------------------------------------------------------

const WEEKDAYS = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

const formatters = new Map();

function formatter(timezone) {
  if (!formatters.has(timezone)) {
    formatters.set(
      timezone,
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hourCycle: 'h23',
      }),
    );
  }
  return formatters.get(timezone);
}

/**
 * The local reading of an instant.
 * @param {Date} instant
 * @param {string} timezone IANA name, e.g. Europe/Paris
 * @returns {{ date: string, monthDay: string, month: number, minutes: number, weekday: string, time: string }}
 */
export function localParts(instant, timezone) {
  const parts = Object.fromEntries(
    formatter(timezone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    monthDay: `${parts.month}-${parts.day}`,
    month: Number(parts.month),
    minutes: hour * 60 + minute,
    weekday: WEEKDAYS[parts.weekday],
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** `HH:MM` → minutes since midnight (24:00 → 1440). */
export function toMinutes(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

/** The local date (`YYYY-MM-DD`) `days` days after the one of `instant`. */
export function localDateAfter(instant, timezone, days) {
  // Noon UTC of the local date never crosses a day boundary when shifted.
  const { date } = localParts(instant, timezone);
  const noon = new Date(`${date}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + days);
  return noon.toISOString().slice(0, 10);
}

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
