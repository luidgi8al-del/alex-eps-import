import { registerServiceWorker } from "./core/register.js";
import { startConnectivityMonitor, isOnline } from "./core/connectivity.js";
import { subscribeSyncState } from "./core/events.js";
import { OfflineSyncEngine } from "./sync/engine.js";
import { createSupabaseAdapter } from "./sync/supabase-adapter.js";
import { saveOfflineEdit, saveOfflineDeletion } from "./sync/local-edits.js";
import { listLocalRecords, removeAllLocalData } from "./storage/records.js";
import { mountSyncStatus } from "./ui/sync-status.js";
import { mountConflictDialog } from "./ui/conflict-dialog.js";

/**
 * Point d'entree unique du mode hors connexion.
 *
 * Tout ce que la page a besoin de savoir tient ici : elle appelle demarrerHorsConnexion une fois,
 * puis passe par l'objet rendu pour lire, enregistrer et supprimer. Le reste - moteur, file
 * d'attente, fusion, conflits - lui reste invisible et peut changer sans qu'elle bouge.
 *
 * Le raccordement se fait rubrique par rubrique. Une rubrique non raccordee continue de parler
 * directement a Supabase comme avant : rien ne casse pendant la transition.
 */
/** Intervalle des reprises automatiques quand il reste quelque chose a envoyer. */
const RELANCE_MS = 15000;

let etat = null;

export async function demarrerHorsConnexion({
  url, anonKey, session, statusElement, conflictElement, tables, onConflitsChanges, droits
} = {}) {
  if (etat) return etat;

  // Soupape de secours : ouvrir la page avec ?pwa-off retire le service worker et vide ses caches.
  // Un service worker installe survit a tout, y compris a une mise en ligne ratee ; sans cette
  // porte de sortie, un collegue bloque n'aurait aucun recours a distance.
  if (new URLSearchParams(location.search).has("pwa-off")) {
    const inscriptions = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(inscriptions.map(i => i.unregister()));
    const cles = (await caches?.keys?.()) || [];
    await Promise.all(cles.map(cle => caches.delete(cle)));
    return null;
  }

  const adapter = createSupabaseAdapter({ url, anonKey, session, tables });
  const engine = new OfflineSyncEngine({ adapter });

  startConnectivityMonitor({ onReconnect: () => engine.sync().catch(() => {}) });
  if (statusElement) mountSyncStatus(statusElement);
  // mountConflictDialog rend la fonction qui redessine la liste : on la garde pour pouvoir
  // reafficher les conflits sans remonter tout le dialogue.
  const afficherConflits = conflictElement
    ? mountConflictDialog(conflictElement, { onResolved: () => engine.sync().catch(() => {}) })
    : null;
  registerServiceWorker("./service-worker.js").catch(() => {});

  /**
   * Rapproche la copie locale du serveur, sans jamais faire echouer l'appelant.
   *
   * Une synchronisation ratee n'est pas une erreur d'affichage : la copie locale reste lisible,
   * et l'indicateur d'etat dit deja ce qui se passe. Lever ici masquerait la liste entiere pour
   * une coupure de trois secondes.
   */
  async function rapprocher() {
    if (!isOnline()) return false;
    try { await engine.sync(); return true; } catch { return false; }
  }

  // Filet de securite : dans une fenetre installee, couper puis retablir le wifi ne declenche pas
  // toujours l'evenement "online". Sans cette relance, une saisie pouvait rester en attente
  // jusqu'au prochain geste de l'utilisateur, qui n'avait aucune raison de le deviner.
  let enRetard = false;
  subscribeSyncState(detail => {
    enRetard = Boolean(detail.pending) || detail.state === "offline" || detail.state === "error";
  });
  setInterval(() => { if (enRetard) rapprocher(); }, RELANCE_MS);

  /**
   * Leve si le compte n'a pas le droit d'ecrire, avec le message a afficher.
   *
   * Une creation et une modification se ressemblent trop pour etre distinguees ici : on demande
   * les deux gestes et on accepte si l'un des deux est permis. La base tranchera le cas exact.
   */
  function verifierDroit(entity, ...gestes) {
    if (typeof droits !== "function") return;
    for (const geste of gestes) {
      const verdict = droits(entity, geste);
      if (verdict === true || verdict === undefined) return;
    }
    const message = droits(entity, gestes[0]);
    throw new Error(typeof message === "string" ? message : "Action non autorisée pour ce compte.");
  }

  etat = {
    engine,
    adapter,

    /** Synchronise maintenant. Sans reseau, le moteur se contente d'annoncer l'attente. */
    synchroniser: () => engine.sync(),

    /**
     * Lit une table depuis la copie locale, apres l'avoir rapprochee du serveur si possible.
     *
     * La copie locale est la seule source d'affichage, meme connecte. C'est ce qui fait qu'une
     * saisie faite hors ligne reste visible : lire le serveur en direct la ferait disparaitre de
     * l'ecran jusqu'a son envoi, et personne ne comprendrait ou est passee sa ligne.
     */
    async lire(entity) {
      const synchronise = await rapprocher();
      const locales = await listLocalRecords(entity);
      return { source: synchronise ? "reseau" : "local", rows: locales.map(r => r.data) };
    },

    /**
     * Enregistre une modification : elle part tout de suite si le reseau est la, sinon elle attend.
     *
     * Le droit est verifie avant la mise en file. Une saisie que le serveur refusera n'a rien a
     * faire dans la file d'attente : elle y resterait jusqu'au retour du reseau pour n'etre
     * refusee que la, longtemps apres que le professeur soit passe a autre chose. Ce n'est pas
     * une securite - la vraie interdiction est dans la base - c'est une question d'honnetete
     * envers celui qui saisit.
     */
    async enregistrer(entity, id, data) {
      verifierDroit(entity, "creer", "modifier");
      const resultat = await saveOfflineEdit({ entity, id, data, authorId: session()?.user_id });
      rapprocher();
      return resultat;
    },

    async supprimer(entity, id) {
      verifierDroit(entity, "supprimer");
      const resultat = await saveOfflineDeletion({ entity, id, authorId: session()?.user_id });
      rapprocher();
      return resultat;
    },

    /** Reaffiche les conflits en attente (apres un retour sur l'onglet, par exemple). */
    rafraichirConflits: () => afficherConflits?.(),

    /**
     * A la deconnexion ou au changement de compte : sinon le collegue suivant, sur le meme
     * ordinateur, verrait les donnees du precedent.
     */
    async oublierDonneesLocales() { return removeAllLocalData(); },

    surEtat: subscribeSyncState
  };

  if (typeof onConflitsChanges === "function") {
    subscribeSyncState(detail => onConflitsChanges(detail.conflicts || 0));
  }

  rapprocher();
  return etat;
}

export function horsConnexion() { return etat; }
