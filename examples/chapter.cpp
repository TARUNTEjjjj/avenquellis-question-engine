#include <noether/questions.hpp>
#include <iostream>

int main() {
    noether::questions::Options options;
    options.topic = "number-theory";
    options.exam = "RMO";
    options.seed = "weekly-practice";
    const auto test = noether::questions::generate_chapter(options, 6);
    std::cout << test.title << " (" << test.max_marks << " marks)\n";
    for (const auto& question : test.questions) std::cout << question.statement << '\n';
    return test.questions.size() == 6 ? 0 : 1;
}
