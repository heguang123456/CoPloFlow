/**
 * @file parser.cpp
 * @brief Tree-sitter 解析服务实现（占位）
 *
 * 当前阶段：基础框架代码，核心逻辑在阶段2实现
 */

#include "parser.h"

namespace codelens::parser {

ParseResult ParserService::parseFile(const std::string& filepath) {
    // TODO: 阶段2 - 集成 Tree-sitter C API
    ParseResult result;
    result.error_message = "Not implemented yet";
    return result;
}

ParseResult ParserService::updateFile(const std::string& filepath,
                                       const std::string& old_content,
                                       const std::string& new_content) {
    // TODO: 阶段2 - 增量解析实现
    ParseResult result;
    result.error_message = "Not implemented yet";
    return result;
}

std::vector<HighlightRange> ParserService::getHighlightRanges(const std::string& tree_handle) {
    // TODO: 阶段2 - 高亮区间提取
    return {};
}

void ParserService::disposeTree(const std::string& tree_handle) {
    // TODO: 阶段2 - 语法树资源释放
}

}  // namespace codelens::parser
