<!-- socle: couche=backlog zone=publique -->
# B-0069 — Mesurer deux formes non essayées de techniques fermées

> statut : ouvert · origine : J-2026-11-18-BH · après : B-0065 · priorité : basse · lu : backlog@57d38fe9

Idée non décidée de la longue traîne : sa première étape est la décision
de la tester ou de l'abandonner (B-0065, D-0020, D-0021). L'agent ne s'y met pas avant.

Deux techniques fermées au n° 9 l'ont été sous UNE forme, et leur récit
nomme l'autre sans la mesurer :
- **la futilité inverse élargie quand la position se dégrade**, l'inverse
  de C35 : la resserrer quand *improving* est vrai, dans 78 % des nœuds, a
  perdu −8,51 ± 3,76 (J-2026-11-18-BH) ;
- **l'échange statique des tranquilles à la profondeur réduite de LMR**, la
  forme de Stockfish : C40, à `20·d²` et à la profondeur pleine, a perdu
  −4,26 ± 3,49 (J-2026-11-18-BM).

Chacune passe d'abord à l'écran (le skill `passer-a-l-ecran`), et se
mesure seule.

## Fait quand

- [ ] l'agent a décidé de les tester ou de les abandonner, marge contre coût (D-0021)
- [ ] si testées : chacune écrantée, puis son verdict à `8+0,08`
