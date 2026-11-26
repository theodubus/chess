<!-- socle: couche=demandes zone=publique -->
# D-0030 — Faire pointer vers AGENTS.md les messages d'échec de quatre tests qui nomment encore CLAUDE.md

> date : 2026-11-26

## Décision demandée

Changer le texte des messages d'échec de quatre tests, qui disent encore
« CLAUDE.md » là où les instructions vivent désormais dans `AGENTS.md`, et
renommer l'un d'eux, sans rien changer de ce que ces tests vérifient.

## Contexte

**Le projet.** ShallowRed, ton moteur d'échecs en Rust, avec son interface
à part. Ses instructions de travail, que lit chaque agent qui y travaille,
tenaient jusqu'ici dans un seul fichier, `CLAUDE.md`, que seul Claude Code
lit.

**Le chantier.** Le 26 nov. 2026, tu as validé le passage de ces
instructions dans `AGENTS.md`, lu par tout agent, `CLAUDE.md` n'en gardant
que l'import (la ligne `@AGENTS.md`), le budget porté à 65 000 octets, et
les trois fichiers de test qui lisent les instructions par leur nom
adaptés. C'est fait sur la branche de travail : les trois fichiers lisent
`AGENTS.md`, et chacun a un test qui échoue si `AGENTS.md` disparaît.

**La question.** Le contrôle du socle qui garde les tests (`tests.attendus`)
refuse qu'une assertion change sans une demande validée qui nomme la
**fonction** de test ; ta validation du 26 nov. nommait les trois fichiers,
pas leurs fonctions. Les messages d'échec, écrits dans les assertions, sont
donc restés tels quels.

Ces messages ne décident de rien : ils s'impriment quand un test tombe, pour
dire quoi corriger. Laissés tels quels, ils envoient vers `CLAUDE.md`, qui
ne contient plus que l'import ; y ajouter quelque chose ferait échouer le
contrôle du socle qui exige que `CLAUDE.md` ne porte que cette ligne. Les
changements, mot pour mot :

- `larbre_de_recherche_ne_bouge_pas_en_silence`
  (`engine/tests/bench_reference.rs`) : « corriger la référence de la
  profondeur 7 dans CLAUDE.md et README.md » devient « … dans AGENTS.md et
  README.md ».
- `chaque_dispositif_automatique_est_nomme_dans_la_documentation`
  (`engine/tests/outillage_documente.rs`) : « Ajouter son nom de fichier à
  CLAUDE.md, README.md ou tools/README.md » devient « … à AGENTS.md, … ».
- `chaque_piege_archive_nomme_un_dispositif_qui_existe`
  (`engine/tests/pieges_fermes.rs`) : « pourquoi il a quitté CLAUDE.md » et
  « le REMETTRE dans CLAUDE.md » deviennent « … AGENTS.md ».
- `larchive_reste_atteignable_depuis_claude_md`
  (`engine/tests/pieges_fermes.rs`) : « CLAUDE.md ne nomme plus … » devient
  « AGENTS.md ne nomme plus … », et la fonction est renommée
  `larchive_reste_atteignable_depuis_les_instructions`.

## Éléments cités

- D-0029@36016c2b — ta validation du 26 nov. 2026 : instructions dans AGENTS.md, budget à 65 000, les trois tests adaptés.
- B-0082@74980e7f — le besoin : les instructions dans AGENTS.md, CLAUDE.md réduit à son import.
- T-0005@7312ab37 — la tâche qui fera ces changements si tu valides.

## Où regarder

- [engine/tests/bench_reference.rs](https://github.com/theodubus/chess/blob/7b0178c31bc79b369ebbb40226123a40e779180b/engine/tests/bench_reference.rs) : le message de `larbre_de_recherche_ne_bouge_pas_en_silence`, en fin de fichier.
- [engine/tests/outillage_documente.rs](https://github.com/theodubus/chess/blob/7b0178c31bc79b369ebbb40226123a40e779180b/engine/tests/outillage_documente.rs) : le dernier message du test principal.
- [engine/tests/pieges_fermes.rs](https://github.com/theodubus/chess/blob/7b0178c31bc79b369ebbb40226123a40e779180b/engine/tests/pieges_fermes.rs) : les trois messages qui nomment CLAUDE.md.

Ce qu'il faut y vérifier : chaque changement ne touche qu'une chaîne de
message, jamais une condition.

## Options

- **Changer les messages et le nom** : un commit de quelques lignes ; risque
  nul, aucune condition ne bouge ; réversible d'un `git revert`.
- **Les laisser** : aucun effort ; un test qui tombe enverra vers un fichier
  qui ne contient plus que l'import, un détour d'une lecture ; réversible.

## Conséquences

- Si tu valides : T-0005 fait les changements dans le lot suivant ; le
  contrôle du socle les accepte en citant cette demande.
- Si tu refuses : les messages restent, T-0005 se clôt sans rien changer.
- Sans réponse : les messages restent ; rien d'autre n'attend cette demande.

## Recommandation

Valider. Vérifié : les tests passent sur la branche, et chacun des trois
fichiers a un test qui tombe sans `AGENTS.md`. Lu dans le code du contrôle,
pas exécuté : il refuserait de changer ces chaînes faute d'une validation
qui nomme les fonctions. Supposé : aucun autre outil ne lit ces messages.

## Réponses possibles

- `valider` — les quatre messages et le nom changent comme dit plus haut.
- `refuser` — rien ne change, T-0005 se clôt.
- `contexte-insuffisant` — la demande revient à l'agent, qui la réécrit en une demande qui la remplace.
