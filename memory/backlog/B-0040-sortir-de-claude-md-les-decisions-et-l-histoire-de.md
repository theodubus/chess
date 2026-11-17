<!-- socle: couche=backlog zone=publique -->
# B-0040 — Sortir de CLAUDE.md les décisions et l'histoire des Invariants du moteur et du Style

> statut : ouvert · origine : J-2026-11-17-O · après : B-0010 · lu : backlog@c791ed30

La relecture de B-0008 (J-2026-11-17-O) l'a relevé : les lots prévus pour
`CLAUDE.md` (B-0008 à B-0010) ne couvrent ni « Invariants du moteur » ni
« Style ». Sans eux, la condition de B-0003, « `CLAUDE.md` ne porte plus
que des règles de travail », ne sera pas remplie.

Ce qu'ils portent encore, qui n'est pas une règle :
- deux décisions de Théo sans décision de la mémoire, dans « Style » :
  l'exception `unsafe` pour le SIMD de l'inférence (20 oct. 2026) et les
  heures écrites à l'heure de Paris (6 oct. 2026) ;
- l'histoire des réseaux, de N5l à N9w50s800, dans l'invariant des
  marges, que F-0008 porte désormais ;
- des mesures datées dans plusieurs invariants, à garder pour la règle
  qu'elles fondent et à renvoyer au journal pour leur récit.

Même méthode que B-0008 : une décision va dans une décision de la mémoire,
le récit au journal, `CLAUDE.md` garde la règle et le renvoi, et un script
vérifie qu'aucun fait chiffré retiré ne se perd. La marge du budget de
`CLAUDE.md` étant mince (132 000 octets), ce lot passe avant tout ajout
qui la ferait déborder.

## Fait quand

- [ ] « Invariants du moteur » et « Style » ne portent plus ni décision sans renvoi, ni histoire
- [ ] chaque fait chiffré retiré se retrouve dans la mémoire ou dans `tools/README.md`, vérifié par un script
- [ ] le budget de `CLAUDE.md` est baissé à sa taille nouvelle
