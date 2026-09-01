# Reconnaissance amont — upstream `chrome-devtools-mcp`

> **Source** : `ChromeDevTools/chrome-devtools-mcp` v1.8.0
> **Licence** : Apache-2.0
> **Commit** : clone du HEAD au moment du L0
> **SDK** : `@modelcontextprotocol/sdk` 1.30.0
> **Runtime** : Node.js ^20.19.0 || ^22.12.0 || >=23

---

## Q1 — Structure exacte du répertoire `src/` et rôles des fichiers

```
src/
├── bin/                          # Entry points CLI
│   ├── chrome-devtools-mcp.ts    # Wrapper version Node + import dynamique vers chrome-devtools-mcp-main
│   ├── chrome-devtools-mcp-main.ts  # Point d'entrée principal : parse args, lance McpServer, StdioServerTransport
│   ├── chrome-devtools-mcp.ts    # Alias / autre entry point
│   ├── chrome-devtools.ts        # Entry point pour l'outil CLI `chrome-devtools`
│   └── check-latest-version.ts   # Vérification de mise à jour
├── browser.ts                    # Gestion du cycle de vie du navigateur
│   ├── ensureBrowserConnected()  # Connexion à un Chrome existant (HTTP/WSPipe)
│   ├── ensureBrowserLaunched()   # Lancement d'un nouveau Chrome via Puppeteer
│   ├── launch()                  # Puppeteer.launch() avec args Chrome
│   ├── closeBrowser()            # Fermeture propre (close ou disconnect)
│   └── detectDisplay()           # Détection automatique de $DISPLAY sur Linux
├── collectors/                   # Collecteurs d'événements
│   ├── PageCollector.ts          # Collecte messages console, erreurs, etc.
│   └── ServiceWorkerCollector.ts # Collecteur pour service workers
├── config/                       # Configuration CLI
│   ├── cli-options.ts            # Définitions des arguments CLI (auto-généré par yargs)
│   └── mcp-options.ts            # Schéma des options CLI avec types yargs
├── daemon/                       # Mode daemon (multi-client)
│   ├── client.ts                 # Client daemon
│   ├── daemon.ts                 # Serveur daemon
│   ├── types.ts                  # Types partagés
│   └── utils.ts                  # Utilitaires daemon
├── devtools/                     # Intégration DevTools frontend
│   ├── DevtoolsUtils.ts          # Utilitaires DevTools
│   ├── McpHostBindingAdapter.ts  # Adaptateur binding MCP ↔ DevTools
│   └── issueDescriptions.ts      # Descriptions des problèmes DevTools
├── formatters/                   # Formateurs de sortie
│   ├── ConsoleFormatter.ts       # Formatage messages console
│   ├── HeapSnapshotFormatter.ts  # Formatage heap snapshots
│   ├── IssueFormatter.ts         # Formatage issues
│   ├── NetworkFormatter.ts       # Formatage requêtes réseau
│   └── SnapshotFormatter.ts      # Formatage snapshots
├── index.ts                      # Export principal : McpServer, createMcpServer
├── McpContext.ts                 # Contexte MCP : pages, isolated contexts, roots, path validation
├── McpPage.ts                    # Abstraction d'une page (onglet) avec a11y tree
├── McpResponse.ts                # Gestion des réponses MCP
├── SlimMcpResponse.ts            # Version allégée des réponses
├── TextSnapshot.ts               # Snapshot texte de page
├── ToolHandler.ts                # Gestionnaire d'appels d'outils (validation, mutex, routing pageId)
├── telemetry/                    # Télémétrie
│   ├── ClearcutLogger.ts         # Logger Clearcut (Google)
│   ├── flagUtils.ts              # Utilitaires flags
│   ├── flag_usage_metrics.ts     # Métriques flags
│   ├── metricsRegistry.ts        # Registre métriques
│   ├── persistence.ts            # Persistance telemetry
│   ├── transformation.ts         # Transformation données télémétrie
│   └── watchdog/                 # Watchdog telemetry
│       └── ClearcutSender.ts
├── tools/                        # Outils MCP
│   ├── categories.ts             # Énumération ToolCategory + labels
│   ├── ToolDefinition.ts         # Types ToolDefinition, DefinedPageTool
│   ├── tools.ts                  # Factory createTools() : assemble tous les outils
│   ├── console.ts                # Outils console (list, get)
│   ├── emulation.ts              # Outils emulation (viewport, network, geolocation, …)
│   ├── extensions.ts             # Outils extensions (install, reload, trigger)
│   ├── input.ts                  # Outils input (click, fill, drag, type, …)
│   ├── lighthouse.ts             # Outils Lighthouse
│   ├── memory.ts                 # Outils memory debugging
│   ├── network.ts                # Outils network
│   ├── pages.ts                  # Outils pages (list, new, close, select)
│   ├── performance.ts            # Outils performance tracing
│   ├── pwa.ts                    # Outils PWA
│   ├── screencast.ts             # Outils screencast (expérimental)
│   ├── screenshot.ts             # Outils screenshot
│   ├── script.ts                 # Outils evaluate_script
│   ├── slim/tools.ts             # Set minimal 3 outils pour --slim mode
│   ├── snapshot.ts               # Outils take_snapshot
│   ├── thirdPartyDeveloper.ts    # Outils tierce partie
│   └── webmcp.ts                 # Outils WebMCP
├── third_party/                  # Dépendances embarquées
│   ├── devtools-formatter-worker/
│   ├── devtools-heap-snapshot-worker/
│   ├── Lighthouse bundle/
│   ├── index.ts                  # Ré-exports yargs, puppeteer, zod, MCP SDK
│   └── …
├── utils/                        # Utilitaires
│   ├── bytes.ts
│   ├── check-for-updates.ts
│   ├── files.ts                  # getTempFilePath, resolveCanonicalPath, path validation
│   ├── id.ts
│   ├── keyboard.ts
│   ├── logger.ts
│   ├── pagination.ts
│   ├── polyfill.ts
│   ├── url.ts
│   └── WaitForHelper.ts
└── version.ts                    # Numéro de version
```

**Points clés** :
- L'architecture est modulaire : `browser.ts` gère le cycle de vie, `McpContext.ts` gère l'état (pages, isolated contexts), `ToolHandler.ts` gère la routing/validation des outils, et `tools/` contient les implémentations.
- Le fichier `third_party/index.ts` embarque et réexporte yargs, puppeteer, zod, et le SDK MCP. C'est le seul endroit où ces dépendances sont importées (sauf tests).

---

## Q2 — Outils MCP exposés et façon dont ils sont déclarés

### Liste des catégories d'outils

Les outils sont groupés en 11 catégories (`ToolCategory` dans `categories.ts`) :

| Catégorie | Drapeau CLI | Par défaut | Exemples d'outils |
|-----------|------------|------------|-------------------|
| **Input automation** | — | Oui | `click`, `click_at`, `drag`, `fill`, `handle_dialog`, `hover`, `press_key`, `type_text`, `upload_file` |
| **Navigation automation** | — | Oui | `close_page`, `list_pages`, `navigate_page`, `new_page`, `select_page` |
| **Emulation** | `--category-emulation` | Oui | `emulate`, `resize_page` |
| **Performance** | `--category-performance` | Oui | `performance_analyze_insight`, `performance_start_trace`, `performance_stop_trace` |
| **Network** | `--category-network` | Oui | `get_network_request`, `list_network_requests` |
| **Debugging** | — | Oui | `get_console_message`, `list_console_messages`, `lighthouse_audit`, `screencast_start/stop`, `take_screenshot`, `take_snapshot` |
| **Memory** | `--memory-debugging` | Non | `take_heapsnapshot`, `get_heapsnapshot_*`, `query_heapsnapshot_objects`, `compare_heapsnapshots` |
| **Extensions** | `--category-extensions` | Non | `install_extension`, `reload_extension`, `uninstall_extension`, `trigger_extension_action`, `list_extensions` |
| **Third-party** | `--category-experimental-third-party` | Non | `execute_3p_developer_tool`, `list_3p_developer_tools` |
| **WebMCP** | `--category-experimental-webmcp` | Non | `execute_webmcp_tool`, `list_webmcp_tools` |
| **PWA** | `--category-pwa` | Non | `install_pwa`, `launch_pwa`, `uninstall_pwa`, `get_os_app_state` |

### Mécanisme de déclaration

1. **Chaque outil est une fonction factory** dans un fichier `tools/<nom>.ts` qui retourne un objet `ToolDefinition` :
   ```typescript
   {
     name: string,
     description: string,
     schema: ZodRawShape,      // schéma d'entrée (zod)
     handler: (ctx, response, params) => Promise<void>,
     annotations: { category: ToolCategory, … },
     pageScoped?: boolean,      // true si l'outil nécessite une page sélectionnée
     blockedByDialog?: boolean, // true si l'outil doit refuser si un dialog est ouvert
     verifyFilesSchema?: {...}, // validation de chemins de fichiers
   }
   ```

2. **`createTools(args)`** dans `tools/tools.ts` itère sur tous les modules d'outils, appelle chaque fonction factory, et assemble la liste complète. Si `args.slim` est true, seul le module `slim/tools.ts` (3 outils) est utilisé.

3. **`McpServer.#registerTool()`** dans `index.ts` enregistre chaque outil via `this.server.registerTool()` du SDK MCP. Chaque enregistrement est enveloppé dans un `ToolHandler` qui gère :
   - Filtrage par catégorie (drapeaux `--no-category-*`)
   - Conditions (drapeaux `--experimental-*`)
   - Validation des arguments (zod)
   - Routing `pageId` (si `pageIdRouting` et outil page-scoped)
   - Validation des chemins de fichiers (roots capability)
   - Mutex (exécution sérialisée)
   - Télémétrie ( Clearcut)
   - Format de réponse (par défaut, toon, gcf)

4. **Au total** : ~60 outils dans la configuration complète, ~3 outils en mode `--slim`.

---

## Q3 — Drapeaux CLI/options supportés par `mcp-server-chrome`

Le parser CLI est dans `src/config/mcp-options.ts` (yargs) avec ~40 options.

### Connexion / Lancement navigateur

| Flag | Type | Défaut | Description |
|------|------|--------|-------------|
| `--browserUrl` / `-u` | string | — | URL HTTP vers Chrome existant (ex: `http://127.0.0.1:9222`) |
| `--wsEndpoint` / `-w` | string | — | WebSocket endpoint vers Chrome |
| `--wsHeaders` | string (JSON) | — | Headers custom pour WebSocket |
| `--autoConnect` | boolean | false | Se connecter à un Chrome local existant (144+) |
| `--channel` | `canary\|dev\|beta\|stable` | `stable` | Canal Chrome à lancer |
| `--executablePath` / `-e` | string | — | Chemin vers exécutable Chrome custom |
| `--userDataDir` | string | `~/.cache/chrome-devtools-mcp/chrome-profile` | Répertoire données utilisateur |
| `--isolated` | boolean | false | Créer un user-data-dir temporaire auto-nettoyé |
| `--headless` | boolean | false | Mode headless (sans UI) |
| `--viewport` | string | — | Taille viewport (ex: `1280x720`) |
| `--proxyServer` | string | — | Proxy pour Chrome |
| `--acceptInsecureCerts` | boolean | false | Ignorer les certificats auto-signés |
| `--chrome-arg` | array | — | Args supplémentaires passés à Chrome |
| `--ignore-default-chrome-arg` | array | — | Désactiver args par défaut de Puppeteer |

### Filtres réseau

| Flag | Type | Défaut | Description |
|------|------|--------|-------------|
| `--allowedUrlPattern` | array | — | URLPattern autorisés (exclusif de blockedUrlPattern) |
| `--blockedUrlPattern` | array | — | URLPattern bloqués (exclusif de allowedUrlPattern) |

### Catégories d'outils

| Flag | Type | Défaut | Description |
|------|------|--------|-------------|
| `--category-emulation` | boolean | true | Inclure les outils emulation |
| `--category-performance` | boolean | true | Inclure les outils performance |
| `--category-network` | boolean | true | Inclure les outils network |
| `--category-extensions` | boolean | false | Inclure les outils extensions |
| `--category-pwa` | boolean | false | Inclure les outils PWA |
| `--category-experimental-third-party` | boolean | false | Outils tierce partie |

### Fonctionnalités

| Flag | Type | Défaut | Description |
|------|------|--------|-------------|
| `--usage-statistics` | boolean | true | Envoyer des stats d'usage Google (auto-faux si CI ou `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS`) |
| `--performance-crux` | boolean | true | Envoyer URL aux API CrUX |
| `--javascript-evaluation` | boolean | true | Autoriser l'évaluation JavaScript |
| `--slim` | boolean | false | Mode 3 outils uniquement |
| `--redact-network-headers` | boolean | false | Redacter les headers sensibles des requêtes réseau |
| `--allow-unrestricted-paths` | boolean | false | Autoriser l'écriture de fichiers hors temp directory |
| `--page-id-routing` | boolean | true | Requérir pageId sur les outils page-scoped |
| `--experimental-devtools` | boolean | false | Ouvrir DevTools automatiquement |
| `--experimental-vision` | boolean | false | Outils basés sur coordonnées (`click_at`) |
| `--memory-debugging` | boolean | false | Outils memory debugging |
| `--experimental-screencast` | boolean | false | Enregistrement screencast (nécessite ffmpeg) |
| `--experimental-screencast-fps` | number | — | FPS pour screencast |
| `--experimental-structured-content` | boolean | false | Contenu structuré formaté |
| `--experimental-data-format` | `default\|toon\|gcf` | `default` | Format de données structuré |
| `--experimental-include-all-pages` | boolean | false | Inclure webviews et background pages |
| `--screenshot-format` | `jpeg\|png\|webp` | — | Format screenshot par défaut |
| `--screenshot-quality` | number 0-100 | — | Qualité screenshot par défaut |
| `--screenshot-max-width` | number | — | Largeur max screenshot |
| `--screenshot-max-height` | number | — | Hauteur max screenshot |
| `--log-file` | string | — | Fichier de logs debug |

### Télémétrie (caché)

| Flag | Type | Défaut | Description |
|------|------|--------|-------------|
| `--clearcut-endpoint` | string | — | Endpoint Clearcut |
| `--clearcut-force-flush-interval-ms` | number | — | Intervalle flush (test) |
| `--clearcut-include-pid-header` | boolean | — | Incluir PID (test) |

### Règles de middleware (dans `parser()`)

- Si aucun `--channel`, `--browserUrl`, `--wsEndpoint`, ni `--executablePath` n'est fourni → `channel` par défaut = `stable`
- Si `CI` ou `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` est défini → `usageStatistics` force à `false`
- Arguments inconnus → message d'erreur

---

## Q4 — Transport natif

**Le transport natif est `stdio`** (Standard I/O).

Dans `src/bin/chrome-devtools-mcp-main.ts` :

```typescript
import {StdioServerTransport} from '../third_party/index.js';
// ...
const transport = new StdioServerTransport();
await server.connect(transport);
```

Le serveur MCP démarre, se connecte au transport `StdioServerTransport`, puis lit stdin jusqu'à EOF (ou SIGTERM/SIGINT) pour déterminer la fin de session. Les mécanismes de shutdown :

```typescript
process.stdin.on('end', () => shutdown('stdin end'));
process.stdin.on('close', () => shutdown('stdin close'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGHUP', () => shutdown('SIGHUP'));
```

**Le shutdown** (lignes 40-56) :
1. Marque `shuttingDown = true`
2. Logger le shutdown
3. Lance `closeBrowser()` (ferme ou disconnect le navigateur)
4. `process.exit(0)` dans les 5 secondes max (timeout de sécurité)

**Le transport HTTP/WS n'est PAS implémenté** dans l'upstream. C'est une différence architecturale majeure avec notre projet Cerema qui requiert un transport HTTP streamable avec authentification, gestion multi-clients, et /view noVNC.

**Le SDK MCP (`@modelcontextprotocol/sdk` 1.30.0)** supporte nativement plusieurs transports (`StdioServerTransport`, `StreamableHttpServerTransport`, etc.), donc l'ajout d'un transport HTTP est faisable en remplaçant `StdioServerTransport` par `StreamableHttpServerTransport` dans notre entry point.

---

## Q5 — Gestion du cycle de vie du navigateur

### Architecture à singleton

`src/browser.ts` utilise des variables `let` module-scoped :

```typescript
let browser: Browser | undefined;
let browserMode: 'launched' | 'connected' | undefined;
```

### Deux modes

| Mode | Fonction | Comportement |
|------|----------|--------------|
| **`launched`** | `ensureBrowserLaunched()` | Puppeteer lance un nouveau Chrome avec `puppeteer.launch()`. `closeBrowser()` appelle `browser.close()`. |
| **`connected`** | `ensureBrowserConnected()` | Puppeteer se connecte à un Chrome existant (via `puppeteer.connect()`). `closeBrowser()` appelle `browser.disconnect()`. |

### Connexion à un Chrome existant

`ensureBrowserConnected()` supporte 3 modes de connexion :
1. **WebSocket endpoint** (`--wsEndpoint`) : `browserWSEndpoint`
2. **HTTP URL** (`--browserUrl`) : `browserURL`
3. **Auto-connect local** : lit `DevToolsActivePort` dans le userDataDir pour découvrir le port WebSocket

### Lancement d'un nouveau Chrome

`launch()` configure :
- **User data dir** : par défaut `~/.cache/chrome-devtools-mcp/chrome-profile`, configurable via `--userDataDir`, temporaire si `--isolated`
- **Channel** : `chrome` (stable), `chrome-canary`, `chrome-dev`, `chrome-beta`
- **Args Chrome** : `--hide-crash-restore-bubble`, `--screen-info={3840x2160}` en headless, `--auto-open-devtools-for-tabs` en mode devtools
- **Options Puppeteer** : `pipe: true`, `defaultViewport: null`, `targetFilter`, `handleDevToolsAsPage: true`, `enableExtensions`, `blocklist`, `allowlist`
- **Viewport** : redimensionne la première page après démarrage si `--viewport` est fourni

### Cleanup

Le shutdown hook (`closeBrowser()`) :
- Si mode `launched` → `browser.close()` (tue le processus Chrome)
- Si mode `connected` → `browser.disconnect()` (laisse Chrome vivant)

**Point critique pour le projet Cerema** : l'upstream gère un **seul navigateur par processus**. Pour notre besoin de sessions isolées par utilisateur, nous devrons soit :
1. Gérer plusieurs navigateurs (un par session utilisateur) avec des profiles séparés
2. Utiliser les `BrowserContext` isolés (déjà supportés via `--isolated` et `isolatedContext` sur `new_page`)
3. Ou restructurer pour lancer un Chrome par session (le plus isolé mais plus lourd)

---

## Q6 — Sécurité d'écriture de fichiers

### Par défaut : restreint au temp directory

L'upstream implémente une restriction de chemin basée sur les **MCP roots** :

```typescript
// McpContext.ts
roots(): Root[] {
  return [
    ...(this.#roots ?? []),
    {
      uri: pathToFileURL(os.tmpdir()).href,
      name: 'temp',
    },
  ];
}
```

Même si le client ne négocie **pas** la capacité `roots`, un root temp est toujours ajouté.

### Mode `allowUnrestrictedPaths`

```typescript
// McpContext.validatePath()
if (this.#roots === undefined && this.#allowUnrestrictedPaths) {
  return canonicalPath || path.resolve(filePath);
}
```

- Par défaut : `allowUnrestrictedPaths = false`
- Si le client ne négocie pas `roots` ET `--allow-unrestricted-paths` n'est pas activé → écriture restreinte à `os.tmpdir()`
- Si `--allow-unrestricted-paths` est activé → toutes les chemins sont autorisés (comportement permissif legacy)

### Validation de chemin

`validatePath()` :
1. Résout le chemin canonique via `fs.realpath()`
2. Vérifie que le chemin canonique est sous un root autorisé
3. Lève `Error("Access denied: path … is not within any of the configured workspace roots.")` si non autorisé

### Écriture de fichiers

`#writeFile()` dans `McpContext` :
- Utilise `O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW` — **ne suit pas les symlinks**
- Permissions `0o600` (propriétaire uniquement)
- Crée les répertoires parents récursivement

### Implications pour le projet Cerema

- Notre service doit pouvoir écrire dans des répertoires au-delà de `/tmp` (par exemple sur un PVC)
- **Solution** : utiliser `--allow-unrestricted-paths` OU faire négocier la capacité `roots` par le client MCP
- Le chemin des profiles Chrome (`CDM_PROFILE_DIR=/data/profiles`) doit être sous un root autorisé ou via `--allow-unrestricted-paths`
- `puppeteer.setFollowSymlinks(false)` est appelé au démarrage (dans `index.ts`) — sécurité supplémentaire

---

## Q7 — Mécanisme d'isolation de session

### Niveau 1 : Pages (onglets) au sein d'un même navigateur

L'upstream gère **plusieurs pages (onglets)** dans un **seul navigateur** :

```typescript
// McpContext.ts
#mcpPages = new Map<Page, McpPage>();  // Page CDP → abstraction MCP
#selectedPage?: McpPage;               // Page active courante
```

Chaque page obtient un **ID auto-incrémental** global (process-wide) :

```typescript
let nextPageId = 1;
// McpPage est créé avec `nextPageId++`
```

Les outils page-scoped acceptent un paramètre `pageId` pour cibler une page spécifique. Si `pageIdRouting` est activé (par défaut), le `pageId` est requis. Sinon, la page sélectionnée est utilisée.

### Niveau 2 : BrowserContexts isolés (cookies/storage)

L'upstream supporte des **contextes navigateur isolés** (via Puppeteer `browser.createBrowserContext()`) :

```typescript
// McpContext.ts
#isolatedContexts = new Map<string, BrowserContext>();

async newPage(background?, isolatedContextName?) {
  if (isolatedContextName !== undefined) {
    let ctx = this.#isolatedContexts.get(isolatedContextName);
    if (!ctx) {
      ctx = await this.browser.createBrowserContext();
      this.#isolatedContexts.set(isolatedContextName, ctx);
    }
    page = await ctx.newPage();
  } else {
    page = await this.browser.newPage({background});
  }
}
```

Ces contextes partagent **aucun cookie ni storage** entre eux. La spécification Atlier mentionne "une session = un profile Chrome isolé", ce qui correspond au `--isolated` flag (user-data-dir séparé) ou aux `BrowserContext` isolés.

### Niveau 3 : User-data-dir séparé (via `--isolated`)

```typescript
// browser.ts
if (!isolated && !userDataDir) {
  userDataDir = path.join(
    os.homedir(),
    '.cache',
    options.viaCli ? 'chrome-devtools-mcp-cli' : 'chrome-devtools-mcp',
    profileDirName,
  );
}
// Si --isolated : userDataDir n'est pas défini, Puppeteer crée un temp dir auto-nettoyé
```

### Ce qui manque pour le projet Cerema

| Besoin Cerema | Supporté par upstream ? | Comment le réaliser |
|---------------|------------------------|---------------------|
| **Session = profile Chrome isolé** | Partiellement (`--isolated` ou `userDataDir`) | Lancer un Chrome par session avec `userDataDir` sur PVC |
| **Plafond de sessions** | **Non** | À implémenter (compteur + rejection) |
| **Expiration automatique** | **Non** | À implémenter (timer inactivité) |
| **Authentification** | **Non** | À implémenter (API key middleware) |
| **Transport HTTP multi-client** | **Non** | Remplacer `StdioServerTransport` par `StreamableHttpServerTransport` |
| **Outils personnalisés** | Non (mais extensible) | Ajouter des outils dans `tools/` + `ToolHandler` |

---

## Résumé des divergences architecturales attendues

| Aspect | Upstream | Projet Cerema |
|--------|----------|---------------|
| **Transport** | stdio uniquement | HTTP streamable (via SDK) |
| **Auth** | Aucune | API key maître + tokens par client |
| **Multi-client** | Aucun (un seul client stdio) | Multi-client simultané (max configurable) |
| **Session** | Aucune (tout dans un seul navigateur) | Une session = un Chrome avec profile isolé |
| **Cycle de vie** | Processus = session | Sessions éphémères avec expiration |
| **Desktop view** | Aucun | noVNC sur /view |
| **Outils** | ~60 outils Chrome DevTools | ~20 outils + raise_window() + request_human() |
| **Catégories désactivées** | Aucune par défaut | extensions, pwa, experimental-third-party (pour rester sous ~20 outils) |
| **Flags forcés** | Aucune | `--usage-statistics=false`, `--performance-crux=false`, `--redact-network-headers=true`, `--channel=chrome` |
| **Écriture fichiers** | Temp directory (roots) | PVC `/data/profiles` + autres chemins |
| **Chrome** | Détecté automatiquement | Google Chrome stable uniquement (pas Chromium) |
| **Affichage** | Détection `$DISPLAY` ou headless | Xvfb obligatoire pour x11vnc/noVNC |
