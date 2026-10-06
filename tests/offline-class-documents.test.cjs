const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const offline = fs.readFileSync(path.join(root, 'hors-connexion.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'classe-tableau-bord.js'), 'utf8');
const screens = fs.readFileSync(path.join(root, 'classe-ecrans.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261006090000_offline_class_documents.sql'), 'utf8');

test('document schema capability survives an offline restart and remains account-scoped', async () => {
  const start = offline.indexOf('async function schemaVague5Applique()');
  const end = offline.indexOf('async function schemaVague3Applique()');
  const gate = offline.slice(start, end);
  const saved = new Map();
  const ctx = {
    session: { user_id: 'teacher-a' }, SUPABASE_URL: 'https://fake.test', navigator: { onLine: true },
    localStorage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v), removeItem: k => saved.delete(k) },
    apiFetch: async () => ({ ok: true, json: async () => [{ name: 'hors_connexion_5' }] })
  };
  vm.createContext(ctx); vm.runInContext(gate, ctx);
  assert.equal(await ctx.schemaVague5Applique(), true);
  ctx.navigator.onLine = false;
  ctx.apiFetch = () => { throw new Error('network must not be used'); };
  assert.equal(await ctx.schemaVague5Applique(), true);
  ctx.session.user_id = 'teacher-b';
  assert.equal(await ctx.schemaVague5Applique(), false);
});

test('documents and returned states use the shared offline read/write path', () => {
  assert.match(offline, /TABLES_HORS_CONNEXION_VAGUE_5\s*=\s*\["class_documents", "class_document_returns"\]/);
  assert.match(dashboard, /lireTable\("class_documents"/);
  assert.match(dashboard, /lireTable\("class_document_returns"/);
  assert.match(dashboard, /enregistrerLigne\("class_documents"/);
  assert.match(dashboard, /enregistrerLigne\("class_document_returns"/);
  assert.match(dashboard, /supprimerLigne\("class_documents"/);
  assert.match(screens, /modifierDocumentClasse\(doc, \{ title: titre \}\)/);
});

test('migration versions both document tables before enabling the capability', () => {
  for (const table of ['class_documents', 'class_document_returns']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} add column if not exists version`));
    assert.match(migration, new RegExp(`create index if not exists ${table}_maj_idx`));
    assert.match(migration, new RegExp(`create trigger eps_version_guard before insert or update on public\\.${table}`));
  }
  assert.match(migration, /values \('hors_connexion_5'\)/);
});
