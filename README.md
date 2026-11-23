# ShallowRed

Un moteur d'échecs UCI écrit en Rust, et l'interface qui va avec.

Le nom est un contrepied de Deep Blue, doublé de la couleur de la rouille et
d'un aveu sur la profondeur de recherche.

> **Statut.** Un moteur UCI complet : recherche negamax alpha-bêta en
> approfondissement itératif, avec quiescence, table de transposition,
> génération des coups par étapes, et des élagages, réductions et
> extensions entrés chacun sur le verdict d'un match, seuls ou en groupe.
> Un fil par
> défaut, plusieurs par l'option `Threads` (Lazy SMP). L'évaluation qui
> joue est un réseau NNUE embarqué dans le binaire, appris sur les parties
> du moteur ; l'évaluation faite main reste disponible par
> `setoption name EvalFile value <none>`. La pendule se répartit selon le
> temps restant et la stabilité du coup ; `Ponder` existe, éteint par
> défaut. Le réseau qui joue et la force absolue estimée sont des faits de
> la mémoire du projet, F-0007 et F-0011, dans
> [`memory/canonical.md`](memory/canonical.md).

## Structure

| Dossier | Contenu | Statut |
|---|---|---|
| `engine/` | Moteur UCI en Rust | Recherche et évaluation — un fil par défaut, plusieurs par l'option `Threads` |
| `ui/` | Interface TypeScript | V1 finie, menée séparément (ADR-0027) — consignes dans `ui/CLAUDE.md` |
| `tools/` | Arbitres, livre d'ouvertures, SPRT | Opérationnel |

Le moteur et l'interface ne communiquent que par le protocole UCI sur
stdin/stdout. Le moteur ignore tout de l'interface, de la notion de partie et
de la persistance : il reçoit une position et un budget de temps, il rend un
coup.

## Démarrer

```sh
cargo run --release --bin shallowred
```

Puis, au clavier :

```
uci
isready
position startpos moves e2e4 e7e5
go wtime 300000 btime 300000 winc 2000 binc 2000
```

Le binaire se charge tel quel dans n'importe quelle interface UCI — Cute Chess,
Arena, BanksiaGUI.

### Deux binaires : de base, et AVX2

`cargo build --release` produit un binaire pour le jeu d'instructions de base
du processeur (en x86-64 : SSE2). Il tourne partout, **sans carte graphique** :
le réseau NNUE s'évalue en arithmétique entière sur le processeur, et la carte
ne sert qu'à l'entraîner.

```sh
RUSTFLAGS="-C target-cpu=native" cargo build --release
```

demande au compilateur d'employer **toutes les instructions du processeur qui
compile** — AVX2 et au-delà sur un processeur récent. Les boucles du réseau
(mises à jour de l'accumulateur, produit de sortie) traitent alors deux fois
plus de valeurs par instruction, sans une ligne de code : c'est le compilateur
qui vectorise.

**Le prix** : le binaire ne tourne plus que sur des processeurs qui ont ces
instructions — copié sur une machine plus ancienne, il s'arrête au démarrage
(« illegal instruction »). `native` désigne la machine qui compile : un tel
binaire ne se distribue pas.

**Le dépôt livre donc deux binaires** (ADR-0031) : celui de base, qui
tourne partout, et un binaire **AVX2** compilé pour `x86-64-v3` — le jeu
d'instructions commun aux processeurs x86 depuis Intel Haswell (2013) et AMD
Zen (2017), hors certains Pentium, Celeron et Atom :

```sh
tools/binaires.sh            # dist/shallowred et dist/shallowred-avx2
```

Le script construit les deux et **vérifie qu'ils cherchent le même arbre**
avant de les rendre. La CI fait de même à chaque push, et publie les binaires
de chaque commit de `main` en artefact — ceux de Linux, de Windows et des deux
sortes de Mac (ci-dessous).

Il cherche **le même arbre** que celui de base — le code est entier, le
compilateur ne change que la façon de calculer —, **plus vite** avec le
réseau qui joue (ADR-0031 ; la mesure : J-2026-11-18-D). S'il s'arrête au démarrage, la machine n'a pas l'AVX2 :
prendre celui de base. **Les matchs du dépôt se jouent avec le binaire
AVX2** ; leurs deux camps sont toujours compilés de la même façon, donc ce
choix ne fausse aucun verdict.

### Windows et macOS

Le même script tourne sous **Windows** — dans Git Bash, avec Rust et Python
installés — et sous **macOS**. Il y construit :

| système | binaires |
|---|---|
| Linux, Windows, Mac Intel | `shallowred` (de base) et `shallowred-avx2` — `.exe` sous Windows |
| Mac Apple Silicon, Linux ARM | `shallowred` seul : l'AVX2 est propre aux processeurs x86 |

**Le bon binaire se construit tout seul sur la machine qui le fera
tourner** — il n'y faut que Rust, installé par `rustup`, et sous Windows les
outils de compilation C++ que `rustup` demande d'installer. `cargo build
--release` y donne celui de base, qui tourne toujours ; sur un processeur x86
qui a l'AVX2 :

```sh
RUSTFLAGS="-C target-cpu=x86-64-v3" cargo build --release       # Linux, macOS, Git Bash
```

```powershell
$env:RUSTFLAGS = "-C target-cpu=x86-64-v3"; cargo build --release    # PowerShell
```

`x86-64-v3` plutôt que `native` : `native` prend tout ce qu'a le processeur
qui compile, l'AVX-512 compris là où il existe, et l'AVX-512 n'a rien
rapporté ici (la mesure : J-2026-11-18-D). `x86-64-v3` est exactement le binaire que mesurent les matchs
du dépôt.

**La CI construit les binaires des quatre systèmes** — Linux, Windows, Mac
Intel, Mac Apple Silicon — à chaque PR et à chaque commit de `main`, et
**exige que les quatre cherchent le même arbre** : le banc fait main et les
six positions au réseau, nœuds et coup. Sur `main`, ils partent en artefact,
dans l'onglet *Actions* du dépôt, pour 90 jours : `shallowred-linux-…`,
`shallowred-windows-…`, `shallowred-macos-intel-…`,
`shallowred-macos-arm64-…`, une archive `.tar.gz` hors Windows pour que
le binaire reste exécutable. Un binaire téléchargé sur Mac est mis en
quarantaine : `xattr -d com.apple.quarantine shallowred` avant de le lancer
— ou le construire sur place, qui l'évite.

## Vérifier

La correction de la génération de coups se prouve par perft : le décompte exact
des nœuds de l'arbre à profondeur fixe. Un seul coup généré en trop ou en moins,
n'importe où, et le total est faux.

```sh
tools/verify.sh                                 # tout, un seul code de sortie
tools/verify.sh --rapide                        # fmt, clippy, tests debug

cargo test --workspace                          # tests rapides
cargo test --workspace --release -- --ignored   # perft complet + tournoi contre le hasard
```

Le second critère est plus grossier et tout aussi contraignant : le moteur joue
vingt-quatre parties entières contre un adversaire qui tire ses coups au sort,
depuis douze ouvertures et des deux côtés. Une seule nulle est un échec.

Les six positions de référence et leurs totaux sont dans
[`engine/tests/perft.rs`](engine/tests/perft.rs).

### Ce que les tests ne voient pas

Une suite de tests verte ne dit pas quelles lignes elle surveille réellement.
`cargo mutants` altère le code une mutation à la fois : un mutant **survivant**
est une modification que toute la suite accepte, donc une ligne dont rien ne
vérifie le comportement.

```sh
tools/mutants.sh --file engine/src/tt.rs
```

Trop lent pour bloquer une pull request, donc hebdomadaire : le workflow `Mutation` tourne le mardi et confronte le résultat
au plafond de [`.github/mutation-baseline.txt`](.github/mutation-baseline.txt),
qui porte aussi la raison de chaque valeur non nulle. Le cliquet casse à la
hausse et se contente de signaler la baisse.

Ce que le balayage **ne** mesure **pas** : la force de jeu. Un survivant portant
sur une valeur d'évaluation ou une marge d'élagage n'est pas un défaut — seul un
SPRT peut en juger.

## Mesurer

```sh
cargo run --release --bin shallowred -- bench 7
```

Charge de travail fixe : six positions, recherche à profondeur imposée. La
sortie se termine par `Nodes/second` et deux commits se comparent par un `diff`.

Le **nombre de nœuds** est la mesure utile, parce qu'il est déterministe : il ne
dépend ni de la machine ni de sa charge.

Référence à la profondeur 7 : **77 429** nœuds.

Ce chiffre est vérifié par la CI — voir
[`engine/tests/bench_reference.rs`](engine/tests/bench_reference.rs).

## Mesurer la force

```sh
tools/setup-arbiters.sh
tools/sprt.sh /tmp/candidat /tmp/reference
```

Le test séquentiel s'arrête dès que les données suffisent à trancher. Détail
dans [`tools/README.md`](tools/README.md).

**Chaque verdict porte sa cadence**, et une technique standard entre par le
SPRT comme toutes les autres, parfois pour en être rejetée. Les verdicts
sont au journal de la mémoire, `memory/journal/`, chacun dans son entrée.

## Dépendances

La génération de coups s'appuie sur [`cozy-chess`](https://crates.io/crates/cozy-chess).
Ce choix est mesuré, pas idéologique (ADR-0008) : le générateur pèse peu dans
le coût d'un nœud de recherche, et en écrire un n'achèterait pas de performance
mesurable.

⚠️ `cozy-chess` emploie la notation roi-prend-tour pour le roque (`e1h1`) afin de
supporter le Chess960, alors qu'UCI attend `e1g1`. La conversion est faite à la
frontière UCI ; ne jamais afficher un `Move` brut.

## Remerciements

Les réseaux NNUE N2L et N4L — embarqués du 2 au 13 oct. 2026, et conservés
dans `reseaux/` — sont entraînés sur des [données fournies par le projet
Leela Chess Zero](https://storage.lczero.org/files/training_data), mises à
disposition sous l'[Open Database
License](https://opendatacommons.org/licenses/odbl/odbl-10.txt) (ODbL) —
converties au format `.binpack` par des contributeurs de Stockfish (voir
`tools/README.md`, « Entraîner un réseau »). Le réseau embarqué depuis le 22 oct., N9w50s800
— comme N8tw50s800, N7p4, N6r4, N5l et N4 avant lui —, n'apprend que sur les
parties du moteur.

## Licence

[AGPL-3.0-or-later](LICENSE). Si vous modifiez ce code et le faites tourner
derrière un réseau, vous devez en proposer les sources à vos utilisateurs.
