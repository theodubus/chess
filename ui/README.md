# ShallowRed UI

Application locale d’échecs avec React, TypeScript, Vite, Chessground et chess.js.
L’interface pilote le moteur exclusivement par l’adaptateur `Engine` et UCI.

## Démarrer

Une seule commande, depuis la **racine du dépôt** :

```sh
npm --prefix ui run dev
```

Depuis `ui/`, `npm run dev` fait la même chose. Installer les dépendances avec
`npm --prefix ui ci` au premier lancement. `npm start` dans `ui/` est un alias.

Ouvrir l’adresse affichée dans le terminal, par défaut `http://127.0.0.1:5173`.
Le lancement vérifie ShallowRed (protocole UCI et recherches légales), puis
ouvre le front et son pont privé ensemble. Le binaire par défaut est
`target/release/shallowred`, résolu depuis le dépôt, indépendamment du terminal.
S’il manque, compiler une fois depuis la racine :
`cargo build --release --bin shallowred`.

`Ctrl+C` ferme les deux services et leurs connexions moteur. Si le port est
occupé, le lancement échoue clairement au lieu de basculer sur 5174 en silence.
Fermer l’ancien terminal ou choisir explicitement un autre port :

```sh
npm --prefix ui run dev -- --port 5180
npm --prefix ui run dev -- --engine /chemin/absolu/vers/un/moteur
```

Le navigateur utilise `/engine/` sur la même adresse que le front pour HTTP
et WebSocket ; il ne dépend plus d’un port moteur 8787. Le pont reçoit un port
local libre et refuse les origines étrangères. Un autre moteur peut aussi être
défini par `CHESS_ENGINE`. Ne pas lancer `engine:bridge` en plus : cette ancienne
commande reste disponible uniquement pour les diagnostics du pont isolé.
Le transport reste réservé au développement local ; le déploiement de production
n’est pas choisi par cette interface.

### Choisir un moteur d’analyse, notamment Stockfish

Le moteur de jeu reste celui passé au pont. Dans « Options d’analyse » →
« Ajouter un moteur local », saisir le chemin absolu du binaire et cliquer
« Vérifier et ajouter ». Le pont vérifie le fichier exécutable, le nom UCI,
`uciok`, `readyok`, puis trois recherches (position initiale, camp noir,
position FEN). Il exige des évaluations et des coups/variantes légaux, avec
un délai limité ; tout échec refuse l’ajout. Ce test établit la compatibilité
avec l’interface, pas la force du moteur ni la sûreté de son exécutable.
Choisir uniquement un programme local de confiance.

Le nom UCI réel apparaît dans la liste, y compris pour ShallowRed. Les ajouts
sont sauvegardés dans `dev/engines.local.json` (ignoré par Git), sans redémarrer
le pont. Un binaire déjà déclaré est retesté puis sélectionné sans doublon.
Les refus gardent la sélection précédente. Le moteur de jeu n’est pas remplacé.

La configuration JSON au lancement reste possible, notamment pour les moteurs
nécessitant des arguments :
Chaque moteur peut rester à son emplacement actuel ; aucun dossier imposé ni
copie du binaire n’est nécessaire. Exemple pour le Stockfish installé sur Linux :

```json
[
  { "id": "stockfish", "label": "Stockfish", "command": "/usr/games/stockfish" }
]
```

Enregistrer ce tableau dans `moteurs.json`, puis démarrer depuis `ui/` :

```sh
npm run dev -- --engines moteurs.json
```

Le fichier peut contenir plusieurs moteurs avec des identifiants uniques et
un tableau `args` facultatif. Un chemin relatif contenant `/` est résolu par
rapport au fichier JSON ; un simple nom de commande est cherché dans le PATH.
`dev/engines.example.json` fournit l’exemple ci-dessus. Le pont expose seulement
les noms et identifiants pour les connexions UCI. L’ajout explicite transmet
un chemin absolu au formulaire de validation. Les requêtes d’ajout sont réservées
aux origines locales autorisées, en JSON, et le programme est lancé sans shell.
Après modification du fichier, relancer l’application puis « Actualiser les moteurs »
dans les options. Un moteur absent provoque une erreur explicite, sans substitution.

Le changement de moteur propose « Relancer l’analyse » et recalcule toute la
partie, sans mélanger les évaluations des moteurs. Le choix appliqué est mémorisé
pour les prochaines analyses. Le nom annoncé par le moteur UCI apparaît au-dessus
de la revue. Les annotations utilisent les mêmes règles, avec les évaluations
du moteur sélectionné ; aucun support MultiPV n’est requis.
[Documentation officielle de Stockfish](https://official-stockfish.github.io/docs/stockfish-wiki/Download-and-usage.html)
pour obtenir un binaire adapté au système. Aucun binaire Stockfish n’est livré dans l’UI.

## Préparer, jouer, revoir

L’accueil ne montre pas de plateau. Choisir le moteur local ou deux joueurs
sur cet appareil, puis la cadence. Contre le moteur, choisir Blancs, Noirs ou
Aléatoire. Le tirage au sort se fait une seule fois par nouvelle partie.
Les réglages validés sont mémorisés localement ; valeurs initiales : moteur,
Blancs, 5 minutes + 3 secondes. Tous les anciens préréglages et les cadences
personnalisées (0,5–180 minutes, incrément 0–60 secondes) restent disponibles.

La préparation du moteur est annulable. Une erreur conserve les réglages et
propose une aide pour lancer le pont. Le mode ne change jamais implicitement.

En jeu, le plateau est centré, entouré des joueurs, des pendules et des commandes.
L’historique est fermé par défaut : « Coups » l’ouvre à côté sur grand écran,
ou en dessous sur téléphone. Les options regroupent retournement, évaluation,
profondeur et export PGN. Le moteur factice est réservé
aux tests ; les diagnostics UCI ne sont accessibles qu’en développement.

La pendule blanche démarre quand la partie devient jouable, après la connexion
UCI éventuelle. Si le moteur joue les blancs, il commence immédiatement et
son temps de réflexion est compté. Les erreurs et reconnexions suspendent le
décompte ; la reconnexion conserve position, pendules et camp humain.
Le temps est mesuré avec une horloge monotone, indépendant de la fréquence
d’affichage. Une promotion consomme du temps jusqu’au choix de la pièce.

« Abandonner » demande confirmation ; contre le moteur, l’humain abandonne,
et à deux joueurs, le camp au trait. L’abandon ferme la recherche, fige les
pendules et produit un résultat PGN. Quitter la partie via l’accueil ou
« Nouvelle partie » demande aussi confirmation et termine par abandon.
Ouvrir ces confirmations ne met pas le temps en pause.

Après la fin : « Analyser la partie », « Rejouer » avec les mêmes réglages,
ou « Nouvelle partie » pour les modifier. La préparation garde la partie
précédente accessible jusqu’au démarrage réussi de la suivante.

Aucune commande de reprise de coup (annuler/refaire) n’est accessible, contre
le moteur comme à deux joueurs. Les flèches, les touches `←` / `→` ou `<` / `>`
et les coups cliquables de l’historique permettent seulement de relire la partie.
La position réelle et le PGN restent intacts, le moteur et les pendules continuent.
Une position ancienne est en lecture seule : revenir à la partie pour jouer.
Les évaluations et la profondeur du direct sont masquées pendant cette relecture.
La navigation reste sur le coup choisi si le moteur joue entre-temps ; en direct,
elle suit automatiquement les nouveaux coups. Les mêmes raccourcis fonctionnent
dans l’analyse, sauf dans les dialogues et les champs de saisie.

À la fin de la partie, le résultat et les actions « Analyser la partie »,
« Rejouer » et « Nouvelle partie » apparaissent dans un encart sur le plateau.
On peut le masquer pour revoir la position ; le bouton « Résultat » le réaffiche.
Parcourir les coups masque aussi cet encart.

## Gestes sur le plateau

Pendant la partie comme en analyse, `←` / `→` et `<` / `>` parcourent les coups.
Ces raccourcis restent actifs quand le plateau ou un bouton a le focus ; ils
ne s’appliquent pas dans un formulaire ou un dialogue. Revoir une position ne
modifie pas la partie et ne suspend pas la pendule.

Contre le bot, sélectionner une pièce et sa destination pendant son tour prépare
un prémouvement. Un seul coup peut être en attente : une nouvelle sélection le
remplace. Il est joué après la réponse du moteur seulement s’il reste légal.
La promotion d’un prémouvement se fait en dame ; les autres promotions restent
accessibles en jouant normalement. Échap, un clic droit, le bouton « Annuler le
prémouvement » ou la navigation dans l’historique annulent le coup prévu.
Reconnexion, nouvelle partie, abandon et fin au temps l’effacent également.

Glisser avec le bouton droit dessine une flèche ; un clic droit sur une case
trace un cercle. Refaire le même dessin l’efface, et un clic gauche efface les
repères. Les dessins fonctionnent en partie, en relecture et en analyse. Ils
sont conservés pendant les mises à jour du moteur, puis effacés au changement
de position. Ils ne changent ni les coups ni le PGN.

## Cadences et options du moteur

« Éditer le camp » ouvre un échiquier de préparation : retirer plusieurs pièces,
les déplacer en deux clics, ou les remplacer depuis la palette. Le camp humain
est verrouillé. La configuration suit la couleur du moteur, y compris après
un tirage aléatoire. Annuler conserve la configuration précédente ; Réinitialiser
restaure l’armée classique. Un roi par camp, au plus 16 pièces et 8 pions côté
moteur, aucun pion en dernière rangée et aucun roi en échec au départ sont requis.
La position et les droits de roque sont conservés dans le jeu, le ponder, le PGN
et l’analyse. Les pièces retirées ne sont pas comptées comme des captures.

Dans la préparation d’une partie contre le bot, « Donner une cadence différente
au bot » permet de choisir son temps initial et son incrément indépendamment des
vôtres. Ces temps suivent les joueurs, même avec les Noirs ou un camp aléatoire.
Les parties à deux joueurs gardent une cadence commune. Les réglages sont
mémorisés pour la prochaine partie et pour « Rejouer ».

« Options du moteur » interroge le moteur connecté et propose les fonctions qu’il
annonce par UCI :

- « Réfléchir pendant mon tour » active `Ponder`, désactivé par défaut. Après
  son coup, le moteur peut préparer une réponse au coup qu’il anticipe. Si le
  joueur le choisit, `ponderhit` poursuit cette recherche ; sinon, `stop` et
  l’attente de son `bestmove` précèdent la recherche de la position réelle.
  Cette anticipation ne joue aucun coup et ne débite pas la pendule du moteur.
  Abandon, temps écoulé et nouvelle partie l’arrêtent également. L’évaluation
  anticipée n’est pas affichée sur la position réelle.
- « Cœurs de calcul » règle `Threads`, à 1 par défaut. La saisie est bornée par
  les capacités UCI et les cœurs logiques annoncés par le navigateur. Cette
  option sollicite davantage le processeur ; elle s’applique au moteur de jeu.

La connexion de début de partie vérifie de nouveau ces options avant de lancer
les pendules. Un réglage non pris en charge produit une erreur explicite.
Les cadences asymétriques sont exportées avec `TimeControl "?"` et les en-têtes
complémentaires `WhiteTimeControl` / `BlackTimeControl`, en secondes, afin de ne
pas annoncer à tort une cadence commune.

## Analyse et affichage

« Importer un PGN », depuis l’accueil ou la revue, accepte du texte collé ou un
fichier `.pgn`. Le PGN est validé avant de remplacer l’analyse : une seule partie
d’échecs classiques, au moins un coup, au plus 1 Mo et 2 000 demi-coups. La partie
peut être inachevée. Les en-têtes FEN/SetUp sont conservés, et les commentaires
et variantes sont acceptés ; seule la ligne principale est analysée. Les noms
des joueurs apparaissent dans la revue. Les imports restent en mémoire, pas en
stockage permanent. Une erreur conserve le texte saisi et la revue précédente.

« Analyser la partie » ouvre la revue et lance automatiquement la première
analyse à 0,5 seconde par position, avec une connexion moteur indépendante.
La navigation permet de revoir la partie même sans moteur disponible. Les
onglets « Analyse » et « Coups » regroupent les détails et l’historique.

Chaque position est envoyée avec son historique complet. Le meilleur coup et
la variante principale sont vérifiés avec chess.js ; cliquer sur un coup de
la variante change uniquement la copie affichée. Le retour à la position de
la partie est explicite. Aucune commande MultiPV n’est utilisée.

Les options proposent 0,25, 0,5, 1 ou 3 secondes par position. Modifier le budget
suggère « Relancer l’analyse » dans la fenêtre des options pour appliquer ce
réglage. Les préférences d’affichage s’appliquent immédiatement sans recalcul.
« Arrêter » ou quitter la revue interrompt
la recherche, en conservant les résultats partiels. Revenir ne relance rien
automatiquement ; les options permettent alors de relancer l’analyse complète.
Pendant le calcul, un indicateur animé, un compteur de positions et un texte
expliquent la progression : évaluations, puis vérification des annotations.
La navigation dans les coups reste disponible.

Les scores sont normalisés du point de vue blanc. La courbe est plafonnée
visuellement à ±5 pions ; les scores absents restent inconnus. Les différences
avant/après sont des estimations dépendantes du temps de recherche, pas des
jugements définitifs ni des probabilités. La perte numérique n’est pas calculée
pour les mats ou les bornes. Les positions terminales connues ne sont pas
recherchées. Pendant une variante, la barre attend le calcul de la position
explorée puis affiche son évaluation propre.

L’évaluation est masquée par défaut en jeu et visible en analyse. Les deux
préférences sont indépendantes. Une ancienne préférence commune est conservée
comme valeur initiale des deux vues. La profondeur pendant le jeu est optionnelle,
masquée par défaut, avec une préférence indépendante mémorisée. Elle reste visible
dans l’analyse. À deux joueurs, aucune fausse évaluation n’est affichée.

## Analyse interactive

Un seul écran réunit revue, exercices et variantes. Les flèches `←` / `→`,
`<` / `>` parcourent chaque coup. « Prochain moment clé » déroule la partie
jusqu’au prochain coup notable du camp humain contre le bot, des deux camps
à deux joueurs. Pour un PGN importé, les deux camps sont retenus par défaut ;
« Options d’analyse » permet de choisir son camp. Les coups adverses restent
accessibles individuellement et peuvent toujours être retentés.

Jouer directement sur le plateau ouvre une variante, sans changer de mode.
Les deux camps sont jouables ; les flèches remontent la variante et permettent
de créer d’autres branches. « Revenir à la partie » retrouve le coup sélectionné.
Les variantes restent accessibles depuis leur point de départ, en mémoire,
sans modifier le PGN original.

« Réessayer ce coup » revient avant le coup visible et masque solution et
évaluation jusqu’à la tentative. Il est mis en avant après une erreur du camp
choisi. Après la tentative, on peut continuer à jouer, retenter ou consulter
la solution. Les badges sont affichés sur le plateau et dans le panneau,
avec les mêmes règles que pour les coups de la partie.

L’évaluation utilise le moteur sélectionné et l’historique UCI complet,
répétitions comprises. Chaque nouvelle position est calculée à 1,5 seconde,
puis comparée à la position avant le coup. Les cas sensibles ou contradictoires
sont vérifiés à 3 secondes par position, notamment avant d’attribuer « Brillant ».
Les badges restent provisoires pendant ce calcul. Une incohérence persistante
reste signalée plutôt que de recevoir une classification arbitraire.
Les recherches abandonnées sont annulées ; leurs réponses tardives sont ignorées.
Les résultats sont conservés par branche et invalidés à la relance de l’analyse.

## Annotations de la revue

Les annotations sont visibles par défaut et désactivables dans « Options
d’analyse », indépendamment de la barre et de la courbe. Ce choix est mémorisé.
Le badge sur le plateau, l’historique et le panneau « Coup joué » qualifient
tous le coup qui a conduit à la position sélectionnée. Les scores avant/après,
la profondeur et la meilleure suite se rapportent à ce même coup. La variante
recommandée part de la position avant ce coup ; la barre et la courbe montrent
la position après ce coup. À la position initiale, seul le score courant est
affiché. Les variantes ne portent pas le badge de la partie.
Les annotations ne sont pas exportées dans le PGN.

Les onze repères sont : `!!` brillant, `!` coup décisif, `★` meilleur coup,
pouce blanc vectoriel pour excellent, `✓` bon coup, `?!` imprécision, `?` erreur,
`??` gaffe, `X` occasion manquée, flèche pour coup forcé et livre pour coup
théorique. Les pictogrammes SVG sont dessinés dans l’interface, sans reprendre
les fichiers de Chess.com.

Le badge du plateau mesure 44 % d’une case (minimum 20 px, maximum 28 px).
Son centre est ancré à 5 % ou 95 % de chaque axe de la case. Les quatre coins
possibles ont donc exactement les mêmes décalages ; le coin est choisi selon
les bords du plateau et les pièces voisines, avec préférence aux coins supérieurs.
Les coordonnées portent sur la surface jouable, sans inclure le cadre.

La classification s’inspire des [catégories publiques de Chess.com](https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc).
Elle ne reproduit pas leur modèle propriétaire d’Expected Points. Notre indice
heuristique vaut `1 / (1 + exp(-cp / 400))`, avec les centipions du point de vue
du joueur. La constante 400 est un choix de cette interface, sans calibration
statistique ni ajustement selon l’Elo. Cet indice n’est pas une probabilité.

La perte est `max(0, indice avant - indice après)` : excellent sous 0,02 ;
bon de 0,02 à moins de 0,05 ; imprécision `?!` de 0,05 à moins de 0,10 ;
erreur `?` de 0,10 à moins de 0,20 ; gaffe `??` à partir de 0,20.
« Meilleur coup » exige le premier choix du moteur et une perte sous 0,02.
Chess.com décrit [trois principes pour `!`](https://www.chess.com/article/view/how-to-play-a-brilliant-move) : trouver le seul bon coup,
exploiter une erreur pour passer de l’égalité à une position gagnante, ou
exploiter une erreur pour sauver une position perdante. Notre approximation
couvre les deux changements de résultat ; le seul premier choix UCI ne permet
pas d’affirmer qu’il était l’unique bon coup parmi toutes les alternatives.

« Coup décisif » `!` peut récompenser une occasion gagnante saisie : le coup
adverse précédent fait passer notre indice de moins de 0,80 à au moins 0,80,
avec un gain d’au moins 0,10 ; notre coup est le premier choix du moteur,
conserve un indice d’au moins 0,80 et perd moins de 0,02. Il peut aussi
récompenser un sauvetage : indice au plus 0,20 avant l’erreur adverse, au moins
0,45 après cette erreur et après notre réponse, gain d’au moins 0,10, premier
choix du moteur et perte sous 0,02. Ces deux cas exigent une seconde passe sur
les deux positions. Nous ne testons pas encore le cas de l’unique bon coup.
Un mat forcé vaut 1 pour le gagnant et 0 pour le perdant, indépendamment de sa
distance. Les scores inconnus ou bornés ne produisent pas de jugement moteur
(les faits « forcé » et « théorique » restent disponibles).
Une amélioration supérieure à 0,10 entre deux recherches, ou une perte d’au
moins 0,02 pour le premier choix du moteur, signale une incohérence : le coup
reste non classé, même après confirmation.
Le panneau explique le motif : calcul encore en attente, analyse interrompue,
score absent ou borné, ou incohérence entre les recherches avant/après le coup.
Si le moteur termine sur une borne après avoir déjà fourni un score exact pour
le même meilleur coup pendant cette recherche, la dernière itération exacte
est conservée avec sa profondeur réelle. Un score exact pour un autre coup
ou une autre recherche n’est jamais réutilisé.
Après la vérification habituelle, les coups encore non classés déclenchent deux
passes supplémentaires ciblées sur leurs positions avant et après : budgets
`min(12000, max(3000, 4 × budget))`, puis `min(12000, max(6000, 8 × budget))` ms.
Chaque position n’est recherchée qu’une fois par passe ; la liste est recalculée
entre les passes pour arrêter dès que possible. Les positions terminales sont
exclues. L’arrêt conserve les résultats acquis, et la progression indique cet
approfondissement. Plus de temps peut lever une incohérence mais ne garantit
pas une classification : le nombre de coups restants est indiqué à la fin.

« Occasion manquée » exige que le coup adverse précédent fasse passer notre
indice de moins de 0,80 à au moins 0,80, avec un gain d’au moins 0,10, puis que
notre coup le ramène à 0,55 ou moins. « Brillant » `!!` exige un indice initial
entre 0,50 inclus et 0,80 exclu, final au moins 0,50, une perte sous 0,02 et un
sacrifice de pièce confirmé : la meilleure défense dans la variante du moteur
capture la pièce déplacée, laissant au moins deux pions de matériel en moins
par rapport à avant le coup, encore après notre réponse immédiate. Les pions,
promotions, sacrifices refusés et sacrifices d’une autre pièce ne sont pas
détectés. Ce critère prudent est une approximation, pas un jugement esthétique.

Une seconde passe vérifie les variations d’indice d’au moins 0,10, les premiers
choix incohérents, les mats, les coups décisifs et les sacrifices candidats. Elle revoit les deux
positions et la précédente (pour les occasions manquées), une seule fois par
position, à `min(6000, max(1000, 2 × budget))` millisecondes. Les positions
terminales ne sont pas recherchées. « Brillant » et « Coup décisif » nécessitent la confirmation des
deux positions concernées. La progression indique cette phase ; elle est
interrompable. Les annotations restent marquées provisoires si l’analyse est
en cours, interrompue ou en erreur. Une profondeur plus élevée peut les changer.

### Coups forcés et bibliothèque d’ouvertures

« Forcé » exige exactement un coup légal, calculé par chess.js, y compris les
choix distincts de promotion. Un seul bon coup parmi plusieurs coups légaux
n’est pas un coup forcé. Le badge ne demande aucune évaluation du moteur.

« Théorique » utilise un instantané du [catalogue Lichess](https://github.com/lichess-org/chess-openings)
sous CC0, conservé dans `data/openings/` avec licence et révision dans
`source.json`. L’index généré contient 3 810 lignes, 5 478 positions et 8 058
coups distincts, limités aux 40 premiers demi-coups. Ce sont des lignes nommées,
pas une garantie de force ni un catalogue exhaustif de la théorie. L’index
compare la position et le coup exact, conserve roques et prise en passant,
ignore les compteurs et reconnaît ainsi les transpositions. La détection
s’arrête après le 20e coup de la partie.

Régénérer sans réseau : `node dev/build-opening-book.mjs`. La bibliothèque est
chargée avec la revue, pas à l’ouverture de la page de jeu. Aucune partie n’est
envoyée à un service tiers. « Forcé » a priorité sur les jugements ; « théorique »
remplace les catégories best/excellent/good (ou l’absence de score), mais ne
masque ni imprécision, ni erreur, ni annotation spéciale. Ces deux faits ne
portent pas la mention « provisoire ».

## Limites

Les parties et analyses restent en mémoire ; les préférences seules sont
persistées. Exporter PGN permet de conserver les coups, la cadence, les joueurs
et le résultat. La notation PGN reste anglaise, l’historique affiché français.
Une protection native du navigateur prévient avant de recharger une partie
active. La sauvegarde automatique et les niveaux de difficulté restent à développer.

Au temps, la partie s’arrête et le camp concerné est indiqué. Le résultat PGN
reste `*`, avec `Termination "time forfeit"` et commentaire : les exceptions
liées au matériel restant ne sont pas encore arbitrées. Le moteur n’est pas
modifié par cette interface.

## Vérifications

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run build
CHESS_ENGINE_BINARY=../target/release/shallowred npm test
CHESS_ENGINE_BINARY=../target/release/shallowred CHESS_STOCKFISH_BINARY=/usr/games/stockfish npm test
```

Les tests couvrent règles, promotions, pendules, scores, transport UCI,
annuler/refaire, choix du camp, abonnement/désabonnement, abandon, connexion
tardive, reconnexion, export et analyse. Les tests de pont ouvrent des ports
locaux. Les tests avec le vrai moteur sont ignorés sans `CHESS_ENGINE_BINARY`.

Avec `npm run dev -- --engines dev/engines.example.json` lancé depuis `ui/`,
un moteur `stockfish` est configuré
sur cette installation ; le parcours Chromium se vérifie ainsi :

```sh
CHESS_BROWSER_BINARY=/chemin/vers/chromium node dev/browser-check.mjs
```

`dev/browser-check.mjs` utilise un profil temporaire et ferme son navigateur
à la fin. Il vérifie préparation, partie à deux, moteur blanc/humain noir,
abandon, protection de navigation, analyse automatique, variantes, préférences
indépendantes, import PGN par texte/fichier/FEN, sélection et ajout de moteurs, exercices, branches alternatives, sous-promotion et parcours mobile. Captures dans `/tmp/chess-ui-visual-check`
ou `CHESS_SCREENSHOTS`. Il utilise `ws` et le protocole de débogage Chromium,
sans dépendance supplémentaire, et nécessite l’accès aux ports locaux.

La galerie de contrôle `/dev/annotations.html` utilise les vrais composants
avec des annotations simulées. Pour ne vérifier que les pictogrammes et leurs
ancrages : `CHESS_ANNOTATIONS_ONLY=1 CHESS_BROWSER_BINARY=/chemin/vers/chromium node dev/browser-check.mjs`.

Le workflow dédié [UI](../.github/workflows/ui.yml) exécute lint, TypeScript,
tests unitaires et build, puis les tests du pont avec ShallowRed compilé depuis
le dépôt et Stockfish. Il utilise Node.js 22 et `npm ci`. Il se déclenche sur
les PR et les push sur `main` qui modifient `ui/**` ou le workflow lui-même,
et peut aussi être lancé manuellement. Le parcours Chromium reste une
vérification locale. La CI du moteur reste indépendante.

## Dépendances et licence

Chessground est publié sous `@lichess-org/chessground` (GPL-3.0-or-later),
chess.js sous BSD-2-Clause. Les pièces sont incluses localement. L’ensemble
du code du dépôt est sous AGPL-3.0-or-later. Les données d’ouvertures Lichess
conservent leur licence CC0-1.0, incluse dans `data/openings/COPYING.txt`.

## Scores et prises

La barre d’évaluation affiche le score en pions (`+1,25` favorise les Blancs,
`−1,25` les Noirs), ou `M3` pour un mat annoncé en trois coups. Le chiffre se
place du côté du camp favorisé et suit le retournement du plateau. `Mat`
signale le mat atteint ; `?` une évaluation indisponible. Les bornes restent
indiquées, avec le détail dans l’infobulle. L’affichage reste optionnel.

Les pièces capturées sont regroupées par type, auprès du joueur qui les a prises.
Le `+N` indique uniquement son excédent de points capturés sur l’adversaire :
pion 1, cavalier/fou 3, tour 5, dame 9. Aucun chiffre en cas d’égalité.
Ce bilan est indépendant de l’évaluation moteur et suit la position affichée,
ainsi que les variantes et retentatives. Il inclut la prise en passant ; une
promotion seule n’est pas une capture. Pour un PGN depuis une FEN, les captures
antérieures à la position initiale sont inconnues et ne sont pas inventées.

La ligne des captures conserve sa hauteur avant la première prise, afin de garder le plateau et les commandes à la même place.
