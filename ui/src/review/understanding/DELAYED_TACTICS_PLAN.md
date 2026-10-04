# Expérience bornée : expliquer les tactiques différées

Demande du 4 octobre : comprendre, par exemple, qu'un mauvais coup autorise une
fourchette deux coups plus tard, sans programmer une liste de centaines de positions.
Expérience autorisée. Théo précise que l'analyse est une fonctionnalité annexe :
améliorer la pertinence dans un budget court, sans des dizaines de sessions.
**Les deux lots et leur bilan sont terminés. Aucun raccordement au produit :**
la reconnaissance des motifs différés fonctionne, mais le gain d'explications
acceptables est nul sur les deux prélèvements. L'expérience est close et n'ouvre
pas une recherche pédagogique générale. Voir [le bilan](DELAYED_TACTICS_REPORT.md).
L'architecture ci-dessous conserve le plan de l'essai, pas une suite à relancer.

## Ce que l'on peut raisonnablement viser

Un même concept de double attaque doit reconnaître une fourchette immédiate ou
différée, quelles que soient les cases, les couleurs et les pièces. La suite
calculée par le moteur donne des positions à examiner ; le moteur garde la
recherche échiquéenne. Le modèle pédagogique cherche la menace, son exploitation
et ce qui la relie à la décision. Aucune recherche minimax stratégique parallèle
dans l'UI, aucune extension du moteur Rust ou hypothèse MultiPV/searchmoves.

Il restera un vocabulaire fini de concepts : double attaque, clouage, attaque
découverte, ligne ouverte, défense indisponible, échange et mat. Ce sont des règles
générales, pas des cas « cavalier de telle case vers telle case ». Les exemples
servent à vérifier ce modèle et ses refus, pas à coder un traitement par position.

La difficulté essentielle est l'attribution : une fourchette ultérieure peut
résulter d'un autre mauvais coup, être déjà menaçante avant la décision ou être
compensée. « La PV contient une fourchette » ne suffit jamais à déclarer que la
décision l'autorise ou que toutes les défenses perdent. Les causes positionnelles
et les combinaisons longues restent un problème distinct.

## Architecture envisagée

1. **Lire une suite courte entière.** Réutiliser les identités et frames de
   `DecisionContext` et les primitives de relations/contraintes. Examiner les
   événements pendant six demi-coups après la décision ; conserver les reprises
   nécessaires jusqu'au plafond existant de huit. S'arrêter avant une fin de
   partie. Coût coopératif, annulable et borné, pas une extraction illimitée.
2. **Relier les événements.** Construire des dépendances entre changement de la
   décision, préparation adverse, création de menace, réponse et exploitation.
   Distinguer ce qui provient de la décision et d'un choix intermédiaire. Une
   simple liste chronologique de motifs reste une observation, pas une cause.
3. **Vérifier le lien utile.** Utiliser des continuations moteur libres à deux
   budgets depuis des positions légales réellement atteintes. Chercher si une
   autre défense supprime ou compense la conséquence et si la menace existait
   déjà. Les variantes comparées n'ont pas à être identiques coup pour coup ;
   les identités, la contrainte et le bilan doivent rester compatibles.
   Le classement reste indépendant. Une seule alternative inférieure ne prouve
   ni le meilleur coup ni son unicité.
4. **Écrire depuis les faits acceptés.** Dire ce que le coup permet et montrer le
   plus court témoin légal qui le rend compréhensible. Garder les coups préparatoires
   nécessaires ; ne pas afficher dix coups de développement pour expliquer une
   double attaque. Si le lien reste incertain, garder l'abstention ou une
   observation explicitement conditionnelle, sans récit de causalité inventé.

Un score de mat n'est pas transformé en points. Une suite UCI n'est pas une preuve
contre toutes les réponses ; les preuves de mat bornées gardent leur contrôle
spécifique. Une comparaison de plateaux obtenue en effaçant arbitrairement une
pièce ne remplace pas une variante légale.

## Deux lots, puis décision sur résultats

- **Lot 1 — prototype hors parcours principal.** Chronologie et dépendances sur
  les concepts existants, sans ajout automatique de détecteurs. Témoins différés
  et contre-épreuves : menace déjà présente, erreur intermédiaire, défense
  différente et compensation. Vérifier avec chess.js avant les tests. Le
  prototype ne publie aucune nouvelle raison dans le produit.
- **Lot 2 — contrôles moteur et mesure.** Vérifier les explications candidates
  avec les deux moteurs et mesurer sur un échantillon neuf sélectionné avant
  réglage. Conserver les attentes humaines séparément des sorties moteur ;
  publier erreurs, raisons manquantes, coût et repères nécessaires. Comparer au
  parcours actuel sur les mêmes décisions. Raccorder au produit uniquement après
  une relecture des cas différés et un résultat utile, pas après un seul exemple.

À l'issue de ces deux lots, si le lien avec la décision reste impossible à
établir dans le budget ou si les raisons ne sont pas plus utiles, arrêter
l'expérience et présenter ses résultats. Pas d'ajout d'une nouvelle famille
pour chaque échec, pas de prolongation silencieuse de la backlog.

Il s'agit d'un chantier intermédiaire crédible, mais d'une refonte de la couche
d'explication, pas d'un petit ajout de texte. Aucune durée ni couverture de niveau
Chess.com n'est garantie. Une analyse générale des plans, de l'activité, de la
structure et des sacrifices complexes demanderait un périmètre bien plus large.
