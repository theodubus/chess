<!-- socle: couche=decisions zone=publique -->
# ADR-0028 — Une version web sur GitHub Pages, sans effet sur le moteur

> statut : acceptée · date : 2026-10-27 · lu : decisions@c673d9d1

## Contexte

Décision de Théo sur la version web, portée jusqu'au 17 nov. 2026 par la section « Structure » de `CLAUDE.md`, posée ici quand cette section a été réduite à ses règles, au quatrième lot du déplacement du carnet. Le texte d'avant est archivé au journal.

## Décision

Théo, 27 oct. 2026 : une version web sur GitHub Pages, un chemin de plus pour essayer sans installer, quitte à y jouer moins fort ; « l'ajout de cette fonctionnalité ne doit absolument pas impacter ni le fonctionnement ni la performance du moteur ».

## Conséquences

Elle prend le binaire du moteur compilé tel quel pour `wasm32-wasip1-threads` et, en repli, `ui/wasm`, qui n'emploie que l'API publique du moteur ; rien dans `engine/` ne s'écrit pour elle.
