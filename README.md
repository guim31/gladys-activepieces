# Activepieces for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings the flows of a self-hosted
[Activepieces](https://www.activepieces.com/) into Gladys, and lets Gladys
scenes start them.

- **One device per flow**: enabled switch (read-only by default, writable as
  an option), state of the last run (succeeded, failed, timed out, running…), a
  green/red "working" badge, failures in the last 24 hours, last run and its
  duration.
- **One instance device**: reachable, version, enabled flows, failures in 24
  hours, flows in total.
- **Scene triggers**: a flow run fails (flow, step, error message, status, link
  to the run) and a flow is disabled — for any flow, added to Gladys or not.
- **Scene actions**: start an Activepieces flow through its Catch Webhook
  trigger, with a JSON body built from scene values, and optionally get its
  answer back; state of a flow (with a ready-made sentence); enable / disable a
  flow.
- **Dashboard widget**: failing flows first, then the running ones, then the
  others.
- Texts in English, French, German and Spanish.

Tested against a real self-hosted Activepieces 0.82 (Docker, Community
Edition): flows built through the API, a webhook that succeeds, one that
fails, one that answers, enabling and disabling, a wrong password, a wrong
project and the server stopped. Not tested on Activepieces Cloud or the paid
editions: feedback welcome on
[the issues](https://github.com/guim31/gladys-activepieces/issues).

## Requirements

- Gladys Assistant 5.1.0 or later.
- Activepieces reachable from the Gladys machine, and the email and password
  of one of its users: the Community Edition has no API keys (they belong to
  the paid editions), so the integration signs in like the web interface.

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-activepieces`. Then open its configuration,
enter the address of Activepieces and the email and password of a user, and
add the flows from the Discover tab.

The full guide: [docs/en.md](docs/en.md) (also in [French](docs/fr.md),
[German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

At the chosen interval (one minute by default) the container reads the REST
API of Activepieces: the flags (version), the flows of the project, the latest
runs and the failed runs of the last 24 hours. It publishes the states of the
devices added to Gladys when they change and fires "a flow run fails" once per
failed run, with the error of its failed step. The last run of each flow, the
failures of the day and the enabled flows are kept in `/data`, so a failure
that happened during a restart is announced once. "Start an Activepieces flow"
calls the webhook of the flow (`/api/v1/webhooks/<flow id>`, `/sync` to wait
for its Return Response step), without the session token. The session lasts 7
days: the integration signs in again when Activepieces refuses it. Redirects
are not followed, so the password and the token never reach another host.

## Limits

- One project per configuration.
- API keys of the paid editions are not supported yet.
- Flows are not created or edited from Gladys.
- Webhooks protected by basic or header authentication are not supported.
- A self-signed HTTPS certificate is not accepted (use `http://` on the local
  network).

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [CLAUDE.md](CLAUDE.md) for the project rules and the notes on the
Activepieces API.

## Credits

- [Activepieces](https://github.com/activepieces/activepieces) by Activepieces
  Inc. and contributors (MIT, except its `ee` folders): this integration only
  talks to its REST API; the answers in `test/fixtures/activepieces` come from
  its Docker image. The cover shows the Activepieces logo, from its official
  repository.
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and on the architecture of [gladys-n8n](https://github.com/guim31/gladys-n8n).

Not affiliated with Activepieces Inc.

## License

Apache-2.0, see [LICENSE](LICENSE).
