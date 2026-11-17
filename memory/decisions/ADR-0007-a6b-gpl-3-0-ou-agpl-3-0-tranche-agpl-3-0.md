<!-- socle: couche=decisions zone=publique -->
# ADR-0007 — A6b : GPL-3.0 ou AGPL-3.0 ? (Tranché — AGPL-3.0)

> statut : acceptée · date : 2026-09-12 · lu : decisions@ddb63eea

## Contexte

Arbitrage A6b du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet.

**La différence.** Une seule clause : **AGPL §13**. Si quelqu'un *modifie* le code et laisse des utilisateurs interagir avec **sur un réseau**, il doit leur offrir les sources — même sans jamais distribuer de binaire. GPL ne se déclenche qu'à la distribution.

**Quand ça mord.**

| Transport (A8) | GPL suffit ? | AGPL apporte |
| --- | --- | --- |
| Desktop (Tauri, Electron) | Oui — le binaire est distribué | Rien |
| Web, moteur WASM local | Oui — le `.wasm` est distribué au navigateur | Quasi rien |
| **Web, moteur sur serveur** | **Non** | **Ferme le trou** |

A6b et A8 sont donc couplés : si A8 exclut le moteur distant, A6b perd tout enjeu pratique.

**Compatibilité.** **[Fait vérifié]** GPLv3 §13 et AGPLv3 §13 s'autorisent explicitement et mutuellement la combinaison. Licencier son propre code en AGPL-3.0 tout en utilisant `chessground` et `shakmaty` (GPL-3.0) est prévu par le texte des deux licences — les parties GPL restent GPL, l'exigence réseau s'applique à la combinaison. **Confiance : élevée** (texte des licences).

**Coût de l'AGPL.** De nombreuses organisations interdisent les dépendances AGPL par politique. **Impact faible ici** : UCI est une frontière inter-processus, et un processus qui en pilote un autre via un protocole défini n'est généralement pas une œuvre dérivée — c'est ce qui permet à Stockfish (GPL-3.0) d'être chargé dans des GUI propriétaires. **[Inférence]** — principe juridique largement admis, pas une certitude jurisprudentielle.

**Réversibilité.** Tant que Théo est seul auteur, passer d'AGPL à GPL ou l'inverse reste possible. Cesse de l'être dès qu'une contribution extérieure est acceptée sans CLA.

## Décision

**Décision.** **[Décision utilisateur]** **12 sept. 2026 — AGPL-3.0.** Conforme à la recommandation émise.

## Conséquences

**À appliquer.** `LICENSE` avec le texte complet de l'AGPL-3.0, en-têtes de fichiers, et `license = "AGPL-3.0-or-later"` dans `Cargo.toml` et `package.json`. Voir C1b.

**Conséquence sur A8.** Le couplage disparaît dans un sens : A8 peut désormais retenir n'importe quel transport, le moteur distant inclus, sans que la licence pose question.
