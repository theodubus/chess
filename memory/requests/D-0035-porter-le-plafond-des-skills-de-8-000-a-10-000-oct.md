<!-- socle: couche=demandes zone=publique -->
# D-0035 — Porter le plafond des skills de 8 000 à 10 000 octets dans les garde-fous

> date : 2026-11-28

## Décision demandée

Porter à 10 000 octets le plafond de taille de chaque skill, la clé
`budgets.".claude/skills/*/SKILL.md".max_bytes` de `.socle/guardrails.toml`,
aujourd'hui à 8 000.

## Contexte

**Le projet.** ShallowRed est un moteur d'échecs en Rust, avec son
interface, que tu développes avec un agent ; le socle est l'outil qui
tient sa mémoire, ses contrôles et ses hooks. Ses garde-fous
(`.socle/guardrails.toml`) bornent entre autres la taille de chaque
fichier que l'agent charge.

**Le chantier.** Tu as dit le socle prêt le 28 nov. 2026, avec un prompt
de mise à jour ; sa note du 27 nov. porte le plafond des skills de son
gabarit de 8 000 à 10 000 octets, et une mise à jour garde les
garde-fous du projet, donc les 8 000 de chess. Ton prompt dit que tu as
choisi de reprendre 10 000 octets dans chaque projet installé, et demande
cette demande dans la pull request de la mise à jour.

**La question.** Relever un plafond assouplit un garde-fou : la politique
d'autonomie l'interdit à l'agent sans ta validation. Seule la clé nommée
ici change ; aucun test ni aucune valeur attendue n'est touché.

Un skill est une procédure que l'agent charge en entier quand il s'en
sert, sous `.claude/skills/<nom>/SKILL.md`. Les quatre skills du socle
que pose la mise à jour pèsent 7 651 à 7 959 octets ; trois du projet
s'en approchent aussi : `preparer-une-seance` (7 978), `passer-a-l-ecran`
(7 781) et `rendre-un-verdict` (7 116). Au-dessus du plafond, le contrôle
`memoire.budgets` refuse le fichier, et la règle suivante d'un de ces
skills ne trouverait plus de place.

## Éléments cités

Aucun identifiant de la mémoire : la demande porte sur la seule clé
`budgets.".claude/skills/*/SKILL.md".max_bytes`.

## Où regarder

- [.socle/guardrails.toml](https://github.com/theodubus/chess/blob/baa97dffe05bdd143b8f763f117de1afa5d14707/.socle/guardrails.toml) :
  la ligne `".claude/skills/*/SKILL.md" = { max_bytes = 8000 }`, la seule
  qui changerait, en `10000`.
- [Les notes de version du socle](https://github.com/theodubus/socle/blob/main/socle/CHANGES.md) :
  la note 2026-11-27-a, qui pose 10 000 dans le gabarit, et la note
  2026-11-27-l, sur les skills du socle repassés sous 8 000.

## Options

- **Valider** : la ligne passe à 10 000 dans cette même pull request.
  Effort : un commit ; risque : des skills un peu plus longs à charger, à
  2 000 octets au plus de plus chacun ; réversible en redescendant la
  valeur, ce que l'agent peut faire seul, durcir étant libre.
- **Refuser** : le plafond reste à 8 000 ; la prochaine règle d'un skill
  à moins de cent octets du plafond devra en retirer une autre, ou
  revenir te demander.

## Conséquences

Si tu valides : la valeur passe à 10 000 dans la pull request de la mise
à jour, avant que tu la fusionnes. Si tu refuses : rien ne change, et
la pull request part sans ce changement. Sans réponse : rien ne change
non plus ; la demande reste en attente, listée à chaque état.

## Recommandation

Valider. Vérifié : les tailles ci-dessus, mesurées sur l'arbre de la
mise à jour ; la valeur du gabarit du socle, 10 000, lue dans
`.socle/engine/socle/templates/guardrails.toml`. Supposé : que 2 000
octets de plus suffisent aux skills d'ici la prochaine révision du
socle.

## Réponses possibles

- `valider` — la clé `budgets.".claude/skills/*/SKILL.md".max_bytes` passe de 8 000 à 10 000 dans la pull request de la mise à jour.
- `refuser` — le plafond reste à 8 000.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
