const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'aslvh.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'site.css'), 'utf8');

[
  'data-unsstab="dates"',
  'Dates AS'
].forEach(marker => {
  if (!html.includes(marker)) throw new Error(`Onglet Dates AS manquant : ${marker}`);
});

[
  'EPS_AS_DETAILS:',
  'function loadUnssDates()',
  'function renderUnssDatesTab()',
  'function openUnssDatePanel(event)',
  'institution_calendar_events',
  'travelRequired',
  'schoolNeeds',
  'asNeeds',
  'function conflitsDateAs(millis, idIgnore)',
  'loadInstitutionCalendar()',
  'Enregistrer quand même cette date AS ?'
].forEach(marker => {
  if (!code.includes(marker)) throw new Error(`Fonction Dates AS manquante : ${marker}`);
});

['.as-dates-page', '.as-date-card', '.as-date-form', '.as-needs-grid'].forEach(marker => {
  if (!css.includes(marker)) throw new Error(`Style Dates AS manquant : ${marker}`);
});

console.log('as-dates-sync: onglet, fiches et format de synchronisation OK');
