const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const bootstrap = fs.readFileSync(path.join(root, "pwa", "bootstrap.js"), "utf8");

assert(bootstrap.includes("const DELAI_ENVOI_APRES_SAISIE_MS = 1500"),
  "les saisies rapprochées doivent être regroupées brièvement");
assert(bootstrap.includes("function programmerEnvoiApresSaisie()"),
  "un envoi prioritaire doit être programmé après une saisie");
assert(bootstrap.includes("if (dejaEnCours) await dejaEnCours"),
  "une saisie arrivée pendant une synchronisation doit attendre puis repartir");
assert(bootstrap.includes("await rapprocher({ force: true })"),
  "l'envoi d'une saisie doit contourner la temporisation des simples lectures");
assert((bootstrap.match(/programmerEnvoiApresSaisie\(\);/g) || []).length >= 2,
  "les enregistrements et suppressions doivent déclencher l'envoi prioritaire");

console.log("priority-auto-sync: OK");
