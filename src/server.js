import {handleResources} from './resources.js';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {generateQuestion, generateMock, topics, questionBank, engineInfo} from './index.js';

const MAX_REQUEST_BYTES=16384;

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

// Deliberately allowlist fields so future solution metadata is not accidentally
// included in a printable practice sheet. This is a display view, not access control.
function practiceQuestion(question) {
 return Object.fromEntries(['id','title','statement','topic','difficulty','requestedDifficulty','exam','type','maxMarks','source','templateId','generator']
  .filter(key=>Object.hasOwn(question,key)).map(key=>[key,question[key]]));
}

export function createApp({bodyTimeoutMs=10000}={}) {
 if(!Number.isSafeInteger(bodyTimeoutMs)||bodyTimeoutMs<10||bodyTimeoutMs>60000)throw new RangeError('bodyTimeoutMs must be an integer from 10 to 60000.');
 return createServer(async (req,res) => {
  const send=(status,data)=>{if(req.aborted||res.destroyed)return;if(!req.complete)res.shouldKeepAlive=false;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try {
   if (await handleResources(req, res)) return;
   const url=new URL(req.url,'http://localhost');
   if(req.method==='GET' && url.pathname==='/health') return send(200,{status:'ok',...engineInfo});
   if(req.method==='GET' && url.pathname==='/topics') return send(200,{topics});
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
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const port=Number(process.env.PORT||4101);
 createApp().listen(port,'127.0.0.1',()=>console.log(`Avenquellis question engine: http://127.0.0.1:${port}`));
}
