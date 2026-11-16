<!-- socle: couche=demandes zone=publique -->
# D-0013 — Exclure le journal de la mémoire du test des chiffres du banc

> date : 2026-11-16 · forme : séance · sujet : engine/tests/bench_reference.rs

## Question posée

Le test engine/tests/bench_reference.rs, qui vérifie que chaque chiffre de référence du banc écrit dans les fichiers Markdown est le chiffre actuel, échoue sur une entrée importée du carnet qui cite la forme de son marqueur sans chiffre. Choisis 1 ou 2. 1 (recommandé) : exclure le journal de la mémoire de ce test ; le journal est en ajout seul, un chiffre qui y figure est une trace datée qu'on ne peut pas mettre à jour ; le test continue de couvrir tous les autres fichiers, et un cas ajouté le prouve. 2 : modifier le texte de l'entrée importée, au prix de la fidélité de l'import.
