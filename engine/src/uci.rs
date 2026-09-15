//! Boucle UCI — l'unique frontière entre le moteur et le monde.
//!
//! # Ce que le protocole impose
//!
//! Le moteur est un processus séparé piloté en lignes de texte sur
//! stdin/stdout. Il ne conserve **aucun état de partie** : l'interface renvoie
//! la position complète à chaque coup, impose un budget de temps plutôt qu'une
//! profondeur, et attend exactement un `bestmove` par `go`.
//!
//! # Deux pièges traités ici
//!
//! - **Le roque.** `cozy-chess` emploie la notation roi-prend-tour (`e1h1`)
//!   pour supporter le Chess960 ; UCI attend `e1g1`. Toute conversion passe par
//!   [`cozy_chess::util`]. Un `Move` ne doit jamais être affiché brut.
//! - **La sortie tamponnée.** Chaque ligne est suivie d'un `flush` explicite.
//!   Sans cela l'interface attend indéfiniment une réponse déjà écrite.

use std::io::{self, BufRead, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};

use cozy_chess::util::display_uci_move;

use crate::bench;
use crate::perft;
use crate::position::Position;
use crate::search::{Limits, Score, Search};
use crate::tt::DEFAULT_SIZE_MB;

/// Nom annoncé à l'interface.
pub const NAME: &str = "ShallowRed";
/// Version annoncée, tirée du manifeste.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
/// Auteur annoncé.
pub const AUTHOR: &str = "theodubus";

/// Écrit une ligne sur la sortie standard et la pousse immédiatement.
fn send(line: &str) {
    let mut out = io::stdout().lock();
    let _ = writeln!(out, "{line}");
    let _ = out.flush();
}

/// Lit le jeton suivant et l'analyse dans le type attendu.
///
/// Un paramètre mal formé est ignoré plutôt que de faire échouer la commande :
/// une interface qui envoie `depth abc` doit obtenir une recherche, pas un
/// silence.
fn next_value<'a, T: std::str::FromStr>(tokens: &mut impl Iterator<Item = &'a str>) -> Option<T> {
    tokens.next().and_then(|value| value.parse().ok())
}

/// Analyse les paramètres de `go` et rend `(contraintes, profondeur de perft)`.
///
/// Fonction **pure** : elle ne touche à rien, ce qui la rend testable jeton par
/// jeton. Elle était inline dans [`Engine::go`], dont le corps lance un thread —
/// et un test de mutation a montré le prix de cette absence de prise : **chacun
/// des neuf paramètres pouvait être supprimé sans qu'un seul test s'en
/// aperçoive**, `wtime` et `btime` compris. Un moteur dont l'analyse de la
/// pendule n'est pas testée perd au temps dans une vraie interface.
///
/// Un jeton inconnu est ignoré, comme le protocole l'exige : une interface peut
/// envoyer des extensions que le moteur ne connaît pas.
fn parse_go<'a>(tokens: &mut impl Iterator<Item = &'a str>) -> (Limits, Option<u32>) {
    let mut limits = Limits::default();
    let mut perft_depth = None;

    while let Some(token) = tokens.next() {
        match token {
            "perft" => perft_depth = next_value(tokens),
            "wtime" => limits.wtime = next_value(tokens),
            "btime" => limits.btime = next_value(tokens),
            "winc" => limits.winc = next_value(tokens),
            "binc" => limits.binc = next_value(tokens),
            "movestogo" => limits.movestogo = next_value(tokens),
            "movetime" => limits.movetime = next_value(tokens),
            "depth" => limits.depth = next_value(tokens),
            "nodes" => limits.nodes = next_value(tokens),
            "infinite" => limits.infinite = true,
            _ => {}
        }
    }
    (limits, perft_depth)
}

/// Extrait le nom et la valeur d'un `setoption name <nom> value <valeur>`.
///
/// Séparée de [`Engine::set_option`] pour la même raison que [`parse_go`] :
/// l'action qu'elle déclenche — redimensionner la table — est difficile à
/// observer, l'analyse ne l'est pas.
fn parse_option<'a>(words: &[&'a str]) -> Option<(String, Option<&'a str>)> {
    let name_at = words.iter().position(|&w| w == "name")?;
    let value_at = words.iter().position(|&w| w == "value");
    let name = words[name_at + 1..value_at.unwrap_or(words.len())].join(" ");
    let value = value_at.and_then(|at| words.get(at + 1)).copied();
    Some((name, value))
}

/// Convertit une variante principale en notation UCI.
///
/// Chaque coup doit être converti sur le plateau où il est joué : sans cela un
/// roque plus loin dans la variante serait rendu en notation interne. Le
/// contrôle de légalité coupe la variante plutôt que de produire du charabia
/// si une table de transposition y glisse un jour un coup incohérent.
fn pv_to_uci(root: &cozy_chess::Board, pv: &[cozy_chess::Move]) -> String {
    let mut board = root.clone();
    let mut parts = Vec::with_capacity(pv.len());
    for &mv in pv {
        if !board.is_legal(mv) {
            break;
        }
        parts.push(display_uci_move(&board, mv).to_string());
        board.play_unchecked(mv);
    }
    parts.join(" ")
}

/// L'état du moteur entre deux commandes.
pub struct Engine {
    position: Position,
    stop: Arc<AtomicBool>,
    /// Le fil de recherche rend l'objet `Search` en se terminant, ce qui
    /// conserve la table de transposition d'un coup à l'autre sans partage
    /// entre fils ni verrou. C'est tout l'intérêt d'une table : la recherche
    /// du coup suivant part de ce que la précédente a déjà établi.
    worker: Option<JoinHandle<Search>>,
    search: Option<Search>,
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

impl Engine {
    /// Crée un moteur sur la position initiale.
    #[must_use]
    pub fn new() -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        Self {
            position: Position::startpos(),
            search: Some(Search::new(Arc::clone(&stop))),
            stop,
            worker: None,
        }
    }

    /// Lit stdin jusqu'à `quit` ou fin de flux.
    pub fn run(&mut self) {
        let stdin = io::stdin();
        for line in stdin.lock().lines().map_while(Result::ok) {
            if !self.handle(line.trim()) {
                break;
            }
        }
        self.abort_search();
    }

    /// Traite une commande. Renvoie `false` pour terminer la boucle.
    ///
    /// Une commande inconnue est ignorée en silence, comme le protocole
    /// l'exige : une interface peut envoyer des extensions que le moteur ne
    /// connaît pas, et s'en plaindre casserait la session.
    pub fn handle(&mut self, line: &str) -> bool {
        let mut tokens = line.split_whitespace();
        let Some(command) = tokens.next() else {
            return true;
        };

        match command {
            "uci" => {
                send(&format!("id name {NAME} {VERSION}"));
                send(&format!("id author {AUTHOR}"));
                send(&format!(
                    "option name Hash type spin default {DEFAULT_SIZE_MB} min 1 max 4096"
                ));
                send("uciok");
            }
            "isready" => send("readyok"),
            "ucinewgame" => {
                self.abort_search();
                self.position = Position::startpos();
                // Les positions d'une partie précédente n'ont rien à dire sur
                // la suivante, et leurs entrées occuperaient la table.
                if let Some(search) = self.search.as_mut() {
                    search.clear_table();
                }
            }
            "setoption" => self.set_option(tokens),
            "position" => self.set_position(tokens),
            "go" => self.go(tokens),
            "stop" => self.stop.store(true, Ordering::Relaxed),
            "d" => send(&self.position.board().to_string()),
            "bench" => {
                let depth = tokens
                    .next()
                    .and_then(|t| t.parse().ok())
                    .unwrap_or(bench::DEFAULT_DEPTH);
                if let Err(e) = bench::run(depth) {
                    send(&format!("info string {e}"));
                }
            }
            "quit" => return false,
            _ => {}
        }
        true
    }

    /// `setoption name <nom> value <valeur>`.
    ///
    /// Seul `Hash` est reconnu. Une option inconnue est ignorée en silence,
    /// comme le protocole l'exige.
    fn set_option<'a>(&mut self, tokens: impl Iterator<Item = &'a str>) {
        let words: Vec<&str> = tokens.collect();
        let Some((name, value)) = parse_option(&words) else {
            return;
        };

        if name.eq_ignore_ascii_case("hash")
            && let Some(megabytes) = value.and_then(|v| v.parse().ok())
        {
            // Redimensionner pendant une recherche invaliderait ses index :
            // on l'arrête d'abord, ce que `abort_search_keeping` garantit.
            self.abort_search_keeping(|search| search.resize_table(megabytes));
        }
    }

    /// `position startpos [moves ...]` ou `position fen <6 champs> [moves ...]`.
    fn set_position<'a>(&mut self, mut tokens: impl Iterator<Item = &'a str>) {
        self.abort_search();

        let mut next = tokens.next();
        let parsed = match next {
            Some("startpos") => {
                next = tokens.next();
                Ok(Position::startpos())
            }
            Some("fen") => {
                let mut fields = Vec::new();
                loop {
                    next = tokens.next();
                    match next {
                        Some(token) if token != "moves" => fields.push(token),
                        _ => break,
                    }
                }
                Position::from_fen(&fields.join(" "))
            }
            _ => Err("commande `position` sans `startpos` ni `fen`".to_owned()),
        };

        let mut position = match parsed {
            Ok(position) => position,
            Err(e) => {
                send(&format!("info string {e}"));
                return;
            }
        };

        if next == Some("moves") {
            for token in tokens {
                if let Err(e) = position.play_uci(token) {
                    // La position est abandonnée plutôt qu'acceptée à moitié :
                    // une position partiellement jouée ferait diverger le moteur
                    // et l'interface sans que rien ne le signale.
                    send(&format!("info string {e} — position ignorée"));
                    return;
                }
            }
        }

        self.position = position;
    }

    /// `go [wtime .. btime .. winc .. binc .. movestogo .. movetime .. depth ..
    /// nodes .. infinite]`, ou `go perft <n>`.
    fn go<'a>(&mut self, mut tokens: impl Iterator<Item = &'a str>) {
        self.abort_search();

        let (limits, perft_depth) = parse_go(&mut tokens);

        if let Some(depth) = perft_depth {
            self.run_perft(depth);
            return;
        }

        self.stop.store(false, Ordering::Relaxed);
        let position = self.position.clone();
        let mut search = self
            .search
            .take()
            .unwrap_or_else(|| Search::new(Arc::clone(&self.stop)));

        self.worker = Some(thread::spawn(move || {
            let best = search.go(&position, &limits, |info| {
                let score = match info.score {
                    Score::Cp(cp) => format!("cp {cp}"),
                    Score::Mate(moves) => format!("mate {moves}"),
                };
                // `checked_div` porte lui-même la garde contre la division par
                // zéro : une recherche trop rapide pour l'horloge n'annonce
                // simplement pas de débit.
                let nps = info
                    .nodes
                    .saturating_mul(1_000)
                    .checked_div(info.time_ms)
                    .map_or(String::new(), |nps| format!(" nps {nps}"));
                send(&format!(
                    "info depth {} score {score} nodes {} time {}{nps} hashfull {} pv {}",
                    info.depth,
                    info.nodes,
                    info.time_ms,
                    info.hashfull,
                    pv_to_uci(position.board(), &info.pv)
                ));
            });

            match best {
                Some(mv) => send(&format!(
                    "bestmove {}",
                    display_uci_move(position.board(), mv)
                )),
                // Aucun coup légal : mat ou pat. L'interface attend tout de même
                // une réponse, et `0000` est le coup nul conventionnel.
                None => send("bestmove 0000"),
            }
            search
        }));
    }

    /// `go perft <n>` — perft ventilé, exécuté sur le fil courant.
    fn run_perft(&self, depth: u32) {
        let board = self.position.board();
        let mut total = 0;
        for (mv, nodes) in perft::divide(board, depth) {
            total += nodes;
            send(&format!("{}: {nodes}", display_uci_move(board, mv)));
        }
        send("");
        send(&format!("Nodes searched: {total}"));
    }

    /// Demande l'arrêt de la recherche en cours et attend sa terminaison.
    ///
    /// Récupère au passage l'objet `Search` que le fil rend en se terminant.
    /// Si le fil a paniqué, la recherche est recréée au prochain `go` : on perd
    /// la table, jamais la session.
    fn abort_search(&mut self) {
        self.abort_search_keeping(|_| {});
    }

    /// Comme [`Engine::abort_search`], en appliquant `f` à la recherche
    /// récupérée. Sert aux réglages qui ne peuvent s'appliquer qu'entre deux
    /// recherches.
    fn abort_search_keeping(&mut self, f: impl FnOnce(&mut Search)) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(worker) = self.worker.take() {
            self.search = worker.join().ok();
        }
        self.stop.store(false, Ordering::Relaxed);
        if let Some(search) = self.search.as_mut() {
            f(search);
        }
    }
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]
mod tests {
    use super::*;

    fn go(ligne: &str) -> (Limits, Option<u32>) {
        parse_go(&mut ligne.split_whitespace())
    }

    #[test]
    fn seul_quit_termine_la_boucle() {
        // `handle` rend `false` pour arrêter la boucle. Supprimer le bras
        // `quit` passait inaperçu : le pilote de test ferme stdin juste après,
        // donc la boucle s'arrêtait de toute façon.
        let mut moteur = Engine::new();
        assert!(moteur.handle("uci"), "uci poursuit la session");
        assert!(moteur.handle("isready"), "isready poursuit");
        assert!(moteur.handle("commande inconnue"), "une inconnue poursuit");
        assert!(moteur.handle(""), "une ligne vide poursuit");
        assert!(!moteur.handle("quit"), "quit et lui seul termine");
    }

    #[test]
    fn stop_leve_le_drapeau_darret() {
        // Même angle mort : le pilote envoie `quit` après chaque script, ce qui
        // arrête aussi la recherche. Le drapeau se regarde donc directement.
        let mut moteur = Engine::new();
        assert!(moteur.handle("position startpos"));
        assert!(moteur.handle("go infinite"));
        assert!(
            !moteur.stop.load(Ordering::Relaxed),
            "`go` remet le drapeau à zéro"
        );
        assert!(moteur.handle("stop"));
        assert!(
            moteur.stop.load(Ordering::Relaxed),
            "`stop` doit lever le drapeau, sans quoi `go infinite` ne finit jamais"
        );
    }

    #[test]
    fn setoption_rejoint_le_fil_de_recherche_et_agit() {
        // `setoption` passe par `abort_search_keeping`, qui rejoint le fil
        // ouvrier et range l'objet `Search`. C'est observable, là où le
        // redimensionnement de la table ne l'est pas.
        //
        // Deux mutants survivaient ici : la suppression du bras `setoption`,
        // et le remplacement du corps de `set_option` par `()`. Les deux
        // laissent le fil ouvrier en place, donc cette seule assertion les
        // attrape tous les deux.
        let mut moteur = Engine::new();
        assert!(moteur.handle("position startpos"));
        assert!(moteur.handle("go depth 4"));
        assert!(moteur.worker.is_some(), "une recherche est en cours");

        assert!(moteur.handle("setoption name Hash value 1"));
        assert!(
            moteur.worker.is_none(),
            "setoption doit rejoindre le fil ouvrier"
        );
        assert!(
            moteur.search.is_some(),
            "et conserver l'objet Search pour lui appliquer l'option"
        );
    }

    #[test]
    fn chaque_parametre_de_go_est_lu() {
        // Un test de mutation a montré le 15 sept. 2026 que les NEUF bras de
        // ce match pouvaient être supprimés un par un sans qu'un seul test
        // bronche. Chaque assertion ci-dessous en garde un.
        let (l, perft) =
            go("wtime 1 btime 2 winc 3 binc 4 movestogo 5 movetime 6 depth 7 nodes 8 infinite");
        assert_eq!(l.wtime, Some(1), "wtime");
        assert_eq!(l.btime, Some(2), "btime");
        assert_eq!(l.winc, Some(3), "winc");
        assert_eq!(l.binc, Some(4), "binc");
        assert_eq!(l.movestogo, Some(5), "movestogo");
        assert_eq!(l.movetime, Some(6), "movetime");
        assert_eq!(l.depth, Some(7), "depth");
        assert_eq!(l.nodes, Some(8), "nodes");
        assert!(l.infinite, "infinite");
        assert_eq!(perft, None);
    }

    #[test]
    fn un_go_nu_ne_contraint_rien() {
        // Le pendant du test précédent : sans lui, une analyse qui remplirait
        // tous les champs quoi qu'il arrive passerait.
        assert_eq!(go(""), (Limits::default(), None));
        assert_eq!(go("ponder"), (Limits::default(), None));
    }

    #[test]
    fn go_perft_se_distingue_dune_recherche() {
        let (l, perft) = go("perft 4");
        assert_eq!(perft, Some(4));
        assert_eq!(l, Limits::default(), "perft n'impose aucune contrainte");
    }

    #[test]
    fn un_parametre_mal_forme_est_ignore_sans_casser_les_autres() {
        // « depth abc » doit donner une recherche, pas un silence.
        let (l, _) = go("depth abc movetime 50");
        assert_eq!(l.depth, None);
        assert_eq!(l.movetime, Some(50), "le paramètre suivant reste lu");
    }

    #[test]
    fn un_jeton_inconnu_nest_pas_pris_pour_une_valeur() {
        // `searchmoves e2e4` n'est pas géré : le moteur doit ignorer le jeton
        // sans avaler la suite.
        let (l, _) = go("searchmoves e2e4 depth 3");
        assert_eq!(l.depth, Some(3));
    }

    #[test]
    fn le_nom_et_la_valeur_dune_option_sont_extraits() {
        let mots: Vec<&str> = "name Hash value 64".split_whitespace().collect();
        assert_eq!(parse_option(&mots), Some(("Hash".to_owned(), Some("64"))));
    }

    #[test]
    fn un_nom_doption_en_plusieurs_mots_est_recolle() {
        // Le protocole autorise les noms à espaces ; les recoller est
        // exactement ce que l'arithmétique d'indices de `parse_option` fait,
        // et trois de ses mutations survivaient sans ce test.
        let mots: Vec<&str> = "name Move Overhead value 30".split_whitespace().collect();
        assert_eq!(
            parse_option(&mots),
            Some(("Move Overhead".to_owned(), Some("30")))
        );
    }

    #[test]
    fn une_option_sans_valeur_rend_un_nom_sans_valeur() {
        let mots: Vec<&str> = "name Ponder".split_whitespace().collect();
        assert_eq!(parse_option(&mots), Some(("Ponder".to_owned(), None)));
    }

    #[test]
    fn une_option_sans_mot_cle_name_est_refusee() {
        // C'est ce qui distingue `==` de `!=` dans la recherche du mot-clé.
        let mots: Vec<&str> = "Hash value 64".split_whitespace().collect();
        assert_eq!(parse_option(&mots), None);
    }

    #[test]
    fn la_variante_est_convertie_coup_par_coup() {
        // `pv_to_uci` pouvait rendre la chaîne vide, ou « xyzzy », sans qu'un
        // test bronche : l'interface aurait affiché une variante muette.
        let plateau = cozy_chess::Board::default();
        let coups: Vec<cozy_chess::Move> = ["e2e4", "e7e5", "g1f3"]
            .iter()
            .scan(plateau.clone(), |b, uci| {
                let mv = cozy_chess::util::parse_uci_move(b, uci).unwrap();
                b.play_unchecked(mv);
                Some(mv)
            })
            .collect();
        assert_eq!(pv_to_uci(&plateau, &coups), "e2e4 e7e5 g1f3");
        assert_eq!(pv_to_uci(&plateau, &[]), "", "une variante vide reste vide");
    }

    #[test]
    fn la_variante_se_coupe_au_premier_coup_illegal() {
        // La garde de légalité : sans elle, un coup incohérent glissé par la
        // table produirait du charabia au lieu d'une variante tronquée.
        let plateau = cozy_chess::Board::default();
        let legal = cozy_chess::util::parse_uci_move(&plateau, "e2e4").unwrap();

        // Après e2e4 le trait est aux NOIRS, donc tout coup blanc y est
        // illégal — e4e5 par exemple. Vérifié par exécution : ma première
        // version prenait d7d5, qui est au contraire parfaitement légal là.
        let mut apres = plateau.clone();
        apres.play_unchecked(legal);
        let illegal = cozy_chess::Move {
            from: cozy_chess::Square::E4,
            to: cozy_chess::Square::E5,
            promotion: None,
        };
        assert!(
            !apres.is_legal(illegal),
            "le coup doit être illégal APRÈS e2e4, pas avant"
        );
        assert_eq!(pv_to_uci(&plateau, &[legal, illegal]), "e2e4");
    }

    #[test]
    fn le_roque_est_rendu_en_notation_uci_et_non_roi_prend_tour() {
        // L'invariant le plus coûteux du projet : cozy-chess encode le roque
        // e1h1, UCI attend e1g1.
        let plateau: cozy_chess::Board = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1"
            .parse()
            .unwrap();
        let roque = cozy_chess::util::parse_uci_move(&plateau, "e1g1").unwrap();
        assert_eq!(roque.to, cozy_chess::Square::H1, "encodage interne");
        assert_eq!(pv_to_uci(&plateau, &[roque]), "e1g1", "sortie UCI");
    }
}
