import {handleResources} from './resources.js';
import {handleHistorical} from './historical-api.js';
import {createServer} from 'node:http';
import {realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {generateQuestion, generateMock, topics, questionBank, engineInfo} from './index.js';

const MAX_REQUEST_BYTES=16384;
const MAX_DRAINED_BYTES=8*1024*1024;

function readOptions(req,timeoutMs) {
 return new Promise((resolve,reject)=>{
  const chunks=[];let size=0;
  const finish=(error,value)=>{
   clearTimeout(timer);
   req.removeListener('data',data);req.removeListener('end',end);
   req.removeListener('error',failure);req.removeListener('aborted',aborted);
   if(error){req.pause();reject(error);}else resolve(value);
  };
  const fail=(status,message)=>finish(Object.assign(new Error(message),{status}));
  const data=chunk=>{size+=chunk.length;if(size>MAX_REQUEST_BYTES)return fail(413,'Request too large');chunks.push(chunk);};
  const end=()=>{
   let options;
   try{options=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))||'{}');}
   catch{return fail(400,'Malformed UTF-8 JSON request.');}
   if(!options||Array.isArray(options)||typeof options!=='object')return fail(400,'Expected a JSON object');
   finish(null,options);
  };
  const failure=()=>fail(400,'Request body could not be read.');
  const aborted=()=>fail(400,'Request body was interrupted.');
  const timer=setTimeout(()=>fail(408,'Request body deadline exceeded.'),timeoutMs);
  req.on('data',data);req.on('end',end);req.on('error',failure);req.on('aborted',aborted);
 });
}

// Reads and discards what is left of an upload, then calls done. It stops when the body ends or the
// request closes, after MAX_DRAINED_BYTES or after timeoutMs, whichever comes first, so that an endless
// or stalled body cannot keep the server reading.
function drain(req,timeoutMs,done) {
 let size=0;
 const finish=()=>{
  clearTimeout(timer);
  req.removeListener('data',data);req.removeListener('end',finish);req.removeListener('close',finish);
  done();
 };
 const data=chunk=>{size+=chunk.length;if(size>MAX_DRAINED_BYTES)finish();};
 const timer=setTimeout(finish,timeoutMs);
 req.on('data',data);req.on('end',finish);req.on('close',finish);req.resume();
}

// Deliberately allowlist fields so future solution metadata is not accidentally
// included in a printable practice sheet. This is a display view, not access control.
function practiceQuestion(question) {
 return Object.fromEntries(['id','title','statement','topic','difficulty','requestedDifficulty','exam','type','maxMarks','source','templateId','generator']
  .filter(key=>Object.hasOwn(question,key)).map(key=>[key,question[key]]));
}

export function createApp({bodyTimeoutMs=10000}={}) {
 if(!Number.isSafeInteger(bodyTimeoutMs)||bodyTimeoutMs<10||bodyTimeoutMs>60000)throw new RangeError('bodyTimeoutMs must be an integer from 10 to 60000.');
 return createServer(async (req,res) => {
  const deadline=performance.now()+bodyTimeoutMs;
  // A request without Transfer-Encoding or a nonzero Content-Length has no body (RFC 9112, section 6.3).
  // It is answered at once and keeps its connection: bytes after it start the next request, and if they
  // are not valid HTTP, Node would otherwise answer 400 before this reply is sent.
  const hasBody=req.headers['transfer-encoding']!==undefined||Number(req.headers['content-length'])>0;
  const send=(status,data,headers={})=>{
   if(req.aborted||res.destroyed)return;
   const body=JSON.stringify(data),unfinished=hasBody&&!req.complete,left=Math.ceil(deadline-performance.now());
   if(unfinished)res.shouldKeepAlive=false;
   res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':Buffer.byteLength(body),...headers});
   if(!unfinished||left<=0)return res.end(body);
   // The client is still uploading. The reply goes out now, complete, and announces that the connection
   // will close. Closing it right away would often reset the connection while the client is sending,
   // and the client would then get the reset, not the reply. So the rest of the upload is read first,
   // within the bounds of drain and the body deadline, and only then does the response end.
   // Uncorking hands the reply over now. Node would otherwise hold it back until this turn ends, and drop it
   // if the connection closes first, as it does in this same turn when the bytes after the head are not a
   // valid body.
   res.cork();res.write(body);res.uncork();
   drain(req,left,()=>res.end());
  };
  try {
   const url=new URL(req.url,'http://localhost');
   // Only the catalog route waits here, so that every other reply to a request without a body is immediate.
   if(url.pathname==='/api/resources'&&await handleResources(req,send)) return;
   if(req.method==='GET' && url.pathname==='/health') return send(200,{status:'ok',...engineInfo});
   if(req.method==='GET' && url.pathname==='/topics') return send(200,{topics});
   // Historical questions have their own routes and never appear in /bank, /generate or /mock.
   if(url.pathname==='/historical'||url.pathname==='/historical/sources') return await handleHistorical(req,url,send);
   const view=url.searchParams.get('view')||'solutions';
   if(!['solutions','practice'].includes(view))return send(400,{error:'Use view=practice or view=solutions.'});
   if(req.method==='GET' && url.pathname==='/bank') return send(200,{questions:view==='practice'?questionBank.map(practiceQuestion):questionBank});
   if(req.method!=='POST'||!['/generate','/mock'].includes(url.pathname)) return send(404,{error:'Not found'});
   if((req.headers['content-type']||'').split(';',1)[0].trim().toLowerCase()!=='application/json') return send(415,{error:'Use application/json'});
   if(Number(req.headers['content-length']||0)>MAX_REQUEST_BYTES)return send(413,{error:'Request too large'});
   const options=await readOptions(req,bodyTimeoutMs);
   const result=url.pathname==='/mock'?generateMock(options):generateQuestion(options);
   send(200,view==='practice'?(result.questions?{...result,questions:result.questions.map(practiceQuestion)}:practiceQuestion(result)):result);
  } catch(error) { send(error.status||400,{error:error.message}); }
 });
}
// Node resolves the extension and any symlinks in the path of the script it runs, so compare that real
// path with this module's own. Comparing import.meta.url with argv[1] as given never called listen() for
// a path through a symlink, such as a current -> releases/N deployment, and the process exited with status 0.
function startedDirectly() {
 try {return realpathSync(createRequire(import.meta.url).resolve(process.argv[1]))===realpathSync(fileURLToPath(import.meta.url));}
 catch {return false;}
}
if(process.argv[1] && startedDirectly()) {
 const port=Number(process.env.PORT||4101);
 createApp().listen(port,'127.0.0.1',()=>console.log(`Avenquellis question engine: http://127.0.0.1:${port}`));
}
