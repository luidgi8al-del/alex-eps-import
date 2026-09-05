/*
 * Onglet COURS : apercu d'un cycle, fiches de seance, mode cours et evaluations.
 *
 * Sorti d'index.html. Script classique, comme les dix autres fichiers du site :
 * les fonctions restent accessibles depuis les autres fichiers sans rien exporter,
 * et ce fichier est charge avant le script principal qui s'en sert.
 */

// ---- Onglet Cours : un cycle se prepare sans classe (seul le niveau est necessaire) ----

// Programmation locale de l'etablissement : memes listes que EtablissementProgrammation.kt.
const PROGRAMMATION = {
  SIXIEME: ["Natation", "Athletisme - sprint / relais", "Escalade", "Gymnastique au sol", "Danse", "Rugby", "Basket-ball", "Tennis de table", "Badminton"],
  CINQUIEME: ["Athletisme - relais / sprint", "Course de duree", "Cirque", "Volley-ball", "Lutte", "Rugby", "Ultimate"],
  QUATRIEME: ["Natation", "Escalade", "Acrosport", "Volley-ball", "Danse", "Ultimate"],
  TROISIEME: ["Aquathlon", "Escalade", "Rugby", "Badminton", "Athletisme - sprint / duree", "Musculation"],
  SECONDE: ["Escalade", "Acrosport", "Danse", "Badminton", "Musculation", "Course de duree", "Natation de duree"],
  PREMIERE: ["3 x 500 m", "Natation sauvetage", "Escalade", "Volley-ball", "Badminton", "Rugby", "Musculation", "Course de duree", "Acrosport", "Gymnastique au sol", "Tennis de table", "Pentabond"],
  TERMINALE: ["3 x 500 m", "Natation sauvetage", "Escalade", "Volley-ball", "Badminton", "Rugby", "Musculation", "Course de duree", "Acrosport", "Gymnastique au sol", "Tennis de table", "Pentabond"]
};
Object.assign(PROGRAMMATION, {PREMIERE_EPPCS:PROGRAMMATION.PREMIERE, TERMINALE_EPPCS:PROGRAMMATION.TERMINALE, SECONDE_SPORT_SANTE:PROGRAMMATION.SECONDE, OPTION_GOLF:["Golf"]});

// Meme regle que ProgrammeResolver.kt : l'arrete du 22 avril 2026 ne s'applique a la 6e
// qu'a la rentree 2027. Prendre le texte le plus recent par defaut serait une erreur.
function programmeFor(grade, schoolYear) {
  const startYear = parseInt(String(schoolYear).slice(0, 4), 10) || 0;
  if (grade === "SIXIEME") {
    return startYear >= 2027
      ? "Programme EPS cycle 3 (2026) - arrete du 22 avril 2026"
      : "Programme EPS cycle 3 en vigueur - arrete du 9 novembre 2015 modifie (le programme 2026 ne s'applique a la 6e qu'a la rentree 2027)";
  }
  if (["CINQUIEME", "QUATRIEME", "TROISIEME"].includes(grade)) {
    return "Programme EPS cycle 4 - arrete du 9 novembre 2015 modifie";
  }
  return "Programme EPS lycee - arrete du 17 janvier 2019";
}

// Contenus detailles disponibles, charges a la demande depuis content/. Miroir du registre
// cote application : tant qu'une APSA n'y figure pas, seule une progression generique existe.
const DETAILED_CYCLES = {
  "SIXIEME|Escalade": { file: "content/escalade-6e.json" },
  "SIXIEME|Natation": { file: "content/natation-6e.json" },
  "SIXIEME|Basket-ball": { file: "content/basket-6e.json" },
  "SIXIEME|Gymnastique au sol": { file: "content/gymnastique-6e.json" },
  "SIXIEME|Athletisme - sprint / relais": { file: "content/athletisme-sprint-relais-6e.json" },
  "SIXIEME|Danse": { file: "content/danse-6e.json" },
  "SIXIEME|Rugby": { file: "content/rugby-6e.json" },
  "SIXIEME|Tennis de table": { file: "content/tennis-de-table-6e.json" },
  "SIXIEME|Badminton": { file: "content/badminton-6e.json" },
  "CINQUIEME|Athletisme - relais / sprint": { file: "content/athletisme-relais-sprint-5e.json" },
  "CINQUIEME|Course de duree": { file: "content/course-de-duree-5e.json" },
  "CINQUIEME|Cirque": { file: "content/cirque-5e.json" },
  "CINQUIEME|Volley-ball": { file: "content/volley-ball-5e.json" },
  "CINQUIEME|Lutte": { file: "content/lutte-5e.json" },
  "CINQUIEME|Rugby": { file: "content/rugby-5e.json" },
  "CINQUIEME|Ultimate": { file: "content/ultimate-5e.json" },
  "QUATRIEME|Escalade": { file: "content/escalade-4e.json" },
  "QUATRIEME|Natation": { file: "content/natation-4e.json" },
  "QUATRIEME|Acrosport": { file: "content/acrosport-4e.json" },
  "QUATRIEME|Volley-ball": { file: "content/volley-ball-4e.json" },
  "QUATRIEME|Danse": { file: "content/danse-4e.json" },
  "QUATRIEME|Ultimate": { file: "content/ultimate-4e.json" },
  "TROISIEME|Aquathlon": { file: "content/aquathlon-3e.json" },
  "TROISIEME|Escalade": { file: "content/escalade-3e.json" },
  "TROISIEME|Rugby": { file: "content/rugby-3e.json" },
  "TROISIEME|Badminton": { file: "content/badminton-3e.json" },
  "TROISIEME|Athletisme - sprint / duree": { file: "content/athletisme-sprint-duree-3e.json" },
  "TROISIEME|Musculation": { file: "content/musculation-3e.json" },
  "SECONDE|Escalade": { file: "content/escalade-2nde.json" },
  "SECONDE|Acrosport": { file: "content/acrosport-2nde.json" },
  "SECONDE|Danse": { file: "content/danse-2nde.json" },
  "SECONDE|Badminton": { file: "content/badminton-2nde.json" },
  "SECONDE|Musculation": { file: "content/musculation-2nde.json" },
  "SECONDE|Course de duree": { file: "content/course-de-duree-2nde.json" },
  "SECONDE|Natation de duree": { file: "content/natation-de-duree-2nde.json" },
  "PREMIERE|3 x 500 m": { file: "content/3x500m-cycle-terminal.json" },
  "PREMIERE|Musculation": { file: "content/musculation-cycle-terminal.json" },
  "PREMIERE|Course de duree": { file: "content/course-de-duree-cycle-terminal.json" },
  "PREMIERE|Acrosport": { file: "content/acrosport-cycle-terminal.json" },
  "PREMIERE|Badminton": { file: "content/badminton-cycle-terminal.json" },
  "PREMIERE|Escalade": { file: "content/escalade-cycle-terminal.json" },
  "PREMIERE|Gymnastique au sol": { file: "content/gymnastique-cycle-terminal.json" },
  "PREMIERE|Natation sauvetage": { file: "content/natation-sauvetage-cycle-terminal.json" },
  "PREMIERE|Tennis de table": { file: "content/tennis-de-table-cycle-terminal.json" },
  "PREMIERE|Volley-ball": { file: "content/volley-ball-cycle-terminal.json" },
  "TERMINALE|3 x 500 m": { file: "content/3x500m-cycle-terminal.json" },
  "TERMINALE|Musculation": { file: "content/musculation-cycle-terminal.json" },
  "TERMINALE|Course de duree": { file: "content/course-de-duree-cycle-terminal.json" },
  "TERMINALE|Acrosport": { file: "content/acrosport-cycle-terminal.json" },
  "TERMINALE|Badminton": { file: "content/badminton-cycle-terminal.json" },
  "TERMINALE|Escalade": { file: "content/escalade-cycle-terminal.json" },
  "TERMINALE|Gymnastique au sol": { file: "content/gymnastique-cycle-terminal.json" },
  "TERMINALE|Natation sauvetage": { file: "content/natation-sauvetage-cycle-terminal.json" },
  "TERMINALE|Tennis de table": { file: "content/tennis-de-table-cycle-terminal.json" },
  "TERMINALE|Volley-ball": { file: "content/volley-ball-cycle-terminal.json" },
  "PREMIERE|Pentabond": { file: "content/pentabond-cycle-terminal.json" },
  "TERMINALE|Pentabond": { file: "content/pentabond-cycle-terminal.json" }
};
const cycleContentCache = {};

async function loadCycleContent(grade, apsa) {
  const entry = DETAILED_CYCLES[`${grade}|${apsa}`];
  if (!entry) return null;
  if (!cycleContentCache[entry.file]) {
    const res = await fetch(entry.file);
    if (!res.ok) return null;
    cycleContentCache[entry.file] = await res.json();
  }
  return cycleContentCache[entry.file];
}

// ---- Adaptation du nombre de seances (miroir de SessionCountAdapter.kt) ----
// Les huit seances redigees sont adaptees au nombre demande en gardant la diagnostique en
// premier, la mi-cycle vers le milieu et la finale toujours en dernier : le cycle reste
// evaluable quel que soit le nombre de seances choisi.

// Meme restriction que CyclePreviewBuilder : validee du college a la seconde, le cycle
// terminal garde la troncature simple en attendant validation.
const ADAPTED_GRADES = ["SIXIEME", "CINQUIEME", "QUATRIEME", "TROISIEME", "SECONDE"];

function orderedSessions(content, grade, count) {
  if (!content || !content.sessions) return [];
  return ADAPTED_GRADES.includes(grade)
    ? adaptSessionCount(content.sessions, count)
    : content.sessions;
}

function adaptSessionCount(sessions, target) {
  if (!sessions || !sessions.length || target <= 0) return [];
  if (target === sessions.length) return sessions.slice();
  return target < sessions.length ? compressSessions(sessions, target) : expandSessions(sessions, target);
}

/**
 * Retire des seances de construction en priorite pres de la mi-cycle : les premieres de
 * chaque moitie sont gardees car les suivantes s'appuient dessus. Sous tres forte
 * contrainte, la mi-cycle est la premiere sacrifiee, la finale jamais.
 */
function compressSessions(sessions, target) {
  const last = sessions.length - 1;

  let diagnosticIdx = sessions.findIndex(s => s.isDiagnostic);
  if (diagnosticIdx < 0) diagnosticIdx = 0;

  let finalIdx = -1;
  for (let i = last; i >= 0; i--) if (sessions[i].isFinalEvaluation) { finalIdx = i; break; }
  if (finalIdx < 0) finalIdx = last;

  let midIdx = sessions.findIndex(s => s.isMidCycleEvaluation);
  if (midIdx < 0 || midIdx === diagnosticIdx || midIdx === finalIdx) midIdx = null;

  const mid = midIdx !== null ? [midIdx] : [];
  const mandatory = [...new Set([diagnosticIdx, finalIdx, ...mid])];

  if (target <= mandatory.length) {
    const priority = [...new Set([finalIdx, diagnosticIdx, ...mid])];
    return priority.slice(0, target).sort((a, b) => a - b).map(i => sessions[i]);
  }

  const range = (from, to) => { const r = []; for (let i = from; i < to; i++) r.push(i); return r; };
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  const groupA = range(diagnosticIdx + 1, midIdx !== null ? midIdx : finalIdx);
  const groupB = midIdx !== null ? range(midIdx + 1, finalIdx) : [];
  const total = groupA.length + groupB.length;
  const remaining = target - mandatory.length;

  let kA = total > 0 ? Math.floor((remaining * groupA.length) / total) : 0;
  kA = clamp(kA, 0, groupA.length);
  let kB = clamp(remaining - kA, 0, groupB.length);

  const leftover = remaining - kA - kB;
  if (leftover > 0) {
    const extraA = Math.min(groupA.length - kA, leftover);
    kA += extraA;
    kB = Math.min(kB + (leftover - extraA), groupB.length);
  }

  const selected = [...new Set([...mandatory, ...groupA.slice(0, kA), ...groupB.slice(0, kB)])]
    .sort((a, b) => a - b);
  return selected.map(i => sessions[i]);
}

/**
 * Insere des seances supplementaires en dupliquant, a tour de role, les seances de
 * construction (jamais la diagnostique, la mi-cycle ni la finale), toujours placees juste
 * avant la finale qui doit rester en derniere position.
 */
function expandSessions(sessions, target) {
  const extra = target - sessions.length;

  let candidates = sessions
    .map((s, i) => i)
    .filter(i => !sessions[i].isDiagnostic && !sessions[i].isFinalEvaluation && !sessions[i].isMidCycleEvaluation);
  if (!candidates.length) candidates = [Math.max(sessions.length - 2, 0)];

  const result = sessions.slice();
  for (let i = 0; i < extra; i++) {
    const source = sessions[candidates[i % candidates.length]];
    const duplicate = Object.assign({}, source, {
      theme: `${source.theme} (reprise)`,
      mainObjective: `Reprise et consolidation : ${source.mainObjective}`
    });
    let finalPos = -1;
    for (let j = result.length - 1; j >= 0; j--) if (result[j].isFinalEvaluation) { finalPos = j; break; }
    if (finalPos < 0) finalPos = result.length;
    result.splice(finalPos, 0, duplicate);
  }
  return result;
}

var coursTabReady = false;
let selectedCoursPeriod = 1;
let loadedCourses = [];

function showCoursTab(name) {
  ["cycles", "cours", "creer"].forEach(t => {
    document.getElementById("coursTab-" + t).style.display = t === name ? "block" : "none";
  });
  document.querySelectorAll("#coursSubtabs .subtabbtn").forEach(b => {
    b.classList.toggle("active", b.dataset.courstab === name);
  });
  if (name === "creer") { refreshCoursClassOptions(); loadCycles(); }
  else if (name === "cours") loadCycles();
  else renderCyclePreview();
}

function apsaOptionsHtml(grade) {
  return (PROGRAMMATION[grade] || []).map(a => `<option value="${a}">${a}</option>`).join("");
}

async function renderCyclePreview() {
  const grade = document.getElementById("cycleGrade").value;
  const apsa = document.getElementById("cycleApsa").value;
  const count = parseInt(document.getElementById("cycleSessions").value, 10);
  const schoolYear = document.getElementById("schoolYear").value || "2026-2027";
  document.getElementById("cycleProgramme").textContent = "Programme applicable : " + programmeFor(grade, schoolYear);
  document.getElementById("sessionSheet").style.display = "none";

  const el = document.getElementById("cyclePreview");
  if (!apsa) { el.innerHTML = '<div class="card muted">Aucune activite programmee pour ce niveau.</div>'; return; }

  const content = await loadCycleContent(grade, apsa);
  const ordered = orderedSessions(content, grade, count);

  let rows = "";
  for (let i = 1; i <= count; i++) {
    const written = ordered[i - 1];
    const title = written?.theme || content?.plannedTitles?.[i - 1] || `Seance ${i}`;
    rows += `<div class="card sessionCard" data-n="${i}" style="margin-top:8px;${written ? "cursor:pointer" : "opacity:.6"}">
      <div class="top">
        <div><strong>S${i}</strong> · ${title}</div>
        ${written ? '<span class="badge off">Voir la seance</span>'
                  : '<span class="badge">Fiche a venir</span>'}
      </div>
    </div>`;
  }

  el.innerHTML = `
    <div class="card">
      <h2 style="margin-bottom:4px">${apsa} — ${GRADE_LABELS[grade] || grade}</h2>
      <div class="muted">${count} seances${content ? " · " + content.champApprentissage : ""}</div>
      ${content ? "" : '<div class="muted" style="margin-top:8px">Contenu detaille pas encore ecrit pour cette activite a ce niveau.</div>'}
    </div>
    ${rows}`;

  el.querySelectorAll(".sessionCard").forEach(card => {
    const n = parseInt(card.dataset.n, 10);
    const written = ordered[n - 1];
    if (written) card.addEventListener("click", () => {
      sessionSheetContext = `${apsa} — ${GRADE_LABELS[grade] || grade}`;
      showSessionSheet(content, written, n);
    });
  });
}

// ---- Fiche de seance (mode preparation) ----
const li = a => `<ul class="tight" style="margin:2px 0 0;padding-left:18px">${a.map(x => `<li>${x}</li>`).join("")}</ul>`;

// Miroir de MaterialNeed.kt : le besoin est exprime par effectif ("1 raquette pour 2
// eleves") plutot qu'en quantite figee, et se calcule donc au moment de l'affichage.
function materialQuantity(m, studentCount) {
  if (m.fixed !== undefined && m.fixed !== null) return m.fixed;
  const min = m.min !== undefined && m.min !== null ? m.min : 1;
  if (m.per === undefined || m.per === null) return min;
  return Math.max(min, Math.ceil(studentCount * m.per));
}

function materialLines(list, studentCount) {
  return (list || []).map(m => {
    const quantity = materialQuantity(m, studentCount);
    return m.note ? `${quantity} ${m.label} (${m.note})` : `${quantity} ${m.label}`;
  });
}
const block = (k, html) => `<div style="margin-top:10px"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em">${k}</div>${html}</div>`;

function situationHtml(s, studentCount) {
  return `
    <div class="card" style="margin-top:12px">
      <div class="top">
        <strong>${s.title}</strong>
        <span class="badge ${s.role === "NOYAU" ? "off" : ""}">${s.role} · ${s.dur} min</span>
      </div>
      <div style="margin-top:6px">${s.objective}</div>
      ${block("But pour l'eleve", `<em>« ${s.studentGoal} »</em>`)}
      ${block("Materiel", li(materialLines(s.material, studentCount)))}
      ${block("Organisation", s.organization)}
      ${block("Consignes", li(s.instructions))}
      ${block("Criteres de reussite", li(s.success))}
      ${block("Criteres de realisation", li(s.execution))}
      ${block("Ce que je regarde", li(s.watch))}
      ${block("Erreurs frequentes", li(s.errors))}
      ${block("Ce que je dis", li(s.feedback.map(f => `<em>« ${f} »</em>`)))}
      ${block("Variables +", li(s.plus))}
      ${block("Variables −", li(s.minus))}
      ${block("Differenciation", li([
        `<strong>Facilitee</strong> — ${s.diff.facilitee}`,
        `<strong>Normale</strong> — ${s.diff.normale}`,
        `<strong>Complexifiee</strong> — ${s.diff.complexifiee}`
      ]))}
      <div style="margin-top:10px;padding:8px 10px;border-left:3px solid var(--danger);background:#FDEEED;border-radius:0 4px 4px 0">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--danger)">Securite</div>
        ${li(s.safety)}
      </div>
    </div>`;
}

// `position` est le rang affiche dans le cycle adapte : apres adaptation du nombre de
// seances, il ne correspond plus forcement au numero d'origine de la seance redigee.
function showSessionSheet(content, s, position) {
  const el = document.getElementById("sessionSheet");
  const studentCount = 28;
  el.innerHTML = `
    <div class="top">
      <h2 style="margin:0">S${position || s.number} — ${s.theme}</h2>
      <div style="display:flex; gap:8px">
        <button id="startLiveBtn" style="margin-top:0">Demarrer le cours</button>
        <button class="secondary" id="closeSheetBtn" style="margin-top:0">Fermer</button>
      </div>
    </div>
    <div style="margin-top:8px">${s.mainObjective}</div>
    ${block("Objectifs secondaires", li(s.secondaryObjectives))}
    ${block("Lien avec la seance precedente", s.linkToPrevious)}
    ${block("A acquerir avant la seance suivante", s.prerequisiteForNext)}

    <h2 style="margin-top:18px">A preparer avant le cours — installation ${s.setup.installationMinutes} min</h2>
    ${block(`Materiel pour ${studentCount} eleves`, li(materialLines(s.setup.material, studentCount)))}
    ${block("Mise en place", li(s.setup.instructions))}
    ${block("Schema", `<pre style="white-space:pre-wrap;font-size:12px;margin:2px 0 0">${s.setup.sketch}</pre>`)}

    <h2 style="margin-top:18px">Echauffement — ${s.warmup.steps.reduce((a, b) => a + b.dur, 0)} min</h2>
    <div class="muted">${s.warmup.rationale}</div>
    ${s.warmup.steps.map(w => block(`${w.dur} min · ${w.title}`, li(w.details))).join("")}

    <h2 style="margin-top:18px">Situations</h2>
    ${s.situations.map(x => situationHtml(x, studentCount)).join("")}

    <h2 style="margin-top:18px">Bilan — ${s.closing.dur} min</h2>
    ${block("Questions", li(s.closing.questions))}
    ${block("A retenir", s.closing.key)}
    ${block("Roles sociaux", li(s.socialRoles))}

    <div style="margin-top:14px;padding:8px 10px;border-left:3px solid var(--danger);background:#FDEEED;border-radius:0 4px 4px 0">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--danger)">A verifier avec le protocole de l'etablissement</div>
      ${li(content.protocoleLocal)}
    </div>

    ${block("Sources pedagogiques", li(content.sources.map(x =>
      `<span class="badge ${x.type === "Officiel" ? "off" : ""}">${x.type}</span> <a href="${x.url}" target="_blank" rel="noopener">${x.title}</a> — ${x.org}, consulte le ${x.consulted}`
    )))}`;
  el.style.display = "block";
  document.getElementById("closeSheetBtn").addEventListener("click", () => { el.style.display = "none"; });
  document.getElementById("startLiveBtn").addEventListener("click", () => startLiveLesson(s, position || s.number, sessionSheetContext));
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- Mode cours en cours (miroir de LiveLessonScreen.kt) ----
// L'app fait defiler les situations une par une, en gros, avec un acces direct aux outils.
// Le site y ajoute l'echauffement et le bilan, qui se deroulent aussi sur le terrain.

let sessionSheetContext = "";   // "6e2 · Escalade", renseigne quand on ouvre depuis un cours
let liveSteps = [];
let liveIndex = 0;

function liveStepsFor(s) {
  const steps = [];

  if (s.warmup && s.warmup.steps && s.warmup.steps.length) {
    const total = s.warmup.steps.reduce((a, b) => a + (b.dur || 0), 0);
    steps.push({
      kind: "Echauffement",
      title: `Echauffement — ${total} min`,
      goal: s.warmup.rationale || "",
      blocks: s.warmup.steps.map(w => ({ label: `${w.dur} min · ${w.title}`, list: w.details })),
      safety: []
    });
  }

  (s.situations || []).forEach(x => {
    steps.push({
      kind: `${x.role} · ${x.dur} min`,
      title: x.title,
      goal: x.studentGoal ? `« ${x.studentGoal} »` : x.objective,
      blocks: [
        { label: "Organisation", text: x.organization },
        { label: "Materiel", list: materialLines(x.material, 28) },
        { label: "Consignes", list: x.instructions },
        { label: "Criteres de reussite", list: x.success },
        { label: "Ce que je regarde", list: x.watch },
        { label: "Ce que je dis", list: (x.feedback || []).map(f => `« ${f} »`) },
        { label: "Differenciation", list: [
          `Facilitee — ${x.diff.facilitee}`,
          `Normale — ${x.diff.normale}`,
          `Complexifiee — ${x.diff.complexifiee}`
        ] }
      ],
      safety: x.safety || []
    });
  });

  if (s.closing) {
    steps.push({
      kind: "Bilan",
      title: `Bilan — ${s.closing.dur} min`,
      goal: s.closing.key || "",
      blocks: [{ label: "Questions", list: s.closing.questions }],
      safety: []
    });
  }

  return steps;
}

function startLiveLesson(s, position, contextLabel) {
  liveSteps = liveStepsFor(s);
  liveIndex = 0;
  document.getElementById("liveWho").textContent = contextLabel || "Preparation";
  document.getElementById("liveTitle").textContent = `S${position} · ${s.theme}`;
  document.getElementById("liveOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
  renderLiveStep();
}

function closeLiveLesson() {
  document.getElementById("liveOverlay").classList.remove("open");
  document.getElementById("liveTools").classList.remove("open");
  document.body.style.overflow = "";
  stopToolTimer();
}

function renderLiveStep() {
  const step = liveSteps[liveIndex];
  const inner = document.getElementById("liveInner");
  if (!step) { inner.innerHTML = '<div class="muted">Aucune etape dans cette seance.</div>'; return; }

  const dots = liveSteps.map((_, i) =>
    `<button class="liveDot ${i === liveIndex ? "now" : i < liveIndex ? "done" : ""}" data-live-dot="${i}" aria-label="Etape ${i + 1}"></button>`
  ).join("");

  const blocks = (step.blocks || []).map(b => {
    const body = b.list && b.list.length ? `<ul>${b.list.map(x => `<li>${x}</li>`).join("")}</ul>`
               : b.text ? `<p>${b.text}</p>` : "";
    return body ? `<div class="liveBlock"><h3>${b.label}</h3>${body}</div>` : "";
  }).join("");

  const safety = step.safety && step.safety.length
    ? `<div class="liveSafety"><h3>Securite</h3><ul>${step.safety.map(x => `<li>${x}</li>`).join("")}</ul></div>`
    : "";

  inner.innerHTML = `
    <div class="liveDots">${dots}</div>
    <div class="liveStepMeta">
      <span class="liveStepNum">${step.kind}</span>
      <span class="muted">Etape ${liveIndex + 1} / ${liveSteps.length}</span>
    </div>
    <h2 class="liveStepTitle">${step.title}</h2>
    ${step.goal ? `<div class="liveGoal">${step.goal}</div>` : ""}
    ${blocks}
    ${safety}`;

  inner.querySelectorAll("[data-live-dot]").forEach(d => d.onclick = () => {
    liveIndex = Number(d.dataset.liveDot);
    renderLiveStep();
  });

  document.getElementById("livePrev").disabled = liveIndex === 0;
  document.getElementById("liveNext").disabled = liveIndex >= liveSteps.length - 1;
  document.querySelector(".liveBody").scrollTop = 0;
}

// ---- Evaluations d'un cours (accordeon ponctuelle/finale + tableau de notes) ----
const EVAL_TYPES = [
  { value: "PONCTUELLE", label: "Evaluation ponctuelle en cours de cycle" },
  { value: "FINALE", label: "Evaluation finale" }
];
let evalCourse = null;       // le cours (cycle) courant
let evalStudents = [];       // eleves de la classe rattachee
let evalList = [];           // evaluations du cycle
let evalExpandedType = null;
let evalOpenedId = null;
/**
 * Type d'evaluation demande a l'ouverture, ou null pour les deux.
 *
 * Cliquer sur "Evaluation ponctuelle" depuis une classe affichait quand meme la finale juste
 * en dessous : on demandait une chose et on en obtenait deux, avec le risque de noter dans la
 * mauvaise. Quand un type est demande, lui seul est montre.
 */
let evalTypeFiltre = null;
let evalCriteria = [];
let evalScores = {};         // "criterionId|studentId" -> {id, points}

/**
 * Le tableau de notes s'ouvre par-dessus la page, sans quitter l'onglet d'ou l'on vient.
 *
 * Il vivait dans le flux de l'onglet COURS : ouvrir une grille depuis une classe obligeait donc
 * a changer d'onglet, puis a retrouver son chemin pour revenir. On note pendant un cours, entre
 * deux passages d'eleves : le trajet doit etre le plus court possible.
 *
 * Le noeud est deplace, pas refait. Il garde ses identifiants et ses ecouteurs en changeant de
 * parent, et le voile est pose sur le corps du document pour rester visible quel que soit
 * l'onglet ouvert.
 */
let fermetureEvaluation = null;
function fenetreEvaluation() {
  let voile = document.getElementById("evaluationOverlay");
  if (voile) return voile;
  const panneau = document.getElementById("evaluationPanel");
  if (!panneau) return null;

  voile = document.createElement("div");
  voile.className = "searchOverlay";
  voile.id = "evaluationOverlay";
  const feuille = document.createElement("div");
  feuille.className = "searchSheet";
  voile.appendChild(feuille);
  document.body.appendChild(voile);
  feuille.appendChild(panneau);
  panneau.style.display = "block";
  panneau.style.margin = "0";

  voile.addEventListener("click", e => { if (e.target === voile) fermerFenetreEvaluation(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && voile.classList.contains("open")) fermerFenetreEvaluation();
  });
  return voile;
}

/**
 * Ferme la fenetre, en enregistrant d'abord la case en cours de saisie.
 *
 * Une note ne part qu'au moment ou l'on quitte sa case. Fermer sans cela perdrait la derniere
 * valeur tapee - celle qu'on vient d'ecrire, donc la plus facile a croire enregistree.
 */
function fermerFenetreEvaluation() {
  if (document.activeElement && document.activeElement.matches?.("#evaluationPanel input")) {
    document.activeElement.blur();
  }
  document.getElementById("evaluationOverlay")?.classList.remove("open");
  const apres = fermetureEvaluation;
  fermetureEvaluation = null;
  if (typeof apres === "function") apres();
}

/**
 * @param {{type?: string, id?: string}} [ouverture] grille a deplier d'emblee. Sans cela, creer
 *   une grille depuis un modele la refermait aussitot : utiliserModele designait la nouvelle,
 *   et ce panneau effacait la demande une ligne plus loin.
 */
async function openEvaluationPanel(cycleRow, ouverture) {
  evalCourse = cycleRow;
  evalTypeFiltre = ouverture?.type ?? null;
  // L'accordeon s'ouvre ferme : quand une grille est demandee, c'est son tableau de notes qu'on
  // vient voir, pas la liste. La liste reste a une clic, pour en choisir une autre.
  evalExpandedType = null;
  evalOpenedId = ouverture?.id ?? null;
  const panel = document.getElementById("evaluationPanel");
  fenetreEvaluation()?.classList.add("open");
  panel.innerHTML = '<div class="muted">Chargement...</div>';
  if (modeHorsConnexion) {
    evalStudents = (await modeHorsConnexion.lire("students", {
      ou: e => e.class_id === cycleRow.class_id,
      trier: (a, b) => String(a.last_name || "").localeCompare(String(b.last_name || ""))
    })).rows;
    evalList = (await modeHorsConnexion.lire("evaluations", {
      ou: e => e.cycle_id === cycleRow.id,
      trier: (a, b) => (a.date_epoch_millis || 0) - (b.date_epoch_millis || 0)
    })).rows;
  } else {
    const [studentsRes, evalsRes] = await Promise.all([
      apiFetch(`${SUPABASE_URL}/rest/v1/students?class_id=eq.${cycleRow.class_id}&deleted=eq.false&select=*&order=last_name.asc`),
      apiFetch(`${SUPABASE_URL}/rest/v1/evaluations?cycle_id=eq.${cycleRow.id}&deleted=eq.false&select=*&order=date_epoch_millis.asc`)
    ]);
    evalStudents = studentsRes.ok ? await studentsRes.json() : [];
    evalList = evalsRes.ok ? await evalsRes.json() : [];
  }
  renderEvaluationPanel();
  // La grille demandee ouvre directement son tableau de notes : c'est pour lui qu'on est venu.
  if (evalOpenedId && evalList.some(e => e.id === evalOpenedId)) await openEvaluationTable(evalOpenedId);
}

function renderEvaluationPanel() {
  const panel = document.getElementById("evaluationPanel");
  const label = `${GRADE_LABELS[evalCourse.grade] || evalCourse.grade}${evalCourse.class_number || ""}`;
  let html = `<div class="card">
    <div class="top">
      <h2 style="margin:0">Evaluations — ${evalCourse.apsa_name} (${label})</h2>
      <div class="no-print" style="display:flex; gap:8px">
        <button id="saveEvalBtn" style="margin-top:0">Enregistrer</button>
        ${evalOpenedId ? `<button class="danger" data-delete-eval="${evalOpenedId}" style="margin-top:0">Supprimer</button>` : ""}
        <button class="secondary" id="closeEvalBtn" style="margin-top:0">Fermer</button>
      </div>
    </div>`;
  EVAL_TYPES.filter(t => !evalTypeFiltre || t.value === evalTypeFiltre).forEach(t => {
    const count = evalList.filter(e => e.type === t.value).length;
    const expanded = evalExpandedType === t.value;
    html += `<div class="card accType ${expanded ? "expanded" : ""}" data-type="${t.value}" style="margin-top:10px">
      <div class="top"><strong>${t.label}</strong><span class="muted">${count ? count + " grille(s)" : "Aucune grille"}</span></div>
    </div>`;
    if (expanded) {
      html += `<div class="accBody">`;
      evalList.filter(e => e.type === t.value).forEach(ev => {
        html += `<div class="card" style="margin:4px 0; ${evalOpenedId === ev.id ? "border-color:var(--primary)" : ""}">
          <div class="top">
            <span data-open-eval="${ev.id}" style="cursor:pointer; font-weight:600">${ev.label}</span>
            <button class="danger" data-delete-eval="${ev.id}" style="margin-top:0">Supprimer</button>
          </div>
        </div>`;
      });
      html += `<div class="row" style="margin-top:8px">
        <input type="text" id="newEvalLabel" placeholder="Intitule (ex : Assurage mi-cycle)">
        <button class="secondary" id="newEvalBtn" data-type="${t.value}" style="margin-top:0">+ Nouvelle grille</button>
      </div></div>`;
    }
  });
  html += `</div><div id="evalTableWrap"></div>`;
  panel.innerHTML = html;

  document.getElementById("closeEvalBtn").addEventListener("click", () => fermerFenetreEvaluation());
  // Les notes s'enregistrent des qu'on quitte leur case : ce bouton ne fait donc que valider la
  // derniere saisie et refermer. Il existe parce que rien ne disait que c'etait deja fait - on
  // cherchait un bouton, et son absence donnait a croire que rien n'etait enregistre.
  document.getElementById("saveEvalBtn").addEventListener("click", () => fermerFenetreEvaluation());
  panel.querySelectorAll(".accType").forEach(el => {
    el.addEventListener("click", () => {
      const type = el.dataset.type;
      evalExpandedType = evalExpandedType === type ? null : type;
      renderEvaluationPanel();
    });
  });
  panel.querySelectorAll("[data-open-eval]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      // La liste se referme : elle a servi a choisir, et le tableau de notes a besoin de la
      // hauteur. Sans cela il fallait faire defiler la fenetre pour atteindre la premiere note.
      const choisie = el.dataset.openEval;
      evalExpandedType = null;
      evalOpenedId = choisie;
      renderEvaluationPanel();
      openEvaluationTable(choisie);
    });
  });
  panel.querySelectorAll("[data-delete-eval]").forEach(el => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (modeHorsConnexion) await modeHorsConnexion.supprimer("evaluations", el.dataset.deleteEval);
      else await apiFetch(`${SUPABASE_URL}/rest/v1/evaluations?id=eq.${el.dataset.deleteEval}`, {
        method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() })
      });
      if (evalOpenedId === el.dataset.deleteEval) { evalOpenedId = null; document.getElementById("evalTableWrap").innerHTML = ""; }
      evalList = evalList.filter(e => e.id !== el.dataset.deleteEval);
      renderEvaluationPanel();
    });
  });
  const newBtn = document.getElementById("newEvalBtn");
  if (newBtn) newBtn.addEventListener("click", () => createEvaluation(newBtn.dataset.type));
  if (evalOpenedId) openEvaluationTable(evalOpenedId);
}

async function createEvaluation(type) {
  const labelInput = document.getElementById("newEvalLabel");
  const label = labelInput.value.trim() || EVAL_TYPES.find(t => t.value === type).label;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const grille = {
    id, user_id: session.user_id, cycle_id: evalCourse.id, type, label,
    date_epoch_millis: Date.now(), updated_at: now, deleted: false
  };
  // Deux criteres par defaut, pour arriver sur un tableau deja utilisable.
  const criteresDefaut = [
    { id: crypto.randomUUID(), user_id: session.user_id, evaluation_id: id, label: "Assurage", max_points: 5, order_index: 0, updated_at: now, deleted: false },
    { id: crypto.randomUUID(), user_id: session.user_id, evaluation_id: id, label: "Technique", max_points: 10, order_index: 1, updated_at: now, deleted: false }
  ];
  if (modeHorsConnexion) {
    await modeHorsConnexion.enregistrer("evaluations", id, grille);
    for (const c of criteresDefaut) await modeHorsConnexion.enregistrer("evaluation_criteria", c.id, c);
    evalList.push(grille);
  } else {
    const res = await apiFetch(`${SUPABASE_URL}/rest/v1/evaluations`, {
      method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(grille)
    });
    if (!res.ok) return;
    const rows = await res.json();
    evalList.push(rows[0]);
    await apiFetch(`${SUPABASE_URL}/rest/v1/evaluation_criteria`, {
      method: "POST", body: JSON.stringify(criteresDefaut)
    });
  }
  evalOpenedId = id;
  renderEvaluationPanel();
}

async function openEvaluationTable(evaluationId) {
  evalOpenedId = evaluationId;
  const wrap = document.getElementById("evalTableWrap");
  wrap.innerHTML = '<div class="muted">Chargement...</div>';
  let allScores;
  if (modeHorsConnexion) {
    evalCriteria = (await modeHorsConnexion.lire("evaluation_criteria", {
      ou: c => c.evaluation_id === evaluationId,
      trier: (a, b) => (a.order_index || 0) - (b.order_index || 0)
    })).rows;
    // Avec les lignes effacees : elles portent l'identifiant a reutiliser quand on resaisit.
    allScores = (await modeHorsConnexion.lire("evaluation_scores", { avecSupprimes: true })).rows;
  } else {
    const [critRes, scoreRes] = await Promise.all([
      apiFetch(`${SUPABASE_URL}/rest/v1/evaluation_criteria?evaluation_id=eq.${evaluationId}&deleted=eq.false&select=*&order=order_index.asc`),
      apiFetch(`${SUPABASE_URL}/rest/v1/evaluation_scores?select=*`)
    ]);
    evalCriteria = critRes.ok ? await critRes.json() : [];
    allScores = scoreRes.ok ? await scoreRes.json() : [];
  }
  const critIds = new Set(evalCriteria.map(c => c.id));
  // On garde aussi les lignes effacees (deleted=true) : elles servent a retrouver l'id/la ligne
  // existante quand on resaisit une note, plutot que d'en creer une nouvelle a chaque fois.
  evalScores = {};
  allScores.filter(s => critIds.has(s.criterion_id)).forEach(s => {
    evalScores[`${s.criterion_id}|${s.student_id}`] = s;
  });
  renderEvaluationTable();
}

/** Une ligne effacee (deleted=true) compte comme "pas de note", meme si la ligne existe encore. */
function scoreValue(row) { return row && !row.deleted ? row.points : null; }

function evalTotalMax() { return evalCriteria.reduce((a, c) => a + c.max_points, 0); }
function evalTotalFor(studentId) {
  return evalCriteria.reduce((a, c) => a + (scoreValue(evalScores[`${c.id}|${studentId}`]) ?? 0), 0);
}
function evalIsComplete(studentId) {
  return evalCriteria.length > 0 && evalCriteria.every(c => scoreValue(evalScores[`${c.id}|${studentId}`]) != null);
}

function renderEvaluationTable() {
  const wrap = document.getElementById("evalTableWrap");
  const evaluation = evalList.find(e => e.id === evalOpenedId);
  let html = `<div class="card">
    <div class="top">
      <h2 style="margin:0">${evaluation.label}</h2>
      <div class="no-print">
        <button class="secondary" id="addCritBtn" style="margin-top:0">+ Critere</button>
        <button class="secondary" id="exportCsvBtn" style="margin-top:0">Exporter Excel</button>
        <button class="secondary" id="printPdfBtn" style="margin-top:0">Imprimer / PDF</button>
      </div>
    </div>
    <div class="muted" style="margin-top:4px">Le total additionne toutes les colonnes. Une case vide = pas encore evalue.</div>
    <div style="overflow-x:auto"><table class="scoreTable"><thead><tr><th>Eleve</th>`;
  evalCriteria.forEach(c => { html += `<th>${c.label}<br><span class="muted">/${c.max_points}</span> <span class="no-print" data-edit-crit="${c.id}" style="cursor:pointer">✎</span></th>`; });
  html += `<th>Total<br><span class="muted">/${evalTotalMax()}</span></th></tr></thead><tbody>`;
  evalStudents.forEach(s => {
    html += `<tr><td>${s.last_name.toUpperCase()} ${s.first_name}</td>`;
    evalCriteria.forEach(c => {
      const current = scoreValue(evalScores[`${c.id}|${s.id}`]);
      html += `<td><input class="scoreInput" type="text" inputmode="decimal" data-crit="${c.id}" data-student="${s.id}" data-max="${c.max_points}" value="${current ?? ""}"></td>`;
    });
    const complete = evalIsComplete(s.id);
    html += `<td class="${complete ? "" : "incomplete"}">${formatScoreWeb(evalTotalFor(s.id))}${complete ? "" : " *"}</td></tr>`;
  });
  html += `</tbody></table></div></div>`;
  wrap.innerHTML = html;

  wrap.querySelectorAll(".scoreInput").forEach(input => {
    input.addEventListener("change", () => setScore(input));
  });
  wrap.querySelectorAll("[data-edit-crit]").forEach(el => {
    el.addEventListener("click", () => editCriterion(el.dataset.editCrit));
  });
  document.getElementById("addCritBtn").addEventListener("click", addCriterion);
  document.getElementById("exportCsvBtn").addEventListener("click", exportEvaluationCsv);
  document.getElementById("printPdfBtn").addEventListener("click", () => window.print());
}

function formatScoreWeb(value) {
  return (value % 1 === 0) ? String(value) : String(value).replace(".", ",");
}

// Efface = soft-delete (deleted=true), jamais une suppression SQL : sinon la synchro avec
// l'application ne peut pas distinguer "jamais notee" de "notee puis effacee" et ne
// propage pas l'effacement. Reutilise aussi la ligne existante (meme id) quand elle existe,
// pour que resaisir une note ne cree pas une nouvelle ligne a chaque fois.
async function setScore(input) {
  const raw = input.value.trim().replace(",", ".");
  const criterionId = input.dataset.crit, studentId = input.dataset.student, max = parseFloat(input.dataset.max);
  const key = `${criterionId}|${studentId}`;
  const existing = evalScores[key];
  const now = new Date().toISOString();
  if (raw === "") {
    if (existing) {
      const efface = { ...existing, points: null, deleted: true, updated_at: now };
      if (modeHorsConnexion) await modeHorsConnexion.enregistrer("evaluation_scores", existing.id, efface);
      else await apiFetch(`${SUPABASE_URL}/rest/v1/evaluation_scores?id=eq.${existing.id}`, {
        method: "PATCH", body: JSON.stringify({ points: null, deleted: true, updated_at: now })
      });
      existing.points = null; existing.deleted = true;
    }
  } else {
    const value = parseFloat(raw);
    if (isNaN(value) || value > max) { input.value = scoreValue(existing) ?? ""; return; }
    if (existing) {
      const notee = { ...existing, points: value, deleted: false, updated_at: now };
      if (modeHorsConnexion) await modeHorsConnexion.enregistrer("evaluation_scores", existing.id, notee);
      else await apiFetch(`${SUPABASE_URL}/rest/v1/evaluation_scores?id=eq.${existing.id}`, {
        method: "PATCH", body: JSON.stringify({ points: value, deleted: false, updated_at: now })
      });
      existing.points = value; existing.deleted = false;
    } else {
      const id = crypto.randomUUID();
      const ligne = { id, user_id: session.user_id, criterion_id: criterionId, student_id: studentId, points: value, deleted: false, updated_at: now };
      if (modeHorsConnexion) await modeHorsConnexion.enregistrer("evaluation_scores", id, ligne);
      else await apiFetch(`${SUPABASE_URL}/rest/v1/evaluation_scores`, {
        method: "POST", body: JSON.stringify(ligne)
      });
      evalScores[key] = { id, points: value, deleted: false };
    }
  }
  renderEvaluationTable();
}

async function addCriterion() {
  const label = prompt("Nom du critere :");
  if (!label) return;
  const maxStr = prompt("Note sur combien ?", "10");
  const max = parseInt(maxStr, 10);
  if (!max || max <= 0) return;
  const id = crypto.randomUUID();
  const critere = {
    id, user_id: session.user_id, evaluation_id: evalOpenedId, label, max_points: max,
    order_index: evalCriteria.length, updated_at: new Date().toISOString(), deleted: false
  };
  if (modeHorsConnexion) await modeHorsConnexion.enregistrer("evaluation_criteria", id, critere);
  else await apiFetch(`${SUPABASE_URL}/rest/v1/evaluation_criteria`, {
    method: "POST", body: JSON.stringify(critere)
  });
  openEvaluationTable(evalOpenedId);
}

async function editCriterion(criterionId) {
  const criterion = evalCriteria.find(c => c.id === criterionId);
  const label = prompt("Nom du critere :", criterion.label);
  if (label === null) return;
  if (label.trim() === "") {
    if (confirm("Supprimer ce critere et toutes ses notes ?")) {
      if (modeHorsConnexion) await modeHorsConnexion.supprimer("evaluation_criteria", criterionId);
      else await apiFetch(`${SUPABASE_URL}/rest/v1/evaluation_criteria?id=eq.${criterionId}`, {
        method: "PATCH", body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() })
      });
      openEvaluationTable(evalOpenedId);
    }
    return;
  }
  const maxStr = prompt("Note sur combien ?", criterion.max_points);
  const max = parseInt(maxStr, 10);
  if (!max || max <= 0) return;
  if (modeHorsConnexion) {
    await modeHorsConnexion.enregistrer("evaluation_criteria", criterionId,
      { ...criterion, label, max_points: max, updated_at: new Date().toISOString() });
  } else {
    await apiFetch(`${SUPABASE_URL}/rest/v1/evaluation_criteria?id=eq.${criterionId}`, {
      method: "PATCH", body: JSON.stringify({ label, max_points: max, updated_at: new Date().toISOString() })
    });
  }
  openEvaluationTable(evalOpenedId);
}

function exportEvaluationCsv() {
  const evaluation = evalList.find(e => e.id === evalOpenedId);
  const label = `${GRADE_LABELS[evalCourse.grade] || evalCourse.grade}${evalCourse.class_number || ""}`;
  const lines = [];
  lines.push(`${evaluation.label};${label};${evalCourse.apsa_name}`);
  lines.push("");
  const headers = ["Nom", "Prenom", ...evalCriteria.map(c => `${c.label} /${c.max_points}`), `Total /${evalTotalMax()}`];
  lines.push(headers.join(";"));
  evalStudents.forEach(s => {
    const cells = [s.last_name, s.first_name,
      ...evalCriteria.map(c => {
        const points = scoreValue(evalScores[`${c.id}|${s.id}`]);
        return points == null ? "" : formatScoreWeb(points);
      }),
      formatScoreWeb(evalTotalFor(s.id))];
    lines.push(cells.join(";"));
  });
  const csv = lines.join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${evaluation.label}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- Cablage du mode cours en cours ----
// La boite a outils du mode cours reprend les memes cartes que l'onglet Outils : le
// professeur ouvre un chrono sans quitter la seance en cours.
(function bindLiveLesson() {
  const overlay = document.getElementById("liveOverlay");
  const tools = document.getElementById("liveTools");
  const grid = document.getElementById("liveToolGrid");
  const panel = document.getElementById("liveToolPanel");

  grid.innerHTML = document.querySelector("#tab-outils .toolGrid").innerHTML;
  grid.querySelectorAll("[data-tool]").forEach(b =>
    b.addEventListener("click", () => openTool(b.dataset.tool, panel))
  );

  document.getElementById("livePrev").onclick = () => { if (liveIndex > 0) { liveIndex--; renderLiveStep(); } };
  document.getElementById("liveNext").onclick = () => { if (liveIndex < liveSteps.length - 1) { liveIndex++; renderLiveStep(); } };
  document.getElementById("liveCloseBtn").onclick = closeLiveLesson;

  document.getElementById("liveToolsBtn").onclick = () => tools.classList.add("open");
  document.getElementById("liveToolsClose").onclick = () => { stopToolTimer(); tools.classList.remove("open"); };
  tools.addEventListener("click", e => { if (e.target === tools) { stopToolTimer(); tools.classList.remove("open"); } });

  document.addEventListener("keydown", e => {
    if (!overlay.classList.contains("open")) return;
    if (e.key === "Escape") closeLiveLesson();
    if (e.key === "ArrowRight" && liveIndex < liveSteps.length - 1) { liveIndex++; renderLiveStep(); }
    if (e.key === "ArrowLeft" && liveIndex > 0) { liveIndex--; renderLiveStep(); }
  });
})();

function toolHeader(title, subtitle) {
  return `<div class="top"><div><h2 style="margin-bottom:3px">${title}</h2><div class="muted">${subtitle}</div></div><button class="secondary" id="closeToolBtn" style="margin-top:0">Fermer</button></div>`;
}
function bindToolClose() { document.getElementById("closeToolBtn").onclick = () => { stopToolTimer(); toolPanel.style.display = "none"; }; }

function renderTimersHub() {
  toolPanel.innerHTML = toolHeader("Chronomètre", "Choisissez le mode") + `<div class="toolActions"><button data-timer-mode="chrono">Chronomètre</button><button data-timer-mode="countdown">Compte à rebours</button><button data-timer-mode="interval">Timer intervalles</button></div><div id="timerBody"></div>`;
  bindToolClose();
  toolPanel.querySelectorAll("[data-timer-mode]").forEach(b => b.onclick = () => b.dataset.timerMode === "chrono" ? renderChrono() : b.dataset.timerMode === "countdown" ? renderCountdown() : renderIntervalTimer());
  renderChrono();
}
function renderChrono() {
  stopToolTimer(); toolElapsed = 0;
  const body = document.getElementById("timerBody");
  body.innerHTML = `<div class="toolDisplay" id="chronoDisplay" style="margin-top:14px">00:00.00</div><div class="toolActions"><button id="chronoStart">DÉPART</button><button class="secondary" id="chronoReset">REMISE À ZÉRO</button></div><div class="row"><input id="lapName" placeholder="Nom facultatif"><button id="lapBtn" style="margin-top:0">Enregistrer</button></div><div id="laps"></div>`;
  document.getElementById("chronoStart").onclick = () => {
    if (toolRunning) { toolElapsed += Date.now() - toolStartedAt; stopToolTimer(); document.getElementById("chronoStart").textContent="DÉPART"; }
    else { toolStartedAt=Date.now(); toolRunning=true; document.getElementById("chronoStart").textContent="PAUSE"; toolTimerId=setInterval(()=>document.getElementById("chronoDisplay").textContent=formatToolTime(toolElapsed+Date.now()-toolStartedAt),30); }
  };
  document.getElementById("chronoReset").onclick=()=>{ stopToolTimer(); toolElapsed=0; document.getElementById("chronoDisplay").textContent="00:00.00"; document.getElementById("laps").innerHTML=""; document.getElementById("chronoStart").textContent="DÉPART"; };
  let lapCount=1;
  document.getElementById("lapBtn").onclick=()=>{ const elapsed=toolElapsed+(toolRunning?Date.now()-toolStartedAt:0), label=document.getElementById("lapName").value.trim()||`Élève ${lapCount++}`; document.getElementById("laps").insertAdjacentHTML("afterbegin",`<div class="teamResult top"><span>${label}</span><strong>${formatToolTime(elapsed)}</strong></div>`); document.getElementById("lapName").value=""; };
}
function renderCountdown() {
  stopToolTimer();
  const body=document.getElementById("timerBody");
  body.innerHTML=`<div class="row" style="margin-top:14px"><input id="countSeconds" type="number" min="1" value="60" aria-label="Durée en secondes"><button id="countApply" style="margin-top:0">Appliquer</button></div><div class="toolDisplay" id="countDisplay">01:00</div><div class="toolActions"><button id="countStart">DÉPART</button><button class="secondary" id="countReset">RÉINITIALISER</button></div>`;
  let total=60, remaining=60;
  const draw=()=>document.getElementById("countDisplay").textContent=`${String(Math.floor(remaining/60)).padStart(2,"0")}:${String(remaining%60).padStart(2,"0")}`;
  document.getElementById("countApply").onclick=()=>{ total=Math.max(1,parseInt(document.getElementById("countSeconds").value)||60); remaining=total; draw(); };
  document.getElementById("countStart").onclick=()=>{ if(toolRunning){stopToolTimer();document.getElementById("countStart").textContent="DÉPART";return;} toolRunning=true;document.getElementById("countStart").textContent="PAUSE";toolTimerId=setInterval(()=>{if(--remaining<=0){remaining=0;draw();stopToolTimer();beep(800);document.getElementById("countStart").textContent="DÉPART";}else draw();},1000); };
  document.getElementById("countReset").onclick=()=>{stopToolTimer();remaining=total;draw();document.getElementById("countStart").textContent="DÉPART";};
}
function renderIntervalTimer() {
  stopToolTimer(); const body=document.getElementById("timerBody");
  body.innerHTML=`<div class="row" style="margin-top:14px"><div><label>Effort (s)</label><input id="iw" type="number" value="30"></div><div><label>Récupération (s)</label><input id="ir" type="number" value="30"></div><div><label>Répétitions</label><input id="in" type="number" value="8"></div></div><div class="toolDisplay" id="intervalDisplay">PRÊT</div><div class="toolActions"><button id="intervalStart">DÉPART</button><button class="secondary" id="intervalReset">RÉINITIALISER</button></div>`;
  let phase="EFFORT", rep=1, remaining=30;
  const reset=()=>{stopToolTimer();phase="EFFORT";rep=1;remaining=Math.max(1,+document.getElementById("iw").value||30);document.getElementById("intervalDisplay").innerHTML=`PRÊT<br><small>${remaining} s</small>`;document.getElementById("intervalStart").textContent="DÉPART";}; reset();
  document.getElementById("intervalStart").onclick=()=>{if(toolRunning){stopToolTimer();document.getElementById("intervalStart").textContent="DÉPART";return;}toolRunning=true;document.getElementById("intervalStart").textContent="PAUSE";toolTimerId=setInterval(()=>{remaining--;if(remaining<=0){beep(350);if(phase==="EFFORT"){phase="RÉCUPÉRATION";remaining=Math.max(1,+document.getElementById("ir").value||30);}else{rep++;if(rep>(+document.getElementById("in").value||8)){stopToolTimer();document.getElementById("intervalDisplay").textContent="TERMINÉ";return;}phase="EFFORT";remaining=Math.max(1,+document.getElementById("iw").value||30);}}document.getElementById("intervalDisplay").innerHTML=`${phase}<br><small>${remaining} s · ${rep}/${document.getElementById("in").value}</small>`;},1000);};
  document.getElementById("intervalReset").onclick=reset;
}
function renderScoreboard() {
  let a=0,b=0; toolPanel.innerHTML=toolHeader("Tableau de score","Points et équipes")+`<div class="row"><div class="teamResult" style="text-align:center"><input id="teamA" value="Équipe A"><div class="toolDisplay" id="scoreA">0</div><button data-score="a" data-delta="-1">−1</button><button data-score="a" data-delta="1">+1</button></div><div class="teamResult" style="text-align:center;background:#FFF0DD"><input id="teamB" value="Équipe B"><div class="toolDisplay" id="scoreB">0</div><button data-score="b" data-delta="-1">−1</button><button data-score="b" data-delta="1">+1</button></div></div><button class="secondary" id="scoreReset">Remise à zéro</button>`; bindToolClose(); const draw=()=>{document.getElementById("scoreA").textContent=a;document.getElementById("scoreB").textContent=b;}; toolPanel.querySelectorAll("[data-score]").forEach(x=>x.onclick=()=>{if(x.dataset.score==="a")a=Math.max(0,a+(+x.dataset.delta));else b=Math.max(0,b+(+x.dataset.delta));draw();});document.getElementById("scoreReset").onclick=()=>{a=b=0;draw();};
}
function renderMeasures() {
  toolPanel.innerHTML=toolHeader("Mesures","Distance, vitesse et allure")+`<div class="row"><div><label>Distance (m)</label><input id="measureDistance" type="number"></div><div><label>Temps (minutes)</label><input id="measureMinutes" type="number" step="0.01"></div></div><div class="toolDisplay" id="measureResult">-- km/h<br><small>-- min/km</small></div>`;bindToolClose();const calc=()=>{const d=+document.getElementById("measureDistance").value,m=+document.getElementById("measureMinutes").value;document.getElementById("measureResult").innerHTML=d>0&&m>0?`${(d/1000/(m/60)).toFixed(2)} km/h<br><small>${(m/(d/1000)).toFixed(2)} min/km</small>`:"-- km/h<br><small>-- min/km</small>";};document.getElementById("measureDistance").oninput=calc;document.getElementById("measureMinutes").oninput=calc;
}
function beep(duration=250) { const ctx=new (window.AudioContext||window.webkitAudioContext)(),o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=880;g.gain.value=.12;o.start();setTimeout(()=>{o.stop();ctx.close();},duration); }
function renderSignals(){toolPanel.innerHTML=toolHeader("Signaux sonores","Départs et rotations d'ateliers")+`<div class="toolActions"><button data-beep="180">Signal court</button><button data-beep="450">Changement d'atelier</button><button data-beep="800">Fin de séance</button></div>`;bindToolClose();toolPanel.querySelectorAll("[data-beep]").forEach(b=>b.onclick=()=>beep(+b.dataset.beep));}
