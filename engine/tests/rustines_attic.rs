//! Les rustines de `tools/attic/` déclarent si elles s'appliquent encore sur
//! `main`. Ce contrôle confronte la déclaration à `git apply --check`.
//!
//! **Pourquoi ce test existe.** Le 22 sept. 2026, **trois lignes sur sept** de
//! la table de `tools/attic/README.md` étaient fausses. `c17-lmp.patch` et
//! `c18-sonde-echec.patch` y étaient annoncées applicables et ne l'étaient
//! plus, et la condition « après la rustine de C17 » portée par la sonde de D2
//! était tombée. Cause unique : la fusion de C17 avait déplacé
//! `engine/src/search.rs` sous elles. Personne n'avait rien fait de mal — la
//! table a vieilli pendant qu'une pull request avançait.
//!
//! **Ce que ça coûte.** Ce répertoire existe pour qu'on ne réécrive pas de
//! mémoire un code déjà écrit, testé et mesuré. Une colonne « s'applique sur
//! `main` ? » fausse envoie précisément faire ce travail-là : on applique, ça
//! échoue, et on récrit à la main ce qui existait déjà.
//!
//! **Quelle est la source de vérité, et est-ce la bonne ?** C'est la question
//! que le projet s'était donnée après l'angle mort de `see.rs` (Q4), et elle
//! tranche ici sans ambiguïté : ce n'est ni la relecture ni une liste tenue à
//! part, c'est **`git apply --check`**. Le contrôle l'appelle plutôt que de le
//! paraphraser.
//!
//! **Et il garde la copie que les humains lisent.** La déclaration reste dans
//! la table du README, pas dans un fichier annexe : déplacer la vérité ailleurs
//! aurait laissé la table dériver en silence, ce qui est exactement la faute de
//! B10 — un garde-fou qui ne couvre qu'une copie d'une donnée dupliquée ne
//! garde rien.
//!
//! **Pourquoi `#[ignore]`.** Il lance `git`, donc il exige un dépôt git.
//! `cargo mutants` travaille sur une copie de l'arbre et n'exécute jamais
//! `--ignored` : l'y laisser non ignoré risquerait de faire échouer le
//! balayage hebdomadaire sur une panne d'environnement plutôt que sur un
//! défaut. La cécité du cliquet que J-2026-09-22-A a payée cher ne s'applique
//! pas ici — **aucun mutant d'`engine/src/` ne peut changer si une rustine
//! s'applique**, donc ce test n'a aucun mutant à tuer. Il tourne en CI par
//! l'étape des critères d'acceptation, et localement par `tools/verify.sh`.
//!
//! **Ce qu'il ne fait pas.** Il ne juge ni l'utilité d'une rustine, ni la
//! justesse de la prose qui l'accompagne. Il vérifie qu'une affirmation
//! mécaniquement vérifiable est vraie — c'est peu, et c'est exactement ce
//! qu'une machine peut garantir.

#![expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]

use std::path::{Path, PathBuf};
use std::process::Command;

/// Le marqueur porté par la cellule qui déclare l'applicabilité.
///
/// Il nomme la commande qui tranche, ce qui le rend assez spécifique pour ne
/// pas se produire par accident — leçon du marqueur trop court de B10, où
/// `référence :` entrait en collision avec une phrase sans rapport.
const MARQUEUR: &str = "git apply --check :";

/// La racine du dépôt.
fn racine() -> PathBuf {
    Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/..")).to_path_buf()
}

/// Débarrasse une ligne de Markdown de son emphase et de ses accents graves.
///
/// La table écrit `` `git apply --check` : **oui** `` pour que la cellule se
/// lise ; le contrôle n'a que faire de la décoration.
fn sans_decoration(ligne: &str) -> String {
    ligne.replace(['`', '*', '_'], "")
}

/// Les rustines, **parcourues et non énumérées à la main**.
///
/// Une liste écrite à la main laisserait mon jugement décider de la couverture,
/// ce qui est la faute même que ce test doit rendre impossible. C'est la règle
/// déjà appliquée par `outillage_documente.rs` et `couverture_mutation.rs`.
fn rustines(racine: &Path) -> Vec<PathBuf> {
    let mut trouvees = Vec::new();
    let Ok(entrees) = std::fs::read_dir(racine.join("tools/attic")) else {
        return trouvees;
    };
    for entree in entrees.flatten() {
        let chemin = entree.path();
        if chemin.is_file() && entree.file_name().to_string_lossy().ends_with(".patch") {
            trouvees.push(chemin);
        }
    }
    trouvees.sort();
    trouvees
}

/// La rustine que cette ligne de table identifie : sa **première cellule**.
///
/// C'est la première cellule qui identifie la ligne, jamais une mention dans
/// la prose des autres. Sans cette distinction, une cellule qui renvoie à une
/// autre rustine — ce que la table fait, et doit pouvoir faire — compterait
/// pour une seconde déclaration.
fn rustine_identifiee(ligne: &str) -> Option<String> {
    let nu = sans_decoration(ligne);
    let premiere = nu.strip_prefix('|')?.split('|').next()?.trim().to_string();
    premiere.ends_with(".patch").then_some(premiere)
}

/// Ce qu'une ligne déclare.
///
/// - `Ok(None)` — la ligne ne déclare rien, c'est de la prose ordinaire ;
/// - `Ok(Some(true))` / `Ok(Some(false))` — déclaration lisible ;
/// - `Err(_)` — le marqueur est là et ce qui suit est illisible.
///
/// **Le troisième cas est le point du dessin.** Un lecteur qui rendrait `None`
/// sur une cellule reformatée ferait passer le contrôle pour toujours, le jour
/// où quelqu'un remanierait la table. *Un contrôle qui ne trouve plus ce qu'il
/// contrôle doit mourir bruyamment, jamais devenir une assertion vide.*
fn declaration(ligne: &str) -> Result<Option<bool>, String> {
    let nu = sans_decoration(ligne);
    let Some(apres) = nu.split(MARQUEUR).nth(1) else {
        return Ok(None);
    };
    let verdict = apres.trim_start();
    if verdict.starts_with("oui") {
        Ok(Some(true))
    } else if verdict.starts_with("non") {
        Ok(Some(false))
    } else {
        Err(format!(
            "marqueur « {MARQUEUR} » suivi de quelque chose d'illisible : « {} »",
            verdict.chars().take(40).collect::<String>()
        ))
    }
}

/// `git apply --check` sur une rustine, depuis la racine du dépôt.
fn sapplique(racine: &Path, rustine: &Path) -> bool {
    let sortie = Command::new("git")
        .arg("-C")
        .arg(racine)
        .args(["apply", "--check"])
        .arg(rustine)
        .output()
        .unwrap_or_else(|e| panic!("git introuvable ou inexécutable : {e}"));
    sortie.status.success()
}

#[test]
#[ignore = "lance git : critère d'acceptation, hors du balayage par mutation"]
fn chaque_rustine_sapplique_comme_la_table_lannonce() {
    let racine = racine();

    // Un arbre sans git rendrait « aucune faute » et passerait pour un succès.
    // Vérifié d'abord, et bruyamment.
    let git = Command::new("git")
        .arg("-C")
        .arg(&racine)
        .args(["rev-parse", "--git-dir"])
        .output()
        .unwrap_or_else(|e| panic!("git introuvable ou inexécutable : {e}"));
    assert!(
        git.status.success(),
        "pas un dépôt git : ce contrôle ne peut pas s'exécuter, et il ne doit \
         pas passer en silence"
    );

    let rustines = rustines(&racine);
    assert!(
        rustines.len() >= 5,
        "parcours de tools/attic/ cassé : {} rustine(s) trouvée(s), au moins \
         cinq attendues",
        rustines.len()
    );

    let readme = racine.join("tools/attic/README.md");
    let texte = std::fs::read_to_string(&readme)
        .unwrap_or_else(|e| panic!("tools/attic/README.md illisible : {e}"));

    // Les lignes qui déclarent, relevées une fois pour les deux sens du
    // contrôle. Un marqueur sans première cellule est une table remaniée de
    // travers : on le dit plutôt que de l'ignorer.
    let mut declarations = Vec::new();
    for (index, ligne) in texte.lines().enumerate() {
        let numero = index + 1;
        let valeur = match declaration(ligne) {
            Ok(Some(valeur)) => valeur,
            Ok(None) => continue,
            Err(raison) => panic!("tools/attic/README.md, ligne {numero} : {raison}"),
        };
        let nom = rustine_identifiee(ligne).unwrap_or_else(|| {
            panic!(
                "tools/attic/README.md, ligne {numero} : déclaration dont la \
                 première cellule ne nomme aucun fichier `.patch`"
            )
        });
        declarations.push((numero, nom, valeur));
    }

    let mut fautes = Vec::new();

    // Sens 1 — chaque rustine du répertoire est déclarée, une fois et une
    // seule, et la déclaration dit vrai.
    for rustine in &rustines {
        let nom = rustine.file_name().unwrap().to_string_lossy().to_string();
        let portant: Vec<_> = declarations.iter().filter(|(_, n, _)| *n == nom).collect();

        match portant.as_slice() {
            [] => fautes.push(format!(
                "{nom} : aucune ligne de la table ne la déclare. Lui ajouter \
                 une ligne portant « {MARQUEUR} oui » ou « {MARQUEUR} non »."
            )),
            [(numero, _, annonce)] => {
                let reel = sapplique(&racine, rustine);
                if *annonce != reel {
                    fautes.push(format!(
                        "{nom} : la table (ligne {numero}) annonce « {} », \
                         git apply --check dit « {} »",
                        if *annonce { "oui" } else { "non" },
                        if reel { "oui" } else { "non" },
                    ));
                }
            }
            plusieurs => fautes.push(format!(
                "{nom} : {} lignes la déclarent (lignes {}). Une rustine se \
                 déclare une fois et une seule, sans quoi deux verdicts \
                 divergent sans bruit.",
                plusieurs.len(),
                plusieurs
                    .iter()
                    .map(|(n, _, _)| n.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            )),
        }
    }

    // Sens 2 — l'inverse : une déclaration qui ne correspond à aucune rustine
    // est une entrée morte. Sans ce sens-là, supprimer une rustine laisserait
    // sa ligne mentir indéfiniment. Même geste que `couverture_mutation.rs`.
    let noms: Vec<String> = rustines
        .iter()
        .map(|r| r.file_name().unwrap().to_string_lossy().to_string())
        .collect();
    for (numero, nom, _) in &declarations {
        if !noms.contains(nom) {
            fautes.push(format!(
                "ligne {numero} : déclare « {nom} », qui n'existe pas dans \
                 tools/attic/ — entrée morte à retirer"
            ));
        }
    }

    assert!(
        fautes.is_empty(),
        "tools/attic/README.md ne dit plus la vérité sur {} point(s) :\n  {}\n\n\
         Ce répertoire existe pour qu'on ne réécrive pas de mémoire un code \
         déjà écrit et mesuré ; une colonne fausse y envoie précisément.\n\
         Une rustine qui cesse de s'appliquer parce que son code est ENTRÉ \
         dans `main` n'est pas une régression : c'est un rejet levé, et il se \
         raconte dans la colonne au lieu de se corriger en silence.",
        fautes.len(),
        fautes.join("\n  ")
    );
}

#[test]
fn le_controle_voit_les_rustines_quil_doit_voir() {
    // Sans ce test, un parcours qui ne descend plus dans `tools/attic/`
    // rendrait « aucune faute » et passerait pour un succès.
    let noms: Vec<String> = rustines(&racine())
        .iter()
        .map(|r| r.file_name().unwrap().to_string_lossy().to_string())
        .collect();

    for attendu in ["c12-pvs.patch", "c17-lmp.patch", "c19-see-ordering.patch"] {
        assert!(
            noms.contains(&attendu.to_string()),
            "{attendu} devrait être vu par le contrôle ; vus : {noms:?}"
        );
    }
}

#[test]
fn une_declaration_se_lit_malgre_lemphase() {
    assert_eq!(
        declaration("| `c17-lmp.patch` | … | `git apply --check` : **non** — … |"),
        Ok(Some(false))
    );
    assert_eq!(
        declaration("| `d2-sonde-pv.patch` | … | `git apply --check` : **oui** |"),
        Ok(Some(true))
    );
}

#[test]
fn la_premiere_cellule_identifie_la_ligne_pas_la_prose() {
    // Le cas qui a motivé la règle : une cellule qui renvoie à une AUTRE
    // rustine. Sans cette distinction, la ligne compterait pour deux
    // déclarations et le contrôle crierait sur une table juste.
    let ligne = "| `d2-sonde-pv.patch` | sonde | — | `git apply --check` : \
                 **oui**, la condition « après `c17-lmp.patch` » est tombée |";
    assert_eq!(rustine_identifiee(ligne), Some("d2-sonde-pv.patch".into()));
}

#[test]
fn la_prose_ordinaire_ne_declare_rien() {
    // Le bloc shell du README porte la commande sans deux-points. Il ne doit
    // pas être lu comme une déclaration.
    assert_eq!(
        declaration("git apply --check tools/attic/c17-lmp.patch   # avant d'appliquer"),
        Ok(None)
    );
    assert_eq!(declaration("Une rustine ici n'autorise rien."), Ok(None));
    assert_eq!(rustine_identifiee("Une rustine ici n'autorise rien."), None);
}

#[test]
fn un_marqueur_illisible_fait_echouer_au_lieu_de_passer() {
    // Le cas qui compte : quelqu'un remanie la table, le marqueur survit et
    // son verdict non. Rendre `None` ici ferait passer le contrôle pour
    // toujours.
    let lu = declaration("| … | `git apply --check` : peut-être |");
    assert!(lu.is_err(), "attendu une erreur, obtenu {lu:?}");
}
