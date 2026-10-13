const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));try{if(fs.statSync(p).isDirectory())p=path.join(p,'index.html');res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.json')||p.endsWith('.webmanifest')?'application/json':p.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({serviceWorkers:'allow'});let page=await context.newPage();await page.goto(`${origin}/offline.html`);
 const prepared=await page.evaluate(async()=>{await navigator.serviceWorker.register('/service-worker.js');const registration=await navigator.serviceWorker.ready;return new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>reject(Error('Préparation trop longue')),60000);channel.port1.onmessage=e=>{if(e.data.error){clearTimeout(timer);reject(Error(e.data.error))}if(e.data.done){clearTimeout(timer);resolve(e.data)}};registration.active.postMessage({type:'PREPARE_OFFLINE'},[channel.port2])})});
 assert(prepared.done);await context.setOffline(true);await page.close();page=await context.newPage();
 await page.goto(`${origin}/index.html`,{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const registration=await navigator.serviceWorker.ready;
  const ready=await new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data);registration.active.postMessage({type:'CHECK_OFFLINE'},[c.port2])});
  const db=await import('./pwa/storage/database.js');db.utiliserCompte('offline-computer-test');
  const {saveLocalRecord,readLocalRecord}=await import('./pwa/storage/records.js');
  await saveLocalRecord({entity:'evaluation_scores',id:'offline-score',version:0,data:{id:'offline-score',points:7}});
  return {ready,online:navigator.onLine,points:(await readLocalRecord('evaluation_scores','offline-score')).data.points,interface:typeof showTab};
 });assert.equal(result.online,false);assert.equal(result.ready.ready,true);assert.equal(result.points,7);assert.equal(result.interface,'function');
 await page.reload({waitUntil:'domcontentloaded'});
 assert.equal(await page.evaluate(async()=>{const d=await import('./pwa/storage/database.js');d.utiliserCompte('offline-computer-test');return (await(await import('./pwa/storage/records.js')).readLocalRecord('evaluation_scores','offline-score')).data.points}),7);
 await context.setOffline(false);assert.equal(await page.evaluate(async()=> (await fetch('/manifest.webmanifest')).ok),true);
 console.log('PASS actual desktop PWA service worker: all assets prepared, close/reopen and reload with network disabled, local score survives, network returns');
 await context.close();
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
