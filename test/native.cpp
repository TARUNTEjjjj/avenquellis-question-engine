#include <noether/questions.hpp>

#include <algorithm>
#include <iostream>
#include <numeric>
#include <set>
#include <stdexcept>

namespace {
using namespace noether::questions;

void check(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }

template<class Fn>
void rejects(Fn attempt) {
    try { attempt(); } catch (const std::logic_error&) { return; }
    throw std::runtime_error("Expected input to be rejected.");
}

int param(const Question& q, const char* key) { return std::get<int>(q.parameters.at(key)); }

// The content version that a family has now, for references that the tests write by hand.
std::string version_of(const std::string& family) {
    for (const auto& q : bank()) if (q.template_id == family) return q.version;
    throw std::runtime_error("unknown family");
}

void test_bank() {
    const auto items = bank();
    check(items.size() == 48, "catalog size");
    std::set<std::string> ids;
    int proofs = 0;
    for (const auto& q : items) {
        check(ids.insert(q.id).second && !q.statement.empty() && !q.solution.empty(), "invalid bank row");
        check(q.rubric.size() >= 3 && q.rubric.size() <= 4, "invalid rubric length");
        int total = 0;
        for (const auto& c : q.rubric) { check(c.points > 0 && !c.description.empty(), "invalid criterion"); total += c.points; }
        check(total == q.max_marks, "rubric total");
        if (q.type == "proof") ++proofs;
        check(q.answer.has_value() == (q.type == "numeric"), "answer type");
        check(to_json(q) == to_json(replay(q.template_id, q.seed, q.exam, q.difficulty)), "seed replay");
    }
    check(proofs == 39 && !find_bank_question("missing"), "bank lookup");
}

void test_numeric() {
    for (int i = 0; i < 100; ++i) {
        const auto seed = std::to_string(i) + ":variant";
        auto paths = replay("comb-paths", seed, "ISI", "advanced");
        std::vector<int> dp(static_cast<std::size_t>(param(paths, "n")) + 1, 1);
        for (int x = 1; x <= param(paths, "m"); ++x) for (std::size_t y = 1; y < dp.size(); ++y) dp[y] += dp[y - 1];
        check(std::get<int>(*paths.answer) == dp.back(), "path counting oracle");
        auto subsets = replay("comb-no-adjacent", seed, "ISI", "advanced");
        int count = 0;
        for (int bits = 0; bits < (1 << param(subsets, "n")); ++bits) if ((bits & (bits >> 1)) == 0) ++count;
        check(std::get<int>(*subsets.answer) == count, "subset oracle");
        auto urn = replay("probability-urn", seed, "CMI", "foundation");
        const int a = param(urn, "a"), b = param(urn, "b");
        int good = 0, possible = 0;
        for (int x = 0; x < a + b; ++x) for (int y = 0; y < a + b; ++y) if (x != y) {
            ++possible;
            if (x < a && y < a) ++good;
        }
        const int g = std::gcd(good, possible);
        check(std::get<std::string>(*urn.answer) == std::to_string(good / g) + "/" + std::to_string(possible / g), "urn counting oracle");
    }
}

void test_mocks() {
    Options o;
    o.exam = "RMO"; o.topic = "number-theory"; o.difficulty = "hard"; o.seed = std::int64_t{42};
    const auto m = generate_chapter(o, 18);
    check(m.type == "proof" && m.max_marks == 180 && m.duration_minutes == 270, "mock shape");
    std::set<std::string> seen;
    for (const auto& q : m.questions) check(q.topic == o.topic && q.type == "proof" && seen.insert(q.statement).second, "chapter selection");
    check(to_json(m) == to_json(generate_mock(o, 18)), "determinism");
    for (const auto& q : m.questions) {
        Reference ref{q.id, q.template_id, q.seed, q.exam, q.requested_difficulty, q.version};
        const auto restored = resolve_reference(ref);
        check(restored && to_json(*restored) == to_json(q), "mock reference replay");
        ref.id += "0";
        check(!resolve_reference(ref), "tampered id");
    }
    Reference canonical{"number-gcd-17s23lf", {}, {}, {}, {}, version_of("number-gcd")};
    check(resolve_reference(canonical).has_value(), "bank reference");
    canonical.exam = "RMO";
    check(!resolve_reference(canonical), "forged bank metadata");
    auto generated = generate_question(o);
    auto malformed = replay(generated.template_id, "42:mock:4096", "RMO", "olympiad");
    check(!resolve_reference({malformed.id, malformed.template_id, malformed.seed, "RMO", "olympiad", malformed.version}), "invalid attempt");
    rejects([&] { generate_mock(o, 0); });
    o.topic = "calculus"; rejects([&] { generate_mock(o); });
    o.topic = "all"; rejects([&] { generate_chapter(o); });
    o.type = "numeric"; rejects([&] { generate_question(o); });
    o.exam = "ISI"; o.topic = "geometry"; rejects([&] { generate_mock(o, 10); });
    o.topic = "algebra"; o.seed = std::string(250, 'x'); rejects([&] { generate_question(o); });
    o.seed = std::string("\xff", 1); rejects([&] { generate_question(o); });
}

void test_unicode_refs() {
    Options o;
    std::string emoji;
    for (int i = 0; i < 65; ++i) emoji += "😀";
    o.seed = emoji;
    const auto q = generate_question(o);
    check(q.id == "advanced-probability-hidden-urn-8cn5f4", "JavaScript supplementary-character seed hash");
    auto restored = resolve_reference({q.id, q.template_id, q.seed, q.exam, q.requested_difficulty, q.version});
    check(restored && to_json(*restored) == to_json(q), "valid long Unicode reference");
    // Earlier releases hashed a supplementary character as its UTF-16 high surrogate and issued this id.
    const auto legacy = resolve_reference({"probability-indicators-bo56kn", "probability-indicators", emoji + ":variant", "CMI", "advanced",
                                           version_of("probability-indicators")});
    check(legacy && legacy->id == "probability-indicators-bo56kn" && param(*legacy, "n") == 9, "legacy supplementary-character reference");
    Options tiger, panda; // U+1F42F and U+1F43C share the high surrogate U+D83D.
    tiger.seed = std::string("team-🐯");
    panda.seed = std::string("team-🐼");
    check(generate_mock(tiger).id != generate_mock(panda).id &&
          generate_question(tiger).statement != generate_question(panda).statement, "distinct supplementary characters");

    std::string raw;
    for (int i = 0; i < 124; ++i) raw += "😀"; // 248 units, leaving eight for ":variant".
    o.seed = raw;
    const auto longest = generate_question(o);
    check(resolve_reference({longest.id, longest.template_id, longest.seed, longest.exam,
                             longest.requested_difficulty, longest.version}).has_value(), "exact 256-unit reference");
    o.seed = raw + "a";
    rejects([&] { generate_question(o); });
    const auto mock = generate_mock(o, 1); // A shorter ":mock:0" suffix still fits.
    const auto& m = mock.questions.front();
    check(resolve_reference({m.id, m.template_id, m.seed, m.exam, m.requested_difficulty, m.version}).has_value(), "exact 256-unit mock seed");
    const auto invalid = raw + "x:variant";
    rejects([&] { replay("number-gcd", invalid, "CMI", "advanced"); });
    check(!resolve_reference({longest.id, longest.template_id, invalid, "CMI", "advanced", longest.version}), "oversize reference");
    const std::string bad("\xed\xa0\x80", 3); // A UTF-8 encoding of a surrogate.
    check(!resolve_reference({longest.id, longest.template_id, bad + ":variant", "CMI", "advanced", longest.version}), "malformed seed");
}

void test_bank_id_collision() {
    // This seed hashes like the bank seed of the chosen family, so the generated id is the bank id.
    Options o;
    o.difficulty = "foundation"; o.type = "proof"; o.seed = std::string("u0䁯퇦");
    const auto q = generate_question(o);
    const auto edition = find_bank_question(q.id);
    check(edition && edition->seed != q.seed, "generated id equals a bank id");
    const auto restored = resolve_reference({q.id, q.template_id, q.seed, q.exam, q.requested_difficulty, q.version});
    check(restored && to_json(*restored) == to_json(q), "generated reference sharing a bank id");
    const auto by_id = resolve_reference({q.id, {}, {}, {}, {}, edition->version});
    check(by_id && to_json(*by_id) == to_json(*edition), "bank id and version alone");
    Options m;
    m.seed = std::string("g0⺖긪");
    int shared = 0;
    for (const auto& question : generate_mock(m).questions) {
        shared += find_bank_question(question.id).has_value() ? 1 : 0;
        const auto r = resolve_reference({question.id, question.template_id, question.seed, question.exam, question.requested_difficulty,
                                          question.version});
        check(r && to_json(*r) == to_json(question), "mock reference sharing a bank id");
    }
    check(shared == 1, "mock question with a bank id");
}

void test_content_versions() {
    // A saved reference carries generator.version and resolves only to content of that version, so a
    // family whose content a later release changes gives no question rather than a different one.
    Options o;
    o.seed = std::string("week-1");
    for (const auto& q : generate_mock(o, 12).questions) {
        check(!q.version.empty() && to_json(q).find(",\"version\":\"" + q.version + "\",") != std::string::npos, "content version");
        Reference ref{q.id, q.template_id, q.seed, q.exam, q.requested_difficulty, q.version};
        const auto restored = resolve_reference(ref);
        check(restored && to_json(*restored) == to_json(q), "versioned reference");
        for (const auto& other : {std::string("0.0.0"), std::string("0.1"), std::string(), q.version + " ", q.version + ".1"}) {
            ref.version = other;
            check(!resolve_reference(ref), "reference to other content");
        }
        ref.version.reset(); // Saved before references carried a version, so it names 0.1.0.
        check(resolve_reference(ref).has_value() == (q.version == "0.1.0"), "unversioned reference");
    }
    for (const auto& edition : bank()) {
        check(resolve_reference({edition.id, {}, {}, {}, {}, edition.version}).has_value() &&
              !resolve_reference({edition.id, {}, {}, {}, {}, std::string("0.0.0")}), "versioned bank reference");
        // A five-value reference, as written before references carried a version, names 0.1.0.
        check(resolve_reference({edition.id, {}, {}, {}, {}}).has_value() == (edition.version == "0.1.0"), "unversioned bank reference");
    }
}

} // namespace

int main() {
    try { test_bank(); test_numeric(); test_mocks(); test_unicode_refs(); test_bank_id_collision(); test_content_versions(); }
    catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
