/**
 * @file symbol.cpp
 * @brief 符号提取服务实现（占位）
 *
 * 当前阶段：基础框架代码，核心逻辑在阶段3实现
 */

#include "symbol.h"

namespace codelens::symbol {

std::vector<Symbol> SymbolService::extractSymbols(const std::string& filepath) {
    // TODO: 阶段3 - 基于 Tree-sitter 的符号遍历
    return {};
}

DefinitionResult SymbolService::findDefinition(const std::string& filepath, int line, int col) {
    // TODO: 阶段3 - 符号定义查找
    DefinitionResult result;
    return result;
}

std::vector<Symbol> SymbolService::findReferences(const std::string& symbol_name) {
    // TODO: 阶段3 - 引用查找
    return {};
}

std::optional<Symbol> SymbolService::resolveOverloads(const std::string& symbol_name,
                                                        const std::vector<std::string>& param_types) {
    // TODO: 阶段3 - 函数重载消解
    return std::nullopt;
}

}  // namespace codelens::symbol
