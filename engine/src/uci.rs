//! Boucle UCI — l'unique frontière entre le moteur et le monde.
//!
//! # Ce que le protocole impose
//!
//! Le moteur est un processus séparé piloté en lignes de texte sur
//! stdin/stdout. Il ne conserve **aucun état de partie** : l'interface renvoie
//! la position complète à chaque coup, impose un budget de temps plutôt qu'une
//! profondeur, et attend exactement un `bestmove` par `go`.
//!
//! # Deux pièges traités ici
//!
//! - **Le roque.** `cozy-chess` emploie la notation roi-prend-tour (`e1h1`)
//!   pour supporter le Chess960 ; UCI attend `e1g1`. Toute conversion passe par
//!   [`cozy_chess::util`]. Un `Move` ne doit jamais être affiché brut.
//! - **La sortie tamponnée.** Chaque ligne est suivie d'un `flush` explicite.
//!   Sans cela l'interface attend indéfiniment une réponse déjà écrite.

use std::io::{self, BufRead, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};

use cozy_chess::util::display_uci_move;

use crate::bench;
use crate::perft;
use crate::position::Position;
use crate::search::{Limits, Search};

/// Nom annoncé à l'interface.
pub const NAME: &str = "ShallowRed";
/// Version annoncée, tirée du manifeste.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
/// Auteur annoncé.
pub const AUTHOR: &str = "theodubus";

/// Écrit une ligne sur la sortie standard et la pousse immédiatement.
fn send(line: &str) {
    let mut out = io::stdout().lock();
    let _ = writeln!(out, "{line}");
    let _ = out.flush();
}

/// Lit le jeton suivant et l'analyse dans le type attendu.
///
/// Un paramètre mal formé est ignoré plutôt que de faire échouer la commande :
/// une interface qui envoie `depth abc` doit obtenir une recherche, pas un
/// silence.
fn next_value<'a, T: std::str::FromStr>(tokens: &mut impl Iterator<Item = &'a str>) -> Option<T> {
    tokens.next().and_then(|value| value.parse().ok())
}

/// L'état du moteur entre deux commandes.
pub struct Engine {
    position: Position,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

impl Engine {
    /// Crée un moteur sur la position initiale.
    #[must_use]
    pub fn new() -> Self {
        Self {
            position: Position::startpos(),
            stop: Arc::new(AtomicBool::new(false)),
            worker: None,
        }
    }

    /// Lit stdin jusqu'à `quit` ou fin de flux.
    pub fn run(&mut self) {
        let stdin = io::stdin();
        for line in stdin.lock().lines().map_while(Result::ok) {
            if !self.handle(line.trim()) {
                break;
            }
        }
        self.abort_search();
    }

    /// Traite une commande. Renvoie `false` pour terminer la boucle.
    ///
    /// Une commande inconnue est ignorée en silence, comme le protocole
    /// l'exige : une interface peut envoyer des extensions que le moteur ne
    /// connaît pas, et s'en plaindre casserait la session.
    pub fn handle(&mut self, line: &str) -> bool {
        let mut tokens = line.split_whitespace();
        let Some(command) = tokens.next() else {
            return true;
        };

        match command {
            "uci" => {
                send(&format!("id name {NAME} {VERSION}"));
                send(&format!("id author {AUTHOR}"));
                send("uciok");
            }
            "isready" => send("readyok"),
            "ucinewgame" => {
                self.abort_search();
                self.position = Position::startpos();
            }
            "position" => self.set_position(tokens),
            "go" => self.go(tokens),
            "stop" => self.stop.store(true, Ordering::Relaxed),
            "d" => send(&self.position.board().to_string()),
            "bench" => {
                let depth = tokens
                    .next()
                    .and_then(|t| t.parse().ok())
                    .unwrap_or(bench::DEFAULT_DEPTH);
                if let Err(e) = bench::run(depth) {
                    send(&format!("info string {e}"));
                }
            }
            "quit" => return false,
            _ => {}
        }
        true
    }

    /// `position startpos [moves ...]` ou `position fen <6 champs> [moves ...]`.
    fn set_position<'a>(&mut self, mut tokens: impl Iterator<Item = &'a str>) {
        self.abort_search();

        let mut next = tokens.next();
        let parsed = match next {
            Some("startpos") => {
                next = tokens.next();
                Ok(Position::startpos())
            }
            Some("fen") => {
                let mut fields = Vec::new();
                loop {
                    next = tokens.next();
                    match next {
                        Some(token) if token != "moves" => fields.push(token),
                        _ => break,
                    }
                }
                Position::from_fen(&fields.join(" "))
            }
            _ => Err("commande `position` sans `startpos` ni `fen`".to_owned()),
        };

        let mut position = match parsed {
            Ok(position) => position,
            Err(e) => {
                send(&format!("info string {e}"));
                return;
            }
        };

        if next == Some("moves") {
            for token in tokens {
                if let Err(e) = position.play_uci(token) {
                    // La position est abandonnée plutôt qu'acceptée à moitié :
                    // une position partiellement jouée ferait diverger le moteur
                    // et l'interface sans que rien ne le signale.
                    send(&format!("info string {e} — position ignorée"));
                    return;
                }
            }
        }

        self.position = position;
    }

    /// `go [wtime .. btime .. winc .. binc .. movestogo .. movetime .. depth ..
    /// nodes .. infinite]`, ou `go perft <n>`.
    fn go<'a>(&mut self, mut tokens: impl Iterator<Item = &'a str>) {
        self.abort_search();

        let mut limits = Limits::default();
        let mut perft_depth = None;

        while let Some(token) = tokens.next() {
            match token {
                "perft" => perft_depth = next_value(&mut tokens),
                "wtime" => limits.wtime = next_value(&mut tokens),
                "btime" => limits.btime = next_value(&mut tokens),
                "winc" => limits.winc = next_value(&mut tokens),
                "binc" => limits.binc = next_value(&mut tokens),
                "movestogo" => limits.movestogo = next_value(&mut tokens),
                "movetime" => limits.movetime = next_value(&mut tokens),
                "depth" => limits.depth = next_value(&mut tokens),
                "nodes" => limits.nodes = next_value(&mut tokens),
                "infinite" => limits.infinite = true,
                _ => {}
            }
        }

        if let Some(depth) = perft_depth {
            self.run_perft(depth);
            return;
        }

        self.stop.store(false, Ordering::Relaxed);
        let position = self.position.clone();
        let stop = Arc::clone(&self.stop);

        self.worker = Some(thread::spawn(move || {
            let mut search = Search::new(stop);
            let best = search.go(&position, &limits, |info| {
                let pv = info
                    .pv
                    .iter()
                    .map(|mv| display_uci_move(position.board(), *mv).to_string())
                    .collect::<Vec<_>>()
                    .join(" ");
                send(&format!(
                    "info depth {} score cp {} nodes {} time {} pv {pv}",
                    info.depth, info.score_cp, info.nodes, info.time_ms
                ));
            });

            match best {
                Some(mv) => send(&format!(
                    "bestmove {}",
                    display_uci_move(position.board(), mv)
                )),
                // Aucun coup légal : mat ou pat. L'interface attend tout de même
                // une réponse, et `0000` est le coup nul conventionnel.
                None => send("bestmove 0000"),
            }
        }));
    }

    /// `go perft <n>` — perft ventilé, exécuté sur le fil courant.
    fn run_perft(&self, depth: u32) {
        let board = self.position.board();
        let mut total = 0;
        for (mv, nodes) in perft::divide(board, depth) {
            total += nodes;
            send(&format!("{}: {nodes}", display_uci_move(board, mv)));
        }
        send("");
        send(&format!("Nodes searched: {total}"));
    }

    /// Demande l'arrêt de la recherche en cours et attend sa terminaison.
    fn abort_search(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
        self.stop.store(false, Ordering::Relaxed);
    }
}
