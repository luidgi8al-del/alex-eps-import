/* Synthetic regression harness. It never connects to a real account or writes grades. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const reports = path.resolve(root, '../tmp/global-search');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function fixtureHtml() {
  const index = read('index.html');
  const overlay = index.slice(index.indexOf('  <!-- Recherche globale'), index.indexOf('  <div class="container">'));
  const source = read('accueil.js');
  const searchCode = source.slice(source.indexOf('// ---- Recherche globale'), source.indexOf('// ---- Accueil :'));
  assert(searchCode.includes('runGlobalSearch'), 'Real search source must be loaded');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles/site.css"><link rel="stylesheet" href="/styles/ui-system.css"></head><body><button id="searchBtn">Rechercher</button><main id="destination">Travail préservé</main>${overlay}<script>
  let session = {user_id:'prof-A',access_token:'fake-A'};
  localStorage.setItem('eps:installation-manager-role:prof-A','false');
  localStorage.setItem('eps:installation-manager-role:prof-B','false');
  const SUPABASE_URL='https://never-contact.invalid';
  const GRADE_LABELS={SECONDE:'Seconde'};
  window.__calls=[];window.__requests=[];window.__holds={};window.__fail=[];
  window.__data={
    classes:[{id:'class-A',name:'2nde A',school_year:'2026-2027'}],
    students:[{id:'student-A',first_name:'Élise',last_name:'Écuyer',class_id:'class-A'}],
    cycles:[{id:'cycle-A',apsa_name:'Course synthétique',grade:'SECONDE',session_count:3}],
    equipment:[{id:'equipment-A',name:'Chronomètres synthétiques',location:'Gymnase',quantity:5}],
    epi_items:[{id:'epi-A',internal_id:'Corde synthétique',manufacturer:'Marque fictive',model:'C-123'}],
    unss_groups:[{id:'group-A',name:'Volley synthétique'}]
  };
  window.__read=async function(table){const rows=JSON.parse(JSON.stringify(__data[table]||[]));__requests.push(table);if(__fail.includes(table))throw Error('Source temporairement indisponible');if(__holds[table])await __holds[table];return rows};
  window.lireTable=table=>__read(table);
  window.apiFetch=async url=>{const table=new URL(url).pathname.split('/').pop();const data=await __read(table);return{ok:true,json:async()=>data}};
  window.__allow=true;
  window.showTab=name=>{__calls.push(['tab',name]);return __allow};
  window.__route=async function(name,id,options){__calls.push([name,id]);if(window.__routeHold)await window.__routeHold;if(options?.isCurrent&&!options.isCurrent())return false;return __allow};
  window.EPSGlobalSearchEntities={open:(kind,id,options)=>__route(kind,id,options)};
  window.openCourseFromSearch=(id,options)=>__route('course',id,options);
  window.EpsGlobalSearchTools={open:(id,options)=>__route('tool',id,options)};
  window.EpsToolsCatalog=[{id:'timers',title:'Chronomètres',subtitle:'Temps et intervalles',activities:['Athlétisme']}];
  window.EpsTests={TESTS:{TROIS_500:{label:'3 × 500 m',protocol:'Trois courses de 500 mètres'}},CATEGORIES:[{name:'Athle',tests:['TROIS_500']}]};
  window.EPSAtelierEPPCS={searchChapters:async()=>[{id:'chapter-A',title:'Sédentarité synthétique',theme:'Santé',question:'Se déplacer ?',number:1}],openChapter:(id,options)=>__route('chapter',id,options)};
  </script><script>${searchCode}</script></body></html>`;
}

const server = http.createServer((req, res) => {
  const requestPath = decodeURIComponent(req.url.split('?')[0]);
  if (requestPath === '/search-fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixtureHtml()); return; }
  const file = path.resolve(root, '.' + (requestPath === '/' ? '/index.html' : requestPath));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  try { res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404); res.end(); }
});

async function runFixture(context, base) {
  const page = await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base + '/search-fixture');
  await page.evaluate(() => openSearch());
  const search = q => page.evaluate(q => runGlobalSearch(q), q);
  await search('ecuyer');
  assert.match(await page.locator('#searchResults').innerText(), /ÉCUYER|Écuyer/);
  await search('elise ecuyer');
  assert.match(await page.locator('#searchResults').innerText(), /ÉCUYER|Écuyer/, 'Full names in either order should match');
  await search('3x500');
  assert.match(await page.locator('#searchResults').innerText(), /3\s*[×x]\s*500/, '3x500 reaches the existing test');
  await search('3 × 500');
  assert.match(await page.locator('#searchResults').innerText(), /3\s*[×x]\s*500/);
  for (const [query,label,expected] of [
    ['ecuyer','ÉCUYER',['student','student-A']],
    ['2nde a','2nde A',['class','class-A']],
    ['chronometres synthetiques','Chronomètres synthétiques',['equipment','equipment-A']],
    ['corde synthetique','Corde synthétique',['epi','epi-A']],
    ['course synthetique','Course synthétique',['course','cycle-A']],
    ['sedentarite','Sédentarité synthétique',['chapter','chapter-A']],
    ['3x500','3 × 500 m',['tool','eps-test:TROIS_500']],
  ]) {
    await page.evaluate(()=>{openSearch();__calls=[]});await search(query);
    await page.locator('.searchHit').filter({hasText:label}).first().click();
    await page.waitForFunction(()=>__calls.length>0);
    assert.deepEqual(await page.evaluate(()=>__calls.filter(c=>c[0]!=='tab')[0]),expected,'Direct result passes the exact entity identifier');
    assert.equal(await page.locator('#searchOverlay').isVisible(),false,'Successful destination closes search');
  }
  await page.evaluate(()=>{openSearch();__allow=false;__calls=[]});
  await search('ecuyer');await page.locator('.searchHit').first().click();
  await page.waitForFunction(()=>__calls.length>0);
  assert.equal(await page.locator('#destination').textContent(),'Travail préservé','A refused navigation leaves the current work intact');
  await page.evaluate(()=>{__allow=true;openSearch()});
  await search('ecuyer');
  await page.evaluate(()=>{__routeHold=new Promise(resolve=>window.__releaseRoute=resolve);__calls=[]});
  await page.locator('.searchHit').first().click();
  await page.waitForFunction(()=>__calls.length>0);
  await page.evaluate(()=>{closeSearch();openSearch()});await search('chronometres');
  await page.evaluate(()=>{__releaseRoute();__routeHold=null});
  await page.waitForTimeout(30);
  assert.equal(await page.locator('#searchOverlay').isVisible(),true,'Old navigation cannot close a freshly reopened search');
  assert.match(await page.locator('#searchResults').innerText(),/Chronomètres/);

  // Both typed text and database labels must remain text, never executable markup.
  await search('<img src=x onerror="window.__xss=1">');
  assert.equal(await page.locator('#searchResults img').count(),0);
  await page.evaluate(()=>{__data.students.push({id:'student-xss',first_name:'<img src=x onerror="window.__xss=1">',last_name:'Payload',class_id:'class-A'})});
  await search('payload');
  assert.equal(await page.locator('#searchResults img').count(),0);
  assert.equal(await page.evaluate(()=>window.__xss),undefined);

  // Slow query A must not replace the newer query B.
  await page.evaluate(()=>{openSearch();__holds.students=new Promise(r=>window.__release=r);window.__oldSearch=runGlobalSearch('ecuyer')});
  await page.waitForFunction(()=>typeof __release==='function');
  await page.evaluate(()=>{delete __holds.students});
  await page.evaluate(()=>{window.__newSearch=runGlobalSearch('chronometres')});
  await page.evaluate(async()=>{__release();await Promise.all([__oldSearch,__newSearch])});
  assert.match(await page.locator('#searchResults').innerText(),/Chronomètres/);
  assert.doesNotMatch(await page.locator('#searchResults').innerText(),/ÉCUYER/);

  // Closing and reopening invalidates both in-flight requests and delayed input.
  await page.evaluate(()=>{openSearch();__holds.students=new Promise(r=>window.__release=r);window.__oldSearch=runGlobalSearch('ecuyer');closeSearch();openSearch();delete __holds.students});
  await page.evaluate(async()=>{__release();await __oldSearch});
  assert.doesNotMatch(await page.locator('#searchResults').innerText(),/ÉCUYER/);
  await page.locator('#searchInput').fill('ecuyer');
  await page.evaluate(()=>{closeSearch();openSearch()});
  await page.waitForTimeout(300);
  assert.doesNotMatch(await page.locator('#searchResults').innerText(),/ÉCUYER/);

  // No old account records are painted after an account change.
  await page.evaluate(()=>{openSearch();__holds.students=new Promise(r=>window.__release=r);window.__oldSearch=runGlobalSearch('ecuyer');session={user_id:'prof-B',access_token:'fake-B'};delete __holds.students});
  await page.evaluate(async()=>{__release();await __oldSearch});
  assert.doesNotMatch(await page.locator('#searchResults').innerText(),/ÉCUYER/);

  await page.evaluate(()=>{session={user_id:'prof-A',access_token:'fake-A'};openSearch();__calls=[]});
  await search('ecuyer');
  await page.evaluate(()=>{session={user_id:'prof-B',access_token:'fake-B'}});
  await page.locator('.searchHit').first().click();
  assert.deepEqual(await page.evaluate(()=>__calls),[],'A stale result cannot open an entity after switching accounts');

  await page.evaluate(()=>{session={user_id:'prof-A',access_token:'fake-A'};openSearch();__fail=['students']});
  await search('totally-unknown');
  assert.match(await page.locator('#searchResults').innerText(),/indisponible|incompl|réessayer|connexion/i, 'Unavailable sources are reported, not silently called empty');
  await page.evaluate(()=>{__fail=[]});
  await page.evaluate(()=>{session={user_id:'manager',access_token:'manager-token'};localStorage.setItem('eps:installation-manager-role:manager','true');openSearch()});
  const before=await page.evaluate(()=>__requests.length);
  await search('ecuyer');
  assert.equal(await page.evaluate(()=>__requests.length),before,'Installation manager cannot trigger teacher data search');
  assert.doesNotMatch(await page.locator('#searchResults').innerText(),/ÉCUYER/);
  assert.deepEqual(errors,[]);
  await page.close();
  console.log('PASS search: accents, names, 3x500, XSS, asynchronous races, account isolation and unavailable data');
}

async function runResponsive(browser, base) {
  for (const width of [1280,390,320]) {
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,serviceWorkers:'block'});
    await context.route('**/*', route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    const page=await context.newPage();
    await page.goto(base+'/search-fixture');
    await page.evaluate(async()=>{openSearch();__data.equipment.push({id:'equipment-long',name:'Matériel'+ 'trèslong'.repeat(35),location:'Synthétique'});await runGlobalSearch('matériel')});
    const layout=await page.evaluate(()=>{const selectors=['#searchInput','#searchClose','.searchSheet','#searchResults','.searchHit'];return {overflow:document.documentElement.scrollWidth-innerWidth,boxes:selectors.map(selector=>{const element=document.querySelector(selector),rect=element.getBoundingClientRect();return{selector,left:rect.left,right:rect.right,width:rect.width,height:rect.height,overflow:element.scrollWidth-element.clientWidth}})}});
    assert(layout.overflow<=1,`Document overflow at ${width}: ${JSON.stringify(layout)}`);
    for(const box of layout.boxes)assert(box.left>=-1&&box.right<=width+1,`Search clipped at ${width}: ${JSON.stringify(box)}`);
    for(const box of layout.boxes.filter(b=>['.searchSheet','#searchResults','.searchHit'].includes(b.selector)))assert(box.overflow<=1,`Search text clips inside modal at ${width}: ${JSON.stringify(box)}`);
    assert(layout.boxes.find(b=>b.selector==='#searchInput').width>=120,`Search input cramped at ${width}`);
    await page.screenshot({path:path.join(reports,`search-${width}.png`)});
    await page.locator('#searchClose').click();
    await page.locator('#searchOverlay').waitFor({state:'hidden',timeout:12000});
    await context.close();console.log(`PASS search layout ${width}px`);
  }
}

async function runRealDestinations(browser,base) {
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const customize=()=>{
    localStorage.setItem('eps:installation-manager-role:prof-test','false');
    // Complete the legacy fixture with fields used by the real EPI schema.
    __fauxServeur.DONNEES.epi_items[0].internal_id='CORDE-123';
    __fauxServeur.DONNEES.epi_items[0].manufacturer='Fabricant fictif';
    __fauxServeur.DONNEES.epi_items[0].model='Synthétique';
  };
  await context.addInitScript({content:'const originalSearchQaSet=Storage.prototype.setItem;\n'+read('tests/faux-serveur.js')+'\nStorage.prototype.setItem=originalSearchQaSet;\n('+customize.toString()+')();'});
  for(const target of ['student','class','equipment','epi','course','tool']) {
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/');
    await page.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
    // First pupil lookup deliberately races the very first offline-cache preparation.
    // Later destinations use the prepared copy to cover both startup and normal use.
    if(target!=='student')await page.evaluate(async()=>{await(await demarrerModeHorsConnexion()).synchroniser()});
    const query={student:'martin lea',class:'3e6',equipment:'baudrier',epi:'corde-123',course:'rugby',tool:'3x500'}[target];
    await page.evaluate(async query=>{openSearch();await runGlobalSearch(query)},query);
    const hit=page.locator('.searchHit').filter({hasText:{student:'MARTIN',class:'Classe',equipment:'Baudrier',epi:'CORDE-123',course:'Cours',tool:'3 × 500 m'}[target]}).first();
    await hit.click({timeout:5000}).catch(async error=>{console.error('REAL SEARCH DIAGNOSTIC',target,await page.locator('#searchResults').innerText(),await page.evaluate(()=>({role:localStorage.getItem('eps:installation-manager-role:'+session?.user_id),sessionUser:session?.user_id,offline:typeof automaticOfflineState==='undefined'?null:automaticOfflineState,requests:__fauxServeur.appels.slice(-12)})),errors);throw error});
    const destination=selector=>page.locator(selector).waitFor({timeout:12000}).catch(async error=>{
      console.error('DESTINATION DIAGNOSTIC',target,await page.locator('#searchResults').innerText(),await page.evaluate(()=>({currentWebTab,dashboard:typeof dashboardClass==='undefined'?null:dashboardClass,detail:document.getElementById('dashDetailOverlay')?.className})),errors);
      await page.screenshot({path:path.join(reports,`failed-${target}.png`)});throw error;
    });
    if(target==='student') {
      await destination('#dashDetailOverlay.open .student-folder-hero h2');
      assert.match(await page.locator('#dashDetailOverlay .student-folder-hero h2').innerText(),/MARTIN|Martin/);
      assert.equal(await page.locator('#modifierFicheEleve').count(),1);
    }
    if(target==='class') {
      await destination('#classDashboardPanel');
      assert.equal(await page.evaluate(()=>dashboardClass.row.id),'cl-3e6');
    }
    if(target==='equipment') {
      await destination('#equipTab-materiel #saveEquipBtn');
      assert.equal(await page.locator('[data-equip-field="name"]').inputValue(),'Baudrier');
    }
    if(target==='epi') {
      await destination('#equipTab-epi #saveEpiBtn');
      assert.equal(await page.locator('[data-epi-field="internal_id"]').inputValue(),'CORDE-123');
    }
    if(target==='course') {
      await destination('#createdCoursePanel h2');
      assert.match(await page.locator('#createdCoursePanel h2').innerText(),/Rugby/i);
    }
    if(target==='tool') {
      await destination('#toolClass');
      assert.match(await page.locator('#toolPanel').innerText(),/3\s*×\s*500/);
    }
    await page.locator('#searchOverlay').waitFor({state:'hidden',timeout:12000});
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(reports,`destination-${target}.png`)});
    await page.close();console.log('PASS real search destination '+target);
  }
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');await page.waitForFunction(()=>typeof epsPageFullyReady!=='undefined'&&epsPageFullyReady);
  await page.evaluate(async()=>{await(await demarrerModeHorsConnexion()).synchroniser()});
  const beforeDatabases=await page.evaluate(async()=>(await indexedDB.databases()).map(d=>d.name).filter(name=>name.startsWith('eps-eppcs')));
  await page.evaluate(()=>EPSAtelierEPPCS.searchChapters());
  assert.deepEqual(await page.evaluate(async()=>(await indexedDB.databases()).map(d=>d.name).filter(name=>name.startsWith('eps-eppcs'))),beforeDatabases,'Search does not create empty private databases');
  const library={schemaVersion:1,level:'Première EPPCS',sources:[{filename:'Source fictive.docx'}],controls:[],courses:[1,2].map(number=>({
    id:'chapter-'+number,number,title:number===1?'Sédentarité de démonstration':'Performance de démonstration',theme:'Santé fictive',question:'Question fictive',
    sections:[{id:'section',kind:'course',title:'Cours fictif',blocks:[{type:'paragraph',text:'Contenu synthétique, sans cours ni données réels.'}]}],
    sessions:[{number:1,title:'Séance 1',description:'Présentation fictive',durationMinutes:60}],quizzes:[]
  }))};
  await page.evaluate(async()=>{showTab('cours');await showCoursTab('eppcs')});
  await page.locator('[data-eppcs-file]').setInputFiles({name:'synthetic.eppcs.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'eps-eppcs-library',version:1,library}))});
  await page.locator('[data-ep-course="chapter-1"]').waitFor();
  await page.evaluate(()=>EPSAtelierEPPCS.reset());
  assert.equal((await page.evaluate(()=>EPSAtelierEPPCS.searchChapters())).length,2,'Search reuses the existing private library without mounting the atelier');
  const searchChapter=async query=>{
    await page.evaluate(async query=>{openSearch();await runGlobalSearch(query)},query);
    await page.locator('.searchHit').filter({hasText:'démonstration'}).first().click();
    await page.locator('.ep-chapter-head h2').waitFor();
  };
  await searchChapter('sedentarite');
  assert.equal(await page.locator('.ep-chapter-head h2').innerText(),'Sédentarité de démonstration');
  assert.equal(await page.locator('[data-ep-action="mode-lesson"][aria-pressed="true"]').count(),1,'Search opens the actual lesson');
  await page.locator('[data-ep-action="mode-library"]').click();await page.locator('[data-ep-tab="notes"]').click();
  await page.locator('[data-ep-note-text]').fill('Mon brouillon reste conservé pendant la recherche.');
  await searchChapter('performance');
  assert.equal(await page.locator('.ep-chapter-head h2').innerText(),'Performance de démonstration');
  await searchChapter('sedentarite');
  await page.locator('[data-ep-action="mode-library"]').click();await page.locator('[data-ep-tab="notes"]').click();
  assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Mon brouillon reste conservé pendant la recherche.');
  await page.evaluate(async()=>{openSearch();await runGlobalSearch('3e6')});
  await page.locator('.searchHit[data-search-kind="class"]').first().click();
  assert.match(await page.locator('[data-search-action-status]').innerText(),/notes EPPCS|brouillon|Enregistrez/i);
  assert.equal(await page.evaluate(()=>currentWebTab),'cours');
  assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Mon brouillon reste conservé pendant la recherche.','Searching a different module must not discard an existing note');
  await page.evaluate(()=>closeSearch());
  await context.setOffline(true);
  await page.evaluate(async()=>{openSearch();await runGlobalSearch('martin lea')});
  assert(await page.locator('.searchHit[data-search-kind="student"]').count()>0,'Previously synchronized pupils remain searchable without a network');
  assert.match(await page.locator('#searchResults').innerText(),/cet appareil|connexion/i);
  await context.setOffline(false);
  assert.deepEqual(errors,[]);await page.close();console.log('PASS real EPPCS: private read-only search, lesson destination and existing draft preserved');
  await context.close();
}

(async()=>{
  fs.mkdirSync(reports,{recursive:true});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await runFixture(context,base);await context.close();
    await runResponsive(browser,base);
    await runRealDestinations(browser,base);
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
