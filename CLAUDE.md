# ShallowRed — moteur d'échecs + UI

Monorepo. Le moteur est un binaire UCI en Rust ; l'interface est un projet
TypeScript qui pilote n'importe quel moteur UCI, y compris celui-ci.

## Structure

- `engine/` — Rust, binaire UCI. Ne connaît ni l'interface, ni la notion de partie.
- `ui/` — TypeScript. **Chantier parallèle, avec son propre `ui/CLAUDE.md`
  qui fait autorité sous `ui/`.** Rien de ce fichier-ci ne s'y applique :
  une interface n'a pas de force de jeu, donc ni SPRT, ni perft, ni bench.
- `tools/` — arbitres de match, livre d'ouvertures, SPRT. Voir `tools/README.md`.

## Par où commencer, sans contexte

Ce fichier dit **comment** travailler : invariants, ce qui compte comme preuve,
pièges déjà payés. Il ne dit pas **où on en est**.

- L'état du moteur : `README.md`, en tête.
- Les verdicts SPRT, avec leurs effectifs, leurs bornes **et leur cadence** :
  `tools/README.md`, section *Mesures de référence*. Le compteur n'est pas
  recopié ici : il vit dans le tableau, et une prose qui le duplique naît
  périmée.
- Ce qui s'exécute sans qu'on l'appelle : section *Ce qui tourne tout seul*,
  plus bas.
- Ce sur quoi travailler : **demander**. Le dépôt ne porte pas de feuille de
  route, et en deviner une reviendrait à rouvrir des questions déjà tranchées.

## Décisions structurantes

Ces points sont tranchés. Les rouvrir demande un fait technique nouveau —
une mesure, pas une préférence.

- **Génération de coups : `cozy-chess`**, pas un générateur maison. Mesuré : le
  générateur pèse 2 à 10 % du coût d'un nœud de recherche, donc en écrire un
  n'achèterait pas de performance mesurable.
- **Copy-make, pas make/unmake.** `cozy-chess` n'expose pas d'`unmake` et les
  champs de son `Board` sont privés. Un `Board` fait 104 octets : la copie est
  bon marché. **Mesuré le 14 sept. 2026 : le copy-make pèse 7,2 % du temps
  d'un nœud de recherche.** Et il ne ferme pas la porte à NNUE — voir la
  contrainte d'architecture correspondante.
- **La cible est la force GÉNÉRALE, pas la force en blitz.** Théo,
  16 sept. 2026 : « *à terme je veux que le moteur soit fort en général, pas
  que en blitz.* » Ce n'est pas une nuance de confort : les douze premiers
  verdicts du projet ont été rendus à `1+0,01`, où le moteur atteint la
  profondeur 8,5 — et l'un d'eux **change de signe** à `8+0,08`. **Une mesure
  de force appartient à sa cadence** ; mesurer court revient à optimiser pour
  un régime qui n'est pas la cible. Conséquence : la cadence d'un verdict est
  la plus longue à laquelle on obtienne encore un verdict, et `1+0,01` ne sert
  plus qu'à dégrossir, jamais à trancher.
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
- **Le coup nul est interdit sans pièce autre que pions et roi.** Son hypothèse
  est « avoir le trait est un avantage » ; le zugzwang est exactement le cas
  contraire, et il devient courant en finale de pions. Sans cette garde, le
  moteur surévalue les positions perdues et y entre en croyant gagner. Voir
  `has_non_pawn_material`.
- **Un score de mat obtenu après un coup nul n'est pas rendu tel quel.** Il
  viendrait d'un coup qu'on n'a pas le droit de jouer.
- **Une réduction de coup tardif se rattrape toujours.** Si la recherche
  réduite dépasse `alpha`, on recommence à profondeur pleine — sans quoi un bon
  coup mal classé serait perdu. On ne réduit jamais les captures, les
  promotions, les coups qui donnent échec, ni les positions où l'on est en
  échec : tous sont forcés ou trompeurs à faible profondeur.
- **Un mat se détecte à DEUX endroits, et un test n'en couvre qu'un.**
  `negamax` rend `-MATE + ply` quand aucun coup n'est légal ; la quiescence a
  sa propre branche. À faible profondeur le mat tombe dans la quiescence, donc
  **un test de mat en un ne passe jamais par negamax**. Les deux branches se
  testent séparément, en appelant `negamax` directement avec une profondeur
  restante. Sans cela, le signe du score de mat de negamax peut s'inverser
  sans qu'un seul test bronche — une position matée valant alors un gain
  écrasant.
- **L'échéance douce se déclenche quand le budget est dépassé, jamais avant.**
  Inverser sa comparaison ferait cesser l'approfondissement dès la première
  itération : le moteur jouerait **toute une partie à la profondeur 1** dès
  qu'une pendule est présente, sans rien signaler. Les tests de budget
  vérifient qu'on s'arrête à temps ; il en faut un pour vérifier qu'on ne
  s'arrête pas trop tôt.
- **La graine du tirage au sort est forcée impaire.** `random_seed(hash)`
  pose le bit de poids faible parce que **zéro est un point fixe de
  xorshift64** : un état nul rendrait toujours zéro, donc toujours le premier
  coup. Le tournoi de vingt-quatre parties du critère d'acceptation mesurerait
  alors une victoire contre un adversaire quasi déterministe.
- **`ahead_of` est de la géométrie, pas un réglage.** C'est le seul support de
  la détection de pion passé, et le reste d'`eval.rs` étant des valeurs, on
  oublie facilement que ces lignes-là sont des règles. Même chose pour le bras
  `Piece::Bishop` du filtre de mobilité — le supprimer ferait compter un fou
  comme une dame — et pour le `ET` du corridor de pion passé.
- **Une fenêtre d'aspiration s'élargit jusqu'à la fenêtre pleine.** Le pari
  « le score ne bougera pas » échoue parfois ; chaque échec doit élargir
  strictement, sinon la boucle ne termine pas. Sur échec par le bas, on
  recentre le plafond au lieu de le laisser haut : sans cela la fenêtre
  grandirait des deux côtés pour rien. Pas de pari sous l'itération
  `ASPIRATION_MIN_DEPTH` ni autour d'un score de mat — le score précédent n'y
  prédit rien.

## Contraintes d'architecture

À respecter dès maintenant : chacune coûte cher en rétrofit.

- **Drapeau d'arrêt atomique** consulté par la recherche — déjà en place, c'est
  ce qui rend `stop` et `go infinite` corrects.
- **Pile de clés Zobrist** pour la détection de répétition — déjà en place dans
  `Position`.
- **Pile d'accumulateurs NNUE par ply**, le jour où NNUE arrive. L'accumulateur
  pèse 1 à 4 Ko : il ne peut pas être copié par nœud — mais il n'a pas à
  l'être. Il vit dans une pile indexée par ply appartenant à `Search`, jamais
  dans le `Board`, et le copy-make ne l'y oblige pas.
  **Vérifié le 14 sept. 2026, pas supposé** : `tools/src/bin/nnue_probe.rs`
  dérive les modifications de l'accumulateur du seul plateau parent et du coup,
  sans rien demander au `play_unchecked` opaque de `cozy-chess`. La dérivation
  est confrontée à la vérité terrain sur 283 677 coups — 3 255 roques, 48
  prises en passant, 13 628 promotions — sans un seul écart, et coûte **2,8 %
  du temps d'un nœud**. Ne pas réécrire cette dérivation de tête le jour venu :
  le roque en notation roi-prend-tour et la prise en passant sont exactement
  les cas qu'on rate.
- **Génération par étapes** — **pas en place**. `ordered_moves` remplit d'un
  bloc une tranche de l'ardoise (`buffer: &mut [(Move, i32)]`, une par ply,
  allouée une seule fois avec la recherche) puis la trie entièrement ; seul le
  **filtre tactique** de la quiescence existe (`tactical_only`, qui restreint
  les destinations par un `AND` de bitboards). La génération par étapes
  proprement dite — produire les captures, s'arrêter sur coupure bêta, ne
  générer les coups tranquilles que si nécessaire — reste entièrement à faire.
- **Coup compacté sur 16 bits pour le stockage** — en place, `tt::pack_move`.
  La valeur zéro code `a1a1`, jamais légal, et sert de marqueur d'absence.
- **Table de transposition partagée, le jour où la recherche devient
  parallèle.** Pas en place, et c'est le seul endroit du dépôt où le design
  actuel bloque une fonctionnalité déjà prévue : `store` prend `&mut self`,
  ce qui est inexprimable quand plusieurs threads écrivent dans la même table.
  Le passage à des entrées atomiques (XOR clé/données, qui rend détectable une
  entrée déchirée sans verrou) est une réécriture contenue de `tt.rs` plus un
  changement de signature qui traverse `search.rs`. Le coût ne croît pas avec
  le temps — ce n'est pas une dette cumulative — mais il ne faut pas le
  découvrir le jour où l'on écrit Lazy SMP.

## Ce qui compte comme preuve

| Affirmation | Preuve exigée |
|---|---|
| « la génération de coups est correcte » | `cargo test --release -- --ignored` passe les six positions de `engine/tests/perft.rs`. Rien d'autre. |
| « ce changement de recherche est bon » | `tools/sprt.sh <candidat> <référence>` rend `H1 was accepted`. Une impression n'est pas une mesure. La CI, elle, exige en permanence vingt-quatre victoires sur vingt-quatre contre le hasard — c'est un garde-fou, pas une mesure de force. |
| « cette valeur d'évaluation est meilleure » | **Le SPRT, et rien d'autre — surtout pas une erreur de prédiction.** Mesuré le 14 sept. 2026 : un ajustement Texel des valeurs prédisait le résultat des parties **7,8 % mieux** sur 66 376 positions tenues à l'écart, et jouait **25 Elo plus mal** (−9,96 contre +14,92, deux SPRT). Le jeu de validation partage les corrélations du corpus, donc il ne peut pas distinguer une corrélation d'une cause — et le moteur, lui, *agit* sur son évaluation. **Une erreur de prédiction tenue à l'écart n'est pas un substitut à la force de jeu.** Les valeurs de `eval.rs` restent conventionnelles ; ne pas rouvrir le réglage sans corpus nettement plus grand ni contrainte de structure. |
| « il manque un terme à l'évaluation » | Un SPRT. **Mesuré : la mobilité vaut +62,6 Elo ± 17,2** ; sécurité du roi, structure de pions et tour sur colonne ouverte valent ensemble **+14,9 Elo ± 8,2**. Pour la recherche, un SPRT par changement reste absolu. Pour l'évaluation, les termes se groupent — individuellement ils valent quelques Elo et ne tranchent pas — mais la règle complète est **« grouper, puis bissecter à l'échec »** : c'est un match de bissection qui a séparé les termes du réglage et montré lequel des deux coûtait. |
| « ce code est testé » | `tools/mutants.sh`. Un mutant **survivant** est une modification du code que toute la suite accepte : une ligne dont rien ne vérifie le comportement. Le plafond par fichier vit dans `.github/mutation-baseline.txt`, et le balayage hebdomadaire (workflow `Mutation`, mardi) casse à la hausse, signale la baisse. **Ne dit rien de la force de jeu** : un survivant sur une valeur d'évaluation ou une marge d'élagage relève du SPRT, jamais d'un test unitaire. |
| « l'arbitre de mesure est fiable » | `tools/crosscheck.sh` : deux arbitres indépendants jouent le même match et s'accordent. À relancer après toute modification de la couche UCI. |
| « ce verdict vaut pour le moteur qu'on livrera » | **La cadence de mesure peut INVERSER un verdict — mesuré, pas redouté.** 16 sept. 2026, mêmes binaires, même livre, **même graine d'ouvertures**, même adjudication, même estimateur (1000 parties à longueur fixe chacun) : l'élagage par compte de coups vaut **−21,57 ± 16,71** à `1+0,01` et **+15,30 ± 15,08** à `8+0,08`. Écart **+36,9 Elo**, z = 3,21, **p = 0,0013**, intervalles disjoints. Le biais d'arrêt du SPRT ne vaut que 3,6 Elo : ce n'était pas l'explication. Profondeur médiane atteinte : **8,5** contre **12,5** — et **17,0** à ~30+0,3, le régime où le moteur jouera. **Les douze premiers verdicts du projet sont tous à `1+0,01`**, alors que `tools/sprt.sh` a pour défaut `8+0.08` depuis sa création — défaut jamais utilisé. Ce n'était pas un arbitrage, c'était une habitude. **Nommer la cadence d'un verdict, et ne jamais comparer deux verdicts de cadences différentes.** Mesurer long passe par `.github/workflows/match.yml`. |
| « ce changement vaut la peine d'être mesuré » | Budget estimé du verdict. Empiriquement, sur les quatre SPRT du projet, `parties × Elo ≈ 62 000` : +30 Elo ≈ 2000 parties ≈ 25 min ; +5 ≈ 12 400 ≈ 2 h 30 ; +2 ≈ 31 000 ≈ 6 h. Le temps machine est la ressource rare — 4 cœurs, concurrence 3, plafond atteint. Préférer ce qui achète de l'Elo contre du code plutôt que contre du temps de match. **À `8+0,08` par `match.yml`, un job tranche les effets de ~17 Elo et plus** : 5,57 s par partie mesurées, plafond de 350 min, soit ~3 750 parties. En dessous, passer à des matchs à longueur fixe sur plusieurs jobs et les mettre en commun — jamais « reprendre » un SPRT expiré, un test séquentiel interrompu puis prolongé n'a plus ses taux d'erreur. Voir `tools/README.md`. |
| « c'est plus rapide » | `cargo run --release --bin shallowred -- bench`, même machine, avant et après. Comparer d'abord le **nombre de nœuds**, qui est déterministe ; les nœuds par seconde varient d'un run à l'autre. |
| « c'est plus fort » | **Jamais** déduit d'un nombre de nœuds, dans aucun sens. Huit mesures, et les trois combinaisons de signes sont représentées : table + killers + historique ÷5,8 → +164 Elo ; coup nul ÷2,5 → +75 ; LMR ÷5,7 → +69 ; fenêtres d'aspiration ÷1,07 → +30 ; élagage delta ÷1,68 → +33 ; futilité inverse ÷1,45 → +24 (moins de nœuds, plus fort) ; **PVS ÷1,03 → −11, H0 accepté** (moins de nœuds, plus faible) ; **mobilité ×1,29 → +63** (*plus* de nœuds, plus fort). Un rapport de nœuds mesure le travail à une profondeur donnée, jamais la force. Seul le SPRT tranche. **Deux rapports voisins, ÷1,68 et ÷2,52, rapportent +33 et +75 : même le classement ne se déduit pas.** |
| « cette technique est standard, donc elle aide » | **Rien.** Ce n'est pas une preuve, et le dépôt en porte maintenant **trois** démentis. PVS est dans tous les manuels et la mesure l'a rejeté (−11 Elo, 4214 parties) : empilé sur LMR, coup nul et fenêtres d'aspiration, il n'apporte plus rien à couper et ne laisse que son coût de re-recherche. La coupure du manuel dans l'échange statique rend une valeur fausse — 27 écarts sur 771, l'oracle l'a vue au premier passage. Et reléguer les captures perdantes **derrière les coups tranquilles**, comme le font les moteurs modernes, coûte **+31,6 % de nœuds** ici, contre −4,2 % pour le palier le plus doux. Une technique standard entre par le SPRT comme toutes les autres. |
| « ce réglage était mauvais, pas la technique » | **Une bissection par le paramètre, pas une intuition.** L'élagage par compte de coups a été mesuré deux fois : seuil `6 + d²` → **−25,2 Elo**, seuil `12 + d²` → **−12,6**. Le coût suit le **risque mesuré** — 3,8 % puis 2,0 % des montées d'`alpha` détruites, soit × 0,53 pour × 0,50 — et la droite passe par l'origine, où le risque nul vaut « pas d'élagage ». **Deux points ont clos la question que zéro point aurait laissée ouverte**, comme elle l'est restée pour PVS. |
| « j'ai mesuré le mécanisme, donc je sais » | **Vérifier le dénominateur.** Avant d'écrire LMP j'ai mesuré la part des *coups tranquilles* élagués : 58 % au seuil 6, 40 % au seuil 12, compromis monotone sans genou — d'où « seul un SPRT peut choisir ». En **nœuds**, qui sont ce qui achète de la profondeur, le seuil 12 garde **96 %** de l'économie du seuil 6 : le genou est net. Un chiffre vrai qui répond à une autre question. |

## Pièges de mesure, appris à nos dépens

- **Un verdict appartient à sa cadence, et le signe peut changer avec elle.**
  C'est le piège le plus coûteux du projet, parce qu'il ne touche pas une
  mesure mais **toutes**. L'élagage par compte de coups a été écrit, mesuré
  deux fois à `1+0,01`, rejeté et retiré le 16 sept. 2026 — puis le même
  binaire, contre la même référence, avec les mêmes ouvertures, a rendu
  **+15,3 Elo à `8+0,08`** contre **−21,6 à `1+0,01`** (p = 0,0013). La cause
  est la profondeur : 8,5 contre 12,5. **Une technique dont la valeur croît
  avec la profondeur est invisible, voire négative, à une cadence trop
  courte.** Conséquences opérationnelles : inscrire la cadence à côté de
  chaque verdict ; ne jamais comparer deux verdicts de cadences différentes ;
  et se demander, avant de conclure, si la cadence de mesure ressemble au
  régime où le moteur jouera.
- **Les six positions de `bench` ne sont pas un échantillon de jeu.** Elles
  sont choisies pour être comparables d'une version à l'autre, pas pour
  représenter ce qu'une partie traverse. Mesurée sur le banc, la fréquence de
  la garde anti-zugzwang donnait 0,4 à 0,6 % des nœuds ; mesurée sur des
  positions tirées de vraies parties, 1,9 % — un facteur 3 à 5. Toute question
  portant sur une phase de jeu se mesure sur des positions extraites d'un
  match (`-pgnout`, puis échantillonnage).
- **Avant d'ordonner deux chantiers par une dépendance, vérifier qu'ils
  touchent les mêmes objets.** Le projet a inscrit que l'échange statique était
  « la précondition » de l'élagage par compte de coups, au motif que la prémisse
  de LMP est « l'ordonnancement a raison » et que l'ordonnancement manquait SEE.
  **Le raisonnement est juste et l'application est fausse** : LMP n'élague que
  des **coups tranquilles**, et SEE n'ordonne que des **captures**. Les deux ne
  se touchent pas. Vérifié dans le code plutôt que supposé : le diff de C19 ne
  contient pas une ligne de `score_move` ni d'`ordered_moves`, donc l'ordre des
  coups tranquilles que voit LMP est identique au bit près à celui contre lequel
  il avait été rejeté. La séquence n'a rien coûté — remesurer sur une meilleure
  base reste juste — mais **la raison écrite était fausse, et une raison fausse
  bloque le bon chantier la prochaine fois.** Même famille que « vérifier le
  dénominateur » : un raisonnement correct appliqué à la mauvaise grandeur.
- **Avant de découper un changement en deux SPRT, vérifier que le second
  n'absorbe pas le premier.** C19 devait être deux verdicts : l'échange
  statique dans l'*ordonnancement*, puis dans l'*élagage* en quiescence. Tous
  les manuels les présentent en paire. **Mesuré le 16 sept. 2026 : le second
  rend le premier inutile.** Une fois les captures perdantes sautées, les
  réordonner ne vaut plus que −1 % de nœuds pour +1,6 % de temps — parce que
  la quiescence porte 90 % des nœuds et que les captures déplacées n'y sont
  plus recherchées du tout. Le découpage supposait deux gisements ; il n'y en
  avait qu'un. Six heures de match économisées par vingt minutes de bench.
  **Le geste est le même que « mesurer le mécanisme d'abord », appliqué au
  PLAN plutôt qu'au code** : construire les deux moitiés, compter les nœuds des
  quatre combinaisons, et seulement ensuite décider combien de verdicts acheter.
- **Le nombre de nœuds ne dit pas la force — mais il dit le COÛT, et il le dit
  exactement.** Ces deux phrases ne se contredisent pas, et confondre leurs
  domaines a failli me faire acheter un verdict inutile. Un rapport de nœuds
  ne classe pas deux techniques par leur Elo : c'est mesuré huit fois, dans les
  trois combinaisons de signes. Mais il est **déterministe**, donc il tranche
  ce qui est de son ressort — la taille de l'arbre à profondeur fixe — sans
  aucune incertitude, là où un SPRT met des heures. La bissection du palier de
  C19 (+31,6 % / +6,5 % / −4,2 %) a été rendue en trois minutes et n'aurait
  demandé aucun match. **Ce qui reste au SPRT, c'est de savoir si le coût
  s'achète** ; ce qui ne lui appartient pas, c'est de mesurer le coût.
- **Mesurer le mécanisme avant d'en mesurer l'effet en Elo.** Compter combien
  de fois un phénomène se produit coûte des minutes d'instrumentation ; en
  mesurer l'effet coûte des heures de match. Et si le phénomène ne se produit
  pas, la question est close pour de bon au lieu d'être reportée.
  **Confirmé le 14 sept. 2026** : dix minutes d'instrumentation ont montré que
  90 % des nœuds sont en quiescence et qu'un test delta atteindrait 39 % des
  captures qu'elle examine. Les cinq lignes écrites ensuite valent
  **+32,5 Elo ± 12,3**. Choisir où creuser se mesure, comme le reste.
- **Un bench à profondeur 7 est trop court pour comparer des temps.** Le
  nombre de nœuds y est déterministe et comparable, le temps ne l'est pas :
  le 14 sept. 2026, une même version a mesuré 184 ms puis 200 ms en
  best-of-7, et un balayage de tailles de cache a rendu des chiffres non
  monotones purement dus au bruit. **Pour comparer des temps, mesurer à
  profondeur 10** (~1,6 s par run), où le bruit devient marginal — et
  seulement à nombre de nœuds identique, sans quoi on compare deux arbres.
- **Un cache de structure de pions ne paie pas sur ce moteur.** Essayé et
  retiré le 14 sept. 2026. `pawn_structure` pèse pourtant 24 % du temps de
  recherche, mais le taux de succès mesuré n'est que de **62 à 84 %**, parce
  que la quiescence est pilotée par les captures et qu'une bonne part des
  captures sont des captures de pions : la structure change bien plus souvent
  qu'on ne le suppose. Chaque échec coûte alors le calcul *plus* la
  consultation, et chaque succès un accès mémoire aléatoire comparable au
  recalcul. Mesuré à profondeur 10 : 1624 ms sans cache, 1644 à 1842 avec.
  Ne pas réessayer sans changer le mécanisme — un cache indexé par une clé
  incrémentale, ou un terme de pions moins coûteux à recalculer.
- **Un tuner est aussi un fuzzer.** L'ajustement Texel a poussé
  `KING_DANGER_SCALE` à zéro et fait paniquer l'évaluation sur une division
  entière par zéro — le moteur aurait planté en pleine partie. **Les valeurs
  d'évaluation sont des données, pas du code** : une donnée fausse se borne,
  elle n'arrête pas la partie. Un test vérifie qu'aucun jeu de paramètres ne
  fait paniquer l'évaluation, jeu entièrement nul compris.
- **Quand un réglage fait tomber un test, deux réponses seulement sont
  honnêtes.** *Reformuler* le test s'il mesurait la mauvaise chose — la prime
  de pion passé se jugeait sur `PASSED_MG` seul alors que la table du pion
  varie déjà avec la rangée, et la valeur de la dame se bornait en centièmes
  absolus alors qu'un ajustement fixe librement l'échelle. *Contraindre la
  valeur* si le test avait raison. **Assouplir un test jusqu'à ce qu'il passe
  n'en est pas une**, et une seconde reformulation du même test est de
  l'accommodement.
- **Ne jamais faire tourner deux matchs en même temps SUR UNE MÊME MACHINE.**
  À cadence horloge, deux matchs concurrents s'y volent du CPU et faussent les
  deux ; la concurrence interne de l'arbitre est le seul parallélisme admis
  *localement*. **La portée manquait jusqu'au 16 sept. 2026**, et son absence
  coûtait cher : sur des runners GitHub distincts il n'y a pas de vol de CPU,
  et surtout **les deux moteurs d'un même match partagent toujours leur
  machine**, donc un ralentissement d'hôte les frappe symétriquement et le
  verdict reste valide en interne. Seule la comparaison *entre* runs demande de
  lire les étalonnages. Telle qu'écrite sans portée, la règle aurait fait
  sérialiser toute mesure appariée — le protocole que la cadence rend
  obligatoire — pour rien.
- **Le SPRT tire ses ouvertures au hasard : sans `-srand`, rien n'est
  rejouable.** `tools/sprt.sh` fixe désormais la graine et l'affiche.

- **Le code retiré se garde dans `tools/attic/`, jamais par un SHA de commit.**
  La pratique était de désigner le commit — « le code retiré reste lisible dans
  `15028fa` ». **Elle a cassé le 16 sept. 2026** : la PR #11 fusionnée en
  `squash` a remplacé les commits de la branche par un commit neuf, GitHub a
  supprimé la branche, et la première exécution de `match.yml` a échoué sur
  `fatal: invalid reference: 498a01a`. Une rustine versionnée ne peut pas subir
  ça — elle survit aux squashs, aux suppressions de branche et aux politiques
  de collecte. Voir `tools/attic/README.md` : quand y déposer une rustine, et
  pourquoi celle de PVS ne s'applique plus.
  <br>**Fusionner en `merge` et non en `squash`** reste préférable, pour garder
  l'historique lisible — les PR #1 à #5 l'avaient fait. Mais ce n'est plus ce
  qui protège le code retiré, et c'était une mauvaise fondation : *la
  survie d'un artefact ne doit pas dépendre d'une politique de dépôt.*
  <br><span>Deux constats vérifiés au passage, qui nuancent la panique
  d'origine : GitHub conserve `refs/pull/N/head` de façon permanente, donc
  `498a01a` restait atteignable par ce chemin ; et **le push d'étiquettes est
  refusé sur ce dépôt** (403 avec le jeton de session), ce qui interdisait
  la solution évidente.</span>
- **Ne jamais construire une référence avec `git stash`.** Il emporte tout le
  travail non committé, outils de mesure compris — on finit par mesurer autre
  chose que ce qu'on croit. Utiliser `git worktree add --detach /tmp/ref <commit>`.
- **Vérifier que le binaire a bien été reconstruit.** `mv` et `cp -p`
  préservent les dates de modification, donc cargo peut juger les sources
  périmées et ne rien recompiler : on mesure alors l'ancien binaire. Un
  rapport avant/après d'exactement 1,00 en est le symptôme.
- **Un chiffre de référence écrit en prose vieillit en silence.** La section
  *Commandes* a annoncé `702 612 nœuds` pendant deux journées de travail alors
  que la valeur réelle était `541 528` : la mobilité et trois termes
  d'évaluation avaient changé l'arbre de recherche sans que personne ne mette
  le chiffre à jour, et **rien ne l'a signalé**. Un chiffre de référence faux
  est pire qu'absent — il sert de point de comparaison à la session suivante,
  qui croit mesurer une régression là où elle découvre une dérive de la
  documentation. `engine/tests/bench_reference.rs` confronte désormais les
  deux, en critère d'acceptation. **Conséquence assumée** : tout changement de
  l'arbre de recherche rend la CI rouge tant que la ligne n'est pas corrigée.
  C'est l'effet recherché ; le message d'échec donne le chiffre à recopier.
- **Un garde-fou qui ne couvre qu'une copie d'un chiffre dupliqué ne garde
  rien.** La première version du contrôle ci-dessus ne lisait que `CLAUDE.md`.
  Elle a été écrite alors que `README.md` portait déjà `8 432 521` — le chiffre
  d'avant le coup nul, **faux d'un facteur 15,6** — et ne l'a pas vu, parce que
  personne n'avait cherché si le chiffre existait ailleurs. Le contrôle balaie
  maintenant une liste de fichiers. **Avant d'écrire un garde-fou, chercher
  toutes les copies de ce qu'il garde** : `grep` sur la valeur, pas sur le
  fichier qu'on a en tête.
- **Un tampon par nœud coûte son *initialisation*, pas son allocation.**
  `ordered_moves` allouait un `Vec` à chaque nœud, et 90 % des nœuds sont des
  nœuds de quiescence : le remplacer par un tableau de pile paraissait évident.
  **Mesuré le 15 sept. 2026 : c'était 3,5 % plus lent.** Diagnostic par
  variation de taille — passer le tampon de 256 à 1024 entrées coûte **+18 %**
  à nombre de nœuds identique, donc le coût suit la taille du tampon, donc
  c'est le remplissage de 2 Ko par nœud et non l'allocation. Le `malloc` d'une
  même petite taille, répété, est servi par un cache thread-local et ne coûte
  presque rien. **Ce qui paie : une ardoise allouée une fois, découpée par ply
  et passée le long de la récursion** — ni allocation ni remplissage par nœud,
  mesuré **−2,1 %** sur 22 paires, test des signes p = 0,0004.
- **Un changement qui ne modifie pas l'arbre de recherche ne passe pas par un
  SPRT.** **Arbitrage du 15 sept. 2026.** La règle « un SPRT par
  changement » vise les changements de *décision*. Une optimisation pure se
  prouve autrement, et mieux : **nombre de nœuds identique au bit près** —
  vérifiable, contrairement à un verdict de match — plus une mesure de temps à
  profondeur 10 sur au moins vingt paires alternées. Le SPRT ne dirait que
  l'Elo acheté, et la mesure montre pourquoi il ne le vaut pas : **2 % de
  vitesse valent environ 2 Elo, soit ~31 000 parties et six heures de match**
  d'après la relation de budget du projet.
- **Sept exécutions ne suffisent pas à comparer deux temps.** Le premier
  relevé de C15 donnait 5 gagnantes sur 7 et −1,2 % sur la médiane : au bord du
  bruit, donc rien. À 22 paires le même changement donne 19 sur 22 et −2,1 %,
  p = 0,0004. **Compter les paires gagnantes et faire un test des signes**, au
  lieu de comparer deux médianes à l'œil.
  <br>**Et une exécution n'en suffit à rien du tout — pas même à dire qu'il
  n'y a pas d'écart.** Le 16 sept. 2026, j'ai caractérisé la vitesse des
  runners GitHub à partir d'**un seul runner** : 2 563 044 n/s, une valeur qui
  tombait à l'intérieur de l'étendue locale, d'où « ±10 %, donc le point de
  fonctionnement transfère » — inscrit dans trois fichiers et fusionné. Le
  runner suivant a rendu **3 139 691** sur le même binaire. L'écart réel est de
  22 % entre runners, et le runner est plus **rapide** que le conteneur, pas
  plus lent : la réserve d'origine avait aussi le signe faux. **Un point unique
  qui tombe dans l'intervalle attendu ressemble exactement à une confirmation**,
  et n'en est pas une : il ne mesure pas la dispersion de ce qu'on caractérise.
- **Deux balayages de mutation concurrents se corrompent.** Le 15 sept. 2026,
  j'ai relancé `cargo mutants` sans vérifier que le précédent avait fini. Les
  deux écrivaient dans le même `mutants.out/` : `missed.txt` mêlait les
  survivants de l'ancien code et du nouveau, avec des numéros de ligne d'une
  version qui n'existait plus — et je l'ai lu comme un résultat. Même famille
  que « ne jamais faire tourner deux matchs en même temps » : deux mesures
  concurrentes ne sont pas seulement lentes, elles mentent. Passer par
  `tools/mutants.sh`, qui prend un verrou et refuse de démarrer par-dessus.
- **Un mutant équivalent est souvent du code mort.** Deux survivants de `tt.rs`
  inversaient la borne d'un test d'entrée vierge dans `store` sans qu'aucun
  test ne bouge. Ce n'était pas un trou de couverture : la clause ne pouvait
  rien décider, `depth` étant borné à `[0, 127]` et une entrée vierge portant
  `-1`. Aucun test n'aurait pu la couvrir ; la bonne réponse était de la
  supprimer. **Avant de classer un survivant « équivalent », se demander si la
  branche est atteignable** — la réponse change ce qu'il faut faire.
- **Un invariant qu'on ne peut pas appeler est un invariant qu'aucun test ne
  protège.** Trois fois le même geste sur ce projet : `parse_go` extrait de
  `Engine::go`, dont le corps lance un thread ; `random_seed` extrait d'une
  expression au milieu de `random_legal_move` ; `time_budget_ms` extrait de
  `set_deadlines`, qui pose des `Instant`. Dans les trois cas la logique était
  juste, mais noyée dans une fonction qui fait autre chose : aucun test ne
  pouvait en asserter le résultat, seulement constater un effet de bord
  approximatif. Sept mutants survivaient rien que dans l'arithmétique du
  budget d'horloge. **L'extraction ne change pas le comportement** — nœuds
  identiques au bench — **elle change ce qu'on peut prouver.**
- **Un test peut être VRAI sans rien mesurer.** Deux gardes de la fenêtre
  d'aspiration comparaient le score d'un pari et d'une fenêtre pleine :
  égalité vraie que la garde se déclenche ou non, puisque la boucle
  d'élargissement converge de toute façon. Cinq mutants y survivaient.
  **Se demander : qu'est-ce que je casserais dans le code pour faire tomber ce
  test ?** Si la réponse n'est pas la ligne visée, le test mesure autre chose.
  Ici la bonne mesure était le nombre de nœuds, déterministe sur ce moteur.
- **Ne pas recopier un compteur en prose.** Le 15 sept. 2026, j'ai écrit
  « ces cinq dispositifs » au-dessus d'un tableau qui en listait six, et
  « dix cas » pour un auto-test qui en comptait onze — **les deux étaient faux
  le jour même où je les écrivais**, parce que j'avais ajouté une ligne après
  avoir rédigé la phrase. C'est la même famille que le chiffre de référence
  périmé, en plus bête : le compteur vit déjà dans le tableau ou dans
  `ATTENDUS=`, qui fait échouer le script s'il dérive. **La réponse n'est pas
  un garde-fou de plus, c'est de ne pas dupliquer** — écrire « ces dispositifs »
  et laisser le lecteur compter.
- **Une mesure longue ne survit pas dans le conteneur ; la faire tourner en
  CI.** Le 15 sept. 2026, un balayage de mutation lancé en tâche de fond est
  mort à **158 mutants sur 397** — sans erreur, sans trace : le conteneur avait
  été mis en veille entre deux tours et les processus détachés n'y survivent
  pas. Deux balayages plus courts avaient fini, ce qui donnait l'illusion que
  la méthode tenait. **Au-delà de quelques minutes, passer par
  `workflow_dispatch`** : les runners GitHub ne dorment pas, et le journal
  reste lisible après coup. C'est ainsi que le plafond d'`eval.rs` a fini par
  être mesuré.
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
tools/verify.sh                 # TOUT : fmt, clippy, tests, acceptation, bench
tools/verify.sh --rapide        # fmt, clippy, tests debug — quelques secondes

cargo run --release --bin shallowred          # boucle UCI
cargo run --release --bin shallowred -- bench 7

tools/setup-arbiters.sh                    # construit fastchess
tools/sprt.sh <candidat> <référence>       # verdict sur un changement de décision
tools/timing.sh <candidat> <référence>     # verdict sur une optimisation pure
tools/crosscheck.sh                        # les deux arbitres s'accordent-ils
tools/mutants.sh --file engine/src/tt.rs   # balayage par mutation, sous verrou
```

**Vérifier par `tools/verify.sh`, jamais en lisant la sortie de `cargo test`.**
Le 14 sept. 2026, un test échouait et je ne l'ai pas vu : j'avais filtré la
sortie sur « test result » et sommé les totaux. La ligne disait `FAILED`, la
somme disait 81, et j'ai lu la somme. **Un code de sortie ne se lit pas de
travers.** Le script exécute toutes les étapes même après un échec — découvrir
trois problèmes d'un coup coûte moins cher que trois allers-retours.

**Mesurer un temps par `tools/timing.sh`, jamais à la main.** Il refuse de
mesurer si les deux binaires n'explorent pas le même nombre de nœuds, mesure à
la profondeur 10 et non 7, refuse de conclure sous vingt paires, et rend un
test des signes. Les trois fautes de mesure de temps du projet venaient chacune
de l'omission d'un de ces points.

## Ce qui tourne tout seul

Une règle écrite se contourne, un code de sortie non. Ces dispositifs
s'exécutent sans qu'on y pense — les connaître évite de les prendre pour des
pannes, et de refaire ce qu'ils font déjà.

| où | quoi |
|---|---|
| `.claude/settings.json` | déclare les deux hooks ci-dessous |
| `.claude/hooks/verify-on-stop.sh` | refuse de finir un tour si `verify.sh --rapide` échoue et que des `.rs` ont changé. Passe après trois échecs d'affilée, avec un avertissement : un blocage qu'on ne sait pas lever vaut moins qu'un avertissement qu'on lit |
| `.claude/hooks/no-fabricated-sha.sh` | refuse un SHA de 40 caractères qui n'est pas un objet du dépôt alors que son préfixe de 7 en est un — la signature d'un SHA complété de tête |
| `tools/verify-hooks.sh` | vérifie que les scripts de hook font ce qu'ils annoncent, et aussi, par `.claude/hooks-fired.log`, que les hooks sont **réellement chargés**. Un script correct mais non chargé ne protège de rien |
| `.github/workflows/ci.yml` | à chaque push : fmt, clippy, tests debug et release, les trois critères d'acceptation, le bench |
| `.github/workflows/mutation.yml` | mardi 00:00 UTC : balayage par mutation, un job par fichier, puis le job `Verdict` |
| `.github/workflows/match.yml` | **à la demande** (`workflow_dispatch`), pas automatique : fait jouer un match entre deux commits sur un runner GitHub. C'est le seul moyen de mesurer **à cadence longue** — le conteneur de session est éphémère et un match de plusieurs heures n'y survit pas. Le job **étalonne sa propre vitesse** et l'inscrit en tête du résumé — à cadence horloge, une machine plus rapide atteint une profondeur plus grande, donc un autre point de fonctionnement. **Mesuré le 16 sept. 2026 : le runner est plus rapide que le conteneur de +11 à +35 % selon le runner, soit +0,2 à +0,6 ply.** Un verdict reste valide en interne — les deux moteurs partagent la machine — mais deux runs ne se comparent pas sans regarder leurs étalonnages. Voir `tools/README.md` |

**Le cliquet de mutation.** `.github/mutation-baseline.txt` porte le nombre de
survivants admis par fichier **et la raison écrite de chaque valeur non
nulle**. `.github/mutation-verdict.sh` le confronte au balayage : il **casse à
la hausse et signale la baisse**. L'asymétrie est assumée — un mutant qui
expire sur un runner chargé est compté « expiré » plutôt que « survivant »,
donc une baisse peut n'être qu'un artefact de charge, une hausse jamais.
Baisser un plafond ne demande rien ; **le relever demande une raison écrite**.

Le verdict est un script et non des lignes de YAML, parce qu'un script qui ne
s'exécute qu'une fois par semaine sur un runner ne serait jamais vérifié :
`.github/mutation-verdict-test.sh` l'éprouve sur des cas fabriqués et tourne dans
`tools/verify.sh` comme dans la CI. Il a trouvé une faute à sa première
exécution.

**L'alerte ne dépend d'aucun lecteur extérieur** : le job `Verdict` ouvre
lui-même une issue quand le cliquet casse, avec son propre droit `issues:
write`. Tant qu'une issue `mutation` est ouverte, les suivantes y ajoutent un
commentaire plutôt que d'en créer une par semaine.

**Mesuré le 15 sept. 2026, et c'est pourquoi c'est ainsi.** L'alerte reposait
d'abord sur une tâche planifiée vivant hors du dépôt. Déclenchée à la main pour
l'éprouver, elle a travaillé deux minutes et demie, lu des dizaines de milliers
de jetons de journal — et n'a rien ouvert, sans qu'on puisse savoir si elle
manquait des droits GitHub ou si elle avait jugé inutile d'alerter. **Un
dispositif d'alerte dont on ne peut pas observer le comportement n'est pas un
dispositif d'alerte.**

`workflow_dispatch` accepte l'entrée `simuler_une_alerte` : elle force l'échec
du verdict pour vérifier que l'issue part, sans attendre un vrai rouge. Une
issue ouverte par ce chemin le dit en tête.

**Durée du balayage** : 35 puis 81 minutes sur deux exécutions réelles. Les
runners partagés varient du simple au double — ne pas caler un rendez-vous
serré dessus. **Ce chiffre porte sur un débit de COMPILATION**, et ne dit rien
de la vitesse de RECHERCHE : celle-ci varie de 22 % d'un runner à l'autre, et
le runner est plus rapide que le conteneur, pas plus lent. Confondre les deux
m'a fait écrire une réserve fausse dans `match.yml` ; la corriger d'après un
seul runner m'en a fait écrire une seconde. Chiffres dans `tools/README.md`.

**Que faire quand le verdict est rouge.** Le critère de tri est un arbitrage
utilisateur du 15 sept. 2026 : **corriger au fil ce qui touche aux règles du
jeu et aux invariants de recherche ; noter le reste.** « Noter » veut dire
l'inscrire dans le plafond avec sa raison, pas dans une liste de tâches — un
rapport de mutation vieillit vite, ses numéros de ligne dérivent au premier
commit.

Référence à la profondeur 7 : 148 786 nœuds.

Ce chiffre est **vérifié par la CI**, ici et dans `README.md` — voir
`engine/tests/bench_reference.rs`. Le laisser périmé casse le build autant que
le changer à tort : c'est voulu. Quand il vire au rouge sur un changement de
recherche délibéré, **corriger la documentation, jamais supprimer le test** ;
le message d'échec nomme le fichier et donne le chiffre à recopier.
