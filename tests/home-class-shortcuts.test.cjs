const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'home-navigation.css'), 'utf8');
const home = fs.readFileSync(path.join(root, 'accueil.js'), 'utf8');
const health = fs.readFileSync(path.join(root, 'health.js'), 'utf8');
const classes = fs.readFileSync(path.join(root, 'classe-tableau-bord.js'), 'utf8');

for (const target of ['classes', 'dispenses', 'evaluations', 'students']) {
  assert.match(html, new RegExp(`data-home-shortcut="${target}"`));
}
assert.match(html, /class="homeModuleGrid"/);
assert.match(css, /\.homeGrid \{ grid-template-columns:minmax\(250px,\.85fr\) minmax\(0,1\.7fr\)/);
assert.match(css, /\.homeClassQuick \{/);
assert.match(css, /\.homeClassQuick \{[^}]*align-self:center/);
assert.match(css, /\.homeClassHub\.featured \{[^}]*grid-template-rows:auto minmax\(0,1fr\)/);
assert.match(css, /\.homeModuleGrid \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(home, /vueClasseAccueilDemandee = "evaluations"/);
assert.match(health, /function ouvrirDispensesDepuisAccueil\(\)/);
assert.match(classes, /const vueDemandee = globalThis\.vueClasseAccueilDemandee/);

console.log('PASS home class hub layout and four direct shortcuts');
