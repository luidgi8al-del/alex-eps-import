const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles', 'ui-system.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const as = fs.readFileSync(path.join(root, 'aslvh.js'), 'utf8');
const classes = fs.readFileSync(path.join(root, 'classe-tableau-bord.js'), 'utf8');
const health = fs.readFileSync(path.join(root, 'health.js'), 'utf8');

['.ui-modal-overlay', '.ui-modal', '.ui-accordion', '.ui-indicator', '.ui-actions', '.ui-actions-menu']
  .forEach(marker => {
    if (!css.includes(marker)) throw new Error(`Composant visuel commun manquant : ${marker}`);
  });

if (!html.includes('styles/ui-system.css')) {
  throw new Error('Le système visuel commun doit être chargé sur toutes les pages.');
}

[
  'panel.classList.add("as-list-modal", "ui-modal-panel")',
  'panel.classList.add("as-list-modal", "as-call-modal", "ui-modal-panel")',
  'as-date-picker ui-accordion',
  'as-call-kpis ui-indicator-grid',
  'as-history-actions-menu ui-actions',
  'class="ui-actions-menu"'
].forEach(marker => {
  if (!as.includes(marker)) throw new Error(`Écran AS non uniformisé : ${marker}`);
});

if (!classes.includes('dashActions ui-actions') || !classes.includes('student-folder-metrics ui-indicator-grid')) {
  throw new Error('Le tableau de bord de classe n’utilise pas encore les composants communs.');
}

if (!health.includes('searchSheet ui-modal') || !health.includes('class="ui-modal-footer"')) {
  throw new Error('La fiche de dispense n’utilise pas encore la fenêtre centrale commune.');
}

console.log('unified-ui: fenêtres, accordéons, indicateurs et menus Actions partagés OK');
