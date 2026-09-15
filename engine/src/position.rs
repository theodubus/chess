//! Position de partie : le plateau, plus l'historique que le plateau ne garde pas.
//!
//! [`cozy_chess::Board`] « tient à peu près autant d'état qu'une FEN » et ne
//! conserve aucun historique. La détection de répétition en a besoin, donc
//! c'est ici qu'elle vit.

use cozy_chess::util::parse_uci_move;
use cozy_chess::{Board, Move};

/// Compte les occurrences antérieures de `hash` dans un historique de clés
/// Zobrist dont le dernier élément est la position courante.
///
/// Ne remonte que jusqu'au dernier coup irréversible — au-delà, aucune
/// répétition n'est possible, puisqu'une capture ou un coup de pion ne se
/// défait pas. Le pas de deux vient de ce que seules les positions au même
/// trait peuvent coïncider ; `skip(2)` écarte la position courante et celle du
/// trait adverse.
///
/// Cette fonction est partagée entre [`Position`] et la recherche, pour que les
/// deux ne puissent pas diverger sur ce qu'est une répétition.
#[must_use]
pub fn repetitions(history: &[u64], hash: u64, halfmove_clock: u8) -> usize {
    history
        .iter()
        .rev()
        .take(halfmove_clock as usize + 1)
        .skip(2)
        .step_by(2)
        .filter(|&&seen| seen == hash)
        .count()
}

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

    /// Les clés Zobrist traversées, la dernière étant celle de `board`.
    ///
    /// La recherche en a besoin pour poursuivre la détection de répétition
    /// dans son propre arbre : une position répétée en cours de recherche est
    /// nulle, même si la répétition commence avant la racine.
    #[must_use]
    pub fn history(&self) -> &[u64] {
        &self.history
    }

    /// Le nombre de fois que la position courante est déjà apparue auparavant.
    #[must_use]
    pub fn repetition_count(&self) -> usize {
        repetitions(
            &self.history,
            self.board.hash(),
            self.board.halfmove_clock(),
        )
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
        assert_eq!(pos.history().len(), 1);
        assert!(!pos.is_repetition());
    }

    #[test]
    fn lhistorique_porte_une_cle_par_position_traversee() {
        // `history` alimente la détection de répétition de la recherche. Un
        // test de mutation a montré qu'elle pouvait rendre un tableau vide,
        // ou `[0]`, ou `[1]`, sans qu'aucun test ne s'en aperçoive — et la
        // détection de répétition serait alors silencieusement morte.
        let mut pos = Position::startpos();
        assert_eq!(pos.history(), &[pos.board().hash()]);

        let mut attendu = vec![pos.board().hash()];
        for token in ["e2e4", "e7e5", "g1f3"] {
            pos.play_uci(token).unwrap();
            attendu.push(pos.board().hash());
        }
        assert_eq!(pos.history(), attendu.as_slice());
        assert_eq!(
            pos.history().last(),
            Some(&pos.board().hash()),
            "la dernière clé est toujours celle de la position courante"
        );
    }

    #[test]
    fn une_fenetre_non_vide_sans_correspondance_ne_compte_rien() {
        // LE test qui manquait. Les deux tests de répétition existants étaient
        // satisfaits par `==` comme par `!=` : dans l'un la fenêtre contenait
        // exactement une clé égale au hash (donc 1 des deux côtés), dans
        // l'autre elle était vide (donc 0 des deux côtés).
        //
        // Ici la fenêtre contient deux clés et AUCUNE n'égale la position
        // courante : `==` compte 0, `!=` compterait 2. Position vérifiée par
        // exécution — cinq demi-coups, compteur non remis à zéro.
        let mut pos = Position::startpos();
        for token in ["g1f3", "g8f6", "f3g1", "f6g8", "b1c3"] {
            pos.play_uci(token).unwrap();
        }
        assert_eq!(
            pos.board().halfmove_clock(),
            5,
            "la fenêtre doit être ouverte"
        );
        assert_eq!(
            pos.repetition_count(),
            0,
            "aucune position antérieure n'égale la position courante"
        );
        assert!(!pos.is_repetition());
    }

    #[test]
    fn la_regle_des_cinquante_coups_se_declenche_a_cent_demi_coups() {
        // Un test de mutation a montré que `is_fifty_move_draw` pouvait
        // toujours rendre `false` sans qu'un test bronche, alors que le
        // tournoi d'acceptation et `datagen` l'appellent tous deux.
        // Les deux FEN sont vérifiées par exécution.
        let atteinte = Position::from_fen("4k3/8/8/8/8/8/8/R3K3 w - - 100 60").unwrap();
        assert!(atteinte.is_fifty_move_draw(), "cent demi-coups font nulle");

        let juste_avant = Position::from_fen("4k3/8/8/8/8/8/8/R3K3 w - - 99 60").unwrap();
        assert!(
            !juste_avant.is_fifty_move_draw(),
            "quatre-vingt-dix-neuf ne suffisent pas — la borne est ce qui compte"
        );

        assert!(!Position::startpos().is_fifty_move_draw());
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
        assert_eq!(
            pos.history().len(),
            1,
            "un coup rejeté n'allonge pas l'historique"
        );
    }

    #[test]
    fn une_fen_invalide_est_rejetee() {
        assert!(Position::from_fen("pas une fen").is_err());
    }
}
