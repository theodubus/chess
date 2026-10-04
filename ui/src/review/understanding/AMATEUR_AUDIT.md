# Audit de parties amateurs — 4 octobre 2026

Trois parties complètes choisies **avant toute mesure** dans l'archive standard
de janvier 2013 de la [base publique Lichess](https://database.lichess.org/),
licence CC0. Empreinte vérifiée contre la liste officielle :
`aa40b3671fa3cf1072eb182892cd90b0e1e003a4a5943492f64b77e7f3fd1635`.

Sélection reproductible : premières trois parties légales de fin « Normal »,
40–160 demi-coups, deux classements entre 800 et 1800, temps initial entre 180 et
1200 secondes, sans joueur réutilisé. Aucun filtre sur le motif, l'évaluation
ou la sortie du détecteur. Les ordres retenus sont 8, 9 et 11. Identités remplacées
par Blancs/Noirs ; liens publics, cadence, classements, résultat et passé complet
conservés. `amateurGames.json` contient les 202 demi-coups exécutés avec chess.js.

Ce petit échantillon ne représente pas toutes les parties amateurs. Aucune
attente pédagogique indépendante n'a été annotée : `semanticAssessment` reste
`pending`. Les scores et les textes générés ne deviennent pas une vérité attendue.

## Protocole et observations

`GameReview` analyse toute la partie à 250 ms, avec ses confirmations et vagues
de résolution ordinaires. Pour chaque verdict défavorable, le même
`PedagogicalAnalysis` que l'UI vérifie la conséquence aux budgets 300/900 ms,
plafond 12 s. Les instants de revue et de contrôle sont séparés ; le second
passage garde les évaluations initiales et recalcule seulement les explications.
Le rapport conserve moteur, SHA-256 du binaire, questions, raisons d'abstention,
coût, texte, repère et ancien affichage. Les contrôles logiciels rejouent chaque
position et vérifient les moments des deux camps et du seul joueur humain.

| Moteur / partie | Coups défavorables | Conséquences soutenues | Inconnus | Calculs indisponibles |
|---|---:|---:|---:|---:|
| ShallowRed / 7b44wxzu | 17 | 0 | 17 | 0 |
| ShallowRed / 7rzcutsf | 29 | 0 | 29 | 0 |
| ShallowRed / 1hi3aveq | 16 | 2 | 14 | 0 |
| Stockfish 16 / 7b44wxzu | 15 | 1 | 14 | 0 |
| Stockfish 16 / 7rzcutsf | 36 | 2 | 32 | 2 |
| Stockfish 16 / 1hi3aveq | 13 | 2 | 11 | 0 |

Ce sont **126 décisions moteur × partie**, pas 126 coups distincts. Sept sorties
ont une conséquence soutenue ; cinq décisions distinctes sont concernées. Cela
ne démontre pas que les sept explications sont pertinentes. L'ancien affichage
était « concret » sur deux sorties ; comparer cette présence ne mesure pas une
amélioration de qualité. Aucun coup n'est resté sans classification dans ces
revues ; les inconnues de raison sont un autre problème.

Diagnostics du second passage : 103 cas CP sans candidat, neuf avec une ligne
tactique différente de celle attendue, deux captures de relation non utilisées,
une relation instable, deux mats hors périmètre court et deux réponses moteur
refusées sans score exact/PV exploitable. Aucune explication ne masque ces échecs.
Les 103 absences de candidat sont une lacune de modèle, pas une preuve qu'un
budget plus long suffirait. Les raisons des refus ne sont pas réétiquetées « bon
contrôle » pour améliorer les chiffres.

Coûts locaux observés pour le seul contrôle pédagogique : médiane 289 ms et
95e centile 3,0 s pour ShallowRed ; 280 ms et 3,9 s pour Stockfish. Maximum 7,6 s.
Ces mesures incluent extraction/démarrages ; revue initiale exclue. Charge locale,
ni garantie de latence, ni mesure de fluidité dans un navigateur.

## Relecture concrète

Avec `npm run dev`, ouvrir `/dev/pedagogy-audit.html`. Choisir partie, moteur et
coup ; ← → ou < > parcourent la partie. « Montrer la conséquence » commence au
premier effet utile ; « Retour au coup examiné » revient directement à la partie.
Le camp reste Blancs en bas pendant le défilage. Tous les coups sont accessibles,
y compris ceux sans raison. Cet aperçu est isolé de la partie et ne lance pas
de moteur : les textes viennent exclusivement des observations réelles sauvegardées.

Cas à relire en particulier :

- 1hi3aveq, **21… O-O**, les deux moteurs : le roi abandonne la reprise de Txe7.
- 1hi3aveq, **32. Txc6**, les deux moteurs : mat immédiat par Txe1, double échec.
- 7b44wxzu, **26… Ce7**, Stockfish : Dxg8+ Df8 Ff7 mat, toutes les défenses couvertes.
- 7rzcutsf, **26. Ff1**, Stockfish : le fou bloque la reprise de la dame après Dxh1.
- 7rzcutsf, **32… Td8**, Stockfish : mat en trois malgré les réponses légales.
- 7b44wxzu, **18… Cf6**, les deux moteurs : verdict défavorable, raison manquante.

Relecture échiquéenne de pertinence et validation visuelle bureau/mobile encore
ouvertes. CUA a été interrogé : aucune application ou navigateur disponible.
L'exécution PGN, les filtres de moments et la légalité des repères ne prouvent
pas que le parcours souris/clavier du produit a été testé visuellement.

## Reproduction

```bash
node dev/sample-amateur-games.mjs --archive /tmp/chess-amateur-2013-01.pgn.zst
npm run pedagogy:audit -- --stockfish /chemin/stockfish
npm run pedagogy:audit -- --stockfish /chemin/stockfish --reuse-review
```

Le dernier mode ne réutilise que les évaluations d'une même partie, même budget
et même binaire. Les contrôles pédagogiques sont toujours recalculés. Ne pas
régénérer l'instantané pendant les tests qui le lisent. Les résultats peuvent
changer avec les recherches ; conserver les divergences et les dates.

Suite : contraintes de défense combinées et détournement par reprise, témoins
avec compensation, puis activité/structure/sécurité du roi. Les raisons purement
positionnelles ne seront pas ajoutées comme phrases de remplacement sans modèle
causal. La nouvelle sélection n'a pas encore servi à régler les détecteurs ; si
cela arrive, marquer `usedForDevelopment` et constituer un autre contrôle neuf.

## Second passage — menaces ignorées, 4 octobre

Rapport séparé `dev/pedagogy-audit-ignored-data.json`, aperçu
`/dev/pedagogy-audit.html?sample=ignored`. Les mêmes évaluations, classifications et
binaires ont été réutilisés ; seules les explications et leurs contrôles sont
recalculés. Le rapport original reste disponible. Empreintes des nouvelles
sources (détournement, menace ignorée et note de reprise) également conservées.

Sur les mêmes 126 décisions : **sept conséquences soutenues, 118 raisons non
confirmées et une indisponible**. Le nouveau mécanisme a été interrogé sur 21
sorties et n'en a soutenu aucune. Cela ne démontre pas un gain de couverture sur
ces parties, malgré quatre sorties soutenues sur ses exemples construits. Le
passage de deux indisponibilités à une reflète un nouveau calcul, pas une qualité
pédagogique validée. Les chiffres CP de comparaison ne deviennent pas une cause
matérielle ; une compensation ou une défense qui ne préserve pas la pièce garde
l'abstention. Relecture sémantique toujours `pending`.

Lacune suivante identifiée dans le code : les relations comparent surtout des
pièces restées sur leur case. Un mauvais coup déplaçant lui-même une pièce vers
une capture demande un autre fait. Le modèle devra distinguer la capture de la
pièce déplacée, l'épisode matériel local et le bilan total. Un échange initial
équilibré suivi de la perte d'une autre pièce ne doit pas être faussement décrit
comme perte de matériel causée par cette première capture. Les meilleures
réponses qui échangent la victime avec compensation restent également à traiter.
