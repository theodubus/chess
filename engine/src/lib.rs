//! Moteur d'échecs UCI.
//!
//! # Invariants structurants
//!
//! Ces points sont des arbitrages tranchés, pas des détails d'implémentation.
//! Les rouvrir demande un fait technique nouveau, pas une préférence.
//!
//! - **La génération de coups est déléguée à [`cozy_chess`]** (arbitrage A7).
//!   Mesuré : le générateur pèse 2 à 10 % du coût d'un nœud de recherche, donc
//!   en écrire un n'achèterait pas de performance mesurable.
//! - **La recherche fonctionne en copy-make** (arbitrage A5). `cozy-chess`
//!   n'expose pas d'`unmake` et les champs de son `Board` sont privés ; un
//!   `Board` fait 104 octets, ce qui rend la copie bon marché.
//! - **Toute recherche est déterministe.** Aucun hasard non seedé, jamais.
//! - **Le moteur ne conserve aucun état entre deux commandes `position`.**
//!   Pas de notion de partie, pas de PGN, pas de joueurs : cela appartient
//!   à l'interface.
//! - **Le roque se convertit à la frontière UCI.** `cozy-chess` emploie la
//!   notation roi-prend-tour (`e1h1`) pour supporter le Chess960 ; UCI attend
//!   `e1g1`. Toute entrée et toute sortie passe par
//!   [`cozy_chess::util::parse_uci_move`] et
//!   [`cozy_chess::util::display_uci_move`]. Ne jamais afficher un `Move` brut.

pub mod bench;
pub mod perft;
pub mod position;
pub mod search;
pub mod uci;
