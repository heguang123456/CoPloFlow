/**
 * @file json_rpc.cpp
 * @brief JSON-RPC 2.0 协议处理实现
 *
 * 实现 JSON-RPC 2.0 消息循环：
 * 1. 从 stdin 读取请求（支持 Content-Length 头部）
 * 2. 解析 JSON-RPC 请求
 * 3. 分发到注册的方法处理器
 * 4. 将响应写入 stdout
 *
 * 注意：
 * - 通信通过 stdin/stdout，stderr 用于日志输出
 * - 消息格式兼容 LSP (Language Server Protocol) 规范
 */

#include "json_rpc.h"

#include <iostream>
#include <sstream>
#include <thread>
#include <nlohmann/json.hpp>

using json = nlohmann::json;
namespace rpc = codelens::rpc;

// --- JsonRpcServer 实现 ---

void rpc::JsonRpcServer::registerMethod(const std::string& method, MethodHandler handler) {
    handlers_[method] = std::move(handler);
}

void rpc::JsonRpcServer::run() {
    running_ = true;

    while (running_) {
        try {
            std::string raw = readMessage();
            if (raw.empty()) {
                // stdin 关闭或读取失败
                running_ = false;
                break;
            }

            std::string response = handleRequest(raw);
            if (!response.empty()) {
                writeMessage(response);
            }
        } catch (const std::exception& e) {
            std::cerr << "[JsonRpcServer] Error: " << e.what() << std::endl;
        }
    }
}

void rpc::JsonRpcServer::stop() {
    running_ = false;
}

std::string rpc::JsonRpcServer::readMessage() {
    // 读取 Content-Length 头部
    std::string header_line;
    int content_length = -1;

    while (std::getline(std::cin, header_line)) {
        // 移除 \r
        if (!header_line.empty() && header_line.back() == '\r') {
            header_line.pop_back();
        }

        // 空行表示头部结束
        if (header_line.empty()) {
            break;
        }

        // 解析 Content-Length
        const std::string prefix = "Content-Length: ";
        if (header_line.substr(0, prefix.size()) == prefix) {
            content_length = std::stoi(header_line.substr(prefix.size()));
        }
    }

    if (content_length <= 0) {
        return "";
    }

    // 读取消息体
    std::string body(content_length, '\0');
    std::cin.read(body.data(), content_length);

    if (std::cin.gcount() != content_length) {
        return "";
    }

    return body;
}

void rpc::JsonRpcServer::writeMessage(const std::string& message) {
    std::cout << "Content-Length: " << message.size() << "\r\n"
              << "\r\n"
              << message;
    std::cout.flush();
}

std::string rpc::JsonRpcServer::handleRequest(const std::string& raw) {
    json request;
    try {
        request = json::parse(raw);
    } catch (const json::parse_error&) {
        json error_resp = buildError(
            static_cast<int>(RpcErrorCode::ParseError),
            "Parse error",
            json(nullptr)
        );
        return error_resp.dump();
    }

    // 提取请求字段
    std::string method;
    json params;
    json id;

    if (request.contains("method") && request["method"].is_string()) {
        method = request["method"].get<std::string>();
    }
    if (request.contains("params")) {
        params = request["params"];
    }
    if (request.contains("id")) {
        id = request["id"];
    }

    // 查找方法处理器
    auto it = handlers_.find(method);
    if (it == handlers_.end()) {
        json error_resp = buildError(
            static_cast<int>(RpcErrorCode::MethodNotFound),
            "Method not found: " + method,
            id
        );
        return error_resp.dump();
    }

    // 调用处理器
    try {
        json result = it->second(params);
        json response = {
            {"jsonrpc", "2.0"},
            {"result", result},
            {"id", id}
        };
        return response.dump();
    } catch (const std::exception& e) {
        json error_resp = buildError(
            static_cast<int>(RpcErrorCode::InternalError),
            e.what(),
            id
        );
        return error_resp.dump();
    }
}

json rpc::JsonRpcServer::buildError(int code, const std::string& message, const json& id) {
    return {
        {"jsonrpc", "2.0"},
        {"error", {
            {"code", code},
            {"message", message}
        }},
        {"id", id}
    };
}
