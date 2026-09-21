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
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './config.js';
// ---------------------------------------------------------------------------
// Utilitaires de persistance
// ---------------------------------------------------------------------------
/**
 * Écrit un JSON de façon atomique sur le filesystem.
 * Write to temp → rename atomique.
 */
async function writeAtomic(filePath, data) {
    const dir = path.dirname(filePath);
    // S'assurer que le dossier existe
    await fs.promises.mkdir(dir, { recursive: true });
    const tmpPath = filePath + '.tmp.' + randomUUID();
    try {
        await fs.promises.writeFile(tmpPath, data, 'utf-8');
        await fs.promises.rename(tmpPath, filePath);
    }
    catch (err) {
        // Nettoyer le fichier temporaire en cas d'erreur
        try {
            await fs.promises.unlink(tmpPath);
        }
        catch {
            // Ignore cleanup error
        }
        throw err;
    }
}
// ---------------------------------------------------------------------------
// Store en mémoire (L2, sans persistance)
// ---------------------------------------------------------------------------
/**
 * Store de tokens en mémoire (pas de persistance).
 * Utilisé en dev ou quand le PVC n'est pas monté.
 */
export class MemoryTokenStore {
    tokens = new Map();
    set(token, data) {
        this.tokens.set(token, data);
    }
    get(token) {
        const entry = this.tokens.get(token);
        if (!entry)
            return undefined;
        // Vérifier expiration
        if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
            this.tokens.delete(token);
            return undefined;
        }
        return entry;
    }
    delete(token) {
        this.tokens.delete(token);
    }
    clear() {
        this.tokens.clear();
    }
    size() {
        return this.tokens.size;
    }
    /** Sérialise le store en JSON string */
    toJSON() {
        const obj = {};
        for (const [key, data] of this.tokens) {
            obj[key] = data;
        }
        return obj;
    }
    /** Déserialize depuis un JSON string */
    static fromJSON(json) {
        const store = new MemoryTokenStore();
        try {
            const obj = JSON.parse(json);
            for (const [token, data] of Object.entries(obj)) {
                if (data.clientId && typeof data.createdAt === 'number' && typeof data.expiresAt === 'number') {
                    store.set(token, data);
                }
            }
        }
        catch {
            // JSON corrompu, ignore
        }
        return store;
    }
}
// ---------------------------------------------------------------------------
// Store persisté sur PVC (L3)
// ---------------------------------------------------------------------------
/**
 * Store de tokens persisté sur PVC.
 *
 * Maintient un cache RAM + persistance sur disque.
 * Chaque modification RAM est marquée comme dirty et écrite
 * vers le fichier PVC au prochain cycle (ou à la demande).
 */
export class PvcTokenStore {
    /** Path vers le fichier PVC de stockage */
    filePath;
    /** Cache RAM — aussi utilisé pour la sérialisation */
    cache = new MemoryTokenStore();
    /** Indique si des modifications non sauvegardées existent */
    dirty = false;
    /** Timer pour écriture périodique */
    flushTimer = null;
    /** Intervalle d'écriture automatique (ms) — 30s */
    static FLUSH_INTERVAL_MS = 30_000;
    /**
     * @param filePath - Chemin vers le fichier PVC (default: $CDM_DATA_DIR/tokens.json)
     * @param flushInterval - Intervalle de flush automatique
     */
    constructor(filePath = '', flushInterval = PvcTokenStore.FLUSH_INTERVAL_MS) {
        this.filePath = filePath || `${DATA_DIR}/tokens.json`;
        // Charger depuis le PVC au démarrage
        this.loadSync();
        // Lancer le flush périodique
        this.flushTimer = setInterval(() => {
            if (this.dirty) {
                this.flushSync();
            }
        }, flushInterval);
    }
    /** Dispose du timer de flush */
    dispose() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        // Flush final
        if (this.dirty) {
            this.flushSync();
        }
    }
    // --- TokenStore interface ---
    set(token, data) {
        this.cache.set(token, data);
        this.dirty = true;
    }
    get(token) {
        return this.cache.get(token);
    }
    delete(token) {
        this.cache.delete(token);
        this.dirty = true;
    }
    clear() {
        this.cache.clear();
        this.dirty = true;
    }
    size() {
        return this.cache.size();
    }
    /** Retourne la liste brute des entrées (utile pour diagnostics) */
    entries() {
        return Array.from(Object.entries(this.cache.toJSON()));
    }
    // --- Persistance ---
    /**
     * Charge le store depuis le fichier PVC.
     * En cas d'erreur, retourne un store vide.
     */
    loadSync() {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                this.cache = MemoryTokenStore.fromJSON(raw);
                console.log(`[cerema/pvc] Store chargé depuis ${this.filePath} (${this.cache.size()} tokens)`);
            }
        }
        catch (err) {
            console.error(`[cerema/pvc] Erreur chargement store:`, err);
        }
    }
    /**
     * Écrit le store vers le PVC (sync pour éviter les deadlocks au shutdown).
     */
    flushSync() {
        if (!this.dirty)
            return;
        try {
            const json = JSON.stringify(this.cache.toJSON(), null, 2);
            writeAtomic(this.filePath, json).catch((err) => {
                console.error('[cerema/pvc] Erreur écriture PVC:', err);
            });
            this.dirty = false;
        }
        catch (err) {
            console.error('[cerema/pvc] Erreur écriture PVC:', err);
        }
    }
}
//# sourceMappingURL=token-store.js.map