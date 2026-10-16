import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { contract, created, makeService } from './helpers/fixtures.js';
import { WIDGET_KEYS } from '../src/service.js';
import { WIDGETS } from '../src/widgets.js';

const request = (settings = {}) => ({ settings, language: 'fr', units: 'metric' });
const tariffStatus = WIDGETS[WIDGET_KEYS.TARIFF_STATUS];
const eclairDays = WIDGETS[WIDGET_KEYS.ECLAIR_DAYS];

async function contentsOf(service) {
  return Promise.all(Object.values(WIDGETS).map((widget) => widget.get(service, request())));
}

test('every content is rendered exactly as sent', async () => {
  const scenarios = [
    await makeService(),
    await makeService({ contracts: [contract('c1', 'access-base')] }),
    await makeService({ contracts: [contract('c1', 'charge-heures')] }),
    await makeService({ contracts: [contract('c1', 'heures-eco-plus')] }),
    await makeService({
      contracts: [contract('c1', 'heures-eco-plus')],
      calendar: [
        { starts_at: '2026-11-03T00:00:00.000Z', value: 'eclair' },
        { starts_at: '2026-11-20T00:00:00.000Z', value: 'eclair' },
      ],
    }),
  ];
  for (const { service } of scenarios) {
    for (const content of await contentsOf(service)) {
      // [] = nothing the core would drop, truncate or trim to the budget.
      assert.deepEqual(validateWidgetContent(content), []);
    }
  }
});

test('without a contract the tariff widget says how to create one', async () => {
  const { service } = await makeService();
  const content = await tariffStatus.get(service, request());
  assert.equal(content.components[0].type, 'text');
  assert.match(content.components[0].text.fr, /Énergie > Contrats/);
});

test('the price tile is live once the device exists', async () => {
  const contracts = [contract('c1', 'access-hphc')];
  const { service: before } = await makeService({ contracts });
  const [device] = before.discoveredDevices();
  assert.equal((await tariffStatus.get(before, request())).components[0].value, 0.1965);

  const { service } = await makeService({ contracts, devices: [created(device)] });
  const tile = (await tariffStatus.get(service, request())).components[0];
  assert.equal(tile.device_feature, `${device.external_id}:price`);
});

test('the widget follows the contract chosen in its settings', async () => {
  const { service } = await makeService({
    contracts: [contract('c1', 'access-base'), contract('c2', 'charge-heures')],
  });
  const second = service.discoveredDevices()[1].external_id;
  const content = await tariffStatus.get(service, request({ device: second }));
  assert.match(content.components[2].text.en, /Charge'Heures/);
});

test('every button of every content is handled and answers a short toast', async () => {
  const { service } = await makeService({
    contracts: [contract('c1', 'heures-eco-plus')],
    calendar: [{ starts_at: '2026-11-22T00:00:00.000Z', value: 'eclair' }],
  });
  for (const [key, widget] of Object.entries(WIDGETS)) {
    const content = await widget.get(service, request());
    const buttons = content.components.filter((component) => component.type === 'button');
    assert.ok(buttons.length > 0, `${key} has buttons`);
    for (const { action } of buttons) {
      // What the core relays: the declared defaults, else the last option (the latest day).
      const values = action.fields
        ? Object.fromEntries(
            action.fields.map((field) => [field.key, field.default ?? field.options.at(-1).value]),
          )
        : undefined;
      const toast = await widget.action(service, { actionKey: action.key, params: {}, values });
      assert.ok(toast.en && toast.en.length <= 200, `${key}.${action.key}`);
      assert.ok(toast.fr && toast.de && toast.es, `${key}.${action.key} speaks four languages`);
    }
  }
  assert.equal(service.eclair.isEclair('2026-11-22'), false, 'the cancel button worked');
  assert.equal(service.eclair.isEclair('2026-11-20'), true, 'the declare buttons worked');
});

test('a cancel relayed without its form values is refused', async () => {
  const { service } = await makeService({ contracts: [contract('c1', 'heures-eco-plus')] });
  await assert.rejects(
    eclairDays.action(service, { actionKey: 'cancel', params: {} }),
    /No day to cancel/,
  );
});

test('an unknown widget action fails, so the user sees the error', async () => {
  const { service } = await makeService();
  for (const widget of Object.values(WIDGETS)) {
    await assert.rejects(
      widget.action(service, { actionKey: 'unknown', params: {} }),
      /Unknown widget action/,
    );
  }
});

test('refreshWidgets nudges every widget', async () => {
  const { gladys, service } = await makeService();
  service.refreshWidgets();
  assert.deepEqual(gladys.fake.widgetRefreshes, Object.keys(WIDGETS));
});
