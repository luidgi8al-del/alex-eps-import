const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'accueil.js'), 'utf8');
const helpers = source.match(/function slotStartMinutes[\s\S]*?function nextTodaySlot[\s\S]*?\n}/)?.[0];
assert(helpers, 'Les fonctions de choix du prochain cours doivent rester testables');

const getNext = new Function(`${helpers}; return nextTodaySlot;`)();
const slots = [
  { id: '8-10', start_time: '08:00', duration_minutes: 120 },
  { id: '10-11', start_time: '10:00', duration_minutes: 60 },
  { id: '14-16', start_time: '14:00', duration_minutes: 120 }
];

assert.equal(getNext(slots, 8 * 60 + 15)?.id, '8-10');
assert.equal(getNext(slots, 9 * 60 + 29)?.id, '8-10');
assert.equal(getNext(slots, 9 * 60 + 30)?.id, '10-11');
assert.equal(getNext(slots, 10 * 60 + 29)?.id, '10-11');
assert.equal(getNext(slots, 10 * 60 + 30)?.id, '14-16');
assert.equal(getNext(slots, 15 * 60 + 29)?.id, '14-16');
assert.equal(getNext(slots, 15 * 60 + 30), null);
assert.match(source, /setInterval\(renderTodayCardNow, 30 \* 1000\)/);

console.log('PASS home course advances 30 minutes before each course ends');
