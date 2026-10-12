const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{const p=path.join(root,req.url.split('?')[0]);res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
  for(const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile});
    const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/offline.html`);
    await page.evaluate(()=>{document.body.innerHTML='<div id="sessionSheet"></div>';globalThis.demarrerModeHorsConnexion=async()=>({adapter:{tables:['eps_lesson_archives']},lire:async()=>[{payload:{lessons:[{title:'Ma séance <script>bad()</script>',mainObjective:'Objectif personnel',personalNote:'Note conservée',situations:[{title:'Atelier',instructions:'<img src=x onerror=bad()>'}]}]}}]});globalThis.apiFetch=()=>{throw Error('Aucun réseau autorisé')};});
    await page.addScriptTag({url:`http://127.0.0.1:${server.address().port}/lesson-recovery.js`});
    await context.setOffline(true);
    const content=await page.evaluate(async()=>{const lessons=await savedLessons({id:'cycle-1'});showSavedLesson(lessons[0],'Cycle');return {text:document.getElementById('sessionSheet').textContent,unsafe:document.querySelectorAll('#sessionSheet script,#sessionSheet img').length};});
    assert(content.text.includes('Objectif personnel'));assert(content.text.includes('Note conservée'));assert.equal(content.unsafe,0);
    await page.getByRole('button',{name:'Fermer',exact:true}).click();assert.equal(await page.locator('#sessionSheet').isVisible(),false);
    await context.close();
  }
  console.log('PASS authored lesson offline desktop/mobile: exact content, private notes, escaped markup, close');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
