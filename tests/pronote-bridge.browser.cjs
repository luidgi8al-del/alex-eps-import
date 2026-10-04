const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage();
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<table><tr><td>Martin Lina</td><td><input value="13"></td></tr><tr><td>Bernard Adam</td><td><input></td></tr></table>'}));
 await page.goto('https://3500010j.index-education.net/pronote/professeur.html');
 const adapter = fs.existsSync(path.join(__dirname,'extension/bridge.js')) ? path.join(__dirname,'extension/bridge.js') : path.join(__dirname,'../extensions/pronote-lvh/bridge.js');
 await page.addScriptTag({content:fs.readFileSync(adapter,'utf8')});
 const payload={format:'eps-pronote-v1',className:'6e1',title:'Test',date:'2026-10-04',scale:20,rows:[{lastName:'Bernard',firstName:'Adam',value:'15'},{lastName:'Martin',firstName:'Lina',value:'17'}]};
 const start=async data=>{await page.evaluate(d=>EpsPronoteBridge.open(d),data);await page.getByText('Choisir la colonne',{exact:true}).click();await page.locator('tr').first().locator('td').nth(1).click();};
 await start(payload);assert.match(await page.locator('#eps-pronote-bridge #status').innerText(),/2 élèves reconnus/);
 await page.locator('#eps-pronote-bridge input[type=checkbox]').check();await page.getByText('Remplir les cellules vides',{exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#eps-pronote-bridge').shadowRoot.getElementById('status').textContent.includes('1 cellule(s)'));
 assert.equal(await page.locator('tr').first().locator('input').inputValue(),'13');assert.equal(await page.locator('tr').nth(1).locator('input').inputValue(),'15');
 await start({...payload,rows:[...payload.rows,{lastName:'Inconnu',firstName:'Élève',value:'12'}]});
 assert.match(await page.locator('#eps-pronote-bridge #status').innerText(),/introuvable/);assert.equal(await page.getByText('Remplir les cellules vides',{exact:true}).isDisabled(),true);
 const duplicate=await page.evaluate(d=>{try{EpsPronoteBridge.validate({...d,rows:[d.rows[0],d.rows[0]]});return false;}catch{return true;}},payload);assert.equal(duplicate,true);
 await page.locator('tr').nth(1).locator('input').fill('');await start(payload);await page.locator('tr').nth(1).locator('input').fill('9');
 await page.locator('#eps-pronote-bridge input[type=checkbox]').check();await page.getByText('Remplir les cellules vides',{exact:true}).click();
 assert.match(await page.locator('#eps-pronote-bridge #status').innerText(),/tableau a changé/);assert.equal(await page.locator('tr').nth(1).locator('input').inputValue(),'9');
 await page.locator('tr').nth(1).locator('td').nth(1).evaluate(el=>el.innerHTML='');await start(payload);
 assert.match(await page.locator('#eps-pronote-bridge #status').innerText(),/Éditeur PRONOTE non reconnu/);
 console.log('PASS: matching by name, preservation, missing names, duplicates, changed table and unsupported editor');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
