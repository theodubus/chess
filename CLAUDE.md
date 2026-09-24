# ShallowRed — moteur d'échecs + UI

Monorepo. Le moteur est un binaire UCI en Rust ; l'interface est un projet
TypeScript qui pilote n'importe quel moteur UCI, y compris celui-ci.

## Structure

- `engine/` — Rust, binaire UCI. Ne connaît ni l'interface, ni la notion de partie.
- `ui/` — TypeScript. **Chantier parallèle, avec son propre `ui/CLAUDE.md`
  qui fait autorité sous `ui/`.** Rien de ce fichier-ci ne s'y applique :
  une interface n'a pas de force de jeu, donc ni SPRT, ni perft, ni bench.
  **Un autre agent, Codex, y travaille en parallèle** sur ses propres branches
  (`codex/…`) et leurs PR : c'est normal, et ça ne touche qu'à `ui/` (Théo,
  24 sept. 2026). Ne pas les prendre pour des anomalies, ni les fusionner
  ou les nettoyer.
- `tools/` — arbitres de match, livre d'ouvertures, SPRT. Voir `tools/README.md`.

## Par où commencer, sans contexte

Ce fichier dit **comment** travailler : invariants, ce qui compte comme preuve,
pièges déjà payés. Il ne dit pas **où on en est**.

- **L'état du travail en cours est imprimé automatiquement au démarrage et
  après chaque compactage** par `tools/etat.sh` — branche, commits non
  fusionnés, écart code/documentation, et où lire la suite. Il est calculé,
  jamais recopié. S'il n'apparaît pas, le lancer à la main.
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
- **Génération par étapes** — **pas en place, et mesurée le 22 sept. 2026 :
  plafond 11,5 % du temps, soit 0,21 pli.** `negamax` génère 26,42 coups par
  nœud et en cherche 3,97 — 85 % du travail est jeté, et 49 % des nœuds ne
  cherchent aucun coup tranquille. Mais l'ordonnancement ne pèse que **26,2 %
  du temps** (mesuré par doublement, 0/24 paires, p = 0,0000), et c'est
  `negamax` qui en porte 83,8 %, pas la quiescence. **Ce n'est pas non plus
  une optimisation pure** : le tri est `sort_unstable_by_key`, et passer au
  tri stable déplace déjà l'arbre de 4,1 % — donc un SPRT, pas `timing.sh`,
  pour un effet six fois plus petit que la pendule. Chiffres dans
  `tools/README.md`, code à l'attic. `ordered_moves` remplit d'un
  bloc une tranche de l'ardoise (`buffer: &mut [(Move, i32)]`, une par ply,
  allouée une seule fois avec la recherche) puis la trie entièrement ; seul le
  **filtre tactique** de la quiescence existe (`tactical_only`, qui restreint
  les destinations par un `AND` de bitboards). La génération par étapes
  proprement dite — produire les captures, s'arrêter sur coupure bêta, ne
  générer les coups tranquilles que si nécessaire — <s>reste entièrement à
  faire</s> **est écrite depuis le 24 sept. 2026 (A18, le `MovePicker`)** et
  **FUSIONNÉE le même jour : +23,10 ± 6,39 Elo à `8+0,08`**, 5 740 parties,
  gain démontré. Hors partie, 10 à 14 % plus rapide par nœud, l'arbre
  inchangé ; en partie, n/s × 1,09 et +0,17 ± 0,07 pli. Protocole, critère et
  verdict dans `tools/README.md`, section A18.
- **Coup compacté sur 16 bits pour le stockage** — en place, `tt::pack_move`.
  La valeur zéro code `a1a1`, jamais légal, et sert de marqueur d'absence.
- **Table de transposition partagée, le jour où la recherche devient
  parallèle.** **Le jour est venu le 24 sept. 2026** : Lazy SMP (B6) la
  partage entre fils par un `Arc`, et l'option `Threads` vaut 1 par défaut. **En place depuis le 23 sept. 2026 (B9)** : entrées atomiques,
  `store` prend `&self`, la table se partage entre fils. <s>Pas en place, et
  c'est le seul endroit du dépôt où le design actuel bloque une
  fonctionnalité déjà prévue : `store` prend `&mut self`, ce qui est
  inexprimable quand plusieurs threads écrivent dans la même table.</s>
  Historique, gardé pour ses raisons :
  Le passage à des entrées atomiques (XOR clé/données, qui rend détectable une
  entrée déchirée sans verrou) est une réécriture contenue de `tt.rs` plus un
  changement de signature qui traverse `search.rs`.
  <br>**Écrit et mesuré le 23 sept. 2026, fusionné le même jour** — capacité
  −1,27 ± 6,34 Elo à `8+0,08`, pas d'effet décelable. Trois
  résultats. **La réécriture est neutre, prouvée** : à capacité forcée égale,
  le banc rend 114 028 et 635 210, exactement la référence, avec des empreintes
  différentes. **Les accès atomiques ne coûtent rien, ils RAPPORTENT** :
  −4,3 % de temps à la profondeur 10, 15 paires sur 20, p = 0,0192 — la fiche
  disait le coût « plat », ce qui parlait du *rétrofit*, et personne n'avait
  vérifié la vitesse monothread ; elle monte. **Le confondant est levé, troisième coin
  mesuré** : l'empaquetage seul vaut **−4,0 %** (33/44, p = 0,0013), les
  **atomiques seules −0,2 %** (8/20, p = 0,65). *Le gain est entièrement
  l'empaquetage ; les accès atomiques ne coûtent rien*, et les deux viennent
  donc ensemble sans surcoût. Cohérence interne : −4,0 puis −0,2 composent
  −4,2 contre −4,3 mesuré. Enfin
  **l'effet de CAPACITÉ est un autre changement** : l'entrée passant de 24 à
  16 octets, la table double à mémoire constante, et cela demande un SPRT.
  Chiffres dans `tools/README.md`.

## Ce qui compte comme preuve

| Affirmation | Preuve exigée |
|---|---|
| « la génération de coups est correcte » | `cargo test --release -- --ignored` passe les six positions de `engine/tests/perft.rs`. Rien d'autre. |
| « ce changement de recherche est bon » | `tools/sprt.sh <candidat> <référence>` rend `H1 was accepted`. Une impression n'est pas une mesure. La CI, elle, exige en permanence vingt-quatre victoires sur vingt-quatre contre le hasard — c'est un garde-fou, pas une mesure de force. |
| « cette valeur d'évaluation est meilleure » | **Le SPRT, et rien d'autre — surtout pas une erreur de prédiction.** Mesuré le 14 sept. 2026 : un ajustement Texel des valeurs prédisait le résultat des parties **7,8 % mieux** sur 66 376 positions tenues à l'écart, et jouait **25 Elo plus mal** (−9,96 contre +14,92, deux SPRT). Le jeu de validation partage les corrélations du corpus, donc il ne peut pas distinguer une corrélation d'une cause — et le moteur, lui, *agit* sur son évaluation. **Une erreur de prédiction tenue à l'écart n'est pas un substitut à la force de jeu.** Les valeurs de `eval.rs` restent conventionnelles ; ne pas rouvrir le réglage sans corpus nettement plus grand ni contrainte de structure. |
| « il manque un terme à l'évaluation » | Un SPRT. **Mesuré : la mobilité vaut +62,6 Elo ± 17,2** ; sécurité du roi, structure de pions et tour sur colonne ouverte valent ensemble **+37,5 Elo ± 13,4 à `8+0,08`** — leur retrait a été rejeté le 22 sept. 2026 sur 1580 parties. Le +14,9 ± 8,2 d'origine était mesuré à `1+0,01` **et sur une base bien plus pauvre** : les deux causes sont confondues, mais le chiffre à retenir est le grand, parce que c'est celui de la cadence cible. Pour la recherche, un SPRT par changement reste absolu. Pour l'évaluation, les termes se groupent — individuellement ils valent quelques Elo et ne tranchent pas — mais la règle complète est **« grouper, puis bissecter à l'échec »** : c'est un match de bissection qui a séparé les termes du réglage et montré lequel des deux coûtait. |
| « ce code est testé » | `tools/mutants.sh`. Un mutant **survivant** est une modification du code que toute la suite accepte : une ligne dont rien ne vérifie le comportement. Le plafond par fichier vit dans `.github/mutation-baseline.txt`, et le balayage hebdomadaire (workflow `Mutation`, mardi) casse à la hausse, signale la baisse. **Ne dit rien de la force de jeu** : un survivant sur une valeur d'évaluation ou une marge d'élagage relève du SPRT, jamais d'un test unitaire. |
| « l'arbitre de mesure est fiable » | `tools/crosscheck.sh` : deux arbitres indépendants jouent le même match et s'accordent. À relancer après toute modification de la couche UCI. |
| « ce verdict vaut pour le moteur qu'on livrera » | **La cadence de mesure peut INVERSER un verdict — mesuré, pas redouté.** 16 sept. 2026, mêmes binaires, même livre, **même graine d'ouvertures**, même adjudication, même estimateur (1000 parties à longueur fixe chacun) : l'élagage par compte de coups vaut **−21,57 ± 16,71** à `1+0,01` et **+15,30 ± 15,08** à `8+0,08`. Écart **+36,9 Elo**, z = 3,21, **p = 0,0013**, intervalles disjoints. Le biais d'arrêt du SPRT ne vaut que 3,6 Elo : ce n'était pas l'explication. Profondeur médiane atteinte : **8,5** contre **12,5** — et **17,0** à ~30+0,3, le régime où le moteur jouera. **Les douze premiers verdicts du projet sont tous à `1+0,01`**, alors que `tools/sprt.sh` a pour défaut `8+0.08` depuis sa création — défaut jamais utilisé. Ce n'était pas un arbitrage, c'était une habitude. **Nommer la cadence d'un verdict, et ne jamais comparer deux verdicts de cadences différentes.** Mesurer long passe par `.github/workflows/match.yml`. |
| « ce chantier passe avant cet autre » | **Une unité commune, et les plis en sont une.** Le projet a comparé ses chantiers en pourcentage de nœuds, en part de l'arbre, et en « très sous-estimé » hérité d'un backlog — trois unités qui ne se comparent pas. **Mesuré le 22 sept. 2026 : 1,36 pli par doublement de temps**, stable sur quatre doublements, ce qui ramène tout gain de vitesse OU de temps à la même échelle. Génération par étapes 0,21 pli, **dépenser la pendule 0,54 à 0,70**, Lazy SMP 1,0 à 1,8 — <s>hérité</s> **mesuré le 24 sept. : +0,48 ± 0,08 pli à deux fils**, en partie sur runner, et **+42,16 ± 9,23 Elo** contre notre jumeau monofil ; le chiffre hérité supposait quatre vrais cœurs. <s>Pendule pleine ~1,36.</s> **Faux d'un facteur 2,5, corrigé le 22 sept. au soir** — et la faute mérite d'être nommée parce qu'elle est conceptuelle : *j'ai confondu la RESSOURCE TOTALE consommée sur une partie avec l'ALLOCATION PAR COUP*. Le budget vaut `restant / movestogo` — proportionnel à ce qui reste — donc dépenser plus tôt laisse moins ensuite : la consommation totale monte bien de × 1,9, mais le budget moyen par coup ne monte que de **× 1,32**, et il **sature** (le diviseur 12 alloue 285 ms, le 10 en alloue 283). La saturation n'est pas un hasard : le plafond d'une allocation *plate* vaut `(pendule + coups × inc) / coups` = **280 ms**. Un diviseur est une famille à un paramètre qui bute sur la physique du problème ; faire mieux demande une allocation **inégale**, ce qui est un autre chantier. **Ce que ça ne donne pas : l'Elo — sinon par un intervalle.** <s>Combien vaut un pli n'est mesuré nulle part ici</s> — **deux points depuis le 23 sept. 2026**, plis mesurés **en partie** par une sonde appariée par partie, à `8+0,08` contre notre jumeau : C21 **21 à 119 Elo par pli**, ponder **51 à 104**, B6 **59 à 128** (24 sept.), A18 **70 à 295** (24 sept.) — intervalles de Student, que 1,96 rendait trop étroits. Compatibles, et larges. **Et un étalon depuis le 24 sept.** : un doublement de temps, même binaire, vaut **+107,7 ± 8,2 Elo** et **+1,38 ± 0,28 pli**, mesurés tous deux sur runner dans le même régime — **60 à 105 Elo par pli** à `8+0,08`. L'incertitude vient presque toute des plis : la resserrer demande une sonde plus longue, pas un match de plus. L'attendu du ponder, converti par le seul point de C21 et ses plis *estimés par le budget* (0,54 à 0,70 ; 0,41 mesurés), disait ~+25 ; mesuré **+67,6**. **Une conversion par un point unique porte l'incertitude des DEUX mesures qui la composent : écrire l'intervalle, jamais le point.** Et le multiplier par une constante héritée reste ce que ce dépôt a démenti trois fois. Chiffres dans `tools/README.md`, section ponder. |
| « ce changement vaut la peine d'être mesuré » | Budget estimé du verdict. **Dix-huit SPRT du projet — la relation tient, sa DISPERSION est connue, et elle ne dépend PAS de la cadence** : `parties × Elo`, médiane **59 256**, étendue 45 900 à 80 200, **facteur 1,75**. Quatre techniques ont un point à chaque cadence ; l'Elo y change d'un facteur 2,5 et même de signe, le produit tient à ± 15 %. **Mais l'Elo qu'on MET dans la division appartient, lui, à une cadence** : le projet a écrit que les trois termes d'évaluation « tombaient juste sous la ligne » (59 500 ÷ 14,9 = 3 993 parties, au-delà du plafond de 3 750) ; le verdict est tombé en **1 580**, l'effet valant +37,5 et non +14,9. **Un budget estimé depuis un verdict à `1+0,01` est un majorant — ne jamais renoncer à un match sur cette base.** Un seul point dépasse 67 000 — le tout premier, +164 Elo sur 488 parties ; <span>inférence, confiance moyenne : le biais d'arrêt du SPRT gonfle d'autant plus l'estimation que l'effectif est petit</span>. Hors ce point, le facteur tombe à **1,45**. La constante n'a presque pas bougé (62 000 avait été établie sur quatre points), **mais un budget estimé se lit désormais à ± 50 %, pas comme un nombre** : +30 Elo ≈ 2000 parties ≈ 25 min ; +5 ≈ 11 900 ≈ 2 h 30 ; +2 ≈ 29 750 ≈ 6 h. Le temps machine est la ressource rare — 4 cœurs, concurrence 3, plafond atteint. Préférer ce qui achète de l'Elo contre du code plutôt que contre du temps de match. **À `8+0,08` par `match.yml`, un job tranche les effets de ~20 Elo et plus** : ~7,25 s par partie depuis que les deux moteurs dépensent leur pendule (mesuré le 23 sept. 2026 ; 5,57 s avant C21), plafond de 350 min, soit ~2 880 parties — 3 000 ne tiennent plus. En dessous, passer à des matchs à longueur fixe sur plusieurs jobs et les mettre en commun par `tools/mettre-en-commun.sh` — **jamais un SPRT, et la raison est plus large que « ne pas reprendre un SPRT expiré »** : un test séquentiel tire ses taux d'erreur d'une règle d'arrêt unique sur un flux unique. Lancer N SPRT et s'arrêter dès que l'un franchit sa borne multiplie le risque de première espèce par ~N ; recoller leurs parties après coup ne rend pas un test séquentiel mais un échantillon dont la taille a été choisie après avoir vu les données, ce qui est pire. **Un match à longueur fixe, lui, se parallélise sans rien casser** : effectif connu d'avance, estimation non biaisée, et la somme des comptes pentanomiaux est exacte là où moyenner des Elo ne l'est pas. Voir `tools/README.md`. |
| « ce correctif de règle ne dégrade pas le jeu » | **Trois choses, et pas un gain.** Des tests qui **échouent sur l'ancien code** et passent sur le nouveau, chacun avec un témoin ; le mécanisme **mesuré en régime réel** ; puis un match dont le critère est **écrit avant de lancer** : fusion sauf si la borne haute de l'intervalle est sous zéro. Exiger qu'un correctif de règle *prouve un gain* reviendrait à ne jamais corriger une règle — son effet tombe presque toujours sous le seuil de résolution. Ne rien mesurer reviendrait à fusionner un changement d'arbre sur une impression. **Dire la puissance d'avance** : à 6 000 parties, une régression de 1 ou 2 Elo passe inaperçue, et c'est accepté *parce que c'est écrit*. Premier cas : C22, 23 sept. 2026 — **arrêté par son critère** (−10,44 ± 6,34), et la cause trouvée pendant le vol : le test qu'il étendait à l'horizon était lui-même faux à 92 % (C23). **Remesuré sur C23, fusionné le 24 sept.** — et ses deux jobs se contredisaient (+10,86 et −2,90, z = 2,15), sans que la décision en dépende : **un critère écrit en bornes se lit sur chaque match comme sur l'ensemble**, et aucune lecture ne mettait la borne haute sous zéro. |
| « c'est plus rapide » | `cargo run --release --bin shallowred -- bench`, même machine, avant et après. Comparer d'abord le **nombre de nœuds**, qui est déterministe ; les nœuds par seconde varient d'un run à l'autre. |
| « c'est plus fort » | **Jamais** déduit d'un nombre de nœuds, dans aucun sens. Huit mesures, et les trois combinaisons de signes sont représentées : table + killers + historique ÷5,8 → +164 Elo ; coup nul ÷2,5 → +75 ; LMR ÷5,7 → +69 ; fenêtres d'aspiration ÷1,07 → +30 ; élagage delta ÷1,68 → +33 ; futilité inverse ÷1,45 → +24 (moins de nœuds, plus fort) ; **PVS ÷1,03 → −11, H0 accepté** (moins de nœuds, plus faible) ; **mobilité ×1,29 → +63** (*plus* de nœuds, plus fort). Un rapport de nœuds mesure le travail à une profondeur donnée, jamais la force. Seul le SPRT tranche. **Deux rapports voisins, ÷1,68 et ÷2,52, rapportent +33 et +75 : même le classement ne se déduit pas.** Deux points de plus le 21 sept. 2026, tous deux nuls : extension d'échec ×1,16 → **−5,0 ± 8,1**, PVS réécrit ÷1,07 → **−0,8 ± 8,2**, à `8+0,08`. Et un point du 22 sept. qui tombe pile sur un point existant : **les trois termes d'évaluation ×1,29 → +37,5**, exactement le rapport de nœuds de la mobilité, qui vaut **+62,6**. *Même coût en nœuds, presque du simple au double en Elo.* |
| « cette technique est standard, donc elle aide » | **Rien.** Ce n'est pas une preuve, et le dépôt en porte maintenant **trois** démentis. PVS est dans tous les manuels et la mesure l'a rejeté **deux fois, à deux cadences** : −10,9 ± 7,9 à `1+0,01` (4214 parties, septembre) puis **−0,8 ± 8,2 à `8+0,08`** (3400 parties, 21 sept., sur la base post-C19 et post-LMP). Le second chiffre corrige le premier plus qu'il ne le confirme : **PVS n'est pas un coût, c'est un néant.** Empilé sur LMR, coup nul et fenêtres d'aspiration, il n'apporte plus rien à couper, et son coût de re-recherche compense exactement son économie de nœuds. La coupure du manuel dans l'échange statique rend une valeur fausse — 27 écarts sur 771, l'oracle l'a vue au premier passage. Et reléguer les captures perdantes **derrière les coups tranquilles**, comme le font les moteurs modernes, coûte **+31,6 % de nœuds** ici, contre −4,2 % pour le palier le plus doux. Une technique standard entre par le SPRT comme toutes les autres. |
| « cette rustine de l'attic s'applique encore » | **`git apply --check`, jamais la table.** Trois des sept lignes de `tools/attic/README.md` étaient fausses le 22 sept. 2026, toutes par la même fusion, et rien ne pouvait le signaler : personne n'avait rien fait de mal, la table avait vieilli pendant qu'une PR avançait. Le contrôle est `engine/tests/rustines_attic.rs`, et il garde **la copie que les humains lisent** — déplacer la déclaration dans un fichier annexe aurait laissé la table dériver, ce qui est la faute de B10. **Une rustine qui cesse de s'appliquer parce que son code est ENTRÉ dans `main` n'est pas une régression** : c'est un rejet levé, et ça se raconte dans la colonne. |
| « ce réglage était mauvais, pas la technique » | **Une bissection par le paramètre, pas une intuition** — et la bissection appartient elle aussi à sa cadence. L'élagage par compte de coups a été bissecté à `1+0,01` : seuil `6 + d²` → **−25,2 Elo**, seuil `12 + d²` → **−12,6**, le coût suivant le **risque mesuré** (3,8 % puis 2,0 % des montées d'`alpha` détruites, × 0,53 pour × 0,50, droite par l'origine). J'en avais conclu « il n'y a pas de seuil qui paie sur ce moteur ». **Réfuté le 21 sept. 2026** : à `8+0,08`, sur la base post-C19, les deux seuils sont **H1** — +22,85 ± 9,88 et +17,24 ± 8,51. La bissection était juste, la généralisation ne l'était pas. **Deux points ferment une question que zéro point laisserait ouverte — mais ils ne la ferment qu'à leur cadence.** |
| « j'ai mesuré le mécanisme, donc je sais » | **Vérifier le dénominateur.** Avant d'écrire LMP j'ai mesuré la part des *coups tranquilles* élagués : 58 % au seuil 6, 40 % au seuil 12, compromis monotone sans genou — d'où « seul un SPRT peut choisir ». En **nœuds**, qui sont ce qui achète de la profondeur, le seuil 12 garde **96 %** de l'économie du seuil 6 : le genou est net. Un chiffre vrai qui répond à une autre question. **Et le dénominateur peut être un ENSEMBLE, pas seulement une grandeur** — 23 sept. 2026 : l'écart entre les deux pendules rend « +60 ms en notre faveur » moyenné sur tous les coups, et **−6 ms** moyenné sur les seuls coups où les deux camps en ont joué autant. Le reste est un artefact de comptage de coups. |

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
- **Un garde-fou qui ne couvre qu'une copie d'un chiffre dupliqué ne garde
  rien.** La première version de `engine/tests/bench_reference.rs` ne lisait
  que `CLAUDE.md`. Elle a été écrite alors que `README.md` portait déjà
  `8 432 521` — le chiffre d'avant le coup nul, **faux d'un facteur 15,6** — et
  ne l'a pas vu, parce que personne n'avait cherché si le chiffre existait
  ailleurs. La deuxième balayait une **liste écrite à la main**, ce qui laissait
  encore mon jugement décider de la couverture ; celle d'aujourd'hui parcourt
  **tout le dépôt**, donc un fichier Markdown créé demain est couvert sans que
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
- **Une sonde qui prend pour oracle le code qu'elle mesure en hérite les
  fautes.** C22 a été motivé par « 40 % des nulles manquées à l'horizon »,
  compté avec `is_repetition` — et 88 à 92 % de ce que `is_repetition`
  détectait était faux, par deux coups nuls consécutifs (C23). Le symptôme
  était vrai, la grandeur non ; le correctif, qui étendait ce test à
  l'horizon, a régressé de **−10,44 ± 6,34**, et c'est le critère écrit
  d'avance qui l'a arrêté, pas la sonde. *Avant de compter un phénomène avec
  le code qui le détecte, vérifier ce code sur les cas qu'il détecte* — la
  même idée que deux arbitres indépendants, appliquée à une sonde.
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
  commun.** Mêmes binaires plus même graine donnent **les mêmes parties, coup
  pour coup** — c'est la même propriété, d'un cran plus haut. Rejouer un match
  expiré avec sa graine d'origine n'apporte donc *rien*, et donner la même
  graine à deux jobs qu'on additionne produit deux copies l'une de l'autre :
  l'effectif double sur le papier et l'information ne bouge pas. *Vérifier que
  les graines diffèrent avant de lancer, jamais après avoir additionné.*
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
tools/ref.sh <commit|branche|tag> [sortie] # construit un binaire de référence
tools/sprt.sh <candidat> <référence>       # verdict sur un changement de décision
tools/timing.sh <candidat> <référence>     # verdict sur une optimisation pure
tools/plis.sh <journal cutechess -debug>   # plis gagnés EN PARTIE, appariés par partie
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
| `.claude/settings.json` | déclare les hooks ci-dessous |
| `tools/etat.sh` | lancé par le hook `SessionStart`, dont la sortie **entre dans le contexte**. `SessionStart` se déclenche au démarrage, à la reprise, après `/clear` **et après chaque compactage** — le seul point d'accroche qui tombe au moment où la mémoire vient d'être perdue. Tout ce qu'il imprime est **dérivé de git**, donc rien ne peut y vieillir. Il porte aussi le signal de documentation : « N fichiers `.rs` et zéro `.md` depuis `main` » est un fait, là où « il faudrait documenter » est une consigne qu'on oublie |
| `.claude/hooks/verify-on-stop.sh` | refuse de finir un tour si `verify.sh --rapide` échoue et que des `.rs` ont changé. Passe après trois échecs d'affilée, avec un avertissement : un blocage qu'on ne sait pas lever vaut moins qu'un avertissement qu'on lit |
| `.claude/hooks/no-fabricated-sha.sh` | refuse un SHA de 40 caractères qui n'est pas un objet du dépôt alors que son préfixe de 7 en est un — la signature d'un SHA complété de tête |
| `tools/mettre-en-commun-test.sh` | éprouve `tools/mettre-en-commun.sh`, dans `verify.sh`. Son premier cas est une **vérité terrain** — la formule pentanomiale doit retomber sur ce que fastchess a imprimé, et elle y retombe à 0,003 Elo près. Sa branche précieuse est le **refus** de réunir des matchs qui se contredisent, qui ne sert qu'en cas de problème |
| `tools/ref-test.sh` | éprouve `tools/ref.sh` sur des dépôts fabriqués, dans `verify.sh`, en une demi-seconde et sans compiler. La branche qui compte dans `ref.sh` est son **refus** de construire sur une référence git périmée — elle ne s'exécute qu'en cas de catastrophe, donc sans ce test elle ne serait jamais vérifiée. Même argument que le verdict de mutation |
| `tools/verify-hooks.sh` | vérifie que les scripts de hook font ce qu'ils annoncent, et aussi, par `.claude/hooks-fired.log`, que les hooks sont **réellement chargés**. Un script correct mais non chargé ne protège de rien |
| `.github/workflows/ci.yml` | à chaque push : fmt, clippy, tests debug et release, les critères d'acceptation, le bench. <s>les trois critères</s> — leur nombre n'est plus écrit : il a changé, et un compteur en prose naît périmé |
| `engine/tests/rustines_attic.rs` | critère d'acceptation : confronte la colonne « s'applique sur `main` ? » de `tools/attic/README.md` au vrai `git apply --check`, **dans les deux sens** — rustine non déclarée et déclaration sans rustine échouent autant qu'un verdict faux. Trois lignes sur sept étaient fausses le 22 sept. 2026, toutes par la même fusion. `#[ignore]` parce qu'il lance `git` : `cargo mutants` travaille sur une copie de l'arbre, et **aucun mutant d'`engine/src/` ne peut changer si une rustine s'applique**, donc il n'a rien à y tuer |
| `engine/tests/pieges_fermes.rs` | confronte `tools/pieges-fermes.md` au dépôt : **chaque piège archivé doit nommer un dispositif qui existe**, et l'archive doit rester nommée dans `CLAUDE.md`. Sans lui, supprimer `ref.sh` laisserait son piège archivé comme « tenu » alors que plus rien ne le tient — il serait **moins** protégé qu'avant d'être archivé. Même faute que la table de l'attic. Éprouvé en le faisant échouer, et il a attrapé deux imprécisions de ma prose à sa première exécution |
| `engine/tests/outillage_documente.rs` | exige que chaque dispositif soit **nommé avec son extension** dans une doc — scripts de `tools/`, workflows, hooks, et depuis le 22 sept. 2026 les **binaires de `tools/src/bin/`**, qui étaient son angle mort. Énumération par répertoire et par extension, jamais nom par nom |
| `.github/workflows/mutation.yml` | mardi 00:00 UTC : balayage par mutation, un job par fichier, puis le job `Verdict` |
| `tools/balayage-vivant.sh` | étape du job `Moteur`, à chaque push : échoue si le workflow `Mutation` est endormi ou n'a pas tourné depuis quinze jours. **Le cliquet ne peut pas signaler sa propre absence**, et GitHub endort les workflows planifiés d'un dépôt public après soixante jours sans activité. Remplace une routine hors dépôt qui, le seul mardi où le cliquet a cassé, était passée **avant** le balayage — cron lancé avec 3 h 48 de retard. Éprouvé par `tools/balayage-vivant-test.sh`, dans `verify.sh` et juste avant lui dans la CI : deux défauts injectés, deux attrapés |
| `.github/workflows/match.yml` | **à la demande** (`workflow_dispatch`), pas automatique : fait jouer un match entre deux commits sur un runner GitHub. C'est le seul moyen de mesurer **à cadence longue** — le conteneur de session est éphémère et un match de plusieurs heures n'y survit pas. Le job **étalonne sa propre vitesse** et l'inscrit en tête du résumé — à cadence horloge, une machine plus rapide atteint une profondeur plus grande, donc un autre point de fonctionnement. **Remesuré le 21 sept. 2026 : 58 % d'écart entre deux runners sur le même binaire** (2 067 101 contre 3 268 241 n/s, profondeurs 11 et 12), contre les 25 % relevés le 16. Un verdict reste valide en interne — les deux moteurs partagent la machine — mais deux runs ne se comparent pas sans regarder leurs étalonnages. Voir `tools/README.md` |

**Le cliquet de mutation.** `.github/mutation-baseline.txt` porte le nombre de
survivants admis par fichier **et la raison écrite de chaque valeur non
nulle**. `.github/mutation-verdict.sh` le confronte au balayage : il **casse à
la hausse et signale la baisse**. L'asymétrie est assumée — un mutant qui
expire sur un runner chargé est compté « expiré » plutôt que « survivant »,
donc une baisse peut n'être qu'un artefact de charge, une hausse jamais.
Baisser un plafond ne demande rien ; **le relever demande une raison écrite**.

**Le plafond et la matrice sont DEUX listes écrites à la main**, dans deux
fichiers différents, et un fichier absent des deux n'apparaît nulle part : le
balayage ne le produit pas, le verdict ne le réclame pas, et le journal
hebdomadaire est vert. C'est arrivé à `see.rs`, hors du cliquet pendant cinq
jours. `engine/tests/couverture_mutation.rs` parcourt désormais `engine/src/`
et exige chaque fichier dans les deux listes — un fichier sans une seule `fn`
étant exempt, parce que `cargo mutants` n'y produit aucun mutant. **Le plafond
d'un fichier neuf se mesure depuis un arbre vert** : `cargo mutants` refuse de
balayer un arbre dont les tests échouent, et ce test-là est rouge tant que le
plafond manque — donc `workflow_dispatch`, ou un `git worktree add --detach`
sur le commit d'avant.

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
de la vitesse de RECHERCHE : celle-ci varie de **58 %** d'un runner à l'autre
— remesuré le 21 sept. 2026 sur le même binaire, 2 067 101 contre 3 268 241
n/s — et le runner est plus rapide que le conteneur, pas plus lent.
**Un nombre de nœuds par seconde appartient à son BINAIRE autant qu'à sa
machine** : le conteneur est passé de ~2,34 M à ~1,60 M entre le 16 et le
21 sept. sans changer de machine, C19 et C17 ayant rendu chaque nœud plus
cher. Une ligne d'étalonnage ne compare donc que des runs du même binaire ;
la profondeur atteinte en 250 ms, elle, reste lisible d'une version à l'autre. Confondre les deux
m'a fait écrire une réserve fausse dans `match.yml` ; la corriger d'après un
seul runner m'en a fait écrire une seconde. Chiffres dans `tools/README.md`.

**Que faire quand le verdict est rouge.** Le critère de tri est un arbitrage
utilisateur du 15 sept. 2026 : **corriger au fil ce qui touche aux règles du
jeu et aux invariants de recherche ; noter le reste.** « Noter » veut dire
l'inscrire dans le plafond avec sa raison, pas dans une liste de tâches — un
rapport de mutation vieillit vite, ses numéros de ligne dérivent au premier
commit.

Référence à la profondeur 7 : 109 047 nœuds.

Ce chiffre est **vérifié par la CI**, ici et dans `README.md` — voir
`engine/tests/bench_reference.rs`. Le laisser périmé casse le build autant que
le changer à tort : c'est voulu. Quand il vire au rouge sur un changement de
recherche délibéré, **corriger la documentation, jamais supprimer le test** ;
le message d'échec nomme le fichier et donne le chiffre à recopier.
