//! Évaluation statique d'une position.
//!
//! # Ce que vaut cette évaluation
//!
//! Matériel, tables piece-square, et paire de fous, le tout interpolé entre
//! milieu de partie et finale selon le matériel restant.
//!
//! <div class="warning">
//!
//! **Ces valeurs ne sont pas réglées.** Ce sont des valeurs conventionnelles,
//! choisies pour être saines et non pour être optimales. Toute modification
//! doit être validée par SPRT contre la version précédente — une impression
//! n'est pas une mesure.
//!
//! </div>
//!
//! # Pourquoi une évaluation interpolée
//!
//! Un roi doit rester à l'abri en milieu de partie et se centraliser en finale ;
//! un pion vaut nettement plus quand il approche de la promotion. Une table
//! unique ne peut pas exprimer les deux. On calcule donc deux scores et on les
//! mélange selon la phase de jeu.

use cozy_chess::{Board, Color, Piece, Square};

/// Score attribué à un mat. Suffisamment grand pour dominer tout matériel,
/// suffisamment petit pour qu'aucune addition ne déborde un `i32`.
pub const MATE: i32 = 30_000;

/// Au-delà de ce seuil, un score encode un mat et non une évaluation.
///
/// Un mat annoncé est toujours `±(MATE - ply)` avec `ply` borné par la
/// profondeur maximale, donc un score dépassant ce seuil ne peut pas venir
/// d'un décompte de matériel.
pub const MATE_THRESHOLD: i32 = MATE - 1_000;

/// Score d'une position nulle.
pub const DRAW: i32 = 0;

/// Borne d'initialisation. `i32::MIN + 1` et non `i32::MIN`, pour que la
/// négation employée par le negamax ne déborde pas.
pub const INFINITY: i32 = i32::MAX - 1;

/// Valeur du matériel en milieu de partie, indexée par [`Piece`].
const MG_VALUE: [i32; Piece::NUM] = [100, 320, 335, 500, 980, 0];
/// Valeur du matériel en finale : les pions montent, les cavaliers baissent.
const EG_VALUE: [i32; Piece::NUM] = [130, 310, 340, 540, 1000, 0];

/// Poids de chaque pièce dans le calcul de la phase de jeu.
const PHASE_WEIGHT: [i32; Piece::NUM] = [0, 1, 1, 2, 4, 0];
/// Somme des poids en position initiale : 4 cavaliers, 4 fous, 4 tours, 2 dames.
const PHASE_TOTAL: i32 = 24;

/// Bonus de la paire de fous, en milieu de partie puis en finale.
const BISHOP_PAIR: (i32, i32) = (30, 45);

// Les tables ci-dessous sont écrites du point de vue des Blancs, dans l'ordre
// visuel d'un échiquier : la première ligne est la 8e rangée, la dernière est
// la 1re. C'est délibéré — une table écrite dans l'ordre des indices de case
// est illisible et donc invérifiable.

#[rustfmt::skip]
const PAWN_MG: [i32; 64] = [
     0,   0,   0,   0,   0,   0,   0,   0,
    50,  50,  50,  50,  50,  50,  50,  50,
    10,  10,  20,  30,  30,  20,  10,  10,
     5,   5,  10,  25,  25,  10,   5,   5,
     0,   0,   0,  20,  20,   0,   0,   0,
     5,  -5, -10,   0,   0, -10,  -5,   5,
     5,  10,  10, -20, -20,  10,  10,   5,
     0,   0,   0,   0,   0,   0,   0,   0,
];

#[rustfmt::skip]
const PAWN_EG: [i32; 64] = [
     0,   0,   0,   0,   0,   0,   0,   0,
    90,  90,  90,  90,  90,  90,  90,  90,
    55,  55,  55,  55,  55,  55,  55,  55,
    30,  30,  30,  30,  30,  30,  30,  30,
    20,  20,  20,  20,  20,  20,  20,  20,
    10,  10,  10,  10,  10,  10,  10,  10,
     5,   5,   5,   5,   5,   5,   5,   5,
     0,   0,   0,   0,   0,   0,   0,   0,
];

#[rustfmt::skip]
const KNIGHT: [i32; 64] = [
   -50, -40, -30, -30, -30, -30, -40, -50,
   -40, -20,   0,   0,   0,   0, -20, -40,
   -30,   0,  10,  15,  15,  10,   0, -30,
   -30,   5,  15,  20,  20,  15,   5, -30,
   -30,   0,  15,  20,  20,  15,   0, -30,
   -30,   5,  10,  15,  15,  10,   5, -30,
   -40, -20,   0,   5,   5,   0, -20, -40,
   -50, -40, -30, -30, -30, -30, -40, -50,
];

#[rustfmt::skip]
const BISHOP: [i32; 64] = [
   -20, -10, -10, -10, -10, -10, -10, -20,
   -10,   0,   0,   0,   0,   0,   0, -10,
   -10,   0,   5,  10,  10,   5,   0, -10,
   -10,   5,   5,  10,  10,   5,   5, -10,
   -10,   0,  10,  10,  10,  10,   0, -10,
   -10,  10,  10,  10,  10,  10,  10, -10,
   -10,   5,   0,   0,   0,   0,   5, -10,
   -20, -10, -10, -10, -10, -10, -10, -20,
];

#[rustfmt::skip]
const ROOK: [i32; 64] = [
     0,   0,   0,   0,   0,   0,   0,   0,
     5,  10,  10,  10,  10,  10,  10,   5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
     0,   0,   0,   5,   5,   5,   0,   0,
];

#[rustfmt::skip]
const QUEEN: [i32; 64] = [
   -20, -10, -10,  -5,  -5, -10, -10, -20,
   -10,   0,   0,   0,   0,   0,   0, -10,
   -10,   0,   5,   5,   5,   5,   0, -10,
    -5,   0,   5,   5,   5,   5,   0,  -5,
     0,   0,   5,   5,   5,   5,   0,  -5,
   -10,   5,   5,   5,   5,   5,   0, -10,
   -10,   0,   5,   0,   0,   0,   0, -10,
   -20, -10, -10,  -5,  -5, -10, -10, -20,
];

/// Roi en milieu de partie : rester derrière ses pions, roquer.
#[rustfmt::skip]
const KING_MG: [i32; 64] = [
   -30, -40, -40, -50, -50, -40, -40, -30,
   -30, -40, -40, -50, -50, -40, -40, -30,
   -30, -40, -40, -50, -50, -40, -40, -30,
   -30, -40, -40, -50, -50, -40, -40, -30,
   -20, -30, -30, -40, -40, -30, -30, -20,
   -10, -20, -20, -20, -20, -20, -20, -10,
    20,  20,   0,   0,   0,   0,  20,  20,
    20,  30,  10,   0,   0,  10,  30,  20,
];

/// Roi en finale : se centraliser, c'est une pièce active.
#[rustfmt::skip]
const KING_EG: [i32; 64] = [
   -50, -40, -30, -20, -20, -30, -40, -50,
   -30, -20, -10,   0,   0, -10, -20, -30,
   -30, -10,  20,  30,  30,  20, -10, -30,
   -30, -10,  30,  40,  40,  30, -10, -30,
   -30, -10,  30,  40,  40,  30, -10, -30,
   -30, -10,  20,  30,  30,  20, -10, -30,
   -30, -30,   0,   0,   0,   0, -30, -30,
   -50, -30, -30, -30, -30, -30, -30, -50,
];

const PST_MG: [&[i32; 64]; Piece::NUM] = [&PAWN_MG, &KNIGHT, &BISHOP, &ROOK, &QUEEN, &KING_MG];
const PST_EG: [&[i32; 64]; Piece::NUM] = [&PAWN_EG, &KNIGHT, &BISHOP, &ROOK, &QUEEN, &KING_EG];

/// Indice d'une case dans une table écrite en ordre visuel.
///
/// Pour les Blancs, la 1re rangée est la dernière ligne de la table ; pour les
/// Noirs, la table est retournée, ce qui rend les valeurs symétriques sans les
/// dupliquer.
fn pst_index(square: Square, color: Color) -> usize {
    let file = square.file() as usize;
    let rank = square.rank() as usize;
    let row = match color {
        Color::White => 7 - rank,
        Color::Black => rank,
    };
    row * 8 + file
}

/// Évalue la position **du point de vue du camp au trait**, en centièmes de pion.
///
/// Un score positif signifie que le camp au trait est mieux. C'est la
/// convention qu'impose le negamax : inverser le signe à chaque niveau suffit
/// alors à alterner les points de vue.
#[must_use]
pub fn evaluate(board: &Board) -> i32 {
    let mut midgame = 0;
    let mut endgame = 0;
    let mut phase = 0;

    for color in Color::ALL {
        let sign = if color == board.side_to_move() { 1 } else { -1 };

        for piece in Piece::ALL {
            let pieces = board.colored_pieces(color, piece);
            phase += PHASE_WEIGHT[piece as usize] * pieces.len() as i32;

            for square in pieces {
                let index = pst_index(square, color);
                midgame += sign * (MG_VALUE[piece as usize] + PST_MG[piece as usize][index]);
                endgame += sign * (EG_VALUE[piece as usize] + PST_EG[piece as usize][index]);
            }
        }

        // Deux fous couvrent les deux couleurs de cases : l'avantage est réel
        // et conventionnellement reconnu, surtout en position ouverte.
        if board.colored_pieces(color, Piece::Bishop).len() >= 2 {
            midgame += sign * BISHOP_PAIR.0;
            endgame += sign * BISHOP_PAIR.1;
        }
    }

    // Les promotions peuvent faire dépasser le total initial ; on borne.
    let phase = phase.clamp(0, PHASE_TOTAL);
    (midgame * phase + endgame * (PHASE_TOTAL - phase)) / PHASE_TOTAL
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]
mod tests {
    use super::*;

    #[test]
    fn la_position_initiale_est_equilibree() {
        assert_eq!(evaluate(&Board::default()), 0);
    }

    #[test]
    fn levaluation_est_symetrique_par_couleur() {
        // Même position, trait inversé : le score doit être opposé.
        let blancs: Board = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
            .parse()
            .unwrap();
        let noirs: Board = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"
            .parse()
            .unwrap();
        assert_eq!(evaluate(&blancs), -evaluate(&noirs));
    }

    #[test]
    fn une_dame_de_plus_vaut_environ_une_dame() {
        // Blancs sans dame contre Noirs complets, trait aux Noirs.
        let board: Board = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1"
            .parse()
            .unwrap();
        let score = evaluate(&board);
        assert!(
            (900..=1100).contains(&score),
            "une dame devrait valoir environ 1000, obtenu {score}"
        );
    }

    #[test]
    fn le_roi_se_centralise_en_finale() {
        // Rois seuls avec un pion : phase nulle, donc table de finale.
        let centre: Board = "8/8/8/3K4/8/8/4P3/7k w - - 0 1".parse().unwrap();
        let coin: Board = "8/8/8/8/8/8/4P3/K6k w - - 0 1".parse().unwrap();
        assert!(
            evaluate(&centre) > evaluate(&coin),
            "le roi centralisé doit être mieux noté en finale"
        );
    }

    #[test]
    fn la_paire_de_fous_est_un_avantage() {
        let paire: Board = "4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1".parse().unwrap();
        let fou_et_cavalier: Board = "4k3/8/8/8/8/8/8/2B1KN2 w - - 0 1".parse().unwrap();
        assert!(evaluate(&paire) > evaluate(&fou_et_cavalier));
    }

    #[test]
    fn lindice_de_table_est_bien_mirore() {
        // e1 vue par les Blancs et e8 vue par les Noirs doivent donner le même
        // indice : c'est ce qui rend les tables symétriques.
        assert_eq!(
            pst_index(Square::E1, Color::White),
            pst_index(Square::E8, Color::Black)
        );
        assert_eq!(
            pst_index(Square::A2, Color::White),
            pst_index(Square::A7, Color::Black)
        );
        // La 1re rangée des Blancs est la dernière ligne de la table.
        assert_eq!(pst_index(Square::A1, Color::White), 56);
        assert_eq!(pst_index(Square::A8, Color::White), 0);
    }

    #[test]
    fn toutes_les_tables_sont_completes() {
        for table in PST_MG.iter().chain(PST_EG.iter()) {
            assert_eq!(table.len(), 64);
        }
    }
}
