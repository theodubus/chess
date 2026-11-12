<!-- socle: couche=backlog zone=publique -->
# B-0002 — Poser la feuille de route de chess dans la mémoire

> statut : ouvert · origine : J-2026-11-12-A · lu : backlog@1251a4e3

La feuille de route de chess, validée par Théo le 31 oct. 2026, vit encore
dans `tools/README.md`, en tête de « Ce qui reste à faire », avec la file
et le registre des réglages ouverts ; `tools/etat.sh` l'imprime à chaque
démarrage, à côté de l'état du socle. Elle se pose dans la mémoire **avec
Théo**, qui veut d'abord la remettre en question : rien ne s'y rouvre ni
ne s'y réordonne sans lui (sa consigne du 11 nov. 2026 : la feuille de
route ne s'ouvre pas dans la session qui installe).

Ce qui est en vol pendant ce temps se lit dans le chantier actif.

Tant que ce sujet est ouvert, chaque session reçoit deux états au
démarrage, qui se recoupent : celui de `tools/etat.sh`, environ 7 Ko, et
celui du socle. Retirer le premier de `.claude/settings.json` revient à
Théo, ce fichier étant protégé.

## Fait quand

- [ ] Théo a revu la feuille de route et son ordre
- [ ] chaque chantier retenu est un sujet du backlog, dans cet ordre
- [ ] Théo a dit ce que devient `tools/etat.sh` au démarrage
