/**
 * @file symbol.cpp
 * @brief 符号提取服务实现
 *
 * 核心逻辑：
 * - 基于 Tree-sitter C++ 语法树提取符号定义
 * - 维护内存符号表（name → entries 映射）
 * - 定义查找：光标位置 → 节点 → 符号名 → 符号表
 * - 引用查找：符号名 → 遍历已索引文件 → 匹配节点文本
 * - 项目索引：扫描 .cpp/.h/.c/.hpp 等扩展名文件并批量解析
 */

#include "symbol.h"
#include "parser.h"

#include <fstream>
#include <sstream>
#include <algorithm>
#include <iostream>
#include <filesystem>
#include <functional>

namespace fs = std::filesystem;
namespace symbol_ns = codelens::symbol;
using symbol_ns::Symbol;
using symbol_ns::SymbolKind;
using symbol_ns::DefinitionResult;
using symbol_ns::ReferenceLocation;

// ============================================================
// 辅助函数
// ============================================================

/// C++ 符号定义节点类型集合
static const std::vector<std::string>& getDefinitionNodeTypes() {
    static const std::vector<std::string> types = {
        "function_definition",       // 函数定义
        "class_specifier",           // class Foo { ... };
        "struct_specifier",          // struct Bar { ... };
        "enum_specifier",            // enum Color { ... };
        "declaration",               // 变量声明（如 int x = 5;）
        "type_definition",           // typedef / using 类型别名
        "namespace_definition",      // namespace ns { ... }
        "preproc_function_def",      // #define 宏
        "preproc_def",               // #define 宏（简化）
        "destructor_name",           // ~Foo()
    };
    return types;
}

/// 作用域分隔符
static const std::string SCOPE_SEPARATOR = "::";

/// 文件扩展名白名单
static const std::vector<std::string>& getSourceExtensions() {
    static const std::vector<std::string> exts = {
        ".cpp", ".cc", ".cxx", ".c++",   // C++ 源文件
        ".h", ".hpp", ".hxx", ".h++",    // C++ 头文件
        ".c",                             // C 源文件
        ".inl", ".inc",                   // 内联文件
    };
    return exts;
}

// ============================================================
// Symbol 静态方法
// ============================================================

std::string symbol_ns::Symbol::kindToString(symbol_ns::SymbolKind k) {
    switch (k) {
        case SymbolKind::Function:     return "Function";
        case SymbolKind::Class:        return "Class";
        case SymbolKind::Struct:       return "Struct";
        case SymbolKind::Variable:     return "Variable";
        case SymbolKind::Enum:         return "Enum";
        case SymbolKind::EnumMember:   return "EnumMember";
        case SymbolKind::Namespace:    return "Namespace";
        case SymbolKind::TypeAlias:    return "TypeAlias";
        case SymbolKind::Macro:        return "Macro";
        case SymbolKind::Field:        return "Field";
        case SymbolKind::Method:       return "Method";
        case SymbolKind::Constructor:  return "Constructor";
        case SymbolKind::Destructor:   return "Destructor";
        default:                       return "Unknown";
    }
}

std::string symbol_ns::SymbolService::symbolKindToString(SymbolKind kind) {
    return Symbol::kindToString(kind);
}

SymbolKind symbol_ns::SymbolService::stringToSymbolKind(const std::string& str) {
    static const std::unordered_map<std::string, SymbolKind> map = {
        {"Function", SymbolKind::Function},
        {"Class", SymbolKind::Class},
        {"Struct", SymbolKind::Struct},
        {"Variable", SymbolKind::Variable},
        {"Enum", SymbolKind::Enum},
        {"EnumMember", SymbolKind::EnumMember},
        {"Namespace", SymbolKind::Namespace},
        {"TypeAlias", SymbolKind::TypeAlias},
        {"Macro", SymbolKind::Macro},
        {"Field", SymbolKind::Field},
        {"Method", SymbolKind::Method},
        {"Constructor", SymbolKind::Constructor},
        {"Destructor", SymbolKind::Destructor},
    };
    auto it = map.find(str);
    return (it != map.end()) ? it->second : SymbolKind::Variable;
}

// ============================================================
// 构造 / 析构
// ============================================================

symbol_ns::SymbolService::SymbolService() = default;

symbol_ns::SymbolService::~SymbolService() {
    clearIndex();
}

// ============================================================
// Parser 注入
// ============================================================

void symbol_ns::SymbolService::setParser(TSParser* parser, const TSLanguage* language) {
    parser_ = parser;
    language_ = language;
}

// ============================================================
// 符号提取
// ============================================================

bool symbol_ns::SymbolService::isDefinitionNode(const std::string& node_type) const {
    const auto& types = getDefinitionNodeTypes();
    return std::find(types.begin(), types.end(), node_type) != types.end();
}

TSNode symbol_ns::SymbolService::getNameNode(TSNode node) const {
    // 对于函数定义，取 declarator → function_declarator → declarator → identifier
    const char* node_type = ts_node_type(node);
    std::string type(node_type);

    // function_definition → declarator → function_declarator → declarator → identifier
    if (type == "function_definition") {
        TSNode declarator = ts_node_child_by_field_name(node, "declarator", 10);
        if (!ts_node_is_null(declarator)) {
            // function_declarator
            const char* d_type = ts_node_type(declarator);
            std::string d_type_str(d_type);
            if (d_type_str == "function_declarator") {
                TSNode inner = ts_node_child_by_field_name(declarator, "declarator", 10);
                if (!ts_node_is_null(inner)) {
                    return inner;
                }
            }
            return declarator;
        }
    }

    // class_specifier / struct_specifier → name
    if (type == "class_specifier" || type == "struct_specifier" || type == "enum_specifier") {
        TSNode name_node = ts_node_child_by_field_name(node, "name", 4);
        if (!ts_node_is_null(name_node)) {
            return name_node;
        }
    }

    // namespace_definition → name
    if (type == "namespace_definition") {
        TSNode name_node = ts_node_child_by_field_name(node, "name", 4);
        if (!ts_node_is_null(name_node)) {
            return name_node;
        }
    }

    // declaration: 取 declarator 中的标识符
    if (type == "declaration") {
        TSNode declarator = ts_node_child_by_field_name(node, "declarator", 10);
        if (!ts_node_is_null(declarator)) {
            const char* d_type = ts_node_type(declarator);
            std::string d_type_str(d_type);
            // 如果是 init_declarator，取其 declarator
            if (d_type_str == "init_declarator") {
                declarator = ts_node_child_by_field_name(declarator, "declarator", 10);
            }
            if (!ts_node_is_null(declarator)) {
                return declarator;
            }
        }
    }

    // type_definition → type → type_identifier
    if (type == "type_definition") {
        TSNode type_node = ts_node_child_by_field_name(node, "type", 4);
        if (!ts_node_is_null(type_node)) {
            return type_node;
        }
    }

    // preproc_function_def → name
    if (type == "preproc_function_def") {
        TSNode name_node = ts_node_child_by_field_name(node, "name", 4);
        if (!ts_node_is_null(name_node)) {
            return name_node;
        }
    }

    // preproc_def → name
    if (type == "preproc_def") {
        for (uint32_t i = 0; i < ts_node_child_count(node); i++) {
            TSNode child = ts_node_child(node, i);
            const char* c_type = ts_node_type(child);
            std::string c_type_str(c_type);
            if (c_type_str == "identifier") {
                return child;
            }
        }
    }

    return node;  // 默认返回自身
}

std::string symbol_ns::SymbolService::getQualifiedName(TSNode node, const std::string& source) const {
    // 向上遍历语法树，收集命名空间和类名前缀
    std::vector<std::string> scope_parts;
    TSNode current = node;

    // 向上查找至根节点
    while (!ts_node_is_null(current)) {
        const char* type = ts_node_type(current);
        std::string type_str(type);

        if (type_str == "namespace_definition") {
            TSNode name_node = ts_node_child_by_field_name(current, "name", 4);
            if (!ts_node_is_null(name_node)) {
                uint32_t start = ts_node_start_byte(name_node);
                uint32_t end = ts_node_end_byte(name_node);
                scope_parts.push_back(source.substr(start, end - start));
            }
        } else if (type_str == "class_specifier") {
            TSNode name_node = ts_node_child_by_field_name(current, "name", 4);
            if (!ts_node_is_null(name_node)) {
                uint32_t start = ts_node_start_byte(name_node);
                uint32_t end = ts_node_end_byte(name_node);
                scope_parts.push_back(source.substr(start, end - start));
            }
        } else if (type_str == "struct_specifier") {
            TSNode name_node = ts_node_child_by_field_name(current, "name", 4);
            if (!ts_node_is_null(name_node)) {
                uint32_t start = ts_node_start_byte(name_node);
                uint32_t end = ts_node_end_byte(name_node);
                scope_parts.push_back(source.substr(start, end - start));
            }
        }

        current = ts_node_parent(current);
    }

    // 反转：从外层到内层
    std::reverse(scope_parts.begin(), scope_parts.end());

    // 获取当前节点名称
    TSNode name_node = getNameNode(node);
    std::string node_name;
    if (!ts_node_is_null(name_node)) {
        uint32_t start = ts_node_start_byte(name_node);
        uint32_t end = ts_node_end_byte(name_node);
        node_name = source.substr(start, end - start);
    }

    // 组合限定名
    if (scope_parts.empty()) {
        return node_name;
    }

    std::string result;
    for (const auto& part : scope_parts) {
        result += part + SCOPE_SEPARATOR;
    }
    result += node_name;
    return result;
}

std::optional<Symbol> symbol_ns::SymbolService::extractSymbolFromNode(
    TSNode node,
    const std::string& source,
    const std::string& filepath) const {

    const char* node_type = ts_node_type(node);
    std::string type(node_type);

    TSNode name_node = getNameNode(node);

    // 获取符号名称
    std::string name;
    if (!ts_node_is_null(name_node)) {
        uint32_t start = ts_node_start_byte(name_node);
        uint32_t end = ts_node_end_byte(name_node);
        name = source.substr(start, end - start);
    }

    if (name.empty()) {
        return std::nullopt;
    }

    // 确定符号类型
    SymbolKind kind;
    if (type == "function_definition") {
        // 检查是否在 class/struct 内（方法）
        TSNode parent = ts_node_parent(node);
        bool in_class = false;
        while (!ts_node_is_null(parent)) {
            std::string ptype(ts_node_type(parent));
            if (ptype == "class_specifier" || ptype == "struct_specifier") {
                in_class = true;
                break;
            }
            parent = ts_node_parent(parent);
        }

        // 检查是否是构造函数或析构函数
        std::string name_str = name;
        if (name_str.find('~') != std::string::npos) {
            kind = SymbolKind::Destructor;
        } else if (in_class) {
            // 检查是否和类名相同
            TSNode class_node = ts_node_parent(node);
            while (!ts_node_is_null(class_node)) {
                std::string ct(ts_node_type(class_node));
                if (ct == "class_specifier" || ct == "struct_specifier") {
                    TSNode class_name = ts_node_child_by_field_name(class_node, "name", 4);
                    if (!ts_node_is_null(class_name)) {
                        uint32_t cs = ts_node_start_byte(class_name);
                        uint32_t ce = ts_node_end_byte(class_name);
                        std::string class_name_str = source.substr(cs, ce - cs);
                        if (name_str == class_name_str) {
                            kind = SymbolKind::Constructor;
                        } else {
                            kind = SymbolKind::Method;
                        }
                        break;
                    }
                }
                class_node = ts_node_parent(class_node);
            }
            if (ts_node_is_null(class_node)) {
                kind = SymbolKind::Method;
            }
        } else {
            kind = SymbolKind::Function;
        }
    } else if (type == "class_specifier") {
        kind = SymbolKind::Class;
    } else if (type == "struct_specifier") {
        kind = SymbolKind::Struct;
    } else if (type == "enum_specifier") {
        kind = SymbolKind::Enum;
    } else if (type == "namespace_definition") {
        kind = SymbolKind::Namespace;
    } else if (type == "type_definition") {
        kind = SymbolKind::TypeAlias;
    } else if (type == "preproc_function_def" || type == "preproc_def") {
        kind = SymbolKind::Macro;
    } else if (type == "declaration") {
        // 检查是否在 class/struct 内（字段）
        TSNode parent = ts_node_parent(node);
        bool in_class = false;
        while (!ts_node_is_null(parent)) {
            std::string ptype(ts_node_type(parent));
            if (ptype == "class_specifier" || ptype == "struct_specifier") {
                in_class = true;
                break;
            }
            parent = ts_node_parent(parent);
        }
        kind = in_class ? SymbolKind::Field : SymbolKind::Variable;
    } else {
        kind = SymbolKind::Variable;
    }

    // 获取位置信息
    TSPoint start_point = ts_node_start_point(node);
    TSPoint end_point = ts_node_end_point(node);

    Symbol sym;
    sym.name = name;
    sym.kind = kind;
    sym.file_path = filepath;
    sym.start_line = start_point.row;
    sym.start_col = start_point.column;
    sym.end_line = end_point.row;
    sym.end_col = end_point.column;
    sym.qualified_name = getQualifiedName(node, source);

    return sym;
}

std::vector<Symbol> symbol_ns::SymbolService::extractSymbols(const std::string& filepath) {
    // 读取文件内容
    std::ifstream file(filepath);
    if (!file.is_open()) {
        std::cerr << "[SymbolService] Cannot open file: " << filepath << std::endl;
        return {};
    }
    std::stringstream buffer;
    buffer << file.rdbuf();
    std::string content = buffer.str();

    // 创建临时 Parser
    TSParser* parser = ts_parser_new();
    if (!language_) {
        const TSLanguage* lang = tree_sitter_cpp();
        ts_parser_set_language(parser, lang);
    } else {
        ts_parser_set_language(parser, language_);
    }

    // 解析文件
    TSTree* tree = ts_parser_parse_string(parser, nullptr, content.c_str(), content.length());
    if (!tree) {
        ts_parser_delete(parser);
        return {};
    }

    // 提取符号
    auto symbols = extractSymbolsFromTree(tree, content, filepath);

    // 清理
    ts_tree_delete(tree);
    ts_parser_delete(parser);

    return symbols;
}

std::vector<Symbol> symbol_ns::SymbolService::extractSymbolsFromTree(
    TSTree* tree,
    const std::string& source,
    const std::string& filepath) {

    std::vector<Symbol> symbols;
    TSNode root_node = ts_tree_root_node(tree);

    // 使用 Tree-sitter cursor 递归遍历语法树
    std::function<void(TSNode)> traverse;
    traverse = [&traverse, &symbols, &source, &filepath, this](TSNode node) {
        const char* type = ts_node_type(node);
        std::string type_str(type);

        // 如果是符号定义节点，提取符号信息
        if (isDefinitionNode(type_str)) {
            auto sym = extractSymbolFromNode(node, source, filepath);
            if (sym.has_value()) {
                symbols.push_back(sym.value());
            }

            // 对于 enum_specifier，额外提取 enum members
            if (type_str == "enum_specifier") {
                // 查找 enumerator_list 节点
                uint32_t child_count = ts_node_child_count(node);
                for (uint32_t i = 0; i < child_count; i++) {
                    TSNode child = ts_node_child(node, i);
                    const char* child_type = ts_node_type(child);
                    if (std::string(child_type) == "enumerator_list") {
                        uint32_t enum_child_count = ts_node_named_child_count(child);
                        for (uint32_t j = 0; j < enum_child_count; j++) {
                            TSNode enum_item = ts_node_named_child(child, j);
                            const char* ei_type = ts_node_type(enum_item);
                            if (std::string(ei_type) == "enumerator") {
                                TSPoint sp = ts_node_start_point(enum_item);
                                TSPoint ep = ts_node_end_point(enum_item);
                                TSNode ei_name = ts_node_child_by_field_name(enum_item, "name", 4);

                                std::string ei_name_str;
                                if (!ts_node_is_null(ei_name)) {
                                    uint32_t ns = ts_node_start_byte(ei_name);
                                    uint32_t ne = ts_node_end_byte(ei_name);
                                    ei_name_str = source.substr(ns, ne - ns);
                                }

                                if (!ei_name_str.empty()) {
                                    Symbol enum_member;
                                    enum_member.name = ei_name_str;
                                    enum_member.kind = SymbolKind::EnumMember;
                                    enum_member.file_path = filepath;
                                    enum_member.start_line = sp.row;
                                    enum_member.start_col = sp.column;
                                    enum_member.end_line = ep.row;
                                    enum_member.end_col = ep.column;
                                    enum_member.qualified_name = ei_name_str;
                                    symbols.push_back(enum_member);
                                }
                            }
                        }
                        break;
                    }
                }
            }
        }

        // 递归遍历子节点
        uint32_t child_count = ts_node_child_count(node);
        for (uint32_t i = 0; i < child_count; i++) {
            traverse(ts_node_child(node, i));
        }
    };

    traverse(root_node);

    return symbols;
}

// ============================================================
// 定义查找
// ============================================================

bool symbol_ns::SymbolService::isReferenceNode(TSNode node) const {
    // 引用节点：不是定义位置的标识符/类型引用
    const char* type = ts_node_type(node);
    std::string type_str(type);

    // 如果父节点是定义节点，则当前节点不是引用
    TSNode parent = ts_node_parent(node);
    while (!ts_node_is_null(parent)) {
        const char* p_type = ts_node_type(parent);
        std::string p_type_str(p_type);
        if (isDefinitionNode(p_type_str)) {
            // 检查当前节点是否是定义节点的 name child
            TSNode name_node = getNameNode(parent);
            if (ts_node_eq(node, name_node)) {
                return false;  // 定义位置
            }
            break;
        }
        parent = ts_node_parent(parent);
    }

    return true;
}

std::optional<std::string> symbol_ns::SymbolService::getSymbolNameAtPosition(
    TSTree* tree,
    const std::string& source,
    uint32_t line,
    uint32_t col) const {

    TSNode root = ts_tree_root_node(tree);
    TSPoint point = {line, col};
    TSNode node = ts_node_named_descendant_for_point_range(root, point, point);

    // 如果点击的不是标识符，尝试取最近的标识符
    while (!ts_node_is_null(node)) {
        const char* type = ts_node_type(node);
        std::string type_str(type);
        if (type_str == "identifier" || type_str == "type_identifier" ||
            type_str == "field_identifier" || type_str == "namespace_identifier") {
            uint32_t start = ts_node_start_byte(node);
            uint32_t end = ts_node_end_byte(node);
            return source.substr(start, end - start);
        }
        // 如果当前节点太大了（比如整个函数体），取第一个子标识符
        if (ts_node_child_count(node) > 0) {
            node = ts_node_named_child(node, 0);
        } else {
            break;
        }
    }

    return std::nullopt;
}

DefinitionResult symbol_ns::SymbolService::findDefinition(
    const std::string& filepath,
    uint32_t line,
    uint32_t col) {

    std::lock_guard<std::mutex> lock(mutex_);

    // 1. 获取光标位置的符号名称
    std::string content;
    {
        auto it = file_cache_.find(filepath);
        if (it != file_cache_.end()) {
            content = it->second.content;
        } else {
            std::ifstream file(filepath);
            if (!file.is_open()) {
                DefinitionResult result;
                return result;
            }
            std::stringstream buffer;
            buffer << file.rdbuf();
            content = buffer.str();
        }
    }

    // 创建临时 Parser 解析当前文件
    TSParser* parser = ts_parser_new();
    if (language_) {
        ts_parser_set_language(parser, language_);
    } else {
        ts_parser_set_language(parser, tree_sitter_cpp());
    }

    TSTree* tree = ts_parser_parse_string(parser, nullptr, content.c_str(), content.length());
    ts_parser_delete(parser);

    if (!tree) {
        DefinitionResult result;
        return result;
    }

    auto name_opt = getSymbolNameAtPosition(tree, content, line, col);
    ts_tree_delete(tree);

    if (!name_opt.has_value()) {
        DefinitionResult result;
        return result;
    }

    std::string symbol_name = name_opt.value();

    // 2. 在符号表中查找定义
    auto it = symbol_table_.find(symbol_name);
    if (it == symbol_table_.end() || it->second.empty()) {
        DefinitionResult result;
        return result;
    }

    const auto& entries = it->second;

    // 检查是否有多定义（函数重载）
    std::vector<Symbol> definitions;
    for (const auto& entry : entries) {
        // 只返回定义类型的符号（函数、类、结构体、变量等，排除引用）
        if (entry.symbol.kind == SymbolKind::Function ||
            entry.symbol.kind == SymbolKind::Method ||
            entry.symbol.kind == SymbolKind::Constructor ||
            entry.symbol.kind == SymbolKind::Destructor ||
            entry.symbol.kind == SymbolKind::Class ||
            entry.symbol.kind == SymbolKind::Struct ||
            entry.symbol.kind == SymbolKind::Enum ||
            entry.symbol.kind == SymbolKind::Variable ||
            entry.symbol.kind == SymbolKind::Field ||
            entry.symbol.kind == SymbolKind::TypeAlias ||
            entry.symbol.kind == SymbolKind::Namespace ||
            entry.symbol.kind == SymbolKind::Macro ||
            entry.symbol.kind == SymbolKind::EnumMember) {
            definitions.push_back(entry.symbol);
        }
    }

    if (definitions.empty()) {
        DefinitionResult result;
        return result;
    }

    // 如果只有一个定义，直接返回
    if (definitions.size() == 1) {
        DefinitionResult result;
        result.symbol = definitions[0];
        return result;
    }

    // 多定义：优先匹配限定名
    // 获取当前光标处的限定名
    // （简化：直接返回候选列表）
    DefinitionResult result;
    result.candidates = definitions;

    // 尝试精确匹配：如果符号在类/命名空间内，优先匹配同名限定名的定义
    // 简化逻辑：如果有同文件的匹配，优先选择
    for (const auto& def : definitions) {
        if (def.file_path == filepath) {
            result.symbol = def;
            result.candidates.clear();
            return result;
        }
    }

    return result;
}

// ============================================================
// 引用查找
// ============================================================

std::vector<ReferenceLocation> symbol_ns::SymbolService::findReferences(
    const std::string& symbol_name) {

    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<ReferenceLocation> references;

    if (symbol_name.empty() || file_cache_.empty()) {
        return references;
    }

    // 遍历所有已缓存的文件，查找引用
    for (auto& [filepath, cache_entry] : file_cache_) {
        const std::string& source = cache_entry.content;
        TSTree* tree = cache_entry.tree.get();
        if (!tree) continue;

        TSNode root = ts_tree_root_node(tree);

        // 递归遍历查找同名标识符
        std::function<void(TSNode)> findRefs;
        findRefs = [&findRefs, &references, &symbol_name, &source, &filepath, this](TSNode node) {
            const char* type = ts_node_type(node);
            std::string type_str(type);

            if (type_str == "identifier" || type_str == "type_identifier" ||
                type_str == "field_identifier" || type_str == "namespace_identifier") {
                // 提取节点文本
                uint32_t start_byte = ts_node_start_byte(node);
                uint32_t end_byte = ts_node_end_byte(node);
                std::string text = source.substr(start_byte, end_byte - start_byte);

                if (text == symbol_name) {
                    // 获取行内容
                    TSPoint start_point = ts_node_start_point(node);
                    uint32_t line_num = start_point.row;
                    std::string context_line;

                    // 从源代码中提取所在行
                    size_t line_start = 0;
                    size_t line_end = source.length();
                    uint32_t current_line = 0;
                    for (size_t i = 0; i < source.length(); i++) {
                        if (source[i] == '\n') {
                            if (current_line == line_num) {
                                line_end = i;
                                break;
                            }
                            line_start = i + 1;
                            current_line++;
                        }
                    }
                    context_line = source.substr(line_start, line_end - line_start);
                    // 去掉行尾换行
                    if (!context_line.empty() && context_line.back() == '\n') {
                        context_line.pop_back();
                    }
                    if (!context_line.empty() && context_line.back() == '\r') {
                        context_line.pop_back();
                    }

                    TSPoint end_point = ts_node_end_point(node);

                    ReferenceLocation ref;
                    ref.file_path = filepath;
                    ref.start_line = start_point.row;
                    ref.start_col = start_point.column;
                    ref.end_line = end_point.row;
                    ref.end_col = end_point.column;
                    ref.context_line = context_line;
                    ref.is_definition = !isReferenceNode(node);

                    references.push_back(ref);
                }
            }

            // 递归遍历子节点
            uint32_t child_count = ts_node_named_child_count(node);
            for (uint32_t i = 0; i < child_count; i++) {
                findRefs(ts_node_named_child(node, i));
            }
        };

        findRefs(root);
    }

    return references;
}

// ============================================================
// 重载消解
// ============================================================

std::optional<Symbol> symbol_ns::SymbolService::resolveOverloads(
    const std::string& symbol_name,
    const std::vector<std::string>& param_types) {

    std::lock_guard<std::mutex> lock(mutex_);

    auto it = symbol_table_.find(symbol_name);
    if (it == symbol_table_.end()) {
        return std::nullopt;
    }

    // 简化实现：返回第一个匹配的函数
    // 完整实现需要解析函数签名中的参数类型并与 param_types 匹配
    for (const auto& entry : it->second) {
        if (entry.symbol.kind == SymbolKind::Function ||
            entry.symbol.kind == SymbolKind::Method ||
            entry.symbol.kind == SymbolKind::Constructor) {
            // 当前简化版本不解析参数类型，直接返回第一个
            if (param_types.empty()) {
                return entry.symbol;
            }
        }
    }

    return std::nullopt;
}

// ============================================================
// 项目索引
// ============================================================

std::vector<fs::path> symbol_ns::SymbolService::scanSourceFiles(
    const std::string& project_path) const {

    std::vector<fs::path> files;
    const auto& extensions = getSourceExtensions();

    try {
        for (const auto& entry : fs::recursive_directory_iterator(project_path)) {
            if (entry.is_regular_file()) {
                std::string ext = entry.path().extension().string();
                // 转为小写比较
                std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
                if (std::find(extensions.begin(), extensions.end(), ext) != extensions.end()) {
                    files.push_back(entry.path());
                }
            }
        }
    } catch (const fs::filesystem_error& e) {
        std::cerr << "[SymbolService] Error scanning project: " << e.what() << std::endl;
    }

    return files;
}

size_t symbol_ns::SymbolService::indexProject(const std::string& project_path) {
    std::lock_guard<std::mutex> lock(mutex_);

    // 清除旧索引
    clearIndex();

    // 扫描源文件
    auto source_files = scanSourceFiles(project_path);
    if (source_files.empty()) {
        std::cerr << "[SymbolService] No source files found in: " << project_path << std::endl;
        return 0;
    }

    // 创建 Parser（如果未设置）
    TSParser* parser = parser_ ? parser_ : ts_parser_new();
    bool own_parser = (parser_ == nullptr);
    if (own_parser) {
        ts_parser_set_language(parser, language_ ? language_ : tree_sitter_cpp());
    }

    size_t indexed_count = 0;

    for (const auto& filepath : source_files) {
        std::string path_str = filepath.string();

        // 读取文件
        std::ifstream file(path_str);
        if (!file.is_open()) continue;
        std::stringstream buffer;
        buffer << file.rdbuf();
        std::string content = buffer.str();

        // 解析文件
        TSTree* tree = ts_parser_parse_string(parser, nullptr, content.c_str(), content.length());
        if (!tree) continue;

        // 缓存语法树和内容
        FileCacheEntry entry;
        entry.tree = std::unique_ptr<TSTree, void(*)(TSTree*)>(tree, ts_tree_delete);
        entry.content = content;
        file_cache_[path_str] = std::move(entry);

        // 提取符号并加入符号表
        auto symbols = extractSymbolsFromTree(tree, content, path_str);
        for (const auto& sym : symbols) {
            SymbolTableEntry table_entry;
            table_entry.symbol = sym;
            symbol_table_[sym.name].push_back(table_entry);
        }

        indexed_files_.insert(path_str);
        indexed_count++;
    }

    if (own_parser) {
        ts_parser_delete(parser);
    }

    std::cerr << "[SymbolService] Indexed " << indexed_count << " files, "
              << "found " << symbol_table_.size() << " unique symbols" << std::endl;

    return indexed_count;
}

void symbol_ns::SymbolService::clearIndex() {
    symbol_table_.clear();
    file_cache_.clear();
    indexed_files_.clear();
}

size_t symbol_ns::SymbolService::getSymbolCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return symbol_table_.size();
}

std::vector<std::string> symbol_ns::SymbolService::getIndexedFiles() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return std::vector<std::string>(indexed_files_.begin(), indexed_files_.end());
}

std::vector<Symbol> symbol_ns::SymbolService::searchSymbols(const std::string& query, int limit) const {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<Symbol> results;

    if (query.size() < 2 || symbol_table_.empty()) {
        return results;
    }

    // 转小写用于大小写不敏感匹配
    std::string query_lower = query;
    std::transform(query_lower.begin(), query_lower.end(), query_lower.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

    // 辅助函数：大小写不敏感的子串匹配
    auto containsLower = [](const std::string& haystack, const std::string& needle) -> bool {
        auto it = std::search(
            haystack.begin(), haystack.end(),
            needle.begin(), needle.end(),
            [](unsigned char a, unsigned char b) {
                return std::tolower(a) == std::tolower(b);
            });
        return it != haystack.end();
    };

    // 策略1：前缀匹配（最高优先级）
    for (const auto& [name, entries] : symbol_table_) {
        if (static_cast<int>(results.size()) >= limit) break;

        std::string name_lower = name;
        std::transform(name_lower.begin(), name_lower.end(), name_lower.begin(),
                       [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

        if (name_lower.compare(0, query_lower.size(), query_lower) == 0) {
            for (const auto& entry : entries) {
                if (static_cast<int>(results.size()) >= limit) break;
                results.push_back(entry.symbol);
            }
        }
    }

    // 策略2：子串匹配（补充，避免重复）
    if (static_cast<int>(results.size()) < limit) {
        // 构建已收集符号的指纹集合用于去重
        std::unordered_set<std::string> seen;
        for (const auto& sym : results) {
            seen.insert(sym.name + "|" + sym.file_path + "|" + std::to_string(sym.start_line));
        }

        for (const auto& [name, entries] : symbol_table_) {
            if (static_cast<int>(results.size()) >= limit) break;

            // 跳过前缀匹配已命中的（避免重复）
            std::string name_lower = name;
            std::transform(name_lower.begin(), name_lower.end(), name_lower.begin(),
                           [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
            if (name_lower.compare(0, query_lower.size(), query_lower) == 0) continue;

            if (containsLower(name, query_lower)) {
                for (const auto& entry : entries) {
                    if (static_cast<int>(results.size()) >= limit) break;
                    std::string fingerprint = entry.symbol.name + "|" + entry.symbol.file_path + "|"
                                             + std::to_string(entry.symbol.start_line);
                    if (seen.insert(fingerprint).second) {
                        results.push_back(entry.symbol);
                    }
                }
            }
        }
    }

    // 按名称长度排序（短名优先，更精确的匹配排前面）
    std::sort(results.begin(), results.end(),
              [](const Symbol& a, const Symbol& b) {
                  return a.name.size() < b.name.size();
              });

    return results;
}

TSTree* symbol_ns::SymbolService::getOrCreateTree(const std::string& filepath,
                                                     const std::string& content) {
    auto it = file_cache_.find(filepath);
    if (it != file_cache_.end()) {
        return it->second.tree.get();
    }

    // 创建新语法树
    TSParser* parser = parser_ ? parser_ : ts_parser_new();
    bool own_parser = (parser_ == nullptr);
    if (own_parser) {
        ts_parser_set_language(parser, language_ ? language_ : tree_sitter_cpp());
    }

    TSTree* tree = ts_parser_parse_string(parser, nullptr, content.c_str(), content.length());

    if (own_parser) {
        ts_parser_delete(parser);
    }

    if (!tree) return nullptr;

    FileCacheEntry entry;
    entry.tree = std::unique_ptr<TSTree, void(*)(TSTree*)>(tree, ts_tree_delete);
    entry.content = content;
    file_cache_[filepath] = std::move(entry);

    return tree;
}
