const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await context.addInitScript({content:fs.readFileSync(path.join(root,'tests/faux-serveur.js'),'utf8')});
 // The fixture blocks writes; restore real storage only for the device preference under test.
 await context.addInitScript(()=>{const proto=Storage.prototype;const get=proto.getItem;proto.setItem=function(k,v){if(k==='eps:device-display-mode')document.cookie=`epsTestMode=${v};path=/`;};proto.getItem=function(k){if(k==='eps:device-display-mode')return document.cookie.match(/epsTestMode=(auto|mobile|desktop)/)?.[1]||null;return get.call(this,k);};});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForSelector('body.mobile-simple #mobileHome:not([hidden])');
 assert.equal(await page.locator('#mobileHome .mobile-home-link').count(),4);
 assert.deepEqual(await page.locator('#mobileHome .mobile-home-link strong').allTextContents(),['ASLVH','Outils','Équipement','Planning']);
 assert.equal(await page.locator('#tabbar').isVisible(),false);
 for(const [width,height] of [[320,568],[360,640],[390,660],[390,844],[650,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(80);
  const layout=await page.evaluate(()=>({scrollHeight:document.documentElement.scrollHeight,home:document.getElementById('mobileHome').getBoundingClientRect().height,header:document.querySelector('.header').getBoundingClientRect().height,horizontal:document.documentElement.scrollWidth>innerWidth,vertical:document.documentElement.scrollHeight>innerHeight+1,resume:document.querySelector('.mobile-home-resume').getBoundingClientRect().bottom,nav:document.getElementById('mobileBottomNav').getBoundingClientRect().top}));
  assert.equal(layout.horizontal,false,`horizontal overflow ${width}x${height}`);assert.equal(layout.vertical,false,`home scrolls at ${width}x${height}: ${JSON.stringify(layout)}`);assert(layout.resume<=layout.nav,`resume covered at ${width}x${height}`);
 }
 await page.setViewportSize({width:390,height:844});
 const resumedTitle=await page.locator('#mobileHome .tool-resume-card b').innerText();await page.locator('#mobileHome .tool-resume-card').click();await page.waitForSelector('#tab-outils #toolPanel',{state:'visible'});assert((await page.locator('#toolPanel').innerText()).includes(resumedTitle));await page.locator('#mobileBottomNav [data-mobile-tab=home]').click();
 for(const [tab,hash] of [['ASLVH','unss'],['Outils','outils'],['Équipement','equipement']]){await page.locator('#mobileBottomNav button').filter({hasText:tab}).click();await page.waitForFunction(h=>location.hash==='#'+h,hash);assert.equal(await page.locator(`#tab-${hash}`).isVisible(),true);await page.locator('#mobileBottomNav button').filter({hasText:'Accueil'}).click();}
 await page.locator('#mobileHome [data-mobile-tab=planning]').click();await page.waitForFunction(()=>location.hash==='#planning');assert.equal(await page.locator('#tab-programmation').isVisible(),true);
 await page.locator('#mobileBottomNav [data-mobile-tab=plus]').click();await page.locator('#mobileMoreOverlay [data-mobile-tab=health]').click();assert.equal(await page.locator('#tab-health').isVisible(),true);
 await page.locator('#mobileBottomNav [data-mobile-tab=plus]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#mobileMoreOverlay').isVisible(),false);
 await page.locator('#mobileBottomNav [data-mobile-tab=plus]').click();await page.locator('#mobileMoreOverlay [data-mobile-tab=settings]').click();await page.locator('[data-settings-category=visual]').click();await page.locator('#visualSection summary').click();await page.locator('#visualTab-home').click();
 await page.locator('#deviceDisplayMode').selectOption('desktop');assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('mobile-simple')),false);assert.equal(await page.locator('#tabbar').isVisible(),true);
 await page.reload();await page.waitForSelector('#mainView[style*="block"]');assert.equal(await page.evaluate(()=>EpsMobileDisplay.getMode()),'desktop');assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('mobile-simple')),false);
 await page.evaluate(()=>EpsMobileDisplay.setMode('auto'));await page.waitForSelector('body.mobile-simple');
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(100);assert.equal(await page.locator('#mobileHome').isVisible(),false);assert.equal(await page.locator('.homeHero').isVisible(),true);
 await page.evaluate(()=>EpsMobileDisplay.setMode('mobile'));assert.equal(await page.locator('#mobileHome').isVisible(),true);
 await page.setViewportSize({width:390,height:844});await page.locator('#mobileBottomNav [data-mobile-tab=home]').click();
 await fs.promises.mkdir(path.join(root,'output/mobile-navigation'),{recursive:true});await page.screenshot({path:path.join(root,'output/mobile-navigation/home-390.png'),fullPage:true});
 await page.evaluate(()=>showAuthView());await page.waitForTimeout(50);assert.equal(await page.locator('#mobileBottomNav').isVisible(),false);assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('mobile-simple')),false);
 assert.deepEqual(errors,[]);console.log('PASS mobile priorities, all routes, safe-area navigation, display overrides, persistence, desktop and signed-out state');
 }finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
