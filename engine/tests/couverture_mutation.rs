//! Tout fichier de `engine/src/` doit être **dans les deux listes** du
//! dispositif de mutation : la matrice de `.github/workflows/mutation.yml`,
//! qui décide ce qui est balayé, et `.github/mutation-baseline.txt`, qui
//! décide ce qui est comparé à un plafond.
//!
//! **Pourquoi ce test existe.** `engine/src/see.rs` est né le 16 sept. 2026.
//! Il n'a été ajouté ni à l'une ni à l'autre — deux listes écrites à la main,
//! dans deux fichiers différents, qu'aucun contrôle ne confrontait au contenu
//! du répertoire. Il est resté cinq jours hors du cliquet, avec 59 mutants
//! jamais balayés.
//!
//! Et **rien ne pouvait le signaler**, parce que les deux omissions se
//! couvrent l'une l'autre :
//!
//! - absent du seul plafond → le verdict énumère les entrées du plafond, donc
//!   il ne cherche pas son résumé ;
//! - absent de la seule matrice → le verdict cherche un résumé qui n'existe
//!   pas, et casse en « RÉSUMÉ ABSENT » ;
//! - absent des **deux** → le balayage ne le produit pas, le verdict ne le
//!   réclame pas. Le fichier n'apparaît nulle part, et le journal hebdomadaire
//!   est vert.
//!
//! C'est la même faute que le chiffre de référence gardé dans un seul fichier
//! alors qu'il vivait dans deux : **avant d'écrire un garde-fou, chercher
//! toutes les copies de ce qu'il garde.** Ici le garde-fou existait bien, mais
//! il gardait la liste au lieu de garder le répertoire.
//!
//! **Le répertoire est la source de vérité**, et il est parcouru — jamais
//! énuméré à la main. Une liste écrite à la main laisserait mon jugement
//! décider de la couverture, ce qui est exactement la faute que ce test doit
//! rendre impossible.

#![expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]

use std::path::{Path, PathBuf};

fn racine() -> PathBuf {
    Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/..")).to_path_buf()
}

/// Les fichiers source du moteur, par répertoire et par extension.
fn sources(root: &Path) -> Vec<String> {
    let mut trouves: Vec<String> = std::fs::read_dir(root.join("engine/src"))
        .unwrap()
        .flatten()
        .filter(|e| e.path().is_file())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.ends_with(".rs"))
        .collect();
    trouves.sort();
    trouves
}

/// La liste `fichier:` de la matrice du workflow.
///
/// Un analyseur YAML complet serait une dépendance pour lire neuf lignes. Ce
/// qu'on cherche est une clé dont le nom est exactement `fichier`, suivie
/// d'entrées de liste : tout autre découpage du fichier ferait échouer le
/// contrôle de cohérence plus bas, qui est là pour ça.
fn matrice(root: &Path) -> Vec<String> {
    let texte = std::fs::read_to_string(root.join(".github/workflows/mutation.yml")).unwrap();
    let mut entrees = Vec::new();
    let mut dedans = false;
    for ligne in texte.lines() {
        let nu = ligne.trim();
        if nu == "fichier:" {
            dedans = true;
            continue;
        }
        if !dedans {
            continue;
        }
        if let Some(valeur) = nu.strip_prefix("- ") {
            entrees.push(valeur.trim().to_string());
        } else if !nu.is_empty() && !nu.starts_with('#') {
            break;
        }
    }
    entrees
}

/// Les noms de fichier du plafond, dans l'ordre où ils y figurent.
fn plafond(root: &Path) -> Vec<String> {
    let texte = std::fs::read_to_string(root.join(".github/mutation-baseline.txt")).unwrap();
    texte
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .filter_map(|l| l.split_whitespace().next().map(str::to_string))
        .collect()
}

/// Un fichier sans une seule `fn` ne produit aucun mutant : `cargo mutants`
/// ne mute que des corps de fonction et les opérateurs qu'ils contiennent.
/// `lib.rs` est dans ce cas — il ne porte que des déclarations `pub mod` et
/// la documentation des invariants. Vérifié : `cargo mutants --list` y annonce
/// zéro mutant.
///
/// L'exemption est donc une propriété du fichier, pas un nom inscrit quelque
/// part. Le jour où `lib.rs` recevra une fonction, ce test réclamera son
/// entrée dans les deux listes sans que personne ait à y penser.
fn porte_du_code(root: &Path, nom: &str) -> bool {
    let texte = std::fs::read_to_string(root.join("engine/src").join(nom)).unwrap();
    texte
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .any(|mot| mot == "fn")
}

#[test]
fn chaque_source_du_moteur_est_dans_les_deux_listes() {
    let root = racine();
    let matrice = matrice(&root);
    let plafond = plafond(&root);

    let mut absents = Vec::new();
    for nom in sources(&root) {
        if !porte_du_code(&root, &nom) {
            continue;
        }
        let dans_matrice = matrice.contains(&nom);
        let dans_plafond = plafond.contains(&nom);
        if !dans_matrice || !dans_plafond {
            absents.push(format!(
                "{nom} — matrice : {}, plafond : {}",
                if dans_matrice { "oui" } else { "NON" },
                if dans_plafond { "oui" } else { "NON" },
            ));
        }
    }

    assert!(
        absents.is_empty(),
        "fichier(s) de `engine/src/` hors du cliquet de mutation :\n  {}\n\n\
         Ajouter le nom à la matrice `fichier:` de \
         `.github/workflows/mutation.yml` ET à `.github/mutation-baseline.txt`. \
         Un fichier absent des DEUX listes n'apparaît dans aucun journal : le \
         balayage ne le produit pas, le verdict ne le réclame pas, et le \
         cliquet est vert sur du code que rien ne couvre.\n\n\
         Le plafond se MESURE, il ne s'estime pas — et il se mesure DEPUIS UN \
         ARBRE VERT : `cargo mutants` refuse de balayer un arbre dont les tests \
         échouent, or ce test-ci est rouge tant que le plafond manque. Donc \
         soit `.github/workflows/mutation.yml` par `workflow_dispatch`, soit \
         `git worktree add --detach /tmp/mesure HEAD~1` puis \
         `tools/mutants.sh --file engine/src/<nom>` là-bas.",
        absents.join("\n  ")
    );
}

#[test]
fn les_deux_listes_ne_nomment_que_des_fichiers_existants() {
    // L'autre sens du même contrôle : un fichier renommé ou supprimé laisse
    // une entrée morte. Dans la matrice elle fait échouer un job entier ; dans
    // le plafond elle fait dire « RÉSUMÉ ABSENT » au verdict — une semaine
    // après, sur un runner, loin de la personne qui a renommé.
    let root = racine();
    let sources = sources(&root);
    for (origine, liste) in [("matrice", matrice(&root)), ("plafond", plafond(&root))] {
        for nom in liste {
            assert!(
                sources.contains(&nom),
                "{origine} : `{nom}` ne correspond à aucun fichier de `engine/src/`"
            );
        }
    }
}

#[test]
fn le_controle_lit_bien_les_deux_listes() {
    // Sans ce test, un analyseur cassé rendrait deux listes vides, donc
    // « aucun absent », donc un succès. C'est la panne la plus probable des
    // deux fonctions ci-dessus : elles lisent du YAML et du texte libre.
    let root = racine();
    let sources = sources(&root);
    let matrice = matrice(&root);
    let plafond = plafond(&root);

    assert!(
        sources.len() >= 8,
        "parcours de `engine/src/` cassé : {} fichier(s)",
        sources.len()
    );
    for attendu in ["search.rs", "see.rs", "lib.rs"] {
        assert!(sources.contains(&attendu.to_string()), "{attendu} attendu");
    }
    for (origine, liste) in [("matrice", &matrice), ("plafond", &plafond)] {
        assert!(
            liste.len() >= 8,
            "lecture du {origine} cassée : {} entrée(s) — {liste:?}",
            liste.len()
        );
        assert!(
            liste.contains(&"search.rs".to_string()),
            "lecture du {origine} cassée : search.rs absent — {liste:?}"
        );
    }
    // `lib.rs` ne porte aucune `fn`, les autres en portent : c'est ce qui
    // rend l'exemption vérifiable plutôt que déclarée.
    assert!(!porte_du_code(&root, "lib.rs"), "lib.rs porte du code ?");
    assert!(porte_du_code(&root, "see.rs"), "see.rs n'en porte pas ?");
}
