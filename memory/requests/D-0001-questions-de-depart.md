<!-- socle: couche=demandes zone=publique -->
# D-0001 — Les questions de départ du projet

> date : 2026-11-11 · origine : `socle init`

## Décision demandée

Répondre aux 5 questions de départ ci-dessous, ou accepter tous leurs
défauts d'un mot.

## Contexte

**Le projet.** Ce dépôt, chess, vient d'être équipé du socle : un outil qui
garde la mémoire du projet dans le dépôt, vérifie ce que l'agent de code y
produit, et pose à l'humain, en demandes comme celle-ci, les décisions qui
lui reviennent. Ce que fait le projet lui-même, l'agent ne le devine pas :
c'est l'une des questions ci-dessous.

**Le chantier.** L'initialisation du socle : décrire le projet dans sa
mémoire, à partir de un dépôt existant, pour que l'agent travaille ensuite sans
deviner. Rien d'autre n'est encore fait.

**La question.** L'agent n'invente rien : il ne demande pas ce qu'il peut lire dans
le dépôt (le langage, les outils de test), seulement ce qu'il ne peut pas
deviner, comme le but du projet, la confidentialité ou le niveau
d'autonomie. Les questions sont groupées ici, au début, et plafonnées à
7 ; les moins urgentes vont au backlog. Chacune a un défaut, et dit
ce que ce défaut change.

## Questions

1. **Quel est le but du projet, en une phrase ?** Défaut : celui que dit le README, s'il en a un ; sinon aucun, et le backlog reste vide. Ce que ça change : le but alimente le backlog ; en défaut, il est noté « supposé ».
2. **Une partie de la mémoire doit-elle rester privée ?** Défaut : non : toute la mémoire est publique. Ce que ça change : une mémoire privée se pose par l'installeur, en dépôt privé à côté ou chiffrée.
3. **La politique d'autonomie par défaut (les huit points du cadrage) te convient-elle ?** Défaut : oui, telle quelle. Ce que ça change : la politique dit ce que l'agent décide seul et ce qu'il te demande ; toi seul la modifies.
4. **Le travail se livre-t-il par une branche de développement, une seule pull request ouverte à la fois, ou par une branche et une pull request par sujet ?** Défaut : une branche de développement : chaque lot fini s'ajoute à la pull request ouverte, que tu fusionnes quand tu veux. Ce que ça change : une pull request par sujet se relit sujet par sujet, mais il y en a une à fusionner par sujet ; le choix devient un fait de la mémoire, que l'agent suit.
5. **Des contraintes à respecter (licence, dépendances, plateformes, délais) ?** Défaut : aucune connue. Ce que ça change : une contrainte devient un fait « supposé » jusqu'à ce que tu la valides.

## Éléments cités

- Aucun élément de la mémoire : le projet commence, et ces questions en posent le départ.

## Où regarder

- Les instructions du projet : [CLAUDE.md](../../CLAUDE.md), section de la politique d'autonomie.

Ce qu'il faut vérifier : que chaque défaut te convient, ou la réponse à
mettre à sa place.

## Options

- **Accepter tous les défauts** : effort nul ; risque faible, chaque défaut
  reste « supposé » et se corrige plus tard ; réversible.
- **Répondre question par question** : quelques minutes ; le départ suit ce
  que tu veux ; réversible.
- **Refuser les défauts** : effort nul maintenant ; risque, le départ attend
  ces réponses, chaque question restant ouverte ; réversible.

## Conséquences

Si tu valides les défauts, l'agent les applique, marqués « supposés ». Si tu
réponds autrement, l'agent consigne ton texte exact et l'applique. Si tu
refuses les défauts (`refuser`), chaque question reste ouverte, au backlog.
Si les questions ne se comprennent pas (`contexte-insuffisant`), l'agent
les réécrit. Sans réponse, les défauts s'appliquent, marqués
« supposés », et la demande reste en file pour que tu y reviennes.

## Recommandation

Lire les défauts et ne répondre qu'à ce qui ne te convient pas. Vérifié : ce
que l'audit du dépôt a lu, s'il y en avait un. Supposé : tout le reste.

## Réponses possibles

- `valider` — tous les défauts s'appliquent, marqués « supposés ».
- `reponses` — le texte de ta réponse donne les réponses, question par question ; l'agent le consigne tel quel.
- `refuser` — aucun défaut ne s'applique : chaque question reste ouverte, au backlog.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
