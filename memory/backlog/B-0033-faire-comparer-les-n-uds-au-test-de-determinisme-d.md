<!-- socle: couche=backlog zone=publique -->
# B-0033 — Faire comparer les nœuds au test de déterminisme de la recherche

> statut : ouvert · origine : J-2026-11-12-H · après : B-0031 · lu : backlog@1b79ad04

Le test `la_recherche_est_deterministe` de `engine/src/search.rs` compare
le coup rendu par deux recherches identiques, à la profondeur 4, sur une
position. L'invariant du moteur est plus fort : à un fil, la recherche
est déterministe au nœud près. Un relecteur l'a mesuré le 12 nov. 2026,
sans que l'agent le reproduise : un hasard non seedé injecté dans la note
des coups tranquilles change le compte de nœuds 300 fois sur 300, et le
coup 156 fois seulement. Le test laisserait donc passer la faute une fois
sur deux.

Un changement de test du moteur : il attend la fin de l'adoption du socle.

## Fait quand

- [ ] la mesure du relecteur est reproduite, le hasard injecté puis retiré
- [ ] le test compare aussi le compte de nœuds, sur plusieurs positions
- [ ] il échoue sur le code où le hasard est injecté, et passe sur `main`
