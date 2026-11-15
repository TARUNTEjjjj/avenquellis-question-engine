/** Run both implementations through their public APIs. The native CLI never invokes Node. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {questionBank, generateQuestion, generateMock, resolveQuestionRef, topics, difficulties} from '../src/index.js';

const cli = process.argv[2];
if (!cli) throw Error('Pass a path to the built noether-questions executable.');
let comparisons = 0;
const raw = args => spawnSync(cli, args, {encoding:'utf8', maxBuffer:8 * 1024 * 1024});
function compare(args, expected) {
  const run = raw(args);
  assert.equal(run.status, 0, run.stderr || String(run.error));
  assert.deepEqual(JSON.parse(run.stdout), expected, args.join(' '));
  // deepEqual ignores key order; the serialized text must match as well.
  assert.equal(run.stdout.trimEnd(), JSON.stringify(expected), args.join(' '));
  comparisons++;
}
function reject(args) {
  const run = raw(args);
  assert.equal(run.status, 2, args.join(' '));
  assert.equal(run.stdout, '');
  assert.ok(run.stderr.trim());
}

compare(['bank'], questionBank);
compare(['get', questionBank[1].id], questionBank[1]);
const seeds = ['0', '2', '42', 'exam-November', 'π🌿', "line\nquote\"\\", 'नंबर', ''];
// Verify multiple non-bank variants from every family, including harder proof families.
for (const q of questionBank) {
  for (const seed of seeds) {
    const variant = seed + ':variant';
    let h = 2166136261;
    for (const ch of variant) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    const id = q.templateId + '-' + (h >>> 0).toString(36);
    const expected = resolveQuestionRef({id,templateId:q.templateId,seed:variant,exam:'ISI',difficulty:'advanced',version:q.generator.version});
    assert.ok(expected);
    compare(['replay','--family',q.templateId,'--variant-seed',variant,'--exam','ISI'], expected);
  }
}

for (const topic of topics) {
  for (const difficulty of difficulties) {
    for (const type of ['proof','all']) {
      const opts = {topic,difficulty,type,seed:'practice-39',exam:'CMI'};
      compare(['question','--topic',topic,'--difficulty',difficulty,'--type',type,'--seed',opts.seed], generateQuestion(opts));
    }
  }
  for (const count of [6,12,18]) {
    const opts = {topic,exam:'ISI',count,seed:17};
    compare(['chapter','--topic',topic,'--exam','ISI','--count',String(count),'--seed-number','17'], generateMock(opts));
  }
}
for (const exam of ['CMI','ISI','RMO']) {
  for (const seed of [42, '42', -17, 'π🌿', '']) {
    const args = ['mock','--exam',exam,'--count','30',typeof seed === 'string'?'--seed':'--seed-number',String(seed)];
    compare(args, generateMock({exam,count:30,seed}));
  }
}
// JavaScript validates generator.seed.length in UTF-16 units, including its suffix.
for (const seed of ['😀'.repeat(65), '😀'.repeat(124), '中'.repeat(248)]) {
  const q=generateQuestion({seed});
  const ref={id:q.id,templateId:q.templateId,seed:q.generator.seed,exam:q.exam,difficulty:q.requestedDifficulty,version:q.generator.version};
  assert.deepEqual(resolveQuestionRef(ref),q);
  compare(['question','--seed',seed],q);
  compare(['replay','--family',q.templateId,'--variant-seed',q.generator.seed],q);
}
// Every exam, topic and format at thirty questions: both succeed identically, or both reject a selection
// too small for the count before generating candidates, with the same message.
for (const exam of ['CMI', 'ISI', 'RMO']) for (const topic of ['all', ...topics]) for (const type of ['all', 'proof', 'numeric']) {
  if (exam === 'RMO' && (type === 'numeric' || ['calculus', 'probability'].includes(topic))) continue;
  const args = ['mock', '--exam', exam, '--topic', topic, '--type', type, '--count', '30', '--seed-number', '5'];
  let expected;
  try { expected = generateMock({exam, topic, type, count: 30, seed: 5}); } catch (error) {
    const run = raw(args);
    assert.equal(run.status, 2, args.join(' '));
    assert.equal(run.stderr.trim(), 'avenquellis-questions: ' + error.message, args.join(' '));
    continue;
  }
  compare(args, expected);
}
for (const [topic, type, count] of [['geometry', 'numeric', 9], ['calculus', 'numeric', 11], ['calculus', 'proof', 27]]) {
  compare(['mock', '--topic', topic, '--type', type, '--count', String(count)], generateMock({topic, type, count}));
}
// A generated question can share its family's bank id, and its full reference still resolves.
const shared = generateQuestion({difficulty: 'foundation', type: 'proof', exam: 'CMI', seed: 'u0䁯퇦'});
assert.ok(questionBank.some(q => q.id === shared.id));
compare(['question', '--difficulty', 'foundation', '--type', 'proof', '--exam', 'CMI', '--seed', 'u0䁯퇦'], shared);
compare(['replay', '--family', shared.templateId, '--variant-seed', shared.generator.seed, '--exam', 'CMI', '--difficulty', 'foundation'],
  resolveQuestionRef({id: shared.id, templateId: shared.templateId, seed: shared.generator.seed, exam: shared.exam, difficulty: shared.requestedDifficulty,
    version: shared.generator.version}));
// Supplementary characters that share a UTF-16 high surrogate still give different questions in both engines.
const [tiger, panda] = ['team-🐯', 'team-🐼'].map(seed => {
  const mock = generateMock({seed, count: 12});
  compare(['mock', '--count', '12', '--seed', seed], mock);
  return mock;
});
assert.notEqual(tiger.id, panda.id);
const longestMockSeed = '😀'.repeat(124) + 'a';
compare(['mock','--count','1','--seed',longestMockSeed], generateMock({count:1,seed:longestMockSeed}));
reject(['question','--seed',longestMockSeed]);
reject(['replay','--family','number-gcd','--variant-seed',longestMockSeed+':variant']);
compare(['question'], generateQuestion());
compare(['mock'], generateMock());
compare(['question','--type','numeric','--difficulty','hard'], generateQuestion({type:'numeric',difficulty:'hard'}));
for (const args of [
  ['question','--exam','RMO','--type','numeric'], ['question','--exam','RMO','--topic','probability'],
  ['mock','--count','31'], ['mock','--topic','geometry','--type','numeric','--count','10'],
  ['chapter','--topic','all'], ['question','--difficulty','unknown'], ['question','--type','unknown'],
  ['replay','--family','missing','--variant-seed','test'], ['get','missing'], ['question','--seed-number','0.2'],
  ['question','--seed','a','--seed-number','2'], ['question','--topic'], ['question','--count','1'],
  ['replay','--family','geometry-inradius','--variant-seed','demo','--exam','RMO']
]) reject(args);
// Only a missing selector takes its default. An empty exam, difficulty or type is rejected by both,
// while an empty topic selects every topic.
for (const option of ['exam', 'difficulty', 'type']) {
  reject(['question', '--' + option, '']);
  assert.throws(() => generateQuestion({[option]: ''}), RangeError, option);
}
compare(['question', '--topic', ''], generateQuestion({topic: ''}));
compare(['mock', '--topic', '', '--count', '3'], generateMock({topic: '', count: 3}));
// Only ASCII letters of an exam are uppercased, so ı and ſ do not spell ISI in either engine.
reject(['question', '--exam', 'ıſı']);
assert.throws(() => generateQuestion({exam: 'ıſı'}), /Unknown exam: ıſı/);
compare(['mock', '--exam', 'isi'], generateMock({exam: 'isi'}));
console.log(`Verified ${comparisons} native JSON comparisons across every bank family, chapter, track and mock size.`);
