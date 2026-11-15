// -----------------------------------------------------------------------------
// The Activepieces client and the configuration: addresses, project ids,
// webhook URLs, the real answers of Activepieces 0.82 (test/fixtures/
// activepieces; the runs without their copy of the flow version), sign-in and
// its renewal, paging, and the errors by kind.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, isCloud, normalizeConfig, parseServerUrl } from '../src/config.js';
import {
  ActivepiecesClient,
  ApError,
  ERROR_KINDS,
  normalizeRun,
  shortError,
  webhookUrl,
} from '../src/activepieces/client.js';

const fixture = async (name) =>
  readFile(new URL(`./fixtures/activepieces/${name}.json`, import.meta.url), 'utf8');

const FLOW = '1crfut7FNxq2FoQfXgH46';
const PROJECT = 'nAWuaAM4rycMEvMkyvHoZ';
const signedIn = { status: 200, body: JSON.stringify({ token: 't1', projectId: PROJECT }) };

test('the address: bare host with the docker-compose port, pasted interface URLs', () => {
  assert.equal(parseServerUrl('192.0.2.10'), 'http://192.0.2.10:8080');
  assert.equal(parseServerUrl(' 192.0.2.10:80 '), 'http://192.0.2.10', 'port 80 typed');
  assert.equal(parseServerUrl('https://ap.example.com/flows'), 'https://ap.example.com');
  assert.equal(
    parseServerUrl(`https://ap.example.com/projects/${PROJECT}/flows/${FLOW}`),
    'https://ap.example.com',
  );
  assert.equal(parseServerUrl('http://192.0.2.10:8080/api/v1/'), 'http://192.0.2.10:8080');
  assert.equal(parseServerUrl('https://user:pass@ap.example.com'), null, 'no credentials');
  assert.equal(parseServerUrl('ftp://ap.example.com'), null);
  assert.equal(parseServerUrl(''), null);
  assert.ok(isCloud('https://cloud.activepieces.com'));
  assert.ok(!isCloud('http://192.0.2.10:8080'));
});

test('the configuration is normalized', () => {
  assert.deepEqual(normalizeConfig({}), {
    url: null,
    urlTyped: false,
    email: '',
    password: '',
    projectId: null,
    projectTyped: false,
    pollIntervalMs: 60_000,
    allowToggle: false,
    language: 'fr',
  });
  const config = normalizeConfig({
    url: '192.0.2.10',
    email: ' gladys@example.com ',
    password: ' pass word \n',
    project_id: `https://ap.example.com/projects/${PROJECT}/flows`,
    poll_interval: '300',
    allow_toggle: true,
    language: 'de',
  });
  assert.equal(config.url, 'http://192.0.2.10:8080');
  assert.equal(config.email, 'gladys@example.com');
  assert.equal(config.password, ' pass word ', 'spaces are part of a password');
  assert.equal(config.projectId, PROJECT);
  assert.equal(config.pollIntervalMs, 300_000);
  assert.equal(config.allowToggle, true);
  assert.equal(normalizeConfig({ project_id: PROJECT }).projectId, PROJECT);
  assert.equal(normalizeConfig({ project_id: 'nope' }).projectId, null);
  assert.equal(normalizeConfig({ project_id: 'nope' }).projectTyped, true);
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollIntervalMs, 60_000);
  assert.equal(DEFAULT_CONFIG.language, 'fr');
});

test('the webhook of a scene: a flow id, or the URL of the Catch Webhook trigger', () => {
  const base = 'http://192.0.2.10:8080';
  assert.deepEqual(webhookUrl(base, FLOW), {
    url: `${base}/api/v1/webhooks/${FLOW}`,
    sync: false,
    flowId: FLOW,
  });
  assert.equal(webhookUrl(base, FLOW, { sync: true }).url, `${base}/api/v1/webhooks/${FLOW}/sync`);
  assert.deepEqual(webhookUrl(base, `https://ap.example.com/api/v1/webhooks/${FLOW}/sync`), {
    url: `https://ap.example.com/api/v1/webhooks/${FLOW}/sync`,
    sync: true,
    flowId: FLOW,
  });
  assert.equal(
    webhookUrl(base, `https://ap.example.com/api/v1/webhooks/${FLOW}`, { sync: true }).url,
    `https://ap.example.com/api/v1/webhooks/${FLOW}/sync`,
  );
  for (const bad of [
    '',
    '  ',
    'short',
    `${FLOW}x`,
    'https://example.com/login',
    `https://ap.example.com/api/v1/webhooks/${FLOW}/draft`,
    `https://u:p@ap.example.com/api/v1/webhooks/${FLOW}`,
  ]) {
    assert.equal(webhookUrl(base, bad), null, bad);
  }
});

test('the real answers of Activepieces 0.82 are read', async () => {
  const bodies = { flows: await fixture('flows'), runs: await fixture('flow-runs') };
  const client = new ActivepiecesClient({
    url: 'http://192.0.2.10:8080',
    email: 'e',
    password: 'p',
    request: async (url) => {
      const { pathname } = new URL(url);
      if (pathname.endsWith('/sign-in')) {
        return signedIn;
      }
      return { status: 200, body: pathname.endsWith('/flows') ? bodies.flows : bodies.runs };
    },
  });
  const flows = await client.flows();
  assert.deepEqual(
    flows.map((f) => [f.name, f.enabled, f.published, f.webhook]),
    [
      ['Gladys fails', true, true, true],
      ['Gladys OK', true, true, true],
      ['Gladys draft', false, false, true],
    ],
  );
  const runs = await client.runs();
  assert.equal(runs.length, 4);
  assert.deepEqual(runs[0], {
    id: 'IYREV0QfmxOWhL8EMWzAt',
    flowId: '0jXMVm9MwuVUhuyzcPLH4',
    status: 'FAILED',
    createdAt: Date.parse('2026-11-15T16:23:45.783Z'),
    startedAt: Date.parse('2026-11-15T16:23:46.072Z'),
    stoppedAt: Date.parse('2026-11-15T16:23:46.149Z'),
    error: 'Boom from Gladys test',
    step: 'Code',
  });
  assert.equal(runs[3].status, 'SUCCEEDED');
  assert.equal(runs[3].error, '');
});

test('sign-in: once, the project of the user, again on an expired token', async () => {
  const calls = [];
  let tokens = 0;
  const client = new ActivepiecesClient({
    url: 'http://ap/sub',
    email: 'gladys@example.com',
    password: 'secret-password',
    request: async (url, options) => {
      calls.push({ url, ...options });
      if (url.endsWith('/sign-in')) {
        tokens += 1;
        return { status: 200, body: JSON.stringify({ token: `t${tokens}`, projectId: PROJECT }) };
      }
      if (options.headers.authorization !== `Bearer t${tokens}` || calls.length === 3) {
        return { status: 401, body: await fixture('bad-token') };
      }
      return { status: 200, body: '{"data":[],"next":null}' };
    },
  });
  await client.flows();
  await client.flows(); // the third call answers 401: signed in again
  await client.setEnabled(FLOW, false);
  const signIns = calls.filter((c) => c.url.endsWith('/sign-in'));
  assert.equal(signIns.length, 2);
  assert.deepEqual(JSON.parse(signIns[0].body), {
    email: 'gladys@example.com',
    password: 'secret-password',
  });
  assert.equal(signIns[0].method, 'POST');
  assert.equal(calls[1].url, `http://ap/sub/api/v1/flows?projectId=${PROJECT}&limit=100`);
  assert.equal(calls[1].headers.authorization, 'Bearer t1');
  const command = calls.at(-1);
  assert.equal(command.url, `http://ap/sub/api/v1/flows/${FLOW}`);
  assert.equal(command.method, 'POST');
  assert.deepEqual(JSON.parse(command.body), {
    type: 'CHANGE_STATUS',
    request: { status: 'DISABLED' },
  });
});

test('a chosen project replaces the one of the user', async () => {
  const urls = [];
  const client = new ActivepiecesClient({
    url: 'http://ap',
    email: 'e',
    password: 'p',
    projectId: 'AAAAAAAAAAAAAAAAAAAAA',
    request: async (url) => {
      urls.push(url);
      return url.endsWith('/sign-in') ? signedIn : { status: 200, body: '{"data":[]}' };
    },
  });
  await client.runs({ statuses: ['FAILED', 'TIMEOUT'], createdAfter: 0, flowId: FLOW });
  const query = new URL(urls[1]).searchParams;
  assert.equal(query.get('projectId'), 'AAAAAAAAAAAAAAAAAAAAA');
  assert.deepEqual(query.getAll('status'), ['FAILED', 'TIMEOUT']);
  assert.equal(query.get('flowId'), FLOW);
  assert.equal(query.get('createdAfter'), '1970-01-01T00:00:00.000Z');
});

test('pages are followed by cursor', async () => {
  const seen = [];
  const client = new ActivepiecesClient({
    url: 'http://ap',
    email: 'e',
    password: 'p',
    request: async (url) => {
      if (url.endsWith('/sign-in')) {
        return signedIn;
      }
      const cursor = new URL(url).searchParams.get('cursor');
      seen.push(cursor);
      const page = cursor ? 2 : 1;
      const data = [1, 2].map((n) => ({
        id: `R${String(page * 10 + n).padStart(20, '0')}`,
        flowId: FLOW,
        status: 'FAILED',
        created: new Date(Date.UTC(2026, 9, 17, 10)).toISOString(),
      }));
      return { status: 200, body: JSON.stringify({ data, next: page === 1 ? 'c2' : null }) };
    },
  });
  const all = await client.runs({ statuses: ['FAILED'], maxPages: 5 });
  assert.equal(all.length, 4);
  assert.deepEqual(seen, [null, 'c2']);
  seen.length = 0;
  assert.equal((await client.runs({ maxPages: 1 })).length, 2);
  assert.deepEqual(seen, [null]);
});

test('every failure has its kind, and the reason Activepieces gives', async () => {
  const answer = (status, body = {}, signIn = signedIn) =>
    new ActivepiecesClient({
      url: 'http://ap',
      email: 'e',
      password: 'p',
      request: async (url) =>
        url.endsWith('/sign-in') ? signIn : { status, body: JSON.stringify(body) },
    });
  const kind = async (client, call) => {
    try {
      await call(client);
    } catch (err) {
      assert.ok(err instanceof ApError);
      return [err.kind, err.reason];
    }
    return null;
  };
  const list = (c) => c.flows();
  const refused = { status: 401, body: await fixture('sign-in-refused') };
  assert.deepEqual(await kind(answer(200, {}, refused), list), [
    ERROR_KINDS.AUTH,
    'INVALID_CREDENTIALS',
  ]);
  const short = { status: 400, body: '{"code":"FST_ERR_VALIDATION"}' };
  assert.deepEqual(await kind(answer(200, {}, short), list), [ERROR_KINDS.AUTH, undefined]);
  assert.deepEqual(await kind(answer(404, JSON.parse(await fixture('project-not-found'))), list), [
    ERROR_KINDS.PROJECT,
    undefined,
  ]);
  assert.deepEqual(await kind(answer(403, { message: 'Forbidden' }), list), [
    ERROR_KINDS.FORBIDDEN,
    'Forbidden',
  ]);
  assert.deepEqual(await kind(answer(404), list), [ERROR_KINDS.NOT_AP, undefined]);
  assert.deepEqual(await kind(answer(301), list), [ERROR_KINDS.REDIRECT, undefined]);
  assert.deepEqual(await kind(answer(502), list), [ERROR_KINDS.HTTP, undefined]);
  assert.deepEqual(await kind(answer(200, {}), (c) => c.flags()), [ERROR_KINDS.NOT_AP, undefined]);
  const html = new ActivepiecesClient({
    url: 'http://ap',
    email: 'e',
    password: 'p',
    request: async () => ({ status: 200, body: '<html></html>' }),
  });
  assert.deepEqual(await kind(html, list), [ERROR_KINDS.NOT_AP, undefined]);
  const enable = (c) => c.setEnabled(FLOW, true);
  assert.deepEqual(
    await kind(answer(404, { code: 'ENTITY_NOT_FOUND', params: { entityType: 'flow' } }), enable),
    [ERROR_KINDS.NOT_FOUND, undefined],
  );
  assert.deepEqual(
    await kind(answer(409, { code: 'FLOW_OPERATION_INVALID', params: null }), enable),
    [ERROR_KINDS.REFUSED, 'FLOW_OPERATION_INVALID'],
  );
  const failing = (error) =>
    new ActivepiecesClient({
      url: 'http://ap',
      email: 'e',
      password: 'p',
      request: async () => {
        throw error;
      },
    });
  assert.equal(
    (
      await kind(failing(Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } })), list)
    )[0],
    ERROR_KINDS.UNREACHABLE,
  );
  assert.equal(
    (
      await kind(
        failing(Object.assign(new Error('x'), { cause: { code: 'CERT_HAS_EXPIRED' } })),
        list,
      )
    )[0],
    ERROR_KINDS.TLS,
  );
  assert.equal(
    (await kind(failing(Object.assign(new Error('x'), { name: 'TimeoutError' })), list))[0],
    ERROR_KINDS.TIMEOUT,
  );
});

test('short errors and odd runs', () => {
  assert.equal(
    shortError('Error: Error: Boom from Gladys test\n    at x'),
    'Boom from Gladys test',
  );
  assert.equal(shortError('TypeError: x is not a function'), 'x is not a function');
  assert.equal(shortError('First line\nstack'), 'First line');
  assert.equal(shortError('x'.repeat(300)).length, 200);
  assert.equal(shortError(undefined), '');
  const id = 'R0000000000000000000a';
  assert.equal(normalizeRun({ id, flowId: FLOW, status: 'ODD' }).status, 'QUEUED');
  assert.equal(normalizeRun({ id: 'a b', flowId: FLOW }), null);
  assert.equal(normalizeRun({ id }), null);
});
