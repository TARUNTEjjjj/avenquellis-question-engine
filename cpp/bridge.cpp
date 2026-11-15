#include "bridge.h"
#include "axiom/math/expression.hpp"
#include <exception>
#include <string>
#include <string_view>

namespace {
std::string response;
// A step repeats the source text of its whole subexpression, so in a long chain of operations every step
// repeats most of the input: one 4 KiB expression could serialize to about 10 MB. Steps are listed in
// evaluation order only until their JSON would pass this size, and the number left out is reported.
constexpr std::size_t max_steps_json = 65536;
std::string quote(const std::string_view value) {
    std::string result = "\"";
    constexpr char hex[] = "0123456789abcdef";
    for (const unsigned char c : value) {
        switch (c) {
            case '"': result += "\\\""; break;
            case '\\': result += "\\\\"; break;
            case '\b': result += "\\b"; break;
            case '\f': result += "\\f"; break;
            case '\n': result += "\\n"; break;
            case '\r': result += "\\r"; break;
            case '\t': result += "\\t"; break;
            default:
                if (c < 0x20) {
                    result += "\\u00";
                    result += hex[c >> 4];
                    result += hex[c & 0xf];
                } else result += static_cast<char>(c);
        }
    }
    result += '"';
    return result;
}
std::string error_json(const axiom::math::ExpressionError& error,
                       const std::string_view side = {}) {
    return "{\"ok\":false,\"error\":" + quote(error.what()) +
           ",\"position\":" + std::to_string(error.position()) +
           (side.empty() ? "" : ",\"side\":" + quote(side)) + "}";
}
std::string_view input(const char* data, const size_t length) {
    if (!data && length) throw std::invalid_argument("Null expression pointer.");
    return std::string_view(data ? data : "", length);
}
} // namespace

extern "C" const char* axiom_evaluate(const char* expression, const size_t length) {
    try {
        const auto result = axiom::math::evaluate(input(expression, length), true);
        response = "{\"ok\":true,\"value\":" + quote(result.value.str()) + ",\"steps\":[";
        const auto start = response.size();
        std::size_t listed = 0;
        for (const auto& step : result.steps) {
            // Quoting never shortens text, so a step whose source alone does not fit is not quoted.
            if (response.size() - start + step.expression.size() > max_steps_json) break;
            const auto item = std::string(listed ? "," : "") + "{\"expression\":" + quote(step.expression) +
                              ",\"value\":" + quote(step.result.str()) + "}";
            if (response.size() - start + item.size() > max_steps_json) break;
            response += item;
            ++listed;
        }
        response += ']';
        if (listed < result.steps.size()) response += ",\"omittedSteps\":" + std::to_string(result.steps.size() - listed);
        response += '}';
    } catch (const axiom::math::ExpressionError& error) {
        response = error_json(error);
    } catch (const std::exception& error) {
        response = "{\"ok\":false,\"error\":" + quote(error.what()) + "}";
    } catch (...) {
        response = "{\"ok\":false,\"error\":\"Unexpected arithmetic failure.\"}";
    }
    return response.c_str();
}
extern "C" const char* axiom_check(const char* left, const size_t left_length,
                                  const char* right, const size_t right_length) {
    std::string_view side = "left";
    try {
        const auto l = axiom::math::evaluate(input(left, left_length));
        side = "right";
        const auto r = axiom::math::evaluate(input(right, right_length));
        response = "{\"ok\":true,\"equivalent\":" +
                   std::string(l.value == r.value ? "true" : "false") +
                   ",\"left\":" + quote(l.value.str()) +
                   ",\"right\":" + quote(r.value.str()) + "}";
    } catch (const axiom::math::ExpressionError& error) {
        response = error_json(error, side);
    } catch (const std::exception& error) {
        response = "{\"ok\":false,\"error\":" + quote(error.what()) +
                   ",\"side\":" + quote(side) + "}";
    } catch (...) {
        response = "{\"ok\":false,\"error\":\"Unexpected arithmetic failure.\"}";
    }
    return response.c_str();
}
