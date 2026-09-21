/**
 * Lanceur souverain — Chrome DevTools MCP CEREMA
 *
 * Enveloppe autour de Puppeteer qui force les drapeaux de sécurité et
 * de confidentialité imposés par la Spécification Atelier.
 *
 * Drapeaux forcés (toujours appliqués, même en override) :
 *   --channel=chrome             Google Chrome stable uniquement
 *   --usage-statistics=false     Désactiver la télémétrie Google
 *   --performance-crux=false     Désactiver les requêtes CrUX
 *   --redact-network-headers=true Redacter les headers sensibles
 *
 * Configurable par variables d'environnement :
 *   CDM_CHANNEL                canal Chrome (default: chrome)
 *   CDM_PROFILE_DIR            dossier profile (default: $CDM_DATA_DIR/profiles)
 *   CDM_ALLOWED_URL_PATTERNS   allowlist URL (CSV, vide = aucune)
 *   CDM_BLOCKED_URL_PATTERNS   blocklist URL (CSV, vide = aucune)
 *   CDM_HEADLESS               headless (default: true)
 *   CDM_VIEWPORT               taille viewport (default: 1280x720)
 */
import type { Browser } from 'puppeteer-core';
import { type Channel } from './config.js';
export interface LaunchOptions {
    /** Canal Chrome (canary, dev, beta, chrome). default: 'chrome' */
    channel?: Channel;
    /** User-data-dir Chrome. default: $CDM_DATA_DIR/profiles/<channel> */
    profileDir?: string;
    /** Headless (default: true) */
    headless?: boolean;
    /** Viewport { width, height }. default: 1280x720 */
    viewport?: {
        width: number;
        height: number;
    };
    /** Allowlist URLPattern (CSV depuis CDM_ALLOWED_URL_PATTERNS) */
    allowedUrlPatterns?: string[];
    /** Blocklist URLPattern (CSV depuis CDM_BLOCKED_URL_PATTERNS) */
    blockedUrlPatterns?: string[];
    /** Arguments Chrome supplémentaires */
    chromeArgs?: string[];
    /** Chemin vers l'exécutable Chrome (si non détecté automatiquement) */
    executablePath?: string;
    /** Accepter les certificats auto-signés */
    acceptInsecureCerts?: boolean;
    /** Proxy serveur */
    proxyServer?: string;
}
/**
 * Lance un navigateur Chrome isolé avec les drapeaux forcés.
 *
 * @param options - Options de configuration (overrides partiels)
 * @returns Le navigateur Puppeteer connecté ou lancé
 */
export declare function launch(options?: LaunchOptions): Promise<Browser>;
/**
 * Ferme un navigateur lancé précédemment.
 */
export declare function closeBrowser(browser: Browser): Promise<void>;
/**
 * Vérifie qu'un exécutable Chrome est disponible dans le PATH.
 * @returns true si Chrome est trouvé, false sinon.
 */
export declare function detectChrome(): boolean;
//# sourceMappingURL=launcher.d.ts.map