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
/*
 * L'ordre compte : les tables sont descendues l'une apres l'autre, et un ecran ne peut rien
 * afficher avant que la sienne soit arrivee. Le repertoire des eleves passait avant les creneaux
 * du planning : sur une copie neuve, il fallait attendre plus d'un millier de fiches pour voir
 * apparaitre un emploi du temps qui en compte quelques dizaines.
 *
 * Les petites tables d'abord, donc, et les grosses a la fin. Le planning et les cours
 * apparaissent en quelques secondes, le reste se remplit derriere sans qu'on l'attende.
 */
const TABLES_HORS_CONNEXION = [
  // Planning : peu de lignes, et c'est le premier ecran qu'on ouvre.
  "sport_installations", "classes", "class_schedule_slots", "period_activities",
  // Cours : cycles, grilles et criteres. C'est ici que le hors connexion sert le plus - on note
  // une classe sur un terrain, pas devant un ordinateur.
  "cycles", "evaluations", "evaluation_criteria",
  // Les deux plus grosses, gardees pour la fin : un millier d'eleves, et une note par eleve et
  // par critere.
  "students", "evaluation_scores"
];

/**
 * Deuxieme vague : ASLVH, tests EPS, sante, equipement, programmation.
 *
 * Elle ne s'allume que si schema_hors_connexion_2.sql a ete applique. Ce fichier pose les
 * colonnes manquantes et, surtout, l'index (updated_at, id) de chaque table. Sans cet index la
 * base parcourt et trie la table entiere a chaque page : c'est ce qui a mis l'instance a genoux
 * dans la nuit du 3 au 4 septembre 2026, quatre tables ayant ete raccordees sans lui.
 *
 * D'ou la marque plutot qu'un simple commentaire d'avertissement : le code peut etre publie avant
 * que le SQL soit passe, sans rien risquer, et le raccordement s'allume de lui-meme ensuite.
 * Personne n'a a se souvenir de l'ordre des operations.
 */
const TABLES_HORS_CONNEXION_VAGUE_2 = [
  // Meme principe : les petites d'abord.
  "unss_groups", "unss_slots", "unss_memberships", "unss_sessions",
  "eps_test_sessions",
  "health_dispensations", "health_accidents",
  "equipment", "epi_items", "epi_inspections", "installation_conflict_overrides",
  "official_programs", "annual_plan_blocks", "institution_calendar_events", "eps_period_dates",
  // Les volumineuses en dernier : le repertoire AS, l'appel et les resultats de tests.
  "unss_students", "unss_attendance", "eps_test_results"
];

/** Vrai si schema_hors_connexion_2.sql a ete applique sur cette base. */
async function schemaVague2Applique() {
  try {
    const res = await apiFetch(
      `${SUPABASE_URL}/rest/v1/eps_schema_marks?name=eq.hors_connexion_2&select=name`);
    if (!res.ok) return false;
    return (await res.json()).length > 0;
  } catch {
    // Pas de reseau, pas de table, pas de droit : dans le doute on n'allume pas.
    return false;
  }
}

/**
 * Lecture et ecriture sans que l'appelant ait a savoir si la table est suivie.
 *
 * Chaque rubrique raccordee repetait le meme bloc : "si le mode hors connexion existe, lire la
 * copie locale, sinon interroger le serveur". Ce bloc a maintenant une autre raison d'exister :
 * la deuxieme vague de tables ne s'allume qu'une fois schema_hors_connexion_2.sql applique, donc
 * une meme table est lue localement ou en direct selon l'etat de la base. L'ecrire a la main dans
 * chaque fonction, c'etait la garantie d'en oublier un.
 *
 * Le chemin direct reste obligatoire : c'est lui qui sert tant que la table n'est pas suivie.
 */
function tableSuivie(entite) {
  return Boolean(modeHorsConnexion?.adapter?.tables?.includes(entite));
}

/**
 * @param {string} entite table
 * @param {string} cheminDirect chemin PostgREST complet, filtres compris, pour la lecture serveur
 * @param {{ou?: Function, trier?: Function}} [options] filtre et tri appliques a la copie locale
 */
async function lireTable(entite, cheminDirect, { ou, trier } = {}) {
  if (tableSuivie(entite)) {
    const lecture = await modeHorsConnexion.lire(entite, { ou, trier });
    return lecture.rows;
  }
  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/${cheminDirect}`);
  return res.ok ? await res.json() : [];
}

/**
 * Enregistre une ligne complete. Hors connexion elle attend dans la file ; sinon elle part.
 *
 * Leve si le compte n'a pas le droit : le message doit s'afficher la ou l'on vient de cliquer,
 * pas plus tard.
 */
async function enregistrerLigne(entite, ligne) {
  if (tableSuivie(entite)) return modeHorsConnexion.enregistrer(entite, ligne.id, ligne);
  const existe = await apiFetch(`${SUPABASE_URL}/rest/v1/${entite}?id=eq.${encodeURIComponent(ligne.id)}&select=id`);
  const dejaLa = existe.ok && (await existe.json()).length > 0;
  if (dejaLa) {
    return apiFetch(`${SUPABASE_URL}/rest/v1/${entite}?id=eq.${encodeURIComponent(ligne.id)}`,
      { method: "PATCH", body: JSON.stringify(ligne) });
  }
  return apiFetch(`${SUPABASE_URL}/rest/v1/${entite}`, { method: "POST", body: JSON.stringify(ligne) });
}

/** Efface une ligne. L'effacement laisse une trace : sans elle, la ligne reviendrait. */
async function supprimerLigne(entite, id) {
  if (tableSuivie(entite)) return modeHorsConnexion.supprimer(entite, id);
  return apiFetch(`${SUPABASE_URL}/rest/v1/${entite}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() })
  });
}

/** Ce qu'il faut redessiner quand le retard est rattrape, selon l'onglet ouvert. */
function rafraichirApresSynchro() {
  if (currentWebTab === "equipement") { loadInstallationsList(); loadEquipmentList?.(); loadEpiList?.(); }
  if (currentWebTab === "classes") loadImports();
  if (currentWebTab === "planning" || currentWebTab === "programmation") renderPlanningTab();
  if (currentWebTab === "unss") rafraichirAslvhApresSynchro?.();
  if (currentWebTab === "health") rafraichirSanteApresSynchro?.();
  if (currentWebTab === "outils") rafraichirOutilsApresSynchro?.();
}

/**
 * Demarre le mode hors connexion (la partie "application installable" du site).
 *
 * Charge a la demande, et jamais bloquant : une panne de ce cote ne doit pas empecher
 * d'utiliser le site. D'ou le catch silencieux - chaque rubrique raccordee sait retomber sur
 * son fonctionnement d'avant, en direct avec Supabase.
 */
let modeHorsConnexion = null;
/** Cadence de rafraichissement pendant une synchronisation en cours. */
const DELAI_RAFRAICHISSEMENT_MS = 1500;
let dernierRafraichissement = 0;
async function demarrerModeHorsConnexion() {
  if (modeHorsConnexion) return modeHorsConnexion;
  try {
    const tablesSuivies = (await schemaVague2Applique())
      ? [...TABLES_HORS_CONNEXION, ...TABLES_HORS_CONNEXION_VAGUE_2]
      : TABLES_HORS_CONNEXION;
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
      tables: tablesSuivies
    });
    modeHorsConnexion?.surEtat(detail => {
      if (detail.state === "synced") { dernierRafraichissement = 0; rafraichirApresSynchro(); return; }
      // Pendant une longue premiere lecture, l'ecran restait vide jusqu'au bout, puis se
      // remplissait d'un coup. On le redessine au fil de l'eau, sans le faire a chaque page :
      // le rendu coute plus cher que la lecture qui vient de l'alimenter.
      if (detail.state === "syncing" && detail.lues) {
        const maintenant = Date.now();
        if (maintenant - dernierRafraichissement < DELAI_RAFRAICHISSEMENT_MS) return;
        dernierRafraichissement = maintenant;
        rafraichirApresSynchro();
      }
    });
  } catch (e) {
    console.warn("Mode hors connexion indisponible :", e.message);
    modeHorsConnexion = null;
  }
  return modeHorsConnexion;
}
