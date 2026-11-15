import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {connect} from 'node:net';
import {generateQuestion,generateMock,questionBank,topics,resolveQuestionRef,choose} from '../src/index.js';
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
test('only a missing selector or count takes its default, as in the native engine',()=>{
 for(const generate of [generateQuestion,generateMock]) {
  for(const option of ['exam','difficulty','type']) assert.throws(()=>generate({[option]:''}),/^RangeError: Unknown /,option);
  for(const change of [{exam:null},{exam:0},{exam:['isi']},{topic:null},{topic:false},{topic:['algebra']},{difficulty:false},{difficulty:['hard']},{type:0},{type:null}])
   assert.throws(()=>generate(change),/^TypeError: \w+ must be a string\.$/,JSON.stringify(change));
  // Inherited object keys are not difficulty aliases.
  for(const difficulty of ['constructor','toString','__proto__']) assert.throws(()=>generate({difficulty}),{name:'RangeError',message:`Unknown difficulty: ${difficulty}`});
  // A present count must be an integer from 1 to 30, for a single question too, as in the edge API.
  for(const count of [null,0,31,-1,2.5,NaN,Infinity,'6',true,false,[],[3]])
   assert.throws(()=>generate({count}),{name:'RangeError',message:'count must be an integer between 1 and 30'},`${typeof count} ${String(count)}`);
 }
 // A single question ignores a valid count, as question mode in the edge API does.
 for(const count of [1,6,30]) assert.deepEqual(generateQuestion({count}),generateQuestion());
 // An empty topic selects every topic, as "all" does natively.
 assert.deepEqual(generateQuestion({topic:''}),generateQuestion({topic:'all'}));
 assert.deepEqual(generateMock({topic:'',count:3}),generateMock({topic:'all',count:3}));
});
test('all generated seed types can cross the native boundary without coercion or Unicode replacement',()=>{
 for(const seed of [null,true,false,{},[],1.5,NaN,Infinity,-Infinity,9007199254740992,-9007199254740992,'\ud800','\udc00','x\ud800y']) {
  for(const generate of [generateQuestion,generateMock]) assert.throws(()=>generate({seed}),/valid text seed or a safe integer/);
 }
 for(const seed of ['',0,-0,Number.MAX_SAFE_INTEGER,Number.MIN_SAFE_INTEGER,'π😀','�']) {
  const q=generateQuestion({seed});
  assert.deepEqual(resolveQuestionRef(referenceFor(q)),q);
 }
 // A matching ID alone cannot authorize a seed that cannot be encoded as UTF-8.
 const seed='\ud800:variant';let hash=2166136261;
 for(const char of seed)hash=Math.imul(hash^char.charCodeAt(0),16777619);
 assert.equal(resolveQuestionRef({id:`number-gcd-${(hash>>>0).toString(36)}`,templateId:'number-gcd',seed,exam:'CMI',difficulty:'advanced'}),null);
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
test('choose is exact whenever the binomial coefficient is a safe integer',()=>{
 // Rows of Pascal's triangle in BigInt are the oracle.
 let row=[1n];
 for(let n=0;n<=100;n++) {
  for(let k=0;k<=n;k++) if(row[k]<=BigInt(Number.MAX_SAFE_INTEGER)) assert.equal(choose(n,k),Number(row[k]),`C(${n},${k})`);
  row=[1n,...row.slice(1).map((value,i)=>value+row[i]),1n];
 }
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
test('HTTP API decodes a UTF-8 character split across body chunks',async()=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const bytes=new TextEncoder().encode(JSON.stringify({seed:'π-week'})),split=bytes.indexOf(0xcf)+1;
  // Send the two bytes of π in separate chunks.
  const body=new ReadableStream({async start(controller){controller.enqueue(bytes.subarray(0,split));await new Promise(resolve=>setTimeout(resolve,50));controller.enqueue(bytes.subarray(split));controller.close();}});
  const result=await fetch(`http://127.0.0.1:${server.address().port}/generate`,{method:'POST',headers:{'content-type':'application/json'},body,duplex:'half'});
  assert.equal(result.status,200);assert.deepEqual(await result.json(),generateQuestion({seed:'π-week'}));
 } finally {await new Promise(resolve=>server.close(resolve));}
});
test('HTTP decoding refuses malformed bytes and does not echo invalid request contents',async t=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const post=(body,type='application/json')=>fetch(`http://127.0.0.1:${server.address().port}/generate`,{method:'POST',headers:{'Content-Type':type},body});
 for(const body of ['{"seed":S3CRET_PRIVATE_TEXT}',Buffer.concat([Buffer.from('{"seed":"'),Buffer.from([0xc3,0x28]),Buffer.from('"}')])]) {
  const response=await post(body);assert.equal(response.status,400);
  assert.deepEqual(await response.json(),{error:'Malformed UTF-8 JSON request.'});
 }
 assert.equal((await post('{}','application/json-malformed')).status,415);
 assert.equal((await post('{}','Application/JSON; charset=utf-8')).status,200);
 assert.equal((await post('{"seed":1.5}')).status,400);
});
test('HTTP API returns 400 for empty, null and non-string selectors and an invalid count',async t=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const post=(path,body)=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body});
 for(const body of ['{"exam":""}','{"difficulty":""}','{"type":""}','{"exam":["isi"]}','{"difficulty":["hard"]}','{"exam":null,"difficulty":false,"type":0}'])
  assert.equal((await post('/generate',body)).status,400,body);
 for(const path of ['/generate','/mock']) for(const body of ['{"count":null}','{"count":0}','{"count":31}','{"count":"6"}'])
  assert.equal((await post(path,body)).status,400,path+' '+body);
 // A single question ignores a valid count.
 assert.equal((await post('/generate','{"count":6}')).status,200);
});
// Upload on a fresh connection, which Node requests with Connection: close. The first complete
// response or connection error is the outcome.
const upload=(port,start,{path='/generate',type='application/json'}={})=>new Promise(resolve=>{
 let outcome;
 const req=request({host:'127.0.0.1',port,path,method:'POST',agent:false,headers:{'Content-Type':type}},res=>{
  res.on('error',()=>{});res.on('end',()=>{outcome??=res.statusCode;});res.resume();
 });
 req.on('error',error=>{outcome??=error.code;});
 req.on('close',()=>resolve(outcome??'incomplete'));
 start(req);
});
// The same upload on a raw socket, which keeps sending when the reply arrives. Any connection error is
// the outcome, also one that comes after the reply.
const rawUpload=(port,body,{method='POST',path='/generate',type='application/json',chunked=false}={})=>new Promise(resolve=>{
 const socket=connect(port,'127.0.0.1');let text='',failure;
 socket.on('data',data=>{text+=data;});socket.on('error',error=>{failure??=error.code;});
 socket.on('close',()=>resolve(failure??Number(text.slice(9,12))));
 socket.write(`${method} ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Type: ${type}\r\n`);
 if(chunked) {socket.write(`Transfer-Encoding: chunked\r\n\r\n${body.length.toString(16)}\r\n`);socket.write(body);socket.write('\r\n0\r\n\r\n');}
 else {socket.write(`Content-Length: ${body.length}\r\n\r\n`);socket.write(body);}
});
test('HTTP API delivers 413 for an oversized body instead of resetting the upload',async t=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const post=body=>upload(server.address().port,req=>req.end(body));
 assert.equal(await post('{}'+' '.repeat(16382)),200);
 assert.equal(await post('{}'+' '.repeat(16383)),413);
 const outcomes=[];
 for(let i=0;i<20;i++) outcomes.push(await post(Buffer.alloc(1_000_000,' ')));
 assert.deepEqual(outcomes,Array(20).fill(413));
 // The service still reads a body of exactly 8 MiB to its end.
 assert.equal(await post(Buffer.alloc(8*1024*1024,' ')),413);
});
for(const [status,options] of [[404,{path:'/nope'}],[415,{type:'text/plain'}]])
 test(`HTTP API delivers ${status} for a large upload instead of resetting it`,async t=>{
  const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const post=body=>upload(server.address().port,req=>req.end(body),options);
  assert.equal(await post('{}'),status);
  const outcomes=[];
  for(let i=0;i<20;i++) outcomes.push(await post(Buffer.alloc(1_000_000,' ')));
  assert.deepEqual(outcomes,Array(20).fill(status));
  // The service still reads a body of exactly 8 MiB to its end.
  assert.equal(await post(Buffer.alloc(8*1024*1024,' ')),status);
 });
// A refused upload is answered before it has ended, so Node's client above has its status early and stops
// looking. Whether the rest of the upload is still read shows on a socket that keeps sending: if the
// service closed before the body had ended, that socket would be reset. A declared body is refused before
// it is read and a streamed one while it is read, so both kinds are sent.
test('HTTP API reads a refused upload to its end before it closes the connection',async t=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const port=server.address().port,body=Buffer.alloc(1_000_000,' ');
 const stream=options=>upload(port,req=>{req.write(body.subarray(0,65536));req.end(body.subarray(65536));},options);
 for(const [status,options] of [[413,{}],[404,{path:'/nope'}],[415,{type:'text/plain'}]]) {
  for(const chunked of [false,true]) {
   const outcomes=[];
   for(let i=0;i<20;i++) outcomes.push(await rawUpload(port,body,{...options,chunked}));
   assert.deepEqual(outcomes,Array(20).fill(status),`${status}, chunked: ${chunked}`);
   // A body of exactly 8 MiB is still read to its end.
   assert.equal(await rawUpload(port,Buffer.alloc(8*1024*1024,' '),{...options,chunked}),status);
  }
  const outcomes=[];
  for(let i=0;i<20;i++) outcomes.push(await stream(options));
  assert.deepEqual(outcomes,Array(20).fill(status),`${status}, streamed by Node's client`);
 }
});
// The practice view and the resource catalog refuse a large upload in the same way. The catalog also
// answers a GET that carries a body while that body is still arriving.
for(const [status,path,method='POST'] of [[413,'/generate?view=practice'],[413,'/mock?view=practice'],[404,'/bank?view=practice'],[400,'/mock?view=typo'],[405,'/api/resources'],[200,'/api/resources?limit=1','GET']])
 test(`HTTP API delivers ${status} for a large upload to ${method} ${path} instead of resetting it`,async t=>{
  const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port,body=Buffer.alloc(1_000_000,' ');
  for(const chunked of [false,true]) {
   const outcomes=[];
   for(let i=0;i<20;i++) outcomes.push(await rawUpload(port,body,{method,path,chunked}));
   assert.deepEqual(outcomes,Array(20).fill(status),`raw socket, chunked: ${chunked}`);
  }
  assert.equal(await rawUpload(port,Buffer.alloc(8*1024*1024,' '),{method,path}),status);
  // Node's client sends a GET body without a length, which is not a body at all.
  if(method!=='POST') return;
  const outcomes=[];
  for(let i=0;i<20;i++) outcomes.push(await upload(port,req=>req.end(body),{path}));
  assert.deepEqual(outcomes,Array(20).fill(status),"Node's client");
 });
test('HTTP API answers 404 and 415 at once for a request without a body',async t=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 // The first status line written for raw request bytes.
 const status=bytes=>new Promise(resolve=>{
  const socket=connect(server.address().port,'127.0.0.1');let text='';
  socket.on('data',data=>{text+=data;});socket.on('error',()=>{});
  socket.on('close',()=>resolve(Number(text.slice(9,12))));
  socket.end(bytes);
 });
 // Without Content-Length or Transfer-Encoding, the bytes after the head are not a body. Node's
 // http.request sends a GET or DELETE body this way. The 404 or 415 must come before Node's 400 for them,
 // and so must the catalog's 405.
 for(const [expected,head] of [[404,'GET /nope'],[404,'DELETE /generate'],[415,'POST /generate'],[405,'DELETE /api/resources']])
  assert.equal(await status(`${head} HTTP/1.1\r\nHost: localhost\r\nContent-Type: text/plain\r\n\r\n{}`),expected,head);
});
test('HTTP API stops reading an upload that never ends',async t=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const chunk=Buffer.alloc(65536,' '),bound=64*1024*1024;
 // This holds for an unknown path and a wrong content type too.
 for(const options of [{},{path:'/nope'},{type:'text/plain'}]) {
  let sent=0;
  const outcome=await upload(server.address().port,req=>{
   const pump=()=>{
    while(!req.destroyed) {
     if(sent>=bound) return req.destroy();
     sent+=chunk.length;
     if(!req.write(chunk)) return req.once('drain',pump);
    }
   };
   pump();
  },options);
  assert.ok(sent<bound,`${JSON.stringify(options)}: the server read ${sent} bytes and was still reading`);
  assert.notEqual(outcome,200);
 }
 // The reply now comes before the upload is cut off, and Node's client stops sending once it has it. A
 // socket that keeps sending regardless is cut off as well, with the status already delivered.
 const frame=Buffer.concat([Buffer.from('10000\r\n'),chunk,Buffer.from('\r\n')]);
 for(const [status,path,type] of [[413,'/generate','application/json'],[404,'/nope','application/json'],[415,'/generate','text/plain']]) {
  let sent=0;
  const outcome=await new Promise(resolve=>{
   const socket=connect(server.address().port,'127.0.0.1');let text='';
   socket.on('data',data=>{text+=data;});socket.on('error',()=>{});
   socket.on('close',()=>resolve(Number(text.slice(9,12))));
   socket.write(`POST ${path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: ${type}\r\nTransfer-Encoding: chunked\r\n\r\n`);
   const pump=()=>{
    while(!socket.destroyed) {
     if(sent>=bound) return socket.destroy();
     sent+=chunk.length;
     if(!socket.write(frame)) return socket.once('drain',pump);
    }
   };
   pump();
  });
  assert.ok(sent<bound,`${path} ${type}: the server read ${sent} bytes and was still reading`);
  assert.equal(outcome,status);
 }
});
test('HTTP API answers a refused upload that stalls and closes its connection at the body deadline',{timeout:2000},async t=>{
 const server=createApp({bodyTimeoutMs:200});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const head=(path,type)=>`POST ${path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: ${type}\r\n`;
 // One byte of a declared body of 20,000 bytes, or a streamed body one byte past the limit, and then nothing.
 await Promise.all([
  [413,head('/generate','application/json')+'Content-Length: 20000\r\n\r\n{'],
  [413,head('/generate','application/json')+'Transfer-Encoding: chunked\r\n\r\n4001\r\n'+' '.repeat(16385)+'\r\n'],
  [404,head('/nope','application/json')+'Content-Length: 20000\r\n\r\n{'],
  [415,head('/generate','text/plain')+'Content-Length: 20000\r\n\r\n{'],
  [405,head('/api/resources','application/json')+'Content-Length: 20000\r\n\r\n{'],
 ].map(async([status,bytes])=>{
  const started=performance.now();
  const {text,closed}=await new Promise(resolve=>{
   const socket=connect(server.address().port,'127.0.0.1');let text='';
   socket.on('data',data=>{text+=data;});socket.on('error',()=>{});
   socket.on('close',()=>resolve({text,closed:performance.now()-started}));
   socket.write(bytes);
  });
  assert.equal(Number(text.slice(9,12)),status);
  assert.match(text,/\r\nConnection: close\r\n/);
  // The connection stays open for the rest of the upload until the deadline, which the test's timeout bounds.
  assert.ok(closed>=150,`${status}: closed after ${Math.round(closed)} ms`);
 }));
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

// The public helper must not round or silently invent a binomial coefficient.
test('binomial helper handles empty selections, impossible selections and exact safe results',()=>{
 assert.equal(choose(0,0),1);
 assert.equal(choose(3,5),0);
 assert.equal(choose(50,5),2118760);
 assert.equal(choose(56,28),7648690600760440);
 assert.equal(choose(60,5),choose(60,55));
 for(const [n,k] of [[-1,0],[3,-1],[3.5,1],[3,1.5],[Infinity,0],[3,NaN],['3',1]])assert.throws(()=>choose(n,k),RangeError);
 assert.throws(()=>choose(60,30),RangeError);
});
