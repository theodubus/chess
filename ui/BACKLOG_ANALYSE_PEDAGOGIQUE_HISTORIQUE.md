# Historique du premier prototype pédagogique — remplacé

Ces notes décrivent des implémentations livrées, pas une qualité pédagogique
validée. Le retour utilisateur du 2 octobre invalide leur statut de chantier
« terminé ». La backlog active est `BACKLOG_ANALYSE_PEDAGOGIQUE.md`.

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

Validation du 2 octobre : 337 tests avec ShallowRed/Stockfish, lint, TypeScript
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


# Archive du plan A–E au 4 octobre 2026

Le texte suivant conserve le plan et le journal avant séparation du périmètre actif. Les statuts datés restent historiques ; le plan actif fait autorité pour la suite.

# Analyse pédagogique — backlog active et plan de reprise

Plan révisé le 2 octobre 2026 après les retours de Théo, suivi au 4 octobre.
Périmètre : `ui/**`.
**Chantier ouvert. L’objectif pédagogique n’est pas atteint.** Le moteur Rust
reste inchangé ; l’UCI est l’unique interface moteur.

## Périmètre stable et critères de sortie — révision du 4 octobre

Retour de Théo : la backlog doit converger, pas s'allonger avec chaque position.
Le plan A–E ci-dessous est un inventaire historique des besoins, **pas une liste
dont chaque case ouverte déclenche automatiquement un nouveau détecteur**.
Une régression teste un contrat commun ; elle ne devient pas une extension de
produit par défaut. Ne pas transformer les inconnus de l'audit en une liste de
126 cas particuliers à faire reconnaître.

**Premier jalon livrable : conséquences tactiques courtes expliquées honnêtement.**
Ce périmètre ne promet pas une analyse pédagogique générale comparable à Chess.com.
Les familles négatives raccordées restent figées pour ce jalon. La migration des
occasions favorables réutilise les fourchettes/clouages déjà modélisés ; elle
n'ouvre pas une série de nouveaux motifs pour remplir chaque trou du corpus.

Travail fini pour ce jalon quand :

- [ ] Le lot de pièce exposée est validé, publié et sa CI réellement lue.
- [ ] Les occasions favorables des mécanismes existants utilisent leur propre
  conséquence vérifiée ; pas une seule mauvaise alternative présentée comme preuve
  du meilleur coup. Les reprises gardent le contexte de l'échange existant.
- [ ] Texte, repère et bilan de ces parcours lisent les mêmes faits ; comparaison
  facultative, départ après le coup, reprises utiles conservées, pas de phrase
  positionnelle de remplacement lorsqu'une cause manque.
- [ ] Une relecture des exemples positifs/négatifs vérifie la pertinence, séparément
  de la CI et de la légalité. Les abstentions et délais restent dans les rapports.
- [ ] Le parcours réel de revue est contrôlé visuellement ; l'absence de navigateur
  ne permet pas de cocher cette validation sur la seule base d'un rendu statique.
- [ ] Un bilan final publie couverture et limites du périmètre figé, sans changer
  le dénominateur ni réétiqueter un inconnu comme explication réussie.

**Au-delà du jalon : décision de produit/recherche distincte.** Activité utile,
structure, sécurité durable du roi, compensations positionnelles, combinaisons
longues et attribution générale du verdict restent des besoins réels. Leur prise
en charge exige un modèle causal et une évaluation supplémentaires. Ne pas les
déclarer livrés parce qu'une pièce est développée, ni les ajouter automatiquement
à la fin du lot précédent. Si l'objectif devient une explication générale de la
majorité des erreurs, discuter explicitement architecture et validation ; les
seules PV/évaluations UCI ne fournissent pas ces raisons.

## Ce qui est réellement disponible

- Une UI de revue, exploration, retry et démonstrations utilisable et testée.
- Une première couche d’explications (`explanations.ts`, `tactics.ts`,
  `decisionCause.ts`) à portée limitée, parfois trompeuse malgré ses vérifications.
- Des recherches annulables et mises en cache (`FocusedAnalysis`, `LiveStudy`).
- Premier raccordement des conséquences matérielles adverses confirmées :
  fourchette/défenseur échangé, retraite fermée puis attaque, défense retirée,
  ligne ouverte, défenseur détourné par une reprise et menace ignorée. Texte et
  illustration racontent le coup joué ; aucune alternative obligatoire. Les
  causes historiques négatives sont écartées sur ce parcours. La couverture
  positionnelle et la validation sur un échantillon neuf restent ouvertes.
- Mats adverses courts confirmés puis prouvés contre toutes les réponses légales
  dans un horizon borné ; illustration sans remplacement obligatoire. Les mats
  plus longs et une attribution positionnelle générale restent ouverts.
- Des tests logiciels et un parcours navigateur. Ils ne constituent **pas** une
  mesure de pertinence pédagogique. Les anciens lots « terminés » restent dans
  `BACKLOG_ANALYSE_PEDAGOGIQUE_HISTORIQUE.md` comme historique de livraison.

Ne pas ajouter de nouvelles familles de phrases dans `decisionCause.ts` pour
répondre à chaque capture utilisateur. Construire le prototype suivant séparément,
sous `src/review/understanding/`. Le premier contrat négatif est raccordé le
4 octobre après les retours et la validation des textes par Théo ; les autres
familles restent séparées jusqu'à validation. Un cas reconnu n’est pas une preuve
de couverture générale.

## Objectif mesurable

L’explication doit permettre de comprendre **ce que la décision change** et
**comment ce changement est exploité**. Pour un mauvais coup : montrer directement
la menace adverse et les reprises nécessaires au bilan, même sans coup de
remplacement. Une autre décision est une comparaison facultative ; elle ne
doit ni remplacer l'explication du coup joué ni être désignée comme seul bon choix.
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

**Correction de contrat demandée le 3 octobre :** une alternative moins bonne
ne prouve pas que le coup étudié était nécessaire ou optimal. Les premières
illustrations favorables expliquent un mécanisme, pas un classement global.
Plusieurs bonnes réponses peuvent coexister ; les explications de mauvais coups
doivent pouvoir montrer fourchette, défense retirée et perte après reprises
sans se contenter de proposer le premier choix du moteur.

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
- [x] Nouvel échantillon amateur : trois parties / 202 demi-coups, sélection
  fixée avant recherche moteur dans l'archive CC0 Lichess de janvier 2013,
  empreinte d'archive et ordre conservés. Pas d'attente pédagogique générée
  depuis les sorties du moteur ; relecture indépendante encore manquante.

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
- [x] Premier détournement d'un défenseur par une reprise : deux attaquants,
  deux victimes et défenseur suivis ; reprise sur la seconde case auparavant
  légale, devenue hors de portée. Exposition préexistante et défense conservée
  refusées. Les autres formes de surcharge restent ouvertes.
- [x] Reprise devenue illégale malgré l'alignement conservé : clouage absolu
  du défenseur devant son roi, attaque réellement découverte par la reprise
  géométrique, distinction avec les mouvements légaux sur le clouage et les
  alignements relatifs. Faits et brouillons construits, pas couverture confirmée.
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

- [x] Détournement par reprise confirmé aux deux budgets : réponses libres
  après la première prise et la reprise ; bilan depuis la décision et compensation
  conservés. Le témoin assemblé doit aussi conserver le bilan de la PV initiale
  fraîche. Huit recherches au plus pour cette famille, pas de reprise forcée.
- [x] Mat adverse en un à trois coups : annonces libres avant/après à deux
  budgets et preuve légale de toutes les réponses dans l'horizon annoncé,
  au plus 1 200 nœuds. Borne, défense échappant au mat, annonce préexistante
  ou score incohérent empêchent le récit. Aucune alternative ni optimalité.
- [x] Conséquence directe d'une retraite fermée : menace fraîche, défense libre,
  même victime, capture sur place/prise de l'attaquant/sortie déjà exposée, puis
  bilan depuis la décision. Deux lignes peuvent différer si chacune démontre le
  même mécanisme et bilan. Compensation, retraite rouverte ou lien absent refusés.
  Aucune alternative ou affirmation de perte contre toutes les défenses.
- [x] Séparer conséquence du coup joué et comparaison facultative : vérifications
  directes de fourchette/clouage et défense retirée/ligne ouverte. Même menace,
  bilan et clôture retrouvés aux deux budgets ; aucune obligation de proposer
  un autre coup. Ce sont des conséquences dans les variantes, pas une preuve
  d'optimalité ou de perte contre toutes les défenses.
- [x] Pour une perte permise, ne pas valider l'alternative par la seule menace
  conditionnelle : contrôler sa réponse libre. Une autre fourchette/perte ou un
  témoin incomplet écarte la comparaison, sans effacer l'effet réel du coup joué.

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
- [x] Premiers contrastes de double attaque et clouage : deux cibles suivies
  ensemble, échange complet séparé de la prise suivante et défenseur échangé
  identifié ; retraite nouvellement légale réellement choisie sous une pression
  inchangée. Comparaisons libres à deux budgets, compensations et divergences
  conservées. Les parties publiées ne donnent pas encore une cause soutenue stable.
- [ ] Généraliser aux autres mécanismes : victime déplacée, défenses/attaques
  combinées plus longues, surcharge, compensation et mats plus longs. Aucun second choix moteur
  inventé ; comparer les défenses et compensations, pas une capture locale seule.
- [x] Faits séparés de pièce jouée puis capturée, avec promotion et prise en
  passant ; premier épisode d'échange distinct du bilan de la suite. Le cas
  neutre Qd5/Qxd5/Rxd5 suivi d'une autre perte ne devient pas une cause locale.
- [x] Raccordement et première mesure de cette perte directe : contrôles
  communs avec la menace ignorée, alternative libre, épisode local clôturé négatif
  et bilan total négatif. Garder les issues de mat séparées des centipions.
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
- [x] Vérificateurs bornés (dix recherches au plus dans les comparaisons isolées,
  quatorze pour les deux candidats de la revue), budgets par défaut 300/900 ms, plafond global
  12 secondes incluant les connexions ; arrêt, cache moteur/révision/historique,
  rejet des réponses tardives, coûts et réutilisation du cache mesurés.
- [x] Essais réels ShallowRed/Stockfish, avec différences conservées dans le
  rapport de test. Les abstentions ne sont pas comptées comme explications justes.
- [x] Premier ordre de candidats adverses et déclenchement au coup consulté dans E ;
  au plus deux candidats. Restent les autres familles et la mesure de couverture.

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

- [x] Première idée structurée pour fourchette, défenseur échangé, clouage et
  déviation courte : décision → changement → exploitation → différence avec
  l’alternative. Brouillons logiciels, sans activation ni validation pédagogique.
- [x] Motif bénéfique routé comme secondaire quand le verdict est négatif ; une
  candidature à la raison principale n'est pas une preuve. Reprises consécutives
  situées dans l'épisode antérieur, bilan global séparé du bilan de la reprise.
  Reste à généraliser aux séquences avec coups intermédiaires et compensations.
- [x] Pour ces premières familles, texte issu des preuves soutenues ; aucun texte
  causal après abstention. Si le début de l'échange manque, son bilan global n'est
  pas inventé. Les échecs et compensations restent dans le témoin complet.
- [x] Premier plan minimal pour ces familles : départ après la décision, mat en
  deux demi-coups, alternative bloquée en une position. Un choix calme final peut
  être indiqué sans nouvelle position ; capture/promotion/échec jamais retirés.
- [x] Aperçu de relecture séparé : instantané UCI réel, navigation coup/alternative,
  retour explicite au coup étudié et provenance de chaque étape. Aucun menu ajouté
  à la partie. Les abstentions y restent visibles.
- [x] Brouillons négatifs indépendants d'une comparaison, bilans après reprises,
  contexte d'échange antérieur conservé, comparaison masquée si non confirmée.
  Régressions de deux camps, deux défenses différentes du même mauvais coup,
  fausse défense permettant une autre fourchette, compensation et preuve périmée.
- [x] Théo valide la clarté des textes montrés le 3 octobre. Il corrige ensuite
  leur portée : expliquer le mécanisme n'est pas démontrer le meilleur coup.
  Cette relecture ne valide ni tous les nouveaux cas négatifs ni la couverture générale.
- [ ] Vérifier sur le corpus la pertinence de la phrase ET de l’illustration,
  au-delà des seuls tests de légalité et de scores.

### E. Intégration progressive dans la revue — EN COURS

- [x] Préparer l'extraction coopérative, annulable, avec cache borné par revue,
  révision, moteur, historique et PV, progression par phase et délai. Même résultat
  que le synchrone sur 31 décisions ; méthodes chess.js conservées, cache immuable.
  Les primitives indivisibles peuvent dépasser la tranche cible ; ce n'est pas
  un Worker et aucune promesse de durée d'image n'est faite.
- [x] Premier raccordement des conséquences adverses matérielles courtes :
  fourchette (dont défense échangée), retraite fermée puis attaque, clouage absolu exploité, défense retirée,
  ligne ouverte, seulement si les deux recherches confirment le mécanisme et le
  bilan après reprises. Pas d'activation des brouillons favorables/comparatifs.
- [x] Raccordement séparé des mats adverses courts : calcul annulable, origine
  moteur/règles, départ après la décision et repère du mat. Les autres mats
  restent inconnus ; ne pas lire cette case comme une couverture du roi en général.
- [x] Reprise détournant un défenseur raccordée : deux réponses supplémentaires
  libres, bilan de la première reprise et bilan final séparés, revalidation du
  brouillon coopérative et annulable. La perte n'est pas dite forcée.
- [x] Coup consulté uniquement, signalement du calcul, cache/annulation et
  préférences. Même navigation de démonstration et variantes ; retry masqué
  ne transmet aucune demande. Un changement de PV/score, même sans changement de
  révision, invalide résultat et démonstration.
- [x] Anciennes causes négatives désactivées sur ce parcours ; les variantes
  libres et observations restent secondaires. Pas de deuxième raison concurrente.
- [x] Retirer le faux « nouvel échange gagnant » du parcours d'une reprise connue.
  Observation de l'historique et de la variante, bilans séparés et bilan ouvert
  quand une reprise manque. Note raccordée au rendu de la revue ; mat légal gardé.
- [ ] Raccorder les motifs favorables vérifiés sans prétendre prouver l'unique
  meilleur coup. Les autres prises du parcours favorable restent à migrer.
- [ ] Tester des parties complètes (humain/bot, deux humains, import PGN) et le
  parcours bureau/mobile. Mesurer latence et couverture avant/après.
- [x] Premier audit logiciel de trois PGN amateurs complets avec les deux moteurs :
  202 demi-coups, 126 décisions moteur × partie défavorables, sept conséquences
  soutenues, 117 raisons inconnues et deux calculs refusés. Filtres de moments
  humain/bot et deux camps, histoire des repères et restitution du résultat testés.
  Ce n'est pas un parcours visuel ni une mesure de pertinence indépendante.
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

## Livraison intermédiaire — mats courts et audit, 4 octobre 2026

- Mat adverse borné en un à trois coups raccordé à la revue : confirmation UCI
  aux deux budgets, toutes les réponses légales vérifiées, première étape après
  le coup, repère du roi maté et camp explicitement nommé. Limite, préexistence,
  score divergent, histoire tronquée et preuve altérée refusés. Moteur inchangé.
- Audit réel des trois parties amateurs et diagnostics par contrôle, aperçu
  de relecture conservant les cas inconnus. `AMATEUR_AUDIT.md` donne les résultats
  et limites : sept conséquences soutenues sur 126 décisions moteur × partie,
  aucune relecture indépendante. L'ancien affichage « concret » n'est pas une
  mesure de vérité pédagogique. La backlog n'est pas terminée.
- Validation locale : **693 tests unitaires / 54 fichiers**, **99 tests pont et
  moteurs / 10 fichiers**, ShallowRed et Stockfish 16. Le rapport ne doit pas
  être régénéré pendant ses tests de lecture ; les deux tests touchés par cette
  concurrence ont été relancés sur l'instantané fini. Contrôles finaux ciblés,
  lint, TypeScript et build réussis. Vite compile et sert l'aperçu ; aucun contrôle
  visuel n'est annoncé sans navigateur. Avertissement de bundle >500 ko conservé.
- Commit `125d426` publié sur la PR #111. CI réellement lue : UI
  [37191342827](https://github.com/theodubus/chess/actions/runs/37191342827),
  Rust PR [37191342825](https://github.com/theodubus/chess/actions/runs/37191342825)
  et Rust push [37191341038](https://github.com/theodubus/chess/actions/runs/37191341038)
  réussis sur ce SHA. Continuer les contraintes composées et les raisons hors
  gain matériel immédiat ; cette validation ne clôt pas la backlog.

## Défenseur détourné par la reprise — 4 octobre 2026

- Faits coopératifs, deux attaquants et défenseur commun suivis par identité,
  questions libres à deux budgets, bilan depuis la décision et compensation.
  Une PV de reprise tronquée ne masque pas la compensation de la PV initiale.
  Le score avant le coup ne chiffre pas ce bilan : annonce de mat antérieure
  conservée, aucune conversion en points ni attribution du classement global.
- Texte et repère issus de la revalidation des réponses ; quatre positions dans
  les exemples sans compensation. La reprise poursuit l'échange ; son gain
  local ne devient pas un nouvel échange gagnant. Même navigation de revue,
  aucune alternative obligatoire. Calcul du brouillon également coopératif.
- Six essais réels, ShallowRed et Stockfish 16 : quatre brouillons soutenus
  (blanc/noir), deux abstentions sur le cas construit avec compensation.
  Questions, scores, variantes et empreintes conservés dans
  `dev/diverted-defence-data.json` ; aperçu
  `/dev/pedagogy-review.html?sample=diversion`. Coûts locaux 2,3–7,1 s ; ce n'est
  ni une garantie de latence ni une mesure de pertinence ou de couverture.
- PV Stockfish continuant après une nulle par matériel insuffisant : hypothèses
  de revue désormais bornées à huit demi-coups et première fin de partie, cas réel
  exécuté puis testé. Aucune règle modifiée dans le moteur.
- Validation : **721 tests unitaires / 57 fichiers**, **105 tests pont/moteurs /
  10 fichiers**. Lint, TypeScript et build réussis. Trois anciens tests ont
  dépassé cinq secondes sous forte concurrence ; suite entière relancée à deux
  workers et réussie, sans augmenter leurs délais. CI du prochain commit à relire.
- Contraintes encore alignées mais devenues illégales (clouage du défenseur),
  autres surcharges, compensations positionnelles et validation pédagogique
  indépendante encore ouvertes. L'audit amateur n'est pas recalibré, ses chiffres
  de faible couverture restent inchangés. Aucun contrôle visuel CUA ajouté.

## Point de reprise

- **Lot publié `6eb1630`, CI verte réellement lue** : UI
  [37193922307](https://github.com/theodubus/chess/actions/runs/37193922307)
  (unitaires/build et pont/deux moteurs), Rust PR
  [37193922324](https://github.com/theodubus/chess/actions/runs/37193922324), Rust push
  [37193920308](https://github.com/theodubus/chess/actions/runs/37193920308).
  Détournement d'un défenseur par une reprise. Faits,
  questions libres aux deux budgets, bilan total, compensation et revalidation
  du brouillon raccordés au contrôleur de revue. Deux camps et historique, reprise
  refusée, autre capture, PV tronquée masquant une compensation, défense conservée,
  preuve altérée, arrêt/cache/délai testés. Six essais réels conservés ; pas
  d'affirmation de couverture nouvelle ni de relecture visuelle indépendante.
- **Extension publiée `65cf072`, CI verte réellement lue** : UI
  [37196359861](https://github.com/theodubus/chess/actions/runs/37196359861), Rust PR
  [37196359850](https://github.com/theodubus/chess/actions/runs/37196359850), Rust push
  [37196356611](https://github.com/theodubus/chess/actions/runs/37196356611).
  Le défenseur reste
  géométriquement en prise sur la seconde pièce mais la reprise le cloue devant
  son roi. Même graphe de captures/reprises et clouage absolu ;
  refuser l'alignement relatif et la reprise encore légale. Positions avec un
  pion h2/h7 exécutées dans les deux camps, échanges Rxd8+/Kxd8 et miroir inclus.
  FEN blanche : `3rk3/5q2/1b6/RR6/8/3Q4/7P/3K4 w - - 0 1`, Qd5,
  Qxd5+, Rxd5, Bxa5, Rxd8+, Kxd8, Kc2. Conserver les reprises après l'échec.
  Défenseurs tour/dame, deux camps, alignement relatif/reprise conservée et
  altération du cloueur : 14 tests dédiés. Une FEN relative plaçait déjà le roi
  hors trait en échec ; corrigée, réexécutée et contrôle ajouté à tous les exemples.
  Douze essais libres gardés dans `dev/pinned-defence-data.json`, **aucune nouvelle
  conséquence soutenue** : les moteurs choisissent une autre première prise/suite,
  la relation ne se confirme pas ou le score/PV est inutilisable. L'abstention est
  affichée dans `/dev/pedagogy-review.html?sample=pin`. Ne pas forcer cette famille
  en calibrant les attentes sur ses propres variantes.
  Validation : 736 tests unitaires / 58 fichiers ; les 24 tests de raccordement
  réels remplacent les 20 précédents et passent, portant le pont/moteurs à 109
  tests / 10 fichiers. Total 845 tests, lint/types/build réussis.
- **Lot terminé localement — contexte des reprises favorables** : les coups favorables
  passent encore par `decisionCause` et son texte « commence un échange ... gain ».
  Une reprise peut y être faussement présentée comme un nouvel échange gagnant.
  Corriger le routage, avec observation contextualisée de l'épisode et bilan
  avant/depuis la reprise. Garder l'observation distincte d'une preuve du meilleur
  coup ; ne pas rajouter une nouvelle famille de phrases dans l'ancien explicateur.
  `recaptureObservation` réutilise le bilan d'épisode sans reconstruire les
  identités tactiques. Une reprise connue coupe le routage vers l'ancien
  explicateur ; elle conserve les variantes et une note de contexte, sans
  candidat ni nouvelle recherche moteur. Début FEN inconnu, reprise encore
  possible et PV incohérente ne produisent pas de bilan total inventé. Le mat
  immédiatement joué conserve sa preuve légale. Promotion, prise en passant,
  deux camps et historique complet exécutés avant les tests. Douze tests dédiés,
  un raccordement SSR dans la vraie revue. Les 748 autres contrôles de la suite
  et les 19 tests ciblés finaux passent ; lint/types/build réussis. Un échec de
  lecture provenait d'une édition pendant le lancement des tests : relance ciblée
  avec fichiers stabilisés. Pas de validation visuelle déclarée. Publié
  `3222f76`, CI verte réellement lue : UI
  [37198017888](https://github.com/theodubus/chess/actions/runs/37198017888), Rust PR
  [37198017903](https://github.com/theodubus/chess/actions/runs/37198017903), Rust push
  [37198014994](https://github.com/theodubus/chess/actions/runs/37198014994).
- **Suite autonome** : vérifier le rendu de cette note dans la revue puis traiter
  les menaces déjà présentes auxquelles le mauvais coup ne répond pas. Le modèle
  actuel demande surtout un nouvel effet ; une menace ignorée mérite une autre
  hypothèse, avec perte visible vérifiée et défense possible. Une défense comparée
  peut montrer que la perte était évitable, jamais prouver son unicité ou que le
  moteur avait couvert toutes les alternatives. Coups favorables sans reprise,
  compensation longue et raisons positionnelles restent ouverts.
- **Lot publié `e833699` — menace ignorée** : modèle séparé `ignoredThreat`,
  avec même attaquant/victime restés sur les mêmes cases et mêmes reprises légales
  avant/après le coup. Trois recherches libres par budget : décision, coup joué,
  défense. Perte courte identique, même défense préservant la pièce et préférence
  dans le même sens nécessaires. Ni attaque nouvelle, ni retrait de défenseur,
  ni mat converti en points. Revalidation coopérative du texte et des images ;
  raccordement au seul coup consulté, après les autres candidats, deux maximum
  et quatorze recherches maximum conservés. Dix-neuf tests de contrat, deux
  contrôles du parent et un rendu SSR de la revue passent ; lint/types/build.
  Premier essai réel : zéro sortie soutenue ; l'exigence de scores CP distants
  d'au plus 100 rejetait pourtant le même échange et le même sens de préférence.
  Le contrat compare désormais cette préférence aux deux budgets et la stabilité
  des faits matériels, sans attribuer le nombre CP au mécanisme. Une inversion
  de préférence est toujours refusée. Huit essais réels suivants : quatre
  conséquences soutenues (captures de tours, deux camps × deux moteurs), quatre
  abstentions (historique : défense non préservée/autre menace ; compensation).
  Les deux rapports sont conservés, sans compter cette itération sur ses propres
  exemples comme amélioration indépendante. Aperçu `?sample=ignored`.
  Audit des trois PGN amateurs terminé avec leurs évaluations précédentes dans
  `dev/pedagogy-audit-ignored-data.json`, baseline originale conservée et test du
  second instantané après sa fin. Même 126
  décisions : sept soutenues, 118 non confirmées, une indisponible ; 21 contrôles
  de menace ignorée, zéro soutenu. Pas de gain de couverture indépendante affirmé.
  Validation : 772 unitaires / 61 fichiers, test supplémentaire du second audit
  et 14 tests des fondations suivants, soit 787 unitaires / 63 fichiers vérifiés.
  Pont/moteurs : 115 contrôles passent dans la suite complète ; deux échecs de
  raccordement corrigés et rejoués avec succès (branche comparée possible aussi
  sur un ancien exemple ; délai partagé épuisable sur l'historique complexe, arrêt
  et absence de publication explicitement vérifiés). 117 contrôles / 10 fichiers
  au total, 904 tests vérifiés. Lint/types/build passent. CI verte réellement lue :
  UI [37200202913](https://github.com/theodubus/chess/actions/runs/37200202913),
  Rust PR [37200202663](https://github.com/theodubus/chess/actions/runs/37200202663),
  Rust push [37200199750](https://github.com/theodubus/chess/actions/runs/37200199750).
- **Lot en cours — pièce déplacée vers une capture** : la pièce qui vient elle-même d'être déplacée
  vers une capture est exclue des relations avant/après actuelles. Factoriser la
  vérification de perte directe pour une menace inchangée ou une pièce déplacée,
  avec identité suivie, capture réellement utilisée, réponses libres, bilan de
  l'épisode local ET bilan total. Ne pas expliquer une première capture neutre
  par une perte distante d'une autre pièce. Réponses comparées avec victime
  échangée mais compensée, mats et raisons positionnelles restent ouverts.
  Fondations écrites séparément :
  `movedPieceExposure` (identité de la pièce jouée/capturée, promotion et prise en
  passant) et `captureEpisode` (premier échange, compensation choisie à la place
  d'une reprise, échec non résolu, bilan depuis avant la décision). Huit tests de
  faits et six tests d'épisode passent. La prise d'une tour par une dame puis
  reprise coûte quatre points ; une promotion prise coûte un point ; Qd5/Qxd5/
  Rxd5 reste neutre avant la perte ultérieure par Bxa1. Tous exécutés avant tests.
  `MOVED_PIECE_EXPOSURE.md` fixe les refus nécessaires. Factorisation maintenant
  implémentée localement : `CaptureLossVerification` et `captureLossDraft`
  revalident les questions et les épisodes avant texte/repères. Famille raccordée
  au parent, avec même délai/cache/annulation et limites de candidats/recherches.
  Deux issues de mat du même camp ne deviennent pas une préférence matérielle ;
  une alternative immédiatement terminale ne lance pas de moteur. Une annonce
  adverse plus longue n'empêche pas un récit d'échange court, sans affirmer que
  cet échange prouve ou explique le mat entier. Dix sorties soutenues sur les
  18 essais construits réels, six sur les 16 premiers avant prise en compte
  qualitative des mats. Les deux instantanés conservent leurs abstentions et
  questions ; rendu SSR et revalidation des preuves altérées testés. L'audit
  suivant des mêmes trois PGN donne onze sorties soutenues, 111 inconnues et
  quatre indisponibles. Trois sorties sont la nouvelle famille, une autre est
  une ancienne famille désormais confirmée dans ce calcul. Les délais épuisés
  restent comptés ; pas de pourcentage de pertinence déduit de la présence de texte.
  Suite complète et contrôles finaux en cours.
  Aucun contrôle visuel, aucune nouvelle validation indépendante présumés.
- **Lot autonome suivant préparé** : `FAVOURABLE_CONSEQUENCE.md` fixe la migration
  des occasions tactiques favorables vers une conséquence de leur propre coup,
  sans comparaison imposée ni prétention de meilleur choix/choix unique. Deux
  recherches libres, même motif et bilan après reprises ; une reprise connue
  conserve sa note d'échange. Implémenter, mesurer, puis relire le parcours.
- **Audit terminé** : trois parties amateurs complètes avec
  `dev/pedagogy-audit.mjs`, revue réelle, verdicts réels, ancien affichage et
  nouvelles conséquences séparés. Les sorties ne sont pas des vérités attendues.
  Navigateur CUA revérifié : aucune surface disponible, donc aucune validation
  visuelle bureau/mobile annoncée. Continuer après cet audit sur les lacunes
  observées et préparer les exemples concrets à relire.
- **Résultat et suite** : `AMATEUR_AUDIT.md` et aperçu
  `/dev/pedagogy-audit.html`. Couverture encore très faible : 103 cas CP sans
  candidat. Après validation du détournement par reprise, poursuivre les contraintes
  de défense combinées puis les raisons sans gain matériel immédiat. Garder
  le bilan global et ne pas prétendre qu'un choix moteur était forcé.
- **Consigne reconfirmée le 4 octobre** : continuer sans arrêter à la fin d'un
  lot tant qu'il reste du travail autonome ; arrêt seulement à l'achèvement,
  un arbitrage humain concret ou une limite de session. Après les retraites
  fermées : preuve bornée des mats permis par un mauvais coup, puis audit du
  parcours sur des parties complètes et élargissement du corpus. Ne pas confondre
  vérification logicielle, preuve légale courte et pertinence pédagogique générale.
- Reprise autonome autorisée le 3 octobre : poursuivre jusqu'à besoin d'arbitrage
  humain, limite de session ou achèvement. Théo valide les textes des exemples le
  3 octobre (« les textes sont bons »). Il demande si l'alternative est le mauvais
  coup : clarification des libellés « Coup joué / Autre coup comparé », avec le
  rôle de la comparaison explicité. Cette validation des exemples ne mesure pas
  la généralisation et ne complète pas à elle seule les critères A/C/D.
- Branche actuelle : `codex/ui-polish`, PR #111 ouverte au début de cette reprise.
- Dernier lot : brouillons/repères de quatre familles, contexte des reprises,
  aperçu de relecture et extraction optimisée. Voir la livraison ci-dessous.
- **Dernier travail concret** : conséquences négatives séparées de la comparaison,
  deux bonnes défenses possibles sans choix unique, contrôle de l'alternative libre
  et extraction coopérative. Les textes et repères négatifs ne dépendent plus du
  succès d'une recherche d'autre coup. Voir la livraison ci-dessous.
- **Dernier raccordement le 4 octobre** : Théo demande de poursuivre sans
  nouvel arbitrage. Premier raccordement des conséquences
  matérielles négatives déjà vérifiées à la revue et aux variantes : calcul au
  coup consulté, progression, cache/annulation, retry sans fuite, même navigation
  de démonstration, aucune alternative obligatoire ni classement par le motif.
  Les anciennes causes négatives ne sont plus calculées sur ce parcours.
  Tests du contrôleur, de la conversion, du rendu statique et des deux moteurs.
- **Ensuite** : compléter l'échantillon de contrôle négatif,
  contraintes combinées/coups intermédiaires et compensation, puis les autres
  raccordements E et le parcours visuel. Ne pas transformer ces régressions construites en validation
  indépendante. La clarté des exemples initiaux est validée ; garder les cas
  sans cause et les limites de couverture visibles.
  Pour …Ca4, traiter la compensation et distinguer la pression tactique du
  gain matériel immédiat ; la cause du verdict reste inconnue quand le bilan
  matériel est compensé. Ne pas inventer une phrase pour augmenter la couverture.
- **Retraite fermée raccordée le 4 octobre** : `RestrictionEffectVerification`,
  `restrictionDraft` et contrat `RESTRICTION_VERIFICATION.md`. Menace fraîche,
  défense libre, bilan avant décision et capture liée à la même pièce ; texte
  et repères dans la revue sans alternative obligatoire. Prise sur place,
  prise de l'attaquant puis reprise et sortie déjà exposée (avec échanges
  préparatoires) traitées. Deux lignes peuvent confirmer le mécanisme sans avoir
  exactement la même prise. Contre-épreuves compensation, pièce sauvée, retraite
  rouverte, perte éloignée et autre victime ; cache/annulation/périmés testés.
  ShallowRed/Stockfish 16 soutiennent Dd2/…f4 et sa transformation noire à
  300/900 ms ; l'aperçu à 200/600 ms garde l'abstention Stockfish noire.
  Relecture visuelle et échantillon indépendant toujours manquants.
- Corpus construit : 12 hypothèses principales reconnues sur 12 attentes connues.
  Corpus publié : 4 sur 11 (deux échanges, double attaque, déviation), sept idées
  manquantes. Les deux corpus restent à zéro explication publiable. Le second a
  désormais servi au développement ; l'activation logicielle limitée ne change
  pas ces métriques pédagogiques. Il faut un échantillon neuf et une relecture
  indépendante pour mesurer la généralisation.
- Le motif principal d'une combinaison doit rester distinct d'un échange local.
  Le mat de la déviation est à montrer en deux demi-coups après la décision ;
  la meilleure défense peut différer de la suite du PGN (Dxc3 plutôt que Fxb6
  après …Fe6). Une vraie compensation positionnelle ne se prouve pas par un
  détecteur de capture supplémentaire. La pression sans perte immédiate reste
  inexpliquée dans le premier raccordement.
- Restent aussi les contraintes combinées plus longues, les mats plus longs,
  compensations différées et démarrages moteur par question. L'extraction est
  réduite (31 décisions : 15,94 → 3,13 s localement, faits identiques), puis rendue
  coopérative et annulable hors rendu. Une primitive indivisible peut encore
  dépasser une tranche cible ; aucun engagement de durée d'image.
- Démarrage autorisé : A, puis les primitives de B avec un rapport exécutable.
  L’UI conserve le détecteur historique pour les autres parcours. Ne pas annoncer
  que l’analyse utilisateur générale est déjà corrigée.
- Exemple réel central : `Dd2` occupe une retraite du fou e3, puis `…f4` attaque
  ce fou. Source : captures utilisateur du 2 octobre. FEN reconstruite, sans
  inventer le PGN antérieur ; trait, horloges FEN et dernier déplacement documentés.
- Autre régression : C×F, P×C, D×P ; distinguer échange global à −1 pion et
  reprise utile. La position concrète construite doit être annoncée comme telle.
- Les prochaines notes doivent préciser fichiers, commandes, résultats et ce
  qui reste non implémenté ; cocher uniquement les livrables effectivement validés.

## Retraite fermée : conséquence directe dans la revue — 4 octobre 2026

- `RestrictionEffectVerification.ts`, `restrictionDraft.ts` et
  `RESTRICTION_VERIFICATION.md` : fermeture par le bloqueur déplacé, menace fraîche,
  défense libre, suivi de la même victime et bilan global après reprises.
  Capture sur place, prise de l'attaquant/reprise et sortie déjà exposée peuvent
  soutenir le même mécanisme. Chaque passe garde son lien physique, même si les
  captures diffèrent. Aucune alternative obligatoire ou unicité du bon coup.
- `PedagogicalAnalysis` raccorde cette famille au coup consulté, avant les
  relations plus générales, dans la limite de deux candidats et 12 s. La menace
  initiale ne consomme pas le seuil des coups calmes du témoin ; plusieurs coups
  calmes suivants abandonnent toujours la démonstration. Le bilan commence avant
  la décision pour inclure ses prises éventuelles, pas seulement après l'attaque.
- Vingt régressions du nouveau vérificateur, dont couleurs inversées, compensations,
  défense par une autre pièce, retraite rouverte, échange préparatoire, autre
  victime, reprise pendante, score/menace instable, cache, arrêt, réponse bornée
  et preuve falsifiée/périmée. Nouveau rendu statique dans la revue et quatre
  raccordements UCI réels. Scores simulés dans les fixtures ; les tests ne
  mesurent pas la qualité du classement des coups ni la couverture générale.
- ShallowRed et Stockfish 16 soutiennent Dd2/…f4 et la transformation noire dans
  les essais réels 300/900 ms (environ 4–7 s, première évaluation exclue).
  L'instantané de relecture 200/600 ms confirme le cas blanc avec les deux et
  le noir avec ShallowRed ; Stockfish noir reste indéterminé. Les quatre cas
  complètent les 22 exemples antérieurs, conservés avec leur date de mesure.
  Origine capture utilisateur/transformation explicitée dans l'aperçu.
- Validation locale : **754 tests / 60 fichiers** avec les deux binaires, deux
  workers ; lint, TypeScript et build réussis. Avertissement Vite >500 kB conservé
  sur le module de revue. Aucun fichier moteur modifié.
- Restent ouverts : échantillon neuf et relecture indépendante, parcours visuel
  bureau/mobile (CUA indisponible), compensations positionnelles/différées,
  contraintes plus longues et motifs de finale. Ce lot ne termine pas A–E et ne
  transforme pas ces cas de développement en validation pédagogique générale.

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

## Doubles attaques et clouages comparés — 3 octobre 2026

- `tacticalEvidence.ts` suit les cibles ensemble, le bilan complet du camp,
  les reprises disponibles et le choix réel. `targetExchange` distingue le
  premier échange de la prise suivante. Une compensation immédiate, une reprise
  pendante, un mat/nulle ou la limite de huit demi-coups empêchent une fausse
  conclusion matérielle. Le préfixe de menace adverse reste limité à un coup.
- `tacticalObservation.ts` n'utilise que la première capture après la réponse
  libre. Le cavalier de la fourchette doit capturer une cible originale ; une
  autre prise ne suffit pas. Un échange égal peut enlever un défenseur et permettre
  une autre capture, mais ce lien doit être retrouvé entre les mêmes pièces/cases.
  Seule la première prise du camp après l'échange est examinée, sans scénario tardif.
- `tacticalContrast.ts` vérifie une alternative gardant une seule menace sur les
  cibles originales, puis leur préservation. Pour le défenseur échangé, la même
  capture doit permettre une reprise réellement choisie par le défenseur conservé.
  Pour le clouage, victime/roi/pression/reprises restent identiques et la retraite
  nouvellement légale est choisie. Une reprise du roi également restaurée fait
  refuser l'attribution au seul clouage.
- `TacticalVerification.ts` garde effet et contribution séparés, recherches
  libres avant/après/alternative explicite, questions conditionnelles distinctes,
  deux budgets, au plus dix recherches, cache moteur/révision/historique/alternative,
  arrêt et refus UCI partagés. Les questions de cause supplémentaires sont omises
  quand la perte initiale n'est pas soutenue. Les seuils de stabilité/gain en
  centipions restent des critères de développement, sans optimalité générale.
- `tacticalCases.ts` et les deux nouveaux fichiers de tests donnent **32 tests
  unitaires** : camps inversés, roi/tour ensemble, compensation ailleurs, reprise
  manquante, gain sans lien avec la fourchette, autre attaquant, pression changée,
  retraite/reprise non choisie, alternative illégale, scores divergents, cache et
  annulation. Les fixtures ont été exécutées avec chess.js ; leurs scores simulés
  ne valident pas la pédagogie.
- Six nouveaux essais réels via le pont : clouage construit, …Ca4 et Fg5 de
  Byrne–Fischer, chacun avec ShallowRed et Stockfish 16. Les deux soutiennent le
  clouage avec …Rd7 dxc6+ bxc6 (−2 pour les Noirs) et …Cb4 après Fd3. Ils préfèrent
  toutefois dxc6 dès la position initiale : Fb5 n'est pas annoncé meilleur coup.
  Les recherches publiées peuvent montrer Cxa4 plutôt que Da3, compenser par
  Fxe7 ou dépasser l'horizon avec une reprise encore disponible. Les premiers
  rapports mesurés restent indéterminés ; une borne UCI finale est refusée et
  contrôlée précisément. Ces abstentions ne sont pas des explications correctes.
- Mesures des premières traces : environ 3–4,5 s sur le clouage, 6–9,5 s sur
  les comparaisons historiques, hors extraction, selon moteur/branche. Ce ne sont
  pas des garanties de latence ; les questions inutiles ont ensuite été omises.
- Contrat : `TACTICAL_VERIFICATION.md`, README et point de reprise mis à jour.
  Corpus/détecteurs inchangés : 12/12 hypothèses construites, 4/11 publiées,
  **zéro explication publiable**. Compensation positionnelle, surcharge, motifs
  plus longs et de finale, échantillon neuf et relecture restent nécessaires.
  Aucun moteur ni composant actif modifié ; les assets de production sont identiques.
- Validation : **606 tests / 51 fichiers**, dont 541 unitaires et 65 pont/moteurs,
  via `npm test -- --maxWorkers=2` avec ShallowRed et le Stockfish 16 de CI.
  Lint, TypeScript et build passent. Les derniers contrôles de cache sont relus
  séparément avant livraison ; la CI du commit envoyé doit être consultée.
- Suite concrète : brouillons/repères minimaux depuis les causes soutenues,
  exemples neufs et relecture ; pour …Ca4, modéliser la compensation/pression
  durable avant tout texte causal. Optimiser l'extraction avant l'intégration E.

## Brouillons à relire et extraction réduite — 3 octobre 2026

- `draftModel.ts`, `tacticalDraft.ts`, `mateDraft.ts` : idée structurée pour quatre
  premières familles, texte/repères issus du même contraste. Refus d'un rapport
  d'une autre décision, hypothèse ou alternative. Motif bénéfique secondaire pour
  un verdict négatif ; aucune prétention de meilleure décision automatique.
- Origines moteur/hypothèse/règles conservées. Mat : réponse puis mat ; alternative
  bloquée : une position. Pour le clouage, le choix calme après la dernière reprise
  est attesté par une note ; sa nouvelle position est inutile et n'est pas montrée.
  Le témoin complet reste intact. Aucune capture, compensation, promotion ou réponse
  à l'échec n'est coupée pour simplifier le repère.
- Contexte de reprise : échange antérieur et bilan depuis la décision distincts.
  Le cas construit légal depuis le début a un échange à −1 pour les Blancs et une
  reprise fxe3 à +2 depuis cette décision. Historique absent = bilan global inconnu.
  Cette primitive ne comprend pas encore les épisodes avec coups intermédiaires.
- `dev/pedagogy-review.html`, `preview.ts/.css`, `previewModel.ts` et générateur
  `npm run pedagogy:review` : aperçu Vite séparé pour relecture. Première mesure de douze
  cas moteur, six brouillons et six abstentions avant synchronisation ; 30 positions
  démontrées vérifiées contre leurs commandes et bilans. Les scores/conclusions
  simulés des tests ne l'alimentent pas. Nom UCI, SHA-256, coût et provenance gardés.
  Le clouage construit est soutenu par les deux moteurs ; les fourchettes construites
  sont soutenues dans cette mesure ShallowRed mais pas Stockfish, ses scores divergeant.
  Byrne–Fischer reste sans texte causal ; les deux moteurs confirment le mat court.
- Contrôle visuel navigateur non effectué : le connecteur CUA n'expose aucun
  navigateur. Vite sert/transpile l'aperçu ; validation de légalité des positions,
  origine et bilans faite. Relecture humaine de la clarté demandée le 3 octobre,
  avant activation E ; pas de réponse présumée ni de jugement déduit des tests.
- `legalCaptures.ts` cible les attaquants puis fait vérifier les captures par
  chess.js, au lieu de générer tous les coups pour chaque reprise. 34 contrôles
  comparent l'inventaire exhaustif/ciblé sur les 31 décisions et vérifient EP avec
  un candidat cloué, quatre promotions et cavalier cloué. Toute l'extraction garde
  les mêmes empreintes sur les 31 cas, ordre inclus. Mesure locale 15,94 → 3,13 s,
  sans moteur UCI ; pas de promesse de latence. Script `bench:understanding` et
  référence versionnés. Calcul hors rendu React toujours nécessaire avant E.
- 13 tests des brouillons, plus quatre essais réels supplémentaires de fourchette
  (48 UCI au total). Validation locale avant synchronisation : **657 tests / 53
  fichiers**, dont 588 unitaires et 69 pont/moteurs, ShallowRed + Stockfish 16.
  Lint, TypeScript et build réussis ; bundles actifs inchangés. Le moteur reste
  hors du code de ce lot.
- Synchronisation par fusion de main `510af69`, sans modification moteur propre
  à la PR, puis `cargo build --release --bin shallowred` réussi : nouveau binaire
  dans `target/release`. Suite complète relancée, **657 tests / 53 fichiers** passent.
  L'instantané régénéré conserve cinq brouillons et sept abstentions : la fourchette
  blanche reste aussi instable avec ce moteur, celle du camp noir a un brouillon.
  La relecture porte donc sur clouage, fourchette noire et mat avec ShallowRed.
  Les 25 positions de cet instantané sont contrôlées contre leurs commandes
  légales après régénération ; la CI du commit envoyé doit être relue.
- Corpus inchangés : 12/12 hypothèses construites, 4/11 publiées, **zéro explication
  publiable**. La pertinence générale, compensation/pression durable, nouveaux cas
  indépendants et intégration restent ouvertes. Les brouillons ne corrigent pas
  encore l'explicateur actif ; la prochaine décision porte sur leur lisibilité.

## Conséquences négatives et calcul coopératif — 4 octobre 2026

- Retour de Théo intégré au contrat : comparer une seule alternative ne démontre
  pas le meilleur coup. La perte permise doit être expliquée directement, même
  sans remplacement ; plusieurs défenses correctes peuvent exister.
- `TacticalEffectVerification` recherche seulement avant/après aux deux budgets.
  `RelationVerification.verifyEffect` ajoute la défense après la prise observée,
  sans alternative. Les mêmes arrêt/cache/délai/refus UCI sont conservés ; aucun
  changement moteur, MultiPV ou recherche stratégique réimplémentée.
- Brouillons négatifs de fourchette, défense échangée, défense retirée et ligne
  ouverte : menace, réponse et reprises utiles, bilan de la suite, contexte de
  reprise antérieure. Portée `observed-consequence`, pas perte universelle forcée.
  Un motif favorable sans comparaison ne justifie pas un meilleur coup global.
- La réponse libre de l'alternative est aussi contrôlée : Kc8 évite Cc7+ mais
  permet Cb6+ et perd encore la tour. La comparaison est écartée ; la perte après
  Ke8 reste expliquée. Les défenses Tb8 et Ta7 donnent le même récit de ce mauvais
  coup, sans choix unique. Deux camps et l'échange égal suivi de la perte d'un pion
  sont couverts. Fixtures construites exécutées avec chess.js, scores unitaires
  simulés ; ces tests ne sont pas une validation pédagogique indépendante.
- Aperçu clarifié « Coup joué / Autre coup comparé », comparaison absente masquée,
  retour direct au coup joué. Instantané régénéré : **22 essais réels, 10 brouillons,
  12 abstentions, 52 positions légales vérifiées**. ShallowRed soutient un récit
  négatif sans alternative et un avec comparaison refusée ; Stockfish 16 garde
  l'abstention sur ces positions aux budgets 200/600 ms. Les divergences et noms/
  empreintes des binaires sont conservés. Aucun contrôle visuel navigateur ajouté.
- `UnderstandingAnalysis` et générateurs communs : mêmes faits et ordre JSON sur
  les 31 décisions, étapes entre rendus, annulation lors d'une nouvelle demande,
  cache borné et immuable conservant les méthodes chess.js, instantané des entrées,
  progression et refus après dépassement du délai. Pas de Worker ni transport
  choisi. Une primitive indivisible peut dépasser la tranche cible ; ne pas
  revendiquer une durée d'image garantie. Mesure synchrone actuelle 3,51 s sous
  charge, empreintes inchangées ; le temps ne démontre pas la fluidité du produit.
- Validation : **699 tests / 54 fichiers** avec ShallowRed et Stockfish 16,
  lint, TypeScript et build réussis. Les bundles actifs restent identiques.
  La CI du commit envoyé sera relue avant livraison. Les textes validés le
  3 octobre restent une relecture limitée, pas une approbation de couverture.
- Toujours **zéro explication déclarée publiable** dans les corpus : 12/12
  hypothèses construites et 4/11 publiées, sept idées manquantes. Les nouvelles
  régressions ne changent pas ces chiffres. Compensation différée, contraintes
  combinées/longues, échantillon neuf et intégration E restent ouverts. L'UI active
  n'utilise pas encore ces nouvelles explications ; ne pas annoncer le chantier fini.

## Premier raccordement des conséquences adverses — 4 octobre 2026

- `PedagogicalAnalysis` pilote extraction coopérative puis au plus deux candidats
  matériels négatifs, aux budgets 300/900 ms et dans un délai commun de 12 s.
  Fourchette/défenseur échangé, clouage absolu exploité, défense retirée et ligne
  ouverte : aucune recherche d'alternative pour produire le récit du coup joué.
  Autres verdicts, score borné ou PV absente = aucune connexion pédagogique.
- Cache extérieur borné/immuable par revue, révision, moteur, historique, score,
  PV et verdict. Un contenu affiné sans nouvelle révision relance les contrôles.
  Navigation et calcul concurrent annulent ; moteur connecté tardivement fermé
  sans `go`. Un échec ou une divergence n'active pas une ancienne cause.
- `directExplanation`, hook et état de progression raccordés à `InteractiveReview`.
  Texte/repères suivent le témoin légal du coup joué ; première position après
  celui-ci, pas de rewind ni alternative imposée. Bilan et contexte de reprise
  conservés ; portée consultable. « Montrer pourquoi » utilise la démonstration
  existante, ses flèches/clavier et son retour au coup examiné. Démonstration
  invalidée aussi par une nouvelle revue ou des résultats raffinés. Retry masqué
  et annotations désactivées n'exposent pas les raisons. Les rendus d'explication
  sont mémorisés ; progression publiée aux changements de phase.
- Les causes historiques négatives ne sont plus calculées sur ce parcours.
  Variantes libres et observations complémentaires restent accessibles. Les
  brouillons positifs/comparatifs et mats ne sont pas activés dans ce raccordement.
- Quatre essais réels du raccordement complet : ShallowRed soutient fourchette et
  ligne ouverte, Stockfish 16 soutient la ligne ouverte et s'abstient sur la
  fourchette. Coût observé 1,8–5,1 s, extraction/démarrages compris, première
  évaluation exclue ; pas de promesse de latence ni mesure de couverture générale.
- Validation locale : **728 tests / 59 fichiers** avec les deux moteurs, puis
  **21 tests du contrôleur**, dont le dernier ajouté pour une connexion tardive.
  Lint, TypeScript et build réussis. Les bundles actifs changent : le prototype
  est maintenant importé dans la revue. CI à relire sur le commit envoyé.
- Aucun navigateur CUA disponible : contrôle visuel bureau/mobile et parcours
  intégral humain/bot/import restent ouverts. Les tests de rendu sont statiques,
  les scores unitaires simulés ; ils ne sont pas une relecture pédagogique.
- Les corpus n'ont pas été élargis : métriques d'hypothèses inchangées et aucune
  nouvelle validation indépendante. Prochaine étape : échantillon neuf et raisons
  non matérielles/contraintes combinées, sans élargissement par simple reformulation.
