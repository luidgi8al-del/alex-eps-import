/* Destructive actions are exercised only against synthetic local data. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../tmp/selection-delete');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}
  catch(_){res.writeHead(404);res.end()}
});
function fixture(){
  const data=__fauxServeur.DONNEES,now=new Date().toISOString();
  data.unss_students=[1,2,3,4,5,6].map(i=>({id:'selected-test-'+i,user_id:'prof-test',institution_id:'etab-1',last_name:'EXEMPLE '+i,first_name:'Fictif',division:[1,2,5,6].includes(i)?'3-06':'3-07',licensed:i===5,deleted:false,updated_at:now}));
  data.unss_memberships=[{id:'membership-test',student_id:'selected-test-6',slot_id:'usl-1',user_id:'prof-test',deleted:false,updated_at:now}];
  const original=window.fetch;
  window.fetch=(url,options={})=>{
    if(!navigator.onLine && String(url).includes('supabase.co'))return Promise.reject(new TypeError('Offline'));
    if(String(url).includes('/rest/v1/unss_students') && options.method==='PATCH'){
      const id=new URL(String(url)).searchParams.get('id')?.replace(/^eq\./,'');
      const row=data.unss_students.find(s=>s.id===id);if(row)Object.assign(row,JSON.parse(options.body));
    }
    return original(url,options);
  };
}
async function main(){
  fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{for(const width of [1280,390]){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await context.addInitScript({content:'const originalSelectionSet=Storage.prototype.setItem;\n'+fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')+'\nStorage.prototype.setItem=originalSelectionSet;('+fixture.toString()+')();'});
    const page=await context.newPage(),errors=[],dialogs=[];let accept=false;
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async dialog=>{dialogs.push(dialog.message());if(dialog.type()==='confirm' && accept)await dialog.accept();else await dialog.dismiss()});
    await page.goto('http://127.0.0.1:'+server.address().port+'/');
    await page.waitForFunction(()=>typeof epsPageFullyReady!=='undefined' && epsPageFullyReady);
    await page.evaluate(async()=>{await(await demarrerModeHorsConnexion()).synchroniser();showTab('students',{skipModuleStart:true});await ouvrirRepertoireEleves()});
    const button=page.locator('#unssDeleteSelectionBtn');assert(await button.isDisabled());assert.equal(await page.getByText('Supprimer toute la liste',{exact:true}).count(),0);
    await page.locator('#filtreDivision').selectOption('3-06');await page.locator('[data-coche="selected-test-1"]').check();
    await page.locator('#filtreDivision').selectOption('3-07');await page.locator('[data-coche="selected-test-3"]').check();
    await page.locator('#filtreDivision').selectOption('3-06');assert.match(await button.innerText(),/\(2\)/);
    await button.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`selection-${width}.png`)});
    await button.click();await page.waitForFunction(()=>!suppressionSelectionEnCours);
    assert(dialogs[0].includes('uniquement 2'));assert(dialogs[0].includes('3-07'));assert.equal(await page.evaluate(()=>unssStudents.length),6);
    assert.equal(await page.evaluate(()=>selectionEleves.size),2);
    accept=true;await button.click();await page.waitForFunction(()=>!suppressionSelectionEnCours && !unssStudents.some(s=>['selected-test-1','selected-test-3'].includes(s.id)));
    const rows=await page.evaluate(()=>unssStudents.map(s=>s.id).sort());assert.deepEqual(rows,['selected-test-2','selected-test-4','selected-test-5','selected-test-6']);
    assert(await button.isDisabled());
    await page.locator('[data-coche="selected-test-5"]').check();await button.click();await page.waitForFunction(()=>!suppressionSelectionEnCours);
    assert(dialogs.some(m=>m.includes('licenciés AS') && m.includes('conservés')));assert(await page.locator('[data-coche="selected-test-5"]').isChecked());
    await page.locator('#viderSelection').click();await page.locator('[data-coche="selected-test-6"]').check();await button.click();await page.waitForFunction(()=>!suppressionSelectionEnCours);
    assert(await page.locator('[data-coche="selected-test-6"]').isChecked());await page.locator('#viderSelection').click();
    // The shared tombstone queue must also preserve only the selected pupil while offline.
    await page.locator('#filtreDivision').selectOption('3-07');await page.locator('[data-coche="selected-test-4"]').check();
    await context.setOffline(true);await button.click();await page.waitForFunction(()=>!suppressionSelectionEnCours);
    const offline=await page.evaluate(async()=>{
      const {readLocalRecord}=await import('./pwa/storage/records.js');
      return {rows:(await modeHorsConnexion.lire('unss_students')).rows,removed:(await readLocalRecord('unss_students','selected-test-4')).deleted,
        unselected:(await readLocalRecord('unss_students','selected-test-2')).deleted,selected:[...selectionEleves]};
    });
    assert.equal(offline.removed,true);assert.equal(offline.unselected,false);assert(!offline.rows.some(s=>s.id==='selected-test-4'));assert.equal(offline.selected.length,0);
    await context.setOffline(false);await page.evaluate(()=>modeHorsConnexion.synchroniser());
    assert.deepEqual(errors,[]);await context.close();console.log('PASS directory selection '+width+': cancel, exact IDs across divisions, AS protection, offline queue; unselected pupils preserved');
  }}finally{await browser.close();await new Promise(r=>server.close(r))}
}
main().catch(error=>{console.error(error);server.close();process.exitCode=1});
