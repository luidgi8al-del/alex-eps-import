const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function source(name) { return fs.readFileSync(path.join(root, 'pwa/sync', name), 'utf8'); }
const moduleContext = { result: null };
vm.runInNewContext(source('auto-sync.js').replace('export function', 'function') + '\nresult = createAutoSync;', moduleContext);
const create = moduleContext.result;
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function harness(run) {
  let time = 100000, online = true, seq = 0;
  const timers = new Map();
  const sync = create({run, online: () => online, now: () => time,
    schedule: (fn, delay) => { timers.set(++seq, {fn, at: time + delay}); return seq; },
    cancel: id => timers.delete(id)});
  return {sync, offline: () => online = false, online: () => online = true,
    async advance(ms) { time += ms; for (const [id,t] of [...timers]) if (t.at <= time) {timers.delete(id); t.fn();} await flush(); }};
}
(async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return {state:'synced'}; });
  for(let i=0;i<100;i++) h.sync.changed();
  await h.advance(1499); assert.equal(calls,0);
  await h.advance(1); assert.equal(calls,1, '100 edits form one run');
  await h.sync.request(); assert.equal(calls,1,'idle reads cannot loop');

  let resolve, concurrentCalls = 0;
  const c = harness(() => { concurrentCalls++; return concurrentCalls === 1 ? new Promise(r=>resolve=r) : Promise.resolve({state:'synced'}); });
  const first = c.sync.request(); await flush();
  c.sync.changed(); await c.advance(1500);
  assert.equal(concurrentCalls,1,'no overlapping requests');
  resolve({state:'synced'}); await first; await c.advance(1500);
  assert.equal(concurrentCalls,2,'edit during run causes follow-up');

  let attempts=0;
  const r=harness(async()=>{attempts++;return {state:attempts<3?'error':'synced',pending:attempts<3?1:0};});
  r.sync.changed(); await r.advance(1500);
  for(let i=0;i<20;i++) await r.sync.request();
  assert.equal(attempts,1);
  await r.advance(15000); assert.equal(attempts,2);
  await r.advance(29999); assert.equal(attempts,2);
  await r.advance(1); assert.equal(attempts,3);

  let sent=0; const o=harness(async()=>{sent++;return {state:'synced'};});
  o.offline(); o.sync.changed(); await o.advance(1500); assert.equal(sent,0);
  o.online(); await o.sync.request({force:true}); assert.equal(sent,1);

  // Two isolated clients share a fake server. This tests scheduling, not production RLS.
  const server = {}; const queues = {a:[], b:[]}; const copies = {a:{}, b:{}};
  const client=id=>harness(async()=>{for(const [key,value] of queues[id].splice(0)) server[key]=value; copies[id]={...server}; return {state:'synced'};});
  const a=client('a'),b=client('b');
  queues.a.push(['test-a',12]); a.sync.changed(); await a.advance(1500);
  await b.sync.request(); assert.equal(copies.b['test-a'],12);
  queues.b.push(['test-b',16]); b.sync.changed(); await b.advance(1500);
  await a.advance(60000); await a.sync.request(); assert.equal(copies.a['test-b'],16);
  console.log('auto-sync: batching, concurrent edit, backoff, reconnection, two simulated clients OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
