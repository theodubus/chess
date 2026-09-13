//! Recherche.
//!
//! # État actuel
//!
//! La recherche est un **coup légal tiré au sort de façon déterministe**. Ce
//! n'est pas un oubli : l'étape courante du projet consiste à faire
//! fonctionner tout le protocole UCI de bout en bout avec une recherche
//! triviale, de sorte que le protocole soit débogué avant que la recherche
//! n'existe. Voir C7 dans le carnet de bord.
//!
//! # Ce qui est déjà en place et ne devra pas être rétrofité
//!
//! - Le **drapeau d'arrêt atomique**, consulté par la recherche, qui rend
//!   `stop` et `go infinite` corrects dès maintenant. L'ajouter après coup
//!   dans une recherche récursive est nettement plus pénible.
//! - Le **comptage des nœuds** et l'émission des lignes `info`.
//! - Le **déterminisme** : la graine du tirage est le hash Zobrist de la
//!   position, donc une même position produit toujours le même coup.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use cozy_chess::{Board, Move};

use crate::position::Position;

/// Contraintes transmises par `go`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Limits {
    /// Temps restant aux blancs, en millisecondes.
    pub wtime: Option<u64>,
    /// Temps restant aux noirs, en millisecondes.
    pub btime: Option<u64>,
    /// Incrément des blancs, en millisecondes.
    pub winc: Option<u64>,
    /// Incrément des noirs, en millisecondes.
    pub binc: Option<u64>,
    /// Nombre de coups avant le prochain contrôle de pendule.
    pub movestogo: Option<u32>,
    /// Temps imposé pour ce coup, en millisecondes.
    pub movetime: Option<u64>,
    /// Profondeur maximale.
    pub depth: Option<u32>,
    /// Budget de nœuds.
    pub nodes: Option<u64>,
    /// Chercher jusqu'à réception de `stop`.
    pub infinite: bool,
}

/// Une ligne `info` prête à être émise par la couche UCI.
#[derive(Debug, Clone)]
pub struct Info {
    /// Profondeur atteinte.
    pub depth: u32,
    /// Score en centièmes de pion, du point de vue du trait.
    pub score_cp: i32,
    /// Nœuds visités.
    pub nodes: u64,
    /// Durée écoulée, en millisecondes.
    pub time_ms: u64,
    /// Variante principale, en notation interne (à convertir pour UCI).
    pub pv: Vec<Move>,
}

/// L'état d'une recherche.
pub struct Search {
    stop: Arc<AtomicBool>,
    nodes: u64,
}

impl Search {
    /// Crée une recherche pilotée par le drapeau d'arrêt fourni.
    #[must_use]
    pub fn new(stop: Arc<AtomicBool>) -> Self {
        Self { stop, nodes: 0 }
    }

    /// Nombre de nœuds visités par la dernière recherche.
    #[must_use]
    pub fn nodes(&self) -> u64 {
        self.nodes
    }

    /// Vrai si un arrêt a été demandé.
    fn should_stop(&self) -> bool {
        self.stop.load(Ordering::Relaxed)
    }

    /// Cherche le meilleur coup de la position.
    ///
    /// Renvoie `None` si la position n'a aucun coup légal (mat ou pat), auquel
    /// cas la couche UCI répond `bestmove 0000`.
    ///
    /// `report` reçoit chaque ligne `info` à émettre.
    pub fn go(
        &mut self,
        position: &Position,
        limits: &Limits,
        mut report: impl FnMut(&Info),
    ) -> Option<Move> {
        let started = Instant::now();
        self.nodes = 0;

        let board = position.board();
        let best = pick_deterministic(board, &mut self.nodes);

        report(&Info {
            depth: 1,
            score_cp: 0,
            nodes: self.nodes,
            time_ms: started.elapsed().as_millis() as u64,
            pv: best.into_iter().collect(),
        });

        // `go infinite` impose de chercher jusqu'à `stop`. Émettre `bestmove`
        // plus tôt ferait désynchroniser l'interface, qui attend exactement une
        // réponse par `go`.
        if limits.infinite {
            while !self.should_stop() {
                std::thread::sleep(Duration::from_millis(1));
            }
        }

        best
    }
}

/// Tire un coup légal de façon reproductible.
///
/// La graine est le hash Zobrist de la position : deux appels sur la même
/// position rendent le même coup, et deux positions différentes rendent des
/// coups sans corrélation visible. Aucun hasard non seedé n'entre dans le
/// moteur — c'est un invariant, pas une commodité.
fn pick_deterministic(board: &Board, nodes: &mut u64) -> Option<Move> {
    let mut legal = Vec::new();
    board.generate_moves(|moves| {
        legal.extend(moves);
        false
    });
    *nodes = legal.len() as u64;

    if legal.is_empty() {
        return None;
    }
    let mut state = board.hash() | 1;
    let index = (next_random(&mut state) % legal.len() as u64) as usize;
    legal.get(index).copied()
}

/// xorshift64*, suffisant pour un tirage de coup et entièrement déterministe.
fn next_random(state: &mut u64) -> u64 {
    let mut x = *state;
    x ^= x >> 12;
    x ^= x << 25;
    x ^= x >> 27;
    *state = x;
    x.wrapping_mul(0x2545_F491_4F6C_DD1D)
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "les tests doivent échouer bruyamment")]
mod tests {
    use super::*;

    fn search() -> Search {
        Search::new(Arc::new(AtomicBool::new(false)))
    }

    #[test]
    fn la_recherche_est_deterministe() {
        let pos = Position::startpos();
        let a = search().go(&pos, &Limits::default(), |_| {});
        let b = search().go(&pos, &Limits::default(), |_| {});
        assert_eq!(a, b);
        assert!(a.is_some());
    }

    #[test]
    fn le_coup_rendu_est_legal() {
        let mut pos = Position::startpos();
        for token in ["e2e4", "e7e5", "g1f3"] {
            pos.play_uci(token).unwrap();
        }
        let mv = search().go(&pos, &Limits::default(), |_| {}).unwrap();
        assert!(pos.board().is_legal(mv));
    }

    #[test]
    fn une_position_matee_ne_rend_aucun_coup() {
        // Mat du berger : les noirs sont mat, aucun coup légal.
        let pos = Position::from_fen(
            "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
        )
        .unwrap();
        assert!(search().go(&pos, &Limits::default(), |_| {}).is_none());
    }

    #[test]
    fn go_infinite_sarrete_sur_le_drapeau() {
        let stop = Arc::new(AtomicBool::new(false));
        let mut s = Search::new(Arc::clone(&stop));
        let flag = Arc::clone(&stop);
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(20));
            flag.store(true, Ordering::Relaxed);
        });
        let limits = Limits {
            infinite: true,
            ..Limits::default()
        };
        assert!(s.go(&Position::startpos(), &limits, |_| {}).is_some());
        assert!(stop.load(Ordering::Relaxed));
    }

    #[test]
    fn une_info_est_emise_par_recherche() {
        let mut seen = 0;
        search().go(&Position::startpos(), &Limits::default(), |info| {
            assert_eq!(info.pv.len(), 1);
            seen += 1;
        });
        assert_eq!(seen, 1);
    }
}
