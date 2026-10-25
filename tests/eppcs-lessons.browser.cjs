/* Browser QA uses synthetic fixtures by default. Optional private material is read
 * only from an explicitly supplied path outside this public repository. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const lessonModel = require('../eppcs-lesson-model.js');
const out = path.resolve(root, '..', 'atelier-eppcs', 'qa', 'lessons');
const p = text => ({ type:'paragraph', text });
const synthetic = {
  level:'Première EPPCS', sources:[{id:'courses',filename:'Cours fictif.docx',sha256:'not-the-reviewed-source'}],
  courses:[1,2].map(number => ({
    id:'synthetic-'+number, number, title:'Chapitre fictif '+number, theme:'Thème de démonstration',
    question:'Question de préparation fictive',
    sessions:[1,2].map(n => ({number:n,title:'Séance '+n,description:'Déroulement fictif '+n,durationMinutes:60})),
    sections:[
      {id:'course',kind:'course',title:'Cours intégral',blocks:[p('TEXTE_COURS_CONSERVE'),p('<img src=x onerror=alert(1)>')]},
      {id:'objectives',kind:'objectives',title:'Objectifs',blocks:[p('Objectifs fictifs')]},
      {id:'case',kind:'case',title:'Cas guidé',blocks:[p('Question 1 : consigne fictive'),p('Réponse attendue : SECRET_CAS_PROF')]},
      {id:'quiz',kind:'quiz',title:'Quiz vierge',blocks:[p('Question fictive ?'),p('a) Choix A'),p('b) Choix B')]},
      {id:'quiz-correction',kind:'quiz-correction',title:'Corrigé',blocks:[p('SECRET_QUIZ_PROF')]},
      {id:'references',kind:'references',title:'Références',blocks:[p('Référence fictive')]}
    ],
    quizzes:[{number:1,prompt:'Question fictive ?',choices:[{key:'a',text:'Choix A'},{key:'b',text:'Choix B'}],answerKey:'b',correction:'SECRET_QUIZ_PROF'}]
  })),
  controls:[{id:'control-fictif',title:'Contrôle fictif',courseNumbers:[1],subject:[p('SUJET_CONTROLE_VIERGE')],correction:[p('SECRET_CONTROLE_PROF')]}]
};
const server = http.createServer((req,res) => {
  const url = new URL(req.url, 'http://localhost');
  if(url.pathname === '/test') {
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.end('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles/site.css"><link rel="stylesheet" href="/styles/eppcs.css"><style>body{margin:0;padding:12px}#app{max-width:1280px;margin:auto}</style></head><body><div id="app"></div><script src="/eppcs-lesson-model.js"></script><script src="/eppcs-ui.js"></script></body></html>');
  }
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(error,bytes)=>{res.writeHead(error?404:200,{'Content-Type':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});res.end(error?'':bytes);});
});
async function checkLayout(page,width,label) {
  assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1), 'No horizontal page overflow: '+width+'/'+label);
  const undersized=await page.locator('#app button').evaluateAll(buttons=>buttons.filter(button=>{
    const rect=button.getBoundingClientRect();return rect.width>0 && rect.height>0 && rect.height<43.5;
  }).map(button=>button.dataset.epAction||button.dataset.epTab||'button'));
  assert.deepEqual(undersized,[],'Touch targets at least 44 px: '+width+'/'+label);
}
async function openFlow(page,step) {
  const flow=page.locator('.ep-flow[data-ep-step="'+step+'"]');
  if(!await flow.evaluate(el=>el.open))await flow.locator(':scope > summary').click();
  return flow;
}
async function mount(page,data) {
  await page.evaluate(data=>{
    window.printed=[];window.saved=[];window.failSave=false;
    window.instance=EPPCSView.mount(document.getElementById('app'),{
      data,loadNotes:async()=>({}),
      saveNote:async(id,note)=>{if(window.failSave)throw Error('Test rejection');window.saved.push({id,note});return {...note,base:{revision:window.saved.length},message:'Enregistré localement'};},
      onPrint:document=>window.printed.push(document)
    });
  },data);
}
async function assertStudentPrintSafe(page,course) {
  const printed=await page.evaluate(()=>instance.getPrintableDocument('student-sheet'));
  assert(printed?.html,'Student sheet printable document available');
  // Do not include private source text in assertion output or public fixtures.
  const correctionStrings=(course.sections||[]).flatMap(s=>s.kind==='quiz-correction'?(s.blocks||[]):s.kind==='case'?(s.blocks||[]).filter(b=>/^Réponse attendue(?:\s|$)/u.test(b.text||'')):[]).map(b=>b.text).filter(text=>typeof text==='string'&&text.length>24);
  for(const text of correctionStrings)assert(!printed.html.includes(text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))),'Student sheet omits professor correction');
  assert(!/SECRET_.*_PROF|class="ep-answer|checked(?:\s|[=>])/.test(printed.html),'Student sheet excludes correction and current selections');
}
async function checkQuizReset(page,course) {
  const last=(course.sessions||[]).length-1;
  if(last<1 || !(course.quizzes||[]).length)return;
  await page.locator('[data-ep-action="session"][data-ep-session="'+last+'"]').click();
  const flow=await openFlow(page,'verify');
  const radios=flow.locator('input[type="radio"]');
  if(!await radios.count())return; // Unreviewed imports stay unassigned, not guessed.
  assert.equal(await flow.locator('.ep-answer').count(),0,'Expected answers initially hidden');
  await radios.first().check();
  const firstValue=await radios.first().inputValue();
  await flow.locator('[data-ep-action="reveal"]').click();
  assert(await flow.locator('.ep-answer').count()>0,'Teacher explicitly reveals feedback');
  const alternatives=flow.locator('input[name="'+await radios.first().getAttribute('name')+'"]');
  if(await alternatives.count()>1) {
    await alternatives.nth(1).check();
    assert(await alternatives.nth(1).evaluate(el=>el===document.activeElement),'Radio change preserves keyboard focus');
    assert.notEqual(await alternatives.nth(1).inputValue(),firstValue);
  }
  await assertStudentPrintSafe(page,course);
  await page.locator('[data-ep-action="session"][data-ep-session="0"]').click();
  assert(await page.locator('[data-ep-action="session"][data-ep-session="0"]').evaluate(el=>el===document.activeElement),'Session change preserves keyboard focus');
  await page.locator('[data-ep-action="session"][data-ep-session="'+last+'"]').click();
  const resetFlow=await openFlow(page,'verify');
  assert.equal(await resetFlow.locator('input:checked').count(),0,'Quiz choices reset on changing the session');
  assert.equal(await resetFlow.locator('.ep-answer').count(),0,'Quiz correction resets on changing the session');
}
async function checkLibrary(browser,origin,data,name) {
  for(const width of [320,390,1280]) {
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/test#cours');await mount(page,data);
    for(let index=0;index<data.courses.length;index++) {
      const course=data.courses[index];
      await page.locator('[data-ep-course="'+course.id+'"]').click();
      assert.equal(await page.locator('[data-ep-action="mode-lesson"]').getAttribute('aria-pressed'),'true','Chapter opens Ma séance');
      assert.equal(await page.locator('.ep-flow').count(),3,'Exactly three lesson blocks');
      assert.equal(await page.locator('.ep-supports').count(),1,'One supports rail');
      for(const step of ['explain','participate','verify'])assert.equal(await page.locator('.ep-flow[data-ep-step="'+step+'"]').count(),1);
      assert.equal(new URL(page.url()).hash,'#cours');
      const first=await page.locator('.ep-flow').first().boundingBox(),last=await page.locator('.ep-flow').last().boundingBox(),rail=await page.locator('.ep-supports').boundingBox();
      if(width===1280)assert(rail.x>=first.x+first.width-1,'Supports next to lesson on desktop');
      else assert(rail.y>=last.y+last.height-1,'Supports below lesson on phone');
      await checkLayout(page,width,name+'/'+index);
      for(const step of ['explain','participate','verify']){await openFlow(page,step);await checkLayout(page,width,name+'/'+index+'/'+step);}
      if(index===0){
        await page.screenshot({path:path.join(out,name+'-lesson-'+width+'.png'),fullPage:true});
        await page.screenshot({path:path.join(out,name+'-lesson-viewport-'+width+'.png')});
        assert.equal(await page.locator('#app img').count(),0,'Source markup is escaped');
        await checkQuizReset(page,course);
        await page.locator('.ep-supports [data-ep-action="lesson-notes"]').click();
        await page.locator('[data-ep-note-text]').fill('Bilan fictif de séance');
        assert.equal(await page.evaluate(()=>instance.hasUnsavedDraft()),true);
        await page.locator('[data-ep-action="lesson-close-resource"]').click();
        await page.locator('.ep-supports [data-ep-action="lesson-notes"]').click();
        assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Bilan fictif de séance','Closing resource preserves note draft');
        await page.locator('[data-ep-action="save-notes"]').click();
        await page.waitForFunction(()=>window.saved.length===1&&!instance.hasUnsavedDraft());
        await page.locator('[data-ep-action="lesson-close-resource"]').click();
      }
      await assertStudentPrintSafe(page,course);
      await page.locator('[data-ep-action="lesson-student"]').click();
      assert.equal(await page.locator('.ep-lesson-resource').count(),1);
      await checkLayout(page,width,name+'/'+index+'/student');
      await page.locator('[data-ep-action="lesson-close-resource"]').click();
      const model=lessonModel.build(data,course);
      if(name==='private')assert(model.isKnownSource,'The supplied source is reviewed, not in generic fallback');
      for(let sessionIndex=0;sessionIndex<course.sessions.length;sessionIndex++) {
        const session=model.sessions[sessionIndex];
        await page.locator('[data-ep-action="session"][data-ep-session="'+sessionIndex+'"]').click();
        assert.equal(await page.locator('[data-ep-action="session"][data-ep-session="'+sessionIndex+'"]').getAttribute('aria-pressed'),'true');
        if(model.isKnownSource) {
          assert.equal(await page.locator('.ep-flow[data-ep-step="explain"] .ep-lesson-unit').count(),session.explainUnits.length,'Expected course units in selected session');
          assert.equal(await page.locator('.ep-flow[data-ep-step="verify"] .ep-quiz-item').count(),session.quizQuestions.length,'Expected quiz questions in selected session');
          const printedText=await page.evaluate(()=>new DOMParser().parseFromString(instance.getPrintableDocument('session').html,'text/html').body.textContent.replace(/\s+/g,' ').trim());
          for(const unit of session.explainUnits)for(const block of unit.blocks){
            const values=block.type==='table'?(block.rows||[]).flat():[block.text];
            for(const value of values.filter(Boolean))assert(printedText.includes(String(value).replace(/\s+/g,' ').trim()),'Teacher print preserves complete assigned source blocks');
          }
          const studentText=await page.evaluate(()=>new DOMParser().parseFromString(instance.getPrintableDocument('student-sheet').html,'text/html').body.textContent);
          for(const unit of session.explainUnits)assert(studentText.includes(unit.title),'Pupil sheet includes assigned headings for taking notes');
        }
        await assertStudentPrintSafe(page,course);
        await checkLayout(page,width,name+'/'+index+'/session-'+sessionIndex);
      }
      await page.locator('[data-ep-action="home"]').click();
    }
    assert.deepEqual(errors,[]);
    console.log('PASS EPPCS lesson view '+name+' '+width+'px: '+data.courses.length+' chapters / '+data.courses.reduce((n,c)=>n+c.sessions.length,0)+' sessions, complete source print, three blocks, responsive supports, session reset, safe student sheets, note drafts');
    await context.close();
  }
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    await checkLibrary(browser,origin,synthetic,'synthetic');
    if(process.env.EPPCS_PRIVATE_PACKAGE) {
      const file=path.resolve(process.env.EPPCS_PRIVATE_PACKAGE);
      assert(!file.startsWith(root+path.sep),'Private package must stay outside public repository');
      const data=JSON.parse(fs.readFileSync(file,'utf8')).library;
      assert.equal(data.courses.length,15);
      assert.equal(data.courses.reduce((n,c)=>n+c.sessions.length,0),31);
      assert.equal(data.courses.reduce((n,c)=>n+c.quizzes.length,0),100);
      await checkLibrary(browser,origin,data,'private');
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
