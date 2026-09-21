/**
 * Gestionnaire de sessions — Chrome DevTools MCP CEREMA
 *
 * Orchestre le cycle de vie des sessions MCP :
 *   1. Création → nouveau Chrome avec profil isolé sur PVC
 *   2. Durée de vie → expiration automatique (inactivité)
 *   3. Destruction → nettoyage du profil et du processus Chrome
 *
 * Contrôles L3 :
 *   - CDM_MAX_SESSIONS : plafond de sessions simultanées (default: 10)
 *   - CDM_SESSION_TIMEOUT : expiration en ms (default: 30min)
 *   - Profil Chrome isolé par session (userDataDir sur PVC)
 *   - Auto-nettoyage des profils expirés
 */
import type { Browser } from 'puppeteer-core';
import { TokenStore } from './auth.js';
export interface SessionInfo {
    sessionId: string;
    clientId: string;
    profileDir: string;
    browser: Browser;
    createdAt: number;
    lastActivity: number;
}
export interface SessionManagerOptions {
    /** Nombre max de sessions simultanées (default: 10) */
    maxSessions?: number;
    /** Timeout d'inactivité en ms (default: 30min) */
    sessionTimeout?: number;
    /** Store de tokens clients (PVC-backed L3) */
    tokenStore: TokenStore;
    /** Profil de base pour les sessions PVC (default: DATA_DIR/profiles) */
    profileDir?: string;
    /** Allowlist URL (CSV depuis CDM_ALLOWED_URL_PATTERNS) */
    allowedUrlPatterns?: string[];
    /** Blocklist URL (CSV depuis CDM_BLOCKED_URL_PATTERNS) */
    blockedUrlPatterns?: string[];
}
export declare class SessionManager {
    private sessions;
    private readonly maxSessions;
    private readonly sessionTimeout;
    private readonly tokenStore;
    private readonly baseProfileDir;
    private readonly allowedUrlPatterns;
    private readonly blockedUrlPatterns;
    private cleanupTimer;
    constructor(options: SessionManagerOptions);
    /**
     * Crée une nouvelle session avec un Chrome isolé.
     *
     * @param clientId - Identifiant du client (token de session Onyxia)
     * @returns { sessionId, token } ou rejette si max atteint
     *
     * Flux :
     *   1. Vérifier plafond maxSessions
     *   2. Générer un token unique pour le client
     *   3. Créer un dossier profil isolé sur PVC
     *   4. Lancer Chrome avec ce profil
     *   5. Enregistrer la session
     */
    createSession(clientId: string): Promise<{
        sessionId: string;
        token: string;
    }>;
    /**
     * Récupère une session par son ID.
     */
    getSession(sessionId: string): SessionInfo | undefined;
    /**
     * Vérifie si le token correspond à une session active.
     * Retourne le sessionId ou undefined.
     */
    validateToken(token: string): string | undefined;
    /**
     * Retourne le nombre de sessions actives.
     */
    get activeCount(): number;
    /**
     * Retourne le max de sessions configuré.
     */
    get maxCount(): number;
    /**
     * Détruit une session et nettoie ses ressources.
     */
    destroySession(sessionId: string): Promise<void>;
    /**
     * Détruit TOUTES les sessions.
     */
    destroyAllSessions(): Promise<void>;
    /**
     * Nettoie les sessions expirées (inactivité > timeout).
     */
    private cleanupExpiredSessions;
    /**
     * Crée un dossier de profil isolé pour une session.
     * Format: <base>/sessions/<session-id>_<client-id>
     */
    private createProfileDir;
    /**
     * Supprime le dossier de profil d'une session.
     * On ne supprime que le contenu spécifique, pas tout le base dir.
     */
    private cleanupProfile;
    private cleanupBrowser;
    /**
     * Marque une session comme active (mis à jour le timestamp lastActivity).
     */
    markActive(sessionId: string): void;
    /**
     * Arrête le gestionnaire et nettoie tout.
     */
    dispose(): void;
}
export declare class MaxSessionsError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=session.d.ts.map