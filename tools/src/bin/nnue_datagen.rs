//! Génère les données d'entraînement du réseau NNUE (B4, chantier A21).
//!
//! Des parties d'auto-jeu, chaque coup cherché à un budget fixe de nœuds, et
//! chaque position enregistrée avec le score de la recherche et le résultat de
//! la partie — les deux étiquettes que l'entraîneur mélange.
//!
//! # Le format : `viriformat`, écrit par sa crate de référence
//!
//! Lu au source le 25 sept. 2026 : la documentation de l'entraîneur (bullet,
//! commit `10e7e82`, `docs/3-data.md`) recommande de stocker les données dans
//! un format « binpack », et nomme celui de Viridithas comme le plus employé
//! par ceux qui génèrent les leurs. Une partie y tient en 32 octets d'en-tête
//! plus 4 octets par coup, contre 32 octets par position pour le format direct
//! de bullet : pour les centaines de millions de positions qu'il faudra
//! transférer des runners vers la machine d'entraînement, le facteur compte.
//! Et une partie ENTIÈRE se refiltre au chargement sans être regénérée — le
//! filtre (positions en échec, coups tactiques, début de partie) se choisit à
//! l'entraînement, jamais ici.
//!
//! **Le format est écrit par la crate `viriformat` elle-même, jamais
//! réimplémenté** : c'est la bibliothèque que bullet emploie pour le lire.
//! Deux conventions y sont faciles à rater, et des tests les gardent :
//! - le score est **du point de vue des Blancs** — `bulletformat` le retourne
//!   lui-même vers le camp au trait (`ChessBoard::from_raw`), alors que la
//!   recherche rend le point de vue du camp au trait ;
//! - le roque est noté **roi-prend-tour**, comme dans `cozy-chess`, mais la
//!   prise en passant et le roque portent un drapeau que les deux cases seules
//!   ne donnent pas.
//!
//! # Déterminisme
//!
//! Chaque partie est une fonction pure de (graine, numéro, budget de nœuds) :
//! ouverture tirée par un générateur seedé, table vidée au début de chaque
//! partie, un seul fil par recherche. Le nombre de fils de génération ne
//! change que l'ordre d'écriture, jamais une partie.
//!
//! # Usage
//!
//! ```text
//! nnue-datagen --out DOSSIER [--threads 4] [--nodes 5000] [--seed 1]
//!              [--games N] [--minutes M]
//! ```
//!
//! S'arrête au premier des deux : `N` parties entamées, ou `M` minutes
//! écoulées — aucune partie n'est entamée après l'échéance, celles en cours
//! finissent. Un fichier `nnue-<graine>-<fil>.vf` par fil.
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use cozy_chess::{Board, Color, Move, Piece};
use shallowred::eval::is_insufficient_material;
use shallowred::position::Position;
use shallowred::search::{Limits, Score, Search};
use viriformat::chess::board::{Board as VfBoard, DrawType, GameOutcome, WinType};
use viriformat::chess::chessmove::{Move as VfMove, MoveFlags};
use viriformat::chess::piece::PieceType;
use viriformat::chess::types::Square as VfSquare;
use viriformat::dataformat::{Filter, Game, WDL};

/// Budget de nœuds par coup, par défaut. **Choix non mesuré** : c'est l'ordre
/// de grandeur courant des générateurs de moteurs amateurs, et la bonne valeur
/// ne se mesure qu'en entraînant plusieurs réseaux. À rouvrir par la mesure.
const DEFAULT_NODES: u64 = 5_000;

/// Demi-coups tirés au hasard avant d'enregistrer : 8 à 11. Même choix que le
/// corpus Texel (`datagen.rs`) — assez pour diversifier, assez peu pour que la
/// position reste jouable. Sans ce tirage, le moteur étant déterministe, toutes
/// les parties seraient la même.
const OPENING_MIN_PLIES: u32 = 8;
const OPENING_EXTRA_PLIES: u64 = 4;

/// Au-delà de ce score dès la première position, l'ouverture tirée au hasard a
/// déjà donné une pièce : la partie est écartée, elle n'apprendrait qu'un
/// déséquilibre fabriqué par le tirage.
const OPENING_MAX_SCORE: i32 = 1_000;

/// Adjudication de gain : un camp à 2 000 centièmes ou plus pendant huit
/// demi-coups consécutifs est déclaré vainqueur. Prudente exprès — une
/// adjudication fausse corrompt l'étiquette de résultat de toute la partie.
/// Pas d'adjudication de nulle : la part des positions qu'elle économiserait se
/// MESURE sur les données avant de se décider.
const WIN_ADJ_SCORE: i32 = 2_000;
const WIN_ADJ_PLIES: u32 = 8;

/// Au-delà, la partie est déclarée nulle. La règle des cinquante coups arrête
/// presque toujours avant.
const MAX_GAME_PLIES: u32 = 400;

/// Un mat annoncé, dans le format : au-dessus de tout score en centièmes, et au
///-dessus du `max_eval` par défaut du filtre de `viriformat` (31 339), qui
/// l'écarte donc à l'entraînement. Les centièmes sont bornés en dessous.
const MATE_SCORE: i16 = 32_000;
const CP_LIMIT: i32 = 31_000;

/// xorshift64*, déterministe : même graine, même données.
fn next_random(state: &mut u64) -> u64 {
    let mut x = *state;
    x ^= x >> 12;
    x ^= x << 25;
    x ^= x >> 27;
    *state = x;
    x.wrapping_mul(0x2545_F491_4F6C_DD1D)
}

/// La graine de la partie `index` : splitmix64 de la graine et du numéro, pour
/// que deux numéros voisins ne donnent pas deux suites voisines. Forcée impaire
/// parce que **zéro est un point fixe de xorshift64** (même raison que
/// `random_seed` dans le moteur).
fn game_seed(seed: u64, index: u64) -> u64 {
    let mut z = seed.wrapping_add(index.wrapping_mul(0x9E37_79B9_7F4A_7C15));
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    (z ^ (z >> 31)) | 1
}

fn legal_moves(board: &Board) -> Vec<Move> {
    let mut moves = Vec::new();
    board.generate_moves(|set| {
        moves.extend(set);
        false
    });
    moves
}

/// Joue `plies` coups au hasard depuis la position initiale.
fn random_opening(plies: u32, state: &mut u64) -> Option<Board> {
    let mut board = Board::default();
    for _ in 0..plies {
        let moves = legal_moves(&board);
        if moves.is_empty() {
            return None;
        }
        let index = (next_random(state) % moves.len() as u64) as usize;
        board.play_unchecked(*moves.get(index)?);
    }
    (!legal_moves(&board).is_empty()).then_some(board)
}

/// Le score de la recherche, ramené au point de vue des Blancs et à l'échelle
/// du format. La recherche le rend du point de vue du camp au trait.
///
/// `None` pour un « mat en zéro coup », qui n'a pas de signe : c'est ce que
/// rendait un score de mat sorti de ±MATE avant le correctif C27, et
/// l'écrire avec un signe deviné corromprait l'étiquette.
fn white_relative(score: Score, side_to_move: Color) -> Option<i16> {
    let stm = match score {
        Score::Cp(cp) => cp.clamp(-CP_LIMIT, CP_LIMIT) as i16,
        Score::Mate(moves) if moves > 0 => MATE_SCORE,
        Score::Mate(moves) if moves < 0 => -MATE_SCORE,
        Score::Mate(_) => return None,
    };
    Some(if side_to_move == Color::White {
        stm
    } else {
        -stm
    })
}

/// Le coup de `cozy-chess`, dans l'encodage de `viriformat`.
///
/// Les deux notent le roque roi-prend-tour et numérotent les cases de a1 = 0 à
/// h8 = 63 ; ce qui diffère, ce sont les DRAPEAUX, que `cozy-chess` ne porte
/// pas : ils se déduisent de la position avant le coup. Un roque est un roi
/// qui arrive sur une case occupée par son propre camp ; une prise en passant,
/// un pion qui change de colonne vers une case vide.
fn vf_move(board: &Board, mv: Move) -> Option<VfMove> {
    let from = VfSquare::new(mv.from as u8)?;
    let to = VfSquare::new(mv.to as u8)?;
    if from == to {
        return None;
    }
    if let Some(piece) = mv.promotion {
        let kind = match piece {
            Piece::Knight => PieceType::Knight,
            Piece::Bishop => PieceType::Bishop,
            Piece::Rook => PieceType::Rook,
            Piece::Queen => PieceType::Queen,
            Piece::Pawn | Piece::King => return None,
        };
        return Some(VfMove::new_with_promo(from, to, kind));
    }
    let moved = board.piece_on(mv.from)?;
    if moved == Piece::King && board.colors(board.side_to_move()).has(mv.to) {
        return Some(VfMove::new_with_flags(from, to, MoveFlags::Castle));
    }
    if moved == Piece::Pawn && mv.from.file() != mv.to.file() && board.piece_on(mv.to).is_none() {
        return Some(VfMove::new_with_flags(from, to, MoveFlags::EnPassant));
    }
    Some(VfMove::new(from, to))
}

/// Le plateau de `viriformat` pour une FEN. Son `from_fen` n'existe qu'en test ;
/// l'API publique passe par `set_from_fen`.
fn vf_board(fen: &str) -> Result<VfBoard, String> {
    let mut board = VfBoard::new();
    board
        .set_from_fen(fen)
        .map_err(|error| format!("FEN illisible par viriformat ({fen}) : {error}"))?;
    Ok(board)
}

/// La fin de partie que les RÈGLES imposent à cette position, s'il y en a une.
///
/// L'ordre compte : un mat donné au cinquantième coup reste un mat, donc
/// l'absence de coup légal passe avant la règle des cinquante coups.
fn rule_outcome(position: &Position) -> Option<GameOutcome> {
    let board = position.board();
    if legal_moves(board).is_empty() {
        return Some(if board.checkers().is_empty() {
            GameOutcome::Draw(DrawType::Stalemate)
        } else if board.side_to_move() == Color::White {
            GameOutcome::BlackWin(WinType::Mate)
        } else {
            GameOutcome::WhiteWin(WinType::Mate)
        });
    }
    // Trois occurrences : la courante et deux antérieures. La recherche, elle,
    // traite une seule répétition comme nulle ; la partie suit la règle.
    if position.repetition_count() >= 2 {
        return Some(GameOutcome::Draw(DrawType::Repetition));
    }
    if position.is_fifty_move_draw() {
        return Some(GameOutcome::Draw(DrawType::FiftyMoves));
    }
    if is_insufficient_material(board) {
        return Some(GameOutcome::Draw(DrawType::InsufficientMaterial));
    }
    None
}

/// Joue une partie depuis `opening` et l'enregistre.
///
/// `opening_limit` : au-delà de ce score à la première position, la partie est
/// écartée — c'est le filtre des ouvertures tirées au hasard, que les tests
/// partant d'une position gagnante choisie exprès doivent pouvoir lever.
///
/// `Ok(None)` : la partie est écartée — ouverture déséquilibrée, ou recherche
/// sans score. `Err` : le code ment (un coup que le format ne sait pas
/// écrire), et la génération entière doit s'arrêter plutôt que de produire des
/// données fausses en silence.
fn play_game(
    opening: Board,
    nodes: u64,
    opening_limit: Option<i32>,
    search: &mut Search,
) -> Result<Option<Game>, String> {
    search.clear_table();
    let limits = Limits {
        nodes: Some(nodes),
        ..Limits::default()
    };
    let start = vf_board(&opening.to_string())?;
    let mut record = Game::new(&start);
    let mut position = Position::from_board(opening);
    let (mut leader, mut streak) = (Color::White, 0u32);

    for ply in 0..MAX_GAME_PLIES {
        if let Some(outcome) = rule_outcome(&position) {
            record.set_outcome(outcome);
            return Ok((!record.is_empty()).then_some(record));
        }
        let board = position.board().clone();
        let mut score = None;
        let Some(mv) = search.go(&position, &limits, |info| score = Some(info.score)) else {
            return Err(format!(
                "aucun coup rendu dans une position jouable : {board}"
            ));
        };
        let Some(white) = score.and_then(|score| white_relative(score, board.side_to_move()))
        else {
            return Ok(None);
        };
        if ply == 0 && opening_limit.is_some_and(|limit| i32::from(white).abs() > limit) {
            return Ok(None);
        }
        let encoded =
            vf_move(&board, mv).ok_or_else(|| format!("coup {mv} intraduisible dans {board}"))?;
        record.add_move(encoded, white);

        if i32::from(white).abs() >= WIN_ADJ_SCORE {
            let side = if white > 0 {
                Color::White
            } else {
                Color::Black
            };
            streak = if side == leader { streak + 1 } else { 1 };
            leader = side;
            if streak >= WIN_ADJ_PLIES {
                record.set_outcome(if leader == Color::White {
                    GameOutcome::WhiteWin(WinType::Adjudication)
                } else {
                    GameOutcome::BlackWin(WinType::Adjudication)
                });
                return Ok(Some(record));
            }
        } else {
            streak = 0;
        }
        position.play(mv);
    }
    record.set_outcome(GameOutcome::Draw(DrawType::Adjudication));
    Ok(Some(record))
}

/// La partie numéro `index` d'une génération de graine `seed`.
fn play_indexed_game(
    seed: u64,
    index: u64,
    nodes: u64,
    search: &mut Search,
) -> Result<Option<Game>, String> {
    let mut state = game_seed(seed, index);
    let plies = OPENING_MIN_PLIES + (next_random(&mut state) % OPENING_EXTRA_PLIES) as u32;
    match random_opening(plies, &mut state) {
        Some(opening) => play_game(opening, nodes, Some(OPENING_MAX_SCORE), search),
        None => Ok(None),
    }
}

/// Ce qu'une génération a produit — de quoi juger les données avant de les
/// entraîner.
#[derive(Default, Clone, Copy)]
struct Stats {
    games: u64,
    discarded: u64,
    positions: u64,
    /// Positions que le filtre PAR DÉFAUT de `viriformat` garderait : hors
    /// échec, hors coup tactique, après le seizième demi-coup enregistré.
    kept_by_default_filter: u64,
    white_wins: u64,
    black_wins: u64,
    draws: u64,
}

impl Stats {
    fn record(&mut self, game: &Game) {
        self.games += 1;
        self.positions += game.len() as u64;
        self.kept_by_default_filter += game.filter_pass_count(&Filter::default());
        match game.outcome() {
            WDL::Win => self.white_wins += 1,
            WDL::Loss => self.black_wins += 1,
            WDL::Draw => self.draws += 1,
        }
    }

    fn merge(&mut self, other: &Self) {
        self.games += other.games;
        self.discarded += other.discarded;
        self.positions += other.positions;
        self.kept_by_default_filter += other.kept_by_default_filter;
        self.white_wins += other.white_wins;
        self.black_wins += other.black_wins;
        self.draws += other.draws;
    }
}

struct Config {
    out: PathBuf,
    threads: usize,
    nodes: u64,
    seed: u64,
    games: u64,
    minutes: Option<u64>,
}

/// Un fil de génération : réclame des numéros de partie jusqu'à l'échéance,
/// écrit chaque partie dès qu'elle est finie.
fn worker(
    thread: usize,
    config: &Config,
    next: &AtomicU64,
    deadline: Option<Instant>,
) -> Result<Stats, String> {
    let path = config.out.join(format!("nnue-{}-{thread}.vf", config.seed));
    let file = File::create(&path).map_err(|error| format!("{}: {error}", path.display()))?;
    let mut writer = BufWriter::new(file);
    let mut search = Search::new(Arc::new(AtomicBool::new(false)));
    let mut stats = Stats::default();
    loop {
        if deadline.is_some_and(|deadline| Instant::now() >= deadline) {
            break;
        }
        let index = next.fetch_add(1, Ordering::Relaxed);
        if index >= config.games {
            break;
        }
        match play_indexed_game(config.seed, index, config.nodes, &mut search)? {
            Some(game) => {
                stats.record(&game);
                game.serialise_into(&mut writer)
                    .map_err(|error| format!("{}: {error}", path.display()))?;
            }
            None => stats.discarded += 1,
        }
    }
    writer
        .flush()
        .map_err(|error| format!("{}: {error}", path.display()))?;
    Ok(stats)
}

fn parse_args(args: &[String]) -> Result<Config, String> {
    let mut config = Config {
        out: PathBuf::new(),
        threads: 1,
        nodes: DEFAULT_NODES,
        seed: 1,
        games: u64::MAX,
        minutes: None,
    };
    let mut iter = args.iter();
    while let Some(flag) = iter.next() {
        let value = iter
            .next()
            .ok_or_else(|| format!("{flag} attend une valeur"))?;
        let number = || {
            value
                .parse::<u64>()
                .map_err(|_| format!("{flag} : « {value} » n'est pas un entier"))
        };
        match flag.as_str() {
            "--out" => config.out = PathBuf::from(value),
            "--threads" => {
                config.threads = usize::try_from(number()?).map_err(|e| e.to_string())?
            }
            "--nodes" => config.nodes = number()?,
            "--seed" => config.seed = number()?,
            "--games" => config.games = number()?,
            "--minutes" => config.minutes = Some(number()?),
            _ => return Err(format!("option inconnue : {flag}")),
        }
    }
    if config.out.as_os_str().is_empty() {
        return Err("--out est obligatoire".to_string());
    }
    if config.threads == 0 || config.nodes == 0 {
        return Err("--threads et --nodes doivent être positifs".to_string());
    }
    if config.games == u64::MAX && config.minutes.is_none() {
        return Err("il faut --games ou --minutes : sans l'un d'eux, rien ne s'arrête".to_string());
    }
    Ok(config)
}

fn run(config: &Config) -> Result<(Stats, Duration), String> {
    std::fs::create_dir_all(&config.out)
        .map_err(|error| format!("{}: {error}", Path::display(&config.out)))?;
    let started = Instant::now();
    let deadline = config
        .minutes
        .map(|minutes| started + Duration::from_secs(minutes * 60));
    let next = AtomicU64::new(0);
    let results: Vec<Result<Stats, String>> = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..config.threads)
            .map(|thread| {
                let next = &next;
                scope.spawn(move || worker(thread, config, next, deadline))
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .unwrap_or_else(|_| Err("un fil de génération a paniqué".to_string()))
            })
            .collect()
    });
    let mut total = Stats::default();
    for result in results {
        total.merge(&result?);
    }
    Ok((total, started.elapsed()))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let config = match parse_args(&args) {
        Ok(config) => config,
        Err(message) => {
            eprintln!("{message}");
            eprintln!(
                "usage : nnue-datagen --out DOSSIER [--threads 1] [--nodes {DEFAULT_NODES}] \
                 [--seed 1] [--games N] [--minutes M]"
            );
            std::process::exit(2);
        }
    };
    match run(&config) {
        Ok((stats, elapsed)) => {
            let seconds = elapsed.as_secs_f64();
            // Une clé par ligne : le workflow les recopie telles quelles dans
            // son résumé, et un lecteur les compare d'un run à l'autre.
            println!("graine={}", config.seed);
            println!("noeuds_par_coup={}", config.nodes);
            println!("fils={}", config.threads);
            println!("parties={}", stats.games);
            println!("ecartees={}", stats.discarded);
            println!("positions={}", stats.positions);
            println!("retenues_filtre_defaut={}", stats.kept_by_default_filter);
            println!("gains_blancs={}", stats.white_wins);
            println!("gains_noirs={}", stats.black_wins);
            println!("nulles={}", stats.draws);
            println!("secondes={seconds:.1}");
            println!(
                "positions_par_seconde={:.0}",
                stats.positions as f64 / seconds.max(f64::EPSILON)
            );
        }
        Err(message) => {
            eprintln!("génération interrompue : {message}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "les tests doivent échouer bruyamment")]
mod tests {
    use super::*;
    use shallowred::nnue::feature;

    fn search() -> Search {
        Search::new(Arc::new(AtomicBool::new(false)))
    }

    fn board(fen: &str) -> Board {
        fen.parse().unwrap()
    }

    /// Le piège classique : la recherche rend le point de vue du camp au trait,
    /// le format attend celui des Blancs. Témoin : renvoyer le score tel quel
    /// fait tomber les deux assertions sur les Noirs.
    #[test]
    fn le_score_est_ecrit_du_point_de_vue_des_blancs() {
        assert_eq!(white_relative(Score::Cp(150), Color::White), Some(150));
        assert_eq!(white_relative(Score::Cp(150), Color::Black), Some(-150));
        assert_eq!(
            white_relative(Score::Mate(3), Color::Black),
            Some(-MATE_SCORE)
        );
        assert_eq!(
            white_relative(Score::Mate(-2), Color::White),
            Some(-MATE_SCORE)
        );
        assert_eq!(
            white_relative(Score::Mate(1), Color::White),
            Some(MATE_SCORE)
        );
        // Un score en centièmes ne se confond jamais avec un mat.
        assert_eq!(
            white_relative(Score::Cp(99_999), Color::White),
            Some(31_000)
        );
        // Un mat sans signe ne s'écrit pas.
        assert_eq!(white_relative(Score::Mate(0), Color::White), None);
    }

    /// De bout en bout, dans une vraie partie : les Noirs, au trait, ont une
    /// dame et une tour de plus. Le premier score écrit doit être NÉGATIF, et
    /// la partie gagnée par les Noirs — par mat ou par adjudication.
    #[test]
    fn une_partie_noire_gagnante_s_ecrit_en_negatif() {
        let opening = board("4k3/8/8/3q4/8/8/7r/4K3 b - - 0 1");
        let game = play_game(opening, 2_000, None, &mut search())
            .unwrap()
            .unwrap();
        let mut first = None;
        game.visit_positions(|_, eval| {
            first.get_or_insert(eval);
        });
        let first = first.unwrap();
        assert!(first < -OPENING_MAX_SCORE / 2, "score écrit : {first}");
        assert_eq!(game.outcome(), WDL::Loss, "les Noirs gagnent");
    }

    /// Le résultat suit le camp qui mate, dans les deux sens.
    #[test]
    fn le_mat_est_etiquete_pour_le_bon_camp() {
        // Mat du couloir en un, Dd8# pour les Blancs, Dd1# pour les Noirs :
        // un seul coup écrit, et la partie finit par la règle, pas par
        // l'adjudication.
        let white_mates = board("6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1");
        let game = play_game(white_mates, 5_000, None, &mut search())
            .unwrap()
            .unwrap();
        assert_eq!((game.len(), game.outcome()), (1, WDL::Win));
        let black_mates = board("3q2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1");
        let game = play_game(black_mates, 5_000, None, &mut search())
            .unwrap()
            .unwrap();
        assert_eq!((game.len(), game.outcome()), (1, WDL::Loss));
    }

    #[test]
    fn les_regles_arretent_la_partie() {
        let stalemate = Position::from_board(board("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"));
        assert_eq!(
            rule_outcome(&stalemate),
            Some(GameOutcome::Draw(DrawType::Stalemate))
        );
        let bare_kings = Position::from_board(board("8/8/4k3/8/8/3K4/8/8 w - - 0 1"));
        assert_eq!(
            rule_outcome(&bare_kings),
            Some(GameOutcome::Draw(DrawType::InsufficientMaterial))
        );
        let fifty = Position::from_board(board("4k3/8/8/8/8/8/4P3/4K3 w - - 100 80"));
        assert_eq!(
            rule_outcome(&fifty),
            Some(GameOutcome::Draw(DrawType::FiftyMoves))
        );
        let mated = Position::from_board(board("R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1"));
        assert_eq!(
            rule_outcome(&mated),
            Some(GameOutcome::WhiteWin(WinType::Mate))
        );
        assert_eq!(rule_outcome(&Position::startpos()), None);
    }

    /// Trois occurrences, pas deux : c'est la règle de partie.
    #[test]
    fn la_repetition_de_partie_demande_trois_occurrences() {
        let mut position = Position::startpos();
        for (round, expected) in [
            (1, None),
            (2, Some(GameOutcome::Draw(DrawType::Repetition))),
        ] {
            for token in ["g1f3", "g8f6", "f3g1", "f6g8"] {
                position.play_uci(token).unwrap();
            }
            assert_eq!(rule_outcome(&position), expected, "tour {round}");
        }
    }

    /// L'ORACLE : chaque coup traduit doit être un coup légal pour le
    /// générateur de `viriformat`, et les deux plateaux doivent rester
    /// identiques. Des parties au hasard parcourent roques, prises en passant
    /// et promotions ; on COMPTE chaque sorte plutôt que de les supposer.
    #[test]
    fn les_coups_speciaux_passent_l_oracle_viriformat() {
        let (mut castles, mut en_passant, mut promotions, mut under) = (0, 0, 0, 0);
        let mut state = 0x5EED_u64 | 1;
        for _ in 0..300 {
            let mut ours = Board::default();
            let mut theirs = vf_board(&ours.to_string()).unwrap();
            for _ in 0..300 {
                let moves = legal_moves(&ours);
                // La partie s'arrête à la règle des cinquante coups, comme
                // dans le générateur : `viriformat` refuse d'aller au-delà.
                if moves.is_empty() || ours.halfmove_clock() >= 100 {
                    break;
                }
                let mv = moves[(next_random(&mut state) % moves.len() as u64) as usize];
                let encoded = vf_move(&ours, mv).unwrap();
                assert!(
                    theirs.legal_moves().contains(&encoded),
                    "{mv} traduit en {encoded:?}, illégal pour viriformat dans {ours}"
                );
                castles += usize::from(encoded.is_castle());
                en_passant += usize::from(encoded.is_ep());
                promotions += usize::from(encoded.is_promo());
                under += usize::from(mv.promotion.is_some_and(|piece| piece != Piece::Queen));
                ours.play_unchecked(mv);
                assert!(theirs.make_move_simple(encoded));
                let placement = |fen: String| fen.split(' ').take(2).collect::<Vec<_>>().join(" ");
                assert_eq!(placement(theirs.to_string()), placement(ours.to_string()));
            }
        }
        assert!(
            castles > 0 && en_passant > 0 && promotions > 0 && under > 0,
            "roques {castles}, en passant {en_passant}, promotions {promotions}, sous-promotions {under}"
        );
    }

    /// Les entrées que le moteur calcule sont celles sur lesquelles bullet
    /// entraîne. La même position passe par la chaîne de l'entraîneur —
    /// `Board::to_bulletformat` de `viriformat`, qui retourne l'échiquier
    /// quand les Noirs ont le trait, puis l'itération de
    /// `bulletformat::ChessBoard` —, et seule la formule de `Chess768`, cinq
    /// lignes, est recopiée de son source (bullet `10e7e82`,
    /// `game/inputs/chess768.rs`). C'est le seul test qui confronte le moteur
    /// au CODE de l'entraîneur plutôt qu'à une lecture de ce code : une case
    /// retournée d'un seul côté ne fait rien planter, elle entraîne un réseau
    /// sur d'autres positions que celles qu'il évaluera.
    #[test]
    fn les_entrees_du_moteur_sont_celles_de_l_entraineur() {
        let (mut checked, mut black) = (0, 0);
        let mut state = 0x00B0_11E7_u64 | 1;
        for _ in 0..40 {
            let mut ours = Board::default();
            for _ in 0..120 {
                let moves = legal_moves(&ours);
                if moves.is_empty() || ours.halfmove_clock() >= 100 {
                    break;
                }
                let theirs = vf_board(&ours.to_string()).unwrap();
                let mut trainer: Vec<(usize, usize)> = theirs
                    .to_bulletformat(1, 0)
                    .unwrap()
                    .into_iter()
                    .map(|(piece, square)| {
                        let c = usize::from(piece & 8 > 0);
                        let pc = 64 * usize::from(piece & 7);
                        let sq = usize::from(square);
                        ([0, 384][c] + pc + sq, [384, 0][c] + pc + (sq ^ 56))
                    })
                    .collect();
                trainer.sort_unstable();

                let us = ours.side_to_move();
                let mut engine = Vec::new();
                for color in Color::ALL {
                    for piece in Piece::ALL {
                        for square in ours.colored_pieces(color, piece) {
                            engine.push((
                                feature(us, color, piece, square),
                                feature(!us, color, piece, square),
                            ));
                        }
                    }
                }
                engine.sort_unstable();
                assert_eq!(engine, trainer, "sur {ours}");
                checked += 1;
                black += usize::from(us == Color::Black);

                let mv = moves[(next_random(&mut state) % moves.len() as u64) as usize];
                ours.play_unchecked(mv);
            }
        }
        assert!(
            checked >= 2_000 && black >= 1_000,
            "positions {checked}, dont {black} aux Noirs"
        );
    }

    /// Ce qui est écrit se relit par `viriformat` — qui, en debug, vérifie la
    /// légalité de chaque coup — et se déplie en autant de positions que de
    /// coups, avec le même résultat.
    #[test]
    fn une_partie_ecrite_se_relit_par_viriformat() {
        let mut search = search();
        let mut written = 0;
        for index in 0..6 {
            let Some(game) = play_indexed_game(7, index, 500, &mut search).unwrap() else {
                continue;
            };
            let mut bytes = Vec::new();
            game.serialise_into(&mut bytes).unwrap();
            let read = Game::deserialise_from(&mut bytes.as_slice(), Vec::new()).unwrap();
            assert_eq!(read, game);
            let mut positions = 0;
            read.splat_to_bulletformat(
                |_| {
                    positions += 1;
                    Ok(())
                },
                &Filter::UNRESTRICTED,
            )
            .unwrap();
            assert_eq!(positions, game.len());
            written += 1;
        }
        assert!(written > 0, "aucune partie retenue sur six");
    }

    /// Même graine, mêmes octets — même avec une table déjà salie par une
    /// autre partie : c'est le vidage en début de partie qui le garantit.
    #[test]
    fn meme_graine_memes_octets() {
        let bytes = |seed: u64, search: &mut Search| {
            let mut out = Vec::new();
            for index in 0..3 {
                if let Some(game) = play_indexed_game(seed, index, 400, search).unwrap() {
                    game.serialise_into(&mut out).unwrap();
                }
            }
            out
        };
        let mut shared = search();
        let first = bytes(11, &mut shared);
        let again = bytes(11, &mut shared);
        assert!(!first.is_empty());
        assert_eq!(first, again);
        assert_eq!(first, bytes(11, &mut search()));
        assert_ne!(first, bytes(12, &mut shared));
    }

    #[test]
    fn une_ouverture_desequilibree_est_ecartee() {
        // Les Blancs, au trait, ont une dame de plus : au-delà du seuil.
        let lopsided = board("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        assert!(
            play_game(
                lopsided.clone(),
                2_000,
                Some(OPENING_MAX_SCORE),
                &mut search()
            )
            .unwrap()
            .is_none()
        );
        // Témoin : la position dépasse bien le seuil — c'est le filtre qui
        // l'écarte, pas une autre cause.
        let mut first = None;
        let limits = Limits {
            nodes: Some(2_000),
            ..Limits::default()
        };
        search().go(&Position::from_board(lopsided), &limits, |info| {
            first = Some(info.score);
        });
        let first = white_relative(first.unwrap(), Color::White).unwrap();
        assert!(i32::from(first) > OPENING_MAX_SCORE, "score : {first}");
    }

    #[test]
    fn les_options_sont_lues_et_bornees() {
        let args = |list: &[&str]| list.iter().map(ToString::to_string).collect::<Vec<_>>();
        let config = parse_args(&args(&["--out", "d", "--games", "3", "--threads", "2"])).unwrap();
        assert_eq!(
            (config.games, config.threads, config.nodes),
            (3, 2, DEFAULT_NODES)
        );
        assert!(
            parse_args(&args(&["--out", "d"])).is_err(),
            "rien ne s'arrêterait"
        );
        assert!(
            parse_args(&args(&["--games", "3"])).is_err(),
            "--out manque"
        );
        assert!(parse_args(&args(&["--out", "d", "--games", "x"])).is_err());
        assert!(parse_args(&args(&["--out", "d", "--games", "1", "--nodes", "0"])).is_err());
        assert!(parse_args(&args(&["--out", "d", "--bruit", "1"])).is_err());
    }
}
