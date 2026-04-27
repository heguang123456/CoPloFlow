/**
 * @file parser.h
 * @brief Tree-sitter 解析接口
 *
 * 职责：
 * - 封装 Tree-sitter C API
 * - 提供语法解析与高亮数据生成能力
 * - 管理语法树生命周期（LRU 缓存）
 *
 * 接口设计：
 * - parseFile:    全量解析文件，构建语法树
 * - updateFile:   增量更新，仅重新解析变更区域
 * - getHighlightRanges: 从语法树提取高亮区间
 * - disposeTree:  释放语法树资源
 *
 * 后续阶段启用，当前为占位声明
 */

#ifndef CODELENS_PARSER_H_
#define CODELENS_PARSER_H_

#include <string>
#include <vector>

namespace codelens::parser {

/// 高亮区间
struct HighlightRange {
    int start_line;
    int start_col;
    int end_line;
    int end_col;
    std::string scope;  // 语法作用域（keyword, string, comment 等）
};

/// 解析结果
struct ParseResult {
    std::string tree_handle;                    // 语法树句柄
    std::vector<HighlightRange> highlight_ranges;
    std::string error_message;
};

/**
 * ParserService - 语法解析服务
 *
 * 后续阶段实现：
 * - 集成 Tree-sitter C API
 * - 增量解析优化
 * - LRU 缓存管理
 */
class ParserService {
public:
    ParserService() = default;
    ~ParserService() = default;

    /// 全量解析文件
    ParseResult parseFile(const std::string& filepath);

    /// 增量更新文件
    ParseResult updateFile(const std::string& filepath,
                            const std::string& old_content,
                            const std::string& new_content);

    /// 获取高亮区间
    std::vector<HighlightRange> getHighlightRanges(const std::string& tree_handle);

    /// 释放语法树
    void disposeTree(const std::string& tree_handle);
};

}  // namespace codelens::parser

#endif  // CODELENS_PARSER_H_
