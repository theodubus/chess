# Prototype de compréhension — contexte et vérification, 2 octobre 2026

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
| Défenseur supprimé | 1 | 0 | 0 |
| Ligne ouverte | 1 | 0 | 0 |
| Menace de mat | 1 | 0 | 0 |
| Développement ordinaire / attaquant cloué | 0 | 0 | 2 |
| **Total** | **12** | **7** | **7** |

Le clouage produit un fait partiel correct (la pièce attaquée est restreinte),
mais le prototype n’explique pas encore son lien avec le roi. Il reste donc parmi
les **cinq mécanismes manquants**, pas parmi les réussites. Les nouveaux faits
sur les défenses et les lignes ouvertes sont également disponibles séparément,
mais leur attribution au verdict n'est pas encore vérifiée : ce compteur de
mécanismes reste inchangé. Cette réponse partielle
est annotée dans le corpus et comptée séparément des hypothèses erronées.

- Zéro hypothèse interdite sur ces contre-exemples de développement.
- **Zéro explication publiable**, y compris pour les sept faits/mécanismes reconnus.
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
profondeurs, témoins, comparaisons et coûts. Exemple d'une exécution locale :

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

La causalité comparative générale, les sacrifices positionnels et les cinq familles
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
et un même déplacement UCI qui devient une capture différente. Le corpus initial de
19 décisions et ses cinq familles manquantes reste inchangé.

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

Aucun de ces résultats n'est encore transformé en texte dans l'UI. La composition
et la vérification causale des défenses/lignes ouvertes, les compensations longues,
le corpus indépendant et le contrat de démonstration restent à construire.
