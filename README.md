# TotalEnergies — Gladys Assistant integration

External integration bringing the **TotalEnergies** electricity offers
(France) into [Gladys Assistant](https://gladysassistant.com): contract
templates for the Gladys energy monitoring, the current tariff period and kWh
price of each contract, the Éclair days of Heures Eco+, scene triggers and
actions, and dashboard widgets.

Built on the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
(0.15). Requires **Gladys 5.2** or later (energy contracts).

User documentation: [English](./docs/en.md) · [Français](./docs/fr.md) ·
[Deutsch](./docs/de.md) · [Español](./docs/es.md).

> Community integration, not affiliated with TotalEnergies.

## What it does

| Surface               | What                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Energy contracts      | 10 templates in the Gladys contract wizard: Access, Heures Eco, Fixe 2 ans (Base, HP/HC), Charge'Heures, Heures Eco+, other offer |
| Tariff calendar       | `eclair-days`: the Éclair days of Heures Eco+, priced by Gladys (vigilance hours)                                                 |
| Devices               | One per contract: kWh price (`currency`) and tariff period (`text`/`select`)                                                      |
| Scene triggers        | `tariff_period_changed`, `vigilance_upcoming`, `eclair_day_announced`                                                             |
| Scene actions         | `get_current_tariff`, `declare_eclair_day`                                                                                        |
| Dashboard widgets     | `tariff_status` (price, period, next change, next 24 h), `eclair_days` (season count, declare, cancel)                            |
| Configuration actions | `list_contracts`, `declare_eclair_day`, `cancel_eclair_day`                                                                       |
| Languages             | English, French, German, Spanish                                                                                                  |

### How the contracts reach the energy monitoring

The templates live in the `energy_contracts` field of the
[manifest](./gladys-assistant-integration.json). Gladys reads them from the
installed manifest and offers them in its contract wizard next to the
community catalogue; the user picks one, types the prices of the bill (and the
off-peak slots set by Enedis), and Gladys computes the costs with its own
rule engine. The integration reads the contracts back with
`gladys.getEnergyContracts()` and evaluates **the same tariff** locally to
publish the current period and price every minute
([`src/tariff/engine.js`](./src/tariff/engine.js)).

### Local only

The manifest declares `"transports": ["local"]`: everything is computed in the
container, from the contracts stored in Gladys. TotalEnergies offers no public
API for its customers (consumption, contracts or Éclair days), so the
integration calls none. Éclair days, announced by e-mail and text message the
evening before, are declared by the user (widget, Configuration screen or
scene) and kept in the `eclair-days` tariff calendar.

## Project structure

```
.
├─ index.js                          # SDK wiring: handlers, clock (1 min), refresh (15 min)
├─ src/
│  ├─ service.js                     # contracts, tick, scene triggers, Éclair declarations
│  ├─ manifest.js                    # reads the manifest: templates, calendar key
│  ├─ tariff/engine.js               # local reading of a Gladys tariff (period, price, next change)
│  ├─ tariff/periods.js              # base / hp / hc / hsc / hv
│  ├─ tariff/time.js                 # local clock of a contract (Intl, DST-aware)
│  ├─ eclair.js                      # Éclair days calendar (load, declare, fill normal days)
│  ├─ devices/contract.js            # the device of a contract
│  ├─ actions.js                     # Configuration screen buttons
│  ├─ scenes.js                      # scene actions
│  ├─ widgets.js                     # dashboard widgets
│  ├─ format.js, i18n.js, config.js
├─ docs/{en,fr,de,es}.md             # user documentation, re-hosted by Gladys
├─ test/                             # node --test, against the SDK's fake Gladys
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ .github/workflows/                # ci, build, release, github-release
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ cover.png                         # catalog cover, 800×534 px
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="totalenergies" \
LOG_LEVEL=debug \
npm start
```

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the
first three on Node 22 and 24 on every push and pull request; pull requests
also build the Docker image and run the store admission checks. The store
check needs the image of the manifest version to exist on `ghcr.io`: it fails
until the first release is published.

## Release

1. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major`
   (`major` for the first `1.0.0`).

The workflow bumps `package.json` and the manifest (`version` +
`docker_image`), rolls the changelog, tags `vX.Y.Z`, builds the
`linux/amd64` + `linux/arm64` image to `ghcr.io/prohand/gladys-totalenergies`
and publishes the GitHub Release. Add the GitHub topic
`gladys-assistant-integration` to the repository and make the package public
so the store indexer picks it up.

## License

Apache-2.0
