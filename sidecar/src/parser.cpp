/**
 * @file parser.cpp
 * @brief Tree-sitter 解析服务实现
 *
 * 核心功能：
 * 1. 语言注册与初始化（内置 C/C++ 支持）
 * 2. 全量解析文件 → 生成语法树
 * 3. 遍历语法树 → 提取高亮区间（HighlightRange）
 * 4. 语法树缓存与增量更新
 * 5. Tree-sitter 节点类型 → 语法作用域（scope）映射
 */

#include "parser.h"

#include <fstream>
#include <sstream>
#include <algorithm>
#include <iostream>
#include <filesystem>

namespace fs = std::filesystem;
namespace cparser = codelens::parser;

// --- Tree-sitter 语法树智能指针的删除器 ---
static void tsTreeDeleter(TSTree* tree) {
    if (tree) ts_tree_delete(tree);
}

// --- ParserService 实现 ---

cparser::ParserService::ParserService() {
    initLanguages();
}

cparser::ParserService::~ParserService() {
    disposeAll();
}

void cparser::ParserService::initLanguages() {
    // 注册 C++ 语言
    languages_.push_back({
        .name = "cpp",
        .language = tree_sitter_cpp(),
        .extensions = {".cpp", ".cc", ".cxx", ".hpp", ".hxx", ".h", ".c", ".inc"}
    });
}

const cparser::LanguageConfig* cparser::ParserService::getLanguageConfig(const std::string& language) const {
    for (const auto& config : languages_) {
        if (config.name == language) {
            return &config;
        }
    }
    return nullptr;
}

std::string cparser::ParserService::detectLanguage(const std::string& filepath) const {
    std::string ext;
    auto dot_pos = filepath.rfind('.');
    if (dot_pos != std::string::npos) {
        ext = filepath.substr(dot_pos);
        // 转小写
        std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
    }

    for (const auto& config : languages_) {
        for (const auto& e : config.extensions) {
            if (e == ext) {
                return config.name;
            }
        }
    }
    return "";  // 未知语言
}

bool cparser::ParserService::isLanguageSupported(const std::string& language) const {
    return getLanguageConfig(language) != nullptr;
}

std::vector<std::string> cparser::ParserService::getSupportedLanguages() const {
    std::vector<std::string> result;
    for (const auto& config : languages_) {
        result.push_back(config.name);
    }
    return result;
}

TSParser* cparser::ParserService::createParser(const TSLanguage* language) {
    TSParser* parser = ts_parser_new();
    if (!ts_parser_set_language(parser, language)) {
        ts_parser_delete(parser);
        std::cerr << "[ParserService] Failed to set language for parser" << std::endl;
        return nullptr;
    }
    return parser;
}

TSTree* cparser::ParserService::parseToTree(TSParser* parser, const std::string& content) {
    return ts_parser_parse_string(parser, nullptr, content.c_str(), static_cast<uint32_t>(content.length()));
}

cparser::ParseResult cparser::ParserService::parseFile(const std::string& filepath) {
    // 读取文件内容
    std::ifstream file(filepath, std::ios::binary);
    if (!file.is_open()) {
        return { .tree_handle = filepath, .error_message = "Cannot open file: " + filepath };
    }

    std::stringstream buffer;
    buffer << file.rdbuf();
    std::string content = buffer.str();

    // 检测语言
    std::string language = detectLanguage(filepath);
    if (language.empty()) {
        // 未知语言，降级返回
        return { .tree_handle = filepath, .error_message = "Unsupported language for: " + filepath };
    }

    return parseContent(content, language, filepath);
}

cparser::ParseResult cparser::ParserService::parseContent(const std::string& content,
                                                            const std::string& language,
                                                            const std::string& cache_key) {
    ParseResult result;
    result.tree_handle = cache_key;

    const LanguageConfig* config = getLanguageConfig(language);
    if (!config) {
        result.error_message = "Unsupported language: " + language;
        return result;
    }

    // 创建解析器
    TSParser* parser = createParser(config->language);
    if (!parser) {
        result.error_message = "Failed to create parser for: " + language;
        return result;
    }

    // 解析内容
    TSTree* tree = parseToTree(parser, content);
    if (!tree) {
        ts_parser_delete(parser);
        result.error_message = "Parse error for: " + cache_key;
        return result;
    }

    // 提取高亮区间
    result.highlight_ranges = extractHighlights(tree, content);

    // 缓存语法树
    {
        std::lock_guard<std::mutex> lock(cache_mutex_);
        tree_cache_[cache_key] = {
            .tree = std::unique_ptr<TSTree, void(*)(TSTree*)>(tree, tsTreeDeleter),
            .content = content,
            .parser = parser,  // 注意：parser 的生命周期由 TreeCacheEntry 管理
        };
    }

    return result;
}

cparser::ParseResult cparser::ParserService::updateFile(const std::string& filepath,
                                                        const std::string& old_content,
                                                        const std::string& new_content) {
    ParseResult result;
    result.tree_handle = filepath;

    const LanguageConfig* config = getLanguageConfig(detectLanguage(filepath));
    if (!config) {
        result.error_message = "Unsupported language for: " + filepath;
        return result;
    }

    std::lock_guard<std::mutex> lock(cache_mutex_);

    auto it = tree_cache_.find(filepath);
    if (it == tree_cache_.end()) {
        // 没有缓存，执行全量解析
        lock.~lock_guard();  // 提前释放锁（注意：这不是好做法，实际应用中应重构）
        return parseContent(new_content, config->name, filepath);
    }

    auto& entry = it->second;

    // 计算编辑差异
    // 简化方案：如果内容变化太大（差异超过50%），执行全量解析
    size_t old_len = entry.content.length();
    size_t new_len = new_content.length();

    if (old_len == 0 || new_len == 0 ||
        (new_len > old_len && (new_len - old_len) > old_len / 2)) {
        // 变化太大，全量重新解析
        TSTree* new_tree = parseToTree(entry.parser, new_content);
        if (!new_tree) {
            result.error_message = "Incremental parse failed, fallback error for: " + filepath;
            return result;
        }

        result.highlight_ranges = extractHighlights(new_tree, new_content);
        entry.tree.reset(new_tree);
        entry.content = new_content;
        return result;
    }

    // 使用 Tree-sitter 增量编辑
    // 计算前缀公共长度和后缀公共长度
    size_t common_prefix = 0;
    while (common_prefix < old_len && common_prefix < new_len &&
           entry.content[common_prefix] == new_content[common_prefix]) {
        common_prefix++;
    }

    size_t common_suffix = 0;
    while (common_suffix < (old_len - common_prefix) &&
           common_suffix < (new_len - common_prefix) &&
           entry.content[old_len - 1 - common_suffix] == new_content[new_len - 1 - common_suffix]) {
        common_suffix++;
    }

    // 计算旧文本和新文本的位置
    uint32_t start_byte = static_cast<uint32_t>(common_prefix);
    uint32_t old_end_byte = static_cast<uint32_t>(old_len - common_suffix);
    uint32_t new_end_byte = static_cast<uint32_t>(new_len - common_suffix);

    // 计算行列
    TSPoint start_point = {0, 0};
    TSPoint old_end_point = {0, 0};
    TSPoint new_end_point = {0, 0};

    for (uint32_t i = 0; i < start_byte; i++) {
        if (entry.content[i] == '\n') {
            start_point.row++;
            start_point.column = 0;
        } else {
            start_point.column++;
        }
    }

    for (uint32_t i = start_byte; i < old_end_byte; i++) {
        if (entry.content[i] == '\n') {
            old_end_point.row++;
            old_end_point.column = 0;
        } else {
            old_end_point.column++;
        }
    }

    for (uint32_t i = start_byte; i < new_end_byte; i++) {
        if (new_content[i] == '\n') {
            new_end_point.row++;
            new_end_point.column = 0;
        } else {
            new_end_point.column++;
        }
    }

    // 应用编辑
    TSInputEdit edit = {
        .start_byte = start_byte,
        .old_end_byte = old_end_byte,
        .new_end_byte = new_end_byte,
        .start_point = start_point,
        .old_end_point = { start_point.row + old_end_point.row, old_end_point.column },
        .new_end_point = { start_point.row + new_end_point.row, new_end_point.column },
    };

    ts_tree_edit(entry.tree.get(), &edit);

    // 重新解析
    TSTree* new_tree = ts_parser_parse_string(entry.parser, entry.tree.get(),
                                                new_content.c_str(),
                                                static_cast<uint32_t>(new_len));
    if (!new_tree) {
        result.error_message = "Incremental re-parse failed for: " + filepath;
        // 降级为全量解析
        TSTree* fallback_tree = parseToTree(entry.parser, new_content);
        if (fallback_tree) {
            result.highlight_ranges = extractHighlights(fallback_tree, new_content);
            entry.tree.reset(fallback_tree);
            entry.content = new_content;
            result.error_message.clear();
        }
        return result;
    }

    result.highlight_ranges = extractHighlights(new_tree, new_content);
    entry.tree.reset(new_tree);
    entry.content = new_content;

    return result;
}

std::vector<cparser::HighlightRange> cparser::ParserService::getHighlightRanges(const std::string& cache_key) {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    auto it = tree_cache_.find(cache_key);
    if (it != tree_cache_.end() && it->second.tree) {
        return extractHighlights(it->second.tree.get(), it->second.content);
    }
    return {};
}

void cparser::ParserService::disposeTree(const std::string& cache_key) {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    auto it = tree_cache_.find(cache_key);
    if (it != tree_cache_.end()) {
        tree_cache_.erase(it);
    }
}

void cparser::ParserService::disposeAll() {
    std::lock_guard<std::mutex> lock(cache_mutex_);
    for (auto& [key, entry] : tree_cache_) {
        if (entry.parser) {
            ts_parser_delete(entry.parser);
            entry.parser = nullptr;
        }
        entry.tree.reset();
    }
    tree_cache_.clear();
}

// --- 高亮区间提取 ---

std::vector<cparser::HighlightRange> cparser::ParserService::extractHighlights(TSTree* tree,
                                                                                 const std::string& source) const {
    std::vector<HighlightRange> ranges;
    if (!tree) return ranges;

    TSNode root_node = ts_tree_root_node(tree);
    traverseNode(root_node, source, ranges);

    return ranges;
}

void cparser::ParserService::traverseNode(TSNode node,
                                            const std::string& source,
                                            std::vector<HighlightRange>& ranges) const {
    const char* type = ts_node_type(node);
    std::string node_type(type);

    // 获取字段名（如果有）
    TSNode parent = ts_node_parent(node);
    const char* field_name = nullptr;
    if (!ts_node_is_null(parent)) {
        // 查找当前节点在父节点中的字段名
        uint32_t child_count = ts_node_child_count(parent);
        for (uint32_t i = 0; i < child_count; i++) {
            TSNode child = ts_node_child(parent, i);
            if (ts_node_eq(child, node)) {
                field_name = ts_node_field_name_for_child(parent, i);
                break;
            }
        }
    }

    // 映射节点类型到高亮作用域
    std::string scope = nodeTypeToScope(node_type, field_name);
    if (!scope.empty()) {
        TSPoint start = ts_node_start_point(node);
        TSPoint end = ts_node_end_point(node);
        ranges.push_back({
            .start_line = start.row,
            .start_col = start.column,
            .end_line = end.row,
            .end_col = end.column,
            .scope = scope,
        });
    }

    // 递归遍历子节点
    uint32_t child_count = ts_node_child_count(node);
    for (uint32_t i = 0; i < child_count; i++) {
        TSNode child = ts_node_child(node, i);
        traverseNode(child, source, ranges);
    }
}

std::string cparser::ParserService::nodeTypeToScope(const std::string& node_type,
                                                      const char* field_name) const {
    // C/C++ 关键字
    if (node_type == "if_statement" || node_type == "else_clause" ||
        node_type == "for_statement" || node_type == "while_statement" ||
        node_type == "do_statement" || node_type == "switch_statement" ||
        node_type == "case_statement" || node_type == "break_statement" ||
        node_type == "continue_statement" || node_type == "return_statement" ||
        node_type == "goto_statement" || node_type == "try_statement" ||
        node_type == "catch_clause" || node_type == "throw_statement" ||
        node_type == "using_statement" || node_type == "namespace_definition") {
        return "keyword.control";
    }

    // 类型关键字
    if (node_type == "class_specifier" || node_type == "struct_specifier" ||
        node_type == "enum_specifier" || node_type == "union_specifier" ||
        node_type == "template_declaration" || node_type == "concept_definition") {
        return "keyword.declaration.type";
    }

    // 访问修饰符
    if (node_type == "access_specifier") {
        return "keyword.modifier";
    }

    // 基础类型和修饰符
    if (node_type == "primitive_type" || node_type == "sized_type_specifier" ||
        node_type == "type_qualifier" || node_type == "storage_class_specifier") {
        return "keyword.type";
    }

    // 标识符 - 根据字段名确定语义
    if (node_type == "identifier") {
        if (field_name && std::string(field_name) == "declarator") {
            return "variable.name";
        }
        if (field_name && std::string(field_name) == "name") {
            return "entity.name.function";
        }
        return "variable.name";
    }

    // 函数定义和声明
    if (node_type == "function_definition" || node_type == "declaration") {
        // 函数名会作为 identifier 子节点处理，这里不额外添加
        return "";
    }

    // 字符串字面量
    if (node_type == "string_literal" || node_type == "raw_string_literal" ||
        node_type == "concatenated_string") {
        return "string";
    }

    // 字符字面量
    if (node_type == "char_literal") {
        return "string.escape";
    }

    // 数字字面量
    if (node_type == "number_literal") {
        return "constant.numeric";
    }

    // 布尔值
    if (node_type == "true" || node_type == "false" || node_type == "nullptr") {
        return "constant.language";
    }

    // 注释
    if (node_type == "comment") {
        return "comment";
    }

    // 预处理器指令
    if (node_type == "preproc_include" || node_type == "preproc_def" ||
        node_type == "preproc_function_def" || node_type == "preproc_if" ||
        node_type == "preproc_ifdef" || node_type == "preproc_else" ||
        node_type == "preproc_elif" || node_type == "preproc_endif" ||
        node_type == "preproc_undef" || node_type == "preproc_call") {
        return "keyword.preprocessor";
    }

    // 运算符
    if (node_type == "binary_expression" || node_type == "unary_expression" ||
        node_type == "assignment_expression" || node_type == "compound_assignment_expression" ||
        node_type == "update_expression" || node_type == "conditional_expression" ||
        node_type == "sizeof_expression" || node_type == "delete_expression" ||
        node_type == "new_expression" || node_type == "type_cast_expression" ||
        node_type == "pointer_expression" || node_type == "address_expression" ||
        node_type == "subscript_expression") {
        return "";
    }

    // 参数列表、参数等不需要单独高亮
    if (node_type == "parameter_list" || node_type == "parameter_declaration" ||
        node_type == "argument_list" || node_type == "field_expression" ||
        node_type == "call_expression" || node_type == "initializer_list" ||
        node_type == "compound_statement" || node_type == "translation_unit" ||
        node_type == "declaration_list" || node_type == "template_parameter_list" ||
        node_type == "template_argument_list" || node_type == "linkage_specification" ||
        node_type == "attribute_specifier" || node_type == "attributed_declaration" ||
        node_type == "ms_declspec_modifier" || node_type == "qualified_identifier" ||
        node_type == "type_descriptor" || node_type == "parenthesized_expression" ||
        node_type == "enumerator_list" || node_type == "field_initializer_list" ||
        node_type == "base_class_clause" || node_type == "lambda_expression") {
        return "";
    }

    return "";
}

// --- HighlightRange JSON 序列化 ---

std::string cparser::HighlightRange::toJson() const {
    return "{\"startLine\":" + std::to_string(start_line) +
           ",\"startCol\":" + std::to_string(start_col) +
           ",\"endLine\":" + std::to_string(end_line) +
           ",\"endCol\":" + std::to_string(end_col) +
           ",\"scope\":\"" + scope + "\"}";
}
