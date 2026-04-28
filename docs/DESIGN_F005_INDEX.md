# F-005 项目符号索引（Workspace Symbol Search）设计文档

> 阶段4 - 索引与搜索
> 创建日期：2026-04-28

## 1. 功能描述

为当前项目构建全量符号索引，支持跨文件搜索函数、类、结构体、变量等符号。用户输入关键词后实时返回匹配结果，点击可跳转到定义位置。

**功能 ID**：F-005
**优先级**：P1
**性能指标**：
- 全量索引构建：100 万行代码 < 5 秒
- 搜索响应时间：< 300ms
- 触发条件：输入 ≥ 2 个字符

## 2. 技术方案

### 2.1 数据流

```
用户打开项目文件夹
  → 前端触发索引构建请求
  → Tauri IPC: sidecar_build_index(projectPath)
  → Sidecar: symbol/index JSON-RPC
  → IndexService.buildIndex(projectPath)
  → 扫描源文件 → Tree-sitter 解析 → 提取符号 → 写入 SQLite
  → 返回索引统计（文件数 + 符号数）

用户输入搜索关键词（≥ 2 字符）
  → 前端防抖 200ms
  → Tauri IPC: sidecar_search_symbols(query)
  → Sidecar: symbol/search JSON-RPC
  → IndexService.searchSymbols(query)
  → SQLite LIKE 查询 + 模糊匹配
  → 返回匹配结果列表
  → 前端渲染搜索结果
```

### 2.2 SQLite 数据库设计

**数据库文件位置**：`data/codelens_index.db`（项目根目录下）

**表结构**：

```sql
CREATE TABLE IF NOT EXISTS symbols (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,           -- 符号名称
    kind        TEXT NOT NULL,           -- 符号类型（Function/Class/Struct/...）
    file_path   TEXT NOT NULL,           -- 所在文件路径
    start_line  INTEGER NOT NULL,        -- 起始行号（0-based）
    start_col   INTEGER NOT NULL DEFAULT 0,  -- 起始列号（0-based）
    end_line    INTEGER NOT NULL,        -- 结束行号（0-based）
    qualified_name TEXT DEFAULT '',      -- 限定名（Namespace::Class::method）
    updated_at  TEXT NOT NULL            -- ISO 8601 更新时间
);

-- 搜索性能优化索引
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_symbols_qualified ON symbols(qualified_name);
```

### 2.3 SQLite 集成方案

**依赖选择**：使用 `sqlite3.h` + `sqlite3.c` amalgamation 源码直接编译

理由：
- 无需额外安装 SQLite 库，amalgamation 只需两个文件
- 编译时直接静态链接，避免运行时 DLL 依赖
- 版本可控（目标 SQLite 3.45+）

**CMake 集成**：
```cmake
# third_party/sqlite3/ 目录下放置 sqlite3.h + sqlite3.c
add_library(sqlite3 STATIC third_party/sqlite3/sqlite3.c)
target_include_directories(sqlite3 PUBLIC third_party/sqlite3)
target_compile_definitions(sqlite3 PRIVATE SQLITE_THREADSAFE=1 SQLITE_ENABLE_FTS5=0)
```

### 2.4 IndexService 实现策略

#### 2.4.1 全量索引构建

```
伪代码:
buildIndex(project_path):
  files ← scanSourceFiles(project_path, extensions=[.cpp, .h, .hpp, .c, .cc, .cxx])
  db ← SQLite.open(data/codelens_index.db)
  db.createTables()

  // 清除旧索引
  db.execute("DELETE FROM symbols")

  // 批量插入事务
  db.beginTransaction()
  total_symbols ← 0

  for file in files:
    symbols ← symbolService.extractSymbols(file)
    for sym in symbols:
      db.execute("INSERT INTO symbols (name, kind, file_path, start_line, start_col, end_line, qualified_name, updated_at) VALUES (...)",
                  sym.name, kindToString(sym.kind), sym.file_path, sym.start_line, sym.start_col, sym.end_line, sym.qualified_name, now)
      total_symbols++

  db.commit()
  return { success: true, fileCount: files.size(), symbolCount: total_symbols }
```

#### 2.4.2 模糊匹配搜索

搜索策略：前缀匹配 + 子串匹配，按相关度排序。

```
伪代码:
searchSymbols(query, limit=50):
  db ← SQLite.open(data/codelens_index.db)

  // 策略1：前缀匹配（最高优先级）
  results ← db.query(
    "SELECT name, kind, file_path, start_line, start_col, qualified_name FROM symbols WHERE name LIKE ? || '%' ORDER BY length(name) ASC LIMIT ?",
    query, limit
  )

  // 策略2：子串匹配（补充结果）
  if results.size < limit:
    remaining ← limit - results.size
    substring_results ← db.query(
      "SELECT name, kind, file_path, start_line, start_col, qualified_name FROM symbols WHERE name LIKE '%' || ? || '%' AND name NOT LIKE ? || '%' ORDER BY length(name) ASC LIMIT ?",
      query, query, remaining
    )
    results.append(substring_results)

  // 去重（按 name + file_path + start_line）
  results ← deduplicate(results)

  return { success: true, query: query, results: results, totalCount: results.size() }
```

#### 2.4.3 增量更新（文件级失效）

```
伪代码:
invalidateFile(filepath):
  db ← SQLite.open(data/codelens_index.db)
  db.execute("DELETE FROM symbols WHERE file_path = ?", filepath)

  // 重新索引该文件
  symbols ← symbolService.extractSymbols(filepath)
  db.beginTransaction()
  for sym in symbols:
    db.execute("INSERT INTO symbols VALUES (...)", sym)
  db.commit()
```

### 2.5 JSON-RPC 接口

#### 2.5.1 构建索引：`symbol/index`

**请求**：
```json
{
  "jsonrpc": "2.0",
  "method": "symbol/index",
  "params": {
    "projectPath": "/path/to/project"
  },
  "id": 1
}
```

**响应**：
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "projectPath": "/path/to/project",
    "fileCount": 42,
    "symbolCount": 385,
    "elapsedMs": 1200
  },
  "id": 1
}
```

#### 2.5.2 搜索符号：`symbol/search`（新增）

**请求**：
```json
{
  "jsonrpc": "2.0",
  "method": "symbol/search",
  "params": {
    "query": "parse",
    "limit": 50
  },
  "id": 2
}
```

**响应**：
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "query": "parse",
    "totalCount": 3,
    "results": [
      {
        "name": "parseFile",
        "kind": "Function",
        "filePath": "/src/parser.cpp",
        "line": 42,
        "col": 0,
        "qualifiedName": "codelens::parser::parseFile"
      },
      {
        "name": "ParseResult",
        "kind": "Struct",
        "filePath": "/include/parser.h",
        "line": 15,
        "col": 0,
        "qualifiedName": "codelens::parser::ParseResult"
      }
    ]
  },
  "id": 2
}
```

### 2.6 Tauri IPC 接口

| 命令 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `sidecar_build_index` | `{ projectPath: string }` | `{ success, fileCount, symbolCount, elapsedMs }` | 构建项目索引 |
| `sidecar_search_symbols` | `{ query: string, limit?: number }` | `{ success, query, totalCount, results[] }` | 搜索符号 |

### 2.7 前端搜索 UI 设计

**搜索入口**：顶部搜索栏（Ctrl+Shift+F 快捷键）

**搜索结果面板**：
- 列表形式展示匹配符号
- 每项显示：符号图标 + 名称 + 类型 + 文件名:行号
- 鼠标悬停显示完整限定名
- 点击跳转到定义位置
- 搜索中显示加载状态

**防抖策略**：200ms debounce，避免频繁查询

### 2.8 异常处理

| 场景 | 处理方式 |
|------|----------|
| 项目目录不存在 | 返回错误信息"目录不存在" |
| 无源代码文件 | 返回 `{ fileCount: 0, symbolCount: 0 }` |
| SQLite 打开失败 | 返回错误信息"索引数据库初始化失败" |
| 搜索关键词 < 2 字符 | 前端拦截，不发起请求 |
| 搜索无结果 | 返回 `{ totalCount: 0, results: [] }` |

## 3. 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `sidecar/third_party/sqlite3/` | 新增 | 放置 sqlite3.h + sqlite3.c |
| `sidecar/CMakeLists.txt` | 修改 | 添加 sqlite3 库定义 |
| `sidecar/include/indexer.h` | 修改 | 添加 SQLite 成员、重构接口 |
| `sidecar/src/indexer.cpp` | 重写 | 完整实现 SQLite 集成 + 搜索 |
| `sidecar/src/main.cpp` | 修改 | 新增 symbol/search 方法 |
| `src-tauri/src/lib.rs` | 修改 | 新增 sidecar_search_symbols 命令 |
| `frontend/components/SearchPanel.tsx` | 新增 | 符号搜索结果面板 |
| `frontend/pages/index.tsx` | 修改 | 集成搜索栏 + 搜索面板 |
| `frontend/styles/globals.css` | 修改 | 添加搜索相关样式 |

## 4. 实现顺序

1. 下载 SQLite amalgamation → 放入 `third_party/sqlite3/`
2. 修改 CMakeLists.txt → 添加 sqlite3 编译目标
3. 重写 `indexer.h` + `indexer.cpp` → SQLite 集成
4. 新增 `symbol/search` JSON-RPC 方法 → main.cpp
5. 新增 `sidecar_search_symbols` Tauri 命令 → lib.rs
6. 新增 `SearchPanel.tsx` 搜索面板组件
7. 修改 `index.tsx` 集成搜索栏与搜索面板
8. 添加 CSS 样式
9. 编译验证
