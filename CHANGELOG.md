# Changelog

本文件记录 CodeLens 项目每个阶段的功能变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.2.0-alpha] - 2026-04-27

### 新增 (Added)

#### C++ Sidecar - 符号提取服务（SymbolService）
- 实现 `SymbolService` 类（~600 行 C++）：
  - `extractSymbols()` — 从语法树提取所有符号定义
  - `extractSymbolsFromTree()` — 从已解析语法树提取符号
  - `findDefinition()` — 根据光标位置查找符号定义（支持多定义候选）
  - `findReferences()` — 在项目范围内查找符号的所有引用
  - `resolveOverloads()` — 函数重载消解
  - `indexProject()` — 批量索引项目所有源文件
  - `clearIndex()` / `getSymbolCount()` / `getIndexedFiles()` — 索引管理
- 支持 13 种符号类型：Function, Method, Constructor, Destructor, Class, Struct, Variable, Field, Enum, EnumMember, Namespace, TypeAlias, Macro
- 实现内存符号表（name → entries 映射，支持重载）
- 实现文件缓存（语法树 + 源代码内容）
- 实现项目源文件扫描（支持 .cpp/.h/.c/.hpp/.cxx/.cc 等扩展名）
- 实现限定名生成（如 `utils::MathHelper::add`）

#### JSON-RPC 接口
- 新增 `textDocument/definition` — 符号跳转（Go to Definition）
- 新增 `textDocument/references` — 引用查找（Find All References）
- 新增 `symbol/index` — 构建项目符号索引
- 新增 `symbol/extract` — 提取单文件符号列表

#### Tauri 后端
- 新增 `sidecar_goto_definition` 命令 — F12/Ctrl+Click 跳转定义
- 新增 `sidecar_find_references` 命令 — Shift+F12 查找引用
- 新增 `sidecar_index_project` 命令 — 索引项目符号
- 新增 `sidecar_extract_symbols` 命令 — 提取文件符号
- 重构 Sidecar 通信为通用 `send_sidecar_request()` 函数
- 服务端版本号升级到 v0.3.0

#### 前端
- 新增 `ReferencesPanel` 组件 — 引用查找结果面板：
  - 按文件分组显示引用
  - 区分定义位置（DEF 标记 + 蓝色边框）
  - 显示引用所在行上下文代码
  - 支持点击跳转
  - Escape 键关闭
- 重写 `Editor.tsx`，集成代码导航功能：
  - 注册 Monaco `DefinitionProvider`（F12 / Ctrl+Click 跳转定义）
  - 注册 Monaco `ReferenceProvider`（Shift+F12 查找引用）
  - 通过 Tauri IPC 调用 Sidecar 获取定义和引用数据
- 更新 `index.tsx`：
  - 集成引用面板（浮动弹出）
  - 新增 `handleGoToDefinition` 回调（跨文件跳转）
  - 新增 `handleJumpToRef` 回调（引用面板点击跳转）
  - 状态栏版本号更新到 v0.3.0
- 新增 TypeScript 全局 Window 类型声明

#### 测试
- 新增 `test_symbol.cpp` 单元测试（7 个测试用例）
- 新增测试数据：`test_header.h`（命名空间+类+枚举）和 `test_source.cpp`（函数定义+引用）
- 新增阶段3测试报告 `docs/TEST_REPORT_PHASE3.md`（21 个测试项）

### 变更 (Changed)
- `symbol.h` — 从占位声明升级为完整 Tree-sitter 符号提取接口
- `symbol.cpp` — 从 "Not implemented" 升级为完整实现（~600 行）
- `main.cpp` — 从 9 个方法扩展为 13 个方法
- `lib.rs` — 从 6 个命令扩展为 10 个命令，重构 Sidecar 通信
- `Editor.tsx` — 新增 DefinitionProvider + ReferenceProvider
- `index.tsx` — 新增引用面板集成和跨文件跳转

## [0.1.0-alpha] - 2026-04-27

### 新增 (Added)

#### C++ Sidecar - Tree-sitter 语法解析
- 集成 Tree-sitter C API v0.20.8，支持 C/C++ 语法解析
- 集成 tree-sitter-cpp 语法库，内置 C/C++ 语言支持
- 实现 `ParserService` 类：
  - `parseFile()` — 全量解析文件，构建语法树
  - `parseContent()` — 解析内存中的字符串
  - `updateFile()` — 增量更新解析（仅重新解析变更区域）
  - `getHighlightRanges()` — 从语法树提取高亮区间
  - `disposeTree()` / `disposeAll()` — 语法树缓存管理
- 实现 Tree-sitter 节点类型 → 语法作用域（scope）映射，覆盖：
  - 控制流关键字（if/for/while/switch/try-catch 等）
  - 类型关键字（class/struct/enum/template 等）
  - 访问修饰符（public/private/protected）
  - 字符串/数字/布尔字面量
  - 单行/多行注释
  - 预处理器指令（#include/#define/#ifdef 等）
- 实现语法树 LRU 缓存（按文件路径索引）
- 实现增量解析（前后缀公共区域检测 + TSInputEdit）

#### JSON-RPC 接口
- 新增 `parser/listLanguages` — 获取支持的语言列表
- 新增 `parser/parse` — 全量解析文件
- 新增 `parser/parseContent` — 解析内存字符串
- 新增 `parser/update` — 增量更新
- 新增 `parser/dispose` — 释放语法树缓存
- 新增 `textDocument/highlight` — 便捷高亮接口（支持文件路径或字符串）

#### Tauri 后端
- 新增 `sidecar_highlight` 命令 — 通过 Sidecar 获取语义高亮
- 新增 `sidecar_parse_file` 命令 — 通过 Sidecar 全量解析
- 新增 `sidecar_list_languages` 命令 — 获取支持语言列表
- 实现 Sidecar 进程管理（启动/通信/终止）
- 实现 Content-Length 协议读写
- 实现 JSON-RPC 响应解析

#### 前端
- 重写 `Editor.tsx`，集成 Tree-sitter 语义高亮：
  - 注册 `codelens-cpp` 自定义语言（基于 C++ Monarch tokenizer）
  - 实现 scope → Monaco CSS class 映射
  - 通过 Tauri IPC 调用 Sidecar 获取语义高亮数据
  - 将高亮数据叠加为 Monaco inline decorations
  - 降级策略：Sidecar 不可用时使用 Monarch tokenizer
- 新增语义高亮 CSS 样式注入

#### 依赖管理
- CMakeLists.txt 新增 Tree-sitter v0.20.8（FetchContent，版本锁定）
- CMakeLists.txt 新增 tree-sitter-cpp v0.20.8（FetchContent，版本锁定）
- CMakeLists.txt 新增 nlohmann/json v3.11.3（FetchContent，版本锁定）

#### 测试
- 新增 Google Test 单元测试框架（v1.14.0，CMake 集成）
- 新增 10 个 ParserService 测试用例
- 新增测试数据文件 `tests/test_data/sample.cpp`（~130 行 C++ 代码）
- 新增阶段2测试报告 `docs/TEST_REPORT_PHASE2.md`

### 变更 (Changed)
- `parser.h` — 从占位声明升级为完整 Tree-sitter C API 集成接口
- `parser.cpp` — 从 "Not implemented" 升级为完整实现
- `main.cpp` — 从 3 个基础方法扩展为 9 个方法（含解析器方法）
- `lib.rs` — 从 3 个命令扩展为 6 个命令
- `README.md` — 更新功能状态表、项目结构、阶段记录
- `CMakeLists.txt` — 启用 FetchContent 依赖下载

## [0.1.0] - 2026-04-27

### 新增 (Added)

#### 项目脚手架
- 初始化 Tauri 2.0 后端项目（src-tauri/）
- 初始化 Next.js 14 前端框架（frontend/），静态导出模式
- 初始化 C++ Sidecar 项目骨架（sidecar/）
- 创建项目配置文件（.gitignore, package.json, tauri.conf.json）
- 生成全平台应用图标（Android/iOS/Windows/macOS）

#### Tauri 后端
- 实现基础命令：`greet`（测试）、`read_directory`（目录读取）、`open_file`（文件读取）
- 配置 tauri-plugin-opener 和 tauri-plugin-dialog 插件
- 配置 capabilities 权限（core + opener + dialog）

#### C++ Sidecar 骨架
- 实现 JSON-RPC 2.0 协议处理（Content-Length 头部 + stdin/stdout 通信）
- 定义 ParserService、SymbolService、IndexService 接口声明
- 注册基础方法（initialize, shutdown, ping）

#### 前端
- 实现 Editor 组件（Monaco Editor 封装，自定义暗色主题）
- 实现 FileTree 组件（文件选择 + 目录加载）
- 实现 SymbolOutline 组件（占位）
- 实现主界面三栏布局（文件树 + 编辑器 + 符号大纲）

#### 文档
- 需求规格文档 REQUIREMENTS.md（v1.2，13 章节）
- 项目 README.md

#### Git 工作流
- 初始化 Git 仓库
- 创建 main + develop 分支
- 配置 .gitignore
