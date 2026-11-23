<!-- socle: couche=demandes zone=publique -->
# D-0024 — Mettre à jour le socle à sa publication du 23 nov. 2026 et approuver ses fichiers protégés

> date : 2026-11-23

## Décision demandée

Autoriser l'agent à lancer la mise à jour du socle vers sa publication du 23 nov. 2026 (commit 8fbc2d7 du dépôt public du socle), et approuver d'avance les 60 fichiers protégés qu'elle change, listés plus bas avec leur empreinte.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs écrit en Rust, avec une interface à part ; son dépôt GitHub s'appelle chess. Un agent de code, Claude Code, y travaille par sessions, encadré par le socle : ton outil, développé dans son propre dépôt, qui tient la mémoire du projet dans le dépôt, la vérifie par des contrôles et pose des hooks, des commandes lancées seules à des moments fixes (avant chaque commande de l'agent, à la fin de son tour, avant un commit).

**Le chantier.** L'adoption du socle : installer l'outil, puis ranger le projet dans sa forme. Le 12 nov. 2026, tu as voulu la finir avant de reprendre le travail sur le moteur d'échecs. Le 17 nov., tu as précisé : la mise à jour du socle d'abord, puis le moteur, « sauf le sujet des données d'entraînement si on arrive à la deadline » ; et la mise à jour seulement après la transition de la documentation, pour la faire « depuis un repo conforme à une version antérieure du socle ». Cette transition, sortir 1,5 Mo de récits et de verdicts de la documentation des outils pour les ranger dans la mémoire, est finie : sa dernière pull request a été fusionnée aujourd'hui à 15 h 12. Il ne reste que la mise à jour, que le backlog dit faire à la version que tu choisis.

**La question.** L'agent a lancé la mise à jour pour de bon, après un essai à blanc sur une copie jetable du dépôt. L'outil de permissions de la session, qui juge chaque commande de l'agent, l'a refusée : elle réécrit des fichiers protégés sans que tu l'aies demandé. L'agent ne contourne pas ce refus. Il te demande la version et ton accord ; ta validation approuve aussi d'avance les fichiers que l'essai a produits.

**Les mots.** Le *moteur du socle* est le code de l'outil, copié dans le dépôt sous `.socle/engine/`, à ne pas confondre avec le moteur d'échecs. Un *fichier protégé* ne change qu'avec ta validation : le hook refuse que l'agent l'écrive, et la CI (les contrôles que GitHub lance à chaque envoi) refuse un fichier changé sans demande validée qui le cite. Son *empreinte* est le début de la somme SHA-256 de son contenu : la CI recalcule celle de chaque fichier et la compare à celle que la demande cite ; si une seule diffère, le fichier est refusé et l'agent pose une demande pour lui. Le *verrou* est le fichier qui dit quelle copie du moteur du socle est installée. L'*installeur* est la commande du socle qui pose ou met à jour cette copie. Un *skill* est une procédure écrite que l'agent charge quand elle sert. La *politique* et les *garde-fous* sont les deux fichiers de réglages du socle : ce que l'agent peut faire seul, et les seuils des contrôles. Le *chantier actif* est la note de travail en cours, lue au démarrage de chaque session. Le *journal* garde l'histoire du projet, une entrée par événement ; les *décisions*, tes choix et leurs raisons. Après un identifiant, `@…` est l'empreinte de la version que l'agent a lue.

**La version.** Le socle n'a pas d'étiquettes : chaque publication porte le numéro 0.2.0 et se distingue par son commit et sa date. Celle de chess date du 12 nov. (d3f516d) ; la dernière, de ce matin (8fbc2d7). Entre les deux, 94 notes de version ; 54 ne demandent rien, et les 40 autres, pour la plupart, ne demandent quelque chose que dans un cas que chess n'a pas, ou décrivent ce qu'il a déjà. Celles qui touchent chess sont résumées ci-dessous.

**Ce qu'elle apporte à chess.**
- L'état que le hook de démarrage imprime fait aujourd'hui 22,8 Ko ; au-delà de 10 000 caractères, Claude Code n'en remet à l'agent qu'un aperçu de 2 000. La mise à jour le borne à 9 500 octets, qui arrivent entiers.
- La fin de tour en échec ne recopie plus toute la sortie des tests, seulement le nom de chaque contrôle et la ligne de chaque test en échec : moins de contexte consommé.
- Les lots se tiennent au backlog, avec l'historique de leurs relectures, au lieu du journal à la main ; un skill neuf, `socle-batch`, les conduit (former, mener, quand compacter la conversation, quel modèle pour quel travail).
- Une commande dit ce qu'une session a coûté, et pourquoi une limite d'usage est tombée.
- Le hook voit des écritures qu'il laissait passer (par `cp -t`, `find -delete`, `xargs`, un `python -c`, une boucle).

**Ce qu'elle risque de bloquer.** Le hook refusera des gestes qu'il acceptait : un `python -c` qui cite un fichier protégé, une boucle qui écrit vers une variable qu'il ne connaît pas, un `git push` dont il ne sait pas développer un argument, un ancien numéro du backlog repris dans un texte neuf. Chaque refus dit comment écrire autrement.

**Ce que l'agent fera dans chess**, sans autre demande :
- **le backlog** prend quatre formes : *besoin* (`B-`, un résultat attendu), *tâche* (`T-`, un livrable), *lot* (`L-`, des tâches relues ensemble), *jalon* (`JA-`, des besoins qui servent un même but). Les sept jalons sont renumérotés (B-0003 devient JA-0001, …, B-0041 JA-0007), et leur ancien numéro se résout toujours ; le journal et les décisions le gardent. Seule une tâche se prend : l'agent découpe chaque besoin en tâches quand il le prend, la mise à jour d'abord ;
- **`CLAUDE.md`** grossit de 1 244 octets, la section du socle étant régénérée, et dépasse son plafond (65 827 pour 65 000). L'agent envoie au journal environ 1 Ko de récits datés, ceux qui suivent trois règles (lire un code de sortie, le 14 sept. et le 14 oct. ; les règles de la prédiction enfreintes, le 16 sept.) ; les règles restent ;
- **le plafond du chantier actif** passe de 6 000 à 3 740 octets, ce que le démarrage peut en montrer ; il fait 2 Ko. Baisser un plafond est libre ;
- trois réglages nouveaux gardent leur défaut : 9 500 octets au démarrage, cinq minutes pour les contrôles rapides, neuf tâches par lot.

**La politique ne change pas** : les deux lignes qui diffèrent du modèle du socle sont celles que tu y as écrites, les outils refusés à l'agent, qui lui laissent fusionner sa pull request, et les branches gardées, celles des réseaux entraînés et des autres agents.

**Les 60 fichiers protégés** : 54 fichiers du moteur du socle, dont le code des hooks, et son verrou ; les quatre skills du socle, dont le nouveau ; le workflow de CI du socle. Les scripts des hooks git, la déclaration des hooks de Claude Code, la politique, l'adaptateur de chess (ce que le socle lance pour compiler et tester), les garde-fous et `CLAUDE.md` ne changent pas ou ne sont pas protégés.

## Éléments cités

- B-0044@e87463f7 — le sujet du backlog de la mise à jour du socle, à la version que tu choisis.
- D-0018@8d89d11c — ta décision du 17 nov. : la mise à jour après la transition.
- D-0016@fe4de17f — ta décision du 17 nov. : la mise à jour avant le moteur, sauf les données qui expirent.
- D-0010@55c9d298 — la mise à jour précédente du 12 nov., approuvée par une demande comme celle-ci.
- B-0041@6f6c85ca — le jalon de la transition, atteint aujourd'hui, qui deviendrait JA-0007.
- B-0003@80d1886c — le premier jalon du backlog, le déplacement du carnet de bord, clos, qui deviendrait JA-0001.
- B-0026@f9074f77 — dire quelles données d'entraînement des réseaux, gardées par GitHub et effacées le 24 déc., servent encore.
- B-0012@4621f653 — le prochain match du moteur d'échecs : le réseau neuf contre sa base.
- 8fbc2d7 — le commit de la publication du socle du 23 nov. 2026, dans le dépôt public du socle.
- d3f516d — le commit de la publication du socle du 12 nov. 2026, installée dans chess.
- .claude/skills/socle-batch/SKILL.md sha256:d79c42c1a513fe4a
- .claude/skills/socle-request/SKILL.md sha256:b931dd8b4d86e166
- .claude/skills/socle-resume/SKILL.md sha256:3746f4f208284a39
- .claude/skills/socle-review/SKILL.md sha256:619553ba785b3bca
- .github/workflows/socle.yml sha256:1ac946d1b6ab966f
- .socle/engine.lock sha256:aed5cadeaa32ff1a
- .socle/engine/socle/CHANGES.en.md sha256:650ba82ff994eb84
- .socle/engine/socle/CHANGES.md sha256:c8834e500cf53474
- .socle/engine/socle/FORMAT.md sha256:a10ca475e1253b8e
- .socle/engine/socle/HELP.en.md sha256:5a1379425522aeae
- .socle/engine/socle/HELP.md sha256:bcc359aa5c6c9e4a
- .socle/engine/socle/archive.py sha256:08128c38f20106b4
- .socle/engine/socle/checks_memory.py sha256:9d5c19bcee09741a
- .socle/engine/socle/checks_ratchet.py sha256:92edfeb0b4231c55
- .socle/engine/socle/checks_tests.py sha256:77684a5be07169b1
- .socle/engine/socle/cli.py sha256:391c3859013e8874
- .socle/engine/socle/commands.py sha256:2b0805150e482ad3
- .socle/engine/socle/config.py sha256:23feb410817167f6
- .socle/engine/socle/consumption.py sha256:0de2b4dcb3c34fcc
- .socle/engine/socle/context.py sha256:e975e4eabed31129
- .socle/engine/socle/hooks.py sha256:8c65bf05a8e33577
- .socle/engine/socle/human.py sha256:08ed6e8e559ba347
- .socle/engine/socle/identifiers.py sha256:6f00d010cbb9d17d
- .socle/engine/socle/initialization.py sha256:eaaecd160ab23b31
- .socle/engine/socle/installer.py sha256:32f484e82d3bd005
- .socle/engine/socle/language.py sha256:cbc00047a4901371
- .socle/engine/socle/links.py sha256:73cf2b0c2d51d8da
- .socle/engine/socle/memory.py sha256:88f0518a99da511d
- .socle/engine/socle/messages_en.py sha256:8e7c6d289702e892
- .socle/engine/socle/migration.py sha256:36044c95f2a7b33b
- .socle/engine/socle/move.py sha256:16870d89b46cb77e
- .socle/engine/socle/readings.py sha256:1c28d225434c62e7
- .socle/engine/socle/report.py sha256:1ebcc91a87d4c92e
- .socle/engine/socle/requests.py sha256:5f0715ee234570c1
- .socle/engine/socle/review.py sha256:0ba008e61664c117
- .socle/engine/socle/roadmap.py sha256:80eb9afa47dfc83a
- .socle/engine/socle/selftest.py sha256:053c0cd1866b0755
- .socle/engine/socle/state.py sha256:4fc64c8b1179e496
- .socle/engine/socle/templates/AGENTS.en.md sha256:3f6801d680e2647c
- .socle/engine/socle/templates/AGENTS.md sha256:d5a156559e15928e
- .socle/engine/socle/templates/guardrails.en.toml sha256:51f29a0d1dd5c8d2
- .socle/engine/socle/templates/guardrails.toml sha256:dd15288376cab902
- .socle/engine/socle/templates/initialization.en.md sha256:b1b5b85f0d0de676
- .socle/engine/socle/templates/initialization.md sha256:af914b99244cf639
- .socle/engine/socle/templates/policy.en.toml sha256:0b060dbdc9f0615d
- .socle/engine/socle/templates/policy.toml sha256:2eb65bc60cf530ea
- .socle/engine/socle/templates/questions.en.md sha256:ae3558afbbf7075e
- .socle/engine/socle/templates/questions.md sha256:f55b5f6203da6b96
- .socle/engine/socle/templates/skills/socle-batch/SKILL.en.md sha256:fc956b0ba440f022
- .socle/engine/socle/templates/skills/socle-batch/SKILL.md sha256:d79c42c1a513fe4a
- .socle/engine/socle/templates/skills/socle-request/SKILL.en.md sha256:2b05cef525ec9c00
- .socle/engine/socle/templates/skills/socle-request/SKILL.md sha256:b931dd8b4d86e166
- .socle/engine/socle/templates/skills/socle-resume/SKILL.en.md sha256:b50c1931d391eaab
- .socle/engine/socle/templates/skills/socle-resume/SKILL.md sha256:3746f4f208284a39
- .socle/engine/socle/templates/skills/socle-review/SKILL.en.md sha256:ca98fa67c65491bf
- .socle/engine/socle/templates/skills/socle-review/SKILL.md sha256:619553ba785b3bca
- .socle/engine/socle/templates/socle.en.yml sha256:0b3391227a7d6bd6
- .socle/engine/socle/templates/socle.yml sha256:0b18bb9700cdf176
- .socle/engine/socle/utils.py sha256:55ff7e2218ca9a26
- .socle/engine/socle/verification.py sha256:ec0293cdbe468c9c

## Où regarder

- [Les notes de version du socle](https://github.com/theodubus/socle/blob/8fbc2d7750c0eba6586fd682df65d0205b72d2e0/socle/CHANGES.md), la plus récente d'abord ; celles d'avant le 13 nov. décrivent ce que chess a déjà. Les deux qui pèsent : « Le backlog en quatre formes » (16 nov.) et « La fusion de sa pull request par l'agent » (20 nov.), qui confirme que ta ligne de la politique suffit.
- [B-0044](https://github.com/theodubus/chess/blob/40afb5b13fa62c888db63815e7e07d0e18f0e25b/memory/backlog/B-0044-mettre-a-jour-le-socle-depuis-le-depot-conforme.md) : le sujet, et son critère.
- [La politique de chess](https://github.com/theodubus/chess/blob/40afb5b13fa62c888db63815e7e07d0e18f0e25b/.socle/policy.toml), section `[irreversible]` : la ligne `tools` que tu y as écrite, que la mise à jour garde.

## Options

- **Mettre à jour à la publication du 23 nov.** L'agent relance l'installeur, vérifie les 60 empreintes, fait ce qui est décrit plus haut, passe les contrôles et la relecture par un relecteur sans contexte, ouvre la pull request et la fusionne quand la CI est verte. Effort : une session ; pour toi, cette réponse. Risque : les refus du hook décrits plus haut. Réversible : un `git revert` de la pull request remet l'ancien moteur du socle et l'ancien backlog ; aussitôt après, rien à reprendre ; plus tard, les entrées écrites depuis avec les identifiants `T-` ou `JA-` seraient à renuméroter.
- **Attendre une publication plus tardive.** Rien ne change ; le travail sur le moteur d'échecs attend aussi, sauf les données qui expirent. Le socle étant publié presque chaque jour, attendre n'apporte qu'une liste de notes plus longue.
- **Ne pas mettre à jour.** Le sujet se ferme sans être fait, et le travail sur le moteur d'échecs reprend sur la version du 12 nov. Une mise à jour pourra se faire plus tard.

## Conséquences

Si tu valides : la mise à jour se fait dans la pull request suivante, ta réponse commitée avec les fichiers qu'elle approuve ; puis le travail reprend, les données qui expirent le 24 déc. d'abord (B-0026), puis le moteur (B-0012). Si tu choisis d'attendre : l'agent passe aux données, et reposera la question à la publication que tu nommeras. Si tu refuses : B-0044 se ferme sans être fait, et le travail reprend de même. Sans réponse : pas de mise à jour ; l'agent passe aux données, que ta décision du 17 nov. permet avant leur échéance.

## Recommandation

Mettre à jour maintenant. Vérifié : l'essai à blanc, sur l'état d'aujourd'hui, a produit ces 60 fichiers et ces empreintes, et n'a trouvé que les deux dépassements décrits plus haut ; la politique ne change pas ; l'aperçu de 2 000 caractères de l'état au démarrage se lit dans cette session même. Supposé : une fois installés, les contrôles nouveaux ne trouveront pas d'autre défaut ; l'essai n'a lancé que les contrôles du socle, ni la compilation ni les tests du moteur d'échecs, que l'agent lancera avant de pousser.

## Réponses possibles

- `valider` — l'agent lance la mise à jour vers la publication du 23 nov. (8fbc2d7) ; les 60 fichiers protégés listés ici sont approuvés.
- `attendre` — pas de mise à jour pour l'instant ; l'agent passe aux données qui expirent, et B-0044 reste ouvert.
- `refuser` — pas de mise à jour ; B-0044 se ferme sans être fait, et le travail reprend sur l'ancien socle.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
