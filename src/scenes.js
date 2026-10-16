// -----------------------------------------------------------------------------
// Scene actions (SDK v0.14+, Gladys 5.1+).
//
// Each handler is keyed by the `key` of the manifest `scene_actions` field;
// index.js registers it with `gladys.onSceneAction(key, ...)`. It receives
// the RESOLVED fields and returns the declared scalar `outputs`.
//
// A scene action is never a condition: a contract that cannot be found is
// an output (`found: false`), not a failure — the scene author gates on it.
// And a scene action never fires a scene event: `declare_eclair_day` does
// not fire `eclair_day_announced`, or a scene bound to it would loop.
//
// The scene TRIGGERS are fired by the service (src/service.js).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { ECLAIR_TIMEZONE } from './eclair.js';
import { ECLAIR_VALUES } from './manifest.js';
import { formatLocal } from './service.js';
import { localDateAfter } from './tariff/time.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTIONS = {
  async get_current_tariff(service, { fields }) {
    logger.info(`Scene action get_current_tariff <- ${fields.device}`);
    const entry = service.resolveEntry(fields.device);
    if (!entry) {
      return { found: false };
    }
    const view = service.view(entry);
    return {
      found: true,
      period: view.period,
      price: view.price,
      next_period: view.next?.period ?? null,
      next_change_at: view.next ? formatLocal(view.next.at, entry.timezone) : null,
      eclair_today: view.eclairToday,
      eclair_tomorrow: view.eclairTomorrow,
    };
  },

  async declare_eclair_day(service, { fields }) {
    const offset = fields.day === 'today' ? 0 : 1;
    const date = localDateAfter(service.now(), ECLAIR_TIMEZONE, offset);
    logger.info(`Scene action declare_eclair_day <- ${date}`);
    const { seasonCount } = await service.declareEclairDay(date, ECLAIR_VALUES.ECLAIR);
    return { declared: true, date, season_count: seasonCount };
  },
};
