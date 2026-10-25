'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const Model = require('../eppcs-lesson-model.js');

const paragraph = (text, style = 'Normal', n = 1) => ({type: 'paragraph', text, style, runs: [{text}], source: {file: 'synthetic.docx', paragraph: n}});
function fixture() {
  const question = {number: 1, prompt: 'Question de démonstration ?', type: 'multiple-choice', choices: [{key: 'a', text: 'Option A'}, {key: 'b', text: 'Option B'}], answerKey: 'b', correction: 'SECRET-CORRECTION', correctionBlocks: [paragraph('SECRET-CORRECTION')], extra: {answer: 'SECRET-CORRECTION'}};
  const table = {type: 'table', rows: [['En-tête', 'Valeur'], ['Exemple', '2']], source: {file: 'synthetic.docx', table: 1}};
  const course = {id: 'synthetic', number: 1, title: 'Chapitre synthétique', sessions: [{number: 1, title: 'Séance A', description: 'Déroulement source A'}, {number: 2, title: 'Séance B', description: 'Déroulement source B'}], quizzes: [question], sections: [
    {id: 'intro', kind: 'intro', title: 'Présentation', blocks: [paragraph('Contexte')]},
    {id: 'objectives', kind: 'objectives', title: 'Objectifs', blocks: [paragraph('Objectif')]},
    {id: 'course', kind: 'course', title: 'Cours', blocks: [paragraph('Préambule sans titre'), paragraph('Partie A', 'Heading 3'), table, paragraph('Texte A'), paragraph('Partie B', 'Heading 3'), paragraph('Texte B')]},
    {id: 'activity', kind: 'case', title: 'Cas', blocks: [paragraph('Cas source'), paragraph('Question 1 Décrire.'), paragraph('Réponse attendue SECRET-CAS')]},
    {id: 'quiz', kind: 'quiz', title: 'Quiz', blocks: [paragraph('Question de démonstration ?'), paragraph('SECRET-UNREVIEWED-ANSWER')]},
    {id: 'quiz-answers', kind: 'quiz-correction', title: 'Correction', blocks: [paragraph('SECRET-CORRECTION')]},
    {id: 'other', kind: 'custom', title: 'Autre contenu', blocks: [paragraph('Autre contenu conservé')]}
  ]};
  return {sources: [{id: 'courses', sha256: 'custom'}], courses: [course], controls: [{id: 'control', courseNumbers: [1], subject: [paragraph('SUJET')], correction: [paragraph('SECRET-CONTROL')]}]};
}

test('unknown libraries preserve every course block, table, section and quiz without inventing a session allocation', () => {
  const library = fixture(), course = library.courses[0], before = JSON.stringify(library);
  const model = Model.build(library, course);
  assert.equal(model.isKnownSource, false);
  assert.match(model.proposalLabel, /sans attribution arbitraire/);
  assert.deepEqual(model.common.unassignedUnits.flatMap(unit => unit.blocks), course.sections.find(s => s.kind === 'course').blocks);
  assert.equal(model.units.length, 3);
  assert.equal(model.units[0].headingBlock, null);
  assert.equal(model.units[1].blocks[1].type, 'table');
  assert.deepEqual(model.allSections, course.sections);
  assert.deepEqual(model.quizQuestions, course.quizzes);
  assert.equal(model.coverage.allCourseBlocksPreserved, true);
  assert.equal(model.coverage.assignedCourseBlocks, 0);
  assert.equal(model.coverage.unassignedCourseBlocks, 6);
  assert.equal(model.sessions.length, 2);
  model.sessions.forEach((session, index) => {
    assert.equal(session.description, course.sessions[index].description);
    assert.equal(session.participationPrompt, course.sessions[index].description);
    assert.deepEqual(session.explainUnits, []);
    assert.deepEqual(session.activities, []);
    assert.deepEqual(session.quizQuestions, []);
  });
  assert.equal(model.linkedControls.length, 1);
  assert.equal(JSON.stringify(library), before);
});

test('source hash alone never activates allocations for a changed or custom chapter', () => {
  const library = fixture();
  library.sources[0].sha256 = '3c416eb174e6df81b9067a0ebfccdd216b35efabc6c29adb9dc21c96e3e830f1';
  assert.equal(Model.build(library, library.courses[0]).isKnownSource, false);
});

test('unknown activity answers and unreviewed quiz content never become student blocks or printable handouts', () => {
  const library = fixture(), model = Model.build(library, library.courses[0]);
  assert.deepEqual(model.activities[0].studentBlocks, []);
  assert.match(JSON.stringify(model.activities[0].teacherBlocks), /SECRET-CAS/);
  assert.deepEqual(model.common.quizStudentBlocks, []);
  assert.match(JSON.stringify(model.common.unreviewedQuizBlocks), /SECRET-UNREVIEWED-ANSWER/);
  const sheet = Model.pupilSheet(library, library.courses[0]);
  assert.deepEqual(sheet.blocks, []);
  assert.ok(sheet.warnings.length);
  assert.doesNotMatch(JSON.stringify(sheet), /SECRET-/);
});

test('student quiz allowlist does not carry answer keys, correction metadata or arbitrary properties', () => {
  const question = fixture().courses[0].quizzes[0];
  const student = Model.studentQuestion(question);
  assert.equal(student.prompt, question.prompt);
  assert.equal(student.choices.length, 2);
  assert.equal(Object.hasOwn(student, 'answerKey'), false);
  assert.equal(Object.hasOwn(student, 'correction'), false);
  assert.equal(Object.hasOwn(student, 'correctionBlocks'), false);
  assert.equal(Object.hasOwn(student, 'extra'), false);
  assert.doesNotMatch(JSON.stringify(student), /SECRET-/);
});

test('content fingerprint is independent of object key order after JSONB round trips', () => {
  const value = fixture();
  const reorder = x => Array.isArray(x) ? x.map(reorder) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).reverse().map(([k, v]) => [k, reorder(v)])) : x;
  assert.equal(Model.fingerprint(value), Model.fingerprint(reorder(value)));
  const modified = structuredClone(value);
  modified.courses[0].sections[0].blocks[0].text += ' modifié';
  assert.notEqual(Model.fingerprint(value), Model.fingerprint(modified));
});

// Real teaching text is deliberately external to the public repository and its CI fixtures.
test('private source QA: all 31 sessions, every course block/table and all 100 questions are preserved with safe pupil handouts', {skip: !process.env.EPPCS_PRIVATE_LIBRARY}, () => {
  const imported = JSON.parse(fs.readFileSync(process.env.EPPCS_PRIVATE_LIBRARY, 'utf8'));
  const library = imported.library || imported;
  let sessions = 0, questions = 0, blocks = 0, tables = 0;
  for (const course of library.courses) {
    const original = JSON.stringify(course), model = Model.build(library, course);
    assert.equal(model.isKnownSource, true, 'known chapter ' + course.number);
    assert.match(model.proposalLabel, /proposée par l’assistant/);
    assert.equal(model.coverage.allCourseBlocksPreserved, true);
    assert.equal(model.coverage.unassignedCourseBlocks, 0);
    const originals = course.sections.filter(section => section.kind === 'course').flatMap(section => section.blocks);
    const assigned = model.sessions.flatMap(session => session.explainUnits.flatMap(unit => unit.blocks));
    assert.equal(assigned.length, originals.length);
    for (const block of originals) assert.equal(assigned.filter(assignedBlock => assignedBlock === block).length, 1);
    assert.deepEqual(model.sessions.flatMap(session => session.quizQuestions), course.quizzes);
    assert.deepEqual(model.allSections, course.sections);
    for (const activity of model.activities) {
      assert.equal(activity.verified, true);
      for (const block of activity.allBlocks) assert.ok(activity.studentBlocks.includes(block) || activity.teacherBlocks.includes(block));
      assert.ok(activity.studentBlocks.every(block => !/^Réponse attendue/.test(block.text || '')));
    }
    const correctionBlocks = course.sections.filter(section => section.kind === 'quiz-correction').flatMap(section => section.blocks)
      .concat(model.activities.flatMap(activity => activity.allBlocks.filter(block => /^Réponse attendue/.test(block.text || ''))));
    for (const id of [undefined, ...model.sessions.map(session => session.id)]) {
      const sheet = Model.pupilSheet(library, course, id);
      for (const correction of correctionBlocks) assert.ok(!sheet.blocks.includes(correction), 'no correction block in pupil handout');
      assert.ok(sheet.blocks.every(block => !/^Réponse attendue/.test(block.text || '')));
    }
    assert.equal(Model.pupilSheet(library, course, 'missing').blocks.length, 0);
    assert.equal(JSON.stringify(course), original);
    sessions += model.sessions.length; questions += model.quizQuestions.length; blocks += originals.length;
    tables += model.activities.flatMap(activity => activity.studentBlocks).filter(block => block.type === 'table').length;
    // In-place edits must disable the reviewed mapping; no stale cached allocation.
    const copy = structuredClone(library), modified = copy.courses.find(item => item.id === course.id);
    assert.equal(Model.build(copy, modified).isKnownSource, true);
    modified.sections.find(section => section.kind === 'course').blocks[1].text += ' modification';
    assert.equal(Model.build(copy, modified).isKnownSource, false);
  }
  assert.equal(sessions, 31);
  assert.equal(questions, 100);
  assert.ok(blocks > 600);
  assert.equal(tables, 3);
});
