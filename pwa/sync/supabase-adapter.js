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

/** Ce que le serveur a repondu, ramene a une ligne lisible. */
function explicationServeur(texte) {
  if (!texte) return "le serveur n'a donne aucune raison";
  try {
    const detail = JSON.parse(texte);
    return [detail.message, detail.details, detail.hint].filter(Boolean).join(" — ") || texte.slice(0, 200);
  } catch {
    return texte.slice(0, 200);
  }
}

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
   * Renvoie les lignes modifiees depuis le curseur, table par table.
   *
   * Un curseur PAR TABLE, et non un curseur global. Avec un curseur unique, il avancait jusqu'a
   * la ligne la plus recente vue toutes tables confondues : des qu'une table portait des lignes
   * plus recentes qu'une autre, le reste de la seconde etait saute pour toujours. C'est ce qui a
   * vide le planning, puis fait disparaitre les creneaux d'une partie des collegues - une table
   * partagee par tout un etablissement depasse la taille d'une page des le premier jour.
   *
   * Chaque curseur est un couple date + identifiant, et non une date seule : deux lignes
   * enregistrees dans la meme milliseconde seraient sinon departagees au hasard, et la
   * pagination en sauterait une a chaque tour.
   */
  async function pullChanges({ cursor, limit = TAILLE_PAGE } = {}) {
    // Un curseur de l'ancienne forme (une seule date pour tout) n'est pas rattrapable : on
    // repart de zero une fois, ce qui repare au passage les copies locales incompletes.
    const parTable = (cursor && typeof cursor === "object" && !cursor.updatedAt) ? cursor : {};
    const suivants = { ...parTable };
    const records = [];
    let plusLoin = false;

    for (const table of tables) {
      const repere = parTable[table];
      // Pagination sur le couple (date, identifiant), et non sur la date seule.
      //
      // Un import en masse ecrit toutes ses lignes au meme instant : dans une transaction
      // Postgres, now() ne bouge pas. Un repertoire d'un millier d'eleves importe d'un coup, ce
      // sont mille lignes portant la meme date. Une page se remplissait alors sans que la date
      // avance d'une seconde, le serveur renvoyait indefiniment les memes lignes, et la
      // synchronisation tournait sans fin : l'entete restait sur "Synchronisation..." et les
      // rubriques sur "Chargement". Demander ce qui vient strictement apres le couple lu fait
      // avancer le repere a chaque page, quel que soit le nombre de lignes partageant sa date.
      // Les valeurs sont encodees, les guillemets et la ponctuation du filtre ne le sont pas :
      // c'est cette ponctuation qui porte la structure. Une date Postgres s'ecrit
      // 2026-09-01T10:00:00+00:00, et un "+" non encode se relit comme une espace dans une URL :
      // la date devenait invalide et le serveur refusait la requete.
      // Un repere sans date ne vaut rien : la borne partait vide et le serveur refusait la
      // requete entiere ("invalid input syntax for type timestamp"), table apres table, sans que
      // rien n'indique laquelle. On repart alors du debut plutot que d'envoyer une date absente.
      const depuis = repere?.updatedAt || null;
      const borne = depuis ? encodeURIComponent(depuis) : null;
      const filtre = borne
        ? `or=(updated_at.gt."${borne}",and(updated_at.eq."${borne}",id.gt."${encodeURIComponent(repere.id)}"))`
        : `updated_at=gte.1970-01-01T00%3A00%3A00Z`;
      const lignes = await lire(
        `/rest/v1/${table}?${filtre}&select=*&order=updated_at.asc,id.asc&limit=${limit + 1}`
      );
      if (lignes.length > limit) { plusLoin = true; lignes.length = limit; }

      // Le serveur a deja ecarte ce qui etait lu. On le revrifie tout de meme : c'est la
      // garantie qu'une ligne n'est jamais rapportee deux fois, et elle ne doit pas dependre de
      // la bonne interpretation d'un filtre par le serveur.
      const nouvelles = lignes.filter(ligne =>
        !(depuis && ligne.updated_at === depuis && String(ligne.id) <= String(repere.id)));
      nouvelles.forEach(ligne => records.push({
        entity: table,
        id: ligne.id,
        version: ligne.version ?? 0,
        updatedAt: ligne.updated_at,
        deleted: Boolean(ligne.deleted),
        data: ligne
      }));

      // Un repere n'est enregistre que s'il est utilisable : une ligne sans date ne peut pas
      // servir de point de reprise, et l'enregistrer condamnerait toutes les lectures suivantes.
      const dernier = lignes[lignes.length - 1];
      if (dernier?.updated_at) suivants[table] = { updatedAt: dernier.updated_at, id: dernier.id };
    }

    records.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || String(a.id).localeCompare(String(b.id)));
    return { records, cursor: suivants, hasMore: plusLoin };
  }

  /**
   * Envoie une operation. Un refus pour cause de version perimee n'est pas une panne : c'est un
   * conflit, que le moteur doit pouvoir trancher. On le lui rend comme tel, avec la ligne du
   * serveur, plutot que de lever une erreur qui declencherait une reprise sans fin.
   */
  async function pushOperation(operation) {
    const corps = { ...operation.data, id: operation.id, version: operation.baseVersion || undefined };
    if (operation.action === "delete") { corps.deleted = true; corps.data = undefined; }

    // Toute ecriture date la ligne, y compris un effacement.
    //
    // Un effacement n'envoyait que "deleted: true" : la colonne updated_at gardait donc sa
    // valeur d'avant. Or la synchronisation ne redescend que ce qui a change de date. La ligne
    // paraissait inchangee pour tous les autres appareils, et l'effacement ne se propageait
    // jamais - le creneau restait affiche partout ailleurs, indefiniment. Un planning montrait
    // ainsi trois creneaux la ou il n'en restait qu'un.
    if (!corps.updated_at) corps.updated_at = new Date().toISOString();

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

    if (!reponse.ok) {
      if (reponse.status === 401) throw new Error("Session expiree.");

      // Un droit refuse n'est pas une panne : reessayer ne changera rien. Traite comme une
      // erreur, l'operation reviendrait indefiniment dans la file, et le professeur verrait une
      // synchronisation qui ne finit jamais sans jamais savoir pourquoi.
      if (reponse.status === 403) {
        return { status: "rejected", reason: "droits insuffisants",
                 serverRecord: await lireLigneSiPossible(operation.entity, operation.id) };
      }

      // Le refus de version est reconnu quel que soit le code HTTP.
      //
      // Le declencheur rend desormais un 409 (voir schema_versions_hors_connexion.sql), mais on
      // ne s'y fie pas : il a longtemps rendu un 500, que cette fonction ne savait pas lire. Un
      // desaccord de version - situation normale, prevue, faite pour devenir un conflit a
      // trancher - etait alors pris pour une panne serveur et repris sans fin. Une base ancienne
      // peut encore porter l'ancien declencheur : le message suffit a decider.
      const texte = await reponse.text().catch(() => "");
      if (texte.includes("Version perimee") || texte.includes("40001")) {
        return { status: "conflict", serverRecord: await lireLigne(operation.entity, operation.id) };
      }
      // Le code seul ne dit rien : PostgREST explique le refus dans son corps de reponse
      // (colonne inconnue, contrainte violee, valeur invalide). Sans le rapporter, un 400
      // restait indechiffrable, y compris pour moi.
      throw new Error(`Enregistrement refuse (HTTP ${reponse.status}) : ${explicationServeur(texte)}`);
    }

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
