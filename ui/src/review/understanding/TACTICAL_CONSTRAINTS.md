# Contraintes tactiques — contrat du prototype

Lot du 3 octobre 2026. Ces modules sont isolés de la revue active.
Les faits et hypothèses ne sont pas des raisons publiables du verdict.

## Faits, changements et inconnues

`tacticalFrame` conserve les identités et distingue :

- **Double attaque géométrique** : une pièce attaque au moins deux adversaires.
  Chaque cible garde ses captures légales, ou `null` si la sonde serait impossible
  pendant un échec. Le roi est une cible d'échec, jamais de capture. Les attaques
  de pions sont conservées comme faits ; ce premier candidat de double menace
  exige deux pièces au moins mineures, ou roi et pièce.
- **Clouage absolu** : un seul obstacle ami entre une pièce glissante adverse et
  le roi. La pièce clouée peut encore bouger sur le rayon ou prendre l'attaquant.
  Les coups réellement légaux restent visibles. Un deuxième obstacle empêche ce
  constat ; une prise en passant interdite avec deux obstacles n'est pas décrite
  artificiellement comme ce clouage simple.
- **Alignement relatif** : pièce devant une dame/tour de plus grande valeur.
  Il est distingué du clouage au roi et n'interdit pas légalement de bouger.
  Aucun candidat de gain ou de qualité n'est déduit de ce seul alignement.
- **Mat immédiat disponible** : un coup de mat légal, avec son camp, son roi
  cible et sa portée. Une sonde avec un autre trait est conditionnelle et refuse
  de donner le trait au camp qui vient de donner échec.

`tacticalConstraints` compare la décision et, au plus, la réponse suivante.
Une menace préexistante n'est pas réinventée comme une nouvelle raison du coup.
Il ne cherche pas un motif plusieurs coups plus loin dans la partie ou la PV.
Les rôles « occasion créée » et « perte permise » gardent le camp de la décision.

Exemples et contre-exemples exécutables :

| Décision | Fait reconnu | Ce qui ne peut pas en être conclu |
|---|---|---|
| Cc7+ / …Cc2+ | Échec et tour attaquée | Capture légale de la tour avant une vraie réponse au check |
| …Ca4, Byrne–Fischer | Dame c5 et cavalier c3 attaqués | Gain forcé contre toutes les défenses |
| Cavalier e6 cloué à e8 | Deux attaques géométriques, captures illégales | Fourchette exploitable par ce cavalier |
| Fb5 / …Fb4 | Cavalier cloué au roi | Perte du cavalier ou meilleur coup |
| Te1 devant une tour clouée | Tour contrainte à son rayon | Tour entièrement immobile : Txe1 est légal |
| Dh5 après e4 e5 Fc4 Cc6 | Dxf7 mat conditionnel, pion f7 cloué | Mat forcé : …g6 ou …De7 le prévient |
| Db8+, Morphy | Cxb8 unique, quitte d7, Td8 mat | Toute perte de dame est un bon sacrifice |
| Txd7, Morphy | Dame et tour attaquées si la tour rejouait | Compensation expliquée : …Txd7 enlève cet attaquant |
| …Dxb3, exemple construit | Fou et tour attaqués | Échange gagnant : Fxb3 Txb3 reste perdant pour les Noirs |

Les promotions gardent l'identité du pion. Les camps inversés sont testés. Les
relations secondaires ne remplacent pas l'idée principale du sacrifice ou du mat.

## Preuve courte et comparaison de mat

`shortMateProof` examine toutes les réponses légales depuis la position après la
décision, puis les mats immédiats disponibles. Sa portée est exactement **deux
demi-coups**. La première défense sans mat immédiat, une nulle ou le plafond de
1 200 coups examinés empêche la conclusion universelle. La preuve rejoue la
commande complète, pour conserver répétitions et état terminal historique.
Une fin de partie ou un plafond atteint ne donne pas une preuve vacuement vraie.

Le candidat `deflection-mate` exige aussi une réponse unique capturant la pièce
qui vient d'être jouée, et le déplacement du seul obstacle sur le trajet du mat.
Il n'est pas inféré de la seule présence d'un sacrifice dans une variante.

`MateVerification` compare avant, après et une **alternative légale explicite**,
à deux budgets indépendants (300/900 ms par défaut), via `Engine` et
`FocusedAnalysis`. Au plus six recherches, plafond global 12 s, cache par moteur,
révision et historique, annulation et rejet des réponses inexploitées partagés
avec les autres vérificateurs. Pas de MultiPV ni de searchmoves.

Le moteur doit choisir une réponse de la preuve et annoncer le même camp gagnant
avec mat immédiat. Une PV donnant un autre deuxième coup, un score en centipions
ou une distance de mat incohérente laisse le rapport indéterminé. Si sa PV s'arrête
après la réponse, le mat manquant peut être complété **uniquement par la preuve
légale**, avec `continuation: rules-completed`. Les réponses UCI originales sont
conservées ; ce complément n'est pas présenté comme un coup émis par le moteur.

Le contraste vérifie que l'alternative garde le bloqueur, l'attaquant et le roi
sur leurs cases, sans ajouter d'obstacle sur la même route de mat, puis ne force
pas ce mat dans le même horizon. Il ne prouve pas l'absence de mat plus long. Le choix du
coup aux deux recherches est un statut distinct (`quality`), jamais une
optimalité générale. Les scores de mat ne sont pas convertis en centipions.
L'illustration est exactement la réponse puis le mat, sans reprise de la longue PV.
`explanation` reste `null`.

## Corpus et suite

Les deux corpus ont des annotations explicites par type, rôle, attaquant, cibles
et coup de mat. `[]` signifie aucune contrainte attendue, absence signifie non
relu. Les erreurs et candidats non relus restent dans le rapport. Une annotation
secondaire ne peut pas combler une idée principale manquante.

- Corpus construit : 19 décisions, 12 idées attendues reconnues comme hypothèses,
  une restriction partielle secondaire et zéro explication publiable.
- Corpus publié : 12 décisions, 11 idées attendues, 4 reconnues (deux échanges,
  une double attaque, une déviation), 7 manquantes, zéro explication publiable.
  Ces cas ont désormais servi au développement : il faut un nouvel échantillon
  et une relecture indépendante pour mesurer la généralisation.

Un premier vérificateur des doubles attaques et clouages suit maintenant les
deux cibles, l'échange entier et les défenses conservées dans une alternative.
Voir [TACTICAL_VERIFICATION.md](TACTICAL_VERIFICATION.md) pour les contrats et
abstentions réelles, distincts de cette extraction de faits.
Surcharge, contraintes combinées plus longues,
compensation positionnelle et plans de finale ne sont pas couverts. Une amélioration
de score ne validera pas à elle seule la cause proposée.

Coût local mesuré pour les 12 décisions publiées : environ 25 s pour le prototype
complet, dont 0,48 s pour cette nouvelle extraction tactique, lors d'une exécution
chargée. Les rapports du corpus ont un délai de test de 60 s ; cela ne relève pas
les budgets UCI et n'autorise pas ce calcul synchrone dans React. Les possibilités
et reprises exhaustives restent à optimiser avant intégration.
