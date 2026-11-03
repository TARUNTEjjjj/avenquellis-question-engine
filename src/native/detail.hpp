#pragma once

#include <noether/questions.hpp>

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace noether::questions::detail {

class Random {
public:
    explicit Random(std::string_view seed);
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
    Content (*make)(Random&);
};

const std::vector<Family>& catalog();
std::uint32_t hash(std::string_view text);
std::string json_string(std::string_view text);

} // namespace noether::questions::detail
