const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript({content:`
   const realSet=Storage.prototype.setItem;
   const realRegister=navigator.serviceWorker.register.bind(navigator.serviceWorker);
   ${fixture}
   Storage.prototype.setItem=realSet;
   navigator.serviceWorker.register=realRegister;
   __fauxServeur.DONNEES.eps_schema_marks.push({name:'as_slot_assignments'});
   const fakeFetch=window.fetch;
   window.fetch=(url,opts)=> !navigator.onLine && String(url).includes('supabase.co')
      ? Promise.reject(new TypeError('Failed to fetch')) : fakeFetch(url,opts);
  `});
  const page=await context.newPage();
  page.on('pageerror',e=>console.log('PAGE ERROR:',e.message));
  await page.goto('http://127.0.0.1:8879/index.html');
  await page.evaluate(()=>demarrerModeHorsConnexion());
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.waitForFunction(()=>automaticOfflineState==='ready');
  console.log('PASS: automatic preparation completed without opening settings or pressing a button');
  await page.evaluate(async()=>{
   await openSettings();
   if(document.querySelector('#offlineSection .settingsStateDot')?.dataset.state!=='ready')throw Error('Offline green dot missing');
   if(document.querySelector('#accountSection .settingsStateDot')?.dataset.state!=='ready')throw Error('Sync green dot missing');
   if(!document.getElementById('connectionIssueNotice').hidden)throw Error('Unexpected healthy notification');
   if(getComputedStyle(document.getElementById('syncStatus')).display!=='none')throw Error('Header sync status remains visible');
   const {publishSyncState}=await import('./pwa/core/events.js');
   publishSyncState('error',{message:'Erreur simulée',pending:0,conflicts:0});
   if(document.getElementById('connectionIssueNotice').hidden)throw Error('Error notification missing');
   if(document.querySelector('#accountSection .settingsStateDot')?.dataset.state!=='error')throw Error('Error dot missing');
   publishSyncState('synced',{pending:0,conflicts:0,lastSuccessfulAt:new Date().toISOString()});
   if(!document.getElementById('connectionIssueNotice').hidden)throw Error('Error notification not cleared');
  });
  await page.screenshot({path:path.join(root,'tests/offline-verification.png')});
  await context.setOffline(true);
  await page.evaluate(async()=>{
   const e=await demarrerModeHorsConnexion();
   const row=(await e.lire('unss_attendance')).rows.find(r=>r.id==='ua-3');
   if(!row)throw Error('Missing fixture attendance');
   await enregistrerLigne('unss_attendance',{...row,present:false,updated_at:new Date().toISOString()});
  });
  await page.reload();
  await page.waitForFunction(()=>typeof offlinePreparationStatus==='function');
  const result=await page.evaluate(async()=>{
   const e=await demarrerModeHorsConnexion();
   if(!e.adapter.tables.includes('unss_attendance'))throw Error('AS tables missing after offline restart');
   if((await e.lire('unss_attendance')).rows.find(r=>r.id==='ua-3')?.present!==false)throw Error('Absence lost');
   const res=await offlineReadResponse('https://griahowpsuxbmdywiktj.supabase.co/rest/v1/students?class_id=eq.cl-3e6&deleted=eq.false&select=*');
   if((await res.json()).length!==8)throw Error('Class roster incomplete');
   await initUnssTab();await showUnssTab('appel');
   if(document.getElementById('unssList').textContent.includes('Mise à jour AS nécessaire'))throw Error('AS requires network');
   const status=await offlinePreparationStatus();
   if(!status.includes('préparée'))throw Error(status);
   await openSettings();document.getElementById('offlineSection').open=true;
   return status;
  });
  console.log('PASS: real offline reload, AS tables, absence, class roster, settings.',result);
  await page.evaluate(()=>{
   const previous=window.fetch;
   window.fetch=(url,options={})=>{
    if(String(url).includes('/rest/v1/unss_attendance') && ['POST','PATCH'].includes(options.method)){
     const row=JSON.parse(options.body),rows=__fauxServeur.DONNEES.unss_attendance;
     const index=rows.findIndex(r=>r.id===row.id);
     rows[index]={...rows[index],...row};
    }
    return previous(url,options);
   };
  });
  await context.setOffline(false);
  await page.waitForFunction(()=>__fauxServeur.DONNEES.unss_attendance.find(r=>r.id==='ua-3')?.present===false);
  await page.evaluate(async()=>{
   const {countPendingOperations}=await import('./pwa/sync/outbox.js');
   await (await demarrerModeHorsConnexion()).synchroniser();
   if(await countPendingOperations())throw Error('Edit still pending after reconnect');
  });
  console.log('PASS: saved absence reaches the simulated server on reconnection; no pending edits.');
  const editorScroll=await page.evaluate(async()=>{
   await loadUnssSlots();
   openUnssStudentPanel(__fauxServeur.DONNEES.unss_students[0],true);
   const modal=document.querySelector('#unssPanelOverlay .searchSheet');
   const panel=document.getElementById('unssPanel');
   const position=getComputedStyle(panel).position;
   const overflow=getComputedStyle(modal).overflowY;
   const before=modal.scrollTop;
   modal.scrollTop=modal.scrollHeight;
   return {position,overflow,before,after:modal.scrollTop,client:modal.clientHeight,scroll:modal.scrollHeight};
  });
  if(editorScroll.position!=='static' || editorScroll.scroll<=editorScroll.client || editorScroll.after<=editorScroll.before){
   throw Error('The AS licensing form cannot scroll: '+JSON.stringify(editorScroll));
  }
  console.log('PASS: the complete AS licensing form scrolls inside the central window.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
