// -----------------------------------------------------------------------------
// Entry point of the TotalEnergies integration for Gladys Assistant.
//
// Role of this file: wire the SDK to the service (src/service.js). It holds
// no tariff logic. It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects, reads the contracts and starts the one-minute clock.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { ACTIONS } from './src/actions.js';
import { SCENE_ACTIONS } from './src/scenes.js';
import { TotalEnergiesService } from './src/service.js';
import { WIDGETS } from './src/widgets.js';

const gladys = new GladysIntegration();
const service = new TotalEnergiesService(gladys);

// The contracts are re-read every 15 minutes: one created in the Gladys
// wizard shows up in Discovery without restarting the integration.
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const TICK_INTERVAL_MS = 60 * 1000;

let tickTimer = null;
let refreshTimer = null;

/** Re-read the contracts, then republish the devices and their transport. */
async function refreshAndPublish() {
  await service.refresh();
  await gladys.publishDiscoveredDevices(service.discoveredDevices());
  // Everything is computed inside the container: every contract device is
  // served locally, whatever the network.
  const entries = service
    .discoveredDevices()
    .map((device) => ({ external_id: device.external_id, transport: DEVICE_TRANSPORTS.LOCAL }));
  if (entries.length > 0) {
    await gladys.publishTransports(entries);
  }
}

function runTick() {
  service.tick().catch((err) => logger.error('Tick failed', err));
}

/** Tick at the start of every minute, so a period change is seen on time. */
function startClock() {
  stopClock();
  const delay = TICK_INTERVAL_MS - (Date.now() % TICK_INTERVAL_MS) + 500;
  tickTimer = setTimeout(() => {
    runTick();
    tickTimer = setInterval(runTick, TICK_INTERVAL_MS);
  }, delay);
  refreshTimer = setInterval(() => {
    refreshAndPublish().catch((err) => logger.error('Contract refresh failed', err));
  }, REFRESH_INTERVAL_MS);
}

function stopClock() {
  clearTimeout(tickTimer);
  clearInterval(tickTimer);
  clearInterval(refreshTimer);
  tickTimer = null;
  refreshTimer = null;
}

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing the contract devices');
  await refreshAndPublish();
});

// --- Devices created / deleted by the user -----------------------------------
// A created device starts receiving its states at once, not at the next
// refresh.
gladys.onDeviceCreated(async (device) => {
  service.createdDevices.add(device.external_id);
  await service.tick();
});
gladys.onDeviceDeleted(async (device) => {
  service.createdDevices.delete(device.external_id);
});

// --- Manifest actions: buttons in the Configuration screen -------------------
for (const [actionKey, handler] of Object.entries(ACTIONS)) {
  gladys.onAction(actionKey, (fields) => handler(service, { fields }));
}

// --- Scene actions -----------------------------------------------------------
// The scene TRIGGERS need no handler: the service fires them with
// publishSceneEvent (src/service.js).
for (const [actionKey, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(actionKey, (fields) => handler(service, { fields }));
}

// --- Dashboard widgets -------------------------------------------------------
for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(widgetKey, (request) => widget.get(service, request));
  gladys.onWidgetAction(widgetKey, (actionKey, params, { settings, values } = {}) =>
    widget.action(service, { actionKey, params, settings, values }),
  );
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  service.setConfig(newConfig);
  service.refreshWidgets();
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    service.setConfig(await gladys.getConfig());
    await refreshAndPublish();
    runTick();
    startClock();
    // Nudges sent while the socket was down were dropped: re-sync dashboards.
    service.refreshWidgets();
    await gladys.setConnectionStatus(true);
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
        de: 'Die Initialisierung ist fehlgeschlagen, prüfen Sie die Logs der Integration.',
        es: 'La inicialización ha fallado, consulte los registros de la integración.',
      })
      .catch(() => {});
  }
});

gladys.on('disconnected', () => {
  stopClock();
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  stopClock();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the TotalEnergies integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
