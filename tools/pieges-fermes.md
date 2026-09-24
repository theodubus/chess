# Pièges fermés par un code de sortie

Ces pièges ont chacun coûté une mesure, une journée, ou les deux. Ils ne sont
plus dans `CLAUDE.md` — non parce qu'ils seraient réglés, mais parce qu'**un
dispositif les rend désormais inexprimables**. Une règle qu'un code de sortie
impose n'a pas besoin d'être relue à chaque session ; elle a besoin d'être
trouvable le jour où le dispositif se déclenche et qu'on se demande pourquoi.

**Critère d'entrée ici : un code de sortie, pas une bonne résolution.** Un
piège que seul le jugement protège reste dans `CLAUDE.md`, et c'est là que
vivent les plus chers — la cadence qui possède le verdict, le dénominateur, la
ressource totale confondue avec l'allocation par unité.

**Chaque piège est déplacé ENTIER**, jamais coupé en deux : une règle d'un côté
et sa preuve de l'autre, ce sont deux copies qui dérivent, et ce dépôt a déjà
payé cette faute-là. La seule ligne ajoutée à chacun est celle qui nomme son
dispositif.

**Si l'un de ces dispositifs disparaît, son piège revient dans `CLAUDE.md`.**
C'est la seule condition de sortie de ce fichier.

- **Un bench à profondeur 7 est trop court pour comparer des temps.** Le
  nombre de nœuds y est déterministe et comparable, le temps ne l'est pas :
  le 14 sept. 2026, une même version a mesuré 184 ms puis 200 ms en
  best-of-7, et un balayage de tailles de cache a rendu des chiffres non
  monotones purement dus au bruit. **Pour comparer des temps, mesurer à
  profondeur 10** (~1,6 s par run), où le bruit devient marginal — et
  seulement à nombre de nœuds identique, sans quoi on compare deux arbres.
  <br>**Tenu par** : `tools/timing.sh`, qui mesure à la profondeur 10 et refuse de conclure sous vingt paires.

- **Un tuner est aussi un fuzzer.** L'ajustement Texel a poussé
  `KING_DANGER_SCALE` à zéro et fait paniquer l'évaluation sur une division
  entière par zéro — le moteur aurait planté en pleine partie. **Les valeurs
  d'évaluation sont des données, pas du code** : une donnée fausse se borne,
  elle n'arrête pas la partie. Un test vérifie qu'aucun jeu de paramètres ne
  fait paniquer l'évaluation, jeu entièrement nul compris.
  <br>**Tenu par** : `engine/src/eval.rs`, test `aucun_jeu_de_parametres_ne_fait_paniquer_levaluation` — aucun jeu de paramètres ne fait paniquer l'évaluation, jeu entièrement nul compris.

- **Le SPRT tire ses ouvertures au hasard : sans `-srand`, rien n'est
  rejouable.** `tools/sprt.sh` fixe désormais la graine et l'affiche.
  <br>**Tenu par** : `tools/sprt.sh`, qui fixe la graine et l'affiche.

- **Le code retiré se garde dans `tools/attic/`, jamais par un SHA de commit.**
  La pratique était de désigner le commit — « le code retiré reste lisible dans
  `15028fa` ». **Elle a cassé le 16 sept. 2026** : la PR #11 fusionnée en
  `squash` a remplacé les commits de la branche par un commit neuf, GitHub a
  supprimé la branche, et la première exécution de `match.yml` a échoué sur
  `fatal: invalid reference: 498a01a`. Une rustine versionnée ne peut pas subir
  ça — elle survit aux squashs, aux suppressions de branche et aux politiques
  de collecte. Voir `tools/attic/README.md` : quand y déposer une rustine, et
  pourquoi celle de PVS ne s'applique plus.
  <br>**Fusionner en `merge` et non en `squash`** reste préférable, pour garder
  l'historique lisible — les PR #1 à #5 l'avaient fait. Mais ce n'est plus ce
  qui protège le code retiré, et c'était une mauvaise fondation : *la
  survie d'un artefact ne doit pas dépendre d'une politique de dépôt.*
  <br><span>Deux constats vérifiés au passage, qui nuancent la panique
  d'origine : GitHub conserve `refs/pull/N/head` de façon permanente, donc
  `498a01a` restait atteignable par ce chemin — **mais uniquement parce que sa
  branche avait eu une PR, et cette portée manquait.** Vérifié le 23 sept.
  2026 : **aucune branche `mesure/*` n'en a jamais eu**, sur les trente-huit PR
  du dépôt, donc ce filet ne les couvrait pas, et `git fetch origin adcbd14`
  rend `INATTEIGNABLE` — leurs commits sont collectés pour de bon. *Un filet de
  sécurité vérifié sur un cas ne se généralise pas sans sa condition
  d'application.* Ce que la suppression a coûté, branche par branche, est
  inventorié dans `tools/attic/README.md` : aucun code de production, une sonde
  perdue, un handle de vérification manquant ; et **le push d'étiquettes est
  refusé sur ce dépôt** (403 avec le jeton de session), ce qui interdisait
  la solution évidente. **Troisième limite du même jeton, vérifiée le
  22 sept. 2026 : il ne peut pas non plus SUPPRIMER une référence distante** —
  `git push origin --delete <branche>` échoue sur `the remote end hung up
  unexpectedly`, sans message utile. Le ménage des branches `mesure/*` revient
  donc à Théo, et *ne jamais écrire dans la documentation une suppression
  qu'on n'a pas vérifiée* : je l'ai fait le jour même, et la phrase était
  fausse quand elle a été committée.</span>
  <br>**Tenu par** : `engine/tests/rustines_attic.rs`, critère d'acceptation, dans les deux sens.

- **Ne jamais construire une référence à la main.** Le geste tient en quatre
  lignes et ce dépôt y a payé **quatre** pièges distincts : `git stash`, qui
  emporte tout le travail non committé et fait mesurer autre chose que ce qu'on
  croit ; `cp -p`, qui préserve les dates et fait mesurer deux fois le même
  binaire ; une référence git périmée, qui rend un arbre trois fois trop gros ;
  et `git fetch <remote> <branche>`, qui n'élague pas. `tools/ref.sh
  <commit|branche|tag>` les ferme tous les quatre et **refuse** de construire
  quand la résolution locale d'une branche diffère de `git ls-remote`. Même
  geste que `timing.sh` : imposer par un code de sortie ce qu'une règle écrite
  ne fait que rappeler.
  <br>**Tenu par** : `tools/ref.sh`, éprouvé par `tools/ref-test.sh` dans `tools/verify.sh`.

- **Vérifier que le binaire a bien été reconstruit.** `mv` et `cp -p`
  préservent les dates de modification, donc cargo peut juger les sources
  périmées et ne rien recompiler : on mesure alors l'ancien binaire. Un
  rapport avant/après d'exactement 1,00 en est le symptôme.
  <br>**Tenu par** : le contrôle d'empreinte de `tools/sprt.sh` et `tools/timing.sh`, qui refusent deux binaires identiques.

- **Ce n'est pas toujours le binaire qui est périmé : ce peut être la
  RÉFÉRENCE GIT — et elle ment de DEUX façons.** Le 22 sept. 2026, les deux
  se sont produites dans la même session, sous deux déguisements différents.
  <br>**Forme 1, elle fausse une mesure.** Un candidat de retrait construit
  sur `main` a rendu un arbre trois fois trop gros. Binaire neuf, code juste,
  édition correcte — mais `origin/main` était figé **onze commits en arrière**
  dans le clone local, alors que le distant portait bien la tête annoncée.
  Symptôme identique au binaire périmé : un chiffre plausible qui répond à
  une autre question. **Ce qui l'a attrapé n'est pas la vigilance, c'est
  d'avoir écrit la valeur attendue AVANT de mesurer.**
  <br>**Forme 2, elle déclenche une fausse alarme.** Après chaque fusion,
  GitHub supprime la branche distante — mais **`git fetch <remote> <branche>`
  n'élague pas**, donc `refs/remotes/origin/<ma-branche>` survit en pointant
  le commit d'avant la fusion. Tout ce qui compare la branche locale à son
  suivi croit alors voir un commit non poussé, alors que le commit en question
  est le commit de fusion, déjà sur `main`. C'est arrivé deux fois de suite,
  et j'ai d'abord accusé l'outil qui signalait plutôt que ma procédure.
  <br>**Le geste, vérifié par exécution et non déduit** : `git fetch --prune`,
  jamais `git fetch <remote> <branche>` seul, et confronter à
  `git ls-remote`. Le contrôle qui tranche une alarme de ce type est
  `git log origin/main..HEAD` — vide veut dire que `main` porte déjà tout, donc
  que rien n'est en risque.
  <br>**Tenu par** : `tools/ref.sh` pour la forme 1, et `tools/etat.sh` pour la forme 2 — il imprime `git log origin/main..HEAD` à chaque reprise.

- **Un chiffre de référence écrit en prose vieillit en silence.** La section
  *Commandes* a annoncé `702 612 nœuds` pendant deux journées de travail alors
  que la valeur réelle était `541 528` : la mobilité et trois termes
  d'évaluation avaient changé l'arbre de recherche sans que personne ne mette
  le chiffre à jour, et **rien ne l'a signalé**. Un chiffre de référence faux
  est pire qu'absent — il sert de point de comparaison à la session suivante,
  qui croit mesurer une régression là où elle découvre une dérive de la
  documentation. `engine/tests/bench_reference.rs` confronte désormais les
  deux, en critère d'acceptation. **Conséquence assumée** : tout changement de
  l'arbre de recherche rend la CI rouge tant que la ligne n'est pas corrigée.
  C'est l'effet recherché ; le message d'échec donne le chiffre à recopier.
  <br>**Tenu par** : `engine/tests/bench_reference.rs`, qui balaie tout le dépôt.

- **Un critère d'acceptation `#[ignore]` est invisible au cliquet de
  mutation.** `cargo mutants` exécute `cargo test`, donc jamais `--ignored` :
  le contrôle du banc à la profondeur 7 — le garde-fou déterministe le plus
  fort du dépôt — ne voyait aucun mutant. Tout changement silencieux de l'arbre
  de recherche survivait alors qu'un simple compte de nœuds l'aurait vu.
  `larbre_de_recherche_ne_bouge_pas_en_silence` fige donc le banc à la
  <s>profondeur 5</s> **profondeur 6 depuis le 24 sept. 2026**, non ignoré,
  pour 0,86 s en debug — la génération par étapes avait rendu l'arbre de la
  profondeur 5 aveugle à trois mutants qu'il voyait, et le balayage qui a
  suivi l'a montré. **Éprouvé en le faisant
  échouer** : un signe retiré dans une table piece-square le fait passer de
  31 637 à 31 942 nœuds. <span>Limite mesurée, pas supposée : il n'attrape pas
  tout — un mutant sur l'ordonnancement des promotions ne change pas ces six
  arbres. Le banc est un échantillon, comme le rappelle le piège voisin.</span>
  <br>**Ce qu'il a rapporté, mesuré le 22 sept. : 163 mutants tués par un seul
  test.** `search.rs` 110 → **45**, `eval.rs` 219 → **121**, total du dépôt
  336 → **173**. Le trou ne datait pas de la veille : il existait depuis la
  création du cliquet.
  <br>**Tenu par** : `engine/tests/bench_reference.rs`, test `larbre_de_recherche_ne_bouge_pas_en_silence` — le banc figé à la profondeur 6, non ignoré, donc visible du cliquet de mutation.

- **Deux balayages de mutation concurrents se corrompent.** Le 15 sept. 2026,
  j'ai relancé `cargo mutants` sans vérifier que le précédent avait fini. Les
  deux écrivaient dans le même `mutants.out/` : `missed.txt` mêlait les
  survivants de l'ancien code et du nouveau, avec des numéros de ligne d'une
  version qui n'existait plus — et je l'ai lu comme un résultat. Même famille
  que « ne jamais faire tourner deux matchs en même temps » : deux mesures
  concurrentes ne sont pas seulement lentes, elles mentent. Passer par
  `tools/mutants.sh`, qui prend un verrou et refuse de démarrer par-dessus.
  <br>**Tenu par** : `tools/mutants.sh`, qui prend un verrou et refuse de démarrer par-dessus.

- **Un plafond technique affiché comme une cible fait passer un run sain pour
  un run mort.** `match.yml` codait `-rounds 20000`, donc fastchess imprimait
  « Started game 688 of 40000 » : impossible de distinguer à l'œil « il reste
  du chemin » de « il n'ira jamais au bout ». **Cette ligne a induit la même
  erreur de lecture deux fois le 22 sept. 2026** — dont une sur le run de
  delta, qui venait précisément d'expirer. Le plafond n'a aucun effet
  statistique, donc le corriger ne coûte rien ; mais **le caler sur
  l'estimation exacte serait pire que le laisser faux**, parce qu'une
  estimation conservatrice de 25 % tronquerait des parties que le job aurait
  pu jouer. *Un dommage statistique réel pour réparer un affichage est un
  mauvais échange* : le plafond est posé à 1,5 × l'estimation, et une notice
  dit ce que le job atteint.
  <br>**Et l'estimation reste délibérément non calibrée**, alors que deux
  matchs donnent un facteur 0,77 stable. Ce facteur **est** le gaspillage de
  pendule — un moteur qui laisse 48 % de son horloge finit ses parties plus
  vite que la cadence nominale — donc C21 le fera dériver vers 1 en
  fusionnant. *Une constante qu'un chantier en cours invalide ne s'écrit pas.*
  <br>**Tenu par** : `.github/workflows/match.yml`, dont le plafond est calculé depuis la cadence.
