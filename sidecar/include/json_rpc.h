/**
 * @file json_rpc.h
 * @brief JSON-RPC 2.0 协议处理
 *
 * 职责：
 * - 解析 JSON-RPC 2.0 请求
 * - 构建 JSON-RPC 2.0 响应
 * - 处理协议错误（解析错误、无效请求、方法不存在等）
 *
 * 设计说明：
 * - 基于 stdio 通信（stdin 读取请求，stdout 写入响应）
 * - 支持 Content-Length 头部（兼容 LSP 规范）
 * - 线程安全：单线程事件循环模型
 */

#ifndef CODELENS_JSON_RPC_H_
#define CODELENS_JSON_RPC_H_

#include <string>
#include <functional>
#include <unordered_map>
#include <nlohmann/json.hpp>

namespace codelens::rpc {

/// JSON-RPC 2.0 错误码
enum class RpcErrorCode {
    ParseError     = -32700,  // 解析错误
    InvalidRequest = -32600,  // 无效请求
    MethodNotFound = -32601,  // 方法不存在
    InvalidParams  = -32602,  // 无效参数
    InternalError  = -32603,  // 内部错误
};

/// JSON-RPC 2.0 请求结构
struct RpcRequest {
    std::string jsonrpc = "2.0";
    std::string method;
    nlohmann::json params;
    nlohmann::json id;
};

/// JSON-RPC 2.0 响应结构
struct RpcResponse {
    std::string jsonrpc = "2.0";
    nlohmann::json result;
    nlohmann::json id;
};

/// JSON-RPC 2.0 错误响应
struct RpcError {
    int code;
    std::string message;
    nlohmann::json data;
};

/// 方法处理器类型
using MethodHandler = std::function<nlohmann::json(const nlohmann::json& params)>;

/**
 * JSON-RPC 2.0 服务器
 *
 * 职责：
 * - 从 stdin 读取 JSON-RPC 请求
 * - 分发到注册的方法处理器
 * - 将响应写入 stdout
 * - 处理协议级错误
 */
class JsonRpcServer {
public:
    JsonRpcServer() = default;
    ~JsonRpcServer() = default;

    /// 注册方法处理器
    void registerMethod(const std::string& method, MethodHandler handler);

    /// 启动消息循环（阻塞）
    void run();

    /// 停止消息循环
    void stop();

private:
    /// 从 stdin 读取一条消息
    std::string readMessage();

    /// 向 stdout 写入一条消息
    void writeMessage(const std::string& message);

    /// 处理单条请求
    std::string handleRequest(const std::string& raw);

    /// 构建错误响应
    nlohmann::json buildError(int code, const std::string& message,
                               const nlohmann::json& id);

    std::unordered_map<std::string, MethodHandler> handlers_;
    bool running_ = false;
};

}  // namespace codelens::rpc

#endif  // CODELENS_JSON_RPC_H_
