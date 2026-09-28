const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const schema=fs.readFileSync(path.join(root,'schema_sante_7_etablissement.sql'),'utf8');
const bridge=fs.readFileSync(path.join(root,'supabase/functions/eps-dispenses-sheet/index.ts'),'utf8');

assert.match(schema,/add column if not exists institution_id uuid references public\.institutions/);
assert.match(schema,/institution_id = eps_institution\(\)/);
assert.match(schema,/create trigger eps_health_dispense_institution/);
assert.match(schema,/insert into public\.eps_schema_marks \(name\) values \('sante_7'\)/);

assert.match(bridge,/\.eq\("institution_id", institutionId\)/);
assert.match(bridge,/institution_id: institutionId/);
assert.match(bridge,/repertoireComplet\(institutionId\)/);
assert.match(bridge,/tousLesEleves\(institutionId\)/);

console.log('PASS institution-scoped health dispensations and infirmary bridge');
