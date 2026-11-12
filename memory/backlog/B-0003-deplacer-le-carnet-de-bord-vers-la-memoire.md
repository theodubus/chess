<!-- socle: couche=backlog zone=publique -->
# B-0003 — Déplacer le carnet de bord vers la mémoire

> statut : ouvert · origine : D-0002 · forme : jalon · après : D-0004, B-0005, B-0006, B-0007, B-0008, B-0009, B-0010 · priorité : haute · lu : backlog@2b2f5dc4

La décision 4 de Théo (D-0002) : `CLAUDE.md` garde sa marge de budget à
l'installation, et **le premier sujet de chess** est de déplacer le carnet
de bord vers la mémoire, pour que `CLAUDE.md` ne garde que les règles de
travail.

Le carnet de bord d'avant le socle est un artefact claude.ai
(url:https://claude.ai/artifact/Da9UuFoYun8x2hzFMz9Ke5), tenu jusqu'au
10 nov. 2026. Ses entrées portent des identifiants de la même forme que
ceux du journal : elles ne se citent pas dans la mémoire tant qu'elles n'y
sont pas, le contrôle des références les dirait inexistantes.

`CLAUDE.md` pèse environ 140 Ko pour un budget de 153 Ko. L'état du
moteur, les verdicts et l'historique des réseaux qu'il porte sont de la
mémoire, pas des règles de travail.

Deux contradictions avec la section du socle se règlent ici, en resserrant
le texte de chess : le titre « Ce qui tourne tout seul », présent deux
fois, et les deux commandes de vérification, `tools/verify.sh` et celle du
socle, qui lancent les mêmes étapes en rapide.

## Le découpage, validé par Théo le 12 nov. 2026

Théo a décidé que le carnet devient public, d'abord après un tri (D-0005),
puis sans tri (D-0006), et dit avoir validé le découpage proposé. Six
lots, dans cet ordre, chacun un sujet : la conversion à blanc (B-0005) ; le
journal du carnet (B-0006) ; ses autres rubriques (B-0007) ; puis
`CLAUDE.md` en trois lots, le budget baissé à chacun (B-0008, B-0009,
B-0010). La sortie du mode adoption (B-0001) précède le premier. La
documentation des outils n'est pas touchée. Ce sujet-ci se clôt par
l'inventaire : chaque fait de l'ancienne mémoire retrouvé dans la nouvelle.

## Fait quand

- [ ] les entrées du carnet sont dans la mémoire, ou archivées avec un renvoi
- [ ] `CLAUDE.md` ne porte plus que des règles de travail
- [ ] le budget de `CLAUDE.md` est baissé à sa nouvelle taille
- [ ] les tests de chess qui lisent la documentation passent toujours
