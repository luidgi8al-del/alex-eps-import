import { subscribeSyncState } from "../core/events.js";
import { SYNC_STATE } from "../core/constants.js";

const LABELS = {
  [SYNC_STATE.ONLINE]: "Connexion disponible",
  [SYNC_STATE.OFFLINE]: "Hors connexion",
  [SYNC_STATE.SYNCING]: "Synchronisation en cours",
  [SYNC_STATE.PENDING]: "Envoi en attente",
  [SYNC_STATE.CONFLICT]: "Conflit à vérifier",
  [SYNC_STATE.SYNCED]: "Tout est synchronisé",
  [SYNC_STATE.ERROR]: "Synchronisation interrompue"
};

function pluriel(nombre, singulier, plurielValeur = `${singulier}s`) {
  return `${nombre} ${nombre > 1 ? plurielValeur : singulier}`;
}

function heureLisible(valeur) {
  if (!valeur) return "pas encore effectuée";
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return "pas encore effectuée";
  const memeJour = date.toDateString() === new Date().toDateString();
  return memeJour
    ? `aujourd’hui à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
    : date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function construireStructure(element) {
  element.replaceChildren();
  const pastille = document.createElement("span");
  pastille.className = "syncStatusDot";
  pastille.setAttribute("aria-hidden", "true");
  const informations = document.createElement("span");
  informations.className = "syncStatusInfo";
  const titre = document.createElement("strong");
  titre.className = "syncStatusLabel";
  const details = document.createElement("span");
  details.className = "syncStatusDetails";
  informations.append(titre, details);
  const relancer = document.createElement("button");
  relancer.type = "button";
  relancer.className = "syncStatusRetry";
  relancer.textContent = "Réessayer";
  relancer.hidden = true;
  element.append(pastille, informations, relancer);
  return { titre, details, relancer };
}

/** Affiche un état utile à un professeur, et non l'état brut du moteur. */
export function mountSyncStatus(element, { onRetry } = {}) {
  if (!element) throw new TypeError("Element d'etat absent");
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  const vue = construireStructure(element);
  let dernierDetail = null;

  vue.relancer.addEventListener("click", async event => {
    event.stopPropagation();
    if (typeof onRetry !== "function" || vue.relancer.disabled) return;
    vue.relancer.disabled = true;
    vue.relancer.textContent = "Nouvel essai…";
    try { await onRetry(); }
    finally {
      vue.relancer.disabled = false;
      vue.relancer.textContent = "Réessayer";
    }
  });

  const desabonner = subscribeSyncState(detail => {
    dernierDetail = detail;
    const pending = Number(detail.pending || 0);
    const conflicts = Number(detail.conflicts || 0);
    vue.titre.textContent = LABELS[detail.state] || "État de la synchronisation";
    vue.details.textContent = [
      pluriel(pending, "modification en attente", "modifications en attente"),
      pluriel(conflicts, "conflit", "conflits"),
      `dernière réussite ${heureLisible(detail.lastSuccessfulAt)}`
    ].join(" · ");
    const repriseUtile = [SYNC_STATE.OFFLINE, SYNC_STATE.ERROR, SYNC_STATE.PENDING].includes(detail.state) || pending > 0;
    vue.relancer.hidden = !repriseUtile;
    element.dataset.syncState = detail.state;
    element.dataset.pending = String(pending);
    element.dataset.conflicts = String(conflicts);
    element.title = detail.message || vue.details.textContent;
    element.classList.toggle("syncStatusHasConflicts", conflicts > 0);
  });

  return { desabonner, detail: () => dernierDetail };
}
