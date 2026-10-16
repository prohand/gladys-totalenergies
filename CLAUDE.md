# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human
contributors working in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one
runtime dependency: `@gladysassistant/integration-sdk`) for the
**TotalEnergies** electricity offers (France). It started from the official
JavaScript template; its workflows mirror `prohand/gladys-devmel`.

It declares TotalEnergies contract templates (`energy_contracts`) for the
Gladys energy monitoring, feeds the `eclair-days` tariff calendar (Heures
Eco+), publishes one device per contract (kWh price + tariff period), and adds
scene triggers, scene actions and two dashboard widgets (Gladys 5.2+).

## Commands

```bash
npm install
npm test                                  # node --test (built-in runner)
node --test test/engine.test.js           # one file
node --test --test-name-pattern "Éclair"  # tests whose name matches
npm run lint                              # eslint .
npm run format:check                      # prettier --check . (CI gate)
npm run format                            # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24 (+ Docker build and
store checks on pull requests). Releases: **Actions → Release** only.

## Architecture

```
index.js               SDK wiring only: handlers, 1-minute clock, 15-minute contract refresh
src/service.js         contracts (getEnergyContracts), tick, scene triggers, Éclair declarations
src/manifest.js        reads gladys-assistant-integration.json (templates, calendar key)
src/tariff/engine.js   local reading of a Gladys tariff: period, price, next change
src/tariff/periods.js  rule labels (HP, HC…) -> period keys (hp, hc…) and names
src/tariff/time.js     local clock of a contract (Intl, DST-aware)
src/eclair.js          Éclair days calendar: load, declare, fill normal days
src/devices/contract.js the device of a contract
src/actions.js         Configuration screen buttons
src/scenes.js          scene actions
src/widgets.js         dashboard widgets
```

### Invariants worth knowing

- **The manifest is the single source of the tariffs.** Prices, slots and
  labels live in `energy_contracts.templates`; Gladys computes the costs from
  them, `src/tariff/engine.js` reads the very same tariff for the current
  period. Never copy a price or a slot into the code.
- **No TotalEnergies API.** There is no public one: everything is computed
  locally (`"transports": ["local"]`). Do not add scraping of the customer
  area.
- **Éclair days are declared, never guessed**, and stored in the
  `eclair-days` calendar. Every elapsed day of an Heures Eco+ contract carries
  a value (`normal` when not declared): a hole would make Gladys apply the
  tariff fallback. A declared day is never overwritten by `normal`.
- **Calendar keys never carry a provider prefix** (store rule) and their
  granularity never changes.
- **A scene action never fires a scene event** (`declare_eclair_day` from a
  scene does not fire `eclair_day_announced`), or a scene would loop.
- **The first tick after a start fires nothing**: a restart is not a change
  of period.
- **States are published only for created devices**, with
  `publishChangedStates` (30-minute heartbeat).
- **Keys are forever**: template keys (stored by the user contracts), rule
  labels, the calendar key and values, trigger / action / widget keys, device
  external ids (`contract:<gladys contract id>`). Never rename them. A price
  change ships as a new template `version`.

### Manifest

`test/manifest.test.js` ties the manifest to the code: handlers for every
action, scene action and widget, the triggers the service fires, the period
options, the template placeholders, `DEFAULT_CONFIG`, the four languages, and
`gladys_version >= 5.2.0` (energy contracts).

## Rules

- **The container rootfs is read-only.** Write only under `/data`. Never log
  tokens or personal data.
- **Versions belong to the Release workflow.** Never edit `version` in
  `package.json` or in the manifest, nor the `docker_image` tag, by hand.
- **Changelog.** Every user-visible change adds a line under
  `## [Unreleased]` in `CHANGELOG.md`. Never write a version heading.
- **User-facing text is `{ en, fr, de, es }`** (`src/i18n.js`): manifest
  texts, action messages, widget texts, and `docs/en.md`, `docs/fr.md`,
  `docs/de.md`, `docs/es.md`, kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network: they run against the fake Gladys
  of the SDK (`@gladysassistant/integration-sdk/testing`).
