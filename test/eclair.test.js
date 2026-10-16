import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { EclairCalendar, seasonOf } from '../src/eclair.js';

const KEY = 'eclair-days';
const fakeGladys = (entries = []) => createFakeGladys({ energyCalendars: { [KEY]: entries } });
const NOW = new Date('2026-11-19T20:00:00Z');

test('a season runs from 15 October to 15 April, summer belongs to the last one', () => {
  assert.deepEqual(seasonOf('2026-11-20'), { from: '2026-10-15', to: '2027-04-15' });
  assert.deepEqual(seasonOf('2027-02-01'), { from: '2026-10-15', to: '2027-04-15' });
  assert.deepEqual(seasonOf('2026-07-01'), { from: '2025-10-15', to: '2026-04-15' });
  assert.deepEqual(seasonOf('2026-10-15'), { from: '2026-10-15', to: '2027-04-15' });
});

test('a declared day is written to the Gladys calendar and read back after a restart', async () => {
  const gladys = fakeGladys();
  const calendar = new EclairCalendar();
  const { changed } = await calendar.declare(gladys, '2026-11-20', 'eclair', NOW);
  assert.equal(changed, true);
  assert.deepEqual(gladys.fake.publishedEnergyCalendars.at(-1), {
    calendar_key: KEY,
    entries: [{ date: '2026-11-20', value: 'eclair' }],
  });

  const restarted = new EclairCalendar();
  await restarted.load(gladys, NOW);
  assert.equal(restarted.isEclair('2026-11-20'), true);
  assert.equal(restarted.isEclair('2026-11-19'), false);
  assert.deepEqual(restarted.seasonDays('2026-11-19'), ['2026-11-20']);
  assert.deepEqual(restarted.upcomingDays('2026-11-21'), []);
});

test('a real Gladys returns the local midnight: read as the right day', async () => {
  // 2026-11-20 00:00 in Paris is 2026-11-19 23:00 UTC.
  const gladys = fakeGladys([{ starts_at: '2026-11-19T23:00:00.000Z', value: 'eclair' }]);
  const calendar = new EclairCalendar();
  await calendar.load(gladys, NOW);
  assert.equal(calendar.isEclair('2026-11-20'), true);
});

test('declaring the same value twice changes nothing', async () => {
  const gladys = fakeGladys();
  const calendar = new EclairCalendar();
  await calendar.declare(gladys, '2026-11-20', 'eclair', NOW);
  assert.equal((await calendar.declare(gladys, '2026-11-20', 'eclair', NOW)).changed, false);
});

test('dates Gladys refuses are refused before any request', async () => {
  const gladys = fakeGladys();
  const calendar = new EclairCalendar();
  assert.match(calendar.checkDate('20/11/2026', NOW), /YYYY-MM-DD/);
  assert.match(calendar.checkDate('2026-02-30', NOW), /YYYY-MM-DD/);
  assert.match(calendar.checkDate('2026-11-30', NOW), /7 days ahead/);
  assert.equal(calendar.checkDate('2026-11-26', NOW), null);
  await assert.rejects(calendar.declare(gladys, '2026-12-25', 'eclair', NOW), /7 days ahead/);
  assert.equal(gladys.fake.publishedEnergyCalendars.length, 0);
});

test('normal days fill the holes up to today, never over a declared day', async () => {
  const gladys = fakeGladys();
  const calendar = new EclairCalendar();
  await calendar.declare(gladys, '2026-11-17', 'eclair', NOW);
  const written = await calendar.fillNormalDays(gladys, '2026-11-15', NOW);
  assert.equal(written, 4, '15, 16, 18 and 19 November');
  assert.equal(calendar.isEclair('2026-11-17'), true);
  assert.equal(calendar.valueOf('2026-11-19'), 'normal');
  assert.equal(calendar.valueOf('2026-11-20'), undefined, 'tomorrow is left open');
  assert.equal(await calendar.fillNormalDays(gladys, '2026-11-15', NOW), 0);
});

test('a long history is written in batches Gladys accepts', async () => {
  const gladys = fakeGladys();
  const calendar = new EclairCalendar();
  await calendar.fillNormalDays(gladys, '2020-01-01', NOW);
  const batches = gladys.fake.publishedEnergyCalendars;
  assert.ok(batches.length >= 1);
  for (const batch of batches) {
    assert.ok(batch.entries.length <= 2000);
  }
  // Never more than 5 years back.
  const oldest = batches[0].entries[0].date;
  assert.ok(oldest >= '2021-11-19', oldest);
});
