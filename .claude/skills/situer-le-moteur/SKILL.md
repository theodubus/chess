---
name: situer-le-moteur
description: Lancer, relever et inscrire une série de force absolue du moteur, contre Stockfish bridé (force.yml) ou contre des moteurs classés par la CCRL (classes.yml). À utiliser après chaque réseau embarqué, ou quand Théo demande où en est la force, avant d'en dire le moindre chiffre. Jamais pour juger un changement, qui se mesure contre notre jumeau (rendre-un-verdict).
---

# Situer le moteur sur une échelle extérieure

Une série **situe** le moteur ; elle ne tranche rien. Ce que l'échelle de
Stockfish bridé fait d'un écart est F-0012 ; la force relevée et le niveau
en cours, F-0011 ; ce que font les deux workflows, `tools/README.md`,
« Situer le moteur ». Ce skill est la procédure des séries de septembre à
novembre 2026, dont le journal garde le protocole et les relèves (C13).

## 1. Avant de lancer : l'attendu, écrit

- **Ce que la série mesure** : tout ce qui a changé depuis la série
  précédente, réseau, recherche et binaire, pas le seul dernier
  changement. Le nommer, avec ce que notre jumeau en a mesuré.
- **L'attendu**, avec sa confiance : une estimation et une plage. Contre
  Stockfish bridé, la plage part de l'écart du jumeau et des facteurs de
  F-0012, qui ne se séparent pas les uns des autres : elle est large, et
  s'écrit telle quelle, plus l'incertitude de la série précédente. Jamais
  un facteur choisi au juger.
- **Le score attendu** doit tomber entre 10 et 90 % : sinon, changer de
  niveau, ou d'adversaire, avant de lancer, et le dire.
- **Le seuil de séparation** : l'écart à la série précédente n'est séparé
  de zéro que s'il dépasse √(±₁² + ±₂²), les ± étant ceux des deux
  séries, déjà des demi-intervalles à 95 %. L'écrire, pour ne pas lire
  après coup un écart que le bruit explique.

## 2. Lancer

- **`force.yml`** : 300 parties par série, à 60+0,6, la cadence où
  Stockfish a étalonné `UCI_Elo` ; **la taille ne change pas**, décision
  de Théo du 21 oct. 2026 (J-2026-11-18-AE). Le niveau s'écrit dans
  l'entrée `elo`, jamais par son défaut. Les niveaux se comparent entre
  eux tant que F-0012 tient l'échelle cohérente : un niveau neuf se lit
  contre le précédent sous cette hypothèse, dite dans l'attendu ; un pont,
  le même moteur aux deux niveaux, ne se paie que si un écart la met en
  doute. Le binaire AVX2, le défaut.
- **`classes.yml`** : à l'équivalent 40/15 du runner, la cadence que Théo
  vise ; une note se lit sur la liste 40/15, à 1 CPU. Une autre cadence
  n'éprouve que la chaîne. La première série éclaire large, plusieurs
  adversaires de notes étagées ; les suivantes se resserrent sur ceux qui
  tombent à moins de ~150 de notre estimation. Un job ne tient qu'une
  vingtaine de parties : chaque adversaire demande plusieurs jobs, graines
  distinctes, ~200 parties pour une marge de ± 50 environ ; le dire en
  heures de runner avant de lancer.
- Le moteur mesuré est un commit de `main`, nommé dans l'attendu.

## 3. Relever

- **Les anomalies** : pertes au temps, coups illégaux, moteur perdu. La
  série ne vaut rien tant qu'il y en a une.
- **Les avertissements, par moteur et par nature**, tels que le résumé les
  compte : la ligne elle-même ne s'ouvre pas depuis une session (le
  journal entier est servi par un hôte que le proxy refuse), et le
  classement repose alors sur la nature, ce qui se dit. Contre Stockfish,
  « Bestmove does not match beginning of last PV » est son bridage.
  Côté ShallowRed, « PV continues after fifty-move rule » ou « … after
  threefold repetition » est la signature connue de F-0013, à son taux ;
  une autre nature, ou une hausse nette, est un défaut neuf.
- **Contre Stockfish bridé** (`force.yml`) :
  - le runner, en tête du résumé : modèle, banc, profondeur en 250 ms.
    Stockfish bridé jouant à profondeur fixe, un runner plus lent ne peut
    que nous sous-estimer ; le dire quand deux séries diffèrent ;
  - le score, l'écart au niveau et l'estimation avec son ±, confrontés à
    l'attendu ; hors de 10 à 90 %, la série ne se lit pas ;
  - l'écart à la série précédente avec son ±, et le facteur
    d'écrasement au point qu'il donne, avec son intervalle.
- **Contre un moteur classé** (`classes.yml`) :
  - le runner : le banc de Stockfish 10 chargé et la cadence qui en sort.
    La cadence suivant le runner, sa vitesse ne biaise pas l'estimation
    comme contre Stockfish bridé ;
  - les jobs d'un même adversaire se réunissent avant toute lecture.
    `tools/mettre-en-commun.sh` refuse deux vecteurs égaux, ce qui arrive
    par hasard à une dizaine de paires (B-0068) : tant que ce refus tient,
    vérifier sur les résumés que les graines diffèrent, sommer les
    vecteurs, et ne pas lire un refus comme une graine répétée ;
  - par adversaire, l'estimation est sa note plus l'écart, la marge
    composant celle du match et celle de la note ;
  - plusieurs adversaires se combinent à l'inverse de leur variance, après
    avoir vérifié qu'ils s'accordent : un désaccord dit une mise à
    l'échelle propre à un adversaire, et se rapporte séparément.

## 4. Inscrire

- **F-0011** : la nouvelle estimation, sa série ou ses adversaires, son
  runner et sa date ; une nouvelle preuve. Le `README.md` n'en porte pas
  le chiffre.
- **F-0012**, si la série ajoute un point au facteur d'écrasement ou un
  pont entre deux niveaux.
- **Au journal**, une entrée datée : l'attendu, les runs, le tableau de la
  série et sa lecture.
- Le sujet du backlog qui portait la série (B-0014, ou celui du réseau
  embarqué) coche sa case.
