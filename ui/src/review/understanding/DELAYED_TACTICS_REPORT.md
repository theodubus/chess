# Tactiques différées — bilan de l'expérience bornée

4–5 octobre 2026. **Expérience close ; aucun raccordement au produit.**
L'analyse reste une fonctionnalité annexe. Les deux lots autorisés sont terminés,
sans nouvelle famille de détecteurs ni prolongation automatique de la backlog.

## Résultat et décision

Le prototype reconnaît une fourchette ou un clouage dans une position ultérieure,
sans condition sur une case ou un PGN particulier. Il suit la provenance des
placements, des cases libérées et des réponses à un échec, puis compte la perte
et les reprises. Cela marche sur les contre-épreuves choisies.

**Le gain utile sur les parties mesurées est nul.** Repérer une tactique ne suffit
pas à attribuer le verdict au coup consulté. Les deux seules décisions avec une
dépendance et une perte observée échouent au contraste légal :
l'alternative change des pièces prises ou la possibilité des coups préparatoires.
Les accepter nécessiterait une autre démonstration, pas simplement plus de temps.

Le modèle reste dans un outil de développement, sans import par le parcours de
revue. Le bundle et les recherches pédagogiques de l'utilisateur n'incluent pas
cette expérience. Le jalon existant est conservé avec ses limites ; aucune phrase
générale sur le centre ou le développement ne remplace une raison manquante.

Ce résultat ne démontre pas l'impossibilité d'un modèle plus pertinent avec UCI.
Il montre que **cette méthode prudente n'a pas apporté assez dans le périmètre
court testé**. Assouplir l'attribution ou construire un modèle causal plus complet
constituerait un autre chantier. Il n'est pas lancé sous l'autorisation actuelle.

## Mesure conservée

| Échantillon | Décisions moteur × coup | Motif différé | Dépendance à la décision | Dépendance et perte observée | Contraste accepté | Nouvelle raison confirmée |
|---|---:|---:|---:|---:|---:|---:|
| Trois parties déjà conservées | 126 | 43 | 20 | 1 | 0 | 0 |
| Trois nouvelles parties | 91 | 32 | 18 | 1 | 0 | 0 |

Les motifs sont recherchés jusqu'à six demi-coups après la décision ; captures
et reprises jusqu'à huit. Les chiffres comptent des décisions, pas des événements.
Ils concernent les catégories défavorables du moteur, pas tous les coups ni
toutes les occasions favorables. Une dépendance physique n'est pas une cause.

Le nouveau prélèvement est figé avant les recherches : les trois prochaines
parties admissibles de la même [archive publique Lichess](https://database.lichess.org/),
après exclusion du prélèvement précédent. Conditions : partie normale et légale,
40–160 demi-coups, deux Elo 800–1800, temps initial 180–1200 s, joueurs distincts,
ordre de l'archive. `z2ncoii6`, `55a83jiu`, `fiv37vzi` totalisent 203 demi-coups.
PGN et sélection : [delayed-tactics-games.json](../../../dev/delayed-tactics-games.json).
Aucune sélection par score ou motif, aucun réglage après cette mesure.

Les deux moteurs inchangés sont ShallowRed et Stockfish 16, avec les empreintes
des binaires enregistrées. La revue utilise 250 ms, puis ses confirmations
habituelles. L'analyse pédagogique actuelle sur les mêmes 91 décisions soutient
six conséquences et s'abstient sur 85, sans indisponibilité. **Ce sont des sorties
moteur, pas six explications validées par un humain.** La nouvelle couche n'ajoute
aucun candidat acceptable, et ne lance donc aucune vérification supplémentaire
sur ces parties après le filtrage.

Les vérifications libres à 300/900 ms ont aussi porté sur trois témoins construits,
avec chacun des deux moteurs : fourchette différée blanche, symétrique noire,
clouage différé. ShallowRed corrobore un candidat ; les cinq autres essais sont
refusés (motif ou contraste changé). Même le candidat reste `publishable: false`.
27 recherches déclarées, six rapports complets, aucun échec sans coût enregistré.
Ils montrent les refus du modèle ; ils ne constituent pas un test indépendant.

Coût local du prototype conservé : médiane 67 ms, p95 232 ms, maximum 666 ms.
Sur le nouveau prélèvement : médiane 80 ms, p95 325 ms, maximum 412 ms ; ce passage
chevauche en partie le rejeu du prélèvement précédent, donc pas de comparaison de
performance revendiquée. Les six essais moteur construits prennent 2,0–4,5 s
chacun, sous le délai de 12 s. Aucun coût supplémentaire n'est activé dans l'UI.

Instantanés :
[conservé](../../../dev/delayed-tactics-prototype-data.json),
[revue neuve](../../../dev/delayed-tactics-audit-data.json),
[prototype et vérifications neuves](../../../dev/delayed-tactics-fresh-data.json).
Ils gardent les sources, empreintes, questions libres, positions, variantes,
refus et évaluations sémantiques `pending`. Aucun pourcentage de pertinence
pédagogique générale ne se déduit de ce petit échantillon.

## Reproduire et vérifier

Depuis `ui/` :

```bash
npm run pedagogy:delayed
npm run pedagogy:audit -- --manifest dev/delayed-tactics-games.json \
  --stockfish /chemin/stockfish --output dev/delayed-tactics-audit-data.json
npm run pedagogy:delayed -- --source dev/delayed-tactics-audit-data.json \
  --manifest dev/delayed-tactics-games.json --output dev/delayed-tactics-fresh-data.json \
  --verify --stockfish /chemin/stockfish
```

Les instantanés ne doivent pas être régénérés pendant leurs tests. Les nouvelles
positions et suites ont été exécutées avec chess.js avant leur insertion.
Les tests contrôlent légalité, symétrie, menace préexistante, erreur intermédiaire,
compensation, identité d'une occurrence, contraste, divergence entre budgets,
cache, arrêt et fidélité des instantanés. Ce sont des contrôles logiciels ;
aucune nouvelle relecture pédagogique ni vérification visuelle n'est revendiquée.
La vérification locale finale passe : 869 tests unitaires dans 70 fichiers,
lint, TypeScript et build. Trois tests existants ont d'abord dépassé leur temps
lors d'une exécution concurrente avec la mesure moteur ; la suite entière passe
avec deux workers et sans cette concurrence, sans changement d'assertion ou délai.
