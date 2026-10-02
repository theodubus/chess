# Analyse pédagogique — backlog active et plan de reprise

Plan révisé le 2 octobre 2026 après les retours de Théo. Périmètre : `ui/**`.
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
- [ ] Étendre aux défenses retirées, lignes ouvertes et contraintes combinées.
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

### C. Vérification comparative des causes — À FAIRE

- [ ] Questions moteur explicites : quelle réponse exploite la décision ?
  Quelle défense pourrait invalider l’hypothèse ? L’alternative évite-t-elle
  vraiment le même mécanisme ? Chaque résultat garde position et historique.
- [ ] Réutiliser les recherches UCI existantes. Pas de MultiPV/searchmoves supposés,
  pas de détail NNUE/Rust, pas de mini-moteur stratégique recodé dans l’UI.
- [ ] Évaluer les défenses pertinentes, coups intermédiaires et compensations,
  pas seulement la position après la capture attendue. Vérifier la stabilité
  quand une conclusion dépend d’une recherche trop courte.
- [ ] Statuts : hypothèse, soutenue, contredite, indéterminée. Une nouvelle
  recherche ne transforme pas automatiquement une hypothèse en explication.
- [ ] Budget global explicite et mesuré ; priorité à l’analyse demandée,
  annulation, cache par moteur/révision/historique, aucun résultat tardif.
- [ ] Essais avec ShallowRed et Stockfish ; désaccord du moteur enregistré,
  pas masqué par un motif « évident » codé en dur.

**Passage C :** une explication rejetée sur les contre-exemples reste rejetée
même si une capture existe dans la PV. Publier le rapport du corpus et ses limites.

### D. Explication et démonstration à partir des preuves — À FAIRE

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
- **Prochain travail concret** : enrichir les contre-exemples (défense par une
  autre pièce, coup intermédiaire, sacrifice), puis définir les requêtes et critères
  de réfutation/comparaison de C. Étendre les relations sur ce socle. Les cinq
  familles manquantes doivent rester visibles ; ne pas les masquer avec l’ancien
  explicateur ou une formule générique. D et E ne sont pas commencés.
