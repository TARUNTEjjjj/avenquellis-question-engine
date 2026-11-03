#pragma once
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
/* The returned UTF-8 JSON is owned by the bridge and remains valid until the
 * next bridge call. Input lengths are byte counts; no input is interpreted as code. */
const char* axiom_evaluate(const char* expression, size_t length);
const char* axiom_check(const char* left, size_t left_length,
                        const char* right, size_t right_length);
#ifdef __cplusplus
}
#endif
