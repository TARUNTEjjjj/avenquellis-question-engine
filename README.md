# Noether Question Engine

A dependency-free mathematics practice engine for the Noether preparation website. It generates original wording and worked solutions from **24 finite, deterministic mathematical templates**, with six topics and reproducible seeds. This is a working template engine, not a trained generative model. Difficulty labels are author estimates and have not been calibrated against actual candidates.

## Run

Requires Node.js 20 or newer. No installation is necessary.

```sh
npm test
npm start
```

The local API listens at `http://127.0.0.1:4101`. Set `PORT` to change the port. It is intended for local integration; production needs authentication, rate limits, and server-side answer storage.

## JavaScript integration

```js
import { generateQuestion, generateMock, questionBank, topics } from './src/index.js';
const question = generateQuestion({topic:'number-theory', difficulty:'olympiad', exam:'RMO', seed:42});
const mock = generateMock({exam:'ISI', topic:'all', difficulty:'advanced', count:8, seed:17});
```

`src/index.js` works unchanged in browsers. It exports `topics`, `topicLabels`, `difficulties`, `exams`, `engineInfo`, `questionBank`, `generateQuestion`, `generateMock`, and `getQuestion`.

Topics: `algebra`, `number-theory`, `combinatorics`, `geometry`, `calculus`, `probability`.

Difficulty: `foundation`, `advanced`, `olympiad`. Aliases `easy`, `medium`, `hard`, and `challenge` are accepted. Individual question selection prefers the requested level and discloses the actual template level as `difficulty`. Mock assembly prioritizes that level, then uses other levels for variety. RMO mixed sets exclude calculus and probability, and explicit requests for these combinations are rejected.

Every question has:

- `id`, `title`, `statement`, `topic`, `difficulty`, `exam`, `type` (`proof` or `numeric`).
- `maxMarks`, `solution`, `rubric` with criterion IDs, descriptions, and points.
- An exact `answer` for numeric questions; fractions are strings such as `1/12`.
- `source`, `templateId`, `parameters`, and a reproducible `generator` seed.

Mocks contain `id`, `title`, `exam`, `durationMinutes`, `maxMarks`, `questions`, `source`, and a practice-format notice. Counts range from 1 to 30. Durations and 10-point question scores are practice settings, **not replicas of official exam patterns**. Repeated template families may occur in longer sets, but normalized duplicate statements are excluded using deterministic bounded retries. Calculus has 26 distinct statements in the current finite template domains, so larger calculus-only requests are rejected clearly. All topic selections support the frontend counts of 6, 12, and 18. Difficulty is a preference; every question discloses its actual level.

## HTTP contract

```sh
curl http://127.0.0.1:4101/health
curl http://127.0.0.1:4101/topics
curl http://127.0.0.1:4101/bank
curl -X POST http://127.0.0.1:4101/mock \
  -H 'Content-Type: application/json' \
  -d '{"exam":"CMI","topic":"algebra","count":6,"seed":10}'
```

`POST /generate` accepts question options; `POST /mock` also accepts `count`. Invalid JSON or invalid option values return 400; incorrect content type returns 415; bodies above 16 KB return 413. The engine intentionally does not call an external model or transmit learner answers.

## Official paper sources and chapter index

`data/sources.json` keeps verified official links, publisher labels, and a chapter index of 22 referenced questions. It links the [CMI undergraduate archive](https://www.cmi.ac.in/admissions/syllabus.php), [ISI B.Stat sample-question archive](https://admission.isical.ac.in/Programs/BStat.html), and [HBCSE mathematics archive](https://olympiads.hbcse.tifr.res.in/past-papers-sample-questions/). The registry was checked on 3 November 2026.

Official papers and generated practice have separate provenance. The repository does not claim that its originals appeared in those exams and does not contain a complete licensed historical question bank. The ISI archive labels its documents “Sample Questions”; that label is preserved. A full chapterwise historical bank still needs rights review, faithful transcription, diagram handling, chapter tagging, and editorial verification.

## Verification and growth path

Tests cover determinism, schema and rubric invariants, RMO topic constraints, request validation, HTTP behavior, and independent numerical checks over 200 seeds. For example, lattice-path answers are independently checked with dynamic programming and subset counts with exhaustive enumeration. Numeric checks complement mathematical reasoning; they do not certify arbitrary generated proofs.

To add an AI generator, require a structured question schema, symbolic or independent solution checks where applicable, duplicate detection, adversarial solver review, and human approval before questions enter scored tests. Hold out templates from evaluation to avoid measuring memorization. Never label unchecked outputs as official papers or as guaranteed valid.

The browser bundle exposes solutions so it is appropriate for self-study only. Competitive or proctored delivery must store question keys server-side and send only learner-safe question fields during a test.
