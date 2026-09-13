//! Critères d'acceptation de la génération de coups.
//!
//! Les valeurs ci-dessous sont les références publiées, **vérifiées deux fois
//! indépendamment** avant d'être inscrites ici : par `python-chess` 1.10.0
//! jusqu'aux profondeurs 4-5, puis par `cozy-chess` jusqu'aux profondeurs 5-6.
//! Aucune n'a été recopiée sans exécution.
//!
//! Un seul coup généré en trop ou en moins, n'importe où dans l'arbre, et le
//! total est faux. C'est la seule façon connue de prouver un générateur.
//!
//! Le test profond est marqué `#[ignore]` : il demande un build `--release`.
//! La CI l'exécute explicitement.

#![expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]

use chess_engine::perft::perft;
use cozy_chess::Board;

/// Nom, FEN, puis les totaux perft pour les profondeurs 1, 2, 3, ...
struct Reference {
    name: &'static str,
    fen: &'static str,
    nodes: &'static [u64],
}

const REFERENCES: [Reference; 6] = [
    Reference {
        name: "initiale",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        nodes: &[20, 400, 8_902, 197_281, 4_865_609, 119_060_324],
    },
    Reference {
        // Roques intacts des deux côtés, position dense, captures et clouages.
        name: "kiwipete",
        fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
        nodes: &[48, 2_039, 97_862, 4_085_603, 193_690_690],
    },
    Reference {
        // Finale tours et pions : le motif de la prise en passant qui découvre
        // un échec sur la rangée. C'est ce cas qui cassait le moteur de 2022.
        name: "position3",
        fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
        nodes: &[14, 191, 2_812, 43_238, 674_624, 11_030_083],
    },
    Reference {
        // Deux pions à un coup de la promotion, roques partiels : promotions
        // avec capture.
        name: "position4",
        fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
        nodes: &[6, 264, 9_467, 422_333, 15_833_292],
    },
    Reference {
        // Promotion et roque combinés, cavalier infiltré en f2.
        name: "position5",
        fen: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
        nodes: &[44, 1_486, 62_379, 2_103_487, 89_941_194],
    },
    Reference {
        // Milieu de partie dense, les deux camps ont roqué : le cas général.
        name: "position6",
        fen: "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
        nodes: &[46, 2_079, 89_890, 3_894_594, 164_075_551],
    },
];

/// Vérifie chaque référence jusqu'à `max_depth` inclus.
fn check(max_depth: usize) {
    for reference in &REFERENCES {
        let board: Board = reference.fen.parse().unwrap();
        for (index, &expected) in reference.nodes.iter().take(max_depth).enumerate() {
            let depth = index as u32 + 1;
            assert_eq!(
                perft(&board, depth),
                expected,
                "{} à la profondeur {depth}",
                reference.name
            );
        }
    }
}

#[test]
fn aller_retour_fen_exact_sur_les_six_positions() {
    for reference in &REFERENCES {
        let board: Board = reference.fen.parse().unwrap();
        assert_eq!(board.to_string(), reference.fen, "{}", reference.name);
    }
}

#[test]
fn perft_de_reference_faible_profondeur() {
    check(3);
}

#[test]
#[ignore = "demande un build --release ; exécuté explicitement par la CI"]
fn perft_de_reference_profondeur_complete() {
    check(usize::MAX);
}
