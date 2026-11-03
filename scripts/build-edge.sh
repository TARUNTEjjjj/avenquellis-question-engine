#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
compiler="${EMXX:-em++}"
"$compiler" --version | head -n 1 | grep -F '6.0.13'
out="${1:-build-edge}"
mkdir -p "$out"
"$compiler" -std=c++20 -Oz -flto -fwasm-exceptions --no-entry \
    -sSTANDALONE_WASM=1 -sFILESYSTEM=0 -sMALLOC=emmalloc -sINITIAL_MEMORY=8388608 -sSTACK_SIZE=262144 \
    -sEXPORTED_FUNCTIONS=_veyra_abi_version,_veyra_input,_veyra_capacity,_veyra_output,_veyra_output_size,_veyra_call \
    -Iinclude src/native/catalog.cpp src/native/engine.cpp src/native/json.cpp edge/bridge.cpp -o "$out/veyra-questions.wasm"
cp edge/adapter.mjs "$out/adapter.mjs"
node --input-type=module - "$out" "$(git rev-parse HEAD)" <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [folder,commit]=process.argv.slice(2),name='veyra-questions.wasm';
const bytes=readFileSync(folder+'/'+name),module=new WebAssembly.Module(bytes);
const sha=data=>createHash('sha256').update(data).digest('hex');
const metadata={component:'Veyra Math question engine',abi:1,sourceCommit:commit,toolchain:'Emscripten 6.0.13',wasm:name,bytes:bytes.length,sha256:sha(bytes),adapterSha256:sha(readFileSync(folder+'/adapter.mjs')),imports:WebAssembly.Module.imports(module)};
writeFileSync(folder+'/manifest.json',JSON.stringify(metadata,null,2)+'\n');console.log(JSON.stringify(metadata));
JS
