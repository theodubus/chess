<!-- socle: couche=demandes zone=publique -->
# D-0034 — Approuver la mise à jour du socle du 28 nov. 2026 : ses 39 fichiers protégés

> date : 2026-11-28

## Décision demandée

Approuver les 39 fichiers protégés que pose la mise à jour du socle lancée
le 28 nov. 2026 sur ton prompt, tels que listés ci-dessous avec leur
empreinte.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs en Rust, avec son
interface, que tu développes avec un agent ; le socle est l'outil qui
tient sa mémoire, ses contrôles et ses hooks, installé le 11 nov. 2026
et mis à jour le 26 nov.

**Le chantier.** Le 26 nov. au soir, tu as demandé de ne pas reprendre
les travaux du moteur tant que les correctifs du socle tirés de tes
retours n'étaient pas prêts. Tu les as dits prêts le 28 nov., avec un
prompt de mise à jour ; l'installeur a recopié le moteur du socle et ses
skills depuis son dépôt public, sans rien migrer d'autre.

**La question.** Les fichiers que le socle protège (son moteur, ses
skills, son verrou) ne changent qu'avec ton approbation : celle-ci les
couvre tous, et la pull request les montre avant ta réponse.

Les 39 fichiers : 34 du moteur, sous le dossier du moteur du socle ; les
skills du socle `socle-batch`, `socle-handoff`, `socle-request` et
`socle-resume` ; le verrou du moteur. La politique, l'adaptateur, les
garde-fous et la CI du socle ne changent pas. Le seul fichier non protégé
que pose l'installeur, la section du socle d'`AGENTS.md`, part dans la
même pull request, sans demande. Le plafond des skills, que ton prompt
demande de porter à 10 000 octets, fait l'objet d'une demande à part.

## Éléments cités

- .claude/skills/socle-batch/SKILL.md sha256:a92405dce0f1418c
- .claude/skills/socle-handoff/SKILL.md sha256:a850b089ce03b3a0
- .claude/skills/socle-request/SKILL.md sha256:fac4876a5de9ce37
- .claude/skills/socle-resume/SKILL.md sha256:c5527316d58252cf
- .socle/engine.lock sha256:6ffc9bb60fc36f66
- .socle/engine/socle/CHANGES.en.md sha256:9326cfacd4ba5963
- .socle/engine/socle/CHANGES.md sha256:e820e1f28dee8090
- .socle/engine/socle/FORMAT.md sha256:5f0aaa9c6c6cf00c
- .socle/engine/socle/HELP.en.md sha256:48e2a91f48c832a1
- .socle/engine/socle/HELP.md sha256:528d9fe2306e00f4
- .socle/engine/socle/archive.py sha256:fce1d3fb73d83d98
- .socle/engine/socle/checks_memory.py sha256:7b491fd7e0d25ef5
- .socle/engine/socle/checks_tests.py sha256:15e717c99eccacc8
- .socle/engine/socle/cli.py sha256:1fb5ca5c6576ce0d
- .socle/engine/socle/handoff.py sha256:9b33858c0cf0466b
- .socle/engine/socle/hooks.py sha256:7a0a2e5d652645af
- .socle/engine/socle/human.py sha256:e00ccce0f21e6764
- .socle/engine/socle/installer.py sha256:7737bae1703d94f9
- .socle/engine/socle/language.py sha256:64d924e393196329
- .socle/engine/socle/links.py sha256:d24b471ee5ed8338
- .socle/engine/socle/memory.py sha256:ae5ed78a4a63a1a8
- .socle/engine/socle/messages_en.py sha256:23b96192c086ccb0
- .socle/engine/socle/migration.py sha256:458f9e9680f6fa88
- .socle/engine/socle/requests.py sha256:efaf94fc5e6a71b9
- .socle/engine/socle/roadmap.py sha256:070ca0412205f80a
- .socle/engine/socle/selftest.py sha256:09ee310768d5871d
- .socle/engine/socle/state.py sha256:a8220a09bcb8f718
- .socle/engine/socle/templates/AGENTS.en.md sha256:813fb1024bbff2c5
- .socle/engine/socle/templates/AGENTS.md sha256:17a71ed8e9fcf78c
- .socle/engine/socle/templates/guardrails.en.toml sha256:927e0cbbfcc1df41
- .socle/engine/socle/templates/guardrails.toml sha256:46d1a63e689c5a43
- .socle/engine/socle/templates/skills/socle-batch/SKILL.en.md sha256:a7728573131b52b4
- .socle/engine/socle/templates/skills/socle-batch/SKILL.md sha256:a92405dce0f1418c
- .socle/engine/socle/templates/skills/socle-handoff/SKILL.en.md sha256:59b6615e920b420c
- .socle/engine/socle/templates/skills/socle-handoff/SKILL.md sha256:a850b089ce03b3a0
- .socle/engine/socle/templates/skills/socle-request/SKILL.en.md sha256:118adb90b7930378
- .socle/engine/socle/templates/skills/socle-request/SKILL.md sha256:fac4876a5de9ce37
- .socle/engine/socle/templates/skills/socle-resume/SKILL.en.md sha256:804427d67521a06e
- .socle/engine/socle/templates/skills/socle-resume/SKILL.md sha256:c5527316d58252cf

## Où regarder

- [Les notes de version du socle](https://github.com/theodubus/socle/blob/main/socle/CHANGES.md) :
  ce que chaque fichier change, note par note, de 2026-11-26-d à
  2026-11-27-l ; ton prompt du 28 nov. les regroupe par thème.
- La pull request de la mise à jour, dont le lien suit dans la
  conversation : le diff de chaque fichier, et la section du socle
  d'`AGENTS.md` régénérée.

## Options

- **Valider** : les 39 fichiers sont approuvés, la CI du socle les admet,
  et tu fusionnes la pull request quand tu veux. Effort nul ; risque,
  celui d'une version du socle que tu as publiée ; réversible par une
  autre mise à jour.
- **Refuser** : la mise à jour ne se fusionne pas, et le dépôt reste au
  moteur du 26 nov. Réversible, la branche restant à relancer.

## Conséquences

Si tu valides : la CI de la pull request passe sur ces fichiers, et tu
la fusionnes. Si tu refuses : la pull request se ferme sans fusion.
Sans réponse : la pull request reste ouverte, et sa CI rouge sur ces
fichiers.

## Recommandation

Valider. Vérifié : les empreintes sont celles que `socle check` calcule
sur les fichiers posés par l'installeur, depuis la dernière version
publiée du dépôt public du socle, clonée le 28 nov. ; la politique,
l'adaptateur et les garde-fous sont inchangés, comparés octet par octet à
leur copie d'avant l'installeur. Supposé : que cette version du socle est
celle que tu voulais publier.

## Réponses possibles

- `valider` — les 39 fichiers sont approuvés ; tu fusionnes la pull request.
- `refuser` — la mise à jour ne se fusionne pas ; la pull request se ferme.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
