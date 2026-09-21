/**
 * Outils personnalisés MCP — Chrome DevTools MCP CEREMA (L5)
 *
 * Deux outils enregistrés sur le McpServer de chaque session :
 *
 * **raise_window()** — met la fenêtre Chrome de la session au premier plan
 * dans le bureau virtuel Xvfb via xdotool. Utile pour savoir quel agent
 * on regarde lorsque plusieurs sessions coexistent.
 *
 * **request_human(raison, timeout_s)** — signale qu'une intervention humaine
 * est nécessaire (MFA, CAPTCHA, login). L'outil :
 *   1. met la fenêtre au premier plan (xdotool) ;
 *   2. crée un fichier d'état dans $CDM_DATA_DIR/human_requests/<sessionId>.json ;
 *   3. attend que l'humain supprime le fichier ou que le timeout expire ;
 *   4. retourne « resumed » ou « timeout ».
 *
 * Le fichier d'état est supprimé automatiquement après retour de l'outil.
 * Les cookies acquis pendant l'intervention restent dans le profil.
 *
 * Dépendances : xdotool (installé dans le Dockerfile), fs, child_process.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DATA_DIR } from './config.js';
// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const HUMAN_REQUESTS_DIR = `${DATA_DIR}/human_requests`;
const DEFAULT_TIMEOUT_S = 300; // 5 minutes
// ---------------------------------------------------------------------------
// Utilitaires d'état humain
// ---------------------------------------------------------------------------
/** Chemin vers le fichier d'état pour une session. */
function humanRequestPath(sessionId) {
    return path.join(HUMAN_REQUESTS_DIR, `${sessionId}.json`);
}
// ---------------------------------------------------------------------------
// raise_window — utilise xdotool pour mettre la fenêtre Chrome au premier plan
// ---------------------------------------------------------------------------
/**
 * Cherche une fenêtre xdotool correspondante au PID Chrome de la session.
 * Retourne l'ID de fenêtre ou undefined.
 */
function findChromeWindowPid(sessionManager, managedSessionId) {
    const session = sessionManager.getSession(managedSessionId);
    if (!session)
        return undefined;
    const chromeProcess = session.browser.process();
    if (!chromeProcess?.pid)
        return undefined;
    // Essayer de trouver une fenêtre liée au PID Chrome
    try {
        const output = execSync(`xdotool search --onlyvisible --pid ${chromeProcess.pid}`, { encoding: 'utf-8', timeout: 5000 });
        const windows = output.trim().split('\n').filter(Boolean);
        return windows[0];
    }
    catch {
        // Fallback : chercher par nom/class Chrome
        try {
            const output = execSync('xdotool search --onlyvisible --name "Chrome" --class "chrome"', { encoding: 'utf-8', timeout: 5000 });
            const windows = output.trim().split('\n').filter(Boolean);
            return windows[0];
        }
        catch {
            return undefined;
        }
    }
}
/**
 * Soulève la fenêtre Chrome de la session.
 *
 * @param sessionManager - Gestionnaire de sessions pour lookup du browser
 * @param managedSessionId - ID de session courante (capturé par closure)
 * @returns true si une fenêtre a été activée (ou tentative faite)
 */
function raiseWindow(sessionManager, managedSessionId) {
    const windowId = findChromeWindowPid(sessionManager, managedSessionId);
    if (windowId) {
        try {
            execSync(`xdotool windowactivate --sync "${windowId}"`, {
                encoding: 'utf-8',
                timeout: 10000,
            });
            console.log(`[cerema/tools] Fenêtre ${windowId} activée pour session ${managedSessionId}`);
            return { windows: [windowId], raised: true };
        }
        catch {
            console.error(`[cerema/tools] Échec activation fenêtre pour session ${managedSessionId}`);
        }
    }
    // Fallback : essayer de trouver n'importe quelle fenêtre Chrome
    try {
        execSync('xdotool search --name "Chrome" windowactivate --sync', {
            encoding: 'utf-8',
            timeout: 10000,
        });
        console.log(`[cerema/tools] Fenêtre Chrome activée (fallback) pour session ${managedSessionId}`);
        return { windows: [], raised: true };
    }
    catch {
        console.log(`[cerema/tools] Aucune fenêtre Chrome trouvée pour session ${managedSessionId}`);
        return { windows: [], raised: false };
    }
}
// ---------------------------------------------------------------------------
// request_human — demande d'intervention humaine
// ---------------------------------------------------------------------------
/**
 * Demande d'intervention humaine avec timeout.
 *
 * 1. Soulève la fenêtre
 * 2. Crée un fichier d'état $CDM_DATA_DIR/human_requests/<sessionId>.json
 * 3. Polling sur le fichier : détecte intervention humaine (fichier supprimé)
 *    ou expiration du timeout
 * 4. Supprime le fichier d'état
 *
 * @param sessionManager - Gestionnaire de sessions
 * @param managedSessionId - ID de session courante
 * @param raison - Raison de la demande (CAPTCHA, MFA, login...)
 * @param timeout_s - Timeout en secondes (default 300, max 3600)
 */
async function requestHuman(sessionManager, managedSessionId, raison, timeout_s) {
    const timeoutMs = timeout_s * 1000;
    // 1. Mettre la fenêtre au premier plan
    raiseWindow(sessionManager, managedSessionId);
    // 2. Créer le fichier d'état
    fs.mkdirSync(HUMAN_REQUESTS_DIR, { recursive: true });
    const stateFile = humanRequestPath(managedSessionId);
    fs.writeFileSync(stateFile, JSON.stringify({
        sessionId: managedSessionId,
        raison,
        createdAt: new Date().toISOString(),
    }), { mode: 0o644 });
    console.log(`[cerema/tools] Demande humaine créée pour session ${managedSessionId} (${raison})`);
    // 3. Polling : attendre suppression du fichier (intervention humaine)
    //    ou expiration du timeout. Le timer est nettoyé dès que le fichier
    //    disparaît, pour ne pas bloquer au-delà.
    let status = 'timeout';
    const startTime = Date.now();
    const timerId = setTimeout(() => {
        // Timeout atteint : on s'assure que le fichier est supprimé
        try {
            fs.unlinkSync(stateFile);
        }
        catch { /* ignore */ }
    }, timeoutMs);
    while (Date.now() - startTime < timeoutMs) {
        if (!fs.existsSync(stateFile)) {
            status = 'resumed';
            clearTimeout(timerId);
            break;
        }
        // Polling toutes les 500ms
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    // 4. Supprimer le fichier d'état
    removeHumanState(managedSessionId);
    return { status, raison, timeout_s };
}
/** Supprime le fichier d'état d'une session. */
function removeHumanState(sessionId) {
    try {
        fs.unlinkSync(humanRequestPath(sessionId));
        console.log(`[cerema/tools] Demande humaine clôturée pour session ${sessionId}`);
    }
    catch {
        // Ignore : peut ne pas exister (nettoyé par le timer)
    }
}
// ---------------------------------------------------------------------------
// Registration — attache les outils sur le McpServer
// ---------------------------------------------------------------------------
/**
 * Enregistre les outils personnalisés L5 sur le McpServer d'une session.
 *
 * @param mcpServer - Serveur MCP de la session courante
 * @param sessionManager - Gestionnaire de sessions
 * @param managedSessionId - ID de session MCP courante
 */
export function registerL5Tools(mcpServer, sessionManager, managedSessionId) {
    // ------------------------------------------------------------------
    // raise_window — met la fenêtre Chrome au premier plan
    // ------------------------------------------------------------------
    mcpServer.tool('raise_window', 'Met la fenêtre de la session appelante au premier plan dans le bureau distant. '
        + 'Utile pour savoir quelle session est active quand on regarde le bureau partagé.', () => {
        const result = raiseWindow(sessionManager, managedSessionId);
        if (result.raised) {
            return {
                content: [{
                        type: 'text',
                        text: `Fenêtre activée — session ${managedSessionId.slice(0, 8)}`,
                    }],
            };
        }
        return {
            content: [{
                    type: 'text',
                    text: `Aucune fenêtre Chrome trouvée pour la session ${managedSessionId.slice(0, 8)}. `
                        + 'Vérifiez que Chrome est en cours d\'exécution.',
                }],
        };
    });
    // ------------------------------------------------------------------
    // request_human — demande d'intervention humaine
    // ------------------------------------------------------------------
    mcpServer.registerTool('request_human', {
        title: 'request_human',
        description: 'Signale qu\'une intervention humaine est nécessaire sur cette session. '
            + 'L\'outil met la fenêtre au premier plan, crée un signal visible via '
            + '$CDM_DATA_DIR/human_requests/<sessionId>.json, et attend que l\'humain '
            + 'intervienne ou que le timeout expire (par défaut 300 s). '
            + 'Les cookies acquis pendant l\'intervention persistent dans le profil.',
        inputSchema: {
            raison: z.string().describe('Raison de la demande (CAPTCHA, MFA, login…)'),
            timeout_s: z.number().int().min(1).max(3600).describe('Timeout en secondes (max 3600)'),
        },
    }, async ({ raison, timeout_s }) => {
        const resolvedTimeout = timeout_s ?? DEFAULT_TIMEOUT_S;
        const resolvedRaison = raison ?? 'MFA';
        const result = await requestHuman(sessionManager, managedSessionId, resolvedRaison, Math.min(resolvedTimeout, 3600));
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        status: result.status,
                        raison: result.raison,
                        timeout_s: result.timeout_s,
                    }),
                }],
        };
    });
}
//# sourceMappingURL=tools.js.map