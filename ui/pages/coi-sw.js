// L'isolation de la version web (GitHub Pages).
//
// Un navigateur ne donne la mémoire partagée — et donc les fils du moteur —
// qu'à une page servie avec deux en-têtes, COOP et COEP. GitHub Pages ne
// permet pas de les poser : ce service worker les ajoute lui-même à chaque
// réponse du site. Il ne fait rien d'autre, ni cache ni réécriture, et
// n'intervient pas pendant une partie.
//
// `require-corp` plutôt que `credentialless`, que Safari ne garantit pas : le
// site ne charge rien d'une autre origine.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Une requête que le navigateur ne laisse servir que depuis son cache.
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
  event.respondWith(
    fetch(request).then((response) => {
      if (response.status === 0) return response;
      const headers = new Headers(response.headers);
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }),
  );
});
