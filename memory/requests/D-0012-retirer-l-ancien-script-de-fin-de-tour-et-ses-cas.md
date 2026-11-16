<!-- socle: couche=demandes zone=publique -->
# D-0012 — Retirer l'ancien script de fin de tour et ses cas de test

> date : 2026-11-16 · forme : séance · sujet : memory/backlog/B-0035-retirer-l-ancien-hook-de-fin-de-tour-plus-declare.md

## Question posée

Je retire l'ancien script de fin de tour, .claude/hooks/verify-on-stop.sh, qui ne tourne plus depuis le retrait de son bloc de .claude/settings.json (B-0035) ? Oui : je supprime le fichier ; dans tools/verify-hooks.sh, les deux cas qui vérifient les droits d'exécution et la syntaxe des scripts de hook ne gardent que l'autre hook de chess, le cas qui le lance en mode d'essai disparaît (16 cas deviennent 15), et la documentation suit. Non : il reste, inutilisé.
