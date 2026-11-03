# Exact arithmetic from AxiomMath C++20

The browser integration compiles the user's actual [AxiomMath](https://github.com/TARUNTEjjjj/axiom-math) core at commit `ae5b38257b7825db603ecd5c7b28ade32c1a613f`. The vendored `rational.cpp`, `expression.cpp`, headers, license, README and upstream tests are unchanged. `vendor/axiom-math/PROVENANCE.json` records SHA-256 hashes and the build refuses modified vendor files. The MIT copyright notice belongs to Tarun Tej and is retained in the browser artifact.

`cpp/bridge.cpp` adds only a length-aware C ABI and JSON serialization. Parsing, rational arithmetic, reduction, overflow handling, and equality execute in the compiled C++ core. No JavaScript floating-point computation decides an arithmetic result.

## Browser API

Copy the complete `browser/` artifact into the website's `dist/math/` directory. Serve through HTTP(S), with `.wasm` served as `application/wasm`. The browser performs all evaluation locally after downloading the module.

```js
import {initExactMath,evaluateExact,checkExact} from './math/exact-math.js';
await initExactMath();
evaluateExact('0.1 + 0.2'); // {ok:true,value:'3/10',steps:[...]}
checkExact('1/3', '0.333333'); // {ok:true,equivalent:false,left:'1/3',right:'333333/1000000'}
```

Both evaluation functions are synchronous after initialization. `evaluateExact` returns `{ok:true,value,steps:[{expression,value}]}` or `{ok:false,error,position?}`. `checkExact` returns `{ok:true,equivalent,left,right}` or `{ok:false,error,position?,side?}`. Error positions are zero-based UTF-8 byte offsets. `initExactMath()` shares one instance among concurrent callers and rejects download/instantiation errors; calls before initialization and internal runtime failures return `code: "engine_unavailable"`. Grading callers must treat this as ungraded, never as an incorrect student answer. Embedded NUL input is explicitly rejected before the C ABI.

The supported grammar is integers, finite decimals, `+`, `-`, `*`, `/`, unary signs, and parentheses. Powers, symbolic variables, functions, implicit multiplication, and equations are intentionally unsupported. Stored results have a signed 64-bit numerator and positive signed 64-bit denominator, with checked 128-bit intermediate operations. A nonrepresentable reduced subexpression returns an error, even if a later operation would cancel it. Expressions are bounded to 4,096 bytes, 1,024 tokens, and 64 nesting levels. Decimals allow 19 integer digits and 18 fractional digits. These explicit limits prevent silent rounding; this module is not an arbitrary-precision symbolic algebra system or a proof verifier.

## Rebuild

Node.js 20+, Python 3.10+, and a native C++20 Clang compiler are required. Install the official [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) into a local work directory; do not modify shell startup files or global configuration.

```sh
git clone https://github.com/emscripten-core/emsdk.git work/emsdk
git -C work/emsdk checkout d7b4130688bfa348392b921ab04015aa15c4f154
cd work/emsdk
./emsdk install 6.0.13
./emsdk activate 6.0.13
cd ../..
node scripts/build-exact.mjs --emsdk work/emsdk --build-dir work/exact-build
npm run test:all
```

For systems where Python on PATH is too old, pass `--python /absolute/path/to/python3` to the build script. Native-only verification is available with `--native-only`. The build outputs `axiom-math-runtime.js`, `axiom-math-runtime.wasm`, the MIT notice, and `build-info.json` including hashes. Generated artifacts are not committed; CI attaches the verified complete browser directory as `axiom-exact-math-browser`. The [workflow](../.github/workflows/build-exact.yml) uses pinned action and emsdk commits and runs on relevant main-branch changes or a pull request, and can also be triggered manually. On a fresh clone, `npm test` runs the generator checks without requiring a prebuilt WASM module. After building or restoring the artifact, `npm run test:all` runs both suites.

The build uses Emscripten's supported [modular ES-module factory](https://emscripten.org/docs/compiling/Modularized-Output.html), `-fexceptions` to preserve C++ error handling, and `DYNAMIC_EXECUTION=0`. A site using Content Security Policy must allow WebAssembly compilation (typically `script-src 'self' 'wasm-unsafe-eval'`) and the local module URL.

## Verification

The upstream native suite exercises 33,198 assertions across seven test groups. Integration tests load the actual `.wasm` binary, compare 600 generated expressions with independent BigInt rational calculations and native C++ results, and compare 512 full-width cases including overflow and division by zero. Additional tests check exact decimal inequality, evaluation steps, byte positions, nesting/token/length limits, recovery after errors, repeated calls, and concurrent initialization. These tests support the documented arithmetic contract; they do not establish arbitrary proof correctness.
