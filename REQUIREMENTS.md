# CodeLens 代码阅读器 - 需求规格文档

## 文档信息

| 项目 | 信息 |
|------|------|
| 项目名称 | CodeLens 代码阅读器 |
| 文档版本 | v1.2 |
| 创建日期 | 2026-04-26 |
| 技术栈 | Tauri 2.0 + C++20 Sidecar + Tree-sitter C API + Monaco Editor + Next.js + SQLite |
| 开发周期 | 10 个工作日（80 人工时） |
| 目标用户 | C++ Windows 开发者 |

---

## 目录

1. [项目概述与目标](#1-项目概述与目标)
2. [功能需求](#2-功能需求)
3. [技术架构](#3-技术架构)
4. [核心模块设计](#4-核心模块设计)
5. [技术优化方案](#5-技术优化方案)
6. [UI-UX-设计方案](#6-uiux-设计方案)
7. [扩展方向](#7-扩展方向)
8. [代码规范](#8-代码规范)
9. [Git 工作流](#9-git-工作流)
10. [测试策略](#10-测试策略)
11. [时间规划](#11-时间规划)
12. [风险评估](#12-风险评估)
13. [附录](#13-附录)

---

## 1. 项目概述与目标

### 1.1 项目背景

C++ 开发者在 Windows 平台上缺乏轻量、高性能、支持语义理解的代码阅读工具。现有方案（如 Visual Studio、Source Insight、Sublime Text + 插件）存在以下痛点：

- Visual Studio：过于庞大，启动慢，资源占用高
- Source Insight：界面陈旧，不支持现代语言特性
- Sublime Text + 插件：配置复杂，语义分析能力弱

### 1.2 项目目标

CodeLens 旨在提供一个**轻量、快速、语义感知**的代码阅读器，核心目标：

1. **高性能**：基于 Tree-sitter C API 的增量解析，100 万行代码索引时间 < 5 秒
2. **语义理解**：符号跳转、引用查找、符号大纲等功能
3. **轻量级**：安装包 < 50MB，内存占用 < 500MB（百万行代码项目）
4. **现代化 UI**：基于 Monaco Editor + Next.js 的流畅用户体验

### 1.3 核心功能列表

| 功能 ID | 功能名称 | 优先级 | 描述 |
|---------|---------|--------|------|
| F-001 | 代码高亮 | P0 | 基于 Tree-sitter 的语法高亮 |
| F-002 | 符号跳转 | P0 | 点击符号跳转到定义 |
| F-003 | 引用查找 | P0 | 查找符号的所有引用 |
| F-004 | 符号大纲 | P1 | 当前文件的函数/类列表 |
| F-005 | 项目符号索引 | P1 | 全项目符号搜索 |
| F-006 | 文件树浏览器 | P0 | 项目文件结构浏览 |

---

## 2. 功能需求

### 2.1 F-001：代码高亮

**描述**：基于 Tree-sitter C API 实现精准的语法高亮。

**输入**：
- 用户在文件树中点击文件，或打开新文件

**处理流程**：
1. 前端发送文件内容到 C++ Sidecar
2. C++ Sidecar 调用 Tree-sitter C API 解析代码，生成语法树
3. 将语法树转换为高亮区间（highlight ranges）
4. 返回 JSON 格式的高亮数据到前端
5. Monaco Editor 根据高亮数据渲染代码

**输出**：
- Monaco Editor 中显示语法高亮的代码

**性能指标**：
- 1 万行文件：高亮延迟 < 100ms
- 10 万行文件：高亮延迟 < 500ms

**异常处理**：
- 文件编码错误：提示用户选择正确编码（UTF-8/GBK/GB2312）
- Tree-sitter 解析失败：降级为纯文本显示，不阻塞用户操作

---

### 2.2 F-002：符号跳转（Go to Definition）

**描述**：Ctrl+Click 或 F12 跳转到符号定义处。

**输入**：
- 用户光标位置（文件路径 + 行号 + 列号）

**处理流程**：
1. 前端将光标位置发送给 C++ Sidecar
2. C++ Sidecar 查询符号表，找到定义位置
3. 返回定义所在的文件路径 + 行号 + 列号
4. 前端跳转到目标位置并高亮

**输出**：
- 跳转到定义处，并高亮目标符号

**性能指标**：
- 跳转响应时间 < 200ms

**异常处理**：
- 找不到定义：提示"未找到定义"
- 多定义（如函数重载）：弹出选择列表

---

### 2.3 F-003：引用查找（Find All References）

**描述**：查找符号在所有文件中的引用位置。

**输入**：
- 用户光标位置（文件路径 + 行号 + 列号）

**处理流程**：
1. 前端将光标位置发送给 C++ Sidecar
2. C++ Sidecar 扫描项目所有文件，查找引用
3. 返回引用列表（文件路径 + 行号 + 列号 + 上下文代码）
4. 前端显示引用列表，点击可跳转

**输出**：
- 引用列表面板，显示所有引用位置

**性能指标**：
- 百万行代码项目：引用查找 < 2 秒

**异常处理**：
- 找不到引用：提示"未找到引用"
- 项目未索引：提示用户先建立索引

---

### 2.4 F-004：符号大纲（Document Outline）

**描述**：显示当前文件的函数、类、结构体等符号列表。

**输入**：
- 当前打开的文件路径

**处理流程**：
1. 前端请求当前文件的符号大纲
2. C++ Sidecar 解析当前文件，提取符号信息
3. 返回符号列表（名称 + 类型 + 行号）
4. 前端在侧边栏显示符号大纲，点击可跳转

**输出**：
- 侧边栏显示当前文件的符号大纲

**性能指标**：
- 生成大纲延迟 < 100ms

---

### 2.5 F-005：项目符号索引（Workspace Symbol Search）

**描述**：搜索项目中所有符号（函数、类、变量等）。

**输入**：
- 用户输入的搜索关键词

**处理流程**：
1. 用户输入搜索关键词（触发条件：输入 ≥ 2 个字符）
2. 前端发送搜索请求到 C++ Sidecar
3. C++ Sidecar 查询符号索引，返回匹配的符号列表
4. 前端显示搜索结果，支持模糊匹配和高亮

**输出**：
- 搜索结果列表，显示符号名称、类型、所属文件

**性能指标**：
- 搜索响应时间 < 300ms

---

### 2.6 F-006：文件树浏览器

**描述**：显示项目的文件结构，支持展开/折叠、搜索、右键菜单。

**输入**：
- 用户打开项目文件夹

**处理流程**：
1. 用户选择项目文件夹
2. 前端递归读取文件夹结构，生成文件树
3. 过滤掉无需显示的文件（如 .git、node_modules）
4. 前端显示文件树，支持点击打开文件

**输出**：
- 侧边栏显示项目文件树

**性能指标**：
- 加载 1000 个文件的项目：< 500ms

**异常处理**：
- 文件夹读取失败：提示权限错误
- 符号链接：可选择跟随或忽略

---

## 3. 技术架构

### 3.1 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                       前端 (Next.js)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Monaco    │  │ 文件树   │  │ 符号大纲 │  │ 搜索框   │  │
│  │ Editor    │  │ 浏览器   │  │ 面板     │  │          │  │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│        │              │              │              │        │
│        └──────────────┴──────────────┴──────────────┘        │
│                             │                               │
│                    Tauri IPC (前端 ↔ 后端)                   │
└─────────────────────────────┼───────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────┐
│ 后端 (Tauri 2.0 + C++ Sidecar)                             │
│                             │                               │
│  ┌──────────────────────────▼──────────────────────────┐   │
│  │           C++ Sidecar (Tree-sitter C API)           │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│  │  │ 语法解析 │  │ 符号提取 │  │ 引用分析 │         │   │
│  │  └──────────┘  └──────────┘  └──────────┘         │   │
│  └────────────────────────────────────────────────────┘   │
│                             │                               │
│  ┌──────────────────────────▼──────────────────────────┐   │
│  │           SQLite 数据库 (符号索引存储)                │   │
│  └────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

### 3.2 技术栈详解

| 层级 | 技术选型 | 版本 | 用途 |
|------|---------|------|------|
| 前端框架 | Next.js | 14+ | React 生态，支持 SSR/SSG |
| 代码编辑器 | Monaco Editor | 1.85+ | VS Code 同款编辑器内核 |
| 桌面壳 | Tauri 2.0 | 2.0 | 轻量级桌面应用框架 |
| 后端核心 | C++ Sidecar | C++20 | 高性能代码解析 |
| 解析引擎 | Tree-sitter C API | 0.20+ | 增量语法解析 |
| 数据存储 | SQLite | 3.45+ | 符号索引存储 |

### 3.3 通信协议

**协议**：JSON-RPC 2.0 over Stdio/IPC

**消息格式**：
```json
{
  "jsonrpc": "2.0",
  "method": "textDocument/definition",
  "params": {
    "uri": "file:///path/to/file.cpp",
    "position": { "line": 10, "character": 5 }
  },
  "id": 1
}
```

**响应格式**：
```json
{
  "jsonrpc": "2.0",
  "result": {
    "uri": "file:///path/to/header.h",
    "range": {
      "start": { "line": 5, "character": 0 },
      "end": { "line": 5, "character": 20 }
    }
  },
  "id": 1
}
```

---

## 4. 核心模块设计

### 4.1 模块划分

```
CodeLens/
├── src-tauri/               # Tauri 后端（Rust）
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs         # 应用入口
│   │   ├── sidebar.rs     # 侧边栏管理
│   │   └── commands.rs    # Tauri 命令定义
│   └── capabilities/       # 权限配置
│
├── sidecar/                 # C++ Sidecar
│   ├── CMakeLists.txt
│   ├── include/
│   │   ├── parser.h       # Tree-sitter 解析接口
│   │   ├── symbol.h       # 符号提取接口
│   │   └── indexer.h      # 符号索引接口
│   └── src/
│       ├── parser.cpp
│       ├── symbol.cpp
│       └── indexer.cpp
│
├── frontend/                # Next.js 前端
│   ├── package.json
│   ├── pages/
│   │   ├── index.tsx      # 主界面
│   │   └── _app.tsx       # 应用入口
│   ├── components/
│   │   ├── Editor.tsx     # Monaco Editor 组件
│   │   ├── FileTree.tsx   # 文件树组件
│   │   └── SymbolOutline.tsx # 符号大纲组件
│   └── styles/
│       └── globals.css
│
└── data/                    # SQLite 数据库
    └── symbols.db
```

### 4.2 C++ Sidecar 接口设计

> **设计原则**：Sidecar 作为独立进程运行，通过 JSON-RPC 2.0 与 Tauri 主进程通信。所有接口设计遵循"输入-处理-输出"三段式，便于独立测试和跨语言调用。

#### 4.2.1 解析接口（ParserService）

**职责**：封装 Tree-sitter C API，提供语法解析与高亮数据生成能力。

**核心数据结构**：

| 结构体 | 字段 | 说明 |
|--------|------|------|
| HighlightRange | start_line, start_col, end_line, end_col, scope | 高亮区间，scope 对应语法作用域（如 keyword、string、comment） |
| ParseResult | tree_handle, highlight_ranges, error_message | 解析结果，tree_handle 为内部语法树句柄 |

**接口方法**：

| 方法 | 输入 | 输出 | 说明 |
|------|------|------|------|
| parseFile | 文件路径 | ParseResult | 全量解析文件，构建语法树 |
| updateFile | 文件路径, 旧内容, 新内容 | ParseResult | 增量更新，仅重新解析变更区域 |
| getHighlightRanges | tree_handle | HighlightRange[] | 从语法树提取高亮区间 |
| disposeTree | tree_handle | void | 释放语法树资源 |

**伪代码**：

```
ParserService:
  parseFile(filepath):
    content ← readFile(filepath)
    tree ← ts_parse(content, language=cpp)
    ranges ← traverseTree(tree) → collectHighlightRanges
    return { tree_handle: tree.id, highlight_ranges: ranges }

  updateFile(filepath, old_content, new_content):
    edit ← computeEdit(old_content, new_content)    // 计算变更差异
    ts_tree_edit(existing_tree, edit)                // 增量更新语法树
    new_tree ← ts_parser_parse(parser, existing_tree) // 重新解析受影响区域
    ranges ← traverseTree(new_tree) → collectHighlightRanges
    return { tree_handle: new_tree.id, highlight_ranges: ranges }
```

#### 4.2.2 符号提取接口（SymbolService）

**职责**：从语法树中提取符号信息，支持定义查找与引用分析。

**核心数据结构**：

| 结构体 | 字段 | 说明 |
|--------|------|------|
| SymbolKind | 枚举：Function, Class, Struct, Variable, Enum, EnumMember | 符号类型分类 |
| Symbol | name, kind, file_path, start_line/col, end_line/col | 符号完整描述 |
| DefinitionResult | symbol, candidates[] | 定义查找结果，candidates 用于多定义场景（如函数重载） |

**接口方法**：

| 方法 | 输入 | 输出 | 说明 |
|------|------|------|------|
| extractSymbols | 文件路径 | Symbol[] | 从文件语法树提取所有符号 |
| findDefinition | 文件路径, 行号, 列号 | DefinitionResult | 根据光标位置查找符号定义 |
| findReferences | 符号名称 | Symbol[] | 在项目范围内查找符号的所有引用 |
| resolveOverloads | 符号名称, 参数类型列表 | Symbol | 根据上下文消解函数重载 |

**伪代码**：

```
SymbolService:
  extractSymbols(filepath):
    tree ← parserService.getTree(filepath)
    symbols ← []
    for node in tree.traverse():
      if node.type in [function_definition, class_specifier, struct_specifier, ...]:
        symbols.append(extractSymbolInfo(node))
    return symbols

  findDefinition(filepath, line, col):
    node ← tree.getNodeAt(filepath, line, col)
    symbol_name ← node.text
    // 优先在当前文件查找，再扩展到项目索引
    definition ← symbolTable.lookup(symbol_name)
    if definition.count > 1:
      return { symbol: null, candidates: definition }   // 多定义，返回候选列表
    return { symbol: definition[0], candidates: [] }

  findReferences(symbol_name):
    definition ← symbolTable.lookup(symbol_name)
    references ← []
    for file in project_files:
      tree ← parserService.getTree(file)
      for node in tree.traverse():
        if node.text == symbol_name and node is reference:
          references.append(buildReferenceInfo(node))
    return references
```

#### 4.2.3 索引接口（IndexService）

**职责**：管理项目级符号索引，支持持久化存储与快速检索。

**核心数据结构**：

| 结构体 | 字段 | 说明 |
|--------|------|------|
| IndexEntry | symbol, file_path, line, col, updated_at | 索引条目，含时间戳用于增量更新 |
| SearchResult | entries[], total_count, has_more | 搜索结果，支持分页 |

**接口方法**：

| 方法 | 输入 | 输出 | 说明 |
|------|------|------|------|
| buildIndex | 项目路径 | void | 全量构建项目符号索引 |
| buildIndexParallel | 项目路径, 线程数 | void | 多线程并行构建索引 |
| searchSymbols | 搜索关键词, 最大结果数 | SearchResult | 模糊匹配搜索符号 |
| saveToDatabase | 数据库路径 | void | 将索引持久化到 SQLite |
| loadFromDatabase | 数据库路径 | bool | 从 SQLite 加载已有索引 |
| invalidateFile | 文件路径 | void | 文件变更时使该文件的索引条目失效 |

**伪代码**：

```
IndexService:
  buildIndex(project_path):
    files ← scanSourceFiles(project_path, extensions=[.cpp, .h, .hpp, .c])
    for file in files:
      symbols ← symbolService.extractSymbols(file)
      symbolTable.upsertAll(symbols)

  buildIndexParallel(project_path, thread_count):
    files ← scanSourceFiles(project_path)
    queue ← ConcurrentQueue(files)
    workers ← spawn(thread_count, worker: 
      while file ← queue.pop():
        symbols ← symbolService.extractSymbols(file)
        symbolTable.upsertAll(symbols)    // 需线程安全
    )
    workers.joinAll()

  searchSymbols(query, limit):
    results ← symbolTable.fuzzyMatch(query)
    return results.sorted(by=relevance).take(limit)

  saveToDatabase(db_path):
    db ← SQLite.open(db_path)
    db.execute("CREATE TABLE IF NOT EXISTS symbols (name, kind, file_path, start_line, start_col)")
    db.beginTransaction()
    for entry in symbolTable:
      db.execute("INSERT INTO symbols VALUES (...)", entry)
    db.commit()

  loadFromDatabase(db_path):
    db ← SQLite.open(db_path)
    rows ← db.query("SELECT * FROM symbols")
    for row in rows:
      symbolTable.insert(deserialize(row))
```

### 4.3 前端组件设计

> **设计原则**：前端组件基于 React 函数式组件 + Hooks 模式，通过 Tauri IPC 与后端通信。组件间状态管理采用 React Context + useReducer 方案，避免引入过重的状态管理库。

#### 4.3.1 Monaco Editor 组件（CodeEditorView）

**职责**：封装 Monaco Editor 实例，管理编辑器生命周期、光标事件、高亮渲染。

**组件接口设计**：

| 属性（Props） | 类型 | 说明 |
|---------------|------|------|
| filePath | string | 当前打开的文件路径 |
| content | string | 文件内容 |
| language | string | 语言标识（如 "cpp"、"rust"） |
| onCursorMove | (line, col) => void | 光标移动回调，用于触发符号跳转/引用查找 |
| onSelectionChange | (range) => void | 选区变更回调，用于上下文菜单 |

**内部状态（State）**：

| 状态 | 类型 | 说明 |
|------|------|------|
| editorInstance | IStandaloneCodeEditor | Monaco 编辑器实例引用 |
| highlightDecorations | string[] | 当前高亮装饰器 ID 列表，用于增量更新 |
| isLoading | boolean | 文件加载状态 |

**生命周期管理**：

| 阶段 | 操作 |
|------|------|
| 挂载 | 创建 Monaco 实例 → 注册语言配置 → 绑定光标监听 → 请求高亮数据 |
| 更新 | filePath 变更时重新加载文件；content 变更时触发增量解析 |
| 卸载 | 释放 Monaco 实例，清理装饰器和事件监听 |

**伪代码**：

```
CodeEditorView(filePath, content, language, onCursorMove):
  editor ← useRef(null)

  onMount(container):
    editor ← monaco.create(container, { value: content, language, theme: "vs-dark" })
    editor.onCursorPositionChanged → onCursorMove(line, col)
    requestHighlight(filePath)

  onUpdate(filePath, content):
    if filePath changed:
      editor.setValue(content)
      requestHighlight(filePath)
    if content changed:
      sendToSidecar("textDocument/didChange", { filePath, content })

  requestHighlight(filePath):
    ranges ← sendToSidecar("textDocument/highlight", { filePath })
    editor.setDecorations(ranges)

  onUnmount():
    editor.dispose()
```

#### 4.3.2 文件树组件（FileTreeView）

**职责**：展示项目文件目录结构，支持展开/折叠、搜索过滤、右键菜单。

**组件接口设计**：

| 属性（Props） | 类型 | 说明 |
|---------------|------|------|------|
| projectPath | string | 项目根目录路径 |
| onFileSelect | (filePath) => void | 文件点击回调 |
| excludePatterns | string[] | 排除的目录/文件模式（如 ".git", "node_modules"） |

**内部状态（State）**：

| 状态 | 类型 | 说明 |
|------|------|------|
| treeData | FileNode[] | 文件树数据 |
| expandedKeys | string[] | 当前展开的目录节点 |
| searchTerm | string | 搜索关键词（实时过滤） |
| isLoading | boolean | 目录加载状态 |

**数据模型**：

| 结构 | 字段 | 说明 |
|------|------|------|
| FileNode | key, title, children, isLeaf, icon | 树节点，key 为文件绝对路径 |

**交互流程**：

| 操作 | 触发 | 行为 |
|------|------|------|
| 点击文件 | onFileSelect | 通知父组件打开文件 |
| 点击目录 | onExpand | 异步加载子目录（懒加载） |
| 搜索 | onSearch | 客户端过滤匹配的文件名 |
| 右键 | onContextMenu | 显示上下文菜单（复制路径、在终端打开等） |

**伪代码**：

```
FileTreeView(projectPath, onFileSelect, excludePatterns):
  treeData ← useState([])
  expandedKeys ← useState([])

  loadProject(dirPath):
    entries ← tauriIPC.invoke("read_dir", { path: dirPath, exclude: excludePatterns })
    treeData ← buildTree(entries)

  onExpand(dirPath):
    if not loaded(dirPath):
      children ← tauriIPC.invoke("read_dir", { path: dirPath })
      updateTreeNode(dirPath, children)
    expandedKeys.add(dirPath)

  onSearch(term):
    if term.length >= 2:
      filtered ← treeData.filter(node → node.title.matches(term))
      renderFilteredTree(filtered)

  onFileSelect(filePath):
    onFileSelect(filePath)    // 通知父组件打开文件
```

#### 4.3.3 符号大纲组件（SymbolOutlineView）

**职责**：展示当前文件的符号列表（函数、类、结构体等），支持点击跳转。

**组件接口设计**：

| 属性（Props） | 类型 | 说明 |
|---------------|------|------|------|
| filePath | string | 当前文件路径 |
| onSymbolSelect | (symbol) => void | 符号点击回调 |

**数据模型**：

| 结构 | 字段 | 说明 |
|------|------|------|
| OutlineNode | name, kind, line, col, children | 大纲节点，支持嵌套（如类包含成员函数） |

**伪代码**：

```
SymbolOutlineView(filePath, onSymbolSelect):
  outline ← useState([])

  onFilePathChanged(filePath):
    symbols ← tauriIPC.invoke("textDocument/outline", { filePath })
    outline ← buildOutlineTree(symbols)    // 根据行号构建嵌套关系

  onSymbolClick(symbol):
    onSymbolSelect(symbol)    // 通知 Editor 跳转到对应行
```

---

## 5. 技术优化方案

> **设计原则**：优化方案以架构设计说明为主，不涉及具体实现代码。每个优化点从"问题 → 方案 → 关键设计 → 预期效果"四个维度展开。

### 5.1 增量解析优化

**问题**：每次文件修改都重新解析整个文件，导致大文件编辑时高亮更新延迟明显。对于 1 万行以上的文件，全量解析耗时可能超过 200ms，严重影响编辑体验。

**方案设计**：

利用 Tree-sitter 的增量解析能力，仅重新解析文件中受修改影响的区域。核心思路是：将文件修改抽象为"编辑操作"（TSInputEdit），通知 Tree-sitter 旧语法树中哪些区域发生了变化，Tree-sitter 会自动复用未受影响区域的子树，只对受影响区域重新解析。

**关键设计要点**：

1. **编辑差异计算**：对比文件修改前后的内容，生成编辑操作描述（包含旧文本的起止位置和新文本的起止位置）。需要处理行级和字符级两种粒度的差异。

2. **语法树更新**：将编辑操作应用到已有的语法树上（ts_tree_edit），使旧语法树与新内容对齐。此时语法树中受影响区域的节点会被标记为"已失效"。

3. **重新解析**：使用已编辑的语法树作为参考，调用解析器重新解析。Tree-sitter 会复用所有未失效的子树，仅对失效区域重新解析。

4. **编辑器集成**：在 Monaco Editor 的 `onDidChangeModelContent` 事件中捕获增量变更，将变更转化为编辑操作，发送到 C++ Sidecar 处理。需注意 Monaco 的变更事件与 Tree-sitter 编辑操作之间的坐标映射。

**数据流**：

```
用户编辑 → Monaco onChange 事件 → 计算增量差异 → 生成编辑操作描述
    → IPC 传输到 Sidecar → 应用编辑到旧语法树 → 增量重新解析
    → 返回更新后的高亮区间 → Monaco 更新装饰器
```

**预期效果**：文件修改后高亮更新延迟 < 50ms，不受文件总行数影响。

---

### 5.2 符号索引持久化

**问题**：每次启动应用都重新扫描项目所有文件建立符号索引，导致大型项目（10 万行以上）的启动等待时间过长（可达数十秒），影响用户体验。

**方案设计**：

将符号索引持久化到 SQLite 数据库，下次启动时直接从数据库加载索引。引入"文件变更检测"机制，仅对自上次索引以来发生变更的文件进行增量更新。

**关键设计要点**：

1. **数据库 Schema 设计**：

   | 表名 | 字段 | 索引 | 说明 |
   |------|------|------|------|
   | symbols | name, kind, file_path, start_line, start_col | name(模糊), file_path | 符号主表 |
   | files | path, last_modified, hash, indexed_at | path(唯一) | 文件索引状态 |
   | references | symbol_id, ref_file_path, ref_line, ref_col | symbol_id | 引用关系表 |

2. **增量更新机制**：启动时对比文件的 `last_modified` 时间戳和内容哈希值。仅对变更文件重新解析并更新索引，未变更文件直接从数据库加载。

3. **事务一致性**：索引更新操作使用 SQLite 事务包裹。对于单个文件的索引更新：先删除该文件的所有旧符号条目，再插入新符号条目，确保原子性。

4. **数据库文件位置**：存储在项目根目录的 `.codelens/` 隐藏目录下，与项目绑定，支持多项目独立索引。数据库文件约 1-5MB/10 万行代码。

**启动流程**：

```
应用启动 → 检查 .codelens/symbols.db 是否存在
    → 若存在：加载数据库 → 扫描文件变更 → 增量更新变更文件
    → 若不存在：全量扫描项目 → 构建索引 → 写入数据库
```

**预期效果**：二次启动后，符号搜索响应时间 < 100ms；10 万行项目的索引加载时间 < 1 秒。

---

### 5.3 多线程并行解析

**问题**：单线程解析大型项目（百万行级别）时，索引构建耗时可达数十秒甚至数分钟，期间应用无法提供符号跳转和引用查找功能。

**方案设计**：

利用 C++20 的 `std::jthread` 实现生产者-消费者模式的多线程解析。文件列表作为任务队列，多个工作线程从队列中取文件并行解析，解析结果通过线程安全的数据结构汇总。

**关键设计要点**：

1. **线程模型**：采用线程池 + 任务队列模型。线程数量默认取 `std::thread::hardware_concurrency()`（通常为 CPU 逻辑核心数），用户可在设置中调整。

2. **任务队列**：使用线程安全的阻塞队列（`ConcurrentQueue`）。主线程将文件列表推入队列，工作线程从队列中取出文件进行解析。队列为空时工作线程阻塞等待。

3. **结果汇总**：每个工作线程解析完一个文件后，将符号列表通过线程安全的合并接口写入共享的符号表。符号表内部使用读写锁（`std::shared_mutex`）：读操作可并行，写操作串行化。

4. **进度反馈**：主线程定期检查队列中的剩余任务数，通过 IPC 将进度百分比推送到前端，显示在状态栏或进度条中。

5. **取消机制**：支持用户中途取消索引构建。通过 `std::jthread` 的协作式取消（`request_stop()`），工作线程在每次循环迭代开始时检查取消标志，若已取消则提前退出。

**架构图**：

```
主线程 → 将文件列表推入 ConcurrentQueue
              ↓
    ┌─────────┼─────────┐
    ↓         ↓         ↓
 Worker-1  Worker-2  Worker-N
    ↓         ↓         ↓
 parseFile parseFile parseFile
    ↓         ↓         ↓
    └────→ SymbolTable ←────┘
           (读写锁保护)
              ↓
         IPC 进度反馈 → 前端状态栏
```

**预期效果**：8 核 CPU 上，索引速度相比单线程提升约 5-6 倍（考虑线程同步开销和 I/O 瓶颈）。

---

### 5.4 内存优化

**问题**：大型项目的符号索引和语法树缓存可能占用数 GB 内存，超出轻量级工具的定位目标（< 500MB）。

**方案设计**：

从三个维度降低内存占用：减少字符串拷贝、限制缓存大小、延迟加载。

**关键设计要点**：

1. **字符串视图优化**：
   - 在 C++ Sidecar 内部，使用 `std::string_view` 替代 `std::string` 传递文件名和符号名称。文件内容通过内存映射（`mmap`）加载，`string_view` 直接引用映射区域，避免拷贝。
   - 仅在需要跨模块传递或持久化存储时，才将 `string_view` 转换为 `std::string`。

2. **LRU 缓存淘汰**：
   - 对已解析的语法树实施 LRU（Least Recently Used）淘汰策略。设定缓存上限（默认 50 个文件），当缓存满时淘汰最久未访问的语法树。
   - LRU 缓存内部使用双向链表 + 哈希表实现，保证 O(1) 的查找和淘汰操作。
   - 缓存命中率监控：记录命中/未命中次数，当命中率低于阈值时提示用户增加缓存大小。

3. **延迟加载**：
   - 符号大纲和引用列表不在启动时预加载，而是在用户首次访问时按需加载。
   - 文件内容采用分段加载策略：对于超大文件（> 10 万行），仅加载当前视口附近的行，滚动时动态加载前后内容。

4. **内存监控**：
   - 在状态栏显示当前内存占用。
   - 当内存占用超过阈值（默认 400MB）时，自动触发 LRU 淘汰和垃圾回收。

**各策略预期效果**：

| 优化策略 | 预期节省 | 适用场景 |
|----------|----------|----------|
| string_view 替代 string | ~15% | 所有文件路径和符号名称传递 |
| LRU 缓存淘汰 | ~25% | 同时打开大量文件的场景 |
| 延迟加载 | ~20% | 启动时和低频功能使用场景 |

综合预期效果：内存占用降低约 40%，大型项目（百万行）稳定在 300-500MB 范围内。

---

## 6. UI/UX 设计方案

### 6.1 界面布局

```
┌──────────────────────────────────────────────────────────┐
│  菜单栏：文件(F) 编辑(E) 查看(V) 转到(G) 帮助(H)          │
├──────────┬───────────────────────────────────┬────────────┤
│          │                                   │            │
│  文件树  │        Monaco Editor              │  符号大纲  │
│  浏览器  │        (代码编辑区)                │  面板      │
│          │                                   │            │
│  📁 src  │   1  #include <iostream>          │  📄 main() │
│    📄 main│   2  int main() {                │  📄 foo()  │
│    📄 foo │   3    std::cout << "Hello";     │            │
│          │   4    return 0;                  │            │
│          │   5  }                            │            │
│          │                                   │            │
├──────────┴───────────────────────────────────┴────────────┤
│  状态栏：行 3, 列 15  │  C++  │  UTF-8  │  LF  │  ⏱ 50ms │
└──────────────────────────────────────────────────────────┘
```

### 6.2 主题设计

**深色主题（默认）**：
- 背景色：`#1e1e1e`（VS Code 深色）
- 侧边栏：`#252526`
- 活动选项卡：`#2d2d30`
- 字体：Consolas, 'Courier New', monospace

**浅色主题**：
- 背景色：`#ffffff`
- 侧边栏：`#f3f3f3`
- 活动选项卡：`#ffffff`
- 字体：Consolas, 'Courier New', monospace

### 6.3 快捷键设计

| 功能 | 快捷键 | 备注 |
|------|--------|------|
| 打开文件 | Ctrl+O | 系统文件选择器 |
| 保存文件 | Ctrl+S | 保存当前文件 |
| 符号跳转 | F12 或 Ctrl+Click | 跳转到定义 |
| 查找引用 | Shift+F12 | 显示引用列表 |
| 符号搜索 | Ctrl+T | 搜索项目符号 |
| 命令面板 | Ctrl+Shift+P | VS Code 风格 |
| 切换主题 | Ctrl+K Ctrl+T | 选择主题 |

### 6.4 动画与过渡

- 文件树展开/折叠：200ms ease-in-out
- 符号大纲滚动：平滑滚动（CSS `scroll-behavior: smooth`）
- 主题切换：300ms 渐变过渡

---

## 7. 扩展方向

### 7.1 语言支持扩展

**当前支持**：C/C++（通过 Tree-sitter-cpp 语法库）

**计划支持**：

| 语言 | Tree-sitter 语法库 | 优先级 | 说明 |
|------|-------------------|--------|------|
| Rust | tree-sitter-rust | P1 | 系统编程语言，与 C++ 用户群高度重叠 |
| Python | tree-sitter-python | P1 | 最流行的脚本语言，覆盖面广 |
| Go | tree-sitter-go | P2 | 云原生领域主力语言 |
| JavaScript/TypeScript | tree-sitter-typescript | P2 | Web 开发核心语言 |

**扩展方案设计**：

语言扩展采用"语法库注册"模式。每种语言对应一个 Tree-sitter 语法库（`.so`/`.dll` 动态库），应用启动时扫描已注册的语法库，根据文件扩展名自动匹配解析器。

**关键设计**：

1. **语言注册表**：维护一个"文件扩展名 → 语法库"的映射表。应用内置 C/C++ 映射，其他语言通过插件机制注册。

2. **解析器工厂**：根据文件扩展名从注册表中查找对应的语法库，动态创建 Tree-sitter 解析器实例。若文件扩展名未注册，降级为纯文本模式。

3. **高亮规则映射**：每种语言的语法作用域（scope）到 Monaco Editor 令牌类型的映射关系，需要为每种语言单独定义。建议采用 TextMate 语法规则标准，复用 VS Code 的主题生态。

**伪代码**：

```
LanguageRegistry:
  register(extension, grammar_library, scope_mapping):
    registry[extension] = { grammar: grammar_library, scopes: scope_mapping }

ParserFactory:
  createParser(filepath):
    ext ← getFileExtension(filepath)
    entry ← LanguageRegistry.lookup(ext)
    if entry not found:
      return PlainTextParser()
    parser ← TreeSitterParser(entry.grammar)
    return parser
```

---

### 7.2 插件系统

**目标**：允许第三方开发者编写插件，扩展 CodeLens 功能（如新的语言支持、自定义代码分析规则、UI 扩展面板等）。

**方案设计**：

基于 Tauri Plugin 系统构建。插件以 NPM 包形式分发，遵循统一的插件接口规范。每个插件可注册自定义的 Tauri 命令、前端面板和事件处理器。

**关键设计**：

1. **插件接口规范**：

   | 接口方法 | 说明 | 示例 |
   |----------|------|------|
   | onActivate(context) | 插件激活时的初始化逻辑 | 注册命令、创建面板 |
   | onDeactivate() | 插件停用时的清理逻辑 | 释放资源、取消监听 |
   | registerCommands() | 注册自定义命令 | "myPlugin.analyze" |
   | registerPanels() | 注册自定义面板 | 侧边栏"代码质量"面板 |

2. **插件沙箱**：插件运行在受限环境中，仅能访问声明过的 API（如文件系统、编辑器、符号索引）。未经声明的 API 调用将被拦截。

3. **插件市场**：远期规划建立插件市场，支持插件的搜索、安装、更新、卸载。插件元数据包括：名称、版本、作者、描述、权限声明。

4. **生命周期管理**：插件可配置为"启动时激活"或"按需激活"（如仅当打开特定类型文件时才激活）。支持插件的启用/禁用切换，无需重启应用。

**伪代码**：

```
PluginManager:
  loadPlugin(plugin_path):
    manifest ← readManifest(plugin_path)    // 读取 plugin.json
    verifyPermissions(manifest.permissions)  // 校验权限声明
    sandbox ← createSandbox(manifest.permissions)
    plugin ← loadModule(plugin_path, sandbox)
    plugin.onActivate(context)
    registered ← plugin.registerCommands() + plugin.registerPanels()
    return PluginHandle(id, plugin, registered)

  unloadPlugin(handle):
    handle.plugin.onDeactivate()
    unregister(handle.registered)
    releaseSandbox(handle.sandbox)
```

---

### 7.3 AI 辅助功能

**目标**：集成大语言模型（LLM），提供 AI 辅助代码理解能力，降低阅读陌生代码库的门槛。

**功能规划**：

| 功能 | 触发方式 | 说明 |
|------|----------|------|
| 代码解释 | 选中代码 → 右键"解释代码" | AI 生成选中代码的自然语言解释 |
| 符号文档生成 | 光标悬停 → "生成文档" | AI 根据函数实现生成注释/文档 |
| 重构建议 | 右键 → "重构建议" | AI 分析代码并提供重构方案 |
| 代码问答 | 侧边栏聊天面板 | 自然语言提问，AI 结合项目上下文回答 |

**方案设计**：

1. **LLM 后端抽象**：定义统一的 LLM 后端接口，支持多种 LLM 提供商。用户可在设置中选择提供商和模型。

   | 提供商 | 模型示例 | 调用方式 |
   |--------|----------|----------|
   | Moonshot (Kimi) | moonshot-v1-8k / 32k | HTTPS REST API |
   | OpenAI | gpt-4 / gpt-4-turbo | HTTPS REST API |
   | 本地模型 | Qwen / DeepSeek | 本地推理服务 |

2. **上下文构建**：AI 请求中附加项目上下文信息，提升回答质量。

   | 上下文类型 | 内容 | 大小控制 |
   |-----------|------|----------|
   | 当前文件 | 用户选中的代码 + 前后各 50 行 | 按模型上下文窗口截断 |
   | 符号定义 | 选中代码中引用的符号定义 | 最多附加 5 个定义 |
   | 项目结构 | 目录树概览 | 仅前 2 层 |

3. **流式响应**：LLM 响应采用 Server-Sent Events (SSE) 流式传输，前端实时显示生成内容，避免长时间等待。

4. **隐私保护**：代码内容仅在用户主动触发 AI 功能时发送，不会在后台静默上传。用户可在设置中关闭 AI 功能或配置代码过滤规则（如排除含敏感信息的文件）。

**伪代码**：

```
AIService:
  explainCode(code_selection, context):
    // 1. 构造多模态/增强上下文的提示词
    prompt ← buildPrompt(
      instruction: "解释以下代码的功能和逻辑",
      code: code_selection,
      definitions: context.referenced_symbols,
      project_structure: context.dir_tree
    )
    
    // 2. 调用 LLM 服务并流式返回结果
    response ← llmBackend.chat(prompt, stream=true)
    return response

  buildPrompt(instruction, code, definitions, project_structure):
    messages ← []
    
    // 注入系统人格设定
    messages.add(role="system", content="你是代码分析助手...")
    
    // 组合上下文模版
    userText ← format("""
      项目结构：{project_structure}
      涉及定义：{definitions}
      请执行任务：{instruction}
      代码片段：{code}
    """)
    
    messages.add(role="user", content=userText)
    return messages
```
---

## 8. 代码规范

### 8.1 C++ 代码规范

**命名规范**：

| 元素 | 风格 | 示例 |
|------|------|------|
| 类名 | PascalCase | `TreeSitterParser` |
| 函数名 | camelCase | `parseFile` |
| 成员变量 | snake_case + 后缀下划线 | `file_path_` |
| 局部变量 | snake_case | `file_path` |
| 常量 | kPascalCase | `kMaxFileSize` |
| 枚举值 | PascalCase | `SymbolKind::Function` |
| 命名空间 | snake_case | `codelens::parser` |
| 头文件保护 | PascalCase + H | `CODELENS_PARSER_H_` |

**代码格式**：

| 规则 | 设定 |
|------|------|
| 缩进 | 4 空格，不使用 Tab |
| 大括号风格 | K&R 风格（函数定义换行，控制语句不换行） |
| 行宽 | ≤ 120 字符 |
| 头文件包含顺序 | 对应头文件 → C 系统头文件 → C++ 系统头文件 → 第三方库 → 项目内头文件 |
| 前向声明 | 优先使用前向声明减少头文件依赖 |

**内存管理**：

| 规则 | 说明 |
|------|------|
| 智能指针 | 优先使用 `std::unique_ptr`，共享所有权时使用 `std::shared_ptr` |
| 禁止裸 new/delete | 除非在智能指针构造内部 |
| RAII | 资源获取即初始化，析构函数负责释放 |
| 引用传递 | 非空参数使用引用，可空参数使用指针 |

---

### 8.2 TypeScript / React 代码规范

**命名规范**：

| 元素 | 风格 | 示例 |
|------|------|------|
| 组件名 | PascalCase | `FileTree` |
| 函数名 | camelCase | `loadProject` |
| 常量 | UPPER_SNAKE_CASE | `API_BASE_URL` |
| 类型/接口 | PascalCase | `EditorProps` |
| 事件处理器 | handle + 事件名 | `handleFileSelect` |
| 自定义 Hook | use + 功能名 | `useSymbolSearch` |

**代码格式**：

| 规则 | 设定 |
|------|------|
| 缩进 | 2 空格 |
| 分号 | 使用分号 |
| 引号 | 单引号（字符串内含单引号时使用双引号） |
| 组件结构 | Props 类型定义 → 组件函数 → Hooks → 事件处理 → 渲染逻辑 |
| 导出方式 | 优先命名导出，避免默认导出 |

**React 规范**：

| 规则 | 说明 |
|------|------|
| 函数组件 | 优先使用函数式组件 + Hooks，不使用 class 组件 |
| 状态管理 | 局部状态用 useState，跨组件状态用 Context + useReducer |
| 副作用 | 使用 useEffect，依赖数组必须完整 |
| 性能优化 | 对昂贵计算使用 useMemo，对回调函数使用 useCallback |
| 组件拆分 | 单个组件不超过 200 行，超过时拆分为子组件 |

---

### 8.3 Git 操作规范

> **设计原则**：Git 操作规范覆盖提交、合并、变基、冲突解决、标签等全流程操作，确保团队协作时代码历史的可追溯性和一致性。

#### 8.3.1 提交规范

遵循 Conventional Commits 规范：

**提交格式**：`<type>(<scope>): <subject>`

**类型（type）**：

| 类型 | 说明 | 示例 |
|------|------|------|
| feat | 新功能 | `feat(parser): 添加 Rust 语言支持` |
| fix | Bug 修复 | `fix(highlight): 修复中文注释高亮错误` |
| refactor | 重构（不改变功能） | `refactor(sidecar): 拆分解析服务` |
| docs | 文档更新 | `docs(api): 更新 JSON-RPC 接口文档` |
| test | 测试相关 | `test(parser): 添加增量解析测试用例` |
| chore | 构建/工具相关 | `chore(cmake): 升级 Tree-sitter 到 0.22` |
| perf | 性能优化 | `perf(indexer): 多线程索引构建` |

**提交粒度要求**：

| 规则 | 说明 |
|------|------|
| 原子提交 | 每个提交只做一件事，可独立回滚 |
| 提交前检查 | 提交前必须通过编译和单元测试 |
| 禁止提交半成品 | 不得提交编译失败或功能不完整的代码到共享分支 |
| 修复压缩 | 同一功能的多次修复提交应在合并前交互式变基压缩为有意义的提交 |

#### 8.3.2 合并与变基规范

| 场景 | 推荐操作 | 说明 |
|------|----------|------|
| 功能分支合入 develop | `merge --no-ff` | 保留分支拓扑，便于追溯功能开发历史 |
| 功能分支同步 develop 最新 | `rebase` | 保持线性历史，避免无意义的合并提交 |
| 紧急修复合入 main | `merge --no-ff` + cherry-pick 到 develop | 同时更新发布线和开发线 |
| 压缩功能分支上的修复提交 | `rebase -i` | 合并"修复修复的修复"类提交为有意义的原子提交 |

**安全规则**：

| 规则 | 说明 |
|------|------|
| 禁止强制推送共享分支 | 不得对 main、develop 执行 `push --force` |
| 个人功能分支允许强制推送 | 使用 `push --force-with-lease` 安全变基后推送 |
| 合并前必须通过 CI | 功能分支所有检查通过后方可合并 |
| 合并前必须 Code Review | 至少 1 人审查通过 |

#### 8.3.3 冲突解决规范

| 规则 | 说明 |
|------|------|
| 变基优先 | 功能分支与 develop 冲突时，优先在功能分支上变基解决 |
| 冲突标记禁止入库 | 解决冲突后必须验证无残留冲突标记（`<<<<<<<`、`=======`、`>>>>>>>`） |
| 冲突解决后验证 | 冲突解决后必须运行完整测试套件，确认无回归 |
| 复杂冲突协商 | 涉及架构性变更的冲突，需与原作者协商解决 |

#### 8.3.4 标签与版本规范

| 标签类型 | 格式 | 示例 | 说明 |
|----------|------|------|------|
| 正式发布 | `v<MAJOR>.<MINOR>.<PATCH>` | `v1.0.0` | 遵循语义化版本 |
| 预发布 | `v<MAJOR>.<MINOR>.<PATCH>-<rc|beta>.<N>` | `v1.0.0-rc.1` | 候选版本/测试版本 |

**打标签流程**：

1. develop 测试通过 → 合入 main
2. 在 main 上打版本标签（附注标签，包含版本说明）
3. 推送标签到远程仓库

---

## 9. Git 工作流

> **模块目标**：在项目开发周期中，通过规范化的 Git 工作流，避免版本迭代造成的代码丢失、第三方库引入导致的冲突，以及多人协作时的代码覆盖问题。本模块定义了分支策略、依赖隔离、版本保护和工作树运用等关键工程实践。

### 9.1 分支策略

**策略选型**：采用 **Git Flow** 分支模型，适用于有明确版本发布节奏的桌面应用项目。

**分支拓扑**：

```
main     ──●──────────────────────●──────────●──  (仅发布版本，始终可部署)
           \                      /            \
release   ──●──────────────────●              (发布准备分支)
            \                  /
develop  ────●───●───●───●───●───●───●───●──  (开发集成分支)
                  \       /         \      /
feat/              ●───●●           ●────●●   (短生命周期功能分支)
                                      
hotfix  ───────────────────────────────●──  (紧急修复分支)
```

**分支定义与职责**：

| 分支 | 生命期 | 来源 | 合入目标 | 保护规则 |
|------|--------|------|----------|----------|
| main | 永久 | — | — | 禁止直接推送；仅接受 release/hotfix 合入；必须打版本标签 |
| develop | 永久 | main | release | 禁止强制推送；合入需 CI 通过 |
| feat/* | 短（1-3 天） | develop | develop | 命名规范：`feat/<功能ID>-<简述>` |
| fix/* | 短（<1 天） | develop | develop | 命名规范：`fix/<问题描述>` |
| release/* | 中（1-2 天） | develop | main + develop | 命名规范：`release/v<版本号>` |
| hotfix/* | 短（<1 天） | main | main + develop | 命名规范：`hotfix/v<版本号>-<问题描述>` |

**功能分支生命周期**：

```
1. 从 develop 创建分支
   git checkout -b feat/f002-symbol-jump origin/develop

2. 在分支上开发（原子提交）
   git add <files>
   git commit -m "feat(parser): 实现符号跳转查询接口"

3. 定期同步 develop（变基）
   git fetch origin
   git rebase origin/develop

4. 开发完成后，交互式变基整理提交
   git rebase -i origin/develop    // 压缩修复提交，重写提交消息

5. 安全强制推送到远程分支
   git push --force-with-lease origin feat/f002-symbol-jump

6. 创建 Pull Request → Code Review → CI 通过 → 合入 develop
   git checkout develop
   git merge --no-ff feat/f002-symbol-jump
   git branch -d feat/f002-symbol-jump
   git push origin --delete feat/f002-symbol-jump
```

### 9.2 第三方依赖隔离

**问题**：引入第三方库（如 Tree-sitter 语法库、SQLite、Monaco Editor 等）时，直接修改源码或版本不锁定会导致：版本升级时冲突、依赖变更不可追溯、团队成员环境不一致。

**方案设计**：采用"子模块/包管理 + 锁定文件 + 隔离层"三级隔离策略。

#### 9.2.1 C++ 依赖管理

| 依赖 | 引入方式 | 版本锁定 | 升级策略 |
|------|----------|----------|----------|
| Tree-sitter C API | CMake FetchContent | CMakeLists.txt 中锁定 commit hash | 主版本升级创建专门分支测试 |
| SQLite | CMake FetchContent | 同上 | 同上 |
| Google Test | CMake FetchContent | 同上 | 按需升级 |

**关键设计**：

1. **版本锁定**：所有 C++ 依赖在 CMakeLists.txt 中通过 `GIT_TAG` 或 `URL_HASH` 锁定到明确的版本号或 commit hash，禁止使用 `latest` 或无版本标签的引用。

2. **依赖隔离层**：在 C++ Sidecar 中为每个第三方库定义薄封装层（Wrapper），业务代码仅依赖封装层接口，不直接引用第三方库头文件。当第三方库升级或替换时，仅需修改封装层实现。

3. **升级分支**：第三方库的主版本升级（如 Tree-sitter 0.20 → 0.22）在专门的 `chore/deps-<库名>-<版本>` 分支上进行，完成测试验证后方可合入 develop。

**伪代码**：

```
// CMakeLists.txt 依赖锁定
FetchContent_Declare(
  tree-sitter
  GIT_REPOSITORY https://github.com/tree-sitter/tree-sitter.git
  GIT_TAG        v0.20.8       // 锁定到明确版本标签
  GIT_SHALLOW    TRUE          // 浅克隆，减少下载时间
)

// 依赖隔离层
class TreeSitterWrapper:       // 封装 Tree-sitter C API
  parse(content, language) → ParseResult
  edit(tree, changes) → ParseResult

class SQLiteWrapper:           // 封装 SQLite C API
  open(db_path) → Connection
  execute(sql, params) → Result
  close()
```

#### 9.2.2 前端依赖管理

| 依赖 | 引入方式 | 版本锁定 | 升级策略 |
|------|----------|----------|----------|
| Monaco Editor | npm | package-lock.json 锁定 | 主版本升级创建专门分支测试 |
| Next.js | npm | 同上 | 同上 |
| React | npm | 同上 | 同上 |

**关键设计**：

1. **锁定文件**：`package-lock.json` 必须纳入版本控制。禁止在未更新锁定文件的情况下修改 `package.json` 中的依赖版本。

2. **审计提交**：每次 `npm install` 新依赖时，必须在提交信息中说明引入原因和版本选择依据。例如：`chore(deps): 引入 monaco-editor@1.85.0，用于代码编辑器核心组件`。

3. **安全审计**：定期运行 `npm audit` 检查已知漏洞。高危漏洞必须在下一个迭代周期内修复。

### 9.3 版本保护机制

**问题**：开发过程中可能因误操作（如强制推送、误删分支、覆盖提交）导致代码丢失，或因功能迭代导致某个版本的可用状态无法回溯。

**方案设计**：通过分支保护规则、引用日志追踪和定期备份三层机制保护代码安全。

#### 9.3.1 分支保护规则

| 规则 | 适用分支 | 说明 |
|------|----------|------|
| 禁止直接推送 | main, develop | 所有变更必须通过 Pull Request/Merge Request 合入 |
| 必须通过 CI | main, develop | 合入前所有自动化检查必须通过 |
| 必须 Code Review | main, develop | 至少 1 人审查通过方可合入 |
| 禁止强制推送 | main, develop | 不得使用 `push --force`，个人分支允许 `--force-with-lease` |
| 禁止删除 | main, develop | 远程分支不可删除 |
| 线性历史 | main | 合入时采用 squash merge 或 rebase merge，保持 main 线性 |

#### 9.3.2 代码恢复机制

| 场景 | 恢复方式 | 说明 |
|------|----------|------|
| 误删分支 | `git reflog` + `git checkout -b <branch> <sha>` | 引用日志保留 90 天，可找回所有本地操作 |
| 误提交到 main | `git revert <commit>` | 禁止 reset，使用 revert 创建反向提交，保留历史 |
| 功能分支丢失 | 远程分支保护 + 本地 reflog | 功能分支推送后即使误删远程分支，仍可从本地 reflog 恢复 |
| 大范围误操作 | `git fsck --lost-found` | 查找悬挂的 commit 对象 |

**伪代码**：

```
// 恢复误删分支的流程
reflog_output ← git reflog --all    // 查看所有引用日志
deleted_sha ← findInReflog(reflog_output, branch_name)
git checkout -b <branch_name> <deleted_sha>    // 从引用日志恢复分支
git push origin <branch_name>                  // 重新推送

// 回退误提交（禁止 reset，使用 revert）
git revert <commit_sha>    // 创建反向提交，保留完整历史
git push origin main       // 安全推送
```

#### 9.3.3 里程碑快照

每个里程碑（M1-M4）达成时，在 main 上打附注标签并推送到远程：

| 快照 | 标签 | 内容 |
|------|------|------|
| M1：MVP 可用 | `v0.1.0-alpha` | 可打开 C++ 文件并高亮 |
| M2：核心功能完整 | `v0.2.0-alpha` | 符号跳转和引用查找可用 |
| M3：功能完整 | `v0.3.0-beta` | 所有 P0 功能完成 |
| M4：可发布 | `v1.0.0` | 测试通过，正式发布 |

### 9.4 工作树并行开发

**问题**：开发过程中常需要同时处理多个任务（如正在开发新功能时需要紧急修复 Bug），频繁切换分支会导致工作区状态丢失或 stash 管理混乱。

**方案设计**：使用 Git Worktree 实现多工作区并行开发，每个工作树对应一个分支，无需 stash 或 clone 多份仓库。

**关键设计**：

1. **工作树布局**：在项目根目录的 `../codelens-worktrees/` 目录下为每个并行任务创建独立工作树。

   | 工作树路径 | 分支 | 用途 |
   |------------|------|------|
   | `./` (主工作树) | develop | 主开发工作区 |
   | `../codelens-worktrees/feat-f002/` | feat/f002-symbol-jump | 符号跳转功能开发 |
   | `../codelens-worktrees/fix-highlight/` | fix/highlight-encoding | 高亮编码 Bug 修复 |

2. **工作流**：

```
   // 创建功能分支的工作树
   git worktree add ../codelens-worktrees/feat-f002 -b feat/f002-symbol-jump origin/develop

   // 在工作树中开发（独立工作区，互不干扰）
   cd ../codelens-worktrees/feat-f002
   // ... 开发、提交、推送 ...

   // 开发完成后移除工作树
   git worktree remove ../codelens-worktrees/feat-f002
```

3. **约束规则**：

   | 规则 | 说明 |
   |------|------|
   | 同一分支不重复检出 | 同一分支只能在一个工作树中检出，避免索引冲突 |
   | 工作树及时清理 | 功能分支合入后立即移除对应工作树 |
   | 构建目录隔离 | 每个工作树有独立的 build/ 目录，不共享编译产物 |

### 9.5 二分查找与问题定位

**问题**：当代码出现回归 Bug（之前正常的功能突然失效）时，需要快速定位引入问题的提交。

**方案设计**：使用 `git bisect` 进行自动化二分查找，结合测试脚本快速定位问题提交。

**流程**：

   ```
1. 标记问题状态
   git bisect start
   git bisect bad HEAD              // 当前版本有问题
   git bisect good v0.2.0-alpha     // 这个版本没问题

2. 自动化二分查找（配合测试脚本）
   git bisect run <test_script.sh>  // 脚本返回 0=good, 1=bad, 125=skip

3. 定位到问题提交后，结束查找
   git bisect reset
   ```

**测试脚本设计**：为关键功能编写可脚本化的验证命令，用于 bisect 自动化：

| 功能 | 验证脚本逻辑 | 返回值 |
|------|-------------|--------|
| C++ 编译 | `cmake --build build/` | 0=成功, 1=失败 |
| 单元测试 | `ctest --test-dir build/` | 0=通过, 1=失败 |
| 符号跳转 | 启动 Sidecar → 发送跳转请求 → 检查返回结果 | 0=正确, 1=错误 |

---

## 10. 测试策略

### 10.1 单元测试

**C++ 单元测试**：

- **框架选型**：Google Test（gtest）
- **运行方式**：CMake 集成，`ctest` 命令执行
- **覆盖率工具**：gcov / lcov

**测试范围与用例设计**：

| 模块 | 测试重点 | 典型测试场景 |
|------|----------|-------------|
| ParserService | 解析正确性、增量更新、异常输入 | 有效 C++ 文件解析 → 返回非空结果；不存在文件 → 返回错误；文件修改 → 增量更新后高亮与全量解析一致 |
| SymbolService | 符号提取完整性、定义查找准确性 | 含函数/类/变量的文件 → 提取数量正确；函数重载 → 返回多定义候选；无定义符号 → 返回"未找到" |
| IndexService | 索引构建、搜索、持久化 | 项目索引 → 符号数与手动统计一致；模糊搜索 → 匹配结果按相关性排序；索引保存/加载 → 数据一致 |

**伪代码**：

```
// ParserService 测试
test "parseValidCppFile":
  parser ← ParserService()
  result ← parser.parseFile("test_data/hello.cpp")
  assert(result.highlight_ranges.length > 0)

test "parseNonExistentFile":
  parser ← ParserService()
  result ← parser.parseFile("test_data/not_exist.cpp")
  assert(result.error_message != null)

test "incrementalUpdateConsistentWithFullParse":
  parser ← ParserService()
  full_result ← parser.parseFile(filepath)
  old_content ← readFile(filepath)
  new_content ← old_content + "// added comment\n"
  incr_result ← parser.updateFile(filepath, old_content, new_content)
  assert(incr_result.highlight_ranges ≈ full_result.highlight_ranges)  // 差异仅限新增行
```

**TypeScript 单元测试**：

- **框架选型**：Jest + React Testing Library
- **运行方式**：`npm test`，CI 中自动执行

**测试范围与用例设计**：

| 组件 | 测试重点 | 典型测试场景 |
|------|----------|-------------|
| CodeEditorView | 渲染、光标事件、高亮更新 | 组件挂载 → Monaco 实例创建成功；光标移动 → onCursorMove 回调触发 |
| FileTreeView | 渲染、交互、搜索过滤 | 项目加载 → 文件列表显示；搜索输入 → 结果过滤；点击文件 → onFileSelect 回调触发 |
| SymbolOutlineView | 渲染、符号跳转 | 文件切换 → 大纲更新；点击符号 → onSymbolSelect 回调触发 |

---

### 10.2 集成测试

**测试环境**：Tauri 内置的 WebDriver 支持（`tauri-driver`）

**端到端测试场景**：

| 场景 | 操作步骤 | 预期结果 |
|------|----------|----------|
| 打开项目 | 选择项目目录 → 等待文件树加载 | 文件树显示正确的目录结构 |
| 打开文件 | 点击文件树中的 .cpp 文件 | Monaco Editor 显示文件内容，语法高亮生效 |
| 符号跳转 | 光标放置在函数调用处 → 按 F12 | 编辑器跳转到函数定义处，目标符号高亮 |
| 引用查找 | 光标放置在函数定义处 → 按 Shift+F12 | 引用面板显示所有引用位置，点击可跳转 |
| 符号搜索 | 按 Ctrl+T → 输入关键词 | 搜索结果列表显示匹配符号，包含名称、类型、文件路径 |
| 增量高亮 | 编辑文件内容 → 等待高亮更新 | 修改区域的高亮在 50ms 内更新，未修改区域保持不变 |

**伪代码**：

```
integration_test "openFileAndJumpToDefinition":
  app ← launchTauriApp()
  app.openProject("test_project/")
  app.clickFile("src/main.cpp")
  assert(app.editorContent.contains("#include"))

  app.placeCursor(line=10, col=5)        // 光标放在函数调用上
  app.pressKey("F12")                     // 触发跳转
  assert(app.currentFile == "src/utils.h") // 跳转到头文件
  assert(app.cursorLine == 15)             // 定位到定义行

integration_test "findReferences":
  app ← launchTauriApp()
  app.openProject("test_project/")
  app.openFile("src/utils.h")
  app.placeCursor(line=15, col=6)         // 光标放在函数定义上
  app.pressKey("Shift+F12")                // 触发引用查找
  assert(app.referencePanel.count >= 2)    // 至少 2 处引用
  app.clickReference(index=0)              // 点击第一个引用
  assert(app.currentFile != "src/utils.h") // 跳转到其他文件
```

---

### 10.3 性能测试

**基准指标**：

| 指标 | 目标值 | 测试条件 |
|------|--------|----------|
| 文件解析（1 万行） | < 100ms | 冷启动，无缓存 |
| 文件解析（10 万行） | < 500ms | 冷启动，无缓存 |
| 增量高亮更新 | < 50ms | 修改单行后 |
| 符号跳转响应 | < 200ms | 索引已构建 |
| 引用查找（百万行项目） | < 2 秒 | 索引已构建 |
| 项目索引构建（10 万行） | < 10 秒 | 8 核 CPU，SSD |
| 项目索引构建（百万行） | < 60 秒 | 8 核 CPU，SSD |
| 应用启动时间 | < 3 秒 | 含索引加载 |
| 内存占用（百万行项目） | < 500MB | LRU 缓存 50 文件 |

**测试工具**：

| 工具 | 用途 | 说明 |
|------|------|------|
| Google Benchmark | C++ 性能基准 | 微基准测试，统计平均/中位/P99 延迟 |
| benchmark.js | 前端性能基准 | 测量组件渲染时间和交互响应延迟 |
| 自定义脚本 | 端到端性能测试 | 使用不同规模的项目（1K/10K/100K/1M 行）测试全链路性能 |
| Windows Performance Analyzer | 内存/性能分析 | 分析内存泄漏和 CPU 热点 |

**性能回归策略**：

- 每次提交自动运行性能基准测试，与基线对比
- 性能回归超过 10% 时自动标记并通知开发者
- 每周生成性能趋势报告，追踪长期性能变化

---

## 11. 时间规划

### 11.1 开发周期

**总工时**：80 小时（10 个工作日）

### 11.2 详细排期

| 阶段 | 时间 | 任务 | 交付物 | Git 工作流节点 |
|------|------|------|--------|----------------|
| **阶段 1：项目搭建** | 第 1 天 | • 初始化 Tauri 2.0 项目<br>• 搭建 Next.js 前端框架<br>• 配置 C++ Sidecar 编译环境 | 可运行的空壳应用 | • 初始化 Git 仓库，创建 main/develop 分支<br>• 配置 .gitignore（build/、node_modules/、.codelens/）<br>• 配置分支保护规则<br>• 提交项目脚手架 `chore(init): 初始化项目结构` |
| **阶段 2：核心解析** | 第 2-3 天 | • 集成 Tree-sitter C API<br>• 实现 C++ 语法解析<br>• 实现代码高亮接口 | 能够高亮显示 C++ 代码 | • 创建 `feat/f001-highlight` 分支<br>• C++ 依赖通过 CMake FetchContent 引入并锁定版本<br>• 依赖引入提交 `chore(deps): 引入 tree-sitter@v0.20.8`<br>• 里程碑 M1 后打标签 `v0.1.0-alpha` |
| **阶段 3：符号提取** | 第 4-5 天 | • 实现符号提取逻辑<br>• 实现符号跳转（Go to Definition）<br>• 实现引用查找（Find All References） | 能够跳转和查找引用 | • 创建 `feat/f002-symbol-jump` 和 `feat/f003-references` 分支<br>• 可使用 Git Worktree 并行开发<br>• 合入前交互式变基整理提交<br>• 里程碑 M2 后打标签 `v0.2.0-alpha` |
| **阶段 4：索引与搜索** | 第 6 天 | • 实现 SQLite 符号索引<br>• 实现项目符号搜索<br>• 实现符号大纲面板 | 能够搜索和查看大纲 | • 创建 `feat/f005-symbol-index` 分支<br>• 引入 SQLite 依赖并锁定版本<br>• 数据库文件（.codelens/）加入 .gitignore |
| **阶段 5：UI 完善** | 第 7 天 | • 实现文件树浏览器<br>• 完善界面布局<br>• 实现主题切换 | 完整的 UI 界面 | • 创建 `feat/f006-file-tree` 分支<br>• 里程碑 M3 后打标签 `v0.3.0-beta`<br>• 创建 `release/v1.0.0` 分支进入发布准备 |
| **阶段 6：测试与优化** | 第 8-9 天 | • 编写单元测试<br>• 性能优化（增量解析、缓存）<br>• Bug 修复 | 测试报告、性能报告 | • Bug 修复在 `fix/*` 分支进行<br>• 配置 `git bisect` 测试脚本用于问题定位<br>• 紧急修复使用 `hotfix/*` 分支 |
| **阶段 7：文档与发布** | 第 10 天 | • 编写用户手册<br>• 打包发布<br>• 编写开发者文档 | 安装包、文档 | • release 分支测试通过后合入 main<br>• 在 main 上打正式标签 `v1.0.0`<br>• 同步合入 develop<br>• 推送标签到远程仓库 |

### 11.3 里程碑

| 里程碑 | 时间 | 验收标准 | Git 标签 |
|--------|------|----------|----------|
| M1：MVP 可用 | 第 3 天 | 能够打开 C++ 文件并高亮显示 | `v0.1.0-alpha` |
| M2：核心功能完整 | 第 5 天 | 能够跳转定义、查找引用 | `v0.2.0-alpha` |
| M3：功能完整 | 第 7 天 | 所有 P0 功能实现完成 | `v0.3.0-beta` |
| M4：可发布 | 第 10 天 | 测试通过，打包发布 | `v1.0.0` |

---

## 12. 风险评估

### 12.1 技术风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| Tree-sitter C API 复杂，学习曲线陡峭 | 高 | 中 | 提前 1 周学习 Tree-sitter，准备 Demo |
| C++ Sidecar 与 Tauri 通信不稳定 | 高 | 低 | 使用 JSON-RPC 标准协议，添加错误处理 |
| 大项目性能不达预期 | 中 | 中 | 提前进行性能测试，准备优化方案（多线程、缓存） |
| Monaco Editor 集成复杂 | 中 | 低 | 参考 VS Code 的 Monaco 集成方案 |
| 第三方库版本升级引入兼容性问题 | 中 | 中 | 依赖版本锁定 + 隔离层设计 + 升级分支验证 |
| Git 误操作导致代码丢失 | 中 | 低 | 分支保护规则 + reflog 恢复机制 + 里程碑标签快照 |

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| Tree-sitter C API 复杂，学习曲线陡峭 | 高 | 中 | 提前 1 周学习 Tree-sitter，准备 Demo |
| C++ Sidecar 与 Tauri 通信不稳定 | 高 | 低 | 使用 JSON-RPC 标准协议，添加错误处理 |
| 大项目性能不达预期 | 中 | 中 | 提前进行性能测试，准备优化方案（多线程、缓存） |
| Monaco Editor 集成复杂 | 中 | 低 | 参考 VS Code 的 Monaco 集成方案 |

### 12.2 进度风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| 需求变更频繁 | 高 | 中 | 锁定需求，阶段 1 确认后不再接受大变更 |
| 开发者对 Tauri 2.0 不熟悉 | 中 | 高 | 提前学习 Tauri 2.0，准备 Demo |
| 测试时间不足 | 中 | 中 | 每日构建 + 自动化测试，减少手动测试时间 |

### 12.3 资源风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| 开发机器性能不足（编译慢） | 低 | 低 | 使用高性能开发机，启用增量编译 |
| 依赖库下载慢（CMake、Tree-sitter） | 低 | 中 | 提前下载依赖，使用镜像源 |

---

## 13. 附录

### 13.1 参考资料

- **Tauri 2.0 官方文档**：https://v2.tauri.app/
- **Tree-sitter 官方文档**：https://tree-sitter.github.io/tree-sitter/
- **Monaco Editor 官方文档**：https://microsoft.github.io/monaco-editor/
- **Next.js 官方文档**：https://nextjs.org/docs
- **JSON-RPC 2.0 规范**：https://www.jsonrpc.org/specification

### 13.2 相关工具

| 工具 | 用途 | 链接 |
|------|------|------|
| Visual Studio Code | 参考其 Monaco Editor 集成 | https://code.visualstudio.com/ |
| Source Insight | 参考其符号跳转和引用查找 | https://www.sourceinsight.com/ |
| Sourcetrail | 开源代码浏览器（已停止维护） | https://github.com/CoatiSoftware/Sourcetrail |

### 13.3 术语表

| 术语 | 解释 |
|------|------|
| Tree-sitter | 一个增量解析库，支持多种编程语言 |
| Sidecar | Tauri 的侧边车模式，允许启动外部可执行文件作为后端 |
| Symbol | 符号，指代码中的函数、类、变量等 |
| Reference | 引用，指符号被使用的地方 |
| Definition | 定义，指符号被声明的地方 |
| IPC | Inter-Process Communication，进程间通信 |
| Git Flow | 一种 Git 分支管理模型，包含 main/develop/feature/release/hotfix 五类分支 |
| Worktree | Git 工作树，允许在同一仓库下检出多个分支到不同目录 |
| Reflog | 引用日志，记录所有 HEAD 和分支引用的变更历史，用于恢复误操作 |
| Conventional Commits | 约定式提交规范，统一提交消息格式 |
| Semantic Versioning | 语义化版本规范，格式为 MAJOR.MINOR.PATCH |
| Force-with-lease | 安全的强制推送选项，在远程分支被他人更新时拒绝推送 |

### 13.4 版本历史

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| v1.2 | 2026-04-26 | 新增 §9 Git 工作流模块（分支策略、依赖隔离、版本保护、工作树、二分查找）；扩展 §8.3 为 Git 操作规范（提交/合并/变基/冲突/标签）；时间规划加入 Git 工作流节点 | CodeLens Team |
| v1.1 | 2026-04-26 | 需求文档改造：移除所有具体实现代码，改为接口设计说明+伪代码；扩展接口设计和技术优化方案的设计深度 | CodeLens Team |
| v1.0 | 2026-04-26 | 初始版本，完成 12 章节需求规格 | CodeLens Team |

---

**文档结束**

*本文档是 CodeLens 代码阅读器的需求规格说明，涵盖功能需求、技术架构、模块设计、UI/UX 方案、测试策略等内容。*
