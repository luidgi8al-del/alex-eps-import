const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'../extensions/pronote-lvh/pronote-ready.js'),'utf8');
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
(async()=>{
 let tick,stop,click,resolveGet,opens=0,closes=0;
 const messages=[],heading={};
 const root={getElementById:()=>({click:()=>{}}),querySelector:()=>heading};
 const document={addEventListener:(type,fn)=>click=fn,querySelectorAll:()=>[{getAttribute:()=>'Se déconnecter'}],getElementById:()=>({shadowRoot:root})};
 const chrome={runtime:{getManifest:()=>({version:'0.2.1'}),onMessage:{addListener:f=>stop=f},sendMessage:message=>{
  messages.push(message);return message.type==='EPS_PRONOTE_GET_PENDING'?new Promise(r=>resolveGet=r):Promise.resolve({ok:true});
 }}};
 const bridge={open:()=>opens++,close:()=>closes++};
 vm.runInNewContext(code,{location:{origin:'https://3500010j.index-education.net',pathname:'/pronote/professeur.html'},document,chrome,EpsPronoteBridge:bridge,setInterval:f=>tick=f});
 // An old GET response must not recreate the preview after the background stopped it.
 stop({type:'EPS_PRONOTE_STOP',id:'old'},null,()=>{});
 resolveGet({ok:true,id:'old',payload:{}});await flush();assert.equal(opens,0);
 tick();resolveGet({ok:true,id:'next',payload:{}});await flush();assert.equal(opens,1);assert.match(heading.textContent,/0.2.1/);
 tick();const stale=resolveGet;
 // The bridge removes its host first; composedPath still identifies the original click.
 bridge.close();click({composedPath:()=>[{id:'close'},{id:'eps-pronote-bridge'}]});
 assert.equal(messages.at(-1).returnToEps,true);assert.equal(messages.at(-1).id,'next');
 stop({type:'EPS_PRONOTE_STOP',id:'next'},null,()=>{});
 stale({ok:true,id:'next',payload:{}});await flush();assert.equal(opens,1);assert(closes>=1);
 console.log('PASS PRONOTE ready: close returns to EPS, stale pending replies cannot reopen a stopped preview, version visible');
})().catch(e=>{console.error(e);process.exitCode=1;});
