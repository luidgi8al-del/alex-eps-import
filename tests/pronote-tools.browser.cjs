const {chromium}=require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const file=fs.existsSync(path.join(__dirname,'pronote-tools.js'))?'pronote-tools.js':'../pronote-tools.js';
const script=fs.readFileSync(path.join(__dirname,file),'utf8');const sandbox={};vm.runInNewContext(script,sandbox);const build=sandbox.EpsPronoteTools.build;
const student={last_name:'TEST',first_name:'Élève'};const base={classId:'class-1',className:'2nde1',title:'6 × 250 m',date:'2026-09-17',rows:[{student,score:9,scale:12}]};
assert.equal(build(base).rows[0].value,'15');assert.equal(build(base).date,'2026-09-17');assert.equal(build({...base,rows:[{student,score:0}]}).rows[0].value,'0');
for(const classId of [null,'','free','__libre__'])assert.throws(()=>build({...base,classId}),/classe/);
for(const extra of [{score:null},{score:10,complete:false},{score:21},{score:-1},{score:Infinity},{score:3,scale:0}]){
 const data=build({...base,rows:[base.rows[0],{student,...extra}]});assert.equal(data.rows[1].value,'');
}
assert.throws(()=>build({...base,rows:[{student,score:null}]}),/Aucune note/);
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div><button id="export">Exporter</button></div>'}));await page.goto('https://example.test');await page.addScriptTag({content:script});
 await page.evaluate(b=>{window.current=b;window.copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async s=>{window.copied=s;}}});EpsPronoteTools.attach(document.querySelector('#export'),()=>current);EpsPronoteTools.attach(document.querySelector('#export'),()=>current);},base);
 assert.equal(await page.locator('[data-pronote-tool]').count(),1);await page.evaluate(()=>current.rows[0].score=6);await page.getByRole('button',{name:'PRONOTE',exact:true}).click();assert.match(await page.locator('dialog').innerText(),/6.00 \/ 12 → sur 20/);
 await page.locator('[data-title]').fill('6 × 250 m · séance');await page.locator('[data-copy]').click();const payload=JSON.parse(await page.evaluate(()=>copied));assert.equal(payload.rows[0].value,'10');assert.equal(payload.title,'6 × 250 m · séance');assert.equal(payload.rows[0].check,undefined);
 await page.locator('[data-close]').click();await page.locator('dialog').waitFor({state:'detached'});console.log('PASS tool PRONOTE: conversion, zero, incomplete/range, free mode, date, fresh preview, duplicate attachment, clipboard');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
