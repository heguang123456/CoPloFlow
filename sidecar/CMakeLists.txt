# CodeLens C++ Sidecar - CMake 构建配置
#
# 构建目标：codelens-sidecar（独立可执行文件）
# 通信协议：JSON-RPC 2.0 over Stdio
# 依赖管理：CMake FetchContent（版本锁定）

cmake_minimum_required(VERSION 3.24)
project(codelens-sidecar VERSION 0.1.0 LANGUAGES CXX)

# --- C++ 标准设定 ---
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# --- 构建类型 ---
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# --- 编译选项 ---
if(MSVC)
    add_compile_options(/W4 /permissive- /Zc:__cplusplus)
    # Release 优化
    add_compile_options($<$<CONFIG:Release>:/O2 /DNDEBUG>)
    # Debug 调试信息
    add_compile_options($<$<CONFIG:Debug>:/Zi /Od /D_DEBUG>)
else()
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# --- FetchContent 配置 ---
include(FetchContent)

# Tree-sitter C API（版本锁定 v0.20.8）
FetchContent_Declare(
    tree_sitter
    GIT_REPOSITORY https://github.com/tree-sitter/tree-sitter.git
    GIT_TAG        v0.20.8
    GIT_SHALLOW    TRUE
)

# SQLite3（版本锁定 3.45.0）
FetchContent_Declare(
    sqlite3
    GIT_REPOSITORY https://github.com/nicferrier/sqlite3-cmake.git
    GIT_TAG        master
    GIT_SHALLOW    TRUE
)

# Google Test（版本锁定 v1.14.0，仅测试时构建）
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG        v1.14.0
    GIT_SHALLOW    TRUE
)

# --- 暂不拉取依赖（后续阶段按需启用） ---
# FetchContent_MakeAvailable(tree_sitter sqlite3)

# --- 源文件 ---
set(SIDECAR_SOURCES
    src/main.cpp
    src/json_rpc.cpp
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

# --- 测试目标（后续阶段启用） ---
# enable_testing()
# FetchContent_MakeAvailable(googletest)
# add_subdirectory(tests)
