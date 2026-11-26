<!-- socle: couche=backlog zone=publique -->
# B-0078 — Finir la transition : plus aucune information critique ni procédure dans un README ou un document d'outil

> statut : fait · origine : J-2026-11-23-R · priorité : haute · ref : J-2026-11-24-H · lu : backlog@f779427f

Théo, le 23 nov. 2026 : « Si c'est des infos critiques / protocoles clés
perdus dans de vulgaires readme ou trucs du genre alors c'est que tu n'as
pas fini la transition (j'ai pourtant dit de TOUT faire en ce qui
concerne la transition) » (J-2026-11-23-R). Le jalon JA-0007 a été fermé
sur `tools/README.md` et le `README.md`, les deux fichiers que nommait
D-0017 ; `tools/attic/README.md` n'a jamais été traité : 78 Ko de registre
des rustines rejetées, dont les cellules portent verdicts et conditions de
réouverture, et ~6 Ko de récits et d'une règle (« La règle »).

Le périmètre : chaque document hors de la mémoire, de `ui/` (tiers) et du
socle — `CLAUDE.md`, `README.md`, `tools/README.md`,
`tools/attic/README.md`, `tools/pieges-fermes.md` —, lu en entier, chaque
passage rangé selon sa nature (D-0020) : l'histoire au journal, une règle
de travail dans `CLAUDE.md`, une procédure dans un skill, un fait mesuré
dans les faits, un travail à faire au backlog ; le document ne garde que
ce qui décrit son outil ou son dossier. Les dispositifs qui lisent ces
fichiers (`engine/tests/rustines_attic.rs` lit la colonne « s'applique
sur `main` ? » du registre, `engine/tests/pieges_fermes.rs` l'archive des
pièges) restent verts.

## Satisfait quand

- [x] chaque document du périmètre est lu en entier, et chaque passage qui n'y est pas à sa place est rangé selon sa nature, l'histoire au journal tel quel (l'attic et `CLAUDE.md`, J-2026-11-23-V ; les 25 points de J-2026-11-23-X, J-2026-11-23-Z, J-2026-11-24-B et J-2026-11-24-D ; les sept résidus du balayage final, J-2026-11-24-H)
- [x] `tools/attic/README.md` ne garde que son registre et ce qui décrit le dossier ; ce dont une décision dépend (une condition de réouverture, une règle) est là où le travail le lit (J-2026-11-23-S, J-2026-11-23-W, les skills `rendre-un-verdict` et `passer-a-l-ecran`)
- [x] un relecteur sans contexte, à qui l'on demande de chercher une procédure ou une information critique restée dans un de ces documents, n'en trouve aucune (premier passage : sept résidus, traités ; second passage : aucune, cinq renvois périmés corrigés ; J-2026-11-24-H)
