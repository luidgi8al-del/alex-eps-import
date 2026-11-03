const test=require('node:test'),assert=require('node:assert/strict');
const {createSnapshot,report,pdfCommands}=require('../as-downloads.js');
const documents=require('../tool-documents.js');
function fixture(){return {students:[
  {id:'1',last_name:'École',first_name:'Léa',licensed:true,division:'2-04',jersey_size:'M',wish1:'Natation',medical_certificate_missing:true},
  {id:'2',last_name:'Arnaud',first_name:'Noah',licensed:true,payment_missing:true,medical_certificate_missing:true},
  {id:'3',last_name:'Zola',first_name:'Inès',licensed:true}
],slots:[{id:'10',activity_name:'Volley',day_of_week:'LUNDI',start_time:'12:00',end_time:'13:00'},
  {id:'11',activity_name:'Volley',day_of_week:'JEUDI',start_time:'12:00',end_time:'13:00'},
  {id:'12',activity_name:'Escalade'}],memberships:[
  {student_id:'1',slot_id:'10'},{student_id:'1',slot_id:'11'},{student_id:'1',slot_id:'12'},
  {student_id:'2',slot_id:'12'}],groups:[]};}
test('AS global: every licensed pupil, actual activities, no wish-as-enrollment',()=>{
  const r=report(createSnapshot(fixture()));assert.equal(r.studentCount,3);
  assert.deepEqual(r.rows.map(r=>r[0]),['ARNAUD','ÉCOLE','ZOLA']);
  assert.equal(r.rows[1][3],'Escalade · Volley');assert.equal(r.rows[1][2],'2-04');
  assert.equal(r.rows[2][3],'Aucune inscription à un créneau');assert(!r.rows.flat().join().includes('Natation'));
});
test('AS activity: multiple slots collapse, several AS stay separate and sorted',()=>{
  const s=createSnapshot(fixture()),r=report(s,'activity','volley');
  assert.equal(r.studentCount,1);assert.equal(r.rows.length,1);
  assert.match(r.rows[0][4],/Lundi/);assert.match(r.rows[0][4],/Jeudi/);assert(!r.rows[0][4].includes('Escalade'));
  const all=report(s,'activity');assert.equal(all.studentCount,2);assert.deepEqual(all.rows.map(r=>r[0]),['Escalade','Escalade','Volley']);
});
test('AS incomplete: documents and payment with every actual activity, optional AS filter',()=>{
  const s=createSnapshot(fixture()),r=report(s,'missing');assert.equal(r.studentCount,2);
  assert.equal(r.rows[0][4],'Paiement · Certificat médical');assert.equal(r.rows[1][4],'Certificat médical');
  const filtered=report(s,'missing','volley');assert.equal(filtered.studentCount,1);assert.equal(filtered.rows[0][3],'Escalade · Volley');
});
test('AS incomplete: licensed pupil without assigned activity still needs missing document',()=>{
  const data=fixture();data.students=[{...data.students[2],payment_missing:true}];
  const r=report(createSnapshot(data),'missing');assert.equal(r.studentCount,1);assert.equal(r.rows[0][3],'Aucune inscription à un créneau');
});
test('AS deleted, unlicensed, withdrawn and deleted slots never reappear',()=>{
  const data=fixture();data.students[1].deleted=true;data.students[2].licensed=false;
  data.memberships[0].deleted=true;data.memberships[1].deleted=true;data.slots[2].deleted=true;
  const s=createSnapshot(data);assert.equal(report(s).studentCount,1);assert.equal(s.activities.length,0);assert.equal(report(s,'activity').rows.length,0);
});
test('AS legacy groups: active real enrollment retained, unavailable positive slot never falls back',()=>{
  const data=fixture();data.students=[data.students[0]];data.slots=[];
  data.groups=[{id:'50',activity_name:'Athlétisme',active:true}];
  data.memberships=[{student_id:'1',group_id:'50',slot_id:null},{student_id:'1',group_id:'50',slot_id:'missing'}];
  const r=report(createSnapshot(data),'activity');assert.equal(r.rows.length,1);assert.equal(r.rows[0][0],'Athlétisme');
});
test('AS all records beyond current pagination are exported without modifying source',()=>{
  const data=fixture();data.students=Array.from({length:205},(_,i)=>({...data.students[0],id:String(i+1)}));
  const before=JSON.stringify(data);assert.equal(report(createSnapshot(data)).rows.length,205);assert.equal(JSON.stringify(data),before);
});
test('AS optional original e-mail and wishes stay available without affecting activities',()=>{
  const data=fixture();data.students[0].student_email='exemple@invalid.test';const s=createSnapshot(data);
  const r=report(s,'all','',true);assert(r.headers.includes('Vœu 3'));assert(r.rows[1].includes('Natation'));assert.equal(r.rows[1][3],'Escalade · Volley');
  assert.equal(report(s,'missing','',true).headers.length,5);
});
test('AS Excel is a real ZIP, keeps class labels and literal formula-like text',()=>{
  const data=fixture();data.students[0].first_name='=1+1 <Léa> & Zoé';
  const bytes=documents.xlsx(report(createSnapshot(data),'missing'));
  assert.equal(Buffer.from(bytes).readUInt32LE(),0x04034b50);
  const text=Buffer.from(bytes).toString();assert(text.includes('2-04'));assert(text.includes('=1+1 &lt;Léa&gt; &amp; Zoé'));
  assert(text.includes('t="inlineStr"'));assert(!text.includes('<f>'));assert(text.includes('Certificat médical'));
});
test('AS empty and stale selections never silently switch to all activities',()=>{
  assert.equal(report(createSnapshot(fixture()),'missing','unknown').rows.length,0);
  const data=fixture();data.students=[];assert.equal(report(createSnapshot(data)).rows.length,0);
});
test('AS PDF wraps long cells, repeats table headings and continues giant rows without dropping text',()=>{
  const data=report(createSnapshot(fixture()),'missing');data.rows=Array.from({length:120},(_,i)=>['NOM '+i,'Prénom','2-04','Volley / Escalade '.repeat(i===0?100:4),'Certificat médical']);
  const pages=pdfCommands(data,s=>s.length*5,s=>String(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)'));
  assert(pages.length>2);assert(pages.every(p=>p.includes('Classe / Division')));assert(pages.join('').includes('NOM 119'));
  for(const page of pages)for(const m of page.matchAll(/ ([\d.]+) Td/g))assert(Number(m[1])>=18 && Number(m[1])<=559);
});
