import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {usableHistoricalQuestions,historicalSourceIndex,validateHistoricalBank,diagramDigest,DIAGRAM_FILE} from './historical.js';

const bankPath=new URL('../data/historical/bank.json',import.meta.url);
const registryPath=new URL('../data/sources.json',import.meta.url);
const NOTICE='Historical questions from official papers, kept apart from generated original practice. Only questions with a recorded reuse decision that permits reproduction and an independent editorial verification are listed. No solutions or rubrics are provided; follow source.url for the publisher\'s document.';

/**
 * Each diagram file must exist beside the bank and still have the digest recorded for it, because the
 * content digest a verifier signed covers the image through that recorded digest.
 */
export function diagramFileErrors(bank,bankPath) {
 const folder=dirname(bankPath instanceof URL?fileURLToPath(bankPath):bankPath);
 return bank.records.flatMap(r=>(r.transcription?.diagrams||[]).flatMap(d=>{
  if(typeof d?.file!=='string'||!DIAGRAM_FILE.test(d.file))return [];
  let bytes;
  try{bytes=readFileSync(join(folder,d.file));}catch{return [`${r.id}: diagram file ${d.file} is missing.`];}
  return diagramDigest(bytes)===d.digest?[]:[`${r.id}: diagram file ${d.file} does not match its recorded digest.`];
 }));
}

/**
 * GET /historical lists the verified, usable historical questions and counts the rest by reason.
 * GET /historical/sources lists every source record, without any transcribed text.
 * The bank is read on each request, as the resource catalog is, so an editorial update needs no restart.
 */
export async function handleHistorical(req,url,send) {
 if(req.method!=='GET')return send(405,{error:'Use GET.'},{'Allow':'GET'});
 if([...url.searchParams.keys()].length)return send(400,{error:'The historical routes take no query parameters.'});
 let bank,registry;
 try{[bank,registry]=await Promise.all([bankPath,registryPath].map(async path=>JSON.parse(await readFile(path,'utf8'))));}
 catch{return send(503,{error:'The historical bank is temporarily unavailable.'});}
 if(validateHistoricalBank(bank,{registry}).length||diagramFileErrors(bank,bankPath).length)return send(503,{error:'The historical bank failed validation.'});
 if(url.pathname==='/historical/sources')return send(200,{origin:'historical',notice:NOTICE,records:historicalSourceIndex(bank)});
 const {questions,excluded}=usableHistoricalQuestions(bank,{registry});
 return send(200,{origin:'historical',notice:NOTICE,questions,excluded});
}
