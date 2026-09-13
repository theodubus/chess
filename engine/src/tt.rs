//! Table de transposition.
//!
//! Un même position se rencontre par des chemins différents : `1.e4 e5 2.Cf3`
//! et `1.Cf3 e5 2.e4` donnent le même plateau. Sans mémoire, la recherche
//! refait tout le travail à chaque fois. La table associe à chaque clé Zobrist
//! ce qu'on sait déjà de la position — son score, la profondeur à laquelle il a
//! été établi, et le meilleur coup trouvé.
//!
//! # Le piège des scores de mat
//!
//! Un score de mat s'écrit `±(MATE - ply)` : il **dépend de la profondeur à
//! laquelle on se trouve**. Stocker tel quel et relire à un autre ply donnerait
//! un mat faux — annoncé trop tôt ou trop tard. Les scores de mat sont donc
//! normalisés à l'écriture (distance depuis la position, et non depuis la
//! racine) et dénormalisés à la lecture. C'est la source de bug la plus
//! classique d'une table de transposition.
//!
//! # Limites assumées
//!
//! - Un score lu ignore le chemin parcouru, donc une position nulle par
//!   répétition peut être relue comme gagnante. Tous les moteurs acceptent
//!   cette imprécision ; elle est rare et son coût est inférieur à celui de la
//!   table elle-même.
//! - L'implémentation n'est pas conçue pour un accès concurrent. Une recherche
//!   multithread demandera un stockage sans verrou.

use cozy_chess::{Move, Piece, Square};

use crate::eval::MATE_THRESHOLD;

/// Ce qu'un score stocké dit de la vraie valeur de la position.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Bound {
    /// La recherche a exploré tous les coups : le score est exact.
    Exact,
    /// Une coupure bêta : la vraie valeur est **au moins** ce score.
    Lower,
    /// Aucun coup n'a amélioré alpha : la vraie valeur est **au plus** ce score.
    Upper,
}

/// Ce que la table sait d'une position.
#[derive(Clone, Copy, Debug)]
pub struct Hit {
    /// Le meilleur coup connu, à essayer en premier même si le score est inutilisable.
    pub mv: Option<Move>,
    /// Le score, déjà ramené au ply courant.
    pub score: i32,
    /// La profondeur à laquelle ce score a été établi.
    pub depth: i8,
    /// Ce que le score garantit.
    pub bound: Bound,
}

#[derive(Clone, Copy)]
struct Entry {
    key: u64,
    score: i32,
    mv: u16,
    depth: i8,
    bound: Bound,
    generation: u8,
}

impl Entry {
    const EMPTY: Self = Self {
        key: 0,
        score: 0,
        mv: 0,
        depth: -1,
        bound: Bound::Exact,
        generation: 0,
    };
}

/// Taille par défaut, en mébioctets.
pub const DEFAULT_SIZE_MB: usize = 16;

/// La table.
pub struct TranspositionTable {
    entries: Vec<Entry>,
    /// `entries.len() - 1`. La longueur est une puissance de deux, donc un
    /// `AND` remplace le modulo dans la boucle la plus chaude.
    mask: usize,
    generation: u8,
}

impl Default for TranspositionTable {
    fn default() -> Self {
        Self::new(DEFAULT_SIZE_MB)
    }
}

impl TranspositionTable {
    /// Crée une table d'environ `megabytes` mébioctets, arrondie à la puissance
    /// de deux inférieure. Au moins une entrée.
    #[must_use]
    pub fn new(megabytes: usize) -> Self {
        let bytes = megabytes.clamp(1, 4_096) * 1024 * 1024;
        let wanted = bytes / size_of::<Entry>();
        let count = wanted.next_power_of_two().min(wanted).max(1);
        // `next_power_of_two` arrondit vers le haut ; on veut rester sous la
        // taille demandée, d'où la puissance de deux immédiatement inférieure.
        let count = if count.is_power_of_two() {
            count
        } else {
            count.next_power_of_two() / 2
        };
        Self {
            entries: vec![Entry::EMPTY; count],
            mask: count - 1,
            generation: 0,
        }
    }

    /// Vide la table. À appeler sur `ucinewgame` : les positions d'une partie
    /// précédente n'ont rien à dire sur la suivante.
    pub fn clear(&mut self) {
        self.entries.fill(Entry::EMPTY);
        self.generation = 0;
    }

    /// Marque le début d'une nouvelle recherche.
    ///
    /// Les entrées des recherches précédentes restent lisibles mais deviennent
    /// remplaçables en priorité : elles portent sur des positions que la partie
    /// a probablement dépassées.
    pub fn new_search(&mut self) {
        self.generation = self.generation.wrapping_add(1);
    }

    /// Nombre d'entrées de la table.
    #[must_use]
    pub fn capacity(&self) -> usize {
        self.entries.len()
    }

    /// Taux de remplissage en pour mille, estimé sur les mille premières
    /// entrées — c'est ce qu'attend le champ `hashfull` du protocole UCI.
    #[must_use]
    pub fn permille_used(&self) -> u32 {
        let sample = self.entries.len().min(1_000);
        if sample == 0 {
            return 0;
        }
        let used = self.entries[..sample]
            .iter()
            .filter(|entry| entry.depth >= 0)
            .count();
        u32::try_from(used * 1_000 / sample).unwrap_or(1_000)
    }

    /// Interroge la table. `ply` sert à ramener un éventuel score de mat à la
    /// profondeur courante.
    #[must_use]
    pub fn probe(&self, key: u64, ply: i32) -> Option<Hit> {
        let entry = self.entries[key as usize & self.mask];
        if entry.depth < 0 || entry.key != key {
            return None;
        }
        Some(Hit {
            mv: unpack_move(entry.mv),
            score: score_from_tt(entry.score, ply),
            depth: entry.depth,
            bound: entry.bound,
        })
    }

    /// Enregistre ce que la recherche vient d'établir.
    ///
    /// Remplace l'entrée existante si elle concerne une autre position, si elle
    /// vient d'une recherche antérieure, ou si le nouveau résultat est au moins
    /// aussi profond. Une entrée profonde de la recherche courante n'est jamais
    /// écrasée par un résultat superficiel.
    pub fn store(
        &mut self,
        key: u64,
        mv: Option<Move>,
        score: i32,
        depth: i32,
        bound: Bound,
        ply: i32,
    ) {
        let index = key as usize & self.mask;
        let existing = self.entries[index];
        let depth = i8::try_from(depth.clamp(0, i32::from(i8::MAX))).unwrap_or(i8::MAX);

        let replace = existing.depth < 0
            || existing.key != key
            || existing.generation != self.generation
            || depth >= existing.depth;
        if !replace {
            return;
        }

        // Ne pas effacer un coup connu quand la nouvelle entrée n'en a pas :
        // même sans score exploitable, un coup à essayer en premier vaut cher.
        let packed = match mv {
            Some(mv) => pack_move(mv),
            None if existing.key == key => existing.mv,
            None => 0,
        };

        self.entries[index] = Entry {
            key,
            score: score_to_tt(score, ply),
            mv: packed,
            depth,
            bound,
            generation: self.generation,
        };
    }
}

/// Normalise un score de mat avant stockage : la distance devient relative à la
/// position elle-même et non à la racine de la recherche.
fn score_to_tt(score: i32, ply: i32) -> i32 {
    if score > MATE_THRESHOLD {
        score + ply
    } else if score < -MATE_THRESHOLD {
        score - ply
    } else {
        score
    }
}

/// Opération inverse de [`score_to_tt`], appliquée à la lecture.
fn score_from_tt(score: i32, ply: i32) -> i32 {
    if score > MATE_THRESHOLD {
        score - ply
    } else if score < -MATE_THRESHOLD {
        score + ply
    } else {
        score
    }
}

/// Comprime un coup sur seize bits : six pour la case de départ, six pour
/// l'arrivée, trois pour la promotion. La valeur zéro ne code aucun coup légal
/// (a1a1) et sert donc de marqueur d'absence.
#[must_use]
pub fn pack_move(mv: Move) -> u16 {
    let from = mv.from as u16;
    let to = mv.to as u16;
    let promotion = mv.promotion.map_or(0, |piece| piece as u16 + 1);
    from | (to << 6) | (promotion << 12)
}

/// Décomprime un coup produit par [`pack_move`].
#[must_use]
pub fn unpack_move(packed: u16) -> Option<Move> {
    if packed == 0 {
        return None;
    }
    let from = Square::try_index(usize::from(packed & 0x3F))?;
    let to = Square::try_index(usize::from((packed >> 6) & 0x3F))?;
    let promotion = match (packed >> 12) & 0x7 {
        0 => None,
        index => Some(Piece::try_index(usize::from(index) - 1)?),
    };
    Some(Move {
        from,
        to,
        promotion,
    })
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]
mod tests {
    use super::*;
    use crate::eval::MATE;

    fn mv(text: &str) -> Move {
        text.parse().unwrap()
    }

    #[test]
    fn un_coup_survit_a_laller_retour() {
        for text in ["e2e4", "a1h8", "e7e8q", "b2b1n", "h7h8r", "a7a8b", "e1h1"] {
            let original = mv(text);
            assert_eq!(unpack_move(pack_move(original)), Some(original), "{text}");
        }
    }

    #[test]
    fn zero_ne_code_aucun_coup() {
        assert_eq!(unpack_move(0), None);
        // a1a1 n'est jamais légal, c'est ce qui rend le marqueur sûr.
        assert_eq!(pack_move(mv("a1a1")), 0);
    }

    #[test]
    fn un_score_ordinaire_traverse_la_table_sans_changer() {
        assert_eq!(score_from_tt(score_to_tt(42, 7), 7), 42);
        assert_eq!(score_from_tt(score_to_tt(-350, 3), 3), -350);
    }

    #[test]
    fn un_score_de_mat_est_corrige_du_ply() {
        // Un mat vu à 4 plys de la racine, relu à 10 plys, doit rester le même
        // mat vu depuis la position — pas depuis la racine.
        let score_a_la_racine = MATE - 4;
        let stocke = score_to_tt(score_a_la_racine, 4);
        assert_eq!(
            stocke, MATE,
            "la distance stockée est relative à la position"
        );
        assert_eq!(score_from_tt(stocke, 10), MATE - 10);
    }

    #[test]
    fn un_mat_subi_est_corrige_dans_lautre_sens() {
        let stocke = score_to_tt(-(MATE - 4), 4);
        assert_eq!(stocke, -MATE);
        assert_eq!(score_from_tt(stocke, 10), -(MATE - 10));
    }

    #[test]
    fn la_table_rend_ce_quelle_a_stocke() {
        let mut tt = TranspositionTable::new(1);
        tt.new_search();
        tt.store(0xDEAD_BEEF, Some(mv("e2e4")), 123, 5, Bound::Exact, 0);
        let hit = tt.probe(0xDEAD_BEEF, 0).unwrap();
        assert_eq!(hit.mv, Some(mv("e2e4")));
        assert_eq!(hit.score, 123);
        assert_eq!(hit.depth, 5);
        assert_eq!(hit.bound, Bound::Exact);
    }

    #[test]
    fn une_cle_absente_ne_rend_rien() {
        let tt = TranspositionTable::new(1);
        assert!(tt.probe(0x1234, 0).is_none());
    }

    #[test]
    fn une_entree_profonde_nest_pas_ecrasee_par_une_superficielle() {
        let mut tt = TranspositionTable::new(1);
        tt.new_search();
        tt.store(7, Some(mv("e2e4")), 100, 8, Bound::Exact, 0);
        tt.store(7, Some(mv("d2d4")), 200, 2, Bound::Exact, 0);
        assert_eq!(
            tt.probe(7, 0).unwrap().depth,
            8,
            "la profonde doit survivre"
        );
    }

    #[test]
    fn une_entree_dune_recherche_anterieure_est_remplacable() {
        let mut tt = TranspositionTable::new(1);
        tt.new_search();
        tt.store(7, Some(mv("e2e4")), 100, 8, Bound::Exact, 0);
        tt.new_search();
        tt.store(7, Some(mv("d2d4")), 200, 2, Bound::Exact, 0);
        assert_eq!(tt.probe(7, 0).unwrap().depth, 2);
    }

    #[test]
    fn un_coup_connu_nest_pas_efface_par_une_entree_sans_coup() {
        let mut tt = TranspositionTable::new(1);
        tt.new_search();
        tt.store(7, Some(mv("e2e4")), 100, 4, Bound::Exact, 0);
        tt.store(7, None, 50, 6, Bound::Upper, 0);
        assert_eq!(tt.probe(7, 0).unwrap().mv, Some(mv("e2e4")));
    }

    #[test]
    fn vider_la_table_efface_tout() {
        let mut tt = TranspositionTable::new(1);
        tt.new_search();
        tt.store(7, Some(mv("e2e4")), 100, 4, Bound::Exact, 0);
        tt.clear();
        assert!(tt.probe(7, 0).is_none());
        assert_eq!(tt.permille_used(), 0);
    }

    #[test]
    fn la_taille_est_une_puissance_de_deux_sous_la_demande() {
        for mb in [1, 2, 7, 16, 64] {
            let tt = TranspositionTable::new(mb);
            assert!(tt.capacity().is_power_of_two(), "{mb} Mio");
            assert!(
                tt.capacity() * size_of::<Entry>() <= mb * 1024 * 1024,
                "{mb} Mio dépassé"
            );
        }
    }
}
