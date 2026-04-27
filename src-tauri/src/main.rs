//! CodeLens 代码阅读器 - 应用入口
//!
//! Tauri 2.0 主入口，负责初始化插件和启动应用

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    codelens_lib::run()
}
