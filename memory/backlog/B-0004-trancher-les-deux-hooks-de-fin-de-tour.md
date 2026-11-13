<!-- socle: couche=backlog zone=publique -->
# B-0004 — Trancher les deux hooks de fin de tour

> statut : ouvert · origine : J-2026-11-12-A · lu : backlog@925d483c · après : D-0009

Depuis l'installation, deux hooks de fin de tour lancent les mêmes douze
étapes : celui de chess, `.claude/hooks/verify-on-stop.sh`, qui lance
`tools/verify.sh --rapide`, et celui du socle. Mesuré le 12 nov. 2026 sur
le conteneur de la session, un `.rs` modifié : 123 s pour le premier,
122 s pour le second ; relancé sur le même arbre, celui du socle ne prend
que 3 s, parce qu'il retient l'arbre déjà vérifié.

Ils ne se déclenchent pas sur le même ensemble de fichiers :

| | hook de chess | hook du socle |
| --- | --- | --- |
| se déclenche si | un `.rs` non commité diffère du dernier commit, où qu'il soit | un fichier des sources de l'adaptateur a changé depuis la base, commité ou non |
| tests d'intégration seuls (`engine/tests/`) | oui | non : ils ne sont pas des sources |
| arbre déjà vérifié | relancé à chaque fin de tour | non relancé |

Retirer celui de chess économise environ deux minutes par fin de tour où
un `.rs` de `engine/src/` ou de `tools/src/` attend son commit, mais ouvre
un trou : un changement des seuls tests d'intégration ne serait plus
vérifié en fin de tour, seulement au push et en CI. Le fermer demande
d'ajouter ces tests aux sources de l'adaptateur, fichier protégé, ou aux
chemins de code des garde-fous.

`.claude/settings.json` est protégé : la décision revient à Théo, par une
demande que l'agent prépare, avec ces deux options et leur coût.

## Tranché le 13 nov. 2026

Théo a validé D-0009 : ne garder que le hook du socle. Le trou des tests
d'intégration est fermé sans fichier protégé ni garde-fou : depuis la
mise à jour 0.2.0, le hook de fin de tour du socle compte comme du code
les fichiers de tests que l'adaptateur déclare, dont ceux d'`engine/tests/`
(J-2026-11-13-C). L'adaptateur n'a donc pas à changer ; reste le geste de
Théo sur `.claude/settings.json` (B-0034).

## Fait quand

- [x] Théo a choisi : garder les deux hooks, ou n'en garder qu'un et fermer le trou des tests d'intégration
- [ ] `.claude/settings.json` et l'adaptateur disent ce choix
