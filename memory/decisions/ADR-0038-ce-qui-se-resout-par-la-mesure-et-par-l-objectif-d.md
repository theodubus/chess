<!-- socle: couche=decisions zone=publique -->
# ADR-0038 — Ce qui se résout par la mesure et par l'objectif de qualité à long terme ne demande pas d'arbitrage

> statut : acceptée · date : 2026-09-21 · lu : decisions@458aae03

## Contexte

Le 21 sept. 2026, deux tests d'aspiration tombaient sous PVS. Ils avaient déjà été reformulés une fois, et `CLAUDE.md` tenait une seconde reformulation du même test pour de l'accommodement : la décision avait été laissée à Théo. Sa réponse, consignée au carnet (J-2026-11-17-I@cc53d4f4, où le chemin actif du carnet est archivé), était portée jusqu'au 17 nov. 2026 par la section « Pièges de mesure » de `CLAUDE.md` ; elle est posée ici quand cette section a été réduite à ses règles (J-2026-11-17-T@5c895111).

## Décision

Théo, 21 sept. 2026 : « *tout ce qui peut se résoudre par la mesure et par l'objectif de qualité long terme ne nécessite pas d'arbitrage.* »

## Conséquences

Une question que la mesure tranche, au regard de la qualité à long terme (ADR-0024@f42d6ce8), ne remonte pas à Théo. Pour les deux tests, la mesure était indépendante du changement : sur `main`, sans une ligne de PVS, le score différait déjà de la fenêtre pleine dans 38 cas sur 459. L'assertion était donc fausse en elle-même, et la retirer était la réponse honnête.

Le garde-fou contre l'accommodement n'est pas le compte des reformulations mais cette indépendance : la mesure qui condamne une assertion a-t-elle été obtenue sans le changement qu'on veut faire passer ? Ce qui ne se résout pas ainsi, ce qui engage Théo ou rouvre une décision structurante, lui revient toujours.
