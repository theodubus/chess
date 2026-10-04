import assert from "node:assert/strict";
import { Chess } from "chess.js";

/** Les vrais événements navigateur vérifient aussi la conversion pixels → cases. */
export async function checkPlay({
  call,
  evaluate,
  waitFor,
  button,
  clickAt,
  screenshot,
}) {
  await call("Page.navigate", {
    url: process.env.CHESS_UI_URL || "http://127.0.0.1:5173",
  });
  await waitFor("document.querySelector('.setup-card')", "préparation");
  await button("Deux joueurs");
  await button("Jouer");
  await waitFor("document.querySelector('.play-workspace cg-board')", "plateau");

  const chess = new Chess();
  let checks = 0;
  for (let index = 0; index < 30; index++) {
    const moves = chess.moves({ verbose: true });
    const move = moves[(index * 11 + 1) % moves.length];
    if (chess.isCheck()) checks++;
    // Simuler le changement de hauteur des informations au-dessus du plateau,
    // sans resize ni scroll : ces événements rafraîchiraient déjà Chessground.
    await evaluate(`document.querySelector('.play-status').style.paddingTop =
      ${JSON.stringify(index % 2 ? "40px" : "0px")}`);
    const points = await evaluate(`(() => {
      const b = document.querySelector('cg-board').getBoundingClientRect();
      return ${JSON.stringify([move.from, move.to])}.map(s => ({
        x: b.x + (s.charCodeAt(0) - 97 + 0.5) * b.width / 8,
        y: b.y + (8 - Number(s[1]) + 0.5) * b.height / 8,
      }));
    })()`);
    assert(
      points.every((p) => p.y >= 0 && p.y < 800),
      "cases visibles sans défilement",
    );
    if (index % 3 === 0) {
      await call("Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...points[0],
        button: "left",
        buttons: 1,
        clickCount: 1,
      });
      await call("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...points[1],
        button: "left",
        buttons: 1,
      });
      await evaluate(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      await call("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...points[1],
        button: "left",
        buttons: 0,
        clickCount: 1,
      });
    } else if (index % 3 === 1) {
      for (const point of points) await clickAt(point.x, point.y);
    } else {
      for (const point of points) {
        await call("Input.dispatchTouchEvent", {
          type: "touchStart", touchPoints: [point],
        });
        await call("Input.dispatchTouchEvent", {
          type: "touchEnd", touchPoints: [],
        });
      }
    }
    chess.move(move);
    await waitFor(
      `document.querySelector('.play-controls .review-navigation span').textContent === '${index + 1} / ${index + 1}'`,
      `coup ${index + 1} (${move.san}) après déplacement du plateau`,
      3000,
    );
  }
  assert(checks > 0, "le parcours comprend une sortie d’échec");
  await evaluate("document.querySelector('.play-status').style.paddingTop = ''");

  for (const [width, height] of [
    [1280, 800], [1280, 600], [900, 560], [700, 900], [390, 844], [320, 740],
  ]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    for (const history of [false, true]) {
      if (history) await button("Coups");
      await evaluate(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      const layout = await evaluate(`(() => {
        const controls = document.querySelector('.play-controls');
        const bounds = controls.getBoundingClientRect();
        const items = [...controls.querySelectorAll('button, .review-navigation span')]
          .map(n => ({label: n.getAttribute('aria-label') || n.textContent, ...n.getBoundingClientRect().toJSON()}));
        return {bounds: bounds.toJSON(), items, pageWidth: document.documentElement.scrollWidth};
      })()`);
      assert(
        layout.pageWidth <= width,
        `débordement de page à ${width} × ${height}`,
      );
      for (const [i, a] of layout.items.entries()) {
        assert(
          a.left >= layout.bounds.left - 1 && a.right <= layout.bounds.right + 1,
          `${a.label} dépasse les commandes à ${width} × ${height}`,
        );
        for (const b of layout.items.slice(i + 1))
          assert(
            Math.min(a.right, b.right) <= Math.max(a.left, b.left) + 1 ||
            Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top) + 1,
            `${a.label} chevauche ${b.label} à ${width} × ${height}`,
          );
      }
      if (history) await button("Coups");
    }
    await screenshot(`play-controls-${width}-${height}`);
  }
  console.log(
    "Jeu : 30 demi-coups sans retour à l’historique, souris/glisser-déposer/tactile, échec et commandes à 6 tailles vérifiés.",
  );
}
