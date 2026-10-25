/* Synthetic content only: never check private teaching documents into the site. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const paragraph = text => ({type:'paragraph', text});
const data = {
  level:'Première EPPCS',
  sources:[{filename:'Cours synthétique.docx'}],
  courses:[1,2].map(n => ({
    id:'chapter-'+n,number:n,theme:'Thème de démonstration', title:'Chapitre synthétique '+n,
    question:'Une question issue du document, sans contenu élève.',
    sections:[
      {id:'course',kind:'course',title:'Partie spécifique à imprimer',blocks:[paragraph('Texte synthétique <img src=x onerror=alert(1)>'), {type:'paragraph',text:'Lien',runs:[{text:'Interdit',href:'javascript:alert(1)'},{text:'Autorisé',href:'https://example.test/reference'}]}]},
      {id:'objectives',kind:'objectives',title:'Objectifs',blocks:[paragraph('Objectif synthétique')]},
      {id:'quiz',kind:'quiz',title:'Quiz élève',blocks:[paragraph('QUESTION_VIERGE'),paragraph('a) Première proposition'),paragraph('b) Seconde proposition'),paragraph('FAUX_CORRIGE_MELANGE_DANS_QUIZ')]},
      {id:'quiz-correction',kind:'quiz-correction',title:'Corrigé',blocks:[paragraph('REPONSE_PROFESSEUR_PRIVEE')]},
      {id:'custom',kind:'custom-teacher-appendix',title:'Annexe professeur personnalisée',blocks:[paragraph('ANNEXE_PROF_INTEGRALE')]},
      {id:'references',kind:'references',title:'Références',blocks:[paragraph('Un document de référence cité')]}
    ],
    sessions:[{number:1,title:'Séance réelle',description:'Description explicitement issue du document.',durationMinutes:60,source:{file:'Cours synthétique.docx',paragraph:10}}],
    quizzes:[{number:1,prompt:'Quelle proposition ?',choices:[{key:'a',text:'Première'},{key:'b',text:'Seconde'}],answerKey:'b',correction:'REPONSE_PROFESSEUR_PRIVEE'}]
  })),
  controls:[{id:'control-1',title:'Contrôle synthétique',courseNumbers:[1],subject:[paragraph('SUJET_ELEVE')],correction:[paragraph('CORRIGE_PROF')]}]
};
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://localhost');
  if(url.pathname==='/test') { res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:12px}#app{max-width:1280px;margin:auto}</style><link rel="stylesheet" href="/styles/eppcs.css"><div id="app"></div><script src="/eppcs-ui.js"></script>'); }
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(error,bytes)=>{res.writeHead(error?404:200,{'Content-Type':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});res.end(error?'':bytes);});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const width of [320,390,1280]) {
      const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block'});
      await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      const page=await context.newPage();
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin+'/test#cours');
      await page.evaluate(data=>{
        window.writes=[];window.failSave=false;window.printed=[];window.storedBase={revision:1};
        window.instance=EPPCSView.mount(document.querySelector('#app'),{
          data,loadNotes:async()=>({'chapter-1':{text:'Note existante',status:'preparer',savedAt:'2026-01-01T12:00:00Z',base:structuredClone(window.storedBase)}}),
          saveNote:async(id,note)=>{
            if(window.failSave)throw new Error('Offline storage rejected');
            if(JSON.stringify(note.base)!==JSON.stringify(window.storedBase))throw new Error('Stale note base');
            window.writes.push({id,note});window.storedBase={revision:window.storedBase.revision+1};
            return {...note,base:structuredClone(window.storedBase),message:'Enregistré localement · en attente de synchronisation'};
          },
          onPrint:result=>window.printed.push(result)
        });
      },data);
      await page.locator('[data-ep-course="chapter-1"]').click();
      assert.equal(await page.locator('#app img').count(),0);
      assert.equal(await page.locator('#app a[href^="javascript:"]').count(),0);
      assert.equal(new URL(page.url()).hash,'#cours');
      assert.equal(await page.locator('.ep-flow').count(),3);
      await page.locator('[data-ep-action="mode-library"]').click();
      await page.locator('[data-ep-action="print-course"]').click();
      const printCourse=await page.evaluate(()=>printed.at(-1).html);
      assert.match(printCourse,/Chapitre synthétique 1/);assert.match(printCourse,/Partie spécifique à imprimer/);
      await page.locator('[data-ep-section]').selectOption('custom');
      assert.match(await page.locator('.ep-reader').innerText(),/ANNEXE_PROF_INTEGRALE/);
      await page.locator('[data-ep-action="print-course"]').click();
      assert.match(await page.evaluate(()=>printed.at(-1).html),/ANNEXE_PROF_INTEGRALE/);
      await page.locator('[data-ep-tab="quiz"]').click();
      await page.locator('input[value="a"]').check();
      await page.locator('[data-ep-action="reveal"]').click();
      assert.match(await page.locator('[data-ep-feedback="1"]').innerText(),/À revoir/);
      await page.locator('input[value="b"]').check();
      assert.match(await page.locator('[data-ep-feedback="1"]').innerText(),/conforme/);
      assert.equal(await page.locator('input[value="b"]').evaluate(el=>el===document.activeElement),true);
      await page.locator('[data-ep-action="print-quiz-student"]').click();
      const student=await page.evaluate(()=>printed.at(-1).html);
      assert.match(student,/Quelle proposition/);assert.match(student,/Import non reconnu/);assert.doesNotMatch(student,/QUESTION_VIERGE|FAUX_CORRIGE_MELANGE_DANS_QUIZ|REPONSE_PROFESSEUR_PRIVEE|checked|Réponse conforme/);
      await page.locator('[data-ep-action="print-quiz-teacher"]').click();
      assert.match(await page.evaluate(()=>printed.at(-1).html),/REPONSE_PROFESSEUR_PRIVEE/);
      await page.locator('[data-ep-tab="notes"]').click();
      assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Note existante');
      await page.locator('[data-ep-note-text]').fill('Mon brouillon à conserver');
      assert.equal(await page.evaluate(()=>instance.hasUnsavedDraft()),true);
      await page.evaluate(()=>window.failSave=true);
      await page.locator('[data-ep-action="save-notes"]').click();
      await page.waitForFunction(()=>document.querySelector('[data-ep-note-feedback]').textContent.includes('Impossible'));
      assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Mon brouillon à conserver');
      await page.locator('[data-ep-tab="sessions"]').click();
      await page.locator('[data-ep-action="session"]').click();
      assert.match(await page.locator('.ep-session-summary').innerText(),/Description explicitement issue du document/);
      assert.match(await page.locator('.ep-panel').innerText(),/répartition par séance n’est pas disponible/);
      await page.locator('.ep-supports [data-ep-action="lesson-notes"]').click();
      assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Mon brouillon à conserver');
      await page.evaluate(()=>window.failSave=false);
      await page.locator('[data-ep-action="save-notes"]').click();
      await page.waitForFunction(()=>window.writes.length===1);
      assert.equal(await page.evaluate(()=>instance.hasUnsavedDraft()),false);
      assert.equal(await page.evaluate(()=>writes[0].id),'chapter-1');
      assert.match(await page.locator('[data-ep-note-feedback]').innerText(),/attente de synchronisation/);
      assert.equal(await page.evaluate(()=>writes[0].note.base.revision),1);
      await page.locator('[data-ep-note-text]').fill('Ma deuxième version du chapitre');
      await page.locator('[data-ep-note-status]').selectOption('enseigne');
      await page.locator('[data-ep-action="save-notes"]').click();
      await page.waitForFunction(()=>window.writes.length===2);
      assert.equal(await page.evaluate(()=>writes[1].note.base.revision),2);
      assert.equal(await page.evaluate(()=>writes[1].note.status),'enseigne');
      assert.equal(await page.evaluate(()=>instance.hasUnsavedDraft()),false);
      assert.equal(await page.evaluate(()=>instance.refreshNotes({'chapter-1':{text:'Version distante sans brouillon',status:'enseigne',savedAt:'2026-01-02T12:00:00Z',base:{revision:4}}})),false);
      assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Version distante sans brouillon');
      await page.locator('[data-ep-note-text]').fill('Brouillon à ne pas écraser');
      assert.equal(await page.evaluate(()=>instance.refreshNotes({'chapter-1':{text:'Nouvelle version distante',status:'enseigne',savedAt:'2026-01-03T12:00:00Z',base:{revision:5}}})),true);
      assert.equal(await page.locator('[data-ep-note-text]').inputValue(),'Brouillon à ne pas écraser');
      await page.locator('[data-ep-action="mode-library"]').click();
      for(const tab of ['course','sessions','quiz','controls','sources','notes']) {
        await page.locator('[data-ep-tab="'+tab+'"]').click();
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow '+width+'/'+tab);
        const small=await page.locator('#app button').evaluateAll(buttons=>buttons.filter(b=>b.getBoundingClientRect().height>0&&b.getBoundingClientRect().height<44).map(b=>b.textContent));
        assert.deepEqual(small,[],'44px button targets '+width+'/'+tab);
      }
      await page.locator('[data-ep-tab="controls"]').click();
      await page.locator('[data-ep-control="control-1"]').click();
      await page.locator('[data-ep-action="control-correction"]').click();
      await page.locator('[data-ep-action="print-control-student"]').click();
      const subject=await page.evaluate(()=>printed.at(-1).html);assert.match(subject,/SUJET_ELEVE/);assert.doesNotMatch(subject,/CORRIGE_PROF/);
      await page.locator('[data-ep-action="home"]').click();
      await page.locator('[data-ep-course="chapter-2"]').click();
      await page.locator('[data-ep-action="mode-library"]').click();
      await page.locator('[data-ep-tab="controls"]').click();
      assert.equal(await page.locator('[data-ep-control]').count(),0);
      assert.match(await page.locator('.ep-panel').innerText(),/Aucun contrôle/);
      assert.deepEqual(errors,[]);
      await page.evaluate(()=>instance.destroy());assert.equal(await page.locator('#app').innerText(),'');
      await context.close();console.log('PASS EPPCS UI '+width+'px: routes, sources, print privacy, quiz feedback, note recovery and touch targets');
    }
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
