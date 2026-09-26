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

tools/ref.sh origin/main /tmp/reference      # construit la référence
tools/sprt.sh /tmp/candidat /tmp/reference
```

`tools/ref.sh <commit|branche|tag> [sortie]` remplace la recette manuelle qui
occupait cette place, et pour la même raison que `timing.sh` remplace un
chronomètre à la main : **construire une référence est un geste de quatre
lignes dans lequel ce dépôt a payé quatre pièges distincts**, tous écrits dans
`CLAUDE.md`, aucun encadré par du code. `match.yml` faisait déjà tout cela
correctement sur un runner ; le chemin local n'avait rien — la faute B10, celle
du garde-fou qui ne couvre qu'une copie.

| ce que le script impose | le piège qu'il ferme |
|---|---|
| `git fetch --prune`, jamais `git fetch <remote> <branche>` | une référence de suivi survit à la suppression de sa branche après fusion et désigne le commit d'*avant* — deux fausses alarmes le 22 sept. 2026 |
| confrontation de la résolution locale à `git ls-remote`, et **refus** de construire si elles diffèrent | `origin/main` figé onze commits en arrière dans le clone : binaire neuf, code juste, **arbre trois fois trop gros**. C'est le seul des quatre qui a faussé une mesure publiée |
| `git worktree add --detach`, jamais `git stash` | le stash emporte *tout* le travail non committé, outils de mesure compris. Le 13 sept. 2026 il avait remisé la conversion de `bench` de perft vers la recherche, et la mesure « avant » comptait des nœuds de perft |
| `cp` et non `cp -p`, et l'empreinte md5 imprimée | les dates préservées font juger les sources à jour par cargo, qui ne recompile rien : on mesure deux fois le même binaire et le rapport rend exactement 1,00 |

Nommer une branche veut dire « ce qu'elle porte **maintenant** ». Pour
construire un commit plus ancien de cette branche, passer le SHA : c'est
explicite, et ça ne déclenche pas le contrôle de fraîcheur.

`tools/ref-test.sh` éprouve `ref.sh` sur des dépôts fabriqués — un « distant »
nu et un clone dont la branche locale reste en arrière — et tourne dans
`tools/verify.sh` pour une demi-seconde, sans compiler quoi que ce soit. Sans
lui, la branche qui compte ne s'exécuterait qu'en cas de catastrophe, donc
jamais en conditions vérifiables : c'est l'argument de
`.github/mutation-verdict-test.sh`, qui avait trouvé une faute à sa première
exécution. Éprouvé en le faisant échouer : `if false` à la place du contrôle de
fraîcheur fait tomber deux cas.

`sprt.sh` et `timing.sh` refusent désormais deux binaires d'empreinte
identique. Le contrôle existait sur le runner depuis la création de
`match.yml` et manquait en local ; c'était la même faute, un cran plus haut —
*un garde-fou qui ne couvre qu'une copie ne garde rien* vaut pour les
garde-fous comme pour les chiffres.

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

### Remesuré le 21 sept. 2026 — la dispersion est plus large, et un piège apparaît

**Deux runners, le MÊME binaire (`6bf13fa`), le même jour :**

| où | nœuds/s | profondeur en 250 ms |
|---|---|---|
| conteneur de session, 3 relevés | 1 579 651 – 1 641 338 | — |
| runner `1000002450` (match C12) | **2 067 101** | 11 |
| runner `1000002435` (match C18) | **3 268 241** | **12** |

**58 % d'écart entre les deux runners** (× 1,581), contre les 25 % inscrits
ci-dessus. La dispersion est donc plus large que le projet ne le croyait, et
c'est la **troisième** fois que ce chiffre est révisé — après « deux fois plus
lent », puis « ±10 % », puis « 25 % ».

**Et le piège, qui est neuf.** Le conteneur rendait 2 280 655 – 2 396 011 n/s
le 16 sept. et 1 579 651 – 1 641 338 aujourd'hui : **−32 %**. La machine n'a
pas ralenti — **C19 et C17 ont rendu chaque nœud plus cher.** Un nombre de
nœuds par seconde appartient donc à SON BINAIRE autant qu'à sa machine.

> **Une ligne d'étalonnage ne compare que des runs du même binaire.** Croiser
> l'étalonnage d'un run de septembre avec celui d'un run d'aujourd'hui compare
> deux moteurs et une machine à la fois, et le résultat ne veut rien dire. La
> profondeur atteinte en 250 ms, elle, reste directement lisible : c'est le
> point de fonctionnement réel, quelle que soit la version.

C'est la même famille que « vérifier le dénominateur » : un chiffre vrai,
mesuré correctement, qui ne répond pas à la question qu'on lui pose.

**La sonde de profondeur suit bien la vitesse** : 10 à 2,51 et 2,67 M n/s,
**11** à 3,14 M. Première validation qu'elle mesure ce qu'elle prétend. Traduit dans la
seule unité qui compte — le projet a mesuré **1,36 pli par doublement de
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

Croisé avec la relation de budget du projet (`parties × Elo`, médiane 59 256
sur dix-huit SPRT — voir plus bas) :

> **Un job à `8+0,08` tranche les effets de ~17 Elo et plus. En dessous, il
> expire sans verdict.**

L'aspiration (−51,6) a tranché en 1154 parties, C19 (+33,6) en 1608.

**L'Elo qu'on met dans cette division appartient lui aussi à une cadence.** Ces
lignes portaient que les trois termes d'évaluation, « +14,9 », tombaient *juste
sous la ligne* : 59 500 ÷ 14,9 = 3 993 parties, au-dessus du plafond de 3 750,
donc un job qui expire sans verdict. **Mesuré le 22 sept. : verdict rendu en
1 580 parties** — parce que l'effet à cette cadence-là ne vaut pas +14,9 mais
**+37,5**, et que 59 500 ÷ 37,5 = 1 585. La relation de budget n'était pas en
cause ; son **entrée** l'était.

> **Un budget de job estimé depuis un verdict à `1+0,01` est un MAJORANT, pas
> une estimation.** Tout ce dont la valeur croît avec la profondeur tranchera
> plus vite qu'annoncé. Ne jamais renoncer à un match à cadence longue sur la
> seule foi d'un effet mesuré court.

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

## Ce que `tools/src/bin/` contient

Tous hors ligne : aucun n'est appelé par le moteur, et aucun ne change sa
force. Leur compte n'est pas écrit : il vit dans la table. Ils sont nommés ici **avec leur extension**, parce que c'est
ce que `engine/tests/outillage_documente.rs` confronte au répertoire.

| binaire | ce qu'il fait |
|---|---|
| `bookgen.rs` | génère le livre d'ouvertures EPD, de façon reproductible. Sans livre, le moteur étant déterministe, toutes les parties d'un match sont la même partie |
| `datagen.rs` | produit le corpus `FEN;résultat` de l'ajustement Texel, étiqueté par le **résultat de la partie** et jamais par le score de l'évaluation. Sert aussi à tirer des positions de vraies parties pour toute sonde |
| `tune.rs` | l'ajustement Texel lui-même. Son verdict a été **rejeté** (−9,96 Elo) ; l'outil reste parce qu'il resservira avec un corpus plus grand |
| `nnue_probe.rs` | le benchmark obligatoire de B4 : ce que coûtent le copy-make (7,2 %) et la dérivation du delta d'accumulateur NNUE (2,8 %) en part du temps d'un nœud |
| `nnue_datagen.rs` | les données d'entraînement NNUE (A21) : parties d'auto-jeu à nœuds fixes, au format `viriformat` que lit bullet, **écrit par la crate de référence** et jamais réimplémenté. Lancé sur runner par `.github/workflows/nnue-datagen.yml`, un artefact par job |
| `see_check.rs` | confronte l'échange statique à un oracle par force brute. Il a trouvé un **bug du manuel** au premier passage — 27 valeurs fausses sur 771 |
| `attack_dump.rs` | confronte la géométrie d'attaque de `see::least_valuable_attacker` à `python-chess`, case par case |

> **Ce répertoire était le trou d'un garde-fou, et il l'a laissé passer deux
> fois.** `outillage_documente.rs` balayait `tools/` pour les `.sh`
> **uniquement**, donc il n'a jamais regardé les binaires. Le 22 sept. 2026,
> trois sondes jetables y ont été déposées : **cargo découvre `src/bin/*.rs`
> tout seul**, donc elles ont été compilées sans être ni déclarées dans
> `tools/Cargo.toml` ni documentées — et l'arbre a cessé de compiler dès que
> l'instrumentation qu'elles importaient a été retirée. En bouchant le trou on
> découvre que **cinq des six binaires n'étaient nommés nulle part**, dont
> `attack_dump.rs` depuis sa création.
>
> Même famille que Q4, où `see.rs` est resté cinq jours hors du cliquet de
> mutation : *le garde-fou était correct et gardait le mauvais ensemble*. La
> question n'est pas « ce dispositif marche-t-il ? » mais **« quelle est sa
> source de vérité, et est-ce la bonne ? »** — ici le répertoire que cargo
> compile, jamais la liste qu'on a en tête.
>
> **`attack_dump.rs` et `see_check.rs` vivaient par autodécouverte** jusqu'au
> 23 sept. 2026, contrairement aux quatre autres. Ils sont désormais déclarés,
> et surtout `tools/Cargo.toml` porte **`autobins = false`** : un fichier
> déposé dans `src/bin/` **n'est plus compilé tant qu'il n'a pas sa section
> `[[bin]]`**. Déposer une sonde redevient un acte délibéré, et l'oublier ne
> coûte plus un arbre cassé — ce qui est précisément arrivé le 22 sept.
>
> Éprouvé dans les deux sens : un fichier délibérément non compilable laisse
> le build vert tant qu'il n'est pas déclaré, et rend deux erreurs dès qu'il
> l'est. Le second sens compte autant que le premier — un mécanisme qui avale
> tout passerait le premier test sans rien garder.
>
> **Les deux dispositifs sont complémentaires, aucun ne remplace l'autre** :
> `autobins = false` empêche la compilation accidentelle,
> `engine/tests/outillage_documente.rs` empêche le binaire qui dort sans que
> personne sache ce qu'il fait.

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
| 2026-09-21 | **C18 — extension d'échec, à `8+0,08`** | **PAS UN GAIN — −5,01 Elo ± 8,11**, 3400 parties à longueur fixe, 49,28 % de score, LOS 11,3 %, Ptnml [130, 351, 761, 354, 104]. [run 35613044990](https://github.com/theodubus/chess/actions/runs/35613044990), candidat `4f881aa` contre `6bf13fa`, graine 20260913. Étalonnage : **3 268 241 n/s, profondeur 12** — le plus rapide des runners mesurés à ce jour. L'intervalle contient zéro et le point estimé est négatif. **Non fusionné**, code dans `tools/attic/c18-extension-echec.patch`. Banc du candidat : 131 977 nœuds (×1,16). |
| 2026-09-21 | **C12 — PVS réécrit, à `8+0,08`** | **PAS UN GAIN NON PLUS, mais plus du tout un coût — −0,82 Elo ± 8,19**, 3400 parties à longueur fixe, 49,88 % de score, LOS 42,2 %, Ptnml [130, 319, 810, 311, 130]. [run 35616375595](https://github.com/theodubus/chess/actions/runs/35616375595), candidat `35548f2` contre `6bf13fa`, graine 20260913. Étalonnage : **2 067 101 n/s, profondeur 11**. **Non fusionné**, code dans `tools/attic/c12-pvs-2026-09-21.patch`. Banc du candidat : 106 820 nœuds (÷1,07). |
| 2026-09-21 | **LMP seuil `6 + d²` (C17), à `8+0,08`, sur la base post-C19** | **H1 accepté** — **+22,85 Elo ± 9,88** sur 2436 parties, LLR 2,95, 53,28 % de score, LOS 100 %. Étalonnage : 2 508 824 n/s, profondeur 11. 3 h 47 de match. **Retenu.** |
| 2026-09-21 | **Le même, seuil `12 + d²`** | **H1 accepté** — **+17,24 Elo ± 8,51** sur 3368 parties, LLR 2,96, 52,48 % de score. Étalonnage : 2 579 292 n/s, profondeur 11. 5 h 09 de match. |
| 2026-09-22 | **D5 — retrait des trois termes d'évaluation (sécurité du roi, structure de pions, tours sur colonne ouverte), à `8+0,08`** | **H0 accepté** — **−37,53 Elo ± 13,40** sur 1580 parties, bornes `[-5, 0]`, LLR −2,95, 44,62 % de score, LOS 0,00 %, Ptnml [121, 155, 344, 113, 57]. [run 35692850670](https://github.com/theodubus/chess/actions/runs/35692850670), candidat `adcbd14` contre `091e75e`, graine 20260913. Étalonnage : **2 177 503 n/s, profondeur 11**. 2 h 32 de match. **Les trois termes valent 2,5 fois le +14,9 mesuré à `1+0,01`.** Banc du candidat : 88 495 nœuds (÷ 1,29). |
| 2026-09-22 | **D5 — retrait de l'élagage delta, à `8+0,08`** | **PAS DE VERDICT — SPRT tué par le plafond du job** à 3 738 parties. Retrait : **−1,49 Elo ± 7,83**, IC `[−9,3 ; +6,3]`, 49,79 % de score, **LLR 0,06 sur ±2,94**, Ptnml [141, 373, 851, 369, 135]. [run 35714977914](https://github.com/theodubus/chess/actions/runs/35714977914), candidat `cbaa8d4` contre `a57c835`, bornes `[-5, 0]`, graine 20260913. Étalonnage : **2 324 708 n/s, profondeur 12**. **Ne pas lire comme un verdict** : un SPRT arrêté par l'horloge est conditionné à n'avoir pas touché ses bornes, donc biaisé vers zéro. Ce qui est établi, c'est que l'effet n'a **rien à voir avec les +32,5 Elo** du verdict de `1+0,01` — celui-là aurait tranché vers 1 825 parties. L'élagage **reste dans `main`**. Banc du candidat : 138 458 nœuds (× 1,21). |
| 2026-09-16 | Échange statique dans l'**ordonnancement** (C19, première moitié) | **PAS DE SPRT, changement retiré.** Effet mesuré sous le seuil de résolution d'un job (~17 Elo) et de signe estimé négatif. Bissection du palier et mesures dans `tools/attic/c19-see-ordering.patch`. |
| 2026-09-23 | **C21 — défaut de `movestogo` de 30 à 12, à `8+0,08`** | **+19,13 Elo ± 6,31** sur 6 000 parties à longueur fixe, deux matchs mis en commun, zéro perte au temps. **Fusionné.** Le SPRT qui l'avait précédé avait expiré à +14,59 ± 8,31 — un minorant, et c'en était un. Section « C21 — VERDICT ». |
| 2026-09-24 | **C22 sur C23 — le test de nulle avant la quiescence, sans les fausses nulles, à `8+0,08`** | **+3,98 ± 6,26** en commun sur 5 758 parties — mais deux matchs hétérogènes, **+10,86 ± 8,91** et **−2,90 ± 8,80** (z = 2,15, runners étalonnés à 0,3 % près). Aucune borne haute sous zéro dans aucune lecture : **FUSIONNÉ au titre de la règle**, aucun gain revendiqué. Avertissements « PV continues after » : 85 et 94 à la référence, 4 et 3 au candidat. Section « C22 sur C23 — VERDICT ». |
| 2026-09-24 | **Calibration — un doublement de temps, même binaire, `16+0,16` contre `8+0,08`** | **+107,74 Elo ± 8,19** sur 3 800 parties à longueur fixe (deux matchs homogènes, z = 0,19 ; +108,54 et +106,94), zéro anomalie ; **+1,38 ± 0,28 pli** en partie (sonde de 100 parties). **Soit 60 à 105 Elo par pli** à `8+0,08`, bornes croisées. Étalonnages : EPYC 7763 2 192 324 n/s et EPYC 9V74 2 020 660 n/s, profondeur 12 |
| 2026-09-24 | **B6 — Lazy SMP, deux fils contre un, même binaire (`65d0b03`), à `8+0,08`** | **+42,16 Elo ± 9,23** sur 2 700 parties à longueur fixe — trois matchs homogènes (+35,64, +49,36, +41,50 ; \|z\| ≤ 1,19), une partie à la fois, zéro anomalie — **contre notre jumeau monofil**. Borne basse > 0 : **deux fils rapportent**, sur le critère écrit avant, et dans l'attendu écrit avant les matchs (+24 à +59). Converti par l'étalon : **0,31 à 0,86 pli** ; la sonde en mesurait +0,48 ± 0,08 en partie |
| 2026-09-24 | **A18 — génération par étapes (`087edb8`) contre son parent (`d01183d`), à `8+0,08`** | **+23,10 Elo ± 6,39** sur 5 740 parties à longueur fixe — deux matchs homogènes (+27,81 et +18,36 ; z = 1,45), zéro anomalie. Borne basse > 0 : **gain démontré, FUSIONNÉ** sur le critère écrit avant, au haut de l'attendu écrit avant (+6 à +25). La sonde en mesurait n/s × 1,09 et +0,17 ± 0,07 pli : **70 à 295 Elo par pli**, bornes croisées |
| 2026-09-24 | **C24 — laisser finir l'itération entamée (`7274844`) contre son parent (`7fc5959`), à `8+0,08`** | **+44,64 Elo ± 6,24** sur 5 760 parties à longueur fixe — deux matchs homogènes (+45,01 et +44,27 ; z = 0,12), deux runners différents, zéro anomalie. Borne basse > 0 : **gain démontré, FUSIONNÉ** sur le critère écrit avant. **Profondeur moyenne inchangée** (sonde : −0,00 ± 0,09 pli) : des deux lectures écrites avant le match, celle des plis moyens (+2 à +7) tombe, celle de l'accord avec l'oracle (+39 à +68) tient |
| 2026-09-24 | **C25 — une échéance douce par stabilité du coup, la dure à 3 budgets (`41d590f`), contre son parent (`910a6c9`), à `8+0,08`** | **+7,87 Elo ± 6,08** sur 5 740 parties à longueur fixe — deux matchs homogènes (+8,45 et +7,29 ; z = 0,19), deux runners différents, zéro perte au temps. Borne basse > 0 : **gain démontré, FUSIONNÉ** sur le critère écrit avant. **Sous l'attendu** (+12 à +25, converti au taux de C24) : **22 à 46 Elo par pli d'accord** au point, contre ~69 pour C24 — l'écran surestime davantage une règle qui cible les coups instables, ce que sa réserve disait |
| 2026-09-25 | **C26 — la dure bornée à l'approche d'un contrôle annoncé (`6daf7d7`) contre son parent (`4620495`), à `40/8`** | **+2,43 Elo ± 6,01** sur 6 000 parties à longueur fixe — deux matchs homogènes (+4,98 et −0,12 ; z = 0,83), zéro perte au temps. **Correctif** : aucune borne haute sous zéro, **FUSIONNÉ au titre de la règle** — le mécanisme mesuré en partie (5,3 % de cycles affamés avant, aucun après), dans l'attendu écrit avant (0 à +5), sous la puissance dite d'avance (± 6). Première mesure du projet à une cadence à coups comptés ; sans `movestogo`, rien ne change |
| 2026-09-25 | **A20 — l'historique de continuation, conservé d'un coup à l'autre (`54e6c60`), contre son parent (`a08af76`), à `8+0,08`** | **+12,56 Elo ± 4,35** sur 11 620 parties à longueur fixe — quatre matchs homogènes (+14,26, +11,75, +15,83, +8,45 ; plus grand écart z = 1,17), deux Xeon 8370C et deux EPYC 7763, profondeur 12 partout, zéro perte au temps. Borne basse > 0 : **gain démontré, FUSIONNÉ** sur le critère écrit avant, dans l'attendu écrit avant (0 à +15) et **au-dessus de ce que l'arbre seul promettait** (+4 à +7, pour −3,1 % de nœuds) : le canal des décisions est positif. Première mesure du projet à quatre jobs, sur une puissance calculée avant |
| 2026-09-25 | **C27 — l'élagage par distance au mat (`bb6e4c0`) contre son parent (`3aa5986`), à `8+0,08`** | **−3,56 Elo ± 5,97** sur 5 760 parties à longueur fixe — deux matchs homogènes (−1,92 et −5,22 ; z = 0,54), zéro perte au temps. **Correctif** : aucune borne haute sous zéro (+2,41 en commun, +6,24 et +3,50 par match), **FUSIONNÉ au titre de la règle** — le mécanisme mesuré en partie (1,82 % des recherches stockaient un score hors de ±MATE), l'attendu écrit avant (0 à +3) dans l'intervalle, sous la puissance dite d'avance (± 6) |
| 2026-09-23 | **Vol de CPU du ponder sur runner — deux sondes de 60 parties, à `8+0,08`** | **r = 0,948** (rapport des n/s 0,950 en ponder, 1,002 au témoin) ≥ 0,93 : **le verdict du ponder tient**, sur la règle écrite avant. Vol estimé 3 à 5 % de vitesse, 3 à 10 Elo des +67,63. **Topologie : 2 cœurs physiques, 2 fils par cœur (AMD EPYC 7763)**. [run 35933841290](https://github.com/theodubus/chess/actions/runs/35933841290), [run 35933844087](https://github.com/theodubus/chess/actions/runs/35933844087). Section « Vol de CPU du ponder sur runner — VERDICT ». |
| 2026-09-23 | **C22 — le test de nulle avant l'aiguillage vers la quiescence, à `8+0,08`** | **−10,44 Elo ± 6,34** sur 5 760 parties — **régression, non fusionné**, arrêté par son critère écrit avant. 92 % des nulles qu'il ajoutait à l'horizon étaient fausses (C23) : **remesuré sur C23, en vol**. Section « C22 — VERDICT ». |
| 2026-09-23 | **B9 — effet de capacité de la table à entrées atomiques, à `8+0,08`** | **−1,27 Elo ± 6,34** sur 5 740 parties — pas d'effet décelable. **Fusionné au titre de l'infrastructure** (la table se partage entre fils ; −4,3 % de temps déjà prouvé). Section « B9 — VERDICT ». |
| 2026-09-23 | **Ponder activé pour un seul camp, même binaire, à `8+0,08`** | **+67,63 Elo ± 9,19** sur 2 700 parties (cutechess, une partie à la fois), zéro anomalie — **contre notre jumeau**, donc un chiffre qui appartient à son adversaire. Le ponder reste désactivé par défaut ; l'interface l'active. Section « Ponder — VERDICT ». |
| 2026-09-23 | **C23 — la fenêtre de répétition bornée au dernier coup nul, à `8+0,08`** | **+2,65 Elo ± 6,40** sur 5 760 parties — pas d'effet décelable, **fusionné au titre de la règle** : 87,8 % des répétitions que voyait la recherche étaient fausses. Section « C23 — VERDICT ». |

**Ce que D5 a trouvé, et ce n'est pas ce qu'elle cherchait.** La fiche
supposait une *érosion* : un acquis mesuré tôt, à une cadence courte et sur une
base pauvre, devait valoir moins une fois empilé avec les mécanismes venus
après. **Trois acquis remesurés : deux valent PLUS, et le troisième a bel et
bien fondu.**

| acquis | verdict d'origine | remesuré à `8+0,08` | rapport |
|---|---|---|---|
| fenêtres d'aspiration | +29,7 (`1+0,01`) | **−51,56 ± 15,67** au retrait | **× 2,7** |
| sécurité du roi + structure de pions + tours sur colonne ouverte | +14,9 (`1+0,01`) | **−37,53 ± 13,40** au retrait | **× 2,5** |
| **élagage delta en quiescence** | +32,5 (`1+0,01`) | **−1,49 ± 7,83** au retrait, **sans verdict** | **~ × 0,05** |

Pour l'aspiration le contrôle est apparié : le même retrait, mesuré aux deux
cadences le même jour, rend −18,91 à `1+0,01` contre −51,56 à `8+0,08`,
z = 3,52, **p ≈ 0,0004**, intervalles disjoints.

> **Pour les trois termes, la cadence et la BASE ont changé ensemble.** Le
> +14,9 date du 14 sept., avant l'élagage delta, la futilité inverse, l'échange
> statique en quiescence et l'élagage par compte de coups ; le −37,53 est
> mesuré au-dessus de tous. Les deux causes sont donc **confondues**, et ce
> point ne peut pas être attribué à la cadence seule. Les séparer demanderait
> un contrôle apparié à `1+0,01` sur la base actuelle — un job de plus, pour
> une question d'imputation et non de décision. *La décision, elle, ne dépend
> pas de l'imputation : les termes restent, et ils valent plus cher qu'écrit.*

**La cadence change le verdict, et les deux formes sont mesurées** : elle
**inverse un signe** (LMP au seuil 6, −21,6 → +15,3 ; le seuil 12 bascule
aussi) ou **multiplie une magnitude** (aspiration × 2,7, trois termes × 2,5).

> <s>Le sens ne s'est jamais inversé — *mesurer court sous-estime ce dont la
> valeur croît avec la profondeur*.</s> **Nuancé le 22 sept. 2026 : un acquis
> a perdu de la valeur en étant remesuré.** L'élagage delta passe de +32,5 à
> un effet indistinguable de zéro.
>
> **Mais ce point n'est PAS un contre-exemple à la règle de cadence, et il ne
> faut pas le compter comme tel.** Les deux causes y sont confondues, comme
> pour les trois termes : entre les deux mesures, la cadence a changé ET la
> base a gagné l'échange statique, qui coupe les mêmes objets au même endroit.
> L'écran en nœuds impute la moitié de l'écart à ce recouvrement.
> <span><strong>Inférence, confiance moyenne</strong> : ce que ce point réfute
> est « aucun acquis remesuré n'a perdu de valeur », pas « mesurer court
> sous-estime ». Le séparer demanderait un contrôle apparié à `1+0,01` sur la
> base actuelle — et cette fois l'imputation changerait quelque chose, parce
> qu'elle dirait si l'érosion vient de l'empilement ou du régime.</span>

### C21 — le SPRT a EXPIRÉ, et il a rendu un chiffre quand même

**Le run est mort au plafond**, pas sur une frontière : [run
35784289654](https://github.com/theodubus/chess/actions/runs/35784289654),
annulé à 02 h 54 UTC le 23 sept. après exactement 350 minutes. Candidat
`ebe93ad` (défaut de `movestogo` 30 → 12) contre `6d5e7c6`, bornes `[0, 5]` à
`8+0,08`, graine `20260913`. **3262 parties lancées**, aucune frontière LLR
atteinte.

**C'est le risque qui avait été énoncé avant le lancement**, mot pour mot :
*« si l'effet réel est sous ~18 Elo, le SPRT expire »*. Il l'était.

#### Ce que le dernier bloc complet donne — 3240 parties

| grandeur | valeur |
|---|---|
| **Elo** | **+14,59 ± 8,31** |
| nElo | +21,04 ± 11,96 |
| LOS | **99,97 %** |
| score | 1168 V / 1032 D / 1040 N, **52,10 %** |
| Ptnml(0-2) | [97, 284, 766, 332, 141] |
| **LLR** | **2,48 sur 2,94, soit 84,2 %** du chemin vers H1 |
| étalonnage du runner | **3 427 286 n/s, profondeur 12 en 250 ms** |

**L'étalonnage est le plus rapide jamais relevé sur ce projet** — l'étendue
connue allait de 2 067 101 à 3 268 241 n/s. Une ligne d'étalonnage ne compare
que des runs du même binaire ; celle-ci est à lire avant toute comparaison
entre ce run et un autre.

**Contrôle de vraisemblance, et il passe** : `parties × Elo` = 3240 × 14,59 =
**47 272**, contre une médiane de 59 256 et une étendue de 45 900 à 80 200 sur
dix-huit SPRT. Le point tombe dans le bas de l'étendue, donc rien ne sent le
protocole cassé.

**Le contrôle qui comptait plus que l'Elo** : <span>zéro perte au temps, zéro
incident — vérifié sur les parties **1356 à 3259**, soit 1904 parties et 58 %
du match. <strong>Le début n'a pas pu être lu</strong> : l'API de journaux
plafonne à 5000 lignes et ne sert que la fin. Les fins de partie sont toutes
ordinaires (adjudication, répétition, matériel insuffisant, cinquante coups,
mat, pat) — aucune anomalie.</span> Le balayage préalable avait déjà rendu zéro
perte au temps **aux deux cadences et jusqu'au diviseur 10**, plus agressif que
le 12 livré.

#### Pourquoi on ne reprend pas ce SPRT

**Un test séquentiel interrompu puis prolongé n'a plus ses taux d'erreur.**
C'est écrit dans `CLAUDE.md` et ce n'est pas négociable : reprendre à 3262
parties pour « aller chercher les 16 % manquants » fabriquerait un verdict dont
α et β ne valent plus rien.

**Et l'estimation d'un SPRT expiré est biaisée vers zéro** : l'échantillon est
conditionné à n'avoir jamais franchi ±2,94, ce qui tronque les extrêmes. Le
vrai effet est donc plausiblement **au-dessus** de 14,59. <span>Inférence,
confiance moyenne.</span>

**Un seul job ne peut pas conclure sur cet effet.** Le budget vaut
59 256 ÷ 14,59 ≈ **4 060 parties**, et ce runner — le plus rapide mesuré — en a
fait 3262 en 350 min, soit 6,44 s par partie. Il faudrait ~436 min. La règle du
projet le prévoyait : *en dessous de ~17 Elo, passer à des matchs à longueur
fixe sur plusieurs jobs et les mettre en commun.*

### C21 — VERDICT, 23 sept. 2026 : +19,13 ± 6,31 Elo à `8+0,08` sur 6 000 parties

Le défaut de `movestogo` passe de trente à douze. **Deux matchs à longueur
fixe, mis en commun par `tools/mettre-en-commun.sh`** — jamais un SPRT, la
règle du dépôt.

| run | graine | parties | Elo | Ptnml | étalonnage |
|---|---|---|---|---|---|
| [35822658045](https://github.com/theodubus/chess/actions/runs/35822658045) | `20260923` | 3000 | +14,72 ± 9,03 | [109, 261, 666, 322, 142] | 2 624 962 n/s, **profondeur 12** |
| [35822663218](https://github.com/theodubus/chess/actions/runs/35822663218) | `20260924` | 3000 | +23,55 ± 8,81 | [79, 271, 669, 330, 151] | 2 256 969 n/s, **profondeur 11** |
| **en commun** | — | **6000** | **+19,13 ± 6,31** | — | — |

Candidat `ebe93ad`, référence `6d5e7c6`, cadence **`8+0,08`**, livre `book.epd`,
adjudication et abandon inchangés. **L'intervalle exclut largement la borne
haute de 5 Elo** : la borne basse est **+12,82**.

**Homogénéité contrôlée, pas supposée.** Les deux matchs diffèrent de 8,83 Elo,
**z = −1,37** — le script refuserait de conclure au-delà de 2. Et le sens
rassure : c'est le runner le plus **rapide** (profondeur 12) qui rend le plus
**petit** Elo, à l'inverse de ce que la règle de cadence prédirait si l'écart
venait du point de fonctionnement. *Un écart qui va dans le sens contraire de
l'explication disponible est plus facile à attribuer au hasard.*

**Pertes au temps : zéro** — aucun `loses on time`, aucun coup illégal, aucun
moteur perdu. <span>**Couverture : 64 % de chaque match** (parties 1081–3000 et
1070–3000). L'API de journaux de GitHub plafonne à 5000 lignes et ne sert que
la fin ; l'artefact complet passe par un domaine que le proxy de session
refuse.</span> **C'est pourquoi `match.yml` recense désormais les fins de
partie et les anomalies lui-même, sur le journal entier** : le contrôle qui
décide d'une fusion ne se lit pas sur un échantillon dont on n'a pas choisi la
taille. Pour un changement de gestion du temps, la perte au temps *est* le mode
de défaillance propre — il ne se voit pas dans l'Elo.

#### Trois prédictions écrites d'avance, et ce qu'elles ont rendu

- **« Un SPRT expiré est une estimation biaisée VERS ZÉRO, donc un
  minorant. »** Le SPRT du 23 sept. avait expiré à 3 262 parties en rendant
  **+14,59 ± 8,31**. La mesure non biaisée donne **+19,13**. *Le minorant
  minorait.*
- **« ~6000 parties donnent environ ± 6,1 Elo. »** Rendu : **± 6,31**.
- **`parties × Elo` ≈ 59 256.** Ici 6 000 × 19,13 = 114 780, hors de l'étendue
  — et c'est normal : la relation décrit l'effectif qu'un **SPRT** consomme
  pour trancher, pas un effectif qu'on a choisi. Elle prédit 59 256 ÷ 19,13
  ≈ **3 100 parties**, et le SPRT était à 84 % du chemin à 3 262. *La relation
  tient là où elle s'applique.*

#### Et le facteur de durée a bougé, exactement comme annoncé

`match.yml` disait : *« ce facteur 0,77 EST le gaspillage de pendule, donc la
constante dériverait vers 1 le jour où C21 fusionne »*. Mesuré : **6,38 et
6,34 s/partie** contre 7,47 prédites, soit **0,85** — contre 0,75 avec deux
moteurs d'avant. Un seul des deux camps porte le changement, donc le facteur
n'a fait qu'un demi-pas. <span>Inférence, confiance moyenne : (0,75 + f)/2 =
0,85 donne **f ≈ 0,95** pour deux moteurs C21 — elle suppose que la dépense
d'un camp ne dépend pas de l'autre, alors que la LONGUEUR de la partie est
commune.</span>

### Ce qui est EN VOL le 23 sept. — l'ordre des relèves, des fusions et des conflits

Plusieurs mesures tournent en même temps, chacune sur ses propres runners :
aucune ne vole de CPU à une autre, et chacune reste valide en interne. Chaque
chantier a sa section — runs, critère écrit avant de lancer, étapes du
verdict — et **c'est elle qui fait foi**. Celle-ci ne dit que ce qu'aucune
ne peut dire seule : **dans quel ordre tout reprendre, ce que chaque fusion
change aux autres, et où ça conflictue.** À renommer en « VERDICTS » quand la
dernière relève est faite.

#### Les jobs

| chantier | runs | candidat → référence | effectif, arbitre | fin attendue (UTC) | ce que la relève décide |
|---|---|---|---|---|---|
| C22 — la nulle à l'horizon | 35857125439, 35857128461 | `05a9dc4` → `e1971a8` | 2 × 3000, fastchess | **RELEVÉ** — coupés par le plafond à 17 h 43, 2 × 2 880 parties | **−10,44 ± 6,34 : régression, non fusionné** — à remesurer sur C23 |
| B9 — capacité de la table atomique | 35861835486, 35861838168 | `bd896ba` → `1b5afa8` | 2 × 3000, fastchess | **RELEVÉ** — coupés par le plafond à 18 h 29, 2 860 + 2 880 parties | **−1,27 ± 6,34 : pas d'effet décelable, FUSIONNÉ** (`481f8af`) |
| ponder activé | 35866707040, 35866710329, 35866713797 | `136dda4` des deux côtés, `ponder = candidat` | 3 × 900, cutechess, une partie à la fois | **RELEVÉ** — finis entiers entre 18 h 37 et 18 h 40 | **+67,63 ± 9,19 contre notre jumeau : l'activer rapporte** — 2,7 × l'attendu, l'écart localisé par sonde (sa section) |
| C23 — la fenêtre au dernier coup nul | 35870416179, 35870420031 | `3236f12` → `0c29d6b` | 2 × 3000, fastchess | **RELEVÉ** — coupés par le plafond à 19 h 45, 2 × 2 880 parties | **+2,65 ± 6,40 : pas d'effet décelable, FUSIONNÉ** au titre de la règle (`25fd727`) |
| balayage de mutation après le ponder | 35867704624 | `main` à `0c29d6b` | un job par fichier, puis `Verdict` | **RELEVÉ à 15 h 20** | `search.rs` 46 contre 45 : trois survivants dans la garde de `ponder_move`, tués par un test (PR #50) ; plafond laissé à 45 — 47 expirés dans ce balayage. `uci.rs` à 0. Issue #49 fermée |
| C22 sur C23 — la nulle à l'horizon, sans les fausses nulles | 35912945157, 35912948746 | `cd45ffa` → `1eec468` | 2 × 3000, fastchess | **RELEVÉ** — coupés par le plafond à 01 h 49, 2 880 + 2 878 parties | **+10,86 et −2,90, hétérogènes (z = 2,15) ; aucune borne haute sous zéro : FUSIONNÉ au titre de la règle** |
| **vol de CPU du ponder sur runner** — deux sondes | **35933841290** (`ponder = candidat`), **35933844087** (témoin) | `2f3bf1a` des deux côtés, `8+0,08`, 60 parties chacune, une à la fois | cutechess, sonde | **RELEVÉ** — finies à 23 h 53 et 23 h 55 | **r = 0,948 ≥ 0,93 : le verdict du ponder tient.** Et les runners n'ont que **deux cœurs physiques** (SMT) — voir son verdict |
| calibrer l'Elo par pli — deux matchs et une sonde | matchs d'Elo : 35933846266, 35933847908 ; sonde de plis : 35933850590 | `2f3bf1a` des deux côtés ; candidat `16+0,16`, référence `8+0,08` : 2 × 1 900 parties et une sonde de 100 parties | fastchess ; cutechess pour la sonde | **RELEVÉ** — sonde à 00 h 27, matchs finis entiers à 05 h 11 et 05 h 12 | **+107,74 ± 8,19 Elo et +1,38 ± 0,28 pli pour un doublement : 60 à 105 Elo par pli.** L'attendu écrit avant tient (section de son verdict) |
| **B6 — la sonde à deux fils** | 35947696926 | `65d0b03` des deux côtés, 2 fils contre 1, `8+0,08`, 60 parties, une à la fois | cutechess, sonde | **RELEVÉE à 02 h 58** | **+0,48 ± 0,08 pli, n/s × 2,05** : dans l'attendu, chaque fil a son cœur — le match d'Elo est lancé (section B6) |
| **B6 — l'Elo à deux fils** | **35949564324, 35949565830, 35949567986** | `65d0b03` des deux côtés, 2 fils contre 1, `8+0,08`, graine « auto » | 3 × 900, fastchess, une partie à la fois | **RELEVÉ** — finis entiers entre 08 h 26 et 08 h 28 | **+42,16 ± 9,23 en commun, homogènes : deux fils rapportent** (section B6). 0,31 à 0,86 pli par l'étalon |
| **A18 — génération par étapes, la sonde** | 35971800328 | `087edb8` → `d01183d`, `8+0,08`, 100 parties, une à la fois | cutechess, sonde | **RELEVÉE à 08 h 29** | **n/s × 1,09, +0,17 ± 0,07 pli** : dans l'attendu, la règle lance l'Elo (section A18) |
| **A18 — l'Elo** | 35975781390, 35975784326 | `087edb8` → `d01183d`, `8+0,08`, graine « auto » | 2 × 3 000, fastchess | **RELEVÉ** — coupés par le plafond à 14 h 22, 2 880 + 2 860 parties | **+23,10 ± 6,39, homogènes : gain démontré, FUSIONNÉ** (section A18) |
| **C25 — la répartition par la stabilité, la sonde** | 36030127970 | `41d590f` → `910a6c9`, `8+0,08`, 100 parties, une à la fois | cutechess, sonde | **RELEVÉE à 17 h 32** | **Temps × 0,98, zéro perte au temps** : la règle lance l'Elo. Plis −0,20 ± 0,07, ce que l'écran prédisait (−0,16) — plus un critère (section C25) |
| **C25 — l'Elo** | **36035213241, 36035217166** | `41d590f` → `910a6c9`, `8+0,08`, graine « auto » | 2 × 3 000, fastchess | **RELEVÉ** — coupés par le plafond à 23 h 24, 2 880 + 2 860 parties | **+7,87 ± 6,08, homogènes, zéro perte au temps : gain démontré, FUSIONNÉ** (section C25). Sous l'attendu (+12 à +25) : le taux de C24 ne se transfère qu'aux extrêmes, comme sa réserve le disait. Crible au candidat : la prédiction tient, rien de neuf dans `search.rs` |
| **balayage de mutation après la PR #82** — C26 fusionné | 36103336914 | `main` à `32a0954` | un job par fichier, puis `Verdict` | **RELEVÉ à 08 h 12, VERT** — `search.rs` le plus long, 90 min : 416 attrapés, 48 expirés | **La prédiction tient, exactement** : `search.rs` **39**, et la liste des survivants est identique à celle d'après la PR #81, ligne pour ligne ; les cinq mutants neufs de C26 sont attrapés, un expiré de moins. Tous les autres fichiers à leur plafond, total **139**. Aucune issue. — *Prédiction, écrite avant* : `search.rs` **39**, au plafond, les mêmes survivants un pour un — le crible au candidat n'a trouvé aucun survivant dans `deadlines_ms`, et C26 ne déplace aucun arbre à profondeur fixe ; le compte d'expirés peut bouger avec la charge du runner — les cinq mutants neufs n'en produisent aucun au crible. Tous les autres fichiers à leur plafond, total **139** |
| **C26 — les deux sondes, dans le conteneur** | — | `main` avec C25, puis le candidat `6daf7d7`, chacun contre lui-même, `40/8`, 60 parties, `-srand 20260925` | cutechess, `-debug all` | **RELEVÉES à 23 h 47 et 23 h 58** | **5,3 % de cycles affamés avant, aucun après** ; aucun coup au-delà de sa borne de plus de 10 ms ; zéro perte au temps des deux côtés — le match se lance (section C26) |
| **C26 — l'Elo à `40/8`** | 36075386225, 36075388587 | `6daf7d7` → `4620495`, `40/8`, graine « auto » | 2 × 3 000, fastchess | **RELEVÉ** — finis entiers à 05 h 24 et 05 h 28, 2 × 3 000 parties, 6,5 s par partie | **+2,43 ± 6,01, homogènes (z = 0,83), zéro perte au temps : aucune borne haute sous zéro, FUSIONNÉ au titre de la règle** (section C26) |
| **A20 — l'écran et le rejeu, dans le conteneur** | — | `main` sondé contre lui-même, `8+0,08`, 120 parties, `-srand 20260925` ; puis cinq variantes rejouées à la profondeur 10 sur deux flux | cutechess, `-debug all` ; `rejouer-profondeur.py` | **RELEVÉS à 07 h 43 et 07 h 47** | union de l'étage tranquille **10,9 %** des nœuds, 0,23 pli au plus ; une seule variante réduit l'arbre, **la continuation conservée, −3,1 %** (section A20) |
| **A20 — l'Elo de la continuation** | **36110519468, 36110522377, 36110524982, 36110528007** | `54e6c60` → `a08af76`, `8+0,08`, graine « auto » | 4 × 3 000, fastchess | **RELEVÉ** — coupés par le plafond vers 13 h 50, 2 900, 2 900, 2 900 et 2 920 parties | **+12,56 ± 4,35 en commun, homogènes (z ≤ 1,17), zéro perte au temps : gain démontré, FUSIONNÉ** (section A20) — au-dessus de ce que l'arbre seul promettait. — *Attendu, écrit avant* : 0 à +15, dont +4 à +7 par l'arbre seul. **Critère de gain** : fusion si la borne basse commune est au-dessus de zéro ; +5 y serait démontré 64 fois sur 100, +8 96 fois sur 100 |
| **A20 — le crible de mutation au candidat** | <s>—</s> **36114952595** | `54e6c60`, `search.rs` entier, 570 mutants — et les huit autres fichiers | <s>`tools/mutants.sh`, dans le conteneur</s> **`Mutation`, entrée `commit`, sur runner** | <s>lancé à 08 h 01, fin vers 09 h</s> **mort dans le conteneur à 57 mutants sur 570**, au redémarrage de 08 h 11 — la règle « une mesure longue ne survit pas dans le conteneur », enfreinte faute d'outil ; **relancé sur runner à 08 h 48** — extraction du candidat vérifiée au journal — **RELEVÉ à 10 h 25, VERT** | **La prédiction tient, au bas de sa fourchette** : `search.rs` **39**, et ce sont les MÊMES survivants que sur `main`, un pour un, décalés de lignes par le code neuf ; aucun mutant du code neuf ne survit, et l'arbre neuf ne cache aucun ancien mutant au banc figé. Tous les autres fichiers à leur plafond, total **139**. — *Prédiction, écrite avant* : 39, au plafond, les mêmes ; jusqu'à 43 si l'arbre neuf cache d'anciens mutants au banc figé. Les 57 premiers dans le conteneur : un survivant, l'ancien de `Score::from_internal` |
| **C27 — l'élagage par distance au mat, l'Elo** | 36166287710, 36166290276 | `bb6e4c0` → `3aa5986`, `8+0,08`, graine « auto » | 2 × 3 000, fastchess | **RELEVÉ** — coupés par le plafond à 23 h 08, 2 900 + 2 860 parties | **−3,56 ± 5,97 en commun, homogènes (z = 0,54), zéro perte au temps : aucune borne haute sous zéro, FUSIONNÉ au titre de la règle** (section C27). Étalonnages 4 019 409 et 2 199 922 n/s : 83 % d'écart, le plus grand relevé. — *Critère, écrit avant* : fusion sauf si la borne haute est sous zéro, en commun comme sur chaque match |
| **C27 — le crible du code neuf, dans le conteneur** | — | la révocation de la révocation, puis l'extraction de `mate_distance_window` | `tools/mutants.sh --in-diff` | **RELEVÉS à 23 h 25 et 23 h 30** | **7 survivants sur 11** dans le bornage, puis **22 attrapés sur 23, un expiré** — bornes extraites en fonction pure, deux tests neufs (section C27) |
| **balayage de mutation après la fusion de C27** | 36201927482 | `main` à `70522b7` | un job par fichier, puis `Verdict` | **RELEVÉ le 26 sept. à 01 h 20, VERT** — `search.rs` le plus long, 95 min : 483 attrapés, 40 expirés, 28 inviables | **Les survivants tiennent la prédiction, un pour un** : `search.rs` **39**, les mêmes que 36145534414, aux mêmes colonnes, décalés de 23 lignes au-delà du bornage ; aucun dans le code neuf. Tous les fichiers à leur plafond, total **139**, aucune issue. **Les expirés, non** : 40 contre 43 prédits — le crible donnait aux vingt mutants neufs 19 attrapés et un expiré, donc trois mutants qui expiraient la veille sont attrapés cette fois ; le compte d'expirés suit la charge du runner, et la prédiction aurait dû le dire comme les précédentes. — *Prédiction, écrite avant* : `search.rs` **39**, les MÊMES survivants que 36145534414, un pour un ; un expiré de plus, `alpha >= beta` en `<` ; `tt.rs` **6** ; tous les autres à leur plafond, total **139** |
| **A21 — le débit de génération sur runner** | 36166785450 | le générateur de `main` à `0eb1e9b`, 5 000 nœuds, graine « auto », un fil par processeur logique | un job court, 20 minutes | **RELEVÉ** — fini à 17 h 43 | **1 713 positions par seconde, dans l'attendu** (1 200 à 1 800, écrit avant) : 17 976 parties, 2 055 456 positions, 62,2 % gardées par le filtre par défaut ; artefact de 7,4 Mo, expire le 24 déc. **Il ne se relit pas d'ici** : le proxy de sortie refuse le stockage des artefacts. Décide quatre jobs (section A21) |
| **A21, étape 2 — le crible de mutation du candidat** | 36210591242 | `cc8e105` : `nnue.rs` neuf, `search.rs` et `uci.rs` touchés — et les autres fichiers | un job par fichier, puis `Verdict` ; entrée `commit`, donc aucune issue | ~03 h 40 — `search.rs` le plus long | Fixe le plafond de `nnue.rs`, que la fusion attend. — *Prédiction, écrite avant* : `nnue.rs` **1** sur 98 mutants — le `>` du côté du roque en `>=`, équivalent, roi et tour n'étant jamais sur la même colonne ; `search.rs` **39**, les mêmes survivants, aucun dans le code neuf ; `uci.rs` **0** ; les autres à leur plafond ; total **140**. Les expirés ne se prédisent pas : ils suivent la charge du runner. |
| **A21 — la génération, première vague** | 36179538497, 36179541822, 36179544454, 36179547648 | le générateur au candidat C27 `bb6e4c0` — le moteur corrigé, le générateur de `main` au bit près —, 5 000 nœuds, graine « auto », un fil par processeur logique | 4 jobs de 330 minutes | **RELEVÉE le 26 sept. à 01 h 20** — finis à 00 h 55, quatre succès, chaque résumé nomme `bb6e4c0` | **125,1 millions de positions, 77,7 millions gardées par le filtre** (62,1 %) : 92 % de l'attendu central, dans sa fourchette, **au-dessus de la cible de 100 millions — pas de vague de complément**. 29,9 à 34,2 M par job, débits 1 509 à 1 727 positions/s (section A21). — *Attendu, écrit avant* : 34 M par job au débit relevé, 21 à 54 aux extrêmes ; 136 M pour les quatre ; 62 % gardées ; complément sous 100 M |
| **balayage de mutation après la PR #83** — A20 fusionné | **36145534414** | `main` à `d23d1b5` | un job par fichier, puis `Verdict` | **RELEVÉ à 15 h 40, VERT** — `search.rs` le plus long, 71 min : 461 attrapés, 42 expirés | **La prédiction tient, exactement — jusqu'aux expirés** : `search.rs` **39**, les mêmes survivants que le crible au candidat, un pour un, aux mêmes lignes ; et le tableau entier du verdict est celui du crible, colonne par colonne — survivants, attrapés ET expirés, pour les neuf fichiers. Total **139**, aucune issue. *Le crible par l'entrée `commit` et le balayage de `main` voient donc la même chose.* — *Prédiction, écrite avant* : `search.rs` **39**, au plafond, et les MÊMES survivants que le crible au candidat (36114952595), un pour un, aux mêmes lignes — le code moteur de `main` est celui du candidat octet pour octet (`git diff 54e6c60 d23d1b5 -- engine/` est vide) et le crible a balayé tous les fichiers ; seul le compte d'expirés peut bouger avec la charge du runner, et il ne peut que faire baisser celui des survivants. Tous les autres fichiers à leur plafond, total **139**. Un écart, quel qu'il soit, dirait que le crible et le balayage ne voient pas la même chose |
| **balayage de mutation après la PR #81** — C25 fusionné | 36073858328 | `main` à `04bf6f8` | un job par fichier, puis `Verdict` | **RELEVÉ à 01 h 10, VERT** — `search.rs` le plus long, 90 min : 526 mutants, 410 attrapés, 28 inviables, 49 expirés | **La prédiction tient, exactement** : `search.rs` **39**, les deux survivants d'`iterate` que le crible au candidat avait trouvés parmi eux, et tous les autres fichiers à leur plafond, total **139**. Aucune issue. — *Prédiction, écrite avant* : `search.rs` **39**, au plafond — le crible au candidat ne trouvait que les deux survivants anciens, et C25 ne déplace aucun arbre à profondeur fixe, donc aucun test de nœuds ne voit autrement le reste du fichier ; des expirés en plus, `set_deadlines` vidé et `deadlines_ms` à `None`. Tous les autres fichiers à leur plafond, total 139 |
| **balayage de mutation après les PR #78 et #79** — tests corrigés, C24 fusionné | 36028076680 | `main` à `f2dd0cf` | un job par fichier, puis `Verdict` | **RELEVÉ à 17 h 38, VERT** | **La prédiction tient** : `search.rs` **39**, au plafond — les quatre mutants cachés par l'arbre d'A18 attrapés, la garde de `stage_moves` seule en plus des 38, C24 n'ajoute rien. `eval.rs` **89** contre 121 → plafond **resserré à 89** : le banc à la profondeur 6 attrape 33 `delete -` de plus dans les tables. Total du dépôt 139. Issue #69 fermée |
| **balayage de mutation après la PR #77** — A18 fusionnée | 36013927958 | `main` à `3b80e1a` : la génération par étapes | un job par fichier, puis `Verdict` | **RELEVÉ à 15 h 57 — CASSÉ** : `search.rs` **43** > 39, `eval.rs` **122** > 121 ; le verdict a commenté l'issue #69, restée ouverte depuis le balayage annulé de 02 h | **La prédiction était fausse.** `search.rs` : les 38 d'avant un pour un, la garde de `stage_moves` prévue, et **quatre de code qu'A18 n'écrit pas** — la prime d'historique `depth * depth` (en `+` et en `/`), le `ply + 1` de l'appel au coup nul et celui de la quiescence. Mesuré mutant par mutant : avant A18, les trois premiers déplaçaient le banc à la profondeur 5 (31 570, 31 585, 31 571 contre 31 637) ; après, 31 829 avec ou sans eux, mais 70 995, 70 996, 70 758 contre 70 719 à la profondeur 6. Le quatrième ne déplace aucun banc : seul le test de légalité de la PV l'attrapait, sur UNE position que l'arbre neuf ne fait plus passer par la quiescence fautive. **Corrigé par les tests, pas par le plafond** (`3ac4d71`) : banc figé à la profondeur 6, PV vérifiée sur une quarantaine de positions de la marche seedée ; re-mesuré localement, les quatre attrapés. `eval.rs` : +4 −3 `delete -` dans les tables — A18 change ce que le banc figé voit des valeurs, du réglage que le SPRT juge. **Suite** : fusionner les tests, rebalayer, lire `eval.rs` sur la mesure |
| **balayage de mutation après la PR #76** | 35976435127 | `main` à `ea8116f` : chaque fil tient le budget de nœuds, `MAX_THREADS` 1 024 ; A18 révoqué, donc absent | un job par fichier, puis `Verdict` | **RELEVÉ** — fini à 09 h 54, verdict vert | **La prédiction tient** : `search.rs` **38**, au plafond, et tous les autres fichiers au leur, total 170. **La réserve ne s'est pas matérialisée** : le test à plusieurs fils, qui n'est plus instable, n'attrapait par hasard aucun mutant équivalent. Parmi les 38, les deux que le balayage local d'A18 avait donnés pour anciens — `*` en `+` dans la note des promotions, la garde de débordement d'`ordered_moves` |
| **C24 — laisser finir l'itération, la sonde** | 35982959972 | `7274844` → `7fc5959`, `8+0,08`, 100 parties, une à la fois | cutechess, sonde | **RELEVÉE à 10 h 25** | **Temps × 1,00, plis −0,00 ± 0,09** : la règle lance l'Elo. L'attendu écrit (+0,15 à +0,35) est manqué, et c'est l'attendu qui était faux — l'écran, interrogé, prédisait +0,05 (section C24) |
| **C24 — l'Elo** | 35987710644, 35987713472 | `7274844` → `7fc5959`, `8+0,08`, graine « auto » | 2 × 3 000, fastchess | **RELEVÉ** — coupés par le plafond à 16 h 22, 2 × 2 880 parties | **+44,64 ± 6,24, homogènes : gain démontré, FUSIONNÉ.** La lecture par l'accord tient, celle des plis moyens tombe ; **C25 s'écrit**, par sa règle écrite avant (section C24) |
| balayage de mutation après B6 | 35949682016 | `main` à `65d0b03`, Lazy SMP | un job par fichier, puis `Verdict` | **RELEVÉ** — fini à 04 h 03, verdict vert | **La prédiction tient** : `search.rs` 40, **les mêmes survivants** qu'après C22 — le couple déplacé de `go` vers `iterate` compris —, Lazy SMP n'en ajoute aucun ; `uci.rs` 0. 472 mutants, 357 attrapés, 22 inviables, **53 expirés contre 47** : inférence, ce sont les mutants qui rendent un budget de nœuds inatteignable ou suppriment l'arrêt des auxiliaires — un test pend au lieu d'échouer ; le résumé ne liste pas les expirés |
| balayage de mutation après la PR #72 | 35954091395 | `main` à `8ad3198`, les deux tests des survivants neufs | un job par fichier, puis `Verdict` | **RELEVÉ** — fini à 05 h 20, verdict vert | `search.rs` **38, exactement la prédiction** : les deux survivants visés disparus, les 38 autres un pour un → plafond **resserré à 38**. Les autres fichiers au plafond, total 170 |
| balayage de mutation après C22 | 35945758614 (35945260912 annulé au départ) | `main` à `8dbb133`, C22 et son test | un job par fichier, puis `Verdict` | **RELEVÉ** — fini à 03 h 08, verdict vert | `search.rs` **40** contre 43 → plafond **resserré à 40**. Le compte tombe juste, par fonction et opérateur : cinq survivants de l'ancienne ligne de nulle disparus, deux neufs. **La prédiction écrite avant était fausse sur ces deux-là** : `&&` en `||` dans `is_checkmate` — la nulle arrivait un ply plus tard dans le contre-cas, même score — et `ply > 0` en `ply >= 0`, la règle à la racine. Un test chacun, dont le témoin coupe la propagation (une parade qui remet la pendule à zéro) ; prochain balayage attendu à 38. Les autres fichiers au plafond |
| balayage de mutation après C23 | 35912951112 | `main` à `1eec468` | un job par fichier, puis `Verdict` | **RELEVÉ** — fini à 20 h 44, verdict vert | `tt.rs` **6**, exactement la prédiction (les quatre `\|` de `pack_data` et les deux de `pack_move`) → plafond **baissé de 8 à 6**. `search.rs` **43** : les mêmes survivants un pour un, et aucun dans le code de C23 — qui ne porte aucun opérateur mutable, donc le balayage ne pouvait rien en dire ; sa couverture reste celle mesurée à la main (quatre défauts injectés, quatre attrapés). Les autres au plafond, aucune issue |
| balayage de mutation après B9 | 35904545718 | `main` à `423c446` | un job par fichier, puis `Verdict` | **RELEVÉ** — fini à 19 h 44 | `tt.rs` **8** contre 2, tous équivalents : deux décalages nuls retirés comme code mort, plafond inscrit à 8, le chiffre mesuré (PR #56). `search.rs` **43** contre 45 : les trois survivants de `ponder_move` tués par la PR #50, 47 expirés comme au balayage précédent — plafond resserré à 43. Les autres au plafond. Issue #57 fermée |

Les candidats de C22, B9 et C23 ont chacun été **committés puis révoqués
aussitôt** (`8e08920`, `7552320`, `1ab033f`), et leurs SHA restent
mesurables. **B9 et C23 sont depuis entrés dans `main`** par révocation de
leur révocation, **puis C22 le 24 sept.** — porté sur C23 (`cd45ffa`,
révoqué par `898e195`) : c'est cette seconde révocation qui a été révoquée. **Fusionner, c'est révoquer la
révocation sur `main` à jour** — jamais repartir de la rustine, qui n'est que
la copie de secours.

**Si la session qui a programmé les relèves n'existe plus**, rien ne les
fera toutes seules : les journaux de job restent lisibles tant que GitHub
les garde — 90 jours par défaut, le réglage de ce dépôt n'est pas vérifié —
et l'artefact `match-log` 30 jours (`retention-days` dans `match.yml`). Le
résumé de chaque job est recopié à la **fin** de son
journal, donc `get_job_logs` avec ~300 lignes de fin suffit — sauf pour les
deux jobs de C22, partis avant ce recopiage (voir sa section).

#### Ce qui lie les chantiers entre eux

- **C22 et C23 touchent le même objet**, la détection de répétition. C23 a
  montré que **92,1 % de ce que C22 ajoute à l'horizon sont de fausses
  nulles** : le critère de C22 ne bouge pas, sa lecture si (section C22).
  Chacun est mesuré dans le contexte qui lui est le moins favorable (section
  C23, « Pourquoi `main` sans C22 »).
- **Leurs textes conflictuent, leur logique non.** C22 insère `is_rule_draw`
  juste après `is_repetition`, dont C23 réécrit le corps : la rustine C23 ne
  s'applique plus après C22 que par `git apply -C1`. Vérifié : les tests des
  deux passent ensemble.
- **B9 est disjoint des deux** — la table d'un côté, la répétition de
  l'autre. Vérifié le 23 sept. : les trois rustines ensemble — C22, C23 par
  `-C1`, puis B9 — compilent, **192 tests passent**, banc 31 637 à la
  profondeur 5 et 114 026 à la profondeur 7.
- **Le ponder ne dépend d'aucun** : il mesure un binaire contre lui-même, et
  ne fusionne rien.
- **A18 et C24, en vol ensemble le 24 sept., touchent `search.rs` à des
  endroits disjoints** — l'ordre des coups d'un côté, les échéances de
  l'autre. **Répété à blanc à 12 h, sur la tête de la branche** : leurs
  révocations (`908ed46`, `40afb49`) se lèvent sans conflit, seules ou
  ensemble ; ensemble, `verify.sh --rapide` passe et le banc rend 109 047 à
  la profondeur 7 (celui d'A18 ; C24 n'y change rien, aucune échéance ne
  joue à profondeur fixe). **La table de l'attic ne change que sur la ligne
  du candidat fusionné** — sa rustine cesse de s'appliquer parce que son
  code est entré — et la révocation levée d'A18 remet d'elle-même les lignes
  de `c19-see-ordering`, `d2-sonde-pv` et `d6-sonde-ordonnancement` à
  « non ». Vérifié dans les trois cas : A18 seul, C24 seul, les deux ; la
  rustine de l'autre s'applique toujours, et `c24-sonde-allocation` dans les
  trois.

#### L'ordre des fusions, et ce que chacune change ailleurs

L'ordre est celui des verdicts. Chaque fusion déplace des choses que d'autres
tests surveillent, et **ce sont eux qui le signaleront** — pas la mémoire :

| relève | si le critère autorise la fusion | ce qui bouge avec |
|---|---|---|
| mutation — **faite** | — | plafonds inchangés ; <s>le balayage suivant, après C22, dira si `search.rs` redescend à 43</s> — celui d'après B9 l'a dit, **sans C22** : 43, plafond resserré |
| C22 — **relevé** | **non fusionné** : le critère de régression est atteint | rien ne bouge — banc, table de l'attic et rustines C23 restent tels quels. La suite est « C22 rejeté », ci-dessous |
| B9 — **fusionné** | `git revert 7552320`, fait (`481f8af`) | référence du banc → **114 026** ; rustines B9 de l'attic → « non », leur code est entré ; chiffres de neutralité inchangés, la base n'ayant pas bougé ; **balayage de mutation de `tt.rs` lancé après la fusion** |
| ponder — **relevé** | rien à fusionner | la ligne ponder de « Ce qui reste à faire » ; la conversion plis → Elo de `CLAUDE.md`, qui a désormais deux points mesurés |
| C23 — **fusionné** | `git revert 1ab033f` sur `main` à jour, fait (`25fd727`) — **sans conflit de code**, seule la table de l'attic conflictait | banc inchangé aux profondeurs 5 et 7 ; l'invariant de la fenêtre revenu dans `CLAUDE.md` ; trois lignes de l'attic recalculées au vrai `git apply --check` ; balayage de mutation relancé. **C22 porté par-dessus et remesuré** — section « C22 sur C23 » |
| C22 sur C23 — **fusionné** | `git revert 898e195` sur `main` à jour, fait le 24 sept. — sans conflit | banc inchangé à la profondeur 7 (114 026), **642 442** à la profondeur 10 comme annoncé ; trois lignes de l'attic recalculées au vrai `git apply --check` (C22 porté et d'origine, C18) ; balayage de mutation de `search.rs` relancé après la fusion. **Débloque** « interdire deux coups nuls consécutifs » |

**Les branches qui ne fusionnent pas ont aussi leur suite, écrite d'avance :**

- **C22 rejeté** → ne pas conclure contre la règle. Attendre C23 ; s'il
  fusionne, porter C22 sur `main` d'après C23 et le **remesurer là** — sa
  lecture le demande, 92 % de ce qu'il ajoutait étant faux.
- **C23 rejeté** → chercher d'abord le coût du double coup nul : avec C23, il
  ne rend plus une fausse nulle, il re-cherche la position à profondeur
  réduite. C'est précisément ce que retire l'étape suivante — interdire deux
  coups nuls consécutifs.
- **B9 rejeté** → la seule différence de comportement est la capacité (sa
  section) ; B6 reste bloqué derrière lui.

#### Et ensuite

L'ordre des chantiers suivants vit dans « Ce qui reste à faire, par ordre
mesuré » et ne se recopie pas ici. Ce qui dépend directement de ces relèves :
<s>interdire deux coups nuls consécutifs (débloqué : C22 sur C23 est tranché ; mesuré seul)</s>
écranté en nœuds le 24 sept., pas prioritaire ; dépenser davantage
quand le ponder est permis (après le ponder, en `les-deux`) ; <s>B6 (après B9)</s>
B6 écrit, son Elo en vol ; puis **la génération par étapes, décidée le 24 sept.**

### C22 — VERDICT, 23 sept. 2026 : −10,44 ± 6,34 Elo à `8+0,08` — régression, non fusionné, à remesurer sur C23

> **Remesuré sur C23 et FUSIONNÉ le 24 sept.**, au titre de la règle — voir
> « C22 sur C23 — VERDICT ». Ce qui suit est le verdict de la première mesure,
> sur la base à fausses nulles.

#### Le verdict — rendu à 17 h 50, sur le critère écrit avant

| | job 35857125439 | job 35857128461 | en commun |
|---|---|---|---|
| parties comptées | 2 880 | 2 880 | **5 760** |
| Elo | −7,24 ± 8,90 | −13,64 ± 9,02 | **−10,44 ± 6,34** |
| Ptnml(0-2) | [117, 292, 661, 274, 96] | [131, 300, 654, 261, 94] | homogènes, z = 0,99 |

**Borne haute −4,1 < 0 : régression significative. Non fusionné**, comme le
critère le disait avant que le chiffre existe.

- **Les deux jobs ont été coupés par le plafond de 350 minutes**, à 2 880
  parties comptées sur 3 000 — la fin annoncée « vers 17 h 15 » était
  sous-évaluée (facteur de durée ci-dessous). La coupure vient de l'horloge,
  pas des résultats : l'estimation reste non biaisée, et la puissance
  annoncée (± 6,3 sur 6 000) devient ± 6,34 sur 5 760.
- **Anomalies : zéro — sur la partie couverte seulement.** La fin de journal
  que sert l'API couvre les parties ~910 à ~2 890 de chaque job, soit ~69 %
  du match. Le début, et l'étalonnage des runners qui s'y trouve, ne sont pas
  lisibles depuis une session : le journal complet se télécharge depuis un
  domaine que le proxy refuse (403). Ces deux jobs étaient partis avant que
  `match.yml` recopie son recensement en fin de journal ; tous ceux lancés
  depuis l'ont.
- **Le correctif fait ce qu'il dit, en partie réelle.** Sur la partie
  couverte, la référence produit 100 avertissements « PV continues after »
  (68 triples répétitions, 32 cinquante coups), le candidat **un seul** : un
  cinquante coups franchi par des parades d'échec en quiescence — que le
  raisonnement de C22, « la quiescence ne joue que des captures et des
  promotions », avait oubliées.
- **Le facteur de durée**, premiers matchs où les deux moteurs portent C21 :
  ~7,25 s par partie à concurrence 3, soit **0,97** de la formule, pour
  ~0,95 extrapolé. **3 000 parties ne tiennent plus dans un job** : ~2 880 au
  plus à `8+0,08`, et un job ne tranche plus que les effets de ~20 Elo.

#### Ce que le verdict dit, et ce qu'il ne dit pas — la lecture était écrite AVANT

La section C23 l'avait inscrit avant ce chiffre : **92,1 % des nulles que C22
ajoute à l'horizon sont fausses**, créées par deux coups nuls consécutifs, et
chacune désactive l'élagage par coup nul là où le camp au trait cherche à
prouver un avantage. Le verdict mesure donc « nulles vraies + fausses nulles
à l'horizon », et la régression est ce qu'on attendait des secondes.
<span>Inférence, confiance moyenne : aucune mesure ne sépare encore les
deux.</span>

**Ce n'est pas un verdict contre la règle.** La suite était écrite d'avance :
attendre C23 ; s'il fusionne, porter C22 sur `main` d'après C23 et le
**remesurer là**, sur le même critère.

**Et la sonde qui avait motivé C22 était contaminée par le défaut de C23.**
Ses « 40 % de nulles manquées » comptaient les répétitions avec
`is_repetition` lui-même — le code dont 88 à 92 % des détections étaient
fausses. Le symptôme était vrai : les avertissements de l'arbitre portent
sur de vraies positions de partie, et le candidat les fait disparaître. La
grandeur chiffrée, non.


#### Comment c'est sorti : des avertissements que j'avais classés bénins

Les journaux des deux matchs de C21 portaient **~200 avertissements** de
l'arbitre, `PV continues after threefold repetition` et `… after fifty-move
rule`, émis **autant par le candidat que par la référence** — donc antérieurs à
C21. Je les avais recensés, puis écartés comme « avertissements de variante,
bénins », sans en lire un seul. Question de Théo : *« tu as bien analysé les
sorties de match ? »* — non, pas celles-là.

**Un avertissement d'arbitre est une mesure, pas du bruit.** Depuis ce jour,
le résumé de `match.yml` les recense par nature, sur le journal entier — **et
le recopie à la fin du journal du job**, parce que l'API de GitHub ne sert pas
le résumé : sans cette copie, une relève faite depuis une session ne l'aurait
jamais lu. Les deux jobs de C22 ont été lancés avant ce correctif ; leur
relève lira donc les pertes au temps à l'ancienne, sur la fin du journal.

#### Ce qu'ils disaient

Reproduit sur la position exacte d'un avertissement, rejouée dans le moteur :

```
info depth 1 score cp -1 ... pv f8e8 e6f6     ← f8e8 termine la partie par triple répétition
info depth 2 score cp 0  ... pv f8e8
```

Dans `negamax`, le test de nulle — répétition, cinquante coups, matériel
insuffisant — venait **après** l'aiguillage vers la quiescence. Il ne voyait
donc que les nœuds intérieurs : une position nulle atteinte à l'**horizon**
était évaluée comme si la partie continuait. À la profondeur 1, l'horizon est
à un coup de la racine ; à toute profondeur, il est au bout de chaque branche.

#### Mesuré avant d'écrire le correctif — dans le régime réel

`tools/attic/c22-sonde-nulle-horizon.patch`, sonde et lecteur ensemble. Le
lecteur rejoue dans un binaire instrumenté **la suite exacte des commandes
qu'un moteur a reçues pendant un match** — mêmes positions, mêmes pendules,
table conservée d'un coup à l'autre. Ni banc, ni positions visitées à froid.

| sur ~2 600 recherches | |
|---|---|
| entrées en quiescence depuis `negamax` | 423,0 M |
| répétitions manquées à l'horizon | 2,53 M — **0,60 %** |
| cinquante coups manqués à l'horizon | 0,33 M — **0,08 %** |
| nulles vues à l'intérieur | 4,22 M |

**40 % de toutes les positions nulles rencontrées** passaient inaperçues.
**Contaminé — relevé le 23 sept. au soir** : ces comptes passaient par
`is_repetition`, dont 88 à 92 % des détections étaient fausses (C23). Voir le
verdict, en tête de section.
*Ce que ce chiffre ne donne pas : l'Elo* — la part de l'arbre touchée majore,
elle ne prédit ni la taille ni le signe (l'extension d'échec touchait 1,39 %
et valait −5,0).

#### Le correctif, et une faute de règle trouvée dans la même ligne

- **Le test de nulle passe avant l'aiguillage.** La quiescence elle-même n'a
  pas à le refaire : ses coups sont des captures et des promotions, qui
  remettent la pendule des cinquante coups à zéro et interdisent toute
  répétition en aval. Seul son nœud d'entrée, atteint par un coup tranquille,
  pouvait être une nulle.
- **La règle des cinquante coups cède devant le mat.** Le test rendait nul un
  mat donné au centième demi-coup. Le mat termine la partie à l'instant où il
  est donné ; la règle des cinquante coups demande qu'on la réclame.
- **Trois tests, et chacun ÉCHOUE sur l'ancien code** à l'assertion qui vise
  le défaut — vérifié en les greffant sur l'arbre d'avant. Chacun porte un
  **témoin** : la même position hors de la règle vaut ~900, jamais zéro.
- **Banc** : 31 637 nœuds à la profondeur 5, inchangé ; **114 028 → 113 214**
  à la profondeur 7.

#### Le protocole — écrit AVANT de lancer, et pourquoi il est celui-là

C'est un **correctif de règle**, pas un gain espéré : 0,68 % des entrées en
quiescence, un effet vraisemblablement sous le seuil de résolution de
plusieurs jobs. Exiger qu'il **prouve un gain** reviendrait à ne jamais
corriger une règle ; ne rien mesurer reviendrait à fusionner un changement
d'arbre sur une impression. **Le critère est donc l'absence de régression
significative** :

| runs | graine | parties | cadence |
|---|---|---|---|
| [35857125439](https://github.com/theodubus/chess/actions/runs/35857125439) | tirée par le run | 3000 | `8+0,08` |
| [35857128461](https://github.com/theodubus/chess/actions/runs/35857128461) | tirée par le run | 3000 | `8+0,08` |

Candidat `05a9dc4`, référence `e1971a8` (`main`). Mis en commun par
`mettre-en-commun.sh`.

- **borne haute de l'intervalle < 0** → régression significative : ne pas
  fusionner, chercher le coût — le test de répétition s'exécute désormais à
  chaque entrée en quiescence ;
- **borne basse > 0** → gain démontré, fusionner ;
- **entre les deux** → pas d'effet décelable : **fusionner au titre de la
  règle**, et l'écrire ainsi.

**La puissance, dite d'avance** : ± 6,3 Elo sur 6 000 parties. Une vraie
régression de −8 Elo serait vue ~70 fois sur 100, une de −11,5 ~94 fois sur
100 ; une régression de 1 ou 2 Elo — l'ordre du coût d'un test de répétition —
ne le serait pas. C'est accepté pour un correctif de règle, et c'est écrit ici
pour ne pas être découvert après.

#### Mesurer sans bloquer la branche

`05a9dc4` porte le correctif ; **le commit suivant le révoque aussitôt**. Le
SHA reste mesurable par `match.yml` — l'historique complet est récupéré, et la
fusion se fait en `merge`, jamais en `squash` — pendant que la branche reste
fusionnable. La leçon est celle des dix-sept commits retenus par C21 : un
changement de recherche au bas d'une pile retient tout ce qui s'empile dessus
jusqu'à son verdict. **Au verdict : révoquer la révocation.** La rustine
`c22-nulle-horizon.patch` en garde une copie qui survit à tout.

#### Découvert pendant le vol : ce que C22 ajoute à l'horizon est à 92 % FAUX (C23)

En mesurant une autre ligne du tableau — la fenêtre de répétition à travers le
coup nul —, la sonde de C23 a compté les répétitions **à l'horizon**, là où
C22 place son test : **92,1 % sont fausses**, presque toutes créées par deux
coups nuls consécutifs, qui recréent la position de départ au même trait.
Sur le banc, c'est net au nœud près : **C22 + C23 rend 114 028 à la
profondeur 7, exactement `main`**. Tout le déplacement de C22 à cette
profondeur — 114 028 → 113 214 — venait des fausses nulles. Voir la section
C23.

**Le critère de C22 ne bouge pas** : il était écrit avant, et un critère
qu'on déplace après avoir appris quelque chose n'en est plus un. **Sa lecture,
si** : le candidat mesure « nulles vraies à l'horizon + fausses nulles à
l'horizon », pas la règle seule. S'il régresse, la cause la plus probable est
la fausse nulle, et la suite est de mesurer C22 **sur** C23 — pas de rejeter
l'idée de C22.

#### Au verdict, dans l'ordre — y compris ce qui ne se voit qu'après

1. **Étalonnage** de chaque job, avant toute mise en commun.
2. **Pertes au temps avant l'Elo.** Ces deux jobs sont partis avant que
   `match.yml` recopie son recensement dans le journal : lire la fin du
   journal (5000 lignes au plus) et dire quelle part du match est couverte.
3. **Les avertissements, par moteur** : le candidat ne doit presque plus
   produire de « PV continues after threefold repetition / fifty-move rule »,
   la référence doit en garder. C'est la vérification *en partie réelle* que
   le correctif fait ce qu'il dit.
4. **Mise en commun** par `mettre-en-commun.sh`, puis le critère écrit
   plus haut — sans le déplacer après avoir vu le chiffre.
5. **Le facteur de durée** : ce sont les **premiers matchs où les DEUX moteurs
   portent C21**. Les s/partie (« Total Time » ÷ parties) diront si le facteur
   atteint le ~0,95 extrapolé, et si la notice de `match.yml` doit changer.
6. **Si le critère autorise la fusion** : révoquer la révocation, banc à
   113 214, `tools/verify.sh` en entier, PR, fusion en `merge`. **Un conflit
   est attendu, et un seul** : la ligne de `c22-sonde-nulle-horizon.patch`
   dans la table de l'attic, que le ponder a déjà passée à « non » pour une
   autre raison (il a réécrit l'impression de `bestmove`). Garder « non », en
   nommant les deux raisons. Le code, lui, s'applique sans conflit — vérifié
   par `git apply --check` sur la branche du ponder.
7. **Après la fusion, un balayage de mutation** (`workflow_dispatch`) : C22
   ajoute du code — `is_rule_draw`, `is_checkmate` — et trois tests qui
   peuvent tuer des survivants existants. Sans ce balayage, le cliquet
   hebdomadaire découvrirait la hausse seul, un mardi, sans contexte. Relever
   le plafond demande une raison écrite ; le baisser, rien.
8. **Les chiffres de neutralité de B9** (114 028 / 635 210) sont relatifs au
   banc d'avant : les refaire avant son verdict de capacité.
9. **Les deux rustines C23 cessent de s'appliquer** dès que C22 fusionne —
   même voisinage qu'`is_repetition`. Passer leurs lignes à « non » dans la
   table de l'attic ; le correctif, lui, se porte par `git apply -C1`, vérifié
   avec les tests des deux.

### C23 — VERDICT, 23 sept. 2026 : +2,65 ± 6,40 Elo à `8+0,08` — pas d'effet décelable, FUSIONNÉ au titre de la règle

#### Le verdict — rendu à 19 h 55, sur le critère écrit avant

| | job 35870416179 | job 35870420031 | en commun |
|---|---|---|---|
| étalonnage | 2 291 546 n/s, profondeur 11 | 2 230 118 n/s, profondeur 11 | runners à 3 % d'écart |
| graine | `35870416179` | `35870420031` | distinctes |
| parties comptées | 2 880 | 2 880 | **5 760** |
| Elo | +1,33 ± 8,93 | +3,98 ± 9,17 | **+2,65 ± 6,40** |
| Ptnml(0-2) | [105, 285, 651, 292, 107] | [113, 277, 634, 296, 120] | homogènes, z = −0,41 |

**Intervalle [−3,8 ; +9,1] : zéro dedans, donc « fusionner au titre de la
règle »**, comme le critère le disait. Fusionné par révocation de la
révocation (`25fd727`), sans conflit de code. Les deux jobs, coupés par le
plafond à 19 h 45, comptent **zéro anomalie sur la totalité de leurs
journaux**.

**Les avertissements de l'arbitre ne se séparent pas, et c'est
informatif** : « PV continues after threefold repetition » 101 au candidat
contre 110 à la référence, « … after fifty-move rule » 42 contre 57.
<span>Inférence, confiance moyenne : une fausse nulle *intérieure* ne
produit pas cet avertissement — elle écourte la variante au lieu de la
prolonger, et un coup nul n'entre jamais dans une variante —, donc ces
avertissements viennent d'ailleurs : des nulles **vraies** que la recherche
ne voit pas à l'horizon.</span> C'est l'objet de C22, pas de C23, et c'est ce que le match de C22
porté sur C23 doit faire reculer.

**Banc** : 31 637 et 114 026 aux profondeurs 5 et 7, inchangés ; 642 441 à
la profondeur 10, 2 043 590 à la profondeur 12. **Puissance** : ± 6,4 Elo,
une régression de 1 ou 2 Elo passerait inaperçue, et c'était écrit avant.

#### Ce que disait la ligne du tableau, et ce que la mesure a trouvé

*« `null_move` de cozy-chess incrémente la pendule des cinquante coups, donc
la fenêtre de `repetitions` remonte au-delà du coup nul et peut y trouver une
fausse répétition. Mesurer la fréquence avant d'écrire. »* Je supposais un cas
rare — une triangulation de part et d'autre d'un coup nul. **La mesure dit
autre chose, et pour une raison plus bête** : rien n'interdit ici deux coups
nuls **consécutifs**, et deux coups nuls de suite recréent la position de
départ, au même trait, donc avec la même clé. La recherche y voyait une
répétition et rendait une nulle.

#### Mesuré avant d'écrire — dans le régime réel

`tools/attic/c23-sonde-fenetre-coup-nul.patch`, sonde et lecteur ensemble.
30 parties à `8+0,08` jouées par fastchess avec `-log engine=true`, puis
chaque flux rejoué dans le binaire sondé — mêmes positions, mêmes pendules,
table conservée. 3 122 recherches.

| | à l'intérieur — où `main` teste la nulle | à l'horizon — où C22 ajoute son test |
|---|---|---|
| répétitions détectées | 4 160 742 | 2 885 339 |
| **fausses** : leur seule occurrence est avant le dernier coup nul | 3 651 841 — **87,8 %** | 2 656 101 — **92,1 %** |
| dont deux coups nuls consécutifs | 86,8 % | 95,1 % |
| vraies | 508 901 | 229 238 |

Et : **10,1 %** des recherches de coup nul partent juste après un coup nul ;
les fausses nulles intérieures touchent 0,65 % des nœuds intérieurs, mais
**56,7 % des recherches de coup nul à profondeur ≥ 7**.

#### Ce que la fausse nulle fait — et ce qu'elle ne fait pas

`X` passe, fenêtre nulle sous `β`. `N1`, l'adversaire, passe à son tour :
`N2` a la clé de `X`, donc « répétition », donc 0. **Si `β ≥ 1`, ce 0 fait
couper `N1`, le coup nul de `X` échoue, et `X` cherche tout.** Aucun score
faux ne remonte — un coup nul qui échoue est jeté — mais l'élagage par coup
nul est **désactivé précisément quand le camp au trait cherche à prouver un
avantage**, à toute profondeur où l'adversaire peut passer à son tour. Le test
`un_second_coup_nul_ne_rend_pas_une_nulle` rejoue ce cas : l'ancien code
rend 0 à un camp qui a une dame et une tour de moins.

**Le banc ne tranche pas le coût**, et c'est attendu : profondeur 7
inchangée (114 028), profondeur 10 **+1,2 %** (642 704), profondeur 12
**−5,1 %** (2 036 820). Un changement de l'arbre dont le signe en nœuds
change avec la profondeur se juge en parties.

#### Le correctif

La fenêtre de répétition s'arrête au **dernier coup nul**, position d'après
comprise — la borne `pliesFromNull` de Stockfish. Une pile d'indices,
`null_marks`, posée au coup nul et retirée au retour. Quatre tests ; **quatre
défauts injectés, quatre attrapés**, chacun par un test différent : la
fenêtre qui ignore la borne (l'ancien comportement), la recherche qui
n'alimente plus la pile, la borne trop zélée qui oublie les répétitions
**après** le coup nul, et la marque jamais retirée — celui-là passait toute la
suite, jusqu'à ce qu'une assertion l'exige. Commit `3236f12`, **révoqué
aussitôt** par `1ab033f`.

*Ce que le correctif ne fait pas* : interdire deux coups nuls consécutifs,
comme Stockfish le fait aussi. C'est un autre changement de l'arbre — avec
C23, un double coup nul ne rend plus de nulle, il re-cherche `X` à profondeur
réduite, <s>du travail qu'aucune partie ne demande</s> — et il se mesurera seul.
*Le mécanisme était faux, mesuré le 24 sept. : l'interdire fait GROSSIR
l'arbre — voir sa ligne dans « Ce qui reste à faire ».*

#### Le protocole — écrit AVANT de lancer

C'est un **correctif de règle** : une nulle que la recherche s'invente. Même
critère que C22, pour la même raison — exiger un gain reviendrait à ne jamais
corriger une règle :

- **borne haute de l'intervalle mis en commun < 0** → régression
  significative : ne pas fusionner, et chercher ;
- **borne basse > 0** → gain démontré, fusionner ;
- **entre les deux** → **fusionner au titre de la règle**, et l'écrire ainsi.

**Puissance** : ± 6,3 Elo sur 6 000 parties — une régression de 1 ou 2 Elo
passerait inaperçue, et c'est accepté parce que c'est écrit.

| runs | graine | parties | cadence |
|---|---|---|---|
| [35870416179](https://github.com/theodubus/chess/actions/runs/35870416179) | tirée par le run | 3000 | `8+0,08` |
| [35870420031](https://github.com/theodubus/chess/actions/runs/35870420031) | tirée par le run | 3000 | `8+0,08` |

Candidat `3236f12`, référence `0c29d6b` — son parent, `main` au moment du
lancement. Lancés à 13 h 55 UTC, fin attendue vers 19 h 30.

#### Pourquoi `main` sans C22 — et ce que ça suppose

C22 et C23 touchent **le même objet**, la détection de répétition : C22
ajoute un test à l'horizon, où la sonde voit 92,1 % de fausses nulles ; C23
retire les fausses nulles partout. Chacun se mesure donc dans le contexte qui
lui est **le moins favorable** : C22 sur une base qui lui fait ajouter des
fausses nulles, C23 sur une base qui en a moins à retirer. S'ils passent tous
deux leur critère de non-régression, leur composition ne vaut pas moins que
chacun. <span>Inférence, confiance moyenne : elle suppose que les fausses
nulles nuisent, ce qui est le sens du défaut et non une mesure.</span> C'est
l'inverse du raisonnement de B9, dont les objets étaient disjoints.

#### Au verdict, dans l'ordre

1. Étalonnages ; anomalies et avertissements, recopiés en fin de journal.
2. Mise en commun, puis le critère ci-dessus, sans le déplacer.
3. Si fusion : révoquer la révocation sur la base du moment. **Si C22 a
   fusionné entre-temps**, un conflit est attendu autour d'`is_repetition`,
   où C22 insère `is_rule_draw` : garder les deux. Mettre à jour la table de
   l'attic.
4. Balayage de mutation : `search.rs`.
5. Ensuite, et séparément : interdire deux coups nuls consécutifs.

### C22 sur C23 — VERDICT, 24 sept. 2026 : aucune borne haute sous zéro, FUSIONNÉ au titre de la règle — deux matchs hétérogènes

#### Le verdict — rendu à 01 h 55, sur le critère écrit avant

| run | graine | parties | Elo | IC 95 % | Ptnml | étalonnage |
|---|---|---|---|---|---|---|
| [35912945157](https://github.com/theodubus/chess/actions/runs/35912945157) | 35912945157 | 2 880 | **+10,86 ± 8,91** | [+1,95 ; +19,77] | [93, 263, 670, 289, 125] | 2 201 226 n/s, profondeur 12 |
| [35912948746](https://github.com/theodubus/chess/actions/runs/35912948746) | 35912948746 | 2 878 | **−2,90 ± 8,80** | [−11,70 ; +5,90] | [99, 304, 660, 274, 102] | 2 207 460 n/s, profondeur 12 |
| en commun, si l'écart est du hasard | — | 5 758 | **+3,98 ± 6,26** | [−2,28 ; +10,24] | — | — |

Les deux jobs coupés au plafond de 350 minutes à 01 h 49, **zéro anomalie**
sur les deux journaux complets.

**`mettre-en-commun.sh` a refusé de conclure** — première fois qu'il le fait
sur une vraie relève : les deux matchs diffèrent de 13,76 Elo, **z = 2,15**.
Sa doc désigne la cause habituelle, deux runners de vitesses différentes ;
**elle est exclue ici** — étalonnages à 0,3 % près, même profondeur. Même
binaires, graines différentes : il ne reste que les parties tirées.
<span>Inférence, confiance moyenne : le hasard. p = 0,031 pour une paire ; sur
les huit comparaisons deux à deux faites depuis le 23 sept., en voir une à ce
niveau a ~22 % de chances.</span>

**La décision ne dépend pas de la lecture, et c'est le critère écrit avant
qui le permet** : formulé en bornes, il se lit sur chaque match comme sur
l'ensemble. En commun, entre les deux ; match 2, entre les deux ; match 1,
borne basse au-dessus de zéro. **Aucune lecture ne met la borne haute sous
zéro** : la branche « ne pas fusionner » n'est prise nulle part. **Fusionné au
titre de la règle, aucun gain revendiqué** — le match 1 seul ne démontre rien
quand son jumeau le contredit.

**Les deux prédictions écrites avant tiennent.** « Entre les deux » : oui, en
commun. Et **les avertissements de l'arbitre se séparent** : « PV continues
after threefold repetition / fifty-move rule », **85 et 94 pour la référence,
4 et 3 pour le candidat** — le correctif fait ce qu'il dit, sur une base qui
n'a plus de fausses nulles.

**Le code fusionné est le candidat mesuré** : révocation de la révocation
`898e195` sur `main` à jour ; banc 114 026 à la profondeur 7 et **642 442 à la
profondeur 10**, exactement les chiffres inscrits avant le lancement ;
`tools/verify.sh` complet vert.

#### Ce qui était écrit avant de lancer

C22 a été arrêté par son critère — **−10,44 ± 6,34** à `8+0,08` — sur une
base où **92,1 %** de ce qu'il ajoutait à l'horizon étaient de fausses nulles,
nées de deux coups nuls consécutifs. C23, qui les supprime, est fusionné. La
suite était écrite avant son verdict : porter C22 sur `main` d'après C23 et
le remesurer là, **sur le même critère**.

#### Ce qui change, mesuré avant de lancer

- **Le code de C22 est identique** ; seul son contexte a bougé, C23 ayant
  réécrit le corps d'`is_repetition`. `git apply --3way` l'applique sans
  conflit, et `is_rule_draw` appelle désormais la fenêtre bornée au dernier
  coup nul. Ses trois tests passent avec les quatre de C23.
- **Le banc ne bouge presque plus** : profondeur 7 inchangée (114 026),
  profondeur 10 642 442 contre 642 441 pour C23 seul, profondeur 12
  2 042 546 contre 2 043 590. Ce que la sonde de C23 prédisait : à l'horizon,
  elle comptait **229 238 vraies répétitions pour 2 885 339 détectées**
  avant C23 — C22 n'ajoute plus que les premières.
- Rustine : `tools/attic/c22-nulle-horizon-sur-c23.patch`. L'originale reste
  à l'attic avec son verdict ; elle ne s'applique plus sur `main` depuis C23.

#### Le critère — écrit AVANT de lancer

Correctif de règle, le même que C22 et C23 :

- **borne haute < 0** → régression : ne pas fusionner, et chercher — la base
  n'a plus de fausses nulles, donc ce serait la règle elle-même, ou son coût ;
- **borne basse > 0** → gain démontré, fusionner ;
- **entre les deux** → **fusionner au titre de la règle**, et l'écrire ainsi.

**Prédiction, écrite avant** : entre les deux. <span>Inférence, confiance
moyenne : un changement qui déplace le banc de 0,05 % à la profondeur 12
tombe sous le seuil de ± 6,3.</span> Et **les avertissements de l'arbitre
doivent se séparer** : C22 v1 en laissait 1 au candidat contre 100 à la
référence sur la partie couverte ; s'ils ne se séparent plus, le correctif
ne fait plus ce qu'il dit.

**Puissance** : ± 6,3 Elo sur ~5 760 parties, deux jobs coupés au plafond.

| runs | graine | parties | cadence |
|---|---|---|---|
| [35912945157](https://github.com/theodubus/chess/actions/runs/35912945157) | tirée par le run | 3000 | `8+0,08` |
| [35912948746](https://github.com/theodubus/chess/actions/runs/35912948746) | tirée par le run | 3000 | `8+0,08` |

Candidat `cd45ffa`, révoqué aussitôt par `898e195` ; référence `1eec468`,
`main` d'après C23. Critère committé avant le lancement (`ded82d7`) ;
lancés à 19 h 59 UTC, plafond de 350 minutes vers 01 h 50 le 24 sept.

#### Au verdict, dans l'ordre

1. Étalonnages ; anomalies et avertissements par moteur.
2. Mise en commun, puis le critère, sans le déplacer.
3. Si fusion : révoquer la révocation sur `main` à jour ; table de l'attic ;
   balayage de mutation (`search.rs`).
4. Ensuite, et séparément : interdire deux coups nuls consécutifs.

### B9 — VERDICT, 23 sept. 2026 : capacité −1,27 ± 6,34 Elo à `8+0,08` — pas d'effet décelable, FUSIONNÉ

#### Le verdict — rendu à 18 h 40, sur le critère écrit avant

| | job 35861835486 | job 35861838168 | en commun |
|---|---|---|---|
| étalonnage | 3 197 486 n/s, profondeur 12 en 250 ms | 2 272 163 n/s, profondeur 11 | runners à 41 % d'écart |
| parties comptées | 2 860 | 2 880 | **5 740** |
| Elo | −2,79 ± 8,72 | +0,24 ± 9,19 | **−1,27 ± 6,34** |
| Ptnml(0-2) | [100, 296, 647, 301, 86] | [124, 272, 633, 300, 111] | homogènes, z = −0,47 |

**Intervalle [−7,6 ; +5,1] : zéro dedans, donc « pas d'effet décelable ».
Fusionné**, comme le critère le disait, au titre de l'infrastructure de B6 et
de la vitesse déjà prouvée. Les deux jobs, coupés par le plafond à 18 h 29,
comptent **zéro anomalie sur la totalité de leurs journaux** — les premiers
à le dire en entier, grâce au recensement recopié en fin de journal. Les
avertissements sont symétriques entre les deux moteurs, comme attendu d'un
changement qui ne touche pas aux nulles. ~7,3 s par partie : même facteur de
durée que C22.

**Ce qui entre dans `main`** (`481f8af`) : la table à entrées atomiques, et
`store` prend désormais `&self` — **la table se partage entre fils**, ce qui
était le seul endroit où le design bloquait B6. Banc : 31 637 à la
profondeur 5, **114 026** à la profondeur 7, 634 933 à la profondeur 10.

**Les chiffres de neutralité restent valides tels quels** : ils avaient été
mesurés sur `1b5afa8`, et C22 n'ayant pas fusionné, le banc de `main`
n'avait pas bougé depuis — le ponder est inerte au nœud près.


La réécriture est prouvée neutre à capacité forcée égale et plus rapide de
4,3 % (sections B9 plus bas). Reste l'effet que le banc ne peut pas juger :
l'entrée passe de 24 à 16 octets, donc **la table double à mémoire constante**
— 524 288 → 1 048 576 entrées à 16 Mio. Le banc ne la remplit pas ; un match,
si.

| runs | graine | parties | cadence |
|---|---|---|---|
| [35861835486](https://github.com/theodubus/chess/actions/runs/35861835486) | tirée par le run | 3000 | `8+0,08` |
| [35861838168](https://github.com/theodubus/chess/actions/runs/35861838168) | tirée par le run | 3000 | `8+0,08` |

Candidat `bd896ba` (la rustine appliquée telle quelle), révoqué aussitôt dans
le commit suivant ; référence `1b5afa8`, `main` d'avant C22. Lancés à
12 h 39 UTC, fin attendue vers 18 h.

#### Le critère — écrit AVANT de lancer

B9 n'est pas un pari sur un gain : c'est **l'infrastructure qu'exige B6**,
dont la logique est prouvée neutre et la vitesse prouvée meilleure. La
question du match est donc la même que pour un correctif de règle : **le jeu
se dégrade-t-il ?**

- **borne haute de l'intervalle mis en commun < 0** → régression
  significative : ne pas fusionner, et chercher — la seule différence de
  comportement est la capacité ;
- **borne basse > 0** → gain démontré, fusionner ;
- **entre les deux** → pas d'effet décelable : **fusionner**, au titre de
  l'infrastructure et de la vitesse déjà prouvée.

**Puissance** : ± 6,3 Elo sur 6 000 parties, comme C22.

#### La base est celle d'AVANT C22 — pourquoi ça ne fausse pas la mesure

C22 sera tranché avant B9 et fusionnera peut-être entre-temps. B9 et C22
touchent des objets **disjoints** — la capacité de la table d'un côté, la
détection des nulles à l'horizon de l'autre — et leurs rustines s'appliquent
ensemble sans conflit (`git apply --check` sur les deux). <span>Inférence,
confiance moyenne-haute : leurs effets s'additionnent sans interaction
notable.</span> C'est le contraire du cas de l'élagage delta, qui avait fondu
parce que l'échange statique coupait **les mêmes captures au même endroit**.

#### Au verdict, dans l'ordre

1. Étalonnages, pertes au temps et avertissements — désormais recopiés à la
   fin du journal par `match.yml`, donc lisibles depuis une session.
2. Mise en commun, puis le critère ci-dessus, sans le déplacer.
3. Si fusion : révoquer la révocation **sur la base du moment** — si C22 a
   fusionné, les deux s'empilent sans conflit. Refaire alors les chiffres de
   neutralité **sur le banc d'après C22** (capacité forcée : nœuds identiques
   à `main` ; capacité naturelle : le nouveau chiffre), et mettre à jour la
   référence du banc.
4. **Balayage de mutation** après la fusion : `tt.rs` est réécrit entièrement.
5. Inscrire le verdict, la table de l'attic, la fiche du carnet.

### Ponder — VERDICT, 23 sept. 2026 : +67,63 ± 9,19 Elo à `8+0,08` contre notre jumeau — l'activer rapporte

#### Le verdict — rendu à 18 h 45, sur le critère écrit avant

| | job 35866707040 | job 35866710329 | job 35866713797 | en commun |
|---|---|---|---|---|
| étalonnage | 2 998 815 n/s, profondeur 12 | 2 263 800 n/s, profondeur 11 | 2 273 883 n/s, profondeur 12 | runners à 32 % d'écart |
| graine | `1506968672` | `1506971961` | `1506975429` | distinctes |
| parties | 900 | 900 | 900 | **2 700** |
| Elo | +63,63 ± 16,78 | +64,82 ± 15,12 | +74,47 ± 15,79 | **+67,63 ± 9,19** |
| Ptnml(0-2) | [18, 55, 192, 116, 69] | [8, 56, 202, 130, 54] | [7, 55, 197, 123, 68] | homogènes, z ≤ 0,92 |
| durée | 5:11:49 — 20,79 s/partie | 5:13:14 — 20,88 | 5:09:55 — 20,66 | finis avant le plafond |

Les ± par job sont ceux de la formule pentanomiale de
`tools/mettre-en-commun.sh` ; cutechess imprime ± 19,1, 18,6 et 19,3, sa
formule trinomiale ignorant l'appariement.

**Zéro anomalie sur la totalité des trois journaux** — aucune perte au temps,
aucun coup illégal, aucune déconnexion, aucun blocage, en 2 700 parties où un
camp pondère. C'était la première condition du critère ; c'est aussi la
validation du protocole en régime réel, que les tests ne donnaient qu'en
unitaire.

**Borne basse +58,4 > 0 → l'activer rapporte ce que dit le point estimé, et
tout déploiement qui le permet l'active.** Comme le critère l'écrivait. Côté
moteur il n'y a rien à fusionner : c'est l'interface qui envoie
`setoption name Ponder value true`, et `ui/` a sa propre autorité.

#### La vraisemblance — 2,7 fois l'attendu, et où était l'écart

L'attendu écrit avant était **~+25**, confiance faible. Mesuré : **+67,6**.
Pas d'ordre de grandeur, mais un facteur qui se contrôle avant de s'inscrire.
Deux parties dans la prévision : le **mécanisme** (combien de plis) et la
**conversion** (combien d'Elo par pli). Une sonde jetable les sépare —
cutechess `-debug` en conteneur, mêmes options que `match.yml`, 20 parties à
`8+0,08`, **écart de profondeur apparié par partie** : dans une même partie,
les deux camps cherchent des positions voisines, donc le mélange de phases
s'annule, ce qu'une moyenne entre deux matchs ne ferait pas.

| sonde, 20 parties chacune | écart de profondeur apparié | temps de recherche | ce qu'elle dit |
|---|---|---|---|
| **ponder** — `136dda4`, candidat pondère | **+0,94 ± 0,20 pli** | × 1,54 | le mécanisme prévu, **0,90**, tombe dedans |
| **témoin** — `136dda4`, personne ne pondère | −0,00 ± 0,13 | × 1,00 | la méthode rend zéro quand rien ne diffère |
| **C21** — `ebe93ad` contre `6d5e7c6` | **+0,41 ± 0,20 pli** | × 1,32 | **moins que les 0,54 à 0,70** qui servaient à convertir |

> **Intervalles de Student depuis le 23 sept. au soir**, à dix-neuf degrés de
> liberté. `plis.sh` prenait 1,96 quel que soit l'effectif, ce qui rendait
> ces intervalles 7 % trop étroits — ± 0,19 et ± 0,12 publiés d'abord. Vu en
> rejouant une sonde à quatre parties, où l'écart était 38 %. Les deux
> intervalles d'Elo par pli ci-dessous en dépendent, et sont recalculés sur les
> demi-largeurs EXACTES : le « 116 » d'abord publié venait même d'une
> demi-largeur arrondie — exacte, elle donnait 112,7 à 1,96, et donne 119,4
> avec Student.

**Le mécanisme était juste, la conversion ne l'était pas.** L'attendu divisait
les +19,13 de C21 par **0,54 à 0,70 pli estimés par son budget** ; mesurés en
partie, ils valent 0,41. Recalculé sur la profondeur mesurée, l'attendu
aurait été **~+42**, et surtout son intervalle : Elo et plis de C21 portent
chacun leur incertitude, et leur rapport s'étend de **21 à 119 Elo par
pli**. Celui du ponder s'étend de **51 à 104**. *Les deux points sont
compatibles* ; le « ~+25 » écrit comme un nombre cachait un intervalle
d'un facteur cinq. **Une conversion par un point unique porte l'incertitude
des DEUX mesures qui la composent : écrire l'intervalle, pas le point.**

Deux autres causes étaient candidates, et la sonde les teste :

- **Le taux de succès contre notre jumeau** : 749 `ponderhit` sur 1 067
  `go ponder`, **0,702** — un peu au-dessus des 0,659 estimés par la
  variante principale. Il gonfle le chiffre par rapport à un autre
  adversaire, mais il était déjà dans l'attendu.
- **Le camp qui pondère vole-t-il du CPU à l'adversaire** — vers
  l'hypothèse ? En conteneur, non : la référence cherche à **2 573 899 n/s**
  pendant que le candidat pondère, **2 594 730** au témoin (−0,8 %), et sa
  profondeur ne bouge pas (14,63 contre 14,64). <span>Non mesuré sur les
  runners, dont la topologie diffère — le conteneur a quatre cœurs sans
  SMT.</span>

**Et la sonde montre ce que le ponder laisse sur la table** : le camp qui
pondère dépense **175 ms de pendule par coup, la référence 202** — 13 % de
moins. Un succès rembourse le coup ; <span>inférence, confiance moyenne : le
budget, proportionnel à ce qui reste, ne dépense pas ce remboursement avant
la fin de la partie</span>. *C'est le gisement du réglage suivant*,
« dépenser davantage quand le ponder est permis ».

#### Ce que ce chiffre ne dit pas

- **Il appartient à son adversaire**, comme `p` : contre notre jumeau, la
  prévision est la plus facile qui soit. Contre un autre moteur `p` baisse ;
  contre un humain, `p` baisse aussi mais le temps adverse s'allonge — le
  signe de l'écart n'est pas connu. **Ne jamais citer +67,6 sans
  « contre notre jumeau, à `8+0,08` ».**
- **Il ne dit rien d'un classement joué ponder désactivé** : la force du
  moteur ponder désactivé est celle d'avant, au nœud près.
- Il ne contient **aucun réglage de temps** : le candidat garde 13 % de sa
  pendule.

#### La suite

1. **Dépenser le remboursement** — le réglage de temps quand `Ponder` est
   activé. Le mécanisme se règle d'abord à la sonde, pas au match : chercher
   le supplément qui ramène la pendule dépensée par coup du camp qui pondère
   à celle de la référence (202 ms ici), puis **un** match en `les-deux`,
   critère écrit avant. <span>Ordre de grandeur, confiance faible : 13 % de
   pendule, soit ~0,27 pli à 1,36 par doublement, soit 6 à 32 Elo sur
   l'étendue de 21 à 119 Elo par pli — donc plusieurs jobs.</span>
2. **La sonde appariée par partie est devenue un outil, le soir même** :
   `tools/plis.sh <journal>`, sur la sortie de cutechess `-debug all` —
   commande complète en tête du script. Huit minutes de conteneur donnent
   les plis réellement gagnés par n'importe quel chantier de temps ou de
   vitesse : allocation inégale, génération par étapes, Lazy SMP, réglage du
   ponder. Son test, `tools/plis-test.sh`, tourne dans `verify.sh` : un
   témoin fabriqué qui doit rendre zéro, le ponder jeté qui ne doit pas
   compter, les refus ; **deux défauts injectés** — le `stop` compté comme un
   coup, l'écart pris entre moyennes globales au lieu d'être apparié —
   **tous deux attrapés**. Rejoué sur les trois journaux de la sonde, il rend
   les chiffres du tableau ci-dessus.
3. <s>**Le vol de CPU sur runner** reste non mesuré</s> — **MESURÉ le 23 sept.
   au soir : r = 0,948, le verdict tient**, mais 3 à 10 Elo des +67,63
   viennent du vol, les runners n'ayant que deux cœurs physiques. Voir « Vol
   de CPU du ponder sur runner — VERDICT ». Sans objet en `les-deux`, où il
   est symétrique.

#### Ce qui avait été lancé

Le **même binaire** des deux côtés — `Ponder` activé pour le candidat, pas
pour la référence —, joué par cutechess à une partie à la fois, selon
l'entrée `ponder = candidat` de `match.yml`. Commit `136dda4` des deux
côtés ; lancés à 13 h 23 UTC, fin attendue vers 18 h 30.

| runs | graine | parties | cadence |
|---|---|---|---|
| [35866707040](https://github.com/theodubus/chess/actions/runs/35866707040) | tirée par le run | 900 | `8+0,08` |
| [35866710329](https://github.com/theodubus/chess/actions/runs/35866710329) | tirée par le run | 900 | `8+0,08` |
| [35866713797](https://github.com/theodubus/chess/actions/runs/35866713797) | tirée par le run | 900 | `8+0,08` |

**900 parties par job, pas 1 000** : à ~20 s par partie, 1 000 frôleraient
le plafond de 350 minutes, et un job coupé ne garantit pas que son résumé —
le seul endroit où cutechess a un vecteur pentanomial — soit écrit.

#### Ce que cette mesure décide — écrit AVANT de lancer

Aucune fusion n'en dépend : le ponder est inerte tant que l'interface ne
l'active pas, et c'est prouvé au nœud près. La mesure dit **ce que vaut
l'activer**, et elle sert de point de départ au réglage suivant — dépenser
davantage quand le ponder est permis, qui se mesurera en `les-deux`.

- **une seule anomalie** — perte au temps, coup illégal, déconnexion —
  → la mesure ne vaut rien ; c'est la sémantique du temps de ponder qu'il
  faut relire avant tout le reste ;
- **borne basse > 0** → l'activer rapporte ce que dit le point estimé, et
  tout déploiement qui le permet l'active ;
- **zéro dans l'intervalle** → le mécanisme de 0,90 pli ne se retrouve pas en
  jeu : mesurer le taux de succès et la pendule en ponder réel à `8+0,08`
  **avant** tout réglage — le premier n'y est connu que par la variante
  principale, la seconde ne l'est qu'à `2+0,02` ;
- **borne haute < 0** → un défaut, pas un résultat : ne pas le recommander,
  et chercher.

**Attendu** : positif, **~+25 Elo**, en convertissant les 0,90 pli par
l'unique point du projet qui relie des plis à des Elo à cette cadence — C21,
+19,13 pour 0,54 à 0,70 pli, soit 27 à 35 Elo par pli. <span>Inférence,
confiance faible : un point de mesure, et le ponder ne gagne du temps que sur
les coups prédits, alors que C21 en gagnait sur tous.</span>

**Puissance** : ± 9,4 Elo sur 2 700 parties.

#### Au verdict, dans l'ordre

1. Anomalies des trois jobs — recopiées en fin de journal par `match.yml`.
2. `tools/mettre-en-commun.sh` sur les trois vecteurs `Ptnml` reconstruits,
   puis le critère ci-dessus, sans le déplacer.
3. Inscrire le verdict ici, dans la table « Ce qui reste à faire », dans la
   fiche du carnet ; et dire à quelle cadence il vaut.

### Vol de CPU du ponder sur runner — VERDICT, 23 sept. 2026 : r = 0,948, le verdict du ponder tient — et les runners n'ont que DEUX cœurs physiques

#### Le verdict — rendu à 23 h 58, sur la règle écrite avant

| sonde, `8+0,08`, 60 parties, `2f3bf1a` des deux côtés | rapport des n/s, coups partis d'un `go` | écart de plis apparié | taux de succès du ponder |
|---|---|---|---|
| `ponder = candidat` — [run 35933841290](https://github.com/theodubus/chess/actions/runs/35933841290) | **0,950** (candidat 2 687 240, référence 2 553 531) | +0,85 ± 0,24 | 0,681 |
| témoin — [run 35933844087](https://github.com/theodubus/chess/actions/runs/35933844087) | **1,002** (2 698 290 contre 2 704 881) | −0,02 ± 0,08 | — |

**r = 0,950 / 1,002 = 0,948 ≥ 0,93 : le verdict du ponder tient, comme la
règle écrite avant le prévoyait** — et comme l'attendu, « ≥ 0,93 ». Le témoin
rend 1,002 et un écart de plis nul : la méthode ne fabrique rien quand rien ne
diffère. Les +0,85 ± 0,24 pli du ponder sur runner retombent sur les +0,94 ±
0,20 du conteneur. Zéro anomalie dans les deux journaux.

**Ce que la ligne de topologie a trouvé, et c'est plus grand que la
question** : `4 processeurs logiques, 2 cœurs physiques, 2 fil(s) par cœur —
AMD EPYC 7763`, sur les deux runners. **Les runners ont le SMT** ; le conteneur
de session, non.

**Le vol, chiffré au-delà de la règle.** <span>Inférence, confiance
moyenne.</span> Les deux runners avaient un banc à 1 % près (2 215 051 et
2 237 531 n/s) : pour une fois, les n/s de la référence se comparent d'un run
à l'autre — 2 553 531 contre 2 704 881, soit **−4,6 %** une fois le banc
corrigé, quand le conteneur rendait −0,8 %. Le rapport dans le run, lui, rend
0,948 contre 0,966 en conteneur. Les deux disent **3 à 5 % de vitesse volés à
la référence**, soit 0,06 à 0,09 pli : **3 à 10 Elo des +67,63**, aux deux
points d'Elo par pli mesurés. C'est dans l'intervalle du verdict, et ça ne
change pas la décision — activer le ponder quand le déploiement le permet.
**Mais +67,63 se cite désormais avec cette réserve.** Tout futur match
`candidat` seul porte le même biais ; le réglage du remboursement se mesure
en `les-deux`, où il est symétrique.

#### Ce que deux cœurs physiques changent ailleurs

- **Tous les matchs à concurrence 3** mettent trois moteurs en réflexion sur
  deux cœurs physiques. Le partage est symétrique entre candidat et référence,
  donc **chaque verdict reste valide en interne**. Mais le point de
  fonctionnement réel — la profondeur atteinte EN PARTIE — est plus bas que
  ne le dit l'étalonnage, qui mesure un banc seul sur la machine. De combien,
  ce n'est pas mesuré (liste de surveillance).
- **B6** : sur ces runners, Lazy SMP ne se mesure sans SMT qu'à **deux fils**.
  Le « 1,0 à 1,8 pli » hérité supposait quatre vrais cœurs ; un gain mesuré
  ici en sera un minorant pour une machine qui en a plus.
- La table de « La concurrence d'un match se DÉDUIT des cœurs » compte des
  processeurs logiques ; elle le dit désormais.

#### La règle et le protocole, tels qu'écrits avant de lancer

Le verdict du ponder (+67,63 ± 9,19) a été rendu sur des runners dont
**personne n'avait regardé la topologie** : « quatre cœurs » peut vouloir dire
deux cœurs physiques à deux fils chacun, et deux fils d'un même cœur s'en
partagent les unités de calcul. Si le candidat pondère sur le cœur frère de la
référence, il la ralentit — **vers l'hypothèse**. En conteneur, quatre cœurs
sans SMT, le vol mesuré est nul (−0,8 %, section ponder). Sur runner, rien.

**Ce qui le mesure.** `match.yml` imprime désormais la topologie du runner, et
sa sonde fait rendre à `tools/plis.sh` le rapport des n/s **dans un même run**
— la référence, qui cherche pendant que le candidat pondère, contre le
candidat quand il cherche seul, sur ses coups partis d'un `go` ordinaire. Même
binaire, même machine : la vitesse du runner, qui varie de 22 à 58 %, s'annule.
Un témoin sans ponder donne le même rapport sans contention.

**Sa limite, mesurée avant de lancer.** Rejoué sur les journaux de conteneur,
le rapport vaut **1,010 au témoin et 0,976 en ponder** — soit 0,966, quand les
n/s de la référence d'un run à l'autre ne bougeaient que de −0,8 %. L'écart
vient de l'échantillon : chez le camp qui pondère, les coups partis d'un `go`
suivent un ponder MANQUÉ. **Le rapport sépare donc un vol massif d'une absence
de vol, pas 2 % de 0 %.** C'est suffisant pour la question posée : ce qui
biaiserait le verdict, c'est un cœur partagé, qui coûte des dizaines de pour
cent, pas quelques-uns.

**La règle — écrite AVANT de lancer.** Deux sondes, même commit (`main`),
`8+0,08`, soixante parties chacune, graine « auto » : l'une `ponder =
candidat`, l'autre témoin. On lit `r = rapport en ponder / rapport au témoin`,
et la ligne de topologie.

| `r` | ce que ça veut dire | ce qu'on fait |
|---|---|---|
| ≥ 0,93 | pas de cœur partagé — le conteneur, où le vol est nul, rend 0,966. Borne dure : même si tout l'écart à 1 était du vol, 7 % de n/s font 0,14 pli | le verdict du ponder tient ; la question est close |
| < 0,85 | cœur partagé : ≥ 0,3 pli volés à la référence, soit ~15 à 30 Elo du verdict aux deux points mesurés | épingler chaque moteur à son cœur physique (`taskset`), **remesurer le ponder**, et corriger le verdict publié avant tout autre match `candidat` |
| entre les deux | le confondant ne se sépare plus du vol | les deux sondes dans UN job, pour comparer les n/s de la référence d'un run à l'autre sur la même machine |

<span>Attendu, confiance moyenne : ≥ 0,93. Un ordonnanceur Linux place deux fils
actifs sur deux cœurs physiques distincts quand il en a le choix, et une partie
à la fois n'en occupe que deux sur quatre processeurs logiques.</span>

### Calibrer l'Elo par pli — VERDICT, 24 sept. 2026 : un doublement vaut +107,7 ± 8,2 Elo et +1,38 ± 0,28 pli, soit 60 à 105 Elo par pli

Décidé par Théo le 23 sept. au soir, premier chantier après les relèves. Le
projet compare ses chantiers en plis — 1,36 par doublement de temps — mais ne
sait pas ce qu'un pli vaut : deux points, **21 à 119** (C21) et **51 à 104**
(ponder) Elo par pli. Trop large pour classer la génération par étapes
(0,21 pli), le remboursement du ponder (~0,27) ou Lazy SMP (1,0 à 1,8).

**Et les deux points mêlent deux machines** : leurs plis viennent de sondes en
conteneur, leur Elo de matchs sur runner, plus rapide d'un demi-pli environ.
Cette mesure-ci prend les deux sur runner.

**Le protocole.** Le même binaire des deux côtés, `main`. Le candidat joue à
`16+0,16`, la référence à `8+0,08` : exactement un doublement de pendule, à la
cadence cible.

- **l'Elo** : deux matchs à longueur fixe, fastchess, 1 900 parties chacun,
  graine « auto », mis en commun par `tools/mettre-en-commun.sh` ;
- **les plis** : une sonde, mêmes cadences, cent parties, une à la fois —
  l'écart de profondeur apparié par partie, dans le régime réel.

Elo par pli = Elo du doublement / plis du doublement, **avec l'intervalle des
deux**, jamais le point.

#### Le verdict — rendu à 05 h 13 le 24 sept., sur le protocole écrit avant

| | [run 35933846266](https://github.com/theodubus/chess/actions/runs/35933846266) | [run 35933847908](https://github.com/theodubus/chess/actions/runs/35933847908) | en commun |
|---|---|---|---|
| runner | EPYC 7763, 2 192 324 n/s, profondeur 12 | EPYC 9V74, 2 020 660 n/s, profondeur 12 | |
| parties | 1 900, finies avant le plafond | 1 900, finies avant le plafond | **3 800** |
| Elo du doublement | +108,54 ± 11,42 | +106,94 ± 11,75 | **+107,74 ± 8,19** |
| Ptnml(0-2) | [14, 75, 371, 302, 188] | [19, 78, 366, 291, 196] | homogènes, z = 0,19 |

- **Zéro anomalie** sur les deux journaux entiers ; 10,75 et 10,79 s par partie.
  **Graines différentes, vérifié avant d'additionner** : 35933846266 et
  35933847908, tirées par « auto » — deux jobs de même graine n'auraient été
  que deux copies d'un même match.
- **Elo par pli = 107,74 ± 8,19 / 1,38 ± 0,28 : de 60 à 105**, bornes croisées
  comme pour les deux points antérieurs — le point, 78, ne s'écrit pas seul.
  L'incertitude vient presque toute des PLIS (± 20 %) : l'Elo, lui, est à
  ± 8 %. *Resserrer la conversion demande une sonde plus longue, pas un
  match de plus.*
- **L'attendu écrit avant tient** : 70 à 144 Elo pour le doublement, mesuré
  107,7 ; 51 à 104 Elo par pli, mesuré 60 à 105. Les deux points antérieurs
  sont compatibles — le ponder rend 72 Elo par pli à son point (67,63 / 0,94),
  C21 47 (19,13 / 0,41), dans son intervalle de 21 à 119.
- **Ce que l'étalon convertit**, dans le régime de ces matchs (`8+0,08`, trois
  parties à la fois sur deux cœurs physiques) : Lazy SMP à deux fils,
  +0,48 ± 0,08 pli mesurés → **24 à 59 Elo attendus** ; la génération par
  étapes, 0,21 pli → **13 à 22** ; le remboursement du ponder, ~0,27 pli →
  **16 à 28**. Des intervalles, qui se multiplient par l'incertitude des plis
  de chaque chantier.
- **Ce qu'il ne dit pas** : l'Elo par pli à une autre cadence. Il dépend de la
  profondeur où l'on joue ; mesuré ici autour de la profondeur 14 à 16.

#### Les plis — rendus à 00 h 27 le 24 sept. : +1,38 ± 0,28 pli pour un doublement, en partie, sur runner

| [run 35933850590](https://github.com/theodubus/chess/actions/runs/35933850590) — sonde, 100 parties, graine 1574112222 | candidat `16+0,16` | référence `8+0,08` |
|---|---|---|
| profondeur moyenne des coups joués | 15,59 | 14,16 |
| temps de recherche par coup | 420,4 ms | 210,1 ms — **× 2,00** |
| écart apparié par partie | **+1,38 ± 0,28 pli** (Student, 99 degrés de liberté) | |

**La pendule doublée se traduit exactement en temps doublé par coup**, et
**le doublement rend 1,38 pli EN PARTIE** — les 1,36 mesurés le 22 sept. à
positions fixes, en conteneur, tombent au milieu de l'intervalle. La
conversion temps → plis du projet tient donc sur les deux machines et dans le
régime réel. Zéro anomalie ; topologie : deux cœurs physiques, comme partout.

L'Elo de ce job — +127 ± 62 sur cent parties — **n'est pas la mesure** : il
attend les deux matchs de 1 900 parties. Avec ces plis, l'attendu écrit
ci-dessous devient 1,38 × 51 à 104 = **70 à 144 Elo**, à peine déplacé.

**L'attendu — écrit AVANT de lancer.** <span>Inférence, confiance moyenne : si
les deux points existants disent vrai, leur intersection (51 à 104 Elo par
pli) et 1,36 pli par doublement donnent **69 à 141 Elo** pour le doublement.</span>
Un Elo par pli hors de 51 à 104 dirait qu'une des deux conversions existantes
était fausse — probablement par le mélange des machines.

**Ce que la mesure ne décide pas.** Rien ne fusionne : c'est un étalon. Il
convertit ensuite chaque chantier de vitesse ou de temps en Elo attendu, donc
en budget de match — ce que la relation `parties × Elo` ne sait faire qu'avec
un Elo en entrée.

### Une cadence par moteur, et la sonde — ce que `match.yml` sait depuis le 23 sept. au soir

Deux entrées, écrites pour la calibration et le vol de CPU, et qui serviront à
B6.

- **`cadence_candidat`** — la pendule du seul candidat ; `cadence` est
  toujours celle de la référence. Différentes, elles admettent le même commit
  des deux côtés : c'est le match à handicap de temps. Les deux arbitres
  prennent un `tc=` par moteur, **mais un `tc=` dans `-each` écrase ceux des
  moteurs** — vérifié sur les deux : le candidat recevait `wtime 1010` au lieu
  de 2020. `match.yml` ne le met donc plus jamais dans `-each`.
- **`sonde = oui`** — cutechess avec `-debug all`, **une partie à la fois**
  (`plis.sh` apparie par numéro de partie), et la sortie de `tools/plis.sh`
  dans le résumé : profondeur, pendule, n/s de chaque camp, écart apparié,
  rapport des n/s. Admet le même commit (le témoin). Le dialogue UCI fait
  ~0,5 Mo par partie à `8+0,08` : il va dans l'artefact `match-log`, le journal
  du job n'en reçoit que la progression.
- **La topologie du runner** entre dans l'étalonnage et le résumé :
  processeurs logiques, cœurs physiques, fils par cœur, modèle.

Rejoué en local avant d'être poussé, étape par étape : la garde du même commit
refuse sans raison et admet en sonde ; la sonde témoin, la sonde avec ponder et
le handicap sous fastchess tournent de bout en bout — fastchess imprime
lui-même `2+0.02 - 1+0.01` en tête de ses résultats ; le chemin ordinaire à
deux commits ne change pas.

**`plis.sh` y a gagné deux corrections.** Le rapport des n/s des coups partis
d'un `go`, et **un intervalle de Student** au lieu de 1,96 : à vingt parties,
les intervalles publiés étaient 7 % trop étroits (section ponder).

### B6 — Lazy SMP — VERDICT, 24 sept. 2026 : +42,16 ± 9,23 Elo à deux fils contre un, à `8+0,08` — deux fils rapportent

#### Ce qui est écrit

- **L'option UCI `Threads`**, 1 par défaut, de 1 à <s>64</s> **1 024** depuis le verdict. À `T` fils, `T − 1`
  auxiliaires cherchent la même position par le même approfondissement, sur
  la même table — partagée par un `Arc`, possible depuis B9 —, sans pendule
  ni rapport. **Seul le fil principal rend le coup et la variante.**
- **Aucun décalage de profondeur entre les fils.** C'est une variante connue ;
  la version la plus simple se mesure d'abord, et la variante se mesurera
  seule si celle-ci ne rend pas ce qu'on attend. Pas recopiée d'avance.
- Les auxiliaires se créent une fois, par `set_threads`, pas à chaque coup —
  chacun porte une ardoise de 256 Kio ; `resize_table` les refait sur la
  nouvelle table.
- **Les nœuds** : chaque auxiliaire publie son compte tous les
  `CHECK_INTERVAL` nœuds et son reste en finissant. `info nodes` et `go nodes`
  comptent tous les fils. Un compteur commun incrémenté à chaque nœud aurait
  coûté une instruction verrouillée par nœud.
- **Corrigé le 24 sept. : le budget de `go nodes` débordait sans borne.** Seul
  le fil principal le tenait ; privé de CPU, il laissait les auxiliaires
  chercher sans rien vérifier. Reproduit en serrant les trois fils sur un seul
  cœur (`taskset -c 0`) : **66 792 et 68 177 nœuds pour un budget de 50 000**,
  deux échecs sur six. Trouvé par le balayage de mutation local d'A18 : un
  mutant sans effet logique — la garde de débordement de `stage_moves` —
  s'y déclarait « attrapé » par `le_budget_de_noeuds_compte_tous_les_fils`.
  Désormais **tous les fils publient** dans un compteur commun, principal
  compris, et **chacun tient le budget** sur le total : le dépassement est
  borné par deux intervalles non publiés par autre fil, quel que soit
  l'ordonnancement. Sous `taskset -c 0` : **0 échec sur 30**. Deux tests
  neufs, chacun éprouvé par son témoin — l'auxiliaire qui ignore le budget
  (40 059 nœuds au lieu de 10 000), le fil principal qui ne publie pas. Banc
  au nœud près, `timing.sh` 12/30 (p = 0,57) : rien à un fil, où seule une
  addition atomique tous les 2 048 nœuds s'ajoute. Le jeu à la pendule n'est
  pas touché : sans budget de nœuds, rien ne change pour les auxiliaires.
- **L'arrêt** : la fin de la recherche principale lève le drapeau des
  auxiliaires par un garde qui tient aussi en cas de panique —
  `std::thread::scope` attend tous ses fils, et un auxiliaire jamais arrêté
  ferait attendre `go` pour toujours.

#### Neutre à un fil — prouvé, pas supposé

- **Banc au nœud près** : 114 026 à la profondeur 7, 642 442 à la profondeur 10.
- **Vitesse**, `tools/timing.sh` contre `main` (`8dbb133`) : 11/30 (p = 0,20),
  24/60 (p = 0,19), puis un **relevé décisif de 100 paires, règle fixée
  d'avance** — p < 0,05 et candidat plus lent, le coût est réel et se documente
  avant de fusionner : **43/100, p = 0,31, aucun écart démontré.** Les trois
  penchent du même côté, +0,5 à +1,4 % sur la médiane : un coût de l'ordre de
  1 % n'est pas exclu, et il ne se démontrerait qu'avec des centaines de
  paires. *Réunir les trois relevés après coup reviendrait à choisir
  l'effectif en voyant les données.*
- **Six tests à plusieurs fils et un test UCI**, chacun éprouvé par un défaut
  injecté : publication vide, `-` en `+`, total en `-`, budget sur le seul fil
  principal, redimensionnement qui oublie les auxiliaires, garde d'arrêt vidé —
  ce dernier fait échouer le test d'arrêt en vingt secondes au lieu de pendre.

#### Un contrôle grossier en conteneur, pas une mesure

Quatre cœurs physiques sans SMT, 12 positions tirées du livre, `go depth 13`,
temps de la dernière ligne `info` : le temps est divisé par **1,36** à deux
fils et **1,87** à quatre (moyennes géométriques ; 0,77 à 2,05 et 1,55 à 2,15
selon la position). Soit ~0,6 et ~1,25 pli à 1,38 pli par doublement. **Ce
n'est pas la force** — un temps jusqu'à une profondeur, sur des positions
d'ouverture, un relevé par position et non déterministe : il dit seulement
que l'implémentation accélère, avant de dépenser un runner.

#### Ce que font les listes, les tournois et les autres moteurs — vérifié le 24 sept. 2026

Question de Théo : « a-t-on le droit à un nombre de cœurs libre en compétition,
ou c'est 4 au plus ? ». **Le cadre était faux** : ce n'est jamais le moteur qui
choisit — l'organisateur fixe la machine et règle `Threads` pour chacun ; le
moteur doit bien employer ce qu'on lui donne, quel qu'en soit le nombre.

- **CCRL 40/15** : chaque moteur y est testé à **1 et à 4 fils**, en deux
  entrées distinctes — le suffixe « 4CPU » désigne la seconde, l'absence de
  suffixe la première ; la table est quadruplée à 4 fils. **CCRL Blitz**
  (`2'+1"`) : **1 et 8 fils** (« 8CPU »), **ponder désactivé**. Sources : les
  pages de conditions du CCRL et des fils de TalkChess, **lues par le moteur de
  recherche seulement** — le proxy de la session bloque les deux sites.
  Confiance moyenne à élevée : plusieurs sources concordent.
- **TCEC** : tous les moteurs sur un même serveur ; celui de la saison 28 est
  donné pour **2 × AMD EPYC 9754, 256 cœurs / 512 fils** (Chessdom,
  TalkChess — secondaires, un résumé portait aussi « 52 cœurs / 104 fils »,
  divergence non levée). Combien de fils chaque moteur reçoit : **non vérifié**.
- **Stockfish** — lu dans son source le 24 sept. : `Threads` vaut 1 par
  défaut, **au plus `max(1024, 4 × fils matériels)`** ; le coup joué est celui
  du **meilleur fil** (`get_best_thread`), pas toujours du principal ; certains
  historiques sont **partagés** entre fils. Lazy SMP y remplace YBWC depuis
  Stockfish 7, janvier 2016 (PR #467). Variante courante ailleurs : des fils
  lancés à des profondeurs différentes.

**Ce que ça change ici.** (1) <s>**`MAX_THREADS` vaut 64** : une borne sous les
machines de TCEC.</s> **Relevé à 1 024 le 24 sept., après le verdict**, comme
Stockfish : au-dessus des machines de compétition. Chaque auxiliaire occupe
**345 Kio** de mémoire résidente (mesuré : 21 760 Kio pour 63 auxiliaires),
soit ~345 Mio à 1 024 fils. La relever ne change rien à 1 ou 2 fils ;
**l'échelle au-delà de deux fils reste non mesurée**, les runners n'ayant que
deux cœurs physiques et le conteneur quatre — écrit comme tel dans le code.
Et les auxiliaires sont relancés à chaque `go` : à des centaines de fils,
créer les fils coûtera un temps que personne n'a mesuré. (2) Notre Lazy SMP
est la forme la plus simple : fil principal seul décideur, aucun décalage de
profondeur, pas de vote du meilleur fil, pas d'historique partagé — autant de
variantes à mesurer, chacune seule. (3) Sur les listes, **la force monofil
reste une entrée à part entière** : le multifil s'ajoute, il ne la remplace pas.
(4) **Ponder désactivé au CCRL Blitz** : le remboursement du ponder ne sert que
là où le ponder est permis.

#### La mesure à deux fils — écrite AVANT de lancer

Sur les runners, deux cœurs physiques : Lazy SMP ne s'y mesure qu'à **deux
fils**, et `match.yml` refuse davantage. Deux mesures, sur le SHA fusionné,
contre lui-même à un fil :

1. **La sonde** — `sonde = oui`, `fils_candidat = 2`, `8+0,08`, 60 parties.
   Elle rend les plis gagnés en partie, appariés par partie, et le rapport des
   n/s, qui mesure ici le **parallélisme obtenu** (≈ 2 si chaque fil a son
   cœur), pas un vol. **Attendu, confiance faible** : +0,4 à +1,1 pli — un
   temps effectif multiplié par 1,2 à 1,7, à 1,38 pli par doublement. Le
   « 1,0 à 1,8 pli » hérité supposait quatre vrais cœurs. **Rapport des n/s
   attendu entre 1,7 et 2,0 ; sous 1,5, les deux fils se disputent un cœur, et
   la mesure d'Elo ne se lance pas avant d'avoir compris pourquoi.**
2. **L'Elo** — `fils_candidat = 2`, `8+0,08`, longueur fixe, graine « auto »,
   **trois jobs de 900 parties** (une partie à la fois), mis en commun par
   `tools/mettre-en-commun.sh`. **Critère** : borne basse > 0 → deux fils
   rapportent contre notre jumeau monofil ; borne haute < 0 → Lazy SMP tel
   qu'écrit coûte, et le moteur n'annonce plus `Threads` tant que la cause
   n'est pas trouvée ; entre les deux → pas de conclusion, des parties de
   plus. Converti en plis par la calibration en cours, **en intervalle**.

#### La sonde — rendue à 02 h 58 : +0,48 ± 0,08 pli, n/s × 2,05 — l'Elo est lancé

| [run 35947696926](https://github.com/theodubus/chess/actions/runs/35947696926) — 60 parties, graine 1587958558 | candidat, 2 fils | référence, 1 fil |
|---|---|---|
| profondeur moyenne des coups joués | 16,84 | 16,40 |
| temps de recherche par coup | 189,4 ms | 189,4 ms |
| n/s des coups partis d'un `go` | 8 687 555 | 4 235 194 — **× 2,05** |
| écart apparié par partie | **+0,48 ± 0,08 pli** (Student) | |

- **Lue sur la règle écrite avant.** Le parallélisme passe largement le seuil
  de 1,5 : les deux fils ont chacun leur cœur physique. Les plis tombent dans
  l'attendu (+0,4 à +1,1), à son bas. Zéro anomalie.
- **Ce que ça dit de Lazy SMP ici** : deux fois plus de nœuds n'achètent que
  **+0,48 pli**, soit le pli d'un temps multiplié par ~1,27 — une bonne part du
  travail des auxiliaires recoupe celui du fil principal. C'est la forme
  connue de la technique ; ce que les plis ne disent pas, c'est ce que les
  auxiliaires apportent AUTREMENT qu'en profondeur — des entrées de table
  meilleures —, et c'est le match qui le dira.
- **Le contrôle grossier en conteneur annonçait ~0,6 pli** (temps jusqu'à une
  profondeur, 12 positions d'ouverture) : même ordre, un peu au-dessus.
- **Un nouveau modèle de runner** : AMD EPYC 9V45, **4 064 503 n/s** au banc et
  la profondeur 13 en 250 ms — le plus rapide jamais relevé ici (étendue
  connue 2,07 à 3,43 M sur EPYC 7763). Les runners ne diffèrent plus seulement
  de vitesse, mais de modèle. Valide en interne, comme toujours.
- **Attendu du match, confiance faible** : 0,48 pli × 51 à 104 Elo par pli
  (ponder) donne **+20 à +55 Elo** ; la calibration en cours resserrera la
  conversion. **Lancés à 02 h 59** : trois jobs de 900 parties, EN VOL.
  **Calibration rendue à 05 h 13** : 60 à 105 Elo par pli, donc **24 à 59 Elo**
  attendus — le même ordre, écrit avant que les matchs ne rendent.

#### L'Elo — rendu à 08 h 28 : +42,16 ± 9,23, deux fils rapportent

| | [35949564324](https://github.com/theodubus/chess/actions/runs/35949564324) | [35949565830](https://github.com/theodubus/chess/actions/runs/35949565830) | [35949567986](https://github.com/theodubus/chess/actions/runs/35949567986) | en commun |
|---|---|---|---|---|
| runner | Xeon Platinum 8370C | EPYC 9V74 | EPYC 9V74 | deux cœurs physiques chacun |
| étalonnage | 2 164 200 n/s, prof. 12 | 2 202 024 n/s, prof. 12 | 2 216 102 n/s, prof. 12 | à 2,4 % près |
| parties | 900 | 900 | 900 | **2 700** |
| Elo | +35,64 ± 15,54 | +49,36 ± 16,51 | +41,50 ± 15,87 | **+42,16 ± 9,23** |
| Ptnml(0-2) | [16, 77, 201, 111, 45] | [21, 62, 194, 115, 58] | [19, 70, 192, 123, 46] | homogènes, \|z\| ≤ 1,19 |

- **Lu sur le critère écrit avant** : borne basse +32,9 > 0 — **deux fils
  rapportent contre notre jumeau monofil**. Les trois jobs, finis entiers en
  5 h 26 (21,8 s par partie, une à la fois), comptent **zéro perte au temps,
  zéro coup illégal** sur la totalité de leurs journaux, et cinq
  avertissements d'arbitre en tout, répartis entre les deux moteurs.
- **Dans l'attendu écrit avant les matchs** : +24 à +59 Elo, par les plis de
  la sonde et l'étalon. Le point tombe au milieu.
- **En plis, par l'étalon : 0,31 à 0,86** (bornes croisées, 32,9 ÷ 105 et
  51,4 ÷ 60). La sonde en mesurait +0,48 ± 0,08 : compatible.
- **Un quatrième point Elo par pli** : 42,16 ÷ 0,48, soit **59 à 128 Elo par
  pli** en bornes croisées — après C21 (21 à 119), le ponder (51 à 104) et
  l'étalon (60 à 105). Tous compatibles. <span><strong>Inférence, confiance
  faible</strong> : le point de B6 (88) au-dessus du centre de l'étalon (78)
  laisserait aux auxiliaires un apport AUTRE que la profondeur — des entrées
  de table meilleures ; la largeur des intervalles ne permet pas de le
  distinguer du hasard.</span>
- **Ce que ce chiffre n'est pas** : la force contre un autre moteur, ni à plus
  de deux fils. C'est un match contre notre propre version monofil, sur deux
  cœurs physiques. **L'échelle au-delà de deux fils n'est pas mesurée** — les
  runners n'en ont que deux ; le conteneur, quatre, n'a servi qu'au contrôle
  grossier du temps jusqu'à une profondeur.
- **Ce que ça change** : le moteur garde `Threads`, à 1 par défaut — l'usage
  UCI, et le régime déterministe du banc et des tests. `MAX_THREADS` se relève
  au-delà de 64 : la borne doit rester au-dessus des machines de compétition
  (section précédente).

### A18 — génération par étapes — VERDICT, 24 sept. 2026 : +23,10 ± 6,39 Elo à `8+0,08` — gain démontré, FUSIONNÉ

Décidée par Théo le 24 sept. au matin (« Ce qui reste à faire »). Candidat
**`087edb8`**, révoqué aussitôt par `908ed46` ; la rustine
`tools/attic/a18-generation-par-etapes.patch` en garde une copie.

#### Ce qui est écrit

- **Le `MovePicker`** : `negamax` tire ses coups un à un, par étages — le coup
  de la table, les tactiques par MVV-LVA, les killers, les tranquilles par
  historique. Un étage n'est généré qu'au moment où on en a besoin : un nœud
  qui coupe sur le coup de la table ne génère rien du tout.
- **Ce n'est pas une optimisation pure, et les deux écarts d'ordre sont
  nommés** : les ex æquo se départagent au sein de chaque étage — le tri reste
  `sort_unstable`, qui ne les départage pas comme sur la liste entière — et
  les tranquilles sont notés avec l'historique **mis à jour** par les coups
  déjà cherchés, non tel qu'il était à l'entrée du nœud. Quiescence :
  inchangée, sauf le correctif qui suit.
- **Le partage tactique/tranquille est exact**, et un défaut de la quiescence
  s'est corrigé en route. Son filtre ajoutait la case de prise en passant aux
  cibles de TOUTES les pièces : un cavalier ou un fou qui s'y posait — une
  case vide — passait pour une capture, et la quiescence cherchait ce coup
  tranquille. `cozy-chess` pose cette case après **chaque** double pas de pion,
  qu'un pion adverse puisse prendre ou non. Le défaut contredisait la doc de
  `ordered_moves` (« seuls les coups qui changent le matériel »). Seul, le
  correctif déplace le banc de **5, 37 et 195 nœuds** aux profondeurs 5, 7
  et 10, soit 0,03 %.
- **Deux défauts attrapés avant le commit.** Le compte des coups rendus,
  incrémenté en fin de boucle, restait à zéro quand le premier coup coupait :
  `negamax` aurait déclaré mat un roi en échec qui prend la dame adverse —
  vu à la relecture, puis tenu par un test. Et un killer qui promeut ici
  était rendu deux fois — trouvé par le test « chaque coup légal exactement
  une fois », qui passe au sélecteur des killers quelconques.
  `remember_quiet` ne retient jamais de promotion, mais le sélecteur ne s'y
  fie pas.
- **Tests** : cinq neufs (`move_picker_tests`) sur six positions pièges et une
  marche seedée de 60 parties, quatre adaptés. **Quatorze défauts injectés,
  tous attrapés** : chacune des quatre gardes d'un killer retirée, la case de
  prise en passant cible de toutes les pièces ou oubliée, le pion de 7e
  rangée mal classé, l'étage tranquille qui rend tout, les omissions
  (killers, coup de la table) retirées, le tri inversé, les notes échangées,
  le compte après la coupure. **Une assertion tautologique corrigée** : le
  test des killers vérifiait « pas à un autre ply » par
  `assert_eq!(f(x), f(x))`.

#### Hors partie : le sélecteur va 10 à 14 % plus vite par nœud, et le banc disait le contraire

| | banc, 6 positions | 400 positions de vraies parties, prof. 10 | 150 de ces positions, prof. 12 |
|---|---|---|---|
| nœuds | −4,4 % à 7, −2,0 % à 10 — puis **+27,6 % à 11, +14,9 % à 12** | +1,7 % — moyenne géométrique × 1,016, médiane × 1,000 | −2,2 % — × 1,021, médiane × 1,006 |
| temps | **+15,9 % à 11, +4,8 % à 12** | **−10,7 %** | **−11,3 %** |
| n/s | × 1,10 | × 1,14 | × 1,10 |

- **Le banc renversait le signe du temps.** À la profondeur 12, la position
  initiale y grossit de **+66 %** à elle seule, quand quatre des six
  positions rétrécissent : un changement d'ordre déplace la taille de chaque
  arbre dans les deux sens, et six positions ne moyennent rien. Sur des
  positions de parties, l'arbre ne bouge pas (médianes × 1,000 et × 1,006) et
  le temps baisse de 11 %. Même piège que « le banc n'est pas un échantillon
  de jeu », sous une forme qui inverse une conclusion (`CLAUDE.md`).
- **Ce sont des positions visitées à froid** — table vidée entre chacune —,
  pas des parties : « un moteur qui démarre froid n'est pas un moteur en
  partie ». La sonde, ci-dessous, mesure le régime réel.
- **Le plafond mesuré le 22 sept. était 11,5 % du temps** (section « La
  génération par étapes, et le bon dénominateur ») ; 10,7 et 11,3 % épargnés
  le rejoignent. Le plafond était dit minorant — cache chaud —, et le n/s
  × 1,14 le dépasse un peu.
- **Une variante écartée par la mesure.** Retenir, à l'étage tactique, les
  destinations tranquilles de chaque pièce, pour que l'étage tranquille ne
  rappelle pas le générateur de `cozy-chess` : même arbre au nœud près, et
  `tools/timing.sh` rend **19/40, p = 1,0** — aucun écart. Le second appel au
  générateur ne coûte rien de mesurable ; la version simple reste.

#### Le balayage de mutation du code neuf — local, prédit avant

72 mutants filtrés sur le code neuf, et le même filtre sur `main` en témoin.
**Candidat : 2 survivants, 62 attrapés, 6 inviables, 2 expirés.** Les deux
survivants existent déjà sur `main` — la garde de débordement
d'`ordered_moves`, et `*` en `+` dans la note des promotions, déplacée de
`score_move` à `tactical_score` : l'ordre relatif n'y change qu'entre deux
promotions qui capturent des pièces différentes, et le banc à la profondeur 5
n'en rencontre pas. **La prédiction écrite avant était fausse sur un point** :
elle donnait pour survivant neuf certain la garde de débordement de
`stage_moves`, équivalente. Elle a été « attrapée » — par un test à
plusieurs fils instable, et c'est ainsi qu'est apparu le défaut du budget de
nœuds de B6 (section B6, « Corrigé le 24 sept. »). Correction faite, cette
garde doit survivre : **attendu au balayage suivant la fusion d'A18,
`search.rs` 38 → 39.**

#### La mesure — écrite AVANT de lancer

Candidat `087edb8` contre son parent `d01183d` (`main`), `8+0,08`.

1. **La sonde** — `sonde = oui`, **100 parties**. Elle rend les plis gagnés
   en partie, appariés par partie, et le rapport des n/s. **Attendu, confiance
   moyenne** : n/s × 1,08 à 1,15 ; **+0,10 à +0,25 pli** — un temps divisé
   par ~1,12 vaut 0,16 doublement, soit ~0,23 pli à 1,38 pli par doublement,
   et le plafond du 22 sept. donnait 0,21. **Règle** : n/s ≤ 1,00, ou un
   intervalle des plis entièrement ≤ 0 → le mécanisme ne se retrouve pas en
   partie : pas de match avant d'avoir compris pourquoi. Sinon, le match.
2. **L'Elo** — longueur fixe, graine « auto », **deux jobs de 3 000
   parties**, coupés par le plafond vers 2 880, mis en commun par
   `tools/mettre-en-commun.sh`. **Attendu, confiance faible** : 0,10 à 0,25
   pli × 60 à 105 Elo par pli, soit **+6 à +26 Elo**. **Critère** :
   - borne haute de l'intervalle mis en commun < 0 → régression : ne pas
     fusionner, et chercher. Les suspects sont les deux écarts d'ordre
     nommés plus haut : les ex æquo, et l'historique frais.
   - borne basse > 0 → gain démontré : fusionner.
   - entre les deux → pas d'effet décelable : **fusionner**, au titre de la
     vitesse — mesurée hors partie, puis en partie par la sonde — et du
     correctif de la quiescence. Les étages sont aussi la forme sur laquelle
     s'écrirait tout raffinement d'ordonnancement futur (coup de réfutation,
     historique de continuation), sans qu'aucun ne soit décidé.
   - **Puissance** : ± 6,3 Elo sur ~5 760 parties. Une régression de 1 à 3 Elo
     passerait inaperçue, et c'est accepté *parce que c'est écrit*.

#### La sonde — rendue à 08 h 29 : n/s × 1,09, +0,17 ± 0,07 pli — l'Elo est lancé

| [run 35971800328](https://github.com/theodubus/chess/actions/runs/35971800328) — 100 parties, graine 1612061960, EPYC 7763 | candidat `087edb8` | référence `d01183d` |
|---|---|---|
| profondeur moyenne des coups joués | 15,11 | 14,91 |
| temps de recherche par coup | 206,3 ms | 205,9 ms |
| n/s des coups partis d'un `go` | 2 739 260 | 2 514 112 — **× 1,09** |
| écart apparié par partie | **+0,17 ± 0,07 pli** (Student) | |

- **Lue sur la règle écrite avant** : n/s au-dessus de 1,00, plis entièrement
  positifs — le mécanisme se retrouve en partie. **Dans l'attendu** sur les
  deux grandeurs : × 1,08 à 1,15 attendu, × 1,09 mesuré, au bas ; +0,10 à
  +0,25 pli attendu, +0,17 mesuré. Zéro anomalie, temps de recherche égal
  (× 1,00) : la sonde compare bien deux vitesses à pendule égale.
- **Le n/s en partie (× 1,09) est au bas de ce que disaient les positions
  visitées à froid (× 1,10 à 1,14).** <span><strong>Inférence, confiance
  faible</strong> : en partie, la table est chaude et coupe davantage sur le
  coup de la table, étage que les deux versions servent au même prix — la
  part du travail que le sélecteur épargne y est plus petite.</span>
- **Attendu de l'Elo, resserré par la sonde et l'étalon** : 0,10 à 0,24 pli ×
  60 à 105 Elo par pli, soit **+6 à +25 Elo**, confiance faible. Deux jobs
  lancés à 08 h 31 (section « Ce qui est EN VOL »).

#### L'Elo — rendu à 14 h 22 : +23,10 ± 6,39, gain démontré — FUSIONNÉ

| run | graine | runner, n/s au banc | profondeur en 250 ms | parties | Elo | `Ptnml(0-2)` |
|---|---|---|---|---|---|---|
| [35975781390](https://github.com/theodubus/chess/actions/runs/35975781390) | 35975781390 | 2 196 259 | 12 | 2 880 | +27,81 ± 8,87 | 69, 247, 652, 329, 143 |
| [35975784326](https://github.com/theodubus/chess/actions/runs/35975784326) | 35975784326 | 2 239 070 | 12 | 2 860 | +18,36 ± 9,20 | 87, 260, 651, 279, 153 |
| **en commun** (`tools/mettre-en-commun.sh`) | | | | **5 740** | **+23,10 ± 6,39** | homogènes, z = 1,45 |

- **Lu sur le critère écrit avant** : borne basse +16,7 > 0 — **gain
  démontré : fusionner.** Coupés par le plafond comme prévu, graines
  distinctes, runners étalonnés à 2 % près, zéro perte au temps, zéro coup
  illégal sur les deux journaux entiers. Avertissements « PV continues
  after » : 1 et 1, puis 3 et 2 — rien à lire.
- **Au haut de l'attendu** (+6 à +25). Rapporté aux plis de la sonde, +0,17
  ± 0,07 : **70 à 295 Elo par pli**, bornes croisées — compatible avec
  l'étalon (60 à 105), le point (136) au-dessus.
  <span><strong>Inférence, confiance faible</strong> : A18 n'est pas qu'une
  vitesse — l'historique frais et les ex æquo par étage changent l'ordre, et
  ce surplus pourrait venir de là ; l'intervalle des plis, trop large, ne
  permet pas de le séparer du bruit.</span>
- **La fusion — PR #77, `3b80e1a`, 14 h 35** : la révocation `908ed46` est révoquée à son tour sur la
  branche, répétée à blanc à 12 h (section « Ce qui est EN VOL »). Banc
  **109 047** à la profondeur 7, 31 829 à la profondeur 5. La rustine
  `a18-generation-par-etapes.patch` cesse de s'appliquer — son code est
  entré — et `c19-see-ordering`, `d2-sonde-pv`, `d6-sonde-ordonnancement`
  repassent à « non ». **Plafond de mutation de `search.rs` : 38 → 39**,
  mesuré sur l'arbre fusionné et non seulement prédit — la garde de
  débordement de `stage_moves`, équivalente (raison écrite dans
  `.github/mutation-baseline.txt`). Le balayage qui suit la fusion doit
  rendre 39. **Il a rendu 43, et `eval.rs` 122** — la prédiction
  était fausse : quatre mutants de code qu'A18 n'écrit pas, que l'arbre neuf
  cachait au banc figé et à un test de PV sur une seule position. Tests
  corrigés (`3ac4d71`) ; détail sur la ligne du balayage, section « Ce qui
  est EN VOL ».

### C24 — laisser finir l'itération — VERDICT, 24 sept. 2026 : +44,64 ± 6,24 Elo à `8+0,08` — gain démontré, FUSIONNÉ ; la lecture par l'accord tient

Premier candidat du chantier « allocation inégale » (A19), sorti de son écran
— section suivante, « L'allocation inégale — l'écran ». Candidat
**`7274844`**, révoqué aussitôt par `40afb49`.

**Ce qui change** : l'échéance dure passe du budget à **2,2 budgets**, la
douce de 0,5 à **0,44** — un rapport de cinq au lieu de deux. Le budget ne
change pas. Une itération entamée juste avant la douce finit presque
toujours, au lieu d'être jetée une fois sur cinq. La dure reste bornée par la
pendule ; `movetime` n'en change rien. Les échéances passent par une fonction
pure, `deadlines_ms`, testée sur ses valeurs exactes. Banc inchangé : à
profondeur fixe, aucune échéance ne joue.

**Ce que l'écran en dit, à temps moyen égal** : le temps jeté tombe de
18,8 % à 2,9 % du temps dépensé, et l'accord avec l'oracle vaut × 1,38 de
temps à répartition égale, soit **+0,65 pli** — une lecture haute, la mesure
par accord surestimant probablement (section de l'écran).

Candidat `7274844` contre son parent `7fc5959`, `8+0,08`.

1. **La sonde** — `sonde = oui`, **100 parties**. **Attendu, confiance
   moyenne** : **+0,15 à +0,35 pli** en partie — les ~22 % de coups qui
   s'arrêtaient sur la dure y gagnent une itération achevée, et la douce un
   peu plus tôt en retire un peu ailleurs ; **temps de recherche par coup
   inchangé**, × 0,95 à 1,05 — c'est l'égalité de temps que l'écran suppose ;
   n/s inchangé. **Règle** : temps par coup hors de × 0,90 à 1,10 → l'écran
   ne décrit pas ce que fait le moteur en partie, comprendre avant l'Elo ;
   plis entièrement ≤ 0 → pas de match. Sinon, l'Elo.
2. **L'Elo** — longueur fixe, graine « auto », **deux jobs de 3 000
   parties**, mis en commun. **Attendu, confiance faible** : +0,15 à +0,35
   pli × 60 à 105 Elo par pli, soit **+9 à +37 Elo** ; la lecture haute de
   l'écran (+0,65 pli) donnerait +39 à +68. **Critère** :
   - borne haute de l'intervalle mis en commun < 0 → régression : ne pas
     fusionner, et chercher — le temps rendu aux itérations longues se paie
     ailleurs, sur les coups que la douce plus précoce écourte ;
   - borne basse > 0 → gain démontré : fusionner ;
   - entre les deux → pas d'effet décelable : **fusionner**, au titre du
     mécanisme mesuré — un temps jeté ramené de 18,8 à 2,9 % — et d'une règle
     qui n'est pas plus complexe que la précédente.
   - **Puissance** : ± 6,3 Elo sur ~5 760 parties ; une régression de 1 à 3
     Elo passerait inaperçue, et c'est accepté *parce que c'est écrit*.

**La sonde — relevée le 24 sept. 2026, run `35982959972`** : 100 parties,
zéro perte au temps, zéro coup illégal.

| camp | coups | profondeur | temps par coup | n/s |
|---|---|---|---|---|
| candidat `7274844` | 5 335 | 14,88 | 203,9 ms | 2 497 785 |
| référence `7fc5959` | 5 339 | 14,89 | 204,3 ms | 2 515 534 |

Temps par coup × 1,00, n/s × 1,00 : l'écran décrit ce que le moteur fait en
partie. Écart apparié **−0,00 ± 0,09 pli** : l'intervalle n'est pas
entièrement ≤ 0, donc **la règle écrite dit : l'Elo.**

**Mais l'attendu écrit — +0,15 à +0,35 pli — est manqué, et la faute est
dans l'attendu, pas dans l'écran.** Je l'avais dérivé de tête : les ~22 % de
coups arrêtés par la dure y gagnent une itération achevée, « et la douce un
peu plus tôt en retire un peu ailleurs ». L'écran savait le calculer — sa
trace prolongée simule n'importe quelle règle d'arrêt, coup par coup — et je
ne le lui ai pas demandé. Demandé après coup, section 6 du lecteur de
`tools/attic/c24-sonde-allocation.patch` : **+0,046 pli, IC 95 %
[+0,030 ; +0,062]** — 957 coups gagnent un pli, 658 en perdent un, un en perd
deux : la douce avancée de 0,50 à 0,44 budget reprend presque tout ce que la
dure rend. Temps simulé 203,4 ms contre 203,5. **La sonde en partie retombe
sur l'écran, pas sur mon attendu.**

**Ce que C24 change n'est donc pas la profondeur moyenne, c'est OÙ elle
va** : à profondeur moyenne presque égale, l'accord avec l'oracle passe de
80,8 à 83,9 %. La dure laisse finir les itérations longues — celles des
positions difficiles —, la douce plus précoce prend le pli aux positions
faciles. L'attendu en Elo, **réécrit avant de lancer**, a deux lectures :

- **par la profondeur moyenne** : +0,05 pli × 60 à 105 Elo par pli, soit
  **+2 à +7 Elo** — l'étalon suppose qu'un pli vaut autant partout ;
- **par l'accord** : × 1,38 de temps plat, +0,65 pli, **+39 à +68 Elo** — la
  lecture haute, celle que la réserve de l'écran frappe.

<s>+9 à +37 Elo</s> ne découle plus de rien. **Le match tranche entre les deux
lectures**, et c'est ce qui le rend utile au-delà de C24 : **C25 n'a de
valeur que par l'accord** — la répartition par la stabilité ne change pas la
profondeur moyenne non plus. Un C24 sans effet décelable condamnerait la
lecture par l'accord, et C25 avec ; un C24 nettement positif la validerait.
Le critère ne bouge pas.

**Crible de mutation du code de C24, au candidat, pendant que l'Elo vole** —
`set_deadlines`, `time_budget_ms`, `deadlines_ms` : 29 mutants. **Prédiction,
écrite avant le résultat** : **aucun survivant** ; deux inviables — `Instant *
Duration` ne compile pas — ; les autres attrapés par les valeurs exactes du
test des échéances, et les deux `now - Duration` de `set_deadlines` par le
test qui vérifie qu'on ne s'arrête pas trop tôt. Si le verdict fusionne C24,
le balayage suivant ne doit donc rien ajouter à `search.rs`.
**Rendu en 4 minutes : la prédiction tient** — 24 attrapés, les 2 inviables
prévus, **aucun survivant**, et 3 expirés : `set_deadlines` vidé,
`time_budget_ms` et `deadlines_ms` rendant `None`. Sans échéance, une
recherche à la pendule ne s'arrête plus et le test pend jusqu'au délai de
`cargo mutants` : attrapés quand même, mais par un blocage, pas par un échec
qui nomme la faute.

#### L'Elo — rendu à 16 h 22 : +44,64 ± 6,24, gain démontré — FUSIONNÉ

| run | graine | runner, n/s au banc | profondeur en 250 ms | parties | Elo | `Ptnml(0-2)` |
|---|---|---|---|---|---|---|
| [35987710644](https://github.com/theodubus/chess/actions/runs/35987710644) | 35987710644 | EPYC 7763, 2 290 188 | 12 | 2 880 | +45,01 ± 8,90 | 72, 173, 665, 372, 158 |
| [35987713472](https://github.com/theodubus/chess/actions/runs/35987713472) | 35987713472 | Xeon Platinum 8573C, 2 343 279 | 12 | 2 880 | +44,27 ± 8,75 | 63, 193, 645, 394, 145 |
| **en commun** (`tools/mettre-en-commun.sh`) | | | | **5 760** | **+44,64 ± 6,24** | homogènes, z = 0,12 |

- **Lu sur le critère écrit avant** : borne basse +38,4 > 0 — **gain
  démontré : fusionner.** Coupés par le plafond comme prévu, graines
  distinctes, deux processeurs différents et le même verdict à 0,7 Elo près,
  zéro perte au temps, zéro coup illégal.
- **Le match a tranché entre les deux lectures écrites avant lui.** Par la
  profondeur moyenne, +2 à +7 : **réfutée**, d'un facteur six. Par l'accord
  avec l'oracle, +39 à +68 : **elle tient**, le point au bas de l'intervalle
  — la lecture que la réserve de l'écran disait surestimée ne l'était pas ici.
  C24 ne cherche pas plus profond en moyenne ; il cherche **là où la décision
  se joue**, et c'est ce que l'accord mesure.
- <span><strong>Inférence, confiance moyenne</strong> : 44,64 ÷ 0,65 ≈ 69
  Elo par pli d'accord, dans l'étalon des plis réels (60 à 105). Un pli
  d'accord vaudrait donc un pli de profondeur — sur un point unique, qui ne
  fait pas une loi.</span>
- **Conséquence pour C25**, par la règle écrite avant ce verdict (écran,
  « Ce qui en sort ») : `E` = +44,64 ≥ +11, **C25 s'écrit**. Son supplément
  attendu : 0,08 × `E` à 0,54 × `E`, soit **+3,6 à +24 Elo**, un majorant.
- **La fusion** : la révocation `40afb49` est révoquée à son tour, répétée à
  blanc à 12 h. Banc inchangé — aucune échéance ne joue à profondeur fixe.
  La rustine `c24-laisser-finir-literation.patch` cesse de s'appliquer, son
  code est entré ; `c24-sonde-allocation.patch` s'applique toujours.

### C25 — la répartition par la stabilité — VERDICT, 24 sept. 2026 : +7,87 ± 6,08 Elo à `8+0,08` — gain démontré, FUSIONNÉ ; sous l'attendu, le taux de C24 ne se transfère qu'aux extrêmes

Deuxième candidat de l'allocation inégale, par-dessus C24, décidé par la
règle écrite avant le verdict de C24 (écran, « Ce qui en sort ») :
`E` = +44,64 ≥ +11. Candidat **`41d590f`**, révoqué aussitôt par `c4c356c` ;
la rustine `tools/attic/c25-stabilite.patch` en garde une copie. Référence :
son parent `910a6c9` — `main` avec A18 et C24.

**Ce qui change** : l'échéance douce n'est plus une, elle dépend de la
**stabilité du coup** — le nombre d'itérations achevées de suite sur le même
coup. La sonde de l'allocation mesure, sur 107 000 itérations, la
probabilité qu'une itération de plus change le coup : 26,1 % quand il vient
de changer, 12,7 % stable depuis 2 à 3 itérations, 7,3 % depuis 4 à 6,
3,7 % depuis 7 et plus. Poursuivre tant que cette probabilité, rapportée au
coût de l'itération suivante, dépasse un seuil revient à une douce
proportionnelle à elle : **1,825 / 0,885 / 0,513 / 0,257 budget**, à
l'échelle qui rend le temps moyen de C24. La dure passe de 2,2 à **3
budgets**, bornée par la pendule comme avant ; `movetime` inchangé.
Tests : valeurs exactes, bornes des classes, et la douce en vigueur pilotée
par la stabilité — huit défauts injectés, tous attrapés. Banc inchangé.

**Ce que l'écran en dit** — section 7 du lecteur de
`tools/attic/c24-sonde-allocation.patch`, supplément sur C24 en plis
d'accord, appris sur une moitié des parties et évalué sur l'autre :

| variante | A → B | B → A |
|---|---|---|
| douce par stabilité, dure 2,2 | +0,20 [+0,04 ; +0,35] | +0,02 [−0,12 ; +0,12] |
| **douce par stabilité, dure 3 — C25** | **+0,36 [+0,17 ; +0,57]** | **+0,17 [+0,05 ; +0,28]** |
| témoin : douce plate, dure 3 | +0,11 [+0,04 ; +0,19] | +0,07 [+0,02 ; +0,13] |

La stabilité seule, à la dure de C24, ne se distingue pas du bruit sur une
moitié ; la dure seule rapporte peu. **Ensemble, ils rapportent plus que
leur somme** : une douce tardive sur un coup instable a besoin de place pour
finir son itération. D'où un seul candidat pour les deux, mesuré comme la
règle de l'écran qu'il est.

Candidat `41d590f` contre son parent `910a6c9`, `8+0,08`.

1. **La sonde** — `sonde = oui`, **100 parties**. **Attendu** : temps de
   recherche par coup × 0,95 à 1,05 — c'est l'égalité de temps que la
   calibration suppose ; profondeur moyenne quelconque — C24 a montré
   qu'une réallocation ne se lit pas en plis moyens, **ce n'est donc plus un
   critère**. **Règle** : temps par coup hors de × 0,90 à 1,10, ou une seule
   perte au temps → l'écran ne décrit pas le moteur en partie, comprendre
   avant l'Elo. Sinon, l'Elo.
2. **L'Elo** — longueur fixe, graine « auto », **deux jobs de 3 000
   parties**, mis en commun. **Attendu, confiance moyenne** : +0,17 à +0,36
   pli d'accord × ~69 Elo par pli d'accord — le seul point de conversion,
   celui de C24 —, soit **+12 à +25 Elo**. La réserve de l'écran frappe
   davantage une règle qui cible les coups instables : le taux de C24 peut
   ne pas se transférer. **Critère** :
   - borne haute de l'intervalle mis en commun < 0 → régression : ne pas
     fusionner ;
   - borne basse > 0 → gain démontré : fusionner ;
   - entre les deux → pas d'effet décelable : **NE PAS fusionner** — C25 est
     plus complexe que C24 (un compteur, quatre constantes au lieu d'une),
     et la règle écrite avant le verdict de C24 le disait : une règle plus
     complexe ne se fusionne pas sur un « pas d'effet décelable ».
   - **Une perte au temps** dans les 5 760 parties se lit avant toute
     fusion, quel que soit l'Elo : la dure à trois budgets est la seule part
     du changement qui touche à ce risque.
   - **Puissance** : ± 6,3 Elo sur ~5 760 parties.

**La sonde — relevée le 24 sept. 2026 à 17 h 32, run `36030127970`** : 100
parties, zéro perte au temps, zéro coup illégal.

| camp | coups | profondeur | temps par coup | n/s |
|---|---|---|---|---|
| candidat `41d590f` | 5 518 | 14,34 | 200,7 ms | 2 692 183 |
| référence `910a6c9` | 5 514 | 14,55 | 204,2 ms | 2 703 922 |

Temps par coup × 0,98, dans × 0,90 à 1,10, aucune perte au temps : **la règle
écrite dit l'Elo.** Profondeur moyenne : **−0,20 ± 0,07 pli** — ce n'est plus
un critère, et l'écran le prédisait : −0,156 [−0,211 ; −0,101] à temps égal.
Les coups stables, majoritaires, reçoivent moins ; les instables, plus ; la
moyenne suit la majorité. **La partie retombe sur l'écran.**

**Crible de mutation du code de C25, au candidat, prédiction écrite avant le
résultat** — `stability_class`, `deadlines_ms`, `set_deadlines`, `iterate` :
33 mutants. **Deux survivants, tous deux anciens** — la comparaison
`score.abs() > MATE_THRESHOLD` d'`iterate`, en `==` et en `>=`, déjà comptée
dans les 39 ; **aucun dans le code neuf** ; des expirés possibles pour les
mutants qui retirent les échéances.
**Rendu en 4 minutes : la prédiction tient** — 25 attrapés, dont tous ceux
de `stability_class` ; 4 inviables — `Instant * Duration` ne compile pas,
ni un `Default` que `Move` et `DeadlinesMs` n'ont pas — ; **les deux
survivants prévus, et eux seuls** ; 2 expirés : `set_deadlines` vidé et
`deadlines_ms` rendant `None`. Sans échéance, une recherche à la pendule ne
s'arrête plus : attrapés par un blocage, comme pour C24. Si C25 est
fusionné, le balayage suivant ne doit rien ajouter à `search.rs`.

#### L'Elo — rendu à 23 h 24 : +7,87 ± 6,08, gain démontré — FUSIONNÉ

| run | graine | runner, n/s au banc | profondeur en 250 ms | parties | Elo | `Ptnml(0-2)` |
|---|---|---|---|---|---|---|
| [36035213241](https://github.com/theodubus/chess/actions/runs/36035213241) | 36035213241 | Xeon 6973P-C, 3 365 445 | 12 | 2 880 | +8,45 ± 8,51 | 81, 272, 682, 306, 99 |
| [36035217166](https://github.com/theodubus/chess/actions/runs/36035217166) | 36035217166 | EPYC 9V45, 3 882 592 | 12 | 2 860 | +7,29 ± 8,70 | 91, 270, 652, 322, 95 |
| **en commun** (`tools/mettre-en-commun.sh`) | | | | **5 740** | **+7,87 ± 6,08** | homogènes, z = 0,19 |

- **Lu sur le critère écrit avant** : borne basse +1,79 > 0 — **gain
  démontré : fusionner.** Coupés par le plafond comme prévu, graines
  distinctes, deux processeurs différents et le même verdict à 1,2 Elo près.
  **Zéro perte au temps** dans les 5 740 parties — la dure à trois budgets,
  seule part du changement qui touchait ce risque, ne s'est pas fait
  prendre à `8+0,08` —, zéro coup illégal.
- **Sous l'attendu écrit avant, sans le démentir tout entier.** Attendu +12
  à +25 ; mesuré +7,87 [+1,79 ; +13,95]. Le haut de l'attendu est exclu
  (+25 est à z = 5,5), son bas reste dans l'intervalle (+12 est à z = 1,3).
- **Le taux de conversion de C24 ne se transfère qu'aux extrêmes — et la
  réserve écrite avant le disait.** 7,87 ÷ 0,17 à 0,36 pli d'accord :
  **22 à 46 Elo par pli d'accord** au point, contre ~69 pour C24 ; aux bornes
  croisées, 5 à 82 — 69 n'y entre qu'avec le supplément d'écran à son bas et
  l'Elo au haut de son intervalle. La réserve de l'écran : « la conversion
  surestime toutes les règles, et d'autant plus qu'une règle cible les coups
  instables — donc la règle inégale plus que C24 ». C'est ce qui est arrivé.
  <span><strong>Inférence, confiance moyenne</strong> : un coup instable
  hésite souvent entre deux coups presque équivalents, donc en « corriger »
  la décision vaut moins qu'en moyenne ; C24 reprenait son temps aux coups
  faciles, C25 le donne aux coups instables — le premier pli d'accord est le
  moins cher à rendre utile.</span> **Deux points, deux taux : l'Elo d'un pli
  d'accord dépend de la règle qui l'achète.** Pour la suite de l'allocation
  inégale, un attendu converti au taux de C24 est un majorant, pas une
  estimation.
- **La fusion** : la révocation `c4c356c` est révoquée à son tour. Banc
  inchangé, 109 047 à la profondeur 7 — aucune échéance ne joue à profondeur
  fixe. La rustine `c25-stabilite.patch` cesse de s'appliquer, son code est
  entré ; `c24-sonde-allocation.patch` s'applique toujours.

### C26 — la dure à l'approche d'un contrôle à coups comptés — VERDICT, 25 sept. 2026 : +2,43 ± 6,01 Elo à `40/8`, aucune borne haute sous zéro — FUSIONNÉ au titre de la règle

Le risque est au backlog depuis le 24 sept. : quand l'interface annonce
`movestogo`, le budget vaut `restant / movestogo + inc/2`, et à deux coups
du contrôle la dure de C25 — trois budgets — vaut `min(1,5 × restant,
restant − 50)` = **`restant − 50`**. La douce du coup qui vient de changer,
1,825 budget, en vaut 0,91. Avant C24, la dure valait le budget : `restant /
2`. Nos matchs sont en mort subite, sans `movestogo` : ce chemin n'y passe
jamais.

**Ce que fait Stockfish — lu dans son source, pas de mémoire.** La ligne du
backlog disait « Stockfish plafonne l'excès à ~1,7 budget à deux coups du
contrôle ». **Faux sur le source actuel** : `src/timeman.cpp` au commit
`0a215d6c9e48856ef630013b8ab8312941a59057` (`master` le 24 sept. 2026) borne
la durée maximale par `max(optimum, min(0,8097 × pendule − surcoût,
maxScale × optimum))`, avec `maxScale = 1,3 + 0,11 × movestogo` aux
cadences cycliques — et c'est la **fraction de pendule**, 81 %, qui mord
près du contrôle. L'optimum lui-même y est haut : `(0,88 + ply / 116,4) /
movestogo`, soit ~0,77 de la pendule à deux coups du contrôle, vers le
39ᵉ coup. **Stockfish accepte donc de dépenser les trois quarts de sa
pendule à deux coups du contrôle ; ce qu'il interdit, c'est d'en dépasser
81 %.** Notre dure va jusqu'à `restant − 50`. Le « ~1,7 » venait d'une
formule plus ancienne, `1,5 + 0,11 × movestogo`, citée de tête. *Même
famille que « l'outil ne sait pas le faire » : une référence extérieure se
lit dans son source, au commit qu'on cite.*

#### La sonde — protocole et prédiction, écrits le 24 sept. 2026 à 23 h 38, avant de lancer

`main` avec C25 (moteur de `4b38bc5`, identique au candidat `41d590f`) contre
lui-même, **`40/8`** — 40 coups en 8 s, cyclique, ~200 ms par coup comme
`8+0,08` —, cutechess-cli avec `-debug all`, 60 parties, livre
`tools/book.epd` au hasard, `-srand 20260925`, trois parties à la fois dans
le conteneur (4 cœurs, monofil, pas de ponder : 1 × 3 ≤ 3). Pas
d'adjudication par abandon — elle finirait des parties avant le premier
contrôle ; la nulle par adjudication à partir du 40ᵉ coup, comme
`match.yml`. Mesuré pour chaque coup, par `movestogo` annoncé : la part de
la pendule dépensée entre `go` et `bestmove`, vue de l'arbitre.

**Un cycle AFFAMÉ** : le coup à `movestogo 2` dépense plus de 80 % de sa
pendule. **Prédiction** :

- à `movestogo` 5 et plus : jamais plus de trois budgets, la dure — rien
  à voir ;
- **10 à 25 % des cycles affamés** — un coup instable, ou une itération
  entamée avant une douce plus basse et finie contre une dure à `restant −
  50` ; avant C24, aucun, la dure tombant à la moitié de la pendule ;
- dans ces cycles, le coup à `movestogo 1` cherche avec moins de 20 % de ce
  que lui laisse un cycle ordinaire ;
- **zéro perte au temps** : la marge de 50 ms tient, et le dommage est la
  qualité du 40ᵉ coup, pas un drapeau. *Confiance moyenne* — la latence de
  l'arbitre sous charge n'est mesurée nulle part ici.

#### Rendu à 23 h 47 : le risque existe, moins souvent que prédit, et plus loin du contrôle

60 parties, 8 435 coups, 152 cycles. Le lecteur est la rustine
`tools/attic/c26-sonde-controle.patch`, qui porte aussi la commande.

| `movestogo` | coups | part moyenne de la pendule | 9ᵉ décile | max |
|---|---|---|---|---|
| 1 | 152 | 0,396 | 0,881 | 0,965 |
| 2 | 157 | 0,272 | 0,634 | **0,975** |
| 3 | 164 | 0,203 | 0,393 | **0,967** |
| 4 | 172 | 0,139 | 0,274 | 0,753 |
| 5 et plus | 7 790 | 0,037 | 0,078 | 0,601 |

- **Cycles affamés : 8 sur 152, 5,3 %** — sous la prédiction, 10 à 25 %.
  Dans chacun, le 39ᵉ coup a dépensé 83 à 97 % de sa pendule et laissé
  **49 à 50 ms** au 40ᵉ, joué en 0 ou 1 ms à la profondeur 2 à 4 — la table
  de transposition évite le premier coup légal, pas le coup faible. La
  médiane d'un cycle ordinaire lui laisse 892 ms : **5 à 6 %** de ce qu'il
  aurait eu, dans la prédiction (moins de 20 %).
- **La prédiction se trompait d'endroit** : elle ne comptait que
  `movestogo 2`. À trois coups du contrôle, trois budgets valent la
  pendule entière, et un coup y a dépensé **96,7 %** — deux coups affamés
  derrière lui. Au-delà de la borne qu'on s'apprête à poser, `(n + 1) / 2n`
  de la pendule : **5,7 %** des coups à deux coups du contrôle, **4,3 %** à
  trois, **2,3 %** à quatre.
- À cinq coups et plus, jamais plus de 0,601 — trois budgets, la dure,
  comme prédit.
- **Zéro perte au temps** ; marge minimale au contrôle **44 ms** sur les 50
  de la marge. Elle tient, à six millisecondes près.

#### Le correctif — écrit le 24 sept. 2026 au soir

Quand l'interface annonce `movestogo` = n ≥ 2, la dure est bornée pour que
chacun des n − 1 coups suivants garde au moins **la moitié de sa part
plate**, `restant / n` : `dure ≤ restant − ⌈(n − 1) × restant / 2n⌉`. Les
douces restent sous la dure, comme avant. **Pourquoi la moitié** : c'est ce
que trois budgets laissent déjà à cinq coups du contrôle — la borne étend
jusqu'au contrôle une garantie que C25 tient partout ailleurs, et ne mord,
sans incrément, qu'à deux, trois et quatre coups. **Sans `movestogo`
annoncé, rien ne change** : les douze coups du défaut sont un horizon, pas
un contrôle, et la mort subite — où C24 et C25 ont été mesurés — garde ses
échéances à la milliseconde. `movestogo 1` non plus : rien après lui qu'il
faille protéger. La borne ne compte pas les incréments que recevront les
coups suivants : avec un incrément, elle mord un peu plus loin du contrôle,
du côté prudent.

Tests : les valeurs exactes de `movestogo` 1 à 5 — à 2, 3 et 4 elles
échouent sur le code d'avant (vérifié : 9 950 contre 7 500 à deux coups),
1 et 5 sont les témoins ; la garantie elle-même sur une grille de 59
`movestogo` × 4 pendules, à la milliseconde près — la réserve s'arrondit
vers le haut ; et la mort subite à pendule serrée, où la borne mordrait si
elle s'appliquait au défaut. Banc inchangé.

#### La mesure — écrite AVANT de lancer

**C26 est un correctif, pas un gain** : la règle est celle d'un correctif
de règle (`CLAUDE.md`, « ce qui compte comme preuve ») — des tests qui
échouent sur l'ancien code, le mécanisme mesuré en régime réel, puis un
match au critère écrit d'avance. Candidat committé puis révoqué aussitôt.

1. **La sonde, après** — la même, sur le candidat, même graine. **Attendu** :
   **aucun cycle affamé**, et aucun coup à 2, 3 ou 4 coups du contrôle
   au-delà de sa borne, à la latence de l'arbitre près ; zéro perte au
   temps.
2. **Le match** — `40/8`, candidat contre son parent, longueur fixe, graine
   « auto », **deux jobs de 3 000 parties**, mis en commun. **Critère** :
   fusion **sauf si la borne haute de l'intervalle mis en commun est sous
   zéro** ; **une seule perte au temps du candidat** se lit avant toute
   fusion. **Puissance, dite d'avance** : ± 6 Elo sur ~5 700 parties — un
   effet de quelques Elo passe inaperçu, et c'est accepté parce que c'est
   écrit. **Attendu, confiance faible** : 0 à +5 Elo — un 40ᵉ coup joué à
   la profondeur 2 à 4 dans un cycle sur vingt, contre un 39ᵉ plus court.
   - **Pas de match à `8+0,08`** : sans `movestogo`, candidat et parent
     rendent les mêmes échéances à la milliseconde, et un test le fixe.

**La sonde d'après — rendue à 23 h 58, même graine** : 60 parties, 7 211
coups, 121 cycles. **Aucun cycle affamé** (5,3 % avant) ; au-delà de la
borne, 4, 5 et 2 coups à deux, trois et quatre coups du contrôle, **aucun de
plus de 10 ms** — la latence de l'arbitre, comme prévu (8, 7 et 4 avant) ;
à cinq coups et plus, toujours 0,601 au plus. **Zéro perte au temps**,
marge minimale au contrôle 45 ms. **Conforme à l'attendu : le match se
lance.**

Candidat **`6daf7d7`**, révoqué aussitôt par `3189a95` ; la rustine
`tools/attic/c26-controle-annonce.patch` en garde une copie. Référence : son
parent `4620495` — `main` avec C25.

**Crible de mutation du code de C26, au candidat, prédiction écrite avant le
résultat** — `deadlines_ms` : 17 mutants, dont 5 dans le code neuf.
**Aucun survivant** : les cinq neufs — `>=` en `<` dans le filtre, `- 1` et
`100 * n` changés d'opérateur — déplacent tous la dure à deux coups du
contrôle, que le test fixe à 7 500 ; les douze anciens comme aux cribles de
C24 et de C25. Un inviable, `Some(Default::default())` ; un expiré,
`deadlines_ms` à `None`.
**Rendu en 2 minutes : la prédiction tient, exactement** — 15 attrapés,
l'inviable et l'expiré prévus, aucun survivant. Si C26 est fusionné, le
balayage suivant ne doit rien ajouter à `search.rs`.

#### L'Elo — rendu à 05 h 28 : +2,43 ± 6,01, aucune borne haute sous zéro — FUSIONNÉ

| run | graine | runner, n/s au banc | profondeur en 250 ms | parties | Elo | `Ptnml(0-2)` |
|---|---|---|---|---|---|---|
| [36075386225](https://github.com/theodubus/chess/actions/runs/36075386225) | 36075386225 | Xeon 6973P-C, 3 472 557 | 12 | 3 000 | +4,98 ± 8,42 | 101, 266, 720, 315, 98 |
| [36075388587](https://github.com/theodubus/chess/actions/runs/36075388587) | 36075388587 | EPYC 7763, 2 430 129 | 12 | 3 000 | −0,12 ± 8,59 | 117, 263, 726, 292, 102 |
| **en commun** (`tools/mettre-en-commun.sh`) | | | | **6 000** | **+2,43 ± 6,01** | homogènes, z = 0,83 |

- **Lu sur le critère écrit avant** : intervalle mis en commun [−3,6 ;
  +8,4], **borne haute au-dessus de zéro — fusionner**. Chaque match lu
  seul ne la met pas sous zéro non plus (+13,4 et +8,5) : *un critère écrit
  en bornes se lit sur chaque match comme sur l'ensemble*. **Zéro perte au
  temps** dans les 6 000 parties, zéro coup illégal. Les deux jobs ont fini
  **entiers**, sans le plafond : 6,5 s par partie à `40/8`, contre ~7,25 à
  `8+0,08` — la première estimation de durée d'une cadence à coups comptés,
  mesurée.
- **Dans l'attendu écrit avant**, 0 à +5, confiance faible — et sous la
  puissance dite d'avance : ± 6 Elo, donc aucun signe n'est établi. C'est ce
  que la règle d'un correctif accepte, *parce que c'est écrit* : le
  mécanisme est mesuré en régime réel (5,3 % de cycles affamés avant, aucun
  après), les tests tombent sur l'ancien code, et le match n'y trouve pas
  de régression.
- **Ce que la sonde avait mal prédit, et qu'il faut garder** : sa
  prédiction ne comptait que les coups à `movestogo 2`, parce que c'est là
  que j'avais vu le risque en relisant le code. Il était aussi à trois
  coups du contrôle — trois budgets y valent la pendule entière. *Une
  prédiction bornée au cas qu'on a en tête ne voit pas son voisin* ; le
  correctif, lui, avait été écrit pour tous les `movestogo` et couvrait le
  voisin sans le savoir.
- **La fusion** : la révocation `3189a95` est révoquée à son tour. Banc
  inchangé, 109 047 à la profondeur 7 — aucune échéance à profondeur fixe.
  La rustine `c26-controle-annonce.patch` cesse de s'appliquer, son code est
  entré ; `c26-sonde-controle.patch` s'applique toujours.

### L'allocation inégale — l'écran du 24 sept. 2026 : 18,7 % du temps était jeté, et laisser finir l'itération rapporte l'essentiel

Premier geste du chantier décidé par Théo (A19) : **mesurer le mécanisme
avant d'écrire une ligne du moteur.** La question : où un surcroît de temps
change-t-il la décision, et où un temps retiré ne coûte-t-il rien ?

#### La sonde, et ce qui la rend fiable

`tools/attic/c24-sonde-allocation.patch` — l'instrumentation, la sonde
`alloc-probe` et son lecteur `tools/sonde-alloc/analyser.py`, dans la même
rustine. **60 parties à `8+0,08`** depuis le livre des matchs, pendule qui
décroît, **une table par camp** comme en match — `b2_probe` en partageait une
entre les deux camps. Chaque coup est joué par la recherche normale. Avant
elle, une recherche **prolongée jusqu'à six budgets** part d'une **copie** de
la table, rétablie ensuite : la partie ne garde aucune trace de la recherche
prolongée, sans quoi elle jouerait dans une table plus chaude qu'en match.

- **La recherche prolongée refait la normale nœud pour nœud jusqu'à son
  arrêt** — même position, même table, mêmes nœuds à chaque profondeur,
  vérifié sur la trace. Toute règle d'arrêt se simule donc hors ligne sur sa
  trace ; la règle actuelle, simulée, rend le coup effectivement joué dans
  **98,5 %** des cas, le reste étant le bruit d'horloge.
- **Instrumentation neutre** : banc à 114 026. **6 400 coups, zéro perte au
  temps.** Conteneur, trois processus sur quatre cœurs, ~1 h.
- **L'oracle** est la décision au bout des six budgets. **L'étalon** est la
  courbe d'accord de la règle actuelle quand on multiplie le budget
  uniformément : elle convertit un gain d'accord en temps équivalent, puis
  en plis par l'étalon du 24 sept. (1,38 pli par doublement).

#### Ce que la règle actuelle fait du temps

La douce tombe à la moitié du budget, la dure au budget. Temps dépensé :
**0,765 budget** en moyenne. Arrêts : **78 % par la douce, 22 % par la
dure**. **18,7 % du temps dépensé est JETÉ** dans des itérations entamées
avant la douce et interrompues par la dure — une perte sèche, que personne
n'avait mesurée.

| budget × | 0,5 | 0,71 | 1 | 1,41 | 2 | 2,83 |
|---|---|---|---|---|---|---|
| accord avec l'oracle | 76,2 % | 78,5 % | **80,8 %** | 83,9 % | 86,8 % | 90,3 % |
| temps dépensé / budget | 0,400 | 0,558 | 0,763 | 1,061 | 1,478 | 2,077 |

#### Par classe de position, au moment où la règle actuelle décide

| classe | part | un budget × 2 change le coup | ≠ oracle |
|---|---|---|---|
| tous | 100 % | 9,3 % | 19,2 % |
| coup stable depuis 7 itérations ou plus | 73,0 % | **6,5 %** | 14,5 % |
| coup stable depuis 4 à 6 | 8,2 % | 11,0 % | 24,8 % |
| coup stable depuis 2 à 3 | 8,8 % | 16,0 % | 31,8 % |
| **coup qui vient de changer** | 9,9 % | **22,9 %** | 38,0 % |
| effort à la racine 80 à 95 % | 21,2 % | **4,1 %** | 8,7 % |
| effort à la racine sous 50 % | 27,4 % | 17,0 % | 31,2 % |
| score en chute de 50 cp ou plus | 1,5 % | 15,5 % | 26,8 % |

Un facteur **3,5** entre les classes sur ce que rapporte un double budget :
le mécanisme existe. L'effort — la part des nœuds de la racine passée sous le
meilleur coup — se confond avec la profondeur, faible aux premières
itérations ; la stabilité porte le signal.

#### Deux règles, à temps moyen égal

**Règle plate qui laisse finir l'itération** — même douce ou presque, dure
bien plus loin, budget ajusté pour que le temps moyen ne bouge pas :

| dure / douce | douce | dure | temps jeté | équivaut à |
|---|---|---|---|---|
| 2 (actuelle) | 0,50 budget | 1,00 | 18,9 % | — |
| 3 | 0,46 | 1,37 | 9,4 % | × 1,23, +0,41 pli |
| 4 | 0,44 | 1,78 | 4,6 % | × 1,35, +0,59 pli |
| **5 — C24** | **0,44** | **2,20** | **2,8 %** | **× 1,38, +0,65 pli** |

Le gain plafonne entre 5 et 8 (vu sur 4 510 coups : +0,73 à 8) ; 5 borne
mieux le pire cas. **Laisser finir l'itération est déjà une allocation
inégale** : une itération dure longtemps quand la position est difficile —
le coup change, la fenêtre d'aspiration échoue —, et c'est là qu'elle achète
le plus.

**Règle inégale** — poursuivre tant que la probabilité qu'une itération de
plus change le coup, rapportée à son coût, dépasse un seuil ; la probabilité
apprise sur une moitié des parties, la règle évaluée sur l'autre, dans les
deux sens, intervalles par rééchantillonnage des parties :

| table de probabilité | dure | A → B | B → A |
|---|---|---|---|
| stabilité seule | 2 budgets | +0,77 pli [+0,64 ; +0,89] | +0,69 [+0,56 ; +0,81] |
| stabilité seule | 3 budgets | +1,00 [+0,79 ; +1,14] | +0,86 [+0,75 ; +0,95] |
| stabilité × effort | 2 budgets | +0,70 [+0,56 ; +0,88] | +0,58 [+0,45 ; +0,73] |
| stabilité × effort | 3 budgets | +0,91 [+0,67 ; +1,12] | +0,72 [+0,56 ; +0,86] |

**La répartition par la stabilité n'ajoute que +0,05 à +0,35 pli à ce que C24
prend déjà**, et la table plus riche fait moins bien que la seule stabilité.

#### La réserve, et elle compte

**L'accord avec un oracle n'est pas de l'Elo.** Un coup instable hésite
souvent entre deux coups presque équivalents : le « corriger » vaut peu.
<span><strong>Inférence, confiance moyenne</strong> : la conversion surestime
toutes les règles, et d'autant plus qu'une règle cible les coups instables —
donc la règle inégale plus que C24.</span> Et les parties rejouées sont
celles de la règle actuelle : une autre règle jouerait d'autres parties. Ce
que l'écran établit sans réserve : **le temps jeté** — 18,7 % — et **l'écart
entre les classes**.

#### Ce qui en sort

1. **C24 — laisser finir l'itération** : écrit, en mesure (section C24). Il
   porte l'essentiel, pour deux constantes. Sa sonde a montré qu'il ne
   change pas la profondeur moyenne (+0,05 pli à l'écran, −0,00 ± 0,09 en
   partie) : son gain, s'il existe, est dans la répartition.
2. **C25 — la répartition par la stabilité**, par-dessus C24 : **après le
   verdict de C24**. Son supplément à l'écran, +0,05 à +0,35 pli, est la
   lecture que la réserve frappe le plus ; il se décidera sur ce que C24 aura
   rendu en Elo pour ses +0,65 pli d'écran.
   **La règle, écrite le 24 sept. à 10 h 45, AVANT le verdict de C24** — les
   deux jobs volent depuis 10 h 31. Soit `E` le point estimé de C24 mis en
   commun. C24 révèle ce que vaut un pli d'accord : `E / 0,65`. Le supplément
   de C25 vaut donc au plus **0,54 × E** (0,35 / 0,65) et au moins 0,08 × E —
   un majorant, puisque la conversion surestime une règle qui cible les coups
   instables plus qu'elle ne surestime C24. **C25 s'écrit si ce majorant
   atteint 6 Elo, soit `E` ≥ +11** : 6 Elo sont la résolution de deux jobs,
   et une règle plus complexe que C24 ne se fusionne pas sur un « pas d'effet
   décelable ». **En dessous, l'allocation inégale s'arrête à C24**, et la
   suite se repose à Théo. Si C24 régresse, C25 — qui réalloue davantage —
   tombe avec lui.
   **Appliquée le 24 sept. à 16 h 25 : `E` = +44,64 — C25 s'écrit**, supplément
   attendu +3,6 à +24 Elo.
   **Mesuré le 24 sept. à 23 h 24 : +7,87 ± 6,08 — FUSIONNÉ** (section C25) :
   dans cet intervalle, au tiers bas ; sous l'attendu que les moitiés de
   l'écran resserraient ensuite (+12 à +25).
3. **Rien d'autre** : l'effort à la racine n'ajoute rien à la stabilité —
   la table croisée fait moins bien que la stabilité seule —, et le score en
   chute ne touche que 1,5 % des coups. **Les deux règles que l'écran
   désignait sont fusionnées.**

### A20 — raffinements d'ordonnancement — VERDICT, 25 sept. 2026 : +12,56 ± 4,35 Elo à `8+0,08` — la continuation conservée, gain démontré, FUSIONNÉ

**La question.** Le chantier est décidé (Théo, 25 sept.) : coup de
réfutation, historique de continuation. Avant d'écrire une ligne : que laisse
l'ordre des coups tranquilles sur la table, et combien chaque raffinement en
reprendrait-il ?

**La sonde** — instrumentation et lecteur dans une même rustine de l'attic,
versée avec le résultat. **L'arbre est inchangé au nœud près** : banc 109 047
à la profondeur 7 et 629 735 à la profondeur 10, identiques à `main`. Aux
nœuds de `negamax`, elle compte :
- les coupures bêta, l'**étage de leur coupeur** (table, tactique, killer,
  étage tranquille) et la part au premier coup ;
- **l'UNION des sous-arbres cherchés avant le coupeur**, ce qu'un ordre
  parfait épargnerait, propagée de fils en père. *Sommer ces sous-arbres
  nœud par nœud compte deux fois ceux qui s'emboîtent* : le premier essai
  rendait 67 % des nœuds, impossible pour un plafond ; l'union en rend la
  moitié ;
- cette union **ventilée par l'étage du coup perdu**, et celle de l'étage
  tranquille seul — le plafond des raffinements décidés ;
- aux coupures de l'étage tranquille, le **rang contrefactuel** du coupeur
  sous cinq ordres : coup de réfutation devant l'étage ; papillon +
  continuation à un et deux plis ; continuation d'abord ; papillon
  **conservé** d'un coup à l'autre ; ce dernier + continuation. Les tables
  contrefactuelles apprennent des mêmes coupures que l'historique réel, se
  conservent d'un coup à l'autre et se vident à `ucinewgame` — une
  continuation de 768 × 768 entrées vidée à chaque coup n'apprend rien.

**Ce qu'elle ne peut pas mesurer, écrit avant** :
- **le malus d'historique.** Il punit ce que l'ordre ACTUEL essaie en
  premier ; appris sous cet ordre, il se condamne d'avance. Le premier essai
  le donnait trois fois pire que l'historique réel : **un biais de politique,
  pas une mesure**. Il se juge en l'écrivant ;
- **le canal LMR/LMP.** Un bon coup mal classé est réduit ou élagué, et
  c'est de la décision, pas de l'arbre. L'écran compte les coupeurs de
  l'étage que LMR a réduits ; il ne voit pas les coups élagués qui auraient
  coupé ;
- **le second ordre.** Un autre ordre changerait l'arbre, donc les tables.

**Régime** : parties entières à `8+0,08`, le binaire sondé contre lui-même,
adjudication de `match.yml`, table et tables conservées comme en partie —
piège du moteur froid.

**Attendu, écrit avant — et ce que j'ai déjà vu.** Une position cherchée
deux secondes, à froid, a servi à mettre la sonde au point : 78 % des
coupures au premier coup ; l'étage tranquille ne coupe que 3 % des fois ;
union 34 % des nœuds, dont 9 % dans l'étage tranquille ; aucune variante ne
réduisait le rang moyen du coupeur de plus de 2 %, et « continuation
d'abord » l'augmentait. Un point à froid, pas le régime, mais l'attendu en
est informé. Confiance faible sur chaque ligne :
- coupures au premier coup : 75 à 90 % ;
- coupeurs de l'étage tranquille : 2 à 8 % des coupures ;
- union de l'étage tranquille : **4 à 12 % des nœuds**, soit un plafond de
  0,08 à 0,25 pli par la règle de 1,36 pli par doublement ;
- rang moyen du coupeur : aucune variante ne le réduit de plus de 10 %, sauf
  peut-être le papillon conservé, 0 à 20 %.

**Critère, écrit avant :**
1. **Union de l'étage tranquille sous 5 % des nœuds** — 0,10 pli, 6 à
   10 Elo à l'étalon de 60 à 105 Elo par pli — **et aucune variante qui
   réduise le rang moyen de 10 %** : le canal de l'arbre est clos pour ces
   raffinements. Une variante réaliste n'en prendrait qu'une fraction, sous
   la résolution de deux jobs. Reste le canal LMR/LMP : une sonde des DÉGÂTS,
   comme D2, avant tout code — et la suite se repose à Théo avec les
   chiffres.
2. **Sinon**, écrire la variante au meilleur gain contrefactuel, mesurer son
   arbre à profondeur fixe sur des positions de parties (déterministe), puis
   deux jobs de 3 000 parties à `8+0,08`. Critère de gain : fusion si la
   borne basse est au-dessus de zéro.

**Un biais de MÉTHODE, trouvé en lisant les premiers chiffres (25 sept.,
07 h 30).** Toutes les variantes sortaient pires que l'ordre joué — même le
coup de réfutation, qui tombe juste sur 16,8 % des coupures de l'étage. Ce
n'est pas un résultat : **le coupeur est le premier coup qui coupe DANS
L'ORDRE JOUÉ**. Les coups qu'un autre ordre placerait devant lui n'ont
jamais été cherchés, certains auraient coupé aussi, et les compter comme des
échecs condamne toute variante qui diffère de l'ordre joué. Le malus n'en
était qu'un cas particulier. Restent valides : l'union — le plafond — et,
pour une variante, le « coupeur premier » comme **minorant**. **La seconde
clause du critère s'appuyait sur ces rangs : elle ne s'applique pas.** La
première suffit à trancher, puisque l'union de l'étage tranquille dépasse
5 % (chiffre final plus bas).

**L'écran, rendu à 07 h 43** — 120 parties à `8+0,08`, six processus,
6,25 milliards de nœuds ; rustine `tools/attic/a20-sonde-ordonnancement.patch`,
lecteur `tools/sonde-a20/analyser.py`. Les rangs contrefactuels n'y figurent
plus que pour mémoire.

| grandeur | attendu | mesuré |
|---|---|---|
| coupures au premier coup | 75 à 90 % | **81,8 %** |
| étage du coupeur : table, tactique, killer, étage tranquille | — | 28,4 / 50,6 / 16,1 / **4,9 %** |
| coupeurs de l'étage tranquille | 2 à 8 % des coupures | **4,9 %** |
| union des sous-arbres cherchés avant le coupeur | — | **41,6 %** des nœuds : 1,06 pli pour un ordre parfait de TOUS les étages |
| … perdus dans le coup de table, un tactique, un killer, un tranquille | — | 18,3 / 10,5 / 5,1 / 7,7 % |
| **union de l'étage tranquille**, emboîtements permis | 4 à 12 % | **10,9 %**, soit **0,23 pli au plus** |
| l'étage tranquille, aux coupures qu'il rend | — | 20,3 coups ; coupeur premier 49,8 % ; réduit par LMR 7,6 % |
| coup de réfutation | — | juste sur **17,0 %** des coupures de l'étage, présent et faux sur 15,3 % |

Ce qui en sort :
1. **Le critère ne clôt pas le canal de l'arbre** : 10,9 % dépasse 5 %.
   Mais 0,23 pli — **14 à 24 Elo** à l'étalon de 60 à 105 Elo par pli —
   est ce que rendrait un ordre PARFAIT des tranquilles ; une heuristique
   n'en prendra qu'une part, et c'est le rejeu qui dira laquelle.
2. **Le plus gros gisement n'est pas dans le chantier décidé** : le coup de
   table perdu avant un autre coupeur pèse 18,3 % des nœuds, les tactiques
   perdus 10,5 %. Aucun raffinement de l'étage tranquille n'y touche. Noté,
   pas ouvert.
3. **Le coup de réfutation a une portée bornée d'avance** : l'étage
   tranquille rend 4,9 % des coupures, et la réfutation n'y désigne le
   coupeur qu'une fois sur six.

**La mesure suivante est donc celle que le critère prévoyait, et c'est la
bonne : l'arbre de chaque variante APPLIQUÉE.** Un binaire expérimental — la
variante choisie par l'environnement, `main` au nœud près sans elle (banc
109 047 et 629 735) — rejoue les parties du match de la sonde, chaque `go`
remplacé par `go depth 10`, table et historiques conservés d'un coup à
l'autre. Déterministe à un fil : ni bruit, ni appariement à faire, les mêmes
positions dans le même ordre. Cinq variantes :
- **coup de réfutation**, un étage entre les killers et les tranquilles ;
- **continuation** à un et deux plis, ajoutée au papillon, vidée à chaque
  coup ;
- la même, **conservée** d'un coup à l'autre ;
- **papillon conservé** d'un coup à l'autre ;
- **malus** du papillon : − d² aux tranquilles essayés avant le coupeur.

**Attendu, écrit avant.** Confiance faible. Le banc — six positions à
froid — a été vu : à la profondeur 10, réfutation −0,9 %, continuation
−5,6 %, malus +3,5 %.

| variante | arbre attendu |
|---|---|
| réfutation | −0,5 à −3 % |
| continuation | −2 à −8 %, la conservée un peu mieux que la vidée |
| papillon conservé | −1 à −5 % |
| malus | signe inconnu, −5 à +5 % |

**Critère, écrit avant** : une variante dont l'arbre rétrécit d'au moins
2 % passe au match, dans l'ordre du rétrécissement ; les autres restent à
l'attic. **Un arbre plus petit n'est pas un gain** — il chiffre le coût, pas
la décision, huit mesures du projet le montrent : il ordonne l'achat des
matchs, il ne les remplace pas.

**Le rejeu, rendu à 07 h 47** — 4 951 recherches à la profondeur 10, deux
flux du match de la sonde (un processus de chaque couleur de départ),
rustine `tools/attic/a20-variantes-ordonnancement.patch`, rejoueur
`tools/sonde-a20/rejouer-profondeur.py` :

| variante | nœuds | contre `main` | par flux | attendu |
|---|---|---|---|---|
| `main` | 314 907 163 | — | — | — |
| coup de réfutation | 318 760 360 | **+1,2 %** | −0,1 / +2,5 % | −0,5 à −3 % |
| continuation, vidée à chaque coup | 318 720 906 | **+1,2 %** | +0,5 / +1,9 % | −2 à −8 % |
| **continuation, conservée** | **305 090 247** | **−3,1 %** | −3,0 / −3,2 % | −2 à −8 % |
| papillon conservé | 328 873 073 | **+4,4 %** | +4,1 / +4,8 % | −1 à −5 % |
| malus du papillon | 310 975 805 | −1,2 % | −2,1 / −0,4 % | −5 à +5 % |

Ce qui en sort :
1. **Une seule variante passe le critère : la continuation CONSERVÉE**,
   −3,1 %, la même sur les deux flux. Elle va au match. Les quatre autres
   restent à l'attic : trois grossissent l'arbre, le malus le réduit sous
   le seuil et pas de la même façon sur les deux flux.
2. **Trois attendus sur cinq avaient le mauvais signe.** Le coup de
   réfutation et le papillon conservé devaient réduire l'arbre ; ils le
   grossissent.
3. **Conserver aide une table creuse et nuit à une table dense.** La
   continuation — 590 000 entrées — n'apprend rien en un coup : vidée, elle
   grossit l'arbre de 1,2 % ; conservée, elle le réduit de 3,1 %. Le
   papillon — 4 096 entrées — apprend en un coup, et ce qu'il garde du coup
   précédent l'égare : +4,4 %. <span><strong>Inférence, confiance
   moyenne</strong> : ce qu'une table retient doit durer à proportion de ce
   qu'il lui faut pour apprendre.</span>
4. **Le banc a inversé une conclusion de plus.** À la profondeur 10, il
   donnait la continuation vidée à −5,6 % — en partie, +1,2 %. C'est le
   piège « le banc peut INVERSER une conclusion » (A18), et ici par le
   régime : six positions cherchées à froid ne voient ni la table ni les
   historiques d'une partie.
5. **Ce que l'arbre promet est petit** : −3,1 % à profondeur fixe, c'est
   un facteur 1,032 de vitesse, soit **0,06 pli — 4 à 7 Elo** à l'étalon
   de 60 à 105 Elo par pli. Le canal des décisions — ce que LMR et LMP
   font d'un meilleur ordre — n'est pas dans ce chiffre, et son signe
   n'est pas connu.

#### Le candidat et sa mesure — écrits le 25 sept. 2026 AVANT de lancer

**Candidat `54e6c60`**, révoqué aussitôt par `99df7ca` ; la rustine
`tools/attic/a20-continuation.patch` en garde une copie. Référence : son
parent `a08af76`. Chaque tranquille est noté par le papillon plus sa note
sachant chacun des deux coups qui précèdent le nœud ; la table apprend des
mêmes coupures que le papillon, se conserve d'un coup à l'autre, se vide à
`ucinewgame` — pour les auxiliaires aussi. 2,25 Mio par fil. Cinq tests
neufs.

**Le code mesuré et le code candidat sont le même arbre, vérifié** : banc
107 548 et 594 679 à la profondeur 7 et 10, et le rejeu rend **305 090 247
nœuds, exactement** ceux de la variante `chk` de l'expérience. Banc de
référence 109 047 → 107 548 ; banc figé à la profondeur 6, 70 719 → 70 594.

**Pas de sonde des plis** : l'arbre promet 0,06 pli, et la sonde en partie
mesure à ± 0,07 à 0,09 — elle ne départagerait rien. Et elle ne verrait pas
ce qu'une table de 2,25 Mio coûte par nœud en accès mémoire, que l'arbre ne
compte pas : c'est à l'Elo de le payer ou non.

**Attendu, écrit avant** : **+4 à +7 Elo par le seul canal de l'arbre**,
moins le coût par nœud des accès à la table ; le canal des décisions, de
signe inconnu, peut ajouter ou retrancher. Ensemble : **0 à +15**,
confiance faible.

**La mesure** : quatre jobs de 3 000 parties à `8+0,08`, `match.yml`,
graine « auto », candidat contre parent, mis en commun par
`tools/mettre-en-commun.sh`. **Quatre et non deux, contre ce que l'écran
écrivait** — la puissance, calculée avant : à 6 000 parties l'intervalle
vaut ± 6 Elo, et un effet de +5 n'y serait démontré qu'une fois sur quatre ;
à 12 000, ± 4,3, **+5 démontré 64 fois sur 100, +8 96 fois sur 100**.

**Critère de gain, écrit avant** : **fusion si la borne basse de
l'intervalle mis en commun est au-dessus de zéro** ; sinon, pas de fusion,
et la rustine reste à l'attic. Des jobs qui se contredisent se lisent comme
C22 sur C23 : un critère écrit en bornes se lit sur chaque match comme sur
l'ensemble.

**Crible de mutation au candidat, prédiction écrite avant** — le FICHIER
`search.rs` entier, pas le seul diff (la leçon d'A18) : **39 survivants, au
plafond, les mêmes**. Les mutants du code neuf sont tous attrapés par les
cinq tests ou par le banc figé. Risque nommé : un ancien mutant que l'arbre
neuf ne montre plus au banc figé, comme les quatre d'A18 — d'où **39 à
43**.
**Rendu à 10 h 25, sur runner** (`Mutation`, entrée `commit`, run
36114952595) : **39, les mêmes un pour un**, décalés de lignes par le code
neuf — la prédiction tient au bas de sa fourchette. Un premier essai dans le
conteneur était mort à 57 mutants sur 570, au redémarrage ; c'est ce qui a
appris à `Mutation` à balayer un SHA.

#### L'Elo — rendu à 13 h 55 : +12,56 ± 4,35, gain démontré — FUSIONNÉ

| run | graine | runner, n/s au banc | profondeur en 250 ms | parties | Elo | `Ptnml(0-2)` |
|---|---|---|---|---|---|---|
| [36110519468](https://github.com/theodubus/chess/actions/runs/36110519468) | 36110519468 | Xeon 8370C, 2 329 342 | 12 | 2 900 | +14,26 ± 8,74 | 89, 251, 679, 314, 117 |
| [36110522377](https://github.com/theodubus/chess/actions/runs/36110522377) | 36110522377 | EPYC 7763, 2 395 204 | 12 | 2 900 | +11,75 ± 8,49 | 80, 260, 698, 306, 106 |
| [36110524982](https://github.com/theodubus/chess/actions/runs/36110524982) | 36110524982 | Xeon 8370C, 2 442 918 | 12 | 2 900 | +15,83 ± 8,82 | 81, 272, 659, 310, 128 |
| [36110528007](https://github.com/theodubus/chess/actions/runs/36110528007) | 36110528007 | EPYC 7763, 2 335 233 | 12 | 2 920 | +8,45 ± 8,73 | 100, 249, 707, 288, 116 |
| **en commun** (`tools/mettre-en-commun.sh`) | | | | **11 620** | **+12,56 ± 4,35** | homogènes, plus grand écart z = 1,17 |

- **Critère écrit avant : la borne basse commune au-dessus de zéro — elle
  vaut +8,2. Gain démontré, FUSIONNÉ.** Les quatre jobs, coupés par le
  plafond de 350 minutes vers 13 h 50 ; zéro perte au temps, aucun coup
  illégal, sur les quatre journaux entiers.
- **Dans l'attendu** (0 à +15), et **au-dessus de ce que l'arbre seul
  promettait** : −3,1 % de nœuds, 0,06 pli, 4 à 7 Elo à l'étalon — la
  borne basse commune le dépasse déjà. *Le canal des décisions — ce que LMR
  et LMP font d'un meilleur ordre — est positif, et il porte l'essentiel.*
  <span><strong>Inférence, confiance moyenne</strong> : le rejeu ne compte
  que des nœuds, et un meilleur ordre soustrait aussi les bons coups aux
  réductions et à l'élagage — ce que l'écran nommait comme non mesuré.</span>
- **Le même rapport de nœuds que PVS, le signe opposé** : ÷ 1,03 pour
  l'un et l'autre, −11 pour PVS en septembre, +12,6 ici. Un point de plus
  pour « un nombre de nœuds ne dit pas la force » (`CLAUDE.md`).
- **La puissance calculée avant** : quatre jobs pour l'hypothèse prudente —
  l'effet de l'arbre seul, +5 — qu'on ne démontrait qu'une fois sur quatre
  à deux jobs. L'effet vrai était plus grand ; le choix se jugeait avant.
- Banc de référence **107 548** à la profondeur 7, banc figé 70 594 à la
  profondeur 6 ; crible au candidat : 39, les mêmes.

### A21 — NNUE : la génération des données — écran écrit le 25 sept. 2026

**Décidé — Théo, 25 sept. 2026, après la fusion d'A20** : « *Est ce que pour
NNUE on aurait besoin de mon GPU dès maintenant ? Je n'ai pas accès a mon PC
avant qq jours. Mais si on peut juste lancer la génération de parties sans GPU
et que c'est long ça peut le faire* ». Lu comme le feu vert de B4, génération
d'abord. Réponse : **non** — le GPU ne sert qu'à l'entraînement ; la génération
des données et l'inférence dans le moteur sont du CPU.

**Le format, lu au source** — bullet au commit `10e7e82`, `docs/3-data.md` et
`examples/simple.rs` ; les crates `viriformat` 2.0.1 et `bulletformat` 1.8.0,
aux versions que bullet épingle :

- bullet recommande de stocker les données dans un format « binpack », et nomme
  celui de Viridithas — `viriformat` — comme le plus employé par ceux qui
  génèrent les leurs ; son exemple de référence le charge par
  `ViriBinpackLoader` avec `Filter::default()` ;
- une partie, c'est un en-tête de 32 octets, 4 octets par coup (le coup et le
  score sur seize bits chacun), puis 4 octets nuls. **Mesuré : 4,3 octets par
  position**, contre 32 pour le format direct `ChessBoard` — un facteur 7 sur
  ce qu'il faudra transférer des runners vers la machine d'entraînement ;
- **le score est du point de vue des Blancs** : `ChessBoard::from_raw` le
  retourne lui-même vers le camp au trait, et `viriformat` le lui passe tel
  quel. La recherche, elle, rend le point de vue du camp au trait ;
- le roque est noté roi-prend-tour, comme dans `cozy-chess`, mais roque, prise
  en passant et promotion portent des drapeaux que les deux cases ne donnent
  pas ;
- **le filtrage se fait au chargement** — positions en échec, coups tactiques,
  seize premiers demi-coups : des parties entières se refiltrent sans être
  regénérées.

`viriformat` est sous licence MIT ; c'est une dépendance de `tools/` seulement,
jamais du moteur.

**Le générateur — `tools/src/bin/nnue_datagen.rs`** :

- auto-jeu à **5 000 nœuds par coup** — choix NON mesuré, l'ordre de grandeur
  courant ; 8 à 11 demi-coups tirés au hasard avant d'enregistrer, comme le
  corpus Texel ; la partie est écartée si le premier score dépasse 1 000 ;
- fin par les règles — mat, pat, triple répétition, cinquante coups, matériel
  insuffisant —, adjudication de gain à 2 000 pendant huit demi-coups, nulle
  au-delà de 400. **Pas d'adjudication de nulle** : ce qu'elle économiserait se
  mesure sur les données avant de se décider ;
- chaque partie est une fonction pure de (graine, numéro, nœuds) : table vidée
  à chaque partie, un fil par recherche ;
- le format est écrit **par la crate `viriformat` elle-même**, jamais
  réimplémenté.

Dix tests, dont : le signe du score, avec son témoin (écrire le point de vue
du trait fait tomber les assertions noires) ; les coups spéciaux confrontés à
l'**oracle** qu'est le générateur de coups de `viriformat` — roques, prises en
passant, promotions et sous-promotions, chacun compté ; la relecture par
`viriformat`, qui vérifie en debug la légalité de chaque coup ; le
déterminisme. **Ils ont trouvé un défaut du moteur à leur première exécution**
— section C27.

**Mesuré en conteneur, une minute sur quatre fils — et AVANT d'avoir écrit
l'attendu**, entorse au protocole que je signale plutôt que de la taire :
1 072 parties de 115 demi-coups en moyenne, 28 écartées ; **2 044 positions par
seconde** ; 62 % gardées par le filtre par défaut ; 429 gains blancs, 445
noirs, 198 nulles — **82 % de parties décisives**. Une propriété des données à
surveiller, pas un défaut : l'étiquette de résultat pèse 25 % dans l'exemple
de bullet.

**Attendu sur runner, écrit AVANT de lancer** : **1 200 à 1 800 positions par
seconde**. Le runner a quatre processeurs logiques mais deux cœurs physiques
(SMT, mesuré le 23 sept.), contre quatre cœurs sans SMT dans le conteneur.
Soit 4 à 6,5 millions de positions par heure, 24 à 36 millions par job de 330
minutes, 100 à 150 Mo. Ce que la mesure tranchera : le nombre de jobs d'une
première cible.

**Relevé sur runner le 25 sept. à 17 h 43 — dans l'attendu** (run
36166785450, 20 minutes) : **1 713 positions par seconde** ; 17 976 parties et
357 écartées (1,9 %), 114 demi-coups en moyenne ; **62,2 % gardées** par le
filtre par défaut ; 7 251 gains blancs, 7 397 noirs, 3 328 nulles — **81,5 %
de parties décisives**, comme en conteneur. 4,3 octets par position sur
disque, 3,6 dans l'artefact compressé. Le runner rend 84 % du débit du
conteneur avec deux cœurs physiques pour quatre : le SMT rend plus que je ne
l'avais compté. *Un runner, pas une dispersion* : la vitesse de recherche a
varié de 58 % entre deux runners le 21 sept., et un point unique qui tombe
dans l'intervalle attendu n'en mesure rien (`CLAUDE.md`).

**L'artefact ne se relit pas depuis le conteneur** : le proxy de sortie y
refuse le stockage où GitHub dépose les artefacts
(`*.blob.core.windows.net`, politique d'organisation). Il se relira sur la
machine d'entraînement, par `viriformat`, **avant tout entraînement** : ses
comptes doivent retomber sur ceux du résumé de chaque job, parties et
positions. Ce qui est vérifié d'ici : le code qui écrit est celui que les
tests relisent par `viriformat`, et l'écriture finit par un `flush` dont
l'erreur fait échouer le job.

**Première cible : 100 millions de positions — provisoire, non mesurée.**
L'exemple de bullet voit 4 milliards d'échantillons en 40 superbatches, ce qui
ne dit rien de la taille du jeu de données. La bonne quantité se mesurera par
une courbe d'apprentissage : entraîner sur la moitié, puis sur le tout, et
comparer en match.

**La génération, lancée le 25 sept. à 19 h 25 — quatre jobs de 330 minutes**
(runs 36179538497, 36179541822, 36179544454, 36179547648). Trois choix, chacun
avec sa raison :

- **quatre jobs, pas trois** : trois donnent 102 millions au débit relevé, sans
  marge pour un runner plus lent ; quatre en donnent 136, et la courbe
  d'apprentissage prévue compare la moitié au tout. Sous 100 millions en tout,
  une vague de complément se dimensionne sur les débits relevés ;
- **découpés sous les limites de temps** — Théo, le 25 sept. : « *Tu devras
  faire gaffe a bien découper ou générer en plusieurs fois pour faire gaffe
  aux limites de temps* ». Un job hébergé est tué à six heures (`github/docs`
  au commit `2494c72`, `content/actions/reference/limits.md`) ; le nôtre
  plafonne à 350 minutes, et le générateur s'arrête de lui-même à 330 : aucune
  partie n'est entamée après l'échéance, celles en cours finissent, le fichier
  est vidé avec contrôle d'erreur. Build et dépôt prennent moins d'une minute.
  Un job perdu ne perd que sa part — un artefact par job, une graine par job,
  le numéro du run ;
- **au candidat C27, `bb6e4c0`, pas à `main`** : le défaut de C27 a été trouvé
  par les tests de ce générateur, donc son régime l'atteint ; une borne hors
  plage relue ailleurs peut changer une recherche voisine, donc une étiquette
  — <span>inférence, non mesurée</span>. Le générateur y est celui de `main`
  au bit près : hors documentation et attic, `git diff bb6e4c0 0eb1e9b` ne
  touche que `engine/`, le correctif. Et le correctif est juste par ses tests quel que soit le verdict
  d'Elo, qui juge la force, pas la justesse des scores. Si C27 est fusionné,
  ces données sont celles qu'aurait produites `main` — à vérifier à la fusion,
  par le même `git diff`. **Vérifié le 25 sept. à 23 h 20** : C27 fusionné,
  hors documentation le `git diff` de `bb6e4c0` à la révocation de sa
  révocation est vide ; l'extraction de `mate_distance_window` qui suit est
  une réécriture pure, banc identique au nœud près.

**Relevée le 26 sept. à 01 h 20 — dans l'attendu, au-dessus de la cible.**
Quatre succès, finis à 00 h 55, chaque résumé nomme `bb6e4c0` :

| run | processeur | parties | écartées | positions | gardées par le filtre | positions/s | artefact |
|---|---|---|---|---|---|---|---|
| 36179538497 | Xeon Platinum 8573C | 272 726 | 5 620 | 31 053 159 | 19 277 531 | 1 568 | 111,7 Mo |
| 36179541822 | EPYC 7763 | 263 035 | 5 484 | 29 974 392 | 18 620 389 | 1 514 | 107,8 Mo |
| 36179544454 | EPYC 7763 | 262 271 | 5 331 | 29 873 314 | 18 558 127 | 1 509 | 107,4 Mo |
| 36179547648 | Xeon Platinum 8573C | 300 371 | 6 289 | 34 197 435 | 21 244 034 | 1 727 | 123,0 Mo |

- **125 098 300 positions, dont 77 700 081 gardées par le filtre par défaut**
  (62,1 %) — 92 % de l'attendu central (136 M), dans sa fourchette, et
  au-dessus de la cible de 100 millions : **pas de vague de complément** ;
- 1 098 403 parties, 2,0 % écartées, 114 demi-coups en moyenne ; 39,8 % de
  gains blancs, 41,3 % noirs, 18,9 % de nulles — **81,1 % de décisives**,
  comme à la mesure ;
- **les débits ne varient que de 14 %** (1 509 à 1 727) sur deux modèles de
  processeur, quand la vitesse de recherche monofil de l'étalonnage variait
  de 83 % le même soir. Le Xeon rend 1 568 et 1 727, l'EPYC 7763 1 514 et
  1 509 : le même modèle diffère de 10 %. <span>Inférence, confiance
  faible : à quatre fils sur deux cœurs, le débit se lit par cœur physique,
  pas par la vitesse d'un fil seul</span> ;
- 516 Mio sur disque (4,3 octets par position), **450 Mo d'artefacts**
  (3,6), expirant le 24 déc. 2026 ;
- pour les regénérer, K = parties + écartées : 278 346, 268 519, 267 602 et
  306 660.

**L'artefact de la mesure** (36166785450, 2 055 456 positions) **reste hors du
jeu** : il vient du moteur d'avant C27, et le jeu reste celui d'un seul moteur.

**Les données se regénèrent à l'identique** : chaque partie est une fonction
pure de (graine, numéro, nœuds) au commit donné, et un job a joué exactement
les numéros 0 à K − 1, K = parties + écartées, lus dans son résumé. `--games K`
avec la même graine rend les mêmes parties, réparties autrement entre les
fichiers. L'expiration des artefacts à 90 jours ne coûterait que du temps de
runner.

**Le coût, lu au source** (`github/docs` au commit `2494c72`,
`content/billing/concepts/product-billing/github-actions.md`) : « *GitHub
Actions usage is free for self-hosted runners and for public repositories that
use standard GitHub-hosted runners* » ; les quotas de minutes et de stockage
d'artefacts visent les dépôts privés.

**La suite, dans l'ordre** :
1. la génération, sur quelques runners à la fois — **faite pour la première
   cible** : quatre jobs, 125 M positions, relevée le 26 sept. ;
2. l'inférence dans le moteur — la pile d'accumulateurs par ply de la
   contrainte d'architecture, et l'architecture de l'exemple de bullet
   (768 → 128 ×2 → 1, SCReLU, quantification 255/64, échelle 400) —, éprouvée
   sur un réseau aléatoire contre un calcul complet de référence —
   **écrite le 26 sept.**, voir ci-dessous ;
3. l'entraînement, sur la carte de Théo ;
4. le SPRT, à `8+0,08`.

#### Étape 2 — l'inférence dans le moteur, écrite le 26 sept. 2026

**Derrière l'option UCI `EvalFile`, et sans réseau rien ne change** : banc
identique au nœud près, 107 548 à la profondeur 7 et 594 679 à la profondeur
10. Tout est lu au source de bullet au commit `10e7e82`, jamais de mémoire :

- **les entrées** — `game/inputs/chess768.rs`, et `ChessBoard::from_raw` de
  `bulletformat` 1.8.0, qui retourne l'échiquier quand les Noirs ont le trait
  (`swap_bytes` sur chaque bitboard, couleurs échangées). Ramené aux cases
  réelles : `384 × (pièce adverse) + 64 × type + case`, la case retournée
  (`^ 56`) pour la perspective noire ;
- **le fichier** — `examples/simple.rs` (`SavedFormat`) et
  `to_quantised_buffer` : poids de la couche cachée par entrée (× 255), ses
  biais (× 255), les 256 poids de sortie, camp au trait d'abord (× 64), le
  biais de sortie (× 255 × 64), en `i16` petit-boutistes arrondis, puis un
  bourrage jusqu'au multiple de 64 : **197 440 octets**, et tout autre taille
  est refusée ;
- **la sortie** — le `Network::evaluate` de l'exemple : SCReLU, produit
  scalaire, `/ 255`, biais, `× 400`, `/ (255 × 64)`, troncatures vers zéro.

**Ce que le chargeur refuse** : un réseau dont une unité, avec ses 32 plus
grands poids — autant que de pièces sur un échiquier légal —, sortirait d'un
`i16`, ou dont les poids de sortie totalisent plus de 33 025 en valeur
absolue — au-delà, le produit scalaire sortirait d'un `i32`. Un réseau
entraîné avec les réglages par défaut de bullet (`AdamW` borne à ±1,98) passe
les deux : 16 665 au plus dans un accumulateur, 32 512 en sortie. La sortie
est bornée à `MATE_THRESHOLD - 1`, et une position morte vaut zéro, réseau ou
non.

**Où vivent les accumulateurs** : une pile par ply dans `Search`, la
contrainte d'architecture posée avec le copy-make. Seule la racine se
recalcule ; le parent dérive ceux de l'enfant du plateau d'avant et du coup
— la dérivation de `nnue_probe`, déplacée dans `engine/src/nnue.rs`, seule
copie : `nnue-probe` l'emploie et retombe sur ses chiffres du 14 sept.,
283 677 coups dont 3 255 roques, 48 prises en passant et 13 628 promotions,
sans un écart.

**Chaque test a été vu tomber sur une faute injectée**, et deux faits sont
sortis de là :
- le coup nul oublié **n'était vu par aucun test** tant que le réseau de test
  évaluait tout à ±8 000 : la futilité inverse coupait avant le coup nul
  partout — zéro coup nul sur 54 nœuds candidats. Un réseau aux évaluations
  de partie, et un appel direct de `negamax` futilité coupée, l'attrapent ;
- la confrontation des entrées se fait **au code de l'entraîneur**, pas à ma
  lecture de ce code : un test de `nnue_datagen.rs` fait passer 4 793
  positions, dont 2 396 aux Noirs, par `to_bulletformat` et l'itération de
  `bulletformat`, et ne recopie que les cinq lignes de `Chess768`.

**Ce qui reste à vérifier au retour du réseau entraîné** : que le moteur
évalue une position comme l'entraîneur. La commande `eval` imprime
l'évaluation statique ; `trainer.eval(fen)` de bullet, × 400, donne la
sienne. **Attendu : quelques centièmes d'écart, dus à la seule quantification.**
Un écart de l'ordre de l'évaluation elle-même dirait des entrées mal
indexées, que rien d'autre ne signalerait.

**Le coût d'un nœud avec réseau — attendu écrit AVANT de mesurer.** Un réseau
aléatoire aux évaluations de partie, les six positions du banc, profondeur
fixe, un processus par mesure, cinq paires alternées ; on compare les
nanosecondes par nœud, les arbres différant. <span>Inférence, confiance
faible</span> : la mise à jour coûte une copie de 512 octets et deux à quatre
lignes de 128 par perspective ; la sortie multiplie des `i32`, que le jeu
d'instructions de base (SSE2) ne vectorise pas nativement ; l'évaluation
faite main, elle, n'est pas donnée — la structure de pions pesait à elle
seule 24 % du temps le 14 sept. Attendu : **le nœud avec réseau entre 0,8 et
1,6 fois le nœud fait main** sur le binaire de base, **entre 0,6 et 1,1** en
AVX2 (`-C target-cpu=native`).

**Mesuré le 26 sept. à 02 h 10, dans le conteneur — dans l'attendu, et le
réseau est MOINS cher que l'évaluation faite main.** Le réseau est celui des
tests, `testing::random_values(21, 40, 20)` régénéré à l'identique ;
1,5 million de nœuds par position (`go nodes`), un processus par mesure, cinq
paires alternées, chronométrées de `go` à `bestmove` :

| binaire | faite main | réseau | rapport des médianes | paires où le réseau gagne |
|---|---|---|---|---|
| de base (SSE2) | 553 ns/nœud | 483 ns/nœud | **0,873** | 5/5 |
| `-C target-cpu=native` (AVX2) | 568 ns/nœud | 415 ns/nœud | **0,731** | 5/5 |

<span>Limite connue</span> : les arbres diffèrent — à budget de nœuds égal,
pas à arbre égal —, et un réseau aléatoire n'en fait pas pousser un de
partie. Ce que la mesure établit : **la vitesse ne sera pas l'obstacle du
SPRT** ; un réseau de 128 unités ne coûte pas de profondeur, il en rendrait
plutôt. La vectorisation explicite n'a pas lieu d'être écrite avant ce
SPRT : l'AVX2 s'obtient déjà par le seul drapeau de compilation, sans une
ligne de code — une question de distribution des binaires, pas
d'inférence.

**Sans réseau, la vitesse n'a pas bougé** : `tools/timing.sh`, `cc8e105`
contre `main` à `bfe92fb`, nœuds identiques aux profondeurs 7 et 10, 20
paires : le candidat gagne 7 paires sur 20, p = 0,36 — **aucun écart
démontré**, donc aucun chiffre inscrit. Les deux tests de branche par nœud
que coûte l'option ne se voient pas.

### C27 — une borne de mat hors plage stockée dans la table — VERDICT, 25 sept. 2026 : −3,56 ± 5,97 Elo à `8+0,08`, aucune borne haute sous zéro — FUSIONNÉ au titre de la règle

**Trouvé par les tests du générateur NNUE**, qui jouent des parties entières
depuis des positions gagnantes — ce qu'aucun test du moteur ne faisait. En
debug, l'assertion de `pack_data` panique : `score hors bornes au stockage :
-30002`. Le binaire UCI lui-même le reproduit : `position fen
5Q2/R4B1k/1p6/4P1pp/8/4K3/1BP3PP/8 b - - 0 34`, puis `go depth 6`.

**Le mécanisme, instrumenté et non supposé.** Les Noirs sont matés en un quoi
qu'ils jouent. La première réponse trouvée fait de `MATE − 2` l'alpha des
nœuds blancs du ply 3, où `MATE − 4` est le mieux atteignable. La quiescence,
hors échec, initialise `best = alpha` : quand rien ne l'améliore, elle rend la
BORNE comme un score. Remontée, niée, puis normalisée par `score_to_tt`
(`− ply`), elle sort de ±MATE — −30 002 au ply 4. En release l'assertion
n'existe pas : la valeur est stockée telle quelle, et `score_from_tt` la
ressert ailleurs.

**L'assertion « jamais déclenchée » ne prouvait rien.** Le commentaire de
`tt.rs` l'écrivait depuis le 22 sept. : « ni par la suite de tests complète, ni
par les critères d'acceptation ». Ni l'une ni les autres ne jouaient une partie
jusqu'au mat depuis une position gagnante (`CLAUDE.md`, pièges de mesure).

**Mesuré en régime réel, sur l'ancien code instrumenté** — 60 parties à
`8+0,08` contre lui-même, livre du dépôt, `-srand 20260925`, 7 355
recherches ; rustine `tools/attic/c27-sonde-hors-plage.patch` :

| grandeur | recherches touchées | total |
|---|---|---|
| scores hors de ±MATE effectivement stockés | **134, soit 1,82 %** | 4,1 millions d'écritures |
| nœuds que le correctif couperait (fenêtre vide une fois bornée) | **353, soit 4,80 %** | 26,6 millions, ~0,55 % des nœuds |

Aucun « mate 0 » n'est remonté en UCI : la corruption reste interne à la table.
Un troisième compteur de la sonde, les fenêtres « bornées », est inutilisable
— il comptait aussi le bornage trivial d'une borne infinie — et n'est pas
retenu.

**Le correctif : l'élagage par distance au mat**, à l'entrée de `negamax`, hors
racine et avant l'aiguillage vers la quiescence — `alpha ≥ −MATE + ply`,
`beta ≤ MATE − ply − 1`, retour immédiat si la fenêtre est vide. Tout retour de
borne reste alors représentable là où il est stocké. **Le banc est identique au
nœud près** à `main` aux profondeurs 7, 10, 12 et 14 : sans mat dans la
fenêtre, rien ne change.

**Le test** `une_borne_de_mat_heritee_ne_sort_jamais_de_la_plage` tombe sur
l'ancien code **dans les deux profils** : en debug par l'assertion, en release
parce que la table, lue par `max_abs_stored_score`, porte 30 002.

**Critère, écrit AVANT le match** — la règle d'un correctif (`CLAUDE.md`) :
deux jobs de 3 000 parties à `8+0,08`, le candidat contre son parent ;
**fusion sauf si la borne haute de l'intervalle est sous zéro, en commun comme
sur chaque match**. Puissance dite d'avance : ± 6 Elo. L'attendu est de 0 à
+3, donc invisible : le défaut ne touche que des positions où un mat est déjà
vu, et il ne s'y voit pas en UCI.

**VERDICT, 25 sept. 2026 à 23 h 15 — aucune borne haute sous zéro, FUSIONNÉ au
titre de la règle.** Deux jobs coupés par le plafond, 2 900 et 2 860 parties :
**−1,92 ± 8,16** et **−5,22 ± 8,72**, homogènes (z = 0,54) ; en commun
**−3,56 ± 5,97** sur 5 760 parties. Bornes hautes +6,24, +3,50 et +2,41 : aucune
sous zéro, ni en commun ni par match. Zéro perte au temps, zéro coup illégal.
L'attendu (0 à +3) est dans l'intervalle ; le point est négatif, et la
puissance dite d'avance ne distingue pas −3,6 de zéro — c'est ce que la règle
d'un correctif accepte, par écrit avant le match. Rétabli en révoquant sa
révocation (`e5589d1`) : hors documentation, cette révocation rend le moteur
de `bb6e4c0` octet pour octet ; l'extraction qui la suit (ci-dessous) ne change
aucun nœud.

**Les deux runners diffèrent de 83 %** : 4 019 409 n/s à la profondeur 13
contre 2 199 922 à la profondeur 12, même binaire — le plus grand écart relevé
(58 % le 21 sept.). Chaque verdict reste valide en interne ; deux runs ne se
comparent pas sans leurs étalonnages.

**Le crible du code neuf, avant de fusionner** (`tools/mutants.sh --in-diff`,
dans le conteneur, quatre minutes) : **sept mutants sur onze survivaient**
dans les trois lignes du bornage. Le test de partie ne traverse que les bornes
de SA position — même affaiblir la borne basse en `-MATE - ply` le laissait
passer. Un invariant de recherche se corrige au fil : les deux bornes sont
extraites dans `mate_distance_window`, fonction pure testée par ses valeurs à
plusieurs plis (`la_fenetre_ne_promet_que_le_mat_atteignable`), et la garde de
la racine par son effet, avec témoin (`a_la_racine_la_fenetre_n_est_jamais_bornee`).
Banc identique au nœud près, 107 548 et 594 679 aux profondeurs 7 et 10.
Recriblé : **22 attrapés sur 23, un expiré** — `alpha >= beta` en `<`, qui
fait tourner la recherche à vide.

### Ce qui reste à faire, par ordre mesuré

**L'ordre des prochains chantiers est DÉCIDÉ — Théo, 23 sept. 2026, au soir** :
d'abord les relèves en vol (C22 sur C23, balayage de mutation), puis
**calibrer l'Elo par pli**, puis **B6 — la recherche multithread** (Lazy
SMP). <s>Les autres lignes gardent l'ordre mesuré du tableau ; « ce sur quoi
travailler » reste une question à lui poser au-delà de ces deux-là.</s>
**Calibration faite, B6 écrit et en mesure. La suite est DÉCIDÉE — Théo,
24 sept. 2026, au matin** : après B6, **la génération par étapes**, sur la
recommandation qu'elle sert dans toutes les conditions de jeu — tout nombre de
fils, ponder permis ou non —, là où le remboursement du ponder ne sert que
quand le ponder est permis (désactivé au CCRL Blitz). <s>Au-delà, « ce sur quoi
travailler » redevient une question à lui poser.</s> **Posée, et DÉCIDÉE —
Théo, 24 sept. 2026, vers 09 h** : après la génération par étapes,
**l'allocation inégale**, sur la recommandation qu'on peut la chiffrer vite
avant de s'engager et qu'elle sert dans toutes les conditions de jeu —
« *Ok pour 1, on oublie pas le reste mais d'abord 1* ». Les autres candidats
présentés gardent leur place au tableau : raffinements d'ordonnancement sur
les étages, NNUE, remboursement du ponder. <s>Au-delà, la question se repose.</s>
**Reposée le 25 sept. au matin, C26 fusionné, et DÉCIDÉE — Théo** : après
l'allocation inégale, **les raffinements d'ordonnancement sur les étages** —
« *Ok pour le raffinement de coups en prochain chantier* ». Comme les
précédents : le mécanisme se mesure avant d'écrire une ligne. <s>Au-delà, la
question se repose.</s> **Reposée le 25 sept. après la fusion d'A20, et DÉCIDÉE
— Théo** : **NNUE (B4)**, en commençant par la génération des données — « *si
on peut juste lancer la génération de parties sans GPU et que c'est long ça
peut le faire* » ; sa machine, qui portera l'entraînement, n'est pas
disponible avant quelques jours. Section A21.

**Ce tableau porte TOUT le backlog du moteur**, reportés et bloqués compris,
chacun avec sa condition. Il ne portait jusqu'au 23 sept. au soir que les
chantiers ordonnés : NNUE, tablebases et B8 ne vivaient que dans le carnet, et
un inventaire fait de mémoire les a laissés passer. *Un backlog qui n'existe
qu'en partie dans le dépôt n'existe pas.*

| chantier | plis | état — et la PROCHAINE action |
|---|---|---|
| **C22 — la nulle vue à l'horizon** | — correctif de règle | <s>RÉGRESSION, non fusionné</s> sur une base à fausses nulles : −10,44 ± 6,34 Elo à `8+0,08`. **Remesuré sur C23 et FUSIONNÉ le 24 sept.** au titre de la règle — +3,98 ± 6,26 en commun, deux matchs hétérogènes ; voir « C22 sur C23 — VERDICT » |
| **ponder** | **0,90** prévus — `p = 0,659` contre notre jumeau à `8+0,08` (0,654 compté par cutechess en ponder réel), × 1,36. **Mesuré en partie : +0,94 ± 0,20**, `p = 0,702` | **ÉCRIT, vérifié, MESURÉ le 23 sept. : +67,63 ± 9,19 Elo à `8+0,08` contre notre jumeau**, 2 700 parties, zéro anomalie — voir « Ponder — VERDICT ». Tout déploiement qui le permet l'active. Suite : dépenser le remboursement — le camp qui pondère laisse 13 % de sa pendule, ~0,27 pli, **16 à 28 Elo** par l'étalon du 24 sept. —, réglé à la sonde puis mesuré en `les-deux`. **Ne sert que là où le ponder est permis** — le CCRL Blitz le désactive (section B6, « Ce que font les listes »). <s>Attend un arbitrage de déploiement</s> — **faux cadre**, il n'y a pas d'arbitrage |
| **C21 — dépenser la pendule** | 0,54 à 0,70 | **FUSIONNÉ**, +19,13 ± 6,31 Elo à `8+0,08` sur 6 000 parties |
| **allocation inégale** — dépenser plus sur les positions **dures** — **décidée n° 4** (Théo, 24 sept.) | écran : **18,7 % du temps était jeté** ; C24 +0,65 pli d'écran, la répartition par la stabilité +0,05 à +0,35 de plus — lectures hautes | **Écran FAIT le 24 sept.** (section « L'allocation inégale — l'écran »). **C24 — laisser finir l'itération : FUSIONNÉ le 24 sept., +44,64 ± 6,24 Elo à `8+0,08`** (section C24) — profondeur moyenne inchangée, le gain est dans la répartition, et la lecture par l'accord a tenu. <s>C25 — la répartition par la stabilité : ÉCRIT le 24 sept.</s> **C25 — la répartition par la stabilité : FUSIONNÉ au verdict du 24 sept., +7,87 ± 6,08 Elo à `8+0,08`** (section C25) — sous l'attendu de +12 à +25 : l'Elo d'un pli d'accord dépend de la règle, 22 à 46 ici contre ~69 pour C24. **Le chantier est au bout de ce que l'écran désignait** — l'effort à la racine n'ajoute rien, le score en chute est rare (écran, « Ce qui en sort »). <s>Prochaine action : C26, le risque que C24 et C25 ont aggravé ; ensuite, la question se repose à Théo.</s> **C26 est FUSIONNÉ le 25 sept.** (ligne C26) : **l'allocation inégale est close, et la suite se repose à Théo.** *Le signal est la difficulté de la position ; la pendule adverse n'en fait pas partie — ligne suivante* |
| **génération par étapes** — **décidée n° 3** (Théo, 24 sept.) | 0,21 — **13 à 22 Elo** par l'étalon du 24 sept. | <s>non entamée ; la suivante après B6.</s> **ÉCRITE le 24 sept.** — candidat `087edb8`, révoqué le temps de sa mesure. Hors partie : temps −10,7 à −11,3 %, arbre inchangé. <s>Prochaine action : la sonde, puis deux jobs de 3 000 parties</s> **Sonde faite : n/s × 1,09, +0,17 ± 0,07 pli.** <s>L'Elo en vol, relève vers 14 h 25</s> **MESURÉE le 24 sept. : +23,10 ± 6,39 Elo à `8+0,08`, gain démontré — FUSIONNÉE** ; section « A18 — VERDICT ». **Pas** une optimisation pure : ex æquo et historique frais déplacent l'arbre |
| **calibrer l'Elo par pli** — un match à handicap de temps, même binaire, `16+0,16` contre `8+0,08` | — c'est l'étalon des autres lignes | **FAIT le 24 sept.** : un doublement vaut **+107,74 ± 8,19 Elo** et **+1,38 ± 0,28 pli**, soit **60 à 105 Elo par pli** à `8+0,08` — voir son verdict. Les plis de chaque ligne se convertissent désormais en Elo, en intervalle ; l'incertitude de l'étalon vient presque toute des plis |
| **B9 — table à entrées atomiques** | — | **FUSIONNÉ le 23 sept.** : capacité −1,27 ± 6,34 Elo à `8+0,08`, pas d'effet décelable, fusionné au titre de l'infrastructure — voir son verdict. La table se partage entre fils |
| **B6 — la recherche multithread** (Lazy SMP : plusieurs fils d'un même processus cherchent la même position et partagent la table) — **décidé, n° 2** | <s>1,0 à 1,8, seul chiffre encore hérité</s> **+0,48 ± 0,08 mesurés à deux fils** en partie sur runner — **24 à 59 Elo** par l'étalon, écrit avant que ses matchs ne rendent | <s>exige B9</s> — **B9 est fusionné, la table se partage**. <s>Prochaine action avant toute mesure : **apprendre les fils à `match.yml`** (`T` cœurs par partie).</s> **Fait le 24 sept.** — voir « La concurrence d'un match se déduit des cœurs ». <s>Prochaine action : **écrire Lazy SMP**, l'option `Threads` et ses tests.</s> **ÉCRIT le 24 sept., neutre à un fil** (banc au nœud près, `timing.sh` trois fois). <s>Prochaine action : fusionner, puis la sonde et le match à deux fils, **protocole écrit avant**</s> **MESURÉ le 24 sept. : +42,16 ± 9,23 Elo à deux fils contre un**, 2 700 parties à `8+0,08`, trois matchs homogènes — **deux fils rapportent** ; section « B6 — Lazy SMP — VERDICT ». Suite : relever `MAX_THREADS` au-dessus des machines de compétition ; l'échelle au-delà de deux fils reste non mesurée, faute de cœurs physiques sur les runners. Deux prérequis de mesure sont en place depuis le 23 sept. au soir : la **topologie du runner** s'imprime — deux fils sur un même cœur physique fausseraient l'échelle —, et la **sonde** rend les n/s et les plis de chaque camp dans un même run. **Les runners n'ont que deux cœurs physiques** (mesuré le 23 sept.) : Lazy SMP ne s'y mesure sans SMT qu'à deux fils, et le « 1,0 à 1,8 » supposait quatre vrais cœurs. **Sa mesure ne peut pas se faire à la concurrence actuelle** : à `T` fils, `⌊3 / T⌋` parties à la fois — voir « La concurrence d'un match se déduit des cœurs qu'occupe une partie » |
| **Lazy SMP — ses variantes** : décalage de profondeur entre fils, coup du meilleur fil, historiques partagés, fils gardés d'un coup à l'autre | non chiffrées | **pas commencées** ; chacune se mesure seule, contre B6 tel qu'écrit (section B6). **Angle mort du dispositif** : les runners n'ont que deux cœurs physiques. <span><strong>Inférence, confiance moyenne</strong> : ces variantes servent la diversité entre fils, qui compte d'autant plus qu'il y a de fils — mesurées à deux, elles seraient sous-évaluées, la même famille que la cadence.</span> Condition : mesurer à plus de deux cœurs physiques. Les fils gardés répondent à un coût non mesuré — relancer des centaines d'auxiliaires à chaque `go` |
| **raffinements d'ordonnancement sur les étages** : coup de réfutation, historique de continuation — **décidés n° 5** (Théo, 25 sept.) | <s>non chiffrés</s> plafond 0,23 pli ; la continuation −3,1 % d'arbre | <s>après A18</s> **A18 est fusionné le 24 sept. : les étages existent**, et c'est la forme qui les accueille ; <s>aucun n'est décidé.</s> <s>**Le chantier suivant, décidé le 25 sept.** Prochaine action : mesurer le mécanisme avant d'écrire.</s> **FUSIONNÉ le 25 sept. : l'historique de continuation, conservé d'un coup à l'autre — +12,56 ± 4,35 Elo à `8+0,08`** (section A20), la seule des cinq variantes que le rejeu désignait. Les quatre autres restent à l'attic (`a20-variantes-ordonnancement.patch`) : le malus, −1,2 % d'arbre, sous le seuil et pas le même sur les deux flux ; le coup de réfutation, la continuation vidée et le papillon conservé, qui grossissent l'arbre. **Le chantier est au bout de ce que l'écran et le rejeu désignaient ; la suite se repose à Théo.** Hors du chantier, et noté : le coup de table perdu avant un autre coupeur pèse 18,3 % des nœuds, les tactiques perdus 10,5 % — les plus gros gisements de l'union. <s>Reléguer les captures perdantes derrière les tranquilles</s> : **+31,6 % de nœuds ici** (C19), ne se rouvre pas sans fait neuf |
| **C26 — la dure à l'approche d'un contrôle à coups comptés** — trouvé le 24 sept. en relisant les échéances pour C25 | — un **risque**, pas un gain : invisible à `8+0,08` | <s>Pas commencé ; après le verdict de C25, dont il touche la même fonction.</s> <s>Le suivant : C25 est fusionné le 24 sept., le risque est dans `main`.</s> <s>ÉCRIT et EN MESURE le 24 sept.</s> **FUSIONNÉ le 25 sept. au titre de la règle : +2,43 ± 6,01 Elo à `40/8`**, zéro perte au temps (section C26) — sonde d'abord : **5,3 % des cycles affamés à `40/8`**, et à trois coups du contrôle aussi ; la dure laisse désormais à chaque coup restant la moitié de sa part plate ; sonde d'après : aucun cycle affamé. **Clos.** Le risque, tel qu'écrit avant la sonde : Le budget vaut `restant / movestogo + inc/2` : à `movestogo 2`, `restant / 2`. La dure de C24, 2,2 budgets, vaut alors `min(1,1 × restant, restant − 50)` = **`restant − 50`** : une itération longue au 39ᵉ coup d'un 40/X peut ne laisser que 50 ms au 40ᵉ. Avant C24, elle valait `restant / 2`. **C25 aggrave** : sa douce du coup instable monte à 0,91 × restant. Nos matchs sont en mort subite avec incrément, sans `movestogo` : ce chemin n'y passe jamais, et le CCRL 40/15 y passe à chaque contrôle. Prochaine action : borner la dure — et les douces — pour que les coups restants avant le contrôle gardent une part de leur budget (<s>Stockfish plafonne l'excès à ~1,7 budget à deux coups du contrôle</s> — **faux, cité de tête** : son source borne à 81 % de la pendule, section C26) ; tests aux valeurs exactes de `movestogo` 1 à 4 ; puis un match à cadence à coups comptés — `match.yml` passe la cadence telle quelle aux arbitres (`40/8`), et <s>son estimation de durée lit `8+0,08` et devra apprendre l'autre forme</s> son estimation de durée lit `N/T+I` **depuis le 24 sept.** (elle prenait `40/8` pour quarante secondes) —, critère de non-régression écrit avant et **zéro perte au temps** |
| pendule de l'adversaire — dépenser selon l'**écart des deux pendules** | petit, **signe inconnu** — l'écart dépasse 20 % sur 1,6 % des coups | écran passé. **Même famille que l'allocation inégale** — un budget qui n'est plus plat —, **autre signal**, et un signal que l'auto-jeu annule : l'écart signé y est nul, donc un verdict contre soi-même rendrait zéro quelle que soit la vraie valeur. Rien avant l'allocation inégale ; puis mesure **conditionnelle** contre le parent de `ebe93ad`, jamais contre soi-même |
| « prolonger sur un effondrement » | majoré par 2,7 à 3,0 % des coups, **signe inconnu** | écran passé, jamais écrit |
| **C23 — la fenêtre de répétition traversait le coup nul** | — correctif de règle | **FUSIONNÉ le 23 sept.** : +2,65 ± 6,40 Elo à `8+0,08` sur 5 760 parties, pas d'effet décelable — fusionné au titre de la règle, comme le critère écrit avant le disait. Voir son verdict. Ensuite, et seul : interdire deux coups nuls consécutifs |
| **interdire deux coups nuls consécutifs** | — changement d'arbre | **débloqué le 24 sept., et ÉCRANTÉ en nœuds le même jour : ce n'est pas du travail retiré.** L'interdire fait grossir l'arbre : banc **+1,80 %** à la profondeur 10 (653 982 contre 642 442), **+0,52 %** à 12, −0,42 % à 7. Le second coup nul cherchait la position d'origine à profondeur réduite, et coupait tôt le nœud intermédiaire quand elle tenait — une coupure bon marché, pas un gaspillage. <s>Avec C23, un double coup nul ne rend plus de fausse nulle, il re-cherche la position à profondeur réduite : du travail qu'aucune partie ne demande.</s> **10,1 %** des recherches de coup nul partent juste après un coup nul (sonde de C23). Stockfish l'interdit — ce qui, ici, ne prouve rien. **Effet sur la décision de signe inconnu, de quelques Elo au plus : ~12 000 parties pour le voir.** Pas prioritaire devant B6 ; la garde tient en une condition, `null_marks.last() != Some(&(path.len() - 1))` |
| **D5 — revérifier les acquis** | — | **CLOS le 23 sept.** Six lignes examinées : trois remesurées en match — aspiration × 2,7, trois termes d'évaluation × 2,5, élagage delta **érodé** — et trois écrantées en nœuds sans signal d'érosion (futilité inverse, mobilité ; LMR, coup nul et table ont des marges qui l'absorbent). Les écrans datent du 22 ; rien de fusionné depuis ne coupe au même endroit. **L'élagage delta reste dans `main`** : un acquis se retire par un verdict, et un effet de −1,5 Elo en demanderait ~40 000 parties — une quinzaine de jobs pour quelques Elo au plus, quand la calibration et B6 en achètent davantage. *À rouvrir quand la quiescence ou l'échelle de l'évaluation change* (NNUE), l'écran en nœuds d'abord : trois minutes, sans hasard |
| **B8 — régler les constantes de recherche** | — | **déclencheur atteint en lettre, pas en esprit** — à re-spécifier avant toute mesure (note sous le tableau) |
| **B7 phase 2 — régler l'évaluation** | — | **bloqué, sur deux conditions écrites** : C13, et « un corpus nettement plus grand ou une contrainte de structure » (`CLAUDE.md`) — le réglage Texel de sept. prédisait mieux et jouait 25 Elo plus mal. La phase 1, compléter, est faite |
| **C13 — mesurer la force absolue** | — | **reporté** : aucune liste de classement n'est joignable depuis le conteneur (vérifié le 14 sept.). Il ne bloque que l'arbitrage de grande allocation — NNUE, évaluation faite main, multithread |
| **B4 — évaluation NNUE** | — | **reporté.** L'architecture ne le bloque pas — vérifié par sonde, 2,8 % du coût d'un nœud (`CLAUDE.md`) —, rien d'autre n'est commencé : données, entraînement, inférence. Sa place relève de l'arbitrage de grande allocation. **Le matériel, lu au source le 25 sept.** (`jw1912/bullet` au commit `10e7e82`, l'entraîneur de référence de la communauté, en Rust) : **il n'entraîne que sur GPU** — fonctionnalités `cuda` (NVIDIA), `rocm` (AMD) ou `metal` (macOS) ; sans l'une d'elles, il compile contre un runtime factice qui refuse toute exécution (`crates/gpu/src/runtime/mock.rs`). Les runners de GitHub n'ont pas de GPU : l'**entraînement** demandera une carte, celle de Théo ou une louée. La **génération des données** — l'auto-jeu du moteur, étiqueté par sa recherche — est un travail CPU que les runners savent faire. **Et que leurs conditions permettent**, lues au source le même jour (`github/site-policy` au commit `b9578b5`, *GitHub Terms for Additional Products and Features*, section Actions) : sur runners hébergés, est exclue « *any other activity unrelated to the production, testing, deployment, or publication of the software project associated with the repository* » — produire le réseau du dépôt relève de sa production. Lecture, pas un avis juridique ; la même section exclut une charge « *disproportionate to the benefits provided to users* », ce qui reste un jugement de volume. Question posée par Théo le 25 sept. : sa carte suffit-elle pour commencer ? <s>Ouverte tant que le modèle n'est pas connu</s> **Répondue le même jour** : une NVIDIA RTX 3050 ou 3060 pour portable, 4 Go. Architecture Ampere, que CUDA prend en charge : bullet s'y compile. **4 Go suffisent aux premiers réseaux, par le calcul** — 768 → 1 024 × 2 → 1 et des lots de 16 384 positions demandent quelques centaines de Mo ; le débit d'une carte de portable, lui, reste à mesurer le moment venu. <span><strong>Confiance moyenne</strong>, de mémoire — la page de NVIDIA n'est pas joignable d'ici : le 3060 pour portable porte 6 Go, donc 4 Go désignent plutôt un 3050 ; `nvidia-smi` le dira.</span> **Et son accord** pour lever la règle « pas de runs sur ma machine » : « *ok le moment venu si ça permet de débloquer la suite* » — pour l'entraînement de B4, rien d'autre n'est demandé. **DÉCIDÉ n° 6 le 25 sept. (A21)** : la génération des données d'abord, sur runners — section A21 ; **première vague relevée le 26 sept. : 125 M positions, 77,7 M gardées par le filtre** — la cible de 100 M est atteinte ; **l'inférence dans le moteur écrite le 26 sept.**, derrière `EvalFile` — un nœud avec réseau coûte 0,73 à 0,87 fois un nœud fait main ; suit l'entraînement, sur la carte de Théo |
| **tablebases de finale** (reste de B6) | — | **reporté**, non chiffré |
| **B5 — analyse dans l'interface ; A8 — transport interface ↔ moteur** | — | **côté `ui/`**, chantier mené séparément sous son propre `ui/CLAUDE.md` : listés ici pour que le tableau soit complet, pas pour être ordonnés avec le moteur |

> **B8 (réglage des constantes de recherche) : son déclencheur écrit est
> ATTEINT et personne ne l'a relevé.** Sa fiche dit « quand le jeu de
> fonctionnalités est figé, c'est-à-dire après C12 et après la décision sur
> les extensions d'échec » — C12 clos le 21 sept., C18 mesuré et non fusionné.
> **La lettre est satisfaite, l'esprit non** : C17, C19 et bientôt C21 sont
> entrés depuis. *Le déclencheur était sous-spécifié.*

#### B9 ne se valide PAS par « nœuds identiques » — mesuré le 22 sept. 2026

J'avais annoncé à Théo que la réécriture atomique serait *« une réécriture
pure, la table doit se comporter pareil, donc nœuds identiques au bit près puis
`timing.sh` »*. **C'est faux, et deux minutes de sonde suffisent à le voir.**

| grandeur | valeur | conséquence |
|---|---|---|
| `size_of::<Entry>()` aujourd'hui | **24 octets** (mesuré, pas calculé) | 16 Mio → 524 288 entrées |
| entrée atomique : deux `AtomicU64` | **16 octets** | 16 Mio → **1 048 576 entrées** |

À mébioctets égaux, **la table double de capacité**, donc les collisions
changent, donc l'arbre change. Une réécriture qui change la taille d'une
structure de données n'est jamais « pure », quelle que soit la pureté de sa
logique. *Même famille que « vérifier le dénominateur » : un raisonnement
correct appliqué à la mauvaise grandeur.*

**Il y a donc deux effets, et ils se séparent par les quatre coins :**

1. **le coût des accès atomiques et de l'empaquetage** — mesurable proprement,
   mais seulement à **capacité forcée égale** (une rustine de mesure qui fige
   le nombre d'entrées) : là, nœuds identiques au bit près et `timing.sh`
   s'appliquent comme annoncé ;
2. **l'effet d'une entrée deux fois plus petite** — un changement d'arbre, donc
   un SPRT, et *plausiblement un gain* puisqu'il double la table à mémoire
   constante. Cet effet-là n'a rien à voir avec le parallélisme et personne ne
   l'avait jamais nommé.

**L'encodage est fixé par la mesure, pas au juger.** `MATE = 30 000`, et une
assertion posée dans `store` n'a **jamais** été déclenchée — ni par la suite de
tests complète, ni par les critères d'acceptation, tournoi de vingt-quatre
parties compris. Un score stocké tient donc dans un `i16`, d'où la répartition
des 64 bits de données : score 16, coup 16, profondeur 8, borne 2,
génération 8 — **50 bits sur 64**. La génération garde ses huit bits, donc
**le schéma de remplacement ne change pas d'un iota** ; c'était le risque de
l'encodage serré, et il est écarté.

Le schéma sans verrou est celui de Hyatt : un mot porte `clé XOR données`,
l'autre les données. Un lecteur reconstruit la clé par un XOR ; une entrée
*déchirée* — deux mots venant d'écritures différentes — rend une clé qui ne
correspond à rien et se rejette comme une collision ordinaire. Pas de verrou,
et la seule conséquence d'un déchirement est un défaut de cache, jamais un
score faux.

### `tools/pieges-fermes.md` — les pièges qu'un code de sortie tient désormais

`CLAUDE.md` est injecté en entier à chaque session **et après chaque
compactage**. Sa section *Pièges de mesure* en faisait 510 lignes sur 844 —
et la documentation de Claude Code est explicite : *« longer files consume more
context and reduce adherence »*, avec une cible sous 200 lignes par fichier.

Les pièges qui en sont sortis l'ont été sur un critère unique, et c'est celui
du projet : **une règle écrite se contourne, un code de sortie non.** Un piège
que `ref.sh`, `timing.sh`, `sprt.sh`, `mutants.sh`, `bench_reference.rs`,
`rustines_attic.rs`, le banc à la profondeur 6 ou le plafond calculé de
`match.yml` rendent *inexprimable* n'a pas besoin d'être relu à chaque
session ; il a besoin d'être trouvable le jour où le dispositif se déclenche.

**Chacun est sorti ENTIER**, jamais coupé en deux : une règle d'un côté et sa
preuve de l'autre, ce sont deux copies qui dérivent. Ceux qui restent dans
`CLAUDE.md` sont ceux que **seul le jugement protège** — la cadence qui possède
le verdict, le dénominateur, la ressource totale confondue avec l'allocation
par unité — et ce sont les plus chers.

`engine/tests/pieges_fermes.rs` vérifie que chaque piège archivé nomme un
dispositif **qui existe**, et que `CLAUDE.md` nomme toujours l'archive. Sans
lui, la condition de sortie que le fichier s'écrit à lui-même — *si un de ces
dispositifs disparaît, son piège revient* — ne serait qu'une affirmation de
plus sur le code, c'est-à-dire la faute exacte de la table de l'attic.

<s>Gain annoncé : ~200 lignes.</s> **Gain réel : 113** — `CLAUDE.md` passe de
844 à 731 lignes. J'avais surestimé, et le chiffre annoncé valait la peine
d'être corrigé plutôt qu'oublié.

### `tools/etat.sh` — l'état calculé, injecté à chaque reprise

`CLAUDE.md` est réinjecté après chaque compactage ; **le carnet de bord, non.**
Le document qui porte « où on en est » est donc absent au moment précis où la
mémoire vient d'être perdue. Le 22 sept. 2026, un engagement pris en prose —
*« j'attaque B9, je te reviens avec son coût monothread »* — a disparu
exactement comme ça : ni fiche, ni journal, ni ce fichier ne le portaient.

Le hook `SessionStart` déclaré dans `.claude/settings.json` lance `etat.sh`, et
sa sortie **entre dans le contexte du modèle**. `SessionStart` se déclenche au
démarrage, à la reprise, après `/clear` **et après chaque compactage** — c'est
le seul point d'accroche du système qui tombe au bon moment (`PreToolUse`
contraint mais n'injecte rien ; `Stop` et `PostToolUse` non plus).

**Tout ce qu'il imprime est dérivé de git**, donc rien ne peut y vieillir :
branche, arbre propre ou non, `git log origin/main..HEAD`, et le nombre de
fichiers `.rs` contre `.md` modifiés depuis `main`. Ce dernier est le **signal
de documentation** : il ne prescrit rien, il constate — *« 6 fichiers de code
et 0 de documentation » est un fait, « il faudrait documenter » est une
consigne qu'on oublie.*

L'adresse du carnet vit dans `.claude/carnet.local`, ignoré par git : le
pointeur est mécanique sans que le dépôt porte le lien, le carnet restant privé
et hors du dépôt.

`tools/verify-hooks.sh` vérifie que le hook est déclaré, qu'il lance bien ce
script, et que le script **rend un état non vide** — un script devenu muet ne
se verrait pas, on croirait simplement qu'il n'y a rien à dire. C'est la même
raison qui fait exister `verify-hooks.sh` lui-même.

### Paralléliser les matchs — ce qui marche et ce qui ne marche pas

**On ne parallélise PAS un SPRT.** Un test séquentiel tire ses taux d'erreur
d'une règle d'arrêt **unique** appliquée à un flux **unique**. Deux façons de
le casser, et les deux sont tentantes :

- lancer N SPRT et s'arrêter dès que **l'un** franchit sa borne multiplie le
  risque de première espèce par environ N — c'est le problème des comparaisons
  multiples, avec un habit de parallélisme ;
- recoller leurs parties après coup ne rend pas un test séquentiel, mais un
  échantillon **dont la taille a été choisie après avoir vu les données**. Ce
  n'est pas neutre, c'est pire que l'un ou l'autre pris seul.

La règle déjà écrite — *jamais reprendre un SPRT expiré* — est le cas
particulier de ce principe.

**On parallélise des matchs à LONGUEUR FIXE, et ceux-là se mettent en commun
sans rien casser** : effectif connu d'avance, estimation non biaisée, aucune
règle d'arrêt à préserver. C'est ce que fait `tools/mettre-en-commun.sh`.

#### Ce que ça achète, chiffré sur ce projet

Le SPRT expiré de C21 a rendu **± 8,31 Elo sur 3 240 parties**. L'intervalle
décroît en `1/√n`, donc en empilant des jobs de ~3 300 parties :

| jobs | parties | intervalle attendu | effet que ça sépare de zéro |
|---|---|---|---|
| 1 | ~3 300 | **± 8,2** | > 8,2 Elo |
| 2 | ~6 600 | **± 5,8** | > 5,8 |
| 4 | ~13 200 | **± 4,1** | > 4,1 |
| 8 | ~26 400 | **± 2,9** | > 2,9 |

<span>Ces chiffres viennent d'une mesure de ce dépôt, pas d'une constante
empruntée. **Réserve** : « séparer de zéro » est plus faible que la barre
habituelle du projet, qui est `H1` sur des bornes `[0, 5]` — pour écarter la
borne haute il faut que l'effet dépasse l'intervalle **plus 5**.</span>

#### Le piège propre à la mise en commun, et il est sérieux

**Deux runners GitHub varient de 58 % en vitesse** — 2 067 101 contre
3 268 241 n/s sur le même binaire — soit environ **un demi-pli** de profondeur
atteinte. Et ce dépôt a mesuré qu'**un pli peut INVERSER un verdict**.

Mettre en commun deux matchs joués sur des runners très différents **moyenne
donc deux points de fonctionnement**. Ce n'est pas nécessairement mauvais —
moyenner sur une plage de machines ressemble davantage à « la force générale »
qu'un point unique, qui est la cible déclarée du projet — mais **ça doit être
dit, pas subi**. `mettre-en-commun.sh` compare les matchs deux à deux par un
test en `z` et **refuse de conclure en silence** au-delà de `z = 2`.

**Et les graines doivent différer — ce n'est plus une règle à retenir.**
Mêmes binaires plus même graine donnent les mêmes parties coup pour coup :
deux jobs de même graine, c'est un effectif qui double sur le papier sans que
l'information bouge. Deux dispositifs, aux deux bouts :

- **au lancement**, `match.yml` accepte `graine: auto`, qui en tire une propre
  au run. Elle est imprimée dans le résumé, donc le match reste rejouable à
  l'identique en la repassant telle quelle. Le défaut `20260913` ne bouge pas :
  il rend les matchs **appariés**, ce qui est l'autre besoin — c'est lui qui a
  permis de comparer une même technique à deux cadences ;
- **à la mise en commun**, `mettre-en-commun.sh` **refuse** deux vecteurs
  pentanomiaux identiques, avec un code 3. Le moteur étant déterministe, deux
  matchs indépendants de plusieurs milliers de parties ne peuvent pas rendre
  cinq comptes égaux : un vecteur répété *est* une graine répétée.

*C'est le seul endroit où cette règle peut être imposée par un code de sortie
plutôt que rappelée : au lancement on ne tient qu'une intention, à la mise en
commun on tient les données.*

#### L'outil

```sh
tools/mettre-en-commun.sh "97,284,766,332,141" "100,290,750,340,150"
tools/mettre-en-commun.sh journal-a.log journal-b.log
```

Il **somme les comptes pentanomiaux** au lieu de moyenner des Elo : l'Elo est
une fonction non linéaire du score, donc en moyenner deux est une
approximation, alors que sommer les paires est exact. D'un journal d'arbitre il
prend la **dernière** ligne `Ptnml`, jamais la première.

`tools/mettre-en-commun-test.sh` l'éprouve, et son premier cas est une
**vérité terrain** : sur `Ptnml [97, 284, 766, 332, 141]`, fastchess avait
imprimé `Elo: 14.59 +/- 8.31` ; la formule retombe dessus à **0,003 près**. Les
autres cas vérifient que doubler l'effectif divise l'intervalle par `√2`, que
l'ordre des matchs ne change rien, que le refus se déclenche sur des matchs
contradictoires, et que la dernière ligne d'un journal est bien celle qui est
lue. Le test tourne dans `tools/verify.sh`.

### La gestion du temps : NON, ce n'est pas clos — état au 23 sept. 2026

Question de Théo. Elle a mérité d'être posée parce que **l'état de ce chantier
n'était écrit nulle part d'un seul tenant** : il était éclaté entre le
découpage de B2, la fiche C21 et la note de saturation. Le voici entier.

| ce que B2 nommait | état | ce qui le tient |
|---|---|---|
| défaut de `movestogo` (devenu **C21**) | <s>écrit, en mesure</s> **FUSIONNÉ** : +19,13 ± 6,31 Elo à `8+0,08` | +0,54 à 0,70 pli ; SPRT expiré à +14,59 ± 8,31, relancé en longueur fixe |
| « s'arrêter tôt sur un coup stable » | **RÉFUTÉ, clos** | et il *empire* au régime cible : 13,9 % de coups changés à `8+0,08`, **18,4 % à `30+0,3`**. Le temps épargné n'est de surcroît pas dépensable — avec `restant/d`, une seconde économisée ne revient qu'au `d`-ième |
| « prolonger sur un score qui s'effondre » | **OUVERT — écran passé, jamais écrit** | survit sur **2,7 à 3,0 % des coups** |
| **allocation inégale** | **PAS COMMENCÉ** | le seul chantier restant qui puisse dépasser le plafond — dépenser plus sur les positions **dures** (score instable, coup unique, sortie de livre) |
| *(examiné, écarté)* pendule de l'adversaire | **écran PASSÉ le 23 sept., petit levier de signe inconnu** | déjà reçue et jetée par le moteur. Écart signé entre les deux pendules : **médiane −12 ms** une fois l'artefact de comptage de coups retiré — donc un verdict symétrique rendrait zéro par construction. L'écart absolu dépasse 20 % sur **1,6 %** des coups : l'ordre de grandeur de l'extension d'échec, qui valait −5,0 |
| *(hors B2)* **ponder** | <s>jamais ouvert — protocole écrit, `p` mesuré</s> **ÉCRIT et MESURÉ** : +67,63 ± 9,19 Elo à `8+0,08` contre notre jumeau ; reste à dépenser le remboursement | légal et prévu par UCI. `p = 0,659` contre notre jumeau à `8+0,08`, soit **0,90 pli** — plus que C21. <s>Reste : le proxy à cadence asymétrique</s> — il ne pouvait pas être nul, donc ce n'était pas une porte. Reste : **écrire** (liste de dix lignes, vérifiée contre le source de Stockfish), puis mesurer sous cutechess à `-concurrency 1`. Voir la section qui suit |

#### Pourquoi l'allocation inégale est le vrai reste

Un diviseur est une **famille à un paramètre**, et le balayage a atteint sa
limite : le plafond d'une allocation *plate* vaut `(pendule + coups × inc) /
coups` = **280 ms**, et le diviseur 12 en alloue 285 quand le 10 en alloue 283.
**Aucune valeur de diviseur ne fera mieux.** Dépenser davantage sur les
positions dures — score qui bouge, coup unique, sortie de livre — est le seul
chemin au-delà, et c'est une autre mécanique, pas un autre réglage.

Le **résidu de l'échéance douce** appartient à la même famille : le moteur ne
dépense même pas ce qu'il s'alloue, parce qu'il s'interdit d'entamer une
itération à mi-budget. C'est ce résidu qui explique l'écart entre 31 % de
pendule restante prédits et 47 % mesurés.

#### Ce qu'on peut dire de « prolonger sur un effondrement », et ce qu'on ne peut pas

**2,7 à 3,0 % des coups**, c'est un *majorant* de ce que le mécanisme peut
rapporter — et ce dépôt a une mesure qui rappelle que ça ne dit rien du
**signe** : l'extension d'échec touchait 1,39 % de l'arbre et a rendu
**−5,01 ± 8,11**. Un mécanisme qui coûte sans améliorer la décision dépense en
pure perte.

**Donc : petit levier, signe inconnu.** Il ne passe pas devant l'allocation
inégale sur la seule foi de sa part.

### Réfléchir sur le temps de l'adversaire, et lire sa pendule

Deux questions de Théo, 23 sept. 2026. **Ni l'une ni l'autre n'est illégale.**

**Et ma première réponse — « inmesurable avec l'outillage actuel » — était
fausse.** Elle avait été écrite sans ouvrir le source des arbitres, en
s'appuyant sur l'absence d'un mot dans un seul fichier de documentation.
Corrigée le jour même, en lisant les deux arbitres **aux commits qu'on épingle**.

#### Ce que les arbitres épinglés savent faire, lu dans leur source

|  | `ponder` | `tc=` par moteur | journal des échanges UCI |
|---|---|---|---|
| **fastchess** `60d7a7a` | **non** — zéro occurrence du mot dans tout le dépôt | oui, `-engine … tc=` | oui, `-log file=… engine=true` |
| **cutechess-cli** `5e84232` | **oui** — `-engine … ponder`, documenté dans `res/doc/help.txt` | oui | oui, `-debug`, plus `stderr=FICHIER` par moteur |

Le zéro de fastchess est un vrai zéro : `grep -ri ponder` sur l'arbre complet
du commit épinglé ne rend rien, et le témoin `wtime` sur la même commande rend
`uci_engine.cpp`. **L'arbitre de travail ne peut pas pondérer ; l'arbitre de
contre-vérification le peut.** `setup-arbiters.sh --with-cutechess` le
construit déjà.

**Le piège d'invocation, vérifié dans le source, et il est sérieux.** `-each`
est déclaré `Dispatch::Deferred` (`cli.cpp`), donc appliqué **après** tous les
blocs `-engine`, et `parseEach` écrit chaque clé dans *tous* les configs sans
condition. Conséquence : **`-each tc=` écrase un `tc=` par moteur, quel que
soit l'ordre sur la ligne de commande.** Un match asymétrique lancé avec
`-each tc=` redevient symétrique, rend zéro Elo, et **ce zéro se lirait comme
un verdict**. `sprt.sh` et `match.yml` passent tous deux `-each tc=`
aujourd'hui : rendre une cadence asymétrique demande de **déplacer** `tc=`
dans chaque bloc `-engine`, pas d'ajouter une option à côté.

#### 1. Le ponder — ce qu'il vaut, comment l'écrire, comment le mesurer

**C'est prévu par le protocole** : UCI a `go ponder` et `ponderhit` pour
exactement ça. Rien à inventer côté norme.

##### L'arithmétique, corrigée

Si l'adversaire consomme à peu près le même temps que nous, un succès donne
**le double de temps sur ce coup-là**, soit `1,36` pli ; un échec ne donne
rien. La moyenne est donc `p × 1,36`.

<s>`log₂(1 + p) × 1,36`</s> **Faux, corrigé le 23 sept. 2026.** Cette
formule-là est celle d'un temps `(1 + p)` étalé **uniformément sur tous les
coups** — j'avais moyenné le temps au lieu de moyenner les plis. Même famille
que « vérifier le dénominateur » : une conversion juste appliquée à la mauvaise
grandeur. Et comme `log₂(1 + p) > p` sur `]0, 1[`, **l'ancien chiffre
surestimait**.

| taux de succès `p` | plis gagnés — **ponder réel**, `p × 1,36` | plis gagnés — **proxy uniforme**, `log₂(1+p) × 1,36` |
|---|---|---|
| 0,3 | 0,41 | 0,51 |
| 0,4 | 0,54 | 0,66 |
| 0,5 | 0,68 | 0,80 |
| 0,6 | 0,82 | 0,92 |
| **0,659 — mesuré, voir plus bas** | **0,90** | 0,99 |

La correction change le classement, c'est pourquoi elle est écrite plutôt que
faite en silence — mais elle ne le change pas dans le sens qu'on croirait :
`p` mesuré vaut `0,659`, donc le ponder pèse **0,90 pli**, soit *plus* que
C21 (`0,54 à 0,70`) et **plus de quatre fois** la génération par étapes
(`0,21`). Hors Lazy SMP, c'est le plus gros levier chiffré du dépôt.

##### Étape 0 — `p`, MESURÉ le 23 sept. 2026, sans une ligne de code dans le moteur

Le moteur **imprime déjà sa variante principale entière** (`pv_to_uci`,
alimentée par `PvTable`), donc le **deuxième coup de la PV est exactement notre
prédiction de la réponse adverse**. Et `-log file=… engine=true` enregistre les
deux sens du dialogue. Il n'y avait donc rien à instrumenter — `tools/lire-journal.sh`
lit le journal et compare. **Quarante-huit parties à `8+0,08`, moteur contre
lui-même, six minutes de conteneur :**

| | |
|---|---|
| recherches suivies d'une réponse adverse | **5 081** |
| succès | 3 346 |
| échecs | 1 561 |
| PV de moins de deux coups, donc aucune prédiction | 174 (3,42 %) |
| `p` sur les coups où une prédiction existe | 0,6819 |
| **`p` sur TOUS les coups** | **0,6585** |

**Le dénominateur est celui de TOUS les coups**, pas celui des coups
prédictibles : un coup sans prédiction est un coup où le ponder ne rapporte
rien, exactement comme un échec. Prendre `0,682` gonflerait le gain de 3,5 %
— petit ici, mais c'est la faute que ce dépôt a déjà payée deux fois.

**Vraisemblance contrôlée, et elle retombe exactement** : 5 081 comparées
+ 90 dernières recherches de partie + 6 dernières recherches du match
(3 fils × 2 moteurs) = **5 177**, le nombre de `bestmove` du journal.

**Et `p` appartient à son adversaire, exactement comme un verdict appartient à
sa cadence.** Ce `0,659` est mesuré **contre notre propre jumeau** : prédire
une décision produite par une évaluation identique à la nôtre est le cas le
plus facile qui soit. <span>Inférence, confiance moyenne : contre un moteur
différent `p` sera plus bas, donc **ce chiffre est un majorant** du régime de
déploiement.</span> Il appartient *plausiblement* aussi à sa cadence —
chercher plus profond devrait mieux prédire — mais <span>ça n'est pas mesuré
ici, et je ne l'inscris pas comme un fait</span>. **Étiqueter `p` avec son
adversaire et sa cadence, jamais le citer nu.**

##### Un seul coup prédit, ou plusieurs quand plusieurs réponses se valent ? — mesuré le 23 sept. 2026

Question de Théo. **Un seul — la mesure le tranche, et l'arithmétique dit
pourquoi.**

*L'arithmétique.* Le gain d'un surcroît de temps est **logarithmique**.
Partager le temps adverse entre deux candidats, à parts `x` et `1 − x`, rend
`1,36 × (p₁ log₂(1+x) + p₂ log₂(2−x))` pli, où `p₁` et `p₂` sont les chances
que l'adversaire joue chacun. L'optimum vaut `x* = (2p₁ − p₂) / (p₁ + p₂)`,
qui atteint 1 — **tout sur le premier** — dès que **`p₁ ≥ 2 p₂`**. Autrement
dit : *partager ne paie que si le deuxième candidat est au moins moitié aussi
probable que le premier.* Même au mieux, partager à égalité entre deux coups
qui couvriraient **toutes** les réponses rendrait `log₂(1,5) × 1,36 = 0,80`
pli — moins que les 0,90 du coup unique mesuré.

*La mesure.* Même journal, 4 995 recherches. Le candidat naturel au deuxième
rang est le deuxième coup de la variante à l'itération d'avant, quand il a
changé depuis :

| stabilité du coup prédit sur les dernières itérations | part | `p₁` | `p₂` | `p₂ / p₁` |
|---|---|---|---|---|
| vient de changer | 29,4 % | 0,566 | 0,099 | 0,17 |
| stable 2 à 3 itérations | 40,4 % | 0,709 | 0,036 | 0,05 |
| stable 4 à 6 | 14,4 % | 0,722 | 0,051 | 0,07 |
| stable 7 ou plus | 15,8 % | 0,745 | 0,046 | 0,06 |
| **4 candidats distincts ou plus** pendant la recherche | 17,0 % | 0,595 | 0,112 | **0,19** |

**Le seuil est 0,5, et aucune classe ne dépasse 0,19** — pas même la plus
instable. Les échecs de prédiction se dispersent sur beaucoup de coups au lieu
de se concentrer sur un deuxième. <span>Limite : le candidat au deuxième rang
est ici celui de l'itération précédente, pas le vrai deuxième meilleur coup,
qu'il faudrait un MultiPV pour connaître. Mais pour que le partage paie dans
la classe la plus instable, ce deuxième coup devrait capter 74 % de tous les
échecs — confiance moyenne-haute que non.</span>

*Et le protocole n'offre qu'un coup.* UCI prévoit `bestmove X ponder Y` puis
`go ponder` sur **une** position. Chercher ailleurs que ce qu'on nous donne
serait une affaire interne au moteur, non standard. La variante « chercher la
position d'AVANT la réponse adverse », qui répartit l'effort par l'alpha-bêta
lui-même, perd sur chaque succès la profondeur que coûtent les réfutations des
autres réponses ; <span>inférence, confiance moyenne : avec une prédiction
aussi concentrée, elle est dominée</span>.

*Ce que la table dit en plus* : la prédiction s'améliore avec sa stabilité
(0,566 → 0,745), et la stabilité croît avec la profondeur. **`p` devrait donc
monter à cadence longue** — <span>inférence : non mesuré à `30+0,3`</span>.

##### Étape 1 — le proxy asymétrique : ce n'est PLUS une porte

Je l'avais écrit comme la porte d'entrée : *« un proxy nul ferme la
question »*. **Il ne peut pas être nul.** Donner `1,66 ×` le temps à un camp
gagne toujours — C21 a rendu **+19,13** pour un budget par coup `× 1,32`. Une
porte dont on connaît l'issue d'avance n'est pas une porte ; c'est un job
dépensé pour rien. Il ne resterait au proxy que de *dimensionner* le vrai
match, et le vrai match se dimensionne aussi bien par ses premiers jobs. **Le
proxy sort du chemin.** Le piège d'invocation (`-each tc=`) reste écrit plus
haut, pour le jour où une cadence asymétrique servira à autre chose.

##### Étape 2 — écrire : la liste complète, et les pièges de chaque ligne

Les deux moitiés viennent **ensemble** — voir plus bas pourquoi une moitié
serait pire que rien. Trois pratiques sont **vérifiées dans le source de
Stockfish** (`master`, lu le 23 sept. 2026), pas citées de mémoire :

1. **Annoncer** `option name Ponder type check default false`. C'est
   l'interface qui l'active ; le moteur ne pondère jamais de lui-même.
2. **`bestmove X ponder Y`**, avec `Y` le deuxième coup de la variante —
   **converti sur le plateau APRÈS `X`**. Un roque en `Y` rendu sur le mauvais
   plateau sortirait en notation interne : c'est l'invariant de frontière de
   `CLAUDE.md`, et `pv_to_uci` le respecte déjà coup par coup.
3. **Variante d'un seul coup** — 3,42 % des recherches : tirer `Y` de la
   **table de transposition** à la position d'après `X`, comme Stockfish
   (`RootMove::extract_ponder_from_tt`, appelé quand `pv.size() == 1`). Sinon,
   ne pas écrire `ponder` du tout.
4. **`go ponder`** : chercher **sans échéance**. Et le piège qu'on rate : **une
   recherche qui FINIT pendant le ponder** — mat trouvé, profondeur maximale —
   **n'a pas le droit d'écrire `bestmove`**. Elle attend `ponderhit` ou `stop`.
   Stockfish le fait explicitement (*« we simply wait here »*). Écrire le coup
   pendant le tour adverse est une faute de protocole que l'arbitre sanctionne.
5. **`ponderhit`** — <s>l'horloge démarre maintenant ; le budget se calcule
   sur la pendule reçue et la recherche continue ; si le ponder a déjà duré
   plus que ce budget, s'arrêter à la prochaine itération close.</s> **Cette
   ligne se contredisait, corrigée le jour même en lisant Stockfish** : elle
   disait à la fois « l'horloge démarre maintenant » et « le temps déjà passé
   compte ». Stockfish tranche — `limits.startTime` est posé au `go ponder`,
   les contrôles de temps sont suspendus pendant le ponder, et au
   `ponderhit` l'échéance comptée **depuis le `go ponder`** s'applique. *Le
   temps de ponder compte comme déjà dépensé sur ce coup* : sur un succès
   long, le moteur joue aussitôt et **garde sa pendule pour les coups
   suivants**. C'est aussi le bon choix par l'arithmétique des pages
   précédentes : répartir un surplus de temps sur tous les coups rend
   `log₂(1+p) × 1,36 ≈ 0,99` pli, le concentrer sur les coups prédits
   `p × 1,36 ≈ 0,90`. <span>Inférence, confiance moyenne : le modèle
   idéalise la redistribution par `restant / movestogo`.</span>
6. **`stop` pendant le ponder** (échec de prédiction) : écrire un `bestmove`
   immédiatement ; l'interface l'ignore. Puis viennent la vraie position et un
   `go` ordinaire, avec une table déjà chaude.
7. **Le temps quand `Ponder` est activé** : la norme UCI prévoit que le moteur
   puisse changer sa gestion du temps quand le ponder est permis. Stockfish
   ajoute **25 %** à son temps optimal (`optimumTime += optimumTime / 4` dans
   `timeman.cpp`). **Réglage à mesurer séparément**, jamais à recopier : leur
   gestion du temps n'est pas la nôtre.
8. **Les invariants tiennent** : le moteur ne garde toujours aucun état entre
   deux `position` — le ponder part d'un `position` suivi d'un `go ponder`. La
   table persiste, comme elle le fait déjà.
9. **Tests, écrits avec le code** : pas de `bestmove` avant `ponderhit` ou
   `stop`, même si la recherche finit ; `ponderhit` rend un coup dans le
   budget ; `stop` rend un coup tout de suite ; le coup de `ponder` est légal
   sur le plateau d'après, roque compris.
10. **`tools/crosscheck.sh` après** — `CLAUDE.md` l'exige après toute
    modification de la couche UCI.

##### ÉCRIT le 23 sept. 2026 — ce qui est en place, et ce que les tests ont attrapé

Les dix lignes de l'étape 2, sauf la septième (le temps quand `Ponder` est
permis, qui reste un réglage à mesurer). Dans `search.rs` : un drapeau
`pondering` partagé, qui suspend les deux échéances et retient le coup d'une
recherche finie ; `ponder_move`, qui rend le deuxième coup de la dernière
variante **achevée** ou, à défaut, celui de la table. Dans `uci.rs` :
l'annonce, `ponderhit`, le drapeau posé **avant** de lancer le fil, et
`bestmove_line`, qui convertit le pari sur le plateau d'après.

**Ponder désactivé, rien ne change** : le banc rend 114 028 et 31 637, au nœud
près. Seule la ligne `bestmove` gagne ` ponder Y` — fastchess lit le jeton qui
suit `bestmove` (`findElement`, lu dans son source), cutechess lit le pari.
**Et pas de ralentissement démontré** : `tools/timing.sh` contre `main`,
24 paires à la profondeur 10, 12 gagnantes sur 24, p = 1,0. Le chemin chaud
ne gagne qu'une lecture atomique tous les `CHECK_INTERVAL` nœuds et une copie
de la variante par itération — mais c'est la mesure qui le dit, pas cette
phrase.

**Sept défauts injectés à la main, sept attrapés — mais pas du premier coup.**
Deux survivaient à la première version des tests, et chacun enseigne quelque
chose :

- *une recherche qui s'arrêterait à l'échéance puis attendrait `ponderhit`*
  passait : le fil ne finissait pas, comme il le doit. Ce qui trahit ce défaut
  n'est pas que le fil tourne, c'est qu'il cesse d'**approfondir**. Et la
  première façon de le mesurer — comparer la profondeur à celle d'une
  recherche ordinaire au même budget — laissait encore passer le mutant :
  **l'échéance douce se vérifie à chaque fin d'itération, la dure tous les
  `CHECK_INTERVAL` nœuds**, donc la référence s'arrêtait *plus tôt* que le
  mutant lui-même. La grandeur qui tranche est l'instant où la dernière
  itération s'achève ;
- *un `ponderhit` qui arrêterait aussi la recherche* passait : le test de la
  recherche baissait le drapeau directement, sans passer par la commande. Le
  test UCI vérifie désormais que `ponderhit` n'est pas un `stop` — sans quoi
  66 % des coups se joueraient avec la seule profondeur du temps adverse.

**Vérifié avant de fusionner, le 23 sept. 2026 :**

- **`tools/crosscheck.sh`** — la couche UCI a changé : les deux arbitres
  rendent **14-9-1** l'un et l'autre, accord ;
- **un match de correction PONDER ACTIVÉ** sous cutechess — même binaire,
  l'un pondère, l'autre non, une partie à la fois, 40 parties à `2+0,02`,
  dialogue complet journalisé : **aucune perte au temps, aucun coup illégal,
  aucune déconnexion, aucun avertissement de l'arbitre**. Et chaque
  `go ponder` s'est terminé par un `ponderhit` ou un `stop`, jamais par un
  coup rendu trop tôt ;
- **le taux de succès, compté par l'arbitre lui-même** : 1 344 `ponderhit`
  sur 2 054 `go ponder`, soit **0,654** — la mesure du matin, par une tout
  autre méthode (le deuxième coup de la variante, relu dans un journal
  fastchess), donnait **0,659**. Deux méthodes, un même chiffre ;
- **la pendule** : le moteur qui pondère finit ses parties avec une médiane
  de **604 ms** restantes, contre **283 ms** pour l'autre. Il garde bien le
  temps gagné — c'est la sémantique voulue — mais n'en dépense qu'une partie.
  C'est exactement ce que viendrait récupérer la septième ligne de la liste,
  dépenser davantage quand le ponder est permis. **Réglage à mesurer**, pas à
  recopier de Stockfish.

Le score de ce match, 25-7-8, **n'est pas une mesure** : 40 parties, une
cadence de dégrossissage. Il ne dit que « rien ne casse ». Le verdict en Elo
passe par le protocole ci-dessous.

Après la fusion : un balayage de mutation de `search.rs` et `uci.rs`, qui
portent du code neuf.

##### `tools/paires.sh` — le vecteur que cutechess n'imprime pas

cutechess-cli, le seul arbitre qui sait pondérer, n'écrit aucun vecteur
pentanomial ; `mettre-en-commun.sh` ne sait sommer que ceux-là.
`tools/paires.sh <journal> [candidat]` les reconstruit depuis les lignes
`Finished game N (…)` que les deux arbitres écrivent : avec `-repeat` et
`-games 2`, les parties `2k−1` et `2k` forment une paire. Sa sortie se passe
telle quelle à `mettre-en-commun.sh`.

**Vérité terrain** : sur un vrai journal fastchess de 80 parties, il retombe
exactement sur le vecteur que fastchess a calculé lui-même, `[3, 11, 8, 13,
5]`. `tools/paires-test.sh` l'éprouve dans `tools/verify.sh`, avec les refus
qui ne servent qu'en cas de problème : une partie sans sa jumelle est écartée
et signalée, jamais comptée à moitié.

##### Étape 3 — mesurer : le protocole, et ses pièges

- **Le même binaire des deux côtés, `Ponder` activé contre désactivé.** On
  mesure le ponder, pas le binaire. Mais vérifier d'abord que ce binaire,
  `Ponder` désactivé, rend **exactement** le banc de `main` : si le code du
  ponder a touché la recherche, ce n'est plus une mesure du ponder seul.
- **cutechess-cli, pas fastchess** — fastchess ne sait pas pondérer (lu dans
  son source, plus haut). **EN PLACE le 23 sept.** : `match.yml` prend une
  entrée `ponder` — `non`, `candidat` ou `les-deux` — qui fait jouer
  cutechess. Avec `candidat`, le même commit des deux côtés est admis : c'est
  précisément la mesure du ponder seul.
- **`-concurrency 1` est obligatoire, pas prudent.** Le camp qui pense sur le
  temps adverse brûle du CPU pendant que l'autre cherche ; à `-concurrency 3`
  on passerait à six moteurs actifs pour quatre cœurs, et **le vol tomberait
  sur l'adversaire du candidat**, c'est-à-dire dans le sens de l'hypothèse. La
  règle générale est plus bas : *la concurrence se déduit des cœurs qu'occupe
  une partie*. Coût : **un tiers des parties par job** — ~1 000 à `8+0,08`,
  pas les ~1 250 écrits d'abord : ce chiffre venait des 5,57 s par partie
  d'avant C21, et les matchs de C21 en ont rendu 6,34 à 6,44 à concurrence 3,
  parce qu'il dépense la pendule. *Une constante qu'un chantier fusionné
  invalide se recalcule avant de dimensionner, pas après.*
  **`match.yml` la dérive désormais de l'inégalité** et refuse de lancer
  quand elle ne tient pas — éprouvé : deux cœurs, ponder demandé, refus.
- **cutechess n'imprime AUCUN vecteur pentanomial** — vérifié dans son source
  épinglé : seulement `Score of A vs B: V - D - N`. `tools/paires.sh` le
  reconstruit (section suivante), et **le résumé du job l'écrit au format de
  fastchess**, `Ptnml(0-2): […]` : `mettre-en-commun.sh` lit donc un journal
  de job cutechess comme un autre. Sur le match de correction, le vecteur
  reconstruit rend 29 points sur 40, exactement le `[0.725]` de cutechess.
- **Le recensement des pertes au temps** cherchait les chaînes de fastchess.
  Celles de cutechess, relues dans son source (`Result::description`), en
  ajoutent trois : une **nulle** par temps, par déconnexion ou par blocage,
  quand l'adversaire ne peut plus mater. Une perte au temps quand même — le
  motif de fastchess l'aurait laissée passer. Ajoutées.
- **La graine de cutechess tient sur 32 bits** (`-srand`, `QMetaType::UInt`)
  et un identifiant de run en fait 35 : il la **réduit modulo 2³² sans le
  dire** — mesuré, 35 861 838 168 et 1 502 099 800 jouent les mêmes
  ouvertures. `match.yml` la réduit lui-même, pour que la graine imprimée soit
  celle qui a joué.
- **Pas de SPRT sous cutechess** — `match.yml` le refuse : son test n'a pas
  le modèle de celui de fastchess, et la mesure passe de toute façon par
  plusieurs jobs.
- **Le taux de succès se relit en partie réelle** : cutechess le calcule
  (`m_ponderHits`) mais ne l'affiche que dans son interface graphique. Le
  journal `-debug` porte tout le dialogue ; `tools/lire-journal.sh` ne lit que
  le format de fastchess.
- **Limite connue, et elle joue pour le candidat** : même sans vol de cœur,
  deux moteurs actifs à la fois se partagent le cache et la mémoire. Un
  déploiement où l'adversaire tourne sur une autre machine n'a pas ce coût.
  <span>Inférence, ordre de grandeur inconnu.</span>
- **Fixed-length, graines distinctes, mis en commun** — jamais un SPRT.

##### Ce que l'absence de ponder coûte aujourd'hui : rien — et c'est une cohérence, pas une chance

`parse_go` ignore le mot `ponder` (il tombe dans `_ => {}`), donc un
`go ponder` serait traité comme une recherche chronométrée ordinaire et
rendrait `bestmove` **pendant le tour de l'adversaire** — hors protocole. Mais
le moteur n'annonce que `option name Hash` : **pas de `Ponder`**. Cutechess
rend la dépendance explicite dans son code (`m_canPonder` ne passe à vrai que
si le moteur déclare `Ponder`, et l'envoi de `go ponder` est gardé par lui).

**Ne pas annoncer `Ponder` est exactement ce qui rend son absence correcte.**
Corollaire : **une implémentation partielle serait pire que rien** — annoncer
l'option sans traiter `ponderhit` ferait chercher à l'infini et perdre au
temps. Rien à corriger tant qu'on n'implémente pas ; tout à implémenter d'un
coup le jour où on le fait.

##### Le « déploiement » n'était pas une question à poser — corrigé le 23 sept. 2026

<s>« C'est un arbitrage de Théo, pas une mesure : si on ne déploie jamais avec
ponder, les trois étapes ne valent pas d'être achetées. »</s> **Faux cadre,
relevé par Théo.** Le moteur ne choisit pas de pondérer : **c'est l'interface
qui l'active ou non** — une liste de classement le laisse éteint, un serveur
de jeu l'allume. Ce que le moteur décide, c'est seulement de le
**supporter**. Et le supporter correctement ne change **rien** là où le ponder
est éteint — le code ne s'exécute pas — et rapporte là où il est allumé.
C'est exactement le cas que couvre l'arbitrage du 21 sept. 2026 : *« tout ce
qui peut se résoudre par la mesure et par l'objectif de qualité long terme ne
nécessite pas d'arbitrage »*. **Le ponder entre dans la file, à son rang de
plis.**

**Et c'est bien ainsi que font les autres — vérifié dans leurs sources le
23 sept. 2026, pas de mémoire.** Question de Théo : *« les autres moteurs ont
ça ? »*

| | ce qu'il fait du ponder | lu dans |
|---|---|---|
| **Stockfish** | annonce `option name Ponder type check default false`, écrit `bestmove e2e4 ponder e7e6`, ajoute 25 % à son temps quand l'option est activée | `timeman.cpp`, `search.cpp`, et sa page « UCI Protocol and Stockfish Commands » |
| **Ethereal** | annonce `Ponder` désactivé par défaut, traite `ponderhit` | `src/uci.c` |
| **Leela Chess Zero** | option `Ponder`, `false` par défaut, traite `ponderhit` | `src/engine.cc`, `src/chess/uciloop.cc` |
| **cutechess-cli** — le logiciel qui fait jouer | drapeau `ponder` par moteur, **désactivé par défaut**, et seulement si le moteur a annoncé `Ponder` ; envoie alors `go … ponder`, puis `ponderhit` ou `stop` | `uciengine.cpp`, `help.txt` |
| **lichess-bot** — le pont vers les serveurs de jeu | réglage `ponder: true  # Think on opponent's time.` dans sa configuration d'exemple | `config.yml.default` |
| **fastchess** | ne sait pas pondérer | tout son dépôt |

Trois moteurs, un même motif : **le moteur annonce, désactivé par défaut ; le
logiciel décide.** <span>Ce que je n'ai pas pu vérifier : que les listes de
classement jouent ponder désactivé — CCRL n'est pas joignable depuis le
conteneur. Inférence, confiance moyenne.</span> Seul son verdict en Elo appartient à un régime — celui où il est
allumé — et c'est ainsi qu'il s'étiquettera, comme une cadence.

#### 2. La pendule de l'adversaire — elle est DÉJÀ reçue, et jetée

**Fait vérifié dans le code, pas supposé.** `parse_go` lit `wtime`, `btime`,
`winc` et `binc` — les deux camps — et `Limits` les porte tous les quatre. Puis
`time_budget_ms` fait :

```rust
let (remaining, increment) = match side {
    Color::White => (limits.wtime, limits.winc),
    Color::Black => (limits.btime, limits.binc),
};
```

**L'information de l'adversaire est parsée, testée, et écartée du budget.**
Rien à ajouter au protocole : tout est déjà là.

##### Deux mécanismes distincts se cachent sous la même question, et un seul est général

- **(a) Le flag** — accélérer quand l'adversaire est court, pour gagner au
  temps. Toute sa valeur est dans la queue de distribution, et elle se
  concentre contre un humain ou contre une gestion du temps très différente.
- **(b) L'ajustement de budget** — dépenser plus librement quand on a nettement
  plus de temps que l'adversaire, économiser dans le cas contraire. Celui-là
  est général, et il appartient à la famille de l'allocation inégale.

**Seul (b) mérite d'être mesuré**, et son entrée est exactement l'écart entre
les deux pendules.

##### L'écran vient du MÊME journal que `p` — passé le 23 sept. 2026

`wtime` et `btime` nous sont envoyés à chaque coup ; `-log … engine=true` les
enregistre. **Un seul match instrumenté a rendu les deux écrans** — même 48
parties, même journal, `tools/lire-journal.sh`.

**Et il faut séparer un artefact avant de lire quoi que ce soit.** Quand les
noirs ont le trait, les blancs ont joué un coup de **plus**, donc leur pendule
est plus basse *par construction*. L'écart signé moyen en sort positif tout
seul, sans qu'aucun moteur ne gère son temps différemment :

| | écart signé médian | écart signé moyen | `|écart|` relatif médian | > 10 % | > 20 % |
|---|---|---|---|---|---|
| trait aux blancs — **autant de coups joués des deux côtés** | **−12 ms** | **−6 ms** | 5,34 % | 23,3 % | 1,58 % |
| trait aux noirs — *l'adversaire a joué un coup de plus* | +87 ms | +127 ms | 6,82 % | 29,3 % | 2,44 % |

**Sans cette séparation, le journal entier rend « +60 ms de moyenne en notre
faveur », et ce chiffre est un artefact de comptage de coups.** Quatrième
occurrence de « vérifier le dénominateur » : une grandeur juste, moyennée sur
un ensemble qui n'est pas celui qu'on croit.

##### Ce que l'écran dit vraiment, et il n'est pas celui que j'avais annoncé

**J'avais écrit que les deux pendules « se suivent » et que l'écart « reste
petit ».** Mesuré, c'est plus précis que ça et il faut les deux moitiés :

- **l'écart SIGNÉ est nul** — médiane −12 ms, moyenne −6 ms, sur une pendule
  de huit secondes. Dans un match symétrique, *aucun* camp n'a
  systématiquement plus de temps. **L'entrée du mécanisme (b) — « j'ai
  systématiquement plus de temps que lui, je peux dépenser » — vaut donc
  exactement zéro dans notre protocole de mesure.** Ce n'est plus une
  prédiction, c'est un relevé ;
- **l'écart ABSOLU ne l'est pas** : 5,3 % à la médiane, plus de 10 % sur
  **23 % des coups**, plus de 20 % sur 1,6 %. Il y a bien de l'information —
  c'est du bruit centré, pas une constante nulle.

**Les deux ensemble donnent la conclusion** : un mécanisme qui lirait la
pendule adverse se déclencherait aussi souvent dans un sens que dans l'autre,
et mesuré contre soi-même il rendrait zéro **quelle que soit sa vraie valeur**.
*Ce n'est pas un argument contre le mécanisme, c'est le troisième cas du même
piège*, après le moteur qui démarre froid et le banc qui ne sature pas la
table qu'on double.

<s>C'est une entrée du chantier « allocation inégale ».</s> **Trop généreux,
corrigé le 23 sept. au matin même** : l'allocation inégale au sens habituel
dépense plus sur les positions **dures**, ce qui est un autre levier, plus gros
et mesurable chez nous.

**Et la part de l'arbre touchée majore le gain sans rien dire du signe.**
1,6 % des coups au-delà de 20 % d'écart, c'est l'ordre de grandeur de
l'extension d'échec — 1,39 % de l'arbre, **−5,01 ± 8,11**. Petit levier, signe
inconnu, exactement comme « prolonger sur un effondrement ».

##### Donc : un verdict CONDITIONNEL, étiqueté par sa condition comme un verdict l'est par sa cadence

La seule mesure honnête est contre un adversaire dont la gestion du temps
**diffère délibérément**. Deux façons, et la référence existe déjà :

- **un `movestogo` différent** — le parent de `ebe93ad` alloue par 30 quand
  `main` alloue par 12 ; `ref.sh` le construit en une commande ;
- **des pendules de départ asymétriques**, par un `tc=` dans chaque bloc
  `-engine` — même invocation que le proxy du ponder, donc **même piège**.

**Et ce n'est pas un pis-aller.** Si la cible est la force générale contre des
moteurs variés, un adversaire dont la gestion du temps diffère **ressemble
davantage au régime cible** qu'un jumeau parfait. Le pis-aller serait de
mesurer contre soi-même et de lire le zéro que le protocole impose.

##### À faire pour la pendule adverse, dans l'ordre — et ce qui n'est PAS à faire

1. **Rien avant l'allocation inégale.** Son levier est plus gros et son régime
   de mesure est le nôtre ; la pendule adverse est petite et de signe inconnu.
2. **Le jour venu, le mécanisme (b) seulement** : moduler le budget par le
   rapport des deux pendules, borné — par exemple multiplier `restant / d` par
   `(nôtre / sienne)^α`, écrêté. `α` se mesure, il ne se choisit pas. Le flag
   (a) n'entre pas : sa valeur est dans la queue, contre un humain.
3. **La mesure, conditionnelle et étiquetée** : contre le parent de `ebe93ad`
   (`movestogo` 30), dont les pendules divergent réellement de celles de
   `main`. **Jamais contre soi-même** : l'écart signé y est nul par
   construction, le verdict serait zéro quelle que soit la vraie valeur.
4. **Avant de conclure de l'écran d'un autre match**, séparer les deux
   couleurs — `tools/lire-journal.sh` le fait ; sans cela on mesure l'artefact
   de comptage de coups (+60 ms « en notre faveur », −6 ms en vrai).

**L'ordre d'achat, lui, a changé — et c'est la mesure qui l'a changé.** Avant
l'écran, le ponder était écrit « ~0,8 pli, inmesurable » et rangé nulle part ;
il vaut **0,90 pli**, plus que C21, et il se mesure — son protocole est
ci-dessus. L'allocation inégale sur les positions dures garde son rang devant
*la pendule adverse*. <s>Seul l'arbitrage de déploiement sépare ponder et
allocation inégale.</s> **Il n'y a pas d'arbitrage** (voir « Le déploiement
n'était pas une question à poser ») : les plis ordonnent, et le ponder passe
devant.

### La concurrence d'un match se DÉDUIT des cœurs qu'occupe une partie

Question de Théo, 23 sept. 2026 — *les cas où l'on ne peut plus jouer à la
concurrence maximale*. La règle « jamais deux matchs sur une même machine »
en est le cas particulier ; la règle générale est une inégalité, et deux
chantiers déjà dans la file la franchissent.

> **cœurs occupés par une partie × concurrence ≤ cœurs du runner − 1**
>
> Le cœur de réserve est pour l'arbitre et le système : un moteur qui attend
> un cœur perd du temps de pendule, et le perd de façon asymétrique.

| ce que font les moteurs | cœurs par partie | concurrence sur 4 processeurs logiques — **2 cœurs physiques**, mesuré le 23 sept. |
|---|---|---|
| monofil, sans ponder — **tout ce qui a été mesuré jusqu'ici** | 1 (un seul moteur réfléchit à la fois) | **3** |
| un camp pondère (mesure du ponder) | 2 | **1** |
| Lazy SMP à `T` fils, sans ponder (B6) | `T` — le plus grand des deux camps | `⌊3 / T⌋` : **1** dès `T = 2` |
| Lazy SMP à `T` fils ET ponder | `T` + `T` | **impossible** à `T ≥ 2` sur 4 cœurs |

**Le sens du biais n'est pas le même selon le chantier**, et c'est ce qui rend
la règle dangereuse à oublier : le ponder vole du CPU **à l'adversaire du
candidat** (biais vers l'hypothèse), Lazy SMP en vole **au candidat
lui-même**, dont les fils se disputent les cœurs (biais contre). *Dans les
deux cas le verdict ne vaut rien.*

**Ce qui la rend aujourd'hui inexprimable, et ce qui ne le fait pas.**
<s>`match.yml` calcule `concurrence = nproc − 1` et ne connaît ni fils ni
ponder.</s> **Depuis le 23 sept., `match.yml` dérive la concurrence de
l'inégalité** — deux cœurs par partie dès que quelqu'un pondère — et refuse de
lancer quand elle ne tient pas. <s>**Les fils, non** : le jour où un match passe
`option.Threads`, le nombre de cœurs par partie devient `T` et la même ligne
doit le savoir. C'est une étape de B6, écrite dans sa liste, pas une
précaution à retenir.</s> **Les fils aussi depuis le 24 sept.** — première étape
de B6. Deux entrées, `fils_candidat` et `fils_reference` (1 par défaut) ; la
partie occupe le plus gros des deux camps sans ponder, leur somme avec ; et
deux refus de plus, chacun pour un zéro qui se lirait comme un verdict :

- **un moteur qui ne DÉCLARE pas `Threads`** en réponse à `uci`. Le protocole
  veut qu'une option inconnue soit ignorée en silence — ce moteur le fait —,
  donc un match « deux fils contre un » sur un binaire d'avant Lazy SMP
  jouerait monofil des deux côtés et rendrait zéro ;
- **plus de fils réfléchissant à la fois, DANS une partie, que de cœurs
  PHYSIQUES** (`lscpu`, dans l'étalonnage). Deux fils d'un même cœur s'en
  partagent les unités de calcul : la mesure dirait ce que vaut le SMT, avec
  un biais contre le camp qui a le plus de fils. Entre deux parties le partage
  frappe les deux camps pareil, d'où la concurrence 3 des matchs monofils ;
  dans une partie, non. Sur les runners, deux cœurs physiques : Lazy SMP à
  deux fils sans ponder passe, deux fils plus un camp qui pondère non.

`option.Threads` passe **par moteur, jamais dans `-each`**, qui écraserait les
valeurs des moteurs comme il le fait de `tc=`. **Douze entrées** : GitHub en
admet vingt-cinq par `workflow_dispatch` depuis le 4 déc. 2025 — vérifié à la
source (changelog GitHub) avant d'ajouter la onzième, et au contact : la
première sonde à deux fils est partie avec les douze. Éprouvé en rejouant les étapes
en local : les trois refus, et un moteur témoin qui déclare `Threads` et
journalise ce qu'il reçoit — `setoption name Threads value 2` au seul
candidat, une partie à la fois, sous les deux arbitres.

### Ce qu'il faut surveiller — et que rien ne signalera tout seul

Un garde-fou attrape ce qui casse. Ces points-ci ne cassent rien : ils
**vieillissent**, et c'est pourquoi ils sont écrits plutôt que gardés.

- **Les runners changent de MODÈLE, pas seulement de vitesse** — relevé le
  24 sept. 2026 : EPYC 7763, EPYC 9V74 et EPYC 9V45 dans la même nuit, de
  2,02 à 4,06 M n/s au banc sur des binaires voisins. Un verdict reste valide
  en interne ; deux runs ne se comparent qu'après lecture de leurs
  étalonnages, et un chiffre de vitesse ne se recopie jamais d'un run à
  l'autre.

| quoi | quand ça devient actionnable | pourquoi aucun test ne le dira |
|---|---|---|
| **l'estimation de durée de `match.yml`** | <s>le jour où C21 fusionne</s> **C21 a fusionné le 23 sept.** — reste à relire la durée au **premier match où les DEUX moteurs portent C21** | le facteur **EST** le gaspillage de pendule. Mesuré : 0,75 avec deux moteurs d'avant, **0,85** avec un seul moteur C21, ~0,95 extrapolé pour deux. La notice « les deux matchs historiques ont fait 25 % de plus » deviendra alors fausse. **Le résumé de `match.yml` imprime désormais les s/partie** : la relecture ne demande plus de calcul |
| <s>`mesure/d5-delta` sur le distant</s> | **FAIT le 23 sept.** — supprimée par Théo ; son code est à l'attic | <s>le jeton de session ne peut pas supprimer une référence distante</s> |
| **le déclencheur de B8** | maintenant | sa **lettre** est satisfaite (C12 clos, C18 décidé), son **esprit** non (C17, C19, C21 sont entrés depuis). Ça demande une re-spécification, pas une mesure — donc personne ne peut la calculer |
| <s>`attack_dump.rs` et `see_check.rs`</s> | **FAIT le 23 sept.** — `tools/Cargo.toml` porte `autobins = false` et les deux y sont déclarés (voir `CLAUDE.md`) | <s>autodécouverts par cargo, non déclarés</s> |
| <s>une routine hebdomadaire HORS dépôt, « ShallowRed — verdict du balayage par mutation »</s> | **FAIT le 23 sept. au soir** — supprimée, **remplacée** par `tools/balayage-vivant.sh` dans la CI | **Vérifiée avant d'être jugée, et c'était pire qu'un doublon.** Les quatre issues « mutation » viennent toutes du job `Verdict` ; aucune d'elle. Le 22 sept., seul mardi où le cliquet a cassé sur `main`, GitHub a lancé le cron de 00:00 avec **3 h 48 de retard** : la routine de 03:00 a lu l'exécution précédente et s'est tue. Elle avait pourtant **une** fonction que rien d'autre ne tenait — dire que le balayage ne tourne plus, ce que GitHub provoque sur un dépôt public après soixante jours sans activité. C'est cette fonction-là qui est entrée dans le dépôt, testée |
| **la profondeur EN PARTIE à concurrence 3 sur deux cœurs physiques** | avant de comparer un point de fonctionnement à un autre — cadence, runner, conteneur | l'étalonnage mesure un banc SEUL sur la machine ; trois moteurs sur deux cœurs physiques (SMT, mesuré le 23 sept.) cherchent moins profond. Symétrique, donc aucun verdict ne se fausse — mais « profondeur 12 à `8+0,08` » décrit le banc, pas les parties. Se mesure par la profondeur non appariée des coups d'un témoin joué à concurrence 3 contre celle de la sonde témoin, sur des runners au banc voisin |
| le plafond de mutation | mardi 00:00 UTC | le cliquet casse à la hausse tout seul — mais **un changement de TESTS le déplace autant qu'un changement de code**, et la règle écrite ne visait que le code |

### B9 — écrit et mesuré le 23 sept. 2026 — état d'AVANT la fusion, gardé pour ses chiffres

**Fusionné depuis, le soir même** : voir « B9 — VERDICT ». Ce qui suit décrit
l'état d'avant, tel qu'il était écrit.

Le code est dans `tools/attic/b9-table-atomique.patch`, avec ses chiffres. Il
n'est **pas** sur une branche : l'effet de capacité attend un SPRT, et le
déposer sur la branche rendrait la CI rouge pour un changement non accepté.

**Schéma de Hyatt** : chaque entrée tient en deux mots de 64 bits, le premier
portant `clé XOR données`. Un lecteur reconstruit la clé par un XOR ; une
entrée *déchirée* par un autre fil rend une clé qui ne correspond à rien et se
rejette comme une collision ordinaire. Pas de verrou, et la seule conséquence
d'un déchirement est un défaut de cache, jamais un score faux. Toutes les
méthodes prennent `&self`, écriture comprise — c'est ce qui rend la table
partageable.

#### 1. La réécriture est neutre — prouvé, pas supposé

À **capacité forcée égale** (524 288 entrées, celle de l'entrée de 24 octets) :

| | candidat | référence |
|---|---|---|
| banc, profondeur 7 | **114 028** | 114 028 |
| banc, profondeur 10 | **635 210** | 635 210 |

Empreintes md5 différentes, donc ce ne sont pas deux fois le même binaire —
c'est le contrôle que `sprt.sh` et `timing.sh` imposent désormais.

#### 2. Les accès atomiques ne coûtent rien — ils rapportent

`tools/timing.sh`, capacité forcée égale, profondeur 10, 20 paires :

| | candidat | référence |
|---|---|---|
| médiane | **276,5 ms** | 289,0 ms |
| minimum | 213 ms | 225 ms |

**−4,3 % sur la médiane, −5,3 % sur le min, 15 paires gagnantes sur 20, test
des signes p = 0,0192.**

**La réserve qui motivait cette mesure est réfutée, et avec le signe opposé.**
La fiche B9 disait le coût « plat » — ce qui parlait du *rétrofit* — sans que
personne ait jamais vérifié si des entrées atomiques ralentissent la recherche
**monothread**. Elles l'accélèrent.

**Le confondant a été levé — troisième coin mesuré le 23 sept. 2026.** Les
−4,3 % étaient l'effet *net* de deux choses : l'entrée passe de 24 à 16 octets
**et** les accès deviennent atomiques. `tools/attic/b9-troisieme-coin.patch`
construit la variante manquante — empaquetée, **non** atomique, capacité
forcée — et les trois binaires explorent le même arbre au bit près :

| ce qu'on isole | écart médian | paires | p |
|---|---|---|---|
| **empaquetage seul** (16 o non atomique contre 24 o) | **−4,0 %** | 33/44 | **0,0013** |
| **atomiques seules** (atomique contre empaqueté) | **−0,2 %** | 8/20 | 0,65 |
| les deux ensemble (atomique contre 24 o) | −4,3 % | 15/20 | 0,019 |

**Le gain est entièrement l'empaquetage ; les accès atomiques ne coûtent
rien** — huit paires gagnantes sur vingt est un pile ou face. *Contrôle de
cohérence interne, et il passe* : −4,0 puis −0,2 composent −4,2, contre −4,3
mesuré directement.

**Ce que ça change.** J'avais écarté ce troisième coin en disant qu'il ne
changerait aucune décision. C'était juste — on ne peut pas avoir d'entrées
atomiques de 24 octets en deux mots — mais c'est maintenant **établi au lieu
d'être affirmé**, et ça ajoute un fait utile : *les atomiques étant gratuites,
il n'y a aucune raison de préférer la version non atomique.* Elles viennent
ensemble sans surcoût.

**Et `timing.sh` a refusé sur moi.** Le premier relevé de l'empaquetage donnait
−4,8 % à 20 paires avec p = 0,1153, et le script a rendu *« aucun écart
démontré, ne pas inscrire de chiffre »*. Il en fallait 44. C'est exactement la
faute que ce script existe pour empêcher.

#### 3. L'effet de capacité est un autre changement, et le banc ne peut pas le juger

À mébioctets égaux, 16 octets par entrée **doublent** la capacité — 524 288 →
1 048 576 à 16 Mio. Le banc n'en voit presque rien :

| | atomique naturel | référence | écart |
|---|---|---|---|
| profondeur 7 | 114 026 | 114 028 | **2 nœuds** |
| profondeur 10 | 634 933 | 635 210 | **−0,04 %** |

**Parce qu'il ne SATURE pas la table** : 635 210 nœuds explorés pour 524 288
entrées, sur six positions cherchées à froid. Un effet qui ne se manifeste
qu'en partie, table chaude d'un coup à l'autre, demande un SPRT — et le nombre
de nœuds n'en donne même pas le signe.

#### Ce qui reste à faire avant de fusionner

- un **SPRT sur l'effet de capacité**, à `8+0,08`. Plausiblement un gain, la
  table doublant à mémoire constante — mais ce dépôt a démenti **trois fois**
  « c'est standard donc ça aide » ;
- corriger la **référence du banc**, qui passe de 114 028 à 114 026 :
  `bench_reference.rs` rend la CI rouge tant que `CLAUDE.md` et `README.md` ne
  sont pas à jour. C'est voulu ;
- **remesurer le plafond de mutation de `tt.rs`**, le fichier étant réécrit.


### Trois chantiers, une seule unité — mesuré le 22 sept. 2026

Le projet a longtemps comparé ses chantiers dans des unités qui ne se
comparent pas : un pourcentage de nœuds, une part de l'arbre, un « très
sous-estimé » hérité d'un backlog. **Quatre sondes, toutes rendues en moins
d'une heure de machine, les ramènent aux plis** — et le classement qui en sort
n'est celui d'aucune des listes qui l'ont précédé.

| chantier | gain de temps | **plis** | d'où vient le chiffre |
|---|---|---|---|
| génération par étapes | × 1,12 | **0,21** | mesuré, et c'est un majorant |
| **dépenser la pendule (C21)** | × 1,32 sur le **budget par coup** | **0,54 à 0,70** | mesuré — et c'est le plafond d'une allocation plate |
| Lazy SMP 4 cœurs (B6) | × 1,7 à 2,5 | 1,0 à 1,8 | **croyance héritée, non mesurée** |

Les rustines et leurs binaires de lecture sont à l'attic —
`d6-sonde-ordonnancement.patch`, `d6-sonde-pendule.patch`,
`d6-sonde-profondeur.patch`.

#### L'unité : 1,36 pli par doublement

120 positions de vraies parties, budgets de 75 à 1200 ms, étalonnage
2 535 361 n/s.

| budget | profondeur moyenne | plis / × 2 |
|---|---|---|
| 75 ms | 10,82 | — |
| 150 ms | 12,36 | 1,53 |
| 300 ms | 13,63 | 1,28 |
| 600 ms | 14,97 | 1,34 |
| 1200 ms | 16,27 | 1,30 |

Stable sur quatre doublements, donc utilisable : **1,36 pli**, facteur de
branchement effectif 1,67.

#### Ce que dépenser la pendule vaut réellement — corrigé le 22 sept. au soir

> **Ce tableau a d'abord annoncé ~1,36 pli. C'était faux d'un facteur 2,5**, et
> la faute est conceptuelle plutôt qu'arithmétique : *j'ai confondu la
> **ressource totale** consommée sur une partie avec l'**allocation par
> coup***. « 47 % de pendule inutilisée, donc × 1,9 de temps » est vrai du
> total et faux du budget — celui-ci vaut `restant / movestogo`, donc il est
> proportionnel à ce qui reste, et dépenser plus tôt laisse moins ensuite.

Balayage du diviseur sur des parties entières, `8+0,08`, 15 parties par
réglage. La sonde ne touche pas au moteur : elle calcule son budget et le passe
par `movetime`, que `time_budget_ms` honore directement — **en réimplémentant
la garde de sécurité**, que ce chemin court-circuite.

| diviseur | restant médian | pertes au temps | **budget moyen** | × | prof. 10-60 |
|---|---|---|---|---|---|
| **30** — la formule actuelle | 48,0 % | **0** | **216 ms** | 1,00 | 13,25 |
| 24 | 34,2 % | 0 | 234 ms | 1,08 | 13,75 |
| 20 | 32,1 % | 0 | 240 ms | 1,11 | 13,59 |
| 16 | 24,9 % | 0 | 274 ms | 1,27 | 13,68 |
| **12** | 14,3 % | 0 | **285 ms** | **1,32** | **13,95** |
| 10 | 14,1 % | 0 | 283 ms | 1,31 | 13,65 |

**Zéro perte au temps à tous les diviseurs**, y compris trois fois plus
agressif que l'actuel — et c'est structurel : `restant / d` est une
décroissance géométrique, elle ne peut pas atteindre zéro. *La documentation
annonçait qu'un budget doublé « épuiserait l'horloge vers le coup 48, aucune
marge » ; c'était raisonner comme si le budget était un montant fixe.*

**Et ça SATURE à `d ≈ 12`** : 285 puis 283 ms. Ce n'est pas du bruit — le
plafond d'une allocation **plate** vaut `(pendule + coups × inc) / coups`, soit
**280 ms** pour 40 coups par camp. Le balayage a atteint la limite physique du
problème. **Un diviseur est une famille à un paramètre** ; aucune valeur ne
fera mieux, et dépasser ce plafond demande une allocation *inégale* — dépenser
plus sur les positions dures — qui est un autre chantier.

Deux routes concordent sur la valeur : **+0,54 pli** par conversion du × 1,32
à travers la courbe appariée ci-dessus, et **+0,70 pli** mesuré directement sur
les demi-coups 10 à 60. Soit une vitesse équivalente de **× 1,32**, donc
**~32 Elo** par la règle du projet — au-dessus des ~17 qu'un job tranche.

> **Pourquoi la profondeur moyenne sur la partie ENTIÈRE ne répond pas.** Une
> première passe la donnait non monotone (−0,22 à +0,66 pli pour un budget
> × 3). Cause : les parties **diffèrent d'un réglage à l'autre** — plus de
> temps, d'autres coups, d'autres parties, un autre mélange de phases — et une
> finale se cherche bien plus profond qu'un milieu de partie. On comparait donc
> des ensembles de positions différents. C'est la raison de la colonne bridée
> aux demi-coups 10-60, et de la conversion par le budget, qui est la seule
> grandeur appariée.

#### Le moteur laisse la moitié de sa pendule

30 parties entières à `8+0,08`, pendule qui décroît, table conservée d'un coup
à l'autre, 2 681 coups. **Zéro perte au temps.**

| | |
|---|---|
| temps restant / temps initial en fin de partie | **médiane 46,9 %**, moyenne 50,2 % |
| coups joués par partie | médiane **97** |

`time_budget_ms` calcule `restant / movestogo + inc/2` avec **`movestogo` = 30
par défaut** : la formule suppose qu'il reste trente coups, toujours, dans des
parties qui en font quatre-vingt-dix-sept. Elle dépense un trentième du restant
à chaque coup — une décroissance géométrique qui n'épuise jamais la pendule.

> **L'arithmétique du mécanisme prédit 31 % de restant, la mesure en donne
> 47 % : le modèle SOUS-PRÉDIT.** L'écart est l'échéance douce, qui interdit
> d'entamer une itération à mi-budget — le moteur ne dépense même pas ce qu'il
> s'est alloué. Les deux effets poussent dans le même sens. *Un mécanisme
> vérifié à l'arithmétique et qui ne retombe pas sur la mesure n'est pas
> réfuté ; il est incomplet, et le résidu se nomme.*

#### Ce que les deux raffinements de B2 valent, séparément

| | `8+0,08` (2 681 coups) | `30+0,3` (621 coups) |
|---|---|---|
| la dernière itération change le coup | 7,9 % | 6,3 % |
| le score chute de plus de 100 cp | 3,0 % | 2,7 % |
| coup déjà fixé avant la dernière itération | 93,8 % | 95,2 % |

**Les intervalles se recouvrent tous** : rien ne distingue les deux cadences à
ces effectifs. Les points estimés vont dans le même sens — plus stable au long
— mais 621 coups ne le résolvent pas.

**« S'arrêter tôt sur un coup stable » est réfuté**, et il empire au régime
cible :

| N itérations d'accord | temps épargné | **coup changé** |
|---|---|---|
| 3 | 98,7 % | 24,5 % |
| 4 | 95,4 % | 17,6 % |
| 5 | 91,5 % | **13,9 %** — et **18,4 %** à `30+0,3` |

Le temps épargné n'est de surcroît pas dépensable : avec `restant/30`, une
seconde économisée ne revient qu'au trentième sur le coup suivant. **« Prolonger
sur un score qui s'effondre » survit**, sur 2,7 à 3,0 % des coups.

#### La génération par étapes, et le bon dénominateur

400 positions de vraies parties, profondeur 10. L'instrumentation ne déplace
pas l'arbre : banc à 114 028, identique à `main`.

| | negamax | quiescence |
|---|---|---|
| coups générés + scorés + triés / nœud | **26,42** | 2,86 |
| dont tranquilles | 92,2 % | 17,3 % |
| coups réellement cherchés / nœud | 3,97 | 0,99 |
| **jamais cherchés** | **85,0 %** | 65,3 % |
| nœuds coupés sur bêta | 72,2 % | 43,8 % |
| **nœuds sans AUCUN tranquille cherché** | **49,0 %** | — |

**`negamax` porte 83,8 % du travail d'ordonnancement et 94,1 % du tri**, pas la
quiescence : `tactical_only` y restreint déjà la génération par un `AND` de
bitboards. Le « 90 % des nœuds sont en quiescence » désignait la mauvaise
grandeur — quatrième forme du piège du dénominateur sur ce projet.

Le dénominateur en temps est obtenu **par doublement**, nœuds identiques au bit
près, `tools/timing.sh` à la profondeur 10, 24 paires :

| ce qu'on double | temps | paires |
|---|---|---|
| générer + scorer + trier | **+26,2 %** | 0/24 plus rapide, p = 0,0000 |
| générer + scorer seul | **+21,4 %** | 0/24 plus rapide, p = 0,0000 |
| ⇒ **trier seul** | **≈ 4,8 %** | par différence |

Les deux sont des **minorants** : la seconde passe travaille sur un cache
chaud. Plafond de ce qu'un générateur par étapes épargne : **11,5 %** du temps
— dont 8,78 en générer+scorer aux nœuds sans tranquille, 2,41 en tri, 0,33 en
sélection partielle ailleurs.

> **Une hypothèse retirée par la mesure plutôt que gardée.** L'estimation
> supposait que les nœuds sans coup tranquille génèrent autant de coups que la
> moyenne. Comptés : **28,64 par nœud contre 26,42** — l'hypothèse était
> *conservatrice*, et le plafond passe de 10,6 à 11,5 %. Elle ne changeait
> aucune décision ; elle a été retirée parce qu'un chiffre publié ne doit pas
> reposer sur une supposition qu'un compteur tranche en trente secondes.

**Et ce n'est pas une optimisation pure.** Le tri est `sort_unstable_by_key`,
donc les ex æquo sont départagés arbitrairement par pdqsort. Mesuré : passer au
tri **stable**, sans rien changer d'autre, déplace l'arbre de **114 028 à
109 342 nœuds — 4,1 %**. Un générateur par étapes émettrait dans l'ordre de
génération au sein de chaque étage, donc un troisième arbre. `timing.sh`
refuserait de conclure ; il faut un SPRT, et 0,21 pli est très loin sous ce
qu'un job tranche.

#### Ce que rien de tout cela ne donne

**Combien d'Elo vaut un pli n'est mesuré nulle part sur ce projet.** Les
conversions ci-dessus s'arrêtent aux plis, et l'étape suivante — multiplier par
une constante Elo/pli — emprunterait à une croyance héritée, ce que ce dépôt a
démenti trois fois. Le chiffre s'achèterait par un match à **profondeur fixe
`N` contre `N+1`**, qui calibrerait du même coup l'arbitrage de grande
allocation que C13 devait rendre décidable. À faible profondeur c'est bon
marché mais ça surestime ; à la profondeur 13, c'est ~33 h de runner.

### D5 a trouvé son érosion, et elle était là où le mécanisme la plaçait

<s>Ce que D5 n'a toujours pas trouvé : une érosion. Zéro sur deux en Elo.</s>
**Un sur trois, le 22 sept. 2026.** La fiche a été ouverte pour chercher des
acquis devenus caducs ; elle en a d'abord trouvé deux *sous-évalués*, puis un
troisième qui a effectivement fondu.

**L'asymétrie entre les trois est instructive, et elle est mécanique.** Les
deux acquis qui valent plus — aspiration, termes d'évaluation — ne partagent
leur territoire avec rien de ce qui est venu après. Celui qui a fondu coupe
**les mêmes objets au même endroit** qu'un mécanisme fusionné depuis :
l'élagage delta et l'échange statique écartent tous deux des captures en
quiescence. <span><strong>Inférence, confiance moyenne</strong> : le
recouvrement de territoire est le prédicteur d'érosion, pas l'ancienneté du
verdict. Trois points, dont un seul d'érosion — ce n'est pas une règle, c'est
une hypothèse qui a maintenant un cas.</span>

**Ce que ça change pour les lignes restantes de D5.** La futilité inverse et la
mobilité n'ont pas de mécanisme postérieur qui coupe où elles coupent, et leur
empreinte en nœuds ne s'est pas érodée. <span><strong>Recommandation</strong> :
ne pas acheter de job pour elles sur la seule foi de leur ancienneté. D5 a
rempli son office — elle a trouvé le seul acquis que l'empilement avait
mangé.</span>

### L'érosion se cherche d'abord en nœuds — mesuré le 22 sept. 2026

<s>Un acquis qui coupe dans le même arbre qu'un mécanisme plus récent reste le
cas où une érosion serait plausible, et il n'est pas mesuré.</s> **Il l'est
maintenant, et la paire que cette phrase nommait n'était pas la bonne.**

Un SPRT de retrait coûte un job ; l'**empreinte en nœuds** d'un acquis se
mesure en trois minutes et elle est déterministe. Elle ne dit pas l'Elo — huit
mesures l'interdisent — mais elle dit **exactement** quelle part de l'arbre
l'acquis façonne encore, donc elle dit lequel remesurer d'abord. Nœuds au banc,
base `a57c835` :

| acquis retiré | prof. 7 | prof. 10 | rapport aujourd'hui | à son verdict |
|---|---|---|---|---|
| futilité inverse | 180 642 | 1 335 143 | ÷ **1,58** | ÷ 1,45 |
| élagage delta | 138 458 | 725 621 | ÷ **1,21** | ÷ 1,68 |
| mobilité (poids nuls) | 95 841 | 550 093 | × **1,19** | × 1,29 |

*(Base : 114 028 et 635 210. Les deux premiers sont désactivés par une seule
constante — `RFP_MAX_DEPTH = -1`, `DELTA_MARGIN` porté à 10⁹ — donc le nombre
de nœuds mesure la seule décision, sans le coût.)*

**Un seul des trois s'est érodé, et ce n'est pas celui que la phrase barrée
désignait.** L'élagage delta façonne aujourd'hui **÷ 1,21** de l'arbre contre
÷ 1,68 à son verdict ; la futilité inverse, elle, en façonne **plus** qu'alors
(÷ 1,45 → ÷ 1,58, et ÷ 2,10 à la profondeur 10).

### Et la cause de l'érosion de delta est mesurée, pas supposée

Delta et C19 coupent au même endroit — des **captures**, en **quiescence**. Les
quatre coins, nœuds déterministes :

| | delta oui | delta NON | économie marginale de delta |
|---|---|---|---|
| **SEE oui** (`main`) | 114 028 | 138 458 | ÷ 1,21 |
| **SEE non** | 187 526 | 283 352 | ÷ **1,51** |

À la profondeur 10 : ÷ 1,14 avec SEE, ÷ **1,37** sans. **L'élagage par échange
statique absorbe environ la moitié de ce qui restait à delta.** Le contrôle
d'indépendance le dit autrement : si les deux mécanismes ne se touchaient pas,
retirer les deux coûterait 114 028 × 1,645 × 1,214 = **227 700** nœuds ; la
mesure rend **283 352**, soit **+24 %**. Chacun est moins utile quand l'autre
est là — c'est la signature d'un recouvrement, et elle est chiffrée.

> **Ce que ça ne dit PAS.** Ni que delta a perdu de l'Elo, ni de combien. Un
> rapport de nœuds mesure le coût, jamais la force : le projet a huit mesures
> où les deux ne se classent pas ensemble, dont deux de signes opposés. **Ce
> que ça dit, c'est où acheter le prochain match** — et c'est la première fois
> que D5 a une raison mesurée de préférer une de ses lignes à une autre, là où
> la fiche disait « il n'y a plus d'ordre imposé ».

**Budget.** 59 256 ÷ 32,5 ≈ 1 825 parties, donc un job — et c'est un
**majorant**, l'Elo mis dans la division venant d'un verdict à `1+0,01`. Seule
réserve réelle : si delta est tombé *entre* −5 et 0, aucun job ne tranchera,
puisqu'il faudrait ~11 900 parties. Les deux lignes de D5 déjà mesurées ont
tranché en 1 154 et 1 580.

### Le SPRT de retrait de l'élagage delta a EXPIRÉ — et c'est un résultat

**Lancé le 22 sept. à 10 h 15 UTC, tué par le plafond de 350 min à 16 h 06**,
[run 35714977914](https://github.com/theodubus/chess/actions/runs/35714977914).
Candidat `cbaa8d4` (appel à `delta_prunable` supprimé) contre `a57c835`,
bornes `[-5, 0]`, `8+0.08`, graine `20260913`. Étalonnage du runner :
**2 324 708 n/s, profondeur 12** en 250 ms, 4 cœurs.

| | dernier relevé, à 3 738 parties |
|---|---|
| Elo du **retrait** | **−1,49 ± 7,83** (nElo −2,12 ± 11,14) |
| IC 95 % | `[−9,3 ; +6,3]` |
| score | 49,79 % — 1299 V, 1315 D, 1124 N |
| Ptnml(0-2) | [141, 373, 851, 369, 135] |
| **LLR** | **0,06** sur ±2,94 — **2 % du chemin** |

**Pas de verdict, et il ne faut pas en fabriquer un.** Un SPRT tué par
l'horloge n'est pas un match à longueur fixe coupé au plafond : sa règle
d'arrêt dépend des données, donc l'échantillon survivant est conditionné à
« la LLR n'a jamais touché ±2,94 », ce qui écrête les trajectoires extrêmes et
biaise l'estimation **vers zéro**. Ne pas le reprendre ni le prolonger — un
test séquentiel interrompu puis repris n'a plus ses taux d'erreur.

> **Le journal s'arrête sur `Started game 3761 of 40000`, et ce nombre ne
> veut pas dire ce qu'il a l'air de dire.** `40000` est le **plafond** du
> SPRT — `match.yml` passe `-rounds 20000` à côté de `-sprt elo0 elo1
> alpha=0.05 beta=0.05`. La règle d'arrêt est la LLR qui touche ±2,94 ; le
> plafond n'existe que pour donner une borne finie à l'arbitre. Un SPRT qui
> *atteindrait* 40 000 parties serait un échec de dimensionnement, pas son
> fonctionnement normal. **« Le run n'a pas fini les 40 000 » ne porte donc
> aucune information**, ni pour ni contre.

**Ce qui est établi, et ça ne vient PAS de la relation de budget** —
<span>confiance élevée</span> : **l'élagage delta ne vaut plus rien qui
ressemble aux +32,5 Elo de son verdict d'origine.** La preuve est l'intervalle
lui-même. 3 738 parties donnent σ = 7,83 ÷ 1,96 = **3,995 Elo**, et chaque
hypothèse se place en écarts-types du point estimé :

| hypothèse sur le retrait | écart à −1,49 | en σ |
|---|---|---|
| **−32,5** — le verdict d'origine | 31,01 | **7,8** |
| −20 | 18,51 | 4,6 |
| −15 | 13,51 | 3,4 |
| −10 | 8,51 | 2,1 |
| −5 — la borne basse | 3,51 | 0,9 |
| 0 — la borne haute | 1,49 | 0,4 |

Le **biais de troncature joue contre −32,5, pas pour lui** : l'échantillon est
conditionné à « la LLR n'a jamais touché ±2,94 », ce qui écrête les
trajectoires extrêmes et tire l'estimation **vers zéro**. La vraie valeur peut
donc être plus négative que −1,5 ; elle ne peut pas être à −32,5.

> **La convention du `±` a été vérifiée, pas supposée.** Ce projet divisait le
> `± 7,83` par 1,96 en tenant pour acquis que fastchess publie un IC à 95 %,
> sans jamais l'avoir contrôlé. Recalculé le 22 sept. par une route
> indépendante — variance pentanomiale des comptes Ptnml, dérivée de la
> logistique au score observé — σ vaut **3,9934**, contre **3,9949** par la
> division. Elles s'accordent à **0,04 %**, et l'Elo reconstruit (−1,487)
> tombe sur le publié. *La convention tient ; elle ne tenait pas parce qu'on
> l'avait écrite.*

**Ce qui n'est PAS établi** — <span>la valeur réelle, son signe compris</span>.
L'intervalle `[−9,3 ; +6,3]` est plus large que la bande `[-5, 0]` elle-même :
un retrait qui coûterait −10 Elo est à 2,1 σ, donc peu probable mais pas exclu.

> **Pourquoi ce test-là n'aurait sans doute pas tranché en un job** —
> <span>inférence, confiance moyenne</span>. Des bornes `[-5, 0]` testent
> « l'effet vaut −5 » contre « l'effet vaut 0 » : **si** l'effet est tombé
> entre les deux, le test est maximalement indécis et son effectif attendu
> explose. La LLR à 0,06 après 3 738 parties est cohérente avec ce cas — mais
> elle l'est tout autant avec un effet un peu au-delà des bornes, que 3 738
> parties ne séparent pas de zéro. <s>C'est structurel, pas un manque de
> parties : l'effet est situé entre les deux.</s> **Cette phrase affirmait
> plus que l'intervalle ne porte** et elle est retirée. Ce qui est sûr : à ces
> bornes-là, le protocole n'a pas convergé en un job. Ce qui ne l'est pas :
> que la cause soit un effet strictement intérieur à la bande.

**Le contrôle de vraisemblance ne s'applique pas ici, et il faut le dire.**
`parties × Elo` vaut 5 570, très loin des 59 256 du projet — mais cette
relation ne vaut que pour un SPRT dont l'effectif est **déterminé par
l'effet**. Ici il a été déterminé par l'horloge. Lue à l'endroit, la relation
dit plutôt qu'un effet de 1,5 Elo demanderait ~40 000 parties : **c'est la
confirmation que l'effet est hors de portée de ce protocole**, pas un signe de
protocole cassé.

**L'élagage delta RESTE dans `main`.** Rien n'autorise à le retirer : H1
n'a pas été accepté, et le point estimé du retrait est négatif. Un acquis se
retire par un verdict, comme il est entré.

> **Le candidat se reconstruit sans son SHA, et c'est voulu.** `cbaa8d4` vit
> aujourd'hui sur la branche `mesure/d5-delta`, qui n'a plus de raison d'être
> et finira supprimée ; le projet a déjà payé une fois pour avoir désigné du
> code par un commit (`fatal: invalid reference: 498a01a`, 16 sept.). **La
> recette tient en une phrase** : supprimer le bloc `if self.delta_prunable(…) { continue; }` de la
> quiescence dans `engine/src/search.rs` — l'appel, pas la fonction, pour
> retirer la décision *et* son coût. **Le contrôle est le banc** : le candidat
> doit rendre exactement **138 458** nœuds à la profondeur 7 et **725 621** à
> la profondeur 10. Un chiffre différent veut dire qu'on a reconstruit autre
> chose, et c'est précisément ce que ce contrôle existe pour dire.
>
> **Et la branche n'a pas pu être supprimée depuis la session** — **vérifié le 22 sept.** : `git push origin --delete` et
> `git push origin :mesure/d5-delta` échouent tous deux sur
> `the remote end hung up unexpectedly`, sans message d'erreur utile. **Le
> jeton de session ne peut pas supprimer une référence distante**, comme il ne
> peut pas pousser d'étiquette (403, consigné le 16 sept.). C'est pourquoi les
> six branches `mesure/*` du 22 sept. ont été supprimées côté GitHub et non
> d'ici. *Le ménage des branches de mesure revient donc à Théo ; la
> documentation ne doit jamais annoncer une suppression qu'elle n'a pas
> vérifiée.*

### Ce que l'écran en nœuds avait annoncé — un point, pas une règle

L'empreinte en nœuds avait désigné delta comme la seule des trois lignes de D5
à s'être érodée (÷ 1,68 → ÷ 1,21), et les quatre coins imputaient la moitié de
l'écart à l'échange statique. **Le match va dans le même sens** : +32,5 à
`1+0,01` contre un effet indistinguable de zéro à `8+0,08`.

<span><strong>Inférence, confiance faible — UN point.</strong> C'est la
première fois que l'écran en nœuds fait une prédiction qu'un match corrobore
ensuite, et une corroboration n'est pas une validation. Le projet a huit
mesures qui disent que nœuds et Elo ne se classent pas ensemble ; rien ici ne
les contredit — l'écran n'a pas prédit une VALEUR, il a désigné une CIBLE, et
c'est tout ce qu'on peut lui demander. Deux points de plus diraient s'il faut
s'en servir systématiquement avant d'acheter un job.</span>

**Une limite propre à la ligne « mobilité », à connaître avant de l'acheter.**
Son retrait exact n'est plus disponible. Quand la mobilité a été mesurée le
14 sept., elle apportait *avec elle* toute la boucle d'attaques de `activity` ;
cette boucle sert désormais aussi au terme de danger du roi, donc la retirer
laisserait son coût en place. Le candidat ne peut retirer que la décision, pas
le coût — l'inverse exact de ce qu'exigeait le candidat des trois termes.

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
| **élagage par compte de coups (LMP), seuil 6, à `8+0,08`** | **÷ 1,30** | **+23** |
| **les trois termes d'évaluation, remesurés à `8+0,08`** | **× 1,29** | **+38** |

**Les fenêtres d'aspiration remesurées** sont le point le plus extrême du
tableau : **la plus petite économie de nœuds, et presque le plus gros gain
d'Elo**. Vérifié par exécution le 16 sept. — 234 370 nœuds à la profondeur 7
sans aspiration contre 223 577 avec. Et c'est la même technique que sa propre
ligne à `1+0,01` : ÷ 1,07 → +30. **Le rapport de nœuds n'a pas bougé ; l'Elo a
été multiplié par 1,7.** *(Ces deux nombres datent d'avant C19 : la référence
du bench vaut 148 786 nœuds depuis. Un rapport de nœuds se lit entre les deux
binaires d'une même mesure, jamais contre le chiffre courant.)*

> *Ce paragraphe disait « la dernière ligne » et désignait déjà la mauvaise :
> deux mesures avaient été ajoutées sous elle sans que personne ne relise. **Un
> renvoi par position vieillit exactement comme un chiffre recopié en prose**,
> et sans faire de bruit. Nommer la ligne, jamais la compter.*

**Et la ligne ajoutée le 22 sept. enfonce le clou par une coïncidence.** Les
trois termes d'évaluation multiplient l'arbre par **1,29** — exactement le
rapport de la mobilité — et rapportent **+38** là où la mobilité rapporte
**+63**. Même coût en nœuds, presque du simple au double en Elo. *(Les deux
rapports sont lus chacun entre les deux binaires de sa propre mesure : 114 028
contre 88 495 nœuds pour les trois termes. Ils ne se comparent pas en valeur
absolue, seulement en rapport.)*

### La relation de budget, sur dix-huit points

Elle sert à décider **si un changement vaut un match**, donc elle vaut d'être
tenue à jour. `parties × Elo` sur tous les SPRT du projet, du plus petit au plus
grand — les matchs à longueur fixe en sont exclus, leur effectif étant choisi et
non atteint. La cadence est notée quand elle n'est pas `1+0,01` :

| | `parties × Elo` | | `parties × Elo` |
|---|---|---|---|
| PVS | 45 933 | trois termes, retrait `8+0,08` | 59 297 |
| LMP seuil 12 | 49 543 | retrait aspiration `8+0,08` | 59 500 |
| LMP seuil 6 | 51 156 | aspiration | 60 647 |
| réglage Texel | 51 280 | futilité inverse | 61 333 |
| C19 `8+0,08` | 54 013 | LMR | 61 637 |
| C17 seuil 6 `8+0,08` | 55 663 | retrait aspiration `1+0,01` | 61 911 |
| C17 seuil 12 `8+0,08` | 58 064 | coup nul | 64 886 |
| mobilité | 58 969 | trois termes | 66 663 |
| élagage delta | 59 215 | **table + killers + historique** | **80 178** |

**Médiane 59 256, moyenne 58 883, étendue 45 933 – 80 178 — facteur 1,75.** La
constante ne bouge pas : 62 000 sur quatre points, 59 500 sur quinze, 59 256 sur
dix-huit. **La dispersion non plus** — un budget estimé se lit à ± 50 %, pas
comme un nombre.

Un seul point dépasse 67 000, et c'est le **tout premier verdict du projet** :
+164,3 Elo sur 488 parties. Hors ce point, le facteur tombe à **1,45**.
<span><strong>Inférence, confiance moyenne</strong> : le biais d'arrêt du SPRT
gonfle l'estimation d'autant plus que l'effectif est petit, et c'est à la fois
le plus gros effet et le plus petit effectif du tableau. Le projet a mesuré ce
biais à 3,6 Elo sur un cas à 1000 parties ; il n'a pas été mesuré à 488.</span>

**Les trois points ajoutés le 22 sept. n'étaient pas un ajout de routine.** Les
deux verdicts C17 à `8+0,08` manquaient purement par ordre chronologique — le
tableau a été écrit le 21 sept. au matin, ils sont tombés l'après-midi. Le
troisième, D5, ferme une question que le tableau ne pouvait pas poser à quinze
points : **la constante dépend-elle de la cadence ?**

| technique | `parties × Elo` à `1+0,01` | à `8+0,08` | rapport |
|---|---|---|---|
| retrait des fenêtres d'aspiration | 61 911 | 59 500 | 1,04 |
| élagage par compte, seuil 6 | 51 156 | 55 663 | 0,92 |
| élagage par compte, seuil 12 | 49 543 | 58 064 | 0,85 |
| retrait des trois termes d'éval | 66 663 | 59 297 | 1,12 |

**Non.** Quatre techniques ont maintenant un point à chaque cadence, et les
quatre rapports tiennent dans ± 15 % — bien à l'intérieur du facteur 1,75 de la
dispersion générale — alors que **l'Elo, lui, a changé d'un facteur 2,5 et même
de signe** entre les deux colonnes. Le nombre de parties s'ajuste à l'inverse,
et le produit tient.

> **La constante appartient au SPRT, pas à la cadence.** C'est ce qui rend la
> division utilisable pour dimensionner un job à `8+0,08` — à condition d'y
> mettre l'Elo de CETTE cadence-là, qui est justement ce qu'on ne connaît pas
> encore. D'où la règle de la section *Ce qu'un seul job peut trancher* : un
> budget estimé depuis un verdict court est un majorant.

<span><strong>Réserve</strong> : les paires ne sont pas parfaitement appariées.
Les deux verdicts C17 à `8+0,08` sont mesurés sur la base post-C19, et le
retrait des trois termes sur une base beaucoup plus riche que son verdict
d'origine. Seul le retrait d'aspiration est un vrai contrôle apparié — et c'est
le rapport le plus proche de 1.</span>

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

### C17 : LMP paie à la cadence qui tranche, et il avait été rejeté deux fois

Le même élagage, les mêmes deux seuils, deux cadences :

| seuil | `1+0,01` | `8+0,08`, base post-C19 |
|---|---|---|
| `6 + d²` | −25,20 ± 11,60 — **H0** | **+22,85 ± 9,88 — H1**, 2436 parties |
| `12 + d²` | −12,55 ± 8,70 — **H0** | **+17,24 ± 8,51 — H1**, 3368 parties |

**Ce qui est établi : LMP passe de rejeté deux fois à accepté deux fois.** Aux
deux seuils, les intervalles excluent zéro confortablement. Contrôle de
vraisemblance : `parties × Elo` vaut 55 663 et 58 064, contre une médiane de
projet à 59 256 — les deux tombent dessus, et ils y figurent depuis le
22 sept. : le tableau de budget les avait manqués de deux heures.

**Ce qui n'est PAS établi : que le classement des deux seuils s'inverse.** Les
estimations ponctuelles le disent — 12 meilleur à `1+0,01`, 6 meilleur à
`8+0,08` — mais **aucune des deux différences n'est résolue** : écart 12,60,
z = 1,70, p = 0,089 à `1+0,01` ; écart 5,61, z = 0,84, **p = 0,399** à
`8+0,08`. Quatre points qui dessinent un motif monotone ne sont pas quatre
points significatifs.

**Le seuil 6 est retenu sur son estimation ponctuelle**, faute de mieux, et le
mécanisme va dans le même sens — <span>inférence, confiance moyenne</span> : le
coût suit le risque détruit (3,8 % contre 2,0 %) et le bénéfice suit l'économie
de nœuds (100 % contre 94 %). Quand la profondeur monte, l'économie pèse plus
lourd que le risque, donc le seuil agressif gagne. **Ce qui trancherait
vraiment** : la paire remesurée à `30+0,3`, ou des matchs à longueur fixe mis
en commun — un écart de 5,6 Elo demande ~10 600 parties.

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
par compte ».

> <s>**Il n'y a pas de seuil qui paie sur ce moteur.**</s> **RÉFUTÉ le
> 21 sept. 2026.** À `8+0,08`, sur la base post-C19, les **deux** seuils sont
> H1 : +22,85 et +17,24. Tout ce qui précède reste exact — à `1+0,01`, et
> seulement là. La phrase barrée, elle, n'avait pas de cadence : elle
> généralisait deux points d'un même régime à « ce moteur » tout entier, et
> c'est exactement ce que D1 interdit. **Une conclusion sans cadence est une
> conclusion fausse en attente de l'être.**

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
