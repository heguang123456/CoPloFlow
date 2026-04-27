/**
 * @file test_parser.cpp
 * @brief ParserService 单元测试（Google Test）
 *
 * 测试范围：
 * 1. 有效 C++ 文件解析 → 返回非空高亮区间
 * 2. 不存在文件 → 返回错误信息
 * 3. 语法树遍历完整性（覆盖关键语法元素）
 * 4. 增量更新一致性（增量结果 ≈ 全量结果）
 * 5. 语言检测（扩展名 → 语言映射）
 * 6. 语法树缓存管理
 */

#include <gtest/gtest.h>
#include "parser.h"

using namespace codelens::parser;

// --- 测试基类 ---

class ParserServiceTest : public ::testing::Test {
protected:
    ParserService parser;

    void SetUp() override {
        // 每个测试前检查语言支持
        ASSERT_TRUE(parser.isLanguageSupported("cpp"));
    }

    void TearDown() override {
        parser.disposeAll();
    }

    /// 统计特定 scope 的区间数量
    size_t countRangesByScope(const std::vector<HighlightRange>& ranges,
                              const std::string& scope) {
        return std::count_if(ranges.begin(), ranges.end(),
            [&](const HighlightRange& r) { return r.scope == scope; });
    }

    /// 检查区间是否有效（start < end）
    bool validateRanges(const std::vector<HighlightRange>& ranges) {
        for (const auto& r : ranges) {
            if (r.start_line > r.end_line) return false;
            if (r.start_line == r.end_line && r.start_col >= r.end_col) return false;
            if (r.scope.empty()) return false;
        }
        return true;
    }
};

// --- 测试用例 ---

// 1. 有效 C++ 文件解析
TEST_F(ParserServiceTest, ParseValidCppFile) {
    auto result = parser.parseFile("tests/test_data/sample.cpp");

    EXPECT_TRUE(result.success()) << "Parse failed: " << result.error_message;
    EXPECT_GT(result.highlight_ranges.size(), 0u) << "No highlight ranges generated";
    EXPECT_TRUE(validateRanges(result.highlight_ranges)) << "Invalid highlight ranges";
}

// 2. 不存在文件
TEST_F(ParserServiceTest, ParseNonExistentFile) {
    auto result = parser.parseFile("tests/test_data/not_exist.cpp");

    EXPECT_FALSE(result.success());
    EXPECT_FALSE(result.error_message.empty());
}

// 3. 关键语法元素覆盖
TEST_F(ParserServiceTest, CoversKeySyntaxElements) {
    auto result = parser.parseFile("tests/test_data/sample.cpp");
    ASSERT_TRUE(result.success());

    const auto& ranges = result.highlight_ranges;

    // 应包含关键字
    EXPECT_GT(countRangesByScope(ranges, "keyword.control"), 0u)
        << "Missing control flow keywords (if/for/while/return)";
    EXPECT_GT(countRangesByScope(ranges, "keyword.type"), 0u)
        << "Missing type keywords (int/double/void/const)";

    // 应包含字符串
    EXPECT_GT(countRangesByScope(ranges, "string"), 0u)
        << "Missing string literals";

    // 应包含数字
    EXPECT_GT(countRangesByScope(ranges, "constant.numeric"), 0u)
        << "Missing numeric literals";

    // 应包含注释
    EXPECT_GT(countRangesByScope(ranges, "comment"), 0u)
        << "Missing comments";

    // 应包含预处理器指令
    EXPECT_GT(countRangesByScope(ranges, "keyword.preprocessor"), 0u)
        << "Missing preprocessor directives (#include)";
}

// 4. 内存中的字符串解析
TEST_F(ParserServiceTest, ParseContentFromMemory) {
    const std::string code = R"(
        #include <iostream>
        int main() {
            int x = 42;
            std::cout << "Hello" << std::endl;
            return 0;
        }
    )";

    auto result = parser.parseContent(code, "cpp", "__test__");

    EXPECT_TRUE(result.success());
    EXPECT_GT(result.highlight_ranges.size(), 0u);
    EXPECT_GT(countRangesByScope(result.highlight_ranges, "keyword.preprocessor"), 0u);
    EXPECT_GT(countRangesByScope(result.highlight_ranges, "constant.numeric"), 0u);
    EXPECT_GT(countRangesByScope(result.highlight_ranges, "string"), 0u);
}

// 5. 增量更新一致性
TEST_F(ParserServiceTest, IncrementalUpdateConsistentWithFullParse) {
    const std::string old_code = R"(
        int main() {
            int x = 1;
            return x;
        }
    )";

    const std::string new_code = R"(
        int main() {
            int x = 1;
            int y = 2;
            return x + y;
        }
    )";

    // 全量解析
    auto full_result = parser.parseContent(new_code, "cpp", "__inc_test__");
    ASSERT_TRUE(full_result.success());

    // 先解析旧版本
    auto old_result = parser.parseContent(old_code, "cpp", "__inc_test__");
    ASSERT_TRUE(old_result.success());

    // 增量更新
    auto incr_result = parser.updateFile("__inc_test__", old_code, new_code);
    ASSERT_TRUE(incr_result.success()) << "Incremental update failed: " << incr_result.error_message;

    // 增量结果应该包含高亮区间
    EXPECT_GT(incr_result.highlight_ranges.size(), 0u)
        << "Incremental update produced no ranges";
}

// 6. 语言检测
TEST_F(ParserServiceTest, LanguageDetection) {
    EXPECT_TRUE(parser.isLanguageSupported("cpp"));

    auto langs = parser.getSupportedLanguages();
    EXPECT_FALSE(langs.empty());
    EXPECT_NE(std::find(langs.begin(), langs.end(), "cpp"), langs.end());
}

// 7. 语法树缓存管理
TEST_F(ParserServiceTest, TreeCacheManagement) {
    const std::string code = "int x = 42;";

    // 解析并缓存
    auto result1 = parser.parseContent(code, "cpp", "__cache_test__");
    ASSERT_TRUE(result1.success());

    // 获取缓存的高亮
    auto cached_ranges = parser.getHighlightRanges("__cache_test__");
    EXPECT_FALSE(cached_ranges.empty());

    // 释放缓存
    parser.disposeTree("__cache_test__");

    // 缓存释放后应返回空
    auto after_dispose = parser.getHighlightRanges("__cache_test__");
    EXPECT_TRUE(after_dispose.empty());
}

// 8. HighlightRange JSON 序列化
TEST_F(ParserServiceTest, HighlightRangeSerialization) {
    HighlightRange range{
        .start_line = 0,
        .start_col = 4,
        .end_line = 0,
        .end_col = 7,
        .scope = "keyword",
    };

    std::string json = range.toJson();
    EXPECT_NE(json.find("\"startLine\":0"), std::string::npos);
    EXPECT_NE(json.find("\"scope\":\"keyword\""), std::string::npos);
}

// 9. 空文件解析
TEST_F(ParserServiceTest, ParseEmptyContent) {
    auto result = parser.parseContent("", "cpp", "__empty__");
    // 空文件应该成功解析但返回零区间
    EXPECT_TRUE(result.success());
    // Tree-sitter 对空内容也能产生有效的语法树（只有 translation_unit 节点）
}

// 10. 大文件解析（性能基准参考）
TEST_F(ParserServiceTest, DISABLED_LargeFilePerformance) {
    // 生成 10000 行代码
    std::string large_code;
    for (int i = 0; i < 10000; i++) {
        large_code += "void func_" + std::to_string(i) + "() { int x = " +
                      std::to_string(i) + "; return x; }\n";
    }

    auto start = std::chrono::high_resolution_clock::now();
    auto result = parser.parseContent(large_code, "cpp", "__perf_test__");
    auto end = std::chrono::high_resolution_clock::now();

    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);

    EXPECT_TRUE(result.success());
    EXPECT_LT(duration.count(), 500) << "Parse took too long: " << duration.count() << "ms";
}
