const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const prefix='IE.Identite.collection._1.Instances[2].Instances[1]';
function fixture(mode='normal'){
 const rows=[['BERNARD Adam',''],['MARTIN Lina','13'],['DUPONT Elsa',''],['AUTRE Élève','']];
 const html=rows.map(([name,value],r)=>`<div id="${prefix}_0_${r}" class="liste_celluleGrid" data-colonne="0"><div role="rowheader">${name}</div></div><div id="${prefix}_2_${r}" class="liste_celluleGrid" data-colonne="2"><div role="gridcell" id="${prefix}_2_${r}_div">9</div></div><div id="${prefix}_5_${r}" class="liste_celluleGrid" data-colonne="5"><div role="gridcell" tabindex="-1" id="${prefix}_5_${r}_div" aria-describedby="${prefix}_celEdit">${value}</div></div>`).join('');
 return `<style>[role=gridcell],[role=rowheader]{min-height:40px}</style><div class="liste_content_lignes" id="${prefix}_grid_0" style="display:grid;grid-template-columns:200px 70px 70px">${html}</div><script>
 window.writes=[];document.querySelectorAll('[data-colonne="5"]').forEach(cell=>cell.ondblclick=()=>{
 if('${mode}'==='no-editor')return;const display=cell.firstElementChild;const input=document.createElement('input');input.id='${prefix}_Edition';input.type='text';input.value=display.textContent;cell.append(input);display.style.display='none';input.focus();
 if('${mode}'==='replace-display')display.remove();
 if('${mode}'==='strip-marker')display.removeAttribute('aria-describedby');
 input.onkeydown=e=>{if(e.key!=='Enter')return;window.writes.push({cell:cell.id,value:input.value});if('${mode}'==='no-confirm')return;display.textContent=input.value;input.remove();display.style.display='';display.setAttribute('aria-describedby','${prefix}_celEdit');if(!display.isConnected)cell.append(display);if('${mode}'==='replace-cell')cell.replaceWith(cell.cloneNode(true));};
 });</script>`;
}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();let mode='normal';await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture(mode)}));
 const file=fs.existsSync(path.join(__dirname,'extension/bridge.js'))?'extension/bridge.js':'../extensions/pronote-lvh/bridge.js';const script=fs.readFileSync(path.join(__dirname,file),'utf8');
 const payload={format:'eps-pronote-v1',scale:20,rows:[{lastName:'MARTIN',firstName:'Lina',value:'18'},{lastName:'DUPONT',firstName:'Elsa',value:'16,5'},{lastName:'BERNARD',firstName:'Adam',value:'12'}]};
 const start=async(data=payload,column='5')=>{await page.goto('https://3500010j.index-education.net/pronote/professeur.html');await page.addScriptTag({content:script});await page.evaluate(d=>EpsPronoteBridge.open(d),data);await page.getByText('Choisir la colonne',{exact:true}).click();await page.locator(`[data-colonne="${column}"] [role=gridcell]`).first().click();};
 const status=()=>page.locator('#eps-pronote-bridge #status').innerText();
 const fill=async(test=false)=>{await page.locator('#eps-pronote-bridge #confirm').check();await page.locator(test?'#eps-pronote-bridge #test':'#eps-pronote-bridge #fill').click();await page.waitForFunction(()=>!document.querySelector('#eps-pronote-bridge').shadowRoot.getElementById('pick').disabled);};
 await start();assert.match(await status(),/3 élèves reconnus/);await fill();assert.match(await status(),/2 cellule\(s\) remplie/);assert.deepEqual(await page.evaluate(()=>writes.map(w=>w.value)),['16,5','12']);assert.equal(await page.locator('[data-colonne="5"] [role=gridcell]').nth(1).innerText(),'13');
 await start();await fill(true);assert.equal(await page.evaluate(()=>writes.length),1);
 assert.match(await page.locator('#eps-pronote-bridge #fill').innerText(),/notes restantes/);assert.equal(await page.locator('#eps-pronote-bridge #fill').isEnabled(),true);
 await fill();assert.deepEqual(await page.evaluate(()=>writes.map(w=>w.value)),['16,5','12']);assert.equal(await page.locator('#eps-pronote-bridge #fill').isDisabled(),true);
 await start();await fill(true);await page.locator('[data-colonne="5"] [role=gridcell]').first().evaluate(e=>e.textContent='11');await fill();assert.equal(await page.evaluate(()=>writes.length),1);assert.match(await status(),/tableau a changé/);
 await start();await fill(true);await page.locator('[role=rowheader]').first().evaluate(e=>e.textContent='Autre nom');await fill();assert.equal(await page.evaluate(()=>writes.length),1);assert.match(await status(),/introuvable/);
 mode='replace-display';await start();await fill(true);assert.equal(await page.evaluate(()=>writes.length),1);assert.match(await status(),/Note test saisie/);await fill();assert.equal(await page.evaluate(()=>writes.length),2);
 mode='strip-marker';await start();await fill();assert.equal(await page.evaluate(()=>writes.length),2);assert.match(await status(),/2 cellule\(s\) remplie/);
 mode='replace-cell';await start();await fill();assert.equal(await page.evaluate(()=>writes.length),2);assert.match(await status(),/2 cellule\(s\) remplie/);
 mode='normal';
 await start(payload,'2');assert.match(await status(),/pas la moyenne/);assert.ok(await page.locator('#eps-pronote-bridge #fill').isDisabled());
 await start({...payload,rows:[...payload.rows,{lastName:'INTROUVABLE',firstName:'Test',value:'10'}]});assert.match(await status(),/introuvable/);
 await start();await page.locator('[role=rowheader]').first().evaluate(e=>e.textContent='Autre nom');await fill();assert.equal(await page.evaluate(()=>writes.length),0);
 await start();await page.locator('[data-colonne="5"] [role=gridcell]').first().evaluate(e=>e.textContent='11');await fill();assert.match(await status(),/tableau a changé/);assert.equal(await page.evaluate(()=>writes.length),0);
 mode='no-editor';await start();await fill();assert.match(await status(),/pas ouvert/);assert.equal(await page.evaluate(()=>writes.length),0);
 mode='no-confirm';await start();await fill(true);assert.match(await status(),/non confirmé/);assert.equal(await page.evaluate(()=>writes.length),1);assert.equal(await page.locator('#eps-pronote-bridge #fill').isDisabled(),true);
 mode='normal';await start({...payload,rows:[{lastName:'BERNARD',firstName:'Adam',value:'A'}]});assert.match(await status(),/manuellement/);
 console.log('PASS PRONOTE grid: names, extra student, reordered roster, preservation, one-note test, cell rerender, mean rejected, missing/changed names and values, missing editor, unconfirmed write stops, annotations blocked');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
