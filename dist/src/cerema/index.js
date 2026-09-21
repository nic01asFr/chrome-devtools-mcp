/**
 * Entrée principale — Chrome DevTools MCP CEREMA
 *
 * Remplace le `StdioServerTransport` de l'upstream par le serveur
 * HTTP Express avec transport Streamable MCP.
 *
 * Usage :
 *   npm start          → lance le serveur (scripts.start de package.json)
 *   node dist/cerema/index.js  → exécution directe
 */
import { CeremaServer } from './server.js';
/**
 * Point d'entrée CLI.
 *
 * Variables d'environnement attendues :
 *   CDM_API_KEY               clé maître pour l'authentification (obligatoire)
 *   CDM_PORT                  port d'écoute (default: 3000)
 *   CDM_HOST                  adresse d'écoute (default: 0.0.0.0)
 *   CDM_CHANNEL               canal Chrome (default: chrome)
 *   CDM_PROFILE_DIR           dossier profiles (default: $CDM_DATA_DIR/profiles)
 *   CDM_ALLOWED_URL_PATTERNS  allowlist URL CSV
 *   CDM_BLOCKED_URL_PATTERNS  blocklist URL CSV
 *   CDM_HEADLESS              headless (default: true, mettre "false" pour désactiver)
 *   CDM_MAX_SESSIONS          max sessions simultanées (réserve pour L3)
 *   CDM_SESSION_TIMEOUT       timeout sessions en ms (default: 30min)
 */
async function main() {
    // Vérifier CDM_API_KEY (obligatoire)
    if (!process.env['CDM_API_KEY']) {
        console.error('[cerema] CDM_API_KEY n\'est pas définie');
        console.error('[cerema] Définissez-la avant de lancer le serveur');
        process.exit(1);
    }
    const server = new CeremaServer();
    await server.start();
}
main().catch((err) => {
    console.error('[cerema] Fatal:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map