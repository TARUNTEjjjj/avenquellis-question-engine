# Avenquellis Question Engine

A C++20 library and command-line tool for generating CMI, ISI and RMO practice. It includes **48 authored mathematical families across six topics**. Thirty-nine families generate proof questions and nine generate numeric questions. Each question has a worked solution, a ten-point rubric, provenance and a seed for replay. The browser-compatible JavaScript implementation serves the same bank and produces the same seeded variants. Difficulty labels are author estimates.

## Build the native backend

CMake 3.20+, a C++20 compiler and a native build tool such as Make or Ninja are sufficient. The native library and CLI build from the checkout without downloads. Node.js 20+ enables an additional browser parity test.

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
ctest --test-dir build --output-on-failure
./build/avenquellis-questions --help
```

The installed CLI is `avenquellis-questions`. The original `noether-questions` executable and CMake target remain available for existing consumers. The CLI prints UTF-8 JSON. Invalid options and exhausted variant pools produce an error on stderr and exit code 2.

```sh
# The complete bank, or one known bank proof.
./build/avenquellis-questions bank
./build/avenquellis-questions get number-gcd-17s23lf

# One seeded proof, a chapter test, and a mixed mock.
./build/avenquellis-questions question --topic algebra --type proof --exam ISI --seed week-1
./build/avenquellis-questions chapter --topic number-theory --exam RMO --count 12 --seed-number 42
./build/avenquellis-questions mock --exam CMI --difficulty olympiad --count 18 --seed practice-A

# Reproduce a variant from a returned templateId and generator.seed.
./build/avenquellis-questions replay --family number-gcd --variant-seed week-1:variant --exam ISI --difficulty advanced
```

`--seed` accepts valid UTF-8. On Windows the CLI reads its arguments as Unicode rather than in the ANSI code page, and MSVC builds compile the UTF-8 sources with `/utf-8`, so seeds and statements match other platforms. A complete generator seed, including its `:variant` or `:mock:N` suffix, is limited to 256 UTF-16 code units to match browser reference validation. Supplementary characters such as 😀 count as two units. A single-question seed can therefore contain 248 units, and the available length for a mock seed depends on its attempt suffix. `--seed-number` accepts a JavaScript-safe integer. The two types are preserved when calculating mock IDs. Each family supplies deterministic draws and computes its own parameters, text, proof and numeric answer where applicable. Chapter generation takes a single topic. Mock generation supports 1–30 questions and rejects requests that exhaust the selected finite pool.

## Link the C++ library

```cpp
#include <avenquellis/questions.hpp>

avenquellis::questions::Options options;
options.exam = "RMO";
options.topic = "number-theory";
options.seed = "week-1";
auto test = avenquellis::questions::generate_chapter(options, 6);
const auto& proof = test.questions.front();
auto json = avenquellis::questions::to_json(proof);
```

Use `cmake --install build --prefix /path/to/prefix` and point the consuming project’s `CMAKE_PREFIX_PATH` at that prefix. Link the imported target as follows.

```cmake
find_package(AvenquellisQuestions 0.2 CONFIG REQUIRED)
target_link_libraries(my_program PRIVATE AvenquellisQuestions::questions)
```

The original `NoetherQuestions::questions` package target, `<noether/questions.hpp>` header and `noether::questions` namespace remain available for existing consumers. Both names link the same library.

Version 0.2 adds the content `version` to `Question` and `Reference`. Code written for 0.1 still compiles: a five-value `Reference` initializer leaves the version empty, which names 0.1.0, and the member's default initializer keeps it free of missing-initializer warnings. Both structs changed layout, so rebuild everything that includes the header. A shared library's soname now carries the minor version, such as `libnoether_questions.so.0.2`, so a program does not load a library from another minor release. Programs linked against a 0.1 shared library, which had no versioned soname, still need a rebuild.

`bank()` returns one stable edition per family. `generate_question`, `generate_mock` and `generate_chapter` accept typed options. `resolve_reference` reconstructs a question from a bank ID or a generated ID plus template ID, seed, exam and requested difficulty, and the question's content `version`. Invalid or mismatched references return an empty optional. This lets a grading backend reconstruct a trusted solution and rubric. Each family's content has a version, returned as `generator.version`, and a release that changes a family's draws, text, answer or rubric gives that family a new version. A reference resolves only while its family still has the reference's version, so a saved reference never yields content that its learner did not see. Save the version with the reference: one without a version names 0.1.0, the version of every question issued before references carried one. Seeds are hashed by Unicode code point; a reference issued by an earlier release, which hashed a supplementary character such as 😀 by its UTF-16 high surrogate, still resolves to its original question. The lower-level `replay` function materializes a named family with a supplied variant seed under the current hash. A small consuming application is included in [examples/chapter.cpp](examples/chapter.cpp).

The native tests exercise solutions, rubrics, exhaustive counting oracles, reference validation, duplicate prevention and the installed CMake package. When Node is present, CTest also compares the entire bank, variants from every family, Unicode seeds, chapter tests and full mocks against the JavaScript API. Mathematical content changes should update both implementations and pass the parity check. A family whose content changes needs a new version in both catalogs and a new entry for that version in `test/content-fingerprints.json`, which `npm test` computes over every distinct statement of each family. Never change or remove an existing entry: references saved under the earlier version must keep resolving only to its content, and CI compares the file with the pull request's base and fails when an entry changed. A family's statements must also stay distinct from every other statement under the normalized duplicate key that JavaScript mocks use, because the native engine compares statements verbatim; `npm test` checks this for every family. Every generated suggestion remains original practice, and the bounded family space limits novelty.

## Cloudflare Pages generator

The production service runs this same C++ catalog as a server-side WebAssembly reactor. The JavaScript adapter validates input, copies bounded UTF-8 fields into linear memory and reads the returned JSON. Native code performs seed hashing, template selection, variation, rubric construction, mock assembly and authoritative saved-reference lookup.

A complete, pinned distribution is checked in under [release/edge](release/edge/manifest.json). Verify it without installing a compiler.

```sh
node edge/verify.mjs release/edge
```

It compares exact file bytes with pinned SHA-256 hashes, as the exact-math build does, so `.gitattributes` keeps LF line endings in checkouts on every platform.

To build a fresh module from source, use the pinned Emscripten 6.0.13 SDK and verify it against the existing API.

```sh
EMXX=/path/to/emsdk/upstream/emscripten/em++ bash scripts/build-edge.sh build-edge
node edge/verify.mjs build-edge
```

The build writes `avenquellis-questions.wasm`, `adapter.mjs`, `THIRD-PARTY-NOTICES.txt` for the linked Emscripten, musl and libc++ runtime code, and `manifest.json` with the exact source commit, compiler, ABI version, byte length, SHA-256 checksums and module imports. The script runs only in a Git checkout, and it refuses to build while its inputs differ from the checked-out commit. In a Git checkout, `edge/verify.mjs` requires the recorded commit to be in the checkout's history, which a shallow clone may lack. CI uploads the verified set together. The Pages deployment imports the WASM module at build time and instantiates it once per isolate. Each invocation copies a complete input and output synchronously. The reactor has a fixed 8 MiB memory and a 4 KiB input buffer, and the adapter rejects outputs above 1 MiB. Impossible finite-pool requests are rejected before generating candidates.

`check.yml` runs `node edge/verify.mjs release/edge` against the current JavaScript API on every push. A pull request that changes the native generator, the bridge or the adapter therefore has to commit a rebuilt set into `release/edge`: `avenquellis-questions.wasm`, `manifest.json`, `adapter.mjs` and `THIRD-PARTY-NOTICES.txt` from the `edge.yml` artifact of its head commit, or from `build-edge.sh` run on that pushed commit. Merge such a pull request with a merge commit rather than a squash or rebase, so that main keeps the commit the manifest names.

The web API accepts `POST /api/generate` with a JSON object. Set `mode` to `question`, `chapter` or `mock` and add the practice options below. A successful response contains `engine: "cpp-wasm"` and the original question or mock schema under `result`. The separate Node service remains available for JavaScript integrations.

## Run the JavaScript HTTP service

Requires Node.js 20 or newer. Question generation and `npm test` need no installation. The separate `npm run test:all` suite additionally requires the built WASM artifact and a C++20 compiler; see [the build guide](docs/exact-math.md).

```sh
npm test
npm start
```

The local API listens at `http://127.0.0.1:4101`. Set `PORT` to change the port. It is intended for local integration. Production needs authentication, rate limits, and server-side answer storage.

## JavaScript integration

```js
import { generateQuestion, generateMock, questionBank, topics } from './src/index.js';
const question = generateQuestion({topic:'number-theory', difficulty:'olympiad', exam:'RMO', seed:42});
const mock = generateMock({exam:'ISI', topic:'all', difficulty:'advanced', count:8, seed:17});
```

The JavaScript API uses the same seed contract as the native engine: well-formed Unicode strings or safe integers. Fractional numbers, booleans, objects, null and unpaired surrogates are rejected rather than coerced into a different seed. Seeds are hashed by Unicode code point, so seeds that differ only in a supplementary character such as 🐯 or 🐼 give different questions. Earlier releases hashed such a character by its UTF-16 high surrogate; `resolveQuestionRef` and the native `resolve_reference` still resolve references they issued to the original questions.

The other options follow the native rules too. The options must be a plain object whose keys are among `topic`, `exam`, `difficulty`, `type`, `seed` and `count`; any other key, such as a misspelled `Seed` or the web API's `mode`, is rejected rather than ignored. Only an omitted `topic`, `exam`, `difficulty`, `type` or `count` takes its default. These four selectors must be strings, so null, numbers, booleans and arrays are rejected, as are an empty exam, difficulty or type. An empty topic selects all topics. Only the ASCII letters of an exam are uppercased, as natively. A `count` that is present must be an integer from 1 to 30. `generateQuestion` applies the same check and then ignores the count, as question mode in the web API does.

`src/index.js` works unchanged in browsers. It exports `topics`, `topicLabels`, `difficulties`, `exams`, `engineInfo`, `questionBank`, `generateQuestion`, `generateMock`, `getQuestion` (a fresh copy of a bank question, or `null`), `resolveQuestionRef` (rebuilds a saved bank or generated reference, or returns `null`), and `choose`, plus `internals`, which this repository's tests use and which is not a stable API. To grade a question later, save `{id, templateId, seed: generator.seed, exam, difficulty: requestedDifficulty, version: generator.version}`; a bank question needs only its `id` and `version`. As with `resolve_reference`, a reference resolves only to the content of its version and returns `null` once a release has changed that family, and one without a `version` names 0.1.0. Integrations that save references should adopt `version` in this order. First deploy this release's edge adapter, because earlier adapters return `null` for any reference with a `version` key. Then save `version` with every reference before any family gets a new version. Once a family has a later version, its references without one return `null`, including references to questions generated after the change. Optional `type` selects `all`, `proof`, or `numeric`; RMO defaults to and enforces proof questions.

Topics: `algebra`, `number-theory`, `combinatorics`, `geometry`, `calculus`, `probability`.

Difficulty: `foundation`, `advanced`, `olympiad`. Aliases `easy`, `medium`, `hard`, and `challenge` are accepted. Individual question selection prefers the requested level and discloses the actual template level as `difficulty`. Mock assembly prioritizes that level, then uses other levels for variety. RMO mixed sets exclude calculus and probability, and explicit requests for these combinations are rejected.

`choose(n, k)` accepts nonnegative safe integers, returns zero when `k > n`, and computes exact binomial coefficients. Results above `Number.MAX_SAFE_INTEGER` throw rather than silently rounding.

Every question has:

- `id`, `title`, `statement`, `topic`, `difficulty`, `exam`, `type` (`proof` or `numeric`).
- `maxMarks`, `solution`, `rubric` with criterion IDs, descriptions, and points.
- An exact `answer` for numeric questions; fractions are strings such as `1/12`.
- `source`, `templateId`, `parameters`, and a `generator` with the reproducible seed and the content `version`.

Mocks contain `id`, `title`, `exam`, `durationMinutes`, `maxMarks`, `questions`, `source`, and a practice-format notice. Counts range from 1 to 30. Durations and 10-point question scores are practice settings, **not replicas of official exam patterns**. Repeated template families may occur in longer sets, but normalized duplicate statements are excluded using deterministic bounded retries. Narrow format/chapter combinations may exhaust their finite variant pool and are rejected clearly; when the count exceeds the number of distinct statements the selection can produce, the rejection comes before any question is generated, with the native message. Mixed-format topic selections support the frontend counts of 6, 12, and 18. Difficulty is a preference; every question discloses its actual level.

## HTTP contract

```sh
curl http://127.0.0.1:4101/health
curl http://127.0.0.1:4101/topics
curl http://127.0.0.1:4101/bank
curl -X POST http://127.0.0.1:4101/mock \
  -H 'Content-Type: application/json' \
  -d '{"exam":"CMI","topic":"algebra","count":6,"seed":10}'
```

`POST /generate` accepts question options; `POST /mock` also accepts `count`. `POST /generate` rejects an invalid `count` as well and ignores a valid one. Invalid JSON, unsupported option keys or invalid option values return 400; incorrect content type returns 415; bodies above 16 KB return 413; other paths and methods return 404, except that the [resource catalog](resources/README.md) route `/api/resources` answers methods other than GET with 405. An unfinished body returns 408 after 10 seconds and closes the connection. Embedders can set `createApp({bodyTimeoutMs})` from 10 to 60,000 milliseconds. Declared oversized bodies are rejected before buffering. The service answers 404, 405, 413 and 415 without waiting for the end of the request body, and such a reply carries `Connection: close`. It then keeps reading and discarding the upload before it closes the connection, so a client that is still sending receives that status instead of a connection reset. It stops reading after 8 MiB more or when `bodyTimeoutMs` has passed since the request arrived, whichever comes first, so a client that sends more or stalls may see the connection reset instead. The engine intentionally does not call an external model or transmit learner answers.

Add `?view=practice` to `/generate`, `/mock`, or `/bank` for an answer-free practice sheet. This view includes statements, marks, metadata, and reproducible identities while omitting solutions, numeric answers, rubrics, and internal template parameters. The default `view=solutions` response is unchanged. For example:

```sh
curl -X POST 'http://127.0.0.1:4101/mock?view=practice' \
  -H 'Content-Type: application/json' \
  -d '{"exam":"CMI","topic":"algebra","count":6,"seed":10}'
```

Practice view controls presentation; it is not an exam access-control mechanism. The full solutions remain available from the same service and deterministic source library.

## Official paper sources and chapter index

`data/sources.json` keeps verified official links, publisher labels, and a chapter index of 22 referenced questions. It links the [CMI undergraduate archive](https://www.cmi.ac.in/admissions/syllabus.php), [ISI B.Stat sample-question archive](https://admission.isical.ac.in/Programs/BStat.html), and [HBCSE mathematics archive](https://olympiads.hbcse.tifr.res.in/past-papers-sample-questions/). The registry was checked on 3 November 2026.

Official papers and generated practice have separate provenance. The repository does not claim that its originals appeared in those exams and does not contain a complete licensed historical question bank. The ISI archive labels its documents “Sample Questions”; that label is preserved. A full chapterwise historical bank still needs rights review, faithful transcription, diagram handling, chapter tagging, and editorial verification.

## Verification and growth path

Tests cover determinism, schema and rubric invariants, RMO topic constraints, request validation, HTTP behavior, and an independent check of every numeric family's answer key over 200 seeds; a new numeric family fails the test until it has one. For example, lattice-path answers are checked with dynamic programming, subset counts and urn probabilities by enumeration, and the symmetric-sum, integral and maximum keys against the numbers in their statements. Numeric checks complement mathematical reasoning; they do not certify arbitrary generated proofs.

To add an AI generator, require a structured question schema, symbolic or independent solution checks where applicable, duplicate detection, adversarial solver review, and human approval before questions enter scored tests. Hold out templates from evaluation to avoid measuring memorization. Never label unchecked outputs as official papers or as guaranteed valid.

The browser bundle exposes solutions so it is appropriate for self-study only. Competitive or proctored delivery must store question keys server-side and send only learner-safe question fields during a test.

## Compiled exact arithmetic

The browser module integrates the actual unchanged AxiomMath C++20 engine through WebAssembly. See [its API, pinned provenance, build instructions, and verification](docs/exact-math.md). This checks exact arithmetic equivalence, not mathematical proof correctness. Practice rubric point allocations are authored for this product and are not official CMI, ISI, or RMO grading weights.

## GitHub resource collection

Explore the project-specific [resource catalog](resources/README.md): curated references, star-ranked discovery, dated source metadata, cached failure recovery and an optional read-only server API. The repository includes a daily refresh workflow; hosted sites still follow their existing deployment process.
