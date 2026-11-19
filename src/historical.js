// The historical question bank: source records for questions from official papers, their editorial
// import and the verification gate in front of the usable bank. See docs/historical-bank.md.
// Generated practice never passes through this module, and historical questions never pass through
// src/index.js, so the two stay apart in every API.
import {createHash} from 'node:crypto';
import {topics} from './index.js';

export const SCHEMA_VERSION=1;
export const CLASSIFICATIONS=['official-paper','official-sample','official-solutions'];
// Only these two decisions allow question text into the repository. Both need recorded evidence.
export const REPRODUCING_DECISIONS=['permission-granted','open-licence'];
export const REUSE_DECISIONS=['pending-review','link-only',...REPRODUCING_DECISIONS];
// A verifier confirms each of these against the source document before a question can be served.
export const VERIFICATION_CHECKS=['statement','diagrams','chapters','classification','question-identifier'];
export const SAMPLE_LABEL='Sample Questions';
const DIAGRAM_METHODS=['redrawn','source-image'];
const SYNTHETIC_HOST='example.invalid';
const ID=/^hist-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIAGRAM_ID=/^[a-z0-9][a-z0-9-]{0,39}$/;
const PLACEHOLDER=/\[\[diagram:([^\]]*)\]\]/g;

const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max=4000)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&value===value.trim();
function isDate(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(`${value}T00:00:00Z`);
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function httpsUrl(value) {
 if(typeof value!=='string')return null;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url:null;}catch{return null;}
}
// Fields outside a schema are rejected, as they are for generation options, so a misspelt
// "verifed" never passes silently as a missing verification.
function onlyKeys(object,allowed,where,errors) {
 for(const key of Object.keys(object))if(!allowed.includes(key))errors.push(`${where}: unknown field "${key}".`);
}

/** The question identifier is derived from the source, so one source question has exactly one record. */
export function historicalId(source) {
 const section=source.section?`${source.section.toLowerCase()}`:'';
 const part=source.part?`-${source.part.toLowerCase()}`:'';
 return `hist-${source.paperId}-${section}q${source.question}${part}`;
}

/** SHA-256 over everything a verifier confirms. Editing any of it after verification voids the verification. */
export function contentDigest(record) {
 const t=record.transcription||{};
 const canonical=JSON.stringify([record.id,record.source.paperId,record.source.url,record.source.classification,
  record.source.publisherLabel??null,record.chapters,t.statement??null,
  (t.diagrams||[]).map(d=>[d.id,d.file,d.alt,d.method,d.sourcePage??null])]);
 return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function validateSource(record,where,registry,errors,synthetic) {
 const source=record.source;
 if(!isObject(source))return errors.push(`${where}: source must be an object.`);
 onlyKeys(source,['publisher','exam','paperId','year','classification','publisherLabel','section','question','part','url','page'],`${where}.source`,errors);
 if(!text(source.publisher,200))errors.push(`${where}: source.publisher is required.`);
 if(!['CMI','ISI','RMO'].includes(source.exam))errors.push(`${where}: source.exam must be CMI, ISI or RMO.`);
 if(typeof source.paperId!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.paperId))errors.push(`${where}: source.paperId must be a lowercase registry ID.`);
 if(!Number.isInteger(source.year)||source.year<1950||source.year>2100)errors.push(`${where}: source.year must be a four-digit year.`);
 if(!CLASSIFICATIONS.includes(source.classification))errors.push(`${where}: source.classification must be one of ${CLASSIFICATIONS.join(', ')}.`);
 // The publisher's own label is kept exactly. ISI calls its archive documents "Sample Questions", and
 // that label must neither be dropped from a sample nor attached to anything else.
 if(source.classification==='official-sample'&&source.publisherLabel!==SAMPLE_LABEL)errors.push(`${where}: an official sample keeps the publisher's label "${SAMPLE_LABEL}".`);
 if(source.classification!=='official-sample'&&source.publisherLabel!==undefined)errors.push(`${where}: publisherLabel is only recorded for official samples.`);
 if(source.section!==undefined&&(typeof source.section!=='string'||!/^[A-Z]{1,3}$/.test(source.section)))errors.push(`${where}: source.section must be 1-3 capital letters as printed.`);
 if(!Number.isInteger(source.question)||source.question<1||source.question>200)errors.push(`${where}: source.question must be the printed question number.`);
 if(source.part!==undefined&&(typeof source.part!=='string'||!/^[a-z]{1,3}$|^[ivx]{1,5}$/.test(source.part)))errors.push(`${where}: source.part must be a printed part label such as a or iii.`);
 if(source.page!==undefined&&(!Number.isInteger(source.page)||source.page<1))errors.push(`${where}: source.page must be a positive page number.`);
 const url=httpsUrl(source.url);
 if(!url)errors.push(`${where}: source.url must be an https URL.`);
 else if(synthetic!==(url.hostname===SYNTHETIC_HOST))errors.push(synthetic?`${where}: a synthetic record must use an ${SYNTHETIC_HOST} URL.`:`${where}: ${SYNTHETIC_HOST} URLs are reserved for synthetic test records.`);
 if(typeof source.paperId==='string'&&Number.isInteger(source.question)&&record.id!==historicalId(source))errors.push(`${where}: id must be ${historicalId(source)}, derived from the source.`);
 if(!registry)return;
 // Cross-check the record against the official-source registry (data/sources.json).
 const paper=registry.papers.find(p=>p.id===source.paperId);
 if(!paper)return errors.push(`${where}: paper ${source.paperId} is not in the source registry.`);
 const archive=registry.archives.find(a=>a.exam===paper.exam);
 if(paper.exam!==source.exam)errors.push(`${where}: exam ${source.exam} differs from the registry's ${paper.exam}.`);
 if(paper.year!==source.year)errors.push(`${where}: year ${source.year} differs from the registry's ${paper.year}.`);
 if(paper.url!==source.url&&paper.solutionsUrl!==source.url)errors.push(`${where}: source.url is not a document the registry lists for ${paper.id}.`);
 if(paper.kind!==source.classification)errors.push(`${where}: classification ${source.classification} differs from the registry's ${paper.kind}.`);
 if(archive&&archive.publisher!==source.publisher)errors.push(`${where}: publisher differs from the registry's "${archive.publisher}".`);
 if(Number.isInteger(paper.questionCount)&&source.question>paper.questionCount)errors.push(`${where}: ${paper.id} has only ${paper.questionCount} questions.`);
}

function validateReuse(reuse,where,errors) {
 if(!isObject(reuse))return errors.push(`${where}: reuse must be an object.`);
 onlyKeys(reuse,['decision','basis','decidedBy','decidedOn','evidence','licence','licenceUrl','coversDiagrams'],`${where}.reuse`,errors);
 if(!REUSE_DECISIONS.includes(reuse.decision))return errors.push(`${where}: reuse.decision must be one of ${REUSE_DECISIONS.join(', ')}.`);
 if(!text(reuse.basis,1000))errors.push(`${where}: reuse.basis must document the reason for the decision.`);
 if(reuse.coversDiagrams!==undefined&&typeof reuse.coversDiagrams!=='boolean')errors.push(`${where}: reuse.coversDiagrams must be true or false.`);
 if(reuse.decision==='pending-review'){
  for(const key of ['decidedBy','decidedOn','evidence','licence','licenceUrl','coversDiagrams'])if(reuse[key]!==undefined)errors.push(`${where}: a pending review records no ${key}.`);
  return;
 }
 if(!text(reuse.decidedBy,120))errors.push(`${where}: reuse.decidedBy names who made the decision.`);
 if(!isDate(reuse.decidedOn))errors.push(`${where}: reuse.decidedOn must be a YYYY-MM-DD date.`);
 if(reuse.decision==='permission-granted'&&!text(reuse.evidence,1000))errors.push(`${where}: permission-granted needs reuse.evidence locating the written permission.`);
 if(reuse.decision==='open-licence'&&(!text(reuse.licence,120)||!httpsUrl(reuse.licenceUrl)))errors.push(`${where}: open-licence needs reuse.licence and an https reuse.licenceUrl.`);
}

function validateTranscription(record,where,errors) {
 const t=record.transcription;
 if(t===null)return;
 if(!isObject(t))return errors.push(`${where}: transcription must be an object or null.`);
 onlyKeys(t,['statement','diagrams','transcribedBy','transcribedOn','notes'],`${where}.transcription`,errors);
 // Committing the text is itself the reproduction, so this is an error, not just an exclusion.
 if(!REPRODUCING_DECISIONS.includes(record.reuse?.decision))errors.push(`${where}: a transcription needs a reuse decision of ${REPRODUCING_DECISIONS.join(' or ')}.`);
 if(!text(t.statement,20000))errors.push(`${where}: transcription.statement is required.`);
 if(!text(t.transcribedBy,120))errors.push(`${where}: transcription.transcribedBy is required.`);
 if(!isDate(t.transcribedOn))errors.push(`${where}: transcription.transcribedOn must be a YYYY-MM-DD date.`);
 if(t.notes!==undefined&&!text(t.notes,2000))errors.push(`${where}: transcription.notes must be text.`);
 if(!Array.isArray(t.diagrams))return errors.push(`${where}: transcription.diagrams must be a list, empty when there are none.`);
 const ids=new Set();
 t.diagrams.forEach((d,i)=>{
  const at=`${where}.transcription.diagrams[${i}]`;
  if(!isObject(d))return errors.push(`${at}: must be an object.`);
  onlyKeys(d,['id','file','alt','method','sourcePage'],at,errors);
  if(typeof d.id!=='string'||!DIAGRAM_ID.test(d.id))errors.push(`${at}: id must be lowercase letters, digits and hyphens.`);
  else if(ids.has(d.id))errors.push(`${at}: duplicate diagram id ${d.id}.`);
  else ids.add(d.id);
  // Diagrams live beside the bank. The path cannot leave that folder.
  if(typeof d.file!=='string'||!/^diagrams\/[a-z0-9][a-z0-9._-]*\.(svg|png)$/.test(d.file)||d.file.includes('..'))errors.push(`${at}: file must be diagrams/<name>.svg or .png.`);
  if(!text(d.alt,2000))errors.push(`${at}: alt text describing the diagram is required.`);
  if(!DIAGRAM_METHODS.includes(d.method))errors.push(`${at}: method must be redrawn or source-image.`);
  else if(d.method==='source-image'&&record.reuse?.coversDiagrams!==true)errors.push(`${at}: copying a source image needs reuse.coversDiagrams.`);
  if(d.sourcePage!==undefined&&(!Number.isInteger(d.sourcePage)||d.sourcePage<1))errors.push(`${at}: sourcePage must be a positive page number.`);
 });
 if(typeof t.statement==='string'){
  const placed=[...t.statement.matchAll(PLACEHOLDER)].map(m=>m[1]),used=new Set(placed);
  for(const id of used)if(!ids.has(id))errors.push(`${where}: statement places [[diagram:${id}]], which is not listed.`);
  for(const id of used)if(placed.filter(p=>p===id).length>1)errors.push(`${where}: diagram ${id} is placed more than once.`);
  for(const id of ids)if(!used.has(id))errors.push(`${where}: diagram ${id} is never placed in the statement.`);
 }
}

function validateVerification(record,where,errors) {
 const v=record.verification;
 if(v===null)return;
 if(!isObject(v))return errors.push(`${where}: verification must be an object or null.`);
 onlyKeys(v,['status','verifiedBy','verifiedOn','checkedAgainst','checks','contentDigest','notes'],`${where}.verification`,errors);
 if(v.status!=='verified')errors.push(`${where}: verification.status must be verified; remove the verification otherwise.`);
 if(!record.transcription)errors.push(`${where}: only a transcription can be verified.`);
 if(!text(v.verifiedBy,120))errors.push(`${where}: verification.verifiedBy is required.`);
 if(!isDate(v.verifiedOn))errors.push(`${where}: verification.verifiedOn must be a YYYY-MM-DD date.`);
 if(!httpsUrl(v.checkedAgainst))errors.push(`${where}: verification.checkedAgainst must be the https source document that was compared.`);
 if(!Array.isArray(v.checks)||new Set(v.checks).size!==v.checks.length||v.checks.some(c=>!VERIFICATION_CHECKS.includes(c)))errors.push(`${where}: verification.checks must list distinct checks from ${VERIFICATION_CHECKS.join(', ')}.`);
 if(typeof v.contentDigest!=='string'||!/^sha256:[0-9a-f]{64}$/.test(v.contentDigest))errors.push(`${where}: verification.contentDigest is required.`);
 if(v.notes!==undefined&&!text(v.notes,2000))errors.push(`${where}: verification.notes must be text.`);
}

/**
 * Structural validation. Returns a list of errors; an empty list means the bank may be committed.
 * Passing validation does not make a record usable: usableHistoricalQuestions applies the gate.
 * registry is data/sources.json, or a synthetic registry for test fixtures. allowSynthetic admits only records
 * marked synthetic, with example.invalid URLs.
 */
export function validateHistoricalBank(bank,{registry,allowSynthetic=false}={}) {
 const errors=[];
 if(!isObject(bank))return ['The bank must be a JSON object.'];
 onlyKeys(bank,['schemaVersion','policy','records'],'bank',errors);
 if(bank.schemaVersion!==SCHEMA_VERSION)errors.push(`bank: schemaVersion must be ${SCHEMA_VERSION}.`);
 if(!text(bank.policy,2000))errors.push('bank: policy must state the reuse policy.');
 if(!Array.isArray(bank.records))return [...errors,'bank: records must be a list.'];
 const seen=new Set();
 bank.records.forEach((record,i)=>{
  const where=`records[${i}]${isObject(record)&&typeof record.id==='string'?` (${record.id})`:''}`;
  if(!isObject(record))return errors.push(`${where}: must be an object.`);
  onlyKeys(record,['id','synthetic','source','reuse','chapters','summary','transcription','verification'],where,errors);
  if(typeof record.id!=='string'||!ID.test(record.id))errors.push(`${where}: id must start with hist- and use lowercase letters, digits and hyphens.`);
  else if(seen.has(record.id))errors.push(`${where}: duplicate id.`);
  else seen.add(record.id);
  const synthetic=record.synthetic===true;
  if(record.synthetic!==undefined&&record.synthetic!==true)errors.push(`${where}: synthetic is either true or absent.`);
  if(synthetic&&!allowSynthetic)errors.push(`${where}: synthetic test records cannot enter the committed bank.`);
  validateSource(record,where,registry,errors,synthetic);
  validateReuse(record.reuse,where,errors);
  if(!Array.isArray(record.chapters)||!record.chapters.length||new Set(record.chapters).size!==record.chapters.length||record.chapters.some(c=>!topics.includes(c)))errors.push(`${where}: chapters must be distinct engine topics (${topics.join(', ')}), primary first.`);
  if(!text(record.summary,300))errors.push(`${where}: summary is a short editorial description in our own words.`);
  if(!Object.hasOwn(record,'transcription'))errors.push(`${where}: transcription must be present, null until imported.`);
  else validateTranscription(record,where,errors);
  if(!Object.hasOwn(record,'verification'))errors.push(`${where}: verification must be present, null until verified.`);
  else validateVerification(record,where,errors);
 });
 // Every question in the registry's chapter index has a source record with the same primary chapter.
 if(registry?.chapterIndex)for(const entry of registry.chapterIndex){
  const id=historicalId({paperId:entry.paperId,question:entry.question,section:entry.section});
  const record=bank.records.find(r=>isObject(r)&&r.id===id);
  if(!record)errors.push(`chapter index: ${entry.paperId} question ${entry.question} has no source record ${id}.`);
  else if(!Array.isArray(record.chapters)||record.chapters[0]!==entry.topic)errors.push(`chapter index: ${id} must have primary chapter ${entry.topic}.`);
 }
 return errors;
}

/**
 * Why a structurally valid record is kept out of the usable bank, or null when it may be served.
 * Each condition is necessary: a reproducing reuse decision, a transcription, and a complete,
 * independent verification of exactly the current content against the record's source document.
 */
export function exclusionReason(record) {
 if(!REPRODUCING_DECISIONS.includes(record.reuse.decision))return record.reuse.decision==='link-only'?'link-only':'reuse-pending';
 if(!record.transcription)return 'not-transcribed';
 const v=record.verification,t=record.transcription;
 if(!v)return 'unverified';
 if(VERIFICATION_CHECKS.some(c=>!v.checks.includes(c)))return 'verification-incomplete';
 if(v.verifiedBy.toLowerCase()===t.transcribedBy.toLowerCase())return 'verifier-not-independent';
 if(v.verifiedOn<t.transcribedOn||(record.reuse.decidedOn&&t.transcribedOn<record.reuse.decidedOn))return 'out-of-order-dates';
 if(v.checkedAgainst!==record.source.url)return 'checked-against-other-document';
 if(v.contentDigest!==contentDigest(record))return 'changed-since-verification';
 return null;
}

/** The API shape of a usable historical question. It carries no solution, rubric or answer. */
export function historicalQuestion(record) {
 const {source,transcription:t,reuse,verification:v}=record;
 const label=`${source.publisher} · ${source.exam} ${source.year}${source.publisherLabel?` · ${source.publisherLabel}`:''}`;
 return {id:record.id,origin:'historical',statement:t.statement,topic:record.chapters[0],chapters:[...record.chapters],exam:source.exam,
  summary:record.summary,diagrams:t.diagrams.map(({id,file,alt,method})=>({id,file,alt,method})),
  source:{kind:'historical',label,publisher:source.publisher,classification:source.classification,
   ...(source.publisherLabel?{publisherLabel:source.publisherLabel}:{}),paperId:source.paperId,year:source.year,
   ...(source.section?{section:source.section}:{}),question:source.question,...(source.part?{part:source.part}:{}),url:source.url},
  reuse:{decision:reuse.decision,basis:reuse.basis,...(reuse.licence?{licence:reuse.licence,licenceUrl:reuse.licenceUrl}:{})},
  verification:{verifiedOn:v.verifiedOn}};
}

/** The gate. Only records that pass it are ever served; the rest are counted by reason. Throws on an invalid bank. */
export function usableHistoricalQuestions(bank,options) {
 const errors=validateHistoricalBank(bank,options);
 if(errors.length)throw new TypeError(`Invalid historical bank:\n${errors.join('\n')}`);
 const questions=[],excluded={};
 for(const record of bank.records){
  const reason=exclusionReason(record);
  if(reason)excluded[reason]=(excluded[reason]||0)+1;
  else questions.push(historicalQuestion(record));
 }
 return {questions,excluded};
}

/** Source records without any transcribed text, for a link-out index. */
export function historicalSourceIndex(bank) {
 return bank.records.map(record=>({id:record.id,origin:'historical',chapters:[...record.chapters],summary:record.summary,
  source:{...record.source},reuse:{decision:record.reuse.decision,basis:record.reuse.basis},usable:exclusionReason(record)===null}));
}

// Editorial steps. Each returns a new bank and leaves its input unchanged; the CLI writes the result.
const replace=(bank,id,change)=>{
 const index=bank.records.findIndex(r=>r.id===id);
 if(index<0)throw new RangeError(`No source record ${id}. Add its source record first.`);
 const records=structuredClone(bank.records);
 records[index]=change(records[index]);
 return {...structuredClone(bank),records};
};
function checked(bank,options) {
 const errors=validateHistoricalBank(bank,options);
 if(errors.length)throw new TypeError(errors.join('\n'));
 return bank;
}

/** Record the owner's reuse decision. Withdrawing permission also withdraws the transcription. */
export function recordReuseDecision(bank,id,reuse,options) {
 return checked(replace(bank,id,record=>{
  const keep=REPRODUCING_DECISIONS.includes(reuse.decision);
  return {...record,reuse:{...reuse},transcription:keep?record.transcription:null,verification:keep?record.verification:null};
 }),options);
}

/** Import a faithful transcription. Any earlier verification is cleared: the new text must be verified again. */
export function importTranscription(bank,id,draft,options) {
 if(!isObject(draft))throw new TypeError('A transcription draft must be a JSON object.');
 const unknown=Object.keys(draft).filter(k=>!['statement','diagrams','transcribedBy','transcribedOn','notes','chapters'].includes(k));
 if(unknown.length)throw new TypeError(`Unknown draft fields: ${unknown.join(', ')}.`);
 const {statement,diagrams=[],transcribedBy,transcribedOn,notes,chapters}=draft;
 return checked(replace(bank,id,record=>{
  if(!REPRODUCING_DECISIONS.includes(record.reuse.decision))throw new RangeError(`${id}: reuse decision ${record.reuse.decision} does not allow a transcription.`);
  return {...record,...(chapters?{chapters:[...chapters]}:{}),
   transcription:{statement,diagrams:structuredClone(diagrams),transcribedBy,transcribedOn,...(notes!==undefined?{notes}:{})},verification:null};
 }),options);
}

/** Record a verifier's confirmation of the current content against the source document. */
export function recordVerification(bank,id,{verifiedBy,verifiedOn,checkedAgainst,checks,notes},options) {
 return checked(replace(bank,id,record=>{
  if(!record.transcription)throw new RangeError(`${id}: import a transcription before verifying it.`);
  const missing=VERIFICATION_CHECKS.filter(c=>!checks?.includes(c));
  if(missing.length)throw new RangeError(`${id}: verification must confirm ${missing.join(', ')}.`);
  if(String(verifiedBy).toLowerCase()===record.transcription.transcribedBy.toLowerCase())throw new RangeError(`${id}: the verifier must not be the transcriber.`);
  if(checkedAgainst!==record.source.url)throw new RangeError(`${id}: verify against the record's source document, ${record.source.url}.`);
  const verified={...record,verification:{status:'verified',verifiedBy,verifiedOn,checkedAgainst,checks:[...checks],contentDigest:'',...(notes!==undefined?{notes}:{})}};
  verified.verification.contentDigest=contentDigest(verified);
  return verified;
 }),options);
}
