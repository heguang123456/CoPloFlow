/**
 * @file main.cpp
 * @brief CodeLens C++ Sidecar 入口
 *
 * 启动 JSON-RPC 2.0 消息循环，通过 stdin/stdout 与 Tauri 主进程通信。
 *
 * 已注册方法：
 * - initialize                     初始化握手
 * - shutdown                        关闭服务
 * - ping                            心跳检测
 * - parser/listLanguages            获取支持的语言列表
 * - parser/parse                    解析文件（全量）
 * - parser/update                   增量更新解析
 * - parser/dispose                  释放语法树缓存
 * - textDocument/highlight          获取高亮数据（便捷接口）
 * - textDocument/definition         符号跳转（F-002）
 * - textDocument/references         引用查找（F-003）
 * - symbol/index                    构建项目符号索引
 * - symbol/extract                  提取单文件符号
 */

#include "json_rpc.h"
#include "parser.h"
#include "symbol.h"

#include <iostream>
#include <csignal>
#include <nlohmann/json.hpp>

using json = nlohmann::json;
namespace rpc = codelens::rpc;
namespace parser = codelens::parser;
namespace symbol_ns = codelens::symbol;

/// 全局服务器实例（用于信号处理）
static rpc::JsonRpcServer* g_server = nullptr;

/// 全局解析器服务
static parser::ParserService* g_parser = nullptr;

/// 全局符号服务
static symbol_ns::SymbolService* g_symbol = nullptr;

/// 信号处理（Ctrl+C 优雅退出）
void signalHandler(int signum) {
    if (g_server) {
        g_server->stop();
    }
}

/// 将 HighlightRange 列表转换为 JSON 数组
static json highlightRangesToJson(const std::vector<parser::HighlightRange>& ranges) {
    json arr = json::array();
    for (const auto& r : ranges) {
        arr.push_back({
            {"startLine", r.start_line},
            {"startCol", r.start_col},
            {"endLine", r.end_line},
            {"endCol", r.end_col},
            {"scope", r.scope},
        });
    }
    return arr;
}

/// 将 Symbol 转换为 JSON 对象
static json symbolToJson(const symbol_ns::Symbol& sym) {
    return {
        {"name", sym.name},
        {"kind", symbol_ns::Symbol::kindToString(sym.kind)},
        {"filePath", sym.file_path},
        {"startLine", sym.start_line},
        {"startCol", sym.start_col},
        {"endLine", sym.end_line},
        {"endCol", sym.end_col},
        {"qualifiedName", sym.qualified_name},
    };
}

/// 将 ReferenceLocation 转换为 JSON 对象
static json referenceToJson(const symbol_ns::ReferenceLocation& ref) {
    return {
        {"filePath", ref.file_path},
        {"startLine", ref.start_line},
        {"startCol", ref.start_col},
        {"endLine", ref.end_line},
        {"endCol", ref.end_col},
        {"contextLine", ref.context_line},
        {"isDefinition", ref.is_definition},
    };
}

int main() {
    // 注册信号处理
    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);

    // 初始化解析器服务
    parser::ParserService parserService;
    g_parser = &parserService;

    // 初始化符号服务
    symbol_ns::SymbolService symbolService;
    g_symbol = &symbolService;

    rpc::JsonRpcServer server;
    g_server = &server;

    // --- 注册基础方法 ---

    // 初始化握手
    server.registerMethod("initialize", [](const json& /*params*/) -> json {
        return {
            {"capabilities", {
                {"textDocumentSync", 1},
                {"definitionProvider", true},          // ✅ 阶段3
                {"referencesProvider", true},          // ✅ 阶段3
                {"documentSymbolProvider", false},     // 阶段4
                {"workspaceSymbolProvider", false},    // 阶段4
                {"highlightProvider", true},           // ✅ 阶段2
            }},
            {"serverInfo", {
                {"name", "codelens-sidecar"},
                {"version", "0.3.0"},
            }},
        };
    });

    // 关闭
    server.registerMethod("shutdown", [](const json& /*params*/) -> json {
        if (g_parser) g_parser->disposeAll();
        if (g_symbol) g_symbol->clearIndex();
        return nullptr;
    });

    // 心跳检测
    server.registerMethod("ping", [](const json& /*params*/) -> json {
        return {{"status", "ok"}, {"timestamp", 0}};
    });

    // --- 解析器方法 ---

    // 获取支持的语言列表
    server.registerMethod("parser/listLanguages", [&parserService](const json& /*params*/) -> json {
        auto langs = parserService.getSupportedLanguages();
        json arr = json::array();
        for (const auto& lang : langs) {
            arr.push_back(lang);
        }
        return {{"languages", arr}};
    });

    // 全量解析文件
    server.registerMethod("parser/parse", [&parserService](const json& params) -> json {
        std::string filepath = params.value("filepath", "");
        if (filepath.empty()) {
            throw std::runtime_error("Missing required parameter: filepath");
        }
        auto result = parserService.parseFile(filepath);
        if (!result.success()) {
            return {{"success", false}, {"error", result.error_message}, {"ranges", json::array()}};
        }
        return {
            {"success", true},
            {"filepath", filepath},
            {"ranges", highlightRangesToJson(result.highlight_ranges)},
        };
    });

    // 解析文件内容（内存中的字符串）
    server.registerMethod("parser/parseContent", [&parserService](const json& params) -> json {
        std::string content = params.value("content", "");
        std::string language = params.value("language", "cpp");
        std::string cacheKey = params.value("cacheKey", "");
        if (content.empty()) {
            throw std::runtime_error("Missing required parameter: content");
        }
        auto result = parserService.parseContent(content, language, cacheKey);
        if (!result.success()) {
            return {{"success", false}, {"error", result.error_message}, {"ranges", json::array()}};
        }
        return {
            {"success", true},
            {"cacheKey", cacheKey},
            {"ranges", highlightRangesToJson(result.highlight_ranges)},
        };
    });

    // 增量更新
    server.registerMethod("parser/update", [&parserService](const json& params) -> json {
        std::string filepath = params.value("filepath", "");
        std::string oldContent = params.value("oldContent", "");
        std::string newContent = params.value("newContent", "");
        if (filepath.empty() || newContent.empty()) {
            throw std::runtime_error("Missing required parameters: filepath, newContent");
        }
        auto result = parserService.updateFile(filepath, oldContent, newContent);
        if (!result.success()) {
            return {{"success", false}, {"error", result.error_message}, {"ranges", json::array()}};
        }
        return {
            {"success", true},
            {"filepath", filepath},
            {"ranges", highlightRangesToJson(result.highlight_ranges)},
        };
    });

    // 释放语法树缓存
    server.registerMethod("parser/dispose", [&parserService](const json& params) -> json {
        std::string filepath = params.value("filepath", "");
        if (!filepath.empty()) {
            parserService.disposeTree(filepath);
        }
        return {{"success", true}};
    });

    // --- 便捷方法（LSP 风格） ---

    // 获取高亮数据
    server.registerMethod("textDocument/highlight", [&parserService](const json& params) -> json {
        std::string filepath = params.value("filepath", "");
        std::string content = params.value("content", "");
        std::string language = params.value("language", "cpp");

        parser::ParseResult result;
        if (!filepath.empty()) {
            result = parserService.parseFile(filepath);
        } else if (!content.empty()) {
            result = parserService.parseContent(content, language, "__inline__");
        } else {
            return {{"success", false}, {"error", "Missing required parameter: filepath or content"}, {"ranges", json::array()}};
        }
        if (!result.success()) {
            return {{"success", false}, {"error", result.error_message}, {"ranges", json::array()}};
        }
        return {{"success", true}, {"ranges", highlightRangesToJson(result.highlight_ranges)}};
    });

    // --- 符号方法（阶段3） ---

    // 符号跳转（Go to Definition）
    server.registerMethod("textDocument/definition", [&symbolService](const json& params) -> json {
        std::string filepath = params.value("filepath", "");
        uint32_t line = params.value("line", 0u);
        uint32_t col = params.value("col", 0u);

        if (filepath.empty()) {
            throw std::runtime_error("Missing required parameter: filepath");
        }

        auto result = symbolService.findDefinition(filepath, line, col);

        if (result.found()) {
            if (result.symbol.has_value()) {
                // 唯一定义
                auto& sym = result.symbol.value();
                return {
                    {"success", true},
                    {"single", true},
                    {"definition", {
                        {"uri", "file:///" + sym.file_path},
                        {"range", {
                            {"start", {{"line", sym.start_line}, {"character", sym.start_col}}},
                            {"end", {{"line", sym.end_line}, {"character", sym.end_col}}},
                        }},
                        {"symbol", symbolToJson(sym)},
                    }},
                };
            } else if (!result.candidates.empty()) {
                // 多定义候选
                json candidates_arr = json::array();
                for (const auto& sym : result.candidates) {
                    candidates_arr.push_back({
                        {"uri", "file:///" + sym.file_path},
                        {"range", {
                            {"start", {{"line", sym.start_line}, {"character", sym.start_col}}},
                            {"end", {{"line", sym.end_line}, {"character", sym.end_col}}},
                        }},
                        {"symbol", symbolToJson(sym)},
                    });
                }
                return {
                    {"success", true},
                    {"single", false},
                    {"candidates", candidates_arr},
                };
            }
        }

        return {{"success", false}, {"error", "Definition not found"}};
    });

    // 引用查找（Find All References）
    server.registerMethod("textDocument/references", [&symbolService](const json& params) -> json {
        std::string symbolName = params.value("symbolName", "");
        std::string filepath = params.value("filepath", "");
        uint32_t line = params.value("line", 0u);
        uint32_t col = params.value("col", 0u);

        // 如果未提供 symbolName，从光标位置获取
        if (symbolName.empty() && !filepath.empty()) {
            // 读取文件，解析获取光标处的符号名
            std::ifstream file(filepath);
            if (file.is_open()) {
                std::stringstream buffer;
                buffer << file.rdbuf();
                std::string content = buffer.str();

                TSParser* temp_parser = ts_parser_new();
                ts_parser_set_language(temp_parser, tree_sitter_cpp());
                TSTree* tree = ts_parser_parse_string(temp_parser, nullptr, content.c_str(), content.length());
                ts_parser_delete(temp_parser);

                if (tree) {
                    // 使用 symbolService 的内部方法获取符号名
                    auto symbols = symbolService.extractSymbolsFromTree(tree, content, filepath);
                    // 简化：遍历所有符号，找到包含光标位置的
                    for (const auto& sym : symbols) {
                        if (sym.start_line <= line && line <= sym.end_line) {
                            symbolName = sym.name;
                            break;
                        }
                    }
                    ts_tree_delete(tree);
                }
            }
        }

        if (symbolName.empty()) {
            return {{"success", false}, {"error", "No symbol name provided"}};
        }

        auto refs = symbolService.findReferences(symbolName);

        json refs_arr = json::array();
        for (const auto& ref : refs) {
            refs_arr.push_back(referenceToJson(ref));
        }

        return {
            {"success", true},
            {"symbolName", symbolName},
            {"totalReferences", refs.size()},
            {"references", refs_arr},
        };
    });

    // 构建项目符号索引
    server.registerMethod("symbol/index", [&symbolService](const json& params) -> json {
        std::string projectPath = params.value("projectPath", "");
        if (projectPath.empty()) {
            throw std::runtime_error("Missing required parameter: projectPath");
        }

        size_t count = symbolService.indexProject(projectPath);

        return {
            {"success", true},
            {"indexedFiles", count},
            {"totalSymbols", symbolService.getSymbolCount()},
            {"indexedFileList", symbolService.getIndexedFiles()},
        };
    });

    // 提取单文件符号
    server.registerMethod("symbol/extract", [&symbolService](const json& params) -> json {
        std::string filepath = params.value("filepath", "");
        if (filepath.empty()) {
            throw std::runtime_error("Missing required parameter: filepath");
        }

        auto symbols = symbolService.extractSymbols(filepath);

        json syms_arr = json::array();
        for (const auto& sym : symbols) {
            syms_arr.push_back(symbolToJson(sym));
        }

        return {
            {"success", true},
            {"filepath", filepath},
            {"symbolCount", symbols.size()},
            {"symbols", syms_arr},
        };
    });

    // 启动消息循环
    std::cerr << "[CodeLens Sidecar] JSON-RPC 2.0 server started (v0.3.0)" << std::endl;
    std::cerr << "[CodeLens Sidecar] Supported languages: ";
    for (const auto& lang : parserService.getSupportedLanguages()) {
        std::cerr << lang << " ";
    }
    std::cerr << std::endl;
    std::cerr << "[CodeLens Sidecar] Capabilities: highlight, definition, references" << std::endl;

    server.run();

    std::cerr << "[CodeLens Sidecar] Server stopped" << std::endl;

    // 清理
    parserService.disposeAll();
    symbolService.clearIndex();
    g_parser = nullptr;
    g_symbol = nullptr;
    g_server = nullptr;

    return 0;
}
