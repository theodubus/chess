//! Critère de fin de l'étape C8 : la recherche bat le tirage au sort.
//!
//! Un moteur qui ne bat pas systématiquement le hasard n'a pas de recherche qui
//! fonctionne, quelle que soit l'élégance de son code. C'est le test le plus
//! grossier du projet et le plus difficile à contourner par accident.
//!
//! Les parties sont jouées depuis des ouvertures distinctes, parce que les deux
//! camps sont déterministes : depuis la même position de départ, la partie
//! serait toujours identique et l'échantillon serait de taille un.

#![expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]

use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use cozy_chess::{Board, Color, Move};
use shallowred::position::Position;
use shallowred::search::{Limits, Search, random_legal_move};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Outcome {
    EngineWin,
    EngineLoss,
    Draw,
}

/// Ouvertures courtes et variées, pour que chaque partie soit différente.
const OPENINGS: [&[&str]; 12] = [
    &[],
    &["e2e4", "e7e5"],
    &["d2d4", "d7d5"],
    &["c2c4", "e7e5"],
    &["g1f3", "g8f6"],
    &["e2e4", "c7c5"],
    &["d2d4", "g8f6", "c2c4", "e7e6"],
    &["e2e4", "e7e6", "d2d4", "d7d5"],
    &["e2e4", "c7c6", "d2d4", "d7d5"],
    &["g1f3", "d7d5", "g2g3", "g8f6"],
    &["b2b3", "e7e5"],
    &["f2f4", "d7d5"],
];

fn legal_moves(board: &Board) -> Vec<Move> {
    let mut moves = Vec::new();
    board.generate_moves(|piece_moves| {
        moves.extend(piece_moves);
        false
    });
    moves
}

/// Joue une partie entière, le moteur contre le tirage au sort.
fn play_game(opening: &[&str], engine_is_white: bool, depth: u32) -> Outcome {
    let mut position = Position::startpos();
    for token in opening {
        position.play_uci(token).unwrap();
    }

    let stop = Arc::new(AtomicBool::new(false));
    let limits = Limits {
        depth: Some(depth),
        ..Limits::default()
    };

    // Une partie qui n'aboutit pas en 300 demi-coups est comptée nulle : c'est
    // un échec du moteur à convertir, pas une victoire de l'adversaire.
    for _ in 0..300 {
        if legal_moves(position.board()).is_empty() {
            let side_to_move_is_engine =
                (position.board().side_to_move() == Color::White) == engine_is_white;
            return if position.board().checkers().is_empty() {
                Outcome::Draw // pat
            } else if side_to_move_is_engine {
                Outcome::EngineLoss
            } else {
                Outcome::EngineWin
            };
        }
        if position.is_fifty_move_draw() || position.repetition_count() >= 2 {
            return Outcome::Draw;
        }

        let engine_turn = (position.board().side_to_move() == Color::White) == engine_is_white;
        let mv = if engine_turn {
            Search::new(Arc::clone(&stop))
                .go(&position, &limits, |_| {})
                .unwrap()
        } else {
            random_legal_move(position.board()).unwrap()
        };
        position.play(mv);
    }
    Outcome::Draw
}

/// Résultat d'un tournoi du moteur contre le tirage au sort.
struct Tally {
    wins: usize,
    draws: usize,
    /// Les parties perdues, décrites de façon à pouvoir les rejouer.
    losses: Vec<String>,
}

/// Joue les deux camps depuis chaque ouverture.
fn tournament(openings: &[&[&str]], depth: u32) -> Tally {
    let mut tally = Tally {
        wins: 0,
        draws: 0,
        losses: Vec::new(),
    };
    for opening in openings {
        for engine_is_white in [true, false] {
            match play_game(opening, engine_is_white, depth) {
                Outcome::EngineWin => tally.wins += 1,
                Outcome::Draw => tally.draws += 1,
                Outcome::EngineLoss => tally.losses.push(format!(
                    "{opening:?} (moteur aux {})",
                    if engine_is_white { "Blancs" } else { "Noirs" }
                )),
            }
        }
    }
    tally
}

#[test]
fn le_moteur_ne_perd_jamais_contre_le_tirage_au_sort() {
    let tally = tournament(&OPENINGS[..6], 3);
    assert!(
        tally.losses.is_empty(),
        "défaites contre le hasard : {:?}",
        tally.losses
    );
    assert!(
        tally.wins >= 10,
        "sur 12 parties : {} gains, {} nulles — la conversion est trop faible",
        tally.wins,
        tally.draws
    );
}

#[test]
#[ignore = "critère complet de C8 : long, exécuté explicitement"]
fn le_moteur_gagne_toutes_ses_parties_contre_le_tirage_au_sort() {
    let tally = tournament(&OPENINGS, 4);
    assert!(
        tally.losses.is_empty(),
        "aucune défaite n'est acceptable : {:?}",
        tally.losses
    );
    assert_eq!(
        tally.draws, 0,
        "{} gains, {} nulles — une nulle contre le hasard est un défaut de conversion",
        tally.wins, tally.draws
    );
}
