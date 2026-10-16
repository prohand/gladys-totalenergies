// -----------------------------------------------------------------------------
// Shared fixtures: Gladys energy contracts and a service on the fake Gladys
// of the SDK, with a clock the test sets.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { ECLAIR_CALENDAR_KEY } from '../../src/manifest.js';
import { TotalEnergiesService } from '../../src/service.js';

/** A contract as `getEnergyContracts()` returns it. */
export function contract(id, templateKey, overrides = {}) {
  return {
    id,
    template_key: templateKey,
    template_version: '2026-10-01',
    pricing_mode: 'rules',
    inputs: {},
    valid_from: '2026-10-01',
    valid_to: null,
    timezone: 'Europe/Paris',
    currency: 'EUR',
    billing_period_start_day: 1,
    status: 'active',
    ...overrides,
  };
}

/**
 * A service on a fake Gladys. `clock.now` is the instant the service reads.
 * @param {{ contracts?: object[], devices?: object[], calendar?: object[], now?: string }} options
 */
export async function makeService({ contracts = [], devices = [], calendar = [], now } = {}) {
  const gladys = createFakeGladys({
    energyContracts: contracts,
    energyCalendars: { [ECLAIR_CALENDAR_KEY]: calendar },
    devices,
  });
  const clock = { now: new Date(now ?? '2026-11-19T20:00:00Z') };
  const service = new TotalEnergiesService(gladys, { now: () => clock.now });
  await service.refresh();
  return { gladys, service, clock };
}

/** The device Gladys stores once the user created a discovered one. */
export function created(device) {
  return { ...device, id: `id-${device.external_id}`, selector: device.external_id };
}
