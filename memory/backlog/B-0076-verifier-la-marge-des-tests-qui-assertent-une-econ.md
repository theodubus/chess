<!-- socle: couche=backlog zone=publique -->
# B-0076 — Vérifier la marge des tests qui assertent une économie de nœuds

> statut : ouvert · origine : J-2026-11-23-J · après : B-0044 · priorité : basse · lu : backlog@faad11c5

Des tests assertent qu'un élagage « retire des nœuds » : la somme sur les
six positions du banc pour la futilité aux nœuds frontières,
`lelagage_delta_retire_des_noeuds` sur une seule (`engine/src/search.rs`).
Ils sont vrais aujourd'hui, mais leur marge s'érode à chaque changement
d'arbre : celle de la futilité inverse est tombée à 3 % sous la
composition du n° 12 et a été reformulée ; le test des extensions
singulières est tombé sous cinq changements sans rapport
(J-2026-11-18-EF). Le jour où l'un tombe, on accusera le changement plutôt
que la formulation (`CLAUDE.md`, « Une propriété générale assertée sur UNE
position passe par chance »). La sonde de chacun, à l'attic
(`tools/attic/c36-sonde-compte.patch` pour l'élagage par compte), se
relance après un changement d'arbre qui touche ce qu'elle garde.

## Fait quand

- [ ] la marge de chaque test d'économie de nœuds est mesurée sur `main`, sur un échantillon de positions de parties
- [ ] celui qui s'asserte sur une seule position, ou dont la marge est mince, est reformulé sur l'échantillon, par une mesure indépendante du changement (ADR-0038), ou laissé avec sa marge écrite
