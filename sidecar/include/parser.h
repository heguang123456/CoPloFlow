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
 */

#ifndef CODELENS_PARSER_H_
#define CODELENS_PARSER_H_

#include <string>
#include <vector>
#include <unordered_map>
#include <memory>
#include <mutex>

// Tree-sitter C API
extern "C" {
#include <tree_sitter/api.h>
}

// tree-sitter-cpp 解析器声明
extern "C" const TSLanguage* tree_sitter_cpp();

namespace codelens::parser {

/// 高亮区间
struct HighlightRange {
    uint32_t start_line;    // 起始行号（0-based）
    uint32_t start_col;     // 起始列号（0-based）
    uint32_t end_line;      // 结束行号（0-based）
    uint32_t end_col;       // 结束列号（0-based）
    std::string scope;      // 语法作用域（keyword, string, comment, function, type 等）

    /// 转换为 JSON 对象
    std::string toJson() const;
};

/// 解析结果
struct ParseResult {
    std::string tree_handle;                        // 语法树缓存键（文件路径）
    std::vector<HighlightRange> highlight_ranges;   // 高亮区间列表
    std::string error_message;                      // 错误信息（空表示成功）
    bool success() const { return error_message.empty(); }
};

/// 语言配置
struct LanguageConfig {
    std::string name;                               // 语言名称（如 "cpp"）
    const TSLanguage* language;                     // Tree-sitter 语言指针
    std::vector<std::string> extensions;            // 文件扩展名
};

/**
 * ParserService - 语法解析服务
 *
 * 核心功能：
 * - 根据 LanguageConfig 初始化 Tree-sitter Parser
 * - 全量解析文件内容生成语法树
 * - 遍历语法树提取高亮区间（HighlightRange）
 * - 缓存语法树支持增量更新
 */
class ParserService {
public:
    ParserService();
    ~ParserService();

    // 禁止拷贝
    ParserService(const ParserService&) = delete;
    ParserService& operator=(const ParserService&) = delete;

    /// 全量解析文件
    /// @param filepath 文件路径
    /// @return 解析结果（含高亮区间列表）
    ParseResult parseFile(const std::string& filepath);

    /// 解析文件内容（内存中的字符串）
    /// @param content 文件内容
    /// @param language 语言标识（如 "cpp"、"c"）
    /// @param cache_key 缓存键（通常为文件路径）
    /// @return 解析结果
    ParseResult parseContent(const std::string& content,
                             const std::string& language,
                             const std::string& cache_key);

    /// 增量更新文件
    /// @param filepath 文件路径
    /// @param old_content 旧内容
    /// @param new_content 新内容
    /// @return 增量解析结果
    ParseResult updateFile(const std::string& filepath,
                            const std::string& old_content,
                            const std::string& new_content);

    /// 获取缓存的高亮区间
    /// @param cache_key 缓存键（文件路径）
    /// @return 高亮区间列表
    std::vector<HighlightRange> getHighlightRanges(const std::string& cache_key);

    /// 释放指定语法树缓存
    /// @param cache_key 缓存键
    void disposeTree(const std::string& cache_key);

    /// 释放所有缓存的语法树
    void disposeAll();

    /// 检查是否支持某语言
    /// @param language 语言标识
    /// @return 是否支持
    bool isLanguageSupported(const std::string& language) const;

    /// 获取所有支持的语言列表
    std::vector<std::string> getSupportedLanguages() const;

private:
    /// 缓存的语法树条目
    struct TreeCacheEntry {
        std::unique_ptr<TSTree, void(*)(TSTree*)> tree{nullptr, [](TSTree*){}};
        std::string content;
        TSParser* parser = nullptr;
    };

    /// 初始化所有内置语言
    void initLanguages();

    /// 根据语言标识获取 LanguageConfig
    const LanguageConfig* getLanguageConfig(const std::string& language) const;

    /// 根据文件扩展名推断语言
    std::string detectLanguage(const std::string& filepath) const;

    /// 从语法树提取高亮区间
    std::vector<HighlightRange> extractHighlights(TSTree* tree,
                                                    const std::string& source) const;

    /// 递归遍历语法树节点，提取高亮区间
    void traverseNode(TSNode node,
                      const std::string& source,
                      std::vector<HighlightRange>& ranges) const;

    /// 将 Tree-sitter 节点类型映射为高亮作用域
    std::string nodeTypeToScope(const std::string& node_type,
                                 const char* node_field) const;

    /// 创建 TSParser 实例
    TSParser* createParser(const TSLanguage* language);

    /// 解析内容到语法树
    TSTree* parseToTree(TSParser* parser, const std::string& content);

    // 语言注册表
    std::vector<LanguageConfig> languages_;

    // 语法树缓存（文件路径 → 缓存条目）
    std::unordered_map<std::string, TreeCacheEntry> tree_cache_;

    // 线程安全
    std::mutex cache_mutex_;
};

}  // namespace codelens::parser

#endif  // CODELENS_PARSER_H_
