<!-- socle: couche=backlog zone=publique -->
# B-0010 — Sortir de CLAUDE.md les récits des pièges de mesure

> statut : ouvert · origine : D-0002 · après : B-0009 · lu : backlog@f9c44f7b

Sixième lot (B-0003), le plus gros : la section « Pièges de mesure » de
`CLAUDE.md`, environ 53 Ko. Chaque piège garde sa règle, en une à trois
lignes, et cite l'entrée du journal qui porte son récit ; le récit, lui,
part au journal. Risque connu : une règle sans son incident convainc
moins, d'où le renvoi obligatoire. `CLAUDE.md` doit continuer de nommer
`tools/pieges-fermes.md`, qu'un test exige (`engine/tests/pieges_fermes.rs`).

## Fait quand

- [ ] chaque piège de `CLAUDE.md` tient en trois lignes au plus et cite son récit
- [ ] aucun piège n'a disparu : leur compte avant et après est écrit au journal
- [ ] le budget de `CLAUDE.md` est baissé à sa taille nouvelle
- [ ] `tools/verify.sh` passe
