<!-- socle: couche=demandes zone=publique -->
# D-0010 — Approuver les fichiers protégés que la mise à jour du socle a changés

> date : 2026-11-12

## Décision demandée

Approuver les 26 fichiers protégés que la mise à jour du socle, lancée le
12 nov. 2026 par le prompt que tu as donné, a changés dans le dépôt.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs écrit en Rust, avec son
interface. Un agent de code y travaille par sessions, encadré par le
socle : un outil à toi, développé dans son propre dépôt, qui tient la
mémoire du projet dans le dépôt, la vérifie par des contrôles, et pose
des hooks, des commandes lancées toutes seules à des moments fixes.

**Le chantier.** L'adoption du socle par ce projet, que tu as décidé le
12 nov. 2026 de finir avant tout travail sur le moteur d'échecs. Sont
faits : l'installation, le 11 nov. ; la feuille de route posée dans la
mémoire ; deux contrôles qui ne faisaient qu'avertir et qui refusent
maintenant ; un essai de conversion du carnet de bord, l'ancienne mémoire
du projet. Restent : poser ce carnet dans la mémoire ; réduire à ses
règles le fichier d'instructions de l'agent ; retirer deux hooks d'avant
le socle qui font double emploi avec les siens, retrait que tu as validé
le 12 nov. ; et la mise à jour que voici.

**La question.** Une autre session d'agent, que tu conduis, développe le
socle. Elle a corrigé ce que le compte rendu d'installation d'ici lui
avait signalé, publié une version, et écrit un prompt de mise à jour que
tu as donné ici le 12 nov. L'agent l'a suivi : l'installeur, le programme
qui pose le socle dans un projet, a remplacé le code du socle, son
« moteur », à ne pas confondre avec le moteur d'échecs. Ces fichiers sont
protégés : l'agent ne les écrit jamais lui-même, et un contrôle refuse
tout changement d'un fichier protégé tant qu'une demande validée ne le
cite pas avec son empreinte, un condensé de son contenu. Cette demande
est celle-là.

Ce que la mise à jour change, d'après le prompt ; l'agent ne l'a pas relu
ligne à ligne dans le code :

- le mode adoption, la tolérance accordée à un projet qui installe le
  socle sur du code existant, ne met plus un contrôle entier en simple
  avertissement : il ne tolère que des défauts inscrits un par un. Sans
  effet ici : les deux contrôles concernés refusent déjà, et aucun défaut
  n'est inscrit ;
- le skill de reprise, la procédure par laquelle l'agent se programme un
  réveil pour repartir seul après une limite d'usage du compte,
  s'applique enfin dans cette session. Avant, l'agent coupé attendait ton
  message suivant : cinq heures perdues le 12 nov. Il a servi une fois
  depuis, dans la nuit du 12 au 13 ;
- en fin de tour, les vérifications rapides, format, lint et tests, près
  de trois minutes, se lancent aussi quand seuls des fichiers de tests
  ont changé ;
- deux corrections du hook qui surveille les commandes de l'agent.

Ce que l'agent a mesuré le 12 nov. :

- 26 fichiers protégés changent, 897 lignes ajoutées et 221 retirées : 24
  fichiers du moteur du socle, son verrou, le fichier qui porte
  l'empreinte de l'ensemble, et le skill de reprise. Cinq sont des
  adaptateurs d'autres langages, que le socle embarque ; ce projet ne les
  lit pas, il a le sien, inchangé ;
- le moteur du socle installé est identique, fichier par fichier, à celui
  du dépôt public du socle à son dernier commit ;
- rien d'autre ne change : ni la politique d'autonomie, ni l'adaptateur
  du projet, ni les seuils, ni le fichier des hooks, ni le fichier
  d'instructions, ni la CI ;
- l'installeur n'a inscrit aucun défaut toléré : les quatre trouvés à
  l'installation, deux chemins morts dans la documentation et deux
  assertions de test qui comparaient une valeur à elle-même, sont
  corrigés et fusionnés depuis le 12 nov. Lancé à blanc sur l'état
  d'avant, il inscrivait ces quatre-là, pas un de plus, comme le prompt
  l'attendait ;
- les contrôles du socle à jour passent tous, sauf celui des fichiers
  protégés, qui attend ta réponse.

La suite, et qui fait quoi. Cette demande est poussée seule. Puis les 26
fichiers sont commités et poussés sur la branche de travail, et une pull
request est ouverte : tu peux les y lire avant de répondre. La CI du
socle les y refuse tant que tu n'as pas répondu ; l'installeur prévoit ce
chemin. Après ta validation, l'agent consigne ta réponse et passe la
« porte » que le prompt fixe, trois vérifications qui doivent passer :
celle du socle en mode rapide, les contrôles du socle tels que la CI les
lance, et la vérification rapide du projet, avec leurs durées. Puis il
fusionne à CI verte, comme tu l'as confirmé le 12 nov. pour ses pull
requests ; le prompt, lui, parle de te demander de fusionner : dis-le si
tu veux fusionner celle-ci toi-même. Si la porte ou la CI échoue, rien
n'est fusionné, et l'agent te dit pourquoi.

## Éléments cités

- J-2026-11-12-M@8695e645 — l'entrée du journal qui porte, mot pour mot, le prompt de mise à jour que tu as donné
- J-2026-11-12-O@0e94367f — l'entrée du journal qui rend l'essai à blanc de l'installeur, avec la liste qu'il inscrivait
- B-0031@651f7bb7 — le jalon du backlog qui dit ce que « adoption finie » veut dire
- d3f516d — le dernier commit du dépôt public du socle, daté du 12 nov. 2026, d'où vient le moteur installé
- .claude/skills/socle-resume/SKILL.md sha256:3927ef9e4ff8e19f
- .socle/engine.lock sha256:4a3206062c98fadc
- .socle/engine/socle/HELP.en.md sha256:9b0648029b0db9c4
- .socle/engine/socle/HELP.md sha256:a2a2148d4ace9555
- .socle/engine/socle/adapters/README.md sha256:01a3f34509029152
- .socle/engine/socle/adapters/csharp.toml sha256:040883c6df86141c
- .socle/engine/socle/adapters/java.toml sha256:ee5c55e4a8dddb7f
- .socle/engine/socle/adapters/javascript.toml sha256:e57e7e10fb61a4ce
- .socle/engine/socle/adapters/kotlin.toml sha256:6c2dc4be8df202e5
- .socle/engine/socle/adapters/php.toml sha256:60b234a089dde423
- .socle/engine/socle/checks_docs.py sha256:8cdb5d9d43433479
- .socle/engine/socle/checks_memory.py sha256:bb47a66089f82d08
- .socle/engine/socle/checks_ratchet.py sha256:760af33416f41e38
- .socle/engine/socle/checks_tests.py sha256:9dede7aeadafb95b
- .socle/engine/socle/config.py sha256:f45840f2baaa9395
- .socle/engine/socle/context.py sha256:cfd3cadad87fe48b
- .socle/engine/socle/hooks.py sha256:f3e64ee8fcbb751d
- .socle/engine/socle/installer.py sha256:2fddfd686491fbbe
- .socle/engine/socle/messages.py sha256:5ec872e1216d31ee
- .socle/engine/socle/messages_en.py sha256:64f3b43b89c927ac
- .socle/engine/socle/report.py sha256:f00be6a0c8d1e478
- .socle/engine/socle/selftest.py sha256:38de7a09a4e26ca5
- .socle/engine/socle/state.py sha256:309be113006d8a0c
- .socle/engine/socle/templates/skills/socle-resume/SKILL.en.md sha256:e4eaaf27edff76ad
- .socle/engine/socle/templates/skills/socle-resume/SKILL.md sha256:3927ef9e4ff8e19f
- .socle/engine/socle/verification.py sha256:6fb7ecb3b6ee9728

## Où regarder

- Le prompt de mise à jour, avec le compte rendu qu'il demande pour la session du socle, et l'essai à blanc : [memory/journal/2026-11.md](https://github.com/theodubus/chess/blob/8fbdd088f326270583ef5da202cd163643a97937/memory/journal/2026-11.md), entrées J-2026-11-12-M et J-2026-11-12-O. Ce que tu peux y vérifier : le prompt est bien celui que tu as donné, et la liste de l'essai à blanc celle que la session du socle attendait.
- Les 26 fichiers, une fois poussés, juste après cette demande : [la branche de travail comparée à la branche par défaut](https://github.com/theodubus/chess/compare/main...claude/feuille-de-route-et-carnet). Ce que tu peux y vérifier : rien d'autre que le socle et la mémoire n'y change.
- D'où ils viennent : [le dépôt public du socle, à son commit d3f516d](https://github.com/theodubus/socle/tree/d3f516dba31432b69f7b66e8436ed941491ca318). Ce que tu peux y vérifier : c'est bien la version que la session du socle a publiée pour cette mise à jour.

## Options

- **Approuver** (recommandée). Effort pour toi : ta réponse dans la
  conversation. Risque faible : le code est celui que la session du socle
  a publié, au fichier près ; personne ici ne l'a relu, c'est elle qui en
  répond ; et la CI lance les contrôles du socle et son auto-test, ses
  propres tests, avant toute fusion. Réversible : le moteur du socle
  d'avant se remet par l'installeur, avec une demande comme celle-ci.
- **Refuser**. L'agent remet les 26 fichiers à leur état d'avant, par un
  commit sur la branche. Le socle reste à sa version du 11 nov. : après
  une limite d'usage, l'agent ne repart qu'à ton message suivant ; le
  retrait des hooks en double reste faisable, avec une étape de plus.
  Réversible : relancer l'installeur prend quelques minutes.

## Conséquences

Si tu valides : la porte, puis la fusion à CI verte, puis le compte rendu
pour la session du socle ; le retrait des hooks en double vient ensuite,
sur le socle à jour. Si tu refuses : les fichiers reviennent à leur état
d'avant, et l'agent te dit ce que la session du socle devrait savoir.
Sans réponse : la pull request reste ouverte, rouge sur ce seul
contrôle, et rien ne se fusionne ; l'agent avance sur la même branche ce
qui n'en dépend pas, le carnet à poser dans la mémoire.

## Recommandation

Valider. Vérifié le 12 nov. 2026 : le compte des fichiers et leurs
empreintes, rendus par le contrôle lui-même ; l'identité du moteur du
socle installé avec son dépôt public ; que rien d'autre ne change ; que
les autres contrôles passent ; l'essai à blanc. Supposé, sur la foi du
prompt : ce que chaque changement du code du socle fait. Pas encore
mesuré : la porte, qui ne peut passer qu'après ta réponse, puisque le
contrôle des fichiers protégés échoue d'ici là.

## Réponses possibles

- `valider` — approuver les 26 fichiers : l'agent consigne ta réponse, passe la porte et fusionne à CI verte.
- `refuser` — l'agent remet les fichiers à leur état d'avant ; le socle reste à sa version du 11 nov.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
