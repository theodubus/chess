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
//!
//! # Les seaux
//!
//! Une clé ne désigne pas une entrée mais un **seau de quatre**, une ligne de
//! cache. Une position qui arrive dans un seau plein y prend la place de
//! l'entrée qui vaut le moins — sa profondeur, moins huit par recherche
//! écoulée —, et non celle de l'unique entrée qu'une case lui aurait laissée.
//! La raison est mesurée (C28, 29 sept. 2026) : sous la pression que subit la
//! table à cadence longue, la case unique coûtait −19,42 ± 5,78 Elo.
//!
//! # Le stockage sans verrou
//!
//! Chaque entrée tient en **deux mots de 64 bits** : le premier porte
//! `clé XOR données`, le second les données. Un lecteur reconstruit la clé par
//! un XOR ; si les deux mots viennent d'écritures différentes — une entrée
//! *déchirée* par un autre fil —, la clé reconstruite ne correspond à rien et
//! l'entrée se rejette comme une collision ordinaire. **Pas de verrou, et la
//! seule conséquence d'un déchirement est un défaut de cache, jamais un score
//! faux.** C'est le schéma de Hyatt.
//!
//! Toutes les méthodes prennent donc `&self`, y compris celles qui écrivent :
//! c'est ce qui rend la table partageable entre plusieurs fils de recherche.

use std::sync::atomic::{AtomicU8, AtomicU64, Ordering};

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

impl Bound {
    /// Deux bits suffisent : la borne n'a que trois valeurs.
    const fn to_bits(self) -> u64 {
        match self {
            Self::Exact => 0,
            Self::Lower => 1,
            Self::Upper => 2,
        }
    }

    /// La valeur 3 n'est jamais écrite ; la lire signifie une entrée déchirée,
    /// que le contrôle de clé a déjà rejetée. On rend `Exact` plutôt que de
    /// paniquer — une donnée fausse se borne, elle n'arrête pas la partie.
    const fn from_bits(bits: u64) -> Self {
        match bits & 0b11 {
            1 => Self::Lower,
            2 => Self::Upper,
            _ => Self::Exact,
        }
    }
}

/// Répartition des 64 bits de données : score aux bits 0 à 15, coup 16 à 31,
/// profondeur 32 à 39, borne 40 et 41, génération 42 à 49. Cinquante bits
/// utilisés sur soixante-quatre ; les quatorze restants sont libres.
///
/// **Le score n'a pas de décalage**, il occupe les bits de poids faible. Un
/// décalage nul écrit pour la symétrie se mute en décalage nul dans l'autre
/// sens : deux mutants équivalents, que le balayage du 23 sept. 2026 a
/// trouvés, et du code qu'aucun test ne peut garder — `CLAUDE.md`, « un
/// mutant équivalent est souvent du code mort ».
///
/// **Le score tient sur seize bits** : `MATE` vaut 30 000, et l'élagage par
/// distance au mat de `negamax` borne la fenêtre à l'atteignable, donc tout
/// score stocké reste dans ±MATE une fois normalisé du ply (C27).
/// <s>Une assertion posée ici le 22 sept. 2026 n'a jamais été déclenchée.</s>
/// **Elle l'a été le 25 sept.**, par les tests du générateur NNUE, qui jouent
/// des parties jusqu'au mat depuis des positions gagnantes : un retour de
/// borne de mat hors plage, dans 1,82 % des recherches en partie. Son silence
/// mesurait ce que les tests parcouraient, pas l'absence du défaut. La borne
/// défensive ci-dessous reste.
///
/// **La génération garde ses huit bits**, donc le schéma de remplacement est
/// identique au bit près à celui de la version non atomique. C'était le risque
/// d'un encodage serré, et il est écarté.
const MV_SHIFT: u32 = 16;
const DEPTH_SHIFT: u32 = 32;
const BOUND_SHIFT: u32 = 40;
const GEN_SHIFT: u32 = 42;

/// Empaquette les données d'une entrée.
fn pack_data(score: i32, mv: u16, depth: i8, bound: Bound, generation: u8) -> u64 {
    debug_assert!(
        score.abs() <= crate::eval::MATE,
        "score hors bornes au stockage : {score}"
    );
    let score = score.clamp(i32::from(i16::MIN), i32::from(i16::MAX));
    let score = u64::from(u16::from_ne_bytes((score as i16).to_ne_bytes()));
    score
        | (u64::from(mv) << MV_SHIFT)
        | (u64::from(u8::from_ne_bytes(depth.to_ne_bytes())) << DEPTH_SHIFT)
        | (bound.to_bits() << BOUND_SHIFT)
        | (u64::from(generation) << GEN_SHIFT)
}

/// Opération inverse de [`pack_data`].
fn unpack_data(data: u64) -> (i32, u16, i8, Bound, u8) {
    let score = i16::from_ne_bytes(((data & 0xFFFF) as u16).to_ne_bytes());
    let mv = ((data >> MV_SHIFT) & 0xFFFF) as u16;
    let depth = i8::from_ne_bytes((((data >> DEPTH_SHIFT) & 0xFF) as u8).to_ne_bytes());
    let bound = Bound::from_bits(data >> BOUND_SHIFT);
    let generation = ((data >> GEN_SHIFT) & 0xFF) as u8;
    (i32::from(score), mv, depth, bound, generation)
}

/// Les données d'une entrée vierge : profondeur `-1`, que `probe` rejette.
///
/// La clé d'une entrée vierge vaut donc zéro. Une position dont le hash Zobrist
/// vaut exactement zéro y correspondrait — c'est pourquoi le contrôle de
/// profondeur reste nécessaire, exactement comme dans la version non atomique.
fn empty_data() -> u64 {
    pack_data(0, 0, -1, Bound::Exact, 0)
}

/// Une entrée : deux mots atomiques, seize octets.
///
/// **Et c'est huit octets de MOINS que la version non atomique** (mesuré :
/// `size_of` valait 24). À mébioctets égaux la table double donc de capacité,
/// ce qui change les collisions et l'arbre de recherche — ce n'est pas une
/// réécriture pure, et ça ne se valide pas par « nœuds identiques ».
struct Entry {
    key_xor_data: AtomicU64,
    data: AtomicU64,
}

impl Entry {
    fn empty() -> Self {
        let data = empty_data();
        Self {
            // Clé zéro : `0 ^ data` vaut `data`.
            key_xor_data: AtomicU64::new(data),
            data: AtomicU64::new(data),
        }
    }

    /// Lit la clé reconstruite et les données.
    ///
    /// L'ordre de lecture est l'inverse de l'ordre d'écriture : c'est ce qui
    /// rend un déchirement détectable. `Relaxed` suffit — on ne synchronise
    /// aucune autre mémoire, et une entrée lue de travers est rejetée par sa
    /// clé, pas par une barrière.
    fn load(&self) -> (u64, u64) {
        let data = self.data.load(Ordering::Relaxed);
        let key_xor_data = self.key_xor_data.load(Ordering::Relaxed);
        (key_xor_data ^ data, data)
    }

    fn store(&self, key: u64, data: u64) {
        self.key_xor_data.store(key ^ data, Ordering::Relaxed);
        self.data.store(data, Ordering::Relaxed);
    }
}

/// Taille par défaut, en mébioctets.
pub const DEFAULT_SIZE_MB: usize = 2;

/// Entrées par seau : quatre entrées de seize octets remplissent exactement
/// une ligne de cache de 64 octets.
const BUCKET_ENTRIES: usize = 4;

/// Ce que coûte une recherche d'ancienneté, en plis de profondeur, quand un
/// seau plein doit céder une place : une entrée vaut sa profondeur moins huit
/// par recherche écoulée. Une entrée de la recherche courante à 3 plis vaut
/// donc plus qu'une entrée à 10 plis de la recherche précédente.
///
/// **C'est la règle de Stockfish, lue dans son source et non de mémoire** :
/// tag `sf_16` (68e1e9b), `src/tt.cpp`, `TranspositionTable::probe` — « *the
/// replace value of an entry is calculated as its depth minus 8 times its
/// relative age* ». Ses groupes ont trois entrées de dix octets dans 32 ; les
/// nôtres, quatre de seize dans 64.
const AGE_WEIGHT: i32 = 8;

/// Un seau : les places qu'une clé peut occuper.
///
/// **Pourquoi des seaux** — C28, mesuré le 29 sept. 2026 : une entrée par
/// case, qu'une AUTRE position écrasait toujours, coûtait −19,42 ± 5,78 Elo
/// sous la pression que subit la table à cadence longue. Une entrée cherchée
/// à 18 plis y cédait à une de 1 pli. Quatre places par seau laissent chaque
/// nouvelle position en prendre une sans chasser la plus utile.
///
/// Aligné sur 64 octets, un seau tient dans UNE ligne de cache : lire ses
/// quatre entrées coûte le même accès mémoire que n'en lire qu'une, et la
/// capacité ne change pas à mébioctets égaux.
#[repr(align(64))]
struct Bucket {
    entries: [Entry; BUCKET_ENTRIES],
}

impl Bucket {
    fn empty() -> Self {
        Self {
            entries: std::array::from_fn(|_| Entry::empty()),
        }
    }
}

/// Ce que vaut une entrée qu'un seau plein pourrait céder : sa profondeur,
/// moins [`AGE_WEIGHT`] par recherche écoulée depuis son écriture. Une entrée
/// vierge porte la profondeur −1 et la génération zéro : elle cède la
/// première — tant que la génération, sur huit bits, n'a pas fait le tour,
/// soit 256 recherches sans `ucinewgame`. Au-delà, l'âge se lit modulo 256
/// et une entrée très ancienne passe pour récente. Stockfish vit avec le même
/// tour toutes les 32 recherches : sa génération tient sur cinq bits (même
/// source que [`AGE_WEIGHT`]).
fn worth(depth: i8, written: u8, generation: u8) -> i32 {
    i32::from(depth) - AGE_WEIGHT * i32::from(generation.wrapping_sub(written))
}

/// La table.
///
/// Toutes ses méthodes prennent `&self`, écriture comprise : c'est ce qui la
/// rend partageable entre plusieurs fils de recherche sans verrou.
pub struct TranspositionTable {
    buckets: Vec<Bucket>,
    /// `buckets.len() - 1`. La longueur est une puissance de deux, donc un
    /// `AND` remplace le modulo dans la boucle la plus chaude.
    mask: usize,
    generation: AtomicU8,
}

impl Default for TranspositionTable {
    fn default() -> Self {
        Self::new(DEFAULT_SIZE_MB)
    }
}

impl TranspositionTable {
    /// Le plus grand score stocké, en valeur absolue, entrées vierges exclues.
    ///
    /// Pour les tests seulement : c'est ce qui rend l'invariant « un score de
    /// mat stocké reste dans ±MATE » vérifiable EN RELEASE aussi, où
    /// l'assertion de `pack_data` n'existe pas (C27).
    #[cfg(test)]
    pub(crate) fn max_abs_stored_score(&self) -> i32 {
        self.entries()
            .map(|entry| unpack_data(entry.load().1))
            .filter(|&(_, _, depth, _, _)| depth >= 0)
            .map(|(score, _, _, _, _)| score.abs())
            .max()
            .unwrap_or(0)
    }

    /// Crée une table d'environ `megabytes` mébioctets, arrondie à la puissance
    /// de deux inférieure. Au moins un seau.
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
        Self::with_entry_count(count)
    }

    /// Toutes les entrées, seau après seau.
    fn entries(&self) -> impl Iterator<Item = &Entry> {
        self.buckets.iter().flat_map(|bucket| bucket.entries.iter())
    }

    /// Crée une table d'un nombre d'entrées imposé.
    ///
    /// **Existe pour la mesure, et c'est sa seule raison d'être.** L'entrée
    /// atomique fait seize octets contre vingt-quatre pour l'ancienne, donc à
    /// mébioctets égaux la capacité double et l'arbre de recherche change. Le
    /// coût des accès atomiques ne se mesure qu'à **capacité forcée égale** —
    /// là, le nombre de nœuds est identique au bit près et `tools/timing.sh`
    /// s'applique. Mélanger les deux effets rendrait un chiffre qui répond à
    /// une autre question.
    ///
    /// Arrondie vers le haut, à un nombre de seaux puissance de deux : une
    /// table a au moins un seau.
    #[must_use]
    pub fn with_entry_count(count: usize) -> Self {
        let buckets = count.div_ceil(BUCKET_ENTRIES).next_power_of_two();
        Self {
            buckets: (0..buckets).map(|_| Bucket::empty()).collect(),
            mask: buckets - 1,
            generation: AtomicU8::new(0),
        }
    }

    /// Vide la table. À appeler sur `ucinewgame` : les positions d'une partie
    /// précédente n'ont rien à dire sur la suivante.
    pub fn clear(&self) {
        let data = empty_data();
        for entry in self.entries() {
            entry.store(0, data);
        }
        self.generation.store(0, Ordering::Relaxed);
    }

    /// Marque le début d'une nouvelle recherche.
    ///
    /// Les entrées des recherches précédentes restent lisibles mais deviennent
    /// remplaçables en priorité : elles portent sur des positions que la partie
    /// a probablement dépassées.
    pub fn new_search(&self) {
        self.generation.fetch_add(1, Ordering::Relaxed);
    }

    /// Nombre d'entrées de la table.
    #[must_use]
    pub fn capacity(&self) -> usize {
        self.buckets.len() * BUCKET_ENTRIES
    }

    /// Taux de remplissage en pour mille, estimé sur les mille premières
    /// entrées — c'est ce qu'attend le champ `hashfull` du protocole UCI.
    #[must_use]
    pub fn permille_used(&self) -> u32 {
        let sample = self.capacity().min(1_000);
        let used = self
            .entries()
            .take(sample)
            .filter(|entry| {
                let (_, data) = entry.load();
                unpack_data(data).2 >= 0
            })
            .count();
        u32::try_from(used * 1_000 / sample).unwrap_or(1_000)
    }

    /// Interroge la table. `ply` sert à ramener un éventuel score de mat à la
    /// profondeur courante.
    #[must_use]
    pub fn probe(&self, key: u64, ply: i32) -> Option<Hit> {
        for entry in &self.buckets[key as usize & self.mask].entries {
            let (stored_key, data) = entry.load();
            // Une entrée déchirée rend une clé qui ne correspond à rien : elle
            // se passe ici, par le même test qu'une autre position.
            if stored_key != key {
                continue;
            }
            let (score, mv, depth, bound, _) = unpack_data(data);
            if depth < 0 {
                continue;
            }
            return Some(Hit {
                mv: unpack_move(mv),
                score: score_from_tt(score, ply),
                depth,
                bound,
            });
        }
        None
    }

    /// Enregistre ce que la recherche vient d'établir.
    ///
    /// **La même position** garde sa place : son entrée est remplacée si elle
    /// vient d'une recherche antérieure ou si le nouveau résultat est au moins
    /// aussi profond — une entrée profonde de la recherche courante n'est
    /// jamais écrasée par un résultat superficiel de la même position.
    ///
    /// **Une autre position** prend toujours une place — ne pas l'écrire la
    /// condamnerait à ne rien mémoriser tant que le seau est plein —, celle
    /// qui vaut le moins au sens de [`worth`] : une entrée vierge d'abord, puis
    /// la moins profonde, l'ancienneté comptant contre elle. À valeur égale,
    /// la première du seau cède : la table reste déterministe à un fil.
    pub fn store(
        &self,
        key: u64,
        mv: Option<Move>,
        score: i32,
        depth: i32,
        bound: Bound,
        ply: i32,
    ) {
        let bucket = &self.buckets[key as usize & self.mask];
        let generation = self.generation.load(Ordering::Relaxed);
        let depth = i8::try_from(depth.clamp(0, i32::from(i8::MAX))).unwrap_or(i8::MAX);
        let data = |packed| pack_data(score_to_tt(score, ply), packed, depth, bound, generation);

        let mut victim = &bucket.entries[0];
        let mut victim_worth = i32::MAX;
        for entry in &bucket.entries {
            let (existing_key, existing_data) = entry.load();
            let (_, existing_mv, existing_depth, _, existing_gen) = unpack_data(existing_data);
            if existing_key == key {
                // Pas de test d'entrée vierge ici, contrairement à `probe` :
                // une clé nulle qui tomberait sur une entrée vierge l'écrirait
                // — ce qu'aurait fait le choix d'une place, vierge d'abord.
                // Le tester en plus donnerait une branche que rien ne peut
                // distinguer, et qu'aucun test ne pourrait donc protéger.
                if existing_gen == generation && depth < existing_depth {
                    return;
                }
                // Ne pas effacer un coup connu quand la nouvelle entrée n'en a
                // pas : même sans score exploitable, un coup à essayer en
                // premier vaut cher.
                entry.store(key, data(mv.map_or(existing_mv, pack_move)));
                return;
            }
            let value = worth(existing_depth, existing_gen, generation);
            if value < victim_worth {
                victim = entry;
                victim_worth = value;
            }
        }
        victim.store(key, data(mv.map_or(0, pack_move)));
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
        let tt = TranspositionTable::new(1);
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
        let tt = TranspositionTable::new(1);
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
        let tt = TranspositionTable::new(1);
        tt.new_search();
        tt.store(7, Some(mv("e2e4")), 100, 8, Bound::Exact, 0);
        tt.new_search();
        tt.store(7, Some(mv("d2d4")), 200, 2, Bound::Exact, 0);
        assert_eq!(tt.probe(7, 0).unwrap().depth, 2);
    }

    #[test]
    fn un_coup_connu_nest_pas_efface_par_une_entree_sans_coup() {
        let tt = TranspositionTable::new(1);
        tt.new_search();
        tt.store(7, Some(mv("e2e4")), 100, 4, Bound::Exact, 0);
        tt.store(7, None, 50, 6, Bound::Upper, 0);
        assert_eq!(tt.probe(7, 0).unwrap().mv, Some(mv("e2e4")));
    }

    #[test]
    fn vider_la_table_efface_tout() {
        let tt = TranspositionTable::new(1);
        tt.new_search();
        tt.store(7, Some(mv("e2e4")), 100, 4, Bound::Exact, 0);
        tt.clear();
        assert!(tt.probe(7, 0).is_none());
        assert_eq!(tt.permille_used(), 0);
    }

    #[test]
    fn le_taux_de_remplissage_suit_le_contenu() {
        // `permille_used` alimente le champ `hashfull` d'UCI. Son arithmétique
        // pouvait être altérée sans qu'un test bronche : seule la table vide
        // était vérifiée.
        let tt = TranspositionTable::new(1);
        assert_eq!(tt.permille_used(), 0, "une table vide est vide");

        // Remplir l'échantillon que la fonction observe — les mille premières
        // entrées, ou toute la table si elle est plus petite. Elles se suivent
        // seau par seau : quatre clés par seau, distantes du nombre de seaux.
        let echantillon = tt.capacity().min(1_000) as u64;
        let seaux = (tt.capacity() / BUCKET_ENTRIES) as u64;
        let par_seau = BUCKET_ENTRIES as u64;
        let remplir = |debut: u64, fin: u64| {
            for index in debut..fin {
                let cle = index / par_seau + index % par_seau * seaux;
                tt.store(cle, None, 0, 1, Bound::Exact, 0);
            }
        };
        remplir(0, echantillon / 2);
        assert_eq!(
            tt.permille_used(),
            500,
            "un échantillon à moitié plein vaut cinq cents pour mille"
        );
        remplir(echantillon / 2, echantillon);
        assert_eq!(
            tt.permille_used(),
            1_000,
            "un échantillon plein vaut mille pour mille"
        );
        assert!(
            tt.permille_used() <= 1_000,
            "un pour-mille ne dépasse pas mille"
        );
    }

    #[test]
    fn une_entree_vide_ne_repond_jamais() {
        // La clé zéro est celle d'une entrée jamais écrite. Si le test de
        // vacuité portait sur `depth == 0` au lieu de `depth < 0`, une entrée
        // vierge serait rendue comme un coup connu.
        let tt = TranspositionTable::new(1);
        assert!(tt.probe(0, 0).is_none(), "clé zéro sur table vierge");
        assert!(tt.probe(1, 0).is_none());
    }

    #[test]
    fn une_collision_dindex_ne_rend_pas_lentree_de_lautre_cle() {
        // Deux clés distantes de la capacité tombent dans le même seau. Si le
        // contrôle de clé s'inversait, la table rendrait le score d'une AUTRE
        // position — le pire défaut qu'une table de transposition puisse avoir.
        let tt = TranspositionTable::new(1);
        let capacite = tt.capacity() as u64;
        let (une, autre) = (0xDEAD_BEEF, 0xDEAD_BEEF + capacite);
        assert_eq!(
            une as usize & tt.mask,
            autre as usize & tt.mask,
            "les deux clés doivent bien entrer en collision"
        );

        tt.store(une, Some(mv("e2e4")), 100, 5, Bound::Exact, 0);
        assert!(tt.probe(une, 0).is_some(), "la clé stockée répond");
        assert!(
            tt.probe(autre, 0).is_none(),
            "l'autre clé ne doit RIEN obtenir"
        );
    }

    #[test]
    fn une_entree_de_profondeur_zero_reste_lisible() {
        // Profondeur zéro est une profondeur valide — c'est celle de la
        // quiescence. Seule la profondeur négative marque une entrée vierge.
        let tt = TranspositionTable::new(1);
        tt.store(7, Some(mv("d2d4")), 12, 0, Bound::Exact, 0);
        let hit = tt.probe(7, 0).unwrap();
        assert_eq!(hit.depth, 0);
        assert_eq!(hit.score, 12);
    }

    #[test]
    fn une_entree_superficielle_est_ecrasee_par_une_profonde() {
        // Le pendant du test existant, qui ne couvrait que le refus. Sans ce
        // sens-ci, remplacer le `&&` du refus par `||` passait inaperçu : une
        // position n'aurait plus jamais été réécrite dans la même recherche.
        let tt = TranspositionTable::new(1);
        tt.store(9, Some(mv("a2a3")), 10, 1, Bound::Exact, 0);
        tt.store(9, Some(mv("h2h4")), 99, 5, Bound::Lower, 0);

        let hit = tt.probe(9, 0).unwrap();
        assert_eq!(hit.depth, 5, "la profonde l'emporte");
        assert_eq!(hit.score, 99);
        assert_eq!(hit.mv, Some(mv("h2h4")));
    }

    /// Cinq clés qui tombent dans le même seau : distantes de la capacité,
    /// qui est un multiple du nombre de seaux.
    fn same_bucket(tt: &TranspositionTable) -> [u64; 5] {
        let capacite = tt.capacity() as u64;
        std::array::from_fn(|i| 0xFEED + i as u64 * capacite)
    }

    /// Qui, parmi les clés données, la table rend encore.
    fn kept(tt: &TranspositionTable, keys: &[u64]) -> Vec<bool> {
        keys.iter().map(|&key| tt.probe(key, 0).is_some()).collect()
    }

    #[test]
    fn un_seau_garde_quatre_positions_qui_se_disputent_la_meme_case() {
        // Avant les seaux, chacune chassait la précédente : une seule sur
        // quatre survivait. C'est le défaut que C28 a chiffré.
        let tt = TranspositionTable::new(1);
        tt.new_search();
        let cles = same_bucket(&tt);
        assert_eq!(cles[0] as usize & tt.mask, cles[4] as usize & tt.mask);
        for (profondeur, &cle) in cles[..4].iter().enumerate() {
            tt.store(
                cle,
                Some(mv("e2e4")),
                10,
                profondeur as i32,
                Bound::Exact,
                0,
            );
        }
        assert_eq!(kept(&tt, &cles[..4]), [true; 4]);
    }

    #[test]
    fn un_seau_plein_cede_la_moins_profonde_meme_a_une_plus_superficielle() {
        // Une autre position prend TOUJOURS une place : garder les quatre
        // condamnerait la cinquième à ne rien mémoriser. Mais c'est la moins
        // profonde qui cède — jamais celle de 9 plis, comme le faisait la
        // case unique.
        let tt = TranspositionTable::new(1);
        tt.new_search();
        let cles = same_bucket(&tt);
        for (&cle, profondeur) in cles[..4].iter().zip([9, 2, 7, 8]) {
            tt.store(cle, Some(mv("e2e4")), 10, profondeur, Bound::Exact, 0);
        }
        tt.store(cles[4], Some(mv("d2d4")), -30, 1, Bound::Upper, 0);
        assert_eq!(kept(&tt, &cles), [true, false, true, true, true]);
        let hit = tt.probe(cles[4], 0).unwrap();
        assert_eq!((hit.depth, hit.score, hit.mv), (1, -30, Some(mv("d2d4"))));
    }

    #[test]
    fn a_valeur_egale_la_premiere_place_du_seau_cede() {
        // Le départage est arbitraire, mais il doit être fixe : à un fil, la
        // recherche reste déterministe au nœud près (`CLAUDE.md`).
        let tt = TranspositionTable::new(1);
        tt.new_search();
        let cles = same_bucket(&tt);
        for (&cle, profondeur) in cles[..4].iter().zip([4, 4, 9, 9]) {
            tt.store(cle, Some(mv("e2e4")), 10, profondeur, Bound::Exact, 0);
        }
        tt.store(cles[4], Some(mv("d2d4")), 0, 1, Bound::Exact, 0);
        assert_eq!(kept(&tt, &cles), [false, true, true, true, true]);
    }

    #[test]
    fn une_entree_ancienne_cede_avant_des_courantes_moins_profondes() {
        // Trois recherches d'ancienneté pèsent 24 plis : l'entrée à 20 plis
        // vaut −4, sous les courantes à 5, 6 et 7. Une pondération additive,
        // divisée ou de signe contraire la garderait.
        let tt = TranspositionTable::new(1);
        let cles = same_bucket(&tt);
        tt.new_search();
        tt.store(cles[0], Some(mv("e2e4")), 10, 20, Bound::Exact, 0);
        for _ in 0..3 {
            tt.new_search();
        }
        for (&cle, profondeur) in cles[1..4].iter().zip([5, 6, 7]) {
            tt.store(cle, Some(mv("e2e4")), 10, profondeur, Bound::Exact, 0);
        }
        tt.store(cles[4], Some(mv("d2d4")), 0, 1, Bound::Exact, 0);
        assert_eq!(kept(&tt, &cles), [false, true, true, true, true]);
    }

    #[test]
    fn une_entree_recente_assez_profonde_survit_a_une_courante_superficielle() {
        // Une seule recherche d'ancienneté : l'entrée à 12 plis vaut 4, au-
        // dessus de la courante à 3, qui cède. Un âge pesant neuf plis ou
        // plus — ou compté avant la profondeur, l'ancienne cédant toujours la
        // première — la ferait céder. Le test précédent borne le poids par le
        // bas — il tombe à quatre plis ou moins —, celui-ci par le haut.
        let tt = TranspositionTable::new(1);
        let cles = same_bucket(&tt);
        tt.new_search();
        tt.store(cles[0], Some(mv("e2e4")), 10, 12, Bound::Exact, 0);
        tt.new_search();
        for (&cle, profondeur) in cles[1..4].iter().zip([3, 9, 10]) {
            tt.store(cle, Some(mv("e2e4")), 10, profondeur, Bound::Exact, 0);
        }
        tt.store(cles[4], Some(mv("d2d4")), 0, 1, Bound::Exact, 0);
        assert_eq!(kept(&tt, &cles), [true, false, true, true, true]);
    }

    #[test]
    fn la_meme_position_a_egale_profondeur_est_remplacee() {
        // « Au moins aussi profond » : l'égalité remplace. Un `<=` à la place
        // du `<` qui refuse garderait le résultat périmé.
        let tt = TranspositionTable::new(1);
        tt.new_search();
        tt.store(7, Some(mv("e2e4")), 10, 5, Bound::Upper, 0);
        tt.store(7, Some(mv("d2d4")), 20, 5, Bound::Exact, 0);
        let hit = tt.probe(7, 0).unwrap();
        assert_eq!(
            (hit.score, hit.mv, hit.bound),
            (20, Some(mv("d2d4")), Bound::Exact)
        );
    }

    #[test]
    fn un_coup_nest_herite_que_de_la_meme_position() {
        // `store` conserve le coup existant quand le nouveau n'en porte pas —
        // mais SEULEMENT si c'est la même clé. Sans cette garde, une position
        // hériterait du coup d'une autre. Le seau est plein, sans quoi l'autre
        // position prendrait une place vierge, qui n'a aucun coup à léguer, et
        // le test passerait quoi que fasse le code.
        let tt = TranspositionTable::new(1);
        let cles = same_bucket(&tt);
        for (&cle, profondeur) in cles[..4].iter().zip([3, 5, 6, 7]) {
            tt.store(cle, Some(mv("e2e4")), 50, profondeur, Bound::Exact, 0);
        }
        let autre = cles[4];
        tt.store(autre, None, 20, 4, Bound::Exact, 0);

        let hit = tt.probe(autre, 0).unwrap();
        assert_eq!(
            hit.mv, None,
            "le coup de l'autre position ne doit pas être hérité"
        );
    }

    #[test]
    fn la_borne_des_scores_de_mat_est_exacte() {
        // `score_to_tt` et `score_from_tt` ne corrigent que les scores de mat,
        // reconnus par `> MATE_THRESHOLD`. Leurs quatre comparaisons
        // survivaient à l'inversion de leur borne : aucun test ne testait la
        // valeur frontière elle-même. `CLAUDE.md` désigne pourtant ces deux
        // fonctions comme la source de bug la plus classique d'une table.
        const PLY: i32 = 6;

        // Exactement à la borne : ce n'est PAS un score de mat, rien ne bouge.
        assert_eq!(score_to_tt(MATE_THRESHOLD, PLY), MATE_THRESHOLD);
        assert_eq!(score_from_tt(MATE_THRESHOLD, PLY), MATE_THRESHOLD);
        assert_eq!(score_to_tt(-MATE_THRESHOLD, PLY), -MATE_THRESHOLD);
        assert_eq!(score_from_tt(-MATE_THRESHOLD, PLY), -MATE_THRESHOLD);

        // Un cran au-delà : c'en est un, la distance se décale du ply.
        assert_eq!(
            score_to_tt(MATE_THRESHOLD + 1, PLY),
            MATE_THRESHOLD + 1 + PLY
        );
        assert_eq!(
            score_from_tt(MATE_THRESHOLD + 1, PLY),
            MATE_THRESHOLD + 1 - PLY
        );
        assert_eq!(
            score_to_tt(-MATE_THRESHOLD - 1, PLY),
            -MATE_THRESHOLD - 1 - PLY
        );
        assert_eq!(
            score_from_tt(-MATE_THRESHOLD - 1, PLY),
            -MATE_THRESHOLD - 1 + PLY
        );
    }

    #[test]
    fn un_seau_est_une_ligne_de_cache() {
        // Quatre entrées de seize octets, alignées sur 64 : lire le seau
        // entier coûte un seul accès mémoire. Sans l'alignement, chaque seau
        // chevaucherait deux lignes dès que l'allocateur rendrait une adresse
        // qui n'est pas multiple de 64.
        assert_eq!(size_of::<Bucket>(), 64);
        assert_eq!(align_of::<Bucket>(), 64);
    }

    #[test]
    fn la_taille_est_une_puissance_de_deux_sous_la_demande() {
        for mb in [1, 2, 7, 16, 64] {
            let tt = TranspositionTable::new(mb);
            assert!(tt.capacity().is_power_of_two(), "{mb} Mio");
            // La mémoire réellement allouée — celle des seaux, alignement
            // compris —, pas une capacité multipliée par une taille d'entrée.
            let octets = tt.buckets.len() * size_of::<Bucket>();
            assert!(octets <= mb * 1024 * 1024, "{mb} Mio dépassé");
            // La borne haute seule laissait passer une capacité de UN : une
            // puissance de deux qui tient sous la limite. Un test de mutation
            // l'a montré le 15 sept. 2026. Une table ronde à la puissance de
            // deux inférieure garde toujours plus de la moitié du budget.
            assert!(
                octets > mb * 1024 * 1024 / 2,
                "{mb} Mio : la table n'utilise que {octets} octets"
            );
        }
    }
}
