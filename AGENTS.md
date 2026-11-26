# ShallowRed — moteur d'échecs + UI

Monorepo. Le moteur est un binaire UCI en Rust ; l'interface est un projet
TypeScript qui pilote n'importe quel moteur UCI, y compris celui-ci.

## Structure

- `engine/` — Rust, binaire UCI. Ne connaît ni l'interface, ni la notion de partie.
- `ui/` — TypeScript. **Chantier parallèle, avec son propre `ui/CLAUDE.md`
  qui fait autorité sous `ui/`.** Rien de ce fichier-ci ne s'y applique :
  une interface n'a pas de force de jeu, donc ni SPRT, ni perft, ni bench.
  **D'autres agents y poussent leurs branches**, `codex/…` et `ccr-…` : ne
  pas les prendre pour des anomalies, ni les fusionner, ni les nettoyer
  (ADR-0026). **Toute retouche de `ui/` est non prioritaire**, sa V1 étant
  finie (ADR-0027). **La version web** prend le binaire du moteur compilé
  tel quel pour `wasm32-wasip1-threads` et, en repli, `ui/wasm`, qui
  n'emploie que l'API publique du moteur : **rien dans `engine/` ne s'écrit
  pour elle** (ADR-0028).
- `tools/` — arbitres de match, livre d'ouvertures, SPRT. Voir `tools/README.md`.

## Par où commencer, sans contexte

Ce fichier dit **comment** travailler : invariants, ce qui compte comme preuve,
pièges déjà payés. Il ne dit pas **où on en est**.

- **L'état du travail en cours s'imprime au démarrage et après chaque
  compactage** (section du socle, en fin de fichier) : calculé, jamais
  recopié. `tools/etat.sh` se lance à la main (D-0009).
- **Les décisions du projet** vivent dans `memory/decisions/`, chacune avec
  ses raisons ; les sections déjà réduites de ce fichier n'en gardent que la
  règle et le renvoi.
- L'état du moteur : `README.md`, en tête. Le réseau qui joue, son
  facteur des marges et la force absolue : `memory/canonical.md` (F-0007,
  F-0008, F-0011).
- Les verdicts, effectifs, bornes **et cadence** : au journal, chacun dans
  son entrée (le tableau figé au 23 nov. 2026 : J-2026-11-23-H).
- Ce qui s'exécute sans qu'on l'appelle : section *Les dispositifs de
  chess*, plus bas, et celle du socle, en fin de fichier.
- **La feuille de route est le backlog de la mémoire** (D-0009) :
  `socle roadmap` en calcule la suite. Rien n'y va en pilote automatique.
- Ce qui vieillit sans bruit vit là où il sert : F-0005, F-0017, F-0019
  (l'ancienne liste : J-2026-11-23-J).
- Ce sur quoi travailler : **les tâches prêtes du backlog**, que l'état
  calcule. **Un test qui vaut le coup n'attend pas de validation** : il
  entre au backlog à son rang, marge estimée contre coût, et se signale au
  récap suivant. Se demande encore ce qui engage Théo hors du test, ou
  rouvrirait une décision structurante. **Aucun réglage n'est « résolu »
  parce qu'une valeur a été validée** : c'est une borne basse, et chaque
  réglage vit dans F-0009 et F-0010 (ADR-0032).
- **Ce qui revient à Théo se dit à chaque récap**, dont les branches
  distantes que le jeton de session ne peut supprimer (ADR-0033) et que
  l'état calcule ; ce jeton ne pousse pas non plus d'étiquette (403,
  J-2026-09-22-E).
- **Le socle est installé** (J-2026-11-11-B). Là où sa section contredit
  ce fichier, D-0002 vaut : **l'agent fusionne ses pull requests à CI
  verte** ; **`ui/` est tiers** ; **le balayage de mutation reste celui de
  chess** ; **les branches de réseaux et des autres agents se gardent** ;
  **ce fichier ne garde que les règles de travail**. L'adaptateur
  (`.socle/adapter.toml`) est propre à chess : `socle verify --fast` lance
  `tools/verify.sh --rapide`, sans `--fast` le job « Moteur » de la CI.

## Décisions structurantes

Ces points sont tranchés. Les rouvrir demande un fait technique nouveau —
une mesure, pas une préférence. Chacun vit dans sa décision de la mémoire,
avec ses raisons ; l'histoire des réseaux embarqués et les mesures qui
accompagnaient ces lignes sont au journal (J-2026-11-17-N).

- **Génération de coups : `cozy-chess`**, pas un générateur maison
  (ADR-0008) : le générateur pèse peu dans le coût d'un nœud de recherche,
  et en écrire un n'achèterait pas de performance mesurable.
- **Copy-make, pas make/unmake** (ADR-0005). `cozy-chess` n'expose pas
  d'`unmake` et les champs de son `Board` sont privés ; un `Board` est
  petit, et sa copie bon marché. Elle ne ferme pas la porte à NNUE : voir
  les contraintes d'architecture.
- **La cible est la force GÉNÉRALE, pas la force en blitz** (ADR-0029).
  **Une mesure de force appartient à sa cadence** ; mesurer court revient
  à optimiser pour un régime qui n'est pas la cible. La cadence d'un
  verdict est la plus longue à laquelle on obtienne encore un verdict, et
  `1+0,01` ne sert plus qu'à dégrossir, jamais à trancher.
- **L'évaluation qui joue est le réseau NNUE embarqué** (F-0007), à son
  facteur des marges (F-0008). La faite main reste — `EvalFile <none>` —,
  et c'est elle qu'évaluent le banc (`Search::new`) et les tests de
  recherche, **pas celle qui joue** : voir « c'est plus rapide ».
- **Les données de Leela Chess Zero sont admises** pour entraîner le
  réseau, selon ce qui mesure le mieux (ADR-0030). Licence ODbL : **le jour
  où un réseau entraîné sur elles est embarqué, `README.md` porte la
  mention d'attribution**, comme celui de Stockfish ; elle y est, section
  « Remerciements », et reste tant que `reseaux/` garde un réseau qui en a
  appris. Plan et mesures : au journal, le n° 7 (J-2026-11-18-BE) et le
  n° 20 (J-2026-11-18-CJ, J-2026-11-18-CU).
- **UCI est l'unique frontière** entre le moteur et le reste du monde
  (ADR-0004).
- **Deux binaires livrés, et la mesure se fait sur le binaire AVX2**
  (ADR-0031). `x86-64` tourne partout ; `x86-64-v3` cherche le MÊME arbre,
  plus vite. `match.yml`, `force.yml` et `nnue-datagen.yml` bâtissent en
  v3 par défaut ; en local, `cargo build --release` et `ref.sh` restent au
  jeu de base, pour que les deux binaires d'une comparaison locale soient
  bâtis pareil. **Un verdict d'avant le 6 oct. 2026 au soir a été rendu sur
  le binaire de base et le livre de 500** : il ne se compare pas à un
  verdict d'après sans le dire. **La CI exige le même arbre sur les quatre
  systèmes** : un binaire qui en chercherait un autre serait un autre
  moteur sous le même nom, et les matchs, qui ne jouent que sous Linux, ne
  le verraient pas.
- **Licence AGPL-3.0-or-later** sur tout le dépôt (ADR-0007, ADR-0025).

## Invariants du moteur

Les règles que le code doit tenir. Les mesures qui les ont fondées et
l'histoire de certaines sont au journal (J-2026-11-17-W).

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
- **Recherche déterministe.** Aucun hasard non seedé, jamais ; le tirage au
  sort conservé comme adversaire de référence est seedé par le hash Zobrist.
  Le résultat dépend aussi de la table et des historiques, gardés d'un `go`
  à l'autre et vidés par `ucinewgame` : même position, même table et mêmes
  historiques donnent le même coup. **À un fil — le défaut, le banc, les tests de
  score —, la recherche est déterministe au nœud près** ; à plusieurs,
  l'ordonnanceur décide qui écrit le premier dans la table, et un test
  n'asserte que ce qui tient quel que soit l'ordre : un coup légal, un
  arrêt, un compte de nœuds.
- **Un fil auxiliaire ne décide rien et s'arrête avec la recherche
  principale, panique comprise.** Il cherche la même position sur la même
  table, sans pendule ni rapport ; seul le fil principal rend le coup. Son
  arrêt passe par un garde (`StopOnDrop`) et non par une ligne après la
  boucle : `std::thread::scope` attend tous ses fils, et un auxiliaire jamais
  arrêté ferait attendre `go` pour toujours. Le test qui le garde échoue au
  bout de vingt secondes au lieu de pendre.
- **Un score de mat stocké dans la table doit être normalisé du ply.** Un mat
  vaut `±(MATE - ply)`, donc il dépend de l'endroit d'où on le regarde. Stocker
  tel quel et relire ailleurs annonce un mat faux. `score_to_tt` et
  `score_from_tt` s'en chargent — c'est la source de bug la plus classique
  d'une table de transposition.
- **Une fenêtre ne promet jamais plus qu'un mat atteignable.** À l'entrée de
  `negamax`, hors racine, `alpha` et `beta` se bornent à `-MATE + ply` et
  `MATE - ply - 1`, l'élagage par distance au mat. Sans lui, une borne
  héritée d'un ply moins profond remonte comme un score, et `score_to_tt`
  la pousse hors de ±MATE (C27).
  `une_borne_de_mat_heritee_ne_sort_jamais_de_la_plage` le garde.
- **Les entrées du réseau NNUE sont celles de l'entraîneur, au commit qu'on
  épingle.** Une case retournée d'un seul côté ne fait rien planter : elle
  entraîne un réseau sur d'autres positions que celles qu'il évaluera, et
  aucun test du moteur seul ne le voit. `nnue::feature` suit `Chess768` et
  `ChessBoard::from_raw` de bullet `10e7e82` ;
  `les_entrees_du_moteur_sont_celles_de_l_entraineur`
  (`tools/src/bin/nnue_datagen.rs`) le confronte au CODE de `bulletformat`,
  pas à une lecture de ce code. Changer de version de bullet ou d'entrées
  demande de relire le source et de refaire passer ce test.
- **Un réseau qui pourrait déborder est refusé au chargement, et une
  évaluation n'annonce jamais un mat.** `Network::from_bytes` borne
  l'accumulateur sur 32 pièces, et chaque poids de sortie à `i16::MAX / QA`
  = 128, la condition du produit sur seize bits que le compilateur
  vectorise ; le produit scalaire se somme en `i32` par tranches de 256
  termes, dont une assertion à la COMPILATION vérifie qu'une tranche
  tient, puis en `i64`. La sortie est bornée à `MATE_THRESHOLD - 1`, et
  une position morte vaut zéro, réseau ou non. Un réseau refusé par
  `EvalFile` laisse l'évaluation telle qu'elle était, et le dit. **Le
  réseau embarqué se rejoue contre son entraîneur à chaque build**
  (`le_reseau_embarque_evalue_comme_son_entraineur`) : remplacer le réseau
  demande d'y recopier la confrontation que `tools/nnue-train` imprime
  pour le nouveau, jamais d'assouplir le test. **Un réseau multicouche**
  (`Arch::layers`) calcule sa première couche dense en entiers exacts, par
  les mêmes tranches, et les deux suivantes en `f32` dans un ordre fixe —
  jamais de `mul_add` ni de somme réordonnée, sans quoi deux binaires ne
  chercheraient plus le même arbre. Un flottant non fini est refusé au
  chargement.
- **Une marge écrite en unités d'évaluation se mesure à l'échelle de
  l'évaluation qui joue**, marge par marge, jamais en bloc
  (`tools/attic/b8-sonde-marges.patch`). L'aspiration et l'élagage delta
  passent par `scaled_margin`, au facteur du réseau qui joue (F-0008) ; la
  futilité et la marge singulière, mesurées au réseau, par `network_margin`,
  qui les ramène à la faite main par un facteur séparé et figé à 224, sans
  quoi changer de réseau changerait le banc ; **la futilité inverse, sondée,
  tient telle quelle**.
  **Le facteur appartient au réseau** : en embarquer un autre demande de
  relancer la sonde, et une marge nouvelle en unités d'évaluation passe
  par elle. La faite main garde ses marges au bit près.
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
- **Une répétition ne se cherche jamais au-delà du dernier coup nul.** Même
  raison : deux coups nuls de suite recréent la position de départ, au même
  trait, et la recherche y voyait une nulle — la plupart des répétitions
  qu'elle détectait (C23). La borne vit dans `null_marks`, posée au coup nul
  et retirée au retour : une marque oubliée couperait la fenêtre sur une
  position étrangère et ferait manquer de vraies répétitions, sans qu'aucun
  autre test ne bronche.
- **Le `ply` d'un nœud est sa distance à la racine, et le chemin le mesure.**
  Killers, *improving*, coup précédent, accumulateurs et distance au mat
  s'y indexent ; un appel récursif qui le décale ne fait rien planter, il
  déplace l'arbre — ou rien du tout, quand l'élagage masque ce qu'il
  déplace. **`negamax` le confronte en test à la longueur du chemin**
  (`path_base`), parce qu'un banc figé cesse parfois de le voir.
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
- **Une recherche en ponder ne rend jamais son coup avant `ponderhit` ou
  `stop`**, même finie — mat trouvé, profondeur maximale. Recevoir `bestmove`
  pendant le tour adverse est une faute de protocole. Et **le drapeau de
  ponder s'écrit dans la couche UCI, avant de lancer le fil**, jamais par le
  fil : un `ponderhit` arrivé avant son démarrage serait sinon écrasé, et le
  moteur pondérerait jusqu'à perdre au temps. **Le temps de ponder compte
  comme déjà dépensé sur ce coup** — l'échéance court depuis le `go ponder`,
  comme chez Stockfish.
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

À respecter : chacune coûte cher en rétrofit. Toutes sont en place ;
l'histoire de leur mise en place et ses mesures sont au journal
(J-2026-11-17-N).

- **Drapeau d'arrêt atomique** consulté par la recherche : c'est ce qui
  rend `stop` et `go infinite` corrects.
- **Pile de clés Zobrist** pour la détection de répétition, dans `Position`.
- **Pile d'accumulateurs NNUE par ply** : `Search::accumulators`, la racine
  recalculée, tout le reste DÉRIVÉ par le parent juste avant de descendre
  — coups, captures de quiescence, coup nul. L'accumulateur pèse 1 à 4 Ko :
  il ne se copie pas par nœud, il vit dans une pile indexée par ply qui
  appartient à `Search`, jamais dans le `Board`. La dérivation vit dans
  `engine/src/nnue.rs`, seule copie, et `nnue_probe.rs` l'emploie : elle
  part du seul plateau parent et du coup, sans rien demander au
  `play_unchecked` opaque de `cozy-chess`, et a été confrontée à la vérité
  terrain sans un écart.
  **Ne pas la réécrire de tête** : le roque en notation roi-prend-tour et la
  prise en passant sont exactement les cas qu'on rate.
- **Génération par étapes**, le `MovePicker` : le coup de la table, puis
  les captures et promotions, puis les killers, et les coups tranquilles
  seulement si aucune coupure bêta n'est venue avant.
  **Toucher à l'ordre des coups déplace l'arbre**, même un simple
  changement de tri : un SPRT, pas `timing.sh`.
- **Coup compacté sur 16 bits pour le stockage** — `tt::pack_move`. La
  valeur zéro code `a1a1`, jamais légal, et sert de marqueur d'absence.
- **Table de transposition partagée entre fils** : entrées atomiques,
  `store` prend `&self`, et Lazy SMP la partage par un `Arc` ; l'option
  `Threads` vaut 1 par défaut. **Changer la taille d'une
  entrée change la capacité de la table, donc l'arbre** : un SPRT, jamais
  `timing.sh` seul.

## Ce qui compte comme preuve

Chaque ligne dit la preuve qu'exige une affirmation. Les verdicts sont
au journal, le tableau d'avant le 23 nov. 2026 en J-2026-11-23-H ; le texte d'avant,
avec les mesures qui fondaient ces règles, est archivé au journal
(J-2026-11-17-Q), et le relevé des rapports de nœuds y suit
(J-2026-11-17-R).

| Affirmation | Preuve exigée |
|---|---|
| « la génération de coups est correcte » | `cargo test --release -- --ignored` passe les six positions de `engine/tests/perft.rs`. Rien d'autre. |
| « ce changement de recherche est bon » | `tools/sprt.sh <candidat> <référence>` rend `H1 was accepted`. Une impression n'est pas une mesure. La CI, elle, exige en permanence vingt-quatre victoires sur vingt-quatre contre le hasard : un garde-fou, pas une mesure de force. |
| « cette valeur d'évaluation est meilleure » | **Le SPRT, et rien d'autre — surtout pas une erreur de prédiction tenue à l'écart.** Le jeu de validation partage les corrélations du corpus, et le moteur *agit* sur son évaluation : un ajustement Texel qui prédisait 7,8 % mieux a joué 25 Elo plus mal (14 sept. 2026). Les valeurs de `eval.rs` restent conventionnelles ; ne pas rouvrir leur réglage sans corpus nettement plus grand ni contrainte de structure. |
| « il manque un terme à l'évaluation » | Un SPRT. Pour la recherche, un par changement ; pour l'évaluation, **grouper, puis bissecter à l'échec** : un terme seul vaut quelques Elo et ne tranche pas. |
| « ce code est testé » | `tools/mutants.sh`. Un mutant **survivant** est une modification du code que toute la suite accepte : une ligne dont rien ne vérifie le comportement. Le plafond par fichier vit dans `.github/mutation-baseline.txt` (plus bas, « Le cliquet de mutation »). **Ne dit rien de la force de jeu.** |
| « l'arbitre de mesure est fiable » | `tools/crosscheck.sh` : deux arbitres indépendants jouent le même match et s'accordent. À relancer après toute modification de la couche UCI. |
| « ce verdict vaut pour le moteur qu'on livrera » | **Nommer la cadence de chaque verdict, et ne jamais comparer deux verdicts de cadences différentes** : la cadence peut inverser un verdict. Mêmes binaires, même livre, même graine, l'élagage par compte de coups valait −21,57 ± 16,71 Elo à `1+0,01` et +15,30 ± 15,08 à `8+0,08`, pour une profondeur médiane de 8,5 contre 12,5 (16 sept. 2026). Mesurer long passe par `.github/workflows/match.yml` ; la cible est la force générale (ADR-0029). |
| « ce chantier passe avant cet autre » | **Une unité commune : les plis.** Un gain de vitesse ou de temps s'y convertit, et l'étalon convertit les plis en Elo (F-0015). **Une conversion par un point unique porte l'incertitude des deux mesures qui la composent : écrire l'intervalle, jamais le point.** Une réallocation à temps constant ne se lit pas en plis moyens (« Pièges de mesure »). |
| « ce changement vaut la peine d'être mesuré » | **Un budget estimé** : `parties × Elo` ≈ 59 256, médiane de dix-huit SPRT (F-0014), qui ne dépend pas de la cadence ; il se lit à ± 50 % — +30 Elo ≈ 2 000 parties, +5 ≈ 11 900, +2 ≈ 29 600. **Un budget estimé depuis un verdict à `1+0,01` est un majorant : ne jamais renoncer à un match sur cette base.** Préférer ce qui achète de l'Elo contre du code plutôt que contre du temps de match. À `8+0,08`, un job de `match.yml` tranche ~20 Elo et plus (F-0016) ; en dessous, **des matchs à longueur fixe sur plusieurs jobs, mis en commun par `tools/mettre-en-commun.sh` — jamais plusieurs SPRT**, dont l'arrêt au premier qui franchit sa borne multiplie le risque de première espèce par leur nombre. Plus de runners pour les petits effets (ADR-0034), pourvu que le livre suffise (F-0018). |
| « ce correctif de règle ne dégrade pas le jeu » | **Trois choses, et pas un gain** : des tests qui **échouent sur l'ancien code** et passent sur le nouveau, chacun avec un témoin ; le mécanisme **mesuré en régime réel** ; un match dont le critère est **écrit avant de lancer** — fusion sauf si la borne haute de l'intervalle est sous zéro, lue sur chaque match comme sur l'ensemble. **Dire la puissance d'avance.** À effet nul, deux matchs lus chacun à 95 % arrêtent un correctif environ une fois sur vingt : c'est le prix de la règle, et on ne le rembourse pas en remesurant sans fait neuf. |
| « ce réseau est celui qu'a entraîné bullet » | Le réseau quantifié, chargé par le moteur, contre `trainer.eval(fen) × 400` de bullet, sur des positions variées : `tools/nnue-train` le fait lui-même au bout de l'entraînement. **Critère : écart médian ≤ 15 centièmes, maximal ≤ 50.** Un écart de l'ordre de l'évaluation elle-même dit des entrées mal indexées : un réseau mal branché ne fait rien planter, il joue mal. |
| « c'est plus rapide » | `cargo run --release --bin shallowred -- bench`, même machine, avant et après : **le nombre de nœuds d'abord**, qui est déterministe, puis le temps par `tools/timing.sh`. **Le banc évalue à la main, le moteur joue avec le réseau** : un changement de l'inférence NNUE ne s'y voit pas ; il se mesure au rejeu (skill `mesurer-l-inference`), en attendant un banc au réseau (B-0055). |
| « c'est plus fort » | **Jamais déduit d'un nombre de nœuds, dans aucun sens.** Les trois combinaisons de signes sont mesurées. À `8+0,08`, un même rapport rend les deux signes (×1,03 : la fenêtre nulle +11,7 ± 3,4, le poids de l'historique de correction × 1,5 −6,0 ± 3,1), et un arbre de même taille, un tiers des réductions déplacées, rend +23,2 ± 3,2. Un rapport de nœuds mesure le travail à une profondeur donnée, jamais la force : seul le SPRT tranche. |
| « cette technique est standard, donc elle aide » | **Rien.** Une technique standard entre par le SPRT comme les autres, et **un verdict appartient à sa base autant qu'à sa cadence** : PVS, un néant en septembre (−0,8 ± 8,2 à `8+0,08`), rend +11,67 ± 3,38 à la même cadence sur la base du 7 oct. 2026. |
| « cette rustine de l'attic s'applique encore » | **`git apply --check`, jamais la table** : `engine/tests/rustines_attic.rs` confronte la colonne de `tools/attic/README.md` au vrai résultat. Une rustine qui cesse de s'appliquer parce que son code est entré dans `main` est un rejet levé, pas une régression. **S'appliquer n'est pas compiler** : une rustine qu'on va employer se construit d'abord, et sa correction retourne à l'attic. |
| « ce réglage était mauvais, pas la technique » | **Une bissection par le paramètre, pas une intuition — et elle appartient à sa cadence** : celle de l'élagage par compte de coups, faite à `1+0,01`, concluait qu'aucun seuil ne paie ; à `8+0,08`, ses deux seuils ont gagné. |
| « j'ai mesuré le mécanisme, donc je sais » | **Vérifier le dénominateur**, grandeur comme ensemble : la part des coups tranquilles élagués ne dit pas la part des nœuds économisés, et une moyenne sur tous les coups ne dit pas celle des seuls coups comparables. |

## Avant d'affirmer

Les règles du protocole du carnet de bord (B-0007) ; leur histoire est au
journal (J-2026-11-17-F).

- **Une expérience dit ce qu'elle mesure avant de tourner**, et l'on
  vérifie que ce qu'elle mesure contient bien le phénomène visé. Son
  résultat et son interprétation s'écrivent séparément.
- **L'état d'un système extérieur se lit, il ne se déduit pas** : une CI
  verte se constate sur son run, jamais d'un `cargo test` local
  (J-2026-09-13-C).
- **Une position d'échecs n'entre dans un test qu'après avoir été
  exécutée** : construite de tête, elle se vérifie d'abord en l'exécutant
  (J-2026-09-13-B).
- **Une mesure qui s'avère fausse se corrige, et l'erreur se garde** au
  journal, avec la raison qui la rendait raisonnable.
- **Une prédiction ne tient pas lieu de mesure.** Une mesure qui tourne,
  ou qu'il ne coûte presque rien de lancer, s'attend : quand sa
  réfutation peut tomber dans vingt minutes, la prédire n'apporte rien,
  quelle qu'en soit l'issue. Un niveau de confiance nomme ce qui lui
  donnerait tort : si c'est la mesure qui tourne, il est du bruit ; si
  rien ne se nomme, il est arbitraire (J-2026-09-14-A). L'attendu écrit
  *avant* de lancer une mesure, avec sa confiance, pour être confronté à
  son résultat, est un autre geste, et il reste la règle (« Ce qui
  compte comme preuve », le critère écrit avant de lancer).
- **« Ça tourne encore, rien à ajouter » est une réponse complète**,
  suivie des deux lignes de fin du socle quand le tour a agi. Combler une
  attente fabrique des affirmations sans artefact (J-2026-09-16-C).
- **Dans une synthèse, une affirmation sur l'état d'un système ou sur un
  résultat à venir renvoie à un artefact regardé dans le même tour**, ou
  ne s'écrit pas : la synthèse est le lieu où l'on généralise.

**Ces règles ne se certifient pas elles-mêmes** : celles de la prédiction,
écrites deux jours plus tôt, ont été enfreintes, et c'est une relecture
demandée par Théo, pas une règle, qui l'a rattrapé (J-2026-09-16-C).

## Pièges de mesure, appris à nos dépens

Chaque piège garde ici le début de son titre et sa règle. Son récit,
l'incident qui l'a appris, ses mesures et ses rechutes, est archivé au
journal sous le même titre (J-2026-11-17-T).

- **Un verdict appartient à sa cadence, et le signe peut changer avec
  elle.** Nommer la cadence de chaque verdict ; un budget tiré d'un verdict
  à `1+0,01` n'est qu'un majorant. (J-2026-11-17-T)
- **La ressource TOTALE consommée n'est pas l'ALLOCATION par unité** : elle
  sature, une réallocation a deux côtés, et l'attendu se calcule si
  l'instrument existe. (J-2026-11-17-T)
- **Une réallocation à temps constant ne se lit pas en plis moyens**, mais
  par l'accord avec un oracle, jamais avec la base ; l'Elo d'un pli d'accord
  appartient à la règle qui l'achète. (J-2026-11-17-T)
- **Une comparaison entre réglages qui CHANGENT le déroulement n'est pas
  appariée** : convertir par une grandeur appariée, ou brider la
  phase. (J-2026-11-17-T)
- **Un moteur qui DÉMARRE FROID n'est pas un moteur en partie** : ce que la
  recherche accumule se mesure en jouant, jamais en
  visitant. (J-2026-11-17-T)
- **Une sonde jetable vit dans sa rustine, jamais dans l'arbre** :
  l'instrumentation et son lecteur dans le même patch, à
  l'attic. (J-2026-11-17-T)
- **Un mécanisme vérifié à l'arithmétique qui ne retombe pas sur la mesure
  n'est pas réfuté** : il est incomplet, et le résidu se
  nomme. (J-2026-11-17-T)
- **Dimensionner un mécanisme borne son gain possible ; ça ne le prédit
  pas.** Ni son signe ; et un taux de dégâts ne se lit qu'avec l'économie
  qu'il achète. (J-2026-11-17-T)
- **Les six positions de `bench` ne sont pas un échantillon de jeu** : une
  phase se mesure sur de vraies parties, et le banc ne remplit pas ce qu'on
  redimensionne. (J-2026-11-17-T)
- **Quand un mécanisme est rare par construction, compter ses nœuds ne
  tranche rien** : compter ses dégâts, si. (J-2026-11-17-T)
- **« L'outil ne sait pas le faire » se lit dans son SOURCE**, à la version
  épinglée, après avoir énuméré nos outils ; une référence extérieure
  aussi. (J-2026-11-17-T)
- **Avant d'ordonner deux chantiers par une dépendance, vérifier qu'ils
  touchent les mêmes objets** : une raison fausse bloque le bon
  chantier. (J-2026-11-17-T)
- **Avant de découper un changement en deux SPRT, vérifier que le second
  n'absorbe pas le premier** : compter d'abord les nœuds des quatre
  combinaisons. (J-2026-11-17-T)
- **Le nombre de nœuds ne dit pas la force — mais il dit le COÛT**,
  exactement : le coût se tranche au banc, le SPRT dit seulement s'il
  s'achète. (J-2026-11-17-T)
- **Le doublement mesure un coût MARGINAL, pas une part** : un minorant ;
  décide la variante écrite, mesurée à arbre identique. (J-2026-11-17-T)
- **Mesurer le mécanisme avant d'en mesurer l'effet en Elo** : des minutes
  d'instrumentation contre des heures de match. (J-2026-11-17-T)
- **Un seuil sur une grandeur sans échelle n'est pas un réglage, c'est une
  dérive** : lire son histogramme là où il tranche, et vérifier qu'elle a
  une borne. (J-2026-11-17-T)
- **Une érosion se cherche en NŒUDS avant de s'acheter en Elo** : cela
  ordonne les matchs à acheter, sans en donner l'Elo ni le
  signe. (J-2026-11-17-T)
- **Un cache de structure de pions ne paie pas sur ce moteur** : ne pas le
  réessayer sans changer de mécanisme. (J-2026-11-17-T)
- **Une propriété générale assertée sur UNE position passe par chance** : la
  compter sur un échantillon, la borner qualitativement, jamais par un taux,
  et redimensionner l'échantillon si sa marge s'érode. (J-2026-11-17-T)
- **Une reformulation justifiée par une mesure INDÉPENDANTE du changement
  n'est pas de l'accommodement** (ADR-0038). (J-2026-11-17-T)
- **Quand un réglage fait tomber un test, deux réponses seulement sont
  honnêtes** : reformuler un test qui mesurait autre chose, contraindre la
  valeur s'il avait raison ; jamais l'assouplir. (J-2026-11-17-T)
- **Ne jamais faire tourner deux matchs en même temps SUR UNE MÊME MACHINE**
  (ADR-0037) : cœurs par partie × concurrence ≤ cœurs − 1, ce que
  `match.yml` applique. (J-2026-11-17-T)
- **Un renvoi par POSITION vieillit comme un chiffre recopié, et sans
  bruit** : nommer ce qu'on désigne, jamais le compter ni le
  situer. (J-2026-11-17-T)
- **Un changement de TESTS déplace le plafond de mutation**, un changement
  d'ARBRE aussi, jusque dans des FICHIERS qu'il ne touche pas ; un mutant
  qui échappe deux fois appelle un test d'invariant. (J-2026-11-17-T)
- **Un mutant « de réglage » n'est hors de portée des tests que si rien de
  DÉTERMINISTE ne dépend du réglage** (ADR-0035) : 98 survivants d'`eval.rs`
  s'attrapaient par un nombre de nœuds. (J-2026-11-17-T)
- **Un garde-fou peut être correct et garder la mauvaise chose** : quelle
  est sa source de vérité, et est-ce la bonne ? (J-2026-11-17-T)
- **Une assertion qui ne s'est jamais déclenchée ne prouve rien si aucun
  test n'atteint l'état qu'elle garde** ; un compteur (A21) non plus : les
  paramètres d'un test décident de ses chemins. (J-2026-11-17-T)
- **Un garde-fou qui ne couvre qu'une copie d'un chiffre dupliqué ne garde
  rien** : `grep` sur la valeur pour trouver toutes les
  copies. (J-2026-11-17-T)
- **Un tampon par nœud coûte son *initialisation*, pas son allocation** :
  une ardoise allouée une fois, découpée par ply. (J-2026-11-17-T)
- **« Nœuds identiques au bit près » ne s'applique qu'à taille de structure
  CONSTANTE** : séparer les deux effets par les quatre
  coins. (J-2026-11-17-T)
- **Un changement qui ne modifie pas l'arbre de recherche ne passe pas par
  un SPRT** (ADR-0036) : nœuds identiques au bit près, puis
  `tools/timing.sh`. (J-2026-11-17-T)
- **Sept exécutions ne suffisent pas à comparer deux temps**, une seule à
  rien : compter les paires gagnantes, et un test des
  signes. (J-2026-11-17-T)
- **Un mutant sans effet logique qui se dit « attrapé » est un signal, pas
  un succès** : une garde tenue par UN fil ne tient que si ce fil
  tourne. (J-2026-11-17-T)
- **Un mutant équivalent est souvent du code mort** : se demander si la
  branche est atteignable, et écrire une règle une seule
  fois. (J-2026-11-17-T)
- **Un invariant qu'on ne peut pas appeler est un invariant qu'aucun test ne
  protège** : l'extraire, sans changer un nœud. (J-2026-11-17-T)
- **Un test peut être VRAI sans rien mesurer** : quelle ligne faudrait-il
  casser pour le faire tomber ? (J-2026-11-17-T)
- **Ne pas recopier un compteur en prose** : écrire « ces dispositifs », et
  laisser compter. (J-2026-11-17-T)
- **Une mesure longue ne survit pas dans le conteneur ; la faire tourner en
  CI**, par `workflow_dispatch`. (J-2026-11-17-T)
- **Un SPRT expiré n'est pas « rien appris »** : un minorant, ni verdict ni
  à reprendre, qui dimensionne le match suivant. (J-2026-11-17-T)
- **Un avertissement d'arbitre est une mesure, pas du bruit** : il se relève
  comme un score, à chaque run. (J-2026-11-17-T)
- **Une sonde qui prend pour oracle le code qu'elle mesure en hérite les
  fautes** : vérifier ce code sur les cas qu'il détecte. (J-2026-11-17-T)
- **Un contrefactuel d'ORDRE est biaisé vers l'ordre joué** : un plafond et
  un minorant, pas un classement ; un total de coûts emboîtés est une union,
  jamais une somme. (J-2026-11-17-T)
- **Un changement de recherche se mesure sur un commit RÉVOQUÉ aussitôt** :
  fusion en `merge`, pour que son SHA reste atteignable ; au verdict,
  révoquer la révocation. (J-2026-11-17-T)
- **Contrôler la vraisemblance avant d'inscrire un chiffre** : un rapport
  rond, nul ou démesuré dit un protocole cassé. (J-2026-11-17-T)
- **Les arbitres impriment un score courant après chaque partie** : lire la
  dernière ligne, jamais la première. (J-2026-11-17-T)
- **Un livre d'ouvertures est une condition de validité**, pas un agrément ;
  des graines distinctes restent la règle, mais une graine permute le livre
  sans l'agrandir. (J-2026-11-17-T)
- **Des pièges de ce fichier sont partis dans `tools/pieges-fermes.md`**,
  chacun tenu par un dispositif qui le rend inexprimable. Ceux qui restent
  ci-dessus, seul le jugement les protège ; si un dispositif disparaît, son
  piège revient ici.

## Style

- Tests écrits en même temps que le code, pas après.
- Pas d'`unwrap()` ni d'`expect()` hors des tests — la lint les signale.
- Pas d'`unsafe` : la lint l'interdit — **sauf le SIMD de l'inférence**
  (ADR-0039), confiné à UN module de `engine/src/nnue.rs` qui porte
  `#[allow(unsafe_code)]` — la lint passe de `forbid` à `deny` pour que
  tout le reste refuse encore —, chaque bloc derrière la détection du jeu
  d'instructions ou la cible de compilation, **confronté en test à la
  version scalaire**, qui reste, et entré seulement s'il rend du temps à
  arbre identique.
- Commentaires en français, code et identifiants en anglais.
- **Les heures s'écrivent à l'heure de Paris** (ADR-0040) — messages,
  journal, documentation. Celles d'avant le 6 oct. 2026 sont en UTC ; les
  horodatages des rappels programmés aussi, l'API l'exige.
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
tools/ref.sh <commit|branche|tag> [sortie] # construit un binaire de référence
tools/sprt.sh <candidat> <référence>       # verdict sur un changement de décision
tools/timing.sh <candidat> <référence>     # verdict sur une optimisation pure
tools/plis.sh <journal cutechess -debug>   # plis gagnés EN PARTIE, appariés par partie
tools/crosscheck.sh                        # les deux arbitres s'accordent-ils
tools/mutants.sh --file engine/src/tt.rs   # balayage par mutation, sous verrou
tools/binaires.sh [dossier]                # les deux binaires livrés, comparés
```

**Vérifier par `tools/verify.sh`, jamais en lisant la sortie de `cargo test`** :
un filtre sur « test result » et une somme des totaux ont déjà masqué un
`FAILED`. **Un code de sortie ne se lit pas de travers.** Le script exécute
toutes les étapes même après un échec — découvrir trois problèmes d'un coup
coûte moins cher que trois allers-retours. **Et jamais à travers un tube** :
`verify.sh | tail && git commit` rend le code de `tail`, toujours zéro.
Rediriger vers un fichier, puis lire `$?`. Les deux incidents : J-2026-11-23-T.

**Deux portes, les mêmes étapes.** `python3 .socle/socle verify --fast`
lance celles de `tools/verify.sh --rapide`, et c'est elle qu'emploient le
hook de fin de tour et le push ; sans `--fast`, celles du job « Moteur »
de la CI plus l'auto-test des hooks, à peu de chose près celles de
`tools/verify.sh` complet. `.socle/adapter.toml` en tient le détail, étape
par étape. L'une ou l'autre, pourvu qu'on en lise le code de sortie.

**Mesurer un temps par `tools/timing.sh`, jamais à la main.** Il refuse de
mesurer si les deux binaires n'explorent pas le même nombre de nœuds, mesure à
la profondeur 10 et non 7, refuse de conclure sous vingt paires, et rend un
test des signes. Les trois fautes de mesure de temps du projet venaient chacune
de l'omission d'un de ces points.

## Les dispositifs de chess

Une règle écrite se contourne, un code de sortie non. Ces dispositifs
s'exécutent sans qu'on y pense : les connaître évite de les prendre pour
des pannes, et de refaire ce qu'ils font déjà. Ceux du socle sont listés
dans sa section, en fin de fichier ; l'histoire de leur mise en place est
au journal (J-2026-11-17-Q).

| où | quoi |
|---|---|
| `.claude/settings.json` | déclare les hooks : ceux du socle (sa section, plus bas) et celui de chess avant chaque outil, ci-dessous. `tools/etat.sh` n'est plus lancé au démarrage (D-0009) et l'ancien hook de fin de tour de chess est retiré (D-0012) : `tools/verify-hooks.sh` exige leur absence |
| `.claude/hooks/no-fabricated-sha.sh` | refuse un SHA de 40 caractères qui n'est pas un objet du dépôt alors que son préfixe de 7 en est un — la signature d'un SHA complété de tête |
| `tools/mettre-en-commun-test.sh` | éprouve `tools/mettre-en-commun.sh`, dans `verify.sh` : la formule pentanomiale doit retomber sur ce que fastchess a imprimé, et le script doit **refuser** de réunir des matchs qui se contredisent, la branche qui ne sert qu'en cas de problème |
| `tools/ref-test.sh` | éprouve `tools/ref.sh` sur des dépôts fabriqués, dans `verify.sh`, sans compiler : surtout son **refus** de construire sur une référence git périmée, qui ne s'exécute qu'en cas de catastrophe et ne serait sinon jamais vérifié |
| `tools/verify-hooks.sh` | vérifie que les scripts de hook font ce qu'ils annoncent, que chacun est déclaré au bon moment, et, par `.claude/hooks-fired.log`, que celui de chess est **réellement chargé** ; ceux du socle tracent dans `.git/socle/hooks.log`, que `socle state` compte. Un script correct mais non chargé ne protège de rien |
| `.github/workflows/ci.yml` | à chaque push : fmt, clippy, tests debug et release, les critères d'acceptation, le bench |
| `engine/tests/rustines_attic.rs` | critère d'acceptation : confronte la colonne « s'applique sur `main` ? » de `tools/attic/README.md` au vrai `git apply --check`, **dans les deux sens** — une rustine non déclarée et une déclaration sans rustine échouent autant qu'un verdict faux. `#[ignore]` parce qu'il lance `git` : aucun mutant d'`engine/src/` ne peut changer si une rustine s'applique |
| `engine/tests/pieges_fermes.rs` | confronte `tools/pieges-fermes.md` au dépôt : **chaque piège archivé doit nommer un dispositif qui existe**, et l'archive doit rester nommée dans `AGENTS.md`. Sans lui, un piège dont le dispositif disparaît resterait archivé comme « tenu » |
| `engine/tests/outillage_documente.rs` | exige que chaque dispositif soit **nommé avec son extension** dans une doc : scripts de `tools/`, workflows, hooks et binaires de `tools/src/bin/`, énumérés par répertoire et par extension, jamais nom par nom |
| `.github/workflows/mutation.yml` | mardi 00:00 UTC : balayage par mutation, un job par fichier ou par morceau d'un fichier long, puis le job `Verdict` |
| `tools/binaires.sh` | dans la CI, à chaque push : construit les deux binaires livrés, `x86-64` et `x86-64-v3`, et **refuse de les rendre s'ils ne cherchent pas le même arbre**, banc fait main et réseau. Sur une PR et sur `main`, de même sous Windows, sur Mac Intel et sur Apple Silicon, et le job « Le même arbre sur chaque système » exige la même empreinte sur les quatre (ADR-0031) ; sur `main`, il les publie en artefact. Éprouvé par `tools/binaires-test.sh`, dans `verify.sh` et la CI |
| `tools/balayage-vivant.sh` | étape du job `Moteur`, à chaque push : échoue si le workflow `Mutation` est endormi ou n'a pas tourné depuis quinze jours. **Le cliquet ne peut pas signaler sa propre absence**, et GitHub endort les workflows planifiés d'un dépôt public après soixante jours sans activité. Éprouvé par `tools/balayage-vivant-test.sh`, dans `verify.sh` et la CI |
| `.github/workflows/nnue-train.yml` | à chaque push qui touche `engine/src/nnue.rs`, la crate `tools/nnue-train` ou la toolchain : compile le programme d'entraînement NNUE, `--locked`, sans GPU, contre le runtime factice de bullet. Ce programme a son propre espace de travail : sans ce contrôle, un changement de l'API du moteur le casserait en silence, et on ne l'apprendrait que le jour de l'entraînement |
| `.github/workflows/pages.yml` | à chaque push sur `main` qui touche le moteur, `reseaux/` ou `ui/` : publie la version web de l'interface sur GitHub Pages (ADR-0028), **le binaire du moteur lui-même compilé pour `wasm32-wasip1-threads`**, et en repli la crate à part `ui/wasm`, qui recopie la couche UCI. **Ne publie que si chaque module rend la transcription du binaire au nœud près** (`ui/dev/wasm-check.mjs`). **Un changement d'`engine/src/main.rs` ou de la couche UCI qui casserait cette compilation casse aussi ce workflow.** Sur une PR qui touche `engine/src/uci.rs`, il vérifie sans publier : **un changement de la couche UCI se fait suivre dans `ui/wasm/src/lib.rs`**, jamais l'inverse. Voir `ui/README.md`, « Version web » |
| `.github/workflows/match.yml` | **à la demande** (`workflow_dispatch`) : un match entre deux commits sur un runner GitHub, le seul moyen de mesurer **à cadence longue**, qu'un conteneur de session ne tiendrait pas. Le job **étalonne sa propre vitesse** et l'inscrit en tête du résumé : à cadence horloge, une machine plus rapide atteint une profondeur plus grande. Un verdict reste valide en interne, les deux moteurs partageant la machine, mais **deux runs ne se comparent pas sans regarder leurs étalonnages** (F-0017). Voir `tools/README.md`, « Mesurer à cadence longue » |
| `.github/workflows/force.yml` | **à la demande** : le moteur d'un commit contre **Stockfish bridé** (`UCI_LimitStrength`, `UCI_Elo`), la seule mesure de force ABSOLUE du dépôt. **Son échelle se lit au source de Stockfish 16**, ancrée à l'Elo CCRL et étalonnée à 60+0,6, d'où la cadence par défaut ; Stockfish 16 et `ubuntu-24.04` sont épinglés, et le workflow refuse plutôt que de mesurer sur une autre échelle. Une estimation, jamais un classement ; au-delà de 90 % ou en deçà de 10 % de score, changer de niveau. **Il écrase les écarts**, ses fautes au hasard décidant plus que notre profondeur : **un changement se mesure contre notre jumeau, jamais contre lui.** Son échelle s'arrête à 3 190, d'où `classes.yml`. La force relevée : F-0011 ; une série suit le skill `situer-le-moteur` |
| `.github/workflows/classes.yml` | **à la demande**, depuis le 9 nov. 2026 : le moteur d'un commit contre un moteur **classé par la CCRL**, non bridé — la suite de `force.yml`. Chaque adversaire est construit au tag que la CCRL a noté, le SHA du tag vérifié ; la cadence est l'**équivalent 40/15 du runner**, fixé comme le fait la CCRL au banc de Stockfish 10, la machine chargée comme pendant le match, et 3 939 338 nœuds exigés. Une partie par cœur physique, table de 256 Mo, un fil. Le résumé rend la note de l'adversaire plus l'écart, la marge composant celle du match et celle de la note. Voir `tools/README.md`, « Situer le moteur » |

**Le cliquet de mutation.** `.github/mutation-baseline.txt` porte le
nombre de survivants admis par fichier **et la raison écrite de chaque
valeur non nulle** ; `.github/mutation-verdict.sh` le confronte au
balayage, et **casse à la hausse, signale la baisse**. L'asymétrie est
voulue : un mutant expiré sur un runner chargé ne compte pas comme
survivant, donc une baisse peut n'être qu'un artefact de charge, une
hausse jamais. Baisser un plafond ne demande rien ; **le relever demande
une raison écrite**.

**Le plafond et la matrice sont deux listes écrites à la main**, dans deux
fichiers, et un fichier absent des deux n'apparaîtrait nulle part.
`engine/tests/couverture_mutation.rs` parcourt `engine/src/` et exige
chaque fichier dans les deux, sauf un fichier sans `fn`, où `cargo
mutants` ne produit aucun mutant. **Le plafond d'un fichier neuf se
mesure depuis un arbre vert** : `cargo mutants` refuse un arbre dont les
tests échouent, et ce test-là reste rouge tant que le plafond manque —
donc `workflow_dispatch`, ou un `git worktree add --detach` sur le commit
d'avant.

Le verdict est un script et non du YAML, pour pouvoir être éprouvé :
`.github/mutation-verdict-test.sh` tourne dans `tools/verify.sh` comme
dans la CI. **L'alerte ne dépend d'aucun lecteur extérieur** : le job
`Verdict` ouvre lui-même une issue quand le cliquet casse, ou commente
celle qui est déjà ouverte. Ses entrées de `workflow_dispatch` :
`tools/README.md`, « Tests de mutation ».

**Sa durée** monte avec le fichier vers la limite du job (F-0019) :
`search.rs` se balaie en deux morceaux, `cargo mutants --shard`, que le
verdict somme et refuse incomplets ; un autre fichier qui approche de la
limite se découpe de même. C'est un débit de compilation, qui ne dit
rien de la vitesse de recherche d'un runner. **Un nombre de nœuds par
seconde appartient à son binaire autant qu'à sa machine** : une ligne
d'étalonnage ne compare que des runs du même binaire, quand la profondeur
atteinte en 250 ms se lit d'une version à l'autre.

**Quand le verdict est rouge** (ADR-0035) : corriger au fil ce qui touche
aux règles du jeu et aux invariants de recherche ; noter le reste dans le
plafond, avec sa raison, jamais dans une liste de tâches.

Référence à la profondeur 7 : 77 429 nœuds.

Ce chiffre est **vérifié par la CI**, ici comme dans `README.md`, par
`engine/tests/bench_reference.rs`. Le laisser périmé casse le build autant
que le changer à tort, et c'est voulu. Quand il vire au rouge sur un
changement de recherche délibéré, **corriger la documentation, jamais
supprimer le test** : le message d'échec nomme le fichier et donne le
chiffre à recopier.

<!-- socle:debut — section posée par l'installeur, régénérée à chaque mise à jour -->

## Socle : mémoire, documentation et tests

Ce dépôt utilise le socle (version et empreinte : `.socle/engine.lock`).
Ce fichier dit **comment** travailler ;
**où en est le projet** se calcule, et ne s'écrit jamais à la main.

### Au démarrage, et après chaque compactage

`python3 .socle/socle state` imprime l'état dérivé — commit, base, CI,
backlog, demandes humaines en attente —, puis l'essentiel de la
mémoire. Sous Claude Code, le hook `SessionStart` le fait seul ; sous un
autre agent, le lancer d'abord. Rien de ce qui n'y figure pas n'est acquis.
Ce que l'humain a écrit lui-même depuis le dernier commit de l'agent, l'état
le liste : le lui citer dans la réponse suivante, par son identifiant et son
lien. Un premier message qui demande de
reprendre ou de continuer, quelle qu'en soit la forme (« reprends »),
cherche d'abord la passation : le skill `socle-handoff`.

Si l'état n'a pas été injecté au démarrage d'une session de Claude Code, ses
hooks ne sont pas chargés (la session a démarré hors de la racine du
projet ; `socle state` le dit en tête, et le hook avant commit refuse alors
le commit) : le dire à l'humain avant tout travail, ne rien pousser, et ne
jamais écrire soi-même un réglage de Claude Code pour les rétablir.

Une consigne de l'humain donnée dans la conversation, qui vaut au-delà du tour
(une règle, une préférence, une interdiction), s'écrit dans la mémoire avant de
continuer, dans les consignes (`socle new directive`), avec son texte exact, et
au journal : un compactage peut la perdre. Avant de s'appuyer sur une
consigne, son texte exact se lit.

### La mémoire, dans `memory/`

| Couche | Où | Règle |
| --- | --- | --- |
| Canonique | `memory/canonical.md` | faits avec statut et preuve ; ne change qu'avec une preuve nouvelle |
| Actif | `memory/active.md` | chantier en cours, prochaines étapes ; réécrit, borné |
| Consignes | `memory/directives.md` | consignes de l'humain, texte exact inchangé ; levées par une demande validée |
| Décisions | `memory/decisions/` | une ADR par fichier, le seul registre des décisions du projet ; seul son statut change ensuite |
| Journal | `memory/journal/` | une entrée datée par événement ; ajout seul ; aucun geste futur de l'humain |
| Backlog | `memory/backlog/` | quatre formes, chacune son préfixe : besoin `B-` (« Satisfait quand »), tâche `T-` qui nomme son besoin (« Fait quand »), lot `L-` de tâches, jalon `JA-` de besoins ; ordonnées par `après`, avec leur priorité (l'état en calcule les tâches prêtes) ; closes avec une référence, puis rangées par `socle archive` |
| Demandes | `memory/requests/` | décisions humaines en file, au contrat du skill `socle-request` |

Une entrée : `## F-NNNN — titre`, puis une ligne `> statut : mesuré · preuve : commit:<sha>`.
Statuts d'un fait : `mesuré` (avec `preuve`), `supposé`, `réfuté` (barré,
avec `refutation`), `validé` (avec `validation : D-NNNN`, après la réponse
de l'humain). Format complet : `.socle/engine/socle/FORMAT.md`.
Un identifiant se calcule (`python3 .socle/socle new <type> "titre"`), il ne
se devine pas. En cas de conflit, l'ordre d'autorité est : le code et les
tests, puis la mémoire canonique, puis le journal.

**Mémoire privée**, si la politique en choisit une (`[private] mode`) : rien de privé ne se recopie en public, ni un identifiant `P…`, ni son contenu, ni dans un message de commit, une pull request ou un commentaire ; indisponible (l'état le dit), on ne conclut pas sur ce qui en dépend. Comment y travailler : le skill `socle-private-memory`.

### Politique d'autonomie (`.socle/policy.toml`, modifiée par l'humain seul)

1. **Assouplir un garde-fou** (`.socle/guardrails.toml`) exige une demande validée ; durcir est libre. Déclarer des fichiers tiers, qu'aucun contrôle ne juge (`[thirdparty] paths`), assouplit.
2. **Supprimer un test ou changer une valeur attendue**, dans un test ou un fichier de cas déclaré, exige une demande validée, ou une spécification que l'humain a lui-même changée et qui nomme le test ; une ADR écrite par l'agent ne suffit pas.
3. **Décision de conception** : réversible et mesurable, l'agent décide et écrit une ADR ; coûteuse à défaire, demande.
4. **Action irréversible ou externe** (force-push, push sur la branche par défaut, publication, suppression distante hors `socle prune-branches`, dépense) : toujours une demande. Le hook la refuse.
5. **Mémoire** : ajout seul ; « réfuté » exige une référence de mesure ; « validé » ne s'écrit qu'après la réponse de l'humain.
6. **Débordement de périmètre** : un bug voisin va au backlog, il ne se corrige pas, sauf s'il bloque.
7. **Échec répété** : contrôles rouges après trois tentatives, arrêt et escalade par une demande qui résume.
8. **Validation requise** : mettre la demande en file, travailler sur autre chose, ne jamais deviner.

### Demandes de décision humaine

Une décision qui revient à l'humain se pose en demande, qui se lit seule
quand le contexte est perdu, et dont le lien se donne dans la conversation.
L'humain répond dans la conversation ; l'agent consigne sa réponse mot pour
mot, sans jamais la choisir, et la recopie au journal. Une décision qui
demande du contexte, approuver un document compris, s'écrit toujours en
demande ; jamais dans le widget de questions de l'agent, où l'humain lit un
texte brut sans liens à suivre (le hook le refuse). Ce que l'humain tranche
dans la conversation, de lui-même ou sur une question courte posée dans le
texte de la réponse, se consigne aussitôt de même, en séance. Comment : le
skill `socle-request`. Un besoin dont la conception n'est pas tranchée pose
d'abord sa question d'intention, en quelques lignes, dans la
conversation ; sa spécification et son code se font ensuite dans le même
lot.

### Lire la mémoire à la demande

Le démarrage n'injecte que l'état, le chantier actif, les consignes en
vigueur, les titres des faits et les dix dernières décisions, sous une borne ; ce qu'une ligne `!! coupé`
dit manquer se lit aussitôt. Le reste se lit quand il sert, sans attendre
qu'on le demande :

- un identifiant cité (`F-`, `C-`, `B-`, `T-`, `L-`, `JA-`, `ADR-`, `D-`, `J-`) se lit avant de
  s'appuyer dessus : `python3 .socle/socle show <ID>`, qui donne aussi son
  empreinte ;
- avant une décision de conception, `socle show --index decisions` dit si
  elle est déjà prise : on ne la rouvre pas sans fait nouveau ;
- avant d'ouvrir une entrée du backlog, son index (`socle show --index
  backlog`) dit si elle existe déjà ;
- pour savoir pourquoi une chose est ainsi, chercher dans le journal
  (`grep -rn "<mot>" memory/journal/`) ;
- la suite, quand l'humain la demande : coller dans la réponse la sortie
  de `python3 .socle/socle roadmap --format markdown`.

La lecture se prouve : une décision, une demande ou une entrée du backlog
nouvelles citent ce qu'elles ont lu avec son empreinte (`ADR-NNNN@xxxxxxxx`,
`lu : decisions@…`, `lu : backlog@…`) ; une consigne, partout. Une empreinte périmée ou inventée est
refusée ; il faut relire l'entrée. `socle new` pose l'empreinte de l'index.

### Les skills

Une procédure rare se lit dans son skill, que l'agent charge sur sa
description : `socle-request` (les demandes, une décision en séance),
`socle-private-memory` (la mémoire privée), `socle-batch` (mener un lot),
`socle-handoff` (passer la main à une session neuve, programmée ou
demandée par l'humain), `socle-review` (la revue d'un lot, avant sa livraison) et `socle-resume`
(en session cloud, à chaque tour qui agit : reprendre après une limite
d'usage), dans `.claude/skills/`, posés par l'installeur et protégés ; un
autre agent lit leur `SKILL.md` à ce chemin.

Une procédure du projet qui se refait s'écrit en skill à la deuxième fois, dans `.claude/skills/<nom>/SKILL.md` : un
nom sans le préfixe `socle-`, un en-tête `name` (le nom du
dossier) et `description` (ce qu'il fait, et quand s'en servir), et une
entrée au journal qui le dit. Un skill dit comment faire, la mémoire ce qui
est et pourquoi : il n'en recopie rien. Ses commandes, dans des blocs de
code, sont jugées comme le hook les jugerait ; une commande à ne pas lancer
se cite dans le texte.

### Livrer le travail

Tant que rien ne revient à l'humain, l'agent enchaîne les tâches prêtes
sans attendre de message. Il annonce d'abord le lot, pas forcément tout ce
qui est prêt (les tâches, leur taille, le jalon qu'elles servent ; une
tâche de priorité basse si elle est commode), puis s'y met ; à la fin du
lot, il enchaîne le suivant si la session le permet, et s'arrête dès
qu'une décision revient à l'humain. Il ne change pas
une priorité que l'humain a donnée. Un besoin sans tâche ouverte se
découpe d'abord en tâches. Le lot se forme en balayant tout le backlog
ouvert ; une tâche ouverte ensuite rejoint le prochain lot dont la règle
s'applique à elle, jamais celui en cours. Il se garde au backlog
(`socle new batch`) et se mène selon le skill `socle-batch`. Avant le push d'un lot qui pose ou
change un garde-fou, un format que d'autres parties lisent, ou plus de
150 lignes de code et de tests, il le fait relire par un relecteur sans
contexte, contre le « Fait quand » de ses tâches ; un autre lot, il le
relit lui-même (le skill `socle-review`). Un besoin dont la conception n'est pas tranchée écrit sa
spécification avant son code ; un besoin qui pose ou change un garde-fou,
son modèle de menace (sa section `## Modèle de menace`, ou la décision
qu'il cite). Seuls les constats bloquants se corrigent dans le lot ; un
autre va au backlog s'il est important et vu en usage réel, ou d'effet
irréversible ; sinon il s'écarte, et revient s'il est vu. Au backlog, il devient une tâche si sa
correction est claire, un besoin sinon. Le récap dit les constats, et
pourquoi chaque écarté l'est.

Par défaut, tout se fait sur une branche de développement, avec une seule
pull request ouverte à la fois : chaque lot fini s'y ajoute, l'humain la
fusionne quand il veut, et la branche repart alors de la branche par
défaut. Si la politique le permet (le guide, « La fusion par l'agent »),
l'agent fusionne lui-même la sienne, aux conditions du skill
`socle-batch`. Une pull request par tâche, seulement si l'humain l'a choisi (un
fait de la mémoire le dit). Une session neuve qui trouve ouverte la pull
request d'une autre demande à l'humain de la fusionner d'abord, ou de
l'autoriser à y continuer ; partie d'une passation que sa garde
accepte, elle y continue, et cette pull request devient la sienne. Un prototype qu'on ne compte pas fusionner se
fait sur une branche jetable, nommée d'un préfixe de `[branches] disposable`
des garde-fous (`proto/` par défaut) : la CI ne la juge pas aux envois.

### Avant de conclure

- `python3 .socle/socle verify --fast` passe (le hook `Stop` le vérifie) ; `verify` exécute tout.
- Si du code a changé, la mémoire aussi : chantier actif, journal, backlog.
- Si du code associé à une doc a changé (`[[docmap]]` des garde-fous), la doc change dans le même travail, ou le commit qui change ce code porte le trailer `Dispense-doc: <raison>`, qui ne vaut que pour lui.
- Un correctif (titre `fix:` ou trailer `Corrige: T-NNNN`) livre un test qui échoue sur le commit parent.
- Une fonction publique ajoutée ou modifiée est nommée par au moins un test, ou un commit la dispense nommément avec sa raison (`Dispense-test: f, g — <raison>`). Du code existant découvert sans test : le test s'écrit tout de suite s'il est dans le périmètre du travail, sinon un besoin va au backlog.
- Une action que seul l'humain peut faire (refusée par le hook, réglage d'un service, fichier qu'il détient) va au backlog avec `pour : humain`.
- **Toute intervention qui a agi se termine par un récap, puis deux lignes** : `Pour toi :` — ce qui revient à l'humain, décisions en attente et actions à faire, ou « rien » —, chaque point compréhensible sans le raisonnement de l'agent (ce que c'est, pourquoi, ce que change sa réponse), et `Ensuite :` — la suite proposée (prochain jalon, ce qu'il reste à faire avant), et ce que l'agent attend s'il attend quelque chose (une CI, un match : quoi, et jusqu'à quand). L'état calcule ce qui revient à l'humain ; le hook `Stop` refuse de conclure sans les deux lignes.
- **Un fichier à lire, ou une pull request, se donne par son lien** : l'humain lit dans la conversation ou sur GitHub, pas dans le conteneur de l'agent. `python3 .socle/socle url <chemin|ID>` donne le permalien, une fois le fichier poussé ; une demande en attente citée sans son lien, un lien relatif, ou un chemin entre accents graves qui n'existe pas dans le dépôt font refuser la fin du tour. Un chemin d'un autre dépôt s'écrit `depot:chemin`, le dépôt lié dans le projet par son adresse, ou déclaré dans `[references] repos` des garde-fous.

### Ne jamais

- compléter un SHA de tête, inventer un identifiant ou une référence : le hook les refuse ;
- écrire dans un fichier protégé (politique, adaptateur, verrou du moteur, hooks, CI, réponses humaines) ;
- répondre à la place de l'humain (`socle answer` sans `--relayed` ni citation), ou lancer `socle approve` ou `socle private install`, réservés à l'humain ;
- contourner un hook (`--no-verify`) : le hook de l'agent le refuse sur le dépôt du projet, et la CI exécute tout ;
- poser une question à l'humain dans le widget de questions de l'agent : le hook le refuse.

### Ce qui tourne tout seul

| Où | Quoi |
| --- | --- |
| `.claude/settings.json` | hooks de Claude Code : `SessionStart` (état dérivé ; en session cloud, les outils de l'adaptateur), `PreToolUse` (refus), `Stop` (contrôles de fin de tour) |
| `.socle/git-hooks/` | hooks git : `pre-commit` (contrôles rapides), `prepare-commit-msg` (trailers `Socle-Hooks`, `Socle-Hooks-Since-Commit`), `commit-msg` (fuites de la mémoire privée ; en avertissement, une fonction sans test ni dispense, un correctif sans test, un commit d'agent sans ses hooks), `pre-push` (`verify --fast` sur le dernier commit, la plage qui part jugée comme en CI, relecture avant publication) |
| `.github/workflows/socle.yml` | CI : capacités de l'adaptateur, tous les contrôles contre la base, auto-test du socle, la suite du projet en résumé |
| `.git/socle/hooks.log` | trace locale de chaque hook qui tire, non versionnée, commune aux worktrees |

Liste des contrôles : `python3 .socle/socle checks`.

<!-- socle:fin -->
