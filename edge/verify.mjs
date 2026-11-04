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
same(engine.generate({mode:'question'}),generateQuestion());
console.log('Verified full bank, 48 bank references, '+checks+' variant/mock/reference comparisons and malformed input recovery.');
