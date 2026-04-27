# CodeLens C++ Sidecar - CMake 构建配置
#
# 构建目标：codelens-sidecar（独立可执行文件）
# 通信协议：JSON-RPC 2.0 over Stdio
# 依赖管理：CMake FetchContent（版本锁定）

cmake_minimum_required(VERSION 3.24)
project(codelens-sidecar VERSION 0.2.0 LANGUAGES C CXX)

# --- C++ 标准设定 ---
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# --- C 标准设定（Tree-sitter 是 C 库） ---
set(CMAKE_C_STANDARD 11)

# --- 构建类型 ---
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# --- 编译选项 ---
if(MSVC)
    add_compile_options(/W4 /permissive- /Zc:__cplusplus)
    add_compile_options($<$<CONFIG:Release>:/O2 /DNDEBUG>)
    add_compile_options($<$<CONFIG:Debug>:/Zi /Od /D_DEBUG>)
else()
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# --- FetchContent 配置 ---
include(FetchContent)

# nlohmann/json（版本锁定 v3.11.3）
FetchContent_Declare(
    nlohmann_json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG        v3.11.3
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(nlohmann_json)

# Tree-sitter（版本锁定 v0.20.8）
FetchContent_Declare(
    tree_sitter
    GIT_REPOSITORY https://github.com/tree-sitter/tree-sitter.git
    GIT_TAG        v0.20.8
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(tree_sitter)

# Tree-sitter C++ 语法库（版本锁定 v0.20.8）
FetchContent_Declare(
    tree_sitter_cpp
    GIT_REPOSITORY https://github.com/tree-sitter/tree-sitter-cpp.git
    GIT_TAG        v0.20.8
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(tree_sitter_cpp)

# Google Test（版本锁定 v1.14.0，仅测试时构建）
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG        v1.14.0
    GIT_SHALLOW    TRUE
)

# --- 源文件 ---
set(SIDECAR_SOURCES
    src/main.cpp
    src/json_rpc.cpp
    src/parser.cpp
)

set(SIDECAR_HEADERS
    include/json_rpc.h
    include/parser.h
    include/symbol.h
    include/indexer.h
)

# --- 主目标 ---
add_executable(codelens-sidecar ${SIDECAR_SOURCES})

target_include_directories(codelens-sidecar
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/include
        ${CMAKE_CURRENT_BINARY_DIR}
)

# 链接 Tree-sitter 和 tree-sitter-cpp
target_link_libraries(codelens-sidecar PRIVATE
    tree_sitter
    tree_sitter_cpp
    nlohmann_json::nlohmann_json
)

# Windows 特殊处理：抑制某些警告
if(WIN32)
    target_compile_definitions(codelens-sidecar PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
endif()

# --- 测试目标（后续阶段启用） ---
# enable_testing()
# FetchContent_MakeAvailable(googletest)
# add_subdirectory(tests)
