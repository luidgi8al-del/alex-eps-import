const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),raw=fs.readFileSync(path.join(root,'section-guides.json'),'utf8'),topics=JSON.parse(raw);
const names=['home','classes','class-detail','cours','planning','programmation','equipement','unss','outils','health','students','emails','settings','help','manager'];
assert.deepEqual(Object.keys(topics).sort(),names.sort());
for(const topic of Object.values(topics)){assert(topic.title);assert.equal(topic.steps.length,3);assert(topic.steps.every(s=>s.length===2&&s.every(t=>typeof t==='string'&&t.trim())))}
assert.equal(raw,fs.readFileSync(path.join(root,'../installation-manager-current/app/src/main/assets/section-guides.json'),'utf8'),'same explanations web/Android');
const js=fs.readFileSync(path.join(root,'section-guides.js'),'utf8');
assert(!/enregistrerLigne|\.click\(|dispatchEvent|method\s*:|\.submit\(/.test(js),'guide must not execute business actions');
assert(js.includes('ctx.owner,ctx.topic'));assert(js.includes("manager.dataset.guideOwner"));
console.log('section guides: 15 valid topics, shared content, no business writes');
