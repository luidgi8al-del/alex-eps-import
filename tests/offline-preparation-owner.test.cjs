const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../offline-preparation.js'),'utf8');
const prepare=source.slice(source.indexOf('async function prepareOfflineDevice'),source.indexOf('let automaticOfflineRun'))
  .replace("import('./pwa/storage/database.js')",'Promise.resolve(__database)')
  .replace("import('./pwa/core/events.js')",'Promise.resolve(__events)');
async function run({switchDuringPersist=false,switchBeforeWrite=false}={}){
  let generation=1,writes=0;
  const data={alpha:{userId:'alpha',version:'old'},beta:{userId:'beta',version:'do-not-touch'}},durability=[];
  const context={session:{user_id:'alpha'},navigator:{onLine:true,storage:{persist:async()=>{if(switchDuringPersist){context.session.user_id='beta';generation++;}return true;}}},
    demarrerModeHorsConnexion:async()=>({synchroniser:async()=>true}),offlineMissingCoverage:()=>[],SUPABASE_URL:'http://fixture',
    offlineWorkerRequest:async()=>({ready:true,version:'fixture-version'}),loadInstitution:async()=>{},loadTeamContext:async()=>{},rattachementIncertain:false,
    apiFetch:async url=>({ok:true,json:async()=>url.includes('/rpc/')?2:[{}]}),__events:{currentSyncState:()=>({pending:0,conflicts:0})}};
  context.__database={generationLocale:()=>generation,transaction:async(names,mode,action,hint)=>{
    const owner=context.session.user_id;
    if(switchBeforeWrite&&!writes){context.session.user_id='beta';generation++;}
    action({meta:{put:row=>{writes++;data[owner]=row.value;}}});durability.push(hint);
  }};
  vm.runInNewContext(prepare,context);
  let error;try{await context.prepareOfflineDevice()}catch(e){error=e;}
  return {data,error,writes,durability};
}
test('a switch during storage permission never overwrites the other account preparation',async()=>{
  const result=await run({switchDuringPersist:true});assert.match(result.error.message,/compte a changé/);
  assert.deepEqual(result.data.beta,{userId:'beta',version:'do-not-touch'});assert.equal(result.writes,1);
});
test('a switch while waiting for the metadata transaction prevents even the first marker write',async()=>{
  const result=await run({switchBeforeWrite:true});assert.match(result.error.message,/compte a changé/);assert.equal(result.writes,0);
  assert.deepEqual(result.data.beta,{userId:'beta',version:'do-not-touch'});
});
test('a completed preparation commits its marker strictly on the same account',async()=>{
  const result=await run();assert.equal(result.error,undefined);assert.equal(result.data.alpha.version,'fixture-version');
  assert.deepEqual(result.durability,['strict','strict']);assert.deepEqual(result.data.beta,{userId:'beta',version:'do-not-touch'});
});
