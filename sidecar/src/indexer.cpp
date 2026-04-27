/**
 * @file indexer.cpp
 * @brief 符号索引服务实现（占位）
 *
 * 当前阶段：基础框架代码，核心逻辑在阶段4实现
 */

#include "indexer.h"

namespace codelens::indexer {

void IndexService::buildIndex(const std::string& project_path) {
    // TODO: 阶段4 - 全量索引构建
}

void IndexService::buildIndexParallel(const std::string& project_path, int thread_count) {
    // TODO: 阶段4 - 多线程并行构建
}

SearchResult IndexService::searchSymbols(const std::string& query, int limit) {
    // TODO: 阶段4 - 模糊匹配搜索
    SearchResult result;
    result.total_count = 0;
    result.has_more = false;
    return result;
}

void IndexService::saveToDatabase(const std::string& db_path) {
    // TODO: 阶段4 - SQLite 持久化
}

bool IndexService::loadFromDatabase(const std::string& db_path) {
    // TODO: 阶段4 - 从数据库加载
    return false;
}

void IndexService::invalidateFile(const std::string& filepath) {
    // TODO: 阶段4 - 索引条目失效
}

}  // namespace codelens::indexer
