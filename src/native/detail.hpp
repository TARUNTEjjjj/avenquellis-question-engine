#pragma once

#include <noether/questions.hpp>

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace noether::questions::detail {

class Random {
public:
    // legacy selects the seed hash of earlier releases (see hash) to replay their saved references.
    explicit Random(std::string_view seed, bool legacy = false);
    std::uint32_t next();
    int integer(int low, int high);
private:
    std::uint32_t state_;
};

struct Content {
    std::string statement;
    std::string solution;
    std::vector<Criterion> rubric;
    std::map<std::string, Parameter> parameters;
    std::optional<Answer> answer;
};

struct Family {
    std::string_view id, topic, difficulty, type, title;
    // Product of the finite parameter-domain sizes (one for a fixed theorem).
    int max_variants;
    // Version of the family's content, emitted as generator.version. Saved references carry it and resolve
    // only to that content, so a change to the draws, text, answer or rubric needs a new version here and
    // in the JavaScript template, and an entry for the new version in test/content-fingerprints.json.
    // Never change or remove an existing entry there.
    std::string_view version;
    Content (*make)(Random&);
};

const std::vector<Family>& catalog();
std::uint32_t hash(std::string_view text, bool legacy = false);
std::string json_string(std::string_view text);

} // namespace noether::questions::detail
