/* Shared wire format with PortableToolWork.kt. No student-name matching or foreign local IDs. */
(function(root){
 'use strict';
 const aliases={'tools/measures':'measures','tools/effort':'effort','tools/random-picker':'random','tools/tournament':'tournament','tools/observer':'observer','tools/workshop-rotations':'rotations','tools/speed-tracker':'speed','tools/multi-chrono':'multi-free','tools/impact-marker':'impacts','tools/bac-climb':'bac-climb'};
 const type=value=>aliases[value]||value;
 function payload(kind,value){
  const p=typeof value==='string'?JSON.parse(value):structuredClone(value||{});
  if(!p||Array.isArray(p)||typeof p!=='object')throw Error('Le contenu du travail est illisible.');
  if((p._epsWorkVersion||1)>1)throw Error('Ce travail nécessite une mise à jour du site.');
  if(kind.startsWith('tools/')&&!aliases[kind])throw Error('Ce format Android ne dispose pas encore d’un éditeur web compatible. Le travail reste conservé ; ouvrez-le dans l’APK.');
  if(!aliases[kind]||p._epsWorkVersion)return p;
  // These legacy formats have no device-local student references and can be upgraded safely.
  switch(type(kind)){
   case 'measures':return{fields:{measureDistance:p.distance??'',measureMinutes:p.minutes??''},_epsWorkVersion:1};
   case 'effort':return{fields:{effAge:p.age??'',effRpe:String(p.rpe??5)},resting:p.resting,_epsWorkVersion:1};
   case 'random':return{result:p.result||'',_epsWorkVersion:1};
   case 'tournament':return{teams:p.names||'',scores:Object.fromEntries((p.scores||[]).map(s=>[JSON.stringify([s.a,s.b]),[s.x??'',s.y??'']])),_epsWorkVersion:1};
   default:throw Error('Ancien format Android : ouvrez ce travail sur l’appareil d’origine, puis enregistrez-le à nouveau pour le partager.');
  }
 }
 function row(r){
  let p={},compatibilityError=null;
  try{p=payload(r.type,r.payload)}catch(e){compatibilityError=e.message}
  return{id:r.id,type:type(r.type),title:r.title,classId:r.class_id||null,period:+r.period_number||1,payload:p,createdAt:r.created_at,updatedAt:r.updated_at,_raw:r,compatibilityError};
 }
 function writable(previous,next){
  if(previous?.compatibilityError)throw Error(previous.compatibilityError);
  const p={...(previous?.payload||{}),...structuredClone(next),_epsWorkVersion:1};
  delete p.id;delete p.createdAt;delete p.classId;delete p.period;
  return p;
 }
 function multiSession(s,results,students){
  const groups=[],indices=new Map(),names=new Map(students.map(e=>[String(e.id),`${e.last_name||''} ${e.first_name||''}`.trim()]));
  const timers=results.filter(r=>r.session_id===s.id&&!r.deleted).map(r=>{let meta={};try{meta=JSON.parse(String(r.input_unit||'').replace(/^multi-chrono\|/,''))}catch{}const id=String(r.student_id),g=Number(meta.group);if(Number.isInteger(g)&&g>=0){if(!indices.has(g)){indices.set(g,groups.length);groups.push([])}groups[indices.get(g)].push(id)}return{id,name:names.get(id)||'Élève à synchroniser',ms:Math.max(0,+r.input_value||0),running:false,start:0}});
  return{id:s.id,type:'multi-free',title:s.class_label?`Multi-chrono · ${s.class_label}`:'Multi-chrono',classId:s.class_id,period:+s.period_number||1,createdAt:new Date(Number(s.created_at)||Date.parse(s.created_at)).toISOString(),updatedAt:s.updated_at,payload:{_epsWorkVersion:1,timers,groups,activeGroup:-1}};
 }
 async function classTests(tests,classId){
  const rows=await lireTable('eps_saved_tool_works',`eps_saved_tool_works?class_id=eq.${classId}&select=*`,{avecSupprimes:true,ou:w=>String(w.class_id)===String(classId)});
  const works=rows.filter(r=>r.user_id===session.user_id&&['multi-free','bac-climb'].includes(type(r.type))),ids=new Set(works.map(r=>r.id));
  return [...tests.filter(t=>!ids.has(t.id)),...works.filter(r=>!r.deleted).map(r=>({id:r.id,user_id:r.user_id,class_id:r.class_id,period_number:r.period_number,test_name:type(r.type)==='bac-climb'?'Escalade · AFL1 /12':'Multi-chrono',class_label:r.title,created_at:Date.parse(r.created_at),updated_at:r.updated_at,deleted:false,_toolWork:r}))];
 }
 function completed(test,students){
  if(type(test?._toolWork?.type)!=='bac-climb')return null;
  try{const p=row(test._toolWork).payload;return students.filter(s=>root.EpsBacClimbModel.total(p.values?.[s.id],p.manual)!=null).length}catch{return 0}
 }
 const api={type,payload,row,writable,multiSession,classTests,completed};root.EpsPortableWorks=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
