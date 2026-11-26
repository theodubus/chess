<!-- socle: couche=backlog zone=publique -->
# B-0044 — Mettre à jour le socle, depuis le dépôt conforme

> statut : fait · origine : D-0018 · ref : J-2026-11-26-D · lu : backlog@e26e05e9

Théo, le 17 nov. 2026 : « On fait deja tous les sujets restants puis
ensuite mise à jour du socle » (D-0018, J-2026-11-17-AD). La mise à jour
part d'un dépôt conforme à la version installée (`.socle/engine.lock`),
transition comprise, pour que ce qu'elle change se lise seul.

Le travail du moteur l'attend (D-0016). La marge du budget de
`CLAUDE.md` n'est que d'environ 600 octets : si la section du socle
grossit, relever le budget demandera une demande validée.

Le 23 nov. 2026, Théo a remis la mise à jour : « il reste des correctifs
a faire, le socle n'est pas pret encore » (D-0024, `attendre`). Elle
reprend quand il dira le socle prêt, par un essai à blanc refait sur la
publication qu'il nommera ; celui du 23 nov. et ses constats sont
J-2026-11-23-N.

La marge de `CLAUDE.md`, au 23 nov. 2026 : 64 014 octets pour un plafond
de 65 000, quand la section du socle grossira de 1 244 à cette
publication-là, soit ~260 octets à resserrer de plus. Les trois récits que
D-0024 comptait pour « environ 1 Ko » n'en ont rendu que 412 (B-0078,
J-2026-11-23-T) : le chiffre de la demande était une estimation fausse.

Le 26 nov. 2026, Théo dit le socle prêt et donne son prompt de mise à
jour : elle est faite sur une branche, sa demande D-0028 attend sa réponse,
et Théo fusionne lui-même la pull request (J-2026-11-26-A).

## Satisfait quand

- [x] le socle est à la version que Théo a choisie, et tous les contrôles passent (T-0001, J-2026-11-26-D)
