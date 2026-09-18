import { scoreLabel, type Score } from '../engine/analysis';
import type { ReviewPosition, ReviewResult } from './model';

function ordinate(score: Score) {
  const value = score.kind === 'mate' ? (score.winner === 'w' ? 500 : -500) : score.value;
  return 90 - Math.max(-500, Math.min(500, value)) * .14;
}
export default function EvaluationChart({ positions, results, selected, onSelect }: {
  positions: ReviewPosition[]; results: (ReviewResult | null)[]; selected: number; onSelect: (index: number) => void;
}) {
  const x = (index: number) => 45 + 640 * index / Math.max(1, positions.length - 1);
  const path = results.map((result, index) => result?.score ? `${index > 0 && results[index - 1]?.score ? 'L' : 'M'}${x(index)},${ordinate(result.score)}` : '').join(' ');
  return <section className="evaluation-chart" aria-label="Courbe d’évaluation">
    <h2>Évolution de la partie</h2><p>Avantage blanc au-dessus de zéro, noir en dessous. Échelle limitée à ±5 pions ; sélectionnez un point pour revoir la position.</p>
    <svg viewBox="0 0 710 190" aria-label="Évaluations des positions analysées">
      {[20, 90, 160].map((y, index) => <g key={y}><line x1="45" x2="685" y1={y} y2={y} className="chart-grid" /><text x="5" y={y + 5}>{['+5', '0', '−5'][index]}</text></g>)}
      <line x1={x(selected)} x2={x(selected)} y1="15" y2="165" className="chart-cursor" />
      <path d={path} fill="none" className="chart-line" />
      {results.map((result, index) => result?.score && <circle key={index} cx={x(index)} cy={ordinate(result.score)} r={selected === index ? 6 : 4} role="button" tabIndex={0}
        aria-label={`${positions[index].label} : ${scoreLabel(result.score)}`} aria-pressed={selected === index}
        onClick={() => onSelect(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(index); } }}><title>{positions[index].label} : {scoreLabel(result.score)}</title></circle>)}
    </svg>
    {!results.some(result => result?.score) && <p>La courbe se dessinera pendant l’analyse.</p>}
  </section>;
}
