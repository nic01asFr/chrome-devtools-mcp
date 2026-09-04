# Divergences avec l'amont

> Chaque modification d'un fichier amont doit être listée ici avec sa raison.
> Si cette liste est vide, aucun fichier amont n'a été modifié.

_Vide — tous les changements sont dans `src/cerema/`._

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
