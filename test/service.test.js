// -----------------------------------------------------------------------------
// The service: contracts read from Gladys, devices, published states, scene
// triggers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { contract, created, makeService } from './helpers/fixtures.js';
import { TRIGGERS } from '../src/service.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

test('only the active contracts of a known template are kept', async () => {
  const { service } = await makeService({
    contracts: [
      contract('c1', 'access-hphc'),
      contract('c2', 'access-base', { status: 'expired' }),
      contract('c3', 'access-base', { status: 'scheduled' }),
      contract('c4', 'a-template-renamed-long-ago'),
    ],
  });
  assert.deepEqual(
    service.entries.map((entry) => entry.contract.id),
    ['c1'],
  );
});

test('the inputs typed in the contract wizard win over the template defaults', async () => {
  const { service } = await makeService({
    contracts: [contract('c1', 'access-base', { inputs: { price_base: 0.25 } })],
  });
  assert.equal(service.view(service.entries[0]).price, 0.25);
});

test('Gladys accepts the contract devices', async () => {
  const { gladys, service } = await makeService({
    contracts: [contract('c1', 'heures-eco-plus'), contract('c2', 'access-base')],
  });
  // The fake Gladys refuses an unknown category, type or unit with a 400.
  await gladys.publishDiscoveredDevices(service.discoveredDevices());
  const [ecoPlus, base] = gladys.fake.discoveredDevices;
  assert.equal(ecoPlus.name, 'TotalEnergies Heures Eco+ – HP/HC/HV');
  assert.deepEqual(
    ecoPlus.features[1].supported_options.map((option) => option.value),
    ['hp', 'hc', 'hv'],
  );
  assert.deepEqual(
    base.features[1].supported_options.map((option) => option.value),
    ['base'],
  );
});

test('states are only published for a device the user created', async () => {
  const contracts = [contract('c1', 'access-hphc')];
  const first = await makeService({ contracts });
  await first.service.tick();
  assert.equal(first.gladys.fake.states.length, 0);

  const [device] = first.service.discoveredDevices();
  const { gladys, service } = await makeService({ contracts, devices: [created(device)] });
  await service.tick();
  assert.equal(gladys.fake.lastState(`${device.external_id}:period`), 'hp');
  assert.equal(gladys.fake.lastState(`${device.external_id}:price`), 0.1965);
  // Unchanged a minute later: nothing new is sent.
  const sent = gladys.fake.states.length;
  await service.tick();
  assert.equal(gladys.fake.states.length, sent);
});

test('a change of period fires tariff_period_changed once, not at startup', async () => {
  const { gladys, service, clock } = await makeService({
    contracts: [contract('c1', 'access-hphc')],
    now: '2026-11-19T20:58:00Z', // 21:58 Paris, peak
  });
  await service.tick();
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the first reading is no change');
  clock.now = new Date('2026-11-19T21:00:30Z'); // 22:00 Paris, off-peak
  await service.tick();
  await service.tick();
  const events = gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.TARIFF_PERIOD_CHANGED);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, {
    device: service.discoveredDevices()[0].external_id,
    period: 'hc',
    previous_period: 'hp',
    price: 0.1467,
  });
  assert.ok(gladys.fake.widgetRefreshes.includes('tariff_status'), 'the widget is nudged');
});

test('vigilance_upcoming fires once, the configured minutes before the slot', async () => {
  const { gladys, service, clock } = await makeService({
    contracts: [contract('c1', 'heures-eco-plus')],
    calendar: [{ starts_at: '2026-11-20T00:00:00.000Z', value: 'eclair' }],
    now: '2026-11-20T04:00:00Z', // 05:00 Paris, two hours before
  });
  service.setConfig({ vigilance_notice_minutes: 30 });
  await service.tick();
  assert.equal(gladys.fake.sceneEvents.length, 0, 'too early');
  clock.now = new Date('2026-11-20T05:30:00Z'); // 06:30 Paris
  await service.tick();
  clock.now = new Date('2026-11-20T05:31:00Z');
  await service.tick();
  const events = gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.VIGILANCE_UPCOMING);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, {
    device: service.discoveredDevices()[0].external_id,
    starts_at: '07:00',
    ends_at: '15:00',
    minutes_before: 30,
  });
});

test('an Éclair day declared by the user is announced, a cancel is not', async () => {
  const { gladys, service } = await makeService({ contracts: [contract('c1', 'heures-eco-plus')] });
  const { seasonCount } = await service.declareEclairDay('2026-11-20', 'eclair', {
    announce: true,
  });
  assert.equal(seasonCount, 1);
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: TRIGGERS.ECLAIR_DAY_ANNOUNCED,
    data: { date: '2026-11-20', is_tomorrow: true, season_count: 1 },
  });
  await service.declareEclairDay('2026-11-20', 'normal', { announce: true });
  assert.equal(gladys.fake.sceneEvents.length, 1);
});

test('an Heures Eco+ contract gets a calendar without holes since it started', async () => {
  const { gladys } = await makeService({
    contracts: [contract('c1', 'heures-eco-plus', { valid_from: '2026-11-01' })],
  });
  const days = gladys.fake.energyCalendars['eclair-days'];
  assert.equal(days.length, 19, '1 to 19 November');
  assert.ok(days.every((day) => day.value === 'normal'));
});

test('without an Heures Eco+ contract the Éclair calendar is left alone', async () => {
  const { gladys } = await makeService({ contracts: [contract('c1', 'access-hphc')] });
  assert.equal(gladys.fake.publishedEnergyCalendars.length, 0);
});

test('every event the service fires only carries keys its trigger declares', async () => {
  const { gladys, service, clock } = await makeService({
    contracts: [contract('c1', 'heures-eco-plus'), contract('c2', 'charge-heures')],
    now: '2026-11-19T20:00:00Z',
  });
  await service.declareEclairDay('2026-11-20', 'eclair', { announce: true });
  for (const iso of ['2026-11-19T20:00:00Z', '2026-11-20T05:10:00Z', '2026-11-20T06:00:00Z']) {
    clock.now = new Date(iso);
    await service.tick();
  }
  const fired = new Set(gladys.fake.sceneEvents.map((event) => event.key));
  assert.deepEqual([...fired].sort(), Object.values(TRIGGERS).sort(), 'all three are exercised');
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = manifest.scene_triggers.find((entry) => entry.key === key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}: data.${name} is not declared`);
      assert.ok(value === null || typeof value !== 'object', `${key}: data.${name} is a primitive`);
    }
  }
});
