// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `activepieces`.
//
// The use case: a glance at the wall tablet tells whether the automations ran
// and which one fails. So the widget shows the enabled flows, the failures of
// the last 24 hours and the runs under way, then one row per flow — the
// failing ones first, then the running ones, then the others — with the state
// of the last run and when it started.
//
// The enabled flows by default (a disabled one runs nothing), or the ones
// chosen in the widget settings (devices added to Gladys, shown with the name
// given in Gladys). The figures are sent as values, not bound to device
// features: the widget works before the devices are added.
//
// Budget (8 components, 2 texts): three tiles, one text when Activepieces does
// not answer, one status list of ten rows at most, a Refresh button that a
// setting hides.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { ONGOING, flowIds, lastFailed, stateOf } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { ACTIVE_TEXT, CONNECTION_TEXT, ERROR_TEXT, STATE_TEXT, formatTime, pick } from './texts.js';

// Action key of the button: permanent once published.
export const ACTIONS = Object.freeze({ REFRESH: 'refresh' });

export const MAX_ROWS = 10;

export const TEXT = {
  empty: {
    en: 'No enabled flow: enable one in Activepieces, or choose flows in the widget settings.',
    fr: 'Aucun flux activé : activez-en un dans Activepieces, ou choisissez des flux dans les réglages du widget.',
    de: 'Kein aktivierter Flow: Aktiviere einen in Activepieces oder wähle Flows in den Widget-Einstellungen.',
    es: 'Ningún flujo activado: active uno en Activepieces, o elija flujos en los ajustes del widget.',
  },
  active: { en: 'Enabled', fr: 'Activés', de: 'Aktiviert', es: 'Activados' },
  failures: { en: 'Failures 24 h', fr: 'Échecs 24 h', de: 'Fehler 24 h', es: 'Fallos 24 h' },
  running: { en: 'Running', fr: 'En cours', de: 'Laufend', es: 'En curso' },
  more: { en: 'Others', fr: 'Autres', de: 'Weitere', es: 'Otros' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  refreshed: {
    en: 'Activepieces read again.',
    fr: 'Activepieces relu.',
    de: 'Activepieces neu gelesen.',
    es: 'Activepieces leído de nuevo.',
  },
};

const running = (view) => Boolean(view.last && ONGOING.has(view.last.status));

// Row order: what needs attention first.
const rank = (view) => {
  if (lastFailed(view) && !running(view)) {
    return 0;
  }
  if (running(view)) {
    return 1;
  }
  if (view.failures > 0) {
    return 2;
  }
  return view.flow.enabled ? 3 : 4;
};

const FAILED_STYLE = { icon: 'x-circle', color: WIDGET_COLORS.DANGER };
const ROW_STYLE = {
  SUCCEEDED: { icon: 'check-circle', color: WIDGET_COLORS.SUCCESS },
  FAILED: FAILED_STYLE,
  INTERNAL_ERROR: { icon: 'x-octagon', color: WIDGET_COLORS.DANGER },
  TIMEOUT: { icon: 'clock', color: WIDGET_COLORS.DANGER },
  MEMORY_LIMIT_EXCEEDED: FAILED_STYLE,
  QUOTA_EXCEEDED: FAILED_STYLE,
  LOG_SIZE_EXCEEDED: FAILED_STYLE,
  CANCELED: { icon: 'slash', color: WIDGET_COLORS.NEUTRAL },
  RUNNING: { icon: 'play-circle', color: WIDGET_COLORS.INFO },
  QUEUED: { icon: 'clock', color: WIDGET_COLORS.INFO },
  PAUSED: { icon: 'pause', color: WIDGET_COLORS.INFO },
  never: { icon: 'circle', color: WIDGET_COLORS.NEUTRAL },
};
const INACTIVE_STYLE = { icon: 'pause-circle', color: WIDGET_COLORS.NEUTRAL };

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: pick(text, language) }],
  };
}

/** The flows the widget shows: the chosen devices, or every enabled flow. */
export function selectViews(hub, settings) {
  const chosen = [settings?.flows ?? []].flat().filter((id) => typeof id === 'string' && id);
  const views =
    chosen.length === 0
      ? hub.views().filter((view) => view.flow.enabled)
      : [...new Set(chosen)]
          .map((id) => hub.find(id))
          .filter(Boolean)
          .map((flow) => hub.view(flow));
  // The name given in Gladys, when the device was added (and maybe renamed).
  return views.map((view) => ({
    ...view,
    name: hub.nameOf(flowIds(hub.gladys, view.flow.id).device, view.flow.name),
  }));
}

export function sortViews(views) {
  return [...views].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function rowValue(view, language) {
  const state = pick(STATE_TEXT[stateOf(view)], language);
  const parts = [view.flow.enabled ? state : pick(ACTIVE_TEXT.false, language)];
  if (view.last?.startedAt) {
    parts.push(formatTime(view.last.startedAt, language));
  }
  if (view.failures > 0) {
    parts.push(`✗${view.failures}`);
  }
  return parts.join(' · ');
}

async function get(hub, { settings, language = 'en' }) {
  const status = hub.connectionStatus();
  if (!hub.client) {
    return message(status.message ?? CONNECTION_TEXT.noAccount, language);
  }
  const views = sortViews(selectViews(hub, settings));
  if (views.length === 0 && !hub.error) {
    return message(TEXT.empty, language);
  }

  const failures = views.reduce((sum, view) => sum + view.failures, 0);
  const runningCount = views.filter(running).length;
  const components = [
    {
      type: 'value',
      value: views.filter((view) => view.flow.enabled).length,
      label: pick(TEXT.active, language),
      icon: 'zap',
      color: WIDGET_COLORS.PRIMARY,
    },
    {
      type: 'value',
      value: failures,
      label: pick(TEXT.failures, language),
      icon: 'x-circle',
      color: failures > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: runningCount,
      label: pick(TEXT.running, language),
      icon: 'play-circle',
      color: runningCount > 0 ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    },
  ];

  if (hub.error) {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(ERROR_TEXT[hub.error.kind], language),
    });
  }

  if (views.length > 0) {
    const shown = views.length > MAX_ROWS ? views.slice(0, MAX_ROWS - 1) : views;
    const items = shown.map((view) => ({
      label: fit(view.name, 40),
      value: fit(rowValue(view, language), 40),
      ...(view.flow.enabled ? ROW_STYLE[stateOf(view)] : INACTIVE_STYLE),
    }));
    if (views.length > shown.length) {
      items.push({
        label: pick(TEXT.more, language),
        value: `+${views.length - shown.length}`,
        icon: 'more-horizontal',
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
    components.push({ type: 'status', items });
  }

  if (settings?.show_refresh !== false) {
    components.push({
      type: 'button',
      label: pick(TEXT.refresh, language),
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: ACTIONS.REFRESH },
    });
  }

  // Something running or failing moves: refresh sooner.
  const moving = hub.error || runningCount > 0;
  return { ttl_seconds: moving ? 30 : 60, components };
}

async function action(hub, { actionKey }) {
  if (actionKey !== ACTIONS.REFRESH) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  await hub.pollNow();
  if (hub.error) {
    return { message: ERROR_TEXT[hub.error.kind] };
  }
  return { message: TEXT.refreshed };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
