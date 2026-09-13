# ShallowRed — moteur d'échecs + UI

Monorepo. Le moteur est un binaire UCI en Rust ; l'interface est un projet
TypeScript qui pilote n'importe quel moteur UCI, y compris celui-ci.

## Structure

- `engine/` — Rust, binaire UCI. Ne connaît ni l'interface, ni la notion de partie.
- `ui/` — TypeScript. Pas encore démarré.
- `tools/` — arbitres de match, livre d'ouvertures, SPRT. Voir `tools/README.md`.

## Décisions structurantes

Ces points sont tranchés. Les rouvrir demande un fait technique nouveau —
une mesure, pas une préférence.

- **Génération de coups : `cozy-chess`**, pas un générateur maison. Mesuré : le
  générateur pèse 2 à 10 % du coût d'un nœud de recherche, donc en écrire un
  n'achèterait pas de performance mesurable.
- **Copy-make, pas make/unmake.** `cozy-chess` n'expose pas d'`unmake` et les
  champs de son `Board` sont privés. Un `Board` fait 104 octets : la copie est
  bon marché.
- **UCI est l'unique frontière** entre le moteur et le reste du monde.
- **Licence AGPL-3.0-or-later** sur tout le dépôt.

## Invariants du moteur

- **Le roque se convertit à la frontière UCI.** `cozy-chess` emploie la notation
  roi-prend-tour (`e1h1`) pour supporter le Chess960 ; UCI attend `e1g1`. Toute
  entrée passe par `cozy_chess::util::parse_uci_move`, toute sortie par
  `display_uci_move`. **Ne jamais afficher un `Move` brut.**
- **Toute sortie est suivie d'un `flush`.** Sans cela l'interface attend
  indéfiniment une réponse déjà écrite.
- **Le moteur ne conserve aucun état entre deux commandes `position`.** Pas de
  partie, pas de PGN, pas de joueurs, pas de persistance.
- **Une fonction qui répond à une question ne mute rien.** Pas de `&mut self`
  sur un chemin de lecture — le compilateur rend la faute inexprimable, le
  laisser faire son travail.
- **`is_attacked` est une primitive géométrique** et ne rappelle jamais la
  légalité. Une pièce clouée attaque quand même.
- **La recherche s'écrit en negamax**, jamais en minimax à deux branches. La
  négation rend l'alternance structurelle au lieu de dépendre d'un `if`.
- **Scores de mat = `±(MATE - ply)`.** Bornes d'initialisation = `i32::MIN + 1`,
  jamais un nombre rond choisi avant les scores de mat.
- **Recherche déterministe.** Aucun hasard non seedé, jamais. Le tirage au sort
  conservé comme adversaire de référence est seedé par le hash Zobrist.
  **Nuance depuis la table de transposition** : le résultat dépend désormais de
  l'état de la table, donc de l'historique de la recherche. Même position *et*
  même table donnent le même coup ; même position seule ne suffit plus. C'est
  le comportement normal d'un moteur, pas une entorse à l'invariant.
- **Un score de mat stocké dans la table doit être normalisé du ply.** Un mat
  vaut `±(MATE - ply)`, donc il dépend de l'endroit d'où on le regarde. Stocker
  tel quel et relire ailleurs annonce un mat faux. `score_to_tt` et
  `score_from_tt` s'en chargent — c'est la source de bug la plus classique
  d'une table de transposition.
- **Pas de coupure par la table à la racine.** Il y faut un coup à jouer, pas
  seulement un score.
- **Une itération d'approfondissement interrompue est jetée**, jamais acceptée :
  ses coups ont été explorés dans le désordre, son résultat est partiel.
- **`captured_piece` est la seule façon de savoir si un coup capture.** Lire la
  case d'arrivée ne suffit pas : le roque y porte notre propre tour, et la prise
  en passant la laisse vide.
- **Un coup illégal produit par le moteur est un `panic!` en debug**, jamais un
  avertissement ignoré. Si le code ment, plus rien n'est déboguable.

## Contraintes d'architecture

À respecter dès maintenant : chacune coûte cher en rétrofit.

- **Drapeau d'arrêt atomique** consulté par la recherche — déjà en place, c'est
  ce qui rend `stop` et `go infinite` corrects.
- **Pile de clés Zobrist** pour la détection de répétition — déjà en place dans
  `Position`.
- **Pile d'accumulateurs NNUE par ply**, le jour où NNUE arrive. L'accumulateur
  pèse 1 à 4 Ko : il ne peut pas être copié par nœud.
- **Génération par étapes** — en place via `ordered_moves(board, tactical_only)`.
  Reste à faire : ne pas matérialiser tous les coups avant d'en trier.
- **Coup compacté sur 16 bits pour le stockage** — en place, `tt::pack_move`.
  La valeur zéro code `a1a1`, jamais légal, et sert de marqueur d'absence.

## Ce qui compte comme preuve

| Affirmation | Preuve exigée |
|---|---|
| « la génération de coups est correcte » | `cargo test --release -- --ignored` passe les six positions de `engine/tests/perft.rs`. Rien d'autre. |
| « ce changement de recherche est bon » | `tools/sprt.sh <candidat> <référence>` rend `H1 was accepted`. Une impression n'est pas une mesure. La CI, elle, exige en permanence vingt-quatre victoires sur vingt-quatre contre le hasard — c'est un garde-fou, pas une mesure de force. |
| « cette valeur d'évaluation est meilleure » | Idem, par SPRT. **Les valeurs de `eval.rs` ne sont pas réglées** : ce sont des valeurs conventionnelles, à améliorer par la mesure et non par l'intuition. |
| « l'arbitre de mesure est fiable » | `tools/crosscheck.sh` : deux arbitres indépendants jouent le même match et s'accordent. À relancer après toute modification de la couche UCI. |
| « c'est plus rapide » | `cargo run --release --bin shallowred -- bench`, même machine, avant et après. Comparer d'abord le **nombre de nœuds**, qui est déterministe ; les nœuds par seconde varient d'un run à l'autre. |

## Pièges de mesure, appris à nos dépens

- **Ne jamais construire une référence avec `git stash`.** Il emporte tout le
  travail non committé, outils de mesure compris — on finit par mesurer autre
  chose que ce qu'on croit. Utiliser `git worktree add --detach /tmp/ref <commit>`.
- **Vérifier que le binaire a bien été reconstruit.** `mv` et `cp -p`
  préservent les dates de modification, donc cargo peut juger les sources
  périmées et ne rien recompiler : on mesure alors l'ancien binaire. Un
  rapport avant/après d'exactement 1,00 en est le symptôme.
- **Contrôler la vraisemblance avant d'inscrire un chiffre.** Un rapport
  parfaitement rond, nul, ou de plusieurs ordres de grandeur est un signe de
  protocole cassé, pas un résultat.
- **Les arbitres impriment un score courant après chaque partie.** Lire la
  dernière ligne, jamais la première.
- **Un livre d'ouvertures est une condition de validité**, pas un agrément :
  le moteur étant déterministe, sans livre toutes les parties d'un match sont
  la même partie.

## Style

- Tests écrits en même temps que le code, pas après.
- Pas d'`unwrap()` ni d'`expect()` hors des tests — la lint les signale.
- Pas d'`unsafe` : la lint l'interdit.
- Commentaires en français, code et identifiants en anglais.
- Un commentaire explique **pourquoi**, pas **quoi**. Les techniques non
  évidentes (magic bitboards, encodage des coups, conventions UCI) se
  documentent : une session future doit pouvoir reprendre sans tout redécouvrir.

## Commandes

```sh
cargo test --workspace                      # tests rapides
cargo test --workspace --release -- --ignored  # perft complet, ~2 s
cargo clippy --all-targets -- -D warnings
cargo fmt --all
cargo run --release --bin shallowred      # boucle UCI
cargo run --release --bin shallowred -- bench 7   # référence : 8 432 521 nœuds

tools/setup-arbiters.sh                    # construit fastchess
tools/sprt.sh <candidat> <référence>       # verdict sur un changement
tools/crosscheck.sh                        # les deux arbitres s'accordent-ils
```
