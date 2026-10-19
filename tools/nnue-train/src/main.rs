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
//!    Leela. **Au pas plein par défaut, il ré-entraîne plus qu'il n'affine**
//!    : N2L et N4L finissaient à la perte de L0 (`tools/README.md`, n° 20) ;
//!    `--pas` réduit le pas de départ, pour un vrai réglage fin. `--wdl` règle
//!    le poids du résultat de la partie dans la cible, 0,75 depuis le premier
//!    réseau sans avoir jamais été mesuré.
//! 3. **Confronter** le réseau quantifié, rechargé par le chargeur du moteur,
//!    à ce que l'entraîneur lui-même en dit, position par position. C'est la
//!    seule vérification de bout en bout que les entrées du moteur sont
//!    celles de l'entraînement : un réseau mal indexé ne fait rien planter,
//!    il joue mal.
//!
//! ```text
//! cargo run --release --features cuda -- [--attendu P:N] [--superlots 40]
//!     [--sortie checkpoints] [--memoire 1024] [--fils 4] [--depuis DOSSIER]
//!     [--pas 0.001] [--wdl 0.75] [--melange PART] DOSSIER_OU_FICHIER...
//! ```
//!
//! Un dossier donne tous ses fichiers `.vf` et `.binpack`, triés par nom.
//! **Les deux formats ne se mélangent que sur demande** : leurs scores n'ont
//! pas la même échelle ([`Format::eval_scale`]), et un mélange par mégarde
//! fausserait la cible. `--melange PART` les mêle (n° 20, (b)) : PART des
//! positions vues viennent des binpacks, ramenées à notre échelle
//! ([`MixedReader`]).

use std::fs::File;
use std::io::{BufReader, Seek};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::mpsc;

use bullet_lib::game::formats::bulletformat::ChessBoard;
use bullet_lib::game::inputs::{Chess768, ChessBucketsMirrored, SparseInputType};
use bullet_lib::game::outputs::MaterialCount;
use bullet_lib::nn::optimiser::{AdamW, AdamWParams};
use bullet_lib::nn::{InitSettings, Shape};
use bullet_lib::trainer::save::SavedFormat;
use bullet_lib::trainer::schedule::{TrainingSchedule, TrainingSteps, lr, wdl};
use bullet_lib::trainer::settings::LocalSettings;
use bullet_lib::value::ValueTrainerBuilder;
use bullet_lib::value::loader::sfbinpack::{MoveType, PieceType, TrainingDataEntry};
use bullet_lib::value::loader::viribinpack::{Filter, Game};
use bullet_lib::value::loader::{SfBinpackLoader, ViriBinpackLoader, ViriFilter};
use bullet_trainer::reader::DataReader;
use cozy_chess::Board;
use sfbinpack::{ChunkReader, read_chunk_into};
use shallowred::nnue::{ARCH, HIDDEN, Network, QA, QB, SCALE};

/// Identifiant des points de sauvegarde : `<sortie>/<identifiant>-<superlot>/`.
/// Tiré de l'architecture du MOTEUR : un réseau plus large, ou à seaux, ne
/// peut pas porter le nom de celui qu'il doit battre. Sans seaux, le nom
/// d'avant le n° 17 : `shallowred-768x128`.
fn net_id() -> String {
    let mut id = match ARCH.king_buckets {
        None => format!("shallowred-768x{HIDDEN}"),
        Some(_) => format!("shallowred-768x{}hm-{HIDDEN}", ARCH.input_buckets()),
    };
    if ARCH.output_buckets > 1 {
        id.push_str(&format!("-s{}", ARCH.output_buckets));
    }
    id
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

/// Les deux formats que le programme sait lire, et leur mélange.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Format {
    /// `viriformat`, `.vf` : nos données, de `nnue-datagen`.
    Viri,
    /// Le binpack de Stockfish, `.binpack` : les données de Leela Chess Zero
    /// converties (`tools/README.md`, n° 7, levier 4).
    Binpack,
    /// Les deux, par `--melange` : les scores des binpacks ramenés à la nôtre.
    /// Jamais le format d'un fichier.
    Mixed,
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
            Self::Viri | Self::Mixed => SCALE as f32,
            Self::Binpack => LEELA_SCALE,
        }
    }
}

/// Un score de binpack de Leela, ramené à l'échelle de nos données : la même
/// espérance, `sigmoid(score / LEELA_SCALE) = sigmoid(ramené / SCALE)`. Le
/// filtre des binpacks écarte les scores au-delà de ±10 000, donc ±12 110 au
/// plus : un `i16` les tient ; la saturation n'est qu'une garde.
fn to_our_scale(score: i16) -> i16 {
    let scaled = (f32::from(score) * SCALE as f32 / LEELA_SCALE).round();
    scaled.clamp(f32::from(i16::MIN), f32::from(i16::MAX)) as i16
}

/// Taille des tranches qu'un mélange rend à l'entraîneur — qui les recoupe en
/// lots de 16 384 : la proportion y est exacte à une position près.
const MIXED_SLICE: usize = 1 << 20;

/// Nos données et celles de Leela dans le MÊME entraînement (n° 20, (b)) :
/// bullet n'a pas de chargeur mixte. Deux chargeurs tournent chacun dans son
/// fil — chacun mélange déjà son tampon —, et leurs positions s'entrelacent
/// à proportion exacte : la `k`-ième position vient de Leela tant que Leela
/// en a fourni moins de `leela_share × k`. Un lot de 16 384 porte donc la
/// part demandée, jamais une alternance de longues séries d'une seule
/// source, qui ferait osciller le gradient. Les scores de Leela passent par
/// [`to_our_scale`] : la cible se lit à [`SCALE`], une seule sigmoïde.
#[derive(Clone)]
struct MixedReader<A, B> {
    ours: A,
    leela: B,
    /// La part des positions tirées de Leela, dans ]0 ; 1[.
    leela_share: f64,
    slice: usize,
}

/// Lance `reader` dans son propre fil ; ses tampons arrivent par le canal.
/// Quand le récepteur tombe, l'envoi échoue et le chargeur s'arrête de
/// lui-même — c'est ainsi que les chargeurs de bullet s'arrêtent.
fn spawn_source<R: DataReader<ChessBoard>>(reader: R) -> mpsc::Receiver<Vec<ChessBoard>> {
    let (sender, receiver) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        reader.read_chunks(0, |chunk| sender.send(chunk.to_vec()).is_err());
    });
    receiver
}

/// La position suivante d'une source, tampon par tampon ; `None` si elle
/// s'est tue — un chargeur de bullet boucle sur ses fichiers et ne se tait
/// pas, mais un fil mort ne doit pas faire boucler le mélange.
struct Source {
    receiver: mpsc::Receiver<Vec<ChessBoard>>,
    buffer: Vec<ChessBoard>,
    next: usize,
}

impl Source {
    fn new(receiver: mpsc::Receiver<Vec<ChessBoard>>) -> Self {
        Self {
            receiver,
            buffer: Vec::new(),
            next: 0,
        }
    }

    fn pop(&mut self) -> Option<ChessBoard> {
        while self.next == self.buffer.len() {
            self.buffer = self.receiver.recv().ok()?;
            self.next = 0;
        }
        self.next += 1;
        Some(self.buffer[self.next - 1])
    }
}

impl<A, B> DataReader<ChessBoard> for MixedReader<A, B>
where
    A: DataReader<ChessBoard>,
    B: DataReader<ChessBoard>,
{
    // `skip_count` sert à reprendre un entraînement au milieu de ses données ;
    // nos entraînements partent du premier superlot, et les chargeurs de
    // binpack de bullet l'ignorent déjà.
    fn read_chunks<F: FnMut(&[ChessBoard]) -> bool>(&self, _skip_count: usize, mut f: F) {
        let mut ours = Source::new(spawn_source(self.ours.clone()));
        let mut leela = Source::new(spawn_source(self.leela.clone()));
        let (mut taken, mut from_leela) = (0u64, 0u64);
        let mut slice = Vec::with_capacity(self.slice);
        loop {
            taken += 1;
            let board = if (from_leela as f64) < self.leela_share * taken as f64 {
                from_leela += 1;
                leela.pop().map(|mut board| {
                    board.score = to_our_scale(board.score);
                    board
                })
            } else {
                ours.pop()
            };
            let Some(board) = board else { return };
            slice.push(board);
            if slice.len() == self.slice {
                if f(&slice) {
                    return;
                }
                slice.clear();
            }
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
    // Des rois sur d'autres seaux et de l'autre côté — grands roques, rois
    // centraux, coins —, et de 2 à 32 pièces : de quoi éprouver les seaux de
    // roi et de sortie (n° 17).
    "2kr3r/ppp2ppp/2n5/8/8/2N5/PPP2PPP/2KR3R w - - 0 12",
    "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7",
    "8/8/4k3/3p4/3P4/4K3/8/8 w - - 0 1",
    "4k3/8/8/2K5/8/8/8/R7 w - - 0 1",
    "8/8/3k4/8/3K4/8/8/8 w - - 0 1",
    "1k6/8/8/8/8/8/8/K7 b - - 0 1",
];

/// L'écart médian admis entre le moteur et l'entraîneur, en centièmes —
/// écrit AVANT le premier entraînement. La quantification arrondit chaque
/// poids de la couche cachée à 1/255 et chaque poids de sortie à 1/64 :
/// estimé à la main, l'écart typique vaut une dizaine de centièmes. Un
/// réseau mal indexé, lui, s'écarte de l'ordre de l'évaluation elle-même.
const MEDIAN_GAP: i32 = 15;
/// L'écart maximal admis, sur les positions de [`FENS`].
const MAX_GAP: i32 = 50;

/// Le pas de départ de la décroissance en cosinus, celui de l'exemple de
/// bullet que suivent tous nos réseaux. Le pas final en vaut 0,3⁵.
const INITIAL_LR: f32 = 0.001;
/// Le poids du résultat de la partie dans la cible, le reste allant à
/// `sigmoid(score / échelle)` : celui de l'exemple, jamais mesuré ici.
const WDL: f32 = 0.75;

/// Les réglages lus sur la ligne de commande.
struct Options {
    expected: Option<(u64, u64)>,
    superbatches: usize,
    output: String,
    buffer_mb: usize,
    threads: usize,
    resume: Option<PathBuf>,
    initial_lr: f32,
    wdl: f32,
    /// `--melange` : la part de Leela, si les deux formats se mêlent.
    leela_share: Option<f64>,
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
        initial_lr: INITIAL_LR,
        wdl: WDL,
        leela_share: None,
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
            "--pas" => {
                let lr: f32 = value("--pas")?
                    .parse()
                    .map_err(|_| "--pas attend un nombre")?;
                // Au-dessus de dix fois le pas de l'exemple, une faute de
                // frappe plutôt qu'un réglage ; un NaN échoue à la comparaison.
                if !(lr > 0.0 && lr <= 10.0 * INITIAL_LR) {
                    return Err(format!("--pas {lr} : hors de ]0 ; {}]", 10.0 * INITIAL_LR));
                }
                options.initial_lr = lr;
            }
            "--wdl" => {
                let wdl: f32 = value("--wdl")?
                    .parse()
                    .map_err(|_| "--wdl attend un nombre")?;
                if !(0.0..=1.0).contains(&wdl) {
                    return Err(format!("--wdl {wdl} : hors de [0 ; 1]"));
                }
                options.wdl = wdl;
            }
            "--melange" => {
                let share: f64 = value("--melange")?
                    .parse()
                    .map_err(|_| "--melange attend la part de Leela, un nombre")?;
                // Aux bornes, ce ne serait plus un mélange : un seul format suffit.
                if !(share > 0.0 && share < 1.0) {
                    return Err(format!("--melange {share} : hors de ]0 ; 1["));
                }
                options.leela_share = Some(share);
            }
            path => options.files.extend(data_files(Path::new(path))?),
        }
    }
    options.format = data_format(&options.files, options.leela_share)?;
    if options.format == Format::Binpack && options.expected.is_some() {
        return Err(
            "--attendu compte nos parties .vf ; un binpack n'a pas de compte attendu".into(),
        );
    }
    Ok(options)
}

/// Le format de l'entraînement. Un seul format sans `--melange` — deux
/// échelles de scores mêlées par mégarde fausseraient la cible ; les deux
/// avec, et seulement les deux.
fn data_format(files: &[PathBuf], leela_share: Option<f64>) -> Result<Format, String> {
    if files.is_empty() {
        return Err("aucun fichier de données".into());
    }
    let (mut viri, mut binpack) = (false, false);
    for file in files {
        match Format::of(file) {
            Some(Format::Viri) => viri = true,
            Some(Format::Binpack) => binpack = true,
            _ => return Err(format!("{} : ni .vf ni .binpack", file.display())),
        }
    }
    match (viri, binpack, leela_share) {
        (true, false, None) => Ok(Format::Viri),
        (false, true, None) => Ok(Format::Binpack),
        (true, true, Some(_)) => Ok(Format::Mixed),
        (true, true, None) => Err(
            "des .vf et des .binpack mêlés : un format par entraînement, ou --melange PART".into(),
        ),
        _ => Err("--melange demande des .vf ET des .binpack".into()),
    }
}

/// Les chemins tels que les chargeurs de bullet les prennent.
fn utf8<'a>(files: &[&'a Path]) -> Result<Vec<&'a str>, String> {
    files
        .iter()
        .map(|file| file.to_str().ok_or_else(|| "chemin non UTF-8".to_owned()))
        .collect()
}

/// Les fichiers de nos données, puis ceux de Leela.
fn split_by_format(files: &[PathBuf]) -> (Vec<&Path>, Vec<&Path>) {
    let of = |wanted| {
        files
            .iter()
            .filter(|file| Format::of(file) == Some(wanted))
            .map(PathBuf::as_path)
            .collect()
    };
    (of(Format::Viri), of(Format::Binpack))
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
    let (viri, binpacks) = split_by_format(&options.files);
    if !viri.is_empty() {
        reread_viri(&viri, options.expected)?;
    }
    if !binpacks.is_empty() {
        reread_binpacks(&binpacks)?;
    }

    // ---- 2 et 3. Entraîner, puis confronter le moteur à l'entraîneur, sur
    // les entrées de l'architecture du moteur : `Chess768` sans seaux de roi,
    // `ChessBucketsMirrored` avec (n° 17).
    match ARCH.king_buckets {
        None => train_and_check(Chess768, &options),
        Some(layout) => {
            train_and_check(ChessBucketsMirrored::new(layout.map(usize::from)), &options)
        }
    }
}

/// Relit nos fichiers jusqu'au dernier octet, et confronte leurs comptes à
/// `--attendu` s'il est donné.
fn reread_viri(files: &[&Path], expected: Option<(u64, u64)>) -> Result<(), String> {
    let (mut games, mut positions) = (0u64, 0u64);
    for file in files {
        let (g, p) = count(file)?;
        println!("  {}  {g} parties  {p} positions", file.display());
        games += g;
        positions += p;
    }
    println!("  total : {games} parties, {positions} positions");
    if let Some((expected_games, expected_positions)) = expected
        && (games, positions) != (expected_games, expected_positions)
    {
        return Err(format!(
            "les données ne retombent pas sur les résumés : {games}:{positions} lus, \
             {expected_games}:{expected_positions} attendus"
        ));
    }
    Ok(())
}

/// Relit les binpacks bloc par bloc, et refuse une échelle de scores qui
/// n'est pas celle de Leela.
fn reread_binpacks(files: &[&Path]) -> Result<(), String> {
    let mut sample = Vec::new();
    let mut decoded = 0u64;
    for file in files {
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
    Ok(())
}

/// La recette de l'entraînement, hors du GPU pour qu'un test la lise : la
/// décroissance en cosinus de `--pas` à `--pas × 0,3⁵`, et le poids `--wdl`
/// du résultat dans la cible.
fn schedule(options: &Options) -> TrainingSchedule<lr::CosineDecayLR, wdl::ConstantWDL> {
    TrainingSchedule {
        net_id: net_id(),
        eval_scale: options.format.eval_scale(),
        steps: TrainingSteps {
            batch_size: 16_384,
            batches_per_superbatch: 6104,
            start_superbatch: 1,
            end_superbatch: options.superbatches,
        },
        wdl_scheduler: wdl::ConstantWDL { value: options.wdl },
        lr_scheduler: lr::CosineDecayLR {
            initial_lr: options.initial_lr,
            final_lr: options.initial_lr * 0.3f32.powi(5),
            final_superbatch: options.superbatches,
        },
        save_rate: 10,
    }
}

/// Entraîne un réseau de l'architecture du moteur sur les entrées `inputs`,
/// puis confronte le moteur à l'entraîneur.
fn train_and_check<I>(inputs: I, options: &Options) -> Result<(), String>
where
    I: SparseInputType<RequiredDataType = ChessBoard>,
{
    println!("== 2. Entraînement ==");
    let qa = i16::try_from(QA).map_err(|_| "QA hors d'un i16")?;
    let qb = i16::try_from(QB).map_err(|_| "QB hors d'un i16")?;
    let qab = i16::try_from(QA * QB).map_err(|_| "QA × QB hors d'un i16")?;
    let buckets = ARCH.input_buckets();
    // Le factoriseur — 768 × largeur poids communs à tous les seaux de roi —
    // n'existe qu'avec des seaux : il partage entre eux ce que chacun voit
    // trop peu, et s'ajoute à chacun au moment d'écrire le fichier, si bien
    // que le moteur n'en voit rien (`examples/progression/3_input_buckets.rs`
    // au commit épinglé).
    let feature_weights = if buckets > 1 {
        SavedFormat::id("l0w").transform(move |store, weights| {
            let factoriser = store.get("l0f").values.f32().repeat(buckets);
            weights
                .into_iter()
                .zip(factoriser)
                .map(|(a, b)| a + b)
                .collect()
        })
    } else {
        SavedFormat::id("l0w")
    };
    let mut trainer = ValueTrainerBuilder::default()
        .dual_perspective()
        .optimiser(AdamW)
        .inputs(inputs)
        .output_buckets(MaterialCount::<{ ARCH.output_buckets }>)
        .save_format(&[
            feature_weights.round().quantise::<i16>(qa),
            SavedFormat::id("l0b").round().quantise::<i16>(qa),
            // Seau de sortie par seau de sortie, `2 × HIDDEN` poids chacun :
            // la transposée de la matrice de bullet — l'identité à un seul
            // seau.
            SavedFormat::id("l1w")
                .round()
                .quantise::<i16>(qb)
                .transpose(),
            SavedFormat::id("l1b").round().quantise::<i16>(qab),
        ])
        .loss_fn(|output, target| output.sigmoid().squared_error(target))
        .build(|builder, stm_inputs, ntm_inputs, output_buckets| {
            let mut l0 = builder.new_affine("l0", 768 * buckets, HIDDEN);
            if buckets > 1 {
                let l0f = builder.new_weights("l0f", Shape::new(HIDDEN, 768), InitSettings::Zeroed);
                l0.weights = l0.weights + l0f.repeat(buckets);
            }
            let l1 = builder.new_affine("l1", 2 * HIDDEN, ARCH.output_buckets);
            let stm_hidden = l0.forward(stm_inputs).screlu();
            let ntm_hidden = l0.forward(ntm_inputs).screlu();
            l1.forward(stm_hidden.concat(ntm_hidden))
                .select(output_buckets)
        });
    if buckets > 1 {
        // La couche d'entrée et le factoriseur bornés chacun à ±0,99 : leur
        // somme reste dans les ±1,98 que la borne d'accumulateur du chargeur
        // suppose, comme l'exemple.
        let stricter = AdamWParams {
            max_weight: 0.99,
            min_weight: -0.99,
            ..Default::default()
        };
        trainer.optimiser.set_params_for_weight("l0w", stricter);
        trainer.optimiser.set_params_for_weight("l0f", stricter);
    }

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

    let schedule = schedule(options);
    // Imprimés pour que la sortie gardée de chaque entraînement dise sa recette.
    println!(
        "  {} superlots, pas {} → {:e}, wdl {}",
        options.superbatches,
        schedule.lr_scheduler.initial_lr,
        schedule.lr_scheduler.final_lr,
        schedule.wdl_scheduler.value
    );
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
        Format::Mixed => {
            let leela_share = options.leela_share.ok_or("un mélange sans --melange")?;
            let (viri, binpacks) = split_by_format(&options.files);
            let (viri, binpacks) = (utf8(&viri)?, utf8(&binpacks)?);
            println!(
                "  mélange : {:.1} % des positions tirées de Leela, ses scores × {:.4}",
                100.0 * leela_share,
                SCALE as f32 / LEELA_SCALE
            );
            // La mémoire de `--memoire` partagée entre les deux chargeurs.
            let reader = MixedReader {
                ours: ViriBinpackLoader::new_interleave_multiple(
                    &viri,
                    options.buffer_mb / 2,
                    options.threads,
                    ViriFilter::Builtin(Filter::default()),
                ),
                leela: SfBinpackLoader::new_concat_multiple(
                    &binpacks,
                    options.buffer_mb / 2,
                    options.threads,
                    keep_binpack,
                ),
                leela_share,
                slice: MIXED_SLICE,
            };
            trainer.run(&schedule, &settings, &reader);
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
        let engine = network.evaluate(&network.refresh(&board), &board);
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

    /// Les entrées et le seau de sortie du moteur, à seaux, confrontés au
    /// CODE de bullet : `ChessBucketsMirrored::map_features` et
    /// `MaterialCount::bucket` eux-mêmes, sur des positions de parties au
    /// hasard passées par la chaîne de l'entraîneur — `viriformat` puis
    /// `bulletformat`, qui retourne l'échiquier quand les Noirs ont le trait.
    /// Une case retournée d'un seul côté ne ferait rien planter : elle
    /// entraînerait un réseau sur d'autres positions que celles que le moteur
    /// lui montrera (n° 17). Les deux dispositions de la séance, celles que
    /// le moteur publie.
    #[test]
    fn les_seaux_du_moteur_sont_ceux_de_bullet() {
        use bullet_lib::game::formats::viriformat::chess::board::Board as VfBoard;
        use bullet_lib::game::outputs::OutputBuckets;
        use cozy_chess::{Color as CColor, Piece as CPiece};
        use shallowred::nnue::{Arch, KING_BUCKETS_4, KING_BUCKETS_10};

        for layout in [KING_BUCKETS_4, KING_BUCKETS_10] {
            let arch = Arch {
                king_buckets: Some(layout),
                output_buckets: 8,
            };
            let inputs = ChessBucketsMirrored::new(layout.map(usize::from));

            let (mut checked, mut black, mut mirrored) = (0, 0, 0);
            let mut buckets_seen = [false; 8];
            let mut state = 0x5EA0_0017_u64 | 1;
            for _ in 0..40 {
                let mut ours = Board::default();
                for _ in 0..160 {
                    let mut moves = Vec::new();
                    ours.generate_moves(|piece_moves| {
                        moves.extend(piece_moves);
                        false
                    });
                    if moves.is_empty() || ours.halfmove_clock() >= 100 {
                        break;
                    }
                    let mut theirs = VfBoard::new();
                    theirs.set_from_fen(&ours.to_string()).unwrap();
                    let position: ChessBoard = theirs.to_bulletformat(1, 0).unwrap();
                    let mut trainer = Vec::new();
                    inputs.map_features(&position, |stm, ntm| trainer.push((stm, ntm)));
                    trainer.sort_unstable();

                    let us = ours.side_to_move();
                    let mut engine = Vec::new();
                    for color in CColor::ALL {
                        for piece in CPiece::ALL {
                            for square in ours.colored_pieces(color, piece) {
                                engine.push((
                                    arch.feature(us, ours.king(us), color, piece, square),
                                    arch.feature(!us, ours.king(!us), color, piece, square),
                                ));
                            }
                        }
                    }
                    engine.sort_unstable();
                    assert_eq!(engine, trainer, "entrées, sur {ours}");

                    let bucket = usize::from(MaterialCount::<8>.bucket(&position));
                    assert_eq!(
                        arch.output_bucket(ours.occupied().len() as usize),
                        bucket,
                        "seau de sortie, sur {ours}"
                    );
                    buckets_seen[bucket] = true;
                    checked += 1;
                    black += usize::from(us == CColor::Black);
                    mirrored += usize::from(arch.king_key(us, ours.king(us)).1 == 7);

                    state ^= state << 13;
                    state ^= state >> 7;
                    state ^= state << 17;
                    ours.play_unchecked(moves[(state % moves.len() as u64) as usize]);
                }
            }
            assert!(
                checked >= 2_000 && black >= 1_000 && mirrored >= 500 && mirrored < checked,
                "positions {checked}, dont {black} aux Noirs et {mirrored} roi au trait en miroir"
            );
            assert!(
                buckets_seen.iter().filter(|&&seen| seen).count() >= 6,
                "seaux de sortie vus : {buckets_seen:?}"
            );
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
        assert_eq!(
            data_format(&files(&["a.vf", "b.vf"]), None),
            Ok(Format::Viri)
        );
        assert_eq!(
            data_format(&files(&["a.binpack"]), None),
            Ok(Format::Binpack)
        );
        assert!(data_format(&files(&["a.vf", "b.binpack"]), None).is_err());
        assert!(data_format(&files(&["a.binpack", "b.txt"]), None).is_err());
        assert!(data_format(&[], None).is_err());
        // Mêlés sur demande seulement, et seulement s'il y a les deux.
        let melange = Some(0.5);
        assert_eq!(
            data_format(&files(&["a.vf", "b.binpack"]), melange),
            Ok(Format::Mixed)
        );
        assert!(data_format(&files(&["a.vf", "b.vf"]), melange).is_err());
        assert!(data_format(&files(&["a.binpack"]), melange).is_err());
        assert!(data_format(&files(&["a.vf", "b.binpack", "c.txt"]), melange).is_err());
        assert_eq!(
            split_by_format(&files(&["b.binpack", "a.vf", "c.vf"])),
            (
                vec![Path::new("a.vf"), Path::new("c.vf")],
                vec![Path::new("b.binpack")]
            )
        );
        // Et chacun sa sigmoïde.
        assert_eq!(Format::Viri.eval_scale(), SCALE as f32);
        assert_eq!(Format::Binpack.eval_scale(), LEELA_SCALE);
        // Le mélange se lit à notre échelle : Leela y est ramenée.
        assert_eq!(Format::Mixed.eval_scale(), SCALE as f32);
        // --attendu compte des parties .vf : sur un binpack, il se refuse.
        let args = |list: &[&str]| list.iter().map(|arg| (*arg).to_owned()).collect::<Vec<_>>();
        assert!(parse_options(&args(&["--attendu", "1:2", "x.binpack"])).is_err());
        assert!(parse_options(&args(&["--attendu", "1:2", "x.vf"])).is_ok());
    }

    #[test]
    fn le_pas_et_le_poids_du_resultat_se_reglent_et_se_bornent() {
        let args = |list: &[&str]| list.iter().map(|arg| (*arg).to_owned()).collect::<Vec<_>>();
        // Sans option, la recette de tous nos réseaux.
        let defaut = parse_options(&args(&["x.vf"])).unwrap();
        assert_eq!((defaut.initial_lr, defaut.wdl), (0.001, 0.75));
        let regle =
            parse_options(&args(&["--pas", "0.0001", "--wdl", "0.3", "x.binpack"])).unwrap();
        assert_eq!((regle.initial_lr, regle.wdl), (0.0001, 0.3));
        // Et c'est bien ce que l'entraînement reçoit.
        let recette = schedule(&regle);
        assert_eq!(recette.lr_scheduler.initial_lr, 0.0001);
        assert_eq!(recette.lr_scheduler.final_lr, 0.0001 * 0.3f32.powi(5));
        assert_eq!(recette.wdl_scheduler.value, 0.3);
        assert_eq!(recette.eval_scale, LEELA_SCALE);
        let recette = schedule(&defaut);
        assert_eq!(recette.lr_scheduler.initial_lr, 0.001);
        assert_eq!(recette.wdl_scheduler.value, 0.75);
        assert_eq!(recette.eval_scale, SCALE as f32);
        // Les bornes elles-mêmes passent.
        assert!(parse_options(&args(&["--wdl", "0", "x.vf"])).is_ok());
        assert!(parse_options(&args(&["--wdl", "1", "x.vf"])).is_ok());
        assert!(parse_options(&args(&["--pas", "0.01", "x.vf"])).is_ok());
        for refus in [
            ["--pas", "0"],
            ["--pas", "-0.001"],
            ["--pas", "0.0101"],
            ["--pas", "NaN"],
            ["--pas", "un"],
            ["--wdl", "-0.01"],
            ["--wdl", "1.01"],
            ["--wdl", "NaN"],
        ] {
            let mut list = refus.to_vec();
            list.push("x.vf");
            assert!(
                parse_options(&args(&list)).is_err(),
                "{refus:?} devait se refuser"
            );
        }
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

    #[test]
    fn la_part_de_leela_se_borne() {
        let args = |list: &[&str]| list.iter().map(|arg| (*arg).to_owned()).collect::<Vec<_>>();
        let ok = parse_options(&args(&["--melange", "0.56", "a.vf", "b.binpack"])).unwrap();
        assert_eq!((ok.leela_share, ok.format), (Some(0.56), Format::Mixed));
        // --attendu compte nos .vf : il reste permis dans un mélange.
        assert!(
            parse_options(&args(&[
                "--attendu",
                "1:2",
                "--melange",
                "0.5",
                "a.vf",
                "b.binpack"
            ]))
            .is_ok()
        );
        for part in ["0", "1", "-0.1", "1.5", "NaN", "moitié"] {
            assert!(
                parse_options(&args(&["--melange", part, "a.vf", "b.binpack"])).is_err(),
                "--melange {part} devait se refuser"
            );
        }
    }

    #[test]
    fn un_score_de_leela_garde_son_esperance_a_notre_echelle() {
        assert_eq!(to_our_scale(0), 0);
        assert_eq!(to_our_scale(3303), 4000);
        assert_eq!(to_our_scale(-3303), -4000);
        // Arrondi, pas tronqué : 3 × 400 / 330,3 = 3,63.
        assert_eq!((to_our_scale(3), to_our_scale(-3)), (4, -4));
        // Le plus grand score que le filtre laisse passer tient dans un i16.
        assert_eq!(to_our_scale(10_000), 12_110);
        // Au-delà, la garde sature au lieu de déborder.
        assert_eq!(to_our_scale(i16::MAX), i16::MAX);
        assert_eq!(to_our_scale(i16::MIN), i16::MIN);
        // La même espérance des deux côtés.
        let expectation = |score: f32, scale: f32| 1.0 / (1.0 + (-score / scale).exp());
        for score in [-2000i16, -150, 37, 900] {
            let ours = expectation(f32::from(to_our_scale(score)), SCALE as f32);
            assert!((ours - expectation(f32::from(score), LEELA_SCALE)).abs() < 1e-3);
        }
    }

    /// Une source qui rend toujours le même tampon, comme un chargeur de
    /// bullet qui boucle sur un fichier.
    #[derive(Clone)]
    struct Repeat(Vec<ChessBoard>);

    impl DataReader<ChessBoard> for Repeat {
        fn read_chunks<F: FnMut(&[ChessBoard]) -> bool>(&self, _: usize, mut f: F) {
            while !f(&self.0) {}
        }
    }

    fn scored(score: i16) -> ChessBoard {
        ChessBoard {
            score,
            ..Default::default()
        }
    }

    #[test]
    fn le_melange_tient_sa_part_dans_chaque_tranche_et_rameme_leela_a_notre_echelle() {
        // Des tampons de tailles premières entre elles et avec la tranche :
        // la part ne doit rien devoir à un alignement.
        let reader = MixedReader {
            ours: Repeat(vec![scored(100); 7]),
            leela: Repeat(vec![scored(3303); 5]),
            leela_share: 0.25,
            slice: 1000,
        };
        let mut slices = 0;
        reader.read_chunks(0, |slice| {
            assert_eq!(slice.len(), 1000);
            let leela = slice.iter().filter(|board| board.score == 4000).count();
            let ours = slice.iter().filter(|board| board.score == 100).count();
            assert_eq!((leela, ours), (250, 750), "tranche {slices}");
            slices += 1;
            slices == 4
        });
        // Et la lecture s'arrête quand l'entraîneur le demande.
        assert_eq!(slices, 4);
        // Une part qui ne tombe pas juste : à une position près, à chaque
        // tranche, et jamais deux positions de Leela d'affilée sous 1/2.
        let reader = MixedReader {
            ours: Repeat(vec![scored(1); 3]),
            leela: Repeat(vec![scored(2); 11]),
            leela_share: 0.3,
            slice: 997,
        };
        let mut seen = (0u64, 0u64);
        reader.read_chunks(0, |slice| {
            for pair in slice.windows(2) {
                assert!(!(pair[0].score != 1 && pair[1].score != 1));
            }
            seen.0 += slice.iter().filter(|board| board.score != 1).count() as u64;
            seen.1 += slice.len() as u64;
            seen.1 >= 997 * 5
        });
        let expected = 0.3 * seen.1 as f64;
        assert!((seen.0 as f64 - expected).abs() <= 1.0, "{seen:?}");
    }

    #[test]
    fn le_melange_lit_les_binpacks_par_le_chargeur_de_bullet() {
        let dir = scratch("melange");
        let path = dir.join("essai.binpack");
        let entries = write_binpack(&path);
        let marker = i16::MIN + 7;
        let reader = MixedReader {
            ours: Repeat(vec![scored(marker); 13]),
            leela: SfBinpackLoader::new(path.to_str().unwrap(), 1, 1, keep_binpack),
            leela_share: 0.5,
            slice: 4096,
        };
        let mut boards = Vec::new();
        reader.read_chunks(0, |slice| {
            boards.extend_from_slice(slice);
            true
        });
        let leela: Vec<_> = boards
            .iter()
            .filter(|board| board.score != marker)
            .collect();
        assert_eq!(leela.len(), 2048);
        for board in leela {
            // Une position gardée du fichier, son score ramené à notre échelle.
            assert!(
                entries
                    .iter()
                    .any(|entry| keep_binpack(entry) && to_our_scale(entry.score) == board.score),
                "score {} : pas un score ramené du fichier",
                board.score
            );
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
