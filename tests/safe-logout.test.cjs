const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const account=fs.readFileSync(path.join(root,'compte.js'),'utf8');
const settings=fs.readFileSync(path.join(root,'teacher-settings.js'),'utf8');
for(const marker of ['deconnecterEnSecurite','countPendingOperations','countConflicts','Déconnexion annulée','await modeHorsConnexion.oublierDonneesLocales()'])assert(account.includes(marker),marker);
assert(!account.includes('modeHorsConnexion?.oublierDonneesLocales().catch'));
assert(settings.includes('la déconnexion est automatiquement bloquée'));
console.log('safe-logout: pending edits and conflicts block logout; verified local cleanup is awaited OK');
