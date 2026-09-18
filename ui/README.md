# ShallowRed UI

Application locale d’échecs avec React, TypeScript, Vite, Chessground et chess.js.
L’interface pilote le moteur exclusivement par l’adaptateur `Engine` et UCI.

## Démarrer

Depuis `ui/`, dans un terminal :

```sh
npm install
npm run dev -- --host 127.0.0.1
```

Pour jouer contre le moteur ou analyser une partie, dans un second terminal :

```sh
npm run engine:bridge -- ../target/release/shallowred
```

Ouvrir `http://127.0.0.1:5173`. Le bouton « Jouer » connecte automatiquement
le moteur choisi ; aucun panneau de connexion n’est à activer pendant la partie.
Le navigateur ne lance pas lui-même le pont. Le chemin du binaire peut être
remplacé par celui d’un autre moteur UCI, ou défini avec `CHESS_ENGINE`.

Le pont écoute sur `127.0.0.1:8787` et accepte les origines Vite
`http://localhost:5173` et `http://127.0.0.1:5173`. Il lance un processus par
connexion, envoie `quit` à la fermeture et force l’arrêt si nécessaire.
Il reste réservé au développement, hors du build Vite. Le transport de
production n’est pas choisi par cette interface.

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

Enregistrer ce tableau dans `moteurs.json`, puis démarrer le pont :

```sh
npm run engine:bridge -- ../target/release/shallowred --engines moteurs.json
```

Le fichier peut contenir plusieurs moteurs avec des identifiants uniques et
un tableau `args` facultatif. Un chemin relatif contenant `/` est résolu par
rapport au fichier JSON ; un simple nom de commande est cherché dans le PATH.
`dev/engines.example.json` fournit l’exemple ci-dessus. Le pont expose seulement
les noms et identifiants pour les connexions UCI. L’ajout explicite transmet
un chemin absolu au formulaire de validation. Les requêtes d’ajout sont réservées
aux origines locales autorisées, en JSON, et le programme est lancé sans shell.
Après modification du fichier, relancer le pont puis « Actualiser les moteurs »
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
recherchées. Pendant une variante, la barre est indisponible : cette position
intermédiaire n’a pas été analysée séparément.

L’évaluation est masquée par défaut en jeu et visible en analyse. Les deux
préférences sont indépendantes. Une ancienne préférence commune est conservée
comme valeur initiale des deux vues. La profondeur pendant le jeu est optionnelle,
masquée par défaut, avec une préférence indépendante mémorisée. Elle reste visible
dans l’analyse. À deux joueurs, aucune fausse évaluation n’est affichée.

## Revue guidée et exploration

« Revue guidée & exploration » propose les mêmes flèches `←` / `→`, `<` / `>`
pour parcourir chaque coup. « Prochain moment clé » déroule les coups jusqu’à
une imprécision, erreur, gaffe, occasion manquée, coup décisif, brillant ou mat.
Le défilement peut être arrêté et le moment précédent reste accessible. Les
moments dépendent des annotations déjà calculées ; ils sont provisoires tant
que l’analyse continue.

« Réessayer ce coup » est disponible sur tous les coups, y compris adverses,
et revient à la position avant le coup sélectionné (au départ, avant le premier
coup). La solution et l’évaluation sont masquées jusqu’à la tentative. Le choix
exact du moteur est reconnu ; une autre décision est aussi acceptée lorsque
les évaluations comparables indiquent une perte d’indice inférieure à 0,02.
Une contradiction ou un score absent ne fait pas passer une tentative pour
fausse. On peut retenter, consulter la solution ou continuer en exploration.
Le camp humain est prérempli après une partie contre le moteur ; l’import et
les parties locales permettent de choisir Blancs, Noirs ou les deux camps.
L’invitation à retenter est renforcée après un mauvais coup du camp choisi.

« Explorer cette position » crée un arbre distinct de la partie : jouer les
deux camps, revenir en arrière, choisir une sous-promotion et créer des
branches alternatives. Les suites restent disponibles depuis leur point de
bifurcation, même après un passage dans l’analyse détaillée. Elles restent
locales à la revue en mémoire, sans modifier ni enrichir le PGN original.

L’évaluation de la variante utilise une session UCI séparée du même moteur,
avec l’historique complet (répétitions comprises), un délai de saisie de 180 ms
et un budget de 1,5 seconde. Elle se met à jour pendant la recherche. Un
changement de position annule l’ancienne recherche ; ses réponses tardives
sont ignorées, et son score n’est jamais présenté comme celui de la nouvelle
position. Mat et nulles sont reconnus sans recherche. La préférence d’affichage
de l’évaluation continue de s’appliquer.

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

Avec Vite et le pont déjà lancés avec un moteur `stockfish` configuré
(`--engines dev/engines.example.json` sur cette installation), le parcours Chromium se vérifie ainsi :

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

Les vérifications sont locales. Le workflow UI est prévu dans une PR dédiée,
séparément de la CI du moteur, conformément aux consignes du dépôt.

## Dépendances et licence

Chessground est publié sous `@lichess-org/chessground` (GPL-3.0-or-later),
chess.js sous BSD-2-Clause. Les pièces sont incluses localement. L’ensemble
du code du dépôt est sous AGPL-3.0-or-later. Les données d’ouvertures Lichess
conservent leur licence CC0-1.0, incluse dans `data/openings/COPYING.txt`.
