<!-- socle: couche=decisions zone=publique -->
# ADR-0031 — Deux binaires livrés, et la mesure se fait sur le binaire AVX2

> statut : acceptée · date : 2026-10-06 · lu : decisions@c3fc68f4

## Contexte

Décision de Théo sur les binaires livrés, portée jusqu'au 17 nov. 2026 par la section « Décisions structurantes » de `CLAUDE.md`, posée ici quand cette section a été réduite à ses règles, au quatrième lot du déplacement du carnet. Le texte d'avant est archivé au journal.

## Décision

Théo, 6 oct. 2026 : « on livrera deux binaires selon AVX2 ou non ». Puis le 7 oct. : « tu peux faire pour windows et macOS si c'est pas trop compliqué » : les deux mêmes binaires sous Windows et sur Mac Intel, le seul natif sur Apple Silicon.

## Conséquences

`x86-64` tourne partout ; `x86-64-v3` cherche le même arbre, plus vite. Les matchs mesurent sur le binaire AVX2, et la CI exige le même arbre sur les quatre systèmes : un binaire qui en chercherait un autre serait un autre moteur sous le même nom.
