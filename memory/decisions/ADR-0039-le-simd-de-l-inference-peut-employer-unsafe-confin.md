<!-- socle: couche=decisions zone=publique -->
# ADR-0039 — Le SIMD de l'inférence peut employer unsafe, confiné et confronté à la version scalaire

> statut : acceptée · date : 2026-10-20 · lu : decisions@52b5a77c

## Contexte

La lint de l'espace de travail interdisait tout `unsafe`. Le 20 oct. 2026, le produit scalaire de la sortie du réseau restait en registres de 128 bits, le compilateur n'en sortant pas mieux de la forme scalaire. Décision de Théo consignée au carnet le jour même (J-2026-10-20-D@f8a97e55), dont la citation complète n'était gardée que par `CLAUDE.md`, section « Style », et par le commentaire du module dans `engine/src/nnue.rs` ; posée ici quand cette section a été réduite à ses règles, au dernier lot du déplacement du carnet (J-2026-11-17-W@a4e6e5fc).

## Décision

Théo, 20 oct. 2026 : « *Si annuler cette décision augmente l'elo long terme, je le fais. Le but absolu est la perf* ». L'`unsafe` est admis pour le SIMD de l'inférence, et pour lui seul.

## Conséquences

Les conditions, écrites le même jour : confiné à UN seul module de `engine/src/nnue.rs` qui porte `#[allow(unsafe_code)]`, la lint de l'espace de travail passant de `forbid` à `deny` pour que tout le reste refuse encore ; chaque bloc derrière la détection du jeu d'instructions à l'exécution ou la cible de compilation ; confronté en test à la version scalaire, qui reste, à l'unité près, donc au même arbre ; entré seulement s'il rend du temps à arbre identique (rejeu, test des signes).

En place depuis le 20 oct. 2026 : le module `avx2` du produit scalaire de la sortie, −5,09 % de temps à arbre identique sur 120 tours (`tools/README.md`, « La file, phase 2 — le produit scalaire en AVX2 »). Le défaire, c'est retirer ce module : la version scalaire tient le même arbre.
