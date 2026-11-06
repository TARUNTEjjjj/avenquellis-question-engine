import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {generateQuestion, generateMock, topics, questionBank, engineInfo} from './index.js';

export function createApp() {
 return createServer(async (req,res) => {
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try {
   const url=new URL(req.url,'http://localhost');
   if(req.method==='GET' && url.pathname==='/health') return send(200,{status:'ok',...engineInfo});
   if(req.method==='GET' && url.pathname==='/topics') return send(200,{topics});
   if(req.method==='GET' && url.pathname==='/bank') return send(200,{questions:questionBank});
   let refusal;
   if(req.method!=='POST'||!['/generate','/mock'].includes(url.pathname)) refusal=[404,{error:'Not found'}];
   else if((req.headers['content-type']||'').split(';',1)[0].trim().toLowerCase()!=='application/json') refusal=[415,{error:'Use application/json'}];
   // A request without Transfer-Encoding or a nonzero Content-Length has no body (RFC 9112, section 6.3).
   // Answer it at once: bytes after it start the next request, and if they are not valid HTTP, Node
   // would otherwise answer 400 before this 404 or 415 is sent.
   if(refusal&&req.headers['transfer-encoding']===undefined&&!(Number(req.headers['content-length'])>0)) return send(...refusal);
   // Read the body to its end before answering 404, 415 or 413. Answering earlier lets the server close
   // the socket while the client is still sending, and the client then often gets a reset, not the answer.
   // Past 8 MiB the upload is cut off so that an endless body cannot keep the server reading.
   const chunks=[];let size=0;
   for await(const chunk of req) {
    size+=chunk.length;
    if(size>8*1024*1024) return send(...(refusal??[413,{error:'Request too large'}]));
    if(size<=16384) chunks.push(chunk);
   }
   if(refusal) return send(...refusal);
   if(size>16384) return send(413,{error:'Request too large'});
   let options;
   try {options=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))||'{}');}
   catch {return send(400,{error:'Malformed UTF-8 JSON request.'});}
   if(!options||Array.isArray(options)||typeof options!=='object') return send(400,{error:'Expected a JSON object'});
   send(200,url.pathname==='/mock'?generateMock(options):generateQuestion(options));
  } catch(error) { send(400,{error:error.message}); }
 });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const port=Number(process.env.PORT||4101);
 createApp().listen(port,'127.0.0.1',()=>console.log(`Avenquellis question engine: http://127.0.0.1:${port}`));
}
