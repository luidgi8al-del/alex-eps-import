const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { chromium } = require('C:/Users/Hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'aslvh.js'), 'utf8');
const dialog = source.slice(source.indexOf('async function ouvrirEmailGlobalLicencies(rows)'), source.indexOf('async function ouvrirEmailCreneau(slot)'));
const edge = fs.readFileSync(path.join(root, 'supabase/functions/eps-as-slot-email/index.ts'), 'utf8');
const validation = edge.slice(edge.indexOf('    const selectedStudentIds:'), edge.indexOf('    const enrolledSince ='));
function validate(ids) {
  return vm.runInNewContext(stripTypeScriptTypes(`(() => { ${validation}\nreturn selectedStudentIds; })()`), {
    input: {selectedStudentIds: ids}, recipientFilter: 'manual', reply: (_, status) => status
  });
}
assert.equal(validate([]), 400); assert.equal(validate(undefined), 400);
assert.equal(validate(['a', {}]), 400); assert.equal(validate(['bad,id']), 400);
assert.equal(validate(Array(2001).fill('a')), 400);
assert.deepEqual(Array.from(validate(['a', 'a', 'b'])), ['a', 'b']);
assert.match(edge, /eq\("institution_id", institutionId\)\.eq\("deleted", false\)\.eq\("licensed", true\)/);
assert.match(edge, /if \(recipientFilter === "manual"\) studentsQuery = studentsQuery.in\("id", selectedStudentIds\)/);
const server = http.createServer((req, res) => {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body></body></html>');});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    for (const gmail of [false, true]) {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.evaluate(gmail => {
        window.gmailDraftState = () => ({connected:gmail,email:'teacher@example.test'});
        window.assurerInscriptions = async () => {};
        window.unssInscriptions = []; window.unssSlots = [];
        window.session = {email:'teacher@example.test'};
        window.signatureProfesseurAS = () => 'Professeur test';
        window.unssText = text => String(text || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
        window.emailsAS = text => text ? [text] : [];
        window.prenomEmailAS = text => text;
        window.personnaliserEmailAS = text => text;
        window.ligneCreneauEmailAS = () => 'Activité de test';
        window.lirePieceJointeAS = async () => null;
        window.ensureGmailProfessional = async () => ({email:'teacher@example.test'});
        window.openConnectedGmailDrafts = () => {};
        window.confirm = () => true;
        window.captured = [];
        window.createGmailDrafts = async (rows, progress) => {window.captured = rows; rows.forEach((delivery,i) => progress({created:i+1,draft:{id:String(i)},delivery}));};
        window.SUPABASE_URL = 'https://example.invalid';
        window.apiFetch = async (_, request) => {
          window.captured.push(JSON.parse(request.body));
          return {ok:true,json:async()=>({sent:1,total:2,hasMore:window.captured.length===1,nextOffset:window.captured.length})};
        };
        window.students = [
          {id:'a',last_name:'ALPHA',first_name:'Élise',division:'5-01',student_email:'a@example.test'},
          {id:'b',last_name:'BETA',first_name:'Test',division:'4-02',student_email:'b@example.test'},
          {id:'c',last_name:'GAMMA',first_name:'Autre',division:'3-01',student_email:'c@example.test'}
        ];
      }, gmail);
      await page.addScriptTag({content:dialog});
      await page.evaluate(() => ouvrirEmailGlobalLicencies(students));
      await page.locator('#asEmailRecipients').evaluate(el => el.open = true);
      await page.locator('[name=asEmailFilter][value=manual]').check();
      assert.equal(await page.locator('[data-manual-student]:checked').count(),0);
      assert.equal(await page.locator('#asEmailSend').isDisabled(),true);
      await page.locator('[data-manual-student=a]').check();
      await page.locator('#asEmailManualSearch').fill('BETA');
      await page.locator('[data-manual-student=b]').check();
      await page.locator('#asEmailManualSearch').fill('elise');
      assert.equal(await page.locator('[data-manual-student=a]').isChecked(),true);
      assert.match(await page.locator('#asEmailManualCount').innerText(),/2 élève/);
      await page.locator('#asEmailManualSearch').fill('introuvable');
      assert.match(await page.locator('#asEmailManualList').innerText(),/Aucun élève trouvé/);
      await page.locator('#asEmailManualSearch').fill('');
      assert.equal(await page.locator('[data-manual-student=c]').isChecked(),false);
      await page.locator(gmail ? '#asEmailGmailDrafts' : '#asEmailSend').click();
      await page.waitForFunction(gmail => gmail ? captured.length===2 : captured.length===2 && !document.querySelector('#asEmailManualSearch').disabled, gmail, {timeout:5000})
        .catch(async error => { throw new Error(`gmail=${gmail}: ${await page.locator('#asEmailResult').innerText()} / ${error.message}`); });
      const captured = await page.evaluate(() => captured);
      if (gmail) {
        assert.deepEqual(captured.map(x=>x.studentId),['a','b']);
        await page.locator('[data-manual-student=a]').uncheck();
        assert.equal(await page.locator('#asSendPreparedGmailDrafts').count(),0);
      } else for (const request of captured) { assert.equal(request.recipientFilter,'manual'); assert.deepEqual(request.selectedStudentIds,['a','b']); }
      await page.locator('#asEmailManualClear').click();
      assert.equal(await page.locator('#asEmailSend').isDisabled(),true);
      await page.close();
    }
    console.log('PASS manual selection: empty safety, accent search, persistence, unchecked exclusion, 2 frozen server batches, Gmail draft selection/invalidation, server input validation and institution scope. No real emails.');
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
