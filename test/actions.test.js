import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contract, makeService } from './helpers/fixtures.js';
import { ACTIONS } from '../src/actions.js';
import { LANGUAGES } from '../src/i18n.js';

function assertFourLanguages(message) {
  for (const language of LANGUAGES) {
    assert.ok(message[language], `the message has a ${language} text`);
  }
}

test('list_contracts lists the contracts Gladys holds for the integration', async () => {
  const { gladys, service } = await makeService();
  const empty = await ACTIONS.list_contracts(service);
  assertFourLanguages(empty);
  assert.match(empty.fr, /Aucun contrat/);

  // A contract created in the wizard since the last refresh is found.
  gladys.fake.energyContracts.push(contract('c1', 'access-hphc'));
  const message = await ACTIONS.list_contracts(service);
  assertFourLanguages(message);
  assert.equal(
    message.fr,
    'TotalEnergies Access – HP/HC (2026-10-01): Heures pleines, 0,1965 €/kWh',
  );
});

test('declare_eclair_day takes tomorrow when the date is left empty', async () => {
  const { gladys, service } = await makeService({ contracts: [contract('c1', 'heures-eco-plus')] });
  const message = await ACTIONS.declare_eclair_day(service, { fields: { date: '' } });
  assertFourLanguages(message);
  assert.match(message.en, /2026-11-20 is an Éclair day \(1\/20 this season\)/);
  assert.equal(gladys.fake.sceneEvents.at(-1).key, 'eclair_day_announced');
});

test('declare and cancel accept a typed date', async () => {
  const { service } = await makeService({ contracts: [contract('c1', 'heures-eco-plus')] });
  await ACTIONS.declare_eclair_day(service, { fields: { date: ' 2026-11-24 ' } });
  assert.equal(service.eclair.isEclair('2026-11-24'), true);
  const message = await ACTIONS.cancel_eclair_day(service, { fields: { date: '2026-11-24' } });
  assertFourLanguages(message);
  assert.equal(service.eclair.isEclair('2026-11-24'), false);
});

test('a wrong date is explained, not written', async () => {
  const { gladys, service } = await makeService({ contracts: [contract('c1', 'heures-eco-plus')] });
  const before = gladys.fake.publishedEnergyCalendars.length;
  for (const date of ['24/11/2026', '2027-01-15']) {
    const message = await ACTIONS.declare_eclair_day(service, { fields: { date } });
    assertFourLanguages(message);
    assert.match(message.en, /YYYY-MM-DD, at most 7 days ahead/);
  }
  assert.equal(gladys.fake.publishedEnergyCalendars.length, before);
});
