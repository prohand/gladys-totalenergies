// -----------------------------------------------------------------------------
// The local reading of the tariffs: periods and prices of every template of
// the manifest, at instants chosen around the slot boundaries and the
// daylight saving changes.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contractInputs, TEMPLATES } from '../src/manifest.js';
import {
  inTimeSlots,
  nextChange,
  nextPeriodStart,
  priceAt,
  priceSeries,
  substituteInputs,
} from '../src/tariff/engine.js';
import { localDateAfter, localParts } from '../src/tariff/time.js';

const PARIS = 'Europe/Paris';

/** The tariff of a template, with its defaults (or the given inputs). */
function tariffOf(key, inputs = {}) {
  const template = TEMPLATES.get(key);
  return substituteInputs(template.tariff, contractInputs(template, { inputs }));
}

const at = (iso) => new Date(iso);

test('local time follows the Paris daylight saving', () => {
  // 22:00 in Paris is 21:00 UTC in winter, 20:00 UTC in summer.
  assert.equal(localParts(at('2026-01-15T21:00:00Z'), PARIS).time, '22:00');
  assert.equal(localParts(at('2026-07-15T20:00:00Z'), PARIS).time, '22:00');
  assert.equal(localParts(at('2026-11-20T23:30:00Z'), PARIS).date, '2026-11-21');
  assert.equal(localParts(at('2026-11-20T12:00:00Z'), PARIS).weekday, 'fri');
  assert.equal(localDateAfter(at('2026-12-31T22:00:00Z'), PARIS, 0), '2026-12-31');
  assert.equal(localDateAfter(at('2026-12-31T23:30:00Z'), PARIS, 1), '2027-01-02');
});

test('time slots: start inclusive, end exclusive, crossing midnight', () => {
  const night = [['22:00', '06:00']];
  assert.equal(inTimeSlots(22 * 60, night), true);
  assert.equal(inTimeSlots(5 * 60 + 59, night), true);
  assert.equal(inTimeSlots(6 * 60, night), false);
  assert.equal(inTimeSlots(21 * 60 + 59, night), false);
  assert.equal(inTimeSlots(12 * 60, [['12:00', '14:00']]), true);
  assert.equal(inTimeSlots(14 * 60, [['12:00', '14:00']]), false);
  assert.equal(inTimeSlots(3 * 60, [['00:00', '24:00']]), true);
  assert.equal(inTimeSlots(3 * 60, [['05:00', '05:00']]), true, 'equal bounds cover the day');
});

test('placeholders take the value of the input, whatever its type', () => {
  const tariff = substituteInputs(
    { price: '{{input:p}}', time: '{{input:slots}}', label: 'HC {{input:p}}' },
    { p: 0.15, slots: [['22:00', '06:00']] },
  );
  assert.deepEqual(tariff, { price: 0.15, time: [['22:00', '06:00']], label: 'HC 0.15' });
});

test('a Base contract has one price all day', () => {
  const tariff = tariffOf('access-base');
  for (const iso of ['2026-11-19T03:00:00Z', '2026-11-19T12:00:00Z', '2026-11-19T22:00:00Z']) {
    assert.deepEqual(priceAt(tariff, at(iso), PARIS), { label: 'Base', price: 0.1823 });
  }
  assert.equal(
    nextChange(tariff, at('2026-11-19T12:00:00Z'), PARIS, () => undefined),
    null,
  );
});

test('an HP/HC contract follows the off-peak slots typed by the user', () => {
  const tariff = tariffOf('access-hphc', {
    off_peak_slots: [
      ['01:30', '07:30'],
      ['12:30', '14:30'],
    ],
  });
  // Winter: Paris = UTC + 1.
  assert.equal(priceAt(tariff, at('2026-11-19T00:00:00Z'), PARIS).label, 'HP'); // 01:00
  assert.equal(priceAt(tariff, at('2026-11-19T00:30:00Z'), PARIS).label, 'HC'); // 01:30
  assert.equal(priceAt(tariff, at('2026-11-19T06:29:00Z'), PARIS).label, 'HC'); // 07:29
  assert.equal(priceAt(tariff, at('2026-11-19T06:30:00Z'), PARIS).label, 'HP'); // 07:30
  assert.deepEqual(priceAt(tariff, at('2026-11-19T12:00:00Z'), PARIS), {
    label: 'HC',
    price: 0.1467,
  }); // 13:00
  const next = nextChange(tariff, at('2026-11-19T12:00:00Z'), PARIS, () => undefined);
  assert.equal(next.label, 'HP');
  assert.equal(localParts(next.at, PARIS).time, '14:30');
});

test('the default off-peak slots are 22:00 to 06:00, in summer too', () => {
  const tariff = tariffOf('heures-eco-hphc');
  assert.equal(priceAt(tariff, at('2026-07-15T20:00:00Z'), PARIS).label, 'HC'); // 22:00 CEST
  assert.equal(priceAt(tariff, at('2026-07-15T19:59:00Z'), PARIS).label, 'HP');
  assert.equal(priceAt(tariff, at('2026-07-16T04:00:00Z'), PARIS).label, 'HP'); // 06:00 CEST
});

test("Charge'Heures: super off-peak 2-6, off-peak 23-2 and 6-7, peak otherwise", () => {
  const tariff = tariffOf('charge-heures');
  const cases = [
    ['2026-11-19T21:59:00Z', 'HP', 0.2302], // 22:59
    ['2026-11-19T22:00:00Z', 'HC', 0.1576], // 23:00
    ['2026-11-20T01:00:00Z', 'HSC', 0.1335], // 02:00
    ['2026-11-20T04:59:00Z', 'HSC', 0.1335], // 05:59
    ['2026-11-20T05:00:00Z', 'HC', 0.1576], // 06:00
    ['2026-11-20T06:00:00Z', 'HP', 0.2302], // 07:00
  ];
  for (const [iso, label, price] of cases) {
    assert.deepEqual(priceAt(tariff, at(iso), PARIS), { label, price }, iso);
  }
});

test('Heures Eco+: vigilance hours only on an Éclair day, and they win over off-peak', () => {
  const eclair = new Set(['2026-11-20']);
  const lookup = (key, date) =>
    key === 'eclair-days' ? (eclair.has(date) ? 'eclair' : 'normal') : undefined;
  const tariff = tariffOf('heures-eco-plus', { off_peak_slots: [['12:00', '16:00']] });
  // An ordinary day: 13:00 off-peak, 19:00 peak.
  assert.equal(priceAt(tariff, at('2026-11-19T12:00:00Z'), PARIS, lookup).label, 'HC');
  assert.equal(priceAt(tariff, at('2026-11-19T18:00:00Z'), PARIS, lookup).label, 'HP');
  // The Éclair day: 13:00 and 19:00 are vigilance hours, 15:00-16:00 off-peak.
  assert.deepEqual(priceAt(tariff, at('2026-11-20T12:00:00Z'), PARIS, lookup), {
    label: 'HV',
    price: 0.6375,
  });
  assert.equal(priceAt(tariff, at('2026-11-20T18:00:00Z'), PARIS, lookup).label, 'HV');
  assert.equal(priceAt(tariff, at('2026-11-20T14:30:00Z'), PARIS, lookup).label, 'HC');
  assert.equal(priceAt(tariff, at('2026-11-20T19:00:00Z'), PARIS, lookup).label, 'HP'); // 20:00
  // A day without any calendar value is an ordinary day.
  assert.equal(priceAt(tariff, at('2026-11-21T12:00:00Z'), PARIS, () => undefined).label, 'HC');
});

test('the next vigilance slot is found past the changes in between', () => {
  const lookup = (key, date) => (date === '2026-11-20' ? 'eclair' : 'normal');
  const tariff = tariffOf('heures-eco-plus');
  // 04:00 Paris, off-peak until 06:00, then peak, then vigilance at 07:00.
  const slot = nextPeriodStart(tariff, at('2026-11-20T03:00:00Z'), PARIS, lookup, 'HV');
  assert.equal(localParts(slot.startsAt, PARIS).time, '07:00');
  assert.equal(localParts(slot.endsAt, PARIS).time, '15:00');
  // Without an Éclair day there is none.
  assert.equal(
    nextPeriodStart(tariff, at('2026-11-20T03:00:00Z'), PARIS, () => 'normal', 'HV'),
    null,
  );
});

test('every template prices every half hour of a day with a finite price', () => {
  for (const [key, template] of TEMPLATES) {
    // Generic templates have no default price: give them one.
    const inputs = Object.fromEntries(
      template.inputs
        .filter((input) => input.type === 'number' && input.default === undefined)
        .map((input) => [input.key, 0.2]),
    );
    const series = priceSeries(tariffOf(key, inputs), at('2026-11-20T00:00:00Z'), PARIS, () =>
      key === 'heures-eco-plus' ? 'eclair' : undefined,
    );
    assert.equal(series.length, 49, key);
    for (const point of series) {
      assert.ok(Number.isFinite(point.price) && point.price > 0, `${key}: ${point.price}`);
    }
  }
});

test('a tax adds its rate, a fixed component is no price per kWh', () => {
  const tariff = {
    tariff_version: 1,
    components: [
      { key: 'energy', kind: 'consumption', fallback: { label: 'Base', price: 0.1 } },
      { key: 'standing', kind: 'fixed', amount: 10, per: 'month' },
      { key: 'vat', kind: 'tax', rate: 20, applies_to: ['energy'] },
    ],
  };
  assert.deepEqual(priceAt(tariff, at('2026-11-20T12:00:00Z'), PARIS), {
    label: 'Base',
    price: 0.12,
  });
});

test('a rule that needs the consumption is skipped', () => {
  const tariff = {
    tariff_version: 1,
    components: [
      {
        key: 'energy',
        kind: 'consumption',
        rules: [{ label: 'Tier', when: { tier: { cumulative: 'day', from_kwh: 0 } }, price: 0.5 }],
        fallback: { label: 'Base', price: 0.2 },
      },
    ],
  };
  assert.equal(priceAt(tariff, at('2026-11-20T12:00:00Z'), PARIS).label, 'Base');
});
