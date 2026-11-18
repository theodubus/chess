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
  à chaque partie, un fil par recherche ; **et de l'évaluation depuis le
  29 sept.** — `--eval`, défaut le réseau embarqué ; les données d'A21, faites
  à la main, se regénèrent par `--eval '<none>'` (chantier n° 7, plus bas) ;
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
   **écrite le 26 sept.**, son crible de mutation relevé le 28, voir
   ci-dessous ;
3. l'entraînement, sur la carte de Théo — **préparé le 26 sept., fait le
   28** : 11 min 53 s, le critère tenu (écart médian 7, maximal 23) ;
4. le réseau embarqué et sa mesure à `8+0,08` — attendu et critère écrits
   avant — **fait le 28 sept. : +330,61 ± 19,21 Elo, le réseau est
   l'évaluation par défaut**, voir « Étape 4 — VERDICT ».

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
sienne. Un écart de l'ordre de l'évaluation elle-même dirait des entrées mal
indexées, que rien d'autre ne signalerait. **Le programme d'entraînement le
vérifie lui-même** (étape 3), sur un critère écrit avant le premier
entraînement.

#### Étape 3 — l'entraînement, préparé le 26 sept. 2026 : la procédure

**Le programme : `tools/nnue-train/`**, une crate à part — son propre espace
de travail, que la CI ne compile pas : bullet est lourd, et n'entraîne que
sur GPU. bullet y est épinglé au commit `10e7e82`, celui dont le moteur a lu
le source ; l'architecture vient des constantes de `engine/src/nnue.rs`, et
le réseau entraîné est rechargé par le chargeur du moteur. Compilé dans le
conteneur sans CUDA, contre le runtime factice de bullet : le programme
compile, rien de plus n'est vérifiable ici. Trois temps, chacun bloquant :

1. **relire** chaque fichier jusqu'au dernier octet — une partie illisible
   avant la fin est une erreur, pas une fin de fichier — et confronter les
   comptes aux résumés : `--attendu 1098403:125098300` pour la première
   vague ;
2. **entraîner** selon `examples/progression/1_simple.rs` de bullet : 128
   unités, SCReLU, `AdamW`, 40 superlots de 6 104 lots de 16 384 positions,
   `wdl` 0,75, pas d'apprentissage en cosinus de 0,001 à 0,001 × 0,3⁵ — le
   premier pas que bullet recommande (« *start simple, and then
   incrementally increase complexity* »). Les fichiers sont entrelacés, et
   filtrés par le filtre par défaut de `viriformat` — celui des 77,7 M
   positions gardées ;
3. **confronter** le réseau quantifié, chargé par le moteur, à
   `trainer.eval(fen) × 400` sur douze positions dont six au trait noir.
   **Critère écrit avant le premier entraînement : écart médian ≤ 15
   centièmes, maximal ≤ 50.** <span>Inférence, confiance faible</span> :
   estimée à la main, la quantification — poids arrondis à 1/255 dans la
   couche cachée, à 1/64 en sortie — vaut une dizaine de centièmes ; un
   réseau mal indexé s'écarte de l'ordre de l'évaluation elle-même. Un
   échec interdit de mesurer le réseau.

**La procédure, sur la machine de Théo** — précisée le 28 sept. 2026, au
moment de la lui donner, par ce qui se lit au source :

1. installer le pilote NVIDIA, le CUDA Toolkit le plus récent possible et
   Rust (`rustup`) ; `CUDA_PATH` doit désigner l'installation du toolkit —
   `docs/2-getting-started.md` de bullet. **Lu dans `crates/gpu/build.rs`** :
   le build ne compile aucun noyau, il n'appelle pas `nvcc` ; il lie `cuda`,
   `cudart`, `nvrtc` et `cublas` depuis `CUDA_PATH`, sous `lib/x64` sous
   Windows et `lib64` ailleurs, et WSL est prévu (`/usr/lib/wsl/lib`). La
   toolchain que le dépôt épingle s'installe seule au premier `cargo` ;
2. récupérer les quatre artefacts de la première vague — `nnue-36179538497`,
   `nnue-36179541822`, `nnue-36179544454`, `nnue-36179547648`, section
   *Artifacts* de chaque run — **avant le 24 déc. 2026**. Chacun porte un
   fichier par fil de génération, `nnue-<graine>-<fil>.vf`, la graine étant
   le numéro du run : les décompresser tous dans UN dossier ne peut rien
   écraser, et il doit y avoir seize fichiers. **Le programme ne lit que les
   `.vf` posés directement dans le dossier qu'on lui donne**, pas ceux d'un
   sous-dossier (`data_files`) ;
3. **un essai court d'abord** : `cd tools/nnue-train && cargo run --release
   --features cuda -- --attendu 1098403:125098300 --superlots 1 --sortie
   essai <dossier>`. bullet sauvegarde toujours le dernier superlot, multiple
   de `save_rate` ou non (`value.rs`, au commit épinglé) : l'essai traverse
   donc les trois temps — CUDA, les comptes, la sauvegarde, la confrontation
   — et doit finir sur `RÉSEAU PRÊT : essai/shallowred-768x128-1/quantised.bin`.
   Son temps d'entraînement, multiplié par 40, annonce celui du vrai ; un
   échec y coûte des minutes au lieu d'heures ;
4. le vrai : la même commande sans `--superlots 1 --sortie essai` ; il finit
   sur `RÉSEAU PRÊT : checkpoints/shallowred-768x128-40/quantised.bin`,
   197 440 octets ;
5. rapporter, sur une branche : `quantised.bin` et `log.txt` (la courbe de
   perte de bullet) de ce dossier, copiés sous `reseaux/`, et la sortie du
   temps 3 — les douze écarts, le médian, le maximal. L'étape 4 — embarquer
   le réseau et le mesurer — se fait ensuite ici. Un `ÉCHEC — …` à n'importe
   quel temps arrête tout : le message suffit à le diagnostiquer.

**Sur Ubuntu — la machine de Théo, dit-il le 28 sept. : vérifier avant
d'installer.** Un bloc à coller, dont chaque ligne répond à une question :

```sh
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
nvidia-smi | grep -o "CUDA Version: [0-9.]*"
command -v nvcc && nvcc --version | tail -n 2
ls -d /usr/local/cuda* ; echo "CUDA_PATH=${CUDA_PATH:-(vide)}"
ls ${CUDA_PATH:-/usr/local/cuda}/lib64/lib{cudart,nvrtc,cublas}.so
command -v cargo rustup cc git unzip ; cargo --version
```

Trois pièges, chacun vu dans ce qu'on a lu : **un Rust installé par `apt`**
(`cargo` sous `/usr/bin`) ignore `rust-toolchain.toml` — seul `rustup` le
lit — et il est plus ancien que l'édition 2024 du dépôt : passer par
`rustup`, puis `rustup toolchain install 1.98.1`. **`CUDA_PATH`** vaut
`/usr/local/cuda` pour le toolkit des dépôts de NVIDIA (paquet
`cuda-toolkit`), et doit contenir `lib64/libcudart.so`, `libnvrtc.so` et
`libcublas.so` ; un toolkit du paquet Ubuntu `nvidia-cuda-toolkit` range
ailleurs, cas non vérifié ici. **La version du toolkit** (`nvcc`) ne doit pas
dépasser la « CUDA Version » que `nvidia-smi` prête au pilote, et la raison
se lit au source : bullet compile ses noyaux par NVRTC en PTX (`nvrtcGetPTX`,
`crates/gpu/src/runtime/cuda.rs`) et les confie au pilote
(`cuModuleLoadData`), qui les recompile. <span>Inférence, confiance
élevée — la règle de compatibilité de CUDA, pas éprouvée ici</span> : un
pilote refuse un PTX plus récent que lui. **Premier cas réel, le 28 sept.** :
toolkit 13.4, pilote 13.2. Réponse sans toucher au pilote : un toolkit 13.2
à côté (`cuda-toolkit-13-2`), et `CUDA_PATH` ET `LD_LIBRARY_PATH` pointés
sur lui — sans le second, le chargeur peut prendre la `libnvrtc` du 13.4 à
l'exécution. `ldd` sur le binaire le vérifie. Et `unzip` n'ouvre qu'une archive par appel
quand le shell en développe plusieurs : une boucle.

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

**Remesuré le 6 oct. 2026 au soir, avec le réseau qui joue et à arbre
IDENTIQUE — un gain que tous nos verdicts laissent sur la table.** Aucun
binaire du dépôt n'est compilé pour un processeur : `ref.sh`, `match.yml` et
`force.yml` bâtissent pour le x86-64 de base (SSE2), sans `target-cpu` —
vérifié le 6 oct. Le même `main` (`75fae19`), compilé une fois de base et une
fois pour `x86-64-v3` (AVX2, BMI2, FMA), cherche les six positions du banc
avec N2L, à la profondeur 15, par l'interface UCI : **2 941 167 nœuds des
deux côtés**, l'arbre identique au nœud près — le code est entier. Vingt
paires alternées dans le conteneur : **le binaire v3 plus rapide sur 20
paires sur 20** (p < 0,0001), **× 1,235 de nœuds par seconde** en médiane des
rapports, de 1,04 à 1,46 selon la paire. Par l'étalon — un doublement vaut
+107,7 Elo et +1,38 pli à `8+0,08` —, × 1,235 fait 0,30 doublement : **~0,4
pli, +25 à +44 Elo** à 60 à 105 Elo par pli. <span>Inférence, confiance
moyenne sur la vitesse — un conteneur, pas un runner —, faible sur l'Elo,
qui passe par une conversion</span>. C'est une optimisation pure au sens de
l'arbitrage du 15 sept. — l'arbre ne bouge pas —, mais le binaire qui joue
doit pouvoir l'exécuter : **la machine qui joue est une décision de Théo**.
Tous les processeurs de runner relevés jusqu'ici exécutent `x86-64-v3` —
EPYC 7763, 9V74 et 9V45, Xeon 6973P-C et Platinum 8573C. Et le drapeau se
pose dans les scripts qui construisent, pas dans le dépôt de chaque commit :
un candidat et sa référence doivent être bâtis de la même façon. La sonde
est à l'attic, `vitesse-avx2-sonde.patch` — faute du banc au réseau, un
script UCI qui refuse de conclure si les arbres diffèrent.

**Et l'AVX-512 ? Mesuré le même soir, sur la question de Théo : pas de
gain.** Le même `main` (`b66ff5d`), `x86-64-v4` contre `x86-64-v3`, la même
sonde sur le Xeon du conteneur, qui a l'AVX-512 : l'arbre identique (2 941 167
nœuds), le v4 plus rapide sur **6 paires sur 20** seulement (p = 0,12), **× 0,95**
de nœuds par seconde en médiane — rien de démontré, et plutôt un peu plus
lent. <span>Inférence, confiance moyenne</span> : à 128 unités, les boucles
du réseau sont courtes, et l'AVX2 y traite déjà seize valeurs par
instruction ; sans `unsafe`, la vectorisation reste celle du compilateur. Les
runners EPYC 7763 n'ont pas l'AVX-512 : un tel binaire n'y démarrerait pas.
**Pas de troisième binaire** ; à remesurer si la couche cachée s'élargit
(n° 13), où les boucles s'allongent.

**Sans réseau, la vitesse n'a pas bougé** : `tools/timing.sh`, `cc8e105`
contre `main` à `bfe92fb`, nœuds identiques aux profondeurs 7 et 10, 20
paires : le candidat gagne 7 paires sur 20, p = 0,36 — **aucun écart
démontré**, donc aucun chiffre inscrit. Les deux tests de branche par nœud
que coûte l'option ne se voient pas.

**Le crible de mutation, relevé le 28 sept.** (run 36210591242, au candidat
`cc8e105`) : `nnue.rs` **1** survivant sur 98 — le côté du roque en `>=`,
équivalent et prédit, donc son plafond. L'intégration dans `search.rs` n'en
laisse aucun ; le compteur de ses tests en laissait un, tué avant la fusion
par une borne haute (`.github/mutation-baseline.txt`, ligne de `search.rs`
du 26 sept.).

#### Étape 3 — RELEVÉE le 28 sept. 2026 : le réseau est celui qu'a entraîné bullet

Sur la carte de Théo — RTX 3050 pour portable, 4 Go, pilote 595.91.07 qui
plafonne à CUDA 13.2, un toolkit 13.2 installé à côté du 13.4 (paragraphe
Ubuntu ci-dessus). Le réseau, sa courbe de perte et la sortie complète sont
dans `reseaux/` (commit `5d0e5d7`, de Théo) :

- **les données, enfin relues** : seize fichiers jusqu'au dernier octet,
  **1 098 403 parties et 125 098 300 positions — exactement les résumés des
  jobs** ; la relecture promise depuis le 26 sept. est faite ;
- **l'entraînement** : 40 superlots de 100 007 936 positions en **11 min 53 s**,
  9 à 10 millions de positions par seconde ; 714 s en tout, relecture et
  confrontation comprises ;
- **la courbe** (perte moyenne par superlot) : 0,0486 au premier, 0,0462 au
  dixième, **0,0460 du vingtième au quarantième — elle plafonne à
  mi-parcours**. <span>Inférence, confiance faible</span> : ce sont désormais
  les 128 unités ou les données qui limitent, pas le nombre de superlots ;
  les séparer demanderait un second entraînement ;
- **la confrontation** : écart médian **7**, maximal **23** — critère écrit
  avant, 15 et 50 : `RÉSEAU PRÊT`. Rechargé ici par le moteur de `main`
  (`EvalFile`), il rend les mêmes valeurs à l'unité : +26 en position
  initiale, −92 après 1.e4.

**Décision utilisateur** — Théo, 28 sept. : « *Si plus tard pour vraiment
pousser la perf on a besoin de faire tourner plus on pourra (si c'est
vraiment pertinent de le faire)* », précisé le même soir : « *entrainement
plus long ou sur plus de données, je voulais surtout dire s'il faut
ressolliciter mon GPU, c'est possible* ». **Sa carte peut être sollicitée à
nouveau** — un entraînement plus long ou sur plus de données —, sur une
raison mesurée.

**L'échelle, mesurée avant de mesurer l'Elo** — sur les douze positions de
la confrontation, réseau et faite main parlent la même langue quand la
position est équilibrée (quelques dizaines de centièmes, de signe parfois
contraire), et **le réseau dit 2,6 à 5,8 fois plus quand elle est décidée** :
−1 726 contre −598 (une tour de moins), −3 004 contre −1 173 (une dame de
plus), +521 contre +90 (roi et pion contre roi). C'est l'échelle d'une
probabilité de gain étirée par l'échelle 400, pas celle du matériel. Or les
marges de la recherche ont été réglées sur la faite main : la futilité
inverse (`RFP_MARGIN`, 100 par pli), la fenêtre d'aspiration (25), et
surtout l'**élagage delta**, qui ajoute à un stand pat du réseau le gain
d'une capture estimé par les valeurs de la faite main.

#### Étape 4 — le réseau embarqué, et sa mesure : ce qui est écrit AVANT de mesurer

**Le changement** : le réseau entre dans le binaire (`include_bytes!`) et
devient l'évaluation par défaut **de la couche UCI** — `EvalFile` vaut
`<embedded>` par défaut, `<none>` rend la faite main, un chemin charge un
fichier. `Search::new` garde la faite main : le banc et sa référence, et les
tests de recherche, n'en dépendent pas. Un test rejoue à chaque build la
confrontation de l'étape 3 — les douze valeurs de l'entraîneur relevées dans
`reseaux/`, le même critère, et les valeurs du moteur à l'unité.

**Attendu** — <span>Inférence, confiance faible</span> : **+30 à +150 Elo à
`8+0,08`** contre `main`. Pour : un réseau appris sur ses propres parties
remplace des termes aux valeurs conventionnelles, jamais réglés ; son nœud
coûte 0,73 à 0,87 fois celui de la faite main. Contre : des étiquettes
données par sa propre recherche à 5 000 nœuds, et des marges réglées sur une
autre échelle (ci-dessus). **Un effet sous l'attendu, ou négatif, se
diagnostique d'abord par l'échelle**, mesurée avant de toucher au réseau :
combien de coupes de l'élagage delta et de la futilité inverse le réseau
déplace, en partie.

**Critère, écrit avant** : deux jobs de **1 000 parties** à `8+0,08`,
fastchess, graine « auto » chacun, le candidat — son commit, révoqué aussitôt
— contre son parent ; mis en commun par `tools/mettre-en-commun.sh`, qui
refuse deux matchs contradictoires. Zéro perte au temps, zéro coup illégal,
sinon le match ne compte pas.
- **borne basse de l'intervalle à 95 % au-dessus de zéro** : gain démontré,
  le réseau devient l'évaluation par défaut ;
- **intervalle contenant zéro** : pas de fusion sur cette mesure — c'est
  l'évaluation entière qu'on remplace, pas un correctif de règle ; le
  diagnostic par l'échelle, puis un second tour ;
- **borne haute sous zéro** : régression, pas de fusion ; le même diagnostic.

**Puissance, dite d'avance** : 2 000 parties donnent environ ± 11 Elo à 95 %
(5 760 en donnaient ± 6,2 pour C24). Un effet de moins d'une dizaine d'Elo
ne se distinguera pas de zéro, et c'est accepté : l'attendu est au-dessus.

**Lancé le 28 sept. 2026 à 21 h 21 UTC** : runs **36485510245** et
**36485513513**, le candidat `e944248` — révoqué aussitôt par `1a6c912`, sa
copie dans `tools/attic/a21-reseau-embarque.patch` — contre son parent
`bfebbd8`, dont l'`EvalFile` vaut `<empty>` : l'évaluation faite main.
`match.yml` ne règle aucune `EvalFile`, donc chaque moteur joue avec son
défaut, et c'est exactement la comparaison visée. Le banc n'a pas bougé :
`Search::new` évalue toujours à la main.

#### Étape 4 — VERDICT, 28 sept. 2026 : +330,61 ± 19,21 Elo à `8+0,08` contre la faite main — FUSIONNÉ, le réseau est l'évaluation par défaut

| run | runner | n/s au banc | profondeur en 250 ms | Elo | Ptnml(0-2) | V-D-N | s/partie |
|---|---|---|---|---|---|---|---|
| 36485510245 | Intel Xeon Platinum 8573C | 2 318 041 | 12 | +318,98 ± 26,27 | [0, 3, 95, 76, 326] | 823-98-79 | 6,62 |
| 36485513513 | AMD EPYC 9V74 | 2 189 004 | 12 | +342,85 ± 28,47 | [1, 2, 84, 66, 347] | 840-84-76 | 6,54 |
| **en commun** | | | | **+330,61 ± 19,21** | 1 000 paires | score 87,02 % | |

Homogènes : `tools/mettre-en-commun.sh` rend z = −1,21. Zéro perte au temps,
zéro coup illégal, aucun moteur perdu, sur les deux journaux entiers ; un
seul avertissement d'arbitre, « PV continues after fifty-move rule », au
candidat. **La borne basse, +311, est au-dessus de zéro : gain démontré**, et
le critère écrit avant fait du réseau l'évaluation par défaut — la
révocation `1a6c912` est révoquée par `5cf8f34`.

**2,2 fois le haut de l'attendu** (+30 à +150, confiance faible). Un chiffre
aussi loin de sa prédiction se contrôle avant de s'inscrire, et trois
contrôles le tiennent :
- **deux runners de deux constructeurs**, Intel et AMD, rendent le même effet
  à 24 Elo près ;
- **l'adjudication ne peut pas l'avoir fabriqué** : elle est à deux côtés
  (`-resign movecount=4 score=600 twosided=true`), donc chaque victoire du
  candidat par adjudication a demandé que la référence elle-même se voie
  perdue de six pions pendant quatre coups. L'échelle plus grande du réseau
  ne déclenche rien seule ;
- **les deux arbitres s'accordent** sur le binaire au réseau par défaut :
  `tools/crosscheck.sh`, relancé parce que la couche UCI a changé, rend
  15-8-1 chez fastchess comme chez cutechess.

<span>Inférence, confiance faible</span> — pourquoi l'attendu était trop bas :
la faite main n'a jamais été réglée — ses valeurs sont conventionnelles
(`CLAUDE.md`) —, le réseau a appris sur 125 millions de positions de ses
propres parties ce qu'elle ne sait pas dire, et son nœud coûte 0,73 à 0,87
fois le sien. Rapporté à l'étalon du projet, 60 à 105 Elo par pli à
`8+0,08`, l'écart vaut trois à cinq plis et demi : une évaluation n'est pas
une profondeur, mais l'ordre de grandeur dit que le saut n'est pas un
réglage.

**Le diagnostic par l'échelle n'est pas déclenché** — il était écrit pour
un effet décevant. **L'échelle reste un levier**, mesuré : le réseau dit
2,6 à 5,8 fois plus que la faite main dans les positions décidées, et les
marges de la recherche — futilité inverse, fenêtre d'aspiration, élagage
delta — sont réglées sur la faite main. Les régler pour le réseau est un
changement de recherche : un SPRT chacun.

**Ce qui change, et ce qui ne change pas** :
- la couche UCI évalue par le réseau embarqué ; `setoption name EvalFile
  value <none>` rend la faite main ;
- **le banc ne bouge pas** — `Search::new` évalue à la main —, donc **le banc
  et `tools/timing.sh` mesurent désormais une autre évaluation que celle qui
  joue** (« Ce qu'il faut surveiller ») ;
- le crible au candidat (36486347518) rend sa prédiction exacte : total 140,
  les mêmes survivants que `main`, un pour un.

### N° 7 — un meilleur réseau : le plan, écrit le 29 sept. avant de mesurer

**Décidé par Théo le 29 sept.** (« Ce qui reste à faire »). Trois leviers, qui
se mesurent séparément, dans cet ordre — chacun contre le réseau qui joue,
critère écrit avant son match :

1. **les étiquettes du réseau** — le générateur étiquetait par la faite main,
   il étiquette désormais par l'évaluation qui joue (`--eval`, défaut
   `<embedded>`). Un réseau de même taille, 768 → 128, entraîné sur ces
   seules données isole l'effet des étiquettes ;
2. **plus de positions** — 125 M aujourd'hui, et la perte plafonnait dès le
   20ᵉ superlot sur 40 ;
3. **une couche cachée plus large** — `HIDDEN` est une seule constante,
   partagée par le moteur et `tools/nnue-train`. La doubler double le coût
   d'une mise à jour d'accumulateur : le match le paie avec le reste.

**Le générateur au réseau, écrit** : `--eval` prend les valeurs de l'option
UCI `EvalFile` — `<embedded>`, `<none>`, ou le chemin d'un réseau pas encore
embarqué. Le réseau se charge une fois, avant les fils, et un fichier refusé
arrête tout avant d'écrire. Le résumé imprime `evaluation=`, et le commit du
générateur fixe le réseau embarqué. `run_etiquette_avec_l_evaluation_demandee`
compare ce que `run` écrit à ce que joue une recherche au réseau — et à ce
que joue la faite main, dont il doit différer ; **débrancher le réseau du fil
de génération le fait tomber**, vérifié. `<none>` rend les parties de la
faite main à l'octet près.

**Le débit, attendu écrit avant de le mesurer** — <span>Inférence, confiance
faible</span> : le nœud au réseau coûte 0,873 fois le nœud fait main sur le
binaire de base, celui que construisent les runners ; à 5 000 nœuds par coup,
**1 500 à 2 100 positions par seconde et par runner**, contre 1 509 à 1 727
pour la première vague. Les parties changent aussi — un autre joueur,
d'autres longueurs —, d'où la largeur de la fourchette. Une mesure hors
fourchette se diagnostique avant de lancer la vague.

**Le débit, RELEVÉ le 29 sept. à 06 h 40 — dans l'attendu.** Run
36528844912, le générateur de `main` à `c78921d`, 20 minutes sur un Xeon
Platinum 8573C, `evaluation=reseau-embarque`, face à la première vague :

| | au réseau | à la faite main (première vague) |
|---|---|---|
| positions par seconde | **1 774** | 1 509 à 1 727 ; 1 568 et 1 727 sur ce modèle |
| demi-coups par partie | 117,4 | 113,9 |
| parties écartées | **7,4 %** | 2,0 % |
| positions gardées par le filtre par défaut | 63,7 % | 62,1 % |
| gains blancs, gains noirs, nulles | 36,8 %, 37,4 %, **25,8 %** | 39,8 %, 41,3 %, 18,9 % |

- **le débit** : × 1,03 à × 1,13 sur le même modèle de processeur, pour
  × 1,15 attendu du seul coût du nœud — les parties ont changé aussi ;
- **les parties écartées triplent, et c'est l'échelle, pas les ouvertures.**
  Lu au code : l'ouverture se tire de (graine, numéro) seuls, avant toute
  recherche, donc les deux évaluations voient les mêmes ouvertures ; seul le
  score de la première position décide, au-delà de `OPENING_MAX_SCORE`
  (1 000). Pour la faite main, 1 000 centièmes valent une dame. Le réseau,
  lui — lu dans `tools/nnue-train` —, apprend `sigmoid(sortie)` contre une
  cible qui mêle le résultat (0,75) et `sigmoid(score / 400)` : 1 000 y
  correspond à une espérance de 92 %, <span>dans la mesure où il ajuste sa
  cible — confiance moyenne</span>. Le filtre devient plus strict, et plus
  proche de ce que son commentaire annonce (« a déjà donné une pièce ») ;
- **la même échelle déplace l'adjudication, et dans le sens qui coûte** :
  `WIN_ADJ_SCORE`, 2 000, vaut quinze à vingt pions pour la faite main, une
  espérance de 99,3 % pour le réseau. Moins prudente — sa sonde, plus bas ;
- plus de nulles, 25,8 % contre 18,9 % : des ouvertures plus équilibrées et
  un joueur plus fort — <span>inférence, confiance moyenne</span>, les deux
  causes ne sont pas séparées.

**La vague, décidée avant de la lancer : huit jobs de 330 minutes**,
`<embedded>`, 5 000 nœuds, graine « auto ». Huit et non quatre, parce qu'une
seule vague sert les deux premiers leviers, et une seule séance sur la carte
de Théo les deux entraînements :
- **levier 1, le générateur au réseau** : les quatre PREMIERS runs lancés —
  les numéros les plus bas, choisis avant d'en voir les comptes —, la taille
  de la première vague ;
- **levier 2, plus de positions** : les huit, la même recette, 40 superlots.
  Seule la diversité change : les positions vues restent 4 milliards.

La charge reste celle que le workflow s'impose — quelques jobs, pas des
dizaines. *Attendu, écrit avant* — <span>inférence, confiance moyenne</span> :
1 500 à 1 900 positions par seconde et par runner, soit 29,7 à 37,6 M par
job ; **238 à 301 M au total**, 119 à 150 M pour les quatre premiers. Contre
125 M à la faite main, ces −5 % à +20 % sont le confondant qu'on accepte au
levier 1 — écrit ici plutôt que découvert après.

**Lancée à 06 h 41** : les quatre premiers runs, **36532340223,
36532342642, 36532345161 et 36532347434**, servent le levier 1 ; les huit,
avec 36532349576, 36532352502, 36532354771 et 36532357681, le levier 2.

**La vague, RELEVÉE le 29 sept. à 12 h 30 — dans l'attendu, à son
plancher.** Huit succès, tous finis à 12 h 11 ; chaque résumé nomme
`81e2753` et `evaluation=reseau-embarque` :

| run | processeur | parties | écartées | positions | gardées par le filtre | positions/s | artefact |
|---|---|---|---|---|---|---|---|
| 36532340223 | EPYC 7763 | 252 491 | 19 356 | 29 726 653 | 18 889 964 | 1 501 | 108,0 Mo |
| 36532342642 | EPYC 7763 | 252 203 | 19 084 | 29 670 117 | 18 862 060 | 1 498 | 107,8 Mo |
| 36532345161 | Xeon Platinum 8573C | 273 169 | 20 730 | 32 155 035 | 20 409 648 | 1 624 | 116,8 Mo |
| 36532347434 | EPYC 7763 | 249 740 | 19 021 | 29 365 314 | 18 649 478 | 1 483 | 106,7 Mo |
| 36532349576 | EPYC 7763 | 251 498 | 19 123 | 29 530 998 | 18 768 191 | 1 491 | 107,3 Mo |
| 36532352502 | EPYC 7763 | 248 829 | 18 769 | 29 244 425 | 18 576 008 | 1 477 | 106,3 Mo |
| 36532354771 | EPYC 7763 | 251 684 | 19 211 | 29 572 130 | 18 783 597 | 1 494 | 107,5 Mo |
| 36532357681 | EPYC 9V74 | 341 516 | 26 159 | 40 193 515 | 25 505 617 | 2 030 | 146,1 Mo |

- **levier 1, les quatre premiers : 1 027 603 parties, 120 917 119
  positions** — dans l'attendu (119 à 150 M), à son plancher ; −3,3 %
  contre la première vague, dans les −5 % à +20 % acceptés comme
  confondant. Gardées par le filtre, 76 811 150 contre 77 700 081 : **N1
  verra autant de données que N0, à 1,1 % près** ;
- **levier 2, les huit : 2 121 130 parties, 249 458 187 positions** — dans
  l'attendu (238 à 301 M), dans son tiers bas ; 158 444 563 gardées,
  **× 2,04** la première vague ;
- **par job, l'attendu ne tient pas** : cinq jobs sur huit sous le plancher
  de 29,7 M, d'au plus 1,5 %, un au-dessus du plafond de 37,6 M, de 7 %.
  Les totaux tombent juste par compensation : six EPYC 7763 à 1 477 –
  1 501 positions par seconde, un EPYC 9V74 à 2 030 ;
- **le résidu, nommé** : sur les mêmes modèles de processeur, le débit au
  réseau vaut **× 0,986** celui de la première vague — EPYC 7763, 1 491 en
  moyenne contre 1 514 et 1 509 ; Xeon 8573C, 1 624 contre 1 568 et 1 727 —,
  là où le coût du nœud annonçait × 1,15. Ce 0,873 venait d'un réseau
  ALÉATOIRE, dans le conteneur, un seul processus à 1,5 M de nœuds par
  position ; le générateur cherche 5 000 nœuds par coup, quatre fils sur
  deux cœurs physiques. Deux causes possibles, aucune mesurée — <span>inférence,
  confiance faible</span> : un réseau entraîné fait pousser un autre arbre
  qu'un réseau aléatoire, donc un autre mélange de nœuds ; et deux fils par
  cœur s'y partagent un cache où les 196 Ko de la couche d'entrée tiennent
  mal, ce que l'évaluation faite main ne demande pas. Rien ne réclame de
  trancher tant qu'**une vague se prévoit par la précédente** — celle-ci,
  désormais, et non le job de vingt minutes : ses 1 774 sur un Xeon
  dépassaient de 9 % ce que le même modèle a tenu ici, dans les 10 % qui
  séparaient déjà deux Xeon de la première vague. Un point unique ;
- la composition : 7,07 % de parties écartées (7,4 % au job du débit),
  63,52 % de positions gardées, 117,6 demi-coups par partie, 26,15 % de
  nulles. Les noirs gagnent 50,8 % des parties décisives, comme à la
  première vague (41,3 % contre 39,8 %) — lu au code, l'ouverture tire 8 à
  11 demi-coups au hasard, donc une fois sur deux les blancs y jouent un
  coup de plus ; <span>inférence, non mesurée</span>, et sans effet attendu
  sur l'entraînement, qui voit chaque position du côté du trait ;
- 1 030 Mio sur disque (4,3 octets par position), **907 Mo d'artefacts**
  (3,6), expirant le **28 déc. 2026** ;
- pour les regénérer, K = parties + écartées : 271 847, 271 287, 293 899,
  268 761, 270 621, 267 598, 270 895 et 367 675.

**La séance d'entraînement, sur la carte de Théo — trois réseaux, écrite à
la relève ; la procédure complète précisée le même jour, à sa demande** :
le dépôt dans `~/chess`, Ubuntu, `main` pas forcément à jour. La machine est
prête depuis le 28 sept. — toolkit 13.2, rien à réinstaller. Chaque bloc se
colle dans le MÊME terminal, dans l'ordre :

0. **le dépôt à jour** :
   ```sh
   cd ~/chess
   git status
   ```
   Des fichiers « non suivis » ne gênent pas — le dossier `checkpoints` de
   `tools/nnue-train/`, qui n'existe que sur la machine d'entraînement,
   porte le point de sauvegarde de N0 : le garder. Des fichiers « modifiés »,
   si : s'arrêter et le dire. Puis :
   ```sh
   git fetch origin
   git switch main
   git pull --ff-only
   git log --oneline -1
   ```
   — `58242bf` ou plus récent. Un `--ff-only` qui refuse dit que le `main`
   local a divergé : s'arrêter et le dire ;
1. **CUDA dans ce terminal** — `CUDA_PATH` et `LD_LIBRARY_PATH` doivent
   désigner le toolkit 13.2, celui qu'accepte le pilote (paragraphe « Sur
   Ubuntu ») :
   ```sh
   echo "CUDA_PATH=${CUDA_PATH:-(vide)}  LD_LIBRARY_PATH=${LD_LIBRARY_PATH:-(vide)}"
   ```
   Vides, ou sur un autre toolkit :
   ```sh
   export CUDA_PATH=/usr/local/cuda-13.2
   export LD_LIBRARY_PATH=$CUDA_PATH/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
   ls $CUDA_PATH/lib64/lib{cudart,nvrtc,cublas}.so
   ```
   — les trois bibliothèques doivent s'afficher. `/usr/local/cuda-13.2` est
   l'emplacement du paquet `cuda-toolkit-13-2` de NVIDIA, <span>non vérifié
   sur la machine</span> : `ls -d /usr/local/cuda*` le montre ;
2. **les données** — huit archives, **avant le 28 déc. 2026, 06 h 40 UTC**
   (lu à l'API : `expires_at`), depuis un navigateur connecté à GitHub — un
   artefact ne se télécharge pas anonymement. Chacune s'enregistre sous
   `nnue-<run>.zip`, 907 Mo en tout :
   - [nnue-36532340223](https://github.com/theodubus/chess/actions/runs/36532340223/artifacts/11031852356), 108,0 Mo
   - [nnue-36532342642](https://github.com/theodubus/chess/actions/runs/36532342642/artifacts/11032002356), 107,8 Mo
   - [nnue-36532345161](https://github.com/theodubus/chess/actions/runs/36532345161/artifacts/11031604733), 116,8 Mo
   - [nnue-36532347434](https://github.com/theodubus/chess/actions/runs/36532347434/artifacts/11031689282), 106,7 Mo
   - [nnue-36532349576](https://github.com/theodubus/chess/actions/runs/36532349576/artifacts/11031194981), 107,3 Mo
   - [nnue-36532352502](https://github.com/theodubus/chess/actions/runs/36532352502/artifacts/11031379818), 106,3 Mo
   - [nnue-36532354771](https://github.com/theodubus/chess/actions/runs/36532354771/artifacts/11032251145), 107,5 Mo
   - [nnue-36532357681](https://github.com/theodubus/chess/actions/runs/36532357681/artifacts/11031314872), 146,1 Mo

   Puis chacune dans son propre dossier, hors du dépôt : N1 n'en prend que
   quatre, et le programme ne lit que les `.vf` posés directement dans les
   dossiers qu'on lui donne. `unzip` n'ouvre qu'une archive par appel, d'où
   la boucle, et ne crée qu'UN niveau de dossier, d'où le `mkdir` — éprouvé
   sur de fausses archives, sans lui les huit extractions échouent :
   ```sh
   DL=$(xdg-user-dir DOWNLOAD); echo "$DL"
   mkdir -p ~/nnue-vague2
   for r in 36532340223 36532342642 36532345161 36532347434 \
            36532349576 36532352502 36532354771 36532357681; do
     unzip -o "$DL/nnue-$r.zip" -d ~/nnue-vague2/$r
   done
   ls ~/nnue-vague2/*/*.vf | wc -l
   ```
   — **32** : quatre `.vf` par dossier, 1 030 Mio. Avec `gh` connecté
   (`gh auth login`), téléchargement et décompression en une ligne dans la
   même boucle : `gh run download $r -R theodubus/chess -n nnue-$r -D ~/nnue-vague2/$r` ;
3. **N1, le levier 1** — les quatre premiers, 128 unités, depuis `main`.
   Le premier `cargo run` recompile — le moteur a changé depuis le 28, et
   `nnue-train` a une dépendance de plus :
   ```sh
   cd ~/chess/tools/nnue-train
   cargo run --release --features cuda -- --attendu 1027603:120917119 --sortie n1 \
     ~/nnue-vague2/36532340223 ~/nnue-vague2/36532342642 \
     ~/nnue-vague2/36532345161 ~/nnue-vague2/36532347434 2>&1 | tee n1.sortie.txt
   ```
   il finit sur `RÉSEAU PRÊT : n1/shallowred-768x128-40/quantised.bin` ;
4. **N2, le levier 2** — les huit, 128 unités :
   ```sh
   cargo run --release --features cuda -- --attendu 2121130:249458187 --sortie n2 \
     ~/nnue-vague2/* 2>&1 | tee n2.sortie.txt
   ```
   → `RÉSEAU PRÊT : n2/shallowred-768x128-40/quantised.bin` ;
5. **N3, le levier 3** — les huit, **256 unités**, au commit `87c3d27`, qui
   ne change que cette largeur : le programme d'entraînement est celui de
   N2 au caractère près, et il sait repartir d'un point de sauvegarde si N3
   sert au levier 4. Git annonce une « HEAD détachée » : c'est voulu. Un
   essai court d'abord, l'architecture étant neuve :
   ```sh
   git checkout 87c3d27
   cargo run --release --features cuda -- --attendu 2121130:249458187 --superlots 1 \
     --sortie essai256 ~/nnue-vague2/*
   ```
   il doit finir sur `RÉSEAU PRÊT : essai256/shallowred-768x256-1/quantised.bin`.
   Puis le vrai, et le retour à `main` :
   ```sh
   cargo run --release --features cuda -- --attendu 2121130:249458187 --sortie n3 \
     ~/nnue-vague2/* 2>&1 | tee n3.sortie.txt
   git switch main
   ```
   → `RÉSEAU PRÊT : n3/shallowred-768x256-40/quantised.bin` ;
6. **rapporter**, sur une branche `reseau/n7` comme la première fois : le
   `quantised.bin`, le `log.txt` de bullet — la courbe de perte, écrite par
   bullet dans le même dossier de point de sauvegarde (`value.rs`, au commit
   épinglé) — et la sortie de chacun, sous `reseaux/` :
   ```sh
   cd ~/chess && git switch -c reseau/n7
   for c in n1:128 n2:128 n3:256; do
     n=${c%:*}; w=${c#*:}; d=tools/nnue-train/$n/shallowred-768x$w-40
     cp $d/quantised.bin reseaux/$n-768x$w-40.bin
     cp $d/log.txt reseaux/$n-768x$w-40.log.txt
     cp tools/nnue-train/$n.sortie.txt reseaux/$n-768x$w-40.sortie.txt
   done
   git add reseaux/n[123]-*
   git commit -m "Réseaux NNUE du n° 7 : N1, N2 et N3, 40 superlots"
   git push -u origin reseau/n7
   ```
   **Garder les dossiers `checkpoints/`, `n1/`, `n2/` et `n3/`** de
   `tools/nnue-train` : le levier 4 repartira de l'un d'eux (`--depuis`), et
   le réseau quantifié seul ne le permet pas.

*Durée* — <span>inférence, confiance moyenne</span> : ~12 minutes pour N1
et autant pour N2 — le calendrier du premier entraînement, 11 min 53 s ; les
positions vues ne dépendent pas du volume des données —, le double environ
pour N3 ; une heure et demie en tout, téléchargement et compilations
compris. Un `ÉCHEC — …` à n'importe quel temps arrête tout, et son message
suffit à le diagnostiquer.
**Vérifié ici avant de l'écrire** : à `87c3d27`, `tools/nnue-train` compile
et passe ses six tests — contre le runtime factice de bullet, donc sans rien
dire de CUDA, que l'essai court éprouve. Et le chargeur du moteur a de la
marge pour les poids de sortie de N3 : le réseau qui joue en totalise 7 003
en valeur absolue, pour un plafond de 33 025, et le double d'unités à poids
égaux ferait ~14 000 — <span>inférence, confiance moyenne</span> : un
réseau plus large porte plutôt des poids de sortie plus petits.

**La séance, RELEVÉE le 29 sept. à 20 h 40 — les trois réseaux tiennent
leurs deux contrôles.** Poussés par Théo sur `reseau/n7` (`c2d5564`),
intégrés par `be9f65e` :

| | relus, parties : positions | confrontation, médian / maximal (admis 15 / 50) | entraînement | perte au 1ᵉʳ, 10ᵉ, 20ᵉ, 40ᵉ superlot |
|---|---|---|---|---|
| N0, le réseau qui joue | 1 098 403 : 125 098 300 | 7 / 23 | 11 min 53 s | 0,0486 · 0,0462 · 0,0461 · 0,0460 |
| **N1**, 128, quatre jobs | 1 027 603 : 120 917 119 — **l'attendu exact** | **6 / 16** | 10 min 53 s | 0,0462 · 0,0435 · 0,0433 · 0,0432 |
| **N2**, 128, huit jobs | 2 121 130 : 249 458 187 — **l'attendu exact** | **4 / 8** | 11 min 05 s | 0,0463 · 0,0436 · 0,0436 · 0,0435 |
| **N3**, 256, huit jobs | la même chose | **7 / 19** | 12 min 16 s | 0,0456 · 0,0427 · 0,0427 · 0,0426 |

- **les données relues sont exactement celles des résumés**, les trois
  fois ; les trois confrontations tiennent le critère écrit avant le
  premier entraînement ;
- **un attendu réfuté** — « le double environ pour N3 » : **+11 %** de
  temps seulement, 5,46 M de positions par seconde contre 5,98. Le calcul
  de la couche cachée n'est pas ce qui borne la séance — <span>inférence,
  confiance moyenne</span> : le chargement des données l'est ;
- **les pertes ne se comparent qu'à données égales** : N0 et N1 n'ont pas
  les mêmes cibles, N1 et N2 pas les mêmes positions. **N3 descend 2 % sous
  N2 sur les mêmes données** — la largeur ajuste mieux. Ce sont des pertes
  d'entraînement, sans jeu de validation : <span>inférence, confiance
  faible</span> — N1 voit chaque position gardée ~52 fois en 40 superlots,
  N2 ~25 fois, et c'est N1 qui descend encore au 40ᵉ, N2 qui plafonne dès le
  15ᵉ ; le surapprentissage d'un petit jeu ressemblerait à cela, et seuls
  les matchs trancheront ;
- **trois tests supposaient 128 unités** et tombaient avec N3 sans qu'aucun
  réseau ne soit en faute — la taille de fichier, les poids de sortie de
  ±129 d'un test de borne, la borne d'un réseau aléatoire : rendus
  indépendants de la largeur par `56ced07`, **neutre à 128**, chaque test y
  construisant exactement les mêmes valeurs qu'avant.

**Les trois candidats, révoqués aussitôt** — chacun ne change que le réseau
embarqué et la confrontation recopiée de sa sortie, et N3 la largeur ; suite
rapide verte pour chacun, et le banc inchangé, 107 548 à la profondeur 7 :
il évalue à la main.

| match | candidat | révoqué par | référence |
|---|---|---|---|
| N1 contre N0 | `c430fe5` | `d9a24a2` | `be9f65e`, le parent : N0 embarqué |
| N2 contre N1 | `af62e48` | `c0dd8b9` | `c430fe5` |
| N3 contre N2 | `eddab38` | `56c9aa1` | `af62e48` |

Pas de rustine à l'attic : chaque diff tient en un chemin, douze valeurs et,
pour N3, une constante ; les réseaux sont dans `reseaux/`, et les trois SHA
dans l'histoire de `main` par la fusion.

**Les matchs des trois leviers — plan et critères écrits le 29 sept. à
11 h 30, avant que le premier réseau existe.**
- **en parallèle, chacun contre son prédécesseur** : N1 contre le réseau
  qui joue (N0, `main`), N2 contre N1, N3 contre N2. Chaque paire ne diffère
  que d'un levier, et les trois tiennent ensemble dans le temps d'un seul —
  cinq heures au lieu de quinze. Si un maillon échoue, le match qui manque
  — un candidat contre le réseau qui joue alors — se joue ensuite ;
- **avant tout match**, la confrontation de `nnue-train` doit passer (écart
  médian ≤ 15, maximal ≤ 50) : sinon le réseau ne se mesure pas ;
- **chaque candidat est un commit révoqué aussitôt** : le réseau sous
  `reseaux/`, `EMBEDDED` pointé sur lui, la confrontation recopiée dans
  `le_reseau_embarque_evalue_comme_son_entraineur` — et `HIDDEN` à 256 pour
  N3 ;
- **à `8+0,08`, deux jobs de 3 000 parties par paire** — ~2 880 chacun sous
  le plafond —, mis en commun ; **gain démontré si la borne basse commune
  est au-dessus de zéro**, et alors seulement le candidat remplace son
  prédécesseur dans la chaîne. Sinon le prédécesseur reste : un levier qui
  ne se démontre pas ne s'adopte pas ;
- **attendus** — <span>inférence, confiance faible pour les trois</span> :
  N1 contre N0, **0 à +40** — de meilleures étiquettes, et le reste égal ;
  N2 contre N1, **0 à +25** — le double de données, à calendrier égal ;
  N3 contre N2, **−10 à +40** — la capacité contre la vitesse, un nœud à
  256 unités coûtant plus cher ;
- **puis le levier 4** — ré-entraîner le meilleur sur les données de Leela,
  `--depuis` son dossier — et la série de C13 contre 2850 à 60+0,6 pour le
  réseau adopté.

**Les matchs, RELEVÉS le 30 sept. à 03 h 05 — VERDICT : N2 adopté, N3
écarté.** Six jobs finis entiers entre 02 h 25 et 02 h 32, 3 000 parties
chacun, graines distinctes (celles des runs), zéro perte au temps, zéro
coup illégal ; mis en commun par `tools/mettre-en-commun.sh` :

| paire | job 1 — runner | job 2 — runner | **en commun, 6 000 parties** | homogénéité |
|---|---|---|---|---|
| **N1 contre N0** — `c430fe5` → `be9f65e` | +118,07 ± 9,80 — EPYC 7763 | +113,42 ± 9,94 — EPYC 9V74 | **+115,74 ± 6,98**, `[+108,8 ; +122,7]` | z = 0,65 |
| **N2 contre N1** — `af62e48` → `c430fe5` | +48,14 ± 8,57 — EPYC 9V74 | +52,04 ± 8,75 — EPYC 7763 | **+50,09 ± 6,12**, `[+44,0 ; +56,2]` | z = −0,62 |
| **N3 contre N2** — `eddab38` → `af62e48` | −34,16 ± 8,46 — EPYC 7763 | −23,43 ± 8,48 — EPYC 7763 | **−28,79 ± 5,99**, `[−34,8 ; −22,8]` | z = −1,76 |

- **par le critère écrit avant** : N1 remplace N0, N2 remplace N1 — deux
  gains démontrés ; N3 ne remplace pas N2, et c'est justement le match
  contre le réseau alors adopté, donc aucun match ne manque. **N2 joue
  depuis `d28f886`** — la révocation de sa révocation, sa confrontation avec
  l'entraîneur dans le test, le banc inchangé ;
- **deux attendus réfutés par le haut, un par le bas** : N1 **+116 pour 0
  à +40**, N2 **+50 pour 0 à +25**, N3 **−29 pour −10 à +40**. Les
  étiquettes du réseau valaient trois fois ce que j'en attendais, et le
  double des données deux fois — <span>inférence, confiance moyenne</span> :
  les étiquettes de la faite main plafonnaient le premier réseau bien plus
  bas que sa taille, ce que la perte, plate dès le 20ᵉ superlot, disait déjà
  sans qu'on sache le chiffrer ;
- **pourquoi N3 perd — sa vitesse, mesurée après coup** : dans le
  conteneur, six positions du livre, 2 s chacune, deux passes alternées, N3
  cherche **× 0,785** les nœuds par seconde de N2 (× 0,71 à × 0,85 selon la
  position). Par l'étalon (+107,7 Elo par doublement), c'est **~−38 Elo**, et
  N3 en perd −29 : la couche à 256 rendrait ~+9 Elo de qualité, loin de payer
  son coût. <span>Inférence, confiance moyenne</span> : un rapport de
  vitesse du conteneur, non celui des runners, et la perte plus basse de 2 %
  à l'entraînement dit la même chose d'un autre côté. **Une couche plus
  large ne se rouvre qu'avec une inférence plus rapide ou beaucoup plus de
  données** — la vitesse de l'inférence, déjà au backlog, devient la
  condition de ce levier ;
- **ce qui suit, écrit dans le plan** : la série de C13 contre Stockfish
  bridé à 2850, 60+0,6, pour N2 ; le levier 4 — ré-entraîner N2 sur les
  données de Leela, `--depuis` son dossier — demande la carte et le disque
  de Théo.

**La sonde d'adjudication, pendant la vague — critère écrit avant.** Dans le
conteneur, les mêmes parties jouées deux fois — avec l'adjudication, puis
sans, jusqu'au bout —, par le réseau et par la faite main pour témoin ; la
sonde marque les parties adjugées, et compte celles dont la fin jouée
diffère : renversement, ou nulle. **La vague est annulée si, au réseau, plus
de 2 % des parties adjugées finissent autrement ET que le témoin fait au
moins un point de moins** — un gain que le moteur ne sait pas convertir sans
table de finales n'est pas une fausse adjudication, et le témoin le compte.
Sinon elle continue. *Attendu* — <span>inférence, confiance faible</span> :
sous 2 %, huit demi-coups de suite à 99,3 % chacun.

**La sonde, RELEVÉE à 06 h 53 — la vague continue.** `main` à `81e2753`
sondé, 3 000 parties par passe, graine 20260929 ; rustine et lecteur à
l'attic, `n7-sonde-adjudication.patch` :

| | au réseau | à la faite main (témoin) |
|---|---|---|
| parties jouées, écartées | 2 794, 206 | 2 953, 47 |
| adjugées | 1 603 (57,4 %) | 1 189 (40,3 %) |
| **finies autrement, jouées jusqu'au bout** | **8, soit 0,50 %** — huit nulles, aucun renversement, aucune au plafond de 400 demi-coups | **0** |
| demi-coups des adjugées, avec puis sans | 101,7 puis 125,8 | 113,0 puis 116,7 |

- **0,50 %, sous les 2 % du critère : la vague continue** — l'attendu tient.
  L'écart au témoin est réel mais petit : huit parties sur 2 794 portent
  un gain au lieu d'une nulle, et la cible n'y pèse le résultat qu'à 0,75 ;
- **la sonde a son propre témoin, et il tient** : les parties non adjugées
  sont identiques, coups et résultat, avec et sans adjudication — 1 191 sur
  1 191 au réseau, 1 764 sur 1 764 à la faite main. Les deux passes jouent
  bien les mêmes parties ;
- **ce que la sonde montre en plus, et qui n'était pas demandé** : la faite
  main n'atteint 2 000 qu'à quelques coups du mat — l'adjudication ne lui
  épargne que 3,7 demi-coups —, le réseau **24 demi-coups plus tôt**. Les
  données au réseau portent donc moins de finales de conversion, où tout
  est décidé : 13,8 demi-coups par partie en moyenne, pour 120,7
  enregistrés dans la même passe. Un changement de distribution que le levier 1 mesure avec
  le reste — le générateur au réseau est un tout —, écrit ici plutôt que
  découvert après.

**Ce que le réseau n'a jamais vu : une ouverture — relevé le 29 sept., sur
une question de Théo.** Lu au code : le générateur tire 8 à 11 demi-coups
AU HASARD avant de jouer, et le filtre par défaut de `viriformat` — celui de
l'entraînement — écarte toute position d'avant le seizième demi-coup
(`min_ply: 16`, `dataformat.rs` de `viriformat` 2.0.1, la version que
verrouille `tools/nnue-train/Cargo.lock`). **Aucune position des huit premiers coups n'a servi, et aucune
ligne d'ouverture réelle n'a été jouée** : en ouverture, l'évaluation
extrapole, et c'est la recherche qui porte. Une question pour les données
du n° 7 — partir de vraies ouvertures, ou filtrer moins —, **non mesurée, et
pas évidente** : écarter les premiers coups est le réglage par défaut de
l'entraîneur, et chez nous ce sont des coups au hasard, du bruit.

**Précisé au source le 30 sept.** : `viriformat` compte le ply depuis le
numéro de coup du plateau (`Board::ply`, posé par la FEN), et notre
générateur ouvre chaque partie APRÈS ses coups au hasard, par la FEN de la
position atteinte. Le filtre retire donc, de chaque partie, ses demi-coups
8 à 15 — les premiers coups JOUÉS, pas le hasard. Ce sont exactement les
positions dont partent nos matchs : `tools/book.epd` tire 8 demi-coups.
**Les écarter coûte donc aussi dans notre régime de mesure**, pas seulement
depuis la position initiale ; et les rendre ne coûte rien en données — elles
sont dans les fichiers, seul le filtre les tait.

**La sonde de l'angle mort — protocole écrit le 30 sept. avant de mesurer**,
dans le conteneur, déterministe :
- **la question** : le réseau décide-t-il moins bien là où il n'a rien
  appris, à difficulté égale ?
- **deux ensembles de positions**, graines fixées : *le livre* — 300 parties
  du réseau contre lui-même depuis `tools/book.epd`, 100 000 nœuds par coup,
  jouées jusqu'au 80e demi-coup ; une position par partie et par tranche,
  **8–15** (l'angle mort), **16–39**, **40–79** ; *les vraies ouvertures* —
  150 lignes de 16 demi-coups depuis la position initiale, chaque coup tiré
  parmi ceux que Stockfish 16 juge à 20 centièmes du meilleur au plus
  (MultiPV 4, profondeur 12) ; positions distinctes, tranches **0–7** et
  **8–15** ; au plus 300 par tranche ;
- **la mesure** : dans chaque position, le coup du réseau et celui de la
  faite main (`EvalFile <none>`), chacun à 200 000 nœuds ; la perte de
  chacun jugée par Stockfish 16 à la profondeur 16 — le score de son
  meilleur coup moins celui du coup joué (`searchmoves`), en centièmes,
  bornée à 0 et 300 ;
- **le témoin** : la faite main n'a appris sur rien, donc n'a pas d'angle
  mort ; elle dit la difficulté propre de chaque tranche. **Le signal** : le
  rapport des pertes moyennes, réseau sur faite main, de chaque tranche,
  divisé par celui de la tranche 16–39 du livre — intervalle à 95 % par
  rééchantillonnage des positions ;
- **attendu** — <span>inférence, confiance faible</span> : **pas d'angle
  mort décelable**, le rapport des tranches 8–15 et des vraies ouvertures
  dans × 1,3 de celui de 16–39 : les entrées du réseau sont des cases
  occupées, qu'une ouverture partage avec les premiers coups qu'il a vus, et
  la recherche porte ;
- **ce que cela décide** : au-delà de × 1,5, intervalle au-dessus de 1, en
  **8–15 du livre** ⇒ le prochain entraînement abaisse `min_ply`, et un
  match tranche ; dans les **seules vraies ouvertures** ⇒ la question relève
  de données d'ouverture (Leela, levier 4) ou du livre de l'interface ;
  **rien de décelable** ⇒ la question se classe, sans séance sur la carte ;
- **limites, dites d'avance** : la table est vidée à chaque position, et un
  moteur qui démarre froid n'est pas un moteur en partie (`CLAUDE.md`) —
  toutes les tranches le subissent ; 200 000 nœuds, pas une cadence ;
  Stockfish à la profondeur 16 est un juge, pas un oracle ; un effet de
  × 1,3 peut passer inaperçu.

**La sonde, RELEVÉE le 30 sept. à 01 h 08 — pas d'angle mort décelable ;
l'attendu tient, du côté favorable.** 1 482 positions, 16 minutes sur trois
cœurs du conteneur ; rustine `tools/attic/n7-sonde-angle-mort.patch`, qui
porte le script et son mode d'emploi. Pertes moyennes en centièmes, jugées
par Stockfish 16 à la profondeur 16 ; « > 50 » : part des coups qui perdent
plus d'un demi-pion :

| tranche | positions | réseau | faite main | > 50, réseau / faite main | rapport | ÷ celui de 16–39 | IC à 95 % |
|---|---|---|---|---|---|---|---|
| vraies ouvertures, 0–7 | 283 | 7,1 | 10,6 | 2 % / 5 % | 0,666 | **0,837** | [0,589 ; 1,194] |
| vraies ouvertures, 8–15 | 300 | 9,7 | 15,2 | 6 % / 10 % | 0,641 | **0,805** | [0,588 ; 1,087] |
| livre, 8–15 — l'angle mort | 300 | 12,0 | 19,7 | 6 % / 13 % | 0,610 | **0,766** | [0,550 ; 1,073] |
| livre, 16–39 — la référence | 300 | 25,4 | 31,9 | 19 % / 24 % | 0,796 | 1 | [0,759 ; 1,335] |
| livre, 40–79 | 299 | 22,7 | 30,8 | 17 % / 20 % | 0,738 | 0,927 | [0,683 ; 1,250] |

- **par le critère écrit avant** : aucun rapport au-delà de × 1,5 — tous
  sont SOUS 1 au point, et tous les intervalles contiennent 1. **La
  question se classe, sans séance sur la carte** : ni `min_ply` à
  abaisser pour ce motif, ni données d'ouverture à chercher pour lui ;
- **l'attendu tient** — dans × 1,3 de la référence —, et le seul
  dépassement est du côté favorable : la tranche 8–15 du livre, 0,766, où
  le réseau garde son avance sur la faite main mieux qu'en milieu de
  partie. <span>Inférence, confiance moyenne</span> : ses entrées sont des
  cases occupées, et une ouverture partage les siennes avec les premiers
  coups qu'il a vus ;
- **la puissance, lue sur la référence elle-même** : rééchantillonnée
  contre elle-même, la tranche 16–39 couvre 0,76 à 1,34 — ± 30 %. Un
  angle mort plus petit que cela passerait inaperçu, ce que le protocole
  disait ;
- **une ouverture est facile pour les deux** : trois à quatre fois moins
  de pertes qu'en milieu de partie, et deux à dix fois moins de coups
  perdant un demi-pion. C'est aussi pourquoi un rapport s'y lit mal —
  d'où le témoin, sans lequel ces chiffres ne diraient rien.

**Une source extérieure : les données de Leela Chess Zero — question de
Théo le 29 sept., DÉCIDÉE par lui le même jour** (plus bas). Ce qui est
vérifié :
- **Stockfish s'entraîne dessus** — son `README.md` (commit `e8d2ba1`,
  PR #5705 de Stockfish) : « *Stockfish uses neural networks trained on
  data provided by the Leela Chess Zero project, which is made available
  under the Open Database License (ODbL).* » ;
- **et pas seulement dessus** — le wiki de son entraîneur
  (`official-stockfish/nnue-pytorch`, « Training datasets ») : entraîner
  d'abord sur des données de Stockfish (profondeur 9, 5 000 nœuds — notre
  budget), puis ré-entraîner sur les données tirées de Leela, « *of higher
  quality than the ones generated with Stockfish* » ; mais « *training
  solely on the Lc0-derived datasets doesn't produce as good results* ». Le
  dernier jeu généré par Stockfish lui-même : **16 milliards de positions**,
  soixante fois notre vague ;
- **notre entraîneur sait les lire** : bullet, au commit épinglé `10e7e82`,
  porte `SfBinpackLoader` (`crates/bullet_lib/src/value/loader/sfbinpack.rs`)
  — le format des jeux de Stockfish. Restent l'échelle de leurs scores, la
  taille des fichiers et leur téléchargement, non vérifiés d'ici :
  `lczero.org` est bloqué par le proxy du conteneur.

<s>Ce qui ne se tranche pas ici : **la licence** — l'ODbL demande l'attribution
et le partage à l'identique des bases dérivées ; Stockfish s'en acquitte par
une mention au `README.md` ; lecture, pas un avis juridique — et **ce que le
projet veut être** : un réseau qui apprend du savoir de Leela n'est plus
appris seul. Mesurable, s'il est décidé, comme un levier de plus :
ré-entraîner notre meilleur réseau sur ces données, contre lui.</s>

**Décidé par Théo le 29 sept.** : « *Ok pour ajouter les données leela quand
ça sera pertinent (ok pour license et le fait qu'on utilise leurs données,
mon but est d'avoir le meilleur moteur possible). On est pas obligés de
faire 100% sur leurs données, on peut aussi faire sur nos données puis les
leurs comme stockfish en fonction de ce qui est mieux* ». D'où :
- **le levier 4, après les trois premiers** — la recette de Stockfish
  ré-entraîne un réseau « *already good* » : le nôtre, une fois les leviers
  1 à 3 tranchés. Les variantes se mesurent, aucune ne se présume : nos
  données puis les leurs ; les leurs seules, que Stockfish trouve moins
  bonnes ; un mélange ;
- **l'attribution** : le jour où un réseau qui en vient est embarqué,
  `README.md` porte la mention — inscrit dans `CLAUDE.md`, décisions
  structurantes ;
- **ce que l'outillage doit apprendre, préparé pendant les leviers 1 à 3** :
  lire un `.binpack` dans `tools/nnue-train` (le chargeur existe dans
  bullet) ; **l'échelle de leurs scores**, à lire au source de la
  conversion ou à étalonner sur nos évaluations — un score mal mis à
  l'échelle ne fait rien planter, il fausse la cible ; repartir d'un réseau
  entraîné plutôt que de zéro ;
- **la logistique, chez Théo** : ces jeux se téléchargent sur Kaggle, et
  pèsent lourd — la PR #257 de `nnue-pytorch` compte **141 Go** pour un seul
  fichier du deuxième étage de Stockfish, **223 Go** pour le troisième, et
  « *even the data for the first stage requires downloading 200GB* ». Notre
  entraînement ne voit que 4 milliards de positions : un fichier suffit, pas
  la collection.

**L'outillage du levier 4, écrit le 29 sept.** — `tools/nnue-train` :
- **il lit les `.binpack`** de Stockfish, par le chargeur de bullet
  (`SfBinpackLoader`), filtrés comme dans `examples/simple.rs` du commit
  épinglé : ni échec, ni coup tactique, rien avant le seizième demi-coup,
  pas de score de mat ; **un format par entraînement**, jamais `.vf` et
  `.binpack` mêlés ;
- **leur échelle, lue au source** — `LeelaChessZero/lc0`,
  `src/trainingdata/rescorer.cc`, `AsNnueString` au commit `1227b4c` : le
  score écrit vaut `660,6 q / (1 − 0,9751875 q¹⁰)`, `q` l'espérance de Leela
  ramenée à [−1, 1]. Près de zéro, cela fait **330,3 unités par unité de
  logit**, contre 400 pour nos données ; la cible d'un binpack s'entraîne à
  330,3. **Et vérifiée sur le fichier même** : la relecture ajuste l'échelle
  qui prédit le mieux le résultat par le score, sur deux millions de
  positions, et **refuse au-delà d'un facteur deux** — un binpack généré par
  Stockfish, ou d'une autre unité, ne ferait rien planter : il fausserait la
  cible ;
- **un binpack se relit bloc par bloc jusqu'au dernier octet**, et un
  fichier tronqué se refuse, comme un `.vf` ; il n'a pas de `--attendu` ;
- **`--depuis DOSSIER`** repart d'un point de sauvegarde de bullet — celui
  qui porte `optimiser_state/` : **garder les dossiers de points de
  sauvegarde des entraînements**, le réseau quantifié seul ne permet pas de
  repartir ;
- **six tests sans GPU**, dans la CI de `nnue-train.yml` depuis : le filtre,
  l'ajustement retrouvant trois échelles connues, les bornes, la relecture
  d'un binpack écrit par `sfbinpack` — tronqué ou suivi d'octets en trop,
  refusé —, et **le chargeur de bullet lui-même** lisant ce fichier à
  travers notre filtre. Six fautes injectées, six attrapées ; une septième
  — le contrôle de fin de fichier retiré — ne l'est pas, parce que
  `has_next_chunk` de sfbinpack ne rend « fin » qu'à la fin exacte, **sauf
  sur une erreur de `seek`** : le contrôle reste pour ce cas-là, qu'aucun
  test n'atteint, et c'est écrit à côté de lui.

**La séance du levier 4, sur la carte de Théo — écrite le 30 sept., à sa
demande** (« *ok pour leela, donne moi le protocole* »). **Deux réseaux**,
mesurés chacun contre N2 :
- **N2L — N2 puis Leela**, la recette de Stockfish : repartir du point de
  sauvegarde de N2 et ré-entraîner sur les données de Leela ;
- **L0 — Leela seul**, depuis zéro. Stockfish le trouve moins bon que ses
  données puis celles de Leela ; mais nos données sont bien plus faibles que
  les siennes — profondeur 9 contre nos 5 000 nœuds —, donc son verdict ne
  se transfère pas : il se mesure, pour le prix de quelques minutes de
  carte.

**Le fichier** — le wiki de l'entraîneur de Stockfish
(`official-stockfish/nnue-pytorch`, page « Training datasets », commit
`cc50d9e` du 28 sept. 2026) en nomme deux, sur Google Drive :
- **d'abord `training_data.binpack`**, « *the first good dataset derived
  from Lc0* » — Leela pur, donc une seule échelle de scores, celle que
  notre programme vérifie :
  <https://drive.google.com/file/d/1RFkQES3DpsiJqsOtUshENtzPfFgUmEff/view> ;
- **à défaut, `T60T70wIsRightFarseer.binpack`**, « *currently one of the
  best* » — mais un MÉLANGE, où entrent des parties de Stockfish contre
  lui-même : ses scores peuvent ne pas partager une échelle, et le
  programme peut le refuser, ce qui est son rôle :
  <https://drive.google.com/file/d/1_sQoWBl31WAxNXma2v45004CIVltytP8/view>.
  **Ce lien ne répond plus** (Théo, 30 sept.), le premier si. Ce n'est pas
  une faute de copie : l'identifiant est celui du wiki, relu au même
  commit — le fichier a quitté Drive ou n'y est plus ouvert, la cause
  ne se voit pas d'ici.

**D'où viennent ces fichiers, lu aux sources primaires le 30 sept.** — Drive
est le canal du projet Stockfish lui-même, pas un miroir de fortune : le
commit `f8c779db` de Stockfish (13 juin 2021 — le premier réseau par défaut
que son historique dise entraîné sur des données de Leela) les décrit comme
des parties de Leela contre elle-même, T60 et T74, « *available at
vondele's google drive* » — un mainteneur de Stockfish ; et cinq commits de
réseaux par défaut, de `adfb23c0` à `b939c805` (juin et juillet 2021),
citent **ce fichier-ci, au même identifiant**, parmi leurs données. La
source des données brutes est celle du projet Leela,
<https://storage.lczero.org/files/training_data> — le lien que porte la
mention d'attribution de Stockfish (`e8d2ba19`) —, dans le format
d'entraînement de Leela, que notre programme ne lit pas. **Le fichier de
Drive en est la conversion**, et le même wiki la documente, section « Lc0
data converter » : le script de borg télécharge les archives `test60` et
`test74` de `storage.lczero.org`, les rescore par le `rescorer` de lc0
(branche `rescore_tb` de Tilps) en `.plain`, puis les convertit en
`.binpack` par `stockfish convert` — les deux runs et l'auteur que nomme
`f8c779db`. Question de Théo le 30 sept., sur la foi de la mention de
Stockfish : ce sont bien les mêmes données, sous la forme que lit
l'entraîneur. **La mention d'attribution, le jour venu, cite l'origine** —
`storage.lczero.org`, comme Stockfish —, pas le fichier téléchargé.
Refaire la conversion depuis la source demanderait deux outils à
construire et des centaines d'archives, pour les mêmes données ; les runs
plus récents de Leela n'y sont un levier qu'après un verdict sur celles-ci.
Aucune somme de contrôle n'est publiée : la relecture complète du programme
refuse un fichier tronqué, et le critère d'échelle des scores d'une autre
unité.

**Leur taille n'est pas vérifiée** : Google Drive, Kaggle et la page des
jeux de linrock (`robotmoon.com/nnue-training-data`, les jeux plus récents)
sont refusés par le proxy du conteneur (403, relevé le 30 sept.). Drive
affiche la taille avant le téléchargement : **la lire d'abord**. Un binpack
s'entraîne tel quel, sans décompression — il faut sa taille libre, plus
quelques Go de points de sauvegarde. <s>Le fichier de Drive est donc prêt à
servir.</s> **Faux pour celui-ci, relevé par Théo le 2 oct.** : Drive
livre une ARCHIVE, `training_data.7z`, et le binpack est dedans — le
programme refuse, à raison, un fichier qu'il ne trouve pas. Je ne pouvais
pas voir la page (403) et je l'ai supposée ; l'étape 2 de la séance
l'extrait. Pour ordre de grandeur, les fichiers
des derniers étages de Stockfish pèsent 141 et 223 Go (PR #257 de
`nnue-pytorch`) ; un entraînement n'en voit que 4 milliards de positions,
**un fichier suffit**.

**La taille lue par Théo sur Drive le 30 sept. : 11 Go — celle de l'ARCHIVE
`training_data.7z`** (corrigé le 2 oct.), pas du binpack, qui est plus gros
: la compression de 7-Zip s'ajoute à celle du format. `7z l` imprime sa
vraie taille avant d'extraire. Ce qu'un binpack porte, par le format —
`docs/binpack.md` de la branche `tools` de Stockfish : une position coûte «
~2 octets » dans une suite de coups, plus 32 octets par début de suite — :
de l'ordre de 0,4 à 0,6 milliard de positions par Go de binpack, avant le
filtre ; <s>4 à 7 milliards pour 11 Go</s> — un minimum, désormais.
<span>Inférence, confiance moyenne</span> : l'essai court imprime les
octets, les blocs et la part gardée par le filtre. **Un fichier plus petit
que l'entraînement ne le casse pas** — lu au commit épinglé : le chargeur de
bullet (`crates/bullet_lib/src/value/loader/sfbinpack.rs`, `10e7e82`) relit
ses fichiers en boucle. Nos 40 superlots tirent 4 milliards de positions :
chacune de ce fichier passera **une à trois fois au plus** selon la part que
garde le filtre ; N2 revoyait les siennes **au moins seize fois** (4
milliards tirés de 249,5 M).

**Vérifié ici avant de l'écrire** : à `main` (`8b2c122`), `tools/nnue-train`
compile avec `--locked` et passe ses six tests — contre le runtime factice
de bullet, donc sans rien dire de CUDA ni de ce fichier, que l'essai court
éprouve. Chaque bloc se colle dans le MÊME terminal, dans l'ordre :

0. **le dépôt à jour, et le point de sauvegarde de N2** :
   ```sh
   cd ~/chess && git status
   git fetch origin && git switch main && git pull --ff-only
   git log --oneline -1
   ls -d tools/nnue-train/n2/shallowred-768x128-40/optimiser_state
   ```
   — `8b2c122` ou plus récent, et le dernier `ls` doit afficher le chemin.
   Des fichiers « modifiés », un `--ff-only` qui refuse ou un `ls` qui ne
   trouve rien : s'arrêter et le dire — sans ce dossier, N2L ne peut pas
   repartir de N2 ;
1. **CUDA dans ce terminal** — le bloc « CUDA dans ce terminal » de la
   séance d'entraînement du n° 7, tel quel : les trois bibliothèques du
   toolkit 13.2 doivent s'afficher ;
2. **le fichier** — téléchargé depuis un navigateur dans `~/leela/` : c'est
   une archive 7-Zip, `training_data.7z` (corrigé le 2 oct.), qu'il faut
   extraire. D'abord son contenu et sa taille décompressée, puis la place
   libre, qui doit la dépasser de quelques Go :
   ```sh
   command -v 7z || sudo apt install p7zip-full
   cd ~/leela && 7z l training_data.7z
   df -h ~/leela
   7z x training_data.7z
   find ~/leela -name '*.binpack' -exec ls -l {} +
   ```
   Le programme prend un fichier ou un dossier — d'un dossier, il lit les
   `.binpack` posés directement dedans, et ignore l'archive. Désigner
   celui qui les contient, une fois pour toute la séance :
   ```sh
   DONNEES=~/leela
   ```
   — ou le sous-dossier qu'a créé l'extraction, si `find` en montre un.
   Si seul le paquet `7zip` est installé, la commande s'appelle `7zz`.
   L'archive se supprime une fois l'essai court passé, pas avant ;
3. **un essai court**, qui éprouve la chaîne entière — CUDA, le chargeur de
   binpacks, la reprise depuis N2, la confrontation — et imprime l'échelle
   des scores :
   ```sh
   cd ~/chess/tools/nnue-train
   cargo run --release --features cuda -- --depuis n2/shallowred-768x128-40 \
     --superlots 1 --sortie essai-leela "$DONNEES" \
     2>&1 | tee essai-leela.sortie.txt
   ```
   Il doit finir sur `RÉSEAU PRÊT : essai-leela/shallowred-768x128-1/quantised.bin`.
   **Critère, écrit avant** : la ligne `échantillon : … échelle ajustée X`
   doit donner **X entre 250 et 450**. Le programme ne refuse qu'au-delà
   d'un facteur deux (165 à 660) ; entre les deux, il entraînerait à 330,3
   des scores d'une autre unité, sans rien faire planter. **Hors de 250 à
   450 : s'arrêter et m'envoyer la ligne.** La durée de l'essai, par
   superlot, donne celle des vrais ;
4. **N2L** :
   ```sh
   cargo run --release --features cuda -- --depuis n2/shallowred-768x128-40 \
     --sortie n2l "$DONNEES" 2>&1 | tee n2l.sortie.txt
   ```
   → `RÉSEAU PRÊT : n2l/shallowred-768x128-40/quantised.bin` ;
5. **L0** :
   ```sh
   cargo run --release --features cuda -- --sortie l0 \
     "$DONNEES" 2>&1 | tee l0.sortie.txt
   ```
   → `RÉSEAU PRÊT : l0/shallowred-768x128-40/quantised.bin` ;
6. **rapporter**, sur une branche `reseau/levier4` :
   ```sh
   cd ~/chess && git switch -c reseau/levier4
   for n in n2l l0; do
     d=tools/nnue-train/$n/shallowred-768x128-40
     cp $d/quantised.bin reseaux/$n-768x128-40.bin
     cp $d/log.txt reseaux/$n-768x128-40.log.txt
     cp tools/nnue-train/$n.sortie.txt reseaux/$n-768x128-40.sortie.txt
   done
   cp tools/nnue-train/essai-leela.sortie.txt reseaux/
   git add reseaux/n2l-* reseaux/l0-* reseaux/essai-leela.sortie.txt
   git commit -m "Réseaux NNUE du levier 4 : N2L et L0, données de Leela"
   git push -u origin reseau/levier4
   ```
   **Garder les dossiers `n2l/` et `l0/`**, et le fichier de données : un
   ré-entraînement de plus en repartirait.

*Durée* — **inconnue** : les 12 minutes de N2 lisaient du viriformat ; un
binpack se décode sur le processeur, et le décodage peut devenir le goulot.
L'essai court la dit. Un `ÉCHEC — …` à n'importe quel temps arrête tout, et
son message suffit à le diagnostiquer.

**Ce qui suit, écrit avant** : chaque réseau passe d'abord le contrôle de
confrontation que le programme imprime (écart médian ≤ 15, maximal ≤ 50),
puis **deux matchs de 3 000 parties à `8+0,08` contre N2**, graine « auto »
chacun, comme N1 et N2. **Ce que le match compare** — question de Théo le
2 oct. : le candidat est le `main` du jour où il se mesure, plus UN commit
qui ne change que le réseau embarqué (le chemin d'`include_bytes!` et la
confrontation recopiée dans le test, dans `engine/src/nnue.rs`) ; la
référence est ce même `main`. Les optimisations faites entre-temps — B8
compris — sont des deux côtés, et le match ne mesure que le réseau : c'est
ainsi que N1 et N2 ont été mesurés (`c430fe5` et `af62e48` ne touchent que
`nnue.rs`). La seule chose qui ne se transporte pas avec le réseau, ce sont
les marges réglées sur N2 — d'où la sonde de B8, au paragraphe « Ajouté
le 1er oct. ». **Critère de gain** : borne basse de l'intervalle mis en
commun au-dessus de zéro — le meilleur des réseaux qui le passent
remplace N2, sa confrontation recopiée dans le test du moteur, et
**`README.md` porte la mention d'attribution de l'ODbL** le jour même
(`CLAUDE.md`, décisions structurantes). *Attendus* — <span>inférence,
confiance faible</span> : **N2L, 0 à +60, ~+25** — la recette de Stockfish,
sur un réseau et des données bien plus faibles que les siens ; **L0, −40 à
+40** — deux effets de signes contraires, dont aucun n'est chiffré ici.

**Ajouté le 1er oct., avant toute mesure** : B8 a mis les marges de la
recherche à l'échelle de N2 — × 2,24, **+50,50 ± 5,37** —, et ce facteur
appartient à N2. **Avant les matchs de N2L et L0, la sonde de B8 se relance
sur le réseau à mesurer** (`tools/attic/b8-sonde-marges.patch`, rebasée sur
le code fusionné). Si son facteur s'écarte de 2,24 de plus de ± 25 %, il se
règle d'abord — un changement de code, mesuré comme tel —, sans quoi le
match mêlerait la valeur du réseau à celle de ses marges. <span>Inférence,
confiance faible</span> : un réseau appris sur des cibles d'une autre
échelle — 330,3 par unité de logit, et non 400 — peut porter une autre
pente.

**L'essai court, passé le 2 oct.** (Théo) : échelle ajustée **282,1**, dans
le critère écrit avant — 250 à 450. <span>Inférence, confiance
moyenne</span> : 15 % sous l'échelle de la conversion, 330,3 — sur ces
parties, un score annonce un résultat un peu plus tranché que la formule de
lc0 ne le dit. L'entraînement reste à 330,3, comme écrit. Si N2L déçoit, cet
écart est une piste à mesurer, pas une explication.

**Les deux entraînements, relevés le 2 oct.** — branche `reseau/levier4` de
Théo (`180ba84`), intégrée par `0a0ed70` : binpack de **14 366 468 016
octets**, 14 905 blocs, 58,9 % des positions décodées gardées par le filtre ;
**N2L en 11 min 34 s, L0 en 11 min 36 s**, sur la RTX 3050 de Théo. Les
deux confrontations passent le critère écrit avant (médian ≤ 15, maximal ≤
50) : **N2L 4 et 9, L0 4 et 21**. Perte finale sur les données de Leela :
0,05815 et 0,05821 — N2L part plus bas (0,0598 contre 0,0628 au premier
superlot) et arrive au même point. *Une perte ne dit pas la force* : les
matchs le diront.

**La sonde de B8 sur N2L et L0 — écrite le 2 oct., avant de la lancer.**
Le protocole du 30 sept., réduit à ce qui règle le facteur : 40 parties du
réseau contre lui-même à `8+0,08` (livre du dépôt, `-srand 20260930`), le
binaire sondé construit sur `main` — marges à × 2,24, le régime où le réseau
jouera ; l'élagage delta rejoué, l'aspiration comptée. La faite main est
reprise de la sonde du 30 sept. : son chemin est le même au bit près, B8 ne
touchant que celui du réseau. La futilité inverse n'est pas rejouée — elle
n'a pas de facteur. **Règle, écrite avant** (l'amendement du 1er oct.) : la
moyenne géométrique des deux facteurs égalisants, delta et aspiration,
comme pour N2 ; **dans ± 25 % de 2,24 — 1,68 à 2,80 —, le réseau se mesure
au facteur de `main`** ; hors de cette plage, le facteur se règle d'abord
et le candidat porte le réseau ET son facteur. *Attendu* — <span>inférence,
confiance faible</span> : dans la plage pour les deux, rien n'annonçant une
autre échelle — la conversion de lc0 et nos données s'expriment en
probabilité de gain, et le moteur lit les deux réseaux à la même échelle de
sortie.

**La sonde, RELEVÉE le 2 oct.** — 40 parties par réseau, zéro perte au
temps, zéro anomalie ; la faite main, celle du 30 sept. ; lecteur
`facteurs.py`, le rejeu du réseau par `SONDE_B8_EVALFILE` (ajouté au
lecteur de la rustine) :

| réseau | facteur delta | facteur aspiration | moyenne géométrique | pente, rapport médian |
|---|---|---|---|---|
| N2 (30 sept., référence) | × 2,5 | × 2,0 | 2,24 | 2,30 ; 2,02 |
| **N2L** | × 2,6 | × 2,60 | **2,60** | 2,69 ; 2,52 |
| **L0** | × 3,1 | × 2,20 | **2,61** | 2,55 ; 2,40 |

**Par la règle, les deux dans la plage** — 2,60 et 2,61 contre 1,68 à
2,80 : **chaque réseau se mesure au facteur de `main`, 2,24**, et son
candidat ne change que le réseau. Dans l'attendu. Les pentes de N2 sont
recalculées ici sur tous les nœuds journalisés, non sur le tiers rejoué —
2,30 et 2,02 au lieu de 2,40 et 2,16 ; c'est cette ligne-ci qui se compare.
Les deux réseaux de Leela portent des nombres **12 à 25 % plus grands** que
N2 ; à 2,24, leur élagage delta reste ~2 fois plus fautif que la faite main
(0,72 et 0,94 % à × 2,2, contre 0,30 %) — une marge à affiner plus tard,
si l'un d'eux est retenu, par sa propre mesure.

**Les candidats et leurs matchs, lancés le 2 oct.** — `5764f2b` (N2L) et
`3349f53` (L0), révoqués aussitôt par `f7a84b5` et `448fed3` ; chacun ne
change que `engine/src/nnue.rs` — le chemin d'`include_bytes!` et la
confrontation de son entraînement recopiée dans le test —, contre la
référence `4526a2c`, le code de leur parent au bit près. Le test de
confrontation passe sur chacun, `verify.sh --rapide` vert. Deux matchs de
3 000 parties à `8+0,08` par réseau, graine « auto » chacun : N2L
36995335076 et 36995337871, L0 36995340993 et 36995343981. Le critère et
les attendus sont ceux de « Ce qui suit, écrit avant ». **À la fusion d'un
gagnant** : révoquer sa révocation, `README.md` porte la mention
d'attribution de l'ODbL, et `CLAUDE.md` dit le réseau qui joue.

#### Levier 4 — VERDICT, 2 oct. 2026 : N2L +16,40 ± 6,20 Elo à `8+0,08` contre N2 — EMBARQUÉ ; L0 +10,02 ± 6,19

Quatre matchs de 3 000 parties, finis entiers entre 15 h 50 et 15 h 54, graines
distinctes, zéro perte au temps, zéro coup illégal :

| réseau | match | runner — bench, profondeur en 250 ms | Elo | pentanomial |
|---|---|---|---|---|
| N2L | 36995335076 | Xeon 8573C — 2 544 827 n/s, 12 | +15,76 ± 8,67 | 94, 238, 750, 274, 144 |
| N2L | 36995337871 | EPYC 7763 — 2 139 930 n/s, 12 | +17,04 ± 8,87 | 108, 228, 715, 307, 142 |
| **N2L** | **en commun** | homogènes, z = −0,20 | **+16,40 ± 6,20** | 202, 466, 1 465, 581, 286 |
| L0 | 36995340993 | Xeon 8573C — 2 499 051 n/s, 12 | +11,47 ± 8,81 | 103, 252, 733, 267, 145 |
| L0 | 36995343981 | EPYC 9V74 — 2 083 278 n/s, 12 | +8,57 ± 8,70 | 106, 258, 714, 300, 122 |
| **L0** | **en commun** | homogènes, z = 0,46 | **+10,02 ± 6,19** | 209, 510, 1 447, 567, 267 |

- **Par le critère, écrit avant** : les deux bornes basses sont au-dessus de
  zéro — +10,2 et +3,8 — ; **le meilleur des deux, N2L, remplace N2**.
  `d3edeb6` révoque la révocation `f7a84b5` : `main` embarque
  `reseaux/n2l-768x128-40.bin`, la confrontation de son entraînement dans le
  test du moteur, banc inchangé — la faite main n'a pas bougé.
- **Les attendus tiennent** : N2L 0 à +60, ~+25 — mesuré dans la
  fourchette, sous le centre ; L0 −40 à +40 — dans la fourchette, et
  positif : sur ce moteur, les données de Leela seules valent déjà mieux que
  nos étiquettes. **L'écart N2L − L0, +6,4, n'est pas séparé** (± 8,8) :
  « le meilleur » se lit au point, comme le critère l'écrivait. La recette
  de Stockfish — nos données puis les leurs — tient ici aussi, sans être
  démontrée meilleure.
- **Les avertissements** : « PV continues after… », 0 à 4 par moteur et par
  match — 10 côté N2, 7 côté candidats sur 12 000 parties : la signature
  connue de C31, à son taux (~1 pour 1 000).
- **Les pentanomiaux** des deux matchs d'un même réseau diffèrent
  normalement — rien de la ressemblance de B8. Les paires à 0 ou 2 points
  y sont plus nombreuses : 228 à 250 sur 1 500, contre 146 et 147 pour B8,
  qui ne changeait que des marges au même réseau. <span>Inférence,
  confiance moyenne : deux réseaux d'apprentissages différents ne se
  trompent pas dans les mêmes positions.</span>
- **`README.md` porte la mention d'attribution de l'ODbL** (section
  « Remerciements ») et `CLAUDE.md` dit le réseau qui joue.
- **Ce qui reste, à mesurer** : le facteur des marges de N2L — 2,60 mesuré,
  2,24 en place. <s>Et une série de C13 pour situer N2L sur l'échelle de
  Stockfish</s> — **relevée : 2 952 ± 30**, section C13.

### N° 9 — les techniques de recherche absentes : l'écran, écrit le 5 oct. avant de mesurer

**L'ordre est décidé** — Théo, 29 sept. : n° 7, puis n° 8, puis n° 9. Le
n° 7 a mesuré ses quatre leviers (N2L joue depuis le 2 oct.) et B8 est
fusionné. La ligne du backlog nomme neuf techniques absentes de
`search.rs` ; **chacune un match, séparément**, et le mécanisme d'abord.

**Par où commencer — le coup nul, lu au code le 5 oct.**
`NULL_MOVE_REDUCTION` vaut 2 depuis le 13 sept. (+75,1 ± 19,7 à `1+0,01`,
jamais revu à la cadence qui tranche), et **rien n'exige que l'évaluation
statique atteigne bêta** pour essayer le coup nul — la condition que porte
Stockfish, comme la plupart des moteurs. Deux leviers sur un mécanisme
déjà payé, de deux ou trois lignes chacun ; et l'IIR — une profondeur de
moins quand la table n'a pas de coup —, une ligne. Les autres techniques
demandent plus de code, ou des marges en unités d'évaluation que B8 oblige
à sonder à l'échelle du réseau : elles viennent après.

**L'écran — protocole.** Un journal de 60 parties du moteur qui joue
(`main` à `1f99a69`, N2L) contre lui-même à `8+0,08`, cutechess `-debug
all`, `-srand 20261005`, trois parties à la fois dans le conteneur. Ses
positions rejouées à la profondeur 10, table conservée d'un coup à
l'autre — le rejoueur d'A20, élargi —, par un binaire de MESURE : des
variantes choisies par la variable `N9`, et sans elle `main` au nœud près,
vérifié par le banc. Il compte, sur le moteur tel qu'il est, les essais de
coup nul, leurs coupures et les nœuds qu'ils dépensent, selon que
l'évaluation statique atteint bêta ou non ; et les nœuds de profondeur ≥ 4
sans coup de la table. Puis l'arbre de chaque variante. **Ce que l'écran
donne : le coût, exactement, et combien le mécanisme sert ; pas l'Elo**
(`CLAUDE.md`, « c'est plus fort »).

**Attendus, écrits avant** — <span>inférence, confiance faible</span> :
- les essais sous bêta : **30 à 50 %** des essais, et ils coupent **3 à 4
  fois moins** souvent que les autres ;
- les recherches de coup nul : **15 à 40 % des nœuds** de l'arbre ;
- l'arbre de chaque variante, contre `main` : la garde **−5 à −15 %** ;
  R = 3 + d/4 **−20 à −40 %** ; R = 3 + d/3 **−25 à −45 %** ; l'IIR **−3
  à −10 %**.

**L'écran, RELEVÉ le 5 oct. à 06 h 30** — journal de 60 parties, zéro perte
au temps ; 5 276 recherches rejouées, table conservée. La sonde n'ajoute
qu'un calcul pur : son binaire rend le banc de `main`, 107 548, et chaque
candidat ci-dessous rend EXACTEMENT l'arbre de sa variante.

| | profondeur 10 | profondeur 12 | attendu, écrit avant |
|---|---|---|---|
| essais de coup nul sous bêta | 53,2 % | 52,0 % | 30 à 50 % — **au-dessus** |
| leur taux de coupure, contre celui des autres | 1,7 % contre 52,7 % | 1,8 % contre 54,4 % | 3 à 4 fois moins — **30 fois moins** |
| recherches de coup nul, part de l'arbre (union) | 20,0 % | 30,7 % | 15 à 40 % — **dedans** |
| nœuds de profondeur ≥ 4 sans coup de la table | 9,3 % | 13,3 % | — |
| l'arbre — la garde | −2,7 % | −3,8 % | −5 à −15 % — **sous** |
| R = 3 + d/4 | −14,8 % | −23,7 % | −20 à −40 % — **sous à 10, dedans à 12** |
| R = 3 + d/3 | −18,5 % | −26,5 % | −25 à −45 % — **sous à 10, dedans à 12** |
| l'IIR | −2,8 % | −3,9 % | −3 à −10 % — **au bord** |

- **Les économies croissent avec la profondeur**, et le moteur joue à 12 ou
  13 à `8+0,08`, à ~17 à 30+0,3 : la profondeur 10 les sous-estime. La part
  du coup nul passe de 20 à 31 % de l'arbre en deux plis.
- **Les essais sous bêta sont presque toujours vains** : 1,8 % de coupures
  contre 54 %, pour 8,4 % des nœuds à la profondeur 12 et 3,5 % des
  coupures du coup nul. Mais les supprimer n'épargne que 3,8 % : un essai
  vain est court, et une coupure perdue se paie d'une recherche entière.
- **Un premier compte sommait les nœuds de recherches emboîtées** — un coup
  nul dans un coup nul, compté deux fois. Corrigé avant tout chiffre écrit :
  l'union, au coup nul le plus extérieur, comme pour A20.

**Les candidats** — chacun révoqué aussitôt, sa rustine à l'attic, chacun
contre `18a3805`, le moteur de `main` :

| candidat | ce qu'il change | commit | révoqué par |
|---|---|---|---|
| **C32** | la réduction du coup nul, `3 + d/3` au lieu de 2 | `4270eef` | `467f707` |
| **C32b** | la même, `3 + d/4` — le second point d'une bissection | `b52e0d3` | `610428f` |
| **C33** | le coup nul seulement si l'évaluation statique atteint bêta | `94e84bb` | `cd12cf2` |
| **C34** | l'IIR : un pli de moins sans coup de la table, dès la profondeur 4 | `99178f5` | `f504a84` |

`verify.sh --rapide` vert sur chacun ; sur C34, un test d'horloge
(`le_budget_de_temps_est_respecte`, 900 ms admis) a d'abord échoué à
908 ms — trois suites de tests tournaient en même temps sur quatre cœurs —,
puis passé trois fois sur trois au repos, en 0,35 s, et la suite entière
avec lui.

**Attendus, écrits avant les matchs** — <span>inférence, confiance
faible</span>. L'arbre à la profondeur 12, converti par l'étalon (1,36 pli
par doublement, 60 à 105 Elo par pli), donne le gain si la justesse ne
bougeait pas : **un majorant**, que l'élagage plus agressif rogne d'une
quantité que seul le match mesure.
- **C32** : −26,5 % → 0,60 pli → majorant +36 à +63 ; **attendu 0 à +40,
  ~+15**.
- **C32b** : −23,7 % → 0,53 pli → majorant +32 à +56 ; **attendu 0 à +35,
  ~+15** — moins d'économie, moins de risque.
- **C33** : −3,8 % → 0,08 pli → +5 à +8, et la garde ne retire que les
  coupures les plus douteuses ; **attendu 0 à +10, ~+5**.
- **C34** : −3,9 % → +5 à +8 par la vitesse, et un coût en justesse de
  signe inconnu ; **attendu −10 à +10, ~+3**.

**Critère, écrit avant** — des techniques ajoutées, pas des correctifs de
règle : **gain si la borne basse commune est au-dessus de zéro**. Si C32 et
C32b le passent tous deux, le meilleur au point est fusionné, comme au
levier 4. **Puissance, dite d'avance** : C32 et C32b, deux jobs de 3 000
parties chacun — ± 6,2 en commun ; C33 et C34, dont l'attendu est petit,
**quatre jobs chacun** — ± 4,4 —, et même ainsi un vrai +5 ne passera la
borne que six fois sur dix environ : c'est écrit, et on ne remesure pas
sans fait neuf.

**Le deuxième écran — protocole et attendus, écrits le 5 oct. à 06 h 35,
avant de mesurer** (`5be5828` ; « 06 h 50 », d'abord écrit, était faux). Pendant que les douze jobs jouent : ce qui ne touche ni
le coup nul ni l'IIR. Le même journal, le même rejeu, un binaire de mesure
élargi :
- **le drapeau *improving*** — l'évaluation statique du nœud dépasse-t-elle
  celle de deux plis plus haut, même camp au trait (quatre si celui-là
  était en échec ; vrai faute de point de comparaison), comme chez
  Stockfish. Trois usages, chacun une variante : la futilité inverse avec
  une profondeur de moins dans sa marge quand la position s'améliore
  (`imp-rfp`) ; l'élagage par compte de coups à moitié de son seuil quand
  elle ne s'améliore pas (`imp-lmp`) ; un pli de réduction de plus pour un
  coup tardif quand elle ne s'améliore pas (`imp-lmr`). La sonde compte la
  part des nœuds hors échec où il est vrai ;
- **l'échange statique dans la recherche principale** (`see-cap`) : à la
  profondeur ≤ 6, hors échec et hors racine, après un premier coup, une
  capture qui perd plus de 100 × la profondeur au compte de `see` est
  sautée — la quiescence le fait déjà, la recherche principale non. La sonde
  compte les captures éligibles, celles qu'elle sauterait, et parmi
  celles-ci **celles qui, cherchées, montent `alpha`** : les dégâts, comme
  pour LMP. Les coups TRANQUILLES perdants attendront : `see` rend 0 pour
  eux, l'étendre est un autre chantier.

**Attendus, écrits avant** — <span>inférence, confiance faible</span> :
- *improving* vrai dans **55 à 70 %** des nœuds hors échec ;
- l'arbre à la profondeur 12 : `imp-rfp` **−1 à −4 %**, `imp-lmp` **−5 à
  −15 %**, `imp-lmr` **−5 à −15 %** ;
- `see-cap` : **10 à 30 %** des captures éligibles sautées, **1 à 5 %**
  d'entre elles montant `alpha` ; l'arbre **−2 à −8 %**.

**Le deuxième écran, RELEVÉ le 5 oct. à 06 h 55** — le même journal, le
même rejeu ; le binaire de mesure rend toujours le banc de `main`.

| | profondeur 10 | profondeur 12 | attendu, écrit avant |
|---|---|---|---|
| *improving* vrai, nœuds hors échec | 77,8 % | 77,9 % | 55 à 70 % — **au-dessus** |
| l'arbre — `imp-rfp` | −19,0 % | −16,9 % | −1 à −4 % — **très au-dessus** |
| `imp-lmp` | −15,6 % | −13,5 % | −5 à −15 % — **dedans** |
| `imp-lmr` | −13,2 % | −16,6 % | −5 à −15 % — **au-dessus à 12** |
| `see-cap` | −11,8 % | −10,0 % | −2 à −8 % — **au-dessus** |
| captures éligibles sautées | 54,1 % | 52,9 % | 10 à 30 % — **au-dessus** |
| …qui, cherchées, montent `alpha` | 0,56 % | 0,52 % | 1 à 5 % — **sous** |

- **Quatre réductions d'arbre de 10 à 19 %** : c'est leur coût, exactement ;
  ce qu'elles rognent de justesse, seul un match le dit — un élagage qui
  retire 17 % de l'arbre et le dixième d'une variante juste peut perdre.
- **Les captures perdantes sont la moitié des captures éligibles**, et elles
  ne montent presque jamais `alpha` : le mécanisme que la quiescence exploite
  déjà existe, inemployé, dans la recherche principale.

**Trois candidats de plus**, contre le même `18a3805` :

| candidat | ce qu'il change | commit | révoqué par |
|---|---|---|---|
| **C35** | *improving* dans la futilité inverse : un pli de marge de moins quand la position s'améliore | `d0513da` | `c3233e9` |
| **C37** | *improving* dans LMR : un pli de réduction de plus quand elle se dégrade | `cefbcfb` | `2550eec` |
| **C38** | une capture qui perd plus de 100 × la profondeur à l'échange se saute, à la profondeur ≤ 6 | `5b5c13e` | `047f62b` |

Chacun rend EXACTEMENT l'arbre de sa variante ; *improving* y vit dans une
pile d'évaluations par ply, l'évaluation du nœud calculée une fois et
partagée avec la futilité inverse. `verify.sh --rapide` vert sur chacun.

**C36 — *improving* dans l'élagage par compte de coups — n'est PAS lancé.**
Il fait tomber `lelagage_par_compte_retire_des_noeuds` : sur la deuxième
position du banc, évaluée à la main, l'élagage à demi-seuil quand la
position se dégrade GROSSIT l'arbre — 84 658 nœuds avec, 73 203 sans ; le
banc lui-même passe de 107 548 à 122 554. Au réseau, le rejeu dit −15,6 %.
La règle (`CLAUDE.md`) ne laisse reformuler un test que si la mesure qui le
condamne a été obtenue SANS le changement : ici, elle vient du changement
même. **Ce qu'il faudrait avant de le relancer** : mesurer sur `main`, sur
un échantillon de positions et non une, si « l'élagage par compte retire
des nœuds » tient en général à la faite main — ou ne tenait que par chance.

**C36 — la mesure indépendante, protocole et attendus écrits le 5 oct. à
07 h 30, avant de mesurer.** La règle ne demande pas « C36 grossit-il
l'arbre ? » : il le grossit, et cette mesure-là vient du changement. Elle
demande : **sur `main`, sans C36, `lelagage_par_compte_retire_des_noeuds`
asserte-t-il une propriété générale, ou une propriété qui tient sur sa
position ?** Le protocole exact du test — recherche froide, profondeur 7,
faite main, `search()` contre `search_sans_lmp()` — sur les **4 684
positions distinctes** cherchées dans le journal de l'écran (60 parties du
moteur qui joue), par un test ignoré, à l'attic. **Éprouvé sur les six
positions du banc** : 107 548 nœuds avec, la référence, 148 867 sans, les
six réduites.

**Attendus** — <span>inférence, confiance faible</span> :
- sur `main` : au total, avec / sans **0,65 à 0,80** (le banc : 0,72) ;
  avec ≥ sans sur **1 à 10 %** des positions ;
- sous C36, au même protocole : avec / sans **0,75 à 1,05** ; avec > sans
  sur **5 à 20 %** des positions.

**Règle de décision, écrite avant** :
1. **Au moins une position de `main` où avec ≥ sans** : la propriété n'est
   pas générale, et l'assertion sur une position tient par le choix de la
   position. Le test se reformule en **compte sur un échantillon, borné
   qualitativement** — Σ avec < Σ sans sur les six positions du banc,
   l'échantillon des tests de nœuds, choisi bien avant C36 —, au titre de
   cette mesure, obtenue sans C36. Le crible de `search.rs` passe avant la
   fusion : un test touché déplace le plafond.
2. **Aucune** : la propriété est générale sur `main`, le test reste tel
   quel, et C36 ne se lance pas sous cette forme.
3. Dans le cas 1 seulement : **C36 ne passe que si Σ avec < Σ sans tient
   aussi sur les 4 684 positions**, et pas seulement sur le banc. Je sais
   déjà qu'il passe sur le banc — 122 554 contre 148 867 —, donc le banc
   seul ne peut pas trancher pour lui.

**C36 — la mesure indépendante, RELEVÉE le 5 oct. à 07 h 35** — 4 684
positions, profondeur 7, faite main, recherches froides ; la sonde est
`tools/attic/c36-sonde-compte.patch`.

| | Σ avec / Σ sans | avec > sans | avec = sans | rapport médian | 9ᵉ décile | maximum | attendu, écrit avant |
|---|---|---|---|---|---|---|---|
| `main` | 0,638 | 661 (14,1 %) | 8 | 0,673 | 1,102 | 4,62 | 0,65 à 0,80 — **sous** ; 1 à 10 % — **au-dessus** |
| C36 | 0,520 | 326 (7,0 %) | 6 | 0,539 | 0,921 | 3,49 | 0,75 à 1,05 — **sous** ; 5 à 20 % — **dedans** |

Les « sans » sont identiques au nœud près d'un binaire à l'autre :
l'infrastructure d'*improving* ne touche pas l'arbre.

- **Cas 1 de la règle.** Sur `main`, l'élagage par compte grossit l'arbre
  d'une position de partie sur sept, jusqu'à × 4,6 : la propriété que le
  test assertait sur une position n'est pas générale, elle tenait par le
  choix de la position. **Le test se compte désormais sur les six positions
  du banc** (`0c14b63`) ; témoin : LMP éteint dans la recherche « avec », il
  tombe sur 148 867 contre 148 867. Le crible de `search.rs` à ce commit
  tourne avant la fusion : run **37278951437**.
- **Condition 3 tenue.** Sous C36, Σ avec / Σ sans vaut 0,520 sur les 4 684
  positions : il retire PLUS que `main`, et grossit l'arbre sur deux fois
  moins de positions. La position du test est l'une des 326 où il le
  grossit — 63 050 nœuds sous `main`, 84 658 sous C36, 73 203 sans
  élagage. **C36 se lance.**
- À la faite main et à froid, C36 retire 18,5 % de l'arbre de `main` sur
  ces positions ; au réseau et en partie, le rejeu disait −13,5 % à la
  profondeur 12. Même sens, même ordre de grandeur.
- **Deux autres tests ont la même forme** : `la_futilite_inverse_retire_des_noeuds`
  et `lelagage_delta_retire_des_noeuds`, chacun sur la même position du
  banc. Rien ne les fait tomber aujourd'hui. Le jour où un changement les
  fait tomber, la même sonde dira s'ils tenaient par le choix de la
  position — avant toute reformulation, jamais après.

**Le candidat** : C36 `fd501a8`, révoqué par `a4f005b`. Son arbre est
exactement celui d'`imp-lmp` — 188 277 802 nœuds au rejeu à la profondeur
10 — et son banc vaut 122 554 à la profondeur 7, 62 611 à la 6. Le seuil se
calcule une fois par nœud (`lmp_threshold`), ce qui garde
`late_move_prune` à six paramètres.

**Attendu, écrit avant le match** — <span>inférence, confiance
faible</span>. L'arbre −13,5 % à la profondeur 12 donne 0,29 pli, soit un
majorant de +17 à +30. Mais l'élagage par compte ne se rattrape pas, et il
coupe davantage là où la position se dégrade — là où une défense tranquille
mal classée compte le plus. **Attendu −10 à +15, ~+3.** **Critère** : le
même — gain si la borne basse commune est au-dessus de zéro. **Deux jobs**,
contre `18a3805` comme le reste du n° 9 — puis quatre, avec ceux du
deuxième écran (ci-dessus).

**Attendus, écrits avant les matchs** — <span>inférence, confiance
faible</span> ; l'arbre à la profondeur 12 converti par l'étalon donne un
majorant :
- **C35** : −16,9 % → 0,36 pli → majorant +22 à +38. Mais la marge
  rétrécit dans 78 % des nœuds, et la futilité inverse ne se rattrape
  pas ; **attendu −10 à +20, ~+5**.
- **C37** : −16,6 % → majorant +21 à +37 ; la réduction se rattrape par la
  re-recherche ; **attendu 0 à +20, ~+8**.
- **C38** : −10,0 % → 0,21 pli → majorant +12 à +22 ; dégâts 0,5 % des
  sauts ; **attendu 0 à +15, ~+7**.

**Critère, écrit avant** : le même — gain si la borne basse commune est
au-dessus de zéro. **Deux jobs chacun**, ± 6,2 : un vrai +7 ne passera la
borne qu'une fois sur deux environ. **Porté à QUATRE jobs chacun le 5 oct. à
08 h 00, avant tout résultat — C36 compris.** Les deux jobs par candidat
venaient d'un plafond de vingt jobs simultanés, supposé et faux (trente
tournent) ; à ± 4,4, un vrai +7 passe la borne neuf fois sur dix environ. Les
jobs ajoutés finissent vers 13 h 55, et la relève les attend. Aucun journal
de ces matchs n'a été ouvert : décidé sur la puissance, pas sur les données. Six jobs, qui portent à dix-huit ceux qui
tournent à la fois — <s>deux places restent à la CI.</s> **Faux, relevé
le jour même** : je supposais un plafond de vingt jobs, jamais mesuré. À
07 h 39, le crible de C36 a lancé ses dix jobs aussitôt, à côté des
dix-huit matchs et de la CI — **trente jobs à la fois**, aucun en attente.
Le plafond réel reste inconnu ; il est au moins de trente.

**La composition des gagnants — protocole écrit le 5 oct. à 08 h 05, avant
toute relève.** Chaque candidat se mesure SEUL contre `18a3805`. Plusieurs
gagnants empilés n'ont jamais été mesurés ensemble, et deux familles se
touchent : le coup nul (C32 ou C32b, C33) et *improving* (C35, C36, C37). Ce
dépôt a déjà vu un acquis fondre par empilement — l'élagage delta sous
l'échange statique. Un gain démontré seul ne dit donc rien de la somme. Le
protocole :
1. **À la relève de 12 h 10, le meilleur gagnant au point se fusionne seul**
   — de C32 et C32b, un seul, comme écrit. Son gain est démontré, et
   l'attendre retarderait tout le reste.
2. **Les autres gagnants des deux relèves forment UN groupe**, composé sur ce
   nouveau `main` (`verify.sh`, banc mis à jour), révoqué aussitôt, et
   **mesuré contre ce `main`**, quatre jobs à `8+0,08`. Ce qu'il mesure est
   exactement ce qu'on fusionnerait : l'apport du reste par-dessus le
   meilleur.
3. **Attendu** : au plus la somme de leurs gains seuls ; l'empilement est
   sous-additif ici, et deux familles se recouvrent — la somme est un
   majorant, jamais une estimation.
4. **Critère** : le groupe se fusionne si sa borne basse commune est
   au-dessus de zéro. Sinon, **bissection par famille** — coup nul,
   *improving*, le reste —, chaque moitié mesurée de la même façon ; jamais
   par intuition.
5. Sans autre gagnant que le meilleur : rien à composer. Sans gagnant du
   tout : rien ne se fusionne.

**Le troisième écran — la futilité aux nœuds frontières, protocole et
attendus écrits le 5 oct. à 08 h 30, avant de mesurer.** La futilité
inverse coupe un NŒUD dont l'évaluation statique dépasse bêta d'une marge ;
la futilité aux nœuds frontières coupe un COUP tranquille quand
l'évaluation du nœud, plus une marge, n'atteint pas alpha — le même pari,
côté alpha. Absente de `search.rs`. Sa marge est en unités d'évaluation, et
B8 oblige à la mesurer à l'échelle du réseau plutôt qu'à la transposer.
**La sonde mesure donc la courbe entière, pas un réglage** : pour chaque
coup tranquille CHERCHÉ — hors échec, ne donnant pas échec, hors racine,
après un premier coup, à la profondeur ≤ 6 —, l'écart `g = alpha −
évaluation statique` en unités du réseau, par seau de 50 et par profondeur,
et si le coup, une fois cherché, monte `alpha` : les dégâts, comme pour
LMP. Une marge `M(d)` se lit alors sans rien rejouer : la part sautée,
P(g ≥ M) ; la part des montées d'`alpha` détruites, P(g ≥ M | monte). Les
coups que LMP coupe déjà ne sont jamais cherchés, donc jamais comptés :
la courbe mesure exactement ce que la futilité AJOUTERAIT. Le même journal,
le même rejeu aux profondeurs 10 et 12 ; sans variante, `main` au nœud près.

**Attendus** — <span>inférence, confiance faible</span> :
- l'évaluation statique est sous `alpha` (g > 0) pour **40 à 70 %** des
  tranquilles éligibles ;
- leur taux de montée d'`alpha` décroît avec g, et passe **sous 2 %**
  au-delà de g = 300 ;
- à 2 % des montées détruites, la marge sauterait **10 à 30 %** des
  tranquilles éligibles à la profondeur 1, et l'arbre perdrait **5 à 15 %**
  à la profondeur 12.

**La règle de choix, écrite avant** : à chaque profondeur, la plus petite
marge, par pas de 50, qui détruit au plus **2 % des montées d'`alpha`** —
le niveau de LMP à son seuil retenu, mesuré le 15 sept. à la faite main —,
puis la droite
`a + b·d` la plus proche par-dessus, pour qu'aucune profondeur ne dépasse
son budget de dégâts. Un candidat à ce niveau, C39 ; un second à 1 %,
C39b, pour encadrer.

**Le troisième écran, RELEVÉ le 5 oct. à 08 h 45** — le même journal, le
même rejeu ; le binaire de mesure rend toujours le banc de `main`, et les
totaux du rejeu sont ceux de `main` au nœud près.

| profondeur restante | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| tranquilles éligibles, rejeu à 12 (millions) | 115,0 | 71,0 | 51,1 | 48,8 | 23,9 | 12,1 |
| évaluation sous `alpha` (g ≥ 0), rejeu à 10 | 86,7 % | 84,1 % | 85,6 % | 83,2 % | 80,3 % | 78,4 % |
| ils montent `alpha`, rejeu à 10 | 5,5 % | 3,3 % | 1,0 % | 0,7 % | 0,6 % | 0,5 % |
| marge à 2 % de montées détruites, max des rejeux à 10 et 12 | 100 | 150 | 200 | 200 | 200 | 250 |
| …ce qu'elle saute, rejeu à 12 | 71,9 % | 65,7 % | 60,5 % | 58,5 % | 58,0 % | 55,7 % |
| marge à 1 % | 150 | 150 | 200 | 250 | 250 | 300 |

- **Au-dessus de l'attendu partout.** L'évaluation est sous `alpha` pour 78
  à 87 % des tranquilles éligibles (attendu 40 à 70 %) ; leur taux de
  montée passe sous 2 % dès g = 100, pas 300 ; une marge à 2 % de dégâts en
  saute 72 % à la profondeur 1 (attendu 10 à 30 %).
- **Un coup tranquille qui monte `alpha` vient presque toujours d'un nœud
  dont l'évaluation est à moins de 100 d'`alpha`** — 0,4 pion de la faite
  main, à l'échelle de B8. C'est le pari de la futilité, et la sonde le
  chiffre au lieu de le supposer.
- **La règle de choix avait un trou, nommé avant de choisir** : « la droite
  la plus proche » ne disait pas sous quelle mesure. Lue au sens premier —
  la somme des écarts aux marges requises, coefficients au pas de 5 —, elle
  rend **`140 + 20·d` à 2 %** (160 à 260) et **`130 + 30·d` à 1 %** (160 à
  310), C39 partout au moins aussi agressif que C39b, comme « encadrer » le
  veut. La lecture pondérée par les coups touchés rendrait `110 + 30·d` ;
  écartée, parce que la granularité des seaux la rend plate à l'intérieur
  d'un seau.
- **Les arbres** : C39 **−26,6 %** à la profondeur 10, **−29,1 %** à la 12 ;
  C39b −26,5 % et −28,2 %. Attendu −5 à −15 % : **le double**.

**Écart au protocole, écrit avec sa raison : C39b n'est PAS lancé.** Les
deux droites partagent leur marge à la profondeur 1, qui porte le plus de
coups, et leurs arbres diffèrent de 1,3 % à la profondeur 12 : un écart
d'arbre de cet ordre se lit en un Elo ou deux, sous la résolution de quatre
jobs. L'encadrement ne séparerait rien.

**C39, le candidat** : `dfda892`, révoqué par `30256be`. Son arbre est
exactement celui de `fp:140:20:6` — 163 788 645 nœuds au rejeu à la
profondeur 10. La marge, mesurée au réseau, s'applique telle quelle quand
un réseau joue ; la faite main en reçoit l'analogue par l'inverse du
facteur de B8 (`network_margin`, 71 à 116), d'où un banc de 82 409 à la
profondeur 7 et 60 734 à la 6. Le test des nœuds se compte sur le banc
entier, comme le veut C36.

**Attendu, écrit avant le match** — <span>inférence, confiance
faible</span>. L'arbre −29,1 % à la profondeur 12 donne 0,68 pli, soit un
majorant de +41 à +71. Mais la futilité ne se rattrape pas, comme LMP, qui
détruisait aussi 2 % des montées d'`alpha` à son seuil retenu et a rendu
+17,24 ± 8,51 pour −23 % d'arbre. **Attendu 0 à +35, ~+15.** **Critère** :
gain si la borne basse commune est au-dessus de zéro. **Quatre jobs**,
contre `18a3805` comme le reste du n° 9.

**Et la composition** — complément écrit à 08 h 50, avant toute relève :
C39, lancé contre `18a3805` avant la relève de 12 h 10, se relève avec le
deuxième écran, et rejoint le groupe s'il gagne. <s>La relève de 14 h 05
passe à **14 h 50**, pour attendre ses jobs.</s> **C39 n'est parti qu'à
10 h 32** — la session s'est interrompue entre son écriture et son
lancement : la relève de 14 h 05 rend les verdicts du deuxième écran, et
le groupe attend celle de C39, vers 16 h 30. Rien d'autre ne change : C39
est mesuré contre la même référence, à la même cadence.

### N° 9, premier écran — VERDICT, 5 oct. 2026 : C32 +40,90 ± 5,34 Elo à `8+0,08` — FUSIONNÉ ; C32b, C33 et C34 gagnent aussi

Les douze jobs relevés à 12 h 30, finis entre 11 h 30 et 11 h 37 : 3 000
parties chacun, contre `18a3805`, runners à 2,1 à 2,7 M n/s, **tous à la
profondeur 13 en 250 ms**. Zéro perte au temps, zéro coup illégal.

| candidat | les jobs | en commun | homogénéité | attendu, écrit avant | majorant par l'arbre |
|---|---|---|---|---|---|
| **C32**, R = 3 + d/3 | +42,36, +39,43 | **+40,90 ± 5,34** | z = 0,54 | 0 à +40, ~+15 | +36 à +63 |
| **C32b**, R = 3 + d/4 | +39,19, +37,44 | **+38,31 ± 5,24** | z = 0,33 | 0 à +35, ~+15 | +32 à +56 |
| **C33**, la garde | +20,41, +11,12, +4,52, +8,46 | **+11,12 ± 3,68** | z = 3,02 au plus | 0 à +10, ~+5 | — |
| **C34**, l'IIR | +11,12, +11,24, −0,23, +7,88 | **+7,50 ± 3,69** | z = 2,15 au plus | −10 à +10, ~+3 | — |

- **Par le critère écrit avant, les quatre gagnent.** C32 et C32b passant
  tous deux, le meilleur au point l'emporte : **C32**. Le protocole de
  composition le **fusionne seul** ; C32b est écarté ; **C33 et C34
  rejoignent le groupe** mesuré contre ce nouveau `main`.
- **La réduction du coup nul a rendu son MAJORANT, pas son attendu.** +40,9
  pour un majorant de +36 à +63, quand j'avais écrit ~+15 : l'économie
  d'arbre s'est convertie presque entièrement en force. <span>Inférence,
  confiance moyenne : le coup nul vérifie son pari par une recherche, même
  réduite, là où LMP ne regarde pas — d'où l'escompte que j'appliquais par
  analogie avec LMP, et qui ne valait pas ici.</span> Les attendus de C35 à
  C39 portent le même escompte : à relire, le jour de leur relève, contre
  ce point.
- **C33 est hétérogène en AMPLITUDE, pas en signe.** Ses quatre jobs vont de
  +4,5 à +20,4 ; l'écart extrême, z = 3,02, est rare sous l'hypothèse d'un
  seul effet même rapporté à quatre matchs (p ≈ 1,5 % pour l'étendue). Les
  quatre runners tournaient à la même profondeur, 13 : le point de
  fonctionnement n'explique rien de visible. Trois jobs sur quatre passent
  la borne seuls, et le plus faible reste positif : le verdict de gain n'en
  dépend pas. Rapporté tel quel.
- **Les avertissements de l'arbitre, lus** : 31 côté candidats et 36 côté
  référence sur les douze jobs, tous « PV continues after fifty-move rule »
  ou « … threefold repetition » — la nature connue depuis C31, également
  répartie entre les deux moteurs. Rien que les candidats introduisent.

### N° 9, deuxième écran — VERDICT, 5 oct. 2026 : C38 +9,61 ± 3,71 et C36 +5,65 ± 3,75 au groupe ; C37 +0,75 ± 3,69 sans effet ; C35 −8,51 ± 3,76, régression

Les seize jobs relevés à 14 h 25, finis entre 12 h 24 et 13 h 05 : 3 000
parties chacun, contre `18a3805`, runners à 1,84 à 3,46 M n/s, **tous à la
profondeur 13 en 250 ms**. Zéro perte au temps, zéro coup illégal, zéro
moteur perdu.

| candidat | les jobs | en commun | homogénéité, quatre matchs | attendu, écrit avant | majorant par l'arbre |
|---|---|---|---|---|---|
| **C38**, l'échange statique hors quiescence | +3,13, +16,34, +10,54, +8,46 | **+9,61 ± 3,71** | z = 2,49 au plus, p = 0,062 | 0 à +15, ~+7 | +12 à +22 |
| **C36**, *improving* dans l'élagage par compte | +11,82, +0,93, +6,37, +3,47 | **+5,65 ± 3,75** | z = 2,02 au plus, p = 0,18 | −10 à +15, ~+3 | +17 à +30 |
| **C37**, *improving* dans LMR | +0,35, +2,08, −0,23, +0,81 | **+0,75 ± 3,69** | z = 0,44 au plus | 0 à +20, ~+8 | +21 à +37 |
| **C35**, *improving* dans la futilité inverse | −8,46, −7,88, −9,15, −8,57 | **−8,51 ± 3,76** | z = 0,23 au plus | −10 à +20, ~+5 | +22 à +38 |

- **Par le critère écrit avant** — gain si la borne basse commune est
  au-dessus de zéro : **C38 et C36 gagnent, et rejoignent le groupe** de la
  composition avec C33 et C34. **C37 ne gagne pas** : aucun effet décelable,
  dans un sens ni dans l'autre, `[−2,94 ; +4,44]`. **C35 ne gagne pas, et
  sa borne haute est sous zéro** — −4,75 au mieux : une régression
  démontrée. Ni l'un ni l'autre n'est fusionné ; leurs rustines restent à
  l'attic.
- **Les quatre points tombent DANS leur fourchette écrite avant**, et sous
  leur majorant. La leçon de C32, qui avait rendu son majorant, ne s'étend
  pas : l'escompte écrit par analogie avec LMP tenait pour ces quatre-là.
  Rapportés à leur majorant par l'arbre, les gains des deux écrans vont du
  négatif (C35) à plus du double (C33 : +11,1 pour +5 à +8) — C32 à 65 à
  114 %, C38 à 44 à 80 %, C36 à 19 à 33 %, C37 à presque rien.
  <span>Inférence, confiance faible : le partage « pari vérifié par une
  recherche / pari aveugle », avancé à 12 h 30 pour expliquer C32, ne range
  ni C37 — LMR se rattrape par la re-recherche, et ne rend rien — ni C38,
  qui saute ses captures sans les regarder et rend la moitié de son
  majorant.</span> L'escompte ne se prédit pas ; seul le match le donne.
- **Deux réductions d'arbre égales, deux verdicts opposés.** C35 retire
  16,9 % de l'arbre à la profondeur 12, C37 16,6 % : l'un perd 8,5 Elo,
  démontré, l'autre ne rend rien. C'est la règle de `CLAUDE.md` — un
  rapport de nœuds ne dit pas la force —, avec un point de plus.
- **C35, une régression qui a une cause plausible** — <span>inférence,
  confiance moyenne</span>. *Improving* est vrai dans 78 % des nœuds hors
  échec (sonde du deuxième écran) : retirer une profondeur à la marge de la
  futilité inverse quand il l'est la resserre presque partout, d'où
  −16,9 % d'arbre au lieu des −1 à −4 % attendus. B8 avait sondé cette
  marge à l'échelle du réseau et l'avait trouvée juste telle quelle ; C35
  la resserre dans quatre nœuds sur cinq, et perd. La variante inverse —
  l'élargir quand la position se dégrade — n'est pas mesurée.
- **L'hétérogénéité : deux faux signaux, et un seuil recalibré.**
  `mettre-en-commun.sh` refusait C38 et C36 au seuil fixe `z > 2`, comme
  C34 à 12 h 30. À quatre matchs il y a six paires, et le plus grand de six
  `z` dépasse 2 près d'une fois sur cinq sous un seul effet. Lus sur
  l'étendue studentisée — la lecture déjà appliquée à C33 —, C38 rend
  p = 0,062 et C36 p = 0,18 : rien de rare. Les extrêmes de C38, +3,13 et
  +16,34, ont joué sur deux runners à la profondeur 13, à 2,01 et
  1,99 M n/s ; ceux de C36 à 1,84 et 2,06 M, profondeur 13 aussi : le point
  de fonctionnement n'explique rien de visible. **Le script porte désormais
  ce seuil** (`7c999f4`) : refus sous 4,55 %, le niveau de `z > 2` à deux
  matchs, donc la décision d'avant à deux matchs ; C33 reste refusé,
  p = 0,013. Aucun verdict de l'écran n'en dépendait : le critère porte
  sur la borne commune, et trois jobs de C38 sur quatre passent seuls.
- **Les avertissements de l'arbitre, lus** : 59 côté candidats, 51 côté
  référence sur les seize jobs, tous « PV continues after fifty-move rule »
  ou « … threefold repetition », la nature connue depuis C31. Le plus grand
  déséquilibre, C37 — 14 contre 7 —, n'a rien de rare à cet effectif
  (binomiale bilatérale, p = 0,19). Rien que les candidats introduisent.
- **Le groupe**, composé à la relève de 16 h 35 avec C39 s'il gagne :
  **C33, C34, C36, C38**. La somme de leurs gains seuls, +33,9, est un
  majorant, comme écrit au point 3 du protocole ; C36 y apporte
  l'infrastructure d'*improving*, une fois. Sa bissection, si elle vient,
  passe par les familles écrites : coup nul (C33), *improving* (C36), le
  reste (C34, C38, et C39).

### N° 9, troisième écran — VERDICT, 5 oct. 2026 : C39 +23,72 ± 3,75 Elo à `8+0,08` — au groupe ; l'amplitude hétérogène, le signe non

Les quatre jobs relevés à 15 h 45, finis entre 15 h 38 et 15 h 44 : 3 000
parties chacun, contre `18a3805`, **tous à la profondeur 13 en 250 ms**.
Zéro perte au temps, zéro coup illégal, zéro moteur perdu.

| run | runner | n/s au banc | Elo |
|---|---|---|---|
| 37297213900 | EPYC 7763 | 2 118 849 | +16,23 ± 7,57 |
| 37297216607 | EPYC 9V45 | 3 379 394 | +19,13 ± 7,09 |
| 37297221303 | EPYC 7763 | 2 108 305 | +28,20 ± 7,67 |
| 37297225434 | EPYC 7763 | 2 138 804 | +31,35 ± 7,62 |
| **en commun** | | | **+23,72 ± 3,75** |

- **Par le critère écrit avant** — gain si la borne basse commune est
  au-dessus de zéro : **C39 gagne**, `[+19,97 ; +27,47]`, et **rejoint le
  groupe** de la composition avec C33, C34, C36 et C38.
- **Dans son attendu, au-dessus de son centre** — 0 à +35, ~+15 —, et sous
  son majorant par l'arbre, +41 à +71 : **33 à 58 %** du majorant, entre
  C38 (44 à 80 %) et C36 (19 à 33 %). L'attendu tirait son escompte de LMP,
  l'autre élagage aveugle réglé à 2 % des montées d'`alpha` détruites :
  +17,24 pour −23 % d'arbre, soit 0,75 Elo par point d'arbre ; C39 en rend
  0,82. Deux points, sur deux bases différentes, et C35 et C37 viennent de
  montrer qu'un même arbre rend deux signes : une coïncidence jusqu'à
  preuve du contraire, pas un taux.
- **Hétérogène en AMPLITUDE, pas en signe — le cas de C33.**
  `mettre-en-commun.sh` refuse la mise en commun : plus grand écart
  z = 2,76, entre le premier et le dernier job, p = 0,029 sous un seul
  effet, sous le seuil de 4,55 %. Les deux extrêmes ont joué sur le même
  modèle de runner, EPYC 7763, à 2,12 et 2,14 M n/s et à la profondeur 13 :
  le point de fonctionnement n'explique rien de visible. Chaque job passe
  la borne seul — le plus faible a la sienne à +8,66 — : le verdict n'en
  dépend pas. Rapporté tel quel.
- **Deux refus sur les sept mesures à quatre jobs de la journée** — C33 et
  C39. Sous un seul effet chacune, le seuil en refuse 4,55 % ; deux refus
  ou plus sur sept arrivent alors **3,7 fois sur cent**. **Le livre ne
  l'explique pas** — <span>raisonnement, confiance moyenne</span> : les
  jobs d'un candidat jouent les MÊMES 500 ouvertures, trois fois chacune
  (« Le livre, réutilisé ») ; la part de la variance qui tient aux
  ouvertures leur est commune et s'annule dans leur différence — facteur
  `1 − ρ` sur la variance de l'écart, à ρ ≈ 0,03 —, donc le partage rend
  les écarts entre jobs un peu PLUS PETITS que leurs intervalles ne le
  supposent, pas plus grands. Reste le hasard, à 4 %, ou un facteur qui
  varie d'un runner à l'autre pendant le match et que l'étalonnage du
  début ne voit pas — <span>inférence, confiance faible</span>. Aucun
  verdict n'en dépend : le critère se lit sur la borne commune, et chaque
  job refusé passe seul. **À surveiller** (« Ce qu'il faut surveiller »).
- **Les avertissements de l'arbitre, lus** : 17 côté candidat, 19 côté
  référence sur les quatre jobs, tous « PV continues after fifty-move rule »
  ou « … threefold repetition », la nature connue depuis C31. Rien que le
  candidat introduise.

### N° 9, la composition — le groupe, attendu et critère écrits le 5 oct. avant de mesurer

**Le candidat** : les cinq gagnants qui ne sont pas entrés seuls —
C33, C34, C36, C38 et C39 —, composés sur `main` après C32 : `415f560`,
révoqué par `7cba723` ; rustine `tools/attic/n9-groupe.patch`. **Mesuré
contre `dec4672`**, le `main` de la composition : son parent, `f8babf0`,
n'en diffère que par des tests et l'attic — le code de production est le
même au bit près, `git diff` vide hors de `mod tests`.

| membre | ce qu'il change | seul, contre `18a3805` |
|---|---|---|
| **C33** | le coup nul ne s'essaie qu'à partir de bêta | +11,12 ± 3,68 |
| **C34** | réduction itérative interne, sans coup de la table | +7,50 ± 3,69 |
| **C36** | *improving* dans l'élagage par compte | +5,65 ± 3,75 |
| **C38** | une capture perdante se saute dans la recherche principale | +9,61 ± 3,71 |
| **C39** | la futilité aux nœuds frontières | +23,72 ± 3,75 |

**La composition n'a demandé aucun arbitrage de code** : les conflits ne
portaient que sur le contexte — l'évaluation statique du nœud, calculée une
fois et lue par la futilité inverse, la futilité aux nœuds frontières, la
garde du coup nul et le drapeau *improving*. Banc : **48 497** nœuds à la
profondeur 6 (69 304 sur `main`), **90 656** à la 7 (105 813).
`verify.sh` entier vert.

**Trois tests sont tombés en composant ; aucun n'a été assoupli.**

1. **`la_futilite_inverse_retire_des_noeuds`** — sur le groupe sans C39, sa
   position du banc, `BENCH_FENS[1]` à la profondeur 7, rend 74 947 nœuds
   avec la futilité inverse, 63 074 sans. La règle de C36 dit quoi faire :
   la sonde, avant toute reformulation. **Attendu et règle de décision
   écrits à 14 h 40, avant de mesurer.** La sonde
   (`tools/attic/n9-sonde-futilite-inverse.patch`) rejoue le protocole exact
   du test — recherche froide, profondeur 7, faite main, avec et sans — sur
   les 4 684 positions de parties de C36 :

   | | positions que la futilité inverse grossit | Σ avec / Σ sans |
   |---|---|---|
   | `main` (`3cb9e99`) | 412, 8,8 % | 0,744 |
   | le groupe sans C39 | 523, 11,2 % | 0,768 |

   Dans l'attendu (0,60 à 0,95 ; 3 à 25 %). La propriété tient en général,
   dans les deux arbres : le test ne tenait que par le choix de sa position.
2. **`lelagage_par_compte_retire_des_noeuds`**, compté sur les six positions
   du banc depuis `0c14b63` — sur le groupe avec C39, 90 656 avec, 74 629
   sans. **Attendu et règle écrits à 15 h 05, avant de mesurer.** La sonde
   de C36, sur les mêmes 4 684 positions : Σ avec / Σ sans **0,623**, et
   l'élagage grossit l'arbre de **793 positions, 16,9 %** (`main` : 0,638
   et 14,1 %). Dans l'attendu : la propriété tient, et le banc ne
   l'échantillonne plus. **La règle écrite interdisait d'en tirer une
   seconde reformulation** — un même test reformulé deux fois sur la foi de
   l'arbre qui le fait tomber, c'est la définition de l'accommodement.
3. **`le_fil_principal_publie_ses_noeuds_lui_aussi`** passe de la profondeur
   7 à la 9 : il exige que la recherche franchisse plus de quatre intervalles
   de publication — 8 192 nœuds — avant de vérifier ce qu'elle publie, et le
   groupe n'en cherchait plus que 6 944 depuis la position initiale. C'est
   la PRÉCONDITION du test qui bouge ; ses trois assertions de publication
   restent les mêmes.

**La décision pour les deux premiers, écrite à 15 h 55, avant de choisir
l'échantillon**, sur une mesure obtenue SANS le groupe ni C39 : les données
de `main` par position — la sonde de C36 à 07 h 30, avant que C39 existe ;
celle de la futilité inverse à 14 h 45. La probabilité qu'une somme sur `k`
positions tirées au hasard bascule — avec ≥ sans — y vaut, sur 200 000
tirages seedés :

| k | 6 | 12 | 18 | 24 | 36 |
|---|---|---|---|---|---|
| élagage par compte | 2,70 % | 0,57 % | 0,12 % | 0,026 % | 0,001 % |
| futilité inverse | 3,08 % | 1,12 % | 0,41 % | 0,13 % | 0,015 % |

**Une somme sur les six positions du banc est une loterie à ~3 % par
changement d'arbre — sur `main` déjà, sans rien de neuf.** C'est cette
mesure qui condamne la formulation, et elle ne doit rien au changement
qu'on veut faire passer (`CLAUDE.md`, « Une reformulation justifiée par une
mesure INDÉPENDANTE… »). La règle de choix, écrite avant : le plus petit `k`
dont la bascule est ≤ 0,1 % pour les deux — **36** ; les positions
d'indice ⌊i × 4 684 / 36⌋, prises sans regarder leurs résultats ;
profondeur 7 et borne qualitative inchangées. Les deux tests se comptent
désormais sur ces trente-six positions
(`engine/tests/donnees/positions-de-partie.txt`, `556ecda`, sur `main`
avant le groupe) ; sur elles, les données des sondes rendent avec / sans
**0,675** et **0,786** sur `main`, **0,650** (élagage par compte, groupe
avec C39) et **0,798** (futilité inverse, groupe sans C39). Les deux tests
passent sur `main` comme sous le candidat.

**Trois rustines de l'attic cessent de s'appliquer** sous le candidat —
`b8-sonde-marges.patch`, `c12-pvs-2026-09-21.patch`,
`n9-sonde-futilite-inverse.patch` : le contexte de `search.rs` a changé. Le
candidat les déclare « non », avec le commit où elles se rejouent ; sa
révocation les rend à « oui ».

**L'arbre du groupe, mesuré avant le match** — le rejeu du n° 9, les 5 276
recherches de parties, table conservée d'un coup à l'autre, contre `main`
(l'arbre de C32, `r33` au nœud près) :

| profondeur | `main` | le groupe | |
|---|---|---|---|
| 10 | 181 805 332 | 97 968 894 | **−46,1 %** |
| 12 | 502 244 799 | 254 543 771 | **−49,3 %** |

- **Les réductions se composent, elles ne se recouvrent pas — au total.**
  Le produit des arbres de chaque membre seul, à la profondeur 12 contre
  `18a3805`, vaut 0,510 ; le groupe rend 0,507 sur `main`. Ce que chacun
  coupe, les autres le laissent en place.
- **Sauf C33, et c'est mesuré** : sous C32, la garde du coup nul ne retire
  plus que **0,8 %** de l'arbre à la profondeur 10 (`r33` contre
  `gate+r33`, premier écran), contre 2,7 % à la même profondeur sur la base
  d'avant — 3,8 % à la 12. C32 a rendu
  les recherches de coup nul sous bêta presque toutes peu profondes : elles
  pèsent 2,2 % de l'arbre au lieu de 8,4 %, et coupent dix fois moins —
  20 623 coupures au lieu de 217 658 au rejeu à la profondeur 12.
- **Majorant par l'arbre** : 1,33 pli au taux de 1,36 pli par doublement,
  soit **+80 à +140** — moins serré que la somme des gains seuls.

**Attendu, écrit avant le match** — <span>inférence, confiance
faible</span> :
- **Majorants** : la somme des gains seuls, **+57,6**, écrite au point 3 du
  protocole ; l'arbre, +80 à +140.
- **Par membre** : C33 **0 à +5** — son mécanisme a fondu, mesuré ; C36
  **0 à +8** — il coupe des tranquilles là où C39 en saute déjà, même si
  l'arbre n'en montre rien au total ; C34 **+3 à +11**, C38 **+5 à +13** et
  C39 **+15 à +27**, qui touchent d'autres objets : leurs intervalles seuls,
  à peine rognés. Somme : **+23 à +64**, centre ~+42.
- **En tout : +20 à +55, ~+38.** Plus haut que l'escompte habituel, parce
  que l'arbre se compose sans recouvrement ; plus bas que la somme des
  centres, parce qu'un acquis a déjà fondu ici par empilement — l'élagage
  delta sous l'échange statique — sans que les nœuds le disent d'avance.

**Critère, écrit le 5 oct. à 08 h 05** (point 4 du protocole) : **le groupe
se fusionne si sa borne basse commune est au-dessus de zéro.** Sinon,
bissection par famille — coup nul (C33), *improving* (C36), le reste (C34,
C38, C39) —, chaque moitié mesurée de la même façon. **Puissance** : quatre
jobs de 3 000 parties contre `dec4672`, `8+0,08`, ± 3,75 environ — un vrai
+6 passe la borne 88 fois sur cent, un vrai +10 toujours.

**Ce que le groupe ne dira pas : la part de chacun.** Un membre nul, ou
légèrement négatif, passerait avec les autres : c'est le prix écrit de
« grouper, puis bissecter à l'échec ». Les deux plus exposés sont C33, dont
le mécanisme a fondu, et C36, que C39 recouvre. Ce que chacun retire encore
de l'arbre du groupe se mesure en nœuds, sans match — le groupe privé d'un
membre, rejoué : **fait pendant le vol**, pour dire avant le verdict si un
match de retrait vaudrait son coût — ci-dessous.

**Le groupe privé de chaque membre — mesuré pendant le vol, avant tout
résultat du match.** Le même rejeu, chaque membre neutralisé tour à tour —
sa fonction rendue inerte, le reste du candidat au bit près. **La règle,
écrite à 16 h 31**, après les arbres de C33 et celui de C34 à la profondeur
10, avant les autres : la part d'arbre d'un membre dans le groupe, à la
profondeur 12, se compare à sa part seul ; **sous la moitié, il est
absorbé**, et si le groupe passe, un match de retrait le mesure — le groupe
sans lui contre le groupe, critère écrit avant ; au-dessus, son mécanisme
est intact et son gain seul reste la meilleure estimation, sans match. Le
seuil d'une moitié est un choix : il trie l'ordre d'achat des matchs, il ne
dit rien de l'Elo.

| membre neutralisé | arbre à 10 | arbre à 12 | sa part dans le groupe, à 10 / à 12 | sa part seul, à 12 | rapport |
|---|---|---|---|---|---|
| C33, la garde du coup nul | 101 121 327 | 265 239 127 | 3,1 % / 4,0 % | 3,8 % | 1,06 |
| C34, l'IIR | 103 793 485 | 268 681 970 | 5,6 % / 5,3 % | 3,9 % | 1,35 |
| C36, *improving* dans l'élagage par compte | 107 905 298 | 275 094 514 | 9,2 % / 7,5 % | 13,5 % | **0,55** |
| C38, l'échange statique hors quiescence | 113 781 897 | 302 157 485 | 13,9 % / 15,8 % | 10,0 % | 1,58 |
| C39, la futilité aux nœuds frontières | 127 450 201 | 342 239 469 | 23,1 % / 25,6 % | 29,1 % | 0,88 |

- **Aucun membre n'est absorbé : pas de match de retrait.** C36 est le plus
  proche du seuil — il garde 55 % de sa part seul —, ce que le recouvrement
  avec C39 laissait attendre ; C33, dont le mécanisme avait fondu sous C32
  seul (0,8 % à la profondeur 10), en retrouve dans le groupe autant qu'il
  en avait sur l'ancienne base. <span>Inférence, confiance faible</span> :
  les autres élagages rendent chaque nœud moins cher, et les recherches de
  coup nul sous bêta qu'il épargne pèsent d'autant plus.
- **Le banc, encore** : neutraliser C36 fait passer le banc à la profondeur
  7 de 90 656 nœuds à **70 507** — C36 y grossit l'arbre de 29 %, quand il
  retire 7,5 % de celui des parties. C'est la loterie mesurée plus haut,
  vue de l'autre côté : le test de l'élagage par compte serait tombé sur le
  banc pour la même raison.

**Ce que la composition laisse à surveiller** : le test de C39,
`la_futilite_aux_noeuds_frontieres_retire_des_noeuds`, se compte encore sur
les six positions du banc — la forme dont la bascule vient d'être mesurée à
~3 % pour ses deux voisins —, et `lelagage_delta_retire_des_noeuds`
s'asserte encore sur une seule position (« Ce qu'il faut surveiller »).

### N° 9, la composition — VERDICT, 5 oct. 2026 : le groupe +52,22 ± 3,61 Elo à `8+0,08` — FUSIONNÉ

Les quatre jobs relevés à 21 h 40, finis entre 21 h 20 et 21 h 25 : 3 000
parties chacun, `415f560` contre `dec4672`, **tous à la profondeur 13 en
250 ms**. Zéro perte au temps, zéro coup illégal, zéro moteur perdu.

| run | runner | n/s au banc | Elo |
|---|---|---|---|
| 37339198153 | EPYC 7763 | 1 994 247 | +50,26 ± 7,41 |
| 37339202694 | EPYC 7763 | 2 047 355 | +50,85 ± 6,98 |
| 37339207949 | EPYC 9V74 | 2 027 051 | +56,07 ± 7,11 |
| 37339212406 | EPYC 7763 | 1 981 130 | +51,68 ± 7,35 |
| **en commun** | | | **+52,22 ± 3,61** |

- **Par le critère écrit le 5 oct. à 08 h 05** — fusion si la borne basse
  commune est au-dessus de zéro : **le groupe se fusionne**,
  `[+48,61 ; +55,83]`, sans bissection (`920da68`, la révocation révoquée).
  Homogènes : plus grand écart z = 1,11, p = 0,684.
- **Dans l'attendu, en son haut** — +20 à +55, ~+38, écrit avant. Le point
  vaut **91 %** de la somme des gains seuls (+57,6) et 37 à 65 % du
  majorant par l'arbre (+80 à +140). <span>Inférence, confiance
  moyenne</span> : l'empilement est presque additif. La somme des gains
  seuls porte elle-même ± 8,3 (cinq intervalles de ± 3,7), et l'écart du
  groupe à cette somme, −5,4 ± 9,1, n'est pas séparé de zéro — avec la
  réserve que les gains seuls ont été mesurés contre la base d'avant C32,
  le groupe contre celle d'après. **L'arbre l'avait annoncé, et j'ai
  escompté contre lui** : les réductions se composaient sans recouvrement
  (0,507 contre un produit de 0,510), et le groupe privé de chaque membre
  n'en trouvait aucun absorbé ; le centre de l'attendu, ~+38, tirait vers
  le bas par la seule prudence d'empilement, celle de l'élagage delta sous
  l'échange statique, qu'aucune mesure de ce groupe ne soutenait.
- **La garde du coup nul ne s'est pas évanouie.** Son mécanisme avait fondu
  sous C32 seul (0,8 % de l'arbre à la profondeur 10) et je lui donnais
  0 à +5 ; dans le groupe elle retrouve sa part d'arbre de l'ancienne base.
  Le groupe ne dit pas la part de chacun, et rien ne le mesure ici — le
  rejeu disait qu'aucun match de retrait ne s'imposait, le match ne
  contredit rien.
- **Sur la journée** : C32 (+40,90 ± 5,34, contre `18a3805`) puis le groupe
  (+52,22 ± 3,61, contre le `main` qui portait C32) — **environ +93 Elo à
  `8+0,08`** contre le moteur du matin. <span>Inférence, confiance
  moyenne</span> : une somme le long d'une chaîne de deux mesures n'est
  qu'approchée — l'Elo n'est pas exactement transitif —, et l'intervalle de
  la somme vaut ± 6,4 au mieux.
- **Les avertissements de l'arbitre, lus** : 13 côté candidat, 9 côté
  référence sur les quatre jobs, tous « PV continues after fifty-move rule »
  ou « … threefold repetition », la nature connue depuis C31. Rien que le
  groupe introduise.
- **Le banc** passe à **48 497** nœuds à la profondeur 6 et **90 656** à la 7.
  `verify.sh` entier vert sur `920da68` — la confrontation du `ply` au chemin
  (#142) tient sous le groupe.
- **Le balayage de mutation qui suit** — celui de mardi 00 h 00 UTC, sur
  `main` avec le groupe — *prédiction écrite avant qu'il parte* : `search.rs`
  **entre 39 et 45**, les autres fichiers à leur plafond. 39 si les tests
  écrits avec chaque membre tuent tout ce qu'il ajoute — chacun a les siens,
  bornes comprises — et si le banc figé ne perd rien ; au-dessus, ce que le
  banc figé, plus petit d'un tiers à la profondeur 6, cesse de voir dans du
  code que le groupe ne touche pas — le précédent d'A18, +4 (`CLAUDE.md`,
  « un changement d'ARBRE »). <span>Confiance faible</span> : aucun membre
  n'a eu de crible au candidat, et le groupe change l'arbre que les tests de
  nœuds exercent.
  **Relevé le 6 oct. (run 37418116645, issue #149) : juste pour `search.rs`,
  fausse pour `eval.rs`.** `search.rs` **44** — dont le `ply + 1` qui note
  le coup de l'enfant du coup nul, code que le groupe ne touche pas, le cas
  même que la prédiction annonçait ; corrigé par l'invariant, avec la garde
  de racine de l'IIR, et le plafond passe à **42**. `eval.rs` **104** contre
  89 : seize valeurs des tables piece-square que le banc figé, 30 % plus
  petit, n'évalue plus. La prédiction regardait ce que le banc cesse de voir
  dans la RECHERCHE ; il lit l'évaluation autant. Détail dans EN VOL et dans
  `.github/mutation-baseline.txt`.

### N° 9, quatrième écran — protocole et attendus, écrits le 6 oct. avant de mesurer

**Ce qui reste de la ligne du backlog** après le groupe : les extensions
singulières, l'historique de correction de l'évaluation statique,
l'historique des captures, ProbCut, et l'échange statique des coups
TRANQUILLES — que le deuxième écran avait laissé de côté, `see` rendant 0
pour eux. **Le mécanisme d'abord, comme pour les trois premiers écrans** :
combien chacun agit, et ce qu'il coûte en nœuds, exactement ; l'Elo, seul un
match le dit (`CLAUDE.md`, « c'est plus fort »).

**Le journal est neuf.** Celui des trois premiers écrans venait du moteur de
`1f99a69`, d'avant C32 et le groupe — environ 90 Elo plus bas, et un arbre
près de trois fois plus gros à profondeur égale (C32 l'a ramené à 0,73, le
groupe à 0,51 de ce qui restait, au rejeu à la profondeur 12). Un écran qui compte ce que la recherche
accumule se mesure sur le moteur qui joue (`CLAUDE.md`, « un moteur qui
DÉMARRE FROID n'est pas un moteur en partie »). **60 parties de `main` à
`f537d33`** — le moteur de `3503064`, seule l'interface a changé depuis —
contre lui-même à `8+0,08`, cutechess `-debug all`, `-srand 20261006`,
trois parties à la fois dans le conteneur, rien d'autre ne tournant : zéro
perte au temps, zéro coup illégal, **6 203 recherches**. Rejouées à la
profondeur 10 et 12, table conservée d'un coup à l'autre, par le rejoueur
des trois premiers écrans (`tools/sonde-n9/rejouer.py`).

**La sonde, v4** — un binaire de MESURE, des variantes choisies par la
variable `N9` ; sans elle, `main` au nœud près : **48 497 nœuds au banc à
la profondeur 6, 90 656 à la 7**, les références. Elle compte, sur le
moteur tel qu'il est :
- **les extensions singulières** — en ombre, les nœuds de profondeur ≥ 6 et
  ≥ 8 où elles chercheraient : un coup de la table, son entrée assez
  profonde (≥ profondeur − 3), une borne basse ou exacte, pas un mat. La
  variante `se:M:D` cherche, dès la profondeur `D`, tous les coups SAUF
  celui de la table, à mi-profondeur, sous `score de la table − M·d` ; s'ils
  restent tous dessous, le coup de la table est **singulier** et gagne un
  pli. `mc` y ajoute le multi-cut : si la recherche sans lui dépasse déjà
  bêta, le nœud coupe. Comptés : les tests, les singuliers, les coupures
  possibles, et les nœuds de ces recherches — l'union ;
- **l'historique de correction** — une table par structure de pions et camp
  au trait, qui suit l'écart entre le résultat d'une recherche et
  l'évaluation brute du nœud, quand la borne en dit le sens. Tenue en ombre
  sans être lue : l'erreur de l'évaluation brute, et celle de l'évaluation
  corrigée **telle qu'elle était à l'entrée du nœud** — une prédiction, pas
  un ajustement après coup. La variante `corr` la lit, dans la recherche et
  dans la quiescence. **Une erreur de prédiction n'est pas une mesure de
  force** — le précédent de Texel, −25 Elo pour 7,8 % de mieux
  (`CLAUDE.md`) : ce compte dit seulement s'il y a quelque chose à
  corriger ;
- **l'historique des captures** — en ombre, à chaque coupure d'une capture,
  son rang parmi les captures cherchées au nœud, dans la recherche et dans
  la quiescence. Un PLAFOND, pas un classement (A20, « un contrefactuel
  d'ordre est biaisé vers l'ordre joué ») : une coupure par la première
  capture ne laisse rien à gagner à un meilleur ordre. La variante `caph`
  départage les captures d'une même victime par l'historique au lieu de
  l'agresseur ; `caph:400` lui permet de passer d'une victime à l'autre ;
- **ProbCut** — en ombre, les nœuds éligibles : profondeur ≥ 5, hors échec,
  bêta qui n'est pas un mat, et la table ne disant pas déjà que le nœud
  reste sous `bêta + marge`. La variante `pc:M:D` y cherche les captures
  dont l'échange atteint l'écart, par la quiescence puis à la profondeur
  − 4, sous `bêta + M` ; si l'une y reste, le nœud coupe. La marge est en
  unités du réseau, l'échange en valeurs de pièces : l'écart passe de l'une
  à l'autre par le facteur de B8, 2,24 ;
- **l'échange statique des tranquilles** — un `see` étendu aux coups qui ne
  prennent rien : la pièce se pose, puis la suite des captures sur sa case.
  En ombre, comme pour la futilité au troisième écran : par profondeur 1 à 8
  et par seau de 50 de la perte, les tranquilles cherchés éligibles — hors
  échec, hors racine, après un premier coup, sans donner échec, pas le roi —
  et ceux qui, cherchés, montent `alpha`. La variante `seeq:M:D` saute ceux
  qui perdent plus de `M·d²`.

**Les variantes rejouées** — chacune contre `main`, à la profondeur 10 et
12 : `se:2:8`, `se:2:6`, `se:2:8+mc` ; `corr` ; `caph`, `caph:400` ;
`pc:200:5`, `pc:300:5` ; `seeq:20:8`. Les marges en unités d'évaluation
viennent des moteurs qui les emploient, ramenées à l'échelle du réseau par
B8 — un point de départ, pas un réglage. La sonde ira à l'attic,
`n9-sonde-ecran4.patch`, son rejoueur avec elle.

**Attendus, écrits avant** — <span>inférence, confiance faible</span>, à la
profondeur 12 :
- **extensions singulières** : éligibles dans **30 à 60 %** des nœuds de
  profondeur ≥ 8 ; singulier dans **10 à 35 %** des tests ; l'arbre
  **+3 à +15 %** pour `se:2:8`, **+5 à +25 %** pour `se:2:6`, **−5 à
  +10 %** avec le multi-cut. **Un arbre qui GROSSIT n'est pas un majorant** :
  c'est le prix d'une justesse que seul un match chiffre ;
- **historique de correction** : la correction moyenne **5 à 30** unités ;
  l'erreur de l'évaluation corrigée **2 à 10 %** sous celle de la brute ;
  l'arbre **−5 à +5 %** ;
- **historique des captures** : la première capture cherchée porte **80 à
  95 %** des coupures de capture dans la recherche, **90 à 98 %** dans la
  quiescence ; l'arbre **−0,5 à −3 %** pour `caph`, **−1 à −5 %** pour
  `caph:400` ;
- **ProbCut** : éligible dans **50 à 90 %** des nœuds de profondeur ≥ 5
  hors échec ; coupe dans **5 à 25 %** des nœuds où il cherche à la marge
  200 ; l'arbre **−3 à −15 %** à 200, **−1 à −8 %** à 300 ;
- **échange statique des tranquilles** : **10 à 30 %** des tranquilles
  éligibles perdent à l'échange ; parmi ceux que `seeq:20:8` sauterait,
  **0,5 à 3 %** montent `alpha` ; l'arbre **−2 à −10 %**.

**Ce que l'écran décide** : quelles variantes deviennent des candidats —
chacun révoqué aussitôt, sa rustine à l'attic, un attendu et un critère
écrits avant ses matchs, comme aux trois premiers écrans. Un mécanisme qui
n'agit pas — un plafond nul, une variante qui ne déplace pas l'arbre — se
ferme ici, sans match.

**Le quatrième écran, RELEVÉ le 6 oct. à 04 h 30.** Sans variante, la
sonde rend l'arbre de `main` au nœud près sur tout le journal : 107 917 343
nœuds à la profondeur 10, autant que le binaire de `main` rejoué en témoin.

| | profondeur 10 | profondeur 12 | attendu, écrit avant |
|---|---|---|---|
| extensions singulières éligibles, nœuds de profondeur ≥ 8 | 78,4 % | 69,1 % | 30 à 60 % — **au-dessus** |
| singulier, `se:2:8` | 59,4 % des tests | 53,2 % | 10 à 35 % — **très au-dessus** |
| l'arbre — `se:2:8` | +35,2 % | +64,8 % | +3 à +15 % — **très au-dessus** |
| `se:2:6` | +83,3 % | +105,0 % | +5 à +25 % — **très au-dessus** |
| `se:2:8+mc` | +33,4 % | +57,5 % | −5 à +10 % — **très au-dessus** |
| la correction moyenne | 15,1 unités | 17,1 | 5 à 30 — **dedans** |
| l'écart au résultat, brute → corrigée | 76,7 → 71,0, −7,4 % | 81,2 → 75,2, −7,4 % | −2 à −10 % — **dedans** |
| l'arbre — `corr` | +6,0 % | +7,4 % | −5 à +5 % — **au-dessus** |
| la première capture cherchée porte, des coupures de capture — recherche | 92,5 % | 92,4 % | 80 à 95 % — **dedans** |
| … — quiescence | 90,7 % | 90,6 % | 90 à 98 % — **au bord bas** |
| l'arbre — `caph` | −1,30 % | −1,34 % | −0,5 à −3 % — **dedans** |
| `caph:400` | −1,30 % | −1,34 % | −1 à −5 % — **au bord** |
| ProbCut éligible, nœuds de profondeur ≥ 5 hors échec | 25,9 % | 30,0 % | 50 à 90 % — **sous** |
| il coupe, des nœuds où il cherche, marge 200 | 75,7 % | 71,3 % | 5 à 25 % — **très au-dessus** |
| l'arbre — `pc:200:5` | −0,24 % | −1,39 % | −3 à −15 % — **sous** |
| `pc:300:5` | −0,38 % | −1,29 % | −1 à −8 % — **au bord** |
| tranquilles éligibles qui perdent à l'échange | 24,1 % | 24,4 % | 10 à 30 % — **dedans** |
| sautés par `seeq:20:8`, et qui, cherchés, montent `alpha` | 1,06 % | 1,00 % | 0,5 à 3 % — **dedans** |
| l'arbre — `seeq:20:8` | −4,8 % | −7,2 % | −2 à −10 % — **dedans** |

**Une seconde série, ajoutée APRÈS lecture de la première** : les marges
des extensions singulières, et la profondeur 14 pour la tendance (681 640 334
nœuds sans variante).

| l'arbre | profondeur 10 | profondeur 12 | profondeur 14 |
|---|---|---|---|
| `se:5:8` — singulier dans | +21,2 % — 51,0 % | +37,8 % — 46,0 % | — |
| `se:10:8` | +11,3 % — 41,5 % | +17,7 % — 37,5 % | — |
| `se:20:8` | +6,1 % — 32,1 % | +9,9 % — 29,6 % | — |
| `corr` | +6,0 % | +7,4 % | +12,4 % |
| `caph` | −1,30 % | −1,34 % | −1,28 % |
| `pc:200:5` | −0,24 % | −1,39 % | −2,92 % |
| `seeq:20:8` | −4,8 % | −7,2 % | −6,2 % |

- **Les extensions singulières, à la marge de Stockfish, ne distinguent plus
  rien.** À 2 unités par pli, plus de la moitié des tests déclarent le coup
  de la table seul à tenir, et l'arbre gagne 65 % à la profondeur 12 — un pli
  de moins à temps égal. Le taux de singuliers baisse lentement avec la marge
  (53, 46, 38, 30 %), l'arbre bien plus vite (+65, +38, +18, +10 %) : les
  coups qu'une marge plus large cesse de déclarer singuliers étaient les plus
  chers à étendre. <span>Inférence, confiance faible</span> : la recherche
  singulière, à mi-profondeur dans un arbre déjà très élagué — compte de
  coups, futilité, échange statique —, laisse peu d'autres coups atteindre sa
  borne, d'où l'écart avec un attendu tiré des moteurs qui l'emploient.
- **ProbCut coupe presque partout où il cherche, et n'épargne presque
  rien** : 71 % de coupures, −1,4 % d'arbre à la profondeur 12. Il cherche là
  où une capture gagne déjà franchement ; la recherche ordinaire essaie cette
  capture en premier et coupe aussi, presque au même prix. **Mais l'épargne
  double tous les deux plis** — −0,24, −1,39, −2,92 % : à la profondeur 14,
  son majorant par l'arbre vaut +3 à +6 Elo, que quatre jobs (± 3,7) ne
  trancheraient pas. **Fermé sans match à `8+0,08`, à rouvrir à une cadence
  où le moteur cherche à 16 plis et plus** — la cible est la force générale,
  et une technique qui croît avec la profondeur est invisible à cadence
  courte (`CLAUDE.md`).
- **L'historique des captures a un plafond bas** : la première capture
  cherchée porte déjà 92 % des coupures de capture dans la recherche, 91 %
  dans la quiescence ; `caph` les porte à 93 et 92 %, et l'arbre perd 1,3 %
  à toute profondeur — majorant +1,6 à +2,8 Elo. `caph:400` rend l'arbre de
  `caph` à 121 nœuds près sur 106 millions : borné à ± 512 points
  d'ordonnancement, l'historique ne fait presque jamais passer une victime
  devant une plus grosse. **Fermé sans match** : un effet sous 3 Elo
  demanderait ~30 000 parties (`CLAUDE.md`, la relation de budget).
- **L'historique de correction corrige — et grossit l'arbre, d'autant plus
  que la profondeur croît** : l'écart moyen au résultat −7,4 %, l'arbre +6,0,
  +7,4 puis +12,4 %. Une évaluation qui cesse de se surestimer coupe moins.
  Le coût en arbre vaut −8 à −15 Elo à la profondeur 12 ; ce que la justesse
  rachète, seul un match le dit.
- **L'échange statique des tranquilles fait ce que l'attendu disait** : le
  quart des tranquilles éligibles perdent à l'échange, et ceux que la marge
  saute montent `alpha` une fois sur cent — 1,4 % des montées d'`alpha`
  détruites, la classe de la futilité (1,5 %) et du compte de coups (2,0 %).
- **Un défaut trouvé en chemin, dans `see`.** L'oracle `see_check`, étendu
  aux tranquilles pour C40, rend 291 écarts sur 77 020 (0,38 %) : la
  légalité, comme pour les captures, à 33 près — **un pion qui REPREND en
  promouvant n'y compte pas le gain de sa promotion**, +880, que l'oracle
  compte. Une capture sur 5 827 en souffre aussi. La limite est écrite dans
  `see.rs` ; son correctif change l'arbre, il se mesurera à part (« Ce qui
  reste à faire »).

**Les candidats** — chacun révoqué aussitôt, sa rustine à l'attic, chacun
contre `f537d33`, le moteur de `main` :

| candidat | ce qu'il change | commit | révoqué par |
|---|---|---|---|
| **C40** | l'échange statique des tranquilles : un tranquille qui perd plus de 20·d² à l'échange se saute, jusqu'à la profondeur 8 | `63c9678` | `3d6fe74` |
| **C41** | les extensions singulières, marge 10·d, dès la profondeur 8 | `8bb4265` | `9bb49e2` |
| **C41b** | les mêmes à 20·d — le second point d'une bissection | `a23ffa1` | `0418ccb` |
| **C42** | l'historique de correction de l'évaluation statique, par structure de pions | `c9c2df3` | `1c54169` |

Chacun rend EXACTEMENT l'arbre de sa variante au rejeu à la profondeur 10 —
102 728 537, 120 054 845, 114 454 718 et 114 409 637 nœuds ; `verify.sh`
entier vert sur chacun. Sur C40, un test d'horloge
(`le_budget_de_temps_est_respecte`) est d'abord tombé pendant que la seconde
série de rejeux occupait les quatre cœurs, puis a passé trois fois sur trois
au repos. **Le banc ne voit ni C41 ni C41b** : à la profondeur 7, aucun
nœud n'atteint la profondeur 8 ; leur test de nœuds cherche le banc à la 9.
Sous C41, la sonde de C24 ne s'applique plus — l'appel récursif porte
l'extension —, et la table de l'attic le dit dans le commit du candidat.

**Attendus, écrits avant les matchs** — <span>inférence, confiance
faible</span> :
- **C40** : majorant par l'arbre **+9 à +15** (−7,2 % à 12) ; les élagages
  aveugles du n° 9 ont rendu 19 à 80 % du leur ; **attendu 0 à +12, ~+5** ;
- **C41** : l'arbre +17,7 % coûte 0,32 pli à temps égal, **−19 à −34 Elo**
  si la justesse ne bougeait pas — ce que l'extension rachète est la
  question même ; **attendu −25 à +20, ~−5** ;
- **C41b** : +9,9 %, un coût de **−11 à −19** ; **attendu −15 à +20, ~0** ;
- **C42** : +7,4 % à 12, +12,4 % à 14 — **−8 à −24** de coût ; une
  évaluation plus juste là où les élagages décident ; **attendu −15 à +15,
  ~0**.

**Critère, écrit avant** — des techniques ajoutées, pas des correctifs de
règle : **gain si la borne basse commune est au-dessus de zéro**. Si C41 et
C41b le passent tous deux, le meilleur au point est retenu, comme C32 contre
C32b. Un gain rejoint le groupe d'une composition, mesurée contre `main`
comme le 5 oct. **Puissance, dite d'avance** : quatre jobs de 3 000 parties
par candidat, ± 3,7 en commun ; un vrai +5 passe la borne trois fois sur
quatre, un vrai +10 presque toujours — et un vrai −5 jamais.

### N° 9, quatrième écran — VERDICT, 6 oct. 2026 : C41 +10,66 ± 3,43 Elo à `8+0,08` — FUSIONNÉ ; C40 −4,26 ± 3,49, régression ; C41b et C42 sans effet

Les seize jobs relevés à 13 h 25, heure de Paris — lancés à 06 h 58, finis
entre 12 h 05 et 12 h 15 : 3 000 parties chacun contre `f537d33`, 6,1 à
6,3 s par partie. Zéro perte au temps, zéro coup illégal, zéro moteur perdu,
sur les seize journaux entiers. Tous à la profondeur 14 en 250 ms, sauf un
EPYC 9V45 à la 15.

| candidat | runs | Elo par job | en commun | homogénéité |
|---|---|---|---|---|
| **C40** | 37416184898, 37416186729, 37416188857, 37416190463 | +0,35, −7,07, −7,07, −3,24 | **−4,26 ± 3,49** | p = 0,450 |
| **C41** | 37416192287, 37416193966, 37416195894, 37416197697 | +5,68, +13,56, +14,14, +9,27 | **+10,66 ± 3,43** | p = 0,326 |
| **C41b** | 37416199509, 37416201095, 37416202765, 37416204538 | +0,69, −6,37, +3,71, +6,49 | **+1,13 ± 3,40** | **p = 0,039** |
| **C42** | 37416206248, 37416207914, 37416209814, 37416211767 | −0,81, −3,47, −0,93, +0,69 | **−1,13 ± 3,61** | p = 0,853 |

- **Par le critère écrit avant** — gain si la borne basse commune est
  au-dessus de zéro : **C41 seul gagne**, `[+7,23 ; +14,09]`. Le meilleur
  de C41 et C41b au point ne se pose pas : C41b ne passe pas. Seul gain de
  l'écran, C41 **est** la composition qu'il devait rejoindre, et il a été
  mesuré contre le moteur de `main` — que `main` n'a changé depuis que par
  ses tests (`b2bfc36`, un bloc `#[cfg(test)]`) : une composition à un seul
  membre rejouerait la même mesure. **FUSIONNÉ** (`be0cd9d`, la révocation
  révoquée).
- **C40 régresse, et c'est démontré** : `[−7,75 ; −0,77]`, la borne haute
  sous zéro — encore à −0,3 une fois l'intervalle élargi de la réutilisation
  du livre (× 1,15 à quatre jobs, « Le livre, réutilisé »). Son attendu,
  0 à +12, est réfuté.
- **C41b et C42 : pas d'effet décelable**, chacun au centre de son attendu.
- **C41b est hétérogène** — match 2 contre match 4, p = 0,039 sous le seuil
  de 0,0455. Le match 2 a joué sur le seul runner de la journée à la
  profondeur 15 (EPYC 9V45, 3,04 M n/s) ; les trois autres ne montrent pas
  de pente avec la vitesse (1,80, 1,82 et 2,25 M n/s pour +0,69, +3,71 et
  +6,49). <span>Inférence, confiance faible</span> : quatre candidats
  lus au seuil de 4,55 % chacun, une fausse alarme a ~17 % de chances d'en
  toucher un. **La décision n'en dépend pas** : aucune lecture — ni
  l'ensemble, ni un match seul, le meilleur à +6,49 ± 6,83 — ne met la
  borne basse au-dessus de zéro.
- **Les avertissements de l'arbitre, lus** : 9 à 18 par candidat et par
  côté, candidat et référence à égalité — « PV continues after fifty-move
  rule » ou « … threefold repetition », la nature connue depuis C31. Rien
  qu'un candidat introduise.

**Les attendus, confrontés.** C41 : −25 à +20, ~−5 — **+10,66, dedans,
très au-dessus du centre**. Son arbre, +17,7 % à la profondeur 12 (0,32
pli), valait −19 à −34 à justesse constante : **l'extension rachète de
l'ordre de +30 à +45 Elo de décisions**. <span>Inférence, confiance
moyenne</span> : ce coût vient de l'étalon de 60 à 105 Elo par pli, pas
d'une mesure de C41. C41b : −15 à +20, ~0 — +1,13. C42 : −15 à +15, ~0 —
−1,13 : une évaluation dont l'écart au résultat baisse de 7,4 % ne rend
rien ici, son arbre (+7,4 %) mangeant ce qu'elle achète. **C40 : 0 à +12,
~+5 — réfuté**, sous la fourchette.

**La marge singulière a une pente.** 20·d rend +1,13, 10·d +10,66 :
+9,5 d'écart, z ≈ 3,4 une fois corrigé du livre — plus d'extensions, plus
fort, malgré un arbre presque deux fois plus gros (+17,7 % contre +9,9 %).
L'écran porte deux points de plus : 5·d (+21,2 % d'arbre à la profondeur
10, +37,8 % à la 12) et 2·d (+64,8 % à la 12). **La suite du n° 9 : la marge
à 5·d, contre `main` avec C41** — l'arbre y regrossit de ~17 % encore, et
seul un match dira si l'extension le rachète encore (ligne du backlog).

**Un même taux de dégâts, deux signes — ce que C40 apprend.** L'écran le
rangeait « dans la classe de la futilité et du compte de coups » : 1,4 % des
montées d'`alpha` détruites, contre 2,0 % pour LMP et pour C39 à leur
réglage retenu. Ces deux-là ont rendu +17,24 pour −23 % d'arbre et +23,72
pour −29 % ; C40 rend −4,26 pour −7,2 %. **Par point de montées d'`alpha`
détruites, C40 n'achète que 5 points d'arbre, contre 11 à 15** : un taux
de dégâts ne se lit qu'avec l'économie qu'il achète. <span>Inférence,
confiance moyenne</span> — trois points, deux bases. Inscrit dans
`CLAUDE.md`, près de « dimensionner un mécanisme borne son gain possible ».

**C42 change la fin des parties.** Ses quatre jobs comptent 179 à 202 nulles
par la règle des cinquante coups, contre 103 à 140 dans les douze autres, et
127 à 154 nulles adjugées contre 157 à 216 ; un peu moins de nulles en tout
(52,6 à 56,2 % contre 53,6 à 57,9 %). <span>Inférence, confiance
faible</span> : la correction écarte de zéro les scores des finales nulles,
et l'adjudication de fastchess, qui lit ces scores, se déclenche moins.

**Le crible de C41, après sa fusion** — les 114 lignes neuves de `search.rs`, en local : 62 mutants, 40 attrapés,
7 inviables, 6 expirés, **9 survivants**. Quatre touchaient un invariant et sont tués par des tests : la garde `ply > 0`
des extensions, en `>=` comme en `==` — la racine se cherche à la profondeur qu'annonce l'itération, comme pour l'IIR —,
et la frontière singulière `score < sbeta`, extraite en `is_singular` et testée aux bornes de la fenêtre nulle. Cinq
sont notés au plafond : quatre valeurs (la marge, la profondeur d'exclusion), et un terme inatteignable — le coup de la
table, seul à s'étendre, sort toujours au rang 0, et LMR ne réduit qu'à partir du rang 3. **`search.rs` passe à 47**,
raisons dans `.github/mutation-baseline.txt` ; le balayage qui a suivi la fusion le confirme, exactement : 47, total 163 (EN VOL, relevé à 19 h 25).

**Fermés** : C40 à la marge de `20·d²` et à la profondeur pleine — Stockfish
mesure la sienne à la profondeur réduite de LMR, un autre mécanisme, à
écranter s'il revient ; C42 sous cette forme. Leurs rustines restent à
l'attic, avec leur verdict.

### N° 9, après le quatrième écran — C43 et C44 : protocole et attendus, écrits le 6 oct. avant de mesurer

**La base** : `main` avec C41, le commit de fusion de la PR qui le fait
entrer. Chaque candidat est commité sur la branche puis révoqué aussitôt, et
se mesure contre cette base.

**C43 — le gain d'un pion qui reprend en promouvant, dans `see`.** Un
correctif de règle (backlog, C43). Le test qui tombe sur l'ancien code
existe (0 contre −880, la valeur de l'oracle) ; le mécanisme est mesuré au
rejeu du journal du quatrième écran : 3,5 appels de `see` sur un million
changent de valeur à la profondeur 12, l'arbre +0,0001 %. C40 n'étant pas
entré, la boucle d'échange reste propre à `see`, et la rustine s'applique
telle quelle. **Attendu** : 0 — l'effet est des ordres de grandeur sous la
résolution. **Critère, écrit avant** : fusion sauf si la borne haute est
sous zéro, lue sur l'ensemble comme sur chaque match. **Puissance, dite
d'avance** : deux jobs de 3 000 parties, ± 6,3 en commun, ± 7,3 corrigé du
livre. Une régression de quelques Elo passe inaperçue, et c'est accepté
parce que c'est écrit ; à effet nul, deux matchs lus chacun à 95 % arrêtent
le correctif environ une fois sur vingt.

**C44 — la marge singulière à 5·d.** C41 à l'identique, `SINGULAR_MARGIN`
de 10 à 5 : le pas suivant de la bissection, dans le sens de la pente. Le
rejeu de l'écran l'a déjà mesuré : à la profondeur 10, **130 762 218** nœuds
contre 120 054 845 pour C41 (+8,9 %) ; à la 12, +17,1 % sur C41, 46,0 % de
singuliers contre 37,5 %. Le candidat doit rendre EXACTEMENT 130 762 218 au
rejeu à la profondeur 10 — sa fidélité à la variante `se:5:8` de la sonde.
**Attendu** — <span>inférence, confiance faible</span> : l'arbre +17 %
coûte ~0,3 pli, −18 à −32 Elo à justesse constante ; de 20·d à 10·d,
l'extension a racheté son coût et ~+10 au-delà, mais celles qu'ajoute une
marge plus étroite départagent des coups de moins en moins séparés.
**Attendu −15 à +10, ~−2.** **Critère, écrit avant** : gain si la borne
basse commune est au-dessus de zéro — alors la marge passe à 5·d, et 2,5·d
se mesure ensuite ; sinon la bissection s'arrête et la marge reste à 10·d.
**Puissance** : quatre jobs de 3 000 parties, ± 3,7 en commun, ± 4,3
corrigé du livre ; un vrai +5 passe la borne trois fois sur quatre.

### N° 9, après le quatrième écran — VERDICT, 6 oct. 2026 : C43 +0,87 ± 4,63, FUSIONNÉ au titre de la règle ; C44 +2,69 ± 3,41, la marge singulière reste à 10·d

Les six jobs relevés à 19 h 30, heure de Paris — lancés à 13 h 57, finis
entre 19 h 18 et 19 h 21 : 3 000 parties chacun contre `b6d41d7`, `main`
avec C41, 6,4 à 6,5 s par partie. Zéro perte au temps, zéro coup illégal,
zéro moteur perdu, sur les six journaux entiers. Tous à la profondeur 14 en
250 ms, sauf un Xeon 6973P-C à la 15.

| candidat | runs | Elo par job | en commun | homogénéité |
|---|---|---|---|---|
| **C43** | 37459858205, 37459861258 | +0,23, +1,51 | **+0,87 ± 4,63** | p = 0,787 |
| **C44** | 37459864301, 37459867364, 37459870312, 37459873334 | +4,98, 0,00, +6,37, −0,58 | **+2,69 ± 3,41** | p = 0,486 |

- **C43, par son critère** — fusion sauf si la borne haute est sous zéro,
  lue sur l'ensemble comme sur chaque match : `[−3,76 ; +5,50]` en commun,
  `[−6,17 ; +6,63]` et `[−5,18 ; +8,20]` par match. Aucune borne haute sous
  zéro : **FUSIONNÉ** (`3d6d4d6`, la révocation révoquée). Au centre de son
  attendu, 0 : ce qu'il apporte est une règle juste — `see` rendait 0 où
  l'oracle compte −880 —, pas de l'Elo, 3,5 appels sur un million changeant
  de valeur.
- **Sa puissance, dite d'avance, était fausse — dans le sens prudent.**
  ± 6,3 annoncé en commun, **± 4,63** mesuré ; et le facteur du livre écrit,
  × 1,16, était celui de quatre jobs. À deux, chaque ouverture se rejoue six
  fois : variance × 1,15 (`1 + (m − 1)·ρ`, ρ = 0,03, « Le livre,
  réutilisé »), intervalle × 1,07 — ± 4,96, `[−4,09 ; +5,83]`. La lecture
  n'en change pas.
- **C44, par son critère** — gain si la borne basse commune est au-dessus
  de zéro : `[−0,72 ; +6,10]`, `[−1,23 ; +6,61]` corrigé du livre (× 1,15
  à quatre jobs). **Pas de gain démontré : la bissection s'arrête, la marge
  singulière reste à 10·d.** Aucun match seul ne passe non plus — le
  meilleur, +6,37 ± 6,73, a sa borne basse à −0,36. Dans son attendu, −15
  à +10, au-dessus de son centre, ~−2.
- **Pas de pente avec la vitesse** : 1,85 M n/s rend +4,98 ; 1,88 et
  1,93 M, −0,58 et 0,00 ; le Xeon, 2,30 M et la profondeur 15, +6,37.
- **Les avertissements de l'arbitre, lus** : « PV continues after
  fifty-move rule » ou « … threefold repetition », la nature connue depuis
  C31, au taux connu — un pour mille parties et par moteur : 7 au candidat
  et 5 à la référence pour C43 sur 6 000 parties, 10 et 6 pour C44 sur
  12 000. Rien qu'un candidat introduise.

**La pente de la marge s'aplatit.** Le pas de 20·d à 10·d rapportait
+9,5 ; celui de 10·d à 5·d, **+2,7 ± 3,4** — pour un arbre qui regrossit
d'autant (+17,1 % à la profondeur 12, contre +17,7 % pour C41 sur sa base).
<span>Inférence, confiance moyenne</span> : l'écart des deux pas, +6,8
± 5,9, n'est lui-même qu'à z ≈ 2,3 (2,0 corrigé du livre) ; l'optimum est
entre 5·d et 10·d, ou la courbe y est plate. Un point de plus ne
trancherait qu'un effet de quelques Elo : ~20 000 parties pour 3 Elo
(59 256 ÷ 3), sept jobs, dont le livre multiplie la variance par 1,6 —
**à rouvrir avec un livre plus grand**, s'il vient (backlog, « mesurer
petit »).

**Même arbre, le quart de l'Elo.** C41 et C44 font grossir l'arbre de la
même proportion, × 1,18 et × 1,17, et rendent +10,66 et +2,69 au point :
un point de plus pour « c'est plus fort » (`CLAUDE.md`), qui ne se déduit
d'aucun rapport de nœuds.

**Le n° 9 est clos.** Les neuf techniques de la liste du 29 sept. sont
toutes passées à l'écran. Six sont entrées : la réduction du coup nul
adaptée à la profondeur (C32), *improving* dans l'élagage par compte
(C36), la réduction itérative interne (C34), l'échange statique hors
quiescence (C38), la futilité aux nœuds frontières (C39), les extensions
singulières (C41) — et, en plus de la liste, la garde du coup nul (C33).
Trois sont fermées : l'historique de correction (C42, sans effet),
l'historique des captures et ProbCut (sans match ; ProbCut à rouvrir à
cadence longue). Ce qui vient ensuite se demande (`CLAUDE.md`) ; le livre
plus grand, décidé le 6 oct., n'est pas commencé.

**Fermé** : C44, sa rustine à l'attic avec son verdict
(`c44-marge-singuliere-5.patch`).

### N° 10 — deux binaires, et le match qui chiffre l'AVX2 : protocole et attendu, écrits le 6 oct. avant de mesurer

**La décision** — Théo, 6 oct. au soir, sur l'avis écrit sous le backlog :
« *Ok, alors on testera tout ça dans l'ordre recommandé* » ; « *pour le 1 pas
grave on livrera deux binaires selon AVX2 ou non* » ; « *oui tu peux lancer
1 et 2* ». Les cinq points de l'avis deviennent n° 10 à n° 14, dans cet
ordre.

**Deux conditions de mesure changent à cette date**, pour tous les verdicts
qui suivent :
- les binaires des matchs et des séries de force se bâtissent pour
  `x86-64-v3` par défaut — `cpu_candidat` et `cpu_reference` de
  `match.yml`, `cpu` de `force.yml` : on mesure le binaire qui joue sur une
  machine AVX2. Le point de fonctionnement monte d'environ 0,4 pli à cadence
  égale, et une ligne d'étalonnage ne se compare plus à celles d'avant ;
- le livre passe à 15 000 positions (n° 11, « Le livre d'ouvertures »).

Un verdict d'avant le 6 oct. au soir et un verdict d'après ne se comparent
pas sans le dire. En local, rien ne change : `cargo build --release` et
`tools/ref.sh` bâtissent au jeu de base, pour que les deux binaires d'une
comparaison locale le soient de la même façon.

**Le match** — le même commit des deux côtés, `main` à la fusion qui porte
ces lignes : le candidat bâti pour `x86-64-v3`, la référence pour `x86-64` ;
`8+0,08`, deux jobs de 3 000 parties, graine « auto ».

**Attendu, écrit avant** — <span>inférence, confiance faible</span> :
× 1,235 de nœuds par seconde dans le conteneur, soit 0,30 doublement ; par
l'étalon, +107,7 Elo par doublement à `8+0,08`, **~+33**. **Fourchette +15 à
+45** : le rapport peut être autre sur runner, où trois parties se partagent
deux cœurs physiques et leurs unités AVX2, et entre AMD et Intel.

**Critère, écrit avant** — l'arbre ne change pas : c'est une optimisation
pure au sens de l'arbitrage du 15 sept., prouvée par les nœuds identiques et
la mesure de temps. Le match ne décide pas de l'adoption, il en chiffre
l'Elo : **gain démontré si la borne basse commune est au-dessus de zéro**. Si
la borne haute était sous zéro, le binaire AVX2 jouerait moins bien sur
runner : le défaut des workflows reviendrait à `x86-64`, et la cause se
chercherait avant toute autre mesure.

**Puissance** — deux jobs, ± 4,6 en commun au taux de nulles d'aujourd'hui :
un vrai +15 passe la borne basse presque à coup sûr. À 15 000 ouvertures, la
corrélation des paires est négligeable à deux jobs.

### N° 10 — VERDICT, 7 oct. 2026 : +32,23 ± 4,84 Elo à `8+0,08` — l'AVX2 rapporte, gain démontré ; l'étalon du temps l'avait prédit

**Les deux matchs** — `ea8f3af` des deux côtés, `x86-64-v3` contre `x86-64`,
3 000 parties chacun, graine « auto », le livre de 15 000, fastchess :

| job | Ptnml(0-2) | Elo | runner |
|---|---|---|---|
| 37514404585 | [25, 192, 841, 375, 67] | +31,00 ± 6,82 | 1 893 183 n/s, profondeur 14 en 250 ms |
| 37514408893 | [18, 212, 802, 400, 68] | +33,46 ± 6,88 | 1 863 913 n/s, profondeur 14 |
| **en commun** | 6 000 parties | **+32,23 ± 4,84** | homogènes, z = −0,50, p = 0,619 |

Aucune perte au temps, aucun coup illégal, sur la totalité des journaux ;
5 h 18 et 5 h 19 de match, 6,4 s par partie. Les deux runners sont des AMD
EPYC 7763, quatre processeurs logiques pour deux cœurs physiques.
**Avertissements de l'arbitre** : « PV continues after fifty-move rule » et
« … after threefold repetition », 5 et 10 par match, des deux côtés — le
même code joue des deux côtés, au même taux, et C31 en a nommé une source :
la quiescence qui ne teste pas la nulle après une parade tranquille. Non
relus un par un : le compte seul ne distingue pas une source d'une autre.

**Critère, écrit avant** : gain démontré si la borne basse commune est
au-dessus de zéro. Elle vaut **+27,4 : gain démontré.** Le défaut des
workflows reste `x86-64-v3`, et le binaire AVX2 est celui qui joue.

**L'attendu tient au point** : ~+33, fourchette +15 à +45. Et c'est l'étalon
du TEMPS qui l'a donné : × 1,235 de vitesse, c'est 0,305 doublement, et un
doublement de temps vaut +107,7 ± 8,2 Elo (24 sept.) — **+32,8 prédit,
+32,2 ± 4,8 mesuré.** *Un gain de vitesse à arbre égal se convertit en Elo
exactement comme un gain de temps* : c'est la première vérification
directe de la conversion que le projet emploie depuis le 22 sept. pour
comparer ses chantiers, et elle tombe à 2 % près. <span>Confiance moyenne
sur la généralité</span> : un point, à une cadence, sur un seul gain.

### N° 12, le cinquième écran — protocole et attendus, écrits le 6 oct. avant de mesurer

**La décision** — n° 12, Théo, 6 oct. au soir, l'ordre recommandé : des
techniques connues, absentes du code et jamais mesurées ici, la liste
vérifiée dans `search.rs` le même jour (backlog, « un cinquième écran »).

**La sonde, v5** — un binaire de MESURE, des variantes choisies par la
variable `N12`, combinables par `+` ; sans elle, `main` au nœud près. Elle
compte, sur le moteur tel qu'il est :
- **PVS** — `pvs` : après le premier coup cherché, chaque coup se cherche
  sous la fenêtre nulle `(alpha, alpha + 1)`, réduit s'il le doit ; à
  profondeur pleine sous la même fenêtre si la réduction ment ; sous la
  fenêtre pleine s'il tombe entre `alpha` et `bêta`. Comptées : les
  recherches nulles et les re-recherches pleines. `pv`, qui implique
  `pvs` : la distinction des nœuds PV — `bêta − alpha > 1` —, où la table
  ne coupe plus, ni la futilité inverse, ni le coup nul, et où LMR réduit
  d'un pli de moins ;
- **LMR modulée** — `lmrh:D` : la réduction d'un tranquille diminue de sa
  note d'ordonnancement, papillon et continuation, divisée par `D`, sans
  descendre sous zéro ;
- **le malus d'historique** — `mal` : à chaque coupure par un tranquille,
  les tranquilles cherchés avant lui perdent `d²` au papillon et à la
  continuation. L'historique d'aujourd'hui ne reçoit que des bonus — A20 a
  écarté le malus à l'arbre —, si bien qu'aucune note n'est négative et
  qu'un élagage par l'historique n'aurait rien à lire ; **l'élagage par
  l'historique** — `hp:T`, avec `mal` : un tranquille dont la note est sous
  `−T·d` se saute, jusqu'à la profondeur 4, avec les gardes de la futilité.
  En ombre, comptés : les tranquilles qu'il sauterait, et ceux d'entre eux
  qui, cherchés, montent `alpha` ;
- **le razoring** — `rz:A:B` : jusqu'à la profondeur 3, hors échec et hors
  racine, quand l'évaluation du nœud plus `A + B·d²` — unités de la faite
  main, à l'échelle du réseau par B8 — n'atteint pas `alpha`, la quiescence
  décide : sous `alpha`, le nœud rend sa valeur. En ombre : les nœuds
  éligibles, ceux que la quiescence condamne, et ceux d'entre eux dont la
  recherche monte quand même `alpha` ;
- **les échecs tranquilles en quiescence** — `qsc` : au premier pli de la
  quiescence, hors échec, les tranquilles qui donnent échec s'ajoutent aux
  captures ;
- **la suite des extensions singulières** — `mc` : quand la recherche
  d'exclusion dépasse `sbeta` et que `sbeta ≥ bêta`, le nœud rend `sbeta`,
  le multi-cut ; `neg` : quand elle le dépasse et que le score de la table
  atteint `bêta`, le coup de la table perd un pli ; `dbl:M` : sous
  `sbeta − M`, même échelle, il en gagne deux, une fois au plus par chemin ;
- **la décroissance avec la règle des cinquante coups** — `r50` :
  l'évaluation statique × `(200 − c) / 200`, `c` le compteur des cinquante
  coups ;
- et pour toutes, **le coup rendu** : l'accord avec `main`, position par
  position.

**Le journal** : celui du quatrième écran, 60 parties de `main` à
`f537d33`, 6 203 recherches. Ses positions viennent du moteur d'avant C41
et C43, qui n'ont changé l'arbre qu'au-delà de la profondeur 8 et 3,5
appels de `see` sur un million : un échantillon de jeu toujours
représentatif. Rejoué à la profondeur 10 et 12, table et historiques
conservés d'un coup à l'autre, contre `main` à `1eaf0d7`.

**Attendus, écrits avant** — <span>inférence, confiance faible</span>, à la
profondeur 12 :
- `pvs` : l'arbre **−3 à −15 %** ; les re-recherches pleines **1 à 6 %**
  des recherches nulles. En septembre, PVS rendait ÷ 1,03 puis ÷ 1,07 ;
- `pvs+pv` : l'arbre **0 à +10 %** sur `pvs` seul — les nœuds PV sont
  rares ;
- `lmrh:400000` : l'arbre **+1 à +10 %** — elle ne fait que réduire moins ;
  `lmrh:100000` : **+5 à +25 %** ;
- `mal` : l'arbre **−5 à +5 %** ; `mal+hp:50000` : **−3 à −15 %** sur `mal`,
  dont **0,5 à 3 %** des tranquilles sautés qui, cherchés, montaient
  `alpha` ;
- `rz:240:140` — la marge de Stockfish, convertie : éligibles **5 à 20 %**
  des nœuds de profondeur ≤ 3, condamnés par la quiescence **20 à 60 %**
  d'entre eux, l'arbre **−2 à −10 %**, et **0,2 à 2 %** des condamnés
  montant `alpha` ;
- `qsc` : l'arbre **+10 à +40 %** ;
- `mc` : **−1 à −5 %** ; `neg` : **−1 à −5 %** ; `dbl:12` : **+2 à
  +15 %** ;
- `r50` : l'arbre **± 1 %**, le coup rendu changé dans **0,2 à 2 %** des
  positions.

**Ce que l'écran décide** : les candidats — chacun révoqué aussitôt, sa
rustine à l'attic, un attendu et un critère écrits avant ses matchs, quatre
jobs de 3 000 parties sur le binaire AVX2 et le livre de 15 000, comme aux
écrans du n° 9. **PVS en est un quel que soit son arbre** : c'est le
changement structurel, et ses deux rejets de septembre appartiennent à une
autre base. Une variante qui ne déplace ni l'arbre ni le coup rendu se ferme
ici, sans match.

### N° 12, le cinquième écran — RELEVÉ, 7 oct. 2026 : sept candidats ; le multi-cut, le razoring, l'élagage et la réduction par l'historique fermés à l'écran

**Le rejeu** — les 6 203 recherches du journal, à la profondeur 10 et 12,
contre `main` à `1eaf0d7` : 120 055 016 et 332 680 141 nœuds. La sonde
rend `main` au nœud près. **Deux séries** : celle du protocole, puis une
seconde **ajoutée APRÈS lecture de la première**, pour trois raisons
écrites alors — les échelles de `lmrh` et de `hp` étaient fausses, aucune
note n'atteignant leurs seuils ; les règles des nœuds PV étaient mêlées en
un bloc ; l'élagage par l'historique n'avait de dégâts mesurés qu'à une
échelle où il ne coupait rien. Ses variantes : `pvtt`, `pvrfp`, `pvnmp`,
`pvlmr` (une règle PV à la fois, sur `pvs`), `lmrh:250`, `lmrh:1000`,
`mal+lmrh:250`, `mal+hp:100`, `mal+hp:300`, et `mal+hpo:100`, `mal+hpo:300`
— l'élagage en ombre, qui compte sans couper. La sonde, ses variantes et son
rejoueur : `tools/attic/n12-sonde-ecran5.patch`.

| variante | l'arbre à 12 (à 10) | attendu, écrit avant | lecture |
|---|---|---|---|
| `pvs` | **+3,19 %** (+4,66 %) ; re-recherches pleines **0,30 %** des recherches nulles | −3 à −15 % ; 1 à 6 % | **réfuté, le signe** : la fenêtre nulle GROSSIT l'arbre sur cette base — en septembre, elle le réduisait (÷ 1,03, puis ÷ 1,07) |
| `pvs+pv` | **+60,21 %** (+58,64 %) | 0 à +10 % sur `pvs` | **réfuté d'un ordre de grandeur**. Décomposé à 10, chaque règle seule sur `pvs`, contre `main` : `pvs` +4,66 %, avec la table +15,75 %, avec la futilité inverse +4,86 %, avec le coup nul +5,28 %, **avec LMR qui réduit d'un pli de moins +44,27 %** ; les trois premières ensemble +14,62 % (+17,09 % à 12) |
| `lmrh:400000`, `lmrh:100000` | 0,00 % | +1 à +10 % ; +5 à +25 % | **réfuté, l'échelle** : là où LMR réduit, à 10, la note vaut 0 dans 57,7 % des cas, 1 à 100 dans 28,9 %, 101 à 1 000 dans 12,7 %, plus dans 0,7 %. Seconde série : `lmrh:1000` +1,72 % à 10 et **+14,03 % à 12** ; `lmrh:250` +15,96 % et **+73,21 %** ; `mal+lmrh:250` +2,50 % et +13,13 % |
| `mal` | **−3,76 %** (−2,02 %) | −5 à +5 % | tient |
| `mal+hp:50000` | celui de `mal` | −3 à −15 % sur `mal`, 0,5 à 3 % des sautés montant `alpha` | **réfuté, l'échelle** : aucune note sous −50 000·d. Seconde série, sur `mal` : `hp:100` −0,30 % à 12 (−1,72 % à 10), `hp:300` −0,63 % (−0,40 %) ; en ombre à 10, **17,7 % des tranquilles sautés montent `alpha`** à `hp:100` (5 887 sur 33 351), 11,0 % à `hp:300` (65 sur 589) |
| `rz:240:140` | **+1,18 %** (+0,95 %) | −2 à −10 % | **réfuté, le signe**. En ombre sur `main` à 12 : éligibles 11,4 % des nœuds de profondeur ≤ 3 (attendu 5 à 20 %), **condamnés 81,4 %** d'entre eux (20 à 60 %), et **2,73 %** des condamnés montent `alpha` (0,2 à 2 %) |
| `qsc` | **+30,66 %** (+32,82 %) | +10 à +40 % | tient |
| `mc` | **+0,02 %** (−0,65 %) | −1 à −5 % | **réfuté** : 78 800 coupures à 12, pas d'économie |
| `neg` | **−8,34 %** (−2,23 %) | −1 à −5 % | au-delà |
| `dbl:12` | **+5,32 %** (+4,94 %) | +2 à +15 % | tient |
| `r50` | **+1,72 %** (+1,15 %) | ± 1 % | un peu au-delà |

**Le coup rendu ne discrimine rien.** Chaque variante qui touche l'arbre
change **28 à 32 %** des coups rendus — la décroissance des cinquante
coups comprise, dont l'attendu disait 0,2 à 2 %. Au rejeu, la table et les
historiques passent d'un coup au suivant : toute perturbation se propage à
toutes les recherches d'après, et bien des positions ont plusieurs coups
presque équivalents. <span>Inférence, confiance moyenne</span> : le
mécanisme n'est pas mesuré à part ; le fait l'est — le binaire de `main`
rejoué rend 0 %. **L'accord avec la base mesure la sensibilité du rejeu,
pas la décision** ; celui qui a prédit C24 se lisait contre un ORACLE, une
recherche six fois plus longue.

**L'échelle de l'historique n'est pas bornée, et c'est ce qui ferme deux
variantes.** Une note gagne `d²` à chaque coupure et ne se divise qu'à
800 000 : plus la recherche est profonde, plus les notes sont grandes. Un
seuil fixe agit donc d'autant plus que l'on cherche loin — `lmrh:1000`
passe de +1,7 % à +14 % d'arbre entre la profondeur 10 et la 12. **Un seuil
sur une grandeur sans échelle n'est pas un réglage, c'est une dérive.** La
condition préalable est un historique BORNÉ — la « gravité », un bonus
pondéré par `1 − |note| / plafond` —, un changement à lui seul, qui change
l'ordre des coups : au backlog.

**Ce que l'écran décide** :
- **sept candidats**, chacun au nœud près de sa variante au rejeu à la
  profondeur 10, révoqué aussitôt, sa rustine à l'attic : **C45** `pvs`
  (`4db9356`), **C46** `pvs` et les nœuds PV sans LMR — table, futilité
  inverse, coup nul (`7134c9f`), **C47** `neg` (`de87273`), **C48**
  `dbl:12` (`b395bea`), **C49** `mal` (`98a2b1c`), **C50** `r50`
  (`af73ff5`), **C51** `qsc` (`7bc0e61`), ce dernier par un générateur qui
  ne joue que les coups candidats à l'échec, confronté à l'oracle qui joue
  tout ;
- **fermés à l'écran, sans match** :
  - **le multi-cut** : pas d'économie à 12 (+0,02 %), et c'est toute sa
    valeur ailleurs — *si le phénomène ne se produit pas, la question est
    close* ;
  - **le razoring** : l'arbre grossit (+1,18 %) et 2,73 % des condamnés
    montent `alpha` — des dégâts sans économie, la leçon de C40 ;
  - **l'élagage par l'historique** : au plus 0,6 % d'arbre à 12, pour
    11 à 18 % des sautés qui montaient `alpha` ; et son seuil porte sur la
    même échelle sans borne ;
  - **la réduction modulée par l'historique** : la dérive ci-dessus. Elle
    se rouvre avec un historique borné ;
- **différé** : LMR à un pli de moins aux nœuds PV, +39,6 points d'arbre
  sur `pvs` à 10 — la question suivante si C46 paie, et seulement alors.

### N° 12 — les candidats C45 à C51 : attendus et critère, écrits le 7 oct. avant de lancer

**Le protocole** — celui des écrans du n° 9, dans les conditions du 6 oct.
au soir : quatre jobs de 3 000 parties par candidat, `8+0,08`, graine
« auto » chacun, le binaire AVX2 des deux côtés, le livre de 15 000
ouvertures ; la référence est `main` après la fusion de cette relève, dont
le moteur est celui de `1eaf0d7` au bit près. Vingt-huit jobs, lancés
ensemble.

**Attendus, écrits avant les matchs** — <span>inférence, confiance
faible</span>. Le coût d'un arbre plus grand à temps égal se lit par
l'étalon — 1,38 pli par doublement, 60 à 105 Elo par pli — comme pour C41 :
- **C45**, la fenêtre nulle : +3,2 % d'arbre, un coût de **−4 à −7** si
  la décision ne bougeait pas ; deux mesures de septembre à −10,9 puis
  −0,8, sur une autre base ; **attendu −12 à +8, ~−3** ;
- **C46**, PVS et les nœuds PV : +17,1 %, **−19 à −33** de coût ; ce
  qu'il rachète, des variantes principales exactes, est la question ;
  **attendu −30 à +10, ~−10** ;
- **C47**, l'extension négative : −8,3 %, **+10 à +18** si la décision ne
  bougeait pas ; un coup de la table cherché moins loin peut manquer ;
  **attendu −5 à +15, ~+5** ;
- **C48**, la double extension : +5,3 %, **−6 à −11** de coût ;
  **attendu −10 à +10, ~0** ;
- **C49**, le malus d'historique : −3,8 %, **+5 à +8** à décision égale ;
  **attendu −3 à +10, ~+3** ;
- **C50**, la règle des cinquante coups : +1,7 %, **−2 à −4** ; ne joue que
  dans les parties qui tournent en rond ; **attendu −5 à +5, ~0** ;
- **C51**, les échecs tranquilles en quiescence : +30,7 %, **−32 à −56** de
  coût, et un générateur de plus par nœud d'entrée en quiescence ;
  **attendu −50 à +5, ~−20**.

**Critère, écrit avant** — des techniques ajoutées, pas des correctifs de
règle : **gain si la borne basse commune est au-dessus de zéro**. Si C45 et
C46 le passent tous deux, le meilleur au point est retenu, comme C32 contre
C32b ; C46 contenant C45, un C46 gagnant porte la fenêtre nulle avec lui.
Les gains rejoignent le groupe d'une composition, mesurée contre `main`
comme le 5 oct. **Puissance, dite d'avance** : 12 000 parties par
candidat, ± 3,5 en commun ; un vrai +5 passe la borne trois fois sur
quatre, un vrai +10 presque toujours — et un vrai −5 jamais.

### N° 12, le cinquième écran — VERDICT, 7 oct. 2026 : C49 +25,32 ± 3,26, C45 +11,67 ± 3,38 et C47 +3,91 ± 3,28 à la composition ; C46 +9,56 ± 3,38 sous C45 ; C48 et C50 sans effet ; C51 −10,77 ± 3,40, régression

Les vingt-huit jobs relevés à 8 h 15 (heure de Paris) : lancés ensemble à
1 h 37, partis sans file d'attente, finis entre 6 h 43 et 7 h 06 ; 3 000
parties chacun, chaque candidat contre `9c73f99`, à `8+0,08`, le binaire
AVX2 des deux côtés, le livre de 15 000. **Zéro perte au temps, zéro coup
illégal, zéro moteur perdu sur les vingt-huit.** Profondeur 15 en 250 ms
partout où la fin du journal la donne — vingt-cinq jobs sur vingt-huit —,
de 1,90 M n/s au banc (Xeon 8573C) à 3,48 M (EPYC 9V45) ; 6,09 à 6,53 s
par partie.

| candidat | les quatre jobs | en commun | homogénéité | attendu, écrit avant |
|---|---|---|---|---|
| **C45**, la fenêtre nulle | +15,06, +10,43, +8,57, +12,63 | **+11,67 ± 3,38** | p = 0,549 | ~−3, −12 à +8 |
| **C46**, la fenêtre nulle et les nœuds PV | +12,17, +9,04, +4,75, +12,28 | **+9,56 ± 3,38** | p = 0,424 | ~−10, −30 à +10 |
| **C47**, l'extension négative | +0,23, +2,20, +4,98, +8,22 | **+3,91 ± 3,28** | p = 0,343 | ~+5, −5 à +15 |
| **C48**, la double extension | +3,24, +1,39, −1,97, −1,85 | **+0,20 ± 3,31** | p = 0,695 | ~0, −10 à +10 |
| **C49**, le malus d'historique | +27,39, +28,55, +22,15, +23,20 | **+25,32 ± 3,26** | p = 0,534 | ~+3, −3 à +10 |
| **C50**, la règle des cinquante coups | +0,12, +2,43, −3,94, +1,39 | **−0,00 ± 3,26** | p = 0,512 | ~0, −5 à +5 |
| **C51**, les échecs tranquilles en quiescence | −10,54, −8,34, −12,05, −12,17 | **−10,77 ± 3,40** | p = 0,862 | ~−20, −50 à +5 |

Les runs, dans l'ordre des jobs : la section « EN VOL ».

**Par le critère écrit avant** — gain si la borne basse commune est
au-dessus de zéro :
- **C49, C45 et C47 : gains démontrés**, bornes basses +22,06, +8,29 et
  +0,63. C46 passe aussi (+6,18), mais C45 le domine au point, +11,67
  contre +9,56 : **C45 est retenu**, comme C32 contre C32b. C46 contenant
  C45, ses règles des nœuds PV ajoutent −2,1 ± 4,8 — rien de démontré,
  dans un sens ni dans l'autre. Les trois rejoignent **la composition**,
  mesurée contre `main` (section suivante).
- **C48 et C50 : pas d'effet décelable**, non fusionnés, rustines à
  l'attic.
- **C51 : régression démontrée**, borne haute −7,37 ; non fusionné.

**Contre les attendus : deux sur sept hors de leur intervalle, tous deux
AU-DESSUS** — C45 (+11,67 contre −12 à +8) et C49 (+25,32 contre −3 à
+10). Les attendus avaient deux termes : le coût de l'arbre à décision
égale, lu par l'étalon (1,38 pli par doublement, 60 à 105 Elo par pli),
et un pari sur la décision, centré sur zéro. La mesure moins le coût rend
le terme de décision de chacun — <span>inférence, confiance
moyenne</span> : l'étalon porte sa propre incertitude, et chaque mesure
± 3,3 :

| candidat | l'arbre à 12 | coût, décision égale | mesuré | la décision, par différence |
|---|---|---|---|---|
| C45 | +3,2 % | −4 à −7 | +11,67 | **+16 à +19** |
| C46 | +17,1 % | −19 à −33 | +9,56 | **+29 à +43** |
| C47 | −8,3 % | +10 à +18 | +3,91 | **−6 à −14** |
| C48 | +5,3 % | −6 à −11 | +0,20 | +6 à +11 |
| C49 | −3,8 % | +5 à +8 | +25,32 | **+17 à +20** |
| C50 | +1,7 % | −2 à −4 | −0,00 | +2 à +4 |
| C51 | +30,7 % | −32 à −56 | −10,77 | **+21 à +45** |

- **Le pari « la décision ne bouge pas » centrait les attendus, et il était
  faux dans les deux sens.** Le terme de décision est partout du même ordre
  que le coût, et plus grand pour C45, C46 et C49 — c'est lui qui en fait
  le signe : positif pour ce qui touche la fenêtre ou
  l'ordre des coups, négatif pour l'extension négative — dont l'attendu
  écrivait le risque, « un coup de la table cherché moins loin peut
  manquer ». Le coût de l'arbre, lui, se lit exactement ; ce n'est pas lui
  qui a manqué.
- **C46 contre C45** : les règles des nœuds PV rachètent par la décision
  presque tout ce qu'elles coûtent d'arbre — +13,9 points, −15 à −26 de
  coût, mesurées −2,1 ± 4,8 —, sans rien rapporter. **Le différé de
  l'écran, LMR à un pli de moins aux nœuds PV, « seulement si C46 paie »,
  reste fermé.**
- **La fenêtre nulle, sur la base d'aujourd'hui** : −10,9 ± 7,9 à `1+0,01`
  le 14 sept., −0,8 ± 8,2 à `8+0,08` le 21 sept. (C12), **+11,67 ± 3,38**
  aujourd'hui. Les deux derniers sont à la même cadence, sur deux bases —
  sans le réseau, A18, A20, le n° 9 ni C41 d'un côté, avec tout cela de
  l'autre ; écart +12,5 ± 8,9, z = 1,41. <span>Inférence, confiance
  faible</span> : la base l'explique, ou le hasard de septembre — rien ne
  les sépare. Ce qui est établi : **sur `main` aujourd'hui, la fenêtre
  nulle rapporte** ; `CLAUDE.md` le dit, ligne « cette technique est
  standard ».
- **Le malus d'historique, le plus gros gain de l'écran, pour 3,8 % d'arbre
  en moins.** Il punit les tranquilles cherchés avant celui qui coupe : à
  la coupure suivante, ils viennent plus tard, là où LMR les réduit et
  l'élagage par compte les coupe. <span>Inférence, confiance
  moyenne</span> : un ordre meilleur rend les réductions et les élagages
  par le RANG plus justes, ce que la taille de l'arbre ne voit pas. Il
  donne aussi à l'historique des notes négatives — la condition de la
  ligne « un historique BORNÉ » du backlog.

**Les avertissements de l'arbitre, lus.** Six candidats dans l'ordre connu :
16 à 26 côté candidat, 10 à 18 côté référence sur leurs quatre jobs, tous
« PV continues after fifty-move rule » ou « … threefold repetition », la
nature connue depuis C31. **C51 non : 157 côté candidat — 116 « fifty-move
rule », 41 « threefold repetition » —, 12 côté référence**, treize fois
plus. Le mécanisme se lit dans le code : un échec tranquille ne remet pas
l'horloge des cinquante coups à zéro et peut répéter une position, et la
quiescence ne teste aucune nulle après un coup tranquille — le défaut de
C31, arrêté par son critère le 30 sept. ; ses variantes traversent donc des
nulles qu'elle ne voit pas. <span>Inférence, confiance faible</span> : que
cette cécité coûte de l'Elo n'est pas mesuré — le terme de décision de C51
est positif, et c'est le coût de l'arbre qui fait la régression. **Si les
échecs tranquilles se rouvrent un jour, c'est avec la nulle en quiescence,
mesurées ensemble** (backlog).

### N° 12, la composition — C45, C47 et C49 : le candidat, et un test qui tombe — règle écrite le 7 oct. avant de mesurer

**Le candidat** : C45, C47 et C49 composés sur `main` — `7d9faef`, dont le
moteur est celui de `9c73f99` au bit près, `git diff` vide sous `engine/`
et `tools/src`. Aucun arbitrage de code : un seul conflit, deux
déclarations voisines en tête de la boucle des coups. Banc **38 007** nœuds
à la profondeur 6 (48 497 sur `main`), **70 452** à la 7 (90 646).

**Un test tombe en composant, et aucun membre seul ne le fait tomber.**
`la_futilite_inverse_retire_des_noeuds` rend 261 956 nœuds avec la
futilité inverse, 250 937 sans, sur ses trente-six positions de parties.
Membre par membre, le même protocole :

| | avec | sans | avec / sans |
|---|---|---|---|
| `main` | 250 177 | 257 946 | 0,970 |
| C45 | 242 835 | 249 625 | 0,973 |
| C47 | 250 177 | 257 946 | 0,970 — l'extension négative n'agit pas sous la profondeur 8 |
| C49 | 212 043 | 218 524 | 0,970 |
| C45 + C49, C45 + C47 + C49 | 261 956 | 250 937 | **1,044** |

Deux faits. **La bascule tient à la paire** fenêtre nulle et malus, pas à
un membre. Et **la marge, sur `main`, n'est plus que de 3 %** : ces
trente-six positions rendaient 0,786 le 5 oct., avant le groupe du n° 9 —
la futilité inverse a fondu depuis, par empilement. <span>Inférence,
confiance moyenne</span> : la futilité aux nœuds frontières (C39) saute
les tranquilles des mêmes nœuds peu profonds.

**La règle, écrite à 8 h 25, avant de mesurer** — poussée à 8 h 26 (`e76fd96`). La sonde du n° 9
(`n9-sonde-futilite-inverse.patch`), portée sur `main` d'aujourd'hui,
rejoue le protocole exact du test — recherche froide, profondeur 7, faite
main, avec et sans la futilité inverse — sur les 4 684 positions de partie
du n° 9, pour `main` et pour la composition.
1. **Sur `main`, la seule mesure indépendante du changement** : la
   probabilité qu'une somme sur 36 positions tirées au hasard bascule —
   avec ≥ sans —, sur 200 000 tirages seedés, comme le 5 oct.
   - **Au-dessus de 0,1 %, la formulation est condamnée sans la
     composition.** La règle du 5 oct. rechoisit `k` — le plus petit dont
     la bascule est ≤ 0,1 % sur `main` — s'il tient dans un test en debug,
     cent positions au plus ; sinon une somme de nœuds ne peut plus garder
     la futilité inverse, et le test se reformule sur ce qu'il garde
     vraiment — qu'elle est branchée et qu'elle coupe en recherche —,
     comme `une_recherche_punit_des_tranquilles` garde le malus.
   - **À 0,1 % ou moins, la formulation tient sur `main`** et la
     composition la renverse au-delà du hasard : aucune reformulation. La
     composition part en match — un compte de nœuds ne juge pas la force —,
     mais elle ne se fusionne qu'après la mesure de la futilité inverse
     sous elle : son arbre au rejeu, au réseau, puis son retrait en match,
     critère écrit avant.
2. **Sous la composition, une mesure, pas une décision** : Σ avec / Σ sans
   sur les 4 684 positions, et la part des positions dont la futilité
   inverse grossit l'arbre — sur `main` le 5 oct., 412, 8,8 %.

**La sonde, relevée à 8 h 45** — le protocole du test, au nœud près : les
trente-six positions du test y rendent exactement ses nombres.

| | Σ avec / Σ sans, 4 684 positions | positions que la futilité inverse grossit | les trente-six du test | une somme sur trente-six bascule |
|---|---|---|---|---|
| `main`, le 5 oct. | 0,744 | 412, 8,8 % | 0,786 | 0,015 % |
| `main`, le 7 oct. | **0,937** | 670, 14,3 % | 0,970 | **6,5 %** |
| la composition | **0,941** | 1 073, 22,9 % | 1,044 | 14,9 % |

- **Par la règle, branche 1** : sur `main`, sans la composition, une
  somme sur trente-six bascule **6,5 % des fois** — la formulation était
  déjà une loterie, et le hasard ne l'avait pas encore tirée. Sous un
  millième, il faudrait près de deux cents positions (150 : 0,12 % ; 200 :
  0,017 %), au-delà des cent qu'un test en debug porte. **Le test se
  reformule sur le branchement** : `la_futilite_inverse_agit_dans_la_recherche`,
  `assert_ne!` sur les mêmes trente-six positions — il tombe si la
  futilité inverse ne coupe nulle part ou si son appel quitte `negamax`.
  Son sens reste mesuré, par la sonde de l'attic, regénérée sur `main`.
  Le changement est un changement de `main`, fusionné avant la composition,
  comme `556ecda` l'était avant le groupe du n° 9.
- **Branche 2, la mesure** : sous la composition, la futilité inverse
  retire encore 5,9 % de l'arbre en général — la propriété tient, c'est sa
  MARGE qui a fondu : 26 % le 5 oct., 6,3 % aujourd'hui, par empilement —
  le groupe du n° 9 et C41 sont entrés entre les deux mesures.
  <span>Inférence, confiance moyenne</span> : la futilité aux nœuds
  frontières (C39) saute les tranquilles des mêmes nœuds peu profonds. Que
  la futilité inverse vaille encore son Elo n'est pas mesuré : au backlog,
  la mesure de son arbre au rejeu, au réseau, d'abord (`CLAUDE.md`, « une
  érosion se cherche en NŒUDS avant de s'acheter en Elo »).
  **Mesurée dans la foulée, et la fonte n'est pas celle du moteur qui
  joue** : au rejeu du cinquième écran — le réseau, table et historiques
  conservés —, `main` sans la futilité inverse cherche 169 549 371 nœuds à
  la profondeur 10 et 498 164 155 à la 12, contre 120 055 016 et
  332 680 141 : **elle retire 29,2 % puis 33,2 % de l'arbre**. Au banc fait
  main à la profondeur 7, 9,2 %. *Ce qui a fondu, c'est son effet à la
  faite main, à froid, à la profondeur 7* — le régime du test, pas celui
  qui joue (`CLAUDE.md`, « un moteur qui DÉMARRE FROID n'est pas un moteur
  en partie »). Pas de match de retrait.
- **Son jumeau, mesuré de même sur `main` le 7 oct.** : le test de
  l'élagage par compte, de la même forme, sur la sonde de C36. Σ avec /
  Σ sans **0,623** (0,638 le 5 oct.), 794 positions grossies (17,0 %), les
  trente-six du test à 0,650 — **aucune bascule sur 200 000 tirages**. Sa
  marge tient : rien à reformuler.

### N° 12, la composition — l'arbre au rejeu, attendu et critère écrits le 7 oct. avant de mesurer

**L'arbre de la composition, mesuré avant le match** — le rejeu du
cinquième écran, les 6 203 recherches de ses 60 parties, table et
historiques conservés d'un coup à l'autre, contre `main` :

| | arbre à 10 | arbre à 12 | à 12, contre `main` |
|---|---|---|---|
| `main` | 120 055 016 | 332 680 141 | — |
| C45 seul | 125 644 250 | 343 299 345 | +3,19 % |
| C47 seul | 117 380 887 | 304 950 184 | −8,34 % |
| C49 seul | 117 635 379 | 320 173 562 | −3,76 % |
| le produit des trois seuls | | | −8,97 % |
| **la composition** | **118 485 702** | **300 572 487** | **−9,65 %** |

- **Les arbres se composent sans recouvrement**, un peu mieux que le
  produit : 0,903 contre 0,910 à la profondeur 12, 0,987 contre 1,003 à
  la 10.
- **La composition privée de chaque membre** — la règle du n° 9, écrite
  le 5 oct. : la part d'arbre d'un membre dans la composition se compare à
  sa part seul ; sous la moitié, il est absorbé, et si la composition
  passe, un match de retrait le mesure.

| membre retiré | arbre à 10 | arbre à 12 | sa part dans la composition, à 12 | sa part seul | rapport |
|---|---|---|---|---|---|
| C45 | 112 862 232 | 293 932 585 | +2,26 % | +3,19 % | 0,71 |
| C47 | 122 576 512 | 330 893 908 | −9,16 % | −8,34 % | 1,10 |
| C49 | 122 177 668 | 317 226 954 | −5,25 % | −3,76 % | 1,40 |


  **Aucun membre n'est absorbé : pas de match de retrait.** C45 est le
  plus près du seuil, il garde 71 % de sa part : la fenêtre nulle grossit
  moins l'arbre quand le malus ordonne mieux les coups — <span>inférence,
  confiance moyenne</span> : un premier coup plus souvent juste, moins de
  re-recherches. C49 et C47 en font PLUS qu'ensemble que seuls.
- **Une réserve, mesurée ci-dessus** : la paire fenêtre nulle et malus
  fait basculer le compte de la futilité inverse à la profondeur 7, à la
  faite main — un régime qui n'est pas celui qui joue, où rien de tel ne se
  lit au total.

**Attendu, écrit avant le match** — <span>inférence, confiance
faible</span> :
- **Majorant** : la somme des gains seuls, **+40,90 ± 5,75** — chacun
  mesuré contre `9c73f99`, dont le moteur est celui de `main`.
- **Par membre** : C49 **+18 à +30**, sa part d'arbre plus grande ensemble
  que seule ; C45 **+5 à +15**, la sienne un peu plus petite ; C47 **−2 à
  +7**. Somme : **+21 à +52**.
- **En tout : +25 à +48, ~+37** — le groupe du n° 9 rendait 91 % de la
  somme de ses gains seuls, et les arbres, ici aussi, se composent sans
  recouvrement.

**Critère, écrit avant** : **la composition se fusionne si sa borne basse
commune est au-dessus de zéro, ET si son point n'est pas démontré sous son
meilleur membre** — C49 seul, +25,32 ± 3,26, contre le même moteur de
référence : sous **+20,6**, l'écart à C49 dépasse ses ± 4,7, et la
composition ferait moins bien qu'un de ses membres. Alors, bissection :
C49 + C45 et C49 + C47 contre `main`, quatre jobs chacun, critère écrit
avant. **Puissance** : quatre jobs de 3 000 parties, ± 3,4 ; un vrai +37
passe les deux clauses toujours, un vrai +25 passe la seconde 99 fois sur
cent, un vrai +18 la manque 93 fois sur cent.

**Ce que la composition ne dira pas : la part de chacun.** C47 surtout,
gagnant de justesse seul (borne basse +0,63) : un membre nul passerait avec
les autres — le prix écrit de « grouper, puis bissecter à l'échec ».

### N° 12, la composition — VERDICT, 7 oct. 2026 : C45 + C47 + C49 +32,55 ± 3,36 Elo à `8+0,08` — FUSIONNÉ

Les quatre jobs relevés à 14 h 25, finis entre 14 h 13 et 14 h 16 : 3 000
parties chacun, `ff8d4bb` contre `7d9faef`, le binaire AVX2 des deux côtés,
**tous à la profondeur 15 en 250 ms**, 6,36 à 6,43 s par partie. Zéro
perte au temps, zéro coup illégal, zéro moteur perdu.

| run | runner | n/s au banc | Elo |
|---|---|---|---|
| 37584104209 | EPYC 9V74 | 2 767 740 | +30,30 ± 6,63 |
| 37584107001 | EPYC 7763 | 2 124 819 | +28,79 ± 6,88 |
| 37584109645 | EPYC 9V45 | 3 226 024 | +33,11 ± 6,52 |
| 37584112743 | EPYC 7763 | 2 141 764 | +38,02 ± 6,86 |
| **en commun** | | | **+32,55 ± 3,36** |

- **Par le critère écrit avant** (`6bb5948`) — fusion si la borne basse
  commune est au-dessus de zéro ET si le point n'est pas démontré sous C49
  seul, soit pas sous +20,6 : `[+29,19 ; +35,91]`, **les deux clauses
  tenues**. La composition se fusionne sans bissection (`0e31ac2`, la
  révocation révoquée). Homogènes : plus grand écart z = 1,86, p = 0,244.
- **Dans l'attendu, sous son centre** — +25 à +48, ~+37, écrit avant.
  **Au-dessus de C49 seul de +7,2 ± 4,7** : la fenêtre nulle et
  l'extension négative ajoutent au malus, démontré — la moitié de leurs
  gains seuls (+15,58), dans la plage que l'attendu leur donnait ensemble
  (+3 à +22).
- **Sous-additif, démontré** : le point vaut **80 %** de la somme des gains
  seuls (+40,90 ± 5,75), et l'écart à cette somme, −8,4 ± 6,7, est séparé
  de zéro. La comparaison tient : les gains seuls ont été mesurés contre
  `9c73f99`, dont le moteur est celui de `7d9faef` au bit près. Le groupe
  du n° 9 en rendait 91 %, sans s'en séparer.
- **L'arbre ne le disait pas** : il se composait sans recouvrement — 0,903
  contre un produit de 0,910 à la profondeur 12 —, aucun membre absorbé ;
  l'Elo, lui, se recouvre d'un cinquième. *Le recouvrement d'arbre ne
  mesure pas le recouvrement de décision* : la règle du n° 9 trouve les
  membres absorbés, elle ne promet pas l'additivité.
- **Ce que la composition ne dit pas : la part de chacun** — C47 surtout,
  gagnant de justesse seul (borne basse +0,63). Le prix écrit de « grouper,
  puis bissecter à l'échec ».
- **Les avertissements de l'arbitre, lus** : 15 côté candidat, 14 côté
  référence sur les quatre jobs — « PV continues after fifty-move rule »
  (12 et 10) et « … threefold repetition » (3 et 4), la nature connue
  depuis C31, autant d'un côté que de l'autre.
- **Ensuite** : le banc à la profondeur 7 passe à 70 452 nœuds, celui de
  la 6 à 38 007 ; les huit rustines du n° 12 ne s'appliquent plus sur
  `main`, et leur colonne dit pourquoi ; le balayage de mutation suit la
  fusion, sa prédiction écrite avant (« EN VOL »). **Le n° 12 est clos.**

### N° 13 — le réseau : une vague de données au moteur d'aujourd'hui, écrite le 7 oct. avant de la lancer

**Décidé** — l'ordre du 6 oct. au soir (Théo : « *Ok, alors on testera
tout ça dans l'ordre recommandé* »), après le n° 12 : « le réseau — des
données d'abord, qui tournent sur runners sans personne, puis la carte de
Théo pour l'entraînement ; la largeur et les seaux de roi une fois
l'inférence plus rapide ».

**Pourquoi des données neuves.** Toutes celles du dépôt ont été écrites le
29 sept. par le moteur de `81e2753` : le premier réseau, N0, et la recherche
d'alors. Le levier qui a le plus rapporté au n° 7 est l'étiqueteur — des
étiquettes du réseau au lieu de la faite main, **+115,74 ± 6,98** —, puis le
volume, **+50,09 ± 6,12** pour deux fois plus de positions. Depuis,
l'étiqueteur a changé deux fois : le réseau qui joue est N2L, +182 au-dessus
de N0 par la chaîne de ses marches, et la recherche a gagné ~+190 contre son
jumeau à `8+0,08` — B8, le n° 9, C41, la composition du n° 12.
<span>Inférence, confiance faible</span> : à 5 000 nœuds par coup, ces gains
ne valent pas leur Elo à la pendule ; mais l'écart d'étiqueteur est du même
ordre que celui qui rapportait +116, et la vague achète de quoi le mesurer.

**La recette, inchangée hors l'étiqueteur et le binaire** :
`nnue-datagen.yml` sur `main`, `<embedded>` (N2L), 5 000 nœuds par coup,
graine « auto », un fil par processeur logique, 330 minutes. **Le binaire
AVX2**, l'entrée `cpu`, `x86-64-v3` par défaut depuis ce changement : il
écrit les mêmes parties que le binaire de base, à l'octet — 40 parties,
3 970 positions, un fil, les deux fichiers de même sha256 —, et × 1,21 plus
vite sur une paire dans le conteneur.

**D'abord une sonde de 20 minutes** : le générateur, l'étiqueteur et la
recherche ont changé depuis la dernière vague. *Attendu, écrit avant* —
<span>inférence, confiance faible</span> :
- **positions par seconde et par runner : 1 500 à 2 500**, ~1 800 sur un
  EPYC 7763 — 1 477 à 1 501 la dernière fois sur ce modèle, × 1,2 du
  binaire ; le coût du nœud ne change pas, à réseau de même taille ;
- **parties écartées : 7 à 12 %** — 7,4 % avec N0 ; le filtre d'ouverture se
  lit en unités du réseau, et l'échelle de N2L est plus large (pente 2,60
  contre 2,24 en place) ;
- **nulles : 25 à 35 %** — 25,8 % avec N0 ; un joueur plus fort en fait
  davantage.

Hors fourchette, on diagnostique avant de lancer la vague.

**Puis la vague : huit jobs de 330 minutes**, la taille de la dernière. À
volume égal, un réseau entraîné sur elle se compare à N2 — même taille,
même recette — et n'en diffère que par l'étiqueteur. *Attendu, écrit
avant* : **240 à 340 M de positions**, ~285 M. Huit et pas plus : le
workflow s'impose quelques jobs à la fois, et un second volume se décidera
à la séance, si les seaux de roi en demandent.

**La sonde, RELEVÉE à 15 h 00 — dans l'attendu, sur ses trois chiffres.**
Run 37622274982, 20 minutes sur un Xeon Platinum 8573C, quatre fils,
`x86-64-v3`, `evaluation=reseau-embarque` :

| | aujourd'hui | la vague du 29 sept., même processeur | attendu, écrit avant |
|---|---|---|---|
| positions par seconde | **1 641** | 1 624 ; 1 774 à sa sonde | 1 500 à 2 500 |
| parties écartées | **9,7 %** (1 680 sur 17 301) | 7,4 % | 7 à 12 % |
| nulles | **27,5 %** | 25,8 % | 25 à 35 % |

- **le résidu, nommé** : sur le même processeur, le débit vaut × 0,93 à
  × 1,01 celui du 29 sept., quand le binaire AVX2 promettait × 1,2. Mesuré
  dans le conteneur, quatre fils, 120 parties, binaires de base des deux
  côtés : **le générateur d'aujourd'hui écrit × 0,72 des positions par
  seconde de celui de `81e2753`** — 1 570 contre 2 124 à 2 245, deux
  paires. **La table n'y est pour rien** : passée de 16 à 64 Mio le
  30 sept. (C30), remise à 16 dans une copie jetable, elle rend le même
  débit au bruit près (1 439 et 1 628 contre 1 433 et 1 481). Les parties
  diffèrent — 107,5 positions par partie contre 117 —, et la recherche
  d'aujourd'hui coûte peut-être davantage par nœud au réseau : ni l'un ni
  l'autre n'est mesuré. Le binaire AVX2, lui, rapporte bien — × 1,13 à
  × 1,16 à quatre fils dans le conteneur, mêmes parties ;
- **ce qui ne change pas** : les données sont les mêmes à débit près, et la
  vague se lance. Son volume tombera au bas de son attendu — ~1 500
  positions par seconde sur un EPYC 7763, soit ~30 M par job, ~240 M pour
  huit.

**La vague, lancée à 15 h 03** : huit jobs de 330 minutes, le générateur
de `main` à `0e67f71`, les entrées par défaut — `<embedded>`, 5 000 nœuds,
graine « auto », `x86-64-v3` : **37625421881, 37625430114, 37625438110,
37625443145, 37625448710, 37625456368, 37625461638 et 37625467887**. Fin
attendue vers 20 h 45.

**Ce que la vague ne décide pas : l'entraînement.** La séance sur la carte
de Théo — les réseaux à entraîner, leurs attendus, le critère de leurs
matchs — s'écrit à la relève de la vague, avant la séance.

**La vague, RELEVÉE le 12 oct. — dans l'attendu, à sept jobs sur huit.**
Les sept succès ont fini le 7 oct. à 20 h 33 ; chaque résumé nomme
`0e67f71`, `x86-64-v3` et `evaluation=reseau-embarque` :

| run | processeur | parties | écartées | positions | gardées par le filtre | positions/s | artefact |
|---|---|---|---|---|---|---|---|
| 37625430114 | EPYC 9V74 | 350 201 | 33 137 | 39 735 092 | 26 114 143 | 2 007 | 144,6 Mo |
| 37625438110 | EPYC 7763 | 262 414 | 24 649 | 29 828 925 | 19 608 724 | 1 506 | 108,5 Mo |
| 37625443145 | Xeon Platinum 8573C | 256 492 | 24 081 | 29 147 076 | 19 160 455 | 1 472 | 106,0 Mo |
| 37625448710 | EPYC 7763 | 261 559 | 24 699 | 29 713 727 | 19 547 431 | 1 501 | 108,1 Mo |
| 37625456368 | EPYC 9V45 | 460 083 | 43 473 | 52 191 732 | 34 297 887 | 2 636 | 189,9 Mo |
| 37625461638 | EPYC 9V74 | 350 827 | 33 266 | 39 829 823 | 26 178 734 | 2 012 | 144,9 Mo |
| 37625467887 | EPYC 9V45 | 446 950 | 42 352 | 50 733 896 | 33 340 095 | 2 562 | 184,6 Mo |

- **le huitième, 37625421881, a perdu son runner** à 19 h 27, après 4 h 25
  de génération : « *The hosted runner lost communication with the
  server* », lu dans les annotations du job ; l'étape « Générer » est restée
  « en cours », sans artefact, et son journal ne se télécharge pas (404).
  Une panne de runner, pas du générateur : les sept autres, même commit,
  mêmes entrées, ont fini. **Pas relancé** — les sept tiennent l'attendu, et
  la comparaison à volume égal n'en prend que six (paragraphe suivant) ;
- **2 388 526 parties, 271 180 271 positions** — dans l'attendu (240 à
  340 M) à sept jobs sur huit, et au-dessus des ~240 M que la sonde
  annonçait pour huit : elle se lisait sur un EPYC 7763, et quatre runners
  sur sept étaient des EPYC 9V74 et 9V45, à 2 007 – 2 636 positions par
  seconde. 178 247 469 gardées par le filtre, 65,7 % ;
- **par processeur, la vague se prévoit par la précédente** : EPYC 7763 à
  1 501 et 1 506 positions par seconde (1 477 à 1 501 le 29 sept.), EPYC
  9V74 à 2 007 et 2 012 (2 030), Xeon 8573C à 1 472 (1 624) ; l'EPYC 9V45,
  neuf dans ces tables, à 2 636 et 2 562. Le résidu de la sonde se
  confirme : × 0,91 à × 1,01 le débit du 29 sept. sur les mêmes modèles,
  quand le binaire AVX2 seul promettait × 1,2 ;
- **la composition, dans l'attendu sur ses deux chiffres** : 9,45 % de
  parties écartées (7 à 12 % ; 7,07 % le 29 sept.), 27,09 % de nulles (25 à
  35 % ; 26,15 %) — d'un job à l'autre à 0,2 point près, 9,39 à 9,48 % et
  27,03 à 27,21 %. 113,5 demi-coups par partie (117,6) ; les noirs gagnent
  50,6 % des parties décisives, comme aux deux vagues d'avant ;
- 1 120 Mio sur disque, **987 Mo d'artefacts**, expirant le **5 janv. 2027
  à 13 h 02 UTC** (lu à l'API : `expires_at`) ; ceux du 29 sept., le
  28 déc. 2026 ;
- pour les regénérer, K = parties + écartées, dans l'ordre du tableau :
  383 338, 287 063, 280 573, 286 258, 503 556, 384 093 et 489 302.

**À volume égal, six jobs — le filtre le dit.** L'entraîneur ne voit que les
positions que garde le filtre par défaut de `viriformat` :
`ViriFilter::Builtin(Filter::default())` dans `tools/nnue-train`, le filtre
même que compte `retenues_filtre_defaut` dans le résumé. N2 en a vu
**158 444 563**. Les sept jobs en gardent 178,2 M, **+12,5 %** ; six, sans
37625443145, **159 087 014 — +0,4 %**. Des runners plus rapides et une part
gardée plus haute — 65,7 % contre 63,5 % — font tenir dans six jobs le volume
de huit. Un réseau entraîné sur ces six
ne diffère donc de N2 que par l'étiqueteur, à 0,4 % de volume près ; le
septième reste pour un second volume, s'il se décide.

**La séance sur la carte de Théo — deux réseaux, écrite à la relève, le
12 oct.** Le plan l'annonçait : un réseau de la taille de N2, entraîné par
sa recette sur la vague neuve, ne diffère de N2 que par l'étiqueteur. Mais
le réseau qui joue est N2L — N2, puis les données de Leela. D'où deux
réseaux :
- **N4 — la vague neuve seule**, 128 unités, 40 superlots, depuis zéro :
  mesuré contre **N2**, il isole l'étiqueteur ;
- **N4L — N4, puis Leela**, la recette de N2L au caractère près : mesuré
  contre **N2L**, il isole l'étiqueteur sous l'étage de Leela, et c'est lui
  qui peut remplacer le réseau qui joue.

**Ce qui n'y est pas, et pourquoi.** Les deux vagues ensemble, 520 M : leurs
étiqueteurs diffèrent, et un mélange ne mesure que lui-même ; le volume se
mesure à un seul étiqueteur, et le plan le lie aux seaux de roi. La largeur
et les seaux de roi : l'ordre du 6 oct. les met après une inférence plus
rapide.

**Vérifié ici avant de l'écrire** : à la tête de la branche qui porte cette
séance, `tools/nnue-train` compile avec `--locked` et passe ses six tests —
contre le runtime factice de bullet, donc sans rien dire de CUDA. Le
programme n'a pas changé depuis la séance du levier 4 ; seul le moteur dont
il lit les constantes a avancé. Chaque bloc se colle dans le MÊME terminal,
dans l'ordre :

0. **le dépôt à jour, et le fichier de Leela** :
   ```sh
   cd ~/chess && git status
   git fetch origin && git switch main && git pull --ff-only
   git log -1 --format='%h %cd'
   DONNEES=~/leela
   find "$DONNEES" -name '*.binpack' -exec ls -l {} +
   ```
   — `git log` doit dater du 12 oct. 2026 ou d'après. `find` doit montrer
   le binpack de la séance du levier 4, **14 366 468 016 octets** ; s'il est
   dans un sous-dossier, `DONNEES` désigne ce sous-dossier. Des fichiers
   « modifiés », un `--ff-only` qui refuse : s'arrêter et le dire. **Le
   binpack absent** : le retélécharger et l'extraire — l'étape 2 de la
   séance du levier 4, telle quelle ;
1. **CUDA dans ce terminal** — le bloc « CUDA dans ce terminal » de la
   séance d'entraînement du n° 7, tel quel : les trois bibliothèques du
   toolkit 13.2 doivent s'afficher ;
2. **les données** — six archives, **avant le 5 janv. 2027 à 13 h 02 UTC**,
   depuis un navigateur connecté à GitHub — un artefact ne se télécharge pas
   anonymement. Chacune s'enregistre sous `nnue-<run>.zip`, 881 Mo en tout :
   - [nnue-37625430114](https://github.com/theodubus/chess/actions/runs/37625430114/artifacts/11503362865), 144,6 Mo
   - [nnue-37625438110](https://github.com/theodubus/chess/actions/runs/37625438110/artifacts/11503068245), 108,5 Mo
   - [nnue-37625448710](https://github.com/theodubus/chess/actions/runs/37625448710/artifacts/11502793336), 108,1 Mo
   - [nnue-37625456368](https://github.com/theodubus/chess/actions/runs/37625456368/artifacts/11502379657), 189,9 Mo
   - [nnue-37625461638](https://github.com/theodubus/chess/actions/runs/37625461638/artifacts/11504040955), 144,9 Mo
   - [nnue-37625467887](https://github.com/theodubus/chess/actions/runs/37625467887/artifacts/11502808364), 184,6 Mo

   Puis chacune dans son propre dossier, hors du dépôt — la boucle et le
   `mkdir` pour les raisons de la séance du n° 7 :
   ```sh
   DL=$(xdg-user-dir DOWNLOAD); echo "$DL"
   mkdir -p ~/nnue-vague3
   for r in 37625430114 37625438110 37625448710 \
            37625456368 37625461638 37625467887; do
     unzip -o "$DL/nnue-$r.zip" -d ~/nnue-vague3/$r
   done
   ls ~/nnue-vague3/*/*.vf | wc -l
   ```
   — **24** : quatre `.vf` par dossier, ~1 000 Mio. Avec `gh` connecté, la
   même boucle télécharge et décompresse en une ligne :
   `gh run download $r -R theodubus/chess -n nnue-$r -D ~/nnue-vague3/$r` ;
3. **N4** — les six, 128 unités, depuis zéro :
   ```sh
   cd ~/chess/tools/nnue-train
   cargo run --release --features cuda -- --attendu 2132034:242033195 --sortie n4 \
     ~/nnue-vague3/* 2>&1 | tee n4.sortie.txt
   ```
   → `RÉSEAU PRÊT : n4/shallowred-768x128-40/quantised.bin`. L'attendu est
   exact : un écart arrête tout avant d'entraîner ;
4. **N4L** — N4, puis Leela :
   ```sh
   cargo run --release --features cuda -- --depuis n4/shallowred-768x128-40 \
     --sortie n4l "$DONNEES" 2>&1 | tee n4l.sortie.txt
   ```
   → `RÉSEAU PRÊT : n4l/shallowred-768x128-40/quantised.bin`. **Critère,
   écrit avant** : la ligne `échantillon : …` doit redire **échelle ajustée
   282.1** — le même fichier, le même échantillon que le 2 oct. Un autre
   nombre dit un autre fichier : s'arrêter et m'envoyer la ligne ;
5. **rapporter**, sur une branche `reseau/n13` :
   ```sh
   cd ~/chess && git switch -c reseau/n13
   for n in n4 n4l; do
     d=tools/nnue-train/$n/shallowred-768x128-40
     cp $d/quantised.bin reseaux/$n-768x128-40.bin
     cp $d/log.txt reseaux/$n-768x128-40.log.txt
     cp tools/nnue-train/$n.sortie.txt reseaux/$n-768x128-40.sortie.txt
   done
   git add reseaux/n4-* reseaux/n4l-*
   git commit -m "Réseaux NNUE du n° 13 : N4 et N4L, la vague au moteur du 7 oct."
   git push -u origin reseau/n13
   ```
   **Garder les dossiers `n4/` et `n4l/`**, `~/nnue-vague3` et le binpack :
   un ré-entraînement de plus en repartirait.

*Durée* — <span>inférence, confiance moyenne</span> : ~11 minutes par
réseau — N2 11 min 05 s, N2L 11 min 34 s ; les positions vues ne dépendent
pas du volume —, trois quarts d'heure en tout, téléchargement et compilation
compris. Un `ÉCHEC — …` à n'importe quel temps arrête tout, et son message
suffit à le diagnostiquer.

**Ce qui suit, écrit avant** :
- **les contrôles du programme** : chaque réseau relu exactement, puis
  confronté à son entraîneur sous le critère de toujours — écart médian
  ≤ 15, maximal ≤ 50. La perte finale de N4L se compare à celle de N2L,
  0,05815 — mêmes données, mêmes superlots ; *une perte ne dit pas la
  force*, elle dit seulement qu'un entraînement n'a pas déraillé ;
- **la sonde de B8 sur chacun**, le protocole du 2 oct. — 40 parties du
  réseau contre lui-même à `8+0,08`, la moyenne géométrique des facteurs
  delta et aspiration : **dans 1,68 à 2,80, le réseau se mesure au facteur
  de `main`, 2,24** ; hors de cette plage, le facteur se règle d'abord. La
  rustine (`tools/attic/b8-sonde-marges.patch`) ne s'applique plus sur
  `main` : elle se rebase d'abord ;
- **les matchs : quatre jobs de 3 000 parties par comparaison**, `8+0,08`,
  le livre de 15 000, le binaire AVX2 des deux côtés, graine « auto »
  chacun. **N4L contre N2L** : le candidat est le `main` du jour plus UN
  commit qui ne change que le réseau embarqué — le chemin d'`include_bytes!`
  et la confrontation recopiée dans le test —, la référence ce même `main`.
  **N4 contre N2** : de même, et la référence porte elle aussi un commit,
  qui embarque N2 avec la confrontation de `reseaux/n2-768x128-40.sortie.txt`.
  Les commits sont révoqués aussitôt ;
- **critère, écrit avant** — **N4L remplace N2L si la borne basse de
  l'intervalle mis en commun contre N2L est au-dessus de zéro** ; sa
  confrontation entre alors dans le test du moteur, `CLAUDE.md` dit le
  réseau qui joue, et la mention d'attribution de l'ODbL reste dans
  `README.md` — N4L a appris sur les données de Leela. **N4 contre N2 ne
  décide rien** : il chiffre l'étiqueteur, donc ce que vaut une vague au
  moteur du jour à chaque marche du moteur ;
- **attendus** — <span>inférence, confiance faible</span> : **N4 contre N2,
  0 à +60, ~+25** — la seule marche d'étiqueteur mesurée, de la faite main
  à N0, a rendu +116 pour un étiqueteur ~+330 plus fort à la pendule ;
  celle-ci est d'un ordre voisin à la pendule — le réseau +182 par la chaîne
  de ses marches, la recherche ~+190 contre son jumeau —, moindre à 5 000
  nœuds par coup, et 128 unités en bornent déjà la perte. **N4L contre N2L,
  −10 à +30, ~+8** — l'étage de Leela domine : N2L partait plus bas que L0
  et arrivait à la même perte, et ne le devançait que de +6,4 ± 8,8, la
  différence de leurs deux matchs contre N2 ;
- **ce que dirait chaque issue, écrit avant** : N4 gagne et N4L non —
  l'étage de Leela absorbe l'étiqueteur, et le levier suivant est de son
  côté ; N4 ne gagne pas — l'étiqueteur a cessé de payer à 5 000 nœuds, et
  une prochaine vague se décide par le volume ou par le budget de nœuds,
  plus par la marche du moteur.

**La séance, RELEVÉE le 12 oct. à 22 h 10 — les deux réseaux tiennent
leurs contrôles.** Poussés par Théo sur `reseau/n13` (`ce0557d`), sur la
RTX 3050 :

| | relus, parties : positions | confrontation, médian / maximal (admis 15 / 50) | entraînement | perte moyenne au 1ᵉʳ, 10ᵉ, 20ᵉ, 40ᵉ superlot |
|---|---|---|---|---|
| **N4**, la vague neuve seule | 2 132 034 : 242 033 195 — **l'attendu exact** | **8 / 16** | 10 min 10 s | 0,0461 · 0,0425 · 0,0422 · 0,0423 |
| **N4L**, N4 puis Leela | le binpack — échelle ajustée **282.1**, le critère | **10 / 16** | 11 min 30 s | 0,0593 · 0,0589 · 0,0589 · 0,0581 |
| N2, pour mémoire | 2 121 130 : 249 458 187 | 4 / 8 | 11 min 05 s | 0,0463 · 0,0436 · 0,0436 · 0,0435 |
| N2L, pour mémoire | le même binpack, 282.1 | 4 / 9 | 11 min 34 s | 0,0598 · 0,0590 · 0,0589 · 0,0582 |

- **N4L finit à la perte de N2L** — 0,0581 contre 0,0582, mêmes données,
  mêmes superlots : l'étage de Leela efface la différence de départ, comme
  N2L et L0 le 2 oct. *Une perte ne dit pas la force* : les matchs le
  diront ;
- les pertes de N4 et de N2 ne se comparent pas — d'autres étiquettes ;
- la séance a duré ce que l'attendu disait, ~11 minutes par réseau.

**La sonde de B8 sur N4 et N4L — écrite le 12 oct. à 22 h 11, avant de la
lancer.** Le protocole du 2 oct., sur le code d'aujourd'hui : la rustine
rebasée sur `main` à `ce3798f` — un conflit, dans la futilité inverse, dont
l'évaluation statique passe désormais par un cache —, 40 parties de chaque
réseau contre lui-même à `8+0,08`, `-srand 20260930`, le livre du dépôt —
de 15 000 ouvertures désormais. **La faite main se rejoue elle aussi**, et
**N2L avec elle, en témoin** : depuis le 2 oct., la recherche a changé —
le n° 9, C41, le n° 12 —, et les taux de la faite main d'alors ne
décrivent plus l'arbre d'aujourd'hui ; N2L dit ce que ce changement fait
au facteur d'un réseau déjà mesuré. **Règle, inchangée** : la moyenne
géométrique des facteurs delta et aspiration ; **dans 1,68 à 2,80, le
réseau se mesure au facteur de `main`, 2,24** ; hors de cette plage, le
facteur se règle d'abord. *Attendu* — <span>inférence, confiance
faible</span> : N4L près de N2L, **2,4 à 2,8** — le même étage de Leela,
la même échelle d'entraînement ; N4 près de N2, **2,0 à 2,6** — ses
étiquettes viennent d'un moteur qui joue N2L, un peu plus tranchées que
celles de N0 ; N2L témoin, **2,3 à 2,9** — 2,60 le 2 oct., l'arbre a
changé. Hors de la plage, ce serait le réseau témoin d'abord qu'il faudrait
regarder : un témoin qui sort dit que c'est l'arbre qui a bougé, pas le
réseau neuf.

**La sonde, RELEVÉE le 12 oct. à 22 h 45** — 40 parties par réseau, finies
entre 22 h 12 et 22 h 32, zéro perte au temps, zéro coup illégal ; un
« PV continues after fifty-move rule » côté N2L, la nature connue depuis
C31. Le binaire sondé rend le banc de `main` au nœud près (70 452). La
faite main, rejouée sur le même code : 0,40 % d'élagages delta fautifs,
4,1 % d'itérations hors de la première fenêtre.

| réseau | facteur delta | facteur aspiration | moyenne géométrique | attendu, écrit avant |
|---|---|---|---|---|
| N2L, le témoin | × 2,9 | × 2,00 | **2,41** | 2,3 à 2,9 — 2,60 le 2 oct. |
| **N4** | × 3,2 | × 2,40 | **2,77** | 2,0 à 2,6 — **manqué par le haut** |
| **N4L** | × 2,8 | × 2,20 | **2,48** | 2,4 à 2,8 |

- **Par la règle, les trois dans la plage — 1,68 à 2,80 : chaque réseau
  se mesure au facteur de `main`, 2,24**, et son candidat ne change que le
  réseau. N4 y entre de justesse ;
- **le témoin bouge peu** : 2,60 le 2 oct., 2,41 sur l'arbre
  d'aujourd'hui, l'élagage delta un cran plus haut (× 2,9 contre × 2,6),
  l'aspiration plus bas (× 2,0 contre × 2,6) ;
- **N4 porte des nombres plus grands que N2L et N4L** : son élagage delta
  se trompe 3,8 % des fois à × 2,2, contre 2,9 % et 1,6 % — ses étiquettes,
  venues d'un moteur qui joue N2L, sont plus tranchées que ne le disait
  l'attendu. L'étage de Leela les ramène à l'échelle de N2L ;
- *la grille est grossière* : le facteur delta repose sur une poignée de
  captures fautives — 0,40 % de ~1 000 élagages de la faite main —, et
  saute d'un dixième pour une capture. C'est la raison de la plage de
  ± 25 %, écrite le 1er oct.

**Les candidats, écrits le 12 oct.** — chacun ne change que
`engine/src/nnue.rs` : le chemin d'`include_bytes!` et la confrontation de
son entraînement recopiée dans le test, `verify.sh --rapide` vert à chaque
état :
- **N4L** : `06b0ed2`, révoqué par `caadf6d`, contre son parent `017068c` —
  le code de `main` au bit près, N2L embarqué ;
- **N4** : `5a425a8`, révoqué par `25df292`, contre **`827b9c1`**, qui
  embarque N2 sur le même code (révoqué par `e05daab`).

**Les matchs** : quatre jobs de 3 000 parties par comparaison, `8+0,08`,
graine « auto » chacun, le binaire AVX2 des deux côtés — le critère et les
attendus sont ceux de « Ce qui suit, écrit avant ».

#### N° 13 — VERDICT, 13 oct. 2026 : N4L +14,08 ± 3,74 Elo à `8+0,08` contre N2L — EMBARQUÉ ; N4 +46,98 ± 4,16 contre N2

Huit matchs lancés à 22 h 45 le 12 oct., graines distinctes, le binaire
AVX2 des deux côtés, zéro perte au temps, zéro coup illégal. Les quatre de
N4L finis ENTIERS entre 4 h 08 et 4 h 18, 6,4 à 6,6 s par partie ; trois
de N4 entre 4 h 30 et 4 h 34, 6,9 s par partie — des parties plus
longues —, et le quatrième **coupé au plafond de 350 min à 2 980
parties**, son résumé écrit quand même. Un match à longueur fixe que
l'horloge coupe garde ses parties finies sans biais : l'arrêt ne dépend
pas des résultats.

| réseau | match | runner — bench, profondeur en 250 ms | Elo | pentanomial |
|---|---|---|---|---|
| N4L | 38306259367 | EPYC 9V74 — 2 597 459 n/s, 14 | +20,75 ± 7,20 | 44, 214, 836, 331, 75 |
| N4L | 38306262669 | EPYC 7763 — 2 043 384 n/s, 14 | +8,57 ± 7,44 | 56, 262, 806, 304, 72 |
| N4L | 38306266210 | EPYC 7763 — 1 981 385 n/s, 14 | +19,83 ± 7,62 | 45, 259, 766, 340, 90 |
| N4L | 38306270316 | EPYC 9V74 — 2 027 295 n/s, 14 | +7,18 ± 7,65 | 60, 279, 779, 303, 79 |
| **N4L contre N2L** | **en commun** | homogènes, p = 0,055 | **+14,08 ± 3,74** | 205, 1 014, 3 187, 1 278, 316 |
| N4 | 38306273760 | EPYC 9V45 — 3 136 741 n/s, 15 — **coupé à 2 980** | +42,77 ± 8,05 | 34, 218, 731, 363, 144 |
| N4 | 38306278679 | EPYC 7763 — 1 820 839 n/s, 14 | +53,46 ± 8,57 | 50, 179, 726, 353, 192 |
| N4 | 38306281708 | EPYC 9V74 — 2 040 328 n/s, 14 | +45,78 ± 8,22 | 47, 199, 717, 388, 149 |
| N4 | 38306285057 | Xeon 8370C — 1 556 071 n/s, 14 | +45,89 ± 8,46 | 48, 214, 701, 370, 167 |
| **N4 contre N2** | **en commun** | homogènes, p = 0,282 | **+46,98 ± 4,16** | 179, 810, 2 875, 1 474, 652 |

- **Par le critère, écrit avant** : la borne basse commune de N4L contre
  N2L, +10,3, est au-dessus de zéro — **N4L remplace N2L**. `eac1132`
  révoque la révocation `caadf6d` : `main` embarque
  `reseaux/n4l-768x128-40.bin`, la confrontation de son entraînement dans
  le test du moteur, banc inchangé — 70 452 à la profondeur 7, la faite
  main n'a pas bougé. Le facteur des marges reste 2,24 : la sonde rend
  2,48, dans la plage.
- **Les deux attendus tiennent, au-dessus de leur centre** : N4L −10 à
  +30, ~+8 ; N4 0 à +60, ~+25 — mesuré près du haut. **L'étiqueteur paie
  toujours** : à 5 000 nœuds par coup, la vague au moteur du 7 oct. vaut
  +47 sur celle du 29 sept. La raison qui centrait l'attendu bas —
  « moindre à 5 000 nœuds par coup » — ne tenait pas.
- **Aucune des deux issues écrites avant** : elles disaient « N4 gagne et
  N4L non » ou « N4 ne gagne pas » ; les deux gagnent. **L'étage de Leela
  absorbe une part de l'étiqueteur, pas tout** : +14 en survivent sur +47,
  ~30 % au point.
- **Et la chaîne pose une question que le plan ne posait pas.** N4 contre
  N2 +46,98, N4L contre N2L +14,08, N2L contre N2 +16,40 (2 oct.) : d'où
  **N4 contre N4L ≈ +16,5 ± 8,4**, borne basse au-dessus de zéro. *Une
  chaîne n'est pas une mesure* : son troisième maillon date d'un autre
  moteur — avant le n° 9, C41 et le n° 12 —, et l'Elo ne se compose pas
  exactement d'un adversaire à l'autre. Mais elle dit que l'étage de Leela
  pourrait désormais COÛTER au-dessus de nos meilleures données, et seul
  un match direct le tranche : **N4 contre N4L se mesure**, écrit
  ci-dessous avant de lancer.
- **L'homogénéité de N4L passe de justesse** — p = 0,055 pour un seuil de
  0,0455 : deux matchs vers +20, deux vers +8. **L'écart ne suit pas le
  runner** : un 9V74 et un 7763 de chaque côté, tous à la profondeur 14,
  et le plus rapide (2,60 M n/s) rend +20,75 quand le plus lent (1,98 M)
  rend +19,83. <span>Inférence, confiance moyenne : le hasard d'un tirage
  à quatre — à effet unique, un écart au moins pareil sort une fois sur
  dix-huit.</span>
- **Les avertissements** : « PV continues after… », 16 côté N4L et 11 côté
  N2L, 13 côté N4 et 17 côté N2, sur ~24 000 parties — la signature
  connue, à son taux (~1 pour 1 000).
- **`README.md` garde la mention d'attribution de l'ODbL** — N4L a appris
  sur les données de Leela — et `CLAUDE.md` dit le réseau qui joue.
- **Le balayage de mutation après la fusion — prédiction, écrite avant** :
  rien ne bouge. Le changement ne touche que le réseau embarqué et la
  confrontation recopiée dans le test ; l'inférence est la même, et le
  banc comme les tests de recherche évaluent à la main. `nnue.rs` 1,
  `search.rs` 48, `eval.rs` 102, **162 au total** — la prédiction du
  balayage hebdomadaire du 13 oct., qui, s'il part après la fusion,
  balaiera `main` avec N4L et tiendra lieu des deux. <span>Confiance
  moyenne : un test qui jouerait au réseau embarqué et compterait ses
  nœuds verrait le changement — `verify.sh` n'en a fait tomber aucun.</span>
- **Ce qui reste, à mesurer** : <s>N4 contre N4L</s> **relevé : N4
  joue** (ci-dessous) ; le facteur des marges du réseau qui joue — N4
  2,77, au bord de la plage, 2,24 en place ; une série de C13 pour le
  situer sur l'échelle de Stockfish.

**N4 contre N4L — écrit le 13 oct. à 4 h 41, avant de lancer.**
- **le match** : `5a425a8` (N4) contre `06b0ed2` (N4L) — le même code au
  bit près, seul le réseau diffère ; quatre jobs de **2 800 parties** —
  3 000 ne tiennent plus quand une partie dure 6,9 s, un job vient d'être
  coupé —, `8+0,08`, graine « auto » chacun, le binaire AVX2 des deux
  côtés, le livre de 15 000 ;
- **critère, écrit avant** — **N4 remplace N4L si la borne basse de
  l'intervalle mis en commun est au-dessus de zéro** ; sinon N4L reste.
  S'il remplace, sa confrontation entre dans le test, `CLAUDE.md` dit le
  réseau qui joue, et la mention de l'ODbL dans `README.md` devient
  historique — N4 n'a rien appris des données de Leela ;
- **attendu** — <span>inférence, confiance faible</span> : **−10 à +35,
  ~+12** — la chaîne dit +16,5 ± 8,4, ramené vers zéro parce que son
  maillon du 2 oct. est mesuré sur un autre moteur ;
- **ce que dirait chaque issue, écrit avant** : N4 gagne — sur nos
  meilleures données, l'étage de Leela coûte, et la vague suivante se joue
  sur notre volume et notre étiqueteur, Leela mêlé aux données plutôt que
  suivi, à mesurer ; ni gain ni perte démontrés — le maillon du 2 oct. a
  vieilli, N4L reste ; N4 perd — la chaîne trompait, l'étage de Leela aide
  toujours.

#### N° 13, N4 contre N4L — VERDICT, 13 oct. 2026 : +5,43 ± 4,23 Elo à `8+0,08` — N4 EMBARQUÉ

Quatre matchs de 2 800 parties, lancés à 4 h 42, finis ENTIERS entre
9 h 43 et 9 h 45, 6,4 s par partie — 2 800 tenaient avec cinquante minutes
de marge —, graines distinctes, le binaire AVX2 des deux côtés, zéro perte
au temps, zéro coup illégal :

| match | runner — bench, profondeur en 250 ms | Elo | pentanomial |
|---|---|---|---|
| 38338147723 | EPYC 9V74 — 2 041 437 n/s, 15 | +6,95 ± 8,45 | 79, 245, 711, 271, 94 |
| 38338152332 | EPYC 7763 — 2 005 355 n/s, 15 | +2,61 ± 8,30 | 74, 261, 724, 252, 89 |
| 38338157031 | EPYC 7763 — 1 992 499 n/s, 15 | +5,83 ± 8,50 | 80, 252, 705, 267, 96 |
| 38338161432 | EPYC 7763 — 1 889 381 n/s, 15 | +6,33 ± 8,60 | 83, 249, 704, 262, 102 |
| **en commun** | homogènes, p = 0,890 | **+5,43 ± 4,23** | 316, 1 007, 2 844, 1 052, 381 |

- **Par le critère, écrit avant** : la borne basse commune, +1,2, est
  au-dessus de zéro — **N4 remplace N4L**. `ce57170` reprend
  `engine/src/nnue.rs` tel quel du candidat `5a425a8` — le seul écart avec
  `main` était le réseau et sa confrontation : `main` embarque
  `reseaux/n4-768x128-40.bin`, banc inchangé, 70 452 à la profondeur 7.
  Le facteur des marges reste 2,24 : N4 rend 2,77 à la sonde, dans la
  plage, de justesse.
- **L'attendu tient, sous son centre** : −10 à +35, ~+12. **La chaîne
  avait le signe, pas l'amplitude** : +16,5 ± 8,4 prédits, +5,4 ± 4,2
  mesurés ; l'écart, 11 ± 9, n'est pas séparé de zéro. <span>Inférence,
  confiance faible — elle suppose l'Elo transitif d'un adversaire à
  l'autre : refermée par cette mesure, la chaîne donnerait à N2L ~+27 sur
  N2 sur le moteur d'aujourd'hui, contre +16 sur celui du 2 oct.</span>
- **L'issue est celle qu'on avait écrite pour ce cas** : sur nos
  meilleures données, l'étage de Leela coûte un peu — **au plus ~10 Elo,
  au moins ~1**. La vague suivante se joue donc sur notre volume et notre
  étiqueteur ; les données de Leela, si elles reviennent, se mêlent aux
  nôtres au lieu de les suivre — à mesurer, pas à supposer.
- **Les avertissements** : « PV continues after… », 16 côté N4 et 12 côté
  N4L sur 11 200 parties — la signature connue, à son taux.
- **La mention de l'ODbL devient historique, et reste** : N4 n'a rien
  appris des données de Leela, mais `reseaux/` garde N2L et N4L, qui en
  ont appris — `README.md` le dit dans « Remerciements ».
- **Le balayage de mutation après la fusion — prédiction, écrite avant** :
  162, rien ne bouge — `nnue.rs` 1, `search.rs` 48, `eval.rs` 102.
  L'échange N2L → N4L l'a vérifié sur `main` cette nuit : le balayage
  hebdomadaire (run 38353695818, `2d6dd05`) est tombé **exactement** sur
  162, `search.rs` allant au bout en 2 h 18 ; celui-ci ne change que le
  même fichier, de la même façon.
- **Ce qui reste, à mesurer** : le facteur des marges de N4 — 2,77, au
  bord de la plage où la règle le laisse à 2,24 : c'est le réseau où un
  réglage a le plus de chances de payer ; une série de C13 pour situer N4
  sur l'échelle de Stockfish.

### N° 15 à 19 — la chaîne du réseau : DÉCIDÉE le 13 oct. 2026

**La question de Théo, le 13 oct.** : reste-t-il de gros gains — les
meilleurs moteurs sont loin devant —, ou seulement du grattage à +1 à +5 ?
**La réponse, le même jour** : un gros gisement reste, le réseau, et il est de
structure, pas de réglage ; la recherche, elle, se gratte désormais.

**Le constat, avec ses sources** :
- **l'écart** : ~3 000 ± 33 sur l'échelle de Stockfish 16 (série C13 du
  7 oct.) ; Stockfish 16 vaut 3 632 ± 13 au CCRL 40/15, à quatre fils
  (Wikipedia, février 2024 — source secondaire). Conditions différentes :
  un ordre de grandeur, ~600, davantage si l'échelle écrase, ce qu'elle fait
  (section C13) ;
- **la recherche** : cinq écrans ; ProbCut, l'historique des captures, le
  multi-cut, le razoring, l'élagage par l'historique fermés à l'écran, la
  correction et la double extension sans effet en match. Il reste du +1 à
  +10 par technique ;
- **le réseau** : `(768 → 128) × 2 → 1`, sans seaux, 242 M positions. Chaque
  marche a payé — +330, +116, +50, +16, +47 — et rien ne dit qu'elles
  saturent. **N3, deux fois plus large, a perdu −29 par la vitesse seule**
  (× 0,785 n/s) : l'inférence est le verrou de la largeur. Elle est
  scalaire, laissée à la vectorisation du compilateur, et le produit de
  sortie calcule chaque terme en `i32`. Les moteurs forts portent des seaux
  de roi et des seaux de sortie selon le matériel (sources secondaires :
  talkchess, GaiaChess), des couches de 1 024 et plus et des milliards de
  positions (de mémoire, confiance moyenne). Gains publiés, auto-déclarés,
  d'autres moteurs : seaux de sortie +14, seaux de roi +20 à +80 ;
- **le réglage** : jamais fait ici, toutes les constantes posées à la main
  et mesurées une à une. Gains publiés : +30 à +134, ce dernier en
  auto-jeu, gonflé.

**L'ordre, décidé** :
1. **n° 15 — mesurer la part de l'inférence dans le temps d'un nœud** : elle
   chiffre ce qu'un SIMD rapporterait, et si la largeur coûte en calcul ou
   en mémoire ;
2. **n° 16 — le SIMD** : à **réexpliquer en détail à Théo avant de
   l'écrire** — il touche à la règle « pas d'`unsafe` » (`std::arch`, une
   crate SIMD sûre, ou `portable_simd` en nightly) ;
3. **n° 17 — les seaux de sortie et les seaux de roi, sur un réseau
   élargi** ;
4. **n° 18 — le volume de données** : ~8 à 10 vagues pour × 10, puis des
   entraînements plus longs sur la carte de Théo ;
5. **n° 19 — le réglage automatique (SPSA)**, le réseau stabilisé : les
   marges appartiennent au réseau (B8).

<span>Attendu d'ensemble — inférence, confiance faible : +100 à +300 pour les
n° 15 à 18, +15 à +50 pour le n° 19.</span>

**Ce qui tourne ne gêne pas** — vérifié le 13 oct. à 11 h 25 : le balayage
de mutation après N4 et la série C13 de N4 tournent sur des runners, sur des
commits figés ; le conteneur, où se mesure le temps, est libre.

**N° 15 — la part de l'inférence : protocole et attendu, écrits le 13 oct.
avant de mesurer.**
- **la méthode du doublement** (`d6-sonde-ordonnancement.patch`, l'ordre des
  coups pesé ainsi le 22 sept.) : refaire un calcul une seconde fois, à
  résultat identique et par `std::hint::black_box` pour que le compilateur
  ne l'efface pas — l'arbre ne bouge pas d'un nœud, et le surcoût de temps
  EST la part de ce calcul. Trois variantes de `main` à `0c33842` (N4), par
  la rustine `n15-sonde-inference.patch` : **`sortie`** — le produit de
  sortie d'`evaluate`, deux fois ; **`maj`** — la dérivation des
  accumulateurs d'`apply_move`, copie comprise, deux fois ; **`deux`** — les
  deux. Le binaire AVX2, celui qui joue ;
- **le régime qui joue** : un corpus de 20 parties de N4 contre lui-même à
  `8+0,08` dans le conteneur, en notation UCI, livre du dépôt,
  `-srand 20261013` ; chaque partie rejouée dans l'ordre, la table conservée
  d'un coup à l'autre, `ucinewgame` entre deux parties seulement, `go depth`
  fixe — choisie avant de mesurer pour ~30 s par passe. Le pilote refuse si
  un arbre diffère de `main` ;
- **vingt tours**, chacun passant les quatre binaires dans un ordre qui
  tourne ; chaque variante se compare au `main` de son tour ; test des
  signes ;
- **N3 sur le code d'aujourd'hui** (n° 15 b) : `HIDDEN` à 256 et
  `n3-768x256-40.bin`, ses nœuds par seconde contre ceux de `main` sur le
  même corpus — les arbres diffèrent, d'où les n/s, comme le 30 sept. ;
- **attendu** — <span>inférence, confiance faible</span> : **la part du
  réseau, 10 à 30 %, ~18 %** — N3 à × 0,785, si le coût suit la largeur,
  dirait 27 % sur le binaire de base, et l'AVX2 a d'abord accéléré le
  réseau ; **la sortie plus lourde que la dérivation**, ~60/40 — elle
  traverse 256 termes en `i32` à chaque évaluation ; **additivité** : `deux`
  ≈ `sortie` + `maj` à 2 points près ; **N3** : sa lenteur suit le calcul,
  × 1/(1 + part) — ses poids, 393 Kio, tiennent comme ceux de N4 (197 Kio)
  dans le Mio de L2 par cœur de ce Xeon ;
- **ce que dirait chaque issue, écrit avant** : une part de 15 % et plus —
  le SIMD vaut seul +10 à +17 Elo par l'étalon (× 2 à × 4 sur la part) et,
  surtout, rouvre la largeur ; moins de 8 % — le SIMD rapporte peu seul, et
  si N3 reste lent, c'est la mémoire qui coûte, pas le calcul — le n° 16 se
  repense avant d'être réexpliqué ; une dérivation lourde — fondre la copie
  dans la mise à jour, du code portable, sans `unsafe`, viendrait d'abord.

**N° 15 — RELEVÉ le 13 oct. à 12 h 20 : le réseau pèse 16,8 ± 2,0 % du temps
d'un nœud, au centre de l'attendu ; et la largeur ne coûte que son calcul.**
Rustine `n15-sonde-inference.patch` (les trois variantes et le pilote
`tools/sonde-inference/rejeu.py`), corpus de 20 parties de N4 — 1 839
positions —, profondeur 10, 24 910 364 nœuds par passe, **arbres identiques
au nœud près sur les 80 passes**, ~23 s par passe, 1,09 M nœuds par seconde
dans le conteneur ; vingt tours en cinq tranches de quatre, chacune sous dix
minutes — une mesure longue ne survit pas au conteneur :

| variante — ce qui est fait deux fois | surcoût, moyenne des tours (IC 95 %) | plus lente | test des signes | attendu, écrit avant |
|---|---|---|---|---|
| `sortie` — le produit de sortie | **+10,0 ± 2,1 %** | 19/20 | p = 0,00004 | ~60 % de la part |
| `maj` — la dérivation des accumulateurs, copie comprise | **+7,6 ± 2,0 %** | 19/20 | p = 0,00004 | ~40 % |
| `deux` | **+16,8 ± 2,0 %** | 20/20 | p = 0,000002 | **10 à 30 %, ~18 %** |
| `sortie` + `maj` − `deux`, l'additivité | +0,8 ± 3,0 points | — | — | 0 à 2 points près |

| n° 15 b — N3 sur le code d'aujourd'hui, `HIDDEN` 256 | nœuds par seconde contre `main` | plus lent | test des signes | attendu, écrit avant |
|---|---|---|---|---|
| `n3-768x256-40.bin`, binaire AVX2, le même corpus | **× 0,887** (médiane de 10 tours) | 10/10 | p = 0,0020 | × 1/(1 + 0,168) = **× 0,856** si le coût suit le calcul |

- **La part est au centre de l'attendu, et ses deux moitiés aussi** : 60/40
  attendus, 57/43 mesurés ; elles s'additionnent.
- **La largeur ne coûte que son calcul, et un peu moins** : × 0,887 contre
  × 0,856 prédits par le seul calcul — aucun mur de mémoire ; des vecteurs
  plus longs s'emploient un peu mieux. Le 30 sept., N3 coûtait × 0,785 sur
  le binaire de base : l'AVX2 en a rendu la moitié. Par l'étalon, 256
  neurones coûtent aujourd'hui **~−19 Elo de vitesse**, contre ~−38 alors.
- **Ce que la mesure dit du n° 16, par l'issue écrite avant** : la part
  dépasse 15 % — un SIMD vaut seul de l'ordre de **+10 à +15 Elo**, borné
  par **+29** — un réseau infiniment rapide rendrait × 1,20 de vitesse,
  0,27 doublement. **Sa vraie valeur est ailleurs : il rend la largeur bon
  marché**, ce que le n° 17 demande.

**N° 16 — le SIMD, expliqué à Théo le 13 oct. avant d'écrire une ligne** —
sa demande : « *quand on viendra au simd il faudra mieux me reexpliquer et
détailler* ». **En attente de sa décision.**
- **ce que le réseau calcule** : à chaque coup joué dans l'arbre, il met à
  jour deux listes de 128 nombres — les accumulateurs, une par camp — en
  ajoutant et retirant les lignes de poids des pièces qui bougent (`maj`,
  7,6 % du temps) ; à chaque position évaluée, il borne chacun des 256
  nombres entre 0 et 255, l'élève au carré, le multiplie par son poids de
  sortie et somme le tout (`sortie`, 10,0 %) ;
- **ce qu'est le SIMD** : des instructions qui traitent seize nombres de
  16 bits d'un coup — les registres de 256 bits de l'AVX2. Le compilateur en
  produit déjà seul : c'est ce qu'a gagné le binaire AVX2 (× 1,235) ;
- **ce qu'il ne fait pas tout seul** : notre produit de sortie calcule chaque
  terme sur 32 bits, avec deux multiplications 32 bits — l'instruction la
  plus lente des deux familles. L'astuce que bullet et les moteurs forts
  emploient : multiplier sur 16 bits la valeur bornée par son poids
  (`vpmullw`), puis multiplier-additionner par paires le résultat par la
  valeur bornée (`vpmaddwd`) — moitié moins d'instructions, et plus rapides.
  **Sa condition** : le produit tient sur 16 bits, donc `|poids| ≤ 127`
  quand la valeur va jusqu'à 255. **Lu au source de bullet, au commit
  épinglé `10e7e82`** : l'optimiseur AdamW borne les poids à ±1,98, soit
  ±127 une fois quantifiés par 64 — **vérifié sur N2, N2L, N3, N4L et N4,
  tous entre −127 et +127**. Le chargeur le refuserait sinon, comme il
  refuse déjà un réseau qui pourrait déborder ;
- **quatre chemins en Rust** :
  - **A — écrire le code scalaire sous la forme que le vectoriseur
    reconnaît** : l'astuce écrite en Rust ordinaire, la copie fondue dans la
    mise à jour. **Ni `unsafe` ni dépendance**, aucune règle du dépôt ne
    bouge ; le compilateur peut ne pas suivre partout ;
  - **B — une crate de SIMD sûre** (`safe_arch`, `wide`) : les
    instructions choisies une à une ; l'`unsafe` vit dans la dépendance, pas
    dans notre code ; une dépendance de plus à auditer ;
  - **C — les intrinsèques de `std::arch`**, dans un module seul : le
    contrôle complet, et le choix de l'instruction à l'exécution ; **contre
    la règle « pas d'`unsafe` »**, qui demanderait une exception écrite —
    chaque bloc justifié, un test qui confronte le SIMD au scalaire bit à
    bit ;
  - **D — `std::simd`** : instable, il faudrait la chaîne nightly — écarté ;
- **pourquoi c'est sûr, quel que soit le chemin** : tout est en entiers, donc
  le résultat est EXACTEMENT celui d'aujourd'hui — même évaluation, même
  arbre. La preuve est celle des optimisations pures (`CLAUDE.md`) : nœuds
  identiques au rejeu, un test qui confronte la nouvelle voie à l'ancienne,
  la CI qui exige le même arbre sur les quatre systèmes, et le temps par le
  rejeu — **pas de match** : l'Elo suit de l'étalon, vérifié sur l'AVX2 ;
- **la recommandation** : **A d'abord** — il respecte toutes les règles, et
  s'il prend l'essentiel, on s'arrête là ; B ou C seulement si A reste loin,
  chiffres à l'appui, et sur décision de Théo ;
- **attendu de A** — <span>inférence, confiance faible</span> : la sortie de
  10 % à ~4 %, la dérivation de 7,6 % à ~5 % — **−7 à −9 % de temps par
  nœud, +11 à +15 Elo par l'étalon**.

**N° 16 — le chemin A, DÉCIDÉ le 13 oct. (Théo, « *Ok pour A* ») : protocole
écrit avant d'écrire le code.** Théo demande si « le compilateur ne suit pas
partout » se vérifie : **oui, de deux façons indépendantes**, et les deux
entrent dans la preuve.
- **le code** — `dot` écrit `c² · w` comme `(c · w) · c`, le produit
  `c · w` sur seize bits ; le chargeur refuse un poids de sortie au-delà de
  `i16::MAX / QA` = 128 en valeur absolue, la condition de l'astuce. La
  dérivation des accumulateurs fond la copie dans la mise à jour : un seul
  passage, `après = avant + a₀ + a₁ − r₀ − r₁`, les lignes absentes lues
  dans une ligne de zéros — **un seul chemin pour tous les coups**, sans
  copie de règle dans une branche que rien n'atteindrait (la leçon du
  12 oct.) ;
- **le code machine, lu** : `objdump` du binaire AVX2. **Avant**, la boucle
  du produit de sortie, dans `network_eval`, porte **32 `vpmulld`** — la
  multiplication 32 bits — et aucune `vpmullw`. **Attendu après : zéro
  `vpmulld`, des `vpmullw` et des `vpmaddwd`** dans la même fonction ;
- **l'exactitude** : tout est en entiers, le résultat ne change pas d'un
  bit. Les tests existants — l'incrément contre le recalcul sur chaque coup
  légal de positions variées, la sortie contre le calcul de référence de
  bullet, le réseau embarqué contre son entraîneur — passent tels quels ; un
  test confronte le nouveau produit à sa définition, en `i64`, jusqu'aux
  bornes ; un autre, le refus d'un poids de 129 et l'admission de 128 ;
- **l'arbre** : identique au nœud près au rejeu du n° 15 — le pilote refuse
  sinon —, et la CI exige le même arbre sur les quatre systèmes ;
- **le temps** : `tools/sonde-inference/rejeu.py` de la rustine du n° 15,
  `main` contre le chemin A, vingt tours, test des signes ;
- **le crible de mutation de `nnue.rs`** avant la fusion, prédiction écrite
  avec le code ;
- **critère, écrit avant** : fusion si l'arbre est identique, les tests
  verts et le temps plus court au test des signes — une optimisation pure ne
  passe pas par un match (`CLAUDE.md`). **Attendu**, celui du n° 16 : −7 à
  −9 % de temps par nœud au rejeu.

**N° 16, chemin A — RELEVÉ le 13 oct. à 14 h 15 : −14,4 ± 1,6 % de temps à
arbre identique, × 1,170 de vitesse, ~+24 Elo par l'étalon — le double de
l'attendu.** Commit `25f26ae` :
- **le code machine, lu** (`objdump`, binaire AVX2) :

  | fonction | instruction | `main` | chemin A |
  |---|---|---|---|
  | `network_eval` (la sortie) | `vpmulld` — multiplication 32 bits | 32 | **0** |
  | | `vpmullw` — multiplication 16 bits | 0 | **32** |
  | | `vpmaddwd` — multiplication-addition par paires | 32 | 32 |
  | `Network::apply_move` (la dérivation) | `vpaddw` / `vpsubw` | 16 / 16, une passe par pièce et une copie | **48 / 16, une seule passe par camp** |

  **Le compilateur a suivi partout**, ce que Théo demandait de vérifier ;
- **l'arbre** : identique au nœud près sur les 40 passes du rejeu
  (24 910 364 nœuds), et les tests — l'incrément contre le recalcul sur
  chaque coup légal, la sortie contre le calcul de référence, le réseau
  embarqué contre son entraîneur — passent tels quels ; deux tests neufs :
  le produit contre sa définition en `i64` sur 2 002 cas jusqu'aux bornes,
  et le refus d'un poids de sortie de ±129 quand ±128 passe ;
- **le temps**, `main` à `5b99eeb` contre le chemin A, vingt tours au rejeu
  du corpus du n° 15 : **plus rapide sur 20 tours sur 20, p = 0,000002,
  −14,4 ± 1,6 % de temps par passe** — × 1,170 de nœuds par seconde, 0,227
  doublement, **+21 à +27 Elo par l'étalon** (+107,7 par doublement) ;
- **l'attendu, −7 à −9 %, est manqué par le haut d'un facteur deux, et la
  cause est la méthode du n° 15** : le doublement refait le calcul sur des
  poids et un accumulateur déjà en cache — un coût marginal, plus bas que
  celui de la première exécution. *Il minore la part ; il ne la mesure pas*
  (`CLAUDE.md`, pièges de mesure). Le gain réel approche la part entière
  mesurée au doublement, 16,8 %, quand le chemin A ne devait en retirer
  qu'une moitié ;
- **la borne de la somme des poids de sortie devient une assertion à la
  compilation** : à 128 unités, la borne par poids l'implique —
  2 × 128 × 128 × 255² = 2 130 739 200 ≤ `i32::MAX` —, et la garder à
  l'exécution aurait laissé une branche que rien n'atteint, la leçon du
  12 oct. Un réseau plus large (n° 17) cessera de compiler à cette ligne, là
  où il faudra sommer autrement ;
- **le crible de mutation** du commit, run 38395814727 — *prédiction,
  écrite avant son relevé* : **rien ne bouge, 162** — `nnue.rs` 1, le même
  survivant équivalent du roque ; les mutants du produit et de la
  dérivation tombent sous l'incrément, la référence et la définition, ceux
  de la borne sous ±128 / ±129 ;
- **par le critère, écrit avant** : arbre identique, tests verts, temps plus
  court au test des signes — **fusion au crible vert**, sans match.

**Le crible du chemin A, RELEVÉ à 17 h 30 — vert, exactement la
prédiction** : run 38395814727, fini à 17 h 11, `search.rs` au bout ;
**162**, tous les fichiers à leur plafond. `nnue.rs` : 1 survivant, **le
même** — `>` en `>=` dans le côté du roque de `changes`, l'équivalent écrit
au plafond depuis le 26 sept. —, 80 attrapés, 9 inviables, 3 expirés. Les
mutants du produit sur seize bits, de la dérivation fondue et de la borne
par poids tombent tous. **Pas de balayage après la fusion** : `main` est
l'ancêtre de `25f26ae`, et rien sous `engine/` ni `.github/` ne change
entre ce commit et la tête fusionnée (`git diff`, vide) — le crible EST ce
balayage, sur le même arbre et les mêmes tests ; l'hebdomadaire du 20 oct.
le rejouera.

**La CI de la PR était rouge depuis son ouverture**, et je ne l'ai lue
qu'au moment de fusionner : le critère `rustines_attic.rs` attrapait
`n15-sonde-inference.patch`, que le chemin A empêche de s'appliquer — il
récrit `dot` et `apply_move`, précisément ce que la sonde double. Le
dispositif a tenu : rien n'a fusionné. La faute est de méthode —
`tools/verify.sh --rapide`, lancé avant chaque poussée, ne joue pas les
critères d'acceptation, et `CLAUDE.md` le dit : *vérifier par
`tools/verify.sh`*. La colonne de l'attic dit désormais **non**, avec la
raison ; la sonde se rejoue sur `0c33842`, et la porter attendra le n° 17,
où la part de l'inférence se remesure sur un réseau plus large.

**N° 17, étape 1 — la largeur débloquée, et ce qu'elle coûte après le
chemin A : protocole et attendu, écrits le 13 oct. à 18 h 05 avant le
code.** Le n° 17 met des seaux sur un réseau ÉLARGI ; or le chemin A a
borné la largeur à la compilation — `2 × HIDDEN × 128 × QA²` doit tenir
dans un `i32`, donc 128 unités au plus. Et la seule mesure du coût de la
largeur, N3 à × 0,887 (n° 15 b), date d'avant le chemin A.
- **le produit scalaire par tranches** : `dot` somme en `i32` des tranches
  de 256 termes — une tranche d'au plus `256 × 128 × QA²` = 2 130 739 200
  tient, et c'est cela que l'assertion à la compilation vérifie désormais —,
  puis les tranches et les deux camps en `i64`. **Aucune vérification à
  l'exécution** : la borne par poids suffit à toute largeur, et rien ne
  reste que les tests n'atteignent. À 128 unités, une tranche par camp :
  les mêmes entiers, donc **le même arbre au nœud près**, et un temps qui
  ne doit pas bouger ;
- **les preuves** : le banc et le rejeu du n° 15 au nœud près ; le code
  machine lu — `vpmullw` et `vpmaddwd` toujours là — ; le temps, `main`
  contre l'étape, au rejeu, vingt tours, test des signes ;
- **puis N3 sur ce code** — `HIDDEN` à 256 et `n3-768x256-40.bin`, ce que
  la compilation refusait —, ses nœuds par seconde contre ceux de N4 sur
  le même corpus, `--nps`, dix tours ;
- **attendu** — <span>inférence, confiance faible</span> : l'étape seule,
  **0 ± 1 %** de temps, le même arbre ; **N3 à × 0,90 à × 0,96, ~× 0,93**
  — le chemin A a retiré 14,4 % du temps, presque tout pris au réseau, et
  la largeur double ce qui en reste ; soit **~−11 Elo** de vitesse par
  l'étalon pour 256 unités, contre ~−19 avant le chemin A ;
- **critère, écrit avant** : l'étape entre dans `main` si l'arbre est
  identique, les tests verts et le temps PAS plus long au test des signes
  — elle ne promet aucun gain, elle lève un verrou ; le chiffre de N3 ne
  décide rien seul : il dit combien d'Elo de qualité un réseau de 256
  devra rendre pour payer sa vitesse, et donc quelle largeur la séance du
  n° 17 entraîne.

**N° 17, étape 1 — RELEVÉE le 13 oct. à 18 h 15 : le même arbre, le même
temps ; et N3 ne coûte plus que × 0,93, l'attendu au centre.**
- **l'arbre** : 24 910 364 nœuds par passe au rejeu du n° 15, ceux de
  `main` au nœud près — le pilote refuse sinon ;
- **le code machine** : 32 `vpmullw` et 32 `vpmaddwd` dans le binaire AVX2,
  autant qu'au chemin A ;
- **le temps** — `main` (le chemin A) contre l'étape, quatre tranches de
  cinq tours : plus lente sur **8 tours sur 20, p = 0,50** ; **−1,4 ± 2,4 %**
  en moyenne, −0,75 % en médiane. Dans l'attendu, 0 ± 1 % ; le critère —
  pas plus long au test des signes — tient ;
- **N3 sur ce code** (`HIDDEN` à 256, `n3-768x256-40.bin`, binaire AVX2,
  chargé — son évaluation n'est pas la faite main) contre N4, `--nps`, deux
  tranches de cinq tours : **× 0,93 de nœuds par seconde** (médiane des dix
  tours ; × 0,925 et × 0,951 par tranche), plus lent sur 9 tours sur 10,
  p = 0,021. **Au centre de l'attendu**, × 0,90 à × 0,96. Par l'étalon,
  **~−11 Elo de vitesse** pour 256 unités, contre ~−19 avant le chemin A ;
- **ce que cela dit de la largeur** : la doubler coûte ~7,4 % du temps d'un
  nœud — × 1/(1 + 0,074). Par la même règle, <span>inférence, confiance
  moyenne</span> : 384 unités ~× 0,87 (~−22 Elo), 512 ~× 0,82 (~−31). Un
  réseau de 256 doit rendre **plus de ~+11 Elo de qualité** pour payer ;
  N3 en rendait ~+9 en septembre, sur les données d'alors et sans seaux.
  La séance du n° 17 s'écrit donc autour de **256 unités**, avec et sans
  seaux, et un réseau de 128 à seaux pour séparer ce que paient les seaux
  de ce que paie la largeur.

**N° 17 — le plan de la séance, écrit le 13 oct. à 18 h 30, avant le code
des seaux.**

*Lu au source* — bullet `10e7e82`, `bulletformat` 1.8.0 :
- **les seaux de sortie** (`MaterialCount<N>`,
  `bullet_lib/src/game/outputs.rs`) : le seau vaut
  `(pièces sur l'échiquier − 2) / ⌈32 / N⌉` — à 8 seaux, `(n − 2) / 4`, de
  0 à 7 ; un jeu de poids de sortie par seau, le reste du réseau commun ;
- **les seaux de roi** (`ChessBucketsMirrored`,
  `bullet_lib/src/game/inputs/chess_buckets.rs`) : une disposition de 32
  cases — quatre colonnes, huit rangées —, étendue en miroir. Chaque camp,
  vu dans son propre repère (son roque en bas : `our_ksq`, et `opp_ksq`
  retourné de `^ 56`, `bulletformat`, `chess.rs`), choisit par la case de
  son roi un bloc de 768 entrées ; si ce roi est sur les colonnes e à h,
  chaque entrée a sa colonne retournée (`^ 7`). Le **factoriseur** — 768 ×
  largeur poids communs à tous les seaux — s'ajoute à chacun au moment
  d'écrire le fichier : le moteur n'en voit rien ;
- **le fichier** (`SavedFormat::transpose`,
  `crates/trainer/src/model/weights.rs`, et l'exemple
  `examples/progression/3_input_buckets.rs`) : les lignes de la couche
  cachée, seau de roi par seau de roi ; ses biais ; les poids de sortie
  rangés seau de sortie par seau de sortie, `2 × largeur` chacun, le camp
  au trait d'abord ; un biais par seau. L'exemple borne la couche d'entrée
  et le factoriseur à ±0,99 chacun : leur somme reste dans ±1,98, soit ±505
  quantifiés — la borne d'accumulateur du chargeur vaut telle quelle ; les
  poids de sortie restent à ±127.

*Les réseaux* — une séance, les données de N4 (les six jobs de la vague du
7 oct., le même filtre, 40 superlots, depuis zéro) ; chacun ne diffère que
d'un levier de celui qu'il suit :

| réseau | largeur | seaux de sortie | seaux de roi | ce qu'il isole |
|---|---|---|---|---|
| **N5s** | 128 | 8 | — | les seaux de sortie, à vitesse égale — contre N4 |
| **N5l** | 256 | 8 | — | la largeur — contre N5s |
| **N5r4** | 256 | 8 | 4, en miroir | les seaux de roi, grossiers — contre N5l |
| **N5r10** | 256 | 8 | 10, en miroir : la disposition de l'exemple de bullet, lue au source | les seaux de roi, fins — contre N5r4 |

La disposition à 4 seaux n'est lue nulle part : c'est celle de l'exemple,
grossie — rangée 1, colonnes a–b et c–d, puis la rangée 2, puis tout le
reste. <span>Choix, confiance faible</span> ; N5r10 dit si la finesse paie
sur nos 160 M de positions, le factoriseur partageant ce que chaque seau
n'a pas assez vu.

*Le moteur, avant la séance* — un commit de code, les seaux de sortie et
de roi tenus par des constantes, puis un commit par architecture : le
programme d'entraînement lit l'architecture dans les constantes du moteur,
et chacun s'entraîne depuis le sien, comme N3 depuis `87c3d27`. Rien de cela
n'entre dans `main` avant qu'un réseau ne l'emporte : sur N4, ces chemins
ne s'emprunteraient jamais, et des chemins que rien n'emprunte sont ceux
qu'aucun test ne garde (la leçon du 12 oct.). Avant de demander la carte :
- **l'incrément égale le recalcul**, sur des parties entières, y compris
  les coups de roi qui changent de seau ou de côté — le camp du roi qui
  bouge se recalcule alors, l'autre se met à jour ; les deux roques, la
  prise en passant, les promotions ;
- **les indices confrontés au CODE de bullet** — un test de
  `tools/nnue-train`, que la CI joue sans GPU (`nnue-train.yml`) : les
  entrées du moteur contre `ChessBucketsMirrored::map_features`, son seau
  de sortie contre `MaterialCount::bucket`, sur des positions de parties,
  chaque camp au trait ;
- **la confrontation de fin d'entraînement** — écart médian ≤ 15, maximal
  ≤ 50 — sur les positions d'aujourd'hui, plus des rois sur chaque seau et
  de chaque côté, et de 3 à 32 pièces.

*La mesure* — chaque candidat, un commit révoqué (code, architecture,
réseau, confrontation recopiée), contre N4 (`main`) à `8+0,08`, quatre
jobs de 2 800 parties ; ses nœuds par seconde au rejeu du n° 15 ; la sonde
de B8 sur chacun, le facteur des marges appartenant au réseau.

*Attendus* — <span>inférence, confiance faible pour tous</span> ; gains
publiés d'autres moteurs, auto-déclarés : seaux de sortie +14, seaux de roi
+20 à +80, sur bien plus de données :
- **N5s** contre N4 : **+3 à +15** ;
- **N5l** : la qualité de la largeur, +5 à +25, moins ses ~11 Elo de
  vitesse → **−5 à +20** contre N4 ;
- **N5r4** : **+10 à +40** contre N4 ; ses nœuds par seconde, × 0,90 à
  × 0,93 — la largeur, plus un recalcul quand un roi change de seau ;
- **N5r10** : **−10 à +40** contre N4 — dix seaux sur 160 M de positions
  peuvent manquer de données là où quatre suffisent.

*Critère, écrit avant* : un gain se démontre contre N4, borne basse
au-dessus de zéro. Parmi les gains démontrés, le meilleur au point devient
le candidat ; si l'intervalle du second recoupe le sien, un match direct
entre eux tranche, par le même critère. Le gagnant s'embarque — puis la
sonde de B8, la série de C13, le balayage de mutation. Aucun gain
démontré : N4 reste, et le levier suivant est le volume (n° 18), ce que
N3 disait déjà en septembre.

**N° 17, étape 1 — son crible, RELEVÉ à 18 h 55** (local, `tools/mutants.sh
--file engine/src/nnue.rs`, l'arbre de l'étape) : 93 mutants en 51 min,
81 attrapés, 9 inviables, 2 expirés — les deux `row` qui allouent à chaque
appel, comme au crible du chemin A —, **1 survivant : le même équivalent du
roque**, exactement la prédiction. L'étape est fusionnée (PR #172) ; le
balayage d'après fusion tourne, prédiction 162.

**N° 17 — le code des seaux, écrit le 13 oct. au soir ; ce qu'il prouve et
ce qu'il reste à mesurer, écrit avant de mesurer le temps.** L'architecture
de N4 ne change pas : sans seaux, tout le nouveau code vaut l'identité.
- **`Arch`** — les seaux de roi (une disposition de 32 cases, ou aucune) et
  le nombre de seaux de sortie — devient une DONNÉE du réseau :
  `Network::from_bytes_with` lit n'importe quelle architecture,
  `from_bytes` celle du binaire (`ARCH`, N4). Les tests empruntent donc les
  chemins des seaux quelle que soit l'architecture du binaire — c'est ce
  qui permet au code d'entrer dans `main` avant qu'un réseau à seaux n'y
  entre, sans y laisser une ligne que rien n'emprunte. Si aucun réseau à
  seaux ne l'emporte, ce code part à l'attic : il n'aura servi qu'à
  mesurer ;
- **l'indice d'une entrée** : le bloc et le retournement que choisit le roi
  du camp, précalculés au chargement pour les 64 cases et les deux camps ;
  le seau de sortie, une table des 33 nombres de pièces — pas de division
  par évaluation ;
- **`apply_move`** : un coup de roi qui change de seau ou de côté recalcule
  son camp depuis l'enfant ; tout le reste se met à jour comme avant.
  `evaluate` prend la position, d'où il lit le trait et le nombre de
  pièces ;
- **le programme d'entraînement** lit l'architecture dans les constantes du
  moteur : `Chess768` ou `ChessBucketsMirrored`, `MaterialCount` toujours —
  à un seau, l'identité —, le factoriseur et le bornage à ±0,99 avec des
  seaux de roi seulement, les poids de sortie transposés. Six positions de
  confrontation de plus : grands roques, rois centraux et dans les coins,
  de 2 à 32 pièces ;
- **les dispositions de la séance** sont publiques dans le moteur,
  `KING_BUCKETS_4` et `KING_BUCKETS_10`.

*Prouvé avant la mesure* :
- **le même arbre** : 24 910 364 nœuds au rejeu du n° 15, ceux de `main` ;
- **l'incrément égale le recalcul avec les seaux** de l'exemple de bullet,
  sur les positions de parties des tests : des franchissements, des coups
  de roi qui ne franchissent rien, les deux roques — chacun compté, des
  deux côtés — et **autant de recalculs que de franchissements, pas un de
  plus** : un recalcul fait à la place d'une mise à jour rend le même
  accumulateur, et seul ce compte le distingue. Sans seaux, zéro recalcul ;
- **le seau du roi** lu à la main dans la disposition, case par case et
  camp par camp ; **le seau de sortie** de 2 à 32 pièces, et l'évaluation
  qui lit le bon ;
- **contre le CODE de bullet** — `les_seaux_du_moteur_sont_ceux_de_bullet`,
  dans `tools/nnue-train`, que la CI joue sans GPU : les entrées du moteur
  contre `ChessBucketsMirrored::map_features`, son seau de sortie contre
  `MaterialCount::bucket`, pour les deux dispositions de la séance, sur
  plus de 2 000 positions de parties au hasard chacune. **Éprouvé par une
  faute injectée** : le retournement de colonne supprimé, le test tombe sur
  la position initiale.

*À mesurer — attendu et critère écrits avant* : le temps, `main` contre le
code des seaux, au rejeu, vingt tours. Le nouveau code ajoute à chaque coup
deux lectures de table et une comparaison par camp. **Attendu** —
<span>inférence, confiance moyenne</span> : **0 à +1 %**. **Critère** :
l'entrée dans `main` demande l'arbre identique, les tests verts et un temps
PAS plus long au test des signes ; plus long, le chemin sans seaux se
spécialise d'abord.

**N° 17, le code des seaux — le temps, RELEVÉ le 13 oct. à 20 h 05 : le
premier jet coûtait 3,5 %, le chemin spécialisé ne coûte rien.** Rejeu du
n° 15, l'arbre identique au nœud près à chaque passe :

| binaire, contre `main` | plus lent | test des signes | temps, moyenne ± 1,96 e.t. |
|---|---|---|---|
| le premier jet (`75e07bc`) | 17 tours sur 20 | p = 0,0026 | **+3,47 ± 1,81 %** |
| V1 — sans seaux de roi, `apply_move` ne cherche pas le roi | 9 sur 20 | p = 0,82 | +0,06 ± 2,25 % |
| V2 — V1, et les poids de sortie en lignes de taille fixe | 10 sur 20 | p = 1,00 | +1,22 ± 1,99 % |
| V3 — V2, la règle de l'indice écrite une fois | 9 sur 20 | p = 0,82 | +0,38 ± 1,57 % |

- **le premier jet tombait sous son critère**, au-dessus de l'attendu
  (0 à +1 %) : chercher à chaque coup la case d'arrivée du roi et les deux
  clés de seau pesait 3,5 % du temps d'un nœud — l'ordre de la mise à jour
  elle-même. Comme écrit avant, le chemin sans seaux s'est spécialisé ;
- **V2 est retenue** : le même temps que V1 au test des signes, et le type
  porte la longueur d'une ligne de sortie au lieu d'une arithmétique
  d'indices. Le critère tient : arbre identique, tests verts, temps pas
  plus long ;
- **le bruit du conteneur** : d'une tranche de cinq tours à l'autre, la
  médiane d'un même binaire a varié de −4 % à +6 % — d'où les vingt tours
  et le test des signes, jamais une tranche seule.
- **la règle de l'indice écrite une fois** (`bucketed`) — l'indice
  d'`Arch::feature`, le recalcul et la mise à jour l'empruntent tous, au
  lieu de trois copies : la leçon du 12 oct. Le code machine n'est pas
  identique à l'octet, d'où un rejeu de plus, vingt tours contre `main` —
  V3 au tableau : le critère tient. **C'est V3 qui entre.**

*Le crible de `nnue.rs` sur ce code — prédiction, écrite avant de le
lancer* : **2 survivants, tous deux équivalents** — celui du roque, déjà au
plafond, et `>` en `>=` dans le maximum d'`Arch::input_buckets`, qui rend le
même maximum. Tout le reste du code neuf tombe sous les tests : la
disposition lue case par case, l'indice retourné, les tailles de fichier,
les seaux de sortie, et le compte des recalculs pour ce qu'aucune
comparaison de résultat ne verrait. Le plafond de `nnue.rs` passerait de 1
à 2, avec sa raison ; le total de 162 à 163.

**Le crible, RELEVÉ à 20 h 55 — exactement la prédiction** : run
38445139652, `nnue.rs` fini à 20 h 48 — 161 mutants, 141 attrapés, 14
inviables, 4 expirés, **2 survivants : les deux équivalents annoncés**,
`>=` dans le maximum d'`Arch::input_buckets` et le côté du roque. Le
plafond de `nnue.rs` passe à 2, sa raison écrite
(`.github/mutation-baseline.txt`). Le reste du crible n'a rien à dire de
neuf — aucun autre fichier ne change ; il finira avec `search.rs`.

**N° 17 — la séance des quatre réseaux, écrite le 13 oct. au soir, avant de
la demander.** Sur la carte de Théo, les données de N4 — `~/nnue-vague3`,
gardées depuis le n° 13 —, quatre entraînements depuis zéro, chacun depuis
le commit qui porte son architecture : le programme d'entraînement la lit
dans les constantes du moteur. Ces commits ne servent qu'à entraîner — le
réseau qu'ils embarquent est encore N4, d'une autre taille, et leurs tests
du moteur échouent pour cette seule raison ; la branche les annule aussitôt
(`a0b2e8c`).

**Vérifié ici avant de l'écrire** : à chacun de ces commits,
`tools/nnue-train` compile avec `--locked` et passe ses tests — contre le
runtime factice de bullet, donc sans rien dire de CUDA —, dont
`les_seaux_du_moteur_sont_ceux_de_bullet`. Chaque bloc se colle dans le MÊME
terminal, dans l'ordre :

0. **le dépôt à jour, et les données** :
   ```sh
   cd ~/chess && git status
   git fetch origin && git switch main && git pull --ff-only
   git log -1 --format='%h %cd'
   ls ~/nnue-vague3/*/*.vf | wc -l
   ```
   — `git log` doit dater du 13 oct. 2026 ou d'après ; **24** fichiers
   `.vf`. Moins : les retélécharger — l'étape 2 de la séance du n° 13, telle
   quelle (les artefacts restent jusqu'au 5 janv. 2027). Des fichiers
   « modifiés », un `--ff-only` qui refuse : s'arrêter et le dire ;
1. **CUDA dans ce terminal** — le bloc « CUDA dans ce terminal » de la
   séance d'entraînement du n° 7, tel quel ;
2. **un essai court d'abord**, l'architecture la plus neuve — dix seaux de
   roi, 256 unités, huit seaux de sortie —, un superlot :
   ```sh
   cd ~/chess/tools/nnue-train
   git checkout f729f8c
   cargo run --release --features cuda -- --attendu 2132034:242033195 --superlots 1 \
     --sortie essai17 ~/nnue-vague3/*
   ```
   il doit finir sur `RÉSEAU PRÊT : essai17/shallowred-768x10hm-256-s8-1/quantised.bin`.
   Un `ÉCHEC — le moteur n'évalue pas comme l'entraîneur` ici dit une
   faute d'indexation : s'arrêter et m'envoyer la sortie. Git annonce une
   « HEAD détachée » : c'est voulu ;
3. **les quatre réseaux**, chacun depuis son commit :
   ```sh
   git checkout 1ddb31c
   cargo run --release --features cuda -- --attendu 2132034:242033195 --sortie n5s \
     ~/nnue-vague3/* 2>&1 | tee n5s.sortie.txt
   git checkout 6a293b4
   cargo run --release --features cuda -- --attendu 2132034:242033195 --sortie n5l \
     ~/nnue-vague3/* 2>&1 | tee n5l.sortie.txt
   git checkout 4a604ea
   cargo run --release --features cuda -- --attendu 2132034:242033195 --sortie n5r4 \
     ~/nnue-vague3/* 2>&1 | tee n5r4.sortie.txt
   git checkout f729f8c
   cargo run --release --features cuda -- --attendu 2132034:242033195 --sortie n5r10 \
     ~/nnue-vague3/* 2>&1 | tee n5r10.sortie.txt
   git switch main
   ```
   → `RÉSEAU PRÊT :` respectivement
   `n5s/shallowred-768x128-s8-40`, `n5l/shallowred-768x256-s8-40`,
   `n5r4/shallowred-768x4hm-256-s8-40` et
   `n5r10/shallowred-768x10hm-256-s8-40`, chacun suivi de
   `/quantised.bin` ;
4. **rapporter**, sur une branche `reseau/n17` :
   ```sh
   cd ~/chess && git switch -c reseau/n17
   for c in n5s:768x128-s8 n5l:768x256-s8 n5r4:768x4hm-256-s8 n5r10:768x10hm-256-s8; do
     n=${c%%:*}; a=${c#*:}; d=tools/nnue-train/$n/shallowred-$a-40
     cp $d/quantised.bin reseaux/$n-$a-40.bin
     cp $d/log.txt reseaux/$n-$a-40.log.txt
     cp tools/nnue-train/$n.sortie.txt reseaux/$n-$a-40.sortie.txt
   done
   git add reseaux/n5*
   git commit -m "Réseaux NNUE du n° 17 : N5s, N5l, N5r4, N5r10 — les seaux sur un réseau élargi"
   git push -u origin reseau/n17
   ```
   **Garder les dossiers `n5*/` et `~/nnue-vague3`** : un ré-entraînement
   en repartirait.

*Durée* — <span>inférence, confiance faible</span> : N4 a pris 10 min 10 s ;
256 unités en demandent peut-être le double, les seaux peu de plus — **une
heure à une heure et demie** en tout, compilation comprise. Un
`ÉCHEC — …` à n'importe quel temps arrête tout, et son message suffit à le
diagnostiquer.

**Ce qui suit, écrit avant** : pour chaque réseau, la confrontation
recopiée dans le moteur, le commit candidat révoqué aussitôt — code,
architecture, réseau —, ses nœuds par seconde au rejeu du n° 15, la sonde
de B8, puis quatre jobs de 2 800 parties contre N4 ; le critère est celui
du plan.

**N° 17, la séance — RELEVÉE le 14 oct. à 0 h 05 : les quatre réseaux
tiennent leurs contrôles.** Poussés par Théo sur `reseau/n17` (`c7329d6`),
sur la RTX 3050 ; chacun a relu **2 132 034 parties : 242 033 195
positions — l'attendu exact** :

| | confrontation, médian / maximal (admis 15 / 50) | entraînement | perte moyenne au 1ᵉʳ, 10ᵉ, 20ᵉ, 40ᵉ superlot |
|---|---|---|---|
| N4, pour mémoire — 128, sans seaux | 8 / 16, sur 12 positions | 10 min 10 s | 0,0461 · 0,0425 · 0,0422 · 0,0423 |
| **N5s** — 128, 8 seaux de sortie | 6 / 19 | 9 min 48 s | 0,0460 · 0,0422 · 0,0419 · 0,0420 |
| **N5l** — 256, 8 seaux de sortie | 5 / 16 | 13 min 00 s | 0,0450 · 0,0411 · 0,0408 · 0,0409 |
| **N5r4** — 256, 4 seaux de roi, 8 de sortie | 4 / 23 | 15 min 45 s | 0,0431 · 0,0398 · 0,0394 · 0,0393 |
| **N5r10** — 256, 10 seaux de roi, 8 de sortie | 7 / 18 | 21 min 15 s | 0,0425 · 0,0383 · 0,0377 · 0,0374 |

- **la confrontation porte sur dix-huit positions** — les douze de N4 et
  les six du code des seaux : grands roques, rois centraux et dans les
  coins, de 2 à 32 pièces ;
- **la perte baisse avec la capacité, dans l'ordre du tableau — et ce n'est
  pas une mesure de force.** C'est la perte d'ENTRAÎNEMENT, sur les
  positions mêmes que le réseau apprend, sans jeu tenu à l'écart : un réseau
  plus capacitif la baisse aussi en retenant ses données, et N5r10 porte
  dix fois les poids d'entrée de N5l pour les mêmes 159 M de positions.
  *Une perte ne dit pas la force* — ici moins encore : elle ne distingue
  pas apprendre de retenir. Les matchs le diront ;
- la séance a duré une heure, le bas de l'attendu.

**Les tests qui supposaient N4 — trouvés en construisant les candidats, le
14 oct.** Cinq tests posaient des valeurs à des indices calculés pour un
seul bloc d'entrées et une seule sortie : quatre de `nnue.rs`, qui
chargeaient pourtant leur fichier sous l'architecture du BINAIRE, et celui
de bout en bout d'`EvalFile` (`engine/tests/uci.rs`). Sous N5s, déjà, ils
tombaient — un fichier refusé, une taille fausse, une sortie de référence
fausse, un biais de sortie à la mauvaise place. Ceux de `nnue.rs` nomment
désormais leur architecture, `PLAIN` — celle de N4 —, quelle que soit celle
du binaire ; celui d'`EvalFile` suit au contraire l'architecture du
binaire, puisque c'est elle qu'`EvalFile` charge, et pose un biais par seau
de sortie à la place que donne la disposition de bullet. Sous N4 rien ne
change — mêmes octets, même architecture, mêmes chemins —, d'où un commit
qui entre dans `main` (`e626900`) : le jour où un réseau à seaux
s'embarque, il n'aura plus rien à y toucher. *Prédiction pour le balayage
qui suivra sa fusion, écrite avant* : **163**, `nnue.rs` à 2, `search.rs`
à 48 — les tests changés exercent le même code, sous la même architecture,
et la séparation du facteur (plus bas) n'ajoute qu'une constante, que
`cargo mutants` ne mute pas.

**Les candidats, écrits le 14 oct.** — chacun, sur `e626900`, ne change que
`engine/src/nnue.rs` : la largeur, l'architecture, le chemin
d'`include_bytes!` et la confrontation de son entraînement recopiée dans le
test, aux dix-huit positions ; `verify.sh --rapide` vert à chaque état, et
révoqué aussitôt :

| réseau | candidat | révoqué par |
|---|---|---|
| N5s | `a684ee1` | `a7fb9cc` |
| N5l | <s>`afabbf6`</s> **`f6ddfed`**, avec son facteur | <s>`5dc74b7`</s> `ebf5f06` |
| N5r4 | `7496db3` | `c2d9854` |
| N5r10 | <s>`75be0b5`</s> **`d3fe59d`**, avec son facteur | <s>`6de819d`</s> `7b0f467` |

<s>La référence de leurs matchs : `e626900`</s> — **réécrits après la sonde
de B8, ci-dessous** : N5l et N5r10 sortent de la plage, et la règle veut que
le candidat porte le réseau ET son facteur. La référence de leurs matchs :
**`6a71964`** — N4, `e626900` plus la séparation du facteur et un test
corrigé, ni l'un ni l'autre ne changeant rien sous N4.

**La sonde de B8 sur les quatre — écrite le 14 oct. à 0 h 35, avant de la
lancer.** Le protocole du 12 oct. : 40 parties de chaque réseau contre
lui-même à `8+0,08`, `-srand 20260930`, le livre du dépôt ; le binaire
sondé est le candidat plus la rustine `b8-sonde-marges.patch`, qui
s'applique telle quelle, et ses parties jouent son réseau embarqué. **La
faite main n'est pas rejouée** : son chemin n'a pas bougé depuis le 12 oct.
— le banc rend 70 452, seuls `nnue.rs` et la signature d'`evaluate` ont
changé —, et ses journaux de ce jour-là servent de dénominateur, comme ceux
du 30 sept. le 2 oct. **Règle, inchangée** : la moyenne géométrique des
facteurs delta et aspiration ; **dans 1,68 à 2,80, le réseau se mesure au
facteur de `main`, 2,24** ; hors de cette plage, le facteur se règle
d'abord, et le candidat porte le réseau ET son facteur. *Attendu* —
<span>inférence, confiance faible</span> : **près de N4, 2,4 à 3,0 pour les
quatre** — mêmes étiquettes, même échelle d'entraînement, et le moteur lit
chaque sortie à la même échelle ; un réseau plus juste se trompe moins
après une capture, donc **plutôt vers le bas pour les plus capacitifs**.
N4 était au bord, à 2,77 : qu'un réseau sorte par le haut est prévu par la
règle, pas une surprise.

**La sonde, RELEVÉE le 14 oct. à 1 h 05** — 40 parties par réseau, finies
entre 0 h 37 et 0 h 56, zéro perte au temps, zéro anomalie ; la faite main,
celle du 12 oct. (0,40 % d'élagages delta fautifs, 4,1 % d'itérations hors
de la première fenêtre). **La rustine ne compilait plus** — `evaluate` prend
la position depuis le code des seaux ; corrigée d'une ligne, à l'attic
aussi :

| réseau | facteur delta | facteur aspiration | moyenne géométrique | par la règle (1,68 à 2,80) |
|---|---|---|---|---|
| N4, le 12 oct. | × 3,2 | × 2,40 | 2,77 | dedans, de justesse |
| **N5s** | × 2,8 | × 2,40 | **2,59** | dedans — le facteur de `main`, 2,24 |
| **N5l** | × 2,9 | × 2,80 | **2,85** | **dehors — son facteur, 2,85** |
| **N5r4** | × 2,8 | × 2,80 | **2,80** | sur la borne, dedans à la lettre — 2,24 |
| **N5r10** | × 3,0 | × 3,80 | **3,38** | **dehors — son facteur, 3,38** |

- **l'attendu tient pour trois sur quatre (2,4 à 3,0), et son SENS s'est
  trompé** : le plus capacitif ne se trompe pas moins. N5r10 sort par le
  haut, par l'aspiration surtout — 17,9 % de ses itérations sortent de la
  première fenêtre à δ = 25, contre 11,0 % pour N5s et 11,3 % pour N4 : son
  score bouge davantage d'une itération à l'autre. <span>Inférence,
  confiance faible</span> : une évaluation plus tranchée selon la case du
  roi, ou plus bruitée — les matchs ne départageront pas les deux ;
- **N5r4 tombe exactement sur la borne** : la règle écrit « dans 1,68 à
  2,80 », et la grille — un dixième au delta, 5 à 25 au δ — ne sait pas
  faire plus fin. Il se mesure à 2,24, comme la règle le dit ;
- **le facteur était COUPLÉ, et le porter aurait changé le banc.**
  `NETWORK_MARGIN_PERCENT` servait aussi, à l'envers, à ramener à la faite
  main les marges mesurées au réseau (C39, C41) : embarquer un réseau d'un
  autre facteur aurait déplacé l'arbre de la faite main — ce que
  l'invariant de B8 interdit (« la faite main garde ses marges au bit
  près »). **Séparés avant les candidats** (`3517669`) : le facteur du
  réseau, et un facteur figé à 224 pour la faite main ; banc 70 452
  inchangé, et ce commit entre dans `main` ;
- **ce que cela mêle** : contre N4, N5l et N5r10 changent le réseau ET le
  facteur, quand N4, mesuré à 2,77, joue à 2,24. Si l'un gagne, le facteur
  peut y avoir sa part ; la règle l'accepte, écrite avant.

**Un test de temps tombé en construisant les candidats — et ce qu'il
mesurait vraiment.** `le_budget_de_temps_est_respecte` (120 ms, seuil 900)
a rendu 1,05 s sous N5l en debug, puis passé seul. Mesuré : la recherche
dure 50 à 81 ms, mais le chronomètre partait AVANT la construction de la
recherche, dont la table par défaut coûte **324 à 355 ms** en debug — et
sous la charge d'une suite plus lourde, à 256 unités, bien plus. Le test
mesurait la construction autant que le budget ; la recherche se construit
désormais avant le chronomètre (`6a71964`, entre dans `main`). *La mesure
qui condamne l'ancienne forme est indépendante du candidat* : elle tient
sur `main`, où la faite main seule joue ce test.

**Les matchs, lancés le 14 oct. à 1 h 14** — seize jobs de 2 800 parties à
`8+0,08`, graine « auto » chacun, le binaire AVX2 des deux côtés, contre
`6a71964` : N5s 38483020202, 38483023343, 38483026303, 38483029013 ; N5l
38483035817, 38483038473, 38483041220, 38483044735 ; N5r4 38483047543,
38483050676, 38483054167, 38483056786 ; N5r10 38483060310, 38483062830,
38483066418, 38483069264. Fin attendue vers 6 h 40, au plus tard au plafond
de 350 minutes. Critère et attendus : ceux du plan.

**Leurs nœuds par seconde — écrits avant de les mesurer.** Le rejeu du
n° 15, `--nps`, chaque candidat contre N4, dix tours, après la sonde et
jamais en même temps qu'elle. *Attendus* — <span>inférence, confiance
moyenne</span>, ceux du plan : **N5s × 0,98 à × 1,00** — une table de seaux
de sortie de plus ; **N5l × 0,90 à × 0,96**, N3 à × 0,93 sur le même code ;
**N5r4 × 0,90 à × 0,93** — la largeur, plus un recalcul quand un roi change
de seau ; **N5r10 × 0,88 à × 0,93**, plus de franchissements. Ils ne
décident rien : ils disent combien d'Elo de vitesse chaque réseau doit
racheter par sa qualité — × 0,93 vaut ~−11 Elo par l'étalon.

**Les nœuds par seconde, RELEVÉS le 14 oct. à 1 h 35** — le rejeu du
n° 15, binaires AVX2, dix tours, pendant que les matchs jouent sur des
runners — le conteneur, lui, ne faisait rien d'autre :

| réseau | n/s contre N4 | plus lent | attendu, écrit avant | Elo de vitesse, par l'étalon |
|---|---|---|---|---|
| **N5s** | × 0,995 | 5 tours sur 10, p = 1 | × 0,98 à × 1,00 — **tenu** | ~−1 |
| **N5l** | × 0,897 | 10 sur 10, p = 0,002 | × 0,90 à × 0,96 — juste sous | ~−17 |
| **N5r4** | × 0,835 | 10 sur 10, p = 0,002 | × 0,90 à × 0,93 — **manqué** | ~−28 |
| **N5r10** | × 0,823 | 10 sur 10, p = 0,002 | × 0,88 à × 0,93 — **manqué** | ~−30 |

- **les seaux de roi coûtent ~7 % de plus que la largeur seule** — × 0,835
  contre × 0,897 —, quand l'attendu leur en prêtait 0 à 3 : un roi qui
  change de seau ou de côté fait recalculer TOUT l'accumulateur de son
  camp, une trentaine de lignes de 256 au lieu de deux à quatre. Dix seaux
  n'en coûtent qu'un peu plus que quatre : ce sont surtout les passages de
  colonne d à e, que les deux dispositions partagent ;
- **N5l, × 0,897, sous N3 (× 0,93 le 13 oct.)** : les seaux de sortie n'y
  coûtent rien (N5s), l'écart tient à deux jours de conteneur et à un autre
  arbre — <span>inférence, confiance faible</span> ;
- **le levier connu, s'il en faut un** : un cache d'accumulateurs par seau
  et par camp — chez Stockfish les « finny tables » — rend un recalcul
  incrémental depuis la dernière fois que ce seau a servi. Il ne s'écrit
  que si un réseau à seaux de roi l'emporte : son coût ne se paie qu'alors.
  *Ce que cela change aux matchs* : rien — ils mesurent chaque réseau à sa
  vitesse d'aujourd'hui ; un réseau à seaux qui gagne paie ~−11 Elo pour ses
  seaux au-delà de sa largeur — log₂(0,931) × 107,7 —, et ce cache en
  rendrait une partie.

#### N° 17 — VERDICT, 14 oct. 2026 : N5l +30,29 ± 3,95 Elo à `8+0,08` contre N4 — EMBARQUÉ ; N5s +15,58 ± 3,87 ; les seaux de roi régressent, N5r4 −58,91 ± 4,45 et N5r10 −133,59 ± 4,93

Seize matchs de 2 800 parties, lancés à 1 h 14, finis ENTIERS entre 5 h 49
et 6 h 31, graines distinctes, le binaire AVX2 des deux côtés contre
`6a71964` (N4), zéro perte au temps, zéro coup illégal :

| réseau | les quatre jobs | en commun, 11 200 parties | homogénéité | attendu, écrit avant |
|---|---|---|---|---|
| **N5l** — 256, 8 seaux de sortie, facteur 2,85 | +27,11 · **+43,03** · +21,49 · +29,60 | **+30,29 ± 3,95** | non, p = 0,001 | −5 à +20 — **dépassé** |
| **N5s** — 128, 8 seaux de sortie | +15,40 · +12,66 · +12,66 · +21,62 | **+15,58 ± 3,87** | oui, p = 0,364 | +3 à +15 — au bord |
| **N5r4** — 256, 4 seaux de roi, 8 de sortie | −54,16 · −56,96 · −67,08 · −57,47 | **−58,91 ± 4,45** | oui, p = 0,187 | +10 à +40 — **manqué de ~70** |
| **N5r10** — 256, 10 seaux de roi, 8 de sortie, facteur 3,38 | −145,57 · −139,87 · −126,12 · −123,16 | **−133,59 ± 4,93** | non, p = 0,009 | −10 à +40 — **manqué de ~145** |

- **Par le critère, écrit avant** : deux gains démontrés, N5l et N5s ;
  **le meilleur au point, N5l**, et l'intervalle de N5s (+11,7 à +19,5)
  ne recoupe pas le sien (+26,3 à +34,2) — pas de match direct. **N5l
  s'embarque** avec son facteur, 2,85 (`04d823a`, qui révoque la
  révocation `ebf5f06`) ;
- **l'hétérogénéité de N5l se lit à l'étalonnage** : les quatre runners
  atteignent la profondeur 15 en 250 ms, mais le seul différent — un EPYC
  9V45, **3,02 M n/s** — rend +43,03, quand les trois EPYC 7763 (1,83 à
  1,97 M) rendent **+26,07 ± 4,61 en commun, homogènes (p = 0,332)**.
  **La décision tient sans lui** : +26,07 ± 4,61 ne recoupe pas N5s non
  plus. <span>Inférence, confiance faible — un seul job</span> : sur la
  machine la plus rapide, la largeur paie davantage ; ce serait le sens
  de la cadence cible, plus longue ;
- **la largeur et les seaux de sortie paient au-delà de l'attendu** : N5s
  isole les seaux de sortie, à vitesse égale (× 0,995), **+15,6** ; N5l y
  ajoute la largeur — et son facteur, réglé par la sonde — pour **+14,7**
  de plus, malgré ~17 Elo de vitesse perdus. La qualité d'une largeur
  doublée vaut donc ~+30 sur ces données ;
- **les seaux de roi, eux, régressent — et bien au-delà de leur vitesse.**
  ~−28 et ~−30 Elo de vitesse par l'étalon ; restent **~−31 et ~−104 de
  qualité**. *Ce n'est pas une faute d'indexation, autant que les tests le
  disent* : les indices confrontés au CODE de bullet sur plus de 2 000
  positions pour chaque disposition, l'incrément égal au recalcul avec
  autant de recalculs que de franchissements, les confrontations de fin
  d'entraînement dans le critère — rois sur chaque seau compris.
  <span><s>Inférence, confiance moyenne</s></span> **MESURÉ le 14 oct.
  (section « N° 18 », la perte tenue à l'écart)** : **ils retiennent au lieu
  d'apprendre** — quatre ou dix fois les poids d'entrée de N5l pour les
  mêmes 159 M de positions, et la perte d'entraînement la plus basse des
  quatre (0,0393, 0,0374) ; plus il y a de seaux, plus c'est grave. La
  sonde de B8 le montrait déjà : N5r10 sortait de la première fenêtre
  d'aspiration 17,9 % des fois, contre 11 % — un score qui bouge plus
  d'une itération à l'autre. *Une perte d'entraînement qui baisse n'est
  pas une qualité qui monte* ; il manquait un jeu tenu à l'écart ;
- **ce que le verdict mêle** : N5l joue à son facteur, 2,85, quand N4
  jouait à 2,24 alors que sa propre sonde disait 2,77. Une part du gain
  peut venir du facteur ; elle ne change pas la décision — N5l gagne avec
  le sien —, et le facteur de chaque réseau reste un réglage à faire au
  n° 19 ;
- **ce que cela dit de la suite, écrit avant d'y toucher** : le levier
  suivant est **le volume (n° 18)**, et c'est lui que les seaux de roi
  attendent ; avec dix fois les données, ils se remesurent. La largeur a
  payé ~+30 pour ~−17 de vitesse : **384 ou 512 unités** se mesurent
  aussi, sur plus de données — × 0,87 et × 0,82 attendus de nœuds par
  seconde (étape 1 du n° 17). Et le prochain entraînement se dote d'un
  **jeu de validation**, si bullet en a un — à lire dans son source, au
  commit épinglé, avant de l'affirmer.

**Ce qui suit l'embarquement, écrit avant** :
- **la série C13 de N5l** — 300 parties contre Stockfish bridé à 2850, à
  60+0,6, comme celle de N4 (~3 040 ± 36). *Attendu* — <span>inférence,
  confiance faible</span> : **3 040 à 3 110** ; cette échelle écrase les
  écarts — 0,67 au point pour N4, à ± 0,9 —, soit ~+20 des ~+30 ;
- **le balayage de mutation après la fusion** — *prédiction* : **163**,
  `nnue.rs` 2 et `search.rs` 48, rien ne bouge : le binaire porte d'autres
  constantes — 256 unités, huit seaux de sortie, le facteur 2,85 —, mais
  les tests du code des seaux empruntent déjà ces chemins sur des réseaux
  aléatoires, et la faite main n'a pas changé ; le banc reste 70 452. Un
  survivant de moins serait possible — l'embarqué emprunte désormais le
  seau de sortie —, un de plus ne l'est pas.
  **RELEVÉ le 14 oct. à 13 h 25 : 163, EXACT** (run 38514979900,
  tentative 2 — la première avait perdu le runner de `search.rs`, issue
  #176, fermée) ; aucun survivant de moins : l'embarqué n'a rien tué que
  les réseaux aléatoires ne tuaient déjà.

**Les matchs** : quatre jobs de 2 800 parties par candidat, `8+0,08`,
graine « auto » chacun, le binaire AVX2 des deux côtés, contre `e626900` ;
le critère est celui du plan — un gain démontré contre N4, borne basse
au-dessus de zéro ; parmi les gains démontrés, le meilleur au point, et un
match direct si l'intervalle du second recoupe le sien.

### N° 18 — le volume de données : DÉCIDÉ le 14 oct. 2026, écrit avant de lancer

**Décidé** — Théo, 14 oct. : « *Ok je valide la suite* », en réponse au
récapitulatif qui proposait le volume d'abord, puis 384 ou 512 unités sur
plus de données, et un jeu de validation si bullet en a un. Le plan du
13 oct. (n° 15 à 19) l'écrivait : « ~8 à 10 vagues pour × 10, puis des
entraînements plus longs sur la carte de Théo ».

**La recette — un seul étiqueteur, pour que le volume se mesure.**
`nnue-datagen.yml` sur `main` à `c4697e2` : N5l embarqué, et la recherche
de la composition du n° 12, inchangée depuis `0e67f71` — vérifié,
`git log 0e67f71..c4697e2 -- engine/src` ne porte que le réseau, son
inférence, le facteur séparé et des tests. 5 000 nœuds par coup, graine
« auto », un fil par processeur logique, 330 minutes, `x86-64-v3`. Seul
l'étiqueteur change depuis le 7 oct. : N2L → N5l, ~+50 Elo par la chaîne
N4L (+14), N4 (+5), N5l (+30). **Les données du 7 oct. n'entrent pas dans
le volume** : un autre étiqueteur, et un mélange ne mesure que lui-même
(n° 13).

**Le volume** : × 10 les ~159 M de positions gardées par le filtre qu'ont
vues N4 et N5l, soit **~1,6 G**. À ~25 M gardées par job — 178,2 M en sept
jobs le 7 oct. —, **~64 jobs : huit vagues de huit, l'une après l'autre**.
Huit à la fois, la charge que le workflow s'impose depuis A21 — « quelques
jobs à la fois, pas par dizaines », par les conditions de GitHub (ligne B4).
~6 h par vague, ~2 jours si elles s'enchaînent. Le volume se relève vague
par vague ; on s'arrête à ~1,6 G gardées, ou plus tôt si la séance le
décide.

**Le stockage** : ~140 Mo par artefact, ~9 Go pour huit vagues, gardés
90 jours. Le dépôt en porte déjà **2,46 Go vivants**, lus à l'API le 14 oct.,
sans qu'un dépôt ait été refusé ; la page de facturation de GitHub n'est pas
joignable d'ici — <span>inférence, confiance moyenne : un dépôt public ne
paie pas le stockage de ses artefacts</span>. Chez Théo, ~10 Go de `.vf`.

**D'abord une sonde de 20 minutes** : l'étiqueteur a changé, et le débit
avec lui. *Attendus, écrits avant* — <span>inférence, confiance
faible</span> :
- **positions par seconde : × 0,95 à × 1,15 celles du 7 oct. sur le même
  processeur** — EPYC 7763 1 430 à 1 730, EPYC 9V74 1 910 à 2 310, EPYC
  9V45 2 470 à 3 000, Xeon 8573C 1 400 à 1 690. Le nœud coûte plus au
  réseau — N5l × 0,897 contre N4, de la taille de N2L —, et moins depuis le
  n° 16 — × 1,168 à arbre égal : × 1,05 au centre ; la longueur des parties
  peut bouger ;
- **parties écartées : 8 à 14 %** — 9,45 % le 7 oct. Le filtre d'ouverture
  (`OPENING_MAX_SCORE`, 1 000) se lit en unités du réseau qui étiquette, et
  l'échelle de N5l n'est pas celle de N2L — leurs facteurs de B8, 2,85 et
  2,41, le disent là où les marges tranchent ;
- **nulles : 26 à 32 %** — 27,09 % le 7 oct. ; un étiqueteur plus fort en
  fait un peu plus.

Hors fourchette, on diagnostique avant de lancer la vague.

**Le jeu de validation — lu au source de bullet, `10e7e82`.**
`LocalSettings` porte un champ `test_set`, mais `ValueTrainer::run`, s'il
est rempli, imprime « *Warning: Validation data not currently implemented!
Please bother me on discord.* » (`crates/bullet_lib/src/value.rs`) et ne
calcule rien. **Bullet n'en a pas, à ce commit.** Il s'écrit donc ici : un
binaire, `nnue_validation.rs`, qui lit des `.vf`, garde les positions par le
filtre par défaut de `viriformat` — celui de l'entraîneur —, évalue chaque
réseau QUANTIFIÉ par le code du moteur, et rend la perte de l'entraîneur,
`(σ(éval / 400) − (0,75 · résultat + 0,25 · σ(score / 400)))²` — la
recette de `tools/nnue-train`, dont la convention de camp se lit dans le
chargeur de bullet avant de l'écrire —, avec l'écart APPARIÉ entre réseaux.
Il tourne par un workflow : le conteneur ne télécharge pas les artefacts,
le `gh` intégré refusant l'hôte de stockage (vérifié le 14 oct.).
- **ce qu'il dira, et ce qu'il ne dira pas** : une perte tenue à l'écart
  n'est PAS une force — `CLAUDE.md`, l'ajustement Texel : 7,8 % de mieux en
  prédiction, 25 Elo de moins en partie. Elle diagnostique : un réseau qui
  retient voit sa perte d'entraînement baisser et sa perte tenue à l'écart
  monter. Les matchs décident, toujours ;
- **son premier usage, avant la première vague** : le septième job du
  7 oct., 37625443145, n'a servi à AUCUN réseau du n° 17 — il est déjà tenu
  à l'écart. Sur lui, N5l, N5r4 et N5r10, les trois à 256 unités, la
  largeur que le binaire porte ; puis la même mesure sur un job appris de
  taille voisine, 37625438110. *Prédiction, écrite avant —
  l'inférence du verdict du n° 17* : si les seaux de roi retiennent,
  **leur perte tenue à l'écart dépasse celle de N5l**, l'ordre de
  l'entraînement (N5r10 < N5r4 < N5l) s'inversant, ou du moins l'écart
  entre données apprises et tenues à l'écart croît avec les seaux. Si
  l'ordre de l'entraînement tient à l'écart sans que l'écart croisse,
  l'inférence est réfutée, et la régression des seaux de roi se cherche
  ailleurs ;
- **pour le n° 18** : le PREMIER job lancé de la première vague est tenu à
  l'écart, désigné avant d'en voir le compte ; ses positions ne
  s'entraînent pas — 1/64 du volume.

**La sonde, RELEVÉE le 14 oct. à 9 h 30 — le débit HORS de son attendu,
<s>la composition dedans</s> les écartées aussi, lues sur le mauvais
dénominateur jusqu'à la relève de la vague 1.** Run 38525942509, 20 minutes sur un EPYC 7763,
quatre fils, `x86-64-v3`, `evaluation=reseau-embarque`, `c4697e2` :

| | la sonde | le 7 oct., EPYC 7763 | attendu, écrit avant |
|---|---|---|---|
| positions par seconde | **1 287** | 1 501 et 1 506 | 1 430 à 1 730 — **manqué, × 0,86** |
| parties écartées, sur les gardées | <s>**13,6 %** (1 920 sur 14 136)</s> **15,72 %** (1 920 sur 12 216) — corrigé le 14 oct. à la relève de la vague 1 : 14 136 était le total | 9,45 % | 8 à 14 % — **manqué** |
| nulles | **31,8 %** | 27,09 % | 26 à 32 % |

126,4 positions par partie (113,5 le 7 oct.), 67,2 % gardées par le filtre
(65,7 %). Un premier lancement, 38525718698, est mort au checkout : le SHA
tapé de tête, faux d'un caractère.

**Le diagnostic, dans le conteneur, avant la vague** — le générateur de
chaque commit construit en `x86-64-v3`, la même graine, trois minutes
(deux à un fil), dans un ordre alterné :

| générateur | réseau | quatre fils | un fil |
|---|---|---|---|
| `0e67f71`, celui du 7 oct. | N2L | 1 427 · 1 431 | — |
| `ce57170` | N4 | 1 399 | 319 |
| `25f26ae`, le SIMD du n° 16 | N4 | 1 370 | 345 |
| `c4697e2`, la recette du n° 18 | N5l | 1 161 · 1 109 | 287 |

- **le conteneur reproduit le runner** : × 0,79 contre le générateur du
  7 oct., × 0,86 sur le runner. Le coût est dans le code, pas dans la
  machine ;
- **N5l coûte × 0,83 contre N4, à quatre fils comme à un** — pas une
  contention entre fils. Au rejeu du n° 17, à la profondeur 10 et la table
  gardée d'un coup à l'autre, il coûtait × 0,897. <span>Inférence,
  confiance faible</span> : à 5 000 nœuds, la table vidée à chaque partie,
  presque chaque nœud est une feuille qui évalue, et la part du réseau
  dans le temps d'un nœud y dépasse celle du rejeu — la largeur s'y paie
  davantage. Les matchs, eux, ont mesuré N5l à sa vitesse réelle ;
- **le gain du SIMD ne se lit pas ici** : × 0,98 à quatre fils, × 1,08 à
  un, un tirage chacun — rien à conclure, et aucun ne décide de la vague ;
- **ce qui ne change pas** : les données, à débit près. La vague se lance.
  **Ce qui change, c'est le compte** : ~22 M positions gardées par job au
  lieu de ~25, donc **~73 jobs, neuf vagues** pour ~1,6 G.

**La vague 1, lancée le 14 oct. à 9 h 54** — huit jobs de 330 minutes,
`c4697e2`, les entrées par défaut ; **le PREMIER lancé est tenu à
l'écart**. *Attendu, écrit avant* — <span>inférence, confiance moyenne,
le débit de la sonde par processeur, × 0,86 celui du 7 oct.</span> :
**190 à 290 M positions, 125 à 195 M gardées** ; écartées 12 à 15 %,
nulles 30 à 33 %. Les runs, dans l'ordre de lancement : **38531414161**
— tenu à l'écart —, 38531424497, 38531434938, 38531444819, 38531455378,
38531465902, 38531477470 et 38531487267. Fin attendue vers 15 h 30.

**La vague 1, RELEVÉE le 14 oct. à 15 h 35 — dans ses attendus, sauf les
écartées, et l'écart est le mien : un DÉNOMINATEUR.** Les huit jobs finis
à 15 h 25 :

| | vague 1 | attendu, écrit avant |
|---|---|---|
| positions | **208 303 640** | 190 à 290 M |
| gardées par le filtre | **139 847 163** (67,1 %) | 125 à 195 M |
| parties écartées, sur les parties gardées | **15,75 %** (259 647 sur 1 649 013), d'un job à l'autre 15,54 à 15,86 % | 12 à 15 % — **manqué** |
| nulles | **32,27 %**, d'un job à l'autre 32,1 à 32,4 % | 30 à 33 % |
| positions par seconde | 1 284 à 1 350 | — |

- **le dénominateur** : `ecartees` et `parties` sont deux compteurs
  disjoints — `parties` ne compte que les gardées. Le 7 oct., 9,45 % se
  lisait sur les gardées, et la sonde du 7 oct. aussi (9,7 %, 1 680 sur
  17 301 gardées). **La sonde du 14 oct. a été lue sur le total** — 1 920
  sur 14 136 = 12 216 gardées + 1 920 écartées, d'où 13,6 % ; sur les
  gardées, **15,72 %**. Vérifié dans son journal (run 38525942509). Lue
  pareil, la sonde et la vague s'accordent à 0,03 point ; et la sonde
  était **hors** de son attendu (8 à 14 %), pas dedans comme je l'ai
  écrit. L'attendu de la vague, tiré de ce 13,6 %, héritait de la faute ;
  *même famille que « vérifier le dénominateur » (`CLAUDE.md`), et je
  l'ai relue dans un chiffre que j'avais écrit moi-même* ;
- **pourquoi plus d'écartées qu'avec N2L** — <span>inférence, confiance
  faible</span> : le filtre d'ouverture tranche à 1 000 en unités du
  réseau qui étiquette, et N5l porte des nombres plus grands — facteurs de
  B8 2,85 contre 2,41, × 1,18 —, soit un filtre plus strict d'autant en
  unités de N2L. C'est la raison que l'attendu de la sonde nommait déjà. Une
  partie écartée l'est au premier coup, après une recherche : le coût est
  négligeable, et les données gardées restent homogènes — **un seul
  étiqueteur, un seul filtre sur tout le volume** ;
- **le débit** : 1 284 à 1 350 positions par seconde, ~17,5 M gardées par
  job — pas les ~22 M prévus. <span>Inférence, confiance moyenne</span> :
  à ces débits, aucun EPYC 9V74 ni 9V45, les processeurs rapides du
  7 oct. ; la prévision moyennait leur mélange. **Le volume
  d'entraînement après la vague 1 : 122,6 M gardées**, le job tenu à
  l'écart (38531414161, 17 208 872) mis à part. Au débit de la vague 1, il
  reste **~85 jobs, une dizaine de vagues, ~2,5 jours** pour ~1,6 G ;
  moins si des processeurs rapides reviennent. La règle d'arrêt ne change
  pas : ~1,6 G, ou plus tôt si la séance le décide ;
- **752 Mo d'artefacts**, expirant le **12 janv. 2027** (lu à l'API).

**La vague 2, lancée le 14 oct. à 15 h 40** — la même recette, `c4697e2`,
huit jobs de 330 minutes, aucun tenu à l'écart ; runs 38573763466, 38573777850, 38573791988, 38573805694, 38573819362, 38573833059, 38573846725 et 38573860433. Fin attendue vers 21 h 15. *Attendu, écrit avant* —
<span>inférence, confiance moyenne, le débit de la vague 1 et celui des
processeurs rapides du 7 oct. aux deux bouts</span> : **200 à 285 M
positions, 134 à 192 M gardées** ; écartées **15,4 à 16,0 %** et nulles
**31,8 à 32,7 %**, lues sur les parties gardées comme ci-dessus.

**La vague 2, RELEVÉE le 14 oct. à 21 h 25 — dans ses attendus, sur les
quatre chiffres.** Les huit jobs finis à 21 h 12 :

| | vague 2 | attendu, écrit avant |
|---|---|---|
| positions | **218 180 300** | 200 à 285 M |
| gardées par le filtre | **146 508 723** (67,2 %) | 134 à 192 M |
| parties écartées, sur les gardées | **15,71 %**, d'un job à l'autre 15,66 à 15,81 % | 15,4 à 16,0 % |
| nulles | **32,34 %**, d'un job à l'autre 32,24 à 32,44 % | 31,8 à 32,7 % |

- **les processeurs, et leur dispersion** : trois EPYC 7763 à 1 264, 1 284
  et 1 291 positions par seconde, un quatrième à **736** — la moitié, sur
  le même modèle ; un Xeon 8573C à 1 229 ; deux EPYC 9V74 à **1 332 et
  1 701** ; un EPYC 9V45 à 2 183. <span>Inférence, confiance faible</span> :
  un hôte chargé, que les quatre cœurs logiques d'un runner ne protègent
  pas ; la composition n'en bouge pas — 15,81 % d'écartées et 32,24 % de
  nulles sur ce job, au milieu des autres ;
- **le volume d'entraînement : 269,1 M gardées** après deux vagues, le job
  tenu à l'écart mis à part — 17 % de ~1,6 G. À ~18 M par job, la moyenne
  des deux vagues, **~73 jobs encore, ~9 vagues**.

**La vague 3, lancée le 14 oct. à 21 h 30** — la même recette, `c4697e2`,
huit jobs ; runs 38624068570, 38624081338, 38624094423, 38624107491, 38624120715, 38624133819, 38624147212 et 38624162318. Fin attendue vers 3 h 05. *Attendu, écrit avant* — <span>inférence, confiance moyenne,
les deux vagues et leurs processeurs</span> : **185 à 290 M positions,
124 à 195 M gardées** — le bas compte un runner à moitié vitesse, comme
celui de la vague 2 ; écartées **15,4 à 16,0 %**, nulles **31,8 à
32,7 %**.

**La vague 3, RELEVÉE le 15 oct. à 3 h 15 — dans ses attendus, sur les
quatre chiffres.** Les huit jobs finis à 3 h 00 :

| | vague 3 | attendu, écrit avant |
|---|---|---|
| positions | **245 971 974** | 185 à 290 M |
| gardées par le filtre | **165 155 160** (67,1 %) | 124 à 195 M |
| parties écartées, sur les gardées | **15,74 %**, d'un job à l'autre 15,63 à 15,89 % | 15,4 à 16,0 % |
| nulles | **32,27 %**, d'un job à l'autre 32,09 à 32,42 % | 31,8 à 32,7 % |

- **les processeurs** : trois EPYC 9V74 à 1 702, 1 710 et 1 719 positions
  par seconde — la vague 2 en montrait un à 1 332 —, un EPYC 9V45 à 2 177,
  trois EPYC 7763 à 1 283 à 1 340, un Xeon 8370C, neuf dans ces tables, à
  1 199 ;
- **le volume d'entraînement : 434,3 M gardées** après trois vagues, le
  job tenu à l'écart mis à part — 27 % de ~1,6 G. À ~18,9 M par job, la
  moyenne des 23 jobs d'entraînement, **~62 jobs encore, ~8 vagues**.

**La vague 4, lancée le 15 oct. à 3 h 20** — la même recette, `c4697e2`,
huit jobs ; runs 38664957401, 38664965647, 38664973720, 38664981879, 38664989777, 38664997418, 38665005177 et 38665013007. Fin attendue vers 8 h 55. *Attendu, écrit avant* — <span>inférence, confiance moyenne,
les trois vagues</span> : **185 à 290 M positions, 124 à 195 M
gardées** ; écartées **15,4 à 16,0 %**, nulles **31,8 à 32,7 %**.

**La vague 4, RELEVÉE le 15 oct. à 9 h 15 — dans ses attendus, sur les
quatre chiffres.** Les huit jobs finis à 8 h 50 :

| | vague 4 | attendu, écrit avant |
|---|---|---|
| positions | **212 015 789** | 185 à 290 M |
| gardées par le filtre | **142 333 501** (67,1 %) | 124 à 195 M |
| parties écartées, sur les gardées | **15,73 %**, d'un job à l'autre 15,57 à 15,81 % | 15,4 à 16,0 % |
| nulles | **32,31 %**, d'un job à l'autre 32,23 à 32,40 % | 31,8 à 32,7 % |

- **les processeurs** : quatre EPYC 7763 à 1 296 à 1 311 positions par
  seconde, deux Xeon (8370C, 8573C) à 1 188 et 1 244, deux EPYC 9V74 à
  1 348 et 1 721 — le 9V74 se partage entre deux régimes d'une vague à
  l'autre ; aucun 9V45 cette fois ;
- **le volume d'entraînement : 576,6 M gardées** après quatre vagues, le
  job tenu à l'écart mis à part — 36 % de ~1,6 G. À ~18,6 M par job, la
  moyenne des 31 jobs d'entraînement, **~55 jobs encore, ~7 vagues**.

**La vague 5, lancée le 15 oct. à 9 h 20** — la même recette, `c4697e2`,
huit jobs ; runs 38697853489, 38697863368, 38697872916, 38697882539, 38697892416, 38697902774, 38697912990 et 38697922671. Fin attendue vers 14 h 55. *Attendu, écrit avant* — <span>inférence, confiance moyenne,
les quatre vagues</span> : **185 à 290 M positions, 124 à 195 M
gardées** ; écartées **15,4 à 16,0 %**, nulles **31,8 à 32,7 %**.

**La vague 5, RELEVÉE le 15 oct. à 15 h 10 — dans ses attendus, sur les
quatre chiffres.** Les huit jobs finis à 14 h 50 :

| | vague 5 | attendu, écrit avant |
|---|---|---|
| positions | **268 145 766** | 185 à 290 M |
| gardées par le filtre | **180 029 076** (67,1 %) | 124 à 195 M |
| parties écartées, sur les gardées | **15,76 %**, d'un job à l'autre 15,62 à 15,87 % | 15,4 à 16,0 % |
| nulles | **32,29 %**, d'un job à l'autre 32,21 à 32,37 % | 31,8 à 32,7 % |

- **les processeurs** : deux EPYC 9V45 à 2 210 et 2 287 positions par
  seconde, trois EPYC 9V74 à 1 706 à 1 724 — tous au régime rapide —,
  trois EPYC 7763 à 1 297 à 1 307 ; aucun Xeon. La plus grosse vague à
  ce jour, et le volume ne fait que suivre la composition : les taux,
  eux, ne bougent pas ;
- **le volume d'entraînement : 756,7 M gardées** après cinq vagues, le
  job tenu à l'écart mis à part — 47 % de ~1,6 G. À ~19,4 M par job, la
  moyenne des 39 jobs d'entraînement, **~44 jobs encore, ~6 vagues**.

**La vague 6, lancée le 15 oct. à 15 h 10** — la même recette, `c4697e2`,
huit jobs ; runs 38740299898, 38740307273, 38740315429, 38740328347, 38740339122, 38740349014, 38740358656 et 38740368533. Fin attendue vers 20 h 45. *Attendu, écrit
avant* — <span>inférence, confiance moyenne, les cinq vagues</span> :
**185 à 290 M positions, 124 à 195 M gardées** ; écartées **15,4 à
16,0 %**, nulles **31,8 à 32,7 %**.

**La vague 6, RELEVÉE le 15 oct. à 21 h 00 — dans ses attendus, sur les
quatre chiffres.** Les huit jobs finis à 20 h 40 :

| | vague 6 | attendu, écrit avant |
|---|---|---|
| positions | **266 060 263** | 185 à 290 M |
| gardées par le filtre | **178 612 263** (67,1 %) | 124 à 195 M |
| parties écartées, sur les gardées | **15,77 %**, d'un job à l'autre 15,49 à 15,94 % | 15,4 à 16,0 % |
| nulles | **32,29 %**, d'un job à l'autre 32,19 à 32,37 % | 31,8 à 32,7 % |

- **les processeurs** : deux EPYC 9V45 à 2 239 et 2 338 positions par
  seconde, deux EPYC 9V74 à 1 597 et 1 716 — le premier entre les deux
  régimes vus jusqu'ici —, un **Xeon 6973P-C, neuf dans ces tables, à
  1 753**, deux EPYC 7763 à 1 285 et 1 289, un Xeon 8573C à 1 220 ;
- **le volume d'entraînement : 935,3 M gardées** après six vagues, le
  job tenu à l'écart mis à part — 58 % de ~1,6 G. À ~19,9 M par job, la
  moyenne des 47 jobs d'entraînement, **~33 jobs encore, ~4 vagues**.

**La vague 7, lancée le 15 oct. à 21 h 00** — la même recette, `c4697e2`,
huit jobs ; runs 38790151546, 38790162034, 38790172823, 38790182980, 38790193608, 38790203674, 38790214545 et 38790224445. Fin attendue le 16 oct. vers 2 h 35. *Attendu, écrit
avant* — <span>inférence, confiance moyenne, les six vagues</span> :
**185 à 290 M positions, 124 à 195 M gardées** ; écartées **15,4 à
16,0 %**, nulles **31,8 à 32,7 %**.

**La vague 7, RELEVÉE le 16 oct. à 2 h 45 — dans ses attendus, sur les
quatre chiffres.** Les huit jobs finis à 2 h 30 :

| | vague 7 | attendu, écrit avant |
|---|---|---|
| positions | **242 171 717** | 185 à 290 M |
| gardées par le filtre | **162 615 844** (67,1 %) | 124 à 195 M |
| parties écartées, sur les gardées | **15,74 %**, d'un job à l'autre 15,64 à 15,85 % | 15,4 à 16,0 % |
| nulles | **32,26 %**, d'un job à l'autre 32,13 à 32,37 % | 31,8 à 32,7 % |

- **les processeurs** : un EPYC 9V45 à 2 221 positions par seconde,
  trois EPYC 9V74 à 1 350, 1 401 et 1 721 — deux au régime lent, un
  rapide —, le Xeon 6973P-C revu à 1 684, deux EPYC 7763 à 1 298 et
  1 311, un Xeon 8573C à 1 245 ;
- **le volume d'entraînement : 1 097,9 M gardées** après sept vagues,
  le job tenu à l'écart mis à part — 69 % de ~1,6 G. À ~20,0 M par job,
  la moyenne des 55 jobs d'entraînement, **~25 jobs encore, ~3 vagues**.

**La vague 8, lancée le 16 oct. à 2 h 45** — la même recette, `c4697e2`,
huit jobs ; runs 38831468864, 38831475554, 38831482415, 38831489161, 38831495931, 38831502475, 38831508720 et 38831514780. Fin attendue vers 8 h 20. *Attendu, écrit
avant* — <span>inférence, confiance moyenne, les sept vagues</span> :
**185 à 290 M positions, 124 à 195 M gardées** ; écartées **15,4 à
16,0 %**, nulles **31,8 à 32,7 %**.

**La vague 8, RELEVÉE le 16 oct. à 8 h 30 — dans ses attendus, sur les
quatre chiffres.** Les huit jobs finis à 8 h 20 :

| | vague 8 | attendu, écrit avant |
|---|---|---|
| positions | **213 041 203** | 185 à 290 M |
| gardées par le filtre | **143 035 099** (67,1 %) | 124 à 195 M |
| parties écartées, sur les gardées | **15,68 %**, d'un job à l'autre 15,51 à 15,85 % | 15,4 à 16,0 % |
| nulles | **32,26 %**, d'un job à l'autre 32,10 à 32,38 % | 31,8 à 32,7 % |

- **les processeurs** : cinq EPYC 7763 à 1 283 à 1 304 positions par
  seconde, trois Xeon 8573C à 1 416 à 1 438 — **un second régime pour ce
  processeur**, 1 220 à 1 245 jusqu'ici ; aucun EPYC 9V74 ni 9V45. La
  composition la plus lente depuis la vague 1, et le volume la suit ;
  les taux, non ;
- **le volume d'entraînement : 1 240,9 M gardées** après huit vagues, le
  job tenu à l'écart mis à part — 78 % de ~1,6 G. À ~19,7 M par job, la
  moyenne des 63 jobs d'entraînement, **~18 jobs encore, un peu plus de
  deux vagues**. La règle d'arrêt reste celle du protocole — ~1,6 G, ou
  plus tôt si la séance le décide. <s>la taille de la dernière vague se
  décidera à la relève de la vague 9, sur le cumul mesuré.</s> **Faux,
  relevé par Théo le 16 oct.** : ~18 jobs, c'est plus de deux vagues — la
  vague 10 sera pleine quoi qu'il arrive, et la seule question, un reliquat
  de quelques jobs, appartient à la relève de la vague 10.

**La règle de fin, écrite le 16 oct. à 14 h 10, avant la relève de la vague 9 — ses journaux non lus** : après
la vague 10, **on s'arrête si le cumul d'entraînement atteint 1,5 G**
gardées ; en dessous, un reliquat de jobs, juste ce qu'il faut pour
1,6 G au débit moyen. Raison : ~1,6 G n'est pas une cible fine — voir
plus bas —, et 1 à 3 jobs de plus, 2 à 4 % du volume, ne se verraient
dans aucune mesure. *Attendu* — <span>inférence, confiance moyenne, les
huit vagues</span> : **1,49 à 1,63 G** après la vague 10, le plus
probable ~1,53 à 1,60 G — **l'arrêt après la vague 10**.

**Pourquoi ~1,6 G, et pas plus ni moins — ce qui est mesuré et ce qui ne
l'est pas.** Le chiffre est **× 10 les 159 M** sur lesquels les seaux de
roi ont régressé : un ORDRE DE GRANDEUR, choisi le 13 oct. (« ~8 à 10
vagues pour × 10 »), pas un point d'une courbe. Ce qui est mesuré : à
159 M, les seaux de roi retiennent dès ~6 passes et régressent de −59 et
−134 Elo (n° 17, `nnue_validation.rs`) — ils manquent de données, et un
× 2 risquait de ne rien trancher. Ce qui borne vers le haut : ~80 jobs de
5 h 30 sur runner, soit ~2,5 jours, sous la clause de charge des conditions
de GitHub (ligne B4) ; ~11 Go d'artefacts gardés 90 jours ; et la séance
sur la carte de Théo, dont la durée croît avec le volume à nombre de
passes égal. **Ce qui n'est PAS mesuré : la pente** — combien rapporte
un doublement de données à architecture fixe. *Comment la mesurer, et
ainsi décider la vague suivante par un fait* : à la séance, le même
réseau entraîné sur une moitié emboîtée (~0,8 G) et sur le tout, comparé
sur le job tenu à l'écart puis par un match ; si la moitié vaut le tout,
plus de données ne paierait pas ; si l'écart est net, un nouveau × 2 se
justifie.

**La vague 9, lancée le 16 oct. à 8 h 30** — la même recette, `c4697e2`,
huit jobs ; runs 38861751668, 38861758821, 38861766291, 38861773204, 38861780421, 38861787224, 38861794604 et 38861801128. Fin attendue vers 14 h 05. *Attendu, écrit
avant* — <span>inférence, confiance moyenne, les huit vagues</span> :
**185 à 290 M positions, 124 à 195 M gardées** ; écartées **15,4 à
16,0 %**, nulles **31,8 à 32,7 %**.

**La vague 9, RELEVÉE le 16 oct. à 14 h 25 — dans ses attendus, sur les
quatre chiffres.** Les huit jobs finis à 14 h 05 :

| | vague 9 | attendu, écrit avant |
|---|---|---|
| positions | **247 880 043** | 185 à 290 M |
| gardées par le filtre | **166 404 333** (67,1 %) | 124 à 195 M |
| parties écartées, sur les gardées | **15,71 %**, d'un job à l'autre 15,63 à 15,86 % | 15,4 à 16,0 % |
| nulles | **32,24 %**, d'un job à l'autre 32,04 à 32,41 % | 31,8 à 32,7 % |

- **les processeurs** : un EPYC 9V45 à 2 260 positions par seconde, trois
  EPYC 9V74 au régime rapide, 1 707 à 1 717, trois EPYC 7763 à 1 290 à
  1 295, un Xeon 8573C revenu au régime lent, 1 243 ;
- **le volume d'entraînement : 1 407,3 M gardées** après neuf vagues, le
  job tenu à l'écart mis à part — 88 % de ~1,6 G, ~10 jobs encore à
  ~19,8 M. La vague 10 part pleine ; **même au bas de son attendu, 124 M,
  elle porte le cumul à 1,53 G** — la règle de fin écrite plus haut
  arrêtera donc la génération après elle, sauf vague hors attendu.

**La vague 10, lancée le 16 oct. à 14 h 25** — la même recette, `c4697e2`,
huit jobs, **la dernière si elle tient** ; runs 38900204625, 38900213002, 38900221691, 38900230079, 38900238002, 38900246025, 38900254597 et 38900264329. Fin attendue vers
19 h 55. *Attendu, écrit avant* — <span>inférence, confiance
moyenne, les neuf vagues</span> : **185 à 290 M positions, 124 à 195 M
gardées** ; écartées **15,4 à 16,0 %**, nulles **31,8 à 32,7 %** ; le
cumul d'entraînement à **1,53 à 1,60 G**.

**La vague 10, RELEVÉE le 16 oct. à 20 h 10 — dans ses attendus, sur les
cinq chiffres ; la règle de fin s'applique : la génération S'ARRÊTE.** Les
huit jobs finis à 19 h 55 :

| | vague 10 | attendu, écrit avant |
|---|---|---|
| positions | **232 404 123** | 185 à 290 M |
| gardées par le filtre | **156 024 568** (67,1 %) | 124 à 195 M |
| parties écartées, sur les gardées | **15,73 %**, d'un job à l'autre 15,59 à 15,84 % | 15,4 à 16,0 % |
| nulles | **32,24 %**, d'un job à l'autre 32,11 à 32,33 % | 31,8 à 32,7 % |
| cumul d'entraînement | **1 563 356 858** | 1,53 à 1,60 G |

- **les processeurs** : cinq EPYC 7763 à 1 292 à 1 301 positions par
  seconde, deux EPYC 9V74 à 1 309 — le plus lent jamais vu pour lui — et
  1 709, un EPYC 9V45 à 2 231 ;
- **1,563 G ≥ 1,5 G : arrêt**, par la règle écrite avant la relève de la
  vague 9.

**N° 18 — le volume, CLOS le 16 oct. à 20 h 10 : le bilan.**

| | |
|---|---|
| jobs | **80** — dix vagues de huit, tous en succès ; **79 appris**, 1 tenu à l'écart (38531414161, vague 1) |
| parties, appris | **18 435 764** |
| positions, appris | **2 328 546 367** |
| gardées par le filtre, appris | **1 563 356 858** — × 9,83 les 159 087 014 de N5l |
| écartées / nulles, sur les gardées | 15,73 % / 32,28 %, dix vagues entre 15,68 et 15,77 % et 32,24 et 32,34 % |
| le job tenu à l'écart | 202 898 parties, 25 628 451 positions, 17 208 872 gardées |
| artefacts | **80, 8,50 Go** compressés (lu à l'API) ; ~10 Go décompressés, <span>inférence, confiance moyenne : ~4,1 octets par position, d'après le « volume sur disque » des résumés</span> |
| expiration | **du 12 janv. 2027 à 8 h 54 au 14 janv. 2027 à 13 h 24** (UTC à l'API : 7 h 54 et 12 h 24) |
| le dépôt en tout | 1 194 artefacts vivants, **11,02 Go** (lu à l'API le 16 oct.) — aucun refusé |

**Chaque job, compté — `tools/n18-jobs.tsv`** : run, artefact, vague,
rôle (`tenu` ou `appris`), parties, positions, gardées, octets
compressés. Lu dans le journal de chaque job et à l'API ; ses sommes par
vague retombent au chiffre près sur les dix tableaux ci-dessus — un
contrôle de la recopie, fait avant de l'écrire. C'est la liste dont la
séance tire ses sous-ensembles, et dont elle tire ses `--attendu` : rien
n'y est recopié à la main.

**N° 18 — la séance, écrite le 16 oct. à 20 h 20, avant de la demander.**
Six réseaux, depuis zéro, sur la carte de Théo, l'un après l'autre et sans
surveillance. Ce que chacun mesure :

| réseau | architecture (commit) | données | superlots | ce qu'il mesure |
|---|---|---|---|---|
| **N6l** | celle de N5l (`main`) | les 79 jobs, 1,563 G gardées | **100** | **le volume et l'étiqueteur** ensemble : le candidat principal, contre N5l |
| **N6m** | celle de N5l (`main`) | les vagues 1 à 5, 39 jobs, 756,7 M gardées — **une moitié emboîtée** (48,4 %) | 100 | **la pente** : contre N6l, à calcul égal |
| **N6v** | celle de N5l (`main`) | les 9 premiers jobs appris, 155,8 M gardées — **à volume égal** de N5l, −2,1 % | **40**, ceux de N5l | **l'étiqueteur seul** : contre N5l, rien d'autre ne change |
| **N6r4** | 4 seaux de roi (`4a604ea`) | les 79 jobs | 100 | **les seaux de roi sur le volume** — la raison du n° 18 |
| **N6r10** | 10 seaux de roi (`f729f8c`) | les 79 jobs | 100 | idem, dix seaux |
| **N6l200** | celle de N5l (`main`) | les 79 jobs | **200** | **le nombre de superlots** : contre N6l, à données égales |

- **100 superlots, et pourquoi** : un superlot vaut 16 384 × 6 104 =
  **100,0 M positions** (`tools/nnue-train`, `TrainingSteps`) ; 40 en
  faisaient 25 passes sur 159 M, et ne feraient que 2,6 passes sur
  1,563 G. 100 en font 6,4, et la décroissance cosinus se cale sur le
  dernier — un point de sauvegarde au milieu n'est pas un entraînement
  plus court (la réserve du n° 17). Le nombre se mesure donc par un
  second entraînement, N6l200, pas par les points de N6l ;
- **384 et 512 unités n'y sont pas** : il leur faut des commits
  d'architecture neufs, et une séance de plus. Ce que celle-ci dira de la
  pente et des superlots dira aussi comment les entraîner ;
- **les sous-ensembles sont emboîtés et tirés du TSV**, dans son ordre :
  N6v ⊂ N6m ⊂ N6l. La génération était la même recette à 5 000 nœuds,
  d'une vague à l'autre — seuls les runners changeaient, qui ne changent
  que le débit : les vagues sont interchangeables.

**Vérifié ici avant de l'écrire** : à `main` (`0725ef8`), `tools/nnue-train`
compile avec `--locked` et passe ses **sept** tests — contre le runtime
factice de bullet, donc sans rien dire de CUDA — dont
`les_seaux_du_moteur_sont_ceux_de_bullet` ; le programme n'a pas changé
depuis `4a604ea` et `f729f8c` (`git diff` vide sur `tools/nnue-train`), qui
ont entraîné N5r4 et N5r10 le 14 oct. Chaque bloc se colle dans le MÊME
terminal, dans l'ordre :

0. **le dépôt à jour, et la place** :
   ```sh
   cd ~/chess && git status
   git fetch origin && git switch main && git pull --ff-only
   git log -1 --format='%h %cd'
   df -h ~
   ```
   — `git log` doit dater du 16 oct. 2026 ou d'après ; **12 Go libres au
   moins** : ~10 Go de données, plus les points de sauvegarde. Des fichiers
   « modifiés », un `--ff-only` qui refuse : s'arrêter et le dire. Les
   données des séances précédentes — `~/nnue-vague3`, le binpack de
   Leela — peuvent rester ;
1. **les données — 79 archives, 8,41 Go, avant le 12 janv. 2027** ; le
   job tenu à l'écart ne descend pas : il ne sert qu'à la perte tenue à
   l'écart, calculée sur runner, et l'absence même de ses fichiers garantit
   qu'aucun entraînement ne l'a vu. Avec
   `gh` connecté (`gh auth status`), une boucle télécharge et décompresse,
   chaque job dans son dossier, et reprend là où elle s'est arrêtée si on
   la relance :
   ```sh
   D=~/nnue-n18; mkdir -p $D
   awk -F'\t' '$4=="appris" {print $1}' ~/chess/tools/n18-jobs.tsv |
   while read r; do
     [ -d $D/$r ] && continue
     rm -rf $D/.tmp-$r
     gh run download $r -R theodubus/chess -n nnue-$r -D $D/.tmp-$r \
       && mv $D/.tmp-$r $D/$r || { echo "ÉCHEC sur $r"; break; }
   done
   ls $D/*/*.vf | wc -l; du -sh $D
   ```
   — **316** fichiers `.vf`, quatre par job, ~10 Go. Sans `gh` : un jeton
   GitHub au droit « Actions : lecture » sur `theodubus/chess`, et la même
   boucle par l'API — le TSV porte l'identifiant de chaque artefact :
   ```sh
   D=~/nnue-n18; mkdir -p $D; TOKEN=…   # le jeton
   awk -F'\t' '$4=="appris" {print $1, $2}' ~/chess/tools/n18-jobs.tsv |
   while read r a; do
     [ -d $D/$r ] && continue
     rm -rf $D/.tmp-$r
     curl -fsSL -H "Authorization: Bearer $TOKEN" -o $D/$r.zip \
       https://api.github.com/repos/theodubus/chess/actions/artifacts/$a/zip \
       && unzip -q -o $D/$r.zip -d $D/.tmp-$r && mv $D/.tmp-$r $D/$r \
       && rm $D/$r.zip || { echo "ÉCHEC sur $r"; break; }
   done
   ls $D/*/*.vf | wc -l; du -sh $D
   ```
2. **les trois listes**, tirées du TSV — le job tenu à l'écart n'y est
   jamais :
   ```sh
   T=~/chess/tools/n18-jobs.tsv
   TOUS=$(awk -F'\t' -v d=$D '$4=="appris" {print d"/"$1}' $T)
   MOITIE=$(awk -F'\t' -v d=$D '$4=="appris" && $3<=5 {print d"/"$1}' $T)
   EGAL=$(awk -F'\t' -v d=$D '$4=="appris" {print d"/"$1}' $T | head -9)
   echo $TOUS | wc -w; echo $MOITIE | wc -w; echo $EGAL | wc -w
   ```
   — **79, 39 et 9** ;
3. **CUDA dans ce terminal** — le bloc « CUDA dans ce terminal » de la
   séance d'entraînement du n° 7, tel quel ;
4. **un essai court d'abord** — un superlot sur tout, qui relit d'abord
   chaque octet des 79 jobs et refuse au moindre écart de compte :
   ```sh
   cd ~/chess/tools/nnue-train
   cargo run --release --features cuda -- --attendu 18435764:2328546367 --superlots 1 \
     --sortie essai18 $TOUS 2>&1 | tee essai18.sortie.txt
   ```
   il doit finir sur `RÉSEAU PRÊT : essai18/shallowred-768x256-s8-1/quantised.bin`.
   Un écart de compte dit une archive incomplète : supprimer son dossier
   et relancer la boucle de l'étape 1. Un `ÉCHEC — le moteur n'évalue pas
   comme l'entraîneur` : s'arrêter et m'envoyer la sortie. **Noter la durée
   de la relecture** — elle se répétera à chaque réseau ;
5. **les six réseaux, d'une traite** — un échec arrête la chaîne, et
   `pipefail` fait compter celui de l'entraînement, pas celui de `tee` :
   ```sh
   set -o pipefail
   cd ~/chess/tools/nnue-train && git switch main &&
   cargo run --release --features cuda -- --attendu 18435764:2328546367 --superlots 100 \
     --sortie n6l $TOUS 2>&1 | tee n6l.sortie.txt &&
   cargo run --release --features cuda -- --attendu 8920492:1126989018 --superlots 100 \
     --sortie n6m $MOITIE 2>&1 | tee n6m.sortie.txt &&
   cargo run --release --features cuda -- --attendu 1836408:232052120 --superlots 40 \
     --sortie n6v $EGAL 2>&1 | tee n6v.sortie.txt &&
   git checkout 4a604ea &&
   cargo run --release --features cuda -- --attendu 18435764:2328546367 --superlots 100 \
     --sortie n6r4 $TOUS 2>&1 | tee n6r4.sortie.txt &&
   git checkout f729f8c &&
   cargo run --release --features cuda -- --attendu 18435764:2328546367 --superlots 100 \
     --sortie n6r10 $TOUS 2>&1 | tee n6r10.sortie.txt &&
   git switch main &&
   cargo run --release --features cuda -- --attendu 18435764:2328546367 --superlots 200 \
     --sortie n6l200 $TOUS 2>&1 | tee n6l200.sortie.txt
   echo "FIN : $?"; git switch main
   ```
   → `RÉSEAU PRÊT :` respectivement `n6l/shallowred-768x256-s8-100`,
   `n6m/shallowred-768x256-s8-100`, `n6v/shallowred-768x256-s8-40`,
   `n6r4/shallowred-768x4hm-256-s8-100`, `n6r10/shallowred-768x10hm-256-s8-100`
   et `n6l200/shallowred-768x256-s8-200`, chacun suivi de
   `/quantised.bin`, et **`FIN : 0`**. Git annonce une « HEAD détachée » aux
   deux `checkout` : c'est voulu. Interrompue, la chaîne se reprend au
   réseau qui manque, en recollant ses lignes à partir de lui ;
6. **rapporter** — les réseaux sur `reseau/n18`, et un point de
   sauvegarde sur deux (tous les 20 superlots) sur `reseau/n18-points` :
   ```sh
   cd ~/chess && git switch -c reseau/n18
   for c in n6l:768x256-s8-100 n6m:768x256-s8-100 n6v:768x256-s8-40 \
            n6r4:768x4hm-256-s8-100 n6r10:768x10hm-256-s8-100 n6l200:768x256-s8-200; do
     n=${c%%:*}; a=${c#*:}; d=tools/nnue-train/$n/shallowred-$a
     cp $d/quantised.bin reseaux/$n-$a.bin
     cp $d/log.txt reseaux/$n-$a.log.txt
     cp tools/nnue-train/$n.sortie.txt reseaux/$n-$a.sortie.txt
   done
   cp tools/nnue-train/essai18.sortie.txt reseaux/essai18.sortie.txt
   git add reseaux/n6* reseaux/essai18.sortie.txt
   git commit -m "Réseaux NNUE du n° 18 : N6l, N6m, N6v, N6r4, N6r10, N6l200 — le volume"
   git push -u origin reseau/n18
   git switch -c reseau/n18-points
   mkdir -p reseaux/points-n18
   for d in tools/nnue-train/n6*/shallowred-*; do
     s=${d##*-}; [ $((s % 20)) -eq 0 ] || continue
     cp $d/quantised.bin reseaux/points-n18/$(basename $(dirname $d))-$(basename $d).bin
   done
   ls reseaux/points-n18 | wc -l
   git add reseaux/points-n18
   git commit -m "Points de sauvegarde du n° 18, tous les 20 superlots"
   git push -u origin reseau/n18-points
   git switch main
   ```
   — **32** points : 5 par réseau à 100 superlots, 2 pour N6v, 10 pour
   N6l200 ; ~36 Mo, dont les trois quarts pour les seaux de roi. **Garder
   `~/nnue-n18` et les dossiers `n6*/`** : un ré-entraînement en
   repartirait, et 384 ou 512 unités s'entraîneront sur les mêmes données.

*Durée* — <span>inférence, confiance faible</span> : N5l a pris 13 min 00 s
pour 40 superlots, soit ~19,5 s chacun, et les positions vues ne dépendent
pas du volume ; N5r4 et N5r10, ~23,6 et ~31,9 s. D'où **N6l ~33 min, N6m
~33, N6v ~13, N6r4 ~39, N6r10 ~53, N6l200 ~65 : ~4 h d'entraînement**,
plus six relectures dont l'essai donnera la durée — sur 2,3 G positions
au lieu de 242 M. **Une nuit.** Le téléchargement dépend de la ligne :
8,5 Go.

**Ce qui suit, écrit avant** : pour chaque réseau, la confrontation
recopiée dans le moteur, le candidat révoqué aussitôt, ses nœuds par
seconde au rejeu, la sonde de B8 — son facteur des marges ; **la perte
tenue à l'écart** de chaque réseau et de ses points, sur 38531414161, par
`nnue-validation` sur runner. Puis **24 jobs de 2 800 parties à
`8+0,08`**, <s>en deux vagues de douze</s> **en une seule — corrigé le
17 oct. à 7 h 35, avant de lancer** : trente jobs ont tourné ensemble le
5 oct. sans attente (n° 9), et rien ne lie une comparaison à une autre ;
la seconde vague n'aurait acheté que six heures de retard :
- **N6l, N6r4, N6r10 contre N5l**, quatre jobs chacun — la décision ;
- **N6m contre N6l, N6l200 contre N6l, N6v contre N5l**, quatre jobs
  chacun — les trois mesures. Un écart entre deux réseaux se mesure par
  un match direct, pas par la différence de leurs écarts à N5l : celle-ci
  porterait deux incertitudes.

**Le critère d'embarquement, écrit avant** : celui du n° 17 — un gain
démontré contre N5l, borne basse au-dessus de zéro ; parmi les gains
démontrés, le meilleur au point, et un match direct si l'intervalle du
second recoupe le sien. **La lecture de la pente, écrite avant** : N6l
contre N6m démontré positif — un nouveau × 2 de données se justifie,
puisque doubler a encore payé ; compatible avec zéro — plus de données
ne paierait pas à 100 superlots, et la génération s'arrête là pour cette
architecture. *Réserve* : la pente se lit à calcul fixe ; à plus de
superlots, elle peut croître — N6l200 le dira en partie.

*Attendus* — <span>inférence, confiance faible : le volume n'a jamais été
mesuré seul ici</span> :
- **N6v contre N5l : 0 à +25** — un étiqueteur plus fort de ~50 Elo,
  quand celui du 7 oct., plus fort que le sien de bien davantage — la
  composition du n° 9, C41, l'AVX2, N2L —, avait rendu +47 (N4 contre
  N2) ;
- **N6l contre N5l : +15 à +60** — l'étiqueteur et × 9,8 de données ;
- **N6l contre N6m : 0 à +20** ; **N6l200 contre N6l : 0 à +15** ;
- **N6r4 et N6r10 contre N5l : −30 à +40**, sans ordre attendu entre eux
  — ils régressaient de −59 et −134 sur 159 M ; le volume dira s'ils
  manquaient de données ou d'autre chose ;
- **pertes tenues à l'écart** : N6l sous N5l ; N6m entre les deux ; aucun
  point d'aucun réseau ne remonte — 6,4 passes au plus sur 1,563 G, 13
  pour N6m, quand 25 sur 159 M n'en faisaient remonter aucune.

**La séance, RELEVÉE le 17 oct. à 6 h 30 — faite dans la nuit, les six
réseaux conformes.** Poussés par Théo sur `reseau/n18` (`32c9604`) et, les
32 points, sur `reseau/n18-points` (`c04dfe3`) :

| réseau | relecture | confrontation, médian / maximal (admis 15 / 50) | entraînement | estimé |
|---|---|---|---|---|
| essai, 1 superlot | exacte, 18 435 764 : 2 328 546 367 | 2 / 16 | 29 s | — |
| **N6l** | exacte | 6 / 16 | 33 min 53 s | ~33 min |
| **N6m** | exacte, 8 920 492 : 1 126 989 018 | 5 / 18 | 34 min 07 s | ~33 |
| **N6v** | exacte, 1 836 408 : 232 052 120 | 4 / 21 | 13 min 40 s | ~13 |
| **N6r4** | exacte | 4 / 29 | 39 min 29 s | ~39 |
| **N6r10** | exacte | 7 / 13 | 52 min 15 s | ~53 |
| **N6l200** | exacte | 3 / 20 | 1 h 07 min 28 s | ~65 |

- **les durées, à 3 % de l'estimé** : ~20,3 s par superlot à 256 unités,
  ~23,7 et ~31,4 avec quatre et dix seaux de roi — les vitesses du n° 17,
  à volume dix fois plus grand : les positions vues ne dépendaient pas du
  volume, comme écrit. Le premier lancement de l'essai, sans les listes
  dans le terminal (« aucun fichier de données »), n'a rien coûté ;
- **le journal d'entraînement remonte sur les derniers superlots** —
  0,0383 au 20ᵉ, 0,0387 au 100ᵉ pour N6l —, comme au n° 17 : ce n'est pas
  une perte (plus haut, « le journal d'entraînement n'est pas une perte »).

**La perte tenue à l'écart des six réseaux, RELEVÉE le 17 oct. à 6 h 45 —
les trois attendus tiennent ; doubler les données ne se voit presque plus
à 100 superlots, et les seaux de roi passent devant.** Run 39003117564,
cinq minutes. *Le contrôle d'abord* : **17 208 872** et **17 938 594**
positions, les `gardees` du TSV au chiffre près. Perte moyenne,
intervalle par partie ; écart à N5l apparié, mêmes positions :

| réseau | tenu à l'écart — 38531414161 | écart à N5l | appris de tous — 38531424497 | tenu − appris |
|---|---|---|---|---|
| N5l, pour référence | 0,040336 ± 0,000201 | — | 0,040292 | +0,000044 — deux jobs qu'il n'a jamais vus |
| **N6v** — 155,8 M, 40 superlots | 0,039793 | **−0,000542 ± 0,000050** | 0,038490 | +0,001303 |
| **N6m** — 756,7 M, 100 | 0,038991 | **−0,001345 ± 0,000046** | 0,038691 | +0,000300 |
| **N6l** — 1,563 G, 100 | 0,038942 | **−0,001394 ± 0,000046** | 0,038765 | +0,000177 |
| **N6l200** — 1,563 G, 200 | 0,038890 | **−0,001446 ± 0,000047** | 0,038722 | +0,000168 |
| **N6r4** — 1,563 G, 100 | 0,038560 | **−0,001775 ± 0,000050** | 0,038148 | +0,000412 |
| **N6r10** — 1,563 G, 100 | 0,038534 | **−0,001802 ± 0,000051** | 0,037840 | +0,000694 |

- **les attendus** : N6l sous N5l, à trente intervalles ; N6m entre les
  deux — **de justesse** : 0,000049 au-dessus de N6l, 3,5 % de ce que N6l
  gagne sur N5l ; aucun point d'aucun réseau ne remonte — les 32 points
  descendent jusqu'au dernier, sur les deux jobs ;
- **la pente, en perte** : de la moitié au tout, à 100 superlots, presque
  rien. De 155,8 M à 40 superlots (N6v) à 756,7 M à 100 (N6m), beaucoup —
  mais le calcul change avec le volume, et N6v retient (tenu − appris
  ×7 celui de N6l) : 25 passes sur peu de données. *Les matchs liront la
  pente par le critère écrit* ; la perte la dit déjà petite ;
- **les superlots, en perte** : N6l200 ne gagne que 0,000052 sur N6l. Et
  son point à 100 (0,040145) est bien au-dessus du N6l final (0,038942) —
  **la réserve du pas cosinus, vérifiée** : un point au milieu d'un
  entraînement n'est pas un entraînement plus court ;
- **les seaux de roi, renversés par le volume** : sur 159 M, N5r4 et N5r10
  perdaient sur N5l tenu à l'écart ; sur 1,563 G, N6r4 et N6r10 passent
  devant N6l de 0,00038 et 0,00041. Ils retiennent davantage (tenu − appris
  0,0004 et 0,0007, contre 0,0002) mais apprennent plus encore. <span>Inférence,
  confiance moyenne</span> : à ce volume, la capacité limite l'architecture
  plate plus que les données — le coin « l'architecture sature » du tableau
  de lecture, que les matchs confirmeront ou non ;
- **ce que cela ne dit pas** : la force (`CLAUDE.md`, Texel). Les seaux de
  roi coûtent ~7 % de vitesse au-delà de la largeur (n° 17), et la perte
  n'en sait rien.

**Les candidats, écrits le 17 oct.** — chacun, sur `2648fb1` (`main` plus
les réseaux), ne change que `engine/src/nnue.rs` : l'architecture, le
chemin d'`include_bytes!` et la confrontation de son entraînement recopiée
dans le test, aux dix-huit positions ; au facteur des marges de `main`,
2,85 ; `verify.sh --rapide` vert à chaque état, et révoqué aussitôt :

| réseau | candidat | révoqué par |
|---|---|---|
| N6l | `e769992` | `a2766fc` |
| N6m | `0edbe22` | `648a92b` |
| N6v | `6844597` | `8e76948` |
| N6r4 | `cd6ed79` | `0384ee7` |
| N6r10 | `04727b5` | `5a187c8` |
| N6l200 | `8416e67` | `1bb60b7` |

La référence des matchs contre N5l : **`2648fb1`** — `main` et ses réseaux,
N5l embarqué.

**La sonde de B8 sur les six — écrite le 17 oct. à 7 h 00, avant de la
lancer.** Le protocole du n° 17 tel quel : 40 parties de chaque candidat
contre lui-même à `8+0,08`, `-srand 20260930`, le livre du dépôt ; le
binaire sondé est le candidat plus `b8-sonde-marges.patch` ; la faite main,
celle du 12 oct. — son chemin n'a pas bougé : le `reglage!` du n° 19 rend
le binaire par défaut identique à l'octet. **La règle, recentrée sur le
facteur en place** : elle s'écrivait « ± 25 % de 2,24 » quand `main` jouait
2,24 ; `main` joue 2,85 depuis N5l, donc **dans 2,14 à 3,56, le réseau se
mesure au facteur de `main`** ; hors de cette plage, son facteur d'abord,
et le candidat porte les deux. *Attendus* — <span>inférence, confiance
faible</span> : **2,5 à 3,3 pour les quatre plats** — des étiquettes à
l'échelle de N5l, quand N5l, appris sur celles de N2L, mesurait 2,85 ;
**2,8 à 3,6 pour N6r4 et N6r10** — N5r10 mesurait 3,38, son score bougeant
davantage d'une itération à l'autre. Tous dans la plage, sauf peut-être
N6r10 par le haut.

**Leurs nœuds par seconde — écrits avant.** Le rejeu du n° 15, `--nps`,
binaires AVX2, dix tours, contre N5l, après la sonde. *Attendus* —
<span>inférence, confiance moyenne</span> : **N6l, N6m, N6v, N6l200 ×
0,99 à × 1,01** — la même architecture, le même code, seuls les poids
changent ; **N6r4 × 0,91 à × 0,95, N6r10 × 0,90 à × 0,94** — N5r4 et
N5r10 valaient × 0,931 et × 0,918 de N5l le 14 oct.

**La sonde de B8, RELEVÉE le 17 oct. à 7 h 30 — les six dans la plage,
tous mesurés au facteur de `main`, 2,85.** Six binaires construits à
6 h 59, 40 parties chacun, finies entre 7 h 04 et 7 h 28 ; zéro perte au
temps, zéro anomalie ; la faite main, celle du 12 oct. (0,40 % d'élagages
delta fautifs, 4,1 % d'itérations hors de la première fenêtre). La
rustine s'applique et compile telle quelle :

| réseau | facteur delta | facteur aspiration | moyenne géométrique | hors fenêtre à δ = 25 | par la règle (2,14 à 3,56) |
|---|---|---|---|---|---|
| N5l, le 14 oct. | × 2,9 | × 2,80 | 2,85 | 13,2 % | — le facteur en place |
| **N6l** | × 2,6 | × 2,40 | **2,50** | 10,4 % | dedans — 2,85 |
| **N6m** | × 3,1 | × 2,20 | **2,61** | 9,6 % | dedans — 2,85 |
| **N6v** | × 3,1 | × 2,00 | **2,49** | 8,3 % | dedans — 2,85 |
| **N6r4** | × 3,1 | × 2,00 | **2,49** | 8,3 % | dedans — 2,85 |
| **N6r10** | × 4,2 | × 2,60 | **3,31** | 11,9 % | dedans — 2,85 |
| **N6l200** | × 3,1 | × 2,20 | **2,61** | 9,5 % | dedans — 2,85 |

- **les candidats ne changent pas** : écrits au facteur de `main`, ils se
  mesurent tels quels — aucun n'a à porter le sien ;
- **l'attendu tient pour trois sur six, et son SENS s'est trompé** :
  N6m, N6l200 et N6r10 dedans ; N6l sur la borne basse (2,498), N6v
  juste sous elle, **N6r4 nettement sous la sienne** (2,49 pour 2,8 à
  3,6). Tous descendent sous N5l sauf N6r10, par l'aspiration surtout :
  leurs scores bougent MOINS d'une itération à l'autre — 8,3 à 11,9 %
  hors de la première fenêtre, contre 13,2 % pour N5l, 13,5 et 17,9 %
  pour N5r4 et N5r10. <span>Inférence, confiance faible</span> : les
  seaux de roi, qui retenaient sur 159 M, retiennent moins sur 1,563 G
  (perte tenue à l'écart, plus haut), et une évaluation qui retient moins
  est moins bruitée d'une itération à l'autre ; le delta, lui, ne bouge
  presque pas — 3,1 pour cinq réseaux sur six, la grille n'ayant rien
  entre 3,0 et 4,0 ;
- **ce que cela mêle** : les plats tombent à 2,49–2,61 et jouent à 2,85,
  ~14 % au-dessus de leur mesure — dans la plage, que la règle a écrite
  précisément pour ne pas régler un facteur par réseau à chaque séance.
  Si le réseau gagné embarque, sa sonde dit déjà qu'un facteur plus bas
  serait à essayer : **une mesure à part, après le verdict**, pas une
  condition du verdict.

**Leurs nœuds par seconde, RELEVÉS le 17 oct. à 7 h 55 — les plats un
peu PLUS rapides que N5l, les seaux de roi moins lents qu'au n° 17 : les
deux attendus manqués, vers le haut.** Le rejeu du n° 15, `--nps`, les
binaires AVX2 construits à 7 h 35–7 h 36, dix tours, la base N5l
(`2648fb1`) à 25 939 629 nœuds par passe ; le conteneur sans autre
charge, les matchs tournant sur les runners :

| réseau | n/s contre N5l, médiane des tours | tours plus lents | signes | *attendu* |
|---|---|---|---|---|
| **N6l** | **× 1,024** | 1 / 10 | p = 0,02 | × 0,99 à × 1,01 — au-dessus |
| **N6m** | × 1,017 | 3 / 10 | p = 0,34 | au-dessus au point, non séparé |
| **N6v** | × 1,012 | 3 / 10 | p = 0,34 | au bord, non séparé |
| **N6l200** | **× 1,037** | 1 / 10 | p = 0,02 | au-dessus |
| **N6r4** | × 0,982 | 8 / 10 | p = 0,11 | × 0,91 à × 0,95 — au-dessus |
| **N6r10** | × 0,956 | 8 / 10 | p = 0,11 | × 0,90 à × 0,94 — au-dessus |

- **à architecture égale, les poids changent la vitesse** — × 1,01 à
  × 1,04 pour les quatre plats, deux d'entre eux séparés de un. Le calcul
  d'une évaluation ne dépend pas des poids ; ce qui change est l'ARBRE :
  un autre réseau cherche d'autres nœuds, dans une autre proportion de
  quiescence, de coupures par la table et d'évaluations par nœud.
  <span>Inférence, confiance moyenne</span> : mon attendu supposait la
  vitesse attachée au code seul, et le n° 17 l'avait déjà démenti en
  petit (N5s × 0,995 contre N4) ;
- **les seaux de roi, ramenés aux plats** : × 0,982 et × 0,956 contre
  N5l, soit × 0,96 et × 0,94 contre la moyenne des plats (× 1,022) — près
  des × 0,931 et × 0,918 du n° 17, un peu au-dessus. Le surcoût propre
  aux seaux n'a pas changé de nature : c'est le même code ;
- **ce que cela pèse** : à cadence horloge, la vitesse entre dans le
  résultat du match, qui mesure tout ensemble. Par l'étalon du temps,
  × 1,02 vaut ~+3 Elo et × 0,956 ~−7 : une petite part des écarts
  attendus.

**Les matchs, lancés le 17 oct. à 7 h 32** — 24 jobs de 2 800 parties à
`8+0,08`, graine « auto » chacun, le binaire AVX2 des deux côtés, en une
seule vague, tous démarrés aussitôt : N6l 39006627542, 39006630789,
39006634098, 39006637356 ; N6r4 39006640794, 39006643956, 39006647319,
39006650513 ; N6r10 39006653746, 39006657174, 39006660641, 39006664408 ;
N6v 39006667845, 39006671292, 39006674945, 39006678512 — contre
`2648fb1`, N5l ; N6m 39006681743, 39006685083, 39006688461, 39006691694 ;
N6l200 39006694641, 39006697705, 39006700858, 39006704130 — contre
`e769992`, N6l. **N6m est le candidat de son match** : la pente se lit au
signe opposé — « N6l contre N6m démontré positif » s'y lit comme une
borne HAUTE sous zéro. Fin attendue vers 12 h 10–12 h 50 — les jobs du
n° 17 finissaient en 4 h 35 à 5 h 17 —, au plus tard au plafond de
350 minutes, 13 h 25. Critère, lecture de la pente et attendus : ceux de
la séance, écrits avant.

#### N° 18 — VERDICT, 17 oct. 2026 : N6r4 +98,74 ± 4,27 et N6r10 +97,30 ± 4,26 Elo à `8+0,08` contre N5l, N6l +76,99 ± 4,00 — les seaux de roi passent devant, un match direct les départage ; doubler les données paie encore (+7,32 ± 3,53)

**Relevé le 17 oct. à 12 h 55** — <s>13 h 00</s>, l'heure d'abord écrite devançait l'horloge. Les 24 jobs finis ENTIERS entre 12 h 28 et
12 h 48, 6,32 à 6,72 s par partie, zéro perte au temps, zéro coup
illégal ; les avertissements « PV continues after… », 0 à 10 par job,
des deux côtés à parts voisines. Chaque groupe de quatre mis en commun
par `tools/mettre-en-commun.sh`, homogène :

| comparaison | les quatre jobs | en commun, 11 200 parties | homogénéité | *attendu, écrit avant* |
|---|---|---|---|---|
| **N6r4 contre N5l** | +92,85, +101,97, +98,61, +101,57 | **+98,74 ± 4,27** | p = 0,457 | −30 à +40 — **dépassé de loin** |
| **N6r10 contre N5l** | +99,14, +99,82, +91,52, +98,74 | **+97,30 ± 4,26** | p = 0,531 | −30 à +40 — **dépassé de loin** |
| **N6l contre N5l** | +76,92, +79,27, +82,41, +69,40 | **+76,99 ± 4,00** | p = 0,113 | +15 à +60 — **dépassé** |
| N6v contre N5l | +2,11, +4,34, +5,96, +9,68 | **+5,52 ± 3,97** | p = 0,545 | 0 à +25 — dedans, en bas |
| N6m contre N6l | −9,31, −6,83, −9,68, −3,47 | **−7,32 ± 3,53** | p = 0,621 | −20 à 0 — dedans |
| N6l200 contre N6l | +8,32, +7,32, +3,97, +2,36 | **+5,49 ± 3,55** | p = 0,652 | 0 à +15 — dedans |

- **le critère, écrit avant** — celui du n° 17 : trois gains démontrés
  contre N5l dans la décision, N6r4, N6r10 et N6l. **Le meilleur au point
  est N6r4** (+94,5 à +103,0) ; **l'intervalle du second, N6r10, recoupe
  le sien** (+93,0 à +101,6) — **un match direct, écrit plus bas**. N6l
  (+73,0 à +81,0) ne recoupe pas N6r4 : il sort. N6l200, qui ne
  décidait rien, se place par la chaîne à ~+82,5 ± 5,3 de N5l
  (<span>inférence, deux intervalles composés</span>) : sous les seaux de
  roi, sans recoupement avec N6r4 ;
- **la pente, lue comme écrit avant** : N6l contre N6m — le signe opposé
  du match — **+7,32 ± 3,53, démontré positif**. La règle écrite le
  disait : *doubler a encore payé, un nouveau × 2 de données se
  justifie*. Réserve écrite avec elle : la pente se lit à calcul fixe,
  100 superlots ; **N6l200 la confirme sous l'autre axe** — deux fois plus
  de passes sur les mêmes données, +5,49 ± 3,55, démontré aussi. Les deux
  leviers paient encore, chacun de ~+5 à +7 ;
- **l'étiqueteur seul** : N6v, les 155,8 M premières positions des
  données neuves à 40 superlots, comme N5l, **+5,52 ± 3,97** — démontré
  de justesse (borne basse +1,6), en bas de l'attendu. Presque tout le
  gain de N6l vient donc du volume : ~+71 sur ~+77
  (<span>inférence, confiance moyenne</span> : N6v diffère aussi de N6l
  par la durée, 40 superlots contre 100 — le volume et la durée y sont
  mêlés) ;
- **le volume, sa courbe** — par la chaîne, N6m (757 M) ≈ +69,7 de N5l
  et N6l (1,563 G) +77,0 : ×4,9 de positions depuis N6v rapportent ~+64,
  le × 2 suivant +7,3. **Concave, comme attendu d'un volume** ; elle ne
  dit pas où elle s'aplatit tout à fait (<span>inférence</span> : mêmes
  réserves de durée) ;
- **les seaux de roi, renversés** : −58,91 et −133,59 contre N4 sur 159 M
  au n° 17 ; **+98,74 et +97,30 contre N5l sur 1,563 G**, soit ~+22 et
  ~+20 au-dessus de N6l par la chaîne. *Le remède écrit au n° 17 — le
  volume, pas moins de durée — était le bon* ; la perte tenue à l'écart
  l'avait annoncé ce matin ;
- **la perte tenue à l'écart a rendu l'ORDRE des matchs, réseau pour
  réseau** : N6r10 ≈ N6r4 < N6l200 < N6l < N6m < N6v < N5l en perte ;
  N6r4 ≈ N6r10 > N6l200 > N6l > N6m > N6v > N5l en Elo — N6r4 et N6r10
  s'échangeant dans le bruit des deux mesures. Deuxième famille sur deux
  où l'ordre retombe (le n° 17 l'avait fait sur trois réseaux).
  **Ce que cela ne fait pas** : remplacer un match (`CLAUDE.md`, Texel)
  — l'ÉCHELLE ne se lit pas en perte, et aucun attendu chiffré depuis
  elle n'a tenu : −0,00139 de perte valait +77, −0,00178 en valait +99 ;
- **les attendus dépassés le sont tous vers le haut** — le volume n'avait
  jamais été mesuré seul ici, confiance faible écrite. Les seaux de roi
  étaient donnés −30 à +40 « sans ordre attendu » : la mesure du n° 17
  ne disait pas combien ils perdaient faute de données.

**Le match direct — N6r10 contre N6r4, écrit le 17 oct. à 12 h 55, avant de
le lancer** — <s>13 h 05</s>, l'heure d'abord écrite devançait l'horloge ;
poussé à 12 h 57 (`6c44d66`), lancé à 12 h 57 : 39026852676, 39026855187,
39026857893, 39026860781 ; fin attendue vers 17 h 50–18 h 15, au plus tard
au plafond de 350 minutes, 18 h 47. Quatre jobs de 2 800 parties à `8+0,08`, graine « auto »
chacun, le binaire AVX2 des deux côtés : `04727b5` (N6r10) contre
`cd6ed79` (N6r4), le même code au bit près, le facteur de `main` (2,85)
des deux côtés. **Critère, écrit avant : N6r10 embarque si la borne basse
de l'intervalle mis en commun est au-dessus de zéro ; sinon N6r4** — le
meilleur au point contre N5l, le plus rapide (× 0,982 de N5l contre
× 0,956) et le plus léger (un binaire de 3,0 Mo contre 5,4 Mo). La règle
du n° 13 : le second doit démontrer. *Attendu* — <span>inférence, confiance
faible</span> : **−10 à +8, ~−2** — à 1,4 Elo l'un de l'autre contre N5l,
vitesse comprise ; la perte tenue à l'écart met N6r10 devant de 0,00003,
dans son bruit. *Puissance dite d'avance* : ± 4,3 — un vrai écart de
quelques Elo ne passera pas la borne, et c'est accepté : à égalité,
le plus léger embarque.

**Le match direct, RELEVÉ le 17 oct. à 18 h 15 — N6r10 contre N6r4,
+0,34 ± 3,59 : rien de démontré, N6R4 EMBARQUÉ par le critère écrit.**
Les quatre jobs finis ENTIERS entre 17 h 54 et 18 h 02, 6,34 à 6,51 s par
partie, zéro perte au temps, zéro coup illégal :

| match | runner, n/s au banc, profondeur en 250 ms | N6r10 contre N6r4 |
|---|---|---|
| 39026852676 | EPYC 9V74, 2 598 024, 15 | −2,73 ± 7,12 |
| 39026855187 | EPYC 9V74, 2 588 234, 15 | +2,11 ± 7,13 |
| 39026857893 | EPYC 7763, 2 039 954, 14 | +8,32 ± 7,14 |
| 39026860781 | EPYC 7763, 2 003 233, 13 | −6,33 ± 7,32 |
| **en commun, 11 200 parties** | | **+0,34 ± 3,59** |

- **le critère, écrit avant** : N6r10 n'embarque que si la borne basse
  de l'intervalle MIS EN COMMUN dépasse zéro — elle vaut −3,25. **N6r4
  embarque** : à force égale, le plus rapide et le plus léger ;
- **`mettre-en-commun.sh` refuse l'homogénéité** : le plus grand écart,
  entre les deux 7763 (+8,32 et −6,33), z = 2,81, p = 0,026 sous un seul
  effet (seuil 0,0455). **Les runners ne l'expliquent pas** : les deux
  extrêmes viennent du MÊME processeur à la même vitesse, quand les deux
  9V74, un quart plus rapides, sont au milieu. Le résidu reste nommé
  comme tel — un écart que l'appareil de mesure laisse passer environ une
  fois sur vingt-deux sous un seul effet ; rien ne le rattache à un
  régime ;
- **lu match par match**, le troisième seul passerait la borne (+1,2),
  le quatrième la frôle dans l'autre sens (borne haute +1,0). Le critère
  a été écrit sur l'ensemble précisément pour cela : un critère de GAIN
  lu sur n'importe lequel de quatre matchs multiplierait par ~4 le
  risque d'en déclarer un à tort. La lecture match par match ne protège
  que dans le sens prudent — celui d'un correctif qu'on arrête (C22,
  C31) ;
- **ce que cela dit des seaux de roi** : à 1,563 G, quatre seaux valent
  dix, à ± 3,6 près. <span>Inférence, confiance faible</span> : dix
  seaux, plus de poids pour les mêmes positions, demandent plus de
  données pour se séparer — le n° 20 le dira peut-être en passant.

**N6r4 embarqué — écrit le 17 oct. à 18 h 25, avant la fusion.** La
révocation `0384ee7` révoquée : le moteur est celui de `cd6ed79` à
l'octet (`git diff` vide sur `engine/`). `CLAUDE.md` et `README.md` le
disent ; la mention d'attribution reste, `reseaux/` gardant N2L et N4L.
- **le balayage de mutation après la fusion — prédiction** : **163**,
  chaque fichier à son plafond — `nnue.rs` 2, les deux équivalents ; le
  code des seaux de roi a eu son crible exact au n° 17 (2), et que le
  réseau embarqué l'exerce désormais ne peut qu'en tuer davantage.
  `search.rs` 48 : ses tests évaluent à la main. Un écart d'un ou deux
  dans `search.rs` ne serait pas une régression du code mais de ce que
  l'arbre du nouveau réseau exerce dans les tests qui jouent avec lui —
  il se lirait mutant par mutant ;
- **la série de C13 à 3100 — attendu** — <span>inférence, confiance
  faible</span> : **~3 130, de 3 095 à 3 170, ~54 % de score (49 à
  60 %)**. N5l y rendait ~3 069 ± 25 (45,5 %) ; cette échelle écrase les
  gains des réseaux à ~0,6 de ce que mesure notre jumeau (section C13),
  et N6r4 en vaut ~+99 : ~+60 attendus, sous ± 45 de bruit de série.

**Relevés le 18 oct. à 0 h 40, écrits le 19.** **Le balayage : 163,
EXACT** — run 39049958329, fini le 17 oct. à 20 h 47, chaque fichier à
son plafond, `nnue.rs` 2, `search.rs` 48 ; `Verdict` vert. **La série de
C13 : 3 112 ± 21** (51,7 %), dans l'attendu, sous son centre — +43 ± 33
sur N5l, 0,44 au point de ce que mesure le jumeau, sur un runner plus
lent (section C13, « N6r4, RELEVÉ »).

**Ce qui suit, écrit avant** : le gagnant embarqué — le candidat
révoqué remis, sa confrontation déjà recopiée —, `CLAUDE.md` (« L'évaluation
qui joue ») et `README.md` mis à jour, la mention d'attribution vérifiée :
les réseaux du n° 18 n'ont rien appris des données de Leela, la mention
reste pour N2L et N4L, que `reseaux/` garde ; puis le balayage de mutation
après la fusion, et la série de C13 du nouveau réseau à 3100. **Son facteur
des marges** — 2,49 mesuré pour N6r4, 3,31 pour N6r10, 2,85 en place —
**se mesurera à part, après l'embarquement**, comme écrit avec la sonde.

**La perte tenue à l'écart des réseaux du n° 17, lancée à 9 h 55** — run
38531523447, `main` à `35f6c7b` : N5l, N5r4 et N5r10 sur le septième job
du 7 oct. (37625443145, tenu à l'écart) puis sur un job appris
(37625438110). La prédiction est celle écrite plus haut. *Contrôle
indépendant, écrit avant* : le compte de positions de l'outil retombe
sur le `retenues_filtre_defaut` de chaque job — **19 160 455** et
**19 608 724**.

**La perte tenue à l'écart des réseaux du n° 17, RELEVÉE à 10 h 15 — la
prédiction tient, sur ses deux critères : les seaux de roi RETIENNENT.**
Run 38531523447, deux minutes et dix secondes en tout. *Le contrôle
d'abord* : **19 160 455** et **19 608 724** positions, les
`retenues_filtre_defaut` des deux jobs au chiffre près — l'outil lit ce
que l'entraîneur lit. Perte moyenne, intervalle à 95 % par partie ; écart
à N5l apparié, mêmes positions :

| | tenu à l'écart — 37625443145, 256 404 parties | appris — 37625438110, 262 306 parties | tenu à l'écart − appris |
|---|---|---|---|
| **N5l** | **0,042157** ± 0,000196 | 0,040954 ± 0,000188 | +0,001203 |
| **N5r4** | 0,043386 — **+0,001230 ± 0,000040** | 0,039389 — **−0,001565 ± 0,000039** | +0,003997 — × 3,3 |
| **N5r10** | 0,044944 — **+0,002788 ± 0,000048** | 0,037495 — **−0,003459 ± 0,000053** | +0,007449 — × 6,2 |

- **l'ordre s'inverse** : sur les positions apprises, N5r10 < N5r4 < N5l,
  l'ordre de leurs pertes d'entraînement ; sur les positions tenues à
  l'écart, N5l < N5r4 < N5r10, l'ordre de leurs matchs. Les deux écarts
  appariés sont à trente intervalles de zéro ;
- **l'écart entre appris et tenu à l'écart croît avec les seaux** : × 3,3
  pour quatre, × 6,2 pour dix, celui de N5l. Les deux jobs n'ont pas les
  mêmes parties, donc chaque ligne mêle la généralisation et la différence
  des jobs ; la COMPARAISON entre lignes, elle, est appariée ;
- **l'inférence du n° 17 devient une mesure** : sur 159 M positions, les
  seaux de roi retiennent ce qu'ils voient au lieu d'apprendre. Ce n'est
  pas un réglage : quatre ou dix fois les poids d'entrée de N5l pour les
  mêmes données. Le remède écrit est le volume, et le n° 18 le mesure ;
- **ce que cela ne dit pas** : la force. L'ordre tenu à l'écart retombe
  ici sur celui des matchs, une fois sur trois réseaux d'une même
  famille ; qu'il le fasse en général n'est pas établi, et une perte ne
  remplace jamais un match (`CLAUDE.md`, Texel) ;
- **N5l retient un peu aussi** — +0,0012, que la différence des jobs peut
  porter en partie. Le volume du n° 18 doit le faire baisser ; la séance
  le mesurera par le job tenu à l'écart, 38531414161, et par les points
  de sauvegarde de l'entraînement.

**Pendant les vagues, une piste de vitesse fermée par sa mesure — la mise
à jour paresseuse des accumulateurs, 14 oct.** N5l coûte × 0,83 contre N4
au générateur ; une dérivation qu'aucun nœud ne lit — ni évaluée, ni base
d'un enfant — serait épargnée par une mise à jour à la demande, comme
chez Stockfish. *Le mécanisme d'abord* (`tools/attic/n18-sonde-paresse.patch`,
`c4697e2`, un fil) :

| régime | dérivations | jamais lues | lues par un enfant seulement | évaluations par dérivation |
|---|---|---|---|---|
| générateur, 5 000 nœuds, 60 parties | 33 874 214 | **14,3 %** | 6,6 % | 0,80 |
| jeu, 200 000 nœuds, 4 parties | 30 784 143 | **5,9 %** | 6,6 % | 0,88 |

- **la paresse ne paie pas ici** : la dérivation pesant ~12 % du temps
  d'un nœud à 256 unités — <span>inférence, confiance moyenne : 7,6 % à
  128 au n° 15, × ~1,6</span> —, en épargner 5,9 % rend ~0,7 % de temps
  en partie, ~1 Elo ; 14,3 % au générateur, ~2 % de débit. Ni l'un ni
  l'autre ne vaut le code ni la vérification qu'il demanderait ;
- **presque chaque nœud évalue** : 0,80 à 0,88 évaluation par
  dérivation. Ce qui reste du coût du réseau est le calcul lui-même — la
  sortie et la dérivation —, que le chemin A a déjà vectorisé.

**La perte tenue à l'écart des points de sauvegarde — écrit avant, le
14 oct.** Théo a publié ceux du n° 17 (branche `reseau/n17-points`,
`e7a497d`) : N5l, N5r4 et N5r10 à 10, 20 et 30 superlots, plus les
réseaux embarqués à 40. *La question* : à quel moment de l'entraînement
la retenue commence — elle dit combien de superlots donner au volume.
Un superlot fait 16 384 × 6 104 = **100 M positions**, ~0,63 passe sur les
~159 M gardées : 10, 20, 30 et 40 superlots font ~6, ~13, ~19 et ~25
passes.
- **la réserve, lue au source** (`crates/bullet_lib/src/trainer/schedule/lr.rs`,
  `10e7e82`) : le pas suit un cosinus de 1·10⁻³ à 2,4·10⁻⁶ sur les 40
  superlots — **8,5·10⁻⁴, 5,0·10⁻⁴ et 1,5·10⁻⁴** aux points 10, 20 et 30.
  *Un point de sauvegarde n'est donc PAS un entraînement plus court* : ses
  poids bougent encore à grand pas, et sa perte en est gonflée sur TOUTES
  les données. Ce qui isole la retenue est l'écart **tenu à l'écart −
  appris** d'un même réseau, dont le pas pèse sur les deux termes — à la
  différence des deux jobs près, qui est la même à chaque point ;
- **ce que dit déjà le journal d'entraînement** (`reseaux/*.log.txt`,
  moyenne par superlot sur les données apprises) : N5l touche son plancher
  vers les superlots 22 à 28 (0,04078) et **remonte** jusqu'au 40
  (0,04088) — à pas décroissant ; N5r4 et N5r10 baissent jusqu'au bout
  (0,03929, 0,03739).

*Prédiction, écrite avant* — <span>inférence, confiance faible</span> :
- **contrôle** : 19 160 455 et 19 608 724 positions, comme au run
  38531523447 ;
- **l'écart tenu à l'écart − appris croît d'un point au suivant pour les
  trois réseaux**, et plus vite avec les seaux : celui de N5r10 au point 10
  vaut moins de la moitié du sien au point 40 (+0,0074) ;
- **sur le job tenu à l'écart, la pénalité appariée des seaux contre N5l
  au même point est plus petite au point 10 qu'au point 40** — pour N5r4
  comme pour N5r10 ;
- **la perte tenue à l'écart de N5r10 touche son minimum avant le point
  40** ; celle de N5l baisse jusqu'au 40, le pas qui s'éteint l'emportant.

*Ce que cela décidera* : si la retenue des seaux commence à ~6 à 13
passes, × 10 de données la repousse à × 10 de superlots — 40 superlots
sur ~1,6 G n'en font que ~2,5 passes, et la séance pourra en donner
davantage ; si N5l retient lui aussi dès le point 20, la même règle vaut
pour lui. *Ce que cela ne décidera pas* : la force (`CLAUDE.md`, Texel).

**La perte des points de sauvegarde, RELEVÉE le 14 oct. à 12 h 35 — deux
critères sur quatre tiennent, et les deux qui tombent disent la même
chose : la pénalité des seaux est là dès le début, et rien ne remonte.**
Run 38549900154, trois minutes. *Contrôle* : **19 160 455** et
**19 608 724** positions, exact. Perte moyenne (± 0,00016 à 0,00020 par
partie), aux points 10, 20, 30 et 40 :

| | tenu à l'écart | appris | tenu à l'écart − appris | pénalité tenue à l'écart contre N5l au même point |
|---|---|---|---|---|
| **N5l** | 0,043547 · 0,042940 · 0,042506 · **0,042157** | 0,042595 · 0,041862 · 0,041348 · 0,040954 | 0,00095 · 0,00108 · 0,00116 · 0,00120 | — |
| **N5r4** | 0,044740 · 0,044155 · 0,043780 · **0,043386** | 0,042001 · 0,040936 · 0,039987 · 0,039389 | 0,00274 · 0,00322 · 0,00379 · 0,00400 | 0,00119 · 0,00122 · 0,00127 · 0,00123 |
| **N5r10** | 0,045846 · 0,045496 · 0,045295 · **0,044944** | 0,040911 · 0,039501 · 0,038202 · 0,037495 | 0,00494 · 0,00600 · 0,00709 · 0,00745 | 0,00230 · 0,00256 · 0,00279 · 0,00279 |

Les écarts appariés à N5l au point 40 sont à ± 0,000018 à 0,000054 : chaque
pas de la table est hors du bruit, sauf la pénalité de N5r4, plate.
- **tient — l'écart tenu à l'écart − appris croît à chaque point, plus vite
  avec les seaux** : de 10 à 40, +0,00025 pour N5l, +0,00126 pour N5r4,
  +0,00251 pour N5r10 ;
- **tombe — « celui de N5r10 au point 10 sous la moitié du sien au 40 »** :
  0,00494 contre 0,00745, les deux tiers. Ôté l'écart de N5l — la
  différence des jobs et ce que N5l retient —, encore 0,0040 contre
  0,0062. *La plus grande part est déjà là à ~6 passes* ;
- **à moitié — la pénalité des seaux plus petite au point 10** : N5r10
  oui, 0,00230 contre 0,00279 ; **N5r4 non, plate** à 0,0012 du premier
  point au dernier, l'écart (+0,00004) sous son bruit ;
- **tombe — « la perte tenue à l'écart de N5r10 minimale avant 40 »** :
  elle baisse jusqu'au bout, comme celle des deux autres. **Aucune perte
  tenue à l'écart ne remonte**, à aucun point, pour aucun réseau.

*Ce que cela dit* :
- **les seaux de roi ne surajustent pas au sens où l'entraînement
  dégraderait ce qu'ils savent** : leur perte tenue à l'écart baisse avec
  celle de N5l — de 10 à 40, −0,00135 pour N5r4 contre −0,00139, −0,00090
  pour N5r10 —, quand leur perte apprise baisse deux et trois fois plus
  vite (−0,00261, −0,00342 contre −0,00164). *La capacité de trop sert à
  apprendre les positions vues, sans rien enlever ailleurs* ;
- **leur pénalité est là dès 10 superlots** : 0,0012 et 0,0023, quand
  l'écart appris − tenu à l'écart n'a pas encore fini de s'ouvrir.
  <span>Inférence, confiance moyenne</span> : chaque seau ne s'entraîne que
  sur les positions où le roi est dans sa zone, une part du volume ; ses
  poids estiment avec moins de données que ceux de N5l, d'emblée — ce que
  le volume corrige et qu'aucune durée n'y change. *Le remède écrit au
  n° 17 — le volume — en sort renforcé, l'autre — moins de superlots —
  écarté* ;
- **pour la séance** : rien ici ne demande d'entraîner moins. Sur 159 M,
  25 passes n'ont fait remonter aucune perte tenue à l'écart ; sur ~1,6 G,
  40 superlots n'en font que ~2,5. Le nombre de superlots se choisira par
  les points de sauvegarde de la séance, sur le job tenu à l'écart de la
  vague 1 — avec la même réserve du pas cosinus ;
- **le journal d'entraînement n'est pas une perte** : N5l y remonte du
  superlot ~25 au 40, quand sa perte sur un job appris BAISSE sur le même
  intervalle (0,041348 au 30, 0,040954 au 40). <span>Inférence, confiance
  faible</span> : le journal moyenne la perte des lots AVANT leur mise à
  jour, sur un flux dont la composition varie d'un superlot à l'autre —
  le chargeur entrelace les fichiers. *Une courbe d'entraînement se lit
  sur des données fixes, pas sur le flux* ;
- **ce que cela ne dit pas** : la force — les matchs du n° 17 l'ont
  mesurée, et ils s'accordent avec l'ordre tenu à l'écart.

**`reseau/n17-points` se garde** : son commit, `e7a497d`, n'est pas dans
`main`, et c'est la seule copie du dépôt des neuf points de sauvegarde — la
mesure ci-dessus le cite. Le supprimer rendrait la mesure irrejouable.
L'entrer dans `main` doublerait `reseaux/` (14 Mo, ~18 Mo de plus) pour
des réseaux qui ne jouent pas : la branche suffit. *Une branche à
supprimer est une branche que `main` contient en entier* — ce que
`tools/etat.sh` calcule, et que j'avais d'abord affirmé de tête, à tort.
<br>**Révisé le 21 oct. 2026 à 13 h 14 — la rejouabilité seule ne retient plus
une branche de points.** Théo demandait quand on n'aurait plus besoin de
`reseau/n18-points` et `reseau/n20a-points`. Les trois branches de points
— n17, n18, n20a : 17,8, 36,5 et 23,7 Mo, chacune un commit hors de
`main`, que tout clone complet télécharge — ont leur mesure relevée et
chiffrée ici (38549900154, 39003117564, 39423324257), et **aucune question
ouverte ne les lit** : les seaux de roi sont tranchés par le volume
(N6r4) ; l'axe des passes se mesure sur des réseaux entraînés jusqu'au
bout, puisqu'un point pris au milieu d'un pas cosinus n'est pas un
entraînement plus court (n° 18, puis l'étape A : le point à 200 de N7p4
+0,00185 contre −0,00008 pour N7p2). Rejouer l'une de ces mesures
n'éclairerait aucune décision ; un doute sur l'outil se lèverait sur les
réseaux d'aujourd'hui. **La règle désormais : une branche de points se
garde tant qu'une mesure ouverte la lit ; relevée, elle est à supprimer**
— par Théo, le jeton de session ne le peut pas. Les trois le sont depuis
le 21 oct.

**Ce que la séance mesurera — esquissé ici, détaillé à la relève des
vagues, avant la séance**, comme au n° 13 :
- **N6l** — l'architecture de N5l sur tout le volume, plus de superlots ;
  contre N5l ;
- **N6l à volume égal** — 159 M positions gardées des données neuves :
  contre N5l, il isole l'étiqueteur ; contre N6l, le volume. Il dit s'il
  faut regénérer à chaque réseau ou seulement accumuler ;
- **les seaux de roi sur le volume**, et **384 ou 512 unités** — × 0,87 et
  × 0,82 de nœuds par seconde attendus (n° 17, étape 1) ;
- **le nombre de superlots**, par la perte tenue à l'écart des points de
  sauvegarde : elle dit où la retenue commence, si elle commence. **Sur
  ceux du n° 17, relevés le 14 oct., aucune perte tenue à l'écart ne
  remonte en 25 passes** — rien ne demande d'entraîner moins.

### N° 20 — plus de passes, plus de données : DÉCIDÉ le 17 oct. 2026, écrit avant de lancer

**Décidé** — Théo, 17 oct. : « *Ok je valide ton conseil* », en réponse à
sa question « *ça vaut le coup de relancer de l'entraînement plus long sur
plus de données ? (et de mesurer au passage si on a besoin d'encore plus
de temps/données ou si cette première augmentation suffit)* ». Le conseil
validé : deux étapes, menées en parallèle, sur l'architecture que le
match direct du n° 18 désignera — appelée **W** ci-dessous, N6r4 ou N6r10
—, et **les données neuves étiquetées par W**, pas par N5l.

**Ce que dit déjà la mesure, et ce qu'elle ne dit pas.** Sur l'architecture
plate, rien n'est saturé : doubler les données +7,32 ± 3,53, doubler les
passes +5,49 ± 3,55, démontrés tous deux (« N° 18 — VERDICT »). Mais les
rendements décroissent : × 4,9 de positions rapportaient ~+64, le × 2
suivant +7. **Les seaux de roi n'ont qu'un point sur leur courbe** — ils
portent quatre à dix fois les poids d'entrée de N6l, chacun vu d'autant
moins souvent par passe ; <span>inférence, confiance faible</span> : leur
courbe est plus raide que celle du plat, en données comme en passes.

**Le prix du choix de l'étiqueteur, écrit avec lui.** Étiqueter par W rend
de meilleures données — W vaut ~+99 sur N5l — mais la pente ne mesure plus
le volume pur : la moitié neuve diffère de l'ancienne par l'étiqueteur
aussi. La séance B les sépare par un troisième réseau, les données neuves
seules, à volume égal (plus bas). Le n° 13 l'avait écrit : un mélange ne
mesure que lui-même — c'est pourquoi on mesure aussi chaque moitié seule.

#### Étape A — plus de passes, sur la carte de Théo, sans donnée neuve

Deux réseaux de l'architecture W sur les 79 jobs du n° 18 — le job tenu à
l'écart jamais vu —, la recette du n° 18 à la durée près : **N7p2, 200
superlots ; N7p4, 400**. Un superlot vaut 100,0 M positions vues : 200 et
400 font **12,8 et 25,6 passes** sur les 1,563 G — W en a fait 6,4. La
décroissance cosinus se cale sur le dernier superlot : le point à 200 d'un
entraînement à 400 n'est pas N7p2 (mesuré au n° 18 : celui de N6l200 à 100
valait bien moins que N6l), d'où deux entraînements. *Durée* — à 23,7 s
par superlot pour quatre seaux de roi, 31,4 pour dix (n° 18) : **N6r4 :
~1 h 20 et ~2 h 40 ; N6r10 : ~1 h 45 et ~3 h 30**, relectures en plus. Les
commandes s'écrivent au verdict du match direct, avant de les demander.

*Ce qu'elle mesure* : N7p2 contre W, la première doublure des passes ;
**N7p4 contre N7p2, la seconde — la réponse à « faut-il encore plus ? »**.
*Le risque, nommé avant* : au n° 17, les seaux de roi portaient la pénalité
de la retenue dès ~6 passes sur 159 M ; sur 1,563 G, N6r4 retient déjà
plus que N6l (tenu − appris 0,0004 contre 0,0002). À 25,6 passes, la
retenue peut l'emporter : un N7p4 PIRE que N7p2 est un résultat possible,
pas une panne. Les points de sauvegarde — <s>tous les 20 superlots</s>
écrits tous les 10 par l'entraîneur (`save_rate`), rapportés au dépôt tous
les 40, plus bas — diront à la perte tenue à l'écart où elle commence.

*Attendus* — <span>inférence, confiance faible</span> :
- **N7p2 contre W : +3 à +12**, ~+6 — le plat a rendu +5,49 ; plus de
  poids par position vue plaide pour plus ;
- **N7p4 contre N7p2 : −10 à +8**, ~+1 — le signe n'est pas acquis ;
- **perte tenue à l'écart** : N7p2 sous W ; N7p4 sous N7p2 de moins que
  N7p2 sous W, ou au-dessus.

*Les matchs* : **N7p2 contre W et N7p4 contre W** — la décision, quatre jobs
chacun ; **N7p4 contre N7p2** — la mesure, quatre jobs, et le match direct
si les deux premiers se recoupent. **Critère d'embarquement : celui du
n° 17**, contre W. La sonde de B8, la perte tenue à l'écart et les nœuds
par seconde avant, comme au n° 18.

**La séance A — W est N6r4 ; écrite le 17 oct., avant de la demander.**
L'architecture de N6r4 — quatre seaux de roi, 256 unités, huit de sortie —
est celle de `4a604ea`, qui l'a entraîné, et de `main` dès la fusion de
son embarquement ; la séance part de `4a604ea`, qui ne dépend pas de la
fusion. Les données sont déjà chez Théo, `~/nnue-n18` : rien à
télécharger. Chaque bloc se colle dans le MÊME terminal, dans l'ordre :

0. **le dépôt à jour, les données, la place** :
   ```sh
   cd ~/chess && git status
   git fetch origin && git switch main && git pull --ff-only
   ls ~/nnue-n18/*/*.vf | wc -l; df -h ~
   ```
   — **316** fichiers `.vf` ; **3 Go libres au moins**, pour les points de
   sauvegarde (un tous les 10 superlots, 60 en tout). Des fichiers
   « modifiés », un `--ff-only` qui refuse : s'arrêter et le dire ;
1. **la liste** — le job tenu à l'écart n'y est jamais :
   ```sh
   D=~/nnue-n18; T=~/chess/tools/n18-jobs.tsv
   TOUS=$(awk -F'\t' -v d=$D '$4=="appris" {print d"/"$1}' $T)
   echo $TOUS | wc -w
   ```
   — **79** ;
2. **CUDA dans ce terminal** — le bloc « CUDA dans ce terminal » de la
   séance d'entraînement du n° 7, tel quel ;
3. **les deux réseaux, d'une traite** — un échec arrête la chaîne :
   ```sh
   set -o pipefail
   cd ~/chess/tools/nnue-train && git checkout 4a604ea &&
   cargo run --release --features cuda -- --attendu 18435764:2328546367 --superlots 200 \
     --sortie n7p2 $TOUS 2>&1 | tee n7p2.sortie.txt &&
   cargo run --release --features cuda -- --attendu 18435764:2328546367 --superlots 400 \
     --sortie n7p4 $TOUS 2>&1 | tee n7p4.sortie.txt
   echo "FIN : $?"; git switch main
   ```
   → `RÉSEAU PRÊT : n7p2/shallowred-768x4hm-256-s8-200/quantised.bin`,
   puis `n7p4/shallowred-768x4hm-256-s8-400/quantised.bin`, et
   **`FIN : 0`**. Git annonce une « HEAD détachée » au `checkout` : c'est
   voulu. *Durée* : à 23,7 s par superlot (N6r4, n° 18), **~1 h 20 puis
   ~2 h 40**, plus une relecture des 79 jobs avant chaque réseau —
   **~4 h en tout, une soirée ou une nuit**. Interrompue, la chaîne se
   reprend au réseau qui manque ;
4. **rapporter** — les deux réseaux sur `reseau/n20a`, un point de
   sauvegarde tous les 40 superlots sur `reseau/n20a-points` :
   ```sh
   cd ~/chess && git switch -c reseau/n20a
   for c in n7p2:768x4hm-256-s8-200 n7p4:768x4hm-256-s8-400; do
     n=${c%%:*}; a=${c#*:}; d=tools/nnue-train/$n/shallowred-$a
     cp $d/quantised.bin reseaux/$n-$a.bin
     cp $d/log.txt reseaux/$n-$a.log.txt
     cp tools/nnue-train/$n.sortie.txt reseaux/$n-$a.sortie.txt
   done
   git add reseaux/n7p*
   git commit -m "Réseaux NNUE du n° 20, étape A : N7p2 et N7p4 — plus de passes"
   git push -u origin reseau/n20a
   git switch -c reseau/n20a-points
   mkdir -p reseaux/points-n20a
   for d in tools/nnue-train/n7p*/shallowred-*; do
     s=${d##*-}; [ $((s % 40)) -eq 0 ] || continue
     cp $d/quantised.bin reseaux/points-n20a/$(basename $(dirname $d))-$(basename $d).bin
   done
   ls reseaux/points-n20a | wc -l
   git add reseaux/points-n20a
   git commit -m "Points de sauvegarde du n° 20, étape A, tous les 40 superlots"
   git push -u origin reseau/n20a-points
   git switch main
   ```
   — **15** points : 5 pour N7p2, 10 pour N7p4, ~24 Mo. **Garder
   `~/nnue-n18`** : la séance B en repartira.

*Ce qui suit, écrit avant* : pour chacun, la confrontation recopiée, le
candidat révoqué aussitôt, la sonde de B8, ses nœuds par seconde ; la
perte tenue à l'écart des deux et de leurs points, sur 38531414161 ; puis
**12 jobs de 2 800 parties à `8+0,08`** — N7p2 contre N6r4, N7p4 contre
N6r4 (la décision), N7p4 contre N7p2 (la mesure) —, critère et attendus
écrits plus haut.

**La séance A, RELEVÉE le 20 oct. à 14 h 27 — les deux réseaux conformes.**
`tools/seance-n20.sh` les a poussés sur `reseau/n20a` (`30e60e9`) à 13 h 39,
et les quinze points de sauvegarde sur `reseau/n20a-points` (`26c7822`) ;
intégrés par `e8d4ee6`. Entraînés à `4a604ea`, comme écrit :

| réseau | relecture | confrontation, médian / maximal (admis 15 / 50) | entraînement | estimé |
|---|---|---|---|---|
| **N7p2**, 200 superlots | exacte, 18 435 764 : 2 328 546 367 | 3 / 16 | 1 h 16 min 51 s | ~1 h 20 |
| **N7p4**, 400 superlots | exacte | 5 / 13 | 2 h 32 min 40 s | ~2 h 40 |

Les durées à 4 % sous l'estimé : ~23,0 s par superlot, contre 23,7 au
n° 18. **Les candidats**, écrits comme ceux de (a) et (d) — le chemin du
réseau, son commentaire et sa confrontation recopiée, au facteur de
`main` ; `verify.sh --rapide` vert, révoqués aussitôt, l'arbre revenu à
`e8d4ee6` au bit près : **N7p2 `8603bd3`** (révoqué par `beab569`),
**N7p4 `ec97f35`** (par `ce9fc2e`).

**La sonde de B8 et les nœuds par seconde — écrits le 20 oct. à 14 h 35,
avant de les lancer.** Le protocole de (a) et (d), le même script.
*Attendus* — <span>inférence, confiance faible</span> : **N7p2 2,3 à 3,0,
N7p4 2,3 à 3,2** — N6r4 mesurait 2,49 ; au n° 18, deux fois plus de passes
avaient monté le facteur de 2,50 (N6l) à 2,61 (N6l200) ; **les deux dans
2,14 à 3,56**, au facteur de `main`. **Nœuds par seconde, × 0,97 à × 1,04
contre N6r4**, sans sens attendu.

**La perte tenue à l'écart des deux et de leurs points** — `nnue-validation.yml`,
l'outil et les réseaux à `reseau/n20a-points` (`26c7822`), N6r4 en
référence, sur 38531414161 puis 38531424497. *Attendus* : ceux de l'étape
A — N7p2 sous N6r4 ; N7p4 sous N7p2 de moins que N7p2 sous N6r4, ou
au-dessus ; les points diront où la retenue commence.

**La sonde de B8, RELEVÉE le 20 oct. à 14 h 45 — les deux dans la plage et
dans leur attendu, au facteur de `main`.** 40 parties chacun, finies à
14 h 39 et 14 h 44, zéro anomalie :

| réseau | facteur delta | facteur aspiration | moyenne géométrique | hors fenêtre à δ = 25 | *attendu* |
|---|---|---|---|---|---|
| N6r4, le 17 oct. | × 3,1 | × 2,00 | 2,49 | 8,3 % | — |
| **N7p2** | × 3,3 | × 2,60 | **2,93** | 11,6 % | 2,3 à 3,0 — dedans |
| **N7p4** | × 3,9 | × 2,00 | **2,79** | 7,8 % | 2,3 à 3,2 — dedans |

Les deux plus hauts que N6r4, par le delta surtout — le sens que N6l200
avait montré sur N6l. **Les candidats ne changent pas.**

**Les matchs, lancés le 20 oct. à 14 h 45** — douze jobs de 2 800 parties
à `8+0,08`, graine « auto », AVX2 des deux côtés : **N7p2 contre N6r4**
(`8603bd3` → `0eca96a`) 39424657675, 39424661145, 39424664674,
39424667800 ; **N7p4 contre N6r4** (`ec97f35` → `0eca96a`) 39424671016,
39424674757, 39424677788, 39424680763 ; **N7p4 contre N7p2** (`ec97f35` →
`8603bd3`) 39424684239, 39424687745, 39424691136, 39424694996. Fin
attendue vers 19 h 40–20 h 00, au plus tard 20 h 35 ; leurs nœuds par
seconde se relèvent pendant le vol. Critère et attendus : ceux de l'étape
A, écrits le 17 oct.

**Leurs nœuds par seconde, RELEVÉS le 20 oct. à 14 h 53** — le rejeu du
n° 15, `--nps`, AVX2, dix tours, contre N6r4 (`0eca96a`) : **N7p2 × 1,011,
N7p4 × 1,048**, chacun plus rapide sur 7 tours sur 10, p = 0,34 — aucun
séparé. N7p4 au point juste au-dessus de l'attendu (× 0,97 à × 1,04) :
plus de passes, un arbre un peu plus petit au rejeu, <span>inférence,
confiance faible</span> ; par l'étalon du temps, × 1,05 vaudrait ~+7 Elo
dans son match, si l'écart tenait.

**La perte tenue à l'écart, RELEVÉE le 20 oct. à 14 h 39 — plus de passes
paie encore en perte, sans retenir davantage ; le second attendu tombe.**
Run 39423324257, quatre minutes, contrôle exact (17 208 872, 17 938 594),
N6r4 à sa perte du 17 oct. :

| réseau | tenu à l'écart | écart à N6r4 | appris de tous | tenu − appris |
|---|---|---|---|---|
| N6r4, 100 superlots | 0,038560 | — | 0,038148 | +0,000412 |
| **N7p2**, 200 | 0,038481 | **−0,000080 ± 0,000021** | 0,038065 | +0,000416 |
| **N7p4**, 400 | 0,038390 | **−0,000170 ± 0,000021** | 0,037974 | +0,000416 |

- **N7p2 sous N6r4** : l'attendu tient, à quatre intervalles ;
- **N7p4 sous N7p2 de 0,000090** — autant que N7p2 sous N6r4, pas moins :
  l'attendu « de moins, ou au-dessus » tombe. **Chaque doublement des
  passes rend la même chose en perte**, sans rendement décroissant visible
  à 25,6 passes ;
- **la retenue ne bouge pas** : tenu − appris, 0,000412 à 100 superlots,
  0,000416 à 200 et à 400. Le risque nommé avant — la retenue l'emportant
  à 25,6 passes — ne se voit pas ;
- **les points** : au milieu d'un entraînement, la perte est bien plus
  haute qu'au bout — le point à 200 de N7p4 (+0,00185) est loin de N7p2
  (−0,00008) : le pas cosinus, comme au n° 18. La retenue des points
  monte avec la décroissance du pas, de 0,00027–0,00030 à 40 superlots à
  0,00041 au dernier ; N7p4 remonte un peu entre ses points 40 et 80
  (+0,00022), au pas plein. Aucune perte tenue à l'écart ne remonte dans
  le dernier tiers ;
- **ce que cela ne dit pas** : la force — 0,00008 et 0,00017, c'est le
  cinquième et un peu moins de la moitié de ce que N6r4 gagnait sur N6l en
  perte (0,00038) — pour ~+22 Elo par la différence de leurs écarts à N5l,
  sans match direct, donc à deux incertitudes ; les matchs liront.

#### Étape A — VERDICT, 20 oct. 2026 : plus de passes paie encore — N7p4 +16,89 ± 3,55 et N7p2 +14,74 ± 3,52 contre N6r4 à `8+0,08`, N7p4 +9,31 ± 3,51 contre N7p2 ; la séance B à 400 superlots

**Relevé le 20 oct. à 20 h 00.** Les douze jobs finis ENTIERS entre
19 h 44 et 19 h 57, 4 h 58 à 5 h 11 chacun, 6,39 à 6,66 s par partie ;
zéro perte au temps, zéro coup illégal, zéro moteur perdu, sur la
totalité des journaux. 2 800 parties par job :

| match | job 1 | job 2 | job 3 | job 4 | en commun, 11 200 parties | homogénéité | attendu, écrit avant |
|---|---|---|---|---|---|---|---|
| **N7p2 contre N6r4** | +12,79 | +11,05 | +19,50 | +15,65 | **+14,74 ± 3,52** | p = 0,339 | +3 à +12 — dépassé |
| **N7p4 contre N6r4** | +15,40 | +21,12 | +15,89 | +15,15 | **+16,89 ± 3,55** | p = 0,652 | la décision, avec N7p2 |
| **N7p4 contre N7p2** | +7,32 | +14,53 | +11,67 | +3,72 | **+9,31 ± 3,51** | p = 0,146 | −10 à +8 — dépassé |

Pentanomiaux, pour `tools/mettre-en-commun.sh` : N7p2 contre N6r4
`30,231,787,310,42` `39,227,789,296,49` `25,205,802,324,44`
`33,223,781,311,52` ; N7p4 contre N6r4 `34,233,764,313,56`
`27,215,778,321,59` `21,223,808,303,45` `33,222,784,312,49` ; N7p4 contre
N7p2 `25,239,829,266,41` `33,227,781,308,51` `31,244,783,284,58`
`31,259,802,265,43`. *Étalonnages*, lus sur neuf jobs : EPYC 7763, 9V74
et Xeon 8573C, 1,02 à 2,60 M n/s au banc, profondeur 13 à 15 en 250 ms.
*Avertissements* : « PV continues after fifty-move rule » et « … after
threefold repetition », 34 côté référence et 43 côté candidat sur 33 600
parties — la famille connue, des deux côtés.

- **Plus de passes paie encore, deux fois** : 100 → 200 superlots
  +14,74, 200 → 400 +9,31 en match direct — démontré à chaque doublement,
  et au-dessus des deux attendus. La perte tenue à l'écart l'avait dit
  dans le sens (chaque doublement rendait autant), pas dans la mesure ;
- **la retenue ne l'emporte pas à 25,6 passes** : le risque nommé avant
  ne se voit ni en perte (tenu − appris inchangé) ni en jeu ;
- **une incohérence apparente, dans le bruit** : par leurs écarts à N6r4,
  N7p4 ne devance N7p2 que de +2,15 ; en match direct, de +9,31. Écart
  7,2 ± 6,1 — 1,2 σ. *Le match direct fait foi* : c'est la mesure
  appariée, et le critère la désigne ;
- **le critère du n° 17** : N7p4, gain démontré, le meilleur au point de
  l'étape ; N7p2 le recoupe, et le match direct, déjà écrit, tranche pour
  N7p4. **L'étape A désigne N7p4 ; la séance B passe à `SL=400`** ;
- **ce qui embarque** : N7p4 et N6r4w50 — deux gains démontrés sur deux
  axes, +16,89 et +11,79 contre le même N6r4 — se recoupent (+13,34 à
  +20,44 et +8,27 à +15,31) : **un match direct, par le critère du
  n° 17, écrit plus bas**. Si N6r4w25 l'emportait sur N6r4w50 à 23 h, le
  représentant de (d) ne recouperait plus N7p4, et N7p4 embarquerait sans
  ce match. N6r4 joue jusque-là. Leurs Elo ne s'additionnent pas : leur
  composition — 400 superlots au poids 0,5 — est un réseau neuf, mesuré à
  son tour.

**Le match direct — N6r4w50 contre N7p4, écrit le 20 oct. à 20 h 04,
avant de le lancer.** Quatre jobs de 2 800 parties à `8+0,08`, graine
« auto » chacun, le binaire AVX2 des deux côtés : `0f5214b` (N6r4w50)
contre `ec97f35` (N7p4) — le même code au bit près, leur diff ne touche
que le réseau, sa documentation et sa confrontation —, le facteur de
`main` (2,85) des deux côtés, leurs sondes dans la plage (2,44 et 2,79).
**Critère, écrit avant : N6r4w50 embarque si la borne basse de
l'intervalle mis en commun est au-dessus de zéro ; sinon N7p4** — le
meilleur au point contre N6r4, à une vitesse voisine (× 1,020 et × 1,048,
non séparés). La règle du n° 13 : le second doit démontrer. *Attendu* —
<span>inférence, confiance faible</span> : **−11 à +2, ~−5** — la
différence de leurs écarts à N6r4, −5,10 ± 5,00, lue sans match direct.
*Puissance dite d'avance* : ± 3,5 — à égalité, le meilleur au point
embarque. **Poussé et lancé à 20 h 04** (`6c753e2`) : 39471565620,
39471574281, 39471583801, 39471592587 ; fin attendue vers 1 h 00–1 h 20,
au plus tard au plafond de 350 minutes, 1 h 55.

**Le match direct, RELEVÉ le 21 oct. à 1 h 22 — N7p4 EMBARQUÉ.** Quatre
jobs finis entiers entre 1 h 03 et 1 h 19, 6,37 à 6,71 s par partie, zéro
perte au temps ; le premier sur un EPYC 7763 à demi-vitesse (1,04 M n/s
au banc, profondeur 15) :

| N6r4w50 contre N7p4 | Elo | pentanomial |
|---|---|---|
| job 1, 39471565620 | −9,43 ± 6,88 | 42, 287, 802, 243, 26 |
| job 2, 39471574281 | −6,70 ± 6,71 | 39, 263, 839, 231, 28 |
| job 3, 39471583801 | −1,74 ± 6,77 | 32, 269, 809, 261, 29 |
| job 4, 39471592587 | −8,81 ± 6,89 | 41, 287, 802, 242, 28 |
| **en commun, 11 200 parties** | **−6,67 ± 3,41** | homogènes, p = 0,400 |

- **le critère** : borne basse −10,08, sous zéro — **N7p4 embarque** ; et
  la borne haute (−3,26) aussi : **N7p4 est démontré devant N6r4w50** ;
- **l'attendu** (−11 à +2, ~−5) tenu : la différence de leurs écarts à
  N6r4 disait −5,10 ± 5,00, le match direct −6,67 ± 3,41 ;
- **les passes devant le poids** : trois fois plus de passes rendent plus
  que le poids du résultat à 0,5 — les deux axes restent démontrés chacun
  contre N6r4 ; leur composition, N7p4w50, est en match contre N7p4 depuis
  0 h 27, sur le code d'aujourd'hui ;
- **embarqué sur le code d'aujourd'hui** : la révocation de `7d84860` (N7p4
  recommité, la même modification que `ec97f35`) révoquée à son tour ; le
  facteur de `main` (2,85), sa sonde 2,79 dans la plage ; `verify.sh`
  complet avant la PR ;
- avertissements : 4 à 11 « PV continues after … » par job, des deux côtés.

#### Étape B — plus de données, sur les runners, étiquetées par W

**La recette** : `nnue-datagen.yml` au commit candidat de W — `cd6ed79`
pour N6r4, `04727b5` pour N6r10 —, son réseau embarqué, 5 000 nœuds par
coup, graine « auto », un fil par processeur logique, 330 minutes,
`x86-64-v3`. **Le même commit pour toutes les vagues** : un seul
étiqueteur. Le moteur de ce commit est celui du n° 18 au réseau près — le
générateur ne change que par l'étiqueteur.

**Le volume** : autant que l'ancien, **1,563 G positions gardées**, pour
que les deux moitiés se comparent à volume égal. À ~19,8 M gardées par job
au n° 18 — le débit de W les fera bouger —, **~79 jobs, plus un tenu à
l'écart : le PREMIER job lancé de la vague 1**, désigné avant d'en voir le
compte. <s>**Huit à la fois**, la charge que `nnue-datagen.yml` s'impose par
les conditions de GitHub (ligne B4) : **~10 vagues de ~6 h, ~2,5 jours**
si elles s'enchaînent.</s> **Seize à la fois depuis le 17 oct. au soir**
(Théo, plus bas) : ~6 vagues, ~1,4 jour. *Règle de fin, écrite avant* : la génération
s'arrête à la vague dont le cumul atteint 1,563 G gardées — la vague
entière, même au-delà ; la séance B tirera alors des jobs neufs dans
l'ordre de lancement jusqu'au volume ancien.

**D'abord une sonde de 20 minutes**, l'étiqueteur ayant changé. *Attendus,
écrits avant* — <span>inférence, confiance faible</span>, contre la sonde
de N5l (1 287 positions par seconde, EPYC 7763 ; 15,72 % d'écartées ;
31,8 % de nulles) :
- **positions par seconde, sur un EPYC 7763 : × 0,85 à × 1,00 pour N6r4,
  × 0,80 à × 0,98 pour N6r10** — au rejeu × 0,982 et × 0,956 ; mais au
  générateur, presque chaque nœud évalue, et la largeur s'y payait plus
  qu'au rejeu (× 0,83 contre × 0,897 pour N5l au n° 18) ; un roi qui change
  de seau y force un recalcul ;
- **parties écartées, sur les gardées : 12 à 20 %** — le filtre
  d'ouverture se lit en unités de l'étiqueteur, et l'échelle de W n'est
  pas celle de N5l (facteurs de B8 2,49 pour N6r4, 3,31 pour N6r10, 2,85
  pour N5l) ;
- **nulles : 30 à 36 %** — un étiqueteur plus fort en fait un peu plus.

Hors fourchette, on diagnostique avant la vague.

**La sonde, RELEVÉE le 17 oct. à 18 h 39 — les trois chiffres dans leur
attendu** — <s>18 h 45</s>, l'heure d'abord écrite devançait l'horloge. Run 39048761614, 20 minutes sur un EPYC 7763, quatre fils,
`x86-64-v3`, `cd6ed79` ; `parties` ne compte que les gardées, `ecartees`
à part — le dénominateur du n° 18 :

| | la sonde, N6r4 | la sonde de N5l, EPYC 7763 | attendu, écrit avant |
|---|---|---|---|
| positions par seconde | **1 183** | 1 287 | × 0,85 à × 1,00 — **× 0,919, dedans** |
| parties écartées, sur les gardées | **19,69 %** (2 224 sur 11 294) | 15,72 % | 12 à 20 % — dedans, au bord |
| nulles | **34,00 %** | 31,8 % | 30 à 36 % — dedans |

125,7 positions par partie (126,4 pour N5l), 68,1 % gardées par le filtre
(67,2 %). Plus d'écartées : le filtre d'ouverture se lit en unités de N6r4
— la cause que l'attendu nommait ; une partie écartée l'est au premier
coup, le coût est négligeable. **Le compte** : ~806 positions gardées par
seconde sur un 7763, soit ~16 M par job de 330 minutes sur ce processeur,
~18,4 M en moyenne sur le mélange de runners du n° 18 — **~85 jobs pour
1,563 G, plus le tenu à l'écart : ~11 vagues de huit**.

**La vague 1 — écrite avant de la lancer.** Huit jobs de 330 minutes au
commit `cd6ed79`, `<embedded>`, 5 000 nœuds, graine « auto » ; **le
PREMIER lancé est tenu à l'écart**. *Attendus* — <span>inférence,
confiance moyenne</span>, les vagues de N5l (208 à 268 M positions) à
× 0,92 : **180 à 260 M positions, 120 à 178 M gardées ; écartées 18,9 à
20,5 % ; nulles 33,2 à 34,8 %**, sur les gardées.

**Seize à la fois — DÉCIDÉ par Théo le 17 oct. à 18 h 50** : « *Ok pour
16* », en réponse à la question « huit est-il un maximum ? ». Il ne
l'était pas : une prudence que je m'étais donnée le 25 sept. La
documentation de GitHub, lue à sa source (`github/docs`,
`content/actions/reference/limits.md`), fixe la concurrence des runners
standard à 20 jobs en Free, 40 en Pro ; trente ont tourné ensemble le
5 oct. Les conditions (`github/site-policy`, section Actions, relue le
même jour) ne fixent aucun chiffre — seulement une charge
« *disproportionate to the benefits provided to users* », un jugement de
volume que la simultanéité ne change pas : ~85 jobs de 5 h 30, par huit
ou par seize. **La génération se lance désormais par seize** : ~6 vagues,
~1,4 jour au lieu de ~2,5.

**La vague 1 complétée à seize — écrit avant de lancer la seconde
moitié.** Huit jobs de plus, même recette, lancés vingt minutes après les
huit premiers ; le tenu à l'écart reste 39050360980. *Attendus* : ceux de
la première moitié, pour chaque huitaine — **180 à 260 M positions, 120 à
178 M gardées ; écartées 18,9 à 20,5 % ; nulles 33,2 à 34,8 %**.

**La séance A attendra le 18 oct. au soir** — Théo : « *Je pourrais pas
avant demain soir la session gpu* ». Rien n'en dépend avant : les
données neuves se génèrent en attendant.

**La vague 1, RELEVÉE le 19 oct. à 8 h — seize succès, dans les
attendus sur les quatre chiffres, pour chaque huitaine.** Finie le 18 oct.
vers 0 h 25 ; relevée trente heures plus tard, la session ayant été
coupée par sa limite d'usage — trente heures de runners perdues, pas une
donnée. Les comptes, job par job : `tools/n20-jobs.tsv`.

| | première huitaine | seconde huitaine | attendu, écrit avant, par huitaine |
|---|---|---|---|
| positions | **195,7 M** | **235,1 M** | 180 à 260 M — dedans |
| gardées par le filtre de l'entraîneur | **133,8 M** | **160,6 M** | 120 à 178 M — dedans |
| écartées, sur les gardées | **19,28 %** | **19,31 %** | 18,9 à 20,5 % — dedans |
| nulles, sur les gardées | **34,35 %** | **34,35 %** | 33,2 à 34,8 % — dedans |

D'un job à l'autre, écartées 19,15 à 19,51 %, nulles 34,16 à 34,55 %.
Les runners : neuf EPYC 7763 à **1 177 – 1 191** positions par seconde —
la sonde en rendait 1 183 —, deux Xeon 8573C à 1 179 et 1 221, deux EPYC
9V74 à 1 564 et 1 577, **deux EPYC 9V45 à 2 140 et 2 231**, presque deux
7763 chacun ; la seconde huitaine doit son volume à ces deux-là. **278,4 M
gardées à l'entraînement** — le tenu à l'écart (39050360980) en garde
16,0 M à part. Il en reste **1 284,6 M jusqu'au volume ancien : ~4,4
vagues à ce rendement, donc cinq** par la règle de fin (la vague 6
entière).

**La vague 2 — écrite avant de la lancer.** Seize jobs, la recette de la
vague 1 à l'identique : `cd6ed79`, `<embedded>`, 5 000 nœuds, graine
« auto », 330 minutes, `x86-64-v3`. **L'image des runners a pu changer**
— `ubuntu-latest` passe à Ubuntu 26 à partir du 19 oct. (« Ce qu'il faut
surveiller ») : la toolchain est épinglée, le générateur n'emploie rien
que le runner installe, donc rien ne doit bouger — et les attendus le
vérifient. *Attendus* — <span>inférence, confiance moyenne</span>, la
vague 1 et le mélange de runners qu'on a vu :
- **les seize : 360 à 520 M positions, 245 à 355 M gardées** — seize
  7763 en feraient ~375 M, la vague 1 en a fait 431 M ; le haut admet
  cinq 9V45. Une huitaine peut sortir de 180 – 260 M par le tirage des
  runners sans que rien soit faux : quatre 9V45 dans la même en feraient
  ~267 M ; on lit les seize ;
- **écartées 18,9 à 20,5 %, nulles 33,2 à 34,8 %**, sur les gardées —
  les fourchettes de la vague 1, inchangées ;
- **sur un EPYC 7763, 1 150 à 1 220 positions par seconde** — l'image ne
  touche pas le moteur ; hors de là, on regarde l'image du job avant la
  vague 3.

**La vague 2, RELEVÉE le 19 oct. à 14 h — quinze succès sur seize, dans
les attendus sur les cinq chiffres.** Lancée à 8 h 04, finie à 13 h 35.
**39207799756 a perdu son runner** à 11 h 09, après trois heures —
« *The hosted runner lost communication with the server* », lu dans ses
annotations —, sans artefact : la panne du n° 13, pas une faute du
générateur ; pas relancé, le volume se rattrape à la vague suivante.

| | les quinze | attendu, écrit avant, pour seize |
|---|---|---|
| positions | **414,2 M** | 360 à 520 M — dedans, même à quinze |
| gardées par le filtre de l'entraîneur | **283,0 M** | 245 à 355 M — dedans |
| écartées, sur les gardées | **19,29 %** (19,16 à 19,40 d'un job à l'autre) | 18,9 à 20,5 % — dedans |
| nulles, sur les gardées | **34,32 %** (34,19 à 34,45) | 33,2 à 34,8 % — dedans |
| EPYC 7763, positions par seconde | **1 161 à 1 193**, sept runners | 1 150 à 1 220 — dedans |

**L'image n'a pas encore changé** : le journal du premier job dit
`ubuntu-24.04`, version `20261012.334.1`, avec l'annonce « *will migrate
to Ubuntu 26 beginning October 19* ». Deux processeurs nouveaux : un Xeon
6973P-C à 1 225 positions par seconde, un Xeon 8370C à 1 127. **561,4 M
gardées à l'entraînement après deux vagues** ; il en reste **1 001,6 M** —
~3,5 vagues à ce rendement, donc **quatre**, la vague 6 entière par la
règle de fin.

**La vague 3 — écrite avant de la lancer.** Seize jobs, la recette
inchangée. *Attendus* — <span>inférence, confiance moyenne</span> — ceux
de la vague 2, que deux vagues ont tenus : **les seize, 360 à 520 M
positions, 245 à 355 M gardées** — à proportion s'il manque des jobs ;
**écartées 18,9 à 20,5 %, nulles 33,2 à 34,8 %** ; **sur un EPYC 7763,
1 150 à 1 220 positions par seconde**. Si l'image a basculé sur Ubuntu 26
pour une partie des jobs, les deux groupes se lisent séparément.

**La vague 3, RELEVÉE le 19 oct. à 19 h 55 — seize succès, dans les
attendus sur les cinq chiffres.** Lancée à 14 h 00, finie à 19 h 31.

| | les seize | attendu, écrit avant |
|---|---|---|
| positions | **417,2 M** | 360 à 520 M — dedans |
| gardées par le filtre de l'entraîneur | **285,1 M** | 245 à 355 M — dedans |
| écartées, sur les gardées | **19,27 %** (19,01 à 19,44 d'un job à l'autre) | 18,9 à 20,5 % — dedans |
| nulles, sur les gardées | **34,35 %** (34,15 à 34,46) | 33,2 à 34,8 % — dedans |
| EPYC 7763, positions par seconde | **1 173 à 1 194**, onze runners | 1 150 à 1 220 — dedans |

**L'image n'a toujours pas changé** : `ubuntu-24.04`, version
`20261012.334.1`, lue dans le journal de 39248704266. Les autres
runners : trois EPYC 9V74 à 1 534 – 1 560, un EPYC 9V45 à 2 083, un Xeon
8573C à 1 307 — la vague 1 en montrait deux à 1 179 et 1 221. **846,5 M
gardées à l'entraînement après trois vagues** ; il en reste **716,5 M** —
~2,5 vagues à ce rendement, donc **trois**, la vague 6 entière par la
règle de fin.

**La vague 4 — écrite avant de la lancer.** Seize jobs, la recette
inchangée. *Attendus* — <span>inférence, confiance moyenne</span> — ceux
que trois vagues ont tenus : **les seize, 360 à 520 M positions, 245 à
355 M gardées** — à proportion s'il manque des jobs ; **écartées 18,9 à
20,5 %, nulles 33,2 à 34,8 %** ; **sur un EPYC 7763, 1 150 à 1 220
positions par seconde**. Si l'image bascule sur Ubuntu 26 pour une partie
des jobs, les deux groupes se lisent séparément.

**La vague 4, RELEVÉE le 20 oct. à 1 h 45 — seize succès, dans les
attendus sur les cinq chiffres.** Lancée le 19 à 19 h 55, finie à 1 h 27.

| | les seize | attendu, écrit avant |
|---|---|---|
| positions | **428,2 M** | 360 à 520 M — dedans |
| gardées par le filtre de l'entraîneur | **292,6 M** | 245 à 355 M — dedans |
| écartées, sur les gardées | **19,26 %** (19,01 à 19,43 d'un job à l'autre) | 18,9 à 20,5 % — dedans |
| nulles, sur les gardées | **34,31 %** (34,13 à 34,45) | 33,2 à 34,8 % — dedans |
| EPYC 7763, positions par seconde | **1 161 à 1 187**, cinq runners | 1 150 à 1 220 — dedans |

**L'image reste Ubuntu 24.04**, dans une version plus récente :
`ubuntu-24.04` `20261018.339.1`, lue dans le journal de 39298334978 —
les trois vagues d'avant lisaient `20261012.334.1`. Le mélange de runners
a changé, pas le moteur : quatre Xeon 8370C à 1 088 – 1 125 positions par
seconde, deux Xeon 8573C à 1 173 – 1 177, deux EPYC 9V74 à 1 568 – 1 572,
deux EPYC 9V45 à 1 986 et 2 173, et un Xeon 6973P-C à **1 671** — la
vague 2 en montrait un à 1 225 : même processeur, 36 % d'écart.
<span>Inférence, confiance faible</span> : un voisin de machine plus ou
moins chargé ; le nom du modèle ne fixe pas le débit. **1 139,1 M gardées
à l'entraînement après quatre vagues** ; il en reste **423,9 M** — ~1,5
vague à ce rendement, donc **deux**, la vague 6 entière par la règle de
fin.

**La vague 5 — écrite avant de la lancer.** Seize jobs, la recette
inchangée. *Attendus* — <span>inférence, confiance moyenne</span> — ceux
que quatre vagues ont tenus : **les seize, 360 à 520 M positions, 245 à
355 M gardées** — à proportion s'il manque des jobs ; **écartées 18,9 à
20,5 %, nulles 33,2 à 34,8 %** ; **sur un EPYC 7763, 1 150 à 1 220
positions par seconde**. Si l'image bascule sur Ubuntu 26 pour une partie
des jobs, les deux groupes se lisent séparément.

**La vague 5, RELEVÉE le 20 oct. à 7 h 30 — seize succès, dans les
attendus sur les cinq chiffres.** Lancée à 1 h 45, finie à 7 h 16.

| | les seize | attendu, écrit avant |
|---|---|---|
| positions | **443,1 M** | 360 à 520 M — dedans |
| gardées par le filtre de l'entraîneur | **302,8 M** | 245 à 355 M — dedans |
| écartées, sur les gardées | **19,28 %** (19,16 à 19,50 d'un job à l'autre) | 18,9 à 20,5 % — dedans |
| nulles, sur les gardées | **34,29 %** (33,99 à 34,59) | 33,2 à 34,8 % — dedans |
| EPYC 7763, positions par seconde | **1 139 à 1 188**, dix runners | 1 150 à 1 220 — **1 139 sous la borne**, les neuf autres dedans |

**Un EPYC 7763 à 1 139, sous la borne de 11 positions par seconde** —
39343469332, 1 % sous 1 150 : le seul des quarante-deux 7763 des cinq
vagues hors de la fourchette. Ses écartées (19,22 %) et ses nulles
(34,46 %) sont dans la leur : le débit a baissé, pas le générateur. Et
le pendant du Xeon 6973P-C de la vague 4, dans l'autre sens : **un EPYC
9V74 à 1 208**, quand les vagues 1 à 4 en montraient huit à 1 534 –
1 577 — même modèle, 22 % de moins. <span>Inférence, confiance
faible</span> : la charge des voisins de machine ; le nom du processeur
borne le débit, il ne le fixe pas. La fourchette du 7763, écrite sur une
seule sonde, était à peine assez large ; elle reste pour la vague 6,
avec ce point noté. L'image : `ubuntu-24.04` `20261018.339.1`, lue dans
le journal de 39343553716. **1 441,9 M gardées après cinq vagues** ; il
en reste **121,1 M** — la vague 6 les dépasse, et elle se fait **entière,
par la règle de fin écrite avant** : ~170 M de surplus attendus, que la
séance B n'emploiera pas (elle tire dans l'ordre de lancement jusqu'au
volume ancien), gardés pour (c) et (e).

**La vague 6, la dernière — écrite avant de la lancer.** Seize jobs, la
recette inchangée. *Attendus* — <span>inférence, confiance moyenne</span>
— ceux que cinq vagues ont tenus : **les seize, 360 à 520 M positions,
245 à 355 M gardées** — à proportion s'il manque des jobs ; **écartées
18,9 à 20,5 %, nulles 33,2 à 34,8 %** ; **sur un EPYC 7763, 1 150 à
1 220 positions par seconde**, un runner isolé jusqu'à 1 % dessous lu
comme à la vague 5 ; **le cumul, 1 687 à 1 797 M gardées** — le volume
ancien (1 563 M) atteint dans tous les cas. Si l'image bascule sur
Ubuntu 26 pour une partie des jobs, les deux groupes se lisent
séparément.

**La vague 6, RELEVÉE le 20 oct. à 13 h 10 — seize succès, dans les
attendus sur les six chiffres ; l'étape B est close.** Lancée à 7 h 31,
finie entre 13 h 01 et 13 h 03.

| | les seize | attendu, écrit avant |
|---|---|---|
| positions | **453,8 M** | 360 à 520 M — dedans |
| gardées par le filtre de l'entraîneur | **310,0 M** | 245 à 355 M — dedans |
| écartées, sur les gardées | **19,23 %** (18,99 à 19,35 d'un job à l'autre) | 18,9 à 20,5 % — dedans |
| nulles, sur les gardées | **34,30 %** (34,15 à 34,48) | 33,2 à 34,8 % — dedans |
| EPYC 7763, positions par seconde | **1 176 à 1 191**, sept runners | 1 150 à 1 220 — dedans, tous |
| le cumul gardé | **1 751,9 M** | 1 687 à 1 797 M — dedans |

Les autres processeurs à leurs débits habituels : trois EPYC 9V45 à
2 023 – 2 059, quatre 9V74 à 1 543 – 1 571 — le 9V74 lent de la vague 5
ne s'est pas reproduit —, un Xeon 8370C à 1 127, un 8573C à 1 135.
L'image : `ubuntu-24.04` `20261012.334.1` (Ubuntu 24.04.5), lue dans le
journal de 39375395417 — pas de bascule sur Ubuntu 26.

**L'étape B, close : 1 751,9 M positions gardées en six vagues**, 94 jobs
appris et le tenu à l'écart (`tools/n20-jobs.tsv`) — <s>95 jobs appris</s>,
le compte d'abord écrit comptait le tenu à l'écart parmi eux —, étiquetés par N6r4 à `cd6ed79` — × 1,12
le volume ancien (1 563 M). Le surplus, **188,6 M**, au-dessus des ~170 M
attendus : la séance B tire dans l'ordre de lancement jusqu'au volume
ancien, le reste est gardé pour (c) et (e). La séance B s'écrit après le
verdict de A, qui fixe ses superlots.

#### La séance B — après le volume

Trois réseaux de l'architecture W, aux superlots que l'étape A aura
désignés (200, ou 400 si N7p4 gagne) : **les données anciennes seules** —
le réseau de l'étape A à ces superlots, réutilisé — ; **les données neuves
seules**, à volume égal ; **les deux, 3,1 G**. Les deux moitiés seules se
comparent à volume, architecture et durée égaux : **l'étiqueteur**. Le tout
contre chaque moitié : **la pente**, une fois avec de meilleures étiquettes
sur la moitié ajoutée, une fois avec de moins bonnes — leur moyenne
approche le volume seul. *Attendus* — <span>inférence, confiance
faible</span> : **les deux contre l'ancienne seule : +3 à +12** ; **la
neuve seule contre l'ancienne seule : 0 à +10** — N6v, d'un étiqueteur
plus fort de ~50, rendait +5,52 ; W l'est de ~99. Critère d'embarquement :
celui du n° 17. **Chez Théo** : ~8,5 Go de plus à télécharger.

**Le verdict de A, le 20 oct. à 20 h 00 : `SL=400`** — N7p4 l'emporte
(section « Étape A — VERDICT »). **Le format attend l'arbitrage de Théo,
demandé le même soir** : tel qu'écrit — N8n et N8t au poids 0,75, puis une
séance de composition à leurs verdicts — ou, recommandé, **tout au poids
0,5** : N7p4w50 (les anciennes), N8tw50 (les deux), **N8tw50s800** (les
deux, 800 superlots), **l'écran du pas** — N6r4w50 aux pas 0,0005 et
0,002, 100 superlots, contre N6r4w50 — et N8nw50 (les neuves, en dernier),
~14 h 30 de carte,
le gagnant déjà composé. Avec le second, l'axe des données se lit à poids
fixe, et N7p4w50 contre N7p4 dit si le poids paie encore à 400
superlots.

**Les questions de Théo, le 20 oct. au soir, avant de valider** — et ce
qu'on y répond :
- *« Qu'est-ce qui nous dit que 600 ou 800 superlots ne sont pas
  mieux ? »* — **Rien, et la règle se l'écrit : on double tant qu'un
  doublement paie, démontré.** 100 → 200 a rendu +14,74, 200 → 400 +9,31 :
  le rendement décroît, rien ne dit qu'il est nul. On double plutôt que
  d'ajouter 200 — 600 contre 400 vaudrait ~+5 au mieux, sous la résolution
  de quatre jobs (± 3,5). Et le bon nombre de superlots suit le volume :
  400 superlots sur 3,1 G font 12,9 passes, autant que N7p2 sur 1,56 G —
  **N8tw50s800 contre N8tw50 pose donc la question sur les données qui
  serviront**. *Attendu* — <span>inférence, confiance faible</span> : +3 à
  +12, ~+7, sur le modèle de 12,8 → 25,6 passes (+9,31). S'il paie, 1 600
  à la séance suivante ;
- *« Faut-il tester d'autres poids du résultat ? »* — **Déprioritisé,
  pas fermé, et la raison se chiffre.** 0,75 → 0, 0,5 → +11,79, 0,25 → +7,17, chacun à
  ± 3,5 : l'optimum est entre 0,25 et 0,75, la parabole par les trois
  points le met vers 0,45, à +0,4 au-dessus de 0,5. Même chaque point
  poussé au bord de son intervalle — 0,25 à +10,7, 0,5 à +8,3 —, l'optimum
  ne rendrait que ~2,4 au-dessus de 0,5 : il faudrait ~12 jobs pour le
  séparer, pour un gain qu'on ne saurait pas distinguer de zéro.
  **Ce qui le rouvrirait** : N7p4w50 contre N7p4 très loin de +11,8 — le
  signe que l'optimum bouge avec les passes ; on placerait alors deux
  points autour de 0,5, à la recette finale ;
- *« (c) et (e) dans la séance B ? »* — **Non, ni l'un ni l'autre, pour
  deux raisons différentes.** (c), les architectures plus grandes, se
  mesure à la recette finale — volume, passes, poids —, que la séance B
  fixe : une séance C après son verdict, avec les nœuds par seconde de
  chaque architecture, l'AVX2 en place. (e), le budget de l'étiqueteur,
  n'est pas un entraînement mais une génération sur les runners : 10 000
  nœuds au lieu de 5 000, ~780 M positions, **étiquetées par N6r4** pour
  se comparer aux données neuves à étiqueteur égal ; elle peut commencer
  dès son protocole écrit, et ses réseaux entreront dans une séance
  suivante.
- **(b), Leela mêlé à nos données, passe derrière la séance B et la
  composition** — Théo, 20 oct. : « *ok pour passer leela derrière la
  séance B et composition* ».

**La séance B, lancée par Théo le 20 oct. au soir** — l'essai réussi,
puis `tout w50`. *Ce que chaque réseau affronte, et ce qu'on en attend,
écrit avant le premier* — <span>inférence, confiance faible</span>,
quatre jobs de 2 800 parties à `8+0,08` chacun, sonde de B8, nœuds par
seconde et perte tenue à l'écart avant :
- **N7p4w50 contre N7p4** — le poids paie-t-il encore à 400 superlots ?
  **+3 à +15, ~+9** : il rendait +11,79 à 100 ; un optimum qui bouge avec
  les passes le rognerait. Loin de +11,8 dans un sens ou l'autre, le poids
  se réexamine à la recette finale (le registre) ;
- **N8tw50 contre N7p4w50** — l'axe des données à poids et passes fixés :
  **+3 à +12, ~+7** — doubler payait +7,32 au n° 18, et la moitié neuve a
  un meilleur étiqueteur ; mais à 400 superlots, 3,1 G ne font que 12,9
  passes contre 25,6, ce qui en reprend une part ;
- **N8tw50s800 contre N8tw50** — le doublement suivant : **+3 à +12,
  ~+7** ;
- **N6r4w50pas0005 et N6r4w50pas002 contre N6r4w50** (`0f5214b`) — le pas
  de bullet : **−10 à +10 chacun**, sans sens attendu ;
- **N8nw50 contre N7p4w50** — l'étiqueteur à volume égal : **0 à +10,
  ~+4** — N6v rendait +5,52 pour un étiqueteur plus fort de ~50, N6r4
  l'est de ~99 sur N5l.
*Critère d'embarquement* : celui du n° 17, contre le réseau qui joue à
ce moment, chaque axe à part, un match direct quand deux gains se
recoupent ; le gagnant composé se mesure à son tour. Les candidats se
commitent et se révoquent comme aux étapes précédentes, au facteur de
`main` si leur sonde tombe dans la plage.

**N7p4w50, poussé par la séance le 20 oct. à 23 h 50, intégré le 21 oct. à
0 h 22 — conforme.** Relecture exacte des 79 jobs anciens (18 435 764 :
2 328 546 367), 400 superlots au poids 0,5, confrontation **6 / 30**
(admis 15 / 50) ; le réseau, sa courbe et sa sortie sur la branche
(`dd51299`). **Ses candidats, sur le code d'aujourd'hui** : N7p4 (`ec97f35`)
précède le produit AVX2 (`e77e0b1`, −5,09 % de temps) — le mesurer contre
lui fausserait le match de ~8 Elo. D'où deux candidats au même code au bit
près, commités et révoqués aussitôt, l'arbre revenu à `dd51299` :
**N7p4 recommité `7d84860`** (révoqué par `f46274f`), la même modification
que `ec97f35` ligne pour ligne ; **N7p4w50 `e37468b`** (par `04263c2`).
`verify.sh --rapide` vert sur chacun. Les comparaisons suivantes de la
séance B se mesurent sur ce code.

*Écrit le 21 oct. à 0 h 26, avant de lancer* — <span>inférence, confiance
faible</span> :
- **la sonde de B8 : 2,2 à 3,2**, dans 2,14 à 3,56, au facteur de `main` —
  N7p4 mesurait 2,79, N6r4w50 2,44 ;
- **les nœuds par seconde, × 0,97 à × 1,04 contre N7p4 recommité**, au
  rejeu du n° 15, dix tours ;
- **la perte tenue à l'écart : indiscernable de N7p4, ± 0,0001** — elle se
  lit sous 0,75, et N6r4w50 n'y était pas séparé de N6r4 ;
- **le match, N7p4w50 contre N7p4 recommité** (`e37468b` → `7d84860`),
  quatre jobs de 2 800 parties à `8+0,08`, graine « auto », AVX2 des deux
  côtés : **+3 à +15, ~+9**, écrit le 20 oct. au soir. *Critère, écrit
  avant* : **gain démontré si la borne basse est au-dessus de zéro** ;
  alors N7p4w50 devient la référence des comparaisons suivantes de la
  séance B, et le candidat à embarquer — contre le réseau qui joue à ce
  moment : si le match entre les axes fait embarquer N7p4, N7p4w50 le
  remplace sur ce match-ci ; s'il fait embarquer N6r4w50, un match direct
  N7p4w50 contre N6r4w50 s'écrit avant d'embarquer.

**La perte tenue à l'écart de N7p4w50, RELEVÉE le 21 oct. à 0 h 32 —
dans l'attendu.** Run 39508350034 (le premier, 39508197862, mort au
checkout : je lui avais passé un SHA court), contrôle exact (17 208 872,
17 938 594), N7p4 en référence :

| réseau | tenu à l'écart | écart à N7p4 | appris de tous | tenu − appris |
|---|---|---|---|---|
| N7p4 | 0,038390 | — | 0,037974 | +0,000416 |
| **N7p4w50** | 0,038432 | **+0,000042 ± 0,000022** | 0,038122 | **+0,000310** |
| N6r4 | 0,038560 | +0,000170 ± 0,000021 | 0,038148 | +0,000412 |

- **indiscernable de N7p4 à ± 0,0001**, comme écrit : la mesure se lit
  sous 0,75, une cible que N7p4w50 n'a pas minimisée ;
- **mais il retient un quart de moins** : +0,000310 d'écart entre tenu et
  appris, contre +0,000416 à N7p4 et +0,000412 à N6r4 — <span>inférence,
  confiance faible</span> : une cible qui pèse moins le résultat, bruité,
  s'apprend moins par cœur. Le match dira si ça se joue.

**La sonde de B8 et les nœuds par seconde de N7p4w50, RELEVÉS le 21 oct.
à 0 h 38 — dans l'attendu, au facteur de `main`.** La sonde : 40 parties,
finies à 0 h 32, zéro anomalie — facteur delta **× 2,7**, aspiration
**× 2,40** (10,4 % hors fenêtre à δ = 25), **moyenne géométrique 2,55**,
dans 2,2 à 3,2 et dans la plage : le candidat ne change pas. Les nœuds par
seconde, au rejeu du n° 15, dix tours, contre N7p4 recommité : **× 1,011**,
plus lent 4 tours sur 10, p = 0,75 — rien de séparé, dans × 0,97 à × 1,04.

**N8tw50, poussé par la séance le 21 oct. à 2 h 26, intégré à 2 h 46 —
conforme.** Relecture exacte des 79 jobs anciens et des 84 premiers neufs
(36 680 816 : 4 627 800 040), 400 superlots au poids 0,5, confrontation
**4 / 24** (admis 15 / 50) ; le réseau, sa courbe et sa sortie sur la
branche (`ba1d26b`). Son candidat, **N8tw50 `2115850`** (révoqué par
`d3ad14e`), au même code que N7p4w50 au bit près — seul `nnue.rs` diffère :
le réseau, sa doc, sa confrontation. `verify.sh --rapide` vert. Ses
évaluations sont plus resserrées que celles de N7p4 — 257 contre 514,
−79 contre −333 sur deux positions tactiques de la confrontation —, comme
celles de N7p4w50 (184, −109) : l'effet du poids 0,5, pas des données ;
ses plus grandes un peu plus encore (−2 192 contre −2 446, 296 contre
636).

*Écrit le 21 oct. à 2 h 46, avant de lancer* — <span>inférence, confiance
faible</span> :
- **la sonde de B8 : 2,0 à 3,0** — N7p4w50 mesurait 2,55, et ses grandes
  évaluations sont un peu plus petites encore. Sous 2,14, le bas de la
  plage, le facteur se réexamine avant d'embarquer, pas avant de mesurer :
  le match se joue au facteur de `main` (2,85), comme N7p4w50 ;
- **les nœuds par seconde, × 0,97 à × 1,04 contre N7p4w50** (`e37468b`),
  au rejeu du n° 15, dix tours — même architecture ;
- **la perte tenue à l'écart, sur DEUX jeux tenus à l'écart** désormais :
  38531414161 (n° 18, étiqueté par N5l) et 39050360980 (étape B, par N6r4,
  qu'aucun réseau mesuré n'avait encore vu en famille). Sur le premier,
  **N8tw50 à ± 0,0002 de N7p4w50** — la moitié de ses données vient d'un
  autre étiqueteur ; sur le second, **N8tw50 sous N7p4w50**, le sens seul
  attendu, l'ampleur inconnue ;
- **le match, N8tw50 contre N7p4w50** (`2115850` → `e37468b`), quatre jobs
  de 2 800 parties à `8+0,08`, graine « auto », AVX2 des deux côtés :
  **+3 à +12, ~+7**, écrit le 20 oct. au soir. *Critère, écrit avant* :
  **gain démontré si la borne basse est au-dessus de zéro** ; alors N8tw50
  devient la référence des comparaisons suivantes de la séance B
  (N8tw50s800 contre lui, déjà écrit) et le candidat à embarquer — si
  N7p4w50 a démontré contre N7p4 et embarqué, N8tw50 le remplace ; sinon,
  N7p4 jouant encore, **un match direct N8tw50 contre N7p4 recommité
  (`7d84860`) s'écrit avant d'embarquer** : deux gains non démontrés ne se
  composent pas.

**La perte tenue à l'écart de N8tw50, RELEVÉE le 21 oct. à 2 h 52 — dans
les deux attendus.** Run 39523442441, outil à `64a66df`, N7p4w50 en
référence ; les contrôles exacts (17 208 872 et 15 993 893 positions
gardées sur les jeux tenus à l'écart) :

| réseau | 38531414161, tenu (N5l) | écart | 39050360980, tenu (N6r4) | écart |
|---|---|---|---|---|
| N7p4w50 | 0,038432 | — | 0,038048 | — |
| **N8tw50** | 0,038404 | **−0,000028 ± 0,000019** | 0,037459 | **−0,000589 ± 0,000027** |
| N7p4 | 0,038390 | −0,000042 ± 0,000022 | 0,037899 | −0,000149 ± 0,000027 |

- **sur le jeu ancien, à ± 0,0002 de N7p4w50**, comme écrit : la moitié
  de ses données venue d'un autre étiqueteur ne lui coûte rien là ;
- **sur le jeu neuf, nettement dessous** — −0,000589, quatre fois l'écart
  de N7p4 à N7p4w50 sur le même jeu : il a appris les étiquettes de N6r4 ;
- **il retient moins encore** : tenu − appris +0,000219 sur l'ancien
  (38531424497, appris), contre +0,000310 à N7p4w50 et +0,000416 à N7p4 ;
  sur le neuf (39050368395, appris par lui seul), +0,000151, dont
  +0,000039 est l'écart des deux jobs pour N7p4w50, qui n'a appris aucun
  des deux. Deux fois plus de données, moins par cœur — <span>inférence,
  confiance moyenne</span>. **Ce que cela ne dit pas : la force.** Le
  match la dira ; la perte n'est pas un substitut (`CLAUDE.md`, « Ce qui
  compte comme preuve »).

**La sonde de B8 et les nœuds par seconde de N8tw50, RELEVÉS le 21 oct.
à 3 h 35 — dans l'attendu, au facteur de `main`.** La sonde : 40 parties,
finies à 2 h 53, zéro anomalie — facteur delta **× 2,9**, aspiration
**× 2,40** (10,5 % hors fenêtre à δ = 25), **moyenne géométrique 2,64**,
dans 2,0 à 3,0 et dans la plage (2,14 à 3,56) : le candidat ne change pas,
et ses grandes évaluations plus petites ne se lisent pas dans l'échelle
là où les marges tranchent. Les nœuds par seconde, au rejeu du n° 15, dix
tours, contre N7p4w50 : **× 1,005**, plus lent 4 tours sur 10, p = 0,75 —
rien de séparé, dans × 0,97 à × 1,04.

**N7p4w50 contre N7p4 — VERDICT, le 21 oct. à 5 h 48 : +3,35 ± 3,41,
rien de démontré ; N7p4 reste.** Quatre jobs finis ENTIERS entre 5 h 32
et 5 h 36, 6,5 à 6,6 s par partie, zéro perte au temps, aucun coup
illégal :

| job | Elo | pentanomial |
|---|---|---|
| 39508171364 (EPYC 7763, 2,03 M n/s, profondeur 15) | +1,24 ± 6,76 | 36, 247, 814, 277, 26 |
| 39508177771 | +7,07 ± 6,90 | 28, 254, 788, 293, 37 |
| 39508184279 | +7,69 ± 7,12 | 28, 266, 771, 286, 49 |
| 39508191011 | −2,61 ± 6,49 | 26, 264, 840, 245, 25 |
| **en commun, 11 200 parties** | **+3,35 ± 3,41** | homogènes, p = 0,155 |

- **Le critère, écrit avant** : la borne basse, **−0,06**, n'est pas
  au-dessus de zéro — **N7p4w50 n'embarque pas**, N7p4 joue. Dans
  l'attendu (+3 à +15), à son plancher ;
- **le poids du résultat rapporte moins à 400 superlots qu'à 100** :
  +3,35 ± 3,41 contre +11,79 ± 3,52 — l'écart, **8,4 ± 4,9**, est
  démontré. C'est la clause écrite avant, « *loin de +11,8 : l'optimum
  bouge avec les passes* » : <span>inférence, confiance moyenne</span>,
  plus de passes apprennent mieux le score bruité, et le résultat de la
  partie n'y apporte plus autant ; **le poids se réexamine à la recette
  finale** (le registre). Il n'y passe pas à « résolu » : 0,5 n'est pas
  démontré pire que 0,75 non plus ;
- **la séance B garde son format** : ses réseaux sont au poids 0,5, et
  N7p4w50 reste la référence des comparaisons écrites — N8tw50 contre
  lui est en vol.

**N8tw50 contre N7p4, le match direct — écrit le 21 oct. à 5 h 48, avant
de le lancer.** Le critère de N8tw50 le demandait si N7p4 jouait encore
et que N8tw50 démontrait contre N7p4w50 ; **il se lance dès
maintenant**, sans attendre ce verdict : c'est la mesure qui décide
d'embarquer, et la lancer après coûterait cinq heures. Quatre jobs de
2 800 parties à `8+0,08`, graine « auto », AVX2 des deux côtés,
**`2115850` (N8tw50) → `7d84860` (N7p4 recommité)**, le même code au
bit près — seul `nnue.rs` diffère, vérifié par `git diff`. *Attendu* —
<span>inférence, confiance faible</span>, la chaîne N8tw50 contre
N7p4w50 (+3 à +12) puis N7p4w50 contre N7p4 (+3,35) : **+3 à +16,
~+10**. *Critère, écrit avant* — celui du n° 17, contre le réseau qui
joue : **N8tw50 embarque si la borne basse est au-dessus de zéro**.
N8tw50 contre N7p4w50, qui finit avant, ne décide plus que la référence
des comparaisons de la séance B.

**N8tw50 contre N7p4w50 — VERDICT, le 21 oct. à 8 h 04 : +7,38 ± 3,40,
gain démontré ; l'axe des données paie à poids et passes fixés.** Quatre
jobs finis ENTIERS entre 7 h 50 et 7 h 56, 6,5 à 6,6 s par partie, zéro
perte au temps, aucun coup illégal :

| job | Elo | pentanomial |
|---|---|---|
| 39523413909 | +5,46 ± 6,71 | 27, 239, 836, 259, 39 |
| 39523421083 | +10,30 ± 6,61 | 30, 206, 849, 281, 34 |
| 39523427998 | +3,97 ± 6,95 | 36, 247, 804, 275, 38 |
| 39523435015 | +9,81 ± 6,91 | 27, 240, 805, 283, 45 |
| **en commun, 11 200 parties** | **+7,38 ± 3,40** | homogènes, p = 0,567 |

- **Dans l'attendu (+3 à +12, ~+7), au centre.** Doubler les données
  — la moitié neuve étiquetée par N6r4 — paie à 400 superlots autant que
  doubler payait au n° 18 (+7,32) à 100 : à 12,9 passes au lieu de 25,6,
  le volume compense ce que les passes perdent ;
- **N8tw50 devient la référence des comparaisons suivantes** de la
  séance B — N8tw50s800 contre lui est en vol depuis 7 h 59 ;
- **l'embarquement ne se décide pas ici** : contre N7p4, le réseau qui
  joue, le match direct est en vol depuis 5 h 48 ; la chaîne le place à
  +7,38 + 3,35 ≈ **+10,7 ± 4,8**, dans son attendu (+3 à +16).

**N8tw50 contre N7p4 — VERDICT, le 21 oct. à 11 h 07 : +17,91 ± 3,40, gain
démontré — N8tw50 EMBARQUÉ.** Quatre jobs finis ENTIERS entre 10 h 51 et
10 h 58, 6,46 à 6,61 s par partie, zéro perte au temps, aucun coup
illégal, aucun moteur perdu :

| job | Elo | pentanomial |
|---|---|---|
| 39540594928 | +23,74 ± 6,74 | 17, 198, 811, 325, 49 |
| 39540601262 | +19,88 ± 6,94 | 24, 216, 782, 332, 46 |
| 39540607357 | +12,91 ± 6,56 | 18, 227, 822, 299, 34 |
| 39540613220 | +15,15 ± 6,91 | 20, 245, 770, 323, 42 |
| **en commun, 11 200 parties** | **+17,91 ± 3,40** | homogènes, p = 0,109 |

- **Critère, écrit avant** : la borne basse, +14,51, est au-dessus de
  zéro — **N8tw50 embarque**. Fait sur la branche à `e9b7dd4`, la
  révocation `d3ad14e` révoquée : le code de `2115850` au bit près, au
  facteur des marges de `main`, 2,85, sa sonde à 2,64 ;
- **au-dessus de l'attendu (+3 à +16, ~+10), de 1,9.** La chaîne
  N8tw50 → N7p4w50 → N7p4 prédisait +10,7 ± 4,8 ; le match direct rend
  +17,9 ± 3,4 — un écart de +7,2 ± 5,9, z ≈ 2,4. <span>Inférence,
  confiance faible</span> : N7p4w50, au poids de N8tw50, lui ressemble
  davantage que N7p4, et entre deux voisins de style un match sépare
  moins — l'Elo d'une chaîne ne s'additionne pas exactement. *La chaîne a
  sous-estimé, dans le sens qui coûte le moins* ; l'embarquement s'est
  décidé sur le match direct, comme le critère l'écrivait ;
- **la suite** : la PR et le crible — **lancé à 11 h 08 sur `743c6ec`
  (39574588694), prédiction 163, chaque fichier à son plafond** ; après la
  fusion, le balayage (prédiction 163 : seuls le chemin du réseau et les valeurs de
  la confrontation changent dans `engine/src/`) et la série C13 de N8tw50,
  son attendu écrit avant (section C13). **N8tw50s800 contre N8tw50**, en
  vol depuis 7 h 59, devient le match direct contre le réseau qui joue : un
  gain démontré l'embarque à son tour — **ce qu'il a fait** (« N8tw50s800
  contre N8tw50 — VERDICT »).

**N8tw50s800, poussé par la séance le 21 oct. à 7 h 37, intégré à 7 h 58
— conforme.** Les mêmes 163 jobs que N8tw50 (la liste identique, vérifiée),
relecture exacte (36 680 816 : 4 627 800 040), 800 superlots au poids
0,5, 5 h 10 de carte, confrontation **5 / 15** (admis 15 / 50) ; le
réseau, sa courbe et sa sortie sur la branche (`14ce661`). Son candidat,
**N8tw50s800 `c7b4249`** (révoqué par `29eba57`), au code de N8tw50 au
bit près — seul `nnue.rs` diffère. `verify.sh --rapide` vert. **Ses
évaluations s'élargissent** à mesure des passes — 388 contre 257, −2 507
contre −2 192, 565 contre 296 —, vers celles de N7p4 (514, −2 469, 486).

*Écrit le 21 oct. à 7 h 58, avant de lancer* — <span>inférence, confiance
faible</span> :
- **la sonde de B8 : 2,3 à 3,3** — N8tw50 mesurait 2,64, N7p4 2,79, et
  ses évaluations remontent vers celles de N7p4 ;
- **les nœuds par seconde, × 0,97 à × 1,04 contre N8tw50**, au rejeu du
  n° 15, dix tours ;
- **la perte tenue à l'écart, N8tw50 en référence : à ± 0,0003 sur les
  deux jeux, plus basse au point** ; et il retient davantage — tenu − appris
  plus grand —, comme N7p4 en face de N6r4 ;
- **le match, N8tw50s800 contre N8tw50** (`c7b4249` → `2115850`), quatre
  jobs de 2 800 parties à `8+0,08`, graine « auto », AVX2 des deux côtés :
  **+3 à +12, ~+7**, écrit le 20 oct. au soir. *Critère, écrit avant* :
  **gain démontré si la borne basse est au-dessus de zéro** ; alors
  **1 600 superlots** devient le test suivant (le registre), et
  N8tw50s800 le candidat à embarquer — si N8tw50 a embarqué, il le
  remplace ; si N7p4 joue encore, un match direct N8tw50s800 contre N7p4
  s'écrit avant d'embarquer. Non démontré : 400 superlots tiennent à ce
  volume, et le registre le note sans fermer l'axe.

**Les mesures hors match de N8tw50s800, RELEVÉES le 21 oct. à 8 h 41 —
dans l'attendu, sauf la mémoire.**
- **la sonde de B8** : 40 parties, zéro anomalie — delta **× 3,7**,
  aspiration **× 2,20** (δ qui égalise 55), **moyenne géométrique 2,85**,
  dans 2,3 à 3,3 et dans la plage : au facteur de `main`. Les évaluations
  élargies se lisent ici : 2,64 pour N8tw50, 2,85 pour lui ;
- **les nœuds par seconde**, au rejeu du n° 15 contre N8tw50 : **× 0,987**,
  plus lent 6 tours sur 10, p = 0,75 — rien de séparé ;
- **la perte tenue à l'écart** (run 39552673143, N8tw50 en référence) :
  **−0,000034 ± 0,000017** sur le jeu ancien (N5l), **−0,000006 ± 0,000017**
  sur le neuf (N6r4) — à ± 0,0003, plus basse au point, comme écrit ;
- **mais il ne retient pas davantage**, contre l'attendu : tenu − appris
  +0,000213 sur l'ancien (+0,000219 à N8tw50), +0,000172 sur le neuf
  (+0,000151). Doubler les passes sur 4,63 G ne rapproche pas le réseau de
  ses données d'entraînement plus que de celles qu'il n'a pas vues — 25,9
  passes au lieu de 12,9, en dessous du régime où N7p4 (25,6 passes sur
  1,56 G) retenait +0,000416. <span>Inférence, confiance faible</span> :
  au volume de N8tw50, 800 superlots restent loin de la saturation.

**N8tw50s800 contre N8tw50 — VERDICT, le 21 oct. à 13 h 23 : +5,43 ± 3,34, gain
démontré — N8tw50s800 EMBARQUÉ à la place de N8tw50.** Quatre jobs finis
ENTIERS entre 12 h 56 et 13 h 12, 6,35 à 6,67 s par partie, zéro perte au
temps, aucun coup illégal :

| job | Elo | pentanomial |
|---|---|---|
| 39552647058 | +3,35 ± 6,52 | 31, 229, 846, 270, 24 |
| 39552653524 | +11,79 ± 6,53 | 20, 222, 834, 291, 33 |
| 39552659966 | +2,85 ± 6,78 | 31, 251, 815, 270, 33 |
| 39552666616 | +3,72 ± 6,89 | 29, 260, 803, 268, 40 |
| **en commun, 11 200 parties** | **+5,43 ± 3,34** | homogènes, p = 0,245 |

- **Critère, écrit avant** : la borne basse, +2,09, est au-dessus de zéro
  — **le gain est démontré**, et le critère disait la suite : N8tw50
  ayant embarqué, **N8tw50s800 le remplace** ; **1 600 superlots devient
  le test suivant** (le registre). Fait à `553e76e` : le `nnue.rs` du
  candidat `c7b4249`, identique au code d'aujourd'hui hors le réseau, au
  facteur de `main` (2,85), sa sonde à 2,85 ;
- **dans l'attendu (+3 à +12, ~+7), sous son centre.** Doubler les passes
  à 4,63 G rend +5,43 ; à 1,56 G, il rendait +14,74 (100 → 200) puis
  +9,31 (200 → 400) : **le rendement décroît par doublement, et plus vite
  qu'à volume moindre il ne le laissait prévoir** — à 25,9 passes, plus
  près de la saturation que les 12,9 de N8tw50 ne le disaient, sans
  l'atteindre. <span>Inférence, confiance faible</span> : 1 600 superlots
  rendrait +2 à +5 ; le registre le classe à sa marge ;
- **la retenue** (« Les mesures hors match de N8tw50s800 ») : il ne
  retenait pas davantage par cœur, et il joue mieux — la perte tenue à
  l'écart le disait un peu plus bas, au point ;
- **ce qui ne change pas** : le crible lancé à 11 h 08 sur `743c6ec`
  porte sur le CODE, que N8tw50s800 laisse au bit près — seul le réseau
  embarqué diffère, et ce qui dépend du réseau dans les tests, la
  confrontation recopiée, passe `verify.sh`. Le balayage après fusion,
  sur `main` avec N8tw50s800, le confirme sur le réseau qui joue, à la
  même prédiction (163). **La série C13 portera sur N8tw50s800**, son
  attendu réécrit avant de la lancer (section C13).

**Le crible, RELEVÉ le 21 oct. à 15 h 21 — CONFORME, exactement.** Run
39574588694 sur `743c6ec`, dix jobs verts, le `Verdict` vert : **163
survivants**, chaque fichier à son plafond. `nnue.rs` : les deux mêmes
survivants (`Arch::input_buckets`, `changes`), 149 attrapés, **3 expirés**
— 0 au crible du 20 oct. : un expiré n'est pas un survivant, et le plafond
de 4 Gio tient ; à surveiller s'ils deviennent des survivants. `search.rs`
en **252 minutes**, 72 % de la limite de 350 (274 la veille). `verify.sh`
complet vert sur `e9b7dd4` à 11 h 11 et sur `553e76e` à 13 h 31. **La PR
#208 fusionnée à 15 h 22** (`8c39061`) : N8tw50s800 joue sur `main`.
Lancés à 15 h 22 : le balayage après fusion (39607356269, prédiction 163)
et **la série C13 de N8tw50s800** (39607395788, attendu ~3 155). **Relevés
le 21 oct. à 21 h 05** : le balayage **163, exact**, `nnue.rs` sans expiré —
les trois du crible ne sont pas devenus des survivants —, `search.rs` en
180 minutes ; la série, **3 127 ± 24**, dans son attendu (section C13,
« N8tw50s800, RELEVÉ »).

**L'écran du pas, poussé par la séance le 21 oct. à 8 h 18 et 8 h 56,
intégré à 9 h 23 — conforme.** **N6r4w50pas0005** (pas initial 0,0005, la
moitié du défaut) et **N6r4w50pas002** (0,002, le double) : la recette de
N6r4w50 au seul pas près — 100 superlots, poids 0,5, les 79 jobs du
n° 18, la même liste vérifiée —, relecture exacte (18 435 764 :
2 328 546 367), confrontations **8 / 24** et **6 / 23** ; leurs réseaux sur
la branche (`e6044a4`). **Leur référence, N6r4w50 recommité sur le code
d'aujourd'hui, `93a3b86`** (révoqué par `e6f24e6`) : `0f5214b` précède le
produit AVX2 ; la même doc et la même confrontation, vérifiées ligne à
ligne. Candidats **`f7a061a`** (pas 0,0005, révoqué par `db3983e`) et
**`811bfe5`** (pas 0,002, par `37d1096`), chacun au code de `93a3b86` au
bit près — seul `nnue.rs` diffère. `verify.sh --rapide` vert sur les deux.
Pertes d'entraînement au 100ᵉ superlot : 0,019614 et 0,019635.

*Écrit le 21 oct. à 9 h 23, avant de lancer* — <span>inférence, confiance
faible</span> :
- **la sonde de B8 : 2,0 à 3,0 chacun** — N6r4w50 mesurait 2,44 ;
- **les nœuds par seconde, × 0,97 à × 1,04 contre N6r4w50 recommité** —
  même architecture ;
- **la perte tenue à l'écart** (38531414161, N6r4w50 en référence) :
  **à ± 0,0003 chacun, le sens inconnu** ;
- **les matchs, chacun contre N6r4w50 recommité** (`f7a061a` → `93a3b86`,
  `811bfe5` → `93a3b86`), quatre jobs de 2 800 parties à `8+0,08`, graine
  « auto », AVX2 des deux côtés : **−10 à +10 chacun, sans sens attendu**,
  écrit le 20 oct. au soir. *Critère, écrit avant* : **un gain démontré
  (borne basse au-dessus de zéro) fait de ce pas celui de la recette
  suivante** (séance C), et le pas suivant dans le même sens — 0,00025 ou
  0,004 — entre au registre ; une régression démontrée d'un côté ne dit que
  ce côté ; rien de démontré des deux : 0,001 reste, le registre note la
  pente au point. Aucun des deux n'est candidat à embarquer : 100
  superlots sur 1,56 G, loin de N7p4.

**Les mesures hors match de l'écran du pas, RELEVÉES le 21 oct. à 11 h 05 —
les trois dans leur attendu, sur les deux pas.** La sonde de B8, lancée à
9 h 23, est morte avec le conteneur à 9 h 25 — les binaires construits,
aucune partie jouée ; relancée à 10 h 45 sur les mêmes binaires, la
vitesse ensuite, jamais en même temps :

| | N6r4w50pas0005 | N6r4w50pas002 | attendu, écrit avant |
|---|---|---|---|
| sonde de B8 — delta, aspiration | × 2,8, × 2,40 | × 3,5, × 1,80 | |
| sonde de B8 — le facteur | **2,59** | **2,51** | 2,0 à 3,0 — dedans |
| nœuds par seconde contre N6r4w50 recommité | **× 1,000**, 5 / 10, p = 1 | **× 0,992**, 6 / 10, p = 0,75 | × 0,97 à × 1,04 — dedans |
| perte tenue à l'écart (38531414161), contre N6r4w50 | **+0,000036 ± 0,000018** | **+0,000051 ± 0,000018** | ± 0,0003 — dedans |
| la même, sur un job appris (38531424497) | +0,000054 ± 0,000017 | +0,000047 ± 0,000017 | |

- **Les deux pas perdent un peu, de chaque côté** — N6r4w50 à 0,038535 ;
  deux à trois écarts-types, le dixième de la fourchette. Le défaut, 0,001,
  est au fond d'une cuvette plate en perte ; *ce que la perte ne dit pas
  de la force* (« ce qui compte comme preuve »), les matchs le diront ;
- **la sonde ne sépare pas les pas** : 2,59 et 2,51, N6r4w50 à 2,44 ; les
  deux dans la plage du facteur de `main` (2,14 à 3,56), qui reste, et les
  matchs sont valides tels que lancés ;
- **la vitesse** : même architecture, rien de démontré.

**L'écran du pas — VERDICT, le 21 oct. à 14 h 36 : 0,0005 −0,12 ± 3,43, rien ;
0,002 −4,90 ± 3,41, régression démontrée — le défaut, 0,001, reste.**
Huit jobs finis ENTIERS entre 14 h 26 et 14 h 35, 6,45 à 6,64 s par
partie, zéro perte au temps, aucun coup illégal ; chacun contre N6r4w50
recommité (`93a3b86`) :

| réseau | job | Elo | pentanomial |
|---|---|---|---|
| N6r4w50pas0005 | 39561639865 | −4,47 ± 6,88 | 33, 290, 787, 260, 30 |
| | 39561648457 | +0,74 ± 6,77 | 31, 260, 813, 264, 32 |
| | 39561656404 | +4,34 ± 7,07 | 29, 275, 771, 282, 43 |
| | 39561665150 | −1,12 ± 6,70 | 36, 249, 830, 258, 27 |
| | **en commun, 11 200 parties** | **−0,12 ± 3,43** | homogènes, p = 0,298 |
| N6r4w50pas002 | 39561673391 | −1,61 ± 6,74 | 31, 265, 823, 248, 33 |
| | 39561681660 | −4,72 ± 6,67 | 35, 262, 837, 238, 28 |
| | 39561689739 | −6,20 ± 6,89 | 39, 283, 794, 257, 27 |
| | 39561698135 | −7,07 ± 7,00 | 36, 297, 794, 234, 39 |
| | **en commun, 11 200 parties** | **−4,90 ± 3,41** | homogènes, p = 0,689 |

- **Critère, écrit avant** : aucun gain démontré — **0,001 reste** ; la
  régression du double ne dit que ce côté. **Dans l'attendu** (−10 à +10
  chacun, sans sens) ;
- **la pente au point** : doubler le pas coûte ~5, le diviser par deux ne
  rend rien — le défaut est au bord haut d'un plateau, et la perte tenue à
  l'écart (+0,00004 des deux côtés) ne le voyait pas : *une perte plate
  n'est pas un Elo plat* ;
- **le registre** : la marge du pas initial est fine — un pas entre 0,0005
  et 0,001 rendrait au mieux quelques Elo, sous le seuil d'un écran de
  quatre jobs ; déprioritisé, il garde sa ligne et se rouvre avec la
  recette (le pas optimal bouge avec la taille du lot et du réseau).

**N8nw50, poussé par la séance le 21 oct. à 11 h 33, intégré à 11 h 51 —
conforme.** Le dernier réseau de la séance B : les 84 premiers jobs appris
de l'étape B seuls — **la liste de N8tw50 moins les 79 du n° 18, vérifiée
job par job** —, relecture exacte (18 245 052 : 2 299 253 673), 400
superlots au poids 0,5, **25,5 passes** (17,4 écrit d'abord, compté sur les positions et non les gardées — corrigé le 22 oct.) ; confrontation **7 / 12** (admis
15 / 50) ; perte d'entraînement au 400ᵉ superlot 0,019267. Le réseau sur la
branche (`817155f`) ; candidat **`6a1b1d6`** (révoqué par `0c9bf93`), au
code de N7p4w50 (`e37468b`) au bit près — seul `nnue.rs` diffère.

*Écrit le 21 oct. à 11 h 51, avant de lancer* — <span>inférence, confiance
faible</span> :
- **la sonde de B8 : 2,3 à 3,3** — N7p4w50 2,55, N8tw50 2,64 ;
- **les nœuds par seconde, × 0,97 à × 1,04 contre N7p4w50** — même
  architecture ;
- **la perte tenue à l'écart**, N7p4w50 en référence, N8tw50 à côté, sur
  38531414161 (tenu, étiqueté par N5l), 39050360980 (tenu, par N6r4),
  38531424497 et 39050368395 (appris) : **plus basse sur le jeu de N6r4,
  −0,0004 à −0,0012** — il en apprend les étiquettes, N8tw50 y rendait
  −0,000589 contre N7p4 ; **plus haute sur celui de N5l, 0 à +0,0006** —
  il n'en a vu aucune ;
- **le match, N8nw50 contre N7p4w50** (`6a1b1d6` → `e37468b`), quatre
  jobs de 2 800 parties à `8+0,08`, graine « auto », AVX2 des deux côtés :
  **0 à +10, ~+4**, écrit le 20 oct. au soir — l'étiqueteur à volume égal.
  *Critère, écrit avant* : un gain démontré (borne basse au-dessus de
  zéro) dit que l'étiqueteur paie encore — N6r4 sur N5l —, et (e), qui
  double le budget de l'étiqueteur, garde son rang ; rien de démontré : le
  registre le note, sans fermer l'axe. **Aucun embarquement n'en dépend** :
  N8tw50, qui joue, a deux fois ses données.

**Les mesures hors match de N8nw50, RELEVÉES le 21 oct. à 12 h 04 — deux dans
l'attendu, deux au bord.**

| | N8nw50 | N8tw50, à côté | attendu, écrit avant |
|---|---|---|---|
| sonde de B8 — delta, aspiration | × 2,9, × 2,20 | | |
| sonde de B8 — le facteur | **2,53** | 2,64 | 2,3 à 3,3 — dedans |
| nœuds par seconde contre N7p4w50 | **× 0,966**, plus lent 7 / 10, p = 0,34 | × 1,005 (contre N7p4) | × 0,97 à × 1,04 — **0,004 dessous au point**, rien de séparé |
| perte, tenu par N6r4 (39050360980), contre N7p4w50 | **−0,000747 ± 0,000031** | −0,000589 | −0,0004 à −0,0012 — dedans |
| perte, tenu par N5l (38531414161) | **+0,000660 ± 0,000046** | −0,000028 | 0 à +0,0006 — **0,00006 dessus**, à 1,3 écart-type |
| perte, appris par N6r4 (39050368395) | −0,000950 ± 0,000031 | −0,000701 | |
| perte, appris par N5l (38531424497) — qu'il n'a pas vu | +0,000829 ± 0,000046 | +0,000062 | |

- **Chacun apprend son étiqueteur** : sur les positions de N6r4, N8nw50
  fait mieux que N8tw50, qui en a vu autant mais mêlées ; sur celles de
  N5l, il fait nettement moins bien que les deux — la perte mesure
  l'accord avec un étiqueteur, et c'est précisément pourquoi elle ne
  départage pas deux étiqueteurs : *le match le dira* ;
- **il retient davantage par cœur** : appris − tenu sur les jobs de N6r4,
  −0,000242, contre −0,000151 pour N8tw50 et −0,000039 pour N7p4w50, qui
  n'a vu ni l'un ni l'autre — 25,5 passes contre 12,8 (17,4 et 12,9 écrits d'abord ; corrigé le 22 oct.) ;
- **la sonde** dans la plage du facteur de `main` : le match est valide tel
  que lancé.

**N8nw50 contre N7p4w50 — VERDICT, le 21 oct. à 17 h 20 : +12,76 ± 3,45, gain
démontré ; l'étiqueteur paie encore.** Quatre jobs finis ENTIERS entre
16 h 58 et 17 h 06, 6,54 à 6,66 s par partie, zéro perte au temps, aucun
coup illégal, aucun moteur perdu ; les avertissements, une à cinq « PV
continues after fifty-move rule » par job et par moteur, des deux côtés :

| job | Elo | pentanomial |
|---|---|---|
| 39580170864 | +10,80 ± 6,62 | 22, 228, 826, 289, 35 |
| 39580178400 | +15,02 ± 7,05 | 31, 222, 790, 309, 48 |
| 39580185874 | +10,55 ± 7,10 | 31, 246, 776, 301, 46 |
| 39580193883 | +14,65 ± 6,86 | 25, 217, 823, 285, 50 |
| **en commun, 11 200 parties** | **+12,76 ± 3,45** | homogènes, p = 0,817 |

- **Critère, écrit avant** : la borne basse, +9,31, est au-dessus de
  zéro — **l'étiqueteur paie encore**, N6r4 sur N5l à volume égal
  (2,30 G contre 2,33 G positions, 400 superlots, poids 0,5) ; **(e)
  garde son rang**. Aucun embarquement n'en dépend ;
- **au-dessus de l'attendu (0 à +10, ~+4) au point, l'intervalle le
  touche.** *Faute de l'attendu, nommée* : il citait N6v, +5,52 pour un
  étiqueteur plus fort de ~50, et N6r4 plus fort de ~99 — la proportion
  qu'il posait donnait ~+11, et il a écrit ~+4. Mesuré : **0,13 Elo de
  réseau par Elo d'étiqueteur, contre 0,11 au n° 18**. <span>Inférence,
  confiance faible</span> : deux points, le premier à ± 3,97 ;
- **la chaîne pose une question que ce verdict n'avait pas** : N8tw50,
  les mêmes données neuves PLUS les 79 jobs étiquetés par N5l, au même
  nombre de superlots, ne rendait que +7,38 ± 3,40 contre N7p4w50. Par
  différence, **N8nw50 − N8tw50 ≈ +5,4 ± 4,8**, z ≈ 1,1 — rien de séparé,
  mais le point dit qu'à budget d'entraînement fixé, **les données de
  l'étiqueteur faible coûteraient plus de passes sur les bonnes qu'elles
  n'apportent de volume** ; et N8nw50 − N8tw50s800, qui joue, ≈ −0,1 ±
  5,9 : la moitié des passes pour le même Elo au point. La séance C
  choisit ses données : la question se tranche avant elle.

**N8nw50 contre N8tw50 — écrit le 21 oct. à 17 h 20, avant de lancer.** Le
match direct que la chaîne appelle : `6a1b1d6` (N8nw50) contre `2115850`
(N8tw50), le même code au bit près — seul `nnue.rs` diffère —, quatre
jobs de 2 800 parties à `8+0,08`, graine « auto », AVX2 des deux côtés,
le facteur de `main` (2,85), leurs sondes à 2,53 et 2,64. *Attendu* — la
chaîne, à son incertitude : **−3 à +13, ~+5**. <span>Inférence, confiance
faible.</span> *Critère, écrit avant* : un gain démontré (borne basse
au-dessus de zéro) dit qu'à superlots fixés **les données de N5l coûtent**
— la séance C les laisse hors de sa recette, et un N8n à 800 superlots
devient le prochain candidat contre N8tw50s800 ; une régression démontrée
(borne haute sous zéro) dit que le volume paie même mal étiqueté — elles
restent ; rien de démontré : elles restent, la recette qui joue les
contient. **Aucun embarquement n'en dépend** : N8tw50s800 joue, et
aucun des deux ne le passe à la chaîne.

**N8nw50 contre N8tw50 — VERDICT, le 21 oct. à 22 h 47 : +5,18 ± 3,32, gain
démontré ; à superlots fixés, les données de N5l coûtent.** Quatre jobs
finis ENTIERS entre 22 h 22 et 22 h 29, 6,37 à 6,51 s par partie, zéro
perte au temps, aucun coup illégal, aucun moteur perdu ; une à cinq
« PV continues after… » par job et par moteur, des deux côtés :

| job | Elo | pentanomial |
|---|---|---|
| 39625371366 | +3,35 ± 6,73 | 28, 255, 810, 276, 31 |
| 39625376858 | +7,82 ± 6,70 | 24, 237, 831, 268, 40 |
| 39625382206 | +4,59 ± 6,74 | 27, 247, 826, 262, 38 |
| 39625386627 | +4,96 ± 6,38 | 22, 233, 854, 265, 26 |
| **en commun, 11 200 parties** | **+5,18 ± 3,32** | homogènes, p = 0,793 |

- **Critère, écrit avant** : la borne basse, +1,86, est au-dessus de
  zéro — **les 79 jobs étiquetés par N5l coûtent plus de passes sur les
  bonnes données qu'ils n'apportent de volume**, à 400 superlots ;
  **la séance C les laisse hors de sa recette**, et **un N8n à 800
  superlots devient le prochain candidat contre N8tw50s800**. Aucun
  embarquement n'en dépendait ;
- **dans l'attendu (−3 à +13, ~+5), au centre** : la chaîne N8nw50 →
  N7p4w50 ← N8tw50 prédisait +5,4 ± 4,8, le direct rend +5,2 ± 3,3 — elle
  tient cette fois, quand celle de N8tw50 contre N7p4 avait manqué de 7 ;
- <s>**ce que cela dit du volume** : doubler les données payait +7,38 quand
  la moitié ajoutée était MEILLEURE (N8tw50 contre N7p4w50) ; ajouter une
  moitié PLUS FAIBLE à des données meilleures coûte −5,2. *Le volume paie
  à qualité d'étiquette égale ou meilleure ; une étiquette plus faible
  dilue.* <span>Inférence, confiance moyenne</span> : un point par sens ;</s>
  **faux tel qu'écrit — corrigé le 22 oct., plus bas** : le −5,2 mêle
  l'étiquette et deux fois plus de passes par position ;
- **N8nw50s800, l'attendu** — <span>inférence, confiance faible</span> :
  contre N8tw50s800, **−3 à +10, ~+3**. N8nw50 est devant N8tw50 de +5,2
  à 400 ; doubler les passes rendait +5,43 à N8t (12,9 → 25,9 passes),
  <s>et N8n en a déjà 17,4 — son doublement rend moins, ~+2 à +5.</s> **N8n
  en a déjà 25,5, pas 17,4 : il en ferait 51, au-delà de tout ce qui est
  éprouvé — remplacé en séance C1 par N9w50s800** (22 oct.). La
  commande seule : `bash tools/seance-n20b.sh tout n8n800`, ~5 h 15 de
  carte — **fondu dans la séance C** : Théo, 21 oct. à 23 h 30, « *oui on peut
  intégrer la séance à C* ».

**Corrigé le 22 oct. à 4 h 27 — les passes de N8nw50 étaient mal comptées, et
la lecture « une étiquette plus faible dilue » n'en découlait pas.** Toutes
nos passes se comptent sur les positions GARDÉES par le filtre ; celles de
N8nw50 l'avaient été sur toutes ses positions (2,30 G → 17,4). Sur ses
1 571,1 M gardées, 400 superlots font **25,5 passes** — autant que N7p4w50
(25,6) et N8tw50s800 (25,5), **deux fois N8tw50** (12,8). D'où :
- **N8nw50 contre N7p4w50, +12,76** : volume ET passes égaux — l'étiqueteur
  seul ; la mesure est propre ;
- **N8nw50 contre N8tw50, +5,18** : la décision tient — à superlots
  égaux, les données de N5l prennent des passes aux bonnes — mais le
  chiffre mêle l'étiquette et deux fois plus de passes par position ;
- **à passes égales**, par différence des deux matchs directs —
  N8tw50s800 − N8tw50 = +5,43 ± 3,34, N8nw50 − N8tw50 = +5,18 ± 3,32 — :
  **N8tw50s800 − N8nw50 = +0,25 ± 4,71**. La moitié étiquetée par N5l
  n'ajoute rien de mesurable, là où doubler des données de même étiquette
  à passes égales rendait ~+13 au n° 18 (N6l contre N6m +7,32, puis
  N6l200 contre N6l +5,49). <span>Inférence, confiance faible</span> : elle
  annule le gain du volume plutôt qu'elle ne fait perdre ; *ni gain ni
  perte démontrés — elle coûte du calcul sans rien rendre*, et la séance C
  la laisse pour cette raison-là ;
- **N8nw50s800 ferait 51 passes** sur 1,57 G, au-delà de tout ce qui est
  éprouvé (25,9), et laisserait 0,98 G de données de N6r4 de côté :
  **remplacé en séance C1 par N9w50s800** — toutes les données de N6r4,
  2 553 M gardées, 31,3 passes —, à la même carte (section « La séance
  C1 »). *Faute nommée* : un dénominateur pris pour un autre, la famille
  de « vérifier le dénominateur » (`CLAUDE.md`).

**Le script, `tools/seance-n20b.sh`, écrit le 20 oct. au soir** — les
blocs ci-dessous enchaînés d'une traite, comme `tools/seance-n20.sh` pour
la séance A : les contrôles d'avant (dépôt, 79 jobs anciens et leurs 316
fichiers, `gh` connecté, CUDA, 16 Go libres), le téléchargement des 94
jobs neufs — repris au job qui manque —, l'essai court sur les 84 retenus,
puis les réseaux du format choisi, **chacun commité et poussé sur
`reseau/n20b` dès qu'il passe ses contrôles** : le premier fini se mesure
pendant que les suivants s'entraînent. `bash tools/seance-n20b.sh essai`,
puis `bash tools/seance-n20b.sh tout w50` — ou `tout ecrit`. L'ordre au
format `w50` : N7p4w50, le plus probable à embarquer, puis N8tw50, puis
N8tw50s800, puis l'écran du pas, puis N8nw50, qu'on peut couper. *Éprouvé dans un bac à sable* — faux `cargo`, faux `gh`, dépôt
distant local : l'essai ; la séance entière avec une panne simulée sur
N8tw50, puis la relance, qui reprend N8tw50 seul et pousse les trois ; une
troisième relance qui ne refait rien ; un téléchargement interrompu puis
repris ; `gh` déconnecté, arrêt avant tout lancement ; le format écrit ;
un format inconnu refusé.

**La séance B — les commandes, écrites le 20 oct. à 13 h 25, avant de la
demander ; elle ne se demande qu'au verdict de A.** Deux réseaux neufs de
l'architecture de N6r4, à `main`, au même nombre de superlots `SL` — 200,
ou 400 si N7p4 gagne l'étape A — : **N8n, les données neuves seules** ;
**N8t, les anciennes et les neuves**. Le troisième, les anciennes seules à
`SL` superlots, est N7p2 ou N7p4, déjà entraîné. *Les neuves* : les **84
premiers jobs appris dans l'ordre de lancement**, la règle de fin écrite
avant — **1 571 050 534 positions gardées**, 0,5 % au-dessus des
1 563 356 858 anciennes —, 18 245 052 parties, 2 299 253 673 positions ;
les dix suivants restent pour (c) et (e). *Le tout* : 3,13 G gardées,
36 680 816 parties, 4 627 800 040 positions.

0. **le dépôt, les données anciennes, la place** :
   ```sh
   cd ~/chess && git status
   git fetch origin && git switch main && git pull --ff-only
   git log -1 --format='%h %cd'
   ls ~/nnue-n18/*/*.vf | wc -l; df -h ~
   ```
   — **316** fichiers anciens ; **14 Go libres au moins** : ~10 Go de
   données neuves, plus les points de sauvegarde ;
1. **les données neuves — 94 archives, 9,25 Go, avant le 16 janv. 2027**
   (les artefacts de la vague 1 expirent les premiers) ; le job tenu à
   l'écart, 39050360980, ne descend pas. La boucle du n° 18, reprise là
   où elle s'arrête si on la relance :
   ```sh
   N=~/nnue-n20; mkdir -p $N
   awk -F'\t' '$4=="appris" {print $1}' ~/chess/tools/n20-jobs.tsv |
   while read r; do
     [ -d $N/$r ] && continue
     rm -rf $N/.tmp-$r
     gh run download $r -R theodubus/chess -n nnue-$r -D $N/.tmp-$r \
       && mv $N/.tmp-$r $N/$r || { echo "ÉCHEC sur $r"; break; }
   done
   ls $N/*/*.vf | wc -l; du -sh $N
   ```
   — **376** fichiers `.vf`, quatre par job. Sans `gh` : la boucle par
   l'API du n° 18, le TSV portant l'identifiant de chaque artefact ;
2. **les deux listes** — le tenu à l'écart n'y est jamais :
   ```sh
   A=~/nnue-n18; N=~/nnue-n20
   ANCIENNES=$(awk -F'\t' -v d=$A '$4=="appris" {print d"/"$1}' ~/chess/tools/n18-jobs.tsv)
   NEUVES=$(awk -F'\t' '$4=="appris" {print $1}' ~/chess/tools/n20-jobs.tsv | sort -n | head -84 | sed "s|^|$N/|")
   echo $ANCIENNES | wc -w; echo $NEUVES | wc -w
   ```
   — **79 et 84** ;
3. **CUDA dans ce terminal** — le bloc de la séance du n° 7, tel quel ;
4. **les superlots**, que le verdict de A fixe : `SL=200` ou `SL=400` ;
5. **un essai court, puis les deux réseaux d'une traite** — l'essai relit
   chaque octet des 84 jobs neufs et refuse au moindre écart de compte :
   ```sh
   set -o pipefail
   cd ~/chess/tools/nnue-train &&
   cargo run --release --features cuda -- --attendu 18245052:2299253673 --superlots 1 \
     --sortie essai-n8 $NEUVES 2>&1 | tee essai-n8.sortie.txt &&
   cargo run --release --features cuda -- --attendu 18245052:2299253673 --superlots $SL \
     --sortie n8n $NEUVES 2>&1 | tee n8n.sortie.txt &&
   cargo run --release --features cuda -- --attendu 36680816:4627800040 --superlots $SL \
     --sortie n8t $ANCIENNES $NEUVES 2>&1 | tee n8t.sortie.txt
   echo "FIN : $?"
   ```
   → `RÉSEAU PRÊT :` `essai-n8/…-1`, `n8n/shallowred-768x4hm-256-s8-$SL`,
   `n8t/…-$SL`, chacun suivi de `/quantised.bin`, et **`FIN : 0`**. Un
   écart de compte dit une archive incomplète : supprimer son dossier et
   relancer l'étape 1. *Durée* — à 23,7 s par superlot (N6r4) : **~1 h 20
   par réseau à 200, ~2 h 40 à 400**, plus une relecture par réseau, celle
   de N8t deux fois plus longue ;
6. **rapporter**, sur `reseau/n20b` :
   ```sh
   cd ~/chess && git switch -c reseau/n20b
   for n in n8n n8t; do
     d=tools/nnue-train/$n/shallowred-768x4hm-256-s8-$SL
     cp $d/quantised.bin reseaux/$n-768x4hm-256-s8-$SL.bin
     cp $d/log.txt reseaux/$n-768x4hm-256-s8-$SL.log.txt
     cp tools/nnue-train/$n.sortie.txt reseaux/$n-768x4hm-256-s8-$SL.sortie.txt
   done
   cp tools/nnue-train/essai-n8.sortie.txt reseaux/
   git add reseaux/n8* reseaux/essai-n8.sortie.txt
   git commit -m "Réseaux NNUE du n° 20, étape B : N8n (les neuves) et N8t (les deux)"
   git push -u origin reseau/n20b
   git switch main
   ```
   — **Garder `~/nnue-n20`** : (b), (c) et (e) en repartiront.

*Ce qui suit, écrit avant* : pour chacun, la confrontation recopiée, le
candidat révoqué aussitôt, la sonde de B8, ses nœuds par seconde ; la
perte tenue à l'écart sur les DEUX jobs tenus à l'écart, 38531414161
(étiqueté par N5l) et 39050360980 (par N6r4) ; puis **12 jobs de 2 800
parties à `8+0,08`** — N8n contre l'ancienne seule (l'étiqueteur), N8t
contre l'ancienne seule (la décision), N8t contre N8n (la pente). Attendus
et critère : ceux écrits plus haut. **(b), Leela mêlé à nos données**,
s'ajoutera à cette séance une fois (a) jugé — vers 17 h 35 : sa part,
seule chose qui reste à décider, se lit mieux après le verdict du réglage
fin ; elle se compare à N8t, mêmes données et mêmes superlots. *Un script
d'une traite*, comme `tools/seance-n20.sh`, s'écrira quand la séance se
demandera, `SL` alors connu.

**Ce qui vient après, noté sans être décidé** : 384 ou 512 unités sur les
3,1 G — la largeur a payé au n° 17, et elle demande du volume ; le réglage
du n° 19, qui attendait le réseau du n° 18.

**Leela, à rouvrir ? — question de Théo le 19 oct., ce que le dépôt en dit
déjà.** Le seul verdict contre l'étage de Leela (N4 contre N4L, −5,43 ±
4,23) porte sur une recette précise, et elle n'est pas celle d'un réglage
fin :
- **un seul fichier** — `training_data.binpack`, T60 et T74 de 2021
  convertis, 14,4 Go, 58,9 % des positions gardées par le filtre ; son
  compte de positions n'a pas été relevé : **~3,4 à 5,1 G gardées** par
  le format (~2 octets par position), <span>inférence, confiance
  moyenne</span>. 40 superlots, 4 G positions vues : **environ une
  passe**. Le corpus de Leela est bien plus grand — les seuls fichiers des
  derniers étages de Stockfish pèsent 141 et 223 Go ;
- **`--depuis` ne règle pas finement, il ré-entraîne** — lu au code de
  `tools/nnue-train` : les poids repris, le pas repart à 0,001 et décroît
  en cosinus sur tous les superlots, comme depuis zéro. Mesuré : N2L et
  L0 finissent à la même perte sur Leela (0,05815 et 0,05821), N4L et N2L
  aussi (0,0581 et 0,0582) — **l'étage remplaçait son point de départ plus
  qu'il ne l'affinait** ;
- **sur un réseau de 128 unités sans seaux**, et contre des données à nous
  dont l'étiqueteur a gagné depuis.

**Jamais mesuré** : un vrai réglage fin — pas réduit, quelques superlots —
depuis le réseau qui joue ; Leela **mêlé** à nos données, l'issue que le
verdict de N4 nommait (`tools/nnue-train` refuse aujourd'hui les deux
formats ensemble) ; les seaux de roi, gourmands de volume, nourris de ces
~4 G. Et un angle voisin : la cible pèse le RÉSULTAT à 0,75 (`wdl`), un
défaut repris de l'exemple de bullet en septembre, jamais mesuré ici.

**DÉCIDÉ par Théo le 19 oct. — les quatre se testent, puis un cinquième** : « *Ok, on
testera tout a, b, c et le réglage de la cible d'entraînement (d'une
manière générale tout ce qui peut faire augmenter l'elo vaut le coup
d'être testé)* ». Le fichier de Leela et les points de sauvegarde de
N6r4 — `optimiser_state` compris — sont toujours chez lui. **À faire** :
- **(a) un vrai réglage fin sur Leela** — depuis le point de sauvegarde
  de N6r4, au pas réduit, quelques superlots, sur le binpack seul ;
  mesuré contre N6r4. L'option `--pas` de `tools/nnue-train` est écrite
  (19 oct.). Se
  fait avec la séance A, à la demande de Théo — il redemandera le
  protocole ;
- **(b) Leela mêlé à nos données** — l'architecture W depuis zéro, nos
  données et le binpack dans le même entraînement ; mesuré contre le
  réseau de nos données seules au même volume et aux mêmes superlots.
  <s>Demande un outillage neuf : `tools/nnue-train` refuse les deux formats
  ensemble, et leurs échelles diffèrent (330,3 contre 400).</s> L'outillage
  est écrit le 19 oct., `--melange PART` (plus bas). Avec la séance B,
  après le volume ;
- **(c) les architectures gourmandes, nourries du mélange** — sur
  l'architecture W, (b) donne déjà aux seaux de roi le volume de Leela ;
  (c) porte ce volume là où il compte le plus, plus de paramètres : dix
  seaux de roi, 384 ou 512 unités — la largeur a payé au n° 17, les
  seaux de roi au volume du n° 18. Après (b), sur son verdict ;
- **(d) le poids du résultat dans la cible** (`wdl`, 0,75 aujourd'hui) —
  la recette de N6r4 à l'identique (les 1,563 G anciennes, 100
  superlots), au seul `wdl` près, deux valeurs plus basses ; **N6r4 est
  le témoin à 0,75**, sans rien ré-entraîner. L'option `--wdl` est écrite
  (19 oct.) ; lu au source de bullet (`value.rs`, `10e7e82`) : la cible
  vaut `wdl × résultat + (1 − wdl) × sigmoid(score / échelle)`.
  Indépendant du volume : peut se faire avec la séance A.
- **(e) le budget de nœuds de l'étiqueteur** — ajouté par Théo le même
  jour (« *Ok, note le comme (e)* »). 5 000 nœuds par coup est un « choix
  non mesuré » depuis A21 (`nnue_datagen.rs`). Doubler le budget rend de
  meilleures étiquettes — scores plus justes, parties mieux jouées, donc
  résultats moins bruités — et deux fois moins de positions par heure de
  runner. Les deux effets ont un voisin mesuré : doubler les données
  +7,32 ± 3,53 (N6l contre N6m) ; un étiqueteur ~30 Elo plus fort à
  volume égal +5,52 ± 3,97 (N6v) — quand un doublement de nœuds le rend
  bien plus fort (~+108 par doublement de temps à `8+0,08`, non mesuré à
  5 000 nœuds). <span>Inférence, confiance faible</span> : 0 à +20 à
  volume égal, −7 à +13 à temps de runner égal — **le signe n'est pas
  connu**. *Le protocole* : la recette de l'étape B — `cd6ed79`, N6r4 —
  à **10 000 nœuds** (`nnue-datagen.yml` prend déjà `noeuds`, aucun code
  à écrire), **~780 M positions gardées**, ~4 à 5 vagues de seize ; le
  témoin à 5 000 nœuds est GRATUIT, les données de l'étape B, même
  étiqueteur. Deux comparaisons, l'architecture W : **à volume égal**
  (780 M contre 780 M — la qualité de l'étiquette) et **à temps égal**
  (780 M à 10 000 contre 1,56 G à 5 000 — la décision). *Son ordre* :
  **après la génération de l'étape B** — un budget changé en route mêlerait
  deux étiqueteurs dans la moitié neuve, que l'étape B veut d'un seul — et
  **après le verdict de (d)** : la cible ne pèse le score qu'à 25 %, et ce
  que vaut un score plus juste dépend de ce poids.

Les valeurs, les attendus et les critères s'écrivent avec chaque
protocole, avant de le demander.

**`--pas` et `--wdl`, écrites le 19 oct.** — `tools/nnue-train` : le pas
de départ de la décroissance en cosinus (défaut 0,001, refusé hors de
]0 ; 0,01]) et le poids du résultat (défaut 0,75, refusé hors de
[0 ; 1]) ; sans elles, la recette de tous nos réseaux à l'identique. La
recette passe par une fonction, `schedule`, qu'un test lit sans GPU ; et
chaque entraînement l'imprime en tête, pour que sa sortie gardée la dise.
Trois fautes injectées — le poids, le pas lu, le pas transmis figés à leur
défaut —, trois attrapées. **Et une garde voisine l'a vu avant la PR** : `nnue_validation.rs`
confrontait sa perte au TEXTE `ConstantWDL { value: 0.75 }` de
l'entraîneur, que l'option a remplacé — `verify.sh` rouge, comme il le
doit. La garde lit désormais le défaut de `--wdl` et vérifie que le
`ConstantWDL` reçoit l'option ; deux fautes injectées, deux attrapées. Un
réseau entraîné sous un autre `--wdl` se lit à la validation sous 0,75 :
une perte commune à tous, pas celle qu'il a minimisée.

**Les options de la séance C, écrites le 20 oct.** — `tools/nnue-train`,
pour les réglages que le registre (« Les réglages ouverts ») marque
« jamais » : `--pas-final F`, le pas final en fraction du pas de départ
(0,3⁵, refusé hors de ]0 ; 1]) ; `--wdl-final W`, le poids du résultat en
ligne droite de `--wdl` à `W` (`LinearWDL` de bullet) ; `--perte P`,
l'exposant de `|σ(sortie) − cible|` — 2, 2.5 ou 3, bullet ne prenant
qu'une fonction sans capture —, `power_error` de bullet hors de 2 ;
`--lot N`, les positions d'un lot, un diviseur de 16 384 × 6 104 entre
1 024 et 131 072 — **un superlot garde ses positions**, donc un nombre de
superlots reste un nombre de passes ; `--ply-min K`, le premier demi-coup
gardé de nos `.vf` (16, le défaut de `viriformat` ; refusé sur un binpack
ou un mélange, dont le filtre ne le lit pas). **Sans elles, la recette de
tous nos réseaux au bit près**, testé : le pas final calculé comme avant
(`0.002_43` n'est pas le même `f32` que 0,3⁵), le poids constant au bit
près sur chaque superlot — `LinearWDL` à deux bouts égaux, pente nulle —,
16 384 × 6 104, l'écart au carré de l'exemple. Six fautes injectées — les
lots par superlot, le poids final, le pas final, le premier demi-coup,
l'exposant, le lot transmis —, six attrapées ; la garde de
`nnue_validation.rs` lit désormais ces défauts dans le source, trois
fautes injectées, trois attrapées. **La validation reste une mesure
commune** : un réseau entraîné sous un autre exposant, un autre poids ou
un autre premier demi-coup s'y lit sous l'écart au carré, à 0,75, sur les
positions par défaut. *Les valeurs à essayer, leurs attendus et leurs
critères s'écrivent avec le protocole de la séance C, avant de la
demander.*

**`--melange PART`, écrite le 19 oct. — l'outillage de (b).** bullet n'a
pas de chargeur mixte (lu au commit épinglé : un chargeur par format,
`trainer.run` en prend un). `tools/nnue-train` en implémente un,
`MixedReader`, sur le trait `DataReader` de bullet : le chargeur de nos
`.vf` et celui des binpacks tournent chacun dans son fil, chacun mélangeant
déjà son tampon, et leurs positions s'entrelacent **à proportion exacte** —
la `k`-ième vient de Leela tant que Leela en a fourni moins de `PART × k` ;
un lot de 16 384 porte la part à une position près, jamais de longues
séries d'une seule source. **Les scores de Leela sont ramenés à notre
échelle**, `score × 400 / 330,3` arrondi — la même espérance —, et la cible
se lit à 400, une seule sigmoïde. Sans `--melange`, les deux formats
ensemble se refusent toujours ; avec, il les faut tous les deux. La
relecture vérifie les deux — nos comptes par `--attendu`, l'échelle du
binpack par son ajustement. `--memoire` se partage entre les deux
chargeurs ; chaque tranche se copie d'un fil à l'autre, ~1,5 Gio de plus
au défaut. Quatre tests sans GPU, dont le chargeur de binpacks de bullet
lui-même lu à travers le mélange ; **six fautes injectées, six
attrapées** — l'échelle oubliée, la part décalée d'une position, la
sigmoïde du mélange, un mélange sans `--melange`, les bornes de la part,
la troncature au lieu de l'arrondi. *Ce qui reste à décider avec le
protocole* : la part. Le compte des positions que le filtre garde dans le
binpack n'a jamais été relevé — la relecture n'en décode qu'un
échantillon —, donc une part « au volume » s'écrirait sur une estimation
(~3,4 à 5,1 G contre nos 3,1 G).

#### (e) — le budget de l'étiqueteur : écrit le 20 oct. à 22 h 09, avant de lancer

**Son ordre est tenu.** La génération de l'étape B est close (1 751,9 M
gardées, `tools/n20-jobs.tsv`) ; (d) est relevé : le poids du résultat
paie, N6r4w50 +11,79 ± 3,52. À `wdl` 0,5, le score pèse 50 % de la cible
au lieu de 25 % : un score plus juste y vaut davantage qu'au moment où
(e) a été écrit — l'ordre le servait. Le match direct de (d), w25 contre
w50, ne touche que l'entraînement, pas la génération.

**La recette** : `nnue-datagen.yml` à `cd6ed79` — **l'étiqueteur de
l'étape B, N6r4**, pour que ses données servent de témoin sans rien
regénérer —, `<embedded>`, **10 000 nœuds par coup**, graine « auto », un
fil par processeur logique, 330 minutes, `x86-64-v3`. Le même commit pour
toutes les vagues. Seul le budget change : même moteur, même filtre, même
livre d'ouvertures aléatoires.

**Le volume et la règle de fin, écrits avant** : des vagues de seize ; le
PREMIER job lancé de la vague 1 est tenu à l'écart, désigné avant d'en
voir le compte. La génération s'arrête quand les jobs appris atteignent
**780 M positions gardées** — la moitié de l'ancien volume, le témoin à
volume égal restant ainsi dans l'étape B. La dernière vague se
dimensionne au compte restant, plus 10 % : ce n'est pas un test, rien ne
s'y choisit au vu d'un résultat. On note `J` le nombre de jobs appris.

**Les témoins, gratuits, tirés de l'étape B** — ses jobs appris, dans
l'ordre de lancement (`tools/n20-jobs.tsv`), comme la séance B :
- **à temps égal** — les `J` premiers : autant de jobs de 330 minutes,
  tirés du même parc de runners. *C'est la décision* : ce que rapporte une
  heure de runner à 10 000 nœuds contre à 5 000 ;
- **à volume égal** — les premiers jusqu'à atteindre le volume gardé des
  `J` jobs à 10 000, à un job près (~2 %). *C'est la qualité de
  l'étiquette*, à quantité égale.

**L'entraînement** : trois réseaux sur la carte de Théo, en séance C —
**E10** (10 000 nœuds, `J` jobs), **E5t** (5 000, temps égal), **E5v**
(5 000, volume égal) —, l'architecture et la recette que la séance B
fixe, **les mêmes pour les trois**, superlots compris. Le nombre de
superlots s'écrit avec le protocole de la séance C : à 780 M, 400
superlots font ~51 passes, au-delà de ce que le n° 20 a éprouvé (25,6) ;
la perte tenue à l'écart de chacun le dira.

**Les comparaisons**, quatre jobs de 2 800 parties à `8+0,08` chacune, le
binaire AVX2 des deux côtés. *Attendus, écrits le 19 oct. à `wdl` 0,75* —
<span>inférence, confiance faible</span> — : **E10 contre E5v, 0 à +20** ;
**E10 contre E5t, −7 à +13**, le signe inconnu. À `wdl` 0,5, le haut de
chaque fourchette devient plus plausible ; les fourchettes restent.

**Le critère, écrit avant** — la règle du n° 13 : le budget en place ne
cède qu'à une démonstration.
- **10 000 remplace 5 000 pour la génération suivante** (« plus de
  données encore ») **si E10 contre E5t a sa borne basse au-dessus de
  zéro** ; sinon 5 000 reste.
- E10 contre E5v ne décide rien : il dit si l'étiquette vaut mieux, ce
  qui sépare « le budget ne paie pas » de « il paie, mais moins que le
  volume qu'il coûte ».
- *Le registre* : si 10 000 démontre, **20 000** devient le test suivant
  — on double tant qu'un doublement paie ; si E10 régresse, démontré, à
  temps égal, **2 500** y entre ; sinon le budget reste ouvert, à basse
  priorité. Rien n'y passe à « résolu ».

**D'abord une sonde de 20 minutes**, le budget ayant changé. *Attendus,
écrits avant* — <span>inférence, confiance faible</span>, contre la sonde
de N6r4 à 5 000 nœuds (1 183 positions par seconde sur un EPYC 7763 ;
19,69 % d'écartées sur les gardées ; 34,00 % de nulles ; 125,7 positions
par partie) :
- **positions par seconde : × 0,45 à × 0,56**, sur le même processeur —
  deux fois les nœuds par coup, la table vidée par partie et non par coup ;
  sur un autre processeur, contre le débit de l'étape B sur celui-ci
  (2 140 et 2 231 sur deux EPYC 9V45, vague 1) ;
- **parties écartées, sur les gardées : 17 à 23 %** — le filtre lit le
  score de la première position, et une recherche deux fois plus longue
  peut l'écarter de zéro comme l'y ramener ;
- **nulles : 34 à 40 %** — un étiqueteur plus fort en fait davantage ;
- **positions par partie : 120 à 140.**

Hors fourchette, on diagnostique avant la vague. **Le compte, si
l'attendu tient** : ~9 M gardées par job en moyenne, **~85 jobs appris,
~5 à 6 vagues, ~1,5 jour** — les matchs de la séance B passent dans la
même limite de concurrence (40 en Pro).

**La sonde, RELEVÉE le 20 oct. à 22 h 38 — les quatre chiffres dans leur
attendu, les nulles au bord.** Run 39490138743, 20 minutes sur un EPYC
7763, quatre fils, `x86-64-v3`, `cd6ed79`, 10 000 nœuds ; `parties` ne
compte que les gardées :

| | 10 000 nœuds | 5 000 nœuds, la sonde de N6r4 | attendu, écrit avant |
|---|---|---|---|
| positions par seconde | **581** | 1 183 | × 0,45 à × 0,56 — **× 0,491, dedans** |
| parties écartées, sur les gardées | **19,46 %** (1 021 sur 5 246) | 19,69 % | 17 à 23 % — dedans |
| nulles | **39,97 %** (2 097) | 34,00 % | 34 à 40 % — dedans, **au bord** |
| positions par partie | **133,0** | 125,7 | 120 à 140 — dedans |

69,7 % des positions gardées par le filtre (68,1 %). **Six points de
nulles de plus** : un étiqueteur deux fois plus long joue des parties
plus justes, et la moitié « résultat » de la cible y porte plus de
nulles — c'est précisément l'un des effets que (e) mesure, pas un
défaut. Le filtre d'ouverture ne bouge pas. **Le compte** : ~405
positions gardées par seconde sur un 7763, ~8,0 M par job de 330 minutes
sur ce processeur ; au mélange de runners de l'étape B (× 1,16 sur le
7763), **~9,3 M par job, ~84 jobs appris pour 780 M, plus le tenu à
l'écart : six vagues, la dernière dimensionnée au reste**.

**La vague 1 — écrite avant de la lancer.** Seize jobs de 330 minutes,
la recette ci-dessus ; **le premier lancé est tenu à l'écart**. *Attendus*
— l'étape B, vague par vague, rapportée par la sonde (× 0,491 en
positions, × 0,501 en gardées) : **les seize, 175 à 260 M positions, 120 à
180 M gardées** — à proportion s'il manque des jobs ; **écartées 18,5 à
20,5 %, nulles 39,0 à 41,0 %**, sur les parties gardées ; **565 à 600
positions par seconde sur un EPYC 7763** — les vagues de l'étape B
tenaient leur sonde à 1 % près.

**La vague 1, RELEVÉE le 21 oct. à 4 h 48 — quatre chiffres sur cinq dans
l'attendu ; les nulles 0,42 point dessous, et la faute est dans
l'attendu.** Seize succès, finis entre 4 h 09 et 4 h 10, chaque résumé
nommant `cd6ed79` et `noeuds_par_coup=10000` ; `tools/n20e-jobs.tsv`, qui
porte job par job ce que `tools/n20-jobs.tsv` porte pour l'étape B :

| | vague 1 | attendu, écrit avant |
|---|---|---|
| positions | **215,2 M** | 175 à 260 M — dedans |
| gardées par le filtre | **150,2 M** (142,5 M aux quinze appris) | 120 à 180 M — dedans |
| parties écartées, sur les gardées | **19,42 %** (315 271 sur 1 623 441) | 18,5 à 20,5 % — dedans |
| nulles, sur les gardées | **38,58 %** | 39,0 à 41,0 % — **dessous, de 0,42** |
| positions par seconde, EPYC 7763 | **570 à 598**, six jobs | 565 à 600 — dedans |

- **Les nulles : la fourchette était plus étroite que la sonde.** La
  sonde jouait 5 246 parties : 39,97 % ± 1,33 à 95 % ; l'attendu en a
  pris ± 1 point. 38,58 % est à 2,1 écarts-types de la sonde, et la
  vague, 1,6 M de parties, mesure le taux à ± 0,08. *Faute de méthode,
  nommée* : un attendu dérivé d'un échantillon porte au moins
  l'incertitude de cet échantillon. Le mécanisme n'est pas en cause — à
  nœuds fixés, le processeur ne change pas les parties ; les nulles
  montent bien, **+4,3 points** sur l'étape B (34,29 %), l'effet que (e)
  mesure ;
- **132,5 positions par partie** (133,0 à la sonde) ; 69,8 % des positions
  gardées par le filtre ;
- **le débit, par processeur** : EPYC 7763 570 à 598 (moyenne 585) ;
  EPYC 9V45 979 et 1 052 ; Xeon Platinum 8573C 685 ; Xeon Platinum 8370C
  558, sur le job tenu à l'écart ; **EPYC 9V74 bimodal** — 594, 598, 605
  sur trois runners, 751, 764, 770 sur trois autres, le même modèle à
  × 1,28. <span>Inférence, confiance faible</span> : deux générations
  d'hôte sous un même nom ; à nœuds fixés, le débit ne change que le
  volume, jamais les parties ;
- **le compte** : 142,5 M gardées aux quinze jobs appris, **9,5 M par
  job** — 780 M en demandent encore **637,5 M, ~67 jobs** : trois vagues
  pleines, puis une dernière dimensionnée au reste plus 10 %.

**La vague 2 — écrite avant de la lancer.** Seize jobs, tous appris, la
même recette (`cd6ed79`, 10 000 nœuds, 330 minutes). *Attendus* — la
vague 1, à l'incertitude de ce qui varie d'une vague à l'autre, le parc
de runners : **175 à 260 M positions, 120 à 180 M gardées** ; **écartées
18,9 à 20,0 %, nulles 38,0 à 39,2 %** — les vagues de l'étape B ne
s'écartaient de leur moyenne que de quelques dixièmes ; **565 à 605
positions par seconde sur un EPYC 7763** ; **le cumul appris, 262 à
322 M gardées**.

**La vague 2, RELEVÉE le 21 oct. à 10 h 39 — les six chiffres dans leur
attendu.** Seize succès, finis entre 10 h 20 et 10 h 21, chaque résumé
nommant `cd6ed79` et `noeuds_par_coup=10000` ; `tools/n20e-jobs.tsv`, la
vague 2 :

| | vague 2 | vague 1 | attendu, écrit avant |
|---|---|---|---|
| positions | **237,8 M** | 215,2 M | 175 à 260 M — dedans |
| gardées par le filtre | **165,9 M**, tous appris | 150,2 M | 120 à 180 M — dedans |
| parties écartées, sur les gardées | **19,45 %** (349 325 sur 1 795 949) | 19,42 % | 18,9 à 20,0 % — dedans |
| nulles, sur les gardées | **38,50 %** | 38,58 % | 38,0 à 39,2 % — dedans |
| positions par seconde, EPYC 7763 | **584 à 590**, cinq jobs | 570 à 598 | 565 à 605 — dedans |
| cumul appris | **308,4 M** | 142,5 M | 262 à 322 M — dedans |

- **Deux vagues, le même taux à un dixième près** : écartées 19,42 puis
  19,45 %, nulles 38,58 puis 38,50 % ; 132,4 positions par partie, 69,8 %
  gardées par le filtre. À nœuds fixés, le parc de runners ne change que
  le volume ;
- **le volume monte de 10 %** par le parc seul : quatre EPYC 9V45 (973 à
  1 060 positions par seconde) au lieu de deux ; **10,4 M gardées par
  job**, 9,5 à la vague 1 ;
- **un second processeur à deux régimes** : le Xeon Platinum 8573C rend
  579, quand la vague 1 en montrait un à 685 — × 1,18 sous le même nom ;
  l'EPYC 9V74 garde les siens, 616 sur un runner, 756 à 778 sur cinq.
  <span>Inférence, confiance faible</span>, la même qu'à la vague 1 : des
  hôtes différents sous un même nom ;
- **le compte** : 308,4 M gardées aux 31 jobs appris, 9,95 M par job en
  moyenne ; 780 M en demandent encore **471,6 M, ~47 jobs** — les vagues 3
  et 4 pleines, la cinquième dimensionnée au reste plus 10 %.

**La vague 3 — écrite avant de la lancer.** Seize jobs, tous appris, la
même recette (`cd6ed79`, 10 000 nœuds, 330 minutes). *Attendus* — les deux
vagues, au parc de runners près : **175 à 260 M positions, 120 à 180 M
gardées** ; **écartées 18,9 à 20,0 %, nulles 38,0 à 39,2 %** ; **565 à 605
positions par seconde sur un EPYC 7763** ; **le cumul appris, 428 à
488 M gardées**.

**La vague 3, RELEVÉE le 21 oct. à 16 h 39 — les six chiffres dans leur
attendu.** Seize succès, finis entre 16 h 14 et 16 h 15, chaque résumé
nommant `cd6ed79` et `noeuds_par_coup=10000` ; `tools/n20e-jobs.tsv`, la
vague 3 :

| | vague 3 | vague 2 | attendu, écrit avant |
|---|---|---|---|
| positions | **233,1 M** | 237,8 M | 175 à 260 M — dedans |
| gardées par le filtre | **162,7 M**, tous appris | 165,9 M | 120 à 180 M — dedans |
| parties écartées, sur les gardées | **19,44 %** (341 773 sur 1 757 967) | 19,45 % | 18,9 à 20,0 % — dedans |
| nulles, sur les gardées | **38,56 %** | 38,50 % | 38,0 à 39,2 % — dedans |
| positions par seconde, EPYC 7763 | **575 à 595**, six jobs | 584 à 590 | 565 à 605 — dedans |
| cumul appris | **471,2 M** | 308,4 M | 428 à 488 M — dedans |

- **Trois vagues, le même taux à un dixième près** : écartées 19,42,
  19,45 puis 19,44 % ; nulles 38,58, 38,50 puis 38,56 % ; 132,6 positions
  par partie, 69,8 % gardées par le filtre ;
- **le parc** : cinq EPYC 9V45 (1 010 à 1 071) — 10,2 M gardées par job,
  10,4 à la vague 2 ; **les deux processeurs à deux régimes le restent** :
  EPYC 9V74 605 puis 762, Xeon Platinum 8573C 594 puis 633 — ce dernier
  rend désormais 579, 594, 633 et 685 sur quatre runners, un étalement
  plutôt que deux modes. <span>Inférence, confiance faible</span>, la même ;
  Xeon Platinum 8370C 525, 558 à la vague 1 ;
- **le compte** : 471,2 M gardées aux 47 jobs appris, 10,0 M par job ;
  780 M en demandent encore **308,8 M, ~31 jobs** — la vague 4 pleine,
  la cinquième redimensionnée au reste plus 10 % à son relevé : seize
  encore, au débit d'aujourd'hui.

**La vague 4 — écrite avant de la lancer.** Seize jobs, tous appris, la
même recette (`cd6ed79`, 10 000 nœuds, 330 minutes). *Attendus* — les
trois vagues, au parc de runners près : **175 à 260 M positions, 120 à
180 M gardées** ; **écartées 18,9 à 20,0 %, nulles 38,0 à 39,2 %** ;
**565 à 605 positions par seconde sur un EPYC 7763** ; **le cumul appris,
591 à 651 M gardées**.

**La vague 4, RELEVÉE le 21 oct. à 22 h 27 — les six chiffres dans leur
attendu.** Seize succès, finis entre 22 h 15 et 22 h 16, chaque résumé
nommant `cd6ed79` et `noeuds_par_coup=10000` ; `tools/n20e-jobs.tsv`, la
vague 4 :

| | vague 4 | vague 3 | attendu, écrit avant |
|---|---|---|---|
| positions | **223,8 M** | 233,1 M | 175 à 260 M — dedans |
| gardées par le filtre | **156,2 M**, tous appris | 162,7 M | 120 à 180 M — dedans |
| parties écartées, sur les gardées | **19,46 %** (328 605 sur 1 688 996) | 19,44 % | 18,9 à 20,0 % — dedans |
| nulles, sur les gardées | **38,54 %** | 38,56 % | 38,0 à 39,2 % — dedans |
| positions par seconde, EPYC 7763 | **573 à 597**, onze jobs | 575 à 595 | 565 à 605 — dedans |
| cumul appris | **627,4 M** | 471,2 M | 591 à 651 M — dedans |

- **Quatre vagues, le même taux à un dixième près** : écartées 19,42 à
  19,46 %, nulles 38,50 à 38,58 % ; 132,5 positions par partie, 69,8 %
  gardées par le filtre ;
- **le parc** : onze EPYC 7763, quatre EPYC 9V45 (1 011 à 1 054), un
  EPYC 9V74 à 774 — son régime haut ; 9,8 M gardées par job ;
- **le compte** : 627,4 M aux 63 jobs appris, 9,96 M par job ; **780 M en
  demandent encore 152,6 M** — plus 10 %, 167,9 M : **dix-sept jobs**.

**La vague 5 — écrite avant de la lancer, la dernière.** Dix-sept jobs,
tous appris, la même recette (`cd6ed79`, 10 000 nœuds, 330 minutes) —
dimensionnée au reste plus 10 %, comme écrit à la vague 1. *Attendus* —
les quatre vagues, à dix-sept jobs : **186 à 276 M positions, 128 à 191 M
gardées** ; **écartées 18,9 à 20,0 %, nulles 38,0 à 39,2 %** ; **565 à 605
positions par seconde sur un EPYC 7763** ; **le cumul appris, 755 à 818 M
gardées — 780 M atteints au centre**. S'il en manque au relevé, l'écart se
nomme et la séance C prend ce qu'il y a : quelques pour cent de volume ne
changent pas la question de (e), posée à volume égal par E5v.

**La vague 5, RELEVÉE le 22 oct. à 4 h 27 — les six chiffres dans leur
attendu.** Dix-sept succès, finis entre 4 h 02 et 4 h 03, chaque résumé
nommant `cd6ed79` et `noeuds_par_coup=10000` ; `tools/n20e-jobs.tsv`, la
vague 5 :

| | vague 5 | vague 4 | attendu, écrit avant |
|---|---|---|---|
| positions | **249,2 M** | 223,8 M | 186 à 276 M — dedans |
| gardées par le filtre | **174,0 M**, tous appris | 156,2 M | 128 à 191 M — dedans |
| parties écartées, sur les gardées | **19,46 %** (365 744 sur 1 879 488) | 19,46 % | 18,9 à 20,0 % — dedans |
| nulles, sur les gardées | **38,51 %** | 38,54 % | 38,0 à 39,2 % — dedans |
| positions par seconde, EPYC 7763 | **569 à 597**, six jobs | 573 à 597 | 565 à 605 — dedans |
| cumul appris | **801,4 M** | 627,4 M | 755 à 818 M, 780 au centre — dedans |

**(e) — la génération CLOSE, le 22 oct. à 4 h 27.** Cinq vagues, 81 jobs —
80 appris, un tenu à l'écart (39493777327) — : **1 148,0 M positions,
801,4 M gardées aux jobs appris** ; écartées 19,42 à 19,46 %, nulles 38,50
à 38,58 %, 132,5 positions par partie, d'une vague à l'autre. Les
ensembles de la séance C1, comptés sur les registres et relus à l'octet
par l'entraîneur (`--attendu parties:positions`) :
- **E10** — les 80 jobs appris de (e) : 8 662 540 : 1 148 044 133,
  801,4 M gardées ;
- **E5v** — les **44** premiers jobs appris de l'étape B
  (`tools/n20-jobs.tsv`, dans l'ordre de lancement) : 9 402 946 :
  1 185 033 571, 809,7 M gardées — à un job près, +1,0 % ;
- **E5t** — les 80 premiers : 1 483,8 M gardées ; **N8nw50 en tient
  lieu** (84 jobs, 1 571,1 M, déjà entraîné à la même recette) — la
  section « La séance C1 » dit pourquoi et ce que cela biaise.

#### La séance C1 — écrite le 22 oct. à 4 h 34, avant de la demander

**Ce qu'elle tranche : les données de la recette.** Trois réseaux neufs à
l'architecture et à la recette de N8tw50s800 — 256 unités, quatre seaux de
roi, huit de sortie, poids du résultat 0,5, pas 0,001 —, sur la carte de
Théo, d'une traite, par `tools/seance-n20c.sh` (`essai`, puis `tout`),
**~10 h 35** ; chacun commité et poussé sur `reseau/n20c` dès qu'il passe
ses contrôles, le plus probable à embarquer d'abord :

| réseau | données | gardées | superlots | passes | carte |
|---|---|---|---|---|---|
| **N9w50s800** | toutes celles de N6r4 : les 94 jobs appris de l'étape B et les 80 de (e) | 2 553,3 M | 800 | 31,3 | ~5 h 15 |
| **E10w50** | les 80 jobs appris de (e), 10 000 nœuds | 801,4 M | 400 | 49,9 | ~2 h 40 |
| **E5vw50** | les 44 premiers jobs appris de l'étape B, 5 000 nœuds | 809,7 M | 400 | 49,4 | ~2 h 40 |
| E5t := **N8nw50** | les 84 premiers de l'étape B — déjà entraîné, `6a1b1d6` | 1 571,1 M | 400 | 25,5 | — |

Les comptes `parties:positions` que l'entraîneur relit à l'octet sont
sommés sur les registres (`tools/n20-jobs.tsv`, `tools/n20e-jobs.tsv`) et
écrits dans le script ; les données de N5l n'y sont plus (+0,25 ± 4,71 à
passes égales, plus haut). *Éprouvé dans un bac à sable* — faux `cargo`,
faux `gh`, dépôt distant local : l'essai ; la séance entière avec une
panne simulée sur E10, puis la relance, qui reprend E10 seul et le
pousse ; une troisième qui ne refait rien ; les trois réseaux sur
`reseau/n20c`, 174, 80 et 44 dossiers, 800 et 400 superlots, `wdl` 0,5 ;
un téléchargement interrompu au 40ᵉ job de (e), puis repris ; `gh`
déconnecté, arrêt avant tout lancement ; un mode inconnu refusé.

**N9w50s800 — intégré le 22 oct. à 18 h 03, en match.** Poussé à la main
sur `reseau/n20c` (`d5365e8`) après le faux refus du contrôle, plus bas.
Sa sortie relue : **800 superlots, pas 0,001 → 2,43·10⁻⁶, poids du
résultat 0,5 → 0,5** — la recette de N8tw50s800, perte, lot et ply minimal
à leurs défauts ; **29 009 129 parties et 3 712 073 002 positions relues à
l'octet** (l'attendu du script) ; **confrontation 7 / 22** (admis 15 / 50) ;
311 minutes de carte. Le réseau dans `reseaux/` (`31b902f`), le candidat
**`db1eed9`** révoqué aussitôt (`33b25cc`), au code de `main` au bit près
(`git diff c9b5a0d db1eed9 -- engine/` : le seul `nnue.rs` du réseau) et au
facteur 2,85. **Quatre jobs contre N8tw50s800 (`c9b5a0d`) lancés à 18 h 03**
— l'attendu et le critère, plus haut : +3 à +13, borne basse au-dessus de
zéro → embarqué, sa sonde dans la plage.

**N9w50s800, les mesures hors match — écrites le 22 oct. à 18 h 04, avant de
les lancer.** *Attendus* — <span>inférence, confiance faible</span> :
- **la sonde de B8 : 2,3 à 3,3**, dans 2,14 à 3,56 — la même architecture
  et la même recette que N8tw50s800 (2,85), N8nw50 (2,53) ; aucun sens
  attendu ;
- **les nœuds par seconde : × 0,97 à × 1,04 contre N8tw50s800** — même
  architecture, même code ; seuls les poids et donc l'arbre bougent ;
- **la perte tenue à l'écart contre N8tw50s800** (`nnue-validation.yml`) :
  sur le job tenu de l'étape B (39050360980, N6r4 à 5 000 nœuds),
  **−0,0002 à −0,0010** — deux fois plus de positions de N6r4, aucune de
  N5l ; N8nw50 rendait −0,00075 contre N7p4w50 ; sur celui de (e)
  (39493777327, N6r4 à 10 000), **−0,0003 à −0,0015** — il en a appris
  un tiers de ses données ; sur celui du n° 18 (38531414161, N5l), **0 à
  +0,0008** — il n'en a rien vu. N8nw50 mesuré à côté, pour E5t. Un
  diagnostic : la perte suit l'étiqueteur, le match décide.

**La perte tenue à l'écart de N9w50s800, RELEVÉE le 22 oct. à 18 h 10 — les
trois dans l'attendu, les deux de N6r4 au bord bas.** Run 39810867177,
l'outil à `ed8c2a9`, N8tw50s800 en référence :

| job tenu à l'écart | N9w50s800 | N8nw50, à côté | attendu, écrit avant |
|---|---|---|---|
| étape B (39050360980), N6r4 à 5 000 nœuds | **−0,000215 ± 0,000020** | −0,000152 | −0,0002 à −0,0010 — dedans, au bord |
| (e) (39493777327), N6r4 à 10 000 nœuds | **−0,000348 ± 0,000028** | −0,000212 | −0,0003 à −0,0015 — dedans, au bord |
| n° 18 (38531414161), N5l | **+0,000650 ± 0,000040** | +0,000723 | 0 à +0,0008 — dedans |

- **Il apprend son étiqueteur** : meilleur que N8tw50s800 sur les deux
  jeux de N6r4, davantage sur celui de (e), dont il a appris le tiers de
  ses données ; moins bon sur celui de N5l, qu'il n'a pas vu — l'ordre
  attendu, plus serré qu'attendu ;
- **devant N8nw50 partout sur N6r4**, de 0,00006 et 0,00014 : × 1,62 de
  données de N6r4. Un diagnostic : le match décide.

**La sonde de B8 de N9w50s800, RELEVÉE le 22 oct. à 18 h 37 — lue contre
N8tw50s800, faute de sa référence d'origine ; il ne demande pas plus
d'échelle que lui.** Le conteneur de la session a été remplacé dans
l'après-midi : les journaux de la faite main du 12 oct., référence de toutes
les sondes depuis, sont perdus avec lui — ils vivaient dans le carnet de
travail, hors du dépôt. Rejouée ici (40 parties du binaire sondé contre
lui-même à `8+0,08`, `-srand 20260930`, table de 16 Mio), la faite main ne
rend pas les mêmes taux — **0,10 % d'élagages delta fautifs au lieu de
0,40 %, 5,4 % d'itérations hors de la première fenêtre au lieu de 4,1 %** :
les facteurs absolus ne se comparent plus à ceux d'avant. **Le même
protocole sur N8tw50s800, le réseau qui joue à 2,85, donne l'étalon** —
N9w50s800 et lui, mêmes conditions, même faite main :

| | N9w50s800 | N8tw50s800 |
|---|---|---|
| élagage delta fautif à × 2,0 / × 2,5 / × 3,0 | **3,54 / 1,63 / 0,74 %** | 4,39 / 1,73 / 0,83 % |
| itérations hors fenêtre à δ = 25 / 50 / 100 | **13,7 / 8,5 / 4,2 %** | 16,7 / 10,7 / 5,8 % |
| δ qui égalise la faite main | **80 (× 3,20)** | 110 (× 4,40) |

- **À chaque marge, N9w50s800 se trompe autant ou moins que N8tw50s800** :
  il ne porte pas des nombres plus grands, il joue au facteur de `main`,
  2,85, comme lui — le match est valide tel que lancé. <span>Inférence,
  confiance moyenne</span> : la lecture relative remplace la règle des
  bornes (2,14 à 3,56), qui supposait la faite main d'origine ;
- **l'élagage delta ne s'égalise plus** sur cette faite main : à 0,10 %, la
  cible tombe dans le bruit des grands facteurs, où quelques élagages
  décident (N8tw50s800 × 5,0, N9w50s800 aucun jusqu'à × 6) ;
- **à retenir** : une sonde se lit désormais contre le réseau qui joue, dans
  les mêmes conditions ; la référence d'une mesure se garde dans le dépôt
  ou un artefact, jamais dans le carnet de travail d'une session. **Fait** :
  les journaux de la faite main de ce jour, ceux qu'a lus cette sonde, sont
  dans `tools/references/sonde-b8-faite-main-2026-10-22.tgz` (1 Mo) — à
  extraire et à passer comme troisième argument de `facteurs.py` ; la
  sonde suivante n'a plus qu'à mesurer le candidat et le réseau qui joue.

**Les nœuds par seconde de N9w50s800, RELEVÉS le 22 oct. à 18 h 45 — × 0,962
contre N8tw50s800, 0,008 sous la fourchette au point, rien de séparé.**
Le rejeu du n° 15 (`rejeu.py`, extrait de `n15-sonde-inference.patch`),
`--nps`, binaires AVX2, profondeur 10, dix tours, sur un corpus neuf — 20
parties de N8tw50s800 contre lui-même à `8+0,08`, 2 551 positions — le
corpus du n° 15 étant perdu avec le conteneur : **× 0,962 (médiane des
tours), plus lent 8 tours sur 10, p = 0,11** ; attendu × 0,97 à × 1,04.
Même architecture, même code : seuls les poids, donc l'arbre, changent —
N8nw50 rendait × 0,966 à côté de N7p4w50, dans le même sens. Le match
compte ce coût avec le reste : ~−6 Elo au point par l'étalon (0,056
doublement), <span>inférence, confiance faible</span>.

**N9w50s800 contre N8tw50s800 — VERDICT, le 22 oct. à 23 h 21 : +5,18 ±
3,29, gain démontré — N9w50s800 EMBARQUÉ.** Quatre jobs finis ENTIERS
entre 23 h 04 et 23 h 19, 6,42 à 6,73 s par partie, zéro perte au temps,
aucun coup illégal, aucun moteur perdu :

| job | Elo | pentanomial |
|---|---|---|
| 39810606104 | +2,11 ± 6,36 | 21, 247, 850, 258, 24 |
| 39810618069 | +2,61 ± 6,58 | 28, 245, 832, 268, 27 |
| 39810630456 | +9,31 ± 6,45 | 23, 214, 861, 269, 33 |
| 39810642687 | +6,70 ± 6,89 | 32, 250, 779, 310, 29 |
| **en commun, 11 200 parties** | **+5,18 ± 3,29** | homogènes, p = 0,404 |

- **Critère, écrit avant** : la borne basse, +1,89, est au-dessus de zéro
  — **N9w50s800 embarqué** ; sa sonde de B8, lue contre N8tw50s800 dans
  les mêmes conditions, ne demande pas plus d'échelle : il joue au facteur
  de `main`, 2,85. Fait à `562e20f` : la révocation `33b25cc` révoquée,
  le `nnue.rs` du candidat `db1eed9` au bit près ;
- **dans l'attendu (+3 à +13, ~+7), sous son centre** — comme N8tw50s800
  (+5,43 pour ~+7). Le match compte le coût de vitesse avec le reste :
  × 0,962 de nœuds par seconde au point, rien de séparé (p = 0,11), ~−6
  par l'étalon ; à vitesse égale, ~+11 au point — <span>inférence,
  confiance faible</span> ;
- **ce qu'il dit des données — trois causes mêlées** : les 1,56 G gardées
  de N5l retirées, 0,98 G de N6r4 ajoutées (dix jobs de l'étape B et les
  80 de (e), à 10 000 nœuds), 31,3 passes au lieu de 25,5. La perte tenue
  à l'écart le plaçait devant N8tw50s800 sur les deux jeux de N6r4 ; les
  matchs E10, E5t et E5v, en vol, séparent le budget et le volume à
  étiquette égale ;
- **ce qui ne change pas** : le code — `git diff c9b5a0d 562e20f --
  engine/` ne porte que le réseau et sa confrontation. Comme à
  l'embarquement de N8tw50s800, pas de crible avant la fusion : le
  balayage après fusion le confirme sur le réseau qui joue, prédiction
  163. **La série C13 portera sur N9w50s800**, son attendu écrit avant
  (section C13) ;
- **le n° 21 garde N8tw50s800 pour étiqueteur jusqu'à la fin de sa
  tranche** : +5 d'étiqueteur vaut ~+0,6 au tour de boucle (0,12 Elo de
  réseau par Elo d'étiqueteur), sous toute mesure, et mêler deux
  étiqueteurs dans la tranche brouillerait sa comparaison à l'étape B, à
  volume égal. La tranche suivante part du réseau qui joue alors.

**Le contrôle du poids refusait un réseau sain — 22 oct., 17 h 52.** N9w50s800
a fini son entraînement à 17 h 07 (code 0, 311 min), puis le script l'a
refusé : « *la recette imprimée n'a pas wdl 0.5* ». Le contrôle cherchait
« , wdl 0.5 » en fin de ligne ; depuis les options de la séance C,
l'entraîneur imprime « wdl 0.5 → 0.5, perte ^2, lot 16384, ply ≥ 0 ». **Le
bac à sable ne l'a pas vu parce que son faux `cargo` imprimait l'ancien
format** — copié de celui de la séance B, écrit avant ces options. *Un
faux qui imite une sortie doit être confronté à la sortie réelle du jour,
pas à celle du jour où il a été écrit.* Corrigé : le contrôle lit « , wdl
0.5 → 0.5, », éprouvé sur la ligne réelle — accepté — et sur un poids ou
un poids final différents — refusés. E10w50 et E5vw50 tomberont sur le
même refus pendant cette séance-ci, qui tourne sur l'ancien script ; leurs
réseaux restent sur le disque. **La reprise** : N9w50s800 publié à la main
par un arbre de travail séparé, sans toucher à la séance en cours ; à la
fin de la séance, `git pull` puis `bash tools/seance-n20c.sh` relance
l'essai, saute les entraînements déjà finis et publie les deux autres.

**Le rangement, depuis le 22 oct.** — Théo : « *on devrait pas mettre tout
dans un dossier dédié au lieu de en vrac à la racine du dossier perso ?* ».
Tout vit sous `~/shallowred/` : `chess/` le dépôt, `donnees/n18`,
`donnees/n20`, `donnees/n20e`, `donnees/leela`, `seances/<nom>` pour les
journaux. `tools/seance-n20c.sh` prend ces chemins par défaut, prend pour
dépôt celui qui le porte, et **refuse de démarrer si l'étape B est restée
à `~/nnue-n20`** — l'oubli ferait retélécharger 9 Go à côté des données
qu'on a ; éprouvé dans les deux sens. Les scripts des séances finies
gardent leurs anciens chemins. Ce qui ne sert plus : `~/nnue-vague2`
(N2, N3), `~/nnue-vague3` (N4, N5) et `~/nnue`, non documenté — la
première vague, fin septembre, <span>de mémoire, confiance moyenne</span>
—, qu'aucun réseau à venir ne lit ; les points de sauvegarde des séances
finies sous `tools/nnue-train/`, leurs réseaux étant tous dans `reseaux/`
sur `main`. `donnees/n18` (N5l) n'ajoute rien à passes égales
(+0,25 ± 4,71) et reste téléchargeable jusqu'à la mi-janvier ;
`donnees/leela` sert encore à (b).

**E10w50 et E5vw50 — intégrés le 22 oct. à 22 h 46.** Publiés par la relance
du script après la séance (`28f32b2`, `859b4aa` sur `reseau/n20c`), tous
contrôles passés. Leurs sorties relues :

| | E10w50 | E5vw50 |
|---|---|---|
| recette | 400 superlots, pas 0,001 → 2,43·10⁻⁶, poids 0,5 → 0,5, ply ≥ 16 | la même |
| relu à l'octet | 8 662 540 parties, 1 148 044 133 positions — 80 jobs de (e) | 9 402 946 parties, 1 185 033 571 positions — 44 jobs de l'étape B |
| confrontation, médian / maximal | **6 / 27** | **7 / 42** (admis 15 / 50) |
| carte | 9 505 s, 2 h 38 | 9 472 s, 2 h 38 |

Les réseaux dans `reseaux/` (`a3159b4`) ; les candidats **`17fd4e3`**
(E10w50) et **`c61d721`** (E5vw50), révoqués aussitôt (`3c61732`,
`14311cc`), au code de `main` au bit près — le seul `nnue.rs` du réseau —
et au facteur 2,85 ; E5t reste `6a1b1d6` (N8nw50). Les matchs 2, 3 et 4,
lancés ensemble — leurs attendus et le critère, plus bas, écrits le 19 et
le 20 oct.

**La perte tenue à l'écart de E10w50 et E5vw50 — écrite avant de la
lancer.** `nnue-validation.yml`, N8tw50s800 en référence comme pour N9,
N8nw50 (E5t) et N9w50s800 à côté, sur les trois jobs tenus à l'écart.
*Attendus* — <span>inférence, confiance faible</span> ; un diagnostic, le
match décide :
- **sur celui de (e)** (39493777327, N6r4 à 10 000 nœuds) : **E10w50 le
  meilleur des cinq, −0,0003 à −0,0012** — il n'a appris que cet
  étiqueteur-là ; N9w50s800 en rendait −0,000348 avec un tiers de ces
  données ;
- **sur celui de l'étape B** (39050360980, N6r4 à 5 000 nœuds) :
  **E5vw50 derrière N8nw50 de 0 à +0,0003** — moitié moins de données,
  deux fois plus de passes ; **E10w50 derrière E5vw50 de 0 à +0,0004** —
  l'étiquette du même réseau à un autre budget ;
- **sur celui du n° 18** (38531414161, N5l) : E10w50 et E5vw50 **+0,0004
  à +0,0012**, comme N8nw50 (+0,000723), qui n'en a rien vu non plus ;
- **le signe du surapprentissage à 50 passes** : E10w50 ou E5vw50 plus
  mauvais que N8tw50s800 de plus de +0,0005 sur le job de son PROPRE
  étiqueteur. Il ne déciderait rien, il expliquerait un E10 battu par E5t
  — le biais écrit plus bas.

**La perte tenue à l'écart de E10w50 et E5vw50, RELEVÉE le 22 oct. à 22 h 55
— quatre lectures sur cinq dans l'attendu, deux au bord ; aucun signe de
surapprentissage à 50 passes.** Run 39851791827, l'outil à `7d0a227`,
N8tw50s800 en référence ; N8nw50 et N9w50s800 rendent au millionième près
ce qu'ils rendaient au run 39810867177 :

| job tenu à l'écart | E10w50 | E5vw50 | N8nw50 (E5t) | N9w50s800 |
|---|---|---|---|---|
| étape B (39050360980), N6r4 à 5 000 | **−0,000064 ± 0,000025** | **−0,000060 ± 0,000020** | −0,000152 | −0,000215 |
| (e) (39493777327), N6r4 à 10 000 | **−0,000337 ± 0,000034** | **−0,000136 ± 0,000028** | −0,000212 | −0,000348 |
| n° 18 (38531414161), N5l | **+0,000884 ± 0,000045** | **+0,000772 ± 0,000040** | +0,000723 | +0,000650 |

- **Sur (e), E10w50 à −0,000337** : dans −0,0003 à −0,0012, au bord bas ;
  **pas « le meilleur des cinq »** — à égalité avec N9w50s800 (−0,000348,
  0,000011 d'écart pour ± 0,00003). Avoir appris le seul étiqueteur du job
  ne rend pas plus que d'en avoir appris un tiers dans 3,2 fois plus de
  données ;
- **sur l'étape B, E5vw50 derrière N8nw50 de +0,000092** : dans 0 à
  +0,0003 — la moitié des mêmes données. **E10w50 et E5vw50 à égalité**
  (−0,000004) : au bord de « derrière de 0 à +0,0004 » — l'étiquette à
  10 000 nœuds ne coûte rien sur les positions étiquetées à 5 000 ;
- **sur le n° 18**, +0,000884 et +0,000772 : dans +0,0004 à +0,0012 ;
- **le surapprentissage à 50 passes** : aucun des deux n'est plus mauvais
  que N8tw50s800 sur le job de son propre étiqueteur — tous deux y sont
  meilleurs. Le biais écrit contre E10, s'il existe, ne se voit pas ici.
  Un diagnostic : les matchs décident.

**Les matchs 2, 3 et 4 — VERDICT, le 26 oct. à 7 h 57 : le budget ne paie pas,
le volume si — 5 000 nœuds restent ; C1 close.** Douze jobs finis ENTIERS
le 23 oct. entre 3 h 45 et 3 h 57, 6,37 à 6,62 s par partie, zéro perte au
temps, aucun coup illégal, aucun moteur perdu ; relevés le 26 : la session
s'est arrêtée trois jours sur la limite hebdomadaire de crédits.

| match | les quatre jobs | en commun, 11 200 parties | homogénéité | attendu, écrit avant |
|---|---|---|---|---|
| 2 — E10w50 contre E5t (N8nw50) : temps de runner et carte égaux | −5,46, −9,06, −7,32, −7,69 | **−7,38 ± 3,40** | p = 0,885 | −7 à +13, ~+3 — **0,38 dessous** |
| 3 — E10w50 contre E5vw50 : volume, passes et carte égaux | +0,74, +1,12, −6,08, −1,74 | **−1,49 ± 3,38** | p = 0,441 | 0 à +20, ~+10 — **dessous** |
| 4 — E5t contre E5vw50 : étiquette égale, × 1,94 de données | +8,81, +7,32, +6,58, +13,03 | **+8,94 ± 3,32** | p = 0,533 | +1 à +13, ~+6 — dedans |

Pentanomiaux, dans l'ordre des jobs — match 2 : 35, 280, 811, 242, 32 ;
43, 278, 814, 239, 26 ; 43, 257, 840, 236, 24 ; 43, 271, 819, 239, 28.
Match 3 : 29, 246, 845, 250, 30 ; 30, 230, 866, 249, 25 ; 35, 293, 790,
250, 32 ; 37, 286, 769, 270, 38. Match 4 : 24, 237, 816, 290, 33 ; 19,
246, 827, 273, 35 ; 23, 232, 844, 271, 30 ; 21, 231, 817, 284, 47.

- **Critère du match 2, écrit avant** : la borne basse, −10,78, n'est pas
  au-dessus de zéro — **5 000 nœuds restent**. La borne haute, −3,98, est
  sous zéro : **E10 régresse, démontré**, et le registre disait la
  suite — **2 500 nœuds au test suivant** (« La file », l'étiqueteur) ;
- **le triangle** : (3) − (2) − (4) = −1,49 + 7,38 − 8,94 = **−3,05**,
  dans ± 5,7 — les trois matchs se tiennent ;
- **ce qu'ils disent** : étiqueter à 10 000 nœuds ne rend rien à volume
  égal (match 3) ; doubler les positions à étiquette égale rend +8,94
  (match 4) ; E10 perd contre E5t ce que coûte la moitié du volume
  (match 2). Le biais écrit contre E10 — ~50 passes — touche E5v autant,
  et le match 3 les compare à passes égales : le budget ne paie pas, quel
  que soit ce biais. La perte tenue à l'écart mettait E10 à égalité avec
  E5v sur l'étape B et devant lui sur (e) : elle suivait l'étiqueteur,
  le match ne voit rien (`CLAUDE.md`, « cette valeur d'évaluation est
  meilleure ») ;
- **les deux attendus manqués ont la même faute** : ils convertissaient
  le budget par « deux fois les nœuds valent un doublement de temps
  pour l'étiqueteur, × 0,12 Elo de réseau par Elo d'étiqueteur » — une
  conversion mesurée en changeant de RÉSEAU étiqueteur (N5l → N6r4,
  +12,76 à volume égal), appliquée à un changement de BUDGET du même
  réseau. Elle ne s'y transpose pas. <span>Inférence, confiance
  faible</span> : à 10 000 nœuds, les nulles montent de 34,4 à 38,5 % —
  un résultat de partie moins informatif, qui pèse la moitié de la cible
  au poids 0,5 —, et ce qu'une recherche deux fois plus longue corrige
  dans l'évaluation, un réseau de 256 unités ne l'apprend peut-être pas ;
- **la suite** : le n° 21 reste à 5 000 nœuds (« 10 000 en cours de
  route si E10 démontre » ne joue pas) ; **2 500 nœuds entre au
  registre**, à volume égal contre 5 000 — s'il ne perd rien à
  l'étiquette, il double le volume au même temps de runner, et le volume
  paie (+8,94) ; **C1 est close** : les données de la recette sont celles
  de N9w50s800, et C2 (la recette) puis C3 (l'architecture) s'écrivent
  sur elles.

**Pourquoi 400 superlots pour E10 et E5v** — (e) renvoyait le choix ici.
La règle de (e) les veut aux mêmes superlots que E5t, et E5t existe :
N8nw50, 400 superlots — une carte de 2 h 40 économisée. **E10 contre E5t
se joue alors à temps de runner ÉGAL et à carte ÉGALE** : c'est la
décision. Le prix : E10 et E5v passent ~50 fois sur leurs données, au-delà
des 25,9 éprouvées. Si 50 passes surapprennent, E10 perd contre E5t pour
cette raison-là — **un biais contre 10 000**, dans le sens où le critère
penche déjà (le budget en place ne cède qu'à une démonstration). E10 contre
E5v, à passes égales, n'en est pas touché. <span>Confiance faible sur
l'ampleur</span> : les seaux de roi du n° 17 portaient la pénalité dès ~6
passes sur 159 M, quand N7p4 gagnait encore de 12,8 à 25,6 passes sur
1,56 G ; 50 passes sur 0,8 G n'ont jamais été vues.

**Le biais de E5t := N8nw50** : 84 jobs au lieu de 80, +5,9 % de temps de
runner pour 5 000 nœuds — ~+0,6 Elo en sa faveur (0,08 doublement × ~7,3,
le volume à superlots fixés du n° 18), <span>inférence, confiance
faible</span> ; petit devant ± 3,3, et dans le sens du budget en place.

**Les matchs** — quatre jobs de 2 800 parties chacun, `8+0,08`, le binaire
AVX2 des deux côtés, fastchess, le livre de 15 000, graine « auto ».
Chaque candidat sur un commit révoqué aussitôt, au code de `main` au bit
près et au facteur des marges de `main` (2,85) ; `6a1b1d6` ne diffère de
`main` que par son réseau (`git diff 6a1b1d6 e20dd6d -- engine/` : le
réseau inclus, son commentaire et sa confrontation). Lancés à mesure que
les réseaux arrivent :
1. **N9w50s800 contre N8tw50s800** (`main`), dès N9. *Attendu* —
   <span>inférence, confiance faible</span> — **+3 à +13, ~+7** :
   N8tw50s800 vaut N8nw50 à passes égales (+0,25 ± 4,71) ; N9 en a × 1,62
   de données de N6r4 à passes voisines (31,3 contre 25,5) ; doubler à
   passes et étiquette égales rendait ~+12,8 au n° 18 (+7,32 puis +5,49)
   — le n° 20 n'en a pas de mesure propre, ses doublements changeaient
   aussi l'étiquette — : 0,70 doublement, ~+5 à +9 au rendement
   décroissant ; un tiers de ses données à 10 000 nœuds, 0 à +3.
   **Critère** : borne basse au-dessus de zéro → **N9w50s800 embarqué**,
   après sa sonde de B8 dans la plage du facteur de `main` (sinon le
   facteur se règle d'abord, comme pour N5l) ; sinon N8tw50s800 reste ;
2. **E10w50 contre E5t** (N8nw50, `6a1b1d6`), dès E10 — temps de runner
   et carte égaux. *Attendu, écrit le 19 oct.* : **−7 à +13**, le signe
   inconnu ; ~+3 au point, E10 devant E5v de ~+10 et E5t de ~+7.
   **Critère, écrit le 20 oct.** : **10 000 remplace 5 000 si la borne
   basse est au-dessus de zéro** ; sinon 5 000 reste. Le registre :
   20 000 au test suivant si 10 000 démontre, 2 500 si E10 régresse,
   démontré ;
3. **E10w50 contre E5vw50**, dès E5v — volume, passes et carte égaux :
   l'étiquette seule. *Attendu* : **0 à +20, ~+10** — deux fois les
   nœuds valent un doublement de temps pour l'étiqueteur (~+108 au
   moteur, l'étalon), × ~0,12 Elo de réseau par Elo d'étiqueteur, ~+13 ;
   à `wdl` 0,5, le score pèse 50 % de la cible. Ne décide rien : il
   sépare « le budget ne paie pas » de « il paie, moins que le volume
   qu'il coûte » ;
4. **E5t contre E5vw50**, dès E5v — **le volume à étiquette égale**, aux
   mêmes superlots : × 1,94 de données, 25,5 passes contre 49,4. Un test
   de plus, gratuit en carte : il dit si le volume paie encore quand
   l'étiquette ne change pas, ce que le n° 20 n'a pas mesuré — ses deux
   doublements changeaient aussi l'étiquette. *Attendu* : **+1 à +13,
   ~+6** — doubler à superlots fixés rendait +7,32 au n° 18, à étiquette
   égale ; le +7,38 du n° 20 y mêlait une meilleure étiquette. Ne décide
   rien seul : une borne basse au-dessus de zéro dit que
   le n° 21 et les tranches suivantes s'empilent avec profit ; rien de
   démontré, que la marge est dans l'étiquette et l'architecture plus que
   dans le volume, à ce régime de passes — et C2 et C3 passent devant
   la génération dans la file. Les matchs 2, 3 et 4 bouclent un
   triangle : (3) − (2) − (4) doit valoir zéro à ± 5,7 près — un
   contrôle, pas une mesure.

**Hors match**, pour chacun : la perte tenue à l'écart
(`nnue_validation.rs`, par `nnue-validation.yml`) sur le job tenu à l'écart
de l'étape B (39050360980, 5 000 nœuds) et sur celui de (e) (39493777327,
10 000 nœuds) — un diagnostic, jamais une mesure de force ; N8nw50 compris,
pour qu'E5v et E5t se lisent sur les mêmes positions. La sonde de B8 pour
N9, qui peut embarquer. Les nœuds par seconde : la même architecture que
N8tw50s800, le même calcul — rien à mesurer.

**Ce qui suit** : C2 (la recette) et C3 (l'architecture) s'écrivent au
verdict de C1, sur les données qu'il fixe — celles de N9 s'il embarque.

#### La séance C2 — écrite le 26 oct. à 8 h 07, avant de la demander

**Ce qu'elle tranche : la recette, sur les données que C1 a fixées.** Quatre
réseaux à l'architecture et aux données de N9w50s800 — 256 unités, quatre
seaux de roi, huit de sortie ; les 94 jobs appris de l'étape B et les 80 de
(e), 3,71 G positions, sur le disque de Théo depuis C1 — et à sa recette,
**un seul réglage changé chacun** : 800 superlots, pas 0,001 décroissant en
cosinus jusqu'à × 0,3⁵, lot 16 384, ply ≥ 16. N9w50s800, qui joue, est la
base : **chacun se mesure contre lui, directement**, sans réseau de base à
entraîner.

| réseau | le réglage changé | séance | carte |
|---|---|---|---|
| **N9w625s800** | poids du résultat 0,625 au lieu de 0,5 | `a` | ~5 h 15 |
| **N9w75s800** | poids du résultat 0,75 | `a` | ~5 h 15 |
| **N9p25s800** | exposant de la perte 2,5 au lieu de 2 | `b` | ~5 h 15 |
| **N9w25a75s800** | poids variable, de 0,25 à 0,75 en ligne droite — 0,5 en moyenne | `b` | ~5 h 15 |

**Pourquoi 800 superlots, et pas un écran à 400** : l'optimum du poids a
bougé avec les passes — 0,75 perdait 11,79 contre 0,5 à 6,4 passes, 3,35 à
25,6 — et N9w50s800 en fait 31,3. Un écran à 400 superlots (15,7 passes)
mesurerait une recette que personne ne jouera, et demanderait une base de
plus. Le prix : 5 h 15 de carte par réseau au lieu de 2 h 40.

**Pourquoi ces quatre d'abord** (« La file », les réglages ouverts) : le
poids est le seul réglage de la recette dont on sait qu'il compte (+11,79
à 100 superlots) et que son optimum bouge ; 0,625 et 0,75 disent dans quel
sens. L'exposant 2,5 et le poids variable n'ont jamais été mesurés ici, et
coûtent une option chacun. Le pas final, la taille de lot et le premier
demi-coup gardé suivent (C2c, écrite au verdict) : leur sens même est
inconnu, et il y faudrait deux réseaux par réglage.

**Le script** : `tools/seance-n20d.sh` — `essai`, puis `a`, puis `b` (ou
`tout`, ~21 h). Chaque réseau est poussé sur `reseau/n20d` dès qu'il passe
ses contrôles, qui lisent la **ligne de recette entière** que l'entraîneur
imprime : un réglage mal passé ne fait rien planter, il entraîne un autre
réseau. Le modèle de la ligne retombe à l'octet sur les sorties réelles de
N9w50s800 et de E10w50 ; le format des quatre variantes — le `{}` d'un
`f32` : 0.625, 0.75, 0.25, 2.5 — vérifié par un programme Rust au format
de `tools/nnue-train`. *Éprouvé dans un bac à sable* — faux `cargo` au
format du jour, faux `gh`, dépôt distant local : l'essai, deux jobs de
l'étape B manquants et téléchargés ; `a`, puis sa relance, qui ne refait
rien ; une panne simulée de l'entraîneur sur N9p25s800, puis la relance,
qui le reprend ; un entraîneur qui ignorerait `--wdl-final`, refusé par la
ligne de recette ; un mode inconnu, refusé. **Le bac à sable a trouvé un
défaut** : un réseau refusé restait « déjà fait », et aucune relance ne le
refaisait. Désormais il est mis de côté, jamais effacé : la relance le
refait, et s'il était sain — un contrôle faux, comme pour N9w50s800 le
22 oct. —, il reste publiable à la main.

**Attendus** — chacun contre N9w50s800, quatre jobs de 2 800 parties à
`8+0,08`, AVX2 des deux côtés, le livre de 15 000, graine « auto », au
facteur de `main` (2,85) — <span>inférence, confiance faible</span> :
- **N9w625s800 : −3 à +6, ~+1** — la tendance des passes : de 6,4 à 25,6
  passes, 0,75 a repris 8,4 points sur 0,5 ; à 31,3, l'écart est petit, et
  0,625 est entre les deux ;
- **N9w75s800 : −6 à +5, ~−1** ;
- **N9p25s800 : −5 à +5, ~0** — jamais mesuré ici ; un exposant plus grand
  pèse davantage les grosses erreurs ;
- **N9w25a75s800 : −4 à +6, ~+1** — la même moyenne que N9w50s800 : il
  apprend d'abord l'évaluation, puis le résultat.

**Critère, écrit avant** : chacun, borne basse au-dessus de zéro →
**candidat à l'embarquement**, sa sonde de B8 lue contre N9w50s800 dans les
mêmes conditions ; seul, il embarque. Si les deux poids démontrent, un
match direct les départage. Si un poids et la perte — ou le poids variable
— démontrent, leur **composition** s'entraîne et se mesure contre le
meilleur seul avant d'embarquer : leurs Elo ne s'additionnent jamais sur le
papier. **La puissance, dite d'avance** : ± 3,3 à 11 200 parties ; un gain
de +2 passe inaperçu, et c'est accepté parce que c'est écrit — le réglage
reste ouvert au registre, déprioritisé.

**Hors match** : la perte tenue à l'écart sur les trois jobs tenus à
l'écart, N9w50s800 en référence — un diagnostic, **et biaisé pour trois
des quatre** : `nnue_validation.rs` la calcule sous un poids fixé à 0,75 et
à l'exposant 2, ce que N9w75s800 a minimisé et pas les autres. Les nœuds
par seconde : la même architecture, le même calcul — rien à mesurer.

**N9w625s800 — intégré le 26 oct. à 14 h 04, en match.** Poussé par la
séance à 13 h 41 (`08dc26a` sur `reseau/n20d`), tous contrôles passés.
Sa sortie relue : la ligne de recette **« 800 superlots, pas 0.001 →
2.4300007e-6, wdl 0.625 → 0.625, perte ^2, lot 16384, ply ≥ 16 »** ;
**29 009 129 parties et 3 712 073 002 positions relues à l'octet** — les
données de N9w50s800 ; **confrontation 4 / 11** ; 18 577 s de carte,
5 h 10. Le réseau dans `reseaux/`, le candidat **`fcd362f`** révoqué
aussitôt, au code de `main` au bit près — le seul `nnue.rs` du réseau — et
au facteur 2,85. **Quatre jobs contre N9w50s800** (`main`, `cf93707`),
l'attendu et le critère plus haut : −3 à +6, ~+1 ; borne basse au-dessus
de zéro → candidat à l'embarquement.

**N9w625s800 — VERDICT, le 26 oct. à 19 h 56 : −1,86 ± 3,33 contre N9w50s800
— pas candidat ; le poids reste à 0,5.** Quatre jobs finis ENTIERS entre
19 h 03 et 19 h 10, 6,37 à 6,53 s par partie, zéro perte au temps, aucun
coup illégal, aucun moteur perdu ; le premier sur EPYC 7763, 1 960 159 n/s
au banc, profondeur 14 en 250 ms.

| les quatre jobs | en commun, 11 200 parties | homogénéité | attendu, écrit avant |
|---|---|---|---|
| −2,61, −2,48, −1,99, −0,37 | **−1,86 ± 3,33** | p = 0,969 | −3 à +6, ~+1 — dedans, 2,9 sous le point |

Pentanomiaux, dans l'ordre des jobs : 39, 262, 813, 253, 33 ; 23, 261,
855, 235, 26 ; 34, 254, 832, 254, 26 ; 26, 271, 815, 256, 32.

- **Critère, écrit avant** : la borne basse, −5,19, n'est pas au-dessus de
  zéro — **N9w625s800 n'est pas candidat**. La borne haute, +1,47, n'est
  pas sous zéro : aucune régression démontrée non plus ;
- **ce qu'il dit** : à 31,3 passes, monter le poids de 0,5 à 0,625 ne rend
  rien de mesurable. La tendance des passes — 0,75 reprenait 8,4 points
  sur 0,5 entre 6,4 et 25,6 passes — ne se prolonge pas en gain à 800
  superlots ; elle se prolonge peut-être en ÉGALITÉ, ce que N9w75s800
  dira. <span>Inférence, confiance moyenne</span> : l'optimum du poids,
  à cette recette, est plat entre 0,5 et 0,625 ;
- **le réglage reste ouvert** (« La file », registre) — **déprioritisé** :
  un gain de +2 passe inaperçu à ± 3,3, et c'était écrit.

**N9w75s800 — intégré le 26 oct. à 19 h 56, en match.** Poussé par la séance
à 18 h 47 (`1faab0b` sur `reseau/n20d`), tous contrôles passés. Sa sortie
relue : la ligne de recette **« 800 superlots, pas 0.001 → 2.4300007e-6,
wdl 0.75 → 0.75, perte ^2, lot 16384, ply ≥ 16 »** ; **29 009 129 parties
et 3 712 073 002 positions relues à l'octet** — les données de N9w50s800 ;
**confrontation 7 / 14** ; 18 368 s de carte, 5 h 06. Le réseau dans
`reseaux/`, le candidat **`331cdad`** révoqué aussitôt, au code de `main`
au bit près — le seul `nnue.rs` du réseau — et au facteur 2,85. **Quatre
jobs contre N9w50s800** (`main`, `cf93707`), l'attendu et le critère plus
haut, écrits avant : −6 à +5, ~−1 ; borne basse au-dessus de zéro →
candidat à l'embarquement. Le verdict de N9w625s800, tombé avant ce
lancement, ne change pas l'attendu : il est dans sa fourchette.

**N9w75s800 — VERDICT, le 27 oct. à 1 h 53 : −2,95 ± 3,34 contre N9w50s800
— pas candidat ; la séance `a` CLOSE, le poids reste à 0,5.** Quatre jobs
finis ENTIERS entre 1 h 01 et 1 h 10, 6,48 à 6,67 s par partie, zéro perte
au temps, aucun coup illégal, aucun moteur perdu.

| les quatre jobs | en commun, 11 200 parties | homogénéité | attendu, écrit avant |
|---|---|---|---|
| −9,43, −1,86, +0,37, −0,87 | **−2,95 ± 3,34** | p = 0,176 | −6 à +5, ~−1 — dedans, 2 sous le point |

Pentanomiaux, dans l'ordre des jobs : 33, 284, 829, 234, 20 ; 26, 279,
814, 246, 35 ; 31, 268, 798, 273, 30 ; 30, 245, 859, 234, 32.

- **Critère, écrit avant** : la borne basse, −6,29, n'est pas au-dessus de
  zéro — **pas candidat**. La borne haute, +0,39, frôle zéro sans le
  franchir : aucune régression démontrée ;
- **la séance `a`, close** : ni 0,625 (−1,86 ± 3,33) ni 0,75 (−2,95 ±
  3,34) ne gagnent sur 0,5 à 800 superlots, et les deux points vont dans
  le même sens, le second plus bas. <span>Inférence, confiance
  moyenne</span> : l'optimum du poids, à cette recette, est à 0,5 ou en
  deçà — la tendance des passes, qui rapprochait 0,75 de 0,5 de 6,4 à
  25,6 passes, s'arrête avant de le dépasser. Le registre garde le
  réglage, déprioritisé ; **0,375** serait le seul point encore ouvert,
  et le poids variable (`b`) touche la même région.

**N9w25a75s800 — VERDICT, le 27 oct. à 13 h 31 : −1,99 ± 3,32 contre
N9w50s800 — pas candidat.** Quatre jobs finis ENTIERS entre 12 h 42 et
12 h 45, 6,36 à 6,43 s par partie, zéro perte au temps, aucun coup
illégal, aucun moteur perdu.

| les quatre jobs | en commun, 11 200 parties | homogénéité | attendu, écrit avant |
|---|---|---|---|
| −5,34, −6,95, +2,11, +2,23 | **−1,99 ± 3,32** | p = 0,219 | −4 à +6, ~+1 — dedans, 3 sous le point |

Pentanomiaux, dans l'ordre des jobs : 39, 254, 847, 231, 29 ; 30, 276,
845, 218, 31 ; 26, 255, 823, 268, 28 ; 32, 239, 838, 261, 30.

**C2 — VERDICT, le 27 oct. à 13 h 31 : aucun des quatre réglages ne gagne ;
la recette reste celle de N9w50s800, rien à composer.**

| réseau | le réglage | contre N9w50s800, 11 200 parties | attendu, écrit avant |
|---|---|---|---|
| N9w625s800 | poids du résultat 0,625 | −1,86 ± 3,33 | −3 à +6, ~+1 |
| N9w75s800 | poids du résultat 0,75 | −2,95 ± 3,34 | −6 à +5, ~−1 |
| N9p25s800 | exposant de la perte 2,5 | +0,84 ± 3,28 | −5 à +5, ~0 |
| N9w25a75s800 | poids de 0,25 à 0,75 | −1,99 ± 3,32 | −4 à +6, ~+1 |

- **Les quatre dans leur attendu, aucun au-dessus de zéro par sa borne
  basse** ; les quatre points tombent tous entre −3 et +1 — le côté bas
  des attendus, qui penchaient légèrement vers le gain pour trois d'entre
  eux ;
- **ce qu'elle dit** : à 800 superlots sur 3,71 G positions, la recette
  de N9w50s800 est au voisinage de son optimum pour le poids et la perte
  — à ± 3 près. *Les réglages qui payaient à 100 superlots (le poids :
  +11,79) ne paient plus à 800* ; l'optimum a bougé avec les passes, et
  le poids 0,5, choisi à 100, se trouve encore le bon à 800 ;
- **ce qu'elle ne dit pas** : un gain de +2 sur un réglage passe
  inaperçu à ± 3,3, et quatre réglages à +1 chacun feraient +4 ensemble
  — invisibles un par un. <span>Inférence, confiance faible</span> ;
  la composition ne se mesure qu'au gagnant démontré, et il n'y en a
  pas ;
- **la suite** : C2c (pas final, lot, premier demi-coup), lancée par
  Théo le 27 au soir ; puis C3 — l'architecture.

**La séance `b` — lancée par Théo le 26 oct. à 20 h 33** (« *ok c'est
lancé* »), `bash tools/seance-n20d.sh b` au `main` de la PR #222 :
N9p25s800 puis N9w25a75s800, ~5 h 15 de carte chacun — le premier
attendu sur `reseau/n20d` vers 1 h 50, le second vers 7 h 05. Chacun
s'intègre et se mesure contre N9w50s800 comme les deux poids, aux
attendus et au critère écrits plus haut.

**N9p25s800 — intégré le 27 oct. à 1 h 53, en match.** Poussé par la séance
à 1 h 44 (`72276f9` sur `reseau/n20d`), tous contrôles passés. Sa sortie
relue : la ligne de recette **« 800 superlots, pas 0.001 → 2.4300007e-6,
wdl 0.5 → 0.5, perte ^2.5, lot 16384, ply ≥ 16 »** ; **29 009 129 parties
et 3 712 073 002 positions relues à l'octet** ; **confrontation 5 / 34**
— le maximal le plus haut des trois, sous les 50 admis ; 18 788 s de
carte, 5 h 13. Le réseau dans `reseaux/`, le candidat **`f0db36f`**
révoqué aussitôt, au code de `main` au bit près et au facteur 2,85.
**Quatre jobs contre N9w50s800** (`main`), l'attendu et le critère plus
haut, écrits avant : −5 à +5, ~0 ; borne basse au-dessus de zéro →
candidat à l'embarquement.

**N9p25s800 — VERDICT, le 27 oct. à 7 h 45 : +0,84 ± 3,28 contre N9w50s800
— pas candidat ; l'exposant reste à 2.** Quatre jobs finis ENTIERS entre
6 h 57 et 7 h 04, 6,47 à 6,63 s par partie, zéro perte au temps, aucun
coup illégal, aucun moteur perdu.

| les quatre jobs | en commun, 11 200 parties | homogénéité | attendu, écrit avant |
|---|---|---|---|
| +1,12, +1,12, −1,36, +2,48 | **+0,84 ± 3,28** | p = 0,853 | −5 à +5, ~0 — dedans, sur le point |

Pentanomiaux, dans l'ordre des jobs : 27, 239, 860, 246, 28 ; 22, 259,
832, 262, 25 ; 32, 257, 837, 238, 36 ; 24, 246, 850, 246, 34.

- **Critère, écrit avant** : la borne basse, −2,44, n'est pas au-dessus
  de zéro — **pas candidat**. La borne haute, +4,12 : un gain de cet
  ordre reste possible et indécelable ici, comme écrit d'avance ;
- **ce qu'il dit** : peser davantage les grosses erreurs ne rend rien de
  mesurable à 800 superlots ; le réglage reste au registre,
  déprioritisé — le seul de C2 au-dessus de zéro au point, sans plus.

**La perte tenue à l'écart des quatre — les attendus, écrits le 27 oct.
à 7 h 45, avant de la lancer.** `nnue-validation.yml` sur les trois jobs
tenus à l'écart — 39050360980 (l'étape B), 39493777327 ((e)), 38531414161
(le n° 18, étiqueté par N5l) —, N9w50s800 en référence. Un diagnostic,
**biaisé et dit d'avance** : l'outil mesure la perte au poids 0,75 et à
l'exposant 2. L'échelle connue : 0,5 contre 0,75 rendait −0,00003 et
+0,00004, 0,25 contre 0,75 +0,00032 (N6r4w50, N7p4w50, N6r4w25). Par job
tenu, contre N9w50s800 — <span>inférence, confiance faible</span> :
- **N9w625s800 : −0,0001 à +0,0001**, indiscernable ;
- **N9w75s800 : −0,0002 à +0,00005**, ~−0,00005 — il minimise la cible
  même que l'outil mesure ;
- **N9p25s800 : −0,0001 à +0,0004**, ~+0,0001 — il minimise une autre
  perte ;
- **N9w25a75s800 : −0,0001 à +0,0002**, ~0 — il finit au poids 0,75.

Les matchs décident ; ce relevé dit seulement si un réseau retient
autrement — trois sur quatre sont déjà sans gain.

**La perte tenue à l'écart, RELEVÉE le 27 oct. à 7 h 50 — huit lectures sur
douze dans l'attendu ; le job de N5l dehors pour trois.** Run
40463028272, l'outil à `a4d92b2`, lancé à 7 h 45, fini à 7 h 48 ; écarts
à N9w50s800 :

| réseau | étape B (39050360980, N6r4) | (e) (39493777327, N6r4 à 10 000) | n° 18 (38531414161, N5l) | attendu, écrit avant |
|---|---|---|---|---|
| N9w625s800 | −0,000021 ± 0,000017 | −0,000049 ± 0,000025 | **+0,000175 ± 0,000018** | −0,0001 à +0,0001 |
| N9w75s800 | +0,000010 ± 0,000021 | −0,000040 ± 0,000029 | **+0,000318 ± 0,000022** | −0,0002 à +0,00005 |
| N9p25s800 | +0,000362 ± 0,000022 | **+0,000579 ± 0,000031** | +0,000073 ± 0,000023 | −0,0001 à +0,0004 |
| N9w25a75s800 | −0,000034 ± 0,000019 | −0,000080 ± 0,000027 | **+0,000246 ± 0,000020** | −0,0001 à +0,0002 |

- **Sur les données de leur étiqueteur** (étape B et (e), N6r4), les
  trois variantes du poids sont **à égalité avec N9w50s800, à 0,00008
  près** — l'attendu ; N9w75s800 n'y est pas meilleur, alors qu'il
  minimise la cible même que l'outil mesure ;
- **sur le job de N5l, plus le poids du résultat monte, plus la perte
  monte** : +0,00018 à 0,625, +0,00032 à 0,75 ; le poids variable, qui
  finit à 0,75, entre les deux. <span>Inférence, confiance
  moyenne</span> : le résultat d'une partie appartient au moteur qui l'a
  jouée — N5l joue d'autres parties que N6r4 —, et un réseau qui en
  apprend davantage généralise moins à celles d'un autre moteur. Les
  données de N5l ont quitté l'entraînement depuis N9w50s800 ;
- **N9p25s800 retient autrement** : +0,00036 et +0,00058 sur les données
  de son étiqueteur — il minimise une autre perte —, et **+0,84 ± 3,28
  en match** : un écart de perte de cet ordre ne dit rien du jeu. Le
  dépôt l'avait mesuré dans l'autre sens (`CLAUDE.md`, « cette valeur
  d'évaluation est meilleure ») ;
- **les attendus manqués** : je n'avais pas séparé les jobs par
  étiqueteur — la colonne N5l est celle qui sort, pour les trois poids.

**N9w25a75s800 — intégré le 27 oct. à 7 h 43, en match ; la séance `b`
finie.** Poussé par la séance à 7 h 01 (`fd77285` sur `reseau/n20d`),
tous contrôles passés. Sa sortie relue : la ligne de recette **« 800
superlots, pas 0.001 → 2.4300007e-6, wdl 0.25 → 0.75, perte ^2, lot
16384, ply ≥ 16 »**, et l'entraîneur l'annonce de son côté (« *linear
taper start 0.25 end 0.75* ») ; **29 009 129 parties et 3 712 073 002
positions relues à l'octet** ; **confrontation 5 / 16** ; 18 995 s de
carte, 5 h 17. Le réseau dans `reseaux/`, le candidat **`fa28f9a`**
révoqué aussitôt, au code de `main` au bit près et au facteur 2,85.
**Quatre jobs contre N9w50s800**, l'attendu et le critère plus haut,
écrits avant : −4 à +6, ~+1 ; borne basse au-dessus de zéro → candidat
à l'embarquement. **La carte de Théo est libre** depuis 7 h 01.

**Ce qui suit** : C2c, écrite plus bas ; C3 (l'architecture) sur la
recette que C2 fixe ; **la tranche du n° 21**, close le 26 oct., entre
dans les données de C3 — le volume paie encore (+8,94 ± 3,32).

#### La séance C2c — écrite le 27 oct. à 7 h 57, avant de la demander

**Pourquoi maintenant, et pas au verdict de N9w25a75s800.** C2 renvoyait
C2c « au verdict », pour la recette de base. Mais chaque réseau de C2c ne
change qu'un réglage de N9w50s800 et **se mesure contre lui,
directement** : son verdict ne dépend d'aucun autre réseau de C2. Si
N9w25a75s800 gagne, sa composition avec un gagnant de C2c s'entraîne et
se mesure à part, comme le critère de C2 l'écrit déjà. Attendre coûterait
six heures d'une carte libre depuis 7 h 01.

**Ce qu'elle tranche : les trois réglages de la recette jamais mesurés**
(« La file », registre) — le pas final, la taille de lot, le premier
demi-coup gardé —, **chacun dans les deux sens**, leur sens même étant
inconnu. Les données, l'architecture et le reste de la recette : ceux de
N9w50s800.

| réseau | le réglage changé | séance | carte |
|---|---|---|---|
| **N9pfbs800** | pas final dix fois plus bas : 0,001 × 0,3⁵ / 10 | `c1` | ~5 h 15 |
| **N9pfhs800** | pas final dix fois plus haut : 0,001 × 0,3⁵ × 10 | `c1` | ~5 h 15 |
| **N9l8ks800** | lot de 8 192 positions au lieu de 16 384 — deux fois plus de pas | `c2` | ~5 à 7 h |
| **N9l32ks800** | lot de 32 768 — deux fois moins de pas | `c2` | ~4 h 30 à 5 h 15 |
| **N9y8s800** | premier demi-coup gardé à 8 au lieu de 16 | `c3` | ~5 h 15 |
| **N9y24s800** | premier demi-coup gardé à 24 | `c3` | ~5 h 15 |

Un superlot garde ses ~100 M positions quel que soit le lot ; le pas
initial reste 0,001 aux deux lots — le pas que le lot appellerait est un
autre réglage. Au demi-coup 8, toutes les positions enregistrées passent
le filtre de ply — les parties commencent après 8 à 11 demi-coups au
hasard ; à 24, les ~8 à 16 premiers demi-coups joués en sortent.

**Le script** : `tools/seance-n20d.sh`, modes `c1`, `c2`, `c3` ou `c`
(les trois, ~32 h). Chaque réseau est poussé sur `reseau/n20d` dès qu'il
passe ses contrôles, dont **la ligne de recette entière** — le pas final
y est le `{:e}` d'un f32, **calculé par un programme Rust** au format
de `tools/nnue-train` (2.4300002e-7 et 2.4300001e-5), le lot et le ply
en entiers. *Éprouvé dans le bac à sable de C2*, l'entraîneur factice
mis au format du jour : `c1` ; `c2` sous un entraîneur qui ignorerait
`--lot` — **refusé, mis de côté**, puis la relance qui le refait ; `c3`
avec une panne simulée sur N9y8s800, puis `c`, qui saute les cinq déjà
poussés et refait le sixième ; un mode inconnu, refusé.

**Attendus** — chacun contre N9w50s800, quatre jobs de 2 800 parties à
`8+0,08`, AVX2 des deux côtés, le livre de 15 000, graine « auto », au
facteur de `main` (2,85) — <span>inférence, confiance faible</span> ; C2
n'a rien démontré sur quatre réglages, et rien ne dit que ceux-ci pèsent
davantage :
- **N9pfbs800 : −4 à +4, ~0** — les derniers superlots ne bougent presque
  plus déjà ;
- **N9pfhs800 : −6 à +3, ~−1** — finir à un pas plus haut laisse du
  bruit dans les poids ;
- **N9l8ks800 : −3 à +5, ~+1** — deux fois plus de pas au même pas ;
- **N9l32ks800 : −5 à +3, ~−1** ;
- **N9y8s800 : −5 à +3, ~−1** — les positions des ouvertures tirées au
  hasard entrent dans l'apprentissage ;
- **N9y24s800 : −4 à +3, ~−0,5**.

**Critère, écrit avant** : celui de C2 — chacun, borne basse au-dessus de
zéro → candidat à l'embarquement, sa sonde de B8 lue contre N9w50s800 ;
si les deux sens d'un réglage démontraient, un match direct ; un gagnant
de C2c et un de C2 se composent et se mesurent contre le meilleur seul.
**La puissance, dite d'avance** : ± 3,3 ; un gain de +2 passe inaperçu,
et le réglage reste ouvert au registre, déprioritisé.

**Hors match** : la perte tenue à l'écart des six, au bout de la séance,
ses attendus écrits avant — séparés par étiqueteur, cette fois.

**Pas lancée le 27 au matin — à lancer le soir.** J'avais inscrit à
8 h 11 « lancée par Théo » sur la foi de « *je lance la séance juste
après* » ; Théo, à 8 h 48 : « *le script en cours ne tourne pas, c2c n'a pas
été lancé* ». Il la lance le soir même, et **c'est la dernière séance de
la semaine** — même message du matin : « *après ça j'aurais plus de pc
portable, tu pourras avancer ce qu'il faut et préparer les séances
suivantes pour semaine pro* ». Une panne en cours de séance ne se
relancera que la semaine suivante ; les réseaux déjà poussés se mesurent
sans attendre.

**LANCÉE le 27 oct. à 20 h 07 — `c veille`, son journal relu par Théo.**
La veille d'abord éprouvée à la main (`CanSuspend` « yes », puis
`systemctl suspend` et le réveil, sans mot de passe) ; puis, dans
`resume.txt` : `20:07 ok la veille possible sans mot de passe`, `20:07 ok
mise en veille bloquée jusqu'à la fin`, `20:08 ok la veille armée`,
`20:08 lance n9pfbs800`. *Attendu* : N9pfbs800 poussé vers **1 h 25**,
puis un réseau toutes les ~5 h 15 — <span>confiance faible pour les
lots</span> : <s>un superlot compte des lots, si bien que</s> **un
superlot compte des POSITIONS, 100 007 936 quel que soit le lot —
corrigé le 28 oct., la phrase contredisait le tableau plus haut —, mais**
8 192 et 32 768 positions par lot en changent le nombre de pas, donc
peut-être la durée — ; la fin vers le 29 oct.
au matin, puis la veille. **N9pfbs800 poussé à 1 h 25, à la minute** — la recette
relue (« pas 0.001 → 2.4300002e-7 »), 3 712 073 002 positions relues à
l'octet, confrontation 8 / 24 ; candidat `ad84d1f` révoqué ; quatre jobs
en vol depuis 1 h 39.

**N9pfbs800 — VERDICT, le 28 oct. à 7 h 28 : +1,40 ± 3,27, pas candidat.**
Quatre jobs finis ENTIERS entre 6 h 38 et 6 h 47, 6,39 à 6,58 s par
partie, zéro perte au temps, aucun coup illégal, aucun moteur perdu :

| job | Elo | Ptnml(0-2) |
|---|---|---|
| 40610093856 | −2,73 ± 6,62 | 33, 259, 829, 255, 24 |
| 40610102423 | +2,85 ± 6,68 | 30, 245, 828, 266, 31 |
| 40610110837 | +4,09 ± 6,34 | 18, 244, 851, 261, 26 |
| 40610118331 | +1,36 ± 6,48 | 25, 248, 844, 257, 26 |
| **en commun, 11 200 parties** | **+1,40 ± 3,27** | homogènes, p = 0,463 |

- **dans l'attendu** (−4 à +4, ~0), sur son point ; la borne basse,
  −1,87, sous zéro : **pas candidat**, le pas final reste à 0,3⁵ — du
  côté bas, rien n'est démontré ;
- les avertissements de l'arbitre, lus : « PV continues after fifty-move
  rule » et « … after threefold repetition », 4 à 7 par job, des deux
  côtés à parts presque égales (11 côté candidat, 12 côté référence) —
  le même code de recherche, aucune différence à y chercher.

**N9pfhs800 poussé à 6 h 41** — 5 h 16 après N9pfbs800 : la recette
relue (« pas 0.001 → 2.4300001e-5 »), 3 712 073 002 positions relues à
l'octet, confrontation 7 / 18 ; candidat `fd64e31` révoqué ; quatre jobs
en vol depuis 7 h 24 (attendu −6 à +3). **N9l8ks800 attendu vers 11 h 55**
— <span>confiance faible</span> : un lot de 8 192 positions peut changer
la durée d'un superlot. **Deux risques matériels, dits à Théo** : la
batterie — le chargeur branché — et le capot : par défaut
(`LidSwitchIgnoreInhibited=yes`), logind ignore le blocage de veille quand
on le rabat, et la séance s'arrêterait.

**N9pfhs800 — VERDICT, le 28 oct. à 13 h 36 : −13,13 ± 3,43, régression
démontrée.** Quatre jobs finis ENTIERS entre 12 h 24 et 12 h 35, 6,41 à
6,63 s par partie, zéro perte au temps, aucun coup illégal, aucun moteur
perdu :

| job | Elo | Ptnml(0-2) |
|---|---|---|
| 40643606993 | −10,80 ± 6,78 | 41, 290, 805, 243, 21 |
| 40643615201 | −17,88 ± 7,11 | 56, 310, 782, 226, 26 |
| 40643623572 | −13,66 ± 6,84 | 36, 326, 769, 250, 19 |
| 40643631447 | −10,18 ± 6,73 | 38, 284, 827, 224, 27 |
| **en commun, 11 200 parties** | **−13,13 ± 3,43** | homogènes, p = 0,411 |

- **sous l'attendu** (−6 à +3, ~−1), de sept Elo sous sa borne basse ;
  la borne haute, −9,70, sous zéro : **régression démontrée, pas
  candidat** ;
- **l'axe du pas final, lu des deux côtés** : × 0,1, +1,40 ± 3,27, rien
  de démontré ; × 10, −13,13 ± 3,43. **Le pas final reste à 0,3⁵ du pas
  initial.** <span>Inférence, confiance moyenne</span> : les derniers
  superlots, au pas le plus bas, ôtent des poids un bruit que le pas
  haut y laisse — le recuit final compte ; descendre plus bas n'ôte plus
  rien de visible. Le réglage reste ouvert au registre, déprioritisé : ce
  qui pourrait encore payer est entre × 0,1 et × 1, une marge fine ;
- les avertissements de l'arbitre, lus : « PV continues after fifty-move
  rule », et trois « … after threefold repetition », 4 à 12 par job, des
  deux côtés (12 côté candidat, 15 côté référence) — le même code de
  recherche, aucune différence à y chercher.

**N9l8ks800 poussé à 12 h 36 — 5 h 55 après N9pfhs800**, 39 minutes de
plus que les deux d'avant : la recette relue (« 800 superlots, pas 0.001
→ 2.4300007e-6, wdl 0.5 → 0.5, perte ^2, lot 8192, ply ≥ 16 »),
3 712 073 002 positions relues à l'octet, confrontation 10 / 18 ;
candidat `f5b2243` révoqué ; quatre jobs en vol depuis 13 h 28 (attendu
−3 à +5). **La durée du lot, mesurée** : un superlot garde ses
100 007 936 positions, soit **12 208 pas de 8 192 au lieu de 6 104 de
16 384** ; l'entraînement seul passe de 18 938 à 21 271 s (× 1,12), le
débit de ~4,09 à ~3,61 M de positions par seconde au dernier superlot.
**N9l32ks800 attendu vers 17 h 30 à 17 h 55** — <span>confiance
faible</span> : 3 052 pas par superlot ; si le surcoût va au pas, ~4 h 56
de séance, d'où 17 h 32 ; si la carte est déjà à son plein débit à
16 384, 5 h 16, d'où 17 h 52.

**N9l32ks800 poussé à 17 h 38 — 5 h 02 après N9l8ks800**, entre les deux
bornes de l'attendu : la recette relue (« 800 superlots, pas 0.001 →
2.4300007e-6, wdl 0.5 → 0.5, perte ^2, lot 32768, ply ≥ 16 »),
3 712 073 002 positions relues à l'octet, confrontation 8 / 12 ;
candidat `d610d81` révoqué ; quatre jobs en vol depuis 17 h 53 (attendu
−5 à +3). **La durée du lot, sur trois points** : l'entraînement seul
prend 21 271 s à 8 192, 18 938 à 16 384, **18 122 à 32 768** (× 0,96),
le débit au dernier superlot ~3,61, ~4,09 et **~4,30 M** de positions
par seconde — doubler le lot rend de moins en moins : −2 333 s, puis
−816 s. **N9y8s800 attendu vers 22 h 55, N9y24s800 vers 4 h 10** le
29 oct., au lot de 16 384 (5 h 16 chacun), puis la veille.

**N9l8ks800 — VERDICT, le 28 oct. à 19 h 18 : −5,43 ± 3,23 en commun, pas
candidat — mais les quatre matchs ne mesurent pas un seul effet.** Quatre
jobs finis ENTIERS entre 18 h 26 et 18 h 35, 6,35 à 6,54 s par partie,
zéro perte au temps, aucun coup illégal, aucun moteur perdu :

| job | Elo | Ptnml(0-2) | runner, nœuds/s au banc, profondeur en 250 ms |
|---|---|---|---|
| 40688068619 | +1,49 ± 6,43 | 22, 249, 853, 247, 29 | EPYC 7763, 1 991 518, 14 |
| 40688078889 | −2,61 ± 6,37 | 26, 250, 869, 229, 26 | EPYC 7763, 1 957 204, 14 |
| 40688089330 | −8,32 ± 6,52 | 28, 286, 835, 227, 24 | EPYC 9V74, 1 020 372, 14 |
| 40688099240 | −12,29 ± 6,50 | 27, 309, 819, 226, 19 | EPYC 9V45, 2 272 418, 15 |
| **en commun, 11 200 parties** | **−5,43 ± 3,23** | **hétérogènes, p = 0,017** | |

- **la décision n'en dépend pas** : le critère demande une borne basse
  au-dessus de zéro, et aucune lecture n'en donne une — ni la mise en
  commun, ni un seul des quatre matchs. **Pas candidat** ; le lot reste
  à 16 384 ;
- **l'amplitude, elle, n'est pas un nombre** : `tools/mettre-en-commun.sh`
  refuse la mise en commun (plus grand écart z = 2,95, entre le premier
  et le dernier match). Lu séparément, deux matchs ont leur borne haute
  sous zéro (−8,32 et −12,29), deux contiennent zéro. **L'étalonnage
  n'explique pas l'écart** : les deux EPYC 7763 rendent +1,49 et −2,61,
  les deux Zen 4 (9V74, 9V45) −8,32 et −12,29, mais le 9V74, le plus lent
  au banc (1,02 M n/s, la moitié des autres), atteint la même profondeur
  14 que les 7763 ; seul le 9V45 cherche un pli plus loin. <span>Inférence,
  confiance faible</span> : un écart de cette taille arrive une fois sur
  soixante sous un seul effet, et quatre matchs ne séparent pas un
  hasard d'un effet propre au processeur — le candidat et la référence
  font le même calcul, au réseau près, sur la même machine ;
- **sous l'attendu** (−3 à +5, ~+1) en commun, de deux Elo et demi sous
  sa borne basse. <span>Inférence, confiance faible</span> : deux fois
  plus de pas au même pas initial, c'est un recuit deux fois plus long à
  chaque palier de la décroissance — rien n'indique qu'il aide, et le
  point penche vers le coût ;
- les avertissements de l'arbitre, lus : « PV continues after fifty-move
  rule » et neuf « … after threefold repetition », 4 à 11 par job, des
  deux côtés (13 côté candidat, 18 côté référence) — le même code de
  recherche.

<s>**L'axe du lot se conclut avec N9l32ks800**, en match jusque vers 23 h ;
le registre attend ses deux côtés.</s> Conclu ci-dessous.

**N9l32ks800 — VERDICT, le 28 oct. à 23 h 10 : +2,30 ± 3,33, pas candidat ;
l'axe du lot est clos, le lot reste à 16 384.** Quatre jobs finis
ENTIERS entre 22 h 55 et 22 h 59, 6,42 à 6,50 s par partie, zéro perte
au temps, aucun coup illégal, aucun moteur perdu :

| job | Elo | Ptnml(0-2) | runner, nœuds/s au banc, profondeur en 250 ms |
|---|---|---|---|
| 40730461776 | +6,95 ± 6,71 | 27, 236, 827, 274, 36 | Xeon 8573C, 1 142 412, 14 |
| 40730473764 | −3,60 ± 6,86 | 31, 286, 798, 251, 34 | EPYC 7763, 1 018 092, 14 |
| 40730486311 | +3,23 ± 6,54 | 21, 262, 811, 282, 24 | EPYC 7763, 1 032 019, 14 |
| 40730498500 | +2,61 ± 6,55 | 26, 248, 831, 269, 26 | EPYC 7763, 1 028 220, 14 |
| **en commun, 11 200 parties** | **+2,30 ± 3,33** | homogènes, p = 0,136 | |

- **dans l'attendu** (−5 à +3, ~−1), au-dessus de son point ; la borne
  basse, −1,03, sous zéro : **pas candidat** ;
- **l'axe du lot, lu des deux côtés** : 8 192 → −5,43 ± 3,23 en commun,
  matchs hétérogènes, deux sur quatre leur borne haute sous zéro ;
  32 768 → +2,30 ± 3,33,
  rien de démontré. Aucun côté ne gagne ; le point penche vers les
  grands lots, et 32 768 coûte 4 % de moins à entraîner (18 122 s contre
  18 938). <span>Inférence, confiance faible</span> : au même pas
  initial, un lot deux fois plus grand fait deux fois moins de pas par
  superlot — un recuit plus court qui ne coûte rien de visible ; le pas
  que le lot appelle, plus haut, est un autre réglage, jamais mesuré ;
- les étalonnages : les trois EPYC 7763 rendent ~1,02 à 1,03 M n/s au
  banc, la moitié de ceux du match de N9l8ks800 (1,96 et 1,99 M), à la
  même profondeur 14 — l'étalonnage d'un même modèle varie du simple au
  double, la profondeur non. *Ce n'est pas une explication de l'écart
  de N9l8ks800, c'est une raison de plus de ne pas en chercher une dans
  les nœuds par seconde* ;
- les avertissements de l'arbitre, lus : « PV continues after
  fifty-move rule » et sept « … after threefold repetition », 7 à 12 par
  job, des deux côtés (22 côté candidat, 15 côté référence) — le même
  code de recherche.

**N9y8s800 poussé à 22 h 53 — 5 h 15 après N9l32ks800**, au lot de
16 384 comme prévu : la recette relue (« 800 superlots, pas 0.001 →
2.4300007e-6, wdl 0.5 → 0.5, perte ^2, lot 16384, ply ≥ 8 »),
3 712 073 002 positions relues à l'octet, confrontation 4 / 27 ;
l'entraînement seul 18 869 s ; candidat `1158453` révoqué ; quatre jobs
en vol depuis 23 h 09 (attendu −5 à +3). **N9y24s800 attendu vers
4 h 10**, puis la veille.

**N9y8s800 — VERDICT, le 29 oct. à 4 h 24 : −3,78 ± 3,26, régression
démontrée de peu, pas candidat.** Quatre jobs finis ENTIERS entre 4 h 08
et 4 h 19, 6,38 à 6,60 s par partie, zéro perte au temps, aucun coup
illégal, aucun moteur perdu :

| job | Elo | Ptnml(0-2) | runner, nœuds/s au banc, profondeur en 250 ms |
|---|---|---|---|
| 40777759519 | −2,48 ± 6,48 | 24, 263, 852, 231, 30 | EPYC 9V74, 1 311 480, 14 |
| 40777769143 | −0,37 ± 6,61 | 25, 266, 826, 253, 30 | EPYC 9V45, 1 534 782, 15 |
| 40777778550 | −7,20 ± 6,50 | 23, 293, 828, 231, 25 | EPYC 9V74, 1 282 618, 14 |
| 40777788316 | −5,09 ± 6,50 | 24, 281, 832, 238, 25 | Xeon 8573C, 1 338 047, 14 |
| **en commun, 11 200 parties** | **−3,78 ± 3,26** | homogènes, p = 0,472 | |

- **dans l'attendu** (−5 à +3, ~−1), sous son point ; la borne haute,
  −0,52, sous zéro : **régression démontrée, de peu** ; pas candidat ;
- <span>inférence, confiance moyenne</span> — l'attendu le disait : les
  demi-coups 8 à 15 sont les sorties des ouvertures tirées au hasard
  (8 à 11 demi-coups), des positions que le moteur ne rencontre presque
  jamais en partie ; les apprendre prend des passes aux autres ;
- les avertissements de l'arbitre, lus : « PV continues after
  fifty-move rule » et cinq « … after threefold repetition », 3 à 8 par
  job, des deux côtés (10 côté candidat, 12 côté référence) — le même
  code de recherche.

**N9y24s800 poussé à 4 h 04 — 5 h 11 après N9y8s800, le dernier de la
séance** : la recette relue (« 800 superlots, pas 0.001 → 2.4300007e-6,
wdl 0.5 → 0.5, perte ^2, lot 16384, ply ≥ 24 »), 3 712 073 002 positions
relues à l'octet — le même compte aux six réseaux, quel que soit le
filtre : il est fait avant lui —, confrontation 7 / 27 ; l'entraînement seul 18 621 s ;
candidat `d9dad07` révoqué ; quatre jobs en vol depuis 4 h 23 (attendu
−4 à +3). **La séance C2c est finie** : six réseaux poussés, aucune
panne ; la veille, demandée par le script à sa sortie, ne se voit pas
d'ici.

**La perte tenue à l'écart des six — les attendus, écrits le 29 oct. à
4 h 25, avant de la lancer.** `nnue-validation.yml` sur les trois jobs
tenus à l'écart de C2 — 39050360980 (l'étape B) et 39493777327 ((e)),
étiquetés par N6r4, 38531414161 (le n° 18), par N5l —, N9w50s800 en
référence. **Séparés par étiqueteur, cette fois** : à C2, la colonne de
N5l était celle qui sortait. Deux biais, dits d'avance : l'outil mesure
au poids 0,75 et à l'exposant 2, et **sous le filtre par défaut** —
ply ≥ 16 —, si bien que N9y24s800 y est lu sur les demi-coups 16 à 23,
qu'il n'a jamais appris, et N9y8s800 sans les 8 à 15, qu'il a appris en
plus. L'échelle connue : à C2, ± 0,00008 sur les données de N6r4 pour
les poids, +0,00036 à +0,00058 pour l'exposant. Écarts à N9w50s800 —
<span>inférence, confiance faible</span> :

| réseau | données de N6r4 (deux jobs) | données de N5l (un job) | pourquoi |
|---|---|---|---|
| N9pfbs800 (pas final × 0,1) | −0,0001 à +0,0001 | −0,0001 à +0,0001 | les derniers superlots ne bougent presque plus |
| N9pfhs800 (× 10) | **+0,00005 à +0,0006** | 0 à +0,0006 | le bruit que le pas haut laisse — −13,13 en match |
| N9l8ks800 (lot 8 192) | −0,0001 à +0,0002 | −0,0001 à +0,0002 | deux fois plus de pas, au même pas |
| N9l32ks800 (lot 32 768) | −0,0002 à +0,0001 | −0,0002 à +0,0001 | deux fois moins de pas |
| N9y8s800 (ply ≥ 8) | 0 à +0,0002 | 0 à +0,0002 | moins de passes sur les positions mesurées |
| N9y24s800 (ply ≥ 24) | **+0,00005 à +0,001** | +0,00005 à +0,001 | ~8 % des positions mesurées jamais apprises |

Les matchs décident ; ce relevé dit seulement si un réseau retient
autrement.

**La perte tenue à l'écart des six, RELEVÉE le 29 oct. à 4 h 29 — quinze
lectures sur dix-huit dans l'attendu ; N9y24s800 en sort par le bas.**
Run 40812060115, l'outil à `eae5141`, lancé à 4 h 25, fini à 4 h 28 ;
écarts à N9w50s800 :

| réseau | étape B (39050360980, N6r4) | (e) (39493777327, N6r4 à 10 000) | n° 18 (38531414161, N5l) | en match |
|---|---|---|---|---|
| N9pfbs800 | −0,000023 ± 0,000016 | −0,000008 ± 0,000023 | +0,000001 ± 0,000016 | +1,40 ± 3,27 |
| N9l32ks800 | −0,000029 ± 0,000017 | −0,000010 ± 0,000024 | +0,000007 ± 0,000017 | +2,30 ± 3,33 |
| N9y8s800 | +0,000015 ± 0,000017 | +0,000028 ± 0,000025 | +0,000038 ± 0,000017 | −3,78 ± 3,26 |
| N9y24s800 | **+0,000034 ± 0,000017** | **+0,000041 ± 0,000024** | **−0,000016 ± 0,000018** | en vol |
| N9l8ks800 | +0,000055 ± 0,000016 | +0,000066 ± 0,000023 | +0,000058 ± 0,000017 | −5,43 ± 3,23, hétérogène |
| N9pfhs800 | +0,000141 ± 0,000018 | +0,000160 ± 0,000026 | +0,000089 ± 0,000019 | −13,13 ± 3,43 |

- **N9y24s800 retient mieux que je ne l'attendais** : +0,00003 et
  +0,00004 sur les données de N6r4, sous la borne de +0,00005 ; sur
  celles de N5l, −0,00002. Les demi-coups 16 à 23, qu'il n'a jamais
  appris, lui coûtent presque rien — mon « ~8 % des positions » jamais
  vues ne coûtait pas ce que je supposais ;
- **sur les données de N6r4, l'ordre des pertes suit celui des matchs**,
  pour les cinq réseaux déjà jugés : du plus bas au plus haut, N9pfbs800
  et N9l32ks800 (au-dessus de zéro au point), N9y8s800, N9l8ks800,
  N9pfhs800 (les trois sous zéro). Sur une seule recette, des réglages
  d'optimisation — pas, lot, filtre —, où rien d'autre ne change.
  **Ce n'est pas la règle du dépôt qui tombe** : un écart de perte ne
  vaut pas un match (`CLAUDE.md`, « cette valeur d'évaluation est
  meilleure ») — N9p25s800, à +0,00036, jouait +0,84 —, et cinq points
  rangés au hasard le sont une fois sur 120 ;
- **une prédiction, écrite avant le verdict de N9y24s800** — <span>inférence,
  confiance faible</span> : sur les données de N6r4, sa perte (+0,000034
  et +0,000041) le range entre N9y8s800 (+0,000015, +0,000028) et
  N9l8ks800 (+0,000055, +0,000066) ; si l'ordre tient, son match tombe
  **entre −5,4 et −3,8** — sous l'attendu de la séance (−4 à +3), en
  partie. Sur les données de N5l, il est le plus bas des six (−0,000016) :
  les deux colonnes ne le rangent pas au même endroit, et c'est celle de
  N6r4, l'étiqueteur des données apprises, que la prédiction suit. *Une
  première version de ce paragraphe le rangeait entre N9l32ks800 et
  N9y8s800 — lu de travers, corrigé à la minute, avant tout verdict.*

**N9y24s800 — VERDICT, le 29 oct. à 9 h 32 : −4,37 ± 3,37, régression
démontrée de peu, pas candidat ; la prédiction tenue.** Quatre jobs finis
ENTIERS entre 9 h 22 et 9 h 31, 6,37 à 6,57 s par partie, zéro perte au
temps, aucun coup illégal, aucun moteur perdu :

| job | Elo | Ptnml(0-2) | runner, nœuds/s au banc, profondeur en 250 ms |
|---|---|---|---|
| 40811845695 | −12,41 ± 6,68 | 37, 290, 838, 206, 29 | EPYC 7763, 1 036 642, 14 |
| 40811852993 | −4,72 ± 6,88 | 36, 286, 783, 270, 25 | EPYC 9V74, 1 025 759, 14 |
| 40811860221 | −0,12 ± 6,72 | 36, 247, 826, 264, 27 | EPYC 7763, 1 052 011, 14 |
| 40811867416 | −0,25 ± 6,68 | 28, 270, 802, 276, 24 | EPYC 7763, 1 058 064, 14 |
| **en commun, 11 200 parties** | **−4,37 ± 3,37** | homogènes, p = 0,054 — au ras du seuil | |

- **sous l'attendu de la séance** (−4 à +3), de peu ; la borne haute,
  −1,00, sous zéro : **régression démontrée, de peu** ; pas candidat ;
- **la prédiction écrite avant, −5,4 à −3,8, tient** : le point y tombe.
  Et l'ordre des pertes sur les données de N6r4 est **exactement** celui
  des six matchs — N9l32ks800 (+2,30), N9pfbs800 (+1,40), N9y8s800
  (−3,78), N9y24s800 (−4,37), N9l8ks800 (−5,43), N9pfhs800 (−13,13) ;
  six points rangés au hasard le sont une fois sur 720. <span>Inférence,
  confiance moyenne</span> : **sur des réglages d'optimisation à perte et
  données fixées** — pas, lot, filtre —, la perte tenue à l'écart sur les
  données de l'étiqueteur range les réseaux comme les matchs. Pas
  au-delà : N9p25s800, qui minimise une autre perte, s'en écarte
  (+0,00036 et +0,84 en match), et les trois poids de C2, que l'outil lit
  sous 0,75, ne se rangent pas (à ±0,00003, sous le bruit des matchs).
  **Un écran pour ordonner les matchs, pas un verdict** — la règle du
  dépôt tient (`CLAUDE.md`, « cette valeur d'évaluation est
  meilleure ») ; le prochain test de l'idée : les réseaux de C3, leurs
  pertes écrites avant leurs matchs ;
- l'axe du premier demi-coup, lu des deux côtés : 8 → −3,78, 24 → −4,37,
  **les deux coûtent** ; 16 reste ;
- les avertissements de l'arbitre, lus : « PV continues after
  fifty-move rule » et cinq « … after threefold repetition », 5 à 10 par
  job, des deux côtés (19 côté candidat, 15 côté référence) — le même
  code de recherche.

**C2c — CLOSE le 29 oct. : aucun des six ne gagne, la recette reste
celle de N9w50s800.** Avec C2, **dix réglages de la recette mesurés à 800
superlots contre N9w50s800, aucun gain** : les poids 0,625 et 0,75,
l'exposant 2,5, le poids variable, le pas final × 0,1 et × 10, le lot
8 192 et 32 768, le premier demi-coup 8 et 24 ; trois régressions
démontrées (pas final × 10, demi-coups 8 et 24), un match hétérogène (lot
8 192). <span>Inférence, confiance moyenne</span> : au volume et aux
passes d'aujourd'hui, les défauts de bullet — le poids du résultat mis à
part — sont à quelques Elo de leur optimum ; les réglages restent au
registre, déprioritisés. **Ce qui suit** : la séance du n° 22 (le budget
de l'étiqueteur et le tour de boucle), puis **C3 sur la recette de
N9w50s800**, ses données fixées par `tools/c3-donnees.tsv` au verdict du
n° 22 ; les deux à la carte de Théo, la semaine du 2 nov.

**La veille en fin de séance — l'option `veille`, écrite le 27 oct. à
8 h 48.** Théo : « *est ce que c'est possible de mettre dans un script sh
une mise en veille forcée en fin de séance ?* ». `bash
tools/seance-n20d.sh c veille` : la veille s'arme une fois l'essai court
réussi — un arrêt pendant les contrôles se lit à l'écran et ne met rien
en veille —, puis se demande à la sortie, réussie ou non, **après la
levée du blocage de veille que la séance pose elle-même** : tant qu'il
tient, `systemctl suspend` serait refusé. Au départ, la séance demande à
logind si la veille se fera sans mot de passe (`CanSuspend`, « yes ») ;
sinon elle le dit et va au bout quand même. *Éprouvée au bac à sable*,
`systemd-inhibit`, `busctl` et `systemctl` factices : `c1 veille` — la
veille demandée, le blocage déjà levé, vérifié par son PID ; sans
l'option, aucun appel ; `essai veille`, aucun ; un essai en panne,
aucun ; logind qui répondrait « challenge » — l'avertissement, puis la
séance entière ; un second argument inconnu, refusé. Une première
lecture disait le blocage vivant au moment de la veille : la sonde
comptait par `pgrep -f`, qui trouvait aussi ma propre ligne de
commande — refaite par le PID, elle le dit levé.

**La composition de C2, pas oubliée** : elle ne s'entraîne que si
plusieurs réglages démontrent un gain. À l'écriture de C2c, trois sur
quatre sont mesurés et aucun ne gagne ; seul N9w25a75s800 reste en vol.
Il n'y a donc rien à composer aujourd'hui. Si N9w25a75s800 gagne, il
embarque seul ; sa composition avec un gagnant de C2c s'écrira au
verdict de C2c.

#### La séance C3 — le chiffrage, le 27 oct. à 13 h 36, avant de l'écrire

Pour la semaine du 2 nov., la carte de Théo revenant (« La séance C2c »,
la dernière de la semaine). **Lu dans le code, pas supposé :**
- **l'entraîneur lit l'architecture dans les constantes du moteur** —
  `tools/nnue-train` importe `HIDDEN` et `ARCH` de `shallowred::nnue`, et
  nomme ses sorties `768x4hm-256-s8` d'après elles. Un réseau de 384 ou
  512 unités, ou à dix seaux de roi, ne s'entraîne donc qu'**à un commit
  du moteur qui porte ces constantes** : la séance de C3 bâtit
  l'entraîneur dans un `git worktree` par architecture, au commit de
  chacune — jamais en éditant le dépôt pendant qu'elle tourne ;
- **le moteur tient une autre largeur sans réécriture** : `HIDDEN` est
  une seule constante, l'accumulateur et ses mises à jour s'en déduisent,
  le produit scalaire AVX2 traite des registres de seize `i16` — 384 et
  512 en sont des multiples —, et il se somme par tranches de 256 termes
  en `i64`, si bien qu'aucune largeur ne déborde (n° 17, étape 1) ;
- **un test l'arrête, exprès** : la taille de fichier attendue est
  écrite à la main pour 128 et 256 unités, et toute autre largeur fait
  `panic!` — « une autre largeur demande son calcul à la main ». Le
  calcul : `2 × (768 × B × H + H + 8 × (2H + 1))` octets, bourré au
  multiple de 64, B le nombre de blocs de roi — à faire à la main pour
  chaque architecture de C3, et à confronter au fichier que bullet écrit ;
- **la confrontation au CODE de bullet** existe déjà pour les deux
  dispositions de roi (`les_seaux_du_moteur_sont_ceux_de_bullet`) ; une
  largeur ne change pas les entrées.

**Fait le 27 oct. à 14 h 05, la CI de la PR #227 en cours** : le test de
taille porte désormais 384 et 512 unités, calculés à la main —
592 192 et 789 568 octets bourrés —, la formule ayant d'abord été
retrouvée sur deux fichiers que bullet a écrits : N9w50s800 (quatre seaux,
1 581 632 octets) et N6r10 (dix, 3 940 928). **Éprouvé dans un worktree
jetable, `main` plus la seule constante changée** : à 384 unités, à 512,
et à dix seaux de roi, les 21 tests de `nnue::` passent sauf un,
`le_reseau_embarque_evalue_comme_son_entraineur` — attendu, le réseau
embarqué ayant 256 unités et quatre seaux ; c'est le candidat qui
l'embarquera qui le fera repasser. Et `tools/nnue-train` se construit
`--locked` à 512 unités ET dix seaux, contre le runtime factice de bullet,
en 31 s, ses 14 tests verts. <s>Les commits d'architecture se font au `main`
de la séance, pour porter les options de l'entraîneur de ce jour-là.</s>
**Plus de commit d'architecture** (écrit le même soir) : la séance dérive
chaque architecture du `main` de son départ, une ligne changée dans un
worktree — « La séance C3, l'outillage » ; c'est le candidat qui
l'embarquera qui en fera un commit.

**Les réseaux, et pourquoi une base.** C3 change l'architecture ET le
volume — la tranche du n° 21 (1,75 G gardées, N8tw50s800) et la partie
mesurée du n° 22 s'ajoutent aux 3,71 G de N9w50s800. Sans base, le volume
et l'architecture se mêleraient comme pour N9w50s800 (trois causes). D'où
**une base à 256 unités et quatre seaux sur les mêmes données**, contre
laquelle chaque architecture se mesure :
- **N10** — la recette de N9w50s800, 256 unités, sur toutes les
  données : ~5 h 15 de carte à 800 superlots ;
- **N10h384**, **N10h512** — 384 et 512 unités : ~7 h 30 et ~10 h,
  <span>inférence, confiance faible</span> : le coût d'un superlot suit
  la couche cachée, ×1,5 et ×2 ;
- **N10r10** — dix seaux de roi : ~5 h 15.
~28 h de carte, en deux séances. Chacun avec **ses nœuds par seconde**
au rejeu, et 384 ou 512 rachètent leur lenteur par l'étalon du temps
(n° 17 : N5l, à 256 unités, rendait ×0,90 de nœuds par seconde contre N4 à 128).

**Ce qui reste à décider avant de l'écrire** :
- **les données** — avec le n° 22 ou sans, et à quel budget : le verdict
  de E2.5t contre E5n le dit, et sa séance (~8 h, trois réseaux à 400
  superlots) passe d'abord. À 7,8 G et 800 superlots, chaque position
  serait vue ~10 fois au lieu de ~22 : les passes, qui payaient encore
  à 400 → 800 (+5,43), joueraient contre le volume. <span>Confiance
  faible</span> sur le sens ; la base N10 le mesure, à recette égale ;
- **le facteur des marges** (B8) se sonde pour chaque architecture
  gagnante, comme pour chaque réseau embarqué.

#### La séance C3, l'outillage — écrit le 27 oct. à 19 h 37, la décision des données en attente

**`tools/seance-c3.sh`**, sur le modèle de `tools/seance-n22.sh`, la
veille en option : **N10**, **N10r10**, **N10h384**, **N10h512** à la
recette de N9w50s800 — 800 superlots, poids 0,5, pas 0,001 —, en deux
modes de ~10 h 30 et ~17 h 30 (`a` : N10 puis N10r10 ; `b` : les deux
largeurs), ou `tout`. Chacun poussé sur `reseau/c3`.

**L'architecture, sans commit ni dépôt édité.** L'entraîneur lit `HIDDEN`
et `ARCH` dans le moteur ; la séance fixe donc `main` à son départ, et
bâtit chaque architecture autre que la base dans un `git worktree` à ce
`main`, sous `seances/c3/` — **une ligne** de `engine/src/nnue.rs`
remplacée, et `git diff --numstat` doit rendre exactement « 1 1
engine/src/nnue.rs », sans quoi rien ne part. L'entraîneur du worktree
tourne depuis `tools/nnue-train` du dépôt (`cargo run --manifest-path`,
la cible de compilation partagée, bullet bâti une fois) : ses sorties
tombent au même endroit que celles de la base. Le message de chaque
commit de `reseau/c3` porte le SHA de `main` et la substitution — de quoi
rebâtir l'entraîneur exact. Un worktree laissé à un autre `main` par une
séance précédente se refait.

**Ses contrôles** — ceux des séances C, plus deux : la ligne de recette
entière, et **la taille de chaque fichier, calculée à la main** —
1 581 632, 3 940 928, 2 372 416 et 3 163 200 octets ; un entraîneur bâti
sur le mauvais arbre écrirait un autre réseau, d'une autre taille et d'un
autre identifiant. **Deux essais courts** d'un superlot avant tout
réseau : la base, et N10h512, la plus éloignée d'elle.

**Les données ne sont pas dans le script** : il lit
`tools/c3-donnees.tsv` — génération, vagues, budget, une ligne par
ensemble — et refuse de partir sans lui. Le fichier s'écrit au verdict
de E2.5t contre E5n (« La séance du n° 22 »). Les comptes de la
relecture se somment sur les registres, colonnes trouvées par leur nom ;
la place se contrôle sur ce qui manque, × 1,15 l'artefact, plus 8 Go.

**Éprouvé au bac à sable le 27 oct.**, avec des `cargo`, `gh`, `df`,
`systemd-inhibit`, `busctl` et `systemctl` factices — le faux `cargo`
lisant `HIDDEN` et les seaux dans l'arbre dont on le bâtit, et écrivant
un fichier de la taille qu'ils donnent :
- une décision à n20, n21 et n22 (vagues 1 à 5, 5 000) : 94, 86 et 39
  jobs, `49520603:6210070070`, la somme refaite à part ; 876 `.vf` ;
- `tout veille` : les quatre bâtis chacun dans son arbre — 256 et quatre
  seaux, dix seaux, 384, 512 —, poussés, puis la veille, le blocage levé ;
  une relance qui saute tout ;
- un entraîneur bâti sur le dépôt au lieu du worktree : **refusé** à
  l'essai de N10h512, l'identifiant et la taille faux ;
- une panne au deuxième réseau, puis `main` avancé et la relance : le
  worktree refait au nouveau `main`, seul le réseau manquant refait ;
- la décision absente : refusé, rien de lancé ; trop peu de place : de
  même.

#### La séance C3, les données — l'option C, choisie par Théo le 6 nov. à 8 h

**La décision** — Théo : « *Ok pour C* ». Quatre options lui avaient été
posées au verdict du n° 22 (« La séance du n° 22 — E2.5v et E21 :
VERDICT ») :
- **A′** — n20, n20e, n21 et les vagues 1 à 5 du n° 22, aux deux
  budgets : 9,64 G positions, déjà sur sa machine ;
- **A″** — n21 et les vagues 1 à 5 : 5,9 G, déjà sur sa machine ;
- **B** — A′ et les vagues 6 à 21 : 20,5 G, 39,5 Go d'artefacts à
  télécharger ;
- **C — B sans n20 ni n20e**, sans les étiquettes de N6r4 : 16,8 G, les
  mêmes 39,5 Go. C'était l'option recommandée dans le récap, et c'est
  celle que Théo a retenue.

**Pourquoi sans N6r4** : à volume égal, l'étiquette d'un réseau plus fort
paie — N6r4 sur N5l +12,76, le tour de boucle +10,15 (E21). Et la moitié
étiquetée par N5l n'ajoutait rien à passes égales (+0,25 ± 4,71) ; à
superlots égaux, elle prenait des passes aux bonnes étiquettes (−5,18).
<span>Inférence, confiance moyenne</span> : les étiquettes de N6r4, deux
réseaux en arrière, feraient de même.

**`tools/c3-donnees.tsv`** : `n21 * *` et `n22 * *`, soit les 86 et 333
jobs appris. Les trois jobs tenus à l'écart (un du n° 21, deux du n° 22)
restent à la validation. En tout, **419 jobs, 141 284 632 parties et
16 809 185 651 positions** — c'est l'`--attendu` de l'entraîneur. Il y a
11,35 G positions gardées, donc les 800 superlots (80,0 G positions) font
**~7 passes**, contre 31 pour N9w50s800 : le même temps de carte, le
même nombre d'exemples vus (80 G), sur ~4,4 fois plus de positions
distinctes. Les passes se déduisent des superlots et du volume ; elles ne
coûtent rien par elles-mêmes.

**Corrigé le 8 nov., à la question de Théo** (« *pourquoi on fait plus
que 7 passes au lieu de 31 ?* »). La mise en garde écrite d'abord, « le
volume se paie en passes », s'appuyait sur 400 → 800 superlots (+5,43).
Elle confondait deux axes : ce +5,43 mesure deux fois plus de CALCUL sur
les mêmes données, pas moins de données au même calcul. À calcul égal, la
question est : plus de positions vues moins souvent, ou moins de
positions vues plus souvent. Elle a été mesurée, et le volume a gagné
chaque fois :
- N6l contre N6m, à 100 superlots, ~6,4 passes contre ~13 — le régime de
  C3 — : **+7,32 ± 3,53** ;
- E5t contre E5vw50, à 400 superlots, ~26 passes contre ~51 :
  **+8,94 ± 3,32** ;
- N8tw50 contre N7p4w50, à 400 superlots : +7,38 ± 3,40, mêlé à
  l'étiqueteur.

La seule perte à calcul égal, −5,18, venait d'étiquettes plus faibles
(N5l) — ce que l'option C écarte. Le poids du résultat, le seul réglage de
la recette dont on sait qu'il compte, était déjà meilleur à 0,5 vers 6,4
passes (+11,79 contre 0,75). Les autres réglages (C2c) ont été mesurés à
31 passes, et leur optimum peut bouger un peu à 7 — <span>confiance
faible</span>, quelques Elo au plus : aucun n'a gagné d'un pas de chaque
côté.
<span>Inférence, confiance moyenne</span> : moins saturé, le réseau
gagnera probablement plus à 1 600 superlots qu'à 31 passes — une raison
d'avancer ce test, pas de retenir des données. La base N10 mesure
l'ensemble contre N9w50s800 : volume et étiqueteurs, mêlés.

**Éprouvé au bac à sable le 6 nov.**, sur un clone, avec `gh`, `df` et
`cargo` factices. Le dossier de données y était dans l'état où la séance
n° 22 l'a laissé : n21 entier, plus les 77 jobs appris des vagues 1 à 5.
- Les deux lignes sont lues : 86 et 333 jobs.
- 256 jobs sont téléchargés, aucun de ceux déjà présents.
- 1 676 `.vf`.
- L'entraîneur est appelé sur les 419 dossiers, avec `--attendu
  141284632:16809185651`.
- La place : 39 Go d'artefacts, donc **~54 Go libres exigés**
  (52 726 498 Kio, refusé à 52 000 000, accepté à 53 000 000). Ils
  s'ajoutent aux ~25 Go déjà présents.

**Le lecteur de bullet tient 1 676 fichiers** — lu dans son source au
commit épinglé (`viribinpack.rs`, `read_interleave`). Il compte d'abord
les parties de chaque fichier. Ensuite, il tire un fichier au hasard,
pondéré par ce qui lui reste, l'ouvre, y lit seize parties et le
referme : jamais plus d'un fichier ouvert à la fois.

**Ce qui change, c'est l'accès disque.** ~70 Go sont lus par blocs de
seize parties, à des points aléatoires. Aucun réseau n'en avait lu plus
de ~17 (N9w50s800, n20 et n20e). <span>Inférence, confiance
faible</span> : sans effet sur un SSD, un goulot sur un disque dur. La
séance n° 22 tenait ~24 s par superlot à 256 unités, soit ~5 h 15 pour
N10 à 800 superlots. Un N10 nettement plus long désignerait le disque.

#### C3 — N10 et N10r10 : VERDICT, relevé le 9 nov. à 6 h 50 — la base bat N9w50s800, dix seaux de roi passent devant

**La séance, mode `a`**, lancée par Théo le 8 nov. : N10 et N10r10 poussés
sur `reseau/c3`, tous contrôles passés — confrontation (médian, maximal)
6 et 22, puis 3 et 10. Intégrés à `reseaux/` et écrits en candidats
révoqués aussitôt : N10 (`a1848b2`), N10r10 (`e547ce2`, la seule ligne
`KING_BUCKETS_10` en plus). Huit jobs de 2 800 parties à `8+0,08`, lancés
le 9 nov. à 1 h 37, finis entre 6 h 25 et 6 h 35, **aucune perte au
temps** :

| match | job | runner | n/s au banc | profondeur | Elo |
|---|---|---|---|---|---|
| N10 contre N9w50s800 | 42541131664 | Xeon 8573C | 1 310 226 | 14 | +12,41 ± 6,46 |
| | 42541134062 | EPYC 7763 | 1 061 171 | 14 | +8,07 ± 6,57 |
| | 42541136465 | EPYC 9V45 | 1 501 789 | 15 | +7,69 ± 6,12 |
| | 42541139034 | EPYC 7763 | 1 082 327 | 14 | +7,32 ± 6,43 |
| N10r10 contre N10 | 42541141712 | EPYC 9V74 | 1 048 318 | 14 | +15,52 ± 6,76 |
| | 42541144164 | Xeon 8573C | 1 198 950 | 14 | +11,05 ± 6,45 |
| | 42541146819 | Xeon 8573C | 1 393 642 | 14 | +21,49 ± 6,45 |
| | 42541149404 | Xeon 8573C | 1 155 898 | 14 | +11,05 ± 6,48 |

Pentanomiaux, dans l'ordre des jobs — N10 : 20, 217, 834, 301, 28 ; 23,
228, 846, 267, 36 ; 20, 209, 878, 275, 18 ; 20, 231, 849, 270, 30.
N10r10 : 22, 217, 820, 296, 45 ; 22, 217, 837, 298, 26 ; 14, 195, 831,
324, 36 ; 22, 217, 841, 290, 30.

- **N10 contre N9w50s800 : +8,87 ± 3,20**, homogènes (p = 0,692), les
  quatre bornes basses au-dessus de zéro. **Sous l'attendu** (+10 à +25),
  de peu. Le volume et les meilleurs étiqueteurs paient à calcul égal,
  moins que leur somme ne le promettait : <span>inférence, confiance
  faible</span> — les deux effets se recouvrent, ou le régime de ~7 passes
  en garde une part pour 1 600 superlots ;
- **N10r10 contre N10 : +14,77 ± 3,27**, homogènes (p = 0,111), les quatre
  bornes basses au-dessus de zéro. **Au-dessus de l'attendu** (−3 à +10).
  Les seaux de roi suivent le volume, comme le n° 18 le laissait voir :
  ~−75 à 159 M positions, +0,34 à 1,56 G, +14,77 à 11,35 G gardées. **Dix
  seaux remplacent quatre** ; **seize seaux entrent au registre**, comme
  écrit ;
- **par la chaîne, N10r10 contre N9w50s800 : ~+23,6 ± 4,6** —
  <span>inférence, deux intervalles composés</span>.

**Le critère, écrit avant** : le réseau embarqué est le meilleur de C3 dont
la borne basse contre N9w50s800 est au-dessus de zéro. **N10r10 en tête,
la décision attend le mode `b`** — N10h384 et N10h512, sur la carte de
Théo, chacun mesuré contre N10. Si une largeur paie aussi, sa composition
avec dix seaux demande un réseau de plus ; sinon N10r10 s'embarque, avec
sa sonde des marges et sa série C13, à 3190.

**L'outil des candidats — `tools/candidat-reseau.py`, rangé au dépôt le
11 nov.** Il vivait dans le conteneur de la session depuis le n° 22, et un
changement de session l'aurait effacé. `python3 tools/candidat-reseau.py
<dépôt> <base> "<doc>" [largeur=N] [seaux=10]` : le réseau de
`reseaux/<base>.bin` devient l'embarqué. Le bloc de doc d'`EMBEDDED` est
remplacé, et la table `CONFRONTATION` est recopiée de la section « 3. Le
moteur contre l'entraîneur » de sa sortie. L'outil refuse si cette section
n'a pas ses 18 lignes, ou si son critère n'est pas tenu. `largeur` et
`seaux` changent les deux lignes d'architecture, chacune exactement une
fois. Ensuite : `cargo fmt`, les tests `nnue` en release, commit, révocation.
Éprouvé le 11 nov. sur N10h512 avec `largeur=512 seaux=10`.

#### C3 — N10h384 et N10h512 : VERDICT, relevé le 10 nov. à 3 h 50 — la largeur paie, nettement

**La séance, mode `b`**, lancée par Théo le 9 nov. : N10h384 et N10h512
poussés sur `reseau/c3`, tous contrôles passés — confrontation (médian,
maximal) 6 et 25, puis 5 et 17. Durées d'entraînement lues dans leurs
sorties : 8 h 29 et 12 h 02, contre 5 h 08 pour N10 et 6 h 55 pour
N10r10. Intégrés à `reseaux/` et écrits en candidats révoqués aussitôt :
N10h384 (`1844dbe`), N10h512 (`745d569`), la seule ligne `HIDDEN` en plus,
le code du moteur identique à celui de N10. Huit jobs de 2 800 parties à
`8+0,08` contre N10 (`a1848b2`), lancés le 9 nov. à 22 h 18, finis le 10
entre 3 h 07 et 3 h 15, **aucune perte au temps** :

| match | job | runner | n/s au banc | profondeur | Elo |
|---|---|---|---|---|---|
| N10h384 contre N10 | 42701276865 | EPYC 9V74 | 1 057 798 | 13 | +25,11 ± 6,66 |
| | 42701283274 | EPYC 9V74 | 1 339 268 | 14 | +29,35 ± 6,46 |
| | 42701288421 | EPYC 7763 | 1 051 385 | 14 | +22,74 ± 6,57 |
| | 42701293446 | Xeon 6973P-C | 1 457 978 | 14 | +22,24 ± 6,31 |
| N10h512 contre N10 | 42701298239 | EPYC 7763 | 1 060 815 | 13 | +31,48 ± 6,60 |
| | 42701305223 | Xeon 8573C | 1 158 315 | 14 | +29,48 ± 6,65 |
| | 42701310029 | EPYC 9V45 | 1 489 853 | 15 | +34,61 ± 6,44 |
| | 42701315590 | EPYC 7763 | 1 030 325 | 13 | +34,73 ± 6,69 |

Pentanomiaux, dans l'ordre des jobs — N10h384 : 17, 186, 822, 328, 47 ;
11, 170, 838, 334, 47 ; 17, 190, 827, 325, 41 ; 14, 180, 853, 319, 34.
N10h512 : 13, 168, 823, 345, 51 ; 13, 179, 818, 338, 52 ; 5, 165, 829,
349, 52 ; 12, 165, 813, 352, 58.

- **N10h384 contre N10 : +24,86 ± 3,25** et **N10h512 contre N10 :
  +32,57 ± 3,30**, homogènes, les huit bornes basses au-dessus de +15.
  **Bien au-dessus des attendus** (−5 à +12 et −8 à +15) : j'avais
  compté le coût en vitesse d'après 128 → 256 à 159 M positions. À
  11,35 G gardées, la largeur rapporte bien plus qu'elle ne coûte. *La
  largeur demandait le volume, comme les seaux de roi.*
- **Par différence, 384 → 512 : ~+7,7 ± 4,6** — <span>inférence, deux
  intervalles composés</span>. Le gain décroît : 256 → 384 en rend trois
  fois plus. Les avertissements « PV continues » sont rares et viennent
  des deux camps : la signature connue.
- **Par la chaîne, contre N9w50s800** : N10h512 ~+41,4 ± 4,6, N10h384
  ~+33,7 ± 4,6, N10r10 ~+23,6 ± 4,6 — <span>inférence</span>.

**Le critère, écrit avant** : « si une largeur paie, sa composition avec
dix seaux de roi demande un réseau de plus, sur la carte de Théo, avant
d'embarquer ». **512 paie, et dix seaux aussi : N10r10h512**, les deux
ensemble. Son mode est ajouté à `tools/seance-c3.sh` (`c`) : deux lignes
changées dans le worktree, et le contrôle exige exactement deux. Sa taille
est calculée à la main — 2 × (768 × 10 × 512 + 512 + 8 × 1 025) =
7 881 744 octets, 7 881 792 bourrés —, la formule retrouvée sur N10r10 et
N10h512, que bullet a écrits. **Éprouvé au bac à sable le 10 nov.**, avec
un faux entraîneur qui lit `HIDDEN` et les seaux dans l'arbre dont on le
bâtit : les deux essais (n10, n10r10h512), le réseau à la bonne taille,
poussé avec ses deux substitutions dans le message. <span>Inférence,
confiance moyenne</span> : ~16 h de carte, 12 h × 1,35 (le surcoût des
dix seaux à 256 unités).

**Ensuite** : N10r10h512 contre N10h512 — les dix seaux paient-ils encore
à 512 ? Attendu, écrit avant — <span>inférence, confiance faible</span> :
**+3 à +18, ~+10**, les seaux suivant le volume comme à 256 (+14,77). Le
meilleur des deux s'embarque, avec sa sonde des marges, sa série C13 à
3190 et la première série contre les moteurs classés. **La largeur reste
ouverte** : 768 ou 1 024 au registre, après l'embarquement — le gain
décroît (+7,7 de 384 à 512) et chaque pas de largeur double presque la
durée d'entraînement.

#### (a) et (d) — la séance, écrite le 19 oct. à 20 h 14, avant de la demander

Théo, le 19 oct. au soir : « *je suis prêt* ». La séance A d'abord, telle
qu'écrite le 17 ; puis, dans le même terminal, quatre réseaux de
l'architecture de N6r4, au `main` du 19 oct. — `2a8cca1` y a mis `--pas`
et `--wdl`. **N6r4 est le témoin des deux axes**, sans rien
ré-entraîner : chaque réseau ne diffère de lui que par ce qu'on mesure.

**(a) — le réglage fin sur Leela.** Depuis le point de sauvegarde de
N6r4 (`n6r4/shallowred-768x4hm-256-s8-100`, `optimiser_state` compris),
le binpack seul, **20 superlots** — 2,0 G positions vues, ~0,4 à 0,6
passe sur les ~3,4 à 5,1 G que le filtre y garde —, à deux pas :
- **N6r4La, `--pas 0.0001`** — un dixième du pas de N6r4 : le pas qu'avait
  sa propre décroissance vers son 80ᵉ superlot sur 100, donc ses derniers
  20 % refaits sur Leela ;
- **N6r4Lb, `--pas 0.00002`** — cinq fois moins : le bas de la fourchette,
  si le premier efface encore trop de son point de départ.

Le pas est l'inconnue : au pas plein, N2L et N4L finissaient à la perte
de L0, le point de départ effacé (« Leela, à rouvrir ? ») ; trop bas, rien
ne bouge. Deux pas encadrent ; la durée reste fixe. *Le binpack se lit à
son échelle* (330,3 dans la cible) : la sigmoïde de la cible porte la même
espérance que la nôtre à 400, donc le logit du réseau garde son sens et
le moteur le lit à 400 — comme N2L et N4L, embarqués à cette recette.

**(d) — le poids du résultat dans la cible.** La recette de N6r4 à
l'identique — les 79 jobs du n° 18, 100 superlots, depuis zéro — au seul
`--wdl` près : **N6r4w50 à 0,5 et N6r4w25 à 0,25** ; N6r4 est le témoin à
0,75. Deux pas égaux vers le bas, parce que le défaut vient de l'exemple
de bullet et n'a jamais été mesuré ici ; le sens de la pente n'est pas
connu.

*Attendus* — <span>inférence, confiance faible</span> :
- **N6r4La contre N6r4 : −15 à +10**, ~−2 — l'étage de Leela a rendu +16
  sur N2 puis −5 sur N4, à mesure que nos données s'amélioraient ; celles
  de N6r4 le sont encore, mais un réglage fin garde plus de son point de
  départ qu'un ré-entraînement ;
- **N6r4Lb contre N6r4 : −6 à +6**, ~0 — il bouge moins ;
- **perte tenue à l'écart** (38531414161, `nnue_validation.rs`) : N6r4 ≤
  N6r4Lb ≤ N6r4La — le réglage tire vers la distribution de Leela,
  d'autant plus que le pas est grand. <span>Confiance moyenne</span> ;
- **N6r4w50 contre N6r4 : −8 à +12, N6r4w25 : −12 à +15** — ni le sens
  ni l'ordre ne sont connus ; leur perte tenue à l'écart, lue sous 0,75,
  au-dessus de N6r4 : ils minimisent une autre cible, et elle ne dira
  rien de leur force.

**Le critère d'embarquement, écrit avant** : celui du n° 17, contre
N6r4 — un gain démontré, borne basse au-dessus de zéro ; parmi les gains
démontrés, le meilleur au point, et un match direct si l'intervalle du
second recoupe le sien. **Chaque axe se lit à part** : deux gains
démontrés sur deux axes — des passes (étape A), Leela, le poids du
résultat — se composent dans un réseau neuf, mesuré à son tour ; jamais
leurs Elo ne s'additionnent sur le papier. Un réglage fin qui paie se
refait sur le réseau qui joue alors, s'il a changé.

*Ce qui suit, écrit avant* : pour chacun, la confrontation recopiée, le
candidat révoqué aussitôt, la sonde de B8, ses nœuds par seconde, sa
perte tenue à l'écart ; puis **quatre jobs de 2 800 parties à `8+0,08`
contre N6r4**, seize en tout. Avec les douze de l'étape A et les seize de
la génération, les jobs au-delà de la limite de concurrence du compte
attendent leur tour dans la file de GitHub.

**Les commandes** — après « `FIN : 0` » et le rapport de la séance A, dans
le même terminal : `$TOUS`, CUDA et `pipefail` y sont déjà posés.
Dans un terminal neuf, les blocs 0 à 2 de la séance A d'abord.

0. **le dépôt, le binpack, le point de départ** :
   ```sh
   cd ~/chess && git switch main && git log -1 --format='%h %cd'
   DONNEES=~/leela
   find "$DONNEES" -name '*.binpack' -exec ls -l {} +
   ls -d tools/nnue-train/n6r4/shallowred-768x4hm-256-s8-100/optimiser_state
   echo $TOUS | wc -w
   ```
   — `git log` du 19 oct. 2026 ou d'après ; le binpack du levier 4,
   **14 366 468 016 octets** (s'il est dans un sous-dossier, `DONNEES` le
   désigne) ; `optimiser_state` présent ; **79**. Un seul écart :
   s'arrêter et le dire ;
1. **un essai court** — la reprise depuis N6r4 au pas réduit, l'échelle du
   binpack, la confrontation, sur une architecture à seaux :
   ```sh
   set -o pipefail
   cd ~/chess/tools/nnue-train &&
   cargo run --release --features cuda -- --depuis n6r4/shallowred-768x4hm-256-s8-100 \
     --pas 0.0001 --superlots 1 --sortie essai-n6r4l "$DONNEES" \
     2>&1 | tee essai-n6r4l.sortie.txt
   ```
   → `repart de n6r4/…`, `1 superlots, pas 0.0001 → 2.43…e-7, wdl 0.75`,
   puis `RÉSEAU PRÊT : essai-n6r4l/shallowred-768x4hm-256-s8-1/quantised.bin`.
   **Critère, écrit avant** : `échelle ajustée` **entre 250 et 450** — le
   même fichier rendait 282,1. Hors de là, ou sans `RÉSEAU PRÊT` :
   s'arrêter et m'envoyer la sortie ;
2. **les quatre réseaux, d'une traite** — un échec arrête la chaîne :
   ```sh
   cargo run --release --features cuda -- --depuis n6r4/shallowred-768x4hm-256-s8-100 \
     --pas 0.0001 --superlots 20 --sortie n6r4la "$DONNEES" 2>&1 | tee n6r4la.sortie.txt &&
   cargo run --release --features cuda -- --depuis n6r4/shallowred-768x4hm-256-s8-100 \
     --pas 0.00002 --superlots 20 --sortie n6r4lb "$DONNEES" 2>&1 | tee n6r4lb.sortie.txt &&
   cargo run --release --features cuda -- --attendu 18435764:2328546367 --superlots 100 \
     --wdl 0.5 --sortie n6r4w50 $TOUS 2>&1 | tee n6r4w50.sortie.txt &&
   cargo run --release --features cuda -- --attendu 18435764:2328546367 --superlots 100 \
     --wdl 0.25 --sortie n6r4w25 $TOUS 2>&1 | tee n6r4w25.sortie.txt
   echo "FIN : $?"
   ```
   → `RÉSEAU PRÊT :` `n6r4la/shallowred-768x4hm-256-s8-20`,
   `n6r4lb/…-20`, `n6r4w50/…-100`, `n6r4w25/…-100`, chacun suivi de
   `/quantised.bin`, et **`FIN : 0`**. *Durée* : ~9 min par réglage fin
   — 23,7 s par superlot pour N6r4, et le binpack en demandait 1,13 fois
   plus que nos données (N4L contre N4, n° 13) —, ~40 min par réseau de
   (d), relectures en plus : **~1 h 45**. Interrompue, la chaîne se reprend au réseau qui
   manque ;
3. **rapporter**, sur `reseau/n20-ad` :
   ```sh
   cd ~/chess && git switch -c reseau/n20-ad
   for c in n6r4la:768x4hm-256-s8-20 n6r4lb:768x4hm-256-s8-20 \
            n6r4w50:768x4hm-256-s8-100 n6r4w25:768x4hm-256-s8-100; do
     n=${c%%:*}; a=${c#*:}; d=tools/nnue-train/$n/shallowred-$a
     cp $d/quantised.bin reseaux/$n-$a.bin
     cp $d/log.txt reseaux/$n-$a.log.txt
     cp tools/nnue-train/$n.sortie.txt reseaux/$n-$a.sortie.txt
   done
   cp tools/nnue-train/essai-n6r4l.sortie.txt reseaux/
   git add reseaux/n6r4l* reseaux/n6r4w* reseaux/essai-n6r4l.sortie.txt
   git commit -m "Réseaux NNUE du n° 20, (a) et (d) : N6r4La et N6r4Lb, réglés sur Leela ; N6r4w50 et N6r4w25, le poids du résultat"
   git push -u origin reseau/n20-ad
   git switch main
   ```
   — douze fichiers et la sortie de l'essai.

**D'une traite et sans surveillance — `tools/seance-n20.sh`, écrit le
20 oct. au matin.** Théo : « *Je vais partir toute la journée […] tu peux
me faire un bloc de commandes (ou un fichier sh) qui fasse A, a et d,
vérifie que tout se soit bien passé et commite tout seul si c'est le
cas ?* ». Le script enchaîne les blocs ci-dessus et ceux de la séance A,
**mêmes commandes, mêmes valeurs**, et lit à la place de Théo ce que ces
blocs demandent de lire :
- **avant** : le dépôt sans fichier suivi modifié et `main` à jour ; les
  316 `.vf` des 79 jobs appris ; un seul binpack, de 14 366 468 016
  octets ; le point de départ de N6r4 avec son `optimiser_state` ; les
  trois bibliothèques de CUDA ; 4 Go libres. Un seul écart et rien ne
  part ;
- **l'essai court de (a) d'abord**, son critère d'échelle écrit avant
  (250 à 450) : s'il échoue, (a) ne part pas, (d) et A si ;
- **pour chaque réseau** : `RÉSEAU PRÊT` au bon chemin, `quantised.bin`
  non vide, la confrontation imprimée — l'entraîneur refuse lui-même au
  delà de 15 / 50, et une relecture qui ne tombe pas sur `--attendu` ;
  pour ceux de `main`, la recette imprimée (le pas, `wdl`) ; pour (a),
  la reprise depuis N6r4 et l'échelle ;
- **chaque étape qui passe ses contrôles est commitée et poussée seule**
  — `reseau/n20-ad` avec ceux de (a) et (d) qui passent, même si un
  voisin échoue, les deux axes se lisant à part ; `reseau/n20a` puis
  `reseau/n20a-points` (les quinze points comptés) seulement si les deux
  réseaux de A passent. Personne pour taper un mot de passe : un push qui
  en demanderait un échoue, et la branche reste commitée en local ;
- **relancé**, il reprend au réseau qui manque et saute ce qui est déjà
  poussé ; il bloque la mise en veille quand `systemd-inhibit` le permet,
  tourne sur une copie de lui-même hors du dépôt (`4a604ea` ne l'a pas) et
  rend le dépôt sur `main` en sortant, quoi qu'il arrive.

**L'ordre change, pas la mesure** : (a) et (d) d'abord, à `main` — l'essai
court y est déjà, et leurs réseaux, plus courts, arrivent ~2 h plus tôt —,
puis A à `4a604ea` : un seul aller-retour de commit au lieu de deux. Les
réseaux ne dépendent pas de l'ordre. *Éprouvé* avant de le donner, dans
un bac à sable — un faux `cargo` qui imprime ce qu'imprime l'entraîneur, de
fausses données aux bonnes tailles, un dépôt distant local : la séance
entière (les trois branches poussées, quinze points) ; une panne simulée
sur N6r4w25 (les trois autres poussés, A aussi, le code de sortie à 1),
puis la relance (N6r4w25 seul refait, ajouté à `reseau/n20-ad`, le reste
sauté) ; une échelle à 500 (l'essai refusé) ; deux binpacks (rien ne
part).

**La séance (a) et (d), RELEVÉE le 20 oct. à 11 h 50 — les quatre réseaux
conformes.** `tools/seance-n20.sh`, lancé par Théo à 8 h 11, les a poussés
sur `reseau/n20-ad` (`2332ee0`), intégrés par `0eca96a` ; l'étape A tourne
encore. Les sorties, relues ici :

| réseau | recette imprimée | confrontation, médian / maximal (admis 15 / 50) | échelle | entraînement | estimé |
|---|---|---|---|---|---|
| essai, 1 superlot | repart de N6r4 ; pas 0,0001, wdl 0,75 | 4 / 29 | 282,1 | — | — |
| **N6r4La** | repart de N6r4 ; 20 superlots, pas 0,0001 → 2,43·10⁻⁷, wdl 0,75 | 8 / 21 | 282,1 | 8 min 08 s | ~9 min |
| **N6r4Lb** | repart de N6r4 ; 20 superlots, pas 0,00002 → 4,86·10⁻⁸, wdl 0,75 | 4 / 12 | 282,1 | 8 min 11 s | ~9 |
| **N6r4w50** | relecture exacte ; 100 superlots, pas 0,001 → 2,43·10⁻⁶, wdl 0,5 | 5 / 26 | — | 39 min 31 s | ~40 |
| **N6r4w25** | relecture exacte ; 100 superlots, pas 0,001 → 2,43·10⁻⁶, wdl 0,25 | 7 / 18 | — | 40 min 15 s | ~40 |

- **les durées** : (d) au rythme de N6r4 (39 min 29 s) ; (a) à ~24,5 s
  par superlot, contre 23,7 sur nos données — le binpack n'en demande que
  × 1,03 ici, quand N4L en demandait × 1,13 à N4. Rien d'autre à lire ;
- **les réglages fins bougent les finales gagnées, même au petit pas.**
  Roi et pion contre roi (`8/8/8/4k3/8/8/4KP2/8 w`) : N6r4 420, **N6r4La
  116, N6r4Lb 133** ; une tour de moins (`6k1/5ppp/…/3R2K1 b`) : −2 255,
  −1 685, −1 840. Le pas divisé par cinq déplace ces scores presque
  autant : Adam avance d'environ un pas par lot quand le gradient garde son
  signe, et 122 000 lots y suffisent. <span>Inférence, confiance
  faible</span> : les cibles de Leela, converties d'une probabilité de
  gain, tassent les finales que nos étiquettes chiffrent en matériel ;
  aucune ne dit si le tassement coûte — les matchs le diront ;
- **le poids du résultat, sur les mêmes finales** : roi et pion contre
  roi 420 à wdl 0,75, **488 à 0,5, 525 à 0,25** — la cible suit davantage
  le score de l'étiqueteur à mesure que le résultat pèse moins ; roi et
  tour contre roi, 1 048, 956 et 841, dans l'autre sens. Aucun ordre
  simple : la pente du score à la cible n'est pas celle du résultat.

*Intégrés le 20 oct., entre 12 h 00 et 12 h 10* — chacun ne change, sur `0eca96a`, que
`engine/src/nnue.rs` : le chemin d'`include_bytes!`, son commentaire et
la confrontation de son entraînement recopiée dans le test, aux
dix-huit positions — par un script qui retrouve chaque position par sa
FEN, éprouvé d'abord sur N6r4 lui-même (aucun écart) ; même architecture
que N6r4, au facteur des marges de `main`, 2,85 ; `verify.sh --rapide`
vert à chaque candidat, révoqué aussitôt, l'arbre revenu à `0eca96a` au
bit près :

| réseau | candidat | révoqué par |
|---|---|---|
| N6r4La | `89bb3e9` | `37f1bbd` |
| N6r4w50 | `0f5214b` | `d9ab8dd` |
| N6r4Lb | `739452f` | `cb343be` |
| N6r4w25 | `85c88a6` | `4ab82af` |

La référence des matchs : **`0eca96a`** — `main` et ces réseaux, N6r4
embarqué.

**La sonde de B8 et les nœuds par seconde — écrits le 20 oct. à 12 h 12,
avant de les lancer.** Le protocole du n° 18 tel quel (ses scripts,
`n18/sonde.sh` et `n18/nps.sh` au carnet, rejoués) : 40 parties de chaque
candidat contre lui-même à `8+0,08`, `-srand 20260930`, le livre du
dépôt, le binaire sondé étant le candidat plus `b8-sonde-marges.patch`,
la faite main celle du 12 oct. ; **dans 2,14 à 3,56, le réseau se mesure
au facteur de `main`, 2,85**, hors de là son facteur d'abord. Puis le
rejeu du n° 15, `--nps`, binaires AVX2, dix tours, contre N6r4 (`0eca96a`).
*Attendus* — <span>inférence, confiance faible</span> :
- **N6r4La 2,3 à 3,2, N6r4Lb 2,3 à 2,9** — N6r4 mesurait 2,49 ; les
  réseaux de Leela portaient des nombres 12 à 25 % plus grands que N2
  (2,60 et 2,61 contre 2,24), mais ceux-ci repartent de N6r4 et le
  tassement des finales dit le contraire : le sens n'est pas connu ;
- **N6r4w50 et N6r4w25, 2,2 à 3,2**, sans sens attendu ;
- **les quatre dans la plage** — aucun candidat ne change ;
- **nœuds par seconde, × 0,97 à × 1,04 contre N6r4**, sans sens attendu :
  même architecture, même code ; au n° 18, des poids différents ont rendu
  × 1,01 à × 1,04 à architecture égale, par l'arbre.

**La sonde de B8, RELEVÉE le 20 oct. à 12 h 33 — les quatre dans la
plage et dans leur attendu, tous mesurés au facteur de `main`, 2,85.**
Quatre binaires construits à 12 h 13, 40 parties chacun, finies entre
12 h 18 et 12 h 32 ; zéro perte au temps, zéro anomalie ; la rustine
s'applique et compile telle quelle ; la faite main, celle du 12 oct.
(0,40 % d'élagages delta fautifs, 4,1 % d'itérations hors de la première
fenêtre) :

| réseau | facteur delta | facteur aspiration | moyenne géométrique | hors fenêtre à δ = 25 | *attendu* | par la règle (2,14 à 3,56) |
|---|---|---|---|---|---|---|
| N6r4, le 17 oct. | × 3,1 | × 2,00 | 2,49 | 8,3 % | — | — le réseau de `main` |
| **N6r4La** | × 2,8 | × 2,40 | **2,59** | 10,4 % | 2,3 à 3,2 | dedans — 2,85 |
| **N6r4Lb** | × 3,4 | × 2,40 | **2,86** | 10,3 % | 2,3 à 2,9 | dedans — 2,85 |
| **N6r4w50** | × 2,7 | × 2,20 | **2,44** | 9,5 % | 2,2 à 3,2 | dedans — 2,85 |
| **N6r4w25** | × 3,4 | × 1,80 | **2,47** | 7,0 % | 2,2 à 3,2 | dedans — 2,85 |

- **les candidats ne changent pas** ; Lb au bord haut de son attendu ;
- **le réglage sur Leela bouge les scores d'une itération à l'autre** :
  10,3 et 10,4 % hors de la première fenêtre, contre 8,3 % pour N6r4 —
  l'aspiration y échoue un quart de fois plus, ce que dit aussi son
  facteur (× 2,40 contre × 2,00) ; **le poids du résultat les stabilise**,
  9,5 puis 7,0 % à mesure qu'il baisse. <span>Inférence, confiance
  faible</span> : une cible qui suit davantage le score de l'étiqueteur
  donne une évaluation plus lisse d'une profondeur à la suivante ;
- **le delta**, sur la grille de 0,1 sans rien entre 3,0 et 4,0 pour
  certains, ne départage rien de net.

**Leurs nœuds par seconde, RELEVÉS le 20 oct. à 12 h 48 — les quatre
dans l'attendu, aucun séparé de N6r4.** Le rejeu du n° 15, `--nps`, les
binaires AVX2 construits à 12 h 33, dix tours, la base N6r4 (`0eca96a`) à
27 312 684 nœuds par passe ; le conteneur sans autre charge :

| réseau | n/s contre N6r4, médiane des tours | tours plus lents | signes |
|---|---|---|---|
| **N6r4La** | × 0,987 | 6 / 10 | p = 0,75 |
| **N6r4Lb** | × 1,010 | 4 / 10 | p = 0,75 |
| **N6r4w50** | × 1,020 | 4 / 10 | p = 0,75 |
| **N6r4w25** | × 1,014 | 4 / 10 | p = 0,75 |

*Attendu* : × 0,97 à × 1,04, sans sens — tenu. Par l'étalon du temps,
± 2 % valent ± 3 Elo au plus : rien qui pèse sur les écarts attendus.

**Les matchs, lancés le 20 oct. à 12 h 33** — seize jobs de 2 800
parties à `8+0,08`, graine « auto » chacun, le binaire AVX2 des deux
côtés, tous démarrés aussitôt, contre **`0eca96a`** (N6r4) : N6r4La
39408732940, 39408736055, 39408739135, 39408741873 ; N6r4Lb 39408744693,
39408747673, 39408750838, 39408753851 ; N6r4w50 39408757801,
39408760808, 39408763781, 39408766522 ; N6r4w25 39408769776,
39408772645, 39408775372, 39408778493. Fin attendue vers 17 h 10–17 h 50
— les jobs du n° 18 finissaient en 4 h 55 à 5 h 15 —, au plus tard au
plafond de 350 minutes, 18 h 25. Critère et attendus : ceux de la
séance, écrits le 19 oct.

**La perte tenue à l'écart, RELEVÉE le 20 oct. à 12 h 18 — l'attendu de
(a) tient ; celui de (d) tombe pour N6r4w50.** Run 39406254639, l'outil à
`4ab82af`, lancé à 12 h 12, deux minutes. *Le contrôle d'abord* :
**17 208 872** et **17 938 594** positions, les chiffres du n° 18 ; N6r4
retombe sur sa perte du 17 oct. au chiffre près (0,038560). Écarts à N6r4
appariés, mêmes positions, sous la cible à 0,75 :

| réseau | tenu à l'écart — 38531414161 | écart à N6r4 | appris de tous — 38531424497 | écart à N6r4 | tenu − appris |
|---|---|---|---|---|---|
| N6r4, la référence | 0,038560 ± 0,000201 | — | 0,038148 | — | +0,000412 |
| **N6r4La** | 0,040511 | **+0,001951 ± 0,000064** | 0,040364 | +0,002216 | +0,000147 |
| **N6r4Lb** | 0,039986 | **+0,001426 ± 0,000052** | 0,039711 | +0,001563 | +0,000275 |
| **N6r4w50** | 0,038535 | **−0,000026 ± 0,000023** | 0,038225 | +0,000078 ± 0,000022 | +0,000310 |
| **N6r4w25** | 0,038882 | **+0,000322 ± 0,000033** | 0,038668 | +0,000520 | +0,000214 |

- **(a), l'attendu tient** : N6r4 < N6r4Lb < N6r4La — chacun à plus de
  vingt-cinq fois son intervalle au-dessus de N6r4, et 0,00052 entre les
  deux — : le réglage tire vers la distribution de Leela,
  d'autant plus que le pas est grand. Cinq fois moins de pas n'en retire
  qu'un quart : 0,00143 contre 0,00195 — ce que disaient déjà les finales
  de la confrontation. *Une perte ne dit pas la force* : sur nos
  positions, sous notre cible, Leela ne pouvait que coûter ; les matchs
  diront si ce qu'elle apporte ailleurs le rachète ;
- **(d), l'attendu tombe pour N6r4w50** : « au-dessus de N6r4 » — il est
  à **−0,000026 ± 0,000023** tenu à l'écart, indiscernable de N6r4 et
  plutôt dessous, quand il minimise une autre cible ; au-dessus, de
  +0,000078, sur le job appris. N6r4w25 tient l'attendu. Et **les deux
  retiennent moins que N6r4** — tenu − appris 0,000310 et 0,000214 contre
  0,000412. <span>Inférence, confiance faible</span> : le résultat d'une
  partie est la part BRUITÉE de la cible ; moins pesé, il s'apprend moins
  par cœur, et ce qu'on y perd en fidélité à 0,75 se rattrape en
  généralisation — jusqu'à 0,5, pas à 0,25 ;
- **ce que cela ne dit pas** : la force (`CLAUDE.md`, Texel), et pour (d)
  moins encore — la perte est lue sous une cible qui n'est pas la sienne.

#### (a) et (d) — VERDICT, 20 oct. 2026 : le poids du résultat paie — N6r4w50 +11,79 ± 3,52 et N6r4w25 +7,17 ± 3,49 contre N6r4 à `8+0,08`, un match direct les départage ; le réglage fin sur Leela ne paie pas — N6r4La −11,42 ± 3,73, N6r4Lb −2,45 ± 3,55

**Relevé le 20 oct. à 17 h 49.** Les seize jobs finis ENTIERS entre
17 h 32 et 17 h 46, 4 h 58 à 5 h 12 chacun, 6,39 à 6,68 s par partie ;
zéro perte au temps, zéro coup illégal, zéro moteur perdu, sur la totalité
des journaux. Contre `0eca96a` (N6r4), 2 800 parties par job :

| réseau | job 1 | job 2 | job 3 | job 4 | en commun, 11 200 parties | homogénéité | attendu, écrit avant |
|---|---|---|---|---|---|---|---|
| **N6r4w50** — `wdl` 0,5 | +12,41 | +13,16 | +8,94 | +12,66 | **+11,79 ± 3,52** | p = 0,835 | −8 à +12 — tenu, au bord |
| **N6r4w25** — `wdl` 0,25 | +9,06 | +5,21 | +7,57 | +6,83 | **+7,17 ± 3,49** | p = 0,864 | −12 à +15 — tenu |
| **N6r4Lb** — Leela, pas 2·10⁻⁵ | −1,12 | −3,47 | −1,86 | −3,35 | **−2,45 ± 3,55** | p = 0,966 | −6 à +6 — tenu |
| **N6r4La** — Leela, pas 10⁻⁴ | −12,29 | −15,77 | −7,82 | −9,81 | **−11,42 ± 3,73** | p = 0,450 | −15 à +10 — tenu |

Pentanomiaux, pour `tools/mettre-en-commun.sh` : N6r4w50 `37,226,795,284,58`
`25,235,792,305,43` `38,228,797,298,39` `35,207,829,279,50` ; N6r4w25
`25,248,800,283,44` `35,229,832,267,37` `31,249,799,270,51`
`41,238,793,281,47` ; N6r4Lb `42,260,797,267,34` `47,259,799,265,30`
`43,265,795,258,39` `42,290,764,261,43` ; N6r4La `66,293,747,262,32`
`63,307,753,248,29` `58,293,748,256,45` `57,299,756,242,46`.
*Étalonnages* : cinq EPYC 7763, quatre 9V74, quatre 9V45, deux Xeon
8573C, un Xeon 8370C — 0,99 à 3,15 M n/s au banc, profondeur 13 à 15 en
250 ms ; les quatre homogènes malgré ce mélange. *Avertissements* : « PV
continues after fifty-move rule » et « … after threefold repetition »,
68 côté N6r4 et 54 côté candidats sur 44 800 parties — la famille connue,
des deux côtés, rien de neuf.

- **(d), le poids du résultat paie, aux deux pas** : 0,5 et 0,25 battent
  0,75 chacun, borne basse au-dessus de zéro (+8,27 et +3,68). Le défaut
  de l'exemple de bullet, jamais mesuré ici, coûtait donc ~12 Elo à
  N6r4 (8 à 15). La pente n'est pas monotone au point — 0 à 0,75, +11,8 à
  0,5, +7,2 à 0,25 — et les deux intervalles se recoupent (+8,27 à
  +15,31 et +3,68 à +10,66) : **un match direct, par le critère, écrit
  plus bas** ;
- **affiner le poids au-delà ne paierait rien de mesurable** — la
  parabole par les trois points culmine vers 0,45, à +0,4 au-dessus de
  0,5. <span>Inférence, confiance faible</span> : chaque point porte
  ± 3,5 ; mais pour qu'un poids voisin rende un écart qu'un match sépare,
  ~4 Elo, il faudrait une courbe bien plus pointue que celle que les
  trois points dessinent. Le poids gagnant entre à la composition, sans
  point de plus ;
- **la perte tenue à l'écart n'a rien prédit de (d)** — N6r4w50, à la
  perte de N6r4, joue +11,8 ; N6r4w25, au-dessus, +7,2. L'attendu l'avait
  écrit — « elle ne dira rien de leur force », la cible n'étant pas la
  leur. *La règle de Texel* (`CLAUDE.md`), une fois de plus ;
- **(a), Leela en réglage fin régresse, d'autant plus que le pas est
  grand** : −11,42 démontré au pas 10⁻⁴, rien de démontré à 2·10⁻⁵ ; dans
  l'ordre de leur perte tenue à l'écart (N6r4 < Lb < La). Troisième
  verdict dans le même sens — +16,40 sur N2 (N2L), −5,43 sur N4 (N4 contre
  N4L), et maintenant −11,42 sur N6r4, en réglage fin et non plus en
  ré-entraînement : *à mesure que nos données s'améliorent, ce que Leela
  apprend au réseau lui coûte*. (a) se ferme : rien n'embarque. Reste
  (b), Leela mêlé à nos données depuis zéro, que ce verdict ne mesure
  pas — son attendu baisse ;
- **ce qui embarque** : rien encore — N6r4 joue jusqu'au verdict du
  match direct ; puis le gagnant de (d), sa confrontation déjà recopiée
  dans son candidat, au facteur de `main` (sa sonde dans la plage).
  **La séance B reste à 0,75**, telle qu'écrite : elle mesure l'axe des
  données contre N7p2 ou N7p4, entraînés à 0,75, et chaque axe se lit à
  part ; le poids gagnant entre à **la composition**, avec les gagnants
  de A et de B.

**Le match direct — N6r4w25 contre N6r4w50, écrit le 20 oct. à 17 h 49,
avant de le lancer.** Quatre jobs de 2 800 parties à `8+0,08`, graine
« auto » chacun, le binaire AVX2 des deux côtés : `85c88a6` (N6r4w25)
contre `0f5214b` (N6r4w50) — le même code au bit près, leur diff ne
touche que le réseau, sa documentation et sa confrontation —, le facteur
de `main` (2,85) des deux côtés. **Critère, écrit avant : N6r4w25
embarque si la borne basse de l'intervalle mis en commun est au-dessus de
zéro ; sinon N6r4w50** — le meilleur au point contre N6r4, à la même
vitesse (× 1,020 et × 1,014, non séparés) et à la même taille. La règle
du n° 13 : le second doit démontrer. *Attendu* — <span>inférence,
confiance faible</span> : **−10 à +3, ~−4** — la différence de leurs
écarts à N6r4, −4,62 ± 4,96, lue sans match direct. *Puissance dite
d'avance* : ± 3,5 — un vrai écart de 3 Elo ne passera pas la borne, et
c'est accepté : à égalité, le meilleur au point embarque. **Poussé à
17 h 54 (`4f54caa`), lancé à 17 h 55** : 39452745551, 39452754806,
39452763795, 39452773226 ; fin attendue vers 22 h 50–23 h 10, au plus
tard au plafond de 350 minutes, 23 h 45.

**Le match direct, RELEVÉ le 20 oct. à 23 h 13 — N6r4w50 reste le
représentant de (d).** Quatre jobs finis entiers entre 22 h 57 et
23 h 07, 6,46 à 6,66 s par partie, zéro perte au temps ; trois
processeurs — deux EPYC 7763 (1,99 M n/s, profondeur 14), un EPYC 9V45
(1,47 M, profondeur 16), un EPYC 9V74 (2,53 M, profondeur 14) :

| N6r4w25 contre N6r4w50 | Elo | pentanomial |
|---|---|---|
| job 1, 39452745551 | −3,85 ± 6,95 | 38, 278, 793, 259, 32 |
| job 2, 39452754806 | −1,36 ± 6,80 | 29, 276, 805, 257, 33 |
| job 3, 39452763795 | −1,49 ± 6,62 | 37, 234, 864, 234, 31 |
| job 4, 39452773226 | −5,09 ± 6,46 | 33, 257, 846, 246, 18 |
| **en commun, 11 200 parties** | **−2,95 ± 3,35** | homogènes, p = 0,864 |

- **le critère** : borne basse −6,30, sous zéro — **N6r4w25 n'embarque
  pas, N6r4w50 reste le représentant de (d)** ; il passe au match direct
  contre N7p4, entre les axes (« Étape A — VERDICT »), relève à 1 h 20 ;
- **l'attendu** (−10 à +3, ~−4) tenu, au point près : la différence de
  leurs écarts à N6r4 disait −4,62 ± 4,96, le match direct −2,95 ± 3,35 ;
- **le poids du résultat, par trois points** : 0,75 → 0,5 +11,79 ;
  0,75 → 0,25 +7,17 ; 0,25 contre 0,5 −2,95 en direct. *L'optimum est
  entre 0,25 et 0,75, plus près de 0,5* ; <span>inférence, confiance
  faible</span> : ce qu'il reste à gagner autour de 0,5 tient sous
  ~3 Elo, à 100 superlots — le registre garde ce réglage ouvert, à
  basse priorité, à remesurer à la recette finale ;
- avertissements : 3 à 12 « PV continues after fifty-move rule » ou
  « … threefold repetition » par job, des deux côtés — les mêmes qu'aux
  matchs contre N6r4.

### La file, phase 2 — le cache des recalculs : écrit le 20 oct. 2026, mesuré avant d'en écrire l'attendu

**Ce que c'est.** Avec des seaux de roi, chaque camp lit ses entrées dans
le bloc que choisit la case de son roi, retourné si ce roi est sur les
colonnes e à h (n° 17). Un coup de roi qui change de bloc change donc
TOUTES les entrées de son camp, et `apply_move` recalculait ce camp de
zéro : le biais, puis une ligne par pièce. Le cache — la « finny table »
des moteurs à seaux de roi — garde, pour chaque camp et chaque bloc, le
dernier accumulateur calculé dans ce bloc et les pièces qu'il compte ; un
franchissement repart de là, et seules les pièces qui diffèrent
s'ajoutent ou se retirent. L'arithmétique de l'accumulateur est
modulaire : l'ordre des lignes ne change rien, l'accumulateur est celui
du recalcul AU BIT PRÈS — donc l'arbre aussi, et la règle est celle d'une
optimisation pure : arbre identique, temps au rejeu, vingt tours, test
des signes ; pas de match.

**Écrit** dans `engine/src/nnue.rs` (`RefreshCache`,
`Network::refresh_cache`, `refresh_side_cached`) et branché dans
`Search` — un cache par fil, recréé avec le réseau. Neuf, chaque entrée
vaut l'échiquier vide : son premier emploi est un recalcul ordinaire, sans
cas particulier. *Les tests* : les deux tests d'incrément confrontent
chaque coup au recalcul avec UN cache qui sert d'une position à l'autre —
chaque bloc y repart de ce qu'une position sans rapport y a laissé ; et
`le_cache_ne_recompte_que_les_pieces_qui_ont_change` compte les lignes, des
deux côtés — 18 pour un bloc neuf, 0 pour la même position, 3 pour trois
pièces changées : le résultat seul ne distingue pas un cache servi d'un
cache ignoré. *Éprouvés* par trois fautes injectées : le cache ignoré
(le compte tombe), les pièces non retenues (trois tests tombent), deux
blocs confondus (les deux tests d'incrément tombent).

**Le mécanisme, mesuré d'abord** — une sonde jetable, des compteurs sur
le rejeu du corpus du n° 15 à la profondeur 10, une passe (le compte de
nœuds, 27 312 684, est celui de N6r4 au nœud près) :

| grandeur | valeur |
|---|---|
| coups dérivés (`apply_move`) | 26 088 385 — 0,955 par nœud |
| franchissements — un camp recalculé | **2 145 800 — 8,2 % des coups** |
| lignes d'un recalcul de zéro, au total | 31 803 924 — 14,8 par franchissement, le biais en plus |
| lignes repris du cache, au total | **11 017 332 — 5,1 par franchissement : −65 %** |

- **le franchissement n'est pas rare** : un coup sur douze. Le
  commentaire d'`apply_move` le disait « rare (n° 17) » ; le retournement
  aux colonnes d/e suffit, et le corpus, riche en finales, fait marcher
  les rois ;
- **ce que pèse un recalcul** : une mise à jour ordinaire fait UN passage
  sur les 256 valeurs par camp, deux par coup ; un recalcul en fait ~15,8
  pour un camp. À 8,2 % des coups, ~1,3 passage par coup en moyenne — de
  l'ordre des deux de la mise à jour : **les recalculs pèsent ~40 % de
  l'entretien des accumulateurs**, que le cache ramène à ~0,5.
  <span>Inférence, confiance moyenne</span> : des passages de même coût,
  ce qui ignore les lectures de lignes dispersées dans 1,5 Mo de poids.

*Attendu, écrit le 20 oct. à 12 h 55, avant de mesurer le temps* —
<span>inférence, confiance faible</span> : **−1 à −4 % de temps à arbre
identique**, ~−2 %. La part de l'entretien des accumulateurs dans le
temps d'un nœud n'est pas mesurée seule ; le n° 17 bornait le coût propre
des seaux de roi à ~4 à 7 % de vitesse, et le cache en retire la partie
« recalcul ». *Critère, écrit avant* : il entre s'il rend du temps à arbre
identique — plus rapide au test des signes, p < 0,05 sur vingt tours ;
sinon il reste à l'attic, sa mesure écrite.

**Le temps, RELEVÉ le 20 oct. à 13 h 04 — non démontré à son critère :
le cache va à l'attic** (`tools/attic/f2-cache-des-recalculs.patch`).
`main` (`0eca96a`, N6r4) contre le cache, binaires AVX2, vingt tours au
rejeu du corpus du n° 15, profondeur 10 ; **arbre identique** — 27 312 684
nœuds par passe des deux côtés, le pilote refusant sinon :

| | surcoût du cache, médiane des tours | étendue | plus lent | test des signes |
|---|---|---|---|---|
| cache contre `main` | **−1,2 %** | −8,6 à +6,8 % | 7 / 20 | p = 0,26 |

- **dans l'attendu au point** (−1 à −4 %), **pas séparé de zéro** : le
  critère écrit avant — p < 0,05 sur vingt tours — n'est pas atteint, et
  le cache n'entre pas ;
- **la faute est dans le critère, et elle se nomme** : l'écart apparié
  d'un tour à l'autre vaut **4,7 %** (écart-type des vingt différences),
  donc vingt tours ne résolvent qu'un effet de ~3 % — l'attendu, −1 à
  −4 %, tombait presque entier sous ce seuil. *Un critère de temps écrit
  sans sa puissance* : la règle « dire la puissance d'avance » vaut pour
  le temps comme pour l'Elo, et je ne l'ai pas appliquée. Le n° 16 passait
  avec vingt tours parce que son effet valait 14 % ;
- **ce que cela ne dit pas** : que le cache ne rapporte rien. Le
  mécanisme est mesuré — 65 % des lignes de recalcul épargnées, à 8,2 %
  des coups — et l'arbre identique.

**La remesure, écrite le 20 oct. à 13 h 06, avant de la lancer** — le
même pilote, les mêmes binaires, **120 tours** (~70 minutes), quand le
conteneur n'a rien d'autre à faire. *La puissance, d'avance* : à 4,7 % par
tour, le test des signes sur 120 tours — ~77 tours d'un test t, son
efficacité valant ~0,64 — détecte **−1,5 % à 80 %, −2 % à 97 %, −1 % à
~45 %**. *Critère* : le cache entre si le test des signes donne plus
rapide à p < 0,05 ; sinon il reste à l'attic **pour de bon** — une troisième
mesure demanderait un fait neuf, un instrument moins bruité par exemple,
pas plus de tours. Les vingt tours d'aujourd'hui ne s'y ajoutent pas.
**Lancée le 20 oct. à 13 h 15**, le conteneur sans autre charge — les
matchs tournent sur les runners.

**La remesure, RELEVÉE le 20 oct. à 14 h 26 — rien à prendre : le cache
reste à l'attic, pour de bon.** Cent vingt tours, arbre identique
(27 312 684 nœuds par passe des deux côtés) :

| | médiane des tours | moyenne, IC 95 % | plus lent | test des signes |
|---|---|---|---|---|
| cache contre `main` | **+0,2 %** | **+0,46 %, de −0,42 à +1,34** | 62 / 120 | p = 0,78 |

- **l'attendu est réfuté, pas seulement non atteint** : l'intervalle
  exclut tout gain au-delà de 0,42 %, quand l'attendu disait −1 à −4 %.
  La puissance écrite avant était là — 97 % à −2 % ; le bruit par tour,
  4,9 %, celui des vingt premiers ;
- **ce que le mécanisme ne disait pas** : il comptait des LIGNES — 65 %
  de moins sur les recalculs — et les convertissait en temps par
  « des passages de même coût », hypothèse que je savais fausse en
  l'écrivant (confiance moyenne). Un recalcul ajoute ses lignes dans un
  accumulateur qui reste en cache L1 ; ce qu'il paie, c'est de lire ces
  lignes, éparses dans 1,5 Mo de poids — et le cache lit aussi les
  siennes, plus son entrée de 512 octets parmi seize. <span>Inférence,
  confiance faible</span> : le recalcul était borné par la mémoire, pas
  par l'arithmétique, et le cache n'en retire qu'une partie, que son
  propre accès rend ;
- **la règle qui en sort** — *un compte d'opérations n'est pas un temps,
  même à arbre identique* — est celle de « le nombre de nœuds ne dit pas
  la force », un cran plus bas : il borne, il ne prédit pas. Le n° 15
  l'avait vue sous une autre forme (le doublement, un minorant).

### La file, phase 2 — le produit scalaire en AVX2 : écrit le 20 oct. 2026, le mécanisme lu au code machine

**Le mécanisme, lu avant d'écrire.** Le chemin A du n° 16 laissait le
compilateur vectoriser le produit scalaire de la sortie. Lu au code
machine du binaire AVX2 de `main` le 20 oct. : `Network::evaluate` fait
**396 instructions, toutes sur des registres de 128 bits** — 64
`vpmaddwd xmm`, 64 `vpmullw`, 64 `vpmaxsw`, 64 `vpminsw` —, quand
`apply_move` et `refresh_side`, eux, emploient les registres de 256 bits.
Le compilateur reconnaît la multiplication-addition par paires mais la
cale sur huit sommes `i32`, la moitié d'un registre AVX2. *Essayé d'abord
sans `unsafe`* : la même boucle réécrite par blocs de seize termes et huit
sommes partielles — le compilateur en sort 224 `vpinsrw`, pire.

**Écrit** (Théo, 20 oct. : `unsafe` admis pour ce seul usage) : un module
`avx2` dans `engine/src/nnue.rs`, `#[allow(unsafe_code)]`, la lint de
l'espace de travail passée de `forbid` à `deny` ; derrière
`is_x86_feature_detected!("avx2")` — une constante dans le binaire AVX2,
une lecture en cache dans celui de base, qui en profite donc sur un
processeur qui l'a ; les mêmes entiers que le calcul scalaire, sommés dans
un autre ordre — exact, aucune somme partielle ne pouvant déborder sous la
borne de [`DOT_CHUNK`]. Le scalaire reste, pour tout autre processeur et
comme définition. **Le code machine** : `evaluate` passe à 242
instructions, 32 `vpmaddwd ymm`. *Les tests* : la confrontation au calcul
scalaire sur 200 paires de vecteurs — longueurs 0 à 1 000, registres
pleins, reste, tranches, entrées dans toute la plage d'un `i16` —, et deux
comptes, des passages par AVX2 et des termes laissés au reste. *Éprouvés*
par cinq fautes injectées — la borne basse oubliée, le reste perdu, le
produit sur l'entrée non bornée, la détection forcée à faux, un registre
plein laissé au reste —, cinq attrapées ; la dernière ne change aucune
valeur, seul le compte du reste la voit.

*Attendu, écrit le 20 oct. à 15 h 05, avant de mesurer le temps* —
<span>inférence, confiance faible</span> : **−1 à −5 % de temps à arbre
identique**, ~−2,5 %. `evaluate` perd 154 instructions sur 396 ; sa part
du temps d'un nœud n'est pas mesurée seule depuis le n° 16 — la sortie
pesait 10 % par doublement avant lui (un minorant), et le n° 16 en a
retiré 14,4 %. *La leçon du cache, appliquée* : ce produit lit ~1 Ko
d'accumulateur et ~1 Ko de poids par camp, déjà en cache L1 — il est borné
par le calcul, là où le recalcul de l'accumulateur l'était par la mémoire.
*La mesure* : le rejeu du n° 15, binaires AVX2, **120 tours**, test des
signes — la puissance du cache, ~80 % à −1,5 %. *Critère* : il entre si le
test des signes donne plus rapide à p < 0,05 ; sinon il reste à l'attic.
Le binaire de base, qui ne lit l'AVX2 qu'à l'exécution, se vérifie par
`tools/binaires.sh` — le même arbre, par construction des valeurs.

**Le temps, mesuré de 15 h 05 à 16 h 13, relevé le 20 oct. à 17 h 40 — gain démontré, au bord haut de
l'attendu : le produit AVX2 ENTRE.** `main`
(`0eca96a`, N6r4) contre le produit AVX2, binaires AVX2, cent vingt tours
au rejeu du corpus du n° 15, profondeur 10 ; **arbre identique** —
27 312 684 nœuds par passe des deux côtés :

| | médiane des tours | moyenne, IC 95 % | plus lent | test des signes |
|---|---|---|---|---|
| AVX2 contre `main` | **−5,9 %** | **−5,09 %, de −6,07 à −4,11** | 20 / 120 | p < 0,0001 |

- **le critère est atteint**, et l'effet est au bord haut de l'attendu
  (−1 à −5 %) : l'intervalle entier est au-delà de −4 % ;
- **ce qu'il vaut** : × 1,054 de nœuds par seconde, soit 0,076
  doublement — **~+8 Elo par l'étalon du temps** (107,7 par doublement),
  la conversion que l'AVX2 du n° 10 avait vérifiée à 0,6 Elo près ;
- **la leçon du cache, confirmée dans l'autre sens** : 154 instructions
  sur 396 retirées d'une boucle qui ne lit que le cache L1 ont rendu ce
  que leur compte promettait ; les lignes du cache des recalculs, lues
  dans 1,5 Mo de poids, ne l'avaient pas fait. *Un compte d'opérations
  se traduit en temps quand les données sont déjà là* ;
- **le binaire de base** profite aussi du chemin AVX2 quand son processeur
  l'a — il le détecte à l'exécution —, et cherche le même arbre que le
  binaire AVX2 : c'est ce que `tools/binaires.sh` vérifie à chaque push.

**Le crible, lancé le 20 oct. à 17 h 44** — `mutation.yml` au commit
`e77e0b1`, run 39451211784. *Prédiction, écrite avant* : **163**, chaque
fichier à son plafond, `nnue.rs` compris (2) — chaque ligne du chemin AVX2
change une valeur que la confrontation au scalaire lit, ou un compte que
les deux tests lisent ; un pas de boucle faussé tourne sans fin, et
`cargo mutants` le compte expiré, donc attrapé. Un survivant s'y lirait
mutant par mutant avant de relever le plafond.

**Le job de `nnue.rs` a perdu son runner à 18 h 26**, au bout de
42 minutes — « *The runner has received a shutdown signal* » —, ses deux
seuls survivants déjà lus, ceux du plafond (130:30 et 408:50). C'est la
**troisième perte du même job en un jour** : le balayage du mardi l'avait
perdu à 6 h 22 et 12 h 33, au bout de 30 et 40 minutes, et son essai
réussi a duré 35 minutes, avec deux mutants expirés. Aucun autre fichier
n'a perdu de runner. *Une hypothèse, écartée sur un cas* : un mutant qui
alloue sans borne épuiserait la mémoire du runner avant son délai. Le plus
suspect, `Arch::values` (143:48) — `+` en `*`, un réseau × 256 —, est
attrapé en 8 s pour ~600 Mo de pic, mesuré dans le conteneur sous une
limite de 6 Go. La cause reste inconnue ; les deux mutants expirés,
qu'aucun résumé ne nomme, sont les suivants à regarder. **Relancé une fois
à la fin du run** ; la PR #206 ne fusionne qu'au crible conforme.

**Relancé à 22 h 06, perdu à 22 h 46 — et la cause trouvée.** Les deux
mêmes survivants, puis « *shutdown signal* » au bout de 40 minutes : la
quatrième perte du jour. Le journal de l'essai réussi du mardi nomme ses
deux expirés : **`Network::row` rendu par `Box::leak(Box::new([1;
HIDDEN]))` et `[-1; HIDDEN]`** — 512 octets perdus à chaque mise à jour
d'accumulateur. *Mesuré dans le conteneur*, au commit `e77e0b1` : le
premier monte à **13,4 Go résidents** en moins de 75 s, puis le noyau le
tue. Le délai de `cargo mutants` suit la durée de la suite saine sur le
runner : **21 s** à l'essai réussi — la fuite coupée à temps, comptée
« expirée » —, **75 s** au crible — deux tests à la fois vident les 16 Go,
le runner meurt. L'hypothèse mémoire était la bonne ; je l'avais écartée
sur un seul mutant, le mauvais. **Le remède, éprouvé** : chaque processus
de test sous `prlimit --as=4294967296` — le « runner » de cargo,
`CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_RUNNER`, la compilation non
plafonnée —, dans `mutation.yml` et `tools/mutants.sh`. Sous le plafond,
le même mutant meurt sur son allocation et compte **attrapé, en 6 s** ; la
suite saine passe sous 2 Gio et casse sous 1 ; un témoin à 1 Mo casse
aussi, le plafond s'applique donc bien. Le piège est archivé
(`tools/pieges-fermes.md`). *Ce que ça change à la prédiction* : les deux
expirés deviennent attrapés, les survivants restent 163.
**Le crible relancé à 22 h 56** sur la branche, au même commit
`e77e0b1` — le moteur n'a pas bougé depuis —, run 39496202305 : il éprouve
aussi le plafond sur chaque fichier, sur un vrai runner.

**Le crible, RELEVÉ le 21 oct. à 3 h 30 — CONFORME, exactement.**
Run 39496202305, dix jobs verts, le `Verdict` vert : **163 survivants**,
chaque fichier à son plafond. **`nnue.rs` : 2 survivants, 152 attrapés,
0 expiré** — les deux fuyards de `Network::row` attrapés sous le plafond
de 4 Gio, comme prédit, et le runner tenu, à la cinquième tentative du
job. `search.rs` : 48, 715 attrapés, 40 expirés, **274 minutes** (20 h 56
→ 1 h 30) — 261 au crible précédent, sans plafond de mémoire : le plafond
ne coûte rien de mesurable, mais **le fichier prend désormais 78 % de la
limite de 350 minutes**, où il en prenait 145 à 180 le 12 oct. ; un runner
deux fois plus lent le couperait. La PR #206 fusionnée à 3 h 31
(`473c54d`).

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
