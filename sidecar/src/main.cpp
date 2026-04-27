/**
 * @file main.cpp
 * @brief CodeLens C++ Sidecar 入口
 *
 * 启动 JSON-RPC 2.0 消息循环，通过 stdin/stdout 与 Tauri 主进程通信。
 *
 * 当前阶段：
 * - 注册基础方法（initialize, shutdown, ping）
 * - 验证 JSON-RPC 通信通道可用性
 *
 * 后续阶段将注册：
 * - textDocument/highlight   → 代码高亮
 * - textDocument/definition  → 符号跳转
 * - textDocument/references  → 引用查找
 * - textDocument/outline     → 符号大纲
 * - workspace/symbol         → 项目符号搜索
 * - workspace/index          → 构建项目索引
 */

#include "json_rpc.h"

#include <iostream>
#include <csignal>
#include <nlohmann/json.hpp>

using json = nlohmann::json;
namespace rpc = codelens::rpc;

/// 全局服务器实例（用于信号处理）
static rpc::JsonRpcServer* g_server = nullptr;

/// 信号处理（Ctrl+C 优雅退出）
void signalHandler(int signum) {
    if (g_server) {
        g_server->stop();
    }
}

int main() {
    // 注册信号处理
    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);

    rpc::JsonRpcServer server;
    g_server = &server;

    // --- 注册基础方法 ---

    // 初始化握手
    server.registerMethod("initialize", [](const json& params) -> json {
        return {
            {"capabilities", {
                {"textDocumentSync", 1},  // 全量同步
                {"definitionProvider", true},
                {"referencesProvider", true},
                {"documentSymbolProvider", true},
                {"workspaceSymbolProvider", true},
            }},
            {"serverInfo", {
                {"name", "codelens-sidecar"},
                {"version", "0.1.0"},
            }},
        };
    });

    // 关闭
    server.registerMethod("shutdown", [](const json& /*params*/) -> json {
        return nullptr;
    });

    // 心跳检测
    server.registerMethod("ping", [](const json& /*params*/) -> json {
        return {{"status", "ok"}};
    });

    // 启动消息循环
    std::cerr << "[CodeLens Sidecar] JSON-RPC 2.0 server started" << std::endl;
    server.run();
    std::cerr << "[CodeLens Sidecar] Server stopped" << std::endl;

    g_server = nullptr;
    return 0;
}
