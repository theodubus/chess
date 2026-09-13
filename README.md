# chess

Un moteur d'échecs UCI écrit en Rust, et l'interface qui va avec.

> Statut : **phase 0**. Le protocole UCI fonctionne de bout en bout, mais la
> recherche est un coup légal tiré au sort. Le moteur est jouable et
> mesurable ; il n'est pas encore fort.

## Structure

| Dossier | Contenu | Statut |
|---|---|---|
| `engine/` | Moteur UCI en Rust | Protocole complet, recherche à écrire |
| `ui/` | Interface TypeScript | Pas démarré |
| `tools/` | Matchs moteur contre moteur, SPRT | Pas démarré |

Le moteur et l'interface ne communiquent que par le protocole UCI sur
stdin/stdout. Le moteur ignore tout de l'interface, de la notion de partie et
de la persistance : il reçoit une position et un budget de temps, il rend un
coup.

## Démarrer

```sh
cargo run --release --bin chess-engine
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
cargo test --workspace                          # tests rapides
cargo test --workspace --release -- --ignored   # perft complet, ~2 s, 593 M nœuds
```

Les six positions de référence et leurs totaux sont dans
[`engine/tests/perft.rs`](engine/tests/perft.rs).

## Mesurer

```sh
cargo run --release --bin chess-engine -- bench 5
```

Charge de travail fixe, sortie stable terminée par `Nodes/second` : deux commits
se comparent par un `diff`.

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
