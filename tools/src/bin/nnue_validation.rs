//! La perte de l'entraîneur sur des positions qu'il n'a pas apprises (n° 18).
//!
//! # Pourquoi ce binaire existe
//!
//! bullet, au commit qu'on épingle (`10e7e82`), n'a pas de jeu de
//! validation : `LocalSettings` porte un champ `test_set`, mais
//! `ValueTrainer::run` imprime alors « *Validation data not currently
//! implemented!* » et ne calcule rien (`crates/bullet_lib/src/value.rs`, lu
//! le 14 oct. 2026). La perte qu'imprime l'entraînement est donc celle des
//! positions mêmes qu'il apprend : un réseau qui RETIENT ses données la baisse
//! autant qu'un réseau qui apprend. Au n° 17, les seaux de roi avaient la
//! perte la plus basse des quatre réseaux et jouaient le plus mal.
//!
//! Ce binaire calcule la même perte sur d'autres positions — un job de
//! génération dont aucun réseau n'a appris —, et sur des positions apprises,
//! pour l'écart entre les deux.
//!
//! **Ce qu'elle ne dit pas : la force.** Une erreur de prédiction tenue à
//! l'écart n'est pas un substitut à la force de jeu — l'ajustement Texel
//! prédisait 7,8 % mieux et jouait 25 Elo plus mal (`CLAUDE.md`). Elle
//! diagnostique ; les matchs décident.
//!
//! # Ce qui est mesuré, et pourquoi c'est la perte de l'entraîneur
//!
//! - **les positions** : celles que l'entraîneur voit — chaque partie
//!   dépliée par `Game::splat_to_bulletformat_with_filter_callback` de
//!   `viriformat`, sous le filtre par défaut de la même crate, celui que
//!   `tools/nnue-train` passe au chargeur de bullet ;
//! - **les étiquettes** : le `ChessBoard` que rend ce dépliage, celui-là même
//!   que bullet lit — score et résultat retournés vers le camp au trait par
//!   `bulletformat` ;
//! - **la cible** : `0,75 · résultat + 0,25 · σ(score / 400)` — le mélange de
//!   `make_mapper` (`bullet_lib/src/value.rs`) sous le `ConstantWDL` de
//!   `tools/nnue-train`, à l'échelle de `nnue::SCALE` ;
//! - **la prédiction** : `σ(éval / 400)`, l'évaluation du réseau QUANTIFIÉ par
//!   le code du moteur — le réseau qui joue, pas celui en flottants que
//!   l'entraîneur optimise ; les deux diffèrent d'une dizaine de centièmes au
//!   plus, le critère de leurs confrontations ;
//! - **la perte** : `(prédiction − cible)²`, le `squared_error` de
//!   `tools/nnue-train`, moyenné sur les positions.
//!
//! **La position évaluée est celle de l'étiquette, vérifiée à chaque
//! position** : l'échiquier vient du FEN de `viriformat` — roque et prise en
//! passant retirés, que les entrées du réseau ignorent —, et chacune de ses
//! pièces est confrontée au `ChessBoard` de l'entraîneur. Un écart arrête
//! tout : une perte calculée sur des positions mal appariées serait fausse
//! sans rien qui le signale.
//!
//! # L'incertitude
//!
//! Les positions d'une même partie ne sont pas indépendantes. L'intervalle se
//! calcule donc PAR PARTIE (variance d'un estimateur de rapport groupé) : une
//! partie compte comme un tirage. Les écarts entre réseaux sont APPARIÉS —
//! mêmes positions —, d'où un intervalle bien plus étroit que celui de
//! chaque perte.
//!
//! # Usage
//!
//! ```text
//! nnue-validation --reseau CHEMIN:ROI:SORTIE [--reseau …] FICHIER_OU_DOSSIER…
//! ```
//!
//! `ROI` : `aucun`, `4` ou `10` — les dispositions `KING_BUCKETS_4` et
//! `KING_BUCKETS_10` du moteur ; `SORTIE` : le nombre de seaux de sortie. Le
//! premier réseau sert de référence aux écarts. Un dossier se lit pour ses
//! fichiers `.vf`, un fil par fichier. Seuls les réseaux de la largeur du
//! binaire (`nnue::HIDDEN`) se chargent : un autre est refusé, et le dit.

use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use bulletformat::ChessBoard;
use cozy_chess::{Board, Piece, Square};
use shallowred::nnue::{Arch, KING_BUCKETS_4, KING_BUCKETS_10, Network, SCALE};
use viriformat::dataformat::{Filter, Game};

/// La part du résultat dans la cible : le `ConstantWDL { value: 0.75 }` de
/// `tools/nnue-train`. Un test confronte ce nombre au source de l'entraîneur.
const WDL_BLEND: f64 = 0.75;

fn sigmoid(x: f64) -> f64 {
    1.0 / (1.0 + (-x).exp())
}

/// La cible de l'entraîneur, du point de vue du camp au trait : `result` vaut
/// 0, 1 ou 2 (perte, nulle, gain), `score` est en centièmes.
fn target(score: i16, result: u8) -> f64 {
    let scale = f64::from(SCALE);
    WDL_BLEND * f64::from(result) / 2.0 + (1.0 - WDL_BLEND) * sigmoid(f64::from(score) / scale)
}

/// La perte d'une évaluation contre sa cible.
fn loss(evaluation: i32, target: f64) -> f64 {
    let error = sigmoid(f64::from(evaluation) / f64::from(SCALE)) - target;
    error * error
}

/// Un réseau à mesurer : son nom tel que donné, et le réseau chargé.
struct Candidate {
    name: String,
    network: Network,
}

/// Lit `CHEMIN:ROI:SORTIE`.
fn parse_candidate(spec: &str) -> Result<Candidate, String> {
    let mut parts = spec.rsplitn(3, ':');
    let (Some(output), Some(king), Some(path)) = (parts.next(), parts.next(), parts.next()) else {
        return Err(format!("« {spec} » : attendu CHEMIN:ROI:SORTIE"));
    };
    let king_buckets = match king {
        "aucun" => None,
        "4" => Some(KING_BUCKETS_4),
        "10" => Some(KING_BUCKETS_10),
        other => return Err(format!("seaux de roi « {other} » : aucun, 4 ou 10")),
    };
    let output_buckets = output
        .parse::<usize>()
        .map_err(|_| format!("seaux de sortie « {output} » : un entier"))?;
    let arch = Arch {
        king_buckets,
        output_buckets,
    };
    let bytes = std::fs::read(path).map_err(|error| format!("{path} : {error}"))?;
    let network =
        Network::from_bytes_with(&bytes, arch).map_err(|error| format!("{path} : {error}"))?;
    Ok(Candidate {
        name: path.to_owned(),
        network,
    })
}

/// L'échiquier de `cozy-chess` est-il la position de `record` ?
///
/// `ChessBoard::from_raw` retourne l'échiquier quand les Noirs ont le trait
/// — rangées en miroir (`^ 56`) et couleurs échangées —, si bien que la
/// couleur 0 y est toujours le camp au trait.
fn same_position(board: &Board, record: &ChessBoard) -> bool {
    let side_to_move = board.side_to_move();
    let mirror = if side_to_move == cozy_chess::Color::White {
        0
    } else {
        56
    };
    let mut pieces = 0;
    for (piece, square) in *record {
        let square = Square::index(usize::from(square ^ mirror));
        let colour = if piece >> 3 == 0 {
            side_to_move
        } else {
            !side_to_move
        };
        let kind = Piece::index(usize::from(piece & 7));
        if board.piece_on(square) != Some(kind) || board.color_on(square) != Some(colour) {
            return false;
        }
        pieces += 1;
    }
    pieces == board.occupied().len()
}

/// Le FEN de `viriformat`, roque et prise en passant retirés : les entrées du
/// réseau ne les lisent pas, et `cozy-chess` refuserait un droit ou une case
/// que `viriformat` écrit autrement que lui.
fn engine_board(fen: &str) -> Result<Board, String> {
    let fields: Vec<&str> = fen.split_whitespace().collect();
    let [placement, side, _, _, halfmove, fullmove] = fields[..] else {
        return Err(format!("FEN de viriformat illisible : {fen}"));
    };
    let stripped = format!("{placement} {side} - - {halfmove} {fullmove}");
    Board::from_fen(&stripped, false).map_err(|error| format!("{stripped} : {error:?}"))
}

/// Les sommes d'un ensemble de parties, de quoi rendre une moyenne par
/// position et son intervalle par partie. `per_network[k]` : la perte du
/// réseau `k` ; `per_gap[k]` : l'écart du réseau `k` au premier.
#[derive(Clone, Debug, Default, PartialEq)]
struct Sums {
    games: u64,
    positions: u64,
    positions_sq: f64,
    per_network: Vec<Moments>,
    per_gap: Vec<Moments>,
}

/// Pour une grandeur `S` sommée par partie de `n` positions : Σ S, Σ S²,
/// Σ S · n.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Moments {
    sum: f64,
    sum_sq: f64,
    sum_n: f64,
}

impl Moments {
    fn add(&mut self, total: f64, positions: f64) {
        self.sum += total;
        self.sum_sq += total * total;
        self.sum_n += total * positions;
    }

    fn merge(&mut self, other: &Self) {
        self.sum += other.sum;
        self.sum_sq += other.sum_sq;
        self.sum_n += other.sum_n;
    }
}

impl Sums {
    fn new(networks: usize) -> Self {
        Self {
            per_network: vec![Moments::default(); networks],
            per_gap: vec![Moments::default(); networks],
            ..Self::default()
        }
    }

    /// Ajoute une partie : la perte totale de chaque réseau sur ses
    /// positions gardées.
    fn add_game(&mut self, totals: &[f64], positions: u64) {
        if positions == 0 {
            return;
        }
        let n = positions as f64;
        self.games += 1;
        self.positions += positions;
        self.positions_sq += n * n;
        for (k, &total) in totals.iter().enumerate() {
            self.per_network[k].add(total, n);
            self.per_gap[k].add(total - totals[0], n);
        }
    }

    fn merge(&mut self, other: &Self) {
        self.games += other.games;
        self.positions += other.positions;
        self.positions_sq += other.positions_sq;
        for (mine, theirs) in self.per_network.iter_mut().zip(&other.per_network) {
            mine.merge(theirs);
        }
        for (mine, theirs) in self.per_gap.iter_mut().zip(&other.per_gap) {
            mine.merge(theirs);
        }
    }

    /// La moyenne par position et la demi-largeur de son intervalle à 95 %,
    /// par partie : `Var = G / (G − 1) · Σ (S − m · n)² / (Σ n)²`.
    fn estimate(&self, moments: &Moments) -> (f64, f64) {
        let total = self.positions as f64;
        let mean = moments.sum / total;
        let games = self.games as f64;
        let residual =
            moments.sum_sq - 2.0 * mean * moments.sum_n + mean * mean * self.positions_sq;
        let variance = games / (games - 1.0) * residual.max(0.0) / (total * total);
        (mean, 1.96 * variance.sqrt())
    }
}

/// Les fichiers `.vf` d'une liste de fichiers et de dossiers, triés.
fn data_files(inputs: &[String]) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    for input in inputs {
        let path = Path::new(input);
        if path.is_dir() {
            let entries = std::fs::read_dir(path).map_err(|error| format!("{input} : {error}"))?;
            for entry in entries {
                let entry = entry.map_err(|error| format!("{input} : {error}"))?;
                if entry.path().extension().is_some_and(|ext| ext == "vf") {
                    files.push(entry.path());
                }
            }
        } else {
            files.push(path.to_path_buf());
        }
    }
    files.sort();
    if files.is_empty() {
        return Err("aucun fichier .vf".to_owned());
    }
    Ok(files)
}

/// Les positions gardées d'une partie, chacune avec son échiquier et
/// l'étiquette de l'entraîneur.
fn kept_positions(game: &Game, filter: &Filter) -> Result<Vec<(Board, ChessBoard)>, String> {
    let mut fens = Vec::new();
    let mut records = Vec::new();
    game.splat_to_bulletformat_with_filter_callback(
        |record| {
            records.push(record);
            Ok(())
        },
        |mv, eval, board, outcome, rng| {
            let filtered = filter.should_filter(mv, eval, board, outcome, rng);
            if !filtered {
                fens.push(board.to_string());
            }
            filtered
        },
    )
    .map_err(|error| format!("partie illisible : {error}"))?;
    if fens.len() != records.len() {
        return Err(format!(
            "{} FEN pour {} étiquettes",
            fens.len(),
            records.len()
        ));
    }
    fens.iter()
        .zip(records)
        .map(|(fen, record)| {
            let board = engine_board(fen)?;
            if !same_position(&board, &record) {
                return Err(format!("{fen} n'est pas la position de son étiquette"));
            }
            Ok((board, record))
        })
        .collect()
}

/// Mesure les réseaux sur un fichier. Une erreur de lecture au milieu d'un
/// fichier est une erreur : seule une fin de fichier entre deux parties est
/// une fin.
fn measure_file(path: &Path, candidates: &[Candidate]) -> Result<Sums, String> {
    let file = File::open(path).map_err(|error| format!("{} : {error}", path.display()))?;
    let mut reader = BufReader::new(file);
    let filter = Filter::default();
    let mut sums = Sums::new(candidates.len());
    let mut totals = vec![0.0; candidates.len()];
    let mut buffer = Vec::new();
    loop {
        let at_end = reader
            .fill_buf()
            .map_err(|error| format!("{} : {error}", path.display()))?
            .is_empty();
        if at_end {
            return Ok(sums);
        }
        let game = Game::deserialise_from(&mut reader, buffer)
            .map_err(|error| format!("{} : partie tronquée ({error})", path.display()))?;
        let positions = kept_positions(&game, &filter)
            .map_err(|error| format!("{} : {error}", path.display()))?;
        totals.fill(0.0);
        for (board, record) in &positions {
            let target = target(record.score, record.result);
            for (total, candidate) in totals.iter_mut().zip(candidates) {
                let accumulators = candidate.network.refresh(board);
                *total += loss(candidate.network.evaluate(&accumulators, board), target);
            }
        }
        sums.add_game(&totals, positions.len() as u64);
        buffer = game.into_move_buffer();
        buffer.clear();
    }
}

fn run(args: &[String]) -> Result<String, String> {
    let mut candidates = Vec::new();
    let mut inputs = Vec::new();
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        if arg == "--reseau" {
            let spec = iter.next().ok_or("--reseau sans valeur")?;
            candidates.push(parse_candidate(spec)?);
        } else {
            inputs.push(arg.clone());
        }
    }
    if candidates.is_empty() {
        return Err("aucun --reseau".to_owned());
    }
    let files = data_files(&inputs)?;

    let results: Vec<Result<Sums, String>> = std::thread::scope(|scope| {
        let handles: Vec<_> = files
            .iter()
            .map(|path| scope.spawn(|| measure_file(path, &candidates)))
            .collect();
        handles
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .unwrap_or_else(|_| Err("un fil a paniqué".to_owned()))
            })
            .collect()
    });
    let mut sums = Sums::new(candidates.len());
    for result in results {
        sums.merge(&result?);
    }
    if sums.games < 2 {
        return Err(format!(
            "{} partie(s) : il en faut deux pour un intervalle",
            sums.games
        ));
    }
    Ok(report(&files, &candidates, &sums))
}

fn report(files: &[PathBuf], candidates: &[Candidate], sums: &Sums) -> String {
    let mut out = format!(
        "fichiers {}, parties {}, positions gardées {}\n",
        files.len(),
        sums.games,
        sums.positions
    );
    for (candidate, moments) in candidates.iter().zip(&sums.per_network) {
        let (mean, half) = sums.estimate(moments);
        out += &format!("perte {} {mean:.6} ± {half:.6}\n", candidate.name);
    }
    for (candidate, moments) in candidates.iter().zip(&sums.per_gap).skip(1) {
        let (mean, half) = sums.estimate(moments);
        out += &format!("ecart {} {mean:+.6} ± {half:.6}\n", candidate.name);
    }
    out
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(report) => {
            print!("{report}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("nnue-validation : {error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    #![expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]

    use super::*;
    use viriformat::chess::board::{Board as VfBoard, GameOutcome, WinType};

    const N5L: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../reseaux/n5l-768x256-s8-40.bin"
    );

    fn n5l() -> Candidate {
        parse_candidate(&format!("{N5L}:aucun:8")).unwrap()
    }

    /// Une partie de coups légaux tirés par un générateur fixe, chaque coup
    /// noté d'une évaluation connue — du point de vue des Blancs, la
    /// convention du format.
    fn fabricated_game(seed: u64, plies: usize) -> (Game, Vec<i16>) {
        let mut board = VfBoard::new();
        board
            .set_from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
            .unwrap();
        let mut game = Game::new(&board);
        let mut evals = Vec::new();
        let mut state = seed;
        for ply in 0..plies {
            let moves = board.legal_moves();
            if moves.is_empty() {
                break;
            }
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            let mv = moves[(state >> 33) as usize % moves.len()];
            let eval = i16::try_from(ply % 200).unwrap() * 7 - 300;
            game.add_move(mv, eval);
            evals.push(eval);
            board.make_move_simple(mv);
        }
        game.set_outcome(GameOutcome::WhiteWin(WinType::Adjudication));
        (game, evals)
    }

    #[test]
    fn la_cible_est_celle_de_bullet() {
        // Gain au trait, score nul : 0,75 · 1 + 0,25 · ½.
        assert!((target(0, 2) - 0.875).abs() < 1e-12);
        // Perte, score de 400 : 0,25 · σ(1).
        assert!((target(400, 0) - 0.25 * sigmoid(1.0)).abs() < 1e-12);
        // Une prédiction exacte ne coûte rien ; une prédiction de ½ contre
        // une cible de 1 coûte ¼.
        assert!(loss(0, 0.5).abs() < 1e-12);
        assert!((loss(0, 1.0) - 0.25).abs() < 1e-12);
    }

    /// Le mélange est celui de l'entraîneur : un autre `ConstantWDL` dans
    /// `tools/nnue-train` ferait mesurer une autre perte que celle qu'il
    /// minimise, sans que rien ne le signale.
    #[test]
    fn le_melange_est_celui_de_l_entraineur() {
        let source = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/nnue-train/src/main.rs"
        ))
        .unwrap();
        assert!(
            source.contains(&format!("wdl::ConstantWDL {{ value: {WDL_BLEND} }}")),
            "le ConstantWDL de tools/nnue-train n'est plus {WDL_BLEND}"
        );
        assert!(
            source.contains(".loss_fn(|output, target| output.sigmoid().squared_error(target))")
        );
    }

    /// Chaque position gardée se relit avec SON étiquette : le score retourné
    /// vers le camp au trait, le résultat aussi, et autant de positions que
    /// le filtre en compte.
    #[test]
    fn une_partie_se_deplie_en_positions_etiquetees() {
        for seed in 1..=4 {
            let (game, evals) = fabricated_game(seed, 60);
            let kept = kept_positions(&game, &Filter::default()).unwrap();
            assert_eq!(
                kept.len() as u64,
                game.filter_pass_count(&Filter::default())
            );
            assert!(!kept.is_empty());
            let unrestricted = kept_positions(&game, &Filter::UNRESTRICTED).unwrap();
            assert_eq!(unrestricted.len(), evals.len());
            let mut black = 0;
            for ((board, record), &eval) in unrestricted.iter().zip(&evals) {
                let white = board.side_to_move() == cozy_chess::Color::White;
                assert_eq!(record.score, if white { eval } else { -eval });
                assert_eq!(record.result, if white { 2 } else { 0 });
                black += usize::from(!white);
            }
            assert!(black > 20, "{black} positions aux Noirs");
        }
    }

    /// La vérification d'appariement sait échouer : la position d'à côté,
    /// ou la même au trait de l'autre camp, est refusée.
    #[test]
    fn une_position_mal_appariee_est_refusee() {
        let (game, _) = fabricated_game(9, 40);
        let kept = kept_positions(&game, &Filter::UNRESTRICTED).unwrap();
        let (first, record) = &kept[10];
        assert!(same_position(first, record));
        assert!(!same_position(&kept[11].0, record));
        if let Some(flipped) = first.null_move() {
            assert!(!same_position(&flipped, record));
        }

        // Chaque pièce de l'étiquette est à sa place, mais l'échiquier en
        // porte une de plus : seul le compte le voit.
        let mut kings = VfBoard::new();
        kings
            .set_from_fen("4k3/8/8/8/8/8/2P5/4K3 b - - 0 1")
            .unwrap();
        let record = kings.to_bulletformat(1, 0).unwrap();
        let same = Board::from_fen("4k3/8/8/8/8/8/2P5/4K3 b - - 0 1", false).unwrap();
        assert!(same_position(&same, &record));
        let extra = Board::from_fen("4k3/8/8/8/8/8/2P5/3QK3 b - - 0 1", false).unwrap();
        assert!(!same_position(&extra, &record));
    }

    #[test]
    fn un_fichier_tronque_est_une_erreur() {
        let dir = std::env::temp_dir().join(format!("nnue-validation-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut bytes = Vec::new();
        for seed in 1..=3 {
            fabricated_game(seed, 50)
                .0
                .serialise_into(&mut bytes)
                .unwrap();
        }
        let whole = dir.join("entier.vf");
        std::fs::write(&whole, &bytes).unwrap();
        let cut = dir.join("tronque.vf");
        std::fs::write(&cut, &bytes[..bytes.len() - 3]).unwrap();

        let candidates = [n5l()];
        let sums = measure_file(&whole, &candidates).unwrap();
        assert_eq!(sums.games, 3);
        assert!(
            measure_file(&cut, &candidates)
                .unwrap_err()
                .contains("tronquée")
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// Un réseau contre lui-même : un écart nul, au bit près, et un
    /// intervalle nul ; contre un autre réseau, un écart.
    #[test]
    fn l_ecart_apparie_d_un_reseau_a_lui_meme_est_nul() {
        let dir =
            std::env::temp_dir().join(format!("nnue-validation-ecart-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut bytes = Vec::new();
        for seed in 1..=8 {
            fabricated_game(seed, 80)
                .0
                .serialise_into(&mut bytes)
                .unwrap();
        }
        let path = dir.join("parties.vf");
        std::fs::write(&path, &bytes).unwrap();

        let same = [n5l(), n5l()];
        let sums = measure_file(&path, &same).unwrap();
        assert_eq!(sums.estimate(&sums.per_gap[1]), (0.0, 0.0));
        let (mean, half) = sums.estimate(&sums.per_network[0]);
        assert!(mean > 0.0 && half > 0.0);

        let r4 = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../reseaux/n5r4-768x4hm-256-s8-40.bin"
        );
        let other = [n5l(), parse_candidate(&format!("{r4}:4:8")).unwrap()];
        let sums = measure_file(&path, &other).unwrap();
        assert_ne!(sums.estimate(&sums.per_gap[1]).0, 0.0);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// L'intervalle par partie, sur deux parties dont on fait le calcul à la
    /// main : pertes totales 1 et 3 sur 1 et 3 positions — moyenne 1, aucun
    /// résidu ; puis 1 et 1 — moyenne ½, résidus ½ et −½.
    #[test]
    fn l_intervalle_se_calcule_par_partie() {
        let mut sums = Sums::new(1);
        sums.add_game(&[1.0], 1);
        sums.add_game(&[3.0], 3);
        assert_eq!(sums.estimate(&sums.per_network[0]), (1.0, 0.0));

        let mut sums = Sums::new(1);
        sums.add_game(&[1.0], 1);
        sums.add_game(&[1.0], 3);
        let (mean, half) = sums.estimate(&sums.per_network[0]);
        assert!((mean - 0.5).abs() < 1e-12);
        // Var = 2/1 · (½² + ½²) / 4² = 1/16.
        assert!((half - 1.96 * 0.25).abs() < 1e-12);

        // La réunion de deux moitiés est le tout.
        let mut a = Sums::new(1);
        a.add_game(&[1.0], 1);
        let mut b = Sums::new(1);
        b.add_game(&[1.0], 3);
        a.merge(&b);
        assert_eq!(a, sums);
    }

    #[test]
    fn un_reseau_d_une_autre_architecture_est_refuse() {
        let n5s = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../reseaux/n5s-768x128-s8-40.bin"
        );
        assert!(parse_candidate(&format!("{n5s}:aucun:8")).is_err());
        assert!(parse_candidate(&format!("{N5L}:aucun:1")).is_err());
        assert!(parse_candidate(&format!("{N5L}:7:8")).is_err());
        assert!(parse_candidate(N5L).is_err());
    }
}
