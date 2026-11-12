import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from '../src/server.js';

async function app(t,options={}) {
 const server=createApp(options);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 return {server,url:`http://127.0.0.1:${server.address().port}`};
}
test('practice delivery omits solutions and rubrics without mutating full questions',async t=>{
 const {url}=await app(t);
 const options={seed:'sheet',count:6};
 for(const path of ['/generate','/mock','/bank']) {
  const init=path==='/bank'?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(options)};
  const practice=await (await fetch(`${url}${path}?view=practice`,init)).json();
  const full=await (await fetch(`${url}${path}`,init)).json();
  const hidden=practice.questions||[practice], originals=full.questions||[full];
  assert.deepEqual(hidden.map(q=>q.id),originals.map(q=>q.id));
  hidden.forEach((q,i)=>{
   for(const key of ['solution','answer','rubric','parameters'])assert.equal(Object.hasOwn(q,key),false);
   assert.equal(q.statement,originals[i].statement);
   assert.ok(originals[i].solution);assert.ok(originals[i].rubric);
  });
 }
 assert.equal((await fetch(`${url}/bank?view=typo`)).status,400);
});
test('an unfinished request receives a bounded 408 response and releases its connection',{timeout:2000},async t=>{
 const {url}=await app(t,{bodyTimeoutMs:30});
 const response=await new Promise((resolve,reject)=>{
  const req=http.request(`${url}/generate`,{method:'POST',headers:{'Content-Type':'application/json'}},res=>{
   let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body,connection:res.headers.connection}));
  });
  req.on('error',reject);t.after(()=>req.destroy());req.write('{');
 });
 assert.equal(response.status,408);assert.equal(response.connection,'close');
 assert.match(response.body,/deadline/);
 assert.equal((await fetch(`${url}/health`)).status,200);
});
test('oversized declarations and streamed bodies fail without waiting for EOF',{timeout:2000},async t=>{
 const {url}=await app(t);
 for(const declare of [true,false]) {
  const status=await new Promise((resolve,reject)=>{
   const req=http.request(`${url}/generate`,{method:'POST',headers:{'Content-Type':'application/json',...(declare?{'Content-Length':'20000'}:{})}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
   req.on('error',reject);t.after(()=>req.destroy());req.write(declare?'{':'x'.repeat(16385));
  });
  assert.equal(status,413);
 }
});
