<!-- socle: couche=decisions zone=publique -->
# ADR-0040 — Les heures s'écrivent à l'heure de Paris

> statut : acceptée · date : 2026-10-06 · lu : decisions@52b5a77c

## Contexte

Jusqu'au 6 oct. 2026, les heures du dépôt et du carnet s'écrivaient en UTC, l'horloge du conteneur. Décision de Théo consignée au carnet le jour même, parmi ses quatre points du 6 oct. (J-2026-10-06-B@8767c866), portée jusqu'au 17 nov. 2026 par la section « Style » de `CLAUDE.md` ; posée ici quand cette section a été réduite à ses règles (J-2026-11-17-W@a4e6e5fc).

## Décision

Théo, 6 oct. 2026, tel que le carnet le rapporte : les heures s'écrivent à l'heure de Paris, dans les messages, le carnet et la documentation. Le carnet n'en garde pas la citation mot pour mot.

## Conséquences

Les heures d'avant cette date, dans le dépôt comme dans le carnet, restent en UTC : deux heures de moins que Paris jusqu'au 25 oct. 2026, une ensuite. Seuls les horodatages des rappels programmés restent en UTC, l'API l'exige.
