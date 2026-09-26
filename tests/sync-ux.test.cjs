const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const status = fs.readFileSync(path.join(root, 'pwa', 'ui', 'sync-status.js'), 'utf8');
const conflicts = fs.readFileSync(path.join(root, 'pwa', 'ui', 'conflict-dialog.js'), 'utf8');
const events = fs.readFileSync(path.join(root, 'pwa', 'core', 'events.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'pwa', 'sync', 'engine.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'pwa', 'bootstrap.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'site.css'), 'utf8');

[
  'dernière réussite', 'modification en attente', 'conflit', 'Réessayer',
  'syncStatusRetry', 'syncStatusDetails'
].forEach(marker => {
  if (!status.includes(marker)) throw new Error(`Etat de synchronisation incomplet : ${marker}`);
});
[
  'Fiche de ${personne}', 'Cette fiche a été modifiée sur deux appareils',
  'Adresse e-mail des parents', 'Âge maximum pour l’hébergement', 'Version enregistrée'
].forEach(marker => {
  if (!conflicts.includes(marker)) throw new Error(`Conflit encore trop technique : ${marker}`);
});
if (!events.includes('eps:last-successful-sync') || !events.includes('lastSuccessfulAt')) {
  throw new Error('La dernière synchronisation réussie doit survivre aux changements d’état.');
}
if (!engine.includes('lastSuccessfulAt: new Date().toISOString()')) {
  throw new Error('Une synchronisation aboutie doit enregistrer son heure.');
}
if (!bootstrap.includes('beforeunload') || !bootstrap.includes('nombreEnAttente')) {
  throw new Error('La fermeture doit être protégée quand une saisie attend encore.');
}
['.syncStatusRetry', '.syncStatusDetails', '.conflitExplication', '.conflitTable'].forEach(marker => {
  if (!css.includes(marker)) throw new Error(`Style de synchronisation manquant : ${marker}`);
});
console.log('sync-ux: état détaillé, reprise, conflits lisibles et fermeture protégée OK');
