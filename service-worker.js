/*
 * Socle PWA EPS LVH — ressources publiques et préparation explicite hors connexion.
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
importScripts("./offline-assets.js");
const PWA_VERSION = "eps-lvh-pwa-2026-09-26-offline-prepare-1";
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
    self.EPS_OFFLINE_ASSETS.some(asset => new URL(asset, self.registration.scope).pathname === url.pathname) ||
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
      .then(keys => Promise.all(keys.filter(key => key.startsWith("eps-lvh-pwa-") && ![STATIC_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key))))
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
        .catch(async () => (await caches.match(request)) || caches.match(request, { ignoreSearch: true }))
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
  if (event.data?.type === "PWA_VERSION") (event.ports?.[0] || event.source)?.postMessage({ type: "PWA_VERSION", version: PWA_VERSION });
  if (event.data?.type === "PREPARE_OFFLINE") {
    const port = event.ports?.[0];
    if (!port) return;
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(RUNTIME_CACHE);
        let completed = 0;
        for (const asset of self.EPS_OFFLINE_ASSETS) {
          const url = new URL(asset, self.registration.scope);
          if (url.origin !== self.location.origin) throw Error("Ressource externe non autorisée.");
          const response = await fetch(url, {cache:"reload"});
          if (!response.ok || response.redirected) throw Error(`Téléchargement incomplet : ${url.pathname}`);
          await cache.put(url, response);
          port.postMessage({progress:++completed,total:self.EPS_OFFLINE_ASSETS.length});
        }
        port.postMessage({done:true,version:PWA_VERSION});
      } catch (error) { port.postMessage({error:error.message}); }
    })());
  }
  if (event.data?.type === "CHECK_OFFLINE") {
    event.waitUntil((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      let missing = 0;
      for (const asset of self.EPS_OFFLINE_ASSETS) if (!await cache.match(new URL(asset,self.registration.scope))) missing++;
      event.ports?.[0]?.postMessage({ready:missing===0,missing,version:PWA_VERSION});
    })());
  }
});
