const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=path.join(root,decodeURIComponent(req.url.split('?')[0]));try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(8895,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8895/pwa/tests/engine.test.html');
 await page.waitForFunction(()=>window.__resultat,{},{timeout:60000});
 const result=await page.evaluate(()=>window.__resultat);assert(!result.erreur,JSON.stringify(result));assert.equal(result.echecs.length,0,JSON.stringify(result.echecs));
 await page.evaluate(async()=>{
   const {buildFieldChoice}=await import('/pwa/sync/resolve.js');
   const merged=buildFieldChoice({baseData:{title:'A',room:'Gym',day:'Lundi'},localData:{title:'Local',room:'Stade',day:'Lundi'},serverData:{title:'Serveur',room:'Gym',day:'Mardi'},overlappingFields:['title']},{title:'server'});
   if(merged.title!=='Serveur'||merged.room!=='Stade'||merged.day!=='Mardi')throw Error('Une modification hors conflit a disparu');
   const {storeConflict,removeConflict,listResolvedConflicts}=await import('/pwa/sync/conflicts.js');
   const operation={opId:'recovery-test',recordKey:'test:recovery',entity:'test',id:'recovery',baseVersion:1,baseData:{title:'A'},data:{title:'B'}};
   const c=await storeConflict({operation,serverRecord:{version:2,data:{title:'C'}},overlappingFields:['title']});
   await removeConflict(c.conflictId);
   const archive=(await listResolvedConflicts()).find(x=>x.conflictId===c.conflictId);
   if(archive.localData.title!=='B'||archive.serverData.title!=='C')throw Error('Versions non conservées');
   const {resolveConflict}=await import('/pwa/sync/resolve.js');
   const {readLocalRecord}=await import('/pwa/storage/records.js');
   const deletion=await storeConflict({operation:{...operation,opId:'delete-test',id:'deleted',recordKey:'test:deleted',action:'delete',data:null},serverRecord:{version:2,data:{title:'C'},deleted:false},overlappingFields:['__deleted__']});
   await resolveConflict(deletion.conflictId,'local');
   if(!(await readLocalRecord('test','deleted')).deleted)throw Error('Suppression non conservée');
   const remoteDeletion=await storeConflict({operation:{...operation,opId:'remote-delete-test',id:'remote-deleted',recordKey:'test:remote-deleted'},serverRecord:{version:2,data:{title:'C',deleted:true},deleted:true},overlappingFields:['__deleted__']});
   await resolveConflict(remoteDeletion.conflictId,'server');
   if(!(await readLocalRecord('test','remote-deleted')).deleted)throw Error('Résurrection de la version supprimée');
 });
 console.log(`PASS ${result.reussis} existing sync tests + disjoint field preservation + recoverable versions`);
 }finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
