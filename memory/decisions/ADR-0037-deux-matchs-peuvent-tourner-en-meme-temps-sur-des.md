<!-- socle: couche=decisions zone=publique -->
# ADR-0037 — Deux matchs peuvent tourner en même temps sur des runners distincts

> statut : acceptée · date : 2026-09-16 · lu : decisions@458aae03

## Contexte

Le 16 sept. 2026, deux matchs avaient été lancés en même temps sur deux runners GitHub, ce que la règle « ne jamais faire tourner deux matchs en même temps » interdisait sans réserve. Sa justification, le vol de CPU, avait été écrite pour le conteneur. Décision consignée au carnet (J-2026-09-16-C@43d55881), portée jusqu'au 17 nov. 2026 par la section « Pièges de mesure » de `CLAUDE.md`, posée ici quand cette section a été réduite à ses règles (J-2026-11-17-T@5c895111).

## Décision

Théo, 16 sept. 2026, tel que le carnet le rapporte : la règle reçoit sa portée. Deux matchs ne tournent jamais en même temps sur une même machine ; sur des runners distincts, ils le peuvent. Le carnet n'en garde pas la citation mot pour mot.

## Conséquences

Sur des runners distincts, il n'y a pas de vol de CPU, et les deux moteurs d'un même match partagent toujours leur machine : un ralentissement d'hôte les frappe symétriquement, et le verdict reste valide en interne. Seule la comparaison entre deux runs demande de lire leurs étalonnages. Sans cette portée, toute mesure appariée, que la cadence rend obligatoire, aurait été sérialisée.

La règle elle-même n'est qu'un cas d'une inégalité, que `match.yml` applique désormais : les cœurs occupés par une partie, fois la concurrence, ne dépassent pas les cœurs moins un.
