//! CodeLens 应用库
//!
//! 提供 Tauri 应用初始化、命令注册和插件加载
//!
//! 阶段3新增：
//! - sidecar_goto_definition  符号跳转命令
//! - sidecar_find_references  引用查找命令
//! - sidecar_index_project    项目符号索引命令
//! - sidecar_extract_symbols  单文件符号提取命令
//! - sidecar_document_outline 文档符号大纲命令（F-004）
//!
//! 阶段4新增：
//! - sidecar_search_symbols   项目符号搜索命令（F-005）
//!
//! v0.7.0 新增（OPT-007）：
//! - Sidecar 常驻进程 + 管道复用通信
//! - 请求 ID 自增机制
//! - 进程自动重启

use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

/// 全局 Sidecar 常驻进程管理
///
/// 生命周期：应用启动后首次请求时 spawn，进程崩溃时自动重启，应用退出时进程随主进程终止
struct SidecarProcess {
    /// 子进程句柄
    child: Child,
    /// stdin 写入器（缓存）
    stdin: std::process::ChildStdin,
    /// stdout 缓冲读取器
    stdout: BufReader<std::process::ChildStdout>,
    /// 自增请求 ID
    next_id: u64,
}

impl SidecarProcess {
    /// 启动 Sidecar 常驻进程
    fn spawn() -> Result<Self, String> {
        let sidecar_path = find_sidecar_path()?;

        let mut command = Command::new(&sidecar_path);
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        // Windows: 防止 sidecar 进程创建可见的控制台窗口
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command
            .spawn()
            .map_err(|e| format!("无法启动 Sidecar: {}", e))?;

        let stdin = child.stdin.take()
            .ok_or_else(|| "Sidecar stdin 不可用".to_string())?;
        let stdout = child.stdout.take()
            .ok_or_else(|| "Sidecar stdout 不可用".to_string())?;

        log::info!("Sidecar 常驻进程已启动 (PID: {:?})", child.id());

        Ok(SidecarProcess {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            next_id: 1,
        })
    }

    /// 发送请求并读取响应（通过已有的 stdin/stdout 管道）
    fn send_request(
        &mut self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let request_id = self.next_id;
        self.next_id += 1;

        // 构建 JSON-RPC 请求
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": request_id
        });

        let request_body = serde_json::to_string(&request)
            .map_err(|e| format!("JSON 序列化失败: {}", e))?;

        // 发送请求（Content-Length 协议）
        let message = format!("Content-Length: {}\r\n\r\n{}", request_body.len(), request_body);

        self.stdin.write_all(message.as_bytes())
            .map_err(|e| format!("写入 Sidecar stdin 失败: {}", e))?;
        self.stdin.flush()
            .map_err(|e| format!("刷新 Sidecar stdin 失败: {}", e))?;

        // 读取响应
        let mut content_length: usize = 0;

        // 读取 Content-Length 头
        loop {
            let mut header = String::new();
            self.stdout.read_line(&mut header)
                .map_err(|e| format!("读取 Sidecar 响应头失败: {}", e))?;
            let trimmed = header.trim().to_string();
            if trimmed.is_empty() {
                break;
            }
            if trimmed.starts_with("Content-Length:") {
                let len_str = trimmed.trim_start_matches("Content-Length:").trim();
                content_length = len_str.parse::<usize>().unwrap_or(0);
            }
        }

        // 读取消息体
        if content_length == 0 {
            return Err("Sidecar 未返回响应体".to_string());
        }

        let mut body_buf = vec![0u8; content_length];
        self.stdout.read_exact(&mut body_buf)
            .map_err(|e| format!("读取 Sidecar 响应体失败: {}", e))?;
        let response = String::from_utf8_lossy(&body_buf).to_string();

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

    /// 检查进程是否仍在运行
    fn is_alive(&mut self) -> bool {
        match self.child.try_wait() {
            Ok(Some(_status)) => false, // 进程已退出
            Ok(None) => true,          // 进程仍在运行
            Err(_) => false,
        }
    }
}

impl Drop for SidecarProcess {
    fn drop(&mut self) {
        // 发送 shutdown 请求（尽力而为）
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "shutdown",
            "params": {},
            "id": 99999
        });
        if let Ok(body) = serde_json::to_string(&request) {
            let message = format!("Content-Length: {}\r\n\r\n{}", body.len(), body);
            let _ = self.stdin.write_all(message.as_bytes());
            let _ = self.stdin.flush();
        }
        let _ = self.child.kill();
        log::info!("Sidecar 常驻进程已终止");
    }
}

/// 全局 Sidecar 进程实例
static SIDECAR: Mutex<Option<SidecarProcess>> = Mutex::new(None);

/// 确保常驻进程可用，如果未启动或已退出则启动/重启
fn ensure_sidecar() -> Result<(), String> {
    let mut guard = SIDECAR.lock()
        .map_err(|e| format!("Sidecar 锁获取失败: {}", e))?;

    match guard.as_mut() {
        Some(proc) => {
            if !proc.is_alive() {
                log::warn!("Sidecar 进程已退出，正在重启...");
                *guard = Some(SidecarProcess::spawn()?);
            }
        }
        None => {
            *guard = Some(SidecarProcess::spawn()?);
        }
    }

    Ok(())
}

/// 发送 JSON-RPC 请求到 Sidecar 常驻进程
///
/// 流程（OPT-007 优化后）：
/// 1. 确保常驻进程可用（懒启动 + 自动重启）
/// 2. 通过 stdin 管道发送 Content-Length + JSON-RPC 请求
/// 3. 通过 stdout 管道读取 Content-Length + JSON-RPC 响应
/// 4. 解析并返回 result 字段
fn send_sidecar_request(
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    ensure_sidecar()?;

    let mut guard = SIDECAR.lock()
        .map_err(|e| format!("Sidecar 锁获取失败: {}", e))?;

    guard.as_mut()
        .ok_or_else(|| "Sidecar 进程未初始化".to_string())?
        .send_request(method, params)
}

/// 应用启动时执行的初始化逻辑
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
            sidecar_document_outline,
            sidecar_search_symbols,
        ])
        .setup(|_app| {
            log::info!("CodeLens 代码阅读器启动 (v0.7.0)");
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
        let full_path = entry.path();

        let metadata = full_path.symlink_metadata().map_err(|e| e.to_string())?;
        if metadata.file_type().is_symlink() {
            continue;
        }

        let is_dir = metadata.is_dir();

        entries.push(serde_json::json!({
            "name": name,
            "isDir": is_dir,
            "path": full_path.to_string_lossy().to_string(),
        }));
    }

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
#[tauri::command]
fn open_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("无法读取文件 {}: {}", path, e))
}

/// 通过 C++ Sidecar 获取文件的高亮数据
#[tauri::command]
fn sidecar_highlight(filepath: String) -> Result<serde_json::Value, String> {
    let result = send_sidecar_request("textDocument/highlight", serde_json::json!({
        "filepath": filepath,
    }))?;
    Ok(result)
}

/// 通过 Sidecar 解析文件（全量解析）
#[tauri::command]
fn sidecar_parse_file(filepath: String) -> Result<serde_json::Value, String> {
    let result = send_sidecar_request("parser/parse", serde_json::json!({
        "filepath": filepath,
    }))?;
    Ok(result)
}

/// 获取 Sidecar 支持的语言列表
#[tauri::command]
fn sidecar_list_languages() -> Result<serde_json::Value, String> {
    let result = send_sidecar_request("parser/listLanguages", serde_json::json!({}))?;
    Ok(result)
}

/// 符号跳转（Go to Definition）
#[tauri::command]
fn sidecar_goto_definition(filepath: String, line: u32, col: u32) -> Result<serde_json::Value, String> {
    let result = send_sidecar_request("textDocument/definition", serde_json::json!({
        "filepath": filepath,
        "line": line,
        "col": col,
    }))?;
    Ok(result)
}

/// 引用查找（Find All References）
#[tauri::command]
fn sidecar_find_references(
    symbol_name: Option<String>,
    filepath: Option<String>,
    line: Option<u32>,
    col: Option<u32>,
) -> Result<serde_json::Value, String> {
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

    let result = send_sidecar_request("textDocument/references", params)?;
    Ok(result)
}

/// 构建项目符号索引
#[tauri::command]
fn sidecar_index_project(project_path: String) -> Result<serde_json::Value, String> {
    let result = send_sidecar_request("symbol/index", serde_json::json!({
        "projectPath": project_path,
    }))?;
    Ok(result)
}

/// 提取单文件符号
#[tauri::command]
fn sidecar_extract_symbols(filepath: String) -> Result<serde_json::Value, String> {
    let result = send_sidecar_request("symbol/extract", serde_json::json!({
        "filepath": filepath,
    }))?;
    Ok(result)
}

/// 文档符号大纲（F-004）
#[tauri::command]
fn sidecar_document_outline(filepath: String) -> Result<serde_json::Value, String> {
    let result = send_sidecar_request("textDocument/outline", serde_json::json!({
        "filepath": filepath,
    }))?;
    Ok(result)
}

/// 搜索项目符号（F-005）
#[tauri::command]
fn sidecar_search_symbols(query: String, limit: Option<u32>) -> Result<serde_json::Value, String> {
    let result = send_sidecar_request("symbol/search", serde_json::json!({
        "query": query,
        "limit": limit.unwrap_or(50),
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
        std::path::PathBuf::from("./sidecar/build/Release/codelens-sidecar.exe"),
        std::path::PathBuf::from("./sidecar/build/Debug/codelens-sidecar.exe"),
        exe_dir.join("sidecar").join("codelens-sidecar.exe"),
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
