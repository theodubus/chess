<!-- socle: couche=actif zone=publique -->
# Chantier actif

Réécrit au fil du travail et borné. Ce qui en sort s'archive dans le journal.

## En cours

L'adoption du socle, entière, avant tout travail sur le moteur : Théo, le
12 nov. 2026 (D-0006, D-0008). Le jalon B-0031 dit ce que « finie » veut
dire.

**Théo, le 16 nov. 2026 : on finit ici l'adoption, et la mise à jour du
socle vient ensuite** (J-2026-11-16-A). D-0009 est faite et fusionnée
(pull request 293, J-2026-11-16-B) ; B-0002, B-0004 et B-0034 sont clos,
l'ancien script de fin de tour est retiré (D-0012, B-0035, pull request
294), et le journal du carnet est posé (B-0006, pull request 295), le test
des chiffres du banc écartant les couches gelées de la mémoire (D-0013 à
D-0015). Le 17 nov., le reste du carnet est dans la mémoire (B-0007,
J-2026-11-17-L) : ses arbitrages en décisions, ADR-0001 à ADR-0025, le
reste archivé au journal. Reste la seule condition ouverte du jalon
B-0031 : `CLAUDE.md` réduit aux règles de travail (B-0003).

## Prochaines étapes

Dans l'ordre :

1. Livrer B-0007 sur une pull request, relu sans contexte puisqu'il
   touche `CLAUDE.md`.
2. `CLAUDE.md` en trois lots (B-0008 à B-0010), le budget baissé à chaque
   lot. Clore B-0003 par l'inventaire, puis le jalon B-0031.
3. Ensuite seulement, la mise à jour du socle (Théo, 16 nov.).

**Les liens donnés à Théo se présentent en Markdown**, entre crochets le
texte qui nomme ce qu'ils désignent (D-0015, la pull request 295), puis
l'adresse entre parenthèses ; jamais une adresse brute (Théo, 16 nov.
2026, J-2026-11-16-F).

Le skill de reprise s'applique : deux réveils par tour qui agit, retirés
à la fin du tour. Le registre des réglages ouverts n'est écrit que dans
`tools/README.md`, sous-section « La file ». Les données d'entraînement
expirent chez GitHub à partir du 14 janv. 2027 (F-0005, B-0026).

Livraison, confirmée par Théo : une branche de développement, une seule
pull request ouverte à la fois, fusionnée par l'agent à CI verte, tous
les contrôles finis, par la méthode « merge ».
