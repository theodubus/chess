//! Le chiffre de référence du bench, inscrit dans `CLAUDE.md`, doit être vrai.
//!
//! **Pourquoi ce test existe.** La section *Commandes* de `CLAUDE.md` a annoncé
//! 702 612 nœuds pendant deux journées de travail alors que la valeur réelle
//! était 541 528 : la mobilité et trois termes d'évaluation avaient changé
//! l'arbre de recherche sans que personne ne mette le chiffre à jour. Rien ne
//! l'a signalé — aucun test, aucune étape de CI ne confrontait le chiffre écrit
//! à celui que le binaire produit.
//!
//! Un chiffre de référence faux est **pire qu'absent** : il sert de point de
//! comparaison à la session suivante, qui croit alors mesurer une régression
//! là où elle ne fait que découvrir une dérive de la documentation.
//!
//! **Le prix est assumé, pas subi.** Tout changement de l'arbre de recherche
//! rend ce test rouge tant que `CLAUDE.md` n'est pas mis à jour. C'est l'effet
//! recherché : le message d'échec donne le chiffre à recopier.
//!
//! `#[ignore]` comme perft — le test appartient aux critères d'acceptation en
//! release (`cargo test --workspace --release -- --ignored`), parce qu'une
//! recherche à profondeur 7 en debug coûterait des dizaines de secondes sur le
//! chemin rapide.

#![expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]

use shallowred::bench;

/// Le fragment qui identifie la ligne de référence dans `CLAUDE.md`.
const MARKER: &str = "# référence :";

/// Extrait `(profondeur, nœuds)` de la ligne de référence de `CLAUDE.md`.
///
/// Ligne attendue, dans la section *Commandes* :
///
/// ```text
/// cargo run --release --bin shallowred -- bench 7   # référence : 541 528 nœuds
/// ```
///
/// Les espaces à l'intérieur du nombre sont des séparateurs de milliers et
/// sont retirés. Rendre `None` fait échouer le test au lieu de le laisser
/// passer à vide : une ligne reformatée ou supprimée doit se voir, pas se
/// taire — un contrôle qui ne trouve plus ce qu'il contrôle est un contrôle
/// mort.
fn reference(doc: &str) -> Option<(u32, u64)> {
    let mut lines = doc.lines().filter(|l| l.contains(MARKER));
    let line = lines.next()?;
    if lines.next().is_some() {
        return None; // plusieurs références : laquelle fait foi ? Échouer.
    }

    let (before, after) = line.split_once(MARKER)?;
    let depth = before.rsplit_once("bench ")?.1.trim().parse().ok()?;

    let digits: String = after
        .trim_start()
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == ' ')
        .filter(char::is_ascii_digit)
        .collect();

    Some((depth, digits.parse().ok()?))
}

/// Regroupe les chiffres par trois, comme `CLAUDE.md` les écrit, pour que le
/// message d'échec se recopie tel quel.
fn grouped(n: u64) -> String {
    let digits = n.to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(' ');
        }
        out.push(c);
    }
    out
}

#[test]
#[ignore = "profondeur 7 : critère d'acceptation, à exécuter en release"]
fn la_reference_du_bench_dans_claude_md_est_a_jour() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../CLAUDE.md");
    let doc = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("CLAUDE.md illisible à {path} : {e}"));

    let (depth, expected) = reference(&doc).unwrap_or_else(|| {
        panic!(
            "aucune ligne de référence unique trouvée dans CLAUDE.md.\n\
             Format attendu dans la section Commandes :\n    \
             cargo run --release --bin shallowred -- bench 7   {MARKER} 541 528 nœuds"
        )
    });

    let measured = bench::run(depth).unwrap();

    assert_eq!(
        measured,
        expected,
        "\n\nLe chiffre de référence de CLAUDE.md a vieilli.\n\
         Profondeur {depth} : le binaire visite {} nœuds, CLAUDE.md en annonce {}.\n\
         Si le changement d'arbre de recherche est voulu, c'est la documentation \
         qu'il faut corriger — remplacer le chiffre de la section Commandes par {}.\n",
        grouped(measured),
        grouped(expected),
        grouped(measured)
    );
}

#[test]
fn la_ligne_de_reference_se_lit() {
    let doc = "cargo run --release --bin shallowred -- bench 7   # référence : 541 528 nœuds\n";
    assert_eq!(reference(doc), Some((7, 541_528)));
}

#[test]
fn une_reference_absente_ou_reformatee_ne_passe_pas_en_silence() {
    // C'est le cas qui compte : le contrôle doit mourir bruyamment, jamais
    // devenir une assertion vide qui passe toujours.
    assert_eq!(reference("cargo run -- bench 7\n"), None);
    assert_eq!(reference(""), None);
    assert_eq!(reference("bench 7   # référence : nœuds"), None);
    assert_eq!(reference("# référence : 1 000 nœuds"), None); // profondeur absente
}

#[test]
fn deux_references_font_echouer_plutot_que_choisir() {
    let doc = "-- bench 7   # référence : 1 nœuds\n-- bench 4   # référence : 2 nœuds\n";
    assert_eq!(reference(doc), None);
}

#[test]
fn les_milliers_se_regroupent_comme_dans_le_document() {
    assert_eq!(grouped(0), "0");
    assert_eq!(grouped(528), "528");
    assert_eq!(grouped(1_528), "1 528");
    assert_eq!(grouped(541_528), "541 528");
    assert_eq!(grouped(1_541_528), "1 541 528");
}
