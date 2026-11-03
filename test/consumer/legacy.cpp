#include <noether/questions.hpp>

int main() {
    const auto q = noether::questions::find_bank_question("number-gcd-17s23lf");
    return q && q->max_marks == 10 ? 0 : 1;
}
