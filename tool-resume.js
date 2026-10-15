/* Local drafts are account-scoped; the resume link never recreates a deleted server test. */
(function(){
 const owner=()=>typeof session!=='undefined'?session?.user_id:null;
 const key=()=>`eps_tool_resume:${owner()}`;
 let timer,lastSignature='',sequence=0;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function read(){try{const draft=JSON.parse(localStorage.getItem(key())||'null');return draft?.owner===owner()&&draft.kind==='running-draft'?draft:null}catch{return null}}
 function capture(){
  if(!owner()||!document.querySelector('.running-grid'))return;
  const payload={classId:toolClassId,period:epsTestPeriod,values:runningValues,groups:runningGroups,walking:[...runningWalking],activeGroup:runningActiveGroup,distance:runningDistance,count:runningCount,difficulty:runningDifficulty,sessionId:runningSessionId,createdAt:runningCreatedAt};
  const signature=owner()+JSON.stringify(payload);if(signature===lastSignature)return;lastSignature=signature;
  if(!Object.values(payload.values).some(times=>times.some(v=>String(v).trim()))&&!payload.groups.length)return;
  try{localStorage.setItem(key(),JSON.stringify({owner:owner(),kind:'running-draft',title:'3 × 500 m',className:toolClasses.find(c=>c.id===toolClassId)?.name||'Usage libre',updatedAt:Date.now(),payload}));}catch(error){lastSignature='';console.warn('Le brouillon local ne peut pas être conservé.',error.message);}
 }
 async function resumeDraft(draft){
  if(draft.owner!==owner())throw Error('Ce brouillon appartient à un autre compte.');
  showTab('outils');
  const p=draft.payload;await loadToolClasses();if(p.classId!==FREE_USE&&!toolClasses.some(c=>c.id===p.classId))throw Error('La classe de ce brouillon n’est plus disponible.');
  toolClassId=p.classId;epsTestPeriod=p.period;epsOpenCategory='Athle';epsOpenTest='TROIS_500';epsTestStarted=true;
  toolPanel=document.getElementById('toolPanel');toolPanel.style.display='block';toolPanel.classList.add('modern-tool-panel');
  await loadToolStudents(p.classId);await renderEpsTests();
  let record=null;if(p.sessionId){record=(await lireTable('eps_test_sessions',`eps_test_sessions?id=eq.${encodeURIComponent(p.sessionId)}&deleted=eq.false&select=*`,{ou:r=>r.id===p.sessionId&&!r.deleted}))[0]||null;}
  Object.keys(runningValues).forEach(id=>delete runningValues[id]);Object.assign(runningValues,structuredClone(p.values));runningGroups=structuredClone(p.groups);runningWalking=new Set(p.walking);runningActiveGroup=p.activeGroup;runningDistance=p.distance;runningCount=p.count;runningDifficulty=p.difficulty;
  runningSessionId=record?.id||null;runningSessionRecord=record;runningCreatedAt=record?.created_at||p.createdAt;runningResultRecords={};
  if(record){const rows=await lireTable('eps_test_results',`eps_test_results?session_id=eq.${record.id}&deleted=eq.false&select=*`,{ou:r=>r.session_id===record.id&&!r.deleted});rows.forEach(r=>runningResultRecords[r.student_id]=r);}
  EpsToolSave.reset();paintRunningSeriesTest(EpsTests.TESTS.TROIS_500);lastSignature='';capture();
 }
 const renderers={observer:()=>renderObserverWeb,tournament:()=>renderTournamentWeb,rotations:()=>renderRotationsWeb,acrosport:()=>renderAcrosportWeb,'climb-observation':()=>renderClimbObservationWeb,'climb-test':()=>renderClimbTestWeb,'bac-grid':()=>renderBacGridWeb,'bac-climb':()=>renderBacClimbWeb,'running-observation':()=>renderRunningObservationWeb};
 async function offer(host){
  const seq=++sequence,account=owner();host.querySelector('.tool-resume-card')?.remove();if(!account)return;
  let candidates=[];const draft=read();if(draft)candidates.push({title:draft.title,context:`${draft.className} · P${draft.payload.period} · Brouillon sur cet appareil`,time:draft.updatedAt,open:()=>resumeDraft(draft)});
  try{
   await loadToolClasses();
   const works=await EpsToolWorks.read();works.forEach(work=>{
    const renderer=renderers[work.type]?.();const persisted=['aptitudes','swim','speed','impacts'].includes(work.type);
    if(!renderer&&!persisted)return;
    candidates.push({title:work.title,context:`${toolClasses.find(c=>c.id===work.classId)?.name||'Travail enregistré'} · P${work.period}`,time:Date.parse(work.updatedAt)||0,open:()=>{EpsToolSave.reset();toolPanel=document.getElementById('toolPanel');toolPanel.style.display='block';toolPanel.classList.add('modern-tool-panel');return persisted?renderPersistedTool(work.type,work):renderer(work)}});
   });
   const rows=await lireTable('eps_test_sessions','eps_test_sessions?deleted=eq.false&select=*&order=updated_at.desc&limit=20',{trier:(a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))});
   rows.filter(r=>r.user_id===account&&(['Aptitudes physiques 6e','Multi-chrono','Escalade /20','Condition physique générale','Observation Natation','Observation Gymnastique'].includes(r.test_name)||String(r.test_name).startsWith('Test VMA')||Object.values(EpsTests.TESTS).some(t=>t.label===r.test_name))).forEach(row=>candidates.push({title:row.test_name,context:`${row.class_label||toolClasses.find(c=>c.id===row.class_id)?.name||'Classe'} · P${row.period_number} · Test enregistré`,time:Date.parse(row.updated_at)||0,open:()=>ouvrirSessionTestDepuisClasse(row.id,row.class_id,row.period_number,row.test_name)}));
  }catch{ /* A local draft remains resumable without a reachable server. */ }
  if(seq!==sequence||owner()!==account||!host.isConnected)return;
  const latest=candidates.sort((a,b)=>b.time-a.time)[0];if(!latest)return;
  const card=document.createElement('button');card.type='button';card.className='tool-resume-card';card.innerHTML=`<span><strong>Reprendre mon travail</strong><b>${esc(latest.title)}</b><small>${esc(latest.context)}</small></span><span aria-hidden="true">→</span>`;
  card.onclick=async()=>{card.disabled=true;try{if(owner()!==account)throw Error('Le compte a changé.');await latest.open();document.getElementById('toolsWorkspace')?.setAttribute('hidden','')}catch(e){alert(e.message);card.disabled=false}};host.prepend(card);
 }
 document.addEventListener('input',e=>{if(e.target.closest('#toolPanel,#liveToolPanel'))capture()},false);
 document.addEventListener('change',e=>{if(e.target.closest('#toolPanel,#liveToolPanel')){clearTimeout(timer);timer=setTimeout(capture,0)}},false);
 document.addEventListener('click',e=>{if(e.target.closest('#toolPanel,#liveToolPanel')){clearTimeout(timer);timer=setTimeout(capture,0)}},false);
 window.addEventListener('pagehide',capture);
 globalThis.EpsToolResume={capture,offer,read,resumeDraft};
})();
