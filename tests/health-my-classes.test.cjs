const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const health = fs.readFileSync(path.join(__dirname, '..', 'health.js'), 'utf8');

assert.match(health, /function dispenseDeMesClasses\(d\)/);
assert.match(health, /ids\.has\(String\(d\.class_id\|\|''\)\)/);
assert.match(health, /noms\.has\(cleClasseDispense\(d\.class_name\)\)/);
assert.match(health, /!seulementLesMiennes\|\|dispenseDeMesClasses\(d\)/);
assert.doesNotMatch(health, /!seulementLesMiennes\|\|d\.user_id===session\?\.user_id/);

console.log('PASS Mes dispensés est limité aux classes du professeur');
