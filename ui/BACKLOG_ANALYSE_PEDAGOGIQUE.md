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
- [ ] Corpus indépendant de nouvelles parties pour juger la généralisation.
  Les cas construits avec le code ne sont qu’un corpus de développement.

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
- [ ] Composer les contraintes combinées et élargir la validation de ces familles.
  Les premiers cas construits ne prouvent pas leur pertinence générale.
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
- [ ] Généraliser aux autres mécanismes : victime déplacée, défenses/attaques
  combinées, double menace, clouage et mat. Aucun second choix moteur inventé.
- [x] Recherches via `FocusedAnalysis` et `Engine`, sans MultiPV/searchmoves,
  détail NNUE/Rust ni recherche stratégique recodée dans l'UI.
- [x] Le moteur cherche librement la défense. Vérification à deux budgets séparés,
  témoins bornés à huit demi-coups, reprises incluses, mat/compensation immédiate
  prioritaires. Plusieurs coups calmes font abandonner le témoin court.
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
- Dernier lot : hypothèses de défense retirée/ligne ouverte, comparaison causale
  conditionnelle, brouillons courts. Voir la livraison du 3 octobre ci-dessous.
- **Prochain travail concret** : traiter la clôture de l'échange quand une reprise
  légale n'est pas choisie par le moteur, sans tronquer une compensation ; séparer
  le témoin de vérification de l'illustration minimale lorsqu'une autre capture
  suit l'échange initial. Ensuite enrichir les annotations des motifs secondaires
  et tester des décisions issues de nouvelles parties avant l'activation UI.
- Restent aussi clouage/double menace/mat, compensations longues, extraction trop
  coûteuse et démarrages moteur par question. Ne pas contourner ces limites par
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
- Validation finale : lint, TypeScript et build réussis ; **489 tests / 45 fichiers**
  avec les deux binaires via `npm test -- --maxWorkers=2`. Le lancement par défaut
  s'est arrêté sans bilan ; le passage borné à deux workers a terminé avec succès.
  Le build actif garde les mêmes assets ; aucun fichier du moteur ni composant
  de revue modifié.
