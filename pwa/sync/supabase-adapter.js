/**
 * Traduit le moteur hors connexion en requetes Supabase.
 *
 * Le moteur ne connait ni PostgREST ni l'authentification : il demande des changements depuis un
 * point donne, et propose des operations a envoyer. Tout ce qui est propre a Supabase tient ici,
 * pour que le moteur reste testable sans reseau et qu'un changement d'hebergeur ne touche qu'un
 * fichier.
 */

/** Une page de lecture. Au-dela, PostgREST tronque en silence : la pagination n'est pas optionnelle. */
const TAILLE_PAGE = 200;

/**
 * Les tables suivies, et la maniere de reconnaitre une ligne.
 * L'ordre compte a la premiere synchronisation : une inscription ne veut rien dire avant que son
 * groupe et son eleve existent.
 */
export const TABLES_SUIVIES = [
  "classes", "students",
  "class_schedule_slots", "period_activities",
  "unss_students", "unss_groups", "unss_memberships",
  "sport_installations", "equipment"
];

/**
 * @param {object} options
 * @param {string} options.url          racine du projet Supabase
 * @param {string} options.anonKey      cle publique
 * @param {() => object} options.session compte connecte, relu a chaque appel : un jeton expire ou
 *                                       une bascule de compte ne doit pas figer l'adaptateur.
 * @param {string[]} [options.tables]
 */
export function createSupabaseAdapter({ url, anonKey, session, tables = TABLES_SUIVIES }) {
  if (!url || !anonKey || typeof session !== "function") {
    throw new TypeError("Adaptateur Supabase : url, cle et session sont obligatoires");
  }

  function entetes() {
    const jeton = session()?.access_token;
    if (!jeton) throw new Error("Session absente : rien ne peut etre synchronise.");
    return { apikey: anonKey, Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" };
  }

  async function lire(chemin) {
    const reponse = await fetch(`${url}${chemin}`, { headers: entetes() });
    if (reponse.status === 401) throw new Error("Session expiree.");
    if (!reponse.ok) throw new Error(`Lecture refusee (HTTP ${reponse.status}).`);
    return reponse.json();
  }

  /**
   * Renvoie les lignes modifiees depuis le curseur, toutes tables confondues.
   *
   * Le curseur est un couple date + identifiant, et non une date seule : deux lignes enregistrees
   * dans la meme milliseconde seraient sinon departagees au hasard, et la pagination en sauterait
   * une a chaque tour.
   */
  async function pullChanges({ cursor, limit = TAILLE_PAGE } = {}) {
    const depuis = cursor?.updatedAt || "1970-01-01T00:00:00Z";
    const records = [];
    let plusLoin = false;

    for (const table of tables) {
      const filtre = `updated_at=gte.${encodeURIComponent(depuis)}`;
      const lignes = await lire(
        `/rest/v1/${table}?${filtre}&select=*&order=updated_at.asc,id.asc&limit=${limit + 1}`
      );
      if (lignes.length > limit) { plusLoin = true; lignes.length = limit; }
      // Le curseur est inclusif sur la date : on ecarte ce qu'on a deja vu au meme instant.
      lignes
        .filter(ligne => !(cursor && ligne.updated_at === cursor.updatedAt && ligne.id <= cursor.id))
        .forEach(ligne => records.push({
          entity: table,
          id: ligne.id,
          version: ligne.version ?? 0,
          updatedAt: ligne.updated_at,
          deleted: Boolean(ligne.deleted),
          data: ligne
        }));
    }

    records.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || String(a.id).localeCompare(String(b.id)));
    const dernier = records[records.length - 1];
    return {
      records,
      cursor: dernier ? { updatedAt: dernier.updatedAt, id: dernier.id } : cursor,
      hasMore: plusLoin
    };
  }

  /**
   * Envoie une operation. Un refus pour cause de version perimee n'est pas une panne : c'est un
   * conflit, que le moteur doit pouvoir trancher. On le lui rend comme tel, avec la ligne du
   * serveur, plutot que de lever une erreur qui declencherait une reprise sans fin.
   */
  async function pushOperation(operation) {
    const corps = { ...operation.data, id: operation.id, version: operation.baseVersion || undefined };
    if (operation.action === "delete") { corps.deleted = true; corps.data = undefined; }

    // Une version de depart a zero veut dire que la ligne n'existait pas quand elle a ete saisie.
    // Un PATCH ne toucherait alors aucune ligne et repartirait avec un acquittement trompeur : la
    // saisie serait sortie de la file sans jamais atteindre le serveur. On insere donc, en
    // laissant PostgREST fusionner au cas ou la ligne aurait ete creee entre-temps ailleurs.
    const creation = !operation.baseVersion && operation.action !== "delete";
    const cible = creation
      ? `${url}/rest/v1/${operation.entity}`
      : `${url}/rest/v1/${operation.entity}?id=eq.${encodeURIComponent(operation.id)}`;

    const reponse = await fetch(cible, {
      method: creation ? "POST" : "PATCH",
      headers: {
        ...entetes(),
        Prefer: creation ? "resolution=merge-duplicates,return=representation" : "return=representation"
      },
      body: JSON.stringify(nettoyer(corps))
    });

    if (reponse.status === 409 || reponse.status === 400) {
      const texte = await reponse.text();
      if (texte.includes("Version perimee") || texte.includes("40001")) {
        return { status: "conflict", serverRecord: await lireLigne(operation.entity, operation.id) };
      }
      throw new Error(`Enregistrement refuse (HTTP ${reponse.status}).`);
    }
    if (reponse.status === 401) throw new Error("Session expiree.");

    // Un droit refuse n'est pas une panne : reessayer ne changera rien. Traite comme une erreur,
    // l'operation reviendrait indefiniment dans la file, et le professeur verrait une
    // synchronisation qui ne finit jamais sans jamais savoir pourquoi.
    if (reponse.status === 403) {
      return { status: "rejected", reason: "droits insuffisants",
               serverRecord: await lireLigneSiPossible(operation.entity, operation.id) };
    }
    if (!reponse.ok) throw new Error(`Enregistrement refuse (HTTP ${reponse.status}).`);

    const [ligne] = await reponse.json();
    // Une modification qui ne touche aucune ligne repond 200 avec une liste vide : soit la ligne
    // n'existe pas, soit les regles de securite la rendent invisible a ce compte. Dans les deux
    // cas elle ne partira jamais. L'acquitter comme un succes faisait disparaitre la saisie en
    // silence - c'est le pire des cas, celui que personne ne remarque.
    if (!ligne) {
      return { status: "rejected", reason: "ligne absente ou non modifiable par ce compte",
               serverRecord: await lireLigneSiPossible(operation.entity, operation.id) };
    }
    return {
      status: "ok",
      record: { entity: operation.entity, id: ligne.id, version: ligne.version ?? 0,
                updatedAt: ligne.updated_at, deleted: Boolean(ligne.deleted), data: ligne }
    };
  }

  /** Comme lireLigne, mais rend null quand la ligne est illisible : on est deja dans un refus. */
  async function lireLigneSiPossible(table, id) {
    try { return await lireLigne(table, id); } catch { return null; }
  }

  async function lireLigne(table, id) {
    const [ligne] = await lire(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
    if (!ligne) throw new Error("La ligne a disparu du serveur.");
    return { entity: table, id: ligne.id, version: ligne.version ?? 0, updatedAt: ligne.updated_at,
             deleted: Boolean(ligne.deleted), authorId: ligne.user_id || null, data: ligne };
  }

  /** PostgREST refuse les cles inconnues : on n'envoie que ce qui a une valeur. */
  function nettoyer(objet) {
    return Object.fromEntries(Object.entries(objet).filter(([, valeur]) => valeur !== undefined));
  }

  // Le moteur a besoin de connaitre la liste : elle determine ce que le curseur couvre.
  return { pullChanges, pushOperation, lireLigne, tables };
}
