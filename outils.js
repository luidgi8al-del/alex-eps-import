/*
 * Onglet OUTILS : outils de terrain, tests EPS, VMA, savoir-nager, chronos.
 *
 * Sorti d'index.html. Script classique, comme les dix autres fichiers du site :
 * les fonctions restent accessibles depuis les autres fichiers sans rien exporter,
 * et ce fichier est charge avant le script principal qui s'en sert.
 */

// ---- Outils terrain : equivalents web des outils de l'application ----
let toolTimerId = null;
let toolElapsed = 0;
let toolStartedAt = 0;
let toolRunning = false;
// Panneau actif : la meme boite a outils sert dans l'onglet Outils et dans le mode cours
// en cours, ou elle s'ouvre par-dessus la seance sans quitter l'ecran.
let toolPanel = document.getElementById("toolPanel");

function stopToolTimer() {
  if (toolTimerId) clearInterval(toolTimerId);
  toolTimerId = null; toolRunning = false;
}
function formatToolTime(ms) {
  const cs = Math.floor(ms / 10), min = Math.floor(cs / 6000), sec = Math.floor(cs / 100) % 60;
  return `${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}.${String(cs % 100).padStart(2,"0")}`;
}
function openTool(name, target) {
  stopToolTimer();
  toolPanel = target || document.getElementById("toolPanel");
  document.getElementById("toolsWorkspace")?.setAttribute("hidden", "");
  toolPanel.style.display = "block";
  toolPanel.classList.add("modern-tool-panel");
  if (name === "timers") renderTimersHub();
  if (name === "score") renderScoreboard();
  if (name === "measures") renderMeasures();
  if (name === "signals") renderSignals();
  if (name === "tests") renderEpsTests();
  if (name === "teams") renderTeamsTool();
  if (name === "speed") renderSpeedTracker();
  if (name === "impacts") renderImpactMarker();
  if (name === "vma") renderVmaTest();
  if (name === "swim") renderSwimCertificate();
  if (name === "aptitudes") renderAptitudes();
  if (name === "multi-chrono") renderMultiChronoWeb();
  if (name === "tournament") renderTournamentWeb();
  if (name === "observer") renderObserverWeb();
  if (name === "rotations") renderRotationsWeb();
  if (name === "random") renderRandomWeb();
  if (name === "effort") renderEffortWeb();
  if (name === "acrosport") renderAcrosportWeb();
  if (name === "condition-fitness") renderConditionFitnessWeb();
  if (name === "swim-observation") renderSwimObservationWeb();
  toolPanel.scrollIntoView({behavior:"smooth", block:"start"});
}
document.querySelectorAll("#tab-outils [data-tool]").forEach(button => button.addEventListener("click", () => openTool(button.dataset.tool)));

// ---- Selection classe / eleves partagee par les outils (miroir de ToolRoster) ----
// Chaque outil marche soit sur une classe reelle, soit en "usage libre" quand on veut
// juste le calculateur sans rattacher les resultats a des eleves.
const FREE_USE = "__libre__";
let toolClasses = [];
let toolStudents = [];
let toolClassId = FREE_USE;

// Les outils servent sur la piste, pas au bureau : classes et eleves viennent de la copie locale.
async function loadToolClasses() {
  if (toolClasses.length) return toolClasses;
  toolClasses = await lireTable("classes",
    "classes?deleted=eq.false&select=id,name,grade&order=name.asc",
    { trier: (a, b) => String(a.name || "").localeCompare(String(b.name || "")) });
  return toolClasses;
}

async function loadToolStudents(classId) {
  if (!classId || classId === FREE_USE) { toolStudents = []; return toolStudents; }
  toolStudents = await lireTable("students",
    `students?class_id=eq.${classId}&deleted=eq.false&select=id,first_name,last_name,sex&order=last_name.asc`,
    { ou: e => e.class_id === classId,
      trier: (a, b) => String(a.last_name || "").localeCompare(String(b.last_name || "")) });
  return toolStudents;
}

/**
 * Enregistre une seance de test et ses resultats.
 *
 * Un test se saisit sur la piste, souvent sans reseau. Chaque ligne part par la file d'attente :
 * elle est retenue ici et envoyee des que la connexion revient, plutot que perdue.
 *
 * La seance est ecrite avant ses resultats. L'ordre compte : un resultat qui arriverait seul
 * designerait une seance inexistante.
 */
async function enregistrerSeanceDeTest(seance, resultats) {
  await enregistrerLigne("eps_test_sessions", seance);
  for (const ligne of resultats) await enregistrerLigne("eps_test_results", ligne);
}

/** Redessine les tests quand une synchronisation ramene ceux d'un autre appareil. */
function rafraichirOutilsApresSynchro() {
  if (typeof drawEpsTests === "function" && document.getElementById("epsTestsPanel")) drawEpsTests();
}

function toolRosterHtml() {
  return `<div class="card" style="background:#F7FAFC">
    <label for="toolClass">Classe</label>
    <select id="toolClass">
      <option value="${FREE_USE}"${toolClassId === FREE_USE ? " selected" : ""}>Usage libre (sans classe)</option>
      ${toolClasses.map(c => `<option value="${c.id}"${c.id === toolClassId ? " selected" : ""}>${c.name}</option>`).join("")}
    </select>
    <div class="muted" style="margin-top:6px" id="toolRosterInfo"></div>
  </div>`;
}

/** Branche le selecteur : `onChange` est rappele une fois les eleves charges. */
function bindToolRoster(onChange) {
  const select = document.getElementById("toolClass");
  if (!select) return;
  select.onchange = async () => {
    toolClassId = select.value;
    await loadToolStudents(toolClassId);
    onChange();
  };
  const info = document.getElementById("toolRosterInfo");
  if (info) {
    info.textContent = toolClassId === FREE_USE
      ? "Aucun eleve : les resultats ne sont pas enregistres."
      : `${toolStudents.length} eleve(s) · les resultats peuvent etre enregistres.`;
  }
}

const toolNumber = raw => {
  const n = parseFloat(String(raw).replace(",", "."));
  return isNaN(n) ? null : n;
};
const studentLabel = s => `${(s.last_name || "").toUpperCase()} ${s.first_name || ""}`.trim();
const onRealClass = () => toolClassId && toolClassId !== FREE_USE;

// ---- Tests EPS (miroir de EpsTestsScreen / TestAccordion) ----
// Deux familles de tests en accordeon. Sur une classe, chaque eleve a son champ et le
// resultat part dans le recapitulatif ; en usage libre, c'est un simple calculateur.

let epsTestPeriod = 1;
let epsOpenCategory = null;
let epsOpenTest = null;
let epsGenericSessionId = null;
let epsGenericSessionRecord = null;
let epsGenericResultRecords = {};
let epsGenericValues = {};
let epsGenericGroupCount = 1;
let epsGenericActiveGroup = 0;
let epsGenericSessions = [];
let epsGenericGroupAssignments = {};
function resetGenericTestState(){epsGenericSessionId=null;epsGenericSessionRecord=null;epsGenericResultRecords={};epsGenericValues={};epsGenericGroupAssignments={};epsGenericGroupCount=1;epsGenericActiveGroup=0;epsGenericSessions=[]}

async function renderEpsTests() {
  await loadToolClasses();
  await loadToolStudents(toolClassId);
  drawEpsTests();
}

function drawEpsTests() {
  const cls = toolClasses.find(c => c.id === toolClassId);
  const periodCount = cls ? planningPeriodCount(cls.grade) : 5;
  if (epsTestPeriod > periodCount) epsTestPeriod = periodCount;
  const periods = [];
  for (let p = 1; p <= periodCount; p++) periods.push(`<button class="periodChip${p === epsTestPeriod ? " active" : ""}" data-eps-period="${p}">P${p}</button>`);

  if (epsOpenTest) {
    const test = EpsTests.TESTS[epsOpenTest];
    const category = EpsTests.CATEGORIES.find(cat => cat.tests.includes(epsOpenTest));
    toolPanel.innerHTML = toolHeader(test.label, `${category?.name || "Tests EPS"}${cls ? ` · ${cls.name} · P${epsTestPeriod}` : " · utilisation libre"}`)
      + `<main class="eps-test-fullscreen">
          <section class="eps-test-context">${toolRosterHtml()}
            ${onRealClass() ? `<label>Période du test</label><div class="periodBar" style="display:flex">${periods.join("")}</div>` : ""}
          </section>
          <div class="ok" id="epsSaveMsg"></div><div id="epsTestBody"></div>
        </main>`;
    bindToolClose();
    bindToolRoster(() => {
      resetGenericTestState();
      resetRunningSession();
      drawEpsTests();
    });
    toolPanel.querySelectorAll("[data-eps-period]").forEach(b => b.onclick = () => {
      epsTestPeriod = Number(b.dataset.epsPeriod);
      resetGenericTestState();
      resetRunningSession();
      drawEpsTests();
    });
    const back = document.getElementById("closeToolBtn");
    if (back) back.onclick = () => { epsOpenTest = null; resetGenericTestState(); drawEpsTests(); };
    drawEpsTestBody(epsOpenTest);
    return;
  }

  const categories = EpsTests.CATEGORIES.map(cat => {
    const tests = cat.tests.map(key => {
      const test = EpsTests.TESTS[key];
      const favorite = typeof isToolFavorite === "function" && isToolFavorite(`eps-test:${key}`);
      return `<article class="eps-modern-test-card" data-eps-test="${key}">
        <div class="eps-modern-test-icon">${epsTestCardIcon(key)}</div>
        <div class="eps-modern-test-copy"><strong>${test.label}</strong><small>${test.protocol || cat.subtitle}</small></div>
        <button class="eps-test-favorite ${favorite ? "active" : ""}" data-eps-favorite="${key}" aria-label="${favorite ? "Retirer des favoris" : "Ajouter aux favoris"}">${favorite ? "★" : "☆"}</button>
        <span class="eps-modern-test-open">›</span>
      </article>`;
    }).join("");
    return `<section class="eps-modern-category" style="--eps-category-color:${cat.color}">
      <header><div><strong>${cat.name}</strong><small>${cat.subtitle}</small></div><span>${cat.tests.length} test${cat.tests.length > 1 ? "s" : ""}</span></header>
      <div class="eps-modern-test-grid">${tests}</div>
    </section>`;
  }).join("");

  toolPanel.innerHTML = toolHeader("Tests EPS", "Calculs, groupes et protocoles terrain")
    + `<main class="eps-tests-setup">${toolRosterHtml()}
      ${onRealClass() ? `<label>Période du test</label><div class="periodBar" style="display:flex">${periods.join("")}</div>` : ""}
      <div class="eps-modern-categories">${categories}</div>
      <div class="muted eps-tests-note">Les résultats sont des repères pédagogiques et restent modifiables après enregistrement.</div>
    </main>`;

  bindToolClose();
  bindToolRoster(drawEpsTests);
  toolPanel.querySelectorAll("[data-eps-period]").forEach(b => b.onclick = () => { epsTestPeriod = Number(b.dataset.epsPeriod); drawEpsTests(); });
  toolPanel.querySelectorAll("[data-eps-test]").forEach(b => b.onclick = e => { if (e.target.closest("[data-eps-favorite]")) return; resetGenericTestState(); epsOpenTest = b.dataset.epsTest; drawEpsTests(); toolPanel.scrollIntoView({block:"start"}); });
  toolPanel.querySelectorAll("[data-eps-favorite]").forEach(b => b.onclick = e => { e.stopPropagation(); if (typeof toggleToolFavorite === "function") toggleToolFavorite(`eps-test:${b.dataset.epsFavorite}`); drawEpsTests(); });
}

function epsTestCardIcon(key) {
  if (key.includes("500") || key.includes("sprint") || key.includes("vma") || key.includes("course")) return "🏃";
  if (key.includes("saut") || key.includes("pentabond")) return "↗";
  if (key.includes("lancer")) return "🥏";
  if (key.includes("nat") || key.includes("nage")) return "🏊";
  if (key.includes("force") || key.includes("traction") || key.includes("pompe")) return "💪";
  return "📋";
}

async function drawEpsTestBody(key) {
  const host = document.getElementById("epsTestBody");
  if (!host) return;
  const test = EpsTests.TESTS[key];
  if (test.special === "stops") { drawStopCourseTest(test); return; }
  if (test.special === "running-series") { drawRunningSeriesTest(test); return; }

  if (!onRealClass()) {
    // Usage libre : soit deux temps a comparer (haies, relais), soit une seule valeur.
    if (test.dual) {
      host.innerHTML = `<div class="muted">${test.protocol}</div>
        <label>${test.dual.firstLabel}</label><input type="text" inputmode="decimal" id="epsDualA">
        <label>${test.dual.secondLabel}</label><input type="text" inputmode="decimal" id="epsDualB">
        <div class="ok" id="epsDualOut"></div>`;
      const recompute = () => {
        const a = toolNumber(document.getElementById("epsDualA").value);
        const b = toolNumber(document.getElementById("epsDualB").value);
        document.getElementById("epsDualOut").textContent =
          (a != null && b != null && a > 0 && b > 0) ? test.dual.result(a, b) : "";
      };
      host.querySelectorAll("input").forEach(i => i.oninput = recompute);
      return;
    }
    host.innerHTML = `<div class="muted">${test.protocol}</div>
      <label>${test.fieldLabel}</label><input type="text" inputmode="decimal" id="epsFree">
      <div class="ok" id="epsFreeOut"></div>`;
    document.getElementById("epsFree").oninput = e => {
      const v = toolNumber(e.target.value);
      document.getElementById("epsFreeOut").textContent = v == null ? "" : (test.freeText(v) || "");
    };
    return;
  }

  epsGenericSessions = await lireTable("eps_test_sessions",
    `eps_test_sessions?class_id=eq.${toolClassId}&period_number=eq.${epsTestPeriod}&test_name=eq.${encodeURIComponent(test.label)}&deleted=eq.false&select=*&order=created_at.desc`,
    {ou:r=>String(r.class_id)===String(toolClassId)&&+r.period_number===+epsTestPeriod&&r.test_name===test.label&&!r.deleted,trier:(a,b)=>(b.created_at||0)-(a.created_at||0)});
  const groupOf=s=>epsGenericGroupCount>1?(epsGenericGroupAssignments[s.id]||((toolStudents.findIndex(x=>String(x.id)===String(s.id))%epsGenericGroupCount)+1)):1;
  const displayed=epsGenericActiveGroup>0?toolStudents.filter(s=>groupOf(s)===epsGenericActiveGroup):toolStudents;
  const groupTabs=`<div class="running-group-tabs"><button class="${epsGenericActiveGroup===0?'':'secondary'}" data-generic-group="0">Tous · ordre alphabétique</button>${Array.from({length:epsGenericGroupCount},(_,i)=>`<button class="${epsGenericActiveGroup===i+1?'':'secondary'}" data-generic-group="${i+1}">Groupe ${i+1}</button>`).join('')}<label>Groupes<select id="genericGroupCount">${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${n===epsGenericGroupCount?'selected':''}>${n===1?'Sans groupe':n+' groupes'}</option>`).join('')}</select></label></div>`;
  const sessions=epsGenericSessions.map(s=>`<div class="running-session-card ${String(s.id)===String(epsGenericSessionId)?'active':''}"><button data-generic-session="${s.id}"><b>${test.label}</b><small>${new Date(s.created_at).toLocaleString('fr-FR')} · modifiable</small></button><button class="danger" data-delete-generic-session="${s.id}">Supprimer</button></div>`).join('');
  host.innerHTML = `<details class="test-protocol"><summary>Protocole du test</summary><p>${test.protocol}</p></details>${groupTabs}
    <div class="modern-test-summary"><b>${toolStudents.length}</b><span>élèves · saisie partielle autorisée · P${epsTestPeriod}</span></div>
    ${displayed.map(s => `<div class="modern-test-student">
      <div class="modern-test-student-head"><strong>${studentLabel(s)}</strong>${epsGenericGroupCount>1?`<label>Groupe<select data-generic-student-group="${s.id}">${Array.from({length:epsGenericGroupCount},(_,i)=>`<option value="${i+1}" ${groupOf(s)===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label>`:''}</div>
      <div class="row" style="align-items:center">
        <div><label>${test.inputLabel}</label><input type="text" inputmode="decimal" data-eps-input="${s.id}" value="${epsGenericValues[s.id]??''}"></div>
        <div style="color:var(--primary); font-weight:700; padding-top:22px" data-eps-out="${s.id}">—</div>
      </div>
    </div>`).join("")}
    <div class="running-save-actions"><button id="epsSaveBtn">${epsGenericSessionId?'Enregistrer les modifications':'Enregistrer dans Tests EPS'}</button><button class="secondary" id="epsSaveAsBtn">Enregistrer comme nouveau test</button></div>
    <section class="field-tool-card"><h3>Tests enregistrés</h3><div class="running-session-list">${sessions||'<span class="muted">Aucun test enregistré.</span>'}</div></section>`;

  const refresh = () => {
    let ready = 0;
    host.querySelectorAll("[data-eps-input]").forEach(input => {
      const v = toolNumber(input.value);
      const out = host.querySelector(`[data-eps-out="${input.dataset.epsInput}"]`);
      if (v == null) { out.textContent = "—"; return; }
      const r = test.compute(v);
      out.textContent = `${EpsTests.fr(r.value, 1)} ${r.unit}`;
      ready++;
    });
    document.getElementById("epsSaveBtn").disabled = ready === 0;
  };
  host.querySelectorAll("[data-eps-input]").forEach(i => i.oninput = () => { epsGenericValues[i.dataset.epsInput]=i.value;refresh(); });
  refresh();
  document.getElementById("epsSaveBtn").disabled=false;
  document.getElementById("epsSaveBtn").onclick = () => saveEpsTest(key,false);
  document.getElementById("epsSaveAsBtn").onclick = () => saveEpsTest(key,true);
  document.getElementById("genericGroupCount").onchange=e=>{epsGenericGroupCount=+e.target.value;epsGenericActiveGroup=0;drawEpsTestBody(key)};
  host.querySelectorAll("[data-generic-student-group]").forEach(select=>select.onchange=()=>{epsGenericGroupAssignments[select.dataset.genericStudentGroup]=+select.value;drawEpsTestBody(key)});
  host.querySelectorAll("[data-generic-group]").forEach(b=>b.onclick=()=>{epsGenericActiveGroup=+b.dataset.genericGroup;drawEpsTestBody(key)});
  host.querySelectorAll("[data-generic-session]").forEach(b=>b.onclick=()=>openGenericTestSession(b.dataset.genericSession,key));
  host.querySelectorAll("[data-delete-generic-session]").forEach(b=>b.onclick=()=>deleteGenericTestSession(b.dataset.deleteGenericSession,key));
}

const stopCourseCounts = {};
let stopSessionId=null,stopSessionRecord=null,stopResultRecords={},stopSessions=[],stopGroupCount=1,stopActiveGroup=0,stopGroupAssignments={};
// Deux facons de traduire les arrets : une note qui part de 20 (comme avant), ou quatre bandes
// de couleur (Vert +, Vert, Orange, Rouge). Le nombre d'arrets par palier est reglable dans les
// deux cas - ce n'etait fixe qu'a "2" auparavant. Choix et seuil sont memorises par seance
// (dans input_unit de chaque resultat), pour qu'une reouverture retrouve le meme reglage.
const STOP_BANDS=["Vert +","Vert","Orange","Rouge"];
const STOP_BAND_COLORS={"Vert +":"#0e9f5f","Vert":"#4caf50","Orange":"#f39c12","Rouge":"#e74c3c"};
let stopMode="note",stopSeuil=2;
function stopPalier(n){return Math.floor(n/Math.max(1,stopSeuil))}
function stopNote(n){return Math.max(0,20-stopPalier(n)*0.5)}
function stopBande(n){return STOP_BANDS[Math.min(STOP_BANDS.length-1,stopPalier(n))]}
function stopBadge(n){return stopMode==="couleur"?`<strong style="color:${STOP_BAND_COLORS[stopBande(n)]}">${stopBande(n)}</strong>`:`<strong>${EpsTests.fr(stopNote(n),1)} / 20</strong>`}
function stopModeSelectorHtml(){return `<div class="field-tool-row"><label>Notation<select id="stopMode"><option value="note"${stopMode==="note"?" selected":""}>Note à partir de 20</option><option value="couleur"${stopMode==="couleur"?" selected":""}>Couleur (Vert + · Vert · Orange · Rouge)</option></select></label><label>Arrêts par palier<input id="stopSeuil" type="number" min="1" value="${stopSeuil}"></label></div>`}
async function drawStopCourseTest(test) {
  const host=document.getElementById("epsTestBody");
  if(!onRealClass()){
    host.innerHTML=`<div class="muted">${test.protocol}</div>${stopModeSelectorHtml()}<label>Nombre d’arrêts</label><input id="stopFree" type="number" min="0" value="0"><div class="ok" id="stopFreeOut">${stopBadge(0)}</div>`;
    document.getElementById("stopMode").onchange=e=>{stopMode=e.target.value;drawStopCourseTest(test)};
    document.getElementById("stopSeuil").onchange=e=>{stopSeuil=Math.max(1,+e.target.value||1);drawStopCourseTest(test)};
    stopFree.oninput=()=>stopFreeOut.innerHTML=stopBadge(Math.max(0,+stopFree.value||0));return;
  }
  stopSessions=await lireTable('eps_test_sessions',`eps_test_sessions?class_id=eq.${toolClassId}&period_number=eq.${epsTestPeriod}&test_name=eq.${encodeURIComponent(test.label)}&deleted=eq.false&select=*&order=created_at.desc`,{ou:r=>String(r.class_id)===String(toolClassId)&&+r.period_number===+epsTestPeriod&&r.test_name===test.label&&!r.deleted,trier:(a,b)=>(b.created_at||0)-(a.created_at||0)});
  const groupOf=s=>stopGroupCount>1?(stopGroupAssignments[s.id]||((toolStudents.findIndex(x=>String(x.id)===String(s.id))%stopGroupCount)+1)):1,visible=stopActiveGroup?toolStudents.filter(s=>groupOf(s)===stopActiveGroup):toolStudents;
  host.innerHTML=`<details class="test-protocol" open><summary>Protocole</summary><p>${test.protocol}</p></details>${stopModeSelectorHtml()}<div class="running-group-tabs"><button class="${stopActiveGroup===0?'':'secondary'}" data-stop-group="0">Tous</button>${Array.from({length:stopGroupCount},(_,i)=>`<button class="${stopActiveGroup===i+1?'':'secondary'}" data-stop-group="${i+1}">Groupe ${i+1}</button>`).join('')}<label>Groupes<select id="stopGroupCount">${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${n===stopGroupCount?'selected':''}>${n===1?'Sans groupe':n+' groupes'}</option>`).join('')}</select></label></div><div class="stop-student-list">${visible.map(s=>{const n=stopCourseCounts[s.id]||0;return `<div class="modern-test-student"><div class="modern-test-student-head"><b>${studentLabel(s)}</b>${stopGroupCount>1?`<label>Groupe<select data-stop-student-group="${s.id}">${Array.from({length:stopGroupCount},(_,i)=>`<option value="${i+1}" ${groupOf(s)===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label>`:''}</div><button class="stop-student" data-stop-student="${s.id}"><span><small>${n} arrêt${n>1?'s':''}</small></span>${stopBadge(n)}<i>+1</i></button></div>`}).join('')}</div><div class="running-save-actions"><button id="stopSave">${stopSessionId?'Enregistrer les modifications':'Enregistrer dans Tests EPS'}</button><button class="secondary" id="stopSaveAs">Enregistrer comme nouveau test</button></div><section class="field-tool-card"><h3>Tests enregistrés</h3><div class="running-session-list">${stopSessions.map(s=>`<div class="running-session-card"><button data-stop-session="${s.id}"><b>${test.label}</b><small>${new Date(s.created_at).toLocaleString('fr-FR')} · modifiable</small></button><button class="danger" data-stop-delete="${s.id}">Supprimer</button></div>`).join('')||'<span class="muted">Aucun test enregistré.</span>'}</div></section>`;
  document.getElementById("stopMode").onchange=e=>{stopMode=e.target.value;drawStopCourseTest(test)};
  document.getElementById("stopSeuil").onchange=e=>{stopSeuil=Math.max(1,+e.target.value||1);drawStopCourseTest(test)};
  host.querySelectorAll('[data-stop-student]').forEach(b=>b.onclick=()=>{stopCourseCounts[b.dataset.stopStudent]=(stopCourseCounts[b.dataset.stopStudent]||0)+1;drawStopCourseTest(test)});
  const save=async asNew=>{const cls=toolClasses.find(c=>c.id===toolClassId),id=asNew||!stopSessionId?crypto.randomUUID():stopSessionId,now=new Date().toISOString(),sessionRow=asNew||!stopSessionRecord?{id,user_id:session.user_id,class_id:toolClassId,period_number:epsTestPeriod,test_name:test.label,created_at:Date.now(),class_label:cls?.name||'',updated_at:now,deleted:false}:{...stopSessionRecord,updated_at:now,deleted:false};await enregistrerLigne('eps_test_sessions',sessionRow);const kept=new Set();for(const s of toolStudents){const n=stopCourseCounts[s.id]||0,old=!asNew?stopResultRecords[s.id]:null,resultId=old?.id||crypto.randomUUID();kept.add(String(resultId));await enregistrerLigne('eps_test_results',{...(old||{}),id:resultId,user_id:old?.user_id||session.user_id,session_id:id,student_id:s.id,input_value:n,result_value:stopMode==="couleur"?n:stopNote(n),input_unit:`group:${groupOf(s)}|Arrêts|mode:${stopMode}|seuil:${stopSeuil}`,result_unit:stopMode==="couleur"?`arrêt(s) · ${stopBande(n)}`:'/20',updated_at:now,deleted:false})}if(!asNew)for(const old of Object.values(stopResultRecords))if(!kept.has(String(old.id)))await enregistrerLigne('eps_test_results',{...old,deleted:true,updated_at:now});stopSessionId=id;stopSessionRecord=sessionRow;await drawStopCourseTest(test)};
  stopSave.onclick=()=>save(false);stopSaveAs.onclick=()=>save(true);document.getElementById('stopGroupCount').onchange=e=>{stopGroupCount=+e.target.value;stopActiveGroup=0;drawStopCourseTest(test)};host.querySelectorAll('[data-stop-group]').forEach(b=>b.onclick=()=>{stopActiveGroup=+b.dataset.stopGroup;drawStopCourseTest(test)});host.querySelectorAll('[data-stop-student-group]').forEach(s=>s.onchange=()=>{stopGroupAssignments[s.dataset.stopStudentGroup]=+s.value;drawStopCourseTest(test)});host.querySelectorAll('[data-stop-session]').forEach(b=>b.onclick=()=>openStopSession(b.dataset.stopSession,test));host.querySelectorAll('[data-stop-delete]').forEach(b=>b.onclick=()=>deleteStopSession(b.dataset.stopDelete,test));
}
async function openStopSession(id,test){const saved=stopSessions.find(s=>String(s.id)===String(id));if(!saved)return;const rows=await lireTable('eps_test_results',`eps_test_results?session_id=eq.${id}&deleted=eq.false&select=*`,{ou:r=>String(r.session_id)===String(id)&&!r.deleted});stopSessionId=saved.id;stopSessionRecord=saved;stopResultRecords={};stopGroupAssignments={};stopGroupCount=1;Object.keys(stopCourseCounts).forEach(k=>delete stopCourseCounts[k]);rows.forEach(r=>{stopResultRecords[r.student_id]=r;stopCourseCounts[r.student_id]=+r.input_value||0;const unite=String(r.input_unit||'');const g=+unite.match(/^group:(\d+)/)?.[1]||1;stopGroupAssignments[r.student_id]=g;stopGroupCount=Math.max(stopGroupCount,g);const modeVu=unite.match(/mode:(note|couleur)/)?.[1];const seuilVu=+unite.match(/seuil:(\d+)/)?.[1];if(modeVu)stopMode=modeVu;if(seuilVu)stopSeuil=seuilVu});stopActiveGroup=0;await drawStopCourseTest(test)}
async function deleteStopSession(id,test){if(!confirm('Supprimer ce test et ses résultats ?'))return;const saved=stopSessions.find(s=>String(s.id)===String(id));if(saved)await enregistrerLigne('eps_test_sessions',{...saved,deleted:true,updated_at:new Date().toISOString()});if(String(stopSessionId)===String(id)){stopSessionId=null;stopSessionRecord=null;stopResultRecords={};Object.keys(stopCourseCounts).forEach(k=>delete stopCourseCounts[k])}await drawStopCourseTest(test)}

let runningDistance=500,runningCount=3,runningDifficulty=0,runningSessionId=null,runningCreatedAt=null,runningSessionRecord=null;
let runningSessions=[],runningResultRecords={},runningExpandedStudent=null;
let runningGroups=[],runningActiveGroup=-1,runningManageGroups=false,runningEditingGroup=null,runningGroupSelection=new Set();
let runningWalking=new Set();
const RUNNING_REMOVED='__REMOVED__';
const runningValues={};
function compactRunningSeconds(raw){const clean=String(raw||'').replace(/\D/g,'');if(!clean)return null;const n=+clean,m=Math.floor(n/100),s=n%100;return s<60?m*60+s:null}
function runningRegularity(total){if(total<=2)return 6;if(total<=4)return 5.7;if(total<=6)return 5.4;if(total<=8)return 5.1;if(total<=10)return 4.8;if(total===11)return 4.5;if(total>25)return 0;return Math.max(0,4.2-(total-12)*.3)}
const runningGirls=[270,255,240,226,214,202,190,180,170,164,156,148,140,137,135,133,131,128,125,122,120,118,116,114,112];
const runningBoys=[240,230,214,200,188,174,162,152,140,133,125,118,112,110,109,108,107,106,104,102,100,98,95,92,89];
function runningEquivalent(avg){return (runningDistance===250?avg*2:avg)/(1-runningDifficulty/100)}
function runningPerformance(avg,sex){const cuts=String(sex||'').toUpperCase().includes('F')?runningGirls:String(sex||'').toUpperCase().includes('G')?runningBoys:null;if(!cuts)return null;const equivalent=runningEquivalent(avg);let score=0;cuts.forEach((c,i)=>{if(equivalent<=c)score=i*.25});return Math.min(6,score)}
function walkingPerformance(avg){const e=runningEquivalent(avg);return Math.max(0,Math.min(3,e<=225?3:e<=240?3-(e-225)*.1:e<260?1.5-(e-240)*.075:0))}
function runningSummary(s){const raw=runningValues[s.id]||Array(runningCount).fill(''),valid=raw.filter(v=>v!==RUNNING_REMOVED).map(compactRunningSeconds).filter(v=>v!=null);if(!valid.length)return null;const walking=runningWalking.has(String(s.id)),avg=valid.reduce((a,b)=>a+b,0)/valid.length,gaps=valid.slice(1).map((v,i)=>Math.abs(v-valid[i])),reg=valid.length>1?runningRegularity(gaps.reduce((a,b)=>a+b,0))*(walking?1.5:1):null,perf=walking?walkingPerformance(avg):runningPerformance(avg,s.sex),total=perf==null?null:(reg==null?perf:reg+perf);return{raw,valid,avg,gaps,reg,perf,total,walking,regMax:walking?9:6,perfMax:walking?3:6}}
function runningTimeLabel(avg){return `${Math.floor(avg/60)}:${String(Math.round(avg)%60).padStart(2,'0')}`}
function resetRunningSession(){runningSessionId=null;runningCreatedAt=null;runningSessionRecord=null;runningResultRecords={};runningExpandedStudent=null;runningGroups=[];runningActiveGroup=-1;runningManageGroups=false;runningEditingGroup=null;runningGroupSelection=new Set();runningWalking=new Set();Object.keys(runningValues).forEach(k=>delete runningValues[k]);toolStudents.forEach(s=>runningValues[s.id]=Array(runningCount).fill(''))}
async function loadRunningSessions(){if(!onRealClass()){runningSessions=[];return}const all=await lireTable('eps_test_sessions',`eps_test_sessions?class_id=eq.${toolClassId}&period_number=eq.${epsTestPeriod}&test_name=eq.${encodeURIComponent('3 × 500 m')}&deleted=eq.false&select=*&order=created_at.desc`,{ou:r=>String(r.class_id)===String(toolClassId)&&+r.period_number===+epsTestPeriod&&r.test_name==='3 × 500 m'&&!r.deleted,trier:(a,b)=>(b.created_at||0)-(a.created_at||0)});runningSessions=all}
async function openRunningSession(id,test){const saved=runningSessions.find(s=>String(s.id)===String(id));if(!saved)return;const rows=await lireTable('eps_test_results',`eps_test_results?session_id=eq.${id}&deleted=eq.false&select=*`,{ou:r=>String(r.session_id)===String(id)&&!r.deleted});runningSessionId=saved.id;runningCreatedAt=saved.created_at;runningSessionRecord=saved;runningResultRecords={};runningGroups=[];runningWalking=new Set();runningActiveGroup=-1;runningManageGroups=false;Object.keys(runningValues).forEach(k=>delete runningValues[k]);const first=rows[0]?.input_unit||'',parts=first.split(':');if(parts[0]==='runs'){runningDistance=+parts[1]||500;runningCount=Math.max(1,Math.min(10,+parts[2]||3));runningDifficulty=Math.max(-30,Math.min(30,+first.split(':difficulty:')[1]?.split(':')[0]||0))}toolStudents.forEach(s=>runningValues[s.id]=Array(runningCount).fill(''));const groupMap=new Map();rows.forEach(r=>{runningResultRecords[r.student_id]=r;const unit=String(r.input_unit||''),times=unit.split(':times:')[1],group=+unit.split(':group:')[1]?.split(':')[0];if(unit.includes(':mode:walk:'))runningWalking.add(String(r.student_id));if(times!=null)runningValues[r.student_id]=times.split('|').slice(0,runningCount).concat(Array(runningCount).fill('')).slice(0,runningCount);if(Number.isInteger(group)&&group>=0){if(!groupMap.has(group))groupMap.set(group,[]);groupMap.get(group).push(String(r.student_id))}});runningGroups=[...groupMap.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]);if(runningGroups.length)runningActiveGroup=0;paintRunningSeriesTest(test)}
function bindRunningLongPress(nodes,handler){nodes.forEach(node=>{let timer=null,startX=0,startY=0;const cancel=()=>{clearTimeout(timer);timer=null};node.addEventListener('pointerdown',e=>{startX=e.clientX;startY=e.clientY;timer=setTimeout(()=>{timer=null;handler(node)},650)});node.addEventListener('pointermove',e=>{if(Math.abs(e.clientX-startX)>12||Math.abs(e.clientY-startY)>12)cancel()});node.addEventListener('pointerup',cancel);node.addEventListener('pointercancel',cancel);node.addEventListener('contextmenu',e=>{e.preventDefault();handler(node)})})}
async function drawRunningSeriesTest(test){const host=document.getElementById('epsTestBody');if(!onRealClass()){toolStudents=[{id:FREE_USE,first_name:'Participant',last_name:'libre',sex:'GARCON'}];runningSessions=[];if(!runningValues[FREE_USE])resetRunningSession();paintRunningSeriesTest(test);return}await loadRunningSessions();if(!runningSessionId&&!Object.keys(runningValues).length)resetRunningSession();paintRunningSeriesTest(test)}
function paintRunningSeriesTest(test){
  const host=document.getElementById('epsTestBody');if(!host)return;toolStudents.forEach(s=>{const old=runningValues[s.id]||[];runningValues[s.id]=old.slice(0,runningCount).concat(Array(Math.max(0,runningCount-old.length)).fill(''))});
  const displayedStudents=runningActiveGroup>=0?(runningGroups[runningActiveGroup]||[]).map(id=>toolStudents.find(s=>String(s.id)===String(id))).filter(Boolean):toolStudents;
  const sessions=runningSessions.map(s=>`<button class="running-session-card${String(s.id)===String(runningSessionId)?' active':''}" data-running-session="${s.id}"><b>3 × 500 m · P${s.period_number}</b><small>${new Date(s.created_at).toLocaleString('fr-FR')}</small></button>`).join('');
  const groupTabs=`<div class="running-group-tabs"><button class="${runningActiveGroup<0?'':'secondary'}" data-running-group="-1">Sans groupe · ordre alphabétique</button>${runningGroups.map((g,i)=>`<button class="${runningActiveGroup===i?'':'secondary'}" data-running-group="${i}">Groupe ${i+1} · ${g.length}</button>`).join('')}<button class="secondary" id="runningManageGroups">${runningGroups.length?'Modifier les groupes':'Constituer des groupes'}</button></div>`;
  const unavailable=new Set(runningGroups.flatMap((g,i)=>i===runningEditingGroup?[]:g));
  const groupEditor=runningManageGroups?`<section class="running-group-editor"><div class="top"><div><b>${runningEditingGroup==null?`Créer le groupe ${runningGroups.length+1}`:`Modifier le groupe ${runningEditingGroup+1}`}</b><small>Cochez les élèves puis enregistrez la composition.</small></div><button class="secondary" id="runningCloseGroups">Fermer</button></div><div class="running-group-students">${toolStudents.filter(s=>!unavailable.has(String(s.id))).map(s=>`<label class="${runningGroupSelection.has(String(s.id))?'selected':''}"><input type="checkbox" data-running-group-student="${s.id}" ${runningGroupSelection.has(String(s.id))?'checked':''}><span>${studentLabel(s)}</span></label>`).join('')}</div><div class="running-group-actions"><button id="runningSaveGroup" ${runningGroupSelection.size?'':'disabled'}>${runningEditingGroup==null?'Créer le groupe':'Enregistrer les modifications'}</button>${runningEditingGroup!=null?'<button class="danger" id="runningDeleteGroup">Supprimer ce groupe</button>':''}</div><div class="running-existing-groups">${runningGroups.map((g,i)=>`<button class="secondary" data-running-edit-group="${i}">Groupe ${i+1} · ${g.length} élève(s)</button>`).join('')}</div></section>`:'';
  const heads=Array.from({length:runningCount},(_,i)=>`<th data-run-column="${i}">${runningDistance} m · ${i+1}<small>Appui prolongé pour supprimer</small></th>`).join('');
  const rows=displayedStudents.map(s=>{const summary=runningSummary(s),values=runningValues[s.id],walk=runningWalking.has(String(s.id));return `<tr><th class="running-sticky"><button class="running-name" data-run-name="${s.id}"><b>${studentLabel(s)}${walk?' <span class="running-walk-badge">M.R</span>':''}</b><small data-run-score="${s.id}">Note : ${summary?.total!=null?EpsTests.fr(summary.total,2):'—'}</small></button></th>${values.map((v,i)=>`<td>${v===RUNNING_REMOVED?`<button class="running-removed" data-run-student="${s.id}" data-run-index="${i}">Retirée</button>`:`<input inputmode="numeric" maxlength="3" placeholder="315" data-run-student="${s.id}" data-run-index="${i}" value="${v}">`}</td>`).join('')}</tr>`}).join('');
  const detailStudent=toolStudents.find(s=>String(s.id)===String(runningExpandedStudent)),detail=detailStudent?runningSummary(detailStudent):null;
  host.innerHTML=`<details class="test-protocol"><summary>Protocole du test</summary><p>${test.protocol}</p></details><div class="running-settings"><label>Format<select id="runDistance"><option value="500" ${runningDistance===500?'selected':''}>500 m</option><option value="250" ${runningDistance===250?'selected':''}>250 m</option></select></label><label>Nombre de courses<select id="runCount">${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${runningCount===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label><label class="running-difficulty">Difficulté <b id="runningDifficultyLabel">${runningDifficulty>0?'+'+runningDifficulty:runningDifficulty} %</b><input id="runningDifficulty" type="range" min="-30" max="30" step="1" value="${runningDifficulty}"><small>−30 % plus facile · +30 % plus difficile</small></label></div>${onRealClass()?groupTabs:''}${onRealClass()?groupEditor:''}<div class="running-session-toolbar"><button class="secondary" id="runningBlank">＋ Nouvelle saisie</button>${onRealClass()?`<div class="running-session-list">${sessions||'<span class="muted">Aucune session enregistrée</span>'}</div>`:'<span class="muted">Utilisation libre · aucun enregistrement dans une classe</span>'}</div><div class="running-grid-wrap"><table class="running-grid"><thead><tr><th class="running-sticky">Nom et prénom</th>${heads}</tr></thead><tbody>${rows}</tbody></table></div>${detailStudent?`<div class="running-result"><b>${studentLabel(detailStudent)}${detail?.walking?' · M.R':''}</b>${detail?`<span>Moyenne de ${detail.valid.length} course(s) : ${runningTimeLabel(detail.avg)} · Régularité ${detail.reg==null?'—':EpsTests.fr(detail.reg,1)}/${detail.regMax} · Performance ${detail.perf==null?'sexe non renseigné':EpsTests.fr(detail.perf,2)+'/'+detail.perfMax}</span>`:'<span>Renseignez au moins un temps.</span>'}</div>`:''}${onRealClass()?`<div class="running-save-actions"><button id="runningSave">${runningSessionId?'Enregistrer les modifications':'Enregistrer la session'}</button><button class="secondary" id="runningSaveAs">Enregistrer comme nouvelle session</button></div>`:''}<div class="running-export-actions"><button class="secondary" id="runningExcel">▦ Excel</button><button class="secondary" id="runningPdf">▤ PDF</button></div><div id="runningMsg" class="ok"></div>`;
  const distanceSelect=document.getElementById('runDistance'),countSelect=document.getElementById('runCount'),difficultySlider=document.getElementById('runningDifficulty'),difficultyLabel=document.getElementById('runningDifficultyLabel'),blankButton=document.getElementById('runningBlank');
  distanceSelect.onchange=()=>{runningDistance=+distanceSelect.value;paintRunningSeriesTest(test)};
  countSelect.onchange=()=>{runningCount=+countSelect.value;paintRunningSeriesTest(test)};
  difficultySlider.oninput=()=>{runningDifficulty=+difficultySlider.value;difficultyLabel.textContent=`${runningDifficulty>0?'+':''}${runningDifficulty} %`};
  difficultySlider.onchange=()=>paintRunningSeriesTest(test);
  blankButton.onclick=()=>{resetRunningSession();paintRunningSeriesTest(test)};
  host.querySelectorAll('[data-running-group]').forEach(b=>b.onclick=()=>{runningActiveGroup=+b.dataset.runningGroup;runningManageGroups=false;runningExpandedStudent=null;paintRunningSeriesTest(test)});
  const manageGroups=document.getElementById('runningManageGroups');if(manageGroups)manageGroups.onclick=()=>{runningManageGroups=true;runningEditingGroup=null;runningGroupSelection=new Set();paintRunningSeriesTest(test)};
  if(runningManageGroups){document.getElementById('runningCloseGroups').onclick=()=>{runningManageGroups=false;paintRunningSeriesTest(test)};host.querySelectorAll('[data-running-group-student]').forEach(box=>box.onchange=()=>{if(box.checked)runningGroupSelection.add(String(box.dataset.runningGroupStudent));else runningGroupSelection.delete(String(box.dataset.runningGroupStudent));paintRunningSeriesTest(test)});host.querySelectorAll('[data-running-edit-group]').forEach(b=>b.onclick=()=>{runningEditingGroup=+b.dataset.runningEditGroup;runningGroupSelection=new Set(runningGroups[runningEditingGroup]||[]);paintRunningSeriesTest(test)});document.getElementById('runningSaveGroup').onclick=()=>{const ids=[...runningGroupSelection];if(!ids.length)return;if(runningEditingGroup==null)runningGroups.push(ids);else runningGroups[runningEditingGroup]=ids;runningActiveGroup=runningEditingGroup==null?runningGroups.length-1:runningEditingGroup;runningManageGroups=false;runningEditingGroup=null;runningGroupSelection=new Set();paintRunningSeriesTest(test)};const deleteGroup=document.getElementById('runningDeleteGroup');if(deleteGroup)deleteGroup.onclick=()=>{if(!confirm(`Supprimer le groupe ${runningEditingGroup+1} ? Les temps saisis restent conservés.`))return;runningGroups.splice(runningEditingGroup,1);runningActiveGroup=runningGroups.length?Math.min(runningEditingGroup,runningGroups.length-1):-1;runningManageGroups=false;runningEditingGroup=null;runningGroupSelection=new Set();paintRunningSeriesTest(test)}}
  host.querySelectorAll('[data-running-session]').forEach(b=>b.onclick=()=>openRunningSession(b.dataset.runningSession,test));host.querySelectorAll('[data-run-name]').forEach(b=>b.onclick=()=>{runningExpandedStudent=runningExpandedStudent===b.dataset.runName?null:b.dataset.runName;paintRunningSeriesTest(test)});
  host.querySelectorAll('input[data-run-student]').forEach(input=>{input.oninput=()=>{const clean=input.value.replace(/\D/g,'').slice(0,3);input.value=clean;const studentId=input.dataset.runStudent;runningValues[studentId][+input.dataset.runIndex]=clean;const student=toolStudents.find(s=>String(s.id)===String(studentId)),summary=student?runningSummary(student):null;host.querySelectorAll('[data-run-score]').forEach(score=>{if(String(score.dataset.runScore)===String(studentId))score.textContent=`Note : ${summary?.total!=null?EpsTests.fr(summary.total,2):'—'}`})};input.onchange=()=>{input.value=input.value.replace(/\D/g,'').slice(0,3)}});
  bindRunningLongPress(host.querySelectorAll('[data-run-column]'),node=>{const index=+node.dataset.runColumn;if(runningCount<=1||!confirm(`Supprimer la course ${index+1} pour tous les élèves ?`))return;toolStudents.forEach(s=>runningValues[s.id].splice(index,1));runningCount--;paintRunningSeriesTest(test)});
  bindRunningLongPress(host.querySelectorAll('[data-run-student]'),node=>{const student=toolStudents.find(s=>String(s.id)===String(node.dataset.runStudent)),index=+node.dataset.runIndex,current=runningValues[node.dataset.runStudent][index],restore=current===RUNNING_REMOVED;if(!confirm(restore?`Restaurer la course ${index+1} de ${studentLabel(student)} ?`:`Retirer uniquement la course ${index+1} de ${studentLabel(student)} ?`))return;runningValues[node.dataset.runStudent][index]=restore?'':RUNNING_REMOVED;paintRunningSeriesTest(test)});
  bindRunningLongPress(host.querySelectorAll('[data-run-name]'),node=>{const id=String(node.dataset.runName),student=toolStudents.find(s=>String(s.id)===id),walk=confirm(`${studentLabel(student)}\n\nOK : Marche rapide\nAnnuler : Course`);if(walk)runningWalking.add(id);else runningWalking.delete(id);paintRunningSeriesTest(test)});
  if(onRealClass()){runningSave.onclick=()=>saveRunningSeries(test,false);runningSaveAs.onclick=()=>saveRunningSeries(test,true)}runningExcel.onclick=exportRunningCsv;runningPdf.onclick=printRunningPdf;
}
async function saveRunningSeries(test,asNew){const cls=toolClasses.find(c=>c.id===toolClassId),id=asNew||!runningSessionId?crypto.randomUUID():runningSessionId,now=new Date().toISOString(),created=asNew||!runningCreatedAt?Date.now():runningCreatedAt;const selected=toolStudents.map(s=>[s,runningSummary(s),runningValues[s.id],runningGroups.findIndex(g=>g.includes(String(s.id)))]).filter(([s,r,raw,group])=>r||raw.some(v=>v===RUNNING_REMOVED)||group>=0||runningWalking.has(String(s.id)));const sessionRow=asNew||!runningSessionRecord?{id,user_id:session.user_id,class_id:toolClassId,period_number:epsTestPeriod,test_name:test.label,created_at:created,class_label:cls?.name||'',updated_at:now,deleted:false}:{...runningSessionRecord,updated_at:now,deleted:false};await enregistrerLigne('eps_test_sessions',sessionRow);const kept=new Set();for(const [s,r,raw,group] of selected){const old=!asNew?runningResultRecords[s.id]:null,resultId=old?.id||crypto.randomUUID();kept.add(String(resultId));const valid=r?.valid||[],active=raw.filter(v=>v!==RUNNING_REMOVED).length,walk=runningWalking.has(String(s.id));await enregistrerLigne('eps_test_results',{...(old||{}),id:resultId,user_id:old?.user_id||session.user_id,session_id:id,student_id:s.id,input_value:r?.avg||0,result_value:r?.total||0,input_unit:`runs:${runningDistance}:${runningCount}:group:${group}:difficulty:${runningDifficulty}:mode:${walk?'walk':'run'}:times:${raw.join('|')}`,result_unit:`${valid.length>1?'/12':walk?'/3':'/6'}${valid.length<active?' · en cours':''}`,updated_at:now,deleted:false})}if(!asNew)for(const old of Object.values(runningResultRecords))if(!kept.has(String(old.id)))await enregistrerLigne('eps_test_results',{...old,deleted:true,updated_at:now});runningSessionId=id;runningCreatedAt=created;runningSessionRecord=sessionRow;await loadRunningSessions();await openRunningSession(id,test);const msg=document.getElementById('runningMsg');if(msg)msg.textContent=asNew?'Nouvelle session enregistrée.':'Session mise à jour.'}
async function ouvrirSessionTrois500DepuisClasse(sessionId,classId,period){showTab('outils');toolPanel=document.getElementById('toolPanel');toolPanel.style.display='block';toolPanel.classList.add('modern-tool-panel');toolClassId=classId;epsTestPeriod=+period||1;epsOpenCategory='Athle';epsOpenTest='TROIS_500';runningSessionId=null;Object.keys(runningValues).forEach(k=>delete runningValues[k]);await renderEpsTests();await loadRunningSessions();await openRunningSession(sessionId,EpsTests.TESTS.TROIS_500);document.getElementById('epsTestBody')?.scrollIntoView({behavior:'smooth',block:'start'})}
async function ouvrirSessionTestDepuisClasse(sessionId,classId,period,testName){if(testName==='3 × 500 m')return ouvrirSessionTrois500DepuisClasse(sessionId,classId,period);const key=Object.keys(EpsTests.TESTS).find(k=>EpsTests.TESTS[k].label===testName);showTab('outils');toolPanel=document.getElementById('toolPanel');toolPanel.style.display='block';toolPanel.classList.add('modern-tool-panel');toolClassId=classId;epsTestPeriod=+period||1;if(key){epsOpenCategory=EpsTests.CATEGORIES.find(c=>c.tests.includes(key))?.name||'Athle';epsOpenTest=key;resetGenericTestState();await renderEpsTests();if(EpsTests.TESTS[key].special==='stops')await openStopSession(sessionId,EpsTests.TESTS[key]);else await openGenericTestSession(sessionId,key);document.getElementById('epsTestBody')?.scrollIntoView({behavior:'smooth',block:'start'});return}if(testName==='Condition physique générale'&&typeof ouvrirConditionPhysiqueDepuisClasse==='function')return ouvrirConditionPhysiqueDepuisClasse(sessionId,classId,period);if(testName==='Observation Natation'&&typeof ouvrirObservationNatationDepuisClasse==='function')return ouvrirObservationNatationDepuisClasse(sessionId,classId,period);if(String(testName).startsWith('Test VMA')){await renderVmaTest();await openVmaSession(sessionId);return}}
function runningExportData(){return toolStudents.map(s=>({student:s,summary:runningSummary(s)})).filter(x=>x.summary)}
function exportRunningCsv(){const headers=['Nom','Prénom','Mode',...Array.from({length:runningCount},(_,i)=>`Course ${i+1}`),'Moyenne','Écarts','Régularité','Performance','Note /12'],rows=runningExportData().map(({student:s,summary:r})=>[s.last_name,s.first_name,r.walking?'M.R':'Course',...r.raw.map(v=>v===RUNNING_REMOVED?'Retirée':v),`${Math.floor(r.avg/60)}:${String(Math.round(r.avg)%60).padStart(2,'0')}`,r.gaps.join(' + '),`${r.reg??''}/${r.regMax}`,`${r.perf??''}/${r.perfMax}`,r.total??'']);const csv='\ufeff'+[headers,...rows].map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`resultats-${runningCount}x${runningDistance}m-P${epsTestPeriod}.csv`;a.click();URL.revokeObjectURL(a.href)}
function printRunningPdf(){const rows=runningExportData(),w=open('','_blank');if(!w)return alert('Autorisez les fenêtres surgissantes.');w.document.write(`<html><head><title>Résultats ${runningCount} × ${runningDistance} m</title><style>body{font:12px Arial;color:#173a57;padding:24px}h1{color:#087dca}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cad8e3;padding:6px;text-align:center}th:first-child,td:first-child{text-align:left}@media print{button{display:none}}</style></head><body><h1>${runningCount} × ${runningDistance} m · ${toolClasses.find(c=>c.id===toolClassId)?.name||''}</h1><p>Difficulté : ${runningDifficulty>0?'+':''}${runningDifficulty} %</p><table><tr><th>Élève</th>${Array.from({length:runningCount},(_,i)=>`<th>C${i+1}</th>`).join('')}<th>Moyenne</th><th>Régularité</th><th>Performance</th><th>Note</th></tr>${rows.map(({student:s,summary:r})=>`<tr><td>${studentLabel(s)}${r.walking?' · M.R':''}</td>${r.raw.map(v=>`<td>${v===RUNNING_REMOVED?'Retirée':v}</td>`).join('')}<td>${Math.floor(r.avg/60)}:${String(Math.round(r.avg)%60).padStart(2,'0')}</td><td>${r.reg??'—'} / ${r.regMax}</td><td>${r.perf??'—'} / ${r.perfMax}</td><td>${r.total??'—'} / ${r.valid.length>1?12:r.perfMax}</td></tr>`).join('')}</table><button onclick="print()">Enregistrer / imprimer en PDF</button></body></html>`);w.document.close()}

async function saveEpsTest(key, asNew=false) {
  const test = EpsTests.TESTS[key];
  const host = document.getElementById("epsTestBody");
  const rows = [];
  toolStudents.forEach(student => {
    const v = toolNumber(epsGenericValues[student.id]);
    const r = v == null ? null : test.compute(v);
    rows.push({ studentId: student.id, input: v, value: r?.value??0, unit: r?.unit||"", draft:v==null });
  });

  const cls = toolClasses.find(c => c.id === toolClassId);
  const sessionId = asNew||!epsGenericSessionId?crypto.randomUUID():epsGenericSessionId;
  const now=new Date().toISOString();
  try {
    const sessionRow=asNew||!epsGenericSessionRecord?{
      id: sessionId, user_id: session.user_id, class_id: toolClassId,
      period_number: epsTestPeriod, test_name: test.label, created_at: Date.now(),
      class_label: cls ? cls.name : "", updated_at: now, deleted: false
    }:{...epsGenericSessionRecord,updated_at:now,deleted:false};
    await enregistrerLigne("eps_test_sessions",sessionRow);
    const kept=new Set();
    for(const r of rows){const old=!asNew?epsGenericResultRecords[r.studentId]:null,resultId=old?.id||crypto.randomUUID();kept.add(String(resultId));await enregistrerLigne("eps_test_results",{
      ...(old||{}),id:resultId, user_id: old?.user_id||session.user_id, session_id: sessionId,
      student_id: r.studentId, input_value: r.input??0, result_value: r.value,
      input_unit: `group:${epsGenericGroupCount>1?(epsGenericGroupAssignments[r.studentId]||((toolStudents.findIndex(s=>String(s.id)===String(r.studentId))%epsGenericGroupCount)+1)):1}|${test.inputLabel}`,
      result_unit: r.draft?"brouillon":r.unit,
      updated_at: now, deleted: false
    })}
    if(!asNew)for(const old of Object.values(epsGenericResultRecords))if(!kept.has(String(old.id)))await enregistrerLigne("eps_test_results",{...old,deleted:true,updated_at:now});
    epsGenericSessionId=sessionId;epsGenericSessionRecord=sessionRow;
    await openGenericTestSession(sessionId,key);
    const completed=rows.filter(r=>!r.draft).length;document.getElementById("epsSaveMsg").textContent = `${test.label} enregistré${completed?` pour ${completed} élève(s)`:" comme brouillon"} · P${epsTestPeriod}`;
  } catch (e) {
    document.getElementById("epsSaveMsg").textContent = "Echec de l'enregistrement : " + e.message;
  }
}

async function openGenericTestSession(sessionId,key){const test=EpsTests.TESTS[key],saved=epsGenericSessions.find(s=>String(s.id)===String(sessionId))||await lireTable("eps_test_sessions",`eps_test_sessions?id=eq.${sessionId}&select=*`).then(r=>r[0]);if(!saved)return;const rows=await lireTable("eps_test_results",`eps_test_results?session_id=eq.${sessionId}&deleted=eq.false&select=*`,{ou:r=>String(r.session_id)===String(sessionId)&&!r.deleted});epsGenericSessionId=saved.id;epsGenericSessionRecord=saved;epsGenericResultRecords={};epsGenericValues={};epsGenericGroupAssignments={};let maxGroup=1;rows.forEach(r=>{epsGenericResultRecords[r.student_id]=r;epsGenericValues[r.student_id]=String(r.result_unit||'').includes('brouillon')?'':String(r.input_value??'');const g=+String(r.input_unit||'').match(/^group:(\d+)/)?.[1]||1;epsGenericGroupAssignments[r.student_id]=g;maxGroup=Math.max(maxGroup,g)});epsGenericGroupCount=maxGroup;epsGenericActiveGroup=0;await drawEpsTestBody(key)}
async function deleteGenericTestSession(sessionId,key){if(!confirm("Supprimer ce test et ses résultats ?"))return;const saved=epsGenericSessions.find(s=>String(s.id)===String(sessionId));if(saved)await enregistrerLigne("eps_test_sessions",{...saved,deleted:true,updated_at:new Date().toISOString()});if(String(epsGenericSessionId)===String(sessionId)){epsGenericSessionId=null;epsGenericSessionRecord=null;epsGenericResultRecords={};epsGenericValues={}}await drawEpsTestBody(key)}

// ---- Tests VMA (miroir de VmaTestScreen) ----
let vmaProtocol = "VAMEVAL";
let vmaSessionId=null,vmaSessionRecord=null,vmaResultRecords={},vmaValues={},vmaGroupCount=1,vmaActiveGroup=0,vmaGroupAssignments={},vmaSessions=[];

async function renderVmaTest() {
  await loadToolClasses();
  await loadToolStudents(toolClassId);
  await drawVmaTest();
}

async function drawVmaTest() {
  const proto = EpsTests.VMA_PROTOCOLS.find(p => p.key === vmaProtocol);
  const cible = onRealClass() ? toolStudents : [{ id: FREE_USE, first_name: "Participant", last_name: "libre" }];
  if(onRealClass())vmaSessions=await lireTable('eps_test_sessions',`eps_test_sessions?class_id=eq.${toolClassId}&period_number=eq.${epsTestPeriod}&test_name=like.Test%20VMA*&deleted=eq.false&select=*&order=created_at.desc`,{ou:r=>String(r.class_id)===String(toolClassId)&&+r.period_number===+epsTestPeriod&&String(r.test_name||'').startsWith('Test VMA')&&!r.deleted,trier:(a,b)=>(b.created_at||0)-(a.created_at||0)});else vmaSessions=[];
  const groupOf=s=>vmaGroupCount>1?(vmaGroupAssignments[s.id]||((toolStudents.findIndex(x=>String(x.id)===String(s.id))%vmaGroupCount)+1)):1;
  const visible=onRealClass()&&vmaActiveGroup?cible.filter(s=>groupOf(s)===vmaActiveGroup):cible;
  const groups=onRealClass()?`<div class="running-group-tabs"><button class="${vmaActiveGroup===0?'':'secondary'}" data-vma-group="0">Tous</button>${Array.from({length:vmaGroupCount},(_,i)=>`<button class="${vmaActiveGroup===i+1?'':'secondary'}" data-vma-group="${i+1}">Groupe ${i+1}</button>`).join('')}<label>Groupes<select id="vmaGroupCount">${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${n===vmaGroupCount?'selected':''}>${n===1?'Sans groupe':n+' groupes'}</option>`).join('')}</select></label></div>`:'';
  const saved=onRealClass()?`<section class="field-tool-card"><h3>Tests VMA enregistrés</h3><div class="running-session-list">${vmaSessions.map(s=>`<div class="running-session-card"><button data-vma-session="${s.id}"><b>${s.test_name}</b><small>${new Date(s.created_at).toLocaleString('fr-FR')} · modifiable</small></button><button class="danger" data-vma-delete="${s.id}">Supprimer</button></div>`).join('')||'<span class="muted">Aucun test enregistré.</span>'}</div></section>`:'';

  toolPanel.innerHTML = toolHeader("Tests VMA", "VAMEVAL, Leger-Boucher, Cooper et demi-Cooper")
    + toolRosterHtml()
    + `<div class="toolActions" style="margin-top:10px">${EpsTests.VMA_PROTOCOLS.map(p =>
        `<button class="${p.key === vmaProtocol ? "" : "secondary"}" data-vma-proto="${p.key}">${p.label}</button>`).join("")}</div>
      <div class="card" style="background:#F2F8FF"><strong>${proto.label}</strong><div class="muted">${proto.hint}</div></div>
      ${groups}${visible.map(s => `<div class="modern-test-student">
        <div class="modern-test-student-head"><strong>${studentLabel(s)}</strong>${onRealClass()&&vmaGroupCount>1?`<label>Groupe<select data-vma-student-group="${s.id}">${Array.from({length:vmaGroupCount},(_,i)=>`<option value="${i+1}" ${groupOf(s)===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label>`:''}</div>
        <div class="row" style="align-items:center">
          <div><label>${vmaProtocol.includes("Cooper") ? "Distance (m)" : "Palier"}</label>
            <input type="text" inputmode="decimal" data-vma-input="${s.id}" value="${vmaValues[s.id]??''}"></div>
          <div style="color:var(--primary); font-weight:700; padding-top:22px" data-vma-out="${s.id}">—</div>
        </div>
      </div>`).join("")}
      ${onRealClass() ? `<div class="running-save-actions"><button id="vmaSaveBtn">${vmaSessionId?'Enregistrer les modifications':'Enregistrer dans Tests EPS'}</button><button class="secondary" id="vmaSaveAsBtn">Enregistrer comme nouveau test</button></div>` : ""}
      <div class="ok" id="vmaSaveMsg"></div>${saved}`;

  bindToolClose();
  bindToolRoster(()=>{vmaSessionId=null;vmaSessionRecord=null;vmaResultRecords={};vmaValues={};drawVmaTest()});
  toolPanel.querySelectorAll("[data-vma-proto]").forEach(b =>
    b.onclick = () => { vmaProtocol = b.dataset.vmaProto; drawVmaTest(); });

  const refresh = () => {
    let ready = 0;
    toolPanel.querySelectorAll("[data-vma-input]").forEach(input => {
      const v = toolNumber(input.value);
      const out = toolPanel.querySelector(`[data-vma-out="${input.dataset.vmaInput}"]`);
      if (v == null) { out.textContent = "—"; return; }
      const vma = EpsTests.computeVma(vmaProtocol, v);
      out.textContent = `VMA : ${EpsTests.fr(vma, 1)} km/h · VO₂max ${EpsTests.fr(vma * 3.5, 0)}`;
      ready++;
    });
    const btn = document.getElementById("vmaSaveBtn");
    if (btn) btn.disabled = false;
  };
  toolPanel.querySelectorAll("[data-vma-input]").forEach(i => i.oninput = () => {vmaValues[i.dataset.vmaInput]=i.value;refresh()});
  refresh();

  const saveBtn = document.getElementById("vmaSaveBtn");
  if (saveBtn) saveBtn.onclick = ()=>saveVmaResults(false);
  const saveAs=document.getElementById('vmaSaveAsBtn');if(saveAs)saveAs.onclick=()=>saveVmaResults(true);
  const count=document.getElementById('vmaGroupCount');if(count)count.onchange=()=>{vmaGroupCount=+count.value;vmaActiveGroup=0;drawVmaTest()};
  toolPanel.querySelectorAll('[data-vma-group]').forEach(b=>b.onclick=()=>{vmaActiveGroup=+b.dataset.vmaGroup;drawVmaTest()});
  toolPanel.querySelectorAll('[data-vma-student-group]').forEach(s=>s.onchange=()=>{vmaGroupAssignments[s.dataset.vmaStudentGroup]=+s.value;drawVmaTest()});
  toolPanel.querySelectorAll('[data-vma-session]').forEach(b=>b.onclick=()=>openVmaSession(b.dataset.vmaSession));toolPanel.querySelectorAll('[data-vma-delete]').forEach(b=>b.onclick=()=>deleteVmaSession(b.dataset.vmaDelete));
}

async function saveVmaResults(asNew=false) {
  const rows = [];
  toolStudents.forEach(student => {
    const v = toolNumber(vmaValues[student.id]);
    rows.push({ studentId: student.id, input: v, value:v==null?0:EpsTests.computeVma(vmaProtocol, v),draft:v==null });
  });

  const cls = toolClasses.find(c => c.id === toolClassId);
  const sessionId = asNew||!vmaSessionId?crypto.randomUUID():vmaSessionId;
  const unite = vmaProtocol.includes("Cooper") ? "Distance (m)" : "Palier";
  try {
    const now=new Date().toISOString(),sessionRow=asNew||!vmaSessionRecord?{
      id: sessionId, user_id: session.user_id, class_id: toolClassId,
      period_number: epsTestPeriod, test_name: "Test VMA · " + vmaProtocol, created_at: Date.now(),
      class_label: cls ? cls.name : "", updated_at: now, deleted: false
    }:{...vmaSessionRecord,test_name:"Test VMA · "+vmaProtocol,updated_at:now,deleted:false};await enregistrerLigne('eps_test_sessions',sessionRow);const kept=new Set();for(const r of rows){const old=!asNew?vmaResultRecords[r.studentId]:null,id=old?.id||crypto.randomUUID();kept.add(String(id));await enregistrerLigne('eps_test_results',{
      ...(old||{}),id, user_id: old?.user_id||session.user_id, session_id: sessionId,
      student_id: r.studentId, input_value: r.input??0, result_value: r.value,
      input_unit: `group:${vmaGroupCount>1?(vmaGroupAssignments[r.studentId]||1):1}|${unite}`,
      result_unit:r.draft?"brouillon":"km/h VMA",
      updated_at: now, deleted: false
    })}if(!asNew)for(const old of Object.values(vmaResultRecords))if(!kept.has(String(old.id)))await enregistrerLigne('eps_test_results',{...old,deleted:true,updated_at:now});vmaSessionId=sessionId;vmaSessionRecord=sessionRow;await drawVmaTest();document.getElementById("vmaSaveMsg").textContent = `${rows.length} résultat(s) enregistré(s)${rows.length?'':' · brouillon'}.`;
  } catch (e) {
    document.getElementById("vmaSaveMsg").textContent = "Echec de l'enregistrement : " + e.message;
  }
}
async function openVmaSession(id){const saved=vmaSessions.find(s=>String(s.id)===String(id));if(!saved)return;vmaProtocol=String(saved.test_name||'').split(' · ')[1]||'VAMEVAL';const rows=await lireTable('eps_test_results',`eps_test_results?session_id=eq.${id}&deleted=eq.false&select=*`,{ou:r=>String(r.session_id)===String(id)&&!r.deleted});vmaSessionId=saved.id;vmaSessionRecord=saved;vmaResultRecords={};vmaValues={};vmaGroupAssignments={};vmaGroupCount=1;rows.forEach(r=>{vmaResultRecords[r.student_id]=r;vmaValues[r.student_id]=String(r.result_unit||'').includes('brouillon')?'':String(r.input_value??'');const g=+String(r.input_unit||'').match(/^group:(\d+)/)?.[1]||1;vmaGroupAssignments[r.student_id]=g;vmaGroupCount=Math.max(vmaGroupCount,g)});vmaActiveGroup=0;await drawVmaTest()}
async function deleteVmaSession(id){if(!confirm('Supprimer ce test VMA et ses résultats ?'))return;const saved=vmaSessions.find(s=>String(s.id)===String(id));if(saved)await enregistrerLigne('eps_test_sessions',{...saved,deleted:true,updated_at:new Date().toISOString()});if(String(vmaSessionId)===String(id)){vmaSessionId=null;vmaSessionRecord=null;vmaResultRecords={};vmaValues={}}await drawVmaTest()}

// ---- Savoir Nager (miroir de SwimCertificateScreen) ----
const swimValidations = {};

async function renderSwimCertificate() {
  await loadToolClasses();
  await loadToolStudents(toolClassId);
  drawSwimCertificate();
}

function drawSwimCertificate() {
  const cible = onRealClass() ? toolStudents : [{ id: FREE_USE, first_name: "Participant", last_name: "libre" }];

  toolPanel.innerHTML = toolHeader("Savoir Nager", "Valider les 10 etapes du parcours en securite")
    + toolRosterHtml()
    + cible.map(s => {
        const done = swimValidations[s.id] || [];
        const score = done.length;
        return `<div class="card">
          <strong>${studentLabel(s)}</strong>
          ${EpsTests.SWIM_STEPS.map((label, i) => `<label style="display:flex; gap:8px; align-items:center; font-weight:400; color:var(--text); margin:6px 0 0">
            <input type="checkbox" data-swim="${s.id}" data-step="${i}" ${done.includes(i) ? "checked" : ""} style="width:auto">
            ${i + 1}. ${label}
          </label>`).join("")}
          <div style="margin-top:8px; font-weight:700; color:${score === 10 ? "#2E8B57" : "#E67E22"}">
            ${score}/10 · ${score === 10 ? "Attestation validee" : "Parcours a completer"}
          </div>
        </div>`;
      }).join("")
    + `<button class="secondary" id="swimPrintBtn">Attestation (impression / PDF)</button>`;

  bindToolClose();
  bindToolRoster(drawSwimCertificate);
  toolPanel.querySelectorAll("[data-swim]").forEach(box => box.onchange = () => {
    const id = box.dataset.swim, step = Number(box.dataset.step);
    const done = swimValidations[id] || [];
    swimValidations[id] = box.checked ? [...done, step] : done.filter(x => x !== step);
    drawSwimCertificate();
  });
  document.getElementById("swimPrintBtn").onclick = () => window.print();
}

// ---- Aptitudes physiques 6e (miroir de Grade6AptitudesScreen) ----
const aptitudeValues = {};

async function renderAptitudes() {
  await loadToolClasses();
  await loadToolStudents(toolClassId);
  drawAptitudes();
}

function drawAptitudes() {
  const cible = onRealClass() ? toolStudents : [{ id: FREE_USE, first_name: "Participant", last_name: "libre" }];

  toolPanel.innerHTML = toolHeader("Aptitudes physiques 6e", "Sprint 30 m, endurance et saut sans elan")
    + toolRosterHtml()
    + `<div class="card" style="background:#FFF7E8"><div class="muted">Baremes : sprint satisfaisant &lt; 6,00 s · endurance satisfaisante palier ≥ 4 · saut satisfaisant &gt; 140 cm</div></div>`
    + cible.map(s => {
        const v = aptitudeValues[s.id] || {};
        return `<div class="card">
          <strong>${studentLabel(s)}</strong>
          <div class="row">
            <div><label>30 m (s)</label><input type="text" inputmode="decimal" data-apt="${s.id}" data-field="sprint" value="${v.sprint || ""}"></div>
            <div><label>Palier</label><input type="text" inputmode="decimal" data-apt="${s.id}" data-field="endurance" value="${v.endurance || ""}"></div>
            <div><label>Saut (cm)</label><input type="text" inputmode="decimal" data-apt="${s.id}" data-field="jump" value="${v.jump || ""}"></div>
          </div>
          <div style="margin-top:8px; color:var(--primary); font-weight:700" data-apt-out="${s.id}"></div>
        </div>`;
      }).join("");

  bindToolClose();
  bindToolRoster(drawAptitudes);

  const niveau = (champ, brut) => {
    const n = toolNumber(brut);
    return n == null ? "—" : EpsTests.APTITUDE_LEVELS[champ](n);
  };
  const refresh = () => {
    cible.forEach(s => {
      const v = aptitudeValues[s.id] || {};
      const out = toolPanel.querySelector(`[data-apt-out="${s.id}"]`);
      if (out) out.textContent = `Vitesse : ${niveau("sprint", v.sprint)} · Endurance : ${niveau("endurance", v.endurance)} · Force : ${niveau("jump", v.jump)}`;
    });
  };
  toolPanel.querySelectorAll("[data-apt]").forEach(input => input.oninput = () => {
    const id = input.dataset.apt;
    aptitudeValues[id] = Object.assign({}, aptitudeValues[id], { [input.dataset.field]: input.value });
    refresh();
  });
  refresh();
}

// ---- Marqueur d'impacts (miroir de ImpactMarkerScreen) ----
// Le terrain est dessine sur canvas ; chaque clic pose un impact, et le mode suppression
// retire le point le plus proche.
let impactSport = "Badminton";
let impactPoints = [];
let impactDeleteMode = false;

function renderImpactMarker() {
  toolPanel.innerHTML = toolHeader("Marqueur d'impacts", "Visualiser precisement les zones jouees")
    + `<div class="toolActions">${["Badminton", "Tennis", "Tennis de table"].map(s =>
        `<button class="${s === impactSport ? "" : "secondary"}" data-impact-sport="${s}">${s}</button>`).join("")}</div>
      <canvas id="impactCanvas" width="640" height="360" style="width:100%; margin-top:12px; border-radius:12px; cursor:crosshair; background:#EAF6E4"></canvas>
      <div class="toolActions" style="margin-top:10px">
        <button class="${impactDeleteMode ? "" : "secondary"}" id="impactDelete">${impactDeleteMode ? "Fin suppression" : "Supprimer un point"}</button>
        <button class="secondary" id="impactUndo">Annuler</button>
        <button class="secondary" id="impactClear">Effacer</button>
      </div>
      <div class="muted" id="impactCount" style="margin-top:8px"></div>`;

  bindToolClose();
  const canvas = document.getElementById("impactCanvas");
  const ctx = canvas.getContext("2d");

  const draw = () => {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#EAF6E4"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#428B55"; ctx.lineWidth = 5; ctx.strokeRect(0, 0, w, h);
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    if (impactSport !== "Badminton") {
      ctx.lineWidth = 2;
      [0.22, 0.78].forEach(x => { ctx.beginPath(); ctx.moveTo(w * x, 0); ctx.lineTo(w * x, h); ctx.stroke(); });
    }
    impactPoints.forEach(p => {
      ctx.fillStyle = "#FF7043"; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 3; ctx.stroke();
    });
    document.getElementById("impactCount").textContent =
      `${impactPoints.length} impact(s) · touchez le terrain pour ajouter un point`;
  };

  canvas.onclick = e => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    const y = (e.clientY - r.top) * (canvas.height / r.height);
    if (impactDeleteMode) {
      let best = -1, bestDist = Infinity;
      impactPoints.forEach((p, i) => {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      if (best >= 0 && bestDist < 45) impactPoints.splice(best, 1);
    } else {
      impactPoints.push({ x, y });
    }
    draw();
  };

  toolPanel.querySelectorAll("[data-impact-sport]").forEach(b =>
    b.onclick = () => { impactSport = b.dataset.impactSport; impactPoints = []; renderImpactMarker(); });
  document.getElementById("impactDelete").onclick = () => { impactDeleteMode = !impactDeleteMode; renderImpactMarker(); };
  document.getElementById("impactUndo").onclick = () => { impactPoints.pop(); draw(); };
  document.getElementById("impactClear").onclick = () => { impactPoints = []; draw(); };
  draw();
}

// ---- Vitesse, passages (miroir de SpeedTrackerScreen) ----
// Depart commun pour un groupe, un clic par eleve a son passage, puis la courbe des
// vitesses successives.
let speedGroups = {};
let speedGroupCount = 2;
let speedActiveGroup = 1;
let speedDistance = 30;
let speedRunning = false;
let speedStartedAt = 0;
let speedTimes = {};

async function renderSpeedTracker() {
  await loadToolClasses();
  await loadToolStudents(toolClassId);
  drawSpeedTracker();
}

function drawSpeedTracker() {
  const cible = onRealClass() ? toolStudents : [{ id: FREE_USE, first_name: "Participant", last_name: "libre" }];
  cible.forEach(s => { if (!speedGroups[s.id]) speedGroups[s.id] = 1; });
  const groupe = cible.filter(s => speedGroups[s.id] === speedActiveGroup);

  const chips = [];
  for (let g = 1; g <= speedGroupCount; g++) {
    chips.push(`<button class="periodChip${g === speedActiveGroup ? " active" : ""}" data-speed-group="${g}">Groupe ${g}</button>`);
  }

  toolPanel.innerHTML = toolHeader("Vitesse – passages", "Depart commun, releve individuel et courbe d'evolution")
    + toolRosterHtml()
    + `<div class="row">
        <div><label>Distance (m)</label><input type="number" id="speedDistance" value="${speedDistance}" min="1"></div>
        <div><label>Nombre de groupes</label><input type="number" id="speedGroupCount" value="${speedGroupCount}" min="1"></div>
      </div>
      <label>Repartir les eleves</label>
      ${cible.map(s => `<div class="top" style="padding:5px 0">
        <div>${studentLabel(s)}</div>
        <select data-speed-assign="${s.id}" style="width:auto">
          ${Array.from({ length: speedGroupCount }, (_, i) => i + 1).map(g =>
            `<option value="${g}"${speedGroups[s.id] === g ? " selected" : ""}>G${g}</option>`).join("")}
        </select>
      </div>`).join("")}
      <label>Groupe a chronometrer</label>
      <div class="periodBar" style="display:flex">${chips.join("")}</div>
      <button id="speedStartBtn" ${speedRunning ? "disabled" : ""}>Demarrer le groupe ${speedActiveGroup}</button>
      ${speedRunning ? `<div class="toolDisplay" id="speedClock">0.00 s</div>
        <div class="toolActions">${groupe.map(s => `<button data-speed-hit="${s.id}">${studentLabel(s)} · passage ${(speedTimes[s.id] || []).length + 1}</button>`).join("")}</div>
        <button class="secondary" id="speedStopBtn">Arreter</button>` : ""}
      <div id="speedResults" style="margin-top:12px"></div>`;

  bindToolClose();
  bindToolRoster(drawSpeedTracker);

  document.getElementById("speedDistance").onchange = e => { speedDistance = Math.max(1, +e.target.value || 30); drawSpeedTracker(); };
  document.getElementById("speedGroupCount").onchange = e => {
    speedGroupCount = Math.max(1, +e.target.value || 1);
    if (speedActiveGroup > speedGroupCount) speedActiveGroup = speedGroupCount;
    drawSpeedTracker();
  };
  toolPanel.querySelectorAll("[data-speed-assign]").forEach(sel =>
    sel.onchange = () => { speedGroups[sel.dataset.speedAssign] = Number(sel.value); drawSpeedTracker(); });
  toolPanel.querySelectorAll("[data-speed-group]").forEach(b =>
    b.onclick = () => { if (!speedRunning) { speedActiveGroup = Number(b.dataset.speedGroup); drawSpeedTracker(); } });

  document.getElementById("speedStartBtn").onclick = () => {
    speedRunning = true; speedStartedAt = performance.now();
    drawSpeedTracker();
    const tick = () => {
      if (!speedRunning) return;
      const el = document.getElementById("speedClock");
      if (el) el.textContent = ((performance.now() - speedStartedAt) / 1000).toFixed(2) + " s";
      requestAnimationFrame(tick);
    };
    tick();
  };
  const stop = document.getElementById("speedStopBtn");
  if (stop) stop.onclick = () => { speedRunning = false; drawSpeedTracker(); };

  toolPanel.querySelectorAll("[data-speed-hit]").forEach(b => b.onclick = () => {
    const id = b.dataset.speedHit;
    const seconds = (performance.now() - speedStartedAt) / 1000;
    (speedTimes[id] = speedTimes[id] || []).push(seconds);
    drawSpeedTracker();
  });

  drawSpeedResults(groupe);
}

function drawSpeedResults(groupe) {
  const host = document.getElementById("speedResults");
  const avecTemps = groupe.filter(s => (speedTimes[s.id] || []).length);
  if (!avecTemps.length) { host.innerHTML = ""; return; }

  host.innerHTML = `<h2 style="font-size:15px; margin:0 0 8px">Resultats du groupe</h2>`
    + avecTemps.map(s => {
        const temps = speedTimes[s.id];
        // Chaque passage part du depart commun : la duree du passage est l'ecart au
        // passage precedent, pas le temps absolu.
        const vitesses = temps.map((t, i) => {
          const duree = i === 0 ? t : t - temps[i - 1];
          return duree > 0 ? (speedDistance / duree) * 3.6 : 0;
        });
        return `<div class="card" style="padding:10px">
          <strong>${studentLabel(s)}</strong>
          <div class="muted">${vitesses.map((v, i) => `P${i + 1} : ${EpsTests.fr(v, 1)} km/h`).join(" · ")}</div>
          <canvas data-speed-chart="${s.id}" width="420" height="90" style="width:100%; margin-top:6px"></canvas>
        </div>`;
      }).join("")
    + `<button class="secondary" id="speedReset">Effacer les passages</button>`;

  document.getElementById("speedReset").onclick = () => { speedTimes = {}; drawSpeedTracker(); };

  avecTemps.forEach(s => {
    const canvas = host.querySelector(`[data-speed-chart="${s.id}"]`);
    const temps = speedTimes[s.id];
    const vitesses = temps.map((t, i) => {
      const duree = i === 0 ? t : t - temps[i - 1];
      return duree > 0 ? (speedDistance / duree) * 3.6 : 0;
    });
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height, pad = 8;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(...vitesses, 1);
    ctx.strokeStyle = "#087DCA"; ctx.lineWidth = 2; ctx.beginPath();
    vitesses.forEach((v, i) => {
      const x = pad + (vitesses.length === 1 ? (w - 2 * pad) / 2 : (i / (vitesses.length - 1)) * (w - 2 * pad));
      const y = h - pad - (v / max) * (h - 2 * pad);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#087DCA";
    vitesses.forEach((v, i) => {
      const x = pad + (vitesses.length === 1 ? (w - 2 * pad) / 2 : (i / (vitesses.length - 1)) * (w - 2 * pad));
      const y = h - pad - (v / max) * (h - 2 * pad);
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    });
  });
}

async function renderTeamsTool(){
  toolPanel.innerHTML=toolHeader("Équipes","Groupes et tirage au sort")+`<div class="muted">Chargement des classes...</div>`;bindToolClose();const classes=await lireTable("classes","classes?deleted=eq.false&select=*&order=name.asc",{trier:(a,b)=>String(a.name||"").localeCompare(String(b.name||""))});toolPanel.innerHTML=toolHeader("Équipes","Groupes et tirage au sort")+`<label>Classe</label><select id="teamClass"><option value="">Choisir...</option>${classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join("")}</select><label>Nombre d'équipes</label><input id="teamCount" type="number" min="2" value="2"><button id="generateTeams">Générer les équipes</button><div id="teamsResult"></div>`;bindToolClose();document.getElementById("generateTeams").onclick=async()=>{const id=document.getElementById("teamClass").value,n=Math.max(2,+document.getElementById("teamCount").value||2);if(!id)return;const students=await lireTable("students",`students?class_id=eq.${id}&deleted=eq.false&select=*&order=last_name.asc`,{ou:e=>e.class_id===id,trier:(a,b)=>String(a.last_name||"").localeCompare(String(b.last_name||""))});students.sort(()=>Math.random()-.5);const teams=Array.from({length:n},()=>[]);students.forEach((s,i)=>teams[i%n].push(s));document.getElementById("teamsResult").innerHTML=teams.map((team,i)=>`<div class="teamResult"><strong>Équipe ${i+1}</strong><div>${team.map(s=>`${s.last_name.toUpperCase()} ${s.first_name}`).join("<br>")}</div></div>`).join("");};
}
