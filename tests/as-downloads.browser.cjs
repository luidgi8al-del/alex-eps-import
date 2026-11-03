/* Real page with a synthetic account: no production API or pupil data is used. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../tmp/as-downloads');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(req.url.split('?')[0]),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}
  catch(_){res.writeHead(404);res.end()}
});
function customize(){
  const data=__fauxServeur.DONNEES,now=new Date().toISOString();
  data.eps_schema_marks.push({name:'as_slot_assignments'});
  const originalFetch=window.fetch;
  window.fetch=(url,options)=>!navigator.onLine && String(url).includes('supabase.co')
    ? Promise.reject(new TypeError('Failed to fetch')) : originalFetch(url,options);
  data.unss_students=[
    {id:'as-1',user_id:'prof-test',institution_id:'etab-1',last_name:'École',first_name:'Léa',licensed:true,division:'2-04',jersey_size:'M',wish1:'Natation',medical_certificate_missing:true,deleted:false,updated_at:now},
    {id:'as-2',user_id:'prof-test',institution_id:'etab-1',last_name:'Arnaud',first_name:'Noah',licensed:true,payment_missing:true,medical_certificate_missing:true,deleted:false,updated_at:now},
    {id:'as-3',user_id:'prof-test',institution_id:'etab-1',last_name:'Zola',first_name:'Inès',licensed:true,deleted:false,updated_at:now}
  ];
  data.unss_slots=[
    {id:'as-slot-1',user_id:'prof-test',institution_id:'etab-1',activity_name:'Volley',day_of_week:'LUNDI',start_time:'12:00',end_time:'13:00',deleted:false,updated_at:now},
    {id:'as-slot-2',user_id:'prof-test',institution_id:'etab-1',activity_name:'Escalade',deleted:false,updated_at:now}
  ];
  data.unss_memberships=[
    {id:'as-member-1',user_id:'prof-test',student_id:'as-1',slot_id:'as-slot-1',deleted:false,updated_at:now},
    {id:'as-member-2',user_id:'prof-test',student_id:'as-1',slot_id:'as-slot-2',deleted:false,updated_at:now},
    {id:'as-member-3',user_id:'prof-test',student_id:'as-2',slot_id:'as-slot-2',deleted:false,updated_at:now}
  ];
}
async function main(){
  fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const base='http://127.0.0.1:'+server.address().port;
    for(const [width,height]of(process.argv.includes('--pwa-only')?[]:[[1280,900],[390,844],[320,568],[740,360]])){
      const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',acceptDownloads:true});
      await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
      await context.addInitScript({content:read('tests/faux-serveur.js')+'\n('+customize.toString()+')();'});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/');await page.waitForFunction(()=>typeof epsPageFullyReady!=='undefined' && epsPageFullyReady);
      await page.evaluate(async()=>{await(await demarrerModeHorsConnexion()).synchroniser();showTab('unss',{skipModuleStart:true});await initUnssTab()});
      await page.locator('#rechercheEleveRepertoire').fill('Noah');
      await page.locator('#unssExportBtn').click();
      const dialog=page.locator('#unssExportDialog');await page.locator('[data-as-download]:enabled').waitFor();
      assert.match(await page.locator('[data-as-count]').innerText(),/3 élève/,'Search must not filter the export');
      const all=await Promise.all([page.waitForEvent('download'),page.locator('[data-as-download]').click()]);
      const xlsx=path.join(out,`all-${width}.xlsx`);await all[0].saveAs(xlsx);assert.match(all[0].suggestedFilename(),/\.xlsx$/);
      const bytes=fs.readFileSync(xlsx);assert.equal(bytes.readUInt32LE(),0x04034b50);assert(bytes.toString().includes('2-04'));assert(bytes.toString().includes('Escalade · Volley'));
      await page.locator('#unssExportBtn').click();await page.locator('[data-as-download]:enabled').waitFor();
      await page.locator('[name="asDownloadKind"][value="activity"]').check();await page.locator('[data-as-activity]').selectOption('volley');
      assert.match(await page.locator('[data-as-count]').innerText(),/1 élève/);
      await page.locator('[name="asDownloadKind"][value="missing"]').check();await page.locator('[data-as-activity]').selectOption('volley');
      assert.match(await page.locator('[data-as-count]').innerText(),/1 élève/);
      const geometry=await page.evaluate(()=>{
        const dialog=document.querySelector('.as-download-dialog'),button=document.querySelector('[data-as-download]'),b=button.getBoundingClientRect(),d=dialog.getBoundingClientRect();
        return{left:d.left,right:d.right,top:d.top,bottom:d.bottom,buttonBottom:b.bottom,buttonHeight:b.height,overflow:dialog.scrollWidth-dialog.clientWidth,viewport:[innerWidth,innerHeight]};
      });
      assert(geometry.left>=0 && geometry.right<=width+1 && geometry.top>=0 && geometry.bottom<=height+1,JSON.stringify(geometry));
      assert(geometry.buttonBottom<=height && geometry.buttonHeight>=44 && geometry.overflow<=1,JSON.stringify(geometry));
      await page.screenshot({path:path.join(out,`dialog-${width}.png`)});
      await page.locator('[name="asDownloadFormat"][value="pdf"]').check();
      const pdf=await Promise.all([page.waitForEvent('download'),page.locator('[data-as-download]').click()]);
      await pdf[0].saveAs(path.join(out,`missing-${width}.pdf`));
      assert(fs.readFileSync(path.join(out,`missing-${width}.pdf`)).toString('latin1').startsWith('%PDF-1.4'));
      if(width===1280){
        const long=await Promise.all([page.waitForEvent('download'),page.evaluate(()=>{
          const students=Array.from({length:120},(_,i)=>({id:String(i),last_name:'EXEMPLE '+i,first_name:'Prénom composé très long',division:'2-04',licensed:true,medical_certificate_missing:true}));
          const slots=[{id:'pdf-slot',activity_name:'Escalade et préparation physique avec plusieurs créneaux complémentaires',day_of_week:'MERCREDI',start_time:'12:00',end_time:'13:00'}];
          const data=EpsAsDownloads.report(EpsAsDownloads.createSnapshot({students,slots,memberships:students.map(s=>({student_id:s.id,slot_id:'pdf-slot'}))}),'missing');
          const context=document.createElement('canvas').getContext('2d');context.font='9px Arial';
          asDownloadBlob(asPdfDocument(EpsAsDownloads.pdfCommands(data,t=>context.measureText(String(t)).width,asPdfText)),'long-missing.pdf');
        })]);await long[0].saveAs(path.join(out,'long-missing.pdf'));
      }
      await context.setOffline(true);
      await page.locator('#unssExportBtn').click();await page.locator('[data-as-download]:enabled').waitFor();
      assert.match(await page.locator('[data-as-count]').innerText(),/3 élève/);
      await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
      await context.setOffline(false);
      // Delayed reads from a previous account must not reopen a dialog or create a download.
      await page.evaluate(()=>{window.asQaCurrent=true;window.asQaReady=new Promise(resolve=>window.asQaResolve=resolve);EpsAsDownloads.open({isCurrent:()=>asQaCurrent,load:()=>asQaReady,download:()=>{throw Error('Unexpected download')}});asQaCurrent=false});
      await page.evaluate(()=>asQaResolve({students:[],slots:[],memberships:[]}));
      await dialog.waitFor({state:'detached'});
      // Failed reads show a retry, never a misleading empty list or enabled download.
      await page.evaluate(()=>EpsAsDownloads.open({isCurrent:()=>true,load:async()=>{throw Error('fake unavailable')},download:()=>{throw Error('Unexpected download')}}));
      await page.locator('[data-as-retry]').waitFor();assert(await page.locator('[data-as-download]').isDisabled());
      assert.match(await page.locator('[data-as-error]').innerText(),/connexion|chargées/);await page.keyboard.press('Escape');
      assert.deepEqual(errors,[]);await context.close();console.log(`PASS AS downloads ${width}x${height}: real page, Excel/PDF, search independence, offline, account guard and retry`);
    }
    const pwa=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow',acceptDownloads:true});
    await pwa.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await pwa.addInitScript({content:'const asQaRegister=navigator.serviceWorker.register.bind(navigator.serviceWorker); const asQaSetItem=Storage.prototype.setItem;\n'+read('tests/faux-serveur.js')+'\nnavigator.serviceWorker.register=asQaRegister;Storage.prototype.setItem=asQaSetItem;\n('+customize.toString()+')();'});
    const page=await pwa.newPage();await page.goto(base+'/');
    await page.waitForFunction(()=>typeof epsPageFullyReady!=='undefined' && epsPageFullyReady);
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:45000});
    await page.evaluate(async()=>{await startAutomaticOfflinePreparation({force:true});if(automaticOfflineState!=='ready')throw Error(automaticOfflineMessage)});
    await pwa.setOffline(true);await page.reload();
    await page.waitForFunction(()=>typeof epsPageFullyReady!=='undefined' && epsPageFullyReady);
    await page.evaluate(async()=>{showTab('unss',{skipModuleStart:true});await initUnssTab()});
    await page.locator('#unssExportBtn').click();await page.locator('[data-as-download]:enabled').waitFor();
    assert.match(await page.locator('[data-as-count]').innerText(),/3 élève/);
    await page.locator('[name="asDownloadKind"][value="missing"]').check();
    const offline=await Promise.all([page.waitForEvent('download'),page.locator('[data-as-download]').click()]);
    await offline[0].saveAs(path.join(out,'pwa-offline-missing.xlsx'));
    await pwa.close();console.log('PASS PWA: complete preparation, offline reload and real Excel download');
  }finally{await browser.close();await new Promise(r=>server.close(r))}
}
main().catch(error=>{console.error(error);server.close();process.exitCode=1});
