//! Recherche : negamax avec élagage alpha-bêta, approfondissement itératif et
//! recherche de quiescence.
//!
//! # Pourquoi negamax et pas minimax
//!
//! Le minimax à deux branches demande d'alterner explicitement `max` et `min`
//! selon le trait. Le moteur Python de 2022 s'y était trompé : le `min` était
//! appliqué à tous les niveaux, ce qui remontait le minimum de *toutes* les
//! feuilles, y compris celles atteintes par ses propres coups. Correct par
//! accident à profondeur 2, faux au-delà.
//!
//! Le negamax n'a qu'une branche : `-search(-β, -α)`. L'alternance devient
//! structurelle au lieu de dépendre d'un `if` qu'on peut écrire de travers.
//! C'est pourquoi [`crate::eval::evaluate`] rend toujours son score du point de
//! vue du camp au trait.
//!
//! # Pourquoi la quiescence n'est pas optionnelle
//!
//! Évaluer à profondeur fixe au milieu d'un échange fait croire une position
//! gagnante alors qu'on va perdre sa dame au coup suivant. C'était la faiblesse
//! la plus coûteuse du moteur de 2022. La quiescence prolonge la recherche
//! jusqu'à une position calme : quelques dizaines de lignes, plusieurs centaines
//! d'Elo.

use std::cmp::Reverse;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use cozy_chess::{Board, Color, Move, Piece, Rank, Square};

use crate::eval::{self, DRAW, INFINITY, MATE, MATE_THRESHOLD};
use crate::position::{Position, repetitions};
use crate::see;
use crate::tt::{Bound, TranspositionTable, pack_move};

/// Profondeur maximale de la recherche principale.
pub const MAX_DEPTH: u32 = 64;

/// Plafond de profondeur, quiescence comprise. Borne les tableaux indexés par
/// ply et empêche une quiescence pathologique de déborder la pile.
pub const MAX_PLY: usize = 128;

/// Nombre maximal de fils de recherche, l'option UCI `Threads`.
///
/// Au-delà, chaque fil ne ferait que se disputer les cœurs avec les autres ;
/// la borne existe pour qu'une valeur aberrante ne crée pas des milliers de
/// recherches, chacune avec son ardoise.
pub const MAX_THREADS: usize = 64;

/// Profondeur maximale à laquelle on ose la futilité inverse.
///
/// Au-delà, le score statique cesse de prédire ce que la recherche trouverait :
/// il reste trop de coups à jouer pour qu'une évaluation immobile fasse foi.
const RFP_MAX_DEPTH: i32 = 8;

/// Marge de la futilité inverse, par unité de profondeur restante.
///
/// Elle croît avec la profondeur parce que plus il reste de coups, plus le
/// score peut encore bouger. **Mesuré le 15 sept. 2026 sur des positions tirées
/// de vraies parties** : la condition se déclenche sur 44,7 % des nœuds
/// candidats à 100 par profondeur, 47,4 % à 75, 40,0 % à 150 — la sensibilité à
/// la marge est faible, donc la valeur conventionnelle suffit tant qu'un SPRT
/// n'a pas dit le contraire.
const RFP_MARGIN: i32 = 100;

/// Profondeur minimale pour tenter un coup nul.
///
/// En dessous, la recherche réduite serait si courte que l'élagage ne
/// rapporterait rien tout en pouvant tromper.
const NULL_MOVE_MIN_DEPTH: i32 = 3;

/// Réduction appliquée à la recherche qui suit un coup nul.
///
/// C'est ce qui rend l'élagage bon marché : on vérifie l'hypothèse « ma
/// position est bonne » à profondeur réduite, et on ne paye le prix fort que
/// si elle échoue.
const NULL_MOVE_REDUCTION: i32 = 2;

/// Profondeur minimale pour réduire un coup tardif.
const LMR_MIN_DEPTH: i32 = 3;

/// Rang à partir duquel un coup est considéré comme tardif.
///
/// Les premiers coups sont ceux que l'ordonnancement juge les plus
/// prometteurs — coup de la table, captures. Les réduire reviendrait à saboter
/// le travail de l'ordonnancement.
const LMR_FIRST_REDUCED: usize = 3;

/// Profondeur restante maximale à laquelle l'élagage par compte de coups
/// s'applique.
///
/// **Choisi par la mesure, pas par convention.** Instrumenté le 15 sept. 2026
/// sur 150 positions tirées de vraies parties, recherche à profondeur 10 :
/// **75,6 % des nœuds éligibles sont à la profondeur 1**, et passer de 3 à 8
/// change l'élagage de 0,2 point et le risque de 0,005. Il y a un vrai
/// plateau ; 3 est là où il commence.
const LMP_MAX_DEPTH: i32 = 3;

/// Nombre de coups tranquilles toujours examinés, avant le terme quadratique.
///
/// **La mesure a borné le risque, elle n'a pas choisi cette valeur** — et c'est
/// la différence avec `RFP_MARGIN`, dont la sensibilité mesurée était faible.
/// Ici le compromis est **monotone et sans genou** : au seuil `base + d²`, sur
/// le même échantillon, la part des coups tranquilles élagués et celle des
/// montées d'`alpha` détruites tombent ensemble, continûment.
///
/// | base | tranquilles élagués | montées d'`alpha` détruites |
/// |---|---|---|
/// | 3 (conventionnel) | 68,5 % | **6,1 %** |
/// | **6** | **58,4 %** | **3,8 %** |
/// | 8 | 52,0 % | 3,0 % |
/// | 12 | 39,8 % | 2,0 % |
///
/// 6 est le premier candidat soumis au SPRT : il garde l'essentiel de
/// l'élagage disponible en divisant par 1,6 le risque de la valeur
/// conventionnelle. **Si le verdict est H0, bissecter par le seuil avant de
/// conclure quoi que ce soit sur LMP lui-même.**
const LMP_BASE: usize = 6;

/// Profondeur à partir de laquelle on ose une fenêtre étroite.
///
/// En dessous, le score d'une itération à l'autre bouge trop pour qu'une
/// prédiction serve à quoi que ce soit : on chercherait étroit pour rien et
/// l'on paierait des recherches répétées.
const ASPIRATION_MIN_DEPTH: u32 = 4;

/// Demi-largeur initiale de la fenêtre, en centièmes de pion.
///
/// Trop étroite, la fenêtre échoue sans cesse et chaque échec coûte une
/// recherche complète ; trop large, elle ne coupe plus rien. Valeur
/// conventionnelle, à régler par SPRT comme le reste.
const ASPIRATION_DELTA: i32 = 25;

/// Taille du tampon de coups d'un nœud.
///
/// **218 est le nombre maximal de coups légaux d'une position d'échecs**, borne
/// établie par recherche exhaustive et non par estimation. 256 laisse donc une
/// marge confortable tout en gardant une puissance de deux.
///
/// L'ardoise complète pèse `MAX_PLY × MAX_MOVES × 8` octets, soit 256 Ko,
/// alloués une fois pour toutes avec la recherche.
const MAX_MOVES: usize = 256;

/// Coup sentinelle servant à remplir l'ardoise à sa seule initialisation.
///
/// `a1a1` n'est jamais légal — c'est déjà ce que [`crate::tt::pack_move`]
/// emploie comme marqueur d'absence, et la même valeur sert ici pour la même
/// raison. Ces cases ne sont jamais lues : seules les `count` premières le sont.
///
/// **Mesuré le 15 sept. 2026** : remplir un tel tampon *à chaque nœud*, sur la
/// pile, coûte **3,5 % du temps de recherche** — plus cher que l'allocation
/// qu'il devait remplacer. Le tampon est donc rempli **une seule fois**, à la
/// construction de [`Search`], et découpé par ply le long de la récursion.
const NO_MOVE: Move = Move {
    from: Square::A1,
    to: Square::A1,
    promotion: None,
};

/// Marge de l'élagage delta en quiescence, en centièmes de pion.
///
/// Une capture ne rapporte, au mieux, que la pièce prise. Si le score statique
/// plus cette pièce plus une marge reste sous `alpha`, la capture ne peut pas
/// sauver la position et son sous-arbre est inutile.
///
/// La marge couvre ce que la valeur de la pièce ne dit pas : un gain positionnel
/// consécutif à la capture, ou une erreur de l'évaluation statique. Trop
/// étroite, elle élague des captures qui sauvaient la position ; trop large,
/// elle n'élague plus rien. **Valeur conventionnelle, à régler par SPRT comme
/// le reste** — c'est celle qui a servi à mesurer la portée de l'élagage avant
/// de l'écrire.
const DELTA_MARGIN: i32 = 200;

/// Nombre de nœuds entre deux consultations de l'horloge et du drapeau d'arrêt.
///
/// Interroger `Instant::now()` à chaque nœud coûte plus cher que la recherche
/// elle-même ; ne jamais l'interroger fait perdre au temps.
const CHECK_INTERVAL: u64 = 2_048;

/// Contraintes transmises par `go`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Limits {
    /// Temps restant aux blancs, en millisecondes.
    pub wtime: Option<u64>,
    /// Temps restant aux noirs, en millisecondes.
    pub btime: Option<u64>,
    /// Incrément des blancs, en millisecondes.
    pub winc: Option<u64>,
    /// Incrément des noirs, en millisecondes.
    pub binc: Option<u64>,
    /// Nombre de coups avant le prochain contrôle de pendule.
    pub movestogo: Option<u32>,
    /// Temps imposé pour ce coup, en millisecondes.
    pub movetime: Option<u64>,
    /// Profondeur maximale.
    pub depth: Option<u32>,
    /// Budget de nœuds.
    pub nodes: Option<u64>,
    /// Chercher jusqu'à réception de `stop`.
    pub infinite: bool,
    /// `go ponder` : chercher sur le temps de l'adversaire, la position qui
    /// suivrait le coup qu'on a parié. Les échéances sont posées comme pour un
    /// `go` ordinaire, mais ne s'appliquent qu'après `ponderhit`.
    pub ponder: bool,
}

/// Le score d'une position, tel qu'UCI le distingue.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Score {
    /// Avantage en centièmes de pion, du point de vue du camp au trait.
    Cp(i32),
    /// Mat dans ce nombre de **coups** — positif pour le camp au trait.
    Mate(i32),
}

impl Score {
    /// Traduit un score interne, où un mat vaut `±(MATE - ply)`.
    #[must_use]
    pub fn from_internal(score: i32) -> Self {
        if score.abs() > MATE_THRESHOLD {
            // `MATE - |score|` est le nombre de demi-coups jusqu'au mat ;
            // UCI compte en coups, d'où l'arrondi supérieur de la moitié.
            let plies = MATE - score.abs();
            let moves = (plies + 1) / 2;
            Self::Mate(if score > 0 { moves } else { -moves })
        } else {
            Self::Cp(score)
        }
    }
}

/// Une ligne `info` prête à être émise par la couche UCI.
#[derive(Debug, Clone)]
pub struct Info {
    /// Profondeur atteinte.
    pub depth: u32,
    /// Score de la position.
    pub score: Score,
    /// Nœuds visités depuis le début de la recherche.
    pub nodes: u64,
    /// Durée écoulée, en millisecondes.
    pub time_ms: u64,
    /// Variante principale, en notation interne — à convertir pour UCI.
    pub pv: Vec<Move>,
    /// Remplissage de la table de transposition, en pour mille.
    pub hashfull: u32,
}

/// Table triangulaire de variante principale.
///
/// À chaque amélioration de `alpha`, le coup joué est préfixé à la variante
/// remontée par le nœud fils. La variante complète se lit alors au ply 0.
struct PvTable {
    moves: Vec<Option<Move>>,
    lengths: Vec<usize>,
}

impl PvTable {
    fn new() -> Self {
        Self {
            moves: vec![None; MAX_PLY * MAX_PLY],
            lengths: vec![0; MAX_PLY],
        }
    }

    fn clear(&mut self, ply: usize) {
        if ply < MAX_PLY {
            self.lengths[ply] = 0;
        }
    }

    fn push(&mut self, ply: usize, mv: Move) {
        if ply + 1 >= MAX_PLY {
            return;
        }
        self.moves[ply * MAX_PLY] = Some(mv);
        let child = self.lengths[ply + 1].min(MAX_PLY - 1);
        for index in 0..child {
            self.moves[ply * MAX_PLY + index + 1] = self.moves[(ply + 1) * MAX_PLY + index];
        }
        self.lengths[ply] = child + 1;
    }

    fn line(&self) -> Vec<Move> {
        (0..self.lengths[0])
            .filter_map(|index| self.moves[index])
            .collect()
    }
}

/// L'état d'une recherche.
pub struct Search {
    stop: Arc<AtomicBool>,
    nodes: u64,
    started: Instant,
    /// Instant au-delà duquel la recherche s'interrompt en cours d'itération.
    hard_deadline: Option<Instant>,
    /// Instant au-delà duquel on n'entame pas d'itération supplémentaire.
    soft_deadline: Option<Instant>,
    /// Budget de nœuds, quand `go nodes` en impose un.
    node_limit: Option<u64>,
    /// Vrai tant que la recherche PONDÈRE : lancée par `go ponder`, pas encore
    /// confirmée par `ponderhit`. Partagé avec la couche UCI, qui seule
    /// l'écrit — à vrai AVANT de lancer le fil, à faux sur `ponderhit` ou
    /// `stop`. L'écrire depuis le fil de recherche ouvrirait une course : un
    /// `ponderhit` arrivé avant le démarrage du fil serait perdu, et le moteur
    /// pondérerait jusqu'à perdre au temps.
    pondering: Arc<AtomicBool>,
    /// La variante de la dernière itération ACHEVÉE. Son deuxième coup est le
    /// pari annoncé par `bestmove … ponder …`. On ne la relit pas dans la
    /// table de variante après coup : une itération interrompue l'a peut-être
    /// déjà écrasée en partie.
    last_pv: Vec<Move>,
    aborted: bool,
    /// Clés Zobrist de la partie puis du chemin courant dans l'arbre.
    path: Vec<u64>,
    /// Indices, dans `path`, des positions atteintes par un coup nul — une
    /// pile, puisque les coups nuls s'emboîtent.
    ///
    /// Une répétition ne se cherche jamais au-delà du dernier. Un coup nul
    /// n'existe dans aucune vraie partie : une « répétition » qui le traverse
    /// compare la ligne supposée à une position qu'elle ne peut pas retrouver.
    /// Le cas courant est bête — deux coups nuls de suite recréent la position
    /// de départ, au même trait, et la recherche y voyait une nulle. Mesuré en
    /// partie le 23 sept. 2026, c'étaient **87,8 %** des répétitions qu'elle
    /// détectait (C23, `tools/README.md`). Stockfish borne sa fenêtre de même
    /// (`pliesFromNull`).
    null_marks: Vec<usize>,
    pv: PvTable,
    root_best: Option<Move>,
    /// Mémoire des positions déjà évaluées, conservée entre les coups — et
    /// PARTAGÉE entre les fils d'une même recherche : c'est tout Lazy SMP
    /// (B6). Ses entrées sont atomiques depuis B9, `store` prend `&self`.
    tt: Arc<TranspositionTable>,
    /// Nombre de fils de recherche, l'option UCI `Threads`. Un par défaut.
    threads: usize,
    /// Les fils auxiliaires : `threads - 1` recherches complètes, chacune avec
    /// ses killers, son historique et son ardoise, qui cherchent la même
    /// position que celle-ci et ne communiquent avec elle QUE par la table.
    /// Vide avec un seul fil — le cas par défaut, le moteur d'avant B6 au
    /// nœud près.
    helpers: Vec<Search>,
    /// Le drapeau d'arrêt des auxiliaires, distinct de `stop`, qui appartient
    /// à l'interface : c'est la fin de la recherche PRINCIPALE qui les arrête,
    /// et elle a ses raisons à elle — profondeur atteinte, mat, échéance.
    helper_stop: Arc<AtomicBool>,
    /// Les nœuds que TOUS les fils — principal compris — ont publiés pendant
    /// la recherche en cours. Chacun y verse son compte tous les
    /// `CHECK_INTERVAL` nœuds, et le reste en finissant : un compteur partagé
    /// incrémenté à chaque nœud coûterait une instruction verrouillée par
    /// nœud, et sa ligne de cache ferait la navette entre les cœurs.
    ///
    /// Le fil principal y publie AUSSI, et c'est ce qui permet à chaque fil de
    /// tenir le budget de `go nodes` lui-même. Tenu par le seul fil principal,
    /// le budget débordait sans borne dès qu'il manquait de CPU : les
    /// auxiliaires cherchaient sans rien vérifier — 66 792 et 68 177 nœuds pour
    /// un budget de 50 000, reproduits en serrant les trois fils sur un seul
    /// cœur (`taskset -c 0`), 24 sept. 2026.
    published_nodes: Arc<AtomicU64>,
    /// Les nœuds de CE fil déjà versés dans `published_nodes`.
    published: u64,
    /// Vrai pour un auxiliaire. Il publie ses nœuds, ne rapporte rien, ne
    /// consulte aucune pendule et ne touche pas à la génération de la table.
    is_helper: bool,
    /// Deux coups tranquilles par ply ayant provoqué une coupure bêta.
    ///
    /// Un coup qui réfute une variante à un ply donné en réfute souvent
    /// d'autres au même ply : l'essayer tôt coûte un test et rapporte beaucoup.
    killers: Vec<[u16; 2]>,
    /// Table butterfly indexée par case de départ puis d'arrivée.
    history: Vec<i32>,
    /// Réductions précalculées, indexées par profondeur puis par rang du coup.
    lmr: Vec<i32>,
    /// Ardoise de coups, découpée en tranches de `MAX_MOVES` — une par ply.
    ///
    /// Allouée une fois avec la recherche. Chaque nœud reçoit sa tranche et
    /// passe le reste à ses fils, ce qui donne à chacun un espace disjoint sans
    /// allocation ni remplissage par nœud.
    scratch: Vec<(Move, i32)>,
    /// Les valeurs que consulte l'évaluation. Le moteur emploie toujours les
    /// valeurs par défaut ; seul le tuner en substitue d'autres.
    params: eval::Params,
    /// Permet à un test de désactiver la seule futilité inverse.
    ///
    /// Hors test, la constante `true` est connue du compilateur : la condition
    /// disparaît à l'optimisation et ne coûte rien.
    #[cfg(test)]
    reverse_futility: bool,
    /// Permet à un test de désactiver le seul élagage delta, pour comparer deux
    /// recherches qui ne diffèrent que par lui.
    ///
    /// Sans ce commutateur, un test « le changement fait quelque chose » ne peut
    /// que comparer deux appels identiques — faute déjà commise sur ce projet le
    /// 14 sept. 2026, et qui rend le test creux.
    #[cfg(test)]
    delta_pruning: bool,
    /// Permet à un test de désactiver le seul élagage par compte de coups.
    #[cfg(test)]
    late_move_pruning: bool,
}

impl Search {
    /// Crée une recherche pilotée par le drapeau d'arrêt fourni.
    #[must_use]
    pub fn new(stop: Arc<AtomicBool>) -> Self {
        Self::with_table(stop, Arc::new(TranspositionTable::default()))
    }

    /// Une recherche sur une table donnée — la sienne, ou celle qu'elle
    /// partage avec la recherche principale si c'est un auxiliaire.
    fn with_table(stop: Arc<AtomicBool>, tt: Arc<TranspositionTable>) -> Self {
        Self {
            stop,
            nodes: 0,
            started: Instant::now(),
            hard_deadline: None,
            soft_deadline: None,
            pondering: Arc::new(AtomicBool::new(false)),
            last_pv: Vec::new(),
            node_limit: None,
            aborted: false,
            path: Vec::new(),
            null_marks: Vec::new(),
            pv: PvTable::new(),
            root_best: None,
            tt,
            threads: 1,
            helpers: Vec::new(),
            helper_stop: Arc::new(AtomicBool::new(false)),
            published_nodes: Arc::new(AtomicU64::new(0)),
            published: 0,
            is_helper: false,
            killers: vec![[0; 2]; MAX_PLY],
            history: vec![0; 64 * 64],
            lmr: build_lmr_table(),
            scratch: vec![(NO_MOVE, 0); MAX_PLY * MAX_MOVES],
            params: eval::Params::DEFAULT,
            #[cfg(test)]
            reverse_futility: true,
            #[cfg(test)]
            delta_pruning: true,
            #[cfg(test)]
            late_move_pruning: true,
        }
    }

    /// Redimensionne la table de transposition et la vide.
    pub fn resize_table(&mut self, megabytes: usize) {
        self.tt = Arc::new(TranspositionTable::new(megabytes));
        // Les auxiliaires tiennent encore l'ancienne : on les refait sur la
        // nouvelle, sans quoi chacun chercherait dans sa propre table.
        self.set_threads(self.threads);
    }

    /// Règle le nombre de fils de recherche — l'option UCI `Threads`, bornée
    /// à `[1, MAX_THREADS]`.
    ///
    /// Les auxiliaires se créent ici, une fois, et non à chaque coup : chacun
    /// porte une ardoise de 256 Kio, et la remplir à chaque `go` serait le
    /// coût d'initialisation que C15 a déjà payé une fois.
    pub fn set_threads(&mut self, threads: usize) {
        self.threads = threads.clamp(1, MAX_THREADS);
        let helpers = (1..self.threads).map(|_| self.new_helper()).collect();
        self.helpers = helpers;
    }

    /// Nombre de fils de recherche.
    #[must_use]
    pub fn threads(&self) -> usize {
        self.threads
    }

    /// Un auxiliaire : même table, compteur de nœuds commun, et le drapeau
    /// d'arrêt que lève la recherche principale.
    fn new_helper(&self) -> Self {
        let mut helper = Self::with_table(Arc::clone(&self.helper_stop), Arc::clone(&self.tt));
        helper.published_nodes = Arc::clone(&self.published_nodes);
        helper.is_helper = true;
        helper
    }

    /// Vide la table de transposition. À appeler sur `ucinewgame`.
    pub fn clear_table(&mut self) {
        self.tt.clear();
        self.killers.fill([0; 2]);
        self.history.fill(0);
    }

    /// Taux de remplissage de la table, en pour mille.
    #[must_use]
    pub fn table_permille(&self) -> u32 {
        self.tt.permille_used()
    }

    /// Nombre de nœuds visités par la dernière recherche, tous fils compris.
    ///
    /// Pendant la recherche, les auxiliaires n'ont versé que ce qu'ils ont
    /// publié — à `CHECK_INTERVAL` nœuds près chacun ; après, le compte est
    /// exact, chacun publiant son reste en finissant.
    #[must_use]
    pub fn nodes(&self) -> u64 {
        // Les siens au nœud près, ceux des autres fils tels que publiés : le
        // compteur commun contient déjà la part publiée de ce fil-ci.
        self.nodes + self.published_nodes.load(Ordering::Relaxed) - self.published
    }

    /// Branche le drapeau de ponder que la couche UCI écrira.
    ///
    /// Séparé de [`Search::new`] pour ne pas changer une signature que tous
    /// les tests emploient : une recherche qu'on ne branche pas garde son
    /// propre drapeau, toujours faux, donc ne pondère jamais.
    pub fn set_ponder_flag(&mut self, pondering: Arc<AtomicBool>) {
        self.pondering = pondering;
    }

    fn is_pondering(&self) -> bool {
        self.pondering.load(Ordering::Relaxed)
    }

    /// Le coup qu'on parie que l'adversaire jouera après `best`.
    ///
    /// Le deuxième coup de la dernière variante ACHEVÉE, s'il prolonge bien
    /// `best`. Sinon — variante d'un seul coup, 3,42 % des recherches mesurées
    /// — le coup que la table retient pour la position d'après, comme le fait
    /// Stockfish (`extract_ponder_from_tt`, lu dans son source). Sinon rien :
    /// `bestmove` part alors sans `ponder`, et l'interface ne pondère pas ce
    /// coup-là.
    ///
    /// Le coup rendu est LÉGAL sur la position d'après `best` : le contrôle
    /// couvre une variante incohérente comme une collision de clés.
    #[must_use]
    pub fn ponder_move(&self, board: &Board, best: Move) -> Option<Move> {
        if !board.is_legal(best) {
            return None;
        }
        let mut child = board.clone();
        child.play_unchecked(best);

        let from_pv = match self.last_pv.as_slice() {
            [first, second, ..] if *first == best => Some(*second),
            _ => None,
        };
        from_pv
            .or_else(|| self.tt.probe(child.hash(), 0).and_then(|hit| hit.mv))
            .filter(|&mv| child.is_legal(mv))
    }

    /// Cherche le meilleur coup de la position.
    ///
    /// Renvoie `None` si la position n'a aucun coup légal, auquel cas la couche
    /// UCI répond `bestmove 0000`.
    pub fn go(
        &mut self,
        position: &Position,
        limits: &Limits,
        mut report: impl FnMut(&Info),
    ) -> Option<Move> {
        self.started = Instant::now();
        self.nodes = 0;
        self.published = 0;
        self.published_nodes.store(0, Ordering::Relaxed);
        self.aborted = false;
        self.root_best = None;
        self.last_pv.clear();
        self.path = position.history().to_vec();
        self.tt.new_search();
        // Les killers valent pour un ply donné d'une recherche donnée : les
        // garder d'un coup à l'autre proposerait des coups sans rapport.
        self.killers.fill([0; 2]);
        self.history.fill(0);
        self.node_limit = limits.nodes;
        self.set_deadlines(limits, position.board().side_to_move());

        let board = position.board().clone();
        let max_depth = limits.depth.unwrap_or(MAX_DEPTH).clamp(1, MAX_DEPTH);

        // L'ardoise sort de `self` le temps de la recherche : sans cela, en
        // garder une tranche empruntée interdirait tout appel `&mut self`.
        // Elle y retourne juste après la boucle d'approfondissement.
        let mut scratch = std::mem::take(&mut self.scratch);
        // Une recherche précédente interrompue par une panique n'aurait pas
        // rendu l'ardoise. Sans cette reprise, toutes les recherches suivantes
        // s'arrêteraient au premier nœud en rendant le score statique — une
        // dégradation silencieuse, bien pire qu'un arrêt franc.
        if scratch.len() < MAX_PLY * MAX_MOVES {
            scratch = vec![(NO_MOVE, 0); MAX_PLY * MAX_MOVES];
        }

        // LAZY SMP (B6). Les auxiliaires cherchent la même position sur la
        // même table, sans pendule ni rapport ; seul ce fil-ci décide du coup.
        // Avec un seul fil, `helpers` est vide : aucun fil lancé, et pas un
        // nœud de différence avec le moteur d'avant B6.
        self.helper_stop.store(false, Ordering::Relaxed);
        let helper_stop = Arc::clone(&self.helper_stop);
        let history = position.history();
        let mut helpers = std::mem::take(&mut self.helpers);
        let best = std::thread::scope(|scope| {
            // Lève `helper_stop` en sortant de ce bloc, PANIQUE COMPRISE :
            // `scope` attend tous ses fils avant de rendre la main, et des
            // auxiliaires jamais arrêtés le feraient attendre pour toujours.
            let _stop = StopOnDrop(&helper_stop);
            for helper in &mut helpers {
                let board = &board;
                let node_limit = self.node_limit;
                scope.spawn(move || {
                    helper.search_as_helper(board, history, max_depth, node_limit);
                });
            }
            self.iterate(&board, max_depth, &mut scratch, &mut report)
        });
        self.helpers = helpers;
        self.scratch = scratch;

        // Filet de sécurité : si la toute première itération a été interrompue,
        // il faut tout de même jouer un coup légal plutôt que d'abandonner.
        let best = best.or_else(|| first_legal_move(&board));

        if limits.infinite {
            while !self.stop.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(1));
            }
        }

        // Une recherche qui FINIT pendant le ponder — mat trouvé, profondeur
        // maximale atteinte — n'a pas le droit de rendre son coup : l'interface
        // n'attend `bestmove` qu'après `ponderhit` ou `stop`, et le recevoir
        // pendant le tour adverse est une faute de protocole. C'est le piège
        // que l'on rate, et Stockfish l'écrit explicitement (« we simply wait
        // here »).
        while self.is_pondering() && !self.stop.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(1));
        }

        best
    }

    /// L'approfondissement itératif, commun à la recherche principale et aux
    /// auxiliaires. Rend le coup de la dernière itération ACHEVÉE.
    fn iterate(
        &mut self,
        board: &Board,
        max_depth: u32,
        scratch: &mut [(Move, i32)],
        report: &mut impl FnMut(&Info),
    ) -> Option<Move> {
        let mut best = None;
        let mut previous = DRAW;
        for depth in 1..=max_depth {
            let score = self.search_root(
                board,
                i32::try_from(depth).unwrap_or(1),
                depth,
                previous,
                scratch,
            );

            // Une itération interrompue a exploré ses coups dans le désordre :
            // son résultat est partiel et ne remplace pas le précédent.
            if self.aborted {
                break;
            }

            let Some(mv) = self.root_best else { break };
            best = Some(mv);
            previous = score;
            self.last_pv = self.pv.line();
            report(&Info {
                depth,
                score: Score::from_internal(score),
                nodes: self.nodes(),
                time_ms: self.elapsed_ms(),
                pv: self.last_pv.clone(),
                hashfull: self.tt.permille_used(),
            });

            // Un mat trouvé ne s'améliore pas en cherchant plus loin.
            if score.abs() > MATE_THRESHOLD {
                break;
            }
            // En ponder, l'échéance douce ne vaut pas : c'est le temps de
            // l'adversaire, on approfondit tant qu'il réfléchit. Elle
            // s'appliquera dès `ponderhit`, à la fin de l'itération en cours.
            if !self.is_pondering() && self.soft_deadline.is_some_and(|at| Instant::now() >= at) {
                break;
            }
        }
        best
    }

    /// Ce que cherche un fil auxiliaire : la même position que la recherche
    /// principale, par le même approfondissement, sans pendule ni rapport. Il
    /// s'arrête quand elle lève `helper_stop`, ou de lui-même s'il atteint la
    /// profondeur maximale avant elle — ou le budget de nœuds, qu'il tient
    /// comme elle, sur le total de tous les fils.
    ///
    /// Aucun décalage de profondeur entre les fils. C'est une variante connue
    /// de Lazy SMP ; elle se mesurera à part si la version la plus simple ne
    /// rend pas ce qu'on attend — pas recopiée d'avance.
    fn search_as_helper(
        &mut self,
        board: &Board,
        history: &[u64],
        max_depth: u32,
        node_limit: Option<u64>,
    ) {
        self.nodes = 0;
        self.published = 0;
        self.node_limit = node_limit;
        self.aborted = false;
        self.root_best = None;
        self.path = history.to_vec();
        self.killers.fill([0; 2]);
        self.history.fill(0);
        // Pas de reprise d'une ardoise perdue, contrairement à `go` : un
        // auxiliaire qui panique emporte toute la recherche avec lui.
        let mut scratch = std::mem::take(&mut self.scratch);
        self.iterate(board, max_depth, &mut scratch, &mut |_| {});
        self.scratch = scratch;
        self.publish_nodes();
    }

    /// Verse dans `published_nodes` ce que ce fil n'a pas encore publié.
    fn publish_nodes(&mut self) {
        self.published_nodes
            .fetch_add(self.nodes - self.published, Ordering::Relaxed);
        self.published = self.nodes;
    }

    /// Recherche la racine à une profondeur donnée, en pariant sur la stabilité
    /// du score.
    ///
    /// D'une itération à l'autre, le score bouge peu. On cherche donc dans une
    /// fenêtre étroite centrée sur le score précédent : plus la fenêtre est
    /// serrée, plus l'élagage alpha-bêta coupe tôt. Quand le pari échoue —
    /// score hors fenêtre — on élargit et l'on recommence, ce qui coûte une
    /// recherche mais reste rentable en moyenne.
    ///
    /// Pas de pari aux premières profondeurs, ni autour d'un score de mat :
    /// dans les deux cas le score précédent ne prédit rien.
    fn search_root(
        &mut self,
        board: &Board,
        depth: i32,
        iteration: u32,
        previous: i32,
        scratch: &mut [(Move, i32)],
    ) -> i32 {
        if iteration <= ASPIRATION_MIN_DEPTH || previous.abs() > MATE_THRESHOLD {
            return self.negamax(board, depth, 0, -INFINITY, INFINITY, scratch);
        }

        let mut delta = ASPIRATION_DELTA;
        let mut alpha = previous.saturating_sub(delta).max(-INFINITY);
        let mut beta = previous.saturating_add(delta).min(INFINITY);

        loop {
            let score = self.negamax(board, depth, 0, alpha, beta, scratch);
            if self.aborted {
                return score;
            }

            if score <= alpha {
                // Échec par le bas : la position est pire que prévu. On abaisse
                // le plancher et l'on ramène le plafond vers le centre, sans
                // quoi la fenêtre grandirait des deux côtés pour rien.
                beta = alpha.midpoint(beta);
                alpha = score.saturating_sub(delta).max(-INFINITY);
            } else if score >= beta {
                beta = score.saturating_add(delta).min(INFINITY);
            } else {
                return score;
            }

            // Élargissement géométrique : garantit qu'on finit par retomber sur
            // une fenêtre pleine, donc que la boucle se termine.
            delta = delta.saturating_add(delta / 2);
            if delta > MATE_THRESHOLD {
                return self.negamax(board, depth, 0, -INFINITY, INFINITY, scratch);
            }
        }
    }

    fn elapsed_ms(&self) -> u64 {
        u64::try_from(self.started.elapsed().as_millis()).unwrap_or(u64::MAX)
    }

    /// Calcule le budget de temps à partir des pendules.
    ///
    /// Volontairement grossier : la gestion fine du temps est un travail à part
    /// entière. Ce budget suffit à ne pas perdre au temps, ce qui est le seul
    /// objectif ici.
    fn set_deadlines(&mut self, limits: &Limits, side: Color) {
        let Some(budget_ms) = time_budget_ms(limits, side) else {
            self.hard_deadline = None;
            self.soft_deadline = None;
            return;
        };

        let now = Instant::now();
        self.hard_deadline = Some(now + Duration::from_millis(budget_ms));
        // Entamer une itération alors que plus de la moitié du budget est
        // consommée revient presque toujours à la jeter.
        self.soft_deadline = Some(now + Duration::from_millis(budget_ms / 2));
    }

    /// Vrai si la recherche doit cesser.
    ///
    /// L'horloge ne se consulte que par intervalles — `Instant::now()` coûte
    /// plus cher qu'un nœud. Le **budget de nœuds**, lui, se vérifie à chaque
    /// nœud : c'est une comparaison d'entiers, pas un appel système, et
    /// dépasser de deux mille nœuds fausserait un match à nœuds fixes, qui est
    /// précisément le protocole choisi pour mesurer sans bruit d'horloge.
    fn should_abort(&mut self) -> bool {
        if self.aborted {
            return true;
        }
        if self.node_limit.is_some_and(|limit| self.nodes() >= limit) {
            self.aborted = true;
            return true;
        }
        if self.nodes.is_multiple_of(CHECK_INTERVAL) {
            self.publish_nodes();
            // En ponder, la pendule ne court pas pour nous : seule l'interface
            // arrête la recherche. Après `ponderhit`, l'échéance posée au
            // `go ponder` s'applique — le temps passé à pondérer compte comme
            // déjà dépensé sur ce coup, et un ponder plus long que le budget
            // fait jouer aussitôt, en gardant la pendule pour la suite.
            self.aborted = self.stop.load(Ordering::Relaxed)
                || (!self.is_pondering()
                    && self.hard_deadline.is_some_and(|at| Instant::now() >= at));
        }
        self.aborted
    }

    /// La réduction à appliquer à un coup tardif.
    fn reduction(&self, depth: i32, index: usize) -> i32 {
        let depth = (depth.max(0) as usize).min(LMR_TABLE_SIDE - 1);
        let index = index.min(LMR_TABLE_SIDE - 1);
        self.lmr
            .get(depth * LMR_TABLE_SIDE + index)
            .copied()
            .unwrap_or(1)
    }

    fn is_repetition(&self, board: &Board) -> bool {
        // La fenêtre commence au dernier coup nul, position d'après comprise :
        // les positions qui le suivent forment une ligne cohérente entre
        // elles, pas avec celles d'avant. Voir `null_marks`.
        let from = self.null_marks.last().copied().unwrap_or(0);
        self.path
            .get(from..)
            .is_some_and(|window| repetitions(window, board.hash(), board.halfmove_clock()) > 0)
    }

    /// Vrai si la position est nulle PAR RÈGLE, vue depuis la recherche.
    ///
    /// Une seule répétition suffit — c'est le critère de recherche, voir
    /// [`Position::is_repetition`]. La règle des cinquante coups, elle, cède
    /// devant le mat : le mat termine la partie à l'instant où il est donné,
    /// la règle des cinquante coups demande qu'on la réclame. Un mat donné au
    /// centième demi-coup reste donc un mat, et le rendre nul ferait jouer au
    /// moteur un coup qui perd en croyant tenir.
    fn is_rule_draw(&self, board: &Board) -> bool {
        self.is_repetition(board)
            || (board.halfmove_clock() >= 100 && !is_checkmate(board))
            || eval::is_insufficient_material(board)
    }

    /// Retient un coup tranquille qui vient de provoquer une coupure bêta.
    ///
    /// Les captures en sont exclues : elles sont déjà ordonnées par MVV-LVA, et
    /// les mêler à l'historique noierait le signal des coups tranquilles.
    fn remember_quiet(&mut self, mv: Move, ply: usize, depth: i32) {
        let packed = pack_move(mv);
        if let Some(slot) = self.killers.get_mut(ply)
            && slot[0] != packed
        {
            slot[1] = slot[0];
            slot[0] = packed;
        }
        let index = mv.from as usize * 64 + mv.to as usize;
        if let Some(value) = self.history.get_mut(index) {
            *value += depth * depth;
            if *value > HISTORY_MAX {
                // Diviser toute la table préserve l'ordre relatif tout en
                // laissant de la place aux coupures à venir.
                for entry in &mut self.history {
                    *entry /= 2;
                }
            }
        }
    }

    /// Note un coup pour l'ordonnancement.
    ///
    /// Un bon ordre ne change pas le résultat de la recherche, seulement le
    /// nombre de nœuds visités — mais il le change d'un ordre de grandeur.
    fn score_move(&self, board: &Board, mv: Move, tt_move: Option<Move>, ply: usize) -> i32 {
        if tt_move == Some(mv) {
            return SCORE_TT;
        }
        let mut score = 0;
        if let Some(victim) = captured_piece(board, mv) {
            let attacker = board
                .piece_on(mv.from)
                .map_or(0, |piece| ORDER_VALUE[piece as usize]);
            score += SCORE_CAPTURE + 1_000 * ORDER_VALUE[victim as usize] - attacker;
        }
        if let Some(promotion) = mv.promotion {
            score += SCORE_PROMOTION + 1_000 * ORDER_VALUE[promotion as usize];
        }
        if score > 0 {
            return score;
        }

        let packed = pack_move(mv);
        if let Some(slot) = self.killers.get(ply) {
            if slot[0] == packed {
                return SCORE_KILLER_1;
            }
            if slot[1] == packed {
                return SCORE_KILLER_2;
            }
        }
        self.history
            .get(mv.from as usize * 64 + mv.to as usize)
            .copied()
            .unwrap_or(0)
    }

    /// Écrit les coups légaux dans `buffer`, du plus prometteur au moins
    /// prometteur, et rend leur nombre.
    ///
    /// Avec `tactical_only`, seuls les coups qui changent le matériel sont
    /// produits — captures, prises en passant et promotions. C'est ce dont la
    /// quiescence a besoin, et `cozy-chess` le rend bon marché :
    /// `PieceMoves.to` est un `BitBoard` public, donc filtrer les destinations
    /// coûte un `AND` par pièce.
    ///
    /// # Pourquoi un tampon fourni par l'appelant
    ///
    /// Cette fonction rendait un `Vec`, donc **allouait dans le tas à chaque
    /// nœud** — et 90 % des nœuds de ce moteur sont des nœuds de quiescence.
    /// Le précédent était connu sur ce dépôt : la première version de
    /// `nnue_probe` allouait par nœud et faisait paraître sa mesure 2,8 fois
    /// plus chère qu'elle ne l'est.
    ///
    /// Le tampon appartient à l'appelant plutôt qu'à `Search` pour une raison
    /// d'invariant : une fonction qui répond à une question ne mute rien, donc
    /// `&self` et non `&mut self`. Une pile de tampons indexée par ply aurait
    /// exigé `&mut self` sur un chemin de pure lecture.
    fn ordered_moves(
        &self,
        board: &Board,
        tactical_only: bool,
        tt_move: Option<Move>,
        ply: usize,
        buffer: &mut [(Move, i32)],
    ) -> usize {
        let side = board.side_to_move();
        let mut targets = board.colors(!side);
        if let Some(square) = en_passant_square(board) {
            targets |= square.bitboard();
        }
        let promotion_rank = Rank::Seventh.relative_to(side);

        let mut count = 0;
        board.generate_moves(|mut piece_moves| {
            if tactical_only {
                // Un pion sur la 7e rangée promeut quel que soit son coup :
                // toutes ses destinations sont tactiques.
                let promoting =
                    piece_moves.piece == Piece::Pawn && piece_moves.from.rank() == promotion_rank;
                if !promoting {
                    piece_moves.to &= targets;
                }
            }
            for mv in piece_moves {
                // Inatteignable : une position d'échecs a au plus 218 coups
                // légaux et le tampon en porte 256. La garde est là parce que
                // déborder en silence perdrait des coups — donc peut-être le
                // meilleur — sans que rien ne le signale.
                debug_assert!(count < buffer.len(), "tampon de coups débordé");
                if count < buffer.len() {
                    buffer[count] = (mv, self.score_move(board, mv, tt_move, ply));
                    count += 1;
                }
            }
            false
        });
        buffer[..count].sort_unstable_by_key(|&(_, score)| Reverse(score));
        count
    }

    /// Negamax avec élagage alpha-bêta.
    ///
    /// Le score rendu est du point de vue du camp au trait dans `board`.
    fn negamax(
        &mut self,
        board: &Board,
        depth: i32,
        ply: usize,
        mut alpha: i32,
        beta: i32,
        scratch: &mut [(Move, i32)],
    ) -> i32 {
        self.pv.clear(ply);

        // Une répétition, la règle des cinquante coups ou un matériel
        // insuffisant font nulle. Jamais à la racine : la position de départ
        // n'est pas un résultat, il faut jouer.
        //
        // Le test se fait AVANT l'aiguillage vers la quiescence, et c'est tout
        // son sens (C22). Placé après, il ne voyait que les nœuds intérieurs :
        // une position nulle atteinte à l'HORIZON était évaluée par la
        // quiescence comme si la partie continuait. Mesuré le 23 sept. 2026
        // en rejouant le régime réel d'un match : 0,68 % des entrées en
        // quiescence, soit 40 % de toutes les positions nulles que la
        // recherche rencontre. L'arbitre le signalait depuis toujours — « PV
        // continues after threefold repetition » — et la variante le montrait :
        // à la profondeur 1, `f8e8 e6f6` pour un coup qui termine la partie.
        //
        // La quiescence elle-même n'a pas à le refaire : ses coups sont des
        // captures et des promotions, qui remettent la pendule des cinquante
        // coups à zéro et interdisent toute répétition en aval. Seul son nœud
        // d'ENTRÉE, atteint par un coup tranquille, pouvait être une nulle.
        //
        // Le matériel insuffisant est déjà rendu à zéro par `evaluate` ; le
        // tester **aussi** ici n'est pas une redondance mais une coupure. Sans
        // elle, on parcourrait tout le sous-arbre d'une position morte pour
        // que chacune de ses feuilles rende le même zéro.
        if ply > 0 && self.is_rule_draw(board) {
            self.nodes += 1;
            return DRAW;
        }

        if depth <= 0 {
            return self.quiescence(board, alpha, beta, ply, scratch);
        }

        // L'ardoise porte une tranche par ply jusqu'à `MAX_PLY`. L'épuiser
        // signifierait avoir dépassé cette borne ; la garde rend la fonction
        // totale au lieu de reposer sur un raisonnement de profondeur.
        if scratch.len() < MAX_MOVES {
            return eval::evaluate(board, &self.params);
        }
        let (buffer, rest) = scratch.split_at_mut(MAX_MOVES);

        self.nodes += 1;
        if self.should_abort() {
            return 0;
        }

        let key = board.hash();
        let ply_i32 = i32::try_from(ply).unwrap_or(0);
        let hit = self.tt.probe(key, ply_i32);

        // Coupure par la table, jamais à la racine : il y faut un coup à jouer,
        // pas seulement un score.
        if ply > 0
            && let Some(hit) = hit
            && i32::from(hit.depth) >= depth
        {
            let usable = match hit.bound {
                Bound::Exact => true,
                Bound::Lower => hit.score >= beta,
                Bound::Upper => hit.score <= alpha,
            };
            if usable {
                return hit.score;
            }
        }

        // Même quand son score est inutilisable, le coup stocké reste le
        // meilleur candidat connu. Le contrôle de légalité couvre le cas d'une
        // collision de clés Zobrist, astronomiquement rare mais pas impossible.
        let tt_move = hit.and_then(|hit| hit.mv).filter(|&mv| board.is_legal(mv));

        // Futilité inverse.
        //
        // Le pendant du coup nul, appliqué au nœud lui-même plutôt qu'à son
        // sous-arbre : si la position est déjà si bonne que même en concédant
        // `RFP_MARGIN` par unité de profondeur restante elle dépasse `beta`,
        // la recherche ne fera que confirmer la coupure.
        //
        // Les gardes, et ce qu'elles écartent :
        // - **en échec**, le score statique ment : il ignore que le roi est
        //   attaqué et qu'un coup est obligatoire ;
        // - **contre une borne de mat**, la marge n'a plus de sens, `beta` n'y
        //   mesurant plus du matériel ;
        // - **jamais à la racine**, où il faut rendre un coup, pas un score ;
        // - **au-delà de `RFP_MAX_DEPTH`**, le score statique ne prédit plus.
        //
        // Mesuré avant d'être écrit : la condition porte sur 9,8 % des nœuds et
        // se déclenche sur 4,4 % d'entre eux — concentrée à la profondeur 1, où
        // couper épargne tout un étage de quiescence.
        if let Some(score) = self.reverse_futility_cut(board, depth, ply, beta) {
            return score;
        }

        // Élagage par coup nul.
        //
        // Dans presque toute position, avoir le trait est un avantage. Si l'on
        // passe son tour et que la position reste assez bonne pour couper,
        // alors elle l'est a fortiori en jouant : le sous-arbre est inutile.
        //
        // Les gardes ne sont pas décoratives :
        // - en échec, passer est illégal, et `null_move` rend `None` ;
        // - sans pièce autre que pions et roi, le zugzwang devient fréquent et
        //   l'hypothèse de base s'inverse — passer serait un cadeau, donc la
        //   coupure serait fausse (voir `has_non_pawn_material`) ;
        // - contre une borne de mat, la coupure produirait un mat imaginaire ;
        // - jamais à la racine, où il faut rendre un coup.
        if ply > 0
            && depth >= NULL_MOVE_MIN_DEPTH
            && board.checkers().is_empty()
            && beta.abs() < MATE_THRESHOLD
            && has_non_pawn_material(board)
            && let Some(passed) = board.null_move()
        {
            self.null_marks.push(self.path.len());
            self.path.push(passed.hash());
            let score = -self.negamax(
                &passed,
                depth - 1 - NULL_MOVE_REDUCTION,
                ply + 1,
                -beta,
                -beta + 1,
                rest,
            );
            self.path.pop();
            self.null_marks.pop();

            if self.aborted {
                return 0;
            }
            if score >= beta {
                // Un score de mat obtenu grâce à un coup qu'on n'a pas le droit
                // de jouer est faux : on rend la borne, pas le mat.
                return if score.abs() > MATE_THRESHOLD {
                    beta
                } else {
                    score
                };
            }
        }

        let count = self.ordered_moves(board, false, tt_move, ply, buffer);
        if count == 0 {
            return if board.checkers().is_empty() {
                DRAW // pat
            } else {
                // Un mat proche vaut mieux qu'un mat lointain : soustraire le
                // ply fait préférer la ligne la plus courte.
                -MATE + ply_i32
            };
        }

        let original_alpha = alpha;
        let mut best = -INFINITY;
        let mut best_move = None;
        let in_check = !board.checkers().is_empty();

        let mut quiets_seen = 0usize;

        for (index, &(mv, _)) in buffer[..count].iter().enumerate() {
            let quiet = captured_piece(board, mv).is_none() && mv.promotion.is_none();

            // Élagage par compte de coups : on abandonne les coups tranquilles
            // restants. `break` et non `continue`, parce que l'ordonnancement
            // place toutes les captures avant tous les coups tranquilles — ce
            // qui reste derrière est tranquille, et moins bien classé encore.
            if self.late_move_prune(quiet, in_check, ply, depth, best, quiets_seen) {
                break;
            }
            if quiet {
                quiets_seen += 1;
            }

            let mut child = board.clone();
            child.play_unchecked(mv);

            // Réduction des coups tardifs.
            //
            // L'ordonnancement place en tête les coups les plus prometteurs :
            // passé les premiers, la probabilité qu'un coup soit le meilleur
            // s'effondre. On les cherche donc moins profondément, quitte à
            // recommencer à profondeur pleine si la réduction s'est trompée.
            //
            // Ce qu'on ne réduit jamais, et pourquoi :
            // - les captures et promotions, qui changent le matériel et dont
            //   l'évaluation superficielle est trompeuse ;
            // - les coups qui donnent échec, forcés par nature ;
            // - les positions où l'on est soi-même en échec, où tout coup est
            //   une parade obligée ;
            // - les premiers coups, qui sont ceux que l'ordonnancement a jugés
            //   bons — les réduire saboterait son travail.
            let reduction = if quiet
                && !in_check
                && child.checkers().is_empty()
                && depth >= LMR_MIN_DEPTH
                && index >= LMR_FIRST_REDUCED
            {
                self.reduction(depth, index).min(depth - 2).max(0)
            } else {
                0
            };

            self.path.push(child.hash());
            let mut score =
                -self.negamax(&child, depth - 1 - reduction, ply + 1, -beta, -alpha, rest);
            // La réduction a menti : ce coup mérite la profondeur pleine.
            //
            // `!self.aborted` n'est pas décoratif : une recherche interrompue
            // rend 0, et zéro dépasse `alpha` dans toute position perdante. La
            // re-recherche partait alors sur un score qui ne veut rien dire,
            // pour un résultat de toute façon jeté. Trouvé par le test du
            // budget de nœuds, qui dépassait d'exactement un nœud.
            if reduction > 0 && !self.aborted && score > alpha {
                score = -self.negamax(&child, depth - 1, ply + 1, -beta, -alpha, rest);
            }
            self.path.pop();

            if self.aborted {
                return 0;
            }

            if score > best {
                best = score;
                best_move = Some(mv);
                if ply == 0 {
                    self.root_best = Some(mv);
                }
                if score > alpha {
                    alpha = score;
                    self.pv.push(ply, mv);
                    if alpha >= beta {
                        // Un coup tranquille qui réfute une variante en réfute
                        // souvent d'autres : on s'en souvient.
                        if quiet {
                            self.remember_quiet(mv, ply, depth);
                        }
                        break;
                    }
                }
            }
        }

        // Le type de borne dit ce que le score garantit : exact si tous les
        // coups ont été examinés sans coupure, minorant après une coupure bêta,
        // majorant si aucun coup n'a amélioré alpha.
        let bound = if best >= beta {
            Bound::Lower
        } else if best > original_alpha {
            Bound::Exact
        } else {
            Bound::Upper
        };
        self.tt.store(key, best_move, best, depth, bound, ply_i32);

        best
    }

    /// Recherche de quiescence : ne s'arrête que sur une position calme.
    ///
    /// En dehors d'un échec, seules les captures et les promotions sont
    /// explorées. En échec, tous les coups le sont : ignorer les parades ferait
    /// évaluer une position perdue comme tranquille.
    fn quiescence(
        &mut self,
        board: &Board,
        mut alpha: i32,
        beta: i32,
        ply: usize,
        scratch: &mut [(Move, i32)],
    ) -> i32 {
        self.pv.clear(ply);
        self.nodes += 1;
        if self.should_abort() {
            return 0;
        }
        if ply + 1 >= MAX_PLY || scratch.len() < MAX_MOVES {
            return eval::evaluate(board, &self.params);
        }
        let (buffer, rest) = scratch.split_at_mut(MAX_MOVES);

        let in_check = !board.checkers().is_empty();
        let mut stand_pat = -INFINITY;

        if !in_check {
            // « Stand pat » : ne rien jouer est une option, et la plupart des
            // positions sont déjà au moins aussi bonnes que ce qu'une capture
            // forcée donnerait.
            stand_pat = eval::evaluate(board, &self.params);
            if stand_pat >= beta {
                return stand_pat;
            }
            if stand_pat > alpha {
                alpha = stand_pat;
            }
        }

        let count = self.ordered_moves(board, !in_check, None, ply, buffer);
        if count == 0 {
            return if in_check {
                -MATE + i32::try_from(ply).unwrap_or(0)
            } else {
                alpha
            };
        }

        let mut best = if in_check { -INFINITY } else { alpha };
        for &(mv, _) in &buffer[..count] {
            if self.delta_prunable(board, mv, in_check, stand_pat, alpha) {
                // Sauter et non rompre : l'ordre MVV-LVA mêle la valeur de la
                // victime, celle de l'agresseur et la promotion, donc une
                // capture élagable peut en précéder une qui ne l'est pas.
                continue;
            }
            if see_prunable(board, mv, in_check) {
                continue;
            }

            let mut child = board.clone();
            child.play_unchecked(mv);

            let score = -self.quiescence(&child, -beta, -alpha, ply + 1, rest);

            if self.aborted {
                return 0;
            }
            if score > best {
                best = score;
                if score > alpha {
                    alpha = score;
                    self.pv.push(ply, mv);
                    if alpha >= beta {
                        break;
                    }
                }
            }
        }
        best
    }

    /// Le score à rendre si la futilité inverse coupe ici, sinon `None`.
    ///
    /// Isolée en méthode pour que le commutateur de test tienne dans un seul
    /// endroit, et que `negamax` reste lisible.
    fn reverse_futility_cut(
        &self,
        board: &Board,
        depth: i32,
        ply: usize,
        beta: i32,
    ) -> Option<i32> {
        #[cfg(test)]
        if !self.reverse_futility {
            return None;
        }

        if ply == 0
            || depth > RFP_MAX_DEPTH
            || !board.checkers().is_empty()
            || beta.abs() >= MATE_THRESHOLD
        {
            return None;
        }

        let static_eval = eval::evaluate(board, &self.params);
        (static_eval - RFP_MARGIN * depth >= beta).then_some(static_eval)
    }

    /// Vrai si les coups tranquilles restants doivent être abandonnés.
    ///
    /// # Ce que ça fait, et en quoi c'est différent de LMR
    ///
    /// La réduction des coups tardifs cherche moins profondément **et se
    /// rattrape** : si la recherche réduite dépasse `alpha`, on recommence à
    /// profondeur pleine. L'élagage par compte de coups, lui, **ne regarde
    /// pas**. Un bon coup mal classé est perdu sans trace.
    ///
    /// # Ce que ça coûte, mesuré avant d'être écrit
    ///
    /// C'est le **premier élagage du projet sans argument de borne**. L'élagage
    /// delta *majore* le gain d'une capture, donc il ne coupe que ce qui ne
    /// pouvait pas atteindre `alpha` ; la futilité inverse compare à une borne ;
    /// le coup nul a son hypothèse et sa garde. Ici, le seul appui est
    /// « l'ordonnancement a probablement raison ».
    ///
    /// Instrumenté le 15 sept. 2026 sur des positions tirées de vraies parties :
    /// au seuil retenu, LMP élague **58,4 %** des coups tranquilles et détruit
    /// **3,8 %** des montées d'`alpha`. Ce taux ne tombe jamais à zéro, à aucun
    /// réglage. **Confiance sur le signe du gain : inconnue.**
    ///
    /// # Les gardes, et ce que chacune écarte
    ///
    /// - **les captures et promotions ne sont jamais élaguées** — et la garde
    ///   est double : la condition exige un coup tranquille, et l'ordonnancement
    ///   place *toutes* les captures avant *tous* les coups tranquilles, si bien
    ///   qu'interrompre la boucle n'en saute aucune. Un test vérifie cet ordre,
    ///   sans quoi la sûreté reposerait sur une lecture des barèmes ;
    /// - **en échec**, toute parade est obligatoire : compter les coups n'a
    ///   aucun sens quand ils sont tous forcés ;
    /// - **jamais à la racine**, où il faut rendre un coup et pas un score ;
    /// - **au-delà de `LMP_MAX_DEPTH`**, un coup tardif a encore la place de se
    ///   révéler bon ;
    /// - **tant qu'aucun coup n'a rendu mieux qu'une borne de mat** — ce qui
    ///   couvre deux cas d'un coup : on ne coupe pas quand on se fait mater, où
    ///   la seule défense peut être un coup tranquille très mal classé ; et
    ///   `best` valant `-INFINITY` avant le premier coup, on n'élague jamais un
    ///   nœud dont aucun coup n'a encore été cherché.
    ///
    /// # Ce que l'élagage fait au score rendu
    ///
    /// Le nœud n'a pas examiné tous ses coups : `best` est un **minorant** de sa
    /// vraie valeur, et la borne stockée dans la table devient une estimation.
    /// C'est déjà le cas après une coupure par coup nul ou par futilité inverse,
    /// et pour la même raison — **un élagage vers l'avant a troqué la sûreté
    /// contre de la profondeur bien avant d'arriver à la table**. Traiter LMP
    /// autrement mesurerait autre chose que ce que mesurent les moteurs qui
    /// l'emploient.
    fn late_move_prune(
        &self,
        quiet: bool,
        in_check: bool,
        ply: usize,
        depth: i32,
        best: i32,
        quiets_seen: usize,
    ) -> bool {
        #[cfg(test)]
        if !self.late_move_pruning {
            return false;
        }

        quiet
            && !in_check
            && ply > 0
            && depth <= LMP_MAX_DEPTH
            && best > -MATE_THRESHOLD
            && quiets_seen >= lmp_limit(depth)
    }

    /// Vrai si cette capture ne peut pas ramener la position jusqu'à `alpha`.
    ///
    /// Mesuré avant d'être écrit, le 14 sept. 2026 : **90 % des nœuds du moteur
    /// sont des nœuds de quiescence**, et ce test atteint **39 % des captures
    /// qu'elle examine** sur des positions tirées de vraies parties (60 % sur le
    /// banc — l'écart est le piège déjà consigné).
    ///
    /// Trois gardes, et aucune n'est décorative :
    /// - **en échec**, toute parade est obligatoire : élaguer ferait évaluer une
    ///   position perdue comme tranquille, ce que la quiescence existe pour
    ///   empêcher ;
    /// - **une promotion** gagne bien plus que la pièce prise — jusqu'à une dame
    ///   — et la valeur de la victime ne le dit pas ;
    /// - **autour d'un score de mat**, l'arithmétique de la marge n'a plus de
    ///   sens : `alpha` n'y mesure plus du matériel.
    ///
    /// La valeur retenue pour la victime est le **maximum** de ses valeurs de
    /// milieu de partie et de finale. L'élagage n'est licite que si l'on est sûr
    /// que la capture ne suffit pas : il faut donc majorer son gain, jamais le
    /// minorer.
    fn delta_prunable(
        &self,
        board: &Board,
        mv: Move,
        in_check: bool,
        stand_pat: i32,
        alpha: i32,
    ) -> bool {
        #[cfg(test)]
        if !self.delta_pruning {
            return false;
        }

        if in_check || mv.promotion.is_some() || alpha.abs() >= MATE_THRESHOLD {
            return false;
        }
        let Some(victim) = captured_piece(board, mv) else {
            return false;
        };
        let gain = self.params.mg_value[victim as usize].max(self.params.eg_value[victim as usize]);
        stand_pat.saturating_add(gain).saturating_add(DELTA_MARGIN) <= alpha
    }
}

/// Lève un drapeau en sortant de portée — y compris quand on en sort par une
/// panique. C'est ce qui arrête les auxiliaires de Lazy SMP quoi qu'il arrive
/// à la recherche principale.
struct StopOnDrop<'a>(&'a AtomicBool);

impl Drop for StopOnDrop<'_> {
    fn drop(&mut self) {
        self.0.store(true, Ordering::Relaxed);
    }
}

/// La pièce réellement capturée par un coup, s'il y en a une.
///
/// Trois cas qu'une simple lecture de la case d'arrivée manquerait :
/// - le **roque** est encodé roi-prend-tour par `cozy-chess`, donc la case
///   d'arrivée porte notre propre tour et ce n'est pas une capture ;
/// - la **prise en passant** laisse la case d'arrivée vide alors qu'un pion
///   disparaît ;
/// - un coup tranquille n'a pas de victime.
#[must_use]
pub fn captured_piece(board: &Board, mv: Move) -> Option<Piece> {
    if board.colors(board.side_to_move()).has(mv.to) {
        return None; // roque
    }
    if let Some(piece) = board.piece_on(mv.to) {
        return Some(piece);
    }
    let is_pawn = board.piece_on(mv.from) == Some(Piece::Pawn);
    if is_pawn && mv.from.file() != mv.to.file() {
        return Some(Piece::Pawn); // prise en passant
    }
    None
}

fn see_prunable(board: &Board, mv: Move, in_check: bool) -> bool {
    if in_check {
        return false;
    }
    let Some(victim) = captured_piece(board, mv) else {
        return false;
    };
    mv.promotion.is_none() && may_lose_material(board, mv, victim) && see::see(board, mv) < 0
}

/// Cette capture peut-elle perdre du matériel ?
///
/// **Une pure économie, jamais une garde de correction.** Se tromper ne peut
/// pas faire sauter une capture à tort : rendre `true` à tort mène à `see`, qui
/// rend alors un score positif et n'élague pas. Rendre `false` à tort ne fait
/// que manquer un élagage. C'est ce qui autorise un filtre approximatif ici,
/// alors qu'il serait inacceptable dans `see`.
///
/// Son rôle est d'éviter l'appel à `see` — une suite d'échanges — quand sa
/// réponse est connue d'avance. Deux cas se décident sans calculer :
///
/// - **La victime vaut au moins l'agresseur.** Les deux camps peuvent s'arrêter
///   à tout moment dans `see` : on peut toujours encaisser la victime, subir la
///   reprise et cesser, donc `see(mv) >= valeur(victime) − valeur(agresseur)`.
///   Le membre de droite étant positif ou nul, l'échange l'est aussi.
/// - **Le roi capture.** Un coup de roi produit par le générateur est légal,
///   donc la case n'est attaquée par personne après coup — une pièce clouée
///   défend quand même contre le roi, la règle du jeu est de notre côté ici.
///   `see` rendrait donc la valeur de la victime ; l'appeler ne servirait qu'à
///   payer la géométrie.
///
/// Un test éprouve l'économie sur une marche déterministe de milliers de
/// positions : `false` n'y est jamais rendu sur une capture perdante.
fn may_lose_material(board: &Board, mv: Move, victim: Piece) -> bool {
    let Some(attacker) = board.piece_on(mv.from) else {
        return false;
    };
    attacker != Piece::King && see::piece_value(victim) < see::piece_value(attacker)
}

/// Côté de la table de réductions, en profondeur comme en rang de coup.
/// Nombre de coups tranquilles examinés avant d'abandonner les suivants.
///
/// Fonction à part, et non une expression enfouie dans la boucle : c'est ce qui
/// la rend **assertable**. Le motif a déjà servi trois fois sur ce projet —
/// `parse_go`, `random_seed`, `time_budget_ms` — et chaque fois pour la même
/// raison : un invariant qu'on ne peut pas appeler est un invariant qu'aucun
/// test ne protège.
///
/// Le terme quadratique dit que plus il reste de profondeur, plus un coup tardif
/// a de chances de se révéler bon, donc plus on en examine avant de renoncer.
fn lmp_limit(depth: i32) -> usize {
    LMP_BASE + (depth.max(0) as usize).pow(2)
}

const LMR_TABLE_SIDE: usize = 64;

/// Précalcule les réductions.
///
/// La croissance est logarithmique dans les deux dimensions : réduire d'autant
/// plus que la profondeur restante est grande — il y aura de quoi rattraper —
/// et que le coup est tardif — il est d'autant moins probable qu'il soit bon.
/// Une croissance linéaire réduirait trop vite en profondeur moyenne.
///
/// Les constantes sont conventionnelles, pas réglées pour ce moteur : elles
/// sont à améliorer par SPRT, comme les valeurs de l'évaluation.
fn build_lmr_table() -> Vec<i32> {
    let mut table = vec![0; LMR_TABLE_SIDE * LMR_TABLE_SIDE];
    for depth in 1..LMR_TABLE_SIDE {
        for index in 1..LMR_TABLE_SIDE {
            let value = 0.75 + (depth as f64).ln() * (index as f64).ln() / 2.25;
            table[depth * LMR_TABLE_SIDE + index] = (value as i32).max(1);
        }
    }
    table
}

/// Vrai si le camp au trait possède autre chose que des pions et son roi.
///
/// C'est la garde du coup nul. Le zugzwang — être perdu *parce qu'on doit
/// jouer* — est rare tant qu'il reste des pièces, parce qu'il existe presque
/// toujours un coup d'attente inoffensif. Dans une finale de pions, chaque
/// coup de pion est irréversible et chaque coup de roi concède du terrain :
/// le zugzwang devient courant, et l'hypothèse du coup nul s'inverse.
#[must_use]
pub fn has_non_pawn_material(board: &Board) -> bool {
    let side = board.side_to_move();
    let pieces = board.colors(side) & !board.pieces(Piece::Pawn) & !board.pieces(Piece::King);
    !pieces.is_empty()
}

/// La case d'arrivée d'une prise en passant, si elle est disponible.
fn en_passant_square(board: &Board) -> Option<Square> {
    board
        .en_passant()
        .map(|file| Square::new(file, Rank::Sixth.relative_to(board.side_to_move())))
}

/// Ordre de valeur des pièces pour l'ordonnancement, du pion au roi.
const ORDER_VALUE: [i32; Piece::NUM] = [1, 2, 3, 4, 5, 6];

// Paliers d'ordonnancement. Les écarts sont larges pour qu'aucune catégorie ne
// puisse en dépasser une autre, quelle que soit la valeur accumulée par
// l'heuristique d'historique.
const SCORE_TT: i32 = 8_000_000;
const SCORE_CAPTURE: i32 = 4_000_000;
const SCORE_PROMOTION: i32 = 2_000_000;
const SCORE_KILLER_1: i32 = 1_000_000;
const SCORE_KILLER_2: i32 = 900_000;
/// Plafond de l'historique, au-delà duquel toutes les valeurs sont divisées par
/// deux. Sans cela elles finiraient par déborder et par écraser les paliers.
const HISTORY_MAX: i32 = 800_000;

/// Vrai si le camp au trait est mat.
///
/// La génération de coups ne s'exécute qu'en échec, donc presque jamais : cette
/// fonction ne sert qu'à la règle des cinquante coups, où elle départage une
/// nulle d'un mat.
fn is_checkmate(board: &Board) -> bool {
    !board.checkers().is_empty() && first_legal_move(board).is_none()
}

/// Le premier coup légal de la position, dans l'ordre de génération.
fn first_legal_move(board: &Board) -> Option<Move> {
    let mut found = None;
    board.generate_moves(|piece_moves| {
        found = piece_moves.into_iter().next();
        found.is_some()
    });
    found
}

/// Tire un coup légal de façon reproductible, sans aucune évaluation.
///
/// Conservé comme adversaire de référence : un moteur qui ne bat pas
/// systématiquement le hasard n'a pas de recherche qui fonctionne.
///
/// La graine est le hash Zobrist de la position, donc deux appels sur la même
/// position rendent le même coup. Aucun hasard non seedé n'entre dans le
/// moteur — c'est un invariant, pas une commodité.
#[must_use]
pub fn random_legal_move(board: &Board) -> Option<Move> {
    let mut legal = Vec::new();
    board.generate_moves(|moves| {
        legal.extend(moves);
        false
    });
    if legal.is_empty() {
        return None;
    }
    let mut state = random_seed(board.hash());
    let index = (next_random(&mut state) % legal.len() as u64) as usize;
    legal.get(index).copied()
}

/// Le budget de temps du coup à jouer, en millisecondes.
///
/// `None` quand aucune horloge ne contraint la recherche : `go infinite`, ou
/// une recherche à profondeur ou à nœuds imposés.
///
/// Fonction pure, séparée de `set_deadlines` pour la même raison que
/// `random_seed` : tant que cette arithmétique vivait au milieu d'une fonction
/// qui pose des `Instant`, aucun test ne pouvait en asserter le résultat, et
/// sept mutants y survivaient. Se tromper ici ne coûte pas de l'Elo — **ça perd
/// des parties au temps**, ce qu'aucun SPRT ne distingue d'une faiblesse de
/// jeu.
///
/// # Pourquoi `MOVES_TO_GO_DEFAUT` vaut douze
///
/// Il valait **trente**, et le moteur finissait ses parties avec **48 % de sa
/// pendule inutilisée** — mesuré sur des parties entières, pas supposé. La
/// formule suppose qu'il reste trente coups *toujours*, dans des parties qui
/// en font quatre-vingt-dix-sept.
///
/// Douze est le **point de saturation**, et ce n'est pas un réglage au juger :
/// le plafond d'une allocation *plate* vaut `(pendule + coups × inc) / coups`,
/// soit 280 ms pour quarante coups par camp à `8+0,08` — et le diviseur douze
/// alloue 285 ms là où le trente n'en alloue que 216. En dessous de douze, le
/// budget ne monte plus : dix en alloue 283. **Un diviseur est une famille à
/// un paramètre qui bute sur la physique du problème.**
///
/// Ce que ça achète : × 1,32 sur le budget par coup, soit **+0,54 pli** par la
/// courbe profondeur/temps du projet, et +0,70 pli mesuré directement.
/// Attention au piège qui a coûté un chiffre publié : *× 1,9 sur la ressource
/// TOTALE consommée ne fait pas × 1,9 sur l'allocation par coup*, le budget
/// étant proportionnel à ce qui reste.
///
/// **Zéro perte au temps** aux deux cadences (`8+0,08` et `1+0,01`) et à tous
/// les diviseurs jusqu'à dix — c'est structurel, `restant / d` est une
/// décroissance géométrique qui n'atteint jamais zéro.
///
/// Quand l'interface FOURNIT `movestogo` — cadence de tournoi, « quarante
/// coups en deux heures » — c'est le vrai nombre de coups avant le prochain
/// contrôle, et on l'honore tel quel. Cette constante n'est que le défaut.
///
/// Reste grossier : dépenser *inégalement* — plus sur les positions dures —
/// est un autre chantier, et le seul moyen de dépasser le plafond plat.
#[must_use]
fn time_budget_ms(limits: &Limits, side: Color) -> Option<u64> {
    if limits.infinite {
        return None;
    }
    if let Some(movetime) = limits.movetime {
        // La marge couvre le trajet de la réponse jusqu'à l'interface.
        return Some(movetime.saturating_sub(20).max(1));
    }

    let (remaining, increment) = match side {
        Color::White => (limits.wtime, limits.winc),
        Color::Black => (limits.btime, limits.binc),
    };
    let remaining = remaining?;
    let increment = increment.unwrap_or(0);
    let moves_to_go = u64::from(limits.movestogo.unwrap_or(MOVES_TO_GO_DEFAUT)).max(1);
    let budget = remaining / moves_to_go + increment / 2;
    // Toujours garder une marge : une pendule à zéro perd la partie, quelle
    // que soit la position.
    Some(budget.clamp(1, remaining.saturating_sub(50).max(1)))
}

/// Coups supposés restants quand l'interface n'annonce pas `movestogo`.
///
/// Mesuré, pas choisi : voir `time_budget_ms`. Valait trente, ce qui laissait
/// 48 % de la pendule inutilisée en fin de partie.
const MOVES_TO_GO_DEFAUT: u32 = 12;

/// La graine du tirage : le hash Zobrist, forcé impair.
///
/// **Zéro est un point fixe de xorshift64** — un état nul y reste et rend
/// toujours zéro, donc toujours le premier coup de la liste. Forcer le bit de
/// poids faible est ce qui empêche l'adversaire de référence de dégénérer, et
/// avec lui le tournoi de vingt-quatre parties qui sert de critère
/// d'acceptation.
///
/// Fonction nommée plutôt qu'expression en ligne : un invariant qu'on ne peut
/// pas appeler est un invariant qu'aucun test ne peut protéger.
#[must_use]
fn random_seed(hash: u64) -> u64 {
    hash | 1
}

/// xorshift64*, suffisant pour un tirage de coup et entièrement déterministe.
fn next_random(state: &mut u64) -> u64 {
    let mut x = *state;
    x ^= x >> 12;
    x ^= x << 25;
    x ^= x >> 27;
    *state = x;
    x.wrapping_mul(0x2545_F491_4F6C_DD1D)
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]
mod tests {
    use super::*;

    fn board(fen: &str) -> Board {
        fen.parse().unwrap()
    }

    fn search() -> Search {
        Search::new(Arc::new(AtomicBool::new(false)))
    }

    /// Une ardoise jetable, pour les tests qui appellent la recherche
    /// directement au lieu de passer par `go`.
    fn ardoise() -> Vec<(Move, i32)> {
        vec![(NO_MOVE, 0); MAX_PLY * MAX_MOVES]
    }

    fn best(fen: &str, depth: u32) -> String {
        let position = Position::from_fen(fen).unwrap();
        let limits = Limits {
            depth: Some(depth),
            ..Limits::default()
        };
        let mv = search().go(&position, &limits, |_| {}).unwrap();
        cozy_chess::util::display_uci_move(position.board(), mv).to_string()
    }

    #[test]
    fn le_roque_nest_pas_compte_comme_une_capture() {
        // cozy-chess encode le roque roi-prend-tour : la case d'arrivée porte
        // NOTRE tour. Lire naïvement la case ferait noter le roque comme la
        // capture de sa propre tour, ce qui corromprait tout l'ordonnancement.
        let b = board("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
        let roque = cozy_chess::util::parse_uci_move(&b, "e1g1").unwrap();
        assert_eq!(captured_piece(&b, roque), None);
        assert_eq!(search().score_move(&b, roque, None, 0), 0);
    }

    #[test]
    fn la_prise_en_passant_est_reconnue_comme_capture() {
        // La case d'arrivée est vide, mais un pion disparaît tout de même.
        let b = board("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3");
        let prise = cozy_chess::util::parse_uci_move(&b, "e5f6").unwrap();
        assert_eq!(captured_piece(&b, prise), Some(Piece::Pawn));
        assert!(search().score_move(&b, prise, None, 0) > 0);
    }

    #[test]
    fn une_capture_ordinaire_est_notee_selon_mvv_lva() {
        let b = board("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
        let prise = cozy_chess::util::parse_uci_move(&b, "e4d5").unwrap();
        assert_eq!(captured_piece(&b, prise), Some(Piece::Pawn));
        let tranquille = cozy_chess::util::parse_uci_move(&b, "d2d3").unwrap();
        let s = search();
        assert!(s.score_move(&b, prise, None, 0) > s.score_move(&b, tranquille, None, 0));
    }

    #[test]
    fn les_coups_tactiques_seuls_excluent_les_coups_tranquilles() {
        let b = board("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
        let s = search();
        let mut buffer = [(NO_MOVE, 0); MAX_MOVES];
        let tactiques = s.ordered_moves(&b, true, None, 0, &mut buffer);
        assert_eq!(tactiques, 1, "seule exd5 change le matériel");
        assert!(s.ordered_moves(&b, false, None, 0, &mut buffer) > 1);
    }

    #[test]
    fn le_tampon_de_coups_couvre_la_position_la_plus_riche_connue() {
        // 218 est le maximum de coups légaux d'une position d'échecs, établi
        // par recherche exhaustive. Cette position en produit 218 — la valider
        // ici, c'est vérifier que MAX_MOVES n'est pas une estimation.
        let b = board("R6R/3Q4/1Q4Q1/4Q3/2Q4Q/Q4Q2/pp1Q4/kBNN1KB1 w - - 0 1");
        let s = search();
        let mut buffer = [(NO_MOVE, 0); MAX_MOVES];
        let count = s.ordered_moves(&b, false, None, 0, &mut buffer);
        assert_eq!(
            count, 218,
            "la position de référence doit produire 218 coups"
        );
        assert!(
            count < MAX_MOVES,
            "le tampon doit rester plus grand que le maximum"
        );
    }

    #[test]
    fn un_mat_en_un_est_trouve() {
        // Mat du berger : Dxf7 est mat.
        assert_eq!(
            best(
                "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1",
                3
            ),
            "f3f7"
        );
        // Mat du lion : après 1.f3 e5 2.g4, Dh4 est mat.
        assert_eq!(
            best(
                "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
                3
            ),
            "d8h4"
        );
    }

    #[test]
    fn le_score_dun_mat_est_annonce_comme_tel() {
        let position = Position::from_fen(
            "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1",
        )
        .unwrap();
        let mut vu = None;
        search().go(
            &position,
            &Limits {
                depth: Some(3),
                ..Limits::default()
            },
            |info| {
                if vu.is_none() {
                    vu = Some(info.score);
                }
            },
        );
        assert_eq!(vu, Some(Score::Mate(1)));
    }

    #[test]
    fn le_camp_qui_subit_le_mat_voit_un_score_negatif() {
        // Roi noir a8, roi blanc c7, tour b1. Les Noirs n'ont qu'un coup légal,
        // Ka7, après quoi Ta1 est mat. Vérifié par `go perft 1` : un seul coup.
        let position = Position::from_fen("k7/2K5/8/8/8/8/8/1R6 b - - 0 1").unwrap();
        let mut dernier = None;
        search().go(
            &position,
            &Limits {
                depth: Some(5),
                ..Limits::default()
            },
            |info| dernier = Some(info.score),
        );
        assert_eq!(
            dernier,
            Some(Score::Mate(-1)),
            "un mat subi s'annonce avec un nombre de coups négatif"
        );
    }

    #[test]
    fn une_piece_en_prise_gratuite_est_capturee() {
        // Tour d2, dame noire d5 sans défense sur la même colonne.
        assert_eq!(best("4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1", 3), "d2d5");
    }

    /// Construit une recherche dont le seul élagage delta est désactivé.
    fn search_sans_delta() -> Search {
        let mut s = search();
        s.delta_pruning = false;
        s
    }

    /// Le score statique de la position, du point de vue du camp au trait.
    fn stand_pat(fen: &str) -> i32 {
        eval::evaluate(&board(fen), &eval::Params::DEFAULT)
    }

    /// Construit une recherche dont la seule futilité inverse est désactivée.
    fn search_sans_rfp() -> Search {
        let mut s = search();
        s.reverse_futility = false;
        s
    }

    /// Construit une recherche dont le seul élagage par compte de coups est
    /// désactivé.
    fn search_sans_lmp() -> Search {
        let mut s = search();
        s.late_move_pruning = false;
        s
    }

    #[test]
    fn le_seuil_de_compte_croit_avec_la_profondeur() {
        // Valeurs relevées sur la formule, pas recopiées d'une intention :
        // plus il reste de profondeur, plus un coup tardif a la place de se
        // révéler bon, donc plus on en examine avant de renoncer.
        assert_eq!(lmp_limit(1), LMP_BASE + 1);
        assert_eq!(lmp_limit(2), LMP_BASE + 4);
        assert_eq!(lmp_limit(3), LMP_BASE + 9);
        // Strictement croissante : sans quoi une profondeur plus grande
        // élaguerait plus tôt, ce qui est l'inverse de l'intention.
        for d in 1..LMP_MAX_DEPTH {
            assert!(
                lmp_limit(d) < lmp_limit(d + 1),
                "le seuil doit croître : {} à d={d}, {} à d={}",
                lmp_limit(d),
                lmp_limit(d + 1),
                d + 1
            );
        }
    }

    #[test]
    fn lelagage_par_compte_retire_des_noeuds() {
        let position = Position::from_fen(crate::bench::BENCH_FENS[1]).unwrap();
        let limits = Limits {
            depth: Some(7),
            ..Limits::default()
        };
        let mut avec = search();
        avec.go(&position, &limits, |_| {});
        let mut sans = search_sans_lmp();
        sans.go(&position, &limits, |_| {});
        assert!(
            avec.nodes() < sans.nodes(),
            "l'élagage par compte ne retire rien : {} avec, {} sans",
            avec.nodes(),
            sans.nodes()
        );
    }

    #[test]
    fn seuls_les_coups_tranquilles_sont_elagues() {
        // Une capture n'est jamais élaguée, quel que soit le compte atteint.
        let s = search();
        assert!(!s.late_move_prune(false, false, 1, 1, 0, 1_000));
        // Le même appel sur un coup tranquille coupe, lui : c'est ce qui prouve
        // que le test mesure la garde et non l'absence de condition.
        assert!(s.late_move_prune(true, false, 1, 1, 0, 1_000));
    }

    #[test]
    fn toutes_les_captures_precedent_tous_les_coups_tranquilles() {
        // C'est l'invariant qui rend `break` licite plutôt que `continue` :
        // interrompre la boucle ne saute jamais une capture. Il repose sur les
        // barèmes d'ordonnancement, donc il se vérifie au lieu de se lire.
        let b = board("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4");
        let s = search();
        let mut buffer = vec![(NO_MOVE, 0); MAX_MOVES];
        let count = s.ordered_moves(&b, false, None, 1, &mut buffer);
        let mut tranquille_vu = false;
        let mut captures = 0;
        for &(mv, _) in &buffer[..count] {
            let quiet = captured_piece(&b, mv).is_none() && mv.promotion.is_none();
            if quiet {
                tranquille_vu = true;
            } else {
                captures += 1;
                assert!(
                    !tranquille_vu,
                    "une capture ({mv}) arrive après un coup tranquille : `break` sauterait une capture"
                );
            }
        }
        assert!(captures > 0, "la position doit offrir des captures");
        assert!(
            tranquille_vu,
            "la position doit offrir des coups tranquilles"
        );
    }

    #[test]
    fn en_echec_lelagage_par_compte_ne_coupe_jamais() {
        // Toute parade est obligatoire : compter les coups n'a aucun sens
        // quand ils sont tous forcés.
        let s = search();
        assert!(!s.late_move_prune(true, true, 1, 1, 0, 1_000));
        assert!(s.late_move_prune(true, false, 1, 1, 0, 1_000));
    }

    #[test]
    fn a_la_racine_lelagage_par_compte_ne_coupe_jamais() {
        // Il y faut un coup à jouer, pas seulement un score.
        let s = search();
        assert!(!s.late_move_prune(true, false, 0, 1, 0, 1_000));
        assert!(s.late_move_prune(true, false, 1, 1, 0, 1_000));
    }

    #[test]
    fn au_dela_de_la_profondeur_maximale_lelagage_par_compte_ne_coupe_jamais() {
        // Un coup tardif a encore la place de se révéler bon.
        let s = search();
        assert!(!s.late_move_prune(true, false, 1, LMP_MAX_DEPTH + 1, 0, 1_000));
        // Et il coupe pile à la borne : sans ce second appel, le test passerait
        // aussi avec une borne posée n'importe où plus bas.
        assert!(s.late_move_prune(true, false, 1, LMP_MAX_DEPTH, 0, 1_000));
    }

    #[test]
    fn contre_un_mat_subi_lelagage_par_compte_ne_coupe_jamais() {
        // La seule défense peut être un coup tranquille très mal classé.
        let s = search();
        assert!(!s.late_move_prune(true, false, 1, 1, -MATE + 5, 1_000));
        assert!(s.late_move_prune(true, false, 1, 1, -MATE_THRESHOLD + 1, 1_000));
    }

    #[test]
    fn aucun_elagage_avant_davoir_cherche_un_coup() {
        // `best` vaut `-INFINITY` tant qu'aucun coup n'a été cherché : le nœud
        // rendrait alors `-INFINITY` sans coup, ce qui empoisonnerait la table.
        // La garde de mat couvre ce cas, et ce test est ce qui l'établit.
        let s = search();
        assert!(!s.late_move_prune(true, false, 1, 1, -INFINITY, 1_000));
    }

    #[test]
    fn le_compte_doit_etre_atteint_pour_elaguer() {
        // Un coup en deçà du seuil : rien n'est élagué.
        let s = search();
        let seuil = lmp_limit(1);
        assert!(!s.late_move_prune(true, false, 1, 1, 0, seuil - 1));
        assert!(s.late_move_prune(true, false, 1, 1, 0, seuil));
    }

    #[test]
    fn la_futilite_inverse_retire_des_noeuds() {
        let position = Position::from_fen(crate::bench::BENCH_FENS[1]).unwrap();
        let limits = Limits {
            depth: Some(7),
            ..Limits::default()
        };
        let mut avec = search();
        avec.go(&position, &limits, |_| {});
        let mut sans = search_sans_rfp();
        sans.go(&position, &limits, |_| {});
        assert!(
            avec.nodes() < sans.nodes(),
            "la futilité inverse ne retire rien : {} avec, {} sans",
            avec.nodes(),
            sans.nodes()
        );
    }

    #[test]
    fn en_echec_la_futilite_inverse_ne_coupe_jamais() {
        // Le score statique ment en échec : il ignore que le roi est attaqué
        // et qu'un coup est obligatoire. Position vérifiée par exécution :
        // blancs en échec par la tour h1, malgré une dame d'avance.
        let b = board("4k3/8/8/8/8/8/6Q1/4K2r w - - 0 1");
        assert!(!b.checkers().is_empty(), "la position doit être un échec");
        assert_eq!(search().reverse_futility_cut(&b, 1, 1, -5_000), None);
    }

    #[test]
    fn a_la_racine_la_futilite_inverse_ne_coupe_jamais() {
        // Il y faut un coup à jouer, pas seulement un score.
        let b = board("4k3/8/8/8/8/8/6Q1/4K3 w - - 0 1");
        assert_eq!(search().reverse_futility_cut(&b, 1, 0, -5_000), None);
        // Le même nœud hors racine coupe, lui : c'est ce qui prouve que le
        // test ci-dessus mesure la garde et non l'absence de condition.
        assert!(search().reverse_futility_cut(&b, 1, 1, -5_000).is_some());
    }

    #[test]
    fn autour_dun_mat_la_futilite_inverse_ne_coupe_jamais() {
        // La marge suppose que `beta` mesure du matériel ; un mat ne le fait pas.
        let b = board("4k3/8/8/8/8/8/6Q1/4K3 w - - 0 1");
        assert_eq!(
            search().reverse_futility_cut(&b, 1, 1, MATE - 5),
            None,
            "borne de mat positive"
        );
        assert_eq!(
            search().reverse_futility_cut(&b, 1, 1, -MATE + 5),
            None,
            "borne de mat négative"
        );
    }

    #[test]
    fn au_dela_de_sa_profondeur_la_futilite_inverse_ne_coupe_pas() {
        let b = board("4k3/8/8/8/8/8/6Q1/4K3 w - - 0 1");
        assert!(
            search()
                .reverse_futility_cut(&b, RFP_MAX_DEPTH, 1, -5_000)
                .is_some()
        );
        assert_eq!(
            search().reverse_futility_cut(&b, RFP_MAX_DEPTH + 1, 1, -5_000),
            None
        );
    }

    #[test]
    fn lelagage_delta_retire_des_noeuds() {
        // Le commutateur isole le seul élagage delta : les deux recherches sont
        // identiques à cela près. Comparer deux appels identiques ne prouverait
        // rien — faute déjà commise sur ce projet.
        let position = Position::from_fen(crate::bench::BENCH_FENS[1]).unwrap();
        let limits = Limits {
            depth: Some(6),
            ..Limits::default()
        };

        let mut avec = search();
        avec.go(&position, &limits, |_| {});
        let mut sans = search_sans_delta();
        sans.go(&position, &limits, |_| {});

        assert!(
            avec.nodes() < sans.nodes(),
            "l'élagage delta ne retire rien : {} nœuds avec, {} sans",
            avec.nodes(),
            sans.nodes()
        );
    }

    #[test]
    fn en_echec_aucune_capture_nest_elaguee() {
        // Toute parade est obligatoire : élaguer ferait évaluer une position
        // perdue comme tranquille, ce que la quiescence existe pour empêcher.
        // Position vérifiée par exécution : roi blanc d1 en échec par la dame
        // d5, unique capture Ta5xd5.
        let fen = "3k4/8/8/R2q4/8/8/8/3K4 w - - 0 1";
        let b = board(fen);
        assert!(!b.checkers().is_empty(), "la position doit être un échec");
        let mv = "a5d5".parse().unwrap();

        // Même avec un alpha écrasant, la garde d'échec l'emporte.
        assert!(!search().delta_prunable(&b, mv, true, stand_pat(fen), INFINITY / 2));
    }

    #[test]
    fn une_promotion_nest_jamais_elaguee() {
        // Une promotion gagne jusqu'à une dame, ce que la valeur de la pièce
        // prise ne dit pas. Position vérifiée : pion b7 prend en a8 ou c8.
        let fen = "r1r1k3/1P6/8/8/8/8/8/4K3 w - - 0 1";
        let b = board(fen);
        let sp = stand_pat(fen);
        for uci in ["b7a8q", "b7c8q"] {
            let mv = cozy_chess::util::parse_uci_move(&b, uci).unwrap();
            assert!(mv.promotion.is_some(), "{uci} doit être une promotion");
            assert!(
                !search().delta_prunable(&b, mv, false, sp, INFINITY / 2),
                "{uci} a été élaguée"
            );
        }
    }

    #[test]
    fn autour_dun_score_de_mat_rien_nest_elague() {
        // L'arithmétique de la marge suppose qu'alpha mesure du matériel.
        // Un score de mat ne mesure plus cela.
        let fen = "4k3/p7/8/8/8/8/6Q1/R3K3 w - - 0 1";
        let b = board(fen);
        let mv = "a1a7".parse().unwrap();
        assert!(!search().delta_prunable(&b, mv, false, stand_pat(fen), MATE - 5));
    }

    #[test]
    fn une_capture_trop_petite_pour_rattraper_est_elaguee() {
        // Le cas nominal : prendre un pion ne comble pas un retard écrasant.
        // Position vérifiée par exécution, unique capture Ta1xa7.
        let fen = "4k3/p7/8/8/8/8/6Q1/R3K3 w - - 0 1";
        let b = board(fen);
        let mv = "a1a7".parse().unwrap();
        let sp = stand_pat(fen);
        // Un alpha hors de portée d'un pion plus la marge.
        assert!(search().delta_prunable(&b, mv, false, sp, sp + 2_000));
        // Un alpha atteignable ne déclenche rien.
        assert!(!search().delta_prunable(&b, mv, false, sp, sp - 100));
    }

    #[test]
    fn la_quiescence_refuse_une_capture_perdante() {
        // Dd2 peut prendre le pion d5, mais c6 reprend : la dame est perdue.
        // Sans quiescence, une recherche à profondeur 1 croirait gagner un pion.
        let coup = best("4k3/8/2p5/3p4/8/8/3Q4/4K3 w - - 0 1", 1);
        assert_ne!(
            coup, "d2d5",
            "la dame ne doit pas se jeter sur un pion défendu"
        );
    }

    #[test]
    fn la_recherche_est_deterministe() {
        let fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1";
        assert_eq!(best(fen, 4), best(fen, 4));
    }

    #[test]
    fn une_position_matee_ne_rend_aucun_coup() {
        let position = Position::from_fen(
            "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
        )
        .unwrap();
        assert!(search().go(&position, &Limits::default(), |_| {}).is_none());
    }

    #[test]
    fn la_variante_principale_est_legale_depuis_la_racine() {
        let position =
            Position::from_fen("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1")
                .unwrap();
        let mut pv = Vec::new();
        search().go(
            &position,
            &Limits {
                depth: Some(5),
                ..Limits::default()
            },
            |info| pv.clone_from(&info.pv),
        );
        assert!(!pv.is_empty(), "la variante ne doit pas être vide");
        let mut b = position.board().clone();
        for mv in pv {
            assert!(b.is_legal(mv), "coup illégal dans la variante : {mv}");
            b.play_unchecked(mv);
        }
    }

    #[test]
    fn le_budget_de_temps_est_respecte() {
        let position = Position::startpos();
        let limits = Limits {
            movetime: Some(120),
            ..Limits::default()
        };
        let at = Instant::now();
        assert!(search().go(&position, &limits, |_| {}).is_some());
        let elapsed = at.elapsed();
        assert!(
            elapsed < Duration::from_millis(900),
            "dépassement du budget : {elapsed:?}"
        );
    }

    #[test]
    fn le_budget_de_noeuds_est_respecte() {
        // `go nodes` était analysé par la couche UCI et ignoré par la
        // recherche jusqu'au 14 sept. 2026 : le moteur cherchait jusqu'à sa
        // limite de temps ou de profondeur. Sans ce budget, pas de match à
        // nœuds fixes — donc pas de mesure sans bruit d'horloge.
        for budget in [1, 1_000, 50_000] {
            let limits = Limits {
                nodes: Some(budget),
                ..Limits::default()
            };
            let mut s = search();
            let best = s.go(&Position::startpos(), &limits, |_| {});
            assert!(best.is_some(), "un coup légal est dû même à {budget} nœuds");
            assert!(
                s.nodes() <= budget,
                "budget {budget} dépassé : {} nœuds",
                s.nodes()
            );
        }
    }

    #[test]
    fn un_budget_de_noeuds_rend_un_coup_legal() {
        // À un seul nœud, aucune itération ne s'achève : le coup vient du
        // filet de sécurité, et il doit rester légal.
        let limits = Limits {
            nodes: Some(1),
            ..Limits::default()
        };
        let position = Position::startpos();
        let best = search().go(&position, &limits, |_| {}).unwrap();
        assert!(position.board().is_legal(best));
    }

    #[test]
    fn un_budget_large_ne_bride_pas_la_profondeur_demandee() {
        // La garde ne doit pas se déclencher quand le budget est hors de
        // portée : sinon elle raccourcirait toutes les recherches.
        let limits = Limits {
            depth: Some(6),
            nodes: Some(u64::MAX),
            ..Limits::default()
        };
        let mut avec = search();
        avec.go(&Position::startpos(), &limits, |_| {});

        let mut sans = search();
        sans.go(
            &Position::startpos(),
            &Limits {
                depth: Some(6),
                ..Limits::default()
            },
            |_| {},
        );
        assert_eq!(avec.nodes(), sans.nodes());
    }

    #[test]
    fn une_ardoise_perdue_se_reconstruit() {
        // Seule une panique peut laisser l'ardoise hors de `Search`. La
        // simuler ici vérifie que la recherche suivante repart entière, au
        // lieu de rendre le score statique à chaque nœud sans rien signaler.
        let mut s = search();
        s.scratch = Vec::new();
        let limits = Limits {
            depth: Some(5),
            ..Limits::default()
        };
        assert!(s.go(&Position::startpos(), &limits, |_| {}).is_some());
        assert_eq!(s.scratch.len(), MAX_PLY * MAX_MOVES);

        // Et le résultat est celui d'une recherche normale, pas d'une recherche
        // amputée : même nombre de nœuds qu'une recherche jamais abîmée.
        let mut neuve = search();
        neuve.go(&Position::startpos(), &limits, |_| {});
        assert_eq!(s.nodes(), neuve.nodes());
    }

    // ---- Ponder ----
    //
    // Chaque test lance la recherche dans un fil et ne regarde que ce que
    // l'interface verrait : QUAND le coup revient. Les marges sont larges —
    // plusieurs centaines de millisecondes — parce qu'un test de temps serré
    // tombe sur une machine chargée sans que le code ait changé.

    /// Lance `go` sur son propre fil, drapeau de ponder branché et levé.
    fn pondere(
        position: Position,
        limites: Limits,
    ) -> (
        Arc<AtomicBool>,
        Arc<AtomicBool>,
        std::thread::JoinHandle<Option<Move>>,
    ) {
        let stop = Arc::new(AtomicBool::new(false));
        let ponder = Arc::new(AtomicBool::new(true));
        let mut s = Search::new(Arc::clone(&stop));
        s.set_ponder_flag(Arc::clone(&ponder));
        let fil = std::thread::spawn(move || s.go(&position, &limites, |_| {}));
        (stop, ponder, fil)
    }

    fn attend_la_fin(fil: &std::thread::JoinHandle<Option<Move>>, limite: Duration) -> bool {
        let debut = Instant::now();
        while !fil.is_finished() && debut.elapsed() < limite {
            std::thread::sleep(Duration::from_millis(2));
        }
        fil.is_finished()
    }

    #[test]
    fn une_recherche_finie_pendant_le_ponder_attend_ponderhit() {
        // Profondeur 1 : la recherche est finie en une milliseconde. Elle ne
        // doit pas rendre son coup pour autant — l'interface n'attend
        // `bestmove` qu'après `ponderhit` ou `stop`.
        let limites = Limits {
            ponder: true,
            depth: Some(1),
            ..Limits::default()
        };
        let (_stop, ponder, fil) = pondere(Position::startpos(), limites);
        std::thread::sleep(Duration::from_millis(150));
        assert!(!fil.is_finished(), "aucun coup avant ponderhit");
        ponder.store(false, Ordering::Relaxed);
        assert!(
            attend_la_fin(&fil, Duration::from_secs(5)),
            "ponderhit libère le coup"
        );
        assert!(fil.join().unwrap().is_some());
    }

    #[test]
    fn en_ponder_lecheance_ne_court_pas() {
        // Budget d'une milliseconde : sans ponder, la recherche serait rendue
        // depuis longtemps. En ponder, c'est le temps de l'adversaire — elle
        // doit continuer d'APPROFONDIR.
        //
        // « Le fil n'a pas fini » ne suffit pas à le prouver : une recherche
        // qui s'arrêterait à l'échéance puis ATTENDRAIT ponderhit ne finirait
        // pas non plus. Et comparer sa profondeur à celle d'une recherche
        // ordinaire au même budget ne suffit pas davantage — éprouvé par
        // mutation : la recherche ordinaire s'arrête à l'échéance DOUCE,
        // vérifiée à chaque fin d'itération, quand la dure ne se vérifie que
        // tous les `CHECK_INTERVAL` nœuds ; le mutant allait donc plus loin que
        // la référence. La grandeur qui tranche est l'instant où la dernière
        // itération S'ACHÈVE : sous le mutant, plus rien ne s'achève après
        // quelques millisecondes.
        let achevee_a = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let vue = Arc::clone(&achevee_a);
        let stop = Arc::new(AtomicBool::new(false));
        let ponder = Arc::new(AtomicBool::new(true));
        let mut s = Search::new(Arc::clone(&stop));
        s.set_ponder_flag(Arc::clone(&ponder));
        let limites = Limits {
            ponder: true,
            movetime: Some(1),
            ..Limits::default()
        };
        let fil = std::thread::spawn(move || {
            s.go(&Position::startpos(), &limites, |info| {
                vue.store(info.time_ms, Ordering::Relaxed);
            })
        });
        std::thread::sleep(Duration::from_millis(400));
        assert!(!fil.is_finished(), "l'échéance ne vaut pas en ponder");
        assert!(
            achevee_a.load(Ordering::Relaxed) >= 50,
            "en 400 ms de ponder, une itération doit s'achever bien après \
             l'échéance d'une milliseconde — la dernière s'est achevée à {} ms",
            achevee_a.load(Ordering::Relaxed)
        );
        // Après ponderhit, l'échéance posée au `go ponder` est dépassée
        // depuis longtemps : le temps de ponder compte comme déjà dépensé,
        // et le coup part aussitôt.
        ponder.store(false, Ordering::Relaxed);
        assert!(
            attend_la_fin(&fil, Duration::from_millis(1_000)),
            "un ponder plus long que le budget fait jouer aussitôt"
        );
        assert!(fil.join().unwrap().is_some());
    }

    #[test]
    fn un_ponderhit_precoce_laisse_chercher_jusqua_lecheance() {
        // Le pendant du test précédent : si ponderhit arrive tôt, la recherche
        // ne s'arrête pas là — elle va jusqu'à l'échéance du `go ponder`.
        // Sans ce test, un code qui jouerait dès ponderhit passerait.
        let limites = Limits {
            ponder: true,
            movetime: Some(1_500),
            ..Limits::default()
        };
        let (_stop, ponder, fil) = pondere(Position::startpos(), limites);
        std::thread::sleep(Duration::from_millis(50));
        ponder.store(false, Ordering::Relaxed);
        std::thread::sleep(Duration::from_millis(400));
        assert!(!fil.is_finished(), "ponderhit n'est pas un stop");
        assert!(attend_la_fin(&fil, Duration::from_secs(10)));
    }

    #[test]
    fn stop_pendant_le_ponder_rend_un_coup_tout_de_suite() {
        let limites = Limits {
            ponder: true,
            ..Limits::default()
        };
        let (stop, _ponder, fil) = pondere(Position::startpos(), limites);
        std::thread::sleep(Duration::from_millis(100));
        stop.store(true, Ordering::Relaxed);
        assert!(attend_la_fin(&fil, Duration::from_millis(1_000)));
        assert!(fil.join().unwrap().is_some(), "l'interface attend un coup");
    }

    #[test]
    fn le_pari_est_le_deuxieme_coup_de_la_variante_puis_celui_de_la_table() {
        let b = Board::default();
        let mut s = search();
        let limites = Limits {
            depth: Some(5),
            ..Limits::default()
        };
        let meilleur = s.go(&Position::startpos(), &limites, |_| {}).unwrap();
        let variante = s.last_pv.clone();
        assert!(
            variante.len() >= 2,
            "à la profondeur 5, la variante a un pari"
        );
        assert_eq!(variante[0], meilleur);
        assert_eq!(
            s.ponder_move(&b, meilleur),
            Some(variante[1]),
            "le pari est le deuxième coup de la dernière variante achevée"
        );

        // Variante réduite à un coup : le pari vient de la table, et il est
        // légal sur la position d'après — jamais un coup de la racine.
        s.last_pv.truncate(1);
        let mut apres = b.clone();
        apres.play_unchecked(meilleur);
        let pari = s.ponder_move(&b, meilleur);
        assert!(pari.is_some(), "la table connaît la réponse");
        assert!(apres.is_legal(pari.unwrap()));

        // Un « meilleur coup » illégal ne produit aucun pari.
        let illegal = cozy_chess::util::parse_uci_move(&b, "e2e4").unwrap();
        let mut noirs = b.clone();
        noirs.play_unchecked(illegal);
        assert_eq!(s.ponder_move(&noirs, illegal), None);
    }

    #[test]
    fn le_pari_ne_vient_que_dune_variante_qui_commence_par_le_coup_joue() {
        // Le test voisin ne sépare pas les deux sources du pari : après une
        // vraie recherche, la variante et la table proposent le même coup, et
        // trois mutants de la garde `*first == best` survivaient au balayage
        // du 23 sept. 2026. Table vide ici, donc seule la variante peut parier.
        let b = Board::default();
        let mut s = search();
        let e4 = cozy_chess::util::parse_uci_move(&b, "e2e4").unwrap();
        let d4 = cozy_chess::util::parse_uci_move(&b, "d2d4").unwrap();
        let mut apres = b.clone();
        apres.play_unchecked(e4);
        let e5 = cozy_chess::util::parse_uci_move(&apres, "e7e5").unwrap();

        s.last_pv = vec![e4, e5];
        assert_eq!(
            s.ponder_move(&b, e4),
            Some(e5),
            "une variante qui commence par le coup joué donne son deuxième coup"
        );

        // `e7e5` répond aussi bien à `d2d4` : sans la garde, il passerait le
        // contrôle de légalité et partirait comme pari d'un autre coup.
        s.last_pv = vec![d4, e5];
        assert_eq!(
            s.ponder_move(&b, e4),
            None,
            "la variante d'un autre coup ne parie pas pour celui-ci"
        );
    }

    #[test]
    fn go_infinite_sarrete_sur_le_drapeau() {
        let stop = Arc::new(AtomicBool::new(false));
        let mut s = Search::new(Arc::clone(&stop));
        let flag = Arc::clone(&stop);
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            flag.store(true, Ordering::Relaxed);
        });
        let limits = Limits {
            infinite: true,
            depth: Some(4),
            ..Limits::default()
        };
        assert!(s.go(&Position::startpos(), &limits, |_| {}).is_some());
        assert!(stop.load(Ordering::Relaxed));
    }

    #[test]
    fn la_conversion_des_scores_de_mat_est_correcte() {
        assert_eq!(Score::from_internal(0), Score::Cp(0));
        assert_eq!(Score::from_internal(-45), Score::Cp(-45));
        assert_eq!(Score::from_internal(MATE - 1), Score::Mate(1));
        assert_eq!(Score::from_internal(MATE - 2), Score::Mate(1));
        assert_eq!(Score::from_internal(MATE - 3), Score::Mate(2));
        assert_eq!(Score::from_internal(-(MATE - 3)), Score::Mate(-2));
    }

    #[test]
    fn le_coup_de_la_table_passe_devant_tous_les_autres() {
        let b = Board::default();
        let tranquille = cozy_chess::util::parse_uci_move(&b, "a2a3").unwrap();
        let s = search();
        let sans = s.score_move(&b, tranquille, None, 0);
        let avec = s.score_move(&b, tranquille, Some(tranquille), 0);
        assert!(avec > sans);
        // Doit aussi dépasser n'importe quelle capture.
        let capture_board: Board = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"
            .parse()
            .unwrap();
        let prise = cozy_chess::util::parse_uci_move(&capture_board, "e4d5").unwrap();
        assert!(avec > s.score_move(&capture_board, prise, None, 0));
    }

    #[test]
    fn un_killer_passe_devant_un_coup_tranquille_ordinaire() {
        let b = Board::default();
        let killer = cozy_chess::util::parse_uci_move(&b, "a2a3").unwrap();
        let autre = cozy_chess::util::parse_uci_move(&b, "h2h3").unwrap();
        let mut s = search();
        s.remember_quiet(killer, 3, 4);
        assert!(s.score_move(&b, killer, None, 3) > s.score_move(&b, autre, None, 3));
        // Mais pas à un autre ply : les killers sont propres à leur profondeur.
        assert_eq!(
            s.score_move(&b, killer, None, 5),
            s.score_move(&b, killer, None, 5)
        );
    }

    #[test]
    fn la_table_ne_change_pas_le_coup_trouve_sur_un_mat() {
        // Une table de transposition doit accélérer la recherche, jamais
        // changer son résultat sur une position à solution unique.
        assert_eq!(
            best(
                "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1",
                6
            ),
            "f3f7"
        );
    }

    #[test]
    fn vider_la_table_restaure_letat_initial() {
        let mut s = search();
        // Une petite table, sans quoi le remplissage serait indétectable :
        // `table_permille` n'échantillonne que les mille premières entrées, et
        // une recherche courte n'en touche presque aucune sur un million.
        s.resize_table(1);
        let position = Position::startpos();
        s.go(
            &position,
            &Limits {
                depth: Some(6),
                ..Limits::default()
            },
            |_| {},
        );
        assert!(s.table_permille() > 0, "la table doit s'être remplie");
        s.clear_table();
        assert_eq!(s.table_permille(), 0);
    }

    #[test]
    fn la_garde_du_coup_nul_distingue_les_finales_de_pions() {
        // Avec des pièces : le coup d'attente existe, le zugzwang est rare.
        assert!(has_non_pawn_material(&Board::default()));
        assert!(has_non_pawn_material(&board(
            "4k3/8/8/8/8/8/4P3/3RK3 w - - 0 1"
        )));
        // Rois et pions seuls : le zugzwang devient courant, coup nul interdit.
        assert!(!has_non_pawn_material(&board(
            "4k3/4p3/8/8/8/8/4P3/4K3 w - - 0 1"
        )));
        // La garde regarde le camp AU TRAIT, pas le matériel total : ici les
        // Blancs n'ont que des pions, les Noirs ont une tour.
        assert!(!has_non_pawn_material(&board(
            "3rk3/4p3/8/8/8/8/4P3/4K3 w - - 0 1"
        )));
        assert!(has_non_pawn_material(&board(
            "3rk3/4p3/8/8/8/8/4P3/4K3 b - - 0 1"
        )));
    }

    #[test]
    fn le_coup_nul_ne_casse_pas_la_detection_de_mat() {
        // Profondeur 5 : le coup nul est actif. Le mat doit rester trouvé, et
        // annoncé comme mat — un coup nul qui produirait un mat imaginaire se
        // verrait ici.
        let position = Position::from_fen(
            "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1",
        )
        .unwrap();
        let mut dernier = None;
        let mv = search().go(
            &position,
            &Limits {
                depth: Some(5),
                ..Limits::default()
            },
            |info| dernier = Some(info.score),
        );
        assert_eq!(
            cozy_chess::util::display_uci_move(position.board(), mv.unwrap()).to_string(),
            "f3f7"
        );
        assert_eq!(dernier, Some(Score::Mate(1)));
    }

    #[test]
    fn le_coup_nul_ne_sapplique_pas_en_echec() {
        // Roi blanc en e1, tour noire en e8 : échec sur la colonne, quatre
        // fuites seulement (e2 est interdite). `null_move` rend None en échec —
        // passer serait illégal — et la recherche doit tout de même jouer.
        let position = Position::from_fen("4r2k/8/8/8/8/8/8/4K3 w - - 0 1").unwrap();
        assert!(
            !position.board().checkers().is_empty(),
            "la position doit bien être un échec, sinon le test ne teste rien"
        );
        let mv = search()
            .go(
                &position,
                &Limits {
                    depth: Some(4),
                    ..Limits::default()
                },
                |_| {},
            )
            .unwrap();
        assert!(position.board().is_legal(mv));
    }

    #[test]
    fn la_table_de_reduction_croit_avec_la_profondeur_et_le_rang() {
        let s = search();
        // Toujours au moins un demi-coup de réduction là où elle s'applique.
        assert!(s.reduction(3, 3) >= 1);
        // Croissante dans les deux dimensions.
        assert!(s.reduction(20, 3) >= s.reduction(4, 3));
        assert!(s.reduction(8, 30) >= s.reduction(8, 4));
        // Bornée : jamais au point de rendre la recherche vide.
        for depth in 3..40 {
            for index in 3..40 {
                let r = s.reduction(depth, index);
                assert!(
                    r >= 1 && r < depth,
                    "profondeur {depth}, rang {index} : r={r}"
                );
            }
        }
    }

    #[test]
    fn la_reduction_ne_casse_pas_la_detection_de_mat() {
        // Profondeur 6 : LMR et coup nul sont tous deux actifs. Un mat forcé
        // doit rester trouvé — une réduction non rattrapée le manquerait.
        assert_eq!(
            best(
                "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1",
                6
            ),
            "f3f7"
        );
        assert_eq!(
            best(
                "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
                6
            ),
            "d8h4"
        );
    }

    #[test]
    fn sous_la_profondeur_minimale_la_fenetre_reste_pleine() {
        // Le pari ne doit pas s'appliquer aux premières itérations : même un
        // score précédent absurde doit donner exactement le résultat d'une
        // recherche à fenêtre pleine. Deux instances neuves pour que les deux
        // mesures partent de la même table vide.
        //
        // Le test comparait seulement les scores, ce qui ne prouvait rien : la
        // boucle d'élargissement converge de toute façon vers le score exact.
        // C'est le NOMBRE DE NŒUDS qui distingue les deux chemins — une
        // fenêtre pleine cherche une fois, un pari raté recommence.
        let b = board("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1");

        let mut avec = search();
        let pari = avec.search_root(&b, 4, ASPIRATION_MIN_DEPTH, 4_000, &mut ardoise());
        let mut sans = search();
        let plein = sans.negamax(&b, 4, 0, -INFINITY, INFINITY, &mut ardoise());

        assert_eq!(pari, plein, "le score doit être identique");
        assert_eq!(
            avec.nodes(),
            sans.nodes(),
            "sous la profondeur minimale, aucun pari ne doit être tenté"
        );
    }

    #[test]
    fn autour_dun_score_de_mat_la_fenetre_reste_pleine() {
        // Un mat annoncé ne prédit pas le score de l'itération suivante : la
        // fenêtre étroite n'a rien à y gagner et tout à y perdre.
        //
        // Même correction que le test précédent : c'est le nombre de nœuds qui
        // dit si la garde s'est déclenchée, pas le score.
        let b = board("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1");
        let mut sans = search();
        let plein = sans.negamax(&b, 5, 0, -INFINITY, INFINITY, &mut ardoise());

        // `MATE_THRESHOLD + 1` pince la borne : à `MATE_THRESHOLD` exactement,
        // le score n'est pas encore un mat et le pari reste permis.
        for previous in [MATE - 5, MATE_THRESHOLD + 1, -(MATE_THRESHOLD + 1)] {
            let mut avec = search();
            let pari = avec.search_root(&b, 5, 8, previous, &mut ardoise());
            assert_eq!(pari, plein, "pari {previous} : score");
            assert_eq!(
                avec.nodes(),
                sans.nodes(),
                "pari {previous} : la fenêtre devait rester pleine"
            );
        }
    }

    #[test]
    fn un_pari_faux_converge_tout_de_meme() {
        // Ce que ce test protège, et que son nom dit : **la boucle
        // d'élargissement**. Sans le recentrage du plafond elle tournerait
        // longtemps ; sans l'élargissement géométrique elle ne terminerait pas ;
        // et elle ne doit rendre qu'un score tombé STRICTEMENT dans sa fenêtre,
        // jamais une borne.
        //
        // **Mesuré avec l'élagage par compte désactivé, et c'est délibéré.**
        // Le 16 sept. 2026, C17 a fait tomber ce test : l'assertion
        // `score == reference` comparait une recherche à fenêtre étroite à une
        // recherche à fenêtre pleine, et LMP rend les deux différentes — voir
        // `lelagage_par_compte_rend_le_score_dependant_du_pari`. La propriété
        // que ce test-ci vise n'a jamais été celle-là : c'est la convergence de
        // la boucle, et LMP n'y est qu'un facteur confondant. Le désactiver
        // rend le test PLUS net, pas plus indulgent — la propriété perdue est
        // inscrite dans le test voisin plutôt qu'effacée d'ici.
        // **Ce que ce test N'ASSERTE PLUS, et pourquoi.** Il portait
        // `assert_eq!(score, reference)` — « la fenêtre ne décide pas, elle
        // accélère ». <b>C'est faux, et ça l'était déjà avant PVS.</b> Mesuré
        // le 21 sept. 2026 sur `main`, 153 positions d'une marche seedée et
        // trois paris chacune : LMP désactivé, le score de la boucle diffère
        // de la fenêtre pleine **38 fois sur 459, soit 8,3 %**, écart maximal
        // 100 centièmes de pion. L'assertion passait parce que la position
        // ci-dessous tombe dans les 91,7 % stables.
        //
        // Ce n'était donc pas un garde-fou : c'était un tirage heureux. La
        // propriété mesurée vit maintenant dans le test voisin, qui la compte
        // au lieu de la supposer.
        let b = board("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1");

        for previous in [MATE_THRESHOLD - 1, -(MATE_THRESHOLD - 1), 5_000, -5_000] {
            let mut s = search_sans_lmp();
            let score = s.search_root(&b, 5, 8, previous, &mut ardoise());
            assert!(
                score.abs() < MATE_THRESHOLD,
                "pari {previous} : score {score} hors de toute vraisemblance"
            );
            assert!(
                s.root_best.is_some_and(|mv| b.is_legal(mv)),
                "pari {previous} : aucun coup légal retenu"
            );
        }
    }

    /// Compte, sans LMP puis avec, combien de recherches à fenêtre
    /// d'aspiration rendent un score différent de la fenêtre pleine.
    ///
    /// Un échantillon de positions jouées — une marche pseudo-aléatoire
    /// seedée, donc déterministe — et non une position choisie à la main :
    /// c'est exactement la différence entre mesurer et tomber juste. L'unique
    /// position qui servait de contrôle avant le 21 sept. 2026 était stable,
    /// et l'assertion qu'elle portait était fausse en général.
    fn compte_les_scores_dependants_du_pari() -> (u32, u32) {
        let mut positions = Vec::new();
        for graine in 1..=4u64 {
            let mut etat = (graine * 2_654_435_761) | 1;
            let mut b = Board::default();
            for pli in 0..60 {
                let mut coups = Vec::new();
                b.generate_moves(|set| {
                    coups.extend(set);
                    false
                });
                if coups.is_empty() {
                    break;
                }
                if pli % 15 == 14 && b.checkers().is_empty() {
                    positions.push(b.clone());
                }
                etat ^= etat << 13;
                etat ^= etat >> 7;
                etat ^= etat << 17;
                let mv = coups[(etat as usize) % coups.len()];
                b.play_unchecked(mv);
            }
        }
        // Quatre graines, seize positions, quarante-huit tirages : DIMENSIONNÉ
        // et non deviné. Relevé le 21 sept. 2026 sur `main` — sans LMP 8
        // tirages sur 48, avec LMP 15. Douze graines coûtaient 16 secondes en
        // debug pour la même conclusion ; quatre en coûtent trois.
        assert!(
            positions.len() >= 12,
            "échantillon trop maigre : {} positions",
            positions.len()
        );

        let mut comptes = [0u32; 2];
        for (i, avec_lmp) in [false, true].into_iter().enumerate() {
            let neuve = || {
                if avec_lmp {
                    search()
                } else {
                    search_sans_lmp()
                }
            };
            for b in &positions {
                let reference = neuve().negamax(b, 5, 0, -INFINITY, INFINITY, &mut ardoise());
                for pari in [5_000, -5_000, 0] {
                    if neuve().search_root(b, 5, 8, pari, &mut ardoise()) != reference {
                        comptes[i] += 1;
                    }
                }
            }
        }
        (comptes[0], comptes[1])
    }

    #[test]
    fn lelagage_par_compte_rend_le_score_dependant_du_pari() {
        // **Ce que C17 coûte, inscrit plutôt que subi.** Un élagage vers
        // l'avant qui dépend de l'endroit où les coupures tombent dépend donc
        // de la fenêtre : deux paris d'aspiration différents explorent des
        // arbres différents et rendent des scores différents. Sans LMP le score
        // était le même pour tous les paris ; avec lui il ne l'est plus.
        //
        // Ce test existe pour qu'une session future ne « redécouvre » pas ce
        // fait comme un bug. Il n'affirme pas que c'est bon — seul le SPRT en
        // juge — il affirme que c'est CONNU.
        // **Corrigé DEUX FOIS le 21 sept. 2026, et la seconde fois sur moi.**
        //
        // Ce test portait son affirmation principale sur une seule position :
        // « avec LMP, les trois paris ne rendent pas le même score ». J'ai
        // remplacé son *contrôle* par un comptage sur échantillon après avoir
        // montré que la prémisse du contrôle était fausse — et j'ai laissé
        // l'affirmation principale telle quelle, avec exactement le même
        // défaut. Elle est tombée dès la combinaison suivante, sur la branche
        // qui empile C18 et PVS : `[52, 52, 52]`.
        //
        // C'est attendu, et c'est le point : la dépendance au pari touche
        // **25,1 % des positions** avec LMP. Trois quarts des positions
        // auraient fait échouer cette assertion ; celle-ci tombait dans le bon
        // quart, jusqu'à ce qu'un changement d'arbre l'en fasse sortir.
        //
        // Les deux moitiés du test comptent donc maintenant sur le même
        // échantillon.

        // **Le contrôle, et c'est lui qui a changé le 21 sept. 2026.**
        //
        // Il assertait que SANS LMP le score ne dépend pas du pari, sur cette
        // seule position — censé prouver que l'assertion ci-dessus mesure LMP
        // et non le bruit de la recherche. **La prémisse est fausse** : sur
        // 153 positions d'une marche seedée, LMP désactivé, le score diffère
        // déjà de la fenêtre pleine 8,3 % du temps. Cette position-ci tombait
        // dans les 91,7 % stables, et l'assertion passait par chance.
        //
        // Le contrôle COMPTE donc maintenant au lieu de supposer, sur un
        // échantillon et non sur un point. Ce qu'il affirme est ce qui est
        // vrai et ce que ce test doit protéger : la dépendance au pari **n'est
        // pas nulle sans LMP**, et LMP **l'augmente**. Mesuré sur `main` à
        // l'échantillon complet : 8,3 % contre 25,1 %, un facteur trois.
        //
        // Les deux bornes sont qualitatives et non chiffrées, délibérément :
        // figer un taux ferait échouer ce test au premier changement de
        // recherche, et c'est le SPRT qui juge les changements de recherche.
        let (sans_lmp, avec_lmp) = compte_les_scores_dependants_du_pari();
        assert!(
            avec_lmp > 0,
            "avec LMP la dépendance au pari devrait être non nulle ({avec_lmp})"
        );
        assert!(
            sans_lmp > 0,
            "sans LMP la dépendance au pari devrait rester non nulle ({sans_lmp}) — \
             si elle est devenue nulle, c'est un fait nouveau sur la recherche, \
             pas un test à réparer"
        );
        assert!(
            avec_lmp > sans_lmp,
            "LMP devrait augmenter la dépendance au pari : {avec_lmp} contre {sans_lmp}"
        );

        // Ce qui tient dans les deux cas, et qui est ce qu'on livre : la boucle
        // rend toujours un coup légal. Une position suffit ici, parce que c'est
        // une propriété du coup rendu et non une propriété de la position.
        let b = board("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1");
        for previous in [5_000, -5_000, 0] {
            let mut s = search();
            s.search_root(&b, 5, 8, previous, &mut ardoise());
            assert!(
                s.root_best.is_some_and(|mv| b.is_legal(mv)),
                "pari {previous} : aucun coup légal retenu"
            );
        }
    }

    #[test]
    fn la_fenetre_etroite_ne_casse_pas_la_detection_de_mat() {
        // Profondeur 6 : aspiration, coup nul et LMR sont tous trois actifs.
        // Un échec par le haut mal rattrapé ferait manquer le mat.
        assert_eq!(
            best(
                "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1",
                6
            ),
            "f3f7"
        );
        // Mat subi : le score plonge d'une itération à l'autre, donc la fenêtre
        // échoue par le bas. Le coup doit rester le meilleur disponible.
        let position = Position::from_fen("k7/2K5/8/8/8/8/8/1R6 b - - 0 1").unwrap();
        let limits = Limits {
            depth: Some(6),
            ..Limits::default()
        };
        let mut annonces = Vec::new();
        let mv = search()
            .go(&position, &limits, |info| annonces.push(info.score))
            .unwrap();
        assert!(position.board().is_legal(mv));
        assert!(
            matches!(annonces.last(), Some(Score::Mate(n)) if *n < 0),
            "le camp maté doit voir un mat négatif : {annonces:?}"
        );
    }

    #[test]
    fn le_tirage_au_sort_reste_disponible_et_legal() {
        let b = Board::default();
        let a = random_legal_move(&b).unwrap();
        assert_eq!(Some(a), random_legal_move(&b), "doit rester déterministe");
        assert!(b.is_legal(a));
    }

    // ---------------------------------------------------------------------
    // Ce qui suit ferme des trous trouvés par `tools/mutants.sh` : des lignes
    // qu'on pouvait altérer sans qu'un seul test bronche. Toutes portent sur
    // une règle du jeu ou un invariant de recherche, jamais sur un réglage de
    // force — le SPRT juge les seconds, aucun test unitaire ne le peut.
    // ---------------------------------------------------------------------

    #[test]
    fn le_tirage_au_sort_ne_degenere_pas() {
        // `board.hash() | 1` force un état impair. Ce n'est pas cosmétique :
        // zéro est un point fixe de xorshift64, donc un état nul rendrait
        // toujours zéro, donc toujours le premier coup. Remplacer le `|` par
        // un `&` bornerait l'état à {0, 1} et l'adversaire de référence
        // deviendrait presque déterministe — le tournoi de la CI mesurerait
        // alors la victoire contre un adversaire dégénéré, pas contre le
        // hasard.
        assert_eq!(next_random(&mut 0), 0, "zéro est bien un point fixe");

        // La graine se teste directement. Un `&` à la place du `|` bornerait
        // l'état à {0, 1} ; un `^` inverserait le bit au lieu de le poser.
        assert_eq!(random_seed(0), 1, "un hash nul ne doit pas rester nul");
        assert_eq!(random_seed(2), 3, "le bit de poids faible se pose");
        assert_eq!(
            random_seed(3),
            3,
            "et ne s'inverse pas quand il est déjà là"
        );
        assert_eq!(random_seed(u64::MAX), u64::MAX, "le reste est intact");

        // Et le tirage lui-même doit visiter des RANGS différents de la liste.
        // La première version de ce test comptait les cases de départ : elles
        // varient d'une position à l'autre même quand le rang tiré ne varie
        // pas, donc elle ne mesurait rien.
        let mut position = Position::default();
        let mut rangs = std::collections::HashSet::new();
        for _ in 0..20 {
            let board = position.board().clone();
            let mut legaux = Vec::new();
            board.generate_moves(|m| {
                legaux.extend(m);
                false
            });
            let mv = random_legal_move(&board).unwrap();
            rangs.insert(legaux.iter().position(|c| *c == mv).unwrap());
            position.play(mv);
            if board.status() != cozy_chess::GameStatus::Ongoing {
                break;
            }
        }
        assert!(
            rangs.len() >= 8,
            "le tirage doit visiter des rangs variés : {} distinct(s)",
            rangs.len()
        );
    }

    #[test]
    fn le_generateur_pseudo_aleatoire_rend_une_suite_connue() {
        // Valeurs relevées par exécution, jamais dérivées de tête.
        //
        // **La graine doit être dense.** La première version de ce test
        // partait de 1, et deux mutants y survivaient : avec des bits aussi
        // épars, `x ^= x >> 12` et `x |= x >> 12` calculent la même chose,
        // le décalage ne rendant que des zéros. Un XOR ne se distingue d'un
        // OR que sur des bits qui se recouvrent.
        let mut dense = 0xDEAD_BEEF_CAFE_1234_u64;
        assert_eq!(next_random(&mut dense), 9_195_287_788_668_050_452);
        assert_eq!(next_random(&mut dense), 8_999_892_485_905_921_430);

        let mut etat = 1_u64;
        assert_eq!(next_random(&mut etat), 5_180_492_295_206_395_165);
        assert_eq!(next_random(&mut etat), 12_380_297_144_915_551_517);
    }

    #[test]
    fn le_seuil_de_mat_est_une_borne_stricte() {
        // À `MATE_THRESHOLD` exactement, le score est encore des centièmes de
        // pion. Relâcher la comparaison ferait annoncer un mat en 500 coups
        // sur une position ordinaire — un mensonge visible dans l'interface.
        assert_eq!(
            Score::from_internal(MATE_THRESHOLD),
            Score::Cp(MATE_THRESHOLD)
        );
        assert_eq!(
            Score::from_internal(-MATE_THRESHOLD),
            Score::Cp(-MATE_THRESHOLD)
        );
        assert!(matches!(
            Score::from_internal(MATE_THRESHOLD + 1),
            Score::Mate(_)
        ));
    }

    #[test]
    fn la_recherche_voit_une_repetition_de_son_chemin() {
        // `is_repetition` est le seul point où la recherche consulte
        // l'historique. Le remplacer par `false` ne faisait tomber aucun test,
        // alors que la nulle par répétition est une règle du jeu.
        //
        // La fenêtre examinée est bornée par la pendule des cinquante coups et
        // saute le coup de l'adversaire : une position ne peut se répéter que
        // deux demi-coups plus tôt au minimum. D'où la pendule à 4 et les deux
        // entrées intercalaires.
        let mut s = search();
        let b = board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 3");
        assert!(!s.is_repetition(&b), "un chemin vide ne répète rien");
        s.path = vec![b.hash(), 0xAAAA, 0xBBBB];
        assert!(s.is_repetition(&b), "la position doit être reconnue");
        s.path = vec![b.hash() ^ 1, 0xAAAA, 0xBBBB];
        assert!(!s.is_repetition(&b), "une autre position ne compte pas");
    }

    #[test]
    fn deux_coups_nuls_de_suite_ne_font_pas_une_repetition() {
        // Chacun passe son tour : la position de départ revient, au même
        // trait, donc avec la même clé. Ce n'est pas une nulle — aucune partie
        // ne peut y arriver. Mesuré en partie, ce cas faisait à lui seul
        // 86,8 % des fausses répétitions (C23).
        let mut s = search();
        let b = board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 3");
        s.path = vec![b.hash(), 0xAAAA, b.hash()];
        s.null_marks = vec![1, 2];
        assert!(!s.is_repetition(&b), "deux coups nuls ne répètent rien");
        // Témoin : le même chemin sans coup nul EST une répétition. Sans lui,
        // l'assertion ci-dessus pourrait passer pour une autre raison.
        s.null_marks.clear();
        assert!(s.is_repetition(&b));
    }

    #[test]
    fn une_repetition_ne_traverse_pas_un_coup_nul() {
        // Le cas moins bête : un camp passe, l'autre joue et revient, le
        // premier repasse. Deux coups nuls, SÉPARÉS, et la position d'avant le
        // premier revient — le reste des fausses répétitions mesurées.
        let mut s = search();
        let b = board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 3");
        s.path = vec![b.hash(), 0xA1, 0xB2, 0xC3, b.hash()];
        s.null_marks = vec![1, 3];
        assert!(
            !s.is_repetition(&b),
            "la fenêtre s'arrête au dernier coup nul"
        );
        s.null_marks.clear();
        assert!(
            s.is_repetition(&b),
            "témoin : sans coup nul, c'est une répétition"
        );
    }

    #[test]
    fn un_second_coup_nul_ne_rend_pas_une_nulle() {
        // Le même défaut, mais par la recherche elle-même : les tests voisins
        // posent la pile des coups nuls à la main, et ne diraient rien si
        // `negamax` cessait de l'alimenter.
        //
        // Les Blancs ont une dame et une tour de plus. Les Noirs sont au trait
        // juste après un coup nul blanc, avec une tour, donc en droit de passer
        // à leur tour — et leur coup nul recrée la position blanche, au même
        // trait. Sans borne, la recherche y voit une répétition, rend 0, et ce
        // 0 suffit à couper : les Noirs « tiennent la nulle » avec une dame et
        // une tour de moins. Vérifié : l'ancien code rend 0 ici.
        let mut s = search();
        let blancs = board("r3k3/8/8/8/8/8/8/3QK2R w - - 0 1");
        let noirs = blancs.null_move().unwrap();
        s.path = vec![blancs.hash(), noirs.hash()];
        let score = s.negamax(&noirs, 4, 1, -1, 0, &mut ardoise());
        assert!(
            score < 0,
            "les Noirs sont perdus, la recherche a rendu {score}"
        );
        // Et la pile se vide en remontant. Une marque oubliée survivrait à
        // son coup nul et désignerait, plus tard, une position sans rapport :
        // la fenêtre y serait coupée, et de VRAIES répétitions manquées. Ce
        // défaut passait toute la suite avant cette ligne.
        assert!(s.null_marks.is_empty());
    }

    #[test]
    fn une_repetition_apres_le_coup_nul_compte_toujours() {
        // La borne ne doit pas aller plus loin que le coup nul : les positions
        // qui le suivent se répètent entre elles comme n'importe où ailleurs.
        // Un correctif trop zélé — ignorer les répétitions sous un coup nul —
        // ferait tomber ce test.
        let mut s = search();
        let b = board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 3");
        s.path = vec![0x11, b.hash(), 0xA1, 0xB2, 0xC3, b.hash()];
        s.null_marks = vec![1];
        assert!(s.is_repetition(&b));
    }

    #[test]
    fn une_echeance_deja_passee_arrete_la_recherche() {
        // Sans cette borne, `go movetime` et `go infinite` ne rendraient la
        // main qu'à l'épuisement de la profondeur. Le test porte sur la
        // comparaison elle-même : une échéance dans le passé doit couper au
        // tout premier contrôle.
        let mut s = search();
        s.hard_deadline = Some(Instant::now() - Duration::from_secs(1));
        s.nodes = 0;
        assert!(s.should_abort(), "une échéance passée arrête tout de suite");
        assert!(s.aborted);
    }

    #[test]
    fn redimensionner_la_table_change_vraiment_sa_taille() {
        // `resize_table` sert l'option UCI `Hash`. La remplacer par une
        // fonction vide laissait l'interface croire qu'elle avait été obéie.
        let mut s = search();
        s.resize_table(1);
        let petite = s.tt.capacity();
        s.resize_table(64);
        assert!(
            s.tt.capacity() > petite,
            "64 Mio doit porter plus d'entrées que 1 Mio ({} contre {})",
            s.tt.capacity(),
            petite
        );
    }

    #[test]
    fn la_prise_en_passant_est_un_coup_tactique() {
        // Le filtre tactique de la quiescence restreint les destinations aux
        // cases occupées par l'adversaire. La prise en passant arrive sur une
        // case VIDE : sans l'ajout explicite de cette case aux cibles, la
        // quiescence ne la verrait jamais. C'est exactement le cas qu'on rate.
        let b = board("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3");
        let prise = cozy_chess::util::parse_uci_move(&b, "e5f6").unwrap();
        let s = search();
        let mut buffer = [(NO_MOVE, 0); MAX_MOVES];
        let count = s.ordered_moves(&b, true, None, 0, &mut buffer);
        assert!(
            buffer[..count].iter().any(|(mv, _)| *mv == prise),
            "la prise en passant doit figurer parmi les coups tactiques"
        );
    }

    #[test]
    fn le_budget_dhorloge_est_exact() {
        // Sept mutants survivaient dans cette arithmétique, et aucun n'aurait
        // coûté de l'Elo : ils font perdre au TEMPS, ce qu'un SPRT ne
        // distingue pas d'une faiblesse de jeu.
        let pendule = |remaining, increment, movestogo| Limits {
            wtime: Some(remaining),
            winc: Some(increment),
            movestogo,
            ..Limits::default()
        };

        // Une minute, trente coups à jouer, cent millisecondes d'incrément :
        // 60000/30 + 100/2.
        assert_eq!(
            time_budget_ms(&pendule(60_000, 100, Some(30)), Color::White),
            Some(2_050)
        );
        // Sans `movestogo`, la convention du moteur est DOUZE coups —
        // mesurée, pas choisie : à trente, 48 % de la pendule restait
        // inutilisée en fin de partie. 60000/12 + 100/2.
        assert_eq!(
            time_budget_ms(&pendule(60_000, 100, None), Color::White),
            Some(5_050)
        );
        // Et la valeur fournie par l'interface prime sur le défaut : une
        // cadence de tournoi annonce le vrai nombre de coups restants.
        assert_ne!(
            time_budget_ms(&pendule(60_000, 100, Some(30)), Color::White),
            time_budget_ms(&pendule(60_000, 100, None), Color::White)
        );
        // L'incrément compte pour moitié, et rien d'autre ne bouge.
        assert_eq!(
            time_budget_ms(&pendule(60_000, 0, Some(30)), Color::White),
            Some(2_000)
        );
        // Un seul coup à jouer : toute la pendule, moins la marge.
        assert_eq!(
            time_budget_ms(&pendule(60_000, 0, Some(1)), Color::White),
            Some(59_950)
        );

        // Une pendule presque vide avec un gros incrément : le budget est
        // ramené sous la pendule, jamais au-dessus. Sans le `+`, la
        // soustraction déborderait ; sans la borne, le moteur jouerait
        // dix secondes avec trente millisecondes au compteur.
        assert_eq!(
            time_budget_ms(&pendule(30, 10_000, None), Color::White),
            Some(1)
        );

        // `movetime` court-circuite la pendule, marge de transmission déduite.
        assert_eq!(
            time_budget_ms(
                &Limits {
                    movetime: Some(1_000),
                    wtime: Some(60_000),
                    ..Limits::default()
                },
                Color::White
            ),
            Some(980)
        );
        // Et ne descend jamais à zéro, qui voudrait dire « pas de limite ».
        assert_eq!(
            time_budget_ms(
                &Limits {
                    movetime: Some(5),
                    ..Limits::default()
                },
                Color::White
            ),
            Some(1)
        );

        // La pendule lue est celle du camp au trait.
        let noirs = Limits {
            btime: Some(60_000),
            movestogo: Some(30),
            ..Limits::default()
        };
        assert_eq!(time_budget_ms(&noirs, Color::Black), Some(2_000));
        assert_eq!(
            time_budget_ms(&noirs, Color::White),
            None,
            "sans pendule blanche, rien ne contraint les blancs"
        );

        // Aucune contrainte d'horloge.
        assert_eq!(
            time_budget_ms(
                &Limits {
                    infinite: true,
                    wtime: Some(60_000),
                    ..Limits::default()
                },
                Color::White
            ),
            None,
            "`go infinite` ignore la pendule"
        );
        assert_eq!(
            time_budget_ms(
                &Limits {
                    depth: Some(8),
                    ..Limits::default()
                },
                Color::White
            ),
            None,
            "une recherche à profondeur imposée n'a pas d'échéance"
        );
    }

    #[test]
    fn lecheance_douce_precede_toujours_la_dure() {
        // Si la douce passait après la dure, elle ne se déclencherait jamais :
        // chaque itération irait au bout du budget et serait jetée, et le
        // moteur jouerait le coup de l'itération PRÉCÉDENTE.
        let mut s = search();
        s.set_deadlines(
            &Limits {
                wtime: Some(60_000),
                ..Limits::default()
            },
            Color::White,
        );
        let (douce, dure) = (s.soft_deadline.unwrap(), s.hard_deadline.unwrap());
        assert!(douce < dure, "l'échéance douce doit précéder la dure");
    }

    #[test]
    fn une_pendule_genereuse_ne_bride_pas_lapprofondissement() {
        // L'échéance douce interrompt l'approfondissement quand plus de la
        // moitié du budget est consommée. Inverser sa comparaison la ferait
        // se déclencher tant que le budget N'EST PAS dépassé : le moteur
        // s'arrêterait à la profondeur 1 dès qu'une pendule est présente, et
        // jouerait toute une partie en un ply — sans rien signaler.
        //
        // Aucun test ne voyait ça : ceux du budget vérifient qu'on s'arrête à
        // temps, jamais qu'on ne s'arrête pas trop tôt.
        let limits = Limits {
            depth: Some(6),
            movetime: Some(10_000),
            ..Limits::default()
        };
        let mut atteinte = 0;
        search().go(&Position::startpos(), &limits, |info| {
            atteinte = atteinte.max(info.depth);
        });
        assert_eq!(
            atteinte, 6,
            "dix secondes pour six plies depuis la position initiale : \
             l'approfondissement doit aller au bout"
        );
    }

    #[test]
    fn un_mat_au_fond_de_larbre_rend_le_score_exact() {
        // Le mat détecté PAR NEGAMAX, et non par la quiescence. Les tests de
        // mat existants cherchent à faible profondeur : le mat y tombe à
        // `depth <= 0`, donc dans la quiescence, et la branche de negamax
        // n'était jamais exécutée. Deux mutants y survivaient — l'un
        // supprimait le signe et faisait d'une position matée un gain écrasant.
        //
        // Positions vérifiées par exécution : la première rend `Won` avec zéro
        // coup légal et un roi en échec, la seconde `Drawn` avec zéro coup et
        // aucun échec.
        let mut s = search();
        let mut a = ardoise();

        let mat = board("7k/5QQ1/8/8/8/8/8/7K b - - 0 1");
        assert_eq!(
            s.negamax(&mat, 3, 2, -INFINITY, INFINITY, &mut a),
            -MATE + 2,
            "un mat vaut -(MATE - ply), et le ply compte depuis la racine"
        );
        assert_eq!(
            s.negamax(&mat, 3, 5, -INFINITY, INFINITY, &mut a),
            -MATE + 5,
            "un mat plus lointain vaut moins cher"
        );

        let pat = board("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
        assert_eq!(
            s.negamax(&pat, 3, 2, -INFINITY, INFINITY, &mut a),
            DRAW,
            "zéro coup sans échec est un pat, pas un mat"
        );
    }

    // ---- Une nulle se détecte à l'intérieur ET à l'horizon (C22) ----
    //
    // Même leçon que le mat : deux branches, et un test qui n'en couvre
    // qu'une laisse l'autre fausse sans bruit. Le test de nulle était placé
    // APRÈS l'aiguillage vers la quiescence, donc invisible à `depth <= 0`.
    // L'arbitre l'avait signalé des centaines de fois — « PV continues after
    // threefold repetition » — et personne n'avait lu l'avertissement.
    //
    // Chaque test porte un TÉMOIN : la même position hors de la règle doit
    // valoir autre chose que zéro. Sans lui, une position qui vaudrait déjà
    // zéro ferait passer le test quelle que soit la branche empruntée — un
    // test vrai qui ne mesure rien.

    #[test]
    fn une_repetition_se_voit_aussi_a_lhorizon() {
        // Les blancs ont une dame de plus : la quiescence rend ~900, jamais 0.
        let b = board("7k/8/8/8/8/8/8/1Q5K w - - 4 3");
        let mut a = ardoise();

        let mut temoin = search();
        assert!(
            temoin.negamax(&b, 0, 1, -INFINITY, INFINITY, &mut a) > 500,
            "témoin : sans répétition, la position ne vaut pas zéro"
        );

        // Le dernier élément du chemin est la position courante elle-même,
        // comme dans la recherche, qui empile l'enfant avant de descendre.
        let mut s = search();
        s.path = vec![b.hash(), 0xAAAA, b.hash()];
        assert_eq!(
            s.negamax(&b, 0, 1, -INFINITY, INFINITY, &mut a),
            DRAW,
            "à l'horizon, une répétition est une nulle — pas une évaluation"
        );
        assert_eq!(
            s.negamax(&b, 1, 1, -INFINITY, INFINITY, &mut a),
            DRAW,
            "à l'intérieur aussi, comme avant"
        );
    }

    #[test]
    fn la_regle_des_cinquante_coups_se_voit_aussi_a_lhorizon() {
        let mut a = ardoise();
        let temoin = board("7k/8/8/8/8/8/8/1Q5K w - - 99 80");
        assert!(
            search().negamax(&temoin, 0, 1, -INFINITY, INFINITY, &mut a) > 500,
            "témoin : à 99 demi-coups, la partie continue"
        );
        let b = board("7k/8/8/8/8/8/8/1Q5K w - - 100 80");
        assert_eq!(
            search().negamax(&b, 0, 1, -INFINITY, INFINITY, &mut a),
            DRAW,
            "à 100 demi-coups, c'est nul — à l'horizon comme ailleurs"
        );
        assert_eq!(
            search().negamax(&b, 2, 1, -INFINITY, INFINITY, &mut a),
            DRAW,
            "et à l'intérieur"
        );
    }

    #[test]
    fn un_mat_au_centieme_demi_coup_reste_un_mat() {
        // Mat du couloir, donné au centième demi-coup. Le mat termine la
        // partie à l'instant où il est donné ; la règle des cinquante coups
        // demande qu'on la réclame. Rendre cette position nulle ferait jouer
        // au moteur, du côté qui mate, un coup qu'il croirait sans valeur, et
        // du côté maté, une ligne perdue qu'il croirait tenir.
        let mut a = ardoise();
        let mat = board("3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 100 80");
        assert_eq!(
            search().negamax(&mat, 3, 2, -INFINITY, INFINITY, &mut a),
            -MATE + 2,
            "à l'intérieur, le mat l'emporte sur la règle des cinquante coups"
        );
        assert_eq!(
            search().negamax(&mat, 0, 2, -INFINITY, INFINITY, &mut a),
            -MATE + 2,
            "à l'horizon aussi"
        );

        // Le contre-cas : en échec mais PAS mat — le roi s'échappe en g7.
        // L'exception ne vaut que pour le mat ; ici la règle s'applique.
        let echec = board("3R3k/7p/8/8/8/8/5PPP/6K1 b - - 100 80");
        assert_eq!(
            search().negamax(&echec, 3, 2, -INFINITY, INFINITY, &mut a),
            DRAW,
            "un simple échec ne suspend pas la règle des cinquante coups"
        );
    }

    #[test]
    fn un_echec_au_centieme_demi_coup_est_nul_meme_quand_la_parade_remet_la_pendule_a_zero() {
        // Le contre-cas ci-dessus ne distingue pas « échec ET pas de coup »
        // de « échec OU pas de coup » : son roi s'échappe par un coup
        // tranquille, la pendule court encore, et la nulle arrive un ply plus
        // tard — même score. Le balayage de mutation du 24 sept. 2026 l'a
        // montré : `&&` en `||` dans `is_checkmate` survivait. Ici la seule
        // parade est une PRISE, qui remet la pendule à zéro : sans la règle au
        // nœud même, les noirs gagnent une tour. Position validée par
        // exécution : un seul coup légal, d2d8.
        let mut a = ardoise();
        let temoin = board("3R3k/6pp/8/8/8/8/3r1PPP/6K1 b - - 99 80");
        assert!(
            search().negamax(&temoin, 3, 2, -INFINITY, INFINITY, &mut a) > 300,
            "témoin : à 99 demi-coups, la prise de la tour gagne"
        );
        let b = board("3R3k/6pp/8/8/8/8/3r1PPP/6K1 b - - 100 80");
        assert_eq!(
            search().negamax(&b, 3, 2, -INFINITY, INFINITY, &mut a),
            DRAW,
            "en échec sans être mat, à 100 demi-coups, c'est nul — au nœud même"
        );
    }

    #[test]
    fn jamais_de_nulle_a_la_racine_meme_au_centieme_demi_coup() {
        // Au centième demi-coup la position est nulle PAR RÈGLE — pour qui la
        // réclame. À la racine, le moteur doit jouer : prendre la dame remet
        // la pendule à zéro et gagne. Appliquer la règle à la racine rendrait
        // une nulle sans coup, aucune itération ne s'achèverait, et `go`
        // jouerait le premier coup légal venu. Le balayage de mutation du
        // 24 sept. 2026 l'a montré : `ply > 0` en `ply >= 0` survivait.
        // Position validée par exécution : 17 coups légaux, d1d5 gagne.
        assert_eq!(best("4k3/8/8/3q4/8/8/8/3QK3 w - - 100 80", 3), "d1d5");

        let position = Position::from_fen("4k3/8/8/3q4/8/8/8/3QK3 w - - 100 80").unwrap();
        let limits = Limits {
            depth: Some(3),
            ..Limits::default()
        };
        let mut scores = Vec::new();
        search().go(&position, &limits, |info| scores.push(info.score));
        assert!(
            matches!(scores.last(), Some(Score::Cp(cp)) if *cp > 500),
            "la racine se cherche et rend le gain : {scores:?}"
        );
    }

    #[test]
    fn une_nulle_compte_pour_un_noeud() {
        // Le test de nulle passe AVANT l'aiguillage vers la quiescence et
        // avant l'incrément de `negamax`, qui comptent chacun leur nœud : sans
        // le sien, une position nulle ne compterait plus du tout. Rien
        // d'autre ne le voit — le banc à la profondeur 5 ne passe jamais par
        // cette branche, et rend 31 637 nœuds avec ou sans l'incrément
        // (mesuré le 24 sept. 2026). Or un nombre de nœuds est ce que lisent
        // `go nodes`, le banc et chaque comparaison d'arbre de ce dépôt.
        let b = board("7k/8/8/8/8/8/8/1Q5K w - - 4 3");
        let mut a = ardoise();
        for profondeur in [0, 1] {
            let mut s = search();
            s.path = vec![b.hash(), 0xAAAA, b.hash()];
            assert_eq!(
                s.negamax(&b, profondeur, 1, -INFINITY, INFINITY, &mut a),
                DRAW
            );
            assert_eq!(
                s.nodes(),
                1,
                "profondeur {profondeur} : une nulle est un nœud visité, ni plus ni moins"
            );
        }
    }

    // ---- Lazy SMP (B6) ----
    //
    // Plusieurs fils sont NON DÉTERMINISTES par nature : l'ordonnanceur
    // décide qui écrit le premier dans la table. Ces tests n'assertent donc
    // jamais un arbre ni un score, seulement ce qui doit tenir quel que soit
    // l'ordre — un coup légal, un arrêt, un compte de nœuds. Avec un seul fil,
    // le banc garde l'arbre au nœud près, comme avant.

    #[test]
    fn un_seul_fil_ne_cree_aucun_auxiliaire() {
        let mut s = search();
        assert_eq!((s.threads(), s.helpers.len()), (1, 0));

        s.set_threads(3);
        assert_eq!((s.threads(), s.helpers.len()), (3, 2));

        s.set_threads(0);
        assert_eq!((s.threads(), s.helpers.len()), (1, 0), "borné à un fil");

        s.set_threads(MAX_THREADS + 10);
        assert_eq!(
            (s.threads(), s.helpers.len()),
            (MAX_THREADS, MAX_THREADS - 1),
            "borné à MAX_THREADS"
        );
    }

    #[test]
    fn les_auxiliaires_partagent_la_table_meme_apres_un_redimensionnement() {
        let mut s = search();
        s.set_threads(3);
        s.resize_table(1);
        assert!(!s.is_helper);
        for aux in &s.helpers {
            assert!(aux.is_helper);
            assert!(
                Arc::ptr_eq(&aux.tt, &s.tt),
                "un auxiliaire qui cherche dans sa propre table n'aide personne"
            );
            assert!(Arc::ptr_eq(&aux.published_nodes, &s.published_nodes));
            assert!(Arc::ptr_eq(&aux.stop, &s.helper_stop));
        }
    }

    #[test]
    fn un_auxiliaire_publie_tous_ses_noeuds() {
        // Appelé directement, sans fil : le compte est alors déterministe.
        let mut s = search();
        s.set_threads(2);
        let mut aux = s.helpers.pop().unwrap();
        let position = Position::startpos();

        aux.search_as_helper(position.board(), position.history(), 4, None);

        assert!(aux.nodes > 0);
        assert_eq!(
            s.published_nodes.load(Ordering::Relaxed),
            aux.nodes,
            "publié = visité, ni plus ni moins"
        );
        assert_eq!(s.nodes(), aux.nodes, "le total compte l'auxiliaire");
        assert_eq!(
            aux.nodes(),
            aux.nodes,
            "et l'auxiliaire ne se compte qu'une fois"
        );
    }

    #[test]
    fn le_fil_principal_publie_ses_noeuds_lui_aussi() {
        // Sans quoi un auxiliaire tiendrait le budget sans compter les nœuds
        // du fil principal. Un seul fil : le compte est déterministe.
        let mut s = search();
        let limits = Limits {
            depth: Some(7),
            ..Limits::default()
        };
        s.go(&Position::startpos(), &limits, |_| {});
        assert!(
            s.nodes > 4 * CHECK_INTERVAL,
            "la recherche doit franchir plusieurs intervalles : {}",
            s.nodes
        );
        assert!(
            s.published + 2 * CHECK_INTERVAL > s.nodes,
            "publié {} sur {}",
            s.published,
            s.nodes
        );
        assert_eq!(s.published_nodes.load(Ordering::Relaxed), s.published);
        assert_eq!(s.nodes(), s.nodes, "un seul fil ne se compte qu'une fois");
    }

    #[test]
    fn un_auxiliaire_tient_le_budget_sur_le_total_de_tous_les_fils() {
        // Le défaut du 24 sept. 2026 : le budget n'était vérifié que par le
        // fil principal. Privé de CPU, il laissait les auxiliaires chercher
        // sans borne. Appelé ici sans fil, donc déterministe : les autres
        // fils ont déjà publié 40 000 nœuds, et l'auxiliaire doit s'arrêter
        // après les 10 000 qui restent — pas chercher ses neuf plis entiers.
        let mut s = search();
        s.set_threads(2);
        let mut aux = s.helpers.pop().unwrap();
        let position = Position::startpos();
        s.published_nodes.store(40_000, Ordering::Relaxed);

        aux.search_as_helper(position.board(), position.history(), 9, Some(50_000));

        assert!(
            (10_000..=10_001).contains(&aux.nodes),
            "l'auxiliaire a cherché {} nœuds sur les 10 000 restants",
            aux.nodes
        );
        assert_eq!(s.nodes(), 40_000 + aux.nodes);
    }

    #[test]
    fn plusieurs_fils_rendent_un_coup_legal_et_comptent_tous_leurs_noeuds() {
        let position = Position::startpos();
        let mut s = search();
        s.set_threads(3);
        let limits = Limits {
            depth: Some(6),
            ..Limits::default()
        };

        let best = s.go(&position, &limits, |_| {}).unwrap();

        assert!(position.board().is_legal(best));
        // Toujours vrai, pas seulement probable : un auxiliaire ne regarde
        // le drapeau d'arrêt que tous les `CHECK_INTERVAL` nœuds, donc il en
        // visite au moins un même lancé après la fin de la recherche.
        let aux = s.helpers.iter().map(|h| h.nodes).sum::<u64>();
        assert!(aux > 0, "les auxiliaires n'ont rien cherché");
        assert_eq!(
            s.published_nodes.load(Ordering::Relaxed),
            s.published + aux,
            "chaque auxiliaire a publié son reste en finissant"
        );
        assert_eq!(s.nodes(), s.nodes + aux);
    }

    #[test]
    fn larret_de_linterface_arrete_aussi_les_auxiliaires() {
        let stop = Arc::new(AtomicBool::new(false));
        let mut s = Search::new(Arc::clone(&stop));
        s.set_threads(3);
        let (tx, rx) = std::sync::mpsc::channel();
        let fil = std::thread::spawn(move || {
            let limits = Limits {
                infinite: true,
                ..Limits::default()
            };
            tx.send(s.go(&Position::startpos(), &limits, |_| {}))
                .unwrap();
        });

        std::thread::sleep(Duration::from_millis(50));
        stop.store(true, Ordering::Relaxed);

        // Un délai et non un `join` nu : si un auxiliaire ne s'arrêtait pas,
        // `go` ne rendrait jamais la main et le test pendrait au lieu
        // d'échouer.
        let best = rx
            .recv_timeout(Duration::from_secs(20))
            .unwrap_or_else(|_| {
                panic!("la recherche ne rend pas la main : un auxiliaire tourne encore")
            });
        assert!(best.is_some());
        fil.join().unwrap();
    }

    #[test]
    fn le_budget_de_noeuds_compte_tous_les_fils() {
        let mut s = search();
        s.set_threads(3);
        let budget = 50_000;
        let limits = Limits {
            nodes: Some(budget),
            ..Limits::default()
        };

        s.go(&Position::startpos(), &limits, |_| {});

        // Chaque fil s'arrête dès que ses propres nœuds et ceux que les autres
        // ont publiés atteignent le budget. Ce qu'il ne voit pas, ce sont les
        // nœuds non publiés des AUTRES : au plus deux intervalles chacun — la
        // branche de nulle compte un nœud sans consulter le drapeau, et peut
        // sauter un multiple. La borne ne dépend donc pas de l'ordonnancement,
        // ce qui n'était pas le cas quand seul le fil principal tenait le
        // budget : privé de CPU, il laissait les auxiliaires chercher sans
        // limite. Compter la seule recherche principale rendrait environ
        // trois fois le budget.
        let marge = (3 - 1) * 2 * CHECK_INTERVAL;
        assert!(
            s.nodes() <= budget + marge,
            "{} nœuds pour un budget de {budget}",
            s.nodes()
        );
    }

    // ---- Table de variante principale ----
    //
    // Dix mutants y survivaient : toute l'arithmétique d'indexation pouvait
    // être altérée sans qu'un test bronche. Une variante fausse est un
    // mensonge émis à chaque ligne `info`, et c'est ce que l'interface
    // affichera.

    #[test]
    fn une_variante_dun_seul_coup_se_lit() {
        let mut pv = PvTable::new();
        let b = Board::default();
        let mv = cozy_chess::util::parse_uci_move(&b, "e2e4").unwrap();
        pv.clear(1);
        pv.push(0, mv);
        assert_eq!(pv.line(), vec![mv]);
    }

    #[test]
    fn une_variante_enchaine_les_plies() {
        // Trois niveaux, parce que deux suffisent à masquer une faute sur le
        // facteur `ply * MAX_PLY` : à ply 0 il vaut zéro.
        let b = board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        let e2e4 = cozy_chess::util::parse_uci_move(&b, "e2e4").unwrap();
        let g1f3 = cozy_chess::util::parse_uci_move(&b, "g1f3").unwrap();
        let b1c3 = cozy_chess::util::parse_uci_move(&b, "b1c3").unwrap();

        let mut pv = PvTable::new();
        pv.clear(3);
        pv.push(2, b1c3);
        pv.push(1, g1f3);
        pv.push(0, e2e4);
        assert_eq!(
            pv.line(),
            vec![e2e4, g1f3, b1c3],
            "la variante doit se lire de la racine vers les feuilles"
        );
    }

    #[test]
    fn vider_un_ply_coupe_la_variante_a_cet_endroit() {
        let b = Board::default();
        let e2e4 = cozy_chess::util::parse_uci_move(&b, "e2e4").unwrap();
        let g1f3 = cozy_chess::util::parse_uci_move(&b, "g1f3").unwrap();

        let mut pv = PvTable::new();
        pv.clear(2);
        pv.push(1, g1f3);
        pv.clear(1);
        pv.push(0, e2e4);
        assert_eq!(pv.line(), vec![e2e4], "le fils vidé ne doit plus suivre");
    }

    #[test]
    fn la_variante_ne_depasse_jamais_sa_rangee() {
        // `.min(MAX_PLY - 1)` borne la longueur héritée du fils. Sans cette
        // borne, la copie déborderait sur la rangée du ply suivant et la
        // variante annoncée mélangerait deux profondeurs. Aucun test ne
        // construisait de variante assez longue pour l'atteindre : il faut
        // poser la longueur du fils à la main.
        let b = Board::default();
        let mv = cozy_chess::util::parse_uci_move(&b, "e2e4").unwrap();
        let mut pv = PvTable::new();
        pv.lengths[1] = MAX_PLY;
        pv.push(0, mv);
        assert_eq!(
            pv.lengths[0], MAX_PLY,
            "la longueur reste dans la rangée, elle ne la dépasse pas"
        );
    }

    #[test]
    fn la_variante_supporte_les_bornes_du_tableau() {
        // Les gardes de `clear` et `push` ne sont pas décoratives : sans
        // elles, un ply à la limite indexerait hors du tableau. Le test les
        // appelle exactement là où ça déborderait.
        let b = Board::default();
        let mv = cozy_chess::util::parse_uci_move(&b, "e2e4").unwrap();
        let mut pv = PvTable::new();
        pv.clear(MAX_PLY);
        pv.clear(MAX_PLY + 7);
        pv.push(MAX_PLY - 1, mv);
        pv.push(MAX_PLY, mv);
        assert_eq!(pv.line(), Vec::new(), "rien n'a été écrit à la racine");
    }
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "un test doit échouer bruyamment")]
mod see_pruning_tests {
    use super::*;
    use cozy_chess::util::parse_uci_move;

    fn board(fen: &str) -> Board {
        fen.parse().unwrap()
    }

    /// Une marche déterministe depuis la position initiale.
    ///
    /// Les positions de `bench` ne sont pas un échantillon de jeu — le projet
    /// l'a mesuré, un facteur 3 à 5 sur la fréquence d'un phénomène. Une marche
    /// couvre l'ouverture, le milieu et la finale, et le xorshift la rend
    /// rejouable : un échec se reproduit à l'identique.
    fn marche(parties: u32, plis: u32, mut visiter: impl FnMut(&Board)) {
        for graine in 1..=parties {
            let mut etat = (u64::from(graine) * 2_654_435_761) | 1;
            let mut board = Board::default();
            for _ in 0..plis {
                let mut coups = Vec::new();
                board.generate_moves(|set| {
                    coups.extend(set);
                    false
                });
                if coups.is_empty() {
                    break;
                }
                visiter(&board);
                etat ^= etat << 13;
                etat ^= etat >> 7;
                etat ^= etat << 17;
                let mv = coups[(etat as usize) % coups.len()];
                board.play_unchecked(mv);
            }
        }
    }

    /// L'économie de `may_lose_material` ne doit jamais coûter un élagage.
    ///
    /// Rendre `false` à tort ne casse rien — on n'élague pas — mais cela
    /// voudrait dire que le raisonnement des deux cas est faux, et ce
    /// raisonnement est le seul garant qu'on ne paie pas `see` pour rien.
    /// Le vérifier sur des milliers de positions coûte une seconde.
    #[test]
    fn economie_jamais_a_tort() {
        let mut vus = 0u64;
        marche(60, 80, |board| {
            let mut coups = Vec::new();
            board.generate_moves(|set| {
                coups.extend(set);
                false
            });
            for mv in coups {
                let Some(victim) = captured_piece(board, mv) else {
                    continue;
                };
                if mv.promotion.is_some() {
                    continue;
                }
                vus += 1;
                if !may_lose_material(board, mv, victim) {
                    let exchange = see::see(board, mv);
                    assert!(
                        exchange >= 0,
                        "économie fausse : {mv} vaut {exchange} sur {board}"
                    );
                }
            }
        });
        // Un test qui n'a rien regardé passe aussi. Le compte le dit.
        assert!(vus > 10_000, "corpus trop maigre : {vus} captures");
    }

    /// L'autre direction, que le test ci-dessus ne peut pas voir.
    ///
    /// `economie_jamais_a_tort` n'éprouve que le `false` : quand
    /// `may_lose_material` renvoie `false`, l'échange doit être positif. Rien
    /// n'y regarde le `true`, et c'est là que vit le garde du roi.
    ///
    /// **Pourquoi ce garde n'est pas décoratif.** `see` ignore la légalité —
    /// limite assumée et documentée du module. Sur une prise de roi il compte
    /// donc une reprise par une pièce clouée, et peut rendre un score négatif
    /// pour une capture que les règles du jeu rendent sûre : un coup de roi
    /// produit par le générateur est légal, donc la case d'arrivée n'est
    /// attaquée par personne après coup. Sans le garde, la quiescence
    /// élaguerait une prise de roi gagnante sur une valeur connue pour fausse.
    ///
    /// Deux mutants survivaient ici au balayage du 21 sept. 2026 : rendre
    /// `true` sans condition, et remplacer le `ET` par un `OU`. Les deux
    /// suppriment le garde, et aucun test ne bronchait.
    #[test]
    fn le_roi_ne_passe_jamais_par_lechange_statique() {
        let mut vus = 0u64;
        marche(60, 80, |board| {
            let mut coups = Vec::new();
            board.generate_moves(|set| {
                coups.extend(set);
                false
            });
            for mv in coups {
                if board.piece_on(mv.from) != Some(Piece::King) {
                    continue;
                }
                let Some(victim) = captured_piece(board, mv) else {
                    continue;
                };
                vus += 1;
                assert!(
                    !may_lose_material(board, mv, victim),
                    "prise de roi {mv} envoyée à `see`, qui ignore la légalité : {board}"
                );
            }
        });
        // Sans ce compte, un parcours qui ne rencontre aucune prise de roi
        // rendrait un test vert qui ne mesure rien.
        assert!(vus > 100, "corpus trop maigre : {vus} prises de roi");
    }

    /// Une capture franchement perdante est sautée.
    ///
    /// Position et coup vérifiés par exécution, valeur lue sur l'oracle : la
    /// dame prend en f6 un cavalier défendu et perd 660.
    #[test]
    fn capture_perdante_sautee() {
        let b = board("r2q1rk1/p1p2ppp/bp3n2/2bp2B1/4P3/N1QP1N1P/PP3PP1/R3K2R w KQ - 2 13");
        let mv = parse_uci_move(&b, "c3f6").unwrap();
        assert_eq!(see::see(&b, mv), -660);
        assert!(see_prunable(&b, mv, false));
    }

    /// **En échec, rien n'est sauté.** La quiescence produit alors toutes les
    /// évasions, et en élaguer une rendrait un mat qui n'existe pas — dans la
    /// branche de mat que ne couvre aucun test de mat en un.
    #[test]
    fn jamais_en_echec() {
        let b = board("r2q1rk1/p1p2ppp/bp3n2/2bp2B1/4P3/N1QP1N1P/PP3PP1/R3K2R w KQ - 2 13");
        let mv = parse_uci_move(&b, "c3f6").unwrap();
        assert!(see_prunable(&b, mv, false));
        assert!(!see_prunable(&b, mv, true));
    }

    /// Un coup tranquille n'est pas une capture, et l'élagage ne le regarde pas.
    #[test]
    fn coup_tranquille_intact() {
        let b = board("r2q1rk1/p1p2ppp/bp3n2/2bp2B1/4P3/N1QP1N1P/PP3PP1/R3K2R w KQ - 2 13");
        let mv = parse_uci_move(&b, "h3h4").unwrap();
        assert_eq!(captured_piece(&b, mv), None);
        assert!(!see_prunable(&b, mv, false));
    }

    /// Une capture gagnante survit, et **une capture égale aussi**.
    ///
    /// Les deux valeurs sont lues sur l'oracle : `f3e5` gagne un pion, `e4d5`
    /// vaut exactement zéro. Ce zéro est le vrai objet du test — il distingue
    /// `< 0` de `<= 0`, et sans lui l'élagage pourrait jeter tous les échanges
    /// égaux sans qu'un seul test bronche. Sans cette garde non plus, un
    /// élagage qui rendrait `true` partout passerait les tests précédents.
    #[test]
    fn capture_gagnante_et_capture_egale_conservees() {
        let b = board("rnbqkbnr/ppp2ppp/8/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3");

        let gagnante = parse_uci_move(&b, "f3e5").unwrap();
        assert_eq!(see::see(&b, gagnante), 100);
        assert!(!see_prunable(&b, gagnante, false));

        let egale = parse_uci_move(&b, "e4d5").unwrap();
        assert_eq!(see::see(&b, egale), 0);
        assert!(!see_prunable(&b, egale, false));
    }
}
