import { subscribeSyncState } from "../core/events.js";
import { SYNC_STATE } from "../core/constants.js";

const LABELS = {
  [SYNC_STATE.ONLINE]: "Connexion disponible",
  [SYNC_STATE.OFFLINE]: "Hors connexion",
  [SYNC_STATE.SYNCING]: "Synchronisation en cours",
  [SYNC_STATE.PENDING]: "Envoi en attente",
  [SYNC_STATE.CONFLICT]: "Saisies à vérifier",
  [SYNC_STATE.SYNCED]: "Enregistrements synchronisés",
  [SYNC_STATE.ERROR]: "Synchronisation interrompue"
};

/** A network connection is not an acknowledgement, nor a save of the open form. */
export function describeSyncStatus(detail = {}, online = navigator.onLine) {
  const count = value => Math.max(0, Math.floor(Number(value) || 0));
  const pending = count(detail.pending), conflicts = count(detail.conflicts);
  let state = detail.state;
  if (conflicts) state = SYNC_STATE.CONFLICT;
  else if (!online) state = SYNC_STATE.OFFLINE;
  else if (pending && [SYNC_STATE.ONLINE, SYNC_STATE.SYNCED].includes(state)) state = SYNC_STATE.PENDING;
  const kept = pending ? `${pluriel(pending, "modification conservée", "modifications conservées")} sur cet appareil. ` : "";
  const messages = {
    [SYNC_STATE.ONLINE]: "La connexion est disponible ; la vérification des enregistrements est en cours.",
    [SYNC_STATE.OFFLINE]: pending
      ? `${kept}L’envoi reprendra automatiquement au retour du réseau. Ne ressaisissez pas ces modifications.`
      : "Sans réseau. Utilisez Enregistrer pour conserver vos nouvelles saisies sur cet appareil.",
    [SYNC_STATE.PENDING]: `${kept}L’envoi est en attente. Vous pouvez réessayer sans ressaisir.`,
    [SYNC_STATE.SYNCING]: `${kept}Vérification et envoi en cours ; ne ressaisissez pas les modifications en attente.`,
    [SYNC_STATE.SYNCED]: "Les modifications enregistrées sont synchronisées. Une saisie encore ouverte doit toujours être enregistrée.",
    [SYNC_STATE.CONFLICT]: `${kept}Ouvrez les saisies à vérifier dans Réglage → Compte web / synchronisation pour comparer les versions conservées.`,
    [SYNC_STATE.ERROR]: `${kept}L’envoi n’est pas confirmé. Réessayez ; si le problème persiste, vérifiez votre compte dans Réglage → Compte web / synchronisation.`
  };
  let message = messages[state] || "Vérifiez l’état de votre compte dans Réglage → Compte web / synchronisation.";
  if (state === SYNC_STATE.ERROR && /401|jwt|token|session|authent|connectez|connexion expir/i.test(String(detail.message || ""))) {
    message = `${kept}La connexion à votre compte doit être vérifiée dans Réglage → Compte web / synchronisation. Ne supprimez pas les données de cet appareil.`;
  }
  return { state, pending, conflicts, label: LABELS[state] || "État de la synchronisation", message,
    retry: online && !conflicts && [SYNC_STATE.OFFLINE, SYNC_STATE.ERROR, SYNC_STATE.PENDING].includes(state) };
}

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
  const aide = document.createElement("span");
  aide.className = "syncStatusHelp";
  aide.style.cssText = "font-size:11px;white-space:normal;line-height:1.4";
  informations.append(titre, details, aide);
  const relancer = document.createElement("button");
  relancer.type = "button";
  relancer.className = "syncStatusRetry";
  relancer.textContent = "Réessayer";
  relancer.hidden = true;
  element.append(pastille, informations, relancer);
  return { titre, details, aide, relancer };
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
    catch {
      // A failed retry must not itself become an unhandled promise rejection.
      vue.aide.textContent = "La vérification n’a pas abouti. Ne ressaisissez pas les modifications en attente ; vérifiez votre compte dans Réglage → Compte web / synchronisation.";
    }
    finally {
      vue.relancer.disabled = false;
      vue.relancer.textContent = "Réessayer";
    }
  });

  const desabonner = subscribeSyncState(detail => {
    dernierDetail = detail;
    const status = describeSyncStatus(detail);
    const { pending, conflicts } = status;
    vue.titre.textContent = status.label;
    vue.aide.textContent = status.message;
    vue.details.textContent = [
      pluriel(pending, "modification en attente", "modifications en attente"),
      pluriel(conflicts, "conflit", "conflits"),
      `dernière réussite ${heureLisible(detail.lastSuccessfulAt)}`
    ].join(" · ");
    vue.relancer.hidden = !status.retry || typeof onRetry !== "function";
    element.dataset.syncState = status.state;
    element.dataset.pending = String(pending);
    element.dataset.conflicts = String(conflicts);
    element.title = `${status.message} ${vue.details.textContent}`;
    element.classList.toggle("syncStatusHasConflicts", conflicts > 0);
  });

  return { desabonner, detail: () => dernierDetail };
}
