#include "bridge.h"
#include "axiom/math/expression.hpp"
#include <exception>
#include <string>
#include <string_view>

namespace {
std::string response;
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
        bool first = true;
        for (const auto& step : result.steps) {
            if (!first) response += ',';
            first = false;
            response += "{\"expression\":" + quote(step.expression) +
                        ",\"value\":" + quote(step.result.str()) + "}";
        }
        response += "]}";
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
