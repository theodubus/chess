//! Confronte l'échange statique du moteur à un oracle par force brute.
//!
//! # Pourquoi un oracle, et pas des tests écrits à la main
//!
//! SEE est « facile à écrire subtilement faux », et les quatre cas qui le
//! rendent faux — prise en passant, promotion en reprenant, attaque en rayons X,
//! roi qui ne peut pas prendre sur une case défendue — sont précisément ceux
//! qu'une relecture laisse passer. Le projet a déjà payé cinq fois pour avoir
//! dérivé une position d'échecs par raisonnement.
//!
//! # L'oracle
//!
//! Une recherche exhaustive des captures sur la **seule** case visée, jouée par
//! le vrai générateur de coups de `cozy-chess`. Elle est exacte **par
//! construction** : elle hérite des clouages, des découvertes, de la légalité du
//! roi et de la prise en passant sans qu'on ait à les réécrire. Elle est lente,
//! et c'est sans importance — elle ne tourne pas dans la recherche.
//!
//! À chaque étage, le camp au trait peut **s'arrêter** : personne n'est forcé de
//! reprendre. D'où le `max(0, …)`, qui est toute la différence entre un échange
//! statique et une somme alternée.
//!
//! # Usage
//!
//!     cargo run --release --bin see_check < corpus.txt
//!
//! Le corpus se produit par `datagen`, jamais depuis le banc : les six positions
//! du banc ne sont pas un échantillon de jeu.
use std::io::BufRead;

use cozy_chess::{Board, Move, Square};
use shallowred::search::captured_piece;
use shallowred::see::{capture_value, see};

/// Ce que le camp au trait peut extraire de `target`, au mieux.
///
/// Zéro s'il vaut mieux ne rien prendre — c'est l'option d'arrêt.
fn oracle(board: &Board, target: Square) -> i32 {
    let mut best = 0;
    board.generate_moves(|set| {
        for mv in set {
            if mv.to != target {
                continue;
            }
            let Some(gain) = capture_value(board, mv) else {
                continue;
            };
            let mut child = board.clone();
            child.play_unchecked(mv);
            best = best.max(gain - oracle(&child, target));
        }
        false
    });
    best
}

/// La valeur exacte de `mv`, selon l'oracle.
fn exact(board: &Board, mv: Move) -> Option<i32> {
    let gain = capture_value(board, mv)?;
    let mut child = board.clone();
    child.play_unchecked(mv);
    Some(gain - oracle(&child, mv.to))
}

fn main() {
    // `detail` imprime chaque capture avec sa valeur d'oracle, au lieu de ne
    // signaler que les écarts. C'est ce qui sert à FIXER la valeur attendue
    // d'un test au lieu de la dériver de tête — faute payée six fois sur ce
    // projet, dont une fois dans le module que ce binaire vérifie.
    let detail = std::env::args().any(|a| a == "detail");
    let limite: usize = std::env::args()
        .nth(1)
        .and_then(|a| a.parse().ok())
        .unwrap_or(2000);

    let (mut positions, mut captures, mut ecarts) = (0usize, 0u64, 0u64);
    let mut exemples: Vec<String> = Vec::new();

    let stdin = std::io::stdin();
    for line in stdin.lock().lines().map_while(Result::ok) {
        if positions >= limite {
            break;
        }
        let fen = line.split(';').next().unwrap_or("").trim();
        if fen.is_empty() {
            continue;
        }
        let Ok(board) = fen.parse::<Board>() else {
            continue;
        };
        positions += 1;

        let mut coups = Vec::new();
        board.generate_moves(|set| {
            coups.extend(set);
            false
        });
        for mv in coups {
            if captured_piece(&board, mv).is_none() {
                continue;
            }
            captures += 1;
            let Some(attendu) = exact(&board, mv) else {
                continue;
            };
            let obtenu = see(&board, mv);
            if detail {
                println!(
                    "DETAIL|{fen}|{}|oracle {attendu}|see {obtenu}",
                    cozy_chess::util::display_uci_move(&board, mv)
                );
            }
            if obtenu != attendu {
                ecarts += 1;
                exemples.push(format!(
                    "{fen}|{}|{attendu}|{obtenu}",
                    cozy_chess::util::display_uci_move(&board, mv)
                ));
            }
        }
        if positions.is_multiple_of(200) {
            eprintln!("{positions} positions, {captures} captures, {ecarts} écarts…");
        }
    }

    println!("positions            {positions}");
    println!("captures confrontées {captures}");
    println!("ÉCARTS               {ecarts}");
    // Chaque écart est imprimé en entier, pour être classé par un oracle de
    // clouage. Un écart qu'on ne classe pas est un écart qu'on suppose.
    for e in &exemples {
        println!("ECART|{e}");
    }
}
