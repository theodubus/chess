import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GameHistory from "./GameHistory";
import { GameController } from "./GameController";

it("affiche les coups en français et conserve leur numérotation", () => {
  const controller = new GameController({ now: () => 0 });
  controller.move("g1", "f3");
  controller.move("g8", "f6");
  const html = renderToStaticMarkup(<GameHistory controller={controller} />);
  expect(html).toContain("1.</th>");
  expect(html).toContain("Cf3");
  expect(html).toContain("Cf6");
  expect(html).not.toContain("Annuler");
  expect(html).not.toContain("Refaire");
  expect(html).toContain('aria-pressed="true"');
  expect(controller.exportPgn()).toContain("Nf3");
});

it("sélectionne un coup antérieur sans modifier les coups joués", () => {
  const controller = new GameController({ now: () => 0 });
  controller.move("e2", "e4");
  controller.move("e7", "e5");
  const before = controller.exportPgn();
  const html = renderToStaticMarkup(
    <GameHistory controller={controller} selected={1} onSelect={() => {}} />,
  );
  expect(html).toContain('aria-pressed="true">e4');
  expect(html).toContain('aria-pressed="false">e5');
  expect(controller.exportPgn()).toBe(before);
});
