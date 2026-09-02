import { subscribeSyncState } from "../core/events.js";
import { SYNC_STATE } from "../core/constants.js";
const LABELS = { [SYNC_STATE.ONLINE]: "En ligne", [SYNC_STATE.OFFLINE]: "Hors connexion", [SYNC_STATE.SYNCING]: "Synchronisation…", [SYNC_STATE.PENDING]: "Modifications en attente", [SYNC_STATE.CONFLICT]: "Conflit à vérifier", [SYNC_STATE.SYNCED]: "Synchronisé", [SYNC_STATE.ERROR]: "Synchronisation interrompue" };
export function mountSyncStatus(element) {
  if (!element) throw new TypeError("Element d'etat absent");
  element.setAttribute("role", "status"); element.setAttribute("aria-live", "polite");
  return subscribeSyncState(detail => {
    const suffix = detail.conflicts ? ` · ${detail.conflicts} conflit(s)` : detail.pending ? ` · ${detail.pending} en attente` : "";
    element.textContent = `${LABELS[detail.state] || detail.state}${suffix}`;
    element.dataset.syncState = detail.state; element.title = detail.message || detail.at || "";
  });
}
