const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const js = read("equipement.js");
const css = read("styles/site.css");
const sql = read("supabase/migrations/20261008010000_installation_shared_manager.sql");
const manager = read("responsable-installations.js");

assert.match(html, /id="installationManagerEmail"/);
assert.doesNotMatch(html, /id="installationManagerPhone"/);

assert.match(js, /function openInstallationReport/);
assert.match(js, /installationDeliveryReady/);
assert.match(js, /function openInstallationHistory/);
assert.match(js, /status: "SIGNALE"/);
assert.doesNotMatch(js, /https:\/\/wa\.me\//);

assert.match(sql, /create table if not exists public\.eps_installation_managers/);
assert.match(sql, /eps_installation_incident_read/);
assert.match(sql, /eps_update_installation_report/);
assert.match(manager, /eps_installation_manager_context/);
assert.match(css, /\.installation-dialog-overlay/);

console.log("Signalements partagés et espace responsable : structure OK");
