<!-- socle: couche=decisions zone=publique -->
# ADR-0026 — Les branches des autres agents sous ui/ se gardent

> statut : acceptée · date : 2026-09-24 · lu : decisions@61905769

## Contexte

Décision de Théo sur les branches des autres agents, portée jusqu'au 17 nov. 2026 par la section « Structure » de `CLAUDE.md`, posée ici quand cette section a été réduite à ses règles, au quatrième lot du déplacement du carnet. Le texte d'avant est archivé au journal (J-2026-11-17-N@60675684).

## Décision

Un autre agent, Codex, travaille sur `ui/` en parallèle, sur ses propres branches (`codex/…`) et leurs pull requests : c'est normal, et ça ne touche qu'à `ui/` (Théo, 24 sept. 2026). Ne pas les prendre pour des anomalies, ni les fusionner ou les nettoyer. Des sessions Claude dédiées à l'interface poussent aussi des branches `ccr-…`, pour des correctifs de `ui/` seulement (Théo, 19 oct. 2026) : même règle. Elles ont repris le 2 nov., et c'est voulu, Théo le 3 nov. 2026 : « sessions voulues » (pull requests 255, 257 et 258). Codex reste arrêté depuis fin octobre (Théo, 29 oct.), la règle tenant pour ses branches s'il en revient.

## Conséquences

La politique du socle garde ces branches : elles ne sont jamais proposées à la suppression (D-0002@a578d77a).
