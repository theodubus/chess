<!-- socle: couche=decisions zone=publique -->
# ADR-0034 — Plus de runners pour les petits effets

> statut : acceptée · date : 2026-10-06 · lu : decisions@afea22b2

## Contexte

Décision de Théo sur la mesure des petits effets, consignée au carnet le jour même (J-2026-10-06-B@8767c866) et portée jusqu'au 17 nov. 2026 par la section « Ce qui compte comme preuve » de `CLAUDE.md`, posée ici quand cette section a été réduite à ses règles, au cinquième lot du déplacement du carnet. Le texte d'avant est archivé au journal (J-2026-11-17-Q@7509c51a).

En phase de stagnation, les améliorations tombent sous ce qu'un seul job de `match.yml` sait trancher, ~20 Elo à `8+0,08`.

## Décision

Théo, 6 oct. 2026, tel que le carnet le rapporte : plus de runners pour les petits effets, en plusieurs vagues s'il le faut ; vingt-six jobs avaient tourné ensemble ce jour-là. Le carnet n'en garde pas la citation mot pour mot.

## Conséquences

Un petit effet se mesure par des matchs à longueur fixe répartis sur bien plus de jobs, puis mis en commun par `tools/mettre-en-commun.sh` ; jamais par plusieurs SPRT, dont l'arrêt au premier qui franchit sa borne multiplierait le risque de première espèce.

La condition est un livre assez grand. Rejoué d'un job à l'autre, le livre de 500 ouvertures corrélait les paires, et plus de runners n'y achetait qu'une fausse précision. Le livre a 15 000 ouvertures depuis le soir du 6 oct. (n° 11, `tools/README.md`).
