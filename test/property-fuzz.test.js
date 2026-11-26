import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMock,
  generateQuestion,
  resolveQuestionRef,
  topics,
} from '../src/index.js';

test('seeded mock statistical uniqueness and balanced topic distribution (300 mocks)', () => {
  const topicHits = Object.fromEntries(topics.map((t) => [t, 0]));
  const totalMocks = 300;
  const perMock = 12;

  for (let s = 0; s < totalMocks; s++) {
    const mock = generateMock({ exam: 'CMI', topic: 'all', count: perMock, seed: `stat-${s * 97}` });
    assert.equal(mock.questions.length, perMock);
    const statements = new Set();
    let marks = 0;

    for (const q of mock.questions) {
      assert.ok(!statements.has(q.statement), `Duplicate statement in mock stat-${s * 97}`);
      statements.add(q.statement);
      marks += q.maxMarks;
      assert.ok(q.topic in topicHits);
      topicHits[q.topic] += 1;

      const rubricSum = q.rubric.reduce((acc, c) => acc + c.points, 0);
      assert.equal(rubricSum, q.maxMarks);

      const resolved = resolveQuestionRef({
        id: q.id,
        templateId: q.templateId,
        seed: q.generator.seed,
        exam: q.exam,
        difficulty: q.requestedDifficulty,
        version: q.generator.version,
      });
      assert.deepEqual(resolved, q);
    }
    assert.equal(marks, mock.maxMarks);
  }

  // Every topic must be meaningfully represented (no topic starvation)
  const expectedMean = (totalMocks * perMock) / topics.length;
  for (const [topic, count] of Object.entries(topicHits)) {
    assert.ok(count > expectedMean * 0.2, `Topic ${topic} starved: ${count} vs mean ${expectedMean}`);
  }
});

test('metamorphic option equivalence and UTF-16 boundary determinism', () => {
  const seeds = [0, -1, 2 ** 31 - 1, 'π-Euler-ζ(2)', '🧮🔬', 'abc\t\n"quoted"'];
  for (const seed of seeds) {
    const a = generateMock({ exam: 'isi', topic: '', count: 8, seed });
    const b = generateMock({ exam: 'ISI', topic: 'all', count: 8, seed });
    assert.deepEqual(a, b);
    const q = generateQuestion({ seed: typeof seed === 'number' ? String(seed) : seed });
    assert.ok(q.id.startsWith(q.templateId + '-'));
  }
});
