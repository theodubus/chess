import type { Color } from '@lichess-org/chessground/types';
import { scoreLabel, whiteShare, type Score } from './engine/analysis';

export default function EvaluationBar({ score, orientation }: { score: Score | null; orientation: Color }) {
  const white = whiteShare(score);
  return <div className={`evaluation-bar ${score ? '' : 'unavailable'}`}
    role="img" aria-label={score ? `Évaluation du point de vue des blancs : ${scoreLabel(score)}` : 'Évaluation indisponible'}
    title={score ? scoreLabel(score) : 'En attente d’une évaluation'}>
    <div className="evaluation-white" style={{ height: `${white}%`, [orientation === 'white' ? 'bottom' : 'top']: 0 }} />
    <span className="evaluation-midpoint" aria-hidden="true" />
    {!score && <span className="evaluation-unknown" aria-hidden="true">?</span>}
  </div>;
}
