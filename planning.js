/*
 * Onglets PLANNING et PROGRAMMATION : emploi du temps, planning EPS, programmes, calendrier, grille annuelle, periodes et occupation des installations.
 *
 * Sorti d'index.html. Script classique, comme les dix autres fichiers du site :
 * les fonctions restent accessibles depuis les autres fichiers sans rien exporter,
 * et ce fichier est charge avant le script principal qui s'en sert.
 */

// ---- Onglet Programmation > Planning : structure hebdomadaire fixe des creneaux, puis
// activite enseignee sur chacun pour une periode donnee. Miroir de PlanningRepository.kt /
// PlanningViewModel.kt cote app (ClassScheduleSlotEntity + PeriodActivityEntity).
const PLANNING_DAYS = [
  { key: "LUNDI", label: "Lun" }, { key: "MARDI", label: "Mar" }, { key: "MERCREDI", label: "Mer" },
  { key: "JEUDI", label: "Jeu" }, { key: "VENDREDI", label: "Ven" }, { key: "SAMEDI", label: "Sam" }
];
const PLANNING_START_HOUR = 8, PLANNING_END_HOUR = 18, PLANNING_SLOT_MIN = 30;
const PLANNING_ROWS = ((PLANNING_END_HOUR - PLANNING_START_HOUR) * 60) / PLANNING_SLOT_MIN;
const PLANNING_ROW_PX = 26;
const PLANNING_DURATIONS = [[60, "1h"], [90, "1h30"], [120, "2h"], [150, "2h30"]];
const TODAY_DAY_KEY = PLANNING_DAYS[(new Date().getDay() + 6) % 7]?.key || null; // getDay(): 0=dimanche

/** Nombre de periodes de l'annee, ajustable dans les Reglages comme dans l'application. */
function planningPeriodCount(grade) {
  return periodCountForLevel(grade, loadPrefs());
}
function planningWeeklySlotsNeeded(grade) {
  return ["SIXIEME", "CINQUIEME", "QUATRIEME", "TROISIEME"].includes(grade) ? 2 : 1;
}
function planningLinksActivity(grade) {
  return ["CINQUIEME", "QUATRIEME", "TROISIEME"].includes(grade);
}

let planningMode = "global"; // "global" | "eps" | "periode"
/**
 * Periode affichee. Zero signifie "toutes periodes".
 *
 * Les deux plannings globaux acceptent zero. Deux modes ne le peuvent pas : "Par periode" est par
 * definition une periode a la fois, et l'occupation des installations n'a de sens que periode par
 * periode - deux classes ne se disputent pas un gymnase a des moments differents de l'annee.
 *
 * Les autres modes du meme panneau (programmation annuelle, programmes, calendrier, dates) ne
 * regardent pas la periode du tout : les faire trancher ramenait le planning sur la periode 1 des
 * qu'on etait passe par Programmation.
 */
let planningPeriod = 0;
const MODES_PERIODE_UNIQUE = ["periode", "installations"];
let planningClasses = [];
let planningSlots = [];
let planningActivities = []; // pour planningPeriod courant
let planningInstallations = []; // installations de l'enseignant (module Equipement)
let planningPendingClass = null; // classe qui attend son 2e creneau (mode global)
let planningNewlyCreatedClasses = []; // classes creees automatiquement depuis Planning (rappel)
var planningTabReady = false;
let planningCommunitySlots = null; // null = pas encore charge ; sinon liste (Planning global EPS)
let planningCommunityActivities = [];
let planningCommunityLoading = false;
let planningCommunityError = null;
let planningConflictOverrides = []; // paires (slot_id_a, slot_id_b) validees malgre le chevauchement
let planningAnalysisConflicts = null; // null = analyse pas encore lancee ; sinon liste courante

function planningStartMinutes(slot) {
  const [h, m] = (slot.start_time || "08:00").split(":").map(n => parseInt(n, 10) || 0);
  return h * 60 + m;
}
function planningMinutesLabel(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

async function initPlanningTab() {
  const personalTab = document.querySelector('[data-planningtab="global"]');
  if (personalTab) {
    const teacher = (session?.email || "Alex").split("@")[0];
    personalTab.textContent = "Planning global " + teacher.charAt(0).toUpperCase() + teacher.slice(1);
  }
  if (!planningTabReady) {
    document.getElementById("planningSubtabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".subtabbtn");
      if (btn) showPlanningTab(btn.dataset.planningtab);
    });
    document.getElementById("planningAnalyzeBtn").addEventListener("click", runPlanningAnalysis);
    document.getElementById("planningFullscreenBtn").addEventListener("click", openPlanningFullscreen);
    planningTabReady = true;
  }
  await loadPlanningClasses();
  await loadPlanningSlots();
  await loadPlanningInstallations();
  if (planningMode === "eps" || planningMode === "installations") await loadPlanningCommunity();
  renderPlanningTab();
}

function showPlanningTab(mode) {
  planningMode = mode;
  // Un mode qui ne sait pas afficher toutes les periodes doit repartir sur une periode reelle,
  // sinon sa grille se construirait sur une periode qui n'existe pas.
  if (MODES_PERIODE_UNIQUE.includes(mode) && planningPeriod === 0) planningPeriod = 1;
  document.querySelectorAll("#planningSubtabs .subtabbtn").forEach(b => {
    b.classList.toggle("active", b.dataset.planningtab === mode);
  });
  document.getElementById("planningPanel").style.display = "none";
  if (mode === "annuelle") { renderPlanningTab(); loadAnnualPlan(); return; }
  if (mode === "programmes") { renderPlanningTab(); loadOfficialPrograms(); return; }
  if (mode === "calendrier") { renderPlanningTab(); loadInstitutionCalendar(); return; }
  if (mode === "periode") {
    loadPlanningActivities().then(renderPlanningTab);
    return;
  }
  if (mode === "eps" || mode === "installations") {
    loadPlanningCommunity().then(renderPlanningTab);
    return;
  }
  renderPlanningTab();
}

// ---- Programmes officiels (miroir de OfficialProgramsScreen.kt) ----
// Les champs de contenu restent vides par defaut : l'outil n'invente jamais de texte
// reglementaire. C'est au professeur de recopier les textes officiels (Eduscol, BO),
// avec leur source, pour ne jamais les confondre avec les propositions pedagogiques.

const SCHOOL_LEVELS = [["ECOLE", "Ecole"], ["COLLEGE", "College"], ["LYCEE", "Lycee"]];
const PROGRAM_FIELDS = [
  ["title", "Titre"],
  ["class_level", "Niveau de classe"],
  ["champ_apprentissage", "Champ d'apprentissage"],
  ["general_objectives", "Objectifs generaux"],
  ["attendus", "Attendus"],
  ["competences", "Competences"],
  ["elements_prioritaires", "Elements prioritaires"],
  ["example_apsa", "Exemples d'APSA"],
  ["attendus_fin_de_cycle", "Attendus de fin de cycle"],
  ["evaluation_elements", "Elements d'evaluation"],
  ["source_officielle", "Source officielle"],
  ["bulletin_officiel", "Bulletin officiel"],
  ["version_label", "Version"]
];
const LONG_PROGRAM_FIELDS = ["general_objectives", "attendus", "competences",
  "elements_prioritaires", "example_apsa", "attendus_fin_de_cycle", "evaluation_elements"];

let programs = [];
let programOpenedId = null;

async function loadOfficialPrograms() {
  const wrap = document.getElementById("programsWrap");
  wrap.innerHTML = '<div class="card muted">Chargement des programmes...</div>';
  try {
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/official_programs?deleted=eq.false&select=*&order=school_level.asc`);
    programs = res.ok ? await res.json() : [];
    renderOfficialPrograms();
  } catch (e) {
    wrap.innerHTML = `<div class="card"><div class="error">Table indisponible. Executez schema_equipement_programmes.sql dans Supabase.</div></div>`;
  }
}

function renderOfficialPrograms() {
  const wrap = document.getElementById("programsWrap");
  if (programOpenedId) { renderProgramDetail(); return; }

  const byLevel = SCHOOL_LEVELS.map(([key, label]) => {
    const list = programs.filter(p => p.school_level === key);
    if (!list.length) return "";
    return `<h2 style="margin:16px 0 4px; font-size:15px">${label}</h2>` + list.map(p => `
      <div class="top" style="padding:8px 0; border-bottom:1px solid var(--border)">
        <div>
          <strong>${p.title || "Programme sans titre"}</strong>
          <div class="muted">${[p.class_level, p.champ_apprentissage, p.version_label].filter(Boolean).join(" · ") || "Aucun detail"}</div>
        </div>
        <div style="display:flex; gap:6px">
          <button class="secondary" data-open-prog="${p.id}" style="margin-top:0">Ouvrir</button>
          <button class="danger" data-del-prog="${p.id}" style="margin-top:0">Supprimer</button>
        </div>
      </div>`).join("");
  }).join("");

  wrap.innerHTML = `<div class="card">
    <div class="top">
      <div>
        <h2 style="margin:0">Programmes officiels</h2>
        <div class="muted">Recopiez ici les textes officiels (Eduscol, Bulletin officiel). Rien n'est pre-rempli : ce sont vos textes, avec leur source.</div>
      </div>
      <button id="addProgramBtn" style="margin-top:0">+ Programme</button>
    </div>
    ${byLevel || '<div class="muted" style="margin-top:12px">Aucun programme enregistre.</div>'}
  </div>`;

  document.getElementById("addProgramBtn").onclick = addOfficialProgram;
  wrap.querySelectorAll("[data-open-prog]").forEach(b =>
    b.onclick = () => { programOpenedId = b.dataset.openProg; renderOfficialPrograms(); });
  wrap.querySelectorAll("[data-del-prog]").forEach(b =>
    b.onclick = () => deleteOfficialProgram(b.dataset.delProg));
}

function renderProgramDetail() {
  const wrap = document.getElementById("programsWrap");
  const p = programs.find(x => x.id === programOpenedId);
  if (!p) { programOpenedId = null; renderOfficialPrograms(); return; }

  const fields = PROGRAM_FIELDS.map(([key, label]) => {
    const value = p[key] || "";
    const input = LONG_PROGRAM_FIELDS.includes(key)
      ? `<textarea data-prog-field="${key}" rows="4" style="width:100%; font-family:inherit; font-size:14px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--text)">${value}</textarea>`
      : `<input type="text" data-prog-field="${key}" value="${value.replace(/"/g, "&quot;")}">`;
    return `<label>${label}</label>${input}`;
  }).join("");

  wrap.innerHTML = `<div class="card">
    <div class="top">
      <h2 style="margin:0">${p.title || "Programme"}</h2>
      <button class="secondary" id="backProgramsBtn" style="margin-top:0">Retour</button>
    </div>
    <label for="progLevel">Niveau d'enseignement</label>
    <select id="progLevel">${SCHOOL_LEVELS.map(([k, l]) =>
      `<option value="${k}"${p.school_level === k ? " selected" : ""}>${l}</option>`).join("")}</select>
    ${fields}
    <button id="saveProgramBtn">Enregistrer</button>
    <div class="ok" id="programOk"></div>
  </div>`;

  document.getElementById("backProgramsBtn").onclick = () => { programOpenedId = null; renderOfficialPrograms(); };
  document.getElementById("saveProgramBtn").onclick = saveOfficialProgram;
}

async function addOfficialProgram() {
  const id = crypto.randomUUID();
  await apiFetch(`${SUPABASE_URL}/rest/v1/official_programs`, {
    method: "POST",
    body: JSON.stringify({
      id, user_id: session.user_id, school_level: "COLLEGE", title: "Nouveau programme",
      updated_at: new Date().toISOString(), deleted: false
    })
  });
  await loadOfficialPrograms();
  programOpenedId = id;
  renderOfficialPrograms();
}

async function saveOfficialProgram() {
  const wrap = document.getElementById("programsWrap");
  const payload = { school_level: document.getElementById("progLevel").value, updated_at: new Date().toISOString() };
  wrap.querySelectorAll("[data-prog-field]").forEach(el => { payload[el.dataset.progField] = el.value; });
  await apiFetch(`${SUPABASE_URL}/rest/v1/official_programs?id=eq.${programOpenedId}`, {
    method: "PATCH", body: JSON.stringify(payload)
  });
  Object.assign(programs.find(x => x.id === programOpenedId), payload);
  document.getElementById("programOk").textContent = "Programme enregistre.";
}

async function deleteOfficialProgram(id) {
  await apiFetch(`${SUPABASE_URL}/rest/v1/official_programs?id=eq.${id}`, {
    method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() })
  });
  await loadOfficialPrograms();
}

// ---- Calendrier d'etablissement (miroir de InstitutionCalendarScreen.kt) ----
// Ce qui bloque ou deplace les cours dans l'annee : vacances, examens, sorties,
// journees banalisees.

// BAC_EPS s'ajoute aux types existants : une date saisie avec ce type rejoint la colonne EPS
// du rappel, a cote des epreuves calculees depuis les periodes Terminale.
const CALENDAR_KINDS = [
  ["VACANCES", "Vacances", "#DFF3FF"], ["EXAMEN", "Examen", "#FFE8EE"],
  ["SORTIE", "Sortie AS", "#E5F7E9"], ["BAC_EPS", "BAC EPS", "#1B3A6B"],
  ["BANALISEE", "Journee banalisee", "#FFF0DD"], ["AUTRE", "Autre", "#F3F4F6"]
];
/**
 * Epreuves du BAC EPS : lundi et jeudi de la semaine ou se termine chaque periode Terminale.
 *
 * Rien n'est enregistre. Ces dates sont recalculees a chaque affichage a partir des periodes,
 * exactement comme dans l'application : deplacer une periode deplace l'epreuve, et il n'y a
 * aucune ligne a mettre a jour ni aucun risque d'ecraser une saisie.
 */
function datesCcfBac() {
  const epreuves = [];
  for (const periode of [...periodesTerminale].sort((a, b) => a.number - b.number)) {
    if (!periode.end_date) continue;
    const fin = new Date(periode.end_date + "T12:00:00");
    // getDay() : 0 = dimanche. On remonte au lundi de la semaine qui contient la fin.
    const lundi = new Date(fin);
    lundi.setDate(fin.getDate() - ((fin.getDay() + 6) % 7));
    const jeudi = new Date(lundi);
    jeudi.setDate(lundi.getDate() + 3);
    epreuves.push({ numero: periode.number, lundi: isoDate(lundi), jeudi: isoDate(jeudi) });
  }
  return epreuves;
}

function isoDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// ---- Grille annuelle de l'etablissement (miroir de l'application) ----
//
// Memes donnees que l'app : jours feries et evenements fixes de l'annee, vacances, periodes
// EPS, et les epreuves du BAC calculees depuis les periodes Terminale. Le site n'affichait
// qu'une liste, on ne voyait donc pas l'annee.

const CAL_MOIS = [
  [2026, 9, "Septembre"], [2026, 10, "Octobre"], [2026, 11, "Novembre"], [2026, 12, "Decembre"],
  [2027, 1, "Janvier"], [2027, 2, "Fevrier"], [2027, 3, "Mars"], [2027, 4, "Avril"],
  [2027, 5, "Mai"], [2027, 6, "Juin"], [2027, 7, "Juillet"]
];

const CAL_FIXES = {
  "2026-09-01": ["Pre-rentree enseignants", false], "2026-09-02": ["Rentree des eleves", false],
  "2026-10-31": ["Aid El Wahda", false], "2026-11-01": ["Toussaint", false],
  "2026-11-06": ["Marche Verte", false], "2026-11-18": ["Fete de l'Independance", false],
  "2027-01-11": ["Manifeste de l'Independance", false], "2027-01-14": ["Nouvel An Amazigh", false],
  "2027-03-10": ["Aid El Fitr ?", true], "2027-03-11": ["Aid El Fitr ?", true],
  "2027-05-01": ["Fete du Travail", false], "2027-05-17": ["Aid El Kebir ?", true],
  "2027-05-18": ["Aid El Kebir ?", true], "2027-05-19": ["Paques reporte ?", true],
  "2027-06-06": ["1er Moharrem ?", true], "2027-07-02": ["Fin des cours", false],
  "2027-07-05": ["Fin du calendrier", false]
};

const CAL_VACANCES = [
  ["2026-10-17", "2026-11-01"], ["2026-12-19", "2027-01-03"],
  ["2027-02-20", "2027-03-07"], ["2027-04-24", "2027-05-09"]
];

const CAL_PERIODES = [
  ["2026-09-07", "2026-11-15"], ["2026-11-16", "2027-01-24"],
  ["2027-01-25", "2027-04-04"], ["2027-04-05", "2027-07-05"]
];

const CAL_COULEURS_PERIODE = ["#E6F1FF", "#E5F7E9", "#FFF2D9", "#F1E8FF", "#FFE8EE"];

function calEnVacances(iso) { return CAL_VACANCES.some(v => iso >= v[0] && iso <= v[1]); }
function calPeriode(iso) {
  const index = CAL_PERIODES.findIndex(p => iso >= p[0] && iso <= p[1]);
  return index === -1 ? null : index + 1;
}

/** Evenements saisis, ramenes a la journee : la liste stocke des plages debut-fin. */
function calEvenementsParJour() {
  const parJour = {};
  for (const e of calendarEvents) {
    const debut = new Date(e.start_date_epoch_millis), fin = new Date(e.end_date_epoch_millis);
    for (let d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) {
      parJour[isoDate(d)] = e;
    }
  }
  return parJour;
}

function grilleCalendrier() {
  const saisis = calEvenementsParJour();
  const ccf = {};
  for (const e of datesCcfBac()) {
    ccf[e.lundi] = "BAC EPS CCF" + e.numero;
    ccf[e.jeudi] = "BAC EPS CCF" + e.numero;
  }
  const lettres = ["D", "L", "M", "M", "J", "V", "S"];

  return '<div class="calGrid">' + CAL_MOIS.map(function (mois) {
    const annee = mois[0], numero = mois[1];
    const jours = new Date(annee, numero, 0).getDate();
    let cellules = "";
    for (let jour = 1; jour <= jours; jour++) {
      const iso = annee + "-" + String(numero).padStart(2, "0") + "-" + String(jour).padStart(2, "0");
      const date = new Date(annee, numero - 1, jour);
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      const fixe = CAL_FIXES[iso];
      const saisi = saisis[iso];
      const epreuve = ccf[iso];
      const vacances = calEnVacances(iso);
      const periode = calPeriode(iso);

      // Meme ordre de priorite que l'application, pour que les deux calendriers coincident.
      let fond = "#fff", encre = "inherit";
      if (vacances) fond = "#D5D9DE";
      else if (saisi && saisi.kind === "SORTIE") fond = "#FFD966";
      else if (saisi && saisi.kind === "EXAMEN") fond = "#FFB3C7";
      else if (saisi && saisi.kind === "VACANCES") fond = "#CFE2F3";
      else if (epreuve || (saisi && saisi.kind === "BAC_EPS")) { fond = "#1B3A6B"; encre = "#fff"; }
      else if (fixe && fixe[1]) fond = "#F1E4FF";
      else if (fixe) fond = "#CFE2F3";
      else if (periode) fond = CAL_COULEURS_PERIODE[periode - 1];
      else if (weekend) fond = "#EDF1F5";

      const texte = [vacances ? "VAC" : null, fixe ? fixe[0] : null, epreuve,
                     saisi ? saisi.label : null].filter(Boolean).join(" · ");
      cellules += '<div class="calDay" data-cal-jour="' + iso + '" title="' + planningText(texte || iso) + '"'
        + ' style="background:' + fond + ';color:' + encre + '">'
        + '<span class="num">' + String(jour).padStart(2, "0") + " " + lettres[date.getDay()] + "</span>"
        + (periode ? '<span class="per" style="color:' + (encre === "#fff" ? "#9EC5F0" : "#2678C8") + '">P' + periode + "</span>" : "")
        + '<span class="txt">' + planningText(texte) + "</span></div>";
    }
    return '<div class="calMonth"><div class="calMonthName">' + mois[2] + " " + annee + "</div>" + cellules + "</div>";
  }).join("") + "</div>";
}

/**
 * Rappel des dates qui comptent, en trois colonnes. Elles etaient noyees dans la liste
 * chronologique : impossible de repondre a "c'est quand le prochain CCF ?" d'un coup d'oeil.
 *
 * EPS reunit les epreuves calculees depuis les periodes Terminale et les dates saisies avec
 * le type BAC EPS. AS reprend les sorties, Examen les examens.
 */
function rappelImportantDates() {
  const saisisPar = kind => calendarEvents
    .filter(e => e.kind === kind)
    .sort((a, b) => a.start_date_epoch_millis - b.start_date_epoch_millis)
    .map(e => {
      const debut = dateFr(isoDate(new Date(e.start_date_epoch_millis)));
      const fin = dateFr(isoDate(new Date(e.end_date_epoch_millis)));
      const quand = debut === fin ? debut : debut + " au " + fin;
      return { titre: e.label || "Sans titre", quand, calcule: false };
    });

  const eps = datesCcfBac().map(e => ({
    titre: "BAC EPS CCF" + e.numero,
    quand: "lundi " + dateFr(e.lundi) + " et jeudi " + dateFr(e.jeudi),
    calcule: true
  })).concat(saisisPar("BAC_EPS"));

  const colonnes = [
    ["EPS", "#1B3A6B", eps, "Saisissez une date avec le type BAC EPS pour l'ajouter ici."],
    ["AS", "#E5F7E9", saisisPar("SORTIE"), "Saisissez une date avec le type Sortie AS."],
    ["Examen", "#FFE8EE", saisisPar("EXAMEN"), "Saisissez une date avec le type Examen."]
  ];

  return '<div class="rappelCols">' + colonnes.map(function (col) {
    const lignes = col[2].length === 0
      ? '<div class="muted" style="font-size:12px">' + col[3] + "</div>"
      : col[2].map(d => '<div class="rappelLigne"><strong>' + planningText(d.titre) + "</strong>"
          + (d.calcule ? ' <span class="muted" style="font-size:11px">calcule</span>' : "")
          + '<div class="muted">' + d.quand + "</div></div>").join("");
    return '<div class="rappelCol"><div class="rappelTitre" style="background:' + col[1]
      + ';color:' + (col[1] === "#1B3A6B" ? "#fff" : "#173a57") + '">' + col[0] + "</div>" + lignes + "</div>";
  }).join("") + "</div>";
}

function legendeCalendrier() {
  const items = [
    ["#D5D9DE", "Vacances"], ["#CFE2F3", "Jour ferie"], ["#FFD966", "Sortie"],
    ["#FFB3C7", "Examen"], ["#F1E4FF", "A confirmer"], ["#1B3A6B", "BAC EPS CCF"]
  ].concat(CAL_COULEURS_PERIODE.slice(0, 4).map((c, i) => [c, "Periode " + (i + 1)]));
  return '<div class="calLegend">' + items.map(i =>
    '<span><span class="box" style="background:' + i[0] + '"></span>' + i[1] + "</span>").join("") + "</div>";
}

let calendarEvents = [];

async function loadInstitutionCalendar() {
  const wrap = document.getElementById("calendarWrap");
  wrap.innerHTML = '<div class="card muted">Chargement du calendrier...</div>';
  try {
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/institution_calendar_events?deleted=eq.false&select=*&order=start_date_epoch_millis.asc`);
    calendarEvents = res.ok ? await res.json() : [];
    // Les epreuves du BAC se deduisent des periodes Terminale : il faut les avoir lues.
    await loadPeriodDates();
    renderInstitutionCalendar();
  } catch (e) {
    wrap.innerHTML = `<div class="card"><div class="error">Table indisponible. Executez schema_equipement_programmes.sql dans Supabase.</div></div>`;
  }
}

function calendarDate(millis) {
  return new Date(millis).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function renderInstitutionCalendar() {
  const wrap = document.getElementById("calendarWrap");
  const rows = calendarEvents.length === 0
    ? '<div class="muted" style="margin-top:12px">Aucun evenement enregistre.</div>'
    : calendarEvents.map(e => {
        const kind = CALENDAR_KINDS.find(k => k[0] === e.kind) || CALENDAR_KINDS[4];
        return `<div class="top" style="padding:8px 0; border-bottom:1px solid var(--border)">
          <div>
            <span class="badge" style="background:${kind[2]}">${kind[1]}</span>
            <strong style="margin-left:6px">${e.label || "Sans titre"}</strong>
            <div class="muted">${calendarDate(e.start_date_epoch_millis)} → ${calendarDate(e.end_date_epoch_millis)}${e.comment ? " · " + e.comment : ""}</div>
          </div>
          <button class="danger" data-del-event="${e.id}" style="margin-top:0">Supprimer</button>
        </div>`;
      }).join("");

  wrap.innerHTML = `<div class="card">
    <h2 style="margin:0">Planification etablissement 2026-2027</h2>
    <div class="muted">Vue annuelle, identique a celle de l'application. Cliquez un jour pour y ajouter ou modifier un evenement ; survolez-le pour lire son intitule complet.</div>
    ${legendeCalendrier()}
    ${grilleCalendrier()}
  </div>
  <div class="card" style="margin-top:14px">
    <h2 style="margin:0">Rappel des dates importantes</h2>
    <div class="muted">Les epreuves du BAC EPS sont calculees depuis les periodes Terminale : une periode deplacee deplace l'epreuve. Les autres dates viennent de ce que vous saisissez, classees par type.</div>
    ${rappelImportantDates()}
  </div>
  <div class="card" style="margin-top:14px">
    <h2 style="margin:0">Calendrier de l'etablissement</h2>
    <div class="muted">Vacances, examens, sorties et journees banalisees : ce qui bloque ou deplace les cours dans l'annee.</div>
    ${rows}
    <h2 style="margin:18px 0 0; font-size:15px">Ajouter un evenement</h2>
    <div class="row">
      <div><label for="eventLabel">Intitule</label><input type="text" id="eventLabel" placeholder="Ex : Vacances de printemps"></div>
      <div><label for="eventKind">Type</label><select id="eventKind">${CALENDAR_KINDS.map(k => `<option value="${k[0]}">${k[1]}</option>`).join("")}</select></div>
    </div>
    <div class="row">
      <div><label for="eventStart">Debut</label><input type="date" id="eventStart"></div>
      <div><label for="eventEnd">Fin</label><input type="date" id="eventEnd"></div>
    </div>
    <button id="addEventBtn">Ajouter</button>
    <div class="error" id="eventError"></div>
  </div>`;

  document.getElementById("addEventBtn").onclick = addCalendarEvent;
  wrap.querySelectorAll("[data-del-event]").forEach(b =>
    b.onclick = () => deleteCalendarEvent(b.dataset.delEvent));
  wrap.querySelectorAll("[data-cal-jour]").forEach(c =>
    c.onclick = () => ouvrirJourCalendrier(c.dataset.calJour));
}

/**
 * Clic sur un jour de la grille : ajouter, modifier ou supprimer un evenement, comme dans
 * l'application.
 *
 * Un evenement peut couvrir plusieurs jours (des vacances, un voyage). Modifier depuis une
 * case, c'est modifier tout l'evenement : on l'annonce explicitement avec ses dates, plutot
 * que de laisser croire qu'on ne touche qu'a cette journee. C'est exactement le genre
 * d'ecrasement silencieux qu'on ne veut plus.
 */
function ouvrirJourCalendrier(iso) {
  const panel = document.getElementById("planningPanel");
  const saisi = calEvenementsParJour()[iso];
  const multiJours = saisi && saisi.start_date_epoch_millis !== saisi.end_date_epoch_millis;
  const fixe = CAL_FIXES[iso];
  const epreuve = datesCcfBac().find(e => e.lundi === iso || e.jeudi === iso);

  const lecture = [
    fixe ? `<div>Date de l'annee : <strong>${planningText(fixe[0])}</strong>${fixe[1] ? " (a confirmer)" : ""}</div>` : "",
    calEnVacances(iso) ? `<div>Periode de vacances scolaires.</div>` : "",
    epreuve ? `<div><span class="badge" style="background:#1B3A6B; color:#fff">BAC EPS CCF${epreuve.numero}</span>
               <span class="muted"> — calcule depuis les periodes Terminale, non modifiable ici.</span></div>` : ""
  ].filter(Boolean).join("");

  const avertissement = multiJours
    ? `<div class="pendingHint" style="display:block">Cet evenement s'etend du
         ${dateFr(isoDate(new Date(saisi.start_date_epoch_millis)))} au
         ${dateFr(isoDate(new Date(saisi.end_date_epoch_millis)))}.
         Enregistrer ou supprimer ici agit sur <strong>tout l'evenement</strong>, pas seulement sur ce jour.</div>`
    : "";

  panel.innerHTML = `
    <h2>${dateFr(iso)}</h2>
    ${lecture}
    ${avertissement}
    <label for="jourLabel">Intitule</label>
    <input type="text" id="jourLabel" value="${saisi ? planningText(saisi.label || "") : ""}" placeholder="Ex : Sortie AS">
    <label for="jourKind">Type</label>
    <select id="jourKind">${CALENDAR_KINDS.map(k => {
      // Sans evenement existant, le premier type de la liste serait retenu par defaut et un
      // simple ajout se retrouverait classe en "Vacances". On part donc sur le type neutre.
      const choisi = saisi ? saisi.kind === k[0] : k[0] === "AUTRE";
      return `<option value="${k[0]}"${choisi ? " selected" : ""}>${k[1]}</option>`;
    }).join("")}</select>
    <button id="jourSaveBtn">${saisi ? "Enregistrer" : "Ajouter"}</button>
    ${saisi ? '<button class="danger" id="jourDeleteBtn">Supprimer</button>' : ""}
    <button class="secondary" id="jourCancelBtn">Fermer</button>
    <div class="error" id="jourError"></div>`;
  panel.style.display = "block";

  document.getElementById("jourCancelBtn").onclick = () => panel.style.display = "none";

  document.getElementById("jourSaveBtn").onclick = async () => {
    const erreur = document.getElementById("jourError");
    const label = document.getElementById("jourLabel").value.trim();
    if (!label) { erreur.textContent = "Indiquez un intitule."; return; }
    const corps = {
      label, kind: document.getElementById("jourKind").value,
      updated_at: new Date().toISOString()
    };
    let res;
    if (saisi) {
      // On ne touche pas aux dates : modifier l'intitule d'une plage ne doit pas la reduire
      // a la seule journee cliquee.
      res = await apiFetch(`${SUPABASE_URL}/rest/v1/institution_calendar_events?id=eq.${encodeURIComponent(saisi.id)}`,
        { method: "PATCH", body: JSON.stringify(corps) });
    } else {
      const millis = new Date(iso + "T12:00:00").getTime();
      res = await apiFetch(`${SUPABASE_URL}/rest/v1/institution_calendar_events`, {
        method: "POST",
        body: JSON.stringify(Object.assign({
          id: crypto.randomUUID(), user_id: session.user_id,
          start_date_epoch_millis: millis, end_date_epoch_millis: millis,
          comment: "", deleted: false
        }, corps))
      });
    }
    if (!res.ok) { erreur.textContent = "Enregistrement impossible. Verifiez votre connexion."; return; }
    panel.style.display = "none";
    await loadInstitutionCalendar();
  };

  const suppr = document.getElementById("jourDeleteBtn");
  if (suppr) suppr.onclick = async () => {
    const question = multiJours
      ? `Supprimer tout l'evenement "${saisi.label}" (du ${dateFr(isoDate(new Date(saisi.start_date_epoch_millis)))} au ${dateFr(isoDate(new Date(saisi.end_date_epoch_millis)))}) ?`
      : `Supprimer "${saisi.label}" du ${dateFr(iso)} ?`;
    if (!confirm(question)) return;
    panel.style.display = "none";
    await deleteCalendarEvent(saisi.id);
  };
}

async function addCalendarEvent() {
  const errorEl = document.getElementById("eventError");
  errorEl.textContent = "";
  const label = document.getElementById("eventLabel").value.trim();
  const kind = document.getElementById("eventKind").value;
  const start = document.getElementById("eventStart").value;
  const end = document.getElementById("eventEnd").value;
  if (!label) { errorEl.textContent = "Indiquez un intitule."; return; }
  if (!start || !end) { errorEl.textContent = "Indiquez les dates de debut et de fin."; return; }
  if (new Date(end) < new Date(start)) { errorEl.textContent = "La fin doit suivre le debut."; return; }
  try {
    await apiFetch(`${SUPABASE_URL}/rest/v1/institution_calendar_events`, {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(), user_id: session.user_id, label, kind,
        start_date_epoch_millis: new Date(start).getTime(),
        end_date_epoch_millis: new Date(end).getTime(),
        comment: "", updated_at: new Date().toISOString(), deleted: false
      })
    });
    await loadInstitutionCalendar();
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

async function deleteCalendarEvent(id) {
  await apiFetch(`${SUPABASE_URL}/rest/v1/institution_calendar_events?id=eq.${id}`, {
    method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() })
  });
  await loadInstitutionCalendar();
}

// ---- Programmation annuelle (miroir de AnnualPlanningScreen.kt) ----
// Une periode = une APSA sur une plage de dates, pour une classe. Deux vues : la sienne,
// modifiable, et celle de toute l'equipe EPS, en lecture seule (memes libelles
// denormalises que le Planning, donc pas besoin de lire les classes des collegues).

let annualBlocks = [];
let annualClassId = null;
let annualView = "mine";

async function loadAnnualPlan() {
  const wrap = document.getElementById("annualPlanWrap");
  wrap.innerHTML = '<div class="card muted">Chargement de la programmation...</div>';
  if (!planningClasses.length) await loadPlanningClasses();

  const filter = annualView === "mine" ? `&user_id=eq.${session.user_id}` : "";
  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/annual_plan_blocks?deleted=eq.false${filter}&select=*&order=start_date_epoch_millis.asc`);
  annualBlocks = res.ok ? await res.json() : [];

  if (annualView === "mine" && !annualClassId && planningClasses.length) annualClassId = planningClasses[0].id;
  renderAnnualPlan();
}

function annualMonth(millis) {
  return new Date(millis).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

function renderAnnualPlan() {
  const wrap = document.getElementById("annualPlanWrap");

  const viewSwitch = `
    <div class="subtabbar" style="margin-bottom:12px">
      <button class="subtabbtn${annualView === "mine" ? " active" : ""}" data-annualview="mine">Ma programmation</button>
      <button class="subtabbtn${annualView === "eps" ? " active" : ""}" data-annualview="eps">Programmation EPS</button>
    </div>`;

  if (annualView === "eps") {
    const byTeacher = {};
    annualBlocks.forEach(b => {
      const key = `${b.teacher_label || "?"} · ${b.class_label || "Classe"}`;
      (byTeacher[key] = byTeacher[key] || []).push(b);
    });
    const groups = Object.keys(byTeacher).sort();
    wrap.innerHTML = viewSwitch + `<div class="card">
      <h2 style="margin:0">Programmation de l'equipe EPS</h2>
      <div class="muted">Lecture seule : la programmation annuelle de tous les collegues qui utilisent l'app.</div>
      ${groups.length === 0 ? '<div class="muted" style="margin-top:12px">Aucune programmation partagee.</div>'
        : groups.map(g => `<h2 style="margin:16px 0 4px; font-size:15px">${g}</h2>` +
            byTeacher[g].map(b => `<div class="top" style="padding:6px 0; border-bottom:1px solid var(--border)">
              <div><strong>${b.apsa_name}</strong> <span class="muted">${b.session_count} seances</span></div>
              <div class="muted">${annualMonth(b.start_date_epoch_millis)} → ${annualMonth(b.end_date_epoch_millis)}</div>
            </div>`).join("")).join("")}
    </div>`;
    bindAnnualViewSwitch();
    return;
  }

  const mine = annualBlocks.filter(b => b.class_id === annualClassId);
  const options = planningClasses.map(c =>
    `<option value="${c.id}"${c.id === annualClassId ? " selected" : ""}>${c.name}</option>`).join("");

  wrap.innerHTML = viewSwitch + `<div class="card">
    <div class="row">
      <div>
        <label for="annualClass">Classe</label>
        <select id="annualClass">${options || '<option value="">Aucune classe</option>'}</select>
      </div>
    </div>
    <div style="margin-top:12px">
      ${mine.length === 0
        ? '<div class="muted">Aucune periode programmee pour cette classe.</div>'
        : mine.map(b => `<div class="top" style="padding:8px 0; border-bottom:1px solid var(--border)">
            <div>
              <strong>${b.apsa_name}</strong> <span class="muted">— ${b.session_count} seances</span>
              <div class="muted">${annualMonth(b.start_date_epoch_millis)} → ${annualMonth(b.end_date_epoch_millis)}${b.champ_apprentissage ? " · " + b.champ_apprentissage : ""}</div>
            </div>
            <button class="danger" data-del-block="${b.id}" style="margin-top:0">Supprimer</button>
          </div>`).join("")}
    </div>

    <h2 style="margin:18px 0 0; font-size:15px">Ajouter une periode</h2>
    <div class="row">
      <div>
        <label for="annualApsa">Activite</label>
        <select id="annualApsa"></select>
      </div>
      <div>
        <label for="annualSessions">Seances</label>
        <input type="number" id="annualSessions" min="1" value="8">
      </div>
    </div>
    <div class="row">
      <div><label for="annualStart">Debut</label><input type="date" id="annualStart"></div>
      <div><label for="annualEnd">Fin</label><input type="date" id="annualEnd"></div>
    </div>
    <button id="annualAddBtn">Ajouter la periode</button>
    ${mine.length ? '<button class="secondary" id="annualCopyBtn">Copier vers une autre classe</button>' : ""}
    <div class="error" id="annualError"></div>
  </div>`;

  bindAnnualViewSwitch();
  const classSelect = document.getElementById("annualClass");
  if (classSelect) classSelect.onchange = () => { annualClassId = classSelect.value; renderAnnualPlan(); };
  refreshAnnualApsaOptions();

  wrap.querySelectorAll("[data-del-block]").forEach(b =>
    b.onclick = () => deleteAnnualBlock(b.dataset.delBlock));
  const addBtn = document.getElementById("annualAddBtn");
  if (addBtn) addBtn.onclick = addAnnualBlock;
  const copyBtn = document.getElementById("annualCopyBtn");
  if (copyBtn) copyBtn.onclick = copyAnnualPlan;
}

function bindAnnualViewSwitch() {
  document.querySelectorAll("[data-annualview]").forEach(b =>
    b.onclick = () => { annualView = b.dataset.annualview; loadAnnualPlan(); });
}

/** Les APSA proposees sont celles programmees pour le niveau de la classe choisie. */
function refreshAnnualApsaOptions() {
  const select = document.getElementById("annualApsa");
  if (!select) return;
  const cls = planningClasses.find(c => c.id === annualClassId);
  const list = (cls && PROGRAMMATION[cls.grade]) || [];
  select.innerHTML = list.length
    ? list.map(a => `<option value="${a}">${a}</option>`).join("")
    : '<option value="">Aucune activite programmee</option>';
}

async function addAnnualBlock() {
  const errorEl = document.getElementById("annualError");
  errorEl.textContent = "";
  const apsa = document.getElementById("annualApsa").value;
  const start = document.getElementById("annualStart").value;
  const end = document.getElementById("annualEnd").value;
  const sessions = parseInt(document.getElementById("annualSessions").value, 10) || 0;

  if (!annualClassId) { errorEl.textContent = "Choisissez une classe."; return; }
  if (!apsa) { errorEl.textContent = "Choisissez une activite."; return; }
  if (!start || !end) { errorEl.textContent = "Indiquez les dates de debut et de fin."; return; }
  if (new Date(end) < new Date(start)) { errorEl.textContent = "La fin doit suivre le debut."; return; }

  const cls = planningClasses.find(c => c.id === annualClassId);
  try {
    await apiFetch(`${SUPABASE_URL}/rest/v1/annual_plan_blocks`, {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(), user_id: session.user_id, class_id: annualClassId,
        apsa_name: apsa,
        start_date_epoch_millis: new Date(start).getTime(),
        end_date_epoch_millis: new Date(end).getTime(),
        session_count: sessions, champ_apprentissage: "",
        class_label: cls ? cls.name : "", teacher_label: session.email || "?",
        updated_at: new Date().toISOString(), deleted: false
      })
    });
    await loadAnnualPlan();
  } catch (e) {
    errorEl.textContent = e.message;
  }
}

async function deleteAnnualBlock(id) {
  await apiFetch(`${SUPABASE_URL}/rest/v1/annual_plan_blocks?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() })
  });
  await loadAnnualPlan();
}

/** "Copier vers..." de l'app : reprend toute la programmation d'une classe sur une autre. */
async function copyAnnualPlan() {
  const others = planningClasses.filter(c => c.id !== annualClassId);
  if (!others.length) { alert("Aucune autre classe."); return; }
  const target = prompt(
    "Copier cette programmation vers quelle classe ?\n\n" +
    others.map((c, i) => `${i + 1}. ${c.name}`).join("\n"),
    "1"
  );
  const index = parseInt(target, 10) - 1;
  if (isNaN(index) || !others[index]) return;

  const cls = others[index];
  const blocks = annualBlocks.filter(b => b.class_id === annualClassId);
  for (const b of blocks) {
    await apiFetch(`${SUPABASE_URL}/rest/v1/annual_plan_blocks`, {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(), user_id: session.user_id, class_id: cls.id,
        apsa_name: b.apsa_name,
        start_date_epoch_millis: b.start_date_epoch_millis,
        end_date_epoch_millis: b.end_date_epoch_millis,
        session_count: b.session_count, champ_apprentissage: b.champ_apprentissage || "",
        class_label: cls.name, teacher_label: session.email || "?",
        updated_at: new Date().toISOString(), deleted: false
      })
    });
  }
  annualClassId = cls.id;
  await loadAnnualPlan();
}

/**
 * Equivalent web de FullscreenLandscapeTable : la grille passe en plein ecran. L'app force
 * la rotation en paysage, ce qu'un navigateur ne garantit pas — on la demande quand elle
 * est disponible (Android), et on se contente du plein ecran ailleurs (iOS notamment).
 */
async function openPlanningFullscreen() {
  const grid = document.getElementById("planningGrid");
  try {
    await grid.requestFullscreen();
  } catch (e) {
    alert("Le plein ecran n'est pas disponible sur ce navigateur.");
    return;
  }
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock("landscape");
  } catch (e) { /* verrouillage refuse : le plein ecran seul fait deja le travail */ }
}

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) {
    try { screen.orientation.unlock(); } catch (e) { /* rien a liberer */ }
  }
});

async function loadPlanningClasses() {
  if (modeHorsConnexion) {
    const lecture = await modeHorsConnexion.lire("classes", {
      trier: (a, b) => String(a.name || "").localeCompare(String(b.name || ""))
    });
    planningClasses = lecture.rows;
    return;
  }
  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/classes?deleted=eq.false&select=*&order=name.asc`);
  planningClasses = res.ok ? await res.json() : [];
}
/**
 * Recharge le planning apres une ecriture faite en direct chez Supabase.
 *
 * Les ecritures du planning partent en direct, alors que l'affichage lit la copie locale. Entre
 * les deux il faut une synchronisation, sinon on redessine la grille a partir d'un etat qui ne
 * contient pas ce qui vient d'etre saisi : l'activite enregistree n'apparaissait pas, et il
 * fallait rouvrir la case et enregistrer une seconde fois pour la voir.
 *
 * Un enregistrement est un geste explicite : il passe outre le delai qui separe deux
 * synchronisations spontanees, parce que l'utilisateur attend son resultat maintenant.
 */
async function rechargerPlanningApresEcriture() {
  try { await modeHorsConnexion?.synchroniser(); } catch { /* le rechargement vaut mieux que rien */ }
  await loadPlanningSlots();
  if (planningMode === "eps" || planningMode === "installations") await loadPlanningCommunity();
  renderPlanningTab();
}

async function loadPlanningSlots() {
  let rows;
  if (modeHorsConnexion) {
    const lecture = await modeHorsConnexion.lire("class_schedule_slots", { ou: s => s.user_id === session.user_id });
    rows = lecture.rows;
  } else {
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/class_schedule_slots?deleted=eq.false&user_id=eq.${session.user_id}&select=*`);
    rows = res.ok ? await res.json() : [];
  }
  // Display only: keep orphan/deleted-class records on the server for synchronization.
  planningSlots = visiblePersonalPlanningSlots(rows, planningClasses);
  await loadPlanningActivities();
}
async function loadPlanningActivities() {
  if (modeHorsConnexion) {
    const lecture = await modeHorsConnexion.lire("period_activities", { ou: a => a.user_id === session.user_id });
    planningActivities = lecture.rows;
    return;
  }
  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/period_activities?deleted=eq.false&user_id=eq.${session.user_id}&select=*`);
  planningActivities = res.ok ? await res.json() : [];
}
async function loadPlanningInstallations() {
  // Meme source que la liste de l'onglet Equipement. Sans cela, ajouter une installation hors
  // connexion reussissait mais faisait surgir "Failed to fetch" : la saisie etait bien
  // enregistree, et le message disait le contraire.
  if (modeHorsConnexion) {
    const lecture = await modeHorsConnexion.lire("sport_installations");
    planningInstallations = lecture.rows
      .filter(r => !r.deleted)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return;
  }
  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/sport_installations?deleted=eq.false&select=*&order=name.asc`);
  planningInstallations = res.ok ? await res.json() : [];
}
/** Planning global EPS : creneaux de TOUS les comptes (RLS ouverte en lecture sur cette table). */
// Etat commun de finalisation du planning EPS : une ligne par etablissement, partagee par
// tous les collegues. Meme contrat que l'app (SupabaseSyncManager) : institution_id en cle,
// et on renvoie toujours updated_by / updated_at pour tracer qui a fige le planning.
let planningValidated = false;

async function loadPlanningValidation() {
  planningValidated = false;
  if (!currentInstitution) return;
  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/planning_validations?institution_id=eq.${encodeURIComponent(currentInstitution.id)}&select=validated`);
  if (!res.ok) return;
  const rows = await res.json();
  planningValidated = rows.length > 0 && rows[0].validated === true;
}

async function setPlanningValidated(validated) {
  if (!currentInstitution) throw new Error("Compte non rattache a un etablissement.");
  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/planning_validations`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      institution_id: currentInstitution.id, validated,
      updated_by: session.user_id, updated_at: new Date().toISOString()
    }])
  });
  if (!res.ok) throw new Error("Etat du planning non enregistre. Verifiez votre connexion.");
  planningValidated = validated;
}

function renderPlanningValidation() {
  const label = document.getElementById("planningValidationState");
  const button = document.getElementById("planningValidationBtn");
  if (!label || !button) return;
  // Sans etablissement il n'y a personne avec qui partager l'etat : on masque plutot
  // que d'afficher un bouton qui echouerait a l'enregistrement.
  button.style.display = currentInstitution ? "" : "none";
  label.textContent = !currentInstitution ? ""
    : planningValidated ? "Planning valide" : "En modification";
  label.style.fontWeight = "600";
  button.textContent = planningValidated ? "Reprendre les modifications" : "Valider le planning";
  button.onclick = async () => {
    button.disabled = true;
    try {
      await setPlanningValidated(!planningValidated);
    } catch (e) {
      alert(e.message);
    } finally {
      button.disabled = false;
      renderPlanningValidation();
    }
  };
}

async function loadPlanningCommunity() {
  planningCommunityLoading = true;
  planningCommunityError = null;
  try {
    // Refresh our class list before filtering our obsolete slots; other teachers' classes are private.
    await loadPlanningClasses();
    // La copie locale porte deja les creneaux de tout l'etablissement : la lecture est ouverte a
    // tous sur ces deux tables, c'est ce qui fait vivre le planning partage. On peut donc le
    // consulter dans un gymnase sans reseau, ce qui est precisement ou on en a besoin.
    let slotsRows, activitiesRows;
    const overridesRes = await apiFetch(`${SUPABASE_URL}/rest/v1/installation_conflict_overrides?select=*`)
      .catch(() => ({ ok: false }));
    if (modeHorsConnexion) {
      slotsRows = (await modeHorsConnexion.lire("class_schedule_slots")).rows;
      activitiesRows = (await modeHorsConnexion.lire("period_activities")).rows;
    } else {
      const [slotsRes, activitiesRes] = await Promise.all([
        apiFetchAll(`${SUPABASE_URL}/rest/v1/class_schedule_slots?deleted=eq.false&select=*`),
        apiFetchAll(`${SUPABASE_URL}/rest/v1/period_activities?deleted=eq.false&select=slot_id,period_number,apsa_name,installation_name`)
      ]);
      if (!slotsRes.ok) throw new Error("Impossible de charger le planning partage.");
      slotsRows = slotsRes.rows;
      activitiesRows = activitiesRes.ok ? activitiesRes.rows : [];
    }
    planningCommunitySlots = visibleCommunityPlanningSlots(slotsRows, planningClasses, session.user_id);
    planningCommunityActivities = activitiesRows;
    planningConflictOverrides = overridesRes.ok ? await overridesRes.json() : [];
    // Deux lectures accessoires : l'etat de validation et les dates de periodes. Elles decoraient
    // le planning, mais leur echec faisait tomber tout le bloc et vidait les creneaux deja
    // charges - une coupure de trois secondes effacait le planning partage entier.
    await loadPlanningValidation().catch(() => { planningValidated = false; });
    await loadPeriodDates().catch(() => { periodesTerminale = periodesTerminale || []; });
  } catch (e) {
    planningCommunityError = e.message;
    // On ne jette pas ce qu'on a : mieux vaut un planning d'hier avec un message qu'un ecran vide.
    if (!planningCommunitySlots.length) planningCommunitySlots = [];
  } finally {
    planningCommunityLoading = false;
  }
}

function conflictPairKey(idA, idB) { return [idA, idB].sort(); }
function isConflictOverridden(idA, idB) {
  const [a, b] = conflictPairKey(idA, idB);
  return planningConflictOverrides.some(o => o.slot_id_a === a && o.slot_id_b === b);
}

function planningClassById(id) { return planningClasses.find(c => c.id === id); }
function visiblePersonalPlanningSlots(slots, classes) {
  const ids = new Set(classes.filter(c => !c.deleted).map(c => c.id));
  return slots.filter(s => !s.deleted && ids.has(s.class_id));
}
function visibleCommunityPlanningSlots(slots, classes, userId) {
  const ownClassIds = new Set(classes.filter(c => !c.deleted).map(c => c.id));
  return slots.filter(s => !s.deleted && (s.user_id !== userId || ownClassIds.has(s.class_id)));
}
function planningText(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function planningRowsForSlot(slotId) {
  return planningActivities.filter(a => !a.deleted && a.slot_id === slotId)
    .sort((a, b) => Number(a.period_number) - Number(b.period_number));
}
function planningGlobalActivityLines(slotId) {
  return planningRowsForSlot(slotId).map(a => {
    const label = `P${a.period_number} · ${a.apsa_name || "À définir"}`;
    const detail = a.installation_name ? `${label} — ${a.installation_name}` : label;
    return `<span class="ap planningPeriodActivity" title="${planningText(detail)}">${planningText(label)}</span>`;
  }).join("");
}
function planningClassLabel(c) { return c ? (c.name || `${GRADE_LABELS[c.grade] || c.grade}${c.class_number}`) : "?"; }
function planningActivityForSlot(slotId) {
  const a = planningActivities.find(x => !x.deleted && x.slot_id === slotId && Number(x.period_number) === Number(planningPeriod));
  return a ? a.apsa_name : null;
}

// ---- Programmation > Dates des periodes ----
//
// Miroir du panneau Programmation EPS de l'application. Les niveaux 6e a 1re suivent le
// calendrier commun de l'etablissement : leurs dates sont des constantes, affichees en
// lecture seule des deux cotes. Seule la Terminale a un decoupage propre, donc modifiable.
//
// Ce decoupage ne vivait que dans les preferences locales du telephone : invisible ici, et
// perdu au changement d'appareil. Il passe par Supabase et devient partage entre collegues.

const PERIODES_STANDARD = [
  { number: 1, start: "2026-09-01", end: "2026-10-16" },
  { number: 2, start: "2026-11-02", end: "2026-12-18" },
  { number: 3, start: "2027-01-04", end: "2027-02-19" },
  { number: 4, start: "2027-03-08", end: "2027-04-23" },
  { number: 5, start: "2027-05-10", end: "2027-07-05" }
];
const NIVEAUX_STANDARD = [
  ["SIXIEME", "Sixieme"], ["CINQUIEME", "Cinquieme"], ["QUATRIEME", "Quatrieme"],
  ["TROISIEME", "Troisieme"], ["SECONDE", "Seconde"], ["PREMIERE", "Premiere"]
];
const ANNEE_PERIODES = "2026-2027";

let periodesTerminale = [];

/** La derniere periode d'un niveau va jusqu'a la fin de l'annee, comme dans l'application. */
function periodeStandard(numero, nombre) {
  const base = PERIODES_STANDARD[numero - 1];
  return numero === nombre
    ? Object.assign({}, base, { end: PERIODES_STANDARD[PERIODES_STANDARD.length - 1].end })
    : base;
}

/**
 * Periodes du calendrier commun qu'une periode Terminale recouvre.
 *
 * Le decoupage de la Terminale ne s'aligne pas sur celui des autres niveaux : une periode
 * Terminale se termine au milieu d'une periode standard et la suivante demarre dans la meme.
 * Sans ce reperage, un professeur qui remplit "Periode 2" pour une Terminale ne sait pas a
 * quel moment de l'annee cela correspond pour ses collegues.
 *
 * Le calcul part des dates : il reste juste si le decoupage change.
 */
function periodesStandardCouvertes(debut, fin) {
  if (!debut || !fin) return [];
  return PERIODES_STANDARD
    .filter(p => debut <= p.end && fin >= p.start)
    .map(p => p.number);
}

/** "P1-P2" pour une periode a cheval, "P1" quand elle tient dans une seule. */
function libelleChevauchement(debut, fin) {
  const couvertes = periodesStandardCouvertes(debut, fin);
  if (couvertes.length === 0) return "";
  if (couvertes.length === 1) return "P" + couvertes[0];
  return "P" + couvertes[0] + "-P" + couvertes[couvertes.length - 1];
}

function dateFr(iso) {
  if (!iso) return "";
  const parts = String(iso).split("-");
  return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : iso;
}

async function loadPeriodDates() {
  const res = await apiFetch(SUPABASE_URL + "/rest/v1/eps_period_dates?deleted=eq.false&school_year=eq."
    + encodeURIComponent(ANNEE_PERIODES) + "&select=*&order=number.asc");
  periodesTerminale = res.ok ? (await res.json()).filter(p => p.grade === "TERMINALE") : [];
}

async function renderPeriodDatesTab() {
  const wrap = document.getElementById("periodDatesWrap");
  wrap.innerHTML = '<div class="muted">Chargement...</div>';
  await loadPeriodDates();

  const prefs = loadPrefs();
  const nbTerminale = periodCountForLevel("TERMINALE", prefs);

  const lignesStandard = NIVEAUX_STANDARD.map(function (niveau) {
    const nombre = periodCountForLevel(niveau[0], prefs);
    const cellules = PERIODES_STANDARD.map(function (p) {
      if (p.number > nombre) return '<td class="muted">-</td>';
      const d = periodeStandard(p.number, nombre);
      return "<td>" + dateFr(d.start) + '<br><span class="muted">' + dateFr(d.end) + "</span></td>";
    }).join("");
    return '<tr><th style="text-align:left">' + planningText(niveau[1]) + "</th>" + cellules + "</tr>";
  }).join("");

  const lignesTerminale = Array.from({ length: nbTerminale }, (_, i) => i + 1).map(function (numero) {
    const p = periodesTerminale.find(x => x.number === numero);
    const debut = p ? dateFr(p.start_date) : '<span class="muted">Non definie</span>';
    const fin = p ? dateFr(p.end_date) : '<span class="muted">Non definie</span>';
    const chevauchement = p
      ? libelleChevauchement(p.start_date, p.end_date)
      : '<span class="muted">-</span>';
    return '<tr><th style="text-align:left">Periode ' + numero + "</th><td>" + debut + "</td><td>" + fin
      + "</td><td><strong>" + chevauchement + "</strong></td>"
      + '<td><button class="secondary" data-periode="' + numero + '" style="margin-top:0">'
      + (p ? "Modifier" : "Definir") + "</button></td></tr>";
  }).join("");

  wrap.innerHTML =
    '<div class="card"><h2>Terminale</h2>'
    + '<div class="muted">Decoupage personnalise en ' + nbTerminale + ' periode(s). Ces dates sont partagees avec vos collegues et avec l\'application. La colonne <em>Correspond a</em> indique les periodes du calendrier commun recouvertes : une periode Terminale est souvent a cheval sur deux.</div>'
    + '<table style="margin-top:10px"><thead><tr><th style="text-align:left">Periode</th><th>Debut</th><th>Fin</th><th>Correspond a</th><th></th></tr></thead>'
    + "<tbody>" + lignesTerminale + "</tbody></table></div>"
    + '<div class="card" style="margin-top:14px"><h2>Autres niveaux</h2>'
    + '<div class="muted">Dates reprises du calendrier commun de l\'etablissement : elles ne se modifient pas ici, comme dans l\'application. Le nombre de periodes par niveau se regle dans Reglages.</div>'
    + '<div style="overflow-x:auto"><table style="margin-top:10px"><thead><tr><th style="text-align:left">Niveau</th>'
    + PERIODES_STANDARD.map(p => "<th>P" + p.number + "</th>").join("")
    + "</tr></thead><tbody>" + lignesStandard + "</tbody></table></div></div>"
    + '<div id="periodDatesMsg" class="muted" style="margin-top:10px" role="status" aria-live="polite"></div>';

  wrap.querySelectorAll("[data-periode]").forEach(function (btn) {
    btn.addEventListener("click", () => openPeriodDatePanel(Number(btn.dataset.periode)));
  });
}

function openPeriodDatePanel(numero) {
  const existante = periodesTerminale.find(p => p.number === numero);
  const panel = document.getElementById("planningPanel");
  panel.innerHTML =
    "<h2>Terminale - periode " + numero + "</h2>"
    + '<label for="periodStart">Date de debut</label>'
    + '<input type="date" id="periodStart" value="' + (existante ? existante.start_date : "") + '">'
    + '<label for="periodEnd">Date de fin</label>'
    + '<input type="date" id="periodEnd" value="' + (existante ? existante.end_date : "") + '">'
    + '<button id="periodSaveBtn">Enregistrer</button>'
    + (existante ? '<button class="danger" id="periodDeleteBtn">Supprimer cette periode</button>' : "")
    + '<button class="secondary" id="periodCancelBtn">Annuler</button>'
    + '<div class="error" id="periodError"></div>';
  panel.style.display = "block";

  document.getElementById("periodCancelBtn").addEventListener("click", function () {
    panel.style.display = "none";
  });

  document.getElementById("periodSaveBtn").addEventListener("click", async function () {
    const debut = document.getElementById("periodStart").value;
    const fin = document.getElementById("periodEnd").value;
    const erreur = document.getElementById("periodError");
    if (!debut || !fin) { erreur.textContent = "Les deux dates sont obligatoires."; return; }
    // Une periode qui se termine avant de commencer casserait le classement des cycles.
    if (fin < debut) { erreur.textContent = "La date de fin doit suivre la date de debut."; return; }
    const chevauche = periodesTerminale.find(p => p.number !== numero && debut <= p.end_date && fin >= p.start_date);
    if (chevauche && !confirm("Cette periode chevauche la periode " + chevauche.number + " ("
        + dateFr(chevauche.start_date) + " - " + dateFr(chevauche.end_date) + "). Enregistrer quand meme ?")) return;

    const corps = { school_year: ANNEE_PERIODES, grade: "TERMINALE", number: numero,
                    start_date: debut, end_date: fin, deleted: false, updated_at: new Date().toISOString() };
    let res;
    if (existante) {
      res = await apiFetch(SUPABASE_URL + "/rest/v1/eps_period_dates?id=eq." + encodeURIComponent(existante.id),
        { method: "PATCH", body: JSON.stringify(corps) });
    } else {
      // institution_id est pose par le declencheur cote base : ne pas l'envoyer d'ici.
      res = await apiFetch(SUPABASE_URL + "/rest/v1/eps_period_dates",
        { method: "POST", body: JSON.stringify(Object.assign({ id: crypto.randomUUID(), user_id: session.user_id }, corps)) });
    }
    if (!res.ok) { erreur.textContent = "Periode non enregistree. Verifiez votre connexion."; return; }
    panel.style.display = "none";
    await renderPeriodDatesTab();
    document.getElementById("periodDatesMsg").textContent = "Periode " + numero + " enregistree et partagee.";
  });

  const suppr = document.getElementById("periodDeleteBtn");
  if (suppr) suppr.addEventListener("click", async function () {
    if (!confirm("Supprimer les dates de la periode " + numero + " ?")) return;
    const res = await apiFetch(SUPABASE_URL + "/rest/v1/eps_period_dates?id=eq." + encodeURIComponent(existante.id),
      { method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() }) });
    if (!res.ok) { document.getElementById("periodError").textContent = "Suppression impossible."; return; }
    panel.style.display = "none";
    await renderPeriodDatesTab();
  });
}

function renderPlanningTab() {
  // Programmation annuelle, programmes officiels et calendrier n'utilisent pas la grille
  // horaire : on bascule l'affichage.
  const annualMode = planningMode === "annuelle";
  const listMode = ["annuelle", "programmes", "calendrier", "periodes"].includes(planningMode);
  document.getElementById("annualPlanWrap").style.display = annualMode ? "block" : "none";
  document.getElementById("programsWrap").style.display = planningMode === "programmes" ? "block" : "none";
  document.getElementById("calendarWrap").style.display = planningMode === "calendrier" ? "block" : "none";
  document.getElementById("periodDatesWrap").style.display = planningMode === "periodes" ? "block" : "none";
  if (planningMode === "periodes") renderPeriodDatesTab();
  document.getElementById("planningGrid").style.display = listMode ? "none" : "";
  document.getElementById("planningFullscreenBar").style.display = listMode ? "none" : "flex";
  if (listMode) {
    document.getElementById("planningPeriodBar").style.display = "none";
    document.getElementById("planningPendingHint").style.display = "none";
    document.getElementById("planningNewClassHint").style.display = "none";
    document.getElementById("planningEpsHint").style.display = "none";
    document.getElementById("planningAnalysisPanel").style.display = "none";
    return;
  }

  // Barre de periodes
  const periodBar = document.getElementById("planningPeriodBar");
  if (["global", "periode", "eps", "installations"].includes(planningMode)) {
    const maxPeriod = planningClasses.length
      ? Math.max(...planningClasses.map(c => planningPeriodCount(c.grade)))
      : 5;
    if (planningPeriod > maxPeriod) planningPeriod = maxPeriod;
    periodBar.innerHTML = "";

    const choix = MODES_PERIODE_UNIQUE.includes(planningMode) ? [] : [0];
    for (let p = 1; p <= maxPeriod; p++) choix.push(p);

    for (const p of choix) {
      const chip = document.createElement("button");
      chip.className = "periodChip" + (p === planningPeriod ? " active" : "");
      chip.textContent = p === 0 ? "Toutes periodes" : "Periode " + p;
      chip.addEventListener("click", async () => {
        planningPeriod = p;
        if (planningMode === "periode") await loadPlanningActivities();
        document.getElementById("planningPanel").style.display = "none";
        renderPlanningTab();
      });
      periodBar.appendChild(chip);
    }
    periodBar.style.display = "flex";
    majRappelTerminale();
  } else {
    periodBar.style.display = "none";
  }

  /**
   * En Terminale, "Periode 2" ne designe pas la meme portion d'annee que pour les autres
   * niveaux. On l'affiche sous la barre, sinon l'activite est saisie sans savoir a quelle
   * partie de l'annee elle correspond reellement.
   */
  function majRappelTerminale() {
    let rappel = document.getElementById("planningTerminaleHint");
    if (!rappel) {
      rappel = document.createElement("div");
      rappel.id = "planningTerminaleHint";
      rappel.className = "muted";
      rappel.style.cssText = "margin:-4px 0 10px; padding:0 4px";
      periodBar.insertAdjacentElement("afterend", rappel);
    }
    const periode = periodesTerminale.find(x => x.number === planningPeriod);
    if (!periode) { rappel.style.display = "none"; return; }
    const couvre = libelleChevauchement(periode.start_date, periode.end_date);
    rappel.innerHTML = "Terminale : la periode " + planningPeriod + " va du "
      + dateFr(periode.start_date) + " au " + dateFr(periode.end_date)
      + " et recouvre <strong>" + couvre + "</strong> du calendrier commun.";
    rappel.style.display = "block";
  }

  // Bandeau "2e creneau en attente"
  const hint = document.getElementById("planningPendingHint");
  if (planningMode === "global" && planningPendingClass) {
    hint.textContent = `${planningClassLabel(planningPendingClass)} a besoin d'un 2e creneau : touchez une autre case pour le placer.`;
    hint.style.display = "block";
  } else {
    hint.style.display = "none";
  }
  const newClassHint = document.getElementById("planningNewClassHint");
  if (planningMode === "global" && planningNewlyCreatedClasses.length > 0) {
    newClassHint.innerHTML = `<span>Nouvelle(s) classe(s) creee(s) automatiquement : ${planningNewlyCreatedClasses.map(planningClassLabel).join(", ")}. Rendez-vous dans Classes pour les completer (importer les eleves).</span><button class="secondary" id="planningNewClassOk" style="margin-top:0">OK</button>`;
    newClassHint.style.display = "flex";
    document.getElementById("planningNewClassOk").addEventListener("click", () => {
      planningNewlyCreatedClasses = [];
      renderPlanningTab();
    });
  } else {
    newClassHint.style.display = "none";
  }

  document.getElementById("planningEpsHint").style.display = planningMode === "eps" ? "flex" : "none";
  if (planningMode === "eps") renderPlanningValidation();
  if (planningMode !== "eps") document.getElementById("planningAnalysisPanel").style.display = "none";

  if (planningMode === "eps") renderPlanningEpsGrid();
  else if (planningMode === "installations") renderPlanningInstallationsGrid();
  else renderPlanningGrid();
}

function renderPlanningGrid() {
  const wrap = document.getElementById("planningGrid");
  const gridHeight = PLANNING_ROWS * PLANNING_ROW_PX;

  let html = `<div class="planningWrap"><div class="planningGrid">`;
  html += `<div class="planningHeadCell"></div>`;
  PLANNING_DAYS.forEach(d => {
    html += `<div class="planningHeadCell${d.key === TODAY_DAY_KEY ? " today" : ""}${d.key === "SAMEDI" ? " weekend" : ""}">${d.label}</div>`;
  });

  // Colonne des heures
  html += `<div style="grid-column:1;">`;
  for (let r = 0; r < PLANNING_ROWS; r++) {
    const minutes = PLANNING_START_HOUR * 60 + r * PLANNING_SLOT_MIN;
    html += `<div class="planningTimeCell">${minutes % 60 === 0 ? planningMinutesLabel(minutes) : ""}</div>`;
  }
  html += `</div>`;

  // Colonnes des jours : cases vides cliquables + blocs positionnes en absolu par-dessus
  PLANNING_DAYS.forEach((d, dayIdx) => {
    const daySlots = visiblePersonalPlanningSlots(planningSlots, planningClasses).filter(s => s.day_of_week === d.key);
    html += `<div class="planningDayCol${d.key === TODAY_DAY_KEY ? " today" : ""}${d.key === "SAMEDI" ? " weekend" : ""}" style="grid-column:${dayIdx + 2}; position:relative;">`;
    for (let r = 0; r < PLANNING_ROWS; r++) {
      const minutes = PLANNING_START_HOUR * 60 + r * PLANNING_SLOT_MIN;
      const occupied = daySlots.some(s => minutes >= planningStartMinutes(s) && minutes < planningStartMinutes(s) + s.duration_minutes);
      html += `<div class="planningCell${occupied ? " occupied" : ""}" data-day="${d.key}" data-minutes="${minutes}"></div>`;
    }
    daySlots.forEach(s => {
      const top = ((planningStartMinutes(s) - PLANNING_START_HOUR * 60) / PLANNING_SLOT_MIN) * PLANNING_ROW_PX;
      const height = (s.duration_minutes / PLANNING_SLOT_MIN) * PLANNING_ROW_PX - 2;
      const cls = planningClassById(s.class_id);
      // Sur le planning personnel, "toutes periodes" empile les quatre lignes ; une periode
      // choisie n'en montre qu'une, comme le fait "Par periode".
      const toutesPeriodes = planningPeriod === 0;
      const apsa = (planningMode === "periode" || (planningMode === "global" && !toutesPeriodes))
        ? (planningActivityForSlot(s.id) || "A definir") : null;
      const activityLines = (planningMode === "global" && toutesPeriodes)
        ? planningGlobalActivityLines(s.id)
        : (apsa ? `<span class="ap">${planningText(apsa)}</span>` : "");
      const installationLine = (planningMode === "global" && !activityLines && s.installation_name) ? `<span class="ap">${planningText(s.installation_name)}</span>` : "";
      html += `<div class="planningBlock" style="top:${top}px; height:${height}px;" data-slot="${s.id}">
        <span class="cl">${planningText(planningClassLabel(cls))}</span>${activityLines}${installationLine}
      </div>`;
    });
    html += `</div>`;
  });

  html += `</div></div>`;
  wrap.innerHTML = html;
  wrap.querySelector(".planningGrid").style.minHeight = gridHeight + "px";
  installPlanningScroll(wrap.querySelector(".planningWrap"));

  wrap.querySelectorAll(".planningCell:not(.occupied)").forEach(cell => {
    cell.addEventListener("click", () => onPlanningEmptyCellClick(cell.dataset.day, parseInt(cell.dataset.minutes, 10)));
  });
  wrap.querySelectorAll(".planningBlock").forEach(block => {
    block.addEventListener("click", (e) => {
      e.stopPropagation();
      onPlanningSlotClick(block.dataset.slot);
    });
  });
}

/**
 * Ce qu'un creneau reclame : soit une famille entiere ("Gymnase"), soit un groupe de parts
 * homonymes ("Gymnase 2/3", ou l'une des deux "1/2 Piscine").
 */
function demandeInstallation(nomChoisi, couloirs) {
  const choisi = cleInstallation(nomChoisi);
  if (!choisi) return null;
  const exacts = couloirs.filter(c => cleInstallation(c.name) === choisi);
  if (exacts.length) return { famille: cleInstallation(familleInstallation(exacts[0].name)), groupe: choisi };
  const entier = couloirs.some(c => estPartieInstallation(c.name)
    && cleInstallation(familleInstallation(c.name)) === choisi);
  // groupe nul : la famille entiere, donc chacune de ses parts.
  return entier ? { famille: choisi, groupe: null } : null;
}

/** Combien d'espaces identiques porte chaque nom : deux "1/2 Piscine", un seul "Gymnase 2/3". */
function capacitesCouloirs(couloirs) {
  const capacites = new Map();
  couloirs.forEach(c => {
    const cle = cleInstallation(c.name);
    capacites.set(cle, (capacites.get(cle) || 0) + 1);
  });
  return capacites;
}

/** Les unites que ce creneau prend dans un groupe donne. */
function unitesDemandees(demande, groupe, familleDuGroupe, capacite) {
  if (demande.groupe !== null) return demande.groupe === groupe ? 1 : 0;
  return demande.famille === familleDuGroupe ? capacite : 0;
}

/**
 * Paires de creneaux qui se disputent un espace : meme jour, chevauchement horaire, comptes
 * differents (un meme prof peut legitimement enchainer 2 creneaux au meme endroit). Les paires
 * deja validees via "Analyser" (installation_conflict_overrides) sont exclues.
 *
 * Ce n'est pas le nom de l'installation qui decide, mais la place disponible. Comparer les noms
 * a l'identique laissait passer le cas qui compte : "Gymnase" et "Gymnase 1/3" ne s'ecrivent pas
 * pareil et se disputent pourtant le meme tiers de salle. A l'inverse, deux collegues inscrits
 * sur "1/2 Piscine" tiennent chacun leur moitie et ne se genent pas - les signaler serait un
 * faux conflit. On compte donc, a chaque instant, ce que chaque groupe d'espaces homonymes peut
 * accueillir et ce qui lui est reclame.
 */
/** L'installation retenue pour ce creneau a cette periode, sinon celle du creneau lui-meme. */
function installationPourPeriode(slot, periode) {
  if (periode == null) return slot.installation_name;
  const activite = planningCommunityActivities.find(a =>
    a.slot_id === slot.id && Number(a.period_number) === Number(periode));
  return activite?.installation_name || slot.installation_name;
}

function findCommunityConflictPairs(slots) {
  const couloirs = couloirsInstallations((planningInstallations || []).filter(i => !i.deleted));
  if (!couloirs.length) return [];
  const capacites = capacitesCouloirs(couloirs);
  const familleDuGroupe = new Map(couloirs.map(c =>
    [cleInstallation(c.name), cleInstallation(familleInstallation(c.name))]));

  // Quand personne ne choisit d'installation par periode, le planning ne bouge pas de l'annee :
  // une seule passe suffit, et le chevauchement vaut alors pour toutes les periodes.
  const idsAffiches = new Set(slots.map(s => s.id));
  const periodesDeclarees = [...new Set(planningCommunityActivities
    .filter(a => idsAffiches.has(a.slot_id) && (a.installation_name || "").trim())
    .map(a => Number(a.period_number)))].sort((x, y) => x - y);
  const periodes = periodesDeclarees.length ? periodesDeclarees : [null];

  // Une paire validee l'est une fois pour toutes : on la presente une seule fois, en listant
  // les periodes concernees, plutot qu'une entree par periode qu'un seul clic ferait sauter.
  const pairs = new Map();

  periodes.forEach(periode => {
    const demandes = new Map();
    slots.forEach(s => demandes.set(s.id, demandeInstallation(installationPourPeriode(s, periode), couloirs)));

    const byDay = {};
    slots.forEach((s, i) => {
      if (!demandes.get(s.id)) return;
      (byDay[s.day_of_week] = byDay[s.day_of_week] || []).push({ s, i });
    });

    Object.values(byDay).forEach(dayEntries => {
      // Tout chevauchement contient le debut d'un creneau : ces instants suffisent a tout voir.
      const instants = [...new Set(dayEntries.map(e => planningStartMinutes(e.s)))];
      capacites.forEach((capacite, groupe) => {
        const famille = familleDuGroupe.get(groupe);
        instants.forEach(instant => {
          const actifs = dayEntries.filter(e => {
            const debut = planningStartMinutes(e.s);
            return instant >= debut && instant < debut + e.s.duration_minutes
              && unitesDemandees(demandes.get(e.s.id), groupe, famille, capacite) > 0;
          });
          const reclame = actifs.reduce((total, e) =>
            total + unitesDemandees(demandes.get(e.s.id), groupe, famille, capacite), 0);
          if (reclame <= capacite) return;

          for (let a = 0; a < actifs.length; a++) {
            for (let b = a + 1; b < actifs.length; b++) {
              const A = actifs[a].s, B = actifs[b].s;
              if (A.user_id === B.user_id) continue;
              if (isConflictOverridden(A.id, B.id)) continue;
              const cle = [A.id, B.id].sort().join("|");
              const paire = pairs.get(cle)
                || { indexA: actifs[a].i, indexB: actifs[b].i, slotA: A, slotB: B, periodes: [], installations: [] };
              if (periode != null && !paire.periodes.includes(periode)) paire.periodes.push(periode);
              [installationPourPeriode(A, periode), installationPourPeriode(B, periode)]
                .filter(Boolean)
                .forEach(nom => { if (!paire.installations.includes(nom)) paire.installations.push(nom); });
              pairs.set(cle, paire);
            }
          }
        });
      });
    });
  });
  return [...pairs.values()];
}

/** "Gymnase / Gymnase 1/3" : les deux ecritures qui se disputent la meme place. */
function libelleInstallationsConflit(paire) {
  return paire.installations.join(" / ") || "?";
}
function libellePeriodesConflit(paire) {
  return paire.periodes.length ? "Periode " + paire.periodes.join(", ") : "Toutes les periodes";
}

function computeCommunityConflicts(slots) {
  const conflicts = new Set();
  findCommunityConflictPairs(slots)
    // Un chevauchement de periode 2 n'a pas a rougir la grille de periode 1. Une paire sans
    // periode vaut toute l'annee : elle reste signalee quoi qu'on affiche. Et sur "toutes
    // periodes", on montre tout - c'est la vue ou l'on cherche justement les problemes.
    .filter(p => planningPeriod === 0 || !p.periodes.length || p.periodes.includes(Number(planningPeriod)))
    .forEach(p => { conflicts.add(p.indexA); conflicts.add(p.indexB); });
  return conflicts;
}

function renderPlanningEpsGrid() {
  const wrap = document.getElementById("planningGrid");
  if (planningCommunityLoading) {
    wrap.innerHTML = '<div class="muted" style="padding:30px">Chargement du planning partage...</div>';
    return;
  }
  if (planningCommunityError) {
    wrap.innerHTML = `<div class="error" style="padding:20px">${planningCommunityError} <button class="secondary" id="planningEpsRetry" style="margin-top:8px">Reessayer</button></div>`;
    document.getElementById("planningEpsRetry").addEventListener("click", async () => { await loadPlanningCommunity(); renderPlanningTab(); });
    return;
  }
  const slots = planningCommunitySlots || [];
  ordreEnseignants = [...new Set(slots.map(x => nomCourtEnseignant(x.teacher_label) || "?"))].sort();
  const conflictIdx = computeCommunityConflicts(slots);
  const gridHeight = PLANNING_ROWS * PLANNING_ROW_PX;

  let html = `<div class="planningWrap"><div class="planningGrid" style="grid-template-columns:${largeursColonnesEps(slots)}">`;
  html += `<div class="planningHeadCell"></div>`;
  PLANNING_DAYS.forEach(d => { html += `<div class="planningHeadCell${d.key === TODAY_DAY_KEY ? " today" : ""}${d.key === "SAMEDI" ? " weekend" : ""}">${d.label}</div>`; });

  // Le nom de chaque colonne, sous celui du jour : avec six a huit colonnes par journee, la
  // couleur seule obligerait a redescendre a la legende pour chaque case.
  const profsParJour = {};
  html += `<div class="planningSubCell vide"></div>`;
  PLANNING_DAYS.forEach(d => {
    const { profs } = placementParEnseignant(slots.filter(x => x.day_of_week === d.key));
    profsParJour[d.key] = profs;
    html += `<div class="planningSubCell"><div style="display:grid; grid-template-columns:repeat(${Math.max(1, profs.length)}, minmax(0,1fr))">`
      + (profs.length ? profs.map(n => `<span title="${planningText(n)}">${planningText(n.slice(0, 3))}</span>`).join("") : "<span></span>")
      + `</div></div>`;
  });

  html += `<div style="grid-column:1;">`;
  for (let r = 0; r < PLANNING_ROWS; r++) {
    const minutes = PLANNING_START_HOUR * 60 + r * PLANNING_SLOT_MIN;
    html += `<div class="planningTimeCell">${minutes % 60 === 0 ? planningMinutesLabel(minutes) : ""}</div>`;
  }
  html += `</div>`;

  PLANNING_DAYS.forEach((d, dayIdx) => {
    html += `<div class="planningDayCol${d.key === TODAY_DAY_KEY ? " today" : ""}${d.key === "SAMEDI" ? " weekend" : ""}" style="grid-column:${dayIdx + 2}; position:relative;">`;
    const daySlots = slots.filter(s => s.day_of_week === d.key);
    const { profs: profsDuJour, placement: placementDuJour } = placementParEnseignant(daySlots);
    // Un filet fin marque la limite entre deux enseignants, sans concurrencer le filet epais
    // qui separe les jours.
    for (let i = 1; i < profsDuJour.length; i++) {
      html += `<div class="profSep" style="left:${i * 100 / profsDuJour.length}%"></div>`;
    }
    daySlots.forEach(s => {
      const top = ((planningStartMinutes(s) - PLANNING_START_HOUR * 60) / PLANNING_SLOT_MIN) * PLANNING_ROW_PX;
      const height = (s.duration_minutes / PLANNING_SLOT_MIN) * PLANNING_ROW_PX - 2;
      const conflict = conflictIdx.has(slots.indexOf(s));
      const place = placementDuJour.get(s.id) || { colonne: 0, sousIndex: 0, sousTotal: 1 };
      const largeurColonne = 100 / Math.max(1, profsDuJour.length);
      const gauche = place.colonne * largeurColonne + place.sousIndex * largeurColonne / place.sousTotal;
      const largeur = largeurColonne / place.sousTotal;
      // Toutes periodes : les quatre activites sont empilees, comme sur le planning personnel.
      // La case est etroite - une colonne par enseignant - donc chaque ligne est reduite jusqu'a
      // tenir (voir ajusterLibellesCases), en gardant toujours le numero de periode : "P2 · Esc"
      // se lit encore, "Esc" seul ne dirait pas de quelle periode il s'agit. L'infobulle de la
      // case porte le detail complet.
      const activitesDuCreneau = planningCommunityActivities
        .filter(a => a.slot_id === s.id)
        .sort((a, b) => Number(a.period_number) - Number(b.period_number));
      const periodInfo = planningPeriod === 0
        ? null
        : activitesDuCreneau.find(a => Number(a.period_number) === Number(planningPeriod));
      // Une case vide dit deja que l'activite reste a choisir : ecrire "A definir" prenait la
      // place du seul mot qu'on vient y lire.
      const activity = (periodInfo?.apsa_name || "").trim();
      const detailPeriodes = planningPeriod === 0
        ? activitesDuCreneau.map(a => `P${a.period_number} · ${a.apsa_name || "A definir"}`).join(" — ")
        : "";
      const lignesPeriodes = planningPeriod !== 0 ? "" : activitesDuCreneau.map(a => {
        const nom = (a.apsa_name || "").trim() || "A definir";
        const complet = `P${a.period_number} · ${nom}`;
        return `<span class="apFit apPeriodeFit" data-periode="P${a.period_number}" data-full="${planningText(complet)}">${planningText(complet)}</span>`;
      }).join("");
      // Le rouge du conflit doit rester lisible : il l'emporte sur la couleur de l'enseignant.
      const [fond, encre] = couleurEnseignant(s.teacher_label);
      const style = conflict ? "" : `background:${fond}; border-left-color:${encre}; color:${encre};`;
      // L'infobulle va sur la case entiere, pas sur le libelle de classe : ajusterLibellesCases
      // reecrit le title des libelles pour y mettre le nom complet quand il est abrege.
      html += `<div class="planningBlock${conflict ? " conflict" : ""}"${
        detailPeriodes ? ` title="${planningText(s.class_label || "?")} — ${planningText(detailPeriodes)}"` : ""
      } style="top:${top}px; height:${height}px; left:calc(${gauche}% + 1px); right:auto; width:calc(${largeur}% - 2px); ${style}">
        <span class="cl clFit" data-full="${planningText(s.class_label || "?")}">${planningText(s.class_label || "?")}</span>
        ${activity ? `<span class="apFit" data-full="${planningText(activity)}">${planningText(activity)}</span>` : ""}${lignesPeriodes}
      </div>`;
    });
    html += `</div>`;
  });

  html += `</div></div>`;

  // Legende : sans elle, les couleurs ne veulent rien dire pour qui ouvre la page.
  if (ordreEnseignants.length > 1) {
    html += `<div class="calLegend">` + ordreEnseignants.map(nom => {
      const [fond, encre] = couleurEnseignant(nom);
      return `<span><span class="box" style="background:${fond}; border-color:${encre}"></span>${planningText(nom)}</span>`;
    }).join("") + `</div>`;
  }

  wrap.innerHTML = html;
  wrap.querySelector(".planningGrid").style.minHeight = gridHeight + "px";
  installPlanningScroll(wrap.querySelector(".planningWrap"));
  ajusterLibellesCases(wrap);
}

/**
 * Repartit les creneaux d'une journee en colonnes qui ne se chevauchent jamais.
 *
 * Le calcul se faisait creneau par creneau : chacun comptait ceux qui le croisaient et en
 * deduisait sa position. Deux creneaux pouvaient donc tomber sur la meme place. Avec A de 8h a
 * 9h, B de 8h30 a 9h30 et C de 9h a 10h, A se croyait seul face a B et prenait la moitie
 * gauche, tandis que B se partageait en trois : leurs cases se recouvraient de 8h30 a 9h.
 *
 * On traite maintenant la journee d'un bloc. Les creneaux qui se touchent forment un groupe ;
 * dans un groupe, chacun prend la premiere colonne libre a son heure de debut, et tout le
 * groupe se partage la largeur en autant de colonnes qu'il en a fallu.
 */
function repartirEnColonnes(creneaux) {
  const tri = [...creneaux].sort((a, b) => planningStartMinutes(a) - planningStartMinutes(b)
    || (a.teacher_label || "").localeCompare(b.teacher_label || "")
    || String(a.id).localeCompare(String(b.id)));
  const placement = new Map();
  let groupe = [], finsDeColonnes = [], finDuGroupe = -Infinity;

  const cloturerGroupe = () => {
    groupe.forEach(id => { placement.get(id).total = finsDeColonnes.length; });
    groupe = []; finsDeColonnes = [];
  };

  tri.forEach(s => {
    const debut = planningStartMinutes(s), fin = debut + s.duration_minutes;
    // Plus aucun creneau du groupe n'est encore en cours : le groupe est clos.
    if (groupe.length && debut >= finDuGroupe) cloturerGroupe();
    let colonne = finsDeColonnes.findIndex(finCol => finCol <= debut);
    if (colonne === -1) { finsDeColonnes.push(fin); colonne = finsDeColonnes.length - 1; }
    else finsDeColonnes[colonne] = fin;
    placement.set(s.id, { index: colonne, total: 0 });
    groupe.push(s.id);
    finDuGroupe = groupe.length === 1 ? fin : Math.max(finDuGroupe, fin);
  });
  if (groupe.length) cloturerGroupe();
  return placement;
}

/**
 * Reserve une colonne a chaque enseignant present dans la journee.
 *
 * Au plus serre, un professeur changeait de colonne au fil des heures : sa journee ne se lisait
 * pas d'un trait, et une case vide ne voulait rien dire. Avec une colonne par enseignant, on
 * suit sa journee du regard de haut en bas et un trou signifie qu'il n'a pas cours.
 *
 * L'ordre est celui de la legende, pour que la meme personne soit toujours a la meme place.
 */
function placementParEnseignant(creneauxDuJour) {
  const profs = [...new Set(creneauxDuJour.map(s => nomCourtEnseignant(s.teacher_label) || "?"))].sort();
  const placement = new Map();
  profs.forEach((nom, colonne) => {
    const siens = creneauxDuJour.filter(s => (nomCourtEnseignant(s.teacher_label) || "?") === nom);
    // Un professeur n'a normalement pas deux cours a la meme heure, ses creneaux s'enchainent.
    // Si la base en contenait malgre tout, sa colonne se coupe plutot que de laisser une case
    // en cacher une autre : une donnee ne doit pas disparaitre en silence.
    const interne = repartirEnColonnes(siens);
    siens.forEach(s => {
      const sous = interne.get(s.id) || { index: 0, total: 1 };
      placement.set(s.id, { colonne, sousIndex: sous.index, sousTotal: Math.max(1, sous.total) });
    });
  });
  return { profs, placement };
}

/**
 * Largeur minimale d'une case. Le plancher mesure est 36 px, en dessous duquel l'activite
 * tombe a deux lettres ; on prend nettement plus large, l'equipe preferant faire defiler la
 * grille vers la droite plutot que de dechiffrer des libelles de trois lettres.
 */
const LARGEUR_CASE_MIN = 42;

/**
 * Largeurs des colonnes de Planning global EPS, une journee a la fois.
 *
 * Les creneaux simultanes se partagent la largeur d'une journee : a cinq collegues en meme
 * temps, chaque case tombe sous vingt pixels et il ne reste qu'une lettre. On donne donc a
 * chaque jour de quoi loger ses creneaux les plus nombreux, quitte a ce que la grille depasse
 * l'ecran - elle defile deja horizontalement, alors qu'un libelle rogne, lui, ne revient pas.
 */
function largeursColonnesEps(slots) {
  const parJour = {};
  PLANNING_DAYS.forEach(d => {
    // Autant de colonnes que d'enseignants ce jour-la, puisque chacun garde la sienne.
    const { profs } = placementParEnseignant(slots.filter(x => x.day_of_week === d.key));
    parJour[d.key] = Math.max(1, profs.length);
  });
  const colonnes = PLANNING_DAYS.map(d =>
    `minmax(${Math.max(110, parJour[d.key] * LARGEUR_CASE_MIN)}px, 1fr)`).join(" ");
  return `40px ${colonnes}`;
}

/**
 * Ecritures de plus en plus courtes d'un nom de classe, de la plus complete a la plus reduite.
 *
 * Le nom du professeur part en premier : la couleur de la case et la legende le disent deja,
 * et "Terminale Jeudi - Diouch" mange toute la largeur pour une information en double. Ne
 * restent ensuite que "Terminale" et "Premiere", seuls niveaux ecrits en toutes lettres.
 */
function variantesClasse(libelle) {
  const complet = String(libelle || "?").trim();
  const sansProf = complet.split("\u2014")[0].trim() || complet;
  const abrege = sansProf.replace(/\bTerminale\b/i, "Term").replace(/\bPremi[eè]re\b/i, "Pre");
  const lettre = sansProf.replace(/\bTerminale\b/i, "T").replace(/\bPremi[eè]re\b/i, "P");
  return [...new Set([complet, sansProf, abrege, lettre].filter(Boolean))];
}

/** Nom entier, puis ses trois premieres lettres, puis deux, puis une. */
function variantesActivite(libelle) {
  const complet = String(libelle || "").trim();
  return [...new Set([complet, complet.slice(0, 3), complet.slice(0, 2), complet.slice(0, 1)]
    .map(x => x.trim()).filter(Boolean))];
}

/**
 * Comme variantesActivite, mais le numero de periode ne se perd jamais : c'est lui qui donne son
 * sens a la ligne. "Esc" seul ne dit pas de quelle periode il s'agit, "P2 · Esc" si.
 */
function variantesActivitePeriode(prefixe, complet) {
  const nom = String(complet || "").split(" · ").slice(1).join(" · ").trim();
  return [...new Set([complet, `${prefixe} · ${nom.slice(0, 3)}`, `${prefixe} · ${nom.slice(0, 1)}`, prefixe]
    .map(x => x.trim()).filter(Boolean))];
}

/**
 * Reduit chaque libelle jusqu'a ce qu'il tienne dans sa case.
 *
 * Les cases d'une meme journee se partagent la largeur entre les collegues qui se chevauchent :
 * a cinq creneaux simultanes il ne reste qu'une vingtaine de pixels, ou "Musculation" ne veut
 * plus rien dire. On mesure la place reelle plutot que de deviner un seuil, sinon le resultat
 * dependrait de la police et de la taille de l'ecran.
 */
function ajusterLibellesCases(wrap) {
  wrap.querySelectorAll(".clFit, .apFit").forEach(el => {
    const complet = el.dataset.full || "";
    const essais = el.classList.contains("clFit") ? variantesClasse(complet)
      : el.classList.contains("apPeriodeFit") ? variantesActivitePeriode(el.dataset.periode || "", complet)
      : variantesActivite(complet);
    el.title = complet;
    for (const essai of essais) {
      el.textContent = essai;
      // clientWidth vaut 0 tant que la grille n'est pas affichee : on garde alors la version
      // la plus courte, que le prochain redimensionnement corrigera.
      if (el.clientWidth > 0 && el.scrollWidth <= el.clientWidth) break;
    }
  });
}

// Changer la largeur de la fenetre change le nombre de lettres qui tiennent.
let ajustementCasesEnAttente = null;
window.addEventListener("resize", () => {
  if (planningMode !== "eps") return;
  clearTimeout(ajustementCasesEnAttente);
  ajustementCasesEnAttente = setTimeout(() => {
    const wrap = document.getElementById("planningGrid");
    if (wrap) ajusterLibellesCases(wrap);
  }, 150);
});

// ---- Planning > Installations : qui occupe quoi, et quand ----
//
// Le tableau reprend la feuille tenue a la main par l'equipe : une colonne par espace
// reellement occupable, une ligne par demi-heure, et dans la case les deux premieres lettres
// du professeur. Il se remplit a partir des installations choisies dans le Planning, ce qui
// evite de tenir deux fois la meme information.

let planningInstallationDay = TODAY_DAY_KEY || PLANNING_DAYS[0].key;

// Un espace divisible s'ecrit avec sa fraction : "Gymnase 2/3", "1/2 Piscine". Ces parts sont
// les colonnes du tableau ; le nom sans fraction ("Gymnase") designe l'ensemble.
const FRACTION_INSTALLATION = /(^|\s)\d+\s*\/\s*\d+(\s|$)/;

function cleInstallation(nom) {
  return String(nom || "").normalize("NFD").replace(/\p{Mn}+/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function estPartieInstallation(nom) { return FRACTION_INSTALLATION.test(String(nom || "")); }
function familleInstallation(nom) {
  return String(nom || "").replace(FRACTION_INSTALLATION, " ").replace(/\s+/g, " ").trim();
}

/** Les colonnes du tableau : les parts si l'installation est divisible, sinon l'installation. */
function couloirsInstallations(installations) {
  const parts = installations.filter(i => estPartieInstallation(i.name));
  const famillesDivisees = new Set(parts.map(i => cleInstallation(familleInstallation(i.name))));
  // "Gymnase" ne devient pas une colonne : ses deux tiers en sont deja.
  return installations.filter(i => estPartieInstallation(i.name) || !famillesDivisees.has(cleInstallation(i.name)));
}

/**
 * Les colonnes qu'occupe un choix d'installation.
 *
 * Prendre le tout, c'est prendre chaque part : "Gymnase" occupe le 2/3 et le 1/3. Prendre une
 * part n'occupe qu'une colonne - et quand deux parts portent le meme nom (les deux moities de
 * piscine), on prend celle qui est encore libre plutot que d'inventer un conflit.
 */
function couloirsOccupes(nomChoisi, couloirs, estLibre) {
  const choisi = cleInstallation(nomChoisi);
  if (!choisi) return [];
  const exacts = couloirs.filter(c => cleInstallation(c.name) === choisi);
  if (exacts.length) return [exacts.find(estLibre) || exacts[0]];
  return couloirs.filter(c => estPartieInstallation(c.name)
    && cleInstallation(familleInstallation(c.name)) === choisi);
}

/** "Louit" -> "Lo", "Diouch" -> "Di" : la case est trop etroite pour le nom entier. */
function initialesEnseignant(libelle) {
  return (nomCourtEnseignant(libelle) || "?").slice(0, 2);
}

/**
 * Repartit les creneaux du jour dans les colonnes, demi-heure par demi-heure.
 * Renvoie aussi ce qui n'a pas pu etre place, pour le dire au lieu de le perdre.
 */
function occupationInstallations(couloirs, slots, activites, jour, periode) {
  const cases = new Map(couloirs.map(c => [c.id, Array.from({ length: PLANNING_ROWS }, () => [])]));
  const horsTableau = [];

  const duJour = slots.filter(s => s.day_of_week === jour).sort((a, b) =>
    planningStartMinutes(a) - planningStartMinutes(b)
    || (a.teacher_label || "").localeCompare(b.teacher_label || "")
    || a.id.localeCompare(b.id));

  duJour.forEach(s => {
    const activite = activites.find(a => a.slot_id === s.id && Number(a.period_number) === Number(periode));
    const nom = activite?.installation_name || s.installation_name;
    if (!nom) return;
    const debut = Math.floor((planningStartMinutes(s) - PLANNING_START_HOUR * 60) / PLANNING_SLOT_MIN);
    const fin = Math.min(PLANNING_ROWS, debut + Math.ceil(s.duration_minutes / PLANNING_SLOT_MIN));
    const premiere = Math.max(0, debut);
    if (fin <= premiere) return;

    const estLibre = c => {
      const lignes = cases.get(c.id);
      for (let i = premiere; i < fin; i++) if (lignes[i].length) return false;
      return true;
    };
    const cibles = couloirsOccupes(nom, couloirs, estLibre);
    if (!cibles.length) { horsTableau.push({ nom, slot: s }); return; }

    const marque = {
      initiales: initialesEnseignant(s.teacher_label),
      enseignant: nomCourtEnseignant(s.teacher_label) || "?",
      classe: s.class_label || "?",
      activite: activite?.apsa_name || null
    };
    cibles.forEach(c => { for (let i = premiere; i < fin; i++) cases.get(c.id)[i].push(marque); });
  });

  return { cases, horsTableau };
}

function renderPlanningInstallationsGrid() {
  const wrap = document.getElementById("planningGrid");
  const couloirs = couloirsInstallations(planningInstallations.filter(i => !i.deleted));

  if (!couloirs.length) {
    wrap.innerHTML = `<div class="placeholder" style="padding:18px 20px">Aucune installation enregistree. Ajoutez-les dans <strong>Equipement &rsaquo; Installations</strong> : elles deviendront les colonnes de ce tableau.<br><span class="muted">Ecrivez les espaces divisibles avec leur fraction — "Gymnase 2/3", "Gymnase 1/3", "1/2 Piscine" — pour que le tableau sache qu'ils s'occupent separement.</span></div>`;
    return;
  }

  const slots = planningCommunitySlots || [];
  const { cases, horsTableau } = occupationInstallations(couloirs, slots, planningCommunityActivities, planningInstallationDay, planningPeriod);

  let html = `<div class="installDays">` + PLANNING_DAYS.map(d =>
    `<button type="button" class="periodChip${d.key === planningInstallationDay ? " active" : ""}" data-install-day="${d.key}">${d.label}</button>`
  ).join("") + `</div>`;

  html += `<div style="overflow-x:auto"><table class="installTable"><thead><tr><th></th>`
    + couloirs.map(c => `<th>${planningText(c.name)}</th>`).join("") + `</tr></thead><tbody>`;

  for (let i = 0; i < PLANNING_ROWS; i++) {
    const minutes = PLANNING_START_HOUR * 60 + i * PLANNING_SLOT_MIN;
    html += `<tr><th class="installHour">${planningMinutesLabel(minutes)}</th>`;
    couloirs.forEach(c => {
      const marques = cases.get(c.id)[i];
      if (!marques.length) { html += `<td></td>`; return; }
      // Deux professeurs dans le meme espace a la meme heure : c'est un conflit, pas un partage.
      const conflit = new Set(marques.map(m => m.enseignant)).size > 1;
      const [fond, encre] = couleurEnseignant(marques[0].enseignant);
      const style = conflit ? `background:#FFD9D9; color:#8A1C1C; font-weight:700` : `background:${fond}; color:${encre}`;
      const titre = marques.map(m => `${m.enseignant} · ${m.classe}${m.activite ? " · " + m.activite : ""}`).join(" / ");
      html += `<td style="${style}" title="${planningText(titre)}">${planningText(marques.map(m => m.initiales).join("/"))}</td>`;
    });
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;

  if (horsTableau.length) {
    const noms = [...new Set(horsTableau.map(h => h.nom))].sort();
    html += `<div class="placeholder" style="padding:12px 16px; margin-top:12px">Sans colonne dans ce tableau : <strong>${planningText(noms.join(", "))}</strong>.<br><span class="muted">Ajoutez ces installations dans Equipement &rsaquo; Installations pour les voir apparaitre.</span></div>`;
  }

  const enseignants = [...new Set(slots.filter(x => x.day_of_week === planningInstallationDay)
    .map(x => nomCourtEnseignant(x.teacher_label) || "?"))].sort();
  if (enseignants.length > 1) {
    html += `<div class="calLegend">` + enseignants.map(nom => {
      const [fond, encre] = couleurEnseignant(nom);
      return `<span><span class="box" style="background:${fond}; border-color:${encre}"></span>${planningText(nom.slice(0, 2))} — ${planningText(nom)}</span>`;
    }).join("") + `</div>`;
  }

  wrap.innerHTML = html;
  wrap.querySelectorAll("[data-install-day]").forEach(b => b.addEventListener("click", () => {
    planningInstallationDay = b.dataset.installDay;
    renderPlanningInstallationsGrid();
  }));
}

/** Bouton "Analyser" : relit le planning partage a jour, puis liste chaque chevauchement
 * d'installation restant a traiter (deja exclus : les paires validees precedemment). */
async function runPlanningAnalysis() {
  const btn = document.getElementById("planningAnalyzeBtn");
  btn.disabled = true; btn.textContent = "Analyse...";
  await loadPlanningCommunity();
  btn.disabled = false; btn.textContent = "Analyser";
  renderPlanningGrid_ifEps();
  planningAnalysisConflicts = findCommunityConflictPairs(planningCommunitySlots || []);
  renderPlanningAnalysisPanel();
}

function renderPlanningGrid_ifEps() {
  if (planningMode === "eps") renderPlanningEpsGrid();
}

function planningSlotSummary(s) {
  const day = PLANNING_DAYS.find(d => d.key === s.day_of_week);
  const start = planningStartMinutes(s);
  const end = start + s.duration_minutes;
  return `${day ? day.label : s.day_of_week} ${planningMinutesLabel(start)}-${planningMinutesLabel(end)} · ${s.class_label || "?"} (${nomCourtEnseignant(s.teacher_label) || "?"})`;
}

function renderPlanningAnalysisPanel() {
  const panel = document.getElementById("planningAnalysisPanel");
  const conflicts = planningAnalysisConflicts;
  if (conflicts === null) { panel.style.display = "none"; return; }
  if (conflicts.length === 0) {
    panel.innerHTML = `<h2>Analyse</h2><div class="ok">Aucun chevauchement d'installation a traiter.</div>`;
    panel.style.display = "block";
    return;
  }
  panel.innerHTML = `<h2>Analyse — ${conflicts.length} chevauchement(s) d'installation</h2>` +
    conflicts.map((p, i) => `
      <div class="card" style="margin-top:${i === 0 ? 0 : 10}px">
        <div><strong>${planningText(libelleInstallationsConflit(p))}</strong></div>
        <div class="muted" style="font-size:11px">${planningText(libellePeriodesConflit(p))}</div>
        <div class="muted" style="margin-top:4px">${planningSlotSummary(p.slotA)}</div>
        <div class="muted">${planningSlotSummary(p.slotB)}</div>
        <div style="margin-top:10px">
          <button class="secondary" data-fix="${i}" style="margin-top:0">A corriger</button>
          <button data-validate="${i}" style="margin-top:0">Valider quand meme</button>
        </div>
      </div>`).join("");
  panel.style.display = "block";
  panel.querySelectorAll("[data-fix]").forEach(b => b.addEventListener("click", () => {
    planningAnalysisConflicts.splice(parseInt(b.dataset.fix, 10), 1);
    renderPlanningAnalysisPanel();
  }));
  panel.querySelectorAll("[data-validate]").forEach(b => b.addEventListener("click", async () => {
    const idx = parseInt(b.dataset.validate, 10);
    const p = planningAnalysisConflicts[idx];
    const [a, bId] = conflictPairKey(p.slotA.id, p.slotB.id);
    await apiFetch(`${SUPABASE_URL}/rest/v1/installation_conflict_overrides`, {
      method: "POST",
      body: JSON.stringify({ id: crypto.randomUUID(), slot_id_a: a, slot_id_b: bId, created_by: session.user_id })
    });
    planningConflictOverrides.push({ slot_id_a: a, slot_id_b: bId });
    planningAnalysisConflicts.splice(idx, 1);
    renderPlanningAnalysisPanel();
    renderPlanningGrid_ifEps();
  }));
}

function onPlanningEmptyCellClick(day, minutes) {
  if (planningMode !== "global") return;
  if (planningPendingClass) {
    openPlanningSecondSlotPanel(day, minutes);
  } else {
    openPlanningClassChoicePanel(day, minutes);
  }
}

function onPlanningSlotClick(slotId) {
  const slot = planningSlots.find(s => s.id === slotId);
  if (!slot) return;
  if (planningMode === "global") openPlanningEditSlotPanel(slot);
  else openPlanningActivityPanel(slot);
}

function durationChipsHtml(name, selected) {
  return PLANNING_DURATIONS.map(([min, label]) =>
    `<button type="button" class="secondary durationChip" data-${name}="${min}" style="margin-top:0; ${min === selected ? "background:var(--accent-container); border-color:var(--accent-container);" : ""}">${label}</button>`
  ).join(" ");
}

/** "Aucune" + les installations enregistrees (module Equipement). */
function installationChipsHtml(name, selectedName) {
  const none = `<button type="button" class="secondary installationChip" data-${name}="" style="display:block; width:100%; text-align:left; margin-top:4px; ${!selectedName ? "background:var(--accent-container); border-color:var(--accent-container);" : ""}">Aucune</button>`;
  // Un espace divisible est enregistre autant de fois qu'il a de parts : la piscine tient deux
  // lignes "Piscine 1/2". Les proposer toutes afficherait deux boutons identiques, et comme le
  // choix se retient par son nom, en cocher un les allumerait tous les deux. Ce qu'on choisit
  // ici c'est "une demi-piscine" ; c'est le tableau d'occupation qui decide laquelle est libre.
  const uniques = [];
  planningInstallations.forEach(inst => {
    if (!uniques.some(u => cleInstallation(u.name) === cleInstallation(inst.name))) uniques.push(inst);
  });
  const chips = uniques.map(inst =>
    `<button type="button" class="secondary installationChip" data-${name}="${inst.name}" style="display:block; width:100%; text-align:left; margin-top:4px; ${inst.name === selectedName ? "background:var(--accent-container); border-color:var(--accent-container);" : ""}">${inst.name}</button>`
  ).join("");
  return none + chips;
}
function wireInstallationChips(panel, containerId, dataAttr, onSelect) {
  panel.querySelectorAll(`#${containerId} .installationChip`).forEach(btn => {
    btn.addEventListener("click", () => {
      onSelect(btn.dataset[dataAttr] || null);
      panel.querySelectorAll(`#${containerId} .installationChip`).forEach(b => b.style.cssText = "display:block; width:100%; text-align:left; margin-top:4px");
      btn.style.cssText = "display:block; width:100%; text-align:left; margin-top:4px; background:var(--accent-container); border-color:var(--accent-container);";
    });
  });
}

function periodPlannerHtml(grade, plans, openStep, prefix) {
  if (!grade) return "";
  let html = "";
  for (let p = 1; p <= planningPeriodCount(grade); p++) {
    const activityStep = 3 + (p - 1) * 2, installationStep = activityStep + 1;
    const plan = plans[p] || {};
    html += `<details ${openStep === activityStep ? "open" : ""}><summary><strong>Periode ${p} · Activite</strong>${plan.activity ? ` — ${plan.activity}` : " — A definir"}</summary>
      <div class="periodActivityChoices" data-period="${p}" style="margin-top:8px">${(PROGRAMMATION[grade] || []).map(a => `<button type="button" class="secondary durationChip" data-period-activity="${p}" data-activity="${a}" style="margin-top:0">${a}</button>`).join(" ")}</div></details>
      <details ${openStep === installationStep ? "open" : ""}><summary><strong>Periode ${p} · Installation</strong> — ${plan.installation || "Aucune"}</summary>
      <div id="${prefix}Installation${p}" style="margin-top:8px">${installationChipsHtml(`${prefix}inst${p}`, plan.installation || null)}</div></details>`;
  }
  return html;
}

function wirePeriodPlanner(panel, grade, plans, prefix, onChange) {
  panel.querySelectorAll("[data-period-activity]").forEach(btn => btn.addEventListener("click", () => {
    const p = parseInt(btn.dataset.periodActivity, 10);
    plans[p] = { ...(plans[p] || {}), activity: btn.dataset.activity };
    onChange(3 + (p - 1) * 2 + 1);
  }));
  if (!grade) return;
  for (let p = 1; p <= planningPeriodCount(grade); p++) {
    wireInstallationChips(panel, `${prefix}Installation${p}`, `${prefix}inst${p}`, name => {
      plans[p] = { ...(plans[p] || {}), installation: name };
      onChange(p < planningPeriodCount(grade) ? 3 + p * 2 : -1);
    });
  }
}

/** Ne relie/cree jamais depuis une liste de classes existantes : on choisit niveau+numero
 * (ex : 6e2), et findOrCreatePlanningClass se charge de relier ou creer automatiquement
 * (meme principe que l'app, section Planning). */
function openPlanningClassChoicePanel(day, minutes) {
  const panel = document.getElementById("planningPanel");
  let selectedGrade = null;
  let selectedNumber = null;
  let selectedDuration = 60;
  let periodPlans = {};
  let openStep = 0;
  let selectedStartMinutes = minutes;
  let showStartTimes = false;

  function render() {
    // Une Terminale se distingue par son jour, pas par un numero : c'est la meme regle que
    // le formulaire Creation classe, qui l'appliquait deja.
    const regleCreneau = selectedGrade ? creneauxNommes(selectedGrade) : null;
    const numeroLabels = regleCreneau ? regleCreneau.choix : ["1","2","3","4","5","6","7","8","9"];
    panel.innerHTML = `
      <h2>Nouveau creneau · <button type="button" class="secondary" id="planningStartTimeBtn" style="margin-top:0">${planningMinutesLabel(selectedStartMinutes)}</button></h2>
      ${showStartTimes ? `<div id="planningStartTimeList" style="max-height:260px; overflow-y:auto">${Array.from({length:PLANNING_ROWS}, (_,i) => PLANNING_START_HOUR * 60 + i * PLANNING_SLOT_MIN).map(value => `<button type="button" class="secondary planningStartOption" data-start="${value}" style="display:block;width:100%;text-align:left;margin-top:4px">${planningMinutesLabel(value)}</button>`).join("")}</div>` : ""}
      <details id="planningGradeStep" ${openStep === 0 ? "open" : ""}><summary><strong>Niveau</strong>${selectedGrade ? ` — ${GRADE_LABELS[selectedGrade]}` : ""}</summary>
      <div id="planningGradeChips" style="margin-top:8px">${Object.keys(GRADE_LABELS).map(g =>
        `<button type="button" class="secondary durationChip" data-grade="${g}" style="margin-top:0; ${g === selectedGrade ? "background:var(--accent-container); border-color:var(--accent-container);" : ""}">${GRADE_LABELS[g]}</button>`
      ).join(" ")}</div></details>
      ${selectedGrade ? `
        <details id="planningNumberStep" ${openStep === 1 ? "open" : ""}><summary><strong>${regleCreneau ? regleCreneau.intitule : "Numero de classe"}</strong>${selectedNumber ? ` — ${numeroLabels[selectedNumber - 1]}` : ""}</summary>
        <div id="planningNumberChips" style="margin-top:8px">${numeroLabels.map((label, index) =>
          `<button type="button" class="secondary durationChip" data-num="${index + 1}" style="margin-top:0; ${index + 1 === selectedNumber ? "background:var(--accent-container); border-color:var(--accent-container);" : ""}">${label}</button>`
        ).join(" ")}</div></details>` : ""}
      <details id="planningDurationStep" ${openStep === 2 ? "open" : ""}><summary><strong>Duree</strong> — ${PLANNING_DURATIONS.find(x => x[0] === selectedDuration)?.[1] || ""}</summary>
      <div id="planningDurationChips" style="margin-top:8px">${durationChipsHtml("dur", selectedDuration)}</div></details>
      ${periodPlannerHtml(selectedGrade, periodPlans, openStep, "new")}
      <button id="planningConfirmBtn">Valider</button>
      <button class="secondary" id="planningCancelBtn">Annuler</button>
      <div class="error" id="planningPanelError"></div>`;
    panel.querySelectorAll("#planningGradeChips [data-grade]").forEach(btn => {
      btn.addEventListener("click", () => { selectedGrade = btn.dataset.grade; selectedNumber = null; periodPlans = {}; openStep = 1; render(); });
    });
    if (selectedGrade) {
      panel.querySelectorAll("#planningNumberChips [data-num]").forEach(btn => {
        btn.addEventListener("click", () => { selectedNumber = parseInt(btn.dataset.num, 10); openStep = 2; render(); });
      });
    }
    panel.querySelectorAll("#planningDurationChips .durationChip").forEach(btn => {
      btn.addEventListener("click", () => {
        selectedDuration = parseInt(btn.dataset.dur, 10);
        openStep = 3; render();
      });
    });
    document.getElementById("planningStartTimeBtn").addEventListener("click", () => { showStartTimes = !showStartTimes; render(); });
    panel.querySelectorAll(".planningStartOption").forEach(btn => btn.addEventListener("click", () => {
      selectedStartMinutes = parseInt(btn.dataset.start, 10); showStartTimes = false; render();
    }));
    wirePeriodPlanner(panel, selectedGrade, periodPlans, "new", next => { openStep = next; render(); });
    document.getElementById("planningCancelBtn").addEventListener("click", () => panel.style.display = "none");
    document.getElementById("planningConfirmBtn").addEventListener("click", async () => {
      if (!selectedGrade || !selectedNumber) {
        document.getElementById("planningPanelError").textContent = "Choisissez un niveau et un numero de classe.";
        return;
      }
      try {
        const classId = await planningFindOrCreateClass(selectedGrade, selectedNumber);
        await planningCreateSlot(classId, day, selectedStartMinutes, selectedDuration, null, periodPlans);
        panel.style.display = "none";
      } catch (e) {
        // creationClassName refuse une Terminale sans nom d'enseignant : le message doit
        // arriver ici plutot que de laisser le panneau se fermer sur une classe mal nommee.
        document.getElementById("planningPanelError").textContent = e.message;
      }
    });
  }
  render();
  panel.style.display = "block";
}

/** Relie a la classe existante (meme niveau+numero+annee) si elle existe, sinon la cree vide
 * et la signale dans planningNewlyCreatedClasses (rappel affiche par renderPlanningTab). */
async function planningFindOrCreateClass(grade, classNumber) {
  const schoolYear = (document.getElementById("schoolYear") || {}).value || "2026-2027";
  const existing = planningClasses.find(c => c.grade === grade && c.class_number === classNumber && c.school_year === schoolYear);
  if (existing) return existing.id;
  const newClass = {
    id: crypto.randomUUID(), user_id: session.user_id, grade, class_number: classNumber,
    // Meme convention que le formulaire Creation classe : une Terminale porte son jour et le
    // nom de l'enseignant, pas un numero. Sans cela le Planning creait des classes "Tle3".
    school_year: schoolYear, name: creationClassName(grade, classNumber),
    updated_at: new Date().toISOString(), deleted: false
  };
  await apiFetch(`${SUPABASE_URL}/rest/v1/classes`, { method: "POST", body: JSON.stringify(newClass) });
  await loadPlanningClasses();
  planningNewlyCreatedClasses = [...planningNewlyCreatedClasses, newClass];
  return newClass.id;
}

function openPlanningSecondSlotPanel(day, minutes) {
  const panel = document.getElementById("planningPanel");
  const classGroup = planningPendingClass;
  let selectedDuration = 60;
  let selectedInstallation = null;
  panel.innerHTML = `
    <h2>2e creneau de ${planningText(planningClassLabel(classGroup))}</h2>
    <div class="muted">${planningText(planningClassLabel(classGroup))} a EPS deux fois par semaine. Ce creneau : ${PLANNING_DAYS.find(d => d.key === day).label} ${planningMinutesLabel(minutes)}.</div>
    <label>Duree</label>
    <div id="planningDurationChips2">${durationChipsHtml("dur2", selectedDuration)}</div>
    <label>Installation</label>
    <div id="planningInstallationChips2">${installationChipsHtml("inst2", selectedInstallation)}</div>
    <button id="planningConfirmBtn2">Placer ce creneau</button>
    <button class="secondary" id="planningCancelBtn2">Annuler</button>`;
  panel.style.display = "block";
  panel.querySelectorAll("#planningDurationChips2 .durationChip").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedDuration = parseInt(btn.dataset.dur2, 10);
      panel.querySelectorAll("#planningDurationChips2 .durationChip").forEach(b => b.style.cssText = "margin-top:0");
      btn.style.cssText = "margin-top:0; background:var(--accent-container); border-color:var(--accent-container);";
    });
  });
  wireInstallationChips(panel, "planningInstallationChips2", "inst2", (name) => { selectedInstallation = name; });
  document.getElementById("planningCancelBtn2").addEventListener("click", () => { planningPendingClass = null; panel.style.display = "none"; renderPlanningTab(); });
  document.getElementById("planningConfirmBtn2").addEventListener("click", async () => {
    await planningCreateSlot(classGroup.id, day, minutes, selectedDuration, selectedInstallation);
    panel.style.display = "none";
  });
}

/**
 * Dit pourquoi une modification du planning n'a pas eu lieu.
 *
 * Le planning se consulte hors connexion depuis que sa lecture passe par la copie locale : un
 * professeur va donc essayer de le modifier dans un gymnase. Ses ecritures, elles, ont besoin du
 * reseau - elles portent un protocole de concurrence partage avec l'application, qu'on ne double
 * pas. Sans ce message, le clic ne produisait rien du tout.
 */
function signalerPlanning(panel, erreur) {
  const message = String(erreur && erreur.message || erreur);
  panel.insertAdjacentHTML("beforeend",
    `<div class="error" style="margin-top:10px">${planningText(message)}</div>`);
}

async function openPlanningEditSlotPanel(slot) {
  const panel = document.getElementById("planningPanel");
  const cl = planningClassById(slot.class_id);
  let selectedDuration = slot.duration_minutes;
  let openStep = -1;
  const activitiesRes = await apiFetch(`${SUPABASE_URL}/rest/v1/period_activities?slot_id=eq.${slot.id}&deleted=eq.false&select=*`);
  const rows = activitiesRes.ok ? await activitiesRes.json() : [];
  const plans = Object.fromEntries(rows.map(r => [r.period_number, { id:r.id, updated_at:r.updated_at, activity:r.apsa_name, installation:r.installation_name || null }]));
  function renderEdit() {
    panel.innerHTML = `
      <h2>${planningText(planningClassLabel(cl))} · ${PLANNING_DAYS.find(d => d.key === slot.day_of_week).label}</h2>
      <label>Duree</label><div id="planningDurationChips3">${durationChipsHtml("dur3", selectedDuration)}</div>
      ${periodPlannerHtml(cl.grade, plans, openStep, "edit")}
      <button id="planningSaveBtn">Enregistrer</button>
      <button class="danger" id="planningDeleteBtn">Supprimer</button>
      <button class="secondary" id="planningCloseBtn">Fermer</button>`;
    panel.style.display = "block";
    panel.querySelectorAll("#planningDurationChips3 .durationChip").forEach(btn => btn.addEventListener("click", () => {
      selectedDuration = parseInt(btn.dataset.dur3, 10); renderEdit();
    }));
    wirePeriodPlanner(panel, cl.grade, plans, "edit", next => { openStep = next; renderEdit(); });
    document.getElementById("planningCloseBtn").addEventListener("click", () => panel.style.display = "none");
    document.getElementById("planningSaveBtn").addEventListener("click", async () => {
    try {
    const cl2 = planningClassById(slot.class_id);
    await apiFetch(`${SUPABASE_URL}/rest/v1/class_schedule_slots?id=eq.${slot.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        duration_minutes: selectedDuration,
        class_label: planningClassLabel(cl2), teacher_label: planningTeacherLabel(),
        updated_at: new Date().toISOString()
      })
    });
    for (const [period, plan] of Object.entries(plans)) {
      if (!plan.activity) continue;
      const body = { apsa_name:plan.activity, installation_name:plan.installation || null, updated_at:new Date().toISOString(), deleted:false };
      if (plan.id) await patchPlanningActivity(plan, body);
      else await apiFetch(`${SUPABASE_URL}/rest/v1/period_activities`, { method:"POST", body:JSON.stringify({ ...body, id:crypto.randomUUID(), user_id:session.user_id, slot_id:slot.id, period_number:parseInt(period,10) }) });
    }
    panel.style.display = "none";
    await rechargerPlanningApresEcriture();
    } catch (e) { signalerPlanning(panel, e); }
  });
  document.getElementById("planningDeleteBtn").addEventListener("click", async () => {
    try {
      await apiFetch(`${SUPABASE_URL}/rest/v1/class_schedule_slots?id=eq.${slot.id}`, {
        method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() })
      });
      panel.style.display = "none";
      await rechargerPlanningApresEcriture();
    } catch (e) { signalerPlanning(panel, e); }
  });
  }
  renderEdit();
}

function openPlanningActivityPanel(slot) {
  const panel = document.getElementById("planningPanel");
  const cl = planningClassById(slot.class_id);
  const options = PROGRAMMATION[cl.grade] || [];
  const hasLinkedSibling = planningLinksActivity(cl.grade) &&
    planningSlots.some(s => s.id !== slot.id && s.class_id === slot.class_id);
  let overrideOnly = false;
  const currentApsa = planningActivityForSlot(slot.id);

  function optionsHtml() {
    return options.map(a => `<option value="${a}"${a === currentApsa ? " selected" : ""}>${a}</option>`).join("");
  }

  panel.innerHTML = `
    <h2>${planningText(planningClassLabel(cl))} · Periode ${planningPeriod}</h2>
    ${hasLinkedSibling ? `<div class="muted" id="planningLinkNote" style="margin-bottom:8px">S'applique aux 2 creneaux de la semaine.</div>` : ""}
    <label for="planningApsaSelect">Activite</label>
    <select id="planningApsaSelect">${optionsHtml()}</select>
    ${hasLinkedSibling ? `<button type="button" class="secondary" id="planningOverrideBtn" style="margin-top:10px">Choisir une activite differente pour ce creneau</button>` : ""}
    <button id="planningSaveActivityBtn">Enregistrer</button>
    <button class="secondary" id="planningCloseActivityBtn">Fermer</button>
    ${currentApsa ? `<button class="danger" id="planningClearActivityBtn">Effacer</button>` : ""}`;
  panel.style.display = "block";

  if (hasLinkedSibling) {
    document.getElementById("planningOverrideBtn").addEventListener("click", () => {
      overrideOnly = true;
      document.getElementById("planningLinkNote").textContent = `S'applique uniquement a ce creneau (${PLANNING_DAYS.find(d => d.key === slot.day_of_week).label}).`;
      document.getElementById("planningOverrideBtn").style.display = "none";
    });
  }
  document.getElementById("planningCloseActivityBtn").addEventListener("click", () => panel.style.display = "none");
  document.getElementById("planningSaveActivityBtn").addEventListener("click", async () => {
    const apsaName = document.getElementById("planningApsaSelect").value;
    if (!apsaName) return;
    await planningSetActivity(cl, slot, apsaName, overrideOnly);
    panel.style.display = "none";
  });
  if (currentApsa) {
    document.getElementById("planningClearActivityBtn").addEventListener("click", async () => {
      await planningClearActivity(cl, slot, overrideOnly);
      panel.style.display = "none";
    });
  }
}

/**
 * Libelle affiche aux collegues dans Planning global EPS.
 *
 * On prend le nom du profil enseignant, comme le fait l'application. L'adresse complete
 * deborde de la case et n'apprend rien de plus : entre "Louit" et
 * "diouchh@citescolairehugorenoir.org", seul le premier se lit d'un coup d'oeil.
 */
function planningTeacherLabel() {
  const nom = (loadPrefs().teacherName || "").trim();
  return nom || nomCourtEnseignant(session.email) || "?";
}

/** Raccourcit une adresse deja enregistree : les anciens creneaux en portent encore. */
function nomCourtEnseignant(libelle) {
  const valeur = String(libelle || "").trim();
  if (!valeur.includes("@")) return valeur;
  const avantArobase = valeur.split("@")[0];
  return avantArobase.charAt(0).toUpperCase() + avantArobase.slice(1);
}

/**
 * Une couleur par enseignant, pour distinguer les creneaux d'un coup d'oeil. La couleur
 * derive du libelle : elle reste la meme d'une visite a l'autre et sur tous les appareils,
 * sans rien avoir a enregistrer.
 */
// Deux jeux au choix (Reglages > Visuel de l'accueil). Le clair repose l'oeil sur une grille
// chargee ; le vif separe mieux les collegues quand ils sont nombreux le meme jour. Chaque
// paire associe un fond et une encre assez sombre pour rester lisible dessus.
const COULEURS_ENSEIGNANTS_CLAIRES = [
  ["#D6ECFF", "#1B5E96"], ["#DFF3E0", "#256B2C"], ["#FFE9D4", "#8A4B12"],
  ["#EDE1FF", "#5B3A9B"], ["#FFE1EC", "#93264F"], ["#D8F3F0", "#14655E"],
  ["#FFF3C9", "#7A5B00"], ["#E4E7FF", "#33409B"]
];
const COULEURS_ENSEIGNANTS_VIVES = [
  ["#9CCDFB", "#0B3F6B"], ["#98DFA8", "#0E4A1B"], ["#FFC38A", "#63300B"],
  ["#CDB2FA", "#3A2073"], ["#FFA9C6", "#69102F"], ["#84DDD3", "#06413B"],
  ["#FFDA7A", "#523C00"], ["#B0B8FB", "#1F2A75"]
];

/** Le professeur choisit son jeu ; a defaut, le clair, qui etait le seul avant ce reglage. */
function paletteEnseignants() {
  return loadPrefs().planningPaletteVive ? COULEURS_ENSEIGNANTS_VIVES : COULEURS_ENSEIGNANTS_CLAIRES;
}

/**
 * La couleur vient du rang de l'enseignant dans la liste triee de ceux presents, pas d'un
 * calcul sur son nom : deux collegues ne peuvent donc pas heriter de la meme couleur tant
 * qu'ils sont moins de huit. Un calcul sur le nom donnait deux collisions des neuf noms.
 */
let ordreEnseignants = [];

function couleurEnseignant(libelle) {
  const palette = paletteEnseignants();
  const nom = nomCourtEnseignant(libelle) || "?";
  const rang = ordreEnseignants.indexOf(nom);
  return palette[(rang < 0 ? 0 : rang) % palette.length];
}

async function planningCreateSlot(classId, day, startMinutes, durationMinutes, installationName, periodPlans = {}) {
  const startTime = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
  const cl = planningClassById(classId);
  const newSlotId = crypto.randomUUID();
  await apiFetch(`${SUPABASE_URL}/rest/v1/class_schedule_slots`, {
    method: "POST",
    body: JSON.stringify({
      id: newSlotId, user_id: session.user_id, class_id: classId,
      day_of_week: day, start_time: startTime, duration_minutes: durationMinutes,
      installation_name: installationName || null,
      class_label: planningClassLabel(cl), teacher_label: planningTeacherLabel(),
      updated_at: new Date().toISOString(), deleted: false
    })
  });
  for (const [period, plan] of Object.entries(periodPlans)) {
    if (!plan.activity) continue;
    await apiFetch(`${SUPABASE_URL}/rest/v1/period_activities`, {
      method: "POST",
      body: JSON.stringify({ id: crypto.randomUUID(), user_id: session.user_id, slot_id: newSlotId, period_number: parseInt(period, 10), apsa_name: plan.activity, installation_name: plan.installation || null, updated_at: new Date().toISOString(), deleted: false })
    });
  }
  try { await modeHorsConnexion?.synchroniser(); } catch { /* le rechargement vaut mieux que rien */ }
  await loadPlanningSlots();
  const slotCount = planningSlots.filter(s => s.class_id === classId).length;
  planningPendingClass = slotCount < planningWeeklySlotsNeeded(cl.grade) ? cl : null;
  if (planningMode === "eps" || planningMode === "installations") await loadPlanningCommunity();
  renderPlanningTab();
}

async function planningSetActivity(classGroup, slot, apsaName, onlyThisSlot) {
  const applyToAll = !onlyThisSlot && planningLinksActivity(classGroup.grade);
  const targetSlotIds = applyToAll
    ? planningSlots.filter(s => s.class_id === classGroup.id).map(s => s.id)
    : [slot.id];
  for (const slotId of targetSlotIds) {
    const existing = planningActivities.find(a => a.slot_id === slotId && Number(a.period_number) === Number(planningPeriod));
    if (existing) {
      await patchPlanningActivity(existing, { apsa_name: apsaName });
    } else {
      await apiFetch(`${SUPABASE_URL}/rest/v1/period_activities`, {
        method: "POST",
        body: JSON.stringify({
          id: crypto.randomUUID(), user_id: session.user_id, slot_id: slotId,
          period_number: planningPeriod, apsa_name: apsaName,
          updated_at: new Date().toISOString(), deleted: false
        })
      });
    }
  }
  // Meme raison que rechargerPlanningApresEcriture : l'ecriture part en direct, la lecture vient
  // de la copie locale, et sans synchronisation entre les deux la grille afficherait l'etat
  // d'avant la saisie.
  try { await modeHorsConnexion?.synchroniser(); } catch { /* le rechargement vaut mieux que rien */ }
  await loadPlanningActivities();
  renderPlanningTab();
}

async function planningClearActivity(classGroup, slot, onlyThisSlot) {
  const applyToAll = !onlyThisSlot && planningLinksActivity(classGroup.grade);
  const targetSlotIds = applyToAll
    ? planningSlots.filter(s => s.class_id === classGroup.id).map(s => s.id)
    : [slot.id];
  for (const slotId of targetSlotIds) {
    const existing = planningActivities.find(a => a.slot_id === slotId && Number(a.period_number) === Number(planningPeriod));
    if (existing) {
      await patchPlanningActivity(existing, { deleted: true });
    }
  }
  // Meme raison que rechargerPlanningApresEcriture : l'ecriture part en direct, la lecture vient
  // de la copie locale, et sans synchronisation entre les deux la grille afficherait l'etat
  // d'avant la saisie.
  try { await modeHorsConnexion?.synchroniser(); } catch { /* le rechargement vaut mieux que rien */ }
  await loadPlanningActivities();
  renderPlanningTab();
}
