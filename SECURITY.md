# Security policy

## Supported versions

Only the latest release of the TotalEnergies integration receives security
fixes. Update the integration from the Gladys store before reporting an issue.

| Version | Supported |
| ------- | --------- |
| latest  | Yes       |
| older   | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-totalenergies](https://github.com/prohand/gladys-totalenergies/security),
then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the
problem, and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens, passwords and addresses first).

You should get a first answer within 7 days. A fix is released as a new
version of the integration, and the advisory is published once users can
update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)),
and TotalEnergies' own services. This integration does not connect to any
TotalEnergies service and stores no TotalEnergies credentials.

## Good practices for users

- The integration needs no account, password or API key: never type one in
  its configuration.
- Keep Gladys and the integration up to date.
