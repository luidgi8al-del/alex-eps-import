import { SYNC_EVENT, SYNC_STATE } from "./constants.js";
let lastDetail = Object.freeze({ state: navigator.onLine ? SYNC_STATE.ONLINE : SYNC_STATE.OFFLINE });
export function publishSyncState(state, detail = {}) {
  lastDetail = Object.freeze({ state, at: new Date().toISOString(), ...detail });
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
