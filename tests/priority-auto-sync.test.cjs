const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const bootstrap = fs.readFileSync(path.join(root, "pwa", "bootstrap.js"), "utf8");

assert(bootstrap.includes("const DELAI_ENVOI_APRES_SAISIE_MS = 1500"),
  "les saisies rapprochées doivent être regroupées brièvement");
assert(bootstrap.includes("function programmerEnvoiApresSaisie()"),
  "un envoi prioritaire doit être programmé après une saisie");
assert(bootstrap.includes("createAutoSync({ run: () => engine.sync()"),
  "toutes les demandes doivent utiliser le coordinateur testé dans auto-sync.test.cjs");
assert(bootstrap.includes("automatique.changed()"),
  "les écritures doivent emprunter le chemin prioritaire du coordinateur");
assert((bootstrap.match(/programmerEnvoiApresSaisie\(\);/g) || []).length >= 2,
  "les enregistrements et suppressions doivent déclencher l'envoi prioritaire");

console.log("priority-auto-sync: OK");
