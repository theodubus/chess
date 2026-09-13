//! Tests d'intégration du protocole : le binaire est réellement lancé et
//! piloté en texte, comme le ferait Cute Chess.
//!
//! Ces tests visent le critère de fin de l'étape C7 — « l'interface lance le
//! binaire et il joue sans jamais être disqualifié » — et verrouillent les
//! deux pièges connus : la conversion du roque et le tampon de sortie.

#![expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]

use std::io::Write;
use std::process::{Command, Stdio};

/// Envoie un script de commandes au binaire et rend toute sa sortie.
///
/// Le script est écrit d'un bloc puis stdin est fermé : le moteur consomme les
/// commandes dans l'ordre, et `quit` garantit la terminaison même si une
/// recherche est en cours.
fn drive(script: &[&str]) -> String {
    let mut child = Command::new(env!("CARGO_BIN_EXE_chess-engine"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    {
        let mut stdin = child.stdin.take().unwrap();
        for line in script {
            writeln!(stdin, "{line}").unwrap();
        }
        writeln!(stdin, "quit").unwrap();
    }

    let output = child.wait_with_output().unwrap();
    assert!(output.status.success(), "le moteur s'est terminé en erreur");
    String::from_utf8(output.stdout).unwrap()
}

fn count(haystack: &str, needle: &str) -> usize {
    haystack.lines().filter(|l| l.starts_with(needle)).count()
}

#[test]
fn la_poignee_de_main_est_conforme() {
    let out = drive(&["uci", "isready"]);
    assert!(out.contains("id name "), "{out}");
    assert!(out.contains("id author "), "{out}");
    assert!(out.contains("uciok"), "{out}");
    assert!(out.contains("readyok"), "{out}");
    // `uciok` doit précéder `readyok` : l'interface attend l'un puis l'autre.
    assert!(out.find("uciok") < out.find("readyok"), "{out}");
}

#[test]
fn go_rend_exactement_un_bestmove() {
    let out = drive(&[
        "uci",
        "isready",
        "position startpos",
        "go wtime 1000 btime 1000",
    ]);
    assert_eq!(count(&out, "bestmove"), 1, "{out}");
}

#[test]
fn le_coup_rendu_est_legal_apres_une_sequence() {
    let out = drive(&[
        "position startpos moves e2e4 e7e5 g1f3 b8c6 f1b5",
        "go movetime 10",
    ]);
    let best = out
        .lines()
        .find_map(|l| l.strip_prefix("bestmove "))
        .unwrap()
        .trim()
        .to_owned();

    // Le coup doit figurer parmi les coups légaux de la position,
    // en notation UCI.
    let mut board: cozy_chess::Board = cozy_chess::Board::default();
    for token in ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"] {
        let mv = cozy_chess::util::parse_uci_move(&board, token).unwrap();
        board.play_unchecked(mv);
    }
    let mut legal = Vec::new();
    board.generate_moves(|moves| {
        for mv in moves {
            legal.push(cozy_chess::util::display_uci_move(&board, mv).to_string());
        }
        false
    });
    assert!(legal.contains(&best), "coup illégal rendu : {best}\n{out}");
}

#[test]
fn le_roque_est_converti_dans_les_deux_sens() {
    // Entrée : `e1g1` en notation UCI doit être accepté, alors que cozy-chess
    // encode le roque en roi-prend-tour (`e1h1`).
    let entree = drive(&[
        "position fen r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1 moves e1g1",
        "go movetime 10",
    ]);
    assert!(
        !entree.contains("info string"),
        "roque UCI refusé :\n{entree}"
    );
    assert_eq!(count(&entree, "bestmove"), 1, "{entree}");

    // Sortie : les coups annoncés doivent être en notation UCI, pas en interne.
    let sortie = drive(&[
        "position fen r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
        "go perft 1",
    ]);
    assert!(
        sortie.contains("e1g1:"),
        "petit roque mal affiché :\n{sortie}"
    );
    assert!(
        sortie.contains("e1c1:"),
        "grand roque mal affiché :\n{sortie}"
    );
    assert!(
        !sortie.contains("e1h1:"),
        "notation interne fuitée :\n{sortie}"
    );
    assert!(
        !sortie.contains("e1a1:"),
        "notation interne fuitée :\n{sortie}"
    );
    assert!(sortie.contains("Nodes searched: 26"), "{sortie}");
}

#[test]
fn stop_interrompt_une_recherche_infinie() {
    let out = drive(&["position startpos", "go infinite", "stop", "isready"]);
    assert_eq!(count(&out, "bestmove"), 1, "{out}");
    assert!(out.contains("readyok"), "{out}");
}

#[test]
fn une_position_matee_rend_le_coup_nul() {
    let out = drive(&[
        "position fen r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
        "go movetime 10",
    ]);
    assert!(out.contains("bestmove 0000"), "{out}");
}

#[test]
fn une_commande_inconnue_est_ignoree_sans_casser_la_session() {
    let out = drive(&["cette commande n'existe pas", "uci", "isready"]);
    assert!(out.contains("uciok"), "{out}");
    assert!(out.contains("readyok"), "{out}");
}

#[test]
fn un_coup_illegal_est_signale_et_la_position_ignoree() {
    let out = drive(&["position startpos moves e2e4 e7e9", "isready"]);
    assert!(out.contains("info string"), "{out}");
    assert!(out.contains("readyok"), "la session doit survivre : {out}");
}

#[test]
fn deux_recherches_identiques_rendent_le_meme_coup() {
    let script = ["position startpos moves d2d4 d7d5", "go movetime 10"];
    let a = drive(&script);
    let b = drive(&script);
    let best = |out: &str| {
        out.lines()
            .find_map(|l| l.strip_prefix("bestmove "))
            .unwrap()
            .trim()
            .to_owned()
    };
    assert_eq!(best(&a), best(&b), "la recherche doit être déterministe");
}

#[test]
fn ucinewgame_remet_la_position_initiale() {
    let out = drive(&["position startpos moves e2e4", "ucinewgame", "d"]);
    assert!(
        out.contains("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
        "{out}"
    );
}

#[test]
fn go_perft_reproduit_les_valeurs_de_reference() {
    let out = drive(&["position startpos", "go perft 4"]);
    assert!(out.contains("Nodes searched: 197281"), "{out}");
}
