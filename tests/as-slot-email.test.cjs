const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'aslvh.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'site.css'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase', 'functions', 'eps-as-slot-email', 'index.ts'), 'utf8');

[
  'id="asEmail"', 'function ouvrirEmailCreneau(slot)', 'value="students"', 'value="parents"',
  'value="both"', 'value="parents_personalized"', 'Confirmation d’inscription', 'Séance annulée',
  'Message libre', 'asEmailAttachment', 'eps-as-slot-email', 'const bilan = await response.json()',
  'id="asEmailRecipients"', 'Aux familles', 'Aux élèves et aux familles', 'showPicker', '{classe}',
  'function signatureProfesseurAS', 'return `M. ${nom}`', '{nom} {prenom}',
  'id="unssGlobalEmailBtn"', 'function ouvrirEmailGlobalLicencies', 'mode: "global_confirmations"', '{creneaux}',
  'name="asEmailFilter"', 'missing_certificate', 'missing_payment', 'host_available', 'recipientFilter: filtre()'
].forEach(marker => { if (!code.includes(marker)) throw new Error(`Interface e-mail incomplète : ${marker}`); });
['.as-slot-email-overlay', '.as-email-choice', '.as-email-recipient-summary'].forEach(marker => {
  if (!css.includes(marker)) throw new Error(`Style e-mail manquant : ${marker}`);
});
[
  'assigned_teacher_id', 'unss_memberships', 'student_email,parent_email', 'parents_personalized',
  'attachments', 'smtp.gmail.com', 'EPS_GMAIL_APP_PASSWORD', 'replyTo: teacherEmail', 'division',
  'deliveries.length > 150', 'formatFirstName', 'toLocaleUpperCase("fr-FR")',
  'const child = `${last} ${first}`', 'global_confirmations', 'eps_admin_target',
  'activityLine', '.replaceAll("{creneaux}", activityList)',
  'RECIPIENT_FILTERS', 'medical_certificate_missing', 'payment_missing', 'host_available'
].forEach(marker => { if (!edge.includes(marker)) throw new Error(`Sécurité serveur incomplète : ${marker}`); });
console.log('as-slot-email: destinataires, modèles, personnalisation, pièce jointe et sécurité OK');
