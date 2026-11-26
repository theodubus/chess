<!-- socle: couche=backlog zone=publique -->
# B-0080 — Dire pourquoi tools/ reste hors du balayage de mutation, ou l'y faire entrer

> statut : ouvert · origine : J-2026-11-24-H · priorité : basse · lu : backlog@cdae1b62

Le balayage de mutation ne porte que sur `engine/src/`. La raison écrite
date du 15 sept. 2026, quand `tools/` n'avait que trois outils :
« `tools/` est hors du balayage pour la même raison : ce sont des
utilitaires hors ligne, dont la fiabilité se juge par `crosscheck.sh` ».
Elle ne tient plus :
- `crosscheck.sh` ne juge que l'arbitre ;
- `tools/` porte aujourd'hui des tests qui gardent des invariants du
  moteur, comme `les_entrees_du_moteur_sont_celles_de_l_entraineur` dans
  `tools/src/bin/nnue_datagen.rs` et la vérité terrain de
  `tools/src/bin/spsa.rs` ;
- « la même raison », la force de jeu, ne concerne pas ces outils.

`tools/README.md`, « Tests de mutation », dit seulement que la question
est ouverte, et renvoie ici. La phrase d'origine vit aussi en commentaire
de `.github/workflows/mutation.yml` : à corriger avec elle.

Le coût se mesure d'abord : `cargo mutants --list` sur `tools/` donne le
nombre de mutants, et la durée d'un job s'en estime par F-0019.

## Satisfait quand

- [ ] le nombre de mutants de `tools/` est compté, et le choix — l'y faire entrer, en tout ou en partie, ou l'en garder — est écrit avec sa raison
- [ ] `tools/README.md` et le commentaire de `mutation.yml` disent ce choix
