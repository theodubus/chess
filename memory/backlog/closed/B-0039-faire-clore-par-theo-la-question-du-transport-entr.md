<!-- socle: couche=backlog zone=publique -->
# B-0039 — Faire clore par Théo la question du transport entre l'interface et le moteur (ADR-0010)

> statut : fait · origine : J-2026-11-17-G · ref : D-0019, ADR-0041 · priorité : basse · lu : backlog@d70d5c02

A8, le transport entre l'interface et le moteur (application de bureau,
WebAssembly local, ou moteur distant), est resté ouvert au carnet :
ADR-0010@e83c3531 est « proposée ».

Depuis, l'interface a sa V1 (Théo, 6 oct. 2026) et une version web sur
GitHub Pages, qui fait tourner le binaire du moteur compilé pour
`wasm32-wasip1-threads` (Théo, 27 oct. 2026 ; `ui/README.md`, « Version
web »). Les faits semblent avoir tranché en faveur des deux premiers
transports. Le dire revient à Théo : une décision qui le consigne, et
ADR-0010 close en conséquence, abandonnée ou acceptée, puisque son corps
ne se réécrit pas.

Rien n'en dépend : priorité basse, à poser en demande quand une décision
de Théo est attendue de toute façon.

## Fait quand

- [x] Théo a tranché le transport, et ADR-0010 est close en conséquence
