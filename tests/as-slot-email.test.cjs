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
  'name="asEmailFilter"', 'recent_retained', 'id="asEmailRecentSince"', 'inscriptionDepuisIso', 'missing_certificate', 'missing_payment', 'host_available', 'recipientFilter: filtre()',
  'id="asEmailTemplate"', 'value="free">Message libre', 'id="asEmailTemplateChoice"', 'Contacter les licenciés AS'
].forEach(marker => { if (!code.includes(marker)) throw new Error(`Interface e-mail incomplète : ${marker}`); });
[
  'id="asEmailGmailTest"', 'id="asEmailGmailDrafts"', 'Créer un brouillon test',
  'Préparer dans Gmail', 'construireBrouillons', 'createGmailDrafts', 'openConnectedGmailDrafts',
  'Envoyer avec le compte AS', 'Envoyer ce lot avec Gmail professionnel', 'envoyerLotGmailPrepare',
  'sendGmailDrafts', 'message(s) accepté(s) par Gmail', 'gmailProfessionnelActif',
  'etatGmailOuverture.connected && etatGmailOuverture.email',
  ': \'<button type="button" id="asEmailSend" disabled>Envoyer</button>\''
].forEach(marker => { if (!code.includes(marker)) throw new Error(`Brouillons Gmail incomplets : ${marker}`); });
['.as-slot-email-overlay', '.as-email-choice', '.as-email-recipient-summary'].forEach(marker => {
  if (!css.includes(marker)) throw new Error(`Style e-mail manquant : ${marker}`);
});
[
  'assigned_teacher_id', 'unss_memberships', 'student_email,parent_email', 'parents_personalized',
  'attachments', 'smtp.gmail.com', 'EPS_GMAIL_APP_PASSWORD', 'replyTo: teacherEmail', 'division',
  'batchSize = Math.min(100', 'batchDeliveries', 'hasMore: nextOffset < total',
  'total > 450', 'formatFirstName', 'toLocaleUpperCase("fr-FR")',
  'const child = `${last} ${first}`', 'global_confirmations', 'eps_admin_target',
  'activityLine', '.replaceAll("{creneaux}", activityList)',
  'RECIPIENT_FILTERS', 'enrolledSince', 'recentStudentIds', 'medical_certificate_missing', 'payment_missing', 'host_available'
].forEach(marker => { if (!edge.includes(marker)) throw new Error(`Sécurité serveur incomplète : ${marker}`); });
[
  'batchOffset: offset, batchSize: 10', 'Envoi du lot ${numeroLot}/${nombreLots}',
  'lot(s) de 100 maximum', 'if (!bilan.hasMore) break', 'id="asEmailResumeStudent"',
  'reprendreEleveId', 'resumeStudentId', 'if (!envoiEnCours) overlay.remove()', 'b.disabled = true'
].forEach(marker => { if (!code.includes(marker)) throw new Error(`Envoi par lots incomplet : ${marker}`); });
['resumeStudentId', 'resumeIndex', 'campaignDeliveries', 'Toutes les adresses d\'un même élève', 'studentEnd'].forEach(marker => {
  if (!edge.includes(marker)) throw new Error(`Reprise par élève incomplète : ${marker}`);
});
['pool: true', 'maxConnections: 1', 'rateLimit: 2', 'attempted++', 'studentName'].forEach(marker => {
  if (!edge.includes(marker)) throw new Error(`Protection Gmail incomplète : ${marker}`);
});
['Gmail a refusé un message', 'premierEchec.studentId'].forEach(marker => {
  if (!code.includes(marker)) throw new Error(`Arrêt au premier refus incomplet : ${marker}`);
});
if (!code.includes('Un lot visible de 100 est traité en sous-étapes courtes')) throw new Error('Sous-étapes Supabase manquantes');
console.log('as-slot-email: destinataires, modèles, personnalisation, pièce jointe et sécurité OK');
