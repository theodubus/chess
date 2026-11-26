<!-- socle: couche=backlog zone=publique -->
# T-0003 — Découper le balayage de search.rs en morceaux, le verdict sommant les morceaux

> statut : en cours · origine : J-2026-11-23-J · besoin : B-0075 · lu : backlog@b1503ac2

Le job de `engine/src/search.rs` du balayage hebdomadaire a pris 218,
264 puis 208 minutes les 10, 17 et 24 nov. 2026, pour une limite de 350
(F-0019) ; un runner deux fois plus lent que celui du 24 (F-0017) la
dépasserait. Coupé, le job rend un résumé `INCOMPLET` : le verdict casse
et ouvre une issue (le 12 oct., J-2026-10-12 au journal, sous l'ancienne
limite de 180), mais la mesure du fichier est perdue chaque semaine
jusqu'au découpage, qui ne s'écrit pas dans l'urgence.

Le livrable, un commit :

- la matrice de `.github/workflows/mutation.yml` accepte une entrée
  `<fichier> k/n`, un job par morceau, `cargo mutants --shard k/n` (k à
  partir de 0, vérifié au source de cargo-mutants 27.1.0 : `--list`
  applique le découpage, donc le décompte de garde compte le morceau) ;
  `search.rs` en deux morceaux ;
- `.github/mutation-verdict.sh` somme les résumés des morceaux d'un
  fichier, et refuse un ensemble de morceaux incomplet ou ambigu ;
- `.github/mutation-verdict-test.sh` l'éprouve sur des résumés fabriqués ;
- `engine/tests/couverture_mutation.rs` lit le nom du fichier d'une
  entrée découpée, et exige qu'un fichier découpé liste ses morceaux
  `0/n` à `n-1/n`, chacun une fois ;
- la documentation (`CLAUDE.md`, « Sa durée » ; `tools/README.md`) et
  F-0019 suivent.

## Modèle de menace

Ce qui est gardé : un verdict vert ne se rend que si chaque mutant
annoncé de chaque fichier a été essayé, et le compte des survivants d'un
fichier est celui du fichier entier. Les fautes, et ce qui les refuse :

- **un morceau manquant** (job annulé, artefact perdu, entrée oubliée
  dans la matrice) se lirait comme un fichier mieux couvert : le verdict
  exige les `n` morceaux de `0` à `n-1`, sinon « RÉSUMÉ ABSENT » ;
- **un morceau coupé** : son résumé dit `INCOMPLET`, le verdict le lit
  illisible, comme un fichier entier ;
- **des morceaux de deux découpages** (`0/2` et `1/3`) : refusés ;
- **un résumé entier et des morceaux du même fichier** : refusés,
  plutôt que de choisir l'un ;
- **une matrice mal écrite** (`1/2` sans `0/2`, `search.rs` entier et
  découpé) : refusée dès la suite de tests, par
  `engine/tests/couverture_mutation.rs`, sans attendre le mardi.

Hors du modèle : qu'un morceau compte les mutants d'un autre — le source
de cargo-mutants le découpe sur une liste ordonnée, chaque mutant dans un
seul morceau, ce que le décompte de garde de chaque morceau confirmerait
à chaque balayage.

## Fait quand

- [ ] l'auto-test du verdict passe, avec des cas qui somment des morceaux et refusent un morceau absent, coupé, d'un autre découpage, ou doublé d'un résumé entier
- [ ] `engine/tests/couverture_mutation.rs` refuse une matrice aux morceaux incomplets, éprouvé sur une liste fabriquée
- [ ] la matrice découpe `search.rs` en deux morceaux
