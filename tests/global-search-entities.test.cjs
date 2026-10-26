const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const classesSource = fs.readFileSync(path.join(root, 'classes.js'), 'utf8');
const entitySource = classesSource.slice(classesSource.indexOf('globalThis.EPSGlobalSearchEntities ='), classesSource.indexOf('/** Le "+"'));

function setup(overrides = {}) {
  const calls = [], elements = new Map();
  const context = vm.createContext({
    session: { user_id: 'teacher-a' },
    localStorage: { getItem: () => 'false' },
    SUBTAB_NAMES: ['newimport', 'classes'],
    document: { getElementById: id => {
      if (!elements.has(id)) elements.set(id, { style: {} });
      return elements.get(id);
    } },
    showTab: (name, options) => calls.push(['tab', name, options]),
    loadImports: async options => { calls.push(['imports', options]); return [{ id: 'class-2', name: 'Seconde 2' }]; },
    lireTable: async (table, query, options) => { calls.push(['read', table, query]); const rows = table === 'classes' ? [{ id: 'class-2', name: 'Seconde 2' }] : [{ id: 'student-2', class_id: 'class-2' }]; return options.ou ? rows.filter(options.ou) : rows; },
    planningClassLabel: row => row.name,
    planningText: value => value,
    toggleClasseAccordeon: value => calls.push(['selector', value]),
    openClassDashboard: async (cls, label, options) => { calls.push(['dashboard', cls.id, options]); return true; },
    dashboardStudents: [{ id: 'student-2', class_id: 'class-2' }],
    ouvrirDetailClasse: () => calls.push(['detail']),
    ouvrirDossierEleve: async (id, options) => { calls.push(['student', id, options]); return true; },
    openEquipmentSearchResult: async (kind, id, options) => { calls.push(['equipment', kind, id, options]); return true; },
    ...overrides
  });
  context.EPSGlobalSearchRead = { table: (...args) => context.lireTable(...args) };
  vm.runInContext(entitySource, context);
  return { context, calls, api: context.EPSGlobalSearchEntities };
}

test('student search opens the exact class then its actual dossier without an auto-first-class opening', async () => {
  const { api, calls, context } = setup();
  assert.equal(await api.open('student', 'student-2'), true);
  assert.equal(context.classeOuverteId, 'class-2');
  assert.equal(calls.find(x => x[0] === 'imports')[1].skipAutoOpen, true);
  assert.equal(calls.find(x => x[0] === 'dashboard')[2].readOnly, true);
  assert.equal(calls.find(x => x[0] === 'tab')[2].skipModuleStart, true);
  assert.equal(calls.find(x => x[0] === 'student')[1], 'student-2');
});

test('deleted or inaccessible students and classes are not replaced by an arbitrary target', async () => {
  const missing = setup({ lireTable: async () => [] });
  await assert.rejects(missing.api.open('student', 'missing'), /plus disponible/);
  assert.equal(missing.calls.length, 0);
  const missingClass = setup();
  await assert.rejects(missingClass.api.open('class', 'other'), /plus accessible/);
  assert.equal(missingClass.calls.some(x => x[0] === 'dashboard'), false);
});

test('equipment and EPI delegate to exact-record readers', async () => {
  const { api, calls } = setup();
  await api.open('equipment', 'equip-4');
  await api.open('epi', 'epi-7');
  assert.deepEqual(calls.filter(x => x[0] === 'equipment').map(x => x.slice(1, 3)), [['equipment', 'equip-4'], ['epi', 'epi-7']]);
});

test('a refused tab change never opens or loads the destination', async () => {
  const { api, calls } = setup({ showTab: () => false });
  assert.equal(await api.open('class', 'class-2'), false);
  assert.equal(await api.open('equipment', 'equip-4'), false);
  assert.equal(calls.length, 0);
});

test('unknown roles, managers and invalid identifiers cannot open search entities', async () => {
  for (const role of [null, 'true']) {
    const { api, calls } = setup({ localStorage: { getItem: () => role } });
    await assert.rejects(api.open('class', 'class-2'), /vérifié/);
    assert.equal(calls.length, 0);
  }
  await assert.rejects(setup().api.open('student', 'a&select=password'), /plus être ouvert/);
});

test('a change of account or cancelled result prevents late class/student opening', async () => {
  let release;
  const { api, calls, context } = setup({ lireTable: () => new Promise(resolve => { release = resolve; }) });
  const pending = api.open('student', 'student-2');
  context.session = { user_id: 'teacher-b' };
  release([{ id: 'student-2', class_id: 'class-2' }]);
  assert.equal(await pending, false);
  assert.equal(calls.some(x => x[0] === 'tab'), false);
  assert.equal(await api.open('class', 'class-2', { isCurrent: () => false }), false);
});

test('equipment reads discard a response that belongs to the previous account', async () => {
  let release;
  const wrap = { innerHTML: '' };
  const context = vm.createContext({
    session: { user_id: 'teacher-a' },
    document: { getElementById: () => wrap },
    lireTable: () => new Promise(resolve => { release = resolve; })
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'equipement.js'), 'utf8'), context);
  const pending = context.loadEquipment({ deferRender: true });
  context.session = { user_id: 'teacher-b' };
  release([{ id: 'private-material', name: 'Private' }]);
  assert.equal(await pending, false);
  assert.equal(vm.runInContext('equipmentList.length', context), 0);
  assert.doesNotMatch(wrap.innerHTML, /Private/);
});

test('late pupil results do not replace caches after a class or account change', async () => {
  let release;
  const source = fs.readFileSync(path.join(root, 'classe-ecrans.js'), 'utf8');
  const helper = source.slice(source.indexOf('async function ecChargerNotes('), source.indexOf('/** Le nombre d\'eleves notes'));
  const context = vm.createContext({
    session: { user_id: 'teacher-a' }, dashboardClass: { row: { id: 'class-2' } },
    dashboardEvaluations: [{ id: 'eval-a' }], dashboardTests: [],
    ecCriteres: [], ecNotes: [], ecResultatsTests: [], ecNotesChargees: false,
    ecLire: () => new Promise(resolve => { release = resolve; })
  });
  vm.runInContext(helper, context);
  const pending = context.ecChargerNotes();
  context.session = { user_id: 'teacher-b' };
  context.dashboardClass = { row: { id: 'class-b' } };
  release([{ id: 'criterion-a' }]);
  assert.equal(await pending, false);
  assert.equal(context.ecCriteres.length, 0);
  assert.equal(context.ecNotesChargees, false);
});

const readSource = classesSource.slice(classesSource.indexOf('globalThis.EPSGlobalSearchRead ='), classesSource.indexOf('/** Navigation de recherche'));
function readFixture(extra = {}) {
  const requests = [];
  const context = vm.createContext({ session: { user_id: 'teacher-a' }, navigator: { onLine: true },
    automaticOfflineState: 'preparing', SUPABASE_URL: 'https://example.invalid',
    lireTable: async () => [],
    apiFetch: async url => { requests.push(url); return { ok: true, json: async () => [{ id: 'target', name: 'Fresh allowed record' }] }; },
    ...extra
  });
  vm.runInContext(readSource, context);
  return { context, requests, read: context.EPSGlobalSearchRead.table };
}
test('an empty first-start cache uses a fresh authorised read without writing to the cache', async () => {
  const { read, requests } = readFixture();
  const rows = await read('students', 'students?id=eq.target&select=*', { requiredId: 'target' });
  assert.equal(rows[0].id, 'target');
  assert.equal(requests.length, 1);
});
test('ready copies, pending local edits and offline copies retain their usual local read', async () => {
  for (const extra of [
    { automaticOfflineState: 'ready' },
    { navigator: { onLine: false } },
    { lireTable: async () => [{ id: 'target', name: 'Unsynchronised local edit' }] }
  ]) {
    const { read, requests } = readFixture(extra);
    const rows = await read('equipment', 'equipment?select=*', { requiredId: 'target' });
    assert.equal(requests.length, 0);
    if (extra.lireTable) assert.equal(rows[0].name, 'Unsynchronised local edit');
  }
});
test('first-start fallback does not revive a local tombstone or reuse a refused server result', async () => {
  const tombstone = readFixture({ modeHorsConnexion: { adapter: { tables: ['students'] }, lire: async () => ({ rows: [{ id: 'target', deleted: true }] }) } });
  assert.equal((await tombstone.read('students', 'students?select=*', { requiredId: 'target' })).length, 0);
  assert.equal(tombstone.requests.length, 0);
  const refused = readFixture({ apiFetch: async () => ({ ok: false }) });
  await assert.rejects(refused.read('students', 'students?select=*', { requiredId: 'target' }), /pas pu être vérifiée/);
  const removed = readFixture({ apiFetch: async () => ({ ok: true, json: async () => [] }) });
  assert.equal((await removed.read('students', 'students?select=*', { requiredId: 'target' })).length, 0);
});

test('a list emptied by local deletions is not replaced by stale server rows during preparation', async () => {
  const tombstone = readFixture({ modeHorsConnexion: { adapter: { tables: ['class_documents'] },
    lire: async () => ({ rows: [{ id: 'target', class_id: 'class-2', deleted: true }] }) } });
  const rows = await tombstone.read('class_documents', 'class_documents?select=*', {
    ou: row => !row.deleted && row.class_id === 'class-2'
  });
  assert.equal(rows.length, 0);
  assert.equal(tombstone.requests.length, 0);
});
