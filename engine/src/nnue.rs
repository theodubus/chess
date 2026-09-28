//! Évaluation NNUE (B4, chantier A21) : un petit réseau `(768 → 128) × 2 → 1`,
//! qui remplace l'évaluation faite main quand l'option UCI `EvalFile` en
//! charge un. Sans réseau, rien ne change : pas un nœud de différence.
//!
//! # Tout ce qui suit est lu au source, au commit qu'on épingle
//!
//! L'entraîneur est bullet, lu au commit `10e7e82` (24 sept. 2026) ; ses
//! données passent par `viriformat` 2.0.1 et `bulletformat` 1.8.0, les
//! versions qu'il emploie à ce commit. Un réseau ne vaut que si le moteur
//! calcule EXACTEMENT les entrées sur lesquelles il a été entraîné : une case
//! retournée d'un côté et pas de l'autre ne fait rien planter, elle donne un
//! réseau qui évalue une autre position que celle qu'on lui montre. Aucun
//! test du moteur seul ne le verrait ; c'est pourquoi un test de `tools/`
//! confronte [`feature`] au code même de `bulletformat`.
//!
//! - **Les entrées** (`Chess768`, `bullet_lib/src/game/inputs/chess768.rs`) :
//!   une par (camp, pièce, case), vue par chacun des deux camps.
//!   `bulletformat` retourne l'échiquier quand les Noirs ont le trait —
//!   `ChessBoard::from_raw` échange les couleurs et applique `swap_bytes` à
//!   chaque bitboard. Ramené aux cases réelles, l'indice vu par un camp est
//!   `384 × (pièce adverse) + 64 × type + case`, la case retournée (`^ 56`)
//!   quand ce camp est noir : chacun se voit « blanc », son roque en bas.
//! - **Le fichier** (`examples/simple.rs`, `SavedFormat`,
//!   `to_quantised_buffer`) : les poids de la couche cachée, une ligne de 128
//!   par entrée, quantifiés par `QA` ; ses biais, par `QA` ; les 256 poids de
//!   sortie — ceux du camp au trait d'abord —, par `QB` ; le biais de sortie,
//!   par `QA × QB`. Des `i16` petit-boutistes, arrondis, puis un bourrage
//!   jusqu'au multiple de 64 octets.
//! - **La sortie** (`Network::evaluate` de l'exemple) : SCReLU — l'entrée
//!   bornée à `[0, QA]` puis élevée au carré —, produit scalaire, division par
//!   `QA`, biais, × `SCALE`, division par `QA × QB`. Les mêmes étapes et les
//!   mêmes troncatures ici.
//!
//! # Ce qu'un réseau chargé ne peut pas faire
//!
//! **Déborder**, et c'est garanti AU CHARGEMENT, pas espéré. Un accumulateur
//! est le biais plus au plus 32 lignes — autant que de pièces sur un
//! échiquier légal —, et [`Network::from_bytes`] refuse un réseau dont une
//! unité, avec ses 32 plus grands poids, sortirait d'un `i16`. Le produit
//! scalaire reste dans un `i32` tant que la somme des poids de sortie en
//! valeur absolue ne dépasse pas `i32::MAX / QA²` ; le reste se calcule en
//! `i64`. Un réseau entraîné par bullet avec ses réglages par défaut passe
//! les deux : `AdamW` y borne les poids à ±1,98, soit 505 et 127 une fois
//! quantifiés — 16 665 au plus dans un accumulateur, 32 512 au total en
//! sortie contre 33 025 admis.
//!
//! **Sortir de la plage des scores ordinaires** : la sortie est bornée à
//! `MATE_THRESHOLD - 1`, sans quoi un réseau exotique annoncerait un mat.
//!
//! # Où vivent les accumulateurs
//!
//! Dans une pile indexée par ply qui appartient à la recherche, jamais dans le
//! `Board` : c'est la contrainte d'architecture posée avec le copy-make (A5),
//! et la raison pour laquelle [`Network::apply_move`] dérive tout du plateau
//! PARENT et du coup, sans rien demander au `play_unchecked` opaque de
//! `cozy-chess`. La dérivation est celle que `tools/src/bin/nnue_probe.rs`
//! avait confrontée à la vérité terrain le 14 sept. 2026 — 283 677 coups,
//! roques, prises en passant et promotions compris, sans un écart — et elle
//! vit désormais ici, seule copie.

use cozy_chess::{Board, Color, File, Move, Piece, Square};

use crate::eval::MATE_THRESHOLD;

/// Nombre d'entrées : 2 camps relatifs × 6 pièces × 64 cases.
pub const INPUTS: usize = 768;

/// Taille de la couche cachée, pour chacune des deux perspectives.
pub const HIDDEN: usize = 128;

/// Quantification de la couche cachée, poids et biais.
pub const QA: i32 = 255;

/// Quantification des poids de sortie.
pub const QB: i32 = 64;

/// Échelle : la sortie du réseau, multipliée par elle, est en centièmes de
/// pion. C'est l'`eval_scale` de l'entraînement, qui y convertit les scores
/// de la recherche en probabilités de gain par `sigmoïde(score / SCALE)`.
pub const SCALE: i32 = 400;

/// Le plus de pièces qu'un échiquier légal puisse porter : la borne sur
/// laquelle repose la garantie de non-débordement de l'accumulateur.
const MAX_PIECES: usize = 32;

/// Nombre de `i16` du fichier, dans l'ordre où bullet les écrit.
const VALUES: usize = INPUTS * HIDDEN + HIDDEN + 2 * HIDDEN + 1;

/// Taille exacte d'un fichier de réseau : les valeurs, puis le bourrage de
/// bullet jusqu'au multiple de 64 octets. Un réseau d'une autre taille de
/// couche cachée a une autre taille de fichier, et il est refusé.
pub const FILE_BYTES: usize = (2 * VALUES).div_ceil(64) * 64;

/// La plus grande somme des poids de sortie, en valeur absolue, pour laquelle
/// le produit scalaire tient dans un `i32` : chaque terme vaut au plus `QA²`
/// fois son poids.
const MAX_OUTPUT_WEIGHT_SUM: i64 = i32::MAX as i64 / (QA as i64 * QA as i64);

/// Une moitié de la couche cachée : ce que voit un camp, avant activation.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(align(64))]
pub struct Accumulator([i16; HIDDEN]);

impl Default for Accumulator {
    fn default() -> Self {
        Self([0; HIDDEN])
    }
}

impl Accumulator {
    /// Ajoute une ligne de poids. L'arithmétique est modulaire : elle ne
    /// déborde jamais sur un réseau accepté et un échiquier légal, et sur une
    /// position qui ne l'est pas elle rend une valeur fausse plutôt que de
    /// paniquer — l'ajout et le retrait restent l'un l'inverse de l'autre.
    fn add(&mut self, row: &[i16; HIDDEN]) {
        for (value, &weight) in self.0.iter_mut().zip(row) {
            *value = value.wrapping_add(weight);
        }
    }

    /// Retire une ligne de poids.
    fn sub(&mut self, row: &[i16; HIDDEN]) {
        for (value, &weight) in self.0.iter_mut().zip(row) {
            *value = value.wrapping_sub(weight);
        }
    }
}

/// Les deux moitiés d'une position, indexées par camp : `[Blancs, Noirs]`.
///
/// Rangées par camp et non par trait : un coup nul change le trait sans
/// déplacer une pièce, et les laisse donc telles quelles.
pub type Accumulators = [Accumulator; 2];

/// L'indice de l'entrée d'une pièce, vue par `perspective`.
///
/// Voir l'en-tête du module pour la dérivation depuis `bulletformat`.
#[must_use]
pub fn feature(perspective: Color, color: Color, piece: Piece, square: Square) -> usize {
    let side = if color == perspective { 0 } else { 384 };
    let square = if perspective == Color::White {
        square as usize
    } else {
        square as usize ^ 56
    };
    side + 64 * piece as usize + square
}

/// Une pièce qui apparaît ou disparaît d'une case : tout ce qu'un coup fait à
/// un accumulateur, qui n'est qu'une somme de contributions par (camp, pièce,
/// case).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Change {
    /// `true` si la pièce apparaît, `false` si elle disparaît.
    pub added: bool,
    /// Le type de la pièce — après promotion le cas échéant.
    pub piece: Piece,
    /// Le camp qui la possède.
    pub color: Color,
    /// La case où elle apparaît ou disparaît.
    pub square: Square,
}

/// Valeur de remplissage d'un tampon de [`Change`] : jamais lue au-delà du
/// compte que rend [`changes`].
pub const BLANK: Change = Change {
    added: false,
    piece: Piece::Pawn,
    color: Color::White,
    square: Square::A1,
};

/// Dérive du plateau parent et du coup ce que le coup fait aux pièces, SANS le
/// jouer. Rend le nombre de modifications écrites dans `out` : au plus
/// quatre — le roque en fait quatre, la promotion avec capture trois.
///
/// Les deux cas qu'on rate, et que la vérité terrain a vérifiés :
/// - **le roque**, que `cozy-chess` note roi-prend-tour : la case d'arrivée
///   porte NOTRE tour, et roi et tour finissent sur des cases fixées par le
///   côté du roque, pas par le coup ;
/// - **la prise en passant**, dont la case d'arrivée est vide : le pion pris
///   est sur la rangée de départ du pion qui prend.
pub fn changes(board: &Board, mv: Move, out: &mut [Change; 4]) -> usize {
    debug_assert!(
        board.piece_on(mv.from).is_some(),
        "coup {mv} sans pièce sur sa case de départ"
    );
    let Some(moving) = board.piece_on(mv.from) else {
        return 0;
    };
    let us = board.side_to_move();
    let them = !us;
    let mut count = 0;
    let mut push = |added: bool, piece: Piece, color: Color, square: Square| {
        if let Some(slot) = out.get_mut(count) {
            *slot = Change {
                added,
                piece,
                color,
                square,
            };
            count += 1;
        }
    };

    if moving == Piece::King && board.colors(us).has(mv.to) {
        let rank = mv.from.rank();
        let (king_to, rook_to) = if mv.to.file() > mv.from.file() {
            (Square::new(File::G, rank), Square::new(File::F, rank))
        } else {
            (Square::new(File::C, rank), Square::new(File::D, rank))
        };
        push(false, Piece::King, us, mv.from);
        push(false, Piece::Rook, us, mv.to);
        push(true, Piece::King, us, king_to);
        push(true, Piece::Rook, us, rook_to);
        return count;
    }

    push(false, moving, us, mv.from);
    if let Some(taken) = board.piece_on(mv.to) {
        push(false, taken, them, mv.to);
    } else if moving == Piece::Pawn && mv.from.file() != mv.to.file() {
        push(
            false,
            Piece::Pawn,
            them,
            Square::new(mv.to.file(), mv.from.rank()),
        );
    }
    push(true, mv.promotion.unwrap_or(moving), us, mv.to);
    count
}

/// SCReLU : l'entrée bornée à `[0, QA]`, puis élevée au carré.
fn screlu(value: i16) -> i32 {
    let clipped = i32::from(value).clamp(0, QA);
    clipped * clipped
}

/// Le produit scalaire d'une moitié activée et de ses poids de sortie.
fn dot(accumulator: &Accumulator, weights: &[i16]) -> i32 {
    accumulator
        .0
        .iter()
        .zip(weights)
        .map(|(&value, &weight)| screlu(value) * i32::from(weight))
        .sum()
}

/// Un réseau quantifié, tel que bullet l'écrit.
pub struct Network {
    /// Une ligne de `HIDDEN` poids par entrée, quantifiés par `QA`.
    feature_weights: Box<[[i16; HIDDEN]]>,
    /// Les biais de la couche cachée, quantifiés par `QA`.
    feature_bias: [i16; HIDDEN],
    /// Les poids de sortie du camp au trait, puis ceux de l'autre, quantifiés
    /// par `QB`.
    output_weights: [i16; 2 * HIDDEN],
    /// Le biais de sortie, quantifié par `QA × QB`.
    output_bias: i16,
}

impl Network {
    /// Lit un réseau au format de bullet, et le REFUSE s'il pouvait déborder.
    ///
    /// # Errors
    /// Une taille qui n'est pas celle de l'architecture — un réseau d'une
    /// autre taille de couche cachée, ou un fichier qui n'est pas un réseau —,
    /// ou des poids qui pourraient faire déborder un accumulateur ou le
    /// produit scalaire.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() != FILE_BYTES {
            return Err(format!(
                "réseau de {} octets : l'architecture (768 → {HIDDEN}) × 2 → 1 en attend {FILE_BYTES}",
                bytes.len()
            ));
        }
        let (pairs, _) = bytes.as_chunks::<2>();
        let values: Vec<i16> = pairs.iter().map(|&pair| i16::from_le_bytes(pair)).collect();
        let (weights, rest) = values.split_at(INPUTS * HIDDEN);
        let (bias, rest) = rest.split_at(HIDDEN);
        let (output, rest) = rest.split_at(2 * HIDDEN);
        let &[output_bias, ..] = rest else {
            return Err("réseau tronqué : pas de biais de sortie".to_owned());
        };

        let (rows, _) = weights.as_chunks::<HIDDEN>();
        let network = Self {
            feature_weights: Box::from(rows),
            feature_bias: <[i16; HIDDEN]>::try_from(bias)
                .map_err(|_| "biais de la couche cachée mal découpés".to_owned())?,
            output_weights: <[i16; 2 * HIDDEN]>::try_from(output)
                .map_err(|_| "poids de sortie mal découpés".to_owned())?,
            output_bias,
        };
        network.check_bounds()?;
        Ok(network)
    }

    /// Refuse un réseau dont un accumulateur ou le produit scalaire pourrait
    /// déborder — voir l'en-tête du module.
    fn check_bounds(&self) -> Result<(), String> {
        for (unit, &bias) in self.feature_bias.iter().enumerate() {
            let mut magnitudes: Vec<i32> = self
                .feature_weights
                .iter()
                .map(|row| i32::from(row[unit]).abs())
                .collect();
            magnitudes.sort_unstable_by(|a, b| b.cmp(a));
            let worst = i32::from(bias).abs() + magnitudes.iter().take(MAX_PIECES).sum::<i32>();
            if worst > i32::from(i16::MAX) {
                return Err(format!(
                    "l'unité cachée {unit} peut atteindre {worst}, au-delà d'un i16"
                ));
            }
        }
        let total: i64 = self
            .output_weights
            .iter()
            .map(|&weight| i64::from(weight).abs())
            .sum();
        if total > MAX_OUTPUT_WEIGHT_SUM {
            return Err(format!(
                "les poids de sortie totalisent {total} en valeur absolue, au-delà des \
                 {MAX_OUTPUT_WEIGHT_SUM} qu'admet un produit scalaire sur 32 bits"
            ));
        }
        Ok(())
    }

    /// La ligne de poids d'une entrée.
    fn row(&self, feature: usize) -> &[i16; HIDDEN] {
        &self.feature_weights[feature]
    }

    /// Les deux accumulateurs d'une position, recalculés de zéro.
    #[must_use]
    pub fn refresh(&self, board: &Board) -> Accumulators {
        let mut accumulators = [Accumulator(self.feature_bias); 2];
        for color in Color::ALL {
            for piece in Piece::ALL {
                for square in board.colored_pieces(color, piece) {
                    for perspective in Color::ALL {
                        accumulators[perspective as usize].add(self.row(feature(
                            perspective,
                            color,
                            piece,
                            square,
                        )));
                    }
                }
            }
        }
        accumulators
    }

    /// Les accumulateurs d'après `mv`, joué depuis `board`, dérivés de ceux
    /// d'avant sans rien recalculer : au plus quatre lignes ajoutées ou
    /// retirées, pour chaque camp.
    pub fn apply_move(
        &self,
        before: &Accumulators,
        after: &mut Accumulators,
        board: &Board,
        mv: Move,
    ) {
        *after = *before;
        let mut buffer = [BLANK; 4];
        let count = changes(board, mv, &mut buffer);
        for change in &buffer[..count] {
            for perspective in Color::ALL {
                let row = self.row(feature(
                    perspective,
                    change.color,
                    change.piece,
                    change.square,
                ));
                let accumulator = &mut after[perspective as usize];
                if change.added {
                    accumulator.add(row);
                } else {
                    accumulator.sub(row);
                }
            }
        }
    }

    /// L'évaluation du réseau, en centièmes de pion, du point de vue du camp
    /// au trait — la convention qu'impose le negamax, comme pour
    /// [`crate::eval::evaluate`].
    ///
    /// Bornée à `MATE_THRESHOLD - 1` : une évaluation n'annonce jamais un mat.
    #[must_use]
    pub fn evaluate(&self, accumulators: &Accumulators, side_to_move: Color) -> i32 {
        let (ours, theirs) = self.output_weights.split_at(HIDDEN);
        let sum = dot(&accumulators[side_to_move as usize], ours)
            + dot(&accumulators[!side_to_move as usize], theirs);
        // Les étapes et les troncatures de l'inférence de bullet, en `i64` :
        // `× SCALE` sortirait d'un `i32` bien avant que le produit scalaire ne
        // le fasse.
        let output = (i64::from(sum) / i64::from(QA) + i64::from(self.output_bias))
            * i64::from(SCALE)
            / i64::from(QA * QB);
        let bound = i64::from(MATE_THRESHOLD - 1);
        i32::try_from(output.clamp(-bound, bound)).unwrap_or(0)
    }
}

/// Des réseaux pour les tests — ceux de ce module, de la recherche et de la
/// couche UCI.
#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]
pub(crate) mod testing {
    use super::*;

    /// xorshift64, seedé : les tests sont déterministes comme le moteur.
    pub(crate) struct Rng(pub(crate) u64);

    impl Rng {
        pub(crate) fn next(&mut self) -> u64 {
            let mut x = self.0;
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            self.0 = x;
            x
        }

        /// Uniforme dans `[-bound, bound]`.
        pub(crate) fn spread(&mut self, bound: i16) -> i16 {
            let span = 2 * u64::try_from(bound).unwrap() + 1;
            i16::try_from(i64::try_from(self.next() % span).unwrap() - i64::from(bound)).unwrap()
        }
    }

    /// Les octets d'un fichier de réseau, tel que bullet l'écrit, à partir de
    /// ses valeurs.
    pub(crate) fn file_of(values: &[i16]) -> Vec<u8> {
        assert_eq!(values.len(), VALUES);
        let mut bytes: Vec<u8> = values.iter().flat_map(|v| v.to_le_bytes()).collect();
        let pattern = b"bullet";
        let mut index = 0;
        while !bytes.len().is_multiple_of(64) {
            bytes.push(pattern[index % pattern.len()]);
            index += 1;
        }
        bytes
    }

    /// Les valeurs d'un réseau aléatoire : couche cachée dans `[-hidden,
    /// hidden]`, sortie dans `[-output, output]`, biais de sortie dans
    /// `[-5000, 5000]`.
    pub(crate) fn random_values(seed: u64, hidden: i16, output: i16) -> Vec<i16> {
        let mut rng = Rng(seed | 1);
        let mut values = Vec::with_capacity(VALUES);
        values.extend((0..INPUTS * HIDDEN + HIDDEN).map(|_| rng.spread(hidden)));
        values.extend((0..2 * HIDDEN).map(|_| rng.spread(output)));
        values.push(rng.spread(5_000));
        values
    }

    /// Un réseau aléatoire aux poids d'un réseau entraîné — bornés comme
    /// `AdamW` les borne, donc toujours admis par le chargeur.
    pub(crate) fn random_network(seed: u64) -> Network {
        Network::from_bytes(&file_of(&random_values(seed, 300, 127))).unwrap()
    }

    /// Un réseau aléatoire aux évaluations de l'ordre de celles d'une vraie
    /// partie — quelques centaines de centièmes, là où [`random_network`] en
    /// rend des milliers —, pour que la recherche y prenne les chemins du
    /// jeu : un réseau qui évalue tout à ±8 000 fait couper la futilité
    /// inverse partout, et le coup nul n'a jamais sa chance.
    pub(crate) fn small_network(seed: u64) -> Network {
        Network::from_bytes(&file_of(&random_values(seed, 40, 20))).unwrap()
    }
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]
mod tests {
    use super::testing::*;
    use super::*;

    /// Un réseau nul partout, sauf les valeurs posées par `edit` — pour les
    /// calculs à la main.
    fn network_with(edit: impl FnOnce(&mut Vec<i16>)) -> Network {
        let mut values = vec![0; VALUES];
        edit(&mut values);
        Network::from_bytes(&file_of(&values)).unwrap()
    }

    /// Indices, dans les valeurs du fichier, des différentes parties.
    const BIAS_AT: usize = INPUTS * HIDDEN;
    const OUTPUT_AT: usize = BIAS_AT + HIDDEN;
    const OUTPUT_BIAS_AT: usize = OUTPUT_AT + 2 * HIDDEN;

    fn board(fen: &str) -> Board {
        fen.parse().unwrap()
    }

    /// Des positions variées : celles de `bench` et de `perft`, et celles qui
    /// forcent les coups qu'on rate — roques des deux côtés, prise en passant,
    /// promotions avec et sans capture, trait aux Noirs.
    const FENS: &[&str] = &[
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R b KQkq - 0 1",
        "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
        "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
        "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
        "n1n5/PPPk4/8/8/8/8/4Kppp/5N1N b - - 0 1",
        "8/2P1P3/3K4/8/8/3k4/3p1p2/8 w - - 0 1",
        "r3k2r/pP4P1/8/8/8/8/1p4p1/R3K2R w KQkq - 0 1",
        "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3",
        "rnbqkbnr/pppp1ppp/8/8/3Pp3/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 2",
        "rnbqkbnr/pp1ppppp/8/2pP4/8/8/PPP1PPPP/RNBQKBNR w KQkq c6 0 2",
        "rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 2",
    ];

    fn moves_of(board: &Board) -> Vec<Move> {
        let mut moves = Vec::new();
        board.generate_moves(|set| {
            moves.extend(set);
            false
        });
        moves
    }

    /// Les positions de [`FENS`], puis celles d'une marche seedée depuis
    /// chacune : trois cents positions, dont la plupart jamais écrites à la
    /// main.
    fn positions() -> Vec<Board> {
        let mut rng = Rng(0x9e37_79b9_7f4a_7c15);
        let mut out = Vec::new();
        for fen in FENS {
            let mut current = board(fen);
            out.push(current.clone());
            for _ in 0..26 {
                let moves = moves_of(&current);
                if moves.is_empty() {
                    break;
                }
                let index = usize::try_from(rng.next() % moves.len() as u64).unwrap();
                current.play_unchecked(moves[index]);
                out.push(current.clone());
            }
        }
        out
    }

    #[test]
    fn le_fichier_a_la_taille_que_bullet_ecrit() {
        // 2 × (768 × 128 + 128 + 256 + 1) = 197 378 octets, bourrés jusqu'au
        // multiple de 64 suivant. Calculé à la main depuis `SavedFormat`.
        assert_eq!(FILE_BYTES, 197_440);
        assert!(Network::from_bytes(&file_of(&random_values(7, 300, 127))).is_ok());
    }

    #[test]
    fn un_fichier_d_une_autre_taille_est_refuse() {
        let bytes = file_of(&random_values(7, 300, 127));
        assert!(Network::from_bytes(&bytes[..FILE_BYTES - 64]).is_err());
        assert!(Network::from_bytes(&bytes[..FILE_BYTES - 2]).is_err());
        let mut longer = bytes.clone();
        longer.extend_from_slice(&[0; 64]);
        assert!(Network::from_bytes(&longer).is_err());
        assert!(Network::from_bytes(&[]).is_err());
    }

    #[test]
    fn un_accumulateur_qui_pourrait_deborder_est_refuse() {
        // L'unité 5 : un biais de 767 et 32 poids de 1 000 atteignent tout
        // juste `i16::MAX` — admis. Un de plus au biais ne l'est plus.
        let limit = |bias: i16| {
            let mut values = vec![0; VALUES];
            values[BIAS_AT + 5] = bias;
            for input in 0..32 {
                values[input * 7 * HIDDEN + 5] = if input % 2 == 0 { 1_000 } else { -1_000 };
            }
            Network::from_bytes(&file_of(&values))
        };
        assert!(limit(767).is_ok(), "32 767 tient dans un i16");
        assert!(limit(-767).is_ok(), "le signe du biais ne compte pas");
        assert!(limit(768).is_err(), "32 768 n'y tient pas");
        assert!(limit(-768).is_err());

        // Seuls les 32 plus grands comptent : un 33ᵉ poids ne rend pas
        // refusable un réseau qui ne peut jamais l'additionner aux 32 autres.
        let mut values = vec![0; VALUES];
        for input in 0..33 {
            values[input * HIDDEN] = 1_000;
        }
        values[BIAS_AT] = 767;
        assert!(Network::from_bytes(&file_of(&values)).is_ok());
    }

    #[test]
    fn un_produit_scalaire_qui_pourrait_deborder_est_refuse() {
        // 256 poids totalisant exactement 33 025 : le pire produit scalaire,
        // 65 025 × 33 025 = 2 147 450 625, tient dans un i32. Un de plus, non.
        let total = |extra: i16| {
            let mut values = vec![0; VALUES];
            for index in 0..2 * HIDDEN {
                values[OUTPUT_AT + index] = if index % 3 == 0 { -129 } else { 129 };
            }
            // 256 × 129 = 33 024.
            values[OUTPUT_AT] -= extra;
            Network::from_bytes(&file_of(&values))
        };
        assert!(total(1).is_ok(), "33 025 est admis");
        assert!(total(2).is_err(), "33 026 ne l'est pas");
    }

    #[test]
    fn le_pire_reseau_admis_ne_deborde_pas_et_reste_hors_des_mats() {
        // Tout sature : chaque unité à 1 000 avant activation, donc à `QA²`
        // après, et les poids de sortie au plus que la borne admet. En debug,
        // un débordement paniquerait ici — c'est ce que la borne garantit.
        for sign in [1, -1] {
            let network = network_with(|values| {
                for unit in 0..HIDDEN {
                    values[BIAS_AT + unit] = 1_000;
                }
                for index in 0..2 * HIDDEN {
                    values[OUTPUT_AT + index] = sign * 129;
                }
                values[OUTPUT_BIAS_AT] = sign * i16::MAX;
            });
            let accumulators = network.refresh(&board(FENS[0]));
            let expected = i32::from(sign) * (MATE_THRESHOLD - 1);
            assert_eq!(network.evaluate(&accumulators, Color::White), expected);
            assert_eq!(network.evaluate(&accumulators, Color::Black), expected);
        }
    }

    #[test]
    fn un_calcul_a_la_main_retombe_sur_les_troncatures_de_bullet() {
        // Seul le biais de sortie : QA × QB vaut « 1,0 », soit 400 centièmes.
        let biais = network_with(|values| values[OUTPUT_BIAS_AT] = 16_320);
        let start = board(FENS[0]);
        assert_eq!(biais.evaluate(&biais.refresh(&start), Color::White), 400);

        // Une unité, alimentée par le roi du camp qui la regarde : l'entrée
        // 324 est « mon roi en e1 » pour chaque camp de la position initiale.
        // 255² × w / 255 = 255 × w, puis × 400 / 16 320 : w = 64 donne 400
        // tout rond ; w = 1 donne 6,25, et w = −1 donne −6,25 — tronqués
        // vers ZÉRO par bullet, en 6 et −6. Une division euclidienne rendrait
        // −7.
        for (weight, expected) in [(64, 400), (1, 6), (-1, -6)] {
            let network = network_with(|values| {
                values[324 * HIDDEN] = 255;
                values[OUTPUT_AT] = weight;
            });
            let accumulators = network.refresh(&start);
            assert_eq!(network.evaluate(&accumulators, Color::White), expected);
            let black: Board = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"
                .parse()
                .unwrap();
            assert_eq!(
                network.evaluate(&network.refresh(&black), Color::Black),
                expected,
                "les Noirs voient leur roi en e1, eux aussi"
            );
        }

        // Au-delà de QA, l'activation plafonne : 300 compte comme 255.
        let sature = network_with(|values| {
            values[324 * HIDDEN] = 300;
            values[OUTPUT_AT] = 64;
        });
        assert_eq!(sature.evaluate(&sature.refresh(&start), Color::White), 400);
        // Et sous zéro, elle s'annule.
        let negatif = network_with(|values| {
            values[324 * HIDDEN] = -300;
            values[OUTPUT_AT] = 64;
        });
        assert_eq!(negatif.evaluate(&negatif.refresh(&start), Color::White), 0);
    }

    #[test]
    fn les_indices_suivent_la_convention_de_bullet() {
        // À la main, depuis `Chess768` et `ChessBoard::from_raw`.
        assert_eq!(
            feature(Color::White, Color::White, Piece::King, Square::E1),
            324
        );
        assert_eq!(
            feature(Color::Black, Color::White, Piece::King, Square::E1),
            764
        );
        assert_eq!(
            feature(Color::Black, Color::Black, Piece::King, Square::E8),
            324
        );
        assert_eq!(
            feature(Color::White, Color::Black, Piece::King, Square::E8),
            764
        );
        assert_eq!(
            feature(Color::White, Color::White, Piece::Pawn, Square::A2),
            8
        );
        assert_eq!(
            feature(Color::Black, Color::White, Piece::Pawn, Square::A2),
            432
        );
        assert_eq!(
            feature(Color::White, Color::Black, Piece::Queen, Square::D8),
            699
        );
        assert_eq!(
            feature(Color::Black, Color::Black, Piece::Queen, Square::D8),
            259
        );
    }

    /// Ce que bullet calcule, recopié pas à pas de son source : l'échiquier
    /// retourné quand les Noirs ont le trait (`from_raw`), puis les deux
    /// indices de `Chess768::map_features`. Rend les paires (trait, autre).
    fn bullet_features(board: &Board) -> Vec<(usize, usize)> {
        let black = board.side_to_move() == Color::Black;
        let mut out = Vec::new();
        for color in Color::ALL {
            for piece in Piece::ALL {
                for square in board.colored_pieces(color, piece) {
                    // `swap_bytes` sur un bitboard retourne les rangées ; et
                    // les couleurs s'échangent : le bit 8 marque l'adversaire
                    // du camp au trait.
                    let sq = if black {
                        square as usize ^ 56
                    } else {
                        square as usize
                    };
                    let c = usize::from(color != board.side_to_move());
                    let pc = 64 * piece as usize;
                    let stm = [0, 384][c] + pc + sq;
                    let ntm = [384, 0][c] + pc + (sq ^ 56);
                    out.push((stm, ntm));
                }
            }
        }
        out.sort_unstable();
        out
    }

    #[test]
    fn les_indices_sont_ceux_du_pipeline_de_bullet() {
        for position in positions() {
            let us = position.side_to_move();
            let mut ours = Vec::new();
            for color in Color::ALL {
                for piece in Piece::ALL {
                    for square in position.colored_pieces(color, piece) {
                        ours.push((
                            feature(us, color, piece, square),
                            feature(!us, color, piece, square),
                        ));
                    }
                }
            }
            ours.sort_unstable();
            assert_eq!(ours, bullet_features(&position), "sur {position}");
        }
    }

    /// Ce que le coup fait vraiment à l'échiquier, lu case par case.
    fn true_changes(before: &Board, after: &Board) -> Vec<(bool, usize, usize, usize)> {
        let mut out = Vec::new();
        for square in Square::ALL {
            let b = before.piece_on(square).zip(before.color_on(square));
            let a = after.piece_on(square).zip(after.color_on(square));
            if a == b {
                continue;
            }
            if let Some((piece, color)) = b {
                out.push((false, piece as usize, color as usize, square as usize));
            }
            if let Some((piece, color)) = a {
                out.push((true, piece as usize, color as usize, square as usize));
            }
        }
        out.sort_unstable();
        out
    }

    #[test]
    fn les_changements_d_un_coup_sont_ceux_de_l_echiquier() {
        let (mut castles, mut en_passant, mut promotions, mut checked) = (0, 0, 0, 0);
        for position in positions() {
            for mv in moves_of(&position) {
                let mut buffer = [BLANK; 4];
                let count = changes(&position, mv, &mut buffer);
                let mut derived: Vec<_> = buffer[..count]
                    .iter()
                    .map(|c| {
                        (
                            c.added,
                            c.piece as usize,
                            c.color as usize,
                            c.square as usize,
                        )
                    })
                    .collect();
                derived.sort_unstable();
                let mut after = position.clone();
                after.play_unchecked(mv);
                assert_eq!(
                    derived,
                    true_changes(&position, &after),
                    "{mv} sur {position}"
                );

                let moving = position.piece_on(mv.from).unwrap();
                castles += usize::from(
                    moving == Piece::King && position.colors(position.side_to_move()).has(mv.to),
                );
                en_passant += usize::from(
                    moving == Piece::Pawn
                        && mv.from.file() != mv.to.file()
                        && position.piece_on(mv.to).is_none(),
                );
                promotions += usize::from(mv.promotion.is_some());
                checked += 1;
            }
        }
        // Sans ces comptes, le test pourrait cesser de couvrir ce qu'il
        // annonce sans que rien ne bouge.
        assert!(castles >= 4, "roques couverts : {castles}");
        assert!(
            en_passant >= 4,
            "prises en passant couvertes : {en_passant}"
        );
        assert!(promotions >= 20, "promotions couvertes : {promotions}");
        assert!(checked >= 5_000, "coups vérifiés : {checked}");
    }

    #[test]
    fn l_increment_egale_le_recalcul() {
        let network = random_network(11);
        let mut checked = 0;
        for (index, position) in positions().into_iter().enumerate() {
            // Une position sur trois : le recalcul complet est cher en debug,
            // et les coups spéciaux sont déjà comptés par le test précédent.
            if index % 3 != 0 {
                continue;
            }
            let before = network.refresh(&position);
            for mv in moves_of(&position) {
                let mut after = before;
                network.apply_move(&before, &mut after, &position, mv);
                let mut child = position.clone();
                child.play_unchecked(mv);
                assert_eq!(after, network.refresh(&child), "{mv} sur {position}");
                checked += 1;
            }
        }
        assert!(checked >= 1_000, "coups vérifiés : {checked}");
    }

    /// Le calcul de référence : les octets du fichier relus sans passer par
    /// [`Network`], les entrées de [`bullet_features`], tout en `i64`, et les
    /// étapes de l'inférence de bullet. Rend la sortie AVANT la borne.
    fn reference(bytes: &[u8], board: &Board) -> i64 {
        let value =
            |index: usize| i64::from(i16::from_le_bytes([bytes[2 * index], bytes[2 * index + 1]]));
        let features = bullet_features(board);
        let activate = |x: i64| x.clamp(0, 255) * x.clamp(0, 255);
        let mut sum = 0i64;
        for unit in 0..HIDDEN {
            let mut stm = value(BIAS_AT + unit);
            let mut ntm = value(BIAS_AT + unit);
            for &(us, them) in &features {
                stm += value(us * HIDDEN + unit);
                ntm += value(them * HIDDEN + unit);
            }
            sum += activate(stm) * value(OUTPUT_AT + unit);
            sum += activate(ntm) * value(OUTPUT_AT + HIDDEN + unit);
        }
        (sum / 255 + value(OUTPUT_BIAS_AT)) * 400 / (255 * 64)
    }

    #[test]
    fn la_sortie_est_celle_du_calcul_de_reference() {
        // Deux réseaux : l'un aux poids d'un réseau entraîné, l'autre plus
        // petits, pour que la sortie ne soit pas toujours bornée.
        for (seed, hidden, output) in [(3, 300, 127), (5, 40, 20)] {
            let bytes = file_of(&random_values(seed, hidden, output));
            let network = Network::from_bytes(&bytes).unwrap();
            let bound = i64::from(MATE_THRESHOLD - 1);
            let mut inside = 0;
            for position in positions() {
                let expected = reference(&bytes, &position);
                inside += usize::from(expected.abs() < bound);
                let got = network.evaluate(&network.refresh(&position), position.side_to_move());
                assert_eq!(
                    i64::from(got),
                    expected.clamp(-bound, bound),
                    "sur {position}"
                );
            }
            assert!(inside > 0, "le réseau {seed} ne rend que des bornes");
        }
    }

    /// La même position, couleurs échangées et échiquier retourné.
    fn mirror(board: &Board) -> Board {
        let text = board.to_string();
        let fields: Vec<&str> = text.split(' ').collect();
        let placement: Vec<String> = fields[0]
            .split('/')
            .rev()
            .map(|rank| {
                rank.chars()
                    .map(|c| {
                        if c.is_ascii_uppercase() {
                            c.to_ascii_lowercase()
                        } else {
                            c.to_ascii_uppercase()
                        }
                    })
                    .collect()
            })
            .collect();
        let side = if fields[1] == "w" { "b" } else { "w" };
        let castling: String = if fields[2] == "-" {
            "-".to_owned()
        } else {
            ['K', 'Q', 'k', 'q']
                .into_iter()
                .filter(|&right| {
                    let swapped = if right.is_ascii_uppercase() {
                        right.to_ascii_lowercase()
                    } else {
                        right.to_ascii_uppercase()
                    };
                    fields[2].contains(swapped)
                })
                .collect()
        };
        let en_passant = if fields[3] == "-" {
            "-".to_owned()
        } else {
            let (file, rank) = fields[3].split_at(1);
            format!("{file}{}", if rank == "3" { "6" } else { "3" })
        };
        format!(
            "{} {side} {castling} {en_passant} {} {}",
            placement.join("/"),
            fields[4],
            fields[5]
        )
        .parse()
        .unwrap()
    }

    #[test]
    fn une_position_et_son_miroir_s_evaluent_pareil() {
        // Vrai de TOUT réseau aux entrées relatives : chaque camp s'y voit
        // blanc. Une case retournée d'un seul côté, une couleur mal
        // rapportée, et l'égalité tombe — quels que soient les poids.
        let network = random_network(13);
        for position in positions() {
            let mirrored = mirror(&position);
            assert_eq!(
                network.evaluate(&network.refresh(&position), position.side_to_move()),
                network.evaluate(&network.refresh(&mirrored), mirrored.side_to_move()),
                "{position} contre {mirrored}"
            );
        }
    }
}
