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

Six binaires, tous hors ligne : aucun n'est appelé par le moteur, et aucun ne
change sa force. Ils sont nommés ici **avec leur extension**, parce que c'est
ce que `engine/tests/outillage_documente.rs` confronte au répertoire.

| binaire | ce qu'il fait |
|---|---|
| `bookgen.rs` | génère le livre d'ouvertures EPD, de façon reproductible. Sans livre, le moteur étant déterministe, toutes les parties d'un match sont la même partie |
| `datagen.rs` | produit le corpus `FEN;résultat` de l'ajustement Texel, étiqueté par le **résultat de la partie** et jamais par le score de l'évaluation. Sert aussi à tirer des positions de vraies parties pour toute sonde |
| `tune.rs` | l'ajustement Texel lui-même. Son verdict a été **rejeté** (−9,96 Elo) ; l'outil reste parce qu'il resservira avec un corpus plus grand |
| `nnue_probe.rs` | le benchmark obligatoire de B4 : ce que coûtent le copy-make (7,2 %) et la dérivation du delta d'accumulateur NNUE (2,8 %) en part du temps d'un nœud |
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

### EN VOL au 23 sept. 2026, 05 h 30 UTC — C21 en longueur fixe, deux jobs

| run | graine | parties |
|---|---|---|
| [35822658045](https://github.com/theodubus/chess/actions/runs/35822658045) | `20260923` | 3000 |
| [35822663218](https://github.com/theodubus/chess/actions/runs/35822663218) | `20260924` | 3000 |

Mêmes binaires, même cadence `8+0,08`. Mis en commun : ~6000 parties, donc
un intervalle attendu autour de **± 6,1 Elo** — assez pour séparer l'effet de
la borne haute de 5.

**Les deux graines DIFFÈRENT, et c'est une condition de validité, pas un
détail.** Le moteur est déterministe : mêmes binaires + même graine = **les
mêmes parties, coup pour coup**. Rejouer avec `20260913` n'aurait rien apporté
qu'une copie du run expiré, et donner la même graine aux deux jobs aurait
produit deux copies l'une de l'autre. *Une graine partagée entre deux matchs
qu'on veut mettre en commun détruit exactement ce qu'on cherchait à gagner.*

**Deux matchs en parallèle sont permis ici** : ils tournent sur des runners
GitHub distincts, donc sans vol de CPU. La règle n'interdit la concurrence que
sur une même machine.

#### Au verdict

- lire l'**étalonnage** de chaque job avant de mettre en commun — deux runners
  peuvent différer de 58 % ;
- le **contrôle des pertes au temps** passe avant l'Elo ;
- inscrire le résultat avec **sa cadence et son effectif**, ici et dans la
  fiche C21 du carnet ;
- si l'effet tient : PR depuis `claude/project-documentation-review-denp0n`,
  fusion en `merge`, jamais `squash` ;
- **au moment de la fusion**, reprendre la notice de durée de `match.yml` : son
  facteur 0,77 *est* le gaspillage de pendule, donc C21 le fait dériver vers 1.


### Ce qui reste à faire, par ordre mesuré

| chantier | plis | état |
|---|---|---|
| **C21 — dépenser la pendule** | 0,54 à 0,70 | **écrit, en mesure** |
| génération par étapes | 0,21 | non entamée, ~1,5 job à mettre en commun, **pas** une optimisation pure |
| **B9 — table à entrées atomiques** | — | prérequis dur de B6, **non entamé**. Réserve toujours non mesurée : sa fiche dit le coût « plat », ce qui parle du **rétrofit** et non de la vitesse. Voir l'encadré ci-dessous : <s>se mesure par nœuds identiques + `timing.sh`</s> — **faux, et mesuré le 22 sept. au soir** |
| B6 — Lazy SMP | 1,0 à 1,8 | **seul chiffre encore hérité** du tableau. Le mesurer exige B9 |
| B7 / C13 | — | inchangés, bloqués sur leurs déclencheurs |

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
`rustines_attic.rs`, le banc à la profondeur 5 ou le plafond calculé de
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

### Ce qu'il faut surveiller — et que rien ne signalera tout seul

Un garde-fou attrape ce qui casse. Ces points-ci ne cassent rien : ils
**vieillissent**, et c'est pourquoi ils sont écrits plutôt que gardés.

| quoi | quand ça devient actionnable | pourquoi aucun test ne le dira |
|---|---|---|
| **l'estimation de durée de `match.yml`** | **le jour où C21 fusionne** | le facteur 0,77 mesuré **EST** le gaspillage de pendule : un moteur qui laisse 48 % de son horloge finit ses parties plus vite que la cadence nominale. C21 corrige exactement ça, donc le facteur dérive vers 1 et la notice se met à mentir dans l'autre sens |
| `mesure/d5-delta` sur le distant | quand Théo veut | le jeton de session **ne peut pas supprimer une référence distante** (vérifié : `the remote end hung up unexpectedly`). Cinq des six branches `mesure/*` ont disparu, celle-là reste |
| **le déclencheur de B8** | maintenant | sa **lettre** est satisfaite (C12 clos, C18 décidé), son **esprit** non (C17, C19, C21 sont entrés depuis). Ça demande une re-spécification, pas une mesure — donc personne ne peut la calculer |
| `attack_dump.rs` et `see_check.rs` | au prochain dépôt dans `tools/src/bin/` | **autodécouverts par cargo**, non déclarés dans `tools/Cargo.toml`. `outillage_documente.rs` exige qu'ils soient documentés, pas qu'ils soient déclarés |
| le plafond de mutation | mardi 00:00 UTC | le cliquet casse à la hausse tout seul — mais **un changement de TESTS le déplace autant qu'un changement de code**, et la règle écrite ne visait que le code |

### B9 — l'état exact, pour reprendre sans redécouvrir

Le protocole est corrigé (encadré ci-dessus) et l'encodage fixé par la mesure.
**Rien du code n'est écrit.** Ce qui reste, dans l'ordre :

1. **Réécrire `tt.rs`** en deux `AtomicU64` par entrée, schéma XOR de Hyatt.
   Surface vérifiée : `probe` et `store` n'ont **qu'un site d'appel chacun**
   dans `search.rs` (lignes ~770 et ~971), plus `clear`, `new_search`,
   `capacity`, `permille_used`. Les signatures passent de `&mut self` à
   `&self` ; `generation` devient un `AtomicU8`.
2. **Protéger l'encodage** par un `debug_assert!` sur les bornes du score plus
   une borne en release — *une donnée fausse se borne, elle n'arrête pas la
   partie*. L'absence de déclenchement mesurée n'est qu'un échantillon.
3. **Mesurer le coût des atomiques à capacité FORCÉE égale** : une rustine de
   mesure qui fige le nombre d'entrées à celui d'aujourd'hui, pour que les
   nœuds soient identiques au bit près et que `timing.sh` s'applique.
4. **Mesurer séparément l'entrée deux fois plus petite** — changement d'arbre,
   donc SPRT, et plausiblement un gain puisqu'il double la table à mémoire
   constante.

**Ne pas confondre 3 et 4**, c'est tout l'objet de la correction du protocole.
Et B9 ne débloque B6 qu'une fois 3 et 4 rendus : sa fiche dit que le coût de
le différer est « plat », ce qui parle du **rétrofit** et ne dit rien de la
vitesse.

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
