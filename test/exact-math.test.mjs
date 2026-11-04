import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {initExactMath,evaluateExact,checkExact,exactMathInfo} from '../browser/exact-math.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const build=process.env.AXIOM_BUILD_DIR?resolve(process.env.AXIOM_BUILD_DIR):resolve(root,'work','axiom-build');
mkdirSync(build,{recursive:true});
const vendor=join(root,'vendor/axiom-math');
const native=join(build,'native-driver');
const compile=spawnSync(process.env.CXX||'clang++',['-std=c++20','-O2','-Wall','-Wextra','-Werror','-I',join(vendor,'include'),join(vendor,'src/rational.cpp'),join(vendor,'src/expression.cpp'),join(root,'cpp/bridge.cpp'),join(root,'cpp/native-driver.cpp'),'-o',native],{encoding:'utf8'});
assert.equal(compile.status,0,compile.stderr||String(compile.error));
await initExactMath();
const min=-(1n<<63n),max=(1n<<63n)-1n;
const gcd=(a,b)=>b===0n?(a<0n?-a:a):gcd(b,a%b);
function rational(n,d=1n){if(d===0n)throw Error('division by zero');const g=gcd(n,d);n/=g;d/=g;if(d<0n){n=-n;d=-d;}return {n,d};}
const fits=({n,d})=>n>=min&&n<=max&&d<=max;
const value=({n,d})=>d===1n?String(n):`${n}/${d}`;
function op(a,b,o){return o==='+'?rational(a.n*b.d+b.n*a.d,a.d*b.d):o==='-'?rational(a.n*b.d-b.n*a.d,a.d*b.d):o==='*'?rational(a.n*b.n,a.d*b.d):rational(a.n*b.d,a.d*b.n);}
let state=0x4158494f;
function rand(n){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)%n;}
function small(depth=4){if(depth===0||rand(4)===0){const n=BigInt(rand(61)-30),den=rand(3)===0?10n:1n;const text=den===1n?String(n):`${n<0n?'-':''}${(n<0n?-n:n)/10n}.${(n<0n?-n:n)%10n}`;return {text,q:rational(n,den)};}
 const a=small(depth-1),b=small(depth-1);let operator='+-*/'[rand(4)];if(operator==='/'&&b.q.n===0n)operator='+';const q=op(a.q,b.q,operator);return fits(q)?{text:`(${a.text}${operator}${b.text})`,q}:{text:'1',q:rational(1n)};}
function batchNative(expressions){const result=spawnSync(native,[],{input:expressions.join('\n')+'\n',encoding:'utf8',maxBuffer:50*1024*1024});assert.equal(result.status,0,result.stderr);return result.stdout.trim().split('\n').map(s=>JSON.parse(s));}

test('loaded artifact is WebAssembly and the same original C++ source is pinned',()=>{
 const bytes=readFileSync(join(root,'browser/axiom-math-runtime.wasm'));
 assert.deepEqual([...bytes.subarray(0,8)],[0,97,115,109,1,0,0,0]);assert.ok(WebAssembly.validate(bytes));
 assert.equal(exactMathInfo.implementation,'C++20 compiled to WebAssembly');assert.equal(exactMathInfo.version,'ae5b38257b7825db603ecd5c7b28ade32c1a613f');
});
test('compiled WASM computes exact fractions, decimals, comparisons and worked steps',()=>{
 assert.equal(evaluateExact('0.1+0.2').value,'3/10');assert.equal(evaluateExact('1/3+1/6').value,'1/2');
 assert.deepEqual(checkExact('2/4','.5'),{ok:true,equivalent:true,left:'1/2',right:'1/2'});
 assert.equal(checkExact('1/3','0.333333333333333333').equivalent,false);
 const result=evaluateExact('(1/3 + 1/6) * 4');assert.equal(result.value,'2');
 assert.deepEqual(result.steps.map(s=>[s.expression,s.value]),[['1/3','1/3'],['1/6','1/6'],['1/3 + 1/6','1/2'],['(1/3 + 1/6) * 4','2']]);
});
test('600 generated expressions agree across WASM, native C++, and independent BigInt fractions',()=>{
 const cases=Array.from({length:600},()=>small());const nativeResults=batchNative(cases.map(c=>c.text));
 for(let i=0;i<cases.length;i++){const wasm=evaluateExact(cases[i].text);assert.equal(wasm.ok,true,cases[i].text);assert.equal(wasm.value,value(cases[i].q),cases[i].text);assert.deepEqual(wasm,nativeResults[i],cases[i].text);}
});
test('512 full-width rational cases agree exactly, including required overflow and division errors',()=>{
 const ns=[min,min+1n,-max/2n,-3n,-1n,0n,1n,3n,max/2n,max-1n,max],ds=[1n,2n,3n,1n<<62n,max-2n,max-1n,max];
 const cases=[];
 for(let i=0;i<512;i++){
  const a=rational(ns[rand(ns.length)],ds[rand(ds.length)]),b=i%4===0?a:rational(ns[rand(ns.length)],ds[rand(ds.length)]),operator='+-*/'[i%4];
  const text=`(${a.n}/${a.d})${operator}(${b.n}/${b.d})`;let expected,error;
  try{const q=op(a,b,operator);if(fits(q))expected=value(q);else error='exceeds the signed 64-bit range';}catch{error='division by zero';}
  cases.push({text,expected,error});
 }
 const nativeResults=batchNative(cases.map(c=>c.text));let success=0,overflow=0,domain=0;
 for(let i=0;i<cases.length;i++){
  const c=cases[i],wasm=evaluateExact(c.text);assert.deepEqual(wasm,nativeResults[i],c.text);
  if(c.error){assert.equal(wasm.ok,false,c.text);assert.ok(wasm.error.includes(c.error),`${c.text}: ${wasm.error}`);c.error==='division by zero'?domain++:overflow++;}
  else{assert.equal(wasm.ok,true,c.text);assert.equal(wasm.value,c.expected,c.text);success++;}
 }
 assert.ok(success>0&&overflow>0&&domain>0);
});
test('limits and syntax errors survive compiled exception handling without silent rounding',()=>{
 const invalid=['1/0','1+','2^3','x+x','sqrt(4)','2(3)','1e3','9223372036854775807+1','-9223372036854775808/-1','1/9223372036854775808','0.1234567890123456789','('.repeat(65)+'1'+')'.repeat(65),Array(513).fill('1').join('+')];
 const nativeResults=batchNative(invalid);
 invalid.forEach((expression,i)=>{const result=evaluateExact(expression);assert.equal(result.ok,false,expression);assert.deepEqual(result,nativeResults[i]);assert.ok(Number.isSafeInteger(result.position));});
 assert.equal(evaluateExact('-9223372036854775808').value,'-9223372036854775808');
 assert.equal(evaluateExact('-9223372036854775808 - -9223372036854775808').value,'0');
 assert.equal(evaluateExact('1/0').position,1);assert.equal(checkExact('1','2/0').side,'right');assert.equal(checkExact('2/0','1').side,'left');
 assert.equal(evaluateExact('1'.repeat(4097)).position,4096);assert.equal(evaluateExact('1\0+2').ok,false);assert.equal(evaluateExact(null).ok,false);
 assert.equal(evaluateExact('0.1+0.2').value,'3/10','An error must not poison subsequent calls');
});
test('concurrent initialization shares one module and repeated operations retain exactness',async()=>{
 const infos=await Promise.all([initExactMath(),initExactMath(),initExactMath()]);assert.ok(infos.every(info=>info===exactMathInfo));
 for(let i=0;i<2000;i++)assert.equal(checkExact('1/3+1/6','1/2').equivalent,true);
});
test('engine availability failures are distinguished from invalid arithmetic input',async()=>{
 const fresh=await import('../browser/exact-math.js?uninitialized-test');
 assert.equal(fresh.evaluateExact('1+1').code,'engine_unavailable');
 assert.equal(fresh.checkExact('1','1').code,'engine_unavailable');
 assert.equal(evaluateExact('1/0').code,undefined);
 assert.equal(evaluateExact('1/0').ok,false);
});
