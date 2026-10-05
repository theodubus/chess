# Reprise détournant un défenseur — contrat du 4 octobre 2026

Après le coup examiné, un premier attaquant prend la pièce déplacée. La reprise
par un défenseur commun le déplace hors de portée d'une seconde pièce, prise
par un autre attaquant. Les trois prises, les cinq identités et les positions
avant/après sont suivies. Une exposition déjà présente, une reprise encore légale
ou un défenseur restant géométriquement en prise sur la seconde case sont refusés.
Le modèle inclut aussi le défenseur encore aligné mais cloué devant son roi.
Après la seconde prise, sa reprise géométrique doit réellement découvrir
l'attaque du même cloueur sur son roi ; le déplacement illégal est distingué
des coups légaux le long du clouage. Un alignement relatif devant une dame ne
rend pas une reprise illégale et n'est pas traité comme tel.

Le motif ne produit pas une explication seul. Quatre questions libres par budget
(300/900 ms) : avant la décision, après le coup, après la première prise, après
la reprise. La reprise et la seconde capture doivent correspondre à ces réponses.
Les variantes sont bornées à huit demi-coups avec reprises, échecs, promotions,
nulle et compensation immédiate. Le bilan est calculé depuis la décision.

Le témoin assemblé doit conserver le bilan de la PV fraîche après le coup :
une recherche ultérieure tronquée ne masque pas une compensation déjà observée.
Les deux budgets doivent retrouver les mêmes identités, déplacements, issue et
bilan, avec scores CP exacts stables après le coup, la prise et la reprise.
Un score de mat dans ces recherches laisse cette famille indéterminée. Le score
antérieur, conservé dans le rapport, ne chiffre pas la perte ni l'écart à un
meilleur coup : un mat antérieur ne devient jamais un prix matériel. C'est le
même contrat de conséquence directe que pour la retraite fermée. Arrêt, cache par moteur,
révision et historique, connexions tardives et plafond global restent communs.

Le brouillon revalide les questions et recalcule les faits et bilans. Son repère
commence après le coup, montre prise/reprise/seconde prise et garde les réponses
nécessaires. Il distingue le bilan après la première reprise du bilan final.
« Le moteur choisit de reprendre » n'affirme pas une reprise forcée. Aucune
alternative ni unique meilleur coup n'est nécessaire. La portée consultable
explique que des réponses libres depuis plusieurs positions ont été assemblées.

La revue négative essaie ce candidat avant les conséquences isolées, puis un
autre au maximum : au plus quatorze recherches, toujours douze secondes pour
l'ensemble. Cette borne n'est pas une promesse de fluidité. Les faits et les
scores simulés vérifient le logiciel ; ils ne prouvent pas la pertinence générale.

Six essais réels enregistrés dans `dev/diverted-defence-data.json` : les deux
moteurs soutiennent les cas blanc/noir (quatre sorties) et gardent l'abstention
sur le cas construit avec compensation (prise différente pour ShallowRed,
score de mat pour Stockfish). Aucune recherche forcée pour obtenir le motif.
Questions, scores, variantes, coûts et empreintes des binaires sont conservés.
Relecture : `/dev/pedagogy-review.html?sample=diversion`, y compris les inconnus.

```bash
npm run pedagogy:review -- --stockfish /chemin/stockfish --cases diverted-white,diverted-black,diverted-compensation --output dev/diverted-defence-data.json
```

Ce ne sont pas six décisions indépendamment annotées, ni une mesure de couverture.
Les moteurs peuvent changer leur ligne. Le contrôle de la revue borne aussi la
PV initiale à huit demi-coups et à la première fin de partie : une PV Stockfish
réelle continuant après une nulle par matériel insuffisant a servi de régression.

Restent ouverts : autres formes de surcharge, contraintes relatives,
coups intermédiaires plus longs, compensations positionnelles et
validation pédagogique indépendante. Les nouveaux tests ne changent pas les
mesures de couverture de l'audit amateur précédent.

Le lot du clouage ajoute défenseurs tour/dame, deux camps, contre-exemples sans
cloueur et alignement relatif. Une position construite relative plaçait déjà le
roi hors trait en échec ; corrigée et réexécutée avant inscription, puis contrôle
de ce défaut ajouté à tous les exemples. Aucun changement moteur pour ces FEN.
Les douze essais libres conservés dans `dev/pinned-defence-data.json` ne
soutiennent aucune nouvelle explication : autre première prise/suite, relation
non confirmée ou réponse sans score exact/PV exploitable. Cela conserve la lacune,
sans ajuster les règles pour forcer le moteur à jouer le motif.
Relecture : `/dev/pedagogy-review.html?sample=pin`, abstentions incluses.
