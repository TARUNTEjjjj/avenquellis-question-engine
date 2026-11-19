import {readFile} from 'node:fs/promises';
import {usableHistoricalQuestions,historicalSourceIndex,validateHistoricalBank} from './historical.js';

const bankPath=new URL('../data/historical/bank.json',import.meta.url);
const registryPath=new URL('../data/sources.json',import.meta.url);
const NOTICE='Historical questions from official papers, kept apart from generated original practice. Only questions with a recorded reuse decision that permits reproduction and an independent editorial verification are listed. No solutions or rubrics are provided; follow source.url for the publisher\'s document.';

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
 if(validateHistoricalBank(bank,{registry}).length)return send(503,{error:'The historical bank failed validation.'});
 if(url.pathname==='/historical/sources')return send(200,{origin:'historical',notice:NOTICE,records:historicalSourceIndex(bank)});
 const {questions,excluded}=usableHistoricalQuestions(bank,{registry});
 return send(200,{origin:'historical',notice:NOTICE,questions,excluded});
}
