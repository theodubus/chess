<!-- socle: couche=backlog zone=publique -->
# B-0022 — Entraîner un réseau plus large que 512 unités

> statut : ouvert · origine : D-0004 · après : B-0021 · priorité : basse · lu : backlog@28b946bb

Troisième axe d'architecture. De 384 à 512 unités, le gain n'était plus
que d'environ +8 Elo, et chaque pas de largeur double à peu près la durée
d'entraînement. Théo, le 12 nov. 2026 : des réseaux plus larges, des
entraînements plus longs ou la location d'un serveur sont possibles si le
gain est réel, sans priorité s'il est marginal (D-0004).

Le seuil entre « réel » et « marginal », proposé par l'agent et validé par
Théo le 12 nov. 2026 (D-0007) : réel si le gain mesuré au pas précédent,
au point, atteint +10 Elo ; marginal en dessous. De 384 à 512 unités, il
était d'environ +8 : sous le seuil.

## Fait quand

- [x] Théo a dit le seuil qui sépare un gain réel d'un gain marginal
- [ ] un réseau à 768 unités est entraîné et mesuré contre le réseau embarqué, ou l'axe est fermé par le seuil, et le journal le dit
