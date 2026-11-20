/* BAC marker and AFL2/3 use the existing portable result wire format, before :times:. */
(function(){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const state={enabled:false,cycle:'',afl:{},cycles:[],owner:null,classId:null};
 const number=v=>String(v??'').trim()===''?null:Number(String(v).replace(',','.'));
 const marker=id=>`bac-${id}`;
 function decode(unit){const u=String(unit||'');return{enabled:u.includes(':bac:1:'),cycle:u.match(/:bac-cycle:([^:]*)/)?.[1]||'',afl:u.match(/:afl23:([^:]*)/)?.[1]||''};}
 function wire(){return state.enabled?`:bac:1:bac-cycle:${state.cycle}:afl23:__AFL__`:'';}
 async function read(table,query,filter){let rows;if(typeof modeHorsConnexion!=='undefined'&&modeHorsConnexion)rows=(await modeHorsConnexion.lire(table,{ou:r=>!r.deleted&&filter(r)})).rows;else{const r=await apiFetch(`${SUPABASE_URL}/rest/v1/${table}?deleted=eq.false&${query}&select=*`);if(!r.ok)throw Error('Chargement de l’évaluation bac impossible.');rows=await r.json();}return rows.filter(r=>!r.deleted&&filter(r));}
 function reset(){state.enabled=false;state.cycle='';state.afl={};}
 function full(s){const r=runningSummary(s),raw=runningValues[s.id]||[];return runningDistance===500&&runningCount===3&&raw.length===3&&raw.every(v=>compactRunningSeconds(v)!=null)&&r?.total!=null?r.total:null;}
 async function loadFinal(){if(!runningSessionId)return;const criterion=marker(runningSessionId)+'-afl23';const rows=await read('evaluation_scores',`criterion_id=eq.${criterion}`,r=>String(r.criterion_id)===criterion);rows.forEach(r=>{state.afl[r.student_id]=r.points==null?'':String(r.points)});}
 function totalUpdates(){const host=document.getElementById('runningBacPanel');if(!host)return;host.querySelectorAll('[data-bac-afl1]').forEach(el=>{const s=toolStudents.find(s=>String(s.id)===el.dataset.bacAfl1),a=full(s);el.textContent=a==null?'—':EpsTests.fr(a,2);const b=number(state.afl[s.id]);host.querySelector(`[data-bac-total="${s.id}"]`).textContent=a!=null&&b!=null&&Number.isFinite(b)&&b>=0&&b<=8?EpsTests.fr(a+b,2):'—';});}
 async function render(){
  const host=document.getElementById('epsTestBody');if(!host||epsOpenTest!=='TROIS_500')return;
  document.getElementById('runningBacPanel')?.remove();
  const panel=document.createElement('section');panel.id='runningBacPanel';panel.className='card running-bac-panel';
  panel.innerHTML=`<label class="running-bac-choice"><input id="runningIsBac" type="checkbox" ${state.enabled?'checked':''} ${!onRealClass()?'disabled':''}><strong>Cette séance est l’épreuve bac</strong></label>${state.enabled?`<p>AFL1 /12 + AFL2/3 /8 = note bac /20. Enregistrer crée ou met à jour la même évaluation dans Finales.</p><label>Cycle de destination<select id="runningBacCycle">${state.cycles.map(c=>`<option value="${esc(c.id)}" ${c.id===state.cycle?'selected':''}>${esc(c.apsa_name||c.label||'Cycle')} ${esc(c.priority_objective||'')}</option>`).join('')}</select></label>${!state.cycles.length?'<p role="alert">Créez d’abord un cycle pour cette classe, puis rouvrez le test.</p>':''}${runningDistance!==500||runningCount!==3?'<p role="alert">L’épreuve bac nécessite le format 3 × 500 m.</p>':''}<div style="overflow:auto"><table><thead><tr><th>Élève</th><th>AFL1 /12</th><th>AFL2/3 /8</th><th>Bac /20</th></tr></thead><tbody>${toolStudents.map(s=>`<tr><th>${esc(studentLabel(s))}</th><td data-bac-afl1="${esc(s.id)}"></td><td><input type="number" min="0" max="8" step="0.25" data-bac-afl23="${esc(s.id)}" value="${esc(state.afl[s.id]??'')}" aria-label="AFL2/3 sur 8 — ${esc(studentLabel(s))}"></td><td data-bac-total="${esc(s.id)}"></td></tr>`).join('')}</tbody></table></div><p class="muted">Une case vide reste non évaluée : elle ne vaut pas zéro. Vous pouvez enregistrer l’épreuve puis compléter l’AFL2/3 plus tard.</p>`:''}`;
  host.prepend(panel);document.getElementById('runningIsBac').onchange=e=>{if(!e.target.checked&&runningSessionRecord&&Object.values(runningResultRecords).some(r=>decode(r.input_unit).enabled)){e.target.checked=true;alert('Cette séance est déjà enregistrée comme épreuve bac. Créez une nouvelle saisie pour un entraînement.');return;}state.enabled=e.target.checked;EpsToolSave.dirty();void render();};
  document.getElementById('runningBacCycle')?.addEventListener('change',e=>{state.cycle=e.target.value;EpsToolSave.dirty();});
  panel.querySelectorAll('[data-bac-afl23]').forEach(input=>input.oninput=()=>{state.afl[input.dataset.bacAfl23]=input.value;EpsToolSave.dirty();totalUpdates();globalThis.EpsToolResume?.capture();});totalUpdates();
  const owner=session?.user_id,classId=toolClassId;
  if(state.owner!==owner||state.classId!==classId){state.owner=owner;state.classId=classId;state.cycles=[];try{const cycles=await read('cycles',`class_id=eq.${encodeURIComponent(classId)}`,c=>String(c.class_id)===String(classId));if(session?.user_id!==owner||toolClassId!==classId)return;state.cycles=cycles;if(!cycles.some(c=>c.id===state.cycle))state.cycle=(cycles.find(c=>c.priority_objective===`planning-period-${epsTestPeriod}`)||cycles[0])?.id||'';void render();}catch(e){if(panel.isConnected)panel.insertAdjacentHTML('beforeend',`<p role="alert">${esc(e.message)}</p>`);}}
 }
 async function syncFinal(){
  const owner=session.user_id,id=marker(runningSessionId),now=new Date().toISOString();
  const previous=(await read('evaluations',`id=eq.${id}`,r=>String(r.id)===id))[0];
  async function write(table,row){if(session?.user_id!==owner)throw Error('Le compte a changé.');await enregistrerLigne(table,row);}
  await write('evaluations',{...(previous||{}),id,user_id:owner,cycle_id:previous?.cycle_id||state.cycle,type:'FINALE',label:'Évaluation bac · 3 × 500 m',date_epoch_millis:Number(runningCreatedAt)||Date.parse(runningCreatedAt)||Date.now(),updated_at:now,deleted:false});
  for(const [suffix,label,max,index] of [['afl1','AFL1 · 3 × 500 m',12,0],['afl23','AFL2/3',8,1]]){
   const criterion=id+'-'+suffix;await write('evaluation_criteria',{id:criterion,user_id:owner,evaluation_id:id,label,max_points:max,order_index:index,updated_at:now,deleted:false});
   for(const s of toolStudents){const value=suffix==='afl1'?full(s):number(state.afl[s.id]);await write('evaluation_scores',{id:criterion+'-'+s.id,user_id:owner,criterion_id:criterion,student_id:s.id,points:value,updated_at:now,deleted:value==null});}
  }
 }
 const paint=paintRunningSeriesTest;globalThis.paintRunningSeriesTest=function(test){paint(test);void render();};
 const clear=resetRunningSession;globalThis.resetRunningSession=function(...args){reset();return clear(...args);};
 const open=openRunningSession;globalThis.openRunningSession=async function(...args){reset();await open(...args);const rows=Object.values(runningResultRecords);state.enabled=rows.some(r=>decode(r.input_unit).enabled);rows.forEach(r=>{const v=decode(r.input_unit);if(v.enabled){state.cycle=v.cycle;state.afl[r.student_id]=v.afl;}});if(state.enabled&&!state.saving)await loadFinal();await render();};
 const save=saveRunningSeries;globalThis.saveRunningSeries=async function(test,asNew){
  try{
   if(state.enabled){if(runningDistance!==500||runningCount!==3)throw Error('L’épreuve bac nécessite 3 courses de 500 m.');if(!state.cycles.some(c=>c.id===state.cycle))throw Error('Choisissez le cycle de destination.');if(Object.values(state.afl).some(v=>number(v)!=null&&(!Number.isFinite(number(v))||number(v)<0||number(v)>8)))throw Error('Les notes AFL2/3 doivent être comprises entre 0 et 8.');}
   state.saving=true;await save(test,asNew);if(state.enabled){await syncFinal();const msg=document.getElementById('runningMsg');if(msg)msg.textContent='Épreuve bac enregistrée dans Évaluations → Finales. AFL1 /12 + AFL2/3 /8 = /20.';}
  }catch(e){globalThis.EpsToolSave?.failed();alert(e.message+' Gardez ce tableau ouvert et réessayez Enregistrer.');}finally{state.saving=false;}
 };
 document.addEventListener('input',e=>{if(e.target.matches('[data-run-student]'))totalUpdates();});
 globalThis.RunningBac={state,decode,wire,render,reset};
})();
