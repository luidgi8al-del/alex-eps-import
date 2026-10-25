/* Execute the real migration in disposable PostgreSQL (PGlite), not Supabase.
 * Install @electric-sql/pglite outside the site; EPPCS_PGLITE_MODULE may point to it.
 * All accounts and teaching payloads below are synthetic. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require(process.env.EPPCS_PGLITE_MODULE || '@electric-sql/pglite');
const sql = fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261025010000_eppcs_private.sql'),'utf8');
const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002';
const C='00000000-0000-0000-0000-000000000003', D='00000000-0000-0000-0000-000000000004';
(async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, active boolean not null default true);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.eps_account_active() returns boolean language sql stable security definer as $$
        select coalesce((select active from auth.users where id=auth.uid()),false) $$;
      create table public.eps_installation_managers(user_id uuid primary key);
      grant usage on schema auth to authenticated;
      grant select on public.eps_installation_managers to authenticated;
      insert into auth.users(id,active) values('${A}',true),('${B}',true),('${C}',false),('${D}',true);
      insert into public.eps_installation_managers values('${D}');`);
    const fixed="octet_length(p_payload::text) > (case when p_document_id = 'library' then 4194304 else 65536 end)";
    assert.ok(sql.includes(fixed));
    const broken=sql.replace(fixed,"octet_length(p_payload::text) > case when p_document_id = 'library' then 4194304 else 65536 end");
    await assert.rejects(db.exec(broken), e=>e.code==='42601');
    await db.exec('rollback;');
    console.log('PASS original syntax error reproduced (42601), failed migration rolled back');
    await db.exec(sql); await db.exec(sql);
    console.log('PASS complete corrected migration executes twice without deleting data');
    async function asUser(user){ await db.exec('reset role; set role authenticated;'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]); }
    async function save(key,expected,payload){ return (await db.query('select public.eps_save_eppcs_document($1::text,$2::bigint,$3::jsonb) as result',[key,expected,JSON.stringify(payload)])).rows[0].result; }
    await asUser(A);
    const library={courses:[{title:'Synthetic course'}]};
    assert.deepEqual(await save('library',0,library),{saved:true,revision:1});
    const conflict=await save('library',0,{courses:[]});
    assert.equal(conflict.saved,false); assert.deepEqual(conflict.current.payload,library);
    const note={text:'Synthetic teaching note',status:'enseigne',savedAt:'2026-10-25T12:00:00.000Z'};
    assert.deepEqual(await save('note:cours-1',0,note),{saved:true,revision:1});
    assert.deepEqual(await save('note:cours-1',1,{...note,text:'Updated'}),{saved:true,revision:2});
    assert.equal((await save('note:cours-1',1,note)).saved,false);
    assert.equal((await db.query('select * from public.eps_eppcs_documents')).rows.length,2);
    await assert.rejects(db.query("update public.eps_eppcs_documents set payload='{}'"),e=>e.code==='42501');
    for(const [key,rev,payload] of [['invalid',0,{}],['note:x',-1,{text:'x'}],['note:x',0,{text:'x',status:'admin'}],['note:x',0,{text:'x',secret:true}],['note:x',0,{text:'x'.repeat(66000)}]])
      await assert.rejects(save(key,rev,payload),e=>e.code==='22023');
    await asUser(B);
    assert.equal((await db.query('select * from public.eps_eppcs_documents')).rows.length,0);
    assert.deepEqual(await save('library',0,{courses:[]}),{saved:true,revision:1});
    await asUser(A);
    assert.deepEqual((await db.query("select payload from public.eps_eppcs_documents where document_id='library'")).rows[0].payload,library);
    for (const user of [C,D,'']) {
      await asUser(user);
      assert.equal((await db.query('select * from public.eps_eppcs_documents')).rows.length,0);
      await assert.rejects(save('library',0,{}),e=>e.code==='42501');
    }
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from public.eps_eppcs_documents'),e=>e.code==='42501');
    await assert.rejects(save('library',0,{}),e=>e.code==='42501');
    console.log('PASS SQL execution: create/update/CAS, note metadata, size checks, account isolation, inactive/manager/anonymous denial');
  } finally {await db.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
