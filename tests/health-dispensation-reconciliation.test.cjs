const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const bridge = fs.readFileSync(path.join(root, 'supabase/functions/eps-dispenses-sheet/index.ts'), 'utf8');
const sheet = fs.readFileSync(path.join(root, 'supabase/functions/eps-dispenses-sheet/google-apps-script.gs'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261001090000_reconcile_health_dispensations.sql'), 'utf8');

// Le Sheet transmet la naissance : « 2-01 » ne doit plus etre pris pour une identite.
assert.match(sheet, /naissance: dateTexte_\(valeurs\[COL_NAISSANCE - 1\]\)/);
assert.match(bridge, /parNaissance\.length === 1/);
assert.match(bridge, /unss_student_id: ficheLiee \? ficheLiee\.id : null/);

// La passerelle refuse aussi les recouvrements avant l'ecriture.
assert.match(bridge, /\.lte\("start_date", fin\)\.gte\("end_date", debut\)\.or\(identifiants\)/);
assert.match(bridge, /Une dispense existe deja pour cet eleve/);

// La base repare les anciennes lignes, conserve les deux identifiants et pose le garde-fou
// commun au site, a l'application et au Sheet.
assert.match(migration, /add column if not exists student_identity_key text/);
assert.match(migration, /s\.birth_date_epoch_millis = u\.birth_date_epoch_millis/);
assert.match(migration, /set student_id = x\.student_id/);
assert.match(migration, /set unss_student_id = x\.unss_student_id/);
assert.match(migration, /daterange\(d\.start_date, d\.end_date, '\[\]'\)/);
assert.match(migration, /create trigger eps_health_dispense_reconcile/);
assert.match(migration, /values \('sante_8'\)/);

console.log('PASS reconciliation des dispenses professeur et infirmerie');
