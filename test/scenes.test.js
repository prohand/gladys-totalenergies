import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { contract, makeService } from './helpers/fixtures.js';
import { SCENE_ACTIONS } from '../src/scenes.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const outputsOf = (key) =>
  manifest.scene_actions.find((entry) => entry.key === key).outputs.map((output) => output.key);

function assertDeclared(key, outputs) {
  for (const name of Object.keys(outputs)) {
    assert.ok(outputsOf(key).includes(name), `${key}: output "${name}" is not declared`);
  }
}

test('get_current_tariff returns the period, the price and the next change', async () => {
  const { service } = await makeService({
    contracts: [contract('c1', 'charge-heures')],
    now: '2026-11-19T21:30:00Z', // 22:30 Paris
  });
  const device = service.discoveredDevices()[0].external_id;
  const outputs = await SCENE_ACTIONS.get_current_tariff(service, { fields: { device } });
  assert.deepEqual(outputs, {
    found: true,
    period: 'hp',
    price: 0.2302,
    next_period: 'hc',
    next_change_at: '2026-11-19 23:00',
    eclair_today: false,
    eclair_tomorrow: false,
  });
  assertDeclared('get_current_tariff', outputs);
});

test('get_current_tariff on an unknown contract is an output, not a failure', async () => {
  const { service } = await makeService();
  const outputs = await SCENE_ACTIONS.get_current_tariff(service, {
    fields: { device: 'ext:test-integration:contract:gone' },
  });
  assert.deepEqual(outputs, { found: false });
});

test('declare_eclair_day writes the day and fires no scene event', async () => {
  const { gladys, service } = await makeService({ contracts: [contract('c1', 'heures-eco-plus')] });
  const outputs = await SCENE_ACTIONS.declare_eclair_day(service, { fields: { day: 'tomorrow' } });
  assert.deepEqual(outputs, { declared: true, date: '2026-11-20', season_count: 1 });
  assertDeclared('declare_eclair_day', outputs);
  assert.equal(service.eclair.isEclair('2026-11-20'), true);
  // A scene bound to eclair_day_announced would otherwise loop.
  assert.equal(gladys.fake.sceneEvents.length, 0);

  const today = await SCENE_ACTIONS.declare_eclair_day(service, { fields: { day: 'today' } });
  assert.equal(today.date, '2026-11-19');
});
