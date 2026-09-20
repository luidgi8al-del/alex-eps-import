const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root,'pwa/sync/engine.js'),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace('export class OfflineSyncEngine','class OfflineSyncEngine');
async function check({outage=false}={}) {
  let rejected=0, acknowledged=0, deferred=0, pulls=0;
  const context={navigator:{onLine:true}, DEFAULT_BATCH_SIZE:40, MAX_TENTATIVES_ENVOI:6, PAGE_LECTURE:500,
    SYNC_STATE:{SYNCING:'syncing',OFFLINE:'offline',ERROR:'error',PENDING:'pending',SYNCED:'synced',CONFLICT:'conflict'},
    publishSyncState:(state,detail)=>({state,...detail}), estPanneReseau:e=>e.name==='TypeError',
    getMeta:async()=>undefined,setMeta:async()=>{},countLocalRecords:async()=>0,generationLocale:()=>0,
    countPendingOperations:async()=>outage?1:0,countConflicts:async()=>0,
    pendingOperations:async()=>outage?[{opId:'saved-result',attempts:99}]:[],
    deferOperation:async()=>deferred++,storeRejection:async()=>rejected++,acknowledgeOperation:async()=>acknowledged++,
    console, result:null};
  vm.runInNewContext(source+'\nresult=OfflineSyncEngine;',context);
  const engine=new context.result({adapter:{pullChanges:async()=>{pulls++;return {records:[],hasMore:false};},
    pushOperation:async()=>{throw new TypeError('Failed to fetch');}}});
  const result=await engine.sync();
  if(outage) {
    assert.equal(result.state,'offline'); assert.equal(deferred,1);
    assert.equal(rejected,0,'a network outage must never reject an edit');
    assert.equal(acknowledged,0,'pending data must remain queued');
  } else {assert.equal(pulls,1,'idle refresh must not pull twice');assert.equal(result.state,'synced');}
}
(async()=>{await check();await check({outage:true});console.log('sync-engine-retry: outage retains edits; idle refresh reads once OK');})()
  .catch(e=>{console.error(e);process.exitCode=1;});
