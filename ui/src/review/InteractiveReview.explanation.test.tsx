import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import InteractiveReview from "./InteractiveReview";
import { GameReview } from "./GameReview";
import { boardFromCommand } from "./StudyTree";
import { legalVariation } from "./model";
import { corpusInput } from "./understanding/corpus";
import { tacticalInput } from "./understanding/tacticalCases";
import { PedagogicalAnalysis, type PedagogicalResult } from "./understanding/PedagogicalAnalysis";
import { ScriptEngine } from "./understanding/tacticalTestEngine";
import { restrictionInput, RestrictionTestEngine } from "./understanding/restrictionTestEngine";
import type { ConsequenceState } from "./usePedagogicalAnalysis";

// Le contrôleur asynchrone a ses propres tests. Ce rendu vérifie que la revue
// raccorde bien son résultat au bon coup, aux préférences et aux actions.
const hook = vi.hoisted(() => ({ state: "pending" as ConsequenceState, result: null as PedagogicalResult | null, request: vi.fn(), stop: vi.fn() }));
vi.mock("./usePedagogicalAnalysis", () => ({
  usePedagogicalAnalysis: (request: unknown, _factory: unknown, enabled: boolean) => {
    hook.request(request, enabled);
    return { state: enabled && request ? hook.state : "idle", result: enabled && request ? hook.result : null, analysis: { stop: hook.stop } };
  },
}));
beforeEach(() => { hook.state = "pending"; hook.result = null; hook.request.mockClear(); });
function fixture() {
  const input = tacticalInput("allows-fork"), source = corpusInput(input.example.test);
  const board = boardFromCommand(source.position.command); board.move(source.position.played!);
  const review = new GameReview(board.pgn());
  review.results[0] = { score: { kind: "cp", value: 0 }, depth: 15, bestMove: "a8b8", bestSan: "Tb8",
    variation: legalVariation(review.positions[0].fen, ["a8b8"]) };
  review.results[1] = { ...source.result!, score: { kind: "cp", value: 600 } };
  review.state = "complete";
  const props = { review, selected: 1, onSelect: () => {}, engineId: "script", orientation: "white" as const,
    showEvaluation: false, showAnnotations: true, active: true, side: "both" as const, treeCache: new Map() };
  expect(review.annotations[0]?.category).toBe("blunder");
  return { input, source, props };
}
it("affiche un calcul lisible puis la raison directe et son bouton, sans comparaison imposée", async () => {
  const { props, input } = fixture();
  const loading = renderToStaticMarkup(<InteractiveReview {...props} />);
  expect(loading).toContain("Recherche de ce que ce coup permet"); expect(loading).not.toContain("Montrer pourquoi");
  const request = { review: props.review, revision: props.review.revision, engineId: props.engineId,
    position: props.review.positions[0], result: props.review.results[1], category: "blunder" as const };
  hook.result = await new PedagogicalAnalysis([10, 20]).analyse(request,
    async () => new ScriptEngine({ ...input, ...request }, "allows-fork"));
  hook.state = "supported";
  const ready = renderToStaticMarkup(<InteractiveReview {...props} />);
  expect(ready).toContain("Le cavalier blanc en c7"); expect(ready).toContain("−5 points pour les Noirs");
  expect(ready).toContain("Montrer pourquoi"); expect(ready).not.toContain("Comparer les décisions");
  expect(ready).toContain("Portée de cette explication"); expect(ready).toContain("Voir le choix du moteur");
  expect(ready).toContain("Position précédente"); expect(ready).toContain("Réessayer ce coup");
  expect(hook.request).toHaveBeenLastCalledWith(request, true);
  const hidden = renderToStaticMarkup(<InteractiveReview {...props} showAnnotations={false} />);
  expect(hidden).not.toContain("Montrer pourquoi"); expect(hidden).not.toContain("Le cavalier blanc en c7");
  expect(hook.request).toHaveBeenLastCalledWith(null, false);
  const inactive = renderToStaticMarkup(<InteractiveReview {...props} active={false} />);
  expect(inactive).not.toContain("Montrer pourquoi");
  expect(hook.request).toHaveBeenLastCalledWith(request, false);
});
it("l'abstention conserve les variantes et la navigation mais n'affiche pas une cause heuristique", () => {
  const { props } = fixture(); hook.state = "unconfirmed";
  const html = renderToStaticMarkup(<InteractiveReview {...props} />);
  expect(html).toContain("Aucune conséquence courte suffisamment confirmée");
  expect(html).toContain("Variantes du moteur"); expect(html).toContain("Approfondir ce coup");
  expect(html).not.toContain("Montrer pourquoi"); expect(html).not.toContain("analysis-spinner");
});
it("raconte la sortie fermée, l'attaque et le bilan dans la revue du mauvais coup", async () => {
  const { source, request: input } = restrictionInput();
  const board = boardFromCommand(source.position.command); board.move(source.position.played!);
  const review = new GameReview(board.pgn());
  const alternative = boardFromCommand(source.position.command).moves({ verbose: true }).find((m) => m.lan !== source.position.played)!;
  review.results[0] = { score: { kind: "cp", value: 0 }, depth: 15, bestMove: alternative.lan,
    bestSan: alternative.san, variation: legalVariation(review.positions[0].fen, [alternative.lan]) };
  review.results[1] = { ...source.result!, score: { kind: "cp", value: -500 } };
  review.state = "complete";
  expect(review.annotations[0]?.category).toBe("blunder");
  hook.result = await new PedagogicalAnalysis([10, 20]).analyse({ review, revision: review.revision, engineId: "script",
    position: review.positions[0], result: review.results[1], category: "blunder" }, async () => new RestrictionTestEngine(input));
  expect(hook.result?.status).toBe("supported"); hook.state = "supported";
  const html = renderToStaticMarkup(<InteractiveReview review={review} selected={1} onSelect={() => {}} engineId="script"
    orientation="white" showEvaluation={false} showAnnotations active side="both" treeCache={new Map()} />);
  expect(html).toContain("ferme la sortie e3–d2 du fou blanc en e3");
  expect(html).toContain("le pion noir en f4 attaque le fou blanc en e3");
  expect(html).toContain("Après les reprises"); expect(html).toContain("−2 points pour les Blancs");
  expect(html).toContain("Montrer pourquoi"); expect(html).not.toContain("Comparer les décisions");
  expect(html).not.toContain("cette pièce est perdue dans toutes les variantes");
});
