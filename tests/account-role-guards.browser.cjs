const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({channel:'chrome',headless:true});try {
 for(const mode of ['unknown','teacher','manager']) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await context.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
  await context.addInitScript(mode=>{const fetch=window.fetch;window.fetch=(url,options)=>String(url).includes('/rpc/eps_installation_manager_context')?Promise.resolve(new Response(JSON.stringify(mode==='unknown'?{error:'unavailable'}:{is_manager:mode==='manager',institution_id:'etab-1'}),{status:mode==='unknown'?503:200,headers:{'Content-Type':'application/json'}})):fetch(url,options)},mode);
  const page=await context.newPage();await page.goto(origin);await page.waitForTimeout(700);
  if(mode==='unknown'){assert.equal(await page.locator('#roleVerificationNotice').count(),1);assert.equal(await page.locator('#mainView').isVisible(),false)}
  if(mode==='teacher'){assert.equal(await page.locator('#roleVerificationNotice').count(),0);assert.equal(await page.locator('#mainView').isVisible(),true)}
  if(mode==='manager'){assert(page.url().includes('responsable-installations.html'));assert.equal(await page.locator('#tabbar').count(),0)}
  await context.close();
 }
 console.log('PASS unknown role blocked, verified teacher accepted, manager routed to restricted space (mock server, not production RLS)');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
