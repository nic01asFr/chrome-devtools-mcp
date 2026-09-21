/**
 * Store de tokens persisté — Chrome DevTools MCP CEREMA
 *
 * Implémente TokenStore avec persistance sur PVC ($CDM_DATA_DIR/tokens.json).
 * Les données sont aussi gardées en RAM pour la performance.
 *
 * Mécanisme d'écriture :
 *   1. Écrire vers un fichier temporaire (.tmp)
 *   2. rename() atomique vers le nom final
 *
 * Cela évite de corrompre le fichier si un crash survient pendant l'écriture.
 *
 * Interface commune : MemoryTokenStore + PvcTokenStore
 */
import type { ClientToken } from './auth.js';
export type TokenStore = import('./auth.js').TokenStore;
/**
 * Store de tokens en mémoire (pas de persistance).
 * Utilisé en dev ou quand le PVC n'est pas monté.
 */
export declare class MemoryTokenStore implements TokenStore {
    private tokens;
    set(token: string, data: ClientToken): void;
    get(token: string): ClientToken | undefined;
    delete(token: string): void;
    clear(): void;
    size(): number;
    /** Sérialise le store en JSON string */
    toJSON(): Record<string, ClientToken>;
    /** Déserialize depuis un JSON string */
    static fromJSON(json: string): MemoryTokenStore;
}
/**
 * Store de tokens persisté sur PVC.
 *
 * Maintient un cache RAM + persistance sur disque.
 * Chaque modification RAM est marquée comme dirty et écrite
 * vers le fichier PVC au prochain cycle (ou à la demande).
 */
export declare class PvcTokenStore implements TokenStore {
    /** Path vers le fichier PVC de stockage */
    private readonly filePath;
    /** Cache RAM — aussi utilisé pour la sérialisation */
    private cache;
    /** Indique si des modifications non sauvegardées existent */
    private dirty;
    /** Timer pour écriture périodique */
    private flushTimer;
    /** Intervalle d'écriture automatique (ms) — 30s */
    private static readonly FLUSH_INTERVAL_MS;
    /**
     * @param filePath - Chemin vers le fichier PVC (default: $CDM_DATA_DIR/tokens.json)
     * @param flushInterval - Intervalle de flush automatique
     */
    constructor(filePath?: string, flushInterval?: number);
    /** Dispose du timer de flush */
    dispose(): void;
    set(token: string, data: ClientToken): void;
    get(token: string): ClientToken | undefined;
    delete(token: string): void;
    clear(): void;
    size(): number;
    /** Retourne la liste brute des entrées (utile pour diagnostics) */
    entries(): Array<[string, ClientToken]>;
    /**
     * Charge le store depuis le fichier PVC.
     * En cas d'erreur, retourne un store vide.
     */
    private loadSync;
    /**
     * Écrit le store vers le PVC (sync pour éviter les deadlocks au shutdown).
     */
    flushSync(): void;
}
//# sourceMappingURL=token-store.d.ts.map