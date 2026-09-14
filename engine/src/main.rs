//! Binaire du moteur.
//!
//! Sans argument, parle UCI sur stdin/stdout. Avec `bench [profondeur]`,
//! exécute la charge de travail fixe et rend la main.

use std::process::ExitCode;

use shallowred::{bench, uci};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();

    match args.first().map(String::as_str) {
        Some("bench") => {
            let depth = args
                .get(1)
                .and_then(|a| a.parse().ok())
                .unwrap_or(bench::DEFAULT_DEPTH);
            match bench::run(depth) {
                Ok(_) => ExitCode::SUCCESS,
                Err(e) => {
                    eprintln!("{e}");
                    ExitCode::FAILURE
                }
            }
        }
        _ => {
            uci::Engine::new().run();
            ExitCode::SUCCESS
        }
    }
}
