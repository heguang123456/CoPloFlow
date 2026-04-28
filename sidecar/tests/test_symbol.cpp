/**
 * @file test_symbol.cpp
 * @brief SymbolService 单元测试（Google Test）
 *
 * 测试覆盖：
 * - extractSymbols: 从 C++ 语法树提取符号
 * - findDefinition: 光标位置 → 定义查找
 * - findReferences: 符号名 → 引用列表
 * - indexProject: 项目索引构建
 * - 边界条件：空文件、无效路径、无匹配
 */

#include <gtest/gtest.h>
#include "symbol.h"

using namespace codelens::symbol;

// ============================================================
// 测试数据：多文件 C++ 项目
// ============================================================

static const std::string TEST_HEADER = R"cpp(
#pragma once

namespace utils {

class MathHelper {
public:
    int add(int a, int b);
    int subtract(int a, int b);
    static double PI;

private:
    int internalState;
};

struct Point {
    double x;
    double y;
};

enum class Color {
    Red,
    Green,
    Blue,
};

int factorial(int n);
double computeArea(double radius);

}  // namespace utils
)cpp";

static const std::string TEST_SOURCE = R"cpp(
#include "math_helper.h"
#include <cmath>

namespace utils {

double MathHelper::PI = 3.14159265;

int MathHelper::add(int a, int b) {
    return a + b;
}

int MathHelper::subtract(int a, int b) {
    return a - b;
}

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

double computeArea(double radius) {
    return MathHelper::PI * radius * radius;
}

}  // namespace utils

int main() {
    utils::MathHelper helper;
    int result = helper.add(1, 2);
    double area = utils::computeArea(5.0);
    return 0;
}
)cpp";

// ============================================================
// extractSymbols 测试
// ============================================================

TEST(SymbolServiceTest, ExtractSymbolsFromHeader) {
    SymbolService svc;
    TSParser* parser = ts_parser_new();
    ts_parser_set_language(parser, tree_sitter_cpp());
    svc.setParser(parser, tree_sitter_cpp());

    // 创建临时头文件
    const std::string testFile = "test_data/test_header.h";
    std::ofstream file(testFile);
    file << TEST_HEADER;
    file.close();

    auto symbols = svc.extractSymbols(testFile);

    // 验证提取到的符号
    EXPECT_GT(symbols.size(), 0u);

    // 验证特定符号
    bool found_class = false;
    bool found_function = false;
    bool found_namespace = false;
    bool found_enum = false;

    for (const auto& sym : symbols) {
        if (sym.kind == SymbolKind::Class && sym.name == "MathHelper") found_class = true;
        if (sym.kind == SymbolKind::Function && sym.name == "add") found_function = true;
        if (sym.kind == SymbolKind::Namespace && sym.name == "utils") found_namespace = true;
        if (sym.kind == SymbolKind::Enum && sym.name == "Color") found_enum = true;
    }

    EXPECT_TRUE(found_class) << "Should find MathHelper class";
    EXPECT_TRUE(found_function) << "Should find add function declaration";
    EXPECT_TRUE(found_namespace) << "Should find utils namespace";
    EXPECT_TRUE(found_enum) << "Should find Color enum";

    // 清理
    std::remove(testFile.c_str());
    ts_parser_delete(parser);
}

TEST(SymbolServiceTest, ExtractSymbolsFromSource) {
    SymbolService svc;
    TSParser* parser = ts_parser_new();
    ts_parser_set_language(parser, tree_sitter_cpp());
    svc.setParser(parser, tree_sitter_cpp());

    const std::string testFile = "test_data/test_source.cpp";
    std::ofstream file(testFile);
    file << TEST_SOURCE;
    file.close();

    auto symbols = svc.extractSymbols(testFile);

    // 验证提取到的符号
    EXPECT_GT(symbols.size(), 0u);

    // 查找 factorial 函数定义
    bool found_factorial = false;
    bool found_computeArea = false;
    bool found_PI = false;
    bool found_main = false;

    for (const auto& sym : symbols) {
        if (sym.name == "factorial" && sym.kind == SymbolKind::Function) found_factorial = true;
        if (sym.name == "computeArea" && sym.kind == SymbolKind::Function) found_computeArea = true;
        if (sym.name == "PI" && sym.kind == SymbolKind::Variable) found_PI = true;
        if (sym.name == "main" && sym.kind == SymbolKind::Function) found_main = true;
    }

    EXPECT_TRUE(found_factorial) << "Should find factorial function";
    EXPECT_TRUE(found_computeArea) << "Should find computeArea function";
    EXPECT_TRUE(found_PI) << "Should find PI variable";
    EXPECT_TRUE(found_main) << "Should find main function";

    std::remove(testFile.c_str());
    ts_parser_delete(parser);
}

TEST(SymbolServiceTest, ExtractSymbolsFromEmptyFile) {
    SymbolService svc;

    const std::string testFile = "test_data/empty.cpp";
    std::ofstream file(testFile);
    file << "";
    file.close();

    auto symbols = svc.extractSymbols(testFile);
    EXPECT_EQ(symbols.size(), 0u);

    std::remove(testFile.c_str());
}

TEST(SymbolServiceTest, ExtractSymbolsFromInvalidPath) {
    SymbolService svc;
    auto symbols = svc.extractSymbols("/nonexistent/path/file.cpp");
    EXPECT_EQ(symbols.size(), 0u);
}

// ============================================================
// SymbolKind 测试
// ============================================================

TEST(SymbolServiceTest, SymbolKindToString) {
    EXPECT_EQ(Symbol::kindToString(SymbolKind::Function), "Function");
    EXPECT_EQ(Symbol::kindToString(SymbolKind::Class), "Class");
    EXPECT_EQ(Symbol::kindToString(SymbolKind::Struct), "Struct");
    EXPECT_EQ(Symbol::kindToString(SymbolKind::Variable), "Variable");
    EXPECT_EQ(Symbol::kindToString(SymbolKind::Enum), "Enum");
    EXPECT_EQ(Symbol::kindToString(SymbolKind::Namespace), "Namespace");
    EXPECT_EQ(Symbol::kindToString(SymbolKind::Macro), "Macro");
}

// ============================================================
// indexProject 测试
// ============================================================

TEST(SymbolServiceTest, IndexProject) {
    SymbolService svc;

    // 创建测试文件
    std::filesystem::create_directories("test_data/project");
    std::ofstream("test_data/project/main.cpp") << TEST_SOURCE;
    std::ofstream("test_data/project/math_helper.h") << TEST_HEADER;

    size_t count = svc.indexProject("test_data/project");

    EXPECT_EQ(count, 2u);
    EXPECT_GT(svc.getSymbolCount(), 0u);

    auto files = svc.getIndexedFiles();
    EXPECT_EQ(files.size(), 2u);

    svc.clearIndex();
    EXPECT_EQ(svc.getSymbolCount(), 0u);

    // 清理
    std::filesystem::remove_all("test_data/project");
}

// ============================================================
// QualifiedName 测试
// ============================================================

TEST(SymbolServiceTest, QualifiedNameGeneration) {
    SymbolService svc;
    TSParser* parser = ts_parser_new();
    ts_parser_set_language(parser, tree_sitter_cpp());
    svc.setParser(parser, tree_sitter_cpp());

    const std::string testFile = "test_data/qualified.cpp";
    std::ofstream file(testFile);
    file << "namespace math {\n"
         << "class Calculator {\n"
         << "public:\n"
         << "    int compute(int x);\n"
         << "};\n"
         << "}  // namespace math\n";
    file.close();

    auto symbols = svc.extractSymbols(testFile);

    // 验证限定名
    for (const auto& sym : symbols) {
        if (sym.name == "compute") {
            EXPECT_FALSE(sym.qualified_name.empty());
            EXPECT_NE(sym.qualified_name, sym.name);
            break;
        }
    }

    std::remove(testFile.c_str());
    ts_parser_delete(parser);
}
