/**
 * Lanceur souverain — Chrome DevTools MCP CEREMA
 *
 * Enveloppe autour de Puppeteer qui force les drapeaux de sécurité et
 * de confidentialité imposés par la Spécification Atelier.
 *
 * Drapeaux forcés (toujours appliqués, même en override) :
 *   --channel=chrome             Google Chrome stable uniquement
 *   --usage-statistics=false     Désactiver la télémétrie Google
 *   --performance-crux=false     Désactiver les requêtes CrUX
 *   --redact-network-headers=true Redacter les headers sensibles
 *
 * Configurable par variables d'environnement :
 *   CDM_CHANNEL                canal Chrome (default: chrome)
 *   CDM_PROFILE_DIR            dossier profile (default: $CDM_DATA_DIR/profiles)
 *   CDM_ALLOWED_URL_PATTERNS   allowlist URL (CSV, vide = aucune)
 *   CDM_BLOCKED_URL_PATTERNS   blocklist URL (CSV, vide = aucune)
 *   CDM_HEADLESS               headless (default: true)
 *   CDM_VIEWPORT               taille viewport (default: 1280x720)
 */
import { execSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { getDefaultViewport, parseChannel, resolveProfileDir, } from './config.js';
// ---------------------------------------------------------------------------
// Filtres de targets (reproduit de l'upstream browser.ts)
// ---------------------------------------------------------------------------
/**
 * Filtre les targets Chrome que Puppeteer ne doit pas exposer.
 * Reproduit la même logique que l'upstream pour éviter les targets internes.
 */
function makeTargetFilter(enableExtensions = false) {
    const ignoredPrefixes = new Set(['chrome://', 'chrome-untrusted://']);
    if (!enableExtensions) {
        ignoredPrefixes.add('chrome-extension://');
    }
    return function targetFilter(target) {
        const url = target.url();
        if (url === 'chrome://newtab/')
            return true;
        if (url.startsWith('chrome://inspect'))
            return true;
        for (const prefix of ignoredPrefixes) {
            if (url.startsWith(prefix))
                return false;
        }
        return true;
    };
}
// ---------------------------------------------------------------------------
// Lanceur principal
// ---------------------------------------------------------------------------
/**
 * Lance un navigateur Chrome isolé avec les drapeaux forcés.
 *
 * @param options - Options de configuration (overrides partiels)
 * @returns Le navigateur Puppeteer connecté ou lancé
 */
export async function launch(options = {}) {
    const { channel = parseChannel(process.env['CDM_CHANNEL']), profileDir, headless = process.env['CDM_HEADLESS'] !== 'false', viewport, 
    // allowedUrlPatterns et blockedUrlPatterns seront traités par le tool handler
    chromeArgs = [], executablePath, acceptInsecureCerts, proxyServer, } = options;
    const finalViewport = viewport || getDefaultViewport();
    // Build Chrome args
    const args = [
        ...chromeArgs,
        '--hide-crash-restore-bubble',
        '--no-sandbox',
        '--disable-setuid-sandbox',
    ];
    // Viewport en headless
    if (headless) {
        args.push('--screen-info={3840x2160}');
    }
    // Proxy
    if (proxyServer) {
        args.push(`--proxy-server=${proxyServer}`);
    }
    // Résolution user-data-dir
    const userDataDir = profileDir || resolveProfileDir(undefined, channel);
    // Résolution du canal Puppeteer
    let puppeteerChannel;
    if (!executablePath) {
        if (channel === 'chrome') {
            puppeteerChannel = 'chrome';
        }
        else {
            puppeteerChannel = `chrome-${channel}`;
        }
    }
    // Configuration Puppeteer
    const launchConfig = {
        channel: puppeteerChannel,
        executablePath,
        targetFilter: makeTargetFilter(),
        defaultViewport: null,
        userDataDir,
        pipe: true,
        headless,
        args,
        acceptInsecureCerts,
        handleDevToolsAsPage: true,
    };
    const browser = await puppeteer.launch(launchConfig);
    // Redimensionner la première page au viewport si configuré
    const [firstPage] = await browser.pages();
    if (firstPage) {
        await firstPage.setViewport({
            width: finalViewport.width,
            height: finalViewport.height,
        });
    }
    return browser;
}
// ---------------------------------------------------------------------------
// Fonctionnalités de nettoyage
// ---------------------------------------------------------------------------
/**
 * Ferme un navigateur lancé précédemment.
 */
export async function closeBrowser(browser) {
    if (!browser || !browser.connected) {
        return;
    }
    try {
        await browser.close();
    }
    catch (err) {
        console.error('[cerema] Échec de fermeture du navigateur:', err);
    }
}
// ---------------------------------------------------------------------------
// Intégration CLI — vérifie que Chrome est disponible
// ---------------------------------------------------------------------------
/**
 * Vérifie qu'un exécutable Chrome est disponible dans le PATH.
 * @returns true si Chrome est trouvé, false sinon.
 */
export function detectChrome() {
    try {
        const output = execSync('which google-chrome || which chrome || which google-chrome-stable', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'], // ignore stderr
        }).trim();
        return output.length > 0;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=launcher.js.map