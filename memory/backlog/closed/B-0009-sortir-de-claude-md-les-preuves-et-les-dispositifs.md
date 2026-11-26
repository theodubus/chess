<!-- socle: couche=backlog zone=publique -->
# B-0009 — Sortir de CLAUDE.md les preuves et les dispositifs

> statut : fait · origine : D-0002 · ref : J-2026-11-17-R · après : B-0008 · lu : backlog@8a50aca5

Cinquième lot (JA-0001) : les sections « Ce qui compte comme preuve » et
« Ce qui tourne tout seul » de `CLAUDE.md`, environ 38 Ko. La règle de
preuve reste ; les mesures qui l'illustrent deviennent des faits ou vont
au journal ; l'histoire des séries de force quitte le tableau des
dispositifs. Le titre « Ce qui tourne tout seul », présent deux fois, et
les deux commandes de vérification se règlent ici.

Des tests lisent ces sections : le chiffre du banc doit rester dans
`CLAUDE.md` (`engine/tests/bench_reference.rs`), et chaque dispositif
rester nommé dans une documentation (`engine/tests/outillage_documente.rs`).
Changer la valeur attendue de l'un d'eux demande une validation de Théo.

## Satisfait quand

- [x] ces deux sections ne portent plus que des règles et la liste des dispositifs (J-2026-11-17-R)
- [x] chaque fait chiffré retiré se retrouve dans la mémoire ou dans `tools/README.md`, vérifié par un script
- [x] le budget de `CLAUDE.md` est baissé à sa taille nouvelle
- [x] `tools/verify.sh` passe sans qu'aucune valeur attendue d'un test ait changé, ou la demande qui l'autorise est répondue (par `socle verify`, qui lance ces étapes à peu de chose près : le banc à la profondeur 4 au lieu de 7, plus les deux binaires et le balayage vivant)
