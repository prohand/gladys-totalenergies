# TotalEnergies

This integration adds the **TotalEnergies** electricity offers to the Gladys
energy monitoring, and gives you the current tariff period and kWh price to
drive your home: start the water heater during off-peak hours, charge the car
during super off-peak hours, turn the heating down during the vigilance hours
of an Éclair day.

Everything is computed inside the integration, from your contract: **no
TotalEnergies account is needed** and nothing leaves your network.

> Community integration, not affiliated with TotalEnergies. The pre-filled
> prices come from the public grid of 1 October 2026 (9 kVA, incl. taxes):
> always check them against your bill.

Requires Gladys 5.2 or later.

## Available offers

| Contract template            | Periods                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| Access – Base / – HP/HC      | Base, or peak / off-peak hours                              |
| Heures Eco – Base / – HP/HC  | Base, or peak / off-peak hours                              |
| Fixe 2 ans – Base / – HP/HC  | Base, or peak / off-peak hours                              |
| Charge'Heures – HP/HC/HSC    | Super off-peak 2-6 am, off-peak 11 pm-2 am and 6-7 am, peak |
| Heures Eco+ – HP/HC/HV       | Peak, off-peak, and vigilance hours (Éclair days)           |
| Other offer – Base / – HP/HC | For Verte Fixe, Standard Fixe, Online…                      |

## Getting started

1. Install the integration from the Gladys catalog.
2. Open **Energy > Contracts** and create your contract: pick the
   TotalEnergies template that matches your offer.
3. Copy the prices of your bill (kWh price and monthly subscription, incl.
   taxes) and, for a peak / off-peak option, your **off-peak slots**: Enedis
   sets them for your meter and they are printed on your bill.
4. Attach the contract to your meter, like any Gladys contract: Gladys then
   computes your costs.
5. Open the **Discovery** tab of the integration: one device per contract
   appears, with two features — **kWh price** and **tariff period**. Add it.

A contract created later shows up in Discovery within 15 minutes, or at once
with the **Show my TotalEnergies contracts** button.

## Configuration

- **Vigilance warning (minutes)** — Heures Eco+: how many minutes before each
  vigilance slot the "Vigilance hours soon" trigger fires (60 by default).

Buttons of the Configuration screen:

- **Show my TotalEnergies contracts** — lists the Gladys contracts created
  from the TotalEnergies templates, with their current period and price.
- **Declare an Éclair day** — type the date TotalEnergies announced
  (YYYY-MM-DD, empty = tomorrow).
- **Cancel an Éclair day** — turns a day declared by mistake back into a
  normal day.

## Heures Eco+ and Éclair days

The Heures Eco+ offer has 20 **Éclair days** a year, between 15 October and
15 April. On those days the **vigilance hours** (7 am-3 pm and 6-8 pm) cost
about three times the usual price.

TotalEnergies announces an Éclair day the evening before, by e-mail and text
message only: there is no online service to read them from. So you declare
each Éclair day in the integration, whichever way suits you:

- the **Éclair day tomorrow** button of the "TotalEnergies tariff" widget;
- the "Éclair days" widget;
- the **Declare an Éclair day** button of the Configuration screen;
- from a scene, with the **Declare an Éclair day** action.

The integration stores those days in the `eclair-days` tariff calendar of
Gladys, which uses it to price the vigilance hours. The other days are
written as "normal" automatically.

## Scenes

Triggers (**Integrations** category of the scene editor):

- **Tariff period changed** — a contract enters peak, off-peak, super
  off-peak or vigilance hours. Filter on the contract and the new period.
  Variables: `period`, `previous_period`, `price`.
- **Vigilance hours soon** — Heures Eco+: a vigilance slot starts soon.
  Variables: `starts_at`, `ends_at`, `minutes_before`.
- **Éclair day announced** — an Éclair day was just declared from the
  Configuration screen or the dashboard. Variables: `date`, `is_tomorrow`,
  `season_count`.

Actions:

- **Read the current tariff** — returns `period`, `price`, `next_period`,
  `next_change_at`, `eclair_today`, `eclair_tomorrow` (and `found`).
- **Declare an Éclair day** — today or tomorrow. It does not fire "Éclair day
  announced", so a scene cannot loop.

Periods are `base`, `hp`, `hc`, `hsc` or `hv`.

Example: _When the period of my contract becomes `hc`, turn the water heater
on; when it becomes `hp`, turn it off._

## Dashboard

- **TotalEnergies tariff** — current price and period, next change, price
  over the next 24 hours, and for Heures Eco+ the Éclair days of today and
  tomorrow. Pick the contract in the widget settings (empty = the first one).
- **Éclair days** — Éclair days of the season (x/20), the next one, and
  buttons to declare or cancel one.

## Good to know

- The price shown is the kWh price (incl. taxes) typed in the contract;
  Gladys adds the subscription to its costs itself.
- TotalEnergies prices change (up to twice a year for some offers): update
  the contract in **Energy > Contracts**.

## Troubleshooting

- **No device in Discovery**: check that a contract was created from a
  **TotalEnergies** template and is active (start date passed). The **Show
  my TotalEnergies contracts** button confirms it.
- **The price never moves**: the device must be added from Discovery to
  receive its values.
- Read the integration logs from Gladys (or `docker logs`) for the details.
