const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const hub = fs.readFileSync(path.join(root, 'emails.js'), 'utf8');
const as = fs.readFileSync(path.join(root, 'aslvh.js'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/eps-as-slot-email/index.ts'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260929193000_email_history.sql'), 'utf8');
const privacySql = fs.readFileSync(path.join(root, 'supabase/migrations/20260929194500_private_email_history.sql'), 'utf8');

assert(html.indexOf('data-tab="students"') < html.indexOf('data-tab="emails"'), 'E-MAILS doit suivre ÉLÈVES');
assert(html.indexOf('data-tab="emails"') < html.indexOf('data-tab="settings"'), 'E-MAILS doit précéder RÉGLAGE');
['Nouveau message AS', 'E-mails envoyés', 'emailHistoryList'].forEach(marker => assert(html.includes(marker), marker));
['createEmailHistoryCampaign', 'recordEmailHistoryDeliveries', 'completeEmailHistoryCampaign', 'message_text', 'recipient_email'].forEach(marker => assert(hub.includes(marker), marker));
assert(as.includes('globalThis.ouvrirNouvelEmailAS'), 'le composeur AS doit être accessible depuis le nouvel onglet');
['eps_email_campaigns', 'eps_email_deliveries', 'institution_id = eps_institution()'].forEach(marker => assert(sql.includes(marker), marker));
['user_id = auth.uid() or eps_is_admin', 'Chaque professeur lit ses envois', 'Le détail suit exactement'].forEach(marker => assert(privacySql.includes(marker), marker));
['data-email-history-scope="mine"', 'Tous les e-mails de l’établissement'].forEach(marker => assert(html.includes(marker), marker));
assert(hub.includes('emailHistoryAdmin'), 'la vue établissement doit être réservée à l’administrateur');
assert(hub.includes('&user_id=eq.'), 'la vue normale doit filtrer explicitement sur le professeur connecté');
['campaign_id: campaignId', 'message_text: personalizedMessage', 'status: "sent"', 'status: "failed"'].forEach(marker => assert(edge.includes(marker), marker));

console.log('email-history: navigation, historique partagé et résultats par destinataire OK');
