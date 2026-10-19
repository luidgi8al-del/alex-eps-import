const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

// Synthetic tabs only: these tests never start a browser or connect to PRONOTE.
const EPS = 'https://luidgi8al-del.github.io/alex-eps-import/#classes';
const PN = 'https://3500010j.index-education.net/pronote/professeur.html?fd=1';
const sourceCode = fs.readFileSync(path.join(__dirname, '../extensions/pronote-lvh/background.js'), 'utf8');
const payload = {format: 'eps-pronote-v1', className: '2nde4', title: 'Devoir fictif', date: '2026-10-19', scale: 20, rows: [{lastName: 'TEST', firstName: 'Lina', value: '15'}]};
const clone = value => value === undefined ? undefined : structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve}; };

function fixture(options = {}) {
  let listener, removed, sequence = 0;
  const effects = [];
  const tabs = new Map((options.tabs || [
    {id: 7, windowId: 1, splitViewId: 22, url: EPS},
    {id: 8, windowId: 1, splitViewId: 22, url: PN},
    {id: 9, windowId: 2, splitViewId: 33, url: 'https://example.test/untouched'},
  ]).map(tab => [tab.id, clone(tab)]));
  const view = {id: 'transfer-1', createdAt: Date.now(), sourceTabId: 7, tabId: 8};
  const store = options.noJob ? {} : {epsPronotePending: {...view, payload: clone(payload)}, epsPronoteView: {...view}};
  const chrome = {
    runtime: {getURL: p => 'chrome-extension://test/' + p, onMessage: {addListener: fn => {listener = fn;}}},
    storage: {session: {
      get: async keys => {
        if (options.beforeGetStorage) await options.beforeGetStorage(keys);
        const selected = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(selected.map(key => [key, clone(store[key])]));
      },
      set: async values => {Object.assign(store, clone(values));},
      remove: async keys => {for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];},
    }},
    tabs: {
      get: async id => {
        if (options.beforeGetTab) await options.beforeGetTab(id, tabs);
        if (!tabs.has(id)) throw Error('Missing tab');
        return clone(tabs.get(id));
      },
      query: async query => {
        if (options.beforeQuery) await options.beforeQuery(query, tabs);
        return [...tabs.values()].filter(tab =>
          (query.windowId === undefined || tab.windowId === query.windowId) &&
          (query.splitViewId === undefined || tab.splitViewId === query.splitViewId) &&
          (!query.url || tab.url.startsWith('https://3500010j.index-education.net/pronote/'))
        ).map(clone);
      },
      update: async (id, changes) => {effects.push(['tab.update', id, clone(changes)]); Object.assign(tabs.get(id), changes); return clone(tabs.get(id));},
      create: async () => {throw Error('Unexpected tab creation');},
      sendMessage: async (id, message) => {effects.push(['message', id, clone(message)]); if (options.beforeSendMessage) await options.beforeSendMessage(id, message);},
      onRemoved: {addListener: fn => {removed = fn;}},
      // Any attempted close, reload, move or navigation fails the test.
      remove: async () => {throw Error('Must never close a tab');},
      reload: async () => {throw Error('Must never reload a tab');},
      move: async () => {throw Error('Must never move a tab');},
    },
    windows: {update: async (id, changes) => {effects.push(['window.update', id, clone(changes)]);}},
  };
  if (!options.oldChrome) chrome.tabs.unsplit = async id => {
    effects.push(['unsplit', id]);
    if (options.unsplitError) throw Error('Chrome refused');
    if (options.beforeUnsplit) await options.beforeUnsplit(id, tabs);
    if (!options.unsplitNoOp) for (const tab of tabs.values()) if (tab.splitViewId === id) tab.splitViewId = -1;
  };
  vm.runInNewContext(sourceCode, {chrome, URL, Date, crypto: {randomUUID: () => 'new-' + (++sequence)}});
  const eps = {frameId: 0, url: EPS, tab: {id: 7, windowId: 1, url: EPS}};
  const pn = {frameId: 0, url: PN, tab: {id: 8, windowId: 1, url: PN}};
  const popup = {url: 'chrome-extension://test/popup.html'};
  const send = (message, sender = eps) => new Promise(resolve => listener(message, sender, resolve));
  return {send, eps, pn, popup, tabs, store, effects, removed};
}

function assertNoFocusOrSplit(f) {
  assert.equal(f.effects.filter(effect => ['unsplit', 'tab.update', 'window.update'].includes(effect[0])).length, 0);
}
function assertSafeTabUpdates(f) {
  for (const effect of f.effects.filter(effect => effect[0] === 'tab.update')) assert.deepEqual(effect.slice(1), [7, {active: true}]);
  for (const effect of f.effects.filter(effect => effect[0] === 'window.update')) assert.deepEqual(effect.slice(1), [1, {focused: true}]);
}

test('EPS return stops transfer, separates exact pair and focuses EPS without closing or navigating any tab', async () => {
  const f = fixture();
  const untouched = clone(f.tabs.get(9));
  const result = await f.send({type: 'EPS_PRONOTE_RETURN'});
  assert.equal(result.ok, true);
  assert.equal(result.fullWidth, true);
  assert.equal(result.warning, '');
  assert.equal(f.store.epsPronotePending, undefined);
  assert.equal(f.store.epsPronoteView, undefined);
  assert.deepEqual(f.effects[0], ['message', 8, {type: 'EPS_PRONOTE_STOP', id: 'transfer-1'}]);
  assert.deepEqual(f.effects.filter(effect => effect[0] === 'unsplit'), [['unsplit', 22]]);
  assertSafeTabUpdates(f);
  assert.equal(f.tabs.size, 3);
  assert.equal(f.tabs.get(8).url, PN);
  assert.deepEqual(f.tabs.get(9), untouched);
});

test('PRONOTE close and popup cancel can explicitly request return to EPS', async () => {
  for (const who of ['pn', 'popup']) {
    const f = fixture();
    const result = await f.send({type: 'EPS_PRONOTE_CLEAR_PENDING', id: 'transfer-1', returnToEps: true}, f[who]);
    assert.equal(result.ok, true, who);
    assert.equal(result.fullWidth, true, who);
    assert.equal(f.store.epsPronotePending, undefined);
    assertSafeTabUpdates(f);
  }
});

test('logout clears payload without stealing focus, and saved view allows subsequent return', async () => {
  const f = fixture();
  const result = await f.send({type: 'EPS_PRONOTE_CLEAR_PENDING', id: 'transfer-1'}, f.pn);
  assert.equal(result.ok, true);
  assert.equal(f.store.epsPronotePending, undefined);
  assert.deepEqual(Object.keys(f.store.epsPronoteView).sort(), ['createdAt', 'id', 'sourceTabId', 'tabId']);
  assertNoFocusOrSplit(f);
  const returned = await f.send({type: 'EPS_PRONOTE_RETURN'});
  assert.equal(returned.fullWidth, true);
});

test('expired pending payload does not prevent safely recognizing the same EPS/PRONOTE pair', async () => {
  const f = fixture();
  f.store.epsPronotePending.createdAt = 0;
  f.store.epsPronoteView.createdAt = 0;
  assert.equal((await f.send({type: 'EPS_PRONOTE_GET_PENDING'}, f.pn)).ok, false);
  assert.equal(f.store.epsPronotePending, undefined);
  assertNoFocusOrSplit(f);
  assert.equal((await f.send({type: 'EPS_PRONOTE_RETURN'})).fullWidth, true);
});

test('extension reload can return from an exact EPS/PRONOTE split without stored student data', async () => {
  const f = fixture({noJob: true});
  const result = await f.send({type: 'EPS_PRONOTE_RETURN'});
  assert.equal(result.ok, true);
  assert.equal(result.fullWidth, true);
  assert.deepEqual(f.effects.filter(effect => effect[0] === 'unsplit'), [['unsplit', 22]]);
  assert.equal(f.effects.some(effect => effect[0] === 'message' && effect[2].type === 'EPS_PRONOTE_STOP'), false);
  assertSafeTabUpdates(f);
});

test('idle EPS without a matching transfer or split leaves unrelated browser windows alone', async () => {
  for (const splitViewId of [-1, 22]) {
    const f = fixture({noJob: true, tabs: [
      {id: 7, windowId: 1, splitViewId, url: EPS},
      {id: 8, windowId: 1, splitViewId: 22, url: 'https://example.test/unrelated'},
      {id: 9, windowId: 2, splitViewId: 33, url: PN},
    ]});
    const result = await f.send({type: 'EPS_PRONOTE_RETURN'});
    assert.equal(result.ok, true);
    assert.equal(result.fullWidth, splitViewId === -1);
    assert.equal(result.unchanged, true);
    assertNoFocusOrSplit(f);
  }
});

test('unrelated, multi-tab or changed-target splits are never separated', async () => {
  const scenarios = [
    tabs => {tabs.get(8).url = 'https://example.test/other';},
    tabs => {tabs.get(8).pendingUrl = 'https://example.test/navigating';},
    tabs => {tabs.get(8).splitViewId = 33;},
    tabs => {tabs.get(8).windowId = 2;},
    tabs => {tabs.set(10, {id: 10, windowId: 1, splitViewId: 22, url: 'https://example.test/third'});},
    tabs => {tabs.delete(8);},
  ];
  for (const change of scenarios) {
    const f = fixture(); change(f.tabs);
    const result = await f.send({type: 'EPS_PRONOTE_RETURN'});
    assert.equal(result.ok, true);
    assert.equal(result.fullWidth, false);
    assert.ok(result.warning);
    assert.equal(f.store.epsPronotePending, undefined);
    assert.equal(f.effects.some(effect => effect[0] === 'unsplit'), false);
    assertSafeTabUpdates(f);
  }
});

test('older Chrome, rejected or ineffective unsplit returns warning, not false full-width success', async () => {
  for (const options of [{oldChrome: true}, {unsplitError: true}, {unsplitNoOp: true}]) {
    const f = fixture(options);
    const result = await f.send({type: 'EPS_PRONOTE_RETURN'});
    assert.equal(result.ok, true);
    assert.equal(result.fullWidth, false);
    assert.ok(result.warning);
    assert.equal(f.store.epsPronotePending, undefined);
    assert.ok(f.store.epsPronoteView, 'Keep only view metadata so user can retry');
    assert.ok(f.effects.some(effect => effect[0] === 'message' && effect[1] === 7 && effect[2].type === 'EPS_PRONOTE_RETURN_NOTICE'));
    assertSafeTabUpdates(f);
  }
});

test('missing, navigated or navigating EPS source still stops its transfer without focusing or separating anything', async () => {
  for (const change of [tabs => tabs.delete(7), tabs => {tabs.get(7).url = 'https://example.test/other';}, tabs => {tabs.get(7).pendingUrl = 'https://example.test/other';}]) {
    const f = fixture(); change(f.tabs);
    const result = await f.send({type: 'EPS_PRONOTE_CLEAR_PENDING', id: 'transfer-1', returnToEps: true}, f.pn);
    assert.equal(result.ok, false);
    assert.ok(result.error);
    assert.equal(f.store.epsPronotePending, undefined);
    assertNoFocusOrSplit(f);
  }
});

test('sender origin, top frame, tab binding and transfer id are all enforced before any effects', async () => {
  const cases = [
    f => [{type: 'EPS_PRONOTE_RETURN'}, {...f.eps, frameId: 1}],
    f => [{type: 'EPS_PRONOTE_RETURN'}, {...f.eps, url: 'https://example.test'}],
    f => [{type: 'EPS_PRONOTE_RETURN'}, {...f.eps, tab: {...f.eps.tab, url: 'https://example.test'}}],
    f => [{type: 'EPS_PRONOTE_RETURN'}, f.pn],
    f => [{type: 'EPS_PRONOTE_RETURN'}, {...f.eps, tab: {...f.eps.tab, id: 70}}],
    f => [{type: 'EPS_PRONOTE_CLEAR_PENDING', id: 'wrong', returnToEps: true}, f.pn],
    f => [{type: 'EPS_PRONOTE_CLEAR_PENDING', id: 'transfer-1', returnToEps: true}, {...f.pn, frameId: 1}],
    f => [{type: 'EPS_PRONOTE_CLEAR_PENDING', id: 'transfer-1', returnToEps: true}, {...f.pn, tab: {...f.pn.tab, id: 80}}],
    f => [{type: 'EPS_PRONOTE_CLEAR_PENDING', id: 'transfer-1', returnToEps: true}, {...f.pn, url: 'https://example.test'}],
  ];
  for (const build of cases) {
    const f = fixture();
    const result = await f.send(...build(f));
    assert.equal(result.ok, false);
    assert.ok(f.store.epsPronotePending);
    assert.deepEqual(f.effects, []);
  }
});

test('return while already full width only focuses the bound EPS tab', async () => {
  const f = fixture(); f.tabs.get(7).splitViewId = -1; f.tabs.get(8).splitViewId = -1;
  const result = await f.send({type: 'EPS_PRONOTE_RETURN'});
  assert.equal(result.fullWidth, true);
  assert.equal(f.effects.some(effect => effect[0] === 'unsplit'), false);
  assertSafeTabUpdates(f);
});

test('concurrent return and start cannot replace or accidentally cancel a different transfer', async () => {
  const gate = deferred(), entered = deferred();
  const f = fixture({beforeSendMessage: async (_id, message) => {
    if (message.type === 'EPS_PRONOTE_STOP') {entered.resolve(); await gate.promise;}
  }});
  const first = f.send({type: 'EPS_PRONOTE_RETURN'});
  await entered.promise;
  const second = await f.send({type: 'EPS_PRONOTE_RETURN'});
  const start = await f.send({type: 'EPS_PRONOTE_SPLIT', payload});
  assert.equal(second.ok, false); assert.ok(second.error);
  assert.equal(start.ok, false); assert.ok(start.error);
  gate.resolve();
  assert.equal((await first).fullWidth, true);
  assert.equal(f.effects.filter(effect => effect[0] === 'unsplit').length, 1);
  assert.equal(f.store.epsPronotePending, undefined);
});

test('return refuses to run while a new transfer is still being opened', async () => {
  const gate = deferred(), entered = deferred();
  const f = fixture({noJob: true, beforeGetStorage: async keys => {
    if (keys === 'epsPronotePending') {entered.resolve(); await gate.promise;}
  }});
  const started = f.send({type: 'EPS_PRONOTE_SPLIT', payload});
  await entered.promise;
  const returned = await f.send({type: 'EPS_PRONOTE_RETURN'});
  assert.equal(returned.ok, false);
  assert.ok(returned.error);
  assertNoFocusOrSplit(f);
  gate.resolve();
  assert.equal((await started).ok, true);
  assert.ok(f.store.epsPronotePending);
  assert.equal(f.effects.some(effect => effect[0] === 'unsplit'), false);
});

test('a stopped or unreachable PRONOTE content script does not retain student payload or prevent return', async () => {
  const f = fixture({beforeSendMessage: async (_id, message) => {
    if (message.type === 'EPS_PRONOTE_STOP') throw Error('Content script already gone');
  }});
  const result = await f.send({type: 'EPS_PRONOTE_RETURN'});
  assert.equal(result.ok, true);
  assert.equal(result.fullWidth, true);
  assert.equal(f.store.epsPronotePending, undefined);
  assertSafeTabUpdates(f);
});

test('a tab which navigates while unsplitting is never activated afterwards', async () => {
  const f = fixture({beforeUnsplit: async (_id, tabs) => {tabs.get(7).url = 'https://example.test/new-page';}});
  const result = await f.send({type: 'EPS_PRONOTE_RETURN'});
  assert.equal(result.ok, false);
  assert.equal(f.store.epsPronotePending, undefined);
  assert.equal(f.effects.some(effect => ['tab.update', 'window.update'].includes(effect[0])), false);
});

test('navigation during split discovery cannot separate a pair which is no longer EPS/PRONOTE', async () => {
  for (const tabId of [7, 8]) {
    const f = fixture({beforeQuery: async (query, tabs) => {
      if (query.splitViewId === 22) tabs.get(tabId).url = 'https://example.test/navigated-during-discovery';
    }});
    await f.send({type: 'EPS_PRONOTE_RETURN'});
    assert.equal(f.store.epsPronotePending, undefined);
    assert.equal(f.effects.some(effect => effect[0] === 'unsplit'), false, 'Do not use stale URLs from tabs.get after a more recent query');
    assertSafeTabUpdates(f);
  }
});

test('new transfers retain only tab ids and creation time outside their pending student payload', async () => {
  const f = fixture({noJob: true});
  const started = await f.send({type: 'EPS_PRONOTE_SPLIT', payload});
  assert.equal(started.ok, true);
  assert.equal(started.canReturnToEps, true);
  assert.deepEqual(Object.keys(f.store.epsPronoteView).sort(), ['createdAt', 'id', 'sourceTabId', 'tabId']);
  assert.equal(f.store.epsPronoteView.id, f.store.epsPronotePending.id);
  assert.equal(f.store.epsPronoteView.sourceTabId, 7);
  assert.equal(f.store.epsPronoteView.tabId, 8);
});
