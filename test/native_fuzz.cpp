#include <noether/questions.hpp>

#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <map>
#include <set>
#include <string>
#include <vector>

namespace {

using namespace noether::questions;

void check(bool ok, const char* msg) {
    if (!ok) {
        std::cerr << "FAIL: " << msg << '\n';
        std::abort();
    }
}

void test_mock_uniqueness_and_rubric_conservation() {
    for (int seed_idx = -25; seed_idx < 100; ++seed_idx) {
        Options opt;
        opt.exam = (seed_idx % 3 == 0) ? "CMI" : ((seed_idx % 3 == 1 || seed_idx % 3 == -1) ? "ISI" : "RMO");
        opt.seed = static_cast<std::int64_t>(seed_idx * 7919);
        const int count = (opt.exam == "RMO") ? 6 : 12;
        const auto mock = generate_mock(opt, count);
        check(static_cast<int>(mock.questions.size()) == count, "exact mock question count");

        int sum_marks = 0;
        std::set<std::string> statements;
        std::set<std::string> ids;
        for (const auto& q : mock.questions) {
            sum_marks += q.max_marks;
            int rubric_pts = 0;
            for (const auto& c : q.rubric) {
                check(c.points > 0 && !c.description.empty(), "criterion invariants");
                rubric_pts += c.points;
            }
            check(rubric_pts == q.max_marks, "criterion sum conservation");
            check(statements.insert(q.statement).second, "zero duplicate statements in mock");
            check(ids.insert(q.id).second, "unique question ids inside mock");

            const auto replayed = replay(q.template_id, q.seed, q.exam, q.requested_difficulty);
            check(to_json(replayed) == to_json(q), "deterministic replay invariance");
        }
        check(sum_marks == mock.max_marks, "mock total max_marks conservation");
    }
}

void test_metamorphic_and_unicode_seeds() {
    const std::vector<std::string> seeds{
        "alpha-01",
        "euler-\xcf\x80-gamma",
        "\xf0\x9f\x8c\xb1\xf0\x9f\xa6\x89",
        "cmi-2026-\xe0\xa4\xb8\xe0\xa4\x82\xe0\xa4\x96\xe0\xa5\x8d\xe0\xa4\xaf\xe0\xa4\xbe",
        std::string(64, 'k'),
    };
    std::set<std::string> seen_ids;
    for (const auto& s : seeds) {
        Options o1;
        o1.exam = "isi";
        o1.topic = "";
        o1.seed = s;
        Options o2;
        o2.exam = "ISI";
        o2.topic = "all";
        o2.seed = s;
        const auto m1 = generate_mock(o1, 10);
        const auto m2 = generate_mock(o2, 10);
        check(to_json(m1) == to_json(m2), "metamorphic exam case and empty topic canonicalization");
        seen_ids.insert(m1.id);
    }
    check(seen_ids.size() == seeds.size(), "collision-free mock IDs across distinct Unicode/ASCII seeds");
}

} // namespace

int main() {
    test_mock_uniqueness_and_rubric_conservation();
    test_metamorphic_and_unicode_seeds();
    std::cout << "PASS avenquellis-question-engine native fuzz + rubric conservation + metamorphic tests\n";
    return 0;
}
