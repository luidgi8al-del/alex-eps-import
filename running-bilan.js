(function(){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const methods={mean:'Moyenne simple',progress:'Moyenne + évolution',recent:'Résultats récents privilégiés'};
 const date=s=>new Date(Number(s.created_at)||s.created_at).toLocaleDateString('fr-FR');
 const number=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:2});
 rootOpen();
 function rootOpen(){globalThis.openRunningBilan=async function(options={}){
  const owner=session?.user_id,classId=options.classId||toolClassId,period=options.period||epsTestPeriod,students=[...(options.students||toolStudents)];
  if(!owner||!classId||classId==='__libre__')throw Error('Choisissez une classe et enregistrez les séances avant de calculer le bilan.');
  const dialog=document.createElement('dialog');dialog.className='running-bilan-dialog';dialog.innerHTML='<h2>Bilan 3 × 500 m · Note finale /20</h2><p>Chargement des séances enregistrées de la classe…</p><button data-close>Fermer</button>';document.body.append(dialog);dialog.showModal();
  let busy=false,done=false,step=1,scope='all',start='',end='',plan=null,acceptMixed=false;
  const settings={mode:'progress',performanceCap:1,regularityCap:1,penalty:.5,penaltyCap:2};
  const selected=new Set(),edits=new Map(),justified=new Set();
  const current=()=>dialog.isConnected&&session?.user_id===owner;
  dialog.addEventListener('close',()=>dialog.remove());dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  async function read(table,query,filter){
   if(!current())throw Error('Le compte a changé. Fermez ce bilan.');
   let rows;
   if(typeof modeHorsConnexion!=='undefined'&&modeHorsConnexion)rows=(await modeHorsConnexion.lire(table,{ou:r=>!r.deleted&&filter(r)})).rows;
   else if(typeof apiFetchAll==='function'){const res=await apiFetchAll(`${SUPABASE_URL}/rest/v1/${table}?deleted=eq.false&${query}&select=*`);if(!res.ok)throw Error('Chargement incomplet. Réessayez avant de calculer la note.');rows=res.rows;}
   else {const res=await apiFetch(`${SUPABASE_URL}/rest/v1/${table}?deleted=eq.false&${query}&select=*`);if(!res.ok)throw Error('Chargement impossible. Réessayez.');rows=await res.json();}
   if(!current())throw Error('Le compte a changé.');return rows.filter(r=>!r.deleted&&filter(r));
  }
  try{
   const sessions=await read('eps_test_sessions',`class_id=eq.${encodeURIComponent(classId)}&test_name=eq.${encodeURIComponent('3 × 500 m')}`,s=>String(s.class_id)===String(classId)&&s.test_name==='3 × 500 m');
   sessions.sort((a,b)=>(Number(a.created_at)||Date.parse(a.created_at))-(Number(b.created_at)||Date.parse(b.created_at))||String(a.id).localeCompare(String(b.id)));
   const results=[];
   for(let i=0;i<sessions.length;i+=40){const ids=sessions.slice(i,i+40).map(s=>String(s.id)),wanted=new Set(ids);results.push(...await read('eps_test_results',`session_id=in.(${ids.map(encodeURIComponent).join(',')})`,r=>wanted.has(String(r.session_id))));}
   const cycles=await read('cycles',`class_id=eq.${encodeURIComponent(classId)}`,c=>String(c.class_id)===String(classId));
   const evaluations=cycles.length?await read('evaluations',`cycle_id=in.(${cycles.map(c=>encodeURIComponent(c.id)).join(',')})&type=eq.FINALE`,e=>e.type==='FINALE'&&cycles.some(c=>c.id===e.cycle_id)):[];
   const byResult=new Map(results.map(r=>[`${r.session_id}:${r.student_id}`,r]));
   let cycleId=cycles[0]?.id||'',target='';
   const entriesFor=student=>sessions.filter(s=>selected.has(String(s.id))).map(s=>RunningBilan.entry(byResult.get(`${s.id}:${student.id}`),s)).filter(Boolean);
   const summaryFor=student=>RunningBilan.calculate(entriesFor(student),{...settings,justified:sessions.filter(s=>justified.has(`${student.id}:${s.id}`)).map(s=>String(s.id))});
   function visibleSessions(){return sessions.filter(s=>{
    if(scope==='period'&&+s.period_number!==+period)return false;
    const stamp=new Date(Number(s.created_at)||s.created_at),day=Number.isNaN(+stamp)?'':`${stamp.getFullYear()}-${String(stamp.getMonth()+1).padStart(2,'0')}-${String(stamp.getDate()).padStart(2,'0')}`;
    return (!start||day>=start)&&(!end||day<=end);
   });}
   function chooseVisible(){selected.clear();visibleSessions().forEach(s=>selected.add(String(s.id)));}
   chooseVisible();
   function reset(){edits.clear();plan=null;acceptMixed=false;paint();}
   function saveChecks(rows){
    const mixed=rows.filter(r=>r.incompatible),button=dialog.querySelector('[data-save]');
    const check=document.createElement('section');check.className='bilan-save-check';check.setAttribute('aria-label','Vérification avant enregistrement');
    if(mixed.length){
     check.innerHTML=`<p><strong>Conditions différentes pour ${mixed.length} élève(s) :</strong> ${mixed.map(r=>esc(studentLabel(r.student))).join(', ')}.</p><p>Leurs séances mélangent des difficultés ou les modes marche/course. Aucun bonus ni malus d’évolution ne leur est appliqué. Vous pouvez décocher les séances concernées en haut, ou confirmer la note affichée ci-dessous.</p><label class="bilan-justification"><input type="checkbox" data-mixed-conditions ${acceptMixed?'checked':''}><span>Pour ces élèves, je valide la note affichée /20, sans bonus ni malus d’évolution.</span></label>`;
     const oldWarning=dialog.querySelector('[role=alert]');if(oldWarning)oldWarning.textContent='Des séances ne sont pas comparables pour certains élèves. Une confirmation est proposée près du bouton d’enregistrement, en bas.';
     check.querySelector('input').onchange=e=>{acceptMixed=e.target.checked;button.disabled=busy||!cycleId||!rows.some(r=>r.score!=null)||!acceptMixed;};
    }else if(!cycleId)check.innerHTML='<p>Choisissez un cycle de destination avant d’enregistrer.</p>';
    else if(!rows.some(r=>r.score!=null))check.innerHTML='<p>Aucune note à enregistrer : sélectionnez au moins une séance contenant un 3 × 500 m complet.</p>';
    if(check.innerHTML)dialog.querySelector('.bilan-footer').before(check);
    button.disabled=busy||!cycleId||!rows.some(r=>r.score!=null)||(mixed.length>0&&!acceptMixed);
   }
   function sessionChoices(){return `<div class="bilan-session-actions"><button type="button" class="secondary" data-all>Tout sélectionner</button><button type="button" class="secondary" data-none>Tout décocher</button></div><div class="bilan-sessions">${visibleSessions().map(s=>`<label><input type="checkbox" data-session="${esc(s.id)}" ${selected.has(String(s.id))?'checked':''}><span>${esc(date(s))} · P${esc(s.period_number)}<small>${students.reduce((n,student)=>n+(RunningBilan.entry(byResult.get(`${s.id}:${student.id}`),s)?.status==='complete'?1:0),0)} résultat(s) complet(s) en 3 × 500 m</small></span></label>`).join('')||'<p>Aucune séance dans cette sélection.</p>'}</div>`;}
   function scopeFields(){return `<label>Séances à utiliser<select data-scope><option value="all" ${scope==='all'?'selected':''}>Toutes les périodes de cette classe</option><option value="period" ${scope==='period'?'selected':''}>Période ${period}</option></select></label><div class="bilan-two"><label>À partir du<input type="date" data-start value="${start}"></label><label>Jusqu’au<input type="date" data-end value="${end}"></label></div><p class="muted">Pour un cycle, sélectionnez ses dates ou cochez ses séances. Enregistrez vos dernières saisies avant d’ouvrir le bilan.</p>`;}
   function incompleteHtml(student){return entriesFor(student).filter(e=>e.status==='incomplete').map(e=>`<label class="bilan-justification"><input type="checkbox" data-justify="${esc(student.id)}:${esc(e.id)}" ${justified.has(`${student.id}:${e.id}`)?'checked':''}><span>${esc(date(sessions.find(s=>String(s.id)===e.id)))} · ${e.done}/3 courses · Justifié, sans malus<small>Dispense, blessure ou problème de chronométrage</small></span></label>`).join('');}
   function paint(message=''){
    if(!current())return;
    if(step===1){dialog.innerHTML=`<h2>Choisir les séances · 3 × 500 m</h2><p>Le bilan donnera une note finale sur 20.</p>${scopeFields()}${sessionChoices()}<p role="status">${selected.size} séance(s) sélectionnée(s).</p><div class="bilan-footer"><button data-continue ${selected.size?'':'disabled'}>Continuer</button><button class="secondary" data-close>Annuler</button></div>`;}
    else{
     const rows=students.map(student=>({student,...summaryFor(student)})),incompatible=rows.some(r=>r.incompatible);
     const finals=evaluations.filter(e=>e.cycle_id===cycleId);if(target&&!finals.some(e=>e.id===target))target='';
     dialog.innerHTML=`<h2>Bilan 3 × 500 m · Note finale /20</h2><details><summary>${selected.size} séance(s) sélectionnée(s) — modifier</summary>${scopeFields()}${sessionChoices()}</details><label>Méthode<select data-method>${Object.entries(methods).map(([k,v])=>`<option value="${k}" ${settings.mode===k?'selected':''}>${v}</option>`).join('')}</select></label>${settings.mode==='progress'?`<div class="bilan-two"><label>Bonus/malus chrono maximal /20<input type="number" data-config="performanceCap" min="0" max="20" step="0.25" value="${settings.performanceCap}"></label><label>Bonus/malus régularité maximal /20<input type="number" data-config="regularityCap" min="0" max="20" step="0.25" value="${settings.regularityCap}"></label></div><p>Évolution séparée de la performance et de la régularité, convertie en points /20. À partir de 4 séances complètes : moyenne des 2 premières comparée aux 2 dernières. Avec 2 ou 3 séances : première et dernière. Avec une seule : aucun ajustement.</p>`:settings.mode==='recent'?'<p>Les deux dernières séances complètes ont un coefficient 2 ; les précédentes un coefficient 1.</p>':'<p>Moyenne des notes /12 des séances complètes, convertie sur 20.</p>'}<details><summary>Séances incomplètes : malus et justifications</summary><div class="bilan-two"><label>Malus par séance incomplète /20<input type="number" min="0" max="20" step="0.25" data-config="penalty" value="${settings.penalty}"></label><label>Malus total maximal /20<input type="number" min="0" max="20" step="0.25" data-config="penaltyCap" value="${settings.penaltyCap}"></label></div><p>1 ou 2 temps sur 3 : séance incomplète, sans troisième temps inventé. Cochez « Justifié » dans le détail de l’élève pour neutraliser le malus. Absence sans temps : aucun malus automatique. Sans séance complète : non évalué.</p></details><p class="muted">Réglage pédagogique personnalisé. Les séances /12 restent inchangées. Les formats 250 m et les autres nombres de courses sont exclus. Un temps invalide est signalé, sans malus automatique.</p>${incompatible?'<p role="alert">Des modes course/marche ou difficultés différents sont mélangés pour un élève. Décochez les séances non comparables avant de valider.</p>':''}<div class="bilan-students">${rows.map((r,i)=>`<article class="bilan-student"><div class="bilan-student-head"><strong>${esc(studentLabel(r.student))}${r.incompatible?' ⚠':''}</strong><label>Finale /20<input type="number" min="0" max="20" step="0.01" data-score="${i}" value="${esc(edits.get(String(r.student.id))??r.score??'')}" ${r.score==null?'disabled':''}></label></div><p>${r.count} complète(s) · ${r.incomplete} incomplète(s)${r.invalid?` · ${r.invalid} résultat(s) à vérifier`:''}</p><details><summary>Voir le calcul et les justifications</summary><dl class="bilan-breakdown"><dt>Moyenne /20</dt><dd>${number(r.mean)}</dd><dt>Base ${settings.mode==='recent'?'pondérée ':''}/20</dt><dd>${number(r.base)}</dd><dt>Évolution chrono</dt><dd>${number(r.performanceAdjustment)}</dd><dt>Évolution régularité</dt><dd>${number(r.regularityAdjustment)}</dd><dt>Malus incomplets non justifiés (${r.charged})</dt><dd>−${number(r.penalty)}</dd><dt>Note proposée /20</dt><dd>${number(r.score)}</dd></dl>${r.chronoDelta!=null?`<p>Chrono moyen : ${r.chronoDelta>=0?'gain':'perte'} de ${number(Math.abs(r.chronoDelta))} s. Somme des écarts : ${r.gapDelta>=0?'réduction':'hausse'} de ${number(Math.abs(r.gapDelta))} s. Le bonus suit l’évolution des points du barème.</p>`:''}${incompleteHtml(r.student)}</details></article>`).join('')}</div><label>Cycle de destination<select data-cycle>${cycles.map(c=>`<option value="${esc(c.id)}" ${c.id===cycleId?'selected':''}>${esc(c.apsa_name||c.label||'Cycle')}</option>`).join('')}</select></label><label>Évaluation finale<select data-target><option value="">Créer une évaluation finale 3 × 500 m /20</option>${finals.map(e=>`<option value="${esc(e.id)}" ${e.id===target?'selected':''}>${esc(e.label)}</option>`).join('')}</select></label><p>Une colonne sur 20 sera ajoutée après votre validation. Les notes proposées restent modifiables.${cycles.length?'':' Créez d’abord un cycle pour cette classe.'}</p><p role="status">${esc(message)}</p><div class="bilan-footer"><button data-save ${busy||incompatible||!cycleId||!rows.some(r=>r.count)?'disabled':''}>Ajouter à l’évaluation finale /20</button><button data-close class="secondary" ${busy?'disabled':''}>Fermer</button></div>`;
     saveChecks(rows);
     dialog.querySelector('[data-method]').onchange=e=>{settings.mode=e.target.value;reset()};
     dialog.querySelectorAll('[data-config]').forEach(input=>input.onchange=()=>{const n=Number(input.value);if(!Number.isFinite(n)||n<0||n>20){input.setCustomValidity('Valeur entre 0 et 20');input.reportValidity();return;}settings[input.dataset.config]=n;reset()});
     dialog.querySelectorAll('[data-justify]').forEach(input=>input.onchange=()=>{input.checked?justified.add(input.dataset.justify):justified.delete(input.dataset.justify);reset()});
     dialog.querySelectorAll('[data-score]').forEach(input=>input.oninput=()=>{edits.set(String(rows[+input.dataset.score].student.id),input.value);plan=null;});
     dialog.querySelector('[data-cycle]').onchange=e=>{cycleId=e.target.value;plan=null;paint()};dialog.querySelector('[data-target]').onchange=e=>{target=e.target.value;plan=null;};
     dialog.querySelector('[data-save]').onclick=()=>save(rows);
    }
    dialog.querySelector('[data-close]').onclick=()=>{if(!busy)dialog.close()};
    dialog.querySelectorAll('[data-session]').forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.session):selected.delete(input.dataset.session);reset()});
    dialog.querySelector('[data-all]').onclick=()=>{chooseVisible();reset()};dialog.querySelector('[data-none]').onclick=()=>{selected.clear();reset()};
    dialog.querySelector('[data-scope]').onchange=e=>{scope=e.target.value;chooseVisible();reset()};
    for(const field of ['start','end'])dialog.querySelector(`[data-${field}]`).onchange=e=>{if(field==='start')start=e.target.value;else end=e.target.value;chooseVisible();reset()};
    dialog.querySelector('[data-continue]')?.addEventListener('click',()=>{step=2;paint();dialog.scrollTop=0});
    if(plan?.started&&!done)dialog.querySelectorAll('input,select,button').forEach(field=>{field.disabled=!field.matches('[data-save],[data-close]')});
   }
   async function write(table,row){if(!current())throw Error('Le compte a changé. Enregistrement arrêté.');if(typeof modeHorsConnexion!=='undefined'&&modeHorsConnexion)return modeHorsConnexion.enregistrer(table,row.id,row);const response=await apiFetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(row)});if(!response.ok)throw Error('Enregistrement interrompu. Réessayez sans modifier le bilan.');}
   async function save(rows){
    if(busy||done||!current())return;
    if(!cycleId||!rows.some(r=>r.score!=null)||(rows.some(r=>r.incompatible)&&!acceptMixed)){
     dialog.querySelector('.bilan-save-check')?.scrollIntoView({block:'center'});return;
    }
    const invalid=[...dialog.querySelectorAll('input,select')].find(field=>!field.checkValidity());
    if(invalid){
     for(let parent=invalid.parentElement;parent&&parent!==dialog;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
     dialog.querySelector('[role=status]').textContent='Une valeur empêche l’enregistrement. Corrigez le champ signalé, puis réessayez.';
     invalid.scrollIntoView({block:'center'});invalid.reportValidity();return;
    }
    const notes=rows.filter(r=>r.score!=null).map(r=>({id:r.student.id,value:edits.get(String(r.student.id))??String(r.score)}));
    if(notes.some(n=>String(n.value).trim()===''||!Number.isFinite(Number(n.value))||+n.value<0||+n.value>20)){paint('Vérifiez les notes : valeurs entre 0 et 20.');return;}
    if(!plan){const now=new Date().toISOString(),evaluationId=target||crypto.randomUUID(),criterionId=crypto.randomUUID();
     const auditJustifications=students.flatMap(student=>sessions.filter(s=>selected.has(String(s.id))&&justified.has(student.id+':'+s.id)).map(s=>studentLabel(student)+' '+date(s))).join('; ');
     const label=`Bilan 3 × 500 m /20 — ${methods[settings.mode]} — chrono ±${settings.performanceCap}, régularité ±${settings.regularityCap}, incomplet −${settings.penalty} (max ${settings.penaltyCap}) — séances : ${sessions.filter(s=>selected.has(String(s.id))).map(date).join(', ')}${auditJustifications?` — justifications : ${auditJustifications}`:''}`;
     const mixedAudit=acceptMixed?' — conditions différentes, sans évolution pour : '+rows.filter(r=>r.incompatible).map(r=>studentLabel(r.student)).join(', '):'';
     plan={evaluation:target?null:{id:evaluationId,user_id:owner,cycle_id:cycleId,type:'FINALE',label:'Bilan 3 × 500 m /20',date_epoch_millis:Date.now(),updated_at:now,deleted:false},criterion:{id:criterionId,user_id:owner,evaluation_id:evaluationId,label:label+mixedAudit,max_points:20,order_index:100,updated_at:now,deleted:false},scores:notes.map(n=>({id:crypto.randomUUID(),user_id:owner,criterion_id:criterionId,student_id:n.id,points:+n.value,updated_at:now,deleted:false}))};
    }
    plan.started=true;busy=true;paint('Enregistrement…');dialog.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
    try{if(plan.evaluation)await write('evaluations',plan.evaluation);await write('evaluation_criteria',plan.criterion);for(const score of plan.scores)await write('evaluation_scores',score);done=true;if(current()){dialog.innerHTML='<h2>Bilan ajouté à l’évaluation finale /20</h2><p>La colonne sur 20 est disponible dans le cycle choisi. Les séances d’origine restent inchangées.</p><button data-close>Fermer</button>';dialog.querySelector('button').onclick=()=>dialog.close();}}
    catch(e){busy=false;if(current())paint(e.message+' Réessayez pour terminer le même bilan, sans créer une deuxième colonne.');}
   }
   paint();dialog.scrollTop=0;
  }catch(e){if(current())dialog.querySelector('p').textContent=e.message;}
 };}
})();
