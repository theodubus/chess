//! Évaluation NNUE (B4, chantier A21) : un petit réseau `(768 → 128) × 2 → 1`,
//! embarqué dans le binaire ([`embedded`]) et employé par défaut par la couche
//! UCI ; l'option `EvalFile` en charge un autre, ou rend l'évaluation faite
//! main. La recherche seule (`Search::new`) évalue à la main : sans réseau,
//! rien ne change, pas un nœud de différence.
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
//! - **Les seaux** (n° 17 ; [`Arch`]) : avec des seaux de roi
//!   (`ChessBucketsMirrored`), chaque camp lit ses entrées dans le bloc de
//!   768 que choisit la case de son roi, dans son propre repère, la colonne
//!   retournée si ce roi est sur e à h ; avec des seaux de sortie
//!   (`MaterialCount`), un jeu de poids de sortie par tranche du nombre de
//!   pièces. Le fichier range les lignes bloc par bloc, et les poids de
//!   sortie seau par seau — la transposée de la matrice de bullet. Sans
//!   seaux, tout cela vaut l'identité : un bloc, pas de retournement, un
//!   seau.
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
//! unité, avec ses 32 plus grands poids, sortirait d'un `i16`. Il refuse
//! aussi un poids de sortie au-delà de `i16::MAX / QA` = 128 en valeur
//! absolue : le produit d'une activation bornée par son poids tient alors
//! sur seize bits, ce dont le produit scalaire a besoin pour se vectoriser
//! (voir `dot`). Cette borne suffit au produit scalaire lui-même, à toute
//! largeur : il se somme en `i32` par tranches de 256 termes d'au plus
//! `QA² × 128` — une tranche tient, ce qu'une assertion vérifie à la
//! COMPILATION —, puis en `i64`, comme le reste. Un réseau entraîné par
//! bullet avec ses réglages par défaut passe les deux : `AdamW` y borne les
//! poids à ±1,98, soit 505 et 127 une fois quantifiés — 16 665 au plus dans
//! un accumulateur, 127 par poids de sortie.
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

use std::sync::{Arc, OnceLock};

use cozy_chess::{Board, Color, File, Move, Piece, Square};

use crate::eval::MATE_THRESHOLD;

/// Nombre d'entrées : 2 camps relatifs × 6 pièces × 64 cases.
pub const INPUTS: usize = 768;

/// Taille de la couche cachée, pour chacune des deux perspectives.
pub const HIDDEN: usize = 256;

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

/// L'architecture d'un réseau au-delà de sa largeur : ce que son fichier ne
/// dit pas, et que le moteur doit savoir pour le lire (n° 17). Lue au source
/// de bullet `10e7e82` — `ChessBucketsMirrored`
/// (`bullet_lib/src/game/inputs/chess_buckets.rs`) et `MaterialCount`
/// (`bullet_lib/src/game/outputs.rs`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Arch {
    /// Les seaux de roi : une disposition de 32 cases — les colonnes a à d
    /// de chaque rangée, la rangée 1 d'abord —, que bullet étend en miroir
    /// aux colonnes e à h. `None` : les entrées `Chess768`, un seul bloc et
    /// pas de miroir.
    pub king_buckets: Option<[u8; 32]>,
    /// Le nombre de seaux de sortie, de 1 à 32 : un jeu de poids de sortie
    /// par tranche du nombre de pièces sur l'échiquier.
    pub output_buckets: usize,
    /// Les couches denses après l'accumulateur. `None` : la sortie lit
    /// directement les deux accumulateurs activés, comme tous les réseaux
    /// embarqués jusqu'ici.
    pub layers: Option<Layers>,
}

/// Les couches denses d'un réseau multicouche (n° 23, feuille de route du
/// 31 oct., point 3) : la pile de l'exemple de bullet,
/// `examples/progression/4_multi_layer.rs` au commit `10e7e82`. Chaque
/// accumulateur passe par `CReLU`, et ses deux moitiés se multiplient terme
/// à terme — `HIDDEN / 2` produits par camp, le camp au trait d'abord ;
/// puis `HIDDEN → l1`, `SCReLU`, `l1 → l2`, `SCReLU`, `l2 → 1`, chaque
/// couche avec un jeu de poids par seau de sortie. La première est
/// quantifiée en `i8` par [`QL1`], les deux suivantes restent en flottants,
/// comme bullet les écrit.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Layers {
    /// Les sorties de la première couche dense, par seau.
    pub l1: usize,
    /// Les sorties de la deuxième, par seau.
    pub l2: usize,
}

/// Quantification des poids de la première couche dense d'un réseau
/// multicouche : `quantise::<i8>(64)` dans l'exemple de bullet.
pub const QL1: i32 = 64;

/// Les plus grandes couches denses que le moteur sait évaluer : leurs
/// sorties vivent sur la pile, sans allocation par évaluation.
const MAX_L1: usize = 64;
const MAX_L2: usize = 64;

impl Arch {
    /// Le nombre de blocs de [`INPUTS`] entrées : un par seau de roi.
    #[must_use]
    pub const fn input_buckets(&self) -> usize {
        let Some(layout) = self.king_buckets else {
            return 1;
        };
        let mut highest = 0;
        let mut index = 0;
        while index < layout.len() {
            if layout[index] > highest {
                highest = layout[index];
            }
            index += 1;
        }
        highest as usize + 1
    }

    /// Le nombre de `i16` du fichier, dans l'ordre où bullet les écrit : les
    /// lignes de la couche cachée, ses biais, puis pour chaque seau de sortie
    /// ses `2 × HIDDEN` poids, et enfin un biais par seau.
    #[must_use]
    pub const fn values(&self) -> usize {
        INPUTS * self.input_buckets() * HIDDEN + HIDDEN + self.output_buckets * (2 * HIDDEN + 1)
    }

    /// Les octets que bullet écrit avant son bourrage. Sans couches denses :
    /// les `i16` de [`Arch::values`]. Avec : l'accumulateur en `i16`, la
    /// première couche dense en `i8`, ses biais et les deux couches
    /// suivantes en `f32` — `l1w`, `l1b`, `l2w`, `l2b`, `l3w`, `l3b`, dans
    /// l'ordre de `SavedFormat`.
    #[must_use]
    pub const fn bytes(&self) -> usize {
        let Some(layers) = self.layers else {
            return 2 * self.values();
        };
        let buckets = self.output_buckets;
        let floats = buckets * layers.l1
            + buckets * layers.l2 * layers.l1
            + buckets * layers.l2
            + buckets * layers.l2
            + buckets;
        2 * (INPUTS * self.input_buckets() * HIDDEN + HIDDEN)
            + buckets * layers.l1 * HIDDEN
            + 4 * floats
    }

    /// Taille exacte d'un fichier de ce réseau : ses octets, puis le
    /// bourrage de bullet jusqu'au multiple de 64.
    #[must_use]
    pub const fn file_bytes(&self) -> usize {
        self.bytes().div_ceil(64) * 64
    }

    /// Le bloc d'entrées et le retournement de colonne que choisit le roi de
    /// `perspective` sur `king` : l'entrée `f` de ce camp devient
    /// `décalage + (f ^ masque)`. Dans le repère du camp — son roque en bas,
    /// `our_ksq` et `opp_ksq ^ 56` de `bulletformat` —, le seau est celui de
    /// la disposition, et un roi sur les colonnes e à h retourne la colonne
    /// de chaque entrée (`^ 7`), comme `ChessBucketsMirrored::map_features`.
    #[must_use]
    pub fn king_key(&self, perspective: Color, king: Square) -> (usize, usize) {
        let Some(layout) = self.king_buckets else {
            return (0, 0);
        };
        let square = relative(perspective, king);
        let (file, rank) = (square % 8, square / 8);
        let mirrored = file > 3;
        let column = if mirrored { 7 - file } else { file };
        let bucket = usize::from(layout[4 * rank + column]);
        (INPUTS * bucket, if mirrored { 7 } else { 0 })
    }

    /// L'indice d'une pièce vue par `perspective`, dont le roi est sur
    /// `king` : l'entrée `Chess768` de [`feature`], déplacée dans le bloc du
    /// seau et retournée s'il le faut.
    #[must_use]
    pub fn feature(
        &self,
        perspective: Color,
        king: Square,
        color: Color,
        piece: Piece,
        square: Square,
    ) -> usize {
        bucketed(
            self.king_key(perspective, king),
            perspective,
            color,
            piece,
            square,
        )
    }

    /// Le seau de sortie d'une position qui porte `pieces` pièces, rois
    /// compris : `(pièces − 2) / ⌈32 / seaux⌉`, comme `MaterialCount::bucket`.
    #[must_use]
    pub const fn output_bucket(&self, pieces: usize) -> usize {
        pieces.saturating_sub(2) / 32usize.div_ceil(self.output_buckets)
    }
}

/// La disposition à dix seaux de roi de l'exemple de bullet,
/// `examples/progression/3_input_buckets.rs` au commit `10e7e82` : la rangée
/// 1 case par case, la 2 par paires de colonnes, puis une rangée, une
/// rangée, deux rangées, deux rangées (n° 17, N5r10).
#[rustfmt::skip]
pub const KING_BUCKETS_10: [u8; 32] = [
    0, 1, 2, 3,
    4, 4, 5, 5,
    6, 6, 6, 6,
    7, 7, 7, 7,
    8, 8, 8, 8,
    8, 8, 8, 8,
    9, 9, 9, 9,
    9, 9, 9, 9,
];

/// La même, grossie à quatre seaux : la rangée 1 par paires de colonnes, la
/// rangée 2, puis tout le reste. Lue nulle part — un choix (n° 17, N5r4).
#[rustfmt::skip]
pub const KING_BUCKETS_4: [u8; 32] = [
    0, 0, 1, 1,
    2, 2, 2, 2,
    3, 3, 3, 3,
    3, 3, 3, 3,
    3, 3, 3, 3,
    3, 3, 3, 3,
    3, 3, 3, 3,
    3, 3, 3, 3,
];

/// L'architecture des réseaux de ce binaire, l'embarqué comme ceux
/// qu'`EvalFile` charge : N6r4, quatre seaux de roi en miroir, huit seaux de sortie.
pub const ARCH: Arch = Arch {
    king_buckets: Some(KING_BUCKETS_4),
    output_buckets: 8,
    layers: None,
};

// Une couche dense multiplie les deux moitiés d'un accumulateur : il en
// faut deux.
const _: () = assert!(ARCH.layers.is_none() || HIDDEN.is_multiple_of(2));

// Un seau de sortie par tranche du nombre de pièces : de 1 à 32 seaux, le
// plus haut — 32 pièces — tombant toujours sous `output_buckets`.
const _: () = assert!(ARCH.output_buckets >= 1 && ARCH.output_buckets <= MAX_PIECES);

/// Taille exacte d'un fichier de réseau de ce binaire. Un réseau d'une autre
/// architecture a une autre taille de fichier, et il est refusé.
pub const FILE_BYTES: usize = ARCH.file_bytes();

/// Nombre de `i16` d'un fichier de réseau de ce binaire.
#[cfg(test)]
const VALUES: usize = ARCH.values();

/// Le plus grand poids de sortie admis, en valeur absolue : `QA` fois lui
/// tient dans un `i16`, si bien que [`dot`] peut multiplier sur seize bits.
const MAX_OUTPUT_WEIGHT: i32 = i16::MAX as i32 / QA;

/// Le nombre de termes que [`dot`] somme en `i32` avant de passer en `i64`.
const DOT_CHUNK: usize = 256;

// Une tranche de `DOT_CHUNK` termes d'au plus `QA² × 128` chacun tient dans
// un `i32` — 2 130 739 200, sous `i32::MAX` — dès que chaque poids de sortie
// respecte la borne. Vérifié à la compilation. Les tranches, et les deux
// camps, se somment en `i64` : aucune largeur de couche ne fait déborder le
// produit, la borne par poids suffit, et rien ne reste à vérifier à
// l'exécution (n° 17, étape 1). Avant, la largeur entière se sommait en
// `i32`, et une couche de plus de 128 unités cessait de compiler.
const _: () = assert!(
    DOT_CHUNK as i64 * MAX_OUTPUT_WEIGHT as i64 * (QA as i64 * QA as i64) <= i32::MAX as i64
);

/// `QA` en `i16`, la borne de l'activation dans [`dot`].
const QA_I16: i16 = {
    assert!(QA <= i16::MAX as i32);
    QA as i16
};

// Les recalculs d'un camp dans `apply_move`, comptés par fil pour les tests :
// un recalcul fait à la place d'une mise à jour rend le même accumulateur, et
// seul ce compte distingue l'un de l'autre.
#[cfg(test)]
thread_local! {
    static REFRESHES: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

/// Une ligne de poids nulle : ce que [`Network::apply_move`] ajoute ou retire
/// à la place d'une pièce qu'un coup ne déplace pas, pour que tous les coups
/// passent par le même calcul.
static ZERO_ROW: [i16; HIDDEN] = [0; HIDDEN];

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
    side + 64 * piece as usize + relative(perspective, square)
}

/// L'entrée `Chess768` d'une pièce, placée dans le bloc et sous le
/// retournement `(offset, flip)` que choisit le roi du camp
/// ([`Arch::king_key`]) : la seule écriture de cette règle, que l'indice
/// d'[`Arch::feature`], le recalcul et la mise à jour empruntent tous.
fn bucketed(
    (offset, flip): (usize, usize),
    perspective: Color,
    color: Color,
    piece: Piece,
    square: Square,
) -> usize {
    offset + (feature(perspective, color, piece, square) ^ flip)
}

/// Une case dans le repère de `perspective` : retournée (`^ 56`) pour les
/// Noirs, chacun se voyant « blanc », son roque en bas.
fn relative(perspective: Color, square: Square) -> usize {
    if perspective == Color::White {
        square as usize
    } else {
        square as usize ^ 56
    }
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

/// Le produit scalaire d'une moitié activée par SCReLU — l'entrée bornée à
/// `[0, QA]` puis élevée au carré — et de ses poids de sortie.
///
/// `c² · w` s'écrit `(c · w) · c`, et ce n'est pas une coquetterie : `c · w`
/// tient sur seize bits — `c ≤ QA`, `|w| ≤ MAX_OUTPUT_WEIGHT`, vérifié au
/// chargement —, et cette forme laisse le compilateur employer la
/// multiplication seize bits puis la multiplication-addition par paires
/// (`vpmullw`, `vpmaddwd` en AVX2) là où `c² · w` lui faisait faire deux
/// multiplications trente-deux bits par terme. Même valeur au bit près — des
/// entiers, sans arrondi —, donc même arbre (n° 16, chemin A).
///
/// La somme se fait en `i32` par tranches de [`DOT_CHUNK`] termes, puis en
/// `i64` : à 128 unités, une seule tranche par camp, les mêmes entiers.
///
/// Sur un processeur AVX2, le calcul passe par [`avx2`] : le compilateur ne
/// sort de cette forme que des instructions de 128 bits (lu au code machine
/// le 20 oct. 2026), quand AVX2 en traite 256. Les mêmes entiers, sommés dans
/// un autre ordre — exact, sans débordement possible (voir [`DOT_CHUNK`]).
fn dot(values: &[i16], weights: &[i16]) -> i64 {
    #[cfg(target_arch = "x86_64")]
    if let Some(sum) = avx2::dot(values, weights) {
        return sum;
    }
    dot_scalar(values, weights)
}

/// Le produit scalaire de [`dot`] en Rust ordinaire : la définition, que le
/// chemin AVX2 doit rendre au bit près, et le calcul de tout processeur qui
/// n'a pas AVX2.
fn dot_scalar(values: &[i16], weights: &[i16]) -> i64 {
    values
        .chunks(DOT_CHUNK)
        .zip(weights.chunks(DOT_CHUNK))
        .map(|(values, weights)| {
            let chunk: i32 = values
                .iter()
                .zip(weights)
                .map(|(&value, &weight)| {
                    let clipped = value.clamp(0, QA_I16);
                    i32::from(clipped.wrapping_mul(weight)) * i32::from(clipped)
                })
                .sum();
            i64::from(chunk)
        })
        .sum()
}

/// Le produit scalaire en instructions AVX2 écrites à la main — le seul
/// `unsafe` du dépôt. Théo, 20 oct. 2026 : « *Si annuler cette décision
/// augmente l'elo long terme, je le fais. Le but absolu est la perf* ». Les
/// conditions écrites le même jour (`CLAUDE.md`, Style) : confiné à ce
/// module, derrière la détection du jeu d'instructions, confronté en test au
/// calcul scalaire, entré seulement s'il rend du temps à arbre identique.
///
/// Par 16 termes : l'entrée bornée à `[0, QA]` (`vpmaxsw`, `vpminsw`), son
/// produit seize bits par le poids (`vpmullw`) — exact, `|c · w| ≤ 32 640` —,
/// puis la multiplication-addition par paires avec l'entrée (`vpmaddwd`), qui
/// rend huit sommes `i32` de deux termes `c² · w`.
#[cfg(target_arch = "x86_64")]
#[allow(unsafe_code)]
mod avx2 {
    use std::arch::x86_64::{
        __m256i, _mm256_add_epi32, _mm256_loadu_si256, _mm256_madd_epi16, _mm256_max_epi16,
        _mm256_min_epi16, _mm256_mullo_epi16, _mm256_set1_epi16, _mm256_setzero_si256,
        _mm256_storeu_si256,
    };

    use super::{DOT_CHUNK, QA_I16};

    /// Les termes d'un registre AVX2 : seize `i16`.
    const LANES: usize = 16;

    // Les produits scalaires passés par AVX2, et les termes laissés au
    // reste scalaire, comptés par fil pour les tests : un chemin AVX2 jamais
    // pris, ou qui laisse au reste un registre qu'il pouvait traiter, rend
    // le même résultat que le scalaire, et seuls ces comptes le distinguent.
    #[cfg(test)]
    thread_local! {
        pub(super) static DOTS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
        pub(super) static TAIL: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
    }

    /// Le produit scalaire de [`super::dot_scalar`] en AVX2, ou `None` si le
    /// processeur ne l'a pas. Compilé pour AVX2 (`x86-64-v3`), la détection
    /// est une constante ; sinon une lecture mise en cache par la
    /// bibliothèque standard.
    pub(super) fn dot(values: &[i16], weights: &[i16]) -> Option<i64> {
        if !std::arch::is_x86_feature_detected!("avx2") {
            return None;
        }
        #[cfg(test)]
        DOTS.with(|count| count.set(count.get() + 1));
        // SAFETY : AVX2 vient d'être détecté sur le processeur qui exécute.
        Some(unsafe { dot_avx2(values, weights) })
    }

    /// # Safety
    /// Le processeur doit porter AVX2.
    #[target_feature(enable = "avx2")]
    unsafe fn dot_avx2(values: &[i16], weights: &[i16]) -> i64 {
        let len = values.len().min(weights.len());
        let zero = _mm256_setzero_si256();
        let qa = _mm256_set1_epi16(QA_I16);
        let mut total = 0_i64;
        let mut start = 0;
        while start < len {
            let end = (start + DOT_CHUNK).min(len);
            let mut lanes = zero;
            let mut index = start;
            while index + LANES <= end {
                // SAFETY : `index + LANES ≤ end ≤ len`, la longueur de la
                // plus courte des deux tranches ; les lectures non alignées
                // n'exigent rien de plus.
                let (value, weight) = unsafe {
                    (
                        _mm256_loadu_si256(values.as_ptr().add(index).cast::<__m256i>()),
                        _mm256_loadu_si256(weights.as_ptr().add(index).cast::<__m256i>()),
                    )
                };
                let clipped = _mm256_min_epi16(_mm256_max_epi16(value, zero), qa);
                let products = _mm256_mullo_epi16(clipped, weight);
                lanes = _mm256_add_epi32(lanes, _mm256_madd_epi16(products, clipped));
                index += LANES;
            }
            let mut sums = [0_i32; 8];
            // SAFETY : `sums` tient exactement un registre de 256 bits.
            unsafe { _mm256_storeu_si256(sums.as_mut_ptr().cast::<__m256i>(), lanes) };
            let mut chunk: i32 = sums.iter().sum();
            for (&value, &weight) in values[index..end].iter().zip(&weights[index..end]) {
                let clipped = value.clamp(0, QA_I16);
                chunk += i32::from(clipped.wrapping_mul(weight)) * i32::from(clipped);
                #[cfg(test)]
                TAIL.with(|count| count.set(count.get() + 1));
            }
            total += i64::from(chunk);
            start = end;
        }
        total
    }
}

/// Un réseau quantifié, tel que bullet l'écrit.
pub struct Network {
    /// Son architecture.
    arch: Arch,
    /// Pour chaque camp et chaque case de son roi, le bloc et le
    /// retournement de [`Arch::king_key`], calculés une fois au chargement.
    king_keys: [[(usize, usize); 64]; 2],
    /// Le seau de sortie de chaque nombre de pièces, de 0 à 32 — calculé une
    /// fois, pour qu'une évaluation ne paie pas une division.
    output_buckets: [usize; MAX_PIECES + 1],
    /// Une ligne de `HIDDEN` poids par entrée, bloc de roi par bloc de roi,
    /// quantifiés par `QA`.
    feature_weights: Box<[[i16; HIDDEN]]>,
    /// Les biais de la couche cachée, quantifiés par `QA`.
    feature_bias: [i16; HIDDEN],
    /// Pour chaque seau de sortie, les poids du camp au trait puis ceux de
    /// l'autre, quantifiés par `QB`.
    output_weights: Box<[[i16; 2 * HIDDEN]]>,
    /// Un biais de sortie par seau, quantifié par `QA × QB`.
    output_bias: Box<[i16]>,
    /// Les couches denses d'un réseau multicouche ; `None`, la sortie lit
    /// les accumulateurs.
    dense: Option<Dense>,
}

/// Les poids des couches denses, seau par seau, sortie par sortie : le
/// format de bullet, chaque matrice transposée en lignes de sortie.
struct Dense {
    layers: Layers,
    /// `[seau][l1][HIDDEN]`, quantifiés par [`QL1`].
    l1_weights: Box<[i8]>,
    /// `[seau][l1]`.
    l1_bias: Box<[f32]>,
    /// `[seau][l2][l1]`.
    l2_weights: Box<[f32]>,
    /// `[seau][l2]`.
    l2_bias: Box<[f32]>,
    /// `[seau][l2]`.
    l3_weights: Box<[f32]>,
    /// `[seau]`.
    l3_bias: Box<[f32]>,
}

/// `SCReLU` : `clamp(x, 0, 1)²`.
fn screlu(x: f32) -> f32 {
    let y = x.clamp(0.0, 1.0);
    y * y
}

impl Dense {
    /// Lit les couches denses à la suite de l'accumulateur, et refuse un
    /// flottant qui n'est pas fini : un NaN ne fait rien planter, il rend
    /// des évaluations qui ne veulent rien dire.
    fn read(bytes: &[u8], layers: Layers, buckets: usize) -> Result<Self, String> {
        if layers.l1 == 0 || layers.l1 > MAX_L1 || layers.l2 == 0 || layers.l2 > MAX_L2 {
            return Err(format!(
                "couches denses {} et {} : de 1 à {MAX_L1} et de 1 à {MAX_L2} sorties",
                layers.l1, layers.l2
            ));
        }
        let l1_count = buckets * layers.l1 * HIDDEN;
        let (l1, rest) = bytes
            .split_at_checked(l1_count)
            .ok_or("couches denses tronquées")?;
        let (floats, _) = rest.as_chunks::<4>();
        let mut floats = floats.iter().map(|&b| f32::from_le_bytes(b));
        let mut take = |n: usize| -> Result<Box<[f32]>, String> {
            let v: Vec<f32> = floats.by_ref().take(n).collect();
            if v.len() != n {
                return Err("couches denses tronquées".to_owned());
            }
            if let Some(x) = v.iter().find(|x| !x.is_finite()) {
                return Err(format!("un poids dense vaut {x}"));
            }
            Ok(v.into_boxed_slice())
        };
        Ok(Self {
            layers,
            l1_weights: l1.iter().map(|&b| b.cast_signed()).collect(),
            l1_bias: take(buckets * layers.l1)?,
            l2_weights: take(buckets * layers.l2 * layers.l1)?,
            l2_bias: take(buckets * layers.l2)?,
            l3_weights: take(buckets * layers.l2)?,
            l3_bias: take(buckets)?,
        })
    }

    /// La sortie du réseau pour le seau `bucket`, en unités de la sortie de
    /// bullet — avant `× SCALE`. La première couche se calcule en entiers,
    /// au produit près : chaque activation est le produit de deux `CReLU`
    /// quantifiées par `QA`, au plus 65 025, et une tranche de
    /// [`DOT_CHUNK`] termes tient dans un `i32` (vérifié à la compilation,
    /// plus bas). Les couches suivantes, dix fois plus petites, en `f32`,
    /// dans un ordre fixe : le compilateur ne réordonne pas des additions
    /// flottantes, donc tous les binaires rendent la même évaluation.
    fn forward(&self, us: &Accumulator, them: &Accumulator, bucket: usize) -> f32 {
        const HALF: usize = HIDDEN / 2;
        let crelu = |v: i16| i32::from(v.clamp(0, QA_I16));
        let mut activations = [0i32; HIDDEN];
        for (side, accumulator) in [us, them].into_iter().enumerate() {
            let (low, high) = accumulator.0.split_at(HALF);
            for (j, (&a, &b)) in low.iter().zip(high).enumerate() {
                activations[side * HALF + j] = crelu(a) * crelu(b);
            }
        }
        let Layers { l1, l2 } = self.layers;
        let mut first = [0f32; MAX_L1];
        let rows = self
            .l1_weights
            .as_chunks::<HIDDEN>()
            .0
            .iter()
            .skip(bucket * l1);
        for ((out, row), &bias) in first[..l1]
            .iter_mut()
            .zip(rows)
            .zip(&self.l1_bias[bucket * l1..])
        {
            let mut sum = 0i64;
            for (a, w) in activations.chunks(DOT_CHUNK).zip(row.chunks(DOT_CHUNK)) {
                let part: i32 = a.iter().zip(w).map(|(&a, &w)| a * i32::from(w)).sum();
                sum += i64::from(part);
            }
            *out = screlu(sum as f32 / L1_SCALE + bias);
        }
        let mut second = [0f32; MAX_L2];
        let rows = self.l2_weights.chunks_exact(l1).skip(bucket * l2);
        for ((out, row), &bias) in second[..l2]
            .iter_mut()
            .zip(rows)
            .zip(&self.l2_bias[bucket * l2..])
        {
            let mut sum = bias;
            for (&x, &w) in first[..l1].iter().zip(row) {
                sum += x * w;
            }
            *out = screlu(sum);
        }
        let mut output = self.l3_bias[bucket];
        for (&x, &w) in second[..l2].iter().zip(&self.l3_weights[bucket * l2..]) {
            output += x * w;
        }
        output
    }
}

/// Ce qui ramène le produit entier de la première couche dense à l'échelle
/// de bullet : chaque `CReLU` est quantifiée par `QA`, chaque poids par
/// [`QL1`].
const L1_SCALE: f32 = (QA * QA * QL1) as f32;

// Une tranche de `DOT_CHUNK` produits d'activations — au plus `QA²` — par
// des poids `i8` tient dans un `i32` : la première couche dense ne déborde
// à aucune largeur, comme le produit de sortie.
const _: () = assert!(DOT_CHUNK as i64 * 128 * (QA as i64 * QA as i64) <= i32::MAX as i64);

impl Network {
    /// Lit un réseau au format de bullet, et le REFUSE s'il pouvait déborder.
    ///
    /// # Errors
    /// Une taille qui n'est pas celle de l'architecture — un réseau d'une
    /// autre taille de couche cachée, ou un fichier qui n'est pas un réseau —,
    /// ou des poids qui pourraient faire déborder un accumulateur ou le
    /// produit scalaire.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
        Self::from_bytes_with(bytes, ARCH)
    }

    /// Lit un réseau d'une architecture donnée — celle du binaire pour
    /// [`Network::from_bytes`], une autre pour les tests et pour
    /// l'entraîneur.
    ///
    /// # Errors
    /// Ceux de [`Network::from_bytes`].
    pub fn from_bytes_with(bytes: &[u8], arch: Arch) -> Result<Self, String> {
        let expected = arch.file_bytes();
        if bytes.len() != expected {
            return Err(format!(
                "réseau de {} octets : l'architecture (768 × {} → {HIDDEN}) × 2 → {} en attend {expected}",
                bytes.len(),
                arch.input_buckets(),
                arch.output_buckets,
            ));
        }
        let accumulator_values = INPUTS * arch.input_buckets() * HIDDEN + HIDDEN;
        let (accumulator_bytes, dense_bytes) = match arch.layers {
            None => (bytes, &bytes[..0]),
            Some(_) => bytes.split_at(2 * accumulator_values),
        };
        let (pairs, _) = accumulator_bytes.as_chunks::<2>();
        let values: Vec<i16> = pairs.iter().map(|&pair| i16::from_le_bytes(pair)).collect();
        let (weights, rest) = values.split_at(INPUTS * arch.input_buckets() * HIDDEN);
        let (bias, rest) = rest.split_at(HIDDEN);
        let (output, output_bias): (&[i16], &[i16]) = match arch.layers {
            None => {
                let (output, rest) = rest.split_at(arch.output_buckets * 2 * HIDDEN);
                (output, &rest[..arch.output_buckets])
            }
            Some(_) => (&[], &[]),
        };
        let dense = match arch.layers {
            None => None,
            Some(layers) => Some(Dense::read(dense_bytes, layers, arch.output_buckets)?),
        };

        let mut king_keys = [[(0, 0); 64]; 2];
        for perspective in Color::ALL {
            for square in Square::ALL {
                king_keys[perspective as usize][square as usize] =
                    arch.king_key(perspective, square);
            }
        }
        let output_buckets = std::array::from_fn(|pieces| arch.output_bucket(pieces));
        let (rows, _) = weights.as_chunks::<HIDDEN>();
        let network = Self {
            arch,
            king_keys,
            output_buckets,
            feature_weights: Box::from(rows),
            feature_bias: <[i16; HIDDEN]>::try_from(bias)
                .map_err(|_| "biais de la couche cachée mal découpés".to_owned())?,
            output_weights: Box::from(output.as_chunks::<{ 2 * HIDDEN }>().0),
            output_bias: Box::from(output_bias),
            dense,
        };
        network.check_bounds()?;
        Ok(network)
    }

    /// Son architecture.
    #[must_use]
    pub const fn arch(&self) -> Arch {
        self.arch
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
        if let Some(&weight) = self
            .output_weights
            .iter()
            .flatten()
            .find(|&&weight| i32::from(weight).abs() > MAX_OUTPUT_WEIGHT)
        {
            return Err(format!(
                "un poids de sortie vaut {weight}, au-delà des ±{MAX_OUTPUT_WEIGHT} dont le \
                 produit par une activation tient sur seize bits"
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
        [
            self.refresh_side(board, Color::White),
            self.refresh_side(board, Color::Black),
        ]
    }

    /// L'accumulateur d'un camp, recalculé de zéro dans le bloc que choisit
    /// son roi.
    fn refresh_side(&self, board: &Board, perspective: Color) -> Accumulator {
        let key = self.king_keys[perspective as usize][board.king(perspective) as usize];
        let mut accumulator = Accumulator(self.feature_bias);
        for color in Color::ALL {
            for piece in Piece::ALL {
                for square in board.colored_pieces(color, piece) {
                    accumulator.add(self.row(bucketed(key, perspective, color, piece, square)));
                }
            }
        }
        accumulator
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
        let mut buffer = [BLANK; 4];
        let count = changes(board, mv, &mut buffer);
        let changes = &buffer[..count];
        if self.arch.king_buckets.is_none() {
            // Sans seaux de roi, un seul bloc et pas de retournement : le
            // chemin d'avant le n° 17, sans rien chercher du roi — mesuré,
            // le chercher coûtait 3,5 % du temps d'un nœud.
            for perspective in Color::ALL {
                self.update_side(before, after, perspective, changes, (0, 0));
            }
            return;
        }
        // Seul le roi du camp qui joue peut changer de case — la pièce
        // ajoutée qui est un roi, au roque comme ailleurs.
        let us = board.side_to_move();
        let king_to = changes
            .iter()
            .find(|change| change.added && change.piece == Piece::King)
            .map_or(board.king(us), |change| change.square);
        for perspective in Color::ALL {
            let keys = &self.king_keys[perspective as usize];
            let key = keys[board.king(perspective) as usize];
            if perspective == us && keys[king_to as usize] != key {
                // Le roi change de seau ou de côté : TOUTES les entrées de son
                // camp changent de bloc. Recalculé depuis l'enfant — un coup
                // de roi qui franchit une frontière, rare (n° 17).
                let mut child = board.clone();
                child.play_unchecked(mv);
                after[perspective as usize] = self.refresh_side(&child, perspective);
                #[cfg(test)]
                REFRESHES.with(|count| count.set(count.get() + 1));
                continue;
            }
            self.update_side(before, after, perspective, changes, key);
        }
    }

    /// L'accumulateur d'un camp après `changes`, dérivé de celui d'avant,
    /// dans le bloc et sous le retournement de `key` ([`Arch::king_key`]).
    ///
    /// Au plus deux pièces apparaissent et deux disparaissent — le roque ;
    /// les places libres lisent la ligne de zéros. Un seul passage écrit
    /// l'enfant depuis le parent, la copie fondue dans la mise à jour, et
    /// tous les coups prennent le même chemin (n° 16, chemin A).
    #[inline(always)]
    fn update_side(
        &self,
        before: &Accumulators,
        after: &mut Accumulators,
        perspective: Color,
        changes: &[Change],
        key: (usize, usize),
    ) {
        let mut added = [&ZERO_ROW; 2];
        let mut removed = [&ZERO_ROW; 2];
        let (mut adds, mut removes) = (0, 0);
        for change in changes {
            let row = self.row(bucketed(
                key,
                perspective,
                change.color,
                change.piece,
                change.square,
            ));
            let (slots, used) = if change.added {
                (&mut added, &mut adds)
            } else {
                (&mut removed, &mut removes)
            };
            if let Some(slot) = slots.get_mut(*used) {
                *slot = row;
                *used += 1;
            }
        }
        let [a0, a1] = added;
        let [r0, r1] = removed;
        let source = &before[perspective as usize].0;
        let target = &mut after[perspective as usize].0;
        for (i, value) in target.iter_mut().enumerate() {
            *value = source[i]
                .wrapping_add(a0[i])
                .wrapping_add(a1[i])
                .wrapping_sub(r0[i])
                .wrapping_sub(r1[i]);
        }
    }

    /// L'évaluation du réseau, en centièmes de pion, du point de vue du camp
    /// au trait — la convention qu'impose le negamax, comme pour
    /// [`crate::eval::evaluate`].
    ///
    /// Bornée à `MATE_THRESHOLD - 1` : une évaluation n'annonce jamais un mat.
    /// Le seau de sortie se lit au nombre de pièces de `board`, le camp au
    /// trait à son trait.
    #[must_use]
    pub fn evaluate(&self, accumulators: &Accumulators, board: &Board) -> i32 {
        let side_to_move = board.side_to_move();
        let bucket = self.output_buckets[board.occupied().len() as usize];
        if let Some(dense) = &self.dense {
            let output = dense.forward(
                &accumulators[side_to_move as usize],
                &accumulators[!side_to_move as usize],
                bucket,
            ) * SCALE as f32;
            let bound = (MATE_THRESHOLD - 1) as f32;
            return output.clamp(-bound, bound) as i32;
        }
        let weights = &self.output_weights[bucket];
        let (ours, theirs) = weights.split_at(HIDDEN);
        let sum = dot(&accumulators[side_to_move as usize].0, ours)
            + dot(&accumulators[!side_to_move as usize].0, theirs);
        // Les étapes et les troncatures de l'inférence de bullet, en `i64` :
        // `× SCALE` sortirait d'un `i32` bien avant que le produit scalaire ne
        // le fasse.
        let output = (sum / i64::from(QA) + i64::from(self.output_bias[bucket])) * i64::from(SCALE)
            / i64::from(QA * QB);
        let bound = i64::from(MATE_THRESHOLD - 1);
        i32::try_from(output.clamp(-bound, bound)).unwrap_or(0)
    }
}

/// Réseau de mesure, jamais embarqué : E21 (e21w50), le n° 22 — la tranche
/// entière du n° 21, 86 jobs à 5 000 nœuds étiquetés par N8tw50s800, 2,56 G
/// positions, poids du résultat 0,5, 400 superlots : `(768 × 4 → 256) × 2 →
/// 1`, quatre seaux de roi en miroir, huit seaux de sortie, depuis zéro. Le
/// tour de boucle, contre N8nw50. Entraîné le 6 nov. 2026 ; sa courbe de
/// perte et la sortie complète de l'entraînement sont à côté de lui, dans
/// `reseaux/`.
const EMBEDDED: &[u8] = include_bytes!("../../reseaux/e21w50-768x4hm-256-s8-400.bin");

/// Le réseau embarqué, lu une seule fois et partagé.
///
/// Passé au même chargeur qu'un fichier : il n'est pas plus sûr parce qu'il
/// est dans le binaire. Un test le charge et rejoue sa confrontation à
/// l'entraîneur à chaque build, si bien qu'un `Err` ici signalerait un
/// binaire construit sans passer les tests.
///
/// # Errors
/// Le refus de [`Network::from_bytes`].
pub fn embedded() -> Result<Arc<Network>, String> {
    static EMBEDDED_NETWORK: OnceLock<Result<Arc<Network>, String>> = OnceLock::new();
    EMBEDDED_NETWORK
        .get_or_init(|| Network::from_bytes(EMBEDDED).map(Arc::new))
        .clone()
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
        file_of_any(values)
    }

    /// Les octets d'un fichier, quelle que soit l'architecture.
    pub(crate) fn file_of_any(values: &[i16]) -> Vec<u8> {
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
        random_values_with(ARCH, seed, hidden, output)
    }

    /// Les valeurs d'un réseau aléatoire d'une architecture donnée, dans
    /// l'ordre du fichier.
    pub(crate) fn random_values_with(arch: Arch, seed: u64, hidden: i16, output: i16) -> Vec<i16> {
        let mut rng = Rng(seed | 1);
        let mut values = Vec::with_capacity(arch.values());
        values.extend(
            (0..INPUTS * arch.input_buckets() * HIDDEN + HIDDEN).map(|_| rng.spread(hidden)),
        );
        values.extend((0..arch.output_buckets * 2 * HIDDEN).map(|_| rng.spread(output)));
        values.extend((0..arch.output_buckets).map(|_| rng.spread(5_000)));
        values
    }

    /// L'architecture de N4 — un seul bloc d'entrées, une seule sortie :
    /// celle des réseaux écrits à la main dans les tests, QUEL QUE SOIT
    /// l'architecture du binaire. Un test qui pose une valeur à un indice
    /// calculé à la main ne vaut que pour une disposition du fichier ; la
    /// nommer le laisse valable le jour où le binaire embarque des seaux.
    pub(crate) const PLAIN: Arch = Arch {
        king_buckets: None,
        output_buckets: 1,
        layers: None,
    };

    /// Une architecture à seaux, celle de l'exemple de bullet : dix seaux de
    /// roi en miroir, huit seaux de sortie.
    pub(crate) const BUCKETED: Arch = Arch {
        king_buckets: Some(KING_BUCKETS_10),
        output_buckets: 8,
        layers: None,
    };

    /// Un réseau aléatoire aux poids d'un réseau entraîné — bornés comme
    /// `AdamW` les borne, ±127 en sortie, donc toujours admis par le
    /// chargeur.
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
        let mut values = vec![0; PLAIN.values()];
        edit(&mut values);
        plain(&values).unwrap()
    }

    /// Un réseau de l'architecture [`PLAIN`], depuis ses valeurs.
    fn plain(values: &[i16]) -> Result<Network, String> {
        Network::from_bytes_with(&file_of_any(values), PLAIN)
    }

    /// Indices, dans les valeurs d'un fichier [`PLAIN`], des différentes
    /// parties.
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
        // Calculé à la main depuis `SavedFormat`, bourré jusqu'au multiple de
        // 64 suivant — et retrouvé sur les fichiers que bullet a écrits :
        // 2 × (768 × 128 + 128 + 256 + 1) = 197 378 octets, 197 440 bourrés ;
        // 2 × (768 × 256 + 256 + 512 + 1) = 394 754 octets, 394 816 bourrés.
        // Puis pour C3, le 27 oct. 2026, avant que bullet en écrive un :
        // 2 × (768 × 384 + 384 + 768 + 1) = 592 130 octets, 592 192 bourrés ;
        // 2 × (768 × 512 + 512 + 1 024 + 1) = 789 506 octets, 789 568 bourrés.
        // Une autre largeur demande son calcul à la main, pas une formule
        // recopiée du code qu'elle vérifie.
        let expected = match HIDDEN {
            128 => 197_440,
            256 => 394_816,
            384 => 592_192,
            512 => 789_568,
            other => panic!("taille à calculer à la main pour {other} unités"),
        };
        assert_eq!(PLAIN.file_bytes(), expected);
        let output = i16::try_from(127 * 128 / HIDDEN).unwrap();
        assert!(plain(&random_values_with(PLAIN, 7, 300, output)).is_ok());
    }

    /// Une architecture multicouche aux couches de l'exemple de bullet,
    /// sans seaux de roi : les entrées de [`bullet_features`].
    const DENSE: Arch = Arch {
        king_buckets: None,
        output_buckets: 8,
        layers: Some(Layers { l1: 16, l2: 32 }),
    };

    /// Les octets d'un réseau multicouche aléatoire, tel que bullet les
    /// écrirait : l'accumulateur en `i16`, la première couche dense en
    /// `i8`, le reste en `f32` dans `[-1, 1]`, puis le bourrage.
    fn random_dense_file(arch: Arch, seed: u64, hidden: i16) -> Vec<u8> {
        let layers = arch.layers.unwrap();
        let mut rng = Rng(seed | 1);
        let mut bytes: Vec<u8> = (0..INPUTS * arch.input_buckets() * HIDDEN + HIDDEN)
            .flat_map(|_| rng.spread(hidden).to_le_bytes())
            .collect();
        bytes.extend(
            (0..arch.output_buckets * layers.l1 * HIDDEN)
                .map(|_| i8::try_from(rng.spread(127)).unwrap().to_le_bytes()[0]),
        );
        let floats = arch.output_buckets * (layers.l1 + layers.l2 * layers.l1 + 2 * layers.l2 + 1);
        bytes.extend(
            (0..floats).flat_map(|_| (f32::from(rng.spread(1_000)) / 1_000.0).to_le_bytes()),
        );
        let pattern = b"bullet";
        let mut index = 0;
        while !bytes.len().is_multiple_of(64) {
            bytes.push(pattern[index % pattern.len()]);
            index += 1;
        }
        bytes
    }

    #[test]
    fn un_reseau_multicouche_a_la_taille_que_bullet_ecrit() {
        // Calculé à la main depuis `SavedFormat`, une seule sortie, 16 puis
        // 32 unités denses : 2 × (768·H + H) octets d'accumulateur, 16·H
        // poids `i8`, et 593 flottants — 16 + 16·32 + 32 + 32 + 1 —, soit
        // 2 372 octets ; bourré au multiple de 64 suivant. Pour H = 256 :
        // 393 728 + 4 096 + 2 372 = 400 196, 400 256 bourrés.
        let expected = match HIDDEN {
            128 => 201_344,
            256 => 400_256,
            384 => 599_168,
            512 => 798_080,
            1024 => 1_593_728,
            other => panic!("taille à calculer à la main pour {other} unités"),
        };
        let one = Arch {
            output_buckets: 1,
            ..DENSE
        };
        assert_eq!(one.file_bytes(), expected);
        let bytes = random_dense_file(one, 11, 300);
        assert_eq!(bytes.len(), expected);
        assert!(Network::from_bytes_with(&bytes, one).is_ok());
        // Un octet de moins : refusé, comme un réseau d'une autre largeur.
        assert!(Network::from_bytes_with(&bytes[..expected - 64], one).is_err());

        // Avec quatre seaux de roi et huit de sortie — où `INPUTS × seaux`
        // et `INPUTS / seaux` se séparent, ce qu'un seul bloc ne voit pas :
        // 2 × (768·4·H + H) + 8·16·H + 4 × 8 × 593, soit 6 274·H + 18 976.
        // Pour H = 256 : 1 625 120, 1 625 152 bourrés.
        let expected = match HIDDEN {
            128 => 822_080,
            256 => 1_625_152,
            384 => 2_428_224,
            512 => 3_231_296,
            1024 => 6_443_584,
            other => panic!("taille à calculer à la main pour {other} unités"),
        };
        let bucketed = Arch {
            king_buckets: Some(KING_BUCKETS_4),
            ..DENSE
        };
        assert_eq!(bucketed.file_bytes(), expected);
        let bytes = random_dense_file(bucketed, 12, 300);
        assert_eq!(bytes.len(), expected);
        assert!(Network::from_bytes_with(&bytes, bucketed).is_ok());
    }

    #[test]
    fn un_poids_dense_qui_n_est_pas_un_nombre_est_refuse() {
        let mut bytes = random_dense_file(DENSE, 13, 300);
        let first_float = 2 * (INPUTS * HIDDEN + HIDDEN) + 8 * 16 * HIDDEN;
        for bad in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            bytes[first_float..first_float + 4].copy_from_slice(&bad.to_le_bytes());
            let error = Network::from_bytes_with(&bytes, DENSE).err().unwrap();
            assert!(error.contains("dense"), "{error}");
        }
        // Le dernier flottant aussi : la lecture va jusqu'au bout.
        let mut bytes = random_dense_file(DENSE, 13, 300);
        let last_float = DENSE.bytes() - 4;
        bytes[last_float..last_float + 4].copy_from_slice(&f32::NAN.to_le_bytes());
        assert!(Network::from_bytes_with(&bytes, DENSE).is_err());
        // Et des couches plus grandes que la pile ne les tient — ou vides :
        // chaque borne, de chaque côté, sur des fichiers à zéro de la bonne
        // taille, que rien d'autre ne refuserait.
        let sized = |l1, l2| {
            let arch = Arch {
                layers: Some(Layers { l1, l2 }),
                ..DENSE
            };
            Network::from_bytes_with(&vec![0; arch.file_bytes()], arch)
        };
        assert!(sized(MAX_L1, MAX_L2).is_ok(), "les plus grandes admises");
        assert!(sized(1, 1).is_ok(), "les plus petites admises");
        for (l1, l2) in [(MAX_L1 + 1, 32), (16, MAX_L2 + 1), (0, 32), (16, 0)] {
            let error = sized(l1, l2).err().unwrap();
            assert!(error.contains("couches denses"), "{l1} et {l2} : {error}");
        }
    }

    /// Le calcul de référence d'un réseau multicouche : les octets relus sans
    /// [`Network`], les entrées de [`bullet_features`], le graphe de
    /// l'exemple de bullet en `f64` — `CReLU` par `QA`, produit des deux
    /// moitiés, poids `i8` par `QL1`, `SCReLU`. Rend `sortie × SCALE`
    /// tronqué, AVANT la borne.
    fn dense_reference(bytes: &[u8], arch: Arch, board: &Board) -> i64 {
        let layers = arch.layers.unwrap();
        let i16_at =
            |index: usize| f64::from(i16::from_le_bytes([bytes[2 * index], bytes[2 * index + 1]]));
        let l1_at = 2 * (INPUTS * HIDDEN + HIDDEN);
        let f32_base = l1_at + arch.output_buckets * layers.l1 * HIDDEN;
        let f32_at = |index: usize| {
            let at = f32_base + 4 * index;
            f64::from(f32::from_le_bytes(bytes[at..at + 4].try_into().unwrap()))
        };
        let features = bullet_features(board);
        let (mut stm, mut ntm) = (vec![0.0; HIDDEN], vec![0.0; HIDDEN]);
        for unit in 0..HIDDEN {
            stm[unit] = i16_at(INPUTS * HIDDEN + unit);
            ntm[unit] = i16_at(INPUTS * HIDDEN + unit);
            for &(us, them) in &features {
                stm[unit] += i16_at(us * HIDDEN + unit);
                ntm[unit] += i16_at(them * HIDDEN + unit);
            }
        }
        let crelu = |x: f64| x.clamp(0.0, 255.0) / 255.0;
        let half = HIDDEN / 2;
        let mut input = Vec::with_capacity(HIDDEN);
        for side in [&stm, &ntm] {
            for j in 0..half {
                input.push(crelu(side[j]) * crelu(side[j + half]));
            }
        }
        let screlu = |x: f64| x.clamp(0.0, 1.0).powi(2);
        let bucket = arch.output_bucket(board.occupied().len() as usize);
        let (l1, l2) = (layers.l1, layers.l2);
        let b = arch.output_buckets;
        let first: Vec<f64> = (0..l1)
            .map(|o| {
                let row = (bucket * l1 + o) * HIDDEN;
                let dot: f64 = (0..HIDDEN)
                    .map(|j| input[j] * f64::from(bytes[l1_at + row + j].cast_signed()))
                    .sum();
                screlu(dot / f64::from(QL1) + f32_at(bucket * l1 + o))
            })
            .collect();
        let l2w = b * l1;
        let l2b = l2w + b * l2 * l1;
        let l3w = l2b + b * l2;
        let l3b = l3w + b * l2;
        let second: Vec<f64> = (0..l2)
            .map(|o| {
                let row = l2w + (bucket * l2 + o) * l1;
                let dot: f64 = (0..l1).map(|i| first[i] * f32_at(row + i)).sum();
                screlu(dot + f32_at(l2b + bucket * l2 + o))
            })
            .collect();
        let output: f64 = (0..l2)
            .map(|i| second[i] * f32_at(l3w + bucket * l2 + i))
            .sum::<f64>()
            + f32_at(l3b + bucket);
        (output * f64::from(SCALE)) as i64
    }

    #[test]
    fn la_sortie_multicouche_est_celle_du_calcul_de_reference() {
        // La première couche se calcule en entiers exacts, les suivantes en
        // `f32` : la troncature finale peut tomber d'un côté ou de l'autre
        // d'un entier, pas plus loin.
        let bound = i64::from(MATE_THRESHOLD - 1);
        for (seed, hidden) in [(17, 300), (19, 120)] {
            let bytes = random_dense_file(DENSE, seed, hidden);
            let network = Network::from_bytes_with(&bytes, DENSE).unwrap();
            let mut seen = std::collections::HashSet::new();
            for position in positions() {
                let expected = dense_reference(&bytes, DENSE, &position).clamp(-bound, bound);
                let got = i64::from(network.evaluate(&network.refresh(&position), &position));
                assert!(
                    (got - expected).abs() <= 1,
                    "réseau {seed} sur {position} : {got} au lieu de {expected}"
                );
                seen.insert(got);
            }
            // Des évaluations variées : ni toutes nulles, ni toutes bornées.
            assert!(seen.len() > 5, "réseau {seed} : {seen:?}");
        }
    }

    #[test]
    fn une_sortie_multicouche_est_bornee_hors_des_mats() {
        // Le biais final de chaque seau à ±1 000 : la sortie vaut ±400 000
        // et se borne à `MATE_THRESHOLD − 1`, des deux côtés.
        let bound = MATE_THRESHOLD - 1;
        for (bias, expected) in [(1_000.0_f32, bound), (-1_000.0, -bound)] {
            let mut bytes = random_dense_file(DENSE, 31, 300);
            let last_bias = DENSE.bytes() - 4 * DENSE.output_buckets;
            for bucket in 0..DENSE.output_buckets {
                let at = last_bias + 4 * bucket;
                bytes[at..at + 4].copy_from_slice(&bias.to_le_bytes());
            }
            let network = Network::from_bytes_with(&bytes, DENSE).unwrap();
            for position in positions().into_iter().take(20) {
                let got = network.evaluate(&network.refresh(&position), &position);
                assert_eq!(got, expected, "sur {position}");
            }
        }
    }

    #[test]
    fn l_increment_multicouche_egale_le_recalcul() {
        // L'accumulateur ne sait rien des couches denses : la dérivation par
        // coup reste celle de tous les réseaux, et l'évaluation qui la lit
        // retombe sur le recalcul.
        let network = Network::from_bytes_with(&random_dense_file(DENSE, 23, 300), DENSE).unwrap();
        let mut checked = 0;
        for (index, position) in positions().into_iter().enumerate() {
            if index % 3 != 0 {
                continue;
            }
            let before = network.refresh(&position);
            for mv in moves_of(&position) {
                let mut after = before;
                network.apply_move(&before, &mut after, &position, mv);
                let mut child = position.clone();
                child.play_unchecked(mv);
                assert_eq!(
                    network.evaluate(&after, &child),
                    network.evaluate(&network.refresh(&child), &child),
                    "{mv} sur {position}"
                );
                checked += 1;
            }
        }
        assert!(checked >= 500, "coups vérifiés : {checked}");
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
            let mut values = vec![0; PLAIN.values()];
            values[BIAS_AT + 5] = bias;
            for input in 0..32 {
                values[input * 7 * HIDDEN + 5] = if input % 2 == 0 { 1_000 } else { -1_000 };
            }
            plain(&values)
        };
        assert!(limit(767).is_ok(), "32 767 tient dans un i16");
        assert!(limit(-767).is_ok(), "le signe du biais ne compte pas");
        assert!(limit(768).is_err(), "32 768 n'y tient pas");
        assert!(limit(-768).is_err());

        // Seuls les 32 plus grands comptent : un 33ᵉ poids ne rend pas
        // refusable un réseau qui ne peut jamais l'additionner aux 32 autres.
        let mut values = vec![0; PLAIN.values()];
        for input in 0..33 {
            values[input * HIDDEN] = 1_000;
        }
        values[BIAS_AT] = 767;
        assert!(plain(&values).is_ok());
    }

    #[test]
    fn un_poids_de_sortie_dont_le_produit_sortirait_de_seize_bits_est_refuse() {
        // 255 × 128 = 32 640 tient dans un i16, 255 × 129 = 32 895 non — dans
        // les deux signes, et quelle que soit la place du poids.
        let avec = |index: usize, weight: i16| {
            let mut values = vec![0; PLAIN.values()];
            values[OUTPUT_AT + index] = weight;
            plain(&values)
        };
        for index in [0, HIDDEN, 2 * HIDDEN - 1] {
            assert!(avec(index, 128).is_ok(), "128 est admis, place {index}");
            assert!(avec(index, -128).is_ok(), "−128 est admis, place {index}");
            assert!(avec(index, 129).is_err(), "129 ne l'est pas, place {index}");
            assert!(
                avec(index, -129).is_err(),
                "−129 ne l'est pas, place {index}"
            );
        }
    }

    #[test]
    fn le_produit_scalaire_suit_sa_definition() {
        // La forme vectorisable `(c · w) · c` contre la définition `c² · w`,
        // en i64 : des accumulateurs sur toute la plage d'un i16 — négatifs,
        // dans [0, QA], au-delà —, des poids sur toute la plage admise, et les
        // deux extrêmes où chaque terme vaut ±QA² × 128.
        let definition = |accumulator: &Accumulator, weights: &[i16]| -> i64 {
            accumulator
                .0
                .iter()
                .zip(weights)
                .map(|(&value, &weight)| {
                    let clipped = i64::from(value).clamp(0, i64::from(QA));
                    clipped * clipped * i64::from(weight)
                })
                .sum()
        };
        let mut rng = Rng(0x5eed_0016);
        let bound = i16::try_from(MAX_OUTPUT_WEIGHT).unwrap();
        let mut cases: Vec<(Accumulator, Vec<i16>)> = (0..2_000)
            .map(|_| {
                let mut accumulator = Accumulator::default();
                for value in &mut accumulator.0 {
                    *value = rng.spread(i16::MAX);
                }
                let weights = (0..HIDDEN).map(|_| rng.spread(bound)).collect();
                (accumulator, weights)
            })
            .collect();
        for sign in [1, -1] {
            cases.push((Accumulator([i16::MAX; HIDDEN]), vec![sign * bound; HIDDEN]));
        }
        for (accumulator, weights) in &cases {
            assert_eq!(
                dot(&accumulator.0, weights),
                definition(accumulator, weights)
            );
        }
    }

    #[test]
    fn le_produit_scalaire_ne_deborde_a_aucune_largeur() {
        // Plus de deux tranches au pire : 1 000 termes de ±QA² × 128 font
        // ±8,3 milliards, bien au-delà d'un i32. Sommé d'un bloc en i32, le
        // produit paniquerait ici en debug et serait faux en release ; par
        // tranches, il est exact — la largeur n'est plus bornée par lui
        // (n° 17, étape 1).
        let bound = i16::try_from(MAX_OUTPUT_WEIGHT).unwrap();
        let values = vec![i16::MAX; 1_000];
        for sign in [1, -1] {
            let weights = vec![sign * bound; 1_000];
            let expected = i64::from(sign) * 1_000 * i64::from(QA * QA) * i64::from(bound);
            assert_eq!(dot(&values, &weights), expected);
        }
        // Une tranche partielle compte comme les autres : 300 termes, une
        // tranche pleine et une de 44.
        let weights: Vec<i16> = (0..300)
            .map(|i| if i < 256 { bound } else { -bound })
            .collect();
        let expected = (256 - 44) * i64::from(QA * QA) * i64::from(bound);
        assert_eq!(dot(&values[..300], &weights), expected);
    }

    #[test]
    #[cfg(target_arch = "x86_64")]
    fn le_produit_avx2_est_le_produit_scalaire() {
        // Au bit près, sur toutes les longueurs qui mêlent registres pleins,
        // reste scalaire et tranches : vide, moins d'un registre, un registre
        // et un terme, une tranche pleine, une tranche et un reste de 44, et
        // quatre tranches dont la dernière partielle ; les entrées dans toute
        // la plage d'un `i16` — négatives, nulles, au-delà de `QA` —, les
        // poids aux bornes admises. Sans AVX2, rien à confronter.
        if !std::arch::is_x86_feature_detected!("avx2") {
            eprintln!("pas d'AVX2 sur ce processeur : confrontation sautée");
            return;
        }
        let bound = i16::try_from(MAX_OUTPUT_WEIGHT).unwrap();
        let mut rng = Rng(0x5eed_a5a2);
        let mut checked = 0;
        for len in [0, 1, 15, 16, 17, 255, 256, 257, 300, 1_000] {
            for round in 0..20 {
                let values: Vec<i16> = (0..len)
                    .map(|_| match round % 3 {
                        0 => rng.spread(i16::MAX),
                        1 => rng.spread(2 * QA_I16),
                        _ => i16::MAX,
                    })
                    .collect();
                let weights: Vec<i16> = (0..len)
                    .map(|_| {
                        if round % 3 == 2 {
                            bound
                        } else {
                            rng.spread(bound)
                        }
                    })
                    .collect();
                assert_eq!(
                    avx2::dot(&values, &weights),
                    Some(dot_scalar(&values, &weights)),
                    "longueur {len}, tour {round}"
                );
                checked += 1;
            }
        }
        // Deux tranches de longueurs différentes : la plus courte décide,
        // comme pour le calcul scalaire.
        let values = vec![QA_I16; 40];
        let weights = vec![bound; 33];
        assert_eq!(
            avx2::dot(&values, &weights),
            Some(dot_scalar(&values, &weights))
        );
        assert_eq!(checked, 200);
    }

    #[test]
    #[cfg(target_arch = "x86_64")]
    fn le_produit_scalaire_passe_par_avx2_quand_il_est_la() {
        // Le chemin AVX2 et le scalaire rendent les mêmes entiers : seul le
        // compte des passages dit lequel a servi.
        avx2::DOTS.with(|count| count.set(0));
        avx2::TAIL.with(|count| count.set(0));
        let values = vec![100_i16; HIDDEN];
        let weights = vec![-3_i16; HIDDEN];
        assert_eq!(dot(&values, &weights), dot_scalar(&values, &weights));
        let available = std::arch::is_x86_feature_detected!("avx2");
        assert_eq!(
            avx2::DOTS.with(std::cell::Cell::get),
            usize::from(available)
        );
        // Chaque registre plein passe par AVX2 : une couche entière ne laisse
        // rien au reste, 300 termes en laissent 12 — 256, puis 2 × 16 + 12.
        assert_eq!(avx2::TAIL.with(std::cell::Cell::get), 0);
        if available {
            let long = vec![1_i16; 300];
            assert_eq!(avx2::dot(&long, &long), Some(300));
            assert_eq!(avx2::TAIL.with(std::cell::Cell::get), 12);
        }
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
                    values[OUTPUT_AT + index] = sign * i16::try_from(MAX_OUTPUT_WEIGHT).unwrap();
                }
                values[OUTPUT_BIAS_AT] = sign * i16::MAX;
            });
            let expected = i32::from(sign) * (MATE_THRESHOLD - 1);
            let white = board(FENS[0]);
            let black = board(&FENS[0].replacen(" w ", " b ", 1));
            for position in [white, black] {
                let accumulators = network.refresh(&position);
                assert_eq!(network.evaluate(&accumulators, &position), expected);
            }
        }
    }

    #[test]
    fn un_calcul_a_la_main_retombe_sur_les_troncatures_de_bullet() {
        // Seul le biais de sortie : QA × QB vaut « 1,0 », soit 400 centièmes.
        let biais = network_with(|values| values[OUTPUT_BIAS_AT] = 16_320);
        let start = board(FENS[0]);
        assert_eq!(biais.evaluate(&biais.refresh(&start), &start), 400);

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
            assert_eq!(network.evaluate(&accumulators, &start), expected);
            let black: Board = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"
                .parse()
                .unwrap();
            assert_eq!(
                network.evaluate(&network.refresh(&black), &black),
                expected,
                "les Noirs voient leur roi en e1, eux aussi"
            );
        }

        // Au-delà de QA, l'activation plafonne : 300 compte comme 255.
        let sature = network_with(|values| {
            values[324 * HIDDEN] = 300;
            values[OUTPUT_AT] = 64;
        });
        assert_eq!(sature.evaluate(&sature.refresh(&start), &start), 400);
        // Et sous zéro, elle s'annule.
        let negatif = network_with(|values| {
            values[324 * HIDDEN] = -300;
            values[OUTPUT_AT] = 64;
        });
        assert_eq!(negatif.evaluate(&negatif.refresh(&start), &start), 0);
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

    #[test]
    fn le_seau_du_roi_suit_la_disposition_de_bullet() {
        // Les cases lues à la main dans `KING_BUCKETS_10`, dans le repère de
        // chaque camp ; la colonne retournée dès que le roi est sur e à h.
        let cases = [
            (Color::White, Square::A1, 0, 0),
            (Color::White, Square::D1, 3, 0),
            // e1 : le miroir de d1, retourné.
            (Color::White, Square::E1, 3, 7),
            // g1, après le petit roque : le miroir de b1.
            (Color::White, Square::G1, 1, 7),
            // c1, après le grand : pas de miroir.
            (Color::White, Square::C1, 2, 0),
            (Color::White, Square::B2, 4, 0),
            (Color::White, Square::F2, 5, 7),
            (Color::White, Square::H8, 9, 7),
            // Les Noirs se voient blancs : e8 est leur e1, b7 leur b2, a1
            // leur a8.
            (Color::Black, Square::E8, 3, 7),
            (Color::Black, Square::B7, 4, 0),
            (Color::Black, Square::A1, 9, 0),
            (Color::Black, Square::F4, 8, 7),
        ];
        for (perspective, king, bucket, flip) in cases {
            assert_eq!(
                BUCKETED.king_key(perspective, king),
                (bucket * INPUTS, flip),
                "{perspective:?}, roi en {king}"
            );
        }
        // L'entrée retournée : mon roi en e1, vu de lui-même, est 324 sans
        // seaux ; dans le seau 3, colonne retournée — e devient d —, 323.
        assert_eq!(
            BUCKETED.feature(
                Color::White,
                Square::E1,
                Color::White,
                Piece::King,
                Square::E1
            ),
            3 * INPUTS + 323
        );
        // Sans seaux de roi, ni bloc ni retournement.
        let plain = Arch {
            king_buckets: None,
            output_buckets: 1,
            layers: None,
        };
        for king in Square::ALL {
            assert_eq!(plain.king_key(Color::White, king), (0, 0));
            assert_eq!(plain.king_key(Color::Black, king), (0, 0));
        }
        assert_eq!(BUCKETED.input_buckets(), 10);
        assert_eq!(plain.input_buckets(), 1);
    }

    #[test]
    fn le_seau_de_sortie_suit_le_nombre_de_pieces() {
        // `MaterialCount` : (pièces − 2) / ⌈32 / seaux⌉.
        let arch = |output_buckets| Arch {
            king_buckets: None,
            output_buckets,
            layers: None,
        };
        for pieces in 2..=32 {
            assert_eq!(arch(8).output_bucket(pieces), (pieces - 2) / 4);
            assert_eq!(arch(1).output_bucket(pieces), 0);
            // ⌈32 / 3⌉ = 11 : de 2 à 12 pièces le seau 0, de 13 à 23 le 1.
            assert_eq!(arch(3).output_bucket(pieces), (pieces - 2) / 11);
        }
        assert_eq!(arch(8).output_bucket(32), 7);
        assert_eq!(arch(3).output_bucket(13), 1);

        // Et l'évaluation lit le seau de la position : seuls les biais de
        // sortie diffèrent, 1 632 × (seau + 1), soit 40 centièmes par seau.
        let biases_at = INPUTS * BUCKETED.input_buckets() * HIDDEN + HIDDEN + 8 * 2 * HIDDEN;
        let mut values = vec![0; BUCKETED.values()];
        for (bucket, value) in values[biases_at..].iter_mut().enumerate() {
            *value = 1_632 * (i16::try_from(bucket).unwrap() + 1);
        }
        let network = Network::from_bytes_with(&file_of_any(&values), BUCKETED).unwrap();
        for (fen, bucket) in [
            ("8/8/4k3/8/8/4K3/8/8 w - - 0 1", 0),
            ("8/8/4k3/8/8/4K3/8/8 b - - 0 1", 0),
            ("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", 1),
            ("r1bqk2r/pp3ppp/2n5/8/8/8/PP3PPP/R2QK2R w KQkq - 0 1", 4),
            (FENS[0], 7),
        ] {
            let position = board(fen);
            assert_eq!(
                network.evaluate(&network.refresh(&position), &position),
                40 * (bucket + 1),
                "{fen}"
            );
        }
    }

    #[test]
    fn l_increment_egale_le_recalcul_avec_des_seaux() {
        // Les seaux de roi de l'exemple de bullet : un coup de roi qui change
        // de seau ou de côté recalcule son camp, les autres se mettent à
        // jour. Chacun des deux chemins doit être pris, et compté des deux
        // côtés : un compteur faux passerait une borne basse seule.
        let values = random_values_with(BUCKETED, 23, 150, 127);
        let network = Network::from_bytes_with(&file_of_any(&values), BUCKETED).unwrap();
        let (mut checked, mut crossings, mut quiet_kings, mut castles) = (0, 0, 0, 0);
        REFRESHES.with(|count| count.set(0));
        for (index, position) in positions().into_iter().enumerate() {
            if index % 3 != 0 {
                continue;
            }
            let us = position.side_to_move();
            let before = network.refresh(&position);
            for mv in moves_of(&position) {
                let mut after = before;
                network.apply_move(&before, &mut after, &position, mv);
                let mut child = position.clone();
                child.play_unchecked(mv);
                assert_eq!(after, network.refresh(&child), "{mv} sur {position}");
                checked += 1;
                if position.piece_on(mv.from) == Some(Piece::King) {
                    castles += usize::from(position.colors(us).has(mv.to));
                    if BUCKETED.king_key(us, position.king(us))
                        == BUCKETED.king_key(us, child.king(us))
                    {
                        quiet_kings += 1;
                    } else {
                        crossings += 1;
                    }
                }
            }
        }
        assert!(
            crossings >= 20 && quiet_kings >= 20 && castles >= 2,
            "franchissements {crossings}, coups de roi sans franchir {quiet_kings}, roques {castles}"
        );
        assert!(
            crossings + quiet_kings <= checked && checked <= 218 * positions().len(),
            "coups vérifiés {checked}"
        );
        // Un recalcul par franchissement, et pas un de plus : les autres coups
        // se mettent à jour, ce qu'aucune comparaison de résultat ne verrait.
        assert_eq!(REFRESHES.with(std::cell::Cell::get), crossings);
    }

    #[test]
    fn sans_seaux_un_coup_ne_recalcule_jamais() {
        // L'architecture de N4 : un seul bloc, pas de retournement — aucun
        // coup de roi ne franchit rien.
        let plain = Arch {
            king_buckets: None,
            output_buckets: 1,
            layers: None,
        };
        let network = Network::from_bytes_with(
            &file_of_any(&random_values_with(plain, 29, 150, 127)),
            plain,
        )
        .unwrap();
        REFRESHES.with(|count| count.set(0));
        let mut checked = 0;
        for position in positions().into_iter().step_by(5) {
            let before = network.refresh(&position);
            for mv in moves_of(&position) {
                let mut after = before;
                network.apply_move(&before, &mut after, &position, mv);
                checked += 1;
            }
        }
        assert!(checked >= 500, "coups {checked}");
        assert_eq!(REFRESHES.with(std::cell::Cell::get), 0);
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
            let bytes = file_of_any(&random_values_with(PLAIN, seed, hidden, output));
            let network = Network::from_bytes_with(&bytes, PLAIN).unwrap();
            let bound = i64::from(MATE_THRESHOLD - 1);
            let mut inside = 0;
            for position in positions() {
                let expected = reference(&bytes, &position);
                inside += usize::from(expected.abs() < bound);
                let got = network.evaluate(&network.refresh(&position), &position);
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
                network.evaluate(&network.refresh(&position), &position),
                network.evaluate(&network.refresh(&mirrored), &mirrored),
                "{position} contre {mirrored}"
            );
        }
    }

    #[test]
    fn le_reseau_embarque_evalue_comme_son_entraineur() {
        // La confrontation de l'entraînement du réseau embarqué, rejouée à
        // chaque build : les dix-huit positions, ce qu'en disait le moteur et ce
        // qu'en disait bullet (`trainer.eval(fen) × 400`) au bout de
        // l'entraînement — relevés dans `reseaux/e21w50-768x4hm-256-s8-400.sortie.txt`.
        // Le seul test qui confronte l'inférence à l'entraîneur sur un VRAI
        // réseau ; ceux d'au-dessus tiennent des réseaux aléatoires.
        //
        // La valeur du moteur est tenue à l'unité : l'inférence est
        // entière, et rien de ce qui la réécrirait — un produit vectorisé, un
        // autre ordre d'accumulation — n'a le droit de la déplacer. L'écart à
        // l'entraîneur l'est par le critère écrit avant le premier
        // entraînement : médian 15 au plus, maximal 50.
        const CONFRONTATION: [(&str, i32, i32); 18] = [
            (
                "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                64,
                65,
            ),
            (
                "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
                -221,
                -222,
            ),
            ("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 105, 106),
            (
                "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
                573,
                575,
            ),
            (
                "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
                -158,
                -159,
            ),
            (
                "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
                25,
                31,
            ),
            (
                "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
                -73,
                -68,
            ),
            (
                "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R b KQkq - 0 1",
                314,
                321,
            ),
            (
                "r2q1rk1/pp2bppp/2n1bn2/3p4/3P4/2NBBN2/PP3PPP/R2Q1RK1 b - - 0 1",
                32,
                27,
            ),
            ("6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1", -2281, -2278),
            ("8/8/8/4k3/8/8/4KP2/8 w - - 0 1", 543, 531),
            ("8/5pk1/6p1/8/8/1Q6/5PPP/6K1 b - - 0 1", -3348, -3338),
            ("2kr3r/ppp2ppp/2n5/8/8/2N5/PPP2PPP/2KR3R w - - 0 12", 65, 76),
            (
                "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7",
                101,
                103,
            ),
            ("8/8/4k3/3p4/3P4/4K3/8/8 w - - 0 1", 38, 26),
            ("4k3/8/8/2K5/8/8/8/R7 w - - 0 1", 1349, 1323),
            ("8/8/3k4/8/3K4/8/8/8 w - - 0 1", -22, -31),
            ("1k6/8/8/8/8/8/8/K7 b - - 0 1", 39, 21),
        ];
        let network = embedded().unwrap();
        let mut gaps = Vec::new();
        for (fen, engine, trainer) in CONFRONTATION {
            let board: Board = fen.parse().unwrap();
            let eval = network.evaluate(&network.refresh(&board), &board);
            assert_eq!(eval, engine, "{fen}");
            gaps.push((eval - trainer).abs());
        }
        gaps.sort_unstable();
        let (median, max) = (gaps[gaps.len() / 2], gaps[gaps.len() - 1]);
        assert!(median <= 15 && max <= 50, "médian {median}, maximal {max}");
        // Le même réseau à chaque appel : chargé une fois, partagé.
        assert!(Arc::ptr_eq(&network, &embedded().unwrap()));
    }
}
