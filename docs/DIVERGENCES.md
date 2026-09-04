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
