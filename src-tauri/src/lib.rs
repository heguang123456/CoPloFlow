//! CodeLens 应用库
//!
//! 提供 Tauri 应用初始化、命令注册和插件加载
//!
//! 阶段3新增：
//! - sidecar_goto_definition  符号跳转命令
//! - sidecar_find_references  引用查找命令
//! - sidecar_index_project    项目符号索引命令
//! - sidecar_extract_symbols  单文件符号提取命令

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
            sidecar_goto_definition,
            sidecar_find_references,
            sidecar_index_project,
            sidecar_extract_symbols,
        ])
        .setup(|_app| {
            log::info!("CodeLens 代码阅读器启动 (v0.3.0)");
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
#[tauri::command]
fn sidecar_highlight(filepath: String) -> Result<serde_json::Value, String> {
    let sidecar_path = find_sidecar_path()?;
    let result = send_sidecar_request(&sidecar_path, "textDocument/highlight", serde_json::json!({
        "filepath": filepath,
    }))?;
    Ok(result)
}

/// 通过 Sidecar 解析文件（全量解析）
#[tauri::command]
fn sidecar_parse_file(filepath: String) -> Result<serde_json::Value, String> {
    let sidecar_path = find_sidecar_path()?;
    let result = send_sidecar_request(&sidecar_path, "parser/parse", serde_json::json!({
        "filepath": filepath,
    }))?;
    Ok(result)
}

/// 获取 Sidecar 支持的语言列表
#[tauri::command]
fn sidecar_list_languages() -> Result<serde_json::Value, String> {
    let sidecar_path = find_sidecar_path()?;
    let result = send_sidecar_request(&sidecar_path, "parser/listLanguages", serde_json::json!({}))?;
    Ok(result)
}

/// 符号跳转（Go to Definition）
///
/// 输入：文件路径 + 行号 + 列号
/// 输出：定义位置（文件路径 + 行号 + 列号 + 符号信息）
///
/// 异常处理：
/// - Sidecar 不可用：返回错误信息
/// - 找不到定义：返回 { success: false, error: "Definition not found" }
/// - 多定义：返回 candidates 列表供用户选择
#[tauri::command]
fn sidecar_goto_definition(filepath: String, line: u32, col: u32) -> Result<serde_json::Value, String> {
    let sidecar_path = find_sidecar_path()?;
    let result = send_sidecar_request(&sidecar_path, "textDocument/definition", serde_json::json!({
        "filepath": filepath,
        "line": line,
        "col": col,
    }))?;
    Ok(result)
}

/// 引用查找（Find All References）
///
/// 输入：符号名称 或 （文件路径 + 行号 + 列号）
/// 输出：引用位置列表（文件路径 + 行号 + 列号 + 上下文代码）
#[tauri::command]
fn sidecar_find_references(
    symbol_name: Option<String>,
    filepath: Option<String>,
    line: Option<u32>,
    col: Option<u32>,
) -> Result<serde_json::Value, String> {
    let sidecar_path = find_sidecar_path()?;

    let mut params = serde_json::json!({});
    if let Some(name) = symbol_name {
        params["symbolName"] = serde_json::json!(name);
    }
    if let Some(fp) = filepath {
        params["filepath"] = serde_json::json!(fp);
    }
    if let Some(l) = line {
        params["line"] = serde_json::json!(l);
    }
    if let Some(c) = col {
        params["col"] = serde_json::json!(c);
    }

    let result = send_sidecar_request(&sidecar_path, "textDocument/references", params)?;
    Ok(result)
}

/// 构建项目符号索引
///
/// 输入：项目根目录路径
/// 输出：索引统计（文件数量 + 符号数量）
#[tauri::command]
fn sidecar_index_project(project_path: String) -> Result<serde_json::Value, String> {
    let sidecar_path = find_sidecar_path()?;
    let result = send_sidecar_request(&sidecar_path, "symbol/index", serde_json::json!({
        "projectPath": project_path,
    }))?;
    Ok(result)
}

/// 提取单文件符号
///
/// 输入：文件路径
/// 输出：符号列表（名称 + 类型 + 位置）
#[tauri::command]
fn sidecar_extract_symbols(filepath: String) -> Result<serde_json::Value, String> {
    let sidecar_path = find_sidecar_path()?;
    let result = send_sidecar_request(&sidecar_path, "symbol/extract", serde_json::json!({
        "filepath": filepath,
    }))?;
    Ok(result)
}

// ============================================================
// 内部辅助函数
// ============================================================

/// 查找 Sidecar 可执行文件路径
fn find_sidecar_path() -> Result<String, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("无法获取可执行文件路径: {}", e))?
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_default();

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

/// 发送 JSON-RPC 请求到 Sidecar 进程并获取响应
///
/// 流程：
/// 1. 启动 Sidecar 进程
/// 2. 发送 Content-Length + JSON-RPC 请求
/// 3. 读取 Content-Length + JSON-RPC 响应
/// 4. 解析并返回 result 字段
fn send_sidecar_request(
    sidecar_path: &str,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    use std::process::{Command, Stdio};
    use std::io::{Write, Read, BufRead};

    let mut child = Command::new(sidecar_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("无法启动 Sidecar: {}", e))?;

    // 构建 JSON-RPC 请求
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
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
    if let Some(stdout) = child.stdout.take() {
        let mut buf_reader = std::io::BufReader::new(stdout);
        let mut content_length: usize = 0;

        // 读取 Content-Length 头
        loop {
            let mut header = String::new();
            buf_reader.read_line(&mut header)
                .map_err(|e| format!("读取 Sidecar 响应头失败: {}", e))?;
            let trimmed = header.trim();
            if trimmed.is_empty() {
                break;
            }
            if trimmed.starts_with("Content-Length:") {
                let len_str = trimmed.trim_start_matches("Content-Length:").trim();
                content_length = len_str.parse::<usize>().unwrap_or(0);
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


