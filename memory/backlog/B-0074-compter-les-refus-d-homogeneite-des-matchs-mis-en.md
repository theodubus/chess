<!-- socle: couche=backlog zone=publique -->
# B-0074 — Compter les refus d'homogénéité des matchs mis en commun

> statut : ouvert · origine : J-2026-11-23-J · après : B-0044 · priorité : basse · lu : backlog@a46128c7

`tools/mettre-en-commun.sh` refuse de réunir des jobs dont le plus grand
écart serait trop rare sous un seul effet, à 4,55 % : sous un seul effet,
un groupe sur vingt-deux environ est refusé. Rien ne compte les refus
d'une mesure à l'autre. La liste « Ce qu'il faut surveiller »
(J-2026-11-23-J) l'avait noté le 5 oct. 2026, à deux refus sur sept ;
depuis, les récits en nomment au moins six de plus (le lot de 8 192 de
C2c, E2.5t, E2.5v, C61, C66, C71), sur quelques dizaines de groupes que
personne n'a comptés, quand les p d'homogénéité du n° 23 penchaient en
moyenne vers le haut (J-2026-11-18-DP). Inférence de l'agent, confiance
faible : un écart réel au modèle d'un seul effet — un runner qui change
de régime pendant le match, une dispersion par job mal estimée — fausserait
les ± de chaque verdict mis en commun. Le compte se fait sur le journal,
sans runner.

## Satisfait quand

- [ ] chaque groupe de jobs mis en commun depuis septembre 2026 est compté, refusé ou non, avec son p
- [ ] la fréquence des refus et la distribution des p sont confrontées à ce qu'un seul effet donnerait, leur écart écrit au journal
- [ ] si l'écart est démontré, sa cause cherchée ou la règle de lecture des verdicts corrigée ; sinon, ce sujet clos sur ce constat
