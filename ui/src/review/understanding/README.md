# Prototype de compréhension — suivi au 3 octobre 2026

Ce dossier est indépendant de l’interface et de l’ancien détecteur de motifs.
Il produit des faits et des hypothèses structurés ; `explanation` reste `null`.
Lancer depuis `ui/` :

```bash
npm run test:understanding
CHESS_ENGINE_BINARY=../target/release/shallowred CHESS_STOCKFISH_BINARY=/usr/games/stockfish npm exec -- vitest run dev/understanding.test.mjs --reporter=verbose --silent=false --disableConsoleIntercept
```

## Ce qui est implémenté

- `context.ts` reconstruit le passé connu et la continuation légale, garde les
  commandes UCI et suit chaque pièce par une identité stable. Une promotion garde
  l’identité de son pion ; le roque déplace aussi la tour, la prise en passant
  retire la pièce de sa vraie case. L’histoire avant une FEN reste inconnue.
- `possibilities.ts` sépare attaque géométrique et capture légale, inventorie
  déplacements et réponses de capture, puis compare les possibilités. Une route
  de fou/tour/dame fermée par une pièce amie cite cette pièce et sa case. Les
  sondes avec un autre trait sont identifiées et refusées pendant un échec.
- Le bilan d’une réponse de capture inclut la meilleure reprise immédiate disponible.
  C’est un fait matériel borné, **pas** une évaluation du coup ou une recherche
  stratégique : il ne couvre pas les coups intermédiaires et compensations.
- `relations.ts` compare les reprises légales (défenseur capturé, déplacé ou
  contraint) et les lignes ouvertes entre pièces restées sur leurs cases. Les
  trajets et obstacles retirés sont conservés ; une ligne géométrique ouverte
  reste distincte d'une capture légale. Une sonde indisponible n'est pas une
  absence de défense. Les quatre promotions d'une reprise gardent une identité.
- `mechanisms.ts` compose les faits de défense retirée et de ligne ouverte en
  hypothèses avec rôle, victime, attaquant et capture précise. Un bilan local
  favorable reste une hypothèse, à confronter à la réponse fraîche du moteur.
- `exchanges.ts` remonte les reprises consécutives à partir de l’historique connu.
  Le bilan de l’épisode visible est distinct du bilan depuis la décision consultée.
  Sa borne initiale et la possibilité de reprendre encore sont explicites. Un
  épisode entrecoupé de coups intermédiaires n’est pas reconstitué à ce stade.
- `prototype.ts` compose ces relations pour construire l’hypothèse « retraite
  fermée puis pièce attaquée » ou « nouvelle attaque sur une pièce restreinte ».
  La victime et ses sorties sont explicites ; aucune case ou pièce d’un exemple
  n’est codée dans le détecteur. Une capture avantageuse sur une case attaquée
  n’est pas assimilée automatiquement à une sortie perdante.

La recherche de défense et sa vérification courte sont maintenant implémentées
ci-dessous. La couverture stratégique et l'attribution de la cause à la décision
restent **à vérifier**. Une PV légale contenant le gain ne lève pas ces inconnues.

## Premier bilan du corpus de développement

`corpus.json` contient 19 décisions : deux issues des captures utilisateur (un
même exemple avant/après), quatre transformations avec camps inversés et treize
cas construits. Ce n’est ni un échantillon représentatif de parties, ni une
validation indépendante. Les positions ont été exécutées avec chess.js avant
leur inscription. Les continuations sont des témoins légaux, pas des PGN inventés
attribués à l’utilisateur.

| Famille | Faits/mécanismes attendus | Reconnus | Contre-exemples |
|---|---:|---:|---:|
| Pièce restreinte / retraite fermée | 4 | 4 | 5 |
| Contexte de reprise | 3 | 3 | 0 |
| Double menace | 1 | 0 | 0 |
| Clouage | 1 | 0 | 0 |
| Défenseur supprimé | 1 | 1 | 0 |
| Ligne ouverte | 1 | 1 | 0 |
| Menace de mat | 1 | 0 | 0 |
| Développement ordinaire / attaquant cloué | 0 | 0 | 2 |
| **Total** | **12** | **9** | **7** |

Le tableau mesure les hypothèses attendues, **pas** des causes publiables. Le
clouage donne un fait partiel correct (pièce attaquée restreinte), mais son lien
avec le roi manque encore. Double menace, clouage et mat sont les **trois familles
manquantes**. Les deux nouvelles hypothèses correspondent aux captures et rôles
annotés ; leurs exemples initiaux ne constituent pas des confirmations moteur.

- Zéro hypothèse inattendue dans le contrôle des restrictions, reprises et des
  relations de défense/ligne du corpus original. La portée reste ces hypothèses,
  pas tous les raisonnements échiquéens ni tous les textes de l'ancienne UI.
- Les trois relations secondaires sont désormais annotées par identité, rôle et
  capture. Elles sont correctes comme faits conditionnels ; elles **ne remplacent
  pas** le clouage ou le mat attendus et ne constituent pas des causes confirmées.
  Les cinq épisodes d'échange visibles sont également annotés, dont deux secondaires.
- **Zéro explication publiable**, y compris pour les neuf hypothèses reconnues.
- Les deux moteurs choisissent `…f4` sur la position utilisateur ; le prototype
  retrouve la retraite fermée dans leurs variantes réelles. L’ancien explicateur
  reste sans raison concrète sur cet exemple. Ce contrôle ne valide pas encore
  les contre-épreuves nécessaires pour expliquer la décision.
- Ordre de grandeur observé en local : environ six secondes pour le corpus seul,
  avec une extraction exhaustive non optimisée. Le rapport recalcule les temps
  à chaque exécution. Ce calcul synchrone ne doit pas être branché tel quel à l’UI.

Le rapport exige le mécanisme, la victime et la retraite attendus lorsqu’ils
sont fournis ; une simple égalité de libellés ne suffit pas. Un bilan de reprise
est également vérifié avec son rôle et ses deux valeurs. Les suites illégales,
le mauvais historique et les frontières inconnues sont testés séparément.

## Ce qui reste avant une intégration UI

Étendre les relations et le corpus, vérifier comparativement les hypothèses avec
les moteurs, examiner les contre-exemples tactiques (en particulier intermédiaires
et sacrifices), puis seulement produire les textes et plans visuels. Les familles
positionnelles, la surcharge et la déviation doivent entrer dans le corpus avant
d’être annoncées comme prises en charge. Voir la backlog active à la racine de `ui/`.


## Vérification comparative isolée

`Verification.verify` reçoit la revue, sa révision, l'identifiant/configuration du
moteur, le contexte et l'hypothèse choisie. Un changement de configuration moteur
doit changer la révision ou l'identifiant, comme pour `FocusedAnalysis`.

1. Rechercher depuis la position avant la décision, puis après le coup joué.
2. Chercher la meilleure défense avec le vrai trait et l'historique complet,
   sans imposer un déplacement de la pièce menacée.
3. Analyser une alternative légale fournie ou le premier choix à la racine s'il
   diffère du coup joué. Aucun second choix inventé quand les coups coïncident.
4. Si une retraite fermée redevient disponible, rejouer la même menace légale
   après l'alternative et demander la meilleure défense (`same-threat`).
5. Refaire ces questions avec un budget supérieur et un cache distinct.

Par défaut : 300 puis 900 ms par position, au plus dix recherches / 6 000 ms
nominaux et 12 secondes au total, connexions incluses. Cache borné par revue,
moteur, révision, historique, hypothèse et alternative. Annuler empêche la
publication tardive. Un rapport réutilisé indique `cached: true` et coût courant
nul. Les rapports rendus ne permettent pas de modifier les caches internes.

`evidence.ts` suit l'identité de la victime dans la PV. Il conserve les reprises,
repère un sauvetage visible ou le mat du défenseur, et ne s'arrête pas à une perte
juste avant une capture, promotion ou un échec compensateur. Il borne la lecture à
huit demi-coups et abandonne après plusieurs coups calmes sans mécanisme résolu.
Une compensation au-delà de cette fenêtre reste inconnue.

Le statut `supported` signifie seulement que deux recherches stables montrent
une perte matérielle courte de la victime avec un score défavorable à son camp.
`contradicted` signifie qu'elles montrent un témoin contraire ; ce n'est pas
l'affirmation que la position entière est bonne. `indeterminate` garde les PV
incomplètes, la menace modifiée et les recherches divergentes. La comparaison de
scores donne un champ séparé : elle **n'établit pas la causalité** du motif.

Seuils provisoires : variation maximale de 100 centipions entre recherches,
score inférieur à −75 centipions du point de vue du défenseur pour soutenir la
perte, écart d'au moins 100 centipions pour distinguer les alternatives. Ils ne
sont ni des règles de classement ni des probabilités de victoire ; ils restent
à étalonner. Les scores de mat ne sont pas convertis en faux centipions.

### Contre-épreuves et observations réelles

`verificationCases.json` contient cinq cas construits distincts du corpus des
19 décisions. L'inventaire géométrique propose une restriction dans chacun ; les
témoins légaux montrent pourquoi cela ne suffit pas à conclure à un gain.

- Capture de l'attaquant par une autre pièce.
- Capture en passant qui retire l'attaquant de sa véritable case.
- Échec, échange forcé de tours et retraite libérée pour le fou.
- Mat immédiatement disponible malgré la menace sur le fou.
- Fou capturé puis mat : témoin volontairement non optimal, destiné à vérifier
  la priorité de la compensation. Les moteurs trouvent ici le mat immédiat.

Les tests réels utilisent 200/600 ms et enregistrent les deux budgets, scores,
profondeurs, témoins, comparaisons et coûts. Historique d'une exécution locale
avant la révision de clôture ci-dessous :

| Cas | ShallowRed | Stockfish |
|---|---|---|
| Dd2/…f4 | Perte courte soutenue, comparaison instable | Indéterminé : échange non clôturé dans le témoin |
| Autre pièce prend l'attaquant | Hypothèse contredite | Hypothèse contredite |
| Prise en passant | Indéterminé : score instable, défense trouvée | Hypothèse contredite |
| Échec qui libère une retraite | Indéterminé : autre défense choisie | Indéterminé : autre défense choisie |
| Mat prioritaire / sacrifice | Hypothèse contredite par le mat | Hypothèse contredite par le mat |

Ces observations peuvent varier avec le binaire et le temps de recherche. Elles
ne sont pas des attentes figées de profondeur ou de score. Durée observée par
vérification : environ 0,2 à 7,2 secondes, connexions comprises ; extraction
synchrone des hypothèses en supplément. Les deux moteurs ne doivent pas être
appelés ensemble dans l'UI : ils servent ici à confronter le prototype.

La causalité comparative générale, les sacrifices positionnels et les trois familles
manquantes restent ouverts. **Toujours zéro explication publiable.**


## Contraste causal : retraite fermée

`contrast.ts` compare une même menace dans deux branches **légales**, sans
permuter le trait ni effacer des pièces. Il vérifie les identités de la victime,
de l'attaquant et du bloqueur, ainsi que le déplacement réel de ce dernier.
Il écarte une menace dont la capture ou l'échec change, même si son UCI est
identique. Une case accessible mais matériellement perdante n'est pas qualifiée
de retraite restaurée.

La comparaison ne prétend pas que l'adversaire choisirait cette menace dans
l'alternative : la question est « contre cette même idée, cette décision
conserve-t-elle une défense ? ». Le moteur reste libre de choisir sa défense.

Le rapport `attribution` peut soutenir `closed-retreat` seulement si :

- la perte initiale est soutenue par les deux recherches ;
- la même alternative est meilleure dans les deux recherches ;
- le moteur emprunte dans chaque branche comparative une retraite précisément
  bloquée par le coup joué, avec un témoin de préservation de la pièce ;
- l'évaluation contre cette menace s'améliore aussi d'au moins 100 centipions
  pour le défenseur et reste stable. Les scores de mat ne sont pas convertis.

Ce statut décrit une **contribution conditionnelle**, sans prétendre épuiser les
raisons du verdict ni prouver une perte contre toutes les défenses. Les positions,
trajets, bloqueur et réponses restent accessibles dans les deux passes ;
`explanation` reste `null` et les composants de revue n'importent pas ce code.

`contrastCases.json` couvre neuf comparaisons de développement (quatre retraites
restaurées, une capture préventive et quatre refus), avec camps inversés et un
autre échiquier comportant une attaque de tour. Les refus comprennent une autre
pièce occupant la retraite, une victime déjà déplacée, des cases encore perdantes
et un même déplacement UCI qui devient une capture différente. Ce lot historique ne changeait pas le corpus initial de 19 décisions.
Le suivi courant ci-dessus inclut les deux nouvelles hypothèses.

Les 18 tests UCI réels ajoutent notamment une alternative explicitement choisie,
Rh1 au lieu de Dd2. Les deux moteurs utilisent Fd2 contre …f4 ; ShallowRed soutient
l'attribution tandis que Stockfish peut rester indéterminé sur la perte initiale.
Cela ne transforme pas Rh1 en « meilleur coup ». Le choix automatique peut être
exf5 : la menace …f4 devient alors illégale. La nouvelle comparaison ci-dessous
traite précisément cette prévention, sans rejouer …f4.

Lors d'une exécution chargée, la comparaison explicite a pris environ 4,5 s avec
ShallowRed et 13,3 s avec Stockfish (démarrages inclus, extraction préalable exclue).
Les tests d'intégration accordent 25 s au moteur, mais le plafond applicatif
reste 12 s et peut donc interrompre le calcul sans publier de résultat partiel.
Le coût des connexions et de l'extraction initiale doit diminuer avant l'UI.


## Défenses et lignes ouvertes : faits supplémentaires

`relationCases.json` contient 15 cas (13 construits et deux inversions de couleurs).
Les tests rejouent chaque capture/reprise annoncée. Ils couvrent les changements
utiles et leurs contre-exemples : un cavalier cloué protège géométriquement mais
ne reprend pas ; retirer un défenseur peut en laisser un autre ; une pièce qui
capture un obstacle peut occuper sa place et maintenir la ligne fermée ; une
ligne dégagée peut appartenir à un attaquant cloué. La prise en passant retire
deux obstacles et les promotions ne multiplient pas l'identité d'un défenseur.

Ces faits sont attachés à la décision dans `Understanding.relations`. Les deux
pièces comparées doivent garder identité, type et case ; leur déplacement ou
promotion demande une autre relation. Les inventaires indiquent si le trait
est réel ou sondé. Le bilan est limité à la capture et à la meilleure reprise
immédiate, **sans jugement de qualité ni garantie sur un échange prolongé**.
Ce corpus de primitives reste séparé des mécanismes et explications publiables.

## Contraste causal : attaquant supprimé

Une alternative légale qui capture l'identité responsable de la menace produit
`attacker-removed`. La prise en passant utilise la case réelle de la victime de
la capture, pas la destination du pion. La victime menacée doit être la même et
rester sur sa case. Un déplacement de la victime reste un autre mécanisme.

La recherche déjà effectuée après l'alternative fournit une réponse adverse
libre. Le témoin commence à cette position, avec un bilan matériel depuis avant
l'alternative, et s'arrête dès la préservation constatée, la perte ou l'incertitude
(huit demi-coups maximum). Il peut donc réfuter le sauvetage même si l'attaquant
initial a disparu. Aucune réponse forcée ni commande `searchmoves` n'est utilisée.

L'attribution reste conditionnelle : même alternative aux deux budgets, perte
initiale vérifiée, amélioration stable et victime préservée dans chaque témoin.
Mat, divergence ou continuation trop courte empêchent la confirmation. Les tests
couvrent notamment une capture préventive suivie malgré tout de la perte du fou.
La comparaison réutilise les recherches existantes (au plus huit), le cache et
l'annulation. Elle ne nécessite pas la cinquième question `same-threat`.

Observation locale du 3 octobre avec 200/600 ms : après exf5, les deux moteurs
choisissent Fxf5 et le témoin conserve le fou e3 (ShallowRed poursuit par Fd1,
Stockfish par Cd2). ShallowRed soutient `attacker-removed` ; Stockfish conserve
`loss-not-verified`, sa perte initiale restant hors du contrat du témoin court.
Coûts de vérification observés : 2,6 s et 6,7 s, connexions incluses, extraction
initiale exclue. Ces chiffres et choix décrivent cette exécution, sans figer les
profondeurs, les scores ou les coups futurs du moteur.

Validation logicielle de cette étape : lint, TypeScript, 445 tests / 44 fichiers
avec les deux binaires, build réussis. Le bundle actif conserve les mêmes fichiers.

Aucun de ces résultats n'est encore transformé en texte dans l'UI. L'étape
suivante ci-dessous compose et compare les défenses/lignes ; les compensations
longues, le corpus indépendant et la validation du contrat de démonstration
restent ouverts.


## Défense retirée / ligne ouverte : hypothèses, contraste et brouillons

`RelationVerification` utilise le même orchestrateur borné que `Verification`.
Chaque budget interroge librement la position avant la décision, après le coup et
après une alternative. La capture annoncée doit être observée avec les mêmes
identités dans la réponse réelle, au premier ou deuxième demi-coup. Une requête
conditionnelle après cette capture recherche sa suite avec le vrai trait.

- **Défense retirée** : dans l'alternative, rejouer la même capture (et au plus
  une réponse intermédiaire conservant ses identités/effet d'échec), puis vérifier
  que le moteur reprend avec le défenseur effectivement conservé. Son existence
  seule ne suffit pas. La perte matérielle et le score doivent s'améliorer.
- **Ligne ouverte** : l'alternative doit conserver l'un des obstacles identifiés
  sur le trajet. Sa réponse moteur reste libre et doit préserver la même victime.
  Une attaque réciproque, un attaquant cloué ou une cible qui s'en va ne confirme
  pas le récit de gain.

La perte et l'attribution restent deux statuts distincts. Les scores exacts en
centipions doivent être stables (100 cp maximum entre budgets). La comparaison
relative doit différer d'au moins 100 cp dans le sens de l'hypothèse et rester
stable : cela permet d'expliquer une perte même dans une position encore gagnante.
Ce seuil de développement n'est pas une règle pédagogique étalonnée. Les scores
de mat restent hors du contrat de cette attribution matérielle.

Les réponses conditionnelles ont leur propre commande et un champ
`scope: conditional-engine-line`. Elles ne sont pas présentées comme la PV libre
initiale. Au plus dix recherches pour un défenseur, huit pour une ligne ; aucune
commande MultiPV/searchmoves. Les deux caches restent séparés, l'historique complet
et les identités moteur/révision sont conservés, l'annulation et le plafond global
empêchent une publication tardive. `boundedContinuation` s'arrête à la première
fin de partie et à huit demi-coups, sans relâcher le contrôle strict du contexte
source.

`mechanismCases.json` contient **13 cas de développement**, 11 construits et deux
transformations de couleurs. Positifs, autre défense restante, attaquant cloué,
ligne également ouverte dans l'alternative, cible qui s'en va et compensation
ailleurs sont exécutables. Les tests unitaires rejouent des réponses et scores
**simulés** : ils valident le contrat logiciel, pas le choix du moteur.

Les 14 nouvelles intégrations réelles (sept décisions par moteur) ajoutent deux
positions avec davantage de matériel. Lors du contrôle ciblé du 3 octobre,
ShallowRed et Stockfish soutiennent la défense perdue après Cb4 et l'ouverture
contre la dame après dxe4. Les positions dépouillées restent des contre-épreuves
utiles : un roi peut remplacer le défenseur retiré, une autre attaque peut être
plus forte, et la perte peut mener à un mat ou à un témoin trop court. Dans ces
cas, aucune attribution n'est publiée. Coût observé pour les deux positions plus
riches : 3,1–4,0 s avec ShallowRed, 6,8–8,4 s avec Stockfish, démarrages inclus et
extraction exclue. Le démarrage d'un moteur par question reste à optimiser.

`relationDraft` produit uniquement un **brouillon isolé** à partir d'une attribution
soutenue. Le texte, la commande de chaque position et les repères utilisent les
mêmes pièces et témoins. Le premier écran est après la décision ; on ne la rejoue
pas. Le contraste d'une ligne affiche directement l'obstacle conservé, sans
rejouer les coups sans rapport de sa PV. Les textes parlent d'une contribution
conditionnelle, sans promettre que toutes les défenses perdent ni que l'alternative
est le meilleur coup. Exemples à relire : [DRAFT_EXAMPLES.md](DRAFT_EXAMPLES.md).

La révision suivante sépare désormais le témoin complet du repère court et
observe explicitement la décision de ne pas reprendre. Les trois candidats
secondaires sont annotés dans la révision de corpus ci-dessous. Les mats, les
contraintes combinées et une validation pédagogique indépendante restent ouverts. **Le prototype
n'est toujours pas importé dans la revue ; `explanation` reste `null`.**

Validation logicielle finale de cette étape : lint, TypeScript, build et **490 tests
/ 45 fichiers** avec les deux moteurs (`npm test -- --maxWorkers=2`). Le premier
lancement non borné s'est arrêté sans bilan ; le contrôle à deux workers termine
avec succès. Le bundle actif garde les mêmes assets.


La CI Ubuntu emploie Stockfish 16, différent du 17.1 installé localement. Sa
recherche a révélé une abstention légitime : dernière itération bornée, coup
retenu différent de la dernière itération exacte. La réponse reste inutilisable
et aucun rapport/texte n'est publié. Les intégrations acceptent **ce refus
vérifié seulement** : borne réelle, PV et meilleur coup cohérents/légaux ; elles
continuent à échouer pour une panne, un délai ou un coup incohérent. Une
régression rejoue les lignes exactes reproduites. Le diagnostic garde la question
refusée et une trace bornée des réponses UCI. Aucun score borné n'est transformé
en score exact dans le code applicatif.

La revalidation complète avec ShallowRed et ce même Stockfish 16 donne **490
  tests / 45 fichiers** ; lint et TypeScript passent également.


## Clôture de reprise et illustration distincte — 3 octobre 2026

`witness.ts` reconstruit les identités dans la continuation légale avec le même
historique UCI. Pour chaque capture, `CaptureReply` garde la commande de position,
les reprises légales, la décision observée et son indice. `not-chosen` constate
seulement que le moteur a joué autre chose ; cela ne dit pas que reprendre serait
mauvais, ni que toutes les défenses perdent. Un échec intermédiaire diffère la
décision jusqu'au prochain tour du camp qui pouvait reprendre. Si le témoin se
termine avant, elle reste `pending` ; aucun choix au-delà de la borne n'est publié.

`DefenceEvidence.ending` distingue échange terminé, reprise non choisie, reprise
encore en attente, échec non résolu, limite de coups calmes/longueur et fin de
partie. Les coups calmes sont **consécutifs** ; une capture, un échec ou une
promotion réinitialise leur compteur. La clôture d'un bilan visible est examinée
avant d'abandonner à cette limite. Une nulle arrête le témoin sans conclusion de
perte matérielle ; un mat adverse n'est pas réduit à une perte de pièce.

`illustration.ts` produit un préfixe légal distinct de la preuve. Il suit la prise
de la victime, les reprises successives et leurs échecs intermédiaires, et conserve
la décision réelle de ne pas reprendre. Il peut omettre une capture ultérieure
par l'adversaire sur une autre pièce. Il conserve toute prise compensatrice du
camp de la victime, toute promotion et tout échec ; il ne tronque pas un témoin
compensé ou indéterminé. C'est une règle conservatrice pour ces mécanismes courts,
pas un résumé stratégique général d'une PV.

`RelationDraft.illustration` indique les coups omis, le bilan illustré et le bilan
de la preuve complète. `limitation` explique leur différence et les reprises
légales non choisies. Exemple construit : après dxe4, …Txd1 Txd1 montre −3 points
pour les Blancs ; …Cxe4 peut être gardé dans la preuve à −4, sans figurer dans le
repère. L'alternative de ligne reste une position statique avec l'obstacle.

Les nouvelles contre-épreuves logicielles couvrent les couleurs inversées,
reprises partielles, échec avant reprise, compensation ailleurs y compris dans
une ligne toujours perdante, promotion, nulle et mat adverse. Les scores exacts
unitaires sont simulés. Ces contrôles ne sont pas de nouveaux cas indépendants
ni de nouvelles idées reconnues dans le corpus original. Les recherches restent
bornées à huit demi-coups et dix questions, sans nouveau coût UCI. Le prototype
reste isolé, `explanation: null`, zéro explication déclarée publiable.

Validation de cette révision : **509 tests / 46 fichiers** pour la suite complète
avec ShallowRed et Stockfish 16 d'Ubuntu, puis **60 tests ciblés** après le dernier
contrôle de texte ajouté ; lint, TypeScript et build réussis. Les assets actifs
restent identiques. Six essais UCI ciblés avec les deux binaires enregistrent les
plans d'illustration et les preuves distincts. Sur la ligne d ouverte, tous deux
omettent …Cxe4 du repère mais le gardent dans la preuve. Trois contrôles ciblés
Stockfish 17.1 passent aussi, avec ses différences de variantes conservées.


## Corpus publié et annotations complètes — 3 octobre 2026

`assessDecision` compare les motifs principaux et secondaires séparément.
`expected.relations` contient kind/rôle/identités/capture et la raison de
l'annotation. Une liste vide signifie aucune relation attendue ; son absence
signifie annotation incomplète. Une sortie inattendue compte comme erreur, au lieu
de disparaître sous « non relu ». Les défauts de rôle, capture et identité sont
injectés dans les tests pour vérifier ce contrôle. Le rapport indique aussi les
échanges encore non annotés et les relations attendues absentes.

Le corpus initial conserve **19 décisions, 12 idées attendues, 9 hypothèses
principales reconnues, 3 manquantes et 1 réponse partielle**. Les trois relations
secondaires sont comptées à part ; cinq relations au total et cinq épisodes de
capture sont annotés, sans candidat non relu ni nouvelle reconnaissance principale.
Un contre-exemple de restriction peut avoir un échange correct comme fait
secondaire : cela ne lui invente pas une explication principale.

`externalGames.json` conserve le PGN principal de trois parties publiées, sans
commentaire ni variante d'auteur, leurs sources et les décisions sélectionnées.
`externalCorpus.ts` vérifie le PGN strictement, l'arrivée, la longueur, les indices
et les SAN attendus. Chaque décision conserve tout son passé depuis startpos.
Les huit demi-coups suivants sont **des coups joués**, pas une PV moteur. Les
attentes figurent avant la mesure ; aucun détecteur n'a été réglé dans ce lot.

Voir [EXTERNAL_CORPUS.md](EXTERNAL_CORPUS.md) pour les sources, les attentes et le
bilan séparé. Ce petit échantillon historique n'est pas représentatif des parties
amateurs. Les sources sont indépendantes du détecteur ; les annotations restent
les nôtres, sans relecture pédagogique indépendante. `independentValidation` reste
false. Ne pas fusionner ses résultats avec le corpus construit ni annoncer une
couverture générale sur ce seul échantillon.

Les quatre nouveaux essais UCI chargent deux positions de ce corpus, avant/après
la décision, avec leur historique complet. Sur l'exécution ciblée ShallowRed et
Stockfish 16, les deux trouvent Qb8+ puis la seule réponse Cxb8 et le mat. Ils
trouvent aussi …Fe6, mais préfèrent Dxc3 à Fxb6 en réponse. Le prototype ne reconnaît
ni la déviation/mat ni la compensation. La force du moteur et la capacité à
expliquer ses choix restent des questions distinctes.

Validation de ce lot : **528 tests / 47 fichiers** avec les deux moteurs, puis
**40 tests ciblés** après le dernier contrôle de bilan secondaire ajouté ; lint,
TypeScript et build réussis. Les quatre nouveaux essais UCI passent (36 au total).
Le coût local d'extraction du corpus externe reste de l'ordre de 8–14 s pour
12 décisions selon la charge : aucune intégration synchrone dans React ni
optimisation annoncée. Les assets applicatifs actifs sont inchangés.
