#!/usr/bin/env node
// Editorial tool for the historical question bank. See docs/historical-bank.md.
//   check                                  validate the bank, its diagrams and the registry cross-checks
//   reuse <id> --decision D --basis TEXT [--by NAME --on DATE --evidence TEXT --licence NAME --licence-url URL --covers-diagrams]
//   import <id> --draft FILE               attach a transcription draft (JSON) to a source record
//   verify <id> --by NAME --on DATE --checked-against URL --checks a,b,c [--notes TEXT]
// Every command takes --bank FILE (default data/historical/bank.json) and --registry FILE (default data/sources.json).
// --allow-synthetic admits the synthetic test fixtures; never use it on the committed bank.
// A command that changes the bank writes it only when the whole result validates.
import {readFileSync,realpathSync,writeFileSync,renameSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {validateHistoricalBank,usableHistoricalQuestions,recordReuseDecision,importTranscription,recordVerification,diagramDigest,DIAGRAM_FILE} from '../../src/historical.js';
import {diagramFileErrors} from '../../src/historical-api.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const readJson=path=>JSON.parse(readFileSync(path,'utf8'));

/**
 * Record the digest of each draft diagram's file, which the verification's content digest then covers.
 * A digest already in the draft must match the file.
 */
function withDiagramDigests(draft,bankPath) {
 if(!Array.isArray(draft?.diagrams))return draft;
 return {...draft,diagrams:draft.diagrams.map(d=>{
  if(d===null||typeof d!=='object'||typeof d.file!=='string'||!DIAGRAM_FILE.test(d.file))return d;
  let bytes;
  try{bytes=readFileSync(join(dirname(bankPath),d.file));}catch{throw new RangeError(`diagram file ${d.file} is missing.`);}
  const digest=diagramDigest(bytes);
  if(d.digest!==undefined&&d.digest!==digest)throw new RangeError(`diagram file ${d.file} does not match the draft's digest.`);
  return {...d,digest};
 })};
}

export function run(argv,{log=console.log,error=console.error}={}) {
 const {positionals,values}=parseArgs({args:argv,allowPositionals:true,options:{
  bank:{type:'string',default:join(root,'data/historical/bank.json')},registry:{type:'string',default:join(root,'data/sources.json')},
  decision:{type:'string'},basis:{type:'string'},by:{type:'string'},on:{type:'string'},evidence:{type:'string'},
  licence:{type:'string'},'licence-url':{type:'string'},'covers-diagrams':{type:'boolean'},
  draft:{type:'string'},'allow-synthetic':{type:'boolean'},'checked-against':{type:'string'},checks:{type:'string'},notes:{type:'string'}}});
 const [command,id,...rest]=positionals;
 if(rest.length)throw new RangeError(`Unexpected arguments: ${rest.join(' ')}`);
 // --allow-synthetic is for the synthetic test fixtures only; the committed bank is checked without it.
 const options={registry:readJson(values.registry),allowSynthetic:values['allow-synthetic']===true};
 const bank=readJson(values.bank);
 const save=next=>{
  const missing=diagramFileErrors(next,values.bank);
  if(missing.length)throw new RangeError(missing.join('\n'));
  // Write a sibling file and rename it, so an interrupted write cannot leave a truncated bank.
  const temporary=`${values.bank}.tmp`;
  writeFileSync(temporary,JSON.stringify(next,null,2)+'\n');renameSync(temporary,values.bank);
  log(`Updated ${id} in ${values.bank}.`);
 };
 const need=(...keys)=>{for(const key of keys)if(values[key]===undefined)throw new RangeError(`${command} needs --${key}.`);};
 if(command==='check'){
  if(id)throw new RangeError('check takes no record id.');
  const errors=[...validateHistoricalBank(bank,options),...diagramFileErrors(bank,values.bank)];
  if(errors.length){error(errors.join('\n'));return 1;}
  const {questions,excluded}=usableHistoricalQuestions(bank,options);
  log(`${bank.records.length} source records valid; ${questions.length} usable; excluded: ${Object.entries(excluded).map(([k,v])=>`${k} ${v}`).join(', ')||'none'}.`);
  return 0;
 }
 if(!id)throw new RangeError('Name a record id.');
 if(command==='reuse'){
  need('decision','basis');
  const reuse={decision:values.decision,basis:values.basis,
   ...Object.fromEntries([['decidedBy',values.by],['decidedOn',values.on],['evidence',values.evidence],['licence',values.licence],['licenceUrl',values['licence-url']]].filter(([,v])=>v!==undefined)),
   ...(values['covers-diagrams']?{coversDiagrams:true}:{})};
  save(recordReuseDecision(bank,id,reuse,options));
 } else if(command==='import'){
  need('draft');
  save(importTranscription(bank,id,withDiagramDigests(readJson(values.draft),values.bank),options));
 } else if(command==='verify'){
  need('by','on','checked-against','checks');
  save(recordVerification(bank,id,{verifiedBy:values.by,verifiedOn:values.on,checkedAgainst:values['checked-against'],
   checks:values.checks.split(',').map(c=>c.trim()).filter(Boolean),...(values.notes!==undefined?{notes:values.notes}:{})},options));
 } else throw new RangeError(`Unknown command ${command}. Use check, reuse, import or verify.`);
 return 0;
}

// Compare real paths, so the tool also runs when invoked through a symlink.
function startedDirectly() {
 try{return realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url));}catch{return false;}
}
if(process.argv[1]&&startedDirectly()){
 try{process.exitCode=run(process.argv.slice(2));}
 catch(e){console.error(e.message);process.exitCode=2;}
}
