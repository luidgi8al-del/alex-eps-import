const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'home-navigation.css'), 'utf8');
const home = fs.readFileSync(path.join(root, 'accueil.js'), 'utf8');
const tools = fs.readFileSync(path.join(root, 'tools-workspace.js'), 'utf8');

for (const target of ['tools', 'unss', 'equipement', 'bac']) {
  assert.match(html, new RegExp(`data-home-module="${target}"`));
}
for (const target of ['outils', 'unss', 'equipement', 'programmation']) {
  assert.match(html, new RegExp(`class="homeCard homeModuleCard" data-goto="${target}" tabindex="0"`));
}
assert.match(html, /RACCOURCI FAVORI/);
assert.match(html, /PROCHAIN ÉVÉNEMENT/);
assert.match(html, /SUIVI DES INSTALLATIONS/);
assert.match(html, /Référentiel BAC EPS/);
assert.match(css, /\.homeModuleCard \{[^}]*justify-content:flex-start/);
assert.match(css, /\.homeModuleInsight \{[^}]*margin:auto 42px auto 0/);
assert.match(home, /institution_calendar_events\?deleted=eq\.false&kind=eq\.SORTIE/);
assert.match(home, /incident\.status !== "RESOLU"/);
assert.match(home, /event\.target\.closest\("\[data-home-module\]"\)/);
assert.match(tools, /function homeFavoriteToolSummary/);
assert.match(tools, /function ouvrirFavorisDepuisAccueil/);

console.log('PASS useful home summaries and direct module actions');
