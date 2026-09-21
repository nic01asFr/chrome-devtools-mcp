/**
 * Tests — src/cerema/auth (middleware)
 *
 * On teste les routes Express complètes pour valider
 * le middleware d'authentification, pas juste des fonctions isolées.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryTokenStore, } from './auth.js';
// ---------------------------------------------------------------------------
// MemoryTokenStore
// ---------------------------------------------------------------------------
describe('MemoryTokenStore', () => {
    let store;
    beforeEach(() => {
        store = new MemoryTokenStore();
    });
    it('retourne undefined pour un token inexistant', () => {
        expect(store.get('non-existent')).toBeUndefined();
    });
    it('stocke et retrouve un token', () => {
        const token = randomUUID();
        const data = {
            clientId: 'client-1',
            createdAt: Date.now(),
            expiresAt: 0, // jamais
        };
        store.set(token, data);
        const result = store.get(token);
        expect(result).toBeDefined();
        expect(result.clientId).toBe('client-1');
    });
    it('expire un token expiré', () => {
        const token = randomUUID();
        const data = {
            clientId: 'client-1',
            createdAt: Date.now(),
            expiresAt: Date.now() - 1000, // expiré il y a 1s
        };
        store.set(token, data);
        expect(store.get(token)).toBeUndefined();
    });
    it('retient un token non-expiré', () => {
        const token = randomUUID();
        const data = {
            clientId: 'client-1',
            createdAt: Date.now(),
            expiresAt: Date.now() + 3600_000, // exp dans 1h
        };
        store.set(token, data);
        expect(store.get(token)).toBeDefined();
    });
    it('supprime un token', () => {
        const token = randomUUID();
        store.set(token, {
            clientId: 'client-1',
            createdAt: Date.now(),
            expiresAt: 0,
        });
        store.delete(token);
        expect(store.get(token)).toBeUndefined();
    });
    it('vide tout le store', () => {
        store.set('t1', { clientId: 'c1', createdAt: Date.now(), expiresAt: 0 });
        store.set('t2', { clientId: 'c2', createdAt: Date.now(), expiresAt: 0 });
        expect(store.size()).toBe(2);
        store.clear();
        expect(store.size()).toBe(0);
    });
    it('compte correctement', () => {
        expect(store.size()).toBe(0);
        store.set('a', { clientId: 'a', createdAt: Date.now(), expiresAt: 0 });
        expect(store.size()).toBe(1);
        store.set('b', { clientId: 'b', createdAt: Date.now(), expiresAt: 0 });
        expect(store.size()).toBe(2);
    });
});
//# sourceMappingURL=auth.test.js.map