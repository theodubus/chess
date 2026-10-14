//! Le pilote du réglage automatique (n° 19) : SPSA par manches.
//!
//! # Ce qu'il fait, et ce qu'il ne fait pas
//!
//! Il tient l'état du réglage — les valeurs courantes des paramètres et le
//! compte des paires jouées —, tire les perturbations d'une manche, et met
//! l'état à jour à partir des résultats. Il ne joue AUCUNE partie : le
//! workflow `.github/workflows/spsa.yml` construit les binaires et fait
//! jouer fastchess ; ce binaire ne fait que l'arithmétique, ce qui la rend
//! testable — vérité terrain comprise, sur une fonction synthétique dont on
//! connaît l'optimum.
//!
//! # L'algorithme — SPSA de Spall, paramétré comme fishtest
//!
//! Pour chaque paramètre `i`, une perturbation de fin `c_fin` ; avec `N` les
//! paires prévues et `k` les paires déjà jouées :
//! - `c_k = c_fin · N^γ / (k + 1)^γ`, γ = 0,101 ;
//! - `a_k = r_fin · c_fin² · (A + N)^α / (A + k + 1)^α`, α = 0,602, `A = N/10` ;
//! - un job tire `Δ ∈ {−1, +1}ᵏ`, joue `θ + c·Δ` contre `θ − c·Δ` en paires
//!   d'ouvertures, et rend `V − D` du côté `+` ;
//! - l'agrégation fait, pour chaque job, `θᵢ += a_k / c_k · (V − D) · Δᵢ`,
//!   bornée à la plage.
//!
//! Une manche tire tous ses jobs au MÊME `θ` et au même `k` : c'est la
//! version par lots de la mise à jour paire par paire de fishtest, le prix
//! d'avoir des jobs parallèles sans état partagé.
//!
//! # Usage
//!
//! ```text
//! spsa tirer ETAT JOB DOSSIER        # écrit plus.env, moins.env, tirage.txt
//! spsa resultat JOURNAL DOSSIER      # lit le dernier « Wins, Losses, Draws »
//! spsa agreger ETAT SORTIE DOSSIER…  # met l'état à jour, imprime le bilan
//! ```
//!
//! L'état est un fichier texte, une ligne par réglage — il se lit dans un
//! résumé de workflow et se compare d'une manche à l'autre.

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

/// Un paramètre réglé : sa valeur courante — réelle, l'arrondi ne se fait
/// qu'au moment de construire un binaire —, sa plage et sa perturbation de
/// fin.
#[derive(Clone, Debug, PartialEq)]
struct Param {
    name: String,
    value: f64,
    min: i64,
    max: i64,
    c_end: f64,
}

/// L'état complet d'un réglage.
#[derive(Clone, Debug, PartialEq)]
struct State {
    planned_pairs: u64,
    played_pairs: u64,
    round: u64,
    alpha: f64,
    gamma: f64,
    a_fraction: f64,
    r_end: f64,
    params: Vec<Param>,
}

impl State {
    fn parse(text: &str) -> Result<Self, String> {
        let mut scalars: BTreeMap<&str, &str> = BTreeMap::new();
        let mut params = Vec::new();
        for (number, line) in text.lines().enumerate() {
            let line = line.split('#').next().unwrap_or("").trim();
            if line.is_empty() {
                continue;
            }
            let fields: Vec<&str> = line.split_whitespace().collect();
            match fields[..] {
                ["param", name, value, min, max, c_end] => {
                    let number = number + 1;
                    let param = Param {
                        name: name.to_owned(),
                        value: parse(value, number)?,
                        min: parse(min, number)?,
                        max: parse(max, number)?,
                        c_end: parse(c_end, number)?,
                    };
                    if param.min >= param.max || param.c_end <= 0.0 {
                        return Err(format!("ligne {number} : plage vide ou perturbation nulle"));
                    }
                    params.push(param);
                }
                [key, value] => {
                    scalars.insert(key, value);
                }
                _ => return Err(format!("ligne {} illisible : « {line} »", number + 1)),
            }
        }
        let scalar = |key: &str| -> Result<&str, String> {
            scalars
                .get(key)
                .copied()
                .ok_or_else(|| format!("« {key} » manque"))
        };
        if params.is_empty() {
            return Err("aucun paramètre".to_owned());
        }
        Ok(Self {
            planned_pairs: parse(scalar("paires_prevues")?, 0)?,
            played_pairs: parse(scalar("paires_faites")?, 0)?,
            round: parse(scalar("manche")?, 0)?,
            alpha: parse(scalar("alpha")?, 0)?,
            gamma: parse(scalar("gamma")?, 0)?,
            a_fraction: parse(scalar("a_frac")?, 0)?,
            r_end: parse(scalar("r_fin")?, 0)?,
            params,
        })
    }

    fn render(&self) -> String {
        let mut out = String::from("# réglage SPSA — n° 19 (tools/src/bin/spsa.rs)\n");
        let _ = writeln!(out, "paires_prevues {}", self.planned_pairs);
        let _ = writeln!(out, "paires_faites {}", self.played_pairs);
        let _ = writeln!(out, "manche {}", self.round);
        let _ = writeln!(out, "alpha {}", self.alpha);
        let _ = writeln!(out, "gamma {}", self.gamma);
        let _ = writeln!(out, "a_frac {}", self.a_fraction);
        let _ = writeln!(out, "r_fin {}", self.r_end);
        let _ = writeln!(out, "# param NOM valeur min max c_fin");
        for p in &self.params {
            let _ = writeln!(
                out,
                "param {} {} {} {} {}",
                p.name, p.value, p.min, p.max, p.c_end
            );
        }
        out
    }

    /// La perturbation du paramètre `p` à la paire `k`.
    fn c_k(&self, p: &Param, k: u64) -> f64 {
        let n = self.planned_pairs.max(1) as f64;
        p.c_end * n.powf(self.gamma) / (k as f64 + 1.0).powf(self.gamma)
    }

    /// Le pas du paramètre `p` à la paire `k`.
    fn a_k(&self, p: &Param, k: u64) -> f64 {
        let n = self.planned_pairs.max(1) as f64;
        let a = self.a_fraction * n;
        self.r_end * p.c_end * p.c_end * (a + n).powf(self.alpha)
            / (a + k as f64 + 1.0).powf(self.alpha)
    }
}

fn parse<T: std::str::FromStr>(text: &str, line: usize) -> Result<T, String> {
    text.parse()
        .map_err(|_| format!("ligne {line} : « {text} » n'est pas un nombre"))
}

/// Un générateur seedé — le même que la recherche n'emploie pas : celui-ci
/// tire des signes, et seul le déterminisme compte.
fn xorshift(state: &mut u64) -> u64 {
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    *state
}

/// Le tirage d'un job : ses signes, ses perturbations, et les deux valeurs
/// entières de chaque paramètre.
#[derive(Clone, Debug, PartialEq)]
struct Draw {
    round: u64,
    job: u64,
    k: u64,
    /// (nom, signe, c_k, valeur +, valeur −)
    rows: Vec<(String, i64, f64, i64, i64)>,
}

fn draw(state: &State, job: u64) -> Draw {
    // Impaire, donc jamais le point fixe zéro de xorshift.
    let mut seed =
        (state.round.wrapping_mul(1_000_003) ^ job.wrapping_mul(0x9E37_79B9_7F4A_7C15)) | 1;
    for _ in 0..8 {
        xorshift(&mut seed);
    }
    let rows = state
        .params
        .iter()
        .map(|p| {
            let sign = if xorshift(&mut seed) & 1 == 0 { 1 } else { -1 };
            let c = state.c_k(p, state.played_pairs);
            let shifted = |direction: f64| -> i64 {
                ((p.value + direction * c * sign as f64).round() as i64).clamp(p.min, p.max)
            };
            (p.name.clone(), sign, c, shifted(1.0), shifted(-1.0))
        })
        .collect();
    Draw {
        round: state.round,
        job,
        k: state.played_pairs,
        rows,
    }
}

impl Draw {
    fn render(&self) -> String {
        let mut out = format!("manche {}\njob {}\nk {}\n", self.round, self.job, self.k);
        for (name, sign, c, plus, minus) in &self.rows {
            let _ = writeln!(out, "tirage {name} {sign} {c} {plus} {minus}");
        }
        out
    }

    fn parse(text: &str) -> Result<Self, String> {
        let mut round = None;
        let mut job = None;
        let mut k = None;
        let mut rows = Vec::new();
        for line in text.lines() {
            let fields: Vec<&str> = line.split_whitespace().collect();
            match fields[..] {
                ["manche", v] => round = Some(parse(v, 0)?),
                ["job", v] => job = Some(parse(v, 0)?),
                ["k", v] => k = Some(parse(v, 0)?),
                ["tirage", name, sign, c, plus, minus] => rows.push((
                    name.to_owned(),
                    parse(sign, 0)?,
                    parse(c, 0)?,
                    parse(plus, 0)?,
                    parse(minus, 0)?,
                )),
                [] => {}
                _ => return Err(format!("tirage illisible : « {line} »")),
            }
        }
        Ok(Self {
            round: round.ok_or("tirage sans manche")?,
            job: job.ok_or("tirage sans job")?,
            k: k.ok_or("tirage sans k")?,
            rows,
        })
    }

    /// Les variables d'environnement d'un camp — celles que lit `reglage!`.
    fn env(&self, plus: bool) -> String {
        self.rows
            .iter()
            .map(|(name, _, _, p, m)| format!("SR_{name}={}\n", if plus { p } else { m }))
            .collect()
    }
}

/// Victoires, défaites, nulles du camp `+`, lues sur la DERNIÈRE ligne
/// « Wins: V, Losses: D, Draws: N » du journal de fastchess — les arbitres
/// impriment un score courant après chaque partie.
fn read_result(log: &str) -> Result<(u64, u64, u64), String> {
    let line = log
        .lines()
        .filter(|l| l.contains("Wins: ") && l.contains("Losses: ") && l.contains("Draws: "))
        .next_back()
        .ok_or("aucune ligne « Wins, Losses, Draws » dans le journal")?;
    let field = |key: &str| -> Result<u64, String> {
        let rest = line
            .split(key)
            .nth(1)
            .ok_or_else(|| format!("« {key} » manque"))?;
        let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
        parse(&digits, 0)
    };
    Ok((field("Wins: ")?, field("Losses: ")?, field("Draws: ")?))
}

/// La mise à jour d'une manche : l'état suivant, et le bilan à imprimer.
fn aggregate(
    state: &State,
    results: &[(Draw, (u64, u64, u64))],
) -> Result<(State, String), String> {
    let mut next = state.clone();
    let mut jobs = std::collections::BTreeSet::new();
    let mut pairs = 0;
    for (draw, (wins, losses, draws)) in results {
        if draw.round != state.round || draw.k != state.played_pairs {
            return Err(format!(
                "le tirage du job {} est de la manche {}, l'état en est à la {}",
                draw.job, draw.round, state.round
            ));
        }
        if !jobs.insert(draw.job) {
            return Err(format!("le job {} est compté deux fois", draw.job));
        }
        if draw.rows.len() != state.params.len() {
            return Err(format!(
                "le tirage du job {} n'a pas les paramètres de l'état",
                draw.job
            ));
        }
        let net = *wins as f64 - *losses as f64;
        for ((name, sign, c, _, _), p) in draw.rows.iter().zip(next.params.iter_mut()) {
            if *name != p.name {
                return Err(format!(
                    "le tirage du job {} nomme {name} où l'état nomme {}",
                    draw.job, p.name
                ));
            }
            let original = &state
                .params
                .iter()
                .find(|q| q.name == p.name)
                .ok_or("paramètre perdu")?;
            p.value += state.a_k(original, state.played_pairs) / c * net * *sign as f64;
        }
        pairs += (wins + losses + draws) / 2;
    }
    if results.is_empty() {
        return Err("aucun résultat".to_owned());
    }
    for p in &mut next.params {
        p.value = p.value.clamp(p.min as f64, p.max as f64);
    }
    next.played_pairs += pairs;
    next.round += 1;

    let mut report = format!(
        "manche {} : {} jobs, {} paires — {} sur {} prévues\n",
        state.round,
        results.len(),
        pairs,
        next.played_pairs,
        next.planned_pairs
    );
    for (before, after) in state.params.iter().zip(&next.params) {
        let _ = writeln!(
            report,
            "{:<24} {:>9.2} → {:>9.2}  ({:+.2})",
            before.name,
            before.value,
            after.value,
            after.value - before.value
        );
    }
    Ok((next, report))
}

fn read(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|error| format!("{} : {error}", path.display()))
}

fn write(path: &Path, text: &str) -> Result<(), String> {
    std::fs::write(path, text).map_err(|error| format!("{} : {error}", path.display()))
}

fn run(args: &[String]) -> Result<String, String> {
    match args {
        [command, state, job, dir] if command == "tirer" => {
            let state = State::parse(&read(Path::new(state))?)?;
            let job: u64 = parse(job, 0)?;
            let dir = PathBuf::from(dir);
            std::fs::create_dir_all(&dir).map_err(|e| format!("{} : {e}", dir.display()))?;
            let draw = draw(&state, job);
            write(&dir.join("tirage.txt"), &draw.render())?;
            write(&dir.join("plus.env"), &draw.env(true))?;
            write(&dir.join("moins.env"), &draw.env(false))?;
            Ok(draw.render())
        }
        [command, log, dir] if command == "resultat" => {
            let (wins, losses, draws) = read_result(&read(Path::new(log))?)?;
            let text = format!("{wins} {losses} {draws}\n");
            write(&Path::new(dir).join("resultat.txt"), &text)?;
            Ok(text)
        }
        [command, state, output, dirs @ ..] if command == "agreger" => {
            let state = State::parse(&read(Path::new(state))?)?;
            let mut results = Vec::new();
            for dir in dirs {
                let dir = Path::new(dir);
                let draw = Draw::parse(&read(&dir.join("tirage.txt"))?)?;
                let fields: Vec<u64> = read(&dir.join("resultat.txt"))?
                    .split_whitespace()
                    .map(|f| parse(f, 0))
                    .collect::<Result<_, _>>()?;
                let [wins, losses, draws] = fields[..] else {
                    return Err(format!("{} : résultat illisible", dir.display()));
                };
                results.push((draw, (wins, losses, draws)));
            }
            let (next, report) = aggregate(&state, &results)?;
            write(Path::new(output), &next.render())?;
            Ok(report)
        }
        _ => Err("usage : spsa tirer ETAT JOB DOSSIER | resultat JOURNAL DOSSIER | agreger ETAT SORTIE DOSSIER…".to_owned()),
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(report) => {
            print!("{report}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("spsa : {error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    #![expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]

    use super::*;

    const ETAT: &str = "\
paires_prevues 12000
paires_faites 0
manche 0
alpha 0.602
gamma 0.101
a_frac 0.1
r_fin 0.002
param RFP_MARGIN 100 40 220 10
param LMP_BASE 6 2 14 1
param SINGULAR_MARGIN 10 3 30 2
";

    #[test]
    fn l_etat_se_relit_tel_qu_il_s_ecrit() {
        let state = State::parse(ETAT).unwrap();
        assert_eq!(state.params.len(), 3);
        assert_eq!(State::parse(&state.render()).unwrap(), state);
    }

    #[test]
    fn un_etat_faux_est_refuse() {
        assert!(State::parse("paires_prevues 10\n").is_err());
        assert!(State::parse(&ETAT.replace("40 220", "220 40")).is_err());
        assert!(State::parse(&ETAT.replace("param LMP_BASE 6", "param LMP_BASE six")).is_err());
        assert!(State::parse(&format!("{ETAT}bruit en trop ici\n")).is_err());
    }

    /// Les deux schémas aux bornes : la perturbation descend jusqu'à `c_fin`
    /// à la dernière paire, le pas jusqu'à `r_fin · c_fin²`.
    #[test]
    fn les_schemas_finissent_a_leurs_valeurs_de_fin() {
        let state = State::parse(ETAT).unwrap();
        let p = &state.params[0];
        let n = state.planned_pairs;
        assert!((state.c_k(p, n - 1) - 10.0).abs() < 1e-9);
        assert!(state.c_k(p, 0) > 2.0 * 10.0);
        let a_end = state.r_end * 100.0;
        assert!((state.a_k(p, n - 1) - a_end).abs() < 1e-9);
        assert!(state.a_k(p, 0) > state.a_k(p, n / 2));
    }

    #[test]
    fn un_tirage_est_deterministe_signe_et_borne() {
        let state = State::parse(ETAT).unwrap();
        assert_eq!(draw(&state, 3), draw(&state, 3));
        let signs: Vec<Vec<i64>> = (0..16)
            .map(|j| draw(&state, j).rows.iter().map(|r| r.1).collect())
            .collect();
        assert!(
            signs.iter().any(|s| s != &signs[0]),
            "les jobs tirent tous les mêmes signes"
        );
        for job in 0..16 {
            let d = draw(&state, job);
            assert_eq!(Draw::parse(&d.render()).unwrap(), d);
            for ((name, sign, c, plus, minus), p) in d.rows.iter().zip(&state.params) {
                assert_eq!(*name, p.name);
                assert!(*sign == 1 || *sign == -1);
                assert!((p.min..=p.max).contains(plus) && (p.min..=p.max).contains(minus));
                // Le camp + est du côté du signe.
                assert_eq!((plus - minus).signum(), *sign, "{name}");
                assert!(*c > 0.0);
            }
            assert!(d.env(true).contains("SR_RFP_MARGIN="));
        }
    }

    #[test]
    fn le_resultat_est_celui_de_la_derniere_ligne() {
        let log = "\
Games: 2, Wins: 1, Losses: 1, Draws: 0, Points: 1.0 (50.00 %)
Games: 400, Wins: 130, Losses: 110, Draws: 160, Points: 210.0 (52.50 %)
";
        assert_eq!(read_result(log).unwrap(), (130, 110, 160));
        assert!(read_result("rien\n").is_err());
    }

    #[test]
    fn le_camp_qui_gagne_tire_le_parametre_vers_lui() {
        let state = State::parse(ETAT).unwrap();
        let d = draw(&state, 1);
        let (next, report) = aggregate(&state, &[(d.clone(), (60, 40, 100))]).unwrap();
        for ((name, sign, _, _, _), (before, after)) in
            d.rows.iter().zip(state.params.iter().zip(&next.params))
        {
            assert_eq!(
                (after.value - before.value).signum() as i64,
                *sign,
                "{name}"
            );
        }
        assert_eq!(next.played_pairs, 100);
        assert_eq!(next.round, 1);
        assert!(report.contains("RFP_MARGIN"));
        // Une égalité ne bouge rien.
        let (still, _) = aggregate(&state, &[(d, (50, 50, 100))]).unwrap();
        assert_eq!(still.params, state.params);
    }

    #[test]
    fn une_manche_melangee_est_refusee() {
        let state = State::parse(ETAT).unwrap();
        let d = draw(&state, 1);
        assert!(aggregate(&state, &[(d.clone(), (1, 0, 1)), (d.clone(), (1, 0, 1))]).is_err());
        let mut later = state.clone();
        later.round = 1;
        later.played_pairs = 100;
        assert!(aggregate(&later, &[(d, (1, 0, 1))]).is_err());
        assert!(aggregate(&state, &[]).is_err());
    }

    /// La vérité terrain : des parties simulées où le camp le plus proche
    /// d'un optimum connu gagne plus souvent. SPSA doit s'en rapprocher.
    #[test]
    fn spsa_retrouve_l_optimum_d_une_fonction_connue() {
        let mut state = State::parse(ETAT).unwrap();
        state.planned_pairs = 16 * 8 * 100;
        let optimum = [150.0, 9.0, 20.0];
        let scale = [60.0, 4.0, 10.0];
        let distance = |values: &[f64]| -> f64 {
            values
                .iter()
                .zip(optimum.iter().zip(&scale))
                .map(|(v, (o, s))| ((v - o) / s).powi(2))
                .sum::<f64>()
                .sqrt()
        };
        let start = distance(&state.params.iter().map(|p| p.value).collect::<Vec<_>>());
        let mut noise = 0x1234_5678_9abc_def1_u64;
        for _round in 0..16 {
            let results: Vec<_> = (0..8)
                .map(|job| {
                    let d = draw(&state, job);
                    let plus: Vec<f64> = d.rows.iter().map(|r| r.3 as f64).collect();
                    let minus: Vec<f64> = d.rows.iter().map(|r| r.4 as f64).collect();
                    // Plus proche de l'optimum, plus de victoires : une
                    // probabilité logistique de l'écart des « forces ».
                    let edge = distance(&minus).powi(2) - distance(&plus).powi(2);
                    let p_win = 1.0 / (1.0 + (-edge).exp());
                    let (mut w, mut l) = (0, 0);
                    for _ in 0..200 {
                        let u = (xorshift(&mut noise) >> 11) as f64 / (1u64 << 53) as f64;
                        if u < p_win { w += 1 } else { l += 1 }
                    }
                    (d, (w, l, 0))
                })
                .collect();
            state = aggregate(&state, &results).unwrap().0;
        }
        let end = distance(&state.params.iter().map(|p| p.value).collect::<Vec<_>>());
        assert!(
            end < start / 2.0,
            "distance à l'optimum {start:.2} → {end:.2}"
        );
    }
}
