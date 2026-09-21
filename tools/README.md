# tools

Outillage de mesure. Le moteur se mesure de deux façons, qui ne se remplacent
pas : `bench` mesure le **travail** (nœuds visités), les matchs mesurent la
**force** (Elo).

## Pourquoi un arbitre externe

Un arbitre écrit ici reposerait sur notre compréhension d'UCI — la même qui a
produit le moteur. Il serait aveugle exactement là où le moteur l'est, et une
mesure fausse passerait inaperçue. Deux bugs de cette famille sont apparus
pendant le développement : l'encodage du roque, et un `quit` qui interrompait
la recherche.

D'où **deux arbitres indépendants** (arbitrage A14) :

| | rôle |
|---|---|
| `fastchess` | arbitre de travail. SPRT pentanomial, aucune dépendance de build. |
| `cutechess-cli` | contre-vérification. Implémentation indépendante, dépend de Qt6. |

Les deux sont épinglés sur un commit précis dans `setup-arbiters.sh`. Une
dépendance flottante fait casser la mesure sans qu'aucune ligne de notre code
n'ait changé.

## Mise en place

```sh
tools/setup-arbiters.sh                   # fastchess seul
tools/setup-arbiters.sh --with-cutechess  # + cutechess-cli (installe Qt6)
```

Les binaires atterrissent dans `tools/arbiters/`, qui est ignoré par git.

## Décider si un changement est bon

```sh
cargo build --release
cp target/release/shallowred /tmp/candidat

git worktree add --detach /tmp/ref <commit-de-référence>
( cd /tmp/ref && cargo build --release )
cp /tmp/ref/target/release/shallowred /tmp/reference
git worktree remove /tmp/ref

md5sum /tmp/candidat /tmp/reference   # les deux empreintes doivent différer
tools/sprt.sh /tmp/candidat /tmp/reference
```

> **Jamais `git stash` pour construire une référence.** Il emporte *tout* le
> travail non committé, outils de mesure compris, donc on finit par mesurer
> autre chose que ce qu'on croit. C'est arrivé le 13 sept. 2026 : le stash avait
> aussi remisé la conversion de `bench` de perft vers la recherche, et la mesure
> « avant » comptait des nœuds de perft. Seule l'absurdité du chiffre l'a
> révélé — elle aurait pu ne pas être absurde. Le worktree est isolé et sans
> effet de bord.
>
> **Comparer les empreintes avant de lancer le match.** `cp -p` et `mv`
> préservent les dates de modification, donc cargo peut juger les sources à jour
> et ne rien recompiler : on mesure alors deux fois le même binaire, et le
> rapport rend exactement 1,00.

Le test séquentiel s'arrête dès que les données suffisent et rend
`H1 was accepted` (le changement est bon) ou `H0 was accepted` (il ne l'est
pas). Réglages par variable d'environnement, documentés en tête du script.

Bornes usuelles : `[0, 5]` pour un changement censé gagner, `[-5, 0]` pour
vérifier qu'une simplification ne coûte rien. Ce sont des conventions, pas des
valeurs démontrées pour ce projet.

## Mesurer à cadence longue

Le conteneur de session est éphémère : un processus de fond n'y survit pas à
une mise en veille, et un match de plusieurs heures meurt sans trace. C'est
pourquoi les douze premiers verdicts du projet sont tous à `1+0,01` — **une
contrainte d'outillage prise pour une préférence**.

`.github/workflows/match.yml` lève la contrainte : `workflow_dispatch`, deux
commits en entrée, la cadence en entrée, six heures de plafond, et un résumé
lisible dans l'onglet Actions sans ouvrir le journal.

**Lire d'abord l'étalonnage.** À cadence horloge, une machine plus lente
atteint une profondeur plus faible — donc un autre point de fonctionnement,
exactement la variable qu'on cherche à contrôler. Le job mesure ses propres
nœuds/seconde et les inscrit en tête.

**Mesuré le 16 sept. 2026**, au bench à la profondeur 10, même code moteur :

| où | nœuds/s | profondeur en 250 ms | écart au conteneur |
|---|---|---|---|
| conteneur de session, 8 relevés | 2 280 655 – 2 396 011 | — | — (étendue 5 %) |
| runner `1000002315` | 2 507 861 | 10 | **+8 %** |
| runner `1000002292` | 2 563 044 | *(sonde cassée)* | **+11 %** |
| runner `1000002314` | 2 668 474 | 10 | **+15 %** |
| runner `1000002313` | 3 139 691 | **11** | **+35 %** |

Le runner est plus **rapide** que le conteneur — de **+8 à +35 %, médiane
~+13 %** — et il varie de **25 % d'un runner à l'autre** là où le conteneur ne
varie que de 5 %. **Le 3,14 M est l'extrême, pas la norme**, et c'est pourquoi
deux points ne suffisaient pas à le dire.

**La sonde de profondeur suit bien la vitesse** : 10 à 2,51 et 2,67 M n/s,
**11** à 3,14 M. Première validation qu'elle mesure ce qu'elle prétend. Traduit dans la
seule unité qui compte — le projet a mesuré **1,33 ply par doublement de
temps** — cela vaut **+0,2 à +0,6 ply** : un verdict rendu en CI siège un
demi-ply plus profond que la même cadence nominale mesurée ici. À comparer aux
**4 plies** qui ont inversé le verdict de l'élagage par compte de coups.

Le point de fonctionnement transfère donc en gros, mais la marge n'est pas
négligeable : **ne pas comparer un verdict CI à un verdict local sans regarder
les deux étalonnages.** En revanche **un verdict reste valide en interne quoi
qu'il arrive** — les deux moteurs partagent la machine, donc sa vitesse ne
biaise pas la comparaison ; elle ne déplace que le point de fonctionnement.

### Ce qu'un seul job peut trancher

**Mesuré le 16 sept. 2026**, sur le SPRT d'aspiration à `8+0,08` : 1154 parties
en 1 h 47 min 13 s de jeu, soit **5,57 s par partie** à concurrence 3. Le
plafond du job est de 350 minutes, dont ~70 s de mise en place, donc
**~3 750 parties au maximum**.

Croisé avec la relation de budget du projet (`parties × Elo ≈ 62 000`) :

> **Un job à `8+0,08` tranche les effets de ~17 Elo et plus. En dessous, il
> expire sans verdict.**

L'aspiration (−51,6) a tranché en 1154 parties, C19 (+33,6) en 1608. Les trois
termes d'évaluation (+14,9) tombent **juste sous la ligne**, et c'est le
prochain point de D5.

**Et à `30+0,3`, un job ne tient pas mille parties.** Mesuré le 16 sept. sur le
contrôle de cadence de C19 : **960 parties sur 1000** avant le plafond de
350 minutes, soit ~21,9 s par partie à concurrence 3. L'intervalle rendu est de
**± 15,4 Elo**.

> **Un job à `30+0,3` rend ~960 parties à longueur fixe, soit ± 15 Elo.**
> Demander 1000 parties expire ; en demander 900 tient avec de la marge.

Un match à longueur fixe coupé par le plafond du job **reste exploitable** :
l'arrêt dépend de l'horloge, pas des résultats, donc l'estimateur n'est pas
biaisé. C'est exactement ce qui distingue ce cas d'un **SPRT** expiré, dont la
règle d'arrêt dépend des données et qu'on ne peut ni prolonger ni tronquer sans
perdre ses taux d'erreur.

**Ce qu'on fait quand l'effet est trop petit** : des matchs à **longueur fixe**
sur plusieurs jobs, graines d'ouvertures distinctes, puis mise en commun. Les
échantillons sont indépendants, donc c'est valide ; ça rend une **estimation
d'Elo à intervalle resserré** et non un verdict SPRT — exactement le protocole
qui a servi à établir l'effet de cadence. Ne pas tenter de « reprendre » un
SPRT expiré : un test séquentiel interrompu puis prolongé n'a plus ses taux
d'erreur.

**La profondeur de la sonde prime sur les nœuds/s.** Les nœuds/s sont un
indice de vitesse, la profondeur est le point de fonctionnement lui-même.
La sonde a longtemps rendu 4 au lieu de 11 — le piège du `stdin` refermé,
consigné plus bas — ce qui est la raison pour laquelle les nœuds/s ont servi
de substitut. Elle est réparée : s'en servir.

> **Comment je me suis trompé.** J'ai d'abord annoncé « un runner est deux
> fois plus lent », extrapolé d'un débit de *compilation*. Corrigé en
> « ±10 %, donc ça transfère » — sur la foi d'**un seul runner**. C'est
> caractériser une variance à partir d'un point, la même faute que
> « sept exécutions ne suffisent pas à comparer deux temps », appliquée
> cette fois à la machine au lieu du binaire.

### Le résultat qui a motivé tout ça

**La cadence peut inverser un verdict.** Mêmes binaires, même livre, **même
graine d'ouvertures**, même adjudication, même estimateur — 1000 parties à
longueur fixe de chaque côté. Seule la cadence change :

| protocole | Elo | IC 95 % |
|---|---|---|
| `1+0,01`, SPRT, 2030 parties | −25,20 | [−36,8 ; −13,6] |
| `1+0,01`, longueur fixe, 1000 | **−21,57** | [−38,3 ; −4,9] |
| `8+0,08`, longueur fixe, 1000 | **+15,30** | [+0,2 ; +30,4] |

Écart dû à la cadence : **+36,87 Elo**, z = 3,21, **p = 0,0013**, intervalles
disjoints. Le biais d'arrêt du SPRT — qui s'arrête quand les données sont
extrêmes — ne vaut que **3,6 Elo** : ce n'était pas l'explication.

**Ce que ça impose.** Inscrire la cadence à côté de chaque verdict. Ne jamais
comparer deux verdicts de cadences différentes. Et se demander, avant de
conclure, si la cadence de mesure ressemble au régime où le moteur jouera.

Profondeur médiane atteinte selon le temps par coup, mesurée le 16 sept. 2026
sur douze positions de vraies parties :

| temps par coup | profondeur médiane |
|---|---|
| **1+0,01** — la cadence des douze verdicts | **8,5** |
| ~4+0,04 | 11,5 |
| 8+0,08 — le défaut de `sprt.sh`, jamais utilisé | 12,5 |
| ~15+0,15 | 14,0 |
| ~30+0,3 | **17,0** |

## Vérifier que l'arbitre est fiable

```sh
tools/crosscheck.sh
```

Fait jouer le même match aux deux arbitres et compare. À relancer après toute
modification de la couche UCI.

## Le livre d'ouvertures

`book.epd` — 500 positions, 8 demi-coups, écart d'évaluation ≤ 80 centièmes de
pion. Régénérable :

```sh
cargo run --release --bin bookgen -- 500 8 80 > tools/book.epd
```

Il est **indispensable**, pas décoratif : ShallowRed est déterministe, donc
sans livre toutes les parties d'un match seraient la même partie et
l'échantillon serait de taille un. Le tirage est seedé — même graine, même
livre — parce qu'un livre régénéré différemment invaliderait toute comparaison
avec les mesures antérieures.

## `nnue-probe` — le pari architectural de NNUE

```sh
cargo run --release --bin nnue-probe
```

Répond au benchmark obligatoire de B4 : que coûtent le copy-make et le calcul
du delta d'accumulateur NNUE **à l'extérieur** du `play_unchecked` opaque de
`cozy-chess` ?

L'outil fait deux choses. Il **dérive** les modifications de l'accumulateur du
seul plateau parent et du coup, puis les confronte à la différence réelle entre
les deux plateaux, case par case — la correction est donc établie par
exécution, pas par relecture. Puis il **chiffre** le coût par mesure
différentielle : le même parcours d'arbre est refait avec un copy-make
supplémentaire, puis avec la dérivation, chacun protégé par `black_box`, et
l'on lit le ralentissement. C'est plus honnête qu'une boucle serrée, dont la
localité de cache n'a rien à voir avec celle d'une recherche.

Résultat du 14 septembre 2026, rapporté au coût d'un vrai nœud de recherche
(316,8 ns, mesuré par `bench 7` sur la même machine) :

| | coût marginal | part d'un nœud |
|---|---|---|
| copy-make | 22,8 ns | **7,2 %** |
| dérivation du delta NNUE | 9,0 ns | **2,8 %** |

283 677 coups vérifiés, dont 3 255 roques, 48 prises en passant et 13 628
promotions. Aucun écart. **Conclusion : ni le copy-make ni `cozy-chess` ne
plafonnent le projet du côté de NNUE.**

Deux pièges rencontrés en écrivant cet outil, et qui valent d'être retenus.
Rapporter le coût au parcours d'arbre nu plutôt qu'à un vrai nœud de recherche
donnait +71 % et +28 % — des chiffres vrais répondant à une autre question.
Et la première version allouait un `Vec` par nœud : la dérivation semblait
coûter 25,8 ns au lieu de 9,0, soit 2,8 fois son prix réel.

## Vérifier, et mesurer un temps

Deux scripts existent parce que deux classes de fautes se sont répétées.

`tools/verify.sh` rend **un seul code de sortie** pour fmt, clippy, les tests
debug et release, les critères d'acceptation et le bench. `--rapide` s'arrête
aux trois premiers. Il n'interrompt pas à la première faute : il les exécute
toutes et les rapporte ensemble.

> **Pourquoi** — le 14 sept. 2026, un test échouait en debug et personne ne
> l'a vu : la sortie de `cargo test` avait été filtrée sur « test result » puis
> sommée. La ligne disait `FAILED`, la somme disait 81. Lire une sortie de
> test, c'est se donner une occasion de la lire de travers.

`tools/timing.sh <candidat> <référence> [paires]` compare deux **vitesses**.
Il impose les trois choses qu'on oublie :

1. il **refuse de mesurer** si les deux binaires n'explorent pas exactement le
   même nombre de nœuds — sinon on compare deux arbres, pas deux vitesses ;
2. il mesure à la **profondeur 10**, jamais 7, où le bruit domine ;
3. il **refuse de conclure sous vingt paires** et rend un **test des signes**,
   au lieu d'une comparaison de médianes à l'œil.

> **Pourquoi** — deux fautes, les deux évitables. Un balayage de tailles de
> cache lu à la profondeur 7, dont les chiffres non monotones étaient du bruit
> pur. Et une conclusion tirée de sept exécutions : 5 gagnantes sur 7 et
> −1,2 %. Le même changement, sur 22 paires, donnait 19 sur 22 et −2,1 %.

**Lequel employer.** `sprt.sh` juge un changement de **décision** — la
recherche explore un autre arbre. `timing.sh` juge une **optimisation pure** —
même arbre, même coup, seulement plus vite. Un nombre de nœuds identique est
vérifiable ; un verdict de match est probabiliste. Employer le second quand il
s'applique évite des heures de match pour un chiffre déjà connu.

## Tests de mutation — mesuré le 15 sept. 2026

`cargo mutants` altère le code une mutation à la fois et vérifie que la suite
de tests s'en aperçoit. C'est la seule défense mécanique contre un test creux.

**Le coût, mesuré et non estimé** — le dépôt entier, **1233 mutants en 55
minutes** avec `-j4`. Le moteur seul en produit **986**. Le chiffre annoncé ici
jusqu'au 15 sept. 2026 — « environ 70 minutes pour tout, 55 pour le moteur » —
était une extrapolation depuis un seul petit fichier, et elle était fausse dans
les deux termes : 55 minutes valaient pour *tout*, pas pour le moteur.

**La conclusion** — trop lent pour un pas de CI bloquant. Un contrôle d'une
heure qui bloque une pull request finit par être contourné, et c'est le motif
de désarmement déjà rencontré deux fois sur ce projet. Il tourne donc en
**tâche hebdomadaire** : workflow `Mutation`, mardi 00:00 UTC, un job par
fichier en parallèle.

```sh
cargo install cargo-mutants --locked      # 1 min 11 s
cargo mutants --list                      # décompte, instantané
tools/mutants.sh --file engine/src/tt.rs -j4
```

Le workflow qui l'exécute est `.github/workflows/mutation.yml` ; son verdict
est rendu par `.github/mutation-verdict.sh`, éprouvé par
`.github/mutation-verdict-test.sh`. Le reste de l'outillage automatique — les
deux hooks de `.claude/` et leur auto-test `tools/verify-hooks.sh` — est
décrit dans `CLAUDE.md`, section « Ce qui tourne tout seul ».

**Toujours passer par `tools/mutants.sh`, jamais par `cargo mutants` nu.** Il
prend un verrou exclusif et efface `mutants.out/` avant de partir. Le
15 sept. 2026, deux balayages lancés l'un sur l'autre ont écrit dans le même
`mutants.out/` : `missed.txt` mêlait les survivants de deux versions du code,
avec des numéros de ligne d'un fichier qui n'existait plus. Le verrou rend la
faute inexprimable au lieu de la confier à la vigilance.

### Le cliquet

`.github/mutation-baseline.txt` porte, fichier par fichier, le nombre de
survivants admis. Le job `Verdict` du workflow le confronte au balayage et
**casse à la hausse, signale la baisse**.

L'asymétrie est assumée : un mutant qui expire sur un runner chargé est compté
« expiré » plutôt que « survivant », donc une baisse peut n'être qu'un artefact
de charge machine. Une hausse, elle, ne peut pas l'être — c'est du code
nouvellement non couvert.

Le verdict est un script, `.github/mutation-verdict.sh`, et non des lignes de
YAML : un script ne s'exécutant qu'une fois par semaine sur un runner ne serait
jamais vérifié. `.github/mutation-verdict-test.sh` l'éprouve sur huit cas
fabriqués, et tourne dans `tools/verify.sh` comme dans la CI. Il a trouvé une
faute dès sa première exécution — `attendu[nom]` dans un `$(( ))` évalue la clé
en arithmétique et rend 0, donc l'écart affiché était toujours faux.

**Ce que le balayage ne mesure pas** : la force de jeu. Un survivant portant
sur une valeur d'évaluation, une marge d'élagage ou l'ordre des coups n'est pas
un défaut — le SPRT en juge déjà, et aucun test unitaire ne peut trancher à sa
place. `tools/` est hors du balayage pour la même raison : ce sont des
utilitaires hors ligne, dont la fiabilité se juge par `crosscheck.sh`.

**Ce qu'il a trouvé au premier essai**, sur le plus petit fichier, choisi au
hasard : **6 mutants survivants sur 29**. Dont le plus instructif — inverser
`==` en `!=` dans `repetitions` ne fait tomber aucun des sept tests de
`position.rs`. Vérifié en inversant réellement l'opérateur. La raison est
arithmétique : après quatre demi-coups la fenêtre examinée contient deux
entrées dont exactement une égale au hash cherché, donc les deux opérateurs
comptent 1. **Le test était satisfait par coïncidence.**

C'est exactement la classe de faute que ni la relecture ni la CI n'attrapent,
et elle portait sur la détection de nulle par répétition.

## Vérifier l'échange statique

```sh
cargo run --release --bin datagen 60 6 20260916 > /tmp/corpus.txt
cargo run --release --bin see_check -- 2500 < /tmp/corpus.txt
cargo run --release --bin see_check -- detail 99 < positions.txt   # valeurs d'oracle
```

`see_check` confronte `shallowred::see::see` à un **oracle par force brute** :
une recherche exhaustive des captures sur la seule case visée, jouée par le vrai
générateur de coups. Exacte par construction — elle hérite des clouages, des
découvertes et de la légalité sans qu'on ait à les réécrire.

**Le mode `detail` sert à FIXER la valeur attendue d'un test** au lieu de la
dériver de tête. Quatre des huit premiers tests de `see.rs` étaient faux pour
l'avoir été.

**Écart mesuré le 16 sept. 2026 : 20 sur 4 623 captures, soit 0,43 %** — 18
clouages absolus, 2 échecs à la découverte, **aucune autre cause**. C'est la
limite par construction d'un échange statique, caractérisée et verrouillée par
un test.

## Mesures de référence

**La cadence fait partie du verdict.** Elle est inscrite sur chaque ligne, et
deux verdicts de cadences différentes ne se comparent pas — un même binaire a
rendu −21,6 Elo à `1+0,01` et +15,3 à `8+0,08`. Les lignes sans mention
contraire sont à `1+0,01`, la cadence historique du projet, **où le moteur ne
joue qu'à la profondeur 8,5 alors que la cible est la force générale.**

| date | changement | verdict |
|---|---|---|
| 2026-09-13 | C9 (table de transposition, killers, historique) contre pré-C9 | **H1 accepté** — +164,3 Elo ± 31,3 sur 488 parties, cadence 1+0,01 |
| 2026-09-13 | Élagage par coup nul contre C10 | **H1 accepté** — +75,1 Elo ± 19,7 sur 864 parties, cadence 1+0,01 |
| 2026-09-13 | Réduction des coups tardifs (LMR) contre le coup nul | **H1 accepté** — +69,1 Elo ± 18,3 sur 892 parties, cadence 1+0,01 |
| 2026-09-14 | Fenêtres d'aspiration contre LMR | **H1 accepté** — +29,7 Elo ± 11,9 sur 2042 parties, cadence 1+0,01 |
| 2026-09-14 | Recherche à variante principale (PVS) contre les fenêtres d'aspiration | **H0 accepté** — **−10,9 Elo ± 7,9** sur 4214 parties, cadence 1+0,01. Changement retiré. |
| 2026-09-14 | Mobilité dans l'évaluation | **H1 accepté** — +62,6 Elo ± 17,2 sur 942 parties, cadence 1+0,01 |
| 2026-09-14 | Sécurité du roi, structure de pions et tours sur colonne ouverte, valeurs conventionnelles | **H1 accepté** — +14,9 Elo ± 8,2 sur 4474 parties, cadence 1+0,01 |
| 2026-09-14 | Les mêmes termes, valeurs réglées par ajustement Texel | **H0 accepté** — **−10,0 Elo ± 8,3** sur 5128 parties, cadence 1+0,01. Réglage retiré. |
| 2026-09-14 | Élagage delta en quiescence | **H1 accepté** — +32,5 Elo ± 12,3 sur 1822 parties, cadence 1+0,01 |
| 2026-09-15 | Futilité inverse | **H1 accepté** — +24,3 Elo ± 10,7 sur 2524 parties, cadence 1+0,01 |
| 2026-09-16 | Matériel insuffisant (C20) | **pas de SPRT** — correction d'une évaluation fausse d'un résultat certain, jugée par des tests. Prouvée contre `python-chess` : 0 écart / 37 806 positions. L'arbitre adjuge lui-même ces nulles, donc un match n'aurait rien vu. |
| 2026-09-16 | Élagage par compte de coups (LMP), seuil `6 + d²` | **H0 accepté** — **−25,2 Elo ± 11,6** sur 2030 parties, cadence 1+0,01. Changement retiré. |
| 2026-09-16 | Le même, seuil `12 + d²` (bissection) | **H0 accepté** — **−12,6 Elo ± 8,7** sur 3932 parties, cadence 1+0,01. Changement retiré. |
| 2026-09-16 | **Le même seuil `6 + d²`, à `8+0,08` au lieu de `1+0,01`** | **+15,30 Elo ± 15,08** sur 1000 parties à longueur fixe. **Le signe s'inverse.** Contrôle à `1+0,01`, même protocole : **−21,57 ± 16,71**. Écart +36,9 Elo, z = 3,21, **p = 0,0013**. Voir ci-dessous. |
| 2026-09-16 | **Retrait des fenêtres d'aspiration (D5), à `8+0,08`** | **H0 accepté** — **−51,56 Elo ± 15,67** sur 1154 parties, bornes `[-5, 0]`. Étalonnage du runner : 2 668 474 n/s, profondeur 10. **L'aspiration paie toujours, et bien plus qu'annoncé.** |
| 2026-09-16 | Le même retrait, à `1+0,01` | **H0 accepté** — **−18,91 Elo ± 9,22** sur 3274 parties, bornes `[-5, 0]`. Étalonnage : 2 507 861 n/s, profondeur 10. |
| 2026-09-16 | **Élagage par échange statique en quiescence (C19), à `8+0,08`** | **H1 accepté** — **+33,59 Elo ± 12,00** sur 1608 parties, LLR 2,95 contre 2,94, 54,82 % de score, LOS 100 %. Étalonnage : 3 110 423 n/s, profondeur 11 en 250 ms. 2 h 31 de match. |
| 2026-09-16 | **Le même, à `30+0,3`** | **+18,84 Elo ± 15,41** sur **960 parties** à longueur fixe, LOS 99,19 %. Même graine d'ouvertures, donc apparié au précédent. Étalonnage : 2 557 547 n/s, profondeur 10 — **runner 18 % plus lent que celui du verdict ci-dessus**. |
| 2026-09-21 | **LMP seuil `6 + d²` (C17), à `8+0,08`, sur la base post-C19** | **VERDICT EN COURS** — SPRT `[0, 5]`, candidat `a98a75d` contre `7877340`. [run 35571945707](https://github.com/theodubus/chess/actions/runs/35571945707) |
| 2026-09-21 | **Le même, seuil `12 + d²`** | **VERDICT EN COURS** — [run 35571952457](https://github.com/theodubus/chess/actions/runs/35571952457). Les deux ensemble donnent la bissection **à la cadence qui tranche** ; elle n'existait qu'à `1+0,01`. |
| 2026-09-16 | Échange statique dans l'**ordonnancement** (C19, première moitié) | **PAS DE SPRT, changement retiré.** Effet mesuré sous le seuil de résolution d'un job (~17 Elo) et de signe estimé négatif. Bissection du palier et mesures dans `tools/attic/c19-see-ordering.patch`. |

**Ce que D5 a trouvé, et ce n'est pas ce qu'elle cherchait.** La fiche
supposait une *érosion* : l'aspiration valait +29,7 mesuré avant que l'élagage
delta et la futilité inverse n'existent, et les trois coupent dans le même
arbre. Mesuré : **elle vaut 2,7 fois plus au régime qui compte** — −18,91 à
`1+0,01` contre −51,56 à `8+0,08`, z = 3,52, **p ≈ 0,0004**, intervalles
disjoints. Le verdict d'origine ne la sous-estimait pas d'un peu, il la
sous-estimait presque de moitié.

**C'est la seconde confirmation que la cadence change le verdict**, sur une
autre technique que l'élagage par compte. Les deux formes sont maintenant
mesurées : la cadence **inverse un signe** (LMP, −21,6 → +15,3) ou **multiplie
une magnitude** (aspiration, × 2,7). Le sens est le même — *mesurer court
sous-estime ce dont la valeur croît avec la profondeur*.

**Le nombre de nœuds n'est pas une mesure de force.** Les mesures ci-dessous le
disent, et elles ne s'ordonnent pas de la même façon :

| changement | nœuds | Elo |
|---|---|---|
| table de transposition, killers, historique | ÷ 5,83 | +164 |
| coup nul | ÷ 2,52 | +75 |
| réduction des coups tardifs | ÷ 5,73 | +69 |
| fenêtres d'aspiration | ÷ 1,07 | +30 |
| **recherche à variante principale (PVS)** | **÷ 1,03** | **−11** |
| **mobilité dans l'évaluation** | **× 1,29** | **+63** |
| élagage delta en quiescence | ÷ 1,68 | +33 |
| futilité inverse | ÷ 1,45 | +24 |
| **élagage par compte, seuil 6** | **÷ 1,19** | **−25** |
| **élagage par compte, seuil 12** | **÷ 1,14** | **−13** |
| **fenêtres d'aspiration, remesurées à `8+0,08`** | **÷ 1,048** | **+52** |
| élagage par échange statique en quiescence (C19) | ÷ 1,50 | +34 |

La dernière ligne est le point le plus extrême du tableau : **la plus petite
économie de nœuds, et presque le plus gros gain d'Elo**. Vérifié par exécution
le 16 sept. — 234 370 nœuds à la profondeur 7 sans aspiration contre 223 577
avec. Et c'est la même technique que la quatrième ligne, mesurée à une autre
cadence : ÷ 1,07 → +30 à `1+0,01`. **Le rapport de nœuds n'a pas bougé ; l'Elo
a été multiplié par 1,7.** *(Ces deux nombres datent d'avant C19 : la référence
du bench vaut 148 786 nœuds depuis. Un rapport de nœuds se lit entre les deux
binaires d'une même mesure, jamais contre le chiffre courant.)*

### C18 : la réserve de la fiche est juste, et deux fois plutôt qu'une

La fiche portait que « la quiescence explore déjà tous les coups en échec, donc
une partie du bénéfice est peut-être déjà acquise ». Mesuré sur 400 positions de
parties réelles à la profondeur 10 :

| profondeur restante | nœuds | en échec | part | part de l'arbre |
|---|---|---|---|---|
| quiescence | 36 577 617 | 1 966 681 | 5,38 % | 86,07 % |
| 1 | 4 317 783 | 333 828 | 7,73 % | 10,16 % |
| 2 | 936 076 | 132 902 | 14,20 % | 2,20 % |
| 3 | 353 774 | 68 191 | 19,28 % | 0,83 % |
| ≥ 4 | 312 302 | 57 191 | 18,31 % | 0,74 % |
| **tous** | **42 497 552** | **2 558 793** | **6,02 %** | |

**Ce qui est déjà acquis, et par deux mécanismes distincts.** D'abord, **77 %**
des nœuds en échec sont en quiescence, et celle-ci n'y calcule pas de
`stand_pat` : elle produit *tous* les coups, pas seulement les tactiques. Une
position en échec n'est jamais évaluée statiquement. Ensuite, la condition de
LMR est `quiet && !in_check && child.checkers().is_empty() && …` — le moteur
refuse de réduire **et** les positions en échec **et** les coups qui donnent
échec. Un coup d'échec garde donc sa profondeur pendant que ses frères
tranquilles la perdent : c'est déjà une extension relative.

**Ce qu'il reste, et pourquoi ça ne clôt pas C18.** Les 592 112 nœuds en échec
hors quiescence, soit **1,39 % de l'arbre** — le même ordre de grandeur que la
portée de la futilité inverse (4,4 % des nœuds, +24,3 Elo). Trop grand pour
conclure sans match. **La sonde dimensionne C18, elle ne le tranche pas**, et
c'est la différence avec D2 : le même geste ferme une question et en ouvre une
autre proprement.

<span>Le taux d'échec croît avec la profondeur restante, de 5,4 % à 19,3 %.
<strong>Inférence, non mesurée, confiance moyenne</strong> : LMR ne réduisant pas
les échecs, un nœud en échec garde sa profondeur pendant que ses frères tombent
dans les seaux bas — le gradient serait en partie un effet de la garde de LMR
elle-même. Le vérifier demanderait de compter les nœuds en échec atteints
<em>après</em> réduction, ce que cette sonde ne fait pas.</span>

Sonde dans `tools/attic/c18-sonde-echec.patch`.

### D2 clos sans match : le gatage sur non-PV vaut environ 1 Elo

D2 posait que PVS n'est pas un gain mais un **habilitant** — il crée la
distinction PV / hors-PV, et les moteurs forts n'appliquent LMP qu'aux nœuds
hors PV. On aurait donc rejeté l'habilitant sur sa valeur isolée, puis rejeté
LMP qui en dépend.

**La question qu'il ne fallait pas poser** : « quelle part des nœuds est sur
l'épine PV ? ». L'épine est minuscule *par construction* — au plus un nœud par
ply — donc ce compte ne tranche rien quelle que soit sa valeur. Ce qui compte
est la part des **dégâts** qui s'y trouve.

Mesuré sur 400 positions tirées de parties réelles, profondeur 10, la sonde
n'élaguant pas mais cherchant les coups que LMP aurait coupés :

| | hors PV | sur l'épine PV |
|---|---|---|
| nœuds | 5 890 552 | 29 383 — 0,50 % |
| nœuds où LMP couperait | 998 256 | 8 188 — 0,81 % |
| montées d'`alpha` détruites | 59 184 | **2 331 — 3,79 %** |
| **dégât par coupe** | **5,93 %** | **28,47 %** |

**Le mécanisme de D2 existe** : l'épine est 4,8 fois plus dangereuse par coupe.
**Et il est un ordre de grandeur trop petit** : elle ne porte que 3,79 % des
dégâts. Croisé avec la proportionnalité mesurée par la bissection de C17 —
risque × 0,53 pour un coût × 0,50, droite passant par l'origine — le gatage
vaut environ **1 Elo** sur les 25 que D2 devait expliquer, soit vingt fois sous
ce qu'un job peut trancher.

**La borne, assumée.** L'épine mesurée est « parent PV et premier coup » ; le
vrai PVS ajoute un nœud PV à chaque re-recherche après échec haut, donc 3,79 %
est un **plancher**. Pour renverser la conclusion il faudrait que l'ensemble PV
réel porte ~80 % des dégâts, donc qu'il soit ~20 fois plus grand *en gardant*
son taux de 28 % par coupe. Or c'est la concentration qui rend l'épine
dangereuse et elle se dilue en s'élargissant — hors épine le taux tombe à
5,93 %.

**Ce qui n'est pas réfuté** : que PVS ait une valeur. Il a été rejeté sur ses
propres mérites (−10,9 Elo, 4214 parties, `1+0,01`). Ce qui tombe est la thèse
*spécifique* de D2 — que sa valeur soit d'habiliter LMP.

Sonde et instrumentation dans `tools/attic/d2-sonde-pv.patch`, à appliquer
après `c17-lmp.patch`.

### C17 rouvert : ce que LMP élague, et ce que C19 n'a pas changé

**Un élagage par compte de coups ne coupe que des coups TRANQUILLES.** Sa garde
est `quiet && !in_check && …`, et l'ordonnancement place toutes les captures
avant tous les coups tranquilles. Nœuds déterministes sur la base post-C19 :

| | prof. 7 | prof. 10 | économie gardée |
|---|---|---|---|
| base (C19 seul) | 148 786 | 1 145 406 | — |
| LMP seuil `6 + d²` | 114 028 | 635 210 | 100 % |
| LMP seuil `12 + d²` | 117 561 | 667 488 | **94 %** |

Le genou mesuré le 15 sept. tient : le seuil 12 garde 94 % de l'économie pour
**53 % du risque** (2,0 % des montées d'`alpha` détruites contre 3,8 %). Et
l'économie de LMP est **plus grande qu'avant C19** — ÷ 1,30 à la profondeur 7
contre ÷ 1,19 alors — parce que retirer des nœuds de quiescence rend les
sous-arbres de coups tranquilles une part plus grande de l'arbre.

### C19 : la cadence n'a PAS inversé ce verdict, et c'est un résultat

Les deux cadences tombent du même côté, et il fallait le vérifier plutôt que le
supposer : **cet élagage jette des sacrifices**, donc sa valeur pouvait
décroître avec la profondeur — le seul des deux sens de D1 qu'on n'ait jamais
observé.

| cadence | Elo | IC 95 % | parties | estimateur |
|---|---|---|---|---|
| `8+0,08` | **+33,59** | [+21,6 ; +45,6] | 1608 | SPRT, H1 |
| `30+0,3` | **+18,84** | [+3,4 ; +34,2] | 960 | longueur fixe |

Écart **14,75 Elo, z = 1,48, p = 0,14** — et le SPRT sur-estime d'environ 3,6 Elo
par son biais d'arrêt, ce qui ramène l'écart à 11,2 Elo, z = 1,12, **p = 0,26**.
Les intervalles se recouvrent largement. **Rien ne permet de dire que la valeur
de C19 dépend de la cadence** ; rien ne permet non plus d'exclure une érosion de
l'ordre de 10 Elo, l'effectif à `30+0,3` étant ce qu'il est.

**Ce qu'il ne faut PAS en conclure** : que le contrôle de cadence était inutile.
Un contrôle qui confirme n'est pas un contrôle raté — c'est ce qui distingue
« la cadence n'inverse pas *cette* technique » de « la cadence n'inverse jamais
rien », et seule la première est établie ici. Les deux cas connus d'inversion
(LMP, aspiration) portaient sur des techniques dont la valeur **croît** avec la
profondeur ; C19 coupe du travail, ce qui aide à toute profondeur.

**C19 a ajouté un troisième cas au tableau, avant même son verdict.** L'échange
statique dans l'**ordonnancement** des coups a été bissecté par le palier où
atterrissent les captures perdantes, en nœuds déterministes à la profondeur 10,
référence 1 570 498 :

| palier des captures perdantes | nœuds | vs réf |
|---|---|---|
| après TOUS les coups tranquilles | 2 067 278 | **+31,6 %** |
| entre les killers et les coups tranquilles | 1 672 542 | +6,5 % |
| dans le palier des captures, après les gagnantes | 1 504 134 | −4,2 % |

Le premier palier est **le conseil du manuel** — c'est ce que font les moteurs
modernes — et c'est le pire des trois ici, d'un facteur qui ne laisse aucune
place au doute. Troisième fois que « standard donc bon » se fait démentir sur
ce dépôt, après PVS et après la coupure du manuel dans `see` lui-même.

Et le seul palier qui rétrécit l'arbre **coûte le temps qu'il gagne** : ~836 ms
contre ~812 ms à la profondeur 10, quatre paires gagnantes sur cinq pour la
référence. Les appels à `see` se paient sur **57,2 %** des captures notées.

**Surtout, l'élagage rend l'ordonnancement inutile.** Une fois les captures
perdantes sautées en quiescence, les réordonner n'apporte plus que −1 % de
nœuds pour +1,6 % de temps : 1 145 406 contre 1 133 970. La raison est
structurelle — la quiescence porte 90 % des nœuds, et les captures que
l'ordonnancement déplaçait n'y sont plus recherchées du tout. **Deux
dispositifs que tous les manuels présentent en paire, et le second absorbe le
premier.** C'est pourquoi C19 n'a qu'un seul verdict et non deux.

L'élagage par compte est le cas le plus net du tableau, et il a deux points.
Retirer **19 %** des nœuds coûte 25 Elo ; en retirer **14 %** en coûte 13. Le
coût suit non pas l'économie mais le **risque** : le seuil 6 détruit 3,8 % des
montées d'`alpha`, le seuil 12 en détruit 2,0 % — risque × 0,53, coût × 0,50.
La droite passe par l'origine, et le risque nul est exactement « pas d'élagage
par compte ». **Il n'y a pas de seuil qui paie sur ce moteur.**

Les deux dernières lignes du haut sont les plus instructives. PVS explore **moins** de
nœuds et joue **plus mal**. La mobilité en explore **29 % de plus** et joue
bien mieux. Les trois combinaisons de signes sont désormais représentées : le
nombre de nœuds ne contraint la force dans aucune direction.

Le classement par nœuds et le classement par Elo ne coïncident nulle part. La
fenêtre d'aspiration, qui ne retire que 6 % des nœuds à profondeur 7, rapporte
près de la moitié de ce que rapporte LMR, qui en retire 83 % — parce que son
effet croît avec la profondeur et que 7 est peu, tandis que le nombre de nœuds
se mesure là et nulle part ailleurs. **Un rapport de nœuds est une mesure de
travail à une profondeur donnée, jamais une mesure de force.**

Toutes les mesures ci-dessus emploient les bornes `[0, 5]` avec
`alpha = beta = 0.05`, le livre `book.epd` et la concurrence 3. Le nombre de
parties n'est pas choisi : le SPRT s'arrête quand il a tranché.
