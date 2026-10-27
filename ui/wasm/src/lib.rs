//! ShallowRed dans un navigateur : la boucle UCI, sans fil.
//!
//! # Pourquoi une boucle à part
//!
//! `shallowred::uci::Engine` lance chaque recherche sur un fil
//! (`thread::spawn`), pour rester à l'écoute de `stop` et de `ponderhit`
//! pendant qu'elle tourne. La cible `wasm32-wasip1` ne sait pas créer de fil,
//! et un navigateur n'en donne à WebAssembly qu'avec des en-têtes HTTP que
//! GitHub Pages ne permet pas de poser. Ce pilote cherche donc SUR LE FIL
//! APPELANT : la recherche se termine d'elle-même, à sa pendule ou à sa
//! profondeur, avant que la commande suivante soit lue.
//!
//! Le moteur, lui, ne change pas d'un octet : ce pilote n'emploie que son API
//! publique — [`Search`], [`Position`], [`Limits`], le réseau embarqué. Le
//! prix est une copie de la couche UCI, que `tests/conformite.rs` confronte au
//! binaire natif, ligne pour ligne.
//!
//! # Ce que la version web ne propose pas
//!
//! - **le ponder** : il exige de recevoir `ponderhit` PENDANT la recherche ;
//! - **plusieurs fils** : `Threads` n'est pas annoncé, un seul fil cherche ;
//! - **`EvalFile`** : un navigateur ne donne pas de chemin de fichier, le
//!   réseau embarqué joue toujours.
//!
//! Ces options ne sont donc pas annoncées en réponse à `uci` : une interface
//! qui lit les options du moteur ne les proposera pas.

use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use cozy_chess::util::display_uci_move;
use cozy_chess::{Board, Move};
use shallowred::position::Position;
use shallowred::search::{Limits, Score, Search};
use shallowred::tt::DEFAULT_SIZE_MB;
use shallowred::{bench, nnue, perft, uci};

#[cfg(target_family = "wasm")]
mod wasm;

/// Plafond de la table annoncé par la version web, en mégaoctets.
///
/// La mémoire d'un module `wasm32` est adressée sur 32 bits, et un navigateur
/// mobile en donne bien moins que 4 Gio ; le binaire natif, lui, accepte 4096.
pub const MAX_HASH_MB: usize = 512;

/// Ce que le pilote répond à `uci`.
///
/// Le nom porte « web » : une partie jouée ici se joue sur un fil, sans les
/// instructions AVX2, et une interface qui enregistre le nom du moteur (un
/// PGN, par exemple) doit pouvoir le distinguer du binaire.
#[must_use]
pub fn identification() -> Vec<String> {
    vec![
        format!("id name {} {} web", uci::NAME, uci::VERSION),
        format!("id author {}", uci::AUTHOR),
        format!("option name Hash type spin default {DEFAULT_SIZE_MB} min 1 max {MAX_HASH_MB}"),
        "uciok".to_owned(),
    ]
}

/// Lit le jeton suivant et l'analyse dans le type attendu ; un paramètre mal
/// formé est ignoré, comme dans `shallowred::uci`.
fn next_value<'a, T: std::str::FromStr>(tokens: &mut impl Iterator<Item = &'a str>) -> Option<T> {
    tokens.next().and_then(|value| value.parse().ok())
}

/// Les paramètres de `go` : `(contraintes, profondeur de perft)`.
///
/// Copie de `parse_go` de `shallowred::uci`, qui n'est pas publique.
fn parse_go<'a>(tokens: &mut impl Iterator<Item = &'a str>) -> (Limits, Option<u32>) {
    let mut limits = Limits::default();
    let mut perft_depth = None;
    while let Some(token) = tokens.next() {
        match token {
            "perft" => perft_depth = next_value(tokens),
            "wtime" => limits.wtime = next_value(tokens),
            "btime" => limits.btime = next_value(tokens),
            "winc" => limits.winc = next_value(tokens),
            "binc" => limits.binc = next_value(tokens),
            "movestogo" => limits.movestogo = next_value(tokens),
            "movetime" => limits.movetime = next_value(tokens),
            "depth" => limits.depth = next_value(tokens),
            "nodes" => limits.nodes = next_value(tokens),
            "infinite" => limits.infinite = true,
            "ponder" => limits.ponder = true,
            _ => {}
        }
    }
    (limits, perft_depth)
}

/// La variante principale en notation UCI, chaque coup converti sur le
/// plateau où il se joue — sans quoi un roque plus loin dans la variante
/// sortirait en notation roi-prend-tour.
fn pv_to_uci(root: &Board, pv: &[Move]) -> String {
    let mut board = root.clone();
    let mut parts = Vec::with_capacity(pv.len());
    for &mv in pv {
        if !board.is_legal(mv) {
            break;
        }
        parts.push(display_uci_move(&board, mv).to_string());
        board.play_unchecked(mv);
    }
    parts.join(" ")
}

/// La ligne `bestmove`, le pari `ponder` converti sur le plateau d'après
/// `best`.
fn bestmove_line(board: &Board, best: Option<Move>, ponder: Option<Move>) -> String {
    let Some(best) = best else {
        return "bestmove 0000".to_owned();
    };
    let mut line = format!("bestmove {}", display_uci_move(board, best));
    if let Some(ponder) = ponder
        && board.is_legal(best)
    {
        let mut after = board.clone();
        after.play_unchecked(best);
        if after.is_legal(ponder) {
            line.push_str(&format!(" ponder {}", display_uci_move(&after, ponder)));
        }
    }
    line
}

/// L'état du pilote entre deux commandes : la position et la recherche, dont
/// la table survit d'un coup à l'autre comme dans le binaire.
pub struct Driver {
    position: Position,
    search: Search,
}

impl Default for Driver {
    fn default() -> Self {
        Self::new()
    }
}

impl Driver {
    /// Un pilote sur la position initiale, qui évalue par le réseau embarqué.
    #[must_use]
    pub fn new() -> Self {
        // Le drapeau d'arrêt n'est jamais levé : rien ne peut s'exécuter
        // pendant une recherche, qui finit toujours à sa pendule.
        let mut search = Search::new(Arc::new(AtomicBool::new(false)));
        search.set_network(nnue::embedded().ok());
        Self {
            position: Position::startpos(),
            search,
        }
    }

    /// Traite une commande et rend `false` sur `quit`. Chaque ligne émise
    /// passe par `out`, au moment où elle est produite — les lignes `info`
    /// pendant la recherche, pas à sa fin.
    pub fn handle(&mut self, line: &str, out: &mut impl FnMut(&str)) -> bool {
        let mut tokens = line.split_whitespace();
        let Some(command) = tokens.next() else {
            return true;
        };
        match command {
            "uci" => {
                for line in identification() {
                    out(&line);
                }
            }
            "isready" => out("readyok"),
            "ucinewgame" => {
                self.position = Position::startpos();
                self.search.clear_table();
            }
            "setoption" => self.set_option(tokens),
            "position" => self.set_position(tokens, out),
            "go" => self.go(tokens, out),
            // Aucune recherche ne tourne quand une commande est lue : il n'y
            // a rien à arrêter, ni de pari à confirmer.
            "stop" | "ponderhit" => {}
            "d" => out(&self.position.board().to_string()),
            // Le banc du moteur, tel quel : c'est par lui qu'on vérifie que le
            // module WebAssembly cherche le même arbre que le binaire.
            "bench" => {
                let depth = next_value(&mut tokens).unwrap_or(bench::DEFAULT_DEPTH);
                if let Err(e) = bench::run(depth) {
                    out(&format!("info string {e}"));
                }
            }
            "quit" => return false,
            _ => {}
        }
        true
    }

    /// `setoption name Hash value <n>` ; toute autre option est ignorée en
    /// silence, comme le protocole l'exige d'une option inconnue.
    fn set_option<'a>(&mut self, tokens: impl Iterator<Item = &'a str>) {
        let words: Vec<&str> = tokens.collect();
        let Some(name_at) = words.iter().position(|&w| w == "name") else {
            return;
        };
        let value_at = words.iter().position(|&w| w == "value");
        let name = words[name_at + 1..value_at.unwrap_or(words.len())].join(" ");
        let value = value_at.and_then(|at| words.get(at + 1));
        if name.eq_ignore_ascii_case("hash")
            && let Some(megabytes) = value.and_then(|v| v.parse::<usize>().ok())
        {
            self.search.resize_table(megabytes.clamp(1, MAX_HASH_MB));
        }
    }

    /// `position startpos [moves …]` ou `position fen <6 champs> [moves …]`.
    /// Une séquence contenant un coup illégal est rejetée entière, et le dit.
    fn set_position<'a>(
        &mut self,
        mut tokens: impl Iterator<Item = &'a str>,
        out: &mut impl FnMut(&str),
    ) {
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
                out(&format!("info string {e}"));
                return;
            }
        };
        if next == Some("moves") {
            for token in tokens {
                if let Err(e) = position.play_uci(token) {
                    out(&format!("info string {e} — position ignorée"));
                    return;
                }
            }
        }
        self.position = position;
    }

    /// `go …` : la recherche entière, sur ce fil.
    fn go<'a>(&mut self, mut tokens: impl Iterator<Item = &'a str>, out: &mut impl FnMut(&str)) {
        let (mut limits, perft_depth) = parse_go(&mut tokens);
        let board = self.position.board().clone();
        if let Some(depth) = perft_depth {
            let mut total = 0;
            for (mv, nodes) in perft::divide(&board, depth) {
                total += nodes;
                out(&format!("{}: {nodes}", display_uci_move(&board, mv)));
            }
            out("");
            out(&format!("Nodes searched: {total}"));
            return;
        }
        if limits.ponder {
            // Le ponder n'est pas annoncé ; une interface qui l'enverrait
            // quand même obtient une recherche ordinaire, et le sait.
            limits.ponder = false;
            out("info string ponder indisponible dans la version web : recherche ordinaire");
        }
        let best = self.search.go(&self.position, &limits, |info| {
            let score = match info.score {
                Score::Cp(cp) => format!("cp {cp}"),
                Score::Mate(moves) => format!("mate {moves}"),
            };
            let nps = info
                .nodes
                .saturating_mul(1_000)
                .checked_div(info.time_ms)
                .map_or(String::new(), |nps| format!(" nps {nps}"));
            out(&format!(
                "info depth {} score {score} nodes {} time {}{nps} hashfull {} pv {}",
                info.depth,
                info.nodes,
                info.time_ms,
                info.hashfull,
                pv_to_uci(&board, &info.pv)
            ));
        });
        let ponder = best.and_then(|mv| self.search.ponder_move(&board, mv));
        out(&bestmove_line(&board, best, ponder));
    }
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]
mod tests {
    use super::*;

    fn run(driver: &mut Driver, line: &str) -> Vec<String> {
        let mut lines = Vec::new();
        driver.handle(line, &mut |l| lines.push(l.to_owned()));
        lines
    }

    #[test]
    fn l_identification_n_annonce_ni_ponder_ni_threads_ni_evalfile() {
        let lines = identification();
        assert!(lines[0].starts_with("id name ShallowRed ") && lines[0].ends_with(" web"));
        let options: Vec<_> = lines.iter().filter(|l| l.starts_with("option ")).collect();
        assert_eq!(options.len(), 1, "{options:?}");
        assert!(options[0].starts_with("option name Hash "));
        assert_eq!(lines.last().unwrap(), "uciok");
    }

    #[test]
    fn go_ponder_rend_une_recherche_ordinaire_et_le_dit() {
        let mut driver = Driver::new();
        let lines = run(&mut driver, "go ponder depth 2");
        assert!(lines[0].starts_with("info string ponder indisponible"));
        assert!(lines.last().unwrap().starts_with("bestmove "));
    }

    #[test]
    fn une_table_redimensionnee_cherche_encore() {
        let mut driver = Driver::new();
        run(&mut driver, "setoption name Hash value 1");
        assert!(
            run(&mut driver, "go depth 3")
                .last()
                .unwrap()
                .starts_with("bestmove ")
        );
    }

    #[test]
    fn quit_termine_et_le_reste_non() {
        let mut driver = Driver::new();
        assert!(driver.handle("isready", &mut |_| {}));
        assert!(driver.handle("commande inconnue", &mut |_| {}));
        assert!(!driver.handle("quit", &mut |_| {}));
    }
}
