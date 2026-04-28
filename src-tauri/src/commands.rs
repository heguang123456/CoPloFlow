//! CodeLens Tauri 命令定义
//!
//! 定义所有前后端通信的 Tauri 命令。
//!
//! 阶段1（已实现）：
//! - greet                          测试问候
//! - read_directory                 读取目录
//! - open_file                      读取文件
//!
//! 阶段2（新增）：
//! - sidecar_highlight              获取 Tree-sitter 语义高亮
//! - sidecar_parse_file             全量解析文件
//! - sidecar_list_languages         获取支持的语言列表
//!
//! 后续阶段将添加：
//! - textDocument/definition        符号跳转
//! - textDocument/references        引用查找
//! - textDocument/outline           符号大纲
//! - workspace/symbol               项目符号搜索
//! - workspace/index                构建项目索引
