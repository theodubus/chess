//! Un piège archivé doit être **réellement** tenu par le dispositif qu'il
//! nomme.
//!
//! **Pourquoi ce test existe.** `tools/pieges-fermes.md` porte les pièges
//! retirés de `CLAUDE.md` au motif qu'un code de sortie les rend désormais
//! inexprimables. Le fichier annonce sa propre condition de sortie — *si un de
//! ces dispositifs disparaît, son piège revient dans `CLAUDE.md`* — et rien ne
//! la vérifiait. **Un fichier qui affirme quelque chose sur le code est
//! exactement ce que ce dépôt a appris à ne pas croire sur parole** : c'est la
//! faute de `tools/attic/README.md`, dont trois lignes sur sept étaient
//! fausses le 22 sept. 2026 sans que personne n'ait rien fait de mal.
//!
//! Le mode de défaillance qu'il attrape est silencieux : on supprime ou on
//! renomme `ref.sh`, l'archive continue d'annoncer que le piège est tenu, et
//! plus rien ne le tient. Le piège serait alors **moins** protégé qu'avant
//! d'être archivé.
//!
//! Le contrôle est délibérément faible — il vérifie l'existence du fichier
//! nommé, pas qu'il fait ce qu'il promet. C'est peu, et c'est exactement ce
//! qu'une machine peut vérifier sans juger.

#![expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]

use std::path::Path;

const ARCHIVE: &str = "tools/pieges-fermes.md";
const MARQUEUR: &str = "**Tenu par**";

/// Les chemins cités entre accents graves sur une ligne.
///
/// Un jeton n'est retenu que s'il ressemble à un chemin : il contient une
/// barre oblique, ou porte une extension du dépôt. Sans ce filtre, un nom de
/// fonction cité entre accents graves passerait pour un fichier absent.
fn chemins_cites(ligne: &str) -> Vec<String> {
    ligne
        .split('`')
        .skip(1)
        .step_by(2)
        .filter(|jeton| {
            // Une commande citée entre accents graves contient une espace ;
            // un chemin, jamais. Sans cette clause, `git log origin/main..HEAD`
            // serait cherché sur le disque — le contrôle a crié là-dessus à sa
            // première exécution, et un garde-fou qui crie à tort finit désarmé.
            !jeton.contains(' ')
                && (jeton.contains('/')
                    || jeton.ends_with(".sh")
                    || jeton.ends_with(".rs")
                    || jeton.ends_with(".yml"))
        })
        .map(str::to_owned)
        .collect()
}

#[test]
fn chaque_piege_archive_nomme_un_dispositif_qui_existe() {
    let root = Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/.."));
    let texte = std::fs::read_to_string(root.join(ARCHIVE))
        .unwrap_or_else(|e| panic!("{ARCHIVE} illisible : {e}"));

    // Une puce sans ligne « Tenu par » est un piège archivé sans raison de
    // l'être : il aurait dû rester dans CLAUDE.md.
    let puces = texte.lines().filter(|l| l.starts_with("- **")).count();
    let tenus: Vec<&str> = texte.lines().filter(|l| l.contains(MARQUEUR)).collect();
    assert_eq!(
        puces,
        tenus.len(),
        "{ARCHIVE} : {puces} piège(s) et {} ligne(s) « {MARQUEUR} ».\n\
         Chaque piège archivé doit nommer le dispositif qui le tient — sans \
         quoi rien ne dit pourquoi il a quitté CLAUDE.md.",
        tenus.len()
    );

    // Un parcours cassé ne doit pas se lire « rien à vérifier, donc tout va
    // bien » : le fichier existe et porte des pièges, son silence est une
    // panne du contrôle.
    assert!(
        puces > 0,
        "{ARCHIVE} ne porte aucun piège : c'est le contrôle qui est en panne, \
         ou le fichier a été vidé."
    );

    let mut manquants = Vec::new();
    for ligne in &tenus {
        let cites = chemins_cites(ligne);
        assert!(
            !cites.is_empty(),
            "{ARCHIVE} : cette ligne ne nomme aucun fichier, donc rien ne peut \
             la vérifier :\n  {}\n\n\
             Nommer le fichier du dispositif, pas seulement ce qu'il fait.",
            ligne.trim()
        );
        for chemin in cites {
            if !root.join(&chemin).exists() {
                manquants.push(format!("{chemin}  (cité par « {} »)", ligne.trim()));
            }
        }
    }

    assert!(
        manquants.is_empty(),
        "dispositif(s) nommé(s) par {ARCHIVE} mais absent(s) du dépôt :\n  {}\n\n\
         Un piège archivé l'a été parce qu'un code de sortie le rendait \
         inexprimable. Si ce dispositif n'existe plus, le piège n'est plus tenu \
         par rien — le REMETTRE dans CLAUDE.md, ou corriger le chemin.",
        manquants.join("\n  ")
    );
}

#[test]
fn larchive_reste_atteignable_depuis_claude_md() {
    // Un fichier que rien ne nomme est un fichier qu'aucune session ne lira.
    // Le renvoi de CLAUDE.md est la seule porte d'entrée de cette archive.
    let root = Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/.."));
    let claude = std::fs::read_to_string(root.join("CLAUDE.md")).unwrap();
    assert!(
        claude.contains(ARCHIVE),
        "CLAUDE.md ne nomme plus {ARCHIVE} : l'archive devient injoignable, et \
         les pièges qu'elle porte deviennent invisibles à une session neuve."
    );
}

#[test]
fn un_nom_de_fonction_nest_pas_pris_pour_un_fichier() {
    // Le filtre qui compte : sans lui, `larbre_de_recherche_ne_bouge_pas_en_silence`
    // serait cherché sur le disque et le contrôle crierait pour rien. Un
    // garde-fou qui crie à tort finit désarmé.
    let ligne = "  <br>**Tenu par** : `engine/tests/bench_reference.rs`, test \
                 `larbre_de_recherche_ne_bouge_pas_en_silence` — le banc figé.";
    assert_eq!(
        chemins_cites(ligne),
        vec!["engine/tests/bench_reference.rs"]
    );
}

#[test]
fn une_commande_nest_pas_prise_pour_un_chemin() {
    // Relevé par le contrôle lui-même à sa première exécution.
    let ligne = "**Tenu par** : `tools/etat.sh`, qui imprime `git log origin/main..HEAD`.";
    assert_eq!(chemins_cites(ligne), vec!["tools/etat.sh"]);
}

#[test]
fn une_ligne_sans_accent_grave_ne_rend_rien() {
    assert!(chemins_cites("**Tenu par** : un test quelque part.").is_empty());
}
