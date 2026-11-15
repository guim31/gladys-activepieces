// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// "Start a flow": a flow whose trigger is Catch Webhook starts when its
// webhook URL is called. The scene chooses the flow (a device added to
// Gladys) or pastes the URL, and sends a JSON body built from scene
// variables. Without waiting, Activepieces answers at once (the run goes on);
// waiting calls the `/sync` URL, whose answer is the one of the flow's
// "Return Response" step, handed to the next actions.
//
// "Is this flow failing?" is already a condition on the device feature.
// "State of a flow" is about what a condition cannot do: put the state, the
// failures and the last error in a message, for a flow added or not.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { durationOf, lastFailed, parseFlowId, stateOf } from './devices.js';
import { ActivepiecesClient, ApError, ERROR_KINDS, webhookUrl } from './activepieces/client.js';
import {
  ACTION_TEXT,
  ACTIVE_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  SENTENCE_TEXT,
  STATE_TEXT,
  formatTime,
  labelled,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'activepieces-scenes' });

// What the flow answered, kept for the next actions (the core caps an
// output at 10 000 characters).
export const MAX_RESPONSE = 2000;
// Activepieces answers a /sync call after 30 s at most (AP_WEBHOOK_TIMEOUT_SECONDS).
export const WEBHOOK_TIMEOUT_MS = 35_000;

/**
 * The JSON body sent to the webhook: the text of the field when it is a JSON
 * object or array (scene variables already replaced by Gladys), `{ text }`
 * otherwise, `{}` when empty.
 */
export function bodyOf(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return {};
  }
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object') {
      return value;
    }
  } catch {
    // Plain text.
  }
  return { text: raw };
}

/** The `message` output: a text the flow answered, ready for a notification. */
export function messageOf(body) {
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    return body.trim();
  }
  if (Array.isArray(value)) {
    value = value[0];
  }
  if (typeof value === 'string') {
    return value;
  }
  for (const key of ['message', 'text', 'answer', 'response']) {
    if (value && typeof value[key] === 'string') {
      return value[key];
    }
  }
  return '';
}

const cut = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const isTrue = (value) => value === true || value === 'true' || value === 1 || value === '1';

/** The webhook a scene names: the URL pasted, otherwise the flow chosen. */
export function targetOf(hub, fields) {
  const sync = isTrue(fields.wait);
  if (typeof fields.webhook === 'string' && fields.webhook.trim()) {
    return webhookUrl(hub.config.url, fields.webhook, { sync });
  }
  const id = parseFlowId(hub.gladys, fields.device);
  return id ? webhookUrl(hub.config.url, id, { sync }) : null;
}

export const SCENE_ACTIONS = {
  async run_flow(hub, { fields = {} }) {
    const language = hub.config.language;
    if (!hub.config.url) {
      const text = hub.config.urlTyped ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl;
      throw new Error(pick(text, language));
    }
    const target = targetOf(hub, fields);
    if (!target) {
      throw new Error(pick(ACTION_TEXT.badWebhook, language));
    }
    const client = new ActivepiecesClient({
      url: hub.config.url,
      email: '',
      password: '',
      request: hub.request,
    });
    let response;
    try {
      response = await client.callWebhook(target.url, bodyOf(fields.body), {
        timeoutMs: WEBHOOK_TIMEOUT_MS,
      });
    } catch (err) {
      if (err instanceof ApError && err.kind === ERROR_KINDS.TIMEOUT) {
        // The flow probably runs on: no answer to hand over.
        logger.info(`Webhook called: no answer within ${WEBHOOK_TIMEOUT_MS / 1000} s`);
        return { success: false, status: 0, response: '', message: '' };
      }
      if (!(err instanceof ApError)) {
        throw err;
      }
      throw new Error(pick(ERROR_TEXT[err.kind], language), { cause: err });
    }
    const success = response.status >= 200 && response.status < 300;
    // Never the URL: the flow id in it is the secret of the webhook.
    const line = `Webhook called${target.sync ? ' (waiting)' : ''}: HTTP ${response.status}`;
    if (success) {
      logger.info(line);
    } else {
      logger.warn(line);
    }
    const body = response.body ?? '';
    return {
      success,
      status: response.status,
      response: cut(body, MAX_RESPONSE),
      message: cut(messageOf(body), MAX_RESPONSE),
    };
  },

  async enable_flow(hub, { fields = {} }) {
    await hub.setEnabled(await hub.flowOf(fields.device), true);
  },

  async disable_flow(hub, { fields = {} }) {
    await hub.setEnabled(await hub.flowOf(fields.device), false);
  },

  async get_flow_status(hub, { fields = {} }) {
    await hub.flowOf(fields.device);
    await hub.refreshIfStale();
    const flow = await hub.flowOf(fields.device);
    const name = hub.nameOf(fields.device, flow.name);
    const language = hub.config.language;
    const view = hub.view(flow);
    const stateText = pick(STATE_TEXT[stateOf(view)], language);
    const lastRun = view.last?.startedAt ? formatTime(view.last.startedAt, language) : '';
    const error = view.last && lastFailed(view) ? (hub.lastError(flow.id)?.message ?? '') : '';
    const words = SENTENCE_TEXT[language] ?? SENTENCE_TEXT.en;
    const parts = [
      `${labelled(name, stateText, language)} (${pick(ACTIVE_TEXT[flow.enabled], language)})`,
      lastRun ? words.lastRun(lastRun) : words.never,
    ];
    if (view.failures > 0) {
      parts.push(words.failures(view.failures));
    }
    return {
      enabled: flow.enabled,
      state: stateText,
      failed: lastFailed(view) === 1,
      failures_24h: view.failures,
      last_run: lastRun,
      duration: durationOf(view.last) ?? 0,
      error,
      sentence: `${parts.join(', ')}.${error ? ` ${error}` : ''}`,
    };
  },
};
