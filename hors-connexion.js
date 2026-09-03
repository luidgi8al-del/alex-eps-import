/*
 * Demarrage du mode hors connexion, commun a toutes les rubriques.
 *
 * Vivait dans equipement.js, parce que les installations ont ete la premiere rubrique raccordee.
 * Ce n'etait plus sa place des que d'autres s'y ajoutent : la liste des tables suivies et le
 * rafraichissement des ecrans concernent tout le site.
 *
 * Script classique, comme les autres fichiers.
 */

/**
 * Les tables qui vivent aussi sur cet ordinateur.
 *
 * On n'ajoute une table qu'une fois ses ecrans raccordes : une table suivie mais lue en direct
 * ferait travailler le moteur pour rien, et une table raccordee mais non suivie ne recevrait
 * jamais les modifications des collegues.
 */
const TABLES_HORS_CONNEXION = ["sport_installations", "classes", "students"];

/** Ce qu'il faut redessiner quand le retard est rattrape, selon l'onglet ouvert. */
function rafraichirApresSynchro() {
  if (currentWebTab === "equipement") loadInstallationsList();
  if (currentWebTab === "classes") loadImports();
}

/**
 * Demarre le mode hors connexion (la partie "application installable" du site).
 *
 * Charge a la demande, et jamais bloquant : une panne de ce cote ne doit pas empecher
 * d'utiliser le site. D'ou le catch silencieux - chaque rubrique raccordee sait retomber sur
 * son fonctionnement d'avant, en direct avec Supabase.
 */
let modeHorsConnexion = null;
async function demarrerModeHorsConnexion() {
  if (modeHorsConnexion) return modeHorsConnexion;
  try {
    const module = await import("./pwa/bootstrap.js");
    modeHorsConnexion = await module.demarrerHorsConnexion({
      url: SUPABASE_URL,
      anonKey: SUPABASE_KEY,
      // Relue a chaque appel : une bascule de compte ne doit pas figer le moteur sur l'ancien.
      session: () => session,
      statusElement: document.getElementById("syncStatus"),
      conflictElement: document.getElementById("conflictPanel"),
      // Miroir des regles de la base : ce qui sera refuse n'entre pas dans la file d'attente.
      droits: droitEcriture,
      // Le reste du site continue de parler a Supabase en direct.
      tables: TABLES_HORS_CONNEXION
    });
    modeHorsConnexion?.surEtat(detail => {
      if (detail.state === "synced") rafraichirApresSynchro();
    });
  } catch (e) {
    console.warn("Mode hors connexion indisponible :", e.message);
    modeHorsConnexion = null;
  }
  return modeHorsConnexion;
}
