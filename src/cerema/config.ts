/**
 * Configuration pure — parseurs et résolutions sans dépendances externes.
 * Ce module n'importe jamais de packages npm (sauf stdlib Node).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Canal Chrome supporté (sous-ensemble de ChromeReleaseChannel) */
export type Channel = 'chrome' | 'canary' | 'dev' | 'beta';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const FORCED_FLAGS = {
  channel: 'chrome' as const,
  usageStatistics: false,
  performanceCrux: false,
  redactNetworkHeaders: true,
};

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
/** Répertoire racine pour les fichiers de données (PVC). Configurable via CDM_DATA_DIR. */
export const DATA_DIR = process.env['CDM_DATA_DIR'] ?? '/home/onyxia/work/cerema';
export const DEFAULT_PROFILE_DIR = `${DATA_DIR}/profiles`;

// ---------------------------------------------------------------------------
// Parseurs
// ---------------------------------------------------------------------------

/**
 * Parse et valide un canal Chrome depuis une variable d'environnement.
 * Retourne le canal en minuscules.
 */
export function parseChannel(raw: string | undefined): Channel {
  if (!raw) return 'chrome';
  const lower = raw.toLowerCase().trim();
  const valid: Channel[] = ['chrome', 'canary', 'dev', 'beta'];
  if (!valid.includes(lower as Channel)) {
    throw new Error(
      `CDM_CHANNEL invalide: "${raw}". Valeurs acceptées: chrome, canary, dev, beta.`,
    );
  }
  return lower as Channel;
}

/**
 * Lit CDM_ALLOWED_URL_PATTERNS (CSV) et retourne un tableau d'URLPattern.
 */
export function parseUrlPatterns(
  raw: string | undefined,
): string[] | undefined {
  if (!raw || raw.trim() === '') return undefined;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Retourne le dossier de profil par défaut.
 * Format: <profileDir>/<channel> (sauf 'chrome' qui est le profil racine).
 */
export function resolveProfileDir(
  profileDir: string | undefined,
  channel: Channel,
): string {
  const base = profileDir || DEFAULT_PROFILE_DIR;
  if (channel === 'chrome') return base;
  return `${base}/chrome-profile-${channel}`;
}

// ---------------------------------------------------------------------------
// Introspection
// ---------------------------------------------------------------------------

/**
 * Retourne les drapeaux forcés par la spécification Atelier.
 */
export function getForcedFlags(): Record<string, boolean | string> {
  return {
    channel: FORCED_FLAGS.channel,
    'usage-statistics': FORCED_FLAGS.usageStatistics,
    'performance-crux': FORCED_FLAGS.performanceCrux,
    'redact-network-headers': FORCED_FLAGS.redactNetworkHeaders,
  };
}

/**
 * Retourne la taille de viewport par défaut.
 */
export function getDefaultViewport(): { width: number; height: number } {
  return { ...DEFAULT_VIEWPORT };
}
