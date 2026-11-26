<!-- socle: couche=demandes zone=publique -->
# D-0028 — Approuver la mise à jour du socle du 26 nov. 2026 : ses 70 fichiers protégés

> date : 2026-11-26

## Décision demandée

Approuver les 70 fichiers protégés que pose la mise à jour du socle lancée
le 26 nov. 2026 sur ton prompt, tels que listés ci-dessous avec leur
empreinte.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs en Rust, avec son
interface, que tu développes avec un agent ; le socle est l'outil qui
tient sa mémoire, ses contrôles et ses hooks, installé le 11 nov. 2026.

**Le chantier.** Tu as demandé le 17 nov. d'attendre que les sujets en
cours soient finis avant de mettre le socle à jour, puis le 23 nov.
d'attendre que tu le dises prêt. Tu l'as dit prêt le 26 nov., avec un
prompt de mise à jour ; l'installeur a recopié le moteur du socle et ses
skills, et migré le backlog et les consignes.

**La question.** Les fichiers que le socle protège (son moteur, ses
skills, sa CI, son verrou) ne changent qu'avec ton approbation : celle-ci
les couvre tous, et la pull request les montre avant ta réponse.

Les 70 fichiers : 63 du moteur, sous le dossier du moteur du socle ; les
skills du socle `socle-batch` et `socle-handoff` (nouveaux),
`socle-request`, `socle-resume` et `socle-review` ; la CI du socle ; le
verrou du moteur. La politique et l'adaptateur ne changent pas. Les
fichiers non protégés (garde-fous, mémoire, `CLAUDE.md`, `.gitignore`)
partent dans la même pull request, sans demande.

## Éléments cités

- .claude/skills/socle-batch/SKILL.md sha256:d5929411959edbe7
- .claude/skills/socle-handoff/SKILL.md sha256:3cbc7e0ca6bba76c
- .claude/skills/socle-request/SKILL.md sha256:a2d699dc59677047
- .claude/skills/socle-resume/SKILL.md sha256:37e7dae998d02606
- .claude/skills/socle-review/SKILL.md sha256:2b367282daa81747
- .github/workflows/socle.yml sha256:1ac946d1b6ab966f
- .socle/engine.lock sha256:a71fcc2aa6ac44af
- .socle/engine/socle/CHANGES.en.md sha256:a92003f8a24ab684
- .socle/engine/socle/CHANGES.md sha256:7517e7c3f578d224
- .socle/engine/socle/FORMAT.md sha256:89c0931287b2df13
- .socle/engine/socle/HELP.en.md sha256:f4b4786c305cc855
- .socle/engine/socle/HELP.md sha256:0824ce0ff0b72d33
- .socle/engine/socle/adapters/README.md sha256:cd884d7e4918e550
- .socle/engine/socle/archive.py sha256:1a1ae2f7ada80ca4
- .socle/engine/socle/branches.py sha256:07f46d6d107f3c04
- .socle/engine/socle/checks_docs.py sha256:1de2486ecb9739c5
- .socle/engine/socle/checks_memory.py sha256:b084923dba3978f6
- .socle/engine/socle/checks_ratchet.py sha256:603b0fbf9779a368
- .socle/engine/socle/checks_tests.py sha256:73982e72920d8791
- .socle/engine/socle/cli.py sha256:e185a5b3d82c59ca
- .socle/engine/socle/commands.py sha256:2b0805150e482ad3
- .socle/engine/socle/config.py sha256:419e7b8dfb8839f0
- .socle/engine/socle/consumption.py sha256:7fbbed816fc68afe
- .socle/engine/socle/context.py sha256:c010fa051a51dfc8
- .socle/engine/socle/handoff.py sha256:91ddbb43d9daab39
- .socle/engine/socle/hooks.py sha256:89be1b3b4756bd40
- .socle/engine/socle/human.py sha256:d90693a9aaa589c3
- .socle/engine/socle/identifiers.py sha256:6f00d010cbb9d17d
- .socle/engine/socle/initialization.py sha256:eaaecd160ab23b31
- .socle/engine/socle/installer.py sha256:da3576c001a81433
- .socle/engine/socle/language.py sha256:0725a5255000dff3
- .socle/engine/socle/links.py sha256:860c4ebef8a6aac9
- .socle/engine/socle/memory.py sha256:7f742fa578546da6
- .socle/engine/socle/messages_en.py sha256:ae2e956f319c9c69
- .socle/engine/socle/migration.py sha256:36044c95f2a7b33b
- .socle/engine/socle/move.py sha256:16870d89b46cb77e
- .socle/engine/socle/private.py sha256:babddd5f11a0de96
- .socle/engine/socle/readings.py sha256:1c28d225434c62e7
- .socle/engine/socle/report.py sha256:1ebcc91a87d4c92e
- .socle/engine/socle/requests.py sha256:87630673fb24b814
- .socle/engine/socle/review.py sha256:06dbefa77be2b058
- .socle/engine/socle/roadmap.py sha256:80eb9afa47dfc83a
- .socle/engine/socle/selftest.py sha256:d9499687cb81159d
- .socle/engine/socle/state.py sha256:06236080167c3805
- .socle/engine/socle/templates/AGENTS.en.md sha256:a1cc260266686ba0
- .socle/engine/socle/templates/AGENTS.md sha256:d3d17e5e431aba41
- .socle/engine/socle/templates/guardrails.en.toml sha256:3ed69e6908b3a519
- .socle/engine/socle/templates/guardrails.toml sha256:2e53eadcfa973dce
- .socle/engine/socle/templates/initialization.en.md sha256:b1b5b85f0d0de676
- .socle/engine/socle/templates/initialization.md sha256:af914b99244cf639
- .socle/engine/socle/templates/memory/directives.en.md sha256:177dee67d8ba926a
- .socle/engine/socle/templates/memory/directives.md sha256:157e291de7a043c4
- .socle/engine/socle/templates/policy.en.toml sha256:a443ac7963812f6b
- .socle/engine/socle/templates/policy.toml sha256:592eaf5ce7ce09b5
- .socle/engine/socle/templates/questions.en.md sha256:ae3558afbbf7075e
- .socle/engine/socle/templates/questions.md sha256:f55b5f6203da6b96
- .socle/engine/socle/templates/skills/socle-batch/SKILL.en.md sha256:2fdcea988d4d7f9f
- .socle/engine/socle/templates/skills/socle-batch/SKILL.md sha256:d5929411959edbe7
- .socle/engine/socle/templates/skills/socle-handoff/SKILL.en.md sha256:41bb933af89df673
- .socle/engine/socle/templates/skills/socle-handoff/SKILL.md sha256:3cbc7e0ca6bba76c
- .socle/engine/socle/templates/skills/socle-request/SKILL.en.md sha256:861352dfdacdde36
- .socle/engine/socle/templates/skills/socle-request/SKILL.md sha256:a2d699dc59677047
- .socle/engine/socle/templates/skills/socle-resume/SKILL.en.md sha256:38e2112b0e6645e5
- .socle/engine/socle/templates/skills/socle-resume/SKILL.md sha256:37e7dae998d02606
- .socle/engine/socle/templates/skills/socle-review/SKILL.en.md sha256:54b64ce061757ce6
- .socle/engine/socle/templates/skills/socle-review/SKILL.md sha256:2b367282daa81747
- .socle/engine/socle/templates/socle.en.yml sha256:0b3391227a7d6bd6
- .socle/engine/socle/templates/socle.yml sha256:0b18bb9700cdf176
- .socle/engine/socle/utils.py sha256:fb39973ce9485903
- .socle/engine/socle/verification.py sha256:ec0293cdbe468c9c

## Où regarder

- [Les notes de version du socle](https://github.com/theodubus/socle/blob/main/socle/CHANGES.md) :
  ce que chaque fichier change, note par note ; ton prompt du 26 nov. les
  regroupe par thème.
- La pull request de la mise à jour, dont le lien suit dans la
  conversation : le diff de chaque fichier, et la migration du backlog et
  des consignes.

## Options

- **Valider** : les 70 fichiers sont approuvés, la CI du socle les admet,
  et tu fusionnes la pull request quand tu veux. Effort nul ; risque, celui
  d'une version du socle que tu as publiée ; réversible par une autre mise
  à jour.
- **Refuser** : la mise à jour ne se fusionne pas, et le dépôt reste au
  moteur du 13 nov. Réversible, la branche restant à relancer.

## Conséquences

Si tu valides : la CI de la pull request passe sur ces fichiers, et tu
la fusionnes. Si tu refuses : je ferme la pull request sans la fusionner.
Sans réponse : la pull request reste ouverte, et sa CI rouge sur ces
fichiers.

## Recommandation

Valider. Vérifié : les empreintes sont celles que `socle check` calcule
sur les fichiers posés par l'installeur, depuis la dernière version
publiée du dépôt public du socle, clonée le 26 nov. ; la politique et
l'adaptateur sont inchangés. Supposé : que cette version du socle est
celle que tu voulais publier.

## Réponses possibles

- `valider` — les 70 fichiers sont approuvés ; tu fusionnes la pull request.
- `refuser` — la mise à jour ne se fusionne pas ; la pull request se ferme.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
