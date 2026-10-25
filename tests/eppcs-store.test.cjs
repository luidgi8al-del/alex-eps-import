const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({TextEncoder});
vm.runInContext(fs.readFileSync(path.join(root, 'eppcs-store.js'), 'utf8'), context);
test('EPPCS limite chaque note et ne mélange pas les identifiants de documents', () => {
  const validate = context.EPPCSStore.validatePayload;
  assert.equal(validate('note:course-1', {text: 'Texte'}).text, 'Texte');
  for (const key of ['note:', 'note:../a', 'profile', 'note:<script>']) assert.throws(() => validate(key, {text: ''}));
  for (const note of [{text: 42}, {text: 'ok', access_token: 'secret'}, null, []]) assert.throws(() => validate('note:cours-1', note));
  assert.throws(() => validate('note:cours-1', {text: 'x'.repeat(65536)}));
  assert.equal(validate('note:course-1', {text: 'Bilan', status: 'enseigne', savedAt:'2026-10-25T11:00:00.000Z'}).status, 'enseigne');
  assert.throws(() => validate('note:cours-1', {text:'Bilan', status:'admin'}));
  assert.throws(() => validate('note:cours-1', {text:'Bilan', savedAt:'hier'}));
});
test('EPPCS valide et copie la bibliothèque sans embarquer les documents dans le code public', () => {
  const library = {format: 'fixture', courses: [{title: 'Cours synthétique'}]};
  const result = context.EPPCSStore.validatePayload('library', library);
  library.courses[0].title = 'Modification';
  assert.equal(result.courses[0].title, 'Cours synthétique');
  assert.throws(() => context.EPPCSStore.validatePayload('library', {text:'x'.repeat(4*1024*1024)}));
});
test('EPPCS : RLS privée, responsable exclu, CAS sans création écrasante', () => {
  const sql = fs.readFileSync(path.join(root,'supabase/migrations/20261025010000_eppcs_private.sql'),'utf8');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.eps_eppcs_documents from public, anon, authenticated/);
  assert.match(sql, /user_id = auth\.uid\(\) and public\.eps_account_active\(\)/);
  assert.match(sql, /eps_installation_managers/);
  assert.match(sql, /on conflict\(user_id,document_id\) do nothing/);
  assert.match(sql, /revision=p_expected/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.doesNotMatch(sql, /grant (?:all|insert|update|delete).*eps_eppcs_documents/i);
});
