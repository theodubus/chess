//! Ajustement Texel des valeurs de l'évaluation.
//!
//! ```sh
//! cargo run --release --bin tune -- corpus.txt [positions_entraînement]
//! ```
//!
//! # Le principe
//!
//! On cherche les valeurs qui font le mieux **prédire le résultat des parties**
//! par l'évaluation statique. Chaque position du corpus porte le résultat de la
//! partie dont elle vient ; on passe son évaluation dans une sigmoïde pour en
//! faire une probabilité de gain, et l'on minimise l'erreur quadratique
//! moyenne entre cette probabilité et le résultat observé.
//!
//! # Pourquoi ce n'est pas un SPRT
//!
//! Il y a environ 825 valeurs. À `parties × Elo ≈ 62 000`, les régler une par
//! une au SPRT prendrait des mois, et chacune isolément produit un effet trop
//! petit pour être tranché — deux tentatives l'ont montré le 14 sept. 2026.
//! L'ajustement coûte des minutes de processeur et **un seul SPRT de
//! validation à la fin**, sur l'évaluation complète : c'est-à-dire sur ce qui
//! sera effectivement livré.
//!
//! # Ce que l'ajustement ne peut pas voir
//!
//! Il ignore le **coût d'exécution** : un terme cher à calculer lui paraît
//! aussi bon qu'un terme gratuit, à pouvoir prédictif égal. Le temps par nœud
//! se surveille donc séparément, au bench. C'est le risque résiduel accepté en
//! adoptant ce protocole.

use cozy_chess::{Board, Color, Piece};
use shallowred::eval::{self, Params};

/// Recherche locale : pas initial, et pas en deçà duquel on s'arrête.
///
/// Commencer à 1 converge trop lentement sur 825 valeurs ; commencer trop haut
/// saute par-dessus les optima. On part large et l'on divise par deux dès
/// qu'une passe entière n'améliore plus rien.
const INITIAL_STEP: i32 = 16;
const MIN_STEP: i32 = 1;

/// Nombre de passes sans progrès sur la validation au bout desquelles on
/// s'arrête.
///
/// Une seule suffirait presque : la recherche locale est monotone sur
/// l'entraînement, donc une remontée de la validation ne s'inverse quasiment
/// jamais. Deux laissent passer un palier.
const PATIENCE: u32 = 2;

/// Fraction du corpus réservée à la validation.
///
/// **Elle n'entre jamais dans l'ajustement.** Une erreur qui baisse sur
/// l'entraînement et monte sur la validation est du surapprentissage, et sans
/// ce témoin on ne pourrait pas le distinguer d'un progrès.
const VALIDATION_FRACTION: usize = 5;

struct Sample {
    board: Board,
    /// Résultat de la partie, du point de vue des BLANCS : 1, 0.5 ou 0.
    result: f64,
}

/// Probabilité de gain déduite d'un score, en centièmes de pion.
fn winning_probability(score: f64, k: f64) -> f64 {
    1.0 / (1.0 + 10f64.powf(-k * score / 400.0))
}

/// Erreur quadratique moyenne sur un échantillon.
///
/// L'évaluation rend son score du point de vue du TRAIT, alors que l'étiquette
/// est du point de vue des Blancs. Confondre les deux inverserait la moitié du
/// corpus et l'ajustement apprendrait n'importe quoi — un test le verrouille.
fn error(samples: &[Sample], params: &Params, k: f64) -> f64 {
    let sum: f64 = samples
        .iter()
        .map(|s| {
            let score = eval::evaluate(&s.board, params);
            let white_score = if s.board.side_to_move() == Color::White {
                score
            } else {
                -score
            };
            let diff = s.result - winning_probability(f64::from(white_score), k);
            diff * diff
        })
        .sum();
    sum / samples.len() as f64
}

/// Cherche l'échelle de la sigmoïde qui minimise l'erreur, à valeurs figées.
///
/// `k` n'est pas un paramètre d'évaluation : il traduit des centièmes de pion
/// en probabilité de gain. L'ajuster d'abord évite que la recherche locale ne
/// déforme les valeurs pour compenser une échelle mal choisie.
fn fit_k(samples: &[Sample], params: &Params) -> f64 {
    let mut best = (f64::MAX, 1.0);
    let mut low = 0.2;
    let mut high = 4.0;
    for _ in 0..8 {
        let step = (high - low) / 10.0;
        let mut k = low;
        while k <= high {
            let e = error(samples, params, k);
            if e < best.0 {
                best = (e, k);
            }
            k += step;
        }
        low = (best.1 - step).max(0.01);
        high = best.1 + step;
    }
    best.1
}

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args.next().unwrap_or_else(|| {
        eprintln!("usage : tune <corpus> [positions_entraînement]");
        std::process::exit(2);
    });
    let cap: usize = args
        .next()
        .and_then(|a| a.parse().ok())
        .unwrap_or(usize::MAX);
    // Fichier de sauvegarde réécrit à chaque progrès de la validation : un
    // ajustement interrompu ne doit pas repartir de zéro.
    let checkpoint = args.next();
    // Nombre de paramètres à régler, dans l'ordre de `Params::visit`.
    //
    // Les 57 premiers sont les termes nommés — matériel, primes, pénalités,
    // mobilité — et chacun s'appuie sur une grande partie du corpus. Les 768
    // suivants sont les cases des tables piece-square, dont chacune n'est
    // décisive que dans une fraction des positions : c'est là que le bruit
    // s'installe quand le corpus est trop maigre. Pouvoir les exclure permet
    // de distinguer les deux régimes au lieu de le supposer.
    let tunable: usize = args
        .next()
        .and_then(|a| a.parse().ok())
        .unwrap_or(usize::MAX);

    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        eprintln!("lecture de {path} : {e}");
        std::process::exit(2);
    });

    let mut train = Vec::new();
    let mut validation = Vec::new();
    let mut skipped = 0u64;
    for (index, line) in text.lines().enumerate() {
        let Some((fen, result)) = line.rsplit_once(';') else {
            skipped += 1;
            continue;
        };
        let (Ok(board), Ok(result)) = (fen.parse::<Board>(), result.parse::<f64>()) else {
            skipped += 1;
            continue;
        };
        let sample = Sample { board, result };
        // Découpe déterministe : un indice sur cinq va en validation, donc la
        // même exécution sur le même fichier donne la même partition.
        if index % VALIDATION_FRACTION == 0 {
            validation.push(sample);
        } else {
            train.push(sample);
        }
    }

    // Plafonnement par ÉCHANTILLONNAGE RÉGULIER, jamais par troncature.
    // Tronquer prendrait les premières parties du fichier et laisserait la
    // validation couvrir tout le corpus : les deux ensembles ne viendraient
    // plus de la même distribution, et leurs erreurs ne seraient pas
    // comparables. Constaté le 14 sept. 2026 — l'erreur de départ différait de
    // 17 % entre les deux, ce qui n'a aucun sens pour une découpe équilibrée.
    if train.len() > cap && cap > 0 {
        let stride = train.len().div_ceil(cap);
        let mut kept = Vec::with_capacity(cap);
        for (index, sample) in train.drain(..).enumerate() {
            if index % stride == 0 {
                kept.push(sample);
            }
        }
        train = kept;
    }
    if train.is_empty() || validation.is_empty() {
        eprintln!("corpus vide ou illisible ({skipped} lignes rejetées)");
        std::process::exit(2);
    }
    eprintln!(
        "{} positions d'entraînement, {} de validation, {skipped} rejetées",
        train.len(),
        validation.len()
    );

    let mut params = Params::DEFAULT;
    let k = fit_k(&train, &params);
    let start_train = error(&train, &params, k);
    let start_validation = error(&validation, &params, k);
    eprintln!("k = {k:.3}");
    eprintln!("erreur de départ : entraînement {start_train:.6}, validation {start_validation:.6}");

    let mut values = params.to_vec();
    let mut best = start_train;
    let mut step = INITIAL_STEP;
    let mut pass = 0;

    // ARRÊT PRÉCOCE. La recherche locale fait baisser l'erreur d'entraînement
    // indéfiniment ; passé un certain point elle n'apprend plus la position,
    // elle apprend le corpus. On conserve donc les valeurs du meilleur point
    // de VALIDATION et l'on s'arrête quand celle-ci cesse de progresser.
    // Sans ce garde-fou, l'essai du 14 sept. 2026 voyait l'entraînement
    // tomber de 0,0935 à 0,0181 pendant que la validation remontait de 0,1030
    // à 0,1429 — un désastre silencieux que seul ce témoin révèle.
    let mut best_validation = start_validation;
    let mut best_values = values.clone();
    let mut stale;

    // Le pas descend quand la VALIDATION cesse de progresser, jamais quand
    // l'entraînement cesse. Avec 825 paramètres, l'entraînement trouve
    // toujours une amélioration : une condition qui s'y fie laisse le pas à sa
    // valeur initiale pour toujours. C'était le cas du premier ajustement du
    // 14 sept. 2026 — cinquante passes toutes au pas de 16 centièmes de pion,
    // et des valeurs grossières et invraisemblables en sortie.
    while step >= MIN_STEP {
        stale = 0;
        while stale < PATIENCE {
            pass += 1;
            for index in 0..values.len().min(tunable) {
                for delta in [step, -step] {
                    let original = values[index];
                    values[index] = original + delta;
                    params.set_from(&values);
                    let candidate = error(&train, &params, k);
                    if candidate < best {
                        best = candidate;
                        break; // la valeur modifiée est conservée
                    }
                    values[index] = original;
                }
            }
            params.set_from(&values);
            let on_validation = error(&validation, &params, k);
            let marker = if on_validation < best_validation {
                best_validation = on_validation;
                best_values.clone_from(&values);
                stale = 0;
                if let Some(path) = &checkpoint {
                    let mut snapshot = Params::DEFAULT;
                    snapshot.set_from(&values);
                    let _ = std::fs::write(path, render(&snapshot));
                }
                " <- retenu"
            } else {
                stale += 1;
                ""
            };
            eprintln!(
                "passe {pass} (pas {step}) : entraînement {best:.6}, validation {on_validation:.6}{marker}"
            );
        }
        // On repart du meilleur point connu pour affiner, et non du dernier
        // point atteint, qui a déjà commencé à surapprendre.
        values.clone_from(&best_values);
        params.set_from(&values);
        best = error(&train, &params, k);
        step /= 2;
    }

    // On rend le meilleur point de validation, pas le dernier point atteint.
    values = best_values;
    params.set_from(&values);
    let end_validation = error(&validation, &params, k);
    let end_train = error(&train, &params, k);
    eprintln!();
    eprintln!("valeurs retenues : entraînement {end_train:.6}");
    eprintln!();
    eprintln!("erreur finale : entraînement {best:.6}, validation {end_validation:.6}");
    eprintln!(
        "gain sur la validation : {:.2} %",
        100.0 * (start_validation - end_validation) / start_validation
    );
    if end_validation >= start_validation {
        eprintln!(
            "ATTENTION : l'erreur de validation n'a pas baissé. C'est du \
             surapprentissage, et les valeurs ci-dessous ne valent rien."
        );
    }

    print!("{}", render(&params));
}

/// Ramène chaque table piece-square à une moyenne nulle, en reportant le
/// décalage sur la valeur matérielle de la pièce.
///
/// **L'évaluation est rigoureusement inchangée.** La contribution d'une pièce
/// vaut `matériel[p] + table[p][case]` : retrancher `m` à toute la table et
/// l'ajouter au matériel laisse chaque terme identique. C'est précisément
/// parce que cette direction ne change rien que la recherche locale y dérive
/// librement — le cavalier est passé de 320 à 400 sans que cela signifie quoi
/// que ce soit. La normalisation ne corrige pas le réglage, elle le rend
/// **lisible**, donc vérifiable : une valeur matérielle absurde après
/// normalisation est un vrai signal, avant elle n'en était pas un.
fn normalise(params: &mut Params) {
    for piece in 0..Piece::NUM {
        for (table, material) in [
            (&mut params.pst_mg[piece], &mut params.mg_value[piece]),
            (&mut params.pst_eg[piece], &mut params.eg_value[piece]),
        ] {
            let mean = table.iter().sum::<i32>() / 64;
            for value in table.iter_mut() {
                *value -= mean;
            }
            *material += mean;
        }
    }
}

/// Écrit une table piece-square dans la disposition visuelle du plateau.
fn table(out: &mut String, name: &str, values: &[i32; 64]) {
    use std::fmt::Write as _;
    let _ = writeln!(out, "const {name}: [i32; 64] = [");
    for rank in 0..8 {
        let _ = write!(out, "   ");
        for file in 0..8 {
            let _ = write!(out, " {:4},", values[rank * 8 + file]);
        }
        let _ = writeln!(out);
    }
    let _ = writeln!(out, "];");
}

/// Rend les valeurs ajustées sous la forme exacte qu'attend `eval.rs`.
fn render(params: &Params) -> String {
    use std::fmt::Write as _;
    let mut params = params.clone();
    normalise(&mut params);
    let params = &params;
    let mut out = String::new();
    let _ = writeln!(out, "// Valeurs ajustées par tools/src/bin/tune.rs.");
    let _ = writeln!(
        out,
        "const MG_VALUE: [i32; Piece::NUM] = {:?};",
        params.mg_value
    );
    let _ = writeln!(
        out,
        "const EG_VALUE: [i32; Piece::NUM] = {:?};",
        params.eg_value
    );
    let _ = writeln!(
        out,
        "const BISHOP_PAIR: (i32, i32) = {:?};",
        params.bishop_pair
    );
    let _ = writeln!(out, "const PASSED_MG: [i32; 8] = {:?};", params.passed_mg);
    let _ = writeln!(out, "const PASSED_EG: [i32; 8] = {:?};", params.passed_eg);
    let _ = writeln!(
        out,
        "const DOUBLED_PAWN: (i32, i32) = {:?};",
        params.doubled
    );
    let _ = writeln!(
        out,
        "const ISOLATED_PAWN: (i32, i32) = {:?};",
        params.isolated
    );
    let _ = writeln!(
        out,
        "const ROOK_OPEN_FILE: (i32, i32) = {:?};",
        params.rook_open
    );
    let _ = writeln!(
        out,
        "const ROOK_SEMI_OPEN_FILE: (i32, i32) = {:?};",
        params.rook_semi_open
    );
    let _ = writeln!(
        out,
        "const KING_ATTACK_WEIGHT: [i32; Piece::NUM] = {:?};",
        params.king_attack_weight
    );
    let _ = writeln!(
        out,
        "const KING_DANGER_SCALE: i32 = {};",
        params.king_danger_scale
    );
    let _ = writeln!(
        out,
        "const MOBILITY: [(i32, i32); Piece::NUM] = {:?};",
        params.mobility
    );
    for (name, values) in [
        ("PAWN_MG", &params.pst_mg[0]),
        ("KNIGHT_MG", &params.pst_mg[1]),
        ("BISHOP_MG", &params.pst_mg[2]),
        ("ROOK_MG", &params.pst_mg[3]),
        ("QUEEN_MG", &params.pst_mg[4]),
        ("KING_MG", &params.pst_mg[5]),
        ("PAWN_EG", &params.pst_eg[0]),
        ("KNIGHT_EG", &params.pst_eg[1]),
        ("BISHOP_EG", &params.pst_eg[2]),
        ("ROOK_EG", &params.pst_eg[3]),
        ("QUEEN_EG", &params.pst_eg[4]),
        ("KING_EG", &params.pst_eg[5]),
    ] {
        table(&mut out, name, values);
    }

    out
}

#[cfg(test)]
#[expect(clippy::expect_used, reason = "un test doit échouer bruyamment")]
mod tests {
    use super::*;

    fn sample(fen: &str, result: f64) -> Sample {
        Sample {
            board: fen.parse().expect("fen de test valide"),
            result,
        }
    }

    #[test]
    fn lerreur_juge_du_point_de_vue_des_blancs() {
        // Position validée par exécution : les Blancs ont une dame de plus, et
        // c'est aux NOIRS de jouer. L'évaluation rend donc un grand score
        // NÉGATIF, puisqu'elle parle du point de vue du trait.
        //
        // Étiquetée « les Blancs gagnent », l'erreur doit être petite. Si la
        // conversion de point de vue était omise ou inversée, elle serait
        // proche du maximum — et rien d'autre dans le tuner ne le signalerait.
        let winning = sample("4k3/8/8/8/8/8/8/3QK3 b - - 0 1", 1.0);
        let e = error(&[winning], &Params::DEFAULT, 1.0);
        assert!(
            e < 0.05,
            "erreur {e} : la conversion de point de vue est fausse"
        );

        // Le même avantage étiqueté à l'envers doit produire une grande erreur.
        let mislabelled = sample("4k3/8/8/8/8/8/8/3QK3 b - - 0 1", 0.0);
        let e = error(&[mislabelled], &Params::DEFAULT, 1.0);
        assert!(e > 0.9, "erreur {e} : le test ne discrimine rien");
    }

    #[test]
    fn la_normalisation_ne_change_pas_une_seule_evaluation() {
        // Propriété qui justifie la normalisation : elle déplace des nombres
        // sans toucher à la fonction. Si elle échouait, le fichier produit ne
        // décrirait pas l'évaluation qui a été ajustée — et le SPRT mesurerait
        // autre chose que ce qu'on croit.
        let mut shifted = Params::DEFAULT;
        normalise(&mut shifted);
        assert_ne!(shifted, Params::DEFAULT, "la normalisation doit déplacer");

        for fen in [
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
            "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
            "4k3/8/8/8/8/8/8/3QK3 b - - 0 1",
        ] {
            let board: Board = fen.parse().expect("fen de test valide");
            assert_eq!(
                eval::evaluate(&board, &Params::DEFAULT),
                eval::evaluate(&board, &shifted),
                "{fen}"
            );
        }
    }

    #[test]
    fn la_probabilite_est_monotone_et_centree() {
        assert!((winning_probability(0.0, 1.0) - 0.5).abs() < 1e-9);
        assert!(winning_probability(100.0, 1.0) > winning_probability(0.0, 1.0));
        assert!(winning_probability(-100.0, 1.0) < winning_probability(0.0, 1.0));
        // Une échelle plus grande rend la sigmoïde plus tranchée.
        assert!(winning_probability(100.0, 2.0) > winning_probability(100.0, 1.0));
    }
}
