# Spécification — service chrome-devtools-mcp pour l'Atelier

Document de référence. Les lots (`tasks/`) l'implémentent ; en cas de
contradiction, ce document fait foi.

---

## 1. Besoin

Un agent de l'Atelier doit pouvoir naviguer, inspecter et déboguer une page web
depuis une session de travail hébergée, **et** l'humain doit pouvoir regarder
l'écran et reprendre la main dans l'onglet quand une authentification bloque
l'agent.

Les deux ensemble sont la raison d'être du service. Un navigateur invisible ne
répond qu'à la moitié du besoin.

---

## 2. Forme du service

```
Pod SSPCloud « chrome-devtools-mcp »
│
├── Xvfb (:99) + gestionnaire de fenêtres
├── Google Chrome, headful, une fenêtre par session
├── x11vnc → noVNC
└── serveur Node (fork amont + enveloppe CEREMA)
    ├── /mcp     — MCP HTTP streamable, pour les agents
    ├── /view    — bureau distant noVNC, pour l'humain
    └── /health  — état, public, non authentifié
```

Deux ingress, **une seule authentification**. `/view` n'est jamais accessible
sans le même jeton que `/mcp` : le navigateur contient les sessions
authentifiées de l'utilisateur, un accès non authentifié à l'écran équivaut à
une prise de contrôle de ses comptes.

---

## 3. Attributs de catalogue

| Attribut | Valeur | Conséquence |
|---|---|---|
| `locality` | `per-user` | un pod par personne, une identité propriétaire |
| `lifecycle` | `on-demand` | pod à zéro sans session, réveil au premier appel |
| `egress` | `allowlist` | domaines autorisés déclarés, refus par défaut |

---

## 4. Sessions

**Une session MCP = un profil Chrome dédié = une fenêtre.**

L'isolation est obtenue par l'amont, pas par du code nouveau :

- session ordinaire → `--isolated` (profil éphémère, détruit à la fermeture) ;
- session ancrée → `--user-data-dir=<PVC>/profiles/anchored` (profil persistant,
  demandé explicitement par l'agent).

Règles :

1. Plafond de sessions simultanées, configurable, défaut 3. Au-delà, erreur MCP
   lisible, pas de plantage.
2. Expiration d'inactivité, configurable, défaut 30 minutes.
3. Fermeture de session → processus arrêté, fenêtre fermée, profil éphémère
   supprimé.
4. Le profil ancré est **sérialisé** : une seule session à la fois. La deuxième
   demande attend ou reçoit une erreur explicite.

Le profil ancré est un **magasin d'identifiants**. Il vit sur le PVC, n'est
jamais inclus dans une image, jamais partagé entre utilisateurs, et son
existence est décrite dans `SECURITY.md`.

---

## 5. Sortie réseau

La liste blanche est native en amont : `--allowed-url-pattern`, complétée par
`--blocked-url-pattern`. Elle est construite par `launcher.ts` depuis
`CDM_ALLOWED_URL_PATTERNS`.

Par défaut, refus des adresses internes du cluster. Tout refus est journalisé.

---

## 6. Budget d'outils

L'amont expose plus d'outils que le standard ne le tolère. Les catégories
inutiles sont désactivées par drapeau dans `launcher.ts` :

- gardées : navigation, inspection, réseau, performance ;
- désactivées par défaut : `--category-extensions`, `--category-pwa`,
  `--category-experimental-third-party` ;
- `--javascript-evaluation` reste actif (indispensable au débogage) mais est
  mentionné dans `SECURITY.md`.

Cible : rester sous une vingtaine d'outils exposés. Si le compte dépasse, un
mode découverte devient obligatoire — à signaler, pas à improviser.

---

## 7. Outils ajoutés

Deux seulement. Tout le reste vient de l'amont.

**`raise_window()`** — met la fenêtre de la session appelante au premier plan
dans le bureau distant. Utile pour savoir quel agent on regarde.

**`request_human(raison: string, timeout_s?: number)`** — l'agent bute sur une
authentification, un MFA, un captcha. L'outil :

1. met la fenêtre au premier plan ;
2. émet une notification vers l'Atelier ;
3. attend que l'humain signale la reprise, ou expire (défaut 300 s) ;
4. retourne un état explicite : `resumed` ou `timeout`.

Il ne bloque jamais indéfiniment. Les cookies acquis pendant l'intervention
restent dans le profil de la session.

---

## 8. Authentification

- Clé maître générée par Onyxia
  (`x-onyxia.overwriteDefaultWith: "{{service.oneTimePassword}}"`,
  `render: "password"`), exposée en **value** et non en Secret seul, sinon
  l'utilisateur ne peut pas la lire.
- Jetons par client, révocables, distincts de la clé maître, stockés sur le PVC.
  Un store en mémoire est disqualifiant : les jetons seraient perdus à chaque
  redémarrage.
- `/view` accepte le même jeton, transmis par cookie de session posé après
  vérification. Le cookie ne contient jamais la clé maître.

---

## 9. Déploiement

- Secret de métadonnées `sh.onyxia.release.v1.<release>` (`owner`,
  `friendlyName`, `catalog`, `share`), sans quoi le service n'apparaît pas dans
  « Mes services ».
- Deux ingress, gabarits numérotés (`ingress-1-view.yaml`,
  `ingress-2-mcp.yaml`) : Helm assemble par ordre alphabétique et le bouton
  « Ouvrir » prend le premier. `/view` doit être le premier.
- `NOTES.txt` en markdown, clé entre accents graves, **en haut**.
- Annotations nginx `proxy-read-timeout` et `proxy-send-timeout` au-delà de
  60 s : le WebSocket noVNC et les sessions de navigation les dépassent.
- PVC avec `helm.sh/resource-policy: keep` pour le profil ancré et le store de
  jetons.
- Après un `helm upgrade` qui ne touche pas le Deployment, `kubectl rollout
  restart`, sinon l'ancienne image continue de tourner.
- `/health` public non authentifié, pour le catalogue vivant.

---

## 10. Intégration Atelier

Entrée de catalogue :

```yaml
- name: chrome-devtools
  transport: http-streamable
  url: https://user-<idep>-chrome-devtools.user.lab.sspcloud.fr/mcp
  view_url: https://user-<idep>-chrome-devtools.user.lab.sspcloud.fr/view
  locality: per-user
  lifecycle: on-demand
  egress: allowlist
```

Deux évolutions à demander côté Atelier, **génériques** (QGIS a le même
besoin) : le rendu d'un champ `view_url` comme lien « Voir » dans l'onglet
Connecteurs, et un canal de notification pour `request_human`.

---

## 11. Ce que le service ne fait pas

- Pas de multi-utilisateurs sur un même pod. Le cloisonnement sépare des
  agents, pas des personnes.
- Pas de pilotage du navigateur du poste local. C'est un service distinct.
- Pas d'enregistrement vidéo ni de parallélisme massif.
