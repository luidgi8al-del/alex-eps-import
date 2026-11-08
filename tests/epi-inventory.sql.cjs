// Optional isolated PostgreSQL runner: npm install --prefix ../tmp/epi-db-qa --ignore-scripts @electric-sql/pglite@0.3.14
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('../../tmp/epi-db-qa/node_modules/@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table public.institutions(id uuid primary key);
 create table public.profiles(id uuid primary key,institution_id uuid);
 create table public.eps_installation_managers(user_id uuid);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.eps_institution() returns uuid language sql stable as $$select institution_id from profiles where id=auth.uid()$$;
 create function public.eps_account_active() returns boolean language sql stable as $$select exists(select 1 from profiles where id=auth.uid())$$;
 grant usage on schema public,auth to anon,authenticated;
 `);
 const schema=fs.readFileSync(path.join(__dirname,'../schema_equipement_programmes.sql'),'utf8');
 // The seed only needs the actual EPI table; auth.users is a referenced prerequisite.
 await db.exec('create table auth.users(id uuid primary key)');
 const table=schema.match(/create table if not exists epi_items \([\s\S]*?\n\);/)[0];await db.exec(table);
 await db.exec('alter table epi_items add column institution_id uuid references institutions(id)');
 const teacher='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002',manager='10000000-0000-0000-0000-000000000003',school='20000000-0000-0000-0000-000000000001',school2='20000000-0000-0000-0000-000000000002';
 await db.exec(`insert into auth.users values('${teacher}'),('${other}'),('${manager}');insert into institutions values('${school}'),('${school2}');insert into profiles values('${teacher}','${school}'),('${other}','${school2}'),('${manager}','${school}');insert into eps_installation_managers values('${manager}');
 insert into epi_items(id,user_id,institution_id,category,internal_id,comment,status,qr_code_value) values('existing','${teacher}','${school}','BAUDRIER','BAU-001','Do not overwrite','QUARANTAINE','old-code');`);
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261108090000_epi_inventory_qr.sql'),'utf8');await db.exec(sql);await db.exec(sql);
 await db.exec(`set request.jwt.claim.sub='${teacher}'`);
 let count=(await db.query('select eps_prepare_epi_inventory() as n')).rows[0].n;assert.equal(count,89);
 assert.equal((await db.query('select eps_prepare_epi_inventory() as n')).rows[0].n,0);
 const groups=(await db.query('select category,count(*)::int as n from epi_items group by category order by category')).rows;assert.deepEqual(groups,[{category:'BAUDRIER',n:20},{category:'CASQUE',n:30},{category:'MOUSQUETON',n:20},{category:'SYSTEME_ASSURAGE',n:20}]);
 assert.equal((await db.query("select count(*)::int as n from epi_items where id<>'existing' and (active or status<>'A_CONTROLER')")).rows[0].n,0);
 assert.equal((await db.query("select comment from epi_items where id='existing'")).rows[0].comment,'Do not overwrite');
 await db.exec("update epi_items set deleted=true where internal_id='BAU-002'");assert.equal((await db.query('select eps_prepare_epi_inventory() as n')).rows[0].n,0);assert.equal((await db.query("select deleted from epi_items where internal_id='BAU-002'")).rows[0].deleted,true);
 await db.exec(`set request.jwt.claim.sub='${other}'`);assert.equal((await db.query('select eps_prepare_epi_inventory() as n')).rows[0].n,90);
 await db.exec(`set request.jwt.claim.sub='${manager}'`);await assert.rejects(()=>db.query('select eps_prepare_epi_inventory()'),/Compte professeur actif/);
 await db.exec(`set role anon`);await assert.rejects(()=>db.query('select eps_prepare_epi_inventory()'),/permission denied/);
 console.log('PASS PostgreSQL: migration twice, 90 slots per school, repeat creates zero, old records preserved, inactive defaults, tombstone preserved, manager and anonymous denied');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
