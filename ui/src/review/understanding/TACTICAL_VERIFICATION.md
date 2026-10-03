# Vérification des doubles attaques et clouages

Lot du 3 octobre 2026, isolé de l'interface active. `explanation: null`.
Les cas sont des régressions de développement, sans relecture indépendante.

## Témoins et portée

`tacticalEvidence.ts` suit ensemble les deux cibles de la double attaque, avec
les identités et la commande historique complète. Répondre à l'échec ou sauver
la dame ne suffit pas si l'autre cible reste capturable. Le bilan compte tout
le matériel du camp depuis la décision, avec promotions et compensation sur
une autre pièce. Les réponses aux prises gardent les reprises disponibles,
le choix réel et les échecs intermédiaires. Une reprise non observée empêche
la clôture ; sa disponibilité ne suffit jamais à en faire le bon coup.

Le témoin observe au plus huit demi-coups. Une compensation immédiate est suivie
avant de conclure ; plusieurs coups calmes, une nulle ou une branche incomplète
laissent l'effet indéterminé. Le coup créant la menace adverse peut être un
préfixe d'un seul demi-coup : il ne consomme pas à lui seul la limite des coups
calmes. Aucun scénario éloigné n'est choisi pour fournir une explication.

`targetExchange` sépare le bilan du premier échange de celui du témoin entier.
Exemple Byrne–Fischer : …Cxc3 bxc3 échange deux cavaliers, bilan zéro ; …Cxe4
est une autre prise. Le cavalier c3 qui a disparu défendait e4. La prise du pion
devient ainsi une hypothèse composée : double attaque → échange du défenseur →
prise d'une autre pièce. Fxe7 peut immédiatement compenser cette perte de pion.
Dans ce cas, ce lot refuse d'expliquer le verdict par un gain matériel net.

`observeTactic` exige que la première prise après la défense utilise une cible
originale ; pour une fourchette, son auteur est l'attaquant original. Le suivi
du défenseur échangé ne concerne que la première prise de son camp après cet
échange. Mêmes identités, cases, types et capture ; une reprise par ce défenseur
était légalement disponible avant et ne l'est plus après. Un gain ultérieur
sans ce lien n'est pas attribué à la fourchette.

## Contrastes contrôlés

`TacticalVerification` demande librement avant, après et une alternative
**explicite**. Aucune alternative n'est inventée comme « deuxième choix ».
La légalité est vérifiée avant connexion. Les budgets indépendants sont 300/900
ms par défaut, plafond global 12 s, au plus dix recherches, cache par historique,
révision, moteur, hypothèse et alternative ; arrêt et refus UCI viennent du
contrat commun `BoundedVerification`. Les essais réels utilisent 200/600 ms
et un plafond de test 25 s, sans changer les budgets de l'application.

- **Double attaque directe** : la défense libre règle une cible, puis l'attaquant
  prend l'autre. L'échange entier doit perdre du matériel. L'alternative conserve
  les mêmes identités/types, ne menace plus qu'une des cibles originales, et sa
  défense libre préserve les deux dans un témoin court.
- **Défenseur échangé** : si le premier échange est égal ou favorable au défenseur,
  le gain suivant doit retirer une défense identifiée. Dans l'alternative, après
  sa première réponse libre, la même prise doit être légale, avec les mêmes
  pièces sur leurs cases, et le défenseur conservé doit réellement reprendre dans
  une recherche libre. Le bilan complet de ce contraste doit améliorer le matériel.
- **Clouage empêchant une retraite** : la victime et le roi restent sur leurs
  cases ; le clouage absolu disparaît. La pression indépendante doit garder son
  attaquant, sa capture, ses reprises disponibles et son bilan matériel local.
  La défense libre doit emprunter un déplacement désormais légal et préserver
  la victime. Si l'alternative restaure aussi la reprise du roi, la comparaison
  refuse d'attribuer le résultat à la seule mobilité de la pièce clouée.

Pour une perte permise au coup adverse suivant, rejouer cette même menace après
l'alternative est une question **conditionnelle**, distincte de sa réponse libre.
La reprise du défenseur est également conditionnelle. Ces commandes, portées,
scores et réponses restent dans le rapport ; aucune n'est présentée comme une
variante que le moteur aurait entièrement choisie depuis la décision initiale.
Les questions supplémentaires sont omises si la perte initiale n'est pas soutenue.

L'effet matériel et son attribution ont des statuts séparés. Les deux recherches
doivent retrouver la même victime/attaquant, le même bilan et des scores exacts
en centipions stables. L'attribution exige aussi un gain relatif d'au moins 100 cp
dans les deux comparaisons libres, avec une variation de l'écart d'au plus 100 cp.
Ces seuils sont des critères de développement, **pas un étalonnage pédagogique**.
Le contraste physique doit être utilisé : un écart de score ne suffit pas.
La compensation, les scores de mat, les reprises pendantes et les divergences
empêchent cette attribution. Une cause soutenue reste une contribution dans ces
lignes bornées ; ce n'est ni une preuve de perte contre toutes les défenses,
ni un classement global du meilleur coup.

## Observations réelles et inconnues

Sur le clouage construit, ShallowRed et Stockfish 16 choisissent …Rd7,
dxc6+ bxc6, puis refusent la reprise du fou encore disponible. Le bilan des Noirs
est −2. Après Fd3, les deux choisissent …Cb4, déplacement interdit sous le clouage,
et préservent le cavalier. Ils préfèrent toutefois dxc6 immédiatement dans la
position initiale : cela ne valide pas Fb5 comme meilleur coup.

Sur Byrne–Fischer, les recherches ne sont pas toutes d'accord : Cxa4 peut remplacer
Da3, Fxe7 peut compenser le pion perdu, et la série peut dépasser huit demi-coups
avec une reprise encore possible. Les premières mesures réelles soutiennent le
clouage construit, mais laissent …Ca4 et Fg5 indéterminés. Ce refus ne dit pas
que ces coups sont bons/mauvais ; il dit que le gain matériel court ne suffit
pas à expliquer leur évaluation. Une borne UCI finale est aussi refusée ; les
tests vérifient alors la borne précise et la légalité de la réponse, sans accepter
une panne, un score absent ou une PV incohérente.

Restent : compensation positionnelle/différée, pression durable, surcharge,
contraintes plus longues, motifs de finale et explications minimales relues.
Les reconnaissances des corpus restent 12/12 construits et 4/11 publiés ; ce lot
ne change pas les détecteurs et ne transforme aucune hypothèse en texte publiable.
Il faut un échantillon neuf avant de mesurer la généralisation. Aucune nouvelle
couverture de l'interface n'est annoncée ; aucun fichier du moteur n'est modifié.
