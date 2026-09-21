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
export declare class CeremaServer {
    private app;
    private httpServer;
    private tokenStore;
    private sessionManager;
    /** Map transportId → transport state */
    private transports;
    /** Timer pour flush périodique du token store PVC */
    private flushTimer;
    constructor();
    /**
     * Crée l'app Express avec routes et middlewares.
     */
    private createExpressApp;
    start(): Promise<void>;
    private handleMcp;
    /**
     * Crée une nouvelle session via SessionManager puis initialise
     * le transport MCP.
     */
    private handleNewSession;
    private handleView;
    private handleError;
    private cleanupBrowser;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map