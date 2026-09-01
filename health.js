let healthMode='dispense',healthClasses=[],healthStudents=[],healthDispenses=[],healthSelectedClassId=null,healthSelectedStudentId=null;
const healthEsc=value=>String(value??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const healthToday=()=>new Date().toISOString().slice(0,10);
function healthActive(row){const today=healthToday();return row.start_date<=today&&row.end_date>=today;}
async function healthFetch(path){const response=await apiFetch(`${SUPABASE_URL}/rest/v1/${path}`);return response.ok?response.json():[];}
async function initHealthTab(preselectedClassId=null){
  if(preselectedClassId)healthSelectedClassId=preselectedClassId;
  const host=document.getElementById('healthBody');if(!host)return;
  host.innerHTML='<div class="card muted">Chargement des données de santé…</div>';
  [healthClasses,healthStudents,healthDispenses]=await Promise.all([
    healthFetch('classes?deleted=eq.false&select=*&order=name'),
    healthFetch('students?deleted=eq.false&select=*&order=last_name,first_name'),
    healthFetch('health_dispensations?select=*&order=start_date.desc')
  ]);
  if(!healthSelectedClassId||!healthClasses.some(c=>c.id===healthSelectedClassId))healthSelectedClassId=healthClasses[0]?.id||null;
  renderHealthTab();
}
function renderHealthTab(){
 const host=document.getElementById('healthBody');if(!host)return;
 host.innerHTML=`<div class="healthHero"><div><span class="healthEyebrow">SUIVI DES ÉLÈVES</span><h1>Santé / Accident</h1><p>Dispenses, accidents et passages à l’infirmerie.</p></div><div class="healthHeroIcon">❤</div></div><div class="subtabbar healthTabs">${[['dispense','DISPENSE'],['accident','ACCIDENT'],['infirmerie','INFIRMERIE']].map(([id,label])=>`<button class="subtabbtn${healthMode===id?' active':''}" data-health-mode="${id}">${label}</button>`).join('')}</div><div id="healthModeBody"></div>`;
 host.querySelectorAll('[data-health-mode]').forEach(button=>button.onclick=()=>{healthMode=button.dataset.healthMode;renderHealthTab();});
 if(healthMode==='dispense')renderDispenseMode();else document.getElementById('healthModeBody').innerHTML=`<div class="card healthEmpty"><h2>${healthMode==='accident'?'Accidents':'Infirmerie'}</h2><p>Cette rubrique est prête. Son formulaire sera ajouté à l’étape suivante.</p></div>`;
}
function renderDispenseMode(){
 const body=document.getElementById('healthModeBody'),classStudents=healthStudents.filter(s=>s.class_id===healthSelectedClassId),current=healthDispenses.filter(d=>d.class_id===healthSelectedClassId&&healthActive(d));
 const selected=healthStudents.find(s=>s.id===healthSelectedStudentId);
 body.innerHTML=`<div class="card healthControls"><label>Classe<select id="healthClassSelect">${healthClasses.map(c=>`<option value="${healthEsc(c.id)}" ${c.id===healthSelectedClassId?'selected':''}>${healthEsc(c.name)}</option>`).join('')}</select></label><span class="healthCount">${current.length} dispense(s) en cours</span></div>${healthClasses.length?`<div class="healthGrid"><section class="card"><h2>Élèves de la classe</h2><div class="healthStudentList">${classStudents.map(student=>{const active=healthDispenses.find(d=>d.student_id===student.id&&healthActive(d));return `<button class="healthStudent ${student.id===healthSelectedStudentId?'selected':''}" data-health-student="${healthEsc(student.id)}"><span>${healthEsc(student.last_name.toUpperCase())} ${healthEsc(student.first_name)}</span><small>${active?`Dispensé jusqu’au ${new Date(active.end_date+'T12:00:00').toLocaleDateString('fr-FR')}`:'Ajouter une dispense'}</small></button>`}).join('')||'<p class="muted">Aucun élève dans cette classe.</p>'}</div></section><section class="card" id="healthEditor">${selected&&selected.class_id===healthSelectedClassId?dispenseEditorHtml(selected):'<div class="healthEmpty"><h2>Nouvelle dispense</h2><p>Sélectionnez la ligne d’un élève.</p></div>'}</section></div><section class="card"><h2>Dispenses en cours</h2>${current.length?`<table><thead><tr><th>Élève</th><th>Début</th><th>Fin</th><th></th></tr></thead><tbody>${current.map(d=>{const s=healthStudents.find(x=>x.id===d.student_id);return `<tr><td>${healthEsc(s?`${s.last_name.toUpperCase()} ${s.first_name}`:'Élève')}</td><td>${healthEsc(d.start_date)}</td><td>${healthEsc(d.end_date)}</td><td><button class="secondary healthDelete" data-id="${d.id}">Supprimer</button></td></tr>`}).join('')}</tbody></table>`:'<p class="muted">Aucune dispense en cours.</p>'}</section>`:'<div class="card healthEmpty">Créez d’abord une classe.</div>'}`;
 const select=document.getElementById('healthClassSelect');if(select)select.onchange=()=>{healthSelectedClassId=select.value;healthSelectedStudentId=null;renderDispenseMode();};
 body.querySelectorAll('[data-health-student]').forEach(button=>button.onclick=()=>{healthSelectedStudentId=button.dataset.healthStudent;renderDispenseMode();});
 const form=document.getElementById('dispenseForm');if(form)form.onsubmit=saveDispense;
 body.querySelectorAll('.healthDelete').forEach(button=>button.onclick=()=>deleteDispense(button.dataset.id));
}
function dispenseEditorHtml(student){
 const history=healthDispenses.filter(d=>d.student_id===student.id);
 return `<h2>${healthEsc(student.last_name.toUpperCase())} ${healthEsc(student.first_name)}</h2><form id="dispenseForm"><label>Début de la dispense<input type="date" id="dispenseStart" value="${healthToday()}" required></label><label>Fin de la dispense<input type="date" id="dispenseEnd" value="${healthToday()}" required></label><button type="submit">Valider la dispense</button></form><h3>Historique de l’élève</h3>${history.length?history.map(d=>`<div class="healthHistory"><span>${healthEsc(d.start_date)} → ${healthEsc(d.end_date)}</span><strong>${healthActive(d)?'En cours':'Terminée'}</strong></div>`).join(''):'<p class="muted">Aucune dispense enregistrée.</p>'}`;
}
async function saveDispense(event){event.preventDefault();const start=document.getElementById('dispenseStart').value,end=document.getElementById('dispenseEnd').value;if(!start||!end||end<start){alert('La date de fin doit être postérieure ou égale à la date de début.');return;}const response=await apiFetch(`${SUPABASE_URL}/rest/v1/health_dispensations`,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({user_id:session.user_id,class_id:healthSelectedClassId,student_id:healthSelectedStudentId,start_date:start,end_date:end})});const rows=await response.json();if(rows[0])healthDispenses.unshift(rows[0]);renderDispenseMode();}
async function deleteDispense(id){if(!confirm('Supprimer cette dispense ?'))return;await apiFetch(`${SUPABASE_URL}/rest/v1/health_dispensations?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});healthDispenses=healthDispenses.filter(d=>d.id!==id);renderDispenseMode();}
function openClassDispenses(classId){healthSelectedClassId=classId;healthMode='dispense';showTab('health');}
