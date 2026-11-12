<!-- socle: couche=backlog zone=publique -->
# B-0009 — Sortir de CLAUDE.md les preuves et les dispositifs

> statut : ouvert · origine : D-0002 · après : B-0008 · lu : backlog@8a50aca5

Cinquième lot (B-0003) : les sections « Ce qui compte comme preuve » et
« Ce qui tourne tout seul » de `CLAUDE.md`, environ 38 Ko. La règle de
preuve reste ; les mesures qui l'illustrent deviennent des faits ou vont
au journal ; l'histoire des séries de force quitte le tableau des
dispositifs. Le titre « Ce qui tourne tout seul », présent deux fois, et
les deux commandes de vérification se règlent ici.

Des tests lisent ces sections : le chiffre du banc doit rester dans
`CLAUDE.md` (`engine/tests/bench_reference.rs`), et chaque dispositif
rester nommé dans une documentation (`engine/tests/outillage_documente.rs`).
Changer la valeur attendue de l'un d'eux demande une validation de Théo.

## Fait quand

- [ ] ces deux sections ne portent plus que des règles et la liste des dispositifs
- [ ] chaque fait chiffré retiré se retrouve dans la mémoire ou dans `tools/README.md`, vérifié par un script
- [ ] le budget de `CLAUDE.md` est baissé à sa taille nouvelle
- [ ] `tools/verify.sh` passe sans qu'aucune valeur attendue d'un test ait changé, ou la demande qui l'autorise est répondue
