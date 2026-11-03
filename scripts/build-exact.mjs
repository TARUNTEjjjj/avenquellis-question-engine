import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const option=(key,fallback)=>{const i=args.indexOf(key);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing value for ${key}`);return resolve(args[i+1]);};
const nativeOnly=args.includes('--native-only');
const buildDir=option('--build-dir',join(root,'work','exact-build'));
const sdk=option('--emsdk',process.env.EMSDK ? resolve(process.env.EMSDK) : resolve(root,'../../work/emsdk'));
const output=option('--out',join(root,'browser'));
const python=option('--python',process.env.EMSDK_PYTHON);
const vendor=join(root,'vendor','axiom-math');
const provenance=JSON.parse(readFileSync(join(vendor,'PROVENANCE.json'),'utf8'));
for(const [file,hash] of Object.entries(provenance.files)){
 const current=createHash('sha256').update(readFileSync(join(vendor,file))).digest('hex');
 if(current!==hash)throw Error(`Pinned AxiomMath source was modified: ${file}`);
}
function run(bin,flags,env=process.env){const result=spawnSync(bin,flags,{stdio:'inherit',env});if(result.error)throw result.error;if(result.status!==0)throw Error(`${bin} failed with status ${result.status}`);}
mkdirSync(buildDir,{recursive:true});mkdirSync(output,{recursive:true});
const sources=[join(vendor,'src','rational.cpp'),join(vendor,'src','expression.cpp')];
const common=['-std=c++20','-O2','-Wall','-Wextra','-Werror','-I',join(vendor,'include')];
const compiler=process.env.CXX||'clang++';
run(compiler,[...common,...sources,join(root,'cpp','bridge.cpp'),join(root,'cpp','native-driver.cpp'),'-o',join(buildDir,'native-driver')]);
run(compiler,[...common,...sources,join(vendor,'tests','test_math.cpp'),'-o',join(buildDir,'upstream-tests')]);
run(join(buildDir,'upstream-tests'),[]);
if(nativeOnly){console.log(`Native core and upstream tests passed: ${buildDir}`);process.exit(0);}
const empp=join(sdk,'upstream','emscripten','em++');
if(!existsSync(empp))throw Error(`Missing official Emscripten compiler at ${empp}. Install pinned 6.0.13 into the local emsdk directory; see docs/exact-math.md.`);
const env={...process.env,EM_CONFIG:join(sdk,'.emscripten'),EM_CACHE:join(sdk,'upstream','emscripten','cache'),...(python?{EMSDK_PYTHON:python,PATH:dirname(python)+':'+process.env.PATH}:{})};
const version=spawnSync(empp,['--version'],{encoding:'utf8',env});
if(version.status!==0||!/\b6\.0\.13\b/.test(version.stdout))throw Error('This reproducible build requires Emscripten 6.0.13.');
const flags=[...common,'-fexceptions',...sources,join(root,'cpp','bridge.cpp'),'--no-entry','-sMODULARIZE=1','-sEXPORT_ES6=1','-sEXPORT_NAME=createAxiomMath','-sENVIRONMENT=web,worker,node','-sEXPORTED_FUNCTIONS=_axiom_evaluate,_axiom_check','-sEXPORTED_RUNTIME_METHODS=ccall','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=67108864','-sSTACK_SIZE=1048576','-sDYNAMIC_EXECUTION=0','-sFILESYSTEM=0','-o',join(output,'axiom-math-runtime.js')];
run(empp,flags,env);
copyFileSync(join(vendor,'LICENSE'),join(output,'AXIOM-MATH-LICENSE.txt'));
if(output!==join(root,'browser'))copyFileSync(join(root,'browser','exact-math.js'),join(output,'exact-math.js'));
const artifacts=['axiom-math-runtime.js','axiom-math-runtime.wasm'];
const metadata={source:provenance.repository,commit:provenance.commit,license:'MIT',toolchain:'Emscripten 6.0.13',target:'wasm32-unknown-emscripten',standard:'C++20',sourceFiles:provenance.files,flags:flags.map(flag=>flag.replaceAll(root,'<repository>')),artifacts:Object.fromEntries(artifacts.map(name=>[name,{bytes:readFileSync(join(output,name)).length,sha256:createHash('sha256').update(readFileSync(join(output,name))).digest('hex')}]))};
writeFileSync(join(output,'build-info.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(`Built real AxiomMath WebAssembly: ${output}`);
