// The historical bank. Every question text in these tests is a synthetic fixture marked as such;
// the committed bank holds source records only, with no transcribed exam questions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {questionBank,getQuestion,resolveQuestionRef,generateMock} from '../src/index.js';
import {createApp} from '../src/server.js';
import {validateHistoricalBank,usableHistoricalQuestions,exclusionReason,historicalSourceIndex,recordReuseDecision,
 importTranscription,recordVerification,historicalId,VERIFICATION_CHECKS,SAMPLE_LABEL} from '../src/historical.js';
import {run} from '../scripts/historical/historical-bank.mjs';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const registry=read('../data/sources.json');
const bank=()=>read('../data/historical/bank.json');
const fixture=()=>read('./fixtures/historical/synthetic-bank.json');
const draft=()=>read('./fixtures/historical/synthetic-draft.json');
const synthetic={allowSynthetic:true,registry:read('./fixtures/historical/synthetic-sources.json')};
const VERIFIED='hist-synthetic-sample-2001-q1',PENDING='hist-synthetic-paper-2001-q2';
const verification={verifiedBy:'Fixture Verifier',verifiedOn:'2026-01-12',checkedAgainst:'https://example.invalid/synthetic-paper-2001.pdf',checks:[...VERIFICATION_CHECKS]};
const permission={decision:'permission-granted',basis:'Synthetic fixture permission.',decidedBy:'Fixture Owner',decidedOn:'2026-01-05',evidence:'Synthetic fixture.'};
const errorsFor=(mutate,options={registry})=>{const b=bank();mutate(b);return validateHistoricalBank(b,options);};
const record=(b,id)=>b.records.find(r=>r.id===id);

test('the committed bank is a valid set of source records for the whole chapter index, with no transcribed text',()=>{
 const b=bank();
 assert.deepEqual(validateHistoricalBank(b,{registry}),[]);
 assert.equal(b.records.length,registry.chapterIndex.length);
 for(const r of b.records){
  assert.equal(r.transcription,null);assert.equal(r.verification,null);
  assert.equal(r.reuse.decision,'pending-review');
  assert.ok(registry.papers.some(p=>p.id===r.source.paperId&&p.url===r.source.url));
 }
 const {questions,excluded}=usableHistoricalQuestions(b,{registry});
 assert.deepEqual(questions,[]);
 assert.deepEqual(excluded,{'reuse-pending':registry.chapterIndex.length});
});

test('ISI documents keep the publisher label Sample Questions, and only samples carry it',()=>{
 const isi=bank().records.filter(r=>r.source.exam==='ISI');
 assert.ok(isi.length>0);
 for(const r of isi){assert.equal(r.source.classification,'official-sample');assert.equal(r.source.publisherLabel,SAMPLE_LABEL);}
 const id='hist-isi-ugb-2024-q1';
 assert.match(errorsFor(b=>{delete record(b,id).source.publisherLabel;}).join('\n'),/keeps the publisher's label "Sample Questions"/);
 assert.match(errorsFor(b=>{record(b,id).source.publisherLabel='Previous Year Paper';}).join('\n'),/keeps the publisher's label/);
 // Relabelling a sample as a paper contradicts the registry.
 assert.match(errorsFor(b=>{const s=record(b,id).source;s.classification='official-paper';delete s.publisherLabel;}).join('\n'),/differs from the registry's official-sample/);
 assert.match(errorsFor(b=>{record(b,'hist-rmo-2024-q1').source.publisherLabel=SAMPLE_LABEL;}).join('\n'),/only recorded for official samples/);
});

test('source records are cross-checked against the official-source registry',()=>{
 const id='hist-cmi-2025-aq2';
 const cases=[
  [b=>{record(b,id).source.url='https://www.cmi.ac.in/other.pdf';},/not a document the registry lists/],
  [b=>{record(b,id).source.publisher='Someone Else';},/publisher differs/],
  [b=>{record(b,id).source.year=2024;},/year 2024 differs/],
  [b=>{record(b,id).source.paperId='cmi-1999';},/not in the source registry/],
  [b=>{const r=record(b,'hist-rmo-2024-q6');r.source.question=7;r.id=historicalId(r.source);},/has only 6 questions/],
  [b=>{record(b,id).id='hist-cmi-2025-q2';},/id must be hist-cmi-2025-aq2/],
  [b=>{b.records.pop();},/has no source record hist-rmo-2024-q6/],
  [b=>{record(b,id).chapters=['geometry'];},/must have primary chapter probability/],
  [b=>{record(b,id).chapters=['physics'];},/chapters must be distinct engine topics/],
  [b=>{record(b,id).source.url='https://example.invalid/x.pdf';},/reserved for synthetic/],
  [b=>{record(b,id).verifed=null;},/unknown field "verifed"/],
  [b=>{b.records.push(structuredClone(record(b,id)));},/duplicate id/],
  [b=>{b.records.push(fixture().records[1]);},/synthetic test records cannot enter the committed bank/],
 ];
 for(const [mutate,pattern] of cases)assert.match(errorsFor(mutate).join('\n'),pattern,String(mutate));
});

test('reuse decisions are documented, and only a reproducing decision admits question text',()=>{
 const id='hist-cmi-2025-aq2';
 const text={statement:'SYNTHETIC FIXTURE text.',diagrams:[],transcribedBy:'A',transcribedOn:'2026-01-10'};
 assert.match(errorsFor(b=>{record(b,id).transcription=text;}).join('\n'),/needs a reuse decision of permission-granted or open-licence/);
 assert.match(errorsFor(b=>{record(b,id).reuse={decision:'link-only',basis:'Linked.'};}).join('\n'),/decidedBy names who made the decision/);
 assert.match(errorsFor(b=>{record(b,id).reuse={...permission,evidence:undefined};}).join('\n'),/needs reuse.evidence/);
 assert.match(errorsFor(b=>{record(b,id).reuse={decision:'open-licence',basis:'Licensed.',decidedBy:'O',decidedOn:'2026-01-01',licence:'CC BY 4.0'};}).join('\n'),/licenceUrl/);
 assert.match(errorsFor(b=>{record(b,id).reuse={decision:'pending-review',basis:'x',decidedBy:'O'};}).join('\n'),/pending review records no decidedBy/);
 assert.match(errorsFor(b=>{record(b,id).reuse.basis='';}).join('\n'),/document the reason/);
 assert.match(errorsFor(b=>{record(b,id).reuse={decision:'link-only',basis:'Linked.',decidedBy:'O',decidedOn:'2026-02-30'};}).join('\n'),/YYYY-MM-DD/);
 assert.deepEqual(errorsFor(b=>{record(b,id).reuse={decision:'link-only',basis:'Linked.',decidedBy:'O',decidedOn:'2026-02-28'};}),[]);
 assert.throws(()=>importTranscription(bank(),id,text,{registry}),/does not allow a transcription/);
});

test('diagrams are listed with alt text, placed in the statement and redrawn unless images are covered',()=>{
 const b=fixture(),r=record(b,VERIFIED);
 const check=mutate=>{const c=structuredClone(b);mutate(record(c,VERIFIED));return validateHistoricalBank(c,synthetic).join('\n');};
 assert.equal(check(()=>{}),'');
 assert.match(check(x=>{x.transcription.statement=x.transcription.statement.replace('[[diagram:square]]','the figure');}),/never placed/);
 assert.match(check(x=>{x.transcription.statement+=' [[diagram:circle]]';}),/not listed/);
 assert.match(check(x=>{x.transcription.statement+=' [[diagram:square]]';}),/placed more than once/);
 assert.match(check(x=>{x.transcription.diagrams[0].alt='';}),/alt text/);
 assert.match(check(x=>{x.transcription.diagrams[0].file='../../etc/passwd.svg';}),/diagrams\/<name>/);
 assert.match(check(x=>{x.transcription.diagrams[0].method='source-image';}),/coversDiagrams/);
 assert.equal(check(x=>{x.transcription.diagrams[0].method='source-image';x.reuse.coversDiagrams=true;}),'');
 assert.match(check(x=>{x.transcription.diagrams.push({...x.transcription.diagrams[0]});}),/duplicate diagram id/);
 assert.ok(r.transcription.statement.startsWith('SYNTHETIC FIXTURE'));
});

test('the verification gate admits only an independent, complete verification of the current content',()=>{
 const {questions,excluded}=usableHistoricalQuestions(fixture(),synthetic);
 assert.deepEqual(questions.map(q=>q.id),[VERIFIED]);
 assert.deepEqual(excluded,{'reuse-pending':1});
 const reason=mutate=>{const b=fixture();mutate(record(b,VERIFIED));assert.deepEqual(validateHistoricalBank(b,synthetic),[]);return exclusionReason(record(b,VERIFIED));};
 assert.equal(reason(()=>{}),null);
 assert.equal(reason(r=>{r.verification=null;}),'unverified');
 assert.equal(reason(r=>{r.verification.checks=r.verification.checks.filter(c=>c!=='diagrams');}),'verification-incomplete');
 assert.equal(reason(r=>{r.verification.verifiedBy='fixture transcriber';}),'verifier-not-independent');
 assert.equal(reason(r=>{r.verification.verifiedOn='2026-01-09';}),'out-of-order-dates');
 assert.equal(reason(r=>{r.transcription.transcribedOn='2026-01-01';}),'out-of-order-dates');
 assert.equal(reason(r=>{r.verification.checkedAgainst='https://example.invalid/other.pdf';}),'checked-against-other-document');
 // Any edit to verified content after verification voids it.
 assert.equal(reason(r=>{r.transcription.statement+=' Edited.';}),'changed-since-verification');
 assert.equal(reason(r=>{r.chapters=['geometry','algebra'];}),'changed-since-verification');
 assert.equal(reason(r=>{r.transcription.diagrams[0].alt='Changed.';}),'changed-since-verification');
 assert.equal(reason(r=>{r.transcription.diagrams[0].sourcePage=2;}),'changed-since-verification');
 const invalid=fixture();record(invalid,VERIFIED).verification.status='draft';
 assert.throws(()=>usableHistoricalQuestions(invalid,synthetic),/Invalid historical bank/);
});

test('the editorial workflow records reuse, imports, verifies, and re-verifies after any change',()=>{
 let b=fixture();
 assert.throws(()=>importTranscription(b,PENDING,draft(),synthetic),/pending-review does not allow/);
 b=recordReuseDecision(b,PENDING,permission,synthetic);
 assert.throws(()=>importTranscription(b,PENDING,{...draft(),solution:'x'},synthetic),/Unknown draft fields: solution/);
 assert.throws(()=>importTranscription(b,PENDING,{...draft(),transcribedOn:'soon'},synthetic),/transcribedOn/);
 const imported=importTranscription(b,PENDING,draft(),synthetic);
 assert.equal(record(b,PENDING).transcription,null,'steps do not mutate their input');
 assert.equal(exclusionReason(record(imported,PENDING)),'unverified');
 assert.throws(()=>recordVerification(imported,PENDING,{...verification,verifiedBy:'Fixture Transcriber'},synthetic),/must not be the transcriber/);
 assert.throws(()=>recordVerification(imported,PENDING,{...verification,checks:['statement']},synthetic),/must confirm diagrams/);
 assert.throws(()=>recordVerification(imported,PENDING,{...verification,checkedAgainst:'https://example.invalid/elsewhere.pdf'},synthetic),/source document/);
 assert.throws(()=>recordVerification(b,PENDING,verification,synthetic),/import a transcription/);
 const verified=recordVerification(imported,PENDING,verification,synthetic);
 assert.equal(exclusionReason(record(verified,PENDING)),null);
 assert.equal(usableHistoricalQuestions(verified,synthetic).questions.length,2);
 const reimported=importTranscription(verified,PENDING,{...draft(),statement:draft().statement+' Corrected.'},synthetic);
 assert.equal(record(reimported,PENDING).verification,null);
 // Withdrawing permission removes the text as well as the verification.
 const withdrawn=recordReuseDecision(verified,PENDING,{decision:'link-only',basis:'Permission withdrawn.',decidedBy:'Fixture Owner',decidedOn:'2026-02-01'},synthetic);
 assert.equal(record(withdrawn,PENDING).transcription,null);
 assert.equal(record(withdrawn,PENDING).verification,null);
 assert.throws(()=>recordReuseDecision(b,'hist-missing-q1',permission,synthetic),/No source record/);
});

test('historical questions stay apart from generated practice throughout the API',async t=>{
 const [usable]=usableHistoricalQuestions(fixture(),synthetic).questions;
 assert.equal(usable.origin,'historical');assert.equal(usable.source.kind,'historical');
 assert.equal(usable.source.publisherLabel,SAMPLE_LABEL);assert.match(usable.source.label,/Sample Questions$/);
 for(const key of ['solution','rubric','answer','templateId','generator','parameters'])assert.equal(Object.hasOwn(usable,key),false,key);
 for(const q of [...questionBank,...generateMock({seed:'separation',count:30}).questions]){
  assert.equal(q.source.kind,'original');assert.ok(!q.id.startsWith('hist-'));assert.equal(Object.hasOwn(q,'origin'),false);
 }
 for(const r of [...bank().records,...fixture().records]){
  assert.equal(getQuestion(r.id),null);
  assert.equal(resolveQuestionRef({id:r.id}),null);
  assert.equal(resolveQuestionRef({id:r.id,version:'0.1.0'}),null);
 }
 assert.ok(historicalSourceIndex(fixture()).every(r=>!Object.hasOwn(r,'transcription')&&!JSON.stringify(r).includes('SYNTHETIC FIXTURE,')));

 const server=createApp().listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base=`http://127.0.0.1:${server.address().port}`;
 const historical=await (await fetch(`${base}/historical`)).json();
 assert.equal(historical.origin,'historical');
 assert.deepEqual(historical.questions,[]);
 assert.deepEqual(historical.excluded,{'reuse-pending':registry.chapterIndex.length});
 const sources=await (await fetch(`${base}/historical/sources`)).json();
 assert.equal(sources.records.length,registry.chapterIndex.length);
 assert.ok(sources.records.every(r=>r.origin==='historical'&&r.usable===false&&!Object.hasOwn(r,'transcription')));
 assert.ok(sources.records.filter(r=>r.source.exam==='ISI').every(r=>r.source.publisherLabel===SAMPLE_LABEL));
 const generated=await (await fetch(`${base}/bank`)).json();
 assert.ok(generated.questions.every(q=>q.source.kind==='original'&&!q.id.startsWith('hist-')));
 assert.equal((await fetch(`${base}/historical`,{method:'POST'})).status,405);
 assert.equal((await fetch(`${base}/historical?view=solutions`)).status,400);
 assert.equal((await fetch(`${base}/historical/hist-cmi-2025-aq2`)).status,404);
});

test('the editorial CLI checks the committed bank and edits a bank only when the result is valid',t=>{
 const quiet={log:()=>{},error:()=>{}};
 assert.equal(run(['check'],quiet),0);
 const dir=mkdtempSync(join(tmpdir(),'historical-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const fixtures=new URL('./fixtures/historical/',import.meta.url);
 cpSync(fixtures,dir,{recursive:true});
 const path=join(dir,'synthetic-bank.json'),args=['--bank',path,'--registry',join(dir,'synthetic-sources.json'),'--allow-synthetic'];
 const lines=[];
 assert.equal(run(['check',...args],{log:l=>lines.push(l),error:l=>lines.push(l)}),0);
 assert.match(lines.join('\n'),/2 source records valid; 1 usable; excluded: reuse-pending 1/);
 // Without --allow-synthetic the fixtures are rejected, as they would be in the committed bank.
 assert.equal(run(['check','--bank',path,'--registry',join(dir,'synthetic-sources.json')],quiet),1);
 assert.throws(()=>run(['import',PENDING,'--draft',join(dir,'synthetic-draft.json'),...args],quiet),/does not allow/);
 run(['reuse',PENDING,'--decision','permission-granted','--basis','Synthetic.','--by','Fixture Owner','--on','2026-01-05','--evidence','Synthetic fixture.',...args],quiet);
 run(['import',PENDING,'--draft',join(dir,'synthetic-draft.json'),...args],quiet);
 assert.throws(()=>run(['verify',PENDING,'--by','Fixture Verifier','--on','2026-01-12','--checked-against','https://example.invalid/synthetic-paper-2001.pdf','--checks','statement',...args],quiet),/must confirm/);
 run(['verify',PENDING,'--by','Fixture Verifier','--on','2026-01-12','--checked-against','https://example.invalid/synthetic-paper-2001.pdf','--checks',VERIFICATION_CHECKS.join(','),...args],quiet);
 assert.equal(usableHistoricalQuestions(JSON.parse(readFileSync(path,'utf8')),synthetic).questions.length,2);
 // A missing diagram file blocks the write and fails the check.
 rmSync(join(dir,'diagrams/synthetic-square.svg'));
 const before=readFileSync(path,'utf8');
 assert.throws(()=>run(['import',PENDING,'--draft',join(dir,'synthetic-draft.json'),...args],quiet),/diagram file diagrams\/synthetic-square.svg is missing/);
 assert.equal(readFileSync(path,'utf8'),before);
 assert.equal(run(['check',...args],quiet),1);
 writeFileSync(join(dir,'extra.json'),'{}');
 assert.throws(()=>run(['import',PENDING,'--draft',join(dir,'extra.json'),...args],quiet),/statement is required/);
});
