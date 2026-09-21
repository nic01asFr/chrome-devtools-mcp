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
import type { RequestHandler } from 'express';
/** Données associées à un token client */
export interface ClientToken {
    /** Identifiant unique du client */
    clientId: string;
    /** Date de création (epoch ms) */
    createdAt: number;
    /** Date d'expiration (epoch ms, 0 = jamais) */
    expiresAt: number;
}
/** Store de tokens clients */
export interface TokenStore {
    set(token: string, data: ClientToken): void;
    get(token: string): ClientToken | undefined;
    delete(token: string): void;
    clear(): void;
    size(): number;
}
export { MemoryTokenStore, PvcTokenStore } from './token-store.js';
/** Étendue du token : admin (clé maître) ou client */
export type TokenScope = 'admin' | 'client';
export interface AuthToken {
    scope: TokenScope;
    /** Client ID (undefined pour admin) */
    clientId?: string;
}
export declare function authMiddleware(tokenStore: TokenStore): RequestHandler;
export declare class UnauthorizedError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=auth.d.ts.map