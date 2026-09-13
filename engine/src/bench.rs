//! Charge de travail fixe, pour détecter les régressions de performance sans
//! passer par un match.
//!
//! Un match moteur contre moteur mesure la **force** et demande des milliers de
//! parties. `bench` mesure la **vitesse** et prend quelques secondes. Les deux
//! sont nécessaires : un changement qui divise le débit par deux se voit ici
//! immédiatement, bien avant qu'un SPRT ne le détecte.
//!
//! Le format de sortie est stable et se termine par `Nodes/second`, ce qui
//! permet de comparer deux commits par un simple `diff`.

use std::time::Instant;

use cozy_chess::Board;

use crate::perft;

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
pub const DEFAULT_DEPTH: u32 = 5;

/// Exécute la charge de travail et écrit le rapport sur la sortie standard.
///
/// Renvoie `Err` si une FEN de la charge est invalide, ce qui ne peut arriver
/// qu'en cas d'édition fautive de [`BENCH_FENS`].
///
/// # Errors
/// Renvoie un message lisible si une FEN intégrée est invalide.
pub fn run(depth: u32) -> Result<(), String> {
    let mut total_nodes = 0u64;
    let started = Instant::now();

    for fen in BENCH_FENS {
        let board: Board = fen
            .parse()
            .map_err(|e| format!("FEN de bench invalide ({fen}) : {e}"))?;
        let at = Instant::now();
        let nodes = perft::perft(&board, depth);
        total_nodes += nodes;
        println!(
            "{nodes:>12} nœuds  {:>8.3} s   {fen}",
            at.elapsed().as_secs_f64()
        );
    }

    let elapsed = started.elapsed();
    let nps = if elapsed.as_secs_f64() > 0.0 {
        (total_nodes as f64 / elapsed.as_secs_f64()) as u64
    } else {
        0
    };

    println!("===========================");
    println!("Depth        : {depth}");
    println!("Total nodes  : {total_nodes}");
    println!("Time (ms)    : {}", elapsed.as_millis());
    println!("Nodes/second : {nps}");
    Ok(())
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "les tests doivent échouer bruyamment")]
mod tests {
    use super::*;

    #[test]
    fn toutes_les_fens_de_bench_sont_valides() {
        for fen in BENCH_FENS {
            let board: Board = fen.parse().unwrap();
            assert_eq!(board.to_string(), fen, "aller-retour FEN non exact");
        }
    }

    #[test]
    fn le_bench_sexecute_a_faible_profondeur() {
        assert!(run(1).is_ok());
    }
}
