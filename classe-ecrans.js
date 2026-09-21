/*
 * Les ecrans d'une classe, dessines comme dans l'application.
 *
 * Ouvrir une classe mene directement a son tableau de bord : les chiffres du jour, les cours de
 * la semaine, quatre cartes (progression du cycle, evaluations / tests, documents, dispenses), le
 * bloc-notes et les equipes. Chaque carte ouvre son ecran dans le panneau de la classe, avec un
 * bandeau bleu et un retour : c'est l'organisation de l'application (TableauDeBordClasse.kt,
 * ClassDashboardDetailScreens.kt, EcranDispensesClasse.kt, StudentFolderScreens.kt).
 *
 * L'ecran Cours reste celui de classe-tableau-bord.js. Les donnees aussi : ce fichier ne lit rien
 * de plus que ce que l'application montre, et reutilise les enregistrements deja en place (notes,
 * documents, rendus, dispenses, grilles).
 */

// ---- Etat des ecrans --------------------------------------------------------------------

/** Le creneau retenu parmi les cours de la semaine : il choisit le cycle suivi. */
let ecCreneauChoisi = null;
let ecFiltreEvaluations = "Toutes";
let ecFiltreDispenses = "En cours";
let ecFiltreEleves = "TOUS";
let ecRechercheEleves = "";
let ecDocumentsArchives = false;
/** Le document dont on coche les rendus eleve par eleve, ou null. */
let ecDocumentSuivi = null;
let ecToutesLesNotes = false;
let ecOngletRecap = "tests";
/** Ce qu'on regarde dans le recapitulatif : { type: "test"|"evaluation", id } ou null. */
let ecRecapChoix = null;
let ecEquipes = [];
/** Notes des grilles : criteres et notes, lus a la demande pour les jauges et le recapitulatif. */
let ecCriteres = [];
let ecNotes = [];
let ecResultatsTests = [];
let ecNotesChargees = false;

const EC_VUES = ["bord", "eleves", "evaluations", "recap", "documents", "dispenses"];

// ---- Petits outils ----------------------------------------------------------------------

const ecTexte = v => planningText(v == null ? "" : String(v));
const ecPluriel = (n, mot, pluriel) => `${n} ${n > 1 ? (pluriel || mot + "s") : mot}`;
const ecNomEleve = e => e ? `${String(e.last_name || "").toUpperCase()} ${e.first_name || ""}`.trim() : "Élève";
const ecEleve = id => dashboardStudents.find(s => s.id === id);
const ecJour = iso => iso ? new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString("fr-FR") : "";
const ecDateCourte = ms => ms ? new Date(Number(ms) || Date.parse(ms)).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "";
const ecNombre = v => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
};

/** La periode qui contient aujourd'hui, pour ouvrir la classe sur ce qu'on fait maintenant. */
function ecPeriodeDuJour(grade) {
  const jour = new Date().toISOString().slice(0, 10);
  const nombre = planningPeriodCount(grade);
  for (let p = 1; p <= nombre; p++) {
    const b = bornesPeriode(grade, p);
    if (b && b.debut <= jour && b.fin >= jour) return p;
  }
  return 1;
}

/**
 * Lit une table, en ligne ou dans la copie hors connexion.
 * @param {string} table   la table
 * @param {string} filtre  le filtre PostgREST, sans "deleted"
 * @param {(ligne:object)=>boolean} ou  le meme filtre, pour la copie locale
 */
async function ecLire(table, filtre, ou) {
  // La copie locale ne vaut que pour les tables qu'elle recopie a coup sur (premiere vague de
  // hors-connexion.js). Pour une autre, elle repond "aucune ligne" : on lirait une classe vide.
  const suivie = typeof TABLES_HORS_CONNEXION !== "undefined" && TABLES_HORS_CONNEXION.includes(table);
  if (suivie && typeof modeHorsConnexion !== "undefined" && modeHorsConnexion) {
    try { return (await modeHorsConnexion.lire(table, { ou })).rows; } catch { /* lecture reseau */ }
  }
  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/${table}?deleted=eq.false&${filtre}&select=*`);
  return res.ok ? res.json() : [];
}

/**
 * L'appui prolonge : l'application supprime ou modifie par un appui d'une seconde. Au clavier
 * et a la souris, le clic droit fait la meme chose.
 */
function ecAppuiLong(el, action) {
  let minuteur = null, declenche = false, depart = null;
  const annuler = () => { clearTimeout(minuteur); minuteur = null; };
  el.classList.add("ec-appui-long");
  el.addEventListener("pointerdown", e => {
    if (e.button) return;
    declenche = false; depart = [e.clientX, e.clientY];
    minuteur = setTimeout(() => { declenche = true; minuteur = null; action(); }, 550);
  });
  el.addEventListener("pointermove", e => {
    if (minuteur && depart && Math.hypot(e.clientX - depart[0], e.clientY - depart[1]) > 10) annuler();
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(t => el.addEventListener(t, annuler));
  // Le clic qui suit un appui prolonge ne doit pas ouvrir l'element en plus.
  el.addEventListener("click", e => {
    if (declenche) { e.stopImmediatePropagation(); e.preventDefault(); declenche = false; }
  }, true);
  el.addEventListener("contextmenu", e => { e.preventDefault(); annuler(); action(); });
}

/** Le bandeau bleu d'un ecran : retour, titre, et "+" quand on peut ajouter. */
function ecBandeau(titre, { sous = "", ajout = false, actions = "" } = {}) {
  return `<header class="ec-bandeau">
    <button type="button" class="ec-retour" data-ec-retour aria-label="Retour">←</button>
    <div class="ec-bandeau-titre"><h2>${ecTexte(titre)}</h2>${sous ? `<small>${ecTexte(sous)}</small>` : ""}</div>
    ${actions}
    ${ajout ? `<button type="button" class="ec-plus" data-ec-ajout aria-label="Ajouter">+</button>` : ""}
  </header>`;
}

const ecStat = (valeur, libelle, couleur) =>
  `<div class="ec-stat"><b style="color:${couleur}">${ecTexte(valeur)}</b><small>${ecTexte(libelle)}</small></div>`;

const ecJauge = (part, couleur) =>
  `<div class="ec-jauge"><div style="width:${Math.round(Math.max(0, Math.min(1, part)) * 100)}%;background:${couleur}"></div></div>`;

function ecPastilles(nom, choix, actif) {
  return `<div class="ec-pastilles">${choix.map(([id, libelle]) =>
    `<button type="button" class="ec-pastille${id === actif ? " actif" : ""}" data-${nom}="${ecTexte(id)}">${ecTexte(libelle)}</button>`).join("")}</div>`;
}

/**
 * Une petite fenetre pour saisir un texte : une note, l'intitule d'un document. Elle remplace
 * prompt(), qu'aucun navigateur ne dessine comme le reste du site.
 * @returns {Promise<string|null>} le texte saisi, ou null si on annule
 */
function ecDemanderTexte({ titre, etiquette, valeur = "", indication = "", multiligne = false, bouton = "Enregistrer" }) {
  return new Promise(resoudre => {
    let voile = document.getElementById("ecDialogue");
    if (!voile) {
      voile = document.createElement("div");
      voile.id = "ecDialogue";
      voile.className = "searchOverlay";
      document.body.appendChild(voile);
    }
    const champ = multiligne
      ? `<textarea id="ecDialogueChamp" rows="4" placeholder="${ecTexte(indication)}">${ecTexte(valeur)}</textarea>`
      : `<input id="ecDialogueChamp" value="${ecTexte(valeur)}" placeholder="${ecTexte(indication)}">`;
    voile.innerHTML = `<div class="searchSheet ec-dialogue" role="dialog" aria-modal="true" aria-labelledby="ecDialogueTitre">
      <h3 id="ecDialogueTitre">${ecTexte(titre)}</h3>
      <label for="ecDialogueChamp">${ecTexte(etiquette)}</label>${champ}
      <div class="ec-dialogue-actions">
        <button type="button" class="secondary" id="ecDialogueAnnuler">Annuler</button>
        <button type="button" id="ecDialogueValider">${ecTexte(bouton)}</button>
      </div></div>`;
    voile.classList.add("open");
    const saisie = document.getElementById("ecDialogueChamp");
    const valider = document.getElementById("ecDialogueValider");
    const maj = () => { valider.disabled = !saisie.value.trim(); };
    const fermer = resultat => {
      voile.classList.remove("open"); voile.innerHTML = "";
      document.removeEventListener("keydown", clavier);
      resoudre(resultat);
    };
    const clavier = e => {
      if (e.key === "Escape") fermer(null);
      if (e.key === "Enter" && !multiligne && saisie.value.trim()) fermer(saisie.value.trim());
    };
    saisie.addEventListener("input", maj); maj();
    document.addEventListener("keydown", clavier);
    valider.onclick = () => fermer(saisie.value.trim());
    document.getElementById("ecDialogueAnnuler").onclick = () => fermer(null);
    voile.onclick = e => { if (e.target === voile) fermer(null); };
    setTimeout(() => saisie.focus(), 30);
  });
}

/**
 * Une fenetre d'actions, comme celle de l'appui prolonge dans l'application.
 * @param {string} titre
 * @param {string} sous
 * @param {{libelle:string, danger?:boolean, action:()=>void}[]} actions
 */
function ecActions(titre, sous, actions) {
  let voile = document.getElementById("ecDialogue");
  if (!voile) {
    voile = document.createElement("div");
    voile.id = "ecDialogue";
    voile.className = "searchOverlay";
    document.body.appendChild(voile);
  }
  voile.innerHTML = `<div class="searchSheet ec-dialogue" role="dialog" aria-modal="true">
    <header class="ec-actions-tete"><div><h3>${ecTexte(titre)}</h3>${sous ? `<small>${ecTexte(sous)}</small>` : ""}</div>
      <button type="button" class="ec-fermer-rond" id="ecActionsFermer" aria-label="Fermer">×</button></header>
    <div class="ec-actions-liste">${actions.map((a, i) =>
      `<button type="button" class="ec-action${a.danger ? " danger" : ""}" data-ec-action="${i}">${ecTexte(a.libelle)}</button>`).join("")}</div>
  </div>`;
  voile.classList.add("open");
  const fermer = () => { voile.classList.remove("open"); voile.innerHTML = ""; };
  document.getElementById("ecActionsFermer").onclick = fermer;
  voile.onclick = e => { if (e.target === voile) fermer(); };
  voile.querySelectorAll("[data-ec-action]").forEach(b => b.onclick = () => {
    fermer();
    actions[Number(b.dataset.ecAction)].action();
  });
}

// ---- Donnees propres a ces ecrans -------------------------------------------------------

/** Les equipes enregistrees de la classe, pour le tableau de bord et Divers EPS. */
async function ecChargerEquipes() {
  const id = dashboardClass?.row?.id;
  ecEquipes = [];
  if (!id) return;
  try {
    ecEquipes = await ecLire("saved_teams", `class_id=eq.${id}&order=created_at.desc`, t => t.class_id === id);
  } catch { ecEquipes = []; }
}

/**
 * Criteres et notes des grilles de la classe, et resultats des tests.
 *
 * Ils donnent "12 / 28 eleves evalues" sous chaque grille et remplissent le recapitulatif. On
 * les relit a chaque ouverture de l'ecran : une note saisie entre-temps doit s'y voir.
 */
async function ecChargerNotes() {
  const evals = dashboardEvaluations.map(e => e.id);
  const sessions = dashboardTests.map(t => t.id);
  const liste = ids => ids.map(x => `"${x}"`).join(",");
  try {
    ecCriteres = evals.length
      ? await ecLire("evaluation_criteria", `evaluation_id=in.(${liste(evals)})`, c => evals.includes(c.evaluation_id))
      : [];
    const criteres = ecCriteres.map(c => c.id);
    ecNotes = criteres.length
      ? await ecLire("evaluation_scores", `criterion_id=in.(${liste(criteres)})`, s => criteres.includes(s.criterion_id))
      : [];
    ecResultatsTests = sessions.length
      ? await ecLire("eps_test_results", `session_id=in.(${liste(sessions)})`, r => sessions.includes(r.session_id))
      : [];
  } catch {
    ecCriteres = []; ecNotes = []; ecResultatsTests = [];
  }
  ecNotesChargees = true;
}

/** Le nombre d'eleves notes sur une grille, et le bareme total. */
function ecAvancementGrille(evaluationId) {
  const criteres = ecCriteres.filter(c => c.evaluation_id === evaluationId);
  const ids = new Set(criteres.map(c => c.id));
  const notes = ecNotes.filter(n => ids.has(n.criterion_id) && n.points != null);
  return {
    evalues: new Set(notes.map(n => n.student_id)).size,
    maximum: criteres.reduce((t, c) => t + (Number(c.max_points) || 0), 0),
    criteres, notes
  };
}

// ---- Ce qui se lit sur le tableau de bord -----------------------------------------------

/**
 * Les cours de la semaine pour la periode : un par creneau qui porte une activite, du plus
 * proche au plus lointain a partir d'aujourd'hui.
 */
function ecCoursDeLaSemaine() {
  const aujourdhui = new Date().getDay();
  return dashboardSlots.map(creneau => {
    const jour = JOURS_SEMAINE.indexOf(String(creneau.day_of_week || "").toUpperCase());
    const activite = dashboardActivities.find(a => a.slot_id === creneau.id && a.period_number === dashboardPeriod);
    return activite && String(activite.apsa_name || "").trim() ? { creneau, activite, jour } : null;
  }).filter(Boolean).sort((a, b) =>
    ((a.jour - aujourdhui + 7) % 7) - ((b.jour - aujourdhui + 7) % 7)
    || String(a.creneau.start_time || "").localeCompare(String(b.creneau.start_time || "")));
}

/** Le cours retenu, son cycle et la seance ou l'on en est. */
function ecCoursRetenu() {
  const cours = ecCoursDeLaSemaine();
  const choisi = cours.find(c => c.creneau.id === ecCreneauChoisi) || cours[0] || null;
  const cycle = cyclePourPeriode(choisi ? choisi.activite : null, dashboardPeriod);
  let seance = null;
  if (cycle) {
    const memeActiviteCreneaux = choisi
      ? cours.filter(c => memeActivite(c.activite.apsa_name, choisi.activite.apsa_name)).map(c => c.creneau)
      : dashboardSlots;
    seance = seanceAffichee(cycle, memeActiviteCreneaux);
  }
  return { cours, choisi, cycle, seance };
}

/** Les grilles et les tests de ce qu'on suit : le cycle du cours retenu, sinon la periode. */
function ecEvaluationsSuivies() {
  const { cycle } = ecCoursRetenu();
  const cyclesPeriode = new Set(ecCoursDeLaSemaine()
    .map(c => cyclePourPeriode(c.activite, dashboardPeriod)).filter(Boolean).map(c => c.id));
  if (cycle) cyclesPeriode.add(cycle.id);
  const cycleParId = Object.fromEntries(dashboardCycles.map(c => [c.id, c]));
  const evaluations = dashboardEvaluations
    .filter(e => cycle ? e.cycle_id === cycle.id : cyclesPeriode.has(e.cycle_id))
    .map(e => ({ ...e, cycle: cycleParId[e.cycle_id], activite: cycleParId[e.cycle_id]?.apsa_name || "" }))
    .sort((a, b) => (Number(b.date_epoch_millis) || 0) - (Number(a.date_epoch_millis) || 0));
  const tests = dashboardTests.filter(t => (Number(t.period_number) || 1) === dashboardPeriod && !t.deleted)
    .sort((a, b) => (Number(b.created_at) || Date.parse(b.created_at) || 0) - (Number(a.created_at) || Date.parse(a.created_at) || 0));
  return { evaluations, tests, cycle };
}

function ecDocumentsManquants() {
  const actifs = documentsClasse.filter(d => !d.archived);
  return actifs.reduce((total, doc) => total + Math.max(0,
    dashboardStudents.length - rendusClasse.filter(r => r.document_id === doc.id && r.returned && !r.deleted).length), 0);
}

// ---- Aiguillage -------------------------------------------------------------------------

/** Dessine l'ecran courant de la classe. Rend faux si la vue n'est pas l'une des siennes. */
function renderEcranClasse() {
  const panel = document.getElementById("classDashboardPanel");
  if (!panel || !dashboardClass) return false;
  if (vueClasse === "menu") vueClasse = "bord";
  if (!EC_VUES.includes(vueClasse)) return false;
  panel.classList.add("ec-panneau");
  if (vueClasse === "bord") ecDessinerTableauDeBord(panel);
  else if (vueClasse === "eleves") ecDessinerEleves(panel);
  else if (vueClasse === "evaluations") ecDessinerEvaluations(panel);
  else if (vueClasse === "recap") ecDessinerRecap(panel);
  else if (vueClasse === "documents") ecDessinerDocuments(panel);
  else if (vueClasse === "dispenses") ecDessinerDispenses(panel);
  return true;
}

function ecAller(vue) {
  vueClasse = vue;
  if (vue !== "documents") ecDocumentSuivi = null;
  if (vue !== "recap") ecRecapChoix = null;
  renderClassDashboard();
  document.getElementById("classDashboardPanel")?.scrollIntoView({ block: "start" });
}

// ---- Tableau de bord --------------------------------------------------------------------

function ecDessinerTableauDeBord(panel) {
  const { row, label } = dashboardClass;
  const { cours, choisi, cycle, seance } = ecCoursRetenu();
  const { evaluations, tests } = ecEvaluationsSuivies();
  const dispenses = dashboardDispenses.filter(d => !d.deleted && dispenseEnCours(d));
  const manquants = ecDocumentsManquants();
  const total = seance ? seance.total : 0;
  const numero = seance ? seance.numero : 0;
  const part = total ? numero / total : 0;
  const nbEval = evaluations.length + tests.length;
  const aujourdhui = new Date().getDay();
  const notes = ecToutesLesNotes ? notesClasse : notesClasse.slice(0, 2);

  const carteCours = c => {
    const titre = c.jour === aujourdhui ? "Aujourd’hui" : libelleJour(JOURS_SEMAINE[c.jour]);
    const actif = choisi && c.creneau.id === choisi.creneau.id;
    return `<button type="button" class="ec-cours${actif ? " actif" : ""}" data-ec-creneau="${ecTexte(c.creneau.id)}">
      <span class="ec-cours-jour">📅 ${ecTexte(titre)}${c.creneau.start_time ? ` · ${ecTexte(String(c.creneau.start_time).slice(0, 5))}` : ""}</span>
      <b>${ecTexte(c.activite.apsa_name)}</b>
      ${c.activite.installation_name ? `<small>📍 ${ecTexte(c.activite.installation_name)}</small>` : ""}
    </button>`;
  };

  panel.innerHTML = `<section class="ec-ecran">
    ${ecBandeau(`${label} · tableau de bord`, {
      actions: `<div class="ec-bandeau-actions">
        <button type="button" data-classe-action="schedule">Emploi du temps</button>
        <button type="button" data-classe-action="edit">Modifier la classe</button>
      </div>` })}
    <div class="ec-corps">
      <div class="ec-resume">
        <button type="button" data-vue="eleves"><i>👥</i><b>${dashboardStudents.length}</b><small>élèves</small></button>
        <button type="button" data-vue="dispenses" class="vert"><i>🛡️</i><b>${dispenses.length}</b><small>dispense${dispenses.length > 1 ? "s" : ""}</small></button>
        <button type="button" data-vue="cours"><i>📅</i><b>${total ? `${numero} / ${total}` : "—"}</b><small>séance</small></button>
      </div>

      <div class="ec-semaine">${cours.length ? cours.slice(0, 2).map(carteCours).join("")
        : `<div class="ec-cours vide"><span class="ec-cours-jour">📅 Cours</span><b>Aucun cours programmé</b>
            <small>Renseignez l’activité de la période dans PROGRAMMATION.</small></div>`}</div>

      <div class="ec-indicateurs">
        <button type="button" class="ec-indic" data-vue="cours" style="--fond:#E6F1FB;--accent:#185FA5">
          <span class="ec-indic-titre">Progression du cycle</span>
          <span class="ec-anneau" style="--part:${Math.round(part * 100)}"><b>${Math.round(part * 100)}%</b></span>
          <span class="ec-indic-valeur">${total ? `${ecPluriel(numero, "séance")} sur ${total}` : (cycle ? "Cycle sans séance" : "Aucun cycle")}</span>
        </button>
        <button type="button" class="ec-indic" data-vue="evaluations" style="--fond:#EEEDFE;--accent:#534AB7">
          <span class="ec-indic-titre">Évaluations / Tests</span>
          <span class="ec-indic-icone">📝</span>
          <span class="ec-indic-valeur">${nbEval ? `${ecPluriel(nbEval, "enregistrée")}` : "Aucun résultat"}</span>
        </button>
        <button type="button" class="ec-indic" data-vue="documents" style="--fond:#FCEBEB;--accent:#C62828">
          <span class="ec-indic-titre">Documents à rendre</span>
          <span class="ec-indic-icone">📄</span>
          <span class="ec-indic-valeur">${manquants ? ecPluriel(manquants, "manquant") : (documentsClasse.some(d => !d.archived) ? "Tout est rendu" : "Aucun document")}</span>
        </button>
        <button type="button" class="ec-indic" data-vue="dispenses" style="--fond:#E1F5EE;--accent:#0F7A45">
          <span class="ec-indic-titre">Dispenses</span>
          <span class="ec-indic-icone">🛡️</span>
          <span class="ec-indic-valeur">${dispenses.length ? `${dispenses.length} en cours` : "Aucune en cours"}</span>
        </button>
      </div>

      <section class="ec-carte">
        <div class="ec-carte-tete"><h3>Bloc-notes</h3>
          <button type="button" class="ec-plus-rond" id="ajoutNote" aria-label="Ajouter une note">+</button></div>
        ${notesClasse.length === 0
          ? `<p class="ec-vide">Aucune note · cliquez sur + pour en ajouter</p>`
          : notes.map(n => `<button type="button" class="ec-note" data-ec-note="${ecTexte(n.id)}">
              <i>✎</i><span>${ecTexte(n.content)}</span><small>${ecDateCourte(n.created_at)}</small></button>`).join("")}
        ${notesClasse.length > 2 ? `<button type="button" class="ec-lien" id="ecToutesNotes">${ecToutesLesNotes ? "Réduire" : `Voir les ${notesClasse.length} notes`}</button>` : ""}
        ${notesClasse.length ? `<p class="ec-aide">Clic : modifier · appui prolongé : supprimer</p>` : ""}
      </section>

      <div class="ec-equipes"><h3>Équipes enregistrées</h3>
        ${ecEquipes.length ? ecEquipes.slice(0, 6).map(t =>
          `<button type="button" class="ec-puce" data-ec-equipe="${ecTexte(t.id)}">👥 ${ecTexte(t.name)}</button>`).join("")
          : `<span class="ec-vide">Aucune</span>`}
      </div>
    </div>
  </section>`;

  panel.querySelector("[data-ec-retour]").onclick = () => fermerTableauDeBord();
  panel.querySelector('[data-classe-action="schedule"]').onclick = () => openClassSchedule(row, label);
  panel.querySelector('[data-classe-action="edit"]').onclick = () => openEditImport(row);
  panel.querySelectorAll("[data-vue]").forEach(b => b.onclick = () => ecAller(b.dataset.vue));
  panel.querySelectorAll("[data-ec-creneau]").forEach(b => b.onclick = () => {
    ecCreneauChoisi = b.dataset.ecCreneau;
    // L'ecran Cours s'ouvrira sur le jour de ce creneau, et sur son cycle.
    const c = cours.find(x => x.creneau.id === ecCreneauChoisi);
    if (c) dashboardJour = JOURS_SEMAINE[c.jour];
    dashboardSeanceManuelle = null;
    renderClassDashboard();
  });
  document.getElementById("ajoutNote").onclick = () => ajouterNoteClasse();
  document.getElementById("ecToutesNotes")?.addEventListener("click", () => { ecToutesLesNotes = !ecToutesLesNotes; renderClassDashboard(); });
  panel.querySelectorAll("[data-ec-note]").forEach(b => {
    const note = notesClasse.find(n => n.id === b.dataset.ecNote);
    b.onclick = () => modifierNoteClasse(note);
    ecAppuiLong(b, () => supprimerNoteClasse(note.id));
  });
  panel.querySelectorAll("[data-ec-equipe]").forEach(b => {
    const equipe = ecEquipes.find(t => t.id === b.dataset.ecEquipe);
    b.onclick = () => ecOuvrirEquipe(equipe);
    ecAppuiLong(b, () => ecSupprimerEquipe(equipe));
  });
}

async function modifierNoteClasse(note) {
  if (!note) return;
  const texte = await ecDemanderTexte({ titre: "Modifier la note", etiquette: "Note", valeur: note.content, multiligne: true });
  if (!texte || texte === note.content) return;
  const maintenant = new Date().toISOString();
  try {
    await apiFetch(`${SUPABASE_URL}/rest/v1/class_notes?id=eq.${note.id}`,
      { method: "PATCH", body: JSON.stringify({ content: texte, updated_at: maintenant }) });
  } catch (e) { alert(e.message); return; }
  note.content = texte; note.updated_at = maintenant;
  renderClassDashboard();
}

async function ecOuvrirEquipe(equipe) {
  if (!equipe) return;
  const hote = hoteDetail();
  hote.innerHTML = `<div class="ec-feuille"><p class="muted">Chargement de la composition…</p></div>`;
  ouvrirDetailClasse();
  let membres = [];
  try {
    membres = await ecLire("saved_team_members", `saved_team_id=eq.${equipe.id}&order=team_index.asc`, m => m.saved_team_id === equipe.id);
  } catch { membres = []; }
  const groupes = [];
  membres.forEach(m => { (groupes[Number(m.team_index) || 0] ??= []).push(m); });
  const { cycle } = ecCoursRetenu();
  hote.innerHTML = `<div class="ec-feuille">
    <h3>${ecTexte(equipe.name)}</h3>
    <p class="muted">${ecDateCourte(equipe.created_at)} · ${ecPluriel(groupes.filter(Boolean).length, "équipe")}</p>
    ${membres.length ? groupes.map((g, i) => g ? `<div class="ec-groupe"><b>Équipe ${i + 1}</b>${
      g.map(m => `<span>${ecTexte(ecNomEleve(ecEleve(m.student_id)))}</span>`).join("")}</div>` : "").join("")
      : `<p class="ec-vide">Cette composition ne contient aucun élève.</p>`}
    ${cycle ? "" : `<p class="ec-aide">Créer une évaluation demande un cycle pour la période : créez-le depuis Progression du cycle.</p>`}
    <div class="ec-dialogue-actions">
      <button type="button" class="danger" id="ecSupprimerEquipe">Supprimer</button>
      <button type="button" class="secondary" id="ecModifierGroupes">Modifier les groupes</button>
      <button type="button" id="ecEvaluerEquipe"${cycle && membres.length ? "" : " disabled"}>Créer une évaluation</button>
      <button type="button" class="secondary" id="ecFermerEquipe">Fermer</button>
    </div></div>`;
  document.getElementById("ecFermerEquipe").onclick = () => fermerDetailClasse();
  document.getElementById("ecSupprimerEquipe").onclick = () => ecSupprimerEquipe(equipe);
  document.getElementById("ecModifierGroupes").onclick = () => ecModifierGroupes(equipe, membres);
  document.getElementById("ecEvaluerEquipe").onclick = () => ecEvaluerEquipe(equipe, membres, cycle);
}

/**
 * Ecrit une ligne, dans la copie hors connexion quand la table y est suivie, sinon en direct :
 * la meme regle que les grilles creees depuis la classe.
 */
async function ecEnregistrer(table, ligne) {
  const suivie = typeof TABLES_HORS_CONNEXION !== "undefined" && TABLES_HORS_CONNEXION.includes(table);
  if (suivie && typeof modeHorsConnexion !== "undefined" && modeHorsConnexion) {
    await modeHorsConnexion.enregistrer(table, ligne.id, ligne);
    return;
  }
  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", body: JSON.stringify(ligne) });
  if (res && res.ok === false) throw new Error(`Enregistrement refusé (${table}).`);
}

/**
 * Deplacer des eleves d'une equipe a l'autre, en ajouter ou en retirer.
 *
 * On modifie les lignes existantes plutot que de tout recreer : l'effacement doit voyager
 * jusqu'a l'application, et une evaluation d'equipe deja faite garde ses eleves.
 */
function ecModifierGroupes(equipe, membres) {
  const hote = hoteDetail();
  const choix = new Map(membres.map(m => [m.student_id, Number(m.team_index) || 0]));
  let nombre = Math.max(2, ...membres.map(m => (Number(m.team_index) || 0) + 1));
  const eleves = [...dashboardStudents].sort((a, b) => ecNomEleve(a).localeCompare(ecNomEleve(b), "fr"));
  const dessiner = () => {
    hote.innerHTML = `<div class="ec-feuille">
      <h3>Modifier les groupes · ${ecTexte(equipe.name)}</h3>
      <p class="muted">Choisissez l’équipe de chaque élève. « Aucune » le retire de la composition.</p>
      <div class="ec-repartition">${Array.from({ length: nombre }, (_, i) =>
        `<span class="ec-puce">Équipe ${i + 1} · ${[...choix.values()].filter(v => v === i).length}</span>`).join("")}</div>
      <div class="ec-liste">${eleves.map(e => `<label class="ec-ligne-groupe"><span>${ecTexte(ecNomEleve(e))}</span>
        <select data-ec-groupe="${ecTexte(e.id)}">
          <option value="">Aucune</option>
          ${Array.from({ length: nombre }, (_, i) => `<option value="${i}"${choix.get(e.id) === i ? " selected" : ""}>Équipe ${i + 1}</option>`).join("")}
        </select></label>`).join("")}</div>
      <div class="ec-dialogue-actions">
        <button type="button" class="secondary" id="ecAjouterGroupe">+ Ajouter une équipe</button>
        <button type="button" class="secondary" id="ecAnnulerGroupes">Annuler</button>
        <button type="button" id="ecEnregistrerGroupes">Enregistrer</button>
      </div></div>`;
    hote.querySelectorAll("[data-ec-groupe]").forEach(s => s.onchange = () => {
      if (s.value === "") choix.delete(s.dataset.ecGroupe); else choix.set(s.dataset.ecGroupe, Number(s.value));
      dessiner();
    });
    document.getElementById("ecAjouterGroupe").onclick = () => { nombre++; dessiner(); };
    document.getElementById("ecAnnulerGroupes").onclick = () => ecOuvrirEquipe(equipe);
    document.getElementById("ecEnregistrerGroupes").onclick = async bouton => {
      bouton.target.disabled = true;
      const maintenant = new Date().toISOString();
      try {
        for (const e of eleves) {
          const ligne = membres.find(m => m.student_id === e.id);
          const voulu = choix.has(e.id) ? choix.get(e.id) : null;
          if (ligne && voulu === null) {
            await apiFetch(`${SUPABASE_URL}/rest/v1/saved_team_members?id=eq.${ligne.id}`,
              { method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: maintenant }) });
          } else if (ligne && voulu !== (Number(ligne.team_index) || 0)) {
            await apiFetch(`${SUPABASE_URL}/rest/v1/saved_team_members?id=eq.${ligne.id}`,
              { method: "PATCH", body: JSON.stringify({ team_index: voulu, updated_at: maintenant }) });
          } else if (!ligne && voulu !== null) {
            await ecEnregistrer("saved_team_members", { id: crypto.randomUUID(), user_id: session.user_id,
              saved_team_id: equipe.id, student_id: e.id, team_index: voulu, updated_at: maintenant, deleted: false });
          }
        }
        await apiFetch(`${SUPABASE_URL}/rest/v1/saved_teams?id=eq.${equipe.id}`,
          { method: "PATCH", body: JSON.stringify({ updated_at: maintenant }) });
      } catch (err) {
        alert(err.message || "Les groupes n’ont pas été enregistrés.");
        bouton.target.disabled = false;
        return;
      }
      ecOuvrirEquipe(equipe);
    };
  };
  dessiner();
}

/**
 * Evaluer une composition d'equipes : une note par groupe et par critere, reportee sur chacun de
 * ses eleves dans une grille ordinaire du cycle (TeamEvaluationScreen.kt). Des groupes peuvent
 * etre associes le temps de l'evaluation, sans toucher a la composition enregistree.
 */
function ecEvaluerEquipe(equipe, membres, cycle) {
  if (!cycle) return;
  const hote = hoteDetail();
  const sources = new Map();
  membres.forEach(m => { const i = Number(m.team_index) || 0; if (!sources.has(i)) sources.set(i, []); sources.get(i).push(m); });
  const indices = [...sources.keys()].sort((a, b) => a - b);
  const etat = { titre: `Évaluation · ${equipe.name}`, criteres: [{ label: "Technique", max: "8" }],
    associer: false, choisis: new Set(), associations: [], notes: {} };
  const groupesEvalues = () => {
    if (!etat.associer) return indices.map(i => [i]);
    const utilises = new Set(etat.associations.flat());
    return [...etat.associations, ...indices.filter(i => !utilises.has(i)).map(i => [i])];
  };
  const prenoms = liste => liste.flatMap(i => sources.get(i) || []).map(m => ecEleve(m.student_id)?.first_name || "Élève").join(" · ");
  // Relire ce qui est saisi avant de redessiner : sinon ajouter un critere effacerait les notes.
  const relire = () => {
    const titre = document.getElementById("ecEqTitre");
    if (titre) etat.titre = titre.value;
    hote.querySelectorAll("[data-ec-crit-label]").forEach(c => { etat.criteres[+c.dataset.ecCritLabel].label = c.value; });
    hote.querySelectorAll("[data-ec-crit-max]").forEach(c => { etat.criteres[+c.dataset.ecCritMax].max = c.value; });
    hote.querySelectorAll("[data-ec-note-groupe]").forEach(c => { etat.notes[c.dataset.ecNoteGroupe] = c.value; });
  };
  const dessiner = (erreur = "") => {
    const groupes = groupesEvalues();
    const utilises = new Set(etat.associations.flat());
    const maximum = etat.criteres.reduce((t, c) => t + (parseInt(c.max, 10) || 0), 0);
    hote.innerHTML = `<div class="ec-feuille ec-eval-equipe">
      <h3>Évaluation d’équipe</h3>
      <p class="muted">${ecTexte(cycle.apsa_name)} · enregistrée dans Évaluations / Tests comme évaluation ponctuelle</p>
      <label for="ecEqTitre">Nom de l’évaluation</label><input id="ecEqTitre" value="${ecTexte(etat.titre)}">
      <section class="ec-eq-bloc violet"><b>Organisation</b>
        ${ecPastilles("ec-eq-mode", [["origine", "Groupes d’origine"], ["associer", "Associer"]], etat.associer ? "associer" : "origine")}
        ${etat.associer ? `<small>Les associations ne modifient jamais les groupes enregistrés.</small>
          ${indices.map(i => `<label class="ec-ligne-groupe${utilises.has(i) ? " pris" : ""}"><span><b>Groupe ${i + 1}</b> · ${ecTexte(prenoms([i]))}</span>
            <input type="checkbox" data-ec-choix="${i}"${etat.choisis.has(i) ? " checked" : ""}${utilises.has(i) ? " disabled" : ""}></label>`).join("")}
          <button type="button" id="ecEqAssocier"${etat.choisis.size >= 2 ? "" : " disabled"}>Créer l’association</button>
          ${etat.associations.map((a, n) => `<div class="ec-ligne-groupe"><b>Association ${n + 1} · ${a.map(i => `G${i + 1}`).join(" + ")}</b>
            <button type="button" class="secondary" data-ec-defaire="${n}">Défaire</button></div>`).join("")}` : ""}
      </section>
      <section class="ec-eq-bloc"><b>Critères et barèmes</b>
        ${etat.criteres.map((c, i) => `<div class="ec-eq-critere">
          <input data-ec-crit-label="${i}" value="${ecTexte(c.label)}" placeholder="Critère" aria-label="Critère ${i + 1}">
          <input data-ec-crit-max="${i}" value="${ecTexte(c.max)}" inputmode="numeric" placeholder="Sur" aria-label="Barème du critère ${i + 1}">
        </div>`).join("")}
        <button type="button" class="secondary" id="ecEqCritere">+ Ajouter un critère</button>
      </section>
      ${groupes.map((g, n) => {
        const cle = g.join("+");
        const total = etat.criteres.reduce((t, _, i) => t + (parseFloat(String(etat.notes[`${cle}|${i}`] || "").replace(",", ".")) || 0), 0);
        return `<section class="ec-eq-bloc blanc"><b>${g.length === 1 ? `Groupe ${g[0] + 1}` : `Association · ${g.map(i => `G${i + 1}`).join(" + ")}`}</b>
          <small>${ecTexte(prenoms(g))}</small>
          ${etat.criteres.map((c, i) => `<label class="ec-eq-note">${ecTexte(c.label || "Critère")} / ${ecTexte(c.max)}
            <input data-ec-note-groupe="${cle}|${i}" value="${ecTexte(etat.notes[`${cle}|${i}`] || "")}" inputmode="decimal"></label>`).join("")}
          <strong>Total : ${ecNombre(total)} / ${maximum}</strong></section>`;
      }).join("")}
      ${erreur ? `<div class="error">${ecTexte(erreur)}</div>` : ""}
      <div class="ec-dialogue-actions">
        <button type="button" class="secondary" id="ecEqAnnuler">Annuler</button>
        <button type="button" id="ecEqEnregistrer">Enregistrer dans Évaluations / Tests</button>
      </div></div>`;

    hote.querySelectorAll("[data-ec-eq-mode]").forEach(b => b.onclick = () => {
      relire(); etat.associer = b.dataset.ecEqMode === "associer"; etat.choisis.clear(); dessiner();
    });
    hote.querySelectorAll("[data-ec-choix]").forEach(c => c.onchange = () => {
      relire(); const i = +c.dataset.ecChoix; c.checked ? etat.choisis.add(i) : etat.choisis.delete(i); dessiner();
    });
    document.getElementById("ecEqAssocier")?.addEventListener("click", () => {
      relire(); etat.associations.push([...etat.choisis].sort((a, b) => a - b)); etat.choisis.clear(); dessiner();
    });
    hote.querySelectorAll("[data-ec-defaire]").forEach(b => b.onclick = () => {
      relire(); etat.associations.splice(+b.dataset.ecDefaire, 1); dessiner();
    });
    document.getElementById("ecEqCritere").onclick = () => { relire(); etat.criteres.push({ label: "", max: "" }); dessiner(); };
    hote.querySelectorAll("[data-ec-note-groupe]").forEach(c => c.onchange = () => { relire(); dessiner(); });
    document.getElementById("ecEqAnnuler").onclick = () => ecOuvrirEquipe(equipe);
    document.getElementById("ecEqEnregistrer").onclick = () => { relire(); enregistrer(); };
  };

  const enregistrer = async () => {
    const criteres = etat.criteres.map(c => ({ label: c.label.trim(), max: parseInt(c.max, 10) }));
    if (!etat.titre.trim() || criteres.some(c => !c.label || !(c.max > 0))) {
      dessiner("Complétez le nom, les critères et les barèmes.");
      return;
    }
    for (const [cle, valeur] of Object.entries(etat.notes)) {
      const n = parseFloat(String(valeur).replace(",", "."));
      const max = criteres[+cle.split("|")[1]]?.max;
      if (String(valeur).trim() && (!Number.isFinite(n) || n < 0 || n > max)) {
        dessiner(`Une note dépasse son barème ou n’est pas un nombre (${valeur}).`);
        return;
      }
    }
    const bouton = document.getElementById("ecEqEnregistrer");
    bouton.disabled = true; bouton.textContent = "Enregistrement…";
    const maintenant = new Date().toISOString();
    const evaluationId = crypto.randomUUID();
    try {
      await ecEnregistrer("evaluations", { id: evaluationId, user_id: session.user_id, cycle_id: cycle.id, type: "PONCTUELLE",
        label: etat.titre.trim(), date_epoch_millis: Date.now(), updated_at: maintenant, deleted: false });
      const lignesCriteres = criteres.map((c, i) => ({ id: crypto.randomUUID(), user_id: session.user_id, evaluation_id: evaluationId,
        label: c.label, max_points: c.max, order_index: i, updated_at: maintenant, deleted: false }));
      for (const c of lignesCriteres) await ecEnregistrer("evaluation_criteria", c);
      for (const g of groupesEvalues()) {
        const cle = g.join("+");
        const eleves = [...new Set(g.flatMap(i => sources.get(i) || []).map(m => m.student_id))];
        for (let i = 0; i < lignesCriteres.length; i++) {
          const valeur = parseFloat(String(etat.notes[`${cle}|${i}`] || "").replace(",", "."));
          if (!Number.isFinite(valeur)) continue;   // une case vide n'est pas un zero
          for (const eleve of eleves) {
            await ecEnregistrer("evaluation_scores", { id: crypto.randomUUID(), user_id: session.user_id,
              criterion_id: lignesCriteres[i].id, student_id: eleve, points: valeur, deleted: false, updated_at: maintenant });
          }
        }
      }
    } catch (e) {
      dessiner(`Évaluation non enregistrée : ${e.message}`);
      return;
    }
    await chargerEvaluationsDuTableauDeBord();
    fermerDetailClasse();
    ecAller("evaluations");
  };
  dessiner();
}

async function ecSupprimerEquipe(equipe) {
  if (!equipe) return;
  if (!confirm(`Supprimer « ${equipe.name} » et sa composition ? Aucun élève de la classe n’est supprimé.`)) return;
  const maintenant = new Date().toISOString();
  try {
    await apiFetch(`${SUPABASE_URL}/rest/v1/saved_team_members?saved_team_id=eq.${equipe.id}`,
      { method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: maintenant }) });
    await apiFetch(`${SUPABASE_URL}/rest/v1/saved_teams?id=eq.${equipe.id}`,
      { method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: maintenant }) });
  } catch (e) { alert(e.message); return; }
  ecEquipes = ecEquipes.filter(t => t.id !== equipe.id);
  fermerDetailClasse();
  renderClassDashboard();
}

// ---- Eleves -----------------------------------------------------------------------------

const EC_NIVEAUX = ["Débutant", "Fragile", "Moyen", "Bon", "Très bon"];

/** Le niveau EPS se stocke de 1 a 5 ; d'anciennes lignes portent encore "MOYEN". */
function ecNiveau(e) {
  const v = String(e.eps_level ?? "").trim().toUpperCase();
  const n = parseInt(v, 10);
  if (n >= 1 && n <= 5) return n;
  return { DEBUTANT: 1, FRAGILE: 2, MOYEN: 3, BON: 4, TRES_BON: 5 }[v] || 3;
}

function ecDessinerEleves(panel) {
  const { label } = dashboardClass;
  const idsDispenses = new Set(dashboardDispenses.filter(d => !d.deleted && dispenseEnCours(d)).map(d => d.student_id));
  const documentsActifs = documentsClasse.filter(d => !d.archived);
  const manquantsDe = e => documentsActifs.filter(doc =>
    !rendusClasse.some(r => r.document_id === doc.id && r.student_id === e.id && r.returned && !r.deleted)).length;
  const q = ecRechercheEleves.trim().toLowerCase();
  const tries = [...dashboardStudents].sort((a, b) =>
    String(a.last_name || "").localeCompare(String(b.last_name || ""), "fr") || String(a.first_name || "").localeCompare(String(b.first_name || ""), "fr"));
  const visibles = tries.filter(e =>
    (!q || `${e.last_name} ${e.first_name}`.toLowerCase().includes(q))
    && (ecFiltreEleves === "DISPENSES" ? idsDispenses.has(e.id) : ecFiltreEleves === "DOCUMENTS" ? manquantsDe(e) > 0 : true));

  panel.innerHTML = `<section class="ec-ecran">
    ${ecBandeau(`${label} · Élèves`, { sous: `${ecPluriel(dashboardStudents.length, "élève")} dans la classe` })}
    <div class="ec-corps">
      <label class="ec-recherche">🔎<input id="ecRechercheEleves" placeholder="Rechercher un élève" value="${ecTexte(ecRechercheEleves)}" aria-label="Rechercher un élève"></label>
      ${ecPastilles("ec-filtre-eleves", [["TOUS", `Tous · ${dashboardStudents.length}`], ["DISPENSES", `Dispensés · ${idsDispenses.size}`], ["DOCUMENTS", "Documents manquants"]], ecFiltreEleves)}
      <div class="ec-titre-liste"><h3>Liste des élèves</h3><small>Classés par nom</small></div>
      <div class="ec-liste" id="ecListeEleves">${visibles.length ? visibles.map(e => {
        const dispense = idsDispenses.has(e.id), manque = manquantsDe(e);
        const etat = dispense ? "Dispensé actuellement" : manque ? `${ecPluriel(manque, "document")} manquant${manque > 1 ? "s" : ""}` : "Dossier à jour";
        const niveau = ecNiveau(e);
        return `<div class="ec-eleve">
          <button type="button" class="ec-eleve-nom" data-ec-dossier="${ecTexte(e.id)}"><b>${ecTexte(ecNomEleve(e))}</b>
            <small class="${dispense ? "rouge" : ""}">${ecTexte(etat)}</small></button>
          <select class="ec-niveau" data-ec-niveau="${ecTexte(e.id)}" aria-label="Niveau EPS de ${ecTexte(ecNomEleve(e))}">${
            EC_NIVEAUX.map((n, i) => `<option value="${i + 1}"${i + 1 === niveau ? " selected" : ""}>Niveau ${i + 1} · ${n}</option>`).join("")}</select>
        </div>`;
      }).join("") : `<p class="ec-vide">Aucun élève ne correspond.</p>`}</div>
      <button type="button" class="ec-bouton-large" id="ecPdfListe">Télécharger la liste en PDF</button>
    </div></section>`;

  panel.querySelector("[data-ec-retour]").onclick = () => ecAller("bord");
  const recherche = document.getElementById("ecRechercheEleves");
  recherche.oninput = () => {
    ecRechercheEleves = recherche.value;
    const position = recherche.selectionStart;
    renderClassDashboard();
    const champ = document.getElementById("ecRechercheEleves");
    champ.focus(); champ.setSelectionRange(position, position);
  };
  panel.querySelectorAll("[data-ec-filtre-eleves]").forEach(b => b.onclick = () => { ecFiltreEleves = b.dataset.ecFiltreEleves; renderClassDashboard(); });
  panel.querySelectorAll("[data-ec-dossier]").forEach(b => b.onclick = () => ouvrirDossierEleve(b.dataset.ecDossier));
  panel.querySelectorAll("[data-ec-niveau]").forEach(s => s.onchange = () => ecChangerNiveau(s.dataset.ecNiveau, s.value, s));
  document.getElementById("ecPdfListe").onclick = () => ecImprimerListe();
}

async function ecChangerNiveau(studentId, niveau, champ) {
  const eleve = ecEleve(studentId);
  if (!eleve) return;
  const avant = eleve.eps_level;
  champ.disabled = true;
  try {
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${studentId}`,
      { method: "PATCH", body: JSON.stringify({ eps_level: String(niveau), updated_at: new Date().toISOString() }) });
    if (res && res.ok === false) throw new Error("Le niveau n’a pas été enregistré.");
    eleve.eps_level = String(niveau);
  } catch (e) {
    eleve.eps_level = avant;
    alert(e.message);
  }
  champ.disabled = false;
  renderClassDashboard();
}

function ecImprimerListe() {
  const eleves = [...dashboardStudents].sort((a, b) => String(a.last_name || "").localeCompare(String(b.last_name || ""), "fr"));
  ecImprimerTableau({
    titre: `Liste des élèves · ${dashboardClass.label}`,
    entetes: ["N°", "Nom", "Prénom", "Niveau"],
    lignes: eleves.map((e, i) => [String(i + 1), String(e.last_name || "").toUpperCase(), e.first_name || "", `Niveau ${ecNiveau(e)}`])
  });
}

// ---- Evaluations / Tests ----------------------------------------------------------------

function ecDessinerEvaluations(panel) {
  const { label } = dashboardClass;
  const { evaluations, tests, cycle } = ecEvaluationsSuivies();
  const filtrees = evaluations.filter(e => ecFiltreEvaluations === "Toutes"
    || (ecFiltreEvaluations === "Ponctuelles" ? e.type !== "FINALE" : e.type === "FINALE"));
  const terminees = evaluations.filter(e => ecAvancementGrille(e.id).evalues > 0).length;
  const eleves = dashboardStudents.length;

  panel.innerHTML = `<section class="ec-ecran">
    ${ecBandeau(`${label} · Évaluations / Tests`, { sous: cycle ? `${cycle.apsa_name} · période ${dashboardPeriod}` : `Période ${dashboardPeriod}` })}
    <div class="ec-corps">
      ${ecPastilles("ec-filtre-eval", [["Toutes", "Toutes"], ["Ponctuelles", "Ponctuelles"], ["Finales", "Finales"]], ecFiltreEvaluations)}
      <div class="ec-stats">
        ${ecStat(evaluations.length + tests.length, "évaluations", "#185FA5")}
        ${ecStat(terminees, "terminées", "#0F6E56")}
        ${ecStat(Math.max(0, evaluations.length - terminees), "à poursuivre", "#BA7517")}
      </div>
      <div class="ec-creer">
        <button type="button" id="ecCreerPonctuelle" style="--fond:#FFE9D6;--accent:#D8691A"><i>✓</i><span><b>Évaluation ponctuelle</b><small>Suivre les progrès</small></span></button>
        <button type="button" id="ecCreerFinale" style="--fond:#EEEDFE;--accent:#7952D9"><i>✓</i><span><b>Évaluation finale</b><small>Bilan du cycle</small></span></button>
        <button type="button" id="ecTests" style="--fond:#DFF3FF;--accent:#087DCA"><i>⏱</i><span><b>Tests EPS</b><small>${tests.length ? ecPluriel(tests.length, "session") : "Mesures terrain"}</small></span></button>
        <button type="button" id="ecDivers" style="--fond:#E4F6EC;--accent:#16845B"><i>🤸</i><span><b>Divers EPS</b><small>Groupes Acrosport, travaux</small></span></button>
      </div>
      <button type="button" class="ec-carte-lien" data-vue="recap">
        <i>▦</i><span><b>Récapitulatif Tests / Évaluations</b>
        <small>P${dashboardPeriod} · ${ecPluriel(tests.length, "test")} · ${ecPluriel(evaluations.length, "évaluation")} · PDF, tableur, courriel</small></span><em>›</em>
      </button>
      <div class="ec-liste">${filtrees.length ? filtrees.map(e => {
        const { evalues } = ecAvancementGrille(e.id);
        const complet = eleves > 0 && evalues >= eleves;
        return `<button type="button" class="ec-evaluation" data-ec-grille="${ecTexte(e.id)}">
          <span class="ec-evaluation-tete"><span><b>${ecTexte(e.label || "Évaluation")}</b>
            <small>${e.type === "FINALE" ? "Finale" : "Ponctuelle"}${e.activite ? ` · ${ecTexte(e.activite)}` : ""}</small></span>
            <small>${ecDateCourte(e.date_epoch_millis)}</small></span>
          <strong class="${complet ? "vert" : ""}">${ecNotesChargees ? `${evalues} / ${eleves} élèves évalués` : "…"}</strong>
          ${ecJauge(eleves ? evalues / eleves : 0, "#2E7CC4")}
          <small class="ec-aide">Appui prolongé : dupliquer vers une classe</small>
        </button>`;
      }).join("") : `<div class="ec-vide-carte"><b>Aucune évaluation enregistrée</b>
          <span>Utilisez l’un des deux premiers boutons pour créer la première évaluation.</span></div>`}</div>
    </div></section>`;

  panel.querySelector("[data-ec-retour]").onclick = () => ecAller("bord");
  panel.querySelectorAll("[data-ec-filtre-eval]").forEach(b => b.onclick = () => { ecFiltreEvaluations = b.dataset.ecFiltreEval; renderClassDashboard(); });
  panel.querySelector('[data-vue="recap"]').onclick = () => { ecOngletRecap = "tests"; ecAller("recap"); };
  document.getElementById("ecCreerPonctuelle").onclick = () => ouvrirEvaluationDepuisClasse(cycle, "PONCTUELLE");
  document.getElementById("ecCreerFinale").onclick = () => ouvrirEvaluationDepuisClasse(cycle, "FINALE");
  document.getElementById("ecTests").onclick = () => ecOuvrirTests(tests);
  document.getElementById("ecDivers").onclick = () => ecOuvrirDivers();
  panel.querySelectorAll("[data-ec-grille]").forEach(b => {
    const e = evaluations.find(x => x.id === b.dataset.ecGrille);
    b.onclick = () => { if (e?.cycle) ouvrirTableauDeNotes(e.cycle, e.type, e.id); };
    ecAppuiLong(b, () => ecChoisirClassePourCopie(e));
  });
  // Les jauges se remplissent une fois les notes relues.
  if (!ecNotesChargees) ecChargerNotes().then(() => { if (vueClasse === "evaluations") renderClassDashboard(); });
}

function ecOuvrirTests(tests) {
  const hote = hoteDetail();
  const resultats = id => new Set(ecResultatsTests.filter(r => r.session_id === id).map(r => r.student_id)).size;
  hote.innerHTML = `<div class="ec-feuille">
    <h3>Tests EPS enregistrés</h3>
    <p class="muted">Période ${dashboardPeriod} · clic : reprendre · appui prolongé : supprimer</p>
    <div class="ec-liste">${tests.length ? tests.map(t => {
      const n = resultats(t.id);
      return `<button type="button" class="ec-test" data-ec-test="${ecTexte(t.id)}"><b>${ecTexte(t.test_name || "Test")}</b>
        <small>Période ${Number(t.period_number) || 1} · ${new Date(Number(t.created_at) || Date.parse(t.created_at)).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · ${n ? ecPluriel(n, "élève") : "aucun résultat"}</small>
        <em>Cliquez pour consulter ou modifier</em></button>`;
    }).join("") : `<p class="ec-vide">Aucun test EPS enregistré pour cette classe sur la période.</p>`}</div>
    <div class="ec-dialogue-actions"><button type="button" class="secondary" id="ecFermerTests">Fermer</button></div>
  </div>`;
  ouvrirDetailClasse();
  document.getElementById("ecFermerTests").onclick = () => fermerDetailClasse();
  hote.querySelectorAll("[data-ec-test]").forEach(b => {
    const t = tests.find(x => x.id === b.dataset.ecTest);
    const ouvrir = () => { fermerDetailClasse(); ouvrirSessionTestDepuisClasse(t.id, dashboardClass.row.id, t.period_number || 1, t.test_name); };
    b.onclick = ouvrir;
    ecAppuiLong(b, () => ecActions(t.test_name || "Test", `Période ${Number(t.period_number) || 1}`, [
      { libelle: "Ouvrir et modifier", action: ouvrir },
      { libelle: "Supprimer", danger: true, action: () => ecSupprimerTest(t) }
    ]));
  });
}

async function ecSupprimerTest(t) {
  if (!confirm(`Supprimer la session « ${t.test_name || "Test"} » et ses résultats ?`)) return;
  const maintenant = new Date().toISOString();
  try {
    await apiFetch(`${SUPABASE_URL}/rest/v1/eps_test_results?session_id=eq.${t.id}`,
      { method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: maintenant }) });
    await apiFetch(`${SUPABASE_URL}/rest/v1/eps_test_sessions?id=eq.${t.id}`,
      { method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: maintenant }) });
  } catch (e) { alert(e.message); return; }
  dashboardTests = dashboardTests.filter(x => x.id !== t.id);
  ecResultatsTests = ecResultatsTests.filter(r => r.session_id !== t.id);
  fermerDetailClasse();
  renderClassDashboard();
}

/** Choisir la classe qui recoit la copie d'une grille. */
function ecChoisirClassePourCopie(evaluation) {
  if (!evaluation) return;
  const hote = hoteDetail();
  const cibles = (classesConnues || []).filter(c => !c.deleted && c.id !== dashboardClass.row.id)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr", { numeric: true }));
  hote.innerHTML = `<div class="ec-feuille">
    <h3>Dupliquer vers une classe</h3>
    <p class="muted">« ${ecTexte(evaluation.label || "Évaluation")} » et ses critères, sans les notes. La copie rejoint le cycle
      ${ecTexte(evaluation.activite || "de la même activité")} de la classe choisie, créé au besoin.</p>
    <div class="ec-liste">${cibles.length ? cibles.map(c => `<button type="button" class="ec-ligne" data-ec-cible="${ecTexte(c.id)}">
      <span><b>${ecTexte(c.name || "Classe")}</b></span><em>›</em></button>`).join("")
      : `<p class="ec-vide">Aucune autre classe.</p>`}</div>
    <div class="ec-dialogue-actions"><button type="button" class="secondary" id="ecAnnulerCopie">Annuler</button></div>
  </div>`;
  ouvrirDetailClasse();
  document.getElementById("ecAnnulerCopie").onclick = () => fermerDetailClasse();
  hote.querySelectorAll("[data-ec-cible]").forEach(b => b.onclick = () =>
    ecDupliquerEvaluation(evaluation, cibles.find(c => c.id === b.dataset.ecCible)));
}

/**
 * Copie une grille et ses criteres dans une autre classe, comme duplicateEvaluation de
 * l'application : le cycle d'enseignement de la meme activite s'il existe, sinon celui de la
 * periode 1 cree depuis le planning, cree ici au besoin. Les notes ne suivent pas.
 */
async function ecDupliquerEvaluation(evaluation, cible) {
  if (!evaluation || !cible) return;
  const hote = hoteDetail();
  hote.innerHTML = `<div class="ec-feuille"><p class="muted">Copie vers ${ecTexte(cible.name)}…</p></div>`;
  const source = evaluation.cycle || dashboardCycles.find(c => c.id === evaluation.cycle_id);
  const maintenant = new Date().toISOString();
  const fin = html => {
    hote.innerHTML = `<div class="ec-feuille">${html}
      <div class="ec-dialogue-actions"><button type="button" id="ecFinCopie">Fermer</button></div></div>`;
    document.getElementById("ecFinCopie").onclick = () => fermerDetailClasse();
  };
  try {
    if (!source) throw new Error("le cycle de la grille est introuvable");
    if (!ecNotesChargees) await ecChargerNotes();
    const cycles = typeof modeHorsConnexion !== "undefined" && modeHorsConnexion
      ? (await modeHorsConnexion.lire("cycles", { ou: c => c.class_id === cible.id })).rows
      : await (await apiFetch(`${SUPABASE_URL}/rest/v1/cycles?deleted=eq.false&class_id=eq.${cible.id}&select=*`)).json();
    const memes = cycles.filter(c => !c.deleted && memeActivite(c.apsa_name, source.apsa_name));
    let cycle = memes.find(c => !String(c.priority_objective || "").startsWith("planning-period-"))
      || memes.find(c => c.priority_objective === "planning-period-1");
    if (!cycle) {
      cycle = { id: crypto.randomUUID(), user_id: session.user_id, class_id: cible.id, grade: cible.grade,
        apsa_name: source.apsa_name, session_count: 8, current_session_number: 1, priority_objective: "planning-period-1",
        installation: source.installation || null, school_year: cible.school_year || dashboardClass.row.school_year || null,
        updated_at: maintenant, deleted: false };
      await ecEnregistrer("cycles", cycle);
    }
    const copieId = crypto.randomUUID();
    await ecEnregistrer("evaluations", { id: copieId, user_id: session.user_id, cycle_id: cycle.id, type: evaluation.type,
      label: `${evaluation.label || "Évaluation"} (copie)`, date_epoch_millis: Number(evaluation.date_epoch_millis) || Date.now(),
      updated_at: maintenant, deleted: false });
    const criteres = ecCriteres.filter(c => c.evaluation_id === evaluation.id && !c.deleted)
      .sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
    for (let i = 0; i < criteres.length; i++) {
      await ecEnregistrer("evaluation_criteria", { id: crypto.randomUUID(), user_id: session.user_id, evaluation_id: copieId,
        label: criteres[i].label, max_points: criteres[i].max_points, order_index: i, updated_at: maintenant, deleted: false });
    }
    fin(`<h3>Copie créée</h3><p id="ecCopieFaite">« ${ecTexte(evaluation.label || "Évaluation")} (copie) » est dans ${ecTexte(cible.name)},
      cycle ${ecTexte(source.apsa_name)}, avec ${ecPluriel(criteres.length, "critère")}.</p>`);
  } catch (e) {
    fin(`<div class="error">Copie impossible : ${ecTexte(e.message)}</div>`);
  }
}

/**
 * Rouvre un travail d'outil enregistre, avec son contenu et sa classe.
 *
 * Les outils savent reprendre un travail (renderTournamentWeb(travail)...), mais repartaient en
 * « Utilisation libre » : on repose la classe et la periode, comme au moment de l'enregistrement.
 */
async function ecRouvrirTravail(travail) {
  const outils = { tournament: "renderTournamentWeb", observer: "renderObserverWeb",
    rotations: "renderRotationsWeb", acrosport: "renderAcrosportWeb" };
  const dessin = globalThis[outils[travail.type]];
  fermerDetailClasse();
  showTab("outils");
  if (typeof dessin !== "function") { openTool(travail.type); return; }
  stopToolTimer();
  toolPanel = document.getElementById("toolPanel");
  document.getElementById("toolsWorkspace")?.setAttribute("hidden", "");
  toolPanel.style.display = "block";
  toolPanel.classList.add("modern-tool-panel");
  await dessin(travail);
  const mode = document.getElementById("modernMode"), classe = document.getElementById("modernClass");
  const periode = document.getElementById("modernPeriod");
  if (periode) periode.value = String(travail.period || 1);
  if (mode && classe && travail.classId) {
    mode.value = "class"; mode.dispatchEvent(new Event("change"));
    classe.disabled = false; classe.value = travail.classId; classe.dispatchEvent(new Event("change"));
  }
  toolPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Les travaux d'outils enregistres pour cette classe dans ce navigateur (tools-workspace.js). */
function ecTravauxDeLaClasse() {
  const compte = typeof session !== "undefined" && session?.user_id ? session.user_id : "local";
  try {
    return JSON.parse(localStorage.getItem(`eps_tool_works:${compte}`) || "[]")
      .filter(w => w && w.classId === dashboardClass.row.id);
  } catch { return []; }
}

function ecOuvrirDivers() {
  const hote = hoteDetail();
  const acro = ecEquipes.filter(t => String(t.mode || "").startsWith("ACROSPORT_P"));
  const travaux = ecTravauxDeLaClasse();
  hote.innerHTML = `<div class="ec-feuille">
    <h3>${ecTexte(dashboardClass.label)} · Divers EPS</h3>
    <p class="muted">Clic : ouvrir et modifier · appui prolongé : supprimer</p>
    <div class="ec-liste">
      ${acro.map(t => `<button type="button" class="ec-test vert" data-ec-acro="${ecTexte(t.id)}"><b>${ecTexte(t.name)}</b>
        <small>Période ${ecTexte(String(t.mode).replace("ACROSPORT_P", "").split("_")[0])} · créé le ${ecJour(t.created_at)}</small>
        <em>Groupes Acrosport</em></button>`).join("")}
      ${travaux.map(w => `<button type="button" class="ec-test" data-ec-travail="${ecTexte(w.id)}"><b>${ecTexte(w.title || "Travail")}</b>
        <small>${ecTexte((globalThis.EpsToolsCatalog || []).find(o => o.id === w.type)?.title || "Travail EPS")} · période ${Number(w.period) || 1} · ${ecJour(w.updatedAt)}</small></button>`).join("")}
      ${acro.length || travaux.length ? "" : `<div class="ec-vide-carte"><b>Aucun travail enregistré</b>
        <span>Les groupes, observations, tournois et mesures de ${ecTexte(dashboardClass.label)} apparaîtront ici.</span></div>`}
    </div>
    <div class="ec-dialogue-actions"><button type="button" class="secondary" id="ecFermerDivers">Fermer</button></div>
  </div>`;
  ouvrirDetailClasse();
  document.getElementById("ecFermerDivers").onclick = () => fermerDetailClasse();
  hote.querySelectorAll("[data-ec-acro]").forEach(b => {
    const t = acro.find(x => x.id === b.dataset.ecAcro);
    // Les groupes Acrosport enregistres par l'application sont des compositions : elles
    // s'ouvrent comme les autres equipes, pour les consulter ou les modifier.
    b.onclick = () => ecOuvrirEquipe(t);
    ecAppuiLong(b, () => ecSupprimerEquipe(t));
  });
  hote.querySelectorAll("[data-ec-travail]").forEach(b => {
    const w = travaux.find(x => x.id === b.dataset.ecTravail);
    b.onclick = () => ecRouvrirTravail(w);
    ecAppuiLong(b, () => {
      if (!confirm(`Supprimer « ${w.title || "Travail"} » ?`)) return;
      const compte = typeof session !== "undefined" && session?.user_id ? session.user_id : "local";
      try {
        const tous = JSON.parse(localStorage.getItem(`eps_tool_works:${compte}`) || "[]");
        localStorage.setItem(`eps_tool_works:${compte}`, JSON.stringify(tous.filter(x => x.id !== w.id)));
      } catch { /* stockage indisponible */ }
      ecOuvrirDivers();
    });
  });
}

// ---- Recapitulatif ----------------------------------------------------------------------

/** Le resultat d'un test, tel qu'on le lit : "incomplet · 3/6 ateliers" reste en toutes lettres. */
function ecResultatTest(r) {
  const unite = String(r.result_unit || "");
  if (unite.startsWith("incomplet")) return unite;
  return `${ecNombre(r.result_value)} ${unite}`.trim();
}

/** Le tableau de ce qu'on regarde : un test ou une grille, eleve par eleve. */
function ecTableauRecap() {
  if (!ecRecapChoix) return null;
  if (ecRecapChoix.type === "test") {
    const t = dashboardTests.find(x => x.id === ecRecapChoix.id);
    const lignes = ecResultatsTests.filter(r => r.session_id === ecRecapChoix.id)
      .map(r => ({ eleve: ecEleve(r.student_id), r }))
      .sort((a, b) => ecNomEleve(a.eleve).localeCompare(ecNomEleve(b.eleve), "fr"));
    return {
      titre: `${t?.test_name || "Test"} · ${dashboardClass.label} · P${Number(t?.period_number) || dashboardPeriod}`,
      entetes: ["Élève", "Résultat"],
      lignes: lignes.map(({ eleve, r }) => [ecNomEleve(eleve), ecResultatTest(r)])
    };
  }
  const e = dashboardEvaluations.find(x => x.id === ecRecapChoix.id);
  const { maximum, criteres, notes } = ecAvancementGrille(ecRecapChoix.id);
  const eleves = [...dashboardStudents].sort((a, b) => ecNomEleve(a).localeCompare(ecNomEleve(b), "fr"));
  return {
    titre: `${e?.label || "Évaluation"} · ${dashboardClass.label} · P${dashboardPeriod}`,
    entetes: ["Élève", ...criteres.map(c => `${c.label} / ${ecNombre(c.max_points)}`), "Note", "Barème"],
    lignes: eleves.map(el => {
      const siennes = notes.filter(n => n.student_id === el.id);
      const parCritere = criteres.map(c => {
        const n = siennes.find(x => x.criterion_id === c.id);
        return n && n.points != null ? ecNombre(n.points) : "";
      });
      const total = siennes.reduce((t, n) => t + (Number(n.points) || 0), 0);
      return [ecNomEleve(el), ...parCritere, siennes.length ? ecNombre(total) : "non noté", ecNombre(maximum)];
    })
  };
}

function ecDessinerRecap(panel) {
  const { label } = dashboardClass;
  const { evaluations, tests } = ecEvaluationsSuivies();
  const tableau = ecTableauRecap();
  let contenu;
  if (!ecNotesChargees) {
    contenu = `<p class="muted">Chargement des résultats…</p>`;
  } else if (tableau) {
    contenu = `<button type="button" class="ec-lien" id="ecRecapListe">‹ ${ecOngletRecap === "tests" ? "Liste des tests" : "Liste des évaluations"}</button>
      <h3 class="ec-recap-titre">${ecTexte(tableau.titre)}</h3>
      <div class="ec-tableau-defile"><table class="ec-tableau">
        <thead><tr>${tableau.entetes.map(h => `<th>${ecTexte(h)}</th>`).join("")}</tr></thead>
        <tbody>${tableau.lignes.length ? tableau.lignes.map(l => `<tr>${l.map(c => `<td>${ecTexte(c)}</td>`).join("")}</tr>`).join("")
          : `<tr><td colspan="${tableau.entetes.length}" class="ec-vide">Aucun résultat.</td></tr>`}</tbody>
      </table></div>
      <div class="ec-export">
        <button type="button" id="ecExportPdf">PDF</button>
        <button type="button" id="ecExportCsv">Tableur</button>
        <button type="button" id="ecExportMail">Courriel</button>
      </div>`;
  } else if (ecOngletRecap === "tests") {
    contenu = tests.length ? `<div class="ec-liste">${tests.map(t => {
      const n = new Set(ecResultatsTests.filter(r => r.session_id === t.id).map(r => r.student_id)).size;
      return `<button type="button" class="ec-ligne" data-ec-recap-test="${ecTexte(t.id)}"><span><b>${ecTexte(t.test_name || "Test")}</b>
        <small>${ecPluriel(n, "résultat")}</small></span><em>›</em></button>`;
    }).join("")}</div>` : `<p class="ec-vide">Aucun test enregistré pendant cette période.</p>`;
  } else {
    contenu = evaluations.length ? `<div class="ec-liste">${evaluations.map(e => {
      const { evalues } = ecAvancementGrille(e.id);
      return `<button type="button" class="ec-ligne" data-ec-recap-eval="${ecTexte(e.id)}"><span><b>${ecTexte(e.label || "Évaluation")}</b>
        <small>${e.type === "FINALE" ? "finale" : "ponctuelle"} · ${ecPluriel(evalues, "élève")} noté${evalues > 1 ? "s" : ""}</small></span><em>›</em></button>`;
    }).join("")}</div>` : `<p class="ec-vide">Aucune évaluation créée pendant cette période.</p>`;
  }

  panel.innerHTML = `<section class="ec-ecran" id="ecRecap">
    ${ecBandeau(`${label} · Récapitulatif`, { sous: `Période ${dashboardPeriod}` })}
    <div class="ec-corps">
      ${ecPastilles("ec-onglet-recap", [["tests", "Tests"], ["evaluations", "Évaluations"]], ecOngletRecap)}
      ${contenu}
    </div></section>`;

  panel.querySelector("[data-ec-retour]").onclick = () => ecAller("evaluations");
  panel.querySelectorAll("[data-ec-onglet-recap]").forEach(b => b.onclick = () => {
    ecOngletRecap = b.dataset.ecOngletRecap; ecRecapChoix = null; renderClassDashboard();
  });
  panel.querySelectorAll("[data-ec-recap-test]").forEach(b => b.onclick = () => { ecRecapChoix = { type: "test", id: b.dataset.ecRecapTest }; renderClassDashboard(); });
  panel.querySelectorAll("[data-ec-recap-eval]").forEach(b => b.onclick = () => { ecRecapChoix = { type: "evaluation", id: b.dataset.ecRecapEval }; renderClassDashboard(); });
  document.getElementById("ecRecapListe")?.addEventListener("click", () => { ecRecapChoix = null; renderClassDashboard(); });
  if (tableau) {
    document.getElementById("ecExportPdf").onclick = () => ecImprimerTableau(tableau);
    document.getElementById("ecExportCsv").onclick = () => ecTelechargerCsv(tableau);
    document.getElementById("ecExportMail").onclick = () => ecEnvoyerCourriel(tableau);
  }
  if (!ecNotesChargees) ecChargerNotes().then(() => { if (vueClasse === "recap") renderClassDashboard(); });
}

// ---- Exports ----------------------------------------------------------------------------

const ecNomFichier = titre => String(titre).normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";

/** Le point-virgule et le BOM : c'est ce qu'attend Excel en francais. */
function ecTelechargerCsv(tableau) {
  const cellule = v => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texte = "﻿" + [tableau.entetes, ...tableau.lignes].map(l => l.map(cellule).join(";")).join("\r\n");
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([texte], { type: "text/csv;charset=utf-8" }));
  lien.download = `${ecNomFichier(tableau.titre)}.csv`;
  document.body.appendChild(lien); lien.click(); lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
}

/** Une page propre a imprimer ou enregistrer en PDF, avec l'en-tete du lycee. */
function ecImprimerTableau(tableau) {
  const w = open("", "_blank");
  if (!w) { alert("Autorisez les fenêtres surgissantes pour enregistrer le PDF."); return; }
  const e = v => planningText(String(v ?? ""));
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${e(tableau.titre)}</title>
    <base href="${location.href.replace(/[^/]*$/, "")}">
    <style>@page{size:A4;margin:14mm}body{font:12px Arial,sans-serif;color:#173a57;margin:0}
    .tete{display:flex;align-items:center;border-bottom:3px solid #2E7CC4;padding-bottom:10px}
    .tete img{width:200px;max-height:70px;object-fit:contain}.tete div{margin-left:auto;text-align:right;line-height:1.5}
    h1{font-size:19px;color:#2E7CC4;margin:18px 0 10px}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ccd9e2;padding:7px;text-align:left}th{background:#2E7CC4;color:#fff}
    tr:nth-child(even) td{background:#f4f8fc}.pied{margin-top:20px;color:#607b8d}
    button{margin-top:16px;padding:10px 16px;border:0;border-radius:8px;background:#2E7CC4;color:#fff;font-weight:700}
    @media print{button{display:none}}</style></head><body>
    <header class="tete"><img src="assets/lvh.jpeg" alt=""><div><b>Lycée Victor Hugo</b><br>Service EPS</div></header>
    <h1>${e(tableau.titre)}</h1>
    <table><thead><tr>${tableau.entetes.map(h => `<th>${e(h)}</th>`).join("")}</tr></thead>
    <tbody>${tableau.lignes.map(l => `<tr>${l.map(c => `<td>${e(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <p class="pied">Document généré le ${new Date().toLocaleDateString("fr-FR")} depuis l’espace EPS.</p>
    <button onclick="print()">Enregistrer / imprimer en PDF</button></body></html>`);
  w.document.close();
}

/** Le meme tableau dans le corps d'un courriel : la messagerie du poste choisit le destinataire. */
function ecEnvoyerCourriel(tableau) {
  const corps = [tableau.titre, "", tableau.entetes.join(" · "), ...tableau.lignes.map(l => l.join(" · "))].join("\n");
  location.href = `mailto:?subject=${encodeURIComponent(tableau.titre)}&body=${encodeURIComponent(corps)}`;
}

// ---- Documents a rendre -----------------------------------------------------------------

function ecDessinerDocuments(panel) {
  const { label } = dashboardClass;
  const eleves = [...dashboardStudents].sort((a, b) => ecNomEleve(a).localeCompare(ecNomEleve(b), "fr"));
  const actifs = documentsClasse.filter(d => !d.archived);
  const archives = documentsClasse.filter(d => d.archived);
  const rendu = (docId, eleveId) => rendusClasse.some(r => r.document_id === docId && r.student_id === eleveId && r.returned && !r.deleted);
  const nbRendus = docId => eleves.filter(e => rendu(docId, e.id)).length;
  const totalRendus = documentsClasse.reduce((t, d) => t + nbRendus(d.id), 0);
  const totalManquants = documentsClasse.reduce((t, d) => t + Math.max(0, eleves.length - nbRendus(d.id)), 0);
  const suivi = ecDocumentSuivi ? documentsClasse.find(d => d.id === ecDocumentSuivi) : null;

  let contenu;
  if (suivi) {
    contenu = `<div class="ec-suivi-tete"><button type="button" class="ec-retour-doux" id="ecFinSuivi" aria-label="Retour aux documents">←</button>
        <span><b>${ecTexte(suivi.title)}</b><small>${nbRendus(suivi.id)} / ${eleves.length} rendus · cliquez un élève pour changer son état</small></span></div>
      <div class="ec-liste">${eleves.map(e => {
        const ok = rendu(suivi.id, e.id);
        return `<button type="button" class="ec-rendu-ligne ${ok ? "ok" : "ko"}" data-ec-rendu="${ecTexte(e.id)}">
          <b>${ecTexte(ecNomEleve(e))}</b><span>${ok ? "✔ Rendu" : "○ Manquant"}</span></button>`;
      }).join("") || `<p class="ec-vide">Aucun élève dans la classe.</p>`}</div>
      <div class="ec-dialogue-actions">
        <button type="button" class="secondary" id="ecArchiverSuivi">${suivi.archived ? "Restaurer dans À rendre" : "Archiver ce document"}</button>
        <button type="button" id="ecFinSuivi2">Terminé</button>
      </div>`;
  } else if (ecDocumentsArchives) {
    contenu = archives.length ? `<div class="ec-liste">${archives.map(d => `<button type="button" class="ec-ligne" data-ec-doc="${ecTexte(d.id)}">
        <i class="ec-doc-icone">📄</i><span><b>${ecTexte(d.title)}</b><small>Créé le ${ecDateCourte(d.created_at)} · ${nbRendus(d.id)} / ${eleves.length} rendus</small></span><em>›</em></button>`).join("")}</div>
        <p class="ec-aide">Appui prolongé : modifier ou supprimer</p>`
      : `<div class="ec-vide-carte"><b>Aucun document classé pour le moment</b></div>`;
  } else if (!actifs.length) {
    contenu = `<button type="button" class="ec-vide-carte ec-cliquable" id="ecPremierDocument"><b>Ajouter le premier document</b>
      <span>Autorisation de sortie, fiche santé, coupon signé : cochez ensuite qui l’a rapporté.</span></button>`;
  } else {
    contenu = `<div class="ec-grille-docs" style="--colonnes:${actifs.length}">
        <div class="ec-grille-coin"><b>ÉLÈVES</b><small>${ecPluriel(eleves.length, "inscrit")}</small></div>
        ${actifs.map(d => `<button type="button" class="ec-grille-doc" data-ec-doc="${ecTexte(d.id)}"><b>${ecTexte(d.title)}</b>
          <small>${nbRendus(d.id)} / ${eleves.length} rendus</small></button>`).join("")}
        ${eleves.map(e => `<div class="ec-grille-nom"><b>${ecTexte(String(e.last_name || "").toUpperCase())}</b><small>${ecTexte(e.first_name || "")}</small></div>
          ${actifs.map(d => {
            const ok = rendu(d.id, e.id);
            return `<button type="button" class="ec-grille-case ${ok ? "ok" : "ko"}" data-ec-case="${ecTexte(d.id)}|${ecTexte(e.id)}"
              aria-label="${ecTexte(ecNomEleve(e))} · ${ecTexte(d.title)} : ${ok ? "rendu" : "manquant"}">${ok ? "✔ Rendu" : "○ Manquant"}</button>`;
          }).join("")}`).join("")}
        <div class="ec-grille-coin vide"></div>
        ${actifs.map(d => `<button type="button" class="secondary ec-grille-archiver" data-ec-archiver="${ecTexte(d.id)}">Archiver</button>`).join("")}
      </div>
      <p class="ec-aide">Faites glisser les documents · clic sur un titre : suivi · appui prolongé : modifier ou supprimer</p>`;
  }

  panel.innerHTML = `<section class="ec-ecran">
    ${ecBandeau(`${label} · Documents à rendre`, { ajout: true })}
    <div class="ec-corps">
      ${suivi ? "" : ecPastilles("ec-onglet-docs", [["rendre", `À rendre (${actifs.length})`], ["archives", `Archives · classés (${archives.length})`]], ecDocumentsArchives ? "archives" : "rendre")}
      ${suivi ? "" : `<div class="ec-stats">${ecStat(documentsClasse.length, "documents", "#185FA5")}${ecStat(totalRendus, "rendus", "#0F6E56")}${ecStat(totalManquants, "manquants", "#A32D2D")}</div>`}
      ${contenu}
    </div></section>`;

  panel.querySelector("[data-ec-retour]").onclick = () => suivi ? (ecDocumentSuivi = null, renderClassDashboard()) : ecAller("bord");
  panel.querySelector("[data-ec-ajout]").onclick = () => ajouterDocumentClasse();
  document.getElementById("ecPremierDocument")?.addEventListener("click", () => ajouterDocumentClasse());
  panel.querySelectorAll("[data-ec-onglet-docs]").forEach(b => b.onclick = () => { ecDocumentsArchives = b.dataset.ecOngletDocs === "archives"; renderClassDashboard(); });
  panel.querySelectorAll("[data-ec-doc]").forEach(b => {
    const doc = documentsClasse.find(d => d.id === b.dataset.ecDoc);
    b.onclick = () => { ecDocumentSuivi = doc.id; renderClassDashboard(); };
    ecAppuiLong(b, () => ecActionsDocument(doc));
  });
  panel.querySelectorAll("[data-ec-case]").forEach(b => b.onclick = async () => {
    const [docId, eleveId] = b.dataset.ecCase.split("|");
    b.disabled = true;
    await basculerRenduClasse(docId, eleveId);
    renderClassDashboard();
  });
  panel.querySelectorAll("[data-ec-rendu]").forEach(b => b.onclick = async () => {
    b.disabled = true;
    await basculerRenduClasse(suivi.id, b.dataset.ecRendu);
    renderClassDashboard();
  });
  panel.querySelectorAll("[data-ec-archiver]").forEach(b => b.onclick = () => basculerArchiveDocument(documentsClasse.find(d => d.id === b.dataset.ecArchiver)));
  const finSuivi = () => { ecDocumentSuivi = null; renderClassDashboard(); };
  document.getElementById("ecFinSuivi")?.addEventListener("click", finSuivi);
  document.getElementById("ecFinSuivi2")?.addEventListener("click", finSuivi);
  document.getElementById("ecArchiverSuivi")?.addEventListener("click", () => { ecDocumentSuivi = null; basculerArchiveDocument(suivi); });
}

function ecActionsDocument(doc) {
  if (!doc) return;
  ecActions(doc.title, "Actions sur le document", [
    { libelle: "Modifier les rendus", action: () => { ecDocumentSuivi = doc.id; renderClassDashboard(); } },
    { libelle: "Renommer", action: () => ecRenommerDocument(doc) },
    { libelle: doc.archived ? "Restaurer dans À rendre" : "Archiver", action: () => basculerArchiveDocument(doc) },
    { libelle: "Supprimer", danger: true, action: () => supprimerDocumentClasse(doc) }
  ]);
}

async function ecRenommerDocument(doc) {
  const titre = await ecDemanderTexte({ titre: "Modifier le document", etiquette: "Nom du document", valeur: doc.title });
  if (!titre || titre === doc.title) return;
  const maintenant = new Date().toISOString();
  try {
    await apiFetch(`${SUPABASE_URL}/rest/v1/class_documents?id=eq.${doc.id}`,
      { method: "PATCH", body: JSON.stringify({ title: titre, updated_at: maintenant }) });
  } catch (e) { alert(e.message); return; }
  doc.title = titre; doc.updated_at = maintenant;
  renderClassDashboard();
}

// ---- Dispenses --------------------------------------------------------------------------

function ecDessinerDispenses(panel) {
  const { label } = dashboardClass;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const toutes = dashboardDispenses.filter(d => !d.deleted);
  const enCours = toutes.filter(d => dispenseEnCours(d)).sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)));
  const passees = toutes.filter(d => String(d.end_date) < aujourdhui).sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)));
  const moi = typeof session !== "undefined" ? session?.user_id : null;
  const motif = d => (typeof motifLibelle === "function" ? motifLibelle(d.reason_kind) : "") || "";
  const carte = (d, actif) => `<button type="button" class="ec-dispense${actif ? " actif" : ""}" data-dispense="${ecTexte(d.id)}">
    <b>${ecTexte(ecNomEleve(ecEleve(d.student_id)))}</b>
    <small>${ecTexte([`Du ${ecJour(d.start_date)} au ${ecJour(d.end_date)}`, motif(d), d.reason].filter(Boolean).join(" · "))}</small>
    ${d.user_id && moi && d.user_id !== moi ? `<em>Saisie par un collègue</em>` : ""}
  </button>`;
  const liste = ecFiltreDispenses === "En cours"
    ? `<div class="ec-titre-liste"><h3>EN COURS</h3></div>
       ${enCours.length ? enCours.map(d => carte(d, true)).join("")
         : `<button type="button" class="ec-vide-carte ec-cliquable" id="ecPremiereDispense"><b>Aucun élève dispensé</b><span>Cliquez pour en poser une</span></button>`}`
    : `<div class="ec-titre-liste"><h3>PASSÉES</h3></div>
       ${passees.length ? passees.map(d => carte(d, false)).join("") : `<p class="ec-vide">Aucune dispense terminée.</p>`}`;

  panel.innerHTML = `<section class="ec-ecran">
    ${ecBandeau(`${label} · Dispenses`, { ajout: true })}
    <div class="ec-corps">
      ${ecPastilles("ec-filtre-dispenses", [["En cours", "En cours"], ["Historique", "Historique"]], ecFiltreDispenses)}
      <div class="ec-stats">${ecStat(enCours.length, "en cours", "#0F6E56")}${ecStat(toutes.length, "cette année", "#0F6E56")}${ecStat(dashboardStudents.length, "élèves", "#0F6E56")}</div>
      <div class="ec-liste">${liste}</div>
      <p class="ec-aide">Clic : ouvrir la fiche · appui prolongé sur une de vos dispenses : la supprimer</p>
      <button type="button" class="ec-bouton-large" id="ajoutDispense">Ajouter une dispense</button>
    </div></section>`;

  panel.querySelector("[data-ec-retour]").onclick = () => ecAller("bord");
  const nouvelle = () => { if (typeof ouvrirNouvelleDispense === "function") ouvrirNouvelleDispense(dashboardClass.row.id, dashboardStudents); };
  panel.querySelector("[data-ec-ajout]").onclick = nouvelle;
  document.getElementById("ajoutDispense").onclick = nouvelle;
  document.getElementById("ecPremiereDispense")?.addEventListener("click", nouvelle);
  panel.querySelectorAll("[data-ec-filtre-dispenses]").forEach(b => b.onclick = () => { ecFiltreDispenses = b.dataset.ecFiltreDispenses; renderClassDashboard(); });
  panel.querySelectorAll("[data-dispense]").forEach(b => {
    const d = toutes.find(x => x.id === b.dataset.dispense);
    b.onclick = () => { if (typeof ouvrirFichePourDispense === "function") ouvrirFichePourDispense(d, ecNomEleve(ecEleve(d.student_id))); };
    // Une dispense saisie par un collegue ne se supprime pas d'ici : la base la refuserait.
    if (!d.user_id || !moi || d.user_id === moi) ecAppuiLong(b, () => ecSupprimerDispense(d));
  });
}

async function ecSupprimerDispense(d) {
  if (!confirm(`Supprimer la dispense de ${ecNomEleve(ecEleve(d.student_id))} ?`)) return;
  try {
    await apiFetch(`${SUPABASE_URL}/rest/v1/health_dispensations?id=eq.${d.id}`,
      { method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() }) });
  } catch (e) { alert(e.message || "Suppression impossible."); return; }
  dashboardDispenses = dashboardDispenses.filter(x => x.id !== d.id);
  renderClassDashboard();
}
