/* Private EPPCS material is never bundled here. Only reviewed numeric allocations are public. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EPPCSLessonModel = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const list = value => Array.isArray(value) ? value : [];
  const SOURCE_SHA256 = '3c416eb174e6df81b9067a0ebfccdd216b35efabc6c29adb9dc21c96e3e830f1';
  // These are proposed teaching allocations, not extra statements from the source author.
  const PLANS = Object.freeze({
    1: [[1, 2, 3, 4], [5, 6, 7], []],
    2: [[1, 2, 3, 5], [4, 6, 7, 8]],
    3: [[1, 2, 3], [4, 5, 6], [7, 8]],
    4: [[1, 2, 3, 4, 5, 6], [7, 8]],
    5: [[1, 2, 3, 4, 5, 6, 7], [8]],
    6: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]],
    7: [[1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11]],
    8: [[1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11]],
    9: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
    10: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11]],
    11: [[1, 2, 3, 4], [5, 6, 7]],
    12: [[1, 2, 3], [4, 5, 6, 7]],
    13: [[1, 2, 3, 4, 5], [6, 7]],
    14: [[1, 2, 3, 4], [5, 6, 7]],
    15: [[1, 2, 3, 4, 5], [6, 7, 8]]
  });
  // Content fingerprints prevent applying a source-specific plan to edited/custom chapters.
  // This is a matching aid, not an authentication or access-control mechanism.
  const FINGERPRINTS = Object.freeze({
    1: 'ed3da55f38889615', 2: 'a55e91c02a4aea0e', 3: '649d8005303d8b27',
    4: 'd9e4bb7b6b473303', 5: '1d5ca48e8c3311ca', 6: 'da5daa4cc9bc27ac',
    7: 'b771743ba9d2a02b', 8: '494f442fee8e148f', 9: '75aa3ada599a876e',
    10: '7d7cc568b5bd0484', 11: 'c55f2d3f03ae458f', 12: '5f22f63307ecc0e3',
    13: '198898dc5bcdd612', 14: '9f57cef198d483e3', 15: '2a900a2d45d8091d'
  });
  const PROPOSAL = 'Répartition pédagogique proposée par l’assistant à partir du déroulement fourni, à valider par le professeur. Les textes restent intégralement ceux de vos documents.';
  const UNASSIGNED = 'Ce chapitre n’est pas la version relue pour la répartition automatique. Les contenus restent disponibles intégralement, sans attribution arbitraire aux séances. Les supports élèves doivent être vérifiés avant diffusion.';

  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  function fingerprint(value) {
    const text = canonical(value);
    let first = 2166136261, second = 2246822519;
    for (let i = 0; i < text.length; i++) {
      first = Math.imul(first ^ text.charCodeAt(i), 16777619);
      second = Math.imul(second ^ text.charCodeAt(i), 3266489917);
    }
    return (first >>> 0).toString(16).padStart(8, '0') + (second >>> 0).toString(16).padStart(8, '0');
  }
  function unitsFrom(course) {
    const units = [];
    for (const section of list(course.sections).filter(section => section.kind === 'course')) {
      let current = null;
      for (const block of list(section.blocks)) {
        if (!current || /^Heading 3$/i.test(String(block.style || ''))) {
          current = {
            id: String(course.id) + '-unit-' + (units.length + 1),
            number: units.length + 1,
            title: /^Heading 3$/i.test(String(block.style || '')) ? String(block.text || '') : String(section.title || 'Cours'),
            headingBlock: /^Heading 3$/i.test(String(block.style || '')) ? block : null,
            sectionId: section.id,
            blocks: []
          };
          units.push(current);
        }
        current.blocks.push(block);
      }
    }
    return units;
  }
  function activityFrom(section, verified) {
    const blocks = list(section.blocks);
    // Unknown imports are retained for the teacher, never guessed safe for pupil handouts.
    if (!verified) return { id: section.id, title: section.title, headingBlock: section.headingBlock,
      studentBlocks: [], teacherBlocks: blocks.slice(), allBlocks: blocks.slice(), verified: false };
    const studentBlocks = [], teacherBlocks = [];
    let lastQuestion = null;
    for (const block of blocks) {
      if (/^Réponse attendue(?:\s|$)/u.test(String(block.text || ''))) {
        if (lastQuestion) teacherBlocks.push(lastQuestion);
        teacherBlocks.push(block);
      } else {
        studentBlocks.push(block);
        if (/^Question\s+\d+\b/u.test(String(block.text || ''))) lastQuestion = block;
      }
    }
    return { id: section.id, title: section.title, headingBlock: section.headingBlock,
      studentBlocks, teacherBlocks, allBlocks: blocks.slice(), verified: true };
  }
  function withHeading(section) {
    return (section.headingBlock ? [section.headingBlock] : []).concat(list(section.blocks));
  }
  function studentQuestion(question) {
    // Explicit allowlist: answer keys, correction blocks and arbitrary imported fields stay out.
    return { number: question.number, prompt: question.prompt, type: question.type,
      choices: list(question.choices).map(choice => ({ key: choice.key, text: choice.text, source: choice.source })), source: question.source };
  }
  function makeModel(library, course) {
    const sections = list(course.sections), units = unitsFrom(course), plan = PLANS[course.number];
    const sourceMatches = list(library.sources).some(source => source.id === 'courses' && source.sha256 === SOURCE_SHA256);
    const originalSessions = list(course.sessions);
    const plannedNumbers = plan ? plan.flat() : [];
    const schemaMatches = plan && originalSessions.length === plan.length &&
      plannedNumbers.length === units.length && new Set(plannedNumbers).size === units.length &&
      plannedNumbers.every(number => Number.isInteger(number) && number >= 1 && number <= units.length);
    const isKnownSource = !!(sourceMatches && schemaMatches && fingerprint(course) === FINGERPRINTS[course.number]);
    const byKind = kind => sections.filter(section => section.kind === kind);
    const activities = byKind('case').map(section => activityFrom(section, isKnownSource));
    const quizQuestions = list(course.quizzes).slice();
    const quizStudentBlocks = isKnownSource ? byKind('quiz').flatMap(withHeading) : [];
    const quizTeacherBlocks = byKind('quiz-correction').flatMap(withHeading);
    const common = {
      intro: byKind('intro'), objectives: byKind('objectives'), essentials: byKind('essentials'), references: byKind('references'),
      otherSections: sections.filter(section => !['intro', 'objectives', 'essentials', 'references', 'course', 'case', 'quiz', 'quiz-correction'].includes(section.kind)),
      unassignedUnits: isKnownSource ? [] : units.slice(),
      activities: isKnownSource ? [] : activities.slice(),
      quizQuestions: isKnownSource ? [] : quizQuestions.slice(),
      quizStudentBlocks: [],
      unreviewedQuizBlocks: isKnownSource ? [] : byKind('quiz').flatMap(withHeading),
      quizTeacherBlocks: isKnownSource ? [] : quizTeacherBlocks.slice()
    };
    const sessions = originalSessions.map((session, index) => {
      const last = index === originalSessions.length - 1;
      return {
        ...session, id: String(course.id) + '-session-' + (index + 1),
        number: session.number || index + 1,
        participationPrompt: session.description || '',
        explainUnits: isKnownSource ? plan[index].map(number => units[number - 1]) : [],
        activities: isKnownSource && last ? activities.slice() : [],
        quizQuestions: isKnownSource && last ? quizQuestions.slice() : [],
        quizStudentBlocks: isKnownSource && last ? quizStudentBlocks.slice() : [],
        quizTeacherBlocks: isKnownSource && last ? quizTeacherBlocks.slice() : [],
        proposal: isKnownSource,
        resourceNotice: last ? '' : 'Le cas guidé et le quiz complet sont proposés dans la dernière séance du chapitre. Ils restent accessibles dans les supports du chapitre.'
      };
    });
    const assignedBlocks = sessions.flatMap(session => session.explainUnits.flatMap(unit => unit.blocks));
    const expectedBlocks = byKind('course').flatMap(section => list(section.blocks));
    return {
      isKnownSource, proposalLabel: isKnownSource ? PROPOSAL : UNASSIGNED,
      units, sessions, common, activities, quizQuestions, quizStudentBlocks, quizTeacherBlocks,
      linkedControls: list(library.controls).filter(control => list(control.courseNumbers).includes(course.number)),
      allSections: sections.slice(),
      coverage: {
        courseBlocks: expectedBlocks.length, assignedCourseBlocks: assignedBlocks.length,
        unassignedCourseBlocks: common.unassignedUnits.reduce((sum, unit) => sum + unit.blocks.length, 0),
        allCourseBlocksPreserved: expectedBlocks.length === assignedBlocks.length + common.unassignedUnits.reduce((sum, unit) => sum + unit.blocks.length, 0) &&
          expectedBlocks.every(block => assignedBlocks.includes(block) || common.unassignedUnits.some(unit => unit.blocks.includes(block))),
        quizQuestions: quizQuestions.length,
        assignedQuizQuestions: sessions.reduce((sum, session) => sum + session.quizQuestions.length, 0),
        caseBlocks: activities.reduce((sum, activity) => sum + activity.allBlocks.length, 0)
      }
    };
  }
  function build(library, course) {
    if (!library || !course) throw new Error('Bibliothèque et chapitre nécessaires.');
    // Recheck content even when a caller edits an existing object in place.
    return makeModel(library, course);
  }
  function pupilSheet(library, course, sessionId) {
    const model = build(library, course);
    const title = String(course.title || 'Chapitre EPPCS');
    if (!model.isKnownSource) return { title, blocks: [], warnings: [UNASSIGNED], notice: UNASSIGNED };
    const selected = sessionId === undefined || sessionId === null ? null : model.sessions.find(session => session.id === sessionId);
    if (sessionId != null && !selected) return { title, blocks: [], warnings: ['Séance introuvable.'], notice: 'Séance introuvable.' };
    const activities = selected ? selected.activities : model.activities;
    const quizBlocks = selected ? selected.quizStudentBlocks : model.quizStudentBlocks;
    const result = activities.flatMap(activity => (activity.headingBlock ? [activity.headingBlock] : []).concat(activity.studentBlocks)).concat(quizBlocks);
    const notice = 'Support élève composé des consignes et questions fournies, sans les réponses ni les corrigés. Le cours complet reste dans les ressources du professeur.';
    return { title: title + (selected ? ' · ' + selected.title : ''), blocks: result, warnings: [], notice };
  }
  return Object.freeze({ build, pupilSheet, studentQuestion, fingerprint });
});
