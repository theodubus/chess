<!-- socle: couche=backlog zone=publique -->
# B-0068 — mettre-en-commun.sh refuse deux petits jobs au même vecteur

> statut : ouvert · origine : J-2026-11-18-BB · après : B-0044 · lu : backlog@e3439ba3

`tools/mettre-en-commun.sh` refuse deux matchs aux vecteurs pentanomiaux
égaux (code 3) : à plusieurs milliers de parties, deux matchs
indépendants ne rendent jamais cinq comptes égaux, et un vecteur répété
dit une graine répétée. Les jobs de `classes.yml` ne tiennent qu'une
dizaine de paires : deux jobs indépendants y tombent sur le même vecteur
environ une fois sur cinquante à cent, donc un refus dans plus d'un tiers
des mises en commun à dix jobs (relecture de B-0048). Le refus pousserait
alors à relancer des jobs de cinq heures pour rien.

Le garde-fou doit tenir où il a un sens, et céder où le hasard
l'explique : par exemple ne refuser que si la probabilité d'une telle
coïncidence, sous la multinomiale de l'ensemble, est négligeable, ou
vérifier les graines quand le journal les porte. Un correctif livre son
test dans `tools/mettre-en-commun-test.sh`, qui échoue sur le script
d'aujourd'hui.

## Satisfait quand

- [ ] deux jobs de dix paires au même vecteur, graines distinctes, se mettent en commun
- [ ] deux grands matchs identiques restent refusés, et le test le garde
