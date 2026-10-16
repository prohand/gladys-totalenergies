// -----------------------------------------------------------------------------
// Device type: TARIFF OF ONE CONTRACT
//
// One device per Gladys energy contract created from a TotalEnergies
// template (Energy > Contracts). It carries what the contract does not show:
// the price per kWh right now, and the period it belongs to (peak, off-peak,
// super off-peak, vigilance). Both are computed by the integration from the
// contract tariff and pushed when they change (src/service.js): nothing to
// poll, no TotalEnergies account involved.
//
// The external id is built from the Gladys contract id: it is the stable,
// unique id of the "platform" here. Deleting and re-creating the contract in
// Gladys gives a new id, hence a new device.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { PERIODS } from '../tariff/periods.js';

export const DEVICE_TYPE = 'contract';

export const FEATURE = {
  PRICE: 'price',
  PERIOD: 'period',
};

/** The external ids of the device of a contract. */
export function contractIds(gladys, contract) {
  return gladys.externalIds(DEVICE_TYPE, contract.id);
}

/**
 * The discovery payload of the device of a contract.
 * @param {object} gladys
 * @param {{ contract: object, template: object, periods: string[] }} entry
 */
export function buildContractDevice(gladys, { contract, template, periods }) {
  const ids = contractIds(gladys, contract);
  return {
    // A French offer: the device is named like the template in French. The
    // user can rename it once created.
    name: template.name.fr ?? template.name.en,
    external_id: ids.device,
    features: [
      {
        name: 'Prix du kWh',
        external_id: ids.feature(FEATURE.PRICE),
        category: DEVICE_FEATURE_CATEGORIES.CURRENCY,
        type: DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.EURO,
        min: 0,
        max: 5,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      {
        name: 'Période tarifaire',
        external_id: ids.feature(FEATURE.PERIOD),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.SELECT,
        // The periods THIS contract can be in: a Base contract only has one.
        supported_options: periods.map((key, index) => ({
          value: key,
          label: PERIODS[key].name.fr,
          sort_order: index,
        })),
        min: 0,
        max: 0,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
    ],
  };
}
