// Synthetic data only. No school server, account, or real results are accessed.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {chromium} = require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'tool-input-navigation.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles/tools-workspace.css'), 'utf8');
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;padding:10px;font-family:Arial}*{box-sizing:border-box}#toolPanel,#liveToolPanel{width:100%;max-width:1050px;margin-top:70px}.fitness-web{--fit-soft:#eaf4ff;--fit-navy:#123456}.fitness-table-wrap{max-width:100%}input{font:inherit}td>input{border:1px solid #999;border-radius:5px}button{padding:12px} ${css}
</style><div id="toolPanel"><h2>Test fictif</h2><div class="fitness-web"><div class="fitness-table-wrap"><table><thead><tr><th>Nom et prénom</th><th>Critère 1</th><th>Critère 2</th><th>Ignorés</th></tr></thead><tbody></tbody></table></div><div class="tool-savebar"><button>Enregistrer</button><button>Exporter</button></div></div></div><button id="outside">Hors outil</button>
<script>
window.values={a1:'',a2:'',b1:'',b2:''};window.changes={};window.reorder=false;
window.render=()=>{document.querySelector('tbody').innerHTML=(reorder?['b','a']:['a','b']).map(id=>'<tr data-student-id="'+id+'"><td><strong>'+ (id==='a'?'NOM-LONG-FICTIF Élève A':'NOM FICTIF Élève B')+'</strong></td>'+[1,2].map(col=>'<td><input data-field="'+id+col+'" type="number" min="0" max="20" value="'+values[id+col]+'"></td>').join('')+'<td><input disabled value="0"><input readonly value="0"><input type="hidden"><input type="checkbox"></td></tr>').join('');document.querySelectorAll('[data-field]').forEach(input=>{input.oninput=()=>values[input.dataset.field]=input.value;input.onchange=()=>{changes[input.dataset.field]=(changes[input.dataset.field]||0)+1;if(window.redraw){window.reorder=true;render();}};});};render();
window.fakeViewport=new EventTarget();Object.assign(fakeViewport,{height:innerHeight,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{value:fakeViewport,configurable:true});
</script>`;

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    for (const mode of ['desktop', 'mobile', 'pwa']) {
      const mobile = mode !== 'desktop';
      const context = await browser.newContext({viewport: mobile ? {width:390,height:844} : {width:1440,height:950}, isMobile:mobile, hasTouch:mobile, serviceWorkers:'block'});
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => route.fulfill({contentType:'text/html;charset=utf-8',body:html}));
      await page.goto('https://fixture.invalid');
      if (mode === 'pwa') await page.evaluate(() => {const original=matchMedia;window.matchMedia=q=>q==='(display-mode: standalone)'?{matches:true,addEventListener(){},removeEventListener(){}}:original(q);});
      await page.addScriptTag({content:script});
      const field = key => page.locator(`[data-field="${key}"]`);

      await field('a1').fill('4'); await field('a1').press('Enter');
      await page.waitForFunction(() => document.activeElement?.dataset.field === 'a2');
      assert.equal(await page.evaluate(() => changes.a1), 1, 'Enter must commit once, not dispatch change then commit it a second time');
      await field('a2').dispatchEvent('keydown',{key:'Enter',repeat:true});
      assert.equal(await page.evaluate(() => document.activeElement.dataset.field),'a2','holding Enter must not skip fields');
      await field('a2').fill('5'); await field('a2').press('Enter');
      await page.waitForFunction(() => document.activeElement?.dataset.field === 'b1');
      await field('b1').press('Shift+Enter');
      await page.waitForFunction(() => document.activeElement?.dataset.field === 'a2');
      await field('a2').fill('99'); await field('a2').press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.field), 'a2', 'invalid value keeps focus');

      await field('a2').fill('5');
      await page.evaluate(() => {document.querySelector('[data-field="a2"]').onkeydown=e=>{if(e.key==='Enter')e.preventDefault();};});
      await field('a2').press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.field), 'a2', 'tool-specific handled Enter is respected');
      await page.evaluate(() => {document.querySelector('[data-field="a2"]').onkeydown=null;window.redraw=true;});
      await field('a1').fill('6'); await field('a1').press('Enter');
      await page.waitForFunction(() => document.activeElement?.dataset.field === 'a2');
      assert.equal(await field('a2').inputValue(), '5', 'redrawn/reordered table targets the original pupil and criterion');
      await field('a2').pressSequentially('9');
      assert.equal(await field('a2').inputValue(), '9', 'next numeric field selects its value rather than appending digits');
      await field('a2').fill('5');
      await page.evaluate(() => {window.redraw=false;document.getElementById('toolPanel').id='liveToolPanel';});
      await field('b1').fill('8'); await field('b1').press('Enter');
      await page.waitForFunction(() => document.activeElement?.dataset.field === 'b2');

      // Native undo remains native: the helper never swallows Ctrl+Z or overwrites typed text.
      await field('b2').fill('4'); await field('b2').press('ControlOrMeta+A'); await field('b2').pressSequentially('7');
      await field('b2').press('ControlOrMeta+z');
      assert.equal(await field('b2').inputValue(), '4');
      assert.equal(await page.evaluate(() => values.b2), '4');

      if (mobile) {
        const nameWidth = await page.locator('tbody tr').first().locator('td').first().evaluate(n=>n.getBoundingClientRect().width);
        assert(nameWidth <= 114, `name column too wide: ${nameWidth}`);
        assert.equal(await field('a1').evaluate(n=>getComputedStyle(n).fontSize), '16px');
        assert.equal(await page.locator('.tool-savebar').evaluate(n=>getComputedStyle(n).position), 'static', 'live tool actions cannot cover mobile input');
        await page.evaluate(() => {const wrap=document.querySelector('.fitness-table-wrap');wrap.scrollLeft=600;});
        await field('a2').focus();
        await page.waitForFunction(() => {const input=document.querySelector('[data-field="a2"]'),name=input.closest('tr').firstElementChild,wrap=document.querySelector('.fitness-table-wrap');return input.getBoundingClientRect().left >= name.getBoundingClientRect().right+4 && input.getBoundingClientRect().right <= wrap.getBoundingClientRect().right-4;});
        await page.evaluate(() => {fakeViewport.height=300;fakeViewport.dispatchEvent(new Event('resize'));});
        await page.waitForFunction(() => document.activeElement.getBoundingClientRect().bottom <= 288);
        assert.equal(await page.locator('#liveToolPanel').evaluate(n=>n.style.getPropertyValue('--tool-keyboard-gap')), '544px');
        await page.locator('#outside').focus();
        await page.waitForFunction(() => !document.getElementById('liveToolPanel').classList.contains('tool-field-editing'));
      }
      assert.deepEqual(errors, []);
      console.log('PASS field ergonomics', mode, ': Enter/Shift-Enter, one commit, validity, handled key, redraw identity, live tools, native undo', mobile?'sticky names, touch size, keyboard viewport':'');
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
