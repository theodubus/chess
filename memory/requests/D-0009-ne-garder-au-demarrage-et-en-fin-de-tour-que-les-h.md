<!-- socle: couche=demandes zone=publique -->
# D-0009 — Ne garder, au démarrage et en fin de tour, que les hooks du socle

> date : 2026-11-12

## Décision demandée

Retirer de `.claude/settings.json` les deux hooks d'avant le socle, celui
du démarrage et celui de la fin de tour, pour ne garder que ceux du socle.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs écrit en Rust. Un agent de
code y travaille dans des sessions ; des « hooks », des commandes que
l'outil lance tout seul à des moments fixes, l'encadrent.

**Le chantier.** L'adoption du socle, la mémoire du projet tenue dans le
dépôt et vérifiée par des contrôles. Théo a décidé le 12 nov. 2026 qu'elle
se finit avant tout travail sur le moteur. Sont faits : l'installation, la
feuille de route posée au backlog, deux contrôles durcis. Restent : le
carnet de bord, la mémoire d'avant le socle, à déplacer dans celle-ci ; le
fichier d'instructions de l'agent, `CLAUDE.md`, à réduire à ses règles ;
et ce que cette demande tranche.

**La question.** Depuis l'installation, deux hooks font la même chose à
deux moments, l'un d'avant le socle, l'autre du socle. Le fichier qui les
déclare est protégé : seul Théo le modifie. Il faut donc sa décision, puis
son geste.

Au démarrage de chaque session, et après chaque résumé de contexte, deux
états s'impriment dans le contexte de l'agent :

- celui de `tools/etat.sh`, 7 510 octets mesurés le 12 nov., dont 6 202
  sont l'ancienne feuille de route, que le backlog remplace ;
- celui du socle, 5 094 octets.

Ce que le premier imprime et que le second ne calcule pas : cette feuille
de route périmée, trois renvois vers la documentation des outils, dont un
daté du 23 sept., et l'adresse du carnet, sans objet une fois le carnet
déplacé. Le reste, la branche, les commits non fusionnés, les fichiers
changés, les branches distantes à supprimer, le socle le calcule aussi.
Un seul des trois renvois sert encore, vers la liste de ce qui vieillit
sans que rien ne le signale : il ira dans les instructions de l'agent.

En fin de tour, deux hooks lancent les mêmes douze étapes de vérification
(format, lint, tests) : 123 secondes pour celui d'avant le socle, 122 pour
celui du socle, mesurées le 12 nov. Celui du socle ne les relance pas sur
un arbre déjà vérifié (3 secondes) ; l'autre, si. Une seule différence
utile : celui d'avant se déclenche aussi quand seuls les tests
d'intégration changent. L'agent peut fermer cet écart sans fichier
protégé : les garde-fous, les seuils du socle, portent une liste de
chemins tenus pour du code, et y ajouter ces tests durcit un seuil, ce
que l'agent fait seul ; seul un assouplissement demande ta validation.
L'autre différence ne fait rien perdre : celui d'avant relance tout à
chaque fin de tour, même sur un arbre déjà vérifié.

## Éléments cités

- B-0002@1e2127c2 — le sujet du backlog qui retire l'ancienne feuille de route et attend de savoir ce que le démarrage imprime
- B-0004@9190a2bc — le sujet du backlog qui compare les deux hooks de fin de tour, avec leurs durées mesurées
- B-0031@651f7bb7 — le jalon qui dit ce que « adoption finie » veut dire, et qui attend ces deux sujets

## Où regarder

- Les quatre hooks tels qu'ils sont déclarés : [.claude/settings.json](https://github.com/theodubus/chess/blob/52b54d12db04c67ba94f6ffb50306b4dfbb9d22b/.claude/settings.json). Ce que tu peux y vérifier : les deux blocs à retirer sont le premier de `SessionStart` et le premier de `Stop`, comme l'agent l'a lu.
- La comparaison des deux hooks de fin de tour : [B-0004](https://github.com/theodubus/chess/blob/52b54d12db04c67ba94f6ffb50306b4dfbb9d22b/memory/backlog/B-0004-trancher-les-deux-hooks-de-fin-de-tour.md).
- Ce que le premier état imprime : [tools/etat.sh](https://github.com/theodubus/chess/blob/52b54d12db04c67ba94f6ffb50306b4dfbb9d22b/tools/etat.sh).

## Options

- **Ne garder que les hooks du socle** (recommandée). Effort pour Théo :
  retirer deux blocs de `.claude/settings.json`, puis lancer dans son
  terminal `python3 .socle/socle approve --files .claude/settings.json`,
  la commande par laquelle il approuve un fichier protégé qu'il a changé,
  et commiter. Cela se fait sur la branche de travail, après les
  changements de l'agent, qui donnera alors le mode d'emploi exact dans un
  sujet à ton nom.
  Effort pour l'agent : retirer de `tools/etat.sh` la feuille de route, les
  renvois et l'adresse du carnet ; le garder comme outil à lancer à la
  main ; ajouter les tests d'intégration aux chemins de code des
  garde-fous ; faire suivre le test `tools/verify-hooks.sh`, dont deux cas
  attendent aujourd'hui les hooks d'avant en première place. Risque
  faible : la CI lance tout de toute façon. Réversible : remettre les deux
  blocs.
- **Garder les deux** (`garder-les-deux`). Effort : l'agent ne retire que
  la feuille de route de ce que `tools/etat.sh` imprime. Coût durable :
  environ deux minutes de plus à chaque fin de tour où du code attend son
  commit, et deux états qui se recoupent au démarrage. Réversible.
- **Refuser** : rien ne change ; les deux sujets restent ouverts, et
  l'adoption ne se clôt pas.

## Conséquences

Si tu valides, l'agent prépare ses changements sur la branche de travail
et te dit quand retirer les deux blocs ; les deux sujets se closent quand
la CI est verte. La valeur attendue de deux cas de `tools/verify-hooks.sh`
change ; par la politique du projet, changer ce qu'un test attend demande
ta validation, que cette demande donne si tu la valides. Si tu choisis de garder les deux,
l'agent retire seulement la feuille de route périmée du démarrage, et les
deux sujets se closent sur ce choix. Si tu refuses, ou sans réponse, rien
ne bouge ici et l'agent continue le déplacement du carnet.

## Recommandation

Valider. Vérifié dans le dépôt le 12 nov. : les tailles des deux états,
les durées des deux hooks, ce que chacun imprime ou lance, et que le hook
du socle se déclenche sur les chemins de code des garde-fous. Supposé :
que rien d'autre ne lise la sortie de `tools/etat.sh` au démarrage. Si
c'est faux, une étape de `tools/verify.sh` échouera avant la fusion, et
rien ne sera fusionné.

## Réponses possibles

- `valider` — ne garder que les hooks du socle, comme recommandé.
- `garder-les-deux` — garder les quatre hooks ; seule la feuille de route périmée quitte le démarrage.
- `refuser` — rien ne change.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
