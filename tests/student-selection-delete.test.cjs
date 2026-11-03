const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../aslvh.js'),'utf8');
const start=source.indexOf('let suppressionSelectionEnCours = false;'),end=source.indexOf('/** Meme principe que le CSV Planning',start);
const code=source.slice(start,end);
const students=[1,2,3,4].map(id=>({id:String(id),last_name:'Exemple '+id,first_name:'Fictif',division:id<3?'3-06':'3-07',licensed:false}));
function harness(overrides={}){
  const deleted=[],alerts=[],confirms=[],reads=[];
  const context=vm.createContext({
    session:{user_id:'prof'},SUPABASE_URL:'https://never-contact.invalid',unssStudents:students.map(s=>({...s})),selectionEleves:new Set(['1','3']),
    document:{getElementById:()=>null},autoriserGestionRepertoire:async()=>true,
    tableSuivie:()=>false,apiFetchAll:async path=>{reads.push(path);return{ok:true,rows:[]}},
    supprimerLigne:async(table,id)=>{deleted.push([table,id]);return{ok:true}},
    alert:message=>alerts.push(message),confirm:message=>{confirms.push(message);return true},renderUnssTab:()=>{},...overrides
  });
  vm.runInContext(code,context);
  return{context,deleted,alerts,confirms,reads,run:()=>context.supprimerSelectionRepertoire()};
}
test('selection deletion never expands to a division, visible rows or the entire directory',async()=>{
  const h=harness();await h.run();assert.deepEqual(h.deleted,[['unss_students','1'],['unss_students','3']]);
  assert.deepEqual(Array.from(h.context.unssStudents,s=>s.id),['2','4']);assert.equal(h.context.selectionEleves.size,0);
  assert.match(h.confirms[0],/uniquement 2/);assert.match(h.confirms[0],/3-06/);assert.match(h.confirms[0],/3-07/);assert.match(h.confirms[0],/non cochés restent inchangés/);
});
test('cancel preserves every student and every checkbox',async()=>{
  const h=harness({confirm:()=>false});await h.run();assert.equal(h.deleted.length,0);assert.equal(h.context.unssStudents.length,4);assert.equal(h.context.selectionEleves.size,2);
});
test('empty selection cannot become delete all',async()=>{
  const h=harness({selectionEleves:new Set()});await h.run();assert.equal(h.deleted.length,0);assert.equal(h.reads.length,0);assert.equal(h.confirms.length,0);
});
test('unknown or deleted selected IDs cannot fall back to another pupil',async()=>{
  const h=harness({selectionEleves:new Set(['missing']),unssStudents:[{...students[0],deleted:true}]});await h.run();assert.equal(h.deleted.length,0);assert.equal(h.confirms.length,0);
});
test('licensed and actually enrolled pupils retain the existing protection',async()=>{
  const h=harness({selectionEleves:new Set(['1','2','3']),unssStudents:students.map(s=>({...s,licensed:s.id==='2'})),
    apiFetchAll:async()=>({ok:true,rows:[{student_id:'3'}]})});await h.run();
  assert.deepEqual(h.deleted,[['unss_students','1']]);assert.equal(h.context.selectionEleves.size,2);assert.match(h.confirms[0],/2 élève\(s\) coché\(s\) sont conservés/);
});
test('all selected pupils protected means no confirmation and no deletion',async()=>{
  const h=harness({unssStudents:students.map(s=>({...s,licensed:true}))});await h.run();assert.equal(h.deleted.length,0);assert.equal(h.confirms.length,0);assert.match(h.alerts[0],/conservés/);
});
test('membership lookup failure or invalid data aborts before any write',async()=>{
  for(const response of [{ok:false,rows:[]},{ok:true,rows:null}]){
    const h=harness({apiFetchAll:async()=>response});await h.run();assert.equal(h.deleted.length,0);assert.equal(h.confirms.length,0);assert.equal(h.context.selectionEleves.size,2);
  }
});
test('administrator refusal aborts before reading memberships or deleting',async()=>{
  const h=harness({autoriserGestionRepertoire:async()=>false});await h.run();assert.equal(h.deleted.length,0);assert.equal(h.reads.length,0);
});
test('offline deletion uses local membership checks and the shared deletion queue',async()=>{
  const h=harness({tableSuivie:()=>true,modeHorsConnexion:{lire:async()=>({rows:[{student_id:'3'}]})},apiFetchAll:()=>{throw Error('Offline network call')}});
  await h.run();assert.deepEqual(h.deleted,[['unss_students','1']]);assert.deepEqual([...h.context.selectionEleves],['3']);
});
test('partial refusal removes only confirmed successes and keeps all other checkboxes',async()=>{
  const calls=[];const h=harness({selectionEleves:new Set(['1','2','3']),supprimerLigne:async(_,id)=>{calls.push(id);return{ok:id==='1'}}});
  await h.run();assert.deepEqual(calls,['1','2']);assert.deepEqual([...h.context.selectionEleves],['2','3']);assert.deepEqual(Array.from(h.context.unssStudents,s=>s.id),['2','3','4']);
  assert.match(h.alerts[0],/1 suppression.*interrompue/);
});
test('unconfirmed network result does not falsely claim no deletion took place',async()=>{
  const h=harness({supprimerLigne:async()=>{throw Error('Lost response')}});await h.run();assert.equal(h.context.selectionEleves.size,2);
  assert.match(h.alerts[0],/pas pu être confirmée/);assert(!h.alerts[0].includes('Aucun élève'));
});
test('an account change during verification cannot delete under another account',async()=>{
  let resolve,ready;const started=new Promise(r=>ready=r);const h=harness({apiFetchAll:()=>{ready();return new Promise(r=>resolve=r)}});const run=h.run();await started;
  h.context.session={user_id:'other'};resolve({ok:true,rows:[]});await run;assert.equal(h.deleted.length,0);assert.equal(h.confirms.length,0);
});
test('double click cannot create a second deletion job or expand a changed selection',async()=>{
  let resolve,ready;const started=new Promise(r=>ready=r);const h=harness({apiFetchAll:()=>{ready();return new Promise(r=>resolve=r)}});const first=h.run();await started;
  h.context.selectionEleves.add('4');await h.run();resolve({ok:true,rows:[]});await first;
  assert.deepEqual(h.deleted,[['unss_students','1'],['unss_students','3']]);assert.deepEqual([...h.context.selectionEleves],['4']);
});
test('directory no longer exposes any clear-whole-roster action',()=>{
  assert(!source.includes('Supprimer toute la liste'));assert(!source.includes('viderRepertoireAs'));
  assert(source.includes('Supprimer la sélection (${selectionEleves.size})'));assert(source.includes('!selectionEleves.size || suppressionSelectionEnCours'));
});
