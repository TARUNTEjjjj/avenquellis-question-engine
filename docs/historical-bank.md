# Historical question bank

The historical bank holds questions from official CMI, ISI and RMO documents. It is separate from the generated original practice in every respect: its own data file, module, routes and identifiers. This page defines its records, the editorial process that adds question text, and the gate that keeps unverified or unpermitted text out of the usable bank.

The bank currently holds **source records only**. `data/historical/bank.json` has one record for each of the 22 questions in the chapter index of `data/sources.json`. Every record's reuse decision is `pending-review`, none has a transcription, and the usable bank is empty. No exam question text is in this repository. The records are written in this repository's own words and link to the publisher's document.

## Source records

Each record in `data/historical/bank.json` has these fields. Unknown fields are rejected, so a misspelt field never passes as an absent one.

| Field | Meaning |
| --- | --- |
| `id` | `hist-<paperId>-<section>q<number>[-<part>]`, derived from the source, such as `hist-cmi-2025-aq2` or `hist-isi-ugb-2024-q1`. One source question has exactly one record. The `hist-` prefix never names a generated question. |
| `source.publisher` | The institution, equal to the registry archive's publisher. |
| `source.exam`, `source.year`, `source.paperId` | The paper, which must be listed in `data/sources.json` with the same exam and year. |
| `source.classification` | `official-paper`, `official-sample` or `official-solutions`, equal to the registry paper's `kind`. |
| `source.publisherLabel` | Required for an `official-sample` and only there. It must be exactly `Sample Questions`, the label ISI gives its archive documents, so the label is neither dropped nor attached to a paper that was not published under it. |
| `source.section`, `source.question`, `source.part` | The printed question identifier: an optional section letter such as `A`, the question number (at most the paper's `questionCount`) and an optional part such as `b` or `iii`. |
| `source.url` | The publisher's document, which must be the registry paper's `url` or `solutionsUrl`. `source.page` may give the page. |
| `reuse` | The documented reuse decision, below. |
| `chapters` | Engine topics, primary first. The primary chapter must match the chapter index. |
| `summary` | A short description in our own words. It is not the question. |
| `transcription` | `null` until imported. |
| `verification` | `null` until verified. |

### Reuse decisions

| `decision` | Question text allowed | Required |
| --- | --- | --- |
| `pending-review` | No | `basis` only. Records no decider, date or evidence. |
| `link-only` | No | `basis`, `decidedBy`, `decidedOn`. The question stays a link. |
| `permission-granted` | Yes | `basis`, `decidedBy`, `decidedOn` and `evidence` locating the written permission. |
| `open-licence` | Yes | `basis`, `decidedBy`, `decidedOn`, `licence` and an https `licenceUrl`. |

A transcription under a decision that does not allow text is a validation error, not merely an exclusion, because committing the text is itself the reproduction. `coversDiagrams: true` records that the permission or licence also covers the publisher's images; without it, every diagram must be redrawn. A reuse decision is recorded by the repository owner. The tooling only stores it; it never infers permission.

## Editorial import

Use `scripts/historical/historical-bank.mjs` from the repository root. Each command validates the complete result and writes the bank only when it is valid, through a temporary file and a rename.

1. **Record the reuse decision.** The owner records it after the rights review.

   ```sh
   node scripts/historical/historical-bank.mjs reuse hist-isi-ugb-2024-q1 \
     --decision permission-granted --basis "Written permission for the UGB 2024 sample questions." \
     --by "Owner Name" --on 2027-01-15 --evidence "Letter ref. ..., kept with the owner's records"
   ```

   A decision that no longer allows text, such as a withdrawn permission, also removes the record's transcription and verification.

2. **Import a faithful transcription.** An editor writes a draft file and imports it.

   ```json
   {
     "statement": "Exact wording, with [[diagram:figure-1]] where the figure appears.",
     "diagrams": [{"id": "figure-1", "file": "diagrams/isi-ugb-2024-q3-figure-1.svg", "alt": "What the figure shows, in words.", "method": "redrawn", "sourcePage": 2}],
     "transcribedBy": "Editor Name",
     "transcribedOn": "2027-01-20",
     "notes": "Optional editorial notes.",
     "chapters": ["geometry"]
   }
   ```

   ```sh
   node scripts/historical/historical-bank.mjs import hist-isi-ugb-2024-q3 --draft draft.json
   ```

   Transcribe the wording, notation, numbering and given values exactly, and do not add solutions. Mathematical notation may be written in plain text or LaTeX; note any rendering choice in `notes`. Diagrams are files in `data/historical/diagrams/`. Each has alt text, appears in the statement exactly once as `[[diagram:<id>]]`, and is `redrawn` unless `reuse.coversDiagrams` allows a `source-image`. `chapters` is optional and replaces the record's chapter tags. Importing again replaces the transcription and clears any verification.

3. **Verify.** A second editor, not the transcriber, compares the record with the source document and confirms all five checks: `statement`, `diagrams`, `chapters`, `classification` and `question-identifier`.

   ```sh
   node scripts/historical/historical-bank.mjs verify hist-isi-ugb-2024-q3 --by "Second Editor" --on 2027-01-22 \
     --checked-against https://admission.isical.ac.in/PreviousQuestion/BStat-BMath-UGB-2024.pdf \
     --checks statement,diagrams,chapters,classification,question-identifier
   ```

   The verification stores a SHA-256 `contentDigest` of the record's identifier, source, classification, label, chapters, statement and diagrams.

4. **Check** with `npm run historical:check`, which CI also runs. It validates the bank and the registry cross-checks, confirms that every diagram file exists, and reports how many questions are usable and why the rest are excluded.

## Verification gate

`usableHistoricalQuestions` in `src/historical.js` serves a record only when all of these hold. Otherwise the record is counted under the first failing reason.

| Reason | Condition |
| --- | --- |
| `reuse-pending`, `link-only` | The reuse decision is `permission-granted` or `open-licence`. |
| `not-transcribed` | A transcription exists. |
| `unverified` | A verification exists. |
| `verification-incomplete` | It confirms all five checks. |
| `verifier-not-independent` | The verifier is not the transcriber, compared without case. |
| `out-of-order-dates` | Decision, transcription and verification dates are in that order. |
| `checked-against-other-document` | The verifier compared the record's own `source.url`. |
| `changed-since-verification` | The content digest still matches. Any later edit to verified content requires a new verification. |

An invalid bank is never partly served: the gate throws, and the HTTP routes answer 503. The verifier's name and date are records of an editorial step, not proof that it happened; the gate enforces that the step was recorded, complete and independent of the transcription, and that nothing changed after it.

## API separation

- `GET /historical` returns `{origin: "historical", notice, questions, excluded}`. Each question has `origin: "historical"`, `source.kind: "historical"`, the publisher, classification, `publisherLabel` when there is one, the printed identifier, the source URL and the reuse decision. It has no solution, rubric, answer, template or generator.
- `GET /historical/sources` returns every source record without transcribed text, with `usable` true or false, as an index of links.
- Both routes accept only GET and no query parameters. They read the bank on each request.
- `/bank`, `/generate`, `/mock`, `POST /api/generate` and the C++ library return only generated questions, whose `source.kind` is `original`. `getQuestion` and `resolveQuestionRef` return `null` for a historical ID, so a saved generated reference can never resolve to historical content, or the reverse. Generated mocks never contain historical questions.

`src/historical.js` uses `node:crypto` and is therefore a server module; `src/index.js` remains browser-compatible.

## Test fixtures

`test/fixtures/historical/` holds a synthetic registry, bank, draft and diagram. Every fixture record is marked `synthetic: true`, names `Synthetic Fixture Press`, and uses `https://example.invalid/` URLs; their statements begin `SYNTHETIC FIXTURE`. The validator rejects synthetic records unless `allowSynthetic` (the CLI's `--allow-synthetic`) is set, and rejects `example.invalid` URLs on any record that is not synthetic, so fixtures cannot enter the committed bank and real records cannot pose as fixtures.

## Not done here

These steps need people and cannot be completed by the tooling:

- A rights review and a recorded reuse decision for each source document. None is recorded, and this repository does not claim that reproduction permission exists.
- Faithful transcription, diagram redrawing and independent editorial verification of the initial collection against the source PDFs. The validator checks each record against the registry's metadata (publisher, classification, label, year, URL and question count); comparing question text with a PDF is the verifier's task.
