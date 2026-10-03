# Analyse pédagogique — backlog active et plan de reprise

Plan révisé le 2 octobre 2026 après les retours de Théo, suivi au 3 octobre.
Périmètre : `ui/**`.
**Chantier ouvert. L’objectif pédagogique n’est pas atteint.** Le moteur Rust
reste inchangé ; l’UCI est l’unique interface moteur.

## Ce qui est réellement disponible

- Une UI de revue, exploration, retry et démonstrations utilisable et testée.
- Une première couche d’explications (`explanations.ts`, `tactics.ts`,
  `decisionCause.ts`) à portée limitée, parfois trompeuse malgré ses vérifications.
- Des recherches annulables et mises en cache (`FocusedAnalysis`, `LiveStudy`).
- Des tests logiciels et un parcours navigateur. Ils ne constituent **pas** une
  mesure de pertinence pédagogique. Les anciens lots « terminés » restent dans
  `BACKLOG_ANALYSE_PEDAGOGIQUE_HISTORIQUE.md` comme historique de livraison.

Ne pas ajouter de nouvelles familles de phrases dans `decisionCause.ts` pour
répondre à chaque capture utilisateur. Construire le prototype suivant séparément,
sous `src/review/understanding/`, sans le connecter à l’UI tant que son contrat
n’est pas validé. Un cas reconnu n’est pas une preuve de couverture générale.

## Objectif mesurable

L’explication doit permettre de comprendre **ce que la décision change**, **comment
ce changement est exploitable**, et **ce qu’aurait permis une autre décision**.
Le texte et les repères doivent être issus des mêmes faits vérifiés.

Distinguer explicitement :

1. faits légaux observés sur le plateau ;
2. hypothèse de cause construite avec ces faits ;
3. hypothèse soutenue ou contredite par les recherches moteur ;
4. qualité de la décision par rapport aux autres coups ;
5. bilan d’un événement, par exemple l’échange complet.

Une reprise peut être le meilleur coup disponible dans un échange perdant.
Une pièce attaquée et sans retraite immédiate peut encore être sauvée par un
coup intermédiaire, une défense, un échange ou une compensation : sa perte ne se
prouve pas en comptant ses cases de sortie. Un meilleur score après une suite
ne prouve pas à lui seul le motif choisi pour l’expliquer.

## Plan d’exécution et critères de passage

### A. Corpus et contrat d’évaluation — EN COURS

- [x] Premier corpus de développement versionné (19 décisions) : position/historique, décision, suite légale, provenance,
  faits attendus, idée attendue, affirmations interdites et limites connues.
- [ ] Cas positifs **et** contre-exemples : retraites supprimées/créées, pièce
  restreinte exploitée par un coup calme, menace préexistante, défense clouée,
  échange déjà commencé, reprise forcée/utile, compensation, coup intermédiaire.
- [x] Cinq contre-épreuves exécutables supplémentaires : prise de l'attaquant par
  une autre pièce, prise en passant, échec qui libère une retraite, mat prioritaire,
  sacrifice suivi de mat. Témoins construits, dont un volontairement non optimal ;
  ne pas les compter comme validation indépendante ou nouveaux motifs reconnus.
- [ ] Cas de portée plus large présents dès le départ, même si non reconnus :
  surcharge, déviation, double menace, lignes ouvertes, sécurité du roi,
  activité réellement utile, concession de structure.
- [x] Rapport séparant couverture des hypothèses, réponses partielles, explications confirmées,
  abstentions, affirmations injustifiées et coût. Ventilation par famille et
  provenance ; pas de pourcentage flatteur limité aux seuls motifs implémentés.
- [x] Contrôle de référence sur Dd2/…f4 avec ShallowRed et Stockfish : le moteur
  trouve la réponse, l’ancien explicateur reste sans cause ; le prototype expose
  une hypothèse structurelle. Les autres exemples restent à enrichir.
- [x] Premier corpus séparé de parties publiées : trois PGN, douze décisions,
  sélection figée avant mesure, historique complet et attentes explicites.
  Sources indépendantes du détecteur, sans réglage des détecteurs dans ce lot.
- [ ] Relecture indépendante, nouvelles parties amateurs et sélection plus large
  pour juger la généralisation. Les annotations actuelles sont les nôtres ; ni les
  exemples construits ni trois parties historiques ne valident la pertinence générale.

**Passage A :** toutes les positions sont exécutables avec chess.js ; attentes
échiquéennes explicites, échecs visibles, familles non couvertes comptées. Aucun
texte généré automatiquement n’est utilisé comme vérité attendue.

### B. Modèle du contexte et des possibilités — EN COURS

- [x] Positions avant/après et historique légal conservés ; identité des pièces
  suivie au travers des déplacements/captures/promotions.
- [x] Premières relations réutilisables : attaques géométriques, captures légales,
  chemins de fou/tour/dame bloqués par des pièces amies, déplacements légaux et
  réponses de capture avec leur meilleure reprise immédiate.
- [x] Changements de sorties et d’attaquants, routes fermées par une pièce amie,
  attachés aux identités des pièces et aux positions concernées.
- [x] Faits de défenses retirées et de lignes ouvertes : captures/reprises légales,
  défenseur capturé/déplacé/contraint, chemins réellement dégagés, distinction
  géométrie/légalité/indisponibilité. Corpus dédié positif et négatif.
- [x] Composer défense retirée et ligne ouverte en hypothèses contextualisées :
  même victime/attaquant, capture précise, rôle « perte permise » ou « occasion
  créée ». Comparaison légale et conditionnelle à deux budgets, avec abstention.
- [x] Première composition de contraintes tactiques : double attaque d'une même
  pièce, clouage absolu/alignement relatif, mat immédiat et déviation courte.
  Identités et avant/après conservés, captures illégales et menaces préexistantes
  distinguées ; positifs et contre-exemples, couleurs et promotion testés.
- [ ] Élargir les contraintes combinées et leur validation : plusieurs attaquants,
  surcharge, interactions de défenses et horizons plus longs. Les premiers cas
  connus ne prouvent pas leur pertinence générale.
- [x] Épisodes de reprises consécutives ancrés dans l’historique : début connu/inconnu, rôle du
  coup (initiation/reprise/poursuite), bilan total et bilan depuis la décision.
  Ne pas imputer la perte antérieure à la meilleure reprise suivante.
- [x] Première hypothèse composée à partir des relations : une décision ferme
  une issue puis l’adversaire attaque la pièce restreinte. Ce n’est pas encore
  l’affirmation « cette pièce est perdue ».
- [ ] Transpositions, camps inversés, pièces déplacées, promotions, prise en
  passant, échecs et historiques incomplets : décrire l’incertitude au lieu
  d’inventer des possibilités par un simple changement du trait.

**Passage B :** les mêmes primitives décrivent plusieurs familles et leurs
contre-exemples. Les faits ne dépendent ni d’une phrase française ni d’un badge.

### C. Vérification comparative des causes — EN COURS

- [x] Questions explicites avant la décision, après le coup, au moment de la
  défense et après une alternative légale. Chaque réponse garde commande UCI,
  score, profondeur et variante. L'exploitation fraîche doit correspondre à
  la menace de l'hypothèse ; sinon résultat indéterminé.
- [x] Premier contraste causal pour une **retraite fermée** : rejouer la même
  menace légale après l'alternative, retrouver la même victime et le même
  attaquant, puis vérifier que le moteur emprunte la retraite restaurée et
  améliore son évaluation. Les deux budgets doivent confirmer la même alternative,
  la perte initiale et le gain comparatif. Statut séparé `attribution`, limité
  à une contribution conditionnelle au verdict, sans texte publiable.
- [x] Alternative qui capture l'attaquant : identité exacte et case de prise
  (y compris en passant), recherche libre après l'alternative, témoin court
  de préservation de la victime, perte initiale et amélioration stables requises.
  Réutilise la recherche d'alternative ; pas de menace illégale rejouée.
- [x] Premiers contrastes pour une défense retirée et une ligne ouverte :
  alternative gardant le défenseur qui reprend réellement, ou l'obstacle qui
  ferme la ligne ; perte visible et écarts de score relatifs stables requis.
  Une perte compte aussi si son camp reste gagnant. Aucun trait artificiel.
- [x] Premier mat court comparé : déviation avec réponse unique puis mat légal,
  preuve couvrant toutes les réponses dans cet horizon, avant/après et alternative
  explicite à deux budgets. Confirmation réelle ShallowRed/Stockfish ; portée
  limitée à cette route de mat, sans conversion de mat en centipions.
- [ ] Généraliser aux autres mécanismes : victime déplacée, défenses/attaques
  combinées, double menace, clouage et mats plus longs. Aucun second choix moteur
  inventé ; comparer les défenses et compensations, pas une capture locale seule.
- [x] Recherches via `FocusedAnalysis` et `Engine`, sans MultiPV/searchmoves,
  détail NNUE/Rust ni recherche stratégique recodée dans l'UI.
- [x] Le moteur cherche librement la défense. Vérification à deux budgets séparés,
  témoins bornés à huit demi-coups, reprises incluses, mat/compensation immédiate
  prioritaires. Plusieurs coups calmes font abandonner le témoin court.
- [x] Reprises disponibles avec décision observée, échecs intermédiaires et
  clôture explicite dans la PV ; refus de conclure si la décision manque.
  Le choix de ne pas reprendre ne prouve pas que la reprise est mauvaise.
- [ ] Compensations différées/positionnelles et défenses multiples : les témoins
  courts ne les couvrent pas. La comparaison actuelle de stabilité des scores
  reste un seuil de développement, pas un étalonnage pédagogique.
- [x] Rapports « soutenue / contredite / indéterminée » séparés de l'hypothèse.
  Portée explicite : mécanisme court dans les lignes du moteur. Toujours aucune
  explication publiable ni preuve que toutes les défenses perdent.
- [x] Au plus dix recherches, budgets par défaut 300/900 ms, plafond global
  12 secondes incluant les connexions ; arrêt, cache moteur/révision/historique,
  rejet des réponses tardives, coûts et réutilisation du cache mesurés.
- [x] Essais réels ShallowRed/Stockfish, avec différences conservées dans le
  rapport de test. Les abstentions ne sont pas comptées comme explications justes.
- [ ] Priorité et déclenchement depuis la revue : à traiter avec l'intégration E.

**Passage C :** une explication rejetée sur les contre-exemples reste rejetée
même si une capture existe dans la PV. Publier le rapport du corpus et ses limites.

### D. Explication et démonstration à partir des preuves — EN COURS

- [x] Premiers **brouillons isolés**, pour les deux nouvelles familles seulement :
  texte issu du contraste soutenu, même témoin légal pour les positions et repères,
  départ après la décision sans rewind. Pour une ligne gardée fermée, afficher
  l'alternative et son obstacle suffit ; aucun défilage des coups calmes de sa PV.
  Ces brouillons ne sont pas activés dans la revue et restent à relire.
- [x] Pour ces brouillons, preuve complète séparée du préfixe illustré : reprises
  résolues conservées, aucun gain compensateur, échec ou promotion du témoin omis ; bilans distincts
  explicités lorsqu'une prise sur une autre pièce est retirée du repère.

- [ ] Une idée principale structurée : décision → changement → exploitation →
  différence avec l’alternative. Les raisons inconnues restent inconnues.
- [ ] Motifs secondaires subordonnés ; distinguer cause initiale, meilleure
  défense et fin d’échange. Une même séquence garde un récit cohérent entre coups.
- [ ] Texte produit uniquement depuis les faits et leur statut ; pas de « commence
  un échange gagnant » pour une reprise dans un échange antérieur perdant.
- [ ] Plan visuel minimal : cases/flèches et positions nécessaires à cette idée ;
  une suppression de retraite peut se montrer sans dérouler toute la PV.
- [ ] Vérifier sur le corpus la pertinence de la phrase ET de l’illustration,
  au-delà des seuls tests de légalité et de scores.

### E. Intégration progressive dans la revue — À FAIRE

- [ ] Raccorder seulement les familles ayant passé les étapes précédentes.
- [ ] Conserver le coup étudié, navigation, variantes, dessins, préférences,
  retry sans fuite et signalement de calcul. Aucun nouveau menu concurrent.
- [ ] Retirer les anciennes règles remplacées ; ne pas empiler deux explications
  contradictoires pour une même décision.
- [ ] Tester des parties complètes (humain/bot, deux humains, import PGN) et le
  parcours bureau/mobile. Mesurer latence et couverture avant/après.
- [ ] Faire relire les exemples par Théo : une CI verte n’est pas cette validation.

## Critères de qualité et limites

- Zéro affirmation interdite sur le corpus de régression avant activation UI.
- Chaque famille a des positifs et des négatifs ; les cas inexpliqués figurent
  au rapport. Une hypothèse trouvée n’est pas comptée comme explication confirmée.
- La promotion d’un prototype vers l’UI dépend de cette validation, pas du nombre
  de tests, du nombre de détecteurs ou d’un pourcentage choisi après mesure.
- Les raisons purement positionnelles restent un objectif du chantier ; elles
  ne sont pas déclarées terminées parce que développement/centre sont décrits.
- Aucun engagement de couverture identique à Chess.com. Ni un moteur plus fort,
  ni davantage de temps, ni une reformulation textuelle ne fournissent seuls
  le modèle de contexte manquant.

## Point de reprise

- Branche actuelle : `codex/ui-polish`, PR #111 ouverte au début de cette reprise.
- Dernier lot : contraintes tactiques courtes et vérification comparative du mat
  de déviation. Voir la livraison ci-dessous et
  `src/review/understanding/TACTICAL_CONSTRAINTS.md`.
- **Prochain travail concret** : vérification comparative des doubles attaques et
  clouages, à partir de …Ca4 et de positifs/contre-exemples. Laisser le moteur
  choisir librement la défense, suivre les deux cibles et l'échange complet,
  comparer une alternative qui enlève la contrainte, garder les compensations.
  Ne pas déduire le gain d'une simple reprise ni du seul score amélioré.
- Corpus construit : 12 hypothèses principales reconnues sur 12 attentes connues.
  Corpus publié : 4 sur 11 (deux échanges, double attaque, déviation), sept idées
  manquantes. Les deux corpus restent à zéro explication publiable. Le second a
  désormais servi au développement ; il faut un échantillon neuf et une relecture
  indépendante pour mesurer la généralisation.
- Le motif principal d'une combinaison doit rester distinct d'un échange local.
  Le mat de la déviation est à montrer en deux demi-coups après la décision ;
  la meilleure défense peut différer de la suite du PGN (Dxc3 plutôt que Fxb6
  après …Fe6). Une vraie compensation positionnelle ne se prouve pas par un
  détecteur de capture supplémentaire. Optimiser le coût avant toute activation E.
- Restent aussi la contribution des clouages/doubles menaces, les mats plus longs,
  compensations différées, extraction coûteuse et démarrages moteur par question. Ne pas contourner ces limites par
  des textes génériques ou par une intégration prématurée.
- Démarrage autorisé : A, puis les primitives de B avec un rapport exécutable.
  L’UI conserve provisoirement le prototype historique, dont les limites restent
  connues. Ne pas annoncer que l’analyse utilisateur est déjà corrigée.
- Exemple réel central : `Dd2` occupe une retraite du fou e3, puis `…f4` attaque
  ce fou. Source : captures utilisateur du 2 octobre. FEN reconstruite, sans
  inventer le PGN antérieur ; trait, horloges FEN et dernier déplacement documentés.
- Autre régression : C×F, P×C, D×P ; distinguer échange global à −1 pion et
  reprise utile. La position concrète construite doit être annoncée comme telle.
- Les prochaines notes doivent préciser fichiers, commandes, résultats et ce
  qui reste non implémenté ; cocher uniquement les livrables effectivement validés.

## Livraison de démarrage — 2 octobre 2026

- Nouvelle backlog active ; anciennes annonces de lots terminés archivées à part.
- Fichiers du prototype : `src/review/understanding/{context,possibilities,exchanges,prototype}.ts`.
- Corpus versionné et rapport : `src/review/understanding/corpus.json`, `corpus.ts`,
  `corpus.test.ts`, `README.md`. Commande : `npm run test:understanding` depuis `ui/`.
- Première mesure : 19 décisions, 12 faits/mécanismes attendus, 7 reconnus,
  5 manquants, 7 contre-exemples respectés, 1 réponse partielle (clouage),
  **0 explication publiable**. Les transformations ne sont pas des cas indépendants.
- Les 25 contrôles du prototype incluent l’historique, l’illégalité, les camps,
  les frontières inconnues, le roque, la promotion et la prise en passant.
- `dev/understanding.test.mjs` confronte Dd2/…f4 aux deux moteurs réels :
  aucune sortie du prototype n’est encore traitée comme une cause confirmée.
- Validation logicielle de cette livraison : lint, TypeScript, 364 tests avec
  les deux moteurs et build réussis. Le bundle applicatif est inchangé : aucun
  import du prototype dans les composants actifs.
- Coût actuel de l’extraction exhaustive : environ six secondes pour le corpus
  local. Pas d’intégration synchrone de ce code dans le rendu React.
- Suite de ce démarrage : voir la livraison suivante et son point de reprise.


## Livraison suivante — vérification des hypothèses, 2 octobre 2026

- `src/review/understanding/Verification.ts` orchestre les questions et leur
  stabilité ; `evidence.ts` extrait le témoin court. Tests unitaires associés.
- `verificationCases.json` ajoute cinq contre-épreuves aux 19 décisions du
  corpus initial. Les rapports restent séparés : on n'améliore pas artificiellement
  le taux de reconnaissance en ajoutant des cas construits pour le vérificateur.
- `dev/understanding.test.mjs` contient désormais 14 tests réels facultatifs :
  deux références initiales et six cas par moteur. Avec les variables binaires,
  les 14 passent. Les budgets du contrôle sont 200/600 ms, plafond 12 secondes.
- Observation locale : sur Dd2/…f4, ShallowRed soutient une perte de deux points
  dans une ligne courte ; Stockfish reste indéterminé, sa meilleure défense
  conduisant à une suite dont la clôture dépasse le contrat du témoin. Les deux
  réfutent la perte annoncée quand une autre pièce prend l'attaquant ou qu'un mat
  immédiat est disponible. Le cas de l'échec intermédiaire reste indéterminé
  dans leurs PV, malgré le témoin construit légal. Ce sont des limites visibles.
- Régression annexe trouvée par la partie réelle : le wrapping de commentaires
  de chess.js pouvait coller SAN et numéro du coup suivant. `exportPgn()` garde
  désormais le movetext sans césure ; réimport testé avec un commentaire de fin
  au temps. Aucun changement des règles ou du moteur.
- Cinq familles du corpus initial restent manquantes ; **0 explication publiable**.
  Aucun raccordement à l'UI et aucun changement du moteur.
- Validation locale : **400 tests / 41 fichiers**, avec ShallowRed et Stockfish ;
  lint, TypeScript et build réussis. Les tests ne valident pas la pertinence
  pédagogique générale et le nouveau prototype reste isolé.
- Suite de cette étape : voir la livraison du contraste ci-dessous. Les familles
  manquantes, les cas indépendants et D/E restent ouverts.


## Livraison — contraste causal d'une retraite, 2 octobre 2026

- `contrast.ts` reconstruit la branche de l'alternative avec l'historique et
  les identités d'origine. Aucune modification fictive du trait ou du plateau.
  Une retraite doit redevenir légale sans capture immédiatement perdante ; le
  bloqueur doit réellement avoir été déplacé par le coup examiné.
- La question UCI `same-threat` n'est lancée que si la comparaison est pertinente.
  Refus explicites : autre rôle, victime déplacée, attaquant différent, menace
  illégale, capture/échec différent pour un même UCI, retraite toujours bloquée
  ou matériellement coûteuse. Ce refus n'est pas une absence de raison échiquéenne.
- `Verification` conserve trois niveaux : perte dans la PV, comparaison des
  scores, puis attribution conditionnelle au mécanisme. Un meilleur score seul
  ne valide aucune cause. Cache, annulation et coût couvrent la nouvelle question.
- `possibilities` permet de cibler une seule identité pour ne pas recalculer
  toutes les possibilités lors de chaque contraste. L'extraction initiale reste
  synchrone et doit être optimisée avant E.
- `contrastCases.json` ajoute neuf comparaisons de développement : quatre
  retraites restaurées, cinq situations refusées, dont les camps inversés et un
  échiquier distinct avec une attaque de tour. Elles ne constituent pas un
  corpus indépendant. Les cinq familles manquantes du corpus initial restent
  visibles ; **aucune explication n'est encore activée dans l'UI**.
- Les tests réels passent à 16 (huit par moteur), budgets 200/600 ms. Le plafond
  des intégrations est 25 secondes pour inclure les démarrages sous charge ;
  le plafond applicatif reste 12 secondes, testé séparément avec une horloge simulée.
  L'horloge est également relue après les calculs synchrones pour empêcher une
  publication hors délai avant que le callback du timer puisse s'exécuter.
- Observation : sur Dd2, l'alternative explicite Rh1 conserve Fd2 contre …f4.
  Les deux moteurs trouvent Fd2. ShallowRed soutient la contribution de la
  retraite fermée ; Stockfish garde l'attribution non établie, car sa perte
  initiale reste hors du témoin court. Rh1 est ici une alternative explicite,
  **pas le meilleur coup annoncé**. Leur alternative automatique peut être
  exf5, qui retire l'attaquant et exige un autre modèle causal.
- Coût observé de la comparaison explicite : environ 4,5 s avec ShallowRed,
  13,3 s avec Stockfish sur une machine chargée, hors extraction initiale.
  La borne applicative peut donc interrompre cette vérification : conserver cette
  abstention, et réduire le coût de connexion/recherche avant l'intégration.
- Validation finale : **418 tests / 42 fichiers**, dont les 16 intégrations
  ShallowRed/Stockfish ; lint, TypeScript et build réussis. Le bundle applicatif
  est inchangé : le nouveau modèle reste isolé des composants de revue.
- Suite : voir la livraison suivante et son point de reprise.

## Livraison — relations de défense et prévention, 3 octobre 2026

- `relations.ts`, exposé par `Understanding.relations`, suit les reprises
  réellement légales après une capture, et compare les mêmes attaquant/victime
  restés sur les mêmes cases. Défenseur capturé, déplacé ou contraint sont
  distincts ; les reprises par promotion conservent une seule identité.
- Une ligne ouverte conserve son trajet et tous les obstacles retirés, dont les
  deux cases libérées par une prise en passant. Une ligne géométrique ne promet
  pas une capture légale : attaquant cloué, échec adverse et données indisponibles
  sont distingués. Les sondes de trait sont explicitement conditionnelles.
- `relationCases.json` : 15 cas de développement (13 construits, deux inversions
  de couleurs), avec positifs et négatifs : défenseur déjà cloué, défense restante,
  obstacle restant/remplacé, attaquant cloué, ligne de défense, prise en passant,
  promotion. Ces primitives ne constituent pas encore deux causes validées ; les
  cinq familles manquantes du rapport original restent affichées.
- Le contraste traite désormais l'alternative qui capture l'auteur effectif de
  la menace. `preventionEvidence` réutilise le témoin court, mais commence après
  cette alternative avec le bilan depuis avant sa capture. Le moteur choisit
  librement sa réponse ; une autre attaque sur la victime peut encore réfuter
  le sauvetage. La prise seule et l'amélioration seule ne valident rien.
- Contrôles : capture normale, prise en passant, couleurs inversées, capture
  d'une autre pièce, variante qui perd quand même la victime, PV trop courte,
  instabilité, scores de mat et cache. Pas de recherche supplémentaire : huit
  maximum dans ce cas, contre dix pour le contraste d'une retraite.
- L'ancien cas « attaquant capturé » des neuf comparaisons passe de refus à
  prévention reconnue : quatre retraites restaurées, une prévention, quatre refus.
- Aucun code moteur ni composant actif modifié ; `explanation` reste `null`.
  Les tests UCI passent à 18, dont la comparaison explicite exf5 pour chaque moteur.
- Observation UCI du 3 octobre, budgets 200/600 ms : après exf5, les deux moteurs
  répondent Fxf5 puis conservent le fou e3 dans le témoin. ShallowRed soutient la
  prévention ; Stockfish garde l'attribution non établie, faute de clôture de la
  perte initiale. L'amélioration de score seule ne contourne pas cette limite.
  Coût de vérification observé : 2,6 s / 6,7 s, hors extraction préalable.
- Validation finale : **445 tests / 44 fichiers**, dont les 18 intégrations avec
  ShallowRed et Stockfish ; lint, TypeScript et build réussis. Aucun changement
  du bundle actif. Le rapport pédagogique original garde cinq mécanismes manquants
  et zéro explication publiable ; les nouveaux tests valident les faits et les
  conditions du prototype, pas sa pertinence générale.
- **Prochain travail concret** : composer les relations de défense/lignes ouvertes
  en hypothèses contextualisées et en contrastes vérifiables, avec refus si le
  changement ne contribue pas au verdict. Ne pas ajouter simplement deux textes
  de motifs à l'UI. Puis traiter la clôture d'échange lorsqu'une reprise possible
  n'est pas choisie par le moteur. D/E, sacrifices positionnels, performance et
  corpus indépendant restent ouverts.


## Livraison — défenses/lignes vérifiées et premiers brouillons, 3 octobre 2026

- `mechanisms.ts` compose les relations légales en hypothèses de défense retirée
  ou de ligne ouverte. La capture doit employer les mêmes pièces au prochain tour
  de l'attaquant, avec au plus une réponse intermédiaire ; pas de prise cherchée
  loin dans la variante pour justifier le coup. Une réponse réelle peut lever un
  échec lorsque la sonde de trait était indisponible.
- `RelationVerification.ts` et `relationContrast.ts` analysent avant/après la
  décision, l'alternative et la branche après capture. Le contraste d'une défense
  exige que le même défenseur reprenne effectivement et réduise la perte ; celui
  d'une ligne exige l'obstacle conservé et un témoin qui préserve la victime.
  Identités, captures et effets d'échec doivent rester cohérents.
- `BoundedVerification.ts` partage les budgets, cache, annulation et délai avec
  le vérificateur de restriction existant. Aucun changement de ses conclusions.
  Au plus dix recherches, 300/900 ms et plafond de 12 s par défaut. Les scores
  de mat ne sont pas convertis en centipions ; ils restent hors de cette attribution
  matérielle. Le témoin court s'arrête aussi à la première fin de partie, même si
  le moteur poursuit sa PV après une nulle selon chess.js.
- `mechanismCases.json` : 13 cas de développement (11 construits, deux inversions
  de couleurs), dont défense restante, attaquant cloué, cible qui quitte la ligne,
  obstacle retiré dans les deux alternatives et compensation par une autre prise.
  Les scores des tests unitaires sont **simulés**, pas des évaluations échiquéennes.
- Deux cas construits avec davantage de matériel confirment le contraste auprès
  des deux moteurs : Cb4 abandonne la reprise après Fxf6 ; dxe4 expose la dame d1
  à la tour d8. Les cas dépouillés exposent aussi des limites : roi devenu défenseur,
  autre menace exploitée, mat, score instable ou préservation encore indéterminée.
  Ces refus sont conservés. Aucun seuil n'a été relâché pour obtenir une réussite.
- `relationDraft.ts` génère seulement un **brouillon** lorsque perte et attribution
  sont soutenues. Exemple de défense : après Cb4, montrer Fxf6 ; dans l'alternative
  a6, montrer Fxf6 puis Cxf6. Exemple de ligne : départ après dxe4, capture et reprise
  nécessaires au bilan ; dans l'alternative d4, montrer directement l'obstacle.
  Voir `src/review/understanding/DRAFT_EXAMPLES.md` pour les exemples à relire.
- Le rapport original conserve ses 19 décisions : 12 idées attendues, **9 hypothèses
  reconnues, 3 familles manquantes** (double menace, clouage, mat), une réponse partielle.
  Trois candidats secondaires des nouvelles familles ne sont pas encore annotés
  complètement : ils sont affichés comme **non relus**, pas comptés comme justes.
  Le contrôle des affirmations interdites existant porte sur restriction/reprises.
  Toujours **zéro explication déclarée publiable** et aucun import dans la revue active.
- Les intégrations UCI passent à 32 (18 existantes et 14 pour ces mécanismes), avec
  observations des deux budgets, alternatives, témoins, abstentions et coûts.
  Lors du contrôle ciblé local, les deux cas plus riches prennent environ 3,1–4,0 s
  avec ShallowRed et 6,8–8,4 s avec Stockfish, connexions incluses, extraction exclue.
  Les intégrations autorisent 25 s ; le plafond applicatif reste 12 s.
- Validation finale : lint, TypeScript et build réussis ; **490 tests / 45 fichiers**
  avec les deux binaires via `npm test -- --maxWorkers=2`. Le lancement par défaut
  s'est arrêté sans bilan ; le passage borné à deux workers a terminé avec succès.
  Le build actif garde les mêmes assets ; aucun fichier du moteur ni composant
  de revue modifié.

- Vérification CI : le Stockfish 16 d'Ubuntu peut terminer une itération sur une
  borne avec un coup différent de sa dernière itération exacte. Le refus du
  vérificateur est alors correct. Les intégrations contrôlent explicitement ce
  refus (score réellement borné, PV/coup légaux et cohérents, aucune explication),
  sans accepter une panne ou désactiver `usableResult`. Une régression simule les
  lignes UCI reproduites ; le diagnostic garde la question et quatre dernières
  réponses. Reproduction locale avec le binaire Ubuntu extrait sous `/tmp`, sans
  remplacer le moteur installé. Ce refus ne compte pas comme explication juste.
- Revalidation après ce correctif CI : **490 tests / 45 fichiers** avec ShallowRed
  et le Stockfish 16 exact d'Ubuntu, lint et TypeScript réussis. Aucun changement
  du contrat de validité des réponses ni des seuils de confirmation.


## Livraison — clôture d'échange et repère distinct, 3 octobre 2026

- `witness.ts` rejoue la continuation avec les identités et l'historique complets.
  Chaque capture garde ses reprises légales, le choix réel et sa position. Un
  échec intermédiaire peut différer la reprise ; une PV ou une borne qui s'arrête
  avant la décision reste indéterminée. Aucun choix futur n'est publié.
- `evidence.ts` donne une raison de clôture et compte les coups calmes consécutifs.
  Le bilan est examiné avant la limite des coups calmes. La compensation, les
  promotions et les échecs immédiats sont conservés ; nulle et mat adverse ne sont
  pas décrits comme un simple échange matériel. La portée reste une ligne moteur.
- `illustration.ts` sépare le préfixe utile de la preuve complète. Les reprises,
  leurs échecs intermédiaires et le choix réel de ne pas reprendre restent visibles.
  Une prise ultérieure adverse sur une autre pièce peut être omise ; toute prise
  compensatrice du camp de la victime, promotion ou échec interdit cette coupe.
- `relationDraft.ts` expose les deux bilans et les coups omis, et précise qu'une
  reprise légale non choisie n'est pas pour autant une mauvaise reprise. Aucun
  nouveau détecteur ou phrase générique ajouté à l'explicateur actif.
- Exemple construit dxe4 : le repère …Txd1 Txd1 ferme le motif à −3 points ; une
  autre prise …Cxe4 reste dans la preuve à −4. Le brouillon signale la différence.
  Tests des deux couleurs, compensations partielles/complètes, promotion, échec,
  reprise en attente, borne, nulle et mat. Les scores unitaires sont simulés ;
  ces contrôles n'augmentent pas la couverture pédagogique du corpus original.
- Contrôle réel Stockfish 17.1 sur Dd2/…f4 : la défense calculée se termine par
  Tfe1 alors que Cxd4 et Dxd4 restent légaux. Le témoin observe désormais la clôture
  à −3 dans cette ligne, avec le choix et les reprises conservés. Cela ne prouve
  pas une perte forcée. Les résultats peuvent varier selon le budget et le binaire.
- Aucun changement du moteur, des budgets UCI ou de l'interface active ; le
  prototype reste isolé et aucune explication n'est déclarée publiable.
- Validation : suite complète **509 tests / 46 fichiers** avec ShallowRed et le
  Stockfish 16 exact d'Ubuntu ; après l'ajout d'un dernier contrôle du texte, les
  **60 tests ciblés** de preuve/illustration/brouillon passent. Lint, TypeScript
  et build passent ; les assets du build actif sont inchangés.
- Nouveau contrôle ciblé des deux binaires : six essais réels réussis. Sur la
  position de ligne, tous deux gardent …Cxe4 dans la preuve à −4, avec un repère
  arrêté à −3. Coûts observés hors extraction : 3,9–4,8 s avec ShallowRed,
  6,1–7,8 s avec Stockfish 16. Les trois contrôles ciblés Stockfish 17.1 passent
  également. Ces durées ne sont pas des garanties de latence applicative.
- Point de reprise : annotations des candidats secondaires, corpus indépendant,
  motifs manquants, optimisation puis intégration E. La relecture pédagogique
  ne doit pas être remplacée par les seuls tests logiciels.


## Livraison — annotations et corpus de parties publiées, 3 octobre 2026

- `corpus.ts` sépare motif principal, relation secondaire, sortie inattendue et
  annotation absente. Le contrôle des hypothèses erronées couvre désormais aussi
  défenses/lignes, avec rôle, identités et capture exacts. Un candidat inattendu
  compte comme erreur ; un candidat non annoté reste explicitement non relu.
- `corpus.json` annote les trois relations secondaires après captures/reprises
  exécutées avec chess.js : reprise du roi empêchée après Fb5 ; ouverture de la
  colonne aussi pour la dame ennemie après Fh7 ; reprise du roi en f7 interdite
  après Dh5. Ces faits ne reconnaissent pas les idées principales clouage/mat.
  Les deux autres épisodes de capture du corpus sont aussi annotés.
- Le bilan initial reste 19 décisions, 12 idées attendues, 9 hypothèses principales,
  3 manquantes et 1 réponse partielle. Trois relations secondaires correctes à part,
  aucune relation/échange non relu, zéro explication déclarée publiable. Tests des
  mauvais rôle/capture/identité et du contre-exemple avec échange secondaire.
- `externalGames.json`, `externalCorpus.ts` et leurs tests ajoutent trois PGN
  publiés et douze décisions fixées avant mesure. Sources conservées ; commentaires
  et variantes d'auteur exclus. Import strict, SAN/index/longueur/position finale
  vérifiés, historique startpos complet et suite jouée limitée à huit demi-coups.
- Rapport séparé : 11 idées attendues, **2 contextes d'échange reconnus, 9 idées
  manquantes**, 1 décision calme sans motif tactique attendu, 0 hypothèse inattendue,
  0 explication publiable. Mat/déviation, double attaque, sacrifices avec compensation,
  activité du roi et percée/pion passé restent sans explication. Cette mesure expose
  l'étroitesse actuelle du modèle ; elle ne doit pas être annoncée comme une réussite
  pédagogique. Voir `EXTERNAL_CORPUS.md` pour les attentes et sources.
- Les quatre nouveaux essais UCI (deux cas par moteur) trouvent Qb8+ avec mat et
  …Fe6, tandis que le prototype reste sans idée principale. Les deux moteurs
  préfèrent Dxc3 à la prise Fxb6 du PGN après …Fe6. Les analyses moteur et les suites
  historiques restent distinctes ; aucune défense artificielle n'est rejouée.
- Les sources sont indépendantes du détecteur, les annotations restent internes.
  L'échantillon historique n'est pas représentatif des joueurs amateurs et aucune
  relecture pédagogique indépendante n'est déclarée. Aucun détecteur, texte actif,
  moteur ou budget applicatif modifié. Les brouillons restent hors de l'UI.
- Validation logicielle : **528 tests / 47 fichiers** avec ShallowRed et Stockfish
  16 via `npm test -- --maxWorkers=2`, puis **40 tests ciblés** après le dernier
  contrôle de bilan secondaire ajouté. Lint, TypeScript et build passent ; les
  assets actifs restent inchangés. Les quatre nouveaux tests UCI passent, portant
  leurs essais à 36. La CI du commit livré sera relue séparément.
- Extraction du corpus externe : environ 8–14 secondes pour douze décisions lors
  des contrôles locaux, selon la charge. Ce coût synchrone reste incompatible avec
  un raccordement direct au rendu React. Aucune optimisation n'est revendiquée.
- Le point de reprise est désormais double attaque/clouage/mat et contraintes
  combinées, avec contre-épreuves puis contributions comparatives. Les exemples
  publiés utilisés ensuite pour développer le code seront des régressions connues ;
  garder un échantillon neuf et une relecture distincte avant activation UI.


## Contraintes tactiques courtes et mat comparé — 3 octobre 2026

- `constraints.ts` ajoute les faits de double attaque, clouage absolu et alignement
  relatif, mat immédiat et une déviation vers le mat. Avant/après et au plus la
  réponse suivante, mêmes identités, sondes conditionnelles explicites. Un roi
  n'est jamais une cible de capture ; une menace déjà présente n'est pas une
  nouvelle raison. Aucun code du moteur ni composant actif n'est modifié.
- `constraints.test.ts` contient 22 contrôles : camps inversés, capture illégale
  d'un attaquant cloué, pièce clouée encore mobile sur son rayon, second obstacle,
  alignement avec une dame, capture de l'attaquant d'une fourchette, mat défendu,
  motif trop lointain, promotion, prise en passant, plafond et fin de partie.
  Les positions ont été exécutées avec chess.js avant l'ajout des fixtures.
- `shortMateProof` rejoue l'historique et couvre toutes les réponses légales dans
  un horizon réponse + mat immédiat, plafond 1 200 coups examinés. Une échappatoire,
  une nulle ou la limite empêche la preuve. Pour Db8+ de Morphy : Cxb8 est unique,
  le cavalier quitte d7, Td8 est mat. Il n'y a pas de longue suite de développement.
- `MateVerification` compare avant/après et une alternative explicite à deux
  budgets, via le même cache/arrêt/plafond global que les autres familles, au plus
  six recherches. Choix du moteur, preuve légale et contraste gardent des statuts
  distincts ; l'alternative ne prouve pas l'absence de mat plus long.
- Les deux moteurs réels confirment le mat après Db8+ et préfèrent ce coup dans
  ces recherches. Da3 garde le cavalier d7 et ne force pas le même mat court.
  ShallowRed omet Td8 dans sa PV ; seule la preuve légale complète ce mat immédiat,
  avec `rules-completed`. Une variante différente, mauvais gagnant, distance
  incohérente ou score en centipions ne reçoit pas ce complément.
- Les 14 tests du vérificateur couvrent aussi annulation, cache moteur/révision/
  historique, alternative illégale/identique, bloqueur retiré, attaquant déplacé
  et Noirs gagnants.
  Les scores unitaires sont simulés ; les essais UCI sont distingués.
- Les rapports ont désormais des annotations de contraintes exactes : type,
  rôle, attaquant, cibles et coup de mat. Absence et liste vide sont distinguées,
  les défauts sont injectés dans les tests. Corpus construit : 12/12 hypothèses
  attendues reconnues ; publié : 4/11, sept idées manquantes. Zéro candidat
  inattendu/non relu sur ces cas, **zéro explication publiable**, pas de mesure
  générale de pertinence. Les sacrifices et plans de finale restent manquants.
- Contrat et limites : `TACTICAL_CONSTRAINTS.md`, rapports mis à jour dans
  `README.md` et `EXTERNAL_CORPUS.md`. Le corpus publié devient aussi un jeu de
  régression connu (`usedForDevelopment: true`), sans relecture indépendante.
- Coût observé sous charge : environ 25 s pour les 12 décisions publiées, dont
  0,48 s pour les nouvelles contraintes. Les rapports de corpus ont un délai
  logiciel de 60 s ; les budgets moteur restent inchangés. Optimiser les reprises
  et possibilités exhaustives avant tout raccordement synchrone à React.
- Validation déjà obtenue : lint, TypeScript, build, **565 tests / 49 fichiers**
  avec ShallowRed et le Stockfish 16 de CI, puis contrôles ciblés des derniers
  garde-fous ajoutés, dont Stockfish 17.1. Les assets actifs sont inchangés. La CI de la livraison
  finale est à lire après envoi ; ne pas déduire son état de ces tests locaux.
- Suite : comparer les causes de double attaque et clouage, garder la meilleure
  défense d'un échange perdant distincte de sa cause initiale, puis optimiser
  l'extraction et préparer des brouillons relus avant l'intégration E.
