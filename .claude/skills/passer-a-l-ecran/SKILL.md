---
name: passer-a-l-ecran
description: Écranter des techniques de recherche avant de les acheter en match — rejouer un journal de parties avec un binaire de mesure, compter le mécanisme, ses dégâts et l'arbre de chaque variante —, puis en tirer des candidats, leurs attendus et leurs critères, et composer les gagnants. À utiliser avant de mesurer en Elo une technique de recherche neuve, une variante ou un réglage qui change l'arbre.
---

# Passer des techniques à l'écran

Un match coûte des heures de runner ; un écran, des minutes de conteneur.
L'écran dit **le coût, exactement**, et combien le mécanisme sert ; jamais
l'Elo (`CLAUDE.md`, « c'est plus fort »). Cette procédure est celle des
écrans du n° 9, du n° 12 et du n° 23 (octobre et novembre 2026), dont le
journal garde les récits.

## 1. Écrire avant de mesurer

- Le protocole : quelles variantes, ce que la sonde compte, sur quel
  journal, à quelles profondeurs.
- **Les attendus**, chiffrés, avec leur confiance : la part des nœuds où le
  mécanisme agit, ses dégâts, l'arbre de chaque variante. Hors de leur
  fourchette, on cherche pourquoi avant de choisir.

## 2. Le journal et le rejeu

- **Un journal neuf du moteur qui joue** : 60 parties de `main` contre
  lui-même à `8+0,08`, cutechess `-debug all`, une graine nommée, trois
  parties à la fois dans le conteneur, rien d'autre ne tournant. Un
  journal d'un moteur plus ancien ne mesure pas celui d'aujourd'hui : ce
  que la recherche accumule se mesure sur le moteur qui joue.
- **Un binaire de MESURE**, à l'attic comme une rustine : les variantes
  choisies par une variable d'environnement, combinables ; sans elle,
  `main` au nœud près, vérifié par le banc et par le rejeu du binaire de
  `main` en témoin.
- **Le rejeu** de chaque position du journal à la profondeur 10 et 12,
  table et historiques conservés d'un coup à l'autre (le rejoueur des
  rustines `n9-sonde-*` et `n12-sonde-ecran5.patch`). Les économies
  croissent avec la profondeur : la 12 se lit d'abord, la 14 pour une
  tendance.

## 3. Ce que l'écran compte

- **Le mécanisme** : où il agit, combien il coupe ; l'union des nœuds
  dépensés, jamais la somme de recherches emboîtées.
- **Ses dégâts** : parmi ce qu'il saute, ce qui, cherché, aurait monté
  `alpha`. Un taux de dégâts ne se lit qu'avec l'économie qu'il achète.
- **L'arbre de chaque variante** contre `main` : son coût, exactement.
- **Une marge en unités d'évaluation** se lit sur sa courbe entière, au
  réseau : par profondeur, la plus petite marge qui détruit au plus ~2 %
  des montées d'`alpha` (le niveau de LMP et de la futilité aux nœuds
  frontières), puis la droite `a + b·d` par-dessus.
- **L'accord du coup rendu avec `main` ne discrimine rien** au rejeu : toute
  variante qui touche l'arbre change le tiers des coups. Un accord se lit
  contre un ORACLE, une recherche bien plus longue, jamais contre la base.
- Un seuil sur une grandeur sans échelle (un historique non borné) est une
  dérive, pas un réglage : il agit d'autant plus que la recherche est
  profonde.
- **Avant de régler une échelle, lire où la grandeur est lue** : une
  variante d'échelle se mesure à échelle TENUE des règles qui la lisent —
  leur diviseur ajusté au rejeu pour la même part de décisions changées —,
  sans quoi elle remesure ce diviseur.

## 4. Ce que l'écran décide

- **Le protocole écrit avant tient, et ses écarts se nomment** : une
  seconde série, ajoutée après lecture, avec ses raisons ; une règle de
  l'écran qui mesure la mauvaise chose — un seuil d'arbre devant une
  variante qui change OÙ l'on cherche — tombe, nommée, sur une mesure
  indépendante du changement.
- **Une technique d'élagage** se ferme à l'écran sous **dix points d'arbre
  économisés par point de dégâts** (les montées d'`alpha` qu'elle
  détruit) : la futilité et l'élagage par compte en achetaient 11 à 15,
  et C40, qui a régressé, 5.
- **Fermé sans match** : un mécanisme qui n'agit pas, une variante qui ne
  déplace pas l'arbre, des dégâts sans économie, un plafond sous ce qu'un
  match trancherait (`parties × Elo`, F-0014). Une technique dont
  l'économie croît avec la profondeur se ferme à `8+0,08` et se rouvre à
  cadence longue (B-0029).
- **Un candidat par variante retenue** : elle doit rendre EXACTEMENT
  l'arbre de sa variante au rejeu à la profondeur 10 ; commité puis révoqué
  aussitôt, sa rustine à l'attic, `verify.sh` vert.
- **Son attendu, en deux termes** : le coût de l'arbre à décision égale, lu
  par l'étalon (F-0015) — un
  majorant si l'arbre rétrécit —, et un terme de décision, un pari souvent
  du même ordre, qui fait le signe. Les écrire séparément.
- **Son critère**, celui d'une technique ajoutée : gain si la borne basse
  commune est au-dessus de zéro. Deux points d'une bissection qui passent
  tous deux : le meilleur au point. Un candidat qui n'existe que porté par
  un autre — une LMR qui lit l'échelle que pose une gravité — se mesure
  contre lui, et entre avec lui si son gain est démontré ET que son
  porteur n'est pas démontré sous `main` ; si la chaîne des deux ne
  démontre pas un gain sur `main`, la paire se mesure d'abord contre lui.
- **Sa puissance, dite d'avance** : quatre jobs de 2 800 parties à
  `8+0,08`, ± 3,0 à 3,5 ; ce qu'un vrai +5 a de chances de passer — huit
  fois sur dix environ. Un vrai +2 n'y passe la borne qu'une fois sur
  quatre ou cinq, un +3 moins d'une fois sur deux ; à huit jobs, environ
  deux fois plus souvent, ce qui reste un tirage : le dire avant.
- **Un test de nœuds qui tombe** sous un candidat : la mesure qui le juge
  se fait SANS le changement, sur un échantillon de positions de parties,
  avant toute reformulation (`CLAUDE.md`, « Pièges de mesure »), et son
  traitement s'écrit avant le verdict — le précédent : le test des
  extensions singulières, à marge mince, tombé sous cinq changements sans
  rapport (J-2026-11-18-EF).

## 5. La relève et la composition

- Chaque candidat se relève par le skill `rendre-un-verdict`.
- **Plusieurs gagnants contre la même base** se composent TOUS ensemble sur
  un `main` dont le moteur est cette base au bit près, et le groupe se
  mesure contre ce `main` : ses membres et lui partagent alors leur base,
  et leurs points se comparent (n° 12, n° 23).
- Avant le match du groupe : son arbre contre le produit des arbres de ses
  membres seuls, et **le groupe privé de chaque membre**, rejoué. Un membre
  dont la part d'arbre tombe sous la moitié de sa part seul est absorbé :
  un match de retrait le mesure si le groupe passe.
- **Son attendu** : les compositions du dépôt ont rendu de 80 à 91 % de la
  somme des gains de leurs membres (n° 9, n° 12, C71) ; la somme est un
  majorant.
- **Le critère du groupe**, écrit avant : borne basse commune au-dessus de
  zéro, ET son point pas démontré sous celui de son meilleur membre seul ;
  sinon, bissection par paires ou par famille, ou le meilleur entre seul.
  Le recouvrement d'arbre ne mesure pas le recouvrement de décision : un
  groupe sans membre absorbé peut rester sous-additif.
- **La variante du n° 9**, quand un gagnant est entré seul d'abord : le
  groupe des autres se mesure contre le `main` qui le porte, et seule la
  borne basse s'y lit — son point et les gains seuls n'ont plus la même
  base (`CLAUDE.md`, « un verdict appartient à sa base »).

## 6. Inscrire

- Au journal : le protocole, l'écran relevé, les fermetures avec leur
  raison, les candidats et leurs attendus.
- Les rustines à l'attic, leur ligne dans `tools/attic/README.md`.
- Les réglages qui en sortent, dans F-0010.
