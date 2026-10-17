cmake_minimum_required(VERSION 3.16)
project(lock_bench LANGUAGES CXX)

# C++17, without compiler-specific extensions.
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Default to a Release build when no build type is given.
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Release uses -O2 (CMake's default would be -O3) so results match the plan.
set(CMAKE_CXX_FLAGS_RELEASE "-O2 -DNDEBUG")

# Optional ThreadSanitizer build:  cmake -DENABLE_TSAN=ON ...
option(ENABLE_TSAN "Build with ThreadSanitizer (-fsanitize=thread)" OFF)

# std::thread needs the pthread library on Linux.
find_package(Threads REQUIRED)

add_executable(lock_bench
    src/bench/main.cpp
    src/bench/metrics.cpp
)

target_compile_options(lock_bench PRIVATE -O2 -Wall -Wextra)
target_link_libraries(lock_bench PRIVATE Threads::Threads)

if(ENABLE_TSAN)
    target_compile_options(lock_bench PRIVATE -fsanitize=thread -g)
    target_link_options(lock_bench PRIVATE -fsanitize=thread)
endif()
