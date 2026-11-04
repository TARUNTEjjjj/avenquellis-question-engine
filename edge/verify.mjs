import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {questionBank,generateQuestion,generateMock,topics} from '../src/index.js';
const dir=resolve(process.argv[2]||'build-edge');
const manifest=JSON.parse(await readFile(resolve(dir,'manifest.json')));
const bytes=await readFile(resolve(dir,manifest.wasm));
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
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
for (const q of questionBank) same(engine.resolve({id:q.id}),q);
let checks=0;
for (const topic of topics) for(const seed of [1,'π😀','',42,'中'.repeat(240)]) {
  const opts={topic,exam:'CMI',type:'all',seed};
  const q=engine.generate({mode:'question',...opts});
  same(q,generateQuestion(opts));
  same(engine.resolve({id:q.id,seed:q.generator.seed,templateId:q.templateId,exam:q.exam,difficulty:q.requestedDifficulty}),q);
  for(const mode of ['chapter','mock']) same(engine.generate({mode,...opts,count:12}),generateMock({...opts,count:12}));
  checks+=4;
}
assert.throws(()=>engine.generate({mode:'question',exam:'RMO',type:'numeric'}),/RMO/);
assert.throws(()=>engine.generate({mode:'mock',topic:'geometry',type:'numeric',count:10}),/distinct/);
assert.throws(()=>engine.generate({mode:'chapter',topic:'all'}),/chapter/);
assert.equal(engine.resolve({id:questionBank[0].id,solution:'forged'}),null);
// Seeds over 249 UTF-16 units get the JavaScript and native message; 249 units still fit a one-question mock.
const message=generate=>{try{generate();}catch(error){return error.message;}assert.fail('Expected the seed to be rejected.');};
for(const seed of ['a'.repeat(250),'😀'.repeat(125)]) {
  assert.equal(message(()=>engine.generate({mode:'question',seed})),message(()=>generateQuestion({seed})));
  assert.equal(message(()=>engine.generate({mode:'mock',seed})),message(()=>generateMock({seed})));
}
same(engine.generate({mode:'mock',seed:'a'.repeat(249),count:1}),generateMock({seed:'a'.repeat(249),count:1}));
assert.throws(()=>engine.generate({mode:'question',seed:'\ud800'}),/valid text seed/);
same(engine.generate({mode:'question'}),generateQuestion());
console.log('Verified full bank, 48 bank references, '+checks+' variant/mock/reference comparisons and malformed input recovery.');
