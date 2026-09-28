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
  function current(type){const key=toolClassId||FREE_USE;if(active[type]!==key){active[type]=key;adapters[type].set({});states[type]={id:null,title:'',createdAt:null,classId:onRealClass()?toolClassId:'',period:1,groups:[],assignments:{},activeGroup:''}}return states[type]}
  function decorate(type){const a=adapters[type],state=current(type);if(!toolPanel.querySelector('#toolClass'))return;
    const period=document.createElement('section');period.className='field-tool-card';period.innerHTML=`<label>Période<select id="wfPeriod">${Array.from({length:state.classId?planningPeriodCount(toolClasses.find(c=>c.id===state.classId)?.grade):5},(_,i)=>`<option value="${i+1}" ${state.period===i+1?'selected':''}>P${i+1}</option>`).join('')}</select></label>`;toolPanel.querySelector('#toolClass').closest('.card').after(period);period.querySelector('select').onchange=e=>state.period=+e.target.value;
    // Les données du travail restent toutes conservées quand on filtre un groupe.
    if(type!=='speed'&&type!=='impacts'&&onRealClass()){
      const groupPanel=document.createElement('div');groupPanel.innerHTML=W.groupsHtml(state,toolStudents);period.after(groupPanel);W.bindGroups(state,a.draw);
      if(state.activeGroup)toolPanel.querySelectorAll('tr[data-student-id]').forEach(row=>row.hidden=state.assignments[row.dataset.studentId]!==state.activeGroup);
    }
    const bar=document.createElement('div');bar.innerHTML=W.actions();toolPanel.append(bar);
    // Anciennes commandes de reset conservées dans le code, mais une seule commande visible.
    const resetIds={swim:'swimResetBtn',aptitudes:'aptResetBtn',impacts:'impactClear',speed:'speedResetBtn'};const oldReset=document.getElementById(resetIds[type]);if(oldReset)oldReset.hidden=true;
    document.getElementById('wfSave').onclick=async()=>{const title=state.title||prompt('Nom du travail',a.title);if(!title)return;const button=document.getElementById('wfSave'),status=document.getElementById('wfStatus');button.disabled=true;try{const payload={...structuredClone(a.get()),workflow:{groups:state.groups,assignments:state.assignments,activeGroup:state.activeGroup},id:state.id,createdAt:state.createdAt};const saved=await EpsToolWorks.save(type,title,payload,{classId:state.classId||null,period:state.period});Object.assign(state,{id:saved.id,title:saved.title,createdAt:saved.createdAt});status.textContent=state.classId?'Enregistré dans Divers EPS de la classe · P'+state.period+'.':'Enregistré dans Mes travaux.';}catch(e){status.textContent='Enregistrement impossible : '+e.message}finally{button.disabled=false}};
    document.getElementById('wfResume').onclick=()=>EpsToolWorks.library(type,a.title,s=>renderPersistedTool(type,s));
    document.getElementById('wfReset').onclick=()=>{if(!confirm('Effacer toutes les données et tous les groupes du travail en cours ? Les travaux enregistrés sont conservés.'))return;a.set({});Object.assign(state,{id:null,title:'',createdAt:null,groups:[],assignments:{},activeGroup:''});a.draw()};
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
  async function renderPersistedTool(type,saved){await loadToolClasses();toolClassId=saved.classId||FREE_USE;await loadToolStudents(toolClassId);active[type]=toolClassId;states[type]={id:saved.id,title:saved.title,createdAt:saved.createdAt,classId:saved.classId||'',period:saved.period||1,groups:[],assignments:{},activeGroup:'',...(saved.payload.workflow||{})};adapters[type].set(structuredClone(saved.payload));adapters[type].draw()}
  globalThis.renderPersistedTool=renderPersistedTool;
})();
