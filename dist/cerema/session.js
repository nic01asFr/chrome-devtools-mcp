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
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { launch, closeBrowser } from './launcher.js';
import { parseChannel, DATA_DIR } from './config.js';
// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const DEFAULT_MAX_SESSIONS = 10;
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30min
// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------
export class SessionManager {
    sessions = new Map();
    maxSessions;
    sessionTimeout;
    tokenStore;
    baseProfileDir;
    allowedUrlPatterns;
    blockedUrlPatterns;
    cleanupTimer = null;
    constructor(options) {
        this.maxSessions = options.maxSessions ?? parseInt(process.env['CDM_MAX_SESSIONS'] || String(DEFAULT_MAX_SESSIONS), 10);
        this.sessionTimeout = options.sessionTimeout ?? parseInt(process.env['CDM_SESSION_TIMEOUT'] || String(DEFAULT_SESSION_TIMEOUT_MS), 10);
        this.tokenStore = options.tokenStore;
        this.baseProfileDir = options.profileDir || `${DATA_DIR}/profiles`;
        this.allowedUrlPatterns = options.allowedUrlPatterns;
        this.blockedUrlPatterns = options.blockedUrlPatterns;
        // Lancer le nettoyage périodique
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpiredSessions();
        }, 60_000); // 1 min
    }
    // -----------------------------------------------------------------------
    // Création de session
    // -----------------------------------------------------------------------
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
    async createSession(clientId) {
        // 1. Vérifier le plafond
        if (this.sessions.size >= this.maxSessions) {
            throw new MaxSessionsError(`Plafond de sessions atteint (${this.maxSessions})`);
        }
        // 2. Générer le token et l'enregistrer
        const token = randomUUID();
        const now = Date.now();
        const clientData = {
            clientId,
            createdAt: now,
            expiresAt: now + this.sessionTimeout,
        };
        this.tokenStore.set(token, clientData);
        // 3. Créer le dossier profil isolé
        const sessionId = randomUUID();
        const profileDir = this.createProfileDir(sessionId, clientId);
        // 4. Lancer Chrome avec ce profil
        const launchOpts = {
            channel: parseChannel(process.env['CDM_CHANNEL']),
            profileDir,
            headless: process.env['CDM_HEADLESS'] !== 'false',
            allowedUrlPatterns: this.allowedUrlPatterns,
            blockedUrlPatterns: this.blockedUrlPatterns,
        };
        const browser = await launch(launchOpts);
        // 5. Enregistrer la session
        const session = {
            sessionId,
            clientId,
            profileDir,
            browser,
            createdAt: now,
            lastActivity: now,
        };
        this.sessions.set(sessionId, session);
        console.log(`[cerema/session] Session ${sessionId} créée (profil: ${profileDir})`);
        return { sessionId, token };
    }
    // -----------------------------------------------------------------------
    // Lookup de session
    // -----------------------------------------------------------------------
    /**
     * Récupère une session par son ID.
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Vérifie si le token correspond à une session active.
     * Retourne le sessionId ou undefined.
     */
    validateToken(token) {
        // Chercher une session active avec ce clientId
        for (const [sid, session] of this.sessions) {
            if (session.clientId === token) {
                return sid;
            }
        }
        return undefined;
    }
    /**
     * Retourne le nombre de sessions actives.
     */
    get activeCount() {
        return this.sessions.size;
    }
    /**
     * Retourne le max de sessions configuré.
     */
    get maxCount() {
        return this.maxSessions;
    }
    // -----------------------------------------------------------------------
    // Destruction de session
    // -----------------------------------------------------------------------
    /**
     * Détruit une session et nettoie ses ressources.
     */
    async destroySession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        console.log(`[cerema/session] Détruit session ${sessionId}`);
        // Nettoyer le navigateur
        await this.cleanupBrowser(session.browser);
        // Nettoyer le profil sur le filesystem
        this.cleanupProfile(session.profileDir);
        // Supprimer l'entrée
        this.sessions.delete(sessionId);
    }
    /**
     * Détruit TOUTES les sessions.
     */
    async destroyAllSessions() {
        const sessions = Array.from(this.sessions.values());
        this.sessions.clear();
        await Promise.all(sessions.map((s) => this.destroySession(s.sessionId)));
    }
    // -----------------------------------------------------------------------
    // Nettoyage automatique
    // -----------------------------------------------------------------------
    /**
     * Nettoie les sessions expirées (inactivité > timeout).
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        const expired = [];
        for (const [id, session] of this.sessions) {
            if (now - session.lastActivity > this.sessionTimeout) {
                expired.push(id);
            }
        }
        for (const id of expired) {
            console.log(`[cerema/session] Session ${id} expirée (inactivité)`);
            this.destroySession(id).catch((err) => {
                console.error(`[cerema/session] Erreur destruction ${id}:`, err);
            });
        }
    }
    // -----------------------------------------------------------------------
    // Utilitaires de fichiers
    // -----------------------------------------------------------------------
    /**
     * Crée un dossier de profil isolé pour une session.
     * Format: <base>/sessions/<session-id>_<client-id>
     */
    createProfileDir(sessionId, clientId) {
        // Formater un nom court pour le client (ex: premier 8 chars du token Onyxia)
        const clientShort = clientId.slice(0, 8);
        const dirName = `sessions/${sessionId.slice(0, 8)}_${clientShort}`;
        const dirPath = path.join(this.baseProfileDir, dirName);
        try {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        catch (err) {
            console.error(`[cerema/session] Erreur création profil ${dirPath}:`, err);
        }
        return dirPath;
    }
    /**
     * Supprime le dossier de profil d'une session.
     * On ne supprime que le contenu spécifique, pas tout le base dir.
     */
    cleanupProfile(profileDir) {
        try {
            if (fs.existsSync(profileDir)) {
                fs.rmSync(profileDir, { recursive: true, force: true });
                console.log(`[cerema/session] Profil nettoyé: ${profileDir}`);
            }
        }
        catch (err) {
            console.error(`[cerema/session] Erreur nettoyage profil ${profileDir}:`, err);
        }
    }
    async cleanupBrowser(browser) {
        if (!browser || !browser.connected)
            return;
        try {
            await closeBrowser(browser);
        }
        catch (err) {
            console.error('[cerema/session] Erreur fermeture navigateur:', err);
        }
    }
    // -----------------------------------------------------------------------
    // Marquage d'activité
    // -----------------------------------------------------------------------
    /**
     * Marque une session comme active (mis à jour le timestamp lastActivity).
     */
    markActive(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActivity = Date.now();
        }
    }
    // -----------------------------------------------------------------------
    // Arrêt propre
    // -----------------------------------------------------------------------
    /**
     * Arrête le gestionnaire et nettoie tout.
     */
    dispose() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.destroyAllSessions().catch(() => { });
    }
}
// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------
export class MaxSessionsError extends Error {
    constructor(message) {
        super(message);
        this.name = 'MaxSessionsError';
    }
}
//# sourceMappingURL=session.js.map