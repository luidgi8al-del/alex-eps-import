const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext();
  await context.addInitScript({content:`
   const realSet=Storage.prototype.setItem;
   const realRegister=navigator.serviceWorker.register.bind(navigator.serviceWorker);
   ${fixture}
   Storage.prototype.setItem=realSet;
   navigator.serviceWorker.register=realRegister;
   __fauxServeur.DONNEES.eps_schema_marks.push({name:'as_slot_assignments'},{name:'hors_connexion_4'});
   const fakeFetch=window.fetch;
   window.fetch=(url,opts={})=>{
    if (!navigator.onLine && String(url).includes('supabase.co')) return Promise.reject(new TypeError('Offline'));
    if(String(url).includes('/rest/v1/class_notes') && ['POST','PATCH'].includes(opts.method)){
     const row=JSON.parse(opts.body),rows=__fauxServeur.DONNEES.class_notes;
     const index=rows.findIndex(r=>r.id===row.id);
     const updated={...(rows[index]||{}),...row,version:(rows[index]?.version||0)+1};
     if(index<0)rows.push(updated);else rows[index]=updated;
     return Promise.resolve(new Response(JSON.stringify([updated]),{status:200,headers:{'Content-Type':'application/json'}}));
    }
    return fakeFetch(url,opts);
   };
  `});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:8879/index.html');
  await page.evaluate(()=>demarrerModeHorsConnexion());
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller && automaticOfflineState==='ready');
  await context.setOffline(true);
  await page.evaluate(async()=>{
   dashboardClass={row:{id:'cl-3e6'}};
   await chargerTableauDeBordClasse();
   await enregistrerCelluleSuiviClasse('el-0','2026-10-05',['chewing']);
   await enregistrerCelluleSuiviClasse('el-0','2026-10-05',['chewing','tenue']);
   await enregistrerCelluleSuiviClasse('el-0','2026-10-06',['chewing']);
   await enregistrerCelluleSuiviClasse('el-1','2026-10-05',['tenue']);
   await enregistrerCelluleSuiviClasse('el-1','2026-10-05',[]);
  });
  await page.reload();
  await page.evaluate(async()=>{
   await demarrerModeHorsConnexion();
   if(!tableSuivie('class_notes'))throw Error('Schema marker lost offline');
   dashboardClass={row:{id:'cl-3e6'}};
   await chargerTableauDeBordClasse();
   if(suiviClasse.length!==2)throw Error('Lost observations or deletion: '+JSON.stringify(suiviClasse));
   if(suiviClasse.filter(r=>r.motifs.includes('chewing')).length!==2)throw Error('Repetition lost');
   if(!suiviClasse.find(r=>r.date==='2026-10-05').motifs.includes('tenue'))throw Error('Edit lost');
   if(!notesClasse.some(r=>r.id==='cn-1'))throw Error('Notes erased by document failure');
   dashboardClass={row:{id:'other'}};await chargerTableauDeBordClasse();
   if(suiviClasse.length)throw Error('Wrong class');
   dashboardClass={row:{id:'cl-3e6'}};await chargerTableauDeBordClasse();
   if(suiviClasse.length!==2)throw Error('Reopen failed');
  });
  console.log('PASS offline create/edit/delete, real reload, repeat history, class filter, unavailable documents');
  await context.setOffline(false);
  await page.evaluate(async()=>{
   await (await demarrerModeHorsConnexion()).synchroniser();
   const {countPendingOperations}=await import('./pwa/sync/outbox.js');
   if(await countPendingOperations())throw Error('Pending after reconnect');
   const saved=__fauxServeur.DONNEES.class_notes.filter(r=>!r.deleted&&r.content.startsWith('__EPS_SUIVI_CLASSE__:'));
   if(saved.length!==2)throw Error('Duplicate or missing server rows: '+saved.length);
  });
  console.log('PASS reconnection delivers exactly two observations, queue empty');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
