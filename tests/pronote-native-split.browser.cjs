// Real Chrome extension APIs in an isolated temporary profile; every website is a fixture.
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'), path=require('node:path');
const EPS='https://luidgi8al-del.github.io/alex-eps-import/#classes';
const PN='https://3500010j.index-education.net/pronote/professeur.html';
const data={format:'eps-pronote-v1',className:'2nde4',title:'Test fermeture',date:'2026-10-19',scale:20,rows:[{lastName:'TEST',firstName:'Lina',value:'15'}]};
(async()=>{
 const context=await chromium.launchPersistentContext('',{channel:'chrome',headless:true,ignoreDefaultArgs:['--disable-extensions','--disable-component-extensions-with-background-pages'],args:['--enable-unsafe-extension-debugging']});
 try {
  await context.route(/^https?:/,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><title>Fixture only</title><button aria-label="Se déconnecter">Déconnexion fictive</button><input id="draft" value="Saisie conservée">'}));
  const cdp=await context.browser().newBrowserCDPSession();
  const {id}=await cdp.send('Extensions.loadUnpacked',{path:path.resolve(__dirname,'../extensions/pronote-lvh')});
  const eps=context.pages()[0] || await context.newPage(); await eps.goto(EPS);
  const pn=await context.newPage();await pn.goto(PN);
  // Use an extension page, not a possibly sleeping MV3 worker, to drive test-only Chrome APIs.
  const worker=await context.newPage();await worker.goto('chrome-extension://'+id+'/popup.html');
  const tabIds=await worker.evaluate(async()=>{const all=await chrome.tabs.query({});return {eps:all.find(t=>t.url.includes('alex-eps-import')).id,pn:all.find(t=>t.url.includes('professeur.html')).id};});
  const request=async(type,payload)=>eps.evaluate(({type,payload})=>new Promise((resolve,reject)=>{
   const requestId=crypto.randomUUID(), resultType=type.replace('_REQUEST','_RESULT');
   const timer=setTimeout(()=>reject(Error('No extension response')),6000);
   const receive=e=>{if(e.source!==window||e.origin!==location.origin||e.data?.type!==resultType||e.data.requestId!==requestId)return;clearTimeout(timer);removeEventListener('message',receive);resolve(e.data);};
   addEventListener('message',receive);postMessage({type,requestId,payload},location.origin);
  }),{type,payload});
  const split=()=>worker.evaluate(async ids=>chrome.tabs.createSplit([ids.eps,ids.pn]),tabIds);
  const returned=async()=>{
   for(let i=0;i<40;i++){
    const state=await worker.evaluate(async ids=>({eps:await chrome.tabs.get(ids.eps),pn:await chrome.tabs.get(ids.pn),pending:(await chrome.storage.session.get('epsPronotePending')).epsPronotePending}),tabIds);
    if(state.eps.splitViewId===-1&&state.pn.splitViewId===-1&&state.eps.active&&!state.pending)return state;
    await new Promise(r=>setTimeout(r,100));
   }
   throw Error('EPS did not return to independent active tab');
  };
  assert.equal(await worker.evaluate(()=>typeof chrome.tabs.unsplit),'function');
  // PRONOTE already open: the transfer reuses it, close returns both existing tabs intact.
  assert((await request('EPS_PRONOTE_SPLIT_REQUEST',data)).ok);
  await pn.locator('#eps-pronote-bridge').waitFor();await split();
  await pn.locator('#eps-pronote-bridge').locator('#close').click();await returned();
  assert.equal(await eps.locator('#draft').inputValue(),'Saisie conservée');
  assert.equal(await pn.locator('#draft').inputValue(),'Saisie conservée');
  assert.equal(context.pages().length,3);
  // EPS close request also stops the preview and separates the same pair.
  assert((await request('EPS_PRONOTE_SPLIT_REQUEST',data)).ok);
  await pn.locator('#eps-pronote-bridge').waitFor();await split();
  const result=await request('EPS_PRONOTE_RETURN_REQUEST');assert(result.ok);assert(result.fullWidth);
  await returned();assert.equal(await pn.locator('#eps-pronote-bridge').count(),0);
  assert.equal(await pn.locator('#draft').inputValue(),'Saisie conservée');
  // Even after clearing session metadata, an existing exact split can be separated safely.
  await split();assert((await request('EPS_PRONOTE_RETURN_REQUEST')).fullWidth);await returned();
  assert.equal(context.pages().length,3);
  console.log('PASS actual Chrome '+context.browser().version()+': native split separated, EPS active, both tabs and unsaved fixture inputs preserved, close from PN/EPS, reload fallback; no real site accessed');
 } finally {await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
