# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-15

### Added

- One device per Activepieces flow: enabled switch (read-only unless allowed
  in the configuration), state of the last run, working badge, failures in 24
  hours, start and duration of the last run.
- One instance device: reachable, version, enabled flows, failures in 24
  hours, flows in total.
- Scene triggers "A flow run fails" (flow, step, error, status, link) and "A
  flow is disabled", for every flow, added to Gladys or not, announced once
  even across restarts.
- Scene actions "Start an Activepieces flow" (Catch Webhook trigger, JSON body,
  optional wait for the Return Response answer), "State of a flow", "Enable a
  flow" and "Disable a flow".
- Dashboard widget "Activepieces flows": failing flows first, then the running
  ones, then the others.
- Sign-in with the email and password of a user (the Community Edition has no
  API keys), renewed when the session expires; optional project.
- "Test the connection" action; texts and documentation in English, French,
  German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-activepieces/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-activepieces/releases/tag/v1.0.0
