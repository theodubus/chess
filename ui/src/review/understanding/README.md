# Prototype de compréhension — première étape, 2 octobre 2026

Ce dossier est indépendant de l’interface et de l’ancien détecteur de motifs.
Il produit des faits et des hypothèses structurés ; `explanation` reste `null`.
Lancer depuis `ui/` :

```bash
npm run test:understanding
CHESS_ENGINE_BINARY=../target/release/shallowred CHESS_STOCKFISH_BINARY=/usr/games/stockfish npm exec -- vitest run dev/understanding.test.mjs
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
- `exchanges.ts` remonte les reprises consécutives à partir de l’historique connu.
  Le bilan de l’épisode visible est distinct du bilan depuis la décision consultée.
  Sa borne initiale et la possibilité de reprendre encore sont explicites. Un
  épisode entrecoupé de coups intermédiaires n’est pas reconstitué à ce stade.
- `prototype.ts` compose ces relations pour construire l’hypothèse « retraite
  fermée puis pièce attaquée » ou « nouvelle attaque sur une pièce restreinte ».
  La victime et ses sorties sont explicites ; aucune case ou pièce d’un exemple
  n’est codée dans le détecteur. Une capture avantageuse sur une case attaquée
  n’est pas assimilée automatiquement à une sortie perdante.

Les défenses autres qu’un déplacement de la victime, les coups intermédiaires,
les compensations et la meilleure décision restent **à vérifier**. Une PV légale
qui contient le gain attendu ne lève pas à elle seule ces inconnues.

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
les **cinq mécanismes manquants**, pas parmi les réussites. Cette réponse partielle
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
