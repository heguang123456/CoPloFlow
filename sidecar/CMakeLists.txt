# CodeLens C++ Sidecar - CMake 构建配置
#
# 构建目标：codelens-sidecar（独立可执行文件）
# 通信协议：JSON-RPC 2.0 over Stdio
# 依赖管理：CMake FetchContent（版本锁定）

cmake_minimum_required(VERSION 3.24)

# 允许 FetchContent_Populate（tree-sitter 无 CMakeLists.txt，需手动构建）
cmake_policy(SET CMP0169 OLD)

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
    add_compile_options(/W4 /permissive- /Zc:__cplusplus /utf-8)
else()
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# --- 依赖管理（全部使用本地 third_party，避免网络问题） ---

# nlohmann/json（v3.11.3）
set(NLOHMANN_JSON_DIR ${CMAKE_CURRENT_SOURCE_DIR}/third_party/nlohmann_json)
add_library(nlohmann_json INTERFACE)
target_include_directories(nlohmann_json INTERFACE ${NLOHMANN_JSON_DIR}/include)

# Tree-sitter（v0.20.8）—— 使用本地 third_party，避免网络问题
set(TREE_SITTER_DIR ${CMAKE_CURRENT_SOURCE_DIR}/third_party/tree-sitter)
add_library(tree_sitter STATIC
    ${TREE_SITTER_DIR}/lib/src/lib.c
    ${TREE_SITTER_DIR}/lib/src/alloc.c
    ${TREE_SITTER_DIR}/lib/src/get_changed_ranges.c
    ${TREE_SITTER_DIR}/lib/src/language.c
    ${TREE_SITTER_DIR}/lib/src/lexer.c
    ${TREE_SITTER_DIR}/lib/src/node.c
    ${TREE_SITTER_DIR}/lib/src/parser.c
    ${TREE_SITTER_DIR}/lib/src/query.c
    ${TREE_SITTER_DIR}/lib/src/stack.c
    ${TREE_SITTER_DIR}/lib/src/subtree.c
    ${TREE_SITTER_DIR}/lib/src/tree.c
    ${TREE_SITTER_DIR}/lib/src/tree_cursor.c
)
target_include_directories(tree_sitter PUBLIC
    ${TREE_SITTER_DIR}/lib/include
)
target_include_directories(tree_sitter PRIVATE
    ${TREE_SITTER_DIR}/lib/src
)
if(MSVC)
    target_compile_definitions(tree_sitter PRIVATE _CRT_SECURE_NO_WARNINGS)
endif()

# Tree-sitter C++ 语法库（v0.20.5）—— 使用本地 third_party
set(TREE_SITTER_CPP_DIR ${CMAKE_CURRENT_SOURCE_DIR}/third_party/tree-sitter-cpp)
add_library(tree_sitter_cpp STATIC
    ${TREE_SITTER_CPP_DIR}/src/parser.c
    ${TREE_SITTER_CPP_DIR}/src/scanner.c
)
target_include_directories(tree_sitter_cpp PUBLIC
    ${TREE_SITTER_CPP_DIR}/src
)
target_link_libraries(tree_sitter_cpp PRIVATE tree_sitter)

# --- 测试目标（后续阶段启用） ---
# TODO: 添加 Google Test 支持
# enable_testing()
# add_subdirectory(tests)

# --- 源文件 ---
set(SIDECAR_SOURCES
    src/main.cpp
    src/json_rpc.cpp
    src/parser.cpp
    src/symbol.cpp
    src/indexer.cpp
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
    nlohmann_json
)

# Windows 特殊处理：抑制某些警告
if(WIN32)
    target_compile_definitions(codelens-sidecar PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
endif()

# --- 测试目标（后续阶段启用） ---
# enable_testing()
# FetchContent_MakeAvailable(googletest)
# add_subdirectory(tests)
