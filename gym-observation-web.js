/* Gymnastique - Observation par figures (difficulte + erreurs) — version grand ecran, compatible avec l'application. */
(function(){
  const TEST_NAME="Observation Gymnastique";
  const DIFFICULTES={A:0.4,B:0.6,C:0.8,D:1};
  const ERREURS={aucune:0,petite:0.2,moyenne:0.4,grosse:0.6,chute:"chute"};
  const ERREUR_LABEL={aucune:"Aucune erreur",petite:"Petite erreur (−0,2)",moyenne:"Erreur moyenne (−0,4)",grosse:"Grosse erreur (−0,6)",chute:"Chute (0 point)"};
  // Nom court + perte de points, affiches sur deux lignes dans la case compacte du choix -
  // ERREUR_LABEL garde le texte complet pour le tableau et l'export.
  const ERREUR_COURT={aucune:["Aucune","—"],petite:["Petite","−0,2"],moyenne:["Moyenne","−0,4"],grosse:["Grosse","−0,6"],chute:["Chute","0 pt"]};
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fr=(v,d=1)=>Number(v).toFixed(d).replace(".",",");
  // Deux notations par figure : difficulte + erreur (note), ou une seule pastille a quatre
  // couleurs (couleur) - plus lisible en 6e, ou ce reglage s'applique par defaut.
  const COULEUR_NIVEAUX=[["vert-plus","Vert +","#0e9f5f",1],["vert","Vert","#4caf50",0.75],["orange","Orange","#f39c12",0.5],["rouge","Rouge","#e74c3c",0.25]];
  const COULEUR_PAR_CODE=Object.fromEntries(COULEUR_NIVEAUX.map(([code,label,color,valeur])=>[code,{label,color,valeur}]));
  const figureVide=()=>({difficulte:null,erreur:"aucune",couleur:null});
  function scoreFigure(f){
    if(!f)return 0;
    if(state.mode==="couleur")return f.couleur?(COULEUR_PAR_CODE[f.couleur]?.valeur||0):0;
    if(f.difficulte==null)return 0;
    if(f.erreur==="chute")return 0;
    return Math.max(0,(DIFFICULTES[f.difficulte]||0)-(ERREURS[f.erreur]||0));
  }
  function scoreTotal(figures){return (figures||[]).reduce((s,f)=>s+scoreFigure(f),0)}
  function encode(figures){return "gym:"+JSON.stringify({version:2,mode:state.mode,figures})}
  function decode(raw,n){
    try{
      const parsed=JSON.parse(String(raw||"").replace(/^gym:/,""));
      const figures=Array.isArray(parsed.figures)?parsed.figures:[];
      return {mode:parsed.mode||"note",figures:Array.from({length:n},(_,i)=>({...figureVide(),...(figures[i]||{})}))};
    }catch{return {mode:"note",figures:Array.from({length:n},()=>figureVide())}}
  }
  const state={classId:"",period:1,numFigures:4,values:{},mode:"note",sessionId:null,resultIds:{},createdAt:null,saved:[],busy:false};
  async function loadSaved(){try{const all=await lireTable("eps_test_sessions",`eps_test_sessions?deleted=eq.false&test_name=eq.${encodeURIComponent(TEST_NAME)}&select=*&order=created_at.desc`,{ou:r=>!r.deleted&&r.test_name===TEST_NAME,trier:(a,b)=>(b.created_at||0)-(a.created_at||0)});state.saved=all.filter(r=>!session?.user_id||r.user_id===session.user_id)}catch(e){if(!state.saved.length)throw e}}
  const className=id=>toolClasses.find(c=>String(c.id)===String(id))?.name||state.saved.find(s=>String(s.class_id)===String(id))?.class_label||"Classe";
  function periodNumbers(){const cls=toolClasses.find(c=>String(c.id)===String(state.classId)),n=cls&&typeof planningPeriodCount==="function"?planningPeriodCount(cls.grade):5;return Array.from({length:n},(_,i)=>i+1)}
  function ensureValues(){toolStudents.forEach(s=>{const actuel=state.values[s.id]||[];state.values[s.id]=Array.from({length:state.numFigures},(_,i)=>actuel[i]||figureVide())})}
  function resetForClass(){state.values={};state.sessionId=null;state.resultIds={};state.createdAt=null;state.mode="note"}
  const hero=sub=>toolHeader("🤸 Observation Gymnastique",esc(sub));

  async function renderGymObservationWeb(){await loadToolClasses();await loadSaved();toolPanel=document.getElementById("toolPanel");toolPanel.style.display="block";drawSetup()}
  function contextHtml(){return `<section class="field-tool-card"><div class="tool-context"><input type="hidden" id="gymObsMode" value="${state.classId&&state.classId!=="free"?"class":"free"}"><select id="gymObsClass"><option value="" ${!state.classId||state.classId==="free"?"selected":""}>Usage libre (sans classe)</option>${toolClasses.map(c=>`<option value="${c.id}" ${String(c.id)===String(state.classId)?"selected":""}>${esc(c.name)}</option>`).join("")}</select></div><div class="field-tool-row"><label>Période<select id="gymObsPeriod">${periodNumbers().map(p=>`<option value="${p}" ${p===state.period?"selected":""}>Période ${p}</option>`).join("")}</select></label></div></section>`}
  function savedHtml(){return `<section class="field-tool-card"><h3>Observations enregistrées</h3>${state.saved.length?state.saved.map(s=>`<div class="fitness-saved-row"><span><strong>${esc(s.class_label||className(s.class_id))}</strong><small>Période ${s.period_number} · ${new Date(s.created_at||s.updated_at).toLocaleDateString("fr-FR")} · modifiable</small></span><div><button data-gym-open="${s.id}">Ouvrir</button><button class="secondary" data-gym-copy="${s.id}">Dupliquer</button><button class="danger" data-gym-delete="${s.id}">Supprimer</button></div></div>`).join(""):"<p class=muted>Aucune observation enregistrée.</p>"}</section>`}
  function drawSetup(){toolPanel.innerHTML=`<div class="fitness-web">${hero("Difficulté par figure, erreurs par élève")}${contextHtml()}<section class="field-tool-card"><div class="fitness-auto-size"><button type="button" id="gymObsMoins" aria-label="Moins de figures">−</button><span>Évaluer <b id="gymObsNombre">${state.numFigures}</b> figure${state.numFigures>1?"s":""}</span><button type="button" id="gymObsPlus" aria-label="Plus de figures">+</button></div></section><button id="gymObsStart">Ouvrir l’observation</button>${savedHtml()}<p class="muted">Les observations enregistrées sont automatiquement rangées dans Tests EPS de la classe concernée.</p></div>`;
    const mode=document.getElementById("gymObsMode"),cls=document.getElementById("gymObsClass");cls.onchange=async()=>{state.classId=cls.value;mode.value=cls.value?"class":"free";resetForClass();
      // En 6e, la couleur remplace difficulte + erreur par defaut - plus lisible a cet age -
      // mais reste modifiable depuis le tableau d'observation.
      const niveau=toolClasses.find(c=>String(c.id)===String(state.classId))?.grade;
      state.mode=niveau==="SIXIEME"?"couleur":"note";
      await loadToolStudents(state.classId);ensureValues();drawSetup()};document.getElementById("gymObsPeriod").onchange=e=>state.period=+e.target.value;
    document.getElementById("gymObsMoins").onclick=()=>{state.numFigures=Math.max(1,state.numFigures-1);drawSetup()};
    document.getElementById("gymObsPlus").onclick=()=>{state.numFigures=Math.min(10,state.numFigures+1);drawSetup()};
    document.getElementById("gymObsStart").onclick=async()=>{if(mode.value==="class"){if(!state.classId)return alert("Choisissez une classe.");await loadToolStudents(state.classId)}else{state.classId="free";toolStudents=[{id:"free",first_name:"Participant",last_name:"libre"}]}ensureValues();drawGrid()};bindSaved()}
  function celluleHtml(sId,i){
    const f=(state.values[sId]||[])[i]||figureVide(),score=scoreFigure(f);
    if(state.mode==="couleur"){
      const info=f.couleur?COULEUR_PAR_CODE[f.couleur]:null;
      return `<button type="button" class="gym-obs-cell" data-gym-cell="${sId}|${i}">${info?`<span class="gym-obs-cell-dot" style="background:${info.color}"></span><em>${fr(score,1)}</em>`:`<span class="muted">—</span>`}</button>`;
    }
    return `<button type="button" class="gym-obs-cell" data-gym-cell="${sId}|${i}">${f.difficulte?`<b>${f.difficulte}</b><small>${f.erreur!=="aucune"?ERREUR_LABEL[f.erreur].split(" ")[0]:""}</small><em>${fr(score,1)}</em>`:`<span class="muted">—</span>`}</button>`;
  }
  function ligneHtml(s){const total=scoreTotal(state.values[s.id]);return `<tr><td><strong>${esc((s.last_name||"").toUpperCase())} ${esc(s.first_name||"")}</strong></td>${Array.from({length:state.numFigures},(_,i)=>`<td>${celluleHtml(s.id,i)}</td>`).join("")}<td class="fitness-score">${fr(total,1)} / ${state.numFigures}</td></tr>`}
  function drawGrid(){ensureValues();toolPanel.innerHTML=`<div class="fitness-web">${hero("Tableau d’observation grand écran")}<div class="field-tool-row"><label>Notation<select id="gymObsModeSelect"><option value="note" ${state.mode==="note"?"selected":""}>Difficulté + erreur</option><option value="couleur" ${state.mode==="couleur"?"selected":""}>Couleur (Vert + · Vert · Orange · Rouge)</option></select></label></div><div class="fitness-summary"><div class="fitness-kpi"><strong>${toolStudents.length}</strong><small>élèves</small></div><div class="fitness-kpi"><strong>${state.numFigures}</strong><small>figure(s)</small></div><div class="fitness-kpi"><strong>P${state.period}</strong><small>${esc(className(state.classId))}</small></div></div><div class="fitness-table-wrap"><table><thead><tr><th>Nom et prénom</th>${Array.from({length:state.numFigures},(_,i)=>`<th>Figure ${i+1}</th>`).join("")}<th>Note /${state.numFigures}</th></tr></thead><tbody>${toolStudents.map(ligneHtml).join("")}</tbody></table></div><div class="fitness-actions"><button id="gymObsSave">💾 ${state.sessionId?"Enregistrer les modifications":"Enregistrer dans Tests EPS"}</button><button class="secondary" id="gymObsExcel">▦ Excel</button><button class="secondary" id="gymObsPdf">▤ PDF</button><button class="secondary" id="gymObsLeave">← Retour</button></div><div class="ok" id="gymObsMsg"></div></div>`;
    document.getElementById("gymObsModeSelect").onchange=e=>{state.mode=e.target.value;drawGrid()};
    toolPanel.querySelectorAll("[data-gym-cell]").forEach(b=>b.onclick=()=>{const [sId,i]=b.dataset.gymCell.split("|");ouvrirCelluleGym(sId,+i)});
    document.getElementById("gymObsSave").onclick=saveGymObservation;document.getElementById("gymObsExcel").onclick=()=>showGymObsExport("Excel");document.getElementById("gymObsPdf").onclick=()=>showGymObsExport("PDF");document.getElementById("gymObsLeave").onclick=drawSetup}
  /** Choisir la difficulte puis l'erreur d'une figure pour un eleve, sans quitter le tableau. */
  function ouvrirCelluleGym(sId,depart){
    document.getElementById("gymObsCellDialog")?.remove();
    const eleve=toolStudents.find(s=>String(s.id)===String(sId));
    const overlay=document.createElement("div");overlay.id="gymObsCellDialog";overlay.className="unified-export-overlay";
    document.body.appendChild(overlay);
    let index=depart;
    const lire=()=>(state.values[sId]||[])[index]||figureVide();
    // Deux colonnes cote a cote (difficulte, erreur) au lieu d'une longue liste qui obligeait a
    // faire defiler pour tout voir, et des fleches pour passer d'une figure a l'autre sans
    // rouvrir la fenetre a chaque fois. Un choix de difficulte/erreur ne redessine que le score
    // et la case active - changer de figure redessine tout, mais c'est un geste delibere donc
    // sans risque de retomber sur le fond et refermer la fenetre.
    const contenuChoix=()=>{
      if(state.mode==="couleur")return `<div class="gym-cell-columns"><div class="gym-cell-col"><h4>Couleur</h4>${COULEUR_NIVEAUX.map(([code,label])=>`<button type="button" class="gym-cell-choice" data-gym-couleur="${code}"><b style="color:${COULEUR_PAR_CODE[code].color}">●</b><small>${esc(label)}</small></button>`).join("")}</div></div>`;
      return `<div class="gym-cell-columns">
        <div class="gym-cell-col"><h4>Difficulté</h4>${Object.entries(DIFFICULTES).map(([lettre,val])=>`<button type="button" class="gym-cell-choice" data-gym-diff="${lettre}"><b>${lettre}</b><small>${fr(val,1)}</small></button>`).join("")}</div>
        <div class="gym-cell-col"><h4>Erreur</h4>${Object.keys(ERREUR_LABEL).map(code=>`<button type="button" class="gym-cell-choice" data-gym-err="${code}" title="${esc(ERREUR_LABEL[code])}"><b>${esc(ERREUR_COURT[code][0])}</b><small>${esc(ERREUR_COURT[code][1])}</small></button>`).join("")}</div>
      </div>`;
    };
    const construire=()=>{
      overlay.innerHTML=`<section class="unified-export-dialog gym-cell-dialog"><header><i>🤸</i><div><h3>${esc(studentLabel(eleve))}</h3><p data-gym-cell-score></p></div><button data-gym-cell-close>×</button></header><main>
        <div class="fitness-tabs" style="justify-content:center;align-items:center;margin:0 0 4px">
          <button type="button" id="gymCellPrev" ${index<=0?"disabled":""}>‹ Précédente</button>
          <span class="muted">Figure ${index+1} / ${state.numFigures}</span>
          <button type="button" id="gymCellNext" ${index>=state.numFigures-1?"disabled":""}>Suivante ›</button>
        </div>
        ${contenuChoix()}
        <button class="export-cancel" data-gym-cell-close style="margin-top:14px">Fermer</button>
      </main></section>`;
      overlay.querySelectorAll("[data-gym-cell-close]").forEach(b=>b.onclick=()=>{overlay.remove();drawGrid()});
      document.getElementById("gymCellPrev").onclick=()=>{if(index>0){index--;construire()}};
      document.getElementById("gymCellNext").onclick=()=>{if(index<state.numFigures-1){index++;construire()}};
      overlay.querySelectorAll("[data-gym-diff]").forEach(b=>b.onclick=()=>{const arr=state.values[sId]||[];arr[index]={...arr[index],difficulte:b.dataset.gymDiff};state.values[sId]=arr;majAffichage()});
      overlay.querySelectorAll("[data-gym-err]").forEach(b=>b.onclick=()=>{const arr=state.values[sId]||[];arr[index]={...arr[index],erreur:b.dataset.gymErr};state.values[sId]=arr;majAffichage()});
      overlay.querySelectorAll("[data-gym-couleur]").forEach(b=>b.onclick=()=>{const arr=state.values[sId]||[];arr[index]={...arr[index],couleur:b.dataset.gymCouleur};state.values[sId]=arr;majAffichage()});
      majAffichage();
    };
    const majAffichage=()=>{
      const f=lire(),score=scoreFigure(f);
      overlay.querySelector("[data-gym-cell-score]").textContent=`${fr(score,1)} point${score>1?"s":""}`;
      overlay.querySelectorAll("[data-gym-diff]").forEach(b=>b.classList.toggle("active",b.dataset.gymDiff===f.difficulte));
      overlay.querySelectorAll("[data-gym-err]").forEach(b=>b.classList.toggle("active",b.dataset.gymErr===f.erreur));
      overlay.querySelectorAll("[data-gym-couleur]").forEach(b=>b.classList.toggle("active",b.dataset.gymCouleur===f.couleur));
    };
    overlay.onclick=e=>{if(e.target===overlay){overlay.remove();drawGrid()}};
    construire();
  }
  // Enregistrer meme si toutes les figures n'ont pas ete jugees : chaque case garde son etat tel
  // quel (une figure jamais touchee vaut 0), sans obliger a finir la classe entiere.
  async function saveGymObservation(){if(state.busy||!state.classId||state.classId==="free")return alert("Choisissez une classe pour enregistrer.");state.busy=true;const msg=document.getElementById("gymObsMsg");if(msg)msg.textContent="Enregistrement…";try{const now=new Date().toISOString(),id=state.sessionId||crypto.randomUUID(),created=state.createdAt||Date.now();await enregistrerLigne("eps_test_sessions",{id,user_id:session.user_id,class_id:state.classId,period_number:state.period,test_name:TEST_NAME,created_at:created,class_label:className(state.classId),updated_at:now,deleted:false});for(const s of toolStudents){const figures=state.values[s.id]||[],total=scoreTotal(figures),resultId=state.resultIds[s.id]||crypto.randomUUID();state.resultIds[s.id]=resultId;await enregistrerLigne("eps_test_results",{id:resultId,user_id:session.user_id,session_id:id,student_id:s.id,input_value:state.numFigures,result_value:total,input_unit:encode(figures),result_unit:`/${state.numFigures}`,updated_at:now,deleted:false})}state.sessionId=id;state.createdAt=created;await loadSaved();if(msg)msg.textContent=`Enregistré dans Tests EPS · ${className(state.classId)} · période ${state.period}.`}catch(e){if(msg)msg.textContent="Échec de l’enregistrement : "+e.message}finally{state.busy=false}}
  async function openSaved(id,duplicate=false){const saved=state.saved.find(s=>String(s.id)===String(id));if(!saved)throw new Error("Cette observation est introuvable sur cet appareil : rechargez la page, elle n’a peut-être pas encore été reçue.");state.classId=saved.class_id;state.period=+saved.period_number||1;state.sessionId=duplicate?null:saved.id;state.createdAt=duplicate?null:saved.created_at;state.resultIds={};state.values={};await loadToolStudents(state.classId);let rows=await lireTable("eps_test_results",`eps_test_results?session_id=eq.${saved.id}&deleted=eq.false&select=*`,{ou:r=>String(r.session_id)===String(saved.id)&&!r.deleted});
    if(!rows.length){try{const r=await apiFetch(`${SUPABASE_URL}/rest/v1/eps_test_results?session_id=eq.${saved.id}&deleted=eq.false&select=*`);if(r.ok)rows=await r.json()}catch{}}
    state.numFigures=Math.max(1,...rows.map(r=>+r.input_value||0),state.numFigures);
    rows.forEach(r=>{const d=decode(r.input_unit,state.numFigures);state.values[r.student_id]=d.figures;state.mode=d.mode;if(!duplicate)state.resultIds[r.student_id]=r.id});
    ensureValues();toolPanel=document.getElementById("toolPanel");toolPanel.style.display="block";toolPanel.classList.add("modern-tool-panel");drawGrid()}
  async function deleteSaved(id){if(!confirm("Supprimer cette observation et ses résultats ?"))return;const saved=state.saved.find(s=>String(s.id)===String(id));if(!saved)return;await enregistrerLigne("eps_test_sessions",{...saved,deleted:true,updated_at:new Date().toISOString()});await loadSaved();drawSetup()}
  async function ouvrirObservationGymnastiqueDepuisClasse(id,classId,period){await loadToolClasses();state.classId=classId;state.period=+period||1;await loadSaved();
    if(!state.saved.some(s=>String(s.id)===String(id))){try{const r=await apiFetch(`${SUPABASE_URL}/rest/v1/eps_test_sessions?id=eq.${encodeURIComponent(id)}&deleted=eq.false&select=*`);if(r.ok){const [ligne]=await r.json();if(ligne)state.saved.unshift(ligne)}}catch{}}
    await openSaved(id)}
  function bindSaved(){document.querySelectorAll("[data-gym-open]").forEach(b=>b.onclick=()=>{toolPanel.classList.add("modern-tool-panel");openSaved(b.dataset.gymOpen)});document.querySelectorAll("[data-gym-copy]").forEach(b=>b.onclick=()=>{toolPanel.classList.add("modern-tool-panel");openSaved(b.dataset.gymCopy,true)});document.querySelectorAll("[data-gym-delete]").forEach(b=>b.onclick=()=>deleteSaved(b.dataset.gymDelete))}
  function download(name,text,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
  const exportRows=()=>toolStudents.map(s=>{const figures=state.values[s.id]||[];return [s.last_name||"",s.first_name||"",...figures.map(f=>{
    if(state.mode==="couleur")return f.couleur?`${COULEUR_PAR_CODE[f.couleur].label} (${fr(scoreFigure(f),1)})`:"—";
    return f.difficulte?`${f.difficulte}${f.erreur!=="aucune"?" · "+ERREUR_LABEL[f.erreur].split(" ")[0]:""} (${fr(scoreFigure(f),1)})`:"—";
  }),fr(scoreTotal(figures),1)]});
  function exportGymObsCsv(){const rows=[["Nom","Prénom",...Array.from({length:state.numFigures},(_,i)=>`Figure ${i+1}`),`Note /${state.numFigures}`],...exportRows()];download(`observation-gymnastique-${className(state.classId)}.csv`,`﻿${rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\r\n")}`,"text/csv;charset=utf-8")}
  function gymObsCsvFile(){const rows=[["Nom","Prénom",...Array.from({length:state.numFigures},(_,i)=>`Figure ${i+1}`),`Note /${state.numFigures}`],...exportRows()],name=`observation-gymnastique-${className(state.classId)}.csv`;return new File([`﻿${rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\r\n")}`],name,{type:"text/csv;charset=utf-8"})}
  async function shareGymObsCsv(){const file=gymObsCsvFile();if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({title:"Observation gymnastique",files:[file]});else exportGymObsCsv()}
  function showGymObsExport(format){document.getElementById("gymObsExportDialog")?.remove();const icon=format==="Excel"?"▦":"▤",overlay=document.createElement("div");overlay.id="gymObsExportDialog";overlay.className="unified-export-overlay";overlay.innerHTML=`<section class="unified-export-dialog"><header><i>${icon}</i><div><h3>Résultats ${format}</h3><p>${esc(className(state.classId))} · Période ${state.period}</p></div><button data-export-close>×</button></header><main><h4>Que souhaitez-vous faire ?</h4><button class="export-choice save"><b>↓</b><span><strong>Enregistrer</strong><small>Conserver le fichier sur l’appareil</small></span><em>›</em></button><button class="export-choice share"><b>↗</b><span><strong>Envoyer</strong><small>Choisir Mail, WhatsApp, Drive…</small></span><em>›</em></button><button class="export-cancel" data-export-close>Annuler</button></main></section>`;document.body.appendChild(overlay);overlay.querySelectorAll("[data-export-close]").forEach(b=>b.onclick=()=>overlay.remove());overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};overlay.querySelector(".save").onclick=()=>{overlay.remove();format==="Excel"?exportGymObsCsv():printGymObsPdf()};overlay.querySelector(".share").onclick=()=>{overlay.remove();format==="Excel"?shareGymObsCsv():printGymObsPdf()}}
  function printGymObsPdf(){const w=open("","_blank");if(!w)return alert("Autorisez les fenêtres surgissantes.");w.document.write(`<html><head><meta charset=utf-8><title>Observation gymnastique</title><style>body{font:12px Arial;color:#123a59;padding:24px}header{background:#087dca;color:white;padding:18px;border-radius:12px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cad8e3;padding:6px;text-align:center}th:first-child,td:first-child{text-align:left}@media print{button{display:none}}</style></head><body><header><h1>Observation Gymnastique</h1><p>${esc(className(state.classId))} · Période ${state.period} · ${new Date().toLocaleDateString("fr-FR")}</p></header><table><tr><th>Élève</th>${Array.from({length:state.numFigures},(_,i)=>`<th>Figure ${i+1}</th>`).join("")}<th>Note /${state.numFigures}</th></tr>${exportRows().map(r=>`<tr><td>${esc(r[0])} ${esc(r[1])}</td>${r.slice(2,-1).map(v=>`<td>${esc(v)}</td>`).join("")}<td>${esc(r.at(-1))}</td></tr>`).join("")}</table><button onclick="print()">Enregistrer / imprimer en PDF</button></body></html>`);w.document.close()}
  Object.assign(globalThis,{renderGymObservationWeb,ouvrirObservationGymnastiqueDepuisClasse});
})();
