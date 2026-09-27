const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const screen = fs.readFileSync(path.join(root, 'classe-ecrans.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'classe-ecrans.css'), 'utf8');

for (const marker of [
  'id="ecNouvelleEvaluation"',
  'id="ecNouveauTest"',
  'class="ec-eval-stats"',
  'class="ec-evaluations-carte"',
  'Aucune évaluation pour cette période',
  'id="ecActionsEvaluations"',
  'function ecCreerNouveauTest()',
  'Évaluation ponctuelle · suivre les progrès',
  'Évaluation finale · bilan du cycle'
]) assert(screen.includes(marker), marker);

for (const marker of [
  '.ec-eval-actions-principales',
  '.ec-eval-stats',
  '.ec-evaluations-carte',
  '.ec-eval-vide',
  '@media (max-width: 760px)'
]) assert(css.includes(marker), marker);

console.log('evaluations-layout: primary actions, compact statistics, central list, empty state and responsive layout OK');
