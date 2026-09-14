//! Benchmark obligatoire de B4, imposé par Théo le 13 sept. 2026.
//!
//! Deux questions, une seule réponse attendue : en pourcentage du temps de
//! recherche, que coûtent (a) le copy-make et (b) le calcul du delta
//! d'accumulateur NNUE à l'extérieur du `play_unchecked` opaque de cozy-chess ?
//!
//! Méthode : mesure différentielle. On ajoute au nœud un travail supplémentaire
//! identique à celui qu'on veut chiffrer, protégé par `black_box` pour que
//! l'optimiseur ne l'efface pas, et l'on lit le ralentissement. C'est plus
//! honnête qu'un micro-benchmark en boucle serrée, dont la localité de cache
//! n'a rien à voir avec celle d'une vraie recherche.
#![expect(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "outil de mesure : une entrée fausse doit échouer bruyamment"
)]

use std::hint::black_box;
use std::time::Instant;

use cozy_chess::{Board, Color, Move, Piece, Square};

/// Une modification élémentaire de l'accumulateur : une pièce apparaît ou
/// disparaît d'une case. NNUE n'a besoin de rien d'autre — l'accumulateur est
/// une somme de contributions par (pièce, couleur, case).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Change {
    /// `true` si la pièce apparaît, `false` si elle disparaît.
    pub added: bool,
    /// Le type de pièce concerné — après promotion le cas échéant.
    pub piece: Piece,
    /// Le camp propriétaire de la pièce.
    pub color: Color,
    /// La case où la pièce apparaît ou disparaît.
    pub square: Square,
}

impl Change {
    /// Clé de tri : les types de cozy-chess n'implémentent pas `Ord`, et l'on
    /// ne compare que pour rendre deux listes comparables.
    fn key(self) -> (bool, usize, usize, usize) {
        (
            self.added,
            self.piece as usize,
            self.color as usize,
            self.square as usize,
        )
    }
}

/// Dérive du plateau parent et du coup les modifications de l'accumulateur,
/// SANS jouer le coup et sans rien demander à `play_unchecked`.
///
/// C'est le point que B4 devait trancher : tout est dérivable de l'extérieur.
/// Au plus quatre modifications — le roque en fait quatre, la promotion avec
/// capture trois.
pub fn accumulator_delta(board: &Board, mv: Move, out: &mut [Change; 4]) -> usize {
    let us = board.side_to_move();
    let them = !us;
    let mut n = 0usize;
    let mut push = |c: Change, n: &mut usize| {
        out[*n] = c;
        *n += 1;
    };

    let moving = board.piece_on(mv.from).expect("case de départ vide");

    // Roque : cozy-chess emploie la notation roi-prend-tour, donc la case
    // d'arrivée porte NOTRE tour. Roi et tour se déplacent tous les deux, vers
    // des cases fixées par le côté du roque et non par le coup.
    if moving == Piece::King && board.colors(us).has(mv.to) {
        let rank = mv.from.rank();
        let short = mv.to.file() > mv.from.file();
        let (king_to, rook_to) = if short {
            (
                Square::new(cozy_chess::File::G, rank),
                Square::new(cozy_chess::File::F, rank),
            )
        } else {
            (
                Square::new(cozy_chess::File::C, rank),
                Square::new(cozy_chess::File::D, rank),
            )
        };
        push(
            Change {
                added: false,
                piece: Piece::King,
                color: us,
                square: mv.from,
            },
            &mut n,
        );
        push(
            Change {
                added: false,
                piece: Piece::Rook,
                color: us,
                square: mv.to,
            },
            &mut n,
        );
        push(
            Change {
                added: true,
                piece: Piece::King,
                color: us,
                square: king_to,
            },
            &mut n,
        );
        push(
            Change {
                added: true,
                piece: Piece::Rook,
                color: us,
                square: rook_to,
            },
            &mut n,
        );
        return n;
    }

    // La pièce quitte sa case de départ.
    push(
        Change {
            added: false,
            piece: moving,
            color: us,
            square: mv.from,
        },
        &mut n,
    );

    // Capture ordinaire : la case d'arrivée porte une pièce adverse.
    if let Some(taken) = board.piece_on(mv.to) {
        push(
            Change {
                added: false,
                piece: taken,
                color: them,
                square: mv.to,
            },
            &mut n,
        );
    } else if moving == Piece::Pawn && mv.from.file() != mv.to.file() {
        // Prise en passant : la case d'arrivée est vide, le pion capturé se
        // trouve sur la rangée de départ du pion qui capture.
        let captured = Square::new(mv.to.file(), mv.from.rank());
        push(
            Change {
                added: false,
                piece: Piece::Pawn,
                color: them,
                square: captured,
            },
            &mut n,
        );
    }

    // La pièce arrive — promue le cas échéant.
    push(
        Change {
            added: true,
            piece: mv.promotion.unwrap_or(moving),
            color: us,
            square: mv.to,
        },
        &mut n,
    );

    n
}

/// Valeur de remplissage : jamais lue au-delà du compte rendu.
const BLANK: Change = Change {
    added: false,
    piece: Piece::Pawn,
    color: Color::White,
    square: Square::A1,
};

/// Vérité terrain : la différence réelle entre deux plateaux, lue case par case.
fn true_delta(before: &Board, after: &Board) -> Vec<Change> {
    let mut out = Vec::new();
    for square in Square::ALL {
        let b = before
            .piece_on(square)
            .map(|p| (p, piece_color(before, square)));
        let a = after
            .piece_on(square)
            .map(|p| (p, piece_color(after, square)));
        if a == b {
            continue;
        }
        if let Some((piece, color)) = b {
            out.push(Change {
                added: false,
                piece,
                color,
                square,
            });
        }
        if let Some((piece, color)) = a {
            out.push(Change {
                added: true,
                piece,
                color,
                square,
            });
        }
    }
    out
}

fn piece_color(board: &Board, square: Square) -> Color {
    if board.colors(Color::White).has(square) {
        Color::White
    } else {
        Color::Black
    }
}

/// Parcourt l'arbre, en appliquant `extra` fois le travail supplémentaire.
fn walk(board: &Board, depth: u32, mode: Mode, nodes: &mut u64) {
    if depth == 0 {
        return;
    }
    let mut moves = Vec::with_capacity(48);
    board.generate_moves(|set| {
        moves.extend(set);
        false
    });
    for mv in moves {
        *nodes += 1;
        let mut child = board.clone();
        child.play_unchecked(mv);

        match mode {
            Mode::Baseline => {}
            Mode::ExtraCopyMake => {
                let mut dup = board.clone();
                dup.play_unchecked(mv);
                black_box(&dup);
            }
            Mode::Delta => {
                let mut buf = [BLANK; 4];
                let n = accumulator_delta(board, mv, &mut buf);
                black_box((&buf, n));
            }
        }

        walk(&child, depth - 1, mode, nodes);
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    Baseline,
    ExtraCopyMake,
    Delta,
}

const FENS: &[&str] = &[
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
    "rnbq1rk1/pp2ppbp/2pp1np1/8/2PPP3/2N2N2/PP2BPPP/R1BQ1RK1 w - - 0 1",
];

/// Positions choisies pour la VÉRIFICATION seule : elles forcent les cas que
/// les positions de mesure ne rencontrent jamais. Sans elles, la promotion
/// n'était pas testée du tout — 0 sur 244 112 coups.
/// Les trois sont VALIDÉES PAR EXÉCUTION (python-chess : `is_valid()`, puis
/// comptage des coups de promotion). Une quatrième, écrite de tête, s'est
/// révélée illégale — voir le piège correspondant dans `CLAUDE.md`.
const VERIFY_EXTRA: &[&str] = &[
    // 12 promotions immédiates, dont des promotions AVEC capture.
    "n1n5/PPPk4/8/8/8/8/4Kppp/5N1N b - - 0 1",
    // Finale de pions pure : 8 promotions, aucune pièce.
    "8/2P1P3/3K4/8/8/3k4/3p1p2/8 w - - 0 1",
    // 16 promotions et des droits de roque des deux côtés.
    "r3k2r/pP4P1/8/8/8/8/1p4p1/R3K2R w KQkq - 0 1",
];

fn main() {
    // ---- 1. La dérivation est-elle correcte ? Vérité terrain, pas argument.
    let mut checked = 0u64;
    let mut castles = 0u64;
    let mut eps = 0u64;
    let mut promos = 0u64;
    for fen in FENS.iter().chain(VERIFY_EXTRA) {
        let root: Board = fen.parse().unwrap();
        verify(&root, 3, &mut checked, &mut castles, &mut eps, &mut promos);
    }
    println!("== Correction de la dérivation ==");
    println!("  coups vérifiés contre la vérité terrain : {checked}");
    println!("  dont roques {castles}, prises en passant {eps}, promotions {promos}");
    println!("  AUCUN ÉCART (sinon le programme aurait paniqué)");
    println!();

    // ---- 2. Combien coûte chaque chose, en situation.
    println!("== Coût en situation, mesure différentielle ==");
    let depth = 5;
    let mut results = Vec::new();
    for (label, mode) in [
        ("référence", Mode::Baseline),
        ("+ un copy-make de plus", Mode::ExtraCopyMake),
        ("+ calcul du delta NNUE", Mode::Delta),
    ] {
        // Trois passes, on garde la plus rapide : le bruit d'ordonnancement
        // gonfle toujours, il ne raccourcit jamais.
        let mut best = f64::MAX;
        let mut nodes = 0;
        for _ in 0..3 {
            let mut n = 0u64;
            let start = Instant::now();
            for fen in FENS {
                let root: Board = fen.parse().unwrap();
                walk(&root, depth, mode, &mut n);
            }
            best = best.min(start.elapsed().as_secs_f64());
            nodes = n;
        }
        println!(
            "  {label:24} {best:7.3} s   {nodes} nœuds   {:.1} ns/nœud",
            1e9 * best / nodes as f64
        );
        results.push(best);
    }
    println!();
    let base = results[0];
    println!(
        "  coût marginal d'UN copy-make : {:+.1} % du temps de parcours",
        100.0 * (results[1] - base) / base
    );
    println!(
        "  coût du delta NNUE           : {:+.1} % du temps de parcours",
        100.0 * (results[2] - base) / base
    );
}

fn verify(
    board: &Board,
    depth: u32,
    checked: &mut u64,
    castles: &mut u64,
    eps: &mut u64,
    promos: &mut u64,
) {
    if depth == 0 {
        return;
    }
    let mut moves = Vec::new();
    board.generate_moves(|set| {
        moves.extend(set);
        false
    });
    for mv in moves {
        let mut child = board.clone();
        child.play_unchecked(mv);

        let moving = board.piece_on(mv.from).unwrap();
        if moving == Piece::King && board.colors(board.side_to_move()).has(mv.to) {
            *castles += 1;
        }
        if moving == Piece::Pawn
            && mv.from.file() != mv.to.file()
            && board.piece_on(mv.to).is_none()
        {
            *eps += 1;
        }
        if mv.promotion.is_some() {
            *promos += 1;
        }

        let mut buf = [BLANK; 4];
        let n = accumulator_delta(board, mv, &mut buf);
        let mut derived = buf[..n].to_vec();
        let mut truth = true_delta(board, &child);
        derived.sort_by_key(|c| c.key());
        truth.sort_by_key(|c| c.key());
        assert_eq!(derived, truth, "delta faux sur {} depuis {board}", mv);
        *checked += 1;

        verify(&child, depth - 1, checked, castles, eps, promos);
    }
}
