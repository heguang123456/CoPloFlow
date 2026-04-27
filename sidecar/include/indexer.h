/**
 * @file indexer.h
 * @brief 符号索引接口
 *
 * 职责：
 * - 管理项目级符号索引
 * - 支持持久化存储（SQLite）
 * - 支持快速模糊匹配搜索
 * - 支持多线程并行构建
 *
 * 接口设计：
 * - buildIndex:         全量构建项目符号索引
 * - buildIndexParallel: 多线程并行构建索引
 * - searchSymbols:      模糊匹配搜索符号
 * - saveToDatabase:     将索引持久化到 SQLite
 * - loadFromDatabase:   从 SQLite 加载已有索引
 * - invalidateFile:     文件变更时使该文件的索引条目失效
 *
 * 后续阶段启用，当前为占位声明
 */

#ifndef CODELENS_INDEXER_H_
#define CODELENS_INDEXER_H_

#include <string>
#include <vector>
#include "symbol.h"

namespace codelens::indexer {

/// 索引条目
struct IndexEntry {
    symbol::Symbol symbol;
    std::string updated_at;     // 更新时间戳
};

/// 搜索结果
struct SearchResult {
    std::vector<IndexEntry> entries;
    int total_count;
    bool has_more;
};

/**
 * IndexService - 符号索引服务
 *
 * 后续阶段实现：
 * - SQLite 持久化
 * - 多线程并行构建
 * - 增量更新机制
 * - 模糊匹配搜索
 */
class IndexService {
public:
    IndexService() = default;
    ~IndexService() = default;

    /// 全量构建项目符号索引
    void buildIndex(const std::string& project_path);

    /// 多线程并行构建索引
    void buildIndexParallel(const std::string& project_path, int thread_count);

    /// 模糊匹配搜索符号
    SearchResult searchSymbols(const std::string& query, int limit);

    /// 将索引持久化到 SQLite
    void saveToDatabase(const std::string& db_path);

    /// 从 SQLite 加载已有索引
    bool loadFromDatabase(const std::string& db_path);

    /// 使指定文件的索引条目失效
    void invalidateFile(const std::string& filepath);
};

}  // namespace codelens::indexer

#endif  // CODELENS_INDEXER_H_
