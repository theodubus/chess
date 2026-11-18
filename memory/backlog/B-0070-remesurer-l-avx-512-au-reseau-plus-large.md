<!-- socle: couche=backlog zone=publique -->
# B-0070 — Remesurer l'AVX-512 au réseau plus large

> statut : ouvert · origine : J-2026-11-18-BD · après : B-0065, B-0013 · priorité : basse · lu : backlog@6e7fa681

Idée non décidée de la longue traîne : sa première étape est la décision
de la tester ou de l'abandonner (B-0065, D-0020, D-0021). L'agent ne s'y met pas avant.

Le 6 oct. 2026, à 128 unités, un binaire `x86-64-v4` (AVX-512) n'a rien
rendu contre le binaire AVX2 : × 0,95 de nœuds par seconde, plus rapide
sur 6 paires sur 20 seulement, l'arbre identique (J-2026-11-18-BD).
L'inférence, courte à 128 unités, était l'explication avancée, « à
remesurer si la couche cachée s'élargit » ; elle a 256 unités aujourd'hui,
et le réseau à 512 attend son embarquement (B-0013). Un troisième binaire
ne démarre pas sur les runners EPYC 7763, sans AVX-512 ; et un SIMD écrit
à la main passe par ADR-0039.

## Fait quand

- [ ] l'agent a décidé de la tester ou de l'abandonner, marge contre coût (D-0021)
- [ ] si testée : la vitesse à arbre identique, par la sonde `tools/attic/vitesse-avx2-sonde.patch`, au réseau qui joue
