//! Le point d'entrée du module WebAssembly.
//!
//! Le Web Worker dépose chaque commande sur l'entrée standard que lui simule
//! sa couche WASI, puis appelle [`uci_input`] ; les lignes du moteur sortent
//! par la sortie standard, une écriture par ligne, que le Worker relaie aussitôt.
//! Aucun pointeur ne traverse la frontière : seules l'entrée et la sortie
//! standard, que WASI définit, la franchissent.

use std::cell::RefCell;
use std::io::{self, BufRead, Write};

use crate::Driver;

thread_local! {
    /// Un module WebAssembly sans fil n'a qu'un fil : celui-ci.
    static DRIVER: RefCell<Option<Driver>> = const { RefCell::new(None) };
}

/// Écrit une ligne et la pousse : sans `flush`, une ligne `info` resterait
/// dans le tampon jusqu'à la fin de la recherche.
fn send(line: &str) {
    let mut out = io::stdout().lock();
    let _ = writeln!(out, "{line}");
    let _ = out.flush();
}

/// Traite toutes les lignes en attente sur l'entrée standard. Rend 1 après
/// `quit`, 0 sinon.
// Seul `no_mangle` est « unsafe » ici : il rend le nom visible depuis
// JavaScript, et aucun autre symbole du module ne le porte.
#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn uci_input() -> i32 {
    DRIVER.with_borrow_mut(|driver| {
        let driver = driver.get_or_insert_with(Driver::new);
        for line in io::stdin().lock().lines().map_while(Result::ok) {
            if !driver.handle(line.trim(), &mut |l| send(l)) {
                return 1;
            }
        }
        0
    })
}
