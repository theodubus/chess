<!-- socle: couche=backlog zone=publique -->
# B-0001 — Sortir tests.creux et memoire.references du mode adoption

> statut : en-cours · origine : J-2026-11-12-A · lu : backlog@e3b0c442

L'installation en mode adoption a mis deux contrôles en avertissement,
`tests.creux` et `memoire.references`, à la clé `warn_only` de
`.socle/guardrails.toml`. Tant qu'ils y sont, toutes leurs erreurs ne font
qu'avertir, les nouvelles comme les quatre trouvées à l'installation : une
référence inventée ou un test creux ajouté demain passerait. Les en
sortir durcit un garde-fou, ce qui est libre : l'agent le fait seul.

## Ce qu'il faut corriger d'abord

- `tools/README.md`, ligne 4074 à l'installation : le dossier des points de
  sauvegarde de l'entraînement, sous `tools/nnue-train/`, est cité comme un
  chemin du dépôt alors qu'il n'existe que sur la machine d'entraînement.
- `tools/README.md`, ligne 17887 à l'installation : un script Python de
  SPSA est cité, qui n'existe pas dans le dépôt ; le binaire est
  `tools/src/bin/spsa.rs`.
- `engine/src/search.rs`, le test `la_recherche_est_deterministe` : son
  assertion compare deux appels identiques, exprès. La marquer voulue, par
  le commentaire que le contrôle attend, avec sa raison.
- `tools/src/bin/spsa.rs`, le test
  `un_tirage_est_deterministe_signe_et_borne` : de même.

Les deux derniers points touchent des fichiers `.rs`, dans leurs tests
seulement : le banc et l'arbre ne changent pas.

## Fait quand

- [x] les deux chemins de `tools/README.md` ne sont plus signalés
- [x] les deux assertions de déterminisme sont marquées voulues, avec leur raison
- [x] `warn_only` ne nomme plus ni `tests.creux` ni `memoire.references`
- [ ] la CI du socle passe sans aucun avertissement d'adoption
