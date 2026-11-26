---
name: mesurer-l-inference
description: Mesurer si un changement de l'inférence NNUE — le code du réseau qui joue, son SIMD, une option de compilation — rend du temps à arbre identique, par le rejeu d'un corpus de parties, le code machine lu d'abord et la puissance écrite avant. À utiliser pour toute optimisation qui touche le réseau, que tools/timing.sh ne voit pas puisque le banc évalue à la main.
---

# Mesurer le temps de l'inférence

Le banc (`bench`, `tools/timing.sh`) évalue à la main : un changement du
réseau qui joue ne s'y voit pas (`AGENTS.md`, « c'est plus rapide »), tant
qu'un banc au réseau manque (B-0055). Ce skill est la procédure des n° 15,
16 et du SIMD d'octobre 2026, dont le journal garde les récits ; l'outil
est décrit dans `tools/README.md`, « Vérifier, et mesurer un temps ».

## 1. Le même arbre d'abord

- Un changement de l'inférence ne doit pas déplacer l'arbre :
  `tools/binaires.sh --comparer <a> <b>` confronte le banc ET les six
  positions au réseau, nœuds et coup. Un arbre qui bouge n'est plus une
  optimisation : un match (skill `lancer-un-match`).
- Un SIMD écrit à la main suit ADR-0039 : confiné au module de
  `engine/src/nnue.rs` qui porte `#[allow(unsafe_code)]`, derrière la
  détection du jeu d'instructions, confronté en test à la version scalaire,
  entré seulement s'il rend du temps.

## 2. Le code machine avant le chronomètre

- `objdump` du binaire AVX2, avant et après : dans chaque fonction chaude
  (`Network::evaluate`, `Network::apply_move`, `refresh_side`), compter les
  instructions que le changement doit faire apparaître ou disparaître
  (`vpmulld`, `vpmullw`, `vpmaddwd`) et la largeur de leurs registres
  (`xmm` 128 bits, `ymm` 256). L'attendu s'écrit avant ; c'est ainsi qu'on
  a vu le compilateur caler le produit de sortie sur 128 bits (ADR-0039).
- **Un compte d'opérations ne prédit pas un temps**, même à arbre
  identique : une boucle qui attend la mémoire ne rend rien de ses
  instructions épargnées, une boucle en cache rend ce que son compte
  promet — le cache des recalculs et le produit en AVX2, J-2026-10-20-E.

## 3. Le rejeu

- **L'outil** : `tools/sonde-inference/rejeu.py`, qu'apporte
  `tools/attic/n15-sonde-inference.patch`, et qui
  s'en extrait seul par `git apply --include='tools/sonde-inference/*'`, la
  rustine entière ne s'appliquant plus sur `engine/src/nnue.rs`. Il
  rejoue un corpus de parties à profondeur fixe, table conservée, compare
  deux binaires en paires, refuse si leurs arbres diffèrent et rend un test
  des signes ; `--nps` compare deux arbres différents, ceux d'un réseau
  candidat. Deux compilations du même code (un jeu d'instructions)
  peuvent aussi se comparer sur les positions du banc, par
  `tools/attic/vitesse-avx2-sonde.patch` ; un changement du code, au
  rejeu, sur de vraies parties.
- **Le corpus** : une vingtaine de parties du moteur qui joue contre
  lui-même à `8+0,08`, en notation UCI. Perdu avec un conteneur, il se
  refait, et se garde alors dans le dépôt.
- **La puissance, écrite avant**, par la dispersion du rejeu (F-0021) :
  le nombre de tours se choisit pour que l'intervalle attendu sépare
  l'effet visé de zéro.
- Rien d'autre ne tourne dans le conteneur pendant le rejeu.

## 4. Inscrire

- Au journal : l'attendu au code machine et au temps, le corpus, les
  tours, le test des signes, la décision.
- La part du réseau dans le temps d'un nœud n'est pas un fait : celle du
  n° 15 (16,8 % sur un réseau de 128 unités) est périmée par quatre
  changements depuis — le chemin A du n° 16, le produit en AVX2, deux pas
  d'architecture. Elle se remesure par la rustine du n° 15 portée sur
  le code du jour quand un chantier en dépend (B-0018, B-0070).
