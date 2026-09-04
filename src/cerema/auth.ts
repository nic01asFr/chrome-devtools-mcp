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

import type { Request, RequestHandler, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Types (définis ici pour éviter circularité avec token-store.ts)
// ---------------------------------------------------------------------------

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

// Re-export persistant stores from token-store module
export { MemoryTokenStore, PvcTokenStore } from './token-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Étendue du token : admin (clé maître) ou client */
export type TokenScope = 'admin' | 'client';

export interface AuthToken {
  scope: TokenScope;
  /** Client ID (undefined pour admin) */
  clientId?: string;
}

// ---------------------------------------------------------------------------
// Implémentation
// ---------------------------------------------------------------------------

function validateMasterKey(key: string): boolean {
  const master = process.env['CDM_API_KEY'];
  if (!master) {
    console.error('[cerema/auth] CDM_API_KEY n\'est pas définie');
    return false;
  }
  return constantTimeEqual(master, key);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function authMiddleware(
  tokenStore: TokenStore,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return next(new UnauthorizedError('header Authorization manquant'));
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next(new UnauthorizedError('format Authorization invalide'));
    }

    const token = parts[1]!;

    // 1. Vérifier clé maître (admin)
    if (validateMasterKey(token)) {
      (req as AuthRequest).auth = { scope: 'admin' };
      return next();
    }

    // 2. Vérifier token client
    const clientToken = tokenStore.get(token);
    if (clientToken) {
      (req as AuthRequest).auth = {
        scope: 'client',
        clientId: clientToken.clientId,
      };
      return next();
    }

    return next(new UnauthorizedError('token invalide ou expiré'));
  };
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

// ---------------------------------------------------------------------------
// Augmentation du type Request
// ---------------------------------------------------------------------------

interface AuthRequest extends Request {
  auth?: AuthToken;
}
