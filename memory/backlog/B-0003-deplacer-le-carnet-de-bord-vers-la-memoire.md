<!-- socle: couche=backlog zone=publique -->
# B-0003 — Déplacer le carnet de bord vers la mémoire

> statut : ouvert · origine : D-0002 · lu : backlog@2b2f5dc4 · après : D-0004

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

## Fait quand

- [ ] les entrées du carnet sont dans la mémoire, ou archivées avec un renvoi
- [ ] `CLAUDE.md` ne porte plus que des règles de travail
- [ ] le budget de `CLAUDE.md` est baissé à sa nouvelle taille
- [ ] les tests de chess qui lisent la documentation passent toujours
