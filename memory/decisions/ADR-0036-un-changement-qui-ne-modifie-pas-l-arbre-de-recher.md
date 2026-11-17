<!-- socle: couche=decisions zone=publique -->
# ADR-0036 — Un changement qui ne modifie pas l'arbre de recherche ne passe pas par un SPRT

> statut : acceptée · date : 2026-09-15 · lu : decisions@458aae03

## Contexte

Le premier arbitrage de protocole depuis le SPRT, consigné au carnet le jour même (J-2026-09-15-A@70612a39), quand une ardoise par ply venait de rendre la recherche 2,1 % plus rapide à nœuds identiques. Porté jusqu'au 17 nov. 2026 par la section « Pièges de mesure » de `CLAUDE.md`, il est posé ici quand cette section a été réduite à ses règles, au sixième lot du déplacement du carnet (J-2026-11-17-T@5c895111).

## Décision

Théo, 15 sept. 2026, tel que le carnet le rapporte : un changement qui ne modifie pas l'arbre de recherche ne passe pas par un SPRT. La règle « un SPRT par changement » vise les changements de décision. Le carnet n'en garde pas la citation mot pour mot.

## Conséquences

Une optimisation pure se prouve par un nombre de nœuds identique au bit près, vérifiable là où un verdict de match est probabiliste, puis par une mesure de temps à la profondeur 10 sur au moins vingt paires alternées, avec un test des signes : `tools/timing.sh` impose les deux. Le SPRT ne dirait que l'Elo acheté, et ne le vaudrait pas : 2 % de vitesse valent environ 2 Elo, soit ~31 000 parties.

« Nœuds identiques » ne vaut qu'à taille de structure constante : une réécriture qui change la taille d'une entrée change la capacité de la table, donc l'arbre, et revient au SPRT (`CLAUDE.md`, « Pièges de mesure »).
