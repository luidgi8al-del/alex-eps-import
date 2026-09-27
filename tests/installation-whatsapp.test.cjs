const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const js = read("equipement.js");
const css = read("styles/site.css");
const sql = read("supabase/migrations/20260928090000_installation_incidents_whatsapp.sql");

assert.match(html, /id="installationManagerName"/);
assert.match(html, /id="installationManagerPhone"/);
assert.equal((html.match(/id="installationManagerPhone"/g) || []).length, 1,
  "le responsable doit etre configure une seule fois");
assert.doesNotMatch(html, /installationContactName|installationWhatsappPhone/);

assert.match(js, /function openInstallationReport/);
assert.match(js, /https:\/\/wa\.me\//);
assert.match(js, /function openInstallationHistory/);
assert.match(js, /A_ENVOYER.*SIGNALE.*EN_COURS.*RESOLU/s);
assert.match(js, /installationManager\.whatsapp_phone/);

assert.match(sql, /create table if not exists public\.sport_installation_contacts/);
assert.match(sql, /create table if not exists public\.sport_installation_incidents/);
assert.match(sql, /user_id = auth\.uid\(\)/);
assert.match(css, /\.installation-dialog-overlay/);

console.log("Signalement WhatsApp des installations : OK");
