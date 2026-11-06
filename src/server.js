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
   if(req.method!=='POST'||!['/generate','/mock'].includes(url.pathname)) return send(404,{error:'Not found'});
   if((req.headers['content-type']||'').split(';',1)[0].trim().toLowerCase()!=='application/json') return send(415,{error:'Use application/json'});
   // Read an oversized body to its end before answering 413. Leaving the loop early destroys the
   // socket while the client is still sending, and the client then often gets a reset, not the 413.
   // Past 8 MiB the upload is cut off so that an endless body cannot keep the server reading.
   const chunks=[];let size=0;
   for await(const chunk of req) {
    size+=chunk.length;
    if(size>8*1024*1024) return send(413,{error:'Request too large'});
    if(size<=16384) chunks.push(chunk);
   }
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
