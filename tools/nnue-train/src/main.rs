//! Entraîne le réseau NNUE de ShallowRed (B4, chantier A21, étape 3) — sur la
//! carte graphique de Théo : bullet n'entraîne que sur GPU.
//!
//! Trois temps, et le programme refuse de passer au suivant si le précédent
//! échoue :
//!
//! 1. **Relire les données** jusqu'au dernier octet, fichier par fichier, et
//!    compter parties et positions. Les artefacts de génération n'ont jamais
//!    pu être relus depuis le conteneur de session ; leurs comptes doivent
//!    retomber sur les résumés des jobs (`tools/README.md`, section A21), et
//!    `--attendu PARTIES:POSITIONS` fait refuser un écart. Un binpack, lui,
//!    n'a pas de compte attendu : il se relit bloc par bloc, et un
//!    échantillon **ajuste l'échelle de ses scores** — refusée si elle n'est
//!    pas celle que la conversion de Leela annonce ([`LEELA_SCALE`]).
//! 2. **Entraîner**, selon `examples/progression/1_simple.rs` de bullet au
//!    commit épinglé — le premier pas que bullet recommande —, sur les
//!    fichiers viriformat entrelacés, filtrés par le filtre par défaut de
//!    `viriformat` ; ou sur des binpacks, filtrés comme dans
//!    `examples/simple.rs` du même commit. L'architecture vient des
//!    constantes du MOTEUR : les changer d'un côté les change de l'autre.
//!    `--depuis DOSSIER` repart d'un point de sauvegarde de bullet — ré-
//!    entraîner un réseau déjà bon, comme Stockfish sur les données de
//!    Leela.
//! 3. **Confronter** le réseau quantifié, rechargé par le chargeur du moteur,
//!    à ce que l'entraîneur lui-même en dit, position par position. C'est la
//!    seule vérification de bout en bout que les entrées du moteur sont
//!    celles de l'entraînement : un réseau mal indexé ne fait rien planter,
//!    il joue mal.
//!
//! ```text
//! cargo run --release --features cuda -- [--attendu P:N] [--superlots 40]
//!     [--sortie checkpoints] [--memoire 1024] [--fils 4] [--depuis DOSSIER]
//!     DOSSIER_OU_FICHIER...
//! ```
//!
//! Un dossier donne tous ses fichiers `.vf` et `.binpack`, triés par nom.
//! **Les deux formats ne se mélangent pas** dans un même entraînement : leurs
//! scores n'ont pas la même échelle ([`Format::eval_scale`]).

use std::fs::File;
use std::io::{BufReader, Seek};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use bullet_lib::game::inputs::Chess768;
use bullet_lib::nn::optimiser::AdamW;
use bullet_lib::trainer::save::SavedFormat;
use bullet_lib::trainer::schedule::{TrainingSchedule, TrainingSteps, lr, wdl};
use bullet_lib::trainer::settings::LocalSettings;
use bullet_lib::value::ValueTrainerBuilder;
use bullet_lib::value::loader::sfbinpack::{MoveType, PieceType, TrainingDataEntry};
use bullet_lib::value::loader::viribinpack::{Filter, Game};
use bullet_lib::value::loader::{SfBinpackLoader, ViriBinpackLoader, ViriFilter};
use cozy_chess::Board;
use sfbinpack::{ChunkReader, read_chunk_into};
use shallowred::nnue::{HIDDEN, Network, QA, QB, SCALE};

/// Identifiant des points de sauvegarde : `<sortie>/<identifiant>-<superlot>/`.
/// Tiré de la largeur du MOTEUR, comme l'architecture : un réseau plus large
/// ne peut pas porter le nom de celui qu'il doit battre.
fn net_id() -> String {
    format!("shallowred-768x{HIDDEN}")
}

/// L'échelle des scores d'un binpack tiré de Leela Chess Zero, en unités de
/// score par unité de logit — la sigmoïde de la cible en dépend.
///
/// **Lue au source**, `LeelaChessZero/lc0`, `src/trainingdata/rescorer.cc`
/// (`AsNnueString`, commit `1227b4c`) : le score écrit vaut
/// `660,6 q / (1 − 0,9751875 q¹⁰)`, `q` étant l'espérance de Leela ramenée à
/// [−1, 1], gains moins pertes. Près de zéro l'espérance `(1 + q) / 2` vaut
/// `1/2 + score / 1 321,2`, et une sigmoïde d'échelle K vaut `1/2 + s / 4K` :
/// K = 330,3. Nos données, elles, portent des centièmes à l'échelle
/// [`SCALE`]. Entraîner un binpack de Leela à 400 tasserait la moitié
/// « évaluation » de la cible vers ½ ; rien ne planterait.
const LEELA_SCALE: f32 = 330.3;

/// Positions gardées par le filtre qu'échantillonne la relecture d'un
/// binpack, pour ajuster l'échelle : assez pour une estimation au pour-cent,
/// assez peu pour quelques secondes.
const SCALE_SAMPLE: usize = 2_000_000;

/// Les deux formats que le programme sait lire.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Format {
    /// `viriformat`, `.vf` : nos données, de `nnue-datagen`.
    Viri,
    /// Le binpack de Stockfish, `.binpack` : les données de Leela Chess Zero
    /// converties (`tools/README.md`, n° 7, levier 4).
    Binpack,
}

impl Format {
    fn of(path: &Path) -> Option<Self> {
        match path.extension()?.to_str()? {
            "vf" => Some(Self::Viri),
            "binpack" => Some(Self::Binpack),
            _ => None,
        }
    }

    /// Unités de score par unité de logit, dans la cible de bullet.
    fn eval_scale(self) -> f32 {
        match self {
            Self::Viri => SCALE as f32,
            Self::Binpack => LEELA_SCALE,
        }
    }
}

/// Le filtre d'un binpack : celui d'`examples/simple.rs` de bullet au commit
/// épinglé, le même esprit que le filtre par défaut de `viriformat` — ni
/// échec, ni coup tactique (prise, promotion, roque, prise en passant), rien
/// avant le seizième demi-coup, et pas de score de mat.
fn keep_binpack(entry: &TrainingDataEntry) -> bool {
    entry.ply >= 16
        && !entry.pos.is_checked(entry.pos.side_to_move())
        && entry.score.unsigned_abs() <= 10_000
        && entry.mv.mtype() == MoveType::Normal
        && entry.pos.piece_at(entry.mv.to()).piece_type() == PieceType::None
}

/// Les positions de la confrontation : celles du banc, puis d'autres au trait
/// noir — le cas où bullet retourne l'échiquier —, des finales et des
/// positions déséquilibrées. Aucune position morte : le moteur y rendrait
/// zéro quoi que dise le réseau.
const FENS: &[&str] = &[
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R b KQkq - 0 1",
    "r2q1rk1/pp2bppp/2n1bn2/3p4/3P4/2NBBN2/PP3PPP/R2Q1RK1 b - - 0 1",
    "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1",
    "8/8/8/4k3/8/8/4KP2/8 w - - 0 1",
    "8/5pk1/6p1/8/8/1Q6/5PPP/6K1 b - - 0 1",
];

/// L'écart médian admis entre le moteur et l'entraîneur, en centièmes —
/// écrit AVANT le premier entraînement. La quantification arrondit chaque
/// poids de la couche cachée à 1/255 et chaque poids de sortie à 1/64 :
/// estimé à la main, l'écart typique vaut une dizaine de centièmes. Un
/// réseau mal indexé, lui, s'écarte de l'ordre de l'évaluation elle-même.
const MEDIAN_GAP: i32 = 15;
/// L'écart maximal admis, sur les positions de [`FENS`].
const MAX_GAP: i32 = 50;

/// Les réglages lus sur la ligne de commande.
struct Options {
    expected: Option<(u64, u64)>,
    superbatches: usize,
    output: String,
    buffer_mb: usize,
    threads: usize,
    resume: Option<PathBuf>,
    files: Vec<PathBuf>,
    format: Format,
}

fn parse_options(args: &[String]) -> Result<Options, String> {
    let mut options = Options {
        expected: None,
        superbatches: 40,
        output: "checkpoints".to_owned(),
        buffer_mb: 1024,
        threads: 4,
        resume: None,
        files: Vec::new(),
        format: Format::Viri,
    };
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        let mut value = |name: &str| {
            args.next()
                .cloned()
                .ok_or_else(|| format!("{name} attend une valeur"))
        };
        match arg.as_str() {
            "--attendu" => {
                let text = value("--attendu")?;
                let (games, positions) = text
                    .split_once(':')
                    .ok_or("--attendu s'écrit PARTIES:POSITIONS")?;
                options.expected = Some((
                    games
                        .parse()
                        .map_err(|_| "--attendu : parties illisibles")?,
                    positions
                        .parse()
                        .map_err(|_| "--attendu : positions illisibles")?,
                ));
            }
            "--superlots" => {
                options.superbatches = value("--superlots")?
                    .parse()
                    .map_err(|_| "--superlots attend un entier")?;
            }
            "--sortie" => options.output = value("--sortie")?,
            "--memoire" => {
                options.buffer_mb = value("--memoire")?
                    .parse()
                    .map_err(|_| "--memoire attend un entier (Mio)")?;
            }
            "--fils" => {
                options.threads = value("--fils")?
                    .parse()
                    .map_err(|_| "--fils attend un entier")?;
            }
            "--depuis" => options.resume = Some(PathBuf::from(value("--depuis")?)),
            path => options.files.extend(data_files(Path::new(path))?),
        }
    }
    options.format = common_format(&options.files)?;
    if options.format == Format::Binpack && options.expected.is_some() {
        return Err(
            "--attendu compte nos parties .vf ; un binpack n'a pas de compte attendu".into(),
        );
    }
    Ok(options)
}

/// Le format commun à tous les fichiers — refusé s'il n'y en a pas un seul :
/// deux échelles de scores dans un même entraînement fausseraient la cible.
fn common_format(files: &[PathBuf]) -> Result<Format, String> {
    let mut formats = files.iter().map(|file| {
        Format::of(file).ok_or_else(|| format!("{} : ni .vf ni .binpack", file.display()))
    });
    let first = formats.next().ok_or("aucun fichier de données")??;
    for format in formats {
        if format? != first {
            return Err("des .vf et des .binpack mêlés : un format par entraînement".into());
        }
    }
    Ok(first)
}

/// Un fichier, ou tous les `.vf` et `.binpack` d'un dossier, triés par nom.
fn data_files(path: &Path) -> Result<Vec<PathBuf>, String> {
    if !path.is_dir() {
        return Ok(vec![path.to_owned()]);
    }
    let mut files: Vec<PathBuf> = std::fs::read_dir(path)
        .map_err(|e| format!("{} : {e}", path.display()))?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|file| Format::of(file).is_some())
        .collect();
    files.sort();
    Ok(files)
}

/// Parties et positions d'un fichier viriformat, lu jusqu'au dernier octet.
/// Une partie illisible avant la fin est une erreur, pas une fin de fichier :
/// c'est ce qui distingue un fichier tronqué d'un fichier complet.
fn count(path: &Path) -> Result<(u64, u64), String> {
    let describe = |e: &dyn std::fmt::Display| format!("{} : {e}", path.display());
    let file = File::open(path).map_err(|e| describe(&e))?;
    let length = file.metadata().map_err(|e| describe(&e))?.len();
    let mut reader = BufReader::new(file);
    let (mut games, mut positions) = (0u64, 0u64);
    let mut buffer = Vec::new();
    loop {
        let at = reader.stream_position().map_err(|e| describe(&e))?;
        if at == length {
            return Ok((games, positions));
        }
        let game = Game::deserialise_from(&mut reader, buffer)
            .map_err(|e| describe(&format!("partie illisible à l'octet {at} : {e}")))?;
        games += 1;
        positions += game.moves.len() as u64;
        buffer = game.moves;
        buffer.clear();
    }
}

/// Ce que la relecture d'un binpack en dit.
#[derive(Debug, Default, PartialEq, Eq)]
struct BinpackSurvey {
    bytes: u64,
    chunks: u64,
    /// Positions décodées pour l'échantillon — pas tout le fichier : un
    /// binpack de Leela en porte des dizaines de milliards.
    decoded: u64,
}

/// Relit un binpack bloc par bloc jusqu'au dernier octet, et verse dans
/// `sample` — (score, résultat), du point de vue du trait — les positions
/// gardées par [`keep_binpack`], jusqu'à `limit`. Un bloc illisible est une
/// erreur, pas une fin de fichier : c'est ce qui distingue un fichier
/// tronqué d'un fichier complet.
fn survey_binpack(
    path: &Path,
    sample: &mut Vec<(i16, f32)>,
    limit: usize,
) -> Result<BinpackSurvey, String> {
    let describe = |e: &dyn std::fmt::Display| format!("{} : {e}", path.display());
    let file = File::open(path).map_err(|e| describe(&e))?;
    let bytes = file.metadata().map_err(|e| describe(&e))?.len();
    let mut reader = BufReader::new(file);
    let mut survey = BinpackSurvey {
        bytes,
        ..BinpackSurvey::default()
    };
    let mut chunk = Vec::new();
    loop {
        let at = reader.stream_position().map_err(|e| describe(&e))?;
        match read_chunk_into(&mut reader, &mut chunk) {
            Ok(true) => survey.chunks += 1,
            Ok(false) => break,
            Err(e) => return Err(describe(&format!("bloc illisible à l'octet {at} : {e:?}"))),
        }
        let mut entries = ChunkReader::default();
        while sample.len() < limit && entries.has_next(&chunk) {
            let entry = entries.next(&chunk);
            survey.decoded += 1;
            if keep_binpack(&entry) {
                sample.push((entry.score, f32::from(1 + entry.result) / 2.0));
            }
        }
    }
    // `has_next_chunk` de sfbinpack (0.6.5, lu) rend « pas de bloc suivant »
    // quand une position ou un `seek` échoue : une erreur d'entrée-sortie y
    // passerait pour la fin du fichier. Seul ce contrôle la verrait — aucun
    // test n'y arrive, il faudrait faire échouer un `seek`.
    let end = reader.stream_position().map_err(|e| describe(&e))?;
    if end != bytes {
        return Err(describe(&format!("{end} octets lus sur {bytes}")));
    }
    Ok(survey)
}

/// L'échelle K qui fait le mieux prédire le résultat par `sigmoid(score / K)`,
/// au sens de la perte même de l'entraînement — l'écart quadratique. Section
/// dorée sur ln K, de 50 à 5 000.
fn fit_scale(sample: &[(i16, f32)]) -> f32 {
    let loss = |k: f64| -> f64 {
        sample
            .iter()
            .map(|&(score, result)| {
                let predicted = 1.0 / (1.0 + (-f64::from(score) / k).exp());
                (predicted - f64::from(result)).powi(2)
            })
            .sum()
    };
    let ratio = (5f64.sqrt() - 1.0) / 2.0;
    let (mut low, mut high) = (50f64.ln(), 5_000f64.ln());
    let (mut a, mut b) = (high - ratio * (high - low), low + ratio * (high - low));
    let (mut loss_a, mut loss_b) = (loss(a.exp()), loss(b.exp()));
    for _ in 0..60 {
        if loss_a < loss_b {
            high = b;
            (b, loss_b) = (a, loss_a);
            a = high - ratio * (high - low);
            loss_a = loss(a.exp());
        } else {
            low = a;
            (a, loss_a) = (b, loss_b);
            b = low + ratio * (high - low);
            loss_b = loss(b.exp());
        }
    }
    ((low + high) / 2.0).exp() as f32
}

/// Refuse un binpack dont l'échelle ajustée s'écarte de plus d'un facteur
/// deux de celle de Leela : ses scores viendraient d'ailleurs — un binpack
/// généré par Stockfish lui-même, par exemple —, ou d'une autre unité, et
/// l'entraîner à [`LEELA_SCALE`] fausserait la cible sans rien faire planter.
fn check_scale(fitted: f32) -> Result<(), String> {
    if (LEELA_SCALE / 2.0..=LEELA_SCALE * 2.0).contains(&fitted) {
        Ok(())
    } else {
        Err(format!(
            "l'échelle ajustée des scores vaut {fitted:.0}, celle de la conversion de Leela \
             {LEELA_SCALE} : ces binpacks ne s'entraînent pas à cette échelle"
        ))
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("ÉCHEC — {e}");
            ExitCode::FAILURE
        }
    }
}

fn run(args: &[String]) -> Result<(), String> {
    let options = parse_options(args)?;

    // ---- 1. Relire les données.
    println!("== 1. Relecture des données ==");
    match options.format {
        Format::Viri => {
            let (mut games, mut positions) = (0u64, 0u64);
            for file in &options.files {
                let (g, p) = count(file)?;
                println!("  {}  {g} parties  {p} positions", file.display());
                games += g;
                positions += p;
            }
            println!("  total : {games} parties, {positions} positions");
            if let Some((expected_games, expected_positions)) = options.expected
                && (games, positions) != (expected_games, expected_positions)
            {
                return Err(format!(
                    "les données ne retombent pas sur les résumés : {games}:{positions} lus, \
                     {expected_games}:{expected_positions} attendus"
                ));
            }
        }
        Format::Binpack => {
            let mut sample = Vec::new();
            let mut decoded = 0u64;
            for file in &options.files {
                let survey = survey_binpack(file, &mut sample, SCALE_SAMPLE)?;
                println!(
                    "  {}  {} octets  {} blocs",
                    file.display(),
                    survey.bytes,
                    survey.chunks
                );
                decoded += survey.decoded;
            }
            if sample.is_empty() {
                return Err("aucune position gardée par le filtre dans l'échantillon".into());
            }
            let fitted = fit_scale(&sample);
            println!(
                "  échantillon : {} positions gardées sur {decoded} décodées ; échelle ajustée \
                 {fitted:.1}, celle de la conversion de Leela {LEELA_SCALE}",
                sample.len()
            );
            check_scale(fitted)?;
        }
    }

    // ---- 2. Entraîner.
    println!("== 2. Entraînement ==");
    let qa = i16::try_from(QA).map_err(|_| "QA hors d'un i16")?;
    let qb = i16::try_from(QB).map_err(|_| "QB hors d'un i16")?;
    let qab = i16::try_from(QA * QB).map_err(|_| "QA × QB hors d'un i16")?;
    let mut trainer = ValueTrainerBuilder::default()
        .dual_perspective()
        .optimiser(AdamW)
        .inputs(Chess768)
        .save_format(&[
            SavedFormat::id("l0w").round().quantise::<i16>(qa),
            SavedFormat::id("l0b").round().quantise::<i16>(qa),
            SavedFormat::id("l1w").round().quantise::<i16>(qb),
            SavedFormat::id("l1b").round().quantise::<i16>(qab),
        ])
        .loss_fn(|output, target| output.sigmoid().squared_error(target))
        .build(|builder, stm_inputs, ntm_inputs| {
            let l0 = builder.new_affine("l0", 768, HIDDEN);
            let l1 = builder.new_affine("l1", 2 * HIDDEN, 1);
            let stm_hidden = l0.forward(stm_inputs).screlu();
            let ntm_hidden = l0.forward(ntm_inputs).screlu();
            l1.forward(stm_hidden.concat(ntm_hidden))
        });

    if let Some(checkpoint) = &options.resume {
        // bullet sort du processus sur un point de sauvegarde illisible, avec
        // un message de débogage : mieux vaut refuser avant, en clair.
        if !checkpoint.join("optimiser_state").is_dir() {
            return Err(format!(
                "{} n'est pas un point de sauvegarde de bullet : pas d'optimiser_state/",
                checkpoint.display()
            ));
        }
        let path = checkpoint.to_str().ok_or("chemin non UTF-8")?;
        println!("  repart de {path}");
        trainer.load_from_checkpoint(path);
    }

    let initial_lr = 0.001;
    let schedule = TrainingSchedule {
        net_id: net_id(),
        eval_scale: options.format.eval_scale(),
        steps: TrainingSteps {
            batch_size: 16_384,
            batches_per_superbatch: 6104,
            start_superbatch: 1,
            end_superbatch: options.superbatches,
        },
        wdl_scheduler: wdl::ConstantWDL { value: 0.75 },
        lr_scheduler: lr::CosineDecayLR {
            initial_lr,
            final_lr: initial_lr * 0.3f32.powi(5),
            final_superbatch: options.superbatches,
        },
        save_rate: 10,
    };
    let settings = LocalSettings {
        threads: options.threads,
        test_set: None,
        output_directory: &options.output,
        batch_queue_size: 32,
    };
    let paths: Vec<&str> = options
        .files
        .iter()
        .map(|file| file.to_str().ok_or("chemin non UTF-8"))
        .collect::<Result<_, _>>()?;
    match options.format {
        Format::Viri => {
            let loader = ViriBinpackLoader::new_interleave_multiple(
                &paths,
                options.buffer_mb,
                options.threads,
                ViriFilter::Builtin(Filter::default()),
            );
            trainer.run(&schedule, &settings, &loader);
        }
        Format::Binpack => {
            let loader = SfBinpackLoader::new_concat_multiple(
                &paths,
                options.buffer_mb,
                options.threads,
                keep_binpack,
            );
            trainer.run(&schedule, &settings, &loader);
        }
    }

    // ---- 3. Confronter le moteur à l'entraîneur.
    println!("== 3. Le moteur contre l'entraîneur ==");
    let quantised = format!(
        "{}/{}-{}/quantised.bin",
        options.output,
        net_id(),
        options.superbatches
    );
    let bytes = std::fs::read(&quantised).map_err(|e| format!("{quantised} : {e}"))?;
    let network =
        Network::from_bytes(&bytes).map_err(|e| format!("le moteur refuse {quantised} : {e}"))?;
    let mut gaps = Vec::new();
    for fen in FENS {
        let board: Board = fen.parse().map_err(|e| format!("{fen} : {e:?}"))?;
        let engine = network.evaluate(&network.refresh(&board), board.side_to_move());
        let trainer_cp = (SCALE as f32 * trainer.eval(fen)).round() as i32;
        let gap = (engine - trainer_cp).abs();
        println!("  {engine:>6}  {trainer_cp:>6}  écart {gap:>4}   {fen}");
        gaps.push(gap);
    }
    gaps.sort_unstable();
    let median = gaps[gaps.len() / 2];
    let max = gaps[gaps.len() - 1];
    println!("  écart médian {median} (admis {MEDIAN_GAP}), maximal {max} (admis {MAX_GAP})");
    if median > MEDIAN_GAP || max > MAX_GAP {
        return Err(format!(
            "le moteur n'évalue pas comme l'entraîneur — {quantised} NE DOIT PAS être mesuré"
        ));
    }
    println!("RÉSEAU PRÊT : {quantised} ({} octets)", bytes.len());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use bullet_trainer::reader::DataReader;
    use sfbinpack::CompressedTrainingDataEntryWriter;
    use sfbinpack::chess::color::Color;
    use sfbinpack::chess::coords::Square;
    use sfbinpack::chess::r#move::Move;
    use sfbinpack::chess::piece::Piece;
    use sfbinpack::chess::position::Position;

    /// Blancs au trait, hors échec : 1. e4 e5 2. Cf3 Cc6.
    const CALME: &str = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
    /// Noirs au trait, en échec par le fou de b5 : d7 a quitté la diagonale.
    const EN_ECHEC: &str = "rnbqkbnr/ppp2ppp/3p4/1B2p3/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 3";

    fn entry(fen: &str, mv: (&str, &str, MoveType), ply: u16, score: i16) -> TrainingDataEntry {
        let square = |name: &str| Square::from_string(name).unwrap();
        let promoted = if mv.2 == MoveType::Promotion {
            Piece::new(PieceType::Queen, Color::White)
        } else {
            Piece::none()
        };
        TrainingDataEntry {
            pos: Position::from_fen(fen).unwrap(),
            mv: Move::new(square(mv.0), square(mv.1), mv.2, promoted),
            score,
            ply,
            result: 1,
        }
    }

    #[test]
    fn le_filtre_des_binpacks_ne_garde_que_les_positions_calmes() {
        let quiet = ("f1", "c4", MoveType::Normal);
        // Témoin : un coup tranquille au vingtième demi-coup, hors échec.
        assert!(keep_binpack(&entry(CALME, quiet, 20, 35)));
        assert!(keep_binpack(&entry(CALME, quiet, 16, 10_000)));
        // Avant le seizième demi-coup, et les scores de mat.
        assert!(!keep_binpack(&entry(CALME, quiet, 15, 35)));
        assert!(!keep_binpack(&entry(CALME, quiet, 20, 10_001)));
        assert!(!keep_binpack(&entry(CALME, quiet, 20, -10_001)));
        // Une prise : le cavalier prend e5.
        assert!(!keep_binpack(&entry(
            CALME,
            ("f3", "e5", MoveType::Normal),
            20,
            35
        )));
        // Le trait en échec, même pour un coup tranquille.
        assert!(!keep_binpack(&entry(
            EN_ECHEC,
            ("c7", "c6", MoveType::Normal),
            20,
            35
        )));
        // Roque, prise en passant, promotion : pas des coups « normaux ».
        let roque = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
        assert!(!keep_binpack(&entry(
            roque,
            ("e1", "h1", MoveType::Castle),
            20,
            35
        )));
        let passant = "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3";
        assert!(!keep_binpack(&entry(
            passant,
            ("e5", "f6", MoveType::EnPassant),
            20,
            35
        )));
        let promotion = "8/P6k/8/8/8/8/8/K7 w - - 0 1";
        assert!(!keep_binpack(&entry(
            promotion,
            ("a7", "a8", MoveType::Promotion),
            20,
            35
        )));
    }

    #[test]
    fn un_seul_format_par_entrainement() {
        let files = |names: &[&str]| names.iter().map(PathBuf::from).collect::<Vec<_>>();
        assert_eq!(common_format(&files(&["a.vf", "b.vf"])), Ok(Format::Viri));
        assert_eq!(common_format(&files(&["a.binpack"])), Ok(Format::Binpack));
        assert!(common_format(&files(&["a.vf", "b.binpack"])).is_err());
        assert!(common_format(&files(&["a.binpack", "b.txt"])).is_err());
        assert!(common_format(&[]).is_err());
        // Et chacun sa sigmoïde.
        assert_eq!(Format::Viri.eval_scale(), SCALE as f32);
        assert_eq!(Format::Binpack.eval_scale(), LEELA_SCALE);
        // --attendu compte des parties .vf : sur un binpack, il se refuse.
        let args = |list: &[&str]| list.iter().map(|arg| (*arg).to_owned()).collect::<Vec<_>>();
        assert!(parse_options(&args(&["--attendu", "1:2", "x.binpack"])).is_err());
        assert!(parse_options(&args(&["--attendu", "1:2", "x.vf"])).is_ok());
    }

    /// Des résultats tirés, en proportions exactes, d'une sigmoïde d'échelle
    /// connue : l'ajustement doit la retrouver.
    fn sample_at_scale(scale: f64) -> Vec<(i16, f32)> {
        let mut sample = Vec::new();
        for score in (-1_000..=1_000).step_by(20) {
            let expected = 1.0 / (1.0 + (-f64::from(score) / scale).exp());
            let wins = (expected * 1_000.0).round() as usize;
            sample.extend(std::iter::repeat_n((score as i16, 1.0), wins));
            sample.extend(std::iter::repeat_n((score as i16, 0.0), 1_000 - wins));
        }
        sample
    }

    #[test]
    fn l_ajustement_retrouve_l_echelle_des_donnees() {
        for scale in [LEELA_SCALE as f64, 400.0, 150.0] {
            let fitted = f64::from(fit_scale(&sample_at_scale(scale)));
            assert!(
                (fitted / scale - 1.0).abs() < 0.02,
                "{scale} ajusté à {fitted}"
            );
        }
    }

    #[test]
    fn une_echelle_a_plus_d_un_facteur_deux_de_celle_de_leela_se_refuse() {
        assert!(check_scale(LEELA_SCALE).is_ok());
        assert!(check_scale(LEELA_SCALE / 2.0).is_ok());
        assert!(check_scale(LEELA_SCALE * 2.0).is_ok());
        assert!(check_scale(LEELA_SCALE / 2.0 - 1.0).is_err());
        assert!(check_scale(LEELA_SCALE * 2.0 + 1.0).is_err());
    }

    /// Un binpack de 300 positions, une sur deux gardée par le filtre ; les
    /// gardées ont des scores de 100 à 249, les écartées −500.
    fn write_binpack(path: &Path) -> Vec<TrainingDataEntry> {
        let mut entries = Vec::new();
        for i in 0..150i16 {
            let mut kept = entry(CALME, ("f1", "c4", MoveType::Normal), 20, 100 + i);
            kept.result = i % 3 - 1;
            entries.push(kept);
            entries.push(entry(CALME, ("f3", "e5", MoveType::Normal), 20, -500));
        }
        let mut writer =
            CompressedTrainingDataEntryWriter::new(File::create(path).unwrap()).unwrap();
        for entry in &entries {
            writer.write_entry(entry).unwrap();
        }
        writer.flush_and_end();
        drop(writer);
        entries
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nnue-train-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn un_binpack_se_relit_jusqu_au_bout_et_un_fichier_tronque_se_refuse() {
        let dir = scratch("releve");
        let path = dir.join("essai.binpack");
        write_binpack(&path);
        let bytes = std::fs::read(&path).unwrap();

        let mut sample = Vec::new();
        let survey = survey_binpack(&path, &mut sample, usize::MAX).unwrap();
        assert_eq!(survey.bytes, bytes.len() as u64);
        assert!(survey.chunks >= 1);
        assert_eq!(survey.decoded, 300);
        assert_eq!(sample.len(), 150);
        // Le résultat, du point de vue du trait : −1, 0, 1 → 0, ½, 1.
        assert_eq!(sample[0], (100, 0.0));
        assert_eq!(sample[1], (101, 0.5));
        assert_eq!(sample[2], (102, 1.0));

        // L'échantillon s'arrête à sa limite, la relecture non.
        let mut short = Vec::new();
        let limited = survey_binpack(&path, &mut short, 10).unwrap();
        assert_eq!(short.len(), 10);
        assert_eq!(
            (limited.bytes, limited.chunks),
            (survey.bytes, survey.chunks)
        );

        // Tronqué de quelques octets : refusé.
        let truncated = dir.join("tronque.binpack");
        std::fs::write(&truncated, &bytes[..bytes.len() - 7]).unwrap();
        assert!(survey_binpack(&truncated, &mut Vec::new(), usize::MAX).is_err());
        // Suivi de quelques octets qui ne font pas un bloc : refusé aussi.
        let trailing = dir.join("queue.binpack");
        std::fs::write(&trailing, [&bytes[..], &[1, 2, 3]].concat()).unwrap();
        assert!(survey_binpack(&trailing, &mut Vec::new(), usize::MAX).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn le_chargeur_de_bullet_lit_nos_binpacks_a_travers_notre_filtre() {
        let dir = scratch("chargeur");
        let path = dir.join("essai.binpack");
        let entries = write_binpack(&path);
        let loader = SfBinpackLoader::new(path.to_str().unwrap(), 1, 1, keep_binpack);
        let mut boards = Vec::new();
        // Le chargeur boucle sur ses fichiers : un tampon plein suffit.
        loader.read_chunks(0, |buffer| {
            boards.extend_from_slice(buffer);
            true
        });
        assert!(!boards.is_empty());
        for board in &boards {
            // Seules les positions gardées, et leur résultat du point de vue
            // du trait — celui que bullet attend.
            let kept = entries
                .iter()
                .find(|entry| entry.score == board.score)
                .expect("un score qui n'était pas dans le fichier");
            assert!(
                keep_binpack(kept),
                "score {} : position écartée par le filtre",
                board.score
            );
            assert_eq!(i16::from(board.result), 1 + kept.result);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
