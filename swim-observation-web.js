/* Natation - Observation par groupes de niveau — version grand ecran, compatible avec l'application. */
(function(){
  const TEST_NAME="Observation Natation";
  const DEFAULT_INDICATORS=["Brasse bras","Brasse jambes","Crawl bras","Crawl jambes","Plongeon","Apnée"];
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fr=(v,d=1)=>Number(v).toFixed(d).replace(".",",");
  const empty=()=>({group:"",validated:{}});
  // Deux notations possibles par indicateur : une case cochee (note), ou quatre niveaux de
  // couleur (couleur) - plus lisibles en 6e, ou ce reglage s'applique par defaut. "validated"
  // porte soit un booleen (note), soit un code couleur (couleur) selon state.mode au moment de
  // l'enregistrement ; le mode utilise est garde avec chaque test pour rouvrir a l'identique.
  const COULEUR_NIVEAUX=[["vert-plus","Vert +","#0e9f5f",1],["vert","Vert","#4caf50",0.75],["orange","Orange","#f39c12",0.5],["rouge","Rouge","#e74c3c",0.25]];
  const COULEUR_PAR_CODE=Object.fromEntries(COULEUR_NIVEAUX.map(([code,label,color,valeur])=>[code,{label,color,valeur}]));
  function encode(v){return "natation:"+JSON.stringify({version:2,mode:state.mode,group:v.group||"",validated:v.validated||{}})}
  function decode(raw){
    try{
      const parsed=JSON.parse(String(raw||"").replace(/^natation:/,""));
      let validated={};
      if(Array.isArray(parsed.validated))parsed.validated.forEach(l=>validated[l]=true);
      else if(parsed.validated&&typeof parsed.validated==="object")validated={...parsed.validated};
      return {group:parsed.group||"",validated,mode:parsed.mode||"note"};
    }catch{return {...empty(),mode:"note"}}
  }
  function valeurIndicateur(val){if(state.mode==="couleur")return val?(COULEUR_PAR_CODE[val]?.valeur||0):0;return val?1:0}
  const scoreEleve=v=>state.indicators.reduce((s,label)=>s+valeurIndicateur((v?.validated||{})[label]),0);
  const state={classId:"",period:1,indicators:[...DEFAULT_INDICATORS],values:{},activeGroup:"",mode:"note",sessionId:null,resultIds:{},createdAt:null,saved:[],busy:false,
    // Les groupes de niveau etaient un passage oblige : on ne pouvait pas observer une classe
    // entiere sans en constituer au moins un. Ils redeviennent un choix.
    groupesActifs:false};
  async function loadSaved(){try{const all=await lireTable("eps_test_sessions",`eps_test_sessions?deleted=eq.false&test_name=eq.${encodeURIComponent(TEST_NAME)}&select=*&order=created_at.desc`,{ou:r=>!r.deleted&&r.test_name===TEST_NAME,trier:(a,b)=>(b.created_at||0)-(a.created_at||0)});state.saved=all.filter(r=>!session?.user_id||r.user_id===session.user_id)}catch(e){if(!state.saved.length)throw e}}
  const className=id=>toolClasses.find(c=>String(c.id)===String(id))?.name||state.saved.find(s=>String(s.class_id)===String(id))?.class_label||"Classe";
  function periodNumbers(){const cls=toolClasses.find(c=>String(c.id)===String(state.classId)),n=cls&&typeof planningPeriodCount==="function"?planningPeriodCount(cls.grade):5;return Array.from({length:n},(_,i)=>i+1)}
  // Un groupe est simplement le nom porte par ses membres - pas de registre separe. Il faut
  // donc toujours le creer avec au moins un eleve deja coche (creerGroupeAvecSelection) : un
  // groupe sans membre n'existerait nulle part et disparaitrait au prochain redessin.
  function ensureValues(){toolStudents.forEach(s=>state.values[s.id]??=empty())}
  const groupNames=()=>[...new Set(toolStudents.map(s=>state.values[s.id]?.group).filter(Boolean))];
  const nonAffectes=()=>toolStudents.filter(s=>!state.values[s.id]?.group);
  const membresDuGroupe=nom=>toolStudents.filter(s=>state.values[s.id]?.group===nom);
  function resetForClass(){state.values={};state.sessionId=null;state.resultIds={};state.createdAt=null;state.activeGroup="";state.indicators=[...DEFAULT_INDICATORS];state.mode="note";state.groupesActifs=false}
  /** Les eleves affiches dans le tableau : ceux du groupe actif, ou toute la classe sans groupes. */
  const elevesAObserver=()=>state.groupesActifs&&state.activeGroup?membresDuGroupe(state.activeGroup):toolStudents;
  const hero=sub=>toolHeader("🏊 Observation Natation",esc(sub));

  async function renderSwimObservationWeb(){await loadToolClasses();await loadSaved();toolPanel=document.getElementById("toolPanel");toolPanel.style.display="block";drawSetup()}
  function contextHtml(){return `<section class="field-tool-card"><div class="tool-context"><input type="hidden" id="swimObsMode" value="${state.classId&&state.classId!=="free"?"class":"free"}"><select id="swimObsClass"><option value="" ${!state.classId||state.classId==="free"?"selected":""}>Usage libre (sans classe)</option>${toolClasses.map(c=>`<option value="${c.id}" ${String(c.id)===String(state.classId)?"selected":""}>${esc(c.name)}</option>`).join("")}</select></div><div class="field-tool-row"><label>Période<select id="swimObsPeriod">${periodNumbers().map(p=>`<option value="${p}" ${p===state.period?"selected":""}>Période ${p}</option>`).join("")}</select></label><label>Organisation<select id="swimObsGrouping"><option value="tous" ${state.groupesActifs?"":"selected"}>Toute la classe</option><option value="groupes" ${state.groupesActifs?"selected":""}>Par groupes de niveau</option></select></label></div></section>`}
  function savedHtml(){return `<section class="field-tool-card"><h3>Observations enregistrées</h3>${state.saved.length?state.saved.map(s=>`<div class="fitness-saved-row"><span><strong>${esc(s.class_label||className(s.class_id))}</strong><small>Période ${s.period_number} · ${new Date(s.created_at||s.updated_at).toLocaleDateString("fr-FR")} · modifiable</small></span><div><button data-swim-open="${s.id}">Ouvrir</button><button class="secondary" data-swim-copy="${s.id}">Dupliquer</button><button class="danger" data-swim-delete="${s.id}">Supprimer</button></div></div>`).join(""):"<p class=muted>Aucune observation enregistrée.</p>"}</section>`}
  function drawSetup(){toolPanel.innerHTML=`<div class="fitness-web">${hero("Groupes de niveau et indicateurs de natation")}${contextHtml()}<button id="swimObsStart">Ouvrir l’observation</button>${savedHtml()}<p class="muted">Les observations enregistrées sont automatiquement rangées dans Tests EPS de la classe concernée.</p></div>`;
    const mode=document.getElementById("swimObsMode"),cls=document.getElementById("swimObsClass");cls.onchange=async()=>{state.classId=cls.value;mode.value=cls.value?"class":"free";resetForClass();
      // En 6e, la couleur remplace la case cochee par defaut - plus lisible a cet age - mais
      // reste modifiable depuis le tableau d'observation.
      const niveau=toolClasses.find(c=>String(c.id)===String(state.classId))?.grade;
      state.mode=niveau==="SIXIEME"?"couleur":"note";
      await loadToolStudents(state.classId);ensureValues();drawSetup()};document.getElementById("swimObsPeriod").onchange=e=>state.period=+e.target.value;
    document.getElementById("swimObsGrouping").onchange=e=>{state.groupesActifs=e.target.value==="groupes"};
    document.getElementById("swimObsStart").onclick=async()=>{if(mode.value==="class"){if(!state.classId)return alert("Choisissez une classe.");await loadToolStudents(state.classId)}else{state.classId="free";toolStudents=[{id:"free",first_name:"Participant",last_name:"libre",sex:"GARCON"}]}ensureValues();state.groupesActifs?drawGroups():drawGrid()};bindSaved()}
  /** Une carte pour un groupe de niveau, avec ses membres - vide, elle invite quand meme a l'appui long. */
  function groupCardHtml(nom){const membres=membresDuGroupe(nom);return `<div class="fitness-group-card" data-swim-group-card="${esc(nom)}"><h4>${esc(nom)}</h4>${membres.map(s=>`<div>${esc(studentLabel(s))}</div>`).join("")||"<span class=muted>Vide</span>"}</div>`}
  function drawGroups(){ensureValues();const cards=groupNames().map(groupCardHtml).join("");const libres=nonAffectes();toolPanel.innerHTML=`<div class="fitness-web">${hero("Constitution des groupes de niveau")}<main class="field-tool-card"><div class="fitness-group-builder"><div><h3>Élèves non affectés</h3><div class="fitness-student-pick">${libres.map(s=>`<label><input type="checkbox" data-swim-pick="${s.id}"><span>${esc(studentLabel(s))}</span></label>`).join("")||"<span class=muted>Tous les élèves ont un groupe.</span>"}</div><div class="field-tool-row" style="margin-top:8px"><input id="swimObsGroupName" placeholder="Nom du nouveau groupe (ex : Confirmés)"><button id="swimObsCreateGroup">Créer le groupe avec la sélection</button></div>${state.activeGroup?`<button id="swimObsAddToGroup" class="secondary" style="margin-top:8px">Ajouter la sélection au groupe « ${esc(state.activeGroup)} »</button>`:""}</div><div><h3>Groupes de niveau</h3><p class="muted" style="margin:0 0 8px">Touchez un groupe pour le rendre actif (recevoir une sélection en plus), appui long pour gérer ses membres ou le supprimer.</p><div class="fitness-group-cards">${cards||"<span class=muted>Aucun groupe pour le moment.</span>"}</div></div></div></main><div class="fitness-actions"><button id="swimObsEvaluate">Commencer l’observation</button><button class="secondary" id="swimObsSaveDraft">Enregistrer</button><button class="secondary" id="swimObsExportGroups">Exporter les groupes</button><button class="secondary" id="swimObsReturn">Retour</button></div><div class="ok" id="swimObsMsg"></div></div>`;
    document.getElementById("swimObsReturn").onclick=drawSetup;
    // Creer et affecter en un seul geste : separer les deux (comme avant) redessinait la liste
    // entre les deux etapes et effacait les cases cochees - le groupe restait vide.
    document.getElementById("swimObsCreateGroup").onclick=()=>{
      const nom=document.getElementById("swimObsGroupName").value.trim();
      const ids=[...document.querySelectorAll("[data-swim-pick]:checked")].map(x=>x.dataset.swimPick);
      if(!nom)return alert("Donnez un nom au groupe.");
      if(groupNames().some(n=>n.toLowerCase()===nom.toLowerCase()))return alert("Ce groupe existe déjà.");
      if(!ids.length)return alert("Cochez au moins un élève pour créer le groupe.");
      ids.forEach(id=>state.values[id]={...state.values[id],group:nom});
      state.activeGroup=nom;drawGroups()
    };
    document.getElementById("swimObsAddToGroup")?.addEventListener("click",()=>{const ids=[...document.querySelectorAll("[data-swim-pick]:checked")].map(x=>x.dataset.swimPick);if(!ids.length)return alert("Cochez au moins un élève.");ids.forEach(id=>state.values[id]={...state.values[id],group:state.activeGroup});drawGroups()});
    document.getElementById("swimObsEvaluate").onclick=()=>{const noms=groupNames();if(noms.length)state.activeGroup=membresDuGroupe(state.activeGroup).length?state.activeGroup:noms[0];else{state.groupesActifs=false;state.activeGroup=""}drawGrid()};
    document.getElementById("swimObsSaveDraft").onclick=saveSwimObservation;document.getElementById("swimObsExportGroups").onclick=exportGroupsCsv;
    toolPanel.querySelectorAll("[data-swim-group-card]").forEach(card=>card.addEventListener("click",()=>{state.activeGroup=card.dataset.swimGroupCard;drawGroups()}));
    if(typeof bindRunningLongPress==="function")bindRunningLongPress(toolPanel.querySelectorAll("[data-swim-group-card]"),node=>manageSwimGroup(node.dataset.swimGroupCard))}
  /** Ajouter ou retirer un eleve d'un groupe deja constitue, sans revenir a l'ecran precedent. */
  function manageSwimGroup(nom){
    document.getElementById("swimObsGroupDialog")?.remove();
    const overlay=document.createElement("div");overlay.id="swimObsGroupDialog";overlay.className="unified-export-overlay";
    document.body.appendChild(overlay);
    const render=()=>{
      const membres=membresDuGroupe(nom);
      const libres=nonAffectes();
      overlay.innerHTML=`<section class="unified-export-dialog"><header><i>🏊</i><div><h3>${esc(nom)}</h3><p>${membres.length} élève${membres.length>1?"s":""}</p></div><button data-swim-group-close>×</button></header><main>
        <h4>Dans ce groupe</h4>
        ${membres.length?`<div class="swim-group-pick">${membres.map(s=>`<button type="button" class="retirer" data-swim-group-retirer="${s.id}"><b>−</b><span>${esc(studentLabel(s))}</span></button>`).join("")}</div>`:`<p class="muted">Ce groupe est vide.</p>`}
        <h4>Ajouter un élève</h4>
        ${libres.length?`<div class="swim-group-pick">${libres.map(s=>`<button type="button" class="ajouter" data-swim-group-ajouter="${s.id}"><b>+</b><span>${esc(studentLabel(s))}</span></button>`).join("")}</div>`:`<p class="muted">Aucun élève disponible - tous sont déjà dans un groupe.</p>`}
        <button type="button" class="export-choice" data-swim-group-supprimer style="border-color:#d32f2f"><b>🗑</b><span><strong>Supprimer ce groupe</strong><small>Tous ses élèves redeviennent non affectés</small></span></button>
        <button class="export-cancel" data-swim-group-close>Fermer</button>
      </main></section>`;
      overlay.querySelectorAll("[data-swim-group-close]").forEach(b=>b.onclick=()=>overlay.remove());
      overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
      overlay.querySelectorAll("[data-swim-group-retirer]").forEach(b=>b.onclick=()=>{const id=b.dataset.swimGroupRetirer;state.values[id]={...state.values[id],group:""};drawGroups();render()});
      overlay.querySelectorAll("[data-swim-group-ajouter]").forEach(b=>b.onclick=()=>{const id=b.dataset.swimGroupAjouter;state.values[id]={...state.values[id],group:nom};drawGroups();render()});
      overlay.querySelector("[data-swim-group-supprimer]").onclick=()=>{if(!confirm(`Supprimer le groupe « ${nom} » ? Ses élèves redeviennent non affectés.`))return;membresDuGroupe(nom).forEach(s=>state.values[s.id]={...state.values[s.id],group:""});if(state.activeGroup===nom)state.activeGroup="";overlay.remove();drawGroups()};
    };
    render();
  }
  /** Case a cocher (note) ou pastille a 4 couleurs (couleur), selon le mode courant. */
  function chipHtml(sId,label){
    const v=state.values[sId]||empty(),val=v.validated[label];
    if(state.mode==="couleur"){
      const info=val?COULEUR_PAR_CODE[val]:null;
      return `<button type="button" class="swim-obs-dot" data-swim-toggle="${sId}|${esc(label)}" style="${info?`background:${info.color};border-color:${info.color}`:""}" title="${info?esc(info.label):"Touchez pour noter"}"></button>`;
    }
    return `<button type="button" class="swim-obs-chip ${val?"active":""}" data-swim-toggle="${sId}|${esc(label)}">${val?"✓":""}</button>`;
  }
  function rowHtml(s){const v=state.values[s.id]||empty(),total=scoreEleve(v);return `<tr><td><strong>${esc((s.last_name||"").toUpperCase())} ${esc(s.first_name||"")}</strong></td>${state.indicators.map(label=>`<td>${chipHtml(s.id,label)}</td>`).join("")}<td class="fitness-score">${fr(total,1)}/${state.indicators.length}</td></tr>`}
  function drawGrid(){ensureValues();const noms=groupNames();const visible=elevesAObserver();const tabs=`<div class="fitness-tabs"><button id="swimObsEditGroups">${noms.length?"Modifier les groupes":"Constituer des groupes"}</button>${noms.length?`<button data-swim-group="" class="${state.activeGroup?"":"active"}">Toute la classe</button>`:""}${noms.map(n=>`<button data-swim-group="${esc(n)}" class="${n===state.activeGroup?"active":""}">${esc(n)}</button>`).join("")}</div>`;
    toolPanel.innerHTML=`<div class="fitness-web">${hero("Tableau d’observation grand écran")}${tabs}<div class="field-tool-row"><label>Notation<select id="swimObsModeSelect"><option value="note" ${state.mode==="note"?"selected":""}>Case cochée</option><option value="couleur" ${state.mode==="couleur"?"selected":""}>Couleur (Vert + · Vert · Orange · Rouge)</option></select></label></div><div class="fitness-summary"><div class="fitness-kpi"><strong>${toolStudents.length}</strong><small>élèves</small></div><div class="fitness-kpi"><strong>${noms.length}</strong><small>groupe(s)</small></div><div class="fitness-kpi"><strong>${state.indicators.length}</strong><small>indicateur(s)</small></div><div class="fitness-kpi"><strong>P${state.period}</strong><small>${esc(className(state.classId))}</small></div></div><div class="fitness-table-wrap"><table><thead><tr><th>Nom et prénom</th>${state.indicators.map(l=>`<th>${esc(l)}</th>`).join("")}<th>Note</th></tr></thead><tbody>${visible.map(rowHtml).join("")||`<tr><td colspan="${state.indicators.length+2}" class="muted">Aucun élève dans ce groupe.</td></tr>`}</tbody></table></div><div class="field-tool-row"><input id="swimObsNewIndicator" placeholder="Nouvel indicateur (ex : Virage culbute)"><button id="swimObsAddIndicator">Ajouter</button></div><div class="fitness-actions"><button id="swimObsSave">💾 ${state.sessionId?"Enregistrer les modifications":"Enregistrer dans Tests EPS"}</button><button class="secondary" id="swimObsExcel">▦ Excel</button><button class="secondary" id="swimObsPdf">▤ PDF</button><button class="secondary" id="swimObsLeave">← Retour</button></div><div class="ok" id="swimObsMsg"></div></div>`;
    document.getElementById("swimObsModeSelect").onchange=e=>{state.mode=e.target.value;drawGrid()};
    toolPanel.querySelectorAll("[data-swim-toggle]").forEach(b=>b.onclick=()=>{
      const [id,label]=b.dataset.swimToggle.split("|");
      const v=state.values[id]||empty();
      if(state.mode==="couleur"){
        const codes=COULEUR_NIVEAUX.map(x=>x[0]),actuel=codes.indexOf(v.validated[label]);
        v.validated={...v.validated,[label]:actuel===-1?codes[0]:(actuel+1<codes.length?codes[actuel+1]:null)};
      }else{
        v.validated={...v.validated,[label]:!v.validated[label]};
      }
      state.values[id]=v;drawGrid()
    });
    toolPanel.querySelectorAll("[data-swim-group]").forEach(b=>b.onclick=()=>{state.activeGroup=b.dataset.swimGroup;state.groupesActifs=!!b.dataset.swimGroup;drawGrid()});
    document.getElementById("swimObsEditGroups").onclick=()=>{state.groupesActifs=true;drawGroups()};
    document.getElementById("swimObsAddIndicator").onclick=()=>{const nom=document.getElementById("swimObsNewIndicator").value.trim();if(!nom)return;if(state.indicators.some(l=>l.toLowerCase()===nom.toLowerCase()))return alert("Cet indicateur existe déjà.");state.indicators=[...state.indicators,nom];drawGrid()};
    document.getElementById("swimObsSave").onclick=saveSwimObservation;document.getElementById("swimObsExcel").onclick=()=>showSwimObsExport("Excel");document.getElementById("swimObsPdf").onclick=()=>showSwimObsExport("PDF");document.getElementById("swimObsLeave").onclick=drawSetup}
  // Enregistrer meme si tout le monde n'a pas ete observe : chaque eleve garde son groupe et ses
  // indicateurs valides tels quels, sans obliger a finir la classe entiere en une seance.
  async function saveSwimObservation(){if(state.busy||!state.classId||state.classId==="free")return alert("Choisissez une classe pour enregistrer.");state.busy=true;const msg=document.getElementById("swimObsMsg");if(msg)msg.textContent="Enregistrement…";try{const now=new Date().toISOString(),id=state.sessionId||crypto.randomUUID(),created=state.createdAt||Date.now();await enregistrerLigne("eps_test_sessions",{id,user_id:session.user_id,class_id:state.classId,period_number:state.period,test_name:TEST_NAME,created_at:created,class_label:className(state.classId),updated_at:now,deleted:false});for(const s of toolStudents){const v=state.values[s.id]||empty(),n=scoreEleve(v),resultId=state.resultIds[s.id]||crypto.randomUUID();state.resultIds[s.id]=resultId;await enregistrerLigne("eps_test_results",{id:resultId,user_id:session.user_id,session_id:id,student_id:s.id,input_value:n,result_value:n,input_unit:encode(v),result_unit:v.group?`${fr(n,1)}/${state.indicators.length} indicateurs · ${v.group}`:"non affecté",updated_at:now,deleted:false})}state.sessionId=id;state.createdAt=created;await loadSaved();if(msg)msg.textContent=`Enregistré dans Tests EPS · ${className(state.classId)} · période ${state.period}.`}catch(e){if(msg)msg.textContent="Échec de l’enregistrement : "+e.message}finally{state.busy=false}}
  async function openSaved(id,duplicate=false){const saved=state.saved.find(s=>String(s.id)===String(id));if(!saved)throw new Error("Cette observation est introuvable sur cet appareil : rechargez la page, elle n’a peut-être pas encore été reçue.");state.classId=saved.class_id;state.period=+saved.period_number||1;state.sessionId=duplicate?null:saved.id;state.createdAt=duplicate?null:saved.created_at;state.resultIds={};state.values={};await loadToolStudents(state.classId);let rows=await lireTable("eps_test_results",`eps_test_results?session_id=eq.${saved.id}&deleted=eq.false&select=*`,{ou:r=>String(r.session_id)===String(saved.id)&&!r.deleted});
    if(!rows.length){try{const r=await apiFetch(`${SUPABASE_URL}/rest/v1/eps_test_results?session_id=eq.${saved.id}&deleted=eq.false&select=*`);if(r.ok)rows=await r.json()}catch{}}
    const indicateursVus=new Set(DEFAULT_INDICATORS);
    rows.forEach(r=>{const v=decode(r.input_unit);state.values[r.student_id]={group:v.group,validated:v.validated};state.mode=v.mode;Object.keys(v.validated).forEach(l=>indicateursVus.add(l));if(!duplicate)state.resultIds[r.student_id]=r.id});
    state.indicators=[...indicateursVus];ensureValues();const nomsVus=groupNames();state.groupesActifs=nomsVus.length>0;state.activeGroup=nomsVus[0]||"";
    toolPanel=document.getElementById("toolPanel");toolPanel.style.display="block";toolPanel.classList.add("modern-tool-panel");drawGrid()}
  async function deleteSaved(id){if(!confirm("Supprimer cette observation et ses résultats ?"))return;const saved=state.saved.find(s=>String(s.id)===String(id));if(!saved)return;await enregistrerLigne("eps_test_sessions",{...saved,deleted:true,updated_at:new Date().toISOString()});await loadSaved();drawSetup()}
  async function ouvrirObservationNatationDepuisClasse(id,classId,period){await loadToolClasses();state.classId=classId;state.period=+period||1;await loadSaved();
    if(!state.saved.some(s=>String(s.id)===String(id))){try{const r=await apiFetch(`${SUPABASE_URL}/rest/v1/eps_test_sessions?id=eq.${encodeURIComponent(id)}&deleted=eq.false&select=*`);if(r.ok){const [ligne]=await r.json();if(ligne)state.saved.unshift(ligne)}}catch{}}
    await openSaved(id)}
  function bindSaved(){document.querySelectorAll("[data-swim-open]").forEach(b=>b.onclick=()=>{toolPanel.classList.add("modern-tool-panel");openSaved(b.dataset.swimOpen)});document.querySelectorAll("[data-swim-copy]").forEach(b=>b.onclick=()=>{toolPanel.classList.add("modern-tool-panel");openSaved(b.dataset.swimCopy,true)});document.querySelectorAll("[data-swim-delete]").forEach(b=>b.onclick=()=>deleteSaved(b.dataset.swimDelete))}
  function download(name,text,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
  const exportRows=()=>toolStudents.map(s=>{const v=state.values[s.id]||empty();return [s.last_name||"",s.first_name||"",v.group||"Non affecté",...state.indicators.map(l=>{const val=v.validated[l];if(state.mode==="couleur")return val?COULEUR_PAR_CODE[val]?.label||"":"";return val?"Oui":"Non"}),`${fr(scoreEleve(v),1)}/${state.indicators.length}`]});
  function exportSwimObsCsv(){const rows=[["Nom","Prénom","Groupe",...state.indicators,"Validés"],...exportRows()];download(`observation-natation-${className(state.classId)}.csv`,`﻿${rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\r\n")}`,"text/csv;charset=utf-8")}
  function swimObsCsvFile(){const rows=[["Nom","Prénom","Groupe",...state.indicators,"Validés"],...exportRows()],name=`observation-natation-${className(state.classId)}.csv`;return new File([`﻿${rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\r\n")}`],name,{type:"text/csv;charset=utf-8"})}
  async function shareSwimObsCsv(){const file=swimObsCsvFile();if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({title:"Observation natation",files:[file]});else exportSwimObsCsv()}
  function showSwimObsExport(format){document.getElementById("swimObsExportDialog")?.remove();const icon=format==="Excel"?"▦":"▤",overlay=document.createElement("div");overlay.id="swimObsExportDialog";overlay.className="unified-export-overlay";overlay.innerHTML=`<section class="unified-export-dialog"><header><i>${icon}</i><div><h3>Résultats ${format}</h3><p>${esc(className(state.classId))} · Période ${state.period}</p></div><button data-export-close>×</button></header><main><h4>Que souhaitez-vous faire ?</h4><button class="export-choice save"><b>↓</b><span><strong>Enregistrer</strong><small>Conserver le fichier sur l’appareil</small></span><em>›</em></button><button class="export-choice share"><b>↗</b><span><strong>Envoyer</strong><small>Choisir Mail, WhatsApp, Drive…</small></span><em>›</em></button><button class="export-cancel" data-export-close>Annuler</button></main></section>`;document.body.appendChild(overlay);overlay.querySelectorAll("[data-export-close]").forEach(b=>b.onclick=()=>overlay.remove());overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};overlay.querySelector(".save").onclick=()=>{overlay.remove();format==="Excel"?exportSwimObsCsv():printSwimObsPdf()};overlay.querySelector(".share").onclick=()=>{overlay.remove();format==="Excel"?shareSwimObsCsv():printSwimObsPdf()}}
  function exportGroupsCsv(){const rows=[["Groupe","Nom","Prénom"],...toolStudents.map(s=>[state.values[s.id]?.group||"Non affecté",s.last_name,s.first_name])];download(`groupes-natation-${className(state.classId)}.csv`,`﻿${rows.map(r=>r.join(";")).join("\r\n")}`,"text/csv;charset=utf-8")}
  function printSwimObsPdf(){const w=open("","_blank");if(!w)return alert("Autorisez les fenêtres surgissantes.");w.document.write(`<html><head><meta charset=utf-8><title>Observation natation</title><style>body{font:12px Arial;color:#123a59;padding:24px}header{background:#087dca;color:white;padding:18px;border-radius:12px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cad8e3;padding:6px;text-align:center}th:first-child,td:first-child{text-align:left}@media print{button{display:none}}</style></head><body><header><h1>Observation Natation</h1><p>${esc(className(state.classId))} · Période ${state.period} · ${new Date().toLocaleDateString("fr-FR")}</p></header><table><tr><th>Élève</th><th>Groupe</th>${state.indicators.map(l=>`<th>${esc(l)}</th>`).join("")}<th>Validés</th></tr>${exportRows().map(r=>`<tr><td>${esc(r[0])} ${esc(r[1])}</td><td>${esc(r[2])}</td>${r.slice(3,-1).map(v=>`<td>${esc(v)}</td>`).join("")}<td>${esc(r.at(-1))}</td></tr>`).join("")}</table><button onclick="print()">Enregistrer / imprimer en PDF</button></body></html>`);w.document.close()}
  Object.assign(globalThis,{renderSwimObservationWeb,ouvrirObservationNatationDepuisClasse});
})();
