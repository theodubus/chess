//! Génère un livre d'ouvertures au format EPD.
//!
//! # Pourquoi un livre est indispensable
//!
//! ShallowRed est déterministe : depuis une même position il joue toujours le
//! même coup. Sans livre, toutes les parties d'un match seraient **la même
//! partie**, et l'échantillon serait de taille un quel que soit le nombre de
//! parties annoncé. Un livre de positions variées est donc une condition de
//! validité de la mesure, pas un agrément.
//!
//! # Pourquoi des positions équilibrées
//!
//! Une ouverture qui donne déjà un avantage décisif à un camp mesure
//! l'ouverture, pas les moteurs. Les positions sont donc filtrées sur
//! l'évaluation statique, et chacune sera jouée des deux côtés par l'arbitre,
//! ce qui annule le biais résiduel.
//!
//! # Reproductibilité
//!
//! Le tirage est seedé : même graine, même livre. Un livre régénéré
//! différemment invaliderait toute comparaison avec les mesures antérieures.
//!
//! ```text
//! bookgen <nombre> <demi-coups> <écart-max-cp> [graine]
//! ```

use std::collections::HashSet;
use std::process::ExitCode;

use cozy_chess::{Board, Move};
use shallowred::eval;

/// xorshift64*, déterministe et suffisant pour un tirage d'ouvertures.
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
    board.generate_moves(|piece_moves| {
        moves.extend(piece_moves);
        false
    });
    moves
}

/// Joue `plies` coups au hasard depuis la position initiale.
///
/// Renvoie `None` si la partie se termine avant — une position sans coup légal
/// ne peut pas servir d'ouverture.
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
    if legal_moves(&board).is_empty() {
        return None;
    }
    Some(board)
}

/// Les quatre premiers champs d'une FEN, c'est-à-dire une EPD.
///
/// Les compteurs de demi-coups et de coups n'ont pas de sens pour une position
/// de départ, et les arbitres les ignorent.
fn to_epd(board: &Board) -> String {
    board
        .to_string()
        .split_whitespace()
        .take(4)
        .collect::<Vec<_>>()
        .join(" ")
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let parse = |index: usize, default: u64| -> u64 {
        args.get(index)
            .and_then(|value| value.parse().ok())
            .unwrap_or(default)
    };

    let wanted = parse(0, 500) as usize;
    let plies = parse(1, 8) as u32;
    let max_cp = parse(2, 80) as i32;
    let mut state = parse(3, 0x5EED_1234_ABCD_0001) | 1;

    let mut seen = HashSet::new();
    let mut written = 0usize;
    // Borne dure : sans elle, des critères trop stricts feraient tourner la
    // boucle indéfiniment sans que rien ne le signale.
    let mut attempts = 0usize;
    let budget = wanted.saturating_mul(200).max(10_000);

    while written < wanted && attempts < budget {
        attempts += 1;
        let Some(board) = random_opening(plies, &mut state) else {
            continue;
        };
        // L'évaluation est du point de vue du trait ; sa valeur absolue mesure
        // donc le déséquilibre, quel que soit le camp favorisé.
        if eval::evaluate(&board, &eval::Params::DEFAULT).abs() > max_cp {
            continue;
        }
        if !seen.insert(board.hash()) {
            continue;
        }
        println!("{}", to_epd(&board));
        written += 1;
    }

    if written < wanted {
        eprintln!(
            "bookgen : {written} positions sur {wanted} demandées après {attempts} tentatives — \
             assouplir l'écart maximal ou réduire le nombre de demi-coups"
        );
        return ExitCode::FAILURE;
    }
    eprintln!("bookgen : {written} positions, {plies} demi-coups, écart ≤ {max_cp} cp");
    ExitCode::SUCCESS
}
