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
        Reference ref{q.id, q.template_id, q.seed, q.exam, q.requested_difficulty};
        const auto restored = resolve_reference(ref);
        check(restored && to_json(*restored) == to_json(q), "mock reference replay");
        ref.id += "0";
        check(!resolve_reference(ref), "tampered id");
    }
    Reference canonical{"number-gcd-17s23lf", {}, {}, {}, {}};
    check(resolve_reference(canonical).has_value(), "bank reference");
    canonical.exam = "RMO";
    check(!resolve_reference(canonical), "forged bank metadata");
    auto generated = generate_question(o);
    auto malformed = replay(generated.template_id, "42:mock:4096", "RMO", "olympiad");
    check(!resolve_reference({malformed.id, malformed.template_id, malformed.seed, "RMO", "olympiad"}), "invalid attempt");
    rejects([&] { generate_mock(o, 0); });
    o.topic = "calculus"; rejects([&] { generate_mock(o); });
    o.topic = "all"; rejects([&] { generate_chapter(o); });
    o.type = "numeric"; rejects([&] { generate_question(o); });
    o.exam = "ISI"; o.topic = "geometry"; rejects([&] { generate_mock(o, 10); });
    o.topic = "algebra"; o.seed = std::string(241, 'x'); rejects([&] { generate_question(o); });
    o.seed = std::string("\xff", 1); rejects([&] { generate_question(o); });
}

} // namespace

int main() {
    try { test_bank(); test_numeric(); test_mocks(); }
    catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
