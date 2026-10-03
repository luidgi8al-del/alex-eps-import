/* Workflows communs : contexte explicite, groupes modifiables et sauvegardes reprises. */
(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = v => structuredClone(v);
  function offerUndo(restore, target=toolPanel) {
    target.querySelector('#toolUndo')?.remove();
    const button=document.createElement('button');button.id='toolUndo';button.className='secondary';button.textContent='Annuler la dernière remise à zéro / suppression';
    button.onclick=async()=>{button.disabled=true;await restore();button.remove()};
    (target.querySelector('.tool-savebar, .running-save-actions')||target).append(button);
  }
  const fr = v => Number(v).toLocaleString('fr-FR');
  const LEVELS = [['6A',5],['5C',4.5],['5B',4],['5A',3.5],['4C',3],['4B',2.5],['4A',2],['3C',1.5],['3B',1],['3A',0.5]];
  const PROGRESS = [['Voie réussie',5],['5e dégaine',4],['4e dégaine',3],['3e dégaine',2],['2e dégaine',1],['1re dégaine',0]];
  const CRITERIA = ['Placement précis des pieds','Bras tendus dans les phases adaptées','Poussée sur les jambes','Équilibre et placement du bassin','Lecture de la voie','Fluidité des déplacements'];
  function climbScore(v) {
    if (!v || [v.progress,v.level,v.technique,v.belay].some(x => x === '' || x == null)) return null;
    const difficulty = LEVELS.find(([l]) => l === v.level)?.[1];
    const p = Number(v.progress), t = Number(v.technique), b = Number(v.belay);
    if (difficulty == null || !PROGRESS.some(([,n])=>n===p) || ![t,b].every(n=>Number.isFinite(n)&&n>=0&&n<=5)) return null;
    return p+difficulty+t+b;
  }
  const periods = classId => {const c=toolClasses.find(c=>c.id===classId);return c?planningPeriodCount(c.grade):5};
  const className = id => toolClasses.find(c=>c.id===id)?.name || 'Usage libre';
  function csv(name,rows){EpsToolWorks.download(name,'\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\r\n'),'text/csv;charset=utf-8')}
  function stateFor(saved,defaults={}) {return {classId:saved?.classId||'',period:saved?.period||1,id:saved?.id||null,title:saved?.title||'',createdAt:saved?.createdAt||null,groups:[],assignments:{},activeGroup:'',freeNames:'Participant libre',values:{},...clone(defaults),...clone(saved?.payload||{})};}
  async function pupils(state) {
    if(state.classId){await loadToolStudents(state.classId);return [...toolStudents]}
    return state.freeNames.split('\n').map((n,i)=>({id:'free-'+i,first_name:n.trim(),last_name:''})).filter(s=>s.first_name);
  }
  function context(state) {return `<section class="field-tool-card"><div class="field-tool-row"><label>Classe<select id="wfClass"><option value="">Usage libre (sans classe)</option>${toolClasses.map(c=>`<option value="${esc(c.id)}" ${c.id===state.classId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>Période<select id="wfPeriod">${Array.from({length:periods(state.classId)},(_,i)=>`<option value="${i+1}" ${i+1===state.period?'selected':''}>P${i+1}</option>`).join('')}</select></label></div>${!state.classId?`<label>Participants libres (un nom par ligne)<textarea id="wfFree" rows="3">${esc(state.freeNames)}</textarea></label>`:''}</section>`;}
  function bindContext(state,draw) {
    const select=document.getElementById('wfClass');select.onchange=async()=>{
      if(!confirm('Changer de classe et commencer un nouveau travail ? Enregistrez auparavant les saisies à conserver.')){select.value=state.classId;return}
      state.scores={};state.step=0;state.title='';state.classId=select.value;state.period=Math.min(state.period,periods(state.classId));state.id=null;state.createdAt=null;state.values={};state.groups=[];state.assignments={};state.activeGroup='';state.sessionId=null;state.resultIds={};await draw();
    };
    document.getElementById('wfPeriod').onchange=e=>{state.period=+e.target.value};
    const free=document.getElementById('wfFree');if(free)free.onchange=()=>{state.freeNames=free.value;draw()};
  }
  function groupsHtml(state,students) {
    const defaultSize=Math.max(2,Math.min(10,+state.autoGroupSize||4));
    return `<section class="field-tool-card common-groups"><div class="field-tool-row"><label>Affichage<select id="wfGroup"><option value="">Sans groupe · ordre alphabétique</option>${state.groups.map(g=>`<option value="${esc(g.id)}" ${g.id===state.activeGroup?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label><button id="wfAddGroup" class="secondary">＋ Groupe libre</button></div><div class="common-group-auto"><label>Élèves par groupe<input id="wfAutoGroupSize" type="number" min="2" max="10" value="${defaultSize}"></label><button id="wfAutoGroups" class="secondary">Répartition automatique</button></div><details ${state.editGroups?'open':''}><summary>Modifier les groupes et les élèves</summary>${state.groups.map(g=>`<div class="field-tool-row"><input aria-label="Nom du groupe" data-wf-group-name="${esc(g.id)}" value="${esc(g.name)}"><button class="danger" data-wf-group-delete="${esc(g.id)}">Supprimer ce groupe</button></div>`).join('')}${state.groups.length?`<div class="fitness-table-wrap"><table><thead><tr><th>Élève</th><th>Groupe</th></tr></thead><tbody>${students.map(s=>`<tr><td>${esc(studentLabel(s))}</td><td><select data-wf-assign="${esc(s.id)}"><option value="">Non affecté</option>${state.groups.map(g=>`<option value="${esc(g.id)}" ${String(state.assignments[s.id])===String(g.id)?'selected':''}>${esc(g.name)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>`:'<p>Aucun groupe : tous les élèves restent affichés.</p>'}</details></section>`;
  }
  function bindGroups(state,draw) {
    document.getElementById('wfGroup').onchange=e=>{state.activeGroup=e.target.value;draw()};
    document.getElementById('wfAddGroup').onclick=()=>{const name=prompt('Nom du groupe',`Groupe ${state.groups.length+1}`);if(!name?.trim())return;state.groups.push({id:crypto.randomUUID(),name:name.trim()});state.editGroups=true;draw()};
    document.getElementById('wfAutoGroups').onclick=async()=>{const size=Math.max(2,Math.min(10,+document.getElementById('wfAutoGroupSize').value||4));if(state.groups.length&&!confirm('Remplacer les groupes actuels par une répartition automatique ? Les résultats sont conservés.'))return;const students=await pupils(state),previous=clone({groups:state.groups,assignments:state.assignments,activeGroup:state.activeGroup,autoGroupSize:state.autoGroupSize});state.autoGroupSize=size;const count=Math.max(1,Math.ceil(students.length/size));state.groups=Array.from({length:count},(_,i)=>({id:String(i+1),name:`Groupe ${i+1}`}));state.assignments={};students.forEach((student,index)=>state.assignments[student.id]=state.groups[Math.floor(index/size)]?.id||'');state.activeGroup='';state.editGroups=true;await draw();offerUndo(async()=>{Object.assign(state,previous);await draw()})};
    toolPanel.querySelectorAll('[data-wf-group-name]').forEach(e=>e.onchange=()=>{state.groups.find(g=>g.id===e.dataset.wfGroupName).name=e.value.trim()||'Groupe';state.editGroups=true;draw()});
    toolPanel.querySelectorAll('[data-wf-group-delete]').forEach(e=>e.onclick=async()=>{if(!confirm('Supprimer ce groupe ? Les résultats des élèves seront conservés.'))return;const previous=clone({groups:state.groups,assignments:state.assignments,activeGroup:state.activeGroup});const id=e.dataset.wfGroupDelete;state.groups=state.groups.filter(g=>g.id!==id);Object.keys(state.assignments).forEach(k=>{if(state.assignments[k]===id)delete state.assignments[k]});if(state.activeGroup===id)state.activeGroup='';state.editGroups=true;await draw();offerUndo(async()=>{Object.assign(state,previous);await draw()})});
    toolPanel.querySelectorAll('[data-wf-assign]').forEach(e=>e.onchange=()=>{state.assignments[e.dataset.wfAssign]=e.value;state.editGroups=true;draw()});
  }
  const visible=(state,list)=>state.activeGroup?list.filter(s=>String(state.assignments[s.id])===String(state.activeGroup)):list;
  function actions(){return `<div class="tool-savebar"><button id="wfSave">💾 Enregistrer</button><button id="wfNew" class="secondary">＋ Nouvelle saisie</button><button id="wfResume" class="secondary">↻ Retrouver</button><button id="wfExport" class="secondary">▦ Exporter</button></div><div class="tool-dangerbar"><button id="wfReset" class="danger">↺ Réinitialiser les résultats</button></div><p id="wfStatus" role="status"></p>`}
  function bindActions(type,state,draw,exporter,reset,open) {
    document.getElementById('wfSave').onclick=async()=>{
      const name=state.title||prompt('Nom du travail',type);if(!name)return;const button=document.getElementById('wfSave'),status=document.getElementById('wfStatus');button.disabled=true;
      try {const {id,title,classId,period,createdAt,...payload}=state;const w=await EpsToolWorks.save(type,name,{...clone(payload),id,createdAt},{classId:classId||null,period});state.id=w.id;state.title=w.title;state.createdAt=w.createdAt;status.textContent=`Enregistré · ${className(classId)} · P${period}.`;}catch(e){status.textContent='Enregistrement impossible : '+e.message}finally{button.disabled=false}
    };
    document.getElementById('wfResume').onclick=()=>EpsToolWorks.library(type,'Mes travaux',open);
    document.getElementById('wfExport').onclick=exporter;
    document.getElementById('wfNew').onclick=async()=>{if(!confirm('Commencer une nouvelle saisie ? Enregistrez auparavant le travail à conserver.'))return;state.id=null;state.createdAt=null;state.title='';state.values={};state.scores={};state.sessionId=null;state.resultIds={};reset?.();await draw()};
    document.getElementById('wfReset').textContent='↺ Réinitialiser les résultats';
    document.getElementById('wfReset').onclick=async()=>{if(!confirm('Effacer les résultats du travail en cours ? Les groupes et les travaux enregistrés sont conservés.'))return;const previous=clone(state);state.id=null;state.createdAt=null;state.title='';state.values={};reset?.();await draw();offerUndo(async()=>{Object.assign(state,previous);await draw()})};
  }
  async function renderClimbObservationWeb(saved) {
    await loadToolClasses();const state=stateFor(saved,{criteria:CRITERIA});
    async function draw(){const all=await pupils(state);toolPanel.innerHTML=toolHeader('🧗 Observation Escalade','Critères techniques · une ligne par élève')+context(state)+groupsHtml(state,all)+`<div class="fitness-web">${socleTableauHtml(state.criteria.map(t=>({titre:t})),visible(state,all).map(s=>({eleve:s,cellules:state.criteria.map((c,i)=>socleCouleurCelluleHtml(state.values[s.id]?.[i],`data-climb-observe="${esc(s.id)}" data-criterion="${i}"`)),total:null})),null)}</div><p class="muted">Vert + : atteint · Vert : presque atteint · Orange : en cours · Rouge : non atteint. Ces observations ne remplacent pas le contrôle de sécurité de l’enseignant.</p>${actions()}`;
      bindToolClose();bindContext(state,draw);bindGroups(state,draw);toolPanel.querySelectorAll('[data-climb-observe]').forEach(b=>b.onclick=()=>{const v=state.values[b.dataset.climbObserve]??={};v[b.dataset.criterion]=socleCouleurSuivante(v[b.dataset.criterion]);draw()});
      bindActions('climb-observation',state,draw,()=>csv('observation-escalade.csv',[['Élève',...state.criteria],...all.map(s=>[studentLabel(s),...state.criteria.map((_,i)=>state.values[s.id]?.[i]||'')])]),null,renderClimbObservationWeb);
    }await draw();
  }
  function selectOptions(items,value){return '<option value="">À évaluer</option>'+items.map(([label,n])=>`<option value="${esc(n)}" ${String(value)===String(n)?'selected':''}>${esc(label)}</option>`).join('')}
  async function renderClimbTestWeb(saved) {
    await loadToolClasses();const state=stateFor(saved,{sessionId:null,resultIds:{}});
    if(!saved && onRealClass()){state.classId=toolClassId;state.period=epsTestPeriod}
    async function draw(){const all=await pupils(state);toolPanel.innerHTML=toolHeader('🧗 Test Escalade /20','Progression /5 · difficulté /5 · technique /5 · assurage /5')+context(state)+groupsHtml(state,all)+`<div class="fitness-web climb-worksheet">${socleTableauHtml([{titre:'Progression /5'},{titre:'Difficulté /5'},{titre:'Technique de grimpe /5'},{titre:'Assurage /5'}],visible(state,all).map(s=>{const v=state.values[s.id]||{},attrs=`data-climb-student="${esc(s.id)}"`;return {eleve:s,cellules:[`<select ${attrs} data-climb-field="progress">${selectOptions(PROGRESS.map(([l,n])=>[`${l} · ${fr(n)} pt`,n]),v.progress)}</select>`,`<select ${attrs} data-climb-field="level">${selectOptions(LEVELS.map(([l,n])=>[`${l} · ${fr(n)} pt`,l]),v.level)}</select>`,...['technique','belay'].map(f=>`<input aria-label="${f==='technique'?'Technique':'Assurage'} de ${esc(studentLabel(s))}" type="number" min="0" max="5" step="any" ${attrs} data-climb-field="${f}" value="${esc(v[f]??'')}">`)],total:`<strong class="${climbScore(v)==null?'muted':''}" data-climb-total="${esc(s.id)}">${climbScore(v)==null?'À compléter':fr(climbScore(v))+' /20'}</strong>`}}),'Total /20')}</div><p class="muted">Le total reste « À compléter » tant que les quatre critères ne sont pas renseignés. Le zéro à la première dégaine est une note valide. Technique et assurage : notes de 0 à 5 attribuées par l’enseignant.</p>${actions()}`;
      bindToolClose();bindContext(state,draw);bindGroups(state,draw);
      toolPanel.querySelectorAll('[data-climb-field]').forEach(input=>input.oninput=()=>{const v=state.values[input.dataset.climbStudent]??={};v[input.dataset.climbField]=input.value;input.setCustomValidity(input.type==='number'&&input.value!==''&&(+input.value<0||+input.value>5)?'La note doit être comprise entre 0 et 5.':'');const total=climbScore(v),node=toolPanel.querySelector(`[data-climb-total="${input.dataset.climbStudent}"]`);node.textContent=total==null?'À compléter':fr(total)+' /20';node.classList.toggle("muted",total==null)});
      bindActions('climb-test',state,draw,()=>csv('test-escalade.csv',[['Élève','Progression /5','Voie','Difficulté /5','Technique /5','Assurage /5','Total /20'],...all.map(s=>{const v=state.values[s.id]||{};return [studentLabel(s),v.progress,v.level,LEVELS.find(([l])=>l===v.level)?.[1],v.technique,v.belay,climbScore(v)]})]),()=>{state.sessionId=null;state.resultIds={}},renderClimbTestWeb);
      // Un test de classe doit apparaître dans Tests EPS, et non seulement dans Divers.
      if(state.classId)document.getElementById('wfSave').onclick=async()=>{
        if(!toolPanel.querySelector('input:invalid')){const button=document.getElementById('wfSave'),msg=document.getElementById('wfStatus');button.disabled=true;try{
          const now=new Date().toISOString();state.sessionId??=crypto.randomUUID();state.createdAt??=Date.now();
          await enregistrerLigne('eps_test_sessions',{id:state.sessionId,user_id:session.user_id,class_id:state.classId,period_number:state.period,test_name:'Escalade /20',class_label:className(state.classId),created_at:state.createdAt,updated_at:now,deleted:false});
          for(const s of all){const v=state.values[s.id]||{},score=climbScore(v);state.resultIds[s.id]??=crypto.randomUUID();await enregistrerLigne('eps_test_results',{id:state.resultIds[s.id],user_id:session.user_id,session_id:state.sessionId,student_id:s.id,input_value:score??0,result_value:score??0,input_unit:'climb:'+JSON.stringify({version:1,value:v,groups:state.groups,assignments:state.assignments}),result_unit:score==null?'brouillon · À compléter':'/20',updated_at:now,deleted:false})}msg.textContent=`Enregistré dans Tests EPS · ${className(state.classId)} · P${state.period}.`;
        }catch(e){msg.textContent='Enregistrement impossible : '+e.message}finally{button.disabled=false}}else toolPanel.querySelector('input:invalid').reportValidity();
      };
      document.getElementById('wfResume').onclick=async()=>{
        try{const sessions=await lireTable('eps_test_sessions','eps_test_sessions?deleted=eq.false&select=*&order=created_at.desc',{ou:r=>!r.deleted&&r.test_name==='Escalade /20'});const rows=sessions.filter(r=>!r.deleted&&r.test_name==='Escalade /20'&&r.user_id===session.user_id);const panel=document.createElement('section');panel.className='field-tool-card';panel.innerHTML='<h3>Tests Escalade enregistrés</h3>'+rows.map(r=>`<button data-climb-open="${esc(r.id)}">${esc(r.class_label)} · P${r.period_number} · ${new Date(r.created_at).toLocaleDateString('fr-FR')}</button>`).join('')+'<button data-climb-free>Travaux en usage libre</button>';toolPanel.append(panel);panel.querySelectorAll('[data-climb-open]').forEach(b=>b.onclick=()=>openClimbTest(b.dataset.climbOpen));panel.querySelector('[data-climb-free]').onclick=()=>EpsToolWorks.library('climb-test','Tests libres',renderClimbTestWeb);panel.scrollIntoView({block:'nearest'});}catch(e){document.getElementById('wfStatus').textContent=e.message}
      };
    }await draw();
  }
  async function openClimbTest(id){const [r]=await lireTable('eps_test_sessions',`eps_test_sessions?id=eq.${id}&select=*`,{ou:r=>r.id===id});if(!r)throw Error('Test introuvable');const results=await lireTable('eps_test_results',`eps_test_results?session_id=eq.${id}&deleted=eq.false&select=*`,{ou:x=>x.session_id===id&&!x.deleted});const payload={values:{},sessionId:id,resultIds:{}};for(const x of results){const v=JSON.parse(String(x.input_unit).replace(/^climb:/,''));payload.values[x.student_id]=v.value;payload.groups=v.groups||[];payload.assignments=v.assignments||{};payload.resultIds[x.student_id]=x.id}await renderClimbTestWeb({classId:r.class_id,period:r.period_number,createdAt:r.created_at,payload})}
  globalThis.EpsToolWorkflow={esc,csv,stateFor,pupils,context,bindContext,groupsHtml,bindGroups,visible,actions,bindActions,offerUndo,climbScore,LEVELS,PROGRESS};
  Object.assign(globalThis,{renderClimbObservationWeb,renderClimbTestWeb,openClimbTest});
})();
