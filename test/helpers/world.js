// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Activepieces, a temporary /data
// and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs: the tests read Activepieces with
// `world.hub.pollNow()`. (Adapted from guim31/gladys-n8n.)
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { flowIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import {
  BASE,
  EMAIL,
  FakeActivepieces,
  PASSWORD,
  PROJECT,
  sampleActivepieces,
} from './fakeActivepieces.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

/** A manual clock, shared by the hub and the tests. */
export function createClock(start = Date.UTC(2026, 9, 17, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export async function createWorld({
  clock = createClock(),
  ap = sampleActivepieces(),
  config = { url: BASE, email: EMAIL, password: PASSWORD, language: 'en' },
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-activepieces-')),
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: ap.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, ap, app, hub: app.hub, clock, dataDir };
}

/** External ids of the device of a flow of the fake, by name. */
export const idsOf = (world, name) => flowIds(world.gladys, world.ap.flow(name).id);

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

export { BASE, EMAIL, FakeActivepieces, PASSWORD, PROJECT, sampleActivepieces };
