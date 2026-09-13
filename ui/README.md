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

Le mode de transport vers le moteur — processus fils en application de bureau,
WebAssembly dans un Web Worker, ou serveur distant — n'est pas tranché. UCI rend
les trois interchangeables sans toucher au moteur.
