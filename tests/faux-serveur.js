/**
 * Faux serveur Supabase pour le banc d'essai du site.
 *
 * Il repond a toutes les tables avec un jeu de donnees coherent : une classe par niveau, des
 * eleves, des creneaux, un cycle, une evaluation, un test, une dispense. L'objectif n'est pas de
 * verifier les valeurs affichees mais que chaque ecran se construit sans casser - c'est ce qui
 * manque aujourd'hui pour decouper index.html sans avancer a l'aveugle.
 *
 * Aucune requete ne part : fetch est remplace avant que le code du site ne s'execute.
 */
(function () {
  const MAINTENANT = new Date().toISOString();

  const CLASSES = [
    { id: "cl-3e6", user_id: "prof-test", grade: "TROISIEME", class_number: 6, school_year: "2026-2027", name: "3e6", deleted: false, updated_at: MAINTENANT },
    { id: "cl-2nde1", user_id: "prof-test", grade: "SECONDE", class_number: 1, school_year: "2026-2027", name: "2nde1", deleted: false, updated_at: MAINTENANT },
    { id: "cl-tle", user_id: "prof-test", grade: "TERMINALE", class_number: 1, school_year: "2026-2027", name: "Tle1", deleted: false, updated_at: MAINTENANT }
  ];

  const ELEVES = Array.from({ length: 12 }, (_, i) => ({
    id: "el-" + i, user_id: "prof-test", class_id: i < 8 ? "cl-3e6" : "cl-2nde1",
    first_name: ["Lea", "Tom", "Ines", "Noe"][i % 4], last_name: ["Martin", "Diouch", "Louit", "Abbas"][i % 4],
    sex: i % 2 ? "F" : "M", grade: "TROISIEME", division: "3e6", birth_date_epoch_millis: 1_070_000_000_000,
    student_email: "eleve" + i + "@exemple.fr", parent_emails: "", deleted: false, updated_at: MAINTENANT
  }));

  const DONNEES = {
    profiles: [{ id: "prof-test", institution_id: "etab-1", institutions: { id: "etab-1", name: "Cite scolaire", code: "TEST" } }],
    institutions: [{ id: "etab-1", name: "Cite scolaire", code: "TEST", created_by: "prof-test" }],
    teacher_profiles: [{ user_id: "prof-test", revision: 1, profile: { teacherName: "Louit", schoolYear: "2026-2027" } }],
    teacher_period_settings: [{ user_id: "prof-test", revision: 1, period_counts: {} }],
    classes: CLASSES,
    students: ELEVES,
    class_schedule_slots: [
      { id: "sl-1", user_id: "prof-test", class_id: "cl-3e6", day_of_week: "LUNDI", start_time: "08:00", duration_minutes: 55, installation_name: "Gymnase 2/3", class_label: "3e6", teacher_label: "Louit", deleted: false, updated_at: MAINTENANT },
      { id: "sl-2", user_id: "prof-test", class_id: "cl-3e6", day_of_week: "VENDREDI", start_time: "14:00", duration_minutes: 55, installation_name: "Terrain d herbe 1/2", class_label: "3e6", teacher_label: "Louit", deleted: false, updated_at: MAINTENANT },
      { id: "sl-3", user_id: "prof-test", class_id: "cl-2nde1", day_of_week: "MARDI", start_time: "10:00", duration_minutes: 110, installation_name: "Piscine", class_label: "2nde1", teacher_label: "Louit", deleted: false, updated_at: MAINTENANT }
    ],
    period_activities: [
      { id: "pa-1", user_id: "prof-test", slot_id: "sl-1", period_number: 1, apsa_name: "Rugby", installation_name: "Terrain d herbe 1/2", deleted: false, updated_at: MAINTENANT },
      { id: "pa-2", user_id: "prof-test", slot_id: "sl-1", period_number: 2, apsa_name: "Escalade", installation_name: "Gymnase 2/3", deleted: false, updated_at: MAINTENANT }
    ],
    cycles: [{ id: "cy-1", user_id: "prof-test", class_id: "cl-3e6", grade: "TROISIEME", apsa_name: "Rugby", session_count: 12, current_session_number: 2, priority_objective: null, installation: null, school_year: "2026-2027", deleted: false, updated_at: MAINTENANT }],
    evaluations: [{ id: "ev-1", user_id: "prof-test", cycle_id: "cy-1", type: "PONCTUELLE", label: "Contact debout", date_epoch_millis: Date.now(), deleted: false, updated_at: MAINTENANT }],
    evaluation_criteria: [{ id: "cr-1", user_id: "prof-test", evaluation_id: "ev-1", label: "Tete relevee", max_points: 10, order_index: 0, deleted: false, updated_at: MAINTENANT }],
    evaluation_scores: [{ id: "sc-1", user_id: "prof-test", criterion_id: "cr-1", student_id: "el-0", points: 7, deleted: false, updated_at: MAINTENANT }],
    sport_installations: [
      { id: "in-1", user_id: "prof-test", name: "Gymnase", deleted: false, updated_at: MAINTENANT },
      { id: "in-2", user_id: "prof-test", name: "Gymnase 2/3", deleted: false, updated_at: MAINTENANT },
      { id: "in-3", user_id: "prof-test", name: "Terrain d herbe 1/2", deleted: false, updated_at: MAINTENANT }
    ],
    equipment: [{ id: "eq-1", user_id: "prof-test", institution_id: "etab-1", name: "Baudrier", quantity: 14, deleted: false, updated_at: MAINTENANT }],
    equipment_purchases: [],
    epi_items: [{ id: "epi-1", user_id: "prof-test", institution_id: "etab-1", name: "Corde 30 m", serial_number: "C-1", deleted: false, updated_at: MAINTENANT }],
    epi_inspections: [],
    // Deux divisions, et deux eleves dans l'une d'elles : c'est le minimum pour verifier qu'on
    // peut isoler une division entiere et la cocher d'un geste.
    unss_students: [
      { id: "us-1", user_id: "prof-test", institution_id: "etab-1", first_name: "Lea", last_name: "Martin", category: "MINIME", sex: "F", division: "3e6", deleted: false, updated_at: MAINTENANT },
      { id: "us-2", user_id: "prof-test", institution_id: "etab-1", first_name: "Noe", last_name: "Bernard", category: "MINIME", sex: "M", division: "3e6", deleted: false, updated_at: MAINTENANT },
      { id: "us-3", user_id: "prof-test", institution_id: "etab-1", first_name: "Ines", last_name: "Petit", category: "BENJAMIN", sex: "F", division: "6e1", deleted: false, updated_at: MAINTENANT }
    ],
    unss_groups: [{ id: "ug-1", user_id: "prof-test", institution_id: "etab-1", name: "Volley", deleted: false, updated_at: MAINTENANT }],
    unss_memberships: [{ id: "um-1", user_id: "prof-test", group_id: "ug-1", student_id: "us-1", deleted: false, updated_at: MAINTENANT }],
    unss_sessions: [],
    unss_attendance: [],
    unss_slots: [{ id: "usl-1", user_id: "prof-test", institution_id: "etab-1", day_of_week: "MERCREDI", start_time: "13:00", label: "Volley", deleted: false, updated_at: MAINTENANT }],
    annual_plan_blocks: [],
    eps_test_sessions: [{ id: "ts-1", user_id: "prof-test", class_id: "cl-3e6", period_number: 1, test_name: "Luc Leger", class_label: "3e6", created_at: Date.now(), deleted: false, updated_at: MAINTENANT }],
    eps_test_results: [{ id: "tr-1", user_id: "prof-test", session_id: "ts-1", student_id: "el-0", input_value: 9, result_value: 15.5, input_unit: "palier", result_unit: "km/h", deleted: false, updated_at: MAINTENANT }],
    health_dispensations: [{ id: "hd-1", user_id: "prof-test", class_id: "cl-3e6", student_id: "el-0", start_date: "2026-09-01", end_date: "2026-12-01", updated_at: MAINTENANT }],
    health_accidents: [],
    eps_period_dates: [{ id: "pd-1", user_id: "prof-test", institution_id: "etab-1", school_year: "2026-2027", grade: "TERMINALE", number: 1, start_date: "2026-09-01", end_date: "2026-11-20", deleted: false, updated_at: MAINTENANT }],
    planning_validations: [],
    institution_calendar: [],
    assigned_classes: [],
    eps_team_context: [{ institution_id: "etab-1", is_admin: true }]
  };

  /** Le nom de la table visee, quelle que soit la forme de la requete. */
  function table(url) {
    const m = String(url).match(/\/rest\/v1\/([a-z_0-9]+)/i);
    return m ? m[1] : null;
  }

  function reponse(corps, statut) {
    return new Response(JSON.stringify(corps), {
      status: statut || 200,
      headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" }
    });
  }

  /**
   * Applique les filtres "colonne=eq.valeur" de PostgREST.
   *
   * Sans cela, une classe verrait les eleves de toutes les autres et certains ecrans se
   * construiraient sur des donnees incoherentes - on testerait alors autre chose que le site.
   */
  function filtrer(lignes, url) {
    const query = String(url).split("?")[1] || "";
    return query.split("&").reduce((restantes, morceau) => {
      const [colonne, valeur] = morceau.split("=");
      if (!valeur || !/^(eq|in)\./.test(valeur)) return restantes;
      const attendu = decodeURIComponent(valeur.slice(3));
      if (valeur.startsWith("in.")) {
        const liste = attendu.replace(/^\(|\)$/g, "").split(",");
        return restantes.filter(l => liste.includes(String(l[colonne])));
      }
      if (attendu === "true" || attendu === "false") {
        return restantes.filter(l => String(Boolean(l[colonne])) === attendu);
      }
      return restantes.filter(l => String(l[colonne]) === attendu);
    }, lignes);
  }

  /**
   * Applique "order=colonne.asc". Sans cela le banc rendait les lignes dans l'ordre du jeu
   * d'essai, et un ecran pouvait passer au vert uniquement parce que la premiere ligne n'etait
   * pas celle que le site aurait vraiment affichee.
   */
  function trier(lignes, url) {
    const m = String(url).match(/[?&]order=([a-z_0-9]+)\.(asc|desc)/i);
    if (!m) return lignes;
    const [, colonne, sens] = m;
    const copie = [...lignes].sort((a, b) =>
      String(a[colonne] ?? "").localeCompare(String(b[colonne] ?? ""), "fr", { numeric: true }));
    return sens.toLowerCase() === "desc" ? copie.reverse() : copie;
  }

  const appels = [];
  const vraiFetch = window.fetch.bind(window);

  function fauxFetch(url, options) {
    const methode = (options && options.method) || "GET";
    appels.push({ url: String(url), methode });

    // Les fichiers du site (fiches de cycle, images) sont de vrais fichiers a lire : les avaler
    // ferait echouer des ecrans pour une raison qui n'a rien a voir avec le code teste.
    if (!/^https?:\/\//i.test(String(url)) || String(url).startsWith(location.origin)) {
      return vraiFetch(url, options);
    }

    if (/\/auth\/v1\//.test(url)) return Promise.resolve(reponse({ access_token: "jeton-test", user: { id: "prof-test", email: "test@exemple.fr" } }));
    if (/\/functions\/v1\//.test(url)) return Promise.resolve(reponse({ ok: true, invites: [], members: [] }));
    // Chaque fonction distante rend ce que le site attend d'elle : une version de schema est un
    // nombre, pas un objet. Repondre a cote faisait tester un ecran d'erreur.
    if (/\/rest\/v1\/rpc\/eps_as_roster_version/.test(url)) return Promise.resolve(reponse(2));
    if (/\/rest\/v1\/rpc\/eps_team_context/.test(url)) return Promise.resolve(reponse({ institution_id: "etab-1", is_admin: true }));
    if (/\/rest\/v1\/rpc\//.test(url)) return Promise.resolve(reponse({ saved: true, revision: 2 }));
    if (/open-meteo/.test(url)) return Promise.resolve(reponse({ current: {}, daily: { time: [], weathercode: [] }, hourly: { time: [], temperature_2m: [] } }));

    const nom = table(url);
    if (!nom) return Promise.resolve(reponse([]));
    if (methode !== "GET") return Promise.resolve(reponse(options && options.body ? [].concat(JSON.parse(options.body)) : []));
    return Promise.resolve(reponse(trier(filtrer(DONNEES[nom] || [], url), url)));
  }

  // Les erreurs du chargement, avant meme que le banc puisse ecouter.
  //
  // Une premiere version n'installait les ecoutes qu'apres le chargement du site : un fichier qui
  // referencait au chargement une fonction definie dans un fichier charge plus tard levait une
  // erreur que le banc annoncait ensuite "au vert". C'est exactement le defaut que le decoupage
  // peut introduire, donc celui qu'il faut voir en premier.
  const incidents = [];
  window.addEventListener("error", e => incidents.push("Chargement : " + (e.message || e.error)));
  window.addEventListener("unhandledrejection", e =>
    incidents.push("Chargement : promesse rejetee — " + ((e.reason && e.reason.message) || e.reason)));
  const erreurConsole = console.error;
  console.error = function (...args) { incidents.push("Chargement : " + args.map(String).join(" ")); erreurConsole.apply(console, args); };

  window.__fauxServeur = { DONNEES, appels, table, incidents };
  window.fetch = fauxFetch;

  // Le site lit sa session au chargement. On intercepte la lecture au lieu d'ecrire dans le
  // navigateur : le banc d'essai ne doit pas connecter - ni deconnecter - le vrai site, qui
  // partage le meme stockage.
  const lireVrai = Storage.prototype.getItem;
  Storage.prototype.getItem = function (cle) {
    if (cle === "alex_eps_session") return JSON.stringify({ access_token: "jeton-test", user_id: "prof-test", email: "test@exemple.fr" });
    return lireVrai.call(this, cle);
  };
  Storage.prototype.setItem = function () { /* le banc d'essai n'ecrit rien */ };

  // Le service worker est hors sujet ici, et l'enregistrer depuis un cadre de test brouillerait
  // l'etat de la vraie application installee.
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = () => Promise.reject(new Error("service worker desactive pour les tests"));
  }
})();
