/* Même éditeur de groupes pour les tests simples, la VMA et les passages. */
(function(){
  const W=EpsToolWorkflow,states={};
  const adapters={
    eps:{get:()=>({assign:epsGenericGroupAssignments,count:epsGenericGroupCount,active:epsGenericActiveGroup}),set:s=>{epsGenericGroupAssignments=s.assignments;epsGenericGroupCount=s.groups.length?Math.max(2,...s.groups.map(g=>+g.id)):1;epsGenericActiveGroup=+s.activeGroup||0},draw:()=>drawEpsTestBody(epsOpenTest),records:()=>epsGenericResultRecords},
    vma:{get:()=>({assign:vmaGroupAssignments,count:vmaGroupCount,active:vmaActiveGroup}),set:s=>{vmaGroupAssignments=s.assignments;vmaGroupCount=s.groups.length?Math.max(2,...s.groups.map(g=>+g.id)):1;vmaActiveGroup=+s.activeGroup||0},draw:()=>drawVmaTest(),records:()=>vmaResultRecords},
    speed:{get:()=>({assign:speedGroups,count:speedGroupCount,active:speedActiveGroup}),set:s=>{speedGroups=s.assignments;speedGroupCount=s.groups.length?Math.max(...s.groups.map(g=>+g.id)):1;speedActiveGroup=+s.activeGroup||0},draw:()=>drawSpeedTracker(),records:()=>({})}
  };
  function read(kind){const a=adapters[kind],g=a.get();if(!states[kind]||states[kind].source!==g.assign||states[kind].classId!==toolClassId){states[kind]={source:g.assign,classId:toolClassId,groups:g.count>1?Array.from({length:g.count},(_,i)=>({id:String(i+1),name:'Groupe '+(i+1)})):[],assignments:g.assign,activeGroup:g.active?String(g.active):''}}return states[kind]}
  function encoded(kind){const s=read(kind);return encodeURIComponent(JSON.stringify({groups:s.groups,assignments:s.assignments,activeGroup:s.activeGroup}))}
  function restore(kind,raw){try{const encoded=String(raw).match(/\|workflow:([^|]+)/)?.[1];if(!encoded)return;const value=JSON.parse(decodeURIComponent(encoded));const s={...value,classId:toolClassId};adapters[kind].set(s);s.source=adapters[kind].get().assign;states[kind]=s}catch{}}
  function decorate(kind){if(!onRealClass())return;const a=adapters[kind],s=read(kind);const target=kind==='eps'?document.getElementById('epsTestBody'):toolPanel;if(!target)return;
    const oldCount=document.getElementById(kind==='eps'?'genericGroupCount':kind==='vma'?'vmaGroupCount':'speedGroupCount');if(!oldCount)return;
    if(kind==='speed'){oldCount.closest('div').hidden=true;target.querySelectorAll('[data-speed-group]').forEach(b=>b.hidden=true);target.querySelectorAll('[data-speed-assign]').forEach(e=>e.hidden=true)}else oldCount.closest('.running-group-tabs').hidden=true;
    const host=document.createElement('div');host.innerHTML=W.groupsHtml(s,toolStudents);oldCount.closest(kind==='speed'?'.row':'.running-group-tabs').before(host);
    const redraw=()=>{a.set(s);s.source=a.get().assign;return a.draw()};W.bindGroups(s,redraw);
    // Identifiants numériques stables pour la compatibilité avec les résultats existants.
    if(document.getElementById('wfAddGroup'))document.getElementById('wfAddGroup').onclick=()=>{const name=prompt('Nom du groupe',`Groupe ${s.groups.length+1}`);if(!name?.trim())return;const id=String(Math.max(0,...s.groups.map(g=>+g.id))+1);s.groups.push({id,name:name.trim()});toolStudents.forEach(p=>{s.assignments[p.id]??=0});s.editGroups=true;redraw()};
    target.querySelectorAll('[data-wf-assign]').forEach(e=>e.onchange=()=>{s.assignments[e.dataset.wfAssign]=+e.value||0;s.editGroups=true});
    target.querySelectorAll('[data-wf-group-delete]').forEach(e=>e.onclick=async()=>{if(!confirm('Supprimer ce groupe sans effacer les résultats ?'))return;const previous=structuredClone({groups:s.groups,assignments:s.assignments,activeGroup:s.activeGroup});const id=e.dataset.wfGroupDelete;s.groups=s.groups.filter(g=>g.id!==id);Object.keys(s.assignments).forEach(k=>{if(String(s.assignments[k])===id)s.assignments[k]=0});if(s.activeGroup===id)s.activeGroup='';s.editGroups=true;await redraw();W.offerUndo(async()=>{Object.assign(s,previous);await redraw()},target)});
    // La liste commune remplace le sélecteur numérique dans chaque ligne.
    const cells=target.querySelectorAll(kind==='eps'?'[data-generic-student-group]':kind==='vma'?'[data-vma-student-group]':'[data-speed-assign]');cells.forEach(e=>{const cell=e.closest('td');if(cell){const index=cell.cellIndex;cell.hidden=true;cell.closest('table').querySelectorAll('thead tr').forEach(row=>{if(row.children[index])row.children[index].hidden=true})}});
    if(kind==='speed'){
      const start=document.getElementById('speedStartBtn');if(start)start.textContent=s.activeGroup?'Démarrer '+(s.groups.find(g=>g.id===s.activeGroup)?.name||'le groupe'):'Démarrer tous les élèves';
    }
    if(kind==='vma'&&!document.getElementById('vmaPeriod')){const p=document.createElement('label');p.innerHTML=`Période<select id="vmaPeriod">${Array.from({length:planningPeriodCount(toolClasses.find(c=>c.id===toolClassId)?.grade)},(_,i)=>`<option value="${i+1}" ${i+1===epsTestPeriod?'selected':''}>P${i+1}</option>`).join('')}</select>`;host.before(p);p.querySelector('select').onchange=e=>{epsTestPeriod=+e.target.value;if(vmaSessionRecord)vmaSessionRecord.period_number=epsTestPeriod;a.draw()}}
    if(kind==='eps'||kind==='vma'){const exportButton=document.createElement('button');exportButton.className='secondary';exportButton.textContent='▦ Exporter';exportButton.onclick=()=>{const values=kind==='eps'?epsGenericValues:vmaValues;W.csv(kind+'-resultats.csv',[['Élève','Groupe','Mesure'],...toolStudents.map(p=>[studentLabel(p),s.groups.find(g=>String(g.id)===String(s.assignments[p.id]))?.name||'',values[p.id]??''])])};target.querySelector('.running-save-actions')?.append(exportButton)}
  }
  const originalEps=drawEpsTestBody,originalVma=drawVmaTest,originalSpeed=drawSpeedTracker;
  drawEpsTestBody=async key=>{await originalEps(key);if(!['TROIS_500','ARRET_COURSE','ESCALADE'].includes(key))decorate('eps')};
  drawVmaTest=async()=>{await originalVma();decorate('vma')};
  drawSpeedTracker=()=>{originalSpeed();decorate('speed')};
  const openEps=openGenericTestSession,openVma=openVmaSession;
  openGenericTestSession=async(id,key)=>{await openEps(id,key);restore('eps',Object.values(epsGenericResultRecords)[0]?.input_unit);await drawEpsTestBody(key)};
  openVmaSession=async id=>{await openVma(id);if(vmaSessionRecord)epsTestPeriod=+vmaSessionRecord.period_number||1;vmaColors={};for(const r of Object.values(vmaResultRecords)){const unit=String(r.input_unit||'');const mode=unit.match(/\|mode:(note|couleur)/)?.[1];if(mode){vmaMode=mode;vmaModeChoisi=true}const color=unit.match(/\|couleur:([a-z-]+)/)?.[1];if(color)vmaColors[r.student_id]=color}restore('vma',Object.values(vmaResultRecords)[0]?.input_unit);await drawVmaTest()};
  globalThis.EpsCommonGroups={encode:encoded,restore,read};
})();
