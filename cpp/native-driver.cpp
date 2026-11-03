#include "bridge.h"
#include <iostream>
#include <string>
// Test-only line protocol: an expression per line, JSON result per line.
// The production/browser interface is the length-aware C ABI in bridge.h.
int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::cout << axiom_evaluate(line.data(), line.size()) << '\n';
    }
    return std::cin.bad() || !std::cout ? 1 : 0;
}
