<!-- socle: couche=decisions zone=publique -->
# ADR-0003 — A3 : Quel langage pour le moteur ? (Tranché — Rust)

> statut : acceptée · date : 2026-09-12 · lu : decisions@a847dd79

## Contexte

Arbitrage A3 du carnet de bord, rubrique « 04 — Arbitrages », recopié tel quel dans la mémoire ; découpé en contexte, décision et conséquences, il reste dans l'ordre du carnet. Entrées de la mémoire lues pour le faire : J-2026-09-12-E@27b55bef.

**Candidats.** Rust, C++, C. Python est exclu par les mesures de 2022.

**Pilier tombé.** **[Réfutée]** L'argument n°1 de cet arbitrage était **« Théo apprend Rust avec ce projet »**. Théo a démenti le 12 sept. 2026 : il n'apprend pas Rust, c'est Claude qui écrit le code. **L'argument disparaît entièrement.** La décision a néanmoins été prise le même jour, en connaissance de cause, sur les arguments restants. Voir J-2026-09-12-E et §11.

**Arguments restants, par poids.**

- **1 — Le compilateur interdit la faute de 2022.** Le bug racine était une fonction de *lecture* qui mutait son entrée (`changer_piece()` écrivait sur le plateau), ce qui a imposé des copies défensives partout. `&self` contre `&mut self` rend cela inexprimable. Argument spécifique à ce projet, pas une généralité.
- **2 — Sûreté du multithread.** Prend du poids depuis que la performance est le critère : une recherche parallèle (Lazy SMP) en C++ est un nid à courses de données. Le système de types de Rust les rend inexprimables.
- **3 — Outillage.** Cargo couvre build, dépendances, tests et bench. C++ demande CMake, un gestionnaire de paquets et un framework de test séparés.
- **4 — WebAssembly.** `cargo build --target wasm32-unknown-unknown` contre une chaîne Emscripten. **Ne pèse que si A8 retient le web.**
- **5 — Performance.** Équivalente à C/C++ pour ce type de code. `std::arch` expose les mêmes intrinsics (`popcnt`, `pext`), `#[repr(align)]` gère l'alignement. **[Inférence]** Rust n'est pas un handicap de performance pour un moteur d'échecs ; ce n'est pas non plus un avantage.

**Contre-argument.** L'écosystème des moteurs d'échecs est massivement C++ : littérature, exemples et astuces bas niveau y sont documentés, et il faut parfois traduire. **Ce contre-argument pèse plus lourd depuis que la perf est le critère** — mais reste modéré, les techniques étant transposables.

## Décision

**Décision.** **[Décision utilisateur]** **12 sept. 2026 — Rust**, prise le jour même où le pilier « apprentissage » est tombé.

## Conséquences

**Réouvrir si.** Une limite de performance spécifique à Rust apparaissait — aucune connue à ce jour. Le seul changement de contexte plausible serait le besoin d'une bibliothèque C++ sans équivalent Rust.
