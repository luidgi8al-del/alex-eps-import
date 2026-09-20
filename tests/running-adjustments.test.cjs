const fs=require('node:fs'),assert=require('node:assert');
const code=fs.readFileSync(require('node:path').join(__dirname,'..','outils.js'),'utf8');
assert(code.includes('min="-30" max="30" step="1"'));
assert(code.includes("runningWalking.has(String(s.id))"));
assert(code.includes(":difficulty:${runningDifficulty}:mode:${walk?'walk':'run'}:times:"));
assert(code.includes("e<=225?3:e<=240?3-(e-225)*.1:e<260?1.5-(e-240)*.075:0"));
assert(code.includes("regMax:walking?9:6,perfMax:walking?3:6"));
assert(code.includes('running-walk-badge'));
console.log('running-adjustments: slider, marche rapide, sauvegarde et barèmes OK');
