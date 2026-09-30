const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const health = fs.readFileSync(path.join(__dirname, '..', 'health.js'), 'utf8');

assert.match(health, /function dispenseDeMesClasses\(d\)/);
assert.match(health, /ids\.has\(String\(d\.class_id\|\|''\)\)/);
assert.match(health, /noms\.has\(cleClasseDispense\(d\.class_name\)\)/);
assert.match(health, /\(\?:2nde\|seconde\|2\)0\*/);
assert.match(health, /`seconde\$\{Number\(seconde\[1\]\)\}`/);
assert.match(health, /!seulementLesMiennes\|\|dispenseDeMesClasses\(d\)/);
assert.doesNotMatch(health, /!seulementLesMiennes\|\|d\.user_id===session\?\.user_id/);
assert.match(health, /<button type="button" class="danger" id="ficheSuppr">⌫ Supprimer la dispense<\/button>/);
assert.doesNotMatch(health, /<details class="ui-actions"><summary>Actions<\/summary><div class="ui-actions-menu"><button type="button" class="danger" id="ficheSuppr"/);

console.log('PASS Mes dispensés est limité aux classes du professeur');
