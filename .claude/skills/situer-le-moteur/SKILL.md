---
name: situer-le-moteur
description: Lancer, relever et inscrire une série de force absolue du moteur, contre Stockfish bridé (force.yml) ou contre des moteurs classés par la CCRL (classes.yml). À utiliser après chaque réseau embarqué, ou quand Théo demande où en est la force, avant d'en dire le moindre chiffre. Jamais pour juger un changement, qui se mesure contre notre jumeau (rendre-un-verdict).
---

# Situer le moteur sur une échelle extérieure

Une série **situe** le moteur ; elle ne tranche rien. Ce que l'échelle de
Stockfish bridé fait d'un écart est F-0012 ; la force relevée, F-0011 ;
ce que font les deux workflows, `tools/README.md`, « Situer le moteur ».
Ce skill est la procédure des séries de septembre à novembre 2026, dont
le journal garde le protocole et les relèves (C13).

## 1. Avant de lancer : l'attendu, écrit

- **Ce que la série mesure** : tout ce qui a changé depuis la série
  précédente, réseau, recherche et binaire, pas le seul dernier
  changement. Le nommer, avec ce que notre jumeau en a mesuré.
- **L'attendu**, avec sa confiance : une estimation et une plage. La
  plage se calcule par l'instrument qui existe, F-0012 : les écarts du
  jumeau multipliés par la plage des facteurs mesurés, plus l'incertitude
  de la série précédente. Pas un facteur choisi au juger.
- **Le score attendu** doit tomber entre 10 et 90 % : sinon, changer de
  niveau avant de lancer, et le dire.
- **Le seuil de séparation** : l'écart à la série précédente n'est séparé
  de zéro que s'il dépasse 1,96 · √(σ₁² + σ₂²). L'écrire, pour ne pas lire
  après coup un écart que le bruit explique.

## 2. Lancer

- **`force.yml`** : 300 parties par série, à 60+0,6, la cadence où
  Stockfish a étalonné `UCI_Elo` ; **la taille ne change pas**, décision
  de Théo du 21 oct. 2026 (J-2026-11-18-AE). Le niveau s'écrit dans
  l'entrée `elo`, jamais par son défaut : 3100 depuis le 14 oct. 2026,
  3190 pour la série suivante (B-0014). Un changement de niveau passe par
  un pont, le même moteur mesuré aux deux niveaux, et ne se déclare
  cohérent que si les deux estimations s'accordent sous le seuil
  ci-dessus. Le binaire AVX2, le défaut.
- **`classes.yml`** : à l'équivalent 40/15 du runner, la cadence que Théo
  vise ; une note se lit sur la liste 40/15, à 1 CPU. Une autre cadence
  n'éprouve que la chaîne. Un job ne tient qu'une vingtaine de parties :
  plusieurs jobs par adversaire, graines distinctes, mis en commun par
  `tools/mettre-en-commun.sh`.
- Le moteur mesuré est un commit de `main`, nommé dans l'attendu.

## 3. Relever

- **Le runner**, en tête du résumé : modèle, banc, profondeur atteinte en
  250 ms. Stockfish bridé jouant à profondeur fixe, un runner plus lent ne
  peut que nous sous-estimer ; le dire quand deux séries diffèrent.
- **Les anomalies** : pertes au temps, coups illégaux, moteur perdu. La
  série ne vaut rien tant qu'il y en a une.
- **Les avertissements, par moteur.** Ceux de Stockfish, « Bestmove does
  not match beginning of last PV », sont son bridage, séparés par le
  workflow. Ceux de ShallowRed se lisent un par un : « PV continues after
  fifty-move rule » ou « … after threefold repetition » est la signature
  connue de F-0013 ; une autre nature est un défaut neuf.
- **L'estimation** : le score, l'écart au niveau et l'estimation avec son
  ±, confrontés à l'attendu écrit avant. Hors de 10 à 90 %, la série ne
  se lit pas : changer de niveau.
- **L'écart à la série précédente**, avec son ±, et ce qu'il donne du
  facteur d'écrasement au point, avec son intervalle.

## 4. Inscrire

- **F-0011** : la nouvelle estimation, sa série, son runner et sa date ;
  une nouvelle preuve. Le `README.md` n'en porte pas le chiffre.
- **F-0012**, si la série ajoute un point au facteur d'écrasement ou un
  pont entre deux niveaux.
- **Au journal**, une entrée datée : l'attendu, le run, le tableau de la
  série et sa lecture.
- Le sujet du backlog qui portait la série (B-0014, ou celui du réseau
  embarqué) coche sa case.
