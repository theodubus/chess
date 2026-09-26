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
//!    `--attendu PARTIES:POSITIONS` fait refuser un écart.
//! 2. **Entraîner**, selon `examples/progression/1_simple.rs` de bullet au
//!    commit épinglé — le premier pas que bullet recommande —, sur les
//!    fichiers viriformat entrelacés, filtrés par le filtre par défaut de
//!    `viriformat`. L'architecture vient des constantes du MOTEUR : les
//!    changer d'un côté les change de l'autre.
//! 3. **Confronter** le réseau quantifié, rechargé par le chargeur du moteur,
//!    à ce que l'entraîneur lui-même en dit, position par position. C'est la
//!    seule vérification de bout en bout que les entrées du moteur sont
//!    celles de l'entraînement : un réseau mal indexé ne fait rien planter,
//!    il joue mal.
//!
//! ```text
//! cargo run --release --features cuda -- [--attendu P:N] [--superlots 40]
//!     [--sortie checkpoints] [--memoire 1024] [--fils 4] DOSSIER_OU_FICHIER...
//! ```
//!
//! Un dossier donne tous ses fichiers `.vf`, triés par nom.

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
use bullet_lib::value::loader::viribinpack::{Filter, Game};
use bullet_lib::value::loader::{ViriBinpackLoader, ViriFilter};
use cozy_chess::Board;
use shallowred::nnue::{HIDDEN, Network, QA, QB, SCALE};

/// Identifiant des points de sauvegarde : `<sortie>/<NET_ID>-<superlot>/`.
const NET_ID: &str = "shallowred-768x128";

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
    files: Vec<PathBuf>,
}

fn parse_options(args: &[String]) -> Result<Options, String> {
    let mut options = Options {
        expected: None,
        superbatches: 40,
        output: "checkpoints".to_owned(),
        buffer_mb: 1024,
        threads: 4,
        files: Vec::new(),
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
            path => options.files.extend(data_files(Path::new(path))?),
        }
    }
    if options.files.is_empty() {
        return Err("aucun fichier de données".to_owned());
    }
    Ok(options)
}

/// Un fichier, ou tous les `.vf` d'un dossier, triés par nom.
fn data_files(path: &Path) -> Result<Vec<PathBuf>, String> {
    if !path.is_dir() {
        return Ok(vec![path.to_owned()]);
    }
    let mut files: Vec<PathBuf> = std::fs::read_dir(path)
        .map_err(|e| format!("{} : {e}", path.display()))?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|file| file.extension().is_some_and(|ext| ext == "vf"))
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

    let initial_lr = 0.001;
    let schedule = TrainingSchedule {
        net_id: NET_ID.to_owned(),
        eval_scale: SCALE as f32,
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
    let loader = ViriBinpackLoader::new_interleave_multiple(
        &paths,
        options.buffer_mb,
        options.threads,
        ViriFilter::Builtin(Filter::default()),
    );
    trainer.run(&schedule, &settings, &loader);

    // ---- 3. Confronter le moteur à l'entraîneur.
    println!("== 3. Le moteur contre l'entraîneur ==");
    let quantised = format!(
        "{}/{NET_ID}-{}/quantised.bin",
        options.output, options.superbatches
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
