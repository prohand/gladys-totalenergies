# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- TotalEnergies contract templates in the Gladys energy monitoring (Energy >
  Contracts): Access, Heures Eco and Fixe 2 ans (Base and HP/HC),
  Charge'Heures (HP/HC/HSC), Heures Eco+ (HP/HC/HV with Éclair days), and a
  Base and an HP/HC template for any other offer. Prices pre-filled from the
  1 October 2026 grid (9 kVA, incl. taxes), editable per contract.
- The `eclair-days` tariff calendar: the Éclair days of Heures Eco+, declared
  from the Configuration screen, a scene or the dashboard, read by Gladys to
  price the vigilance hours.
- One device per contract with its current kWh price and tariff period.
- Scene triggers: tariff period changed, vigilance hours soon, Éclair day
  announced. Scene actions: read the current tariff, declare an Éclair day.
- Dashboard widgets: TotalEnergies tariff (period, price, next change, next
  24 hours) and Éclair days (season count, declare, cancel).
- Configuration actions: show my contracts, declare and cancel an Éclair day.
- English, French, German and Spanish texts and documentation.
- CI (format, lint, tests on Node 22 and 24, Docker build, store checks), the
  Release workflow, multi-arch image build, GitHub Releases, Dependabot.
- `SECURITY.md`, `CLAUDE.md`.

[Unreleased]: https://github.com/prohand/gladys-totalenergies/commits/main
