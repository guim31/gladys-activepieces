// -----------------------------------------------------------------------------
// Gladys devices, proposed in the Discovery tab (the user adds the ones to
// follow, nothing is created on their behalf):
//
//   - one device per Activepieces flow, identified by its flow id:
//       active         switch/binary  enabled or not; read-only unless
//                                     "Allow switching" is on
//       state          text/text      last run: "Succeeded", "Failed"…,
//                                     "Running" (configuration language)
//       working        input/binary   0 when the last run failed, 1
//                                     otherwise (input/binary is green at 1)
//       failures_24h   counter-sensor/integer  failed runs, last 24 h
//       last_run       text/text      start of the last run, day/month
//                                     hours:minutes
//       last_duration  duration/decimal (s)    of the last finished run
//
//   - one "Activepieces" device for the instance: reachable, version, enabled
//     flows, failures in the last 24 h, flows in total.
//
// Published with should_poll: false: the integration reads Activepieces on
// its own timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { FAILED_STATUSES } from './activepieces/client.js';
import { AP_ID } from './config.js';
import { STATE_TEXT, formatTime, pick } from './texts.js';

export const FLOW_TYPE = 'flow';
export const INSTANCE_TYPE = 'instance';
export const INSTANCE_ID = 'summary';
export const MODEL = 'Activepieces';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ACTIVE: 'active',
  STATE: 'state',
  WORKING: 'working',
  FAILURES_24H: 'failures_24h',
  LAST_RUN: 'last_run',
  LAST_DURATION: 'last_duration',
});

export const INSTANCE_KEYS = Object.freeze({
  REACHABLE: 'reachable',
  VERSION: 'version',
  ACTIVE: 'enabled_flows',
  FAILURES_24H: 'failures_24h',
  TOTAL: 'total_flows',
});

// These change at every run: published at most every few minutes
// (src/hub.js); the state and the failures go at once.
export const VOLATILE = new Set([FEATURE_KEYS.LAST_RUN, FEATURE_KEYS.LAST_DURATION]);

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.ACTIVE]: 'Enabled',
    [FEATURE_KEYS.STATE]: 'Last run',
    [FEATURE_KEYS.WORKING]: 'Working',
    [FEATURE_KEYS.FAILURES_24H]: 'Failures in 24 h',
    [FEATURE_KEYS.LAST_RUN]: 'Last run start',
    [FEATURE_KEYS.LAST_DURATION]: 'Last run duration',
    [INSTANCE_KEYS.REACHABLE]: 'Reachable',
    [INSTANCE_KEYS.VERSION]: 'Version',
    [INSTANCE_KEYS.ACTIVE]: 'Enabled flows',
    [INSTANCE_KEYS.TOTAL]: 'Flows in total',
  },
  fr: {
    [FEATURE_KEYS.ACTIVE]: 'Activé',
    [FEATURE_KEYS.STATE]: 'Dernière exécution',
    [FEATURE_KEYS.WORKING]: 'Fonctionne',
    [FEATURE_KEYS.FAILURES_24H]: 'Échecs sur 24 h',
    [FEATURE_KEYS.LAST_RUN]: 'Dernier lancement',
    [FEATURE_KEYS.LAST_DURATION]: 'Durée de la dernière exécution',
    [INSTANCE_KEYS.REACHABLE]: 'Joignable',
    [INSTANCE_KEYS.VERSION]: 'Version',
    [INSTANCE_KEYS.ACTIVE]: 'Flux activés',
    [INSTANCE_KEYS.TOTAL]: 'Flux au total',
  },
  de: {
    [FEATURE_KEYS.ACTIVE]: 'Aktiviert',
    [FEATURE_KEYS.STATE]: 'Letzte Ausführung',
    [FEATURE_KEYS.WORKING]: 'Funktioniert',
    [FEATURE_KEYS.FAILURES_24H]: 'Fehlschläge in 24 h',
    [FEATURE_KEYS.LAST_RUN]: 'Letzter Start',
    [FEATURE_KEYS.LAST_DURATION]: 'Dauer der letzten Ausführung',
    [INSTANCE_KEYS.REACHABLE]: 'Erreichbar',
    [INSTANCE_KEYS.VERSION]: 'Version',
    [INSTANCE_KEYS.ACTIVE]: 'Aktivierte Flows',
    [INSTANCE_KEYS.TOTAL]: 'Flows insgesamt',
  },
  es: {
    [FEATURE_KEYS.ACTIVE]: 'Activado',
    [FEATURE_KEYS.STATE]: 'Última ejecución',
    [FEATURE_KEYS.WORKING]: 'Funciona',
    [FEATURE_KEYS.FAILURES_24H]: 'Fallos en 24 h',
    [FEATURE_KEYS.LAST_RUN]: 'Último inicio',
    [FEATURE_KEYS.LAST_DURATION]: 'Duración de la última ejecución',
    [INSTANCE_KEYS.REACHABLE]: 'Accesible',
    [INSTANCE_KEYS.VERSION]: 'Versión',
    [INSTANCE_KEYS.ACTIVE]: 'Flujos activados',
    [INSTANCE_KEYS.TOTAL]: 'Flujos en total',
  },
};

// Display bounds (the core never applies them on write).
export const MAX_FAILURES = 100_000;
export const MAX_DURATION_S = 7 * 24 * 3600;
export const MAX_FLOWS = 10_000;

export const FAILED = new Set(FAILED_STATUSES);
// A run not finished yet: the state shows it, the last finished run keeps its verdict.
export const ONGOING = new Set(['RUNNING', 'QUEUED', 'PAUSED']);

/**
 * The state of a flow: the status of its last run (running, paused or
 * queued included), "never" without one.
 * @param {object} view `{ last }` (src/hub.js)
 */
export function stateOf(view) {
  return view.last ? view.last.status : 'never';
}

/**
 * 1 when the last finished run failed: a run under way keeps the verdict of
 * the previous one (`verdict`, set by src/hub.js), so a failing flow that
 * runs again does not look repaired for a few seconds.
 */
export const lastFailed = (view) => (view.last?.verdict === 'failed' ? 1 : 0);

/** The verdict a run leaves: failed, ok, or the previous one while under way. */
export function verdictOf(run, previous) {
  if (FAILED.has(run.status)) {
    return 'failed';
  }
  if (ONGOING.has(run.status)) {
    return previous?.verdict ?? 'ok';
  }
  return 'ok';
}
/** Duration of the last run in seconds (0.1 s), null when unknown. */
export function durationOf(run) {
  if (!run || run.startedAt === null || run.stoppedAt === null) {
    return null;
  }
  const seconds = (run.stoppedAt - run.startedAt) / 1000;
  return seconds >= 0 ? Math.round(seconds * 10) / 10 : null;
}

export const flowIds = (gladys, id) => gladys.externalIds(FLOW_TYPE, id);
export const instanceIds = (gladys) => gladys.externalIds(INSTANCE_TYPE, INSTANCE_ID);

/** The flow id of a device external id, null when it is not a flow of ours. */
export function parseFlowId(gladys, externalId) {
  const prefix = flowIds(gladys, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const id = externalId.slice(prefix.length);
  return AP_ID.test(id) ? id : null;
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const text = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
    keep_history: false,
    min: 0,
    max: 0,
  });

const counter = (name, externalId, max) =>
  sensor(
    name,
    externalId,
    DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    { keep_history: true, min: 0, max },
  );

/**
 * The discovery payload of a flow.
 * @param {object} flow normalized (src/activepieces/client.js)
 * @param {{ language?: string, allowToggle?: boolean }} [options]
 */
export function buildFlowDevice(gladys, flow, { language = 'en', allowToggle = false } = {}) {
  const ids = flowIds(gladys, flow.id);
  const names = NAMES[language] ?? NAMES.en;
  const params = [{ name: 'FLOW_ID', value: flow.id }];
  return {
    name: flow.name.slice(0, 255),
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params,
    features: [
      sensor(
        names[FEATURE_KEYS.ACTIVE],
        ids.feature(FEATURE_KEYS.ACTIVE),
        DEVICE_FEATURE_CATEGORIES.SWITCH,
        DEVICE_FEATURE_TYPES.SWITCH.BINARY,
        { read_only: !allowToggle, keep_history: true, min: 0, max: 1 },
      ),
      text(names[FEATURE_KEYS.STATE], ids.feature(FEATURE_KEYS.STATE)),
      sensor(
        names[FEATURE_KEYS.WORKING],
        ids.feature(FEATURE_KEYS.WORKING),
        DEVICE_FEATURE_CATEGORIES.INPUT,
        DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        { keep_history: true, min: 0, max: 1 },
      ),
      counter(
        names[FEATURE_KEYS.FAILURES_24H],
        ids.feature(FEATURE_KEYS.FAILURES_24H),
        MAX_FAILURES,
      ),
      text(names[FEATURE_KEYS.LAST_RUN], ids.feature(FEATURE_KEYS.LAST_RUN)),
      sensor(
        names[FEATURE_KEYS.LAST_DURATION],
        ids.feature(FEATURE_KEYS.LAST_DURATION),
        DEVICE_FEATURE_CATEGORIES.DURATION,
        DEVICE_FEATURE_TYPES.DURATION.DECIMAL,
        { unit: DEVICE_FEATURE_UNITS.SECONDS, keep_history: true, min: 0, max: MAX_DURATION_S },
      ),
    ],
  };
}

/** The discovery payload of the instance summary. */
export function buildInstanceDevice(gladys, language = 'en') {
  const ids = instanceIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: 'Activepieces',
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: [],
    features: [
      sensor(
        names[INSTANCE_KEYS.REACHABLE],
        ids.feature(INSTANCE_KEYS.REACHABLE),
        DEVICE_FEATURE_CATEGORIES.INPUT,
        DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        { keep_history: true, min: 0, max: 1 },
      ),
      text(names[INSTANCE_KEYS.VERSION], ids.feature(INSTANCE_KEYS.VERSION)),
      counter(names[INSTANCE_KEYS.ACTIVE], ids.feature(INSTANCE_KEYS.ACTIVE), MAX_FLOWS),
      counter(
        names[FEATURE_KEYS.FAILURES_24H],
        ids.feature(INSTANCE_KEYS.FAILURES_24H),
        MAX_FAILURES,
      ),
      counter(names[INSTANCE_KEYS.TOTAL], ids.feature(INSTANCE_KEYS.TOTAL), MAX_FLOWS),
    ],
  };
}

/**
 * The value of every feature of a flow: `{ key, device_feature_external_id,
 * state|text }`, nothing for a value that is not known.
 * @param {object} view `{ flow, last, failures }` (src/hub.js)
 */
export function flowValues(gladys, view, language) {
  const ids = flowIds(gladys, view.flow.id);
  const values = [
    { key: FEATURE_KEYS.ACTIVE, state: view.flow.enabled ? 1 : 0 },
    { key: FEATURE_KEYS.STATE, text: pick(STATE_TEXT[stateOf(view)], language) },
    { key: FEATURE_KEYS.WORKING, state: 1 - lastFailed(view) },
    { key: FEATURE_KEYS.FAILURES_24H, state: view.failures },
  ];
  if (view.last?.startedAt) {
    values.push({ key: FEATURE_KEYS.LAST_RUN, text: formatTime(view.last.startedAt, language) });
  }
  const duration = durationOf(view.last);
  if (duration !== null) {
    values.push({ key: FEATURE_KEYS.LAST_DURATION, state: duration });
  }
  return values.map(({ key, ...value }) => ({
    key,
    device_feature_external_id: ids.feature(key),
    ...value,
  }));
}

/**
 * The values of the instance device: only "reachable" while Activepieces does
 * not answer (the figures of the last read would look current).
 */
export function instanceValues(gladys, { reachable, version, active, failures, total }) {
  const ids = instanceIds(gladys);
  const values = [{ key: INSTANCE_KEYS.REACHABLE, state: reachable ? 1 : 0 }];
  if (reachable) {
    if (version) {
      values.push({ key: INSTANCE_KEYS.VERSION, text: version });
    }
    values.push(
      { key: INSTANCE_KEYS.ACTIVE, state: active },
      { key: INSTANCE_KEYS.FAILURES_24H, state: failures },
      { key: INSTANCE_KEYS.TOTAL, state: total },
    );
  }
  return values.map(({ key, ...value }) => ({
    key,
    device_feature_external_id: ids.feature(key),
    ...value,
  }));
}
