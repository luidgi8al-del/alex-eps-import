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
