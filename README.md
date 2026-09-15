# ShallowRed

Un moteur d'échecs UCI écrit en Rust, et l'interface qui va avec.

Le nom est un contrepied de Deep Blue, doublé de la couleur de la rouille et
d'un aveu sur la profondeur de recherche.

> Statut : **recherche et évaluation en place, monothread**. Negamax avec
> élagage alpha-bêta, approfondissement itératif, quiescence, table de
> transposition et ordonnancement des coups, plus trois élagages avancés
> mesurés un par un — coup nul, réduction des coups tardifs, fenêtres
> d'aspiration. L'évaluation couvre matériel, tables piece-square, paire de
> fous, mobilité, sécurité du roi, structure de pions et colonnes de tours.
> **Huit verdicts SPRT, dont deux négatifs** qui ont fait retirer le changement
> mesuré. Il gagne toutes ses parties contre un adversaire jouant au hasard.
> Il n'a encore ni recherche parallèle, ni NNUE, ni interface.

## Structure

| Dossier | Contenu | Statut |
|---|---|---|
| `engine/` | Moteur UCI en Rust | Recherche et évaluation, monothread |
| `ui/` | Interface TypeScript | Pas démarré |
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

Trop lent pour bloquer une pull request — 982 mutants, environ une heure — donc
hebdomadaire : le workflow `Mutation` tourne le mardi et confronte le résultat
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

Référence à la profondeur 7 : **223 577** nœuds.

Ce chiffre est vérifié par la CI — voir
[`engine/tests/bench_reference.rs`](engine/tests/bench_reference.rs). Il a
longtemps annoncé `8 432 521`, la valeur d'avant l'élagage par coup nul, sans
que rien ne le signale.

## Mesurer la force

```sh
tools/setup-arbiters.sh
tools/sprt.sh /tmp/candidat /tmp/reference
```

Le test séquentiel s'arrête dès que les données suffisent à trancher. Détail
dans [`tools/README.md`](tools/README.md).

Première mesure de référence : la table de transposition vaut **+164,3 Elo
± 31,3** sur 488 parties en 1+0,01.

## Dépendances

La génération de coups s'appuie sur [`cozy-chess`](https://crates.io/crates/cozy-chess).
Ce choix est mesuré, pas idéologique : le générateur pèse 2 à 10 % du coût d'un
nœud de recherche, donc en écrire un n'achèterait pas de performance mesurable.

⚠️ `cozy-chess` emploie la notation roi-prend-tour pour le roque (`e1h1`) afin de
supporter le Chess960, alors qu'UCI attend `e1g1`. La conversion est faite à la
frontière UCI ; ne jamais afficher un `Move` brut.

## Licence

[AGPL-3.0-or-later](LICENSE). Si vous modifiez ce code et le faites tourner
derrière un réseau, vous devez en proposer les sources à vos utilisateurs.
