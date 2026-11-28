<!-- socle: couche=backlog zone=publique -->
# T-0009 — Relever la perte tenue à l'écart des deux réseaux, puis lancer leur match, l'attendu, le critère et la puissance écrits avant

> statut : ouvert · origine : J-2026-11-28-D · besoin : B-0012 · après : T-0008 · lu : backlog@e8dc7a96

Le premier point de B-0071, que B-0012 porte : la perte des deux réseaux
sur les jobs tenus à l'écart de leurs données (`nnue-validation.yml`),
l'ordre qu'elle prédit écrit au journal avant le match. Puis le match
(skill `lancer-un-match`) : quatre jobs de 2 800 parties à `8+0,08` par
`match.yml`, binaire AVX2 des deux côtés, graine `auto`.

## Fait quand

- [ ] l'attendu de la perte, puis son relevé et l'ordre qu'elle prédit, sont au journal avant le premier job du match
- [ ] l'attendu, le critère et la puissance du match sont au journal avant son premier job
- [ ] les quatre jobs sont lancés, leurs runs, leurs graines et la fin attendue au journal
