cmake_minimum_required(VERSION 3.20)
project(NoetherQuestions VERSION 0.1.0 LANGUAGES CXX)
include(GNUInstallDirs)
include(CMakePackageConfigHelpers)
include(CTest)

option(NOETHER_WARNINGS_AS_ERRORS "Treat compiler warnings as errors" OFF)
option(NOETHER_SANITIZERS "Compile with address and undefined-behavior sanitizers" OFF)
set(CMAKE_CXX_EXTENSIONS OFF)

function(noether_check_target target)
    target_compile_features(${target} PUBLIC cxx_std_20)
    if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
        target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic -Wconversion -Wsign-conversion -Wshadow)
        if(NOETHER_WARNINGS_AS_ERRORS)
            target_compile_options(${target} PRIVATE -Werror)
        endif()
        if(NOETHER_SANITIZERS)
            target_compile_options(${target} PRIVATE -fsanitize=address,undefined -fno-omit-frame-pointer -fno-sanitize-recover=all)
            target_link_options(${target} PUBLIC -fsanitize=address,undefined -fno-omit-frame-pointer)
        endif()
    endif()
endfunction()

add_library(noether_questions src/native/catalog.cpp src/native/engine.cpp src/native/json.cpp)
add_library(NoetherQuestions::questions ALIAS noether_questions)
set_target_properties(noether_questions PROPERTIES EXPORT_NAME questions)
target_include_directories(noether_questions PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>)
noether_check_target(noether_questions)

foreach(cli IN ITEMS avenquellis-questions noether-questions)
    add_executable(${cli} app/main.cpp)
    target_link_libraries(${cli} PRIVATE NoetherQuestions::questions)
    noether_check_target(${cli})
endforeach()
if(BUILD_SHARED_LIBS AND UNIX)
    file(RELATIVE_PATH lib_from_bin "${CMAKE_INSTALL_FULL_BINDIR}" "${CMAKE_INSTALL_FULL_LIBDIR}")
    if(APPLE)
        set_property(TARGET noether-questions avenquellis-questions PROPERTY INSTALL_RPATH "@loader_path/${lib_from_bin}")
    else()
        set_property(TARGET noether-questions avenquellis-questions PROPERTY INSTALL_RPATH "$ORIGIN/${lib_from_bin}")
    endif()
endif()

if(BUILD_TESTING)
    add_executable(noether-native-tests test/native.cpp)
    target_link_libraries(noether-native-tests PRIVATE NoetherQuestions::questions)
    noether_check_target(noether-native-tests)
    add_test(NAME native-library COMMAND noether-native-tests)
    add_test(NAME cli-help COMMAND avenquellis-questions --help)
    find_program(NOETHER_NODE node)
    if(NOETHER_NODE)
        add_test(NAME browser-parity COMMAND "${NOETHER_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/scripts/check-native-parity.mjs" "$<TARGET_FILE:avenquellis-questions>")
        set_tests_properties(browser-parity PROPERTIES TIMEOUT 150)
    else()
        message(STATUS "Node not found; skipping the optional browser differential test.")
    endif()
    add_test(NAME installed-consumer COMMAND ${CMAKE_COMMAND}
        "-DBUILD=${CMAKE_CURRENT_BINARY_DIR}" "-DSOURCE=${CMAKE_CURRENT_SOURCE_DIR}"
        "-DCOMPILER=${CMAKE_CXX_COMPILER}" "-DCONFIG=$<CONFIG>" "-DBINDIR=${CMAKE_INSTALL_BINDIR}"
        -P "${CMAKE_CURRENT_SOURCE_DIR}/test/consumer.cmake")
endif()

install(TARGETS noether_questions avenquellis-questions noether-questions EXPORT NoetherQuestionsTargets
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
set(package_dir "${CMAKE_INSTALL_LIBDIR}/cmake/NoetherQuestions")
install(EXPORT NoetherQuestionsTargets NAMESPACE NoetherQuestions:: DESTINATION "${package_dir}")
configure_package_config_file(cmake/NoetherQuestionsConfig.cmake.in
    "${CMAKE_CURRENT_BINARY_DIR}/NoetherQuestionsConfig.cmake" INSTALL_DESTINATION "${package_dir}")
write_basic_package_version_file("${CMAKE_CURRENT_BINARY_DIR}/NoetherQuestionsConfigVersion.cmake"
    VERSION ${PROJECT_VERSION} COMPATIBILITY SameMajorVersion)
install(FILES "${CMAKE_CURRENT_BINARY_DIR}/NoetherQuestionsConfig.cmake"
              "${CMAKE_CURRENT_BINARY_DIR}/NoetherQuestionsConfigVersion.cmake" DESTINATION "${package_dir}")
