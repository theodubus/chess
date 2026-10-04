# Expliquer une occasion sans prouver le meilleur coup

Raccordement implémenté et CI lue le 4 octobre 2026 (`99dacf4`). Le même
parcours pédagogique traite les conséquences adverses et les occasions favorables
des mécanismes existants. L'ancien explicateur ne reprend pas la place d'une
cause refusée. Une reprise connue garde son contexte, et le mat déjà joué reste
une preuve des règles. Aucun détecteur stratégique supplémentaire n'est ajouté.

## Contrat

- La classification reste celle de la revue et ne vient jamais du détecteur.
- Une double attaque/clouage créée par le coup peut être expliquée par sa propre
  conséquence courte, si deux recherches libres retrouvent la contrainte, la
  capture qui l'exploite, les réponses et le bilan après reprises.
- L'identité du bénéficiaire doit être le camp qui a joué. Une même observation
  favorable ne devient pas une raison principale pour une erreur.
- Une prise compensée ou un mat adverse garde l'abstention. La préexistence du
  motif doit empêcher d'attribuer sa création au coup examiné.
- Deux réponses CP exactes doivent montrer les mêmes identités, capture, bilan
  complet et bilan après reprises. Leur distance numérique ne prouve ni ne
  réfute ce gain physique. La classification et une attribution comparée gardent
  leurs propres contrôles ; un score de mat n'est pas converti en points.
- Sans comparaison, le clouage ne sert de cause isolée que si la pression de
  capture et les reprises existaient déjà avant le coup. Retirer aussi une défense
  du roi constitue un changement supplémentaire qui impose l'abstention.
- Le texte décrit l'occasion exploitée et son gain dans ces lignes. Il ne
  conclut ni que toutes les défenses perdent, ni que ce choix est unique/optimal,
  ni qu'il explique à lui seul la totalité de la variation du score.
- Le repère commence après le coup joué, avec les cibles visibles. Réponses et
  reprises utiles restent dans le témoin ; aucune alternative obligatoire.
- Les reprises connues gardent leur note de contexte et ne démarrent pas un
  nouvel échange présenté comme gagnant.

## Implémentation et validation

1. La conséquence favorable est séparée de l'attribution comparée.
   Revalider les résultats physiques ; refuser les rapports altérés. Réutiliser
   le vérificateur d'effet et ses limites sans ajouter de recherche imposée.
2. Seules les familles vérifiées sont raccordées à la revue : mêmes progression,
   annulation, cache, préférences et démonstration. Désactiver leurs anciennes
   causes concurrentes ; ne pas transformer un inconnu en observation de centre.
3. Régressions exécutées avec chess.js : les deux camps, motif préexistant,
   échange équilibré, compensation, prise d'une autre pièce et reprise antérieure.
   Deux défenses peuvent illustrer la même occasion sans prouver un choix unique.
4. Les mesures UCI réelles, la provenance et les abstentions sont conservées.
   Relecture indépendante et parcours visuel restent des validations distinctes
   des tests logiciels, encore à réaliser.

## Mesures réelles de développement

Deux moteurs inchangés : ShallowRed et Stockfish 16. Cinq positions existantes,
deux budgets de 300/900 ms, deux recherches libres par budget, délai total 12 s.
`dev/favourable-consequence-first-data.json` garde les dix premiers essais (deux
textes), avant séparation de la distance CP et de la stabilité matérielle.
`dev/favourable-consequence-data.json` conserve les dix suivants (six textes).
Les fourchettes roi/tour des deux camps et le clouage avec pression conservée
produisent des repères de trois ou quatre positions. Le clouage dont les reprises
changent et la suite de Byrne avec compensation/divergence restent sans texte.
Les questions UCI, variantes complètes et empreintes des binaires sont sauvegardées.

Ces positions de développement ne mesurent pas la généralisation. Aucun verdict
de pertinence humaine n'est produit par le script. L'audit adverse de 126 décisions
reste distinct et ne change pas de dénominateur.

Reproduction depuis `ui/`, hors tests de lecture des instantanés :

```bash
npm run pedagogy:review -- --direct --stockfish /chemin/stockfish --cases fork-direct,fork-black,pin-retreat,pin-defence-changed,byrne-22 --output dev/favourable-consequence-data.json
```

Relecture avec `npm run dev` : `/dev/pedagogy-review.html?sample=opportunity`.
Examiner le texte, puis le repère ; une abstention est un résultat à conserver.
Vérifier que l'on comprend le gain du joueur, sans une prétention de meilleur
choix global ni de gain forcé contre toutes les défenses.

Les raisons purement positionnelles et les compensations éloignées nécessitent
un modèle supplémentaire. Elles ne seront pas ajoutées comme simples phrases
pour combler le manque de couverture.
