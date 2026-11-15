// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Activepieces instance: its address and the email and password of a user
// (the Community Edition has no API keys, see src/activepieces/client.js),
// and optionally the project to follow (the user's own project otherwise).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

// The port of the official docker-compose file: added to a bare host typed
// without one.
export const DEFAULT_PORT = 8080;

export const DEFAULT_CONFIG = {
  url: '',
  email: '',
  password: '',
  project_id: '',
  poll_interval: '60',
  allow_toggle: false,
  language: 'fr',
};

// Pages of the Activepieces interface and API roots: a URL copied from the
// browser points at one of them, the instance lives at the root.
const INTERFACE_PATH =
  /\/(flows|runs|projects|platform|settings|sign-in|sign-up|connections|tables|templates|agents|mcps|todos|releases|api|embed|forms|chat|redirect)(\/.*)?$/i;

// Activepieces ids: 21 characters, letters and digits (checked on 0.82).
export const AP_ID = /^[0-9a-zA-Z]{21}$/;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10`, port 8080 added), `host:port`, or a URL copied from the
 * browser (`https://ap.example.com/flows`). HTTP by default for a bare host.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  // `url.port` is empty for a default port typed on purpose (`host:80`).
  const typedPort = /^[^/?#]*:\d+(?:[/?#]|$)/.test(
    hasScheme ? text.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') : text,
  );
  if (!hasScheme && !url.port && !typedPort) {
    url.port = String(DEFAULT_PORT);
  }
  const path = url.pathname.replace(INTERFACE_PATH, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Activepieces Cloud (`cloud.activepieces.com`). */
export const isCloud = (url) =>
  /^https?:\/\/([a-z0-9-]+\.)*activepieces\.com(:\d+)?(\/|$)/i.test(url);

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pollInterval = POLL_INTERVALS.includes(String(source.poll_interval))
    ? String(source.poll_interval)
    : DEFAULT_CONFIG.poll_interval;
  const typed = text('url');
  // The project id, or the address of a page of the project copied from the browser.
  const project = text('project_id');
  const projectId = project.match(/(?:^|\/projects\/)([0-9a-zA-Z]{21})(?:[/?#]|$)/)?.[1] ?? null;
  return {
    // null: nothing typed, or not understood (see hub.connectionStatus).
    url: typed ? parseServerUrl(typed) : null,
    urlTyped: Boolean(typed),
    email: text('email'),
    // A password is kept as typed, but a pasted one often carries a new line.
    password: typeof source.password === 'string' ? source.password.replace(/[\r\n]+$/, '') : '',
    projectId,
    projectTyped: Boolean(project),
    pollIntervalMs: Number(pollInterval) * 1000,
    allowToggle: source.allow_toggle === true || source.allow_toggle === 'true',
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
