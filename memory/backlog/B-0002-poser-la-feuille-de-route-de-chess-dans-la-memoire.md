<!-- socle: couche=backlog zone=publique -->
# B-0002 — Poser la feuille de route de chess dans la mémoire

> statut : ouvert · origine : J-2026-11-12-A · lu : backlog@1251a4e3 · après : D-0009, D-0004

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

## Posée le 12 nov. 2026

Théo a validé le 12 nov. les hypothèses de cadrage (D-0004) et tranché ce
qu'elles laissaient ouvert (D-0005). La feuille de route est depuis au
backlog, qui seul fait foi : quatre jalons du moteur, dans l'ordre
(B-0016, B-0019, B-0025, B-0030), leurs tâches, et trois sujets hors
jalon (B-0015, B-0026, B-0027). Les points 1 à 4 et 8 de l'ancienne
feuille, faits, n'y sont pas.

Ce qui n'est pas au backlog, par les hypothèses validées : le registre des
réglages ouverts et la longue traîne de la file (les tables de finale, les
ouvertures du générateur, l'analyse à plusieurs variantes), qui restent des
tableaux de référence de `tools/README.md` ; un test n'y devient un sujet
que le jour où il est décidé.

Le registre des réglages ouverts n'est écrit qu'à cet endroit, juste sous
l'ancienne feuille de route : la mention « plus tenue » ne le couvre pas,
et le retrait de la feuille de route ne l'emporte pas.

Reste l'ancien texte, que `tools/etat.sh` imprime encore à chaque
démarrage : le retirer change ce script et son test, et ce que le
démarrage lance est un réglage que Théo détient.

## Fait quand

- [x] Théo a revu la feuille de route et son ordre
- [x] chaque chantier retenu est un sujet du backlog, dans cet ordre
- [ ] Théo a dit ce que devient `tools/etat.sh` au démarrage
- [ ] le texte de la feuille de route dans `tools/README.md` est remplacé par un renvoi, `tools/etat.sh` et son test suivis
