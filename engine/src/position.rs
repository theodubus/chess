//! Position de partie : le plateau, plus l'historique que le plateau ne garde pas.
//!
//! [`cozy_chess::Board`] « tient à peu près autant d'état qu'une FEN » et ne
//! conserve aucun historique. La détection de répétition en a besoin, donc
//! c'est ici qu'elle vit.

use cozy_chess::util::parse_uci_move;
use cozy_chess::{Board, Move};

/// La position courante d'une partie, avec les clés Zobrist traversées.
#[derive(Debug, Clone)]
pub struct Position {
    board: Board,
    /// Clés Zobrist de toutes les positions traversées depuis la racine,
    /// la dernière étant celle de `board`. Jamais vide.
    history: Vec<u64>,
}

impl Default for Position {
    fn default() -> Self {
        Self::startpos()
    }
}

impl Position {
    /// La position initiale des échecs.
    #[must_use]
    pub fn startpos() -> Self {
        Self::from_board(Board::default())
    }

    /// Construit une position à partir d'un plateau, sans historique antérieur.
    #[must_use]
    pub fn from_board(board: Board) -> Self {
        let history = vec![board.hash()];
        Self { board, history }
    }

    /// Analyse une FEN. Accepte les FEN standard comme les FEN Shredder.
    ///
    /// # Errors
    /// Renvoie un message lisible si la FEN est invalide.
    pub fn from_fen(fen: &str) -> Result<Self, String> {
        fen.parse::<Board>()
            .map(Self::from_board)
            .map_err(|e| format!("FEN invalide : {e}"))
    }

    /// Le plateau courant.
    #[must_use]
    pub fn board(&self) -> &Board {
        &self.board
    }

    /// Le nombre de demi-coups joués depuis la racine de cette position.
    #[must_use]
    pub fn ply(&self) -> usize {
        self.history.len() - 1
    }

    /// Joue un coup supposé légal.
    ///
    /// # Panics
    /// Panique en debug si le coup est illégal. C'est délibéré : un coup
    /// illégal produit par le moteur lui-même est un bug, jamais un
    /// avertissement à ignorer.
    pub fn play(&mut self, mv: Move) {
        debug_assert!(
            self.board.is_legal(mv),
            "coup illégal joué sur la position : {mv}"
        );
        self.board.play_unchecked(mv);
        self.history.push(self.board.hash());
    }

    /// Joue un coup exprimé en notation UCI (`e2e4`, `e7e8q`, `e1g1`).
    ///
    /// Convertit le roque de la notation UCI vers la notation roi-prend-tour
    /// employée en interne par `cozy-chess`.
    ///
    /// # Errors
    /// Renvoie un message lisible si le coup est mal formé ou illégal.
    pub fn play_uci(&mut self, token: &str) -> Result<Move, String> {
        let mv = parse_uci_move(&self.board, token)
            .map_err(|_| format!("coup illisible ou illégal : {token}"))?;
        if !self.board.is_legal(mv) {
            return Err(format!("coup illégal : {token}"));
        }
        self.play(mv);
        Ok(mv)
    }

    /// Le nombre de fois que la position courante est déjà apparue auparavant.
    ///
    /// Ne remonte que jusqu'au dernier coup irréversible : au-delà, aucune
    /// répétition n'est possible.
    #[must_use]
    pub fn repetition_count(&self) -> usize {
        let hash = self.board.hash();
        let reversible = self.board.halfmove_clock() as usize;
        self.history
            .iter()
            .rev()
            .take(reversible + 1)
            // Seules les positions au même trait peuvent coïncider, d'où le pas de 2 ;
            // `skip(2)` écarte la position courante et celle du trait adverse.
            .skip(2)
            .step_by(2)
            .filter(|&&h| h == hash)
            .count()
    }

    /// Vrai si la position courante est déjà apparue au moins une fois.
    ///
    /// C'est le critère employé **dans la recherche**, où une seule répétition
    /// suffit à traiter la branche comme nulle. La règle de partie exige trois
    /// occurrences : utiliser [`Position::repetition_count`] pour cela.
    #[must_use]
    pub fn is_repetition(&self) -> bool {
        self.repetition_count() > 0
    }

    /// Vrai si la règle des cinquante coups est atteinte.
    #[must_use]
    pub fn is_fifty_move_draw(&self) -> bool {
        self.board.halfmove_clock() >= 100
    }
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "les tests doivent échouer bruyamment")]
mod tests {
    use super::*;

    #[test]
    fn startpos_a_un_historique_dun_element() {
        let pos = Position::startpos();
        assert_eq!(pos.ply(), 0);
        assert!(!pos.is_repetition());
    }

    #[test]
    fn aller_retour_de_cavaliers_produit_une_repetition() {
        let mut pos = Position::startpos();
        for token in ["g1f3", "g8f6", "f3g1", "f6g8"] {
            pos.play_uci(token).unwrap();
        }
        // La position initiale est revenue : une occurrence antérieure.
        assert_eq!(pos.repetition_count(), 1);
        assert!(pos.is_repetition());
    }

    #[test]
    fn une_position_intermediaire_nest_pas_une_repetition() {
        let mut pos = Position::startpos();
        pos.play_uci("g1f3").unwrap();
        assert!(!pos.is_repetition());
    }

    #[test]
    fn un_coup_de_pion_coupe_la_fenetre_de_repetition() {
        let mut pos = Position::startpos();
        for token in ["g1f3", "g8f6", "f3g1", "f6g8", "e2e4"] {
            pos.play_uci(token).unwrap();
        }
        // Le coup de pion remet le compteur des cinquante coups à zéro :
        // plus rien d'antérieur n'est atteignable.
        assert_eq!(pos.repetition_count(), 0);
    }

    #[test]
    fn le_roque_uci_est_accepte_et_converti() {
        let mut pos =
            Position::from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1").unwrap();
        let mv = pos.play_uci("e1g1").unwrap();
        // En interne, cozy-chess encode le roque en roi-prend-tour.
        assert_eq!(mv.to, cozy_chess::Square::H1);
        assert_eq!(
            pos.board().king(cozy_chess::Color::White),
            cozy_chess::Square::G1
        );
    }

    #[test]
    fn un_coup_illegal_est_rejete_sans_paniquer() {
        let mut pos = Position::startpos();
        assert!(pos.play_uci("e1e8").is_err());
        assert!(pos.play_uci("zzzz").is_err());
        assert_eq!(pos.ply(), 0);
    }

    #[test]
    fn une_fen_invalide_est_rejetee() {
        assert!(Position::from_fen("pas une fen").is_err());
    }
}
