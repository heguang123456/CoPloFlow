//! CodeLens Tauri 命令定义
//!
//! 定义所有前后端通信的 Tauri 命令。
//! 后续阶段将逐步添加以下命令：
//! - textDocument/highlight   → 请求代码高亮数据
//! - textDocument/definition  → 符号跳转
//! - textDocument/references  → 引用查找
//! - textDocument/outline     → 符号大纲
//! - workspace/symbol         → 项目符号搜索
//! - workspace/index          → 构建项目索引
//!
//! 当前阶段仅包含基础文件操作命令，供空壳应用验证 IPC 通道可用性。
