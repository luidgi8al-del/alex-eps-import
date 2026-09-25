const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'aslvh.js'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase', 'functions', 'eps-as-absence-email', 'index.ts'), 'utf8');

[
  'const absents = unssAppelMembers.filter', 'Aucun élève absent',
  'id="unssSendAbsenceEmails"', 'Envoyer un e-mail aux parents',
  'JSON.stringify({ sessionId })', 'id="unssSkipAbsenceEmails"'
].forEach(marker => { if (!code.includes(marker)) throw new Error(`Étape après appel incomplète : ${marker}`); });

[
  'smtp.gmail.com', 'EPS_GMAIL_APP_PASSWORD', '.eq("session_id", sessionId)',
  'slot_id,date_epoch_millis', 'unss_slots', 'replyTo: teacherEmail',
  'Ce message est à vocation informative. Merci de ne pas y répondre.'
].forEach(marker => { if (!edge.includes(marker)) throw new Error(`Envoi d’absence incomplet : ${marker}`); });

if (edge.includes('RESEND_API_KEY')) throw new Error('L’ancien service Resend ne doit plus être utilisé.');
if (edge.includes('Si cette absence vous parait incorrecte')) throw new Error('L’ancien texte de réponse ne doit plus apparaître.');
console.log('as-absence-email: confirmation après appel, parents absents et Gmail OK');
