const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'lesson-recovery.js'),'utf8');
const lesson={orderIndex:0,title:'Séance rédigée synthétique',mainObjective:'Objectif fictif'};

function fixture({read,start,json}={}){
  const calls=[];
  const engine={adapter:{tables:['eps_lesson_archives']},lire:async(table,options)=>{
    calls.push(['read',table,options]);return read?read():{rows:[{payload:{lessons:[lesson]}}]};
  }};
  const context=vm.createContext({session:{user_id:'A'},navigator:{onLine:true},SUPABASE_URL:'https://example.invalid',
    demarrerModeHorsConnexion:start||(async()=>engine),apiFetch:async()=>{calls.push(['fetch']);return{ok:true,json:json||(async()=>[{payload:{lessons:[lesson]}}])};}
  });
  vm.runInContext(source,context);return{context,calls};
}
test('cycle ouvert depuis la recherche : les séances rédigées locales sont lues dans result.rows',async()=>{
  const f=fixture();const rows=await f.context.savedLessons({id:'cycle-A'});
  assert.equal(rows[0].title,lesson.title);assert.equal(f.calls.length,1);
  const filter=f.calls[0][2].ou;
  assert.equal(filter({cycle_id:'cycle-A'}),true);
  assert.equal(filter({cycle_id:'cycle-B'}),false);
  assert.equal(filter({cycle_id:'cycle-A',deleted:true}),false);
  const source=fs.readFileSync(path.join(root,'classe-tableau-bord.js'),'utf8');
  const open=source.slice(source.indexOf('async function openCreatedCourse('),source.indexOf('async function deleteCycle('));
  assert.match(open,/savedLessons\(course,\{isCurrent:current\}\)/);
  assert.match(open,/saved\.find\(s=>s\.orderIndex===i-1\)\?\.title/);
});
test('séances rédigées locales : une navigation annulée ne remonte pas de résultat tardif',async()=>{
  let release,current=true;
  const f=fixture({read:()=>new Promise(resolve=>{release=resolve;})});
  const pending=f.context.savedLessons({id:'cycle-A'},{isCurrent:()=>current});
  await new Promise(setImmediate);current=false;release({rows:[{payload:{lessons:[lesson]}}]});
  assert.equal((await pending).length,0);
});
test('séances rédigées : compte changé pendant initialisation ne lit pas le nouveau compte',async()=>{
  let release;
  const f=fixture({start:()=>new Promise(resolve=>{release=resolve;})});
  const pending=f.context.savedLessons({id:'cycle-A'});f.context.session={user_id:'B'};
  release({adapter:{tables:['eps_lesson_archives']},lire(){throw Error('Lecture interdite après changement de compte');}});
  assert.equal((await pending).length,0);assert.deepEqual(f.calls,[]);
});
test('séances rédigées réseau : compte changé pendant décodage JSON ne remonte aucun cours',async()=>{
  let release;
  const f=fixture({start:async()=>null,json:()=>new Promise(resolve=>{release=resolve;})});
  const pending=f.context.savedLessons({id:'cycle-A'});
  await new Promise(setImmediate);
  f.context.session={user_id:'B'};release([{payload:{lessons:[lesson]}}]);
  assert.equal((await pending).length,0);
});
