const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const gmail = fs.readFileSync(path.join(root, 'gmail-drafts.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'teacher-settings.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

[
  'https://www.googleapis.com/auth/gmail.compose', 'initTokenClient', 'prompt: "select_account"',
  'gmail/v1/users/me/profile', 'gmail/v1/users/me/drafts', 'createGmailDrafts',
  'accessToken = ""', 'localStorage.setItem("eps_gmail_last_account"'
].forEach(marker => { if (!gmail.includes(marker)) throw new Error(`Connexion Gmail incomplète : ${marker}`); });
if (/localStorage\.setItem\([^\n]*accessToken/.test(gmail)) throw new Error('Le jeton Gmail ne doit jamais être stocké localement');
['Gmail professionnel', 'gmailConnectBtn', 'gmailDisconnectBtn'].forEach(marker => {
  if (!settings.includes(marker)) throw new Error(`Réglage Gmail manquant : ${marker}`);
});
['accounts.google.com/gsi/client', 'gmail-drafts.js'].forEach(marker => {
  if (!index.includes(marker)) throw new Error(`Chargement Gmail manquant : ${marker}`);
});
console.log('gmail-drafts: OAuth temporaire, profil vérifié et brouillons uniquement OK');
