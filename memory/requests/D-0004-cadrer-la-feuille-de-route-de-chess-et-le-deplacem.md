<!-- socle: couche=demandes zone=publique -->
# D-0004 — Cadrer la feuille de route de chess et le déplacement du carnet de bord, avant de les poser dans la mémoire

> date : 2026-11-12

## Décision demandée

Répondre librement aux questions de cadrage ci-dessous : la spécification
de ce sujet dépend d'une intention que la mémoire ne dit pas.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs écrit en Rust, avec une
interface à part. Son évaluation est un réseau de neurones entraîné sur la
carte graphique de Théo, et chaque changement se juge par des matchs joués
sur les machines gratuites de GitHub, les « runners ».

**Le chantier.** Le socle, la mémoire du projet tenue dans le dépôt et
vérifiée par des contrôles, est entré dans le dépôt le 12 nov. 2026. En le
demandant, le 11 nov., Théo en avait fixé deux suites : poser la feuille de
route dans le backlog (la liste ordonnée des sujets à faire) après l'avoir
remise en question avec lui, et déplacer vers la mémoire le carnet de
bord, la mémoire d'avant le socle, un artefact claude.ai. La
session du 12 nov. a relu la feuille de route validée le 31 oct. et mesuré
le carnet ; rien n'est encore écrit au backlog ni déplacé.

**La question.** La relecture laisse des points que ni le dépôt ni une
mesure ne tranchent : ils disent ce que Théo veut, ou engagent sa carte,
son compte GitHub ou ce qui devient public. Sans eux, les conditions de fin
des sujets du backlog seraient devinées.

Ce que la relecture a établi, et qui éclaire les questions :

- les quatre premiers points de la feuille de route sont de l'histoire,
  sauf un entraînement en cours : le dernier réseau de la séance
  d'architecture, 512 unités et dix « seaux de roi » (un jeu de poids par
  zone où se tient le roi) ; le point du socle est fait ;
- tous les verdicts se rendent à la cadence `8+0,08`, huit secondes plus
  huit centièmes par coup : un travail de runner y joue 2 800 parties en
  cinq heures environ. Théo a dit le 9 nov. viser le 40/15 de la CCRL, une
  liste de classement des moteurs, à quarante coups en quinze minutes :
  de l'ordre de cent fois plus de temps par coup, par le calcul de l'agent ;
- la force mesurée est d'environ 3 190 ± 24 sur l'échelle de Stockfish
  bridé, qui s'arrête là ; aucun chiffre encore contre des moteurs classés ;
- SPSA, le réglage automatique des marges de la recherche, est outillé
  depuis le 14 oct. et n'a jamais tourné : il attend un réseau
  « stabilisé », qu'aucun critère ne définit ;
- le carnet pèse 1,15 Mo, dont un journal de 207 entrées ; le dépôt est
  public, et le carnet est marqué privé.

## Questions

1. **Y a-t-il une cible à laquelle mesurer un jalon : une note sur la liste 40/15 de la CCRL, un rang, une date ? Ou la boucle reste-t-elle « le meilleur moteur possible », sans borne ?** Hypothèse de l'agent : pas de cible chiffrée ; un jalon se définit par un résultat (un réseau embarqué et situé, un réglage fait), et la première série contre des moteurs classés donne le chiffre de départ.
2. **Veux-tu un contrôle périodique à cadence longue ?** La feuille de route met la cadence longue en dernier, alors que la cible est le 40/15 et que le projet a vu un verdict changer de signe avec la cadence. Mesurer chaque candidat à cadence longue est hors de portée des runners ; mesurer l'ensemble d'un jalon ne l'est pas. Hypothèse de l'agent : à chaque réseau embarqué (compilé dans le moteur), un match à 60+0,6, une minute plus six dixièmes par coup, ~7,5 fois le prix d'une partie d'aujourd'hui, entre le moteur nouveau et celui du jalon d'avant ; en plus de la série contre les moteurs classés.
3. **Combien d'heures de ta carte par semaine, jusqu'à quand, et où s'arrête-t-on de grossir le réseau ?** Le chemin critique est là : douze à seize heures par réseau à 512 unités, à peu près le double à chaque pas de largeur, et trois axes ouverts (seize seaux de roi, des couches cachées, 768 ou 1 024 unités). Mesuré à la séance : dix seaux +15 Elo, 512 unités +33, dont +8 pour le dernier pas ; les gains suivants sont supposés. Louer une carte est-il envisageable, sous quel plafond ? L'agent n'en a chiffré aucune. Hypothèse de l'agent : ta carte seule, un réseau à la fois, lancé quand tu le dis ; seize seaux d'abord, les couches cachées ensuite, la largeur en dernier ; un axe s'arrête quand son dernier pas ne démontre plus de gain.
4. **SPSA dès que le réseau de la séance est embarqué, sans attendre un réseau « stabilisé » ?** Il tournerait sur les runners pendant que ta carte entraîne, et serait refait plus tard ; son coût en runners n'est pas mesuré, il n'a jamais tourné. Cela change l'ordre que tu as validé le 31 oct. : « après le cœur de la phase 4 et le réseau stabilisé », la phase 4 étant la recherche, close le 4 nov. Hypothèse de l'agent : oui.
5. **Quel plafond pour les runners de ton compte GitHub ?** La génération de données, les matchs, SPSA et les tests de mutation se les partagent, et les conditions de GitHub excluent une charge disproportionnée. Hypothèse de l'agent : seize travaux à la fois au plus, ta règle du 17 oct. ; la génération reste en pause tant que le stock dépasse ce que ta carte consomme.
6. **Veux-tu une seconde copie des données d'entraînement, et où ?** Celles que GitHub garde, 85,7 Go relevés le 6 nov., expirent entre le 14 et le 29 janv. 2027 ; après, ta machine porte la seule copie de plusieurs centaines d'heures de runner. Hypothèse de l'agent : aucune, ni pour ni contre une copie.
7. **Faut-il avancer l'automatisation des mesures : OpenBench, un serveur qui enchaîne les matchs sans relève à la main, dont tu as validé l'approche le 29 oct., sur ton mini-PC ?** Son déclencheur, « quand les effets cherchés passent sous ~3 Elo », ne se mesure pas, et les derniers réglages de recherche y sont déjà. Trois arrêts de session sur limite d'usage ont aussi coûté des jours de relève. Hypothèse de l'agent : pas maintenant ; le déclencheur devient « après le premier SPSA ».
8. **Où vit le registre des réglages ouverts ?** Par ta règle du 20 oct., aucun réglage n'y est jamais « résolu » : il ne se clôt pas comme un sujet du backlog. Hypothèse de l'agent : il reste un tableau de référence dans la documentation des outils ; seul un test décidé devient un sujet.
9. **Le carnet devient-il public ?** Le dépôt est public. Le carnet porte sa propre règle : privé sauf décision explicite contraire, à ne pas commiter dans ce dépôt, parce qu'il contient des raisonnements, des erreurs et des hypothèses ; la documentation des outils note de même qu'il reste hors du dépôt, son lien compris. Ce lien est pourtant dans la mémoire depuis l'installation (l'artefact, lui, reste fermé). Ta décision du 11 nov. de le déplacer vers la mémoire vaut-elle cette décision contraire, la mémoire étant publique ? Le déplacer le publie pour de bon : un historique git ne s'efface pas. Public tel quel, public après un tri (selon quoi ?), ou mémoire privée dans un dépôt à part ? Et le lien déjà public : à laisser, ou à retirer des fichiers ? Hypothèse de l'agent : aucune ; son contenu n'est pas trié.
10. **Le déplacement du carnet laisse-t-il la documentation des outils telle quelle ?** Elle porte 19 800 lignes de mesures et de verdicts. Hypothèse de l'agent : oui ; elle reste la preuve que les faits de la mémoire citent, et seules la feuille de route et sa file en sortent.
11. **Confirmes-tu, dans tes mots, deux consignes d'avant le socle que la session d'installation a retenues sans ton texte ?** Ne jamais présenter une recommandation de l'agent comme une décision de toi ; ne fusionner qu'à CI verte, tous les contrôles finis, par la méthode « merge », l'identifiant du commit de tête lu par git. Hypothèse de l'agent : les deux tiennent.

## Éléments cités

- B-0002@3c3bafc1 — le sujet du backlog qui demande de poser la feuille de route dans la mémoire, avec Théo
- B-0003@2c418cd9 — le sujet du backlog qui demande de déplacer le carnet de bord vers la mémoire
- D-0001@b73c13d7 — les cinq questions de départ du socle, encore sans réponse, dont celle d'une mémoire privée
- D-0002@a578d77a — les six décisions de Théo du 11 nov., dont le déplacement du carnet

## Où regarder

- La feuille de route, sa file et le registre : [tools/README.md](https://github.com/theodubus/chess/blob/ffcc602fd56f94ad129af0032aff271b7cae67b3/tools/README.md), section « Ce qui reste à faire, par ordre mesuré ».
- Les deux sujets : [B-0002](https://github.com/theodubus/chess/blob/ffcc602fd56f94ad129af0032aff271b7cae67b3/memory/backlog/B-0002-poser-la-feuille-de-route-de-chess-dans-la-memoire.md) et [B-0003](https://github.com/theodubus/chess/blob/ffcc602fd56f94ad129af0032aff271b7cae67b3/memory/backlog/B-0003-deplacer-le-carnet-de-bord-vers-la-memoire.md).
- Les questions de départ : [D-0001](https://github.com/theodubus/chess/blob/ffcc602fd56f94ad129af0032aff271b7cae67b3/memory/requests/D-0001-questions-de-depart.md) ; sa question sur la mémoire privée va avec la question 9.

Ce qu'il faut vérifier : que chaque question demande ton intention, et
non un choix que l'agent pourrait trancher seul.

## Options

- **Répondre** : quelques minutes, ton texte en un ou plusieurs messages,
  que l'agent consigne tel quel ; risque faible, la spécification suit ce
  que tu veux ; réversible.
- **Valider les hypothèses** : effort nul ; risque, une hypothèse qui ne dit
  pas ton intention, notée « supposée », se corrige plus tard ; réversible.
  Les questions 6 et 9 n'ont pas d'hypothèse : elles attendent ta réponse.
- **Refuser** : effort nul ; risque, les deux sujets attendent, sans
  spécification ; réversible.

## Conséquences

Si tu réponds, l'agent consigne ton texte exact, puis écrit les sujets du
backlog, un par étape, et te soumet le découpage du déplacement du carnet
dans une demande. Si tu valides les hypothèses, il les applique, notées
« supposées », et rien du carnet ne bouge avant ta réponse à la question 9.
Si tu refuses, les deux sujets attendent. Si les questions ne se
comprennent pas (`contexte-insuffisant`), l'agent les réécrit. Sans
réponse, les sujets attendent aussi ; l'entraînement en cours se relève à
ton signal, comme prévu.

## Recommandation

Répondre au moins aux questions 3, 6, 9 et 11 : elles engagent ta carte,
tes données ou ce qui devient public, ou demandent tes propres mots.
Vérifié dans le dépôt : les dates d'expiration, le poids du
carnet, sa règle de confidentialité, l'absence de tout réglage SPSA joué.
Supposé : le rapport des cadences, les gains attendus de chaque axe
d'architecture, et tout ce qu'avancent les hypothèses.

## Réponses possibles

- `valider` — les hypothèses de l'agent s'appliquent, notées « supposées ».
- `reponses` — le texte de ta réponse, en un ou plusieurs messages, donne les réponses ; l'agent le consigne tel quel.
- `refuser` — le sujet attend, sans spécification.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
