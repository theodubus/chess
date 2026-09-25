# ShallowRed

Un moteur d'échecs UCI écrit en Rust, et l'interface qui va avec.

Le nom est un contrepied de Deep Blue, doublé de la couleur de la rouille et
d'un aveu sur la profondeur de recherche.

> Statut : **recherche et évaluation en place, monofil par défaut** —
> plusieurs fils par l'option `Threads` (Lazy SMP, 24 sept. 2026 : deux fils
> valent **+42 ± 9 Elo** contre un à `8+0,08`, voir `tools/README.md`). Negamax avec
> élagage alpha-bêta, approfondissement itératif, quiescence, table de
> transposition et ordonnancement des coups — générés par étapes depuis le
> 24 sept., **+23 ± 6 Elo** à `8+0,08` —, plus **des élagages avancés
> mesurés un par un** — coup nul, réduction des coups tardifs, fenêtres
> d'aspiration, élagage delta en quiescence, futilité inverse, l'élagage par
> **échange statique** en quiescence et l'**élagage par compte de coups**.
> L'évaluation
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
> médiane 8,5. **Un verdict appartient à sa cadence**, et la revalidation à
> cadence longue le montre sous deux formes. Le **signe change** : l'élagage
> par compte de coups, au seuil 6, passe de −21,6 à +15,3 entre `1+0,01` et
> `8+0,08` (p = 0,0013) ; le seuil 12 bascule lui aussi. La **magnitude se multiplie** : les
> fenêtres d'aspiration valent 2,7 fois plus au régime profond (−18,9 → −51,6
> au retrait, p ≈ 0,0004), et sécurité du roi + structure de pions + colonnes
> de tours 2,5 fois plus (+14,9 annoncé, **−37,5 ± 13,4 au retrait** le
> 22 sept.). Même sens à chaque fois : *mesurer court sous-estime ce dont la
> valeur croît avec la profondeur*.
>
> **Mais un acquis peut fondre par EMPILEMENT, et c'est mesuré depuis le
> 22 sept. :** l'élagage delta en quiescence valait **+32,5 Elo** à `1+0,01` ;
> remesuré à `8+0,08` sur une base qui a gagné l'échange statique entre-temps,
> son retrait ne coûte plus que **−1,5 ± 7,8**, sans verdict. Les deux coupent
> les mêmes captures au même endroit. Il reste dans le moteur — rien
> n'autorise à le retirer — mais il ne vaut plus ce qui est écrit.
>
> **Deux gains mesurés à `8+0,08` :** l'élagage par **échange statique** en
> quiescence — les captures qui perdent du matériel n'y sont plus examinées —
> vaut **+33,59 Elo ± 12,00** sur 1608 parties, et **+18,84 ± 15,41** sur 960
> parties à `30+0,3` : positif aux deux cadences, sans inversion. Puis
> l'**élagage par compte de coups**, **+22,85 ± 9,88** sur 2436 parties —
> **la même technique avait été rejetée deux fois à `1+0,01`** (−25,2 et
> −12,6). C'est la démonstration la plus nette de la réserve ci-dessus.
>
> **La gestion du temps entre dans les acquis mesurés, le 23 sept. 2026.**
> Le moteur s'alloue `restant / movestogo` par coup, avec une échéance douce
> qui lui interdit d'entamer une itération qu'il ne finira pas. Le diviseur
> par défaut passe de trente à douze : **+19,13 ± 6,31 Elo à `8+0,08` sur
> 6 000 parties**, deux matchs à longueur fixe mis en commun, zéro perte au
> temps. Le SPRT qui avait expiré en chemin rendait +14,59 — *un test
> séquentiel interrompu minore, et c'est ici sa première confirmation*.
> **Le diviseur a atteint sa limite** : le plafond d'une allocation plate vaut
> `(pendule + coups × inc) / coups`, et le balayage y butte déjà. Aller plus
> loin demande une allocation **inégale**, pas un autre réglage.
> **Premier pas le 24 sept. : laisser finir l'itération entamée** au lieu de
> la jeter — **+44,6 ± 6,2 Elo** à `8+0,08`, sans chercher plus profond en
> moyenne : le temps va aux positions difficiles, où l'itération dure.
> **Puis, le même jour, s'arrêter plus tard quand le coup vient de changer**
> et plus tôt quand il tient depuis sept itérations — **+7,9 ± 6,1 Elo**
> à `8+0,08`, zéro perte au temps. **Et il ne s'affame plus avant un
> contrôle à coups comptés** (quarante coups en X) : un coup ne dépense
> plus la pendule des suivants — à `40/8`, +2,4 ± 6,0 Elo, zéro perte au
> temps, un correctif fusionné au titre de la règle.
>
> **Il sait pondérer depuis le 23 sept. 2026** — réfléchir pendant le temps
> de l'adversaire, sur le coup qu'il prévoit — mais seulement si l'interface
> l'active : l'option `Ponder` est désactivée par défaut, comme chez
> Stockfish, Ethereal et Leela. Désactivé, rien ne change, au nœud près et en
> vitesse. **Activé, il vaut +67,6 ± 9,2 Elo à `8+0,08` contre lui-même**
> (2 700 parties, zéro perte au temps) : la prévision y tombe juste sur 70 %
> des coups, et il cherche 0,94 pli plus profond. Contre un autre adversaire
> le chiffre change — prévoir un jumeau est le cas le plus facile. Et sur les
> machines de mesure, qui n'ont que deux cœurs physiques, le camp qui pondère
> prend 3 à 5 % de vitesse à l'autre : 3 à 10 Elo de ce chiffre en viennent
> (estimation, mesurée le 23 sept.).
>
> Il n'a pas encore de NNUE.

## Structure

| Dossier | Contenu | Statut |
|---|---|---|
| `engine/` | Moteur UCI en Rust | Recherche et évaluation — un fil par défaut, plusieurs par l'option `Threads` |
| `ui/` | Interface TypeScript | **En chantier, mené séparément** — consignes dans `ui/CLAUDE.md` |
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

Référence à la profondeur 7 : **107 548** nœuds.

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
