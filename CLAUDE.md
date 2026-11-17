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
  compactage** (`python3 .socle/socle state`, section du socle en fin de
  fichier) : branche, commits non fusionnés, CI, backlog, ce qui revient à
  Théo, et l'index des décisions. Il est calculé, jamais recopié.
  `tools/etat.sh` reste un outil à lancer à la main (D-0009).
- **Les décisions du projet** vivent dans `memory/decisions/`, chacune avec
  ses raisons ; les sections déjà réduites de ce fichier n'en gardent que la
  règle et le renvoi.
- L'état du moteur : `README.md`, en tête. Le réseau qui joue et son
  facteur des marges : `memory/canonical.md` (F-0007, F-0008).
- Les verdicts SPRT, avec leurs effectifs, leurs bornes **et leur cadence** :
  `tools/README.md`, section *Mesures de référence*. Le compteur n'est pas
  recopié ici : il vit dans le tableau.
- Ce qui s'exécute sans qu'on l'appelle : section *Les dispositifs de
  chess*, plus bas, et celle du socle, en fin de fichier.
- **La feuille de route est le backlog de la mémoire** (D-0009) : l'état
  en calcule le prochain jalon et les sujets prêts.
  Rien ne s'y fait en pilote automatique.
- Ce qui vieillit sans que rien ne le signale : `tools/README.md`, section
  [« Ce qu'il faut surveiller »](tools/README.md#ce-quil-faut-surveiller--et-que-rien-ne-signalera-tout-seul) ;
  un lien, dont le socle vérifie l'ancre à chaque contrôle.
- Ce sur quoi travailler : **la file validée**, `tools/README.md`, section
  *Ce qui reste à faire*, sous-section [*La file*](tools/README.md#la-file--réécrite-le-20-oct-2026-dans-lordre-où-la-faire).
  **Un test qui vaut le coup n'attend pas de validation** : il entre dans
  la file à son rang, marge estimée contre coût, et se signale au récap
  suivant. Ce qui se demande encore : ce qui engage Théo hors du test
  lui-même, et ce qui rouvrirait une décision structurante. **Aucun réglage
  n'est « résolu » parce qu'une valeur a été validée** : c'est une borne
  basse, et chaque réglage vit dans le registre des réglages ouverts de la
  file (ADR-0032).
- **Ce qui revient à Théo se dit à chaque point de récap**, en particulier
  les branches distantes à supprimer, que le jeton de session ne peut pas
  supprimer (ADR-0033) ; l'état du socle les calcule, hors celles que la
  politique garde.
- **Le socle est installé** (J-2026-11-11-B). Là où
  sa section, en fin de fichier, contredit le reste de ce fichier, ce que
  Théo a tranché ce jour-là vaut (D-0002) : **l'agent fusionne lui-même ses
  pull requests à CI verte** ; **`ui/` est déclaré tiers**, aucun contrôle
  du socle ne le juge ; **le balayage de mutation reste celui de chess** ;
  **les branches de réseaux et celles des autres agents se gardent** ; et
  **ce fichier ne garde que les règles de travail**. L'adaptateur du socle
  est propre à chess (`.socle/adapter.toml`) : avec `--fast`, `socle
  verify` lance les étapes de `tools/verify.sh --rapide` ; sans, celles du
  job « Moteur » de la CI.

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
  appris. Plan et mesures : `tools/README.md`,
  n° 7 et n° 20.
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
  **Seconde nuance, depuis Lazy SMP (B6)** : à plus d'un fil, l'ordonnanceur
  décide qui écrit le premier dans la table, et deux recherches identiques ne
  rendent plus le même arbre. **Un fil — le défaut, le banc, les tests de
  score — reste déterministe au nœud près.** Un test à plusieurs fils
  n'asserte jamais un arbre ni un score, seulement ce qui tient quel que soit
  l'ordre : un coup légal, un arrêt, un compte de nœuds.
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
  `MATE - ply - 1` — l'élagage par distance au mat. Sans lui, une borne
  héritée d'un ply moins profond remontait comme un SCORE dès qu'un retour de
  borne la rendait — la quiescence rend `alpha` quand rien ne l'améliore — et
  `score_to_tt` la poussait hors de ±MATE : **1,82 % des recherches en
  partie** stockaient un score non représentable (C27, 25 sept. 2026).
  `une_borne_de_mat_heritee_ne_sort_jamais_de_la_plage` tombe sur l'ancien
  code dans les deux profils.
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
  = 128 — la condition du produit sur seize bits que le compilateur
  vectorise (n° 16) ; le produit scalaire se somme en `i32` par tranches
  de 256 termes — une assertion à la COMPILATION vérifie qu'une tranche
  tient —, puis en `i64` : aucune largeur ne le fait déborder (n° 17,
  étape 1) ; la sortie
  est bornée à `MATE_THRESHOLD - 1`, et une position morte vaut zéro, réseau
  ou non. Un réseau refusé par `EvalFile` laisse l'évaluation telle qu'elle
  était, et le dit. **Le réseau embarqué se rejoue contre son entraîneur à
  chaque build** (`le_reseau_embarque_evalue_comme_son_entraineur`) :
  remplacer le réseau demande d'y recopier la confrontation que
  `tools/nnue-train` imprime pour le nouveau, jamais d'assouplir le test.
  **Un réseau multicouche** (`Arch::layers`, depuis le 2 nov. 2026) : sa
  première couche dense se calcule en entiers exacts, par les mêmes
  tranches ; les deux suivantes en `f32`, dans un ordre fixe — jamais de
  `mul_add` ni de somme réordonnée, sans quoi deux binaires ne rendraient
  plus la même évaluation, donc plus le même arbre. Un flottant non fini
  est refusé au chargement.
- **Une marge écrite en unités d'évaluation se mesure à l'échelle de
  l'évaluation qui joue.** Les marges de la recherche ont été réglées sur la
  faite main ; le réseau porte d'autres nombres — pente 2,40 contre la faite
  main, mesurée là où la futilité tranche. B8, 30 sept. 2026 : l'aspiration
  et l'élagage delta passent par `scaled_margin`, × 2,24 quand un réseau
  joue — **+50,50 ± 5,37 Elo** à `8+0,08` ; la futilité inverse, sondée,
  tient telle quelle. **× 2,85 depuis N5l** (14 oct.), sa sonde le
  sortant de la plage où le facteur de N2 suffisait — N6r4 (17 oct.),
  N7p4 et N8tw50s800 (21 oct.) y jouent aussi, leurs sondes (2,49, 2,79
  et 2,85) dans la plage, puis N9w50s800 (22 oct.), sa sonde lue contre
  N8tw50s800 et pas plus fautive à aucune marge ; et le facteur qui
  ramène à la faite main les marges mesurées au réseau est désormais
  SÉPARÉ et figé à 224 (n° 17) — sans quoi changer de réseau aurait changé
  le banc. L'échelle ne se transpose donc pas en bloc : **elle se
  mesure, marge par marge** (`tools/attic/b8-sonde-marges.patch`). **Le
  facteur appartient au réseau** : en embarquer un autre demande de relancer
  la sonde, et une marge nouvelle en unités d'évaluation passe par elle. La
  faite main garde ses marges au bit près — le banc et les tests de
  recherche n'en voient rien.
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
  trait, et la recherche y voyait une nulle — **87,8 % des répétitions
  qu'elle détectait**, mesuré en partie le 23 sept. 2026 (C23). La borne vit
  dans `null_marks`, posée au coup nul et retirée au retour : une marque
  oubliée couperait la fenêtre sur une position étrangère et ferait manquer
  de VRAIES répétitions, sans qu'aucun autre test ne bronche.
- **Le `ply` d'un nœud est sa distance à la racine, et le chemin le mesure.**
  Killers, *improving*, coup précédent, accumulateurs et distance au mat
  s'y indexent ; un appel récursif qui le décale ne fait rien planter, il
  déplace l'arbre — ou rien du tout, quand l'élagage masque ce qu'il
  déplace. **`negamax` le confronte en test à la longueur du chemin**
  (`path_base`) : deux bancs figés de suite avaient cessé de voir l'appel du
  coup nul en `ply * 1` — A18, puis C32 (issue #142).
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

Chaque ligne dit la preuve qu'exige une affirmation. Les mesures qui ont
fondé ces règles sont au journal (J-2026-11-17-R), et les verdicts dans
`tools/README.md`, section *Mesures de référence*.

| Affirmation | Preuve exigée |
|---|---|
| « la génération de coups est correcte » | `cargo test --release -- --ignored` passe les six positions de `engine/tests/perft.rs`. Rien d'autre. |
| « ce changement de recherche est bon » | `tools/sprt.sh <candidat> <référence>` rend `H1 was accepted`. Une impression n'est pas une mesure. La CI, elle, exige en permanence vingt-quatre victoires sur vingt-quatre contre le hasard : un garde-fou, pas une mesure de force. |
| « cette valeur d'évaluation est meilleure » | **Le SPRT, et rien d'autre — surtout pas une erreur de prédiction tenue à l'écart.** Le jeu de validation partage les corrélations du corpus, et le moteur *agit* sur son évaluation : un ajustement Texel qui prédisait 7,8 % mieux a joué 25 Elo plus mal (14 sept. 2026). Les valeurs de `eval.rs` restent conventionnelles ; ne pas rouvrir leur réglage sans corpus nettement plus grand ni contrainte de structure. |
| « il manque un terme à l'évaluation » | Un SPRT. Pour la recherche, un par changement ; pour l'évaluation, **grouper, puis bissecter à l'échec** : un terme seul vaut quelques Elo et ne tranche pas. |
| « ce code est testé » | `tools/mutants.sh`. Un mutant **survivant** est une modification du code que toute la suite accepte : une ligne dont rien ne vérifie le comportement. Le plafond par fichier vit dans `.github/mutation-baseline.txt` (plus bas, « Le cliquet de mutation »). **Ne dit rien de la force de jeu.** |
| « l'arbitre de mesure est fiable » | `tools/crosscheck.sh` : deux arbitres indépendants jouent le même match et s'accordent. À relancer après toute modification de la couche UCI. |
| « ce verdict vaut pour le moteur qu'on livrera » | **Nommer la cadence de chaque verdict, et ne jamais comparer deux verdicts de cadences différentes** : la cadence peut inverser un verdict. Mêmes binaires, même livre, même graine, l'élagage par compte de coups valait −21,57 ± 16,71 Elo à `1+0,01` et +15,30 ± 15,08 à `8+0,08`, pour une profondeur médiane de 8,5 contre 12,5 (16 sept. 2026). Mesurer long passe par `.github/workflows/match.yml` ; la cible est la force générale (ADR-0029). |
| « ce chantier passe avant cet autre » | **Une unité commune : les plis.** Un gain de vitesse ou de temps s'y convertit, 1,36 pli par doublement de temps ; l'étalon les convertit en Elo : un doublement vaut +107,7 ± 8,2 Elo et +1,38 ± 0,28 pli à `8+0,08`, soit 60 à 105 Elo par pli. **Une conversion par un point unique porte l'incertitude des deux mesures qui la composent : écrire l'intervalle, jamais le point.** Une réallocation à temps constant ne se lit pas en plis moyens (« Pièges de mesure »). Chiffres : `tools/README.md`, « Calibrer l'Elo par pli ». |
| « ce changement vaut la peine d'être mesuré » | **Un budget estimé** : `parties × Elo` ≈ 59 256, médiane de dix-huit SPRT, qui ne dépend pas de la cadence ; il se lit à ± 50 % — +30 Elo ≈ 2 000 parties, +5 ≈ 11 900, +2 ≈ 29 750. **Un budget estimé depuis un verdict à `1+0,01` est un majorant : ne jamais renoncer à un match sur cette base.** Préférer ce qui achète de l'Elo contre du code plutôt que contre du temps de match. À `8+0,08`, un job de `match.yml` tranche ~20 Elo et plus ; en dessous, **des matchs à longueur fixe sur plusieurs jobs, mis en commun par `tools/mettre-en-commun.sh` — jamais plusieurs SPRT**, dont l'arrêt au premier qui franchit sa borne multiplie le risque de première espèce par leur nombre. Plus de runners pour les petits effets (ADR-0034), pourvu que le livre suffise : il a 15 000 ouvertures. |
| « ce correctif de règle ne dégrade pas le jeu » | **Trois choses, et pas un gain** : des tests qui **échouent sur l'ancien code** et passent sur le nouveau, chacun avec un témoin ; le mécanisme **mesuré en régime réel** ; un match dont le critère est **écrit avant de lancer** — fusion sauf si la borne haute de l'intervalle est sous zéro, lue sur chaque match comme sur l'ensemble. **Dire la puissance d'avance.** À effet nul, deux matchs lus chacun à 95 % arrêtent un correctif environ une fois sur vingt : c'est le prix de la règle, et on ne le rembourse pas en remesurant sans fait neuf. |
| « ce réseau est celui qu'a entraîné bullet » | Le réseau quantifié, chargé par le moteur, contre `trainer.eval(fen) × 400` de bullet, sur des positions variées : `tools/nnue-train` le fait lui-même au bout de l'entraînement. **Critère : écart médian ≤ 15 centièmes, maximal ≤ 50.** Un écart de l'ordre de l'évaluation elle-même dit des entrées mal indexées : un réseau mal branché ne fait rien planter, il joue mal. |
| « c'est plus rapide » | `cargo run --release --bin shallowred -- bench`, même machine, avant et après : **le nombre de nœuds d'abord**, qui est déterministe, puis le temps par `tools/timing.sh`. **Le banc évalue à la main, le moteur joue avec le réseau** : un changement de l'inférence NNUE ne s'y voit pas, et un banc qui emploie le réseau reste à écrire. |
| « c'est plus fort » | **Jamais déduit d'un nombre de nœuds, dans aucun sens.** Les trois combinaisons de signes sont mesurées ; un même rapport rend les deux signes (÷1,03 : PVS −11, l'historique de continuation +12,6 ± 4,4), et un arbre égal au bit près rend +23,2 ± 3,2. Un rapport de nœuds mesure le travail à une profondeur donnée, jamais la force : seul le SPRT tranche. |
| « cette technique est standard, donc elle aide » | **Rien.** Une technique standard entre par le SPRT comme les autres, et **un verdict appartient à sa base autant qu'à sa cadence** : PVS, un néant en septembre (−0,8 ± 8,2), rend +11,67 ± 3,38 sur la base du 7 oct. 2026. |
| « cette rustine de l'attic s'applique encore » | **`git apply --check`, jamais la table** : `engine/tests/rustines_attic.rs` confronte la colonne de `tools/attic/README.md` au vrai résultat. Une rustine qui cesse de s'appliquer parce que son code est entré dans `main` est un rejet levé, pas une régression. **S'appliquer n'est pas compiler** : une rustine qu'on va employer se construit d'abord, et sa correction retourne à l'attic. |
| « ce réglage était mauvais, pas la technique » | **Une bissection par le paramètre, pas une intuition — et elle appartient à sa cadence** : celle de l'élagage par compte de coups, faite à `1+0,01`, concluait qu'aucun seuil ne paie ; à `8+0,08`, ses deux seuils ont gagné. |
| « j'ai mesuré le mécanisme, donc je sais » | **Vérifier le dénominateur**, grandeur comme ensemble : la part des coups tranquilles élagués ne dit pas la part des nœuds économisés, et une moyenne sur tous les coups ne dit pas celle des seuls coups comparables. |

## Avant d'affirmer

Repris du protocole du carnet de bord le 17 nov. 2026 (B-0007) : les
règles qui ne figuraient pas encore ici. Les autres, et l'histoire de
celles-ci, sont au journal (J-2026-11-17-F).

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
  attente fabrique des affirmations sans artefact. Ce déclencheur a été
  ajouté le 16 sept. 2026, après une relecture demandée par Théo, quand
  les règles de la prédiction, écrites le 14, n'avaient pas tenu
  (J-2026-09-16-C).
- **Dans une synthèse, une affirmation sur l'état d'un système ou sur un
  résultat à venir renvoie à un artefact regardé dans le même tour**, ou
  ne s'écrit pas : la synthèse est le lieu où l'on généralise.

**Ces règles ne se certifient pas elles-mêmes.** Le 16 sept. 2026,
celles de la prédiction étaient écrites depuis deux jours et ont été
enfreintes : c'est une relecture demandée par Théo, pas une règle, qui a
rattrapé la faute (J-2026-09-16-C).

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
  <br>**Confirmé depuis sur d'autres techniques, et le sens ne s'est jamais
  inversé.** La cadence longue change soit le signe — LMP au seuil 6, −21,6 →
  +15,3, et le seuil 12 bascule aussi —, soit la magnitude — fenêtres d'aspiration **× 2,7**, trois
  termes d'évaluation **× 2,5**. *Mesurer court sous-estime, jamais l'inverse*
  — **pour ce qui relève de la cadence seule**. <s>Aucun acquis remesuré n'a
  perdu de valeur.</s> **Faux depuis le 22 sept. 2026** : l'élagage delta passe
  de +32,5 à un effet indistinguable de zéro. Ce n'est pas un contre-exemple à
  la cadence — cadence et base ont changé ensemble, et l'échange statique coupe
  les mêmes objets au même endroit, ce que l'écran en nœuds chiffre. **Un
  acquis peut fondre par EMPILEMENT sans que la cadence y soit pour rien.** **Corollaire dérivé, et il coûte
  des matchs** : un effet estimé depuis un verdict à `1+0,01` sert de MAJORANT
  au budget, pas d'estimation — le projet a failli renoncer au verdict des
  trois termes parce que 59 500 ÷ 14,9 dépassait le plafond d'un job, et il
  est tombé en 1 580 parties.
- **La ressource TOTALE consommée n'est pas l'ALLOCATION par unité — et une
  ressource qui se partage entre les coups sature.** Mesuré le 22 sept. 2026,
  après avoir publié le mauvais chiffre. « Le moteur laisse 47 % de sa pendule,
  donc la dépenser vaut × 1,9 de temps » est vrai du **total** et faux du
  **budget par coup** : celui-ci vaut `restant / movestogo`, donc il est
  proportionnel à ce qui reste, et dépenser plus tôt laisse moins ensuite. Le
  balayage rend **× 1,32**, pas × 1,9 — un facteur 2,5 sur la valeur annoncée
  du chantier. **Et ça sature** : le diviseur 12 alloue 285 ms, le 10 en alloue
  283, parce que le plafond d'une allocation *plate* vaut
  `(pendule + coups × inc) / coups` = 280 ms. *Avant de convertir « on en
  gaspille X % » en « on peut en avoir X % de plus », vérifier si la ressource
  est allouée par unité ou consommée en commun.* Même famille que le
  dénominateur, appliquée cette fois à une ressource partagée dans le temps.
  <br>**Deuxième occurrence le 24 sept. 2026, sur C24.** « La dure repoussée
  rend un pli aux 22 % de coups qu'elle coupait » : attendu écrit +0,15 à
  +0,35 pli. La douce avancée de 0,50 à 0,44 budget en reprend presque autant
  ailleurs — l'écran, interrogé, rendait **+0,05**, et la partie a mesuré
  −0,00 ± 0,09. *Une réallocation à total constant a deux côtés, et un
  attendu dérivé de tête n'en compte qu'un.* **Quand l'instrument qui calcule
  l'attendu existe déjà, l'attendu se calcule** : la trace de l'écran simulait
  toute règle d'arrêt, et je ne le lui avais pas demandé.
- **Une réallocation à temps constant ne se lit pas en plis moyens.** C24,
  24 sept. 2026 : laisser finir l'itération entamée ne change pas la
  profondeur moyenne — +0,05 pli à l'écran, −0,00 ± 0,09 en partie — et vaut
  **+44,64 ± 6,24 Elo** à `8+0,08`. Deux lectures avaient été écrites avant le
  match : par les plis moyens, +2 à +7 ; par l'**accord avec un oracle** — la
  décision au bout d'une recherche six fois plus longue, convertie en temps
  plat équivalent —, +39 à +68. **La seconde a tenu, la première a manqué
  d'un facteur six.** *Les plis moyens mesurent COMBIEN on cherche ; une
  réallocation change OÙ.* Les plis restent l'unité commune pour un gain de
  vitesse ou de temps total ; pour une réallocation, l'étalon est l'accord à
  temps plat, et l'écran d'allocation sait le calculer
  (`tools/attic/c24-sonde-allocation.patch`).
  <br>**Un second point le même jour, sur C25, et il borne l'étalon** : la
  douce par stabilité du coup, +0,17 à +0,36 pli d'accord à l'écran, vaut
  **+7,87 ± 6,08** — **22 à 46 Elo par pli d'accord** au point, contre ~69
  pour C24. L'accord a prédit le SIGNE, pas le TAUX. La réserve écrite avant
  le disait : un coup instable hésite entre deux coups presque équivalents,
  donc la règle qui le cible achète des plis d'accord qui valent moins.
  *L'Elo d'un pli d'accord appartient à la règle qui l'achète* : converti au
  taux d'une autre règle, un attendu est un majorant dès que la nouvelle
  cible davantage ce que l'étalon surestime.
  <br>**Et l'accord se lit contre un ORACLE, jamais contre la base** — n° 12,
  7 oct. 2026. Au rejeu de parties, table et historiques conservés d'un coup
  à l'autre, chaque variante qui touche l'arbre change **28 à 32 %** des
  coups rendus, la décroissance des cinquante coups comprise, dont
  l'attendu disait 0,2 à 2 % : une perturbation se propage à toutes les
  recherches d'après. *L'accord avec la base mesure la sensibilité du
  rejeu, pas la décision.*
- **Une comparaison entre réglages qui CHANGENT le déroulement n'est pas
  appariée.** La même sonde a d'abord donné le gain de profondeur non monotone
  — −0,22 à +0,66 pli pour un budget × 3. Cause : plus de temps fait jouer
  d'autres coups, donc d'autres parties, donc un autre mélange de phases — et
  une finale se cherche bien plus profond qu'un milieu de partie. **On
  comparait des profondeurs moyennes sur des ensembles de positions
  différents.** Le geste : convertir par une grandeur *appariée* (ici le budget
  alloué, à travers une courbe profondeur/temps mesurée à positions fixes), ou
  brider la phase. Un réglage qui change ce que le moteur *joue* ne se mesure
  jamais par une moyenne sur ce qu'il a joué.
- **Un moteur qui DÉMARRE FROID n'est pas un moteur en partie.** L'écran de B2
  cherchait d'abord 400 positions isolées en vidant la table entre chacune. Il
  donnait « la dernière itération change le coup joué : 15,0 % » ; en parties
  entières, table conservée d'un coup à l'autre, c'est **7,9 %**. Le biais
  valait **un facteur deux, et il allait dans le sens de ma conclusion** — la
  pire direction. C'est le piège voisin de « le banc n'est pas un échantillon
  de jeu », d'un cran plus profond : *les positions peuvent venir de vraies
  parties et le RÉGIME rester faux*. Toute question portant sur ce que la
  recherche accumule — table, killers, historique, coup précédent — se mesure
  en jouant, jamais en visitant.
- **Une sonde jetable vit dans sa rustine, jamais dans l'arbre.** Le 22 sept.
  2026, trois binaires de sonde ont été déposés dans `tools/src/bin/` : cargo
  les découvre automatiquement, ils importaient des statiques d'instrumentation
  — et **au moment où `search.rs` a été rendu à `main`, le dépôt ne compilait
  plus**. Le modèle de `d2-sonde-pv.patch` était le bon depuis le début :
  l'instrumentation ET son lecteur dans le même patch, à l'attic, ou ni l'un ni
  l'autre. Pour itérer sans casser l'arbre, une crate jetable hors du dépôt qui
  dépend du moteur par chemin.
  <br>**Et le garde-fou qui aurait dû l'attraper avait un trou, plus large que
  l'incident.** `engine/tests/outillage_documente.rs` balayait `tools/` pour
  les `.sh` **uniquement** : il n'a jamais regardé `tools/src/bin/`. En l'y
  étendant, **cinq des six binaires se révèlent non documentés**, dont
  `attack_dump.rs` depuis sa création — et deux ne sont même pas déclarés dans
  `tools/Cargo.toml`, ils vivent par autodécouverte. Troisième occurrence de
  « un garde-fou correct qui garde le mauvais ensemble », après `see.rs` hors
  du cliquet (Q4) et le chiffre de bench lu dans un seul fichier (B10).
  <br>**La casse d'arbre, elle, est devenue inexprimable le 23 sept. 2026** :
  `tools/Cargo.toml` porte `autobins = false`, donc un fichier déposé dans
  `tools/src/bin/` **n'est plus compilé tant qu'il n'a pas sa section
  `[[bin]]`**. Les deux oracles qui vivaient par autodécouverte —
  `see_check.rs` et `attack_dump.rs` — y sont désormais déclarés. Éprouvé dans
  les deux sens : un fichier délibérément non compilable laisse le build vert
  tant qu'il n'est pas déclaré, et le casse dès qu'il l'est. *La discipline
  — une sonde vit dans sa rustine — reste du jugement ; ce qui est fermé, c'est
  le mode de défaillance qu'elle laissait passer.*
- **Un mécanisme vérifié à l'arithmétique qui ne retombe pas sur la mesure
  n'est pas réfuté — il est incomplet, et le résidu se nomme.** Le gaspillage
  de pendule était prédit à 31 % de restant par le modèle `restant/30 + inc/2`
  et mesuré à **47 %**. Tentation : conclure que le mécanisme n'est pas celui
  qu'on croit. **Faux** — l'écart est l'échéance douce, qui interdit d'entamer
  une itération à mi-budget, donc le moteur ne dépense même pas ce qu'il s'est
  alloué. Deux effets, même sens. *Nommer le résidu, ou l'écart finira par
  servir d'argument contre une conclusion juste.*
- **Dimensionner un mécanisme borne son gain possible ; ça ne le prédit pas.**
  Avant d'écrire l'extension d'échec j'ai mesuré ce qu'il restait à gagner :
  77 % des nœuds en échec sont déjà en quiescence, LMR exempte déjà les échecs,
  et ce qui reste pèse **1,39 % de l'arbre** — « le même ordre de grandeur que
  la futilité inverse, qui vaut +24,3 Elo ». J'avais étiqueté cette dernière
  phrase **confiance faible**, et c'était la bonne étiquette : mesuré,
  **−5,01 ± 8,11** à `8+0,08` sur 3400 parties. La part de l'arbre touchée
  majore ce qu'un mécanisme peut rapporter ; elle ne dit rien du SIGNE, parce
  qu'un mécanisme qui coûte des nœuds sans améliorer la décision les dépense
  en pure perte. **Une proportionnalité entre part de l'arbre et Elo n'a jamais
  été vérifiée sur ce projet, et ce point la contredit.**
  <br>**Et un taux de DÉGÂTS ne se lit qu'avec l'économie qu'il achète** —
  6 oct. 2026. L'échange statique des tranquilles (C40) détruisait 1,4 % des
  montées d'`alpha`, « la classe de la futilité et du compte de coups »
  (2,0 % à leur réglage retenu) : il a régressé de **−4,3 ± 3,5** quand
  ces deux-là gagnaient +17 et +24. Par point de dégâts, il n'achetait que
  5 points d'arbre, contre 11 à 15. *Un budget de dégâts n'est pas un
  budget de gain* ; le rapport des deux se calcule à l'écran, avant le
  match.
- **Les six positions de `bench` ne sont pas un échantillon de jeu.** Elles
  sont choisies pour être comparables d'une version à l'autre, pas pour
  représenter ce qu'une partie traverse. Mesurée sur le banc, la fréquence de
  la garde anti-zugzwang donnait 0,4 à 0,6 % des nœuds ; mesurée sur des
  positions tirées de vraies parties, 1,9 % — un facteur 3 à 5. Toute question
  portant sur une phase de jeu se mesure sur des positions extraites d'un
  match (`-pgnout`, puis échantillonnage).
  <br>**Et il ne SATURE pas les ressources dont on change la taille** — c'est
  la même limite, d'un cran plus profond que le mélange de phases. Doubler la
  table de transposition (B9, 23 sept. 2026) déplace le banc de **2 nœuds à la
  profondeur 7 et de 0,04 % à la profondeur 10**, parce qu'il explore 635 210
  nœuds pour 524 288 entrées, sur six positions cherchées **à froid**. Un
  lecteur pressé conclurait « doubler la table ne sert à rien » ; ce que le
  banc dit vraiment, c'est qu'il ne la remplit pas. *Avant de conclure d'un
  banc qu'un dimensionnement n'a pas d'effet, vérifier qu'il atteint seulement
  la borne qu'on déplace.*
  <br>**Et il peut INVERSER une conclusion de temps.** A18, 24 sept. 2026 : à
  la profondeur 12, le banc donnait le sélecteur par étapes **4,8 % plus
  lent**, son arbre **+14,9 %** — la position initiale y grossissait de 66 % à
  elle seule, quand quatre positions sur six rétrécissaient. Sur 150 positions
  de vraies parties, à la même profondeur : **−11,3 % de temps**, l'arbre
  −2,2 %. *Un changement d'ordre déplace chaque arbre dans les deux sens ; six
  positions n'en moyennent pas la taille.*
- **Quand un mécanisme est rare par construction, compter ses nœuds ne
  tranche rien — compter ses DÉGÂTS, si.** D2 supposait que PVS vaut par le
  gatage de LMP sur les nœuds hors variante principale. La question naturelle
  — « quelle part des nœuds est sur l'épine PV ? » — ne pouvait rien décider :
  l'épine porte au plus un nœud par ply, donc sa part est dérisoire quelle que
  soit la réponse. **Mesuré le 21 sept. 2026 sur la bonne grandeur** : l'épine
  est 0,50 % des nœuds, 0,81 % des coupes de LMP, et **3,79 % des montées
  d'`alpha` détruites** — 4,8 fois plus dangereuse par coupe, donc le mécanisme
  existe, mais un ordre de grandeur trop petit pour expliquer les 25 Elo qu'il
  devait expliquer. **D2 est clos sans un seul match.** Troisième forme du même
  piège, après le dénominateur de LMP et le balayage par `movetime` : un chiffre
  vrai qui répond à une autre question.
- **« L'outil ne sait pas le faire » se lit dans son SOURCE, à la version qu'on
  épingle — et « l'outillage », c'est tout ce qu'on a déjà.** Le 23 sept. 2026
  j'ai écrit que le ponder était « inmesurable avec l'outillage actuel », sur
  la foi d'un mot absent du README de fastchess. Deux fautes en une. **La
  bonne source** : le dépôt de fastchess au commit épinglé ne contient
  effectivement pas une occurrence du mot — mais c'est un `grep` sur l'arbre,
  avec un témoin qui répond, qui l'établit, pas une documentation. **Le bon
  ensemble** : `setup-arbiters.sh` construit DEUX arbitres, et cutechess-cli
  supporte `ponder` par moteur, documenté dans son `help.txt`. J'avais posé la
  question au seul outil que j'avais en tête. *Une capacité déclarée absente
  ferme un chantier ; avant de l'écrire, lire le source, et énumérer les
  outils au lieu de penser à celui qu'on vient d'utiliser.* Même famille que
  « un garde-fou peut garder la mauvaise chose », appliquée non plus à un
  dispositif mais à une conclusion.
  <br>**Deuxième occurrence le 24 sept. 2026, sur une référence et non un
  outil.** Le backlog de C26 citait « Stockfish plafonne l'excès à ~1,7
  budget à deux coups du contrôle » — de tête, d'une formule ancienne. Son
  source, lu au commit, borne la durée maximale à **81 % de la pendule** et
  accepte d'en dépenser ~77 % à deux coups du contrôle : le chiffre était
  faux, et la conclusion qu'on en tirait aussi. *Une référence extérieure se
  lit dans son source, au commit qu'on cite* — sans quoi c'est un souvenir
  qui passe pour une mesure.
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
- **Le doublement mesure un coût MARGINAL, pas une part — un minorant.**
  N° 15, 13 oct. 2026 : refaire le calcul du réseau une seconde fois, à
  résultat identique, coûtait **16,8 %** du temps d'un nœud ; récrire ce
  calcul pour le vectoriseur en a retiré **14,4 %** (n° 16) — pour un
  attendu de 7 à 9 %, dérivé de la première mesure. La seconde exécution
  trouve les poids et l'accumulateur déjà en cache : elle coûte moins que
  la première, et le doublement sous-estime la part d'autant que le calcul
  attend la mémoire. *Il borne par en dessous ce qu'on peut gagner ; il ne
  dit pas combien.* Le chiffre qui décide est la variante écrite, mesurée
  contre `main` à arbre identique.
- **Mesurer le mécanisme avant d'en mesurer l'effet en Elo.** Compter combien
  de fois un phénomène se produit coûte des minutes d'instrumentation ; en
  mesurer l'effet coûte des heures de match. Et si le phénomène ne se produit
  pas, la question est close pour de bon au lieu d'être reportée.
  **Confirmé le 14 sept. 2026** : dix minutes d'instrumentation ont montré que
  90 % des nœuds sont en quiescence et qu'un test delta atteindrait 39 % des
  captures qu'elle examine. Les cinq lignes écrites ensuite valent
  **+32,5 Elo ± 12,3**. Choisir où creuser se mesure, comme le reste.
- **Un seuil sur une grandeur sans échelle n'est pas un réglage, c'est une
  dérive.** L'historique gagne `d²` par coupure et ne se divise qu'à
  800 000 : ses notes grandissent avec la profondeur cherchée. Le cinquième
  écran (7 oct. 2026) a d'abord posé ses seuils à 100 000 — aucune note ne
  les atteignait, 0,00 % d'arbre ; puis à 1 000, et la même réduction
  modulée passe de **+1,7 % d'arbre à la profondeur 10 à +14 % à la 12**.
  Un réglage trouvé à une profondeur ne vaut pas à la suivante, ni d'une
  cadence à l'autre. *Avant de régler un seuil, lire l'histogramme de la
  grandeur là où il tranche — et vérifier qu'elle a une borne.*
- **Une érosion se cherche en NŒUDS avant de s'acheter en Elo.** Revalider un
  acquis coûte un job ; mesurer ce qu'il façonne encore de l'arbre coûte trois
  minutes et ne dépend pas du hasard. Le 22 sept. 2026, les trois lignes
  restantes de D5 ont été passées ainsi, et elles se séparent : deux façonnent
  autant ou plus qu'à leur verdict, une nettement moins. **La cause de la
  troisième est mesurée par les quatre coins**, pas supposée — elle coupe au
  même endroit qu'un mécanisme fusionné depuis, et le plan factoriel chiffre le
  recouvrement. Chiffres dans `tools/README.md`, jamais recopiés ici.
  <br>**Ce que cela ne donne pas** : l'Elo, ni son signe. Le rapport de nœuds
  mesure le coût, exactement, et rien d'autre — c'est la règle voisine, et elle
  tient. Ce que cela donne est l'**ordre d'achat** des matchs, là où la fiche
  écrivait « il n'y a plus d'ordre imposé ». Corollaire à ne pas manquer : une
  colonne « empilé depuis » vieillit à chaque fusion, et celle de D5 datait
  d'avant les deux élagages qui ont précisément mangé la ligne érodée.
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
- **Une propriété générale assertée sur UNE position passe par chance, et le
  jour où elle tombe on accuse le mauvais coupable.** Deux tests d'aspiration
  assertaient que, sans l'élagage par compte de coups, le score de la boucle ne
  dépend pas du pari initial — chacun sur une position. PVS les a fait tomber,
  et mon premier diagnostic a été « PVS déstabilise l'aspiration ». **Mesuré le
  21 sept. 2026 sur `main`, sans une ligne de PVS** : sur 153 positions d'une
  marche seedée et trois paris chacune, le score diffère déjà de la fenêtre
  pleine **38 fois sur 459, soit 8,3 %** (25,1 % avec l'élagage par compte).
  L'instabilité préexistait ; les deux tests tombaient dans les 91,7 % stables.
  **Un contrôle qui suppose une propriété doit la COMPTER sur un échantillon**,
  et borner qualitativement — « non nul », « plus grand que » — jamais par un
  taux chiffré, qu'un changement de recherche ferait dériver.
  <br>**Et un échantillon dimensionné sur une marge ne vaut que tant que la
  marge tient** — 7 oct. 2026. Le test de la futilité inverse comptait sa
  somme sur trente-six positions, choisies le 5 oct. pour basculer moins
  d'une fois sur mille. Deux jours plus tard — le groupe du n° 9 et C41
  fusionnés entre-temps —, la futilité inverse ne retirait plus que 6,3 %
  de l'arbre au lieu de 26 % *dans le régime du test* — à la faite main, à
  froid ; au réseau, en partie, elle en retire toujours un tiers —, et la
  même
  somme basculait **6,5 % des fois sur `main`** — sans que rien ne le
  signale, jusqu'à ce qu'une composition la fasse tomber. *La probabilité
  de bascule appartient à la marge du jour, et une marge s'érode par
  empilement* : un test qui asserte un SENS sur un échantillon se
  redimensionne quand l'effet qu'il garde fond, ou garde autre chose — ici
  le branchement. Son jumeau, l'élagage par compte, mesuré le même jour,
  garde la sienne : 0,62 au total, aucune bascule sur 200 000 tirages.
- **Une reformulation justifiée par une mesure INDÉPENDANTE du changement n'est
  pas de l'accommodement.** La règle ci-dessous interdit d'assouplir un test
  jusqu'à ce qu'il passe, et tient une seconde reformulation du même test pour
  suspecte. Le garde-fou réel n'est pas le compteur de reformulations, c'est
  l'indépendance : **la mesure qui condamne l'assertion a-t-elle été obtenue
  sans le changement qu'on veut faire passer ?** Si oui, l'assertion est fausse
  en elle-même et la retirer est la réponse honnête ; si non, c'est du
  motivated reasoning quelle que soit la fois. <span>Arbitrage utilisateur du
  21 sept. 2026 : « *tout ce qui peut se résoudre par la mesure et par
  l'objectif de qualité long terme ne nécessite pas d'arbitrage* ».</span>
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
  <br>**Et elle n'est que le cas particulier d'une inégalité, qui se
  franchira bientôt À L'INTÉRIEUR d'un match** : *cœurs occupés par une
  partie × concurrence ≤ cœurs − 1*. Monofil sans ponder, un seul moteur
  réfléchit à la fois, d'où la concurrence 3 sur 4 cœurs. **Un camp qui
  pondère occupe deux cœurs** (concurrence 1), **Lazy SMP à `T` fils en
  occupe `T`** (`⌊3 / T⌋`). Et le biais change de sens selon le chantier : le
  ponder vole du CPU à l'adversaire du candidat, donc *vers* l'hypothèse ;
  Lazy SMP en vole au candidat lui-même. **`match.yml` dérive la concurrence
  de l'inégalité depuis le 23 sept.** — deux cœurs par partie dès que
  quelqu'un pondère — et refuse de lancer si elle ne tient pas ; **les fils
  depuis le 24 sept.** (`fils_candidat`, `fils_reference`), avec deux refus
  de plus : un moteur qui ne DÉCLARE pas `Threads` — il l'ignorerait en
  silence et jouerait monofil —, et, dans une partie, plus de fils
  réfléchissant à la fois que de cœurs physiques.
  Tableau dans `tools/README.md`.
  <br>**Mesuré le 23 sept. : ces quatre cœurs sont quatre processeurs
  LOGIQUES pour deux cœurs physiques** (SMT). À concurrence 3, trois moteurs
  s'en partagent deux : symétrique, donc chaque verdict reste valide en
  interne, mais la profondeur EN PARTIE est plus basse que l'étalonnage ne le
  dit, et Lazy SMP ne s'y mesure sans SMT qu'à deux fils.
- **Un renvoi par POSITION vieillit comme un chiffre recopié, et sans bruit.**
  `tools/README.md` commentait « la dernière ligne » d'un tableau de nœuds ;
  écrite le 16 sept. 2026 elle visait juste, puis deux mesures ajoutées sous
  elle le 21 lui ont fait désigner une autre ligne, et le paragraphe est resté
  parfaitement *lisible* — ce qui est exactement pourquoi rien ne l'a signalé.
  Même famille que le chiffre de référence périmé, sans le garde-fou : aucun
  test ne peut confronter « la dernière ligne » à quoi que ce soit.
  **Nommer ce qu'on désigne, jamais le compter ni le situer** — ni « la
  dernière ligne », ni « la sixième », ni « ces cinq dispositifs ».
- **Un changement de TESTS déplace le plafond de mutation autant qu'un
  changement de code — et la règle écrite ne visait que le code.** Le 22 sept.
  2026, le balayage hebdomadaire a cassé sur `main` : `search.rs` 110 contre un
  plafond de 89, `eval.rs` 219 contre 212. **Le code de production était
  identique au bit près** — vérifié par le sha256 du fichier tronqué avant
  `mod tests`. Seuls deux tests avaient changé la veille : un `assert_eq!` de
  score exact sur une position, dont la prémisse était fausse et qu'il fallait
  bien retirer, mais qui attrapait **par effet de bord** tout mutant déplaçant
  le score — dans la recherche comme dans l'évaluation. Vingt-huit mutants
  perdus d'un coup. **Après avoir touché à un test, remesurer le plafond**, ou
  au minimum se demander ce que ce test attrapait qu'on ne lui demandait pas.
  <br>**Et un changement d'ARBRE déplace ce que les tests de nœuds voient,
  dans du code qu'il ne touche pas.** 24 sept. 2026, fusion d'A18 : le crible
  local, prédiction écrite, ne balayait que le code NEUF — 39 prédits, **43**
  rendus. Les quatre de trop vivaient dans des lignes qu'A18 n'a pas écrites
  (la prime d'historique, le `ply + 1` du coup nul et de la quiescence) et
  que seuls le banc figé et un test de PV sur une position attrapaient :
  l'arbre neuf ne les leur montrait plus. *Le crible d'un changement d'arbre
  couvre le FICHIER entier, jamais le seul diff* ; et un test de nœuds figé
  à une profondeur ne voit que ce que cet arbre-là exerce.
  <br>**Le même mutant, encore, le 5 oct. 2026** (issue #142) : C32 a rendu
  l'enfant du coup nul de profondeur ≤ 0 dans tout le banc à la 6 et à la 7,
  et le `ply + 1` de son appel est redevenu invisible — à la 8, 188 566
  nœuds sans lui, 188 503 avec. Sous le groupe du n° 9, la futilité aux
  nœuds frontières le masque jusqu'à la 9 : les enfants de profondeur ≥ 1
  y existent, mais leurs coups tranquilles sont sautés, et rien de ce que le
  `ply` indexe n'y bouge. *Quand un même mutant échappe deux fois à un test
  de nœuds, c'est l'invariant qu'il faut tester, pas un arbre plus profond*
  : `negamax` confronte désormais le `ply` au chemin, et le mutant fait
  tomber trente-quatre tests unitaires.
  <br>**Et un changement d'arbre déplace ce que voient les tests de nœuds
  dans des FICHIERS qu'il ne touche pas** — 6 oct. 2026, premier balayage
  sous le groupe du n° 9. Le banc figé perd 30 % de ses nœuds, et
  `eval.rs`, intouché depuis le 16 sept., gagne seize survivants dans ses
  tables piece-square, quand la prédiction le mettait à son plafond : je
  n'avais appliqué la règle ci-dessus qu'à `search.rs`. *Le banc figé lit
  l'évaluation autant que la recherche* ; la prédiction du balayage qui suit
  un changement d'arbre dit donc où va le plafond d'`eval.rs` aussi. Le même
  balayage montre un autre mutant de la famille du coup nul — le coup noté
  pour son enfant, `moved[ply + 1]` —, et le même remède le tue :
  l'invariant, confronté au chemin.
- **Un mutant « de réglage » n'est hors de portée des tests que si rien de
  DÉTERMINISTE ne dépend du réglage.** Le plafond d'`eval.rs` était justifié
  depuis le 15 sept. 2026 par « le fichier est en très grande part des VALEURS,
  ~189 des survivants sont des `delete -` sur les tables piece-square, et seul
  un SPRT peut en juger ». **La prémisse est vraie, la conclusion était
  fausse** : une valeur d'évaluation change le *goût* du moteur — c'est
  l'argument, et il tient — mais elle change aussi son **arbre**, et un arbre
  se compte. Quatre-vingt-dix-huit de ces mutants étaient attrapables depuis
  toujours par un simple nombre de nœuds. Avant de classer un survivant
  « affaire de SPRT », chercher ce qui dépend de lui **de façon
  déterministe**.
- **Un garde-fou peut être correct et garder la mauvaise chose.** Le contrôle
  du cliquet de mutation confrontait le plafond au balayage — ce qui est juste
  — mais rien ne confrontait ces listes à `engine/src/`. `see.rs`, né le
  16 sept. 2026, est resté hors du cliquet cinq jours : absent du plafond, le
  verdict ne cherchait pas son résumé ; absent de la matrice, le balayage ne le
  produisait pas ; absent des **deux**, il n'apparaissait dans aucun journal.
  **Les deux omissions se couvraient l'une l'autre.** La question à se poser
  n'est pas « ce garde-fou marche-t-il ? » mais « **quelle est sa source de
  vérité, et est-ce la bonne ?** » — ici le répertoire, jamais la liste.
- **Une assertion qui ne s'est jamais déclenchée ne prouve rien si aucun
  test n'atteint l'état qu'elle garde.** `pack_data` borne le score stocké
  depuis le 22 sept. 2026, et `tt.rs` en tirait « le score tient sur seize
  bits, et ce n'est pas un pari ». Aucun test ne jouait une partie jusqu'au
  mat depuis une position gagnante ; ceux du générateur NNUE, qui le font,
  l'ont déclenchée en quelques secondes — et le défaut touchait **1,82 % des
  recherches** en partie (C27). *Le silence d'une assertion mesure ce que les
  tests parcourent, pas l'absence du défaut.*
  <br>**Et un COMPTEUR de passages ne dit pas quels chemins ont été
  parcourus** — 26 sept. 2026, A21. Le test des accumulateurs NNUE comptait
  plus de mille vérifications, et le coup nul oublié passait : le réseau de
  test évaluait tout à ±8 000, la futilité inverse coupait avant le coup nul
  partout — zéro coup nul sur 54 nœuds candidats. *Ce sont les paramètres
  d'un test qui décident des chemins qu'il emprunte* ; seule une faute
  injectée par chemin l'a montré.
  <br>**Et le compteur lui-même est du code, que son test doit borner des
  DEUX côtés.** Le crible du même jour : décrémenté au lieu d'incrémenté, il
  passait « au moins mille », parce que le profil de mutation hérite de
  release — un `u64` y déborde vers 2^64 sans paniquer. Une borne basse
  seule ne voit pas un compteur faux ; la borne haute vient d'une grandeur
  indépendante — ici les nœuds, une évaluation au plus par nœud.
- **Un garde-fou qui ne couvre qu'une copie d'un chiffre dupliqué ne garde
  rien.** La première version de `engine/tests/bench_reference.rs` ne lisait
  que `CLAUDE.md`. Elle a été écrite alors que `README.md` portait déjà
  `8 432 521` — le chiffre d'avant le coup nul, **faux d'un facteur 15,6** — et
  ne l'a pas vu, parce que personne n'avait cherché si le chiffre existait
  ailleurs. La deuxième balayait une **liste écrite à la main**, ce qui laissait
  encore mon jugement décider de la couverture ; celle d'aujourd'hui parcourt
  **tout le dépôt** — hors les couches gelées de la mémoire, journal,
  demandes et décisions, qui portent de l'histoire datée (D-0013,
  D-0014) —, donc un fichier Markdown créé demain est couvert sans que
  personne y pense. **Avant d'écrire un garde-fou, chercher toutes les copies
  de ce qu'il garde** : `grep` sur la valeur, pas sur le fichier qu'on a en
  tête.
  <br>**Ces deux phrases-ci étaient fausses jusqu'au 22 sept. 2026, et de deux
  façons différentes** : « le contrôle balaie maintenant une liste de
  fichiers » décrivait la deuxième version alors que la troisième était en
  place depuis des jours, et « le contrôle **ci-dessus** » désignait le
  garde-fou de couverture de mutation, pas celui du bench. *Le piège du renvoi
  par position avait donc déjà dérivé dans ce fichier même, deux puces sous
  l'endroit où il est nommé* — et rien ne pouvait le signaler, puisque la
  phrase restait parfaitement lisible.
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
- **« Nœuds identiques au bit près » ne s'applique qu'à taille de structure
  CONSTANTE.** J'ai annoncé que la réécriture de `tt.rs` en entrées atomiques
  serait « une réécriture pure, donc nœuds identiques puis `timing.sh` ».
  **Faux, et deux minutes de sonde le montrent** : `size_of::<Entry>()` vaut
  **24 octets** aujourd'hui, une entrée atomique en fait **16**, donc à
  mébioctets égaux la table **double de capacité**, les collisions changent et
  l'arbre avec. *Une réécriture qui change la taille d'une structure n'est
  jamais pure, quelle que soit la pureté de sa logique.* Les deux effets se
  séparent par les quatre coins : le coût des accès atomiques se mesure à
  **capacité forcée égale** (et là, nœuds identiques + `timing.sh`
  s'appliquent), l'entrée deux fois plus petite est un changement d'arbre qui
  demande un SPRT — et plausiblement un gain, puisqu'il double la table à
  mémoire constante. Même famille que « vérifier le dénominateur » : un
  raisonnement correct appliqué à la mauvaise grandeur. Chiffres et encodage
  dans `tools/README.md`.
  <br>**Écrit le 23 sept., et la prédiction tient** : à capacité forcée égale
  le banc rend **exactement** les mêmes nombres, à capacité naturelle il rend
  114 026 contre 114 028. *Le découpage en deux effets n'était pas une
  précaution rhétorique — c'est ce qui a permis à `timing.sh` de s'appliquer
  du tout.*
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
- **Un mutant sans effet logique qui se dit « attrapé » est un signal, pas
  un succès.** 24 sept. 2026 : la garde de débordement de `stage_moves`, en
  `<=` au lieu de `<`, ne change rien — le débordement est inatteignable. Le
  balayage l'a pourtant déclarée attrapée, par un test à plusieurs fils. Ce
  test était instable, et il l'était pour une vraie raison : **le budget de
  `go nodes` n'était tenu que par le fil principal**, et un fil privé de CPU
  ne tient rien. Reproduit en serrant les fils sur un seul cœur, corrigé.
  *Une garde tenue par UN fil ne tient que si ce fil tourne — et
  l'ordonnancement n'est pas une ressource qu'un test contrôle.* Un test
  instable fausse aussi le cliquet, dans le sens que son asymétrie tolère :
  il ne peut que faire baisser le compte des survivants.
- **Un mutant équivalent est souvent du code mort.** Deux survivants de `tt.rs`
  inversaient la borne d'un test d'entrée vierge dans `store` sans qu'aucun
  test ne bouge. Ce n'était pas un trou de couverture : la clause ne pouvait
  rien décider, `depth` étant borné à `[0, 127]` et une entrée vierge portant
  `-1`. Aucun test n'aurait pu la couvrir ; la bonne réponse était de la
  supprimer. **Avant de classer un survivant « équivalent », se demander si la
  branche est atteignable** — la réponse change ce qu'il faut faire.
  <br>**Et une COPIE d'une règle dans une branche presque jamais atteinte est
  une règle qu'aucun test ne garde** — 12 oct. 2026, la composition du
  n° 12. PVS avait dédoublé la re-recherche après réduction : une copie
  pour le premier coup cherché, sous la fenêtre pleine, une pour les
  suivants. Le premier coup cherché n'est réduit que si tous ceux d'avant
  ont été élagués — presque jamais —, et onze mutants vivaient dans sa
  copie, que la prédiction du balayage n'avait pas vue. Ni code mort ni
  mutant équivalent : une branche atteignable que rien n'atteint. *Une
  règle s'écrit une fois, sur le chemin que tous les coups empruntent* ;
  la fenêtre seule distingue désormais le premier.
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
  <br>**Sa forme la plus nue, trouvée le 24 sept. 2026** : `assert_eq!(f(x),
  f(x))`. Le test des killers affirmait « pas à un autre ply » en comparant
  une note à elle-même — vrai quoi que fasse le code, donc aucun mutant ne
  pouvait le faire tomber, et rien ne le signalait.
  <br>**Et sa forme la plus retorse, trouvée le 30 sept. 2026 (C29)** : un
  mutant qui change TOUT de façon cohérente ne change rien d'observable.
  `<` en `<=` dans le départage du seau faisait céder la DERNIÈRE entrée de
  même valeur — donc remplissait aussi le seau à l'envers, et cette image
  miroir rendait les mêmes réponses. Le test ne lisait que les réponses ;
  la règle, elle, s'écrit sur les PLACES, et c'est là qu'il fallait la
  lire.
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
  <br>**Deuxième occurrence le 25 sept. 2026, alors que la règle était
  écrite** : le crible de `search.rs` entier au candidat A20, lancé dans le
  conteneur parce que le workflow ne savait balayer que la tête de la branche
  — et le candidat y était révoqué. Mort à 57 mutants sur 570, au
  redémarrage du conteneur qu'un rappel programmé réveillait. *Une règle que
  l'outillage ne permet pas de suivre se contourne* : `Mutation` accepte
  désormais `commit`.
- **Un SPRT expiré n'est pas « rien appris » — c'est une estimation biaisée
  VERS ZÉRO, donc un minorant.** C21 a épuisé ses 350 minutes le 23 sept. 2026
  à **3262 parties sans frontière**, et le dernier bloc complet donnait
  **+14,59 ± 8,31 Elo, LOS 99,97 %, LLR 2,48 sur 2,94** — 84 % du chemin vers
  H1. L'échantillon étant conditionné à n'avoir jamais franchi ±2,94, ses
  extrêmes sont tronqués : le vrai effet est plausiblement **au-dessus** du
  point estimé. <span>Inférence, confiance moyenne.</span> Ce qu'un tel run
  interdit, c'est de servir de **verdict** — et de se faire *reprendre* :
  prolonger un test séquentiel interrompu lui retire ses taux d'erreur. Ce
  qu'il autorise, c'est de dimensionner le match suivant : ici 59 256 ÷ 14,59
  ≈ 4 060 parties, quand le runner le plus rapide jamais mesuré n'en fait que
  3 262 en 350 min. **La règle « en dessous de ~17 Elo, plusieurs jobs à
  longueur fixe mis en commun » n'était pas une précaution, c'était une
  prédiction.**
- **Un avertissement d'arbitre est une mesure, pas du bruit.** Les deux
  matchs de C21 portaient ~200 avertissements, « PV continues after
  threefold repetition », émis par les DEUX moteurs. Je les ai recensés, puis
  classés bénins sans en lire un seul. Ils disaient que la recherche ne
  voyait pas 40 % des nulles — celles de l'horizon (C22). **Le résumé de
  `match.yml` les compte désormais par nature et par moteur** ; les lire
  reste du jugement. *Un signal qu'on a nommé « bénin » sans l'ouvrir n'a pas
  été analysé, il a été écarté.*
  <br>**Deuxième occurrence le 30 sept. 2026, et le comptage n'y a rien
  fait.** Les séries de C13 du 29 imprimaient chacune, dans leur résumé,
  un « PV continues after threefold repetition » côté ShallowRed — je les
  ai relevées sans lire cette ligne. La série suivante en portait deux
  « … after fifty-move rule », lues cette fois : **la quiescence ne testait
  aucune nulle après une parade tranquille**, dans 61 % des recherches
  (C31). *Un compteur imprimé n'est lu que si la relève le cherche* : un
  avertissement côté moteur se relève comme un score, à chaque run.
- **Une sonde qui prend pour oracle le code qu'elle mesure en hérite les
  fautes.** C22 a été motivé par « 40 % des nulles manquées à l'horizon »,
  compté avec `is_repetition` — et 88 à 92 % de ce que `is_repetition`
  détectait était faux, par deux coups nuls consécutifs (C23). Le symptôme
  était vrai, la grandeur non ; le correctif, qui étendait ce test à
  l'horizon, a régressé de **−10,44 ± 6,34**, et c'est le critère écrit
  d'avance qui l'a arrêté, pas la sonde. *Avant de compter un phénomène avec
  le code qui le détecte, vérifier ce code sur les cas qu'il détecte* — la
  même idée que deux arbitres indépendants, appliquée à une sonde.
- **Un contrefactuel d'ORDRE est biaisé vers l'ordre joué.** A20, 25 sept.
  2026 : pour classer cinq raffinements de l'ordre des coups sans les écrire,
  la sonde calculait le rang qu'aurait eu le coupeur sous chaque ordre.
  Toutes les variantes sortaient pires que l'ordre joué — même le coup de
  réfutation, juste une fois sur six. **Le coupeur est le premier coup qui
  coupe DANS L'ORDRE JOUÉ** : ceux qu'un autre ordre placerait devant lui
  n'ont jamais été cherchés, et certains auraient coupé aussi. Le malus en
  était le cas visible : appris sous l'ordre joué, il punit ce que cet ordre
  essaie d'abord. **Il reste valide un plafond et un minorant, pas un
  classement.** La mesure juste était l'arbre de chaque variante APPLIQUÉE,
  rejouée sur des parties : déterministe, elle a désigné la seule qui a
  ensuite rendu +12,56 ± 4,35.
  <br>**La même sonde portait un dénominateur faux d'une autre sorte** :
  sommer nœud par nœud les sous-arbres cherchés avant le coupeur comptait
  deux fois ceux qui s'emboîtent — 67 % des nœuds sur une position,
  impossible pour un plafond ; l'union, propagée de fils en père, en rendait
  la moitié. *Un total de coûts emboîtés est une union, jamais une somme.*
- **Un changement de recherche se mesure sur un commit RÉVOQUÉ aussitôt**,
  pas au bas de la branche. C21 était le plus ancien de sa pile : dix-sept
  commits de documentation ont attendu son verdict. Le geste depuis C22 :
  committer le candidat, le révoquer dans le commit suivant, mesurer le SHA
  du premier. `match.yml` récupère l'historique complet et la fusion se fait
  en `merge` — le SHA reste atteignable — et la branche reste fusionnable.
  Au verdict, révoquer la révocation. La rustine de l'attic en garde une
  copie qui survit à tout.
- **Contrôler la vraisemblance avant d'inscrire un chiffre.** Un rapport
  parfaitement rond, nul, ou de plusieurs ordres de grandeur est un signe de
  protocole cassé, pas un résultat.
- **Les arbitres impriment un score courant après chaque partie.** Lire la
  dernière ligne, jamais la première.
- **Un livre d'ouvertures est une condition de validité**, pas un agrément :
  le moteur étant déterministe, sans livre toutes les parties d'un match sont
  la même partie.
  <br>**Et la GRAINE l'est tout autant, entre deux matchs qu'on veut mettre en
  commun.** <s>Mêmes binaires plus même graine donnent **les mêmes parties,
  coup pour coup** — c'est la même propriété, d'un cran plus haut. Rejouer un
  match expiré avec sa graine d'origine n'apporte donc *rien*, et donner la
  même graine à deux jobs qu'on additionne produit deux copies l'une de
  l'autre : l'effectif double sur le papier et l'information ne bouge
  pas.</s> **Remesuré le 1er oct. 2026 sur les journaux de B8 — à la
  pendule, c'était faux, et le vrai partage était ailleurs.** Une même
  ouverture rejouée, mêmes binaires, même machine, ne recopie pas sa partie :
  même paire d'issues 22 à 25 % des fois, contre 10 à 12 % entre ouvertures
  différentes, et des scores de paire presque pas corrélés (r ≈ 0,03). **Ce
  que les matchs partagent, c'est le LIVRE** : 500 ouvertures, que fastchess
  mélange une fois puis parcourt en boucle — deux matchs de 3 000 parties
  jouent les mêmes, trois fois chacune, **quelle que soit la graine**. Le
  coût, ~7 % sur un intervalle mis en commun, ne compte qu'au ras d'une
  borne (`tools/README.md`, « Le livre, réutilisé »). *Des graines distinctes
  restent la règle — rien ne dit que la pendule brouille autant à une autre
  cadence —, mais une graine permute le livre, elle ne l'agrandit pas.*
  **Depuis le 6 oct. au soir, le livre a 15 000 ouvertures** : un job en
  tire 1 500 distinctes, deux jobs n'en partagent que 150 en moyenne.
- **Des pièges de ce fichier sont partis dans `tools/pieges-fermes.md`.**
  Chacun est désormais tenu par un dispositif qui le rend inexprimable —
  `ref.sh`, `timing.sh`, `sprt.sh`, `mutants.sh`, `bench_reference.rs`,
  `rustines_attic.rs`, le banc à la profondeur 6, le plafond calculé de
  `match.yml`. **Une règle qu'un code de sortie impose n'a pas besoin d'être
  relue à chaque session** ; elle a besoin d'être trouvable le jour où le
  dispositif se déclenche. Ceux qui restent ci-dessus sont ceux que **seul le
  jugement protège** — et ce sont les plus chers. *Si un de ces dispositifs
  disparaît, son piège revient ici.*

## Style

- Tests écrits en même temps que le code, pas après.
- Pas d'`unwrap()` ni d'`expect()` hors des tests — la lint les signale.
- Pas d'`unsafe` : la lint l'interdit — **sauf le SIMD de l'inférence**.
  Théo, 20 oct. 2026 : « *Si annuler cette décision augmente l'elo long
  terme, je le fais. Le but absolu est la perf* ». Les conditions, écrites
  le même jour : confiné à UN module de `engine/src/nnue.rs` qui porte
  `#[allow(unsafe_code)]` — la lint de l'espace de travail passe alors de
  `forbid` à `deny`, pour que tout le reste refuse encore —, chaque bloc
  derrière la détection du jeu d'instructions à l'exécution ou la cible de
  compilation, et **confronté en test à la version scalaire**, qui reste :
  même évaluation à l'unité près, donc même arbre. Il entre s'il rend du
  temps à arbre identique (rejeu, test des signes), comme le chemin A du
  n° 16. **En place depuis le 20 oct. 2026** : le module `avx2` du produit
  scalaire de la sortie, **−5,09 % de temps** à arbre identique (120
  tours, IC −6,07 à −4,11) — le compilateur ne sortait de la forme scalaire
  que des registres de 128 bits (`tools/README.md`, « La file, phase 2 — le
  produit scalaire en AVX2 »).
- Commentaires en français, code et identifiants en anglais.
- **Les heures s'écrivent à l'heure de Paris** — messages, carnet,
  documentation (Théo, 6 oct. 2026). Celles d'avant cette date, dans le dépôt
  comme dans le carnet, sont en UTC, l'horloge du conteneur : deux heures de
  moins que Paris jusqu'au 25 oct., une ensuite. Seuls les horodatages des
  rappels programmés restent en UTC, l'API l'exige.
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

**Vérifier par `tools/verify.sh`, jamais en lisant la sortie de `cargo test`.**
Le 14 sept. 2026, un test échouait et je ne l'ai pas vu : j'avais filtré la
sortie sur « test result » et sommé les totaux. La ligne disait `FAILED`, la
somme disait 81, et j'ai lu la somme. **Un code de sortie ne se lit pas de
travers.** Le script exécute toutes les étapes même après un échec — découvrir
trois problèmes d'un coup coûte moins cher que trois allers-retours.
**Et jamais à travers un tube** : `verify.sh | tail && git commit` rend le
code de `tail`, toujours zéro — le 14 oct. 2026, un commit est parti ainsi
sur un clippy rouge. Rediriger vers un fichier, puis lire `$?`.

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
| `engine/tests/pieges_fermes.rs` | confronte `tools/pieges-fermes.md` au dépôt : **chaque piège archivé doit nommer un dispositif qui existe**, et l'archive doit rester nommée dans `CLAUDE.md`. Sans lui, un piège dont le dispositif disparaît resterait archivé comme « tenu » |
| `engine/tests/outillage_documente.rs` | exige que chaque dispositif soit **nommé avec son extension** dans une doc : scripts de `tools/`, workflows, hooks et binaires de `tools/src/bin/`, énumérés par répertoire et par extension, jamais nom par nom |
| `.github/workflows/mutation.yml` | mardi 00:00 UTC : balayage par mutation, un job par fichier, puis le job `Verdict` |
| `tools/binaires.sh` | dans la CI, à chaque push : construit les deux binaires livrés, `x86-64` et `x86-64-v3`, et **refuse de les rendre s'ils ne cherchent pas le même arbre**, banc fait main et réseau. Sur une PR et sur `main`, de même sous Windows, sur Mac Intel et sur Apple Silicon, et le job « Le même arbre sur chaque système » exige la même empreinte sur les quatre (ADR-0031) ; sur `main`, il les publie en artefact. Éprouvé par `tools/binaires-test.sh`, dans `verify.sh` et la CI |
| `tools/balayage-vivant.sh` | étape du job `Moteur`, à chaque push : échoue si le workflow `Mutation` est endormi ou n'a pas tourné depuis quinze jours. **Le cliquet ne peut pas signaler sa propre absence**, et GitHub endort les workflows planifiés d'un dépôt public après soixante jours sans activité. Éprouvé par `tools/balayage-vivant-test.sh`, dans `verify.sh` et la CI |
| `.github/workflows/nnue-train.yml` | à chaque push qui touche `engine/src/nnue.rs`, la crate `tools/nnue-train` ou la toolchain : compile le programme d'entraînement NNUE, `--locked`, sans GPU, contre le runtime factice de bullet. Ce programme a son propre espace de travail : sans ce contrôle, un changement de l'API du moteur le casserait en silence, et on ne l'apprendrait que le jour de l'entraînement |
| `.github/workflows/pages.yml` | à chaque push sur `main` qui touche le moteur, `reseaux/` ou `ui/` : publie la version web de l'interface sur GitHub Pages (ADR-0028), **le binaire du moteur lui-même compilé pour `wasm32-wasip1-threads`**, et en repli la crate à part `ui/wasm`, qui recopie la couche UCI. **Ne publie que si chaque module rend la transcription du binaire au nœud près** (`ui/dev/wasm-check.mjs`). **Un changement d'`engine/src/main.rs` ou de la couche UCI qui casserait cette compilation casse aussi ce workflow.** Sur une PR qui touche `engine/src/uci.rs`, il vérifie sans publier : **un changement de la couche UCI se fait suivre dans `ui/wasm/src/lib.rs`**, jamais l'inverse. Voir `ui/README.md`, « Version web » |
| `.github/workflows/match.yml` | **à la demande** (`workflow_dispatch`) : un match entre deux commits sur un runner GitHub, le seul moyen de mesurer **à cadence longue**, qu'un conteneur de session ne tiendrait pas. Le job **étalonne sa propre vitesse** et l'inscrit en tête du résumé : à cadence horloge, une machine plus rapide atteint une profondeur plus grande. Un verdict reste valide en interne, les deux moteurs partageant la machine, mais **deux runs ne se comparent pas sans regarder leurs étalonnages** : la vitesse varie de plus de moitié d'un runner à l'autre. Voir `tools/README.md`, « Mesurer à cadence longue » |
| `.github/workflows/force.yml` | **à la demande** : le moteur d'un commit contre **Stockfish bridé** (`UCI_LimitStrength`, `UCI_Elo`), la seule mesure de force ABSOLUE du dépôt. **Son échelle se lit au source de Stockfish 16**, ancrée à l'Elo CCRL et étalonnée à 60+0,6, d'où la cadence par défaut ; Stockfish 16 et `ubuntu-24.04` sont épinglés, et le workflow refuse plutôt que de mesurer sur une autre échelle. Une estimation, jamais un classement ; au-delà de 90 % ou en deçà de 10 % de score, changer de niveau. **Il écrase les écarts**, ses fautes au hasard décidant plus que notre profondeur : **un changement se mesure contre notre jumeau, jamais contre lui.** Son échelle s'arrête à 3 190, d'où `classes.yml`. Les séries mesurées : `tools/README.md`, section C13 |
| `.github/workflows/classes.yml` | **à la demande**, depuis le 9 nov. 2026 : le moteur d'un commit contre un moteur **classé par la CCRL**, non bridé — la suite de `force.yml`. Chaque adversaire est construit au tag que la CCRL a noté, le SHA du tag vérifié ; la cadence est l'**équivalent 40/15 du runner**, fixé comme le fait la CCRL au banc de Stockfish 10, la machine chargée comme pendant le match, et 3 939 338 nœuds exigés. Une partie par cœur physique, table de 256 Mo, un fil. Le résumé rend la note de l'adversaire plus l'écart, la marge composant celle du match et celle de la note. Voir `tools/README.md`, section C13, « La suite » |

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
celle qui est déjà ouverte. `workflow_dispatch` accepte deux entrées :
`simuler_une_alerte`, qui force l'échec pour éprouver l'issue, et
`commit`, qui balaie un SHA au lieu de la tête de la branche — le crible
d'un candidat révoqué — sans jamais ouvrir d'issue, le cliquet gardant
`main`.

**Sa durée** : `search.rs` seul en prend 145 à 180 minutes et plus, pour
une limite de job de 350 ; au-delà, découper par `--shard` (`tools/README.md`,
« Ce qu'il faut surveiller »). C'est un débit de compilation, qui ne dit
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
backlog, demandes humaines en attente —, puis le chantier actif et la mémoire
canonique. Sous Claude Code, le hook `SessionStart` le fait seul ; sous un
autre agent, le lancer d'abord. Rien de ce qui n'y figure pas n'est acquis.
Ce que l'humain a écrit lui-même depuis le dernier commit de l'agent (une
approbation, une réponse dans son terminal), l'état le liste : le lui citer
dans la réponse suivante, par son identifiant et son lien, puisque la
commande lui a donné un numéro qu'il ne retrouve pas dans la conversation.

Si l'état n'a pas été injecté au démarrage d'une session de Claude Code, les
hooks de l'agent ne sont pas chargés : la session a démarré hors de la racine
du projet. Le dire à l'humain avant tout travail, et ne rien pousser ;
`socle state` l'affiche aussi en tête, et le hook avant commit refuse alors
le commit. Ne jamais écrire soi-même un réglage de Claude Code pour rétablir
les hooks.

Une consigne de l'humain donnée dans la conversation, qui vaut au-delà du tour
(une règle, une préférence, une interdiction), s'écrit dans la mémoire avant de
continuer : au chantier actif si elle touche le travail en cours, sinon au
journal, avec son texte exact. Le résumé d'un compactage ne la garde pas
toujours, et une session neuve n'a que la mémoire.

### La mémoire, dans `memory/`

| Couche | Où | Règle |
| --- | --- | --- |
| Canonique | `memory/canonical.md` | faits avec statut et preuve ; ne change qu'avec une preuve nouvelle |
| Actif | `memory/active.md` | chantier en cours, prochaines étapes ; réécrit, borné |
| Décisions | `memory/decisions/` | une ADR par fichier, le seul registre des décisions du projet ; seul son statut change ensuite |
| Journal | `memory/journal/` | une entrée datée par événement ; ajout seul |
| Backlog | `memory/backlog/` | sujets avec statut et origine, ordonnés par `après` (sujets ou demandes), leurs jalons et leur priorité (l'état en calcule les prêts) ; faits quand leur « Fait quand » est coché, clos avec une référence, puis rangés par `socle archive` |
| Demandes | `memory/requests/` | décisions humaines en file, au contrat du skill `socle-request` |

Une entrée : `## F-NNNN — titre`, puis une ligne `> statut : mesuré · preuve : commit:<sha>`.
Statuts d'un fait : `mesuré` (avec `preuve`), `supposé`, `réfuté` (titre barré,
avec `refutation`), `validé` (avec `validation : D-NNNN`, écrit après la
réponse de l'humain). Format complet : `.socle/engine/socle/FORMAT.md`.
Un identifiant se calcule (`python3 .socle/socle new <type> "titre"`), il ne
se devine pas. En cas de conflit, l'ordre d'autorité est : le code et les
tests, puis la mémoire canonique, puis le journal.

**Mémoire privée**, si la politique en choisit une (`[private] mode`) : rien de privé ne se recopie en public, ni un identifiant `P…`, ni son contenu, ni dans un message de commit, une pull request ou un commentaire ; indisponible (l'état le dit), on ne conclut pas sur ce qui en dépend. Où écrire, basculer une entrée, commiter en mode compagnon, faire relire avant publication : le skill `socle-private-memory`.

### Politique d'autonomie (`.socle/policy.toml`, modifiée par l'humain seul)

1. **Assouplir un garde-fou** (`.socle/guardrails.toml`) exige une demande validée ; durcir est libre. Déclarer des fichiers tiers, qu'aucun contrôle ne juge (`[thirdparty] paths`), assouplit.
2. **Supprimer un test ou changer une valeur attendue**, dans un test ou un fichier de cas déclaré, exige une demande validée, ou une spécification que l'humain a lui-même changée et qui nomme le test ; une ADR écrite par l'agent ne suffit pas.
3. **Décision de conception** : réversible et mesurable, l'agent décide et écrit une ADR ; coûteuse à défaire, demande.
4. **Action irréversible ou externe** (force-push, push sur la branche par défaut, publication, suppression distante, dépense) : toujours une demande. Le hook la refuse.
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
skill `socle-request`. Un sujet dont la spécification dépend d'une intention
que la mémoire ne dit pas se cadre d'abord par des questions ouvertes
(`socle new request --questions`) ; une spécification se soumet avant son
code.

### Lire la mémoire à la demande

Le démarrage n'injecte que l'état, le chantier actif et les faits. Le reste
se lit quand il sert, sans attendre qu'on le demande :

- un identifiant cité (`F-`, `B-`, `ADR-`, `D-`, `J-`) se lit avant de
  s'appuyer dessus : `python3 .socle/socle show <ID>`, qui donne aussi son
  empreinte ;
- avant une décision de conception, l'index des décisions de l'état dit si
  elle est déjà prise : on ne la rouvre pas sans fait nouveau ;
- avant d'ouvrir un sujet, le backlog (`socle show --index backlog`) dit
  s'il existe déjà ;
- pour savoir pourquoi une chose est ainsi, chercher dans le journal
  (`grep -rn "<mot>" memory/journal/`).

La lecture se prouve : une décision, une demande ou un sujet de backlog
nouveaux citent ce qu'ils ont lu avec son empreinte (`ADR-NNNN@xxxxxxxx`,
`lu : decisions@…`, `lu : backlog@…`). Une empreinte périmée ou inventée est
refusée ; il faut relire l'entrée. `socle new` pose l'empreinte de l'index.

### Les skills

Une procédure rare se lit dans son skill, que l'agent charge sur sa
description : `socle-request` (poser une demande, relayer une réponse,
consigner une décision en séance), `socle-private-memory` (la mémoire
privée), `socle-review` (la revue adversariale d'un lot, avant sa
livraison) et `socle-resume` (en session cloud, à chaque tour qui agit :
reprendre seul après une limite d'usage), dans `.claude/skills/`, posés par l'installeur et
protégés ; un autre agent lit leur `SKILL.md` à ce chemin.

Une procédure du projet qui se refait (le journal montre la première fois)
s'écrit en skill à la deuxième, dans `.claude/skills/<nom>/SKILL.md` : un
nom sans le préfixe `socle-`, un en-tête `name` (le nom du
dossier) et `description` (ce qu'il fait, et quand s'en servir), et une
entrée au journal qui le dit. Un skill dit comment faire, la mémoire ce qui
est et pourquoi : il n'en recopie rien. Ses commandes, dans des blocs de
code, sont jugées comme le hook les jugerait ; une commande à ne pas lancer
se cite dans le texte.

### Livrer le travail

Tant que rien ne revient à l'humain, l'agent enchaîne les sujets prêts
sans attendre de message. Il annonce d'abord le lot, pas forcément tout ce
qui est prêt (les sujets, leur taille, le jalon qu'ils servent ; un sujet de
priorité basse s'il est commode), puis s'y met ; il s'arrête à la fin du
lot, ou dès qu'une décision revient à l'humain. Il ne change pas une
priorité que l'humain a donnée. Avant le push d'un lot qui change du code,
une spécification ou un test, il le fait relire par un relecteur sans
contexte (le skill `socle-review`), et son récap dit les constats.

Par défaut, tout se fait sur une branche de développement, avec une seule
pull request ouverte à la fois : chaque lot fini s'y ajoute, l'humain la
fusionne quand il veut, et la branche repart alors de la branche par
défaut. Une pull request par sujet, seulement si l'humain l'a choisi (un
fait de la mémoire le dit). Une session neuve qui trouve ouverte la pull
request d'une autre demande à l'humain de la fusionner d'abord, ou de
l'autoriser à y continuer. Un prototype qu'on ne compte pas fusionner se
fait sur une branche jetable, nommée d'un préfixe de `[branches] disposable`
des garde-fous (`proto/` par défaut) : la CI ne la juge pas aux envois.

### Avant de conclure

- `python3 .socle/socle verify --fast` passe (le hook `Stop` le vérifie) ; `verify` exécute tout.
- Si du code a changé, la mémoire aussi : chantier actif, journal, backlog.
- Si du code associé à une doc a changé (`[[docmap]]` des garde-fous), la doc change dans le même travail, ou le commit qui change ce code porte le trailer `Dispense-doc: <raison>`, qui ne vaut que pour lui.
- Un correctif (sujet `fix:` ou trailer `Corrige: B-NNNN`) livre un test qui échoue sur le commit parent.
- Une fonction publique ajoutée ou modifiée est nommée par au moins un test, ou un commit la dispense nommément avec sa raison (`Dispense-test: f, g — <raison>`). Du code existant découvert sans test : le test s'écrit tout de suite s'il est dans le périmètre du travail, sinon un sujet va au backlog.
- Une action que seul l'humain peut faire (refusée par le hook, réglage d'un service, fichier qu'il détient) va au backlog avec `pour : humain`.
- **Toute intervention qui a agi se termine par un récap, puis deux lignes** : `Pour toi :` — ce qui revient à l'humain, décisions en attente et actions à faire, ou « rien » —, chaque point compréhensible sans le raisonnement de l'agent (ce que c'est, pourquoi, ce que change sa réponse), et `Ensuite :` — la suite proposée (prochain jalon, ce qu'il reste à faire avant), et ce que l'agent attend s'il attend quelque chose (une CI, un match : quoi, et jusqu'à quand). L'état calcule ce qui revient à l'humain ; le hook `Stop` refuse de conclure sans les deux lignes.
- **Un fichier à lire, ou une pull request, se donne par son lien** : l'humain lit dans la conversation ou sur GitHub, pas dans le conteneur de l'agent. `python3 .socle/socle url <chemin|ID>` donne le permalien, une fois le fichier poussé ; une demande en attente citée sans son lien, un lien relatif, ou un chemin entre accents graves qui n'existe pas dans le dépôt font refuser la fin du tour. Un chemin d'un autre dépôt s'écrit `depot:chemin`, le dépôt lié quelque part dans le projet par son adresse (à défaut, déclaré dans `[references] repos` des garde-fous) ; un dépôt inconnu est signalé.

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
| `.socle/git-hooks/` | hooks git : `pre-commit` (contrôles rapides), `prepare-commit-msg` (trailers `Socle-Hooks`, `Socle-Hooks-Since-Commit`), `commit-msg` (fuites de la mémoire privée ; une fonction sans test ni dispense, un correctif sans test, un commit d'agent sans hook de l'agent, en avertissement), `pre-push` (`verify --fast` sur le dernier commit, la plage qui part jugée comme la CI la jugera, relecture avant publication) |
| `.github/workflows/socle.yml` | CI : capacités de l'adaptateur, tous les contrôles contre la base, auto-test du socle |
| `.git/socle/hooks.log` | trace locale de chaque hook qui tire, non versionnée, commune à tous les worktrees du dépôt |

Liste des contrôles : `python3 .socle/socle checks`.

<!-- socle:fin -->
