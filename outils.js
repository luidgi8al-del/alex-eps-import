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
  toolPanel.style.display = "block";
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
  for (let p = 1; p <= periodCount; p++) {
    periods.push(`<button class="periodChip${p === epsTestPeriod ? " active" : ""}" data-eps-period="${p}">P${p}</button>`);
  }

  const categories = EpsTests.CATEGORIES.map(cat => {
    const open = epsOpenCategory === cat.name;
    const tests = cat.tests.map(key => {
      const test = EpsTests.TESTS[key];
      const testOpen = epsOpenTest === key;
      return `<div class="card" style="background:rgba(255,255,255,.82); margin-top:7px">
        <div class="top" style="cursor:pointer" data-eps-test="${key}">
          <strong>${test.label}</strong><span>${testOpen ? "▲" : "▼"}</span>
        </div>
        ${testOpen ? `<div id="epsTestBody" style="margin-top:10px"></div>` : ""}
      </div>`;
    }).join("");
    return `<div class="card" style="background:${cat.color}">
      <div class="top" style="cursor:pointer" data-eps-cat="${cat.name}">
        <div><strong>${cat.name}</strong><div class="muted">${cat.subtitle}</div></div>
        <span>${open ? "▲" : "▼"}</span>
      </div>
      ${open ? tests : ""}
    </div>`;
  }).join("");

  toolPanel.innerHTML = toolHeader("Tests EPS", "Calculs et protocoles terrain")
    + toolRosterHtml()
    + (onRealClass() ? `<label>Periode du test</label><div class="periodBar" style="display:flex">${periods.join("")}</div>` : "")
    + `<div class="ok" id="epsSaveMsg"></div>`
    + categories
    + `<div class="muted" style="margin-top:10px">Ces resultats sont des reperes pedagogiques. Ils ne generent pas automatiquement une note.</div>`;

  bindToolClose();
  bindToolRoster(drawEpsTests);
  toolPanel.querySelectorAll("[data-eps-period]").forEach(b =>
    b.onclick = () => { epsTestPeriod = Number(b.dataset.epsPeriod); drawEpsTests(); });
  toolPanel.querySelectorAll("[data-eps-cat]").forEach(b =>
    b.onclick = () => { epsOpenCategory = epsOpenCategory === b.dataset.epsCat ? null : b.dataset.epsCat; epsOpenTest = null; drawEpsTests(); });
  toolPanel.querySelectorAll("[data-eps-test]").forEach(b =>
    b.onclick = () => { epsOpenTest = epsOpenTest === b.dataset.epsTest ? null : b.dataset.epsTest; drawEpsTests(); });

  if (epsOpenTest) drawEpsTestBody(epsOpenTest);
}

function drawEpsTestBody(key) {
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

  host.innerHTML = `<div class="muted">${test.protocol}</div>
    <div style="color:var(--primary); font-weight:700; margin-top:8px">Classe entiere · ${toolStudents.length} eleves</div>
    ${toolStudents.map(s => `<div class="card" style="background:#F7FAFC; padding:10px">
      <strong>${studentLabel(s)}</strong>
      <div class="row" style="align-items:center">
        <div><label>${test.inputLabel}</label><input type="text" inputmode="decimal" data-eps-input="${s.id}"></div>
        <div style="color:var(--primary); font-weight:700; padding-top:22px" data-eps-out="${s.id}">—</div>
      </div>
    </div>`).join("")}
    <button id="epsSaveBtn">Enregistrer dans le recapitulatif</button>`;

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
  host.querySelectorAll("[data-eps-input]").forEach(i => i.oninput = refresh);
  refresh();
  document.getElementById("epsSaveBtn").onclick = () => saveEpsTest(key);
}

const stopCourseCounts = {};
function drawStopCourseTest(test) {
  const host=document.getElementById("epsTestBody");
  if(!onRealClass()){
    host.innerHTML=`<div class="muted">${test.protocol}</div><label>Nombre d’arrêts</label><input id="stopFree" type="number" min="0" value="0"><div class="ok" id="stopFreeOut">Note : 20 / 20</div>`;
    stopFree.oninput=()=>stopFreeOut.textContent=test.freeText(Math.max(0,+stopFree.value||0));return;
  }
  host.innerHTML=`<div class="test-protocol">${test.protocol}</div><div class="stop-student-list">${toolStudents.map(s=>{const n=stopCourseCounts[s.id]||0,r=test.compute(n);return `<button class="stop-student" data-stop-student="${s.id}"><span><b>${studentLabel(s)}</b><small>${n} arrêt${n>1?'s':''}</small></span><strong>${EpsTests.fr(r.value,1)} / 20</strong><i>+1</i></button>`}).join('')}</div><button id="stopSave">Enregistrer dans la classe</button>`;
  host.querySelectorAll('[data-stop-student]').forEach(b=>b.onclick=()=>{stopCourseCounts[b.dataset.stopStudent]=(stopCourseCounts[b.dataset.stopStudent]||0)+1;drawStopCourseTest(test)});
  stopSave.onclick=async()=>{const cls=toolClasses.find(c=>c.id===toolClassId),id=crypto.randomUUID(),now=new Date().toISOString(),rows=toolStudents.map(s=>{const n=stopCourseCounts[s.id]||0;return{id:crypto.randomUUID(),user_id:session.user_id,session_id:id,student_id:s.id,input_value:n,result_value:test.compute(n).value,input_unit:'Arrêts',result_unit:'/20',updated_at:now,deleted:false}});await enregistrerSeanceDeTest({id,user_id:session.user_id,class_id:toolClassId,period_number:epsTestPeriod,test_name:test.label,created_at:Date.now(),class_label:cls?.name||'',updated_at:now,deleted:false},rows);epsOpenTest=null;drawEpsTests()};
}

let runningDistance=500,runningCount=3,runningSessionId=null,runningCreatedAt=null,runningSessionRecord=null;
let runningSessions=[],runningResultRecords={},runningExpandedStudent=null;
let runningGroups=[],runningActiveGroup=-1,runningManageGroups=false,runningEditingGroup=null,runningGroupSelection=new Set();
const RUNNING_REMOVED='__REMOVED__';
const runningValues={};
function compactRunningSeconds(raw){const clean=String(raw||'').replace(/\D/g,'');if(!clean)return null;const n=+clean,m=Math.floor(n/100),s=n%100;return s<60?m*60+s:null}
function runningRegularity(total){if(total<=2)return 6;if(total<=4)return 5.7;if(total<=6)return 5.4;if(total<=8)return 5.1;if(total<=10)return 4.8;if(total===11)return 4.5;if(total>25)return 0;return Math.max(0,4.2-(total-12)*.3)}
const runningGirls=[270,255,240,226,214,202,190,180,170,164,156,148,140,137,135,133,131,128,125,122,120,118,116,114,112];
const runningBoys=[240,230,214,200,188,174,162,152,140,133,125,118,112,110,109,108,107,106,104,102,100,98,95,92,89];
function runningPerformance(avg,sex){const cuts=String(sex||'').toUpperCase().includes('F')?runningGirls:String(sex||'').toUpperCase().includes('G')?runningBoys:null;if(!cuts)return null;const equivalent=runningDistance===250?avg*2:avg;let score=0;cuts.forEach((c,i)=>{if(equivalent<=c)score=i*.25});return Math.min(6,score)}
function runningSummary(s){const raw=runningValues[s.id]||Array(runningCount).fill(''),valid=raw.filter(v=>v!==RUNNING_REMOVED).map(compactRunningSeconds).filter(v=>v!=null);if(!valid.length)return null;const avg=valid.reduce((a,b)=>a+b,0)/valid.length,gaps=valid.slice(1).map((v,i)=>Math.abs(v-valid[i])),reg=valid.length>1?runningRegularity(gaps.reduce((a,b)=>a+b,0)):null,perf=runningPerformance(avg,s.sex),total=perf==null?null:(reg==null?perf:reg+perf);return{raw,valid,avg,gaps,reg,perf,total}}
function runningTimeLabel(avg){return `${Math.floor(avg/60)}:${String(Math.round(avg)%60).padStart(2,'0')}`}
function resetRunningSession(){runningSessionId=null;runningCreatedAt=null;runningSessionRecord=null;runningResultRecords={};runningExpandedStudent=null;runningGroups=[];runningActiveGroup=-1;runningManageGroups=false;runningEditingGroup=null;runningGroupSelection=new Set();Object.keys(runningValues).forEach(k=>delete runningValues[k]);toolStudents.forEach(s=>runningValues[s.id]=Array(runningCount).fill(''))}
async function loadRunningSessions(){if(!onRealClass()){runningSessions=[];return}const all=await lireTable('eps_test_sessions',`eps_test_sessions?class_id=eq.${toolClassId}&period_number=eq.${epsTestPeriod}&test_name=eq.${encodeURIComponent('3 × 500 m')}&deleted=eq.false&select=*&order=created_at.desc`,{ou:r=>String(r.class_id)===String(toolClassId)&&+r.period_number===+epsTestPeriod&&r.test_name==='3 × 500 m'&&!r.deleted,trier:(a,b)=>(b.created_at||0)-(a.created_at||0)});runningSessions=all}
async function openRunningSession(id,test){const saved=runningSessions.find(s=>String(s.id)===String(id));if(!saved)return;const rows=await lireTable('eps_test_results',`eps_test_results?session_id=eq.${id}&deleted=eq.false&select=*`,{ou:r=>String(r.session_id)===String(id)&&!r.deleted});runningSessionId=saved.id;runningCreatedAt=saved.created_at;runningSessionRecord=saved;runningResultRecords={};runningGroups=[];runningActiveGroup=-1;runningManageGroups=false;Object.keys(runningValues).forEach(k=>delete runningValues[k]);const first=rows[0]?.input_unit||'',parts=first.split(':');if(parts[0]==='runs'){runningDistance=+parts[1]||500;runningCount=Math.max(1,Math.min(10,+parts[2]||3))}toolStudents.forEach(s=>runningValues[s.id]=Array(runningCount).fill(''));const groupMap=new Map();rows.forEach(r=>{runningResultRecords[r.student_id]=r;const unit=String(r.input_unit||''),times=unit.split(':times:')[1],group=+unit.split(':group:')[1]?.split(':')[0];if(times!=null)runningValues[r.student_id]=times.split('|').slice(0,runningCount).concat(Array(runningCount).fill('')).slice(0,runningCount);if(Number.isInteger(group)&&group>=0){if(!groupMap.has(group))groupMap.set(group,[]);groupMap.get(group).push(String(r.student_id))}});runningGroups=[...groupMap.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]);if(runningGroups.length)runningActiveGroup=0;paintRunningSeriesTest(test)}
function bindRunningLongPress(nodes,handler){nodes.forEach(node=>{let timer=null,startX=0,startY=0;const cancel=()=>{clearTimeout(timer);timer=null};node.addEventListener('pointerdown',e=>{startX=e.clientX;startY=e.clientY;timer=setTimeout(()=>{timer=null;handler(node)},650)});node.addEventListener('pointermove',e=>{if(Math.abs(e.clientX-startX)>12||Math.abs(e.clientY-startY)>12)cancel()});node.addEventListener('pointerup',cancel);node.addEventListener('pointercancel',cancel);node.addEventListener('contextmenu',e=>{e.preventDefault();handler(node)})})}
async function drawRunningSeriesTest(test){const host=document.getElementById('epsTestBody');if(!onRealClass()){host.innerHTML='<div class="muted">Choisissez une classe pour enregistrer cette épreuve.</div>';return}await loadRunningSessions();if(!runningSessionId&&!Object.keys(runningValues).length)resetRunningSession();paintRunningSeriesTest(test)}
function paintRunningSeriesTest(test){
  const host=document.getElementById('epsTestBody');if(!host)return;toolStudents.forEach(s=>{const old=runningValues[s.id]||[];runningValues[s.id]=old.slice(0,runningCount).concat(Array(Math.max(0,runningCount-old.length)).fill(''))});
  const displayedStudents=runningActiveGroup>=0?(runningGroups[runningActiveGroup]||[]).map(id=>toolStudents.find(s=>String(s.id)===String(id))).filter(Boolean):toolStudents;
  const sessions=runningSessions.map(s=>`<button class="running-session-card${String(s.id)===String(runningSessionId)?' active':''}" data-running-session="${s.id}"><b>3 × 500 m · P${s.period_number}</b><small>${new Date(s.created_at).toLocaleString('fr-FR')}</small></button>`).join('');
  const groupTabs=`<div class="running-group-tabs"><button class="${runningActiveGroup<0?'':'secondary'}" data-running-group="-1">Sans groupe · ordre alphabétique</button>${runningGroups.map((g,i)=>`<button class="${runningActiveGroup===i?'':'secondary'}" data-running-group="${i}">Groupe ${i+1} · ${g.length}</button>`).join('')}<button class="secondary" id="runningManageGroups">${runningGroups.length?'Modifier les groupes':'Constituer des groupes'}</button></div>`;
  const unavailable=new Set(runningGroups.flatMap((g,i)=>i===runningEditingGroup?[]:g));
  const groupEditor=runningManageGroups?`<section class="running-group-editor"><div class="top"><div><b>${runningEditingGroup==null?`Créer le groupe ${runningGroups.length+1}`:`Modifier le groupe ${runningEditingGroup+1}`}</b><small>Cochez les élèves puis enregistrez la composition.</small></div><button class="secondary" id="runningCloseGroups">Fermer</button></div><div class="running-group-students">${toolStudents.filter(s=>!unavailable.has(String(s.id))).map(s=>`<label class="${runningGroupSelection.has(String(s.id))?'selected':''}"><input type="checkbox" data-running-group-student="${s.id}" ${runningGroupSelection.has(String(s.id))?'checked':''}><span>${studentLabel(s)}</span></label>`).join('')}</div><div class="running-group-actions"><button id="runningSaveGroup" ${runningGroupSelection.size?'':'disabled'}>${runningEditingGroup==null?'Créer le groupe':'Enregistrer les modifications'}</button>${runningEditingGroup!=null?'<button class="danger" id="runningDeleteGroup">Supprimer ce groupe</button>':''}</div><div class="running-existing-groups">${runningGroups.map((g,i)=>`<button class="secondary" data-running-edit-group="${i}">Groupe ${i+1} · ${g.length} élève(s)</button>`).join('')}</div></section>`:'';
  const heads=Array.from({length:runningCount},(_,i)=>`<th data-run-column="${i}">${runningDistance} m · ${i+1}<small>Appui prolongé pour supprimer</small></th>`).join('');
  const rows=displayedStudents.map(s=>{const summary=runningSummary(s),values=runningValues[s.id];return `<tr><th class="running-sticky"><button class="running-name" data-run-name="${s.id}"><b>${studentLabel(s)}</b><small>Note : ${summary?.total!=null?EpsTests.fr(summary.total,2):'—'}</small></button></th>${values.map((v,i)=>`<td>${v===RUNNING_REMOVED?`<button class="running-removed" data-run-student="${s.id}" data-run-index="${i}">Retirée</button>`:`<input inputmode="numeric" maxlength="3" placeholder="315" data-run-student="${s.id}" data-run-index="${i}" value="${v}">`}</td>`).join('')}</tr>`}).join('');
  const detailStudent=toolStudents.find(s=>String(s.id)===String(runningExpandedStudent)),detail=detailStudent?runningSummary(detailStudent):null;
  host.innerHTML=`<details class="test-protocol"><summary>Protocole du test</summary><p>${test.protocol}</p></details><div class="running-settings"><label>Format<select id="runDistance"><option value="500" ${runningDistance===500?'selected':''}>500 m</option><option value="250" ${runningDistance===250?'selected':''}>250 m</option></select></label><label>Nombre de courses<select id="runCount">${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${runningCount===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label></div>${groupTabs}${groupEditor}<div class="running-session-toolbar"><button class="secondary" id="runningBlank">＋ Nouvelle saisie</button><div class="running-session-list">${sessions||'<span class="muted">Aucune session enregistrée</span>'}</div></div><div class="running-grid-wrap"><table class="running-grid"><thead><tr><th class="running-sticky">Nom et prénom</th>${heads}</tr></thead><tbody>${rows}</tbody></table></div>${detailStudent?`<div class="running-result"><b>${studentLabel(detailStudent)}</b>${detail?`<span>Moyenne de ${detail.valid.length} course(s) : ${runningTimeLabel(detail.avg)} · Régularité ${detail.reg==null?'—':EpsTests.fr(detail.reg,1)}/6 · Performance ${detail.perf==null?'sexe non renseigné':EpsTests.fr(detail.perf,2)+'/6'}</span>`:'<span>Renseignez au moins un temps.</span>'}</div>`:''}<div class="running-save-actions"><button id="runningSave">${runningSessionId?'Enregistrer les modifications':'Enregistrer la session'}</button><button class="secondary" id="runningSaveAs">Enregistrer comme nouvelle session</button></div><div class="running-export-actions"><button class="secondary" id="runningExcel">▦ Excel</button><button class="secondary" id="runningPdf">▤ PDF</button></div><div id="runningMsg" class="ok"></div>`;
  runDistance.onchange=()=>{runningDistance=+runDistance.value;paintRunningSeriesTest(test)};runCount.onchange=()=>{runningCount=+runCount.value;paintRunningSeriesTest(test)};runningBlank.onclick=()=>{resetRunningSession();paintRunningSeriesTest(test)};
  host.querySelectorAll('[data-running-group]').forEach(b=>b.onclick=()=>{runningActiveGroup=+b.dataset.runningGroup;runningManageGroups=false;runningExpandedStudent=null;paintRunningSeriesTest(test)});
  document.getElementById('runningManageGroups').onclick=()=>{runningManageGroups=true;runningEditingGroup=null;runningGroupSelection=new Set();paintRunningSeriesTest(test)};
  if(runningManageGroups){document.getElementById('runningCloseGroups').onclick=()=>{runningManageGroups=false;paintRunningSeriesTest(test)};host.querySelectorAll('[data-running-group-student]').forEach(box=>box.onchange=()=>{if(box.checked)runningGroupSelection.add(String(box.dataset.runningGroupStudent));else runningGroupSelection.delete(String(box.dataset.runningGroupStudent));paintRunningSeriesTest(test)});host.querySelectorAll('[data-running-edit-group]').forEach(b=>b.onclick=()=>{runningEditingGroup=+b.dataset.runningEditGroup;runningGroupSelection=new Set(runningGroups[runningEditingGroup]||[]);paintRunningSeriesTest(test)});document.getElementById('runningSaveGroup').onclick=()=>{const ids=[...runningGroupSelection];if(!ids.length)return;if(runningEditingGroup==null)runningGroups.push(ids);else runningGroups[runningEditingGroup]=ids;runningActiveGroup=runningEditingGroup==null?runningGroups.length-1:runningEditingGroup;runningManageGroups=false;runningEditingGroup=null;runningGroupSelection=new Set();paintRunningSeriesTest(test)};const deleteGroup=document.getElementById('runningDeleteGroup');if(deleteGroup)deleteGroup.onclick=()=>{if(!confirm(`Supprimer le groupe ${runningEditingGroup+1} ? Les temps saisis restent conservés.`))return;runningGroups.splice(runningEditingGroup,1);runningActiveGroup=runningGroups.length?Math.min(runningEditingGroup,runningGroups.length-1):-1;runningManageGroups=false;runningEditingGroup=null;runningGroupSelection=new Set();paintRunningSeriesTest(test)}}
  host.querySelectorAll('[data-running-session]').forEach(b=>b.onclick=()=>openRunningSession(b.dataset.runningSession,test));host.querySelectorAll('[data-run-name]').forEach(b=>b.onclick=()=>{runningExpandedStudent=runningExpandedStudent===b.dataset.runName?null:b.dataset.runName;paintRunningSeriesTest(test)});
  host.querySelectorAll('input[data-run-student]').forEach(input=>{input.oninput=()=>{const clean=input.value.replace(/\D/g,'').slice(0,3);input.value=clean;runningValues[input.dataset.runStudent][+input.dataset.runIndex]=clean};input.onchange=()=>paintRunningSeriesTest(test)});
  bindRunningLongPress(host.querySelectorAll('[data-run-column]'),node=>{const index=+node.dataset.runColumn;if(runningCount<=1||!confirm(`Supprimer la course ${index+1} pour tous les élèves ?`))return;toolStudents.forEach(s=>runningValues[s.id].splice(index,1));runningCount--;paintRunningSeriesTest(test)});
  bindRunningLongPress(host.querySelectorAll('[data-run-student]'),node=>{const student=toolStudents.find(s=>String(s.id)===String(node.dataset.runStudent)),index=+node.dataset.runIndex,current=runningValues[node.dataset.runStudent][index],restore=current===RUNNING_REMOVED;if(!confirm(restore?`Restaurer la course ${index+1} de ${studentLabel(student)} ?`:`Retirer uniquement la course ${index+1} de ${studentLabel(student)} ?`))return;runningValues[node.dataset.runStudent][index]=restore?'':RUNNING_REMOVED;paintRunningSeriesTest(test)});
  runningSave.onclick=()=>saveRunningSeries(test,false);runningSaveAs.onclick=()=>saveRunningSeries(test,true);runningExcel.onclick=exportRunningCsv;runningPdf.onclick=printRunningPdf;
}
async function saveRunningSeries(test,asNew){const cls=toolClasses.find(c=>c.id===toolClassId),id=asNew||!runningSessionId?crypto.randomUUID():runningSessionId,now=new Date().toISOString(),created=asNew||!runningCreatedAt?Date.now():runningCreatedAt;const selected=toolStudents.map(s=>[s,runningSummary(s),runningValues[s.id],runningGroups.findIndex(g=>g.includes(String(s.id)))]).filter(([,r,raw,group])=>r||raw.some(v=>v===RUNNING_REMOVED)||group>=0);const sessionRow=asNew||!runningSessionRecord?{id,user_id:session.user_id,class_id:toolClassId,period_number:epsTestPeriod,test_name:test.label,created_at:created,class_label:cls?.name||'',updated_at:now,deleted:false}:{...runningSessionRecord,updated_at:now,deleted:false};await enregistrerLigne('eps_test_sessions',sessionRow);const kept=new Set();for(const [s,r,raw,group] of selected){const old=!asNew?runningResultRecords[s.id]:null,resultId=old?.id||crypto.randomUUID();kept.add(String(resultId));const valid=r?.valid||[],active=raw.filter(v=>v!==RUNNING_REMOVED).length;await enregistrerLigne('eps_test_results',{...(old||{}),id:resultId,user_id:old?.user_id||session.user_id,session_id:id,student_id:s.id,input_value:r?.avg||0,result_value:r?.total||0,input_unit:`runs:${runningDistance}:${runningCount}:group:${group}:times:${raw.join('|')}`,result_unit:`${valid.length>1?'/12':'/6'}${valid.length<active?' · en cours':''}`,updated_at:now,deleted:false})}if(!asNew)for(const old of Object.values(runningResultRecords))if(!kept.has(String(old.id)))await enregistrerLigne('eps_test_results',{...old,deleted:true,updated_at:now});runningSessionId=id;runningCreatedAt=created;runningSessionRecord=sessionRow;await loadRunningSessions();await openRunningSession(id,test);const msg=document.getElementById('runningMsg');if(msg)msg.textContent=asNew?'Nouvelle session enregistrée.':'Session mise à jour.'}
async function ouvrirSessionTrois500DepuisClasse(sessionId,classId,period){showTab('outils');toolClassId=classId;epsTestPeriod=+period||1;epsOpenCategory='Athle';epsOpenTest='TROIS_500';runningSessionId=null;Object.keys(runningValues).forEach(k=>delete runningValues[k]);await renderEpsTests();await loadRunningSessions();await openRunningSession(sessionId,EpsTests.TESTS.TROIS_500);document.getElementById('epsTestBody')?.scrollIntoView({behavior:'smooth',block:'start'})}
function runningExportData(){return toolStudents.map(s=>({student:s,summary:runningSummary(s)})).filter(x=>x.summary)}
function exportRunningCsv(){const headers=['Nom','Prénom',...Array.from({length:runningCount},(_,i)=>`Course ${i+1}`),'Moyenne','Écarts','Régularité /6','Performance /6',`Note /${runningCount>1?12:6}`],rows=runningExportData().map(({student:s,summary:r})=>[s.last_name,s.first_name,...r.raw.map(v=>v===RUNNING_REMOVED?'Retirée':v),`${Math.floor(r.avg/60)}:${String(Math.round(r.avg)%60).padStart(2,'0')}`,r.gaps.join(' + '),r.reg??'',r.perf??'',r.total??'']);const csv='\ufeff'+[headers,...rows].map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`resultats-${runningCount}x${runningDistance}m-P${epsTestPeriod}.csv`;a.click();URL.revokeObjectURL(a.href)}
function printRunningPdf(){const rows=runningExportData(),w=open('','_blank');if(!w)return alert('Autorisez les fenêtres surgissantes.');w.document.write(`<html><head><title>Résultats ${runningCount} × ${runningDistance} m</title><style>body{font:12px Arial;color:#173a57;padding:24px}h1{color:#087dca}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cad8e3;padding:6px;text-align:center}th:first-child,td:first-child{text-align:left}@media print{button{display:none}}</style></head><body><h1>${runningCount} × ${runningDistance} m · ${toolClasses.find(c=>c.id===toolClassId)?.name||''}</h1><table><tr><th>Élève</th>${Array.from({length:runningCount},(_,i)=>`<th>C${i+1}</th>`).join('')}<th>Moyenne</th><th>Régularité</th><th>Performance</th><th>Note</th></tr>${rows.map(({student:s,summary:r})=>`<tr><td>${studentLabel(s)}</td>${r.raw.map(v=>`<td>${v===RUNNING_REMOVED?'Retirée':v}</td>`).join('')}<td>${Math.floor(r.avg/60)}:${String(Math.round(r.avg)%60).padStart(2,'0')}</td><td>${r.reg??'—'}</td><td>${r.perf??'—'}</td><td>${r.total??'—'} / ${r.valid.length>1?12:6}</td></tr>`).join('')}</table><button onclick="print()">Enregistrer / imprimer en PDF</button></body></html>`);w.document.close()}

async function saveEpsTest(key) {
  const test = EpsTests.TESTS[key];
  const host = document.getElementById("epsTestBody");
  const rows = [];
  host.querySelectorAll("[data-eps-input]").forEach(input => {
    const v = toolNumber(input.value);
    if (v == null) return;
    const r = test.compute(v);
    rows.push({ studentId: input.dataset.epsInput, input: v, value: r.value, unit: r.unit });
  });
  if (!rows.length) return;

  const cls = toolClasses.find(c => c.id === toolClassId);
  const sessionId = crypto.randomUUID();
  try {
    await enregistrerSeanceDeTest({
      id: sessionId, user_id: session.user_id, class_id: toolClassId,
      period_number: epsTestPeriod, test_name: test.label, created_at: Date.now(),
      class_label: cls ? cls.name : "", updated_at: new Date().toISOString(), deleted: false
    }, rows.map(r => ({
      id: crypto.randomUUID(), user_id: session.user_id, session_id: sessionId,
      student_id: r.studentId, input_value: r.input, result_value: r.value,
      input_unit: test.inputLabel, result_unit: r.unit,
      updated_at: new Date().toISOString(), deleted: false
    })));
    document.getElementById("epsSaveMsg").textContent =
      `${test.label} enregistre pour ${rows.length} eleve(s) · P${epsTestPeriod}`;
    epsOpenTest = null;
    drawEpsTests();
  } catch (e) {
    document.getElementById("epsSaveMsg").textContent = "Echec de l'enregistrement : " + e.message;
  }
}

// ---- Tests VMA (miroir de VmaTestScreen) ----
let vmaProtocol = "VAMEVAL";

async function renderVmaTest() {
  await loadToolClasses();
  await loadToolStudents(toolClassId);
  drawVmaTest();
}

function drawVmaTest() {
  const proto = EpsTests.VMA_PROTOCOLS.find(p => p.key === vmaProtocol);
  const cible = onRealClass() ? toolStudents : [{ id: FREE_USE, first_name: "Participant", last_name: "libre" }];

  toolPanel.innerHTML = toolHeader("Tests VMA", "VAMEVAL, Leger-Boucher, Cooper et demi-Cooper")
    + toolRosterHtml()
    + `<div class="toolActions" style="margin-top:10px">${EpsTests.VMA_PROTOCOLS.map(p =>
        `<button class="${p.key === vmaProtocol ? "" : "secondary"}" data-vma-proto="${p.key}">${p.label}</button>`).join("")}</div>
      <div class="card" style="background:#F2F8FF"><strong>${proto.label}</strong><div class="muted">${proto.hint}</div></div>
      ${cible.map(s => `<div class="card" style="padding:10px">
        <strong>${studentLabel(s)}</strong>
        <div class="row" style="align-items:center">
          <div><label>${vmaProtocol.includes("Cooper") ? "Distance (m)" : "Palier"}</label>
            <input type="text" inputmode="decimal" data-vma-input="${s.id}"></div>
          <div style="color:var(--primary); font-weight:700; padding-top:22px" data-vma-out="${s.id}">—</div>
        </div>
      </div>`).join("")}
      ${onRealClass() ? `<button id="vmaSaveBtn" disabled>Enregistrer les resultats</button>` : ""}
      <div class="ok" id="vmaSaveMsg"></div>`;

  bindToolClose();
  bindToolRoster(drawVmaTest);
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
    if (btn) btn.disabled = ready === 0;
  };
  toolPanel.querySelectorAll("[data-vma-input]").forEach(i => i.oninput = refresh);
  refresh();

  const saveBtn = document.getElementById("vmaSaveBtn");
  if (saveBtn) saveBtn.onclick = saveVmaResults;
}

async function saveVmaResults() {
  const rows = [];
  toolPanel.querySelectorAll("[data-vma-input]").forEach(input => {
    const v = toolNumber(input.value);
    if (v == null) return;
    rows.push({ studentId: input.dataset.vmaInput, input: v, value: EpsTests.computeVma(vmaProtocol, v) });
  });
  if (!rows.length) return;

  const cls = toolClasses.find(c => c.id === toolClassId);
  const sessionId = crypto.randomUUID();
  const unite = vmaProtocol.includes("Cooper") ? "Distance (m)" : "Palier";
  try {
    await enregistrerSeanceDeTest({
      id: sessionId, user_id: session.user_id, class_id: toolClassId,
      period_number: epsTestPeriod, test_name: "Test VMA · " + vmaProtocol, created_at: Date.now(),
      class_label: cls ? cls.name : "", updated_at: new Date().toISOString(), deleted: false
    }, rows.map(r => ({
      id: crypto.randomUUID(), user_id: session.user_id, session_id: sessionId,
      student_id: r.studentId, input_value: r.input, result_value: r.value,
      input_unit: unite, result_unit: "km/h VMA",
      updated_at: new Date().toISOString(), deleted: false
    })));
    document.getElementById("vmaSaveMsg").textContent = `${rows.length} resultat(s) enregistre(s).`;
  } catch (e) {
    document.getElementById("vmaSaveMsg").textContent = "Echec de l'enregistrement : " + e.message;
  }
}

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
