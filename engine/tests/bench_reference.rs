//! Les chiffres de référence du bench, inscrits dans la documentation, doivent
//! être vrais — dans **tous** les fichiers qui les portent.
//!
//! **Pourquoi ce test existe.** La section *Commandes* de `CLAUDE.md` a annoncé
//! 702 612 nœuds pendant deux journées de travail alors que la valeur réelle
//! était 541 528 : la mobilité et trois termes d'évaluation avaient changé
//! l'arbre de recherche sans que personne ne mette le chiffre à jour. Rien ne
//! l'a signalé — aucun test, aucune étape de CI.
//!
//! **Pourquoi il balaie tout le dépôt.** La première version ne contrôlait que
//! `CLAUDE.md`. Elle a été écrite alors que `README.md` portait déjà
//! `8 432 521` — le chiffre d'avant le coup nul, faux d'un facteur 15,6 — et
//! ne l'a pas vu. Un garde-fou qui ne couvre qu'une copie d'un chiffre dupliqué
//! ne garde rien : il donne seulement l'impression de garder.
//!
//! La deuxième version balayait une **liste écrite à la main**. C'était encore
//! mon jugement qui décidait de la couverture — la faute exacte qu'elle devait
//! empêcher. **Le contrôle parcourt maintenant tout le dépôt** : un fichier
//! Markdown créé demain est couvert sans que personne ait à y penser.
//!
//! Un chiffre de référence faux est **pire qu'absent** : il sert de point de
//! comparaison à la session suivante, qui croit mesurer une régression là où
//! elle ne fait que découvrir une dérive de la documentation.
//!
//! **Le prix est assumé, pas subi.** Tout changement de l'arbre de recherche
//! rend ce test rouge tant que la documentation n'est pas mise à jour. C'est
//! l'effet recherché : le message d'échec nomme le fichier et donne le chiffre
//! à recopier.
//!
//! `#[ignore]` comme perft — le test appartient aux critères d'acceptation en
//! release (`cargo test --workspace --release -- --ignored`), parce qu'une
//! recherche à profondeur 7 en debug coûterait des dizaines de secondes sur le
//! chemin rapide.

#![expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use shallowred::bench;

/// Tous les fichiers Markdown du dépôt, chemin relatif et chemin absolu.
///
/// Parcours explicite plutôt que liste : c'est ce qui retire la couverture du
/// contrôle de mon jugement. `target/` et les répertoires cachés sont écartés —
/// ils ne portent pas de documentation, seulement des artefacts de compilation
/// et l'historique git.
fn documents(root: &Path) -> Vec<(String, PathBuf)> {
    let mut trouves = Vec::new();
    let mut a_visiter = vec![root.to_path_buf()];

    while let Some(dossier) = a_visiter.pop() {
        let Ok(entrees) = std::fs::read_dir(&dossier) else {
            continue;
        };
        for entree in entrees.flatten() {
            let chemin = entree.path();
            let nom = entree.file_name();
            let nom = nom.to_string_lossy();
            if nom.starts_with('.') || nom == "target" {
                continue;
            }
            if chemin.is_dir() {
                a_visiter.push(chemin);
            } else if chemin.extension().is_some_and(|e| e == "md") {
                let relatif = chemin
                    .strip_prefix(root)
                    .unwrap_or(chemin.as_path())
                    .display()
                    .to_string();
                trouves.push((relatif, chemin));
            }
        }
    }
    trouves.sort();
    trouves
}

/// Le fragment qui identifie une ligne de référence.
///
/// Délibérément long et spécifique. Un marqueur court comme « référence : »
/// entrerait en collision avec de la prose ordinaire — `README.md` contient
/// déjà « Première mesure de référence : … », qui n'a rien à voir — et le
/// contrôle échouerait sur une phrase innocente. Un garde-fou qui crie pour
/// de mauvaises raisons finit par être désarmé.
///
/// L'initiale est omise pour accepter « référence » comme « Référence ».
const MARKER: &str = "éférence à la profondeur";

/// Une référence trouvée dans la documentation.
#[derive(Debug, PartialEq, Eq)]
struct Reference {
    file: String,
    depth: u32,
    nodes: u64,
}

/// Lit toutes les lignes de référence d'un document.
///
/// Forme attendue : `référence à la profondeur <n> : <nombre> nœuds`. Les
/// espaces à l'intérieur du nombre sont des séparateurs de milliers ; les
/// astérisques et accents graves de l'emphase Markdown sont tolérés autour.
///
/// Renvoie `Err` sur une ligne qui porte le marqueur sans être analysable :
/// **un contrôle qui ne comprend plus ce qu'il contrôle doit mourir
/// bruyamment**, jamais se taire en rendant une liste vide.
fn references(file: &str, doc: &str) -> Result<Vec<Reference>, String> {
    let mut found = Vec::new();
    for line in doc.lines().filter(|l| l.contains(MARKER)) {
        let illisible = || format!("{file} : référence illisible dans « {} »", line.trim());

        let (_, after) = line.split_once(MARKER).ok_or_else(illisible)?;
        let after = after.trim_start();

        let depth: u32 = after
            .chars()
            .take_while(char::is_ascii_digit)
            .collect::<String>()
            .parse()
            .map_err(|_| illisible())?;

        let (_, tail) = after.split_once(':').ok_or_else(illisible)?;
        let nodes: u64 = tail
            .trim_start()
            .chars()
            .take_while(|c| c.is_ascii_digit() || matches!(c, ' ' | '*' | '`'))
            .filter(char::is_ascii_digit)
            .collect::<String>()
            .parse()
            .map_err(|_| illisible())?;

        found.push(Reference {
            file: file.to_owned(),
            depth,
            nodes,
        });
    }
    Ok(found)
}

/// Regroupe les chiffres par trois, comme la documentation les écrit, pour que
/// le message d'échec se recopie tel quel.
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
fn les_references_du_bench_dans_la_doc_sont_a_jour() {
    let root = Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/.."));
    let docs = documents(root);

    // Un parcours cassé ne doit pas se traduire par « aucune référence, donc
    // rien à vérifier » : ces deux fichiers existent, leur absence signale que
    // c'est le contrôle qui est en panne, pas la documentation qui est propre.
    for attendu in ["CLAUDE.md", "README.md"] {
        assert!(
            docs.iter().any(|(nom, _)| nom == attendu),
            "le parcours n'a pas trouvé {attendu} : c'est le contrôle qui est cassé.\n\
             Fichiers vus : {:?}",
            docs.iter().map(|(nom, _)| nom).collect::<Vec<_>>()
        );
    }

    let mut all = Vec::new();
    for (nom, path) in &docs {
        let doc = std::fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("{nom} illisible à {} : {e}", path.display()));
        all.extend(references(nom, &doc).unwrap_or_else(|e| panic!("{e}")));
    }

    assert!(
        !all.is_empty(),
        "aucune référence trouvée dans les {} fichiers Markdown du dépôt.\n\
         Format attendu : « référence à la profondeur <n> : <nombre> nœuds ».\n\
         Si la formulation a changé, c'est le contrôle qu'il faut adapter — \
         pas le supprimer.",
        docs.len()
    );

    // Un seul bench par profondeur distincte : le contrôle coûte alors le même
    // prix, que le chiffre soit dupliqué dans deux fichiers ou dans dix.
    let mut by_depth: BTreeMap<u32, Vec<&Reference>> = BTreeMap::new();
    for reference in &all {
        by_depth.entry(reference.depth).or_default().push(reference);
    }

    for (depth, expected) in by_depth {
        let measured = bench::run(depth).unwrap();
        for reference in expected {
            assert_eq!(
                measured,
                reference.nodes,
                "\n\nLe chiffre de référence de {} a vieilli.\n\
                 Profondeur {depth} : le binaire visite {} nœuds, {} en annonce {}.\n\
                 Si le changement d'arbre de recherche est voulu, c'est la \
                 documentation qu'il faut corriger — y remplacer le chiffre par {}.\n",
                reference.file,
                grouped(measured),
                reference.file,
                grouped(reference.nodes),
                grouped(measured)
            );
        }
    }
}

#[test]
fn une_reference_en_prose_se_lit() {
    let doc = "Référence à la profondeur 7 : 541 528 nœuds.\n";
    assert_eq!(
        references("CLAUDE.md", doc).unwrap(),
        vec![Reference {
            file: "CLAUDE.md".to_owned(),
            depth: 7,
            nodes: 541_528
        }]
    );
}

#[test]
fn lemphase_markdown_autour_du_nombre_est_toleree() {
    let doc = "La référence à la profondeur 7 : **541 528** nœuds.\n";
    assert_eq!(references("README.md", doc).unwrap()[0].nodes, 541_528);
}

#[test]
fn deux_fichiers_donnent_deux_references() {
    let a = references("CLAUDE.md", "référence à la profondeur 7 : 1 nœuds").unwrap();
    let b = references("README.md", "Référence à la profondeur 4 : 2 nœuds").unwrap();
    assert_eq!(a.len() + b.len(), 2);
    assert_eq!(a[0].nodes, 1);
    assert_eq!(b[0].depth, 4);
}

#[test]
fn une_ligne_marquee_mais_illisible_fait_echouer() {
    // Le cas qui compte : le contrôle doit mourir bruyamment, jamais devenir
    // une liste vide qui passe toujours.
    assert!(references("C", "référence à la profondeur 7 : nœuds").is_err());
    assert!(references("C", "référence à la profondeur : 541 528").is_err());
    assert!(references("C", "référence à la profondeur 7 sans deux-points").is_err());
}

#[test]
fn la_prose_ordinaire_ne_declenche_rien() {
    // La collision que le marqueur court aurait provoquée : cette phrase
    // existe dans README.md et n'a rien à voir avec le bench.
    let doc = "Première mesure de référence : la table vaut +164,3 Elo ± 31,3.\n";
    assert_eq!(references("README.md", doc).unwrap(), []);
}

#[test]
fn un_document_sans_marqueur_ne_rend_rien_sans_erreur() {
    // Tous les fichiers Markdown du dépôt n'ont pas à porter une référence ;
    // c'est l'absence *totale* de référence que le test principal refuse.
    assert_eq!(
        references("README.md", "un texte quelconque\n").unwrap(),
        []
    );
}

#[test]
fn le_parcours_trouve_la_documentation_du_depot() {
    let root = Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/.."));
    let docs = documents(root);
    let noms: Vec<&str> = docs.iter().map(|(nom, _)| nom.as_str()).collect();

    assert!(noms.contains(&"CLAUDE.md"), "vus : {noms:?}");
    assert!(noms.contains(&"README.md"), "vus : {noms:?}");
    // Un fichier en sous-répertoire, pour prouver que le parcours descend.
    assert!(
        noms.iter().any(|n| n.contains('/')),
        "le parcours ne descend pas dans les sous-répertoires : {noms:?}"
    );
}

#[test]
fn le_parcours_ecarte_les_artefacts_de_compilation() {
    // `target/` contient la documentation des dépendances : la balayer ferait
    // échouer le contrôle sur des fichiers qui ne nous appartiennent pas.
    // `.git/` de même. Ce test vaut surtout après une compilation, où
    // `target/` existe — d'où l'absence d'assertion sur sa présence.
    let root = Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/.."));
    for (nom, chemin) in documents(root) {
        assert!(
            !nom.starts_with("target/") && !nom.starts_with('.'),
            "{nom} n'aurait pas dû être balayé ({})",
            chemin.display()
        );
    }
}

#[test]
fn les_milliers_se_regroupent_comme_dans_le_document() {
    assert_eq!(grouped(0), "0");
    assert_eq!(grouped(528), "528");
    assert_eq!(grouped(1_528), "1 528");
    assert_eq!(grouped(541_528), "541 528");
    assert_eq!(grouped(1_541_528), "1 541 528");
}

/// L'arbre de recherche ne bouge pas en silence — et ce test-ci **n'est pas
/// `#[ignore]`**, contrairement à celui du haut.
///
/// **Pourquoi il existe, et ce qu'il répare.** Le contrôle de la profondeur 7
/// est un critère d'acceptation, donc `#[ignore]`, donc `cargo test` ne
/// l'exécute pas — et `cargo mutants` non plus. **Le garde-fou déterministe le
/// plus fort du projet était invisible au cliquet de mutation.** Tout mutant
/// qui change l'arbre de recherche sans faire tomber une assertion unitaire
/// survivait, alors que le banc l'aurait vu.
///
/// Mesuré le 22 sept. 2026 : `search.rs` est passé de 89 à 110 survivants et
/// `eval.rs` de 212 à 219 **sur du code de production identique au bit près**
/// — seuls deux tests avaient été affaiblis la veille. Vingt-huit mutants de
/// couverture perdus d'un coup, parce que la couverture reposait sur une
/// assertion de score incidente plutôt que sur un invariant nommé.
///
/// **Profondeur 6 et non 7** : le nombre de nœuds y est tout aussi
/// déterministe, et l'arbre est assez petit pour que le test reste négligeable
/// en debug, où toute la suite tourne à chaque `verify.sh --rapide`.
///
/// **Profondeur 6 et non plus 5, depuis le 24 sept. 2026** : la génération par
/// étapes (A18) a rendu l'arbre à la profondeur 5 aveugle à trois mutants qu'il
/// voyait — la prime d'historique `depth * depth` changée en `depth + depth` ou
/// `depth / depth`, et le `ply + 1` de l'appel au coup nul changé en `ply`.
/// Mesuré mutant par mutant : 31 829 nœuds à la profondeur 5 avec ou sans eux,
/// 70 995, 70 996 et 70 758 contre 70 719 à la profondeur 6. Le balayage qui
/// a suivi la fusion d'A18 les a rendus survivants. Coût mesuré en debug :
/// 0,86 s contre 0,51 s. L'approfondissement itératif fait de la profondeur 6
/// un sur-ensemble de la 5 : l'itération 5 y est cherchée en entier.
///
/// **Conséquence assumée, la même que pour la profondeur 7** : tout changement
/// délibéré de l'arbre rend ce test rouge tant que le chiffre n'est pas
/// recopié. C'est l'effet recherché.
#[test]
fn larbre_de_recherche_ne_bouge_pas_en_silence() {
    const PROFONDEUR: u32 = 6;
    const NOEUDS: u64 = 70_594;

    let noeuds = shallowred::bench::run(PROFONDEUR).unwrap();
    assert_eq!(
        noeuds, NOEUDS,
        "l'arbre de recherche a changé : {noeuds} nœuds à la profondeur \
         {PROFONDEUR} au lieu de {NOEUDS}.\n\n\
         Si le changement est délibéré, recopier {noeuds} ici ET corriger la \
         référence de la profondeur 7 dans CLAUDE.md et README.md, que le test \
         `les_references_du_bench_dans_la_doc_sont_a_jour` vérifie. Sinon, \
         c'est une régression."
    );
}
