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

D'où **deux arbitres indépendants** (ADR-0009) :

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

`tools/ref.sh <commit|branche|tag> [sortie]` construit une référence locale
comme `match.yml` le fait sur un runner : **un geste de quatre lignes où ce
dépôt a payé quatre pièges distincts**, chacun fermé par ce que le script
impose.

| ce que le script impose | le piège qu'il ferme |
|---|---|
| `git fetch --prune`, jamais `git fetch <remote> <branche>` | une référence de suivi survit à la suppression de sa branche après fusion et désigne le commit d'*avant* |
| confrontation de la résolution locale à `git ls-remote`, et **refus** de construire si elles diffèrent | une référence locale figée en arrière dans le clone : binaire neuf, code juste, **arbre faux** |
| `git worktree add --detach`, jamais `git stash` | le stash emporte *tout* le travail non committé, outils de mesure compris, et fait mesurer autre chose que ce qu'on croit |
| `cp` et non `cp -p`, et l'empreinte md5 imprimée | les dates préservées font juger les sources à jour par cargo, qui ne recompile rien : on mesure deux fois le même binaire et le rapport rend exactement 1,00 |

Nommer une branche veut dire « ce qu'elle porte **maintenant** ». Pour
construire un commit plus ancien de cette branche, passer le SHA : c'est
explicite, et ça ne déclenche pas le contrôle de fraîcheur.

`tools/ref-test.sh` éprouve `ref.sh` sur des dépôts fabriqués — un « distant »
nu et un clone dont la branche locale reste en arrière — et tourne dans
`tools/verify.sh` pour une demi-seconde, sans compiler quoi que ce soit. Sans
lui, la branche qui compte ne s'exécuterait qu'en cas de catastrophe, donc
jamais en conditions vérifiables.

`sprt.sh` et `timing.sh` refusent deux binaires d'empreinte identique, comme
`match.yml` sur le runner : *un garde-fou qui ne couvre qu'une copie ne garde
rien*.

Le test séquentiel s'arrête dès que les données suffisent et rend
`H1 was accepted` (le changement est bon) ou `H0 was accepted` (il ne l'est
pas). Réglages par variable d'environnement, documentés en tête du script.

Bornes usuelles : `[0, 5]` pour un changement censé gagner, `[-5, 0]` pour
vérifier qu'une simplification ne coûte rien. Ce sont des conventions, pas des
valeurs démontrées pour ce projet.

## Mesurer à cadence longue

Le conteneur de session est éphémère : un match de plusieurs heures y meurt
sans trace. `.github/workflows/match.yml` mesure sur un runner GitHub :
`workflow_dispatch`, deux commits et la cadence en entrée, six heures de
plafond, et un résumé lisible dans l'onglet Actions sans ouvrir le journal.
Le nom de chaque run porte ses entrées, que l'API ne rend pas.

**Lire d'abord l'étalonnage**, en tête du résumé. À cadence horloge, une
machine plus lente atteint une profondeur plus faible, donc un autre point
de fonctionnement. Les runners varient de plus de moitié d'un modèle de
processeur à l'autre, et d'un hôte à l'autre sous le même nom. Un verdict
reste valide en interne, les deux moteurs partageant la machine ; deux runs,
ou un run et une mesure locale, ne se comparent qu'après lecture de leurs
étalonnages. Les modèles et les plages relevés : F-0017.

- **Un nombre de nœuds par seconde appartient à son binaire autant qu'à sa
  machine** : une ligne d'étalonnage ne compare que des runs du même
  binaire. La profondeur atteinte en 250 ms se lit d'une version à l'autre :
  c'est le point de fonctionnement.
- **L'étalonnage mesure un banc SEUL.** À concurrence 3 sur deux cœurs
  physiques, les moteurs cherchent moins profond en partie : symétrique,
  donc aucun verdict ne se fausse, mais « profondeur 12 à `8+0,08` » décrit
  le banc, pas les parties. La profondeur en partie se mesure par la sonde
  (plus bas).

**Ce qu'un job tient selon la cadence, et ce qu'il tranche** : F-0016 ; un
SPRT plus fin que ~20 Elo expire avant la fin du job. **Pour un effet plus
petit**, des matchs à longueur fixe sur plusieurs jobs, graines distinctes,
mis en commun (« Paralléliser les matchs »). Préparer un match : le skill
`lancer-un-match` ; le lire, et lire un match coupé par le plafond : le skill
`rendre-un-verdict`.

**La cadence appartient au verdict** (`AGENTS.md`, « Ce qui compte comme
preuve ») ; la profondeur atteinte à chaque cadence est dans F-0016. Le
récit qui a fondé ces règles est au journal (J-2026-11-23-B à
J-2026-11-23-E).

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
| `tune.rs` | l'ajustement Texel lui-même. Son verdict a été **rejeté** : −9,96 Elo contre la base, quand les mêmes termes aux valeurs conventionnelles rendaient +14,92, soit 25 de moins (J-2026-09-14-F) ; l'outil reste parce qu'il resservira avec un corpus plus grand |
| `nnue_probe.rs` | le benchmark obligatoire de B4 : ce que coûtent le copy-make et la dérivation du delta d'accumulateur NNUE en part du temps d'un nœud |
| `nnue_datagen.rs` | les données d'entraînement NNUE (A21) : parties d'auto-jeu à nœuds fixes, au format `viriformat` que lit bullet, **écrit par la crate de référence** et jamais réimplémenté. Lancé sur runner par `.github/workflows/nnue-datagen.yml`, un artefact par job. **Étiquette par le réseau embarqué depuis le 29 sept.** (`--eval`, n° 7) ; `--eval '<none>'` regénère les données d'A21 |
| `nnue_validation.rs` | la perte de l'entraîneur sur des positions qu'il n'a PAS apprises (n° 18) — bullet `10e7e82` n'a pas de jeu de validation, lu au source. Les positions et les étiquettes de l'entraîneur, dépliées par `viriformat` sous son filtre par défaut ; chaque réseau QUANTIFIÉ évalué par le code du moteur ; la position confrontée pièce à pièce à son étiquette avant d'être comptée ; intervalle par partie, écarts appariés. Lancé sur runner par `.github/workflows/nnue-validation.yml`, qui télécharge les artefacts de `nnue-datagen.yml`. **Un diagnostic — apprendre ou retenir —, jamais une mesure de force** |
| `spsa.rs` | le pilote du réglage automatique (n° 19) : l'arithmétique de SPSA par manches — l'état (valeurs, plages, paires jouées), le tirage des perturbations d'un job, la lecture du résultat de fastchess, la mise à jour. Ne joue aucune partie : `.github/workflows/spsa.yml` construit les deux camps par les variables `SR_*` que lisent les `reglage!` de `engine/src/search.rs`, fait jouer fastchess, agrège et enchaîne les manches. Ses tests portent une **vérité terrain** — sur des parties simulées autour d'un optimum connu, SPSA doit s'en rapprocher, et ne s'en rapproche pas quand le signal est nul. L'état de la première passe : `tools/spsa/n19.txt` |
| `see_check.rs` | confronte l'échange statique à un oracle par force brute. Il a trouvé un **bug du manuel** au premier passage — 27 valeurs fausses sur 771 |
| `attack_dump.rs` | confronte la géométrie d'attaque de `see::least_valuable_attacker` à `python-chess`, case par case |

**`tools/Cargo.toml` porte `autobins = false`** : un fichier déposé dans
`src/bin/` n'est compilé qu'avec sa section `[[bin]]`, et
`engine/tests/outillage_documente.rs` exige que chaque binaire soit nommé
dans une doc. Le premier empêche la compilation accidentelle d'une sonde, le
second le binaire qui dort sans que personne sache ce qu'il fait ; aucun ne
remplace l'autre. Le premier a été éprouvé dans les deux sens.

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
(`x86-64-v3`) — ADR-0031 — sur un
processeur x86-64 : Linux, Windows sous Git Bash (`.exe`), Mac Intel ; sur un
processeur ARM 64 bits, Mac Apple Silicon ou Linux ARM, le seul binaire
natif. **Deux
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

Sa branche précieuse, le refus, est éprouvée par `tools/binaires-test.sh` sur
des moteurs fabriqués — dans `verify.sh` et la CI ; une faute injectée — la
comparaison réduite au banc — y fait tomber trois cas sur sept, l'empreinte
comprise.

## Le livre d'ouvertures

`book.epd` — **15 000 positions**, la décision de Théo du 6 oct. 2026 (n° 11,
J-2026-10-06-F), 8 demi-coups, écart d'évaluation ≤ 80 centièmes de pion
au filtre de l'évaluation faite main. Régénérable au code de `ab44f2a` :

```sh
cargo run --release --bin bookgen -- 15000 8 80 > tools/book.epd
```

**Pourquoi 15 000** : à 500, tous les matchs rejouaient les mêmes
ouvertures, dont les paires sont corrélées ; ce que la taille achète à la
mise en commun, et jusqu'où elle tient, est dans F-0018.

**« Même graine, même livre » ne tient qu'à évaluation égale** : l'évaluation
faite main qui filtre change avec le code, et un livre ne se régénère qu'au
commit qui l'a tiré (celui de 500 positions du 13 sept., à `4695941`).

Il est **indispensable**, pas décoratif : ShallowRed est déterministe, donc
sans livre toutes les parties d'un match seraient la même partie et
l'échantillon serait de taille un. Le tirage est seedé — même graine, même
livre — parce qu'un livre régénéré différemment invaliderait toute comparaison
avec les mesures antérieures.

**Le livre déséquilibré**, `tools/book-desequilibre.epd` (n° 23, 3 nov.
2026), ne dépend pas que d'une graine : un réservoir de 80 000 positions
de `bookgen`, 8 demi-coups, graine 20261102, filtre statique à ± 600 ;
puis une recherche de `main` à `701b609`, profondeur 12, au réseau qui
jouait, qui garde les 11 898 positions cotées entre 250 et 400 en valeur
absolue — la bande où le camp favorisé marquait le plus près de 75 %,
mesuré par un pilote. Chaque position se joue des deux côtés.
`match.yml` le prend par son entrée `livre`. **Il ne mesure pas mieux** :
sur trois effets connus, il rendait × 1,11 [0,85 ; 1,44] de précision par
paire, et ses parties durent ~13 % de plus ; notre livre reste celui des
matchs.

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

Sa mesure du 14 sept. 2026 a fermé la question d'ADR-0005 et d'ADR-0008 :
ni le copy-make ni `cozy-chess` ne plafonnent le projet du côté de NNUE
(J-2026-09-14-C). Ses chiffres, d'avant le réseau, ne valent que pour leur
date.

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
  générations d'avant n'ont pas de registre : leurs runs, leurs comptes
  et de quoi les regénérer sont au journal (J-2026-11-18-BD,
  J-2026-11-18-BE, J-2026-11-18-BY).

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
   l'entraîneur (`AGENTS.md`, « ce réseau est celui qu'a entraîné
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
release, qui chargent le réseau embarqué, le rattrapent. La suite, de ces
tests au match puis à l'embarquement : le skill `embarquer-un-reseau`.

**La machine de Théo**, ses limites et son rangement : F-0020. Ce qu'une
séance vérifie avant tout, et sa procédure : le skill `preparer-une-seance`.

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

`tools/timing.sh <candidat> <référence> [paires]` compare deux **vitesses**.
Il impose les trois choses qu'on oublie :

1. il **refuse de mesurer** si les deux binaires n'explorent pas exactement le
   même nombre de nœuds — sinon on compare deux arbres, pas deux vitesses ;
2. il mesure à la **profondeur 10**, jamais 7, où le bruit domine ;
3. il **refuse de conclure sous vingt paires** et rend un **test des signes**,
   au lieu d'une comparaison de médianes à l'œil.

**Lequel employer.** `sprt.sh` juge un changement de **décision** — la
recherche explore un autre arbre. `timing.sh` juge une **optimisation pure** —
même arbre, même coup, seulement plus vite. Un nombre de nœuds identique est
vérifiable ; un verdict de match est probabiliste. Employer le second quand il
s'applique évite des heures de match pour un chiffre déjà connu.

**Le temps de l'évaluation qui joue** ne se lit pas par `timing.sh`, dont
le banc évalue à la main (B-0055), mais au rejeu :
`tools/sonde-inference/rejeu.py`, apporté par
`tools/attic/n15-sonde-inference.patch`, dont il s'extrait seul
(`git apply --include='tools/sonde-inference/*'`). Il rejoue
un corpus de parties (PGN en notation UCI) à profondeur fixe, table
conservée, compare deux binaires en paires, refuse si leurs arbres
diffèrent et rend un test des signes ; `--nps` compare les nœuds par
seconde de deux arbres différents. La procédure, son corpus et sa
puissance : le skill `mesurer-l-inference`.

## Régler par SPSA — `spsa.yml`

`.github/workflows/spsa.yml` règle ensemble des constantes de la recherche
par SPSA, sur les runners ; `tools/src/bin/spsa.rs` en est le pilote, et
`tools/spsa/n19.txt` l'état de départ de la première passe, ses
paramètres, leurs plages et leurs perturbations. Ce qui suit est ce
qu'aucun des trois ne dit.

- **Des réglages à la compilation, jamais des options UCI.** Une constante
  réglable s'écrit `reglage!` dans `engine/src/search.rs` : sans sa
  variable `SR_<NOM>`, elle vaut son défaut, et le code machine est celui
  d'avant à l'octet ; avec elle, la valeur entre à la compilation, et une
  valeur illisible ou hors du type arrête la compilation. Une option se
  lirait à chaque nœud et pourrait se régler de travers en silence ; le
  prix est un binaire par camp, une minute de compilation par job.
- **Une manche** : chaque job tire une perturbation de l'état, construit
  les deux camps `θ + c·Δ` et `θ − c·Δ`, arrondis et bornés à leur plage,
  refuse s'ils sont le même binaire, et les fait jouer en paires
  d'ouvertures ; le job d'agrégation met l'état à jour, le dépose en
  artefact `spsa-etat` et lance la manche suivante. **Le jeton du job peut
  lancer un `workflow_dispatch`** — éprouvé le 14 oct. 2026 : la chaîne
  tient sans la session, chaque manche recevant l'état de la précédente
  par `etat_run` et le moteur par un SHA figé à la première.
- **La campagne** — le choix des paramètres et de leurs plages, la
  cadence, le budget, le verdict — se règle dans sa spécification,
  B-0017 ; elle deviendra un skill à la deuxième.

## Tests de mutation

`cargo mutants` altère le code une mutation à la fois et vérifie que la suite
de tests s'en aperçoit : la seule défense mécanique contre un test creux. Le
moteur en produit plus d'un millier, et `engine/src/search.rs` seul
demande des heures de runner : bien trop pour bloquer une pull request — un
contrôle qui bloque une heure finit par être contourné. Il tourne donc
chaque semaine : workflow `Mutation`, mardi 00:00 UTC, un job par fichier
en parallèle — par morceau pour un fichier trop long, `search.rs 0/2` dans
la matrice, le verdict sommant les morceaux ; sa durée par fichier,
`AGENTS.md`, « Sa durée ».

```sh
cargo install cargo-mutants --locked
cargo mutants --list                      # décompte, instantané
tools/mutants.sh --file engine/src/tt.rs -j4
```

Il tourne par `.github/workflows/mutation.yml`, et son verdict est rendu
par `.github/mutation-verdict.sh`, que `.github/mutation-verdict-test.sh`
éprouve. `workflow_dispatch` accepte deux entrées : `simuler_une_alerte`,
qui force l'échec pour éprouver l'issue, et `commit`, qui balaie un SHA au
lieu de la tête de la branche — le crible d'un candidat révoqué — sans
jamais ouvrir d'issue, le cliquet gardant `main`. Le reste de l'outillage automatique — le hook de chess,
`.claude/hooks/no-fabricated-sha.sh`, et l'auto-test des hooks,
`tools/verify-hooks.sh` — est décrit dans `AGENTS.md`, section « Les
dispositifs de chess ».

**Toujours passer par `tools/mutants.sh`, jamais par `cargo mutants` nu.** Il
prend un verrou exclusif — deux balayages lancés l'un sur l'autre
écriraient dans le même dossier, et ses survivants mêleraient deux
versions du code — et range le rapport précédent sous `mutants.out.old/`
avant de partir, plutôt que de l'effacer : la liste nominative des
survivants d'un fichier qu'on ne remesure pas n'est nulle part ailleurs. Il plafonne aussi la mémoire de
chaque processus de test à 4 Gio, comme le workflow : un mutant qui alloue
sans fin meurt sur son allocation et compte attrapé, au lieu de tuer le
runner.

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
jamais vérifié. `.github/mutation-verdict-test.sh` l'éprouve sur des cas
fabriqués, et tourne dans `tools/verify.sh` comme dans la CI.

**Ce que le balayage ne mesure pas** : la force de jeu. Un survivant portant
sur une valeur d'évaluation, une marge d'élagage ou l'ordre des coups n'est pas
un défaut — le SPRT en juge déjà, et aucun test unitaire ne peut trancher à sa
place. `tools/` est hors du balayage ; la raison écrite le 15 sept. 2026
ne tient plus, et la question est ouverte (B-0080).

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

**Les clouages absolus et les échecs à la découverte** sont la limite par
construction d'un échange statique : sur l'échantillon mesuré, aucune
autre cause (J-2026-11-17-J). Elle est caractérisée et verrouillée par un
test.

## `tools/pieges-fermes.md` — les pièges qu'un code de sortie tient désormais

L'archive des pièges qu'un dispositif rend inexprimables, chacun entier avec
sa preuve ; son en-tête dit son critère d'entrée et sa condition de sortie.
`engine/tests/pieges_fermes.rs` vérifie que chaque piège archivé nomme un
dispositif qui existe, et que `AGENTS.md` nomme toujours l'archive.

## `tools/etat.sh` — l'état calculé, à lancer à la main

Un état **dérivé de git**, donc rien n'y vieillit : branche, arbre propre ou
non, `git log origin/main..HEAD`, et le nombre de fichiers `.rs` contre `.md`
modifiés depuis `main`, le **signal de documentation**, qui constate sans
rien prescrire. Et les branches distantes que `main` contient en entier, à
faire supprimer par Théo, le jeton de session ne pouvant pas supprimer une
référence distante (ADR-0033) : jamais `main`, ni la branche de travail, ni
celles que la politique garde (`[human] keep_branches` de
`.socle/policy.toml`, comparées par la fonction du socle). La ligne se tait
quand il n'y a rien à supprimer : `tools/etat-test.sh` l'éprouve sur des
dépôts fabriqués, dans `verify.sh`, avec leur propre politique — la
détection, chaque exclusion, un témoin voisin par forme de motif, une
politique vide qui doit tout proposer, un filtre en échec qui doit dire sa
cause. Au démarrage, c'est l'état du socle qui s'imprime depuis le 13 nov.
2026 (D-0009) : ce script se lance à la main.

`tools/verify.sh` vérifie que le script **rend un état non vide** : un script
devenu muet ne se verrait pas, on croirait simplement qu'il n'y a rien à dire.

## Paralléliser les matchs — ce qui marche et ce qui ne marche pas

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

### Ce que ça achète

L'intervalle d'un match à longueur fixe décroît en `1/√n` : ce qu'un job et
quatre jobs rendent à `8+0,08` est dans F-0016. Il tranche en séparant
l'effet de zéro ; un SPRT, par défaut, entre les bornes `[0, 5]`, une
barre plus haute : pour écarter la borne haute, l'effet doit dépasser
l'intervalle plus 5.

### Le piège propre à la mise en commun, et il est sérieux

**Deux runners GitHub ne vont pas à la même vitesse** (F-0017), et
l'écart se lit en plis de profondeur atteinte (F-0015) ; or ce dépôt a
mesuré qu'**un pli peut INVERSER un verdict**.

Mettre en commun deux matchs joués sur des runners très différents **moyenne
donc deux points de fonctionnement**. Ce n'est pas nécessairement mauvais —
moyenner sur une plage de machines ressemble davantage à « la force générale »
qu'un point unique, qui est la cible déclarée du projet — mais **ça doit être
dit, pas subi**. `mettre-en-commun.sh` compare les matchs deux à deux par un
test en `z` et **refuse de conclure en silence** quand le plus grand écart
est trop rare sous un seul effet : il rend la probabilité du plus grand
écart sous l'étendue studentisée à `k` matchs, et refuse sous 4,55 %, le
niveau de `z > 2` à deux matchs. Le seuil d'avant, `z > 2` fixe, refusait à
tort, à quatre matchs, près d'une fois sur cinq sous un seul effet : un
avertissement qui crie au loup cesse d'être lu. Calcul confronté à une
intégrale et un tirage indépendants du script
(`tools/mettre-en-commun-test.sh`).

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

### L'outil

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

## La concurrence d'un match se DÉDUIT des cœurs qu'occupe une partie

La règle « jamais deux matchs sur une même machine » en est le cas
particulier ; la règle générale est une inégalité.

> **cœurs occupés par une partie × concurrence ≤ cœurs du runner − 1**
>
> Le cœur de réserve est pour l'arbitre et le système : un moteur qui attend
> un cœur perd du temps de pendule, et le perd de façon asymétrique.

| ce que font les moteurs | cœurs par partie | concurrence sur 4 processeurs logiques — **2 cœurs physiques** |
|---|---|---|
| monofil, sans ponder | 1 (un seul moteur réfléchit à la fois) | **3** |
| un camp pondère (mesure du ponder) | 2 | **1** |
| Lazy SMP à `T` fils, sans ponder (B6) | `T` — le plus grand des deux camps | `⌊3 / T⌋` : **1** dès `T = 2` |
| Lazy SMP à `T` fils ET ponder | `T` + `T` | **impossible** à `T ≥ 2` sur 4 cœurs |

**Le sens du biais n'est pas le même selon le chantier**, et c'est ce qui rend
la règle dangereuse à oublier : le ponder vole du CPU **à l'adversaire du
candidat** (biais vers l'hypothèse), Lazy SMP en vole **au candidat
lui-même**, dont les fils se disputent les cœurs (biais contre). *Dans les
deux cas le verdict ne vaut rien.*

**`match.yml` dérive la concurrence de l'inégalité**, et refuse de lancer
quand elle ne tient pas : deux cœurs par partie dès que quelqu'un pondère ;
pour les fils, deux entrées, `fils_candidat` et `fils_reference` (1 par
défaut), la partie occupant le plus gros des deux camps sans ponder, leur
somme avec. Et deux refus de plus, chacun pour un zéro qui se lirait comme
un verdict :

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
valeurs des moteurs comme il le fait de `tc=`. `match.yml` reste
sous la limite de vingt-cinq entrées de `workflow_dispatch`. Ses trois refus sont
éprouvés en rejouant les étapes en local, avec un moteur témoin qui déclare
`Threads` et journalise ce qu'il reçoit, sous les deux arbitres.

## Les anciens renvois — au journal

Ce fichier portait, jusqu'au 23 nov. 2026, les récits des chantiers, la
feuille de route, les réglages ouverts et le tableau des verdicts. Ils
sont partis de la transition (D-0020), chaque section au journal de la
mémoire, texte tel quel. Un ancien renvoi — « `tools/README.md`, section
« … » », dans le code, un commit, un registre, une rustine ou le journal
lui-même — se suit par cette table, son titre d'origine en tête. Ce que
chaque section portait d'utile est à sa place : les synthèses des lots le
disent (J-2026-11-18-AB, J-2026-11-18-BB, J-2026-11-18-BZ,
J-2026-11-18-CX, J-2026-11-18-EJ et J-2026-11-23-K).

Les renvois qui désignent plus qu'une section, ou une section par un autre
nom que son titre :

- « N° 15 à 19 » entier : J-2026-11-18-CB, puis son verdict du n° 17,
  J-2026-11-18-CC ; « N° 18 » entier : J-2026-11-18-CD, puis son verdict,
  J-2026-11-18-CE ;
- « N° 20 » entier : J-2026-11-18-CF, puis ses sous-sections, de
  J-2026-11-18-CG à J-2026-11-18-CU — les étapes A et B, les séances B,
  C1, C2, C2c et C3, (e), (a) et (d) ;
- « N° 22 » entier : J-2026-11-18-DA, puis sa séance, de J-2026-11-18-DB à
  J-2026-11-18-DD ; « N° 23 » entier : de J-2026-11-18-DE à
  J-2026-11-18-EH ;
- « La file » et ses phases : J-2026-11-17-AF ; « L'histoire de
  l'ordre » : J-2026-11-17-AI ; « Les réglages ouverts » et « le
  registre » : J-2026-11-18-B, devenus F-0009 et F-0010 ;
- « feuille de route, point N », et « Ce qui reste à faire, par ordre
  mesuré » tel que les ADR et les workflows de septembre à novembre le
  citent : la feuille de route du 31 oct. 2026, au commit 88da289, que le
  backlog de la mémoire remplace (D-0009), puis J-2026-11-17-AF et
  J-2026-11-17-AI ; son dernier résidu, du 23 nov. : J-2026-11-23-I ;
- « Le ponder » et « La pendule de l'adversaire » : J-2026-11-18-AN ;
  « la cause de l'érosion de delta » : J-2026-11-18-AS ; « Levier 4 » :
  J-2026-11-18-BE ; les « deuxième », « troisième » et « quatrième
  écran » du n° 9 : J-2026-11-18-BH, J-2026-11-18-BI et J-2026-11-18-BL ;
  « C43 et C44 » : J-2026-11-18-BN ; « les candidats C45 à C51 » :
  J-2026-11-18-BT.

| titre d'origine | au journal |
|---|---|
| C21 — le SPRT a EXPIRÉ, et il a rendu un chiffre quand même | J-2026-11-18-G |
| C21 — VERDICT, 23 sept. 2026 : +19,13 ± 6,31 Elo à 8+0,08 sur 6 000 parties | J-2026-11-18-H |
| Ce qui est EN VOL le 23 sept. — l'ordre des relèves, des fusions et des conflits — en-tête et suites | J-2026-11-18-I |
| Ce qui est EN VOL le 23 sept. — l'ordre des relèves, des fusions et des conflits — Les jobs, tranche 1 | J-2026-11-18-J |
| Ce qui est EN VOL le 23 sept. — l'ordre des relèves, des fusions et des conflits — Les jobs, tranche 2 | J-2026-11-18-K |
| Ce qui est EN VOL le 23 sept. — l'ordre des relèves, des fusions et des conflits — Les jobs, tranche 3 | J-2026-11-18-L |
| Ce qui est EN VOL le 23 sept. — l'ordre des relèves, des fusions et des conflits — Les jobs, tranche 4 | J-2026-11-18-M |
| C22 — VERDICT, 23 sept. 2026 : −10,44 ± 6,34 Elo à 8+0,08 — régression, non fusionné, à remesurer sur C23 | J-2026-11-18-N |
| C23 — VERDICT, 23 sept. 2026 : +2,65 ± 6,40 Elo à 8+0,08 — pas d'effet décelable, FUSIONNÉ au titre de la règle | J-2026-11-18-O |
| C22 sur C23 — VERDICT, 24 sept. 2026 : aucune borne haute sous zéro, FUSIONNÉ au titre de la règle — deux matchs… | J-2026-11-18-P |
| B9 — VERDICT, 23 sept. 2026 : capacité −1,27 ± 6,34 Elo à 8+0,08 — pas d'effet décelable, FUSIONNÉ | J-2026-11-18-Q |
| Ponder — VERDICT, 23 sept. 2026 : +67,63 ± 9,19 Elo à 8+0,08 contre notre jumeau — l'activer rapporte | J-2026-11-18-R |
| Vol de CPU du ponder sur runner — VERDICT, 23 sept. 2026 : r = 0,948, le verdict du ponder tient — et les runners… | J-2026-11-18-S |
| Calibrer l'Elo par pli — VERDICT, 24 sept. 2026 : un doublement vaut +107,7 ± 8,2 Elo et +1,38 ± 0,28 pli, soit 60 à… | J-2026-11-18-T |
| B6 — Lazy SMP — VERDICT, 24 sept. 2026 : +42,16 ± 9,23 Elo à deux fils contre un, à 8+0,08 — deux fils rapportent | J-2026-11-18-U |
| A18 — génération par étapes — VERDICT, 24 sept. 2026 : +23,10 ± 6,39 Elo à 8+0,08 — gain démontré, FUSIONNÉ | J-2026-11-18-V |
| C24 — laisser finir l'itération — VERDICT, 24 sept. 2026 : +44,64 ± 6,24 Elo à 8+0,08 — gain démontré, FUSIONNÉ ; la… | J-2026-11-18-W |
| C25 — la répartition par la stabilité — VERDICT, 24 sept. 2026 : +7,87 ± 6,08 Elo à 8+0,08 — gain démontré, FUSIONNÉ… | J-2026-11-18-X |
| C26 — la dure à l'approche d'un contrôle à coups comptés — VERDICT, 25 sept. 2026 : +2,43 ± 6,01 Elo à 40/8, aucune… | J-2026-11-18-Y |
| L'allocation inégale — l'écran du 24 sept. 2026 : 18,7 % du temps était jeté, et laisser finir l'itération rapporte… | J-2026-11-18-Z |
| A20 — raffinements d'ordonnancement — VERDICT, 25 sept. 2026 : +12,56 ± 4,35 Elo à 8+0,08 — la continuation… | J-2026-11-18-AA |
| C13 — la force absolue : le protocole, écrit le 29 sept. avant de mesurer | J-2026-11-18-AE |
| B8 — les marges à l'échelle du réseau — VERDICT, 30 sept. 2026 : +50,50 ± 5,37 Elo à 8+0,08 — gain démontré, FUSIONNÉ | J-2026-11-18-AF |
| C31 — la nulle après une parade tranquille, dans la quiescence — VERDICT, 30 sept. 2026 : −2,43 ± 5,36 Elo à 8+0,08, la… | J-2026-11-18-AG |
| C30 — la taille par défaut — VERDICT, 30 sept. 2026 : +2,90 ± 5,72 Elo à 8+0,08 — aucun coût démontré, le défaut passe à 64 Mio | J-2026-11-18-AH |
| C29 — les seaux — VERDICT, 30 sept. 2026 : +30,13 ± 5,60 Elo sous pression, +1,85 ± 5,51 au défaut, à 8+0,08 — FUSIONNÉ | J-2026-11-18-AI |
| C28 — la table sous pression : 2 Mio contre 16 à 8+0,08 — VERDICT, 29 sept. 2026 : −19,42 ± 5,78 Elo, la pression de 60+0,6 coûte | J-2026-11-18-AJ |
| C27 — une borne de mat hors plage stockée dans la table — VERDICT, 25 sept. 2026 : −3,56 ± 5,97 Elo à 8+0,08, aucune… | J-2026-11-18-AK |
| B9 ne se valide PAS par « nœuds identiques » — mesuré le 22 sept. 2026 | J-2026-11-18-AL |
| La gestion du temps : NON, ce n'est pas clos — état au 23 sept. 2026 | J-2026-11-18-AM |
| Réfléchir sur le temps de l'adversaire, et lire sa pendule | J-2026-11-18-AN |
| B9 — écrit et mesuré le 23 sept. 2026 — état d'AVANT la fusion, gardé pour ses chiffres | J-2026-11-18-AO |
| Trois chantiers, une seule unité — mesuré le 22 sept. 2026 | J-2026-11-18-AP |
| D5 a trouvé son érosion, et elle était là où le mécanisme la plaçait | J-2026-11-18-AQ |
| L'érosion se cherche d'abord en nœuds — mesuré le 22 sept. 2026 | J-2026-11-18-AR |
| Et la cause de l'érosion de delta est mesurée, pas supposée | J-2026-11-18-AS |
| Le SPRT de retrait de l'élagage delta a EXPIRÉ — et c'est un résultat | J-2026-11-18-AT |
| Ce que l'écran en nœuds avait annoncé — un point, pas une règle | J-2026-11-18-AU |
| La relation de budget, sur dix-huit points | J-2026-11-18-AV |
| C18 : la réserve de la fiche est juste, et deux fois plutôt qu'une | J-2026-11-18-AW |
| D2 clos sans match : le gatage sur non-PV vaut environ 1 Elo | J-2026-11-18-AX |
| C17 : LMP paie à la cadence qui tranche, et il avait été rejeté deux fois | J-2026-11-18-AY |
| C17 rouvert : ce que LMP élague, et ce que C19 n'a pas changé | J-2026-11-18-AZ |
| C19 : la cadence n'a PAS inversé ce verdict, et c'est un résultat | J-2026-11-18-BA |
| A21 — NNUE : la génération des données — écran écrit le 25 sept. 2026 | J-2026-11-18-BD |
| N° 7 — un meilleur réseau : le plan, écrit le 29 sept. avant de mesurer | J-2026-11-18-BE |
| N° 9 — les techniques de recherche absentes : l'écran, écrit le 5 oct. avant de mesurer | J-2026-11-18-BF |
| N° 9, premier écran — VERDICT, 5 oct. 2026 : C32 +40,90 ± 5,34 Elo à 8+0,08 — FUSIONNÉ ; C32b, C33 et C34 gagnent aussi | J-2026-11-18-BG |
| N° 9, deuxième écran — VERDICT, 5 oct. 2026 : C38 +9,61 ± 3,71 et C36 +5,65 ± 3,75 au groupe ; C37 +0,75 ± 3,69 sans… | J-2026-11-18-BH |
| N° 9, troisième écran — VERDICT, 5 oct. 2026 : C39 +23,72 ± 3,75 Elo à 8+0,08 — au groupe ; l'amplitude hétérogène, le signe non | J-2026-11-18-BI |
| N° 9, la composition — le groupe, attendu et critère écrits le 5 oct. avant de mesurer | J-2026-11-18-BJ |
| N° 9, la composition — VERDICT, 5 oct. 2026 : le groupe +52,22 ± 3,61 Elo à 8+0,08 — FUSIONNÉ | J-2026-11-18-BK |
| N° 9, quatrième écran — protocole et attendus, écrits le 6 oct. avant de mesurer | J-2026-11-18-BL |
| N° 9, quatrième écran — VERDICT, 6 oct. 2026 : C41 +10,66 ± 3,43 Elo à 8+0,08 — FUSIONNÉ ; C40 −4,26 ± 3,49, régression… | J-2026-11-18-BM |
| N° 9, après le quatrième écran — C43 et C44 : protocole et attendus, écrits le 6 oct. avant de mesurer | J-2026-11-18-BN |
| N° 9, après le quatrième écran — VERDICT, 6 oct. 2026 : C43 +0,87 ± 4,63, FUSIONNÉ au titre de la règle ; C44 +2,69 ±… | J-2026-11-18-BO |
| N° 10 — deux binaires, et le match qui chiffre l'AVX2 : protocole et attendu, écrits le 6 oct. avant de mesurer | J-2026-11-18-BP |
| N° 10 — VERDICT, 7 oct. 2026 : +32,23 ± 4,84 Elo à 8+0,08 — l'AVX2 rapporte, gain démontré ; l'étalon du temps l'avait prédit | J-2026-11-18-BQ |
| N° 12, le cinquième écran — protocole et attendus, écrits le 6 oct. avant de mesurer | J-2026-11-18-BR |
| N° 12, le cinquième écran — RELEVÉ, 7 oct. 2026 : sept candidats ; le multi-cut, le razoring, l'élagage et la réduction… | J-2026-11-18-BS |
| N° 12 — les candidats C45 à C51 : attendus et critère, écrits le 7 oct. avant de lancer | J-2026-11-18-BT |
| N° 12, le cinquième écran — VERDICT, 7 oct. 2026 : C49 +25,32 ± 3,26, C45 +11,67 ± 3,38 et C47 +3,91 ± 3,28 à la… | J-2026-11-18-BU |
| N° 12, la composition — C45, C47 et C49 : le candidat, et un test qui tombe — règle écrite le 7 oct. avant de mesurer | J-2026-11-18-BV |
| N° 12, la composition — l'arbre au rejeu, attendu et critère écrits le 7 oct. avant de mesurer | J-2026-11-18-BW |
| N° 12, la composition — VERDICT, 7 oct. 2026 : C45 + C47 + C49 +32,55 ± 3,36 Elo à 8+0,08 — FUSIONNÉ | J-2026-11-18-BX |
| N° 13 — le réseau : une vague de données au moteur d'aujourd'hui, écrite le 7 oct. avant de la lancer | J-2026-11-18-BY |
| N° 15 à 19 — la chaîne du réseau : DÉCIDÉE le 13 oct. 2026 | J-2026-11-18-CB |
| N° 17 — VERDICT, 14 oct. 2026 : N5l +30,29 ± 3,95 Elo à 8+0,08 contre N4 — EMBARQUÉ ; N5s +15,58 ± 3,87 ; les seaux de… | J-2026-11-18-CC |
| N° 18 — le volume de données : DÉCIDÉ le 14 oct. 2026, écrit avant de lancer | J-2026-11-18-CD |
| N° 18 — VERDICT, 17 oct. 2026 : N6r4 +98,74 ± 4,27 et N6r10 +97,30 ± 4,26 Elo à 8+0,08 contre N5l, N6l +76,99 ± 4,00 —… | J-2026-11-18-CE |
| N° 20 — plus de passes, plus de données : DÉCIDÉ le 17 oct. 2026, écrit avant de lancer | J-2026-11-18-CF |
| Étape A — plus de passes, sur la carte de Théo, sans donnée neuve | J-2026-11-18-CG |
| Étape A — VERDICT, 20 oct. 2026 : plus de passes paie encore — N7p4 +16,89 ± 3,55 et N7p2 +14,74 ± 3,52 contre N6r4 à… | J-2026-11-18-CH |
| Étape B — plus de données, sur les runners, étiquetées par W | J-2026-11-18-CI |
| La séance B — après le volume | J-2026-11-18-CJ |
| (e) — le budget de l'étiqueteur : écrit le 20 oct. à 22 h 09, avant de lancer | J-2026-11-18-CK |
| La séance C1 — écrite le 22 oct. à 4 h 34, avant de la demander | J-2026-11-18-CL |
| La séance C2 — écrite le 26 oct. à 8 h 07, avant de la demander | J-2026-11-18-CM |
| La séance C2c — écrite le 27 oct. à 7 h 57, avant de la demander | J-2026-11-18-CN |
| La séance C3 — le chiffrage, le 27 oct. à 13 h 36, avant de l'écrire | J-2026-11-18-CO |
| La séance C3, l'outillage — écrit le 27 oct. à 19 h 37, la décision des données en attente | J-2026-11-18-CP |
| La séance C3, les données — l'option C, choisie par Théo le 6 nov. à 8 h | J-2026-11-18-CQ |
| C3 — N10 et N10r10 : VERDICT, relevé le 9 nov. à 6 h 50 — la base bat N9w50s800, dix seaux de roi passent devant | J-2026-11-18-CR |
| C3 — N10h384 et N10h512 : VERDICT, relevé le 10 nov. à 3 h 50 — la largeur paie, nettement | J-2026-11-18-CS |
| (a) et (d) — la séance, écrite le 19 oct. à 20 h 14, avant de la demander | J-2026-11-18-CT |
| (a) et (d) — VERDICT, 20 oct. 2026 : le poids du résultat paie — N6r4w50 +11,79 ± 3,52 et N6r4w25 +7,17 ± 3,49 contre… | J-2026-11-18-CU |
| La file, phase 2 — le cache des recalculs : écrit le 20 oct. 2026, mesuré avant d'en écrire l'attendu | J-2026-11-18-CV |
| La file, phase 2 — le produit scalaire en AVX2 : écrit le 20 oct. 2026, le mécanisme lu au code machine | J-2026-11-18-CW |
| N° 21 — la génération étiquetée par N8tw50s800 : écrite le 22 oct. à 4 h 34, avant de lancer | J-2026-11-18-CZ |
| N° 22 — la tranche étiquetée par N9w50s800, et le budget à 2 500 nœuds : écrite le 26 oct. à 13 h 54, avant de lancer | J-2026-11-18-DA |
| La séance du n° 22 — E5n, E2.5t, E2.5v, et E21 depuis le 2 nov. : écrite le 27 oct. à 19 h 27, pour la semaine du 2 nov. | J-2026-11-18-DB |
| La séance du n° 22 — E2.5t contre E5n : VERDICT, relevé le 6 nov. à 2 h — 2 500 nœuds remplacent 5 000 | J-2026-11-18-DC |
| La séance du n° 22 — E2.5v et E21 : VERDICT, relevé le 6 nov. à 7 h 20 — l'étiquette ne se sépare pas, le tour de boucle paie | J-2026-11-18-DD |
| N° 23 — l'historique borné (phase 4) : protocole et attendus, écrits le 2 nov. avant de mesurer | J-2026-11-18-DE |
| N° 23, l'écran — RELEVÉ le 2 nov. : deux candidats de gravité et la LMR modulée ; l'élagage par l'historique fermé à nouveau | J-2026-11-18-DF |
| N° 23 — les candidats C52, C53, C54 : attendus et critère, écrits le 2 nov. avant de lancer | J-2026-11-18-DG |
| N° 23 — C52, C53, C54 : VERDICT, relevé le 2 nov. à 16 h 10 — C54 fusionné, C53 compris | J-2026-11-18-DH |
| N° 23 — le livre déséquilibré : protocole, écrit le 2 nov. avant son pilote et ses matchs | J-2026-11-18-DI |
| N° 23 — C55, C56 : le diviseur de la LMR modulée — écran, attendus et critère, écrits le 3 nov. avant de lancer | J-2026-11-18-DJ |
| N° 23 — les échelles de la gravité, à l'écran le 3 nov. : confondues avec le diviseur | J-2026-11-18-DK |
| N° 23 — C55, C56 : VERDICT, relevé le 3 nov. à 13 h 40 — 6 000 reste | J-2026-11-18-DL |
| N° 23 — C57, C58 : le décalage de la note — écran, attendus et critère, écrits le 3 nov. avant de lancer | J-2026-11-18-DM |
| N° 23 — C57, C58 : VERDICT, relevé le 3 nov. à 19 h 20 — le décalage reste à 0 | J-2026-11-18-DN |
| N° 23 — C59, C60 : la mémoire de la gravité — écran, attendus et critère, écrits le 3 nov. avant de lancer | J-2026-11-18-DO |
| N° 23 — C59, C60 : VERDICT, relevé le 4 nov. à 0 h 50 — la mémoire longue perd, la courte n'est pas démontrée | J-2026-11-18-DP |
| N° 23 — C61 : la mémoire plus courte encore — attendus et critère, écrits le 4 nov. avant de lancer | J-2026-11-18-DQ |
| N° 23 — C61 : VERDICT, relevé le 4 nov. à 6 h 25 — main reste, la mémoire déprioritisée | J-2026-11-18-DR |
| N° 23 — l'élagage par l'historique, la forme de Stockfish 16 : fermé à l'écran le 4 nov. | J-2026-11-18-DS |
| N° 23 — C62, C63 : la LMR selon le type de nœud — écran, attendus et critère, écrits le 4 nov. avant de lancer | J-2026-11-18-DT |
| N° 23 — C62, C63 : VERDICT, relevé le 4 nov. à 11 h 55 — C63 gagne, il entre par la composition | J-2026-11-18-DU |
| N° 23 — C64, C65, C66 : la variante principale en table — écran, attendus et critère, écrits le 4 nov. avant de lancer | J-2026-11-18-DV |
| N° 23 — C64, C65, C66 : VERDICT, relevé le 4 nov. à 12 h 30 — aucun ne passe, main reste | J-2026-11-18-DW |
| N° 23 — C67, C68 : l'historique de correction en plusieurs tables — écran, attendus et critère, écrits le 4 nov. avant de lancer | J-2026-11-18-DX |
| N° 23 — C67, C68 : VERDICT, relevé le 4 nov. à 12 h 55 — C67 gagne, +14,22, il entre par la composition | J-2026-11-18-DY |
| N° 23 — C69, C70 : l'historique des captures, rouvert — écran, attendus et critère, écrits le 4 nov. avant de lancer | J-2026-11-18-DZ |
| N° 23 — C69, C70 : VERDICT, relevé le 4 nov. à 13 h 05 — aucun ne passe, main reste | J-2026-11-18-EA |
| N° 23 — C71 : la composition des gagnants, C63 et C67 — protocole, attendu et critère, écrits le 4 nov. avant de lancer | J-2026-11-18-EB |
| N° 23 — C71 : VERDICT, relevé le 4 nov. à 18 h 25 — +16,02 ± 3,17, FUSIONNÉ ; la phase 4 est close | J-2026-11-18-EC |
| N° 23 — C72, C73, C74 : les réglages de la phase 4 sur main — attendus et critère, écrits le 4 nov. avant de lancer | J-2026-11-18-ED |
| N° 23 — C72, C73, C74 : VERDICT, relevé le 5 nov. à 0 h 50 — aucun ne passe, main reste | J-2026-11-18-EE |
| N° 23 — le test des extensions singulières : mesuré sur main le 3 nov., traitement écrit avant le verdict de C59 | J-2026-11-18-EF |
| N° 23 — le livre déséquilibré : VERDICT, relevé le 3 nov. à 13 h 40 — notre livre reste | J-2026-11-18-EG |
| N° 23 — l'inférence multicouche : écrite le 2 nov., prête pour le verdict de C3 | J-2026-11-18-EH |
| N° 19 — le réglage automatique (SPSA) : l'outillage, écrit pendant les vagues du n° 18 | J-2026-11-18-EI |
| Mesurer à cadence longue | J-2026-11-23-B |
| Remesuré le 21 sept. 2026 — la dispersion est plus large, et un piège apparaît | J-2026-11-23-C |
| Ce qu'un seul job peut trancher | J-2026-11-23-D |
| Le résultat qui a motivé tout ça | J-2026-11-23-E |
| Tests de mutation — mesuré le 15 sept. 2026 | J-2026-11-23-F |
| Le cliquet — ce que le premier balayage a trouvé | J-2026-11-23-G |
| Mesures de référence | J-2026-11-23-H |
| Ce qui reste à faire, par ordre mesuré | J-2026-11-23-I |
| Ce qu'il faut surveiller — et que rien ne signalera tout seul | J-2026-11-23-J |
| tools/pieges-fermes.md — le gain annoncé | J-2026-11-23-L |
