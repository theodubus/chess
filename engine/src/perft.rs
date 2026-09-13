//! Perft — énumération exhaustive de l'arbre de coups à profondeur fixe.
//!
//! Perft est le seul composant du moteur dont la correction se **prouve**
//! exactement : un seul coup généré en trop ou en moins, n'importe où, et le
//! total est faux. Tout le reste (évaluation, élagages) ne se juge que
//! statistiquement.
//!
//! Les valeurs de référence vivent dans `engine/tests/perft.rs`.

use cozy_chess::{Board, Move};

/// Compte les nœuds de l'arbre de coups légaux à `depth` demi-coups.
///
/// Emploie le comptage en vrac : à la dernière profondeur, les coups sont
/// comptés sans être joués, ce qui évite un `make` par feuille.
#[must_use]
pub fn perft(board: &Board, depth: u32) -> u64 {
    match depth {
        0 => 1,
        1 => {
            let mut nodes = 0;
            board.generate_moves(|moves| {
                nodes += moves.len() as u64;
                false
            });
            nodes
        }
        _ => {
            let mut nodes = 0;
            board.generate_moves(|moves| {
                for mv in moves {
                    let mut child = board.clone();
                    child.play_unchecked(mv);
                    nodes += perft(&child, depth - 1);
                }
                false
            });
            nodes
        }
    }
}

/// Perft ventilé par coup à la racine, ordonné comme la génération les produit.
///
/// C'est l'outil de diagnostic à employer quand un total perft diverge : on
/// compare coup par coup avec une implémentation de référence et on descend
/// dans la branche fautive. Trois ou quatre niveaux suffisent toujours à
/// isoler le coup en cause.
#[must_use]
pub fn divide(board: &Board, depth: u32) -> Vec<(Move, u64)> {
    if depth == 0 {
        return Vec::new();
    }
    let mut out = Vec::new();
    board.generate_moves(|moves| {
        for mv in moves {
            let mut child = board.clone();
            child.play_unchecked(mv);
            out.push((mv, perft(&child, depth - 1)));
        }
        false
    });
    out
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "les tests doivent échouer bruyamment")]
mod tests {
    use super::*;

    #[test]
    fn perft_zero_compte_la_position_elle_meme() {
        assert_eq!(perft(&Board::default(), 0), 1);
    }

    #[test]
    fn divide_somme_au_total() {
        let board = Board::default();
        let total: u64 = divide(&board, 3).iter().map(|(_, n)| n).sum();
        assert_eq!(total, perft(&board, 3));
        assert_eq!(total, 8_902);
    }

    #[test]
    fn divide_produit_un_coup_par_coup_legal() {
        let board: Board = "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1".parse().unwrap();
        assert_eq!(divide(&board, 1).len(), 14);
    }
}
