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
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SessionManager } from './session.js';
/**
 * Enregistre les outils personnalisés L5 sur le McpServer d'une session.
 *
 * @param mcpServer - Serveur MCP de la session courante
 * @param sessionManager - Gestionnaire de sessions
 * @param managedSessionId - ID de session MCP courante
 */
export declare function registerL5Tools(mcpServer: McpServer, sessionManager: SessionManager, managedSessionId: string): void;
//# sourceMappingURL=tools.d.ts.map