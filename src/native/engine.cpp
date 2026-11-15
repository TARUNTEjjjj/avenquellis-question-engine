#include "detail.hpp"

#include <algorithm>
#include <array>
#include <charconv>
#include <stdexcept>
#include <unordered_set>
#include <utility>

namespace noether::questions::detail {

namespace {
std::uint32_t next_scalar(std::string_view text, std::size_t& pos) {
    const unsigned first = static_cast<unsigned char>(text[pos++]);
    if (first < 128) return first;
    unsigned extra = 0;
    std::uint32_t cp = 0;
    if (first >= 0xc2 && first <= 0xdf) { cp = first & 31u; extra = 1; }
    else if (first >= 0xe0 && first <= 0xef) { cp = first & 15u; extra = 2; }
    else if (first >= 0xf0 && first <= 0xf4) { cp = first & 7u; extra = 3; }
    else throw std::invalid_argument("Seed is not valid UTF-8.");
    if (text.size() - pos < extra) throw std::invalid_argument("Incomplete UTF-8 seed.");
    for (unsigned j = 0; j < extra; ++j) {
        const unsigned b = static_cast<unsigned char>(text[pos++]);
        if ((b & 0xc0u) != 0x80u) throw std::invalid_argument("Invalid UTF-8 continuation.");
        cp = (cp << 6u) | (b & 63u);
    }
    if ((extra == 2 && cp < 0x800) || (extra == 3 && cp < 0x10000) ||
        (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff)
        throw std::invalid_argument("Invalid Unicode scalar.");
    return cp;
}
} // namespace

// A valid scalar needs at most three UTF-8 bytes per UTF-16 code unit.
// Reject a very large buffer before decoding it. Astral scalars count as two units.
bool seed_fits(std::string_view text, std::size_t limit) {
    if (text.size() > 3 * limit) return false;
    std::size_t units = 0;
    for (std::size_t pos = 0; pos < text.size();) {
        units += next_scalar(text, pos) > 0xffff ? 2u : 1u;
        if (units > limit) return false;
    }
    return true;
}

std::uint32_t hash(std::string_view s, bool legacy) {
    // JavaScript iterates Unicode code points, then hashes codePointAt(0). Earlier releases hashed
    // charCodeAt(0), only the high surrogate of a supplementary character, so seeds differing in one
    // such character from the same 1024-code-point block collided. legacy reproduces that hash.
    std::uint32_t h = 2166136261u;
    for (std::size_t pos = 0; pos < s.size();) {
        const auto cp = next_scalar(s, pos);
        const auto unit = legacy && cp > 0xffff ? 0xd800u + ((cp - 0x10000u) >> 10u) : cp;
        h = (h ^ unit) * 16777619u;
    }
    return h;
}

Random::Random(std::string_view seed, bool legacy) : state_(hash(seed, legacy)) {}

std::uint32_t Random::next() {
    state_ += 0x6d2b79f5u;
    auto t = (state_ ^ (state_ >> 15u)) * (1u | state_);
    t ^= t + (t ^ (t >> 7u)) * (61u | t);
    return t ^ (t >> 14u);
}

int Random::integer(int low, int high) {
    const auto range = static_cast<std::uint32_t>(high - low + 1);
    return low + static_cast<int>((static_cast<std::uint64_t>(next()) * range) >> 32u);
}

} // namespace noether::questions::detail

namespace noether::questions {
namespace {
using detail::Family;
using detail::Random;

constexpr std::array<std::pair<std::string_view, std::string_view>, 6> topics{{
    {"algebra", "Algebra"}, {"number-theory", "Number theory"}, {"combinatorics", "Combinatorics"},
    {"geometry", "Geometry"}, {"calculus", "Calculus"}, {"probability", "Probability"}
}};

std::string seed_text(const Seed& seed) {
    if (const auto* number = std::get_if<std::int64_t>(&seed)) {
        constexpr std::int64_t max_safe = 9007199254740991LL;
        if (*number < -max_safe || *number > max_safe) throw std::invalid_argument("Use a string for large seeds.");
        return std::to_string(*number);
    }
    const auto& text = std::get<std::string>(seed);
    // Even the shortest generated suffix (":mock:0") occupies seven code units.
    if (!detail::seed_fits(text, 249)) throw std::invalid_argument("Seed is too long for a 256-unit question reference.");
    return text;
}

Options normalized(Options o) {
    if (o.topic == "all" || o.topic == "mixed") o.topic.clear();
    if (!o.topic.empty() && std::none_of(topics.begin(), topics.end(), [&](auto t) { return t.first == o.topic; }))
        throw std::invalid_argument("Unknown topic: " + o.topic);
    if (o.difficulty == "easy") o.difficulty = "foundation";
    if (o.difficulty == "medium") o.difficulty = "advanced";
    if (o.difficulty == "hard" || o.difficulty == "challenge") o.difficulty = "olympiad";
    if (o.difficulty != "foundation" && o.difficulty != "advanced" && o.difficulty != "olympiad")
        throw std::invalid_argument("Unknown difficulty: " + o.difficulty);
    for (char& c : o.exam) if (c >= 'a' && c <= 'z') c = static_cast<char>(c - 'a' + 'A');
    if (o.exam != "CMI" && o.exam != "ISI" && o.exam != "RMO") throw std::invalid_argument("Unknown exam: " + o.exam);
    if (o.type != "proof" && o.type != "numeric" && o.type != "all") throw std::invalid_argument("Unknown type: " + o.type);
    if (o.exam == "RMO") {
        if (o.topic == "calculus" || o.topic == "probability") throw std::invalid_argument("RMO excludes this topic.");
        if (o.type == "numeric") throw std::invalid_argument("RMO uses proof questions.");
        o.type = "proof";
    }
    return o;
}

std::vector<const Family*> matching(const Options& o) {
    std::vector<const Family*> result;
    for (const auto& f : detail::catalog()) {
        if ((!o.topic.empty() && o.topic != f.topic) || (o.type != "all" && o.type != f.type)) continue;
        if (o.exam == "RMO" && (f.topic == "calculus" || f.topic == "probability")) continue;
        result.push_back(&f);
    }
    if (result.empty()) throw std::invalid_argument("No families match this chapter, track and format.");
    return result;
}

std::string base36(std::uint32_t n) {
    constexpr std::string_view digits = "0123456789abcdefghijklmnopqrstuvwxyz";
    std::string result;
    do { result += digits[n % 36u]; n /= 36u; } while (n);
    std::reverse(result.begin(), result.end());
    return result;
}

Question make(const Family& family, const std::string& seed, const Options& options, bool legacy = false) {
    if (!detail::seed_fits(seed, 256)) throw std::invalid_argument("A complete variant seed may use at most 256 UTF-16 code units.");
    Random random(seed, legacy);
    auto content = family.make(random);
    Question q;
    q.template_id = family.id;
    q.seed = seed;
    q.version = family.version;
    q.id = q.template_id + "-" + base36(detail::hash(seed, legacy));
    q.title = family.title;
    q.topic = family.topic;
    q.difficulty = family.difficulty;
    q.exam = options.exam;
    q.requested_difficulty = options.difficulty;
    q.type = family.type;
    q.statement = std::move(content.statement);
    q.solution = std::move(content.solution);
    q.rubric = std::move(content.rubric);
    q.parameters = std::move(content.parameters);
    q.answer = std::move(content.answer);
    return q;
}

Question replay_family(const std::string& template_id, const std::string& variant_seed,
                       const std::string& exam, const std::string& requested_difficulty, bool legacy) {
    if (variant_seed.empty() || variant_seed.size() > 3 * 256) throw std::invalid_argument("Invalid variant seed length.");
    Options options;
    options.exam = exam;
    options.difficulty = requested_difficulty;
    const auto o = normalized(options);
    for (const auto* family : matching(o)) {
        if (family->id == template_id) return make(*family, variant_seed, o, legacy);
    }
    throw std::invalid_argument("Unknown or ineligible family: " + template_id);
}

std::string mock_id(const Options& o, int count) {
    using detail::json_string;
    const auto seed = std::holds_alternative<std::string>(o.seed) ? json_string(seed_text(o.seed)) : seed_text(o.seed);
    const auto body = "{\"topic\":" + (o.topic.empty() ? "null" : json_string(o.topic)) +
        ",\"difficulty\":" + json_string(o.difficulty) + ",\"exam\":" + json_string(o.exam) +
        ",\"type\":" + json_string(o.type) + ",\"seed\":" + seed + ",\"count\":" + std::to_string(count) + "}";
    return "mock-" + base36(detail::hash(body));
}

} // namespace

std::vector<Question> bank() {
    std::vector<Question> result;
    for (const auto& family : detail::catalog()) {
        Options o;
        o.difficulty = family.difficulty;
        result.push_back(make(family, "bank:" + std::to_string(result.size() + 1), o));
    }
    return result;
}

std::optional<Question> find_bank_question(const std::string& id) {
    std::size_t index = 0;
    for (const auto& f : detail::catalog()) {
        const auto seed = "bank:" + std::to_string(++index);
        if (std::string(f.id) + "-" + base36(detail::hash(seed)) != id) continue;
        Options o;
        o.difficulty = f.difficulty;
        return make(f, seed, o);
    }
    return std::nullopt;
}


std::optional<Question> resolve_reference(const Reference& ref) {
    if (ref.id.empty() || ref.id.size() > 160 ||
        ref.id.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789-") != std::string::npos ||
        (ref.template_id && ref.template_id->size() > 100) ||
        (ref.seed && (ref.seed->empty() || ref.seed->size() > 3 * 256))) return std::nullopt;
    // A family's content can change in a later release, under a new version. The reference resolves only
    // while its family still has the version it was issued with, rather than to content it never had.
    const std::string_view version = ref.version ? std::string_view(*ref.version) : "0.1.0";
    // A bank id with no other or matching metadata names the bank edition. A generated question whose seed
    // hashes like its family's bank seed shares that id, and its full reference is verified as generated below.
    if (auto q = find_bank_question(ref.id)) {
        if ((!ref.template_id || *ref.template_id == q->template_id) && (!ref.seed || *ref.seed == q->seed) &&
            (!ref.exam || *ref.exam == q->exam) && (!ref.difficulty || *ref.difficulty == q->difficulty) &&
            q->version == version) return q;
    }
    if (!ref.template_id || !ref.seed || !ref.exam || !ref.difficulty) return std::nullopt;
    if (*ref.exam != "CMI" && *ref.exam != "ISI" && *ref.exam != "RMO") return std::nullopt;
    if (*ref.difficulty != "foundation" && *ref.difficulty != "advanced" && *ref.difficulty != "olympiad") return std::nullopt;
    if (!ref.seed->ends_with(":variant")) {
        const auto pos = ref.seed->rfind(":mock:");
        if (pos == std::string::npos) return std::nullopt;
        const auto suffix = std::string_view(*ref.seed).substr(pos + 6);
        unsigned attempt = 0;
        const auto [end, error] = std::from_chars(suffix.data(), suffix.data() + suffix.size(), attempt);
        if (suffix.empty() || suffix.size() > 4 || (suffix.size() > 1 && suffix.front() == '0') ||
            error != std::errc{} || end != suffix.data() + suffix.size() || attempt >= 4096) return std::nullopt;
    }
    try {
        // A reference saved by an earlier release carries the id of the legacy seed hash. Only a seed
        // with a supplementary character hashes differently, and it keeps resolving to its original content.
        const bool legacy = ref.id != *ref.template_id + "-" + base36(detail::hash(*ref.seed));
        auto q = replay_family(*ref.template_id, *ref.seed, *ref.exam, *ref.difficulty, legacy);
        if (q.id == ref.id && q.version == version) return q;
    } catch (const std::invalid_argument&) {
        // Unknown family, invalid seed, or an ineligible RMO selection.
    }
    return std::nullopt;
}

Question generate_question(const Options& options) {
    const Options o = normalized(options);
    const auto all = matching(o);
    std::vector<const Family*> preferred;
    for (auto* family : all) if (family->difficulty == o.difficulty) preferred.push_back(family);
    const auto& pool = preferred.empty() ? all : preferred;
    const auto seed = seed_text(o.seed);
    Random r(seed);
    const auto index = static_cast<std::size_t>(r.integer(0, static_cast<int>(pool.size()) - 1));
    return make(*pool[index], seed + ":variant", o);
}

Mock generate_mock(const Options& options, int count) {
    if (count < 1 || count > 30) throw std::invalid_argument("Mock count must be between 1 and 30.");
    const Options o = normalized(options);
    const auto all = matching(o);
    int capacity = 0;
    for (const auto* family : all) capacity += family->max_variants;
    if (count > capacity)
        throw std::length_error("At most " + std::to_string(capacity) + " distinct statements exist in this selection. Reduce count or select mixed topics.");
    const auto seed = seed_text(o.seed);
    Random r(seed);
    std::vector<const Family*> pool;
    // Draw keys for preferred and other families in separate passes, in catalog order.
    for (const bool preferred : {true, false}) {
        std::vector<std::pair<std::uint32_t, const Family*>> ranked;
        for (auto* family : all) if ((family->difficulty == o.difficulty) == preferred)
            ranked.emplace_back(r.next(), family);
        std::stable_sort(ranked.begin(), ranked.end(), [](auto a, auto b) { return a.first < b.first; });
        for (auto [rank, family] : ranked) pool.push_back(family);
    }
    std::string chapter = "Mixed";
    for (const auto& [topic, label] : topics) if (topic == o.topic) chapter = label;
    Mock mock{mock_id(o, count), o.exam + " " + chapter + " Practice", o.exam, o.difficulty, o.type, 15 * count, 10 * count, {}};
    std::unordered_set<std::string> seen;
    // The JavaScript mock skips a statement whose NFKC, whitespace and case-normalized key it has already used.
    // Exact equality skips the same statements only while no two distinct statements of the catalog share a
    // normalized key, as 5^88 and 58^8 printed with superscript exponents would (both become 588).
    // test/engine.test.js checks this for every family.
    for (std::size_t attempt = 0; attempt < 4096 && mock.questions.size() < static_cast<std::size_t>(count); ++attempt) {
        auto q = make(*pool[attempt % pool.size()], seed + ":mock:" + std::to_string(attempt), o);
        if (seen.insert(q.statement).second) mock.questions.push_back(std::move(q));
    }
    if (mock.questions.size() != static_cast<std::size_t>(count))
        throw std::length_error("Only " + std::to_string(mock.questions.size()) + " distinct statements could be assembled. Reduce count or select mixed topics.");
    return mock;
}

Mock generate_chapter(const Options& options, int count) {
    if (normalized(options).topic.empty()) throw std::invalid_argument("A chapter requires one topic.");
    return generate_mock(options, count);
}

Question replay(const std::string& template_id, const std::string& variant_seed,
                const std::string& exam, const std::string& requested_difficulty) {
    return replay_family(template_id, variant_seed, exam, requested_difficulty, false);
}

} // namespace noether::questions
