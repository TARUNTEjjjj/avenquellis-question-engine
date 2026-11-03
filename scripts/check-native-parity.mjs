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
    for (const ch of variant) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const id = q.templateId + '-' + (h >>> 0).toString(36);
    const expected = resolveQuestionRef({id,templateId:q.templateId,seed:variant,exam:'ISI',difficulty:'advanced'});
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
console.log(`Verified ${comparisons} native JSON comparisons across every bank family, chapter, track and mock size.`);
