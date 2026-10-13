const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=path.join(root,decodeURIComponent(req.url.split('?')[0]));try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({channel:'chrome',headless:true});try{
  for(const mobile of [false,true]) {
    const a=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
    const b=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await a.newPage(),other=await b.newPage();
    await Promise.all([page.goto(`${origin}/offline.html`),other.goto(`${origin}/offline.html`)]);
    const exported=await page.evaluate(async()=>{
      const db=await import('./pwa/storage/database.js');db.utiliserCompte('teacher-a');
      const {saveLocalRecord}=await import('./pwa/storage/records.js');const {enqueueOperation}=await import('./pwa/sync/outbox.js');
      await saveLocalRecord({entity:'evaluation_scores',id:'score-1',version:2,data:{id:'score-1',user_id:'teacher-a',student_id:'pupil-1',criterion_id:'criterion-1',points:9}});
      await enqueueOperation({entity:'evaluation_scores',id:'score-1',authorId:'teacher-a',baseVersion:2,data:{id:'score-1',user_id:'teacher-a',student_id:'pupil-1',criterion_id:'criterion-1',points:9},changedFields:['points']});
      localStorage.setItem('alex_eps_session','SECRET-DO-NOT-EXPORT');
      localStorage.setItem('eps_teacher_preferences:teacher-a',JSON.stringify({teacherName:'Teacher',pin:'SECRET-PIN'}));
      localStorage.setItem('eps_tool_resume:teacher-a',JSON.stringify({owner:'teacher-a',kind:'running-draft',payload:{values:{'pupil-1':['315','','']},groups:[]}}));
      const backup=await import('./pwa/storage/portable-backup.js');return backup.exportLocalBackup('teacher-a',['evaluation_scores']);
    });
    assert(!exported.includes('SECRET-DO-NOT-EXPORT'));assert(!exported.includes('SECRET-PIN'));
    const result=await other.evaluate(async json=>{
      const db=await import('./pwa/storage/database.js');db.utiliserCompte('teacher-a');
      const backup=await import('./pwa/storage/portable-backup.js');
      const attempts=[];
      try{await backup.validateLocalBackup(json,'teacher-b',['evaluation_scores']);attempts.push(false)}catch{attempts.push(true)}
      const corrupted=JSON.parse(json);corrupted.payload.stores.records[0].envelope.points=18;
      try{await backup.restoreLocalBackup(JSON.stringify(corrupted),'teacher-a',['evaluation_scores']);attempts.push(false)}catch{attempts.push(true)}
      const restored=await backup.restoreLocalBackup(json,'teacher-a',['evaluation_scores']);
      const {readLocalRecord}=await import('./pwa/storage/records.js');const {pendingOperations}=await import('./pwa/sync/outbox.js');
      const row=await readLocalRecord('evaluation_scores','score-1');const pending=await pendingOperations();
      try{await backup.restoreLocalBackup(json,'teacher-a',['evaluation_scores']);attempts.push(false)}catch{attempts.push(true)}
      return {attempts,restored,points:row.data.points,pending:pending.length,draft:JSON.parse(localStorage.getItem('eps_tool_resume:teacher-a')).payload.values['pupil-1'][0]};
    },exported);
    assert.deepEqual(result.attempts,[true,true,true]);assert.equal(result.points,9);assert.equal(result.pending,1);assert.equal(result.draft,'315');
    await other.reload();
    assert.equal(await other.evaluate(async()=>{const d=await import('./pwa/storage/database.js');d.utiliserCompte('teacher-a');return (await (await import('./pwa/storage/records.js')).readLocalRecord('evaluation_scores','score-1')).data.points}),9);
    await other.evaluate(async()=>{const d=await import('./pwa/storage/database.js');d.utiliserCompte('teacher-b')});
    assert.equal(await other.evaluate(async()=> (await import('./pwa/storage/records.js')).readLocalRecord('evaluation_scores','score-1')),null);
    await a.close();await b.close();
  }
  console.log('PASS device transfer desktop/mobile: pending score, restart, account isolation, PIN exclusion, corrupt file and pending local changes rejected');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
