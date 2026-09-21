/**
 * Configuration pure — parseurs et résolutions sans dépendances externes.
 * Ce module n'importe jamais de packages npm (sauf stdlib Node).
 */
/** Canal Chrome supporté (sous-ensemble de ChromeReleaseChannel) */
export type Channel = 'chrome' | 'canary' | 'dev' | 'beta';
export declare const FORCED_FLAGS: {
    channel: "chrome";
    usageStatistics: boolean;
    performanceCrux: boolean;
    redactNetworkHeaders: boolean;
};
/** Répertoire racine pour les fichiers de données (PVC). Configurable via CDM_DATA_DIR. */
export declare const DATA_DIR: string;
export declare const DEFAULT_PROFILE_DIR: string;
/**
 * Parse et valide un canal Chrome depuis une variable d'environnement.
 * Retourne le canal en minuscules.
 */
export declare function parseChannel(raw: string | undefined): Channel;
/**
 * Lit CDM_ALLOWED_URL_PATTERNS (CSV) et retourne un tableau d'URLPattern.
 */
export declare function parseUrlPatterns(raw: string | undefined): string[] | undefined;
/**
 * Retourne le dossier de profil par défaut.
 * Format: <profileDir>/<channel> (sauf 'chrome' qui est le profil racine).
 */
export declare function resolveProfileDir(profileDir: string | undefined, channel: Channel): string;
/**
 * Retourne les drapeaux forcés par la spécification Atelier.
 */
export declare function getForcedFlags(): Record<string, boolean | string>;
/**
 * Retourne la taille de viewport par défaut.
 */
export declare function getDefaultViewport(): {
    width: number;
    height: number;
};
//# sourceMappingURL=config.d.ts.map