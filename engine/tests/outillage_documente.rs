//! Tout dispositif automatique du dépôt doit être **nommé** dans la
//! documentation.
//!
//! **Pourquoi ce test existe.** Le 15 sept. 2026, un audit a montré que six
//! pièces d'outillage n'apparaissaient dans aucun fichier Markdown : les deux
//! hooks de `.claude/`, leur déclaration `settings.json`, leur auto-test, et
//! les deux workflows GitHub. `CLAUDE.md` mentionnait bien « deux hooks de
//! projet, dans `.claude/` » — sans nommer les fichiers, donc sans qu'une
//! session future puisse les lire.
//!
//! Le trou s'était creusé en une seule journée, celle où ces outils ont été
//! écrits. Une bonne résolution ne l'aurait pas refermé durablement.
//!
//! **Un dispositif que la documentation ne nomme pas est un dispositif que la
//! session suivante prendra pour une panne** — ou refera. C'est la même
//! famille que le chiffre de référence périmé : ce n'est pas le code qui
//! ment, c'est ce qui permet de le reprendre.
//!
//! Le contrôle ne juge pas la qualité de la description, seulement qu'elle
//! existe. C'est peu, et c'est exactement ce qu'une machine peut vérifier.

#![expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]

use std::path::{Path, PathBuf};

/// Les couches gelées de la mémoire : le journal, les demandes et les
/// décisions portent de l'histoire datée, pas la documentation d'un outil.
/// Le 17 nov. 2026, l'ancienne section de `CLAUDE.md` qui liste les
/// dispositifs a été archivée telle quelle au journal (B-0009) : parcouru,
/// le journal nommait encore chaque dispositif, et en retirer un de
/// `CLAUDE.md` laissait ce test vert. Écartées par leur chemin, jamais par
/// leur seul nom, comme dans `bench_reference.rs`.
const GELEES: [&str; 3] = ["memory/journal", "memory/requests", "memory/decisions"];

/// Les fichiers de documentation du dépôt, parcourus et non énumérés à la
/// main : une liste écrite à la main laisserait mon jugement décider de la
/// couverture, ce qui est la faute même que ce test doit empêcher. Les
/// couches gelées de la mémoire n'en sont pas (voir [`GELEES`]).
fn documents(root: &Path) -> Vec<(String, String)> {
    let mut trouves = Vec::new();
    let mut a_visiter = vec![root.to_path_buf()];

    while let Some(dossier) = a_visiter.pop() {
        let Ok(entrees) = std::fs::read_dir(&dossier) else {
            continue;
        };
        for entree in entrees.flatten() {
            let chemin = entree.path();
            let nom = entree.file_name().to_string_lossy().to_string();
            if chemin.is_dir() {
                // `target/` est du produit de compilation, et un répertoire
                // caché n'est pas de la documentation — sauf `.github`, qui
                // porte le plafond de mutation et ses explications.
                if nom == "target" || (nom.starts_with('.') && nom != ".github") {
                    continue;
                }
                if chemin
                    .strip_prefix(root)
                    .is_ok_and(|r| GELEES.iter().any(|g| r == Path::new(g)))
                {
                    continue;
                }
                a_visiter.push(chemin);
            } else if (nom.ends_with(".md") || nom.ends_with(".txt"))
                && let Ok(texte) = std::fs::read_to_string(&chemin)
            {
                trouves.push((nom, texte));
            }
        }
    }
    trouves
}

/// Les dispositifs qui s'exécutent sans qu'on les appelle, ou qui sont le
/// point d'entrée d'une vérification. Énumérés par extension et par
/// répertoire, jamais nommés un par un : un script ajouté demain est couvert
/// sans que personne y pense.
fn dispositifs(root: &Path) -> Vec<PathBuf> {
    let mut trouves = Vec::new();
    for (dossier, extensions) in [
        ("tools", &[".sh"][..]),
        // `tools/src/bin` était le TROU de ce garde-fou, et il l'a laissé
        // passer deux fois. Le 22 sept. 2026, trois sondes jetables y ont été
        // déposées : cargo découvre `src/bin/*.rs` tout seul, donc elles ont
        // été compilées sans être déclarées ni documentées — et l'arbre a
        // cessé de compiler dès que l'instrumentation qu'elles importaient a
        // été retirée. En le bouchant on découvre que `attack_dump.rs` y
        // dormait déjà, non documenté, depuis sa création.
        //
        // Même famille que Q4 (`see.rs` hors du cliquet de mutation) : le
        // garde-fou était correct et gardait le mauvais ensemble. La question
        // n'est pas « ce dispositif marche-t-il ? » mais « quelle est sa
        // source de vérité, et est-ce la bonne ? » — ici le répertoire que
        // cargo compile, jamais celui qu'on a en tête.
        ("tools/src/bin", &[".rs"][..]),
        (".github", &[".sh", ".txt"][..]),
        (".github/workflows", &[".yml", ".yaml"][..]),
        (".claude", &[".json"][..]),
        (".claude/hooks", &[".sh"][..]),
    ] {
        let Ok(entrees) = std::fs::read_dir(root.join(dossier)) else {
            continue;
        };
        for entree in entrees.flatten() {
            let chemin = entree.path();
            if !chemin.is_file() {
                continue;
            }
            let nom = entree.file_name().to_string_lossy().to_string();
            if extensions.iter().any(|e| nom.ends_with(e)) {
                trouves.push(chemin);
            }
        }
    }
    trouves
}

#[test]
fn chaque_dispositif_automatique_est_nomme_dans_la_documentation() {
    let root = Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/.."));
    let docs = documents(root);

    // Un parcours cassé ne doit pas se traduire par « rien à vérifier, donc
    // tout va bien ». Ces deux-là existent ; leur absence dit que c'est le
    // contrôle qui est en panne. Les instructions vivent dans `AGENTS.md`,
    // que `CLAUDE.md` importe en une ligne (D-0029).
    for attendu in ["AGENTS.md", "README.md"] {
        assert!(
            docs.iter().any(|(nom, _)| nom == attendu),
            "parcours de la documentation cassé : {attendu} introuvable"
        );
    }

    let outils = dispositifs(root);
    assert!(
        outils.len() >= 10,
        "parcours des dispositifs cassé : {} trouvé(s), au moins dix attendus",
        outils.len()
    );

    let mut orphelins = Vec::new();
    for outil in &outils {
        let nom = outil.file_name().unwrap().to_string_lossy().to_string();
        // Le plafond de mutation se documente lui-même : il porte la raison
        // écrite de chacune de ses valeurs. L'exiger dans un AUTRE fichier
        // n'ajouterait rien.
        let cite = docs
            .iter()
            .any(|(fichier, texte)| *fichier != nom && texte.contains(&nom));
        if !cite {
            orphelins.push(
                outil
                    .strip_prefix(root)
                    .unwrap_or(outil)
                    .display()
                    .to_string(),
            );
        }
    }

    assert!(
        orphelins.is_empty(),
        "dispositif(s) qu'aucun fichier de documentation ne nomme :\n  {}\n\n\
         Un dispositif que la documentation ne nomme pas est un dispositif que \
         la session suivante prendra pour une panne, ou refera. Ajouter son nom \
         de fichier à CLAUDE.md, README.md ou tools/README.md, avec ce qu'il \
         fait et pourquoi il existe.",
        orphelins.join("\n  ")
    );
}

#[test]
fn le_controle_voit_les_dispositifs_quil_doit_voir() {
    // Sans ce test, un parcours qui ne descend plus dans `.claude/hooks`
    // rendrait « aucun orphelin » et passerait pour un succès.
    let root = Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/.."));
    let noms: Vec<String> = dispositifs(root)
        .iter()
        .map(|c| c.file_name().unwrap().to_string_lossy().to_string())
        .collect();

    for attendu in [
        "verify.sh",
        "mutants.sh",
        "settings.json",
        "no-fabricated-sha.sh",
        "mutation.yml",
        "mutation-baseline.txt",
    ] {
        assert!(
            noms.contains(&attendu.to_string()),
            "{attendu} devrait être vu par le contrôle ; vus : {noms:?}"
        );
    }
}

#[test]
fn les_couches_gelees_de_la_memoire_ne_documentent_rien() {
    // Sur un arbre fabriqué : un nom de dispositif écrit dans un fichier
    // ordinaire, dans trois dossiers nommés comme les couches gelées hors de
    // la mémoire, dans le reste de la mémoire, et dans chaque couche gelée.
    // Seules les couches gelées sont écartées : une couche s'écarte par son
    // chemin, jamais par son seul nom. Les trois couches sont écrites ici en
    // toutes lettres, et non lues dans `GELEES` : un cas qui tirerait ses
    // attendus de la constante qu'il garde resterait vrai si on la
    // raccourcissait.
    let root = std::env::temp_dir().join(format!("outillage-documente-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let ecrire = |relatif: &str| {
        let chemin = root.join(relatif);
        std::fs::create_dir_all(chemin.parent().unwrap()).unwrap();
        std::fs::write(&chemin, format!("{relatif} nomme sonde.sh\n")).unwrap();
    };
    let lus_attendus = [
        "README.md",
        "autre/journal/notes.md",
        "autre/requests/notes.md",
        "autre/decisions/notes.md",
        "memory/active.md",
        "memory/backlog/B-0001.md",
    ];
    let ecartes = [
        "memory/journal/2026-11.md",
        "memory/requests/D-0001.md",
        "memory/decisions/ADR-0001.md",
    ];
    for relatif in lus_attendus.iter().chain(&ecartes) {
        ecrire(relatif);
    }

    let docs = documents(&root);
    std::fs::remove_dir_all(&root).unwrap();
    let mut lus: Vec<String> = docs
        .iter()
        .map(|(_, texte)| texte.split(' ').next().unwrap().to_owned())
        .collect();
    lus.sort();
    let mut attendus: Vec<String> = lus_attendus.iter().map(|s| (*s).to_owned()).collect();
    attendus.sort();
    assert_eq!(lus, attendus, "parcourus : {lus:?}");
}
