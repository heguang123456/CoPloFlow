# CodeLens 代码阅读器

> 轻量、快速、语义感知的 C++ 代码阅读器

## 技术栈

- **桌面框架**：Tauri 2.0
- **前端**：Next.js + React + Monaco Editor
- **后端核心**：C++20 Sidecar + Tree-sitter C API
- **数据存储**：SQLite
- **通信协议**：JSON-RPC 2.0 over Stdio/IPC

## 项目结构

```
CodeLens/
├── src-tauri/               # Tauri 后端（Rust）
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   ├── binaries/             # Sidecar 可执行文件（Tauri externalBin 打包用）
│   └── src/
│       ├── main.rs          # 应用入口
│       ├── lib.rs           # 命令注册与 Sidecar 进程管理
│       ├── commands.rs      # 命令定义文档
│       └── sidebar.rs       # 侧边栏管理
│
├── sidecar/                 # C++ Sidecar
│   ├── CMakeLists.txt
│   ├── include/
│   │   ├── json_rpc.h      # JSON-RPC 协议处理
│   │   ├── parser.h        # Tree-sitter 解析接口（已集成）
│   │   ├── symbol.h        # 符号提取接口（已集成）
│   │   └── indexer.h       # 符号索引接口
│   ├── src/
│   │   ├── main.cpp         # Sidecar 入口 + 方法注册
│   │   ├── json_rpc.cpp     # JSON-RPC 实现
│   │   ├── parser.cpp       # Tree-sitter 解析服务实现
│   │   ├── symbol.cpp       # 符号服务实现（F-002 + F-003 + F-004 + F-005）
│   │   └── indexer.cpp      # 索引服务（占位）
│   └── tests/
│       ├── test_parser.cpp  # ParserService 单元测试
│       ├── test_symbol.cpp  # SymbolService 单元测试
│       └── test_data/
│           ├── sample.cpp   # 测试数据（高亮）
│           └── (内嵌测试数据) # 符号测试数据
│
├── frontend/                # Next.js 前端
│   ├── package.json
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── scripts/
│   │   └── copy-monaco.js   # Monaco 本地文件复制脚本
│   ├── pages/
│   │   ├── index.tsx        # 主界面（含引用面板集成）
│   │   ├── _app.tsx         # 应用入口（ErrorBoundary + ThemeProvider）
│   │   └── _error.tsx       # 自定义错误页面
│   ├── components/
│   │   ├── Editor.tsx       # Monaco Editor + 语义高亮 + 符号跳转 + 引用查找
│   │   ├── FileTree.tsx     # 文件树组件（搜索过滤 + 右键菜单 + 文件图标）
│   │   ├── FileIcon.tsx     # 文件类型图标映射
│   │   ├── ContextMenu.tsx  # 通用右键上下文菜单
│   │   ├── ThemeProvider.tsx # 主题上下文（深色/浅色切换）
│   │   ├── SymbolOutline.tsx # 符号大纲组件（IPC + 嵌套渲染）
│   │   ├── SearchPanel.tsx  # 符号搜索结果面板
│   │   └── ReferencesPanel.tsx # 引用查找结果面板
│   └── styles/
│       └── globals.css      # 全局样式
│
├── docs/                    # 文档
│   ├── DESIGN_F004_OUTLINE.md # F-004 符号大纲设计文档
│   ├── DESIGN_F005_INDEX.md   # F-005 符号索引设计文档
│   ├── DESIGN_PHASE5.md       # 阶段5 UI完善设计文档
│   ├── OPTIMIZATION.md        # 优化文档（v0.7.0 运行时优化）
│   ├── TEST_REPORT_PHASE2.md # 阶段2 测试报告
│   ├── TEST_REPORT_PHASE3.md # 阶段3 测试报告
│   └── TEST_REPORT_PHASE4.md # 阶段4 测试报告
├── data/                    # SQLite 数据库（运行时生成）
├── .gitignore
├── REQUIREMENTS.md          # 需求规格文档
├── CHANGELOG.md             # 变更日志
└── README.md
```

## 开发环境

### 前置要求

- Node.js 18+
- Rust (via rustup)
- Visual Studio 2022（含 C++ 桌面开发工作负载）
- CMake 3.24+

### 安装依赖

```bash
# 前端依赖
cd frontend
npm install

# Rust 依赖（自动由 Cargo 管理）
cd ../src-tauri
cargo build
```

### 构建 C++ Sidecar

```bash
cd sidecar
cmake -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release
```

### 开发运行

```bash
cd src-tauri
cargo tauri dev
```

### 构建发布

```bash
cd src-tauri
cargo tauri build
```

## 核心功能

| 功能 ID | 功能名称 | 优先级 | 状态 |
|---------|---------|--------|------|
| F-001 | 代码高亮 | P0 | ✅ 阶段2完成 |
| F-002 | 符号跳转 | P0 | ✅ 阶段3完成 |
| F-003 | 引用查找 | P0 | ✅ 阶段3完成 |
| F-004 | 符号大纲 | P1 | ✅ 阶段4完成 |
| F-005 | 项目符号索引 | P1 | ✅ 阶段4完成 |
| F-006 | 文件树浏览器 | P0 | ✅ 阶段5完成 |

## 快捷键

| 功能 | 快捷键 | 说明 |
|------|--------|------|
| 打开文件 | Ctrl+O | 系统文件选择器 |
| 符号跳转 | F12 或 Ctrl+Click | 跳转到定义 |
| 查找引用 | Shift+F12 | 显示引用列表 |
| 符号搜索 | Ctrl+Shift+F | 搜索项目符号 |
| 关闭面板 | Escape | 关闭引用面板/搜索面板等弹出层 |
| 切换主题 | Ctrl+K Ctrl+T | 深色 ↔ 浅色主题 |

## 阶段开发记录

### 阶段1：项目搭建 ✅

**提交**：`de6bd8d` - `feat: 阶段1 - 项目脚手架搭建`
**标签**：—
**内容**：
- Tauri 2.0 后端项目（src-tauri/）
- Next.js 前端框架（frontend/）
- C++ Sidecar 骨架（sidecar/）
- Git 仓库初始化 + main/develop 分支

### 阶段2：核心解析 ✅

**提交**：`feat/f001-highlight` 分支（5 个原子提交）
**标签**：`v0.1.0-alpha`
**内容**：
- 集成 Tree-sitter C API（v0.20.8）和 tree-sitter-cpp 语法库
- 实现 ParserService：全量解析、增量更新、语法树缓存
- 注册 JSON-RPC 方法：textDocument/highlight、parser/parse、parser/update
- Tauri 后端新增 Sidecar 进程管理和 3 个 IPC 命令
- 前端 Editor 组件集成 Tree-sitter 语义高亮（Monaco Decorations 叠加）
- Google Test 单元测试（10 个用例）
- 详细测试报告

### 阶段3：符号提取 ✅

**提交**：`feat/f002-symbol-jump` 分支
**标签**：`v0.2.0-alpha`
**内容**：
- 实现 SymbolService（~600 行 C++）：
  - 符号提取：13 种符号类型（Function/Class/Struct/Variable/Enum 等）
  - 定义查找：光标位置 → 语法树 → 符号表 → 定义位置
  - 引用查找：符号名 → 遍历项目文件 → 同名标识符匹配
  - 项目索引：批量扫描源文件 → 解析 → 符号表构建
  - 限定名生成：`namespace::class::method` 格式
- 注册 4 个 JSON-RPC 方法：
  - `textDocument/definition`（F-002 符号跳转）
  - `textDocument/references`（F-003 引用查找）
  - `symbol/index`（项目索引）
  - `symbol/extract`（单文件符号）
- Tauri 后端新增 4 个 IPC 命令
- 重构 Sidecar 通信为通用 `send_sidecar_request()` 函数
- 前端集成代码导航：
  - Monaco DefinitionProvider（F12/Ctrl+Click 跳转定义）
  - Monaco ReferenceProvider（Shift+F12 查找引用）
  - 新增 ReferencesPanel 组件（按文件分组、DEF 标记、上下文代码）
- Google Test 单元测试（7 个用例）+ 14 个设计验证项
- 详细测试报告

### 阶段4：索引与搜索 ✅

**提交**：`feat/f004-f005-index-search` 分支（2 个提交）
**标签**：`v0.4.0`
**内容**：
- 实现文档符号大纲（F-004）：
  - C++ Sidecar `textDocument/outline` JSON-RPC 方法（基于栈的嵌套树构建算法）
  - Tauri `sidecar_document_outline` IPC 命令
  - 前端 `SymbolOutline.tsx` 完整组件（IPC 调用 + 嵌套渲染 + 展开/折叠 + 点击跳转）
- 实现项目符号搜索（F-005）：
  - C++ Sidecar `symbol/search` JSON-RPC 方法（前缀匹配 + 子串匹配，大小写不敏感，去重排序）
  - C++ `SymbolService::searchSymbols()` 方法（双策略搜索）
  - Tauri `sidecar_search_symbols` IPC 命令
  - 前端 `SearchPanel.tsx` 搜索结果面板（键盘导航 + 符号类型图标/颜色）
  - 菜单栏搜索框 + Ctrl+Shift+F 快捷键 + 200ms 防抖
- 三端编译验证通过（C++ Release / Rust cargo check / Next.js build）
- E2E 功能测试 24 项全部通过
- F-004/F-005 设计文档 + 阶段4测试报告
- 已知限制：索引仅存内存（无 SQLite 持久化），Sidecar 进程重启后需重建

### 阶段5：UI 完善 ✅

**提交**：`feat/f006-file-tree` 分支（7 个原子提交）
**标签**：`v0.5.0-beta`
**内容**：
- F-006 文件树浏览器增强：
  - 重写 `FileTree.tsx`：搜索过滤（300ms 防抖）、右键上下文菜单、文件类型图标
  - 新增 `FileIcon.tsx`：15+ 扩展名图标映射（CSS 徽标方案，无外部依赖）
  - 新增 `ContextMenu.tsx`：通用右键菜单组件（视口边界修正）
  - 目录内排序（目录优先 → 隐藏文件排末尾 → 字母序）
- 后端 `read_directory` 增加符号链接过滤（`symlink_metadata`）
- 主题切换：
  - 新增 `ThemeProvider.tsx`：React Context + localStorage 持久化
  - 浅色主题 15 个 CSS 变量（`[data-theme="light"]`）
  - Monaco Editor `codelens-light` 浅色主题定义
  - Ctrl+K Ctrl+T 快捷键 + 状态栏主题切换按钮
  - 300ms 渐变过渡动画
- 界面布局完善：
  - 可拖拽分割面板（左侧 + 右侧，160~480px 范围）
  - 双击分割条恢复默认宽度
  - 菜单栏下拉功能化（文件/查看/转到/帮助）
  - 状态栏增强（主题切换按钮 + 版本号 v0.5.0）
- 前端 + Rust 编译验证通过
- 零新增 npm 依赖（所有 UI 通过原生 React + CSS 实现）

### 运行时优化 ✅

**提交**：`fix/runtime-stability` 分支
**标签**：`v0.6.0-rc1`
**内容**：
- **Monaco CDN 兼容性**：`@monaco-editor/react` 从 CDN 加载改为本地文件（构建时复制到 `public/monaco/vs/`），Tauri WebView 离线环境正常工作
- **Monarch Tokenizer 修复**：移除 `@operatorKeywords` 未定义引用，修复 `codelens-cpp` 语言注册崩溃
- **Sidecar 打包修复**：配置 `bundle.externalBin`，Tauri 自动将 Sidecar 打包到安装程序中，安装后开箱即用
- **Sidecar 窗口隐藏**：Windows 子进程添加 `CREATE_NO_WINDOW` 标志，消除符号跳转/引用查找时闪终端窗口
- **全局快捷键修复**：
  - Ctrl+K Ctrl+T 改用捕获阶段注册，绕过 Monaco chord 拦截
  - 补充 Ctrl+O 键盘事件处理
- **渲染性能优化**：
  - `cursorPos` 从 `useState` 改为 `useRef` + 直接 DOM 更新，光标移动零 re-render
  - `editorOptions` 用 `useMemo` 缓存
  - `CodeEditorView` 用 `React.memo` 包装
- 优化文档：`docs/OPTIMIZATION.md`（v1.0 → v2.0）
- 索引持久化说明更新：常驻进程内保持，进程重启后需重建

### 运行时优化 v0.7.0 ✅

**提交**：`feat/opt007-sidecar-persistent` 分支
**标签**：`v0.7.0`
**内容**：
- **Sidecar 常驻进程**（OPT-007）：
  - 全局 `Mutex<Option<SidecarProcess>>` 管理常驻进程
  - stdin/stdout 管道复用，请求 ID 自增机制
  - 懒启动 + 自动重启（`try_wait()` 检测进程存活）
  - `Drop` trait 优雅关闭（shutdown → kill）
  - 所有 `sidecar_*` 命令函数简化（移除 `find_sidecar_path` 调用）
- **语义高亮缓存**（OPT-008）：
  - 模块级 `Map<string, Decoration[]>` 缓存
  - 缓存 key：`filePath + contentLength + contentPrefix`
  - FIFO 淘汰（超过 200 个条目时清理最旧的一半）
- **跨文件引用查找修复**（OPT-009）：
  - `FileTree.loadProject()` 自动后台触发 `sidecar_index_project`
  - 索引在 Sidecar 进程生命周期内保持，跨文件引用查找和符号搜索立即可用
- **Ctrl+O 修复**（OPT-010）：
  - `FileTree.tsx` 新增 `useEffect` 监听 `codelens:open-project` 事件
  - 项目切换时重置展开状态和搜索状态
- 优化文档：`docs/OPTIMIZATION.md` 升级至 v2.0

### Bug 修复 v0.7.1 ✅

**提交**：`fix/f002-f004-navigation` 分支
**内容**：
- **符号大纲跳转修复**（BUG-001）：`handleEditorMount` 中添加 `window.__MONACO_EDITOR__ = editor`，修复符号大纲、搜索面板、引用面板跳转不生效
- **Go to Definition 修复**（BUG-002）：重写定义 Provider，同文件定义使用 `model.uri` 确保 URI 匹配，跨文件定义通过回调打开目标文件
- 优化文档：`docs/OPTIMIZATION.md` 升级至 v2.1

## JSON-RPC 方法清单

### 已实现

| 方法 | 阶段 | 描述 |
|------|------|------|
| `initialize` | 1 | 初始化握手，返回服务端能力 |
| `shutdown` | 1 | 关闭服务，释放资源 |
| `ping` | 1 | 心跳检测 |
| `parser/listLanguages` | 2 | 获取支持的语言列表 |
| `parser/parse` | 2 | 全量解析文件 |
| `parser/parseContent` | 2 | 解析内存中的字符串 |
| `parser/update` | 2 | 增量更新解析 |
| `parser/dispose` | 2 | 释放语法树缓存 |
| `textDocument/highlight` | 2 | 获取高亮数据（便捷接口） |
| `textDocument/definition` | 3 | 符号跳转（Go to Definition） |
| `textDocument/references` | 3 | 引用查找 |
| `symbol/index` | 3 | 构建项目符号索引 |
| `symbol/extract` | 3 | 提取单文件符号 |
| `textDocument/outline` | 4 | 文档符号大纲（嵌套树结构） |
| `symbol/search` | 4 | 项目符号搜索（前缀+子串匹配） |

## Git 工作流

采用 Git Flow 分支模型：
- `main`：发布分支，仅接受 release/hotfix 合入
- `develop`：开发集成分支
- `feat/*`：功能分支（短生命周期）
- `fix/*`：修复分支
- `release/*`：发布准备分支
- `hotfix/*`：紧急修复分支

## 许可证

MIT License
