<!-- socle: couche=decisions zone=publique -->
# ADR-0030 — Les données de Leela Chess Zero sont admises pour entraîner le réseau

> statut : acceptée · date : 2026-09-29 · lu : decisions@4ab25721

## Contexte

Décision de Théo sur les données de Leela Chess Zero, portée jusqu'au 17 nov. 2026 par la section « Décisions structurantes » de `CLAUDE.md`, posée ici quand cette section a été réduite à ses règles, au quatrième lot du déplacement du carnet. Le texte d'avant est archivé au journal (J-2026-11-17-N@60675684).

## Décision

Théo, 29 sept. 2026 : « ok pour license et le fait qu'on utilise leurs données, mon but est d'avoir le meilleur moteur possible ». Nos données seules, les leurs seules, ou les nôtres puis les leurs, selon ce qui mesure le mieux. La question a été rouverte par Théo le 19 oct. 2026, sur ce que les mesures d'alors n'avaient pas testé.

## Conséquences

Licence ODbL : le jour où un réseau entraîné sur elles est embarqué, `README.md` porte la mention d'attribution, comme celui de Stockfish ; fait le 2 oct. 2026 avec N2L, section « Remerciements ». La mention reste tant que `reseaux/` garde un réseau qui en a appris. Les mesures sur ces données sont dans `tools/README.md`, sections n° 7 et n° 20.
