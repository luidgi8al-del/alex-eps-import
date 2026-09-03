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
  toolPanel.scrollIntoView({behavior:"smooth", block:"start"});
}
document.querySelectorAll("#tab-outils [data-tool]").forEach(button => button.addEventListener("click", () => openTool(button.dataset.tool)));

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
// ---- Selection classe / eleves partagee par les outils (miroir de ToolRoster) ----
// Chaque outil marche soit sur une classe reelle, soit en "usage libre" quand on veut
// juste le calculateur sans rattacher les resultats a des eleves.
const FREE_USE = "__libre__";
let toolClasses = [];
let toolStudents = [];
let toolClassId = FREE_USE;

async function loadToolClasses() {
  if (toolClasses.length) return toolClasses;
  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/classes?deleted=eq.false&select=id,name,grade&order=name.asc`);
  toolClasses = res.ok ? await res.json() : [];
  return toolClasses;
}

async function loadToolStudents(classId) {
  if (!classId || classId === FREE_USE) { toolStudents = []; return toolStudents; }
  const res = await apiFetch(`${SUPABASE_URL}/rest/v1/students?class_id=eq.${classId}&deleted=eq.false&select=id,first_name,last_name&order=last_name.asc`);
  toolStudents = res.ok ? await res.json() : [];
  return toolStudents;
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
    await apiFetch(`${SUPABASE_URL}/rest/v1/eps_test_sessions`, {
      method: "POST",
      body: JSON.stringify({
        id: sessionId, user_id: session.user_id, class_id: toolClassId,
        period_number: epsTestPeriod, test_name: test.label, created_at: Date.now(),
        class_label: cls ? cls.name : "", updated_at: new Date().toISOString(), deleted: false
      })
    });
    await apiFetch(`${SUPABASE_URL}/rest/v1/eps_test_results`, {
      method: "POST",
      body: JSON.stringify(rows.map(r => ({
        id: crypto.randomUUID(), user_id: session.user_id, session_id: sessionId,
        student_id: r.studentId, input_value: r.input, result_value: r.value,
        input_unit: test.inputLabel, result_unit: r.unit,
        updated_at: new Date().toISOString(), deleted: false
      })))
    });
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
    await apiFetch(`${SUPABASE_URL}/rest/v1/eps_test_sessions`, {
      method: "POST",
      body: JSON.stringify({
        id: sessionId, user_id: session.user_id, class_id: toolClassId,
        period_number: epsTestPeriod, test_name: "Test VMA · " + vmaProtocol, created_at: Date.now(),
        class_label: cls ? cls.name : "", updated_at: new Date().toISOString(), deleted: false
      })
    });
    await apiFetch(`${SUPABASE_URL}/rest/v1/eps_test_results`, {
      method: "POST",
      body: JSON.stringify(rows.map(r => ({
        id: crypto.randomUUID(), user_id: session.user_id, session_id: sessionId,
        student_id: r.studentId, input_value: r.input, result_value: r.value,
        input_unit: unite, result_unit: "km/h VMA",
        updated_at: new Date().toISOString(), deleted: false
      })))
    });
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
  toolPanel.innerHTML=toolHeader("Équipes","Groupes et tirage au sort")+`<div class="muted">Chargement des classes...</div>`;bindToolClose();const res=await apiFetch(`${SUPABASE_URL}/rest/v1/classes?deleted=eq.false&select=*&order=name.asc`),classes=res.ok?await res.json():[];toolPanel.innerHTML=toolHeader("Équipes","Groupes et tirage au sort")+`<label>Classe</label><select id="teamClass"><option value="">Choisir...</option>${classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join("")}</select><label>Nombre d'équipes</label><input id="teamCount" type="number" min="2" value="2"><button id="generateTeams">Générer les équipes</button><div id="teamsResult"></div>`;bindToolClose();document.getElementById("generateTeams").onclick=async()=>{const id=document.getElementById("teamClass").value,n=Math.max(2,+document.getElementById("teamCount").value||2);if(!id)return;const r=await apiFetch(`${SUPABASE_URL}/rest/v1/students?class_id=eq.${id}&deleted=eq.false&select=*&order=last_name.asc`),students=r.ok?await r.json():[];students.sort(()=>Math.random()-.5);const teams=Array.from({length:n},()=>[]);students.forEach((s,i)=>teams[i%n].push(s));document.getElementById("teamsResult").innerHTML=teams.map((team,i)=>`<div class="teamResult"><strong>Équipe ${i+1}</strong><div>${team.map(s=>`${s.last_name.toUpperCase()} ${s.first_name}`).join("<br>")}</div></div>`).join("");};
}
