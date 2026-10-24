const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'equipement.js'), 'utf8'), context);
test('quantités entières positives ou nulles, seuil facultatif, pas de troncature silencieuse', () => {
  for (const value of ['-1', '1.5', 'NaN', 'Infinity', '2147483648', '12 objets']) assert.throws(() => context.equipmentQuantity(value));
  assert.equal(context.equipmentQuantity(''), 0);
  assert.equal(context.equipmentQuantity('', true), null);
  assert.equal(context.equipmentQuantity('0', true), 0);
  assert.equal(context.equipmentQuantity('14'), 14);
});
test('le contenu partagé est échappé pour le texte et les attributs', () => {
  assert.equal(context.equipmentText('<b a="x">&\'</b>'), '&lt;b a=&quot;x&quot;&gt;&amp;&#39;&lt;/b&gt;');
});
test('notifications : identifiant incident texte comme le schéma parent', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261010010000_installation_push.sql'), 'utf8');
  const parent = fs.readFileSync(path.join(root, 'supabase/migrations/20260928090000_installation_incidents_whatsapp.sql'), 'utf8');
  assert.match(parent, /sport_installation_incidents\s*\(\s*id text primary key/);
  assert.match(migration, /incident_id text not null references public\.sport_installation_incidents\(id\)/);
});
