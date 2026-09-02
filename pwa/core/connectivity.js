import { publishSyncState } from "./events.js";
import { SYNC_STATE } from "./constants.js";
let started = false;
export function startConnectivityMonitor({ onReconnect } = {}) {
  if (started) return () => {};
  started = true;
  const online = () => { publishSyncState(SYNC_STATE.ONLINE); onReconnect?.(); };
  const offline = () => publishSyncState(SYNC_STATE.OFFLINE);
  window.addEventListener("online", online, { passive: true });
  window.addEventListener("offline", offline, { passive: true });
  publishSyncState(navigator.onLine ? SYNC_STATE.ONLINE : SYNC_STATE.OFFLINE);
  return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); started = false; };
}
export function isOnline() { return navigator.onLine; }

/**
 * Distingue une coupure reseau d'un refus du serveur.
 *
 * navigator.onLine ment : dans une fenetre installee, couper le wifi ne le fait pas toujours
 * passer a false, et l'evenement "online" ne se declenche alors jamais au retour. L'echec du
 * fetch lui-meme est le signal le plus fiable dont on dispose. La difference n'est pas
 * cosmetique : une coupure se dit "hors connexion, vos saisies attendent", une panne serveur se
 * dit "synchronisation interrompue" - et la premiere ne doit pas alarmer.
 */
export function estPanneReseau(erreur) {
  if (!erreur) return false;
  if (erreur.name === "TypeError") return true;
  return /failed to fetch|networkerror|load failed|network request failed/i
    .test(String(erreur.message || erreur));
}
