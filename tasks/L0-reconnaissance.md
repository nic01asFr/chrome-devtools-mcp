# Lot L0 — Reconnaissance amont

## Règles

- Aucun code. Seulement lecture et documentation.
- Répondre aux 7 questions ci-dessous.
- Produire `docs/AMONT.md`.

## Questions à répondre

1. **Quelle est la structure exacte de `src/` upstream ?**
   Lister tous les fichiers source, leurs rôles, et leurs dépendances.

2. **Quels outils MCP sont exposés et comment sont-ils déclarés ?**
   Lister les outils, leurs schémas d'entrée/sortie, et où ils sont définis.

3. **Quels drapeaux/options sont supportés par `mcp-server-chrome` ?**
   Documenter tous les flags CLI, leurs valeurs par défaut, et leur effet.

4. **Quel transport est natif dans l'amont ?**
   stdio uniquement ? HTTP ? WebSocket ? Le transport HTTP streamable existe-t-il déjà ?

5. **Comment le cycle de vie du navigateur est-il géré ?**
   Démarrage, reconnexion, crash recovery, gestion de la session Chrome.

6. **Comment les outils d'écriture de fichiers sont-ils sécurisés ?**
   Vérifier `--allow-unrestricted-paths` et la capacité `roots`.

7. **Y a-t-il déjà un mécanisme d'isolation de sessions ?**
   L'amont supporte-t-il plusieurs sessions Chrome simultanées avec profils séparés ?

## Sortie attendue

`docs/AMONT.md` avec les réponses détaillées aux 7 questions, annotées par section.
