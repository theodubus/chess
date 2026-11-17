<!-- socle: couche=decisions zone=publique -->
# ADR-0032 — Ce qui vaut d'être testé se teste sans attendre de validation, et aucun réglage n'est résolu

> statut : acceptée · date : 2026-10-20 · lu : decisions@86140720

## Contexte

Décision de Théo sur les tests et les réglages, portée jusqu'au 17 nov. 2026 par la section « Par où commencer, sans contexte » de `CLAUDE.md`, posée ici quand cette section a été réduite à ses règles, au quatrième lot du déplacement du carnet. Le texte d'avant est archivé au journal.

## Décision

Théo, 20 oct. 2026, en validant la file de travail : « Je valide tous ces points, tout ce qui vaut le coup d'être testé » ; « Le but absolu est la perf ». Puis : « as tu vraiment besoin de ma validation ? j'ai dit plein de fois que tout ce qui vaut le coup d'être testé doit être testé ». Et : « il ne faut jamais considérer le point comme résolu si on a juste testé et validé une implémentation » ; « au pire, on dépriorise les nouveaux tests si la marge à chercher est fine ».

## Conséquences

Un test qui vaut le coup entre dans la file à son rang, marge estimée contre coût, et se signale au récap suivant. Ce qui se demande encore : ce qui engage Théo hors du test lui-même, et ce qui rouvrirait une décision structurante. Une valeur validée est une borne basse, pas un optimum, et l'optimum bouge quand la base change.
