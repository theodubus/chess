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

use cozy_chess::{
    BitBoard, Board, Color, Piece, Square, get_bishop_moves, get_king_moves, get_knight_moves,
    get_rook_moves,
};

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
/// Prime d'un pion passé, indexée par sa rangée vue de son propre camp.
///
/// Un pion passé n'a plus aucun pion adverse devant lui, ni sur sa colonne ni
/// sur les adjacentes : rien ne peut l'arrêter sans le secours d'une pièce.
/// La prime croît fortement avec l'avancement, parce que le coût de l'arrêter
/// croît de même — et **elle est bien plus forte en finale**, où il reste peu
/// de pièces pour s'en charger et où la promotion décide.
///
/// L'indice 0 est la rangée de départ, où un pion ne peut pas être passé au
/// sens utile ; l'indice 6 est l'avant-dernière rangée, à un coup de la dame.
///
/// **Valeurs conventionnelles, et elles le restent.** L'ajustement Texel du
/// 14 sept. 2026 a produit d'autres valeurs, qui prédisaient le résultat des
/// parties 7,8 % mieux sur des données tenues à l'écart — et qui jouaient
/// 25 Elo plus mal, mesuré par SPRT. Ne pas les rouvrir sans un corpus
/// nettement plus grand ni contrainte de structure. Voir `tools/README.md`.
const PASSED_MG: [i32; 8] = [0, 5, 10, 20, 35, 60, 100, 0];
const PASSED_EG: [i32; 8] = [0, 10, 20, 40, 70, 120, 180, 0];
/// Pénalité d'un pion doublé, comptée une fois par pion excédentaire.
///
/// Deux pions sur la même colonne se gênent : celui de derrière ne peut ni
/// avancer ni défendre, et la colonne perd un défenseur latéral. Plus lourd
/// en finale, où un pion immobilisé ne vaut presque rien.
const DOUBLED_PAWN: (i32, i32) = (-10, -20);
/// Pénalité d'un pion isolé : aucun pion ami sur les colonnes adjacentes.
///
/// Il ne pourra jamais être défendu par un pion, donc sa défense mobilise une
/// pièce, et la case devant lui devient un avant-poste pour l'adversaire.
const ISOLATED_PAWN: (i32, i32) = (-12, -15);
/// Prime d'une tour sur une colonne sans aucun pion, puis sans pion ami.
///
/// Une tour vaut par sa portée, et une colonne ouverte est ce qui la lui
/// donne. La colonne semi-ouverte — plus de pion à nous, mais un pion adverse
/// — vaut moins : la tour y voit loin mais bute sur une cible défendable.
const ROOK_OPEN_FILE: (i32, i32) = (20, 10);
const ROOK_SEMI_OPEN_FILE: (i32, i32) = (10, 5);
/// Poids d'attaque d'une pièce visant la zone du roi adverse.
///
/// Une pièce compte une fois si l'une de ses attaques tombe dans la zone,
/// quel que soit le nombre de cases visées : ce qui décide d'une attaque de
/// roi est le nombre d'assaillants, pas la surface couverte. La dame pèse
/// autant qu'une tour et un cavalier réunis parce qu'elle attaque seule sur
/// les deux axes et qu'aucune parade unique ne la neutralise.
///
/// Valeurs conventionnelles, non réglées.
const KING_ATTACK_WEIGHT: [i32; Piece::NUM] = [
    0, // pion : son attaque du roi est structurelle, pas une pièce d'assaut
    2, // cavalier
    2, // fou
    3, // tour
    5, // dame
    0, // roi : il n'attaque pas l'autre roi, la règle l'interdit
];
/// Diviseur de la mise à l'échelle non linéaire du danger.
///
/// Le danger vaut `poids² / KING_DANGER_SCALE`. **La non-linéarité est le
/// cœur du terme, pas un détail de réglage** : un attaquant isolé ne menace
/// rien et doit valoir presque zéro, tandis que quatre pièces convergentes
/// décident souvent la partie. Une somme linéaire donnerait au premier
/// attaquant le quart de ce que valent les quatre, ce qui est faux.
const KING_DANGER_SCALE: i32 = 4;
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

/// Tous les nombres que l'évaluation consulte, réunis en un seul endroit.
///
/// **Pourquoi une structure et non des constantes.** Il y en a environ 830, et
/// les régler un par un au SPRT est hors d'atteinte : c'est le travail d'un
/// ajustement Texel, qui doit pouvoir les modifier à l'exécution. Les
/// constantes ci-dessus restent la source des valeurs par défaut — elles
/// portent les commentaires qui expliquent chaque choix, et le tuner part de
/// là.
///
/// **Une seule implémentation de l'évaluation.** Garder des constantes pour le
/// moteur et un chemin paramétré pour le tuner ferait deux évaluations qui
/// divergeraient au premier oubli, et le tuner réglerait alors une fonction
/// que le moteur n'utilise pas.
///
/// `PHASE_WEIGHT` n'y figure pas volontairement : il ne pondère pas une
/// appréciation mais définit ce qu'on appelle « milieu de partie » et
/// « finale ». Le régler déplacerait le sens des deux jeux de valeurs sous
/// les pieds du tuner pendant qu'il les ajuste.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Params {
    /// Valeur matérielle par pièce, en milieu de partie.
    pub mg_value: [i32; Piece::NUM],
    /// Valeur matérielle par pièce, en finale.
    pub eg_value: [i32; Piece::NUM],
    /// Prime de la paire de fous, milieu puis finale.
    pub bishop_pair: (i32, i32),
    /// Prime d'un pion passé par rangée relative, en milieu de partie.
    pub passed_mg: [i32; 8],
    /// Prime d'un pion passé par rangée relative, en finale.
    pub passed_eg: [i32; 8],
    /// Pénalité par pion doublé excédentaire.
    pub doubled: (i32, i32),
    /// Pénalité d'un pion isolé.
    pub isolated: (i32, i32),
    /// Prime d'une tour sur colonne ouverte.
    pub rook_open: (i32, i32),
    /// Prime d'une tour sur colonne semi-ouverte.
    pub rook_semi_open: (i32, i32),
    /// Poids d'attaque par pièce visant la zone du roi adverse.
    pub king_attack_weight: [i32; Piece::NUM],
    /// Diviseur de la mise à l'échelle quadratique du danger.
    pub king_danger_scale: i32,
    /// Valeur d'une case accessible, par pièce, milieu puis finale.
    pub mobility: [(i32, i32); Piece::NUM],
    /// Tables piece-square de milieu de partie.
    pub pst_mg: [[i32; 64]; Piece::NUM],
    /// Tables piece-square de finale.
    pub pst_eg: [[i32; 64]; Piece::NUM],
}

impl Params {
    /// Les valeurs conventionnelles du moteur, celles que documentent les
    /// constantes ci-dessus. Aucune n'est réglée.
    pub const DEFAULT: Self = Self {
        mg_value: MG_VALUE,
        eg_value: EG_VALUE,
        bishop_pair: BISHOP_PAIR,
        passed_mg: PASSED_MG,
        passed_eg: PASSED_EG,
        doubled: DOUBLED_PAWN,
        isolated: ISOLATED_PAWN,
        rook_open: ROOK_OPEN_FILE,
        rook_semi_open: ROOK_SEMI_OPEN_FILE,
        king_attack_weight: KING_ATTACK_WEIGHT,
        king_danger_scale: KING_DANGER_SCALE,
        mobility: MOBILITY,
        pst_mg: [PAWN_MG, KNIGHT, BISHOP, ROOK, QUEEN, KING_MG],
        // Cavalier, fou, tour et dame partagent aujourd'hui une seule table
        // entre milieu et finale. Les séparer ici ne change rien tant que les
        // deux valent la même chose, et donne au tuner la liberté de les
        // distinguer — ce que les tables actuelles lui interdisent.
        pst_eg: [PAWN_EG, KNIGHT, BISHOP, ROOK, QUEEN, KING_EG],
    };
}

impl Default for Params {
    fn default() -> Self {
        Self::DEFAULT
    }
}

impl Params {
    /// Visite chaque valeur réglable, dans un ordre fixé une fois pour toutes.
    ///
    /// **Une seule traversée, pas deux.** Aplatir et reconstruire par deux
    /// fonctions parallèles marcherait jusqu'au jour où l'on ajoute un champ à
    /// l'une et pas à l'autre — et le tuner écrirait alors ses résultats dans
    /// les mauvaises cases, sans que rien ne le signale. Tout passe ici.
    fn visit(&mut self, f: &mut impl FnMut(&mut i32)) {
        for v in &mut self.mg_value {
            f(v);
        }
        for v in &mut self.eg_value {
            f(v);
        }
        f(&mut self.bishop_pair.0);
        f(&mut self.bishop_pair.1);
        for v in &mut self.passed_mg {
            f(v);
        }
        for v in &mut self.passed_eg {
            f(v);
        }
        for pair in [
            &mut self.doubled,
            &mut self.isolated,
            &mut self.rook_open,
            &mut self.rook_semi_open,
        ] {
            f(&mut pair.0);
            f(&mut pair.1);
        }
        for v in &mut self.king_attack_weight {
            f(v);
        }
        f(&mut self.king_danger_scale);
        for pair in &mut self.mobility {
            f(&mut pair.0);
            f(&mut pair.1);
        }
        for table in &mut self.pst_mg {
            for v in table {
                f(v);
            }
        }
        for table in &mut self.pst_eg {
            for v in table {
                f(v);
            }
        }
    }

    /// Nombre de valeurs réglables.
    #[must_use]
    pub fn len() -> usize {
        let mut n = 0;
        Self::DEFAULT.clone().visit(&mut |_| n += 1);
        n
    }

    /// Aplatit les valeurs dans l'ordre de `visit`.
    #[must_use]
    pub fn to_vec(&self) -> Vec<i32> {
        let mut out = Vec::with_capacity(Self::len());
        self.clone().visit(&mut |v| out.push(*v));
        out
    }

    /// Reconstruit depuis un vecteur produit par `to_vec`.
    ///
    /// Les valeurs surnuméraires sont ignorées et les manquantes laissées
    /// telles quelles : un tuner qui se tromperait de longueur produirait un
    /// jeu partiel plutôt qu'une panique, et le test de va-et-vient garantit
    /// que le cas normal est exact.
    pub fn set_from(&mut self, values: &[i32]) {
        let mut index = 0;
        self.visit(&mut |v| {
            if let Some(new) = values.get(index) {
                *v = *new;
            }
            index += 1;
        });
    }
}

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
pub fn evaluate(board: &Board, params: &Params) -> i32 {
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
                midgame +=
                    sign * (params.mg_value[piece as usize] + params.pst_mg[piece as usize][index]);
                endgame +=
                    sign * (params.eg_value[piece as usize] + params.pst_eg[piece as usize][index]);
            }
        }

        // Deux fous couvrent les deux couleurs de cases : l'avantage est réel
        // et conventionnellement reconnu, surtout en position ouverte.
        if board.colored_pieces(color, Piece::Bishop).len() >= 2 {
            midgame += sign * params.bishop_pair.0;
            endgame += sign * params.bishop_pair.1;
        }

        let activity = activity(board, color, params);
        midgame += sign * activity.mobility_mg;
        endgame += sign * activity.mobility_eg;

        // Le danger pèse sur le roi ADVERSE, donc contre le camp adverse : on
        // l'ajoute au crédit de `color`. En finale il ne s'applique pas — le
        // roi doit alors sortir, et l'y dissuader serait une faute.
        midgame += sign * king_danger(activity.king_attack, params);

        let (pawns_mg, pawns_eg) = pawn_structure(board, color, params);
        midgame += sign * pawns_mg;
        endgame += sign * pawns_eg;

        let (rooks_mg, rooks_eg) = rook_files(board, color, params);
        midgame += sign * rooks_mg;
        endgame += sign * rooks_eg;
    }

    // Les promotions peuvent faire dépasser le total initial ; on borne.
    let phase = phase.clamp(0, PHASE_TOTAL);
    (midgame * phase + endgame * (PHASE_TOTAL - phase)) / PHASE_TOTAL
}

/// Ce qu'un camp fait de ses pièces : mobilité, et pression sur le roi adverse.
///
/// **Les deux dérivent du même ensemble d'attaques.** Les calculer dans deux
/// fonctions séparées doublerait le nombre de générations d'attaques par
/// évaluation — or l'évaluation est appelée à chaque feuille. Ce couplage est
/// une décision de performance assumée, pas un mélange de responsabilités.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Activity {
    /// Mobilité pondérée, en milieu de partie.
    mobility_mg: i32,
    /// Mobilité pondérée, en finale.
    mobility_eg: i32,
    /// Poids cumulé des pièces de ce camp attaquant la zone du roi adverse.
    king_attack: i32,
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
fn activity(board: &Board, color: Color, params: &Params) -> Activity {
    let occupied = board.occupied();
    let ours = board.colors(color);

    // Zone du roi adverse : sa case et les huit voisines. C'est là qu'une
    // attaque se joue — au-delà, la pression n'est pas encore une menace.
    let their_king = board.king(!color);
    let zone = get_king_moves(their_king) | their_king.bitboard();

    let mut out = Activity {
        mobility_mg: 0,
        mobility_eg: 0,
        king_attack: 0,
    };

    for piece in [Piece::Knight, Piece::Bishop, Piece::Rook, Piece::Queen] {
        let (weight_mg, weight_eg) = params.mobility[piece as usize];
        for square in board.colored_pieces(color, piece) {
            let attacks = match piece {
                Piece::Knight => get_knight_moves(square),
                Piece::Bishop => get_bishop_moves(square, occupied),
                Piece::Rook => get_rook_moves(square, occupied),
                // La dame voit ce que verraient une tour et un fou réunis.
                _ => get_bishop_moves(square, occupied) | get_rook_moves(square, occupied),
            };

            let count = i32::try_from((attacks & !ours).len()).unwrap_or(0);
            out.mobility_mg += weight_mg * count;
            out.mobility_eg += weight_eg * count;

            if !(attacks & zone).is_empty() {
                out.king_attack += params.king_attack_weight[piece as usize];
            }
        }
    }

    out
}

/// Cases strictement devant `rank`, du point de vue de `color`.
///
/// Décalage gardé : à la dernière rangée le décalage vaudrait 64, ce que Rust
/// refuse. `checked_shl` rend alors `None` et l'ensemble est vide, ce qui est
/// exactement la réponse juste.
fn ahead_of(rank: u32, color: Color) -> BitBoard {
    if color == Color::White {
        BitBoard(u64::MAX.checked_shl(8 * (rank + 1)).unwrap_or(0))
    } else {
        BitBoard((1u64 << (8 * rank)) - 1)
    }
}

/// Ce que la structure de pions d'un camp lui rapporte ou lui coûte.
///
/// Trois notions qu'aucune table piece-square ne peut exprimer, parce
/// qu'elles dépendent toutes des **autres** pions, amis comme adverses, et
/// non de la seule case occupée.
fn pawn_structure(board: &Board, color: Color, params: &Params) -> (i32, i32) {
    let ours = board.colored_pieces(color, Piece::Pawn);
    let theirs = board.colored_pieces(!color, Piece::Pawn);
    let mut midgame = 0;
    let mut endgame = 0;

    for square in ours {
        let file = square.file();
        let rank = square.rank() as u32;

        // Passé : aucun pion adverse devant, ni sur sa colonne ni à côté.
        let corridor = (file.bitboard() | file.adjacent()) & ahead_of(rank, color);
        if (theirs & corridor).is_empty() {
            // Rangée vue du camp du pion : la septième vaut pour les deux.
            let relative = if color == Color::White {
                rank
            } else {
                7 - rank
            } as usize;
            midgame += params.passed_mg[relative];
            endgame += params.passed_eg[relative];
        }

        // Isolé : aucun pion ami sur les colonnes adjacentes, à aucune rangée.
        if (ours & file.adjacent()).is_empty() {
            midgame += params.isolated.0;
            endgame += params.isolated.1;
        }
    }

    // Doublés : comptés par colonne et non par pion, sans quoi une paire
    // serait pénalisée deux fois au lieu d'une.
    for file in cozy_chess::File::ALL {
        let count = i32::try_from((ours & file.bitboard()).len()).unwrap_or(0);
        if count > 1 {
            midgame += params.doubled.0 * (count - 1);
            endgame += params.doubled.1 * (count - 1);
        }
    }

    (midgame, endgame)
}

/// Prime des tours postées sur une colonne ouverte ou semi-ouverte.
fn rook_files(board: &Board, color: Color, params: &Params) -> (i32, i32) {
    let ours = board.colored_pieces(color, Piece::Pawn);
    let theirs = board.colored_pieces(!color, Piece::Pawn);
    let mut midgame = 0;
    let mut endgame = 0;

    for square in board.colored_pieces(color, Piece::Rook) {
        let file = square.file().bitboard();
        if !(ours & file).is_empty() {
            continue; // un pion à nous bouche la colonne
        }
        let (mg, eg) = if (theirs & file).is_empty() {
            params.rook_open
        } else {
            params.rook_semi_open
        };
        midgame += mg;
        endgame += eg;
    }

    (midgame, endgame)
}

/// Pénalité de milieu de partie pour le camp dont le roi est assailli.
///
/// Carrée et non linéaire : voir `KING_DANGER_SCALE`.
///
/// **Le diviseur est borné à 1.** Il est réglable, donc il peut valoir zéro —
/// et c'est arrivé : l'ajustement Texel du 14 sept. 2026 l'a poussé à zéro et
/// le moteur a paniqué sur une division entière par zéro. Un moteur ne doit
/// paniquer pour aucun jeu de paramètres : les valeurs sont des données, pas
/// du code, et une donnée fausse se borne au lieu d'arrêter la partie.
fn king_danger(attack_weight: i32, params: &Params) -> i32 {
    attack_weight * attack_weight / params.king_danger_scale.max(1)
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]
mod tests {
    use super::*;

    fn board(fen: &str) -> Board {
        fen.parse().unwrap()
    }

    /// Les tests d'évaluation portent sur la fonction, pas sur le réglage :
    /// ils emploient toujours les valeurs par défaut.
    fn eval(board: &Board) -> i32 {
        evaluate(board, &Params::DEFAULT)
    }

    /// Les tests de mobilité n'ont que faire du terme de sécurité du roi, qui
    /// partage la même passe pour n'en payer qu'une.
    fn mobilite(board: &Board, color: Color) -> (i32, i32) {
        let a = activity(board, color, &Params::DEFAULT);
        (a.mobility_mg, a.mobility_eg)
    }

    /// Toutes les positions de ces tests sont validées par exécution avant
    /// d'être inscrites — une position dérivée de tête s'est révélée illégale
    /// trois fois sur ce projet. Voir le piège correspondant dans CLAUDE.md.
    #[test]
    fn une_piece_qui_voit_plus_de_cases_vaut_plus() {
        // Même matériel, même camp, seule la case change. Sans terme de
        // mobilité les deux positions seraient jugées identiques, puisque les
        // tables piece-square notent la case et jamais ce que la pièce y voit.
        let centre = mobilite(&board("7k/8/8/8/3N4/8/8/K7 w - - 0 1"), Color::White);
        let coin = mobilite(&board("7k/8/8/8/8/8/8/KN6 w - - 0 1"), Color::White);
        assert!(
            centre.0 > coin.0 && centre.1 > coin.1,
            "cavalier au centre {centre:?} contre cavalier au coin {coin:?}"
        );

        let ouverte = mobilite(&board("7k/8/8/8/8/8/8/K3R3 w - - 0 1"), Color::White);
        let enfermee = mobilite(&board("7k/8/8/8/8/8/PPP5/KR6 w - - 0 1"), Color::White);
        assert!(
            ouverte.0 > enfermee.0,
            "tour libre {ouverte:?} contre tour enfermée {enfermee:?}"
        );

        let fou = mobilite(&board("7k/8/8/8/8/3B4/8/K7 w - - 0 1"), Color::White);
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
            mobilite(&board("8/8/8/8/8/8/8/K6k w - - 0 1"), Color::White),
            (0, 0)
        );
        assert_eq!(
            mobilite(
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
        let blancs = mobilite(&b, Color::White);
        let noirs = mobilite(&b, Color::Black);
        assert_eq!(blancs, noirs);
        assert!(blancs.0 > 0, "les cavaliers initiaux voient des cases");
    }

    #[test]
    fn le_danger_croit_plus_vite_que_le_nombre_dassaillants() {
        // C'est le cœur du terme : un attaquant isolé ne menace rien, quatre
        // pièces convergentes décident souvent la partie. Une somme linéaire
        // donnerait au premier le quart de ce que valent les quatre, ce qui
        // est faux. On vérifie donc la convexité, pas une valeur.
        let un = king_danger(2, &Params::DEFAULT);
        let deux = king_danger(4, &Params::DEFAULT);
        let quatre = king_danger(8, &Params::DEFAULT);
        assert!(
            deux - un < quatre - deux,
            "{un} {deux} {quatre} : pas convexe"
        );
        assert_eq!(
            king_danger(0, &Params::DEFAULT),
            0,
            "aucun assaillant, aucun danger"
        );
    }

    #[test]
    fn une_piece_qui_vise_le_roi_adverse_compte_comme_assaillante() {
        // Les poids attendus ne sont pas devinés : ils sont calculés par une
        // implémentation indépendante (python-chess) sur les mêmes positions,
        // puis inscrits ici. Une première version de ce test comparait deux
        // positions choisies de tête, et elle était fausse — la dame reléguée
        // en a1 visait toujours la zone par la longue diagonale.
        let poids = |fen: &str| activity(&board(fen), Color::White, &Params::DEFAULT).king_attack;

        // Dame en g5 : elle attaque g7, qui est dans la zone du roi noir.
        assert_eq!(poids("6k1/5ppp/8/6Q1/8/8/8/6K1 w - - 0 1"), 5);

        // Même dame en a1, mais un pion en d4 coupe la longue diagonale :
        // plus rien ne vise la zone.
        assert_eq!(poids("6k1/5ppp/8/8/3P4/8/8/Q5K1 w - - 0 1"), 0);

        // Cavalier en e5 et dame en g5 : deux assaillants, 2 + 5.
        assert_eq!(poids("6k1/5ppp/8/4N1Q1/8/8/8/6K1 w - - 0 1"), 7);
    }

    #[test]
    fn la_position_initiale_ne_met_aucun_roi_en_danger() {
        // Aucune pièce ne peut atteindre la zone adverse au premier coup :
        // si ce test tombait, la zone ou les attaques seraient mal calculées.
        let b = Board::default();
        assert_eq!(activity(&b, Color::White, &Params::DEFAULT).king_attack, 0);
        assert_eq!(activity(&b, Color::Black, &Params::DEFAULT).king_attack, 0);
    }

    /// Les valeurs attendues de ces tests sont calculées par une
    /// implémentation indépendante (python-chess) sur les mêmes positions,
    /// puis inscrites ici. Deux implémentations qui s'accordent écartent
    /// l'hypothèse d'une erreur de raisonnement partagée — et sur ce projet,
    /// quatre positions dérivées de tête se sont révélées fausses.
    #[test]
    fn la_structure_de_pions_est_comptee_correctement() {
        let p = |fen: &str| pawn_structure(&board(fen), Color::White, &Params::DEFAULT);

        // Position initiale : aucun pion passé, doublé ni isolé. Si l'un des
        // trois se déclenchait ici, la définition serait fausse.
        assert_eq!(
            p("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
            (0, 0)
        );

        // Un pion seul est À LA FOIS passé et isolé, par définition des deux :
        // 35 - 12 en milieu, 70 - 15 en finale. Ce n'est pas un artefact.
        assert_eq!(p("7k/8/8/3P4/8/8/8/7K w - - 0 1"), (23, 55));

        // Deux pions doublés en d2 et d3, tous deux isolés, tous deux passés.
        assert_eq!(p("7k/8/8/8/8/3P4/3P4/7K w - - 0 1"), (-19, -20));

        // Un pion adverse en d6 barre la colonne : le pion d2 n'est plus
        // passé, il ne reste que la pénalité d'isolement.
        assert_eq!(p("7k/8/3p4/8/8/8/3P4/7K w - - 0 1"), (-12, -15));

        // Deux pions voisins : aucun n'est isolé, les deux sont passés.
        assert_eq!(p("7k/8/8/8/8/8/2PP4/7K w - - 0 1"), (10, 20));
    }

    #[test]
    fn une_tour_est_payee_selon_sa_colonne() {
        let r = |fen: &str| rook_files(&board(fen), Color::White, &Params::DEFAULT);

        // Colonne d vide des deux côtés : ouverte.
        assert_eq!(r("7k/8/8/8/8/8/8/3R3K w - - 0 1"), (20, 10));
        // Un pion adverse en d7 : semi-ouverte, la tour voit loin mais bute.
        assert_eq!(r("7k/3p4/8/8/8/8/8/3R3K w - - 0 1"), (10, 5));
        // Notre propre pion en d2 bouche la colonne : rien.
        assert_eq!(r("7k/8/8/8/8/8/3P4/3R3K w - - 0 1"), (0, 0));
        // Position initiale : les huit pions bouchent tout.
        assert_eq!(
            r("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
            (0, 0)
        );
    }

    #[test]
    fn un_pion_passe_vaut_plus_en_avancant_en_finale() {
        // **Reformulé le 14 sept. 2026, et c'est une correction, pas un
        // assouplissement.** La version précédente testait `PASSED_MG`
        // isolément. Or la table piece-square du pion varie déjà avec la
        // rangée : ce qu'un pion passé rapporte réellement est la SOMME des
        // deux. Tester un composant, c'est tester autre chose que la
        // propriété.
        //
        // En finale la propriété est certaine — un pion passé vaut d'autant
        // plus qu'il approche de la promotion — et la somme doit croître
        // strictement. En milieu de partie elle ne l'est pas : un passé avancé
        // et non soutenu est loin de ses pièces et facile à bloquer, et
        // l'ajustement Texel du 14 sept. l'a d'ailleurs jugé négatif sur les
        // rangées médianes. On ne l'impose donc pas.
        let pawn_pst_mean = |table: &[i32; 64], relative: usize| {
            let row = 7 - relative;
            table[row * 8..row * 8 + 8].iter().sum::<i32>() / 8
        };
        let total_eg: Vec<i32> = (1..7)
            .map(|r| pawn_pst_mean(&PAWN_EG, r) + Params::DEFAULT.passed_eg[r])
            .collect();
        for window in total_eg.windows(2) {
            assert!(
                window[0] < window[1],
                "la valeur d'un pion passé doit croître en finale : {total_eg:?}"
            );
        }
    }

    #[test]
    fn les_parametres_font_un_aller_retour_exact() {
        // Si l'aplatissement et la reconstruction divergeaient, le tuner
        // écrirait ses résultats dans les mauvaises cases sans que rien ne le
        // signale. C'est le test qui rend cette faute impossible.
        let flat = Params::DEFAULT.to_vec();
        assert_eq!(flat.len(), Params::len());
        let mut rebuilt = Params::DEFAULT;
        rebuilt.set_from(&flat);
        assert_eq!(rebuilt, Params::DEFAULT);

        // Et toute valeur modifiée doit se retrouver à sa place.
        let mut changed = flat.clone();
        for (i, v) in changed.iter_mut().enumerate() {
            *v = i32::try_from(i).unwrap_or(0) - 400;
        }
        let mut params = Params::DEFAULT;
        params.set_from(&changed);
        assert_eq!(params.to_vec(), changed);
        assert_ne!(params, Params::DEFAULT);
    }

    #[test]
    fn le_nombre_de_parametres_est_celui_quon_croit() {
        // Un garde-fou contre l'ajout d'un champ oublié dans `visit` : si le
        // compte change sans qu'on l'ait voulu, ce test le dit.
        assert_eq!(
            Params::len(),
            825,
            "825 = 12 matériel + 2 fous + 16 passés + 8 pions/tours + 6 attaque + 1 échelle + 12 mobilité + 768 tables"
        );
    }

    #[test]
    fn aucun_jeu_de_parametres_ne_fait_paniquer_levaluation() {
        // Les valeurs sont réglables, donc un tuner peut leur donner n'importe
        // quoi — y compris zéro à un diviseur. C'est exactement ce qui s'est
        // produit le 14 sept. 2026, et le moteur a paniqué. Un moteur ne doit
        // paniquer pour aucun jeu de paramètres.
        let board = Board::default();
        for value in [0, 1, -1, i32::MIN, i32::MAX] {
            let mut params = Params::DEFAULT;
            params.king_danger_scale = value;
            let score = evaluate(&board, &params);
            assert!(
                score.abs() < MATE_THRESHOLD,
                "échelle {value} : score {score} invraisemblable"
            );
        }

        // Et un jeu entièrement à zéro doit rendre une évaluation nulle, pas
        // une panique : c'est le cas dégénéré qu'un tuner peut atteindre.
        let mut zeroed = Params::DEFAULT;
        zeroed.set_from(&vec![0; Params::len()]);
        assert_eq!(evaluate(&board, &zeroed), 0);
    }

    #[test]
    fn la_position_initiale_est_equilibree() {
        assert_eq!(eval(&Board::default()), 0);
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
        assert_eq!(eval(&blancs), -eval(&noirs));
    }

    #[test]
    fn une_dame_de_plus_vaut_environ_une_dame() {
        // Blancs sans dame contre Noirs complets, trait aux Noirs.
        let board: Board = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1"
            .parse()
            .unwrap();
        // **Mesuré en PIONS, pas en centièmes absolus.** L'ajustement Texel
        // fixe librement l'échelle de l'évaluation : seules les valeurs
        // relatives ont un sens, et une borne absolue ne testerait que
        // l'échelle. Une dame vaut classiquement de huit à treize pions.
        let score = eval(&board);
        let pawn = Params::DEFAULT.mg_value[Piece::Pawn as usize];
        let in_pawns = f64::from(score) / f64::from(pawn);
        assert!(
            (8.0..=13.0).contains(&in_pawns),
            "une dame devrait valoir de huit à treize pions, obtenu {in_pawns:.1} ({score} pour un pion à {pawn})"
        );
    }

    #[test]
    fn le_roi_se_centralise_en_finale() {
        // Rois seuls avec un pion : phase nulle, donc table de finale.
        let centre: Board = "8/8/8/3K4/8/8/4P3/7k w - - 0 1".parse().unwrap();
        let coin: Board = "8/8/8/8/8/8/4P3/K6k w - - 0 1".parse().unwrap();
        assert!(
            eval(&centre) > eval(&coin),
            "le roi centralisé doit être mieux noté en finale"
        );
    }

    #[test]
    fn la_paire_de_fous_est_un_avantage() {
        let paire: Board = "4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1".parse().unwrap();
        let fou_et_cavalier: Board = "4k3/8/8/8/8/8/8/2B1KN2 w - - 0 1".parse().unwrap();
        assert!(eval(&paire) > eval(&fou_et_cavalier));
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
        for table in Params::DEFAULT
            .pst_mg
            .iter()
            .chain(Params::DEFAULT.pst_eg.iter())
        {
            assert_eq!(table.len(), 64);
        }
    }
}
