# Analyse pédagogique — plan actif

Mis à jour le 4 octobre 2026. Périmètre : `ui/**`, moteur Rust inchangé,
UCI comme seule frontière. Branche `codex/ui-polish`, PR #111.

**Le chantier général n'est pas terminé.** Le plan doit converger : un exemple
supplémentaire est une régression, pas automatiquement une nouvelle fonctionnalité.
Ne pas transformer les inconnus de l'audit en une liste de positions particulières
à faire reconnaître. Le plan A–E et le journal détaillé sont conservés dans
[la backlog historique](BACKLOG_ANALYSE_PEDAGOGIQUE_HISTORIQUE.md).

## Objectif et contrat qui ne changent pas

Expliquer ce que le coup change, comment cela est exploité, et pourquoi cette
conséquence éclaire son verdict. Pour une erreur, montrer directement sa conséquence,
sans imposer un meilleur coup de remplacement. Plusieurs bonnes défenses peuvent
exister ; une alternative moins bonne ne prouve ni le meilleur coup ni son unicité.

- Séparer fait légal, hypothèse de cause, confirmation moteur et classement du coup.
- Le moteur cherche librement. Aucun MultiPV/searchmoves présumé, aucun moteur
  stratégique réimplémenté dans l'UI, aucun mat converti en centipions.
- Un bilan de capture inclut les reprises et la promotion initiale. Une reprise
  peut être le meilleur choix dans un échange globalement perdant.
- Une première capture neutre ne reçoit pas rétroactivement la perte d'une autre
  pièce. Un début d'échange inconnu ou une reprise en attente garde son incertitude.
- Le repère commence après le coup étudié. Montrer uniquement les étapes utiles,
  conserver les reprises/échecs nécessaires et expliciter un bilan complet différent.
- Texte et repères lisent les mêmes faits revalidés. Pas de phrase sur développement,
  mobilité ou centre utilisée comme raison principale faute de cause confirmée.
- Une divergence ou compensation fait garder l'abstention. Une preuve courte dans
  des variantes UCI ne démontre pas une perte contre toutes les réponses légales.
- Les tests logiciels et une CI verte ne constituent pas une relecture pédagogique.

## État livré et travail en cours

Familles adverses raccordées : fourchette/défenseur échangé, clouage absolu exploité,
retraite fermée puis attaque, défense retirée, ligne ouverte, défenseur détourné par
une reprise, menace préexistante ignorée. Les mats adverses en un à trois coups ont
une preuve bornée couvrant toutes les réponses légales. Les reprises connues ont
leur note de contexte et ne sont plus présentées comme un nouvel échange gagnant.

Le calcul porte sur le coup consulté : extraction coopérative, progression, cache
par revue/révision/moteur/historique/PV/score, annulation et délai partagé de 12 s.
Deux candidats maximum, quatorze recherches maximum, budgets 300/900 ms. Retry
masqué et annotations désactivées ne déclenchent pas la recherche pédagogique.
Les anciennes causes concurrentes sont écartées dans la revue ; la navigation
existante est conservée. Le mat déjà joué conserve une preuve des règles, sans
recherche supplémentaire et avec un seul repère après la décision.

**Lot publié : pièce déplacée puis capturée.**
`CaptureLossVerification` et `captureLossDraft` partagent les contrôles de la menace
ignorée et de la pièce exposée : identité, premier échange clôturé négatif, bilan
total négatif et réponse libre comparée. Promotion capturée et en passant sont
traités. Les issues de mat restent qualitatives ; un mat adverse long n'empêche
pas de décrire un échange court, sans prétendre expliquer ou prouver tout le mat.
Une alternative déjà terminale est vérifiée par les règles et ne lance pas de moteur.
Questions, preuves altérées, cache, arrêt et délais sont contrôlés.
Commit publié : `234e7e7`. CI réellement lue et réussie :
[UI 37227789810](https://github.com/theodubus/chess/actions/runs/37227789810),
[Rust PR 37227789819](https://github.com/theodubus/chess/actions/runs/37227789819),
[Rust push 37227787086](https://github.com/theodubus/chess/actions/runs/37227787086).
Ce lot vérifie **816 tests unitaires / 66 fichiers et 127 tests pont/moteurs**,
lint, TypeScript et build. Stockfish 16 est la référence des instantanés et de
la CI. Un passage local avec Stockfish 17 a conservé un refus de réponse finale
et deux dépassements du délai pédagogique ; aucune explication n'a été publiée
dans ces cas. Main de référence : `510af69`.

**Dernier lot fonctionnel publié : `99dacf4`, migration favorable et raccordement.** Fourchettes,
clouages et défenseur échangé utilisent leur propre conséquence revalidée. Une
occasion bénéfique ne prouve pas le meilleur coup, ni son unicité ; la capture,
les reprises et le bilan doivent rester stables, sans imposer une alternative.
La distance entre scores CP n'est pas attribuée à cette conséquence. Une reprise
connue garde son contexte et ne relance pas un récit d'échange gagnant.
Le clouage est refusé comme cause isolée si la pression ou les reprises changent
aussi. Le premier échange neutre est séparé d'une contre-prise adverse ailleurs ;
la contre-prise compensatrice du camp étudié reste comptée.

Deux instantanés favorables conservent les dix essais réels de développement :
deux premiers textes, puis six après séparation de la stabilité physique et du
score CP. Les quatre abstentions finales restent visibles. CI réellement lue et
réussie : [UI 37230972377](https://github.com/theodubus/chess/actions/runs/37230972377),
[Rust PR 37230972404](https://github.com/theodubus/chess/actions/runs/37230972404),
[Rust push 37230969890](https://github.com/theodubus/chess/actions/runs/37230969890).
**844 tests unitaires / 67 fichiers et 137 tests pont/moteurs / 10 fichiers**
passent dans cette CI ; lint, TypeScript et build passent. Les 14 essais locaux
des parcours favorables/détournés passent avec les deux moteurs. Trois contrôles
d'abstention Stockfish 17 passent : arrêt sans publication au délai partagé et
refus explicite d'une réponse finale bornée. Cela ne valide pas l'ensemble des
tests avec cette autre version ni la pertinence pédagogique des textes.
Une exécution CI suivante a dépassé les 5 s d'une fixture publiée comparée de
Byrne, sans assertion de résultat en échec. Sa limite de test passe à 10 s,
comme l'autre fixture publiée ; le délai utilisateur de 12 s reste inchangé.

Relecture humaine demandée sur les deux fourchettes, le clouage et Dxd4 : pas de
réponse présumée. Aucune validation visuelle annoncée. Le bundle de revue dépasse
encore 500 ko ; navigateur intégré indisponible après tentative. Les anciennes
mesures restent datées ; l'audit adverse ci-dessous précède la garde complémentaire
de clôture de l'échange, sans couverture supplémentaire revendiquée.

## Prochain jalon fini : conséquences tactiques courtes

Ce jalon est un périmètre livrable, pas une redéfinition de l'objectif général ni
une promesse d'équivalence avec Chess.com. Les familles négatives restent figées.
La migration favorable utilise fourchettes/clouages déjà modélisés ; elle n'ouvre
pas une série de détecteurs pour remplir chaque trou du corpus.

1. [x] Terminer les contrôles du lot de pièce exposée, publier et lire sa CI. Conserver
   les mesures précédentes et les abstentions ; vérifier les deux moteurs.
2. [x] Migrer les occasions favorables des mécanismes existants vers leur propre
   conséquence vérifiée. Contrat : [FAVOURABLE_CONSEQUENCE.md](src/review/understanding/FAVOURABLE_CONSEQUENCE.md).
   Deux recherches libres, même motif et bilan après reprises. Pas d'alternative
   obligatoire, pas de preuve du meilleur choix global. Une reprise connue garde
   sa note d'échange ; aucun récit favorable ne justifie une erreur.
3. [x] Finir le raccordement UX de ces deux parcours : mêmes faits pour texte,
   bilan et repères, progression/annulation/préférences, retour explicite au coup
   étudié. Écarter leurs anciennes raisons concurrentes et toute observation
   positionnelle utilisée pour remplacer une explication inconnue.
   Raccordement logiciel testé, dont annulation pendant la rédaction. La
   relecture pédagogique et le contrôle visuel restent les points 4 et 5.
4. [ ] Faire relire les exemples positifs et négatifs : raison pertinente,
   illustration courte compréhensible, compensation/reprise correctement située.
   Théo a validé les premiers textes le 3 octobre ; cela ne valide pas tous les
   nouveaux textes ni leur couverture. Aucun jugement humain présumé.
5. [ ] Contrôler visuellement le parcours bureau/mobile, humain/bot, deux humains
   et import PGN. CUA n'exposait aucun navigateur lors du dernier contrôle : les
   rendus statiques, légalité et exécution PGN ne permettent pas de cocher ce point.
6. [ ] Publier un bilan de ce périmètre stable : couverture, erreurs, abstentions,
   coût et limites. Garder le même dénominateur et ne pas compter la simple présence
   d'un texte comme une explication pertinente. Pas de nouvelle famille implicite
   à la fin de ce bilan.

## Mesures conservées et limites constatées

Corpus de développement : 12/12 hypothèses principales connues reconnues. Corpus
publié : 4/11, sept idées manquantes ; il a depuis servi au développement. Aucun
pourcentage de pertinence générale ne se déduit de ces chiffres.

Trois PGN amateurs, sélection fixée avant mesure dans l'archive CC0 Lichess de
janvier 2013 : 202 demi-coups, six revues avec ShallowRed et Stockfish 16.
Les passages suivants réutilisent exactement ces évaluations et classifications.

| Rapport | Décisions défavorables moteur × partie | Soutenues | Inconnues | Indisponibles |
|---|---:|---:|---:|---:|
| Audit initial | 126 | 7 | 117 | 2 |
| Menace ignorée | 126 | 7 | 118 | 1 |
| Pièce exposée | 126 | 11 | 111 | 4 |

Le dernier passage a trois sorties de la nouvelle famille, plus une ancienne
famille confirmée cette fois-ci. Il conserve trois délais Stockfish épuisés et
une réponse sans score exact/PV utilisable. La majorité des raisons reste inconnue.
**Ces confirmations ne sont pas une validation humaine de pertinence.** Toutes
les évaluations sémantiques restent `pending`. Les détails et empreintes sont dans
[AMATEUR_AUDIT.md](src/review/understanding/AMATEUR_AUDIT.md).

Essais construits de pièce exposée : 16 premiers, six soutenus ; 18 suivants,
dix soutenus. Ce sont nos propres exemples de développement. Les deux rapports
conservent leurs questions, binaires et abstentions ; pas de gain indépendant
revendiqué. Voir [MOVED_PIECE_EXPOSURE.md](src/review/understanding/MOVED_PIECE_EXPOSURE.md).

## Au-delà du jalon : besoins conservés, sans extension automatique

Activité utile, structure, sécurité durable du roi, compensations positionnelles,
surcharge, interactions de défenses, coups intermédiaires et combinaisons longues
restent des besoins réels. Pour expliquer en général la majorité des bons/mauvais
coups, il faut un modèle causal et une évaluation supplémentaires ; les seules
PV/évaluations UCI ne donnent pas ces raisons. Davantage de temps moteur peut
stabiliser un score, sans fournir l'explication manquante.

Décider séparément de ce périmètre et de son architecture après le bilan du jalon.
Ne pas résoudre ce problème en ajoutant une phrase par symptôme ou en promettant
une couverture globale à partir de positions construites. La relecture indépendante
et un autre échantillon neuf restent requis si celui-ci sert à régler les détecteurs.

## Reprise pratique

Lire `ui/CLAUDE.md`. Ne modifier que `ui/**`. Les positions/suites nouvelles sont
exécutées avec chess.js **avant** inscription dans les tests ; vérifier aussi le
roi hors trait, mat réel et reprises. Ne pas régénérer un instantané pendant les
tests qui le lisent. Les scripts réels utilisent seulement l'adaptateur `Engine`.

```bash
npm run test:unit -- --maxWorkers=1
CHESS_ENGINE_BINARY=../target/release/shallowred CHESS_STOCKFISH_BINARY=/chemin/stockfish npm run test:bridge -- --maxWorkers=1
npm run lint
npm run build
```

Aperçus avec `npm run dev` : `/dev/pedagogy-review.html?sample=exposure` et
`/dev/pedagogy-review.html?sample=opportunity`, ainsi que
`/dev/pedagogy-audit.html?sample=exposure`. Les instantanés existent déjà : ne pas
relancer les moteurs pour ouvrir l'aperçu. Les textes sauvegardés gardent la version
mesurée ; les anciens rapports restent accessibles sans paramètre ou avec `?sample=ignored`.

Consigne utilisateur inchangée : poursuivre le travail autonome, sans arrêt à la
fin de chaque lot ; arrêt à un arbitrage humain nécessaire, limite ou achèvement.
Le resserrement du plan empêche l'expansion silencieuse, il ne clôt pas le chantier.
