<!-- socle: couche=backlog zone=publique -->
# B-0071 — Ordonner les matchs d'une séance par la perte tenue à l'écart

> statut : ouvert · origine : J-2026-11-18-CN · après : B-0065 · priorité : basse · lu : backlog@6e7fa681

Idée non décidée de la longue traîne : sa première étape est la décision
de la tester ou de l'abandonner (B-0065, D-0020, D-0021). L'agent ne s'y met pas avant.

Le 29 oct. 2026, les six réseaux de C2c — pas final, taille de lot,
premier demi-coup gardé, à données, perte et architecture fixées — se
sont rangés par leur perte tenue à l'écart, sur les données de leur
étiqueteur, exactement comme par leurs matchs ; une prédiction écrite
avant le dernier verdict a tenu (J-2026-11-18-CN). Au hasard, six points
se rangent ainsi une fois sur 720. La perte ne range pas ce qui change la
cible elle-même, le poids du résultat ou l'exposant de la perte, et ne
dit jamais l'échelle d'un écart (`AGENTS.md`, « cette valeur d'évaluation
est meilleure »). Inférence de l'agent, confiance faible : si elle range
aussi des architectures à données fixées, une séance de plusieurs réseaux
lancerait d'abord le match du premier de l'ordre, quatre minutes de
runner pour ordonner des heures de match ; jamais un verdict. Son test le
moins cher : les pertes de N10r10h512 et de N10h512, et l'ordre qu'elles
prédisent, écrits avant leur match. Il ne coûte presque rien et ne se
reprend pas après coup : l'agent l'a mis dans B-0012 le 18 nov. 2026, sans
attendre B-0065. Un seul couple de réseaux vaut un point, à une chance
sur deux au hasard ; la décision de la règle en demande davantage.

## Satisfait quand

- [ ] l'agent a décidé de la tester ou de l'abandonner, marge contre coût (D-0021)
- [ ] si testée : l'ordre prédit avant les matchs d'une séance, confronté à leurs verdicts, et la règle écrite au skill `preparer-une-seance` ou abandonnée
