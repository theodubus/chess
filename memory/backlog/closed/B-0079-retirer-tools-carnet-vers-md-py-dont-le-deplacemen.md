<!-- socle: couche=backlog zone=publique -->
# B-0079 — Retirer tools/carnet-vers-md.py, dont le déplacement du carnet est fait

> statut : fait · origine : J-2026-11-23-X · priorité : basse · ref : J-2026-11-24-J · lu : backlog@f779427f

Le script tools/carnet-vers-md.py, retiré le 24 nov. 2026, a converti le carnet de bord, un artefact
claude.ai, au format de la mémoire ; il devait « s'en aller » une fois le
déplacement fait, et ce déplacement est clos (B-0003, B-0031). Aucun sujet
ne portait son retrait : la relecture du troisième critère de B-0078 l'a
relevé (J-2026-11-23-X). Le retirer, c'est retirer le script, sa section de
`tools/README.md` et ce qui le cite ; ou dire pourquoi il reste.

## Fait quand

- [x] le script et sa documentation sont retirés, `engine/tests/outillage_documente.rs` vert, ou une entrée du journal dit pourquoi il reste (retirés, J-2026-11-24-J)
