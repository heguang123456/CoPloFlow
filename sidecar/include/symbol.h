/**
 * @file symbol.h
 * @brief 符号提取接口
 *
 * 职责：
 * - 从语法树中提取符号信息
 * - 支持定义查找与引用分析
 * - 支持函数重载消解
 *
 * 接口设计：
 * - extractSymbols:   从文件语法树提取所有符号
 * - findDefinition:   根据光标位置查找符号定义
 * - findReferences:   在项目范围内查找符号的所有引用
 * - resolveOverloads: 根据上下文消解函数重载
 *
 * 后续阶段启用，当前为占位声明
 */

#ifndef CODELENS_SYMBOL_H_
#define CODELENS_SYMBOL_H_

#include <string>
#include <vector>
#include <optional>

namespace codelens::symbol {

/// 符号类型枚举
enum class SymbolKind {
    Function,
    Class,
    Struct,
    Variable,
    Enum,
    EnumMember,
};

/// 符号信息
struct Symbol {
    std::string name;
    SymbolKind kind;
    std::string file_path;
    int start_line;
    int start_col;
    int end_line;
    int end_col;
};

/// 定义查找结果
struct DefinitionResult {
    std::optional<Symbol> symbol;       // 唯一定义
    std::vector<Symbol> candidates;     // 多定义候选（如函数重载）
};

/**
 * SymbolService - 符号提取服务
 *
 * 后续阶段实现：
 * - 基于 Tree-sitter 语法树的符号遍历
 * - 项目级符号表构建
 * - 函数重载消解
 */
class SymbolService {
public:
    SymbolService() = default;
    ~SymbolService() = default;

    /// 从文件提取所有符号
    std::vector<Symbol> extractSymbols(const std::string& filepath);

    /// 根据光标位置查找定义
    DefinitionResult findDefinition(const std::string& filepath,
                                     int line, int col);

    /// 查找符号的所有引用
    std::vector<Symbol> findReferences(const std::string& symbol_name);

    /// 消解函数重载
    std::optional<Symbol> resolveOverloads(const std::string& symbol_name,
                                            const std::vector<std::string>& param_types);
};

}  // namespace codelens::symbol

#endif  // CODELENS_SYMBOL_H_
