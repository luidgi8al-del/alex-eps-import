// Real browser/IndexedDB, synthetic accounts only. No connection to production.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/fixture'){res.writeHead(200,{'Content-Type':'text/html'});return res.end('<!doctype html><title>Synthetic sync tests</title>')}
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
 fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':'text/javascript'});res.end(e?'':b)});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
  const result=await page.evaluate(async()=>{
   const db=await import('/pwa/storage/database.js'),rec=await import('/pwa/storage/records.js'),queue=await import('/pwa/sync/outbox.js');
   const conflicts=await import('/pwa/sync/conflicts.js'),resolve=await import('/pwa/sync/resolve.js');
   const {OfflineSyncEngine}=await import('/pwa/sync/engine.js');
   const {createSupabaseAdapter}=await import('/pwa/sync/supabase-adapter.js');
   const check=(ok,message)=>{if(!ok)throw Error(message)},pass=[];
   const record={entity:'students',id:'A-student',version:1,updatedAt:new Date().toISOString(),data:{id:'A-student',user_id:'A',name:'Synthetic A'}};
   db.utiliserCompte('pull-A');await db.openOfflineDatabase();
   const originalGetAll=IDBIndex.prototype.getAll;let switched=false;
   IDBIndex.prototype.getAll=function(...args){
    const request=originalGetAll.apply(this,args);
    if(!switched&&this.name==='byRecord'&&args[0]==='students:A-student')
     request.addEventListener('success',()=>{switched=true;db.utiliserCompte('pull-B')},{once:true});
    return request;
   };
   let outcome;
   try{outcome=await new OfflineSyncEngine({adapter:{pullChanges:async()=>({records:[record],cursor:{students:{id:record.id,updatedAt:record.updatedAt}},hasMore:false}),pushOperation:async()=>{throw Error('unexpected push')}}}).sync()}
   finally{IDBIndex.prototype.getAll=originalGetAll}
   check(switched&&outcome.state==='cancelled','pull must cancel when account changes during IDB read');
   check(!(await rec.readLocalRecord('students',record.id)),'B must not contain A record');
   check(!(await db.getMeta('last-server-cursor')),'B must not receive A cursor');pass.push('pull during real IDB read');
   for(const status of ['ok','conflict','rejected','network']){
    db.utiliserCompte('push-'+status+'-A');await rec.saveLocalRecord(record);
    await queue.enqueueOperation({entity:record.entity,id:record.id,data:record.data,authorId:'A'});
    let started,deliver,fail;const began=new Promise(r=>started=r),response=new Promise((r,j)=>{deliver=r;fail=j});
    const running=new OfflineSyncEngine({adapter:{pullChanges:async()=>({records:[],hasMore:false}),pushOperation:async()=>{started();return response}}}).sync();
    await began;db.utiliserCompte('push-'+status+'-B');
    if(status==='network')fail(new TypeError('Failed to fetch'));else deliver({status,record,serverRecord:record});
    const ended=await running;check(ended.state==='cancelled',status+' must cancel');
    check(!(await rec.readLocalRecord('students',record.id)),status+' must not write B');
    check(await queue.countPendingOperations()===0,status+' must not defer/replace queue B');
    check(await conflicts.countConflicts()===0,status+' must not create conflict B');
    db.utiliserCompte('push-'+status+'-A');check(await queue.countPendingOperations()===1,status+' must retain A upload for safe retry');
    pass.push('in-flight '+status);
   }
   db.utiliserCompte('metadata-A');const generation=db.generationLocale();db.utiliserCompte('metadata-B');
   let rejected=false;try{await db.setMeta('cursor','A',generation)}catch(e){rejected=e.name==='AccountChangedError'}
   check(rejected&&!(await db.getMeta('cursor')),'stale metadata write must reject');pass.push('metadata guard');

   // Cancellation between the call and actual transaction creation must also
   // protect direct saves, ACKs and cursor writes, not only network callbacks.
   for(const kind of ['save','ack','meta']){
    db.utiliserCompte(kind+'-write-A');await db.openOfflineDatabase();
    const operation=await queue.enqueueOperation({entity:'students',id:'keep',data:{id:'keep'}});
    const action=kind==='save'?()=>rec.saveLocalRecord(record)
     :kind==='ack'?()=>queue.acknowledgeOperation(operation.opId):()=>db.setMeta('cursor','old-account');
    const pending=action().then(()=>false,e=>e.name==='AccountChangedError');
    db.utiliserCompte(kind+'-write-B');check(await pending,kind+' write must cancel');
    check(!(await rec.readLocalRecord('students',record.id))&&!(await db.getMeta('cursor')),kind+' leaves B untouched');
    db.utiliserCompte(kind+'-write-A');check(await queue.countPendingOperations()===1,kind+' retains old queue');
    pass.push('transaction '+kind);
   }

   // Catch-up must include every table and data older than 30 days, even when the
   // authored date goes backwards but the server version advances (incl. deletes).
   db.utiliserCompte('late-arrival');
   const late=[{entity:'equipment',id:'late-equipment',version:2,updatedAt:'2020-01-01T00:00:00Z',deleted:true,data:{id:'late-equipment',deleted:true}},
    {entity:'evaluation_scores',id:'late-score',version:2,updatedAt:'2020-01-01T00:00:00Z',data:{id:'late-score',points:7}}];
   for(const r of late)await rec.saveLocalRecord({...r,version:1,updatedAt:'2026-01-01T00:00:00Z',deleted:false,data:{id:r.id,points:2}});
   const tables=late.map(r=>r.entity),queries=[],nativeFetch=globalThis.fetch;
   globalThis.fetch=async url=>{
    const u=new URL(url);queries.push(u);const r=late.find(r=>u.pathname.endsWith('/'+r.entity));
    const rows=u.searchParams.get('select')==='id,updated_at,version'?[{id:r.id,updated_at:r.updatedAt,version:r.version}]
     :u.searchParams.has('id')?[{...r.data,version:r.version,updated_at:r.updatedAt,deleted:!!r.deleted}]:[];
    return {ok:true,status:200,json:async()=>rows};
   };
   try{
    const adapter=createSupabaseAdapter({url:'https://synthetic.invalid',anonKey:'fixture',session:()=>({user_id:'late-arrival',access_token:'fixture'}),tables});
    check(adapter.tablesRattrapables.length===tables.length,'all synchronized tables need catch-up');
    const engine=new OfflineSyncEngine({adapter});
    check((await engine.sync()).state==='synced','late catch-up succeeds');
    const metadataCount=()=>queries.filter(u=>u.searchParams.get('select')==='id,updated_at,version').length;
    const initialCount=metadataCount();
    await engine.sync();check(metadataCount()===initialCount,'ordinary saves/refresh do not repeat inventory before ten minutes');
    await Promise.all([engine.rattraper({force:true}),engine.rattraper({force:true})]);
    check(metadataCount()===initialCount+tables.length,'concurrent catch-ups share one metadata scan');
   }finally{globalThis.fetch=nativeFetch}
   check((await rec.readLocalRecord('equipment','late-equipment')).deleted,'old tombstone received');
   check((await rec.readLocalRecord('evaluation_scores','late-score')).data.points===7,'older authored date with newer version received');
   check(queries.some(u=>u.searchParams.get('updated_at')==='gte.1970-01-01T00:00:00.000Z'),'catch-up has no 30 day cutoff');pass.push('late updates/deletions all tables');

   // A 401 renewal must never retry an old account's payload with a new token.
   let account={user_id:'auth-A',access_token:'A'},requests=0;
   globalThis.fetch=async()=>{requests++;return {status:401,ok:false}};
   try{
    const adapter=createSupabaseAdapter({url:'https://synthetic.invalid',anonKey:'fixture',session:()=>account,renouveler:async()=>{account={user_id:'auth-B',access_token:'B'};return true}});
    rejected=false;try{await adapter.pushOperation({entity:'equipment',id:'x',baseVersion:1,authorId:'auth-A',data:{name:'fixture'}})}catch(e){rejected=e.name==='AccountChangedError'}
    check(rejected&&requests===1,'cross-account token retry forbidden');
   }finally{globalThis.fetch=nativeFetch}pass.push('auth refresh identity');

   db.utiliserCompte('retry-delete');
   const operation={entity:'equipment',id:'deleted',recordKey:'equipment:deleted',opId:'deletion',action:'delete',baseVersion:1,baseData:{id:'deleted'},data:null,changedFields:['__deleted__']};
   const refusal=await conflicts.storeRejection({operation,serverRecord:null,reason:'fixture'});
   await resolve.retryRejection(refusal.conflictId);
   check((await queue.pendingOperations())[0].action==='delete','retry must remain a delete');
   check((await rec.readLocalRecord('equipment','deleted')).deleted,'retry does not resurrect deleted row');pass.push('rejected deletion remains deletion');

   // Real bootstrap/auto-sync: joining the cancelled A request must be followed
   // by a fresh B run, not by a successful status from the previous account.
   const {demarrerHorsConnexion}=await import('/pwa/bootstrap.js');
   account={user_id:'bootstrap-A',access_token:'bootstrap-A'};let started,release;
   const began=new Promise(r=>started=r),oldResponse=new Promise(r=>release=r),owners=[];
   globalThis.fetch=async(url,options={})=>{
    if(!String(url).startsWith('https://synthetic.invalid'))return nativeFetch(url,options);
    const owner=options.headers.Authorization;owners.push(owner);
    if(owner==='Bearer bootstrap-A'){started();return oldResponse}
    return {ok:true,status:200,json:async()=>[{id:'B-student',user_id:'bootstrap-B',version:1,updated_at:'2026-01-01T00:00:00Z',name:'Synthetic B'}]};
   };
   try{
    const api=await demarrerHorsConnexion({url:'https://synthetic.invalid',anonKey:'fixture',session:()=>account,tables:['students']});
    await began;account={user_id:'bootstrap-B',access_token:'bootstrap-B'};
    const switched=api.changerDeCompte(account.user_id);
    release({ok:true,status:200,json:async()=>[{...record.data,version:1,updated_at:record.updatedAt}]});
    check(await switched,'new account receives its own successful sync');
    const rows=(await api.lire('students')).rows;
    check(rows.length===1&&rows[0].user_id==='bootstrap-B','bootstrap returns only B data');
    check(owners.includes('Bearer bootstrap-B'),'bootstrap runs after old cancellation');
   }finally{globalThis.fetch=nativeFetch}pass.push('bootstrap follow-up for new account');
   return pass;
  });
  assert.equal(result.length,13);console.log('PASS real Chrome/IndexedDB: '+result.join('; '));
 }finally{await browser.close();server.closeAllConnections();server.close()}
})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1});
