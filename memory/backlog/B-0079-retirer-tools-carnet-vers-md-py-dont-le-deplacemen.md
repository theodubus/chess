<!-- socle: couche=backlog zone=publique -->
# B-0079 — Retirer tools/carnet-vers-md.py, dont le déplacement du carnet est fait

> statut : ouvert · origine : J-2026-11-23-X · priorité : basse · lu : backlog@f779427f

`tools/carnet-vers-md.py` a converti le carnet de bord, un artefact
claude.ai, au format de la mémoire ; il devait « s'en aller » une fois le
déplacement fait, et ce déplacement est clos (B-0003, B-0031). Aucun sujet
ne portait son retrait : la relecture du troisième critère de B-0078 l'a
relevé (J-2026-11-23-X). Le retirer, c'est retirer le script, sa section de
`tools/README.md` et ce qui le cite ; ou dire pourquoi il reste.

## Fait quand

- [ ] le script et sa documentation sont retirés, `engine/tests/outillage_documente.rs` vert, ou une entrée du journal dit pourquoi il reste
