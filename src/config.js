// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it
// (`gladys.getConfig()`) and notifies every change (`gladys.onConfigUpdated()`).
//
// The prices and the off-peak slots are NOT here: they belong to each energy
// contract, typed by the user in the Gladys contract wizard (Energy >
// Contracts), and read back with `gladys.getEnergyContracts()`.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Heures Eco+: minutes before a vigilance slot the `vigilance_upcoming`
  // scene trigger fires.
  vigilance_notice_minutes: 60,
};

const NOTICE_MIN = 5;
const NOTICE_MAX = 720;

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const notice = Number(raw.vigilance_notice_minutes ?? DEFAULT_CONFIG.vigilance_notice_minutes);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    // Config may arrive as strings from a form; keep it within the manifest bounds.
    vigilance_notice_minutes: Number.isFinite(notice)
      ? Math.min(NOTICE_MAX, Math.max(NOTICE_MIN, Math.round(notice)))
      : DEFAULT_CONFIG.vigilance_notice_minutes,
  };
}
