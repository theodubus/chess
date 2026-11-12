<!-- socle: couche=backlog zone=publique -->
# B-0005 — Convertir le carnet à blanc

> statut : ouvert · origine : D-0006 · après : B-0001 · priorité : haute · lu : backlog@cbe441c1

Premier lot du déplacement du carnet de bord (B-0003). Théo a décidé le
12 nov. 2026 que le carnet devient **public, sans tri** (D-0006, qui
revient sur le tri qu'il avait d'abord demandé). Ce lot ne déplace rien :
il mesure ce que le déplacement va rencontrer.

Le carnet est un artefact claude.ai de 1,15 Mo, lu par l'outil Artifact ;
son adresse est dans le sujet B-0003.

## Ce qu'il faut faire

- un script qui convertit le carnet en Markdown, rubrique par rubrique,
  sans rien écrire dans la mémoire ;
- compter : les entrées, les octets par rubrique, les références que le
  contrôle des références dirait mortes, les paragraphes que le contrôle
  des copies dirait recopiés de `tools/README.md` ou de `CLAUDE.md` ;
- éprouver sur une branche jetable que le journal accepte des entrées
  datées d'avant les siennes, et que les arbitrages de Théo se posent en
  décisions avec leur citation ;
- dire, d'après ces comptes, comment les lots suivants traitent les
  références mortes et les copies.

## Fait quand

- [x] le rapport chiffré de la conversion est écrit au journal
- [x] les deux essais sur branche jetable sont faits, leur résultat écrit
- [x] le traitement des références mortes et des copies est dit, et posé en demande s'il assouplit un garde-fou
- [x] les constats de la revue du script sont traités (J-2026-11-12-L) : le bandeau du carnet converti et compté, le contrôle de fidélité dans le script (J-2026-11-12-N)
