const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'aide.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'aide.css'), 'utf8');

test('la rubrique aide est placée après réglage et possède sa page', () => {
  assert.match(html, /data-tab="settings">REGLAGE<\/button>\s*<button[^>]+data-tab="help"/);
  assert.match(html, /id="tab-help"/);
  assert.match(html, /const TAB_NAMES = \[[^\]]*"help"/);
});

test('les principaux parcours sont documentés et recherchables', () => {
  for (const text of ['Retirer un élève d’une classe', 'Créer une dispense', 'Créer et remplir une sortie',
    'Envoyer un mail depuis l’AS', 'Utiliser un outil individuel', 'Utiliser un outil collectif',
    'Comprendre la synchronisation et le hors connexion']) assert.ok(js.includes(text), text);
  assert.match(js, /normalize\("NFD"\)/);
  assert.match(css, /\.helpResults/);
});
