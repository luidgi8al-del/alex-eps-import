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
const reasonValidation = edge.slice(edge.indexOf('    const reason ='), edge.indexOf('    const selectedStudentIds:'));
for (const reason of ['missing_certificate','missing_payment','host_available']) {
  const check = (recipientFilter, audience) => vm.runInNewContext(`(() => {${reasonValidation}; return 200;})()`, {input:{reason},recipientFilter,audience,reply:(_,status)=>status});
  assert.equal(check('manual','both'),400); assert.equal(check(reason,'students'),400); assert.equal(check(reason,'both'),200);
}
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
      await page.addStyleTag({path:path.join(root,'styles/site.css')});
      await page.addStyleTag({path:path.join(root,'styles/ui-system.css')});
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
          {id:'a',last_name:'ALPHA',first_name:'Élise',division:'5-01',student_email:'a@example.test',medical_certificate_missing:true},
          {id:'b',last_name:'BETA',first_name:'Test',division:'4-02',student_email:'b@example.test',payment_missing:true},
          {id:'c',last_name:'GAMMA',first_name:'Autre',division:'3-01',student_email:'c@example.test',parent_email:'parent@example.test',host_available:true}
        ];
      }, gmail);
      await page.addScriptTag({content:dialog});
      await page.evaluate(() => ouvrirEmailGlobalLicencies(students));
      assert.equal(await page.locator('#asEmailReasonStep').getAttribute('open'),'');
      assert.equal(await page.locator('#asEmailDestination option').count(),6);
      for (const reason of ['missing_certificate','missing_payment','host_available']) {
        await page.locator('#asEmailReason').selectOption(reason);
        await page.locator('#asEmailToRecipients').click();
        assert.equal(await page.locator('#asEmailDestinationWrap').isVisible(),false);
        assert.equal(await page.locator('#asEmailDestination').isDisabled(),true);
        assert.equal(await page.locator('#asEmailManualWrap').isVisible(),false);
        assert.equal(await page.locator('#asEmailRecentSinceWrap').isVisible(),false);
        assert.match(await page.locator('#asEmailRecipientSummary').innerText(),/1 élève/);
        assert.match(await page.locator('#asEmailRecipientSummary').innerText(),reason==='host_available' ? /2 e-mail/ : /1 e-mail/);
        await page.locator('#asEmailReasonStep > summary').click();
      }
      await page.locator('#asEmailReason').selectOption('cancelled');
      assert.match(await page.locator('#asEmailSubject').inputValue(),/Annulation/);
      await page.locator('#asEmailToRecipients').click();
      for (const [mode,count] of [['students',3],['parents_personalized',1],['both',4]]) {
        await page.locator('#asEmailDestination').selectOption(mode);
        assert.match(await page.locator('#asEmailRecipientSummary').innerText(),new RegExp(`${count} e-mail`));
      }
      await page.locator('#asEmailDestination').selectOption('recent_retained');
      assert.equal(await page.locator('#asEmailRecentSince').isVisible(),true);
      assert.equal(await page.locator('#asEmailSend').isDisabled(),true);
      await page.locator('#asEmailToMessage').click();
      await page.locator('#asEmailTemplate').selectOption('short');
      assert.match(await page.locator('#asEmailMessage').inputValue(),/annulée/);
      await page.locator('#asEmailTemplate').selectOption('free');
      await page.locator('#asEmailMessage').fill('Texte personnel à conserver');
      await page.locator('#asEmailRecipients > summary').click();
      await page.locator('#asEmailDestination').selectOption('manual');
      assert.equal(await page.locator('#asEmailMessage').inputValue(),'Texte personnel à conserver');
      if (!gmail) {
        await page.screenshot({path:path.join(require('node:os').tmpdir(),'eps-email-recipients-desktop.png')});
        await page.setViewportSize({width:390,height:844});
        await page.screenshot({path:path.join(require('node:os').tmpdir(),'eps-email-recipients-mobile.png')});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        await page.setViewportSize({width:1280,height:720});
      }
      await page.locator('#asEmailReasonStep > summary').click();
      await page.locator('#asEmailReason').selectOption('confirmation');
      await page.locator('#asEmailToRecipients').click();
      await page.locator('#asEmailDestination').selectOption('manual');
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
      await page.waitForFunction(gmail => gmail ? captured.length===2 : captured.length===2 && document.querySelector('#asEmailSend').textContent==='Terminer', gmail, {timeout:5000})
        .catch(async error => { throw new Error(`gmail=${gmail}: ${await page.locator('#asEmailResult').innerText()} / ${error.message}`); });
      const captured = await page.evaluate(() => captured);
      if (gmail) {
        assert.deepEqual(captured.map(x=>x.studentId),['a','b']);
        await page.locator('[data-manual-student=a]').uncheck();
        assert.equal(await page.locator('#asSendPreparedGmailDrafts').count(),0);
        await page.locator('#asEmailManualClear').click();
        assert.equal(await page.locator('#asEmailSend').isDisabled(),true);
      } else {
        for (const request of captured) { assert.equal(request.recipientFilter,'manual'); assert.deepEqual(request.selectedStudentIds,['a','b']); }
        assert.match(await page.locator('#asEmailResult').innerText(), /Tous les lots sont terminés/);
        assert.equal(await page.locator('#asEmailSend').isDisabled(),false);
        await page.getByRole('button',{name:'Terminer',exact:true}).click();
        assert.equal(await page.locator('#asSlotEmailOverlay').count(),0);
        assert.equal(await page.evaluate(()=>captured.length),2);
        await page.evaluate(async () => {
          window.apiFetch = async () => ({ok:false,json:async()=>({error:'Échec simulé'})});
          await ouvrirEmailGlobalLicencies(students);
        });
        await page.locator('#asEmailReason').selectOption('confirmation');
        await page.locator('#asEmailToRecipients').click();
        await page.locator('#asEmailDestination').selectOption('manual');
        await page.locator('[data-manual-student=a]').check();
        await page.locator('#asEmailSend').click();
        await page.waitForFunction(()=>document.querySelector('#asEmailSend').textContent==='Envoi interrompu');
        assert.equal(await page.getByRole('button',{name:'Terminer',exact:true}).count(),0);
        assert.match(await page.locator('#asEmailResult').innerText(), /Échec simulé/);
      }
      await page.close();
    }
    console.log('PASS manual selection: empty safety, accent search, persistence, unchecked exclusion, 2 frozen server batches, Gmail draft selection/invalidation, server input validation and institution scope. No real emails.');
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
