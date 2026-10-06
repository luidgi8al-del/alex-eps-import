const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'classe-tableau-bord.js'), 'utf8');
const screens = fs.readFileSync(path.join(root, 'classe-ecrans.js'), 'utf8');
const tools = fs.readFileSync(path.join(root, 'outils.js'), 'utf8');
const courses = fs.readFileSync(path.join(root, 'cours.js'), 'utf8');

[
  'Ce n\'est volontairement PAS un appel',
  'Présent', 'Dispensé', 'Absent',
  'une dispense cochée ici ne vaut que pour cette séance',
  'elevesActifsPourSeance',
  'terminerPreparationSeance'
].forEach(marker => {
  if (!dashboard.includes(marker)) throw new Error(`Préparation de séance incomplète : ${marker}`);
});

if (!screens.includes('Commencer la séance') || !screens.includes('Terminer la séance')) {
  throw new Error('Les commandes de début et de fin de séance doivent être visibles dans la classe.');
}
if (!tools.includes('globalThis.elevesActifsPourSeance(classId, toolStudents)')) {
  throw new Error('Les outils ne reprennent pas encore le groupe présent.');
}
if (!courses.includes('globalThis.elevesActifsPourSeance(cycleRow.class_id, evalAllStudents)')) {
  throw new Error('Les évaluations ne reprennent pas encore le groupe présent.');
}
if (/unss_attendance|class_attendance/.test(dashboard)) {
  throw new Error('La préparation de séance ne doit pas devenir un appel enregistré.');
}

console.log('class-session-preparation: sélection temporaire, outils et évaluations OK');
