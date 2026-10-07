const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'equipement.js'), 'utf8');

assert.match(html, /id="installationQuickReportBtn"/);
assert.match(js, /function openInstallationReportPicker\(/);
assert.match(js, /data-action="history">Suivi<\/button>/);
assert.doesNotMatch(js, /data-action="report">⚠ Signaler<\/button>/);
assert.doesNotMatch(js, /<summary>Actions<\/summary>/);
assert.match(js, /function openInstallationHistory\(installation\)/);
assert.match(js, /installation_id=eq\.\$\{encodeURIComponent\(installation\.id\)\}/);
assert.doesNotMatch(js, /id="installationNewReport"/);

console.log('Suivi des installations : navigation et actions visibles OK');
