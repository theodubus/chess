// Placé en tête de la page de la version web : installe `coi-sw.js` et
// recharge UNE fois, pour que la page passe sous son contrôle et devienne
// isolée. Sans service worker — navigation privée de Firefox, contexte non
// sécurisé —, la page reste telle quelle et le moteur prend le repli à un
// fil.
(() => {
  if (window.crossOriginIsolated || !window.isSecureContext) return;
  if (!("serviceWorker" in navigator)) return;
  const once = "shallowred.coi-reload";
  const reload = () => {
    try {
      // Une page déjà rechargée qui n'est toujours pas isolée : le
      // navigateur refuse l'isolation, et boucler n'y changerait rien.
      if (sessionStorage.getItem(once)) return;
      sessionStorage.setItem(once, "1");
    } catch {
      return;
    }
    location.reload();
  };
  navigator.serviceWorker.register("./coi-sw.js").then(
    (registration) => {
      if (!registration) return;
      if (navigator.serviceWorker.controller) reload();
      else if (registration.active && !registration.installing) reload();
      else
        navigator.serviceWorker.addEventListener("controllerchange", reload, {
          once: true,
        });
    },
    () => {},
  );
})();
