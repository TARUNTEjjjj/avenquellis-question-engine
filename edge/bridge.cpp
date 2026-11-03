// Length-prefixed ABI. Each field is a little-endian uint16 length followed by
// its UTF-8 bytes. 0xffff represents an absent optional reference field.
#include <noether/questions.hpp>
#include <array>
#include <charconv>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <string_view>

namespace {
using namespace noether::questions;
std::array<std::uint8_t, 4096> input{};
std::string output;

class Fields {
    std::size_t pos_ = 0;
    std::size_t end_;
public:
    explicit Fields(std::size_t end) : end_(end) {
        if (end > input.size()) throw std::invalid_argument("Request exceeds ABI input capacity.");
    }
    std::optional<std::string> next() {
        if (end_ - pos_ < 2) throw std::invalid_argument("Incomplete request.");
        const std::size_t length = input[pos_] + 256u * input[pos_ + 1];
        pos_ += 2;
        if (length == 65535) return std::nullopt;
        if (length > end_ - pos_) throw std::invalid_argument("Truncated field.");
        std::string text(reinterpret_cast<const char*>(input.data() + pos_), length);
        pos_ += length;
        return text;
    }
    std::string required() {
        auto field = next();
        if (!field) throw std::invalid_argument("Missing field.");
        return std::move(*field);
    }
    void finish() const {
        if (pos_ != end_) throw std::invalid_argument("Unexpected fields.");
    }
};

template<class T>
T integer(const std::string& text) {
    T value{};
    const auto [end, ec] = std::from_chars(text.data(), text.data() + text.size(), value);
    if (ec != std::errc{} || end != text.data() + text.size()) throw std::invalid_argument("Expected an integer.");
    return value;
}

std::string execute(unsigned op, Fields fields) {
    if (op == 4) {
        Reference ref{fields.required(), fields.next(), fields.next(), fields.next(), fields.next()};
        fields.finish();
        const auto question = resolve_reference(ref);
        return question ? to_json(*question) : "null";
    }
    if (op == 5) { fields.finish(); return to_json(bank()); }
    if (op < 1 || op > 3) throw std::invalid_argument("Unknown generation mode.");
    Options options;
    options.topic = fields.required();
    options.exam = fields.required();
    options.difficulty = fields.required();
    options.type = fields.required();
    const std::string seed_type = fields.required(), seed = fields.required();
    if (seed_type == "number") options.seed = integer<std::int64_t>(seed);
    else if (seed_type == "string") options.seed = seed;
    else throw std::invalid_argument("Unsupported seed type.");
    const int count = integer<int>(fields.required());
    fields.finish();
    if (op == 1) return to_json(generate_question(options));
    return to_json(op == 2 ? generate_mock(options, count) : generate_chapter(options, count));
}
} // namespace

extern "C" {
unsigned avenquellis_abi_version() { return 1; }
unsigned char* avenquellis_input() { return input.data(); }
unsigned avenquellis_capacity() { return static_cast<unsigned>(input.size()); }
const char* avenquellis_output() { return output.data(); }
unsigned avenquellis_output_size() { return static_cast<unsigned>(output.size()); }
unsigned avenquellis_call(unsigned op, unsigned bytes) noexcept {
    try {
        output = execute(op, Fields(bytes));
        return 0;
    } catch (const std::logic_error& e) {
        output = e.what();
        return 1;
    } catch (...) {
        output.clear();
        return 2;
    }
}
}
