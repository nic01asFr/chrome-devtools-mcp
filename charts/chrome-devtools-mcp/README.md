# chrome-devtools-mcp — Helm chart pour SSPCloud

Service Chrome DevTools MCP avec bureau virtuel noVNC pour l'Atelier CEREMA.
Un pod par utilisateur, on-demand (scale-to-zero), allowlist réseau.

## Structure du chart

```
chrome-devtools-mcp/
├── Chart.yaml              # métadonnées du chart (version, appVersion)
├── values.yaml             # valeurs par défaut
└── templates/
    ├── _helpers.tpl        # fonctions de templating communes
    ├── deployment.yaml     # PVC, Secret Onyxia, Deployment, Service, HPA
    ├── ingress-1-view.yaml # /view (noVNC bureau distant) — premier
    ├── ingress-2-mcp.yaml  # /mcp (transport Streamable) — second
    └── NOTES.txt           # affiché à la fin de helm install/upgrade
```

## Déploiement sur SSPCloud

### 1. Build Docker

```bash
cd /home/onyxia/work/projects/nouveau-projet
docker build -t ghcr.io/cerema/chrome-devtools-mcp:latest -f docker/Dockerfile .
docker push ghcr.io/cerema/chrome-devtools-mcp:latest
```

### 2. Installer le chart

```bash
helm install chrome-devtools-mcp ./charts/chrome-devtools-mcp \
  --namespace user-<idep> \
  --set onyxia.owner="<idep>" \
  --set onyxia.friendlyName="chrome-devtools" \
  --set onyxia.release="v1" \
  --set auth.apiKeyValue="$(echo $CDM_API_KEY)" \
  --set image.repository="ghcr.io/cerema/chrome-devtools-mcp" \
  --set image.tag="latest"
```

Sur SSPCloud, Onyxia injecte automatiquement `CDM_API_KEY` (champ
`service.oneTimePassword` du catalogue).

### 3. Mettre à jour sans redémarrer

Un `helm upgrade` qui ne touche que les valeurs ne relance pas les pods.
Si vous changez l'image :

```bash
kubectl rollout restart deployment chrome-devtools-mcp -n user-<idep>
```

### 4. Supprimer (PVC préservé)

Le PVC a `helm.sh/resource-policy: keep` — il survit au `helm uninstall`.
Pour supprimer aussi le PVC :

```bash
kubectl delete pvc chrome-devtools-mcp-data -n user-<idep>
```

## Configuration

| Paramètre | Défaut | Description |
|---|---|---|
| `image.repository` | `ghcr.io/cerema/chrome-devtools-mcp` | Image Docker |
| `image.tag` | `latest` | Tag de l'image |
| `env.MAX_SESSIONS` | `3` | Plafond de sessions MCP |
| `env.SESSION_TIMEOUT` | `1800` | Expiration inactivité (s) |
| `env.CHANNEL` | `chrome` | Canal Chrome / Chromium |
| `env.PORT` | `3100` | Port du serveur HTTP |
| `env.WEBSOCKIFY_PORT` | `6080` | Port websockify (VNC → WS) |
| `env.DISABLED_CATEGORIES` | `extensions,pwa,experimental-third-party` | Outils MCP désactivés |
| `env.ALLOWED_URL_PATTERNS` | (vide) | Allowlist URL (CSV) |
| `env.BLOCKED_URL_PATTERNS` | (vide) | Blocklist URL (CSV) |
| `pvc.size` | `5Gi` | Taille du PVC (profils + tokens) |
| `pvc.storageClass` | `fast-nvme` | Classe de stockage |
| `pvc.resourcePolicy` | `keep` | `keep` = PVC survit au uninstall |
| `auth.apiKeyValue` | (vide) | Clé API injectée par Onyxia |
| `auth.apiKeySecretName` | (vide) | Secret Kubernetes pour la clé API |
| `auth.vncPassword` | `novnc` | Mot de passe VNC |
| `autoscaling.enabled` | `false` | Activer HPA (scale-to-zero) |
| `autoscaling.minReplicas` | `0` | Min pods (sur SSPCloud avec Keda) |
| `autoscaling.maxReplicas` | `5` | Max pods |

## Ingresses

Deux ingress sont créés, dans l'ordre alphabétique :

1. **`ingress-1-view.yaml`** — `/view` (bureau noVNC) — premier, pris par le
   bouton « Ouvrir » de l'Atelier.
2. **`ingress-2-mcp.yaml`** — `/mcp` (transport Streamable MCP) — second.

Annotations nginx communes :
- `proxy-read-timeout: 3600` — le WebSocket noVNC peut rester ouvert longtemps
- `proxy-send-timeout: 3600` — idem
- `proxy-body-size: 10m` — pour les responses MCP volumineuses

## Santé du service

`GET /health` retourne :

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 123,
  "sessions": 0,
  "maxSessions": 3,
  "forcedFlags": {}
}
```

Accessible sans authentification — utilisé par le catalogue vivant.

## Sécurité

- Le PVC contient les profils Chrome (incluant cookies, tokens de session) et
  le store de tokens clients. Il est configuré avec `helm.sh/resource-policy: keep`
  pour ne pas être supprimé accidentellement.
- Le `/view` est authentifié via le même token que `/mcp`. Il n'est jamais
  accessible sans ce jeton.
- La sortie réseau est contrôlée par allowlist (`CDM_ALLOWED_URL_PATTERNS`).
