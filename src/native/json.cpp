#include "detail.hpp"

namespace noether::questions::detail {

std::string json_string(std::string_view s) {
    constexpr char hex[] = "0123456789abcdef";
    std::string result = "\"";
    for (const char byte : s) {
        switch (byte) {
        case '"': result += "\\\""; break;
        case '\\': result += "\\\\"; break;
        case '\b': result += "\\b"; break;
        case '\f': result += "\\f"; break;
        case '\n': result += "\\n"; break;
        case '\r': result += "\\r"; break;
        case '\t': result += "\\t"; break;
        default:
            const auto c = static_cast<unsigned char>(byte);
            if (c < 32) {
                result += "\\u00";
                result += hex[c / 16];
                result += hex[c % 16];
            } else result += byte;
        }
    }
    return result + "\"";
}

} // namespace noether::questions::detail

namespace noether::questions {
namespace {
using detail::json_string;

constexpr auto source_json = R"({"kind":"original","label":"Avenquellis original practice · validated template","rights":"Original wording and solutions; standard mathematical results."})";
constexpr auto notice = "Original practice set. Topic mix, duration, and marks are configurable practice settings, "
    "not an official paper pattern. Difficulty is a preference; actual question levels are disclosed. Duplicate statements are excluded.";

class Object {
    std::string object_ = "{";
public:
    void add(std::string_view name, const std::string& encoded) {
        if (object_.size() > 1) object_ += ',';
        object_ += json_string(name) + ":" + encoded;
    }
    std::string finish() const { return object_ + "}"; }
};

template <class Collection, class Encode>
std::string array(const Collection& items, Encode encode) {
    std::string result = "[";
    for (const auto& item : items) {
        if (result.size() > 1) result += ',';
        result += encode(item);
    }
    return result + "]";
}

std::string criterion_json(const Criterion& c) {
    Object result;
    result.add("id", json_string(c.id));
    result.add("description", json_string(c.description));
    result.add("points", std::to_string(c.points));
    return result.finish();
}

} // namespace

std::string to_json(const Question& q) {
    Object result;
    result.add("id", json_string(q.id));
    result.add("title", json_string(q.title));
    result.add("statement", json_string(q.statement));
    result.add("topic", json_string(q.topic));
    result.add("difficulty", json_string(q.difficulty));
    result.add("requestedDifficulty", json_string(q.requested_difficulty));
    result.add("exam", json_string(q.exam));
    result.add("type", json_string(q.type));
    result.add("maxMarks", std::to_string(q.max_marks));
    result.add("solution", json_string(q.solution));
    result.add("rubric", array(q.rubric, criterion_json));
    if (q.answer) {
        const auto* n = std::get_if<int>(&*q.answer);
        result.add("answer", n ? std::to_string(*n) : json_string(std::get<std::string>(*q.answer)));
    }
    result.add("source", source_json);
    result.add("templateId", json_string(q.template_id));
    Object parameters;
    for (const auto& [key, value] : q.parameters) {
        if (auto* n = std::get_if<int>(&value)) parameters.add(key, std::to_string(*n));
        else parameters.add(key, array(std::get<std::vector<int>>(value), [](int v) { return std::to_string(v); }));
    }
    result.add("parameters", parameters.finish());
    Object generator;
    generator.add("kind", "\"deterministic-template\"");
    generator.add("version", "\"0.1.0\"");
    generator.add("seed", json_string(q.seed));
    result.add("generator", generator.finish());
    return result.finish();
}

std::string to_json(const std::vector<Question>& questions) {
    return array(questions, [](const Question& q) { return to_json(q); });
}

std::string to_json(const Mock& m) {
    Object result;
    result.add("id", json_string(m.id));
    result.add("title", json_string(m.title));
    result.add("exam", json_string(m.exam));
    result.add("difficulty", json_string(m.difficulty));
    result.add("type", json_string(m.type));
    result.add("durationMinutes", std::to_string(m.duration_minutes));
    result.add("maxMarks", std::to_string(m.max_marks));
    result.add("questions", to_json(m.questions));
    result.add("source", source_json);
    result.add("notice", json_string(notice));
    return result.finish();
}

} // namespace noether::questions
