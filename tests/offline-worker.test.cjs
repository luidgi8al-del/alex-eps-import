const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const handlers={},cacheStores=new Map(),base='https://school.test/alex-eps-import/';
let failPath=null;
function key(request){return new URL(typeof request==='string'?request:request.url||request.href,base).href;}
const caches={
 async open(name){if(!cacheStores.has(name))cacheStores.set(name,new Map());const data=cacheStores.get(name);return{
  async put(request,response){data.set(key(request),response);},
  async match(request){return data.get(key(request));},
  async addAll(assets){for(const asset of assets)data.set(key(asset),new Response('static'));}
 };},
 async keys(){return [...cacheStores.keys()];}, async delete(name){return cacheStores.delete(name);}
};
const self={location:{origin:'https://school.test'},registration:{scope:base},addEventListener:(type,fn)=>handlers[type]=fn,skipWaiting(){},clients:{async claim(){}}};
const context={URL,Response,caches,self,importScripts(){vm.runInContext(fs.readFileSync(path.join(root,'offline-assets.js'),'utf8'),context);},
 fetch:async url=>new Response('public resource',{status:new URL(url,base).pathname===failPath?503:200})};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'service-worker.js'),'utf8'),context);
async function message(type){const replies=[];let completed;handlers.message({data:{type},ports:[{postMessage:v=>replies.push(v)}],waitUntil:p=>completed=p});await completed;return replies;}
(async()=>{
 assert(self.EPS_OFFLINE_ASSETS.length>100);
 for(const asset of self.EPS_OFFLINE_ASSETS){assert(!asset.includes('supabase/'));assert(!asset.includes('tests/'));assert(fs.existsSync(path.join(root,asset.split('?')[0])));}
 assert.equal((await message('CHECK_OFFLINE')).at(-1).ready,false);
 failPath=new URL(self.EPS_OFFLINE_ASSETS[2],base).pathname;
 assert((await message('PREPARE_OFFLINE')).at(-1).error);
 assert.equal((await message('CHECK_OFFLINE')).at(-1).ready,false);
 failPath=null;
 const replies=await message('PREPARE_OFFLINE');assert.equal(replies.at(-1).done,true);
 assert.equal((await message('CHECK_OFFLINE')).at(-1).ready,true);
 await caches.open('unrelated-app-cache');await caches.open('eps-lvh-pwa-old-static');
 let activation;handlers.activate({waitUntil:p=>activation=p});await activation;
 assert(cacheStores.has('unrelated-app-cache'));assert(!cacheStores.has('eps-lvh-pwa-old-static'));
 console.log('offline-worker: complete resource download, failure detection, readiness and isolated cleanup OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
