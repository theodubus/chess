//! Génère le corpus d'entraînement de l'ajustement Texel.
//!
//! Chaque ligne produite est `FEN;résultat`, le résultat valant 1, 0.5 ou 0 du
//! point de vue des Blancs. C'est le **résultat de la partie** qui étiquette la
//! position, jamais le score de l'évaluation : s'ajuster sur son propre score
//! apprendrait au moteur à être d'accord avec lui-même, ce qui n'améliore rien.
//!
//! # Pourquoi les ouvertures sont tirées au hasard et non lues dans `book.epd`
//!
//! **Le moteur est déterministe.** Même moteur des deux côtés, profondeur fixe,
//! même ouverture donnent exactement la même partie. Avec les 500 positions du
//! livre, le corpus plafonnerait à 500 parties distinctes quel que soit le
//! nombre qu'on en lance — très insuffisant pour ajuster environ 830
//! paramètres, qu'on surapprendrait sur 500 parties. Le tirage aléatoire
//! d'ouvertures lève cette limite.
//!
//! # Pourquoi une profondeur fixe et non un temps
//!
//! Un budget en temps ferait dépendre le corpus de la charge de la machine :
//! deux exécutions ne produiraient pas le même fichier. La profondeur fixe
//! garde la génération reproductible à graine donnée.
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use cozy_chess::{Board, Color, Move};
use shallowred::position::Position;
use shallowred::search::{Limits, Score, Search};

/// xorshift64*, déterministe : même graine, même corpus.
fn next_random(state: &mut u64) -> u64 {
    let mut x = *state;
    x ^= x >> 12;
    x ^= x << 25;
    x ^= x >> 27;
    *state = x;
    x.wrapping_mul(0x2545_F491_4F6C_DD1D)
}

fn legal_moves(board: &Board) -> Vec<Move> {
    let mut moves = Vec::new();
    board.generate_moves(|set| {
        moves.extend(set);
        false
    });
    moves
}

/// Joue `plies` coups au hasard, puis vérifie que la position reste jouable.
fn random_opening(plies: u32, state: &mut u64) -> Option<Board> {
    let mut board = Board::default();
    for _ in 0..plies {
        let moves = legal_moves(&board);
        if moves.is_empty() {
            return None;
        }
        let index = (next_random(state) % moves.len() as u64) as usize;
        board.play_unchecked(*moves.get(index)?);
    }
    (!legal_moves(&board).is_empty()).then_some(board)
}

/// Ce qu'une partie a produit : ses positions, et son résultat vu des Blancs.
struct Game {
    positions: Vec<String>,
    result: f64,
}

/// Seuil d'adjudication, en centièmes de pion, et nombre de coups consécutifs
/// au-delà duquel la partie est déclarée gagnée.
///
/// Sans adjudication, une position gagnée se traîne sur des dizaines de coups
/// et sature le corpus de positions redondantes.
const RESIGN_SCORE: i32 = 1000;
const RESIGN_PLIES: u32 = 6;
/// Au-delà, la partie est déclarée nulle : un moteur qui piétine n'apprend
/// rien à personne.
const MAX_PLIES: u32 = 300;

fn play_game(opening: Board, depth: u32, search: &mut Search) -> Game {
    let mut position = Position::from_board(opening);
    let mut positions = Vec::new();
    let mut decided = 0u32;
    let mut leader = Color::White;
    search.clear_table();

    let limits = Limits {
        depth: Some(depth),
        ..Limits::default()
    };

    for ply in 0..MAX_PLIES {
        if position.is_repetition() || position.is_fifty_move_draw() {
            return Game {
                positions,
                result: 0.5,
            };
        }
        if legal_moves(position.board()).is_empty() {
            // Sans coup légal : mat si l'on est en échec, pair sinon.
            let result = if position.board().checkers().is_empty() {
                0.5
            } else if position.board().side_to_move() == Color::White {
                0.0
            } else {
                1.0
            };
            return Game { positions, result };
        }

        // Le score de la dernière itération, ramené en centièmes de pion.
        // Un mat annoncé compte comme un avantage décisif : c'en est un.
        let mut score: i32 = 0;
        let Some(mv) = search.go(&position, &limits, |info| {
            score = match info.score {
                Score::Cp(cp) => cp,
                Score::Mate(moves) => {
                    if moves > 0 {
                        RESIGN_SCORE * 10
                    } else {
                        -RESIGN_SCORE * 10
                    }
                }
            };
        }) else {
            return Game {
                positions,
                result: 0.5,
            };
        };

        // Une position en échec n'a pas d'évaluation statique qui ait un sens :
        // le camp au trait doit parer, et tout jugement tranquille est faux.
        // C'est le filtre classique de l'ajustement Texel.
        if position.board().checkers().is_empty() && ply >= 2 {
            positions.push(position.board().to_string());
        }

        // Adjudication : le score est rendu du point de vue du trait.
        let white_score = if position.board().side_to_move() == Color::White {
            score
        } else {
            -score
        };
        if white_score.abs() >= RESIGN_SCORE {
            let side = if white_score > 0 {
                Color::White
            } else {
                Color::Black
            };
            if side == leader {
                decided += 1;
            } else {
                leader = side;
                decided = 1;
            }
            if decided >= RESIGN_PLIES {
                let result = if leader == Color::White { 1.0 } else { 0.0 };
                return Game { positions, result };
            }
        } else {
            decided = 0;
        }

        position.play(mv);
    }

    Game {
        positions,
        result: 0.5,
    }
}

fn main() {
    let mut args = std::env::args().skip(1);
    let games: u32 = args.next().and_then(|a| a.parse().ok()).unwrap_or(100);
    let depth: u32 = args.next().and_then(|a| a.parse().ok()).unwrap_or(6);
    let mut seed: u64 = args
        .next()
        .and_then(|a| a.parse().ok())
        .unwrap_or(20_260_914);

    let stop = Arc::new(AtomicBool::new(false));
    let mut search = Search::new(stop);
    let mut written = 0u64;
    let (mut white_wins, mut black_wins, mut draws) = (0u32, 0u32, 0u32);

    for _ in 0..games {
        // Huit à onze demi-coups : assez pour diversifier, assez peu pour que
        // la position reste jouable et ne soit pas déjà perdue.
        let plies = 8 + (next_random(&mut seed) % 4) as u32;
        let Some(opening) = random_opening(plies, &mut seed) else {
            continue;
        };
        let game = play_game(opening, depth, &mut search);
        // Le décompte par PARTIE, et non par position : une partie décisive
        // courte fournit moins de positions qu'une nulle qui s'éternise, si
        // bien que la distribution des positions n'est pas celle des parties.
        // S'y fier m'a fait soupçonner une erreur de signe qui n'existait pas.
        match game.result {
            r if r > 0.75 => white_wins += 1,
            r if r < 0.25 => black_wins += 1,
            _ => draws += 1,
        }
        for fen in &game.positions {
            println!("{fen};{}", game.result);
            written += 1;
        }
    }
    eprintln!(
        "{written} positions écrites — {white_wins} gains blancs, {black_wins} noirs, {draws} nulles"
    );
}
