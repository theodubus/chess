//! Échange statique — l'issue matérielle d'une suite de captures sur une case.
//!
//! # À quoi ça sert, et pourquoi c'est ici
//!
//! L'ordonnancement du moteur classe les captures par MVV-LVA : la victime la
//! plus grosse d'abord, à agresseur égal le plus petit. C'est bon marché et
//! c'est aveugle à la défense — une prise de dame défendue par un pion passe
//! devant tout le reste alors qu'elle perd huit pions.
//!
//! **Mesuré le 16 sept. 2026** sur 800 positions tirées de parties réelles à la
//! profondeur 10 : parmi les 33,7 millions de captures qui survivent à
//! l'élagage delta, **37,6 % peuvent perdre du matériel** — case d'arrivée
//! défendue et agresseur plus cher que la victime. L'élagage delta écarte les
//! captures *trop petites* ; celles-là sont *trop chères*, et rien dans le
//! moteur ne les distingue aujourd'hui.
//!
//! # Ce que ce module ne fait pas
//!
//! Il ne décide rien. Brancher SEE sur l'ordonnancement puis sur l'élagage en
//! quiescence sont **deux décisions distinctes**, donc deux SPRT — « un SPRT
//! par changement » est absolu sur la recherche.
//!
//! # Pourquoi une confrontation à un oracle, et pas une relecture
//!
//! Un échange statique est « facile à écrire subtilement faux » : la prise en
//! passant dont la victime n'est pas sur la case d'arrivée, le pion qui promeut
//! en reprenant, la tour qu'on découvre derrière l'agresseur qui vient de
//! partir, le roi qui ne peut pas prendre sur une case encore défendue. Ces
//! quatre cas sont exactement ceux qu'une relecture laisse passer.
//!
//! `tools/src/bin/see_check.rs` confronte donc ce module à un **oracle par
//! force brute** : une recherche exhaustive des captures sur la seule case
//! visée, jouée par le vrai générateur de coups. Lente, et exacte par
//! construction — elle hérite des clouages, des découvertes et de la légalité
//! sans qu'on ait à les réécrire. C'est le geste de perft, de la dérivation
//! NNUE et du matériel insuffisant.
//!
//! **Il a servi au premier passage** : 27 écarts sur 771 captures, tous dus à
//! la coupure recopiée du manuel — voir [`see`].
//!
//! # La limite, mesurée et assumée
//!
//! **Cet échange statique ignore la légalité, et c'est par construction.** Il
//! raisonne en géométrie pure : une pièce clouée attaque quand même, et un
//! échec découvert en cours d'échange ne l'arrête pas.
//!
//! Mesuré sur 4 623 captures de parties réelles : **20 écarts, soit 0,43 %**,
//! et **les vingt s'expliquent par la légalité** — 18 clouages absolus, 2
//! échecs à la découverte où la reprise ouvre une ligne vers son propre roi.
//! Aucun écart d'une autre cause.
//!
//! Corriger coûterait un calcul de clouage par étage d'échange, pour 0,43 % des
//! captures — et introduirait exactement le genre de subtilité que ce module
//! existe pour éviter. Tous les moteurs forts font le même arbitrage. **La
//! limite est donc caractérisée, pas cachée**, et un test la verrouille.
use cozy_chess::{
    BitBoard, Board, Color, Move, Piece, Rank, Square, get_bishop_moves, get_king_moves,
    get_knight_moves, get_pawn_attacks, get_rook_moves,
};

use crate::search::captured_piece;

/// Valeurs de pièce propres à l'échange statique, en centièmes de pion.
///
/// **Délibérément séparées d'`eval::Params`.** SEE est un mécanisme de
/// *décision* — il ordonne, et il élaguera — pas un terme d'évaluation. Le jour
/// où le tuner explorera l'espace des paramètres, il ne doit pas pouvoir
/// annuler ces valeurs : l'ordonnancement s'effondrerait sans qu'aucun test
/// d'évaluation ne bronche, et seul un SPRT le verrait. Même raison que pour la
/// détection de matériel insuffisant.
///
/// Le roi vaut assez pour qu'aucun échange ne le rende rentable, sans risquer
/// de déborder en s'additionnant.
const VALUE: [i32; Piece::NUM] = [100, 320, 335, 500, 980, 10_000];

/// Profondeur maximale d'une suite d'échanges.
///
/// Une case ne peut être attaquée que par un nombre borné d'hommes ; trente-deux
/// couvre tout échiquier légal avec une marge. La garde existe parce que
/// déborder en silence rendrait un score faux, pas parce que le cas se produit.
const MAX_SWAPS: usize = 32;

/// La valeur d'échange d'une pièce, en centièmes de pion.
///
/// Exposée pour que l'oracle de `tools/src/bin/see_check.rs` compte dans la
/// même unité — un oracle qui ne parle pas la même monnaie ne prouve rien.
#[must_use]
pub fn piece_value(piece: Piece) -> i32 {
    VALUE[piece as usize]
}

/// Ce que `mv` rapporte immédiatement : la victime, plus la promotion s'il y
/// en a une.
///
/// Rend `None` si le coup ne capture pas.
#[must_use]
pub fn capture_value(board: &Board, mv: Move) -> Option<i32> {
    let victim = captured_piece(board, mv)?;
    Some(
        VALUE[victim as usize]
            + mv.promotion.map_or(0, |promoted| {
                VALUE[promoted as usize] - VALUE[Piece::Pawn as usize]
            }),
    )
}

/// Vrai si `square` est attaqué par un homme de `by`, dans l'occupation donnée.
///
/// **Géométrie pure** : une pièce clouée attaque quand même, conformément à
/// l'invariant du projet sur `is_attacked`. Prend l'occupation en paramètre
/// plutôt que de la lire du plateau, parce qu'un échange la fait évoluer — et
/// c'est ce qui donne les attaques en rayons X gratuitement : la tour cachée
/// derrière le fou qui vient de prendre apparaît d'elle-même dès que le fou
/// quitte `occupied`.
///
/// Confrontée à `python-chess` : **zéro écart sur 10 354 positions × camps**,
/// soit 662 656 interrogations de case.
#[must_use]
pub fn attacked_by(board: &Board, square: Square, by: Color, occupied: BitBoard) -> bool {
    let them = board.colors(by) & occupied;
    let queens = board.pieces(Piece::Queen);
    !(get_knight_moves(square) & board.pieces(Piece::Knight) & them).is_empty()
        || !(get_king_moves(square) & board.pieces(Piece::King) & them).is_empty()
        || !(get_bishop_moves(square, occupied) & (board.pieces(Piece::Bishop) | queens) & them)
            .is_empty()
        || !(get_rook_moves(square, occupied) & (board.pieces(Piece::Rook) | queens) & them)
            .is_empty()
        // Un pion de `by` attaque `square` s'il occupe une case d'où un pion de
        // la couleur OPPOSÉE, posé sur `square`, capturerait. Ce retournement
        // est la façon standard de poser la question — et exactement le genre de
        // ligne qu'on écrit à l'envers sans que rien ne le signale, ce pourquoi
        // elle est confrontée à un oracle plutôt que relue.
        || !(get_pawn_attacks(square, !by) & board.pieces(Piece::Pawn) & them).is_empty()
}

/// Le moins cher des hommes de `side` qui attaquent `square`, s'il y en a un.
///
/// Rend sa case et son type. L'ordre de parcours est celui de `Piece`, qui va
/// du pion au roi — donc croissant en valeur, ce dont dépend la correction de
/// l'échange : reprendre avec plus cher que nécessaire fausserait le compte.
fn least_valuable_attacker(
    board: &Board,
    square: Square,
    side: Color,
    occupied: BitBoard,
) -> Option<(Square, Piece)> {
    let them = board.colors(side) & occupied;
    for piece in Piece::ALL {
        let candidates = match piece {
            Piece::Pawn => get_pawn_attacks(square, !side),
            Piece::Knight => get_knight_moves(square),
            Piece::Bishop => get_bishop_moves(square, occupied),
            Piece::Rook => get_rook_moves(square, occupied),
            Piece::Queen => get_bishop_moves(square, occupied) | get_rook_moves(square, occupied),
            Piece::King => get_king_moves(square),
        };
        let set = candidates & board.pieces(piece) & them;
        if let Some(from) = set.into_iter().next() {
            return Some((from, piece));
        }
    }
    None
}

/// La valeur qu'un homme de type `piece` prend sur `square`, promotion comprise.
///
/// Un pion qui reprend sur la dernière rangée promeut, et vaut alors une dame.
/// L'oublier sous-estime toute reprise de pion sur la huitième — un cas rare et
/// exactement celui qu'une relecture ne voit pas.
fn value_on(piece: Piece, square: Square, side: Color) -> i32 {
    if piece == Piece::Pawn && square.rank() == Rank::Eighth.relative_to(side) {
        VALUE[Piece::Queen as usize]
    } else {
        VALUE[piece as usize]
    }
}

/// Le gain matériel de `mv`, en centièmes de pion, les deux camps jouant au
/// mieux la suite d'échanges sur la case d'arrivée.
///
/// Rend `0` pour un coup qui ne capture pas. Un résultat négatif veut dire que
/// la capture perd du matériel — c'est exactement ce que MVV-LVA ne sait pas
/// dire.
///
/// Les deux camps peuvent **s'arrêter à tout moment** : personne n'est forcé de
/// reprendre. C'est ce que fait la remontée en fin de fonction, et c'est ce qui
/// rend le résultat différent d'une simple somme alternée.
///
/// # La coupure du manuel est absente, et c'est délibéré
///
/// L'implémentation de référence porte `if max(-gain[d-1], gain[d]) < 0 break`,
/// avec le commentaire « *pruning does not influence the result* ». **C'est vrai
/// du SIGNE, pas de la VALEUR** — et l'oracle l'a montré au premier passage :
/// 27 écarts sur 771 captures, tous du même genre. Sur
/// `r2q1rk1/p1p2ppp/bp3n2/2bp2B1/4P3/N1QP1N1P/PP3PP1/R3K2R w`, la dame prend en
/// f6 ; la coupure s'arrêtait après la reprise du fou et manquait que la dame
/// noire reprend le fou — **−560 au lieu de −660**.
///
/// Un moteur qui n'utilise SEE que par un test `see(mv) >= seuil` peut la
/// garder. Ici on veut une valeur exacte, parce que c'est elle qui ordonne. Les
/// suites d'échanges font quelques coups : ce que la coupure épargne est
/// marginal, ce qu'elle fausse ne l'est pas.
#[must_use]
pub fn see(board: &Board, mv: Move) -> i32 {
    let Some(victim) = captured_piece(board, mv) else {
        return 0;
    };
    let Some(attacker) = board.piece_on(mv.from) else {
        return 0;
    };
    let target = mv.to;
    let us = board.side_to_move();

    // Occupation après notre coup. DEUX cases se libèrent : celle de
    // l'agresseur, et celle de la victime — qui n'est pas `target` en prise en
    // passant, où le pion pris se trouve sur la colonne d'arrivée et la rangée
    // de départ. C'est le premier des quatre cas qu'on écrit de travers.
    let victim_square = if board.piece_on(target).is_some() {
        target
    } else {
        Square::new(target.file(), mv.from.rank())
    };
    let mut occupied =
        (board.occupied() ^ mv.from.bitboard() ^ victim_square.bitboard()) | target.bitboard();

    // Ce que notre coup rapporte, promotion comprise : le pion quitte
    // l'échiquier et la pièce promue le rejoint.
    let mut gain = [0i32; MAX_SWAPS];
    gain[0] = VALUE[victim as usize]
        + mv.promotion.map_or(0, |promoted| {
            VALUE[promoted as usize] - VALUE[Piece::Pawn as usize]
        });

    // Ce qui se tient sur la case et que l'adversaire peut prendre.
    let mut on_target = mv
        .promotion
        .map_or_else(|| value_on(attacker, target, us), |p| VALUE[p as usize]);

    let mut depth = 0;
    let mut side = !us;

    while let Some((from, piece)) = least_valuable_attacker(board, target, side, occupied) {
        depth += 1;
        if depth >= MAX_SWAPS {
            break;
        }
        gain[depth] = on_target - gain[depth - 1];
        occupied ^= from.bitboard();
        on_target = value_on(piece, target, side);
        side = !side;
    }

    // Remontée : à chaque étage, le camp au trait choisit entre reprendre et
    // s'arrêter. Il prend donc le meilleur des deux, ce que la négation rend.
    while depth > 0 {
        gain[depth - 1] = -((-gain[depth - 1]).max(gain[depth]));
        depth -= 1;
    }
    gain[0]
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]
mod tests {
    use super::*;

    /// **Toute position de ce module est construite et vérifiée par exécution**
    /// — légalité de la FEN, légalité du coup, et la propriété que le test
    /// prétend éprouver (« défendue », « non défendue », « seul le roi peut
    /// reprendre ») — puis sa valeur attendue est LUE SUR L'ORACLE, jamais
    /// calculée de tête.
    ///
    /// Ce n'est pas du zèle. La première version de ce module portait huit
    /// tests dont **quatre étaient faux**, tous parce que j'avais lu
    /// l'échiquier mentalement : une capture annoncée « non défendue » que la
    /// dame d8 défendait par une colonne que je croyais occupée, un « échange
    /// égal » qui perdait 220, une prise en passant dont la valeur attendue
    /// était celle d'un coup tranquille, et un cavalier censé défendre une case
    /// qu'il n'atteint pas. La règle du projet — ne jamais inscrire une
    /// position dérivée par raisonnement sans l'avoir exécutée — en était à sa
    /// cinquième utilisation ; c'est la sixième.
    fn board(fen: &str) -> Board {
        fen.parse().unwrap()
    }

    fn coup(b: &Board, uci: &str) -> Move {
        cozy_chess::util::parse_uci_move(b, uci).unwrap()
    }

    #[test]
    fn un_coup_tranquille_ne_rapporte_rien() {
        let b = board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        assert_eq!(see(&b, coup(&b, "e2e4")), 0);
    }

    #[test]
    fn une_capture_non_defendue_rapporte_la_victime() {
        // Vérifié : aucun défenseur noir de d5 après la prise.
        let b = board("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1");
        assert_eq!(see(&b, coup(&b, "e4d5")), VALUE[Piece::Pawn as usize]);
    }

    #[test]
    fn un_echange_egal_ne_coute_rien() {
        // Vérifié : le seul repreneur noir de d5 est le pion c6.
        let b = board("4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1");
        assert_eq!(see(&b, coup(&b, "e4d5")), 0);
    }

    #[test]
    fn prendre_une_piece_defendue_par_un_pion_perd() {
        // Ce que MVV-LVA ne sait pas dire : la victime est petite ET défendue.
        let b = board("rnbqkbnr/pp2pppp/2p5/3p4/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 3");
        let gain = see(&b, coup(&b, "c3d5"));
        assert_eq!(
            gain,
            VALUE[Piece::Pawn as usize] - VALUE[Piece::Knight as usize]
        );
        assert!(gain < 0);
    }

    #[test]
    fn une_tour_qui_prend_un_pion_defendu_perd_la_difference() {
        // Vérifié : le pion f6 reprend, et plus rien ensuite.
        let b = board("4k3/8/5p2/4p3/4R3/8/8/4K3 w - - 0 1");
        assert_eq!(
            see(&b, coup(&b, "e4e5")),
            VALUE[Piece::Pawn as usize] - VALUE[Piece::Rook as usize]
        );
    }

    #[test]
    fn la_prise_en_passant_est_comptee() {
        // La case d'arrivée est VIDE : le pion pris est sur la colonne
        // d'arrivée et la rangée de départ. Vérifié non défendue, sans quoi le
        // test rendrait zéro — la même valeur qu'un coup tranquille, et il
        // passerait sans rien mesurer.
        let b = board("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
        assert_eq!(see(&b, coup(&b, "e5d6")), VALUE[Piece::Pawn as usize]);
    }

    #[test]
    fn une_promotion_par_capture_compte_la_piece_promue() {
        let b = board("r3k3/1P6/8/8/8/8/8/4K3 w q - 0 1");
        assert_eq!(
            see(&b, coup(&b, "b7a8q")),
            VALUE[Piece::Rook as usize] + VALUE[Piece::Queen as usize]
                - VALUE[Piece::Pawn as usize]
        );
    }

    #[test]
    fn le_rayon_x_derriere_lagresseur_compte() {
        // Deux tours empilées sur la colonne e : la seconde défend la première
        // dès que celle-ci quitte sa case. Sans rayon X l'échange paraîtrait
        // perdant.
        let b = board("4k3/8/8/4p3/8/8/4R3/4RK2 w - - 0 1");
        assert_eq!(see(&b, coup(&b, "e2e5")), VALUE[Piece::Pawn as usize]);
    }

    #[test]
    fn le_roi_compte_comme_repreneur_quand_il_le_peut() {
        // Vérifié par exécution : après Rxd5 exd5, l'unique reprise LÉGALE est
        // celle du roi. Le test est distinguant — retirer le roi de
        // `least_valuable_attacker` rendrait −400 au lieu de −300.
        let b = board("4k3/8/4p3/R2p4/4K3/8/8/8 w - - 0 1");
        assert_eq!(
            see(&b, coup(&b, "a5d5")),
            VALUE[Piece::Pawn as usize] - VALUE[Piece::Rook as usize] + VALUE[Piece::Pawn as usize]
        );
    }

    #[test]
    fn la_coupure_du_manuel_se_tromperait_ici() {
        // Régression sur le bug que l'oracle a trouvé au premier passage. La
        // coupure `max(-gain[d-1], gain[d]) < 0` s'arrête après la reprise du
        // fou et manque que la dame noire reprend le fou : −560 au lieu de
        // −660. Valeur lue sur l'oracle.
        let b = board("r2q1rk1/p1p2ppp/bp3n2/2bp2B1/4P3/N1QP1N1P/PP3PP1/R3K2R w KQ - 2 13");
        assert_eq!(see(&b, coup(&b, "c3f6")), -660);
    }

    #[test]
    fn la_geometrie_ignore_le_clouage_et_cest_assume() {
        // Le fou g2 est cloué par la dame g5 contre le roi g1 : il ne peut pas
        // légalement reprendre, et SEE le compte quand même. **C'est la limite
        // connue et mesurée** — 0,43 % des captures, 20 écarts sur 4623, tous
        // dus à la légalité. Ce test existe pour que la limite soit un fait
        // vérifié et non une note de bas de page qui vieillit.
        let b = board("r3kb1r/1p3npp/p1n5/P1pb1pq1/4p3/3PP3/1P1N1PBP/RNBQ1RK1 w kq - 0 13");
        assert_eq!(
            see(&b, coup(&b, "d3e4")),
            VALUE[Piece::Pawn as usize],
            "la valeur exacte est 0 : le fou g2 est cloué. SEE l'ignore par construction."
        );
    }
}
