// -----------------------------------------------------------------------------
// Scene actions and the dashboard widget, through the SDK's fake Gladys (the
// path a real Gladys takes: `sceneAction`, `widgetGet`, `widgetAction`).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { bodyOf, messageOf } from '../src/scenes.js';
import { BASE, EMAIL, PASSWORD, createDevices, createWorld, idsOf } from './helpers/world.js';

const GREETING = '1crfut7FNxq2FoQfXgH46';
const REPORT = 'u5Kk668UQcjxuk9f6ip01';

test('"Start an Activepieces flow": a chosen flow, JSON body, the run starts', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const runs = world.ap.runs.length;
  const ack = await world.fake.sceneAction('run_flow', {
    device: idsOf(world, 'Greeting webhook').device,
    body: '{"name": "Gladys"}',
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { success: true, status: 200, message: '', response: '{}' });
  assert.equal(world.ap.runs.length, runs + 1);
  const call = world.ap.requests.at(-1);
  assert.equal(call.url, `${BASE}/api/v1/webhooks/${GREETING}`);
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.authorization, undefined, 'the token never goes to a webhook');
  assert.equal(call.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(call.body), { name: 'Gladys' });
});

test('"Start an Activepieces flow": a pasted URL, waiting for the answer of the flow', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  // The public address Activepieces announces may differ from the one Gladys uses.
  const ack = await world.fake.sceneAction('run_flow', {
    webhook: `https://ap.example.com/api/v1/webhooks/${GREETING}`,
    body: '{"name": "Gladys"}',
    wait: true,
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    success: true,
    status: 200,
    message: 'Hello Gladys',
    response: '{"message":"Hello Gladys"}',
  });
  assert.equal(
    world.ap.requests.at(-1).url,
    `https://ap.example.com/api/v1/webhooks/${GREETING}/sync`,
  );

  // A /sync URL waits by itself; a text body becomes { text }.
  await world.fake.sceneAction('run_flow', {
    webhook: `${BASE}/api/v1/webhooks/${GREETING}/sync`,
    body: 'Living room',
  });
  assert.deepEqual(JSON.parse(world.ap.requests.at(-1).body), { text: 'Living room' });
  assert.match(world.ap.requests.at(-1).url, /\/sync$/);
});

test('"Start an Activepieces flow": a disabled flow answers success: false; bad input', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const disabled = await world.fake.sceneAction('run_flow', {
    device: idsOf(world, 'Nightly report').device,
  });
  assert.equal(disabled.success, true);
  assert.deepEqual(disabled.data.outputs, {
    success: false,
    status: 404,
    message: '',
    response: '{}',
  });

  for (const fields of [{}, { webhook: 'https://example.com/other' }, { device: 'ext:x:y' }]) {
    const bad = await world.fake.sceneAction('run_flow', fields);
    assert.equal(bad.success, false);
    assert.match(bad.error, /Catch Webhook/);
  }

  world.ap.down = 'ECONNREFUSED';
  const down = await world.fake.sceneAction('run_flow', { webhook: GREETING });
  assert.equal(down.success, false);
  assert.match(down.error, /Activepieces does not answer/);
});

test('"Start an Activepieces flow": no answer in time gives status 0, not an error', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.hub.request = async () => {
    throw Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
  };
  const ack = await world.fake.sceneAction('run_flow', { webhook: GREETING, wait: true });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { success: false, status: 0, response: '', message: '' });
});

test('the webhook body and the message answered', () => {
  assert.deepEqual(bodyOf(''), {});
  assert.deepEqual(bodyOf('[1, 2]'), [1, 2]);
  assert.deepEqual(bodyOf('42'), { text: '42' });
  assert.equal(messageOf('[{"text": "ok"}]'), 'ok');
  assert.equal(messageOf('"plain"'), 'plain');
  assert.equal(messageOf('{"count": 3}'), '');
  assert.equal(messageOf(' Started '), 'Started');
});

test('"State of a flow", in the language of the configuration, with the name given in Gladys', async (t) => {
  const world = await createWorld({
    config: { url: BASE, email: EMAIL, password: PASSWORD, language: 'fr' },
  });
  t.after(() => world.app.stop());
  const device = idsOf(world, 'Nightly backup').device;
  const ack = await world.fake.sceneAction('get_flow_status', { device });
  assert.equal(ack.success, true, ack.error);
  const outputs = ack.data.outputs;
  assert.equal(outputs.enabled, true);
  assert.equal(outputs.failed, true);
  assert.equal(outputs.state, 'En échec');
  assert.equal(outputs.failures_24h, 1);
  assert.equal(outputs.duration, 1);
  assert.match(outputs.last_run, /^17\/10/);
  assert.equal(outputs.error, 'Backup target unreachable');
  assert.match(
    outputs.sentence,
    /^Nightly backup : En échec \(activé\), dernière exécution 17\/10.*1 échec\(s\) en 24 h\. Backup target unreachable$/,
  );

  await createDevices(world);
  const added = world.fake.discoveredDevices.find((d) => d.external_id === device);
  await world.fake.deviceUpdated({ ...added, name: 'Sauvegarde' });
  const renamed = await world.fake.sceneAction('get_flow_status', { device });
  assert.match(renamed.data.outputs.sentence, /^Sauvegarde : En échec/);

  const unknown = await world.fake.sceneAction('get_flow_status', { device: 'ext:other:x' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /n'est pas un flux Activepieces/);
});

test('enable and disable a flow from a scene, whatever the switch option', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = idsOf(world, 'Nightly report').device;
  assert.equal((await world.fake.sceneAction('enable_flow', { device })).success, true);
  assert.equal(world.ap.flow('Nightly report').enabled, true);
  assert.equal(world.hub.flows.get(REPORT).enabled, true, 'read again');
  assert.equal((await world.fake.sceneAction('disable_flow', { device })).success, true);
  assert.equal(world.ap.flow('Nightly report').enabled, false);
  world.ap.status = 403;
  const refused = await world.fake.sceneAction('enable_flow', { device });
  assert.equal(refused.success, false);
  assert.match(refused.error, /may not do it/);
});

test('the widget: failing flows first, then running, then the others; a Refresh button', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.ap.run('Greeting webhook', { status: 'RUNNING' });
  await world.hub.pollNow();
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  assert.equal(ack.success, true, ack.error);
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content).errors ?? [], []);
  assert.ok(content.components.length <= 8);
  const [active, failures, running] = content.components;
  assert.deepEqual(
    [active.value, failures.value, running.value],
    [2, 1, 1],
    'enabled flows, failures in 24 h, running',
  );
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => row.label),
    ['Nightly backup', 'Greeting webhook'],
    'the disabled report is left out by default',
  );
  assert.match(rows[0].value, /^Failed · 17\/10.* · ✗1$/);
  assert.equal(rows[1].value.split(' · ')[0], 'Running');
  assert.equal(content.ttl_seconds, 30, 'something runs: refresh sooner');
  assert.ok(content.components.some((c) => c.type === 'button'));

  // Chosen flows, named as in Gladys: the disabled one shows as such; no button.
  await createDevices(world);
  const report = world.fake.discoveredDevices.find((d) => d.name === 'Nightly report');
  await world.fake.deviceUpdated({ ...report, name: 'Rapport' });
  const chosen = await world.fake.widgetGet(WIDGET_KEY, {
    settings: { flows: [report.external_id], show_refresh: false },
    language: 'fr',
  });
  const components = chosen.data.content.components;
  const items = components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    items.map((row) => [row.label, row.value]),
    [['Rapport', 'désactivé']],
  );
  assert.ok(!components.some((c) => c.type === 'button'), 'the button can be hidden');

  const refresh = await world.fake.widgetAction(WIDGET_KEY, 'refresh');
  assert.equal(refresh.success, true, refresh.error);
  assert.equal(refresh.data.message.en, 'Activepieces read again.');
});

test('the widget says what to do without an account, and when Activepieces does not answer', async (t) => {
  const none = await createWorld({ config: { url: BASE } });
  t.after(() => none.app.stop());
  const empty = await none.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'de' });
  assert.match(empty.data.content.components[0].text, /Passwort/);

  const world = await createWorld();
  t.after(() => world.app.stop());
  world.ap.down = 'ECONNREFUSED';
  await world.hub.pollNow();
  const down = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'es' });
  assert.deepEqual(validateWidgetContent(down.data.content).errors ?? [], []);
  assert.ok(
    down.data.content.components.some(
      (c) => c.type === 'text' && c.text === 'Activepieces no responde',
    ),
  );
});

test('"Test the connection" sums the instance up in four languages', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection');
  assert.equal(ack.success, true, ack.error);
  assert.equal(
    ack.data.message?.fr ?? ack.data.fr,
    'Activepieces 0.82.0 : Connecté, 3 flux, 2 activé(s), 1 échec(s) en 24 h',
  );
});
