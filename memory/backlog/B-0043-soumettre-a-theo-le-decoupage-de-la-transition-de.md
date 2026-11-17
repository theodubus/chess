<!-- socle: couche=backlog zone=publique -->
# B-0043 — Soumettre à Théo le découpage de la transition de tools/README.md et du README.md

> statut : ouvert · origine : D-0017 · après : D-0018 · lu : backlog@3ba4e231

La transition de `tools/README.md` (D-0017) et du `README.md` de la
racine touche 1,5 Mo de texte et une cinquantaine de fichiers qui y
renvoient. Ses choix de conception engagent la forme de la mémoire pour
longtemps et coûteraient cher à défaire : ils se soumettent à Théo en une
demande, avant d'écrire (politique, point 3).

Ce que la demande doit trancher, au moins :

- où vont les verdicts (« Mesures de référence ») : un tableau gardé
  dans la documentation des outils, des faits de la mémoire canonique, ou
  le journal ;
- où va le registre des réglages ouverts (ADR-0032) ;
- comment les récits des chantiers rejoignent la mémoire : le journal,
  par entrées datées, ou les archives que le format prévoit, telles
  quelles ; ce choix tranche aussi B-0038, si les archives apparaissent ;
- comment suivent les renvois des autres fichiers, code et tests
  compris ;
- ce que garde le `README.md` de la racine : la ligne du banc
  (`engine/tests/bench_reference.rs`) et la mention d'attribution de
  Leela (ADR-0030) restent ;
- l'ordre des lots et leur taille.

La demande se prépare sur un inventaire mesuré de `tools/README.md`,
section par section, et non de tête.

## Fait quand

- [ ] l'inventaire de `tools/README.md` et du `README.md` est fait, section par section
- [ ] la demande du découpage est posée, et Théo y a répondu
- [ ] les lots de la transition sont au backlog, comme tâches du jalon B-0041
