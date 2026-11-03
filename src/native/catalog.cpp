#include "detail.hpp"

#include <algorithm>
#include <cstdlib>
#include <locale>
#include <numeric>
#include <sstream>

namespace noether::questions::detail {
namespace {

// All integer expressions below are bounded by their family's small parameter range.
template <typename... Values>
std::string text(const Values&... values) {
    std::ostringstream out;
    out.imbue(std::locale::classic());
    (out << ... << values);
    return out.str();
}

int cube(int n) { return n * n * n; }

int choose(int n, int k) {
    int result = 1;
    for (int i = 1; i <= std::min(k, n - k); ++i) result = result * (n - i + 1) / i;
    return result;
}

std::string fraction(int numerator, int denominator) {
    const int divisor = std::gcd(numerator, denominator);
    return denominator == divisor ? std::to_string(numerator / divisor)
                                  : text(numerator / divisor, "/", denominator / divisor);
}

Content algebra_product(Random& r) {
    const int s = r.integer(4, 16);
    return {
        text("Let x and y be nonnegative real numbers with x + y = ", s, ". Prove that xy ≤ ", s * s,
            "/4, and determine when equality holds."),
        text("Since (x − y)² ≥ 0, (x + y)² − 4xy ≥ 0. Substituting x + y = ", s, " gives xy ≤ ", s * s,
            "/4. Equality holds exactly when x = y = ", s, "/2, which satisfies the constraints."),
        {
            {"step-1", "Use a valid nonnegative square or AM–GM argument.", 4},
            {"step-2", text("Substitute x + y = ", s, " and derive the stated upper bound."), 4},
            {"step-3", "Identify and verify the equality case x = y.", 2},
        },
        {{"s", s}},
        std::nullopt
    };
}

Content algebra_cubes(Random& r) {
    const int a = r.integer(1, 5);
    const int b = r.integer(6, 9);
    const int c = r.integer(10, 13);
    const int p = a + b + c;
    const int q = a * b + b * c + c * a;
    const int z = a * b * c;
    return {
        text("Real numbers x, y, z satisfy x + y + z = ", p, ", xy + yz + zx = ", q, ", and xyz = ", z,
            ". Find x³ + y³ + z³."),
        text("The identity x³ + y³ + z³ = (x + y + z)³ − 3(x + y + z)(xy + yz + zx) + 3xyz gives ", p,
            "³ − 3·", p, "·", q, " + 3·", z, " = ", cube(a) + cube(b) + cube(c), "."),
        {
            {"step-1", "State or derive the symmetric cube identity.", 4},
            {"step-2", "Substitute the three supplied symmetric sums.", 4},
            {"step-3", "Evaluate the resulting expression correctly.", 2},
        },
        {{"a", a}, {"b", b}, {"c", c}},
        Answer{cube(a) + cube(b) + cube(c)}
    };
}

Content algebra_divisors(Random& r) {
    const int k = r.integer(2, 7);
    const int n = k * k + 1;
    std::string pairs;
    for (int d = 1; d <= n; ++d) {
        if (n % d == 0) {
            if (!pairs.empty()) pairs += ", ";
            pairs += text("(", k + d, ", ", k + n / d, ")");
        }
    }
    return {
        text("Find all ordered pairs of positive integers (x, y) satisfying xy = ", k,
            "(x + y) + 1. Prove that your list is complete."),
        text("Rearranging gives (x − ", k, ")(y − ", k, ") = ", n,
            ". The two factors have the same sign and neither is zero. If both were negative, positivity of x,y "
            "would give their product at most (", k, " − 1)² < ", n,
            ", impossible. Thus both are positive. Every positive divisor d of ", n, " gives x = ", k,
            " + d and y = ", k, " + ", n, "/d. The complete list is ", pairs,
            ". Substitution verifies every listed pair."),
        {
            {"step-1", "Factor the equation after completing the product.", 3},
            {"step-2", "Exclude zero and negative factors using positivity.", 3},
            {"step-3", "Enumerate every positive divisor and corresponding ordered pair.", 2},
            {"step-4", "Verify the constructed pairs satisfy the original equation.", 2},
        },
        {{"k", k}, {"n", n}},
        std::nullopt
    };
}

Content algebra_functional(Random& r) {
    const int c = r.integer(1, 5);
    const int a = r.integer(1, 6);
    return {
        text("A continuous function f: ℝ → ℝ satisfies f(x + y) = f(x) + f(y) + ", 2 * c,
            "xy for all real x,y, and f(1) = ", c + a, ". Determine f and prove uniqueness."),
        text("Define g(x) = f(x) − ", c,
            "x². The equation implies g(x+y)=g(x)+g(y), and g is continuous with g(1)=", a,
            ". Additivity yields g(n)=", a, "n for integers n, and g(p/q)=", a,
            "p/q for rational p/q. By density of the rationals and continuity, g(x)=", a,
            "x for every real x. Hence f(x)=", c, "x²+", a,
            "x. Direct substitution verifies existence, and the argument proves uniqueness."),
        {
            {"step-1", "Subtract the quadratic term to obtain a continuous additive function.", 3},
            {"step-2", "Determine the additive function on integers and rationals.", 3},
            {"step-3", "Use continuity and rational approximation for all real inputs.", 2},
            {"step-4", "Verify the resulting function and uniqueness.", 2},
        },
        {{"a", a}, {"c", c}},
        std::nullopt
    };
}

Content number_consecutive(Random& r) {
    const int k = r.integer(1, 12);
    return {
        text("Prove that (n + ", k, ")(n + ", k + 1, ")(n + ", k + 2,
            ") is divisible by 6 for every integer n."),
        "Among three consecutive integers one is divisible by 3. At least one is even, so the product is "
        "divisible by 2 as well. Since gcd(2,3)=1, their product 6 divides the product. This reasoning includes "
        "zero and negative factors.",
        {
            {"step-1", "Explain why a factor is divisible by 3.", 4},
            {"step-2", "Explain why a factor is even.", 4},
            {"step-3", "Use coprimality to conclude divisibility by 6 for every integer.", 2},
        },
        {{"k", k}},
        std::nullopt
    };
}

Content number_gcd(Random& r) {
    const int k = r.integer(7, 30);
    return {
        text("Prove that gcd(n, n + ", k, ") = gcd(n, ", k, ") for every positive integer n."),
        text("If d divides both n and n+", k, ", it divides their difference ", k,
            "; hence d is a common divisor of n and ", k, ". Conversely, if d divides n and ", k,
            ", it divides n+", k,
            ". The sets of positive common divisors coincide, so their greatest members coincide."),
        {
            {"step-1", "Prove every common divisor of n and n+k divides k.", 4},
            {"step-2", "Prove the converse inclusion of common divisors.", 4},
            {"step-3", "Conclude equality of the greatest positive common divisors.", 2},
        },
        {{"k", k}},
        std::nullopt
    };
}

Content number_descent(Random&) {
    return {
        "Prove that x² + y² = 3z² has no solution in positive integers x, y, z.",
        "Squares modulo 3 are 0 or 1. For x²+y² to be 0 modulo 3, both x and y must be divisible by 3. Write "
        "x=3a,y=3b; the equation becomes 3a²+3b²=z², so z is also divisible by 3, say z=3c. Dividing the "
        "original equation by 9 gives a²+b²=3c², a positive solution with c<z. Choosing a solution with minimal "
        "positive z produces a contradiction.",
        {
            {"step-1", "Classify square residues modulo 3.", 3},
            {"step-2", "Deduce that x, y, and z are divisible by 3.", 3},
            {"step-3", "Construct a strictly smaller positive solution.", 2},
            {"step-4", "Apply minimality or infinite descent to rule out any solution.", 2},
        },
        {},
        std::nullopt
    };
}

Content number_cycle(Random& r) {
    const int n = r.integer(21, 120);
    return {
        text("Find the remainder when 2^", n, " is divided by 7."),
        text("Since 2³ ≡ 1 (mod 7), powers of 2 repeat every three exponents. As ", n, " ≡ ", n % 3,
            " (mod 3), the required remainder is 2^", n % 3, " = ", (1 << (n % 3)), "."),
        {
            {"step-1", "Find the period-three cycle modulo 7.", 4},
            {"step-2", "Reduce the exponent modulo 3.", 4},
            {"step-3", "Report the least nonnegative remainder.", 2},
        },
        {{"n", n}},
        Answer{1 << (n % 3)}
    };
}

Content comb_divisibility(Random& r) {
    const int n = r.integer(8, 30);
    return {
        text("Choose any ", n + 1, " distinct integers from {1,2,…,", 2 * n,
            "}. Prove that two of the chosen integers have the property that one divides the other."),
        text("Write every positive integer uniquely as 2^a u with u odd. There are exactly ", n,
            " possible odd parts u in {1,3,…,", 2 * n - 1, "}. Among ", n + 1,
            " chosen integers, two share the same odd part by the pigeonhole principle. They have forms 2^a u and "
            "2^b u with a<b, so the first divides the second."),
        {
            {"step-1", "Represent each number by a power of 2 times its odd part.", 3},
            {"step-2", "Count the possible odd parts.", 3},
            {"step-3", "Apply the pigeonhole principle.", 2},
            {"step-4", "Show that equal odd parts imply divisibility.", 2},
        },
        {{"n", n}},
        std::nullopt
    };
}

Content comb_paths(Random& r) {
    const int m = r.integer(3, 8);
    const int n = r.integer(3, 8);
    return {
        text("How many paths from (0,0) to (", m, ",", n, ") use only unit steps to the right or upward?"),
        text("Every path contains ", m, " right steps and ", n, " up steps, for ", m + n,
            " steps total. Choosing the ", m,
            " positions of the right steps determines the path uniquely, so the count is C(", m + n, ",", m,
            ") = ", choose(m + n, m), "."),
        {
            {"step-1", "Determine the number of steps of each type.", 4},
            {"step-2", "Give a bijection with choices of step positions.", 4},
            {"step-3", "Evaluate the binomial coefficient.", 2},
        },
        {{"m", m}, {"n", n}},
        Answer{choose(m + n, m)}
    };
}

Content comb_handshake(Random&) {
    return {
        "In a finite group of people, some pairs shake hands exactly once. Prove that an even number of people "
        "have shaken hands with an odd number of others.",
        "Construct the simple graph whose vertices are people and whose edges are handshakes. The sum of all "
        "vertex degrees is twice the number of edges and is therefore even. Even degrees contribute 0 modulo 2 "
        "and odd degrees contribute 1, so the number of odd-degree vertices is even.",
        {
            {"step-1", "Model each handshake as an edge, or use equivalent double counting.", 4},
            {"step-2", "Show that the sum of handshake counts is even.", 4},
            {"step-3", "Deduce that an even number of counts are odd.", 2},
        },
        {},
        std::nullopt
    };
}

Content comb_no_adjacent(Random& r) {
    const int n = r.integer(6, 16);
    int a = 1, b = 2;
    for (int j = 2; j <= n; ++j) {
        const int next = a + b;
        a = b;
        b = next;
    }
    return {
        text("How many subsets of {1,2,…,", n,
            "} contain no two consecutive integers? Include the empty subset."),
        text("Let A_m be the count for {1,…,m}. Separating subsets according to whether m is included gives "
            "A_m=A_(m−1)+A_(m−2). The initial values are A_0=1 and A_1=2. Iterating this recurrence gives A_",
            n, "=", b, "."),
        {
            {"step-1", "Separate subsets by whether the largest element is present.", 4},
            {"step-2", "Derive the recurrence with correct initial values.", 4},
            {"step-3", "Compute the requested count.", 2},
        },
        {{"n", n}},
        Answer{b}
    };
}

Content geometry_diagonals(Random& r) {
    const int a = r.integer(4, 12);
    const int b = r.integer(4, 12);
    return {
        text("The diagonals of a rectangle of side lengths ", a, " and ", b,
            " meet at O. Prove that the four triangles formed by O and consecutive rectangle vertices have equal "
            "areas."),
        text("The diagonals of a rectangle bisect one another, so O is its centre. The two triangles with horizontal "
            "bases have base ", a, " and height ", b, "/2, and area ", a * b,
            "/4 each. The two triangles with vertical bases have base ", b, " and height ", a,
            "/2, and the same area ", a * b, "/4. Thus all four areas are equal."),
        {
            {"step-1", "Locate O at the centre using diagonal bisection.", 4},
            {"step-2", "Compute areas for triangles on each pair of parallel sides.", 4},
            {"step-3", "Conclude all four areas are equal.", 2},
        },
        {{"a", a}, {"b", b}},
        std::nullopt
    };
}

Content geometry_inradius(Random& r) {
    const int k = r.integer(2, 10);
    return {
        text("A triangle has side lengths ", 3 * k, ", ", 4 * k, ", and ", 5 * k, ". Find its inradius."),
        text("By the converse of Pythagoras, the triangle is right-angled. Its area is (", 3 * k, "·", 4 * k,
            ")/2=", 6 * k * k, "; its semiperimeter is ", 6 * k,
            ". Since area = inradius × semiperimeter, the inradius is ", k, "."),
        {
            {"step-1", "Recognise and justify the right angle.", 4},
            {"step-2", "Compute area and semiperimeter.", 4},
            {"step-3", "Use area = rs to obtain the inradius.", 2},
        },
        {{"k", k}},
        Answer{k}
    };
}

Content geometry_median(Random&) {
    return {
        "In triangle ABC, M is the midpoint of BC. Prove that AB² + AC² = 2AM² + BC²/2.",
        "Place M at the origin and represent B by vector v, C by −v, and A by u. Then "
        "AB²+AC²=|u−v|²+|u+v|²=2|u|²+2|v|². Since AM²=|u|² and BC²=4|v|², this is 2AM²+BC²/2. The argument "
        "applies to every triangle.",
        {
            {"step-1", "Choose valid midpoint coordinates or an equivalent geometric construction.", 4},
            {"step-2", "Expand the two squared distances and cancel cross terms.", 4},
            {"step-3", "Relate the resulting terms to AM and BC.", 2},
        },
        {},
        std::nullopt
    };
}

Content geometry_viviani(Random&) {
    return {
        "Let P lie inside an equilateral triangle of altitude h. Prove that the sum of the perpendicular "
        "distances from P to the three sides is h.",
        "Let the common side length be a and the three distances be d₁,d₂,d₃. Joining P to the vertices "
        "partitions the triangle into three triangles with areas ad₁/2, ad₂/2, ad₃/2. Their sum equals the whole "
        "area ah/2. Cancelling a/2>0 gives d₁+d₂+d₃=h.",
        {
            {"step-1", "Partition the triangle by joining P to its vertices.", 3},
            {"step-2", "Express each subtriangle area using its perpendicular distance.", 3},
            {"step-3", "Equate the summed areas to the original area.", 2},
            {"step-4", "Cancel the common factor and conclude.", 2},
        },
        {},
        std::nullopt
    };
}

Content calculus_log(Random&) {
    return {
        "Prove that ln(1+x) ≤ x for every x > −1, and identify every equality case.",
        "Let f(x)=x−ln(1+x). Then f′(x)=x/(1+x). For −1<x<0 the derivative is negative, while for x>0 it is "
        "positive. Thus f attains its unique minimum at x=0, where f(0)=0. Consequently ln(1+x)≤x, with equality "
        "only at x=0.",
        {
            {"step-1", "Define a suitable difference on the full domain.", 4},
            {"step-2", "Differentiate correctly and determine the sign on both sides of zero.", 4},
            {"step-3", "Use the minimum to prove the inequality and equality case.", 2},
        },
        {},
        std::nullopt
    };
}

Content calculus_max(Random& r) {
    const int a = 3 * r.integer(2, 6);
    return {
        text("Find the maximum of f(x)=x(", a, "−x)² on the closed interval [0,", a, "]."),
        text("f′(x)=(", a, "−x)(", a, "−3x), so interior critical points give x=", a / 3,
            ". The endpoint values are both 0, whereas f(", a / 3, ")=", 4 * cube(a) / 27,
            ". Comparing these values gives the global maximum ", 4 * cube(a) / 27, "."),
        {
            {"step-1", "Differentiate and solve for all interior critical points.", 4},
            {"step-2", "Evaluate the function at critical points and both endpoints.", 4},
            {"step-3", "Compare the values and state the global maximum.", 2},
        },
        {{"a", a}},
        Answer{4 * cube(a) / 27}
    };
}

Content calculus_integral(Random& r) {
    const int n = r.integer(2, 7);
    const int d = (n + 1) * (n + 2);
    return {
        text("Evaluate ∫₀¹ x^", n, "(1−x) dx. Give your answer as a fraction."),
        text("Expand the integrand as x^", n, "−x^", n + 1, ". Integrating termwise gives 1/", n + 1, "−1/",
            n + 2, "=1/", d, "."),
        {
            {"step-1", "Expand the polynomial integrand.", 4},
            {"step-2", "Integrate and evaluate at both limits.", 4},
            {"step-3", "Simplify the resulting fraction.", 2},
        },
        {{"n", n}},
        Answer{fraction(1, d)}
    };
}

Content calculus_roots(Random& r) {
    const int c = r.integer(2, 15);
    return {
        text("Prove that the equation x³+x=", c,
            " has exactly one real solution, and that this solution is positive."),
        text("Let f(x)=x³+x−", c, ". It is continuous, f(0)=−", c, "<0, and f(", c, ")=", cube(c),
            ">0, so the intermediate value theorem gives a root in (0,", c,
            "). Since f′(x)=3x²+1>0 for all real x, f is strictly increasing and has at most one root. Therefore "
            "exactly one real root exists and it is positive."),
        {
            {"step-1", "Use continuity with an interval where the values have opposite signs.", 3},
            {"step-2", "Establish existence of a positive root.", 3},
            {"step-3", "Prove strict monotonicity throughout the real line.", 2},
            {"step-4", "Conclude uniqueness.", 2},
        },
        {{"c", c}},
        std::nullopt
    };
}

Content probability_urn(Random& r) {
    const int a = r.integer(3, 8);
    const int b = r.integer(3, 8);
    return {
        text("An urn holds ", a, " red and ", b,
            " blue balls. Two balls are drawn uniformly without replacement. Find the probability that both are red."),
        text("The first ball is red with probability ", a, "/", a + b,
            ". Given that it is red, the next is red with probability ", a - 1, "/", a + b - 1,
            ". Multiplying gives ", fraction(a * (a - 1), (a + b) * (a + b - 1)), "."),
        {
            {"step-1", "Account for sampling without replacement.", 4},
            {"step-2", "Form the product of conditional probabilities or equivalent counting ratio.", 4},
            {"step-3", "Simplify the probability.", 2},
        },
        {{"a", a}, {"b", b}},
        Answer{fraction(a * (a - 1), (a + b) * (a + b - 1))}
    };
}

Content probability_indicators(Random& r) {
    const int n = r.integer(5, 15);
    return {
        text("A permutation of {1,…,", n,
            "} is chosen uniformly at random. Prove that the expected number of fixed points is 1."),
        text("For each i let I_i be 1 if i is fixed and 0 otherwise. Exactly (", n, "−1)! of ", n,
            "! permutations fix i, so E[I_i]=1/", n,
            ". The number of fixed points is X=ΣI_i. By linearity of expectation, E[X]=ΣE[I_i]=", n, "·(1/",
            n, ")=1. Independence is not required."),
        {
            {"step-1", "Define an indicator for each fixed point.", 3},
            {"step-2", "Compute its expectation by counting permutations.", 3},
            {"step-3", "Apply linearity of expectation correctly.", 2},
            {"step-4", "Conclude the value 1 without assuming independence.", 2},
        },
        {{"n", n}},
        std::nullopt
    };
}

Content probability_bayes(Random& r) {
    const int n = r.integer(3, 9);
    return {
        text("A fair coin is tossed ", n,
            " times. Given that at least one head occurred, what is the probability that exactly one head occurred?"),
        text("There are 2^", n,
            " equally likely sequences. Conditioning on at least one head removes only the all-tails sequence, "
            "leaving ", ((1 << n) - 1), " equally likely sequences. Exactly ", n,
            " have a single head, so the probability is ", fraction(n, (1 << n) - 1), "."),
        {
            {"step-1", "Describe the conditioned sample space.", 4},
            {"step-2", "Count sequences with exactly one head.", 4},
            {"step-3", "Divide the favourable count by the conditioned total.", 2},
        },
        {{"n", n}},
        Answer{fraction(n, (1 << n) - 1)}
    };
}

Content probability_union(Random& r) {
    const int n = r.integer(3, 8);
    return {
        text("Events A₁,…,A_", n, " each have probability at most 1/", 2 * n,
            ". Prove that the probability that none occurs is at least 1/2. Do not assume independence."),
        text("The union bound gives P(A₁∪⋯∪A_", n, ") ≤ ΣP(A_i) ≤ ", n, "/(", 2 * n,
            ")=1/2. Taking complements yields P(no event occurs) ≥ 1−1/2=1/2. The union bound follows because the "
            "indicator of a union is at most the sum of the individual indicators, so no independence is needed."),
        {
            {"step-1", "Apply or prove the union bound without independence.", 4},
            {"step-2", "Substitute the upper bounds on individual probabilities.", 4},
            {"step-3", "Take complements with the correct inequality direction.", 2},
        },
        {{"n", n}},
        std::nullopt
    };
}

Content advanced_algebra_schur(Random&) {
    return {
        "For nonnegative real numbers a,b,c, prove a³+b³+c³+3abc ≥ a²b+a²c+b²a+b²c+c²a+c²b. Determine all "
        "equality cases.",
        "The inequality is symmetric, so reorder the variables as a≥b≥c≥0. Let S denote the left side minus the "
        "right side. Direct expansion gives S=(a−b)²(a+b−c)+c(a−c)(b−c). Both terms are nonnegative: a+b−c≥a≥0 "
        "and a−c,b−c≥0. Thus S≥0. If a>b, then the first term is strictly positive, so equality forces a=b. With "
        "a=b, S=c(a−c)²; hence either c=a or c=0. Restoring all permutations, equality occurs when all three "
        "variables are equal, or when one is zero and the other two are equal. Each stated case gives S=0 by "
        "substitution.",
        {
            {"step-1", "Justify a symmetric ordering or an equivalent valid reduction.", 2},
            {"step-2", "Obtain a correct decomposition or another complete proof of nonnegativity.", 3},
            {"step-3", "Analyze necessity of all equality cases, including zeros.", 3},
            {"step-4", "Verify the cases and restore permutations.", 2},
        },
        {},
        std::nullopt
    };
}

Content advanced_algebra_integer_factorization(Random& r) {
    const int n = r.integer(4, 7);
    const int offset = r.integer(-4, 3);
    std::vector<int> roots;
    std::string product, root_list;
    for (int j = 0; j < n; ++j) {
        const int root = offset + j;
        roots.push_back(root);
        if (j) root_list += ", ";
        root_list += std::to_string(root);
        product += root == 0 ? "x" : text("(x ", root < 0 ? "+" : "−", " ", std::abs(root), ")");
    }
    return {
        text("Let P(x)=", product,
            "−1. Prove that P cannot be written as the product of two nonconstant polynomials with integer "
            "coefficients."),
        text("Suppose P=FG with nonconstant integer-coefficient polynomials F,G. Their degrees are both less than ",
            n, ". At each of the ", n, " distinct integers ", root_list,
            ", P takes the value −1, so the two integers F(a),G(a) must be 1 and −1 in some order. Therefore "
            "(F+G)(a)=0 at all these ", n, " points. Since deg(F+G)<", n,
            " unless it is the zero polynomial, the root bound forces F+G=0 identically. Thus P=−F². But P is monic, "
            "whereas the leading coefficient of −F² is negative. This contradiction rules out the proposed "
            "factorization."),
        {
            {"step-1", "Use the integer values at every specified point to deduce F(a)+G(a)=0.", 3},
            {"step-2", "Apply the polynomial root bound with the correct degree justification.", 3},
            {"step-3", "Derive P=−F² from F+G=0.", 2},
            {"step-4", "Use the leading coefficient to obtain a contradiction.", 2},
        },
        {{"n", n}, {"offset", offset}, {"roots", roots}},
        std::nullopt
    };
}

Content advanced_algebra_parallelogram_function(Random& r) {
    const int k = r.integer(2, 9);
    return {
        text("Find every function f:ℤ→ℤ satisfying f(m+n)+f(m−n)=2f(m)+2f(n) for all integers m,n, with f(1)=",
            k, ". Prove both existence and uniqueness."),
        text("Putting m=n=0 gives f(0)=0. Putting m=0 then gives f(−n)=f(n). With n=1, the equation becomes "
            "f(m+1)−2f(m)+f(m−1)=", 2 * k, ". Starting from f(0)=0 and f(1)=", k,
            ", induction yields f(m)=", k,
            "m² for all m≥0: if the formula holds at m and m−1, the recurrence gives f(m+1)=", k,
            "[2m²−(m−1)²+2]=", k,
            "(m+1)². Evenness extends this to negative integers. Finally, substituting f(m)=", k,
            "m² into the original equation verifies it, since (m+n)²+(m−n)²=2m²+2n². Thus the solution exists and is "
            "unique."),
        {
            {"step-1", "Establish the value at zero and evenness.", 2},
            {"step-2", "Derive and solve the second-difference recurrence for nonnegative integers.", 3},
            {"step-3", "Extend the conclusion to all negative integers.", 2},
            {"step-4", "Verify the original two-variable equation and uniqueness.", 3},
        },
        {{"k", k}},
        std::nullopt
    };
}

Content advanced_algebra_product_extremum(Random& r) {
    const int k = r.integer(2, 6);
    return {
        text("Real numbers x,y,z satisfy x+y+z=0 and x²+y²+z²=", 6 * k * k, ". Prove |xyz|≤", 2 * cube(k),
            ", and find every equality case without using calculus."),
        text("Since x+y=−z, the inequality x²+y²≥(x+y)²/2 gives ", 6 * k * k, "≥3z²/2, so −", 2 * k, "≤z≤",
            2 * k, ". Also xy=[(x+y)²−x²−y²]/2=z²−", 3 * k * k, ", hence xyz=z³−", 3 * k * k,
            "z. The identities ", 2 * cube(k), "−(z³−", 3 * k * k, "z)=(", 2 * k, "−z)(z+", k, ")²≥0 and ",
            2 * cube(k), "+(z³−", 3 * k * k, "z)=(z+", 2 * k, ")(z−", k,
            ")²≥0 give the bound. Equality requires z∈{−", 2 * k, ",−", k, ",", k, ",", 2 * k,
            "}. Solving x+y=−z and xy=z²−", 3 * k * k,
            " in these cases shows that the full list consists of permutations of (", 2 * k, ",−", k, ",−",
            k, ") and (−", 2 * k, ",", k, ",", k, "). Direct substitution verifies all of them."),
        {
            {"step-1", "Obtain the valid interval for one variable from the quadratic constraint.", 2},
            {"step-2", "Express the product as a cubic and prove both bounds algebraically.", 3},
            {"step-3", "Recover all equality triples from the simultaneous constraints.", 3},
            {"step-4", "Verify the equality triples in both original constraints.", 2},
        },
        {{"k", k}},
        std::nullopt
    };
}

Content advanced_number_least_prime(Random&) {
    return {
        "Prove that there is no integer n>1 for which n divides 2ⁿ−1. You may use Fermat’s little theorem.",
        "Suppose such n exists. It must be odd, because 2ⁿ−1 is odd. Let p be the smallest prime divisor of n, "
        "so p is odd. Let d be the least positive integer with 2ᵈ≡1 (mod p); it exists by Fermat’s theorem. The "
        "division algorithm shows that d divides every exponent e for which 2ᵉ≡1 (mod p): write e=qd+r, 0≤r<d, "
        "and minimality forces r=0. Consequently d divides n and p−1. But gcd(n,p−1)=1: any prime dividing that "
        "gcd would be a prime divisor of n smaller than p. Thus d=1. This says 2≡1 (mod p), an impossibility. "
        "Hence no n>1 works.",
        {
            {"step-1", "Choose the least prime divisor and handle parity.", 2},
            {"step-2", "Define multiplicative order and justify its divisibility properties.", 3},
            {"step-3", "Show that n and p−1 are coprime using minimality of p.", 3},
            {"step-4", "Derive and explain the contradiction d=1.", 2},
        },
        {},
        std::nullopt
    };
}

Content advanced_number_sum_square_valuation(Random& r) {
    constexpr int primes[] = {3, 7, 11, 19, 23};
    const int p = primes[r.integer(0, 4)];
    return {
        text("Let x,y be integers, not both zero. Prove that the exponent of the prime ", p,
            " in the prime factorization of x²+y² is even. You may use Fermat’s little theorem."),
        text("First prove that ", p, "|u²+v² implies ", p, "|u and ", p, "|v. If v is not divisible by ", p,
            ", the residue t=u/v is defined modulo ", p, " and t²≡−1. Raising to the odd power (", p,
            "−1)/2 gives t^(", p, "−1)≡−1, contradicting Fermat's theorem. If v is divisible by ", p,
            ", the original congruence immediately gives ", p,
            "|u. Now let t≥0 be the largest integer such that ", p,
            "ᵗ divides both x and y. It is finite because they are not both zero. Write x=", p, "ᵗu,y=", p,
            "ᵗv, where u,v are not both divisible by ", p, ". The preliminary result gives ", p,
            "∤u²+v². Thus x²+y²=", p, "^(2t)(u²+v²) has exact prime exponent 2t, which is even."),
        {
            {"step-1", "Prove the modular obstruction for a nonzero quotient using Fermat.", 3},
            {"step-2", "Cover the case when one coordinate is divisible by the prime.", 2},
            {"step-3", "Factor out the largest common prime power and establish that the remaining sum is not divisible.", 3},
            {"step-4", "Conclude the exact even exponent, including zero-coordinate cases.", 2},
        },
        {{"p", p}},
        std::nullopt
    };
}

Content advanced_number_binary_binomial(Random&) {
    return {
        "For a positive integer n, let s₂(n) be the number of 1s in its binary expansion. Prove that the highest "
        "power of 2 dividing the integer C(2n,n) is exactly 2 raised to the power s₂(n).",
        "For any positive integer m, counting the factors divisible by 2, then the extra factors divisible by 4, "
        "and so on, gives v₂(m!)=Σ(j≥1)⌊m/2ʲ⌋. Write m=Σ(i≥0)εᵢ2ⁱ with εᵢ∈{0,1}. Interchanging these finite sums "
        "gives Σ(j≥1)⌊m/2ʲ⌋=Σ(i≥1)εᵢ(2ⁱ−1)=m−s₂(m). Therefore v₂(C(2n,n))=[2n−s₂(2n)]−2[n−s₂(n)]. Multiplication "
        "by 2 shifts the binary expansion, so s₂(2n)=s₂(n). The exponent is consequently s₂(n), proving the "
        "exact divisibility assertion.",
        {
            {"step-1", "Derive the factorial valuation by counting prime factors.", 3},
            {"step-2", "Convert the floor sum into m−s₂(m) using binary digits.", 3},
            {"step-3", "Apply the valuation formula to the binomial coefficient.", 2},
            {"step-4", "Use the binary shift to obtain the exact exponent.", 2},
        },
        {},
        std::nullopt
    };
}

Content advanced_number_fourth_power_composite(Random&) {
    return {
        "Prove that n⁴+4ⁿ is composite for every integer n>1. Give an argument that covers both parities of n.",
        "If n is even, n⁴ and 4ⁿ are both divisible by 16, and their sum is at least 32, so the sum is "
        "composite. If n is odd, then n≥3. Put b=2^((n−1)/2), an integer at least 2. Now 4ⁿ=4b⁴, and direct "
        "expansion gives n⁴+4b⁴=(n²−2nb+2b²)(n²+2nb+2b²). The first factor equals (n−b)²+b² and is at least 4; "
        "the second is larger and is also an integer. Thus both factors are greater than 1. This proves "
        "compositeness for odd n as well, completing the argument.",
        {
            {"step-1", "Handle all even n with a proper nontrivial divisor.", 2},
            {"step-2", "Choose an integer auxiliary power for odd n.", 2},
            {"step-3", "Derive or verify the fourth-power factorization.", 3},
            {"step-4", "Prove both factors exceed 1 and cover the complete domain.", 3},
        },
        {},
        std::nullopt
    };
}

Content advanced_comb_subsequence(Random& r) {
    const int a = r.integer(3, 5);
    const int b = r.integer(3, 5);
    const int n = (a - 1) * (b - 1) + 1;
    return {
        text("A sequence contains ", n,
            " pairwise distinct real numbers. Prove that it has either an increasing subsequence of length ",
            a, " or a decreasing subsequence of length ", b,
            ". A subsequence keeps the original order but need not use adjacent terms."),
        text("At each position i assign the pair (uᵢ,vᵢ), where uᵢ is the longest increasing subsequence ending there "
            "and vᵢ is the longest decreasing one ending there. Suppose neither required subsequence exists. Then "
            "1≤uᵢ≤", a - 1, " and 1≤vᵢ≤", b - 1, ", leaving only ", (a - 1) * (b - 1),
            " possible pairs. Yet the pairs at distinct positions are different: if i<j and the ith value is "
            "smaller, append the jth value to an increasing subsequence ending at i to get uⱼ≥uᵢ+1; if it is larger, "
            "get vⱼ≥vᵢ+1. Distinctness of the values ensures one case holds. Thus ", n,
            " positions require ", n, " different pairs, contradicting the available count."),
        {
            {"step-1", "Define both longest-ending-subsequence labels precisely.", 3},
            {"step-2", "Prove that different positions have different label pairs.", 3},
            {"step-3", "Bound the label ranges under the contrary assumption.", 2},
            {"step-4", "Apply the counting contradiction.", 2},
        },
        {{"a", a}, {"b", b}, {"n", n}},
        std::nullopt
    };
}

Content advanced_comb_triangle_free(Random&) {
    return {
        "A simple graph on n vertices has no triangle. Prove that its number m of edges is at most n²/4. Show "
        "that the bound is attained whenever n is even.",
        "Write d(v) for the degree of vertex v. If uv is an edge, u and v have no common neighbor, since that "
        "would create a triangle. Their neighbor sets are disjoint subsets of the n vertices, so d(u)+d(v)≤n. "
        "Summing over all edges gives Σv d(v)²≤mn, because each degree d(v) is counted once for each of its d(v) "
        "incident edges. The handshake identity gives Σv d(v)=2m. Cauchy–Schwarz now yields 4m²≤nΣv d(v)²≤mn². "
        "For m>0, division gives m≤n²/4; for m=0 it is immediate. If n is even, split the vertices into two "
        "equal groups and join every pair in different groups. This graph has no triangle and has (n/2)² edges, "
        "so it attains the bound.",
        {
            {"step-1", "Establish the degree-sum bound for each edge using absence of triangles.", 3},
            {"step-2", "Double-count the edge sum as the sum of squared degrees.", 3},
            {"step-3", "Apply Cauchy–Schwarz and handle m=0.", 2},
            {"step-4", "Construct and verify an equality example.", 2},
        },
        {},
        std::nullopt
    };
}

Content advanced_comb_toggle_invariant(Random& r) {
    const int m = r.integer(3, 6);
    const int n = r.integer(3, 7);
    return {
        text("A ", m, "×", n,
            " board starts with every cell white. An operation reverses every color in one complete row or one "
            "complete column. Prove that a target coloring is reachable if and only if the four corner cells of "
            "every rectangle formed by two rows and two columns contain an even number of black cells."),
        "Encode white by 0 and black by 1, with addition modulo 2. In any fixed rectangle, a row or column "
        "operation changes either zero or two of its four corners; therefore the parity of the corner sum stays "
        "even. This proves necessity. Conversely suppose every rectangle has even corner sum, and denote the "
        "target cell values by bᵢⱼ. Rectangles using row 1 and column 1 give bᵢⱼ=bᵢ₁+b₁ⱼ+b₁₁ modulo 2; this "
        "identity also holds when i=1 or j=1. Starting from zero, toggle row i exactly when bᵢ₁=1. Then toggle "
        "column j exactly when b₁ⱼ+b₁₁=1 modulo 2. The final value at (i,j) is bᵢ₁+b₁ⱼ+b₁₁=bᵢⱼ. These operations "
        "construct the target, proving sufficiency.",
        {
            {"step-1", "Identify the invariant and show every permitted move preserves it.", 3},
            {"step-2", "Derive the cell identity from the rectangle condition.", 3},
            {"step-3", "Give explicit row and column operations.", 2},
            {"step-4", "Verify every resulting cell, proving sufficiency.", 2},
        },
        {{"m", m}, {"n", n}},
        std::nullopt
    };
}

Content advanced_comb_tournament_path(Random&) {
    return {
        "In a tournament, every pair of players plays once and each game has exactly one winner. Prove that all "
        "players can be listed in an order such that each player except the last defeated the player immediately "
        "after them. No assumption is made that winning is transitive.",
        "Induct on the number of players. One player is immediate. Remove a player x and use the inductive "
        "hypothesis to order the others v₁,…,vₖ with vᵢ defeating vᵢ₊₁. If x defeats v₁, insert x at the "
        "beginning. Otherwise, if x defeats any player in the list, let j be the first such index. Then j≥2 and "
        "vⱼ₋₁ defeats x, because x did not defeat that player and there are no draws. Insert x between vⱼ₋₁ and "
        "vⱼ. Both new adjacent games have the required direction, and all other adjacent relations remain valid. "
        "If x defeats nobody in the list, vₖ defeats x, so append x at the end. These cases exhaust every "
        "possibility and complete the induction.",
        {
            {"step-1", "Set up induction with a correct base case.", 2},
            {"step-2", "Choose an insertion position using the first player defeated by the new player.", 3},
            {"step-3", "Verify the two new adjacency relations and preserve the others.", 3},
            {"step-4", "Handle insertion at both ends and conclude.", 2},
        },
        {},
        std::nullopt
    };
}

Content advanced_geometry_radius_inequality(Random&) {
    return {
        "For a nondegenerate triangle with inradius r and circumradius R, prove R≥2r. Determine precisely when "
        "equality occurs. You may use Heron’s formula and the identity Δ=abc/(4R), where Δ is the area.",
        "Let s=(a+b+c)/2 and set x=s−a, y=s−b, z=s−c. All three numbers are positive by the strict triangle "
        "inequalities, and a=y+z, b=z+x, c=x+y. Using Δ=rs, Δ=abc/(4R), and Heron’s formula Δ²=sxyz, we obtain "
        "R/r=abc·s/(4Δ²)=(x+y)(y+z)(z+x)/(4xyz). The inequalities x+y≥2√(xy), y+z≥2√(yz), z+x≥2√(zx) imply the "
        "numerator is at least 8xyz. Hence R/r≥2. Equality in all three inequalities holds exactly when x=y=z, "
        "which is equivalent to a=b=c. An equilateral triangle indeed gives equality.",
        {
            {"step-1", "Use triangle inequalities to obtain positive substitution variables.", 2},
            {"step-2", "Derive the ratio of radii from the area identities.", 3},
            {"step-3", "Apply the product inequality and track equality requirements.", 3},
            {"step-4", "Translate and verify the equilateral equality case.", 2},
        },
        {},
        std::nullopt
    };
}

Content advanced_geometry_perpendicular_feet(Random&) {
    return {
        "Let A,B,C be the vertices of a nondegenerate triangle and let P be a point on its circumcircle distinct "
        "from A,B,C. Let X,Y,Z be the perpendicular projections of P onto the full lines AB,BC,CA, respectively. "
        "Prove that X,Y,Z are collinear. Projections may lie on extensions of the sides.",
        "First handle diameter cases. If P is antipodal to A, the inscribed right angles give X=B and Z=C, while "
        "Y is on BC, so collinearity holds. If P is antipodal to B, similarly X=A and Y=C, with Z on CA. If P is "
        "antipodal to C, Y=B and Z=A, with X on AB. Now exclude these cases and use directed angles modulo 180°, "
        "covering side extensions. If two feet coincide, collinearity is immediate; otherwise assume they are "
        "distinct. No foot can equal a triangle vertex, since that would make P antipodal to another vertex, a "
        "case already handled. Since PX⊥AB and PY⊥BC, the four points P,X,B,Y lie on a circle with diameter PB. "
        "Likewise P,Y,C,Z lie on a circle with diameter PC. The equal-angle property gives ∠(YX,YP)=∠(BX,BP) and "
        "∠(YP,YZ)=∠(CP,CZ). Because BX lies on BA and CZ lies on CA, adding gives ∠(YX,YZ)=∠(BA,BP)+∠(CP,CA). On "
        "the original circumcircle, the angles ∠(BA,BP) and ∠(CA,CP) subtend the same chord AP, so they are "
        "equal modulo 180°. The sum is therefore zero. Thus the lines YX and YZ coincide and the three feet are "
        "collinear.",
        {
            {"step-1", "Identify the two right-angle cyclic quadrilaterals.", 3},
            {"step-2", "Relate directed angles correctly, including exterior projections.", 3},
            {"step-3", "Use the original circumcircle to cancel the angles.", 2},
            {"step-4", "Conclude collinearity and account for antipodal and coincident-foot cases.", 2},
        },
        {},
        std::nullopt
    };
}

Content advanced_geometry_angle_bisector(Random&) {
    return {
        "In a nondegenerate triangle ABC, write a=BC, b=CA and c=AB. The internal bisector of angle A meets BC "
        "at D. Prove AD²=bc[1−a²/(b+c)²]. You may use the angle-bisector theorem and Stewart’s theorem.",
        "By the angle-bisector theorem, BD/DC=c/b. Combining this with BD+DC=a gives BD=ac/(b+c) and "
        "DC=ab/(b+c). Stewart’s theorem for the cevian AD states b²·BD+c²·DC=a(AD²+BD·DC). Substitution makes "
        "the left side a(b²c+c²b)/(b+c)=abc, while BD·DC=a²bc/(b+c)². Divide by a>0 and rearrange: "
        "AD²=bc−a²bc/(b+c)², as required. The bracket is positive because the strict triangle inequality gives "
        "a<b+c; thus the formula is consistent with a positive cevian length.",
        {
            {"step-1", "Compute both side segments with the correct side correspondence.", 3},
            {"step-2", "Apply Stewart’s theorem correctly to AD.", 3},
            {"step-3", "Simplify to the claimed identity.", 2},
            {"step-4", "Check positivity using the nondegenerate triangle assumption.", 2},
        },
        {},
        std::nullopt
    };
}

Content advanced_geometry_tangent_ratio(Random&) {
    return {
        "The tangents to the circumcircle of a nondegenerate triangle ABC at B and C meet at a finite point T. "
        "Suppose the line AT meets the interior of segment BC at D. Prove BD/DC=AB²/AC².",
        "The tangent lengths satisfy TB=TC. By the tangent–chord theorem, the sine of angle ABT equals sin∠ACB "
        "and the sine of angle ACT equals sin∠ABC; supplementary-angle choices do not change these sines. Taking "
        "ordinary triangle areas therefore gives "
        "[ABT]/[ACT]=AB·TB·sin∠ABT/(AC·TC·sin∠ACT)=AB·sin∠ACB/(AC·sin∠ABC). The sine rule in ABC gives "
        "sin∠ACB/sin∠ABC=AB/AC, so the area ratio is AB²/AC². On the other hand, use the common base AT for the "
        "two triangles. Since A,D,T are collinear and D lies inside BC, the perpendicular distances of B and C "
        "from AT have ratio BD/DC (both equal the respective segment times the same positive sine of the angle "
        "between the lines). Thus the same area ratio is BD/DC, proving the identity.",
        {
            {"step-1", "Use equal tangent lengths and the tangent–chord theorem with correct angles.", 2},
            {"step-2", "Compute the area ratio and apply the sine rule.", 3},
            {"step-3", "Relate the same area ratio to BD/DC using distances from AT.", 3},
            {"step-4", "Combine the ratios while respecting the stated nondegeneracy assumptions.", 2},
        },
        {},
        std::nullopt
    };
}

Content advanced_calculus_real_root_inequality(Random&) {
    return {
        "Let P be a real polynomial of degree n≥2 with n distinct real roots. Prove that [P′(x)]²−P(x)P″(x)>0 "
        "for every real x. Also prove that P′ has exactly one root between each pair of consecutive roots of P "
        "and no other roots.",
        "Write P(x)=a∏(i=1 to n)(x−rᵢ), where a≠0 and r₁<⋯<rₙ. Away from the roots, logarithmic differentiation "
        "gives P′/P=Σ1/(x−rᵢ). Differentiating again gives (P″P−P′²)/P²=−Σ1/(x−rᵢ)². Thus P′²−PP″=P²Σ1/(x−rᵢ)²>0 "
        "there. At a root rᵢ, distinctness gives P′(rᵢ)=a∏(j≠i)(rᵢ−rⱼ)≠0, so the expression is again positive. "
        "Rolle’s theorem supplies a root of P′ in each of the n−1 disjoint intervals (rᵢ,rᵢ₊₁). Since P′ has "
        "degree n−1, these exhaust all its roots and each has multiplicity one. There are therefore no extra "
        "roots anywhere else.",
        {
            {"step-1", "Derive and differentiate the logarithmic-derivative identity off the roots.", 3},
            {"step-2", "Establish strict positivity at the roots separately.", 2},
            {"step-3", "Apply Rolle’s theorem in every consecutive-root interval.", 3},
            {"step-4", "Use the degree bound to establish exact counts and absence of other roots.", 2},
        },
        {},
        std::nullopt
    };
}

Content advanced_calculus_sharp_area(Random&) {
    return {
        "Let f be differentiable on [0,1], with f(0)=f(1)=0 and |f′(x)|≤1 for 0<x<1. Prove |∫₀¹f(x)dx|<1/4. Show "
        "nevertheless that no smaller constant can replace 1/4 for all such functions.",
        "The mean value theorem applied between 0 and x and between x and 1 gives |f(x)|≤x and |f(x)|≤1−x. Hence "
        "|∫f|≤∫|f|≤∫min(x,1−x)=1/4. If equality held, the continuous nonnegative difference min(x,1−x)−|f(x)| "
        "would have zero integral, so it would vanish everywhere. Since min(x,1−x)>0 in (0,1), continuity would "
        "force f to have a constant sign there. Thus f would equal either the tent function min(x,1−x) or its "
        "negative, neither differentiable at 1/2. Equality is impossible. For sharpness, let ε>0 and set "
        "fε(x)=√(1/4+ε²)−√((x−1/2)²+ε²). It vanishes at both ends, is differentiable, and "
        "|fε′(x)|=|x−1/2|/√((x−1/2)²+ε²)<1. The elementary bound 0≤√(t²+ε²)−|t|≤ε shows uniform convergence to "
        "the tent function as ε→0, so its integrals tend to 1/4. No smaller universal constant is possible.",
        {
            {"step-1", "Use both endpoint constraints to obtain the tent-function envelope.", 2},
            {"step-2", "Integrate the bound and rigorously exclude equality using differentiability.", 3},
            {"step-3", "Construct and verify a differentiable approximating family satisfying the derivative bound.", 3},
            {"step-4", "Show its integrals approach 1/4, establishing sharpness.", 2},
        },
        {},
        std::nullopt
    };
}

Content advanced_calculus_weighted_rolle(Random& r) {
    const int k = r.integer(2, 7);
    return {
        text("Suppose f is continuous on [a,b], differentiable on (a,b), and f(a)=f(b)=0, where a<b. Prove that there "
            "is c∈(a,b) such that f′(c)=", k,
            "f(c). Then explain why the same conclusion holds with ", k, " replaced by any real constant."),
        text("Define g(x)=e^(−", k,
            "x)f(x). It is continuous on [a,b], differentiable on (a,b), and has g(a)=g(b)=0. Rolle's theorem yields "
            "an interior c with g′(c)=0. By the product rule, g′(c)=e^(−", k, "c)[f′(c)−", k,
            "f(c)]. The exponential is nonzero, so f′(c)=", k,
            "f(c). The proof works for any real constant λ after replacing g by e^(−λx)f(x). It requires no second "
            "derivative or continuity of f′, and includes the identically zero function."),
        {
            {"step-1", "Find the exponential integrating factor or an equivalent valid auxiliary function.", 3},
            {"step-2", "Verify all hypotheses and apply Rolle’s theorem.", 3},
            {"step-3", "Differentiate correctly and isolate the required relation.", 2},
            {"step-4", "Justify the general real-constant case without extra regularity assumptions.", 2},
        },
        {{"k", k}},
        std::nullopt
    };
}

Content advanced_calculus_root_classification(Random& r) {
    const int n = 3 + 2 * r.integer(0, 3);
    return {
        text("For every real parameter t, determine the number of distinct real roots of x^", n, "−", n,
            "x−t=0. Identify all parameter values at which a multiple real root occurs and determine its "
            "multiplicity."),
        text("Let F(x)=x^", n, "−", n, "x−t. Its derivative is ", n, "(x^", n - 1,
            "−1), positive for |x|>1 and negative for |x|<1. Thus F increases on (−∞,−1), decreases on (−1,1), and "
            "increases on (1,∞). Moreover F(−1)=", n - 1, "−t, F(1)=−", n - 1,
            "−t, and its limits at −∞ and +∞ are respectively −∞ and +∞. Strict monotonicity and the intermediate "
            "value theorem give three distinct roots when |t|<", n - 1,
            "; two distinct roots when |t|=", n - 1, "; and one when |t|>", n - 1,
            ". A multiple root must also satisfy F′=0, so it can only be at x=±1. At t=", n - 1,
            ", x=−1 is a root; at t=−", n - 1, ", x=1 is a root. Since F″(±1)=", n * (n - 1), "(±1)^", n - 2,
            " is nonzero, these roots have multiplicity exactly two. All other roots are simple."),
        {
            {"step-1", "Determine the derivative signs and exact monotonicity intervals.", 3},
            {"step-2", "Use extrema and end behavior to count roots in every parameter range.", 3},
            {"step-3", "Find the only possible multiple-root locations and parameters.", 2},
            {"step-4", "Establish multiplicity exactly two and simplicity elsewhere.", 2},
        },
        {{"n", n}},
        std::nullopt
    };
}

Content advanced_probability_permutation_cycles(Random& r) {
    const int n = r.integer(6, 14);
    return {
        text("A permutation of {1,…,", n,
            "} is chosen uniformly at random and written as disjoint cycles. Prove that its expected number of "
            "cycles is 1+1/2+⋯+1/", n, ". Count a fixed point as a one-element cycle."),
        text("Build a permutation of m elements from one of m−1 elements: either make m a singleton cycle, or insert "
            "m immediately after any one of the m−1 existing labels in its cycle. These m choices, combined with all "
            "(m−1)! old permutations, give each permutation of m exactly once. Indeed, deleting m reverses the "
            "construction uniquely and reveals whether it was a singleton or its preceding label. Therefore a "
            "uniform old permutation and a uniform independent insertion choice produce a uniform new permutation. "
            "Insertion after an existing label leaves the number of cycles unchanged; the singleton choice adds one "
            "cycle and has probability 1/m. If E_m is the expected cycle count, E_m=E_(m−1)+1/m, with E_1=1. "
            "Iterating to m=", n, " proves the stated sum."),
        {
            {"step-1", "Construct the insertion/deletion bijection for permutations.", 3},
            {"step-2", "Justify uniformity and the probability of adding a cycle.", 3},
            {"step-3", "Derive the expectation recurrence without assuming cycle independence.", 2},
            {"step-4", "Solve the recurrence with the correct base case.", 2},
        },
        {{"n", n}},
        std::nullopt
    };
}

Content advanced_probability_hidden_urn(Random& r) {
    const int a = r.integer(4, 9);
    const int b = r.integer(1, 3);
    const int k = r.integer(2, 5);
    return {
        text("Urn A contains ", a, " red and ", b, " blue balls; urn B contains ", b, " red and ", a,
            " blue balls. One urn is chosen with probability 1/2 and kept fixed. Draws from it are uniform with "
            "replacement. After observing ", k,
            " consecutive red draws, find the probability the next draw is red. Prove that the corresponding "
            "prediction strictly increases as the number of observed red draws increases from 0 onward."),
        text("Let H_j be the event that the first j draws are all red. Conditional on A, P(H_j)=(", a, "/",
            a + b, ")ʲ; conditional on B it is (", b, "/", a + b, ")ʲ. Bayes' theorem gives q_j=P(A|H_j)=",
            a, "ʲ/(", a, "ʲ+", b, "ʲ)=1/[1+(", b, "/", a,
            ")ʲ]. For j=0 this is 1/2, as it must be before any observations. Conditional independence of successive "
            "draws given the urn gives P(next red|H_j)=q_j·", a, "/", a + b, "+(1−q_j)·", b, "/",
            a + b, "=[", a, "^(j+1)+", b, "^(j+1)]/[", a + b, "(", a, "ʲ+", b,
            "ʲ)]. In particular the requested answer is [", a, "^", k + 1, "+", b, "^", k + 1, "]/[", a + b,
            "(", a, "^", k, "+", b, "^", k, ")]. Since 0<", b, "/", a,
            "<1, q_j strictly increases with j. The prediction is an affine function of q_j with positive slope (",
            a, "−", b, ")/", a + b, ", so it too strictly increases."),
        {
            {"step-1", "Compute likelihoods for the fixed hidden urn with replacement.", 3},
            {"step-2", "Derive the posterior and next-draw probability by conditioning.", 3},
            {"step-3", "Prove strict monotonicity of the posterior for every nonnegative count.", 2},
            {"step-4", "Transfer monotonicity to the prediction and include the zero-observation case.", 2},
        },
        {{"a", a}, {"b", b}, {"k", k}},
        std::nullopt
    };
}

Content advanced_probability_absorbing_walk(Random& r) {
    const int n = r.integer(5, 12);
    const int i = r.integer(1, n - 1);
    return {
        text("A token starts at integer ", i, " on {0,1,…,", n,
            "}. At each move, a fair independent coin moves it one step left or right. It stops on reaching 0 or ",
            n, ". Find, with proof, the probability it stops at ", n,
            " and its expected number of moves. Justify that the stopping time has finite expectation."),
        text("From any interior state, ", n, " consecutive left moves force absorption within ", n,
            " moves. Thus each block of ", n,
            " future moves has conditional absorption probability at least 2^(−", n,
            "). Consequently P(T>k·", n, ")≤(1−2^(−", n,
            "))ᵏ, which proves almost-sure absorption and, by summing the geometric tail, finite expectation. For a "
            "start at j, let p_j be the chance of finishing at ", n,
            " and e_j the mean duration. First-step conditioning gives p_j=(p_(j−1)+p_(j+1))/2, p_0=0,p_", n,
            "=1. Its unique solution is p_j=j/", n,
            ", because a sequence with zero second differences is affine. Likewise e_j=1+(e_(j−1)+e_(j+1))/2 with "
            "e_0=e_", n, "=0. The sequence j(", n,
            "−j) satisfies this recurrence. Any difference of two solutions has zero second differences and zero "
            "endpoints, so it is zero. Hence the answers are ", i, "/", n, " and ", i * (n - i),
            " moves."),
        {
            {"step-1", "Prove a geometric tail bound and finite expectation.", 3},
            {"step-2", "Set up and solve the absorption-probability recurrence.", 2},
            {"step-3", "Derive and solve the duration recurrence with correct boundary values.", 3},
            {"step-4", "Establish uniqueness and evaluate both expressions at the given start.", 2},
        },
        {{"n", n}, {"i", i}},
        std::nullopt
    };
}

Content advanced_probability_parity_conditioning(Random& r) {
    const int n = r.integer(4, 9);
    const int d = r.integer(3, 5);
    return {
        text("Each element of {1,…,", n, "} is selected independently with probability p=1/", d,
            ". Let S be the selected set. Find P(|S| is even) and P(1∈S given that |S| is even). Prove your formulas "
            "without listing all subsets."),
        text("For m independent selections, let E_m and O_m be the probabilities of even and odd counts. The binomial "
            "theorem gives E_m+O_m=1 and E_m−O_m=Σ(j=0 to m)(−1)ʲC(m,j)pʲ(1−p)^(m−j)=(1−2p)ᵐ. Thus E_m=[1+(1−2p)ᵐ]/2 "
            "and O_m=[1−(1−2p)ᵐ]/2. Now 1∈S together with even total size means that element 1 is selected and the "
            "other ", n - 1,
            " elements have odd selected count. These events are independent, so their joint probability is p·O_",
            n - 1, ". Dividing by E_", n, ">0 gives P(1∈S||S| even)=p[1−(1−2p)^", n - 1, "]/[1+(1−2p)^", n,
            "]. Substitute p=1/", d,
            " to obtain the requested two probabilities. The positivity of the conditioning event also follows from "
            "the positive probability of selecting nothing."),
        {
            {"step-1", "Use the binomial theorem to compute the difference of parity probabilities.", 3},
            {"step-2", "Solve for both even and odd probabilities.", 2},
            {"step-3", "Identify the correct independent event for the conditional numerator.", 3},
            {"step-4", "Divide by the nonzero conditioning probability and substitute the parameters.", 2},
        },
        {{"n", n}, {"d", d}},
        std::nullopt
    };
}

} // namespace

const std::vector<Family>& catalog() {
    static const std::vector<Family> families{
        {"algebra-product", "algebra", "foundation", "proof", "The sharp product bound", algebra_product},
        {"algebra-cubes", "algebra", "advanced", "numeric", "Reconstructing a symmetric sum", algebra_cubes},
        {"algebra-divisors", "algebra", "olympiad", "proof", "A Diophantine factorization", algebra_divisors},
        {"algebra-functional", "algebra", "olympiad", "proof", "Removing the quadratic part", algebra_functional},
        {"number-consecutive", "number-theory", "foundation", "proof", "Three consecutive factors", number_consecutive},
        {"number-gcd", "number-theory", "advanced", "proof", "An invariant greatest common divisor", number_gcd},
        {"number-descent", "number-theory", "olympiad", "proof", "An infinite descent", number_descent},
        {"number-cycle", "number-theory", "advanced", "numeric", "A power in a residue cycle", number_cycle},
        {"comb-divisibility", "combinatorics", "olympiad", "proof", "The odd-part pigeonholes", comb_divisibility},
        {"comb-paths", "combinatorics", "foundation", "numeric", "Shortest paths on a grid", comb_paths},
        {"comb-handshake", "combinatorics", "advanced", "proof", "Parity in a network", comb_handshake},
        {"comb-no-adjacent", "combinatorics", "advanced", "numeric", "Subsets with breathing room", comb_no_adjacent},
        {"geometry-diagonals", "geometry", "foundation", "proof", "Four equal areas", geometry_diagonals},
        {"geometry-inradius", "geometry", "foundation", "numeric", "A right triangle’s incircle", geometry_inradius},
        {"geometry-median", "geometry", "advanced", "proof", "The median identity", geometry_median},
        {"geometry-viviani", "geometry", "olympiad", "proof", "Three distances, one constant", geometry_viviani},
        {"calculus-log", "calculus", "advanced", "proof", "A logarithm below its tangent", calculus_log},
        {"calculus-max", "calculus", "foundation", "numeric", "Finding the global maximum", calculus_max},
        {"calculus-integral", "calculus", "advanced", "numeric", "A polynomial integral", calculus_integral},
        {"calculus-roots", "calculus", "olympiad", "proof", "A root that must exist", calculus_roots},
        {"probability-urn", "probability", "foundation", "numeric", "Two draws, one colour", probability_urn},
        {"probability-indicators", "probability", "advanced", "proof", "Expected fixed points", probability_indicators},
        {"probability-bayes", "probability", "advanced", "numeric", "Conditioning on at least one head", probability_bayes},
        {"probability-union", "probability", "olympiad", "proof", "A bound without independence", probability_union},
        {"advanced-algebra-schur", "algebra", "olympiad", "proof", "A cubic inequality with two equality patterns", advanced_algebra_schur},
        {"advanced-algebra-integer-factorization", "algebra", "olympiad", "proof", "Integer values that forbid a factorization", advanced_algebra_integer_factorization},
        {"advanced-algebra-parallelogram-function", "algebra", "advanced", "proof", "A quadratic law on all integers", advanced_algebra_parallelogram_function},
        {"advanced-algebra-product-extremum", "algebra", "olympiad", "proof", "A sharp product bound under two constraints", advanced_algebra_product_extremum},
        {"advanced-number-least-prime", "number-theory", "olympiad", "proof", "The smallest prime creates a contradiction", advanced_number_least_prime},
        {"advanced-number-sum-square-valuation", "number-theory", "olympiad", "proof", "Prime exponents in a sum of two squares", advanced_number_sum_square_valuation},
        {"advanced-number-binary-binomial", "number-theory", "olympiad", "proof", "Binary digits hidden in a binomial coefficient", advanced_number_binary_binomial},
        {"advanced-number-fourth-power-composite", "number-theory", "olympiad", "proof", "A power expression that is never prime", advanced_number_fourth_power_composite},
        {"advanced-comb-subsequence", "combinatorics", "olympiad", "proof", "Two kinds of monotone subsequence", advanced_comb_subsequence},
        {"advanced-comb-triangle-free", "combinatorics", "olympiad", "proof", "The edge limit for a triangle-free network", advanced_comb_triangle_free},
        {"advanced-comb-toggle-invariant", "combinatorics", "olympiad", "proof", "Exactly which boards can be switched?", advanced_comb_toggle_invariant},
        {"advanced-comb-tournament-path", "combinatorics", "advanced", "proof", "Ordering winners without assuming transitivity", advanced_comb_tournament_path},
        {"advanced-geometry-radius-inequality", "geometry", "olympiad", "proof", "Comparing the two radii of a triangle", advanced_geometry_radius_inequality},
        {"advanced-geometry-perpendicular-feet", "geometry", "olympiad", "proof", "Three perpendicular feet on one line", advanced_geometry_perpendicular_feet},
        {"advanced-geometry-angle-bisector", "geometry", "advanced", "proof", "An exact length for an angle bisector", advanced_geometry_angle_bisector},
        {"advanced-geometry-tangent-ratio", "geometry", "olympiad", "proof", "Tangents determine a squared side ratio", advanced_geometry_tangent_ratio},
        {"advanced-calculus-real-root-inequality", "calculus", "olympiad", "proof", "An inequality encoded by real polynomial roots", advanced_calculus_real_root_inequality},
        {"advanced-calculus-sharp-area", "calculus", "olympiad", "proof", "A sharp bound that no smooth arch attains", advanced_calculus_sharp_area},
        {"advanced-calculus-weighted-rolle", "calculus", "advanced", "proof", "A derivative relation at an unknown interior point", advanced_calculus_weighted_rolle},
        {"advanced-calculus-root-classification", "calculus", "olympiad", "proof", "Classifying all roots as a parameter moves", advanced_calculus_root_classification},
        {"advanced-probability-permutation-cycles", "probability", "olympiad", "proof", "The expected number of permutation cycles", advanced_probability_permutation_cycles},
        {"advanced-probability-hidden-urn", "probability", "advanced", "proof", "Learning which urn was selected", advanced_probability_hidden_urn},
        {"advanced-probability-absorbing-walk", "probability", "olympiad", "proof", "Both the destination and duration of a random walk", advanced_probability_absorbing_walk},
        {"advanced-probability-parity-conditioning", "probability", "olympiad", "proof", "Conditioning an independent selection on even size", advanced_probability_parity_conditioning},
    };
    return families;
}

} // namespace noether::questions::detail
