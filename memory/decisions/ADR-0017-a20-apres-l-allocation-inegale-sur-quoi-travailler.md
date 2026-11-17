<!-- socle: couche=decisions zone=publique -->
# ADR-0017 — A20 : Après l'allocation inégale, sur quoi travailler ? (Tranché — fait : la continuation fusionnée)

> statut : acceptée · date : 2026-09-25 · lu : decisions@5eab3148

## Contexte

Arbitrage A20 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet. Entrées de la mémoire lues pour le faire : J-2026-09-25-C@353ef465.

## Décision

**Décision.** **[Décision utilisateur]** Théo, 25 sept. 2026 au matin, après le récapitulatif de ce qui était fait, de ce qui restait et de ce qui demandait un arbitrage : *« Ok pour le raffinement de coups en prochain chantier »*. NNUE, remboursement du ponder et le reste gardent leur place au backlog.

## Conséquences

**Pourquoi lui.** **[Recommandation]** suivie : il sert dans toutes les conditions de jeu, son mécanisme se mesure avant d'écrire, et la génération par étapes (A18) lui a donné sa forme.

**La question posée en même temps.** **[Question ouverte]** NNUE — louer du calcul, ou sa carte graphique ? **[Fait vérifié]** au source : l'entraîneur de référence, bullet (`10e7e82`), n'entraîne que sur GPU ; les runners n'en ont pas, et les conditions de GitHub Actions (`b9578b5`) y permettent la génération des données. Sa carte suffit très probablement pour un premier réseau — mémoire : quelques centaines de Mo, par le calcul ; durée : non mesurée. <s>Restent le modèle de la carte, et lever la règle « pas de runs sur ma machine » : à lui.</s>

**La réponse.** **[Décision utilisateur]** Théo, 25 sept., 08 h 20 : « *ma carte c'est une nvidia rtx 3050 ou 3060 pour pc portable. Elle a 4Go de vram* » ; et « *Mon accord pour lever le pas de run sur ma machine : ok le moment venu si ça permet de débloquer la suite* ». Portée : l'entraînement de B4, rien d'autre. **[Inférence]** Ampere, donc CUDA, donc bullet ; 4 Go suffisent aux premiers réseaux par le calcul — quelques centaines de Mo ; le débit d'une carte de portable reste à mesurer le moment venu. Confiance moyenne, de mémoire, la page de NVIDIA n'étant pas joignable d'ici : le 3060 pour portable porte 6 Go, donc 4 Go désignent plutôt un 3050 ; `nvidia-smi` le dira. Au dépôt : ligne B4 (`6b2429a`).

**Où c'est écrit au dépôt.** `tools/README.md`, en tête de « Ce qui reste à faire, par ordre mesuré », et la ligne B4 pour le matériel NNUE (commits `1c09533`, `6b410d7`).

**Ce qui en est sorti.** **[Mesure]** 25 sept. : **l'historique de continuation, conservé d'un coup à l'autre, +12,56 ± 4,35 Elo à `8+0,08`**, fusionné (PR #83) — la seule des cinq variantes que le rejeu désignait. **[Décision]** Le chantier est au bout de ce que l'écran et le rejeu désignaient ; les quatre autres variantes restent à l'attic. **[Question ouverte]** la suite, à Théo. Journal J-2026-09-25-C.
