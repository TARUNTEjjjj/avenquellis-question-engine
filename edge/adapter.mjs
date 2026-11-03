/** ABI v1: transport only. Every selection, seed draw, rubric and mock is produced in C++. */
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal:true});
const modes = {question:1,mock:2,chapter:3};
const optionKeys = new Set(['mode','topic','exam','difficulty','type','seed','count']);
const refKeys = new Set(['id','templateId','seed','exam','difficulty']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [null,Object.prototype].includes(Object.getPrototypeOf(value));
const fail = message => { throw Object.assign(new Error(message),{code:'invalid_input'}); };
const flag = (value, fallback) => value === undefined ? fallback :
  typeof value === 'string' && value.length<=64 ? value : fail('A selector must be a string of up to 64 characters.');
function wellFormed(text) {
  for(let i=0;i<text.length;++i) {
    const unit=text.charCodeAt(i);
    if(unit>=0xd800 && unit<=0xdbff){const next=text.charCodeAt(++i);if(!(next>=0xdc00 && next<=0xdfff))return false;}
    else if(unit>=0xdc00 && unit<=0xdfff)return false;
  }
  return true;
}

export function createNativeGenerator(module) {
  // Standalone Emscripten reactor. No filesystem, network or clock is available
  // to the math core. libc++'s unused I/O routines return WASI errno BADF.
  const badFd=()=>8;
  const wasi={fd_close:badFd,fd_write:badFd,fd_read:badFd,fd_seek:badFd,fd_fdstat_get:badFd,
    environ_sizes_get:()=>0,environ_get:()=>0,proc_exit:()=>{throw Error('Unexpected native exit.');}};
  const instance=new WebAssembly.Instance(module,{wasi_snapshot_preview1:wasi,env:{emscripten_notify_memory_growth:()=>{}}});
  const abi=instance.exports;
  abi._initialize();
  if(abi.veyra_abi_version()!==1)throw Error('Unsupported native generator ABI.');
  function invoke(op,fields) {
    const bytes = fields.map(value=>value===undefined?null:encoder.encode(value));
    const length=bytes.reduce((sum,b)=>sum+2+(b?.length||0),0);
    if(length>abi.veyra_capacity())fail('Request exceeds generator input capacity.');
    const start=abi.veyra_input();
    const data=new Uint8Array(abi.memory.buffer,start,length);
    let offset=0;
    for(const value of bytes) {
      const n=value===null?65535:value.length;
      data[offset++]=n&255;data[offset++]=n>>>8;
      if(value!==null){data.set(value,offset);offset+=n;}
    }
    // Synchronous copy and invocation: no input view is shared across awaits.
    const status=abi.veyra_call(op,length), size=abi.veyra_output_size();
    if(size>1024*1024)throw Error('Native output exceeds the response limit.');
    const text=decoder.decode(new Uint8Array(abi.memory.buffer,abi.veyra_output(),size));
    if(status===1)fail(text);
    if(status!==0)throw Error('Native generation failed.');
    return JSON.parse(text);
  }
  return {
    generate(options) {
      if(!record(options)||Object.keys(options).some(k=>!optionKeys.has(k))||!Object.hasOwn(modes,options.mode))
        fail('Use question, chapter or mock mode with supported fields.');
      const seed=options.seed===undefined?1:options.seed,count=options.count===undefined?6:options.count;
      if(typeof seed==='string' ? seed.length>249||!wellFormed(seed) : !Number.isSafeInteger(seed))fail('Use a valid text seed or a safe integer.');
      if(!Number.isInteger(count)||count<1||count>30)fail('Count must be from 1 to 30.');
      return invoke(modes[options.mode],[flag(options.topic,'all'),flag(options.exam,'CMI'),flag(options.difficulty,'advanced'),flag(options.type,'all'),typeof seed,String(seed),String(count)]);
    },
    resolve(ref) {
      if(!record(ref)||Object.keys(ref).some(k=>!refKeys.has(k))||typeof ref.id!=='string'||ref.id.length>160)return null;
      const fields=[ref.id,ref.templateId,ref.seed,ref.exam,ref.difficulty];
      if(fields.some(s=>s!==undefined && (typeof s!=='string'||s.length>256||!wellFormed(s))))return null;
      return invoke(4,fields);
    },
    bank(){return invoke(5,[]);}
  };
}
