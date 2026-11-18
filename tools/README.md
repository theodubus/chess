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
lisible dans l'onglet Actions sans ouvrir le journal. **Le nom de chaque run
porte ses entrées** depuis le 30 sept. 2026 : l'API ne les rend pas, et deux
runs déclenchés ensemble ne se distinguaient qu'une fois finis.

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

### Une cadence par moteur, et la sonde

Deux entrées de `match.yml`, pour les matchs à handicap de temps et les
sondes de profondeur.

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

`tools/plis.sh <journal>` rend les plis réellement gagnés par partie,
appariés, sur la sortie de cutechess `-debug all` : le rapport des n/s des
seuls coups partis d'un `go`, et un intervalle de Student plutôt que 1,96,
juste à vingt parties. `tools/plis-test.sh` l'éprouve dans `verify.sh` :
un témoin fabriqué qui doit rendre zéro, le ponder jeté qui ne doit pas
compter, les refus.

## Situer le moteur — `force.yml` et `classes.yml`

Tous les verdicts du dépôt sont relatifs, mesurés contre notre jumeau ;
ces deux workflows placent le moteur sur une échelle extérieure. La
procédure d'une série — l'attendu, le lancement, la relève, l'inscription
— est le skill `situer-le-moteur` ; la force relevée, F-0011 ; ce que
l'échelle fait d'un écart, F-0012. Le protocole d'origine et chaque
série, de l'évaluation faite main à la phase 4, sont au journal (C13,
J-2026-11-18-AE).

**`.github/workflows/force.yml`** joue le moteur d'un commit contre
Stockfish 16 bridé (`UCI_LimitStrength`, `UCI_Elo`) :
- **son échelle se lit au source** de Stockfish 16 (`src/search.cpp`, tag
  `sf_16`) : `UCI_Elo` de 1320 à 3190, ancré à l'Elo CCRL et ajusté sur
  des matchs à 60+0,6, d'où la cadence par défaut. L'image `ubuntu-24.04`
  et le paquet `16-*` sont épinglés, et un autre Stockfish fait refuser
  le job ;
- **bridé, Stockfish ne cherche pas moins** : il force MultiPV à 4 et
  joue par moments un coup sous-optimal, tiré par une graine prise à
  l'horloge. La graine de la série fixe les ouvertures, pas ces tirages :
  une série ne se rejoue pas coup pour coup, et son chiffre est une
  estimation, jamais un classement ;
- **trois parties à la fois**, 300 par défaut, qui tiennent à 60+0,6 sous
  le plafond de 350 minutes ; le runner s'étalonne en tête du résumé,
  comme dans `match.yml` ;
- **ses avertissements** : les milliers de « Bestmove does not match
  beginning of last PV » viennent du bridage de Stockfish, et le résumé
  les sépare de ceux de ShallowRed ;
- **le journal entier et l'artefact `force-log`** sont servis par un hôte
  que le proxy du conteneur refuse (`blob.core.windows.net`) : depuis une
  session, seule la fin du journal se lit.

**`.github/workflows/classes.yml`** en est la suite depuis le 9 nov. 2026 :
le moteur d'un commit contre un moteur classé par la CCRL, qui joue sans
bridage. Son en-tête dit le détail ; l'essentiel :
- **la liste 40/15 de la CCRL, à 1 CPU, et sa cadence** : 40 coups en
  15 minutes sur un i7-4770k, recalés sur le runner au banc de
  Stockfish 10, lancé autant de fois à la fois que de parties. Le banc doit
  rendre 3 939 338 nœuds, la signature de la version ; le temps de
  référence du i7-4770k, 2 054 ms, vient d'une source secondaire, deux fils
  de TalkChess écrits par des testeurs de la CCRL (confiance moyenne) ;
- **quatre adversaires**, Demolito, Simbelmyne, Cadie et Mr Bob, chacun
  construit au tag que la CCRL a noté, le SHA du tag vérifié. Simbelmyne
  se construit au Rust 1.80.0 de sa sortie et Mr Bob avec `<cstring>`
  pré-inclus, sans toucher à leur recette. Les autres moteurs de la même
  plage n'ont pas de tag (Svart), pas de dépôt public (DanaSah, Dark Toga),
  ou ne se construisent que sous Visual Studio (Publius) ou par Nim
  (Nalwald) ;
- **les conditions de la liste** : ponder coupé, un fil, table de 256 Mo,
  une partie par cœur physique, le livre du dépôt ;
- **l'estimation** : la note de l'adversaire plus l'écart du match, la
  marge composant les deux. Une autre cadence que `ccrl-40/15` éprouve la
  chaîne en quelques minutes, sans chiffre lisible sur la liste.

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
| `nnue_datagen.rs` | les données d'entraînement NNUE (A21) : parties d'auto-jeu à nœuds fixes, au format `viriformat` que lit bullet, **écrit par la crate de référence** et jamais réimplémenté. Lancé sur runner par `.github/workflows/nnue-datagen.yml`, un artefact par job. **Étiquette par le réseau embarqué depuis le 29 sept.** (`--eval`, n° 7) ; `--eval '<none>'` regénère les données d'A21 |
| `nnue_validation.rs` | la perte de l'entraîneur sur des positions qu'il n'a PAS apprises (n° 18) — bullet `10e7e82` n'a pas de jeu de validation, lu au source. Les positions et les étiquettes de l'entraîneur, dépliées par `viriformat` sous son filtre par défaut ; chaque réseau QUANTIFIÉ évalué par le code du moteur ; la position confrontée pièce à pièce à son étiquette avant d'être comptée ; intervalle par partie, écarts appariés. Lancé sur runner par `.github/workflows/nnue-validation.yml`, qui télécharge les artefacts de `nnue-datagen.yml`. **Un diagnostic — apprendre ou retenir —, jamais une mesure de force** |
| `spsa.rs` | le pilote du réglage automatique (n° 19) : l'arithmétique de SPSA par manches — l'état (valeurs, plages, paires jouées), le tirage des perturbations d'un job, la lecture du résultat de fastchess, la mise à jour. Ne joue aucune partie : `.github/workflows/spsa.yml` construit les deux camps par les variables `SR_*` que lisent les `reglage!` de `engine/src/search.rs`, fait jouer fastchess, agrège et enchaîne les manches. Ses tests portent une **vérité terrain** — sur des parties simulées autour d'un optimum connu, SPSA doit s'en rapprocher, et ne s'en rapproche pas quand le signal est nul. L'état de la première passe : `tools/spsa/n19.txt` |
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

## Pondérer, et lire le dialogue d'un match

**Ce que savent les deux arbitres**, lu dans leur source aux commits
épinglés, le 23 sept. 2026 :

|  | ponder | `tc=` par moteur | dialogue UCI journalisé |
|---|---|---|---|
| fastchess `60d7a7a` | **non** : le mot n'apparaît nulle part dans son dépôt | oui | oui, `-log file=… engine=true` |
| cutechess-cli `5e84232` | **oui**, `-engine … ponder` | oui | oui, `-debug`, et `stderr=` par moteur |

Dans les deux, un `tc=` passé dans `-each` écrase celui de chaque moteur,
quel que soit l'ordre de la ligne de commande : un match à handicap de
temps y redevient symétrique sans le dire (« Une cadence par moteur, et
la sonde »).

**Mesurer le ponder** passe par l'entrée `ponder` de `match.yml` — `non`,
`candidat` ou `les-deux` —, qui fait jouer cutechess. Avec `candidat`, le
même commit des deux côtés mesure le ponder seul, pourvu que ce binaire,
`Ponder` éteint, rende le banc de `main`. Le workflow s'occupe du reste :
- **la concurrence** se déduit des cœurs qu'occupe une partie (« La
  concurrence d'un match… ») : un camp qui pondère en occupe deux, et le
  job refuse quand l'inégalité ne tient pas. Joué à plusieurs parties, le
  ponder volerait du CPU à l'adversaire du candidat, dans le sens de
  l'hypothèse ;
- **la graine**, que cutechess tient sur 32 bits (`-srand`) quand un
  numéro de run en fait 35 : il la réduirait modulo 2³² sans le dire, et
  le workflow la réduit lui-même, pour que la graine imprimée soit celle
  qui a joué ;
- **les pertes au temps de cutechess**, dont trois sont des nulles — par
  temps, par déconnexion ou par blocage, quand l'adversaire ne peut plus
  mater — que le motif de fastchess laisserait passer ;
- **pas de SPRT sous cutechess**, dont le test n'a pas le modèle de celui
  de fastchess : la mesure passe par plusieurs jobs à longueur fixe ;
- **le vecteur pentanomial**, que cutechess n'imprime pas : reconstruit
  par `tools/paires.sh`, écrit au format de fastchess dans le résumé.

Une limite reste, en faveur du candidat : même sans vol de cœur, deux
moteurs actifs à la fois se partagent le cache et la mémoire, ce qu'un
adversaire sur une autre machine n'imposerait pas.

**`tools/paires.sh <journal> [candidat]`** rebâtit les paires depuis les
lignes `Finished game N (…)` des deux arbitres : avec `-repeat` et
`-games 2`, les parties `2k−1` et `2k` en forment une. Sa sortie se passe
telle quelle à `tools/mettre-en-commun.sh`, et sur un vrai journal
fastchess de 80 parties elle retombe exactement sur le vecteur de
fastchess. `tools/paires-test.sh` l'éprouve dans `tools/verify.sh`, refus
compris : une partie sans sa jumelle est écartée et signalée, jamais
comptée à moitié.

**`tools/lire-journal.sh <journal>`** lit un journal de fastchess produit
par `-log file=<journal> level=trace engine=true`, sans toucher au
moteur. Il rend le taux de succès du ponder — le deuxième coup de notre
variante contre la réponse jouée, sur TOUS les coups — et l'écart entre
les deux pendules **séparé par couleur** : quand les noirs ont le trait,
les blancs ont joué un coup de plus, et l'écart signé qui en sort est un
artefact de comptage. Il ne lit pas le format de cutechess, dont le taux
se relit au dialogue `-debug`.

## Les binaires livrés — `tools/binaires.sh`

```sh
tools/binaires.sh [dossier]          # défaut : dist/
tools/binaires.sh --comparer <a> <b>
tools/binaires.sh --empreinte <binaire>
```

Construit `shallowred` (`x86-64`, le jeu de base) et `shallowred-avx2`
(`x86-64-v3`) — la décision de Théo du 6 oct. 2026, n° 10 — sur un
processeur x86-64 : Linux, Windows sous Git Bash (`.exe`), Mac Intel ; sur un
processeur ARM 64 bits, Mac Apple Silicon ou Linux ARM, le seul binaire natif
— Théo, 7 oct. 2026 : « *tu peux faire pour windows et macOS* ». **Deux
binaires du même code ne sont le même moteur que s'ils cherchent le même
arbre** : le code est entier, donc ils le cherchent aujourd'hui, mais un
calcul flottant entré demain dans la recherche laisserait au compilateur le
droit d'en faire deux moteurs sous un même nom, et aucun match ne le verrait
— les matchs jouent le binaire AVX2 des deux côtés. Le script compare donc,
avant de rendre les binaires, le banc fait main à la profondeur 7 **et** les
six positions du banc cherchées avec le réseau qui joue, nœuds et coup : le
banc seul ne verrait rien, puisque l'AVX2 change surtout les boucles du
réseau. Le binaire AVX2 n'est comparé que sur un processeur qui l'a :
`/proc/cpuinfo` sous Linux et Git Bash, `sysctl` sur Mac Intel.

**Le même raisonnement d'un système à l'autre** : le script écrit
l'empreinte du binaire de base dans `empreinte.txt`, et la CI, qui construit
sur Linux, Windows, Mac Intel et Mac Apple Silicon à chaque PR et sur `main`,
exige la même empreinte sur les quatre (job « Le même arbre sur chaque
système »). Un binaire qui chercherait un autre arbre sous Windows serait un
autre moteur sous le même nom, et les matchs, qui ne jouent que sous Linux,
ne le verraient pas. Sur `main`, les binaires des quatre systèmes partent en
artefact — en archive tar hors Windows, qui garde le droit d'exécution.
**Éprouvé dès la première exécution, le 7 oct.** (run 37584441814) : le banc
à 90 646 et les six positions au réseau, nœuds et coup, identiques sous Linux,
Windows, Mac Intel et Apple Silicon ; l'AVX2 lue par `/proc/cpuinfo` sous Git
Bash et par `sysctl` sur Mac Intel, et comparée sur les deux.

Sa branche précieuse, le refus, est éprouvée par `tools/binaires-test.sh` sur
des moteurs fabriqués — dans `verify.sh` et la CI ; une faute injectée — la
comparaison réduite au banc — y fait tomber trois cas sur sept, l'empreinte
comprise.

## Le livre d'ouvertures

`book.epd` — **15 000 positions depuis le 6 oct. 2026** (n° 11, décidé par
Théo le même jour), 8 demi-coups, écart d'évaluation ≤ 80 centièmes de pion
au filtre de l'évaluation faite main. Régénérable au code de `ab44f2a` :

```sh
cargo run --release --bin bookgen -- 15000 8 80 > tools/book.epd
```

**Pourquoi 15 000.** À 500, un match de 3 000 parties jouait chaque ouverture
trois fois, et tous les matchs les mêmes : les paires d'une même ouverture
sont corrélées (ρ ≈ 0,03, « Le livre, réutilisé »), et la variance d'une mise
en commun valait × 1,33 à quatre jobs, × 6,4 à soixante. À 15 000, un job en
tire 1 500 distinctes, deux jobs n'en partagent que 150 en moyenne, et la
variance reste sous ~× 1,15 jusqu'à soixante jobs — la condition de « plus de
runners ».

**« Même graine, même livre » ne tient qu'à évaluation égale** — vérifié le
6 oct. 2026 : le livre de 500 positions du 13 sept. n'est plus reproductible,
`bookgen 500 8 80` n'en retrouve que 439 sur 500, parce que l'évaluation faite
main qui filtre a changé depuis. Il se régénère au code de `4695941`. Un livre
se cite donc avec le commit qui l'a tiré, pas seulement avec sa graine.

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

## Générer les données NNUE — `nnue-datagen.yml`

`tools/src/bin/nnue_datagen.rs` joue des parties du moteur contre
lui-même, un fichier par fil, et `.github/workflows/nnue-datagen.yml` le
lance sur un runner, un artefact par job. Ses entrées et leurs défauts se
lisent dans le workflow ; ce qui suit est ce qu'aucune entrée ne dit.

- **Le format est celui de Viridithas, `viriformat`**, écrit par sa crate
  et jamais réimplémenté : ~4,3 octets par position. Le score s'y écrit du
  point de vue des Blancs, quand la recherche le rend du point de vue du
  trait ; le roque, la prise en passant et la promotion portent des
  drapeaux que les deux cases ne donnent pas. **Le filtre se fait au
  chargement**, pas à l'écriture — positions en échec, coups tactiques,
  premiers demi-coups —, si bien qu'un autre filtre ne demande pas de
  regénérer. `viriformat` compte le demi-coup par le numéro de coup que
  pose la FEN de chaque partie, enregistrée APRÈS ses coups tirés au
  hasard : son filtre par défaut, rien avant le seizième, retire donc les
  demi-coups 8 à 15 réellement joués (F-0009, « filtre des positions »).
- **Une partie est une fonction pure** de la graine, de son numéro, du
  budget de nœuds et de l'évaluation qui étiquette, au commit donné :
  table vidée à chaque partie, un fil par recherche. Un job joue les
  numéros 0 à K − 1, K = parties + écartées, lus dans son résumé ;
  `--games K` avec la même graine rend les mêmes parties, et le binaire
  AVX2 écrit exactement les mêmes que le binaire de base, à l'octet.
- **L'ouverture** tire 8 à 11 demi-coups au hasard, et une partie dont le
  premier score dépasse `OPENING_MAX_SCORE` s'écarte ; **l'adjudication**
  donne le gain à `WIN_ADJ_SCORE` tenu huit demi-coups, la nulle à
  `MAX_GAME_PLIES`, jamais avant. Ces seuils sont en unités de
  l'évaluation qui étiquette, et changent de sens avec elle (F-0009).
- **Un job s'arrête de lui-même** avant le plafond de six heures : aucune
  partie n'est entamée après l'échéance, et le fichier est vidé avec
  contrôle d'erreur. Un job perdu ne perd que sa part.
- **Son résumé compte à part** les parties gardées (`parties`) et celles
  que le seuil d'ouverture écarte (`ecartees`) : un taux d'écartées se lit
  sur les gardées. Il dit aussi le commit et le budget de nœuds, et les
  positions que le filtre par défaut de l'entraîneur garde
  (`retenues_filtre_defaut`), le volume qui compte pour les passes.
- **Le débit appartient à l'hôte du runner** : il se prévoit par la vague
  précédente sur le même modèle de processeur, à un quart ou un tiers
  près — un même nom couvre des hôtes différents —, jamais par le
  conteneur. À nœuds fixés, il ne change que le volume, pas les parties.
- **Les artefacts ne se lisent pas depuis une session** — le proxy refuse
  l'hôte où GitHub les dépose — ; ils se relisent sur la machine
  d'entraînement, dont la relecture confronte les comptes aux résumés. Ils
  expirent au bout de 90 jours (F-0005). Depuis le n° 18, chaque job d'une
  génération a sa ligne dans `tools/<génération>-jobs.tsv`, son rôle
  compris : `tenu`, le premier job lancé, que l'entraînement ne voit
  jamais et que `nnue-validation.yml` relit, ou `appris` ; les
  générations d'avant, et de quoi les regénérer, sont dans B-0026.

Une génération se mène par vagues, selon le skill `lancer-une-generation`.

## Entraîner un réseau — `tools/nnue-train`

`tools/nnue-train` est une crate à part, avec son propre espace de
travail : bullet y est épinglé au commit `10e7e82`, et l'architecture
vient des constantes de `engine/src/nnue.rs`. Elle n'entraîne que sur GPU,
sur la carte de Théo ; la CI la compile sans GPU, contre le runtime
factice de bullet (`.github/workflows/nnue-train.yml`). Ses options se
lisent dans `tools/nnue-train/src/main.rs`.

**Trois temps, chacun bloquant** — un `ÉCHEC — …` arrête tout, et son
message suffit au diagnostic :
1. **relire** chaque fichier jusqu'au dernier octet et confronter les
   comptes aux résumés des jobs (`--attendu parties:positions`) ; un
   binpack se relit bloc par bloc, et un fichier tronqué se refuse ;
2. **entraîner** ;
3. **confronter** le réseau quantifié, rechargé par le moteur, à
   l'entraîneur (`CLAUDE.md`, « ce réseau est celui qu'a entraîné
   bullet ») ; la fin heureuse est `RÉSEAU PRÊT : <chemin>`.

**Les données** : des `.vf` posés directement dans les dossiers donnés au
programme, pas dans un sous-dossier ; ou un `.binpack` de Stockfish, lu par
le chargeur de bullet. Les deux formats n'ont pas la même échelle de scores
et ne se mêlent que sur demande, par `--melange PART` : PART des positions
vues viennent des binpacks, ramenées à notre échelle (n° 20).
Le seul binpack employé, `training_data.binpack` — des parties de Leela
Chess Zero, extraites d'une archive `training_data.7z` du Drive que nomme
le wiki de l'entraîneur de Stockfish (page « Training datasets » de
`official-stockfish/nnue-pytorch`) —, porte des scores à 330,3 unités par
logit, lues au source de `lc0` (`src/trainingdata/rescorer.cc`). Le
programme vérifie cette échelle sur le fichier même, refuse au-delà d'un
facteur deux, et l'imprime : ce fichier rend **282,1**, un autre nombre
dit un autre fichier. Son origine, que cite l'attribution du `README.md`,
est `storage.lczero.org` (ADR-0030).

**Repartir d'un réseau** (`--depuis`) demande son dossier de points de
sauvegarde, celui qui porte `optimiser_state/` : le réseau quantifié seul
ne suffit pas. Au pas plein, il ré-entraîne plus qu'il n'affine ; `--pas`
réduit le pas de départ. **Les dossiers de sortie se gardent** sur la
machine.

**Les superlots et les passes.** Un superlot compte 100 007 936 positions
vues (16 384 × 6 104), quel que soit `--lot` : un nombre de superlots se
lit en passes, sur les positions que le filtre GARDE — la colonne `gardees`
des registres —, jamais sur toutes. Le pas décroît en cosinus vers le
DERNIER superlot : un point de sauvegarde (bullet en écrit un tous les dix
superlots) n'est pas un entraînement plus court, et sa perte reste bien
au-dessus de celle du bout. La courbe de bullet, `log.txt`, n'est pas une
perte de validation — une moyenne sur le flux entrelacé, prise avant
chaque mise à jour — ; la perte sur des positions jamais apprises est
celle de `nnue-validation.yml`, un diagnostic (« Ce que `tools/src/bin/`
contient »). Les défauts des options de la recette sont ceux de l'exemple
de bullet, pas la recette qui joue : le poids du résultat vaut 0,75 par
défaut, quand la recette qui joue est à `--wdl 0.5` depuis la séance B du
n° 20 (F-0009). Chaque entraînement imprime sa recette en tête de sa sortie,
et les scripts de séance la contrôlent ligne entière.

**Un réseau devient candidat** par `tools/candidat-reseau.py <dépôt>
<base> "<doc>" [largeur=N] [seaux=10]` : le réseau de `reseaux/<base>.bin`
devient l'embarqué, le bloc de doc d'`EMBEDDED` est remplacé, et la table
`CONFRONTATION` du test recopiée de la section « 3. Le moteur contre
l'entraîneur » de sa sortie ; l'outil refuse si cette section n'a pas ses
18 lignes ou si son critère n'est pas tenu. Il ne sait passer que de
l'architecture de N9w50s800 à une autre : `largeur=N` remplace la ligne
`HIDDEN = 256`, et refuse si elle a déjà changé ; `seaux=10` passe de
quatre à dix seaux de roi. **Toute autre option, ou une autre valeur de
`seaux`, est ignorée sans le dire** (B-0072) : seuls les tests `nnue` en
release, qui chargent le réseau embarqué, le rattrapent. Ensuite :
`cargo fmt`, ces tests, le commit, sa révocation.

**La machine de Théo** (Ubuntu, RTX 3050, pilote qui plafonne à CUDA
13.2) ; la procédure d'une séance est le skill `preparer-une-seance` :
- **CUDA** : le toolkit ne doit pas dépasser la « CUDA Version » que
  `nvidia-smi` prête au pilote — bullet compile ses noyaux par NVRTC en
  PTX, que le pilote recompile, et un pilote refuse un PTX plus récent que
  lui. `CUDA_PATH` ET `LD_LIBRARY_PATH` désignent ce toolkit (sans le
  second, l'exécution peut charger la `libnvrtc` d'un autre), et
  `$CUDA_PATH/lib64` doit porter `libcudart.so`, `libnvrtc.so` et
  `libcublas.so` ;
- **Rust** par `rustup`, jamais par `apt` : seul `rustup` lit la toolchain
  que le dépôt épingle ;
- **les artefacts** se téléchargent depuis un navigateur connecté à GitHub,
  ou par `gh run download`, puis se décompressent un par un, chacun dans
  son dossier — `unzip` n'ouvre qu'une archive par appel ;
- **un essai court d'abord** (`--superlots 1`) traverse les trois temps en
  quelques minutes ; sa durée annonce celle du vrai ;
- **rapporter**, sur une branche `reseau/<nom>` : le réseau quantifié, la
  courbe de perte de bullet (`log.txt`) et la sortie du programme, sous
  `reseaux/` ;
- **le rangement**, depuis le 22 oct. 2026 à la demande de Théo : tout sous
  `~/shallowred/` — `chess/` le dépôt, `donnees/<génération>`,
  `seances/<nom>` pour les journaux —, les chemins par défaut des
  scripts ;
- **un portable** : une séance bloque la mise en veille tant qu'elle
  tourne, et la demande à la fin avec l'option `veille`, si logind l'accorde
  sans mot de passe (`CanSuspend`). Le blocage ne couvre ni le chargeur
  débranché ni le capot rabattu : par défaut, logind l'ignore au capot
  (`LidSwitchIgnoreInhibited=yes`).

Depuis le n° 20, les séances s'enchaînent par les scripts `tools/seance-*.sh`,
qui se lancent sans surveillance et disent leur usage en tête ; le
dernier sert de modèle au suivant, et les autres gardent chacun la
recette exacte d'une séance passée :

| script | la séance | ses réseaux, poussés sur |
|---|---|---|
| `tools/seance-n20.sh` | n° 20 : le réglage fin sur Leela, le poids du résultat, puis plus de passes | `reseau/n20-ad`, `reseau/n20a`, `reseau/n20a-points` |
| `tools/seance-n20b.sh` | n° 20, séance B : les données neuves de l'étape B téléchargées, puis le volume | `reseau/n20b` |
| `tools/seance-n20c.sh` | n° 20, séance C1 : les données de la recette | `reseau/n20c` |
| `tools/seance-n20d.sh` | n° 20, séances C2 et C2c : un réglage de la recette par réseau | `reseau/n20d` |
| `tools/seance-n22.sh` | n° 22 : le budget de l'étiqueteur et le tour de boucle | `reseau/n22` |
| `tools/seance-c3.sh` | C3 : les architectures, chacune contre une base aux mêmes données, ses données lues dans `tools/c3-donnees.tsv` | `reseau/c3` |

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

**Le temps de l'évaluation qui joue** ne se lit pas par `timing.sh`, dont
le banc évalue à la main (B-0055), mais au rejeu :
`tools/sonde-inference/rejeu.py`, le pilote qu'apporte
`tools/attic/n15-sonde-inference.patch` — il ne dépend pas du code que la
rustine double, et s'en extrait seul. Il rejoue un corpus de parties (PGN
en notation UCI) à profondeur fixe, table conservée, compare deux binaires
en paires, refuse si leurs arbres diffèrent et rend un test des signes ;
`--nps` compare les nœuds par seconde de deux arbres différents, ceux d'un
réseau candidat. Son corpus se refait — une vingtaine de parties du moteur
qui joue contre lui-même à `8+0,08` — quand il a été perdu avec un
conteneur, et se garde alors dans le dépôt.

- **La puissance s'écrit avant**, pour un temps comme pour un Elo : au
  rejeu, l'écart apparié d'un tour à l'autre vaut ~5 % ; vingt tours ne
  résolvent qu'un effet de ~3 %, cent vingt détectent −1,5 % quatre fois
  sur cinq et −2 % presque toujours.
- **Une optimisation de l'inférence se lit d'abord au code machine** :
  `objdump` du binaire AVX2, avant et après, en comptant dans chaque
  fonction chaude — `Network::evaluate`, `Network::apply_move`,
  `refresh_side` — les instructions que le changement doit faire
  apparaître ou disparaître (`vpmulld`, `vpmullw`, `vpmaddwd`) et la
  largeur de leurs registres (`xmm` 128 bits, `ymm` 256 bits) ; l'attendu
  s'écrit avant. C'est ainsi qu'on a vu le compilateur caler le produit de
  sortie sur 128 bits, ce qui a mené à ADR-0039.
- **Un compte d'opérations ne prédit pas un temps**, même à arbre
  identique : le cache des recalculs épargnait 65 % des lignes de ses
  recalculs et n'a rien rendu, ces lignes se lisant dans 1,5 Mo de poids ;
  le produit scalaire en AVX2 a rendu ce que son compte promettait, ses
  données déjà en cache.

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
`.github/mutation-verdict-test.sh`. Le reste de l'outillage automatique — le
hook de chess, `.claude/hooks/no-fabricated-sha.sh`, et l'auto-test des hooks,
`tools/verify-hooks.sh` — est
décrit dans `CLAUDE.md`, section « Les dispositifs de chess ».

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
| 2026-09-29 | **C28 — la table sous pression : 2 Mio (`cdd5ba4`) contre 16 (`068ee1a`), à `8+0,08`** — la pression de la table de 16 Mio à 60+0,6, reproduite | **−19,42 Elo ± 5,78** sur 6 000 parties à longueur fixe — deux matchs homogènes (−19,59 et −19,24, z = −0,06), Xeon 6973P-C et EPYC 7763, zéro perte au temps. **Coût démontré** : le critère écrit avant ouvre les deux leviers, les seaux et la taille. La sonde (100 parties, EPYC 9V74) : la petite table fait × 1,063 de n/s et cherche −0,44 ± 0,11 pli moins profond — ~44 Elo par pli perdu, sous l'étalon du temps |
| 2026-09-30 | **N° 7 — N1 contre N0** : le réseau entraîné sur des données étiquetées par le moteur AU RÉSEAU, 120,9 M positions (`c430fe5` contre `be9f65e`) | **+115,74 Elo ± 6,98** sur 6 000 parties à `8+0,08`, deux matchs homogènes (z = 0,65), zéro perte au temps. **Gain démontré** — l'attendu, 0 à +40, réfuté par le haut |
| 2026-09-30 | **N° 7 — N2 contre N1** : les mêmes étiquettes, deux fois plus de positions, 249,5 M (`af62e48` contre `c430fe5`) | **+50,09 Elo ± 6,12** sur 6 000 parties à `8+0,08`, homogènes (z = −0,62). **Gain démontré, N2 joue** depuis `d28f886` — l'attendu, 0 à +25, réfuté par le haut |
| 2026-09-30 | **N° 7 — N3 contre N2** : la couche cachée à 256 au lieu de 128, les mêmes données (`eddab38` contre `af62e48`) | **−28,79 Elo ± 5,99** sur 6 000 parties à `8+0,08`, homogènes (z = −1,76). **Écarté** : × 0,785 de nœuds par seconde dans le conteneur, ~−38 Elo par l'étalon — la qualité ne paie pas la vitesse |
| 2026-09-30 | **C29 — les seaux, sous pression** : quatre entrées par ligne de cache, la moins utile cède, contre la case unique — 2 Mio des deux côtés (`2d44626` contre `cdd5ba4`) | **+30,13 Elo ± 5,60** sur 6 000 parties à `8+0,08`, gain démontré dans chaque job (+36,62 et +23,66, z = 2,27, même runner). **FUSIONNÉ** (`fc2c9cf`) ; la sonde : +0,54 ± 0,10 pli à vitesse égale — 38 à 81 Elo par pli regagné par la table |
| 2026-09-30 | **C29 — les seaux, au défaut** : 16 Mio, où la table n'est pas pressée (`90ac6e3` contre `d78b422`) | **+1,85 Elo ± 5,51** sur 6 000 parties à `8+0,08`, homogènes (z = −0,87) : aucune régression démontrée — la condition de la fusion ; la sonde : n/s × 0,990, +0,03 ± 0,13 pli |
| 2026-09-30 | **C30 — la table par défaut à 64 Mio au lieu de 16**, là où elle n'est pas pressée (`94c07ad` contre `4699e63`) | **+2,90 Elo ± 5,72** sur 6 000 parties à `8+0,08`, homogènes (z = −1,11), zéro perte au temps. **Aucun coût démontré : le défaut passe à 64 Mio** (`428a1e5`) ; la sonde : n/s × 0,979, −0,08 ± 0,10 pli |
| 2026-09-30 | **C31 — la nulle par règle testée après une parade tranquille, dans la quiescence** (`5d8c68c` contre `1638d26`) | **−2,43 Elo ± 5,36** sur 6 000 parties à `8+0,08`, homogènes de justesse (z = −1,99) ; **le match 1 seul, −7,88 ± 7,61, borne haute −0,27**. **ARRÊTÉ PAR SON CRITÈRE** — correctif de règle, « fusion sauf si la borne haute est sous zéro, en commun comme sur chaque match » : une lecture la met sous zéro. Zéro perte au temps ; avertissements de nulle : 0 pour le candidat, 5 pour la référence |
| 2026-09-30 | **B8 — l'aspiration et l'élagage delta à l'échelle du réseau** : leurs marges × 2,24 quand un réseau joue, la faite main inchangée (`791e6e4` contre `7305c8a`) | **+50,50 Elo ± 5,37** sur 6 000 parties à `8+0,08`, homogènes (z = −0,13), zéro perte au temps. **Gain démontré, FUSIONNÉ** — l'attendu, 0 à +25, réfuté par le haut. Banc inchangé : la faite main garde ses marges |
| 2026-10-02 | **N2L — N2 ré-entraîné sur les données de Leela**, levier 4 du n° 7 (`5764f2b` contre `4526a2c`) | **+16,40 Elo ± 6,20** sur 6 000 parties à `8+0,08`, homogènes (z = −0,20), zéro perte au temps. **Gain démontré, EMBARQUÉ** — le meilleur des deux réseaux du levier ; attendu 0 à +60 |
| 2026-10-02 | **L0 — les données de Leela seules, depuis zéro**, levier 4 du n° 7 (`3349f53` contre `4526a2c`) | **+10,02 Elo ± 6,19** sur 6 000 parties à `8+0,08`, homogènes (z = 0,46), zéro perte au temps. Gain démontré, sous N2L : non embarqué ; attendu −40 à +40 |
| 2026-10-05 | **C32 — la réduction du coup nul croît avec la profondeur, 3 + d/3**, n° 9 (`4270eef` contre `18a3805`) | **+40,90 Elo ± 5,34** sur 6 000 parties à `8+0,08`, homogènes (z = 0,54), zéro perte au temps. **Gain démontré, FUSIONNÉ** — le meilleur au point du premier écran ; attendu 0 à +40, majorant par l'arbre +36 à +63 |
| 2026-10-05 | **C32b — la même, 3 + d/4**, n° 9 (`b52e0d3` contre `18a3805`) | **+38,31 Elo ± 5,24** sur 6 000 parties à `8+0,08`, homogènes (z = 0,33). Gain démontré, sous C32 : non retenu ; attendu 0 à +35 |
| 2026-10-05 | **C33 — le coup nul seulement si l'évaluation atteint bêta**, n° 9 (`94e84bb` contre `18a3805`) | **+11,12 Elo ± 3,68** sur 12 000 parties à `8+0,08` — l'amplitude hétérogène, de +4,5 à +20,4 selon le job, le signe non. Gain démontré, contre la base d'avant C32 : **au groupe de la composition** ; attendu 0 à +10 |
| 2026-10-05 | **C34 — la réduction itérative interne**, n° 9 (`99178f5` contre `18a3805`) | **+7,50 Elo ± 3,69** sur 12 000 parties à `8+0,08`. Gain démontré, contre la base d'avant C32 : **au groupe de la composition** ; attendu −10 à +10 |
| 2026-10-05 | **C38 — l'échange statique dans la recherche principale** : une capture qui perd plus de 100 × la profondeur se saute, à la profondeur ≤ 6, n° 9 (`5b5c13e` contre `18a3805`) | **+9,61 Elo ± 3,71** sur 12 000 parties à `8+0,08`, homogènes à quatre matchs (p = 0,062). Gain démontré, contre la base d'avant C32 : **au groupe de la composition** ; attendu 0 à +15 |
| 2026-10-05 | **C36 — *improving* dans l'élagage par compte** : son seuil à moitié quand la position ne s'améliore pas, n° 9 (`fd501a8` contre `18a3805`) | **+5,65 Elo ± 3,75** sur 12 000 parties à `8+0,08`, homogènes (p = 0,18). Gain démontré, contre la base d'avant C32 : **au groupe de la composition** ; attendu −10 à +15 |
| 2026-10-05 | **C37 — *improving* dans LMR** : un pli de réduction de plus quand la position ne s'améliore pas, n° 9 (`cefbcfb` contre `18a3805`) | **+0,75 Elo ± 3,69** sur 12 000 parties à `8+0,08` — aucun effet décelable, pour −16,6 % d'arbre : **non fusionné** ; attendu 0 à +20 |
| 2026-10-05 | **C35 — *improving* dans la futilité inverse** : une profondeur de marge de moins quand la position s'améliore, n° 9 (`d0513da` contre `18a3805`) | **−8,51 Elo ± 3,76** sur 12 000 parties à `8+0,08`, borne haute −4,75 : **régression démontrée, non fusionné** — pour −16,9 % d'arbre, celui de C37 ; attendu −10 à +20 |
| 2026-10-05 | **C39 — la futilité aux nœuds frontières** : à la profondeur ≤ 6, un coup tranquille qui ne donne pas échec se saute quand l'évaluation du nœud plus `140 + 20·d`, en unités du réseau, n'atteint pas `alpha`, n° 9 (`dfda892` contre `18a3805`) | **+23,72 Elo ± 3,75** sur 12 000 parties à `8+0,08` — l'amplitude hétérogène, de +16,2 à +31,4 selon le job (p = 0,029), le signe non : chaque job passe seul. Gain démontré, contre la base d'avant C32 : **au groupe de la composition** ; attendu 0 à +35 |
| 2026-10-05 | **Le groupe du n° 9 — C33, C34, C36, C38 et C39 composés sur C32** : la garde du coup nul, la réduction itérative interne, *improving* dans l'élagage par compte, l'échange statique dans la recherche principale, la futilité aux nœuds frontières (`415f560` contre `dec4672`) | **+52,22 Elo ± 3,61** sur 12 000 parties à `8+0,08`, homogènes (p = 0,684), zéro perte au temps. **Gain démontré, FUSIONNÉ** — 91 % de la somme des gains seuls, l'arbre −49,3 % à la profondeur 12 ; attendu +20 à +55 |
| 2026-10-06 | **C40 — l'échange statique des tranquilles** : un coup tranquille qui perd plus de `20·d²` à l'échange se saute, à la profondeur ≤ 8, n° 9 (`63c9678` contre `f537d33`) | **−4,26 Elo ± 3,49** sur 12 000 parties à `8+0,08`, homogènes (p = 0,450). **Régression démontrée** — borne haute −0,77, −0,3 corrigée de la réutilisation du livre ; non fusionné ; attendu 0 à +12 |
| 2026-10-06 | **C41 — les extensions singulières à 10·d** : dès la profondeur 8, le coup de la table gagne un pli quand aucun autre n'atteint `score − 10·d` à mi-profondeur, n° 9 (`8bb4265` contre `f537d33`) | **+10,66 Elo ± 3,43** sur 12 000 parties à `8+0,08`, homogènes (p = 0,326), zéro perte au temps. **Gain démontré, FUSIONNÉ** — seul gain du quatrième écran, donc sa composition ; l'arbre +17,7 % à la profondeur 12 ; attendu −25 à +20 |
| 2026-10-06 | **C41b — les mêmes à 20·d**, n° 9 (`a23ffa1` contre `f537d33`) | **+1,13 Elo ± 3,40** sur 12 000 parties à `8+0,08` — **hétérogènes** (p = 0,039), le runner le plus rapide à −6,37 ; aucune lecture ne passe le critère. Pas d'effet décelable ; attendu −15 à +20 |
| 2026-10-06 | **C42 — l'historique de correction** : la moyenne mobile, par structure de pions, de l'écart entre le résultat d'une recherche et l'évaluation brute, n° 9 (`c9c2df3` contre `f537d33`) | **−1,13 Elo ± 3,61** sur 12 000 parties à `8+0,08`, homogènes (p = 0,853). Pas d'effet décelable, non fusionné ; attendu −15 à +15 |
| 2026-10-06 | **C43 — un pion qui reprend en promouvant, dans `see`** : la boucle d'échange compte le gain de la promotion (+880), correctif de règle (`d69d2ed` contre `b6d41d7`, `main` avec C41) | **+0,87 Elo ± 4,63** sur 6 000 parties à `8+0,08`, homogènes (p = 0,787) ; aucune borne haute sous zéro, ni l'ensemble ni un match : **FUSIONNÉ au titre de la règle** ; attendu 0 |
| 2026-10-07 | **N° 10 — le binaire AVX2** : le même commit (`ea8f3af`), compilé pour `x86-64-v3` contre `x86-64` — même arbre, × 1,235 de nœuds par seconde | **+32,23 Elo ± 4,84** sur 6 000 parties à `8+0,08`, homogènes (p = 0,619) — **gain démontré** ; l'étalon du temps prédisait +32,8 (0,305 doublement × 107,7) ; attendu ~+33, +15 à +45 |
| 2026-10-06 | **C44 — la marge singulière à 5·d**, le pas suivant de la bissection, n° 9 (`6ddd08c` contre `b6d41d7`, `main` avec C41 à 10·d) | **+2,69 Elo ± 3,41** sur 12 000 parties à `8+0,08`, homogènes (p = 0,486). Pas de gain démontré, borne basse −0,72 : **la bissection s'arrête, la marge reste à 10·d** — pour un arbre +17,1 % à la profondeur 12 ; attendu −15 à +10 |
| 2026-10-07 | **C45 — la fenêtre nulle (PVS), sur la base d'aujourd'hui** : le premier coup sous la fenêtre pleine, les suivants sous `(alpha, alpha + 1)`, n° 12 (`4db9356` contre `9c73f99`) | **+11,67 Elo ± 3,38** sur 12 000 parties à `8+0,08`, homogènes (p = 0,549), zéro perte au temps. **Gain démontré — à la composition** ; l'arbre +3,2 % à la profondeur 12 ; attendu −12 à +8, dépassé. Le même changement rendait −0,8 ± 8,2 le 21 sept., sur une autre base |
| 2026-10-07 | **C46 — C45 et les nœuds PV** : ni la table, ni la futilité inverse, ni le coup nul n'y coupent, n° 12 (`7134c9f` contre `9c73f99`) | **+9,56 Elo ± 3,38** sur 12 000 parties à `8+0,08`, homogènes (p = 0,424). Gain démontré, sous C45 au point : non retenu ; l'arbre +17,1 % ; attendu −30 à +10 |
| 2026-10-07 | **C47 — l'extension négative** : quand la recherche d'exclusion atteint `sbeta` et que la table promet la coupure, le coup de la table se cherche un pli plus court, n° 12 (`de87273` contre `9c73f99`) | **+3,91 Elo ± 3,28** sur 12 000 parties à `8+0,08`, homogènes (p = 0,343). **Gain démontré — à la composition**, borne basse +0,63 ; l'arbre −8,3 % ; attendu −5 à +15 |
| 2026-10-07 | **C48 — la double extension** : un coup singulier dont l'exclusion échoue sous `sbeta − 12` gagne deux plis, une fois par chemin, n° 12 (`b395bea` contre `9c73f99`) | **+0,20 Elo ± 3,31** sur 12 000 parties à `8+0,08`, homogènes (p = 0,695). Pas d'effet décelable, non fusionné ; l'arbre +5,3 % ; attendu −10 à +10 |
| 2026-10-07 | **C49 — le malus d'historique** : à une coupure par un tranquille, les tranquilles cherchés avant lui perdent `d²` au papillon et à la continuation, n° 12 (`98a2b1c` contre `9c73f99`) | **+25,32 Elo ± 3,26** sur 12 000 parties à `8+0,08`, homogènes (p = 0,534). **Gain démontré — à la composition** ; l'arbre −3,8 % ; attendu −3 à +10, dépassé |
| 2026-10-07 | **C50 — la décroissance des cinquante coups** : l'évaluation statique × `(200 − c) / 200`, n° 12 (`af73ff5` contre `9c73f99`) | **−0,00 Elo ± 3,26** sur 12 000 parties à `8+0,08`, homogènes (p = 0,512). Pas d'effet décelable, non fusionné ; l'arbre +1,7 % ; attendu −5 à +5 |
| 2026-10-07 | **C51 — les échecs tranquilles au premier pli de la quiescence**, n° 12 (`7bc0e61` contre `9c73f99`) | **−10,77 Elo ± 3,40** sur 12 000 parties à `8+0,08`, homogènes (p = 0,862) : **régression démontrée**, non fusionné ; l'arbre +30,7 % ; 157 avertissements de l'arbitre côté candidat, 12 côté référence ; attendu −50 à +5 |
| 2026-10-07 | **La composition du n° 12 — C45, C47 et C49 sur `main`** : la fenêtre nulle, l'extension négative et le malus d'historique (`ff8d4bb` contre `7d9faef`) | **+32,55 Elo ± 3,36** sur 12 000 parties à `8+0,08`, homogènes (p = 0,244), zéro perte au temps. **Gain démontré, FUSIONNÉ** — au-dessus de C49 seul de +7,2 ± 4,7, 80 % de la somme des gains seuls ; l'arbre −9,65 % à la profondeur 12 ; attendu +25 à +48 |
| 2026-10-13 | **N4L — N4 ré-entraîné sur les données de Leela**, n° 13 : la recette de N2L sur la vague au moteur du 7 oct. (`06b0ed2` contre `017068c`, N2L sur le même code) | **+14,08 Elo ± 3,74** sur 12 000 parties à `8+0,08`, homogènes (p = 0,055), zéro perte au temps. **Gain démontré, EMBARQUÉ** ; attendu −10 à +30, ~+8 |
| 2026-10-13 | **N4 — la vague au moteur du 7 oct. seule, depuis zéro**, n° 13 : l'étiqueteur (`5a425a8` contre `827b9c1`, N2 sur le même code) | **+46,98 Elo ± 4,16** sur 11 980 parties à `8+0,08` — un job coupé au plafond à 2 980 —, homogènes (p = 0,282), zéro perte au temps. Ne décidait rien ; attendu 0 à +60, ~+25 |
| 2026-10-13 | **N4 contre N4L** — la même vague, avec ou sans l'étage de Leela, n° 13 (`5a425a8` contre `06b0ed2`, le même code) | **+5,43 Elo ± 4,23** sur 11 200 parties à `8+0,08`, homogènes (p = 0,890), zéro perte au temps. **Gain démontré, borne basse +1,2 : N4 EMBARQUÉ** à la place de N4L ; attendu −10 à +35, ~+12 |
| 2026-10-14 | **N5l — 256 unités, huit seaux de sortie**, n° 17, les données de N4, son facteur des marges 2,85 (`f6ddfed` contre `6a71964`, N4) | **+30,29 Elo ± 3,95** sur 11 200 parties à `8+0,08`, hétérogènes (p = 0,001 : le runner 9V45 à +43, les trois 7763 à +26,07 ± 4,61, homogènes). **Gain démontré, le meilleur — N5l EMBARQUÉ** ; attendu −5 à +20, dépassé |
| 2026-10-14 | **N5s — 128 unités, huit seaux de sortie**, n° 17 (`a684ee1` contre `6a71964`) | **+15,58 Elo ± 3,87** sur 11 200 parties à `8+0,08`, homogènes (p = 0,364). Gain démontré, sous N5l sans recoupement ; attendu +3 à +15, au bord |
| 2026-10-14 | **N5r4 — 256 unités, quatre seaux de roi, huit de sortie**, n° 17 (`7496db3` contre `6a71964`) | **−58,91 Elo ± 4,45** sur 11 200 parties à `8+0,08`, homogènes (p = 0,187). **Régression** ; attendu +10 à +40, manqué de ~70 |
| 2026-10-14 | **N5r10 — 256 unités, dix seaux de roi, huit de sortie**, n° 17, facteur 3,38 (`d3fe59d` contre `6a71964`) | **−133,59 Elo ± 4,93** sur 11 200 parties à `8+0,08`, hétérogènes (p = 0,009), chaque job sous −120. **Régression** ; attendu −10 à +40, manqué de ~145 |
| 2026-10-17 | **N6r4 — quatre seaux de roi sur 1,563 G positions**, n° 18, étiquetées par N5l, au facteur de `main` 2,85 (`cd6ed79` contre `2648fb1`, N5l) | **+98,74 Elo ± 4,27** sur 11 200 parties à `8+0,08`, quatre matchs homogènes (p = 0,457), zéro perte au temps. **EMBARQUÉ** — le meilleur au point, et N6r10 ne démontre rien devant lui |
| 2026-10-17 | **N6r10 — dix seaux de roi**, n° 18 (`04727b5` contre `2648fb1`) | **+97,30 Elo ± 4,26**, homogènes (p = 0,531) ; **contre N6r4 : +0,34 ± 3,59**, quatre matchs hétérogènes (p = 0,026), les runners ne l'expliquant pas — rien de démontré |
| 2026-10-17 | **N6l — le volume sans seaux de roi**, n° 18 (`e769992` contre `2648fb1`) | **+76,99 Elo ± 4,00**, homogènes (p = 0,113) |
| 2026-10-17 | **N6v — l'étiqueteur seul**, n° 18, 155,8 M positions à 40 superlots (`6844597` contre `2648fb1`) | **+5,52 Elo ± 3,97**, homogènes — démontré de justesse |
| 2026-10-17 | **N6l contre N6m — doubler les données**, n° 18, à 100 superlots (`0edbe22` contre `e769992`, signe opposé) | **+7,32 Elo ± 3,53**, homogènes — **la pente démontrée positive** |
| 2026-10-17 | **N6l200 contre N6l — doubler les passes**, n° 18 (`8416e67` contre `e769992`) | **+5,49 Elo ± 3,55**, homogènes — démontré |
| 2026-10-20 | **N7p4 — 400 superlots**, n° 20 étape A, la recette de N6r4 au seul nombre de passes près (`ec97f35` contre `0eca96a`, N6r4) | **+16,89 Elo ± 3,55** sur 11 200 parties à `8+0,08`, homogènes (p = 0,652), zéro perte au temps. **Gain démontré, le meilleur au point** ; contre N7p2 **+9,31 ± 3,51** — doubler encore les passes paie |
| 2026-10-20 | **N7p2 — 200 superlots**, n° 20 étape A (`8603bd3` contre `0eca96a`) | **+14,74 Elo ± 3,52**, homogènes (p = 0,339) — gain démontré, sous N7p4 en match direct |
| 2026-10-20 | **N6r4w50 — le poids du résultat à 0,5**, n° 20 (d), la recette de N6r4 au seul `wdl` près (`0f5214b` contre `0eca96a`, N6r4) | **+11,79 Elo ± 3,52** sur 11 200 parties à `8+0,08`, homogènes (p = 0,835), zéro perte au temps. **Gain démontré, le meilleur au point** ; N6r4w25 le recoupe — match direct |
| 2026-10-20 | **N6r4w25 — le poids du résultat à 0,25**, n° 20 (d) (`85c88a6` contre `0eca96a`) | **+7,17 Elo ± 3,49**, homogènes (p = 0,864) — gain démontré |
| 2026-10-20 | **N6r4w25 contre N6r4w50**, le match direct de (d) (`85c88a6` contre `0f5214b`) | **−2,95 Elo ± 3,35** sur 11 200 parties à `8+0,08`, homogènes (p = 0,864), zéro perte au temps — rien de démontré : **N6r4w50 représente (d)**, le second devait démontrer |
| 2026-10-21 | **L'écran du pas — N6r4w50 au pas 0,002 contre 0,001**, séance B (`811bfe5` contre `93a3b86`, le même code) | **−4,90 Elo ± 3,41** sur 11 200 parties à `8+0,08`, homogènes (p = 0,689), zéro perte au temps — **régression démontrée** ; le défaut 0,001 reste |
| 2026-10-21 | **L'écran du pas — N6r4w50 au pas 0,0005 contre 0,001**, séance B (`f7a061a` contre `93a3b86`, le même code) | **−0,12 Elo ± 3,43** sur 11 200 parties à `8+0,08`, homogènes (p = 0,298), zéro perte au temps — rien de démontré |
| 2026-10-21 | **N8tw50s800 contre N8tw50 — 800 superlots au lieu de 400 sur 4,63 G**, séance B (`c7b4249` contre `2115850`, le même code) | **+5,43 Elo ± 3,34** sur 11 200 parties à `8+0,08`, homogènes (p = 0,245), zéro perte au temps — **gain démontré : N8tw50s800 EMBARQUÉ** à la place de N8tw50 ; le rendement du doublement décroît (+14,74, +9,31 à 1,56 G) |
| 2026-10-21 | **N8tw50 contre N7p4 — le match direct contre le réseau qui joue**, séance B (`2115850` contre `7d84860`, le même code) | **+17,91 Elo ± 3,40** sur 11 200 parties à `8+0,08`, homogènes (p = 0,109), zéro perte au temps — **gain démontré : N8tw50 EMBARQUÉ** ; 400 superlots, poids 0,5, 4,63 G positions |
| 2026-10-21 | **N8tw50 contre N7p4w50 — doubler les données à 400 superlots**, séance B (`2115850` contre `e37468b`, le même code) | **+7,38 Elo ± 3,40** sur 11 200 parties à `8+0,08`, homogènes (p = 0,567), zéro perte au temps — **gain démontré** ; la moitié neuve étiquetée par N6r4 |
| 2026-10-21 | **N7p4w50 contre N7p4 — le poids 0,5 à 400 superlots**, séance B (`e37468b` contre `7d84860`, le même code) | **+3,35 Elo ± 3,41** sur 11 200 parties à `8+0,08`, homogènes (p = 0,155), zéro perte au temps — rien de démontré : **N7p4 reste** ; le poids rapportait +11,79 à 100 superlots, l'écart (8,4 ± 4,9) est démontré |
| 2026-10-21 | **N6r4w50 contre N7p4**, le match direct entre les axes (`0f5214b` contre `ec97f35`) | **−6,67 Elo ± 3,41** sur 11 200 parties à `8+0,08`, homogènes (p = 0,400), zéro perte au temps — **N7p4 démontré devant, EMBARQUÉ** : trois fois plus de passes rendent plus que le poids du résultat à 0,5 |
| 2026-10-21 | **N8nw50 contre N7p4w50 — l'étiqueteur à volume égal**, séance B, N6r4 contre N5l, 2,30 G contre 2,33 G positions à 400 superlots (`6a1b1d6` contre `e37468b`, le même code) | **+12,76 Elo ± 3,45** sur 11 200 parties à `8+0,08`, homogènes (p = 0,817), zéro perte au temps — **gain démontré** : l'étiqueteur paie encore, 0,13 Elo de réseau par Elo d'étiqueteur (0,11 au n° 18) |
| 2026-10-21 | **N8nw50 contre N8tw50 — les données de N5l à superlots fixés**, séance B, 2,30 G étiquetées par N6r4 contre les mêmes plus 2,33 G par N5l, 400 superlots (`6a1b1d6` contre `2115850`, le même code) | **+5,18 Elo ± 3,32** sur 11 200 parties à `8+0,08`, homogènes (p = 0,793), zéro perte au temps — **gain démontré** : une étiquette plus faible dilue ; la séance C laisse les données de N5l |
| 2026-10-20 | **N6r4Lb — N6r4 affiné sur Leela au pas 2·10⁻⁵**, n° 20 (a), 20 superlots (`739452f` contre `0eca96a`) | **−2,45 Elo ± 3,55**, homogènes (p = 0,966) — rien de démontré |
| 2026-10-20 | **N6r4La — N6r4 affiné sur Leela au pas 10⁻⁴**, n° 20 (a) (`89bb3e9` contre `0eca96a`) | **−11,42 Elo ± 3,73**, homogènes (p = 0,450) — **régression démontrée** : le réglage fin sur Leela ne paie pas |
| 2026-11-02 | **C52 — la gravité au plafond 16 384, le bonus `d²` inchangé**, n° 23 (`141fb43` contre `0e43fdd`) | **+2,14 Elo ± 3,06** sur 11 200 parties à `8+0,08`, homogènes — pas d'effet décelable ; attendu −3 à +3. Non fusionné |
| 2026-11-02 | **C53 — la gravité aux échelles de Stockfish 16, le papillon conservé**, n° 23 (`cde63e6` contre `0e43fdd`) | **+14,40 Elo ± 3,08** sur 11 200 parties à `8+0,08`, homogènes (p = 0,641) — **gain démontré** ; attendu −5 à +10, dépassé ; l'arbre −0,91 % à la profondeur 12. Fusionné avec C54 |
| 2026-11-02 | **C54 — C53 et la LMR modulée par la note, `note / 6000` plis**, n° 23 (`822fb74` contre `cde63e6`) | **+23,18 Elo ± 3,15** sur 11 200 parties à `8+0,08`, homogènes (p = 0,677) — **gain démontré** ; attendu −8 à +15, dépassé ; **l'arbre inchangé** (+0,001 %), un tiers des réductions déplacées. **Fusionné le 3 nov.** |
| 2026-11-03 | **C55 — le diviseur de la LMR modulée à 4 000**, n° 23 (`d803666` contre `39334eb`) | **−2,57 Elo ± 2,99** sur 11 200 parties à `8+0,08`, homogènes (p = 0,939) — rien de démontré ; attendu −10 à +10 ; l'arbre −6,5 % à la profondeur 12. Non fusionné |
| 2026-11-03 | **C56 — le diviseur de la LMR modulée à 9 000**, n° 23 (`98d62bd` contre `39334eb`) | **−7,20 Elo ± 3,07** sur 11 200 parties à `8+0,08`, homogènes (p = 0,604) — **régression démontrée** ; attendu −15 à +3 ; l'arbre +1,9 % à la profondeur 12. Non fusionné |
| 2026-11-03 | **C57 — le décalage de la note dans la LMR modulée, +2 000**, n° 23 (`71f91f5` contre `6958899`) | **−0,22 Elo ± 3,02** sur 11 200 parties à `8+0,08`, homogènes (p = 0,467) — rien de démontré ; attendu −8 à +10 ; l'arbre −9,4 % à la profondeur 12. Non fusionné |
| 2026-11-03 | **C58 — le décalage de la note, −2 000**, n° 23 (`13177a7` contre `6958899`) | **+0,34 Elo ± 3,03** sur 11 200 parties à `8+0,08`, homogènes (p = 0,186) — rien de démontré ; attendu −10 à +5 ; l'arbre +7,1 % à la profondeur 12. Non fusionné |
| 2026-11-03 | **C59 — la mémoire courte : le bonus d'historique × 2, le diviseur de la LMR modulée à 8 000**, n° 23 (`863fbc5` contre `8fa8f20`) | **+2,48 Elo ± 3,08** sur 11 200 parties à `8+0,08`, homogènes (p = 0,903) — rien de démontré ; attendu −6 à +8 ; l'arbre −2,2 % à la profondeur 12. Non fusionné |
| 2026-11-03 | **C60 — la mémoire longue : le bonus × 0,5, le diviseur à 4 000**, n° 23 (`f728e3f` contre `8fa8f20`) | **−5,03 Elo ± 3,00** sur 11 200 parties à `8+0,08`, homogènes — **régression démontrée** ; attendu −8 à +4 ; l'arbre −0,2 % à la profondeur 12. Non fusionné |
| 2026-11-04 | **C61 — la mémoire plus courte encore : le bonus × 3, le diviseur à 10 000**, n° 23 (`0756209` contre `864c15a`) | **+1,66 Elo ± 2,16** sur 22 400 parties à `8+0,08`, huit jobs **non homogènes** (p = 0,009 ; un job à −8,69, inexpliqué) — rien de démontré ; attendu −3 à +6. Non fusionné |
| 2026-11-04 | **C62 — la LMR selon le type de nœud : un pli de plus aux nœuds de coupure attendus**, n° 23 (`4ff385a` contre `8b845b5`) | **+3,29 Elo ± 3,06** sur 11 200 parties à `8+0,08`, homogènes (p = 0,181) — gain démontré, sous C63 au point ; attendu −4 à +6. Non retenu |
| 2026-11-04 | **C63 — la LMR selon le type de nœud : deux plis de plus aux nœuds de coupure attendus (Stockfish 16)**, n° 23 (`2b449ee` contre `8b845b5`) | **+5,06 Elo ± 3,02** sur 11 200 parties à `8+0,08`, homogènes (p = 0,835) — **gain démontré** ; attendu −5 à +8. Entre par la composition des gagnants du n° 23 |
| 2026-11-04 | **C64 — la variante principale en table : un pli de moins aux anciens nœuds PV de fenêtre nulle**, n° 23 (`9a310ba` contre `e0762bf`) | **−0,71 Elo ± 3,04** sur 11 200 parties à `8+0,08`, homogènes — pas d'effet décelable ; attendu −4 à +6. Non fusionné |
| 2026-11-04 | **C65 — la variante principale en table, la forme de Stockfish 16 : un pli de moins à tout nœud qui est ou a été PV**, n° 23 (`905a5c9` contre `e0762bf`) | **+2,79 Elo ± 3,09** sur 11 200 parties à `8+0,08`, homogènes — rien de démontré, pour +25,6 % d'arbre ; attendu −25 à +8. Non fusionné |
| 2026-11-04 | **C66 — la variante principale en table : deux plis de moins aux anciens nœuds PV de fenêtre nulle**, n° 23 (`552338f` contre `e0762bf`) | **+0,68 Elo ± 3,06** sur 11 200 parties à `8+0,08`, **non homogènes** (p = 0,027, sans effet sur la décision) — pas d'effet décelable ; attendu −8 à +6. Non fusionné |
| 2026-11-04 | **C67 — l'historique de correction en plusieurs tables, la forme de Stockfish 17.1** : pions, mineures, hors pions par camp, continuation, n° 23 (`4feae50` contre `e0762bf`) | **+14,22 Elo ± 3,26** sur 11 200 parties à `8+0,08`, homogènes (p = 0,455) — **gain démontré**, pour +14,85 % d'arbre ; attendu −10 à +12. Entre par la composition des gagnants du n° 23 |
| 2026-11-04 | **C68 — l'historique de correction en plusieurs tables, à mi-poids**, n° 23 (`77c0003` contre `e0762bf`) | **+11,26 Elo ± 3,16** sur 11 200 parties à `8+0,08`, homogènes (p = 0,427) — gain démontré, sous C67 au point ; attendu −8 à +10. Non retenu |
| 2026-11-04 | **C69 — l'historique des captures, rouvert : une victime de plus pour une note de 10 692**, n° 23 (`b3d4500` contre `e0762bf`) | **−0,71 Elo ± 3,02** sur 11 200 parties à `8+0,08`, homogènes — pas d'effet décelable, pour −4,90 % d'arbre ; attendu −2 à +10. Non fusionné |
| 2026-11-04 | **C70 — l'historique des captures au rapport de Stockfish 16 : une victime pour une note de 4 585**, n° 23 (`7f9b3e2` contre `e0762bf`) | **−1,30 Elo ± 3,02** sur 11 200 parties à `8+0,08`, homogènes — pas d'effet décelable, pour −4,07 % d'arbre ; attendu −3 à +9. Non fusionné |
| 2026-11-04 | **C71 — la composition de C63 et C67** : la LMR selon le type de nœud et l'historique de correction en plusieurs tables, n° 23 (`3f47f79` contre `e0762bf`) | **+16,02 Elo ± 3,17** sur 11 200 parties à `8+0,08`, non homogènes (p = 0,031), chaque job passant seul — **gain démontré, FUSIONNÉ** ; attendu +12 à +22, 83 % de la somme de ses membres |
| 2026-11-05 | **C72 — trois plis de plus aux nœuds de coupure attendus, au lieu de deux**, n° 23 (`84d51c8` contre `03746f9`) | **−0,09 Elo ± 3,10** sur 11 200 parties à `8+0,08`, homogènes (p = 0,436) — pas d'effet décelable, pour +1,46 % d'arbre ; attendu −3 à +4. Non fusionné |
| 2026-11-05 | **C73 — le poids de l'historique de correction × 1,5**, n° 23 (`55816c7` contre `03746f9`) | **−5,96 Elo ± 3,09** sur 11 200 parties à `8+0,08`, homogènes (p = 0,860) — **régression démontrée**, pour +3,47 % d'arbre ; attendu −3 à +5, manqué par le bas. Non fusionné |
| 2026-11-05 | **C74 — la variante principale en table, la forme de Stockfish 16, reportée sur `main` qui porte C63** (C65 sur C71), n° 23 (`ffc469c` contre `03746f9`) | **+1,61 Elo ± 2,23** sur 22 400 parties à `8+0,08`, huit jobs homogènes (p = 0,451), un relancé après la perte de son runner — rien de démontré, pour +27,82 % d'arbre ; attendu −4 à +8. Non fusionné |
| 2026-11-06 | **E2.5t contre E5n — le budget de l'étiqueteur à temps de runner égal**, n° 22 : 2 500 nœuds contre 5 000, à 400 superlots (`2478c91` contre `339c179`) | **+5,77 Elo ± 3,34** sur 11 200 parties à `8+0,08`, **non homogènes** (p = 0,008 ; les deux EPYC 9V74 à +15 et +8, les deux 7763 à zéro) — gain démontré en commun, aucun job ne contredit ; attendu +1 à +12. **2 500 remplace 5 000** pour les tranches suivantes |
| 2026-11-06 | **E2.5v contre E5n — l'étiquette à 2 500 contre 5 000, à volume égal**, n° 22, à 400 superlots (`5936201` contre `339c179`) | **−1,55 Elo ± 3,40** sur 11 200 parties à `8+0,08`, non homogènes (p = 0,016, quatre EPYC 7763) — pas d'effet décelable ; attendu −6 à +3. Le gain de E2.5t est le volume |
| 2026-11-06 | **E21 contre N8nw50 — le tour de boucle** : la tranche du n° 21 étiquetée par N8tw50s800 contre l'étape B étiquetée par N6r4, même volume et même recette, n° 22 (`2634f81` contre `06d0473`) | **+10,15 Elo ± 3,33** sur 11 200 parties à `8+0,08`, homogènes (p = 0,682) — **gain démontré**, au-dessus de l'attendu (0 à +9) : un meilleur étiqueteur rend un meilleur réseau à volume égal |
| 2026-11-09 | **N10 contre N9w50s800 — la base de C3 contre le réseau qui joue** : n21 et les 21 vagues du n° 22, 16,8 G positions, 800 superlots (`a1848b2` contre `bb172c4`) | **+8,87 Elo ± 3,20** sur 11 200 parties à `8+0,08`, homogènes (p = 0,692) — les quatre jobs au-dessus de zéro ; sous l'attendu (+10 à +25), de peu |
| 2026-11-09 | **N10r10 contre N10 — dix seaux de roi au volume de C3** (`e547ce2` contre `a1848b2`) | **+14,77 Elo ± 3,27** sur 11 200 parties à `8+0,08`, homogènes (p = 0,111) — les quatre jobs au-dessus de zéro ; au-dessus de l'attendu (−3 à +10) : **dix seaux remplacent quatre** |
| 2026-11-09 | **C13 — la série de la phase 4**, N9w50s800 et la recherche de `main` (`7dd523c`) contre Stockfish 16 bridé à 3100, 60+0,6 | 142 − 66 − 92, 62,7 % : **~3 190 ± 24**, +37 ± 35 sur la série du 26 oct. — au-dessus de l'attendu (3 160 à 3 181) |
| 2026-11-10 | **N10h384 contre N10 — 384 unités au volume de C3** (`1844dbe` contre `a1848b2`) | **+24,86 Elo ± 3,25** sur 11 200 parties à `8+0,08`, homogènes (p = 0,412) — les quatre jobs au-dessus de zéro ; au-dessus de l'attendu (−5 à +12) |
| 2026-11-10 | **N10h512 contre N10 — 512 unités au volume de C3** (`745d569` contre `a1848b2`) | **+32,57 Elo ± 3,30** sur 11 200 parties à `8+0,08`, homogènes (p = 0,694) — les quatre jobs au-dessus de zéro ; au-dessus de l'attendu (−8 à +15) |
| 2026-11-03 | **Le livre déséquilibré — son rendement par paire**, n° 23 : `0d2b188` à `10+0,10` contre `8+0,08`, C53 et C54, sur `tools/book-desequilibre.epd` contre `tools/book.epd` | **× 1,11 [0,85 ; 1,44]** sur trois effets connus, homogènes ; × 0,98 par heure de runner, ses parties durant ~13 % de plus — **ne paie pas**, notre livre reste ; à `8+0,08` |

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

### Les récits de septembre 2026 — au journal

Les sections de C21 à A20, les relèves de septembre 2026 et le registre
« Les jobs » de tous les runs de match, sont au journal depuis le 18 nov.
(B-0047), une entrée par section, de J-2026-11-18-G à J-2026-11-18-AA :
c'est là que mènent les renvois à « C21 », « C22 », « C23 », « B9 —
VERDICT », « Ponder — VERDICT », « Calibrer l'Elo par pli », « B6 »,
« Vol de CPU du ponder sur runner », « A18 », « C24 », « C25 », « C26 »,
« L'allocation inégale », « A20 » et
« Ce qui est EN VOL le 23 sept. ». La procédure de leurs relèves est le
skill `rendre-un-verdict` (`.claude/skills/rendre-un-verdict/SKILL.md`).

### Les récits de la force absolue, du temps et de fin de fichier — au journal

Les sections de C13 à C27, la note « B9 ne se valide PAS », la gestion du
temps, le temps de l'adversaire et les récits de fin de fichier, de
« B9 — écrit et mesuré » à C19, sont au journal depuis le 18 nov.
(B-0048), une entrée par section, texte tel quel. C'est là que mènent les
renvois à « C13 » (J-2026-11-18-AE), « B8 » (J-2026-11-18-AF), « C31 » (J-2026-11-18-AG), « C30 » (J-2026-11-18-AH), « C29 » (J-2026-11-18-AI), « C28 » (J-2026-11-18-AJ), « C27 » (J-2026-11-18-AK), « B9 ne se valide PAS » (J-2026-11-18-AL), « La gestion du temps : NON, ce n'est pas clos » (J-2026-11-18-AM), « Réfléchir sur le temps de l'adversaire », « Le ponder » et « La pendule de l'adversaire » (J-2026-11-18-AN), « B9 — écrit et mesuré » (J-2026-11-18-AO), « Trois chantiers, une seule unité » (J-2026-11-18-AP), « D5 a trouvé son érosion » (J-2026-11-18-AQ), « L'érosion se cherche d'abord en nœuds » (J-2026-11-18-AR), « la cause de l'érosion de delta » (J-2026-11-18-AS), « Le SPRT de retrait de l'élagage delta » (J-2026-11-18-AT), « Ce que l'écran en nœuds avait annoncé » (J-2026-11-18-AU), « La relation de budget » (J-2026-11-18-AV), « C18 » (J-2026-11-18-AW), « D2 clos sans match » (J-2026-11-18-AX), « C17 » (J-2026-11-18-AY), « C17 rouvert » (J-2026-11-18-AZ), « C19 » (J-2026-11-18-BA).

Ce qu'elles portaient d'utile est à sa place : la force relevée et ce que
l'échelle de Stockfish bridé fait d'un écart, F-0011 et F-0012 ; la
procédure d'une série, le skill `situer-le-moteur`
(`.claude/skills/situer-le-moteur/SKILL.md`) ; le défaut que C31 laisse sur
`main`, F-0013 ; la relation de budget, F-0014 ; la table et le ponder,
deux lignes de F-0010 ; et la documentation de `force.yml`,
`classes.yml`, `tools/paires.sh` et `tools/lire-journal.sh`, dans
« Situer le moteur » et « Pondérer, et lire le dialogue d'un match ».

### Les récits d'A21 au n° 13 — au journal

Les sections d'A21 au n° 13, septembre et octobre 2026, sont au journal
depuis le 18 nov. (B-0049), une entrée par section, texte tel quel. C'est
là que mènent les renvois à « A21 » et ses étapes (J-2026-11-18-BD), « N° 7 » et « Levier 4 » (J-2026-11-18-BE), « N° 9 » (l'écran) (J-2026-11-18-BF), « N° 9, premier écran » (J-2026-11-18-BG), « deuxième écran » (J-2026-11-18-BH), « troisième écran » (J-2026-11-18-BI), « N° 9, la composition » (J-2026-11-18-BJ), son verdict (J-2026-11-18-BK), « quatrième écran » (J-2026-11-18-BL), son verdict (J-2026-11-18-BM), « C43 et C44 » (J-2026-11-18-BN), leur verdict (J-2026-11-18-BO), « N° 10 » (J-2026-11-18-BP), son verdict (J-2026-11-18-BQ), « N° 12, le cinquième écran » (J-2026-11-18-BR), son relevé (J-2026-11-18-BS), « les candidats C45 à C51 » (J-2026-11-18-BT), leur verdict (J-2026-11-18-BU), « N° 12, la composition » (J-2026-11-18-BV), son arbre (J-2026-11-18-BW), son verdict (J-2026-11-18-BX), « N° 13 », N4 et N4L (J-2026-11-18-BY).

Ce qu'elles portaient d'utile est à sa place : les procédures, dans les
skills `sonder-les-marges` (`.claude/skills/sonder-les-marges/SKILL.md`),
`passer-a-l-ecran` (`.claude/skills/passer-a-l-ecran/SKILL.md`) et
`preparer-une-seance` (`.claude/skills/preparer-une-seance/SKILL.md`) ; la
documentation du générateur et de l'entraînement, dans « Générer les
données NNUE » et « Entraîner un réseau » ; les runs des générations
d'avant le n° 18, et de quoi les regénérer, désignés dans B-0026 ; deux
réglages, l'adjudication du générateur (F-0009) et la marge singulière
(F-0010) ; et ce que les échecs tranquilles en quiescence doivent à la
nulle qu'elle ne teste pas (F-0013).

### Les récits du n° 15 au n° 20 — au journal

Ces sections ont quitté ce fichier le 18 nov. 2026 (B-0050) : leur texte
est au journal, tel quel, sous son titre d'origine. Ce qui en reste utile
est à sa place — les réglages du réseau dans F-0009, les procédures dans
les skills `preparer-une-seance`, `lancer-une-generation`,
`sonder-les-marges` et `rendre-un-verdict`, la documentation des outils
plus haut. Un ancien renvoi vers l'une d'elles se suit ici ; un renvoi au
n° 20 entier désigne J-2026-11-18-CF et ses sous-sections, de
J-2026-11-18-CG à J-2026-11-18-CU, et de même pour le n° 15 à 19
(J-2026-11-18-CB, puis CC) et le n° 18 (J-2026-11-18-CD, puis CE) :

- « N° 15 à 19 — la chaîne du réseau : DÉCIDÉE le 13 oct. 2026 » — J-2026-11-18-CB
- « N° 17 — VERDICT, 14 oct. 2026 : N5l +30,29 ± 3,95 Elo à `8+0,08` contre N4 — EMBARQUÉ ; N5s +15,58 ± 3,87 ; les seaux de roi régressent, N5r4 −58,91 ± 4,45 et N5r10 −133,59 ± 4,93 » — J-2026-11-18-CC
- « N° 18 — le volume de données : DÉCIDÉ le 14 oct. 2026, écrit avant de lancer » — J-2026-11-18-CD
- « N° 18 — VERDICT, 17 oct. 2026 : N6r4 +98,74 ± 4,27 et N6r10 +97,30 ± 4,26 Elo à `8+0,08` contre N5l, N6l +76,99 ± 4,00 — les seaux de roi passent devant, un match direct les départage ; doubler les données paie encore (+7,32 ± 3,53) » — J-2026-11-18-CE
- « N° 20 — plus de passes, plus de données : DÉCIDÉ le 17 oct. 2026, écrit avant de lancer » — J-2026-11-18-CF
- « Étape A — plus de passes, sur la carte de Théo, sans donnée neuve » — J-2026-11-18-CG
- « Étape A — VERDICT, 20 oct. 2026 : plus de passes paie encore — N7p4 +16,89 ± 3,55 et N7p2 +14,74 ± 3,52 contre N6r4 à `8+0,08`, N7p4 +9,31 ± 3,51 contre N7p2 ; la séance B à 400 superlots » — J-2026-11-18-CH
- « Étape B — plus de données, sur les runners, étiquetées par W » — J-2026-11-18-CI
- « La séance B — après le volume » — J-2026-11-18-CJ
- « (e) — le budget de l'étiqueteur : écrit le 20 oct. à 22 h 09, avant de lancer » — J-2026-11-18-CK
- « La séance C1 — écrite le 22 oct. à 4 h 34, avant de la demander » — J-2026-11-18-CL
- « La séance C2 — écrite le 26 oct. à 8 h 07, avant de la demander » — J-2026-11-18-CM
- « La séance C2c — écrite le 27 oct. à 7 h 57, avant de la demander » — J-2026-11-18-CN
- « La séance C3 — le chiffrage, le 27 oct. à 13 h 36, avant de l'écrire » — J-2026-11-18-CO
- « La séance C3, l'outillage — écrit le 27 oct. à 19 h 37, la décision des données en attente » — J-2026-11-18-CP
- « La séance C3, les données — l'option C, choisie par Théo le 6 nov. à 8 h » — J-2026-11-18-CQ
- « C3 — N10 et N10r10 : VERDICT, relevé le 9 nov. à 6 h 50 — la base bat N9w50s800, dix seaux de roi passent devant » — J-2026-11-18-CR
- « C3 — N10h384 et N10h512 : VERDICT, relevé le 10 nov. à 3 h 50 — la largeur paie, nettement » — J-2026-11-18-CS
- « (a) et (d) — la séance, écrite le 19 oct. à 20 h 14, avant de la demander » — J-2026-11-18-CT
- « (a) et (d) — VERDICT, 20 oct. 2026 : le poids du résultat paie — N6r4w50 +11,79 ± 3,52 et N6r4w25 +7,17 ± 3,49 contre N6r4 à `8+0,08`, un match direct les départage ; le réglage fin sur Leela ne paie pas — N6r4La −11,42 ± 3,73, N6r4Lb −2,45 ± 3,55 » — J-2026-11-18-CU
- « La file, phase 2 — le cache des recalculs : écrit le 20 oct. 2026, mesuré avant d'en écrire l'attendu » — J-2026-11-18-CV
- « La file, phase 2 — le produit scalaire en AVX2 : écrit le 20 oct. 2026, le mécanisme lu au code machine » — J-2026-11-18-CW

### N° 21 — la génération étiquetée par N8tw50s800 : écrite le 22 oct. à 4 h 34, avant de lancer

**Décidée** : la génération suivante, étiquetée par le réseau qui joue, à
5 000 nœuds — le budget en place —, dès la clôture de (e) ; Théo, 21 oct.
à 23 h 51 : « *Je valide ton approche* » (« La file », ligne « plus de
données encore »). **Ce qu'on en attend** : du volume d'abord — la boucle
seule rend peu, ~0,12 Elo de réseau par Elo d'étiqueteur, ~+5 pour les
~+40 de N8tw50s800 sur N6r4 (<span>inférence, confiance faible</span>) —,
et la mesure de ce tour-là, gratuite à volume égal contre l'étape B.

**La recette** : `nnue-datagen.yml` à `e20dd6d` — `main`, N8tw50s800
embarqué, le produit de sortie en AVX2 compris —, `<embedded>`, **5 000
nœuds par coup**, graine « auto », un fil par processeur logique, 330
minutes, `x86-64-v3`. Le même filtre et le même livre d'ouvertures
aléatoires que l'étape B et (e) : seul l'étiqueteur change.

**Le volume et la règle de fin, écrits avant** : des vagues de seize ; le
PREMIER job lancé de la vague 1 est tenu à l'écart, désigné avant d'en
voir le compte. **La tranche se ferme quand les jobs appris atteignent
1,75 G positions gardées** — la taille de l'étape B, pour que le tour de
boucle se mesure contre elle à volume égal ; la dernière vague se
dimensionne au reste plus 10 %, comme en (e). ~6 vagues, ~1,5 jour. La
génération continue ensuite par tranches : runners en continu. Le registre
est `tools/n21-jobs.tsv`, créé au relevé de la vague 1 — les colonnes de
l'étape B, plus `noeuds`.

**Le budget en cours de route** : si E10 démontre en séance C1 avant la
fin de la tranche, **les vagues suivantes passent à 10 000 nœuds** —
attendre la tranche suivante coûterait jusqu'à une journée de runners
au budget démontré moins bon. Le registre porte le budget de chaque
job ; les vagues à 5 000 restent le témoin du tour de boucle, à volume
égal sur leur préfixe.

**Pas de sonde de 20 minutes** : le budget et l'architecture sont ceux de
l'étape B ; seuls le réseau et le produit en AVX2 changent, et les
attendus de la vague 1 les couvrent — un écart y coûte une vague de
runners, aucune donnée gardée.

**La vague 1 — attendus**, contre l'étape B (N6r4, `cd6ed79`, le même
budget) — <span>inférence, confiance faible</span> :
- **positions par seconde sur un EPYC 7763 : 1 190 à 1 310** — l'étape B
  en rendait 1 161 à 1 193 ; le produit en AVX2 (−5,09 % de temps au
  rejeu, « La file, phase 2 — le produit scalaire en AVX2 ») est à `e20dd6d` et pas à `cd6ed79`, et
  le générateur évalue presque chaque nœud : × 1,00 à × 1,10 ;
  l'architecture est la même ;
- **les seize : 360 à 560 M positions, 245 à 385 M gardées** — la vague 1
  de l'étape B en fit 430,8 M et 294,4 M ; le haut admet le débit et cinq
  EPYC 9V45 ;
- **écartées, sur les gardées : 15 à 24 %** — 19,3 % pour N6r4, 15,7 %
  pour N5l : le filtre lit les unités de l'étiqueteur, et son échelle
  n'en prédit pas le sens — N5l, au facteur 2,85, écartait MOINS que
  N6r4 au facteur 2,49 ;
- **nulles, sur les gardées : 34 à 38 %** — 34,35 % pour N6r4 à 5 000
  nœuds, 38,5 % à 10 000 : un étiqueteur plus fort en fait davantage, et
  N8tw50s800 a ~+40 sur N6r4 quand 10 000 nœuds en ont ~+100.

Hors fourchette, on diagnostique avant la vague 2. **Concurrence** : seize
jobs, plus les matchs de la séance C1 — seize au plus à la fois —, sous la
limite de quarante.

**La vague 1, RELEVÉE le 22 oct. à 10 h 38 — quatre chiffres sur cinq dans
leur attendu, les nulles 0,14 point dessous.** Seize succès, finis entre
10 h 13 et 10 h 14, chaque journal nommant `e20dd6d` et
`noeuds_par_coup=5000` ; `tools/n21-jobs.tsv`, créé à ce relevé :

| | les seize | attendu, écrit avant |
|---|---|---|
| positions | **451,7 M** | 360 à 560 M — dedans |
| gardées par le filtre | **309,1 M** — 292,7 M aux quinze appris, le tenu à l'écart (39712871836) 16,4 M à part | 245 à 385 M — dedans |
| parties écartées, sur les gardées | **18,94 %** (682 456 sur 3 603 937), 18,75 à 19,09 d'un job à l'autre | 15 à 24 % — dedans |
| nulles, sur les gardées | **33,86 %**, 33,68 à 34,02 | 34 à 38 % — **0,14 point dessous** |
| positions par seconde, EPYC 7763 | **1 211 à 1 243**, huit jobs | 1 190 à 1 310 — dedans |

- **Le débit** : × 1,036 sur l'étape B au même processeur (1 227 contre
  1 184 en moyenne) — le produit en AVX2, au bas de × 1,00 à × 1,10 ; deux
  EPYC 9V45 à 2 088 et 2 092, cinq EPYC 9V74 dont un à 1 265 (le régime
  bas de ce modèle), un Xeon 8370C à 1 167 ;
- **les nulles — le diagnostic, avant la vague 2** : l'écart est
  systématique (seize jobs entre 33,68 et 34,02), pas un job défaillant ;
  le commit et le budget sont ceux écrits ; 125,3 positions par partie
  contre 125,7 à l'étape B ; gains des Blancs et des Noirs à 1,6 % près ;
  les quatre autres chiffres dans leur attendu. Rien ne dit des données
  fausses. **La faute est à l'attendu** : il prolongeait au réseau « un
  étiqueteur plus fort fait plus de nulles », mesuré sur un autre axe, le
  budget (+4,2 points de 5 000 à 10 000 nœuds) ; N8tw50s800 en fait 0,49
  point de MOINS que N6r4 (34,35 %). Deux lectures, aucune vérifiée —
  <span>inférence, confiance faible</span> : un réseau plus fort convertit
  davantage les déséquilibres que le tirage d'ouverture laisse passer
  (jusqu'à 1 000 centièmes) ; l'adjudication de gain se lit en unités de
  l'étiqueteur (2 000 pendant huit demi-coups), et N8tw50s800 a des
  évaluations plus amples là où la sonde de B8 les mesure (2,85 contre
  2,49). Les compteurs du générateur ne séparent pas le mat de
  l'adjudication : la seconde lecture ne se tranche pas d'ici. **La
  vague 2 part** : la part des nulles appartient à l'étiqueteur, et
  l'entraînement apprend le résultat que la partie a eu ;
- **le compte** : 292,7 M gardées aux 15 jobs appris, 19,5 M par job ;
  1,75 G en demandent encore **1 457 M, ~75 jobs** — les vagues 2 à 5
  pleines, la sixième dimensionnée au reste plus 10 %.

**La vague 2 — écrite avant de la lancer.** Seize jobs, tous appris, la
même recette (`e20dd6d`, 5 000 nœuds, 330 minutes) : E10 n'a pas encore de
verdict. *Attendus* — la vague 1, au parc de runners près : **380 à 560 M
positions, 260 à 385 M gardées** ; **écartées 18,7 à 19,2 %, nulles 33,6
à 34,1 %** ; **1 200 à 1 255 positions par seconde sur un EPYC 7763** ;
**le cumul appris, 553 à 678 M gardées**.

**La vague 2, RELEVÉE le 22 oct. à 16 h 37 — les six chiffres dans leur
attendu.** Seize succès, finis entre 16 h 09 et 16 h 10, chaque journal
nommant `e20dd6d` et `noeuds_par_coup=5000` ; `tools/n21-jobs.tsv`, la
vague 2 :

| | vague 2 | vague 1 | attendu, écrit avant |
|---|---|---|---|
| positions | **461,5 M** | 451,7 M | 380 à 560 M — dedans |
| gardées par le filtre | **315,8 M**, tous appris | 309,1 M | 260 à 385 M — dedans |
| parties écartées, sur les gardées | **18,90 %** (18,67 à 19,07) | 18,94 % | 18,7 à 19,2 % — dedans |
| nulles, sur les gardées | **33,86 %** (33,71 à 33,99) | 33,86 % | 33,6 à 34,1 % — dedans |
| positions par seconde, EPYC 7763 | **1 204 à 1 238**, sept jobs | 1 211 à 1 243 | 1 200 à 1 255 — dedans |
| cumul appris | **608,5 M** | 292,7 M | 553 à 678 M — dedans |

- **Deux vagues, le même taux** : nulles 33,86 % les deux fois, écartées
  à 0,04 point, 125,3 positions par partie, 68,4 % gardées par le filtre —
  la nulle sous l'attendu de la vague 1 était l'étiqueteur, pas un tirage ;
- **le parc** : sept EPYC 7763, trois 9V45 (2 042 à 2 159), trois 9V74
  (1 581 à 1 594), deux Xeon 8573C (1 200 et 1 376 — deux régimes, comme
  au n° 20), un Xeon 8370C à 1 127 ; 19,7 M gardées par job ;
- **le compte** : 608,5 M aux 31 jobs appris ; 1,75 G en demandent encore
  **1 141,5 M, ~58 jobs** — les vagues 3 à 5 pleines, la sixième
  dimensionnée au reste plus 10 %.

**La vague 3 — écrite avant de la lancer.** Seize jobs, tous appris, la
même recette (`e20dd6d`, 5 000 nœuds, 330 minutes) — E10 n'a pas de
verdict. *Attendus* — les deux vagues, au parc de runners près : **380 à
560 M positions, 260 à 385 M gardées** ; **écartées 18,7 à 19,2 %, nulles
33,6 à 34,1 %** ; **1 200 à 1 255 positions par seconde sur un EPYC
7763** ; **le cumul appris, 868 à 994 M gardées**.

**La vague 3, RELEVÉE le 22 oct. à 22 h 28 — les six chiffres dans leur
attendu.** Seize succès, finis entre 22 h 08 et 22 h 10, chaque journal
nommant `e20dd6d` et `noeuds_par_coup=5000` ; `tools/n21-jobs.tsv`, la
vague 3 :

| | vague 3 | vague 2 | attendu, écrit avant |
|---|---|---|---|
| positions | **490,2 M** | 461,5 M | 380 à 560 M — dedans |
| gardées par le filtre | **335,5 M**, tous appris | 315,8 M | 260 à 385 M — dedans |
| parties écartées, sur les gardées | **18,91 %** (18,78 à 19,06) | 18,90 % | 18,7 à 19,2 % — dedans |
| nulles, sur les gardées | **33,81 %** (33,61 à 33,96) | 33,86 % | 33,6 à 34,1 % — dedans |
| positions par seconde, EPYC 7763 | **1 210 à 1 242**, huit jobs | 1 204 à 1 238 | 1 200 à 1 255 — dedans |
| cumul appris | **943,9 M** | 608,5 M | 868 à 994 M — dedans |

- **Trois vagues, le même taux** : 125,3 positions par partie, 68,4 %
  gardées par le filtre, les Noirs 1,6 % de gains devant les Blancs,
  comme aux deux premières ;
- **le parc** : huit EPYC 7763, cinq 9V45 (2 035 à 2 180) — d'où le
  volume, le plus haut des trois vagues —, deux 9V74 (1 612 et 1 617),
  un Xeon 8573C à 1 173, son régime bas ; 21,0 M gardées par job ;
- **le compte** : 943,9 M aux 47 jobs appris, 20,1 M par job en moyenne ;
  1,75 G en demandent encore **806,1 M, ~40 jobs** — les vagues 4 et 5
  pleines, la sixième dimensionnée au reste plus 10 %.

**La vague 4 — écrite avant de la lancer.** Seize jobs, tous appris, la
même recette (`e20dd6d`, 5 000 nœuds, 330 minutes) — E10 n'a pas de
verdict : son réseau n'est pas publié. *Attendus* — les trois vagues, au
parc de runners près : **380 à 560 M positions, 260 à 385 M gardées** ;
**écartées 18,7 à 19,2 %, nulles 33,6 à 34,1 %** ; **1 200 à 1 255
positions par seconde sur un EPYC 7763** ; **le cumul appris, 1 204 à
1 329 M gardées**.

**La vague 4, RELEVÉE le 26 oct. à 7 h 57 — les six chiffres dans leur
attendu ; trois jours de runners perdus avant la relève.** Seize succès,
finis le 23 oct. à 4 h 00, chaque journal nommant `e20dd6d` et
`noeuds_par_coup=5000` ; relevés le 26 — la session s'est arrêtée trois
jours sur la limite hebdomadaire de crédits, et la vague 5 n'est pas
partie entre-temps ; `tools/n21-jobs.tsv`, la vague 4 :

| | vague 4 | vague 3 | attendu, écrit avant |
|---|---|---|---|
| positions | **485,3 M** | 490,2 M | 380 à 560 M — dedans |
| gardées par le filtre | **332,0 M**, tous appris | 335,5 M | 260 à 385 M — dedans |
| parties écartées, sur les gardées | **18,92 %** (18,79 à 19,04) | 18,91 % | 18,7 à 19,2 % — dedans |
| nulles, sur les gardées | **33,82 %** (33,66 à 33,95) | 33,81 % | 33,6 à 34,1 % — dedans |
| positions par seconde, EPYC 7763 | **1 210 à 1 244**, cinq jobs | 1 210 à 1 242 | 1 200 à 1 255 — dedans |
| cumul appris | **1 275,9 M** | 943,9 M | 1 204 à 1 329 M — dedans |

- **Quatre vagues, le même taux** : 125,3 positions par partie, 68,4 %
  gardées par le filtre ;
- **le parc** : cinq EPYC 7763, quatre 9V45 dont un à 2 287 — le plus
  rapide vu ici —, quatre 9V74 dont un à 1 259, leur régime bas, deux
  Xeon 8573C (1 205 et 1 389), un Xeon 8370C à 1 157 ;
- **le compte** : 1 275,9 M aux 63 jobs appris, 20,3 M par job ;
  1,75 G en demandent encore **474,1 M, ~23 jobs** — la
  vague 5 pleine, la sixième dimensionnée au reste plus 10 %.

**La vague 5 — écrite avant de la lancer.** Seize jobs, tous appris, la
même recette (`e20dd6d`, 5 000 nœuds, 330 minutes, l'étiqueteur
N8tw50s800) — **E10 a régressé en C1 (−7,38 ± 3,40) : 5 000 nœuds
jusqu'au bout de la tranche**. *Attendus* — les quatre vagues, au parc
près : **380 à 560 M positions, 260 à 385 M gardées** ; **écartées 18,7
à 19,2 %, nulles 33,6 à 34,1 %** ; **1 200 à 1 255 positions par seconde
sur un EPYC 7763** ; **le cumul appris, 1 536 à 1 661 M gardées**.

**La vague 5, RELEVÉE le 26 oct. à 13 h 51 — les six chiffres dans leur
attendu.** Seize succès, finis à 13 h 28 – 13 h 29, chaque journal nommant
`e20dd6d` et `noeuds_par_coup=5000` ; `tools/n21-jobs.tsv`, la vague 5 :

| | vague 5 | vague 4 | attendu, écrit avant |
|---|---|---|---|
| positions | **503,8 M** | 485,3 M | 380 à 560 M — dedans |
| gardées par le filtre | **344,7 M**, tous appris | 332,0 M | 260 à 385 M — dedans |
| parties écartées, sur les gardées | **18,89 %** (18,71 à 19,14) | 18,92 % | 18,7 à 19,2 % — dedans |
| nulles, sur les gardées | **33,81 %** (33,64 à 33,89) | 33,82 % | 33,6 à 34,1 % — dedans |
| positions par seconde, EPYC 7763 | **1 220 à 1 247**, six jobs | 1 210 à 1 244 | 1 200 à 1 255 — dedans |
| cumul appris | **1 620,5 M** | 1 275,9 M | 1 536 à 1 661 M — dedans |

- **Cinq vagues, le même taux** : 125,3 positions par partie, 68,4 %
  gardées ;
- **le parc** : six EPYC 7763, cinq 9V45 (2 034 à 2 215), quatre 9V74
  dont un à 1 260, leur régime bas, un Xeon 8573C à 1 392 ;
- **le compte** : 1 620,5 M aux 79 jobs appris, 20,5 M par job ; 1,75 G
  en demandent encore **129,5 M** — plus 10 %, 142,4 M : **sept jobs**.

**La vague 6, la dernière — écrite avant de la lancer.** Sept jobs, tous
appris, la même recette (`e20dd6d`, 5 000 nœuds, l'étiqueteur
N8tw50s800). *Attendus* — les cinq vagues, à sept jobs : **166 à 245 M
positions, 114 à 169 M gardées** ; **écartées 18,7 à 19,2 %, nulles 33,6
à 34,1 %** ; **1 200 à 1 255 positions par seconde sur un EPYC 7763** ;
**le cumul appris, 1 735 à 1 790 M**. S'il tombe sous 1,75 G, la tranche
se ferme quand même : l'écart à l'étape B (1 751,9 M), à laquelle le tour
de boucle se compare, reste sous 1 %.

**La vague 6, RELEVÉE le 26 oct. à 20 h 09 — les six chiffres dans leur
attendu ; la tranche CLOSE.** Sept succès, finis entre 19 h 22 et 19 h 28,
chaque journal nommant `e20dd6d` et `noeuds_par_coup=5000` ;
`tools/n21-jobs.tsv`, la vague 6 :

| | vague 6 | vague 5 | attendu, écrit avant |
|---|---|---|---|
| positions | **192,9 M** | 503,8 M | 166 à 245 M — dedans |
| gardées par le filtre | **132,0 M**, tous appris | 344,7 M | 114 à 169 M — dedans |
| parties écartées, sur les gardées | **18,90 %** (18,79 à 19,09) | 18,89 % | 18,7 à 19,2 % — dedans |
| nulles, sur les gardées | **33,80 %** (33,67 à 33,93) | 33,81 % | 33,6 à 34,1 % — dedans |
| positions par seconde, EPYC 7763 | **1 223 à 1 235**, trois jobs | 1 220 à 1 247 | 1 200 à 1 255 — dedans |
| cumul appris | **1 752,5 M** | 1 620,5 M | 1 735 à 1 790 M — dedans |

- **le parc** : trois EPYC 7763, un 9V45 (2 101), un 9V74 (1 601), un
  Xeon 8370C (1 161), un Xeon 8573C (1 189) ;
- **la tranche, close** : **86 jobs appris et un tenu à l'écart**
  (39712871836) ; **2 561,3 M positions apprises, 1 752,5 M gardées** —
  à 0,03 % de l'étape B (1 751,9 M), le tour de boucle se compare à
  volume égal ; 125,3 positions par partie, 68,4 % gardées, les mêmes de
  la vague 1 à la 6 ; **9,32 Go d'artefacts zippés**, le tenu compris ;
- **ils expirent du 20 au 24 janv. 2027** (90 jours) : la tranche entre
  dans les données de C3, et la séance qui l'apprend la télécharge avant —
  sur le disque de Théo, comme l'étape B et (e).

### N° 22 — la tranche étiquetée par N9w50s800, et le budget à 2 500 nœuds : écrite le 26 oct. à 13 h 54, avant de lancer

**Décidée** : la génération continue par tranches, runners en continu
(« N° 21 », « La file », ligne « plus de données encore », validée par
Théo le 21 oct.), et chaque tranche part du réseau qui joue — N9w50s800
depuis le 22 oct. Le budget, lui, est rouvert par C1 : 10 000 nœuds ne
rendent rien à volume égal (−1,49 ± 3,38) et perdent à temps de runner
égal (−7,38 ± 3,40) ; **2 500 nœuds est le test suivant au registre** —
s'il ne perd rien à l'étiquette, il double le volume au même temps de
runner, et le volume paie encore (+8,94 ± 3,32). Le n° 22 mesure les deux
à la fois : **chaque vague mêle les deux budgets**, moitié-moitié, dans le
même parc de runners.

**La recette** : `nnue-datagen.yml` à `a4a6490` — `main` après la PR #218,
N9w50s800 embarqué —, `<embedded>`, graine « auto », un fil par processeur
logique, 330 minutes, `x86-64-v3` ; **2 500 nœuds** pour la moitié des
jobs, **5 000** pour l'autre, lancés en alternance — 2 500 d'abord — pour
que les deux moitiés tirent le même mélange de runners. Le même filtre et
le même livre que l'étape B, (e) et le n° 21 : seuls l'étiqueteur et le
budget changent. Le registre est `tools/n22-jobs.tsv`, créé au relevé de
la vague 1, ses colonnes celles du n° 21.

**Le volume et la règle de fin, écrits avant** : des vagues de seize, huit
par budget ; le PREMIER job lancé de chaque budget, à la vague 1, est tenu
à l'écart. **La partie mesurée se ferme à cinq vagues** — ~39 jobs appris
par budget : ~0,8 G gardées à 5 000, ~1,6 G à 2 500. Ensuite, trois
réseaux à la recette de C1 (400 superlots, poids 0,5, pas 0,001) :
- **E5n** — tous les jobs appris à 5 000 nœuds ;
- **E2.5v** — les premiers jobs appris à 2 500, dans l'ordre de
  lancement, jusqu'au volume gardé de E5n à un job près : **l'étiquette
  seule**, à volume égal ;
- **E2.5t** — tous les jobs appris à 2 500 : **le budget à temps de
  runner égal**, la décision.
Leur séance s'écrit à la clôture de la partie mesurée ; ~8 h de carte.

**Critère, écrit avant** : **2 500 remplace 5 000 pour les tranches
suivantes si E2.5t contre E5n a sa borne basse au-dessus de zéro** ;
sinon 5 000 reste. Le registre : 1 250 au test suivant si 2 500 démontre ;
si E2.5v régresse, démontré, sans que E2.5t gagne, les données à 2 500
n'entrent dans l'entraînement qu'après un test à passes égales, comme
celles de N5l. Ce qui ne se décide pas ici : la part de la tranche à
5 000 sert telle quelle.

**Les attendus de la vague 1** — huit jobs par budget —, contre le n° 21
(N8tw50s800 à 5 000) et (e) (N6r4 à 10 000) — <span>inférence, confiance
faible</span> :
- **positions par seconde sur un EPYC 7763** : à 5 000, **1 160 à 1 260**
  — N9w50s800 rendait × 0,962 de nœuds par seconde au rejeu contre
  N8tw50s800 (1 210 à 1 247) ; à 2 500, **2 250 à 2 700** — passer de
  5 000 à 10 000 nœuds rendait × 0,491, l'inverse × 2,04 ;
- **nulles, sur les gardées** : à 5 000, **32,5 à 35,5 %** ; à 2 500,
  **28 à 33,5 %** — 10 000 nœuds en faisaient 4,2 points de plus que
  5 000 (N6r4) ;
- **écartées, sur les gardées** : **18 à 20,5 %** aux deux budgets — 18,9
  au n° 21, 19,3 et 19,5 à 5 000 et 10 000 pour N6r4 : le budget y pèse
  peu ;
- **les huit à 5 000 : 190 à 280 M positions, 130 à 195 M gardées** ;
  **les huit à 2 500 : 350 à 560 M positions, 240 à 385 M gardées**.

Hors fourchette, on diagnostique avant la vague 2 ; un écart coûte une
vague de diagnostic, aucune donnée gardée — pas de sonde de 20 minutes,
comme au n° 21.

**La vague 1, RELEVÉE le 26 oct. à 20 h 09 — onze chiffres sur douze dans leur
attendu ; les écartées dehors, l'étiqueteur en cause, mesuré.** Seize
succès, finis entre 19 h 25 et 19 h 26, chaque journal nommant `a4a6490`
et le budget de sa moitié (`noeuds_par_coup`) ; `tools/n22-jobs.tsv`,
créé ici :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **450,4 M** | **268,5 M** | 350 à 560 M ; 190 à 280 M — dedans |
| gardées par le filtre | **300,7 M** — 268,4 M appris | **183,9 M** — 155,6 M appris | 240 à 385 M ; 130 à 195 M — dedans |
| parties écartées, sur les gardées | **21,05 %** (20,92 à 21,23) | **21,16 %** (20,98 à 21,32) | 18 à 20,5 % — **dehors**, 0,6 dessus |
| nulles, sur les gardées | **28,69 %** (28,62 à 28,80) | **34,77 %** (34,68 à 34,88) | 28 à 33,5 % ; 32,5 à 35,5 % — dedans |
| positions par seconde, EPYC 7763 | **2 443 à 2 455**, trois jobs | **1 227 et 1 232**, deux | 2 250 à 2 700 ; 1 160 à 1 260 — dedans |

- **le budget** : au même processeur, 2 500 nœuds rendent **× 1,99 à
  × 2,01** positions par seconde — 2 448 contre 1 230 sur EPYC 7763,
  3 206 contre 1 595 sur 9V74 : le coût d'un nœud ne dépend pas du
  budget. Les nulles baissent de 6,1 points, les positions par partie
  de 124,3 à 115,0 ;
- **le parc n'est pas le même dans les deux moitiés**, malgré
  l'alternance : à 2 500, trois EPYC 7763, quatre 9V74, un Xeon 8573C ;
  à 5 000, **trois 9V45**, trois 9V74, deux EPYC 7763. D'où × 1,68 de
  volume au lieu de × 2,0 — E2.5t se lit « à temps de runner égal » sur
  cinq vagues, où le tirage se moyenne ; s'il ne se moyenne pas, le
  rapport des volumes appris se dit avec le verdict ;
- **les écartées — le diagnostic, avant la vague 2.** Une partie est
  écartée quand la recherche cote sa première position au-delà de
  `OPENING_MAX_SCORE`, 1 000 en unités d'évaluation (`nnue_datagen.rs`) :
  un seuil dans l'unité du RÉSEAU. Le taux est le même aux deux budgets
  (21,05 et 21,16) — ce n'est pas le budget ; il valait 18,9 % au n° 21,
  le même parc, l'étiqueteur N8tw50s800. **Mesuré dans le conteneur, le
  même soir** : `nnue-datagen` à `3fce769`, graine 12345, 5 000
  ouvertures, 2 500 nœuds, quatre fils — **les MÊMES ouvertures**, seul
  le réseau changé : **N8tw50s800 18,46 % (779 / 4 221), N9w50s800
  21,01 % (868 / 4 132)** — l'écart des runners, 18,9 contre 21,1, à
  0,3 point près. N9w50s800 cote plus loin de zéro les ouvertures
  tirées au hasard, et le seuil en coupe davantage. **Ni défaut, ni
  raison de changer le filtre en cours de tranche** — les deux moitiés
  le partagent, la comparaison n'en dépend pas ; le prix en temps est
  presque nul — une partie écartée ne coûte que la recherche de sa
  première position —, ce qui change est le MÉLANGE : les ouvertures
  que N9w50s800 cote au-delà du seuil et N8tw50s800 en deçà n'y entrent
  plus. *L'attendu avait pris
  l'étiqueteur pour neutre* (« le budget y pèse peu ») ; un seuil écrit
  en unités d'évaluation suit l'échelle du réseau qui étiquette — la
  même famille que les marges de B8. Le seuil lui-même reste au
  registre, non mesuré : il n'a jamais été réglé que sur la faite main.

**La vague 2 — écrite avant de la lancer.** Seize jobs, tous appris, la
même recette (`a4a6490`, l'étiqueteur N9w50s800), huit par budget en
alternance, 2 500 d'abord. *Attendus* — la vague 1, au parc près :
- **les huit à 2 500 : 380 à 600 M positions, 255 à 400 M gardées** ;
  **les huit à 5 000 : 200 à 340 M positions, 137 à 233 M gardées** —
  d'un parc tout en EPYC 7763 à un parc tout en 9V45 ;
- **écartées 20,6 à 21,6 %** aux deux budgets ; **nulles 28,3 à 29,1 %**
  à 2 500, **34,4 à 35,2 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 380 à 2 520** à 2 500,
  **1 200 à 1 260** à 5 000 ;
- **le cumul appris** : à 2 500, **523 à 668 M** gardées ; à 5 000,
  **293 à 389 M**.

**La vague 2, RELEVÉE le 27 oct. à 1 h 55 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 1 h 40 et 1 h 42, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 2 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **498,8 M** | **216,8 M** | 380 à 600 M ; 200 à 340 M — dedans |
| gardées, tous appris | **333,0 M** | **148,6 M** | 255 à 400 M ; 137 à 233 M — dedans |
| parties écartées, sur les gardées | **21,09 %** (21,01 à 21,18) | **21,16 %** (20,90 à 21,35) | 20,6 à 21,6 % — dedans |
| nulles, sur les gardées | **28,71 %** (28,56 à 28,77) | **34,84 %** (34,77 à 34,90) | 28,3 à 29,1 % ; 34,4 à 35,2 % — dedans |
| positions par seconde, EPYC 7763 | **2 427 à 2 456**, trois jobs | **1 217 à 1 237**, quatre | 2 380 à 2 520 ; 1 200 à 1 260 — dedans |
| cumul appris | **601,4 M** | **304,2 M** | 523 à 668 M ; 293 à 389 M — dedans |

- **le parc a tourné dans l'autre sens** : à 2 500, trois 9V45 (4 225 à
  4 509), trois EPYC 7763, un 9V74, un Xeon 8573C ; à 5 000, quatre EPYC
  7763, trois Xeon 8573C, un 9V45. Le rapport des volumes appris, × 1,68
  à la vague 1, vaut **× 1,98 après deux** — 601,4 contre 304,2 M : le
  tirage se moyenne, comme écrit ;
- **les Xeon 8573C à 5 000 varient de 15 %** : 1 197, 1 355 et 1 378
  positions par seconde, sur le même binaire — le régime du runner, pas
  le budget ;
- **les écartées tiennent leur nouveau taux** : 21,1 % aux deux budgets,
  comme à la vague 1 — l'étiqueteur, mesuré le 26 oct.

**La vague 3 — écrite avant de la lancer.** Seize jobs, tous appris, la
même recette, huit par budget en alternance, 2 500 d'abord. *Attendus* —
les deux vagues, d'un parc tout en Xeon 8573C à un parc tout en 9V45 :
- **les huit à 2 500 : 370 à 650 M positions, 248 à 435 M gardées** ;
  **les huit à 5 000 : 190 à 340 M positions, 130 à 233 M gardées** ;
- **écartées 20,8 à 21,5 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 400 à 2 500** à 2 500,
  **1 200 à 1 260** à 5 000 ;
- **le cumul appris** : à 2 500, **849 à 1 036 M** gardées ; à 5 000,
  **434 à 537 M**.

**La vague 3, RELEVÉE le 27 oct. à 7 h 47 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 7 h 26 et 7 h 28, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 3 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **485,7 M** | **225,7 M** | 370 à 650 M ; 190 à 340 M — dedans |
| gardées, tous appris | **324,3 M** | **154,6 M** | 248 à 435 M ; 130 à 233 M — dedans |
| parties écartées, sur les gardées | **21,07 %** (20,99 à 21,16) | **21,23 %** (21,08 à 21,47) | 20,8 à 21,5 % — dedans |
| nulles, sur les gardées | **28,72 %** (28,60 à 28,77) | **34,79 %** (34,64 à 35,00) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 418 et 2 422**, deux jobs | **1 225 à 1 241**, quatre | 2 400 à 2 500 ; 1 200 à 1 260 — dedans |
| cumul appris | **925,7 M** | **458,8 M** | 849 à 1 036 M ; 434 à 537 M — dedans |

- **le parc** : à 2 500, cinq 9V74, deux EPYC 7763, un 9V45 ; à 5 000,
  quatre EPYC 7763, un 9V45, un Xeon 8370C, un Xeon 8573C et **un
  processeur jamais vu ici, un Xeon 6973P-C — 1 738 positions par
  seconde** à 5 000, entre le 9V74 et le 9V45 ;
- **le rapport des volumes appris : × 2,02 après trois vagues** — × 1,68,
  puis × 1,98 : le tirage du parc s'est moyenné ;
- 23 jobs appris par budget ; la partie mesurée se ferme à la vague 5,
  ~39 par budget.

**La vague 4 — écrite avant de la lancer.** Seize jobs, tous appris, la
même recette, huit par budget en alternance, 2 500 d'abord. *Attendus* —
les trois vagues, d'un parc tout en Xeon 8573C à un parc tout en 9V45 :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 400 à 2 500** à 2 500,
  **1 200 à 1 260** à 5 000 ;
- **le cumul appris** : à 2 500, **1 174 à 1 396 M** gardées ; à 5 000,
  **589 à 695 M**.

**La vague 4, RELEVÉE le 27 oct. à 13 h 33 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 13 h 18 et 13 h 19, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 4 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **488,2 M** | **216,5 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **326,0 M** | **148,2 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,08 %** (20,97 à 21,26) | **21,20 %** (21,10 à 21,30) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,73 %** (28,62 à 28,83) | **34,83 %** (34,69 à 34,93) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 429 à 2 459**, quatre jobs | **1 224 à 1 232**, cinq | 2 400 à 2 500 ; 1 200 à 1 260 — dedans |
| cumul appris | **1 251,7 M** | **607,0 M** | 1 174 à 1 396 M ; 589 à 695 M — dedans |

- **le parc** : à 2 500, quatre EPYC 7763, trois 9V45, un Xeon 8573C ; à
  5 000, cinq EPYC 7763 et trois 9V74 ;
- **le rapport des volumes appris : × 2,06 après quatre vagues** ;
- 31 jobs appris par budget ; la vague 5 ferme la partie mesurée à 39.

**La vague 5, la dernière de la partie mesurée — écrite avant de la
lancer.** Seize jobs, tous appris, la même recette, huit par budget en
alternance, 2 500 d'abord. *Attendus* — les quatre vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 400 à 2 500** à 2 500,
  **1 200 à 1 260** à 5 000 ;
- **le cumul appris** : à 2 500, **1 500 à 1 722 M** gardées ; à 5 000,
  **737 à 843 M**.

**La vague 5, RELEVÉE le 27 oct. à 19 h 20 — onze chiffres sur douze dans
leur attendu, et un runner perdu.** Quinze succès, finis entre 19 h 04 et
19 h 05, chaque journal nommant `a4a6490` et le budget de sa moitié ;
**40504743692 (2 500) a perdu son runner à 18 h 25** — « *The hosted
runner lost communication with the server* », pas d'artefact, pas de
journal (404) : la panne de 39207799756 au n° 20. `tools/n22-jobs.tsv`,
la vague 5 :

| | à 2 500 nœuds — **sept** | à 5 000 nœuds — huit | attendu, écrit avant |
|---|---|---|---|
| positions | **410,8 M** | **198,5 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **274,3 M** | **136,0 M** | 248 à 470 M ; 130 à 236 M — dedans, sept jobs compris |
| parties écartées, sur les gardées | **21,04 %** (20,89 à 21,17) | **21,15 %** (21,01 à 21,36) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,73 %** (28,65 à 28,89) | **34,81 %** (34,52 à 34,94) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 423 à 2 471**, trois jobs | **1 183 à 1 240**, cinq | 2 400 à 2 500 — dedans ; 1 200 à 1 260 — **un job dehors, 1 183** |
| cumul appris | **1 526,0 M** | **743,0 M** | 1 500 à 1 722 M ; 737 à 843 M — dedans |

- **le chiffre dehors** : un EPYC 7763 à 1 183 positions par seconde,
  1,4 % sous la borne, ses nulles et ses écartées au milieu des autres
  (34,52 et 21,32 %) — un hôte plus chargé, pas une autre recette. Le
  volume n'en dépend qu'au travers du temps, et il est dedans ;
- **le parc** : à 2 500, trois EPYC 7763, deux 9V74, un 9V45, un Xeon
  8573C ; à 5 000, cinq EPYC 7763 et trois 9V74.

**La partie mesurée est CLOSE** — cinq vagues, le 27 oct. à 19 h 20 :

| | à 2 500 nœuds | à 5 000 nœuds |
|---|---|---|
| jobs appris | **38** — un perdu à la vague 5 | **39** |
| parties : positions | 19 863 087 : 2 285 525 972 | 8 731 249 : 1 084 732 803 |
| gardées | **1 526,0 M** | **743,0 M** |
| tenu à l'écart | 40326139016, 32,3 M gardées | 40326149256, 28,3 M |
| artefacts | 8,32 Go, plus 0,18 tenu | 3,91 Go, plus 0,15 tenu |

**Le rapport des volumes appris : × 2,05**, le runner perdu compris —
× 1,68 après la vague 1, × 1,98, × 2,02, × 2,06 : le tirage du parc s'est
moyenné, et E2.5t se lit bien « à temps de runner égal ». Les artefacts
expirent du 24 au 25 janv. 2027.

**Les trois ensembles des réseaux, fixés par la règle écrite avant** —
`tools/n22-jobs.tsv`, ordre de lancement, le tenu à l'écart jamais :
- **E5n** — les 39 jobs appris à 5 000 : `--attendu
  8731249:1084732803`, 743,0 M gardées ;
- **E2.5v** — les **19** premiers jobs appris à 2 500, jusqu'à
  40429538917 : **751,0 M gardées, + 1,1 %** sur E5n — 18 en donnaient
  708,6 M, − 4,6 % ; `--attendu 9775632:1124756878` ;
- **E2.5t** — les 38 jobs appris à 2 500 : `--attendu
  19863087:2285525972`, 1 526,0 M gardées.

**La vague 6 — la génération continue, écrite avant de la lancer.** La
même recette, seize jobs, huit par budget en alternance, 2 500 d'abord,
tous appris ; ils ne changent rien aux trois ensembles ci-dessus, et
serviront la suite quel que soit le budget retenu. *Attendus* — les cinq
vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 400 à 2 500** à 2 500,
  **1 180 à 1 260** à 5 000 — la borne basse descendue au job de la
  vague 5, que rien d'autre ne distinguait ;
- **le cumul appris** : à 2 500, **1 774 à 1 996 M** gardées ; à 5 000,
  **873 à 979 M**.

**La vague 6, RELEVÉE le 28 oct. à 1 h 40 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 0 h 51 et 0 h 53, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 6 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **482,7 M** | **218,6 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **322,3 M** | **149,7 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,09 %** (21,03 à 21,19) | **21,13 %** (21,00 à 21,28) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,69 %** (28,63 à 28,80) | **34,84 %** (34,73 à 35,01) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 404 à 2 457**, quatre jobs | **1 211 à 1 236**, quatre | 2 400 à 2 500 ; 1 180 à 1 260 — dedans |
| cumul appris | **1 848,3 M** | **892,7 M** | 1 774 à 1 996 M ; 873 à 979 M — dedans |

- **le parc** : à 2 500, quatre EPYC 7763, deux 9V74, deux 9V45 ; à
  5 000, quatre EPYC 7763, deux Xeon 8370C (1 154 et 1 165), un 9V74, un
  9V45 (2 222) ;
- 46 et 47 jobs appris ; le rapport des volumes, × 2,07.

**La vague 7 — écrite avant de la lancer.** La même recette, seize jobs,
huit par budget en alternance, 2 500 d'abord, tous appris. *Attendus* —
les six vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 400 à 2 500** à 2 500,
  **1 180 à 1 260** à 5 000 ;
- **le cumul appris** : à 2 500, **2 096 à 2 318 M** gardées ; à 5 000,
  **1 023 à 1 129 M**.

**La vague 7, RELEVÉE le 28 oct. à 7 h 26 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 7 h 11 et 7 h 13, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 7 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **458,4 M** | **249,2 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **306,1 M** | **170,7 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,10 %** (20,96 à 21,25) | **21,22 %** (21,06 à 21,37) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,68 %** (28,60 à 28,81) | **34,81 %** (34,72 à 34,86) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 420 à 2 448**, cinq jobs | **1 182 à 1 239**, trois | 2 400 à 2 500 ; 1 180 à 1 260 — dedans |
| cumul appris | **2 154,4 M** | **1 063,3 M** | 2 096 à 2 318 M ; 1 023 à 1 129 M — dedans |

- **le parc** : à 2 500, cinq EPYC 7763, deux 9V45, un 9V74 ; à 5 000,
  trois EPYC 7763, trois 9V45, deux Xeon 8573C ;
- 54 et 55 jobs appris ; le rapport des volumes, × 2,03.

**La vague 8 — écrite avant de la lancer.** La même recette, seize jobs,
huit par budget en alternance, 2 500 d'abord, tous appris. *Attendus* —
les sept vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 400 à 2 500** à 2 500,
  **1 180 à 1 260** à 5 000 ;
- **le cumul appris** : à 2 500, **2 402 à 2 624 M** gardées ; à 5 000,
  **1 193 à 1 299 M**.

**La vague 8, RELEVÉE le 28 oct. à 13 h 33 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 12 h 57 et 12 h 58, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 8 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **476,5 M** | **226,2 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **318,1 M** | **154,9 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,10 %** (20,94 à 21,15) | **21,13 %** (21,02 à 21,22) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,70 %** (28,61 à 28,81) | **34,80 %** (34,67 à 34,93) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 446 et 2 450**, deux jobs | **1 213 à 1 240**, trois | 2 400 à 2 500 ; 1 180 à 1 260 — dedans |
| cumul appris | **2 472,5 M** | **1 218,2 M** | 2 402 à 2 624 M ; 1 193 à 1 299 M — dedans |

- **le parc** : à 2 500, quatre EPYC 9V74, deux 7763, un 9V45, un Xeon
  8573C ; à 5 000, trois 9V74, trois 7763, un 9V45, un Xeon 8573C ;
- 62 et 63 jobs appris ; le rapport des volumes, × 2,03.

**La vague 9 — écrite avant de la lancer.** La même recette, seize jobs,
huit par budget en alternance, 2 500 d'abord, tous appris. *Attendus* —
les huit vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 400 à 2 500** à 2 500,
  **1 180 à 1 260** à 5 000 ;
- **le cumul appris** : à 2 500, **2 720 à 2 942 M** gardées ; à 5 000,
  **1 348 à 1 454 M**.

**La vague 9, RELEVÉE le 28 oct. à 19 h 16 — onze chiffres sur douze dans
leur attendu ; la vitesse des EPYC 7763 à 2 500 nœuds en sort par le
bas.** Seize succès, finis entre 19 h 04 et 19 h 05, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 9 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **437,1 M** | **212,8 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **291,9 M** | **145,8 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,05 %** (21,04 à 21,07) | **21,24 %** (21,00 à 21,36) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,73 %** (28,66 à 28,82) | **34,88 %** (34,74 à 35,15) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 384 à 2 477**, six jobs | **1 211 à 1 227**, cinq | 2 400 à 2 500 ; 1 180 à 1 260 — **à 2 500, deux jobs dessous** |
| cumul appris | **2 764,4 M** | **1 364,0 M** | 2 720 à 2 942 M ; 1 348 à 1 454 M — dedans |

- **la sortie, lue** : deux EPYC 7763 à **2 384 et 2 393** positions
  par seconde, 0,7 et 0,3 % sous la borne ; les quatre autres de la
  vague à 2 439 – 2 477. Rien d'autre ne les distingue — écartées et
  nulles dans la plage, le même générateur, le même budget, et leurs
  voisins à 5 000 sur le même modèle tenus (1 211 à 1 227). <span>Inférence,
  confiance moyenne</span> : la dispersion d'un même modèle de runner,
  déjà vue à la vague 5 qui avait fait descendre la borne à 2 400 ; elle
  ne change rien aux données. **La borne basse passe à 2 350 pour la
  vague 10**, écrite avant, avec sa raison ;
- **le parc** : à 2 500, six EPYC 7763, un 9V45, un 9V74 ; à 5 000, cinq
  7763, un 9V45, un 9V74, un Xeon 8370C (1 001, sous les 1 154 et 1 165
  de ses deux jobs de la vague 6 — aucun attendu ne le porte) ;
- 70 et 71 jobs appris ; le rapport des volumes, × 2,03.

**La vague 10 — écrite avant de la lancer.** La même recette, seize jobs,
huit par budget en alternance, 2 500 d'abord, tous appris. *Attendus* —
les neuf vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 350 à 2 500** à 2 500 —
  la borne basse descendue aux deux jobs de la vague 9 —, **1 180 à
  1 260** à 5 000 ;
- **le cumul appris** : à 2 500, **3 012 à 3 234 M** gardées ; à 5 000,
  **1 494 à 1 600 M**.

**La vague 10, RELEVÉE le 29 oct. à 0 h 57 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 0 h 47 et 0 h 48, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 10 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **468,4 M** | **230,0 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **312,7 M** | **157,6 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,03 %** (20,95 à 21,13) | **21,21 %** (21,02 à 21,35) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,73 %** (28,60 à 28,80) | **34,79 %** (34,68 à 34,94) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 400**, un job | **1 213 à 1 221**, trois | 2 350 à 2 500 ; 1 180 à 1 260 — dedans |
| cumul appris | **3 077,1 M** | **1 521,6 M** | 3 012 à 3 234 M ; 1 494 à 1 600 M — dedans |

- **le parc** : à 2 500, trois Xeon 8573C (2 294 à 2 697), deux EPYC
  9V45, un 9V74, un 7763, un Xeon 8370C (2 215) ; à 5 000, trois 7763,
  trois 9V74, un 9V45, un Xeon 8573C — un seul 7763 à 2 500, la borne
  descendue à la vague 9 ne se relit donc que sur lui ;
- 78 et 79 jobs appris ; le rapport des volumes, × 2,02.

**La vague 11 — écrite avant de la lancer.** La même recette, seize jobs,
huit par budget en alternance, 2 500 d'abord, tous appris. *Attendus* —
les dix vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 350 à 2 500** à 2 500,
  **1 180 à 1 260** à 5 000 ;
- **le cumul appris** : à 2 500, **3 325 à 3 548 M** gardées ; à 5 000,
  **1 651 à 1 758 M**.

**La vague 11, RELEVÉE le 29 oct. à 6 h 37 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 6 h 28 et 6 h 29, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 11 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **410,5 M** | **207,4 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **274,1 M** | **142,1 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,04 %** (20,87 à 21,11) | **21,23 %** (21,01 à 21,44) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,71 %** (28,66 à 28,80) | **34,82 %** (34,68 à 34,93) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 379 à 2 431**, cinq jobs | **1 199 à 1 221**, quatre | 2 350 à 2 500 ; 1 180 à 1 260 — dedans |
| cumul appris | **3 351,2 M** | **1 663,6 M** | 3 325 à 3 548 M ; 1 651 à 1 758 M — dedans |

- **la borne descendue à la vague 9 tient** : deux EPYC 7763 sur cinq
  encore sous 2 400 (2 379, 2 385), aucun sous 2 350 ;
- **le parc** : à 2 500, cinq 7763, trois 9V74 ; à 5 000, quatre 7763,
  quatre 9V74 — et les 9V74 se séparent en deux vitesses, un à 2 458
  contre 3 117 et 3 146 à 2 500, deux à 1 236 et 1 239 contre 1 573 et
  1 583 à 5 000 : le même modèle annoncé, ~1,27 fois plus lent ; aucun
  attendu ne le porte ;
- 86 et 87 jobs appris ; le rapport des volumes, × 2,01.

**La vague 12 — écrite avant de la lancer.** La même recette, seize jobs,
huit par budget en alternance, 2 500 d'abord, tous appris. *Attendus* —
les onze vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 350 à 2 500** à 2 500,
  **1 180 à 1 260** à 5 000 ;
- **le cumul appris** : à 2 500, **3 599 à 3 822 M** gardées ; à 5 000,
  **1 793 à 1 900 M**.

**La vague 13 — écrite avant de la lancer**, le 29 oct. à 12 h 29, la
vague 12 finie et pas encore relevée. La même recette, seize jobs, huit
par budget en alternance, 2 500 d'abord, tous appris. *Attendus* — les
douze vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 350 à 2 500** à 2 500,
  **1 180 à 1 260** à 5 000 ;
- **le cumul appris** : celui de la vague 12, relevé après ce paragraphe,
  **plus 248 à 470 M** à 2 500 et **plus 130 à 236 M** à 5 000 — écrit en
  écart pour ne pas faire attendre les runners la durée d'une relève.

**La vague 12, RELEVÉE le 29 oct. à 12 h 33 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 12 h 08 et 12 h 09, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 12 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **432,9 M** | **219,5 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **289,0 M** | **150,3 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,10 %** (20,97 à 21,17) | **21,16 %** (21,02 à 21,30) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,75 %** (28,62 à 28,85) | **34,90 %** (34,66 à 35,09) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 379 à 2 419**, cinq jobs | **1 191 à 1 209**, trois | 2 350 à 2 500 ; 1 180 à 1 260 — dedans |
| cumul appris | **3 640,2 M** | **1 813,9 M** | 3 599 à 3 822 M ; 1 793 à 1 900 M — dedans |

- **le parc** : à 2 500, cinq 7763, deux 9V74 (2 467 et 3 135 — les deux
  vitesses du même modèle, × 1,27 encore), un 9V45 (4 302) ; à 5 000,
  trois 7763, deux 9V74 (1 577, 1 580), deux Xeon 8370C (1 077 et 1 152,
  les plus lents de la vague), un 9V45 (2 092) ;
- 94 et 95 jobs appris ; le rapport des volumes, × 2,01 ;
- **l'attendu du cumul de la vague 13 s'en déduit** : à 2 500, **3 888 à
  4 110 M** ; à 5 000, **1 944 à 2 050 M**.

**La vague 14 — écrite avant de la lancer**, le 29 oct. à 18 h 08, la
vague 13 finie et pas encore relevée. La même recette, seize jobs, huit
par budget en alternance, 2 500 d'abord, tous appris. *Attendus* — les
treize vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 350 à 2 500** à 2 500,
  **1 180 à 1 260** à 5 000 ;
- **le cumul appris** : celui de la vague 13, relevé après ce paragraphe,
  **plus 248 à 470 M** à 2 500 et **plus 130 à 236 M** à 5 000.

**La vague 13, RELEVÉE le 29 oct. à 18 h 12 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 18 h 00 et 18 h 01, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 13 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **446,8 M** | **256,4 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **298,4 M** | **175,6 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,05 %** (20,92 à 21,16) | **21,19 %** (21,10 à 21,38) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,74 %** (28,57 à 28,85) | **34,78 %** (34,68 à 34,94) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 389 à 2 427**, trois jobs | **1 212**, un | 2 350 à 2 500 ; 1 180 à 1 260 — dedans |
| cumul appris | **3 938,6 M** | **1 989,6 M** | 3 888 à 4 110 M ; 1 944 à 2 050 M — dedans |

- **le parc** : à 2 500, trois 7763, trois 9V74 (2 431, puis 3 126 et
  3 133 — les deux vitesses encore), un 9V45 (4 417), un Xeon 8370C
  (2 254) ; à 5 000, trois 9V45 (2 062 à 2 136), deux 9V74 (1 579), un
  7763, un Xeon 8370C (1 103), un Xeon 8573C (1 186) — un seul 7763 à
  5 000, sa borne ne se relit donc que sur lui ;
- 102 et 103 jobs appris ; le rapport des volumes, × 1,98 — les 9V45,
  rapides, tombés trois fois à 5 000 ;
- **l'attendu du cumul de la vague 14 s'en déduit** : à 2 500, **4 187 à
  4 409 M** ; à 5 000, **2 120 à 2 226 M**.

**La vague 15 — écrite avant de la lancer**, le 29 oct. à 23 h 47, la
vague 14 finie et pas encore relevée. La même recette, seize jobs, huit
par budget en alternance, 2 500 d'abord, tous appris. *Attendus* — les
quatorze vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 350 à 2 500** à 2 500,
  **1 180 à 1 260** à 5 000 ;
- **le cumul appris** : celui de la vague 14, relevé après ce paragraphe,
  **plus 248 à 470 M** à 2 500 et **plus 130 à 236 M** à 5 000.

**La vague 14, RELEVÉE le 29 oct. à 23 h 50 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 23 h 39 et 23 h 40, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 14 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **460,7 M** | **202,3 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **307,7 M** | **138,6 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,05 %** (20,97 à 21,13) | **21,21 %** (20,99 à 21,40) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,76 %** (28,63 à 28,82) | **34,82 %** (34,68 à 34,88) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 371 à 2 428**, quatre jobs | **1 188 à 1 219**, six | 2 350 à 2 500 ; 1 180 à 1 260 — dedans |
| cumul appris | **4 246,3 M** | **2 128,2 M** | 4 187 à 4 409 M ; 2 120 à 2 226 M — dedans, à 5 000 près du bas |

- **le parc** : à 2 500, quatre 7763, deux 9V45 (4 143 et 4 207), un
  Xeon 8370C (2 206) et, **pour la première fois, un Xeon 6973P-C**
  (3 118) ; à 5 000, six 7763, un 9V74 (1 568), un Xeon 8573C (1 416 —
  le même modèle rendait 1 186 à la vague 13 : × 1,19, deux vitesses ici
  aussi) — six 7763 sur huit à 5 000, d'où le volume au bas de
  l'attendu ;
- 110 et 111 jobs appris ; le rapport des volumes, × 2,00 ;
- **l'attendu du cumul de la vague 15 s'en déduit** : à 2 500, **4 494 à
  4 716 M** ; à 5 000, **2 258 à 2 364 M**.

**La vague 16 — écrite avant de la lancer**, le 30 oct. à 5 h 26, la
vague 15 finie et pas encore relevée. La même recette, seize jobs, huit
par budget en alternance, 2 500 d'abord, tous appris. *Attendus* — les
quinze vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 350 à 2 500** à 2 500,
  **1 180 à 1 260** à 5 000 ;
- **le cumul appris** : celui de la vague 15, relevé après ce paragraphe,
  **plus 248 à 470 M** à 2 500 et **plus 130 à 236 M** à 5 000.

**La vague 15, RELEVÉE le 30 oct. à 5 h 32 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 5 h 18 et 5 h 19, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 15 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **409,7 M** | **226,2 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **273,5 M** | **154,9 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,07 %** (21,01 à 21,15) | **21,25 %** (21,17 à 21,30) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,69 %** (28,54 à 28,83) | **34,77 %** (34,61 à 34,91) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 369 à 2 418**, cinq jobs | **1 195 à 1 208**, quatre | 2 350 à 2 500 ; 1 180 à 1 260 — dedans |
| cumul appris | **4 519,8 M** | **2 283,1 M** | 4 494 à 4 716 M ; 2 258 à 2 364 M — dedans |

- **le parc** : à 2 500, cinq 7763, un 9V45 (4 260), un Xeon 8370C
  (2 139), un Xeon 8573C (2 291) ; à 5 000, quatre 7763, un 9V45
  (2 093), un 9V74 (1 564), un Xeon 6973P-C (1 749), un Xeon 8573C
  (1 214 — la vitesse lente de la vague 13) ;
- 118 et 119 jobs appris ; le rapport des volumes, × 1,98 ;
- **l'attendu du cumul de la vague 16 s'en déduit** : à 2 500, **4 768 à
  4 990 M** ; à 5 000, **2 413 à 2 519 M**.

**La vague 17 — écrite avant de la lancer**, le 30 oct. à 11 h 07, la
vague 16 finie et pas encore relevée. La même recette, seize jobs, huit
par budget en alternance, 2 500 d'abord, tous appris. *Attendus* — les
seize vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 350 à 2 500** à 2 500,
  **1 180 à 1 260** à 5 000 ;
- **le cumul appris** : celui de la vague 16, relevé après ce paragraphe,
  **plus 248 à 470 M** à 2 500 et **plus 130 à 236 M** à 5 000.

**La vague 16, RELEVÉE le 30 oct. à 11 h 10 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 10 h 57 et 10 h 58, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 16 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **423,7 M** | **208,5 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **283,0 M** | **142,8 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,13 %** (21,03 à 21,23) | **21,23 %** (21,09 à 21,37) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,73 %** (28,68 à 28,75) | **34,77 %** (34,63 à 34,93) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 371 à 2 414**, cinq jobs | **1 188 à 1 218**, six | 2 350 à 2 500 ; 1 180 à 1 260 — dedans |
| cumul appris | **4 802,8 M** | **2 425,9 M** | 4 768 à 4 990 M ; 2 413 à 2 519 M — dedans, à 5 000 près du bas |

- **le parc** : à 2 500, cinq 7763, trois 9V74 (3 140 à 3 154 — la
  vitesse haute) ; à 5 000, six 7763, un 9V45 (2 107), un Xeon 8573C
  (1 169, sous tout ce qu'il rendait jusqu'ici, 1 186 à 1 416) — six 7763
  et un 8573C lent sur huit à 5 000, d'où le volume au bas de l'attendu,
  comme à la vague 14 ;
- 126 et 127 jobs appris ; le rapport des volumes, × 1,98 ;
- **l'attendu du cumul de la vague 17 s'en déduit** : à 2 500, **5 051 à
  5 273 M** ; à 5 000, **2 556 à 2 662 M**.

**La vague 18 — écrite avant de la lancer**, le 30 oct. à 16 h 46, la
vague 17 finie et pas encore relevée. La même recette, seize jobs, huit
par budget en alternance, 2 500 d'abord, tous appris. *Attendus* — les
dix-sept vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 350 à 2 500** à 2 500,
  **1 180 à 1 260** à 5 000 ;
- **le cumul appris** : celui de la vague 17, relevé après ce paragraphe,
  **plus 248 à 470 M** à 2 500 et **plus 130 à 236 M** à 5 000.

**La vague 17, RELEVÉE le 30 oct. à 16 h 48 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 16 h 38 et 16 h 39, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 17 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **564,0 M** | **212,4 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **376,6 M** | **145,5 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,07 %** (21,02 à 21,19) | **21,18 %** (21,03 à 21,31) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,76 %** (28,71 à 28,84) | **34,86 %** (34,66 à 35,07) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 382**, un job | **1 185 à 1 213**, quatre | 2 350 à 2 500 ; 1 180 à 1 260 — dedans |
| cumul appris | **5 179,4 M** | **2 571,4 M** | 5 051 à 5 273 M ; 2 556 à 2 662 M — dedans, à 5 000 près du bas |

- **le parc** : à 2 500, quatre 9V45 (4 030 à 4 292), trois 9V74 (3 174
  à 3 179), un seul 7763 — le volume le plus haut des dix-sept vagues à
  ce budget ; à 5 000, quatre 7763, deux 9V74 (1 231 et 1 586 — ses deux
  vitesses, × 1,29), un 9V45 (2 046), un Xeon 8370C (1 058, le plus lent
  de la vague) ;
- 134 et 135 jobs appris ; le rapport des volumes, × 2,01 ;
- **les gardées tombent dans la moitié basse de leur attendu, vague
  après vague** — lu au registre, les dix-sept : à 5 000, **toutes**,
  136,0 à 175,6 M pour 130 à 236 M écrits (milieu 183) ; à 2 500, seize
  sur dix-sept, 268,4 à 333,0 M pour 248 à 470 M (milieu 359), la vague
  17 la première au-dessus. *Inférence, confiance moyenne* : les bornes
  hautes supposaient plus de runners rapides que le parc n'en donne.
  Rien n'y est faux, et l'attendu reste tel qu'écrit — le resserrer après
  coup le rendrait complaisant ;
- **l'attendu du cumul de la vague 18 s'en déduit** : à 2 500, **5 427 à
  5 649 M** ; à 5 000, **2 701 à 2 807 M**.

**La vague 19 — écrite avant de la lancer**, le 30 oct. à 22 h 26, la
vague 18 finie et pas encore relevée. La même recette, seize jobs, huit
par budget en alternance, 2 500 d'abord, tous appris. *Attendus* — les
dix-huit vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 350 à 2 500** à 2 500,
  **1 180 à 1 260** à 5 000 ;
- **le cumul appris** : celui de la vague 18, relevé après ce paragraphe,
  **plus 248 à 470 M** à 2 500 et **plus 130 à 236 M** à 5 000.

**La vague 18, RELEVÉE le 30 oct. à 22 h 29 — dix chiffres sur douze dans
leur attendu ; les deux autres, le débit d'un EPYC 7763, hors de peu.**
Seize succès, finis à 22 h 17, chaque journal donnant le budget de sa
moitié ; les douze derniers lus nomment `a4a6490` — les quatre premiers,
lus à partir de la ligne du runner, sont partis de la même commande, ce
commit en entrée ; `tools/n22-jobs.tsv`, la vague 18 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **448,3 M** | **219,0 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **299,4 M** | **150,0 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,08 %** (20,88 à 21,26) | **21,19 %** (21,03 à 21,30) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,73 %** (28,65 à 28,85) | **34,81 %** (34,75 à 34,87) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 347 à 2 407**, cinq jobs, moyenne 2 382 | **1 175 à 1 220**, cinq, moyenne 1 204 | 2 350 à 2 500 ; 1 180 à 1 260 — **HORS, chacun par un seul job**, de 3 et de 5 |
| cumul appris | **5 478,7 M** | **2 721,4 M** | 5 427 à 5 649 M ; 2 701 à 2 807 M — dedans, à 5 000 près du bas |

- **les deux débits hors de l'attendu** : 41083834085 (2 347, à 2 500) et
  41083851712 (1 175, à 5 000), les plus bas jamais lus sur un 7763 au
  n° 22 — jusqu'ici 2 369 et 1 182 au plus bas, vagues 1 à 17. Les
  autres 7763 de la vague sont au milieu de leur plage, et tous les jobs
  jouent le même binaire. *Inférence, confiance moyenne* : deux hôtes
  plus lents, pas le générateur. *Fait* : le budget est en nœuds par
  coup — le débit fixe le volume d'un job, pas son étiquette ; les
  données de ces deux jobs s'apprennent comme les autres ;
- **la plage des 7763 a glissé** — lu aux relevés, même binaire : le plus
  haut 7763 de chaque vague valait, à 2 500, **2 422 à 2 477** aux vagues
  1 à 9 (médiane 2 456), **2 382 à 2 431** depuis la vague 10 (médiane
  2 418) ; à 5 000, **1 227 à 1 241**, puis **1 208 à 1 221**. Environ
  1,5 % en quatre jours. *Inférence, confiance faible* : l'image des
  runners ou leur charge — rien ne le vérifie ici, et rien n'en dépend
  que le volume ;
- **la borne basse descend, comme aux vagues 5 et 9** — et pour la
  première vague dont l'attendu n'est pas encore écrit : la **20**,
  celui de la 19 ayant été poussé avant ce relevé. **2 300 à 2 500** à
  2 500 et **1 150 à 1 260** à 5 000. Elle garde ce qu'elle doit garder :
  un générateur construit sans AVX2, × 0,81, tomberait vers 1 940 et
  975 ;
- **le parc** : à 2 500, cinq 7763, un 9V45 (4 263), un 9V74 (3 134), un
  Xeon 6973P-C (3 337) ; à 5 000, cinq 7763, un 9V74 (1 580), un 9V45
  (2 110), un Xeon 8573C (1 353 — une troisième vitesse, après 1 169 à
  1 214 et 1 416) ;
- 142 et 143 jobs appris ; le rapport des volumes, × 2,01 ;
- **l'attendu du cumul de la vague 19 s'en déduit** : à 2 500, **5 727 à
  5 949 M** ; à 5 000, **2 851 à 2 957 M**.

**La vague 20 — écrite avant de la lancer**, le 31 oct. à 4 h 06, la
vague 19 finie et pas encore relevée. La même recette, seize jobs, huit
par budget en alternance, 2 500 d'abord, tous appris. *Attendus* — les
dix-neuf vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 300 à 2 500** à 2 500,
  **1 150 à 1 260** à 5 000 — **les bornes basses descendues** au relevé
  de la vague 18 (2 347 et 1 175, un job chacun sous 2 350 et 1 180),
  comme aux vagues 5 et 9 ;
- **le cumul appris** : celui de la vague 19, relevé après ce paragraphe,
  **plus 248 à 470 M** à 2 500 et **plus 130 à 236 M** à 5 000.

**La vague 19, RELEVÉE le 31 oct. à 4 h 09 — les douze chiffres dans leur
attendu**, aux bornes écrites avant elle (2 350 et 1 180 pour les 7763).
Seize succès, finis à 3 h 57, chaque journal nommant `a4a6490` et le
budget de sa moitié ; `tools/n22-jobs.tsv`, la vague 19 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **456,5 M** | **206,7 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **304,8 M** | **141,5 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,09 %** (20,96 à 21,16) | **21,19 %** (21,08 à 21,32) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,72 %** (28,64 à 28,77) | **34,82 %** (34,64 à 34,92) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 393 à 2 408**, trois jobs | **1 193 à 1 217**, cinq | 2 350 à 2 500 ; 1 180 à 1 260 — dedans |
| cumul appris | **5 783,5 M** | **2 862,9 M** | 5 727 à 5 949 M ; 2 851 à 2 957 M — dedans, à 5 000 près du bas |

- **le parc** : à 2 500, trois 7763, deux 9V45 (4 222 et 4 469), deux
  Xeon 8573C (2 373 et 2 579), un Xeon 8370C (2 210) ; à 5 000, cinq
  7763, trois 9V74 (1 250, puis 1 574 et 1 585 — ses deux vitesses) ;
- les deux débits sous la borne à la vague 18 ne se sont pas reproduits :
  les 7763 de la vague 19 sont au milieu de leur plage ;
- 150 et 151 jobs appris ; le rapport des volumes, × 2,02 ;
- **l'attendu du cumul de la vague 20 s'en déduit** : à 2 500, **6 031 à
  6 253 M** ; à 5 000, **2 993 à 3 099 M**.

**La vague 21 — écrite avant de la lancer**, le 31 oct. à 9 h 47, la
vague 20 finie et pas encore relevée. La même recette, seize jobs, huit
par budget en alternance, 2 500 d'abord, tous appris. *Attendus* — les
vingt vagues :
- **les huit à 2 500 : 370 à 700 M positions, 248 à 470 M gardées** ;
  **les huit à 5 000 : 190 à 345 M positions, 130 à 236 M gardées** ;
- **écartées 20,8 à 21,6 %** aux deux budgets ; **nulles 28,4 à 29,0 %**
  à 2 500, **34,5 à 35,1 %** à 5 000 ;
- **positions par seconde sur un EPYC 7763 : 2 300 à 2 500** à 2 500,
  **1 150 à 1 260** à 5 000 ;
- **le cumul appris** : celui de la vague 20, relevé après ce paragraphe,
  **plus 248 à 470 M** à 2 500 et **plus 130 à 236 M** à 5 000.

**La vague 20, RELEVÉE le 31 oct. à 9 h 49 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 9 h 37 et 9 h 38, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 20 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **514,8 M** | **240,9 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **343,7 M** | **165,0 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,06 %** (20,97 à 21,20) | **21,17 %** (21,02 à 21,24) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,78 %** (28,63 à 28,88) | **34,80 %** (34,71 à 34,89) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 382 à 2 399**, trois jobs | **1 205 et 1 212**, deux | 2 300 à 2 500 ; 1 150 à 1 260 — dedans |
| cumul appris | **6 127,2 M** | **3 027,9 M** | 6 031 à 6 253 M ; 2 993 à 3 099 M — dedans |

- **le parc** : à 2 500, trois 7763, trois 9V45 (4 155 à 4 527), deux
  9V74 (2 489 et 3 183 — ses deux vitesses) ; à 5 000, deux 7763, deux
  9V45 (2 125 et 2 151), deux 9V74 (1 569 et 1 584), un Xeon 8370C
  (1 107), un Xeon 8573C (1 214) — deux 7763 seulement à 5 000, d'où un
  volume plus haut qu'aux vagues 14 à 19 (165,0 M gardés, le troisième
  des vingt, après les vagues 13 et 7) ;
- les bornes descendues au relevé de la vague 18 n'ont servi à rien
  ici : les 7763 sont au milieu de leur plage, au-dessus même des
  anciennes bornes ;
- 158 et 159 jobs appris ; le rapport des volumes, × 2,02 ;
- **l'attendu du cumul de la vague 21 s'en déduit** : à 2 500, **6 375 à
  6 597 M** ; à 5 000, **3 158 à 3 264 M**.

**La vague 21, RELEVÉE le 31 oct. à 15 h 28 — les douze chiffres dans leur
attendu.** Seize succès, finis entre 15 h 18 et 15 h 19, chaque journal
nommant `a4a6490` et le budget de sa moitié ; `tools/n22-jobs.tsv`, la
vague 21 :

| | à 2 500 nœuds | à 5 000 nœuds | attendu, écrit avant |
|---|---|---|---|
| positions, les huit | **443,3 M** | **207,4 M** | 370 à 700 M ; 190 à 345 M — dedans |
| gardées, tous appris | **295,9 M** | **142,1 M** | 248 à 470 M ; 130 à 236 M — dedans |
| parties écartées, sur les gardées | **21,09 %** (20,95 à 21,18) | **21,20 %** (21,09 à 21,30) | 20,8 à 21,6 % — dedans |
| nulles, sur les gardées | **28,74 %** (28,69 à 28,80) | **34,84 %** (34,74 à 34,94) | 28,4 à 29,0 % ; 34,5 à 35,1 % — dedans |
| positions par seconde, EPYC 7763 | **2 326 à 2 408**, quatre jobs | **1 199 à 1 215**, six | 2 300 à 2 500 ; 1 150 à 1 260 — dedans |
| cumul appris | **6 423,2 M** | **3 170,0 M** | 6 375 à 6 597 M ; 3 158 à 3 264 M — dedans |

- **le parc** : à 2 500, quatre 7763, deux 9V45 (4 008 et 4 086), un
  9V74 (2 491), un Xeon 8573C (2 288) ; à 5 000, six 7763, un 9V45
  (2 103), un Xeon 8370C (1 117) ;
- les gardées tombent encore dans la moitié basse de l'attendu : les
  vingt et une vagues à 5 000, vingt sur vingt et une à 2 500 — vérifié
  au registre ;
- 166 et 167 jobs appris, 9 593,1 M gardées pour le n° 22 ; le rapport
  des volumes, × 2,03.

**La génération est EN PAUSE après la vague 21** (31 oct., feuille de
route validée par Théo le même jour, point 1 ; la raison est la ligne
« plus de données encore » de « La file ») : ~15,1 G gardées en stock —
3,71 G vues par N9w50s800, 1,75 G du n° 21, 9,59 G du n° 22 —, ~4 fois
ce qu'a vu le réseau qui joue ; c'est la carte qui borne l'entraînement,
plus les données. Elle reprendra étiquetée par le réseau qui sortira de
C3, au rythme que la carte consomme (point 6). Rien n'est en vol.

**Après elle** : la séance des trois réseaux (E5n, E2.5v, E2.5t) s'écrit
pour la carte de Théo, la semaine suivante — il n'a plus de portable
cette semaine — <s>s'écrit</s> **écrite le 27 oct. à 19 h 27** (« La
séance du n° 22 », `tools/seance-n22.sh`). Les runners, eux, ne s'arrêtent pas : la génération
continue aux deux budgets, en vagues de seize, en attendant le verdict
qui choisira le budget de la suite — les données servent dans les deux
cas, le volume payant encore (+8,94 ± 3,32).

**Les attendus des matchs**, écrits dès maintenant pour qu'aucun relevé ne
les précède — chacun quatre jobs de 2 800 parties à `8+0,08` :
- **E2.5v contre E5n** : **−6 à +3, ~−1** — à 10 000 contre 5 000,
  l'étiquette ne rendait rien (−1,49) ; une recherche deux fois plus
  courte peut perdre davantage qu'elle ne gagnait à doubler ;
- **E2.5t contre E5n** : **+1 à +12, ~+6** — doubler le volume à
  étiquette égale rendait +8,94, moins ce que l'étiquette perd ;
- **E21 contre N8nw50** — le tour de boucle, **écrit le 2 nov. avant
  tout entraînement** : **0 à +9, ~+5**. La même recette, le même
  budget (5 000), le même volume gardé (1 752,5 M contre 1 751,9 M) ;
  seul l'étiqueteur change, N8tw50s800 contre N6r4, ~+40 par la chaîne
  (+16,89, +17,91, +5,43). Au taux mesuré deux fois, ~0,12 Elo de
  réseau par Elo d'étiqueteur (0,09 à 0,16 au seul +12,76 ± 3,45 de
  N8nw50 sur N7p4w50) : +4 à +7 ; élargi vers le bas parce que la
  chaîne n'est pas additive et que l'étiqueteur cherche à 5 000 nœuds,
  pas à la pendule. <span>Inférence, confiance faible.</span> **Ce
  qu'il décide** : si sa borne basse passe zéro, chaque réseau embarqué
  réétiquette la génération qui suit, et les données des vieux
  étiqueteurs se remplacent avant de s'empiler ; sinon, le volume seul
  compte et rien ne presse de régénérer. **La puissance** : à ± 3,3, un
  vrai +5 passe zéro environ huit fois sur dix.

**Concurrence** : seize jobs, plus les sept de la vague 6 du n° 21
jusqu'à ~19 h 40, plus les matchs de la séance C2 à venir — sous la
limite de quarante.

#### La séance du n° 22 — E5n, E2.5t, E2.5v, et E21 depuis le 2 nov. : écrite le 27 oct. à 19 h 27, pour la semaine du 2 nov.

**`tools/seance-n22.sh`**, sur le modèle de `tools/seance-n20d.sh`,
l'option `veille` comprise. Trois réseaux à la recette de C1 — 256
unités, quatre seaux de roi, huit de sortie, **400 superlots**, poids du
résultat 0,5, pas 0,001 —, chacun poussé sur `reseau/n22` dès qu'il
passe tous ses contrôles :
- **`e5nw50`** — les 39 jobs appris à 5 000 ; puis
- **`e25tw50`** — les 38 à 2 500 : la décision, contre le premier ;
- **`e25vw50`** — les 19 premiers à 2 500 : l'étiquette seule ;
- **`e21w50`**, **ajouté le 2 nov.** (feuille de route du 31 oct.,
  point 4) — la tranche du n° 21 entière, 86 jobs à 5 000 étiquetés par
  N8tw50s800 : **le tour de boucle**, contre N8nw50, la même recette sur
  l'étape B étiquetée par N6r4. Le dernier : il ne décide pas le budget,
  il dit comment reprendre la génération. N8nw50 est sorti de
  l'entraîneur d'avant `00c65d3`, dont les options neuves gardent la
  recette par défaut — C1 l'a déjà pris pour témoin de E10w50 sur cette
  base. Ses données vont sous `donnees/n21/`, là où `tools/seance-c3.sh`
  les reprendra.

Les ensembles sont ceux fixés à la clôture de la partie mesurée — le
script ne lit du registre que les vagues 1 à 5, si bien que les vagues
suivantes, ajoutées à `tools/n22-jobs.tsv`, n'y changent rien. **Ses
contrôles** : ceux des séances C, et la ligne de recette ENTIÈRE —
`400 superlots, pas 0.001 → 2.4300007e-6, wdl 0.5 → 0.5, perte ^2, lot
16384, ply ≥ 16`, retrouvée à l'octet dans la sortie de E10w50 ; la
relecture à l'octet de chaque ensemble (`--attendu`, les sommes du
registre) ; 152 et 156 fichiers `.vf` ; 20 Go libres sous les données,
moins ce qui y est déjà. **Éprouvé au bac à sable le 27 oct.**, avec des
`cargo`, `gh`, `systemd-inhibit`, `busctl` et `systemctl` factices :
77, 39, 38 et 19 dossiers passés à l'entraîneur, le 19ᵉ étant
40429538917 ; trois réseaux poussés, puis la veille demandée, le blocage
levé ; une relance qui saute ce qui est poussé ; une panne au deuxième
réseau, puis la relance qui ne refait que lui ; une recette refusée, le
réseau mis de côté ; deux lignes de la vague 6 au registre sans effet
sur les ensembles ; un mode ou une option inconnus refusés. **Le 4ᵉ
réseau, éprouvé au même bac à sable le 2 nov.**, un faux `df` en plus :
86 dossiers et `20442765:2561308398` à l'entraîneur, le dernier
40325880490 ; 344 fichiers `.vf` ; un second essai court, sur le n° 21 ;
32 Go exigés quand les deux générations partagent un disque — refusé à
31 —, 20 et 12 sinon — refusé à 15 sous le n° 22 ; une panne de
`e21w50` après les trois autres, la veille quand même demandée, le
blocage levé, puis la relance qui saute les trois poussés et ne refait
que lui.

**Pour Théo, la semaine du 2 nov.** :
```sh
cd ~/shallowred/chess
git fetch origin && git switch main && git pull --ff-only
tmux new -s n22 'bash tools/seance-n22.sh tout veille'
```
— l'essai court passe d'abord, et rien ne se lance s'il échoue.

*Attendus, écrits avant* — <span>inférence, confiance faible sauf la
durée</span> :
- **la durée** : ~2 h 40 par réseau, comme E10w50 et E5vw50 à 400
  superlots — ~11 h 30 pour les quatre, les deux essais compris, plus
  le téléchargement de ~12 Go et ~9,3 Go ;
- **la confrontation** : le critère, écart médian ≤ 15, maximal ≤ 50 ;
- **la perte tenue à l'écart** (`nnue-validation.yml`, N9w50s800 en
  référence, les deux jobs tenus du n° 22, 40326139016 et 40326149256) :
  **E2.5t sous E5n sur le job à 2 500**, deux fois son volume à sa propre
  étiquette ; **E5n sous E2.5v sur le job à 5 000**, à volume égal sur sa
  propre étiquette. Rien n'est attendu contre N9w50s800, deux fois plus
  de passes sur d'autres étiquettes ; et la perte ne décide rien. **E21
  sous N8nw50 sur le job tenu du n° 21** (39712871836), sa propre
  étiquette, **au-dessus sur celui de l'étape B** (39050360980) ;
- **les matchs** : écrits plus haut — E2.5v contre E5n −6 à +3,
  E2.5t contre E5n +1 à +12, E21 contre N8nw50 0 à +9, chacun quatre
  jobs de 2 800 parties à
  `8+0,08`, les candidats écrits et révoqués comme ceux de C2.

**Le critère reste celui écrit à l'ouverture du n° 22.** Aucun de ces
réseaux n'est candidat à l'embarquement — 400 superlots, la moitié des
passes de N9w50s800 : ils mesurent un budget, pas un réseau.
**Ensuite, C3** (« La séance C3 — le chiffrage ») : ses données en
dépendent, et sa base N10, entraînée sur les mêmes, la rend juste dans
les deux cas.

#### La séance du n° 22 — E2.5t contre E5n : VERDICT, relevé le 6 nov. à 2 h — 2 500 nœuds remplacent 5 000

**La séance**, lancée par Théo le 5 nov. au matin : le téléchargement
(77 jobs du n° 22, puis 86 du n° 21), puis quatre réseaux poussés sur
`reseau/n22`, tous contrôles passés — e5nw50 à 17 h 51, e25tw50 à
20 h 28, e25vw50 à 23 h 07, e21w50 le 6 nov. à 1 h 45 ; confrontation
(médian, maximal) 7 et 20, 8 et 16, 7 et 15, 6 et 26. Chacun intégré à
`reseaux/` et écrit en candidat révoqué aussitôt (`tools/README.md`, EN
VOL).

**Le match** — E2.5t (`2478c91`) contre E5n (`339c179`), quatre jobs de
2 800 parties à `8+0,08`, lancés le 5 nov. à 20 h 45, finis le 6 entre
1 h 40 et 1 h 43, **aucune perte au temps**, 6,28 à 6,33 s par partie :

| job | runner | n/s au banc | profondeur en 250 ms | Elo |
|---|---|---|---|---|
| 42096910633 | EPYC 9V74 | 1 302 974 | 14 | **+15,27 ± 6,67** |
| 42096924398 | EPYC 9V74 | 1 048 014 | 13 | **+7,82 ± 6,74** |
| 42096937549 | EPYC 7763 | 1 031 090 | 13 | −0,12 ± 6,74 |
| 42096951976 | EPYC 7763 | 1 090 287 | 13 | +0,12 ± 6,58 |

En commun : **+5,77 ± 3,34** sur 11 200 parties — **non homogènes**
(p = 0,008 ; le job 1 contre les jobs 3 et 4, z = 3,18). Dans l'attendu
(+1 à +12).

**L'écart, lu dans l'étalonnage et non expliqué** : les deux EPYC 9V74
rendent +15 et +8, les deux EPYC 7763 rendent zéro ; le plus rapide,
seul à la profondeur 14, rend le plus. Deux contre deux ne démontrent
rien. <span>Inférence, confiance faible</span> : une étiquette moins
profonde paierait davantage là où l'on cherche plus loin.

**Le critère, écrit le 26 oct.** (« N° 22 ») : 2 500 remplace 5 000 pour
les tranches suivantes si E2.5t contre E5n a sa borne basse au-dessus de
zéro. **En commun, +2,43 : il passe.** Lu job par job, comme le veut un
mélange non homogène, deux jobs le passent seuls (bornes basses +8,60
et +1,08) et **aucun ne le contredit** : les deux autres sont à zéro,
leurs bornes hautes au-dessus de +6,4. **2 500 NŒUDS REMPLACENT 5 000**
pour les tranches suivantes ; au registre, **1 250 au test suivant**,
comme écrit. À temps de runner égal, le volume l'emporte sur la
profondeur de l'étiquette.

**Ce qui reste du n° 22** : E2.5v contre E5n, l'étiquette seule à
volume égal (en vol, attendu −6 à +3) ; E21 contre N8nw50, le tour de
boucle (en vol, attendu 0 à +9) ; puis **les données de C3**
(`tools/c3-donnees.tsv`), qui en dépendent.

#### La séance du n° 22 — E2.5v et E21 : VERDICT, relevé le 6 nov. à 7 h 20 — l'étiquette ne se sépare pas, le tour de boucle paie

**E2.5v contre E5n** — l'étiquette à 2 500 contre 5 000, **à volume
égal** (`5936201` contre `339c179`) ; quatre jobs lancés le 5 nov. à
23 h 20, finis le 6 entre 4 h 11 et 4 h 19, **aucune perte au temps** ;
**les quatre sur EPYC 7763**, profondeur 13 : −2,36, −6,70, **+7,82**,
−4,96. En commun **−1,55 ± 3,40** sur 11 200 parties, **non homogènes**
(p = 0,016 ; le job 3 contre le job 2, z = 2,96) — dans l'attendu (−6 à
+3). **Rien de démontré** : aucun job ne met sa borne haute sous zéro
(le plus bas, −6,70 ± 6,93). *À volume égal, l'étiquette à 2 500 ne se
distingue pas de celle à 5 000* : le gain de E2.5t est le volume, comme
la perte tenue à l'écart le disait. Et **cette hétérogénéité-ci vient de
quatre runners du même modèle**, à la même profondeur : elle affaiblit
l'explication par le processeur avancée pour E2.5t.

**E21 contre N8nw50** — le tour de boucle : la tranche du n° 21,
étiquetée par N8tw50s800, contre l'étape B étiquetée par N6r4, au même
volume gardé et à la même recette (`2634f81` contre `06d0473`, le même
code moteur) ; quatre jobs lancés le 6 nov. à 2 h 05, finis entre 6 h 54
et 7 h 01, **aucune perte au temps** — 7763, 9V74, 7763, 7763, tous à la
profondeur 14 : +7,57, +12,91, +11,17, +8,94. En commun **+10,15 ± 3,33**
sur 11 200 parties, **homogènes** (p = 0,682) — **au-dessus de l'attendu**
(0 à +9). **Le tour de boucle paie, démontré** : un étiqueteur meilleur de
~+40 (N8tw50s800 sur N6r4, par la chaîne) rend +10 au réseau à volume
égal — le même ordre que N6r4 sur N5l (+12,76, n° 20). La perte tenue à
l'écart le disait déjà, chacun sous l'autre sur sa propre étiquette.

**Ce que cela dit pour la suite** :
- **la génération** reprend étiquetée par le réseau qui joue, à 2 500
  nœuds (feuille de route, point 6) ;
- **les données de C3** : les étiquettes de N6r4 (n20, n20e) valent
  ~10 de moins que celles de N8tw50s800 à volume égal, et celles de
  N9w50s800 (n22) au moins autant de mieux, par la même pente ; la moitié
  étiquetée par N5l n'ajoutait rien à passes égales (+0,25 ± 4,71) et
  prenait des passes aux bonnes à superlots égaux (−5,18). D'où une
  troisième option pour C3, sans les étiquettes de N6r4 — la décision
  revient à Théo, qui en paie le téléchargement. **Choisie le 6 nov. :
  l'option C** (« La séance C3, les données »).

### N° 23 — l'historique borné (phase 4) : protocole et attendus, écrits le 2 nov. avant de mesurer

**La décision** — la feuille de route validée par Théo le 31 oct., point 2 :
la phase 4 au reset, l'historique borné d'abord, puis la LMR modulée et
l'élagage par l'historique — les deux fermés à l'écran du 7 oct. faute
d'échelle (n° 12, « L'échelle de l'historique n'est pas bornée »).

**Ce qu'est l'historique aujourd'hui** (`search.rs`, lu le 2 nov.) : le
papillon (`64 × 64`, sans la couleur) et la continuation à un et deux plis
gagnent `d²` à chaque coupure par un tranquille ; les tranquilles cherchés
avant le coupeur perdent `d²` (C49) ; une table se divise par deux quand
une note passe ±800 000. Le papillon se vide à chaque `go`, la
continuation non (A20). Aucune règle de la recherche ne lit la note, hors
l'ordre des tranquilles.

**La référence extérieure, lue dans son source** (`sf_16`, `movepick.h` et
`search.cpp`, 2 nov.) : la gravité `note += b − note·|b|/D` ; le bonus
`min(336·d − 547, 1561)` ; le plafond 7 183 au papillon, 29 952 à la
continuation ; la LMR `r −= (2·papillon + trois continuations − 4006) /
(11124 + …)` ; l'élagage d'un tranquille dont la somme des continuations
passe sous `−3832·d`, à faible profondeur réduite. Stockfish ne vide pas
son papillon entre deux coups. À sa profondeur 1, son bonus est négatif :
la sonde le borne à 1.

**La sonde** — un binaire de MESURE (`N23`, variantes combinables par
`+`) ; sans elle, `main` au nœud près — le banc à la profondeur 10 rend
376 089 nœuds des deux côtés :
- `g:D` — la gravité, plafond `D` aux deux tables, sans division ;
  `gc:D` — un plafond propre à la continuation ;
- `lin:A:B:C` — le bonus et le malus valent `clamp(A·d − B, 1, C)` ;
- `hk` — le papillon conservé d'un `go` à l'autre ;
- `lmrh:K` — la réduction d'un tranquille diminue de sa note / `K`, ou
  augmente si elle est négative, bornée à `[0, d − 2]` ;
- `hp:T` — un tranquille de note sous `−T·d` se saute, profondeur ≤ 4,
  gardes de la futilité aux frontières ; `hpo:T`, le même en ombre : les
  sautés comptés, et ceux d'entre eux qui, cherchés, montent `alpha`.

**Le journal** : 60 parties neuves de `main` à `701b609` contre lui-même,
`8+0,08`, le livre de 15 000, graine 20261102, binaire AVX2 — le journal
du cinquième écran est perdu avec son conteneur. Rejoué à la profondeur
10 et 12, deux flux par partie, un par camp, table et historiques
conservés d'un coup à l'autre (`rejouer.py`, dans la rustine).

**Attendus, écrits avant** — <span>inférence, confiance faible</span>, à
la profondeur 12, contre `main` :
- `g:16384` — la borne seule, le bonus de `main` : **± 1 %**. Aux
  profondeurs jouées, les notes restent loin d'un tel plafond — le banc à
  la profondeur 10 n'en bouge que de −0,2 % à `g:4096` ;
- `g:7183+gc:29952+lin:336:547:1561` — les échelles de Stockfish 16, que
  la suite appellera **G** : **−5 à +8 %**. Le bonus devient grand devant
  le plafond, l'historique se souvient du récent ;
- **G+`hk`** : **−3 à +5 %** sur G ; sans gravité, A20 trouvait +4,4 % au
  papillon conservé ;
- **G+`lmrh:11000`** : **−10 à +10 %** sur G — moins réduire les bien
  notés, plus les mal notés ; **G+`lmrh:6000`** : le double de l'effet ;
- **G+`hp:3832`** : **−1 à −6 %** sur G ; en ombre, **3 à 15 %** des
  sautés montent `alpha`.

**Ce que l'écran décide** :
- **un candidat de gravité quel que soit son arbre** — c'est la
  condition des deux lignes suivantes, et un changement d'ordre ; le
  plus petit arbre parmi `g:16384`, G et G+`hk`, sauf si un autre ne
  s'en distingue pas de plus de 1 % : alors le plus simple ;
- **la LMR modulée** candidate si elle déplace l'arbre de plus de 2 % ;
- **l'élagage par l'historique** candidat si son économie dépasse dix
  points d'arbre par point de dégâts — la futilité et l'élagage par
  compte en achetaient 11 à 15, C40, qui a régressé, 5 ;
- chaque candidat **joué deux fois** : quatre jobs de 2 800 parties à
  `8+0,08` sur le livre de 15 000, et les mêmes sur un livre déséquilibré
  — sa calibration (« le débit de mesure », point 1), écrite avant ses
  matchs ;
- une seconde série, si la première l'appelle, se dit **ajoutée après
  lecture**, avec ses raisons.

### N° 23, l'écran — RELEVÉ le 2 nov. : deux candidats de gravité et la LMR modulée ; l'élagage par l'historique fermé à nouveau

**Le rejeu** — les 60 parties du journal, 7 030 recherches, à la
profondeur 10 et 12 : `main` rend **109 814 229** et **278 235 761**
nœuds, la sonde sans variante les mêmes au nœud près. ~20 s par série à
la profondeur 10, ~60 s à la 12, quatre processus. **Deux séries** :
celle du protocole, puis une seconde **ajoutée après lecture de la
première**, pour trois raisons écrites alors — le dénominateur des
dégâts manquait à la règle de l'élagage ; la LMR modulée et l'élagage
n'avaient été mesurés que sur G, quand la base la plus petite est
G+`hk` ; et l'échelle sous G dérive encore avec la profondeur (la LMR
modulée change 0,88 % des réductions à la 10, 2,49 % à la 12, à
`lmrh:11000`).

| variante | l'arbre à 12 (à 10), contre `main` | sur sa base | attendu, écrit avant | lecture |
|---|---|---|---|---|
| `g:16384` | **−0,22 %** (+0,98 %) | — | ± 1 % | tient |
| G | **−0,38 %** (+1,50 %) | — | −5 à +8 % | tient |
| G+`hk` | **−0,91 %** (+0,12 %) | −0,53 % sur G | −3 à +5 % sur G | tient |
| G+`lmrh:11000` | +0,97 % (+1,19 %) | **+1,36 %** sur G ; 2,49 % des réductions changées | −10 à +10 % | tient |
| G+`lmrh:6000` | +3,25 % (+3,78 %) | **+3,64 %** sur G ; 12,4 % changées | le double | tient |
| G+`hp:3832` | −1,29 % (+0,85 %) | **−0,92 %** sur G ; en ombre, 12,4 % des sautés montent `alpha`, **0,150 %** des montées d'`alpha` détruites | −1 à −6 % ; 3 à 15 % | l'économie juste sous sa plage |
| G+`hk`+`hp:3832` *(2ᵉ série)* | +0,19 % (+0,60 %) | **+1,11 %** sur G+`hk` ; 0,268 % des montées détruites | — | l'arbre GROSSIT |
| G+`hk`+`lmrh:6000` *(2ᵉ série)* | −0,91 % (+0,22 %) | **+0,001 %** sur G+`hk` ; **34,6 %** des réductions changées | — | une réallocation |

**Ce que l'écran décide** — avec deux écarts à la règle écrite avant,
nommés :
- **l'élagage par l'historique, fermé sous cette forme** — par la règle
  écrite : 0,92 point d'arbre pour 0,150 point de dégâts, **6,1 par
  point** à la 12 (9,7 à la 10), sous le seuil de 10 ; sur G+`hk`, l'arbre
  grossit. *Sous cette forme* : la note y somme le papillon et les deux
  continuations ; Stockfish ne lit que ses continuations, à une
  profondeur réduite. Au registre, déprioritisé ;
- **la gravité, par la règle : `g:16384`** — les trois à moins d'un
  point du plus petit, donc le plus simple. **Et G+`hk` ajouté après
  lecture** : `g:16384` ne borne rien aux profondeurs jouées — les notes
  restent loin de son plafond, et c'est le bonus en `d²`, sans borne, qui
  fait encore l'échelle ; il ne peut pas servir de base à une règle qui
  lit la note. G+`hk` a le plus petit arbre et porte la LMR modulée ;
- **la LMR modulée, candidate contre la règle écrite** — elle demandait
  « plus de 2 % d'arbre » : sur G+`hk`, `lmrh:6000` change **un tiers**
  des réductions pour un arbre identique. La règle comptait COMBIEN on
  cherche quand le changement déplace OÙ — la leçon de C24, mesurée le
  24 sept., indépendante de ce changement (`CLAUDE.md`, « Une
  réallocation à temps constant ne se lit pas en plis moyens ») : la
  règle mesurait la mauvaise chose, et c'est elle qui tombe.

Le journal, la sonde et son rejoueur : `tools/attic/n23-sonde-historique.patch`.

### N° 23 — les candidats C52, C53, C54 : attendus et critère, écrits le 2 nov. avant de lancer

**Les candidats**, chacun au nœud près de sa variante au rejeu à la
profondeur 10, commité puis révoqué aussitôt, sa rustine à l'attic :
- **C52** `141fb43` — `g:16384` : la gravité au plafond 16 384 aux deux
  tables, le bonus `d²` inchangé, plus de division ; le banc inchangé
  (70 452) ;
- **C53** `cde63e6` — G+`hk` : bonus `clamp(336·d − 547, 1, 1561)`,
  plafonds 7 183 et 29 952, le papillon conservé d'un coup à l'autre ;
  banc 70 845 ;
- **C54** `822fb74` — C53 et la LMR modulée, `note / 6000` plis, bornée
  à `[0, d − 2]` ; banc 70 841.

**Le protocole** — celui des écrans du n° 12 : quatre jobs de 2 800
parties par match, `8+0,08`, graine « auto » chacun, le binaire AVX2 des
deux côtés, le livre de 15 000. **C52 et C53 contre `0e43fdd`** — leur
parent, le moteur de `main` au bit près ; **C54 contre C53**, pour isoler
la LMR modulée de la gravité qui la porte. Douze jobs, lancés ensemble.

**Attendus, écrits avant** — <span>inférence, confiance faible</span> ;
le coût d'arbre par l'étalon, 1,38 pli par doublement, 60 à 105 Elo par
pli :
- **C52** : −0,22 % d'arbre, un gain de ~+0,3 si la décision ne bougeait
  pas ; la borne ne joue presque jamais ; **−3 à +3, ~0** ;
- **C53** : −0,91 %, **+1 à +2** à décision égale ; l'ordre des
  tranquilles devient récent, et Stockfish l'a choisi ; **−5 à +10,
  ~+2** ;
- **C54 contre C53** : l'arbre égal ; une réallocation, dont le sens ne
  se lit pas à l'écran — Stockfish étiquette la sienne « ~25 Elo » dans
  son source, sur une LMR et une note différentes ; **−8 à +15, ~+4**.

**Critère, écrit avant** — chaque match par la borne basse commune de
ses quatre jobs, ± 3,3 :
- **C53 fusionne** si sa borne basse contre `0e43fdd` est au-dessus de
  zéro ; **C52**, de même, s'il n'est pas sous C53 au point ;
- **C54 fusionne** — C53 compris — si sa borne basse contre C53 est
  au-dessus de zéro ET si C53 n'est pas démontré sous `0e43fdd` (sa
  borne haute au-dessus de zéro) : la LMR modulée n'existe pas sans la
  gravité qui lui donne son échelle ;
- **sinon, rien** : C52 et C53 seuls ne valent que comme base de C54,
  si aucun ne gagne et que C54 ne gagne pas, rien n'entre.

**Le livre déséquilibré** (« Ce que l'écran décide », plus haut) : ses
matchs suivent dès qu'il existe, son protocole écrit avant eux. Ceux-ci
partent sans attendre — les runners sont libres, et la calibration ne
demande pas que les deux séries jouent en même temps.

### N° 23 — C52, C53, C54 : VERDICT, relevé le 2 nov. à 16 h 10 — C54 fusionné, C53 compris

**Les douze matchs**, lancés à 10 h 55, finis entre 15 h 50 et 16 h 05,
2 800 parties chacun, **aucune perte au temps**, 6,29 à 6,61 s par
partie ; mis en commun par `tools/mettre-en-commun.sh` :

| candidat | contre | les quatre jobs | en commun | attendu, écrit avant |
|---|---|---|---|---|
| **C52**, `g:16384` | `0e43fdd` | +8,44, −0,12, +3,35, −3,10 | **+2,14 ± 3,06**, homogènes | −3 à +3 — dedans |
| **C53**, G+`hk` | `0e43fdd` | +12,17, +12,91, +15,15, +17,39 | **+14,40 ± 3,08**, homogènes (p = 0,641) | −5 à +10 — **dépassé** |
| **C54**, la LMR modulée | C53 | +25,61, +20,50, +21,74, +24,86 | **+23,18 ± 3,15**, homogènes (p = 0,677) | −8 à +15 — **dépassé** |

**Le critère, écrit avant** : C54 fusionne, C53 compris, si sa borne
basse contre C53 passe zéro (+20,03) et si C53 n'est pas démontré sous
`main` (sa borne haute, +17,48) — **les deux clauses tiennent**. C52
n'entre pas : sa borne basse est sous zéro. **Fusionné le 3 nov.** par
la révocation de la révocation, après le balayage de mutation du
candidat — vert, tous les plafonds tenus (run 41468563729). Banc 70 841
à la profondeur 7. **~+37 Elo sur `main` par la chaîne** (+14,40 puis
+23,18), sans mesure directe.

**Ce que ça dit** :
- **la borne seule ne fait rien, l'échelle fait tout** : `g:16384` ne
  touche presque aucune note aux profondeurs jouées, et rend ~0 ; le
  bonus grand devant le plafond — l'historique qui se souvient du récent
  — rend +14. *Le gain de C53 n'est pas la borne, c'est la mémoire
  courte* ; <span>inférence, confiance moyenne</span> — le papillon
  conservé y est mêlé, et rien ne les sépare ;
- **la LMR modulée rend +23 à arbre égal** — l'ordre du malus
  d'historique (+25,3, 7 oct.). Son écran
  disait « +0,001 % d'arbre » : **le critère écrit avant l'aurait fermée**,
  et c'est l'écart nommé alors qui l'a gardée (« N° 23, l'écran ») — la
  leçon de C24, une réallocation ne se lit pas en arbre, rejouée ici en
  Elo ;
- **les deux attendus ont été dépassés d'un facteur deux** : le coût
  d'arbre par l'étalon ne dit rien d'un changement d'ordre ou de
  réallocation — huitième occurrence au registre « c'est plus fort ».

**Ensuite** — au registre des réglages ouverts (« La file ») : le
diviseur de la LMR modulée (6 000) et les échelles de la gravité, jamais
réglés ici ; l'élagage par l'historique sous la forme de Stockfish ; et
le livre déséquilibré, dont ces deux effets connus deviennent la
calibration.

### N° 23 — le livre déséquilibré : protocole, écrit le 2 nov. avant son pilote et ses matchs

**La question** — « le débit de mesure », point 1 (phase 7, inscrit le
29 oct.) : un livre d'ouvertures déséquilibrées, comme celui de Fishtest
<span>(de mémoire, confiance moyenne)</span>, rend-il plus d'information
par partie que le nôtre ? Chaque ouverture se joue des deux côtés : le
camp favorisé gagne le plus souvent, et l'information vient des paires où
l'un des deux moteurs convertit et l'autre non. *Marge estimée à
l'inscription : × 1,5 à × 3 de parties en moins à précision égale,
confiance faible.*

**Le livre** :
- **le réservoir** : 80 000 positions de `bookgen`, 8 demi-coups au
  hasard, l'évaluation statique faite main à ± 600 au plus, graine
  20261102 — un autre tirage que `tools/book.epd` ;
- **la note** : une recherche de `main` à `701b609`, binaire AVX2, le
  réseau qui joue, profondeur 12, table vidée entre deux positions ; le
  score du point de vue des Blancs, en unités du réseau ;
- **le pilote, dans le conteneur** : trois bandes de `|score|`, [150,
  250), [250, 400) et [400, 600) ; 150 positions tirées au hasard dans
  chacune, chacune jouée des deux côtés, `main` contre lui-même à
  `8+0,08` — 300 parties par bande. **La bande retenue** est celle dont
  le camp favorisé marque le plus près de **75 %** : une victoire sur deux
  et une nulle sur deux, la cible d'un livre de Fishtest <span>(de
  mémoire, confiance moyenne)</span> ;
- **le livre** : 15 000 positions de la bande retenue — toutes si elle en
  compte moins —, dans un ordre tiré au hasard, `tools/book-desequilibre.epd` ;
  `match.yml` le prend par l'entrée `livre`, le défaut restant
  `tools/book.epd`.

**La calibration** — un effet CONNU, joué sur les deux livres : `main`
contre lui-même, le candidat à `10+0,10` et la référence à `8+0,08` —
× 1,25 de temps, 0,32 doublement, **~+35 Elo** par l'étalon sur notre
livre. Deux jobs de 2 800 parties par livre. **La mesure** : par paire,
`t = (score moyen − ½) / écart type`, lu sur la somme des comptes
pentanomiaux ; **le rendement** est `(t_déséquilibré / t_équilibré)²` —
combien de fois moins de paires pour la même précision. Les Elo des deux
livres ne se comparent pas : un livre déséquilibré change l'échelle, pas
le signe. Et C53 contre `0e43fdd`, C54 contre C53, quatre jobs chacun sur
le livre déséquilibré — un second témoin des mêmes effets, lu en signe et
en `t`.

*Attendus, écrits avant* — <span>inférence, confiance faible</span> :
- la bande retenue : **[250, 400)** ;
- **le rendement : × 1,3 à × 3** ;
- les nulles : **10 à 25 %** des parties, contre ~30 % sur notre livre.

**Ce que la mesure décide** : un rendement au-dessus de × 1,3, borne
basse comprise, fait du livre déséquilibré **le livre des matchs** à la
série suivante — une condition de mesure qui change, écrite à sa date,
jamais au milieu d'une série. En dessous, notre livre reste, et la ligne
retourne au registre.

**Le pilote, relevé le 3 nov. à 7 h 30** — joué dans le conteneur,
coupé DEUX fois par un redémarrage : [150, 250) à 207 parties sur 300,
[250, 400) à 251, [400, 600) jamais joué. `main` contre lui-même,
`8+0,08`, chaque position des deux côtés :

| bande | parties | camp favorisé | ses victoires | nulles | paires de somme ≠ 1 |
|---|---|---|---|---|---|
| [150, 250) | 207 | 65,0 % | 38,6 % | 52,7 % | 55,3 % |
| **[250, 400)** | 251 | **77,9 %** | 61,0 % | 33,9 % | 40,8 % |

- **la bande retenue : [250, 400)**, comme l'attendu — 77,9 %, à ± ~5
  points à 95 % de la cible de 75 %. [400, 600) n'aurait été plus près
  que s'il marquait MOINS que [250, 400) : la note grandit, le score du
  camp favorisé avec elle ; <span>inférence, confiance élevée</span>,
  d'où le pilote arrêté là. **L'écart au protocole, nommé** : 207 et 251
  parties au lieu de 300, ce qui élargit l'intervalle sans changer le
  classement — 13 points séparent les deux bandes ;
- **les nulles : 33,9 %**, au-dessus de l'attendu (10 à 25 %) — bien moins
  que la bande d'en dessous (52,7 %), mais pas moins que notre livre
  (~30 %) : l'adjudication de nulle (au 40ᵉ coup, huit coups à ± 10)
  en ramasse une part que le camp favorisé ne convertit pas ;
- **le livre** : les **11 898** positions de la bande — moins que
  15 000, donc toutes —, tirées dans l'ordre par la graine 20261102,
  `tools/book-desequilibre.epd`. Les Blancs y sont favorisés 9 560 fois
  sur 11 898 : chaque position se jouant des deux côtés, la couleur ne
  biaise rien.

**Les témoins, attendus écrits avant leur lancement** — C53 contre
`0e43fdd` et C54 contre C53 sur le livre déséquilibré, quatre jobs
chacun : **le même signe** que sur notre livre (+14,40 et +23,18), et
un rapport `(t_déséquilibré / t_équilibré)²` dans la fourchette du
rendement attendu, × 1,3 à × 3 — <span>confiance faible</span>. Un
témoin dont le signe s'inverse ferait du livre un instrument qui
mesure autre chose que la force, quel que soit son rendement.

### N° 23 — C55, C56 : le diviseur de la LMR modulée — écran, attendus et critère, écrits le 3 nov. avant de lancer

**La question** — le registre des réglages ouverts : le diviseur de la
note dans la LMR modulée, 6 000 depuis C54, n'a jamais été réglé — un
seul point, choisi à l'écran parce qu'il changeait un tiers des
réductions à arbre égal. Les deux voisins prévus : **C55 à 4 000**,
**C56 à 9 000**, un facteur 1,5 de part et d'autre.

**L'écran** — le rejeu des 60 parties du journal (« N° 23, l'écran »),
par la sonde, dont `G+hk+lmrh:6000` rend C54 **au nœud près** :
110 050 848 à la profondeur 10, le binaire de C54 les mêmes, vérifié ce
jour.

| diviseur | l'arbre à 12 (à 10), contre C54 | réductions changées à 12 (à 10) |
|---|---|---|
| **4 000** (C55) | **−6,52 %** (−4,11 %) | 59,4 % (45,1 %) |
| 6 000 (C54, `main`) | — | 34,6 % (17,9 %) |
| **9 000** (C56) | **+1,88 %** (+1,01 %) | 9,2 % (3,1 %) |

Ce que l'écran montre, sans rien décider : **la part changée n'est pas
linéaire en `1/K`** — 9 000 n'en garde qu'un quart, parce que la note
n'atteint 9 000 qu'en sommant les continuations au papillon, plafonné à
7 183 ; et **l'arbre suit le côté des notes** — 4 000 l'allège de 6,5 %
quand 6 000 le laissait égal : sous 6 000, ce sont surtout des notes
négatives qui franchissent le seuil, et elles réduisent davantage.
<span>Inférence, confiance faible : la sonde ne compte pas le côté.</span> Banc à la profondeur 7 :
70 842 et 70 845 ; à la 6, 37 989 pour les deux.

**Les matchs** — chacun contre `main` (`39334eb`, l'arbre de C54),
quatre jobs de 2 800 parties, `8+0,08`, graine « auto », AVX2 des deux
côtés, le livre de 15 000 ; mis en commun par
`tools/mettre-en-commun.sh`. Le livre déséquilibré suivra, à la lecture
de sa calibration : les douze jobs de celle-ci occupent déjà les
runners.

*Attendus, écrits avant* — <span>confiance faible</span> :
- **C55 (4 000) : −10 à +10** — il déplace près de deux fois plus de
  réductions et rend 6,5 % d'arbre ; le signe ne se déduit ni de l'un
  ni de l'autre (C54 : arbre égal, +23) ;
- **C56 (9 000) : −15 à +3** — il ne garde qu'un quart des réductions
  que C54 déplace ; s'il en garde l'Elo au prorata, il en perd ~17.

**Le critère, écrit avant** :
- un candidat fusionne si sa borne basse contre `main` passe zéro ; les
  deux, celui dont le point est le plus haut ;
- **aucun ne fusionne sinon** : 6 000 reste, et le registre garde la
  ligne ouverte avec ce que les deux points disent de la pente — le
  voisin suivant du côté du meilleur point (3 000 ou 7 500), puis le
  décalage de la note, puis SPSA.

### N° 23 — les échelles de la gravité, à l'écran le 3 nov. : confondues avec le diviseur

**La question** — le registre : les plafonds (7 183, 29 952) et le bonus
(`clamp(336·d − 547, 1, 1561)`) de C53 viennent de Stockfish 16, jamais
réglés ici ; prochain test écrit, « × 0,5 et × 2, à l'écran puis quatre
jobs ». Le rejeu, par la sonde, sur la base de `main` (`G+hk+lmrh:6000`) :

| variante | l'arbre à 12 (à 10), contre `main` | réductions changées à 12 (à 10) |
|---|---|---|
| plafonds × 0,5 | −0,32 % (−0,76 %) | 12,8 % (5,2 %) |
| plafonds × 2 | −4,32 % (−2,99 %) | 52,9 % (35,5 %) |
| bonus × 0,5 | +2,91 % (−0,04 %) | 11,2 % (3,0 %) |
| bonus × 2 | **−6,46 %** (−4,47 %) | **57,7 %** (44,5 %) |
| *pour mémoire : le diviseur à 4 000 (C55)* | *−6,52 % (−4,11 %)* | *59,4 % (45,1 %)* |

**Ce que l'écran montre** — vérifié dans le code, pas supposé : la note
n'est lue qu'à DEUX endroits, l'ordre des tranquilles et la LMR modulée.
L'ordre ne dépend pas de l'échelle des notes ; seule la LMR la lit, par
son diviseur. Les plafonds ET le bonus × 2 ensemble multiplient chaque
note par deux — la gravité est homogène —, ce qui revient au diviseur
÷ 2, à l'arrondi des entiers et au bonus plancher (1) près. Les échelles n'ont donc que deux degrés de liberté
propres : **la mémoire** (le bonus rapporté au plafond, la vitesse à
laquelle le récent efface l'ancien) et **le poids du papillon contre les
continuations** (le rapport des plafonds). Tout le reste passe par le
diviseur. **Et le bonus × 2 rend l'écran du diviseur 4 000 à 0,06 point
près** : plus de mémoire courte, des notes plus grandes, la LMR les lit
comme un diviseur plus petit.

**Ce que ça décide** — le test écrit au registre (« × 0,5 et × 2 ») est
**remplacé avant d'avoir été lancé** : chacune de ses variantes
remesurerait surtout le diviseur, en vol avec C55 et C56. **Le test
juste** vient après leur verdict : la mémoire, puis le poids des
plafonds, chacun avec un diviseur ajusté au rejeu pour que la LMR change
la même part des réductions que `main` — l'échelle de la LMR tenue,
le reste libre. Et si l'un des deux voisins du diviseur gagne, il en
devient la base.

### N° 23 — C55, C56 : VERDICT, relevé le 3 nov. à 13 h 40 — 6 000 reste

**Les huit matchs**, lancés à 7 h 45, finis entre 12 h 42 et 12 h 50,
2 800 parties chacun, **aucune perte au temps**, 6,32 à 6,49 s par
partie ; contre `39334eb`, mis en commun par `tools/mettre-en-commun.sh` :

| candidat | les quatre jobs | en commun | attendu, écrit avant |
|---|---|---|---|
| **C55**, diviseur 4 000 | −1,49, −3,97, −1,61, −3,23 | **−2,57 ± 2,99**, homogènes (p = 0,939) | −10 à +10 — dedans |
| **C56**, diviseur 9 000 | −4,47, −6,58, −7,94, −9,81 | **−7,20 ± 3,07**, homogènes (p = 0,604) — **régression démontrée** | −15 à +3 — dedans |

**Le critère, écrit avant** : aucune borne basse ne passe zéro —
**aucun ne fusionne, 6 000 reste**.

**Ce que ça dit** :
- **l'optimum est plat autour de 6 000** : une parabole en `log K` par
  les trois points culmine vers 5 500, à +0,3 au point — <span>inférence,
  confiance faible : chaque point porte ± 3</span>. Le diviseur seul ne
  rend plus rien qu'un match de quatre jobs puisse voir : **déprioritisé**
  au registre ;
- **9 000 perd 7 Elo en gardant un quart des réductions que C54
  déplace** — moins que le prorata (~−17, la borne de l'attendu) : les
  notes les plus grandes portent plus que leur part du gain de C54.
  <span>Inférence, confiance faible.</span>

**Ensuite** — au registre : le décalage de la note, comme Stockfish, à
l'écran puis quatre jobs ; la mémoire de la gravité, le diviseur ajusté
(« les échelles de la gravité », plus haut) ; SPSA pour le reste.

### N° 23 — C57, C58 : le décalage de la note — écran, attendus et critère, écrits le 3 nov. avant de lancer

**La question** — le registre, après le verdict du diviseur : Stockfish
décale la note avant de la diviser. Son source, lu à `sf_16`
(`search.cpp`, l. 1173 à 1180) : `statScore = 2 · papillon + cont[0] +
cont[1] + cont[3] − 4006`, puis `r −= statScore / (11124 + 4740 · (5 <
d < 22))`. Le décalage y vaut ~0,36 pli ; **à notre échelle, ~2 160**.
Les deux voisins de notre valeur, 0 : **C57 à +2 000** (`note − 2000`, le
sens de Stockfish, plus de réduction) et **C58 à −2 000**.

**L'écran** — le rejeu des 60 parties, par une sonde jetable bâtie sur
`main` et vérifiée contre lui au nœud près (110 050 848 à la profondeur
10, aucune réduction changée) ; C57 bâti, il rend l'arbre de sa variante
au nœud près (249 724 606 à la 12) :

| variante | l'arbre à 12, contre `main` | réductions changées |
|---|---|---|
| décalage +1 000 | −5,08 % | 7,7 % |
| **décalage +2 000** (C57) | **−9,42 %** | 15,0 % |
| décalage +4 000 | −16,60 % | 28,0 % |
| **décalage −2 000** (C58) | **+7,13 %** | 12,6 % |
| le diviseur par profondeur de Stockfish, × 1,43 de 6 à 21 | +1,31 % | 10,2 % |
| le papillon compté double | −8,26 % | 26,1 % |
| le papillon double, diviseur 7 500 | −5,94 % | 15,2 % |

Ce que l'écran montre : **le décalage pèse bien plus sur l'arbre que le
diviseur** — ±2 000 déplacent l'arbre de 7 à 9 %, quand 4 000 au lieu
de 6 000 au diviseur en déplaçaient 6,5. Le diviseur par profondeur et
le papillon double restent au registre, derrière ce verdict. Banc à la
profondeur 7 : 70 845 et 70 842 ; à la 6, 37 989 pour les deux.

**Un test tombe sous C58** : `les_extensions_singulieres_allongent_l_arbre`
asserte un SENS sur le banc à la profondeur 9, et C58 le renverse
(273 462 nœuds avec, 282 816 sans). La mesure n'en dépend pas — un match
ne lance aucun test. **Si C58 gagne**, le test se traite avant la
fusion, par une mesure indépendante du changement (`CLAUDE.md`, « Une
reformulation justifiée par une mesure INDÉPENDANTE… »), jamais en
l'assouplissant.

**Les matchs** — chacun contre `main` (`6958899`), quatre jobs de 2 800
parties, `8+0,08`, graine « auto », AVX2 des deux côtés, le livre de
15 000 ; mis en commun par `tools/mettre-en-commun.sh`.

*Attendus, écrits avant* — <span>confiance faible</span> :
- **C57 (+2 000) : −8 à +10** — le sens de Stockfish, 9 % d'arbre en
  moins ; C55, qui réduisait aussi davantage les mal notés, rendait
  −2,6 ;
- **C58 (−2 000) : −10 à +5** — 7 % d'arbre en plus, le sens contraire.

**Le critère, écrit avant** : un candidat fusionne si sa borne basse
contre `main` passe zéro — les deux, le plus haut au point ; C58 n'entre
qu'après le traitement de son test. **Sinon, 0 reste**, et le registre
garde ce que les deux points disent de la pente.

### N° 23 — C57, C58 : VERDICT, relevé le 3 nov. à 19 h 20 — le décalage reste à 0

**Les huit matchs**, lancés à 14 h 00, finis entre 18 h 56 et 19 h 09,
2 800 parties chacun, **aucune perte au temps**, 6,28 à 6,55 s par
partie ; contre `6958899` :

| candidat | les quatre jobs | en commun | attendu, écrit avant |
|---|---|---|---|
| **C57**, décalage +2 000 | −0,99, +4,09, −2,11, −1,86 | **−0,22 ± 3,02**, homogènes (p = 0,467) | −8 à +10 — dedans |
| **C58**, décalage −2 000 | +6,08, −0,00, −2,11, −2,61 | **+0,34 ± 3,03**, homogènes (p = 0,186) | −10 à +5 — dedans |

**Le critère, écrit avant** : aucune borne basse ne passe zéro —
**aucun ne fusionne, le décalage reste à 0**. C58 n'avait de toute
façon pas son test traité.

**Ce que ça dit** : **±2 000 déplacent l'arbre de 7 à 9 % — dans les
deux sens — pour rien de mesurable**. Après le diviseur (C55, C56), le
second réglage de la LMR modulée qui ne rend rien autour de la valeur de
`main` : l'échelle de la modulation est près de son optimum, et ce qui
reste à y chercher tombe sous ce qu'un match de quatre jobs voit. Le
décalage est **déprioritisé** au registre. Un point de plus pour « c'est
plus fort » : ÷1,10 et ×1,07 d'arbre, deux néants.

**Et le test qui tombait sous C58** tombe aussi sous C59, plus bas : le
sens qu'il asserte bascule sous deux changements sans rapport — il se
traite sur `main` (« N° 23 — le test des extensions singulières »).

### N° 23 — C59, C60 : la mémoire de la gravité — écran, attendus et critère, écrits le 3 nov. avant de lancer

**La question** — le test écrit après l'écran des échelles (« les
échelles de la gravité ») : la mémoire de l'historique — le bonus
rapporté au plafond, la vitesse à laquelle le récent efface l'ancien —,
**l'échelle de la LMR tenue**. Le bonus × 2 ou × 0,5, plafonds fixes, le
diviseur de la LMR modulée ajusté au rejeu pour qu'elle module la même
part des réductions que `main` (34,6 %).

**L'écran** — la sonde n23 (`G+hk`, puis `lin` et `lmrh`), qui rend
`main` au nœud près ; chaque candidat bâti rend l'arbre de sa variante
au nœud près (269 701 073 et 275 102 517 à la profondeur 12) :

| variante | diviseur | réductions modulées | l'arbre à 12, contre `main` |
|---|---|---|---|
| `main` | 6 000 | 34,6 % | — |
| bonus × 2 | 6 000 / 8 000 / 9 000 / 11 000 | 57,7 / **34,8** / 27,1 / 16,8 % | −6,46 / **−2,18** / −1,83 / −0,20 % |
| bonus × 0,5 | 6 000 / 4 000 / 3 000 / 2 200 | 11,2 / **37,5** / 53,5 / 66,1 % | +2,91 / **−0,22** / −2,73 / −6,88 % |

D'où **C59, la mémoire courte** : `clamp(672·d − 1094, 1, 3122)`,
diviseur 8 000 ; **C60, la mémoire longue** : `clamp(168·d − 274, 1,
781)`, diviseur 4 000. Banc à la profondeur 7 : 70 843 et 70 716 ; à la
6, 37 984 et 39 758.

**Un test tombe sous C59** — le même que sous C58,
`les_extensions_singulieres_allongent_l_arbre` ; C60 passe tous les
tests. La mesure n'en dépend pas ; le test se traite sur `main`.

**Les matchs** — chacun contre `main` (`8fa8f20`), quatre jobs de 2 800
parties, `8+0,08`, graine « auto », AVX2 des deux côtés, le livre de
15 000.

*Attendus, écrits avant* — <span>confiance faible</span> :
- **C59 (mémoire courte) : −6 à +8** — la mémoire courte a payé une
  fois (C53, +14,4, contre le plafond seul de C52, +2,1) ; deux fois plus
  courte, le signe ne se déduit pas ;
- **C60 (mémoire longue) : −8 à +4** — le sens que C53 a quitté.

**Le critère, écrit avant** : un candidat fusionne si sa borne basse
contre `main` passe zéro — les deux, le plus haut au point ; C59
n'entre qu'après le traitement du test. **Sinon, `main` reste**, et le
registre garde la pente.

### N° 23 — C59, C60 : VERDICT, relevé le 4 nov. à 0 h 50 — la mémoire longue perd, la courte n'est pas démontrée

**Les huit matchs**, lancés le 3 nov. à 19 h 33, finis entre 0 h 30 et
0 h 36, 2 800 parties chacun, **aucune perte au temps** ; contre
`8fa8f20` :

| candidat | les quatre jobs | en commun | attendu, écrit avant |
|---|---|---|---|
| **C59**, mémoire courte (bonus × 2, diviseur 8 000) | +2,36, +3,23, +0,62, +3,72 | **+2,48 ± 3,08**, homogènes (p = 0,903) | −6 à +8 — dedans |
| **C60**, mémoire longue (bonus × 0,5, diviseur 4 000) | −4,84, −4,96, −5,21, −5,09 | **−5,03 ± 3,00**, homogènes — **régression démontrée** | −8 à +4 — dedans |

**Le critère, écrit avant** : aucune borne basse ne passe zéro —
**`main` reste**.

**La vraisemblance, contrôlée** : les quatre jobs de C60 tombent à
1,5 point de score l'un de l'autre (49,25 à 49,30 %), ce qu'un seul effet
ne rend qu'environ une fois sur trois mille. Leurs graines sont les
identifiants de leurs runs (`match.yml`, « auto »), leurs vecteurs
pentanomiaux et leurs fins de partie diffèrent : des parties distinctes,
et une coïncidence. <span>Plus large, confiance faible : les p
d'homogénéité du n° 23 penchent vers le haut (moyenne ~0,68 sur dix
groupes, 0,5 attendu) — l'erreur pentanomiale par job serait plutôt
prudente, ce qui n'invalide aucun verdict.</span>

**Ce que ça dit** — la pente de la mémoire, l'échelle de la LMR tenue :
× 0,5 → **−5,0**, × 1 → 0, × 2 → **+2,5** au point. Concave, et dans le
sens de C53 : le récent paie, et moins à chaque doublement. Le pas
suivant, au point de la pente : **le bonus × 3** (C61, ci-dessous).
C59 ne se remesure pas : un second match n'achèterait que la moitié de la
question que C61 pose entière.

### N° 23 — C61 : la mémoire plus courte encore — attendus et critère, écrits le 4 nov. avant de lancer

**Le candidat** — le bonus × 3, `clamp(1008·d − 1641, 1, 4683)`, les
plafonds inchangés ; le diviseur de la LMR modulée à **10 000**, ajusté
au rejeu : 33,8 % des réductions modulées (9 500 : 37,7 % ; 10 500 :
31,6 %), l'arbre à 12 **−2,04 %** contre `main`. Bâti, il rend l'arbre de
la sonde au nœud près (270 077 183). Banc 71 310 à la profondeur 7,
38 230 à la 6. **Il fait tomber le même test que C58 et C59** — un
troisième changement de l'historique qui renverse le sens asserté ; son
traitement, écrit avant tout verdict, vaut pour lui : « N° 23 — le test des
extensions singulières ».

**Le match** — **huit jobs** de 2 800 parties contre `main` (`864c15a`),
`8+0,08`, graine « auto », AVX2, le livre de 15 000 : l'effet cherché
est de l'ordre de C59, et quatre jobs n'en voient le signe qu'une fois
sur deux.

*Attendu, écrit avant* — <span>confiance faible</span> : **−3 à +6** ;
la pente se courbe, × 3 peut déjà redescendre.

**Le critère, écrit avant** : C61 fusionne si sa borne basse contre
`main`, sur les huit jobs, passe zéro — son test traité d'abord ; sinon
`main` reste, et la mémoire est **déprioritisée** au registre, sa marge
sous ce qu'un verdict de huit jobs achète.

### N° 23 — C61 : VERDICT, relevé le 4 nov. à 6 h 25 — `main` reste, la mémoire déprioritisée

**Les huit matchs**, lancés le 4 nov. à 0 h 57, finis entre 5 h 49 et
5 h 59, 2 800 parties chacun, **aucune perte au temps** ; contre
`864c15a` : −0,74, +3,47, −1,74, +6,45, +5,71, +4,59, **−8,69**, +4,22.
En commun : **+1,66 ± 2,16** sur 22 400 parties — **et non
homogènes** : le plus grand écart, le job 7 (41743173717) contre le
job 4, vaut z = 3,55 sur 28 paires, p = 0,009, sous le seuil de 0,046.
`tools/mettre-en-commun.sh` demande alors d'expliquer l'écart ou de
rapporter les matchs séparément.

**L'écart, cherché** : le runner du job 7 est un EPYC 9V45 à 1,62 M n/s,
profondeur 15 en 250 ms, 6,43 s par partie — la classe des autres, rien
qui distingue son régime. **Inexpliqué.** <span>Inférence, confiance
faible : un hasard à p = 0,009, sur une trentaine de groupes relevés au
n° 23.</span> Sans lui, +3,14 ± 2,31 — **lu, pas retenu** : retirer un job
après avoir vu son score est le choix d'échantillon que la règle
interdit.

**Le critère, écrit avant** : la borne basse sur les huit jobs,
**−0,50**, ne passe pas zéro — **C61 ne fusionne pas, `main` reste, la
mémoire est déprioritisée** au registre. Ce que les trois points
disent : × 0,5 → −5,0 ; × 2 → +2,5 ± 3,1 ; × 3 → +1,7 ± 2,2 — un plateau
de quelques Elo du côté de la mémoire courte, qu'aucun match de huit
jobs ne démontre. <span>Inférence, confiance faible.</span> SPSA, le jour
où il réglera la recherche, pourra la reprendre avec le diviseur.

### N° 23 — l'élagage par l'historique, la forme de Stockfish 16 : fermé à l'écran le 4 nov.

**La forme** — lue au source de `sf_16` (`search.cpp`, l. 1015 à 1024) :
un tranquille qui ne donne pas échec, hors racine, dont la somme des
continuations (coups −1, −2 et −4) est sous `−3832 · d`, se saute si
`lmrDepth < 6`. Ici : les deux continuations que le moteur garde (−1 et
−2), `lmrDepth = d − 1 − r`, et le seuil essayé à 2 500 — 3 832 rapporté
à deux continuations sur trois —, 3 832 et 6 000. La sonde
(`tools/attic/n23-sonde-elagage-sf.patch`) rend `main` au nœud près en
ombre ; elle compte les coups sautés et, en ombre, ceux qui auraient
monté `alpha`.

| seuil | l'arbre à 12, contre `main` | sautés | montées d'`alpha` détruites |
|---|---|---|---|
| 2 500 | **−1,56 %** | 2 506 906 | **0,383 %** (en ombre : un sauté sur quinze monte `alpha`) |
| 3 832 | +0,15 % | 994 553 | — |
| 6 000 | −0,52 % | 290 631 | — |

**Ce que l'écran décide**, par la règle écrite le 2 nov. : 1,56 point
d'arbre pour 0,383 point de dégâts, **4,1 par point**, sous le seuil de
10 — et les deux seuils plus hauts ne rendent presque rien d'arbre.
**Fermé sous cette forme aussi**, après la forme écrite du 2 nov.
(6,1 par point). *Deux formes, le même verdict : sur cet arbre, LMR
modulée comprise, l'historique ne désigne pas assez sûrement les coups à
sauter* — <span>inférence, confiance moyenne</span>. La LMR modulée, qui
les réduit au lieu de les sauter, a déjà pris la part de ce signal qui
paie.

### N° 23 — C62, C63 : la LMR selon le type de nœud — écran, attendus et critère, écrits le 4 nov. avant de lancer

**La technique** — lue au source de `sf_16` (`search.cpp`) : chaque nœud
porte un drapeau, `cutNode`, « on y attend une coupure », et la LMR y
réduit de **deux plis de plus** (`if (cutNode) r += 2`). Le drapeau se
propage ainsi : la recherche réduite d'un coup attend une coupure ; sa
re-recherche à profondeur pleine et fenêtre nulle prend l'inverse du
parent ; la recherche de la variante principale n'en attend pas ; le
coup nul prend l'inverse du parent ; la vérification singulière garde
celui du parent. **Le portage** : `negamax` garde sa signature et appelle
`search_node`, qui porte `cut_node` ; le nœud PV se lit à la fenêtre
(`beta − alpha > 1`). Au bonus 0, **`main` au nœud près** — le portage
ne déplace rien tant que le bonus est nul.

**L'écran** — l'arbre à la profondeur 12, au rejeu des 60 parties du
n° 23 (7 030 recherches, table et historiques conservés), contre
`main` (275 709 552 nœuds) :

| candidat | bonus aux nœuds de coupure | l'arbre à 12 |
|---|---|---|
| C62 (`4ff385a`) | 1 pli | 272 938 132, **−1,01 %** |
| C63 (`2b449ee`) | 2 plis — Stockfish 16 | 269 275 781, **−2,33 %** |

Banc : C62 70 824 à la profondeur 7, 38 196 à la 6 ; C63 70 814 et
38 203. **C63 fait tomber `les_extensions_singulieres_allongent_l_arbre`**,
comme C58, C59 et C61 ; C62 le laisse passer. Le traitement écrit avant
le verdict de C59 vaut pour lui (« N° 23 — le test des extensions
singulières »).

**Le match** — quatre jobs de 2 800 parties par candidat contre `main`
(`8b845b5`), `8+0,08`, graine « auto », AVX2, le livre de 15 000.

*Attendus, écrits avant* — <span>confiance faible</span> : C62 **−4 à
+6**, C63 **−5 à +8**. Converti par l'étalon, l'arbre seul vaudrait
+1,5 et +3,5 ; mais la technique déplace les réductions — elle touche la
fenêtre et l'ordre où l'on se trompe, la classe où l'étalon s'est
trompé de 15 à 40 Elo au cinquième écran —, et la LMR modulée réduit
déjà davantage les coups mal notés, qui sont souvent ceux d'un nœud de
coupure.

**Le critère, écrit avant** : fusionne celui dont la borne basse contre
`main` passe zéro — les deux, le plus haut au point ; C63 après le
traitement de son test. Sinon `main` reste, le bonus entre au registre
des réglages ouverts avec ses deux points, et la ligne suivante de la
file — la variante principale en table — se prend.

### N° 23 — C62, C63 : VERDICT, relevé le 4 nov. à 11 h 55 — C63 gagne, il entre par la composition

**Les huit matchs**, lancés le 4 nov. à 6 h 35, finis entre 11 h 31 et
11 h 40, 2 800 parties chacun, **aucune perte au temps**, 6,32 à
6,50 s par partie ; contre `8b845b5` :

| candidat | les quatre jobs | en commun | homogénéité | attendu |
|---|---|---|---|---|
| C62, un pli aux nœuds de coupure | −1,74, +6,70, +7,20, +0,99 | **+3,29 ± 3,06** | p = 0,181 | −4 à +6 |
| C63, deux plis — Stockfish 16 | +6,95, +5,46, +4,59, +3,23 | **+5,06 ± 3,02** | p = 0,835 | −5 à +8 |

**Le critère, écrit avant** : les deux bornes basses passent zéro
(+0,23 et +2,04) — **C63, le plus haut au point, gagne**. Le gain est
démontré, de la taille de l'arbre qu'il retire (−2,3 % à la profondeur
12, +3,5 par l'étalon) : *réduire davantage là où l'on attend une
coupure ne coûte pas la décision*. <span>Inférence, confiance
faible.</span> La pente de un à deux plis (+3,3 → +5,1) laisse ouvert
un troisième, qui entre au registre.

**Son entrée** : par la composition des gagnants des quatre lignes,
mesurée contre `main` — la règle écrite avec C64 à C70, avant tout
verdict. **Son test** — `les_extensions_singulieres_allongent_l_arbre`,
qu'il fait tomber à la profondeur 9 —, traité selon la règle écrite le
3 nov. : mesuré sous C63, il tient à la profondeur 11, **1,237** avec
contre sans, six positions sur six (à la 9 : 0,972, quatre sur six ; à
la 10 : 1,218, cinq sur six). Il passe à la profondeur 11, à
reconfirmer sous la composition.

### N° 23 — C64, C65, C66 : la variante principale en table — écran, attendus et critère, écrits le 4 nov. avant de lancer

**La technique** — lue au source de `sf_16` (`search.cpp`) : l'entrée de
la table porte un bit, `ttPv`, « cette position a été sur la variante
principale » ; un nœud PV l'écrit, un nœud dont l'entrée le portait le
réécrit — il ne s'efface qu'avec l'entrée. Un nœud qui le porte réduit
ses coups de deux plis de moins, sauf le nœud PV que la table annonce
déjà en échec par le bas à une profondeur au moins égale
(`likelyFailLow`). Ici : le bit 50 de l'entrée, libre ; la recherche
singulière garde le drapeau de son nœud. La sonde
(`tools/attic/n23-sonde-ttpv.patch`, variable `N26`) rend `main` au nœud
près sans variante ; 2,35 % des nœuds intérieurs portent le drapeau.

**L'écran** — l'arbre à la profondeur 12, au rejeu des 60 parties du
n° 23 (7 030 recherches), contre `main` (275 709 552 nœuds), et la part
des réductions de la LMR que la variante change :

| variante | l'arbre à 12 | réductions changées |
|---|---|---|
| un pli, partout — **C65** | 346 230 298, **+25,58 %** | 15,4 % |
| deux plis, partout — Stockfish 16 | 444 006 236, +61,04 % | 15,2 % |
| un pli, partout, et la propagation d'un échec par le bas au parent PV | 351 968 998, +27,66 % | 17,0 % |
| un pli, partout, sans `likelyFailLow` | 363 606 610, +31,88 % | 19,4 % |
| un pli, aux nœuds PV seuls | 330 129 393, +19,74 % | 8,7 % |
| un pli, aux anciens nœuds PV de fenêtre nulle seuls — **C64** | 281 505 599, **+2,10 %** | 7,3 % |
| deux plis, aux mêmes — **C66** | 296 282 070, **+7,46 %** | 8,2 % |
| la futilité inverse coupée aux nœuds `ttPv` (Stockfish 16, étape 8) | 275 658 859, −0,02 % | — |

**Ce que l'écran dit** : le coût est aux nœuds PV courants — un pli de
moins y grossit l'arbre de 19,7 % pour 8,7 % des réductions changées,
quand les anciens nœuds PV n'en coûtent que 2,1 % pour 7,3 %. Nos
réductions de base sont plus courtes que celles de Stockfish, qui en
ajoute ailleurs (nœuds de coupure, coup de table capturant, coupures
au pli suivant) : les deux plis de Stockfish ne se transposent pas. La
futilité inverse aux nœuds `ttPv` ne coupe presque rien ici : **fermée à
l'écran**, sans match.

**Les candidats**, bâtis chacun sur la même écriture
(`tt_pv_relief`) et rendant l'arbre de la sonde au nœud près :
C64 (`9a310ba`) — un pli, hors nœuds PV, banc 72 692 et 38 183 ;
C66 (`552338f`) — deux plis, hors nœuds PV, banc 71 634 et 38 280,
**fait tomber `les_extensions_singulieres_allongent_l_arbre`**, traitement
écrit d'avance (« N° 23 — le test des extensions singulières ») ;
C65 (`905a5c9`) — un pli partout, `likelyFailLow` compris, banc 79 549 et
39 425. Avant eux, un test du générateur NNUE réparé sur `main`
(`e0762bf`) : il assertait qu'une dame de plus dépasse le seuil de
1 000, ce que `main` ne donnait qu'à la profondeur 5 (991 à la 4) ; C64,
qui approfondit moins vite, le faisait tomber.

**Le match** — quatre jobs de 2 800 parties par candidat contre `main`
(`e0762bf`, l'arbre de `8b845b5`), `8+0,08`, graine « auto », AVX2, le
livre de 15 000.

*Attendus, écrits avant* — <span>confiance faible</span> : C64 **−4 à
+6** ; C66 **−8 à +6** ; C65 **−25 à +8**, ~−5. Converti par l'étalon,
l'arbre seul coûterait −3, −11 et −35 ; mais C46, qui ne réduisait plus
du tout aux nœuds PV (+17,1 % d'arbre, −19 à −33 par l'étalon), a rendu
+9,56 quand C45 sans eux rendait +11,67 : la précision aux nœuds PV
rachète presque tout son arbre.

**Le critère, écrit avant** : fusionne celui dont la borne basse contre
`main` passe zéro — plusieurs, le plus haut au point ; C66 après le
traitement de son test. Un gagnant ici et un gagnant de C62/C63 se
composent et se mesurent ensemble contre `main` avant d'entrer, comme au
n° 12 : Stockfish les emploie l'un avec l'autre, et l'un relâche ce que
l'autre serre. Sinon `main` reste, et le relâchement entre au registre
des réglages ouverts avec ses points.

### N° 23 — C64, C65, C66 : VERDICT, relevé le 4 nov. à 12 h 30 — aucun ne passe, `main` reste

**Les douze matchs**, lancés le 4 nov. à 7 h 07, finis entre 11 h 59 et
12 h 13, 2 800 parties chacun, **aucune perte au temps**, 6,25 à 6,52 s
par partie ; contre `e0762bf` :

| candidat | les quatre jobs | en commun | homogénéité | attendu |
|---|---|---|---|---|
| C64, un pli, anciens nœuds PV seuls | +0,25, −1,74, −1,61, +0,25 | **−0,71 ± 3,04** | p = 0,968 | −4 à +6 |
| C65, un pli partout — la forme de Stockfish | −1,12, +7,57, +4,59, +0,12 | **+2,79 ± 3,09** | p = 0,210 | −25 à +8 |
| C66, deux plis, anciens nœuds PV seuls | +1,99, −7,20, +5,21, +2,73 | **+0,68 ± 3,06** | **p = 0,027** — non homogènes | −8 à +6 |

**C66 n'est pas homogène** : son job 2 (41783477996) à −7,20 contre son
job 3 à +5,21, z = 2,79. Inexpliqué, et **la décision n'en dépend
pas** : lus séparément, aucun de ses quatre jobs ne met sa borne basse
au-dessus de zéro.

**Le critère, écrit avant** : aucune borne basse ne passe zéro (C65, la
plus haute, −0,30) — **aucun ne fusionne, `main` reste**. Ce que les
trois points disent : relâcher les anciens nœuds PV seuls ne rend rien,
à un pli comme à deux ; la forme de Stockfish, qui relâche aussi les
nœuds PV courants, rend +2,8 au point **pour +25,6 % d'arbre** — la
précision aux nœuds PV rachète presque tout son arbre, comme sous C46
(+17,1 % d'arbre, ~−2 contre C45). <span>Inférence, confiance
faible.</span> Le relâchement entre au **registre**, à reprendre sur la
base qui portera C63 : Stockfish emploie les deux ensemble, et l'un
réduit ce que l'autre relâche.

### N° 23 — C67, C68 : l'historique de correction en plusieurs tables — écran, attendus et critère, écrits le 4 nov. avant de lancer

**La technique** — lue au source de `sf_17.1` (`search.cpp`, `history.h`,
`position.cpp`) : l'évaluation statique est corrigée de ce que les
recherches ont appris de son erreur, par cinq tables — la structure de
pions, les cavaliers et fous des deux camps, les pièces hors pions de
chaque camp (roi compris), chacune par camp au trait sur 2¹⁵ entrées, et
la continuation des deux coups qui précèdent le nœud ; la correction
vaut `(7685·pions + 7495·mineures + 9144·(hors pions blancs + noirs) +
6469·continuation) / 2¹⁷`. Une recherche apprend, hors échec et quand
son meilleur coup ne capture pas, si elle dit le sens de l'erreur —
sous l'évaluation sans coupure bêta, au-dessus avec un meilleur coup — :
`clamp((résultat − évaluation)·d/8, ±256)`, dans chaque table à son
poids (111, 146, 162, 162 et 143 sur 128), par la gravité bornée à
1 024. Toute l'évaluation de la recherche la lit corrigée, quiescence
comprise. **Ce n'est pas C42** (6 oct., −1,13 ± 3,61) : une table de
pions seule, une moyenne mobile, sur la base d'avant l'historique borné.
Ici, les clés se calculent des bitboards — `cozy-chess` ne tient pas de
clés partielles —, par un mélange multiplicatif.

**L'écran** — la sonde (`tools/attic/n23-sonde-correction.patch`,
variable `N27`) au rejeu des 60 parties du n° 23, l'arbre à la
profondeur 12 contre `main` (275 709 552), et la correction moyenne, en
valeur absolue, sur les évaluations de la recherche :

| variante | l'arbre à 12 | correction moyenne |
|---|---|---|
| la forme de Stockfish 17.1 — **C67** | 316 665 378, **+14,85 %** | 39,8 |
| la structure de pions seule | 295 289 371, +7,10 % | 16,0 |
| sans la continuation | 324 448 822, +17,68 % | 37,1 |
| à mi-poids — **C68** | 303 457 161, **+10,06 %** | 24,3 |
| à double poids | 333 524 592, +20,97 % | 62,6 |

Une correction moyenne de 40 unités, un sixième de pion au réseau.
**L'arbre grossit**, comme sous C42 (+7,4 %), et d'autant plus que la
correction pèse : une évaluation corrigée coupe moins souvent par la
futilité inverse et le coup nul là où la recherche l'avait démentie.

**Les candidats**, rendant l'arbre de la sonde au nœud près : C67
(`4feae50`) — les poids de Stockfish 17.1, banc 76 717 et 37 522 ; C68
(`77c0003`) — la même chose appliquée à moitié, banc 75 098 et 38 113.
Sept tests neufs : chaque clé ne lit que ses pièces, la gravité et sa
borne, la somme pondérée, le plafond sous le mat, la règle
d'apprentissage, le bonus, la correction apprise puis vidée par
`ucinewgame`. La quiescence note désormais le coup qui mène à son
enfant, que la continuation lit.

**Le match** — quatre jobs de 2 800 parties par candidat contre `main`
(`e0762bf`), `8+0,08`, graine « auto », AVX2, le livre de 15 000.

*Attendus, écrits avant* — <span>confiance faible</span> : C67 **−10 à
+12**, C68 **−8 à +10**. L'arbre seul coûterait −21 et −15 par
l'étalon ; Stockfish en tire plusieurs Elo par table, mais sur une
évaluation et une recherche qui ne sont pas les nôtres, et C42 n'a rien
rendu.

**Le critère, écrit avant** : fusionne celui dont la borne basse contre
`main` passe zéro — les deux, le plus haut au point. Les gagnants de
C62/C63, C64 à C66 et C67/C68 se composent et se mesurent ensemble
contre `main` avant d'entrer (n° 12). Sinon `main` reste, et
l'historique de correction entre au registre avec C42 : trois formes
sans gain.

### N° 23 — C67, C68 : VERDICT, relevé le 4 nov. à 12 h 55 — C67 gagne, +14,22, il entre par la composition

**Les huit matchs**, lancés le 4 nov. à 7 h 29, finis entre 12 h 17 et
12 h 37, 2 800 parties chacun, **aucune perte au temps**, 6,14 à 6,57 s
par partie ; contre `e0762bf` :

| candidat | les quatre jobs | en commun | homogénéité | attendu |
|---|---|---|---|---|
| C67, la forme de Stockfish 17.1 | +11,42, +18,51, +11,92, +15,02 | **+14,22 ± 3,26** | p = 0,455 | −10 à +12 |
| C68, à mi-poids | +15,40, +10,05, +11,30, +8,32 | **+11,26 ± 3,16** | p = 0,427 | −8 à +10 |

**Le critère, écrit avant** : les deux bornes basses passent zéro
(+10,96 et +8,10) — **C67, le plus haut au point, gagne**, au-dessus
de l'attendu, pour **+14,85 % d'arbre** (−21 par l'étalon) : la
décision rachète l'arbre et bien davantage. *L'arbre ne disait pas le
signe, une fois de plus* — C42 (6 oct.), une table de pions seule,
rendait −1,13 pour +7,4 %. Ce qui a changé : cinq tables au lieu d'une,
la règle d'apprentissage de Stockfish (le sens dit par la borne, la
gravité), et une base dont l'historique est borné. <span>Inférence,
confiance faible — rien ne sépare ces trois causes.</span> La pente de
mi-poids à plein poids (+11,3 → +14,2) laisse ouvert un poids plus
fort, qui entre au registre ; l'écran donnait +21 % d'arbre au double.

**Son entrée** : par la composition des gagnants des quatre lignes,
mesurée contre `main` — C63 et C67, avec le gagnant de C69/C70 s'il y
en a un.

### N° 23 — C69, C70 : l'historique des captures, rouvert — écran, attendus et critère, écrits le 4 nov. avant de lancer

**La technique** — lue au source de `sf_16` (`search.cpp`,
`update_all_stats` ; `movepick.cpp`) : la note d'une capture par la
pièce qui prend, sa case d'arrivée et le type de la victime ; à chaque
coupure, `stat_bonus(d + 1)` à la capture qui coupe, autant de malus aux
captures cherchées avant elle, quel que soit le coup qui coupe ; bornée
par la gravité à 10 692 ; ajoutée à la valeur de la victime dans l'ordre
des captures, où elle peut faire passer une capture devant une victime
plus grosse. **Fermée à l'écran au n° 9** (6 oct.) : la première capture
portait 92 % des coupures, et la variante d'alors — sans borne, à ± 512
points d'ordre — ne déplaçait l'arbre que de −1,3 %. Le registre la
rouvrait : « borné, il peut ordonner autrement ».

**L'écran** — la sonde (`tools/attic/n23-sonde-captures.patch`,
variable `N28`, `d:D` : la note qui vaut une victime de plus) au rejeu
des 60 parties du n° 23, contre `main` (275 709 552), et la part des
coupures de capture que porte la première capture cherchée :

| une victime de plus pour une note de | l'arbre à 12 | première capture |
|---|---|---|
| 2 000 | 264 110 353, −4,21 % | 96,0 % |
| 4 585 — **C70**, le rapport de Stockfish 16 | 264 489 336, **−4,07 %** | 95,8 % |
| 7 000 | 263 901 996, −4,28 % | 95,4 % |
| 10 692 — **C69**, une victime au plafond | 262 192 521, **−4,90 %** | 94,9 % |
| 20 000 | 267 907 769, −2,83 % | 94,0 % |
| 40 000 | 266 251 925, −3,43 % | 93,9 % |

**Ce que l'écran dit** : **trois à quatre fois l'effet du n° 9**, sur un
arbre que les élagages et l'historique borné ont changé depuis ; un
plateau de −4 à −5 % de 2 000 à 10 692, qui retombe au-delà. C'est un
changement d'ORDRE : l'arbre rétrécit, la décision bouge peu — la
classe où l'étalon s'est trompé dans les deux sens au cinquième écran.
Le rapport de Stockfish 16 se lit ainsi : sa note de capture vaut
`(7 · valeur de la victime + historique) / 16`, l'écart du pion au
cavalier y est de 7 × (781 − 126) = 4 585 — d'où C70 ; C69 est le
meilleur point de l'écran.

**Les candidats**, rendant l'arbre de la sonde au nœud près : C69
(`b3d4500`) — banc 72 063 et 38 532 ; C70 (`7f9b3e2`) — banc 79 081 et
42 027. Trois tests neufs : l'index ne vise que les captures, la règle
de la coupure et sa borne, la note au plafond qui vaut une victime.

**Le match** — quatre jobs de 2 800 parties par candidat contre `main`
(`e0762bf`), `8+0,08`, graine « auto », AVX2, le livre de 15 000.

*Attendus, écrits avant* — <span>confiance faible</span> : C69 **−2 à
+10**, C70 **−3 à +9** ; l'arbre seul vaudrait +7,8 et +6,4 par
l'étalon.

**Le critère, écrit avant** : fusionne celui dont la borne basse contre
`main` passe zéro — les deux, le plus haut au point. Les gagnants des
quatre lignes de la phase 4 (C62 à C70) se composent et se mesurent
ensemble contre `main` avant d'entrer. Sinon `main` reste, et
l'historique des captures retourne au registre avec ses points.

### N° 23 — C69, C70 : VERDICT, relevé le 4 nov. à 13 h 05 — aucun ne passe, `main` reste

**Les huit matchs**, lancés le 4 nov. à 7 h 51, finis entre 12 h 47 et
12 h 58, 2 800 parties chacun, **aucune perte au temps**, 6,32 à 6,56 s
par partie ; contre `e0762bf` :

| candidat | les quatre jobs | en commun | homogénéité | attendu |
|---|---|---|---|---|
| C69, une victime pour une note de 10 692 | −6,58, +0,99, +3,35, −0,62 | **−0,71 ± 3,02** | p = 0,111 | −2 à +10 |
| C70, de 4 585 — le rapport de Stockfish 16 | −3,97, −1,49, −0,87, +1,12 | **−1,30 ± 3,02** | p = 0,624 | −3 à +9 |

**Le critère, écrit avant** : aucune borne basse ne passe zéro —
**aucun ne fusionne, `main` reste**, et l'historique des captures
retourne au registre. **L'arbre retiré ne s'est pas acheté** : −4,90 et
−4,07 %, +7,8 et +6,4 par l'étalon, et rien au jeu — le contraire exact
de C67, qui grossit l'arbre de 15 % et rend +14. *Un changement d'ordre
des captures déplace aussi ce que la quiescence et l'échange statique
coupent* ; <span>inférence, confiance faible</span> : la première capture
portait déjà 92 à 96 % des coupures, et ce qu'on gagne ailleurs ne
change pas la décision. Deux formes du n° 9 et deux d'aujourd'hui sans
gain : **déprioritisé**.

### N° 23 — C71 : la composition des gagnants, C63 et C67 — protocole, attendu et critère, écrits le 4 nov. avant de lancer

**Les gagnants des quatre lignes** : **C63** (la LMR, deux plis de plus
aux nœuds de coupure, +5,06 ± 3,02) et **C67** (l'historique de
correction en plusieurs tables, +14,22 ± 3,26) ; aucun pour la variante
principale en table (C64 à C66) ni pour l'historique des captures (C69,
C70).

**Le candidat** : C71 (`3f47f79`), C63 et C67 composés sur `main` par
leurs deux écritures, sans arbitrage de code — des insertions voisines
seulement. L'arbre à la profondeur 12, au rejeu : **310 784 810,
+12,72 %** — C63 seul −2,33 %, C67 seul +14,85 % : les deux arbres se
composent presque exactement (+12,52 attendu par l'addition). Banc 77 429
à la profondeur 7, 38 481 à la 6. **Le test des extensions singulières**,
que C63 seul faisait tomber à la profondeur 9, **y passe** : le traitement
écrit d'avance n'a pas à s'appliquer. Tous les tests passent.

**Le match** — quatre jobs de 2 800 parties contre `main` (`e0762bf`,
le moteur des deux membres), `8+0,08`, graine « auto », AVX2, le livre
de 15 000.

**Attendu, écrit avant** — <span>inférence, confiance faible</span> :
- **majorant**, la somme des gains seuls : **+19,28 ± 4,45** ;
- les compositions du dépôt ont rendu 80 % (n° 12) et 91 % (n° 9) de
  cette somme ; ici les deux membres touchent des objets distincts — la
  réduction, l'évaluation —, mais C67 corrige l'évaluation que la LMR de
  C63 n'emploie pas, et la futilité que C63 ne touche pas :
  **+12 à +22, ~+17**.

**Le critère, écrit avant** : **C71 fusionne si sa borne basse est
au-dessus de zéro, ET si son point n'est pas démontré sous son meilleur
membre** — C67, +14,22 ± 3,26 contre le même moteur : sous **+9,7**,
l'écart à C67 dépasse les ± 4,5 des deux mesures, et la composition ferait
moins bien que C67 seul. Alors **C67 entre seul**, sur son propre verdict,
et C63 se remesure par-dessus, quatre jobs, critère écrit avant.
**Puissance** : à ± 3,1, un vrai +17 passe les deux clauses presque
toujours ; un vrai +12, la seconde trois fois sur quatre.

**À l'entrée** : le bonus aux nœuds de coupure et le poids de la
correction restent au registre (trois plis ; × 1,5) ; C65, la variante
principale en table sous la forme de Stockfish, se remesure sur la base
qui porte C63.

### N° 23 — C71 : VERDICT, relevé le 4 nov. à 18 h 25 — +16,02 ± 3,17, FUSIONNÉ ; la phase 4 est close

**Les quatre matchs**, lancés le 4 nov. à 13 h 05, finis entre 18 h 02 et
18 h 07, 2 800 parties chacun, **aucune perte au temps**, 6,34 à 6,44 s
par partie ; contre `e0762bf` : +12,91, +17,64, +10,43, **+23,11**. En
commun : **+16,02 ± 3,17** sur 11 200 parties — **non homogènes** : le
job 4 (41826212189) contre le job 3, z = 2,74, p = 0,031.

**L'écart ne change pas la décision**, et c'est la lecture que le
critère impose quand le mélange est en cause : **lu job par job, chacun
passe les deux clauses** — bornes basses de +4,03 à +16,69, points de
+10,43 à +23,11, tous au-dessus de +9,7. *Un critère écrit en bornes se
lit sur chaque match comme sur l'ensemble* (C22).

**Le critère, écrit avant** : borne basse +12,85 au-dessus de zéro, et
point +16,02 au-dessus de +9,7 — **C71 FUSIONNE**, par la révocation de
sa révocation. **L'attendu tient** : +12 à +22, ~+17 ; la composition
rend **83 %** de la somme de ses membres (+19,28), entre le n° 12 (80 %)
et le n° 9 (91 %).

**La phase 4 est close** : l'historique borné (C53), la LMR modulée
(C54), puis la LMR selon le type de nœud et l'historique de correction en
plusieurs tables (C71) — **~+53 par la chaîne** en trois jours ; la
variante principale en table, l'élagage par l'historique et l'historique
des captures sans gain. Ses réglages restent au registre.

**Ce qui suit, à l'écran le 4 nov. sur C71** (l'arbre à 12, au rejeu,
contre C71 à 310 784 810) : trois plis aux nœuds de coupure **+1,46 %** ;
le poids de la correction × 1,5 **+3,47 %** ; C65, la variante
principale en table sous la forme de Stockfish, **+27,82 %**.

### N° 23 — C72, C73, C74 : les réglages de la phase 4 sur `main` — attendus et critère, écrits le 4 nov. avant de lancer

**Les candidats**, sur `main` qui porte C71 (`03746f9`), chacun rendant
l'arbre de son écran au nœud près — l'arbre à la profondeur 12, au rejeu,
contre `main` (310 784 810) :

| candidat | ce qu'il change | l'arbre à 12 | banc à 7 et à 6 |
|---|---|---|---|
| C72 (`84d51c8`) | trois plis de plus aux nœuds de coupure, au lieu de deux | +1,46 % | 77 508 ; 38 481 |
| C73 (`55816c7`) | le poids de la correction × 1,5 | +3,47 % | 72 373 ; 37 430 |
| C74 (`ffc469c`) | C65 reporté : la variante principale en table, la forme de Stockfish | +27,82 % | 85 156 ; 41 444 |

Tous les tests passent sous chacun.

**Le match** — contre `main` (`03746f9`), `8+0,08`, graine « auto »,
AVX2, le livre de 15 000 : **quatre jobs** pour C72 et C73, **huit** pour
C74, dont l'effet mesuré seul (+2,79 ± 3,09) tient sous ce qu'en voient
quatre.

*Attendus, écrits avant* — <span>confiance faible</span> : C72 **−3 à
+4** — de un à deux plis la pente était de +1,8, et le troisième grossit
l'arbre au lieu de le réduire ; C73 **−3 à +5** — de mi-poids à plein
poids, +3 ; C74 **−4 à +8** — Stockfish emploie le relâchement aux nœuds
PV avec la réduction aux nœuds de coupure, et C63 réduit désormais
ailleurs ce que l'un relâche.

**Le critère, écrit avant** : fusionne celui dont la borne basse contre
`main` passe zéro ; plusieurs, leur composition se mesure contre `main`
avant d'entrer, comme C71. Sinon `main` reste, et chaque réglage garde
sa valeur au registre, déprioritisé si son point est sous +2.

### N° 23 — C72, C73, C74 : VERDICT, relevé le 5 nov. à 0 h 50 — aucun ne passe, `main` reste

**Les seize matchs**, lancés le 4 nov. à 18 h 47, finis entre 23 h 32 et
23 h 48, 2 800 parties chacun, **aucune perte au temps**, 6,09 à 6,42 s
par partie ; contre `03746f9`. **Un job perdu** : 41880559592, le
septième de C74, a perdu son runner à 22 h 21 en pleine partie (« *The
hosted runner lost communication with the server* », lu dans ses
annotations), sans résumé ni journal — la panne du n° 13, indépendante
du résultat. **Relancé à 0 h 46** (tentative 2, même graine : la
première n'a rien joué de compté), parce que le plan en écrivait huit ;
**fini le 5 nov. à 5 h 40**, +5,58 ± 6,16, aucune perte au temps.

| candidat | les jobs | en commun | homogénéité | attendu |
|---|---|---|---|---|
| C72, trois plis aux nœuds de coupure | −3,72, −1,24, +1,49, +3,10 | **−0,09 ± 3,10** | p = 0,436 | −3 à +4 |
| C73, le poids de la correction × 1,5 | −5,58, −4,22, −7,69, −6,33 | **−5,96 ± 3,09** | p = 0,860 | −3 à +5 — **sous l'attendu** |
| C74, C65 sur C71, huit jobs | +6,08, +1,86, −3,35, −1,12, +2,23, −0,00, **+5,58** (relancé), +1,61 | **+1,61 ± 2,23** | p = 0,451 | −4 à +8 |

**Le critère, écrit avant** : aucune borne basse ne passe zéro — C74,
la plus haute, −0,62 à huit jobs — **aucun ne fusionne, `main` reste**.
Lue à sept jobs le 5 nov. à 0 h 50 (+1,05 ± 2,40), la décision ne
pouvait changer que si le huitième rendait **+10,6 ou plus** — ~0,2 %
des fois à l'effet mesuré ; il a rendu +5,58, et la relève de 5 h 55
l'a seulement complétée.

**Ce que les trois points disent** :
- **C72 — plat de deux à trois plis.** De un à deux, +1,8 ; de deux à
  trois, −0,1, pour +1,46 % d'arbre. Le bonus aux nœuds de coupure est à
  son plateau : **déprioritisé**, à reprendre par SPSA.
- **C73 — une régression démontrée**, borne haute −2,87, chacun des
  quatre jobs sous zéro. De mi-poids à plein poids, +3 ; de plein à
  × 1,5, **−6**. L'optimum est autour du plein poids — les poids de
  Stockfish 17.1. <span>Inférence, confiance faible</span> : une
  correction trop forte suit le bruit des dernières recherches plus que
  l'erreur de l'évaluation. **Déprioritisé** : × 0,75 et × 1,25 les
  seuls points ouverts, marge ~0 à +2.
- **C74 — la variante principale en table ne rend rien, même sur la
  base qui porte la réduction aux nœuds de coupure** : +1,61 pour
  +27,82 % d'arbre, contre +2,79 pour +25,6 % sur l'ancienne base.
  L'attendu supposait que l'un rendait ce que l'autre réduisait ; la
  mesure ne le voit pas. **Déprioritisé**, la quatrième forme sans
  gain.

**Les réglages de la phase 4 sont tous à leur plateau** — le diviseur
et le décalage de la note, la mémoire de la gravité, le bonus aux nœuds
de coupure, le poids de la correction : chacun plat ou perdant d'un pas
de part et d'autre de `main`. Ce qui reste à y chercher, quelques Elo,
revient à SPSA, qui les réglera ensemble.

### N° 23 — le test des extensions singulières : mesuré sur `main` le 3 nov., traitement écrit avant le verdict de C59

**Le test** — `les_extensions_singulieres_allongent_l_arbre` somme les
nœuds du banc à la profondeur 9, avec et sans les extensions
singulières (l'extension négative coupée des deux côtés), et asserte que
l'arbre s'allonge. **Il tombe sous C58 et sous C59**, deux changements
de la LMR modulée sans rapport avec les extensions.

**La mesure, sur `main` seul** — indépendante des deux candidats :

| profondeur | avec / sans | positions où l'arbre s'allonge |
|---|---|---|
| 7 et 8 | 1,000 | 0 sur 6 — le mécanisme n'agit pas encore |
| **9** | **1,041** | 6 sur 6 |
| 10 | 1,087 | 5 sur 6 |
| 11 | 1,261 | 6 sur 6 |

**Ce qu'elle dit** : sur `main`, l'assertion tient, à 4 % de marge —
**elle ne la condamne pas**, et le test reste tel quel. Mais une marge de
4 % au total est de l'ordre de ce qu'un réglage de la LMR déplace (C58
retire 7 % de l'avance sans toucher aux extensions) : le piège nommé
dans `CLAUDE.md` — un sens asserté sur un échantillon vaut ce que vaut
sa marge.

**Le traitement, écrit avant le verdict de C59** : si C59 gagne, le test
passe à la profondeur 11 — la marge de `main` y est six fois plus
grande — s'il y tient sous C59 ; sinon il ne garde plus que le
branchement (avec ≠ sans), le sens restant gardé par
`un_coup_n_est_singulier_que_si_l_exclusion_echoue_sous_la_borne` et ses
voisins, qui l'assertent sur des positions construites pour lui.

### N° 23 — le livre déséquilibré : VERDICT, relevé le 3 nov. à 13 h 40 — notre livre reste

**Les douze matchs**, lancés à 7 h 26. Les deux de calibration sur le
livre déséquilibré ont été **coupés par le plafond de 350 minutes**, à
2 580 et 2 600 parties sur 2 800 — un match à longueur fixe coupé garde
une estimation non biaisée ; les dix autres finis entre 12 h 58 et
13 h 11. **Aucune perte au temps.** Chaque effet, par paire, sur les
deux livres — `t = (score moyen − ½) / écart type`, lu sur la somme des
comptes pentanomiaux ; IC par rééchantillonnage des paires :

| effet connu | notre livre | le livre déséquilibré | rendement `(t_d / t_e)²` |
|---|---|---|---|
| `10+0,10` contre `8+0,08`, `0d2b188` | +26,48 ± 4,10 (5 600 parties), `t` 0,240 | +33,71 ± 4,74 (5 180), `t` 0,275 | **× 1,31** [0,85 ; 2,03] |
| C53 contre `0e43fdd` | +14,40 ± 3,08 (2 nov.), `t` 0,123 | +16,42 ± 3,36, homogènes, `t` 0,128 | **× 1,09** [0,59 ; 2,01] |
| C54 contre C53 | +23,18 ± 3,15 (2 nov.), `t` 0,194 | +24,11 ± 3,33, homogènes, `t` 0,190 | **× 0,97** [0,66 ; 1,43] |
| **les trois, en log, pondérés** | | | **× 1,11 [0,85 ; 1,44]**, homogènes (Q = 1,07, p ≈ 0,59) |

**Le critère, écrit avant** : un rendement au-dessus de × 1,3, borne
basse comprise — **non rempli**, ni par la calibration seule (0,85), ni
par les trois effets ensemble (0,85). **Notre livre reste le livre des
matchs**, et la ligne retourne au registre.

**Et le temps** : une partie du livre déséquilibré dure **~13 % de plus**
— 7,15 à 7,35 s pour C53 et C54, contre 6,29 à 6,61 s pour les mêmes
matchs sur notre livre le 2 nov. ; la calibration y a touché le plafond.
**Par heure de runner, le rendement tombe à ~× 0,98.**

**Les attendus, écrits avant** :
- le rendement, × 1,3 à × 3 — **manqué**, en dessous ;
- les nulles, 10 à 25 % — **manqué** : 34 à 36 % sur le livre
  déséquilibré, contre 46 à 48 % sur le nôtre ; elles baissent d'un
  quart, pas de moitié ;
- les témoins du même signe — **tenu** : +16,42 et +24,11 contre +14,40
  et +23,18, les mêmes effets à l'erreur près.

**Ce que ça dit** — *pourquoi* il ne paie pas n'est pas mesuré. Ce qui
l'est : le camp favorisé y convertit trop rarement pour que les paires
1–1 dominent (somme ≠ 1 : 41 % des paires au pilote), et l'adjudication
de nulle en ramasse une part. Un livre plus déséquilibré — la bande
[400, 600), jamais jouée — déplacerait ce compromis ; <span>marge
estimée faible, confiance faible</span>, au registre derrière les autres
leviers du débit. **Et la calibration rend +26,5 ± 4,1 sur notre livre**,
sous les ~+35 que l'étalon du 24 sept. prédisait pour × 1,25 de temps —
un étalon d'une autre base, à quarante jours et d'autres réseaux de
distance ; noté, pas interprété.

### N° 23 — l'inférence multicouche : écrite le 2 nov., prête pour le verdict de C3

**La décision** — la feuille de route du 31 oct., point 3 : écrire dans
le moteur l'inférence d'un réseau à couches cachées, confrontée au code de
bullet, pour qu'un réseau multicouche s'entraîne dès que C3 dit si la
largeur paie (point 5, « 1 024 et couches cachées »).

**La pile** — celle de l'exemple de bullet, lue au source du commit
épinglé (`examples/progression/4_multi_layer.rs`, et `select`, qui prend
le bloc contigu du seau — `crates/compiler/src/model/builder.rs`) :
l'accumulateur en `CReLU`, ses deux moitiés multipliées terme à terme —
`HIDDEN / 2` produits par camp, le camp au trait d'abord —, puis
`HIDDEN → l1` en `SCReLU`, `l1 → l2` en `SCReLU`, `l2 → 1`, un jeu de
poids par seau de sortie. Le fichier, dans l'ordre de `SavedFormat` :
l'accumulateur en `i16` par `QA`, la première couche dense en `i8` par
`QL1` = 64, ses biais et les deux couches suivantes en `f32`, chaque
matrice transposée en lignes de sortie, puis le bourrage au multiple de
64 octets.

**Dans le moteur** (`engine/src/nnue.rs`) — `Arch::layers`, `None` pour
tous les réseaux d'aujourd'hui, l'embarqué compris : le banc et l'arbre
sont inchangés. La première couche dense se calcule en entiers EXACTS —
chaque activation au plus `QA²`, chaque tranche de 256 termes tient dans
un `i32`, vérifié à la compilation ; les deux suivantes en `f32`, dans un
ordre fixe. Pas encore de SIMD : la vitesse se mesurera sur un vrai réseau,
contre ce calcul scalaire, qui reste la référence. **Dans l'entraîneur**
(`tools/nnue-train`) : le graphe et le format de l'exemple quand
`ARCH.layers` est posé, `l0` initialisé à une taille d'entrée effective de
32 comme lui ; le nom des points de sauvegarde porte `-l16x32`.

**Les preuves** — quatre tests, chacun éprouvé :
- la taille du fichier, calculée à la main pour 128 à 1 024 unités ;
- un flottant non fini refusé, au premier comme au dernier poids, et des
  couches plus larges que la pile refusées ;
- **la sortie contre un calcul de référence en `f64`**, qui relit les
  octets sans passer par `Network` : à ±1 près, sur toutes les positions
  du jeu de test et deux réseaux aléatoires. Deux fautes injectées — les
  camps échangés, le biais de la première couche retranché — le font
  tomber ;
- l'accumulateur dérivé coup par coup rend la même évaluation que le
  recalcul.

**Ce qui reste — et qui ne se fait qu'à la carte** : la confrontation à
bullet lui-même, `trainer.eval × 400` contre le moteur, sur le premier
réseau multicouche entraîné ; `tools/nnue-train` l'imprime au bout de
l'entraînement, au critère de tous les réseaux — écart médian ≤ 15,
maximal ≤ 50. Le calcul de référence ci-dessus suit le graphe de bullet,
mais c'est une lecture ; seule la confrontation sur un réseau entraîné dit
que la lecture est juste.

### N° 19 — le réglage automatique (SPSA) : l'outillage, écrit pendant les vagues du n° 18

**Pourquoi maintenant, et ce que cela ne fait pas.** Le n° 19 est décidé
(chaîne du 13 oct.) et vient **le réseau stabilisé** : les marges
appartiennent au réseau (B8), et régler sur N5l ce que le n° 18 remplacera
serait à refaire. L'OUTILLAGE, lui, ne dépend d'aucun réseau : il s'écrit
pendant que les vagues tournent — Théo, 14 oct. : « *Y'a rien que tu peux
faire en parallèle sans affecter la suite en attendant ?* ». Rien de ce qui
est en vol n'en dépend : vagues, séries C13 et balayage sont épinglés à
`c4697e2`.

**Le mécanisme — des réglages à la COMPILATION, jamais des options UCI.**
Chaque constante réglée devient `reglage!(NOM: type = défaut)` : sans la
variable d'environnement `SR_NOM`, la constante vaut son défaut, et le
binaire par défaut est le même — le banc et l'empreinte des deux binaires
le prouvent ; avec elle, la constante prend sa valeur au moment de
compiler. Pourquoi pas des options UCI :
- aucun coût en jeu : une option se lit à chaque nœud, une constante se
  plie dans le code machine ;
- l'arbre par défaut ne PEUT pas bouger, et aucun chemin de lecture ne
  s'ajoute à la recherche — une option se règle de travers en silence ;
- le prix : un binaire par jeu de paramètres, deux par perturbation, ~2 à 3
  minutes de compilation sur un runner — petit devant une heure de parties.

Éprouvé avant de l'écrire, sur une crate jetable : la constante prend le
défaut sans variable, `137` et `-12` avec, et une valeur illisible arrête la
compilation (« *réglage illisible* ») au lieu de jouer avec un défaut.

**Les paramètres de la première passe — des MARGES, pas des seuils de
profondeur.** SPSA perturbe chaque paramètre de ± c ; un seuil entier de
plage 3 à 8 ne se perturbe que d'un pli, soit ± 20 à 30 % d'un coup :
bruit et biais d'arrondi y dominent. D'abord les grandeurs à plage large —
défaut, plage, perturbation c de fin :

| réglage | défaut | plage | c |
|---|---|---|---|
| `RFP_MARGIN` — futilité inverse, par pli | 100 | 40 à 220 | 10 |
| `FP_BASE` — futilité aux nœuds frontières | 140 | 60 à 280 | 12 |
| `FP_PER_DEPTH` — sa pente | 20 | 4 à 50 | 3 |
| `SEE_PRUNE_MARGIN` — capture perdante, par pli | 100 | 40 à 220 | 10 |
| `SINGULAR_MARGIN` — extensions singulières, par pli | 10 | 3 à 30 | 2 |
| `ASPIRATION_DELTA` — avant le facteur du réseau | 25 | 8 à 60 | 4 |
| `DELTA_MARGIN` — élagage delta, avant le facteur | 200 | 80 à 400 | 20 |
| `LMR_BASE` — terme constant de LMR, en centièmes | 75 | 0 à 200 | 12 |
| `LMR_DIVISEUR` — diviseur du produit des logarithmes, en centièmes | 225 | 120 à 400 | 15 |
| `LMP_BASE` — élagage par compte de coups | 6 | 2 à 14 | 1 |

`NETWORK_MARGIN_PERCENT` reste figé : il multiplie l'aspiration et l'élagage
delta, qui se règlent eux-mêmes ; le régler aussi ferait deux paramètres
d'une seule direction.

**L'algorithme — SPSA par manches, le pilote sur les runners.** Une manche :
- `J` jobs en parallèle ; le job `j` tire `Δⱼ ∈ {−1, +1}ᵏ` d'une graine
  fixée par la manche et `j`, construit `θ + c·Δⱼ` et `θ − c·Δⱼ` — arrondis
  à l'entier, bornés à la plage —, et joue `P` paires d'ouvertures, couleurs
  échangées, l'un contre l'autre, à `8+0,08`, le livre du dépôt ;
- un job d'agrégation lit les `J` scores et met à jour
  `θ ← θ + a · moyenne_j((s⁺ⱼ − s⁻ⱼ) / (2c) · Δⱼ)`, borné à la plage ;
  il écrit `θ` dans son résumé et en artefact, puis lance la manche
  suivante ;
- la chaîne tient sans le conteneur, qui dort entre deux tours : chaque
  manche lit son `θ` en entrée et passe le suivant à la manche qu'elle lance.
  <span>De mémoire, confiance moyenne</span> : le jeton `GITHUB_TOKEN` d'un
  job peut lancer un `workflow_dispatch`, à la différence des autres
  événements — **à éprouver par l'essai**, pas à supposer.

**Le budget, écrit avant** — <span>inférence, confiance faible</span> : les
réglages SPSA publiés de moteurs amateurs emploient de l'ordre de 20 000 à
80 000 parties pour une dizaine de paramètres, à cadence courte. À
`8+0,08`, un runner joue ~1 500 parties par heure (trois à la fois,
~7,25 s chacune) : **huit jobs d'une heure font ~12 000 parties par manche,
trois à six manches** — une demi-journée de runners, à ne lancer qu'une fois
le réseau du n° 18 embarqué et les vagues finies.

**La cadence du réglage est celle de la mesure, `8+0,08`** : un réglage
appartient à sa cadence comme un verdict (`CLAUDE.md`) — régler court
optimiserait un régime qui n'est pas la cible.

**Le verdict reste un match.** Le `θ` final est un candidat comme un autre :
commit révoqué, quatre jobs de 2 800 parties à `8+0,08` contre `main`,
critère écrit avant ; puis C13 à 3100. Un réglage SPSA prédit bien sur son
propre bruit : seul le match dit s'il joue mieux.

**L'ordre de l'écriture** : (1) le mécanisme dans le moteur, le binaire par
défaut prouvé identique ; (2) le pilote, <s>`tools/spsa.py`</s>
`tools/src/bin/spsa.rs` — en Rust comme le reste de l'outillage, ses tests
dans la CI ; (3) le workflow `spsa.yml` ; (4) un essai court — deux jobs,
quelques parties à cadence courte — qui éprouve la chaîne, pas un réglage.

**(1) à (3) ÉCRITS le 14 oct.** :
- **le mécanisme** : `reglage!` et `reglage_lu` dans `engine/src/search.rs`,
  les dix constantes du tableau converties — `LMR_BASE` et `LMR_DIVISEUR`
  en centièmes, 0,75 et 2,25 exacts en binaire. **Sans variable, le code
  machine est celui d'avant à l'octet** : sections `.text` et `.rodata`
  identiques, seules `.data.rel.ro` — les numéros de ligne des
  emplacements de panique, que les lignes ajoutées décalent — et
  l'identifiant de build diffèrent ; banc 70 452. **Avec une variable, elle
  prend** : `SR_LMP_BASE=9` rend 77 099 nœuds au banc. Éprouvé dans les
  deux sens : une valeur illisible et une valeur hors du type arrêtent la
  compilation — la seconde ne le faisait pas au premier jet, un négatif
  replié dans `usize` passant l'aller-retour par `i64` ; borné par `i128`
  depuis. **Crible local des vingt mutants de `reglage_lu`**, sur les tests
  du moteur : **19 attrapés, 1 expiré** — `i += 1` en `i *= 1`, une boucle
  sans fin —, **aucun survivant**. *Prédiction pour le balayage qui suivra
  la fusion, écrite avant* : **`search.rs` reste à 48** — les constantes ne
  se mutent pas, le lecteur est couvert, et les mutants neufs de
  `build_lmr_table` (`/ 100.0` en `* 100.0` ou `% 100.0`) changent la table,
  donc le banc figé. **RELEVÉ le 14 oct. à 15 h 35 : 163, exact**, `search.rs`
  à 48 (run 38548275506) ;
- **deux rustines de l'attic portées** : `b8-sonde-marges.patch` — celle
  qu'on rejoue à chaque réseau neuf — et `c44-marge-singuliere-5.patch`
  ne s'appliquaient plus, leur contexte ayant bougé. Le `verify.sh` complet
  l'a vu, le rapide non ; la première portée, construite, régénérée, la
  seconde équivaut désormais à `SR_SINGULAR_MARGIN=5` ;
- **le pilote** : huit tests, dont la vérité terrain — seize manches de
  huit jobs simulés autour d'un optimum connu rapprochent l'état de plus
  de moitié ; deux fautes injectées attrapées, le signe de la mise à jour
  inversé et un simulateur sans signal ;
- **le workflow** : `préparer` fige le SHA du moteur et la liste des jobs ;
  `jouer` tire, construit les deux camps — refuse s'ils sont le même
  binaire —, joue, lit le score ; `agréger` met l'état à jour, le dépose en
  artefact `spsa-etat` et lance la manche suivante.

**(4) l'essai court, RELEVÉ le 14 oct. à 12 h 30 — la chaîne tient, comme
attendu.** Runs 38548271784 (manche 1) et **38548577735** (manche 2, lancée
par la 1), `main` à `c64d532`, deux jobs de dix paires à `1+0.01` :
- **le jeton du job lance la manche suivante** : la 1 a appelé
  `gh workflow run` à 12 h 17 min 54 s, la 2 a démarré dans la seconde,
  avec le SHA figé, `etat_run` la 1 et `manches` 1 — l'exception de GitHub
  pour `workflow_dispatch` tient, éprouvée et non plus de mémoire ;
- **les deux camps sont deux moteurs** : empreintes distinctes à chaque
  job, l'écart tiré visible au journal — `RFP_MARGIN` 81 contre 119,
  `LMP_BASE` 8 contre 4 à la manche 2, où `c_k` vaut 18,99 pour `c_fin` 10,
  soit `(12 000 / 21)^0,101`, la formule à la main ;
- **l'état passe d'une manche à l'autre** : la 2 lit l'artefact de la 1
  (`RFP_MARGIN` y part de 100,07, où la 1 l'avait laissé) et finit à
  `manche 2`, **40 paires sur 12 000** ;
- **le coût fixe d'un job** : ~60 s de compilation et d'arbitre, puis les
  parties — négligeable devant l'heure d'un job à `8+0,08`.

L'état produit est jeté : la cadence n'est pas la mesure. **L'outillage
est prêt** ; le réglage attend le réseau du n° 18.



### Ce qui reste à faire, par ordre mesuré

Ce qui reste à faire vit au backlog de la mémoire, qui seul fait foi :
`python3 .socle/socle state` en calcule le prochain jalon et les sujets
prêts, et `memory/backlog/` porte chaque sujet (D-0009). L'ancienne
feuille de route, validée par Théo le 31 oct. 2026, en est partie le
13 nov. : elle se relit au commit 88da289 de git, et c'est elle que
désignent les renvois « feuille de route, point N » de ce fichier et du
code. Le 17 nov. (D-0017), en sont partis aussi les phases de « La file »,
réécrite le 20 oct., et le tableau des chantiers de « L'histoire de
l'ordre » : chaque ligne encore ouverte est au backlog, les idées non
décidées comprises, qui y attendent leur décision (D-0020, B-0065). Leur
texte est au journal (J-2026-11-17-AF, J-2026-11-17-AI) : c'est lui que
désignent les renvois « La file », « phase N » et « L'histoire de
l'ordre » plus haut dans ce fichier, sauf les deux récits titrés « La
file, phase 2 », restés en place, et ceux qui citent le registre ou les
réglages ouverts. Ceux-là sont depuis le 18 nov. deux faits de la
mémoire, F-0009 (réseau) et F-0010 (recherche), et le texte de leur
ancienne section, que désignent les renvois « Les réglages ouverts » et
« le registre » plus haut, même accolés à « La file », est au journal
(J-2026-11-18-B).

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

### `tools/etat.sh` — l'état calculé, à lancer à la main

`CLAUDE.md` est réinjecté après chaque compactage ; **le carnet de bord, non.**
Le document qui portait « où on en est » manquait donc au moment précis où la
mémoire venait d'être perdue. Le 22 sept. 2026, un engagement pris en prose —
*« j'attaque B9, je te reviens avec son coût monothread »* — a disparu
exactement comme ça : ni fiche, ni journal, ni ce fichier ne le portaient.
Du 22 sept. au 13 nov. 2026, le hook `SessionStart` lançait donc `etat.sh`,
et sa sortie entrait dans le contexte du modèle au démarrage, à la reprise,
après `/clear` et après chaque compactage.

**Depuis le 13 nov., c'est l'état du socle qui s'imprime à ces moments-là**
(`python3 .socle/socle state`) : la branche, ce qui n'est pas fusionné, et
les branches à faire supprimer, hors celles que la politique garde.
Théo a validé de ne garder que lui (D-0009) : la feuille de route, que le
backlog de la mémoire remplace, les renvois vers ce fichier et l'adresse du
carnet, qui n'étaient que dans `etat.sh`, sont partis avec. Le script reste,
comme outil à lancer à la main.

**Tout ce qu'il imprime est dérivé de git**, donc rien ne peut y vieillir :
branche, arbre propre ou non, `git log origin/main..HEAD`, et le nombre de
fichiers `.rs` contre `.md` modifiés depuis `main`. Ce dernier est le **signal
de documentation** : il ne prescrit rien, il constate — *« 6 fichiers de code
et 0 de documentation » est un fait, « il faudrait documenter » est une
consigne qu'on oublie.*

**Et les branches distantes à faire supprimer par Théo, depuis le 5 oct.
2026.** Une branche que `main` contient en entier se supprime sans rien
perdre, mais pas d'ici : le jeton de session ne peut pas supprimer une
référence distante (vérifié le 22 sept., section D5). Théo a demandé qu'on
les lui signale à chaque point de récap, comme toute action humaine
nécessaire ; `etat.sh` les calcule sur les références du dernier `fetch` —
jamais `main`, ni la branche de travail, ni celles que la politique garde
(`[human] keep_branches` de `.socle/policy.toml` : un autre agent, les
réseaux). Il lit les motifs dans la politique et les compare par la
fonction du socle, depuis le 17 nov. 2026 ; avant, il n'excluait que
`codex/…` (B-0036). La ligne se tait quand il n'y a rien à supprimer :
c'est pourquoi `tools/etat-test.sh` l'éprouve sur des dépôts fabriqués,
dans `verify.sh`, avec leur propre politique : la détection, chaque
exclusion, pour chaque forme de motif un témoin voisin qui doit rester
signalé, une politique vide qui doit tout proposer, et un filtre en échec
qui doit le dire avec sa cause.

`tools/verify.sh` vérifie que le script **rend un état non vide** : un script
devenu muet ne se verrait pas, on croirait simplement qu'il n'y a rien à dire.

### `tools/carnet-vers-md.py` — le carnet de bord converti en Markdown

Un outil de l'adoption du socle, écrit le 12 nov. 2026 : il sert le temps
de déplacer le carnet de bord vers la mémoire, puis s'en va. Le carnet est
un artefact claude.ai, une page HTML ; `python3 -I tools/carnet-vers-md.py
<carnet.html> <dossier de sortie>` en rend le journal au format du journal
de la mémoire, un fichier par mois coupé au budget, les entrées les plus
anciennes d'abord et leurs identifiants gardés, chaque autre rubrique
dans son fichier, et de même ce que la page porte hors de ses rubriques :
son bandeau, sa navigation, son pied. Il n'écrit que dans le dossier de
sortie, jamais dans la mémoire : poser ses fichiers est le travail des
lots suivants.

Ce qui le tient : un contrôle de fidélité qu'il lance lui-même à chaque
conversion, et qui lui fait rendre le code 1. Tout le texte que la page
affiche doit se trouver dans un fichier écrit, et dans un seul ; et les
caractères de mot de la source de chaque fichier doivent s'y retrouver
tous, dans l'ordre, une fois mis à part ce que la conversion ajoute — la
cible d'un lien, le numéro d'un item, l'identifiant d'une entrée. Il ne
voit ni la ponctuation ni la mise en forme.

Pourquoi il est dans le script : le premier contrôle était un compte de
mots lancé à la main, qui ne regardait que les rubriques. Il avait bien
montré un tableau perdu dans une définition, 74 mots ; il ne pouvait pas
voir que le bandeau de la page, 6 % de son texte, ne sortait dans aucun
fichier, et c'est une revue qui l'a dit. Le contrôle d'aujourd'hui a été
éprouvé le 12 nov. 2026 en plantant des pertes dans des copies du script :
deux passaient d'abord à tort, et l'ont fait reprendre deux fois.

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
test en `z` et **refuse de conclure en silence** quand le plus grand écart
est trop rare sous un seul effet. <s>Au-delà de `z = 2`.</s> **Seuil
recalibré le 5 oct. 2026** : `z = 2` fixe valait un refus sur vingt-deux à
DEUX matchs, mais à quatre il y a six paires, et le plus grand de six `z`
dépasse 2 près d'une fois sur cinq quand tous mesurent le même effet — le
seuil a refusé C34, C36 et C38 ce jour-là, à tort, et un avertissement qui
crie au loup cesse d'être lu. Le script rend désormais la probabilité du
plus grand écart sous l'étendue studentisée à `k` matchs, et refuse sous
4,55 %, le niveau qu'avait `z > 2` à deux matchs : **à deux matchs, la
décision est celle d'avant** ; à quatre, C33 (`z = 3,02`, p = 0,013) reste
refusé. Calcul confronté à une intégrale et un tirage indépendants du
script (`tools/mettre-en-commun-test.sh`).

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

- **Les données d'entraînement n'ont qu'une copie passé 90 jours** — les
  artefacts de `nnue-datagen.yml` portent `retention-days: 90` : ceux du
  n° 18 expirent vers la mi-janvier 2027, ceux de l'étape B, de (e) et du
  n° 21 dans les semaines qui suivent. Après, `~/shallowred/donnees/` sur
  la machine de Théo est la seule copie, et `nnue-validation.yml`, qui
  télécharge les artefacts, ne peut plus mesurer la perte tenue à l'écart
  sur un job expiré.
  <br>**Relevé à l'API le 6 nov. 2026** : 703 artefacts `nnue-`, 85,7 Go.
  Par génération, avec la date d'expiration du dernier artefact :
  - n18 : 8,5 Go, au 14 janv. 2027 ;
  - n20 : 9,3 Go, au 18 janv. ;
  - n20e : 4,2 Go, au 19 janv. ;
  - n21 : 9,3 Go, au 24 janv. ;
  - n22 : 52,0 Go, au 29 janv. ;
  - 25 artefacts hors registre (sondes et vagues de septembre et du
    7 oct.) : 2,4 Go.

  **Ce stockage ne coûte rien et n'occupe aucun quota.** Le source de la
  documentation de facturation (`github/docs`,
  `content/billing/concepts/product-billing/github-actions.md`, lu le
  6 nov.) ne mesure le stockage que « *For private repositories* ». Le
  dépôt est public, et il porte 86,5 Go d'artefacts quand le quota de
  GitHub Free est de 500 Mo, sans qu'aucun envoi ait été refusé. Théo
  demandait s'il fallait supprimer les données des anciens réseaux : une
  suppression ne libère rien de facturé, elle est irréversible, et elle
  couperait la perte tenue à l'écart sur les jobs supprimés. Tout
  disparaît de toute façon fin janvier.
- **Les runners changent de MODÈLE, pas seulement de vitesse** — relevé le
  24 sept. 2026 : EPYC 7763, EPYC 9V74 et EPYC 9V45 dans la même nuit, de
  2,02 à 4,06 M n/s au banc sur des binaires voisins. Un verdict reste valide
  en interne ; deux runs ne se comparent qu'après lecture de leurs
  étalonnages, et un chiffre de vitesse ne se recopie jamais d'un run à
  l'autre.
- **La durée du balayage de `search.rs` monte avec le fichier** — 107
  minutes le 6 oct., 145 à 164 le 7, coupé à 180 le 12 oct. (781 mutants sur
  817). La limite du job est passée à 350 minutes, sous les six heures d'un
  runner hébergé. Rien ne signalera qu'elle s'approche : un job coupé rend un
  résumé INCOMPLET et un verdict « illisible », pas une alerte de durée. Au
  premier job au-delà de ~300 minutes, découper le fichier par
  `cargo mutants --shard`, le verdict sommant les morceaux — le plafond ne
  monte plus.
- **L'image des runners change le 19 oct. 2026** — `ubuntu-latest` passe à
  Ubuntu 26 (annonce de `actions/runner-images`, issue 14748, lue le 12 oct.
  dans les annotations des jobs de génération du 7). Le moteur n'en bouge
  pas : la toolchain Rust est épinglée (`rust-toolchain.toml`), et un
  match oppose deux binaires sur la même machine. **Ce que le runner
  installe lui-même, si** : le compilateur et Qt6 qui construisent les
  arbitres (`tools/setup-arbiters.sh`), et l'adversaire de C13, que `apt`
  fournit. `force.yml` est donc épinglé à `ubuntu-24.04` depuis le 12 oct.,
  et **refuse tout Stockfish autre que 16** : l'échelle de `UCI_Elo`
  appartient à sa version, et une autre rendrait un chiffre plausible et
  incomparable. Les autres workflows restent sur `ubuntu-latest` : le
  premier match d'après le 19 se lit en vérifiant que ses arbitres se sont
  construits et que son étalonnage tombe dans la plage connue.
- **Le livre, réutilisé** — mesuré le 1er oct. 2026, sur les deux matchs de
  B8, dont les pentanomiaux sortaient presque identiques. `tools/book.epd`
  porte **500 ouvertures** ; fastchess (`60d7a7a`, `opening_book.cpp` et
  `base_scheduler.hpp`, lus) le mélange UNE fois à la graine, puis le
  parcourt en boucle, une ouverture par paire. Un match de 3 000 parties joue
  donc chaque ouverture **trois fois**, et deux matchs « à graines
  distinctes » jouent **les mêmes 500**, dans un autre ordre. Ce que cela
  coûte, mesuré sur les deux tiers de chaque journal que l'API sert
  (rondes 511 à 1 500) : les scores de paire d'une même ouverture sont
  **presque indépendants** — r = 0,070 et −0,034 dans un match (490 et 489
  couples), r = 0,035 entre les deux (1 958 couples ; l'ordre reproduit au
  source, et vérifié contre un vrai run de fastchess à la même graine) ;
  témoins, ouvertures différentes : 0,005, 0,012, −0,022. Les parties ne se
  recopient pas — même paire d'issues 22 à 25 % des fois, contre 10 à 12 %.
  La ressemblance des deux totaux de B8 est une coïncidence : sur la fenêtre
  lue, leurs pentanomiaux diffèrent normalement (499 et 483 paires à un point).
  <span>Inférence, confiance moyenne</span> : à ρ ≈ 0,03, l'effet de grappe
  élargit un intervalle mis en commun de **~7 %** (variance × 1,14), de ~18 %
  au plus plausible (ρ = 0,08) ; le ± de fastchess le suppose nul. **Ça ne
  compte qu'au ras d'une borne — et une lecture y est tombée** : la borne
  haute du match 1 de C31, −0,27, passe au-dessus de zéro à ρ = 0,07, pas à
  ρ = 0,02 ; ρ n'est pas assez connu pour trancher, et C31 reste tel que son
  critère l'a lu. **Le remède est un livre plus grand** — `bookgen` le tire
  —, ce qui change une condition de mesure : proposé, pas fait.
  **Recalculé le 6 oct. pour plus de jobs**, la question de Théo l'imposant
  (`CLAUDE.md`, « ce changement vaut la peine d'être mesuré ») : l'effet de
  grappe croît avec le nombre de paires par ouverture, `1 + (m − 1)·ρ`. À
  ρ = 0,03 : quatre jobs, 12 paires par ouverture, variance × 1,33 — le ± de
  fastchess y est 15 % trop étroit, et toutes les mesures du n° 9 en ont
  quatre (aucune n'était assez près de sa borne pour en changer) ; vingt
  jobs × 2,8 ; soixante × 6,4, ± 2,4 réel pour ± 0,96 affiché. À ρ = 0,08,
  le double. **Le livre plus grand devient la condition de « plus de
  runners »** : ~5 000 ouvertures pour vingt jobs, ~15 000 pour soixante.

| quoi | quand ça devient actionnable | pourquoi aucun test ne le dira |
|---|---|---|
| **l'estimation de durée de `match.yml`** | <s>le jour où C21 fusionne</s> **C21 a fusionné le 23 sept.** — reste à relire la durée au **premier match où les DEUX moteurs portent C21** | le facteur **EST** le gaspillage de pendule. Mesuré : 0,75 avec deux moteurs d'avant, **0,85** avec un seul moteur C21, ~0,95 extrapolé pour deux. La notice « les deux matchs historiques ont fait 25 % de plus » deviendra alors fausse. **Le résumé de `match.yml` imprime désormais les s/partie** : la relecture ne demande plus de calcul |
| <s>`mesure/d5-delta` sur le distant</s> | **FAIT le 23 sept.** — supprimée par Théo ; son code est à l'attic | <s>le jeton de session ne peut pas supprimer une référence distante</s> |
| **le déclencheur de B8** | maintenant | sa **lettre** est satisfaite (C12 clos, C18 décidé), son **esprit** non (C17, C19, C21 sont entrés depuis). Ça demande une re-spécification, pas une mesure — donc personne ne peut la calculer |
| <s>`attack_dump.rs` et `see_check.rs`</s> | **FAIT le 23 sept.** — `tools/Cargo.toml` porte `autobins = false` et les deux y sont déclarés (voir `CLAUDE.md`) | <s>autodécouverts par cargo, non déclarés</s> |
| <s>une routine hebdomadaire HORS dépôt, « ShallowRed — verdict du balayage par mutation »</s> | **FAIT le 23 sept. au soir** — supprimée, **remplacée** par `tools/balayage-vivant.sh` dans la CI | **Vérifiée avant d'être jugée, et c'était pire qu'un doublon.** Les quatre issues « mutation » viennent toutes du job `Verdict` ; aucune d'elle. Le 22 sept., seul mardi où le cliquet a cassé sur `main`, GitHub a lancé le cron de 00:00 avec **3 h 48 de retard** : la routine de 03:00 a lu l'exécution précédente et s'est tue. Elle avait pourtant **une** fonction que rien d'autre ne tenait — dire que le balayage ne tourne plus, ce que GitHub provoque sur un dépôt public après soixante jours sans activité. C'est cette fonction-là qui est entrée dans le dépôt, testée |
| **la profondeur EN PARTIE à concurrence 3 sur deux cœurs physiques** | avant de comparer un point de fonctionnement à un autre — cadence, runner, conteneur | l'étalonnage mesure un banc SEUL sur la machine ; trois moteurs sur deux cœurs physiques (SMT, mesuré le 23 sept.) cherchent moins profond. Symétrique, donc aucun verdict ne se fausse — mais « profondeur 12 à `8+0,08` » décrit le banc, pas les parties. Se mesure par la profondeur non appariée des coups d'un témoin joué à concurrence 3 contre celle de la sonde témoin, sur des runners au banc voisin |
| **le banc et `tools/timing.sh` évaluent À LA MAIN, le moteur joue avec le réseau** | depuis le 28 sept. 2026 — au premier changement dont on voudra mesurer la vitesse, ou l'arbre qu'on joue | `Search::new` évalue à la main, et c'est voulu : la référence du banc, ses tests et le crible d'`eval.rs` en dépendent. Mais un changement de l'inférence NNUE ne s'y voit pas, et un rapport de nœuds s'y lit sur l'arbre de la faite main, pas sur celui qu'on joue. Tout reste vert, et la mesure porte sur un autre moteur |
| **les artefacts des données NNUE expirent** | la première vague le **24 déc. 2026**, la vague au réseau le **28 déc. 2026** — les télécharger avant, là où elles serviront | GitHub les supprime sans prévenir. Les regénérer reste possible — le générateur au même commit et les K de chaque run (sections A21 et n° 7) — mais coûte leurs heures de runner : 22 h pour la première vague, 44 h pour la seconde |
| le plafond de mutation | mardi 00:00 UTC | le cliquet casse à la hausse tout seul — mais **un changement de TESTS le déplace autant qu'un changement de code**, et la règle écrite ne visait que le code |
| **les avertissements « PV continues after fifty-move rule / threefold repetition » côté ShallowRed** | à chaque relève de `match.yml` ou de `force.yml` : ils sont la **signature connue de C31** (F-0013), non fusionné — ~1 pour 1 000 parties à `8+0,08` (5 en 6 000 côté référence), 2 en 300 à 60+0,6. Une hausse nette serait un fait neuf ; d'AUTRES natures d'avertissement, un défaut neuf | la relève les lit, rien d'autre : ils ne font échouer aucun job, et le 29 sept. ils ont été relevés sans être lus (`CLAUDE.md`) |
| **les refus d'homogénéité à quatre jobs** | à chaque relève à quatre jobs : **deux sur sept le 5 oct.** (C33, C39), ce qui n'arrive que 3,7 fois sur cent sous un seul effet — et le livre partagé les rend plus rares, pas plus fréquents (section n° 9, troisième écran). Un troisième rendrait le hasard intenable : chercher alors ce qui varie d'un runner à l'autre PENDANT le match, que l'étalonnage du début ne voit pas | `mettre-en-commun.sh` refuse chaque mesure, mais rien ne compte les refus d'une mesure à l'autre ; et aucun verdict n'en dépend tant que chaque job passe seul |
| **les tests « … retire des nœuds » encore comptés sur le banc, ou sur une position** | au prochain changement d'arbre qui en fait tomber un — ou avant, par la sonde sur `main` | `la_futilite_aux_noeuds_frontieres_retire_des_noeuds` (C39, qui entre avec le groupe) somme les six positions du banc, la forme dont la bascule vient d'être mesurée à ~3 % par changement d'arbre pour ses deux voisins ; `lelagage_delta_retire_des_noeuds` s'asserte sur une seule. Ni l'un ni l'autre n'est tombé — et le jour où l'un tombe, on accusera le changement plutôt que la formulation. **Et les sommes sur trente-six positions vieillissent avec leur marge** (7 oct.) : celle de la futilité inverse est tombée sous la composition du n° 12, la marge fondue à 3 % sur `main` — reformulée sur le branchement ; celle de l'élagage par compte garde la sienne, 0,65 sur ses positions, aucune bascule sur 200 000 tirages. La sonde de chacune, à l'attic, se relance après tout changement d'arbre qui touche ce qu'elle garde |
