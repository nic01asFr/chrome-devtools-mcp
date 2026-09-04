# Divergences avec l'amont

> Chaque modification d'un fichier amont doit être listée ici avec sa raison.
> Si cette liste est vide, aucun fichier amont n'a été modifié.

_Vide — tous les changements de code sont dans `src/cerema/`. Le chart Helm
est dans `charts/chrome-devtools-mcp/` — pas de divergence amont, c'est du
nouveau livrable._

## L2 — Transport HTTP streamable + auth + /health

- **Suppression** du `StdioServerTransport` de l'upstream (unique point d'entrée `bin/chrome-devtools-mcp-main.ts`)
- **Ajout** de `src/cerema/server.ts` : serveur HTTP Express avec routes `/mcp` (transport Streamable), `/health` (public), `/view` (placeholder L4)
- **Ajout** de `src/cerema/auth.ts` : middleware d'authentification Bearer token, clé maître + tokens clients
- **Ajout** de `src/cerema/index.ts` : point d'entrée remplaçant l'upstream
- **Ajout** de `src/cerema/token-store.ts` : stores en mémoire et PVC

## L3 — Sessions isolées

- **Ajout** de `src/cerema/session.ts` : `SessionManager` avec plafond, expiration, profil isolé par session
- **Ajout** de `src/cerema/PvcTokenStore` : persistance sur PVC avec flush atomique
- Divergence structurante : l'upstream est singleton-browser ; Cerema est multi-session

## L4 — Image Docker + bureau virtuel noVNC

- **Ajout** de `docker/Dockerfile` : image multi-étapes (node:22 build → ubuntu:24.04 runtime)
- **Ajout** de `docker/entrypoint.sh` : initialise Xvfb (:99, 1280x720x24), x11vnc (port 5900, auth), websockiny (6080 → 5900)
- **Ajout** de `src/cerema/view.ts` : générateur HTML pour noVNC, connecte WebSocket → websockiny
- **Modification** de `src/cerema/server.ts` : route `/view` authentifiée qui sert le HTML noVNC (plus un placeholder 501)
- **Ajout** de `@novnc/novnc` et `websockify` dans le runtime Docker
- Port 3000 : Express (MCP + /view) ; Port 6080 : websockiny (WebSocket → VNC)

## L6 — Helm chart pour SSPCloud

- **Ajout** de `charts/chrome-devtools-mcp/` : chart Helm complet (Chart.yaml, values.yaml, templates/)
- **templates/deployment.yaml** — PVC (`helm.sh/resource-policy: keep`), Secret Onyxia (annotations `sh.onyxia.release.v1` JSON, clé API en value), Deployment (Tini, probes /health, volumes PVC + tmpfs), Service (ClusterIP 3100 + 6080), HPA (scale-to-zero)
- **templates/ingress-1-view.yaml** — `/view` (noVNC) premier, timeouts proxy 3600s
- **templates/ingress-2-mcp.yaml** — `/mcp` (Streamable HTTP), timeouts proxy 3600s, HTTP/1.1
- **templates/NOTES.txt** — affiché à la fin de `helm install` : routes, clé, commandes de maintenance
- **templates/_helpers.tpl** — helpers nom/labels/sélecteurs
- **values.yaml** — toutes les variables configurables : image, env, auth, pvc, ingress, autoscaling, onyxia

## L5 — Outils personnalisés `raise_window()` + `request_human()`

- **Ajout** de `src/cerema/tools.ts` : module L5 avec deux outils MCP
  - **`raise_window()`** : utilise xdotool (installé dans le Dockerfile) pour
    activer la fenêtre Chrome de la session courante au premier plan dans le
    bureau virtuel Xvfb
  - **`request_human(raison, timeout_s)`** : crée un fichier d'état
    `/data/human_requests/<sessionId>.json`, soulève la fenêtre, puis poll le
    fichier toutes les 500 ms — retourne `resumed` si l'humain supprime le
    fichier (intervention), `timeout` si aucun geste sous 300 s (configurable
    par `timeout_s`, max 3600 s)
  - Les outils sont enregistrés via `mcpServer.tool()` sur le McpServer de
    chaque session, avec closures sur `sessionManager` et `managedSessionId`
- **Modification** de `src/cerema/server.ts` : import + appel à
  `registerL5Tools(mcpServer, sessionManager, managedSessionId)` dans
  `handleNewSession()` juste après `mcpServer.connect(transport)`
- Ajout de `src/cerema/tools.test.ts` : tests unitaires du cycle de vie du
  fichier d'état et des exports
