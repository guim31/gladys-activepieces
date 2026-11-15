// -----------------------------------------------------------------------------
// The Activepieces hub: the instance read on a timer of the container (the
// interval chosen in the configuration); the states of the added devices
// published when they change, the scene events fired on new failed runs and
// on flows that get disabled, and the views the widget and the scene actions
// read.
//
// Gladys never polls these devices (should_poll: false): the interval goes up
// to 5 minutes, beyond the fixed list of the core scheduler, and "a run
// failed" must fire for every flow, added to Gladys or not.
//
// One reading: the flags (version), the flows, the latest runs, and the
// failed runs of the last 24 hours (paged). A flow seen in neither is asked
// for its own last run once (a monthly flow), then followed through the
// latest runs. What was learnt is kept in /data (src/store.js): the last run
// of each flow, the failures of the last 24 hours, which flows were enabled —
// so a failure that happened while the integration or Gladys restarted is
// still announced, once.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import {
  FAILED,
  FEATURE_KEYS,
  ONGOING,
  VOLATILE,
  buildFlowDevice,
  buildInstanceDevice,
  flowIds,
  flowValues,
  instanceIds,
  instanceValues,
  parseFlowId,
  verdictOf,
} from './devices.js';
import {
  ActivepiecesClient,
  ApError,
  ERROR_KINDS,
  FAILED_STATUSES,
  PAGE_SIZE,
} from './activepieces/client.js';
import { hostOf, isCloud, normalizeConfig } from './config.js';
import { ProblemLog } from './problems.js';
import { ACTION_TEXT, CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, labelled, pick } from './texts.js';

const logger = createLogger({ name: 'activepieces-hub' });

export const WIDGET_KEY = 'activepieces';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  FAILED: 'run_failed',
  DISABLED: 'flow_disabled',
});

export const HUB_TIMINGS = {
  // Last run and duration change at every run: published at most this often
  // per flow (a change of state publishes them at once).
  volatileEveryMs: 5 * 60_000,
  // An unchanged value is sent again this often: Gladys shows "no recent
  // value" after 48 hours.
  heartbeatMs: 12 * 3600_000,
  // A scene action reads Activepieces again when the last read is older.
  freshMs: 15_000,
  // A command waits that long, at most, for the read that follows it.
  commandReadMs: 8_000,
  // The window of the failure counters.
  windowMs: 24 * 3600_000,
};

const MAX_TRANSPORTS_PER_REQUEST = 100;
// The errors that mean "no answer": Reachable at 0, the unreachable badge.
const NETWORK_ERRORS = new Set([ERROR_KINDS.UNREACHABLE, ERROR_KINDS.TIMEOUT, ERROR_KINDS.TLS]);
// Pages of failed runs read per cycle (100 each), at most.
const MAX_ERROR_PAGES = 5;
// Flows asked for their own last run per cycle, at most.
const MAX_SEEDS_PER_READ = 10;
// Failures announced per cycle, at most.
const MAX_EVENTS_PER_READ = 10;

const timeOf = (run) => run.stoppedAt ?? run.startedAt ?? run.createdAt ?? 0;

/**
 * Whether `run` replaces `saved` as the last run of a flow: the same run that
 * moved on (running, then finished), or a run that ended (or started, while
 * unfinished) later — a long run failing after a shorter one succeeded is the
 * last word.
 */
const supersedes = (run, saved) => {
  if (!saved) {
    return true;
  }
  if (run.id === saved.id) {
    return run.status !== saved.status || run.stoppedAt !== saved.stoppedAt;
  }
  const a = timeOf(run);
  const b = timeOf(saved);
  // Ids are random: on a tie, the run created last.
  return a !== b ? a > b : (run.createdAt ?? 0) > (saved.createdAt ?? 0);
};

export class ActivepiecesHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/activepieces/client.js)
   * @param {boolean} [options.timers] the reading timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    // Defaults until start(): a handler reached after a failed start still
    // answers with a readable message.
    this.config = normalizeConfig({});
    this.client = null;
    this.signature = null;
    /** @type {Map<string, object>} flows of the last read, by id */
    this.flows = new Map();
    this.version = '';
    this.readAt = 0;
    this.error = null;
    this.polling = null;
    /** When the volatile features of a flow were last published, by id. */
    this.volatileAt = new Map();
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.saved = this.emptySaved();
    this.pollTimer = null;
    this.stopped = false;
    // What fails again at every cycle (Gladys refusing, the reading loop):
    // one line when it starts, one when it ends.
    this.problems = new ProblemLog(logger);
  }

  emptySaved() {
    // last: flow id → last run (null: never run); failures: run id →
    // { f, t, message, step }; enabled: flow id → enabled at the last read;
    // initialized: a first read was done.
    return { last: {}, failures: {}, enabled: {}, initialized: false };
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    const object = (value) => (value && typeof value === 'object' ? value : {});
    this.saved = {
      last: object(saved.last),
      failures: object(saved.failures),
      enabled: object(saved.enabled),
      initialized: saved.initialized === true,
      source: typeof saved.source === 'string' ? saved.source : null,
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.volatileAt.clear();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    const structureChanged =
      this.signature !== null &&
      (previous.language !== config.language || previous.allowToggle !== config.allowToggle);
    this.config = config;
    const signature = JSON.stringify([config.url, config.email, config.password, config.projectId]);
    if (signature !== this.signature) {
      this.signature = signature;
      // An id typed but not understood must not fall back to the user's project.
      const projectOk = !config.projectTyped || Boolean(config.projectId);
      this.client =
        config.url && config.email && config.password && projectOk
          ? new ActivepiecesClient({
              url: config.url,
              email: config.email,
              password: config.password,
              projectId: config.projectId,
              request: this.request,
            })
          : null;
      this.flows = new Map();
      this.version = '';
      this.readAt = 0;
      this.error = null;
      this.polling = null;
    }
    if (structureChanged) {
      // New names or a writable switch for the Discovery tab, texts in the new language.
      this.discovered = null;
      this.volatileAt.clear();
    }
    try {
      if (this.client) {
        await this.pollNow({ publish: true });
      } else {
        await this.afterChanges(true, { publish: true });
      }
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.problems.recover('poll', 'Reading Activepieces works again');
      } catch (err) {
        this.problems.fail('poll', `Poll failed: ${err.message}`, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Reading Activepieces ----------------------------------------------------

  /** Read the instance now and publish what changed. */
  async pollNow({ publish = false } = {}) {
    const changed = await this.poll();
    await this.afterChanges(changed, { publish });
  }

  /**
   * Read after a command: a read already under way started before it. Waited
   * for `commandReadMs` at most, so a slow instance does not turn a command
   * that succeeded into a scene action that timed out; the read goes on.
   */
  async pollAfterCommand() {
    const read = (async () => {
      await this.polling?.catch(() => {});
      await this.pollNow();
    })().catch((err) => logger.debug(`Read after a command failed: ${err.message}`));
    let timer;
    const late = new Promise((resolve) => {
      timer = setTimeout(resolve, this.timings.commandReadMs);
    });
    await Promise.race([read, late]);
    clearTimeout(timer);
  }

  /** Read again when the last read is older than `freshMs` (scene actions). */
  async refreshIfStale() {
    if (this.client && this.now() - this.readAt >= this.timings.freshMs) {
      await this.pollNow();
    }
  }

  /**
   * Read the instance and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widget shows something new
   */
  poll() {
    if (!this.client) {
      return Promise.resolve(false);
    }
    if (!this.polling) {
      const polling = this.read(this.client).finally(() => {
        // A read of a previous client must not drop the promise of the current one.
        if (this.polling === polling) {
          this.polling = null;
        }
      });
      this.polling = polling;
    }
    return this.polling;
  }

  async read(client) {
    let result;
    try {
      result = await this.fetchAll(client);
    } catch (err) {
      if (!(err instanceof ApError)) {
        throw err;
      }
      return client === this.client && this.applyFailure(err);
    }
    return client === this.client && this.applySuccess(result);
  }

  async fetchAll(client) {
    const since = this.now() - this.timings.windowMs;
    const { version } = await client.flags();
    const flows = await client.flows();
    const recent = await client.runs();
    const errors = await client.runs({
      statuses: FAILED_STATUSES,
      createdAfter: since,
      maxPages: MAX_ERROR_PAGES,
    });
    // A flow seen nowhere and never asked: its own last run.
    const seen = new Set(recent.map((run) => run.flowId));
    const seeds = new Map();
    // A busy instance pushes the successes of the other flows out of the
    // latest page (the failures come back through the status filter): a flow
    // last seen failing is then asked again, or it would stay "failed".
    const full = recent.length >= PAGE_SIZE;
    for (const flow of flows) {
      if (seeds.size >= MAX_SEEDS_PER_READ) {
        break;
      }
      if (seen.has(flow.id)) {
        continue;
      }
      const saved = this.saved.last[flow.id];
      const unknown = !(flow.id in this.saved.last);
      if (unknown || (full && (saved?.verdict === 'failed' || ONGOING.has(saved?.status)))) {
        const [last] = await client.runs({ flowId: flow.id, limit: 1 });
        seeds.set(flow.id, last?.flowId === flow.id ? last : null);
      }
    }
    return { version, flows, recent, errors, seeds, since, source: client.url + client.projectId };
  }

  async applySuccess({ version, flows, recent, errors, seeds, since, source }) {
    let widgetChanged = this.error !== null || this.readAt === 0;
    if (this.error) {
      logger.info('Activepieces answers again');
    }
    if (this.readAt === 0) {
      logger.info(`Activepieces ${version} (${hostOf(this.config.url)}): ${flows.length} flow(s)`);
    }
    // Another instance or project: what was learnt about the previous one is worthless.
    if (this.saved.source && this.saved.source !== source) {
      this.saved = this.emptySaved();
    }
    this.saved.source = source;
    this.error = null;
    this.readAt = this.now();
    this.version = version;

    const next = new Map(flows.map((flow) => [flow.id, flow]));
    for (const [id, flow] of next) {
      const previous = this.flows.get(id);
      if (!previous || previous.name !== flow.name || previous.enabled !== flow.enabled) {
        widgetChanged = true;
      }
    }
    if ([...this.flows.keys()].some((id) => !next.has(id))) {
      widgetChanged = true; // a flow deleted
    }
    this.flows = next;

    // The last run of each flow.
    let dirty = false;
    const stateChanged = new Set();
    for (const [id, last] of seeds) {
      if (!last) {
        if (!(id in this.saved.last)) {
          this.saved.last[id] = null;
          dirty = true;
        }
        continue;
      }
      recent.push(last);
    }
    // Oldest first: a run under way inherits the verdict of the one before.
    const ordered = [...recent, ...errors].sort((a, b) => timeOf(a) - timeOf(b));
    for (const run of ordered) {
      const saved = this.saved.last[run.flowId];
      if (supersedes(run, saved)) {
        if (saved?.status !== run.status) {
          stateChanged.add(run.flowId);
          widgetChanged = true;
        }
        this.saved.last[run.flowId] = this.summary(run, saved);
        dirty = true;
      }
    }

    // The failures of the window: the ones read now and the ones kept (pages
    // beyond the reading cap).
    let fresh = 0;
    for (const run of [...errors, ...recent]) {
      if (!FAILED.has(run.status) || timeOf(run) < since) {
        continue;
      }
      if (!(run.id in this.saved.failures)) {
        // `a`: announced. Set once Gladys accepted the scene event, so a
        // failure Gladys refused (restarting) is announced at a later read.
        this.saved.failures[run.id] = {
          f: run.flowId,
          t: timeOf(run),
          message: run.error,
          step: run.step,
          s: run.status,
          a: !this.saved.initialized,
        };
        fresh += 1;
        stateChanged.add(run.flowId);
        dirty = true;
      }
    }
    for (const [id, failure] of Object.entries(this.saved.failures)) {
      if (!failure || typeof failure.t !== 'number' || failure.t < since) {
        delete this.saved.failures[id];
        stateChanged.add(failure?.f);
        dirty = true;
      }
    }
    // A flow deleted in Activepieces is forgotten.
    for (const id of Object.keys(this.saved.last)) {
      if (!next.has(id)) {
        delete this.saved.last[id];
        dirty = true;
      }
    }

    // Flows that went from enabled to disabled since the last read.
    const disabled = [];
    for (const [id, flow] of next) {
      if (this.saved.enabled[id] === true && !flow.enabled) {
        disabled.push(flow);
      }
    }
    const enabled = Object.fromEntries([...next].map(([id, flow]) => [id, flow.enabled]));
    if (!this.saved.initialized) {
      // The first read only sets what is known: no event for the past.
      this.saved.initialized = true;
      disabled.length = 0;
      dirty = true;
    }
    // Written before the scene events: a stop while they go out must not
    // announce the same failures again after the restart.
    const before = JSON.stringify(this.saved.enabled);
    this.saved.enabled = { ...enabled };
    for (const flow of disabled) {
      // Seen enabled until Gladys accepts the event: retried at the next read.
      this.saved.enabled[flow.id] = true;
    }
    if (JSON.stringify(this.saved.enabled) !== before) {
      dirty = true;
    }
    if (dirty) {
      this.store.save(this.saved);
    }

    let announced = await this.announce();
    for (const flow of disabled) {
      logger.info(`${flow.name}: disabled`);
      const ok = await this.fire(TRIGGERS.DISABLED, {
        device: flowIds(this.gladys, flow.id).device,
        flow: flow.name,
      });
      if (ok) {
        this.saved.enabled[flow.id] = false;
        announced = true;
      }
    }
    if (announced) {
      this.store.save(this.saved);
    }
    if (fresh > 0) {
      widgetChanged = true;
    }
    await this.publishStates({ changed: stateChanged });
    return widgetChanged;
  }

  summary(run, previous) {
    return {
      id: run.id,
      status: run.status,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      stoppedAt: run.stoppedAt,
      verdict: verdictOf(run, previous),
    };
  }

  /**
   * Fire "a run failed" for the failures of the window not announced yet,
   * oldest first, `MAX_EVENTS_PER_READ` at most per read.
   * @returns {Promise<boolean>} whether one was announced
   */
  async announce() {
    const pending = Object.entries(this.saved.failures)
      .filter(([, failure]) => failure && failure.a === false)
      .sort(([, x], [, y]) => x.t - y.t);
    const batch = pending.slice(-MAX_EVENTS_PER_READ);
    if (pending.length > batch.length) {
      // Older ones beyond the cap are given up: a burst is not replayed.
      logger.warn(`${pending.length - batch.length} older failure(s) not announced`);
      for (const [, failure] of pending.slice(0, -MAX_EVENTS_PER_READ)) {
        failure.a = true;
      }
    }
    let announced = pending.length > batch.length;
    for (const [id, failure] of batch) {
      const name = this.flows.get(failure.f)?.name ?? failure.f;
      const ok = await this.fire(TRIGGERS.FAILED, {
        device: flowIds(this.gladys, failure.f).device,
        flow: name,
        error: failure.message ?? '',
        step: failure.step ?? '',
        status: failure.s ?? 'FAILED',
        run_url: `${this.config.url}/projects/${this.client?.projectId}/runs/${id}`,
      });
      if (ok) {
        logger.info(`${name}: run ${id} failed${failure.step ? ` in ${failure.step}` : ''}`);
        failure.a = true;
        announced = true;
      }
    }
    return announced;
  }

  async applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.readAt = this.now();
    if (wasError !== err.kind) {
      logger.warn(`Activepieces: ${err.message}`);
    }
    await this.publishStates();
    return wasError !== err.kind;
  }

  /** @returns {Promise<boolean>} whether Gladys accepted the event */
  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.problems.recover(`event:${key}`, `Scene event ${key} accepted again`);
      return true;
    } catch (err) {
      this.problems.fail(`event:${key}`, `Scene event ${key} refused: ${err.message}`);
      return false;
    }
  }

  // --- Views -------------------------------------------------------------------

  /** Activepieces does not answer (a refused password is an answer). */
  unreachable() {
    return NETWORK_ERRORS.has(this.error?.kind);
  }

  /** Failures of the window, by flow id. */
  failureCounts() {
    const counts = new Map();
    for (const failure of Object.values(this.saved.failures)) {
      counts.set(failure.f, (counts.get(failure.f) ?? 0) + 1);
    }
    return counts;
  }

  /** The last error message kept for a flow (the newest failure). */
  lastError(id) {
    let best = null;
    for (const failure of Object.values(this.saved.failures)) {
      if (failure.f === id && failure.message && (!best || failure.t > best.t)) {
        best = failure;
      }
    }
    return best ? { message: best.message, step: best.step ?? '' } : null;
  }

  /** What every view needs about a flow. */
  view(flow, counts = this.failureCounts()) {
    return {
      flow,
      last: this.saved.last[flow.id] ?? null,
      failures: counts.get(flow.id) ?? 0,
    };
  }

  views() {
    const counts = this.failureCounts();
    return [...this.flows.values()].map((flow) => this.view(flow, counts));
  }

  totals() {
    const flows = [...this.flows.values()];
    const counts = this.failureCounts();
    let failures = 0;
    for (const [id, count] of counts) {
      if (this.flows.has(id)) {
        failures += count;
      }
    }
    return {
      reachable: !this.unreachable(),
      // The figures are those of a successful read only.
      read: this.error === null,
      version: this.version,
      active: flows.filter((flow) => flow.enabled).length,
      failures,
      total: flows.length,
    };
  }

  // --- Publishing to Gladys ----------------------------------------------------

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  /** The name given in Gladys to a device, or `fallback`. */
  nameOf(externalId, fallback) {
    const device = (this.gladys.devices ?? []).find((d) => d.external_id === externalId);
    return (typeof device?.name === 'string' && device.name) || fallback;
  }

  discoveredDevices() {
    const { language, allowToggle } = this.config;
    if (!this.client || this.readAt === 0 || this.error) {
      return null; // nothing read: keep the list Gladys has
    }
    return [
      buildInstanceDevice(this.gladys, language),
      ...[...this.flows.values()].map((flow) =>
        buildFlowDevice(this.gladys, flow, { language, allowToggle }),
      ),
    ];
  }

  /** Publish the Discovery list when it changed (a flow added, renamed…). */
  async publishDevices({ force = false } = {}) {
    const devices = this.discoveredDevices() ?? (this.client ? null : []);
    if (devices === null) {
      return;
    }
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.problems.recover('discovered', 'Discovered devices accepted again');
    } catch (err) {
      this.problems.fail('discovered', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read Activepieces, publish the list again. */
  async rediscover() {
    await this.poll();
    await this.afterChanges(true, { publish: true });
  }

  /**
   * The user added (or updated) a device: its states sent before were dropped
   * by Gladys, and a device deleted then added again needs its badge.
   */
  async onDeviceCreated(device) {
    const id = parseFlowId(this.gladys, device.external_id);
    if (id) {
      this.volatileAt.delete(id);
    }
    this.transports.delete(device.external_id);
    await this.publishStates({ changed: new Set(id ? [id] : []) });
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** Gladys asks for a refresh (onPoll, only if it polls anyway). */
  async pollDevice() {
    await this.pollNow();
  }

  /**
   * The states of the added devices. The SDK skips the values Gladys already
   * has (and sends an unchanged one again after `heartbeatMs`).
   * @param {{ changed?: Set<string> }} options flows whose volatile features go now
   */
  async publishStates({ changed = new Set() } = {}) {
    if (this.readAt === 0) {
      return;
    }
    const states = [];
    if (!this.error) {
      const language = this.config.language;
      const now = this.now();
      for (const view of this.views()) {
        const { id } = view.flow;
        if (!this.isCreated(flowIds(this.gladys, id).device)) {
          continue; // Gladys drops the states of a device not added
        }
        const volatileDue =
          changed.has(id) ||
          !this.volatileAt.has(id) ||
          now - this.volatileAt.get(id) >= this.timings.volatileEveryMs;
        if (volatileDue) {
          this.volatileAt.set(id, now);
        }
        for (const { key, ...state } of flowValues(this.gladys, view, language)) {
          if (volatileDue || !VOLATILE.has(key)) {
            states.push(state);
          }
        }
      }
    }
    // The instance device: "reachable" goes to 0 while Activepieces does not answer.
    if (this.isCreated(instanceIds(this.gladys).device)) {
      for (const { key: _key, ...state } of instanceValues(this.gladys, this.totals())) {
        states.push(state);
      }
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.problems.recover('states', 'States accepted again');
    } catch (err) {
      this.problems.fail('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of the added devices: local or cloud, or unreachable. */
  async publishTransports() {
    if (!this.client || this.readAt === 0) {
      return;
    }
    let transport = isCloud(this.config.url) ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.LOCAL;
    if (this.unreachable()) {
      transport = DEVICE_TRANSPORTS.UNREACHABLE;
    }
    const entries = [];
    const ids = [
      instanceIds(this.gladys).device,
      ...[...this.flows.keys()].map((id) => flowIds(this.gladys, id).device),
    ];
    for (const externalId of ids) {
      if (this.isCreated(externalId) && this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    for (let at = 0; at < entries.length; at += MAX_TRANSPORTS_PER_REQUEST) {
      const batch = entries.slice(at, at + MAX_TRANSPORTS_PER_REQUEST);
      try {
        await this.gladys.publishTransports(batch);
        for (const entry of batch) {
          this.transports.set(entry.external_id, entry.transport);
        }
        this.problems.recover('transports', 'Transports accepted again');
      } catch (err) {
        this.problems.fail('transports', `Transports refused: ${err.message}`);
      }
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.urlTyped) {
      return { connected: false, message: CONNECTION_TEXT.noUrl };
    }
    if (!this.config.url) {
      return { connected: false, message: CONNECTION_TEXT.invalidUrl };
    }
    if (!this.config.email || !this.config.password) {
      return { connected: false, message: CONNECTION_TEXT.noAccount };
    }
    if (this.config.projectTyped && !this.config.projectId) {
      return { connected: false, message: CONNECTION_TEXT.invalidProject };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.problems.recover('connection', 'Connection status accepted again');
    } catch (err) {
      this.problems.fail('connection', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands (switch, widget, scene actions, report) -----------------------

  /** The flow of a device external id, null when it is not one (or no longer exists). */
  find(externalId) {
    const id = parseFlowId(this.gladys, externalId);
    return id ? (this.flows.get(id) ?? null) : null;
  }

  /** Throws the reason Activepieces cannot answer, if any. */
  assertReadable() {
    const status = this.connectionStatus();
    if (!status.connected) {
      throw new Error(pick(status.message, this.config.language));
    }
  }

  /** An error of a command, in the language of the configuration. */
  commandError(err) {
    if (err instanceof ApError) {
      const text = pick(ERROR_TEXT[err.kind], this.config.language);
      return new Error(err.reason ? `${text} (${err.reason})` : text);
    }
    return err;
  }

  /** The flow of a device field, read again if unknown or stale. */
  async flowOf(externalId) {
    if (this.error) {
      // The last read failed: Activepieces may be back since.
      await this.refreshIfStale();
    }
    this.assertReadable();
    if (!this.find(externalId)) {
      await this.refreshIfStale();
      this.assertReadable();
    }
    const flow = this.find(externalId);
    if (!flow) {
      throw new Error(pick(ACTION_TEXT.unknownFlow, this.config.language));
    }
    return flow;
  }

  /** Enable or disable a flow, then read Activepieces again. */
  async setEnabled(flow, enabled) {
    if (!flow.published) {
      throw new Error(pick(ACTION_TEXT.notPublished, this.config.language));
    }
    try {
      await this.client.setEnabled(flow.id, enabled);
    } catch (err) {
      throw this.commandError(err);
    }
    logger.info(`${flow.name} ${enabled ? 'enabled' : 'disabled'}`);
    await this.pollAfterCommand();
  }

  /** The dashboard switch (onSetValue), when the configuration allows it. */
  async onSetValue(device, feature, value) {
    const id = parseFlowId(this.gladys, device.external_id);
    if (!id || feature.external_id !== flowIds(this.gladys, id).feature(FEATURE_KEYS.ACTIVE)) {
      throw new Error(`Feature ${feature.external_id} cannot be set`);
    }
    if (!this.config.allowToggle) {
      throw new Error(pick(ACTION_TEXT.readOnly, this.config.language));
    }
    const flow = await this.flowOf(device.external_id);
    await this.setEnabled(flow, Number(value) === 1);
  }

  /** "Test the connection": read Activepieces now, one line. */
  async testConnection() {
    await this.pollNow({ publish: true });
    const message = {};
    const status = this.connectionStatus();
    const totals = this.totals();
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (!status.connected) {
        message[language] = pick(status.message, language);
        continue;
      }
      const parts = [
        text.ok,
        text.flows(totals.total),
        text.active(totals.active),
        text.failures(totals.failures),
      ];
      message[language] = labelled(
        `Activepieces ${totals.version}`.trim(),
        parts.join(', '),
        language,
      );
    }
    return message;
  }
}

export { ERROR_KINDS };
