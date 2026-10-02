# Analyse pédagogique — backlog et reprise

Décision validée par Théo le 29 septembre 2026. Périmètre : `ui/**`, moteur inchangé.

## Objectif et parcours validés

Remplacer les formulations génériques par une explication courte et vérifiable du
coup, puis une démonstration facultative sur le même échiquier. Expliquer le changement
entre le coup joué et une meilleure idée, pas seulement répéter la catégorie du coup.

- Une phrase principale près de la classification, sans surcharger la revue.
- « Montrer pourquoi » : cases/flèches ciblées, courte suite, précédent/suivant,
  texte par étape ; pas de lecture automatique imposée.
- « Voir la meilleure idée » : comparaison depuis la position AVANT le coup.
- « Retour à la partie » : restituer exactement le coup/la variante de départ.
- « Réessayer » : conserver le parcours actuel ; indices graduels (idée générale,
  pièce concernée, solution). Aucune solution ni flèche révélée involontairement.
- Ne pas créer un second mode d’analyse ; conserver navigation clavier, variantes,
  relecture des deux camps, orientation et préférences d’affichage.

## Garde-fous

- L’UCI expose scores et variantes, pas les raisons internes du moteur. Les textes
  sont construits à partir de faits échiquéens et de suites légales vérifiées.
- Une attaque, un clouage ou davantage de cases contrôlées ne prouve pas à lui seul
  qu’un coup est bon/mauvais : relier le motif à la suite et à la comparaison moteur.
- Une PV n’est pas une preuve de gain forcé. Distinguer « dans cette suite » de
  « forcé ». Ne pas conclure à une pièce gagnée avant sa reprise, ni ignorer les
  promotions, sacrifices, compensations et positions initiales personnalisées.
- Pas de fausse explication lorsqu’aucune cause fiable n’est trouvée. Garder le
  verdict et une limite explicite ; permettre d’inspecter la suite trouvée.
- Ne pas modifier la partie, les variantes explorées ou les dessins personnels
  pour montrer une démonstration. Repères pédagogiques séparés et temporaires.
- En retentative cachée : aucune meilleure suite, évaluation ou motif révélateur
  avant demande explicite d’indice/solution.

## Lots

### 1. Socle et première démonstration — TERMINÉ (30 septembre 2026)

- [x] Modèle d’explication avec faits, positions vérifiées, texte et repères visuels.
- [x] Conséquences concrètes : mat, promotion, évolution matérielle dans la suite.
- [x] Texte contextualisé à la place de la seule formule de classification.
- [x] Démonstration sur le plateau courant, étapes et retour exact à l’origine.
- [x] Comparaison avec la meilleure idée depuis la bonne position.
- [x] Tests : coups légaux, PV absentes/tronquées/incohérentes, deux couleurs,
  promotions/reprises, variantes, préférence d’annotations, retry caché.
- [x] Vérification navigateur desktop/mobile et mise à jour de cette backlog.

### 2. Motifs tactiques et lien causal — TERMINÉ (30 septembre 2026)

- [x] Fourchettes/doubles attaques et gain réellement illustré par la suite.
- [x] Clouages absolus/relatifs : pièce, attaquant, cible et conséquences.
- [x] Défenseur déplacé/supprimé, pièce non défendue, attaque à la découverte.
- [x] Menaces de mat/progression du pion et occasions manquées.
- [x] Bons coups défensifs : menace évitée ; bons coups offensifs : occasion exploitée.
- [x] Une seule explication prioritaire, sélectionner la plus utile et vérifiable.

### 3. Apprentissage et recherches ciblées — TERMINÉ (30 septembre 2026)

- [x] Indices graduels intégrés à Réessayer, sans divulgation anticipée.
- [x] Réutiliser les résultats existants ; approfondissement seulement si nécessaire.
- [x] Budgets bornés, annulation à la navigation, cache par moteur/revue/position.
- [x] Afficher la vérification en cours sans bloquer la lecture de la partie.
- [x] Tester les changements de moteur et résultats tardifs/incohérents.

### 4. Observations positionnelles — TERMINÉ (30 septembre 2026)

- [x] Développement, colonnes ouvertes, structure de pions, sécurité du roi,
  activité et contrôle de cases utiles.
- [x] Distinguer observation descriptive et cause confirmée du verdict moteur.
- [x] Comparaisons ciblées et formulation prudente ; aucun remplissage automatique.

### 5. Causes locales et démonstrations courtes — TERMINÉ (2 octobre 2026)

Le retour utilisateur invalide le choix précédent de prolonger « Montrer pourquoi »
jusqu’à la dernière capture de la PV. La présente correction remplace cette méthode ;
les notes historiques des lots précédents ne décrivent plus la sélection actuelle.

- [x] Retirer les observations génériques du parcours principal du verdict.
- [x] Séparer la continuation brute, dans « Variantes du moteur », de la cause
  pédagogique et de sa comparaison. Une seule cause principale est retenue.
- [x] Rechercher une conséquence locale : cible en prise, échange défavorable,
  défense retirée, fourchette, clouage exploité, découverte, mat, promotion,
  occasion manquée ; bons coups défensifs vérifiés avant/après.
- [x] Vérifier l’hypothèse avec le moteur sélectionné après sa conséquence et,
  pour une erreur/occasion manquée, après l’autre décision. Deux positions au
  maximum, 1 200 ms chacune, six secondes au total ; aucune commande MultiPV.
- [x] Vérifier les prises immédiates possibles quand la PV montre autre chose,
  sans transformer une capture lointaine en justification du coup étudié.
- [x] Terminer la démonstration à sa conséquence et aux reprises liées, au plus
  six demi-coups depuis la décision. Commencer après le coup sauf besoin réel
  de montrer l’état antérieur. Un suffixe de PV ne rallonge pas l’illustration.
- [x] Garder le coup étudié visible ; comparaison avec l’autre décision, étapes
  numérotées et fermeture unique. Pas de boutons de navigation pour une seule
  position. Variante brute explicitement distincte de « Montrer pourquoi ».
- [x] Calcul visible sur le coup consulté, délai de stabilité de 300 ms, annulation
  à la navigation, cache par moteur/revue/révision/historique, pas de demi-paire
  de résultats ni publication tardive. Retry masqué et dessins conservés.
- [x] Régressions : scores bornés/incomplets, contre-capture ailleurs, compensation,
  deux couleurs, défense déplacée, suffixe lointain ; exemple de dame perdue issu
  d’une ouverture légale vérifié avec ShallowRed et Stockfish.

Validation du 2 octobre : 336 tests avec ShallowRed/Stockfish, lint, TypeScript
et build réussis. Parcours Chromium complet : import, partie, analyse réelle,
comparaison courte, annulation/cache, retry, dessins, orientation et trois tailles
d’écran. Les promotions analysées sont contrôlées pour les deux couleurs.

Limites assumées : les contrôles moteur confortent une explication locale ; ils
ne prouvent pas toutes les réponses intermédiaires ni une cause unique de chaque
baisse d’évaluation. Une seule hypothèse est confirmée à la fois. Les longues
combinaisons et raisons purement positionnelles restent parfois inexpliquées.
L’UI le dit au lieu d’afficher un développement ou du contrôle de cases hors sujet.
Il reste possible d’explorer la variante brute ou d’approfondir le coup.

Pistes ultérieures (hors correctif livré) : corpus de PGN utilisateur avec coups
précis, recherche d’une autre hypothèse après rejet, contre-épreuves intermédiaires
et raisons positionnelles comparatives. Ne pas annoncer ces pistes comme déjà
couvertes, ni présenter la couverture actuelle comme équivalente à Chess.com.

## État de reprise

- Branche : `codex/ui-polish`, PR existante #111 (correctif matériel et interactions).
- Entrée principale : `src/review/InteractiveReview.tsx` ; texte générique dans
  `study.ts::moveSummary` et `annotations.ts::reason`.
- `GameReview.results[i]` analyse la position i AVANT son prochain coup ; le coup
  affiché à la position i>0 est celui de i-1. La réfutation vient de results[i].
- `BranchAnalysis.before/result` fournissent le même couple pour une variante.
- `StudyTree` conserve les variantes utilisateur. Ne pas y insérer la démonstration.
- `Board` utilise Chessground et conserve les dessins tant que la FEN ne change pas.
- `decisionCause.ts` sélectionne une hypothèse et son fragment ; `useCauseCheck.ts`
  utilise `FocusedAnalysis` à budget court. Aucun détail interne du moteur.
- `dev/causes.test.mjs` valide la confirmation avec les deux vrais moteurs ; la
  galerie `dev/explanations.tsx` simule seulement ses contrôles pédagogiques.
- Reprise : consulter la checklist et les notes ajoutées à la livraison du lot.

## Notes de livraison du lot 1 — 30 septembre 2026

- `src/review/explanations.ts` construit deux démonstrations indépendantes :
  coup joué puis réponse du moteur, et meilleure idée depuis la position avant
  le coup. Chaque mouvement et chaque FEN de la PV sont vérifiés avec chess.js.
- Les faits couverts sont le mat atteint dans la suite, la promotion jouée et
  le bilan matériel comparé. La promotion compte son gain net (valeur − pion),
  et les promotions avec prise sont décrites. Pas encore de diagnostic de
  fourchette, clouage ou compensation positionnelle : ces points restent au lot 2/4.
- Au plus huit demi-coups visibles. Pas de conclusion matérielle sur une suite
  tronquée, un score borné ou une prise finale immédiatement reprenable ; un
  sacrifice approuvé n’est pas requalifié en erreur du seul fait du matériel.
  Une PV n’est jamais annoncée comme une séquence forcée.
- `InteractiveReview` conserve un instantané de démonstration séparé de
  `StudyTree`. Le plateau source reste monté et masqué pour garder ses dessins,
  ses dimensions et son curseur. `Board.autoShapes` porte les flèches pédagogiques.
- Le retour restaure le coup ou la branche exacts. Les flèches clavier parcourent
  la démonstration ouverte. Orientation, préférence d’annotations et retry caché
  sont respectés. Les scores intermédiaires inconnus restent « ? ».
- Aucune recherche moteur ajoutée par les explications. Les indices graduels,
  l’approfondissement ciblé et son cache restent au lot 3. Le moteur est inchangé.
- Contrôles locaux acquis : lint sans avertissement, TypeScript, 226 tests
  unitaires, 245 tests avec ShallowRed/Stockfish et build. Contrôle Chromium
  des démonstrations bureau/mobile, navigation clavier, comparaison, dessins,
  retour exact à la partie/variante, préférences et retry caché réussi.
  Scénario ciblé : `CHESS_EXPLANATIONS_ONLY=1` (voir README).
- Prochaine reprise : lot 2, d’abord un motif tactique vérifiable de bout en
  bout (faits, lien avec la suite, explication et repères visuels), sans déduire
  le verdict de la simple présence d’un motif.

## Notes de livraison du lot 2 — 30 septembre 2026

- `src/review/tactics.ts` détecte des motifs liés à une conséquence dans la PV :
  fourchette suivie de la fuite d’une cible et de la capture de l’autre ; clouage
  absolu/relatif exploité ; ligne ouverte puis capture/mat ; défense perdue puis
  prise ; cible non défendue ; mat immédiat/menace réalisée ; même pion promu.
- Le lien au verdict se fait dans `explanations.ts::tacticalExplanation` : scores
  exacts et annotation disponibles ; gain/mat dans la suite pour le camp concerné,
  comparaison avec l’alternative pour les erreurs et occasions manquées. Le bilan
  de la PV entière est conservé dans `verifiedEnding`, même quand l’affichage
  s’arrête à huit demi-coups. La conséquence du motif doit rester visible.
- Les bons coups défensifs vérifient localement un mat en un supprimé, une
  interposition, une fuite vers une case non capturable ou un défenseur permettant
  une reprise légale. Ces essais chess.js ne sont pas des recherches moteur et
  ne prédisent pas les menaces profondes. Les captures/reprises filtrent les
  défenseurs cloués et les rois qui ne peuvent pas reprendre légalement.
- Une idée prioritaire par coup. `ExplanationStep.motif/marks` associent le texte
  aux pièces concernées ; rouge = menace, vert = défense/idée. Le prochain coup
  reste bleu aux étapes sans motif. Les annotations personnelles sont séparées.
- `MoveExplanation.primary = "alternative"` dirige « Montrer pourquoi » vers
  l’occasion manquée. Le retour, les variantes, l’orientation, les préférences et
  la dissimulation de la solution restent gérés par le socle du lot 1.
- Couverture volontairement prudente : fourchettes de pièces/roi, motifs proches
  du coup examiné, défenseurs effectivement perdus, menaces réalisées dans la
  suite. Un motif géométrique isolé, une suite incohérente, un score borné ou une
  compensation inexpliquée ne suffit pas. Une menace déjà présente n’est pas
  attribuée au dernier coup. Aucune promesse de gain forcé.
- Tests de motifs et contre-exemples : `tactics.test.ts`. Scénarios visuels :
  `/dev/explanations.html?case=fork` (ou `pin`, `defender`, `defence`, `miss`),
  tous vérifiés dans le contrôle `CHESS_EXPLANATIONS_ONLY=1`.
- Validation : 25 nouveaux tests de motifs et contre-exemples ; 251 tests unitaires,
  270 tests avec ShallowRed/Stockfish, lint, TypeScript et build réussis. Parcours
  Chromium complet réussi, y compris les motifs sur bureau/mobile, le retournement,
  le choix de l’alternative manquée et l’absence de fuite pendant le retry.
- Prochaine reprise : lot 3 (indices graduels du retry, puis vérifications
  ciblées bornées et cachées), sans divulguer les motifs avant demande d’indice.

## Notes de livraison du lot 3 — 30 septembre 2026

- `hints.ts` réutilise la PV validée et les faits tactiques/défensifs du lot 2.
  Le premier indice donne une idée sans case ni SAN, le second nomme uniquement
  la pièce source et l’encercle. Sans motif confirmé, conseil général explicite.
- `RetryCoach` conserve le plan choisi pendant l’exercice. « Voir la solution »
  est une action séparée ; aucune recherche d’indice ne la révèle implicitement.
  Retenter remet les indices à zéro. Les dessins personnels restent indépendants.
- `FocusedAnalysis` reçoit une ou deux positions : 3 s chacune, délai global
  10 s incluant la connexion. Arrêt explicite, navigation, sortie, relance ou
  changement de moteur interrompent la recherche et invalident ses réponses.
  L’indicateur de calcul n’empêche ni de jouer ni de parcourir la partie.
- Cache par objet revue/révision/moteur/historique UCI ; 64 demandes et 128
  positions maximum par revue. Une paire abandonnée ne publie pas son premier
  résultat. Une racine déjà approfondie peut servir à une paire ou à un indice.
  Un échec technique reste réessayable ; une réponse inexploitable est mémorisée
  jusqu’à la relance globale, sans boucle de calcul. Aucune commande MultiPV ou
  searchmoves, aucune modification du moteur.
- « Préciser cet indice » vérifie une seule position sur demande. « Approfondir
  ce coup » recalcule avant/après si l’explication reste générique ou le coup
  non classé. L’analyse principale ou de variante passe en premier. Une paire
  complète met à jour `GameReview` (scores/courbe/annotations) ou le cache de
  `BranchAnalysis`. Un indice seul reste dans le cache de la variante.
- Limites : ce budget supplémentaire n’assure pas une profondeur supérieure aux
  longues passes de résolution antérieures. Une contradiction persistante ne
  reçoit pas de classification inventée. La précision des motifs reste celle
  des lots 1/2 ; les observations positionnelles appartiennent au lot 4.
- Tests ajoutés : `FocusedAnalysis.test.ts` et `hints.test.tsx`, 25 cas couvrant
  cache, répétitions/historiques, deux camps, score borné/PV incohérente, terminal,
  connexion bloquée, annulation, réponse tardive, changement de moteur, publication
  cohérente et verdict contradictoire. Le HTML initial ne contient aucun indice.
- Contrôles locaux : lint, TypeScript, 276 tests unitaires, 295 tests avec
  ShallowRed/Stockfish et build réussis. Chromium ciblé puis parcours complet
  réussis : import PGN, jeu, variantes, navigation, annotations, indices graduels,
  recherche ciblée Stockfish, arrêt/reprise et cache, sur bureau/mobile/tablette.
- Branche synchronisée avec `main` à `4fa0da3` ; binaire local à jour via
  `cargo build --release --bin shallowred`. Les nouveautés distantes de ce lot
  concernaient la documentation et les protocoles d’essai, sans diff du moteur.
- Prochaine reprise : lot 4, observations positionnelles prudentes. Le lot 3
  n’ajoute pas de diagnostic générique d’activité/sécurité du roi sans preuve.

## Notes de livraison du lot 4 — 30 septembre 2026

- `positional.ts` reconstruit et vérifie le coup et son historique avec chess.js,
  puis compare les propriétés avant/après. Il ne dépend d’aucun détail interne
  du moteur et n’ajoute aucune recherche UCI.
- Familles couvertes : premier développement d’un fou/cavalier depuis la position
  standard (quinze premiers coups, aucun départ/retour antérieur) ; tour sur colonne
  ouverte/semi-ouverte ; pions nouvellement doublés/isolés/passés ; roque et
  diminution de couverture proche du roi ; mobilité légale accrue et accès/occupation
  du centre. Les captures en passant, les deux couleurs et les pièces clouées sont
  prises en compte. Les promotions et positions terminales gardent leur explication
  spécifique, sans ajout positionnel.
- Une propriété déjà présente n’est pas répétée. Une seule observation est retenue,
  par priorité : roi, colonnes, structure, développement, centre, mobilité.
  Cache local borné à 128 situations, avec historique et positions avant/après ;
  indépendant des scores et du moteur, pour éviter le recalcul à chaque info UCI.
- `PositionalPanel` sépare « Observation positionnelle » de la classification.
  Les repères complètent une cause tactique/matérielle dans un volet replié.
  « Voir le repère » ouvre deux étapes sur le plateau existant, avec des cercles
  bleus. « Comparer avec le coup proposé » est facultatif et repart du même
  historique ; scores exacts/finis, verdict exploitable et suites légales requis.
- `ExplanationLine.kind = "observation"` distingue ces démonstrations d’une PV.
  Le texte et la légende ne prétendent pas expliquer le raisonnement interne du
  moteur. Aucun de ces constats ne passe `MoveExplanation.concrete` à vrai.
  Les explications tactiques conservent leur priorité et leur fonctionnement.
- Limites explicites : des possibilités de mouvement ne sont pas des cases sûres ;
  elles sont calculées comme si le camp rejouait et omises pendant un échec. La
  couverture du roi ne compte que ses pions sur trois colonnes et deux rangées,
  sur une aile et avec une dame adverse ; ce n’est pas un diagnostic global de
  sécurité. La structure de pions ne mesure pas les compensations. Une FEN ne
  permet pas d’inventer un historique de développement.
- Validation : 27 nouveaux tests dans `positional.test.tsx`, 303 tests unitaires,
  322 tests avec ShallowRed/Stockfish, lint, TypeScript et build réussis. Chromium
  ciblé puis parcours complet validés : huit fixtures positionnelles, bureau/mobile,
  comparaison, orientation, préférences, retry caché, variante et dessins conservés.
- Branche synchronisée avec `main` à `8519c52` ; binaire release local vérifié.
- Les quatre lots validés sont terminés. Les limites ci-dessus sont des limites
  volontaires du modèle descriptif, pas des tâches laissées en cours.


## Corrections après retours sur les repères — 30 septembre 2026 (historique)

La sélection par bilan final de PV décrite ici est remplacée par le lot 5.

- Aucun bouton pour illustrer seulement un développement ou une case d’arrivée.
  Les repères utiles comportent une seule position, après le coup, sans rewind.
  Le panneau reste visible ; le bouton active/masque les cercles. Les flèches
  gardent la navigation dans la partie/variante, et la fermeture conserve les dessins.
- Les observations sont toujours dans un complément replié après les actions.
  L’absence de cause identifiée reste explicite. La mobilité montre toutes les
  nouvelles destinations légales, sans les annoncer comme sûres.
- La perte ou le gain matériel est maintenant calculé sur la PV entière validée,
  et non sur les huit demi-coups d’affichage. La démonstration s’étend jusqu’aux
  changements matériels utiles. L’alternative est comparée depuis la même origine,
  y compris pour un gain manqué sans perte. Une occasion secondaire ne supplante
  pas une perte matérielle déjà identifiée. Les promotions jugées mauvaises ne sont
  plus justifiées par le seul gain immédiat de la promotion.
- Scores non finis/bornés, PV incohérentes, reprise immédiate en fin de suite et
  sacrifices approuvés gardent leurs protections. Pas de modification du moteur,
  ni de recherche UCI supplémentaire. Comparer les PV existantes ne résout pas
  toutes les causes positionnelles ; les recherches comparatives de la checklist
  et la refonte complète des commandes de démonstration restent à faire.
- Validation : 327 tests avec ShallowRed/Stockfish, lint, TypeScript et build ;
  contrôle navigateur ciblé réussi (repères directs, absence de boutons inutiles,
  orientation, clavier, dessins, retry, gain/perte au-delà de huit demi-coups).
