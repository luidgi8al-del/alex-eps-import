/* Local, synthetic integration: real IndexedDB + cached shell, fake account API. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const out=path.resolve(root,'..','atelier-eppcs','qa','lessons','integration');
const paragraph=text=>({type:'paragraph',text});
const library={schemaVersion:1,level:'Première EPPCS',sources:[{filename:'Exemple fictif.docx'}],courses:[1,2].map(n=>({
  id:'chapitre-'+n,number:n,title:n===1?'Activité physique et santé — exemple fictif':'Le sport dans la société — exemple fictif',
  theme:'Thème de démonstration',question:'Comment préparer sa séance à partir des documents ?',
  sessions:[{number:1,title:'Séance 1',description:'Une séance de démonstration issue du document fictif.',durationMinutes:60}],
  sections:[{id:'cours',kind:'course',title:'Explication du chapitre',blocks:[paragraph('Texte de démonstration : les vrais cours et corrigés ne sont jamais inclus dans ce test.'),paragraph('La bibliothèque, les séances et les notes sont privées à chaque compte.') ]},
    {id:'quiz',kind:'quiz',title:'Quiz élève',blocks:[paragraph('Question de démonstration — sujet vierge')]},
    {id:'corrige',kind:'quiz-correction',title:'Corrigé',blocks:[paragraph('Corrigé fictif du professeur')]}],
  quizzes:[{number:1,prompt:'Un exemple de question ?',choices:[{key:'a',text:'Première réponse'},{key:'b',text:'Seconde réponse'}],answerKey:'b',correction:'Une explication de démonstration.'}]
})),controls:[{id:'controle-1',title:'Contrôle de démonstration',courseNumbers:[1],subject:[paragraph('Sujet fictif sans réponse')],correction:[paragraph('Corrigé fictif')]}]};
const cloud=new Map(), requests=[];
const cloudKey=(owner,key)=>owner+'|'+key;
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(url.pathname.startsWith('/rest/')) {
    const owner=(req.headers.authorization||'').replace('Bearer token-','');
    requests.push({owner,path:url.pathname,method:req.method});
    if(!/^teacher-[ab]-\d+$/.test(owner))return json(401,{});
    if(req.method==='GET') {
      if(url.searchParams.get('user_id')!=='eq.'+owner)return json(403,{});
      const offset=Number(url.searchParams.get('offset'))||0;
      return json(200,[...cloud.values()].filter(row=>row.user_id===owner).sort((a,b)=>a.document_id.localeCompare(b.document_id)).slice(offset,offset+100));
    }
    let body='';for await(const part of req)body+=part;
    const args=JSON.parse(body),key=cloudKey(owner,args.p_document_id),current=cloud.get(key);requests.at(-1).args=args;
    if((current?.revision||0)!==args.p_expected)return json(200,{saved:false,current});
    const row={user_id:owner,document_id:args.p_document_id,payload:args.p_payload,revision:(current?.revision||0)+1};
    cloud.set(key,row);return json(200,{saved:true,revision:row.revision});
  }
  if(url.pathname==='/ep-test') {
    res.setHeader('Content-Type','text/html; charset=utf-8');
    const hooks='const originalEPPCSStore=window.EPPCSStore;window.EPPCSStore={...originalEPPCSStore,create(options){const api=originalEPPCSStore.create(options);return {...api,async load(){const held=window.holdLoadAt>0&&--window.holdLoadAt===0;const value=await api.load();if(held){window.loadHeld=true;await new Promise(resolve=>window.releaseLoad=()=>{window.loadHeld=false;resolve();});}return value;}};}};';
    return res.end('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles/site.css"><link rel="stylesheet" href="/styles/eppcs.css"><style>body{margin:0;padding:12px}#app{max-width:1280px;margin:auto}</style></head><body><div id="app"></div><script>var session=JSON.parse(localStorage.getItem("test-session"));var SUPABASE_URL=location.origin;var SUPABASE_KEY="test-key";async function renouvelerSession(){return true;}</script><script src="/eppcs-store.js"></script><script>'+hooks+'</script><script src="/eppcs-lesson-model.js"></script><script src="/eppcs-ui.js"></script><script src="/eppcs.js"></script><script>EPSAtelierEPPCS.open(document.getElementById("app"));navigator.serviceWorker.register("/ep-test-sw.js");</script></body></html>');
  }
  if(url.pathname==='/ep-test-sw.js') {
    res.setHeader('Content-Type','text/javascript');
    return res.end('self.addEventListener("install",e=>{e.waitUntil(caches.open("eppcs-synthetic-test").then(c=>c.addAll(["/ep-test","/styles/site.css","/styles/eppcs.css","/eppcs-store.js","/eppcs-lesson-model.js","/eppcs-ui.js","/eppcs.js"])).then(()=>self.skipWaiting()))});self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));self.addEventListener("fetch",e=>{if(!new URL(e.request.url).pathname.startsWith("/rest/"))e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)))})');
  }
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(error,bytes)=>{res.writeHead(error?404:200,{'Content-Type':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});res.end(error?'':bytes);});
});
const packageFile={name:'Atelier-fictif.eppcs.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'eps-eppcs-library',version:1,library}))};
async function waitState(page,predicate){
  const until=Date.now()+15000;let state;
  while(Date.now()<until){state=await page.evaluate(()=>EPSAtelierEPPCS.getState());if(predicate(state))return state;await new Promise(resolve=>setTimeout(resolve,50));}
  throw Error('Unexpected EPPCS state: '+JSON.stringify(state));
}
async function waitClean(page,text){return waitState(page,s=>s.status.pending===0&&!s.conflicts.length&&s.status.kind==='synced'&&(!text||s.notes['chapitre-1']?.text===text));}
async function noteTab(page){await page.locator('[data-ep-course="chapitre-1"]').click();await page.locator('[data-ep-action="mode-library"]').click();await page.locator('[data-ep-tab="notes"]').click();}
async function manageAction(page,action){
  const manager=page.locator('.ep-account-manage');
  if(!await manager.evaluate(el=>el.open))await manager.locator(':scope > summary').click();
  await manager.locator('[data-eppcs-action="'+action+'"]').click();
  if(await manager.evaluate(el=>el.open))await manager.locator(':scope > summary').click();
  assert.equal(await manager.evaluate(el=>el.open),false,'Management panel folds away after an action');
}
async function assertCompactBar(page,width){
  const manager=page.locator('.ep-account-manage');
  assert.equal(await manager.evaluate(el=>el.open),false,'Management is collapsed by default');
  for(const action of ['sync','backup','reload'])assert.equal(await manager.locator('[data-eppcs-action="'+action+'"]').isVisible(),false,'Management action hidden until requested');
  const bar=await page.locator('.ep-account-bar').boundingBox();
  assert(bar.height<=(width<600?170:95),'The folded account status bar remains compact');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Compact status bar fits narrow viewport');
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(47000+Math.floor(Math.random()*1000),'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const width of [320,390,1280]) {
      const owner='teacher-a-'+width,other='teacher-b-'+width;
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.addInitScript(owner=>{if(!localStorage.getItem('test-session'))localStorage.setItem('test-session',JSON.stringify({user_id:owner,access_token:'token-'+owner}));},owner);
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
      await page.goto(origin+'/ep-test#cours');
      await waitClean(page);
      await page.locator('[data-eppcs-file]').setInputFiles(packageFile);
      await page.locator('[data-ep-course="chapitre-1"]').waitFor({timeout:10000}).catch(async error=>{console.error(await page.locator('#app').innerText(),errors);throw error;});await waitClean(page);
      await assertCompactBar(page,width);
      await manageAction(page,'sync');await waitClean(page);
      const downloadReady=page.waitForEvent('download');await manageAction(page,'backup');
      const download=await downloadReady,stream=await download.createReadStream(),chunks=[];
      for await(const chunk of stream)chunks.push(chunk);
      const backup=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(backup.format,'eps-eppcs-backup');assert.equal(backup.owner,owner);
      assert(backup.records.some(record=>record.key==='library'),'Compact management still exports the private library');
      await page.screenshot({path:path.join(out,'bibliotheque-'+width+'.png'),fullPage:true});
      await noteTab(page);
      await page.locator('[data-ep-note-text]').fill('Ma préparation enregistrée — '+width);
      await page.locator('[data-ep-action="save-notes"]').click();await waitClean(page,'Ma préparation enregistrée — '+width);
      // Editing can start while an async reload is already reading IndexedDB.
      await page.evaluate(()=>{window.holdLoadAt=1;window.loadHeld=false;});
      await manageAction(page,'reload');await page.waitForFunction(()=>window.loadHeld);
      await page.locator('[data-ep-note-text]').fill('Brouillon créé pendant le rechargement — '+width);
      await page.evaluate(()=>releaseLoad());
      await page.waitForFunction(()=>document.querySelector('[data-eppcs-message]').textContent.includes('Enregistre d’abord'));
      assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Brouillon créé pendant le rechargement — '+width);
      await page.locator('[data-ep-note-text]').fill('Ma préparation enregistrée — '+width);
      await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
      await context.setOffline(true);
      await page.locator('[data-ep-note-text]').fill('Ma version hors connexion — '+width);
      await page.locator('[data-ep-action="save-notes"]').click();
      await page.waitForFunction(()=>!EPSAtelierEPPCS.hasUnsavedDraft());
      assert.equal((await page.evaluate(()=>EPSAtelierEPPCS.getState())).status.pending,1);
      await page.reload();await noteTab(page);
      assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Ma version hors connexion — '+width);
      await page.screenshot({path:path.join(out,'notes-hors-ligne-'+width+'.png'),fullPage:true});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No root overflow '+width);
      await page.evaluate(async other=>{EPSAtelierEPPCS.reset();session={user_id:other,access_token:'token-'+other};localStorage.setItem('test-session',JSON.stringify(session));await EPSAtelierEPPCS.open(document.getElementById('app'));},other);
      assert.equal(await page.locator('[data-ep-course]').count(),0);assert.equal(await page.locator('[data-eppcs-file]').count(),1);
      assert(!(await page.locator('#app').innerText()).includes('Ma version hors connexion'));
      await page.evaluate(async owner=>{EPSAtelierEPPCS.reset();session={user_id:owner,access_token:'token-'+owner};localStorage.setItem('test-session',JSON.stringify(session));await EPSAtelierEPPCS.open(document.getElementById('app'));},owner);
      await noteTab(page);assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Ma version hors connexion — '+width);
      const key=cloudKey(owner,'note:chapitre-1'),previous=cloud.get(key);
      cloud.set(key,{...previous,revision:previous.revision+1,payload:{...previous.payload,text:'Version sur un autre appareil — '+width}});
      await context.setOffline(false);await page.evaluate(()=>EPSAtelierEPPCS.sync());
      await page.locator('[data-eppcs-action="resolve-local"]').waitFor();
      assert.match(await page.locator('[data-eppcs-conflicts]').innerText(),/Ma version hors connexion/);
      assert.match(await page.locator('[data-eppcs-conflicts]').innerText(),/Version sur un autre appareil/);
      await page.screenshot({path:path.join(out,'conflit-'+width+'.png'),fullPage:true});
      // A newly typed draft during the first resolution read must abort the choice.
      await page.evaluate(()=>{window.holdLoadAt=1;window.loadHeld=false;});
      await page.locator('[data-eppcs-action="resolve-local"]').click();await page.waitForFunction(()=>window.loadHeld);
      await page.locator('[data-ep-note-text]').fill('Brouillon pendant la vérification du conflit — '+width);
      await page.evaluate(()=>releaseLoad());
      await page.waitForFunction(()=>document.querySelector('[data-eppcs-message]').textContent.includes('Une note vient de changer'));
      assert.equal((await page.evaluate(()=>EPSAtelierEPPCS.getState())).conflicts.length,1);
      assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Brouillon pendant la vérification du conflit — '+width);
      await page.locator('[data-ep-note-text]').fill('Ma version hors connexion — '+width);
      // A draft typed after confirmation but before the second read must survive remount.
      await page.evaluate(()=>{window.holdLoadAt=2;window.loadHeld=false;});
      await page.locator('[data-eppcs-action="resolve-local"]').click();await page.waitForFunction(()=>window.loadHeld);
      await page.locator('[data-ep-note-text]').fill('Nouveau brouillon pendant la résolution — '+width);
      await page.evaluate(()=>releaseLoad());
      await page.waitForFunction(()=>document.querySelector('[data-eppcs-message]').textContent.includes('Le nouveau brouillon reste'));
      assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Nouveau brouillon pendant la résolution — '+width);
      assert.equal(await page.evaluate(()=>EPSAtelierEPPCS.hasUnsavedDraft()),true);
      await waitClean(page,'Ma version hors connexion — '+width);
      assert.equal(cloud.get(key).payload.text,'Ma version hors connexion — '+width);
      await page.locator('[data-ep-note-text]').fill('Ma version hors connexion — '+width);
      await manageAction(page,'reload');
      await noteTab(page);assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Ma version hors connexion — '+width);
      // Second browser tab updates the same IndexedDB while this editor is open.
      await page.locator('[data-ep-note-text]').fill('Saisie concurrente du premier onglet — '+width);
      const second=await context.newPage();await second.goto(origin+'/ep-test#cours');await noteTab(second);
      await second.locator('[data-ep-note-text]').fill('Modification depuis le second onglet — '+width);
      await second.locator('[data-ep-action="save-notes"]').click();await waitClean(second,'Modification depuis le second onglet — '+width);
      await page.locator('[data-ep-action="save-notes"]').click();
      await page.locator('[data-eppcs-action="resolve-local"]').waitFor();
      await page.locator('[data-eppcs-action="resolve-local"]').click();
      await waitState(page,s=>!s.conflicts.length);
      await waitClean(page,'Saisie concurrente du premier onglet — '+width);assert.equal(cloud.get(key).payload.text,'Saisie concurrente du premier onglet — '+width);
      assert.deepEqual(errors,[]);
      console.log('PASS EPPCS controller '+width+'px: private import, real IDB, offline reload, account isolation, cloud and local conflicts');
      await context.close();
    }
    if(process.env.EPPCS_PRIVATE_PACKAGE){
      // Read only on explicit request. The file and captures stay OUTSIDE the public repository.
      const packagePath=path.resolve(process.env.EPPCS_PRIVATE_PACKAGE),raw=fs.readFileSync(packagePath),pack=JSON.parse(raw),actual=pack.library;
      assert.equal(actual.courses.length,15);assert.equal(actual.courses.reduce((sum,c)=>sum+c.quizzes.length,0),100);assert.equal(actual.controls.length,3);
      const privateOut=path.join(path.dirname(packagePath),'qa','lessons','integration');fs.mkdirSync(privateOut,{recursive:true});
      for(const width of [390,1280]){
        const owner='teacher-a-'+(10000+width),context=await browser.newContext({viewport:{width,height:900}});
        await context.addInitScript(owner=>localStorage.setItem('test-session',JSON.stringify({user_id:owner,access_token:'token-'+owner})),owner);
        const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(origin+'/ep-test#cours');await waitClean(page);
        await page.locator('[data-eppcs-file]').setInputFiles({name:path.basename(packagePath),mimeType:'application/json',buffer:raw});
        await page.locator('[data-ep-course]').first().waitFor();await waitClean(page);
        await assertCompactBar(page,width);
        assert.equal(await page.locator('[data-ep-course]').count(),15);
        await page.screenshot({path:path.join(privateOut,'bibliotheque-'+width+'.png'),fullPage:true});
        let quizCount=0;
        for(const chapter of actual.courses){
          await page.locator('[data-ep-course="'+chapter.id+'"]').click();
          assert.match(await page.locator('.ep-chapter-head').innerText(),new RegExp(String(chapter.number)));
          await page.locator('[data-ep-action="mode-library"]').click();
          for(const tab of ['course','sessions','quiz','controls','sources','notes']){
            await page.locator('[data-ep-tab="'+tab+'"]').click();
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Private chapter mobile overflow '+chapter.number+'/'+tab+'/'+width);
            if(tab==='quiz'){const n=await page.locator('.ep-quiz-item').count();assert.equal(n,chapter.quizzes.length);quizCount+=n;}
            if(tab==='controls')assert.equal(await page.locator('[data-ep-control]').count(),actual.controls.filter(c=>c.courseNumbers.includes(chapter.number)).length);
          }
          if(chapter===actual.courses[0]){
            await page.locator('[data-ep-tab="course"]').click();await page.screenshot({path:path.join(privateOut,'cours-'+width+'.png')});
            await page.locator('[data-ep-action="mode-lesson"]').click();await page.screenshot({path:path.join(privateOut,'ma-seance-'+width+'.png')});
          }
          await page.locator('[data-ep-action="home"]').click();
        }
        assert.equal(quizCount,100);assert.deepEqual(errors,[]);
        console.log('PASS private EPPCS package '+width+'px: 15 chapters, 100 quiz questions, 3 correctly linked controls, all resource tabs without horizontal overflow');
        await context.close();
      }
    }
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
