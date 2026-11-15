// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, run states, the "Test the connection"
// report, scene outputs and errors, dates. Four languages, the four of the
// Gladys interface; German says "du", Spanish "usted". test/i18n.test.js
// checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './activepieces/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Activepieces in the configuration.',
    fr: "Saisissez l'adresse de votre Activepieces dans la configuration.",
    de: 'Gib die Adresse deines Activepieces in der Konfiguration ein.',
    es: 'Introduzca la dirección de su Activepieces en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.2:8080',
    fr: 'Adresse incomprise, ex. http://192.168.1.2:8080',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.2:8080',
    es: 'Dirección no válida, p. ej. http://192.168.1.2:8080',
  },
  noAccount: {
    en: 'Enter the email and password of an Activepieces user in the configuration.',
    fr: "Saisissez l'e-mail et le mot de passe d'un utilisateur Activepieces dans la configuration.",
    de: 'Gib die E-Mail-Adresse und das Passwort eines Activepieces-Benutzers in der Konfiguration ein.',
    es: 'Introduzca el correo electrónico y la contraseña de un usuario de Activepieces en la configuración.',
  },
  invalidProject: {
    en: 'Project id not understood: 21 letters and digits, or leave it empty.',
    fr: 'Identifiant de projet incompris : 21 lettres et chiffres, ou laissez-le vide.',
    de: 'Projekt-ID nicht verstanden: 21 Buchstaben und Ziffern, oder lass das Feld leer.',
    es: 'Identificador de proyecto no válido: 21 letras y cifras, o déjelo vacío.',
  },
};

// One short explanation per error kind (src/activepieces/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Activepieces does not answer',
    fr: 'Activepieces ne répond pas',
    de: 'Activepieces antwortet nicht',
    es: 'Activepieces no responde',
  },
  [ERROR_KINDS.TIMEOUT]: {
    en: 'Activepieces did not answer in time',
    fr: "Activepieces n'a pas répondu à temps",
    de: 'Activepieces hat nicht rechtzeitig geantwortet',
    es: 'Activepieces no ha respondido a tiempo',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use an http:// address or a trusted certificate',
    fr: 'certificat refusé : utilisez une adresse http:// ou un certificat reconnu',
    de: 'Zertifikat abgelehnt: Nutze eine http://-Adresse oder ein vertrauenswürdiges Zertifikat',
    es: 'certificado rechazado: use una dirección http:// o un certificado reconocido',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'email or password refused by Activepieces',
    fr: 'e-mail ou mot de passe refusé par Activepieces',
    de: 'E-Mail-Adresse oder Passwort von Activepieces abgelehnt',
    es: 'correo electrónico o contraseña rechazados por Activepieces',
  },
  [ERROR_KINDS.FORBIDDEN]: {
    en: 'refused by Activepieces: this user may not do it in this project',
    fr: "refusé par Activepieces : cet utilisateur n'en a pas le droit dans ce projet",
    de: 'von Activepieces abgelehnt: Dieser Benutzer darf das in diesem Projekt nicht',
    es: 'rechazado por Activepieces: este usuario no tiene permiso en este proyecto',
  },
  [ERROR_KINDS.PROJECT]: {
    en: 'project not found: check its id, or leave the field empty',
    fr: 'projet introuvable : vérifiez son identifiant, ou laissez le champ vide',
    de: 'Projekt nicht gefunden: Prüfe seine ID oder lass das Feld leer',
    es: 'proyecto no encontrado: compruebe su identificador o deje el campo vacío',
  },
  [ERROR_KINDS.NOT_AP]: {
    en: 'no Activepieces API at this address',
    fr: 'aucune API Activepieces à cette adresse',
    de: 'keine Activepieces-API unter dieser Adresse',
    es: 'no hay ninguna API de Activepieces en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.NOT_FOUND]: {
    en: 'this flow no longer exists in Activepieces',
    fr: "ce flux n'existe plus dans Activepieces",
    de: 'dieser Flow existiert in Activepieces nicht mehr',
    es: 'este flujo ya no existe en Activepieces',
  },
  [ERROR_KINDS.REFUSED]: {
    en: 'refused by Activepieces',
    fr: 'refusé par Activepieces',
    de: 'von Activepieces abgelehnt',
    es: 'rechazado por Activepieces',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The state of a flow, in words: the status of its last run.
export const STATE_TEXT = {
  SUCCEEDED: { en: 'Succeeded', fr: 'Réussi', de: 'Erfolgreich', es: 'Correcto' },
  FAILED: { en: 'Failed', fr: 'En échec', de: 'Fehlgeschlagen', es: 'Fallido' },
  INTERNAL_ERROR: {
    en: 'Internal error',
    fr: 'Erreur interne',
    de: 'Interner Fehler',
    es: 'Error interno',
  },
  TIMEOUT: { en: 'Timed out', fr: 'Délai dépassé', de: 'Zeitüberschreitung', es: 'Tiempo agotado' },
  MEMORY_LIMIT_EXCEEDED: {
    en: 'Out of memory',
    fr: 'Mémoire dépassée',
    de: 'Speicher überschritten',
    es: 'Memoria agotada',
  },
  QUOTA_EXCEEDED: {
    en: 'Quota exceeded',
    fr: 'Quota dépassé',
    de: 'Kontingent überschritten',
    es: 'Cuota superada',
  },
  LOG_SIZE_EXCEEDED: {
    en: 'Logs too large',
    fr: 'Journal trop gros',
    de: 'Protokoll zu groß',
    es: 'Registro muy grande',
  },
  CANCELED: { en: 'Canceled', fr: 'Annulé', de: 'Abgebrochen', es: 'Cancelado' },
  RUNNING: { en: 'Running', fr: 'En cours', de: 'Läuft', es: 'En ejecución' },
  QUEUED: { en: 'Queued', fr: "En file d'attente", de: 'In Warteschlange', es: 'En cola' },
  PAUSED: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  never: { en: 'Never run', fr: 'Jamais exécuté', de: 'Nie ausgeführt', es: 'Nunca ejecutado' },
};

export const ACTIVE_TEXT = {
  true: { en: 'enabled', fr: 'activé', de: 'aktiviert', es: 'activado' },
  false: { en: 'disabled', fr: 'désactivé', de: 'deaktiviert', es: 'desactivado' },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: 'Connected',
    flows: (count) => `${count} flow(s)`,
    active: (count) => `${count} enabled`,
    failures: (count) => `${count} failure(s) in 24 h`,
  },
  fr: {
    ok: 'Connecté',
    flows: (count) => `${count} flux`,
    active: (count) => `${count} activé(s)`,
    failures: (count) => `${count} échec(s) en 24 h`,
  },
  de: {
    ok: 'Verbunden',
    flows: (count) => `${count} Flow(s)`,
    active: (count) => `${count} aktiviert`,
    failures: (count) => `${count} Fehlschlag/Fehlschläge in 24 h`,
  },
  es: {
    ok: 'Conectado',
    flows: (count) => `${count} flujo(s)`,
    active: (count) => `${count} activado(s)`,
    failures: (count) => `${count} fallo(s) en 24 h`,
  },
};

// Errors and results of the scene actions and of the switch (shown in Gladys).
export const ACTION_TEXT = {
  unknownFlow: {
    en: 'This device is not an Activepieces flow.',
    fr: "Cet appareil n'est pas un flux Activepieces.",
    de: 'Dieses Gerät ist kein Activepieces-Flow.',
    es: 'Este dispositivo no es un flujo de Activepieces.',
  },
  readOnly: {
    en: 'Switching flows from Gladys is off: allow it in the configuration.',
    fr: 'Activer un flux depuis Gladys est désactivé : autorisez-le dans la configuration.',
    de: 'Flows aus Gladys schalten ist aus: Erlaube es in der Konfiguration.',
    es: 'Activar flujos desde Gladys está desactivado: permítalo en la configuración.',
  },
  notPublished: {
    en: 'This flow was never published in Activepieces: publish it first.',
    fr: "Ce flux n'a jamais été publié dans Activepieces : publiez-le d'abord.",
    de: 'Dieser Flow wurde in Activepieces nie veröffentlicht: Veröffentliche ihn zuerst.',
    es: 'Este flujo nunca se ha publicado en Activepieces: publíquelo primero.',
  },
  badWebhook: {
    en: 'Choose a flow, or paste the webhook URL of its Catch Webhook trigger.',
    fr: "Choisissez un flux, ou collez l'URL du webhook de son déclencheur Catch Webhook.",
    de: 'Wähle einen Flow oder füge die Webhook-URL seines Auslösers Catch Webhook ein.',
    es: 'Elija un flujo, o pegue la URL del webhook de su disparador Catch Webhook.',
  },
};

// The `sentence` output of "State of a flow".
export const SENTENCE_TEXT = {
  en: {
    lastRun: (time) => `last run ${time}`,
    never: 'never run',
    failures: (count) => `${count} failure(s) in 24 h`,
  },
  fr: {
    lastRun: (time) => `dernière exécution ${time}`,
    never: 'jamais exécuté',
    failures: (count) => `${count} échec(s) en 24 h`,
  },
  de: {
    lastRun: (time) => `letzter Lauf ${time}`,
    never: 'nie ausgeführt',
    failures: (count) => `${count} Fehlschlag/Fehlschläge in 24 h`,
  },
  es: {
    lastRun: (time) => `última ejecución ${time}`,
    never: 'nunca ejecutado',
    failures: (count) => `${count} fallo(s) en 24 h`,
  },
};

export const LANGUAGE_FALLBACK = 'en';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };
const formats = new Map();

/**
 * A date as day/month hours:minutes, in the time zone of Gladys (the
 * supervisor injects TZ): a weekly flow run six days ago is not "today".
 */
export function formatTime(time, language) {
  const locale = LOCALES[language] ?? LOCALES.en;
  if (!formats.has(locale)) {
    formats.set(
      locale,
      new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    );
  }
  return formats.get(locale).format(new Date(time));
}

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
