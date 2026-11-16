<!-- socle: couche=backlog zone=publique -->
# B-0036 — Exclure de tools/etat.sh les branches que la politique garde

> statut : ouvert · origine : J-2026-11-13-C · priorité : basse · lu : backlog@70293e4a

`tools/etat.sh` propose à la suppression les branches distantes que
`main` contient en entier, mais n'en exclut que celles de Codex
(`codex/…`). Depuis D-0002, la politique garde aussi les branches de
réseaux (`reseau/…`) et celles des sessions de l'interface (`ccr-…`)
(`[human] keep_branches` de `.socle/policy.toml`). L'état du socle les
exclut ; ce script, lancé à la main depuis D-0009, les proposerait encore.
Le défaut est antérieur au lot de D-0009 : la relecture de ce lot l'a
relevé (J-2026-11-13-C), et il va ici plutôt que dans ce lot (politique,
point 6).

Le correctif : lire les motifs dans la politique plutôt que de les
recopier dans le script, et ajouter à `tools/etat-test.sh` un cas par
motif, chacun avec son témoin.

## Fait quand

- [ ] `tools/etat.sh` n'exclut que ce que la politique garde, ni plus ni moins, et `tools/etat-test.sh` le prouve
