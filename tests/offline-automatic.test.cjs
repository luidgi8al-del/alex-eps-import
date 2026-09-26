const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../offline-preparation.js'),'utf8');
const workerPrefix=source.slice(0,source.indexOf('async function offlinePreparationStatus'));
const replies=[];
const activeWorker={postMessage(message,ports){replies.push(message.type);ports[0].postMessage({ready:true,version:'first-install'});}};
const workerContext={navigator:{serviceWorker:{controller:null,ready:Promise.resolve({active:activeWorker})}},MessageChannel,setTimeout,clearTimeout,Error,Promise};
vm.createContext(workerContext);vm.runInContext(workerPrefix,workerContext);
let prepared=0,saved=null,fail=false,cacheReady=true;
const timers=[],events={};
const ctx={session:{user_id:'a'},navigator:{onLine:true,serviceWorker:{controller:{}}},Date,Promise,Number,
 document:{getElementById(){return null;},querySelector(){return null;},addEventListener(){}},
 window:{addEventListener:(name,cb)=>events[name]=cb},
 setTimeout:(cb,delay)=>{timers.push({cb,delay});return timers.length;},clearTimeout(){},
 demarrerModeHorsConnexion:async()=>({}),offlineServiceWorker:async()=>({}),readMeta:async()=>saved,
 offlineWorkerRequest:async()=>({ready:cacheReady,version:'test-v1'}),
 prepareOfflineDevice:async()=>{prepared++;if(fail)throw Error('Interrupted');saved={userId:ctx.session.user_id,version:'test-v1'};}
};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('let automaticOfflineRun')).replace("await import('./pwa/storage/database.js')","({getMeta:readMeta})"),ctx);
const state=()=>vm.runInContext('automaticOfflineState',ctx);
(async()=>{
 const firstInstall=await workerContext.offlineWorkerRequest('CHECK_OFFLINE');
 assert.equal(firstInstall.ready,true);assert.deepEqual(replies,['CHECK_OFFLINE']);
 await Promise.all([ctx.startAutomaticOfflinePreparation(),ctx.startAutomaticOfflinePreparation(),ctx.startAutomaticOfflinePreparation()]);
 assert.equal(prepared,1);assert.equal(state(),'ready');
 await ctx.startAutomaticOfflinePreparation({force:true});assert.equal(prepared,1,'ready cache must not be prepared twice');
 ctx.navigator.onLine=false;await events.offline();assert.equal(state(),'ready');
 saved=null;await ctx.startAutomaticOfflinePreparation({force:true});assert.equal(state(),'error');assert.equal(prepared,1);
 ctx.navigator.onLine=true;fail=true;await events.online();assert.equal(state(),'error');assert.equal(prepared,2);assert.equal(timers.at(-1).delay,30000);
 fail=false;await timers.at(-1).cb();assert.equal(state(),'ready');assert.equal(prepared,3);
 ctx.session={user_id:'b'};await ctx.startAutomaticOfflinePreparation();assert.equal(prepared,4);assert.equal(saved.userId,'b');
 assert(events['eps:pwa-sync-state']);
 console.log('offline-automatic: one preparation, cached reuse, offline restart, reconnect, bounded retry and account isolation OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
