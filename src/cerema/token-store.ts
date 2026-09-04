/**
 * Store de tokens persisté — Chrome DevTools MCP CEREMA
 *
 * Implémente TokenStore avec persistance sur PVC (/data/tokens.json).
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

import type { ClientToken } from './auth.js';

// Re-export TokenStore for consumers
export type TokenStore = import('./auth.js').TokenStore;

// ---------------------------------------------------------------------------
// Utilitaires de persistance
// ---------------------------------------------------------------------------

/**
 * Écrit un JSON de façon atomique sur le filesystem.
 * Write to temp → rename atomique.
 */
async function writeAtomic(
  filePath: string,
  data: string,
): Promise<void> {
  const dir = path.dirname(filePath);
  // S'assurer que le dossier existe
  await fs.promises.mkdir(dir, { recursive: true });

  const tmpPath = filePath + '.tmp.' + randomUUID();

  try {
    await fs.promises.writeFile(tmpPath, data, 'utf-8');
    await fs.promises.rename(tmpPath, filePath);
  } catch (err) {
    // Nettoyer le fichier temporaire en cas d'erreur
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
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
export class MemoryTokenStore implements TokenStore {
  private tokens = new Map<string, ClientToken>();

  set(token: string, data: ClientToken): void {
    this.tokens.set(token, data);
  }

  get(token: string): ClientToken | undefined {
    const entry = this.tokens.get(token);
    if (!entry) return undefined;
    // Vérifier expiration
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.tokens.delete(token);
      return undefined;
    }
    return entry;
  }

  delete(token: string): void {
    this.tokens.delete(token);
  }

  clear(): void {
    this.tokens.clear();
  }

  size(): number {
    return this.tokens.size;
  }

  /** Sérialise le store en JSON string */
  toJSON(): Record<string, ClientToken> {
    const obj: Record<string, ClientToken> = {};
    for (const [key, data] of this.tokens) {
      obj[key] = data;
    }
    return obj;
  }

  /** Déserialize depuis un JSON string */
  static fromJSON(json: string): MemoryTokenStore {
    const store = new MemoryTokenStore();
    try {
      const obj = JSON.parse(json) as Record<string, ClientToken>;
      for (const [token, data] of Object.entries(obj)) {
        if (data.clientId && typeof data.createdAt === 'number' && typeof data.expiresAt === 'number') {
          store.set(token, data);
        }
      }
    } catch {
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
export class PvcTokenStore implements TokenStore {
  /** Path vers le fichier PVC de stockage */
  private readonly filePath: string;
  /** Cache RAM — aussi utilisé pour la sérialisation */
  private cache = new MemoryTokenStore();
  /** Indique si des modifications non sauvegardées existent */
  private dirty = false;
  /** Timer pour écriture périodique */
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  /** Intervalle d'écriture automatique (ms) — 30s */
  private static readonly FLUSH_INTERVAL_MS = 30_000;

  /**
   * @param filePath - Chemin vers le fichier PVC (default: /data/tokens.json)
   * @param flushInterval - Intervalle de flush automatique
   */
  constructor(
    filePath: string = '/data/tokens.json',
    flushInterval: number = PvcTokenStore.FLUSH_INTERVAL_MS,
  ) {
    this.filePath = filePath;
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
  dispose(): void {
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

  set(token: string, data: ClientToken): void {
    this.cache.set(token, data);
    this.dirty = true;
  }

  get(token: string): ClientToken | undefined {
    return this.cache.get(token);
  }

  delete(token: string): void {
    this.cache.delete(token);
    this.dirty = true;
  }

  clear(): void {
    this.cache.clear();
    this.dirty = true;
  }

  size(): number {
    return this.cache.size();
  }

  /** Retourne la liste brute des entrées (utile pour diagnostics) */
  entries(): Array<[string, ClientToken]> {
    return Array.from(Object.entries(this.cache.toJSON()));
  }

  // --- Persistance ---

  /**
   * Charge le store depuis le fichier PVC.
   * En cas d'erreur, retourne un store vide.
   */
  private loadSync(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.cache = MemoryTokenStore.fromJSON(raw);
        console.log(`[cerema/pvc] Store chargé depuis ${this.filePath} (${this.cache.size()} tokens)`);
      }
    } catch (err) {
      console.error(`[cerema/pvc] Erreur chargement store:`, err);
    }
  }

  /**
   * Écrit le store vers le PVC (sync pour éviter les deadlocks au shutdown).
   */
  flushSync(): void {
    if (!this.dirty) return;
    try {
      const json = JSON.stringify(this.cache.toJSON(), null, 2);
      writeAtomic(this.filePath, json).catch((err) => {
        console.error('[cerema/pvc] Erreur écriture PVC:', err);
      });
      this.dirty = false;
    } catch (err) {
      console.error('[cerema/pvc] Erreur écriture PVC:', err);
    }
  }
}
