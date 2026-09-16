# ui

Interface TypeScript. **Pas encore démarrée.**

Elle possédera tout ce que le moteur refuse de savoir : le rendu de l'échiquier,
l'état de la partie, les pendules, le PGN, l'annulation, les réglages, et
l'affichage des lignes `info` émises par le moteur (barre d'évaluation, flèches
de variante).

Choix déjà arrêtés :

- **`chessground`** pour l'échiquier — l'implémentation de Lichess, sous
  GPL-3.0, compatible avec la licence AGPL-3.0 du dépôt.
- **`chess.js`** pour les règles côté client, afin de surligner les coups légaux
  et refuser un déplacement illégal sans aller-retour vers le moteur. Cette
  duplication des règles est volontaire : l'une sert l'interactivité, l'autre la
  vitesse.
- **React + Vite + TypeScript.** `chessground` est une bibliothèque DOM
  ordinaire, sans dépendance à un framework : elle s'intègre dans un composant
  qui lui donne un nœud et le laisse tranquille.

Le mode de transport vers le moteur — processus fils en application de bureau,
WebAssembly dans un Web Worker, ou serveur distant — n'est **pas** tranché, et
le choix est **reporté derrière un adaptateur** : l'interface ne connaît du
moteur qu'une interface `Engine` de trois méthodes, et le transport tient dans
un seul fichier. UCI rend les trois formes interchangeables sans toucher au
moteur.

Les consignes de travail complètes — périmètre, surface UCI réelle du moteur,
contrainte de licence, ordre de démarrage — vivent dans `ui/CLAUDE.md`.
