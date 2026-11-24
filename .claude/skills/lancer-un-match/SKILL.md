---
name: lancer-un-match
description: Préparer et lancer un match de mesure entre deux commits du moteur sur les runners (match.yml) — le candidat sur un commit révoqué, l'attendu, le critère et la puissance écrits avant, la cadence, le nombre de jobs, la graine. À utiliser avant chaque match qui mesure un changement contre sa référence ; le relevé, ensuite, suit le skill rendre-un-verdict. Pas pour un changement qui ne modifie pas l'arbre, qui se mesure par tools/timing.sh.
---

# Lancer un match

Un match coûte des heures de runner ; ce qui le rend lisible s'écrit
avant qu'il parte, jamais après avoir vu un chiffre. Les règles qui le
fondent sont dans `CLAUDE.md` (« Ce qui compte comme preuve », « Pièges de
mesure ») ; l'outil, ses entrées et ses refus, dans `tools/README.md`
(« Mesurer à cadence longue », « Paralléliser les matchs », « La
concurrence d'un match »). Ce skill en est la procédure.

## 1. Le candidat

- **L'arbre change-t-il ?** Nœuds du banc identiques au bit près : pas de
  match, `tools/timing.sh` (ADR-0036). Sinon, un match.
- **Un commit révoqué aussitôt**, fusionné en `merge` pour que son SHA
  reste atteignable ; sa rustine à l'attic, sa ligne au registre de
  `tools/attic/README.md` ; `tools/verify.sh` vert, son code de sortie lu
  dans un fichier. Un candidat issu d'un écran suit d'abord le skill
  `passer-a-l-ecran`.
- La référence : le commit dont le candidat ne diffère que par le
  changement mesuré, jamais une branche qui bouge.

## 2. Écrire avant de lancer

Au journal, une entrée datée, avant le premier job :

- **l'attendu**, une plage et sa confiance, et d'où elle vient (un écran,
  un verdict voisin, l'étalon du temps F-0015) ;
- **le critère**, tel qu'il se lira : un gain fusionne si la borne basse
  commune est au-dessus de zéro et qu'aucun job ne le contredit ; un
  correctif de règle, sauf si la borne haute est sous zéro, sur chaque
  match comme sur l'ensemble (`CLAUDE.md`) ; deux candidats contre la même
  base se départagent par leur match direct (`rendre-un-verdict`) ;
- **la puissance** : l'effectif qu'il faut pour séparer l'attendu de zéro,
  par la relation de budget (F-0014), et ce qu'un job tient à la cadence
  (F-0016), d'où le nombre de jobs ; l'intervalle attendu ; ce que le match
  ne pourra pas voir, dit d'avance.

## 3. La cadence et les jobs

- **`8+0,08` par défaut**, la plus longue qui rende un verdict à coût
  tenable ; plus longue si l'effet dépend de la profondeur, jamais
  `1+0,01` pour décider (ADR-0029). La profondeur atteinte à chaque
  cadence : F-0016.
- **Un job tranche ~20 Elo et plus** ; en dessous, des matchs à longueur
  fixe sur plusieurs jobs, mis en commun par `tools/mettre-en-commun.sh`,
  jamais plusieurs SPRT. Plus de runners pour les petits effets
  (ADR-0034), dans la limite du livre (F-0018) ; seize jobs au plus sur le
  compte à la fois (D-0004).
- **Les parties par job** : ce que le plafond tient à la cadence (F-0016),
  avec une marge ; un job coupé par le plafond reste lisible, un SPRT
  expiré non.

## 4. Les entrées de `match.yml`

- `candidat` et `reference` par leur SHA ; `cadence` ; `parties` (0 pour un
  SPRT, avec `elo0` et `elo1`).
- **`graine`** : `auto` pour des jobs à mettre en commun, une graine par
  job ; le défaut `20260913` pour un match apparié à un autre, mêmes
  ouvertures des deux côtés (une technique à deux cadences, un témoin).
- Le reste seulement quand la mesure le demande : `cadence_candidat`
  (handicap de temps), `sonde` (plis en partie), `ponder`, `fils_*`,
  `cpu_*` (le binaire AVX2 par défaut, ADR-0031), `livre`. `match.yml`
  déduit la concurrence et refuse ce qui fausserait le verdict.

## 5. Après le lancement

- L'entrée du journal reçoit les runs, leur graine et l'heure de départ ;
  la fin attendue, par F-0016.
- Un contrôle programmé à la fin attendue, puis le relevé par le skill
  `rendre-un-verdict` : rien ne se lit avant que tous les jobs aient fini.
