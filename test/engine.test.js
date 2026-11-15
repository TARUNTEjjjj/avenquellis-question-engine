import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,rmdirSync,symlinkSync,unlinkSync,writeFileSync} from 'node:fs';
import {Agent,request} from 'node:http';
import {connect} from 'node:net';
import {devNull,tmpdir} from 'node:os';
import {delimiter,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateQuestion,generateMock,questionBank,topics,resolveQuestionRef,choose,getQuestion,internals} from '../src/index.js';
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
test('options must be a plain object with supported keys, as in the edge API and CLI',()=>{
 for(const generate of [generateQuestion,generateMock]) {
  for(const options of ['week-1',42,true,null,[],['week-1'],new Date(0),new Map(),Object.create({seed:'week-1'})])
   assert.throws(()=>generate(options),{name:'TypeError',message:'Options must be a plain object.'},String(options));
  // A misspelled or unsupported key no longer falls back to seed 1 and count 6.
  for(const key of ['Seed','Count','Topic','questions','level','mode'])
   assert.throws(()=>generate({seed:'student-17',[key]:'x'}),{name:'TypeError',message:`Unsupported option: ${key}`});
 }
 assert.deepEqual(generateQuestion(Object.assign(Object.create(null),{seed:'week-1'})),generateQuestion({seed:'week-1'}));
 assert.deepEqual(generateMock(),generateMock({}));
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
test('only the ASCII letters of an exam are uppercased, as natively',()=>{
 // toUpperCase() also turns ı into I and ſ into S, so 'ıſı' would select ISI, which the native engine rejects.
 for(const generate of [generateQuestion,generateMock]) assert.throws(()=>generate({exam:'ıſı'}),{name:'RangeError',message:'Unknown exam: ıſı'});
 // A lowercase ASCII exam is still accepted.
 assert.deepEqual(generateMock({exam:'isi'}),generateMock({exam:'ISI'}));
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
 for(const char of seed)hash=Math.imul(hash^char.codePointAt(0),16777619);
 assert.equal(resolveQuestionRef({id:`number-gcd-${(hash>>>0).toString(36)}`,templateId:'number-gcd',seed,exam:'CMI',difficulty:'advanced',version:familyVersion('number-gcd')}),null);
});
test('seeds differing only in a supplementary character produce different questions',()=>{
 // Each pair shares a UTF-16 high surrogate, which the seed hash once used in place of the code point.
 for(const [a,b] of [['team-🐯','team-🐼'],['😀','🚀'],['𠀀','𠏿']]) {
  const [ma,mb]=[a,b].map(seed=>generateMock({seed,count:12}));
  assert.notEqual(ma.id,mb.id);
  assert.notDeepEqual(ma.questions.map(q=>q.statement),mb.questions.map(q=>q.statement));
  assert.notEqual(generateQuestion({seed:a}).id,generateQuestion({seed:b}).id);
 }
 const ids=new Set();
 for(let cp=0x1f400;cp<=0x1f7ff;cp++) ids.add(generateQuestion({seed:'team-'+String.fromCodePoint(cp)}).id);
 assert.equal(ids.size,1024);
 // A reference issued by an earlier release, under the old hash, still resolves to its original question.
 const legacy={id:'probability-indicators-bo56kn',templateId:'probability-indicators',seed:'😀'.repeat(65)+':variant',exam:'CMI',difficulty:'advanced',version:familyVersion('probability-indicators')};
 const restored=resolveQuestionRef(legacy);
 assert.equal(restored.id,legacy.id);assert.equal(restored.generator.seed,legacy.seed);assert.deepEqual(restored.parameters,{n:9});
 assert.equal(generateQuestion({seed:'😀'.repeat(65)}).id,'advanced-probability-hidden-urn-8cn5f4');
 // The legacy id is accepted only with a seed that the earlier release hashed to it.
 for(const seed of ['🎉'.repeat(65)+':variant','a'.repeat(65)+':variant']) assert.equal(resolveQuestionRef({...legacy,seed}),null);
});
test('numeric answers satisfy independent computations across 200 seeds',()=>{
 // Every numeric family needs an oracle here that computes its answer key another way. Some read the
 // statement, so that they check the key against the numbers the learner sees.
 const read=(statement,pattern)=>{const match=pattern.exec(statement);assert.ok(match,statement);return match.slice(1).map(Number);};
 const gcd=(a,b)=>b?gcd(b,a%b):Math.abs(a),fraction=(n,d)=>{const g=gcd(n,d);return d/g===1?`${n/g}`:`${n/g}/${d/g}`;};
 const oracles={
  'algebra-cubes':q=>{
   // Newton's identities give the power sum p₃ from the elementary symmetric sums in the statement.
   const [e1,e2,e3]=read(q.statement,/x \+ y \+ z = (\d+), xy \+ yz \+ zx = (\d+), and xyz = (\d+)\./);
   const p1=e1,p2=e1*p1-2*e2;assert.equal(q.answer,e1*p2-e2*p1+3*e3);
  },
  'number-cycle':(q,p)=>{let n=1;for(let i=0;i<p.n;i++) n=(n*2)%7;assert.equal(q.answer,n);},
  'comb-paths':(q,p)=>{const dp=Array.from({length:p.m+1},()=>Array(p.n+1).fill(1));for(let x=1;x<=p.m;x++)for(let y=1;y<=p.n;y++)dp[x][y]=dp[x-1][y]+dp[x][y-1];assert.equal(q.answer,dp[p.m][p.n]);},
  'comb-no-adjacent':(q,p)=>{let count=0;for(let mask=0;mask<2**p.n;mask++)if(!(mask&(mask<<1)))count++;assert.equal(q.answer,count);},
  'geometry-inradius':(q,p)=>{const a=3*p.k,b=4*p.k,c=5*p.k;assert.equal(q.answer,(a+b-c)/2);},
  'calculus-max':q=>{
   // A grid of spacing a/N comes within a³/(2N²) of the maximum, because |f″| ≤ 4a on [0,a]. So the key must
   // bound every grid value and exceed the largest by no more than that.
   const [a,end]=read(q.statement,/f\(x\)=x\((\d+)−x\)² on the closed interval \[0,(\d+)\]\./),N=3000;
   assert.equal(end,a);
   let best=0;for(let i=0;i<=N;i++){const x=a*i/N;best=Math.max(best,x*(a-x)**2);}
   assert.ok(best<=q.answer+1e-8&&q.answer<=best+a**3/(2*N*N),`${q.answer} for a=${a}`);
  },
  'calculus-integral':q=>{
   // Integrate x^n − x^(n+1) term by term, ∫₀¹ x^k dx = 1/(k+1), in exact fractions.
   const [n]=read(q.statement,/∫₀¹ x\^(\d+)\(1−x\) dx\./);
   let numerator=0,denominator=1;
   for(const [coefficient,k] of [[1,n],[-1,n+1]]) [numerator,denominator]=[numerator*(k+1)+coefficient*denominator,denominator*(k+1)];
   assert.equal(q.answer,fraction(numerator,denominator));
  },
  'probability-urn':q=>{
   // Count the equally likely ordered pairs of distinct balls.
   const [red,blue]=read(q.statement,/holds (\d+) red and (\d+) blue balls\. Two balls are drawn uniformly without replacement\./);
   let good=0,all=0;for(let x=0;x<red+blue;x++)for(let y=0;y<red+blue;y++)if(x!==y){all++;if(x<red&&y<red)good++;}
   assert.equal(q.answer,fraction(good,all));
  },
  'probability-bayes':(q,p)=>{let numerator=0,denominator=0;for(let i=1;i<2**p.n;i++){denominator++;if((i&(i-1))===0)numerator++;}const[a,b='1']=String(q.answer).split('/');assert.equal(Number(a)*denominator,Number(b)*numerator);},
 };
 const seen=new Set(),checked=new Set();
 for(let seed=0;seed<200;seed++) for(const q of [...generateMock({count:30,seed}).questions,...questionBank]){
  const p=q.parameters;seen.add(q.templateId);
  if(q.type==='numeric') {
   assert.ok(Object.hasOwn(oracles,q.templateId),`${q.templateId} has no independent answer check`);
   oracles[q.templateId](q,p);checked.add(q.templateId);
  }
  if(q.templateId==='algebra-divisors') {for(let x=1;x<100;x++)for(let y=1;y<100;y++)if(x*y===p.k*(x+y)+1) assert.ok(x>p.k && y>p.k && p.n%(x-p.k)===0);}
  if(q.templateId==='number-consecutive')for(let n=-30;n<=30;n++)assert.equal(Math.abs(((n+p.k)*(n+p.k+1)*(n+p.k+2))%6),0);
 }
 assert.equal(seen.size,48);
 assert.deepEqual([...checked].sort(),Object.keys(oracles).sort());
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
test('HTTP API returns 400 for unsupported keys and for an exam that is not ASCII',async t=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const post=(path,body)=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body});
 assert.equal((await post('/generate','{"exam":"ıſı"}')).status,400);
 for(const path of ['/generate','/mock']) for(const body of ['{"exam":"ISI","Count":12,"Seed":"week-1"}','{"mode":"mock","count":12,"seed":"week-1"}'])
  assert.equal((await post(path,body)).status,400,path+' '+body);
 const misspelled=await post('/mock','{"Seed":"student-17","exam":"ISI"}');
 assert.equal(misspelled.status,400);assert.deepEqual(await misspelled.json(),{error:'Unsupported option: Seed'});
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
test('HTTP API delivers a refusal although the body that follows is malformed',async t=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 // The whole answer to raw request bytes that are sent at once.
 const answer=bytes=>new Promise(resolve=>{
  const socket=connect(server.address().port,'127.0.0.1');let text='';
  socket.on('data',data=>{text+=data;});socket.on('error',()=>{});
  socket.on('close',()=>resolve(text));
  socket.write(bytes);
 });
 // Node closes the connection for a chunk size that is not hexadecimal. The refusal was sent before that,
 // also when the bytes arrive together with the head. The 413 of a chunked upload comes only after more
 // than 16 KB of valid body, so it is not among these.
 for(const [status,path,type] of [[404,'/nope','application/json'],[415,'/generate','text/plain'],[405,'/api/resources','application/json']]) {
  const [head,body]=(await answer(`POST ${path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: ${type}\r\nTransfer-Encoding: chunked\r\n\r\nzz\r\n`)).split('\r\n\r\n');
  // The client has the whole refusal: its status, the notice that the connection closes, and the JSON error.
  assert.match(head,new RegExp(`^HTTP/1\\.1 ${status} `),path);
  assert.match(head,/\r\nConnection: close(\r\n|$)/);
  assert.equal(typeof JSON.parse(body).error,'string');
 }
});
// The resource catalog's 405 goes out through the same reply as the other refusals. A client that never stops
// sending still gets each refusal whole, and the service stops reading its upload.
test('HTTP API delivers the whole refusal, the catalog\'s 405 too, to an upload that never ends',async t=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const frame=Buffer.concat([Buffer.from('10000\r\n'),Buffer.alloc(65536,' '),Buffer.from('\r\n')]),bound=64*1024*1024;
 for(const [status,path,type] of [[413,'/generate','application/json'],[404,'/nope','application/json'],[415,'/generate','text/plain'],[405,'/api/resources','application/json']]) {
  const {answer,sent}=await new Promise(resolve=>{
   const socket=connect(server.address().port,'127.0.0.1');let answer='';
   socket.on('data',data=>{answer+=data;});socket.on('error',()=>{});
   socket.on('close',()=>resolve({answer,sent:socket.bytesWritten}));
   socket.write(`POST ${path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: ${type}\r\nTransfer-Encoding: chunked\r\n\r\n`);
   const pump=()=>{
    while(!socket.destroyed) {
     if(socket.bytesWritten>=bound) return socket.destroy();
     if(!socket.write(frame)) return socket.once('drain',pump);
    }
   };
   pump();
  });
  assert.ok(sent<bound,`${status}: the server read ${sent} bytes and was still reading`);
  // The client has the whole refusal although it never stopped sending.
  const [head,body]=answer.split('\r\n\r\n');
  assert.match(head,new RegExp(`^HTTP/1\\.1 ${status} `),path);
  assert.match(head,/\r\nConnection: close(\r\n|$)/);
  assert.equal(typeof JSON.parse(body).error,'string');
 }
});
test('HTTP API keeps a keep-alive client working after an oversized body',async t=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 // One connection at a time, reused as fetch and Python's http.client reuse it.
 const agent=new Agent({keepAlive:true,maxSockets:1});
 t.after(()=>{agent.destroy();return new Promise(resolve=>server.close(resolve));});
 // The outcome, the answer's Connection header, and whether the request went out on the previous
 // request's connection.
 const exchange=(method,path,body)=>new Promise(resolve=>{
  let outcome,connection;
  const req=request({host:'127.0.0.1',port:server.address().port,path,method,agent,headers:body===undefined?{}:{'Content-Type':'application/json'}},res=>{
   connection=res.headers.connection;res.on('error',()=>{});res.on('end',()=>{outcome??=res.statusCode;});res.resume();
  });
  req.on('error',error=>{outcome??=error.code;});
  req.on('close',()=>resolve([outcome??'incomplete',connection,req.reusedSocket]));
  req.end(body);
 });
 const post=body=>exchange('POST','/generate',body);
 assert.deepEqual(await post('{"seed":1}'),[200,'keep-alive',false]);
 assert.deepEqual(await post('{"seed":1}'),[200,'keep-alive',true]);
 // A request without a body is complete when it arrives, so its answer, a refusal too, keeps the connection.
 assert.deepEqual(await exchange('GET','/health'),[200,'keep-alive',true]);
 assert.deepEqual(await exchange('GET','/nope'),[404,'keep-alive',true]);
 // The 413 once left its connection open but unread, so the next valid request on it waited six seconds
 // and was reset. The 413 now says that its connection closes, so the client sends that request on a new one.
 assert.deepEqual(await post(Buffer.alloc(200_000,' ')),[413,'close',true]);
 assert.deepEqual(await post('{"seed":1}'),[200,'keep-alive',false]);
 // The same holds past 8 MiB, where the service stops reading the upload.
 assert.deepEqual(await post(Buffer.alloc(9*1024*1024,' ')),[413,'close',true]);
 assert.deepEqual(await post('{"seed":1}'),[200,'keep-alive',false]);
 assert.deepEqual(await post('{"seed":1}'),[200,'keep-alive',true]);
});
test('the HTTP service starts when its path goes through a symlink',async t=>{
 // As in a deployment where current links to releases/N. The service once compared argv[1] as given with
 // its own real path, so it exited with status 0 without listening.
 const directory=mkdtempSync(join(tmpdir(),'avenquellis-')),link=join(directory,'current');
 symlinkSync(fileURLToPath(new URL('..',import.meta.url)),link,'junction');
 t.after(()=>{unlinkSync(link);rmdirSync(directory);});
 // Node also finds the script without its extension.
 for(const script of [join(link,'src','server.js'),join(link,'src','server')]) {
  const child=spawn(process.execPath,[script],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
  const output=await new Promise(resolve=>{
   let text='';const timer=setTimeout(()=>child.kill(),10_000);
   child.stdout.on('data',data=>{text+=data;if(text.includes('\n'))child.kill();});
   child.on('close',()=>{clearTimeout(timer);resolve(text);});
  });
  assert.match(output,/^Avenquellis question engine: http:\/\/127\.0\.0\.1:\d+\n$/,script);
 }
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
test('impossible mock selections are rejected before generating candidates, as natively',()=>{
 for(const exam of ['CMI','ISI']) for(const [topic,type,capacity] of [['geometry','numeric',9],['calculus','numeric',11],['calculus','proof',27]]) {
  assert.equal(new Set(generateMock({exam,topic,type,count:capacity}).questions.map(q=>q.statement)).size,capacity);
  for(const count of [capacity+1,30]) assert.throws(()=>generateMock({exam,topic,type,count}),{name:'RangeError',message:`At most ${capacity} distinct statements exist in this selection. Reduce count or select mixed topics.`});
 }
 // No selection reaches the end of the bounded retry loop: it is either large enough or rejected up front.
 for(const exam of ['CMI','ISI','RMO']) for(const topic of ['all',...topics]) for(const type of ['all','proof','numeric']) {
  let mock;
  try { mock=generateMock({exam,topic,type,count:30}); } catch(error) { assert.match(error.message,/^(At most \d+ distinct statements exist|RMO )/); continue; }
  assert.equal(mock.questions.length,30);
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
test('getQuestion returns a fresh copy that a caller can edit without changing the bank',()=>{
 const index=questionBank.findIndex(q=>q.type==='numeric'),id=questionBank[index].id,before=structuredClone(questionBank[index]);
 const view=getQuestion(id);
 assert.deepEqual(view,before);assert.notEqual(view,questionBank[index]);
 // A learner-safe view stripped in place, with learner data attached.
 delete view.answer;delete view.solution;view.rubric.length=0;view.learnerResponse='private draft';
 assert.deepEqual(questionBank[index],before);
 assert.deepEqual(getQuestion(id),before);
 for(const missing of ['missing',questionBank[index].templateId,undefined]) assert.equal(getQuestion(missing),null);
});
test('gcd rubric rewards both common-divisor implications more than the conclusion',()=>{
 const q=questionBank.find(q=>q.templateId==='number-gcd');
 assert.deepEqual(q.rubric.map(c=>c.points),[4,4,2]);
 assert.match(q.rubric[0].description,/divisor/);assert.match(q.rubric[1].description,/converse/);
});

// The reference that README.md tells an integration to save, version included.
function referenceFor(question) {
  return {id: question.id, templateId: question.templateId, seed: question.generator.seed,
    exam: question.exam, difficulty: question.requestedDifficulty, version: question.generator.version};
}
// The content version that a family has now, for references that the tests write by hand.
function familyVersion(templateId) {
  return questionBank.find(question => question.templateId === templateId).generator.version;
}

test('server resolves fresh authoritative questions from bank, generated, and mock references', () => {
  for (const question of questionBank) {
    assert.deepEqual(resolveQuestionRef({id: question.id, version: question.generator.version}), question);
    assert.deepEqual(resolveQuestionRef(referenceFor(question)), question);
  }
  const generated = generateQuestion({topic: 'combinatorics', difficulty: 'olympiad', seed: 'α:custom', exam: 'RMO'});
  assert.deepEqual(resolveQuestionRef(referenceFor(generated)), generated);
  for (const question of generateMock({exam: 'ISI', difficulty: 'advanced', count: 18, seed: 71}).questions) {
    assert.deepEqual(resolveQuestionRef(referenceFor(question)), question);
  }
  const first = {id: questionBank[0].id, version: questionBank[0].generator.version};
  const isolated = resolveQuestionRef(first);
  isolated.rubric[0].points = 999;
  assert.deepEqual(resolveQuestionRef(first), questionBank[0]);
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
  for (const change of [{seed: 'bank:2'}, {exam: 'ISI'}, {difficulty: 'olympiad'}, {seed: 'wrong:variant', exam: 'ISI'}]) {
    assert.equal(resolveQuestionRef({...bank, ...change}), null, JSON.stringify(change));
  }
});

test('a generated question whose id equals its family bank id resolves from its full reference', () => {
  // Each seed hashes like the family's bank seed, so the generated id is the bank id.
  const bankIds = new Set(questionBank.map(q => q.id));
  for (const [options, seed] of [[{difficulty: 'foundation', type: 'proof', exam: 'CMI'}, 'u0䁯퇦'],
    [{topic: 'combinatorics', difficulty: 'foundation', type: 'numeric', exam: 'ISI'}, 'g0男쵀'],
    [{topic: 'number-theory', difficulty: 'advanced', exam: 'RMO'}, 'g0㎦힘']]) {
    const question = generateQuestion({...options, seed});
    assert.ok(bankIds.has(question.id), seed);
    assert.deepEqual(resolveQuestionRef(referenceFor(question)), question);
    // The id and version alone still name the bank edition.
    assert.deepEqual(resolveQuestionRef({id: question.id, version: question.generator.version}), questionBank.find(q => q.id === question.id));
  }
  const mock = generateMock({exam: 'CMI', difficulty: 'advanced', count: 6, seed: 'g0⺖긪'});
  assert.equal(mock.questions.filter(q => bankIds.has(q.id)).length, 1);
  for (const question of mock.questions) assert.deepEqual(resolveQuestionRef(referenceFor(question)), question);
});

test('a saved reference carries its content version and resolves only to that content', () => {
  // As saved before references carried a version.
  const unversioned = question => {
    const {version, ...reference} = referenceFor(question);
    return reference;
  };
  for (const question of [...questionBank, generateQuestion({seed: 'week-1'}),
    ...generateMock({exam: 'ISI', count: 18, seed: 'week-1'}).questions]) {
    const {version} = question.generator;
    assert.deepEqual(resolveQuestionRef(referenceFor(question)), question);
    // A release that changes a family's draws, text, answer or rubric gives the family a new version. A
    // reference to the earlier content then resolves to null rather than to the changed question.
    for (const other of ['0.0.0', '0.1', '', `${version} `, `${version}.1`, 1, null, [version]])
      assert.equal(resolveQuestionRef({...referenceFor(question), version: other}), null, JSON.stringify(other));
    // A reference saved before references carried a version names 0.1.0.
    assert.deepEqual(resolveQuestionRef(unversioned(question)), version === '0.1.0' ? question : null);
  }
  for (const question of questionBank) {
    const {version} = question.generator;
    assert.deepEqual(resolveQuestionRef({id: question.id, version}), question);
    assert.equal(resolveQuestionRef({id: question.id, version: '0.0.0'}), null);
    assert.deepEqual(resolveQuestionRef({id: question.id}), version === '0.1.0' ? question : null);
  }
});

// Each family's variants through the public resolver: those of the first 1000 variant seeds, then further seeds
// until the sample holds every distinct statement that the family can produce, which maxVariants (max_variants
// natively) counts. Shared by the three tests below, which need the whole of each family.
let samples;
function familySamples() {
  samples ??= sampleFamilies();
  return samples;
}
function sampleFamilies() {
  const found = new Map(), limits = new Map(internals.families.map(family => [family.key, family.maxVariants]));
  for (const {templateId, generator: {version}} of questionBank) {
    const digest = createHash('sha256'), statements = new Set(), later = [], limit = limits.get(templateId);
    let i = 0;
    for (; i < 1000 || (statements.size < limit && i < 100000); i++) {
      const seed = `${i}:variant`;
      let h = 2166136261;
      for (const char of seed) h = Math.imul(h ^ char.codePointAt(0), 16777619);
      const q = resolveQuestionRef({id: `${templateId}-${(h >>> 0).toString(36)}`, templateId, seed, exam: 'ISI', difficulty: 'advanced', version});
      const content = JSON.stringify([q.title, q.statement, q.topic, q.difficulty, q.type, q.maxMarks, q.solution,
        q.rubric.map(c => [c.id, c.description, c.points]), q.answer ?? null, Object.entries(q.parameters).sort()]);
      // The fingerprint covers the first 1000 seeds in order, then each statement that only later seeds reach,
      // so a larger family adds seeds without changing the fingerprints already recorded.
      if (i < 1000) digest.update(content);
      else if (!statements.has(q.statement)) later.push(content);
      statements.add(q.statement);
    }
    for (const content of later.sort()) digest.update(content);
    assert.equal(statements.size, limit, `${templateId}: ${i} seeds reach ${statements.size} of its ${limit} distinct statements`);
    found.set(templateId, {version, fingerprint: digest.digest('hex').slice(0, 16), statements});
  }
  return found;
}

test('the sampled seeds reach every distinct statement of every family', () => {
  assert.deepEqual([...familySamples().keys()], internals.families.map(family => family.key));
});

// Every family@version that a release has carried, with the fingerprint of its content over all of its statements.
// Saved references resolve only to the content of their version, so an entry never changes and is never removed.
// After changing a family's draws, text, answer or rubric, give it a new version in both catalogs
// (src/index.js or src/advanced-templates.js, and src/native/catalog.cpp) and add an entry for that version,
// keeping the old one. check.yml runs scripts/check-content-versions.mjs, which fails when an entry changes.
const contentFingerprints = JSON.parse(readFileSync(new URL('content-fingerprints.json', import.meta.url), 'utf8'));
test('each family\'s content is pinned to its version', () => {
  for (const [templateId, {version, fingerprint}] of familySamples()) {
    const key = `${templateId}@${version}`;
    assert.ok(Object.hasOwn(contentFingerprints, key), `test/content-fingerprints.json has no entry for ${key}: add "${key}": "${fingerprint}".`);
    assert.equal(fingerprint, contentFingerprints[key], `${key} changed under its version: give the family a new version in both catalogs and add an entry for it.`);
  }
});

test('no two distinct statements share the key that mock assembly deduplicates on', () => {
  // generateMock skips a statement whose key it has already used, and the native generate_mock one it has
  // already used verbatim. The two engines assemble the same mock only while distinct statements have
  // distinct keys. A family printing both 5⁸⁸ and 58⁸, which normalize to 588, would make their mocks differ.
  const owners = new Map();
  for (const [templateId, {statements}] of familySamples()) {
    for (const statement of statements) {
      const key = internals.statementKey(statement), other = owners.get(key);
      assert.ok(!other || other.statement === statement, `${other?.templateId}: "${other?.statement}" and ${templateId}: "${statement}"`);
      owners.set(key, {templateId, statement});
    }
  }
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

test('a checkout with Windows line endings keeps the bytes that the release and vendored sources pin',t=>{
 // Git for Windows checks text out with CRLF by default (core.autocrlf=true). edge/verify.mjs, the exact-math
 // build and the notice checks compare exact bytes, so .gitattributes keeps LF on every platform.
 const root=fileURLToPath(new URL('..',import.meta.url));
 if(!existsSync(join(root,'.git'))) return t.skip('not a Git checkout');
 const directory=mkdtempSync(join(tmpdir(),'avenquellis-'));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const checkout=spawnSync('git',['-c','core.autocrlf=true','checkout-index','--all',`--prefix=${directory}/`],{cwd:root,encoding:'utf8'});
 assert.equal(checkout.status,0,checkout.stderr||String(checkout.error));
 const read=file=>readFileSync(join(directory,file)),sha=file=>createHash('sha256').update(read(file)).digest('hex');
 const provenance=JSON.parse(read('vendor/axiom-math/PROVENANCE.json')),manifest=JSON.parse(read('release/edge/manifest.json'));
 for(const [file,hash] of Object.entries(provenance.files)) assert.equal(sha(`vendor/axiom-math/${file}`),hash,file);
 assert.equal(sha('release/edge/adapter.mjs'),manifest.adapterSha256);
 assert.equal(sha(`release/edge/${manifest.wasm}`),manifest.sha256);
 for(const file of ['edge','release/edge','browser'].map(folder=>`${folder}/THIRD-PARTY-NOTICES.txt`))
  assert.ok(read(file).toString().includes(`\n${manifest.toolchain}\n`),file);
});

// A scratch Git repository holding the given files in one commit, isolated from the user's Git configuration and
// from any repository around it. run starts a command there with the running Node first on PATH.
function scratchRepository(t,files,environment={}) {
 const directory=realpathSync(mkdtempSync(join(tmpdir(),'avenquellis-')));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const env={...process.env,...environment,GIT_CONFIG_GLOBAL:devNull,GIT_CONFIG_NOSYSTEM:'1',GIT_CEILING_DIRECTORIES:dirname(directory),
  GIT_AUTHOR_NAME:'test',GIT_AUTHOR_EMAIL:'test@example.com',GIT_COMMITTER_NAME:'test',GIT_COMMITTER_EMAIL:'test@example.com',
  PATH:dirname(process.execPath)+delimiter+process.env.PATH};
 const write=(file,text)=>{mkdirSync(dirname(join(directory,file)),{recursive:true});writeFileSync(join(directory,file),text);};
 const run=(command,...args)=>spawnSync(command,args,{cwd:directory,env,encoding:'utf8'});
 const git=(...args)=>{const result=run('git',...args);assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
 for(const [file,text] of Object.entries(files)) write(file,text);
 git('init','-q');git('add','-A');git('commit','-qm','scratch');
 return {directory,write,run,git};
}
const missing=(...commands)=>commands.some(command=>spawnSync(command,['--version']).error);

test('the edge build records its commit only from a Git checkout whose build inputs match it',t=>{
 // manifest.json names HEAD as the module's exact source, so a modified, untracked or staged input would make it wrong.
 if(missing('git','bash')) return t.skip('needs git and bash');
 const root=fileURLToPath(new URL('..',import.meta.url));
 const tools=mkdtempSync(join(tmpdir(),'avenquellis-'));
 t.after(()=>rmSync(tools,{recursive:true,force:true}));
 // A stand-in compiler that reports the pinned release and writes an empty WebAssembly module.
 writeFileSync(join(tools,'em++'),`#!/bin/sh
if [ "$1" = --version ]; then echo 'emcc (stand-in) 6.0.13'; exit 0; fi
while [ "$#" -gt 1 ]; do if [ "$1" = -o ]; then printf '\\000asm\\001\\000\\000\\000' > "$2"; exit 0; fi; shift; done
exit 1
`,{mode:0o755});
 const inputs=['include/noether/questions.hpp','src/native/engine.cpp','edge/bridge.cpp','edge/adapter.mjs','edge/THIRD-PARTY-NOTICES.txt'];
 const {directory,write,run,git}=scratchRepository(t,{'scripts/build-edge.sh':readFileSync(join(root,'scripts/build-edge.sh'),'utf8'),
  'README.md':'notes\n',...Object.fromEntries(inputs.map(file=>[file,file+'\n']))},{EMXX:join(tools,'em++')});
 const build=()=>run('bash','scripts/build-edge.sh','out');
 const refused=change=>{const result=build();assert.equal(result.status,1,change);assert.match(result.stderr,/Commit the build inputs first/,change);};
 let result=build();
 assert.equal(result.status,0,result.stderr);
 assert.equal(JSON.parse(readFileSync(join(directory,'out/manifest.json'),'utf8')).sourceCommit,git('rev-parse','HEAD'));
 write('src/native/engine.cpp','changed\n');
 refused('modified input');
 git('checkout','HEAD','--','src/native/engine.cpp');
 write('include/noether/extra.hpp','new\n');
 refused('untracked input');
 rmSync(join(directory,'include/noether/extra.hpp'));
 write('edge/bridge.cpp','staged\n');
 git('add','edge/bridge.cpp');
 refused('staged input');
 git('checkout','HEAD','--','edge/bridge.cpp');
 // Files that do not reach the module may differ.
 write('README.md','edited\n');
 result=build();
 assert.equal(result.status,0,result.stderr);
 // Without a checkout there is no commit to record.
 rmSync(join(directory,'.git'),{recursive:true,force:true});
 result=build();
 assert.equal(result.status,1);
 assert.match(result.stderr,/Run the build in a Git checkout/);
});

test('a family@version keeps the fingerprint that an earlier commit recorded',t=>{
 if(missing('git')) return t.skip('needs git');
 const root=fileURLToPath(new URL('..',import.meta.url));
 const {write,run,git}=scratchRepository(t,{'scripts/check-content-versions.mjs':readFileSync(join(root,'scripts/check-content-versions.mjs'),'utf8')});
 const check=(...base)=>run(process.execPath,'scripts/check-content-versions.mjs',...base);
 const save=entries=>write('test/content-fingerprints.json',JSON.stringify(entries,null,2)+'\n');
 const recorded={'number-gcd@0.1.0':'4f5f2c68f73e1147','calculus-max@0.1.0':'f752cb9d4608be1e'};
 save(recorded);
 git('add','-A');
 git('commit','-qm','record');
 // A commit without the record has nothing to compare, and neither has a push that creates a branch.
 assert.equal(check('HEAD~1').status,0);
 assert.equal(check('0'.repeat(40)).status,0);
 assert.equal(check('f'.repeat(40)).status,1);
 assert.equal(check().status,0);
 // A changed family gets a new version and its own entry.
 save({...recorded,'calculus-max@0.2.0':'0123456789abcdef'});
 assert.equal(check().status,0);
 // Re-pinning the released version, or dropping it, would let old references resolve to the new content.
 save({...recorded,'calculus-max@0.1.0':'0123456789abcdef'});
 let result=check();
 assert.equal(result.status,1);
 assert.match(result.stderr,/calculus-max@0\.1\.0: f752cb9d4608be1e at HEAD, 0123456789abcdef now\./);
 save({'number-gcd@0.1.0':recorded['number-gcd@0.1.0']});
 result=check();
 assert.equal(result.status,1);
 assert.match(result.stderr,/calculus-max@0\.1\.0: f752cb9d4608be1e at HEAD, removed now\./);
 // Once committed, the re-pin still differs from the commit before it, which CI compares with.
 save({...recorded,'calculus-max@0.1.0':'0123456789abcdef'});
 git('commit','-qam','re-pin');
 assert.equal(check('HEAD~1').status,1);
});
