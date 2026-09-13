//! Charge de travail fixe, pour détecter les régressions sans passer par un match.
//!
//! Un match moteur contre moteur mesure la **force** et demande des milliers de
//! parties. `bench` mesure le **travail** : combien de nœuds la recherche
//! visite pour atteindre une profondeur donnée, et à quelle vitesse. Les deux
//! sont nécessaires et ne se remplacent pas.
//!
//! Le compte de nœuds est la mesure la plus utile des deux, parce qu'il est
//! **déterministe** : il ne dépend ni de la machine ni de sa charge. Un
//! changement d'ordonnancement ou d'élagage s'y voit immédiatement, alors que
//! les nœuds par seconde varient d'un run à l'autre sur un conteneur partagé.
//!
//! Le format de sortie est stable et se termine par `Nodes/second`, ce qui
//! permet de comparer deux commits par un simple `diff`.

use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use crate::position::Position;
use crate::search::{Limits, Search};

/// Les positions de la charge de travail, choisies pour couvrir des structures
/// différentes : ouverture, milieu de partie dense, finale, promotions, roques.
pub const BENCH_FENS: [&str; 6] = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
];

/// Profondeur par défaut : quelques secondes en build `--release`.
pub const DEFAULT_DEPTH: u32 = 7;

/// Exécute la charge de travail et écrit le rapport sur la sortie standard.
///
/// # Errors
/// Renvoie un message lisible si une FEN intégrée est invalide, ce qui ne peut
/// arriver qu'en cas d'édition fautive de [`BENCH_FENS`].
pub fn run(depth: u32) -> Result<(), String> {
    let stop = Arc::new(AtomicBool::new(false));
    let limits = Limits {
        depth: Some(depth),
        ..Limits::default()
    };

    let mut total_nodes = 0u64;
    let started = Instant::now();

    for fen in BENCH_FENS {
        let position = Position::from_fen(fen)?;
        let mut search = Search::new(Arc::clone(&stop));
        let at = Instant::now();
        search.go(&position, &limits, |_| {});
        let nodes = search.nodes();
        total_nodes += nodes;
        println!(
            "{nodes:>12} nœuds  {:>8.3} s   {fen}",
            at.elapsed().as_secs_f64()
        );
    }

    let elapsed = started.elapsed();
    let nps = (total_nodes as f64 / elapsed.as_secs_f64().max(f64::EPSILON)) as u64;

    println!("===========================");
    println!("Depth        : {depth}");
    println!("Total nodes  : {total_nodes}");
    println!("Time (ms)    : {}", elapsed.as_millis());
    println!("Nodes/second : {nps}");
    Ok(())
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]
mod tests {
    use super::*;
    use cozy_chess::Board;

    #[test]
    fn toutes_les_fens_de_bench_sont_valides() {
        for fen in BENCH_FENS {
            let board: Board = fen.parse().unwrap();
            assert_eq!(board.to_string(), fen, "aller-retour FEN non exact");
        }
    }

    #[test]
    fn le_bench_sexecute_a_faible_profondeur() {
        assert!(run(2).is_ok());
    }

    #[test]
    fn le_compte_de_noeuds_est_deterministe() {
        // C'est ce qui fait de `bench` une mesure comparable d'un commit à
        // l'autre : le temps varie, le nombre de nœuds non.
        let stop = Arc::new(AtomicBool::new(false));
        let limits = Limits {
            depth: Some(4),
            ..Limits::default()
        };
        let position = Position::from_fen(BENCH_FENS[1]).unwrap();

        let mut first = Search::new(Arc::clone(&stop));
        first.go(&position, &limits, |_| {});
        let mut second = Search::new(Arc::clone(&stop));
        second.go(&position, &limits, |_| {});

        assert_eq!(first.nodes(), second.nodes());
    }
}
