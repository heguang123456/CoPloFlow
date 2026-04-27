/**
 * @file symbol.h
 * @brief 符号提取接口
 *
 * 职责：
 * - 从语法树中提取符号信息（函数、类、结构体、变量、枚举）
 * - 支持定义查找（Go to Definition）
 * - 支持引用查找（Find All References）
 * - 支持函数重载消解
 * - 维护内存中的符号表（供跨文件查找）
 *
 * 接口设计：
 * - extractSymbols:   从文件语法树提取所有符号
 * - findDefinition:   根据光标位置查找符号定义
 * - findReferences:   在项目范围内查找符号的所有引用
 * - resolveOverloads: 根据上下文消解函数重载
 * - indexProject:     索引项目所有源文件
 */

#ifndef CODELENS_SYMBOL_H_
#define CODELENS_SYMBOL_H_

#include <string>
#include <vector>
#include <optional>
#include <unordered_map>
#include <mutex>
#include <filesystem>

// Tree-sitter C API
extern "C" {
#include <tree_sitter/api.h>
}

// tree-sitter-cpp 解析器声明
extern "C" const TSLanguage* tree_sitter_cpp();

namespace codelens::symbol {

/// 符号类型枚举
enum class SymbolKind {
    Function,
    Class,
    Struct,
    Variable,
    Enum,
    EnumMember,
    Namespace,
    TypeAlias,
    Macro,
    Field,
    Method,
    Constructor,
    Destructor,
};

/// 符号信息
struct Symbol {
    std::string name;           // 符号名称
    SymbolKind kind;            // 符号类型
    std::string file_path;      // 所在文件路径
    uint32_t start_line;        // 起始行号（0-based）
    uint32_t start_col;         // 起始列号（0-based）
    uint32_t end_line;          // 结束行号（0-based）
    uint32_t end_col;           // 结束列号（0-based）
    std::string qualified_name; // 限定名（如 "Namespace::Class::method"）

    /// 符号类型转字符串（用于 JSON 输出）
    static std::string kindToString(SymbolKind k);
};

/// 定义查找结果
struct DefinitionResult {
    std::optional<Symbol> symbol;       // 唯一定义
    std::vector<Symbol> candidates;     // 多定义候选（如函数重载）
    bool found() const { return symbol.has_value() || !candidates.empty(); }
};

/// 引用查找结果（额外包含上下文代码）
struct ReferenceLocation {
    std::string file_path;
    uint32_t start_line;
    uint32_t start_col;
    uint32_t end_line;
    uint32_t end_col;
    std::string context_line;  // 所在行的完整内容
    bool is_definition;        // 是否是定义位置
};

/// 符号表条目
struct SymbolTableEntry {
    Symbol symbol;
    std::vector<std::string> local_scopes; // 该符号在哪些作用域内可见
};

/**
 * SymbolService - 符号提取服务
 *
 * 核心功能：
 * - 基于 Tree-sitter 语法树的符号遍历与提取
 * - 内存符号表维护（name → entries 映射）
 * - 项目级符号索引（批量扫描源文件）
 * - 定义查找：光标位置 → 符号名 → 符号表查找定义
 * - 引用查找：符号名 → 遍历项目文件查找同名引用
 */
class SymbolService {
public:
    SymbolService();
    ~SymbolService();

    // 禁止拷贝
    SymbolService(const SymbolService&) = delete;
    SymbolService& operator=(const SymbolService&) = delete;

    /// 从单个文件提取所有符号
    /// @param filepath 文件路径
    /// @return 符号列表
    std::vector<Symbol> extractSymbols(const std::string& filepath);

    /// 从已解析的语法树提取符号
    /// @param tree 语法树指针
    /// @param source 源代码文本
    /// @param filepath 文件路径
    /// @return 符号列表
    std::vector<Symbol> extractSymbolsFromTree(
        TSTree* tree,
        const std::string& source,
        const std::string& filepath);

    /// 根据光标位置查找定义
    /// @param filepath 文件路径
    /// @param line 行号（0-based）
    /// @param col 列号（0-based）
    /// @return 定义查找结果
    DefinitionResult findDefinition(const std::string& filepath,
                                     uint32_t line, uint32_t col);

    /// 查找符号的所有引用
    /// @param symbol_name 符号名称
    /// @return 引用位置列表
    std::vector<ReferenceLocation> findReferences(const std::string& symbol_name);

    /// 消解函数重载
    /// @param symbol_name 函数名
    /// @param param_types 参数类型列表
    /// @return 最匹配的重载定义
    std::optional<Symbol> resolveOverloads(const std::string& symbol_name,
                                            const std::vector<std::string>& param_types);

    /// 索引项目所有源文件
    /// @param project_path 项目根目录
    /// @return 成功索引的文件数量
    size_t indexProject(const std::string& project_path);

    /// 清除所有符号表数据
    void clearIndex();

    /// 获取符号表条目总数
    size_t getSymbolCount() const;

    /// 获取已索引的文件列表
    std::vector<std::string> getIndexedFiles() const;

    /// 设置 Tree-sitter Parser（用于解析文件内容）
    void setParser(TSParser* parser, const TSLanguage* language);

private:
    /// 判断 Tree-sitter 节点类型是否为符号定义节点
    bool isDefinitionNode(const std::string& node_type) const;

    /// 从 Tree-sitter 节点提取 Symbol
    std::optional<Symbol> extractSymbolFromNode(
        TSNode node,
        const std::string& source,
        const std::string& filepath) const;

    /// 获取符号的限定名（含命名空间/类名前缀）
    std::string getQualifiedName(TSNode node, const std::string& source) const;

    /// 判断 Tree-sitter 节点是否为引用（而非定义）
    bool isReferenceNode(TSNode node) const;

    /// 获取节点名称的 child node
    TSNode getNameNode(TSNode node) const;

    /// 从光标位置获取所在节点的符号名称
    std::optional<std::string> getSymbolNameAtPosition(
        TSTree* tree,
        const std::string& source,
        uint32_t line,
        uint32_t col) const;

    /// 获取或创建指定文件的语法树
    TSTree* getOrCreateTree(const std::string& filepath,
                             const std::string& content);

    /// 扫描项目目录中的源文件
    std::vector<std::filesystem::path> scanSourceFiles(
        const std::string& project_path) const;

    /// 符号类型 → 字符串 映射
    static std::string symbolKindToString(SymbolKind kind);

    /// 字符串 → 符号类型 映射
    static SymbolKind stringToSymbolKind(const std::string& str);

    // Tree-sitter 解析器（外部注入）
    TSParser* parser_ = nullptr;
    const TSLanguage* language_ = nullptr;

    // 符号表（符号名 → 条目列表，支持重载）
    std::unordered_map<std::string, std::vector<SymbolTableEntry>> symbol_table_;

    // 文件缓存（文件路径 → {语法树, 源代码}）
    struct FileCacheEntry {
        std::unique_ptr<TSTree, void(*)(TSTree*)> tree;
        std::string content;
    };
    std::unordered_map<std::string, FileCacheEntry> file_cache_;

    // 已索引文件集合
    std::unordered_set<std::string> indexed_files_;

    // 线程安全
    mutable std::mutex mutex_;
};

}  // namespace codelens::symbol

#endif  // CODELENS_SYMBOL_H_
