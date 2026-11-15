// -----------------------------------------------------------------------------
// Activepieces client: the REST API of a self-hosted Activepieces (checked on
// 0.82, Community Edition), and the webhooks of the flows.
//
//   GET  /api/v1/flags                              public: version, edition
//   POST /api/v1/authentication/sign-in             email + password → token
//   GET  /api/v1/flows?projectId=                   flows (paged by cursor)
//   POST /api/v1/flows/<id>  CHANGE_STATUS          enable / disable a flow
//   GET  /api/v1/flow-runs?projectId=&status=&flowId=&createdAfter=
//                                                   runs, newest first
//   POST /api/v1/webhooks/<flowId>[/sync]           starts a flow (no token)
//
// The Community Edition has no API keys (the module is registered for the
// Enterprise and Cloud editions only, behind a plan feature): the integration
// signs in as a user, like the web interface. The token lasts 7 days: on a
// 401 the client signs in again, once, and retries.
//
// Redirects are not followed: the token would be sent to wherever the address
// points (an http:// address redirected to https:// is reported instead).
// -----------------------------------------------------------------------------

import { AP_ID } from '../config.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TIMEOUT: 'timeout', // no answer in time
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // email or password refused
  FORBIDDEN: 'forbidden', // the user may not see the project, or do this
  PROJECT: 'project', // the project id does not exist
  NOT_AP: 'not_activepieces', // something answers, not the Activepieces API
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  NOT_FOUND: 'not_found', // the flow no longer exists
  REFUSED: 'refused', // Activepieces refused a command, with its reason
  HTTP: 'http', // any other HTTP error
});

export class ApError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status, reason }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'ApError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// Every flow and every run carries a whole flow version (steps, code): a page
// of 100 stays well below this, the 256 MB of the sandbox too.
export const MAX_BODY_BYTES = 16 * 1024 * 1024;
export const PAGE_SIZE = 100;
export const MAX_PAGES = 20;

async function readCapped(response, max) {
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > max) {
    await response.body?.cancel();
    throw Object.assign(new Error('Response too large'), { code: 'TOO_LARGE' });
  }
  if (!response.body) {
    return '';
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > max) {
      throw Object.assign(new Error('Response too large'), { code: 'TOO_LARGE' });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * The one function that talks to the network (fetch). The client takes it as
 * a parameter: the tests replace it with an in-memory Activepieces
 * (test/helpers/fakeActivepieces.js).
 * @returns {Promise<{ status: number, body: string, contentType: string }>}
 */
export async function httpRequest(
  url,
  { method = 'GET', headers = {}, body, timeoutMs = 10_000, maxBytes = MAX_BODY_BYTES } = {},
) {
  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body: await readCapped(response, maxBytes),
  };
}

const dateOf = (value) => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
};

/** One flow of the API, normalized; null when it cannot be identified. */
export function normalizeFlow(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !AP_ID.test(raw.id)) {
    return null;
  }
  const name = raw.version?.displayName;
  return {
    id: raw.id,
    name: (typeof name === 'string' && name.trim()) || raw.id,
    enabled: raw.status === 'ENABLED',
    published: typeof raw.publishedVersionId === 'string' && raw.publishedVersionId !== '',
    // The webhook trigger: the only flows a scene can start.
    webhook: raw.version?.trigger?.settings?.pieceName === '@activepieces/piece-webhook',
  };
}

export const RUN_STATUSES = new Set([
  'SUCCEEDED',
  'FAILED',
  'INTERNAL_ERROR',
  'TIMEOUT',
  'MEMORY_LIMIT_EXCEEDED',
  'QUOTA_EXCEEDED',
  'LOG_SIZE_EXCEEDED',
  'CANCELED',
  'RUNNING',
  'QUEUED',
  'PAUSED',
]);

// The statuses of a run that failed: asked for together, as the interface does.
export const FAILED_STATUSES = [
  'FAILED',
  'INTERNAL_ERROR',
  'TIMEOUT',
  'MEMORY_LIMIT_EXCEEDED',
  'QUOTA_EXCEEDED',
  'LOG_SIZE_EXCEEDED',
];

/**
 * The first useful line of an error message: Activepieces stacks "Error: "
 * prefixes ("Error: Error: Boom") and appends the stack.
 */
export function shortError(message, max = 200) {
  if (typeof message !== 'string') {
    return '';
  }
  const line = message
    .split('\n')[0]
    .replace(/^(\s*(Error|TypeError|RangeError|ReferenceError|SyntaxError):\s*)+/, '')
    .trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** One run of the API, normalized; null when it cannot be identified. */
export function normalizeRun(raw) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    typeof raw.id !== 'string' ||
    !AP_ID.test(raw.id) ||
    typeof raw.flowId !== 'string'
  ) {
    return null;
  }
  const failed = raw.failedStep && typeof raw.failedStep === 'object' ? raw.failedStep : null;
  return {
    id: raw.id,
    flowId: raw.flowId,
    status: RUN_STATUSES.has(raw.status) ? raw.status : 'QUEUED',
    createdAt: dateOf(raw.created),
    startedAt: dateOf(raw.startTime) ?? dateOf(raw.created),
    stoppedAt: dateOf(raw.finishTime),
    error: failed ? shortError(failed.message) : '',
    step: failed
      ? String(
          (typeof failed.displayName === 'string' && failed.displayName) || failed.name || '',
        ).slice(0, 100)
      : '',
  };
}

const parse = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

/** The reason Activepieces gives: `message`, or its error `code`. */
const reasonOf = (body) => {
  const data = parse(body);
  return shortError(String(data?.params?.message ?? data?.message ?? data?.code ?? ''), 150);
};

/**
 * Turn what a scene names into the URL of a flow webhook of this instance: a
 * flow id, or the URL shown by the Catch Webhook trigger
 * (`…/api/v1/webhooks/<flowId>`, `/sync` to wait for the answer). Another
 * host is accepted: Activepieces announces its public address
 * (AP_FRONTEND_URL), which may differ from the one Gladys uses.
 * @returns {{ url: string, sync: boolean, flowId: string } | null}
 */
export function webhookUrl(base, raw, { sync = false } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  const text = raw.trim();
  if (AP_ID.test(text)) {
    return { url: `${base}/api/v1/webhooks/${text}${sync ? '/sync' : ''}`, sync, flowId: text };
  }
  if (!/^https?:\/\//i.test(text)) {
    return null;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const match = url.pathname.match(/^(.*\/v1\/webhooks\/)([0-9a-zA-Z]{21})(\/sync)?\/?$/);
  if (url.username || url.password || !match) {
    return null;
  }
  const waits = sync || Boolean(match[3]);
  url.pathname = `${match[1]}${match[2]}${waits ? '/sync' : ''}`;
  return { url: url.href, sync: waits, flowId: match[2] };
}

export class ActivepiecesClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port][/path]`
   * @param {string} options.email
   * @param {string} options.password
   * @param {string|null} [options.projectId] null: the project of the user
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({
    url,
    email,
    password,
    projectId = null,
    request = httpRequest,
    timeoutMs = 10_000,
  }) {
    this.url = url;
    this.email = email;
    this.password = password;
    this.chosenProject = projectId;
    this.projectId = projectId;
    this.request = request;
    this.timeoutMs = timeoutMs;
    this.token = null;
    this.signingIn = null;
  }

  async call(url, { method = 'GET', token = null, body, timeoutMs = this.timeoutMs } = {}) {
    const headers = { accept: 'application/json' };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    try {
      return await this.request(url, { method, headers, body, timeoutMs });
    } catch (err) {
      const code = err.cause?.code ?? err.code;
      if (TLS_CODES.has(code)) {
        throw new ApError(ERROR_KINDS.TLS, `Certificate refused (${code})`);
      }
      if (err.name === 'TimeoutError' || code === 23) {
        throw new ApError(ERROR_KINDS.TIMEOUT, 'No answer in time');
      }
      if (code === 'TOO_LARGE') {
        throw new ApError(ERROR_KINDS.HTTP, `Answer larger than ${MAX_BODY_BYTES} bytes`);
      }
      throw new ApError(ERROR_KINDS.UNREACHABLE, String(code ?? err.name ?? err.message));
    }
  }

  check(response, { command = false } = {}) {
    const { status } = response;
    if (status >= 200 && status < 300) {
      return;
    }
    const reason = reasonOf(response.body);
    if (status === 401) {
      throw new ApError(ERROR_KINDS.AUTH, `Refused (HTTP 401${reason ? `: ${reason}` : ''})`, {
        status,
        reason,
      });
    }
    if (status === 403) {
      throw new ApError(
        ERROR_KINDS.FORBIDDEN,
        `Forbidden (HTTP 403${reason ? `: ${reason}` : ''})`,
        {
          status,
          reason,
        },
      );
    }
    if (status >= 300 && status < 400) {
      throw new ApError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    const data = parse(response.body);
    if (status === 404 && data?.code === 'ENTITY_NOT_FOUND') {
      const project = data.params?.entityType === 'project';
      throw new ApError(
        project ? ERROR_KINDS.PROJECT : ERROR_KINDS.NOT_FOUND,
        project ? 'Project not found (HTTP 404)' : 'Not found (HTTP 404)',
        { status },
      );
    }
    if (status === 404) {
      throw new ApError(
        command ? ERROR_KINDS.NOT_FOUND : ERROR_KINDS.NOT_AP,
        command ? 'Flow not found (HTTP 404)' : 'No Activepieces API at this address (HTTP 404)',
        { status },
      );
    }
    if (command && status >= 400 && status < 500 && reason) {
      throw new ApError(ERROR_KINDS.REFUSED, `Refused (HTTP ${status}: ${reason})`, {
        status,
        reason,
      });
    }
    throw new ApError(ERROR_KINDS.HTTP, `Unexpected answer (HTTP ${status})`, { status });
  }

  /** The public flags: version and edition. No token needed. */
  async flags() {
    const response = await this.call(`${this.url}/api/v1/flags`);
    this.check(response);
    const data = parse(response.body);
    if (!data || typeof data !== 'object' || Array.isArray(data) || !('EDITION' in data)) {
      throw new ApError(ERROR_KINDS.NOT_AP, 'The answer is not the Activepieces API');
    }
    return {
      version: typeof data.CURRENT_VERSION === 'string' ? data.CURRENT_VERSION.slice(0, 40) : '',
      edition: typeof data.EDITION === 'string' ? data.EDITION : '',
    };
  }

  /** Sign in (shared by concurrent callers): the token, and the user's project. */
  signIn() {
    if (!this.signingIn) {
      this.signingIn = (async () => {
        const response = await this.call(`${this.url}/api/v1/authentication/sign-in`, {
          method: 'POST',
          body: JSON.stringify({ email: this.email, password: this.password }),
        });
        // A password too short for Activepieces is a 400 validation error.
        if (response.status === 400) {
          throw new ApError(ERROR_KINDS.AUTH, 'Sign-in refused (HTTP 400)', { status: 400 });
        }
        this.check(response);
        const data = parse(response.body);
        if (typeof data?.token !== 'string' || !data.token) {
          throw new ApError(ERROR_KINDS.NOT_AP, 'The sign-in answer has no token');
        }
        this.token = data.token;
        if (!this.chosenProject) {
          this.projectId = typeof data.projectId === 'string' ? data.projectId : null;
        }
        if (!this.projectId) {
          throw new ApError(ERROR_KINDS.PROJECT, 'The user has no project');
        }
      })().finally(() => {
        this.signingIn = null;
      });
    }
    return this.signingIn;
  }

  /** An authenticated API call: signs in first, and again once on a 401. */
  async api(path, { method = 'GET', body, command = false } = {}) {
    if (!this.token) {
      await this.signIn();
    }
    const send = () =>
      this.call(`${this.url}/api/v1${path}`, {
        method,
        token: this.token,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let response = await send();
    if (response.status === 401) {
      // The token expired (7 days) or the password changed.
      this.token = null;
      await this.signIn();
      response = await send();
    }
    this.check(response, { command });
    const data = parse(response.body);
    if (!data || typeof data !== 'object') {
      throw new ApError(ERROR_KINDS.NOT_AP, 'The answer is not the Activepieces API');
    }
    return data;
  }

  /** Every page of a list, `MAX_PAGES` at most. */
  async list(path, query, { normalize, maxPages = MAX_PAGES, limit = PAGE_SIZE } = {}) {
    const items = [];
    let cursor = null;
    for (let page = 0; page < maxPages; page += 1) {
      if (!this.token) {
        await this.signIn();
      }
      const params = new URLSearchParams(query);
      params.set('projectId', this.projectId);
      params.set('limit', String(limit));
      if (cursor) {
        params.set('cursor', cursor);
      }
      const data = await this.api(`${path}?${params}`);
      if (!Array.isArray(data.data)) {
        throw new ApError(ERROR_KINDS.NOT_AP, 'The answer is not an Activepieces list');
      }
      for (const raw of data.data) {
        const item = normalize(raw);
        if (item) {
          items.push(item);
        }
      }
      cursor = typeof data.next === 'string' && data.next ? data.next : null;
      if (!cursor) {
        break;
      }
    }
    return items;
  }

  /** The flows of the project. */
  async flows() {
    return this.list('/flows', [], { normalize: normalizeFlow });
  }

  /**
   * Runs, newest first.
   * @param {object} [options]
   * @param {string[]} [options.statuses]
   * @param {string} [options.flowId]
   * @param {number} [options.createdAfter] epoch ms
   * @param {number} [options.maxPages]
   * @param {number} [options.limit] per page
   */
  async runs({ statuses = [], flowId, createdAfter, maxPages = 1, limit = PAGE_SIZE } = {}) {
    const query = statuses.map((status) => ['status', status]);
    if (flowId) {
      query.push(['flowId', flowId]);
    }
    if (createdAfter !== undefined) {
      query.push(['createdAfter', new Date(createdAfter).toISOString()]);
    }
    return this.list('/flow-runs', query, { normalize: normalizeRun, maxPages, limit });
  }

  /** Enable or disable a (published) flow. */
  async setEnabled(id, enabled) {
    await this.api(`/flows/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: { type: 'CHANGE_STATUS', request: { status: enabled ? 'ENABLED' : 'DISABLED' } },
      command: true,
    });
  }

  /**
   * Start a flow by its webhook (POST, JSON body, no token). The answer,
   * whatever its status: a 404 means "no such enabled flow".
   * @returns {Promise<{ status: number, body: string, contentType: string }>}
   */
  async callWebhook(url, payload, { timeoutMs = 15_000 } = {}) {
    return this.call(url, { method: 'POST', body: JSON.stringify(payload), timeoutMs });
  }
}
