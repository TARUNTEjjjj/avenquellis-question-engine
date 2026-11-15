#include <noether/questions.hpp>

#include <charconv>
#include <iostream>
#include <set>
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
    "Options: --topic TOPIC, --exam CMI|ISI|RMO, --difficulty foundation|advanced|olympiad,\n"
    "         --type all|proof|numeric, --seed TEXT or --seed-number INTEGER.\n"
    "Commands print JSON containing answer keys and authored practice rubrics.\n";

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
    if (command == "get" && argc == 3) {
        if (auto q = find_bank_question(argv[2])) return to_json(*q);
        throw std::invalid_argument("Unknown bank id.");
    }
    if (command != "question" && command != "mock" && command != "chapter" && command != "replay")
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
