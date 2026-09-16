//! Émet, pour chaque FEN lue sur l'entrée, les cases attaquées par chaque camp.
//!
//! Confronte la **seule géométrie d'attaque du moteur** —
//! `see::least_valuable_attacker` — à `python-chess`. « Cette case est-elle
//! attaquée par ce camp ? » revient à demander si cette fonction trouve un
//! agresseur.
//!
//! Le retournement du masque de pion (« un pion de `by` attaque `square` s'il
//! occupe une case d'où un pion de la couleur OPPOSÉE capturerait ») est
//! exactement le genre de ligne qu'on écrit à l'envers sans que rien ne le
//! signale. Le projet a payé cinq fois pour avoir dérivé de la géométrie de
//! tête ; celle-ci se confronte.
//!
//! Sortie : `fen|masque_blancs|masque_noirs`, en hexadécimal, bit `i` valant
//! « la case d'indice `i` est attaquée par ce camp ».
use std::io::BufRead;

use cozy_chess::{Board, Color, Square};
use shallowred::see::least_valuable_attacker;

fn masque(board: &Board, by: Color) -> u64 {
    let occupied = board.occupied();
    let mut bits = 0u64;
    for index in 0..64u8 {
        let Some(square) = Square::try_index(index as usize) else {
            continue;
        };
        if least_valuable_attacker(board, square, by, occupied).is_some() {
            bits |= 1u64 << index;
        }
    }
    bits
}

fn main() {
    let stdin = std::io::stdin();
    for line in stdin.lock().lines().map_while(Result::ok) {
        let fen = line.split(';').next().unwrap_or("").trim();
        if fen.is_empty() {
            continue;
        }
        let Ok(board) = fen.parse::<Board>() else {
            continue;
        };
        println!(
            "{fen}|{:016x}|{:016x}",
            masque(&board, Color::White),
            masque(&board, Color::Black)
        );
    }
}
