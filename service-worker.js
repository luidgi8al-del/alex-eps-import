/*
 * Socle PWA EPS LVH — volontairement inactif tant qu'index.html ne l'enregistre pas.
 *
 * Politique prudente : l'interface peut fonctionner hors ligne, mais aucune reponse Supabase,
 * requete POST, donnee d'eleve ou information authentifiee n'est mise en cache.
 *
 * Le code de l'application est pris SUR LE RESEAU en priorite, le cache ne servant que de filet
 * hors connexion. La version precedente faisait l'inverse pour le CSS et le JavaScript : apres une
 * mise en ligne, la page servait l'ancien code jusqu'au chargement suivant, et pouvait meme
 * afficher un index.html neuf avec des scripts perimes. Une equipe qui corrige son planning le
 * matin doit voir la correction le matin.
 */
const PWA_VERSION = "eps-lvh-pwa-2026-09-03";
const STATIC_CACHE = `${PWA_VERSION}-static`;
const RUNTIME_CACHE = `${PWA_VERSION}-runtime`;

/*
 * Seulement ce qui ne change pas d'une mise en ligne a l'autre. index.html, le CSS et le
 * JavaScript en sont volontairement absents : les precharger reviendrait a figer une version.
 */
const STATIC_ASSETS = [
  "./offline.html",
  "./manifest.webmanifest",
  "./icons/eps-lvh-192.svg",
  "./icons/eps-lvh-512.svg",
  "./icons/eps-lvh-maskable.svg"
];

const PRIVATE_HOSTS = ["supabase.co", "supabase.in", "open-meteo.com"];

function isPrivateOrRemoteApi(url) {
  return PRIVATE_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

/** Le code et les contenus de l'application : toujours le reseau d'abord. */
function isAppCode(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return false;
  return ["style", "script"].includes(request.destination) ||
    /\/content\/[^/]+\.json$/i.test(url.pathname);
}

/** Ce qui ne bouge pas : le cache d'abord, sans rien perdre en fraicheur. */
function isImmutableAsset(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return false;
  return ["image", "font"].includes(request.destination);
}

async function cacheResponse(cacheName, request, response) {
  if (!response || !response.ok) return response;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", event => {
  // Prendre la main tout de suite : sans cela, une version corrigee attend que tous les onglets
  // soient fermes, ce qui peut durer des jours sur un ordinateur de salle des profs.
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)));
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

  // La page elle-meme : reseau d'abord, cache en secours hors connexion.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => cacheResponse(RUNTIME_CACHE, new Request("./index.html"), response))
        .catch(async () => (await caches.match("./index.html")) || caches.match("./offline.html"))
    );
    return;
  }

  // Le code de l'application : reseau d'abord, pour qu'une correction arrive au prochain chargement.
  if (isAppCode(request, url)) {
    event.respondWith(
      fetch(request)
        .then(response => cacheResponse(RUNTIME_CACHE, request, response))
        .catch(() => caches.match(request))
    );
    return;
  }

  // Images et polices : elles ne changent pas, le cache suffit et evite des allers-retours.
  if (isImmutableAsset(request, url)) {
    event.respondWith(
      caches.match(request).then(cached =>
        cached || fetch(request).then(response => cacheResponse(RUNTIME_CACHE, request, response)))
    );
  }
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "PWA_VERSION") event.source?.postMessage({ type: "PWA_VERSION", version: PWA_VERSION });
});
