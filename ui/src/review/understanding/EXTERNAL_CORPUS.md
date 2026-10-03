# Corpus de parties publiées — mesure du 3 octobre 2026

Ce corpus est séparé des 19 exemples de développement. Il contient **12 décisions
sur trois parties**, avec une sélection fixée avant la première mesure du prototype.
Les PGN sont conservés dans `externalGames.json` : import strict, coups légaux,
position finale, longueur, indices et SAN vérifiés. Le passé est complet depuis la
position initiale. Les continuations sont les coups réellement joués, limités à
huit demi-coups ; **elles ne représentent pas la meilleure défense du moteur**.

Les coups et métadonnées de la ligne principale viennent de ces exports publics,
consultés le 3 octobre 2026. Les commentaires et variantes d'auteur sont exclus :

- [Morphy – duc de Brunswick et comte Isouard, 1858](https://lichess.org/study/OqP6ZEZX/XOlpJYfH).
- [Byrne – Fischer, 1956](https://lichess.org/study/T2uBqZJH/vGAj5Ztx).
- [Capablanca – Tartakower, 1924](https://lichess.org/study/M3mZMe8l/MshiKf1G).

Les sources sont indépendantes du code ; les attentes et leurs justifications sont
nos annotations. Elles n'ont pas encore été relues indépendamment. Trois parties
historiques connues ne représentent pas les parties amateurs. Le champ
`independentValidation` reste donc **false**. Aucun détecteur n'a été modifié pour
améliorer les résultats de cette livraison. Si ces cas servent ensuite à développer
les familles manquantes, ils deviennent aussi des régressions de développement :
un autre échantillon neuf sera nécessaire pour mesurer la généralisation.

## Résultat séparé

| Décision | Idée ou fait attendu | Résultat du prototype |
|---|---|---|
| Morphy, 2… d6 | Aucun motif tactique attendu pour ce coup calme | Aucune hypothèse inattendue |
| Morphy, 9… b5 | Exposition tactique du roi, suite avec tempo | Idée manquante |
| Morphy, 13. Txd7 | Sacrifice avec compensation au-delà de l'échange local | Idée manquante ; épisode Txd7 Txd7 à −2 correctement décrit |
| Morphy, 16. Db8+ | Déviation du cavalier suivie de mat | Idée manquante |
| Byrne–Fischer, 6… dxc4 | Échange de pions dxc4 Dxc4 | Contexte reconnu, bilan 0 |
| Byrne–Fischer, 11… Ca4 | Double attaque sur dame et cavalier | Idée manquante |
| Byrne–Fischer, 17… Fe6 | Sacrifice avec compensation tactique | Idée manquante |
| Byrne–Fischer, 25… Cxd1 | Prise de tour sans reprise immédiate | Contexte reconnu, bilan +5 |
| Capablanca, 22. Rg2 | Activité du roi dans un plan de finale | Idée manquante |
| Capablanca, 27. h5 | Percée qui prépare l'ouverture de la colonne h | Idée manquante |
| Capablanca, 35. Rg3 | Marche du roi malgré une prise avec échec | Idée manquante |
| Capablanca, 37. g6 | Pion passé et coopération roi/tour | Idée manquante |

**11 idées/faits attendus, 2 contextes d'échange reconnus, 9 idées manquantes,
1 décision calme sans motif tactique attendu, 0 explication publiable.**
Aucune hypothèse inattendue dans cette exécution. Les listes de relations attendues
sont explicites ; aucun candidat de relation ou échange ne reste non annoté.
Ce zéro ne mesure ni les erreurs textuelles de l'ancienne UI ni toutes les familles
échiquéennes : le prototype reste très sélectif et manque la plupart de ces idées.
Les faits d'échange reconnus ne sont pas des explications de qualité du coup.

Les attentes stratégiques décrivent l'idée à comprendre ; elles n'affirment pas
qu'un coup calme est optimal. Le PGN peut montrer une combinaison réussie sans
prouver que toutes les défenses permettent cette réussite. Les bilans matériels
ne justifient pas seuls un verdict sur un sacrifice.

## Contrôles échiquéens et moteur

Les tests vérifient directement, sans utiliser la sortie du détecteur comme vérité :

- Après Db8+, Cxb8 est l'unique réponse légale, puis Td8 est mat.
- Après …Ca4, la dame c5 et le cavalier c3 sont réellement attaqués.
- Le pion g6 est passé : aucun pion noir adjacent ne se trouve devant lui.
- Txd7 Txd7 coûte deux points aux Blancs ; les coups calmes suivants interrompent
  cet épisode local. Le mat ultérieur ne transforme pas ce bilan en cause complète.

Les quatre essais UCI supplémentaires utilisent ShallowRed et le Stockfish 16 de
la CI, budget 600 ms par position, avant/après décision avec l'historique complet.
Lors du contrôle ciblé, les deux trouvent Db8+ avec mat et …Fe6. Après …Fe6, ils
préfèrent **Dxc3**, alors que la partie publiée joue Fxb6. Le prototype ne reconnaît
ni la déviation/mat ni la compensation dans leurs réponses. Ces choix sont des
observations reproductibles, pas des attentes figées de score ou profondeur.

La comparaison montre une limite de l'explicateur : trouver un coup avec le moteur
ne suffit pas à identifier et expliquer son idée. Elle montre aussi pourquoi
rejouer automatiquement la suite historique comme preuve optimale serait trompeur.
Les scores unitaires du corpus sont absents ; ils ne sont pas simulés comme preuve
échiquéenne. Les nouvelles données ne sont pas importées par l'interface active.

## Reproduction

Depuis `ui/`, sans téléchargement réseau nécessaire :

```bash
npm exec -- vitest run src/review/understanding/corpus.test.ts src/review/understanding/externalCorpus.test.ts --maxWorkers=2 --reporter=verbose --silent=false --disableConsoleIntercept
CHESS_ENGINE_BINARY=../target/release/shallowred CHESS_STOCKFISH_BINARY=/usr/games/stockfish npm exec -- vitest run dev/understanding.test.mjs -t 'partie publiée' --reporter=verbose --silent=false --disableConsoleIntercept
```

Le rapport imprime les cas manquants, erreurs, couverture des annotations,
provenances et temps d'extraction. L'extraction exhaustive reste coûteuse et
synchrone ; elle ne doit pas être placée telle quelle dans le rendu React.
La suite est de modéliser double attaque, clouage et menace de mat comme contraintes
combinées, puis de vérifier leurs contributions. Les plans de finale et compensations
positionnelles restent un problème plus large qu'un motif de capture.
