# Lots

Un lot à la fois. Ne pas enchaîner sans validation humaine.

| Lot | Objet | Sortie |
|---|---|---|
| [L0](L0-reconnaissance.md) | Lire l'amont, répondre à 7 questions | `docs/AMONT.md`, aucun code |
| [L1](L1-lanceur.md) | Lanceur souverain, drapeaux forcés | `src/cerema/launcher.ts` + tests |
| [L2](L2-transport-http.md) | Transport HTTP streamable + auth + `/health` | service joignable au jeton |
| [L3](L3-sessions.md) | Une session = un profil isolé, plafond, expiration | isolation vérifiée |
| [L4](L4-image-bureau.md) | Image Chrome + Xvfb + noVNC, `/view` authentifié | bureau visible |
| [L5](L5-outils.md) | `raise_window`, `request_human` | reprise de main réelle |
| [L6](L6-chart.md) | Chart Helm, on-demand, docs de publication | installable par un tiers |

L3 avant L4 : l'isolation est structurante, le confort ne l'est pas.
