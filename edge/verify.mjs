import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {questionBank,generateQuestion,generateMock,topics} from '../src/index.js';
const dir=resolve(process.argv[2]||'build-edge');
const manifest=JSON.parse(await readFile(resolve(dir,'manifest.json')));
const bytes=await readFile(resolve(dir,manifest.wasm));
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
// The module must trace to its source: in a Git checkout, the recorded commit has to be in HEAD's history.
// A shallow clone lacks older commits, so CI checks out the full history.
const repository=fileURLToPath(new URL('..',import.meta.url));
assert.match(manifest.sourceCommit,/^[0-9a-f]{40}$/);
if(existsSync(resolve(repository,'.git'))) {
  const git=(...args)=>spawnSync('git',args,{cwd:repository,encoding:'utf8'});
  const ancestry=git('merge-base','--is-ancestor',manifest.sourceCommit,'HEAD');
  if(ancestry.error) assert.fail(`Could not run git to check that sourceCommit ${manifest.sourceCommit} is in this checkout's history: ${ancestry.error.message}`);
  // Git exits with 1 when the commit is not an ancestor of HEAD, and with 128 when it cannot find the commit.
  if(ancestry.status!==0) {
    const reason=ancestry.stderr.trim(),shallow=git('rev-parse','--is-shallow-repository').stdout?.trim()==='true';
    assert.fail(`sourceCommit ${manifest.sourceCommit} is not in this checkout's history`+(reason?` (${reason})`:'')+'. '+
      (shallow?'This clone is shallow: fetch the full history with git fetch --unshallow and verify again.':
        'Rebuild the module from a commit in this history, as the README describes.'));
  }
}
// The linked Emscripten, musl and libc++ notices ship beside the module and name its toolchain.
assert.ok((await readFile(resolve(dir,'THIRD-PARTY-NOTICES.txt'),'utf8')).includes('\n'+manifest.toolchain+'\n'));
// Check the adapter's hash before importing it, so a mismatched adapter never runs.
assert.equal(createHash('sha256').update(await readFile(resolve(dir,'adapter.mjs'))).digest('hex'),manifest.adapterSha256);
const {createNativeGenerator}=await import(pathToFileURL(resolve(dir,'adapter.mjs')));
const module=new WebAssembly.Module(bytes);
const imports=WebAssembly.Module.imports(module);
assert.deepEqual(imports,manifest.imports);
assert.deepEqual(imports.map(i=>[i.module,i.name,i.kind]).sort(),['environ_get','environ_sizes_get','fd_close'].map(n=>['wasi_snapshot_preview1',n,'function']).sort());
// deepEqual ignores key order, so also compare the serialized JSON text.
const same=(actual,expected)=>{assert.deepEqual(actual,expected);assert.equal(JSON.stringify(actual),JSON.stringify(expected));};
const engine=createNativeGenerator(module);
same(engine.bank(),questionBank);
// A reference carries its content version and resolves only while the family has that version. A reference
// saved before references carried a version names 0.1.0.
for (const q of questionBank) {
  same(engine.resolve({id:q.id,version:q.generator.version}),q);
  assert.equal(engine.resolve({id:q.id,version:'0.0.0'}),null);
  same(engine.resolve({id:q.id}),q.generator.version==='0.1.0'?q:null);
}
let checks=0;
for (const topic of topics) for(const seed of [1,'π😀','',42,'中'.repeat(240)]) {
  const opts={topic,exam:'CMI',type:'all',seed};
  const q=engine.generate({mode:'question',...opts});
  same(q,generateQuestion(opts));
  same(engine.resolve({id:q.id,seed:q.generator.seed,templateId:q.templateId,exam:q.exam,difficulty:q.requestedDifficulty}),q.generator.version==='0.1.0'?q:null);
  same(engine.resolve({id:q.id,seed:q.generator.seed,templateId:q.templateId,exam:q.exam,difficulty:q.requestedDifficulty,version:q.generator.version}),q);
  assert.equal(engine.resolve({id:q.id,seed:q.generator.seed,templateId:q.templateId,exam:q.exam,difficulty:q.requestedDifficulty,version:'0.0.0'}),null);
  for(const mode of ['chapter','mock']) same(engine.generate({mode,...opts,count:12}),generateMock({...opts,count:12}));
  checks+=4;
}
assert.throws(()=>engine.generate({mode:'question',exam:'RMO',type:'numeric'}),/RMO/);
assert.throws(()=>engine.generate({mode:'mock',topic:'geometry',type:'numeric',count:10}),/distinct/);
assert.throws(()=>engine.generate({mode:'chapter',topic:'all'}),/chapter/);
assert.equal(engine.resolve({id:questionBank[0].id,solution:'forged'}),null);
assert.equal(engine.resolve({id:questionBank[0].id,version:1}),null);
// Seeds over 249 UTF-16 units get the JavaScript and native message; 249 units still fit a one-question mock.
const message=generate=>{try{generate();}catch(error){return error.message;}assert.fail('Expected the seed to be rejected.');};
for(const seed of ['a'.repeat(250),'😀'.repeat(125)]) {
  assert.equal(message(()=>engine.generate({mode:'question',seed})),message(()=>generateQuestion({seed})));
  assert.equal(message(()=>engine.generate({mode:'mock',seed})),message(()=>generateMock({seed})));
}
same(engine.generate({mode:'mock',seed:'a'.repeat(249),count:1}),generateMock({seed:'a'.repeat(249),count:1}));
assert.throws(()=>engine.generate({mode:'question',seed:'\ud800'}),/valid text seed/);
for(const seed of [null,true,{},[],1.5,NaN,Infinity,9007199254740992,'\ud800','\udc00']) {
  assert.equal(message(()=>engine.generate({mode:'question',seed})),message(()=>generateQuestion({seed})));
  assert.equal(message(()=>engine.generate({mode:'mock',seed})),message(()=>generateMock({seed})));
}
for(const seed of [Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,-0,'','�']) {
  same(engine.generate({mode:'question',seed}),generateQuestion({seed}));
  same(engine.generate({mode:'mock',seed,count:2}),generateMock({seed,count:2}));
}
same(engine.generate({mode:'question'}),generateQuestion());
// Only a missing selector or count takes its default. Both reject empty, null and non-string selectors.
for(const change of [{exam:''},{difficulty:''},{type:''},{exam:null},{exam:0},{exam:['isi']},{topic:null},{topic:false},{difficulty:false},{difficulty:['hard']},{type:0}]) {
  for(const [mode,generate] of [['question',generateQuestion],['mock',generateMock]]) {
    assert.throws(()=>engine.generate({mode,...change}),Error,mode+' '+JSON.stringify(change));
    assert.throws(()=>generate(change),Error,mode+' '+JSON.stringify(change));
  }
}
// A present count must be an integer from 1 to 30 in both modes. A single question ignores a valid count.
for(const count of [null,0,31,2.5,'6',NaN,Infinity]) {
  for(const [mode,generate] of [['question',generateQuestion],['mock',generateMock]]) {
    assert.throws(()=>engine.generate({mode,count}),/Count/,mode+' count '+String(count));
    assert.throws(()=>generate({count}),/count/,mode+' count '+String(count));
  }
}
same(engine.generate({mode:'question',count:30}),generateQuestion({count:30}));
same(engine.generate({mode:'question',topic:''}),generateQuestion({topic:''}));
same(engine.generate({mode:'mock',topic:'',count:3}),generateMock({topic:'',count:3}));
// Both also reject unsupported keys and an exam that only Unicode case mapping turns into ISI.
for(const change of [{Seed:'x'},{Count:3},{exam:'ıſı'}]) {
  for(const [mode,generate] of [['question',generateQuestion],['mock',generateMock]]) {
    assert.throws(()=>engine.generate({mode,...change}),Error,mode+' '+JSON.stringify(change));
    assert.throws(()=>generate(change),Error,mode+' '+JSON.stringify(change));
  }
}
// Both reject a selection too small for the count before generating candidates, with the same message.
for(const [topic,type,count] of [['geometry','numeric',10],['calculus','numeric',12],['calculus','proof',28]])
  assert.equal(message(()=>engine.generate({mode:'mock',topic,type,count})),message(()=>generateMock({topic,type,count})));
// A generated question can share its family's bank id, and its full reference still resolves to it.
const shared={difficulty:'foundation',type:'proof',exam:'CMI',seed:'u0䁯퇦'};
same(engine.generate({mode:'question',...shared}),generateQuestion(shared));
const sharedQuestion=generateQuestion(shared);
assert.ok(questionBank.some(q=>q.id===sharedQuestion.id));
same(engine.resolve({id:sharedQuestion.id,templateId:sharedQuestion.templateId,seed:sharedQuestion.generator.seed,exam:sharedQuestion.exam,difficulty:sharedQuestion.requestedDifficulty,version:sharedQuestion.generator.version}),sharedQuestion);
console.log('Verified full bank, 48 bank references, '+checks+' variant/mock/reference comparisons and malformed input recovery.');
