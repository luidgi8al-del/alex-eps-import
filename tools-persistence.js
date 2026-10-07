/* Sauvegarde explicite des outils historiques qui ne conservaient que leur mémoire vive. */
(function(){
  const W=EpsToolWorkflow;
  const replace=(target,value)=>{Object.keys(target).forEach(k=>delete target[k]);Object.assign(target,structuredClone(value||{}))};
  const adapters={
    swim:{title:'Savoir Nager',draw:()=>drawSwimCertificate(),get:()=>({values:swimValidations}),set:p=>replace(swimValidations,p.values)},
    aptitudes:{title:'Aptitudes physiques 6e',draw:()=>drawAptitudes(),get:()=>({values:aptitudeValues,colors:aptitudeColors,mode:aptitudeMode}),set:p=>{replace(aptitudeValues,p.values);aptitudeColors=p.colors||{};aptitudeMode=p.mode||'couleur'}},
    impacts:{title:'Marqueur d’impacts',draw:()=>drawImpactMarker(),get:()=>({values:impactParEleve,points:impactPoints,sport:impactSport,student:impactEleveId}),set:p=>{impactParEleve=p.values||{};impactPoints=p.points||[];impactSport=p.sport||'Badminton';impactEleveId=p.student||null}},
    speed:{title:'Vitesse – passages',draw:()=>drawSpeedTracker(),get:()=>({values:speedTimes,groupAssignments:speedGroups,groupCount:speedGroupCount,group:speedActiveGroup,distance:speedDistance,mode:speedMode,colors:speedColors,commonGroups:globalThis.EpsCommonGroups?.encode("speed")}),set:p=>{speedRunning=false;speedTimes=p.values||{};speedGroups=p.groupAssignments||{};speedGroupCount=p.groupCount||1;speedActiveGroup=p.group||1;speedDistance=p.distance||30;speedMode=p.mode||'note';speedColors=p.colors||{};if(p.commonGroups)EpsCommonGroups.restore('speed','|workflow:'+p.commonGroups)}}
  };
  const states={},active={};
  const aptitudeTestName='Aptitudes physiques 6e';
  const aptitudeHasValue=v=>['sprint','endurance','jump'].some(key=>String(v?.[key]??'').trim()!=='');
  const aptitudeCreatedAt=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:Date.parse(value)||Date.now()};
  async function saveAptitudesSession(payload,{classId,period,id,createdAt,students}){
    const sessionId=id||crypto.randomUUID(),now=new Date().toISOString();
    const old=await lireTable('eps_test_results',`eps_test_results?session_id=eq.${sessionId}&deleted=eq.false&select=*`,{ou:r=>String(r.session_id)===String(sessionId)&&!r.deleted});
    const byStudent=new Map(old.map(row=>[String(row.student_id),row]));
    const cls=toolClasses.find(c=>String(c.id)===String(classId));
    await enregistrerLigne('eps_test_sessions',{id:sessionId,user_id:session.user_id,class_id:classId,period_number:period,test_name:aptitudeTestName,created_at:aptitudeCreatedAt(createdAt),class_label:cls?.name||'',updated_at:now,deleted:false});
    const workflow=payload.workflow||{},groups=workflow.groups||[],assignments=workflow.assignments||{},colors=payload.colors||{};
    const encoded=encodeURIComponent(JSON.stringify(workflow));
    const kept=new Set();
    for(const id of new Set([...students.map(student=>String(student.id)),...Object.keys(payload.values||{})])){
      const value=payload.values?.[id];
      if(!aptitudeHasValue(value))continue;
      const sprint=Number(String(value.sprint??'').replace(',','.'));
      const levels=['sprint','endurance','jump'].filter(key=>{
        const raw=String(value[key]??'').trim();
        if(!raw)return false;
        const n=Number(raw.replace(',','.'));
        return Number.isFinite(n)&&EpsTests.APTITUDE_LEVELS[key](n)==='Satisfaisant';
      }).length;
      const group=groups.findIndex(g=>String(g.id)===String(assignments[id]))+1;
      const previous=byStudent.get(id),resultId=previous?.id||crypto.randomUUID();kept.add(id);
      await enregistrerLigne('eps_test_results',{...(previous||{}),id:resultId,user_id:session.user_id,session_id:sessionId,student_id:id,input_value:Number.isFinite(sprint)?sprint:0,result_value:levels,input_unit:`sprint:${value.sprint??''}|palier:${value.endurance??''}|saut:${value.jump??''}|groupe:${group}|workflow:${encoded}|mode:${payload.mode||'couleur'}|couleur:${colors[id]||''}`,result_unit:'aptitudes /3',updated_at:now,deleted:false});
    }
    for(const row of old)if(!kept.has(String(row.student_id)))await enregistrerLigne('eps_test_results',{...row,deleted:true,updated_at:now});
    return sessionId;
  }
  async function migrateLegacyAptitudes(classId){
    if(!classId)return 0;
    const works=(await EpsToolWorks.read()).filter(w=>w.type==='aptitudes'&&String(w.classId)===String(classId));
    if(!works.length)return 0;
    // Une session supprimée reste une décision de l'enseignant : son identifiant empêche
    // l'ancienne sauvegarde encore présente dans « Travaux » de la recréer à chaque ouverture.
    const existing=await lireTable('eps_test_sessions',`eps_test_sessions?class_id=eq.${classId}&test_name=eq.${encodeURIComponent(aptitudeTestName)}&select=id,deleted`,{avecSupprimes:true,ou:r=>String(r.class_id)===String(classId)&&r.test_name===aptitudeTestName});
    const ids=new Set(existing.map(row=>String(row.id)));
    await loadToolClasses();
    const students=await lireTable('students',`students?class_id=eq.${classId}&deleted=eq.false&select=id`,{ou:r=>String(r.class_id)===String(classId)&&!r.deleted});
    let migrated=0;
    for(const work of works){
      if(!ids.has(String(work.id))){
        await saveAptitudesSession(work.payload,{classId,period:work.period,id:work.id,createdAt:work.createdAt,students});
        ids.add(String(work.id));migrated++;
      }
      // Garder la sauvegarde d'origine tant que l'enseignant n'a pas vérifié la reprise.
    }
    return migrated;
  }
  async function openAptitudesSession(id,classId,period){
    await loadToolClasses();toolClassId=classId;await loadToolStudents(classId);
    const sessions=await lireTable('eps_test_sessions',`eps_test_sessions?id=eq.${id}&deleted=eq.false&select=*`,{ou:r=>String(r.id)===String(id)&&!r.deleted});
    const saved=sessions[0];if(!saved)throw Error('Test introuvable');
    const rows=await lireTable('eps_test_results',`eps_test_results?session_id=eq.${id}&deleted=eq.false&select=*`,{ou:r=>String(r.session_id)===String(id)&&!r.deleted});
    const values={},colors={};let mode='couleur',workflow={groups:[],assignments:{},activeGroup:''};
    rows.forEach(row=>{const parts=Object.fromEntries(String(row.input_unit||'').split('|').filter(part=>part.includes(':')).map(part=>[part.slice(0,part.indexOf(':')),part.slice(part.indexOf(':')+1)]));
      values[row.student_id]={sprint:parts.sprint||'',endurance:parts.palier||'',jump:parts.saut||''};
      if(parts.couleur)colors[row.student_id]=parts.couleur;
      if(parts.mode)mode=parts.mode;
      if(parts.workflow){try{workflow=JSON.parse(decodeURIComponent(parts.workflow))}catch{}}
      if(!parts.workflow&&+parts.groupe>0){
        const groupId=`groupe-${parts.groupe}`;
        if(!workflow.groups.some(group=>group.id===groupId))workflow.groups.push({id:groupId,name:`Groupe ${parts.groupe}`});
        workflow.assignments[row.student_id]=groupId;
      }
    });
    active.aptitudes=classId;states.aptitudes={id:null,title:'',createdAt:saved.created_at,classId,period:+period||+saved.period_number||1,testSessionId:id,groups:workflow.groups||[],assignments:workflow.assignments||{},activeGroup:workflow.activeGroup||'',inTest:true,editGroups:false};
    adapters.aptitudes.set({values,colors,mode});
    toolPanel=document.getElementById('toolPanel');toolPanel.style.display='block';toolPanel.classList.add('modern-tool-panel');drawAptitudes();
  }
  function current(type){const key=toolClassId||FREE_USE;if(active[type]!==key){active[type]=key;adapters[type].set({});states[type]={id:null,title:'',createdAt:null,classId:onRealClass()?toolClassId:'',period:1,groups:[],assignments:{},activeGroup:'',inTest:false,editGroups:false}}return states[type]}
  function decorate(type){const a=adapters[type],state=current(type);if(!toolPanel.querySelector('#toolClass'))return;
    const period=document.createElement('section');period.className='field-tool-card';period.innerHTML=`<label>Période<select id="wfPeriod">${Array.from({length:state.classId?planningPeriodCount(toolClasses.find(c=>c.id===state.classId)?.grade):5},(_,i)=>`<option value="${i+1}" ${state.period===i+1?'selected':''}>P${i+1}</option>`).join('')}</select></label>`;const rosterCard=toolPanel.querySelector('#toolClass').closest('.card');rosterCard.after(period);period.querySelector('select').onchange=e=>state.period=+e.target.value;
    // Les données du travail restent toutes conservées quand on filtre un groupe.
    let anchor=period;
    if(type!=='speed'&&type!=='impacts'&&onRealClass()){
      const groupPanel=document.createElement('div');groupPanel.innerHTML=W.groupsHtml(state,toolStudents);period.after(groupPanel);anchor=groupPanel;W.bindGroups(state,a.draw);
      if(state.activeGroup)toolPanel.querySelectorAll('tr[data-student-id]').forEach(row=>row.hidden=state.assignments[row.dataset.studentId]!==state.activeGroup);
    }
    const work=document.createElement('div');work.className='wf-work';while(anchor.nextSibling)work.append(anchor.nextSibling);anchor.after(work);
    rosterCard.hidden=!!state.inTest;period.hidden=!!state.inTest;work.hidden=!state.inTest;
    if(!state.inTest){const start=document.createElement('button');start.id='wfStart';start.textContent=state.groups.length?'Commencer le test':'Commencer sans groupe';anchor.after(start);start.onclick=async()=>{const used=new Set(Object.values(state.assignments).map(String));const empty=state.groups.find(group=>!used.has(String(group.id)));if(empty)return alert(`${empty.name} est vide. Ajoutez un élève ou supprimez ce groupe.`);state.inTest=true;state.editGroups=false;if(state.groups.length&&!state.activeGroup)state.activeGroup=state.groups[0].id;await a.draw()}}
    const bar=document.createElement('div');bar.innerHTML=W.actions();toolPanel.append(bar);
    bar.hidden=!state.inTest;
    // Anciennes commandes de reset conservées dans le code, mais une seule commande visible.
    const resetIds={swim:'swimResetBtn',aptitudes:'aptResetBtn',impacts:'impactClear',speed:'speedResetBtn'};const oldReset=document.getElementById(resetIds[type]);if(oldReset)oldReset.hidden=true;
    document.getElementById('wfSave').onclick=async()=>{const button=document.getElementById('wfSave'),status=document.getElementById('wfStatus');button.disabled=true;try{const payload={...structuredClone(a.get()),workflow:{groups:state.groups,assignments:state.assignments,activeGroup:state.activeGroup},id:state.id,createdAt:state.createdAt};if(type==='aptitudes'&&state.classId){await loadToolClasses();const id=await saveAptitudesSession(payload,{classId:state.classId,period:state.period,id:state.testSessionId||state.id,createdAt:state.createdAt,students:toolStudents});state.testSessionId=id;state.createdAt??=Date.now();status.textContent=`Enregistré dans Tests EPS de la classe · P${state.period}.`;}else{const title=state.title||prompt('Nom du travail',a.title);if(!title)return;const saved=await EpsToolWorks.save(type,title,payload,{classId:state.classId||null,period:state.period});Object.assign(state,{id:saved.id,title:saved.title,createdAt:saved.createdAt});status.textContent=state.classId?'Enregistré dans Divers EPS de la classe · P'+state.period+'.':'Enregistré dans Mes travaux.';}}catch(e){status.textContent='Enregistrement impossible : '+e.message}finally{button.disabled=false}};
    document.getElementById('wfNew').onclick=async()=>{
      if(!confirm('Commencer une nouvelle saisie ? Enregistrez auparavant le test à conserver.'))return;
      a.set({...a.get(),values:{},colors:{}});
      Object.assign(state,{id:null,title:'',createdAt:null,testSessionId:null});
      await a.draw();
    };
    document.getElementById('wfResume').onclick=async()=>{if(type!=='aptitudes'||!state.classId)return EpsToolWorks.library(type,a.title,s=>renderPersistedTool(type,s));const status=document.getElementById('wfStatus');try{await migrateLegacyAptitudes(state.classId);const rows=await lireTable('eps_test_sessions',`eps_test_sessions?class_id=eq.${state.classId}&test_name=eq.${encodeURIComponent(aptitudeTestName)}&deleted=eq.false&select=*&order=created_at.desc`,{ou:r=>String(r.class_id)===String(state.classId)&&r.test_name===aptitudeTestName&&!r.deleted,trier:(a,b)=>aptitudeCreatedAt(b.created_at)-aptitudeCreatedAt(a.created_at)});toolPanel.querySelector('#aptitudeHistory')?.remove();const history=document.createElement('section');history.id='aptitudeHistory';history.className='field-tool-card';history.innerHTML=`<h3>Tests 6e enregistrés · ${rows.length}</h3>${rows.map(r=>`<button class="secondary" data-aptitude-open="${W.esc(r.id)}">${new Date(aptitudeCreatedAt(r.created_at)).toLocaleString('fr-FR')} · P${r.period_number}</button>`).join('')||'<p>Aucun test enregistré.</p>'}`;toolPanel.append(history);history.querySelectorAll('[data-aptitude-open]').forEach(b=>b.onclick=()=>openAptitudesSession(b.dataset.aptitudeOpen,state.classId,state.period));history.scrollIntoView({block:'nearest'});}catch(e){status.textContent='Historique indisponible : '+e.message}};
    document.getElementById('wfReset').textContent='↺ Réinitialiser les résultats';
    document.getElementById('wfReset').onclick=async()=>{if(!confirm('Effacer les résultats ? Les groupes et les travaux enregistrés sont conservés.'))return;const previous=structuredClone(a.get()),meta=structuredClone(state);a.set({...previous,values:{},points:[],colors:{}});Object.assign(state,{id:null,title:'',createdAt:null,testSessionId:null});await a.draw();W.offerUndo(async()=>{a.set(previous);Object.assign(state,meta);await a.draw()})};
    document.getElementById('wfExport').onclick=()=>{
      const list=onRealClass()?toolStudents:[{id:FREE_USE,first_name:'Participant',last_name:'libre'}],p=a.get();let rows;
      if(type==='swim')rows=[['Élève',...EpsTests.SWIM_STEPS],...list.map(s=>[studentLabel(s),...EpsTests.SWIM_STEPS.map((_,i)=>(p.values[s.id]||[]).includes(i)?'Oui':'Non')])];
      if(type==='aptitudes')rows=[['Élève','Sprint 30 m (s)','Palier','Saut (cm)','Couleur'],...list.map(s=>[studentLabel(s),p.values[s.id]?.sprint,p.values[s.id]?.endurance,p.values[s.id]?.jump,p.colors[s.id]])];
      if(type==='impacts')rows=[['Élève','Sport','Impact','X','Y'],...list.flatMap(s=>(onRealClass()?p.values[s.id]||[]:p.points).map((point,i)=>[studentLabel(s),p.sport,i+1,point.x,point.y]))];
      if(type==='speed')rows=[['Élève','Groupe','Passage','Temps cumulé (s)','Durée passage (s)','Vitesse (km/h)'],...list.flatMap(s=>(p.values[s.id]||[]).map((t,i,ts)=>{const d=t-(ts[i-1]||0);return [studentLabel(s),p.groupAssignments[s.id]||1,i+1,t,d,d>0?p.distance/d*3.6:'']}))];
      W.csv(type+'.csv',rows);
    };
  }
  const original={swim:drawSwimCertificate,aptitudes:drawAptitudes,impacts:drawImpactMarker,speed:drawSpeedTracker};
  function draw(type){current(type);original[type]();decorate(type)}
  drawSwimCertificate=()=>draw('swim');drawAptitudes=()=>draw('aptitudes');drawImpactMarker=()=>draw('impacts');drawSpeedTracker=()=>draw('speed');
  async function renderPersistedTool(type,saved){await loadToolClasses();toolClassId=saved.classId||FREE_USE;await loadToolStudents(toolClassId);active[type]=toolClassId;states[type]={id:saved.id,title:saved.title,createdAt:saved.createdAt,classId:saved.classId||'',period:saved.period||1,groups:[],assignments:{},activeGroup:'',...(saved.payload.workflow||{}),inTest:true,editGroups:false};adapters[type].set(structuredClone(saved.payload));adapters[type].draw()}
  globalThis.renderPersistedTool=renderPersistedTool;
  globalThis.EpsAptitudes={migrateLegacy:migrateLegacyAptitudes,openSession:openAptitudesSession};
})();
