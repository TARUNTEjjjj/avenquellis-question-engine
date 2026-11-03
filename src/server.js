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
   if(!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'Use application/json'});
   let body='';
   for await(const chunk of req) {body+=chunk;if(Buffer.byteLength(body)>16384) return send(413,{error:'Request too large'});}
   const options=JSON.parse(body||'{}');
   if(!options||Array.isArray(options)||typeof options!=='object') return send(400,{error:'Expected a JSON object'});
   send(200,url.pathname==='/mock'?generateMock(options):generateQuestion(options));
  } catch(error) { send(400,{error:error.message}); }
 });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const port=Number(process.env.PORT||4101);
 createApp().listen(port,'127.0.0.1',()=>console.log(`Veyra Math question engine: http://127.0.0.1:${port}`));
}
