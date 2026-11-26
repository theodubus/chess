<!-- socle: couche=backlog zone=publique -->
# B-0083 — Une session programmée reçoit les instructions de la tête de sa branche, pas celles d'une copie périmée

> statut : ouvert · origine : J-2026-11-26-O · lu : backlog@5d0dc4c9

Le 26 nov. 2026, la session réveillée par la passation de J-2026-11-26-N
a démarré sur 4f309d7 au lieu de c2c9ab9, la tête de sa passation : son
conteneur portait un dépôt cloné à 16 h 05 par la session d'avant, et sa
mise en place, après s'être placée sur c2c9ab9, a basculé sur la branche
locale `claude/agents-md`, restée périmée (reflog, J-2026-11-26-O). Son
contexte a reçu les instructions, les skills et les hooks de 4f309d7 :
ce jour-là, une ligne d'écart, sans effet ; un lot qui change les
instructions juste avant sa passation, comme L-0002, les ferait manquer
à la session suivante sans bruit. La garde et l'état l'ont laissé passer :
`socle state` imprimait `commit : 4f309d71` et la passation en attente sur
`origin/claude/agents-md`, sans dire que la tête locale était en retard.

Une session créée avec une branche de sortie neuve démarre bien sur la
tête (la sonde de J-2026-11-26-O). Le mécanisme exact, un instantané du
conteneur de la session qui crée, pris à son démarrage, est supposé
(confiance moyenne). La garde, l'état et le skill de passation sont du
socle, protégés : une correction passe par lui ou par la plateforme, ce
qu'il faut d'abord trancher.

## Satisfait quand

- [ ] une session réveillée par une passation programmée démarre sur la tête que nomme sa passation, constaté au reflog d'une passation réelle
- [ ] à défaut, l'écart se voit avant tout travail : l'état ou la garde dit que la tête locale n'est pas la référence de la passation, et que les instructions reçues sont celles de l'ancienne tête
