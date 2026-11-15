# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- the **email and password of an Activepieces user**, stored by Gladys in the
  integration configuration (never written to `/data`, never logged); they are
  only sent to the sign-in endpoint of the configured address, and redirects
  are not followed so they never reach another host. The session token
  Activepieces returns (valid 7 days) is kept in memory only. With them, the
  integration can read the flows and runs of the project and enable or disable
  its flows; use a dedicated user if you can;
- the **webhook URLs** of the flows started from scenes: the flow id in them is
  the only protection of a webhook without authentication, so they are never
  logged, and the token is never sent to a webhook;
- `/data/activepieces-state.json`: the last run of each flow, which flows are
  enabled, and the failures of the last 24 hours with their short error
  message (no secret, but an error message is whatever the flow wrote);
- network: HTTP(S) requests to the Activepieces address and to the webhook
  URLs of the scenes, nothing else; no port is opened.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Activepieces itself.
