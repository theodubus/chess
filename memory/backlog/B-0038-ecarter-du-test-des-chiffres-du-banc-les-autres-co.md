<!-- socle: couche=backlog zone=publique -->
# B-0038 — Écarter du test des chiffres du banc les autres couches gelées que le format connaît

> statut : ouvert · origine : J-2026-11-16-E · après : B-0037, B-0043 · priorité : basse · lu : backlog@72bb7d4e

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
(J-2026-11-16-E) en est l'origine. La transition de `tools/README.md`
pourrait poser les premières archives : la question se tranche avec son
découpage (B-0043).

## Le 18 nov. 2026 : la question des archives est close

Théo a choisi que l'histoire de la documentation aille au journal, pas en
archives (D-0020) : aucune archive n'est prévue. Reste la mémoire privée,
que D-0020 ne couvrait pas : un clone ignoré par git, en mode compagnon,
que le test lirait en local et pas en CI (`engine/tests/bench_reference.rs`
parcourt les dossiers). La question est posée à Théo en séance.

## Fait quand

- [ ] Théo a dit si la mémoire privée est écartée du test, le jour où elle existe, et le test le fait, ou le sujet est abandonné
