const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'schema_as_call_guard_slots.sql'), 'utf8');
const dialog = fs.readFileSync(path.join(root, 'pwa', 'ui', 'conflict-dialog.js'), 'utf8');
const resolve = fs.readFileSync(path.join(root, 'pwa', 'sync', 'resolve.js'), 'utf8');
if (!sql.includes('new.slot_id is not null') || !sql.includes('eps_call_slot(new.slot_id)')) throw new Error('Le garde-fou doit accepter les appels du créneau affecté.');
if (!dialog.includes('data-refus-retry') || !resolve.includes('retryRejection')) throw new Error('Une saisie refusée doit pouvoir être relancée après correction serveur.');
console.log('as-call-guard-slots: créneaux acceptés et refus relançables OK');
