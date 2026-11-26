<!-- socle: couche=decisions zone=publique -->
# ADR-0042 — chess ne se travaille que dans Claude Code, ui/ compris

> statut : acceptée · date : 2026-11-26 · lu : decisions@9094f2ba

## Contexte

Théo, le 26 nov. 2026 à 19 h 33, heure de Paris (J-2026-11-26-Q@6d1623e5) :
« On fera chess que dans Claude Code. Le critère Codex de B-0082 tombe
donc : restreins-le à Claude Code. » Puis, sur la question de `ui/` :
« Et oui ça vaut aussi pour UI » (D-0031@793124e8). La parole a d'abord
été rangée en consigne, C-0005@f582006b, levée par D-0033@219ef417 :
c'est une décision de projet, quels agents travaillent sur chess, pas une
règle de travail de l'agent.

Avant elle, ADR-0026@d5ed01b6 disait Codex arrêté sur `ui/` depuis fin
octobre, sa règle tenant pour ses branches « s'il en revient » ; et
D-0029@36016c2b avait placé les instructions dans `AGENTS.md`, « lu par
tout agent ».

## Décision

Le projet chess, le moteur comme `ui/`, ne se travaille que dans Claude
Code. Codex ne revient pas. Les instructions restent dans `AGENTS.md`,
importées par `CLAUDE.md` : le passage de D-0029 est fait et constaté
(J-2026-11-26-O@ae195fe3), et rien n'oblige à le défaire. Un critère qui vise un
autre agent que Claude Code tombe, comme celui de B-0082@fbcc3ade.

## Conséquences

ADR-0026 reste acceptée : les branches `codex/…` déjà poussées se
gardent toujours, et les sessions `ccr-…` de `ui/` sont du Claude Code.
La taille d'`AGENTS.md` n'a plus à tenir dans les 32 Kio que Codex lit
par défaut (J-2026-11-26-M@e60f15e3). Se défaire : une décision de Théo qui
réadmet un autre agent, et cette taille serait alors à revoir.
