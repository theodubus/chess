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
git stash && cargo build --release && cp target/release/shallowred /tmp/reference && git stash pop

tools/sprt.sh /tmp/candidat /tmp/reference
```

> **Attention** — `git stash` emporte *tout* le travail non committé, outils de
> mesure compris. Préférer `git worktree add --detach /tmp/ref <commit>` pour
> construire une référence : c'est isolé et sans effet de bord.

Le test séquentiel s'arrête dès que les données suffisent et rend
`H1 was accepted` (le changement est bon) ou `H0 was accepted` (il ne l'est
pas). Réglages par variable d'environnement, documentés en tête du script.

Bornes usuelles : `[0, 5]` pour un changement censé gagner, `[-5, 0]` pour
vérifier qu'une simplification ne coûte rien. Ce sont des conventions, pas des
valeurs démontrées pour ce projet.

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

## Mesures de référence

| date | changement | verdict |
|---|---|---|
| 2026-09-13 | C9 (table de transposition, killers, historique) contre pré-C9 | **H1 accepté** — +164,3 Elo ± 31,3 sur 488 parties, cadence 1+0,01 |
| 2026-09-13 | Élagage par coup nul contre C10 | **H1 accepté** — +75,1 Elo ± 19,7 sur 864 parties, cadence 1+0,01 |
| 2026-09-13 | Réduction des coups tardifs (LMR) contre le coup nul | **H1 accepté** — +69,1 Elo ± 18,3 sur 892 parties, cadence 1+0,01 |
| 2026-09-14 | Fenêtres d'aspiration contre LMR | **H1 accepté** — +29,7 Elo ± 11,9 sur 2042 parties, cadence 1+0,01 |
| 2026-09-14 | Recherche à variante principale (PVS) contre les fenêtres d'aspiration | **H0 accepté** — **−10,9 Elo ± 7,9** sur 4214 parties, cadence 1+0,01. Changement retiré. |
| 2026-09-14 | Mobilité dans l'évaluation | **H1 accepté** — +62,6 Elo ± 17,2 sur 942 parties, cadence 1+0,01 |
| 2026-09-14 | Sécurité du roi, structure de pions et tours sur colonne ouverte, valeurs conventionnelles | **H1 accepté** — +14,9 Elo ± 8,2 sur 4474 parties, cadence 1+0,01 |
| 2026-09-14 | Les mêmes termes, valeurs réglées par ajustement Texel | **H0 accepté** — **−10,0 Elo ± 8,3** sur 5128 parties. Réglage retiré. |
| 2026-09-14 | Élagage delta en quiescence | **H1 accepté** — +32,5 Elo ± 12,3 sur 1822 parties, cadence 1+0,01 |

**Le nombre de nœuds n'est pas une mesure de force.** Sept mesures le disent
maintenant, et elles ne s'ordonnent pas de la même façon :

| changement | nœuds | Elo |
|---|---|---|
| table de transposition, killers, historique | ÷ 5,83 | +164 |
| coup nul | ÷ 2,52 | +75 |
| réduction des coups tardifs | ÷ 5,73 | +69 |
| fenêtres d'aspiration | ÷ 1,07 | +30 |
| **recherche à variante principale (PVS)** | **÷ 1,03** | **−11** |
| **mobilité dans l'évaluation** | **× 1,29** | **+63** |
| élagage delta en quiescence | ÷ 1,68 | +33 |

Les deux dernières lignes sont les plus instructives. PVS explore **moins** de
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
