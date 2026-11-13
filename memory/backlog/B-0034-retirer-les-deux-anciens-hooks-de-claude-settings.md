<!-- socle: couche=backlog zone=publique -->
# B-0034 — Retirer les deux anciens hooks de .claude/settings.json

> statut : ouvert · origine : J-2026-11-13-C · pour : humain · priorité : haute · lu : backlog@ee2b0d3d

Théo a validé D-0009 : ne garder, au démarrage et en fin de tour, que les
hooks du socle. Le fichier qui les déclare, `.claude/settings.json`, est
protégé : seul Théo le change, puis l'approuve. La part de l'agent est
poussée avant ce geste, sur la branche `claude/feuille-de-route-et-carnet` :
`tools/etat.sh` allégé, l'ancienne feuille de route remplacée par un
renvoi, `tools/verify-hooks.sh` qui cherche les hooks du socle où qu'ils
soient déclarés. Ses cas passent avant le geste comme après.

## Les commandes

Dans un terminal Unix (macOS, Linux, WSL ou Git Bash), à la racine de ton
clone de chess, hors de toute session de Claude : `socle approve` refuse
de tourner sous un agent.

```sh
git fetch origin
git switch claude/feuille-de-route-et-carnet
git pull --ff-only
python3 -c 'import json, pathlib; p = pathlib.Path(".claude/settings.json"); s = json.loads(p.read_text(encoding="utf-8")); h = s["hooks"]; h["SessionStart"] = [b for b in h["SessionStart"] if "tools/etat.sh" not in json.dumps(b)]; h["Stop"] = [b for b in h["Stop"] if "verify-on-stop.sh" not in json.dumps(b)]; p.write_text(json.dumps(s, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")'
git diff --stat .claude/settings.json
python3 .socle/socle approve --files .claude/settings.json --text "D-0009 : ne garder au démarrage et en fin de tour que les hooks du socle"
git add .claude/settings.json memory/requests/
git commit -m "Ne garder que les hooks du socle au démarrage et en fin de tour (D-0009)"
git push
```

## Ce qui est attendu

- `git diff --stat` : `.claude/settings.json`, 20 lignes retirées, aucune
  ajoutée. Ce sont les deux blocs, celui qui lance `tools/etat.sh` et celui
  qui lance `.claude/hooks/verify-on-stop.sh`. L'agent a rejoué la commande
  sur une copie du fichier le 13 nov. : rien d'autre ne bouge.
- `socle approve` répond qu'une demande d'approbation est « écrite et
  validée », avec sa réponse, sous `memory/requests/` ; le `git add` les
  emporte.
- Si les hooks git du socle sont actifs dans ton clone, le commit et le
  push lancent les contrôles rapides : quelques minutes.

À la main, sans la commande `python3 -c` : dans la liste `Stop`, retirer
le bloc dont la commande finit par `.claude/hooks/verify-on-stop.sh`, et
dans la liste `SessionStart`, celui dont la commande finit par
`tools/etat.sh`, avec leur virgule.

## Fait quand

- [ ] le commit de Théo est sur la branche, et la CI du socle passe
