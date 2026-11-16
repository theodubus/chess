<!-- socle: couche=backlog zone=publique -->
# B-0038 — Écarter du test des chiffres du banc les autres couches gelées que le format connaît

> statut : ouvert · origine : J-2026-11-16-E · après : B-0037 · priorité : basse · lu : backlog@72bb7d4e

Le test des chiffres du banc (`engine/tests/bench_reference.rs`) écarte,
depuis D-0015, trois couches gelées de la mémoire : le journal, les
demandes et les décisions. Le format du socle en connaît deux autres,
que le test lirait.

- Les archives, sous memory/archives : « documents archivés tels quels (cadrage…), non
  lus par les contrôles » (`.socle/engine/socle/FORMAT.md`). Une archive
  du carnet, si B-0003 en pose une, citerait la forme de la ligne de
  référence comme son journal la cite, et ferait tomber le test.
- La mémoire privée, sous memory/private : en mode compagnon un clone
  ignoré par git, avec son propre journal, ses demandes et ses décisions.
  Le test la lirait en local et pas en CI.

Ni l'un ni l'autre n'existe aujourd'hui, et la mémoire privée n'est pas
configurée. Le jour où l'un apparaît, l'écarter assouplit encore le test :
c'est à Théo de le décider, et le relevé de la relecture qui l'a trouvé
(J-2026-11-16-E) en est l'origine.

## Fait quand

- [ ] Théo a dit si les archives et la mémoire privée sont écartées, le jour où l'une existe, ou le sujet est abandonné
