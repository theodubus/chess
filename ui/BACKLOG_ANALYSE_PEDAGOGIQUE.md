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

### 2. Motifs tactiques et lien causal

- [ ] Fourchettes/doubles attaques et gain réellement illustré par la suite.
- [ ] Clouages absolus/relatifs : pièce, attaquant, cible et conséquences.
- [ ] Défenseur déplacé/supprimé, pièce non défendue, attaque à la découverte.
- [ ] Menaces de mat/progression du pion et occasions manquées.
- [ ] Bons coups défensifs : menace évitée ; bons coups offensifs : occasion exploitée.
- [ ] Une seule explication prioritaire, sélectionner la plus utile et vérifiable.

### 3. Apprentissage et recherches ciblées

- [ ] Indices graduels intégrés à Réessayer, sans divulgation anticipée.
- [ ] Réutiliser les résultats existants ; approfondissement seulement si nécessaire.
- [ ] Budgets bornés, annulation à la navigation, cache par moteur/revue/position.
- [ ] Afficher la vérification en cours sans bloquer la lecture de la partie.
- [ ] Tester les changements de moteur et résultats tardifs/incohérents.

### 4. Observations positionnelles

- [ ] Développement, colonnes ouvertes, structure de pions, sécurité du roi,
  activité et contrôle de cases utiles.
- [ ] Distinguer observation descriptive et cause confirmée du verdict moteur.
- [ ] Comparaisons ciblées et formulation prudente ; aucun remplissage automatique.

## État de reprise

- Branche : `codex/ui-polish`, PR existante #111 (correctif matériel et interactions).
- Entrée principale : `src/review/InteractiveReview.tsx` ; texte générique dans
  `study.ts::moveSummary` et `annotations.ts::reason`.
- `GameReview.results[i]` analyse la position i AVANT son prochain coup ; le coup
  affiché à la position i>0 est celui de i-1. La réfutation vient de results[i].
- `BranchAnalysis.before/result` fournissent le même couple pour une variante.
- `StudyTree` conserve les variantes utilisateur. Ne pas y insérer la démonstration.
- `Board` utilise Chessground et conserve les dessins tant que la FEN ne change pas.
- Pas de MultiPV/searchmoves dans ShallowRed. Une vérification ciblée future peut
  analyser une position après le coup candidat, via l’adaptateur existant.
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
