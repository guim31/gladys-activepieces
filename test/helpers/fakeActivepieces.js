// -----------------------------------------------------------------------------
// An in-memory Activepieces, behind the `request` seam of
// src/activepieces/client.js: the REST API as Activepieces 0.82 (Community
// Edition) answers it (test/fixtures/activepieces hold the real answers this
// mimics: sign-in, cursor pages, runs newest first with their failed step,
// 404 ENTITY_NOT_FOUND for a project), and the webhooks of the enabled flows.
// -----------------------------------------------------------------------------

export const BASE = 'http://192.0.2.10:8080';
export const EMAIL = 'gladys@example.com';
export const PASSWORD = 'Test-password-1';
export const PROJECT = 'nAWuaAM4rycMEvMkyvHoZ';

const json = (status, value) => ({
  status,
  contentType: 'application/json; charset=utf-8',
  body: JSON.stringify(value),
});

let counter = 0;
/** A 21-character id, like Activepieces' nanoids. */
export const apId = (prefix = 'x') => `${prefix}${String(++counter).padStart(20, '0')}`.slice(-21);

export class FakeActivepieces {
  constructor() {
    this.flows = [];
    this.runs = [];
    this.version = '0.82.0';
    this.requests = [];
    this.tokens = new Set();
    this.down = null; // an error code: every request fails
    this.status = null; // an HTTP status: every API request answers it
    this.request = this.request.bind(this);
  }

  addFlow({ id = apId('F'), name, enabled = true, published = true, webhook = true, answer }) {
    const flow = { id, name, enabled, published, webhook, answer };
    this.flows.push(flow);
    return flow;
  }

  flow(name) {
    return this.flows.find((flow) => flow.name === name);
  }

  /** A run (finished, or under way), newest last. */
  run(name, { status = 'SUCCEEDED', startedAt, durationMs = 1000, message, step } = {}) {
    const flow = this.flow(name);
    const start = startedAt ?? Date.UTC(2026, 9, 17, 9, 0, 0) + this.runs.length * 1000;
    const run = {
      id: apId('R'),
      created: new Date(start - 50).toISOString(),
      updated: new Date(start + durationMs).toISOString(),
      projectId: PROJECT,
      flowId: flow.id,
      flowVersionId: apId('V'),
      environment: 'PRODUCTION',
      status,
      tags: [],
      startTime: new Date(start).toISOString(),
      finishTime: ['RUNNING', 'QUEUED', 'PAUSED'].includes(status)
        ? null
        : new Date(start + durationMs).toISOString(),
      failedStep: ['SUCCEEDED', 'RUNNING', 'QUEUED', 'PAUSED', 'CANCELED'].includes(status)
        ? null
        : {
            name: 'step_1',
            displayName: step ?? 'Code',
            message: `Error: Error: ${message ?? 'Boom'}\n    at Object.code (/usr/src/app/cache/index.js:26:9)`,
          },
    };
    this.runs.push(run);
    return run;
  }

  finish(run, status = 'SUCCEEDED') {
    run.status = status;
    run.finishTime = new Date(Date.parse(run.startTime) + 2000).toISOString();
  }

  page(items, query) {
    const limit = Number(query.get('limit') ?? 10);
    const after = query.get('cursor') ? Number(query.get('cursor')) : 0;
    const slice = items.slice(after, after + limit);
    const next = after + limit < items.length ? String(after + limit) : null;
    return json(200, { data: slice, next, previous: null });
  }

  flowBody(flow) {
    return {
      id: flow.id,
      created: '2026-10-17T08:00:00.000Z',
      updated: '2026-10-17T08:00:00.000Z',
      projectId: PROJECT,
      externalId: flow.id,
      ownerId: 'f1L56YKOkoXRZOSOSPXVn',
      folderId: null,
      status: flow.enabled ? 'ENABLED' : 'DISABLED',
      publishedVersionId: flow.published ? `V${flow.id.slice(1)}` : null,
      metadata: null,
      operationStatus: 'NONE',
      version: {
        id: `V${flow.id.slice(1)}`,
        flowId: flow.id,
        displayName: flow.name,
        trigger: {
          name: 'trigger',
          type: 'PIECE_TRIGGER',
          valid: true,
          settings: flow.webhook
            ? { pieceName: '@activepieces/piece-webhook', triggerName: 'catch_webhook' }
            : { pieceName: '@activepieces/piece-schedule', triggerName: 'every_hour' },
          displayName: flow.webhook ? 'Catch Webhook' : 'Every Hour',
        },
        valid: true,
        state: flow.published ? 'LOCKED' : 'DRAFT',
      },
      triggerSource: { schedule: null },
    };
  }

  async request(url, { method = 'GET', headers = {}, body } = {}) {
    this.requests.push({ url, method, headers, body });
    if (this.down) {
      throw Object.assign(new Error('fetch failed'), { cause: { code: this.down } });
    }
    const parsed = new URL(url);
    const path = parsed.pathname;
    const query = parsed.searchParams;
    const hook = path.match(/^\/api\/v1\/webhooks\/([0-9a-zA-Z]{21})(\/sync)?$/);
    if (hook && method === 'POST') {
      const flow = this.flows.find((f) => f.id === hook[1]);
      if (!flow?.enabled || !flow.published) {
        return json(404, {});
      }
      const payload = JSON.parse(body ?? '{}');
      if (hook[2] && flow.answer) {
        return flow.answer(payload);
      }
      this.run(flow.name);
      return json(200, {});
    }
    if (!path.startsWith('/api/v1/')) {
      return { status: 200, contentType: 'text/html', body: '<html>Activepieces</html>' };
    }
    if (this.status) {
      return json(this.status, { message: 'Nope' });
    }
    if (path === '/api/v1/flags') {
      return json(200, { EDITION: 'ce', CURRENT_VERSION: this.version, LATEST_VERSION: '0.94.0' });
    }
    if (path === '/api/v1/authentication/sign-in' && method === 'POST') {
      const credentials = JSON.parse(body ?? '{}');
      if (typeof credentials.password !== 'string' || credentials.password.length < 8) {
        return json(400, {
          statusCode: 400,
          code: 'FST_ERR_VALIDATION',
          error: 'Bad Request',
          message: 'body/password Too small: expected string to have >=8 characters',
        });
      }
      if (credentials.email !== EMAIL || credentials.password !== PASSWORD) {
        return json(401, { code: 'INVALID_CREDENTIALS', params: null });
      }
      const token = `token-${this.tokens.size + 1}`;
      this.tokens.add(token);
      return json(200, { id: 'f1L56YKOkoXRZOSOSPXVn', email: EMAIL, token, projectId: PROJECT });
    }
    const token = (headers.authorization ?? '').replace(/^Bearer /, '');
    if (!this.tokens.has(token)) {
      return json(401, {
        statusCode: 401,
        error: 'Unauthorized',
        message: "Cannot read properties of undefined (reading 'type')",
      });
    }
    if (query.has('projectId') && query.get('projectId') !== PROJECT) {
      return json(404, {
        code: 'ENTITY_NOT_FOUND',
        params: { entityId: query.get('projectId'), entityType: 'project' },
      });
    }
    if (path === '/api/v1/flows' && method === 'GET') {
      return this.page(
        this.flows.map((flow) => this.flowBody(flow)),
        query,
      );
    }
    const command = path.match(/^\/api\/v1\/flows\/([0-9a-zA-Z]{21})$/);
    if (command && method === 'POST') {
      const flow = this.flows.find((f) => f.id === command[1]);
      if (!flow) {
        return json(404, {
          code: 'ENTITY_NOT_FOUND',
          params: { entityId: command[1], entityType: 'flow' },
        });
      }
      const operation = JSON.parse(body ?? '{}');
      if (operation.type === 'CHANGE_STATUS') {
        flow.enabled = operation.request.status === 'ENABLED';
      }
      return json(200, this.flowBody(flow));
    }
    if (path === '/api/v1/flow-runs') {
      let list = [...this.runs].reverse();
      const statuses = query.getAll('status');
      if (statuses.length > 0) {
        list = list.filter((run) => statuses.includes(run.status));
      }
      if (query.get('flowId')) {
        list = list.filter((run) => run.flowId === query.get('flowId'));
      }
      if (query.get('createdAfter')) {
        const after = Date.parse(query.get('createdAfter'));
        list = list.filter((run) => Date.parse(run.created) >= after);
      }
      return this.page(list, query);
    }
    return json(404, { message: 'Route not found', error: 'Not Found', statusCode: 404 });
  }

  /** Requests of a kind, e.g. `count('/api/v1/flow-runs')`. */
  count(prefix) {
    return this.requests.filter((r) => new URL(r.url).pathname.startsWith(prefix)).length;
  }
}

/** A world with three flows: a webhook that answers, one that fails, a disabled one. */
export function sampleActivepieces() {
  const ap = new FakeActivepieces();
  ap.addFlow({
    id: '1crfut7FNxq2FoQfXgH46',
    name: 'Greeting webhook',
    answer: (body) => json(200, { message: `Hello ${body.name ?? 'nobody'}` }),
  });
  ap.addFlow({ id: '0jXMVm9MwuVUhuyzcPLH4', name: 'Nightly backup' });
  ap.addFlow({ id: 'u5Kk668UQcjxuk9f6ip01', name: 'Nightly report', enabled: false });
  ap.run('Greeting webhook');
  ap.run('Nightly backup', { status: 'FAILED', message: 'Backup target unreachable' });
  return ap;
}
