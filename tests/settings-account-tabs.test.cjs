const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const settings = fs.readFileSync(path.join(root, 'teacher-settings.js'), 'utf8');
const portal = fs.readFileSync(path.join(root, 'responsable-installations.html'), 'utf8');
const portalScript = fs.readFileSync(path.join(root, 'responsable-installations.js'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/eps-team-admin/handler.mjs'), 'utf8');

assert(settings.includes('Administration des comptes'));
assert(settings.includes('Créer / inviter un professeur'));
assert(settings.includes('Créer / inviter le responsable'));
assert(settings.includes('action:"invite_manager"'));
assert(settings.includes('eps_installation_manager_admin_context'));
assert(edge.includes("body.action==='invite_manager'"));
assert(edge.includes('eps_validate_installation_manager_invite'));
assert(edge.includes('eps_assign_installation_manager_by_admin'));
assert(!portal.includes('/auth/v1/signup'));
assert(!portal.includes('Créer mon compte responsable'));
assert(!portalScript.includes('/auth/v1/signup'));
console.log('PASS Réglages : onglets professeur/responsable et invitation serveur uniquement');
