import { SYNC_EVENT, SYNC_STATE } from "./constants.js";
const LAST_SUCCESS_KEY = "eps:last-successful-sync";
let dernierSucces = null;
try { dernierSucces = localStorage.getItem(LAST_SUCCESS_KEY); } catch { /* stockage indisponible */ }
let compteurs = { pending: 0, conflicts: 0 };
let lastDetail = Object.freeze({ state: navigator.onLine ? SYNC_STATE.ONLINE : SYNC_STATE.OFFLINE,
  ...compteurs, lastSuccessfulAt: dernierSucces });
export function publishSyncState(state, detail = {}) {
  if (detail.pending !== undefined) compteurs.pending = Number(detail.pending || 0);
  if (detail.conflicts !== undefined) compteurs.conflicts = Number(detail.conflicts || 0);
  if (detail.lastSuccessfulAt) {
    dernierSucces = detail.lastSuccessfulAt;
    try { localStorage.setItem(LAST_SUCCESS_KEY, dernierSucces); } catch { /* stockage indisponible */ }
  }
  lastDetail = Object.freeze({ state, at: new Date().toISOString(), ...compteurs,
    lastSuccessfulAt: dernierSucces, ...detail });
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: lastDetail }));
  return lastDetail;
}
export function subscribeSyncState(listener, { immediate = true } = {}) {
  const handler = event => listener(event.detail);
  window.addEventListener(SYNC_EVENT, handler);
  if (immediate) listener(lastDetail);
  return () => window.removeEventListener(SYNC_EVENT, handler);
}
export function currentSyncState() { return lastDetail; }
