/* Calculators and draws use the same report actions, never a fabricated grade. */
(()=>{
 const W=EpsToolWorkflow;
 const definitions={
  measures:{title:'Mesures',render:renderMeasures,fields:['measureDistance','measureMinutes'],result:'measureResult',headers:['Distance (m)','Temps (minutes)','Vitesse et allure']},
  effort:{title:'Effort et intensité',render:renderEffortWeb,fields:['effAge','effRpe'],result:'effResult',headers:['Âge','Effort ressenti /10','Repères indicatifs']},
  random:{title:'Tirage au sort',render:renderRandomWeb,fields:[],result:'randomResult',headers:['Élève / participant tiré']}
 };
 async function render(type,saved){
  const def=definitions[type];await def.render();const host=toolPanel,owner=session?.user_id;let id=saved?.id,title=saved?.title||def.title,createdAt=saved?.createdAt;
  const cls=host.querySelector('#modernClass'),period=host.querySelector('#modernPeriod');
  if(saved&&cls){cls.value=saved.classId||'';await cls.onchange?.();if(period)period.value=String(saved.period||1)}
  const get=()=>({fields:Object.fromEntries(def.fields.map(key=>[key,host.querySelector('#'+key)?.value||''])),result:host.querySelector('#'+def.result)?.innerText||''});
  const set=payload=>{for(const key of def.fields){const input=host.querySelector('#'+key);if(input){input.value=payload?.fields?.[key]??(key==='effRpe'?'5':'');input.dispatchEvent(new Event('input',{bubbles:true}))}}if(type==='random')host.querySelector('#randomResult').textContent=payload?.result||'Prêt'};
  if(saved)set(saved.payload);
  const footer=document.createElement('section');footer.innerHTML=W.actions();host.append(footer);const find=id=>footer.querySelector('#'+id);
  find('wfSave').onclick=async()=>{const name=prompt('Nom du travail',title);if(!name)return;const b=find('wfSave');b.disabled=true;try{const saved=await EpsToolWorks.save(type,name,{...get(),id,createdAt},{classId:cls?.value||null,period:+period?.value||1});id=saved.id;title=saved.title;createdAt=saved.createdAt;find('wfStatus').textContent='Enregistré.'}catch(e){find('wfStatus').textContent='Enregistrement impossible : '+e.message}finally{b.disabled=false}};
  find('wfNew').onclick=()=>{if(confirm('Nouvelle saisie ? Enregistrez auparavant le travail à conserver.')){set({});id=null;createdAt=null}};
  find('wfResume').onclick=()=>EpsToolWorks.library(type,def.title,w=>render(type,w));
  find('wfReset').onclick=()=>{if(!confirm('Réinitialiser la saisie courante ? Les travaux enregistrés sont conservés.'))return;const before=get();set({});const expected=JSON.stringify(get()),classValue=cls?.value;W.offerUndo(()=>{if(!host.contains(footer)||session?.user_id!==owner||cls?.value!==classValue||JSON.stringify(get())!==expected)throw Error('La saisie a changé depuis.');set(before)})};
  find('wfExport').onclick=()=>{};
  EpsToolActionMenus.register(find('wfSave').closest('.tool-savebar'),{document:()=>{const payload=get();return{title:def.title,context:cls?.selectedOptions[0]?.textContent||'Usage libre',headers:def.headers,rows:[type==='random'?[payload.result]:[...def.fields.map(key=>payload.fields[key]),payload.result]]}}});
 }
 renderMeasures=()=>render('measures');renderEffortWeb=saved=>render('effort',saved);renderRandomWeb=saved=>render('random',saved);
})();
