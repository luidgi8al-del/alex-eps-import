/* Explicit completion is separate from grades. Uses the existing synced work store. */
(function(){
 const TYPE='assessment-status',cache=new Map();
 const owner=()=>typeof session!=='undefined'?session?.user_id:null;
 const key=(account,classId)=>`${account}:${classId}`;
 const stateKey=(kind,id)=>`${kind}:${id}`;
 function entry(classId){const k=key(owner(),classId);if(!cache.has(k))cache.set(k,{loaded:false,pending:null,rows:new Map(),error:''});return cache.get(k);}
 function completed(classId,kind,id,automatic){const row=entry(classId).rows.get(stateKey(kind,id));return row?row.completed:automatic;}
 async function load(classId,refresh=false){
  const account=owner(),store=entry(classId);if(store.pending)return store.pending;if(store.loaded&&!refresh)return false;
  store.pending=(async()=>{try{
   const rows=await lireTable('eps_saved_tool_works',`eps_saved_tool_works?type=eq.${TYPE}&class_id=eq.${encodeURIComponent(classId)}&select=*`,{ou:r=>!r.deleted&&r.type===TYPE&&String(r.class_id)===String(classId)&&r.user_id===account});
   if(owner()!==account)return false;
   store.rows.clear();for(const row of rows){try{const p=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;if(p&&['evaluation','test'].includes(p.kind)&&typeof p.recordId==='string'&&typeof p.completed==='boolean')store.rows.set(stateKey(p.kind,p.recordId),{...p,raw:row});}catch{}}
   store.error='';return true;
  }catch{store.error='Le statut de fin ne peut pas être chargé pour le moment. Les notes sont conservées.';return true;}
  finally{store.loaded=true;store.pending=null;}})();return store.pending;
 }
 async function set(classId,period,kind,source,done){
  const account=owner();if(!account)throw Error('Reconnectez-vous avant de modifier le statut.');
  await load(classId);if(owner()!==account)throw Error('Le compte a changé.');
  const store=entry(classId),previous=store.rows.get(stateKey(kind,String(source.id))),now=new Date().toISOString();
  const payload={_epsWorkVersion:1,kind,recordId:String(source.id),completed:!!done};
  const row={id:`assessment-status-${account}-${kind}-${source.id}`,user_id:account,type:TYPE,title:'Statut de fin de séance',payload:JSON.stringify(payload),class_id:classId,period_number:Number(period)||1,created_at:previous?.raw?.created_at||now,updated_at:now,deleted:false};
  await enregistrerLigne('eps_saved_tool_works',row);if(owner()!==account)return;
  store.rows.set(stateKey(kind,String(source.id)),{...payload,raw:row});store.loaded=true;
 }
 function day(value){const d=new Date(Number(value)||value);if(Number.isNaN(+d))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
 function timestamp(value,date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Choisissez une date valide.');const [y,m,d]=date.split('-').map(Number),old=new Date(Number(value)||value),result=Number.isNaN(+old)?new Date():new Date(old);result.setFullYear(y,m-1,d);if(result.getFullYear()!==y||result.getMonth()!==m-1||result.getDate()!==d)throw Error('Choisissez une date valide.');return +result;}
 async function changeDate(kind,source,date){
  const account=owner();if(!account)throw Error('Reconnectez-vous avant de modifier la date.');const now=new Date().toISOString();
  const write=async(table,row)=>{if(owner()!==account)throw Error('Le compte a changé.');await enregistrerLigne(table,row);};
  if(kind==='evaluation'){
   const stamp=timestamp(source.date_epoch_millis,date);
   await write('evaluations',{id:source.id,user_id:source.user_id||account,cycle_id:source.cycle_id,type:source.type,label:source.label,date_epoch_millis:stamp,updated_at:now,deleted:false});
   source.date_epoch_millis=stamp;
   if(typeof dashboardEvaluations!=='undefined')for(const row of dashboardEvaluations)if(row.id===source.id)row.date_epoch_millis=stamp;
  }else if(source._toolWork){
   const raw=source._toolWork,stamp=timestamp(raw.created_at,date);await write('eps_saved_tool_works',{...raw,created_at:new Date(stamp).toISOString(),updated_at:now});raw.created_at=new Date(stamp).toISOString();source.created_at=stamp;
  }else{
   const stamp=timestamp(source.created_at,date),row={id:source.id,user_id:source.user_id||account,class_id:source.class_id,period_number:source.period_number,test_name:source.test_name,created_at:stamp,updated_at:now,deleted:false};if(Object.hasOwn(source,'class_label'))row.class_label=source.class_label;
   await write('eps_test_sessions',row);source.created_at=stamp;
  }
 }
 function dateDialog(kind,source,onSaved){
  const account=owner(),dialog=document.createElement('dialog');dialog.className='running-bilan-dialog';dialog.style.maxWidth='440px';
  const value=kind==='evaluation'?source.date_epoch_millis:source.created_at;
  dialog.innerHTML='<h2>Modifier la date</h2><p>Choisissez la date réelle de la séance. Les notes et les élèves resteront inchangés.</p><label for="assessmentDateInput">Date de la séance</label><input id="assessmentDateInput" type="date" required><p role="status"></p><div class="bilan-footer"><button data-save-date>Enregistrer la date</button><button class="secondary" data-close-date>Annuler</button></div>';
  const input=dialog.querySelector('input');input.value=day(value);document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove());let busy=false;
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});dialog.querySelector('[data-close-date]').onclick=()=>dialog.close();
  dialog.querySelector('[data-save-date]').onclick=async()=>{if(!input.reportValidity())return;if(owner()!==account){dialog.querySelector('[role=status]').textContent='Le compte a changé. Fermez cette fenêtre.';return;}
   busy=true;dialog.querySelectorAll('input,button').forEach(el=>el.disabled=true);
   try{await changeDate(kind,source,input.value);dialog.close();if(owner()===account)onSaved?.();}catch(e){dialog.querySelector('[role=status]').textContent=e.message;busy=false;dialog.querySelectorAll('input,button').forEach(el=>el.disabled=false);}
  };
 }
 function actions(kind,source,classId,period,automatic,onSaved){const done=completed(classId,kind,source.id,automatic);return[
  {libelle:done?'Remettre dans À reprendre':'Marquer comme terminée',action:async()=>{try{await set(classId,period,kind,source,!done);onSaved?.();}catch(e){alert('Le statut n’a pas pu être enregistré : '+e.message);}}},
  {libelle:'Modifier la date',action:()=>dateDialog(kind,source,onSaved)}
 ];}
 globalThis.EpsAssessmentStatus={completed,load,set,changeDate,day,timestamp,actions,error:classId=>entry(classId).error};
})();
