/**
 * Enregistrement du service worker, avec reprise de la main a la mise en ligne suivante.
 *
 * Un service worker mal accompagne fige l'application : la version installee continue de servir
 * l'ancien code, et l'utilisateur ne voit pas les corrections. Trois precautions ici :
 *
 *   - le service worker prend la main des son installation (skipWaiting cote worker) ;
 *   - la page se recharge une fois, et une seule, quand un nouveau worker prend le controle ;
 *   - on cherche une mise a jour au retour au premier plan, pour ne pas dependre d'une fermeture
 *     d'onglet qui n'arrive jamais sur un ordinateur de salle des profs.
 *
 * Sans reseau, rien de tout cela ne s'execute : l'enregistrement echoue en silence et
 * l'application fonctionne comme avant.
 */
let rechargementEnCours = false;

export async function registerServiceWorker(chemin = "./service-worker.js") {
  if (!("serviceWorker" in navigator)) return null;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Une seule fois : sans ce garde-fou, deux workers qui se succedent boucleraient les
    // rechargements et l'application deviendrait inutilisable.
    if (rechargementEnCours) return;
    rechargementEnCours = true;
    window.location.reload();
  });

  try {
    const inscription = await navigator.serviceWorker.register(chemin);
    // Un ordinateur reste ouvert des jours : on verifie au retour sur l'onglet plutot qu'au seul
    // demarrage, sinon une correction pourrait attendre la semaine suivante.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") inscription.update().catch(() => {});
    });
    return inscription;
  } catch {
    return null;
  }
}

/** Version du service worker actif, utile pour verifier ce qui tourne reellement. */
export function activeServiceWorkerVersion(timeoutMs = 1500) {
  return new Promise(resolve => {
    const worker = navigator.serviceWorker?.controller;
    if (!worker) return resolve(null);
    const canal = new MessageChannel();
    const minuteur = setTimeout(() => resolve(null), timeoutMs);
    canal.port1.onmessage = event => { clearTimeout(minuteur); resolve(event.data?.version ?? null); };
    worker.postMessage({ type: "PWA_VERSION" }, [canal.port2]);
  });
}
