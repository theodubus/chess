import { captureOrder, type Captures } from "./material";
import type { Side } from "./engine/analysis";

const images = import.meta.glob<string>("./assets/captured/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
const names = { p: "pion", n: "cavalier", b: "fou", r: "tour", q: "dame" };

export default function CapturedPieces({
  captures,
  balance,
  side,
  label = false,
}: {
  captures: Captures;
  balance: number;
  side: Side;
  label?: boolean;
}) {
  const opponent = side === "w" ? "b" : "w";
  const own = captures[side];
  const delta = side === "w" ? balance : -balance;
  const sideName = side === "w" ? "Blancs" : "Noirs";
  const description = captureOrder
    .flatMap((type) => {
      const count = own.pieces.filter((piece) => piece === type).length;
      return count ? [`${count} ${names[type]}${count > 1 ? "s" : ""}`] : [];
    })
    .join(", ");
  return (
    <div
      className="captured-material"
      data-side={side}
      aria-label={`Prises des ${sideName} : ${description || "aucune"}${delta > 0 ? ` ; avantage matériel de ${delta} point${delta > 1 ? "s" : ""}` : ""}`}
      title="Pièces prises et avantage matériel sur le plateau : pion 1, cavalier et fou 3, tour 5, dame 9."
    >
      {label && <span className="capture-side">{sideName}</span>}
      <span className="captured-icons" aria-hidden="true">
        {captureOrder.map((type) => {
          const count = own.pieces.filter((piece) => piece === type).length;
          return count ? (
            <span className="captured-group" key={type}>
              {Array.from({ length: count }, (_, index) => (
                <img
                  key={index}
                  alt=""
                  draggable={false}
                  src={images[`./assets/captured/${opponent}${type}.svg`]}
                />
              ))}
            </span>
          ) : null;
        })}
      </span>
      {delta > 0 && (
        <strong className="capture-advantage" aria-hidden="true">
          +{delta}
        </strong>
      )}
    </div>
  );
}
