const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../cours.js'),'utf8');
const fn=source.slice(source.indexOf('function requestPronoteSplitScreen(payload)'),source.indexOf('async function startPronoteSplitScreen()'));
async function scenario(reply) {
 let receive, timer, removed=0;
 const window={screen:{availWidth:1200,availHeight:800},addEventListener:(type,f)=>receive=f,removeEventListener:()=>removed++,postMessage:request=>{
   // Foreign window/origin and stale request IDs cannot complete this transfer.
   receive({source:{},origin:'https://eps.test',data:{...reply,type:'EPS_PRONOTE_SPLIT_RESULT',requestId:request.requestId}});
   receive({source:window,origin:'https://evil.test',data:{...reply,type:'EPS_PRONOTE_SPLIT_RESULT',requestId:request.requestId}});
   receive({source:window,origin:'https://eps.test',data:{...reply,type:'EPS_PRONOTE_SPLIT_RESULT',requestId:'old'}});
   if(reply)receive({source:window,origin:'https://eps.test',data:{...reply,type:'EPS_PRONOTE_SPLIT_RESULT',requestId:request.requestId}});else timer();
 }};
 const ctx={window,location:{origin:'https://eps.test'},setTimeout:f=>(timer=f,1),clearTimeout:()=>{}};
 vm.runInNewContext(fn,ctx);
 try{return await ctx.requestPronoteSplitScreen({format:'eps-pronote-v1'});}finally{assert.equal(removed,1);}
}
(async()=>{assert((await scenario({ok:true,protocol:2})).ok);await assert.rejects(()=>scenario({ok:true}),/0.2.0/);await assert.rejects(()=>scenario({ok:false,error:'Refus'}),/Refus/);await assert.rejects(()=>scenario(null),/extension/);console.log('PASS PRONOTE request: protocol 2, old extension, no extension, failure, source/origin/request correlation');})().catch(e=>{console.error(e);process.exitCode=1});
