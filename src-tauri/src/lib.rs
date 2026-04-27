//! CodeLens 应用库
//!
//! 提供 Tauri 应用初始化、命令注册和插件加载
//!
//! 阶段2新增：
//! - C++ Sidecar 进程管理
//! - textDocument/highlight 命令

/// 应用启动时执行的初始化逻辑
///
/// 初始化内容：
/// - 注册 Tauri 命令
/// - 配置 C++ Sidecar 进程
/// - 设置 IPC 通信通道
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            read_directory,
            open_file,
            sidecar_highlight,
            sidecar_parse_file,
            sidecar_list_languages,
        ])
        .setup(|_app| {
            log::info!("CodeLens 代码阅读器启动 (v0.2.0)");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 测试用问候命令
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to CodeLens.", name)
}

/// 读取目录内容
///
/// 输入：目录路径
/// 输出：目录条目列表（名称 + 类型 + 路径）
#[tauri::command]
fn read_directory(path: String) -> Result<Vec<serde_json::Value>, String> {
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let full_path = entry.path().to_string_lossy().to_string();

        entries.push(serde_json::json!({
            "name": name,
            "isDir": is_dir,
            "path": full_path,
        }));
    }

    // 排序：目录优先，然后按名称
    entries.sort_by(|a, b| {
        let a_dir = a["isDir"].as_bool().unwrap_or(false);
        let b_dir = b["isDir"].as_bool().unwrap_or(false);
        match (a_dir, b_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => {
                let a_name = a["name"].as_str().unwrap_or("");
                let b_name = b["name"].as_str().unwrap_or("");
                a_name.cmp(b_name)
            }
        }
    });

    Ok(entries)
}

/// 读取文件内容
///
/// 输入：文件路径
/// 输出：文件内容字符串
#[tauri::command]
fn open_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("无法读取文件 {}: {}", path, e))
}

/// 通过 C++ Sidecar 获取文件的高亮数据
///
/// 输入：文件路径
/// 输出：高亮区间列表（JSON）
///
/// 流程：
/// 1. 查找或启动 Sidecar 进程
/// 2. 发送 textDocument/highlight JSON-RPC 请求
/// 3. 解析响应返回高亮数据
#[tauri::command]
fn sidecar_highlight(filepath: String) -> Result<serde_json::Value, String> {
    // 阶段2 实现：通过 Sidecar 进程通信
    // 当前先用简化版本：直接调用嵌入的解析逻辑
    use std::process::{Command, Stdio};
    use std::io::{Write, Read, BufRead};

    // 查找 Sidecar 可执行文件路径
    let sidecar_path = find_sidecar_path()?;

    // 启动 Sidecar 进程
    let mut child = Command::new(&sidecar_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("无法启动 Sidecar: {}", e))?;

    // 构建 JSON-RPC 请求
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "textDocument/highlight",
        "params": {
            "filepath": filepath
        },
        "id": 1
    });

    let request_body = serde_json::to_string(&request)
        .map_err(|e| format!("JSON 序列化失败: {}", e))?;

    // 发送请求（Content-Length 协议）
    let message = format!("Content-Length: {}\r\n\r\n{}", request_body.len(), request_body);

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(message.as_bytes())
            .map_err(|e| format!("写入 Sidecar stdin 失败: {}", e))?;
    }

    // 读取响应
    let mut response = String::new();
    if let Some(mut stdout) = child.stdout.take() {
        // 读取 Content-Length 头
        let mut header = String::new();
        let mut content_length: usize = 0;

        let mut buf_reader = std::io::BufReader::new(&mut stdout);
        loop {
            header.clear();
            buf_reader.read_line(&mut header)
                .map_err(|e| format!("读取 Sidecar 响应头失败: {}", e))?;
            let trimmed = header.trim();
            if trimmed.is_empty() {
                break;
            }
            if trimmed.starts_with("Content-Length:") {
                let len_str = trimmed.trim_start_matches("Content-Length:").trim();
                content_length = len_str.parse::<usize>()
                    .unwrap_or(0);
            }
        }

        // 读取消息体
        if content_length > 0 {
            let mut body_buf = vec![0u8; content_length];
            buf_reader.read_exact(&mut body_buf)
                .map_err(|e| format!("读取 Sidecar 响应体失败: {}", e))?;
            response = String::from_utf8_lossy(&body_buf).to_string();
        }
    }

    // 等待进程结束
    let _ = child.wait();

    if response.is_empty() {
        return Err("Sidecar 未返回响应".to_string());
    }

    // 解析 JSON-RPC 响应
    let resp: serde_json::Value = serde_json::from_str(&response)
        .map_err(|e| format!("解析 Sidecar 响应失败: {} - {}", e, response))?;

    if let Some(error) = resp.get("error") {
        return Err(format!("Sidecar 错误: {}", error));
    }

    Ok(resp.get("result").cloned().unwrap_or(serde_json::Value::Null))
}

/// 通过 Sidecar 解析文件（全量解析）
#[tauri::command]
fn sidecar_parse_file(filepath: String) -> Result<serde_json::Value, String> {
    use std::process::{Command, Stdio};
    use std::io::{Write, Read};

    let sidecar_path = find_sidecar_path()?;

    let mut child = Command::new(&sidecar_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("无法启动 Sidecar: {}", e))?;

    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "parser/parse",
        "params": { "filepath": filepath },
        "id": 2
    });

    let request_body = serde_json::to_string(&request)
        .map_err(|e| format!("JSON 序列化失败: {}", e))?;

    let message = format!("Content-Length: {}\r\n\r\n{}", request_body.len(), request_body);

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(message.as_bytes())
            .map_err(|e| format!("写入 Sidecar stdin 失败: {}", e))?;
    }

    let mut response = String::new();
    if let Some(mut stdout) = child.stdout.take() {
        stdout.read_to_string(&mut response)
            .map_err(|e| format!("读取 Sidecar 响应失败: {}", e))?;
    }

    let _ = child.wait();

    if response.is_empty() {
        return Err("Sidecar 未返回响应".to_string());
    }

    // 从 Content-Length 协议中提取 JSON 体
    let json_body = extract_json_body(&response);

    let resp: serde_json::Value = serde_json::from_str(&json_body)
        .map_err(|e| format!("解析响应失败: {} - {}", e, json_body))?;

    Ok(resp.get("result").cloned().unwrap_or(serde_json::Value::Null))
}

/// 获取 Sidecar 支持的语言列表
#[tauri::command]
fn sidecar_list_languages() -> Result<serde_json::Value, String> {
    use std::process::{Command, Stdio};
    use std::io::{Write, Read};

    let sidecar_path = find_sidecar_path()?;

    let mut child = Command::new(&sidecar_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("无法启动 Sidecar: {}", e))?;

    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "parser/listLanguages",
        "params": {},
        "id": 3
    });

    let request_body = serde_json::to_string(&request)
        .map_err(|e| format!("JSON 序列化失败: {}", e))?;

    let message = format!("Content-Length: {}\r\n\r\n{}", request_body.len(), request_body);

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(message.as_bytes())
            .map_err(|e| format!("写入 Sidecar stdin 失败: {}", e))?;
    }

    let mut response = String::new();
    if let Some(mut stdout) = child.stdout.take() {
        stdout.read_to_string(&mut response)
            .map_err(|e| format!("读取 Sidecar 响应失败: {}", e))?;
    }

    let _ = child.wait();

    let json_body = extract_json_body(&response);

    let resp: serde_json::Value = serde_json::from_str(&json_body)
        .map_err(|e| format!("解析响应失败: {}", e))?;

    Ok(resp.get("result").cloned().unwrap_or(serde_json::Value::Null))
}

/// 查找 Sidecar 可执行文件路径
fn find_sidecar_path() -> Result<String, String> {
    // 在开发模式下，Sidecar 位于 sidecar/build/Release/codelens-sidecar.exe
    // 在发布模式下，Sidecar 位于与可执行文件同目录
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("无法获取可执行文件路径: {}", e))?
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_default();

    // 候选路径列表
    let candidates = vec![
        exe_dir.join("codelens-sidecar.exe"),
        exe_dir.join("sidecar").join("codelens-sidecar.exe"),
        std::path::PathBuf::from("./sidecar/build/Release/codelens-sidecar.exe"),
        std::path::PathBuf::from("./sidecar/build/Debug/codelens-sidecar.exe"),
        std::path::PathBuf::from("./target/release/codelens-sidecar.exe"),
        std::path::PathBuf::from("./target/debug/codelens-sidecar.exe"),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }

    Err(format!("未找到 Sidecar 可执行文件。搜索路径: {:?}", candidates))
}

/// 从 Content-Length 协议响应中提取 JSON 体
fn extract_json_body(response: &str) -> String {
    // 查找 "Content-Length: N" 头，然后读取后面的空行和 JSON 体
    if let Some(pos) = response.find("Content-Length:") {
        let after_header = &response[pos..];
        // 跳过头部行
        if let Some(body_start) = after_header.find("\r\n\r\n") {
            let json_start = body_start + 4;
            if json_start < after_header.len() {
                let body = &after_header[json_start..];
                // 提取到下一个 Content-Length 或结束
                if let Some(next_header) = body.find("Content-Length:") {
                    return body[..next_header].trim().to_string();
                }
                return body.trim().to_string();
            }
        }
    }

    // 如果没有 Content-Length 头，尝试直接解析为 JSON
    response.trim().to_string()
}
