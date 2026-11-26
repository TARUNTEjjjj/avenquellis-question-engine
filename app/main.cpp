#include <noether/questions.hpp>

#include <charconv>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string_view>
#include <vector>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <shellapi.h>
// Older MinGW-w64 headers declare this Windows Vista flag only when _WIN32_WINNT is at least 0x0600.
#ifndef WC_ERR_INVALID_CHARS
#define WC_ERR_INVALID_CHARS 0x00000080
#endif
#endif

namespace {
using namespace noether::questions;
constexpr auto usage =
    "avenquellis-questions bank\n"
    "avenquellis-questions get ID\n"
    "avenquellis-questions question [options]\n"
    "avenquellis-questions mock [options] [--count 1..30]\n"
    "avenquellis-questions chapter --topic TOPIC [options] [--count 1..30]\n"
    "avenquellis-questions replay --family ID --variant-seed SEED [--exam TRACK] [--difficulty LEVEL]\n"
    "avenquellis-questions analyze [options] [--count 1..30]\n"
    "avenquellis-questions analyze-bank\n"
    "Options: --topic TOPIC, --exam CMI|ISI|RMO, --difficulty foundation|advanced|olympiad,\n"
    "         --type all|proof|numeric, --seed TEXT or --seed-number INTEGER.\n"
    "Commands print JSON containing answer keys, authored rubrics, or telemetry analysis.\n";

std::string json_escape(std::string_view s) {
    constexpr char hex[] = "0123456789abcdef";
    std::string out = "\"";
    for (const char ch : s) {
        switch (ch) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\b': out += "\\b"; break;
        case '\f': out += "\\f"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
            const auto b = static_cast<unsigned char>(ch);
            if (b < 0x20) {
                out += "\\u00";
                out += hex[b / 16];
                out += hex[b % 16];
            } else {
                out.push_back(ch);
            }
            break;
        }
    }
    out.push_back('"');
    return out;
}

std::string format_fixed4(double value) {
    char buf[64];
    std::snprintf(buf, sizeof(buf), "%.4f", value);
    return std::string(buf);
}

std::string analyze_questions_json(std::string_view kind, std::string_view exam, const std::vector<Question>& qs,
                                   std::size_t catalog_size) {
    std::map<std::string, int> by_topic, by_difficulty, by_type;
    std::set<std::string> unique_families;
    int total_marks = 0;
    std::size_t total_criteria = 0;
    int max_rubric_pts = 0;
    bool replay_ok = true;

    for (const auto& q : qs) {
        by_topic[q.topic] += 1;
        by_difficulty[q.difficulty] += 1;
        by_type[q.type] += 1;
        unique_families.insert(q.template_id);
        total_marks += q.max_marks;
        total_criteria += q.rubric.size();
        for (const auto& c : q.rubric) {
            if (c.points > max_rubric_pts) max_rubric_pts = c.points;
        }
        const auto rep = replay(q.template_id, q.seed, q.exam,
                                kind == "bank" ? q.difficulty : q.requested_difficulty);
        if (to_json(rep) != to_json(q)) replay_ok = false;
    }

    double entropy = 0.0;
    const double n = qs.empty() ? 1.0 : static_cast<double>(qs.size());
    for (const auto& [topic_name, cnt] : by_topic) {
        (void)topic_name;
        const double p = static_cast<double>(cnt) / n;
        if (p > 0.0) entropy -= p * std::log2(p);
    }
    const double max_ent = by_topic.size() > 1 ? std::log2(static_cast<double>(by_topic.size())) : 1.0;
    const double norm_entropy = by_topic.size() > 1 ? (entropy / max_ent) : (qs.empty() ? 0.0 : 1.0);
    const double mean_criteria = qs.empty() ? 0.0 : static_cast<double>(total_criteria) / n;
    const double family_cov = catalog_size == 0 ? 0.0 : static_cast<double>(unique_families.size()) / static_cast<double>(catalog_size);

    auto map_json = [](const std::map<std::string, int>& m) {
        std::ostringstream os;
        os << '{';
        bool first = true;
        for (const auto& [k, v] : m) {
            if (!first) os << ',';
            first = false;
            os << json_escape(k) << ':' << v;
        }
        os << '}';
        return os.str();
    };

    std::ostringstream os;
    os << "{\"kind\":" << json_escape(kind)
       << ",\"exam\":" << json_escape(exam)
       << ",\"questionCount\":" << qs.size()
       << ",\"totalMarks\":" << total_marks
       << ",\"uniqueFamilies\":" << unique_families.size()
       << ",\"catalogFamilies\":" << catalog_size
       << ",\"familyCoverage\":" << format_fixed4(family_cov)
       << ",\"totalCriteria\":" << total_criteria
       << ",\"meanCriteriaPerQuestion\":" << format_fixed4(mean_criteria)
       << ",\"maxCriterionPoints\":" << max_rubric_pts
       << ",\"topicEntropyBits\":" << format_fixed4(entropy)
       << ",\"normalizedTopicEntropy\":" << format_fixed4(norm_entropy)
       << ",\"replayVerified\":" << (replay_ok ? "true" : "false")
       << ",\"topics\":" << map_json(by_topic)
       << ",\"difficulties\":" << map_json(by_difficulty)
       << ",\"types\":" << map_json(by_type) << '}';
    return os.str();
}

template <typename I>
I integer(std::string_view text) {
    I value{};
    const auto [end, error] = std::from_chars(text.data(), text.data() + text.size(), value);
    if (error != std::errc{} || end != text.data() + text.size()) throw std::invalid_argument("Expected an integer.");
    return value;
}

std::string run(int argc, char** argv) {
    if (argc < 2) throw std::invalid_argument("Choose a command. See --help.");
    const std::string command = argv[1];
    if (command == "--help" && argc == 2) return usage;
    if (command == "bank" && argc == 2) return to_json(bank());
    if (command == "analyze-bank" && argc == 2) {
        const auto items = bank();
        return analyze_questions_json("bank", "CMI", items, items.size());
    }
    if (command == "get" && argc == 3) {
        if (auto q = find_bank_question(argv[2])) return to_json(*q);
        throw std::invalid_argument("Unknown bank id.");
    }
    if (command != "question" && command != "mock" && command != "chapter" && command != "replay" && command != "analyze")
        throw std::invalid_argument("Unknown command or incorrect argument count. See --help.");
    Options options;
    std::string family, variant;
    int count = 6;
    std::set<std::string> seen;
    for (int i = 2; i < argc; i += 2) {
        const std::string key = argv[i];
        if (i + 1 == argc || !seen.insert(key).second) throw std::invalid_argument("Missing or repeated option: " + key);
        const std::string value = argv[i + 1];
        if (key == "--exam") options.exam = value;
        else if (key == "--difficulty") options.difficulty = value;
        else if (command == "replay" && key == "--family") family = value;
        else if (command == "replay" && key == "--variant-seed") variant = value;
        else if (command == "replay") throw std::invalid_argument("Unsupported replay option: " + key);
        else if (key == "--topic") options.topic = value;
        else if (key == "--type") options.type = value;
        else if (key == "--seed") options.seed = value;
        else if (key == "--seed-number") options.seed = integer<std::int64_t>(value);
        else if (key == "--count" && command != "question") count = integer<int>(value);
        else throw std::invalid_argument("Unsupported option: " + key);
    }
    if (seen.contains("--seed") && seen.contains("--seed-number")) throw std::invalid_argument("Choose one seed type.");
    if (command == "question") return to_json(generate_question(options));
    if (command == "replay") return to_json(replay(family, variant, options.exam, options.difficulty));
    if (command == "analyze") {
        const auto m = generate_mock(options, count);
        return analyze_questions_json("mock", m.exam, m.questions, bank().size());
    }
    return to_json(command == "chapter" ? generate_chapter(options, count) : generate_mock(options, count));
}

#ifdef _WIN32
// Windows passes argv in the ANSI code page, which replaces or re-encodes a seed's Greek letters, emoji
// or accented letters, so the seed would hash differently than in JavaScript or be rejected. Convert the
// UTF-16 command line to UTF-8 instead, as other platforms pass it.
std::vector<std::string> utf8_arguments() {
    int count = 0;
    wchar_t** wide = CommandLineToArgvW(GetCommandLineW(), &count);
    if (!wide) throw std::runtime_error("Could not read the command line.");
    std::vector<std::string> result;
    for (int i = 0; i < count; ++i) {
        // With a length of -1 the conversion includes the terminating NUL.
        const int size = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, wide[i], -1, nullptr, 0, nullptr, nullptr);
        std::string text(size > 0 ? static_cast<std::size_t>(size) : 0, '\0');
        if (size <= 0 || WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, wide[i], -1, text.data(), size, nullptr, nullptr) != size) {
            LocalFree(wide);
            throw std::invalid_argument("Arguments must be valid Unicode.");
        }
        text.pop_back();
        result.push_back(std::move(text));
    }
    LocalFree(wide);
    return result;
}
#endif

} // namespace

int main(int argc, char** argv) {
    try {
#ifdef _WIN32
        auto arguments = utf8_arguments();
        std::vector<char*> pointers;
        for (auto& argument : arguments) pointers.push_back(argument.data());
        pointers.push_back(nullptr);
        argc = static_cast<int>(arguments.size());
        argv = pointers.data();
#endif
        std::cout << run(argc, argv) << '\n' << std::flush;
        if (!std::cout) throw std::runtime_error("Could not write output.");
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "avenquellis-questions: " << e.what() << '\n';
        return 2;
    }
}
