const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const workspace = fs.readFileSync(path.join(root, 'tools-workspace.js'), 'utf8');
const toolCode = workspace.slice(workspace.indexOf('  let globalSearchToolOpening'), workspace.indexOf('  function bind(host)'));
function fixture(extra = {}) {
  const calls = [], panel = { style: { display: 'none' }, innerHTML: '' };
  const context = vm.createContext({
    session: { user_id: 'teacher' }, localStorage: { getItem: () => 'false' },
    tools: [{ id: 'timers' }, { id: 'bac-eps' }, { id: 'tests' }],
    EpsTests: { TESTS: { TROIS_500: { label: '3 × 500 m' } }, CATEGORIES: [{ name: 'Athle', tests: ['TROIS_500'] }] },
    document: { getElementById: () => panel }, toolPanel: panel, FREE_USE: '__libre__',
    loadToolClasses: async () => [], resetGenericTestState: () => calls.push('reset-generic'),
    resetRunningSession: () => calls.push('reset-running'),
    showTab: (name, options) => { calls.push(['tab', name, options]); return true; },
    openTool: async (name, target, options) => { calls.push(['open', name]); target.__epsSearchOpenToken = options.searchRequest; target.style.display = 'block'; target.innerHTML = 'Rendered'; },
    ...extra
  });
  vm.runInContext(toolCode, context);
  return { context, calls, panel, api: context.EpsGlobalSearchTools };
}
test('3x500 search directly selects the established running-series test', async () => {
  const { api, context, calls } = fixture();
  assert.equal(await api.open('eps-test:TROIS_500'), true);
  assert.equal(context.epsOpenTest, 'TROIS_500');
  assert.equal(context.epsOpenCategory, 'Athle');
  assert.equal(context.toolClassId, '__libre__');
  assert.deepEqual(calls.find(row => row[0] === 'open'), ['open', 'tests']);
  assert.equal(calls.find(row => row[0] === 'tab')[2].skipModuleStart, true);
});
test('catalogue entries open directly and unknown entries cannot be invoked', async () => {
  const good = fixture();
  await good.api.open('bac-eps');
  assert.deepEqual(good.calls.find(row => row[0] === 'open'), ['open', 'bac-eps']);
  await assert.rejects(fixture().api.open('constructor'), /plus disponible/);
  await assert.rejects(fixture().api.open('eps-test:constructor'), /plus disponible/);
});
test('an existing tool is left entirely untouched', async () => {
  const { api, panel, calls } = fixture();
  panel.style.display = 'block'; panel.innerHTML = 'Important draft';
  await assert.rejects(api.open('timers'), /Enregistrez votre travail/);
  assert.equal(panel.innerHTML, 'Important draft');
  assert.equal(calls.length, 0);
});
test('search awaits asynchronous rendering, and clears only its own stale panel', async () => {
  let release;
  const { api, context, panel } = fixture({ openTool: (name, target, options) => {
    target.__epsSearchOpenToken = options.searchRequest;
    return new Promise(resolve => { release = () => { target.innerHTML = 'Late account content'; resolve(); }; });
  } });
  let finished = false;
  const pending = api.open('eps-test:TROIS_500').then(value => { finished = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  assert.equal(api.isOpening(), true);
  assert.equal(api.canOpen(), false);
  context.session = { user_id: 'other' };
  release();
  assert.equal(await pending, false);
  assert.equal(panel.innerHTML, '');
  assert.equal(panel.style.display, 'none');
  assert.equal(api.isOpening(), false);
});
test('cancelled loading, blocked navigation and unknown roles do not open a tool', async () => {
  const cancelled = fixture();
  assert.equal(await cancelled.api.open('timers', { isCurrent: () => false }), false);
  assert.equal(cancelled.calls.length, 0);
  const denied = fixture({ showTab: () => false });
  assert.equal(await denied.api.open('timers'), false);
  assert.equal(denied.calls.some(row => row[0] === 'open'), false);
  await assert.rejects(fixture({ localStorage: { getItem: () => null } }).api.open('timers'), /vérifié/);
});

test('a normal tool opening during a search render is refused before any state reset', () => {
  const source = fs.readFileSync(path.join(root, 'outils.js'), 'utf8');
  const open = source.slice(source.indexOf('function openTool('), source.indexOf('\ndocument.querySelectorAll'));
  let alerts = 0, resets = 0;
  const context = vm.createContext({ EpsGlobalSearchTools: { canOpen: () => false },
    EpsToolSave: { reset: () => resets++ }, alert: () => alerts++ });
  vm.runInContext(open, context);
  assert.equal(context.openTool('timers'), false);
  assert.equal(resets, 0);
  assert.equal(alerts, 1);
});

test('a delayed Teams search cannot paint over a newer panel after cancellation or account change', async () => {
  for (const changeAccount of [false, true]) {
    let release;
    const original = { innerHTML: '', __epsSearchOpenToken: {} };
    const replacement = { innerHTML: 'New work', __epsSearchOpenToken: {} };
    const context = vm.createContext({ session: { user_id: 'teacher' }, toolPanel: original,
      SUPABASE_URL: 'https://example.invalid', toolHeader: () => 'Loading', bindToolClose: () => {},
      apiFetch: () => new Promise(resolve => { release = resolve; }) });
    vm.runInContext(fs.readFileSync(path.join(root, 'teams-saved-web.js'), 'utf8'), context);
    const pending = context.renderTeamsTool({ isCurrent: () => true });
    if (changeAccount) context.session = { user_id: 'other' };
    else context.toolPanel = replacement;
    release({ ok: true, json: async () => [{ id: 'private-class', name: 'Old account' }] });
    assert.equal(await pending, false);
    assert.equal(replacement.innerHTML, 'New work');
    assert.equal(original.innerHTML, 'Loading');
  }
});

test('a delayed Swim search cannot draw after its panel token or account changes', async () => {
  const source = fs.readFileSync(path.join(root, 'outils.js'), 'utf8');
  const render = source.slice(source.indexOf('async function renderSwimCertificate('), source.indexOf('\nfunction drawSwimCertificate'));
  for (const changeAccount of [false, true]) {
    let release, draws = 0, rosterReads = 0;
    const panel = { __epsSearchOpenToken: {} };
    const context = vm.createContext({ session: { user_id: 'teacher' }, toolPanel: panel, toolClassId: 'class-a',
      loadToolClasses: () => new Promise(resolve => { release = resolve; }),
      loadToolStudents: async () => { rosterReads++; }, drawSwimCertificate: () => { draws++; } });
    vm.runInContext(render, context);
    const pending = context.renderSwimCertificate();
    if (changeAccount) context.session = { user_id: 'other' };
    else panel.__epsSearchOpenToken = {};
    release([]);
    assert.equal(await pending, false);
    assert.equal(draws, 0);
    assert.equal(rosterReads, 0);
  }
});
