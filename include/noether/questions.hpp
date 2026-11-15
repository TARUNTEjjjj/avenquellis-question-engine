#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <variant>
#include <vector>

namespace noether::questions {

// Preserve the distinction between JSON numeric and string seeds in mock IDs.
using Seed = std::variant<std::int64_t, std::string>;
using Parameter = std::variant<int, std::vector<int>>;
using Answer = std::variant<int, std::string>;

struct Options {
    std::string topic = "all";
    std::string difficulty = "advanced";
    std::string exam = "CMI";
    std::string type = "all";
    Seed seed = std::int64_t{1};
};

struct Criterion {
    std::string id;
    std::string description;
    int points;
};

struct Question {
    std::string id;
    std::string template_id;
    std::string seed;
    // The version of the family's content (generator.version), which a saved reference carries.
    std::string version;
    std::string title;
    std::string statement;
    std::string topic;
    std::string difficulty;
    std::string requested_difficulty;
    std::string exam;
    std::string type;
    int max_marks = 10;
    std::string solution;
    std::vector<Criterion> rubric;
    std::map<std::string, Parameter> parameters;
    std::optional<Answer> answer;
};

// A saved question reference contains identifiers, never a caller-supplied solution or rubric.
// version is the question's content version (generator.version). A reference resolves only while its
// family still has that version, so it never yields content that a later release changed. A reference
// without a version names 0.1.0, the version of every question issued before references carried one.
struct Reference {
    std::string id;
    std::optional<std::string> template_id, seed, exam, difficulty;
    // The default member initializer keeps five-value initializers, written before references carried a
    // version, free of missing-initializer warnings.
    std::optional<std::string> version = std::nullopt;
};

struct Mock {
    std::string id;
    std::string title;
    std::string exam;
    std::string difficulty;
    std::string type;
    int duration_minutes;
    int max_marks;
    std::vector<Question> questions;
};

// One stable CMI edition per authored family, in catalog order.
std::vector<Question> bank();
std::optional<Question> find_bank_question(const std::string& id);
std::optional<Question> resolve_reference(const Reference& reference);
Question generate_question(const Options& options = {});
Mock generate_mock(const Options& options = {}, int count = 6);
Mock generate_chapter(const Options& options, int count = 6);

// Reconstruct a generated question using its returned template ID and generator seed.
// Its canonical id is returned so an external caller can compare it with a saved id.
// replay uses the current seed hash. resolve_reference also accepts a reference saved by an
// earlier release whose seed contains a supplementary character, which hashed differently then.
Question replay(const std::string& template_id, const std::string& variant_seed,
                const std::string& exam, const std::string& requested_difficulty);

std::string to_json(const Question& question);
std::string to_json(const Mock& mock);
std::string to_json(const std::vector<Question>& questions);

} // namespace noether::questions
