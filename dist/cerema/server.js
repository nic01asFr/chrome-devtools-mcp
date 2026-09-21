/**
 * Serveur HTTP — Chrome DevTools MCP CEREMA
 *
 * Serveur HTTP Express qui expose le transport Streamable MCP sur /mcp,
 * un endpoint de santé sur /health, et un placeholder pour le
 * remote desktop noVNC sur /view.
 *
 * Le cycle de vie des sessions (création de Chrome, isolation profil,
 * expiration, nettoyage) est délégué à SessionManager (lot L3).
 * Ce fichier est focalisé sur le routing HTTP et le transport Streamable.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const express = require('express');
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { closeBrowser } from './launcher.js';
import { authMiddleware, UnauthorizedError } from './auth.js';
import { MemoryTokenStore, PvcTokenStore } from './auth.js';
import { SessionManager, MaxSessionsError } from './session.js';
import { getForcedFlags, DATA_DIR } from './config.js';
import { viewHtml } from './view.js';
import { registerL5Tools } from './tools.js';
/** Utilitaire pour écrire du JSON sur un ServerResponse brut */
function sendJson(res, code, body) {
    if (res.headersSent)
        return;
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
}
// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '0.0.0.0';
// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
function getParsedBody(req) {
    const body = req.body;
    if (typeof body === 'string' && body.length > 0) {
        try {
            return JSON.parse(body);
        }
        catch {
            // JSON malformé — le transport parsera lui-même
        }
    }
    return body;
}
/**
 * Détecte si le PVC est monté et choisit le store de tokens.
 */
function createTokenStore() {
    try {
        if (fs.existsSync(DATA_DIR)) {
            return new PvcTokenStore(`${DATA_DIR}/tokens.json`);
        }
    }
    catch {
        // Ignore
    }
    // Fallback memory (dev mode)
    return new MemoryTokenStore();
}
// ---------------------------------------------------------------------------
// Serveur principal
// ---------------------------------------------------------------------------
export class CeremaServer {
    app;
    httpServer = null;
    tokenStore;
    sessionManager;
    /** Map transportId → transport state */
    transports = new Map();
    /** Timer pour flush périodique du token store PVC */
    flushTimer = null;
    constructor() {
        // Créer le store de tokens (PVC ou mémoire)
        this.tokenStore = createTokenStore();
        // Construire le gestionnaire de sessions
        this.sessionManager = new SessionManager({
            tokenStore: this.tokenStore,
            profileDir: process.env['CDM_PROFILE_DIR'],
            allowedUrlPatterns: process.env['CDM_ALLOWED_URL_PATTERNS']
                ?.split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            blockedUrlPatterns: process.env['CDM_BLOCKED_URL_PATTERNS']
                ?.split(',')
                .map((s) => s.trim())
                .filter(Boolean),
        });
        this.app = this.createExpressApp();
    }
    /**
     * Crée l'app Express avec routes et middlewares.
     */
    createExpressApp() {
        const app = express();
        app.disable('x-powered-by');
        // Parser JSON body — uniquement si Content-Type est explicitement application/json.
        // Cela évite que express.json() ne lève sur les requêtes /mcp sans body JSON valide,
        // et permet à authMiddleware de passer en premier pour renvoyer 401 au lieu de 500.
        app.use((req, _res, next) => {
            const ct = req.headers['content-type'];
            if (ct && ct.includes('application/json')) {
                express.json({ limit: '10mb', strict: false })(req, _res, next);
            }
            else {
                next();
            }
        });
        // Health check — accessible même sans auth
        app.get('/health', (_req, res) => {
            sendJson(res, 200, {
                status: 'ok',
                version: '1.0.0',
                uptime: Math.floor(process.uptime()),
                sessions: this.sessionManager.activeCount,
                maxSessions: this.sessionManager.maxCount,
                forcedFlags: getForcedFlags(),
            });
        });
        // View / remote desktop — noVNC (L4)
        // Authentifié via middleware authMiddleware — on le duplique inline
        // car /view ne nécessite pas de token MCP, juste une clé valide
        app.get('/view', authMiddleware(this.tokenStore), this.handleView.bind(this));
        // MCP endpoint — authentifié.
        // POST : handshake + appels JSON-RPC ; DELETE : fermeture de session ;
        // GET : flux SSE optionnel (messages initiés par le serveur).
        app.post('/mcp', authMiddleware(this.tokenStore), this.handleMcp.bind(this));
        app.delete('/mcp', authMiddleware(this.tokenStore), this.handleMcp.bind(this));
        app.get('/mcp', authMiddleware(this.tokenStore), this.handleMcp.bind(this));
        // Gestionnaire d'erreurs Express
        app.use(this.handleError.bind(this));
        return app;
    }
    // -----------------------------------------------------------------------
    // Démarrage
    // -----------------------------------------------------------------------
    async start() {
        const port = parseInt(process.env['CDM_PORT'] || String(DEFAULT_PORT), 10);
        const host = process.env['CDM_HOST'] || DEFAULT_HOST;
        this.httpServer = this.app.listen(port, host, () => {
            console.log(`[cerema] Serveur MCP CEREMA écoute sur ${host}:${port}`);
            console.log(`[cerema] Sessions max: ${this.sessionManager.maxCount}`);
            console.log(`[cerema] Flags forcés:`, getForcedFlags());
            // Flush périodique du token store PVC
            this.flushTimer = setInterval(() => {
                if ('flushSync' in this.tokenStore) {
                    this.tokenStore.flushSync();
                }
            }, 30_000);
        });
        // Gestion du shutdown propre
        const shutdown = () => {
            console.log('[cerema] Arrêt en cours...');
            this.shutdown().finally(() => process.exit(0));
        };
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }
    // -----------------------------------------------------------------------
    // Handler /mcp — transport Streamable HTTP
    // -----------------------------------------------------------------------
    handleMcp(req, res) {
        // La spec MCP (2025-03-26) et le SDK utilisent le header `mcp-session-id`
        // (pas `x-mcp-session-id`). Accepter les deux pour la compatibilité.
        const sessionId = (req.headers['mcp-session-id'] ?? req.headers['x-mcp-session-id']);
        const method = req.method;
        // ---- Nouvelle session (POST sans session-id) ----
        if (method === 'POST' && !sessionId) {
            void this.handleNewSession(req, res);
            return;
        }
        // ---- Session existante ----
        if (sessionId) {
            const st = this.transports.get(sessionId);
            if (!st) {
                res.writeHead(404).end('Session non trouvée');
                return;
            }
            // Marquer activité via SessionManager
            this.sessionManager.markActive(st.managedSessionId);
            // Déléguer au transport
            st.transport.handleRequest(req, res, getParsedBody(req)).catch((err) => {
                console.error('[cerema] Transport error:', err);
                if (!res.headersSent) {
                    res.writeHead(500).end('Erreur interne');
                }
            });
            return;
        }
        res.writeHead(405).end('Méthode non supportée');
    }
    /**
     * Crée une nouvelle session via SessionManager puis initialise
     * le transport MCP.
     */
    async handleNewSession(req, res) {
        let sessionId = randomUUID();
        let browser;
        let mcpServer;
        let transport;
        let transportKey;
        try {
            const auth = req.auth;
            // L3 : créer la session via SessionManager
            // clientId : token de session Onyxia ou scope admin
            const clientId = auth?.clientId || auth?.scope || randomUUID();
            const { sessionId: managedSessionId } = await this.sessionManager.createSession(clientId);
            // Créer le serveur MCP
            mcpServer = new McpServer({
                name: 'chrome-devtools-mcp-cerema',
                version: '1.0.0',
            });
            // Créer le transport MCP
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => sessionId,
                onsessioninitialized: (sid) => {
                    sessionId = sid;
                },
            });
            // L5 : enregistrer les outils personnalisés AVANT de connecter le transport.
            // Le SDK MCP fige les capabilities au premier handleRequest ; enregistrer
            // des outils après provoque « Cannot register capabilities after connecting ».
            // managedSessionId est capturé par closure pour que le handler accède à
            // l'ID de session au moment de l'exécution (après connection).
            const managedSessionIdForClosure = managedSessionId;
            registerL5Tools(mcpServer, this.sessionManager, managedSessionIdForClosure);
            // Lier le transport au serveur MCP
            await mcpServer.connect(transport);
            // Enregistrer le transport
            transportKey = sessionId;
            this.transports.set(transportKey, {
                managedSessionId,
                browser,
                mcpServer,
                transport,
            });
            // Nettoyage auto à la fermeture du transport :
            // déconnecter aussi la session gérée (ferme Chrome + nettoie le profil).
            // Sans ce lien, chaque session clôturée laisse un Chrome orphelin.
            const tid = transportKey;
            transport.onclose = () => {
                console.log(`[cerema] Session ${managedSessionId} fermée par le client`);
                const entry = this.transports.get(tid);
                if (entry) {
                    this.transports.delete(tid);
                    this.cleanupBrowser(entry.browser);
                }
                this.sessionManager
                    .destroySession(managedSessionId)
                    .catch((err) => console.error('[cerema] Erreur destruction session:', err));
            };
            transport.onerror = (err) => {
                console.error(`[cerema] Erreur session ${managedSessionId}:`, err);
            };
            // Déléguer la requête initiale au transport
            const rawRes = res;
            await transport.handleRequest(req, rawRes, getParsedBody(req));
        }
        catch (err) {
            console.error('[cerema] Erreur création session:', err);
            // Nettoyage en cas d'erreur
            if (browser)
                await this.cleanupBrowser(browser);
            if (mcpServer)
                await mcpServer.close().catch(() => { });
            if (transport)
                await transport.close().catch(() => { });
            if (err instanceof MaxSessionsError) {
                sendJson(res, 429, {
                    error: 'Too Many Sessions',
                    message: err.message,
                });
            }
            else if (!res.headersSent) {
                sendJson(res, 500, {
                    error: 'Erreur interne',
                    message: 'Erreur lors de l\'initialisation de la session',
                });
            }
        }
    }
    // -----------------------------------------------------------------------
    // Handler /view — noVNC
    // -----------------------------------------------------------------------
    handleView(_req, res) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(viewHtml());
    }
    // -----------------------------------------------------------------------
    // Gestion d'erreurs
    // -----------------------------------------------------------------------
    handleError(err, _req, res, _next) {
        if (err instanceof UnauthorizedError) {
            sendJson(res, 401, { error: 'Unauthorized', message: err.message });
            return;
        }
        console.error('[cerema] Erreur non gérée:', err);
        sendJson(res, 500, {
            error: 'Internal Server Error',
            message: 'Une erreur interne est survenue',
        });
    }
    async cleanupBrowser(browser) {
        if (!browser)
            return;
        try {
            await closeBrowser(browser);
        }
        catch (err) {
            console.error('[cerema] Erreur nettoyage navigateur:', err);
        }
    }
    // -----------------------------------------------------------------------
    // Arrêt propre
    // -----------------------------------------------------------------------
    async shutdown() {
        // Flush final du token store PVC
        if ('flushSync' in this.tokenStore) {
            this.tokenStore.flushSync();
        }
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        // Fermer tous les transports
        const entries = Array.from(this.transports.values());
        this.transports.clear();
        await Promise.all(entries.map(async (st) => {
            try {
                await st.transport.close();
            }
            catch { /* ignore */ }
            await this.cleanupBrowser(st.browser);
            if (st.mcpServer) {
                try {
                    await st.mcpServer.close();
                }
                catch { /* ignore */ }
            }
        }));
        // Arrêter le SessionManager
        this.sessionManager.dispose();
        return new Promise((resolve) => {
            if (this.httpServer) {
                this.httpServer.close(() => resolve());
            }
            else {
                resolve();
            }
        });
    }
}
// ---------------------------------------------------------------------------
// Point d'entrée CLI
// ---------------------------------------------------------------------------
async function main() {
    const server = new CeremaServer();
    await server.start();
}
const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain && import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
        console.error('[cerema] Fatal:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=server.js.map