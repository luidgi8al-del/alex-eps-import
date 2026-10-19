const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.js')?'text/javascript':'text/html'});res.end(e?'':b)})});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage();await p.goto(`http://127.0.0.1:${server.address().port}/offline.html`);
  const result=await p.evaluate(async()=>{
   const db=await import('./pwa/storage/database.js'),rec=await import('./pwa/storage/records.js'),edit=await import('./pwa/sync/local-edits.js'),queue=await import('./pwa/sync/outbox.js');
   db.utiliserCompte('atomic-fixture');
   const check=(v,m)=>{if(!v)throw Error(m)};
   const original={entity:'test',id:'row',version:1,data:{id:'row',value:4}};
   await rec.saveLocalRecord(original);
   const originalPut=IDBObjectStore.prototype.put;
   async function failWrite(action){
    IDBObjectStore.prototype.put=function(...args){if(this.name==='outbox')throw new DOMException('Simulated disk full','QuotaExceededError');return originalPut.apply(this,args)};
    let failed=false;try{await action()}catch{failed=true}finally{IDBObjectStore.prototype.put=originalPut}
    check(failed,'storage error must reject');check((await rec.readLocalRecord('test','row')).data.value===4,'visible row rolled back');check(!(await rec.readLocalRecord('test','row')).deleted,'delete rolled back');check(await queue.countPendingOperations()===0,'no orphan operation');
   }
   await failWrite(()=>edit.saveOfflineEdit({entity:'test',id:'row',data:{id:'row',value:8}}));
   await failWrite(()=>edit.saveOfflineDeletion({entity:'test',id:'row'}));
   const saved=await edit.saveOfflineEdit({entity:'test',id:'row',data:{id:'row',value:8}});
   check(saved.changed,'same value retry must still be an edit');check(await queue.countPendingOperations()===1,'exactly one retry queued');
   await db.fermerConnexionPourEssai();
   check((await rec.readLocalRecord('test','row')).data.value===8,'value durable after connection close');
   check((await queue.pendingOperations())[0].data.value===8,'upload durable after connection close');
   await edit.saveOfflineDeletion({entity:'test',id:'row'});
   check((await rec.readLocalRecord('test','row')).deleted,'successful deletion stored');check((await queue.pendingOperations()).some(o=>o.action==='delete'),'deletion upload stored');
   // A switch while the payload is being read must not write into the next account.
   const changing={id:'other',get value(){db.utiliserCompte('other-fixture');return 9}};
   let switched=false;try{await edit.saveOfflineEdit({entity:'test',id:'other',data:changing})}catch(e){switched=/compte/.test(e.message)};
   check(switched,'account switch rejected');check(!(await rec.readLocalRecord('test','other')),'other account untouched');check(await queue.countPendingOperations()===0,'other queue untouched');
   return {atomicEdit:true,atomicDelete:true,retry:true,accountIsolation:true};
  });assert(result.atomicEdit&&result.atomicDelete&&result.retry&&result.accountIsolation);
  console.log('PASS real IndexedDB: atomic edit/delete, injected outbox storage failure rolls back, identical retry succeeds, connection reopen preserves both, account switch isolated');
 }finally{await browser.close();server.closeAllConnections();server.close()}
})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1});
