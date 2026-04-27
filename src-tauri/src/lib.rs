//! CodeLens 应用库
//!
//! 提供 Tauri 应用初始化、命令注册和插件加载

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
        ])
        .setup(|_app| {
            // 应用启动后的初始化逻辑
            log::info!("CodeLens 代码阅读器启动");
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
