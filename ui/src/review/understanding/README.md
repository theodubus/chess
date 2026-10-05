# Compréhension du coup — état livré

Mis à jour le 5 octobre 2026. Ce module produit des faits légaux, des hypothèses
et des conséquences courtes vérifiées. Il ne constitue pas une explication
générale des décisions d’un moteur d’échecs.

Le [périmètre produit et ses limites](../../../ANALYSE_PEDAGOGIQUE.md) fait
référence. La [backlog de clôture](../../../BACKLOG_ANALYSE_PEDAGOGIQUE.md) est
finie ; les causes inconnues ne deviennent pas de nouvelles tâches. La sélection
humaine est fixée dans la [relecture finale](../../../RELECTURE_ANALYSE.md).

## Parcours des données

- `context.ts`, `possibilities.ts` et `relations.ts` construisent les faits :
  pièces identifiées, coups légaux, attaques, captures, défenses et lignes.
  Une attaque géométrique reste distincte d’une capture légale.
- `exchanges.ts` conserve le début connu des reprises, le bilan de l’épisode
  et celui depuis la décision consultée. Une FEN seule ne fournit pas son passé.
- Les générateurs composent des hypothèses physiques. Les vérificateurs
  confrontent ces hypothèses aux recherches libres du moteur à deux budgets,
  sans supposer `MultiPV` ou `searchmoves` et sans recherche stratégique dans l’UI.
- `PedagogicalAnalysis` raccorde les conséquences adverses et favorables
  soutenues. Il limite le travail au coup consulté, au plus deux candidats,
  quatorze recherches et un délai partagé de 12 secondes. Les budgets des
  recherches sont de 300 et 900 ms. Cache, navigation et annulation empêchent
  la publication d’un résultat périmé.
- Les brouillons et `directExplanation` utilisent les mêmes faits pour le texte
  et les repères. Le témoin commence après la décision ; les variantes moteur
  brutes et les observations positionnelles sont présentées séparément.

Une reprise connue n’ouvre pas artificiellement un nouvel échange gagnant.
Une promotion apporte d’abord sa différence de matériel ; sa capture éventuelle
retire ensuite la valeur de la pièce promue. Les compensations, les réponses
instables et les recherches indisponibles gardent l’abstention. Les mats courts
ont leur contrôle propre et ne sont pas convertis en bilan matériel.

Les fichiers du prototype différé sont conservés pour reproduire son bilan.
Ils ne sont pas activés dans l’UI : aucune nouvelle explication acceptable n’a
été ajoutée par cette expérience bornée. Ils ne constituent pas un prochain lot.

## Contrats et mesures conservés

| Sujet | Document |
|---|---|
| Conséquences adverses et limites des variantes | [TACTICAL_VERIFICATION.md](TACTICAL_VERIFICATION.md) |
| Retraites fermées et clouages | [RESTRICTION_VERIFICATION.md](RESTRICTION_VERIFICATION.md) |
| Menace déjà présente et ignorée | [IGNORED_THREAT.md](IGNORED_THREAT.md) |
| Pièce jouée puis capturée, promotions | [MOVED_PIECE_EXPOSURE.md](MOVED_PIECE_EXPOSURE.md) |
| Défenseur détourné | [DIVERTED_DEFENCE.md](DIVERTED_DEFENCE.md) |
| Reprise et bilan d’un échange commencé | [RECAPTURE_CONTEXT.md](RECAPTURE_CONTEXT.md) |
| Occasion favorable, sans promesse du meilleur coup | [FAVOURABLE_CONSEQUENCE.md](FAVOURABLE_CONSEQUENCE.md) |
| Preuves de mats courts | [MATE_CONSEQUENCE.md](MATE_CONSEQUENCE.md) |
| Résultats du périmètre tactique | [TACTICAL_MILESTONE_REPORT.md](TACTICAL_MILESTONE_REPORT.md) |
| Audit fixé de parties amateurs | [AMATEUR_AUDIT.md](AMATEUR_AUDIT.md) |
| Expérience différée close | [DELAYED_TACTICS_REPORT.md](DELAYED_TACTICS_REPORT.md) |

Ces mesures portent sur les sorties logicielles. Les instantanés gardent leurs
refus et leur provenance ; ni un texte présent, ni une CI verte ne prouvent sa
pertinence pédagogique. Le journal détaillé antérieur reste dans l’historique Git
et la [backlog historique](../../../BACKLOG_ANALYSE_PEDAGOGIQUE_HISTORIQUE.md).

## Vérifier ou reproduire

Depuis `ui/` :

```bash
npm run test:understanding
CHESS_ENGINE_BINARY=../target/release/shallowred CHESS_STOCKFISH_BINARY=/usr/games/stockfish npm exec -- vitest run dev/understanding.test.mjs --maxWorkers=1
```

Les liens de la relecture finale utilisent les instantanés conservés : inutile
de les régénérer pour relire le texte. Les commandes `pedagogy:review`,
`pedagogy:audit` et `pedagogy:delayed` servent aux mesures manuelles décrites dans
leurs rapports. Ne pas régénérer un instantané pendant les tests qui le lisent.

Pour toute maintenance, lire `ui/CLAUDE.md`. Les nouvelles positions et suites
se construisent avec chess.js avant inscription ; ne modifier que `ui/**`.
