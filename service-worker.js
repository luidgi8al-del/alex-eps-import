/*
 * Socle PWA EPS LVH — volontairement inactif tant qu'index.html ne l'enregistre pas.
 * Politique prudente : l'interface statique peut fonctionner hors ligne, mais aucune reponse
 * Supabase, requete POST, donnee d'eleve ou information authentifiee n'est mise en cache.
 */
const PWA_VERSION = "eps-lvh-pwa-preview-v1";
const STATIC_CACHE = `${PWA_VERSION}-static`;
const RUNTIME_CACHE = `${PWA_VERSION}-runtime`;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./home-navigation.css",
  "./quick-exercises.js",
  "./eps-tests.js",
  "./planning-scroll.js",
  "./sync-safety.js",
  "./school-levels.js",
  "./period-settings.js",
  "./health.js",
  "./student-fields.js",
  "./teacher-settings.js",
  "./home-weather.js",
  "./icons/eps-lvh-192.svg",
  "./icons/eps-lvh-512.svg",
  "./icons/eps-lvh-maskable.svg"
];

const PRIVATE_HOSTS = ["supabase.co", "supabase.in", "open-meteo.com"];

function isPrivateOrRemoteApi(url) {
  return PRIVATE_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

function isCacheableStatic(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return false;
  return ["style", "script", "image", "font"].includes(request.destination) ||
    /\/content\/[^/]+\.json$/i.test(url.pathname);
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => ![STATIC_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Les ecritures et les donnees distantes restent exclusivement gerees par l'application.
  if (request.method !== "GET" || isPrivateOrRemoteApi(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(RUNTIME_CACHE).then(cache => cache.put("./index.html", response.clone()));
          return response;
        })
        .catch(async () => (await caches.match("./index.html")) || caches.match("./offline.html"))
    );
    return;
  }

  if (isCacheableStatic(request, url)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const refresh = fetch(request).then(response => {
          if (response.ok) caches.open(RUNTIME_CACHE).then(cache => cache.put(request, response.clone()));
          return response;
        }).catch(() => cached);
        return cached || refresh;
      })
    );
  }
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "PWA_VERSION") event.source?.postMessage({ type: "PWA_VERSION", version: PWA_VERSION });
});
