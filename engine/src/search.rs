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
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use cozy_chess::{Board, Color, Move, Piece, Rank, Square};

use crate::eval::{self, DRAW, INFINITY, MATE, MATE_THRESHOLD};
use crate::position::{Position, repetitions};
use crate::tt::{Bound, TranspositionTable, pack_move};

/// Profondeur maximale de la recherche principale.
pub const MAX_DEPTH: u32 = 64;

/// Plafond de profondeur, quiescence comprise. Borne les tableaux indexés par
/// ply et empêche une quiescence pathologique de déborder la pile.
pub const MAX_PLY: usize = 128;

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
    aborted: bool,
    /// Clés Zobrist de la partie puis du chemin courant dans l'arbre.
    path: Vec<u64>,
    pv: PvTable,
    root_best: Option<Move>,
    /// Mémoire des positions déjà évaluées, conservée entre les coups.
    tt: TranspositionTable,
    /// Deux coups tranquilles par ply ayant provoqué une coupure bêta.
    ///
    /// Un coup qui réfute une variante à un ply donné en réfute souvent
    /// d'autres au même ply : l'essayer tôt coûte un test et rapporte beaucoup.
    killers: Vec<[u16; 2]>,
    /// Table butterfly indexée par case de départ puis d'arrivée.
    history: Vec<i32>,
}

impl Search {
    /// Crée une recherche pilotée par le drapeau d'arrêt fourni.
    #[must_use]
    pub fn new(stop: Arc<AtomicBool>) -> Self {
        Self {
            stop,
            nodes: 0,
            started: Instant::now(),
            hard_deadline: None,
            soft_deadline: None,
            aborted: false,
            path: Vec::new(),
            pv: PvTable::new(),
            root_best: None,
            tt: TranspositionTable::default(),
            killers: vec![[0; 2]; MAX_PLY],
            history: vec![0; 64 * 64],
        }
    }

    /// Redimensionne la table de transposition et la vide.
    pub fn resize_table(&mut self, megabytes: usize) {
        self.tt = TranspositionTable::new(megabytes);
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

    /// Nombre de nœuds visités par la dernière recherche.
    #[must_use]
    pub fn nodes(&self) -> u64 {
        self.nodes
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
        self.aborted = false;
        self.root_best = None;
        self.path = position.history().to_vec();
        self.tt.new_search();
        // Les killers valent pour un ply donné d'une recherche donnée : les
        // garder d'un coup à l'autre proposerait des coups sans rapport.
        self.killers.fill([0; 2]);
        self.history.fill(0);
        self.set_deadlines(limits, position.board().side_to_move());

        let board = position.board().clone();
        let max_depth = limits.depth.unwrap_or(MAX_DEPTH).clamp(1, MAX_DEPTH);

        let mut best = None;

        for depth in 1..=max_depth {
            let score = self.negamax(
                &board,
                i32::try_from(depth).unwrap_or(1),
                0,
                -INFINITY,
                INFINITY,
            );

            // Une itération interrompue a exploré ses coups dans le désordre :
            // son résultat est partiel et ne remplace pas le précédent.
            if self.aborted {
                break;
            }

            let Some(mv) = self.root_best else { break };
            best = Some(mv);
            report(&Info {
                depth,
                score: Score::from_internal(score),
                nodes: self.nodes,
                time_ms: self.elapsed_ms(),
                pv: self.pv.line(),
                hashfull: self.tt.permille_used(),
            });

            // Un mat trouvé ne s'améliore pas en cherchant plus loin.
            if score.abs() > MATE_THRESHOLD {
                break;
            }
            if self.soft_deadline.is_some_and(|at| Instant::now() >= at) {
                break;
            }
        }

        // Filet de sécurité : si la toute première itération a été interrompue,
        // il faut tout de même jouer un coup légal plutôt que d'abandonner.
        let best = best.or_else(|| first_legal_move(&board));

        if limits.infinite {
            while !self.stop.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(1));
            }
        }

        best
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
        if limits.infinite {
            self.hard_deadline = None;
            self.soft_deadline = None;
            return;
        }

        let budget_ms = if let Some(movetime) = limits.movetime {
            movetime.saturating_sub(20).max(1)
        } else {
            let (remaining, increment) = match side {
                Color::White => (limits.wtime, limits.winc),
                Color::Black => (limits.btime, limits.binc),
            };
            let Some(remaining) = remaining else {
                // Ni pendule ni `movetime` : c'est une recherche à profondeur
                // ou à nœuds imposés, sans contrainte d'horloge.
                self.hard_deadline = None;
                self.soft_deadline = None;
                return;
            };
            let increment = increment.unwrap_or(0);
            let moves_to_go = u64::from(limits.movestogo.unwrap_or(30)).max(1);
            let budget = remaining / moves_to_go + increment / 2;
            // Toujours garder une marge : une pendule à zéro perd la partie,
            // quelle que soit la position.
            budget.clamp(1, remaining.saturating_sub(50).max(1))
        };

        let now = Instant::now();
        self.hard_deadline = Some(now + Duration::from_millis(budget_ms));
        // Entamer une itération alors que plus de la moitié du budget est
        // consommée revient presque toujours à la jeter.
        self.soft_deadline = Some(now + Duration::from_millis(budget_ms / 2));
    }

    /// Vrai si la recherche doit cesser. Consulte l'horloge par intervalles.
    fn should_abort(&mut self) -> bool {
        if self.aborted {
            return true;
        }
        if self.nodes.is_multiple_of(CHECK_INTERVAL) {
            self.aborted = self.stop.load(Ordering::Relaxed)
                || self.hard_deadline.is_some_and(|at| Instant::now() >= at);
        }
        self.aborted
    }

    fn is_repetition(&self, board: &Board) -> bool {
        repetitions(&self.path, board.hash(), board.halfmove_clock()) > 0
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

    /// Les coups légaux de la position, du plus prometteur au moins prometteur.
    ///
    /// Avec `tactical_only`, seuls les coups qui changent le matériel sont
    /// produits — captures, prises en passant et promotions. C'est ce dont la
    /// quiescence a besoin, et `cozy-chess` le rend bon marché :
    /// `PieceMoves.to` est un `BitBoard` public, donc filtrer les destinations
    /// coûte un `AND` par pièce.
    fn ordered_moves(
        &self,
        board: &Board,
        tactical_only: bool,
        tt_move: Option<Move>,
        ply: usize,
    ) -> Vec<(Move, i32)> {
        let side = board.side_to_move();
        let mut targets = board.colors(!side);
        if let Some(square) = en_passant_square(board) {
            targets |= square.bitboard();
        }
        let promotion_rank = Rank::Seventh.relative_to(side);

        let mut moves = Vec::with_capacity(48);
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
                moves.push((mv, self.score_move(board, mv, tt_move, ply)));
            }
            false
        });
        moves.sort_unstable_by_key(|&(_, score)| Reverse(score));
        moves
    }

    /// Negamax avec élagage alpha-bêta.
    ///
    /// Le score rendu est du point de vue du camp au trait dans `board`.
    fn negamax(&mut self, board: &Board, depth: i32, ply: usize, mut alpha: i32, beta: i32) -> i32 {
        self.pv.clear(ply);

        if depth <= 0 {
            return self.quiescence(board, alpha, beta, ply);
        }

        self.nodes += 1;
        if self.should_abort() {
            return 0;
        }

        // Une répétition ou la règle des cinquante coups font nulle. Jamais à la
        // racine : la position de départ n'est pas un résultat, il faut jouer.
        if ply > 0 && (self.is_repetition(board) || board.halfmove_clock() >= 100) {
            return DRAW;
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
            self.path.push(passed.hash());
            let score = -self.negamax(
                &passed,
                depth - 1 - NULL_MOVE_REDUCTION,
                ply + 1,
                -beta,
                -beta + 1,
            );
            self.path.pop();

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

        let moves = self.ordered_moves(board, false, tt_move, ply);
        if moves.is_empty() {
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

        for (mv, _) in moves {
            let mut child = board.clone();
            child.play_unchecked(mv);

            self.path.push(child.hash());
            let score = -self.negamax(&child, depth - 1, ply + 1, -beta, -alpha);
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
                        if captured_piece(board, mv).is_none() && mv.promotion.is_none() {
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
    fn quiescence(&mut self, board: &Board, mut alpha: i32, beta: i32, ply: usize) -> i32 {
        self.pv.clear(ply);
        self.nodes += 1;
        if self.should_abort() {
            return 0;
        }
        if ply + 1 >= MAX_PLY {
            return eval::evaluate(board);
        }

        let in_check = !board.checkers().is_empty();

        if !in_check {
            // « Stand pat » : ne rien jouer est une option, et la plupart des
            // positions sont déjà au moins aussi bonnes que ce qu'une capture
            // forcée donnerait.
            let stand_pat = eval::evaluate(board);
            if stand_pat >= beta {
                return stand_pat;
            }
            if stand_pat > alpha {
                alpha = stand_pat;
            }
        }

        let moves = self.ordered_moves(board, !in_check, None, ply);
        if moves.is_empty() {
            return if in_check {
                -MATE + i32::try_from(ply).unwrap_or(0)
            } else {
                alpha
            };
        }

        let mut best = if in_check { -INFINITY } else { alpha };
        for (mv, _) in moves {
            let mut child = board.clone();
            child.play_unchecked(mv);

            let score = -self.quiescence(&child, -beta, -alpha, ply + 1);

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
    let mut state = board.hash() | 1;
    let index = (next_random(&mut state) % legal.len() as u64) as usize;
    legal.get(index).copied()
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
        let tactiques = s.ordered_moves(&b, true, None, 0);
        assert_eq!(tactiques.len(), 1, "seule exd5 change le matériel");
        assert!(s.ordered_moves(&b, false, None, 0).len() > 1);
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
    fn le_tirage_au_sort_reste_disponible_et_legal() {
        let b = Board::default();
        let a = random_legal_move(&b).unwrap();
        assert_eq!(Some(a), random_legal_move(&b), "doit rester déterministe");
        assert!(b.is_legal(a));
    }
}
