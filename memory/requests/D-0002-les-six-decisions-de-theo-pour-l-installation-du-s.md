<!-- socle: couche=demandes zone=publique -->
# D-0002 — Les six décisions de Théo pour l'installation du socle sur chess

> date : 2026-11-11 · forme : séance

## Question posée

Théo a donné ces six décisions de lui-même, dans le message qui demandait
l'installation du socle sur chess, le 11 novembre 2026 : aucune question de
l'agent ne les a précédées. Ce qui est consigné ici : installer le socle
sur chess selon ces six points, que l'agent ne rouvre pas.

1. **L'adaptateur** est celui de chess, propre au projet, donné à
   l'installeur en fichier : `.socle/adapter.toml`. Théo le valide en le
   lisant dans la pull request d'installation.
2. **Le dossier `ui/` est déclaré tiers** : la clé `thirdparty.paths` des
   garde-fous (`.socle/guardrails.toml`) reçoit le motif qui désigne tout ce
   dossier. Aucun contrôle du socle ne le juge, et les commits des autres
   agents qui ne touchent que lui n'ont pas à porter la trace des hooks.
3. **L'agent fusionne lui-même ses pull requests à CI verte**, comme avant
   le socle. Théo ajoute lui-même, dans `.socle/policy.toml`, la ligne de
   politique qui le permet.
4. **`CLAUDE.md` garde sa marge de budget à l'installation.** Le premier
   sujet de chess sera de déplacer le carnet de bord vers la mémoire :
   `CLAUDE.md` ne gardera que les règles de travail.
5. **Le balayage de mutation de chess est gardé tel quel**
   (`.github/workflows/mutation.yml`). Celui du socle n'est pas posé pour
   l'instant : l'adaptateur déclare la capacité de mutation absente.
6. **Les branches de réseaux et celles des autres agents sont à garder** :
   elles ne doivent jamais être proposées à la suppression. Théo l'écrit
   lui-même dans la politique, à la clé `keep_branches`.

Le texte exact de Théo est la citation de la réponse.
