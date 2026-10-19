const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../cours.js'), 'utf8');
const helpers = source.slice(source.indexOf('function requestPronoteSplitScreen(payload)'), source.indexOf('async function startPronoteSplitScreen()'));
const starter = source.slice(source.indexOf('async function startPronoteSplitScreen()'), source.indexOf('function renderPronoteExport()'));
const microtasks = async () => { await Promise.resolve(); await Promise.resolve(); };

function harness(extra = {}) {
  const listeners = new Set(), timers = new Map(), messages = [], alerts = [];
  let nextTimer = 0;
  const window = {
    screen: {availWidth: 1200, availHeight: 800},
    addEventListener: (_, receive) => listeners.add(receive),
    removeEventListener: (_, receive) => listeners.delete(receive),
    postMessage: request => messages.push(request)
  };
  const ctx = vm.createContext({window, location: {origin: 'https://eps.test'},
    setTimeout: (fn, delay) => {timers.set(++nextTimer, {fn, delay}); return nextTimer;},
    clearTimeout: id => timers.delete(id), alert: text => alerts.push(text), ...extra});
  vm.runInContext(helpers, ctx);
  const reply = (request, response = {ok: true}, overrides = {}) => {
    const event = {source: window, origin: 'https://eps.test', data: {type: request.type.replace('_REQUEST', '_RESULT'), requestId: request.requestId, ...response}, ...overrides};
    [...listeners].forEach(fn => fn(event));
  };
  const timeout = delay => {
    const entry = [...timers].find(([,timer]) => timer.delay === delay);
    assert(entry, `missing timer ${delay}`); timers.delete(entry[0]); entry[1].fn();
  };
  return {ctx, messages, alerts, reply, timeout, listeners, timers};
}

async function start(h) {
  const opening = h.ctx.requestPronoteSplitScreen({format: 'eps-pronote-v1'});
  h.reply(h.messages.at(-1), {ok: true, protocol: 2, canReturnToEps: true});
  await opening;
  assert.equal(h.ctx.EpsPronoteTransferState.active, true);
}

(async () => {
  {
    const h = harness();
    const closing = h.ctx.returnFromPronoteTransfer();
    h.timeout(4000); await closing;
    assert.equal(h.alerts.length, 0, 'ordinary closure without extension stays silent');
    assert.equal(h.listeners.size, 0);
  }
  {
    const h = harness(); await start(h);
    const closing = h.ctx.returnFromPronoteTransfer(), request = h.messages.at(-1);
    assert.equal(request.type, 'EPS_PRONOTE_RETURN_REQUEST');
    assert.deepEqual(Object.keys(request).sort(), ['requestId', 'type'], 'return never transports or mutates grades');
    h.reply(request, {ok: true}, {source: {}});
    h.reply(request, {ok: true}, {origin: 'https://other.test'});
    h.reply({...request, requestId: 'stale'}, {ok: true});
    assert.equal(h.ctx.EpsPronoteTransferState.active, true, 'foreign/stale answers ignored');
    h.reply(request, {ok: true, fullWidth: true}); await closing;
    assert.equal(h.ctx.EpsPronoteTransferState.active, false);
    assert.equal(h.alerts.length, 0);
    assert.equal(h.listeners.size, 0);
  }
  {
    const h = harness(); await start(h);
    const first = h.ctx.returnFromPronoteTransfer();
    assert.equal(h.ctx.returnFromPronoteTransfer(), first, 'nested closure shares return promise');
    assert.equal(h.messages.filter(m => m.type === 'EPS_PRONOTE_RETURN_REQUEST').length, 1);
    h.timeout(4000); await first;
    assert.equal(h.alerts.length, 1);
    assert.match(h.alerts[0], /0\.2\.1/);
    assert.equal(h.ctx.EpsPronoteTransferState.active, true, 'failed return remains retryable');
    const retry = h.ctx.returnFromPronoteTransfer();
    h.reply(h.messages.at(-1), {ok: true, fullWidth: false, warning: 'Browser warning shown by extension'});
    await retry;
    assert.equal(h.alerts.length, 1, 'extension warning is not duplicated');
  }
  {
    const h = harness(); await start(h);
    const closing = h.ctx.returnFromPronoteTransfer();
    h.reply(h.messages.at(-1), {ok: false, error: 'Return refused'}); await closing;
    assert.match(h.alerts[0], /Return refused/);
  }
  {
    const h = harness();
    const opening = h.ctx.requestPronoteSplitScreen({});
    const closing = h.ctx.returnFromPronoteTransfer();
    assert.equal(h.messages.length, 1, 'wait for in-flight handoff before returning');
    h.reply(h.messages[0], {ok: true, protocol: 2}); await opening; await microtasks();
    assert.equal(h.messages.length, 2);
    h.reply(h.messages[1], {ok: true, fullWidth: true}); await closing;
    assert.equal(h.ctx.EpsPronoteTransferState.active, false);
  }
  {
    const h = harness();
    const opening = h.ctx.requestPronoteSplitScreen({title: 'First'});
    await assert.rejects(h.ctx.requestPronoteSplitScreen({title: 'Second'}), /déjà en cours/);
    assert.equal(h.ctx.EpsPronoteTransferState.opening, opening, 'duplicate never overwrites original handoff');
    assert.equal(h.messages.length, 1, 'duplicate export does not reach extension');
    const closing = h.ctx.returnFromPronoteTransfer();
    assert.equal(h.messages.length, 1, 'close still waits for original handoff');
    h.reply(h.messages[0], {ok: true, protocol: 2}); await opening; await microtasks();
    assert.equal(h.messages.at(-1).type, 'EPS_PRONOTE_RETURN_REQUEST');
    await assert.rejects(h.ctx.requestPronoteSplitScreen({title: 'During return'}), /déjà en cours/);
    assert.equal(h.messages.length, 2, 'cannot open a new transfer while return is pending');
    h.reply(h.messages.at(-1), {ok: true, fullWidth: true}); await closing;
    assert.equal(h.ctx.EpsPronoteTransferState.opening, null);
    assert.equal(h.ctx.EpsPronoteTransferState.returning, null);
    await start(h);
    assert.equal(h.messages.length, 3, 'new transfer is allowed after return finishes');
  }
  {
    const h = harness();
    const opening = h.ctx.requestPronoteSplitScreen({});
    const rejected = assert.rejects(opening, /Refused/);
    const closing = h.ctx.returnFromPronoteTransfer();
    h.reply(h.messages[0], {ok: false, error: 'Refused'}); await rejected; await microtasks();
    h.timeout(4000); await closing;
    assert.equal(h.alerts.length, 0, 'failed export is not a confirmed active transfer');
  }
  {
    let finishSave;
    const saving = new Promise(resolve => finishSave = resolve);
    const button = {textContent: 'Exporter', disabled: false, isConnected: true};
    const h = harness({document: {getElementById: id => id === 'exportPronoteBtn' ? button : null},
      flushEvaluationScoreSaves: () => saving, pronoteTransferData: () => {throw Error('must not export a closed evaluation');}});
    vm.runInContext(starter, h.ctx);
    const opening = h.ctx.startPronoteSplitScreen();
    const closing = h.ctx.returnFromPronoteTransfer();
    h.reply(h.messages.at(-1), {ok: true}); await closing;
    finishSave(); await opening;
    assert.equal(h.messages.filter(m => m.type === 'EPS_PRONOTE_SPLIT_REQUEST').length, 0, 'close during save prevents later export');
    assert.equal(button.disabled, false);
  }
  {
    const order = [];
    const ctx = {document: {activeElement: {matches: () => true, blur: () => order.push('blur')},
      getElementById: () => ({classList: {remove: () => order.push('hide')}})},
      fermetureEvaluation: () => order.push('callback'), returnFromPronoteTransfer: () => order.push('return')};
    vm.runInNewContext(source.slice(source.indexOf('function fermerFenetreEvaluation()'), source.indexOf('async function openEvaluationPanel(')), ctx);
    ctx.fermerFenetreEvaluation();
    assert.deepEqual(order, ['blur', 'hide', 'return', 'callback'], 'save current input and actually hide before return');
  }
  // Alternate close implementations bypass closeModernTool; keep those explicit hooks.
  const tools = fs.readFileSync(path.join(__dirname, '../outils.js'), 'utf8');
  const classes = fs.readFileSync(path.join(__dirname, '../classe-ecrans.js'), 'utf8');
  const preview = fs.readFileSync(path.join(__dirname, '../pronote-tools.js'), 'utf8');
  assert.match(tools, /back\.onclick = \(\) => \{[^\n]*returnFromPronoteTransfer/);
  assert.match(classes, /fenetre\.remove\(\);\s+globalThis\.returnFromPronoteTransfer/);
  assert.match(preview, /d\.onclose=\(\)=>\{d\.remove\(\);globalThis\.returnFromPronoteTransfer\?\.\(\);\}/, 'dialog close covers Fermer and Escape');
  assert.match(source, /closePronoteExport"\)\.onclick[^\n]*returnFromPronoteTransfer/);
  assert.match(source, /function closeModernTool\(\)[^\n]*returnFromPronoteTransfer/);
  console.log('PASS PRONOTE close lifecycle: scoped hooks, no-extension silence, correlated return, retry, duplicate closure, opening/save races, current input preserved');
})().catch(error => {console.error(error); process.exitCode = 1;});
