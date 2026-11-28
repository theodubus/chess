<!-- socle: couche=backlog zone=publique -->
# T-0008 — Écrire les candidats N10r10h512 et N10h512 au code du jour, chacun révoqué aussitôt

> statut : fait · origine : J-2026-11-28-D · besoin : B-0012 · lu : backlog@e8dc7a96 · ref : J-2026-11-28-F

N10r10h512 entre dans `reseaux/` depuis `reseau/c3` (`4c15e0c`), sa
sortie d'entraînement et sa courbe avec lui. Les deux réseaux deviennent
candidats par `tools/candidat-reseau.py`, sur le code du jour : la
référence N10h512 de B-0012, `745d569`, date du 9 nov., et `git diff` sur
`engine/` en porte depuis des commentaires et des tests ; elle se
recommite (skill `embarquer-un-reseau`). Chacun commité, puis révoqué au
commit suivant, fusionnés en `merge` avec la pull request.

## Fait quand

- [x] `reseaux/n10r10h512-768x10hm-512-s8-800.bin` est au dépôt, à l'octet celui de `4c15e0c`
- [x] les deux candidats sont commités et révoqués chacun aussitôt ; entre eux, `git diff` sur `engine/` ne porte que `engine/src/nnue.rs`
- [x] les tests `nnue` en release passent sur chaque candidat, et `tools/verify.sh` sur la tête, leurs codes de sortie lus dans un fichier
