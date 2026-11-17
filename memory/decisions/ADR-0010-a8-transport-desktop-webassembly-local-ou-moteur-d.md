<!-- socle: couche=decisions zone=publique -->
# ADR-0010 — A8 : Transport : desktop, WebAssembly local, ou moteur distant ? (Question ouverte)

> statut : proposée · date : 2026-09-12 · lu : decisions@b329ae82

## Contexte

Arbitrage A8 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet.

**Options.**

| Forme | Tuyau | Coût |
| --- | --- | --- |
| **Desktop** (Tauri, Electron) | Processus fils, pipes stdin/stdout | Le plus naturel. C'est ce que font Arena et Cute Chess. |
| **Web, moteur local** | WebAssembly dans un Web Worker, UCI par `postMessage` | Même protocole, tuyau différent. C'est ainsi que Lichess fait tourner Stockfish dans le navigateur. |
| **Web, moteur distant** | Serveur HTTP/WebSocket détenant le processus | Hébergement et latence. Utile seulement pour du gros matériel. |

**Statut.** Reportable — UCI rend le transport interchangeable. **Mais pas neutre** : l'argument WebAssembly est l'un des principaux en faveur de Rust (A3). Si le desktop est retenu définitivement, A3 perd un de ses appuis sans pour autant être renversé.

**Couplage avec A6b.** La troisième ligne (moteur sur serveur) est **le seul cas où l'AGPL apporte quelque chose de concret**. Si A8 exclut définitivement le moteur distant, A6b perd son enjeu pratique et GPL-3.0 suffit.

## Décision

**Décision.** *En attente — non bloquant avant C7.*

## Conséquences

Le carnet n'en écrivait pas.
