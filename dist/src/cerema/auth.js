/**
 * Middleware d'authentification — API key maître
 *
 * Le serveur vérifie, à chaque requête /mcp, la présence du header
 * Authorization: Bearer <clé>. La clé maître est lue depuis
 * CDM_API_KEY (variable d'environnement fournie par Onyxia).
 *
 * Les tokens par-client (générés dynamiquement) sont stockés dans
 * le TokenStore (en mémoire ou PVC selon la configuration L3).
 */
// Re-export persistant stores from token-store module
export { MemoryTokenStore, PvcTokenStore } from './token-store.js';
// ---------------------------------------------------------------------------
// Implémentation
// ---------------------------------------------------------------------------
function validateMasterKey(key) {
    const master = process.env['CDM_API_KEY'];
    if (!master) {
        console.error('[cerema/auth] CDM_API_KEY n\'est pas définie');
        return false;
    }
    return constantTimeEqual(master, key);
}
function constantTimeEqual(a, b) {
    if (a.length !== b.length)
        return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}
export function authMiddleware(tokenStore) {
    return (req, _res, next) => {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return next(new UnauthorizedError('header Authorization manquant'));
        }
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return next(new UnauthorizedError('format Authorization invalide'));
        }
        const token = parts[1];
        // 1. Vérifier clé maître (admin)
        if (validateMasterKey(token)) {
            req.auth = { scope: 'admin' };
            return next();
        }
        // 2. Vérifier token client
        const clientToken = tokenStore.get(token);
        if (clientToken) {
            req.auth = {
                scope: 'client',
                clientId: clientToken.clientId,
            };
            return next();
        }
        return next(new UnauthorizedError('token invalide ou expiré'));
    };
}
export class UnauthorizedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnauthorizedError';
    }
}
//# sourceMappingURL=auth.js.map