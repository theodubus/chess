import { useEffect, useRef } from "react";
import type { GameController } from "./GameController";

import { frenchSan } from "./review/model";

export default function GameHistory({
  controller,
  selected = controller.game.chess.history().length,
  onSelect,
  visible = true,
}: {
  controller: GameController;
  selected?: number;
  onSelect?: (index: number) => void;
  visible?: boolean;
}) {
  const moves = controller.game.chess.history();
  const rows = Array.from(
    { length: Math.ceil(moves.length / 2) },
    (_, index) => index * 2,
  );
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = list.current;
    const move = container?.querySelector('[aria-pressed="true"]');
    if (!visible || !container || !move) return;
    const bounds = container.getBoundingClientRect();
    const target = move.getBoundingClientRect();
    if (target.bottom > bounds.bottom)
      container.scrollTop += target.bottom - bounds.bottom;
    else if (target.top < bounds.top + 30)
      container.scrollTop += target.top - bounds.top - 30;
  }, [moves.length, selected, visible]);
  return (
    <section className="game-history" aria-labelledby="history-title">
      <div className="history-header">
        <h2 id="history-title">La partie</h2>
      </div>
      <div
        ref={list}
        className="move-list"
        tabIndex={0}
        aria-label="Historique des coups"
      >
        {moves.length ? (
          <table>
            <thead>
              <tr>
                <th scope="col">Coup</th>
                <th scope="col">Blancs</th>
                <th scope="col">Noirs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((index) => (
                <tr key={index}>
                  <th scope="row">{index / 2 + 1}.</th>
                  <td className={index + 1 === selected ? "latest-move" : ""}>
                    <button
                      className="text-button"
                      aria-pressed={selected === index + 1}
                      onClick={() => onSelect?.(index + 1)}
                    >
                      {frenchSan(moves[index])}
                    </button>
                  </td>
                  <td className={index + 2 === selected ? "latest-move" : ""}>
                    {moves[index + 1] ? (
                      <button
                        className="text-button"
                        aria-pressed={selected === index + 2}
                        onClick={() => onSelect?.(index + 2)}
                      >
                        {frenchSan(moves[index + 1])}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Aucun coup joué.</p>
        )}
      </div>
      <p className="history-result" role="status">
        {controller.finished
          ? controller.status
          : `${moves.length} demi-coups joués`}
      </p>
    </section>
  );
}
