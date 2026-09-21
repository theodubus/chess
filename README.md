# ShallowRed

Un moteur d'échecs UCI écrit en Rust, et l'interface qui va avec.

Le nom est un contrepied de Deep Blue, doublé de la couleur de la rouille et
d'un aveu sur la profondeur de recherche.

> Statut : **recherche et évaluation en place, monothread**. Negamax avec
> élagage alpha-bêta, approfondissement itératif, quiescence, table de
> transposition et ordonnancement des coups, plus **des élagages avancés
> mesurés un par un** — coup nul, réduction des coups tardifs, fenêtres
> d'aspiration, élagage delta en quiescence, futilité inverse, et l'élagage
> par **échange statique** en quiescence. L'évaluation
> couvre matériel, tables piece-square, paire de fous, mobilité, sécurité du
> roi, structure de pions et colonnes de tours.
> Chaque changement de recherche passe par un **SPRT** ; les verdicts, leurs
> effectifs et leur cadence sont dans `tools/README.md`. Plusieurs sont
> **négatifs** et ont fait retirer le changement mesuré — y compris des
> techniques que tous les manuels recommandent. Il gagne toutes ses parties
> contre un adversaire jouant au hasard.
>
> **Réserve, mesurée le 16 sept. 2026 :** les premiers verdicts du projet ont
> tous été rendus à la cadence `1+0,01`, où le moteur atteint la profondeur
> médiane 8,5. **Un verdict appartient à sa cadence**, et deux mesures le
> montrent, sous deux formes : l'élagage par compte de coups **change de
> signe** entre `1+0,01` et `8+0,08` (−21,6 → +15,3, p = 0,0013), et les
> fenêtres d'aspiration **valent 2,7 fois plus** au régime le plus profond
> (−18,9 → −51,6 au retrait, p ≈ 0,0004). Même sens dans les deux cas :
> mesurer court sous-estime ce dont la valeur croît avec la profondeur. La
> revalidation à cadence longue est en cours.
>
> **Dernier gain mesuré (C19) :** l'élagage par **échange statique** en
> quiescence — les captures qui perdent du matériel n'y sont plus examinées.
> **+33,59 Elo ± 12,00** sur 1608 parties à `8+0,08`, H1 accepté ; **+18,84
> ± 15,41** sur 960 parties à `30+0,3`. Positif aux deux cadences, sans
> inversion. Déterministe : **−33 % de nœuds** à la profondeur 7.
> Il n'a encore ni recherche parallèle, ni NNUE.

## Structure

| Dossier | Contenu | Statut |
|---|---|---|
| `engine/` | Moteur UCI en Rust | Recherche et évaluation, monothread |
| `ui/` | Interface TypeScript | Pas démarré — consignes dans `ui/CLAUDE.md` |
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

Référence à la profondeur 7 : **148 786** nœuds.

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

**Chaque verdict porte sa cadence**, table complète dans
[`tools/README.md`](tools/README.md). Les deux extrêmes disent l'essentiel de
la méthode : la table de transposition vaut **+164,3 Elo ± 31,3**, et la
recherche à variante principale — qui est dans tous les manuels — a été
**rejetée à −10,9 Elo** sur 4214 parties. Une technique standard entre par le
SPRT comme toutes les autres.

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
