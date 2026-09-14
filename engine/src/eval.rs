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

use cozy_chess::{Board, Color, Piece, Square, get_bishop_moves, get_knight_moves, get_rook_moves};

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

/// Valeur d'une case accessible, par type de pièce, en milieu puis en finale.
///
/// Une pièce enfermée ne vaut pas une pièce active, et les tables piece-square
/// ne peuvent pas le dire : elles jugent la case, jamais ce que la pièce voit
/// depuis cette case. Deux cavaliers sur la même case dans deux positions
/// différentes reçoivent le même score alors que l'un peut être immobilisé.
///
/// La tour est mieux payée en finale, où les colonnes s'ouvrent et où sa
/// portée décide ; la dame l'est peu partout, sa mobilité brute étant déjà
/// énorme et peu informative. **Valeurs conventionnelles, non réglées** — à
/// améliorer par la mesure, comme le reste de ce fichier.
const MOBILITY: [(i32, i32); Piece::NUM] = [
    (0, 0), // pion : sa mobilité est structurelle, les tables la portent déjà
    (4, 4), // cavalier
    (3, 3), // fou
    (2, 4), // tour
    (1, 2), // dame
    (0, 0), // roi : actif en finale, vulnérable en milieu — terme à part
];

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

        let (mob_mg, mob_eg) = mobility(board, color);
        midgame += sign * mob_mg;
        endgame += sign * mob_eg;
    }

    // Les promotions peuvent faire dépasser le total initial ; on borne.
    let phase = phase.clamp(0, PHASE_TOTAL);
    (midgame * phase + endgame * (PHASE_TOTAL - phase)) / PHASE_TOTAL
}

/// Somme des cases accessibles à un camp, pondérée par type de pièce.
///
/// « Accessible » veut dire : atteint par le motif d'attaque de la pièce et non
/// occupé par une de nos propres pièces. Les cases défendues par l'adversaire
/// comptent donc, y compris celles où la pièce se ferait prendre. **C'est un
/// choix, pas un oubli** : ne compter que les cases sûres — en retirant celles
/// qu'un pion adverse attaque — est un raffinement classique et une seconde
/// question, à mesurer séparément pour que ce SPRT-ci ne mesure qu'une chose.
///
/// Le roi et les pions sont exclus : leurs poids sont nuls dans `MOBILITY`, et
/// la boucle les saute pour ne pas payer une génération d'attaques inutile.
fn mobility(board: &Board, color: Color) -> (i32, i32) {
    let occupied = board.occupied();
    let ours = board.colors(color);
    let mut midgame = 0;
    let mut endgame = 0;

    for piece in [Piece::Knight, Piece::Bishop, Piece::Rook, Piece::Queen] {
        let (weight_mg, weight_eg) = MOBILITY[piece as usize];
        for square in board.colored_pieces(color, piece) {
            let attacks = match piece {
                Piece::Knight => get_knight_moves(square),
                Piece::Bishop => get_bishop_moves(square, occupied),
                Piece::Rook => get_rook_moves(square, occupied),
                // La dame voit ce que verraient une tour et un fou réunis.
                _ => get_bishop_moves(square, occupied) | get_rook_moves(square, occupied),
            };
            let count = i32::try_from((attacks & !ours).len()).unwrap_or(0);
            midgame += weight_mg * count;
            endgame += weight_eg * count;
        }
    }

    (midgame, endgame)
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]
mod tests {
    use super::*;

    fn board(fen: &str) -> Board {
        fen.parse().unwrap()
    }

    /// Toutes les positions de ces tests sont validées par exécution avant
    /// d'être inscrites — une position dérivée de tête s'est révélée illégale
    /// trois fois sur ce projet. Voir le piège correspondant dans CLAUDE.md.
    #[test]
    fn une_piece_qui_voit_plus_de_cases_vaut_plus() {
        // Même matériel, même camp, seule la case change. Sans terme de
        // mobilité les deux positions seraient jugées identiques, puisque les
        // tables piece-square notent la case et jamais ce que la pièce y voit.
        let centre = mobility(&board("7k/8/8/8/3N4/8/8/K7 w - - 0 1"), Color::White);
        let coin = mobility(&board("7k/8/8/8/8/8/8/KN6 w - - 0 1"), Color::White);
        assert!(
            centre.0 > coin.0 && centre.1 > coin.1,
            "cavalier au centre {centre:?} contre cavalier au coin {coin:?}"
        );

        let ouverte = mobility(&board("7k/8/8/8/8/8/8/K3R3 w - - 0 1"), Color::White);
        let enfermee = mobility(&board("7k/8/8/8/8/8/PPP5/KR6 w - - 0 1"), Color::White);
        assert!(
            ouverte.0 > enfermee.0,
            "tour libre {ouverte:?} contre tour enfermée {enfermee:?}"
        );

        let fou = mobility(&board("7k/8/8/8/8/3B4/8/K7 w - - 0 1"), Color::White);
        assert!(
            fou.0 > 0,
            "un fou en pleine diagonale doit compter : {fou:?}"
        );
    }

    #[test]
    fn les_pions_et_le_roi_ne_comptent_pas_dans_la_mobilite() {
        // Leurs poids sont nuls et la boucle les saute : une position qui n'a
        // que des rois ne peut produire aucune mobilité. Si ce test tombe,
        // c'est qu'un terme s'est glissé là où il ne devrait pas.
        assert_eq!(
            mobility(&board("8/8/8/8/8/8/8/K6k w - - 0 1"), Color::White),
            (0, 0)
        );
        assert_eq!(
            mobility(
                &board("7k/pppppppp/8/8/8/8/PPPPPPPP/K7 w - - 0 1"),
                Color::White
            ),
            (0, 0)
        );
    }

    #[test]
    fn la_mobilite_se_compte_pour_les_deux_camps() {
        // Position initiale : parfaitement symétrique, donc les deux camps
        // doivent obtenir exactement la même mobilité — et elle doit être non
        // nulle, sans quoi le terme ne ferait rien du tout.
        let b = Board::default();
        let blancs = mobility(&b, Color::White);
        let noirs = mobility(&b, Color::Black);
        assert_eq!(blancs, noirs);
        assert!(blancs.0 > 0, "les cavaliers initiaux voient des cases");
    }

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
