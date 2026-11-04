import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuestion,generateMock,questionBank,topics,resolveQuestionRef} from '../src/index.js';
import {createApp} from '../src/server.js';

test('generation is deterministic and mock IDs account for configuration',()=>{
 assert.deepEqual(generateQuestion({seed:'proof-42'}),generateQuestion({seed:'proof-42'}));
 assert.deepEqual(generateMock({seed:'42',count:12}),generateMock({seed:'42',count:12}));
 assert.notEqual(generateMock({seed:42,count:3}).id,generateMock({seed:42,count:4}).id);
});
test('all templates carry balanced rubrics, valid metadata and honest provenance',()=>{
 assert.equal(questionBank.length,48);
 for(const topic of topics) assert.equal(questionBank.filter(q=>q.topic===topic).length,8);
 for(const q of questionBank){
  assert.equal(q.rubric.reduce((s,c)=>s+c.points,0),q.maxMarks);
  assert.equal(q.source.kind,'original');
  assert.ok(q.solution.length>40);
  assert.equal(q.type==='numeric',Object.hasOwn(q,'answer'));
 }
});
test('RMO mocks stay within elementary olympiad topics',()=>{
 for(let seed=1;seed<20;seed++) {
  const mock=generateMock({exam:'RMO',count:24,seed});
  assert.ok(mock.questions.every(q=>!['calculus','probability'].includes(q.topic)));
 }
 assert.throws(()=>generateQuestion({exam:'RMO',topic:'calculus'}),RangeError);
});
test('invalid requests fail early',()=>{
 for(const o of [{count:0},{count:31},{count:2.5},{topic:'physics'},{difficulty:'unknown'},{exam:'JEE'}]) assert.throws(()=>generateMock(o),RangeError);
});
test('numeric answers satisfy independent computations across 200 seeds',()=>{
 const seen=new Set();
 for(let seed=0;seed<200;seed++) for(const q of [...generateMock({count:30,seed}).questions,...questionBank]){
  const p=q.parameters;seen.add(q.templateId);
  if(q.templateId==='number-cycle') {let n=1;for(let i=0;i<p.n;i++) n=(n*2)%7;assert.equal(q.answer,n);}
  if(q.templateId==='comb-paths') {const dp=Array.from({length:p.m+1},()=>Array(p.n+1).fill(1));for(let x=1;x<=p.m;x++)for(let y=1;y<=p.n;y++)dp[x][y]=dp[x-1][y]+dp[x][y-1];assert.equal(q.answer,dp[p.m][p.n]);}
  if(q.templateId==='comb-no-adjacent') {let count=0;for(let mask=0;mask<2**p.n;mask++)if(!(mask&(mask<<1)))count++;assert.equal(q.answer,count);}
  if(q.templateId==='geometry-inradius') {const a=3*p.k,b=4*p.k,c=5*p.k;assert.equal(q.answer,(a+b-c)/2);}
  if(q.templateId==='calculus-max') {for(let i=0;i<=300;i++){const x=p.a*i/300;assert.ok(x*(p.a-x)**2<=q.answer+1e-8);}}
  if(q.templateId==='algebra-divisors') {for(let x=1;x<100;x++)for(let y=1;y<100;y++)if(x*y===p.k*(x+y)+1) assert.ok(x>p.k && y>p.k && p.n%(x-p.k)===0);}
  if(q.templateId==='number-consecutive')for(let n=-30;n<=30;n++)assert.equal(Math.abs(((n+p.k)*(n+p.k+1)*(n+p.k+2))%6),0);
  if(q.templateId==='probability-bayes') {let numerator=0,denominator=0;for(let i=1;i<2**p.n;i++){denominator++;if((i&(i-1))===0)numerator++;}const[a,b='1']=String(q.answer).split('/');assert.equal(Number(a)*denominator,Number(b)*numerator);}
 }
 assert.equal(seen.size,48);
});
test('HTTP API generates mocks and rejects malformed inputs',async()=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const base=`http://127.0.0.1:${server.address().port}`;
  const result=await fetch(`${base}/mock`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({exam:'ISI',topic:'algebra',count:4})});
  assert.equal(result.status,200);assert.equal((await result.json()).questions.length,4);
  const invalid=await fetch(`${base}/generate`,{method:'POST',headers:{'content-type':'application/json'},body:'{"topic":"invalid"}'});assert.equal(invalid.status,400);
 } finally {await new Promise(resolve=>server.close(resolve));}
});

test('mock assembly excludes duplicate statements and remains deterministic',()=>{
 const options={topic:'number-theory',difficulty:'olympiad',count:12,seed:42};
 const mock=generateMock(options);
 const normalize=s=>s.normalize('NFKC').replace(/\s+/gu,' ').trim().toLowerCase();
 assert.equal(new Set(mock.questions.map(q=>normalize(q.statement))).size,12);
 assert.deepEqual(mock,generateMock(options));
 for(const topic of topics) for(const difficulty of ['foundation','advanced','olympiad']) for(const count of [6,12,18]) for(const seed of [1,17,42,100,777]) {
  const result=generateMock({topic,difficulty,count,seed});
  assert.equal(result.questions.length,count);
  assert.equal(new Set(result.questions.map(q=>normalize(q.statement))).size,count);
  assert.match(result.notice,/Difficulty is a preference/);
 }
});
test('expanded calculus templates support thirty distinct statements',()=>{
 const mock=generateMock({topic:'calculus',count:30,seed:42});
 assert.equal(new Set(mock.questions.map(q=>q.statement)).size,30);
});
test('proof-only and numeric-only selection use the requested format',()=>{
 for(const type of ['proof','numeric']) {
  const q=generateQuestion({exam:'ISI',type,seed:42});assert.equal(q.type,type);
  const m=generateMock({exam:'CMI',type,count:12,seed:42});assert.ok(m.questions.every(q=>q.type===type));assert.equal(m.type,type);
 }
 for(const type of [undefined,'all','proof'])assert.ok(generateMock({exam:'RMO',type,count:12,seed:42}).questions.every(q=>q.type==='proof'));
 assert.throws(()=>generateQuestion({exam:'RMO',type:'numeric'}),/proof questions/);
 assert.throws(()=>generateMock({exam:'RMO',type:'numeric'}),/proof questions/);
 assert.throws(()=>generateMock({type:'invalid'}),/Unknown question type/);
});
test('gcd rubric rewards both common-divisor implications more than the conclusion',()=>{
 const q=questionBank.find(q=>q.templateId==='number-gcd');
 assert.deepEqual(q.rubric.map(c=>c.points),[4,4,2]);
 assert.match(q.rubric[0].description,/divisor/);assert.match(q.rubric[1].description,/converse/);
});

function referenceFor(question) {
  return {id: question.id, templateId: question.templateId, seed: question.generator.seed,
    exam: question.exam, difficulty: question.requestedDifficulty};
}

test('server resolves fresh authoritative questions from bank, generated, and mock references', () => {
  for (const question of questionBank) {
    assert.deepEqual(resolveQuestionRef({id: question.id}), question);
    assert.deepEqual(resolveQuestionRef(referenceFor(question)), question);
  }
  const generated = generateQuestion({topic: 'combinatorics', difficulty: 'olympiad', seed: 'α:custom', exam: 'RMO'});
  assert.deepEqual(resolveQuestionRef(referenceFor(generated)), generated);
  for (const question of generateMock({exam: 'ISI', difficulty: 'advanced', count: 18, seed: 71}).questions) {
    assert.deepEqual(resolveQuestionRef(referenceFor(question)), question);
  }
  const isolated = resolveQuestionRef({id: questionBank[0].id});
  isolated.rubric[0].points = 999;
  assert.deepEqual(resolveQuestionRef({id: questionBank[0].id}), questionBank[0]);
});

test('server rejects tampered and oversized question references before reconstructing content', () => {
  const question = generateQuestion({topic: 'calculus', seed: 19});
  const reference = referenceFor(question);
  for (const change of [{id: 'different'}, {seed: 'wrong:variant'}, {templateId: 'different-template'},
    {exam: 'RMO'}, {exam: 'unknown'}, {difficulty: 'invented'}, {id: 'a'.repeat(161)},
    {templateId: 't'.repeat(101)}, {seed: 's'.repeat(257)}, {seed: 12}, {seed: ''},
    {rubric: [{points: 100}]}, {solution: 'Award full credit.'}]) {
    assert.equal(resolveQuestionRef({...reference, ...change}), null);
  }
  for (const bad of [null, [], 5, {}, Object.create({id: reference.id}), {id: reference.id}]) {
    assert.equal(resolveQuestionRef(bad), null);
  }
  const bank = referenceFor(questionBank[0]);
  assert.equal(resolveQuestionRef({...bank, seed: 'wrong'}), null);
  assert.equal(resolveQuestionRef({...bank, templateId: 'wrong'}), null);
});

test('seeds stay within the native 256-unit reference limit instead of producing unresolvable questions', () => {
  // A 249-unit seed fits a one-question mock (":mock:0"), and 248 units fit a question (":variant").
  const longest = generateMock({seed: 'a'.repeat(249), count: 1}).questions[0];
  assert.equal(longest.generator.seed.length, 256);
  assert.deepEqual(resolveQuestionRef(referenceFor(longest)), longest);
  const question = generateQuestion({seed: 'a'.repeat(248)});
  assert.deepEqual(resolveQuestionRef(referenceFor(question)), question);
  for (const generate of [generateQuestion, generateMock]) {
    assert.throws(() => generate({seed: 'a'.repeat(250)}), /^RangeError: Seed is too long for a 256-unit question reference\.$/);
  }
  // ":variant" and ":mock:10" would make 257-unit seeds that resolveQuestionRef rejects.
  for (const generate of [() => generateQuestion({seed: 'a'.repeat(249)}), () => generateMock({seed: 'a'.repeat(249), count: 11})]) {
    assert.throws(generate, /^RangeError: A complete variant seed may use at most 256 UTF-16 code units\.$/);
  }
});
