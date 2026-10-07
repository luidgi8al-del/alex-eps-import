const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'cours.js'), 'utf8');
const save = source.slice(source.indexOf('async function setScore('), source.indexOf('async function addCriterion('));
const sent = [];
const context = {
  evalScores: {},
  modeHorsConnexion: { enregistrer: async (table, id, data) => sent.push({ table, id, data }) },
  session: { user_id: 'prof-test' },
  crypto: { randomUUID: () => 'score-1' },
  scoreValue: row => row && !row.deleted ? row.points : null,
  renderEvaluationTable: () => {},
  Date
};
vm.createContext(context);
vm.runInContext(save, context);

(async () => {
  const input = { value: '4', dataset: { crit: 'crit-1', student: 'el-1', max: '20' } };
  await context.setScore(input);
  input.value = '7';
  await context.setScore(input);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].data.points, 7);
  for (const field of ['user_id', 'criterion_id', 'student_id']) {
    assert.equal(sent[1].data[field], sent[0].data[field], `${field} perdu après modification`);
  }
  console.log('evaluation-score-identity: create then edit preserves identity');
})().catch(error => { console.error(error); process.exitCode = 1; });
