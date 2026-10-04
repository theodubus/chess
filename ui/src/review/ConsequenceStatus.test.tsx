import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ConsequenceStatus from "./ConsequenceStatus";
it("annonce le calcul utile et permet de continuer à naviguer, sans confondre abstention et panne", () => {
  const initial = renderToStaticMarkup(<ConsequenceStatus state="extracting" fallback="Sans raison confirmée." />);
  expect(initial).toContain('role="status"'); expect(initial).toContain('aria-live="polite"');
  expect(initial).toContain("Recherche de ce que ce coup permet"); expect(initial).toContain("parcourir la partie");
  const engine = renderToStaticMarkup(<ConsequenceStatus state="verifying" fallback="Sans raison confirmée." />);
  expect(engine).toContain("reprises et les compensations");
  const unknown = renderToStaticMarkup(<ConsequenceStatus state="unconfirmed" fallback="Sans raison confirmée." />);
  expect(unknown).toContain("Sans raison confirmée."); expect(unknown).not.toContain("analysis-spinner");
  const unavailable = renderToStaticMarkup(<ConsequenceStatus state="unavailable" fallback="Sans raison confirmée." />);
  expect(unavailable).toContain("vérification n’a pas abouti");
  expect(renderToStaticMarkup(<ConsequenceStatus state="supported" fallback="Sans raison confirmée." />)).toBe("");
  expect(renderToStaticMarkup(<ConsequenceStatus state="idle" fallback="Sans raison confirmée." />)).toBe("");
});
it("annonce une occasion du joueur pour un coup favorable", () => {
  const html = renderToStaticMarkup(<ConsequenceStatus state="extracting" fallback="Inconnue." adverse={false} />);
  expect(html).toContain("Recherche de l’occasion créée par ce coup");
  expect(html).not.toContain("permet à l’adversaire");
});
